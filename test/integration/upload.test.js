/**
 * Integration Tests - Full Upload Flow
 */

const { TestRunner, assert } = require('../test-runner');
const http = require('http');
const fs = require('fs');
const path = require('path');
const FluxUpload = require('../../src');
const { LocalStorage, QuotaLimiter, MagicByteDetector, StreamHasher } = require('../../src');

const runner = new TestRunner();

// Test upload directory
const TEST_UPLOAD_DIR = path.join(__dirname, '../tmp/uploads');

// Cleanup before tests
if (fs.existsSync(TEST_UPLOAD_DIR)) {
  fs.rmSync(TEST_UPLOAD_DIR, { recursive: true });
}
fs.mkdirSync(TEST_UPLOAD_DIR, { recursive: true });

runner.describe('Upload Integration Tests', () => {
  runner.it('should upload a simple file', async () => {
    const uploader = new FluxUpload({
      storage: new LocalStorage({
        destination: TEST_UPLOAD_DIR,
        naming: 'original'
      })
    });

    await uploader.initialize();

    // Create mock request
    const boundary = 'TestBoundary123';
    const fileContent = 'Hello, World!';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const mockReq = createMockRequest(body, boundary);
    const result = await uploader.handle(mockReq);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].filename, 'test.txt');

    // Verify file exists
    const uploadedPath = path.join(TEST_UPLOAD_DIR, 'test.txt');
    assert.ok(fs.existsSync(uploadedPath));

    // Verify content
    const content = fs.readFileSync(uploadedPath, 'utf8');
    assert.equal(content, fileContent);
  });

  runner.it('should upload multiple files', async () => {
    const uploader = new FluxUpload({
      storage: new LocalStorage({
        destination: TEST_UPLOAD_DIR,
        naming: 'uuid'
      })
    });

    await uploader.initialize();

    const boundary = 'TestBoundary456';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file1"; filename="file1.txt"',
      'Content-Type: text/plain',
      '',
      'Content 1',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file2"; filename="file2.txt"',
      'Content-Type: text/plain',
      '',
      'Content 2',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const mockReq = createMockRequest(body, boundary);
    const result = await uploader.handle(mockReq);

    assert.equal(result.files.length, 2);
  });

  runner.it('should handle form fields', async () => {
    const uploader = new FluxUpload({
      storage: new LocalStorage({
        destination: TEST_UPLOAD_DIR,
        naming: 'uuid'
      })
    });

    await uploader.initialize();

    const boundary = 'TestBoundary789';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="username"',
      '',
      'john_doe',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      'File content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const mockReq = createMockRequest(body, boundary);
    const result = await uploader.handle(mockReq);

    assert.equal(result.fields.username, 'john_doe');
    assert.equal(result.files.length, 1);
  });

  runner.it('should enforce file size limits', async () => {
    const uploader = new FluxUpload({
      validators: [
        new QuotaLimiter({ maxFileSize: 10 }) // 10 bytes
      ],
      storage: new LocalStorage({
        destination: TEST_UPLOAD_DIR,
        naming: 'uuid'
      })
    });

    await uploader.initialize();

    const boundary = 'TestBoundaryLimit';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="large.txt"',
      'Content-Type: text/plain',
      '',
      'This is more than 10 bytes of content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const mockReq = createMockRequest(body, boundary);

    await assert.rejects(
      uploader.handle(mockReq),
      'limit'
    );
  });

  runner.it('should calculate file hash', async () => {
    const uploader = new FluxUpload({
      transformers: [
        new StreamHasher({ algorithm: 'sha256' })
      ],
      storage: new LocalStorage({
        destination: TEST_UPLOAD_DIR,
        naming: 'uuid'
      })
    });

    await uploader.initialize();

    const boundary = 'TestBoundaryHash';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      'Test content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const mockReq = createMockRequest(body, boundary);
    const result = await uploader.handle(mockReq);

    assert.ok(result.files[0].hash);
    assert.equal(result.files[0].hashAlgorithm, 'sha256');
    assert.equal(result.files[0].hash.length, 64); // SHA256 hex length
  });

  runner.it('should detect MIME type from magic bytes', async () => {
    const uploader = new FluxUpload({
      validators: [
        new MagicByteDetector({ allowed: ['image/*'] })
      ],
      storage: new LocalStorage({
        destination: TEST_UPLOAD_DIR,
        naming: 'uuid'
      })
    });

    await uploader.initialize();

    // Create a fake JPEG (just the magic bytes)
    const boundary = 'TestBoundaryMime';
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="file"; filename="test.jpg"\r\n'),
      Buffer.from('Content-Type: image/jpeg\r\n'),
      Buffer.from('\r\n'),
      jpegHeader,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const mockReq = createMockRequest(body, boundary);
    const result = await uploader.handle(mockReq);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].detectedMimeType, 'image/jpeg');
  });
});

/**
 * Create a mock HTTP request
 */
function createMockRequest(body, boundary) {
  const { Readable } = require('stream');

  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

  const stream = new Readable({
    read() {
      // Defer data push to next tick to simulate async HTTP stream behavior
      // This prevents synchronous errors from being unhandled
      setImmediate(() => {
        this.push(bodyBuffer);
        this.push(null);
      });
    }
  });

  stream.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`
  };

  // Add pipe method
  const originalPipe = stream.pipe.bind(stream);
  stream.pipe = function(destination, options) {
    return originalPipe(destination, options);
  };

  return stream;
}

if (require.main === module) {
  runner.run().then(success => {
    // Cleanup
    if (fs.existsSync(TEST_UPLOAD_DIR)) {
      fs.rmSync(TEST_UPLOAD_DIR, { recursive: true });
    }
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
