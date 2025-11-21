/**
 * ImageDimensionProbe - Extract image dimensions from headers without full decode
 *
 * Zero Dependency: Implements lightweight parsers for image format headers
 *
 * Performance: Reads only the first few KB (header) instead of entire file.
 * A 50MB image might only need 1KB of data to determine its dimensions.
 *
 * Supported Formats:
 * - JPEG: Read SOF (Start of Frame) marker
 * - PNG: Read IHDR (Image Header) chunk
 * - GIF: Read Logical Screen Descriptor
 * - WebP: Read VP8/VP8L/VP8X chunks
 * - BMP: Read DIB header
 *
 * Use Cases:
 * - Reject images that are too large (e.g., > 4K resolution)
 * - Reject images that are too small (e.g., < 100x100 for avatars)
 * - Validate aspect ratios
 */

const { Transform } = require('stream');
const Plugin = require('../../core/Plugin');

class ImageDimensionProbe extends Plugin {
  /**
   * @param {Object} config
   * @param {number} config.minWidth - Minimum width in pixels
   * @param {number} config.maxWidth - Maximum width in pixels
   * @param {number} config.minHeight - Minimum height in pixels
   * @param {number} config.maxHeight - Maximum height in pixels
   * @param {number} config.bytesToRead - Max bytes to read (default: 8192)
   */
  constructor(config = {}) {
    super(config);

    this.minWidth = config.minWidth || 0;
    this.maxWidth = config.maxWidth || Infinity;
    this.minHeight = config.minHeight || 0;
    this.maxHeight = config.maxHeight || Infinity;
    this.bytesToRead = config.bytesToRead || 8192; // 8KB should be enough for most formats
  }

  async process(context) {
    // Only probe if this is an image
    const mimeType = (context.metadata && context.metadata.detectedMimeType) ||
                     (context.fileInfo && context.fileInfo.mimeType);
    if (!mimeType || !mimeType.startsWith('image/')) {
      // Not an image - skip
      return context;
    }

    const probeStream = new DimensionProbeStream({
      bytesToRead: this.bytesToRead,
      mimeType: mimeType
    });

    probeStream.on('dimensions', (dimensions) => {
      try {
        this._validateDimensions(dimensions);
        context.metadata.dimensions = dimensions;
      } catch (err) {
        // Emit error on stream so it propagates to consumers
        probeStream.destroy(err);
      }
    });

    const newStream = context.stream.pipe(probeStream);

    return {
      ...context,
      stream: newStream
    };
  }

  _validateDimensions(dimensions) {
    const { width, height } = dimensions;

    // Prevent integer overflow attacks - reasonable max dimension
    // 100,000 pixels = ~100 megapixels (larger than most cameras)
    const ABSOLUTE_MAX_DIMENSION = 100000;

    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Invalid image dimensions: must be finite numbers');
    }

    if (width > ABSOLUTE_MAX_DIMENSION || height > ABSOLUTE_MAX_DIMENSION) {
      throw new Error(
        `Image dimensions exceed absolute maximum (${ABSOLUTE_MAX_DIMENSION}px): ` +
        `${width}x${height}. This may indicate a malformed or malicious image.`
      );
    }

    if (width < 0 || height < 0) {
      throw new Error(`Invalid image dimensions: negative values not allowed (${width}x${height})`);
    }

    if (width < this.minWidth) {
      throw new Error(`Image width ${width}px is below minimum ${this.minWidth}px`);
    }
    if (width > this.maxWidth) {
      throw new Error(`Image width ${width}px exceeds maximum ${this.maxWidth}px`);
    }
    if (height < this.minHeight) {
      throw new Error(`Image height ${height}px is below minimum ${this.minHeight}px`);
    }
    if (height > this.maxHeight) {
      throw new Error(`Image height ${height}px exceeds maximum ${this.maxHeight}px`);
    }
  }
}

/**
 * DimensionProbeStream - Parse image headers to extract dimensions
 */
class DimensionProbeStream extends Transform {
  constructor(options) {
    super();

    this.bytesToRead = options.bytesToRead;
    this.mimeType = options.mimeType;

    this.buffer = Buffer.alloc(0);
    this.probed = false;
  }

  _transform(chunk, encoding, callback) {
    if (!this.probed) {
      this.buffer = Buffer.concat([this.buffer, chunk]);

      if (this.buffer.length >= this.bytesToRead || this.buffer.length >= 8192) {
        try {
          const dimensions = this._extractDimensions();
          if (dimensions) {
            this.emit('dimensions', dimensions);
            this.probed = true;
          }
        } catch (err) {
          return callback(err);
        }
      }
    }

    callback(null, chunk);
  }

