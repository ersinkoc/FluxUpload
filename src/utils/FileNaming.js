/**
 * FileNaming - Generate safe, unique filenames
 *
 * Zero Dependency: Uses native crypto for UUID generation
 *
 * Strategies:
 * - original: Keep original filename (sanitized)
 * - uuid: Generate random UUID v4
 * - timestamp: Use timestamp + random suffix
 * - hash: Use file hash (requires hash in metadata)
 * - slugify: Sanitize and normalize Unicode
 *
 * Security:
 * - Remove path traversal attempts (../, ..\)
 * - Remove null bytes
 * - Sanitize Unicode (normalization)
 * - Limit length to prevent filesystem issues
 */

const crypto = require('crypto');
const path = require('path');

class FileNaming {
  /**
   * @param {Object} config
   * @param {string} config.strategy - Naming strategy
   * @param {string} config.prefix - Optional prefix
   * @param {string} config.suffix - Optional suffix
   * @param {boolean} config.preserveExtension - Keep original extension (default: true)
   * @param {number} config.maxLength - Max filename length (default: 255)
   */
  constructor(config = {}) {
    this.strategy = config.strategy || 'uuid';
    this.prefix = config.prefix || '';
    this.suffix = config.suffix || '';
    this.preserveExtension = config.preserveExtension !== false;
    this.maxLength = config.maxLength || 255;
  }

  /**
   * Generate filename
   *
   * @param {string} originalFilename - Original filename from upload
   * @param {Object} metadata - File metadata (may include hash, etc.)
   * @returns {string} - Generated filename
   */
  generate(originalFilename, metadata = {}) {
    let baseName;
    let extension = '';

    // Sanitize the full path first to handle path separators
    const sanitizedPath = this._sanitize(originalFilename);

    // Extract extension if preserving
    if (this.preserveExtension && sanitizedPath) {
      extension = path.extname(sanitizedPath);
      const nameWithoutExt = path.basename(sanitizedPath, extension);
      baseName = nameWithoutExt;
    } else {
      baseName = path.basename(sanitizedPath);
    }

    // Generate name based on strategy
    let generatedName;

    switch (this.strategy) {
      case 'original':
        generatedName = baseName || 'unnamed'; // Already sanitized above
        break;

      case 'uuid':
        generatedName = this._generateUUID();
        break;

      case 'timestamp':
        generatedName = this._generateTimestamp();
        break;

      case 'hash':
        if (!metadata.hash) {
          throw new Error('Hash strategy requires hash in metadata');
        }
        generatedName = metadata.hash;
        break;

      case 'slugify':
        generatedName = this._slugify(baseName);
        break;

      default:
        throw new Error(`Unknown naming strategy: ${this.strategy}`);
    }

    // Add prefix and suffix
    const finalName = `${this.prefix}${generatedName}${this.suffix}${extension}`;

    // Enforce max length
    return this._truncate(finalName);
  }

  /**
   * Sanitize filename for filesystem safety
   *
   * @param {string} filename
   * @returns {string}
   */
  _sanitize(filename) {
    if (!filename) return 'unnamed';

    // Remove path separators and dangerous characters
    let safe = filename
      .replace(/[\/\\]/g, '_')         // Path separators
      .replace(/\.\./g, '')            // Path traversal
      .replace(/[\x00-\x1f\x7f]/g, '') // Control characters
      .replace(/[<>:"|?*]/g, '_')      // Windows reserved characters
      .trim();

    // Remove leading/trailing dots (hidden files, or just dots)
    safe = safe.replace(/^\.+|\.+$/g, '');

    // Ensure not empty
    return safe || 'unnamed';
  }

  /**
   * Generate UUID v4
   *
   * Zero Dependency: Manual UUID generation using crypto.randomBytes
   *
   * @returns {string}
   */
  _generateUUID() {
    // Generate 16 random bytes
    const bytes = crypto.randomBytes(16);

    // Set version (4) and variant bits per RFC 4122
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

    // Format as UUID string
    const hex = bytes.toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32)
    ].join('-');
  }

  /**
   * Generate timestamp-based name
   *
   * Format: YYYYMMDD-HHMMSS-RANDOM
   *
   * @returns {string}
   */
  _generateTimestamp() {
    const now = new Date();
    const datePart = now.toISOString().replace(/[-:]/g, '').split('.')[0];
    const randomPart = crypto.randomBytes(4).toString('hex');

    return `${datePart}-${randomPart}`;
  }

  /**
   * Slugify filename (URL-safe, readable)
   *
   * @param {string} filename
   * @returns {string}
   */
  _slugify(filename) {
    if (!filename) return 'unnamed';

    // Normalize Unicode (convert é to e, etc.)
    let slug = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Convert to lowercase
    slug = slug.toLowerCase();

    // Replace spaces and underscores with hyphens
    slug = slug.replace(/[\s_]+/g, '-');

    // Remove non-alphanumeric characters (keep hyphens and dots)
    slug = slug.replace(/[^a-z0-9.-]/g, '');

    // Remove multiple consecutive hyphens
    slug = slug.replace(/-{2,}/g, '-');

    // Remove leading/trailing hyphens
    slug = slug.replace(/^-+|-+$/g, '');

    return slug || 'unnamed';
  }

  /**
   * Truncate filename to max length while preserving extension
   *
   * @param {string} filename
   * @returns {string}
   */
  _truncate(filename) {
    if (filename.length <= this.maxLength) {
      return filename;
    }

    const ext = path.extname(filename);
    const nameWithoutExt = ext.length > 0 ? filename.slice(0, -ext.length) : filename;

    // If extension alone exceeds max length, truncate extension too
    if (ext.length >= this.maxLength) {
      return ext.slice(0, this.maxLength);
    }

    // Truncate name part, keep extension
    const maxNameLength = this.maxLength - ext.length;
    return nameWithoutExt.slice(0, Math.max(1, maxNameLength)) + ext;
  }

  /**
   * Check if filename is safe
   *
   * @param {string} filename
   * @returns {boolean}
   */
  static isSafe(filename) {
    if (!filename || filename.length === 0) return false;

    // Check for path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }

    // Check for control characters
    if (/[\x00-\x1f\x7f]/.test(filename)) {
      return false;
    }

    // Check for Windows reserved names
    const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                      'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2',
                      'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

    const nameWithoutExt = path.basename(filename, path.extname(filename));
    if (reserved.includes(nameWithoutExt.toUpperCase())) {
      return false;
    }

    return true;
  }
}

module.exports = FileNaming;
