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

  runner.it('should accept ACL configuration', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      acl: 'public-read'
    });
    assert.ok(storage);
  });

  runner.it('should accept naming strategy', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      naming: 'uuid'
    });
    assert.ok(storage);
  });

  runner.it('should accept prefix configuration', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      prefix: 'uploads/'
    });
    assert.ok(storage);
  });

  runner.it('should have initialize method', async () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });
    assert.ok(typeof storage.initialize === 'function');
    await storage.initialize();
  });

  runner.it('should have shutdown method', async () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });
    assert.ok(typeof storage.shutdown === 'function');
    await storage.shutdown();
  });

  runner.it('should have process method', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });
    assert.ok(typeof storage.process === 'function');
  });

  runner.it('should have cleanup method', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });
    assert.ok(typeof storage.cleanup === 'function');
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
