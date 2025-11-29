/**
 * CSRF Protection Plugin
 *
 * Prevents Cross-Site Request Forgery attacks on upload endpoints.
 * Validates CSRF tokens before allowing uploads to proceed.
 *
 * Features:
 * - Token generation and validation
 * - Configurable token lifetime
 * - Multiple token storage strategies
 * - Automatic token rotation
 * - Double-submit cookie pattern support
 *
 * @module plugins/validators/CsrfProtection
 */

const crypto = require('crypto');
const Plugin = require('../../core/Plugin');
const LRUCache = require('../../utils/LRUCache');
const { getLogger } = require('../../observability/Logger');

const logger = getLogger('CsrfProtection');

// CSRF protection constants
const DEFAULT_TOKEN_LENGTH = 32; // bytes
const DEFAULT_TOKEN_LIFETIME = 3600000; // 1 hour in milliseconds
const DEFAULT_MAX_TOKENS = 10000;
const CLEANUP_INTERVAL_MS = 60000; // 1 minute

class CsrfProtection extends Plugin {
  /**
   * @param {Object} options - CSRF protection configuration
   * @param {string} [options.tokenLength=32] - Token length in bytes
   * @param {number} [options.tokenLifetime=3600000] - Token lifetime in ms (1 hour)
   * @param {string} [options.cookieName='csrf-token'] - Cookie name for double-submit pattern
   * @param {string} [options.headerName='X-CSRF-Token'] - HTTP header name
   * @param {Function} [options.getToken] - Custom token getter from request
   * @param {Function} [options.validateToken] - Custom token validator
   * @param {boolean} [options.doubleSubmitCookie=true] - Use double-submit cookie pattern
   * @param {number} [options.maxTokens=10000] - Maximum number of tokens to store
   */
  constructor(options = {}) {
    super('CsrfProtection');

    this.tokenLength = options.tokenLength || DEFAULT_TOKEN_LENGTH;
    this.tokenLifetime = options.tokenLifetime || DEFAULT_TOKEN_LIFETIME;
    this.cookieName = options.cookieName || 'csrf-token';
    this.headerName = options.headerName || 'X-CSRF-Token';
    this.doubleSubmitCookie = options.doubleSubmitCookie !== false;
    this.getTokenFn = options.getToken || this._defaultGetToken.bind(this);
    this.validateTokenFn = options.validateToken || this._defaultValidateToken.bind(this);

    // In-memory token store with LRU eviction (bounded memory)
    this.tokens = new LRUCache({
      maxSize: options.maxTokens || DEFAULT_MAX_TOKENS,
      ttl: this.tokenLifetime
    });

    // Cleanup interval will be started in initialize()
    this.cleanupInterval = null;
  }

