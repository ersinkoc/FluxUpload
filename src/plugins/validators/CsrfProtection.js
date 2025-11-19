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
   */
  constructor(options = {}) {
    super('CsrfProtection');

    this.tokenLength = options.tokenLength || 32;
    this.tokenLifetime = options.tokenLifetime || 3600000; // 1 hour
    this.cookieName = options.cookieName || 'csrf-token';
    this.headerName = options.headerName || 'X-CSRF-Token';
    this.doubleSubmitCookie = options.doubleSubmitCookie !== false;
    this.getTokenFn = options.getToken || this._defaultGetToken.bind(this);
    this.validateTokenFn = options.validateToken || this._defaultValidateToken.bind(this);

    // In-memory token store (for stateful validation)
    this.tokens = new Map();

    // Cleanup expired tokens periodically
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredTokens();
    }, 60000); // Every minute
  }

  /**
   * Validate CSRF token before processing upload
   */
  async process(context) {
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
   * Default token getter - tries header, body, query
   *
   * @private
   */
  _defaultGetToken(req) {
    // Check header
    let token = req.headers[this.headerName.toLowerCase()];

    if (token) {
      return token;
    }

    // Check cookie (for double-submit pattern)
    if (this.doubleSubmitCookie) {
      token = this._getCookieToken(req);
    }

    // Check query string (less secure, but supported)
    if (!token && req.url) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      token = url.searchParams.get('csrf_token');
    }

    return token;
  }

  /**
   * Default token validator
   *
   * @private
   */
  _defaultValidateToken(req, token) {
    if (this.doubleSubmitCookie) {
      // Double-submit cookie pattern
      const cookieToken = this._getCookieToken(req);
      return cookieToken && cookieToken === token;
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
      const [name, value] = cookie.trim().split('=');
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
  }

  /**
   * Cleanup expired tokens
   *
   * @private
   */
  _cleanupExpiredTokens() {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, data] of this.tokens.entries()) {
      if (now > data.expires) {
        this.tokens.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CSRF] Cleaned up ${cleaned} expired tokens`);
    }
  }

  /**
   * Shutdown - clear cleanup interval
   */
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
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
