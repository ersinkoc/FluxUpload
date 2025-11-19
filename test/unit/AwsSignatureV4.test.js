/**
 * AwsSignatureV4 Tests
 */

const { TestRunner, assert } = require('../test-runner');
const AwsSignatureV4 = require('../../src/utils/AwsSignatureV4');

const runner = new TestRunner();

runner.describe('AwsSignatureV4', () => {
  const signer = new AwsSignatureV4({
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 's3'
  });

  runner.it('should initialize with required config', () => {
    assert.equal(signer.accessKeyId, 'AKIAIOSFODNN7EXAMPLE');
    assert.equal(signer.region, 'us-east-1');
    assert.equal(signer.service, 's3');
  });

  runner.it('should throw error without required config', () => {
    assert.throws(() => {
      new AwsSignatureV4({});
    }, 'accessKeyId, secretAccessKey, and region are required');
  });

  runner.it('should sign HTTP request', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: '',
      date: new Date('2023-01-01T00:00:00Z')
    });

    assert.ok(headers['authorization'], 'Should have authorization header');
    assert.ok(headers['authorization'].startsWith('AWS4-HMAC-SHA256'));
    assert.ok(headers['x-amz-date']);
    assert.ok(headers['x-amz-content-sha256']);
  });

  runner.it('should include session token if provided', () => {
    const signerWithToken = new AwsSignatureV4({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'SESSION_TOKEN',
      region: 'us-east-1',
      service: 's3'
    });

    const headers = signerWithToken.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: ''
    });

    assert.ok(headers['x-amz-security-token']);
    assert.equal(headers['x-amz-security-token'], 'SESSION_TOKEN');
  });

  runner.it('should generate presigned URL', () => {
    const url = signer.presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      expiresIn: 3600
    });

    assert.ok(url.includes('X-Amz-Algorithm=AWS4-HMAC-SHA256'));
    assert.ok(url.includes('X-Amz-Credential='));
    assert.ok(url.includes('X-Amz-Date='));
    assert.ok(url.includes('X-Amz-Expires=3600'));
    assert.ok(url.includes('X-Amz-Signature='));
  });

  runner.it('should handle PUT requests', () => {
    const headers = signer.sign({
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {
        'content-type': 'text/plain'
      },
      body: 'test content'
    });

    assert.ok(headers['authorization']);
    assert.ok(headers['content-type']);
  });

  runner.it('should handle query parameters', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt?key1=value1&key2=value2',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization']);
  });

  runner.it('should generate correct date formats', () => {
    const testDate = new Date('2023-06-15T14:30:00Z');
    const amzDate = signer._getAmzDate(testDate);
    const dateStamp = signer._getDateStamp(testDate);

    assert.equal(amzDate, '20230615T143000Z');
    assert.equal(dateStamp, '20230615');
  });

  runner.it('should encode URI components correctly', () => {
    const encoded = signer._encodeURIComponent('test file.txt');
    assert.ok(encoded.includes('test'));
    assert.ok(encoded.includes('file'));
  });

  runner.it('should canonicalize query strings', () => {
    const canonical = signer._canonicalizeQuery('z=last&a=first&b=second');
    assert.ok(canonical.startsWith('a='));
    assert.ok(canonical.endsWith('last'));
  });

  runner.it('should handle empty body', () => {
    const hash = signer._hash('');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64); // SHA256 hex length
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