  /**
   * Initialize plugin - start cleanup interval
   */
  async initialize() {
    // Start cleanup interval only when plugin is active
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        this._cleanupExpiredTokens();
      }, CLEANUP_INTERVAL_MS);
    }
  }

  /**
   * Validate CSRF token before processing upload
   */
  async process(context) {
    if (!context.request) {
      const error = new Error(
        'CsrfProtection requires HTTP request context. ' +
        'This validator cannot be used in buffer parsing mode (parseBuffer). ' +
        'Remove CsrfProtection from validators or use handle() instead.'
      );
      error.code = 'CSRF_NO_REQUEST';
      error.statusCode = 400;
      throw error;
    }

    const req = context.request;

    // Get token from request
    const token = this.getTokenFn(req);

    if (!token) {
      const error = new Error('CSRF token missing');
      error.code = 'CSRF_TOKEN_MISSING';
      error.statusCode = 403;
      throw error;
    }

    // Validate token
    const valid = await this.validateTokenFn(req, token);

    if (!valid) {
      const error = new Error('Invalid CSRF token');
      error.code = 'CSRF_TOKEN_INVALID';
      error.statusCode = 403;
      throw error;
    }

    return context;
  }

  /**
   * Generate a new CSRF token
   *
   * @param {Object} options - Token options
   * @param {string} [options.sessionId] - Associate token with session
   * @returns {string} Generated token
   */
  generateToken(options = {}) {
    const token = crypto.randomBytes(this.tokenLength).toString('hex');
    const expires = Date.now() + this.tokenLifetime;

    // Store token with metadata
    this.tokens.set(token, {
      created: Date.now(),
      expires,
      sessionId: options.sessionId,
      used: false
    });

    return token;
  }

  /**
   * Verify a token exists and is valid
   *
   * @param {string} token - Token to verify
   * @param {Object} options - Verification options
   * @returns {boolean} True if valid
   */
  verifyToken(token, options = {}) {
    const tokenData = this.tokens.get(token);

    if (!tokenData) {
      return false;
    }

    // Check expiration
    if (Date.now() > tokenData.expires) {
      this.tokens.delete(token);
      return false;
    }

    // Check if already used (one-time token)
    if (options.oneTime && tokenData.used) {
      return false;
    }

    // Check session binding
    if (options.sessionId && tokenData.sessionId !== options.sessionId) {
      return false;
    }

    // Mark as used
    if (options.oneTime) {
      tokenData.used = true;
    }

    return true;
  }

  /**
   * Revoke a token
   *
   * @param {string} token - Token to revoke
   */
  revokeToken(token) {
    this.tokens.delete(token);
  }

  /**
   * Clear all tokens
   */
  clearTokens() {
    this.tokens.clear();
  }

  /**
   * Default token getter - tries header and cookie only
   *
   * SECURITY: Query string tokens are NOT supported due to logging exposure.
   * Tokens in URLs appear in server logs, proxy logs, browser history, and
   * referrer headers, which completely defeats CSRF protection.
   *
   * @private
   */
  _defaultGetToken(req) {
    // Check header (most secure)
    let token = req.headers[this.headerName.toLowerCase()];

    if (token) {
      return token;
    }

    // Check cookie (for double-submit pattern)
    if (this.doubleSubmitCookie) {
      token = this._getCookieToken(req);
    }

    // Query string tokens are NOT supported for security reasons
    // If you need query string support, you MUST provide a custom getToken function
    // and accept the security implications

    return token;
  }

  /**
   * Default token validator (timing-safe)
   *
   * @private
   */
  _defaultValidateToken(req, token) {
    if (this.doubleSubmitCookie) {
      // Double-submit cookie pattern with timing-safe comparison
      const cookieToken = this._getCookieToken(req);
      if (!cookieToken || !token) {
        return false;
      }
      return this._timingSafeEqual(cookieToken, token);
    } else {
      // Stateful validation
      return this.verifyToken(token);
    }
  }

  /**
   * Get token from cookie
   *
   * @private
   */
  _getCookieToken(req) {
    const cookies = this._parseCookies(req);
    return cookies[this.cookieName];
  }

  /**
   * Parse cookies from request
   *
   * @private
   */
  _parseCookies(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return {};

    return cookieHeader.split(';').reduce((cookies, cookie) => {
      const parts = cookie.trim().split('=');
      const name = parts[0];
      const value = parts.slice(1).join('='); // Handle values containing '='
      if (name && value !== undefined && value !== '') {
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = value; // Use raw value if decode fails
        }
      }
      return cookies;
    }, {});
  }

  /**
   * Cleanup expired tokens
   *
   * @private
   */
  _cleanupExpiredTokens() {
    // LRUCache handles TTL-based cleanup automatically
    const cleaned = this.tokens.cleanup();

    if (cleaned > 0) {
      logger.debug('Cleaned up expired CSRF tokens', { count: cleaned });
    }
  }

  /**
   * Timing-safe string comparison
   *
   * Prevents timing attacks by ensuring comparison takes constant time
   * regardless of where strings differ.
   *
   * @private
   */
  _timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    // Convert to buffers for crypto.timingSafeEqual
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    // Must be same length for timingSafeEqual
    if (bufA.length !== bufB.length) {
      // Still do constant-time comparison to prevent length-based timing attacks
      // Compare against a dummy buffer of same length as b
      const dummyBuf = Buffer.alloc(bufB.length);
      crypto.timingSafeEqual(bufB, dummyBuf);
      return false;
    }

    try {
      return crypto.timingSafeEqual(bufA, bufB);
    } catch (err) {
      return false;
    }
  }

  /**
   * Shutdown - clear cleanup interval
   */
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearTokens();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeTokens: this.tokens.size,
      tokenLifetime: this.tokenLifetime,
      doubleSubmitCookie: this.doubleSubmitCookie
    };
  }
}

module.exports = CsrfProtection;
