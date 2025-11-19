/**
 * StreamHasher Tests
 */

const { TestRunner, assert } = require('../test-runner');
const StreamHasher = require('../../src/plugins/transformers/StreamHasher');
const { Readable } = require('stream');
const crypto = require('crypto');

const runner = new TestRunner();

runner.describe('StreamHasher', () => {
  runner.it('should initialize with default config', () => {
    const hasher = new StreamHasher();
    assert.equal(hasher.algorithm, 'sha256');
    assert.equal(hasher.encoding, 'hex');
  });

  runner.it('should initialize with custom config', () => {
    const hasher = new StreamHasher({
      algorithm: 'md5',
      encoding: 'base64'
    });

    assert.equal(hasher.algorithm, 'md5');
    assert.equal(hasher.encoding, 'base64');
  });

  runner.it('should reject unsupported algorithm', () => {
    assert.throws(() => {
      new StreamHasher({ algorithm: 'invalid' });
    }, 'Unsupported hash algorithm');
  });

  runner.it('should reject unsupported encoding', () => {
    assert.throws(() => {
      new StreamHasher({ encoding: 'invalid' });
    }, 'Unsupported encoding');
  });

  runner.it('should calculate SHA256 hash', async () => {
    const hasher = new StreamHasher({ algorithm: 'sha256' });

    const inputData = 'Hello, World!';
    const expectedHash = crypto.createHash('sha256').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await hasher.process(context);

    // Wait for stream to complete
    const output = await streamToBuffer(result.stream);

    assert.equal(output.toString(), inputData);
    assert.equal(result.metadata.hash, expectedHash);
    assert.equal(result.metadata.hashAlgorithm, 'sha256');
  });

  runner.it('should calculate MD5 hash', async () => {
    const hasher = new StreamHasher({ algorithm: 'md5' });

    const inputData = 'Test content for MD5';
    const expectedHash = crypto.createHash('md5').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
    assert.equal(result.metadata.hashAlgorithm, 'md5');
  });

  runner.it('should calculate SHA512 hash', async () => {
    const hasher = new StreamHasher({ algorithm: 'sha512' });

    const inputData = 'Test for SHA512';
    const expectedHash = crypto.createHash('sha512').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
    assert.equal(result.metadata.hashAlgorithm, 'sha512');
  });

  runner.it('should support base64 encoding', async () => {
    const hasher = new StreamHasher({
      algorithm: 'sha256',
      encoding: 'base64'
    });

    const inputData = 'Test for base64';
    const expectedHash = crypto.createHash('sha256').update(inputData).digest('base64');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
  });

  runner.it('should support base64url encoding', async () => {
    const hasher = new StreamHasher({
      algorithm: 'sha256',
      encoding: 'base64url'
    });

    const inputData = 'Test for base64url';
    const expectedHash = crypto.createHash('sha256').update(inputData).digest('base64url');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
  });

  runner.it('should not modify stream data', async () => {
    const hasher = new StreamHasher();

    const inputData = 'This data should pass through unchanged';
    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    const output = await streamToBuffer(result.stream);

    assert.equal(output.toString(), inputData);
  });

  runner.it('should handle binary data', async () => {
    const hasher = new StreamHasher();

    const inputData = Buffer.from([0x00, 0xFF, 0xAB, 0xCD, 0xEF]);
    const expectedHash = crypto.createHash('sha256').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    const output = await streamToBuffer(result.stream);

    assert.deepEqual(output, inputData);
    assert.equal(result.metadata.hash, expectedHash);
  });

  runner.it('should handle large data', async () => {
    const hasher = new StreamHasher();

    // Create large data (1MB)
    const chunk = 'x'.repeat(1024);
    const inputData = chunk.repeat(1024); // 1MB
    const expectedHash = crypto.createHash('sha256').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
  });

  runner.it('should handle empty stream', async () => {
    const hasher = new StreamHasher();

    const inputData = '';
    const expectedHash = crypto.createHash('sha256').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
  });

  runner.it('should support SHA1 for legacy systems', async () => {
    const hasher = new StreamHasher({ algorithm: 'sha1' });

    const inputData = 'Legacy data';
    const expectedHash = crypto.createHash('sha1').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
    assert.equal(result.metadata.hashAlgorithm, 'sha1');
  });

  runner.it('should support SHA384', async () => {
    const hasher = new StreamHasher({ algorithm: 'sha384' });

    const inputData = 'SHA384 test';
    const expectedHash = crypto.createHash('sha384').update(inputData).digest('hex');

    const inputStream = createReadableStream(inputData);

    const context = {
      stream: inputStream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
  });

  runner.it('should handle chunked data correctly', async () => {
    const hasher = new StreamHasher();

    const part1 = 'Hello, ';
    const part2 = 'World!';
    const fullData = part1 + part2;
    const expectedHash = crypto.createHash('sha256').update(fullData).digest('hex');

    // Create stream that emits data in chunks
    const stream = new Readable({
      read() {
        this.push(part1);
        this.push(part2);
        this.push(null);
      }
    });

    const context = {
      stream,
      fileInfo: {},
      metadata: {}
    };

    const result = await hasher.process(context);
    await streamToBuffer(result.stream);

    assert.equal(result.metadata.hash, expectedHash);
  });
});

/**
 * Helper: Create readable stream from data
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
