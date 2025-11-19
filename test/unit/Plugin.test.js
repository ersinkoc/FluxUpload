/**
 * Plugin Tests - Base class for all plugins
 */

const { TestRunner, assert } = require('../test-runner');
const Plugin = require('../../src/core/Plugin');
const { Readable, Transform } = require('stream');

const runner = new TestRunner();

// Helper to create readable stream
function createStream(data) {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}

runner.describe('Plugin', () => {
  runner.it('should initialize with empty config', () => {
    const plugin = new Plugin();

    assert.ok(plugin.config);
    assert.equal(typeof plugin.config, 'object');
    assert.equal(plugin.name, 'Plugin');
  });

  runner.it('should initialize with custom config', () => {
    const config = { key: 'value', timeout: 5000 };
    const plugin = new Plugin(config);

    assert.equal(plugin.config.key, 'value');
    assert.equal(plugin.config.timeout, 5000);
  });

  runner.it('should set name from constructor', () => {
    class CustomPlugin extends Plugin {}
    const plugin = new CustomPlugin();

    assert.equal(plugin.name, 'CustomPlugin');
  });

  runner.it('should have default process method', async () => {
    const plugin = new Plugin();
    const context = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await plugin.process(context);

    assert.equal(result, context); // Should return same context
  });

  runner.it('should pass through context unchanged by default', async () => {
    const plugin = new Plugin();
    const stream = createStream(Buffer.from('test'));
    const fileInfo = { filename: 'test.txt', mimeType: 'text/plain' };
    const metadata = { key: 'value' };

    const context = { stream, fileInfo, metadata };
    const result = await plugin.process(context);

    assert.equal(result.stream, stream);
    assert.equal(result.fileInfo, fileInfo);
    assert.equal(result.metadata, metadata);
  });

  runner.it('should have default cleanup method', async () => {
    const plugin = new Plugin();
    const context = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };
    const error = new Error('Test error');

    // Should not throw
    await plugin.cleanup(context, error);
  });

  runner.it('should have default initialize method', async () => {
    const plugin = new Plugin();

    // Should not throw
    await plugin.initialize();
  });

  runner.it('should have default shutdown method', async () => {
    const plugin = new Plugin();

    // Should not throw
    await plugin.shutdown();
  });

  runner.it('should have default validateConfig method', () => {
    const plugin = new Plugin();

    // Should not throw
    plugin.validateConfig();
  });

  runner.it('should allow subclass to override process', async () => {
    class CustomPlugin extends Plugin {
      async process(context) {
        context.metadata.processed = true;
        return context;
      }
    }

    const plugin = new CustomPlugin();
    const context = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await plugin.process(context);

    assert.equal(result.metadata.processed, true);
  });

  runner.it('should allow subclass to override cleanup', async () => {
    class CustomPlugin extends Plugin {
      constructor(config) {
        super(config);
        this.cleanupCalled = false;
      }

      async cleanup(context, error) {
        this.cleanupCalled = true;
        this.cleanupError = error;
      }
    }

    const plugin = new CustomPlugin();
    const context = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };
    const error = new Error('Test error');

    await plugin.cleanup(context, error);

    assert.equal(plugin.cleanupCalled, true);
    assert.equal(plugin.cleanupError, error);
  });

  runner.it('should allow subclass to override initialize', async () => {
    class CustomPlugin extends Plugin {
      constructor(config) {
        super(config);
        this.initialized = false;
      }

      async initialize() {
        this.initialized = true;
      }
    }

    const plugin = new CustomPlugin();
    await plugin.initialize();

    assert.equal(plugin.initialized, true);
  });

  runner.it('should allow subclass to override shutdown', async () => {
    class CustomPlugin extends Plugin {
      constructor(config) {
        super(config);
        this.shutdownCalled = false;
      }

      async shutdown() {
        this.shutdownCalled = true;
      }
    }

    const plugin = new CustomPlugin();
    await plugin.shutdown();

    assert.equal(plugin.shutdownCalled, true);
  });

  runner.it('should allow subclass to override validateConfig', () => {
    class CustomPlugin extends Plugin {
      validateConfig() {
        if (!this.config.required) {
          throw new Error('Required config missing');
        }
      }
    }

    // Should throw
    assert.throws(() => {
      const plugin = new CustomPlugin({});
      plugin.validateConfig();
    }, 'Required config missing');

    // Should not throw
    const plugin = new CustomPlugin({ required: true });
    plugin.validateConfig();
  });

  runner.it('should support stream transformation in subclass', async () => {
    class TransformPlugin extends Plugin {
      async process(context) {
        const transformStream = new Transform({
          transform(chunk, encoding, callback) {
            callback(null, Buffer.from(chunk.toString().toUpperCase()));
          }
        });

        const newStream = context.stream.pipe(transformStream);

        return {
          ...context,
          stream: newStream
        };
      }
    }

    const plugin = new TransformPlugin();
    const data = Buffer.from('hello');
    const stream = createStream(data);

    const context = {
      stream,
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await plugin.process(context);

    // Consume stream to verify transformation
    const chunks = [];
    result.stream.on('data', chunk => chunks.push(chunk));

    await new Promise(resolve => result.stream.on('end', resolve));

    const output = Buffer.concat(chunks).toString();
    assert.equal(output, 'HELLO');
  });

  runner.it('should support metadata enrichment in subclass', async () => {
    class MetadataPlugin extends Plugin {
      async process(context) {
        context.metadata.plugin = this.name;
        context.metadata.timestamp = Date.now();
        context.metadata.customKey = this.config.customValue;

        return context;
      }
    }

    const plugin = new MetadataPlugin({ customValue: 'test123' });
    const context = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await plugin.process(context);

    assert.equal(result.metadata.plugin, 'MetadataPlugin');
    assert.ok(result.metadata.timestamp);
    assert.equal(result.metadata.customKey, 'test123');
  });

  runner.it('should support validation in subclass', async () => {
    class ValidatorPlugin extends Plugin {
      async process(context) {
        if (context.fileInfo.filename.endsWith('.exe')) {
          throw new Error('Executable files not allowed');
        }
        return context;
      }
    }

    const plugin = new ValidatorPlugin();

    // Should reject .exe files
    const badContext = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'virus.exe' },
      metadata: {}
    };

    try {
      await plugin.process(badContext);
      throw new Error('Should have rejected');
    } catch (error) {
      assert.ok(error.message.includes('Executable files not allowed'));
    }

    // Should allow .txt files
    const goodContext = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'document.txt' },
      metadata: {}
    };

    const result = await plugin.process(goodContext);
    assert.ok(result);
  });

  runner.it('should support config access in process method', async () => {
    class ConfigPlugin extends Plugin {
      async process(context) {
        context.metadata.maxSize = this.config.maxSize;
        context.metadata.allowedTypes = this.config.allowedTypes;
        return context;
      }
    }

    const plugin = new ConfigPlugin({
      maxSize: 1024 * 1024,
      allowedTypes: ['image/jpeg', 'image/png']
    });

    const context = {
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    };

    const result = await plugin.process(context);

    assert.equal(result.metadata.maxSize, 1024 * 1024);
    assert.equal(result.metadata.allowedTypes.length, 2);
  });

  runner.it('should support multiple lifecycle methods', async () => {
    const events = [];

    class LifecyclePlugin extends Plugin {
      async initialize() {
        events.push('initialize');
      }

      async process(context) {
        events.push('process');
        return context;
      }

      async cleanup(context, error) {
        events.push('cleanup');
      }

      async shutdown() {
        events.push('shutdown');
      }
    }

    const plugin = new LifecyclePlugin();

    await plugin.initialize();
    await plugin.process({
      stream: createStream(Buffer.from('test')),
      fileInfo: { filename: 'test.txt' },
      metadata: {}
    });
    await plugin.cleanup({}, new Error('test'));
    await plugin.shutdown();

    assert.deepEqual(events, ['initialize', 'process', 'cleanup', 'shutdown']);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
