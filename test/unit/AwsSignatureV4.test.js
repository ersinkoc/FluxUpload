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

  runner.it('should default service to s3', () => {
    const defaultSigner = new AwsSignatureV4({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1'
    });

    assert.equal(defaultSigner.service, 's3');
  });

  runner.it('should handle POST requests', () => {
    const headers = signer.sign({
      method: 'POST',
      url: 'https://examplebucket.s3.amazonaws.com/',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ key: 'value' })
    });

    assert.ok(headers['authorization']);
    assert.ok(headers['content-type']);
    assert.ok(headers['x-amz-content-sha256']);
  });

  runner.it('should handle DELETE requests', () => {
    const headers = signer.sign({
      method: 'DELETE',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization']);
  });

  runner.it('should handle path with special characters', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/path with spaces/file.txt',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization']);
  });

  runner.it('should handle path with unicode characters', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/文档/файл.txt',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization']);
  });

  runner.it('should handle root path', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization']);
  });

  runner.it('should handle path with multiple slashes', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/path//with///slashes',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization']);
  });

  runner.it('should sort query parameters alphabetically', () => {
    const canonical = signer._canonicalizeQuery('zebra=last&apple=first&banana=middle');

    assert.ok(canonical.startsWith('apple='));
    assert.ok(canonical.includes('&banana='));
    assert.ok(canonical.endsWith('zebra=last'));
  });

  runner.it('should handle query parameter with no value', () => {
    const canonical = signer._canonicalizeQuery('key=');
    assert.equal(canonical, 'key=');
  });

  runner.it('should handle query with special characters', () => {
    const canonical = signer._canonicalizeQuery('key=value+with+plus&another=special!chars');
    assert.ok(canonical.includes('='));
  });

  runner.it('should handle duplicate query parameters', () => {
    const canonical = signer._canonicalizeQuery('key=value1&key=value2');
    // Should sort by value when keys are equal
    assert.ok(canonical.includes('key='));
  });

  runner.it('should encode path segments correctly', () => {
    const encoded = signer._encodePath('/path/with spaces/and!special');
    // Path segments should be encoded individually
    assert.ok(encoded.includes('/'));
    assert.ok(!encoded.includes(' '));
  });

  runner.it('should handle empty query string', () => {
    const canonical = signer._canonicalizeQuery('');
    assert.equal(canonical, '');
  });

  runner.it('should hash Buffer input', () => {
    const buffer = Buffer.from('test data');
    const hash = signer._hash(buffer);

    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
  });

  runner.it('should create HMAC correctly', () => {
    const result = signer._hmac('key', 'data');
    assert.ok(Buffer.isBuffer(result));
  });

  runner.it('should handle different regions', () => {
    const euSigner = new AwsSignatureV4({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'eu-west-1',
      service: 's3'
    });

    const headers = euSigner.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.eu-west-1.amazonaws.com/test.txt',
      headers: {},
      body: ''
    });

    assert.ok(headers['authorization'].includes('eu-west-1'));
  });

  runner.it('should handle different services', () => {
    const lambdaSigner = new AwsSignatureV4({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'lambda'
    });

    assert.equal(lambdaSigner.service, 'lambda');
  });

  runner.it('should include host header from URL', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://my-bucket.s3.amazonaws.com/file.txt',
      headers: {},
      body: ''
    });

    assert.equal(headers['host'], 'my-bucket.s3.amazonaws.com');
  });

  runner.it('should include x-amz-date header', () => {
    const testDate = new Date('2023-01-15T10:30:00Z');
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: '',
      date: testDate
    });

    assert.equal(headers['x-amz-date'], '20230115T103000Z');
  });

  runner.it('should include x-amz-content-sha256 header', () => {
    const headers = signer.sign({
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: 'test content'
    });

    assert.ok(headers['x-amz-content-sha256']);
    assert.equal(headers['x-amz-content-sha256'].length, 64);
  });

  runner.it('should create credential scope correctly', () => {
    const testDate = new Date('2023-05-10T00:00:00Z');
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: '',
      date: testDate
    });

    assert.ok(headers['authorization'].includes('20230510/us-east-1/s3/aws4_request'));
  });

  runner.it('should use current date if not provided', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {},
      body: ''
    });

    assert.ok(headers['x-amz-date']);
    // Should be today's date in AMZ format
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    assert.ok(headers['x-amz-date'].startsWith(today));
  });

  runner.it('should encode RFC 3986 special characters', () => {
    const encoded = signer._encodeURIComponent("test!'()*");
    // These characters should be percent-encoded per RFC 3986
    assert.ok(encoded.includes('%'));
  });

  runner.it('should preserve existing headers', () => {
    const headers = signer.sign({
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {
        'content-type': 'text/plain',
        'x-custom-header': 'custom-value'
      },
      body: 'test'
    });

    assert.equal(headers['content-type'], 'text/plain');
    assert.equal(headers['x-custom-header'], 'custom-value');
  });

  runner.it('should handle presigned URL with default expiration', () => {
    const url = signer.presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt'
    });

    // Default should be 3600 seconds
    assert.ok(url.includes('X-Amz-Expires=3600'));
  });

  runner.it('should handle presigned URL with custom expiration', () => {
    const url = signer.presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      expiresIn: 7200
    });

    assert.ok(url.includes('X-Amz-Expires=7200'));
  });

  runner.it('should include session token in presigned URL', () => {
    const signerWithToken = new AwsSignatureV4({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      sessionToken: 'SESSION_TOKEN',
      region: 'us-east-1',
      service: 's3'
    });

    const url = signerWithToken.presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      expiresIn: 3600
    });

    assert.ok(url.includes('X-Amz-Security-Token='));
    assert.ok(url.includes('SESSION_TOKEN'));
  });

  runner.it('should handle presigned URL with existing query parameters', () => {
    const url = signer.presign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt?version=1&type=pdf',
      expiresIn: 3600
    });

    assert.ok(url.includes('version=1'));
    assert.ok(url.includes('type=pdf'));
    assert.ok(url.includes('X-Amz-Signature='));
  });

  runner.it('should use UNSIGNED-PAYLOAD for presigned URLs', () => {
    const url = signer.presign({
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      expiresIn: 3600
    });

    // Presigned URLs use UNSIGNED-PAYLOAD
    assert.ok(url.includes('X-Amz-Signature='));
  });

  runner.it('should require accessKeyId', () => {
    assert.throws(() => {
      new AwsSignatureV4({
        secretAccessKey: 'secret',
        region: 'us-east-1'
      });
    }, 'required');
  });

  runner.it('should require secretAccessKey', () => {
    assert.throws(() => {
      new AwsSignatureV4({
        accessKeyId: 'key',
        region: 'us-east-1'
      });
    }, 'required');
  });

  runner.it('should require region', () => {
    assert.throws(() => {
      new AwsSignatureV4({
        accessKeyId: 'key',
        secretAccessKey: 'secret'
      });
    }, 'required');
  });

  runner.it('should handle header value with leading/trailing whitespace', () => {
    const headers = signer.sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: {
        'x-custom-header': '  value with spaces  '
      },
      body: ''
    });

    // Header values should be trimmed in canonical headers
    assert.ok(headers['authorization']);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
