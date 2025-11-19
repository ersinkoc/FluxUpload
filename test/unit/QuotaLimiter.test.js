/**
 * QuotaLimiter Tests
 */

const { TestRunner, assert } = require('../test-runner');
const QuotaLimiter = require('../../src/plugins/validators/QuotaLimiter');
const { Readable } = require('stream');

const runner = new TestRunner();

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

runner.describe('QuotaLimiter', () => {
  runner.it('should require valid config', () => {
    assert.throws(() => {
      new QuotaLimiter({ maxFileSize: -1 });
    }, 'maxFileSize must be a positive number');

    assert.throws(() => {
      new QuotaLimiter({ maxFileSize: 'not-a-number' });
    }, 'maxFileSize must be a positive number');
  });

  runner.it('should initialize with default config', () => {
    const limiter = new QuotaLimiter({});

    assert.equal(limiter.maxFileSize, 100 * 1024 * 1024); // 100MB default
    assert.equal(limiter.maxTotalSize, null);
    assert.equal(limiter.totalBytesProcessed, 0);
  });

  runner.it('should initialize with custom config', () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 5 * 1024 * 1024, // 5MB
      maxTotalSize: 50 * 1024 * 1024 // 50MB
    });

    assert.equal(limiter.maxFileSize, 5 * 1024 * 1024);
    assert.equal(limiter.maxTotalSize, 50 * 1024 * 1024);
  });

  runner.it('should allow file within limit', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1024 // 1KB
    });

    const data = Buffer.alloc(512, 'x'); // 512 bytes
    const stream = createStream(data);

    const context = {
      stream,
      fileInfo: { filename: 'small.txt' },
      metadata: {}
    };

    await limiter.process(context);
    const output = await streamToBuffer(context.stream);

    assert.equal(output.length, 512);
  });

  runner.it('should reject file exceeding limit', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 100 // 100 bytes
    });

    const data = Buffer.alloc(200, 'x'); // 200 bytes
    const stream = createStream(data);

    const context = {
      stream,
      fileInfo: { filename: 'toolarge.txt' },
      metadata: {}
    };

    await limiter.process(context);

    try {
      await consumeStream(context.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('exceeds limit'));
      assert.equal(error.code, 'LIMIT_FILE_SIZE');
    }
  });

  runner.it('should reject at exact limit + 1 byte', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 100
    });

    const data = Buffer.alloc(101, 'x'); // Exactly 1 byte over
    const stream = createStream(data);

    const context = {
      stream,
      fileInfo: { filename: 'oneover.txt' },
      metadata: {}
    };

    await limiter.process(context);

    try {
      await consumeStream(context.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('exceeds limit'));
    }
  });

  runner.it('should allow file at exact limit', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 100
    });

    const data = Buffer.alloc(100, 'x'); // Exactly at limit
    const stream = createStream(data);

    const context = {
      stream,
      fileInfo: { filename: 'exact.txt' },
      metadata: {}
    };

    await limiter.process(context);
    const output = await streamToBuffer(context.stream);

    assert.equal(output.length, 100);
  });

  runner.it('should track total bytes across multiple files', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1000,
      maxTotalSize: 2000
    });

    // First file: 800 bytes
    const stream1 = createStream(Buffer.alloc(800, 'a'));
    const context1 = {
      stream: stream1,
      fileInfo: { filename: 'file1.txt' },
      metadata: {}
    };

    await limiter.process(context1);
    await streamToBuffer(context1.stream);

    assert.equal(limiter.totalBytesProcessed, 800);

    // Second file: 800 bytes (total 1600, under 2000 limit)
    const stream2 = createStream(Buffer.alloc(800, 'b'));
    const context2 = {
      stream: stream2,
      fileInfo: { filename: 'file2.txt' },
      metadata: {}
    };

    await limiter.process(context2);
    await streamToBuffer(context2.stream);

    assert.equal(limiter.totalBytesProcessed, 1600);
  });

  runner.it('should reject when total exceeds limit', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1000,
      maxTotalSize: 1500
    });

    // First file: 800 bytes
    const stream1 = createStream(Buffer.alloc(800, 'a'));
    const context1 = {
      stream: stream1,
      fileInfo: { filename: 'file1.txt' },
      metadata: {}
    };

    await limiter.process(context1);
    await streamToBuffer(context1.stream);

    // Second file: 800 bytes (total 1600, exceeds 1500 limit)
    const stream2 = createStream(Buffer.alloc(800, 'b'));
    const context2 = {
      stream: stream2,
      fileInfo: { filename: 'file2.txt' },
      metadata: {}
    };

    await limiter.process(context2);

    try {
      await consumeStream(context2.stream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('Total upload size exceeds'));
      assert.equal(error.code, 'LIMIT_TOTAL_SIZE');
    }
  });

  runner.it('should reset total bytes counter', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1000,
      maxTotalSize: 1500
    });

    // First upload session
    const stream1 = createStream(Buffer.alloc(800, 'a'));
    const context1 = {
      stream: stream1,
      fileInfo: { filename: 'file1.txt' },
      metadata: {}
    };

    await limiter.process(context1);
    await streamToBuffer(context1.stream);

    assert.equal(limiter.totalBytesProcessed, 800);

    // Reset for new session
    limiter.reset();
    assert.equal(limiter.totalBytesProcessed, 0);

    // New upload should start from 0
    const stream2 = createStream(Buffer.alloc(800, 'b'));
    const context2 = {
      stream: stream2,
      fileInfo: { filename: 'file2.txt' },
      metadata: {}
    };

    await limiter.process(context2);
    await streamToBuffer(context2.stream);

    assert.equal(limiter.totalBytesProcessed, 800);
  });

  runner.it('should handle large files in chunks', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 10 * 1024 // 10KB
    });

    // Create stream that emits in chunks
    const chunk = Buffer.alloc(1024, 'x');
    let chunksRemaining = 5; // 5KB total

    const stream = new Readable({
      read() {
        while (chunksRemaining > 0) {
          if (!this.push(chunk)) {
            chunksRemaining--;
            return;
          }
          chunksRemaining--;
        }
        this.push(null);
      }
    });

    const context = {
      stream,
      fileInfo: { filename: 'chunked.txt' },
      metadata: {}
    };

    await limiter.process(context);
    const output = await streamToBuffer(context.stream);

    assert.equal(output.length, 5 * 1024);
  });

  runner.it('should abort immediately on exceeding limit', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 2500 // 2.5KB limit
    });

    // Create stream with multiple smaller chunks
    const chunk = Buffer.alloc(1024, 'x'); // 1KB chunks
    let bytesConsumed = 0;
    let chunksRemaining = 10;

    const stream = new Readable({
      read() {
        while (chunksRemaining > 0) {
          if (!this.push(chunk)) {
            chunksRemaining--;
            return;
          }
          chunksRemaining--;
        }
        this.push(null);
      }
    });

    const context = {
      stream,
      fileInfo: { filename: 'huge.txt' },
      metadata: {}
    };

    await limiter.process(context);

    // Count how many bytes actually get through
    const countingStream = context.stream;
    countingStream.on('data', (chunk) => {
      bytesConsumed += chunk.length;
    });

    try {
      await consumeStream(countingStream);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('exceeds limit'));
      // Stream should be destroyed after ~2-3KB, not all 10KB
      // First two chunks (2KB) pass, third chunk (3KB total) exceeds limit
      assert.ok(bytesConsumed < 10 * 1024);
      assert.ok(bytesConsumed <= 2 * 1024); // Should stop at 2KB
    }
  });

  runner.it('should not modify stream data', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1024
    });

    const originalData = Buffer.from('Hello, World! This is a test.');
    const stream = createStream(originalData);

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    await limiter.process(context);
    const output = await streamToBuffer(context.stream);

    assert.deepEqual(output, originalData);
  });

  runner.it('should handle binary data', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1024
    });

    const binaryData = Buffer.from([0x00, 0xFF, 0xAB, 0xCD, 0xEF, 0x12, 0x34]);
    const stream = createStream(binaryData);

    const context = {
      stream,
      fileInfo: { filename: 'binary.bin' },
      metadata: {}
    };

    await limiter.process(context);
    const output = await streamToBuffer(context.stream);

    assert.deepEqual(output, binaryData);
  });

  runner.it('should handle empty stream', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1024
    });

    const stream = createStream(Buffer.alloc(0));

    const context = {
      stream,
      fileInfo: { filename: 'empty.txt' },
      metadata: {}
    };

    await limiter.process(context);
    const output = await streamToBuffer(context.stream);

    assert.equal(output.length, 0);
  });

  runner.it('should work without maxTotalSize', async () => {
    const limiter = new QuotaLimiter({
      maxFileSize: 1000
      // No maxTotalSize
    });

    // Process multiple files
    for (let i = 0; i < 5; i++) {
      const stream = createStream(Buffer.alloc(500, 'x'));
      const context = {
        stream,
        fileInfo: { filename: `file${i}.txt` },
        metadata: {}
      };

      await limiter.process(context);
      await streamToBuffer(context.stream);
    }

    // Should track total but not reject
    assert.equal(limiter.totalBytesProcessed, 2500);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
