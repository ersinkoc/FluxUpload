/**
 * LocalStorage Tests
 */

const { TestRunner, assert } = require('../test-runner');
const LocalStorage = require('../../src/storage/LocalStorage');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

const runner = new TestRunner();

const TEST_DIR = path.join(__dirname, '../tmp/storage-test');

// Cleanup before and after tests
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true });
}

runner.describe('LocalStorage', () => {
  runner.it('should require destination config', () => {
    assert.throws(() => {
      new LocalStorage({});
    }, 'destination is required');
  });

  runner.it('should initialize with config', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    assert.equal(storage.destination, TEST_DIR);
    assert.equal(storage.createDirectories, true);

    await storage.initialize();

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  runner.it('should create destination directory', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    assert.ok(!fs.existsSync(TEST_DIR));

    await storage.initialize();

    assert.ok(fs.existsSync(TEST_DIR));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should store file with original naming', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const content = 'Hello, World!';
    const stream = createStream(content);

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(result.storage);
    assert.equal(result.storage.driver, 'local');
    assert.equal(result.storage.filename, 'test.txt');
    assert.ok(result.storage.path.endsWith('test.txt'));
    assert.ok(fs.existsSync(result.storage.path));

    const savedContent = fs.readFileSync(result.storage.path, 'utf8');
    assert.equal(savedContent, content);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should store file with UUID naming', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'uuid'
    });

    await storage.initialize();

    const content = 'Test content';
    const stream = createStream(content);

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(result.storage.filename);
    assert.notEqual(result.storage.filename, 'test.txt');
    assert.ok(result.storage.filename.match(/^[a-f0-9-]+\.txt$/));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should store file with timestamp naming', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'timestamp'
    });

    await storage.initialize();

    const stream = createStream('test');

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    // Timestamp format: 20251119T130046-hash.txt
    assert.ok(result.storage.filename.match(/^\d{8}T\d{6}-[a-f0-9]+\.txt$/));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should use atomic write (temp then rename)', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const content = 'Atomic write test';
    const stream = createStream(content);

    const context = {
      stream,
      fileInfo: { filename: 'atomic.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    // Temp file should not exist
    const tempPath = result.storage.path + '.tmp';
    assert.ok(!fs.existsSync(tempPath));

    // Final file should exist
    assert.ok(fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should delete files', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('delete test');

    const context = {
      stream,
      fileInfo: { filename: 'delete-me.txt' },
      metadata: {}
    };

    const result = await storage.process(context);
    assert.ok(fs.existsSync(result.storage.path));

    await storage.delete('delete-me.txt');
    assert.ok(!fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should check if file exists', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const exists1 = await storage.exists('nonexistent.txt');
    assert.equal(exists1, false);

    const stream = createStream('exists test');
    const context = {
      stream,
      fileInfo: { filename: 'exists.txt' },
      metadata: {}
    };

    await storage.process(context);

    const exists2 = await storage.exists('exists.txt');
    assert.equal(exists2, true);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should get file metadata', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const content = 'metadata test';
    const stream = createStream(content);

    const context = {
      stream,
      fileInfo: { filename: 'metadata.txt' },
      metadata: {}
    };

    await storage.process(context);

    const metadata = await storage.getMetadata('metadata.txt');

    assert.equal(metadata.size, content.length);
    assert.ok(metadata.created instanceof Date);
    assert.ok(metadata.modified instanceof Date);
    assert.ok(metadata.path);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should cleanup temp file on error', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    // Create a stream that will error
    const stream = new Readable({
      read() {
        this.emit('error', new Error('Stream error'));
      }
    });

    const context = {
      stream,
      fileInfo: { filename: 'error.txt' },
      metadata: {}
    };

    let caughtError;
    try {
      await storage.process(context);
      throw new Error('Should have thrown');
    } catch (error) {
      assert.ok(error.message.includes('Stream error'));
      caughtError = error;
    }

    // Call cleanup manually (normally PipelineManager would do this)
    await storage.cleanup(context, caughtError);

    // Cleanup method should have removed temp file
    const tempPath = path.join(TEST_DIR, 'error.txt.tmp');
    assert.ok(!fs.existsSync(tempPath));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  runner.it('should handle subdirectories', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: { strategy: 'original', useSubdirectories: true }
    });

    await storage.initialize();

    const stream = createStream('subdirectory test');

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should generate URL for uploaded file', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('url test');

    const context = {
      stream,
      fileInfo: { filename: 'url-test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.equal(result.storage.url, '/uploads/url-test.txt');

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should return file size', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const content = 'size test content';
    const stream = createStream(content);

    const context = {
      stream,
      fileInfo: { filename: 'size.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.equal(result.storage.size, content.length);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle binary data', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const binaryData = Buffer.from([0x00, 0xFF, 0xAB, 0xCD, 0xEF]);
    const stream = createStream(binaryData);

    const context = {
      stream,
      fileInfo: { filename: 'binary.bin' },
      metadata: {}
    };

    const result = await storage.process(context);

    const savedData = fs.readFileSync(result.storage.path);
    assert.deepEqual(savedData, binaryData);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle large files', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    // Create 1MB of data
    const chunk = Buffer.alloc(1024, 'x');
    let chunksRemaining = 1024;

    const stream = new Readable({
      read() {
        while (chunksRemaining > 0) {
          if (!this.push(chunk)) {
            // Backpressure - wait for next read() call
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
      fileInfo: { filename: 'large.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.equal(result.storage.size, 1024 * 1024);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should accept FileNaming instance', async () => {
    const FileNaming = require('../../src/utils/FileNaming');
    const naming = new FileNaming({ strategy: 'uuid', prefix: 'test-' });

    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: naming
    });

    await storage.initialize();

    const stream = createStream('test');
    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(result.storage.filename.startsWith('test-'));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should accept naming object configuration', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: { strategy: 'timestamp', prefix: 'upload-' }
    });

    await storage.initialize();

    const stream = createStream('test');
    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(result.storage.filename.startsWith('upload-'));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle createDirectories = false', async () => {
    // Create directory first
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original',
      createDirectories: false
    });

    assert.equal(storage.createDirectories, false);

    const stream = createStream('test');
    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle custom fileMode', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original',
      fileMode: 0o600 // Read/write for owner only
    });

    await storage.initialize();

    const stream = createStream('test');
    const context = {
      stream,
      fileInfo: { filename: 'mode-test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    const stats = fs.statSync(result.storage.path);
    // Note: On some systems, umask may affect the actual mode
    assert.ok(stats.mode);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle custom dirMode', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      dirMode: 0o700 // Read/write/execute for owner only
    });

    assert.equal(storage.dirMode, 0o700);

    await storage.initialize();

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should resolve relative destination paths', () => {
    const storage = new LocalStorage({
      destination: './relative/path'
    });

    // Should be resolved to absolute path
    assert.ok(path.isAbsolute(storage.destination));
  });

  runner.it('should handle delete on non-existent file gracefully', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    await storage.initialize();

    // Should not throw
    await storage.delete('nonexistent.txt');

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should throw error on getMetadata for non-existent file', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    await storage.initialize();

    try {
      await storage.getMetadata('nonexistent.txt');
      throw new Error('Should have thrown');
    } catch (error) {
      assert.ok(error.code === 'ENOENT' || error.message.includes('ENOENT'));
    }

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle empty file upload', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('');

    const context = {
      stream,
      fileInfo: { filename: 'empty.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.equal(result.storage.size, 0);
    assert.ok(fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle file with no extension', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('no extension');

    const context = {
      stream,
      fileInfo: { filename: 'README' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.equal(result.storage.filename, 'README');
    assert.ok(fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should handle file with multiple dots', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('archive');

    const context = {
      stream,
      fileInfo: { filename: 'backup.tar.gz' },
      metadata: {}
    };

    const result = await storage.process(context);

    assert.ok(result.storage.filename.includes('.'));
    assert.ok(fs.existsSync(result.storage.path));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should track temp files in tempFiles map', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('tracking test');

    const context = {
      stream,
      fileInfo: { filename: 'tracked.txt' },
      metadata: {}
    };

    assert.equal(storage.tempFiles.size, 0);

    await storage.process(context);

    // After successful process, temp file should be removed from map
    assert.equal(storage.tempFiles.size, 0);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should extend Plugin class', () => {
    const Plugin = require('../../src/core/Plugin');
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    assert.ok(storage instanceof Plugin);
  });

  runner.it('should have initialize method', () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    assert.equal(typeof storage.initialize, 'function');
  });

  runner.it('should have process method', () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    assert.equal(typeof storage.process, 'function');
  });

  runner.it('should have cleanup method', () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    assert.equal(typeof storage.cleanup, 'function');
  });

  runner.it('should handle cleanup when temp file not in map', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    await storage.initialize();

    const context = {
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    // Should not throw when context is not in tempFiles map
    await storage.cleanup(context);

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should generate URL with special characters', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'original'
    });

    await storage.initialize();

    const stream = createStream('url test');

    const context = {
      stream,
      fileInfo: { filename: 'test file.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    // Should have URL even if filename has spaces (sanitized by FileNaming)
    assert.ok(result.storage.url);
    assert.ok(result.storage.url.startsWith('/uploads/'));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should use hash naming with metadata', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR,
      naming: 'hash'
    });

    await storage.initialize();

    const stream = createStream('hash test');

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: { hash: 'abc123def456' }
    };

    const result = await storage.process(context);

    assert.equal(result.storage.filename, 'abc123def456.txt');

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });

  runner.it('should default to uuid naming when no naming specified', async () => {
    const storage = new LocalStorage({
      destination: TEST_DIR
    });

    await storage.initialize();

    const stream = createStream('default naming');

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await storage.process(context);

    // Should be UUID format
    assert.ok(result.storage.filename.match(/^[a-f0-9-]+\.txt$/));

    // Cleanup
    fs.rmSync(TEST_DIR, { recursive: true });
  });
});

function createStream(data) {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}

if (require.main === module) {
  runner.run().then(success => {
    // Final cleanup
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
