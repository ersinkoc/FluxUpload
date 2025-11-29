/**
 * Signed URLs Utility
 *
 * Generate and validate time-limited, cryptographically signed upload URLs.
 * Perfect for secure, temporary upload permissions without authentication.
 *
 * Features:
 * - Time-limited URLs with expiration
 * - HMAC-SHA256 signature verification
 * - Optional constraints (file size, type, count)
 * - URL parameter encoding
 * - Replay attack prevention
 *
 * @module utils/SignedUrls
 */

const crypto = require('crypto');
const { URL } = require('url');

class SignedUrls {
  /**
   * @param {Object} options - Configuration
   * @param {string} options.secret - Secret key for signing (keep private!)
   * @param {number} [options.defaultExpiry=3600] - Default expiry in seconds
   * @param {string} [options.algorithm='sha256'] - HMAC algorithm
   */
  constructor(options = {}) {
    if (!options.secret) {
      throw new Error('SignedUrls requires a secret key');
    }

    this.secret = options.secret;
    this.defaultExpiry = options.defaultExpiry || 3600; // 1 hour
    this.algorithm = options.algorithm || 'sha256';

    // Track used signatures with expiry times to prevent replay attacks
    // Map: signature -> expiryTimestamp
    this.usedSignatures = new Map();
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, 300000); // Cleanup every 5 minutes
  }

  /**
   * Generate a signed upload URL
   *
   * @param {string} baseUrl - Base URL (e.g., 'https://example.com/upload')
   * @param {Object} options - URL options
   * @param {number} [options.expiresIn] - Expiry time in seconds
   * @param {number} [options.maxFileSize] - Maximum file size in bytes
   * @param {string[]} [options.allowedTypes] - Allowed MIME types
   * @param {number} [options.maxFiles] - Maximum number of files
   * @param {string} [options.userId] - User ID for tracking
   * @param {Object} [options.metadata] - Additional metadata
   * @returns {string} Signed URL
   */
  sign(baseUrl, options = {}) {
    const expiresIn = options.expiresIn || this.defaultExpiry;
    const expires = Math.floor(Date.now() / 1000) + expiresIn;

    // Build parameters
    const params = {
      expires,
      ...(options.maxFileSize && { max_size: options.maxFileSize }),
      ...(options.maxFiles && { max_files: options.maxFiles }),
      ...(options.userId && { user_id: options.userId })
    };

    // Add allowed types
    if (options.allowedTypes && options.allowedTypes.length > 0) {
      params.allowed_types = options.allowedTypes.join(',');
    }

    // Add custom metadata
    if (options.metadata) {
      for (const [key, value] of Object.entries(options.metadata)) {
        params[`meta_${key}`] = value;
      }
    }

    // Generate signature
    const signature = this._generateSignature(baseUrl, params);
    params.signature = signature;

    // Build URL
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  /**
   * Validate a signed URL
   *
   * @param {string} url - URL to validate
   * @param {Object} options - Validation options
   * @param {boolean} [options.preventReplay=true] - Prevent replay attacks
   * @returns {Object} Validation result
   */
  validate(url, options = {}) {
    const preventReplay = options.preventReplay !== false;

    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams);

      // Extract signature
      const signature = params.signature;
      if (!signature) {
        return {
          valid: false,
          error: 'Missing signature'
        };
      }

      // Remove signature from params for validation
      const { signature: _, ...paramsWithoutSig } = params;

      // Reconstruct base URL
      const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

      // Verify signature
      const expectedSignature = this._generateSignature(baseUrl, paramsWithoutSig);
      if (signature !== expectedSignature) {
        return {
          valid: false,
          error: 'Invalid signature'
        };
      }

      // Check expiration
      const expires = parseInt(params.expires, 10);
      const now = Math.floor(Date.now() / 1000);

      // NaN check: if expires is not a valid number, treat as expired
      if (isNaN(expires) || now > expires) {
        return {
          valid: false,
          error: 'URL expired',
          expiredAt: new Date(expires * 1000)
        };
      }

      // Check for replay attack
      if (preventReplay && this.usedSignatures.has(signature)) {
        return {
          valid: false,
          error: 'URL already used (replay attack prevented)'
        };
      }

      // Mark signature as used with expiry time
      if (preventReplay) {
        this.usedSignatures.set(signature, expires);
      }

      // Extract constraints
      const maxFileSize = params.max_size ? parseInt(params.max_size, 10) : undefined;
      const maxFiles = params.max_files ? parseInt(params.max_files, 10) : undefined;

      const constraints = {
        maxFileSize: maxFileSize && !isNaN(maxFileSize) ? maxFileSize : undefined,
        maxFiles: maxFiles && !isNaN(maxFiles) ? maxFiles : undefined,
        allowedTypes: params.allowed_types ? params.allowed_types.split(',') : undefined,
        userId: params.user_id,
        expires: new Date(expires * 1000)
      };

      // Extract metadata
      const metadata = {};
      for (const [key, value] of Object.entries(params)) {
        if (key.startsWith('meta_')) {
          metadata[key.substring(5)] = value;
        }
      }

      return {
        valid: true,
        constraints,
        metadata,
        expiresAt: new Date(expires * 1000),
        timeRemaining: expires - now
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Create a validator plugin for FluxUpload
   *
   * @param {Object} options - Validator options
   * @returns {Plugin} FluxUpload plugin
   */
  createValidator(options = {}) {
    const self = this;

    const Plugin = require('../core/Plugin');

    return new (class SignedUrlValidator extends Plugin {
      constructor() {
        super('SignedUrlValidator');
      }

      async process(context) {
        if (!context.request || !context.request.headers) {
          const error = new Error('Signed URL validator requires context.request with headers');
          error.code = 'SIGNED_URL_NO_REQUEST';
          error.statusCode = 400;
          throw error;
        }

        const req = context.request;

        // Get URL from request
        const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}${req.url || '/'}`;

        // Validate
        const result = self.validate(url, options);

        if (!result.valid) {
          const error = new Error(`Signed URL validation failed: ${result.error}`);
          error.code = 'SIGNED_URL_INVALID';
          error.statusCode = 403;
          throw error;
        }

        // Store constraints in context for other plugins to use
        context.signedUrlConstraints = result.constraints;
        context.signedUrlMetadata = result.metadata;

        return context;
      }
    })();
  }

  /**
   * Generate HMAC signature
   *
   * @private
   */
  _generateSignature(baseUrl, params) {
    // Sort parameters for consistent signature
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    const data = `${baseUrl}?${sortedParams}`;

    return crypto
      .createHmac(this.algorithm, this.secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Cleanup expired signatures
   *
   * @private
   */
  _cleanup() {
    const now = Math.floor(Date.now() / 1000);

    // Remove only expired signatures
    for (const [signature, expiryTime] of this.usedSignatures.entries()) {
      if (now > expiryTime) {
        this.usedSignatures.delete(signature);
      }
    }
  }

  /**
   * Shutdown - cleanup resources
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.usedSignatures.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      usedSignatures: this.usedSignatures.size,
      defaultExpiry: this.defaultExpiry,
      algorithm: this.algorithm
    };
  }
}

module.exports = SignedUrls;
