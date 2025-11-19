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

    const result = await probe.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('exceeds maximum') || error.message.includes('2000'));
    }
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

    const result = await probe.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('exceeds maximum') || error.message.includes('2000'));
    }
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

    const result = await probe.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('below minimum') || error.message.includes('200'));
    }
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

    const result = await probe.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('below minimum') || error.message.includes('200'));
    }
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

  runner.it('should handle WebP VP8 format', async () => {
    const probe = new ImageDimensionProbe();

    // Create WebP VP8 header
    const buffer = Buffer.alloc(40);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(32, 4);
    buffer.write('WEBP', 8);
    buffer.write('VP8 ', 12);
    buffer.writeUInt32LE(20, 16);
    buffer.writeUInt16LE(800, 26);
    buffer.writeUInt16LE(600, 28);

    const stream = createStream(buffer);
    const context = {
      stream,
      fileInfo: { mimeType: 'image/webp' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.ok(result.metadata.dimensions);
    assert.equal(result.metadata.dimensions.width, 800);
    assert.equal(result.metadata.dimensions.height, 600);
  });

  runner.it('should handle WebP VP8L format', async () => {
    const probe = new ImageDimensionProbe();

    const buffer = Buffer.alloc(40);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(32, 4);
    buffer.write('WEBP', 8);
    buffer.write('VP8L', 12);
    buffer.writeUInt32LE(20, 16);
    // Width and height encoded in bits
    const bits = ((500 - 1) & 0x3FFF) | (((400 - 1) & 0x3FFF) << 14);
    buffer.writeUInt32LE(bits, 21);

    const stream = createStream(buffer);
    const context = {
      stream,
      fileInfo: { mimeType: 'image/webp' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.ok(result.metadata.dimensions);
    assert.equal(result.metadata.dimensions.width, 500);
    assert.equal(result.metadata.dimensions.height, 400);
  });

  runner.it('should handle WebP VP8X format', async () => {
    const probe = new ImageDimensionProbe();

    const buffer = Buffer.alloc(40);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(32, 4);
    buffer.write('WEBP', 8);
    buffer.write('VP8X', 12);
    buffer.writeUInt32LE(20, 16);
    // Width-1 and height-1 in 24 bits
    buffer.writeUInt32LE(1024 - 1, 24);
    buffer.writeUInt32LE(768 - 1, 27);

    const stream = createStream(buffer);
    const context = {
      stream,
      fileInfo: { mimeType: 'image/webp' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.ok(result.metadata.dimensions);
    assert.equal(result.metadata.dimensions.width, 1024);
    assert.equal(result.metadata.dimensions.height, 768);
  });

  runner.it('should handle negative BMP dimensions', async () => {
    const probe = new ImageDimensionProbe();

    const buffer = Buffer.alloc(54);
    buffer.write('BM', 0);
    buffer.writeUInt32LE(54, 2);
    buffer.writeUInt32LE(0, 6);
    buffer.writeUInt32LE(54, 10);
    buffer.writeUInt32LE(40, 14);
    // Negative dimensions (bottom-up DIB)
    buffer.writeInt32LE(-640, 18);
    buffer.writeInt32LE(-480, 22);

    const stream = createStream(buffer);
    const context = {
      stream,
      fileInfo: { mimeType: 'image/bmp' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    // Should use absolute values
    assert.equal(result.metadata.dimensions.width, 640);
    assert.equal(result.metadata.dimensions.height, 480);
  });

  runner.it('should handle JPEG with multiple markers', async () => {
    const probe = new ImageDimensionProbe();

    const buffer = Buffer.alloc(150);
    // SOI
    buffer.writeUInt16BE(0xFFD8, 0);
    // APP0
    buffer.writeUInt16BE(0xFFE0, 2);
    buffer.writeUInt16BE(16, 4);
    // APP1
    buffer.writeUInt16BE(0xFFE1, 22);
    buffer.writeUInt16BE(30, 24);
    // SOF0 (what we're looking for)
    buffer.writeUInt16BE(0xFFC0, 56);
    buffer.writeUInt16BE(17, 58);
    buffer.writeUInt8(8, 60);
    buffer.writeUInt16BE(1080, 61);
    buffer.writeUInt16BE(1920, 63);

    const stream = createStream(buffer);
    const context = {
      stream,
      fileInfo: { mimeType: 'image/jpeg' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 1920);
    assert.equal(result.metadata.dimensions.height, 1080);
  });

  runner.it('should handle exact boundary width', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 1920,
      maxWidth: 1920
    });

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
  });

  runner.it('should handle exact boundary height', async () => {
    const probe = new ImageDimensionProbe({
      minHeight: 1080,
      maxHeight: 1080
    });

    const imageData = createPNGHeader(1920, 1080);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.height, 1080);
  });

  runner.it('should default bytesToRead to 8192', () => {
    const probe = new ImageDimensionProbe();
    assert.equal(probe.bytesToRead, 8192);
  });

  runner.it('should accept custom bytesToRead', () => {
    const probe = new ImageDimensionProbe({ bytesToRead: 16384 });
    assert.equal(probe.bytesToRead, 16384);
  });

  runner.it('should handle very small images', async () => {
    const probe = new ImageDimensionProbe();
    const imageData = createPNGHeader(1, 1);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 1);
    assert.equal(result.metadata.dimensions.height, 1);
  });

  runner.it('should handle very large dimensions', async () => {
    const probe = new ImageDimensionProbe();
    const imageData = createPNGHeader(65535, 65535);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 65535);
    assert.equal(result.metadata.dimensions.height, 65535);
  });

  runner.it('should reject 4K image when max is 1080p', async () => {
    const probe = new ImageDimensionProbe({
      maxWidth: 1920,
      maxHeight: 1080
    });

    const imageData = createPNGHeader(3840, 2160);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);

    try {
      await consumeStream(result.stream);
      throw new Error('Should have rejected 4K image');
    } catch (error) {
      assert.ok(error.message.includes('3840') || error.message.includes('exceeds'));
    }
  });

  runner.it('should handle chunked stream data', async () => {
    const probe = new ImageDimensionProbe();
    const imageData = createPNGHeader(800, 600);

    // Split data into small chunks
    const stream = new Readable();
    for (let i = 0; i < imageData.length; i += 5) {
      stream.push(imageData.slice(i, i + 5));
    }
    stream.push(null);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 800);
    assert.equal(result.metadata.dimensions.height, 600);
  });

  runner.it('should handle unsupported image format', async () => {
    const probe = new ImageDimensionProbe();
    const stream = createStream(Buffer.from('SVG or other format'));

    const context = {
      stream,
      fileInfo: { mimeType: 'image/svg+xml' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    // Should not have dimensions for unsupported format
    assert.equal(result.metadata.dimensions, undefined);
  });

  runner.it('should extend Plugin class', () => {
    const Plugin = require('../../src/core/Plugin');
    const probe = new ImageDimensionProbe();
    assert.ok(probe instanceof Plugin);
  });

  runner.it('should have correct plugin name', () => {
    const probe = new ImageDimensionProbe();
    assert.equal(probe.name, 'ImageDimensionProbe');
  });

  runner.it('should handle GIF89a format', async () => {
    const probe = new ImageDimensionProbe();
    const imageData = createGIFHeader(320, 240);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/gif' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 320);
    assert.equal(result.metadata.dimensions.height, 240);
  });

  runner.it('should handle GIF87a format', async () => {
    const probe = new ImageDimensionProbe();

    const buffer = Buffer.alloc(13);
    buffer.write('GIF87a', 0);
    buffer.writeUInt16LE(640, 6);
    buffer.writeUInt16LE(480, 8);

    const stream = createStream(buffer);
    const context = {
      stream,
      fileInfo: { mimeType: 'image/gif' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 640);
    assert.equal(result.metadata.dimensions.height, 480);
  });

  runner.it('should skip probe when no MIME type', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 1000
    });

    const stream = createStream(Buffer.from('data'));

    const context = {
      stream,
      fileInfo: {},
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions, undefined);
  });

  runner.it('should handle zero min dimensions', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 0,
      minHeight: 0
    });

    const imageData = createPNGHeader(10, 10);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 10);
    assert.equal(result.metadata.dimensions.height, 10);
  });

  runner.it('should handle Infinity max dimensions', async () => {
    const probe = new ImageDimensionProbe({
      maxWidth: Infinity,
      maxHeight: Infinity
    });

    const imageData = createPNGHeader(50000, 50000);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 50000);
    assert.equal(result.metadata.dimensions.height, 50000);
  });

  runner.it('should validate all dimension constraints', async () => {
    const probe = new ImageDimensionProbe({
      minWidth: 200,
      maxWidth: 2000,
      minHeight: 200,
      maxHeight: 2000
    });

    const imageData = createPNGHeader(500, 500);
    const stream = createStream(imageData);

    const context = {
      stream,
      fileInfo: { mimeType: 'image/png' },
      metadata: {}
    };

    const result = await probe.process(context);
    await consumeStream(result.stream);

    assert.equal(result.metadata.dimensions.width, 500);
    assert.equal(result.metadata.dimensions.height, 500);
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
