/**
 * MultipartParser - Stream-based multipart/form-data parser
 *
 * Zero Dependencies: Implements RFC 7578 (multipart/form-data) using only
 * native Node.js streams and buffers.
 *
 * State Machine:
 * PREAMBLE → HEADER → BODY → BOUNDARY → HEADER → BODY → ... → END
 *
 * Events:
 * - 'field': (name, value) - Regular form field
 * - 'file': (fileInfo, stream) - File upload with readable stream
 * - 'finish': () - All parts processed
 * - 'error': (err) - Parsing error
 * - 'limit': (type, limit) - Limit exceeded
 */

const { Writable, PassThrough } = require('stream');
const BoundaryScanner = require('../utils/BoundaryScanner');

// Parser states
const PARSER_STATE = {
  PREAMBLE: 0,      // Before first boundary
  HEADER: 1,        // Parsing part headers
  BODY: 2,          // Parsing part body
  END: 3            // After final boundary
};

// Default limits
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FIELDS = 100;
const DEFAULT_MAX_FIELD_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_FIELD_NAME_SIZE = 100;
const DEFAULT_MAX_HEADER_SIZE = 8192; // 8KB

class MultipartParser extends Writable {
  /**
   * @param {Object} options
   * @param {string} options.boundary - The multipart boundary
   * @param {Object} options.limits - Size limits
   * @param {number} options.limits.fileSize - Max file size in bytes
   * @param {number} options.limits.files - Max number of files
   * @param {number} options.limits.fields - Max number of fields
   * @param {number} options.limits.fieldSize - Max field value size
   * @param {number} options.limits.fieldNameSize - Max field name size
   */
  constructor(options = {}) {
    super();

    if (!options.boundary) {
      throw new Error('Boundary is required');
    }

    this.boundary = Buffer.from(options.boundary);
    this.limits = {
      fileSize: options.limits?.fileSize || DEFAULT_MAX_FILE_SIZE,
      files: options.limits?.files || DEFAULT_MAX_FILES,
      fields: options.limits?.fields || DEFAULT_MAX_FIELDS,
      fieldSize: options.limits?.fieldSize || DEFAULT_MAX_FIELD_SIZE,
      fieldNameSize: options.limits?.fieldNameSize || DEFAULT_MAX_FIELD_NAME_SIZE,
      headerSize: options.limits?.headerSize || DEFAULT_MAX_HEADER_SIZE
    };

    // Initialize boundary scanner
    this.scanner = new BoundaryScanner(this.boundary);

    // Parser state
    this.state = PARSER_STATE.PREAMBLE;
    this.headerBuffer = Buffer.alloc(0);
    this.currentPart = null;
    this.currentStream = null;

    // Counters for limits
    this.fileCount = 0;
    this.fieldCount = 0;
    this.bytesReceived = 0;

    // Track if we're finished
    this.finished = false;
  }

