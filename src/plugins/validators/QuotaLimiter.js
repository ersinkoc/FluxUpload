/**
 * QuotaLimiter - Enforce file size limits with immediate abort
 *
 * Zero Dependency: Uses native Transform stream to count bytes
 *
 * Key Feature: Destroys stream IMMEDIATELY when limit is exceeded,
 * saving bandwidth and preventing unnecessary processing.
 *
 * This is crucial for DDOS protection - we don't want to receive
 * a 10GB file if our limit is 100MB.
 */

const { Transform } = require('stream');
const Plugin = require('../../core/Plugin');

class QuotaLimiter extends Plugin {
  /**
   * @param {Object} config
   * @param {number} config.maxFileSize - Maximum file size in bytes
   * @param {number} config.maxTotalSize - Maximum total upload size (optional)
   */
  constructor(config) {
    super(config);

    this.maxFileSize = config.maxFileSize || 100 * 1024 * 1024; // 100MB default
    this.maxTotalSize = config.maxTotalSize || null;
    this.totalBytesProcessed = 0;

    this.validateConfig();
  }

  validateConfig() {
    if (typeof this.maxFileSize !== 'number' || this.maxFileSize <= 0) {
      throw new Error('maxFileSize must be a positive number');
    }
  }

  /**
   * Wrap stream with byte counter
   */
  async process(context) {
    const limiterStream = new ByteCounterStream({
      maxBytes: this.maxFileSize
    });

    // Store error for later re-throwing (allows PipelineManager to catch it)
    let pendingError = null;

    // Attach error handler to limiterStream BEFORE piping to prevent unhandled errors
    // This captures the error so it can be properly propagated through the stream chain
    limiterStream.on('error', (err) => {
      pendingError = err;
    });

    // Track total bytes across all files
    limiterStream.on('bytes', (count) => {
      this.totalBytesProcessed += count;

      if (this.maxTotalSize && this.totalBytesProcessed > this.maxTotalSize) {
        const error = new Error(`Total upload size exceeds limit of ${this.maxTotalSize} bytes`);
        error.code = 'LIMIT_TOTAL_SIZE';
        limiterStream.destroy(error);
      }
    });

    // Pipe original stream through limiter and mutate context in place
    context.stream = context.stream.pipe(limiterStream);

    // Return context (same object, mutated)
    return context;
  }

  /**
   * Reset total bytes counter (call between requests)
   */
  reset() {
    this.totalBytesProcessed = 0;
  }
}

/**
 * ByteCounterStream - Transform stream that counts bytes and enforces limit
 */
class ByteCounterStream extends Transform {
  constructor(options) {
    super();

    this.maxBytes = options.maxBytes;
    this.bytesProcessed = 0;
  }

  _transform(chunk, encoding, callback) {
    this.bytesProcessed += chunk.length;

    // Check limit BEFORE processing
    if (this.bytesProcessed > this.maxBytes) {
      // Don't pass chunk downstream - reject with error
      const error = new Error(`File size exceeds limit of ${this.maxBytes} bytes`);
      error.code = 'LIMIT_FILE_SIZE';

      // Calling callback with error will properly destroy stream and emit 'error' event
      return callback(error);
    }

    // Emit bytes event for tracking
    this.emit('bytes', chunk.length);

    // Pass chunk downstream
    callback(null, chunk);
  }
}

module.exports = QuotaLimiter;
