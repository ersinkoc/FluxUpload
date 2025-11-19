/**
 * Structured Logger for FluxUpload
 *
 * Provides structured logging with multiple log levels, contextual metadata,
 * and support for various output formats (JSON, text).
 *
 * Features:
 * - Zero dependencies (uses native console and streams)
 * - Structured logging with metadata
 * - Log levels: trace, debug, info, warn, error, fatal
 * - Context propagation
 * - Performance timing
 * - Request tracking
 * - Multiple output formats
 *
 * @module observability/Logger
 */

const { Writable } = require('stream');
const { format } = require('util');

const LOG_LEVELS = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5
};

const LEVEL_NAMES = Object.keys(LOG_LEVELS);

class Logger {
  /**
   * Create a new Logger instance
   *
   * @param {Object} options - Logger configuration
   * @param {string} [options.level='info'] - Minimum log level to output
   * @param {string} [options.format='json'] - Output format: 'json' or 'text'
   * @param {WritableStream} [options.destination=process.stdout] - Output destination
   * @param {Object} [options.baseContext={}] - Base context included in all logs
   * @param {boolean} [options.timestamp=true] - Include timestamps
   * @param {boolean} [options.pretty=false] - Pretty-print JSON output
   */
  constructor(options = {}) {
    this.level = LOG_LEVELS[options.level] !== undefined
      ? LOG_LEVELS[options.level]
      : LOG_LEVELS.info;

    this.format = options.format || 'json';
    this.destination = options.destination || process.stdout;
    this.baseContext = options.baseContext || {};
    this.timestamp = options.timestamp !== false;
    this.pretty = options.pretty || false;

    // Request tracking
    this.requestIdCounter = 0;
    this.activeRequests = new Map();
  }

  /**
   * Create a child logger with additional context
   *
   * @param {Object} context - Additional context to merge
   * @returns {Logger} New logger instance with merged context
   */
  child(context) {
    return new Logger({
      level: LEVEL_NAMES[this.level],
      format: this.format,
      destination: this.destination,
      baseContext: { ...this.baseContext, ...context },
      timestamp: this.timestamp,
      pretty: this.pretty
    });
  }

  /**
   * Generate a unique request ID
   *
   * @returns {string} Unique request identifier
   */
  generateRequestId() {
    return `req_${Date.now()}_${++this.requestIdCounter}`;
  }

  /**
   * Start tracking a request
   *
   * @param {string} requestId - Request identifier
   * @param {Object} metadata - Request metadata
   */
  startRequest(requestId, metadata = {}) {
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
      ...metadata
    });

    this.info('Request started', {
      requestId,
      ...metadata
    });
  }

  /**
   * End tracking a request
   *
   * @param {string} requestId - Request identifier
   * @param {Object} result - Request result metadata
   */
  endRequest(requestId, result = {}) {
    const request = this.activeRequests.get(requestId);
    if (!request) {
      this.warn('Ending unknown request', { requestId });
      return;
    }

    const duration = Date.now() - request.startTime;
    this.activeRequests.delete(requestId);

    this.info('Request completed', {
      requestId,
      duration,
      ...result
    });
  }

  /**
   * Start a performance timer
   *
   * @param {string} label - Timer label
   * @returns {Function} Function to end the timer
   */
  time(label) {
    const start = Date.now();
    return (metadata = {}) => {
      const duration = Date.now() - start;
      this.debug('Timer completed', {
        label,
        duration,
        ...metadata
      });
      return duration;
    };
  }

  /**
   * Log at trace level
   */
  trace(message, context = {}) {
    this._log('trace', message, context);
  }

  /**
   * Log at debug level
   */
  debug(message, context = {}) {
    this._log('debug', message, context);
  }

  /**
   * Log at info level
   */
  info(message, context = {}) {
    this._log('info', message, context);
  }

  /**
   * Log at warn level
   */
  warn(message, context = {}) {
    this._log('warn', message, context);
  }

  /**
   * Log at error level
   */
  error(message, context = {}) {
    // Extract error information if present
    if (context.error instanceof Error) {
      context = {
        ...context,
        error: {
          name: context.error.name,
          message: context.error.message,
          stack: context.error.stack,
          code: context.error.code
        }
      };
    }
    this._log('error', message, context);
  }

  /**
   * Log at fatal level
   */
  fatal(message, context = {}) {
    if (context.error instanceof Error) {
      context = {
        ...context,
        error: {
          name: context.error.name,
          message: context.error.message,
          stack: context.error.stack,
          code: context.error.code
        }
      };
    }
    this._log('fatal', message, context);
  }

  /**
   * Internal logging method
   *
   * @private
   */
  _log(level, message, context) {
    const levelValue = LOG_LEVELS[level];
    if (levelValue < this.level) {
      return; // Skip if below threshold
    }

    const logEntry = {
      ...this.baseContext,
      ...context,
      level,
      message,
      ...(this.timestamp && { timestamp: new Date().toISOString() })
    };

    const formatted = this._format(logEntry);
    this.destination.write(formatted + '\n');
  }

  /**
   * Format log entry based on configured format
   *
   * @private
   */
  _format(entry) {
    if (this.format === 'json') {
      return this.pretty
        ? JSON.stringify(entry, null, 2)
        : JSON.stringify(entry);
    }

    // Text format
    const { level, message, timestamp, ...context } = entry;
    const parts = [];

    if (timestamp) {
      parts.push(`[${timestamp}]`);
    }

    parts.push(level.toUpperCase().padEnd(5));
    parts.push(message);

    if (Object.keys(context).length > 0) {
      parts.push(JSON.stringify(context));
    }

    return parts.join(' ');
  }

  /**
   * Get current statistics
   *
   * @returns {Object} Logger statistics
   */
  getStats() {
    return {
      activeRequests: this.activeRequests.size,
      level: LEVEL_NAMES[this.level],
      format: this.format
    };
  }
}

/**
 * Create a singleton logger instance
 */
let defaultLogger = null;

function getLogger(options) {
  if (!defaultLogger || options) {
    defaultLogger = new Logger(options);
  }
  return defaultLogger;
}

/**
 * Configure the default logger
 */
function configure(options) {
  defaultLogger = new Logger(options);
  return defaultLogger;
}

module.exports = {
  Logger,
  getLogger,
  configure,
  LOG_LEVELS
};
