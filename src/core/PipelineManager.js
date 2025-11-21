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

    let rejected = false;
    let resolvePromise, rejectPromise;

    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    // Setup error handler for the stream
    const errorHandler = async (error) => {
      if (rejected) return; // Avoid multiple rejects
      rejected = true;
      await this._cleanup(context, error);
      rejectPromise(error);
    };

    // Listen for errors on source stream from the start
    if (sourceStream) {
      sourceStream.on('error', errorHandler);
    }

    (async () => {
      try {
        // Phase 1: Validation
        // Validators can inspect metadata and first bytes without consuming stream
        for (const validator of this.validators) {
          await validator.process(context);
          this.executedPlugins.push(validator);

          // If validator wrapped the stream, listen for errors
          if (context.stream && context.stream !== sourceStream) {
            context.stream.on('error', errorHandler);
          }
        }

        // Phase 2: Transformation
        // Transformers wrap the stream with transform streams
        for (const transformer of this.transformers) {
          context.stream = await this._wrapStream(context.stream, transformer, context);
          this.executedPlugins.push(transformer);

          // Listen for errors on transformed stream
          if (context.stream) {
            context.stream.on('error', errorHandler);
          }
        }

        // Phase 3: Storage
        // Storage plugin is the final destination
        const result = await this.storage.process(context);
        this.executedPlugins.push(this.storage);

        resolvePromise(result);

      } catch (error) {
        await errorHandler(error);
      }
    })();

    return promise;
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

    if (!result || !result.stream) {
      throw new Error(`Transformer ${transformer.name} did not return a valid stream`);
    }

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
        console.error(`Cleanup error in ${plugin.name}:`, cleanupError);
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
