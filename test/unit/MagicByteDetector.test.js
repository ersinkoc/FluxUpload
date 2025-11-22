/**
 * MagicByteDetector Tests
 */

const { TestRunner, assert } = require('../test-runner');
const MagicByteDetector = require('../../src/plugins/validators/MagicByteDetector');
const { Readable } = require('stream');

const runner = new TestRunner();

// Helper to create readable streams
function createStream(data) {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}

function consumeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
    stream.on('data', () => {}); // Consume data
  });
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Magic byte signatures
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8, 0xFF]);
const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
const EXE_SIGNATURE = Buffer.from([0x4D, 0x5A]); // MZ header

runner.describe('MagicByteDetector', () => {
  runner.it('should require valid config', () => {
    assert.throws(() => {
      new MagicByteDetector({ allowed: 'not-an-array' });
    }, 'allowed must be an array');

    assert.throws(() => {
      new MagicByteDetector({ denied: 'not-an-array' });
    }, 'denied must be an array');
  });

  runner.it('should initialize with default config', () => {
    const detector = new MagicByteDetector({ allowed: [] });

    assert.ok(detector);
    // Increased from 16 to 32 for better detection
    assert.equal(detector.bytesToRead, 32);
  });

  runner.it('should detect PNG and add to metadata', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    const imageData = Buffer.concat([PNG_SIGNATURE, Buffer.from('...rest of image...')]);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { filename: 'test.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.detectedMimeType, 'image/png');
  });

  runner.it('should detect JPEG', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/jpeg', 'image/jpg']
    });

    const imageData = Buffer.concat([JPEG_SIGNATURE, Buffer.from('...jpeg data...')]);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { filename: 'test.jpg', mimeType: 'image/jpeg' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.detectedMimeType, 'image/jpeg');
  });

  runner.it('should allow all types when no whitelist', async () => {
    const detector = new MagicByteDetector({
      denied: []
    });

    const pdfData = Buffer.concat([PDF_SIGNATURE, Buffer.from('...pdf content...')]);
    const stream = createStream(pdfData);

    const context = {
      stream,
      fileInfo: { filename: 'test.pdf', mimeType: 'application/pdf' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.detectedMimeType, 'application/pdf');
  });

  runner.it('should reject type not in whitelist', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    const pdfData = Buffer.concat([PDF_SIGNATURE, Buffer.from('...pdf content...')]);
    const stream = createStream(pdfData);

    const context = {
      stream,
      fileInfo: { filename: 'test.pdf', mimeType: 'application/pdf' },
      metadata: {}
    };

    const result = await detector.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('File type mismatch') || error.message.includes('pdf'));
    }
  });

  runner.it('should reject types in denylist', async () => {
    const detector = new MagicByteDetector({
      allowed: null,
      denied: ['application/pdf']
    });

    const pdfData = Buffer.concat([PDF_SIGNATURE, Buffer.from('...pdf content...')]);
    const stream = createStream(pdfData);

    const context = {
      stream,
      fileInfo: { filename: 'test.pdf', mimeType: 'application/pdf' },
      metadata: {}
    };

    const result = await detector.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('not allowed'));
    }
  });

  runner.it('should detect type mismatch (security)', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    // User uploads PDF but claims it's an image
    const pdfData = Buffer.concat([PDF_SIGNATURE, Buffer.from('...pdf content...')]);
    const stream = createStream(pdfData);

    const context = {
      stream,
      fileInfo: { filename: 'totally-not-a-pdf.jpg', mimeType: 'image/jpeg' },
      metadata: {}
    };

    const result = await detector.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('mismatch') || error.message.includes('pdf'));
    }
  });

  runner.it('should handle unknown file types with whitelist', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    const unknownData = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF]);
    const stream = createStream(unknownData);

    const context = {
      stream,
      fileInfo: { filename: 'unknown.dat', mimeType: 'application/octet-stream' },
      metadata: {}
    };

    const result = await detector.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('Unable to detect'));
    }
  });

  runner.it('should allow unknown file types without whitelist', async () => {
    const detector = new MagicByteDetector({
      allowed: null,
      denied: []
    });

    const unknownData = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF]);
    const stream = createStream(unknownData);

    const context = {
      stream,
      fileInfo: { filename: 'unknown.dat', mimeType: 'application/octet-stream' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    // Should not throw - unknown types allowed when no whitelist
    assert.ok(true);
  });

  runner.it('should support wildcard matching', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*', 'video/*']
    });

    const imageData = Buffer.concat([PNG_SIGNATURE, Buffer.from('...image...')]);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { filename: 'test.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.detectedMimeType, 'image/png');
  });

  runner.it('should not modify stream data', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    const fullData = Buffer.concat([PNG_SIGNATURE, Buffer.from('...complete image data...')]);
    const stream = createStream(fullData);

    const context = {
      stream,
      fileInfo: { filename: 'test.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    const output = await streamToBuffer(result.stream);

    assert.deepEqual(output, fullData);
  });

  runner.it('should handle small files', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    // Only PNG signature, no additional data
    const stream = createStream(PNG_SIGNATURE);

    const context = {
      stream,
      fileInfo: { filename: 'tiny.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.detectedMimeType, 'image/png');
  });

  runner.it('should detect on flush for very small streams', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*'],
      bytesToRead: 100
    });

    // Stream smaller than bytesToRead
    const smallData = PNG_SIGNATURE.slice(0, 8);
    const stream = createStream(smallData);

    const context = {
      stream,
      fileInfo: { filename: 'small.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.detectedMimeType, 'image/png');
  });

  runner.it('should handle binary data correctly', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    const binaryData = Buffer.concat([
      PNG_SIGNATURE,
      Buffer.from([0x00, 0xFF, 0x00, 0xFF, 0xAB, 0xCD, 0xEF])
    ]);
    const stream = createStream(binaryData);

    const context = {
      stream,
      fileInfo: { filename: 'binary.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    const output = await streamToBuffer(result.stream);

    assert.deepEqual(output, binaryData);
  });

  runner.it('should handle chunked streams', async () => {
    const detector = new MagicByteDetector({
      allowed: ['image/*']
    });

    // Create stream that emits data in multiple chunks
    const fullData = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(100, 'x')]);

    const stream = new Readable({
      read() {
        // Emit in 10-byte chunks
        for (let i = 0; i < fullData.length; i += 10) {
          if (!this.push(fullData.slice(i, i + 10))) break;
        }
        this.push(null);
      }
    });

    const context = {
      stream,
      fileInfo: { filename: 'chunked.png', mimeType: 'image/png' },
      metadata: {}
    };

    const result = await detector.process(context);
    const output = await streamToBuffer(result.stream);

    assert.deepEqual(output, fullData);
    assert.equal(result.metadata.detectedMimeType, 'image/png');
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
