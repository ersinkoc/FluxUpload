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
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
