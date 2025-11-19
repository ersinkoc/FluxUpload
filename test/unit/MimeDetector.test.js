/**
 * MimeDetector Tests
 */

const { TestRunner, assert } = require('../test-runner');
const MimeDetector = require('../../src/utils/MimeDetector');

const runner = new TestRunner();

runner.describe('MimeDetector', () => {
  const detector = new MimeDetector();

  runner.it('should detect JPEG images', () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const result = detector.detect(jpegBuffer);

    assert.ok(result, 'Should detect JPEG');
    assert.equal(result.mime, 'image/jpeg');
    assert.ok(result.extensions.includes('jpg'));
  });

  runner.it('should detect PNG images', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = detector.detect(pngBuffer);

    assert.ok(result, 'Should detect PNG');
    assert.equal(result.mime, 'image/png');
    assert.ok(result.extensions.includes('png'));
  });

  runner.it('should detect GIF images', () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
    const result = detector.detect(gifBuffer);

    assert.ok(result, 'Should detect GIF');
    assert.equal(result.mime, 'image/gif');
  });

  runner.it('should detect PDF documents', () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
    const result = detector.detect(pdfBuffer);

    assert.ok(result, 'Should detect PDF');
    assert.equal(result.mime, 'application/pdf');
  });

  runner.it('should detect ZIP archives', () => {
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // PK
    const result = detector.detect(zipBuffer);

    assert.ok(result, 'Should detect ZIP');
    assert.equal(result.mime, 'application/zip');
  });

  runner.it('should return null for unknown types', () => {
    const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const result = detector.detect(unknownBuffer);

    assert.equal(result, null);
  });

  runner.it('should handle empty buffers', () => {
    const emptyBuffer = Buffer.alloc(0);
    const result = detector.detect(emptyBuffer);

    assert.equal(result, null);
  });

  runner.it('should check isAllowed with exact match', () => {
    const allowed = detector.isAllowed('image/jpeg', ['image/jpeg', 'image/png']);
    assert.equal(allowed, true);
  });

  runner.it('should check isAllowed with wildcard', () => {
    const allowed = detector.isAllowed('image/jpeg', ['image/*']);
    assert.equal(allowed, true);
  });

  runner.it('should reject non-allowed types', () => {
    const allowed = detector.isAllowed('application/pdf', ['image/*']);
    assert.equal(allowed, false);
  });

  runner.it('should detect WebP images', () => {
    // WebP: RIFF at 0, WEBP at 8
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,  // RIFF
      0x00, 0x00, 0x00, 0x00,  // file size (placeholder)
      0x57, 0x45, 0x42, 0x50   // WEBP
    ]);
    const result = detector.detect(webpBuffer);

    assert.ok(result, 'Should detect WebP');
    assert.equal(result.mime, 'image/webp');
    assert.ok(result.extensions.includes('webp'));
  });

  runner.it('should detect BMP images', () => {
    const bmpBuffer = Buffer.from([0x42, 0x4D]); // BM
    const result = detector.detect(bmpBuffer);

    assert.ok(result, 'Should detect BMP');
    assert.equal(result.mime, 'image/bmp');
    assert.ok(result.extensions.includes('bmp'));
  });

  runner.it('should detect TIFF images (little-endian)', () => {
    const tiffBuffer = Buffer.from([0x49, 0x49, 0x2A, 0x00]);
    const result = detector.detect(tiffBuffer);

    assert.ok(result, 'Should detect TIFF little-endian');
    assert.equal(result.mime, 'image/tiff');
    assert.ok(result.extensions.includes('tif') || result.extensions.includes('tiff'));
  });

  runner.it('should detect TIFF images (big-endian)', () => {
    const tiffBuffer = Buffer.from([0x4D, 0x4D, 0x00, 0x2A]);
    const result = detector.detect(tiffBuffer);

    assert.ok(result, 'Should detect TIFF big-endian');
    assert.equal(result.mime, 'image/tiff');
  });

  runner.it('should detect ICO images', () => {
    const icoBuffer = Buffer.from([0x00, 0x00, 0x01, 0x00]);
    const result = detector.detect(icoBuffer);

    assert.ok(result, 'Should detect ICO');
    assert.equal(result.mime, 'image/x-icon');
    assert.ok(result.extensions.includes('ico'));
  });

  runner.it('should detect GIF87a variant', () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
    const result = detector.detect(gifBuffer);

    assert.ok(result, 'Should detect GIF87a');
    assert.equal(result.mime, 'image/gif');
  });

  runner.it('should detect DOCX documents', () => {
    const docxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // ZIP signature
    const result = detector.detect(docxBuffer);

    // DOCX has same signature as ZIP, so it could match either
    assert.ok(result, 'Should detect DOCX or ZIP');
    assert.ok(result.mime === 'application/zip' ||
              result.mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  runner.it('should detect XLSX documents', () => {
    const xlsxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    const result = detector.detect(xlsxBuffer);

    assert.ok(result, 'Should detect XLSX or ZIP');
  });

  runner.it('should detect MP3 audio (ID3v2)', () => {
    const mp3Buffer = Buffer.from([0x49, 0x44, 0x33]); // ID3
    const result = detector.detect(mp3Buffer);

    assert.ok(result, 'Should detect MP3');
    assert.equal(result.mime, 'audio/mpeg');
    assert.ok(result.extensions.includes('mp3'));
  });

  runner.it('should detect MP3 audio (MPEG-1 Layer 3)', () => {
    const mp3Buffer = Buffer.from([0xFF, 0xFB]);
    const result = detector.detect(mp3Buffer);

    assert.ok(result, 'Should detect MP3');
    assert.equal(result.mime, 'audio/mpeg');
  });

  runner.it('should detect WAV audio', () => {
    // WAV: RIFF at 0, WAVE at 8
    const wavBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,  // RIFF
      0x00, 0x00, 0x00, 0x00,  // file size
      0x57, 0x41, 0x56, 0x45   // WAVE
    ]);
    const result = detector.detect(wavBuffer);

    assert.ok(result, 'Should detect WAV');
    assert.equal(result.mime, 'audio/wav');
    assert.ok(result.extensions.includes('wav'));
  });

  runner.it('should detect MP4 video', () => {
    // MP4: ftyp at offset 4
    const mp4Buffer = Buffer.from([
      0x00, 0x00, 0x00, 0x18,  // box size
      0x66, 0x74, 0x79, 0x70,  // ftyp
      0x6D, 0x70, 0x34, 0x32   // mp42
    ]);
    const result = detector.detect(mp4Buffer);

    assert.ok(result, 'Should detect MP4');
    assert.equal(result.mime, 'video/mp4');
    assert.ok(result.extensions.includes('mp4') || result.extensions.includes('m4v'));
  });

  runner.it('should detect AVI video', () => {
    // AVI: RIFF at 0, AVI  at 8
    const aviBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,  // RIFF
      0x00, 0x00, 0x00, 0x00,  // file size
      0x41, 0x56, 0x49, 0x20   // AVI
    ]);
    const result = detector.detect(aviBuffer);

    assert.ok(result, 'Should detect AVI');
    assert.equal(result.mime, 'video/x-msvideo');
    assert.ok(result.extensions.includes('avi'));
  });

  runner.it('should detect RAR archives', () => {
    const rarBuffer = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07]); // Rar!
    const result = detector.detect(rarBuffer);

    assert.ok(result, 'Should detect RAR');
    assert.equal(result.mime, 'application/x-rar-compressed');
    assert.ok(result.extensions.includes('rar'));
  });

  runner.it('should detect GZIP archives', () => {
    const gzipBuffer = Buffer.from([0x1F, 0x8B]);
    const result = detector.detect(gzipBuffer);

    assert.ok(result, 'Should detect GZIP');
    assert.equal(result.mime, 'application/gzip');
    assert.ok(result.extensions.includes('gz'));
  });

  runner.it('should detect 7-Zip archives', () => {
    const sevenZipBuffer = Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]);
    const result = detector.detect(sevenZipBuffer);

    assert.ok(result, 'Should detect 7-Zip');
    assert.equal(result.mime, 'application/x-7z-compressed');
    assert.ok(result.extensions.includes('7z'));
  });

  runner.it('should detect empty ZIP archive', () => {
    const emptyZipBuffer = Buffer.from([0x50, 0x4B, 0x05, 0x06]);
    const result = detector.detect(emptyZipBuffer);

    assert.ok(result, 'Should detect empty ZIP');
    assert.equal(result.mime, 'application/zip');
  });

  runner.it('should detect spanned ZIP archive', () => {
    const spannedZipBuffer = Buffer.from([0x50, 0x4B, 0x07, 0x08]);
    const result = detector.detect(spannedZipBuffer);

    assert.ok(result, 'Should detect spanned ZIP');
    assert.equal(result.mime, 'application/zip');
  });

  runner.it('should handle buffer too small for signature', () => {
    const tinyBuffer = Buffer.from([0xFF]);
    const result = detector.detect(tinyBuffer);

    // Too small to match any signature
    assert.equal(result, null);
  });

  runner.it('should handle non-Buffer input', () => {
    const result = detector.detect('not a buffer');

    assert.equal(result, null);
  });

  runner.it('should handle null input', () => {
    const result = detector.detect(null);

    assert.equal(result, null);
  });

  runner.it('should fail WebP verification without WEBP marker', () => {
    // RIFF but not WEBP
    const notWebpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,  // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00   // Not WEBP
    ]);
    const result = detector.detect(notWebpBuffer);

    // Should not detect as WebP
    if (result) {
      assert.notEqual(result.mime, 'image/webp');
    }
  });

  runner.it('should fail WAV verification without WAVE marker', () => {
    // RIFF but not WAVE
    const notWavBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00   // Not WAVE
    ]);
    const result = detector.detect(notWavBuffer);

    // Should not detect as WAV
    if (result) {
      assert.notEqual(result.mime, 'audio/wav');
    }
  });

  runner.it('should fail AVI verification without AVI marker', () => {
    // RIFF but not AVI
    const notAviBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00   // Not AVI
    ]);
    const result = detector.detect(notAviBuffer);

    // Should not detect as AVI
    if (result) {
      assert.notEqual(result.mime, 'video/x-msvideo');
    }
  });

  runner.it('should handle isAllowed with null detected MIME', () => {
    const allowed = detector.isAllowed(null, ['image/*']);
    assert.equal(allowed, false);
  });

  runner.it('should handle isAllowed with undefined detected MIME', () => {
    const allowed = detector.isAllowed(undefined, ['image/*']);
    assert.equal(allowed, false);
  });

  runner.it('should handle isAllowed with empty allowed list', () => {
    const allowed = detector.isAllowed('image/jpeg', []);
    assert.equal(allowed, false);
  });

  runner.it('should handle isAllowed with multiple wildcards', () => {
    const allowed1 = detector.isAllowed('image/jpeg', ['video/*', 'audio/*', 'image/*']);
    assert.equal(allowed1, true);

    const allowed2 = detector.isAllowed('application/pdf', ['video/*', 'audio/*', 'image/*']);
    assert.equal(allowed2, false);
  });

  runner.it('should handle isAllowed with exact match taking precedence', () => {
    const allowed = detector.isAllowed('image/jpeg', ['image/jpeg', 'image/png', 'image/*']);
    assert.equal(allowed, true);
  });

  runner.it('should detect MP3 audio (MPEG-2 Layer 3)', () => {
    const mp3Buffer = Buffer.from([0xFF, 0xF2]);
    const result = detector.detect(mp3Buffer);

    assert.ok(result, 'Should detect MP3 MPEG-2');
    assert.equal(result.mime, 'audio/mpeg');
  });

  runner.it('should detect MP3 audio (MPEG-1 Layer 3 variant)', () => {
    const mp3Buffer = Buffer.from([0xFF, 0xF3]);
    const result = detector.detect(mp3Buffer);

    assert.ok(result, 'Should detect MP3 MPEG-1 variant');
    assert.equal(result.mime, 'audio/mpeg');
  });

  runner.it('should return first matching signature', () => {
    // ZIP has multiple signatures, should return first match
    const zipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
    const result = detector.detect(zipBuffer);

    assert.ok(result);
    // Should match either ZIP or Office format (both use same signature)
    assert.ok(result.mime.includes('zip') || result.mime.includes('officedocument'));
  });

  runner.it('should handle buffer with all zeros', () => {
    const zeroBuffer = Buffer.alloc(16, 0);
    const result = detector.detect(zeroBuffer);

    // ICO starts with 0x00, 0x00, 0x01, 0x00 so this won't match
    // (needs 0x01 at position 2)
    assert.equal(result, null);
  });

  runner.it('should have signatures property', () => {
    assert.ok(detector.signatures);
    assert.ok(Array.isArray(detector.signatures));
    assert.ok(detector.signatures.length > 0);
  });

  runner.it('should have required signature properties', () => {
    const sig = detector.signatures[0];
    assert.ok(sig.mime);
    assert.ok(sig.extensions);
    assert.ok(Array.isArray(sig.extensions));
    assert.ok(sig.signatures);
    assert.ok(Array.isArray(sig.signatures));
    assert.ok(typeof sig.offset === 'number');
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
