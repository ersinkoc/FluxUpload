/**
 * FluxUpload Tests
 */

const { TestRunner, assert } = require('../test-runner');
const FluxUpload = require('../../src/FluxUpload');
const Plugin = require('../../src/core/Plugin');
const { Readable, Transform, PassThrough } = require('stream');

const runner = new TestRunner();

// Helper to create readable stream
function createStream(data) {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}

function consumeStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Mock storage plugin
class MockStorage extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = options.name || 'MockStorage';
    this.processedCount = 0;
    this.initializeCalled = false;
    this.shutdownCalled = false;
    this.shouldFail = options.shouldFail || false;
  }

  async initialize() {
    this.initializeCalled = true;
  }

  async shutdown() {
    this.shutdownCalled = true;
  }

  async process(context) {
    this.processedCount++;

    if (this.shouldFail) {
      throw new Error('Storage failed');
    }

    // Consume stream
    const data = await consumeStream(context.stream);

    return {
      ...context,
      storage: {
        path: `/uploads/${context.fileInfo.filename}`,
        size: data.length,
        stored: true
      }
    };
  }

  async cleanup(context, error) {
    // Cleanup logic
  }
}

// Mock validator plugin
class MockValidator extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = options.name || 'MockValidator';
    this.shouldFail = options.shouldFail || false;
  }

  async process(context) {
    if (this.shouldFail) {
      throw new Error('Validation failed');
    }

    context.metadata.validated = true;
    return context;
  }
}

// Mock transformer plugin
class MockTransformer extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = options.name || 'MockTransformer';
    this.transformFn = options.transformFn || ((chunk) => chunk);
  }

  async process(context) {
    const transformStream = new Transform({
      transform: (chunk, encoding, callback) => {
        callback(null, this.transformFn(chunk));
      }
    });

    context.metadata.transformed = true;
    const newStream = context.stream.pipe(transformStream);

    return {
      ...context,
      stream: newStream
    };
  }
}

// Create mock multipart request
function createMockRequest(boundary, parts) {
  const chunks = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));

    if (part.type === 'field') {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
      chunks.push(Buffer.from(part.value));
      chunks.push(Buffer.from('\r\n'));
    } else if (part.type === 'file') {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
        `Content-Type: ${part.mimeType || 'application/octet-stream'}\r\n\r\n`
      ));
      chunks.push(part.data);
      chunks.push(Buffer.from('\r\n'));
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);
  const stream = createStream(body);

  stream.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': body.length.toString()
  };

  return stream;
}

