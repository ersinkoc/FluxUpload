/**
 * LocalStorage - Store files on local filesystem
 *
 * Zero Dependency: Uses only native fs and path modules
 *
 * Features:
 * - Atomic writes (write to temp, then rename)
 * - Automatic directory creation
 * - Cleanup on failure
 * - Configurable naming strategies
 *
 * Atomicity:
 * 1. Write to temp file (filename.tmp)
 * 2. If successful, rename to final name (atomic operation)
 * 3. If failed, delete temp file
 *
 * This prevents partial files from being visible to the application.
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const Plugin = require('../core/Plugin');
const FileNaming = require('../utils/FileNaming');
const { getLogger } = require('../observability/Logger');

class LocalStorage extends Plugin {
  /**
   * @param {Object} config
   * @param {string} config.destination - Base upload directory
   * @param {string|Object} config.naming - Naming strategy or FileNaming instance
   * @param {boolean} config.createDirectories - Auto-create dirs (default: true)
   * @param {number} config.fileMode - File permissions (default: 0o644)
   * @param {number} config.dirMode - Directory permissions (default: 0o755)
   */
  constructor(config) {
    super(config);

    if (!config.destination) {
      throw new Error('destination is required for LocalStorage');
    }

    this.destination = path.resolve(config.destination);
    this.createDirectories = config.createDirectories !== false;
    this.fileMode = config.fileMode || 0o644;
    this.dirMode = config.dirMode || 0o755;

    // Setup file naming
    if (config.naming instanceof FileNaming) {
      this.naming = config.naming;
    } else if (typeof config.naming === 'string') {
      this.naming = new FileNaming({ strategy: config.naming });
    } else if (typeof config.naming === 'object') {
      this.naming = new FileNaming(config.naming);
    } else {
      this.naming = new FileNaming({ strategy: 'uuid' });
    }

    // Track temp files for cleanup
    this.tempFiles = new Map();
  }

  async initialize() {
    // Create destination directory if needed
    if (this.createDirectories) {
      await this._ensureDirectory(this.destination);
    }
  }

  async process(context) {
    // Generate filename
    const filename = this.naming.generate(
      context.fileInfo.filename,
      context.metadata
    );

    // Full paths
    const finalPath = path.join(this.destination, filename);
    const tempPath = `${finalPath}.tmp`;

    // Track temp file
    this.tempFiles.set(context, tempPath);

    try {
      // Ensure directory exists
      if (this.createDirectories) {
        await this._ensureDirectory(path.dirname(finalPath));
      }

      // Create write stream to temp file
      const writeStream = fs.createWriteStream(tempPath, {
        mode: this.fileMode
      });

      // Pipe upload stream to file
      await pipeline(context.stream, writeStream);

      // Atomic rename: temp -> final
      // This is an atomic operation on most filesystems
      await fs.promises.rename(tempPath, finalPath);

      // Remove from temp tracking
      this.tempFiles.delete(context);

      // Get file stats
      const stats = await fs.promises.stat(finalPath);

      // Return result
      return {
        ...context,
        storage: {
          driver: 'local',
          path: finalPath,
          filename: filename,
          size: stats.size,
          url: this._generateUrl(filename)
        }
      };

    } catch (error) {
      // Cleanup will be called automatically by PipelineManager
      throw error;
    }
  }

  async cleanup(context, error) {
    // Get temp file path
    const tempPath = this.tempFiles.get(context);
    if (!tempPath) return;

    // Delete temp file if it exists
    try {
      await fs.promises.unlink(tempPath);
    } catch (err) {
      // Ignore errors (file might not exist)
      if (err.code !== 'ENOENT') {
        const logger = getLogger();
        logger.error('Failed to cleanup temp file', { path: tempPath, error: err.message });
      }
    }

    this.tempFiles.delete(context);
  }

  /**
   * Ensure directory exists, create if needed
   *
   * Zero Dependency: We implement recursive directory creation
   * (fs.mkdir with recursive option was added in Node.js 10.12)
   *
   * @param {string} dir - Directory path
   */
  async _ensureDirectory(dir) {
    try {
      await fs.promises.access(dir, fs.constants.W_OK);
      // Directory exists and is writable
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Directory doesn't exist - create it
        await fs.promises.mkdir(dir, {
          recursive: true,
          mode: this.dirMode
        });
      } else {
        // Other error (permissions, etc.)
        throw err;
      }
    }
  }

  /**
   * Generate URL for uploaded file
   *
   * Override this method to generate URLs for your application
   *
   * @param {string} filename
   * @returns {string}
   */
  _generateUrl(filename) {
    // Default: relative path
    // In a real application, this might return a full URL
    return `/uploads/${filename}`;
  }

  /**
   * Delete a file
   *
   * @param {string} filename - Filename to delete
   * @returns {Promise<void>}
   */
  async delete(filename) {
    const filePath = path.join(this.destination, filename);

    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Check if file exists
   *
   * @param {string} filename
   * @returns {Promise<boolean>}
   */
  async exists(filename) {
    const filePath = path.join(this.destination, filename);

    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   *
   * @param {string} filename
   * @returns {Promise<Object>}
   */
  async getMetadata(filename) {
    const filePath = path.join(this.destination, filename);
    const stats = await fs.promises.stat(filePath);

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      path: filePath
    };
  }
}

module.exports = LocalStorage;
