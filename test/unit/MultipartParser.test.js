/**
 * MultipartParser Tests
 */

const { TestRunner, assert } = require('../test-runner');
const MultipartParser = require('../../src/core/MultipartParser');
const { Readable } = require('stream');

const runner = new TestRunner();

runner.describe('MultipartParser', () => {
  runner.it('should require boundary', () => {
    assert.throws(() => {
      new MultipartParser({});
    }, 'Boundary is required');
  });

  runner.it('should initialize with boundary', () => {
    const parser = new MultipartParser({
      boundary: 'test-boundary-123'
    });

    assert.ok(parser);
    assert.ok(parser.boundary);
  });

  runner.it('should parse simple field', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="username"',
      '',
      'john_doe',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fieldReceived = false;

      parser.on('field', (name, value) => {
        assert.equal(name, 'username');
        assert.equal(value, 'john_doe');
        fieldReceived = true;
      });

      parser.on('finish', () => {
        try {
          assert.ok(fieldReceived);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should parse multiple fields', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="username"',
      '',
      'john_doe',
      `--${boundary}`,
      'Content-Disposition: form-data; name="email"',
      '',
      'john@example.com',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      const fields = [];

      parser.on('field', (name, value) => {
        fields.push({ name, value });
      });

      parser.on('finish', () => {
        try {
          assert.equal(fields.length, 2);
          assert.equal(fields[0].name, 'username');
          assert.equal(fields[0].value, 'john_doe');
          assert.equal(fields[1].name, 'email');
          assert.equal(fields[1].value, 'john@example.com');
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should parse file upload', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const fileContent = 'Hello, World!';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.txt"',
      'Content-Type: text/plain',
      '',
      fileContent,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fileReceived = false;
      let fileStreamEnded = false;

      parser.on('file', (fileInfo, stream) => {
        try {
          assert.equal(fileInfo.fieldName, 'file');
          assert.equal(fileInfo.filename, 'test.txt');
          assert.equal(fileInfo.mimeType, 'text/plain');

          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('end', () => {
            try {
              const content = Buffer.concat(chunks).toString();
              assert.equal(content, fileContent);
              fileReceived = true;
              fileStreamEnded = true;
            } catch (err) {
              reject(err);
            }
          });
          stream.on('error', reject);
        } catch (err) {
          reject(err);
        }
      });

      parser.on('finish', async () => {
        try {
          // Wait a tick for file stream to complete
          await new Promise(r => setImmediate(r));
          assert.ok(fileReceived);
          assert.ok(fileStreamEnded);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should extract boundary from Content-Type', () => {
    const contentType = 'multipart/form-data; boundary=----WebKitFormBoundary123';
    const boundary = MultipartParser.getBoundary(contentType);

    assert.equal(boundary, '----WebKitFormBoundary123');
  });

  runner.it('should handle quoted boundary', () => {
    const contentType = 'multipart/form-data; boundary="----WebKitFormBoundary123"';
    const boundary = MultipartParser.getBoundary(contentType);

    assert.equal(boundary, '----WebKitFormBoundary123');
  });

  runner.it('should throw on missing boundary in Content-Type', () => {
    assert.throws(() => {
      MultipartParser.getBoundary('multipart/form-data');
    }, 'Missing boundary');
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
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
