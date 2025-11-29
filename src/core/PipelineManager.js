/**
 * PipelineManager - Orchestrates plugin execution for file uploads
 *
 * Zero Dependency Philosophy:
 * - Uses native stream.pipeline for backpressure handling
 * - Manual error propagation and cleanup
 * - No external promise libraries
 *
 * Pipeline Flow:
 * Source Stream → [Validators] → [Transformers] → Storage
 *
 * On Error:
 * - Destroy all streams
 * - Call cleanup() on all executed plugins in reverse order
 * - Propagate error to caller
 */

const { pipeline } = require('stream/promises');
const { PassThrough } = require('stream');
const { getLogger } = require('../observability/Logger');

class PipelineManager {
  /**
   * @param {Object} options
   * @param {Array<Plugin>} options.validators - Validation plugins
   * @param {Array<Plugin>} options.transformers - Transformation plugins
   * @param {Plugin} options.storage - Storage plugin
   */
  constructor(options = {}) {
    this.validators = options.validators || [];
    this.transformers = options.transformers || [];
    this.storage = options.storage;

    if (!this.storage) {
      throw new Error('Storage plugin is required');
    }

    // Track executed plugins for cleanup
    this.executedPlugins = [];
  }

  /**
   * Execute the pipeline for a file upload
   *
   * @param {stream.Readable} sourceStream - The incoming file stream
   * @param {Object} fileInfo - File metadata
   * @param {string} fileInfo.fieldName - Form field name
   * @param {string} fileInfo.filename - Original filename
   * @param {string} fileInfo.mimeType - MIME type
   * @returns {Promise<Object>} - Upload result with metadata
   */
  async execute(sourceStream, fileInfo) {
    const context = {
      stream: sourceStream,
      fileInfo,
      metadata: {}
    };

    this.executedPlugins = [];

    // Track all streams for error handling
    const streams = new Set();
    let streamError = null;

    // Create deferred promise for stream errors
    let rejectStreamError;
    const streamErrorPromise = new Promise((_, reject) => {
      rejectStreamError = reject;
    });

    // Create error handler that captures stream errors
    const handleStreamError = (error) => {
      if (streamError) return; // Avoid multiple error handling
      streamError = error;
      // Destroy all tracked streams
      for (const stream of streams) {
        if (stream && typeof stream.destroy === 'function' && !stream.destroyed) {
          stream.destroy();
        }
      }
      rejectStreamError(error);
    };

    // Helper to track stream and attach error handler
    const trackStream = (stream) => {
      if (stream && !streams.has(stream)) {
        streams.add(stream);
        stream.once('error', handleStreamError);
      }
    };

    // Track source stream
    trackStream(sourceStream);

    try {
      // Phase 1: Validation
      // Validators can inspect metadata and first bytes without consuming stream
      for (const validator of this.validators) {
        const result = await validator.process(context);
        // Update context if validator returned a new one
        if (result && result.stream) {
          context.stream = result.stream;
          context.metadata = result.metadata || context.metadata;
        }
        this.executedPlugins.push(validator);

        // Track new stream if validator wrapped it
        trackStream(context.stream);
      }

      // Phase 2: Transformation
      // Transformers wrap the stream with transform streams
      for (const transformer of this.transformers) {
        context.stream = await this._wrapStream(context.stream, transformer, context);
        this.executedPlugins.push(transformer);

        // Track transformed stream
        trackStream(context.stream);
      }

      // Phase 3: Storage
      // Race between storage completion and stream errors
      const result = await Promise.race([
        this.storage.process(context),
        streamErrorPromise
      ]);
      this.executedPlugins.push(this.storage);

      return result;

    } catch (error) {
      await this._cleanup(context, error);
      throw error;
    }
  }

  /**
   * Wrap stream with transformer plugin
   *
   * This allows transformers to inject transform streams into the pipeline
   *
   * @param {stream.Readable} inputStream
   * @param {Plugin} transformer
   * @param {Object} context
   * @returns {Promise<stream.Readable>}
   */
  async _wrapStream(inputStream, transformer, context) {
    // Create a temporary context with the current stream
    const tempContext = { ...context, stream: inputStream };

    // Let transformer process (it should return modified context with new stream)
    const result = await transformer.process(tempContext);

    return result.stream;
  }

  /**
   * Cleanup executed plugins on error
   *
   * @param {Object} context
   * @param {Error} error
   */
  async _cleanup(context, error) {
    // Destroy the stream first
    if (context.stream && typeof context.stream.destroy === 'function') {
      context.stream.destroy();
    }

    // Call cleanup on executed plugins in reverse order
    const pluginsToCleanup = [...this.executedPlugins].reverse();

    for (const plugin of pluginsToCleanup) {
      try {
        await plugin.cleanup(context, error);
      } catch (cleanupError) {
        // Log but don't throw - we want to cleanup all plugins
        const logger = getLogger();
        logger.error('Cleanup error in plugin', {
          plugin: plugin.name,
          error: cleanupError.message
        });
      }
    }
  }

  /**
   * Initialize all plugins
   * @returns {Promise<void>}
   */
  async initialize() {
    const allPlugins = [
      ...this.validators,
      ...this.transformers,
      this.storage
    ];

    for (const plugin of allPlugins) {
      await plugin.initialize();
    }
  }

  /**
   * Shutdown all plugins
   * @returns {Promise<void>}
   */
  async shutdown() {
    const allPlugins = [
      ...this.validators,
      ...this.transformers,
      this.storage
    ];

    for (const plugin of allPlugins) {
      await plugin.shutdown();
    }
  }
}

/**
 * StreamMultiplexer - Split a stream to multiple destinations
 *
 * Zero Dependency: Uses native PassThrough streams to "tee" a stream
 *
 * Use case: Upload to both local storage AND S3 simultaneously
 *
 * Example:
 *   const [stream1, stream2] = StreamMultiplexer.split(sourceStream, 2);
 *   stream1.pipe(localStorage);
 *   stream2.pipe(s3Storage);
 */
class StreamMultiplexer {
  /**
   * Split a stream into N identical streams
   *
   * @param {stream.Readable} sourceStream
   * @param {number} count - Number of output streams
   * @returns {Array<stream.Readable>}
   */
  static split(sourceStream, count) {
    const outputs = [];

    for (let i = 0; i < count; i++) {
      const passThrough = new PassThrough();
      outputs.push(passThrough);
    }

    // Pipe to all outputs
    for (const output of outputs) {
      sourceStream.pipe(output);
    }

    // Handle errors
    sourceStream.on('error', (err) => {
      outputs.forEach(output => output.destroy(err));
    });

    return outputs;
  }

  /**
   * Execute multiple storage plugins in parallel
   *
   * @param {stream.Readable} sourceStream
   * @param {Array<Plugin>} storagePlugins
   * @param {Object} context
   * @returns {Promise<Array<Object>>} - Results from each storage
   */
  static async executeParallel(sourceStream, storagePlugins, context) {
    const streams = StreamMultiplexer.split(sourceStream, storagePlugins.length);

    const promises = storagePlugins.map((storage, index) => {
      const pluginContext = {
        ...context,
        stream: streams[index]
      };
      return storage.process(pluginContext);
    });

    return Promise.all(promises);
  }
}

module.exports = { PipelineManager, StreamMultiplexer };
