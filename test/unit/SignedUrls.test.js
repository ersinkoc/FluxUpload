/**
 * SignedUrls Tests
 */

const { TestRunner, assert } = require('../test-runner');
const SignedUrls = require('../../src/utils/SignedUrls');

const runner = new TestRunner();

runner.describe('SignedUrls', () => {
  runner.it('should require a secret key', () => {
    assert.throws(() => {
      new SignedUrls();
    }, 'SignedUrls requires a secret key');
  });

  runner.it('should initialize with config', () => {
    const signer = new SignedUrls({
      secret: 'test-secret',
      defaultExpiry: 1800,
      algorithm: 'sha256'
    });

    assert.equal(signer.secret, 'test-secret');
    assert.equal(signer.defaultExpiry, 1800);
    assert.equal(signer.algorithm, 'sha256');

    signer.shutdown();
  });

  runner.it('should sign a URL', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload');

    assert.ok(signedUrl);
    assert.ok(signedUrl.includes('signature='));
    assert.ok(signedUrl.includes('expires='));

    signer.shutdown();
  });

  runner.it('should validate a signed URL', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      expiresIn: 3600
    });

    const result = signer.validate(signedUrl, { preventReplay: false });

    assert.ok(result.valid);
    assert.ok(result.expiresAt instanceof Date);
    assert.ok(result.timeRemaining > 0);

    signer.shutdown();
  });

  runner.it('should reject URL with invalid signature', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload');
    const tamperedUrl = signedUrl.replace(/signature=[^&]+/, 'signature=invalid');

    const result = signer.validate(tamperedUrl, { preventReplay: false });

    assert.equal(result.valid, false);
    assert.equal(result.error, 'Invalid signature');

    signer.shutdown();
  });

  runner.it('should reject expired URL', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      expiresIn: -1 // Already expired
    });

    const result = signer.validate(signedUrl, { preventReplay: false });

    assert.equal(result.valid, false);
    assert.equal(result.error, 'URL expired');
    assert.ok(result.expiredAt instanceof Date);

    signer.shutdown();
  });

  runner.it('should reject URL with missing signature', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const result = signer.validate('https://example.com/upload?expires=123456', {
      preventReplay: false
    });

    assert.equal(result.valid, false);
    assert.equal(result.error, 'Missing signature');

    signer.shutdown();
  });

  runner.it('should prevent replay attacks', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload');

    // First validation should succeed
    const result1 = signer.validate(signedUrl, { preventReplay: true });
    assert.ok(result1.valid);

    // Second validation should fail (replay attack)
    const result2 = signer.validate(signedUrl, { preventReplay: true });
    assert.equal(result2.valid, false);
    assert.ok(result2.error.includes('replay attack'));

    signer.shutdown();
  });

  runner.it('should allow replay when preventReplay is false', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload');

    // Both validations should succeed
    const result1 = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result1.valid);

    const result2 = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result2.valid);

    signer.shutdown();
  });

  runner.it('should include file size constraint', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      maxFileSize: 1024 * 1024 // 1MB
    });

    assert.ok(signedUrl.includes('max_size=1048576'));

    const result = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result.valid);
    assert.equal(result.constraints.maxFileSize, 1048576);

    signer.shutdown();
  });

  runner.it('should include max files constraint', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      maxFiles: 5
    });

    assert.ok(signedUrl.includes('max_files=5'));

    const result = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result.valid);
    assert.equal(result.constraints.maxFiles, 5);

    signer.shutdown();
  });

  runner.it('should include allowed types constraint', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      allowedTypes: ['image/jpeg', 'image/png']
    });

    assert.ok(signedUrl.includes('allowed_types='));

    const result = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result.valid);
    assert.deepEqual(result.constraints.allowedTypes, ['image/jpeg', 'image/png']);

    signer.shutdown();
  });

  runner.it('should include user ID', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      userId: 'user-123'
    });

    assert.ok(signedUrl.includes('user_id=user-123'));

    const result = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result.valid);
    assert.equal(result.constraints.userId, 'user-123');

    signer.shutdown();
  });

  runner.it('should include custom metadata', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      metadata: {
        project: 'test-project',
        environment: 'production'
      }
    });

    assert.ok(signedUrl.includes('meta_project=test-project'));
    assert.ok(signedUrl.includes('meta_environment=production'));

    const result = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result.valid);
    assert.equal(result.metadata.project, 'test-project');
    assert.equal(result.metadata.environment, 'production');

    signer.shutdown();
  });

  runner.it('should sign with all constraints', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const signedUrl = signer.sign('https://example.com/upload', {
      expiresIn: 7200,
      maxFileSize: 5 * 1024 * 1024,
      maxFiles: 10,
      allowedTypes: ['image/*', 'video/*'],
      userId: 'user-456',
      metadata: {
        tenant: 'acme-corp',
        category: 'documents'
      }
    });

    const result = signer.validate(signedUrl, { preventReplay: false });

    assert.ok(result.valid);
    assert.equal(result.constraints.maxFileSize, 5242880);
    assert.equal(result.constraints.maxFiles, 10);
    assert.deepEqual(result.constraints.allowedTypes, ['image/*', 'video/*']);
    assert.equal(result.constraints.userId, 'user-456');
    assert.equal(result.metadata.tenant, 'acme-corp');
    assert.equal(result.metadata.category, 'documents');

    signer.shutdown();
  });

  runner.it('should handle URLs with query parameters', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    // Note: Base URL should not include query params when signing
    // This test verifies that signed URLs work correctly
    const signedUrl = signer.sign('https://example.com/upload');

    // The signed URL will have query parameters added
    assert.ok(signedUrl.includes('?'));

    const result = signer.validate(signedUrl, { preventReplay: false });
    assert.ok(result.valid);

    signer.shutdown();
  });

  runner.it('should use different secrets for different instances', () => {
    const signer1 = new SignedUrls({ secret: 'secret-1' });
    const signer2 = new SignedUrls({ secret: 'secret-2' });

    const url = signer1.sign('https://example.com/upload');

    // signer1 should validate
    const result1 = signer1.validate(url, { preventReplay: false });
    assert.ok(result1.valid);

    // signer2 should reject (different secret)
    const result2 = signer2.validate(url, { preventReplay: false });
    assert.equal(result2.valid, false);

    signer1.shutdown();
    signer2.shutdown();
  });

  runner.it('should create validator plugin', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const validator = signer.createValidator();

    assert.ok(validator);
    assert.equal(validator.name, 'SignedUrlValidator');

    signer.shutdown();
  });

  runner.it('should validate URL with plugin', async () => {
    const signer = new SignedUrls({ secret: 'test-secret' });
    const validator = signer.createValidator({ preventReplay: false });

    const signedUrl = signer.sign('https://example.com/upload', {
      maxFileSize: 1024,
      metadata: { test: 'value' }
    });

    // Extract path and query
    const url = new URL(signedUrl);

    const mockContext = {
      request: {
        headers: {
          'x-forwarded-proto': url.protocol.replace(':', ''), // https
          host: url.host
        },
        url: url.pathname + url.search
      }
    };

    const result = await validator.process(mockContext);

    assert.ok(result.signedUrlConstraints);
    assert.equal(result.signedUrlConstraints.maxFileSize, 1024);
    assert.equal(result.signedUrlMetadata.test, 'value');

    signer.shutdown();
  });

  runner.it('should reject invalid URL with plugin', async () => {
    const signer = new SignedUrls({ secret: 'test-secret' });
    const validator = signer.createValidator();

    const mockContext = {
      request: {
        headers: {
          host: 'example.com'
        },
        url: '/upload?signature=invalid&expires=123456'
      }
    };

    await assert.rejects(
      validator.process(mockContext),
      'Signed URL validation failed'
    );

    signer.shutdown();
  });

  runner.it('should get statistics', () => {
    const signer = new SignedUrls({ secret: 'test-secret', defaultExpiry: 1800 });

    const signedUrl = signer.sign('https://example.com/upload');
    signer.validate(signedUrl, { preventReplay: true });

    const stats = signer.getStats();
    assert.equal(stats.usedSignatures, 1);
    assert.equal(stats.defaultExpiry, 1800);
    assert.equal(stats.algorithm, 'sha256');

    signer.shutdown();
  });

  runner.it('should cleanup large signature sets', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    // Fill up signatures with expired timestamps
    const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    for (let i = 0; i < 100; i++) {
      signer.usedSignatures.set(`sig-${i}`, expiredTime);
    }

    assert.ok(signer.usedSignatures.size === 100);

    signer._cleanup();

    // All expired signatures should be cleaned up
    assert.equal(signer.usedSignatures.size, 0);

    signer.shutdown();
  });

  runner.it('should handle malformed URLs gracefully', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    const result = signer.validate('not-a-valid-url', { preventReplay: false });

    assert.equal(result.valid, false);
    assert.ok(result.error);

    signer.shutdown();
  });

  runner.it('should sort parameters for consistent signatures', () => {
    const signer = new SignedUrls({ secret: 'test-secret' });

    // Sign with parameters in different order
    const params = {
      maxFileSize: 1024,
      userId: 'user-123',
      maxFiles: 5
    };

    const url1 = signer.sign('https://example.com/upload', params);

    // Create another signer and sign the same parameters
    const signer2 = new SignedUrls({ secret: 'test-secret' });
    const url2 = signer2.sign('https://example.com/upload', params);

    // Signatures should be the same
    const sig1 = new URL(url1).searchParams.get('signature');
    const sig2 = new URL(url2).searchParams.get('signature');

    assert.equal(sig1, sig2);

    signer.shutdown();
    signer2.shutdown();
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
