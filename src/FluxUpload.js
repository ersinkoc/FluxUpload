/**
 * FluxUpload - Zero-dependency file upload handler for Node.js
 *
 * Main API class that orchestrates:
 * - Multipart parsing
 * - Plugin pipeline execution
 * - Error handling and cleanup
 *
 * Usage:
 *   const uploader = new FluxUpload({ ...config });
 *   await uploader.handle(req);
 */

const MultipartParser = require('./core/MultipartParser');
const { PipelineManager, StreamMultiplexer } = require('./core/PipelineManager');

class FluxUpload {
  /**
   * @param {Object} config
   * @param {Object} config.limits - Upload limits
   * @param {number} config.limits.fileSize - Max file size
   * @param {number} config.limits.files - Max number of files
   * @param {number} config.limits.fields - Max number of fields
   * @param {Array<Plugin>} config.validators - Validation plugins
   * @param {Array<Plugin>} config.transformers - Transformation plugins
   * @param {Plugin} config.storage - Storage plugin (or array for multiple)
   * @param {Function} config.onField - Callback for form fields
   * @param {Function} config.onFile - Callback for each file
   * @param {Function} config.onError - Error callback
   * @param {Function} config.onFinish - Completion callback
   */
  constructor(config = {}) {
    this.config = config;

    // Limits
    this.limits = {
      fileSize: 100 * 1024 * 1024, // 100MB
      files: 10,
      fields: 100,
      fieldSize: 1024 * 1024, // 1MB
      fieldNameSize: 100,
      ...config.limits
    };

    // Plugins
    this.validators = config.validators || [];
    this.transformers = config.transformers || [];
    this.storage = config.storage;

    // Callbacks
    this.onField = config.onField || null;
    this.onFile = config.onFile || null;
    this.onError = config.onError || null;
    this.onFinish = config.onFinish || null;

    // Results
    this.fields = {};
    this.files = [];
    this.errors = [];

    if (!this.storage) {
      throw new Error('Storage plugin is required');
    }

    // Initialize pipeline manager
    this._initializePipeline();
  }

  /**
   * Initialize pipeline manager
   */
  _initializePipeline() {
    // Support multiple storage targets
    const storageArray = Array.isArray(this.storage) ? this.storage : [this.storage];

    // For single storage, use normal pipeline
    if (storageArray.length === 1) {
      this.pipelineManager = new PipelineManager({
        validators: this.validators,
        transformers: this.transformers,
        storage: storageArray[0]
      });
    } else {
      // Multiple storage: use first as primary
      this.pipelineManager = new PipelineManager({
        validators: this.validators,
        transformers: this.transformers,
        storage: storageArray[0]
      });
      this.additionalStorage = storageArray.slice(1);
    }
  }

  /**
   * Initialize all plugins
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.pipelineManager.initialize();

    if (this.additionalStorage) {
      for (const storage of this.additionalStorage) {
        await storage.initialize();
      }
    }
  }

  /**
   * Shutdown all plugins
   * @returns {Promise<void>}
   */
  async shutdown() {
    await this.pipelineManager.shutdown();

    if (this.additionalStorage) {
      for (const storage of this.additionalStorage) {
        await storage.shutdown();
      }
    }
  }

  /**
   * Handle upload from HTTP request
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @returns {Promise<Object>} - { fields, files }
   */
  async handle(req) {
    // Reset state
    this.fields = {};
    this.files = [];
    this.errors = [];
    this.pendingFileHandlers = []; // Track async file operations

    // Extract boundary from Content-Type header
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      throw new Error('Content-Type must be multipart/form-data');
    }

    const boundary = MultipartParser.getBoundary(contentType);

    // Create parser
    const parser = new MultipartParser({
      boundary,
      limits: this.limits
    });

    // Handle fields
    parser.on('field', (name, value) => {
      this._handleField(name, value);
    });

    // Handle files
    parser.on('file', (fileInfo, stream) => {
      // Setup error handler immediately to catch stream errors
      stream.on('error', (error) => {
        this.errors.push(error);
        if (this.onError) {
          this.onError(error);
        }
      });

      // Track this async operation
      const filePromise = this._handleFile(fileInfo, stream).catch(error => {
        this.errors.push(error);
        if (this.onError) {
          this.onError(error);
        }
      });
      this.pendingFileHandlers.push(filePromise);
    });

    // Handle errors
    parser.on('error', (error) => {
      this.errors.push(error);
      if (this.onError) {
        this.onError(error);
      }
    });

    // Wait for parsing to complete
    return new Promise((resolve, reject) => {
      parser.on('finish', async () => {
        // Wait for all file handlers to complete
        try {
          await Promise.all(this.pendingFileHandlers);
        } catch (error) {
          // Errors already handled above
        }

        if (this.errors.length > 0) {
          reject(this.errors[0]);
        } else {
          if (this.onFinish) {
            this.onFinish({ fields: this.fields, files: this.files });
          }
          resolve({
            fields: this.fields,
            files: this.files
          });
        }
      });

      parser.on('error', (error) => {
        reject(error);
      });

      // Pipe request to parser
      req.pipe(parser);
    });
  }

  /**
   * Handle form field
   *
   * @param {string} name - Field name
   * @param {string} value - Field value
   */
  _handleField(name, value) {
    // Support multiple values for same field name
    if (this.fields[name]) {
      if (Array.isArray(this.fields[name])) {
        this.fields[name].push(value);
      } else {
        this.fields[name] = [this.fields[name], value];
      }
    } else {
      this.fields[name] = value;
    }

    // Call user callback
    if (this.onField) {
      this.onField(name, value);
    }
  }

  /**
   * Handle file upload
   *
   * @param {Object} fileInfo - File metadata
   * @param {stream.Readable} stream - File stream
   */
  async _handleFile(fileInfo, stream) {
    try {
      let result;

      // Check if multiple storage targets
      if (this.additionalStorage && this.additionalStorage.length > 0) {
        // Upload to multiple targets simultaneously
        const allStorage = [this.pipelineManager.storage, ...this.additionalStorage];
        const results = await StreamMultiplexer.executeParallel(
          stream,
          allStorage,
          { fileInfo, metadata: {} }
        );
        result = results[0]; // Primary storage result
        result.additionalStorage = results.slice(1);
      } else {
        // Single storage target
        result = await this.pipelineManager.execute(stream, fileInfo);
      }

      // Add to files array
      this.files.push({
        fieldName: fileInfo.fieldName,
        filename: fileInfo.filename,
        mimeType: fileInfo.mimeType,
        ...result.metadata,
        ...result.storage
      });

      // Call user callback
      if (this.onFile) {
        this.onFile(result);
      }

    } catch (error) {
      this.errors.push(error);

      // Destroy stream
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy(error);
      }

      if (this.onError) {
        this.onError(error);
      }

      throw error;
    }
  }

  /**
   * Parse single file from buffer (for testing/simple use cases)
   *
   * @param {Buffer} buffer - File buffer
   * @param {Object} fileInfo - File metadata
   * @returns {Promise<Object>}
   */
  async parseBuffer(buffer, fileInfo) {
    const { Readable } = require('stream');

    // Create stream from buffer
    const stream = Readable.from(buffer);

    // Execute pipeline
    const result = await this.pipelineManager.execute(stream, fileInfo);

    return result;
  }
}

module.exports = FluxUpload;
