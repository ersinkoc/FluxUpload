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
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
