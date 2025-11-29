/**
 * StreamHasher - Calculate file checksums during upload
 *
 * Zero Dependency: Uses native crypto module
 *
 * Performance: Hashing happens in parallel with upload.
 * No need to read the file twice or buffer it in memory.
 *
 * Use Cases:
 * - Verify file integrity
 * - Detect duplicate files (deduplication)
 * - Generate ETags for CDN
 * - Security: Content verification
 *
 * Supported Algorithms: md5, sha1, sha256, sha512
 */

const { Transform } = require('stream');
const crypto = require('crypto');
const Plugin = require('../../core/Plugin');

class StreamHasher extends Plugin {
  /**
   * @param {Object} config
   * @param {string} config.algorithm - Hash algorithm (default: sha256)
   * @param {string} config.encoding - Output encoding (hex, base64, default: hex)
   */
  constructor(config = {}) {
    super(config);

    this.algorithm = config.algorithm || 'sha256';
    this.encoding = config.encoding || 'hex';

    this.validateConfig();
  }

  validateConfig() {
    const supportedAlgorithms = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
    if (!supportedAlgorithms.includes(this.algorithm)) {
      throw new Error(`Unsupported hash algorithm: ${this.algorithm}`);
    }

    const supportedEncodings = ['hex', 'base64', 'base64url'];
    if (!supportedEncodings.includes(this.encoding)) {
      throw new Error(`Unsupported encoding: ${this.encoding}`);
    }
  }

  async process(context) {
    const hashStream = new HashTransform({
      algorithm: this.algorithm,
      encoding: this.encoding
    });

    hashStream.on('hash', (hash) => {
      // Add hash to metadata
      context.metadata.hash = hash;
      context.metadata.hashAlgorithm = this.algorithm;
    });

    // Pipe through hash stream
    const newStream = context.stream.pipe(hashStream);

    // Propagate errors from source stream to hash stream
    context.stream.on('error', (err) => {
      hashStream.destroy(err);
    });

    return {
      ...context,
      stream: newStream
    };
  }
}

/**
 * HashTransform - Transform stream that calculates hash
 *
 * This is a transparent pass-through stream that calculates
 * the hash while data flows through.
 */
class HashTransform extends Transform {
  constructor(options) {
    super();

    this.algorithm = options.algorithm;
    this.encoding = options.encoding;

    // Create hash using native crypto
    // Zero dependency: crypto is built into Node.js
    this.hash = crypto.createHash(this.algorithm);
  }

  _transform(chunk, encoding, callback) {
    // Update hash with this chunk
    this.hash.update(chunk);

    // Pass chunk through unchanged
    callback(null, chunk);
  }

  _flush(callback) {
    // Finalize hash when stream ends
    const digest = this.hash.digest(this.encoding);

    // Emit hash event
    this.emit('hash', digest);

    callback();
  }
}

module.exports = StreamHasher;
