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

  runner.it('should handle empty field value', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="empty"',
      '',
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'empty');
        assert.equal(value, '');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle large field value', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const largeValue = 'x'.repeat(5000);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="large"',
      '',
      largeValue,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'large');
        assert.equal(value.length, 5000);
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle binary file data', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const binaryData = Buffer.from([0x00, 0x01, 0xFF, 0xFE, 0x42, 0x69, 0x6E]);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="binary"; filename="data.bin"\r\n'),
      Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
      binaryData,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => {
          const received = Buffer.concat(chunks);
          assert.equal(received.length, binaryData.length);
          assert.ok(received.equals(binaryData));
        });
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = new Readable();
      stream.push(body);
      stream.push(null);
      stream.pipe(parser);
    });
  });

  runner.it('should handle multiple files', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file1"; filename="test1.txt"',
      'Content-Type: text/plain',
      '',
      'File 1 content',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file2"; filename="test2.txt"',
      'Content-Type: text/plain',
      '',
      'File 2 content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      const files = [];

      parser.on('file', (fileInfo, stream) => {
        files.push(fileInfo.filename);
        stream.resume(); // Consume stream
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        try {
          assert.equal(files.length, 2);
          assert.equal(files[0], 'test1.txt');
          assert.equal(files[1], 'test2.txt');
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

  runner.it('should handle mixed fields and files', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="username"',
      '',
      'john',
      `--${boundary}`,
      'Content-Disposition: form-data; name="avatar"; filename="photo.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fake-image-data',
      `--${boundary}`,
      'Content-Disposition: form-data; name="email"',
      '',
      'john@example.com',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      const fields = [];
      const files = [];

      parser.on('field', (name, value) => {
        fields.push({ name, value });
      });

      parser.on('file', (fileInfo, stream) => {
        files.push(fileInfo.filename);
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        try {
          assert.equal(fields.length, 2);
          assert.equal(files.length, 1);
          assert.equal(fields[0].name, 'username');
          assert.equal(fields[1].name, 'email');
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

  runner.it('should handle content-type without filename as field', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="upload"',
      'Content-Type: text/plain',
      '',
      'some content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fieldReceived = false;

      parser.on('field', (name, value) => {
        fieldReceived = true;
        assert.equal(name, 'upload');
        assert.ok(value.length > 0);
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

  runner.it('should enforce file size limit', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { fileSize: 100 }
    });

    const largeContent = 'x'.repeat(200);
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="large.txt"',
      '',
      largeContent,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let errorReceived = false;

      parser.on('error', (err) => {
        errorReceived = true;
        assert.ok(err.message.includes('limit') || err.message.includes('size'));
        resolve();
      });

      parser.on('file', (fileInfo, stream) => {
        stream.on('error', () => {
          // File stream error is expected
        });
        stream.resume();
      });

      const stream = createStream(body);
      stream.pipe(parser);

      // Timeout fallback
      setTimeout(() => {
        if (errorReceived) {
          resolve();
        } else {
          reject(new Error('Expected error not received'));
        }
      }, 100);
    });
  });

  runner.it('should enforce fields limit', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { fields: 2 }
    });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field1"',
      '',
      'value1',
      `--${boundary}`,
      'Content-Disposition: form-data; name="field2"',
      '',
      'value2',
      `--${boundary}`,
      'Content-Disposition: form-data; name="field3"',
      '',
      'value3',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let errorReceived = false;

      parser.on('error', (err) => {
        errorReceived = true;
        assert.ok(err.message.includes('limit') || err.message.includes('fields'));
        resolve();
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        if (errorReceived) {
          resolve();
        } else {
          reject(new Error('Expected error not received'));
        }
      }, 100);
    });
  });

  runner.it('should handle chunked boundary (split across chunks)', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="test"',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fieldReceived = false;

      parser.on('field', (name, value) => {
        fieldReceived = true;
        assert.equal(name, 'test');
        assert.equal(value, 'value');
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

      // Send in small chunks to test boundary scanning
      const stream = new Readable({
        read() {
          for (let i = 0; i < body.length; i += 10) {
            this.push(body.slice(i, i + 10));
          }
          this.push(null);
        }
      });

      stream.pipe(parser);
    });
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
