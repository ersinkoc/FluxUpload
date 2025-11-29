/**
 * MimeDetector - Detect file types from magic bytes (file signatures)
 *
 * Zero Dependency: We maintain our own database of file signatures
 * instead of using libraries like 'file-type'.
 *
 * Security: NEVER trust file extensions. Always verify the actual
 * binary content to prevent malicious file uploads.
 *
 * References:
 * - https://en.wikipedia.org/wiki/List_of_file_signatures
 * - https://www.garykessler.net/library/file_sigs.html
 */

class MimeDetector {
  constructor() {
    // Database of magic bytes
    // Format: { mime: string, extensions: string[], signature: Buffer[], offset: number }
    this.signatures = [
      // Images
      {
        mime: 'image/jpeg',
        extensions: ['jpg', 'jpeg'],
        signatures: [
          Buffer.from([0xFF, 0xD8, 0xFF])
        ],
        offset: 0
      },
      {
        mime: 'image/png',
        extensions: ['png'],
        signatures: [
          Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        ],
        offset: 0
      },
      {
        mime: 'image/gif',
        extensions: ['gif'],
        signatures: [
          Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
          Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])  // GIF89a
        ],
        offset: 0
      },
      {
        mime: 'image/webp',
        extensions: ['webp'],
        signatures: [
          Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF (check WEBP at offset 8)
        ],
        offset: 0,
        verify: (buffer) => {
          // WebP files have "WEBP" at offset 8
          return buffer.length >= 12 &&
                 buffer[8] === 0x57 &&
                 buffer[9] === 0x45 &&
                 buffer[10] === 0x42 &&
                 buffer[11] === 0x50;
        }
      },
      {
        mime: 'image/bmp',
        extensions: ['bmp'],
        signatures: [
          Buffer.from([0x42, 0x4D]) // BM
        ],
        offset: 0
      },
      {
        mime: 'image/tiff',
        extensions: ['tif', 'tiff'],
        signatures: [
          Buffer.from([0x49, 0x49, 0x2A, 0x00]), // Little-endian
          Buffer.from([0x4D, 0x4D, 0x00, 0x2A])  // Big-endian
        ],
        offset: 0
      },
      {
        mime: 'image/x-icon',
        extensions: ['ico'],
        signatures: [
          Buffer.from([0x00, 0x00, 0x01, 0x00])
        ],
        offset: 0
      },

      // Documents
      {
        mime: 'application/pdf',
        extensions: ['pdf'],
        signatures: [
          Buffer.from([0x25, 0x50, 0x44, 0x46]) // %PDF
        ],
        offset: 0
      },
      {
        mime: 'application/zip',
        extensions: ['zip'],
        signatures: [
          Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK
          Buffer.from([0x50, 0x4B, 0x05, 0x06]), // Empty archive
          Buffer.from([0x50, 0x4B, 0x07, 0x08])  // Spanned archive
        ],
        offset: 0
      },
      {
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extensions: ['docx'],
        signatures: [
          Buffer.from([0x50, 0x4B, 0x03, 0x04]) // ZIP-based
        ],
        offset: 0,
        verify: (buffer) => {
          // DOCX files contain "[Content_Types].xml" or "word/" in the ZIP
          // Check for common markers in the first 1KB of the file
          const str = buffer.toString('utf8', 0, Math.min(buffer.length, 2000));
          return str.includes('[Content_Types].xml') ||
                 str.includes('word/') ||
                 str.includes('word\\');
        }
      },
      {
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extensions: ['xlsx'],
        signatures: [
          Buffer.from([0x50, 0x4B, 0x03, 0x04])
        ],
        offset: 0,
        verify: (buffer) => {
          // XLSX files contain "[Content_Types].xml" or "xl/" in the ZIP
          const str = buffer.toString('utf8', 0, Math.min(buffer.length, 2000));
          return str.includes('[Content_Types].xml') ||
                 str.includes('xl/') ||
                 str.includes('xl\\');
        }
      },

      // Audio
      {
        mime: 'audio/mpeg',
        extensions: ['mp3'],
        signatures: [
          Buffer.from([0xFF, 0xFB]), // MPEG-1 Layer 3
          Buffer.from([0xFF, 0xF3]), // MPEG-1 Layer 3
          Buffer.from([0xFF, 0xF2]), // MPEG-2 Layer 3
          Buffer.from([0x49, 0x44, 0x33])  // ID3v2
        ],
        offset: 0
      },
      {
        mime: 'audio/wav',
        extensions: ['wav'],
        signatures: [
          Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF
        ],
        offset: 0,
        verify: (buffer) => {
          // WAV files have "WAVE" at offset 8
          return buffer.length >= 12 &&
                 buffer[8] === 0x57 &&
                 buffer[9] === 0x41 &&
                 buffer[10] === 0x56 &&
                 buffer[11] === 0x45;
        }
      },

      // Video
      {
        mime: 'video/mp4',
        extensions: ['mp4', 'm4v'],
        signatures: [
          Buffer.from([0x66, 0x74, 0x79, 0x70]) // ftyp (at offset 4)
        ],
        offset: 4
      },
      {
        mime: 'video/x-msvideo',
        extensions: ['avi'],
        signatures: [
          Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF
        ],
        offset: 0,
        verify: (buffer) => {
          return buffer.length >= 12 &&
                 buffer[8] === 0x41 &&
                 buffer[9] === 0x56 &&
                 buffer[10] === 0x49 &&
                 buffer[11] === 0x20; // "AVI "
        }
      },

      // Archives
      {
        mime: 'application/x-rar-compressed',
        extensions: ['rar'],
        signatures: [
          Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07]) // Rar!
        ],
        offset: 0
      },
      {
        mime: 'application/gzip',
        extensions: ['gz'],
        signatures: [
          Buffer.from([0x1F, 0x8B])
        ],
        offset: 0
      },
      {
        mime: 'application/x-7z-compressed',
        extensions: ['7z'],
        signatures: [
          Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])
        ],
        offset: 0
      }
    ];
  }

  /**
   * Detect MIME type from buffer
   *
   * @param {Buffer} buffer - First bytes of file (at least 16 bytes recommended)
   * @returns {Object|null} - { mime, extensions } or null if unknown
   */
  detect(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return null;
    }

    for (const entry of this.signatures) {
      for (const signature of entry.signatures) {
        if (this._matchSignature(buffer, signature, entry.offset)) {
          // Additional verification if needed
          if (entry.verify && !entry.verify(buffer)) {
            continue;
          }

          return {
            mime: entry.mime,
            extensions: entry.extensions
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if buffer matches signature at offset
   *
   * @param {Buffer} buffer
   * @param {Buffer} signature
   * @param {number} offset
   * @returns {boolean}
   */
  _matchSignature(buffer, signature, offset) {
    if (buffer.length < offset + signature.length) {
      return false;
    }

    for (let i = 0; i < signature.length; i++) {
      if (buffer[offset + i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if detected MIME type is in allowed list
   *
   * @param {string} detectedMime - Detected MIME type
   * @param {Array<string>} allowedMimes - Allowed MIME types (supports wildcards)
   * @returns {boolean}
   */
  isAllowed(detectedMime, allowedMimes) {
    if (!detectedMime) return false;

    for (const allowed of allowedMimes) {
      if (allowed === detectedMime) {
        return true;
      }

      // Support wildcards: image/* matches image/jpeg, image/png, etc.
      if (allowed.endsWith('/*')) {
        const prefix = allowed.slice(0, -2);
        if (detectedMime.startsWith(prefix + '/')) {
          return true;
        }
      }
    }

    return false;
  }
}

module.exports = MimeDetector;