  /**
   * Writable stream _write implementation
   */
  _write(chunk, encoding, callback) {
    try {
      this.bytesReceived += chunk.length;
      this._processChunk(chunk);
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Writable stream _final implementation (called on stream end)
   */
  _final(callback) {
    try {
      // Flush any remaining data in scanner
      const remaining = this.scanner.flush();
      if (remaining.length > 0) {
        this._handleBodyData(remaining, true);
      }

      // Close current stream if any
      if (this.currentStream) {
        this.currentStream.end();
        this.currentStream = null;
      }

      this.finished = true;
      this.emit('finish');
      callback();
    } catch (err) {
      callback(err);
    }
  }

  /**
   * Process a chunk of data through the state machine
   * @param {Buffer} chunk
   */
  _processChunk(chunk) {
    const result = this.scanner.scan(chunk);

    // If no boundaries found in this chunk
    if (result.parts.length === 0) {
      if (result.emitData && result.emitData.length > 0) {
        this._handleBodyData(result.emitData);
      }
      this.scanner.carryover = result.carryover;
      return;
    }

    // Process each part separated by boundaries
    for (let i = 0; i < result.parts.length; i++) {
      const part = result.parts[i];

      // Emit data before boundary
      if (part.data.length > 0) {
        this._handleBodyData(part.data);
      }

      // Handle the boundary - use searchBuffer for correct indexing
      this._handleBoundary(result.searchBuffer, part.boundaryIndex);
    }

    this.scanner.carryover = result.carryover;
  }

  /**
   * Handle data in BODY state
   * @param {Buffer} data
   * @param {boolean} isLast - Is this the last chunk
   */
  _handleBodyData(data, isLast = false) {
    if (this.state === PARSER_STATE.BODY) {
      if (this.currentStream) {
        // File upload - write to stream
        // Strip trailing CRLF before boundary
        let writeData = data;
        if (data.length >= 2 && data[data.length - 2] === 0x0D && data[data.length - 1] === 0x0A) {
          writeData = data.slice(0, -2);
        }

        if (writeData.length > 0) {
          // Check file size limit
          if (this.currentPart.bytesReceived + writeData.length > this.limits.fileSize) {
            this.emit('limit', 'fileSize', this.limits.fileSize);
            this._abortCurrentStream(new Error(`File size limit exceeded: ${this.limits.fileSize} bytes`));
            return;
          }

          this.currentPart.bytesReceived += writeData.length;
          this.currentStream.write(writeData);
        }
      } else if (this.currentPart) {
        // Regular field - accumulate in buffer
        this.currentPart.value = Buffer.concat([this.currentPart.value, data]);

        if (this.currentPart.value.length > this.limits.fieldSize) {
          this.emit('limit', 'fieldSize', this.limits.fieldSize);
          throw new Error(`Field size limit exceeded: ${this.limits.fieldSize} bytes`);
        }
      }
    } else if (this.state === PARSER_STATE.HEADER) {
      // Accumulate header data
      this.headerBuffer = Buffer.concat([this.headerBuffer, data]);

      // Prevent DOS attack via unbounded header buffer
      if (this.headerBuffer.length > this.limits.headerSize) {
        this.emit('limit', 'headerSize', this.limits.headerSize);
        throw new Error(`Header size limit exceeded: ${this.limits.headerSize} bytes`);
      }
    }
  }

  /**
   * Handle boundary detection
   * @param {Buffer} searchBuffer - The buffer being searched (includes carryover)
   * @param {number} boundaryIndex - Position of boundary in searchBuffer
   */
  _handleBoundary(searchBuffer, boundaryIndex) {
    // Check if this is the final boundary (ends with --)
    const afterBoundary = boundaryIndex + this.scanner.boundaryLength;
    const isFinal = afterBoundary + 1 < searchBuffer.length &&
                    searchBuffer[afterBoundary] === 0x2D &&
                    searchBuffer[afterBoundary + 1] === 0x2D; // "--"

    if (isFinal) {
      // Final boundary - parse headers if we were collecting them
      if (this.state === PARSER_STATE.HEADER && this.headerBuffer.length > 0) {
        this._parseHeaders();
      }

      // Close current part and end
      if (this.currentStream) {
        this.currentStream.end();
        this.currentStream = null;
      } else if (this.currentPart) {
        this._emitField();
      }
      this.state = PARSER_STATE.END;
      return;
    }

    // Transition based on current state
    switch (this.state) {
      case PARSER_STATE.PREAMBLE:
        // First boundary found
        this.state = PARSER_STATE.HEADER;
        this.headerBuffer = Buffer.alloc(0);
        break;

      case PARSER_STATE.BODY:
        // End of current part
        if (this.currentStream) {
          this.currentStream.end();
          this.currentStream = null;
        } else if (this.currentPart) {
          this._emitField();
        }
        // Start parsing next part's headers
        this.state = PARSER_STATE.HEADER;
        this.headerBuffer = Buffer.alloc(0);
        break;

      case PARSER_STATE.HEADER:
        // We were collecting headers, now parse them
        this._parseHeaders();
        // Boundary found right after headers means part is complete
        // Close current part and prepare for next
        if (this.currentStream) {
          this.currentStream.end();
          this.currentStream = null;
        } else if (this.currentPart) {
          this._emitField();
        }
        // Next part's headers will start
        this.state = PARSER_STATE.HEADER;
        this.headerBuffer = Buffer.alloc(0);
        break;
    }
  }

  /**
   * Parse accumulated headers and start body processing
   */
  _parseHeaders() {
    // Headers are separated from body by double CRLF
    const headerEndIndex = this.headerBuffer.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
      // Headers not complete yet - wait for more data
      return;
    }

    const headerText = this.headerBuffer.slice(0, headerEndIndex).toString('utf8');
    const headers = this._parseHeaderLines(headerText);

    // Extract any body data that came after headers in the same buffer
    const bodyStart = headerEndIndex + 4; // Skip past \r\n\r\n
    const bodyData = this.headerBuffer.slice(bodyStart);

    // Extract Content-Disposition
    const contentDisposition = headers['content-disposition'];
    if (!contentDisposition) {
      throw new Error('Missing Content-Disposition header');
    }

    const { name, filename } = this._parseContentDisposition(contentDisposition);

    // Check field name size limit
    if (name.length > this.limits.fieldNameSize) {
      this.emit('limit', 'fieldNameSize', this.limits.fieldNameSize);
      throw new Error(`Field name too long: ${this.limits.fieldNameSize} chars`);
    }

    if (filename) {
      // This is a file upload
      if (this.fileCount >= this.limits.files) {
        this.emit('limit', 'files', this.limits.files);
        throw new Error(`Too many files: ${this.limits.files} max`);
      }

      this.fileCount++;
      this._startFileStream(name, filename, headers['content-type'] || 'application/octet-stream');
    } else {
      // This is a regular field
      if (this.fieldCount >= this.limits.fields) {
        this.emit('limit', 'fields', this.limits.fields);
        throw new Error(`Too many fields: ${this.limits.fields} max`);
      }

      this.fieldCount++;
      this.currentPart = {
        name,
        value: Buffer.alloc(0)
      };
    }

    // Clear header buffer
    this.headerBuffer = Buffer.alloc(0);

    // Process any body data that was in the header buffer
    // This happens when headers and body are in the same chunk
    if (bodyData.length > 0) {
      // Temporarily set state to BODY to handle body data
      const prevState = this.state;
      this.state = PARSER_STATE.BODY;
      this._handleBodyData(bodyData);
      // Note: state may be changed back in _handleBoundary
    }
  }

  /**
   * Parse header lines into key-value object
   * @param {string} headerText
   * @returns {Object}
   */
  _parseHeaderLines(headerText) {
    const headers = {};
    const lines = headerText.split('\r\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = value;
    }

    return headers;
  }

  /**
   * Parse Content-Disposition header
   * @param {string} value - Header value
   * @returns {Object} - { name, filename }
   */
  _parseContentDisposition(value) {
    const result = { name: null, filename: null };

    // Example: form-data; name="file"; filename="test.jpg"
    const parts = value.split(';').map(p => p.trim());

    for (const part of parts) {
      if (part.startsWith('name=')) {
        result.name = this._unquote(part.slice(5));
      } else if (part.startsWith('filename=')) {
        result.filename = this._unquote(part.slice(9));
      }
    }

    return result;
  }

  /**
   * Remove quotes from header value
   * @param {string} str
   * @returns {string}
   */
  _unquote(str) {
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.slice(1, -1).replace(/\\"/g, '"');
    }
    return str;
  }

  /**
   * Start a file stream
   * @param {string} name - Field name
   * @param {string} filename - Original filename
   * @param {string} mimeType - Content type
   */
  _startFileStream(name, filename, mimeType) {
    // Create a PassThrough stream for this file
    this.currentStream = new PassThrough();

    this.currentPart = {
      name,
      filename,
      mimeType,
      bytesReceived: 0
    };

    const fileInfo = {
      fieldName: name,
      filename,
      mimeType,
      encoding: '7bit' // Default, could parse from headers
    };

    // Emit file event with stream
    // Consumer is responsible for piping this stream
    this.emit('file', fileInfo, this.currentStream);
  }

  /**
   * Emit a field event
   */
  _emitField() {
    if (this.currentPart) {
      let value = this.currentPart.value.toString('utf8');
      // Strip trailing CRLF (added before boundary)
      if (value.endsWith('\r\n')) {
        value = value.slice(0, -2);
      }
      this.emit('field', this.currentPart.name, value);
      this.currentPart = null;
    }
  }

  /**
   * Abort current stream with error
   * @param {Error} error
   */
  _abortCurrentStream(error) {
    if (this.currentStream) {
      this.currentStream.destroy(error);
      this.currentStream = null;
    }
    this.currentPart = null;
    this.emit('error', error);
  }

  /**
   * Extract boundary from Content-Type header
   * @param {string} contentType - The Content-Type header value
   * @returns {string} - The boundary string
   */
  static getBoundary(contentType) {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!match) {
      throw new Error('Missing boundary in Content-Type');
    }
    return match[1] || match[2];
  }
}

module.exports = MultipartParser;
