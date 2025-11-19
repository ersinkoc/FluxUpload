/**
 * ImageDimensionProbe Tests
 */

const { TestRunner, assert } = require('../test-runner');
const ImageDimensionProbe = require('../../src/plugins/validators/ImageDimensionProbe');
const { Readable } = require('stream');

const runner = new TestRunner();

// Helper to create image headers
const createPNGHeader = (width, height) => {
  const buffer = Buffer.alloc(33);
  // PNG signature
  buffer.write('\x89PNG\r\n\x1a\n', 0);
  // IHDR chunk length (13 bytes)
  buffer.writeUInt32BE(13, 8);
  // IHDR type
  buffer.write('IHDR', 12);
  // Width and height
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  // Bit depth, color type, etc.
  buffer.writeUInt8(8, 24); // bit depth
  buffer.writeUInt8(2, 25); // color type
  return buffer;
};

const createJPEGHeader = (width, height) => {
  const buffer = Buffer.alloc(100);
  // SOI marker
  buffer.writeUInt16BE(0xFFD8, 0);
  // APP0 marker
  buffer.writeUInt16BE(0xFFE0, 2);
  buffer.writeUInt16BE(16, 4); // Length
  // SOF0 marker (Start of Frame)
  buffer.writeUInt16BE(0xFFC0, 22);
  buffer.writeUInt16BE(17, 24); // Length
  buffer.writeUInt8(8, 26); // Precision
  buffer.writeUInt16BE(height, 27);
  buffer.writeUInt16BE(width, 29);
  return buffer;
};

const createGIFHeader = (width, height) => {
  const buffer = Buffer.alloc(13);
  // GIF signature
  buffer.write('GIF89a', 0);
  // Logical Screen Descriptor
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
};

const createBMPHeader = (width, height) => {
  const buffer = Buffer.alloc(54);
  // BMP signature
  buffer.write('BM', 0);
  // File size (placeholder)
  buffer.writeUInt32LE(54, 2);
  // Reserved
  buffer.writeUInt32LE(0, 6);
  // Pixel data offset
  buffer.writeUInt32LE(54, 10);
  // DIB header size
  buffer.writeUInt32LE(40, 14);
  // Width and height
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  return buffer;
};

runner.describe('ImageDimensionProbe', () => {
  runner.it('should initialize with default config', () => {
    const probe = new ImageDimensionProbe();
    assert.equal(probe.minWidth, 0);
    assert.equal(probe.maxWidth, Infinity);
    assert.equal(probe.minHeight, 0);
    assert.equal(probe.maxHeight, Infinity);
  });

  runner.it('should initialize with custom config', () => {
    const probe = new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 4000,
      minHeight: 100,
      maxHeight: 3000
    });

    assert.equal(probe.minWidth, 100);
    assert.equal(probe.maxWidth, 4000);
    assert.equal(probe.minHeight, 100);
    assert.equal(probe.maxHeight, 3000);
  });

  runner.it('should extract PNG dimensions', async () => {
    const probe = new ImageDimensionProbe();

    const imageData = createPNGHeader(1920, 1080);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 1920);
    assert.equal(result.metadata.dimensions.height, 1080);
  });

  runner.it('should extract JPEG dimensions', async () => {
    const probe = new ImageDimensionProbe();

    const imageData = createJPEGHeader(800, 600);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/jpeg' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 800);
    assert.equal(result.metadata.dimensions.height, 600);
  });

  runner.it('should extract GIF dimensions', async () => {
    const probe = new ImageDimensionProbe();

    const imageData = createGIFHeader(500, 400);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/gif' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 500);
    assert.equal(result.metadata.dimensions.height, 400);
  });

  runner.it('should extract BMP dimensions', async () => {
    const probe = new ImageDimensionProbe();

    const imageData = createBMPHeader(1024, 768);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/bmp' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 1024);
    assert.equal(result.metadata.dimensions.height, 768);
  });

  runner.it('should reject image exceeding max width', async () => {
    const probe = new ImageDimensionProbe({
      maxWidth: 1000
    });

    const imageData = createPNGHeader(2000, 500);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    await assert.rejects(
      async () => {
        const result = await probe.process(context);
        await consumeStream(result.stream);
      },
      'exceeds maximum'
    );
  });

  runner.it('should reject image exceeding max height', async () => {
    const probe = new ImageDimensionProbe({
      maxHeight: 1000
    });

    const imageData = createPNGHeader(500, 2000);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    await assert.rejects(
      async () => {
        const result = await probe.process(context);
        await consumeStream(result.stream);
      },
      'exceeds maximum'
    );
  });

  runner.it('should reject image below min width', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 500
    });

    const imageData = createPNGHeader(200, 600);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    await assert.rejects(
      async () => {
        const result = await probe.process(context);
        await consumeStream(result.stream);
      },
      'below minimum'
    );
  });

  runner.it('should reject image below min height', async () => {
    const probe = new ImageDimensionProbe({
      minHeight: 500
    });

    const imageData = createPNGHeader(600, 200);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    await assert.rejects(
      async () => {
        const result = await probe.process(context);
        await consumeStream(result.stream);
      },
      'below minimum'
    );
  });

  runner.it('should accept image within bounds', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 2000,
      minHeight: 100,
      maxHeight: 2000
    });

    const imageData = createPNGHeader(1024, 768);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 1024);
    assert.equal(result.metadata.dimensions.height, 768);
  });

  runner.it('should skip non-image files', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 1000
    });

    const stream = createStream(Buffer.from('Not an image'));

    const context = {
      stream,
      fileInfo: { mimeType: 'text/plain' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    // Should not have dimensions
    assert.equal(result.metadata.dimensions, undefined);
  });

  runner.it('should use detected MIME type over declared type', async () => {
    const probe = new ImageDimensionProbe();

    const imageData = createPNGHeader(640, 480);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'application/octet-stream' },
      metadata: { detectedMimeType: 'image/png' }
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 640);
    assert.equal(result.metadata.dimensions.height, 480);
  });

  runner.it('should handle small image data gracefully', async () => {
    const probe = new ImageDimensionProbe();

    // Incomplete PNG header
    const stream = createStream(Buffer.from('\x89PNG\r\n\x1a\n'));

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    // Should not throw, dimensions might be undefined
    assert.ok(true);
  });

  runner.it('should not modify stream data', async () => {
    const probe = new ImageDimensionProbe();

    const imageData = createPNGHeader(100, 100);
    const additionalData = Buffer.from('...rest of image data...');
    const fullData = Buffer.concat([imageData, additionalData]);

    const stream = createStream(fullData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    const output = await streamToBuffer(result.stream);

    assert.deepEqual(output, fullData);
  });
});

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

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
