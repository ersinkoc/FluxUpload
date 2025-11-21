/**
 * FluxUploadError - Base error class for all FluxUpload errors
 *
 * Provides consistent error handling with error codes and HTTP status codes
 *
 * @module errors/FluxUploadError
 */

/**
 * Base error class for FluxUpload
 */
class FluxUploadError extends Error {
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode
    };
  }
}

/**
 * Validation error - thrown when validation fails
 */
class ValidationError extends FluxUploadError {
  constructor(message, details = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details
    };
  }
}

/**
 * Limit exceeded error - thrown when size/count limits are exceeded
 */
class LimitError extends FluxUploadError {
  constructor(limitType, limit, actual) {
    const message = `${limitType} limit exceeded: ${limit} (received: ${actual})`;
    super(message, `LIMIT_${limitType.toUpperCase()}`, 413);
    this.limitType = limitType;
    this.limit = limit;
    this.actual = actual;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      limitType: this.limitType,
      limit: this.limit,
      actual: this.actual
    };
  }
}

/**
 * CSRF error - thrown when CSRF validation fails
 */
class CsrfError extends FluxUploadError {
  constructor(message) {
    super(message, 'CSRF_ERROR', 403);
  }
}

/**
 * Rate limit error - thrown when rate limit is exceeded
 */
class RateLimitError extends FluxUploadError {
  constructor(retryAfter, limit, windowMs) {
    const message = `Rate limit exceeded. Retry after ${retryAfter} seconds`;
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.windowMs = windowMs;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      limit: this.limit,
      windowMs: this.windowMs
    };
  }
}

/**
 * Parser error - thrown when multipart parsing fails
 */
class ParserError extends FluxUploadError {
  constructor(message) {
    super(message, 'PARSER_ERROR', 400);
  }
}

/**
 * Storage error - thrown when storage operation fails
 */
class StorageError extends FluxUploadError {
  constructor(message, driver) {
    super(message, 'STORAGE_ERROR', 500);
    this.driver = driver;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      driver: this.driver
    };
  }
}

/**
 * Plugin error - thrown when plugin operation fails
 */
class PluginError extends FluxUploadError {
  constructor(message, pluginName) {
    super(message, 'PLUGIN_ERROR', 500);
    this.pluginName = pluginName;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      pluginName: this.pluginName
    };
  }
}

module.exports = {
  FluxUploadError,
  ValidationError,
  LimitError,
  CsrfError,
  RateLimitError,
  ParserError,
  StorageError,
  PluginError
};
