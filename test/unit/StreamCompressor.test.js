/**
 * StreamCompressor Tests
 */

const { TestRunner, assert } = require('../test-runner');
const StreamCompressor = require('../../src/plugins/transformers/StreamCompressor');
const { Readable, Writable } = require('stream');
const zlib = require('zlib');

const runner = new TestRunner();

runner.describe('StreamCompressor', () => {
  runner.it('should initialize with default config', () => {
    const compressor = new StreamCompressor();
    assert.equal(compressor.algorithm, 'gzip');
    assert.equal(compressor.level, 6);
  });

  runner.it('should initialize with custom config', () => {
    const compressor = new StreamCompressor({
      algorithm: 'brotli',
      level: 9
    });
    assert.equal(compressor.algorithm, 'brotli');
    assert.equal(compressor.level, 9);
  });

  runner.it('should reject invalid algorithm', () => {
    assert.throws(() => {
      new StreamCompressor({ algorithm: 'invalid' });
    }, 'Unsupported compression algorithm');
  });

  runner.it('should reject invalid compression level', () => {
    assert.throws(() => {
      new StreamCompressor({ level: 10 });
    }, 'Compression level must be between 0 and 9');

    assert.throws(() => {
      new StreamCompressor({ level: -1 });
    }, 'Compression level must be between 0 and 9');
  });

  runner.it('should compress text files with gzip', async () => {
    const compressor = new StreamCompressor({ algorithm: 'gzip' });

    const inputData = 'Hello, World! '.repeat(100);
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.txt',
        mimeType: 'text/plain'
      },
      metadata: {}
    };

    const result = await compressor.process(context);

    assert.ok(result.metadata.compressed);
    assert.equal(result.metadata.compressionAlgorithm, 'gzip');
    assert.equal(result.metadata.compressedFilename, 'test.txt.gz');

    // Verify compression works
    const compressedData = await streamToBuffer(result.stream);
    const decompressed = zlib.gunzipSync(compressedData).toString();
    assert.equal(decompressed, inputData);
  });

  runner.it('should compress text files with deflate', async () => {
    const compressor = new StreamCompressor({ algorithm: 'deflate' });

    const inputData = 'Test content';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.txt',
        mimeType: 'text/plain'
      },
      metadata: {}
    };

    const result = await compressor.process(context);

    assert.equal(result.metadata.compressionAlgorithm, 'deflate');
    assert.equal(result.metadata.compressedFilename, 'test.txt.deflate');

    const compressedData = await streamToBuffer(result.stream);
    const decompressed = zlib.inflateSync(compressedData).toString();
    assert.equal(decompressed, inputData);
  });

  runner.it('should compress text files with brotli', async () => {
    const compressor = new StreamCompressor({ algorithm: 'brotli' });

    const inputData = 'Test content with brotli';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.txt',
        mimeType: 'text/plain'
      },
      metadata: {}
    };

    const result = await compressor.process(context);

    assert.equal(result.metadata.compressionAlgorithm, 'brotli');
    assert.equal(result.metadata.compressedFilename, 'test.txt.br');

    const compressedData = await streamToBuffer(result.stream);
    const decompressed = zlib.brotliDecompressSync(compressedData).toString();
    assert.equal(decompressed, inputData);
  });

  runner.it('should compress JSON files', async () => {
    const compressor = new StreamCompressor();

    const inputData = JSON.stringify({ test: 'data' });
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.json',
        mimeType: 'application/json'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.ok(result.metadata.compressed);
  });

  runner.it('should compress SVG files', async () => {
    const compressor = new StreamCompressor();

    const inputData = '<svg><circle r="10"/></svg>';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.svg',
        mimeType: 'image/svg+xml'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.ok(result.metadata.compressed);
  });

  runner.it('should skip compressing images', async () => {
    const compressor = new StreamCompressor();

    const inputData = 'fake image data';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.jpg',
        mimeType: 'image/jpeg'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.ok(!result.metadata.compressed);
  });

  runner.it('should skip compressing videos', async () => {
    const compressor = new StreamCompressor();

    const inputData = 'fake video data';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.mp4',
        mimeType: 'video/mp4'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.ok(!result.metadata.compressed);
  });

  runner.it('should skip compressing archives', async () => {
    const compressor = new StreamCompressor();

    const inputData = 'fake zip data';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.zip',
        mimeType: 'application/zip'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.ok(!result.metadata.compressed);
  });

  runner.it('should handle custom compressible types', async () => {
    const compressor = new StreamCompressor({
      compressibleTypes: ['application/pdf']
    });

    const inputData = 'fake pdf data';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'test.pdf',
        mimeType: 'application/pdf'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.ok(result.metadata.compressed);

    // text/plain should NOT be compressed with custom types
    const textStream = createReadableStream('text');
    const textContext = {
      stream: textStream,
      fileInfo: { mimeType: 'text/plain' },
      metadata: {}
    };

    const textResult = await compressor.process(textContext);
    assert.ok(!textResult.metadata.compressed);
  });

  runner.it('should match wildcard MIME types', async () => {
    const compressor = new StreamCompressor({
      compressibleTypes: ['text/*']
    });

    // text/plain should match
    const plainContext = {
      stream: createReadableStream('test'),
      fileInfo: { mimeType: 'text/plain' },
      metadata: {}
    };
    const plainResult = await compressor.process(plainContext);
    assert.ok(plainResult.metadata.compressed);

    // text/html should match
    const htmlContext = {
      stream: createReadableStream('test'),
      fileInfo: { mimeType: 'text/html' },
      metadata: {}
    };
    const htmlResult = await compressor.process(htmlContext);
    assert.ok(htmlResult.metadata.compressed);
  });

  runner.it('should use detected MIME type over declared type', async () => {
    const compressor = new StreamCompressor();

    const inputStream = createReadableStream('test');

    const context = {
      stream: inputStream,
      fileInfo: {
        mimeType: 'image/jpeg' // Declared as JPEG
      },
      metadata: {
        detectedMimeType: 'text/plain' // But detected as text
      }
    };

    const result = await compressor.process(context);
    // Should compress because detected type is compressible
    assert.ok(result.metadata.compressed);
  });

  runner.it('should handle files without MIME type', async () => {
    const compressor = new StreamCompressor();

    const inputStream = createReadableStream('test');

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await compressor.process(context);
    // Should skip compression when no MIME type
    assert.ok(!result.metadata.compressed);
  });

  runner.it('should store original filename in metadata', async () => {
    const compressor = new StreamCompressor();

    const inputStream = createReadableStream('test');

    const context = {
      stream: inputStream,
      fileInfo: {
        filename: 'document.txt',
        mimeType: 'text/plain'
      },
      metadata: {}
    };

    const result = await compressor.process(context);
    assert.equal(result.metadata.originalFilename, 'document.txt');
    assert.equal(result.metadata.compressedFilename, 'document.txt.gz');
  });
});

/**
 * Helper: Create readable stream from string
 */
function createReadableStream(data) {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}

/**
 * Helper: Convert stream to buffer
 */
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
