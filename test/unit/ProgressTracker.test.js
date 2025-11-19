/**
 * ProgressTracker Tests - Basic coverage
 */

const { TestRunner, assert } = require('../test-runner');
const { ProgressTracker } = require('../../src/observability/ProgressTracker');

const runner = new TestRunner();

runner.describe('ProgressTracker', () => {
  runner.it('should initialize', () => {
    const tracker = new ProgressTracker();
    assert.ok(tracker);
  });

  runner.it('should get statistics', () => {
    const tracker = new ProgressTracker();
    const stats = tracker.getStatistics();
    assert.ok(stats);
    assert.ok(stats.active);
    assert.ok(stats.completed);
    assert.ok(stats.overall);
  });

  runner.it('should get active uploads', () => {
    const tracker = new ProgressTracker();
    const uploads = tracker.getActiveUploads();
    assert.ok(Array.isArray(uploads));
  });

  runner.it('should get completed uploads', () => {
    const tracker = new ProgressTracker();
    const uploads = tracker.getCompletedUploads();
    assert.ok(Array.isArray(uploads));
  });

  runner.it('should clear history', () => {
    const tracker = new ProgressTracker();
    tracker.clearHistory();
    const stats = tracker.getStatistics();
    assert.ok(stats.completed);
  });

  runner.it('should create progress stream', () => {
    const tracker = new ProgressTracker();
    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 1000
    });
    assert.ok(stream);
    assert.ok(stream.readable);
  });

  runner.it('should accept emit interval option', () => {
    const tracker = new ProgressTracker({ emitInterval: 100 });
    assert.ok(tracker);
  });

  runner.it('should have EventEmitter methods', () => {
    const tracker = new ProgressTracker();
    assert.ok(typeof tracker.on === 'function');
    assert.ok(typeof tracker.emit === 'function');
  });

  runner.it('should track progress for specific file', () => {
    const tracker = new ProgressTracker();
    const stream = tracker.createProgressStream({
      fileId: 'test-file-1',
      filename: 'test.txt',
      totalBytes: 1000
    });

    const progress = tracker.getProgress('test-file-1');
    assert.ok(progress);
    assert.equal(progress.fileId, 'test-file-1');
    assert.equal(progress.filename, 'test.txt');
    assert.equal(progress.status, 'active');
  });

  runner.it('should return undefined for non-existent file progress', () => {
    const tracker = new ProgressTracker();
    const progress = tracker.getProgress('non-existent');
    assert.equal(progress, undefined);
  });

  runner.it('should generate unique file IDs', () => {
    const tracker = new ProgressTracker();
    const stream1 = tracker.createProgressStream({ filename: 'file1.txt', totalBytes: 100 });
    const stream2 = tracker.createProgressStream({ filename: 'file2.txt', totalBytes: 200 });

    const active = tracker.getActiveUploads();
    assert.equal(active.length, 2);
    assert.notEqual(active[0].fileId, active[1].fileId);
  });

  runner.it('should calculate success rate in statistics', () => {
    const tracker = new ProgressTracker();

    // Manually add some completed uploads
    tracker.completedUploads.set('file1', { status: 'success', bytesProcessed: 100 });
    tracker.completedUploads.set('file2', { status: 'success', bytesProcessed: 200 });
    tracker.completedUploads.set('file3', { status: 'error', bytesProcessed: 50 });

    const stats = tracker.getStatistics();
    assert.equal(stats.completed.successCount, 2);
    assert.equal(stats.completed.errorCount, 1);
    assert.equal(stats.completed.successRate, 67); // 2/3 * 100 = 66.67 rounded to 67
  });

  runner.it('should limit completed history size', () => {
    const tracker = new ProgressTracker({ maxCompletedHistory: 3 });

    // Simulate completing 5 uploads
    for (let i = 1; i <= 5; i++) {
      tracker.activeUploads.set(`file${i}`, {
        fileId: `file${i}`,
        filename: `test${i}.txt`,
        startTime: Date.now()
      });
      tracker._completeUpload(`file${i}`, 'success');
    }

    const completed = tracker.getCompletedUploads();
    assert.equal(completed.length, 3); // Should only keep last 3
  });

  runner.it('should emit started event when stream pipes', async () => {
    const tracker = new ProgressTracker();
    const { Readable } = require('stream');

    const started = new Promise((resolve) => {
      tracker.on('started', (data) => {
        assert.equal(data.filename, 'test.txt');
        assert.ok(data.timestamp);
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 100
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('test'));
        this.push(null);
      }
    });

    source.pipe(stream);
    await started;
  });

  runner.it('should emit completed event when stream finishes', async () => {
    const tracker = new ProgressTracker();
    const { Readable } = require('stream');

    const completed = new Promise((resolve) => {
      tracker.on('completed', (data) => {
        assert.equal(data.filename, 'test.txt');
        assert.ok(data.bytesProcessed > 0);
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 100
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('test data'));
        this.push(null);
      }
    });

    source.pipe(stream);
    await completed;
  });

  runner.it('should calculate percentage correctly', async () => {
    const tracker = new ProgressTracker({ emitInterval: 0 }); // Emit immediately
    const { Readable } = require('stream');

    let progressReceived = false;

    const completed = new Promise((resolve) => {
      tracker.on('progress', (data) => {
        if (!progressReceived) {
          progressReceived = true;
          assert.ok(data.percentage >= 0 && data.percentage <= 100);
          assert.equal(data.totalBytes, 100);
        }
      });

      tracker.on('completed', () => {
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 100
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('x'.repeat(50)));
        this.push(Buffer.from('x'.repeat(50)));
        this.push(null);
      }
    });

    source.pipe(stream);
    await completed;
  });

  runner.it('should calculate bytes per second', async () => {
    const tracker = new ProgressTracker({ emitInterval: 0 });
    const { Readable } = require('stream');

    const completed = new Promise((resolve) => {
      tracker.on('completed', (data) => {
        assert.ok(data.bytesPerSecond >= 0);
        assert.ok(data.elapsed >= 0);
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 100
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('x'.repeat(100)));
        this.push(null);
      }
    });

    source.pipe(stream);
    await completed;
  });

  runner.it('should track bytes processed', async () => {
    const tracker = new ProgressTracker();
    const { Readable } = require('stream');
    const testData = Buffer.from('x'.repeat(1000));

    const completed = new Promise((resolve) => {
      tracker.on('completed', (data) => {
        assert.equal(data.bytesProcessed, 1000);
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 1000
    });

    const source = new Readable({
      read() {
        this.push(testData);
        this.push(null);
      }
    });

    source.pipe(stream);
    await completed;
  });

  runner.it('should move upload from active to completed', async () => {
    const tracker = new ProgressTracker();
    const { Readable } = require('stream');

    const fileId = 'test-file';

    const stream = tracker.createProgressStream({
      fileId,
      filename: 'test.txt',
      totalBytes: 100
    });

    assert.equal(tracker.getActiveUploads().length, 1);

    const finished = new Promise((resolve) => {
      stream.on('finish', () => {
        setTimeout(() => {
          assert.equal(tracker.getActiveUploads().length, 0);
          assert.equal(tracker.getCompletedUploads().length, 1);

          const completed = tracker.getProgress(fileId);
          assert.equal(completed.status, 'success');
          assert.ok(completed.duration >= 0);
          resolve();
        }, 10);
      });
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('test'));
        this.push(null);
      }
    });

    source.pipe(stream);
    await finished;
  });

  runner.it('should handle stream errors', async () => {
    const tracker = new ProgressTracker();
    const { Readable, PassThrough } = require('stream');

    const fileId = 'error-file';

    const errorReceived = new Promise((resolve) => {
      tracker.on('error', (data) => {
        assert.ok(data.error);
        assert.equal(data.filename, 'test.txt');
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      fileId,
      filename: 'test.txt',
      totalBytes: 100
    });

    // Use PassThrough and emit error on the stream directly
    const source = new PassThrough();
    source.pipe(stream);

    // Emit error after piping
    setImmediate(() => {
      stream.emit('error', new Error('Test error'));
    });

    await errorReceived;
  });

  runner.it('should respect custom emit interval', () => {
    const tracker = new ProgressTracker({ emitInterval: 1000 });
    assert.equal(tracker.emitInterval, 1000);

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 100
    });

    // The stream should inherit the emit interval
    // We can't easily test timing in unit tests, just verify it's set
    assert.ok(stream);
  });

  runner.it('should handle maxCompletedHistory option', () => {
    const tracker = new ProgressTracker({ maxCompletedHistory: 50 });
    assert.equal(tracker.maxCompletedHistory, 50);
  });

  runner.it('should default maxCompletedHistory to 100', () => {
    const tracker = new ProgressTracker();
    assert.equal(tracker.maxCompletedHistory, 100);
  });

  runner.it('should calculate estimated time remaining', async () => {
    const tracker = new ProgressTracker({ emitInterval: 0 });
    const { Readable } = require('stream');

    const completed = new Promise((resolve) => {
      tracker.on('progress', (data) => {
        // estimatedTimeRemaining should be a number >= 0
        assert.ok(typeof data.estimatedTimeRemaining === 'number');
        assert.ok(data.estimatedTimeRemaining >= 0);
      });

      tracker.on('completed', () => {
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 1000
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('x'.repeat(500)));
        this.push(Buffer.from('x'.repeat(500)));
        this.push(null);
      }
    });

    source.pipe(stream);
    await completed;
  });

  runner.it('should include timestamp in progress events', async () => {
    const tracker = new ProgressTracker();
    const { Readable } = require('stream');

    const started = new Promise((resolve) => {
      tracker.on('started', (data) => {
        assert.ok(data.timestamp);
        assert.ok(new Date(data.timestamp).getTime() > 0);
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt',
      totalBytes: 100
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('test'));
        this.push(null);
      }
    });

    source.pipe(stream);
    await started;
  });

  runner.it('should handle uploads with unknown total bytes', async () => {
    const tracker = new ProgressTracker();
    const { Readable } = require('stream');

    const completed = new Promise((resolve) => {
      tracker.on('completed', (data) => {
        assert.equal(data.totalBytes, 0); // Should default to 0
        assert.equal(data.percentage, 0); // Can't calculate percentage without total
        assert.ok(data.bytesProcessed > 0);
        resolve();
      });
    });

    const stream = tracker.createProgressStream({
      filename: 'test.txt'
      // totalBytes not provided
    });

    const source = new Readable({
      read() {
        this.push(Buffer.from('test data'));
        this.push(null);
      }
    });

    source.pipe(stream);
    await completed;
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
