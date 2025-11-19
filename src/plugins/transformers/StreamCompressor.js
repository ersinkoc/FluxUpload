/**
 * StreamCompressor - Compress files during upload
 *
 * Zero Dependency: Uses native zlib module
 *
 * Use Cases:
 * - Save storage space
 * - Reduce bandwidth for retrieval
 * - Store pre-compressed files for CDN
 *
 * Supported Formats:
 * - gzip: Standard compression, widely supported
 * - deflate: Raw deflate
 * - brotli: Better compression ratio (Node.js 11.7+)
 *
 * Note: Only compress compressible files (text, JSON, SVG, etc.)
 * Don't compress already-compressed formats (JPEG, PNG, MP4, ZIP)
 */

const { Transform, pipeline } = require('stream');
const zlib = require('zlib');
const Plugin = require('../../core/Plugin');

class StreamCompressor extends Plugin {
  /**
   * @param {Object} config
   * @param {string} config.algorithm - Compression algorithm (gzip, deflate, brotli)
   * @param {number} config.level - Compression level (0-9, default: 6)
   * @param {Array<string>} config.compressibleTypes - MIME types to compress
   */
  constructor(config = {}) {
    super(config);

    this.algorithm = config.algorithm || 'gzip';
    this.level = config.level !== undefined ? config.level : 6;

    // Only compress text-based formats by default
    this.compressibleTypes = config.compressibleTypes || [
      'text/*',
      'application/json',
      'application/xml',
      'application/javascript',
      'application/x-javascript',
      'image/svg+xml'
    ];

    this.validateConfig();
  }

  validateConfig() {
    const supportedAlgorithms = ['gzip', 'deflate', 'brotli'];
    if (!supportedAlgorithms.includes(this.algorithm)) {
      throw new Error(`Unsupported compression algorithm: ${this.algorithm}`);
    }

    if (typeof this.level !== 'number' || this.level < 0 || this.level > 9) {
      throw new Error('Compression level must be between 0 and 9');
    }
  }

  async process(context) {
    // Check if this file type should be compressed
    const mimeType = context.metadata.detectedMimeType || context.fileInfo.mimeType;
    if (!this._shouldCompress(mimeType)) {
      // Skip compression
      return context;
    }

    // Create compression stream
    const compressStream = this._createCompressor();

    // Pipe through compressor
    const newStream = context.stream.pipe(compressStream);

    // Update metadata
    context.metadata.compressed = true;
    context.metadata.compressionAlgorithm = this.algorithm;

    // Update filename if needed
    if (context.fileInfo.filename) {
      const extension = this._getCompressionExtension();
      context.metadata.originalFilename = context.fileInfo.filename;
      context.metadata.compressedFilename = `${context.fileInfo.filename}${extension}`;
    }

    return {
      ...context,
      stream: newStream
    };
  }

  /**
   * Check if MIME type should be compressed
   */
  _shouldCompress(mimeType) {
    if (!mimeType) return false;

    for (const pattern of this.compressibleTypes) {
      if (pattern.endsWith('/*')) {
        // Wildcard match
        const prefix = pattern.slice(0, -2);
        if (mimeType.startsWith(prefix + '/')) {
          return true;
        }
      } else if (pattern === mimeType) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create compressor based on algorithm
   */
  _createCompressor() {
    const options = { level: this.level };

    switch (this.algorithm) {
      case 'gzip':
        return zlib.createGzip(options);

      case 'deflate':
        return zlib.createDeflate(options);

      case 'brotli':
        // Brotli uses different options
        const brotliOptions = {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: this.level
          }
        };
        return zlib.createBrotliCompress(brotliOptions);

      default:
        throw new Error(`Unknown algorithm: ${this.algorithm}`);
    }
  }

  /**
   * Get file extension for compression type
   */
  _getCompressionExtension() {
    switch (this.algorithm) {
      case 'gzip':
        return '.gz';
      case 'deflate':
        return '.deflate';
      case 'brotli':
        return '.br';
      default:
        return '';
    }
  }
}

module.exports = StreamCompressor;
