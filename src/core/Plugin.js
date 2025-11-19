/**
 * Plugin - Base class for all FluxUpload plugins
 *
 * All validators, transformers, and storage adapters extend this class.
 *
 * Philosophy: Plugins receive a context object containing the stream
 * and metadata, and return a modified context. This allows:
 * 1. Stream transformations (wrapping, piping)
 * 2. Metadata enrichment (adding hash, dimensions, etc.)
 * 3. Validation (throwing errors to abort)
 * 4. Side effects (logging, metrics)
 */

class Plugin {
  /**
   * @param {Object} config - Plugin-specific configuration
   */
  constructor(config = {}) {
    this.config = config;
    this.name = this.constructor.name;
  }

  /**
   * Process the upload context
   *
   * This is the main hook where plugins do their work.
   *
   * @param {Object} context - Upload context
   * @param {stream.Readable} context.stream - The file stream
   * @param {Object} context.fileInfo - File metadata
   * @param {string} context.fileInfo.fieldName - Form field name
   * @param {string} context.fileInfo.filename - Original filename
   * @param {string} context.fileInfo.mimeType - MIME type
   * @param {Object} context.metadata - Additional metadata (populated by plugins)
   * @returns {Promise<Object>} - Modified context
   */
  async process(context) {
    // Base implementation: pass through unchanged
    return context;
  }

  /**
   * Cleanup on error
   *
   * Called when upload fails or is aborted.
   * Use this to rollback partial operations.
   *
   * @param {Object} context - Upload context
   * @param {Error} error - The error that occurred
   * @returns {Promise<void>}
   */
  async cleanup(context, error) {
    // Base implementation: no-op
  }

  /**
   * Initialize plugin (called once on startup)
   * @returns {Promise<void>}
   */
  async initialize() {
    // Base implementation: no-op
  }

  /**
   * Shutdown plugin (called on app shutdown)
   * @returns {Promise<void>}
   */
  async shutdown() {
    // Base implementation: no-op
  }

  /**
   * Validate plugin configuration
   * @throws {Error} - If configuration is invalid
   */
  validateConfig() {
    // Base implementation: no-op
  }
}

module.exports = Plugin;
