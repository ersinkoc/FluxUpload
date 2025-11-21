/**
 * Rate Limiter Plugin
 *
 * Prevents abuse by limiting upload requests per IP address or user.
 * Implements token bucket algorithm for smooth rate limiting.
 *
 * Features:
 * - Per-IP or per-user rate limiting
 * - Token bucket algorithm
 * - Configurable window and max requests
 * - Automatic cleanup of old entries
 * - Supports burst traffic
 *
 * @module plugins/validators/RateLimiter
 */

const Plugin = require('../../core/Plugin');
const LRUCache = require('../../utils/LRUCache');

/**
 * Token bucket for rate limiting
 */
class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity; // Maximum tokens
    this.tokens = capacity; // Current tokens
    this.refillRate = refillRate; // Tokens per second
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens
   *
   * @param {number} tokens - Number of tokens to consume
   * @returns {boolean} True if tokens were consumed
   */
  consume(tokens = 1) {
    this._refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Refill tokens based on elapsed time
   *
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Get current token count
   */
  getTokens() {
    this._refill();
    return Math.floor(this.tokens);
  }

  /**
   * Get time until next token is available (in ms)
   */
  getWaitTime(tokens = 1) {
    this._refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const tokensNeeded = tokens - this.tokens;
    return (tokensNeeded / this.refillRate) * 1000;
  }
}

/**
 * Rate Limiter Plugin
 */
class RateLimiter extends Plugin {
  /**
   * @param {Object} options - Rate limiter configuration
   * @param {number} [options.maxRequests=100] - Maximum requests per window
   * @param {number} [options.windowMs=60000] - Time window in milliseconds
   * @param {string} [options.keyGenerator] - Function to generate rate limit key from context
   * @param {boolean} [options.skipSuccessfulRequests=false] - Don't count successful uploads
   * @param {boolean} [options.skipFailedRequests=false] - Don't count failed uploads
   * @param {Function} [options.handler] - Custom handler when limit is exceeded
   * @param {number} [options.cleanupInterval=300000] - Cleanup interval in ms (5 min)
   * @param {number} [options.maxBuckets=10000] - Maximum number of buckets to store
   */
  constructor(options = {}) {
    super('RateLimiter');

    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.keyGenerator = options.keyGenerator || this._defaultKeyGenerator;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;
    this.handler = options.handler || this._defaultHandler;

    // Token buckets per key with LRU eviction (bounded memory)
    this.buckets = new LRUCache({
      maxSize: options.maxBuckets || 10000
    });

    // Cleanup interval
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    this.lastCleanup = Date.now();

    // Calculate refill rate
    const windowSeconds = this.windowMs / 1000;
    this.refillRate = this.maxRequests / windowSeconds;
  }

  /**
   * Process upload
   */
  async process(context) {
    this._cleanupIfNeeded();

    const key = this.keyGenerator(context);
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = new TokenBucket(this.maxRequests, this.refillRate);
      this.buckets.set(key, bucket);
    }

    // Try to consume a token
    if (!bucket.consume(1)) {
      const waitTime = bucket.getWaitTime(1);
      return this.handler(context, {
        key,
        limit: this.maxRequests,
        windowMs: this.windowMs,
        waitTime,
        tokensRemaining: bucket.getTokens()
      });
    }

    // Store bucket for potential refund
    context.rateLimitBucket = bucket;
    context.rateLimitKey = key;

    return context;
  }

  /**
   * Cleanup - refund token if configured
   */
  async cleanup(context, error) {
    if (!context.rateLimitBucket) return;

    const shouldRefund =
      (!error && this.skipSuccessfulRequests) ||
      (error && this.skipFailedRequests);

    if (shouldRefund) {
      // Refund the token
      const bucket = context.rateLimitBucket;
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + 1);
    }
  }

  /**
   * Default key generator - uses IP address
   *
   * @private
   */
  _defaultKeyGenerator(context) {
    if (!context.request) {
      return 'unknown';
    }
    const req = context.request;
    return (req.socket && req.socket.remoteAddress) ||
           req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           'unknown';
  }

  /**
   * Default handler - throw error
   *
   * @private
   */
  _defaultHandler(context, info) {
    const error = new Error('Rate limit exceeded');
    error.code = 'RATE_LIMIT_EXCEEDED';
    error.statusCode = 429;
    error.retryAfter = Math.ceil(info.waitTime / 1000);
    error.limit = info.limit;
    error.windowMs = info.windowMs;
    throw error;
  }

  /**
   * Cleanup old buckets
   *
   * @private
   */
  _cleanupIfNeeded() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) {
      return;
    }

    // Remove buckets that are full (haven't been used recently)
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.getTokens() >= bucket.capacity) {
        this.buckets.delete(key);
      }
    }

    this.lastCleanup = now;
  }

  /**
   * Get current rate limit status for a key
   *
   * @param {string} key - Rate limit key
   * @returns {Object} Status information
   */
  getStatus(key) {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return {
        requests: 0,
        remaining: this.maxRequests,
        limit: this.maxRequests,
        resetTime: Date.now() + this.windowMs
      };
    }

    return {
      requests: this.maxRequests - bucket.getTokens(),
      remaining: bucket.getTokens(),
      limit: this.maxRequests,
      resetTime: Date.now() + bucket.getWaitTime(bucket.capacity)
    };
  }

  /**
   * Reset rate limit for a key
   *
   * @param {string} key - Rate limit key
   */
  reset(key) {
    this.buckets.delete(key);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeBuckets: this.buckets.size,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      refillRate: this.refillRate
    };
  }
}

module.exports = RateLimiter;
