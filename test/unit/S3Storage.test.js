/**
 * S3Storage Tests - Basic coverage
 */

const { TestRunner, assert } = require('../test-runner');
const S3Storage = require('../../src/storage/S3Storage');

const runner = new TestRunner();

runner.describe('S3Storage', () => {
  runner.it('should require bucket config', () => {
    assert.throws(() => {
      new S3Storage({});
    });
  });

  runner.it('should require region config', () => {
    assert.throws(() => {
      new S3Storage({ bucket: 'test' });
    });
  });

  runner.it('should require credentials', () => {
    assert.throws(() => {
      new S3Storage({
        bucket: 'test-bucket',
        region: 'us-east-1'
      });
    });
  });

  runner.it('should be Plugin subclass', () => {
    const Plugin = require('../../src/core/Plugin');
    assert.ok(S3Storage.prototype instanceof Plugin);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