  _flush(callback) {
    if (!this.probed && this.buffer.length > 0) {
      try {
        const dimensions = this._extractDimensions();
        if (dimensions) {
          this.emit('dimensions', dimensions);
        }
      } catch (err) {
        return callback(err);
      }
    }

    callback();
  }

  _extractDimensions() {
    switch (this.mimeType) {
      case 'image/jpeg':
        return this._parseJPEG();
      case 'image/png':
        return this._parsePNG();
      case 'image/gif':
        return this._parseGIF();
      case 'image/webp':
        return this._parseWebP();
      case 'image/bmp':
        return this._parseBMP();
      default:
        return null;
    }
  }

  /**
   * Parse JPEG dimensions
   * JPEG structure: SOI (0xFFD8) followed by markers
   * We need to find SOF (Start of Frame) marker: 0xFFC0-0xFFC3
   */
  _parseJPEG() {
    let offset = 2; // Skip SOI marker (0xFFD8)

    while (offset < this.buffer.length - 9) {
      // Check for marker (0xFF)
      if (this.buffer[offset] !== 0xFF) {
        offset++;
        continue;
      }

      const marker = this.buffer[offset + 1];

      // SOF markers: 0xC0-0xC3
      if (marker >= 0xC0 && marker <= 0xC3) {
        // SOF segment structure:
        // +0: 0xFF, +1: marker, +2-3: length, +4: precision
        // +5-6: height (big-endian), +7-8: width (big-endian)
        const height = this.buffer.readUInt16BE(offset + 5);
        const width = this.buffer.readUInt16BE(offset + 7);

        return { width, height };
      }

      // Skip this segment
      const segmentLength = this.buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }

    return null;
  }

  /**
   * Parse PNG dimensions
   * PNG structure: Signature (8 bytes) + IHDR chunk
   * IHDR is always the first chunk
   */
  _parsePNG() {
    if (this.buffer.length < 24) return null;

    // PNG signature: 8 bytes
    // IHDR chunk: 4 (length) + 4 (type "IHDR") + 13 (data) + 4 (CRC)
    // Dimensions are at offset 16-23

    const width = this.buffer.readUInt32BE(16);
    const height = this.buffer.readUInt32BE(20);

    return { width, height };
  }

  /**
   * Parse GIF dimensions
   * GIF structure: Header (6 bytes) + Logical Screen Descriptor
   * Dimensions at offset 6-9
   */
  _parseGIF() {
    if (this.buffer.length < 10) return null;

    // Dimensions are little-endian
    const width = this.buffer.readUInt16LE(6);
    const height = this.buffer.readUInt16LE(8);

    return { width, height };
  }

  /**
   * Parse WebP dimensions
   * WebP structure: RIFF header + WebP chunks
   */
  _parseWebP() {
    if (this.buffer.length < 30) return null;

    // WebP can use VP8, VP8L, or VP8X formats
    const chunkType = this.buffer.toString('utf8', 12, 16);

    if (chunkType === 'VP8 ') {
      // VP8 (lossy)
      // Dimensions are in frame tag at offset 26-29
      const width = this.buffer.readUInt16LE(26) & 0x3FFF;
      const height = this.buffer.readUInt16LE(28) & 0x3FFF;
      return { width, height };

    } else if (chunkType === 'VP8L') {
      // VP8L (lossless)
      // Dimensions encoded in bits at offset 21-24
      const bits = this.buffer.readUInt32LE(21);
      const width = (bits & 0x3FFF) + 1;
      const height = ((bits >> 14) & 0x3FFF) + 1;
      return { width, height };

    } else if (chunkType === 'VP8X') {
      // VP8X (extended)
      // Dimensions at offset 24-29 (24 bits each)
      const width = (this.buffer.readUInt32LE(24) & 0xFFFFFF) + 1;
      const height = (this.buffer.readUInt32LE(27) & 0xFFFFFF) + 1;
      return { width, height };
    }

    return null;
  }

  /**
   * Parse BMP dimensions
   * BMP structure: File header (14 bytes) + DIB header
   * Dimensions at offset 18-25
   */
  _parseBMP() {
    if (this.buffer.length < 26) return null;

    // Dimensions are little-endian, signed 32-bit integers
    const width = Math.abs(this.buffer.readInt32LE(18));
    const height = Math.abs(this.buffer.readInt32LE(22));

    return { width, height };
  }
}

module.exports = ImageDimensionProbe;