runner.describe('FluxUpload', () => {
  runner.it('should require storage plugin', () => {
    assert.throws(() => {
      new FluxUpload({});
    }, 'Storage plugin is required');
  });

  runner.it('should initialize with default limits', () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    assert.equal(uploader.limits.fileSize, 100 * 1024 * 1024); // 100MB
    assert.equal(uploader.limits.files, 10);
    assert.equal(uploader.limits.fields, 100);
    assert.equal(uploader.limits.fieldSize, 1024 * 1024); // 1MB
    assert.equal(uploader.limits.fieldNameSize, 100);
  });

  runner.it('should initialize with custom limits', () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({
      storage,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 5,
        fields: 50
      }
    });

    assert.equal(uploader.limits.fileSize, 50 * 1024 * 1024);
    assert.equal(uploader.limits.files, 5);
    assert.equal(uploader.limits.fields, 50);
  });

  runner.it('should initialize with validators and transformers', () => {
    const storage = new MockStorage();
    const validator = new MockValidator();
    const transformer = new MockTransformer();

    const uploader = new FluxUpload({
      storage,
      validators: [validator],
      transformers: [transformer]
    });

    assert.equal(uploader.validators.length, 1);
    assert.equal(uploader.transformers.length, 1);
  });

  runner.it('should initialize with callbacks', () => {
    const storage = new MockStorage();
    const onField = () => {};
    const onFile = () => {};
    const onError = () => {};
    const onFinish = () => {};

    const uploader = new FluxUpload({
      storage,
      onField,
      onFile,
      onError,
      onFinish
    });

    assert.equal(uploader.onField, onField);
    assert.equal(uploader.onFile, onFile);
    assert.equal(uploader.onError, onError);
    assert.equal(uploader.onFinish, onFinish);
  });

  runner.it('should initialize single storage', () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    assert.ok(uploader.pipelineManager);
    assert.equal(uploader.additionalStorage, undefined);
  });

  runner.it('should initialize multiple storage targets', () => {
    const storage1 = new MockStorage({ name: 'storage1' });
    const storage2 = new MockStorage({ name: 'storage2' });
    const uploader = new FluxUpload({ storage: [storage1, storage2] });

    assert.ok(uploader.pipelineManager);
    assert.ok(uploader.additionalStorage);
    assert.equal(uploader.additionalStorage.length, 1);
    assert.equal(uploader.additionalStorage[0].name, 'storage2');
  });

  runner.it('should initialize plugins', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    await uploader.initialize();

    assert.equal(storage.initializeCalled, true);
  });

  runner.it('should initialize multiple storage plugins', async () => {
    const storage1 = new MockStorage({ name: 'storage1' });
    const storage2 = new MockStorage({ name: 'storage2' });
    const uploader = new FluxUpload({ storage: [storage1, storage2] });

    await uploader.initialize();

    assert.equal(storage1.initializeCalled, true);
    assert.equal(storage2.initializeCalled, true);
  });

  runner.it('should shutdown plugins', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    await uploader.shutdown();

    assert.equal(storage.shutdownCalled, true);
  });

  runner.it('should shutdown multiple storage plugins', async () => {
    const storage1 = new MockStorage({ name: 'storage1' });
    const storage2 = new MockStorage({ name: 'storage2' });
    const uploader = new FluxUpload({ storage: [storage1, storage2] });

    await uploader.shutdown();

    assert.equal(storage1.shutdownCalled, true);
    assert.equal(storage2.shutdownCalled, true);
  });

  runner.it('should reject non-multipart requests', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const req = createStream(Buffer.from('plain text'));
    req.headers = {
      'content-type': 'text/plain'
    };

    try {
      await uploader.handle(req);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('multipart/form-data'));
    }
  });

  runner.it('should reject requests without content-type', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const req = createStream(Buffer.from('data'));
    req.headers = {};

    try {
      await uploader.handle(req);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('multipart/form-data'));
    }
  });

  runner.it('should handle simple field', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      { type: 'field', name: 'username', value: 'john' }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.fields.username, 'john');
    assert.equal(result.files.length, 0);
  });

  runner.it('should handle multiple fields', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      { type: 'field', name: 'username', value: 'john' },
      { type: 'field', name: 'email', value: 'john@example.com' }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.fields.username, 'john');
    assert.equal(result.fields.email, 'john@example.com');
  });

  runner.it('should handle multiple values for same field', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      { type: 'field', name: 'tags', value: 'red' },
      { type: 'field', name: 'tags', value: 'blue' }
    ]);

    const result = await uploader.handle(req);

    assert.ok(Array.isArray(result.fields.tags));
    assert.equal(result.fields.tags.length, 2);
    assert.equal(result.fields.tags[0], 'red');
    assert.equal(result.fields.tags[1], 'blue');
  });

  runner.it('should call onField callback', async () => {
    const storage = new MockStorage();
    const fieldsCalled = [];

    const uploader = new FluxUpload({
      storage,
      onField: (name, value) => {
        fieldsCalled.push({ name, value });
      }
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      { type: 'field', name: 'username', value: 'john' }
    ]);

    await uploader.handle(req);

    assert.equal(fieldsCalled.length, 1);
    assert.equal(fieldsCalled[0].name, 'username');
    assert.equal(fieldsCalled[0].value, 'john');
  });

  runner.it('should handle simple file upload', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';
    const fileData = Buffer.from('Hello, World!');

    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'document',
        filename: 'test.txt',
        mimeType: 'text/plain',
        data: fileData
      }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].filename, 'test.txt');
    assert.equal(result.files[0].fieldName, 'document');
    assert.equal(result.files[0].mimeType, 'text/plain');
    assert.equal(result.files[0].size, fileData.length);
    assert.equal(result.files[0].stored, true);
    assert.equal(storage.processedCount, 1);
  });

  runner.it('should handle multiple file uploads', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'file1',
        filename: 'test1.txt',
        mimeType: 'text/plain',
        data: Buffer.from('File 1')
      },
      {
        type: 'file',
        name: 'file2',
        filename: 'test2.txt',
        mimeType: 'text/plain',
        data: Buffer.from('File 2')
      }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].filename, 'test1.txt');
    assert.equal(result.files[1].filename, 'test2.txt');
    assert.equal(storage.processedCount, 2);
  });

  runner.it('should handle fields and files together', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      { type: 'field', name: 'username', value: 'john' },
      {
        type: 'file',
        name: 'avatar',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        data: Buffer.from('fake-image-data')
      }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.fields.username, 'john');
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].filename, 'photo.jpg');
  });

  runner.it('should call onFile callback', async () => {
    const storage = new MockStorage();
    const filesCalled = [];

    const uploader = new FluxUpload({
      storage,
      onFile: (file) => {
        filesCalled.push(file);
      }
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'document',
        filename: 'test.txt',
        mimeType: 'text/plain',
        data: Buffer.from('test')
      }
    ]);

    await uploader.handle(req);

    assert.equal(filesCalled.length, 1);
    assert.ok(filesCalled[0].storage);
  });

  runner.it('should call onFinish callback', async () => {
    const storage = new MockStorage();
    let finishCalled = false;
    let finishResult = null;

    const uploader = new FluxUpload({
      storage,
      onFinish: (result) => {
        finishCalled = true;
        finishResult = result;
      }
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      { type: 'field', name: 'username', value: 'john' }
    ]);

    await uploader.handle(req);

    assert.equal(finishCalled, true);
    assert.ok(finishResult.fields);
    assert.ok(finishResult.files);
  });

  runner.it('should execute validators', async () => {
    const storage = new MockStorage();
    const validator = new MockValidator();
    const uploader = new FluxUpload({
      storage,
      validators: [validator]
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'document',
        filename: 'test.txt',
        data: Buffer.from('test')
      }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.files[0].validated, true);
  });

  runner.it('should execute transformers', async () => {
    const storage = new MockStorage();
    const transformer = new MockTransformer({
      transformFn: (chunk) => Buffer.from(chunk.toString().toUpperCase())
    });

    const uploader = new FluxUpload({
      storage,
      transformers: [transformer]
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'document',
        filename: 'test.txt',
        data: Buffer.from('hello')
      }
    ]);

    const result = await uploader.handle(req);

    assert.equal(result.files[0].transformed, true);
    // Storage should have received transformed data (HELLO)
  });

  runner.it('should handle validation errors', async () => {
    const storage = new MockStorage();
    const validator = new MockValidator({ shouldFail: true });
    const uploader = new FluxUpload({
      storage,
      validators: [validator]
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'document',
        filename: 'test.txt',
        data: Buffer.from('test')
      }
    ]);

    try {
      await uploader.handle(req);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('Validation failed'));
    }
  });

  runner.it('should call onError callback on error', async () => {
    const storage = new MockStorage({ shouldFail: true });
    const errorsCalled = [];

    const uploader = new FluxUpload({
      storage,
      onError: (error) => {
        errorsCalled.push(error);
      }
    });

    const boundary = 'TestBoundary123';
    const req = createMockRequest(boundary, [
      {
        type: 'file',
        name: 'document',
        filename: 'test.txt',
        data: Buffer.from('test')
      }
    ]);

    try {
      await uploader.handle(req);
    } catch (error) {
      // Expected
    }

    assert.ok(errorsCalled.length > 0);
  });

  runner.it('should parse buffer directly', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const buffer = Buffer.from('Hello, World!');
    const fileInfo = { filename: 'test.txt', mimeType: 'text/plain' };

    const result = await uploader.parseBuffer(buffer, fileInfo);

    assert.ok(result.storage);
    assert.equal(result.storage.size, buffer.length);
  });

  runner.it('should reset state between requests', async () => {
    const storage = new MockStorage();
    const uploader = new FluxUpload({ storage });

    const boundary = 'TestBoundary123';

    // First request
    const req1 = createMockRequest(boundary, [
      { type: 'field', name: 'field1', value: 'value1' }
    ]);
    await uploader.handle(req1);

    // Second request
    const req2 = createMockRequest(boundary, [
      { type: 'field', name: 'field2', value: 'value2' }
    ]);
    const result2 = await uploader.handle(req2);

    // Second result should not contain first field
    assert.equal(result2.fields.field1, undefined);
    assert.equal(result2.fields.field2, 'value2');
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
