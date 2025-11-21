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

  runner.it('should build standard AWS S3 URL', () => {
    const storage = new S3Storage({
      bucket: 'my-bucket',
      region: 'us-west-2',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    const url = storage._buildUrl('test-file.jpg');
    assert.ok(url.includes('my-bucket.s3.us-west-2.amazonaws.com'));
    assert.ok(url.includes('test-file.jpg'));
  });

  runner.it('should build URL with custom endpoint', () => {
    const storage = new S3Storage({
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      endpoint: 'https://minio.example.com'
    });

    const url = storage._buildUrl('test-file.jpg');
    assert.ok(url.includes('minio.example.com'));
    assert.ok(url.includes('my-bucket'));
    assert.ok(url.includes('test-file.jpg'));
  });

  runner.it('should build URL with trailing slash in endpoint', () => {
    const storage = new S3Storage({
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      endpoint: 'https://spaces.example.com/'
    });

    const url = storage._buildUrl('file.pdf');
    assert.ok(!url.includes('//my-bucket')); // No double slash
    assert.ok(url.includes('spaces.example.com/my-bucket'));
  });

  runner.it('should encode special characters in key', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    const url = storage._buildUrl('file with spaces.jpg');
    assert.ok(url.includes('file%20with%20spaces.jpg'));
  });

  runner.it('should build public URL', () => {
    const storage = new S3Storage({
      bucket: 'public-bucket',
      region: 'eu-central-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    const url = storage._buildPublicUrl('image.png');
    assert.ok(url.includes('public-bucket.s3.eu-central-1.amazonaws.com'));
    assert.ok(url.includes('image.png'));
  });

  runner.it('should build public URL with custom endpoint', () => {
    const storage = new S3Storage({
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      endpoint: 'https://cdn.example.com'
    });

    const url = storage._buildPublicUrl('photo.jpg');
    assert.ok(url.includes('cdn.example.com'));
    assert.ok(url.includes('my-bucket'));
    assert.ok(url.includes('photo.jpg'));
  });

  runner.it('should generate presigned URL', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    });

    const url = storage.generatePresignedUrl('upload.pdf');
    assert.ok(url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
    assert.ok(url.includes('X-Amz-Credential='));
    assert.ok(url.includes('X-Amz-Signature='));
  });

  runner.it('should generate presigned URL with custom expiration', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    });

    const url = storage.generatePresignedUrl('file.txt', { expiresIn: 7200 });
    assert.ok(url.includes('X-Amz-Expires=7200'));
  });

  runner.it('should default to uuid naming strategy', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    assert.ok(storage.naming);
    assert.equal(storage.naming.strategy, 'uuid');
  });

  runner.it('should accept string naming strategy', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      naming: 'timestamp'
    });

    assert.equal(storage.naming.strategy, 'timestamp');
  });

  runner.it('should accept object naming strategy', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      naming: { strategy: 'original', preserveExtension: true }
    });

    assert.equal(storage.naming.strategy, 'original');
  });

  runner.it('should accept FileNaming instance', () => {
    const FileNaming = require('../../src/utils/FileNaming');
    const customNaming = new FileNaming({ strategy: 'uuid' });

    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      naming: customNaming
    });

    assert.equal(storage.naming, customNaming);
  });

  runner.it('should default to private ACL', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    assert.equal(storage.acl, 'private');
  });

  runner.it('should accept custom ACL', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      acl: 'public-read'
    });

    assert.equal(storage.acl, 'public-read');
  });

  runner.it('should default to STANDARD storage class', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    assert.equal(storage.storageClass, 'STANDARD');
  });

  runner.it('should accept custom storage class', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      storageClass: 'GLACIER'
    });

    assert.equal(storage.storageClass, 'GLACIER');
  });

  runner.it('should accept custom metadata', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      metadata: {
        uploader: 'test-user',
        application: 'flux-upload'
      }
    });

    assert.ok(storage.customMetadata);
    assert.equal(storage.customMetadata.uploader, 'test-user');
    assert.equal(storage.customMetadata.application, 'flux-upload');
  });

  runner.it('should accept session token for temporary credentials', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'temp-key',
      secretAccessKey: 'temp-secret',
      sessionToken: 'session-token-123'
    });

    assert.ok(storage.signer);
    assert.equal(storage.signer.sessionToken, 'session-token-123');
  });

  runner.it('should initialize uploadedKeys map', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    assert.ok(storage.uploadedKeys instanceof Map);
    assert.equal(storage.uploadedKeys.size, 0);
  });

  runner.it('should handle empty prefix', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      prefix: ''
    });

    assert.equal(storage.prefix, '');
  });

  runner.it('should normalize prefix with trailing slash', () => {
    // Prefix validation removes leading/trailing slashes for safety
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      prefix: 'uploads/'
    });

    // Trailing slash is removed by _validatePrefix
    assert.equal(storage.prefix, 'uploads');
  });

  runner.it('should accept prefix without trailing slash', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      prefix: 'documents'
    });

    assert.equal(storage.prefix, 'documents');
  });

  runner.it('should have signer instance', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret'
    });

    assert.ok(storage.signer);
    assert.equal(storage.signer.accessKeyId, 'test-key');
    assert.equal(storage.signer.region, 'us-east-1');
    assert.equal(storage.signer.service, 's3');
  });

  runner.it('should throw error without accessKeyId', () => {
    assert.throws(() => {
      new S3Storage({
        bucket: 'test-bucket',
        region: 'us-east-1',
        secretAccessKey: 'test'
      });
    }, 'required');
  });

  runner.it('should throw error without secretAccessKey', () => {
    assert.throws(() => {
      new S3Storage({
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'test'
      });
    }, 'required');
  });

  runner.it('should encode unicode characters in key', () => {
    const storage = new S3Storage({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test'
    });

    const url = storage._buildUrl('文档.pdf');
    assert.ok(url.includes('%')); // Should be URL encoded
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
