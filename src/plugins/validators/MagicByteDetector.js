/**
 * MagicByteDetector - Verify file type using magic bytes
 *
 * Zero Dependency: Uses our own MimeDetector utility
 *
 * Security: CRITICAL for preventing malicious uploads.
 * Never trust file extensions or Content-Type headers.
 * Always verify the actual binary signature.
 *
 * Example attack prevented:
 * - User renames malware.exe to malware.jpg
 * - Browser sends Content-Type: image/jpeg
 * - MagicByteDetector reads actual bytes: 0x4D 0x5A (PE executable)
 * - Upload rejected!
 */

const { Transform } = require('stream');
const Plugin = require('../../core/Plugin');
const MimeDetector = require('../../utils/MimeDetector');

class MagicByteDetector extends Plugin {
  /**
   * @param {Object} config
   * @param {Array<string>} config.allowed - Allowed MIME types (supports wildcards)
   * @param {Array<string>} config.denied - Denied MIME types (optional)
   * @param {number} config.bytesToRead - Bytes to read for detection (default: 32)
   */
  constructor(config) {
    super(config);

    this.allowed = config.allowed || null; // null = allow all
    this.denied = config.denied || [];
    // Increased from 16 to 32 bytes for better detection of complex formats
    // (ZIP variants, Office documents, etc.)
    this.bytesToRead = config.bytesToRead || 32;

    this.detector = new MimeDetector();

    this.validateConfig();
  }

  validateConfig() {
    if (this.allowed && !Array.isArray(this.allowed)) {
      throw new Error('allowed must be an array of MIME types');
    }
    if (!Array.isArray(this.denied)) {
      throw new Error('denied must be an array of MIME types');
    }
  }

  /**
   * Peek at first bytes and verify MIME type
   */
  async process(context) {
    const peekerStream = new MagicBytePeeker({
      bytesToRead: this.bytesToRead,
      onDetect: (buffer) => {
        try {
          this._verifyMimeType(buffer, context);
        } catch (err) {
          // Emit error on stream so it propagates to consumers
          peekerStream.destroy(err);
        }
      }
    });

    // Pipe original stream through peeker
    const newStream = context.stream.pipe(peekerStream);

    // Add detected MIME to metadata
    peekerStream.once('detected', (detectedMime) => {
      context.metadata.detectedMimeType = detectedMime;
    });

    return {
      ...context,
      stream: newStream
    };
  }

  /**
   * Verify MIME type against allowed/denied lists
   *
   * @param {Buffer} buffer - First bytes of file
   * @param {Object} context - Upload context
   * @throws {Error} - If MIME type is not allowed
   */
  _verifyMimeType(buffer, context) {
    const detected = this.detector.detect(buffer);

    if (!detected) {
      // Unknown file type
      if (this.allowed) {
        throw new Error('Unable to detect file type - upload rejected');
      }
      // If no whitelist, allow unknown types
      return;
    }

    const { mime } = detected;

    // Check denied list first
    if (this.denied.length > 0 && this.detector.isAllowed(mime, this.denied)) {
      throw new Error(`File type not allowed: ${mime}`);
    }

    // Check allowed list
    if (this.allowed && !this.detector.isAllowed(mime, this.allowed)) {
      const declaredType = context.fileInfo.mimeType;
      throw new Error(
        `File type mismatch: declared as ${declaredType}, but detected as ${mime}`
      );
    }

    // Passed all checks
    return detected;
  }
}

/**
 * MagicBytePeeker - Transform stream that peeks at first N bytes
 *
 * This stream reads the first bytes for analysis but passes ALL data downstream.
 * It's transparent to the rest of the pipeline.
 */
class MagicBytePeeker extends Transform {
  constructor(options) {
    super();

    this.bytesToRead = options.bytesToRead;
    this.onDetect = options.onDetect;

    this.buffer = Buffer.alloc(0);
    this.detected = false;
  }

  _transform(chunk, encoding, callback) {
    // If we haven't detected yet, accumulate bytes
    if (!this.detected) {
      this.buffer = Buffer.concat([this.buffer, chunk]);

      if (this.buffer.length >= this.bytesToRead) {
        // We have enough bytes - run detection
        const detectBuffer = this.buffer.slice(0, this.bytesToRead);

        try {
          this.onDetect(detectBuffer);
          this.detected = true;
          this.emit('detected', this._detectMime(detectBuffer));
        } catch (err) {
          return callback(err);
        }
      }
    }

    // Always pass chunk downstream (transparent)
    callback(null, chunk);
  }

  _flush(callback) {
    // If we reached end of stream and haven't detected yet
    if (!this.detected && this.buffer.length > 0) {
      try {
        this.onDetect(this.buffer);
        this.detected = true;
        this.emit('detected', this._detectMime(this.buffer));
      } catch (err) {
        return callback(err);
      }
    }

    callback();
  }

  _detectMime(buffer) {
    const MimeDetector = require('../../utils/MimeDetector');
    const detector = new MimeDetector();
    const result = detector.detect(buffer);
    return result ? result.mime : null;
  }
}

module.exports = MagicByteDetector;
