/**
 * Progress Tracker for FluxUpload
 *
 * Tracks upload progress and emits events for real-time monitoring.
 * Useful for:
 * - Progress bars in UI
 * - Real-time dashboards
 * - WebSocket updates to clients
 * - Monitoring upload health
 *
 * @module observability/ProgressTracker
 */

const { EventEmitter } = require('events');
const { Transform } = require('stream');

/**
 * Transform stream that tracks bytes flowing through
 */
class ProgressStream extends Transform {
  constructor(options = {}) {
    super(options);

    this.fileId = options.fileId;
    this.filename = options.filename;
    this.totalBytes = options.totalBytes || 0;
    this.bytesProcessed = 0;
    this.startTime = Date.now();
    this.lastEmitTime = this.startTime;
    this.emitInterval = options.emitInterval || 500; // ms
    this.tracker = options.tracker;

    this.on('pipe', () => {
      this._emitProgress('started');
    });

    this.on('finish', () => {
      this._emitProgress('completed');
    });

    this.on('error', (error) => {
      this._emitProgress('error', { error });
    });
  }

  _transform(chunk, encoding, callback) {
    this.bytesProcessed += chunk.length;

    const now = Date.now();
    if (now - this.lastEmitTime >= this.emitInterval) {
      this._emitProgress('progress');
      this.lastEmitTime = now;
    }

    callback(null, chunk);
  }

  _emitProgress(event, extra = {}) {
    if (!this.tracker) return;

    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000; // seconds
    const percentage = this.totalBytes > 0
      ? Math.min(100, (this.bytesProcessed / this.totalBytes) * 100)
      : 0;

    const bytesPerSecond = elapsed > 0 ? this.bytesProcessed / elapsed : 0;
    const remainingBytes = this.totalBytes - this.bytesProcessed;
    const estimatedTimeRemaining = bytesPerSecond > 0
      ? remainingBytes / bytesPerSecond
      : 0;

    this.tracker.emit(event, {
      fileId: this.fileId,
      filename: this.filename,
      bytesProcessed: this.bytesProcessed,
      totalBytes: this.totalBytes,
      percentage: Math.round(percentage * 100) / 100,
      bytesPerSecond: Math.round(bytesPerSecond),
      elapsed: Math.round(elapsed * 100) / 100,
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining * 100) / 100,
      timestamp: new Date().toISOString(),
      ...extra
    });
  }
}

/**
 * Progress Tracker
 *
 * Manages progress tracking for multiple concurrent uploads
 */
class ProgressTracker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.emitInterval = options.emitInterval || 500;
    this.activeUploads = new Map();
    this.completedUploads = new Map();
    this.maxCompletedHistory = options.maxCompletedHistory || 100;
  }

  /**
   * Create a progress stream for a file upload
   *
   * @param {Object} options - Progress stream options
   * @param {string} options.fileId - Unique file identifier
   * @param {string} options.filename - Original filename
   * @param {number} [options.totalBytes=0] - Total bytes expected
   * @returns {ProgressStream} Transform stream that tracks progress
   */
  createProgressStream(options) {
    const fileId = options.fileId || this._generateFileId();

    const progressStream = new ProgressStream({
      ...options,
      fileId,
      tracker: this,
      emitInterval: this.emitInterval
    });

    this.activeUploads.set(fileId, {
      fileId,
      filename: options.filename,
      totalBytes: options.totalBytes || 0,
      startTime: Date.now(),
      status: 'active'
    });

    // Clean up when complete or error
    progressStream.on('finish', () => this._completeUpload(fileId, 'success'));
    progressStream.on('error', () => this._completeUpload(fileId, 'error'));

    return progressStream;
  }

  /**
   * Get progress for a specific file
   *
   * @param {string} fileId - File identifier
   * @returns {Object|null} Progress information
   */
  getProgress(fileId) {
    return this.activeUploads.get(fileId) || this.completedUploads.get(fileId);
  }

  /**
   * Get all active uploads
   *
   * @returns {Array} Array of active upload information
   */
  getActiveUploads() {
    return Array.from(this.activeUploads.values());
  }

  /**
   * Get recently completed uploads
   *
   * @returns {Array} Array of completed upload information
   */
  getCompletedUploads() {
    return Array.from(this.completedUploads.values());
  }

  /**
   * Get overall statistics
   *
   * @returns {Object} Statistics about all uploads
   */
  getStatistics() {
    const active = this.getActiveUploads();
    const completed = this.getCompletedUploads();

    const totalBytesActive = active.reduce((sum, u) => sum + (u.totalBytes || 0), 0);
    const totalBytesCompleted = completed.reduce((sum, u) => sum + (u.bytesProcessed || 0), 0);

    const successCount = completed.filter(u => u.status === 'success').length;
    const errorCount = completed.filter(u => u.status === 'error').length;

    return {
      active: {
        count: active.length,
        totalBytes: totalBytesActive
      },
      completed: {
        count: completed.length,
        successCount,
        errorCount,
        totalBytes: totalBytesCompleted,
        successRate: completed.length > 0
          ? Math.round((successCount / completed.length) * 100)
          : 0
      },
      overall: {
        totalUploads: active.length + completed.length,
        totalBytes: totalBytesActive + totalBytesCompleted
      }
    };
  }

  /**
   * Clear completed upload history
   */
  clearHistory() {
    this.completedUploads.clear();
  }

  /**
   * Internal: Complete an upload
   *
   * @private
   */
  _completeUpload(fileId, status) {
    const upload = this.activeUploads.get(fileId);
    if (!upload) return;

    upload.status = status;
    upload.endTime = Date.now();
    upload.duration = upload.endTime - upload.startTime;

    this.activeUploads.delete(fileId);
    this.completedUploads.set(fileId, upload);

    // Limit history size
    if (this.completedUploads.size > this.maxCompletedHistory) {
      const firstKey = this.completedUploads.keys().next().value;
      this.completedUploads.delete(firstKey);
    }
  }

  /**
   * Internal: Generate unique file ID
   *
   * @private
   */
  _generateFileId() {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = {
  ProgressTracker,
  ProgressStream
};
