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

  runner.it('should handle preamble data before first boundary', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      'This is preamble data that should be ignored',
      'Multiple lines of preamble',
      `--${boundary}`,
      'Content-Disposition: form-data; name="field1"',
      '',
      'value1',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fieldReceived = false;

      parser.on('field', (name, value) => {
        fieldReceived = true;
        assert.equal(name, 'field1');
        assert.equal(value, 'value1');
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

  runner.it('should handle epilogue data after final boundary', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field1"',
      '',
      'value1',
      `--${boundary}--`,
      'This is epilogue data after the final boundary',
      'Should be ignored'
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fieldReceived = false;

      parser.on('field', (name, value) => {
        fieldReceived = true;
        assert.equal(name, 'field1');
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

  runner.it('should enforce files count limit', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { files: 2 }
    });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file1"; filename="test1.txt"',
      '',
      'content1',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file2"; filename="test2.txt"',
      '',
      'content2',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file3"; filename="test3.txt"',
      '',
      'content3',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let errorReceived = false;
      let limitEmitted = false;

      parser.on('error', (err) => {
        errorReceived = true;
        assert.ok(err.message.includes('files') || err.message.includes('Too many'));
      });

      parser.on('limit', (type, limit) => {
        limitEmitted = true;
        assert.equal(type, 'files');
        assert.equal(limit, 2);
      });

      parser.on('file', (fileInfo, stream) => {
        stream.resume(); // Consume stream
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        try {
          assert.ok(errorReceived || limitEmitted);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 100);
    });
  });

  runner.it('should enforce field name size limit', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { fieldNameSize: 10 }
    });

    const longFieldName = 'x'.repeat(20);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="${longFieldName}"`,
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let errorReceived = false;

      parser.on('error', (err) => {
        errorReceived = true;
        assert.ok(err.message.includes('Field name'));
        resolve();
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        if (!errorReceived) {
          reject(new Error('Expected field name size limit error'));
        }
      }, 100);
    });
  });

  runner.it('should throw on missing Content-Disposition header', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Type: text/plain',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('error', (err) => {
        assert.ok(err.message.includes('Content-Disposition'));
        resolve();
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        reject(new Error('Expected Content-Disposition error'));
      }, 100);
    });
  });

  runner.it('should handle escaped quotes in field name', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field\\"with\\"quotes"',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'field"with"quotes');
        assert.equal(value, 'value');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle escaped quotes in filename', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test\\"file\\".txt"',
      '',
      'content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.filename, 'test"file".txt');
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle unquoted field name', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name=username',
      '',
      'john',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'username');
        assert.equal(value, 'john');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle unquoted filename', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name=file; filename=test.txt',
      '',
      'content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.filename, 'test.txt');
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should strip trailing CRLF from field values', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field"',
      '',
      'value without extra CRLF',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        // Join adds \r\n before boundary, parser should strip it
        assert.equal(value, 'value without extra CRLF');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should emit limit event on file size exceeded', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { fileSize: 50 }
    });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="large.txt"',
      '',
      'x'.repeat(100),
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let limitEmitted = false;

      parser.on('limit', (type, limit) => {
        limitEmitted = true;
        assert.equal(type, 'fileSize');
        assert.equal(limit, 50);
      });

      parser.on('file', (fileInfo, stream) => {
        stream.on('error', () => {
          // Expected error on stream
        });
        stream.resume();
      });

      parser.on('error', () => {
        // Error expected
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        try {
          assert.ok(limitEmitted);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 100);
    });
  });

  runner.it('should emit limit event on field size exceeded', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { fieldSize: 50 }
    });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field"',
      '',
      'x'.repeat(100),
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let limitEmitted = false;

      parser.on('limit', (type, limit) => {
        limitEmitted = true;
        assert.equal(type, 'fieldSize');
        assert.equal(limit, 50);
      });

      parser.on('error', () => {
        // Error expected
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        try {
          assert.ok(limitEmitted);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 100);
    });
  });

  runner.it('should emit limit event on field name size exceeded', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({
      boundary,
      limits: { fieldNameSize: 5 }
    });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="verylongfieldname"',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let limitEmitted = false;

      parser.on('limit', (type, limit) => {
        limitEmitted = true;
        assert.equal(type, 'fieldNameSize');
        assert.equal(limit, 5);
      });

      parser.on('error', () => {
        // Error expected
      });

      const stream = createStream(body);
      stream.pipe(parser);

      setTimeout(() => {
        try {
          assert.ok(limitEmitted);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 100);
    });
  });

  runner.it('should handle empty file upload', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="empty.txt"',
      'Content-Type: text/plain',
      '',
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      let fileReceived = false;

      parser.on('file', (fileInfo, stream) => {
        fileReceived = true;
        assert.equal(fileInfo.filename, 'empty.txt');

        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => {
          const content = Buffer.concat(chunks);
          assert.equal(content.length, 0);
        });
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        try {
          assert.ok(fileReceived);
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

  runner.it('should parse MIME type from Content-Type header', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="photo.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fake-image-data',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.mimeType, 'image/jpeg');
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should default MIME type to application/octet-stream', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="data.bin"',
      '',
      'binary-data',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.mimeType, 'application/octet-stream');
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle multiple headers per part', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="doc.pdf"',
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: binary',
      'X-Custom-Header: custom-value',
      '',
      'pdf-content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.filename, 'doc.pdf');
        assert.equal(fileInfo.mimeType, 'application/pdf');
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle very long boundary', async () => {
    const boundary = '-'.repeat(70); // RFC allows up to 70 chars
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field"',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'field');
        assert.equal(value, 'value');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle boundary with special characters', async () => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field"',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(value, 'value');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle field with multiline value', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    // Build body manually to control CRLF precisely
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from('Content-Disposition: form-data; name="field"\r\n\r\n'),
      Buffer.from('line1\r\nline2\r\nline3'),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        // Should strip trailing CRLF before boundary, but preserve internal CRLFs
        assert.equal(value, 'line1\r\nline2\r\nline3');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle headers with whitespace variations', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition:    form-data;   name="field"   ',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'field');
        assert.equal(value, 'value');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle case-insensitive headers', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'CONTENT-DISPOSITION: form-data; name="field"',
      'CONTENT-TYPE: text/plain',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(name, 'field');
        assert.equal(value, 'value');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle Content-Disposition parameters in any order', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; filename="test.txt"; name="file"',
      '',
      'content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.fieldName, 'file');
        assert.equal(fileInfo.filename, 'test.txt');
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle UTF-8 field values', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const utf8Value = 'Hello 世界 🌍';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="message"',
      '',
      utf8Value,
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        assert.equal(value, utf8Value);
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle UTF-8 filenames', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const utf8Filename = '文档.txt';
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${utf8Filename}"`,
      '',
      'content',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('file', (fileInfo, stream) => {
        assert.equal(fileInfo.filename, utf8Filename);
        stream.resume();
      });

      parser.on('finish', async () => {
        await new Promise(r => setImmediate(r));
        resolve();
      });

      parser.on('error', reject);

      const stream = createStream(body);
      stream.pipe(parser);
    });
  });

  runner.it('should handle line without colon in headers', async () => {
    const boundary = 'TestBoundary';
    const parser = new MultipartParser({ boundary });

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="field"',
      'Invalid header line without colon',
      '',
      'value',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      parser.on('field', (name, value) => {
        // Should still parse successfully, ignoring invalid header
        assert.equal(name, 'field');
        assert.equal(value, 'value');
      });

      parser.on('finish', resolve);
      parser.on('error', reject);

      const stream = createStream(body);
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
