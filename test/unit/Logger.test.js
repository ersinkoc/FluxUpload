/**
 * Logger Tests
 */

const { TestRunner, assert } = require('../test-runner');
const { Logger, getLogger, configure, LOG_LEVELS } = require('../../src/observability/Logger');
const { Writable } = require('stream');

const runner = new TestRunner();

// Mock writable stream to capture output
class MockStream extends Writable {
  constructor() {
    super();
    this.output = [];
  }

  _write(chunk, encoding, callback) {
    this.output.push(chunk.toString());
    callback();
  }

  getLines() {
    return this.output;
  }

  getLastLine() {
    return this.output[this.output.length - 1];
  }

  clear() {
    this.output = [];
  }
}

runner.describe('Logger', () => {
  runner.it('should initialize with default options', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    assert.equal(logger.level, LOG_LEVELS.info);
    assert.equal(logger.format, 'json');
    assert.equal(logger.timestamp, true);
    assert.equal(logger.pretty, false);
  });

  runner.it('should initialize with custom level', () => {
    const stream = new MockStream();
    const logger = new Logger({ level: 'debug', destination: stream });

    assert.equal(logger.level, LOG_LEVELS.debug);
  });

  runner.it('should initialize with custom format', () => {
    const stream = new MockStream();
    const logger = new Logger({ format: 'text', destination: stream });

    assert.equal(logger.format, 'text');
  });

  runner.it('should initialize with base context', () => {
    const stream = new MockStream();
    const logger = new Logger({
      destination: stream,
      baseContext: { service: 'test', version: '1.0' }
    });

    assert.equal(logger.baseContext.service, 'test');
    assert.equal(logger.baseContext.version, '1.0');
  });

  runner.it('should log at info level', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    logger.info('Test message');

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.level, 'info');
    assert.equal(parsed.message, 'Test message');
    assert.ok(parsed.timestamp);
  });

  runner.it('should log at all levels', () => {
    const stream = new MockStream();
    const logger = new Logger({ level: 'trace', destination: stream });

    logger.trace('Trace message');
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');
    logger.fatal('Fatal message');

    const lines = stream.getLines();
    assert.equal(lines.length, 6);

    const levels = lines.map(line => JSON.parse(line).level);
    assert.deepEqual(levels, ['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
  });

  runner.it('should filter logs below level threshold', () => {
    const stream = new MockStream();
    const logger = new Logger({ level: 'warn', destination: stream });

    logger.trace('Trace message');
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    const lines = stream.getLines();
    assert.equal(lines.length, 2); // Only warn and error

    const levels = lines.map(line => JSON.parse(line).level);
    assert.deepEqual(levels, ['warn', 'error']);
  });

  runner.it('should include context in logs', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    logger.info('Test message', { userId: 123, action: 'upload' });

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.userId, 123);
    assert.equal(parsed.action, 'upload');
  });

  runner.it('should include base context in all logs', () => {
    const stream = new MockStream();
    const logger = new Logger({
      destination: stream,
      baseContext: { service: 'upload', environment: 'test' }
    });

    logger.info('Message 1');
    logger.info('Message 2');

    const lines = stream.getLines();
    const parsed1 = JSON.parse(lines[0]);
    const parsed2 = JSON.parse(lines[1]);

    assert.equal(parsed1.service, 'upload');
    assert.equal(parsed1.environment, 'test');
    assert.equal(parsed2.service, 'upload');
    assert.equal(parsed2.environment, 'test');
  });

  runner.it('should create child logger with merged context', () => {
    const stream = new MockStream();
    const parent = new Logger({
      destination: stream,
      baseContext: { service: 'upload' }
    });

    const child = parent.child({ requestId: 'req123' });

    child.info('Child message');

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.service, 'upload');
    assert.equal(parsed.requestId, 'req123');
  });

  runner.it('should child logger inherit parent configuration', () => {
    const stream = new MockStream();
    const parent = new Logger({
      level: 'debug',
      format: 'text',
      destination: stream
    });

    const child = parent.child({ requestId: 'req123' });

    assert.equal(child.level, LOG_LEVELS.debug);
    assert.equal(child.format, 'text');
    assert.equal(child.destination, stream);
  });

  runner.it('should generate unique request IDs', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    const id1 = logger.generateRequestId();
    const id2 = logger.generateRequestId();
    const id3 = logger.generateRequestId();

    assert.ok(id1 !== id2);
    assert.ok(id2 !== id3);
    assert.ok(id1.startsWith('req_'));
    assert.ok(id2.startsWith('req_'));
  });

  runner.it('should track request start and end', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    const requestId = 'req123';
    logger.startRequest(requestId, { method: 'POST', path: '/upload' });

    assert.ok(logger.activeRequests.has(requestId));
    assert.equal(logger.activeRequests.get(requestId).method, 'POST');

    logger.endRequest(requestId, { status: 200 });

    assert.ok(!logger.activeRequests.has(requestId));

    const lines = stream.getLines();
    assert.equal(lines.length, 2); // Start and end logs

    const startLog = JSON.parse(lines[0]);
    const endLog = JSON.parse(lines[1]);

    assert.equal(startLog.message, 'Request started');
    assert.equal(startLog.requestId, 'req123');
    assert.equal(endLog.message, 'Request completed');
    assert.ok(endLog.duration >= 0);
  });

  runner.it('should warn on ending unknown request', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    logger.endRequest('unknown_req');

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.level, 'warn');
    assert.ok(parsed.message.includes('unknown request'));
  });

  runner.it('should support performance timing', async () => {
    const stream = new MockStream();
    const logger = new Logger({ level: 'debug', destination: stream });

    const endTimer = logger.time('operation');

    await new Promise(resolve => setTimeout(resolve, 10));

    const duration = endTimer({ status: 'success' });

    assert.ok(duration >= 10);

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.level, 'debug');
    assert.equal(parsed.label, 'operation');
    assert.ok(parsed.duration >= 10);
    assert.equal(parsed.status, 'success');
  });
















  runner.it('should extract error details in error log', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    const error = new Error('Test error');
    error.code = 'TEST_ERROR';

    logger.error('Error occurred', { error });

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.level, 'error');
    assert.ok(parsed.error);
    assert.equal(parsed.error.name, 'Error');
    assert.equal(parsed.error.message, 'Test error');
    assert.equal(parsed.error.code, 'TEST_ERROR');
    assert.ok(parsed.error.stack);
  });

  runner.it('should extract error details in fatal log', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    const error = new Error('Fatal error');
    logger.fatal('Fatal error occurred', { error });

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.level, 'fatal');
    assert.ok(parsed.error);
    assert.equal(parsed.error.message, 'Fatal error');
  });

  runner.it('should format as JSON by default', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    logger.info('Test');

    const output = stream.getLastLine();

    // Should be valid JSON
    let parsed;
    try {
      parsed = JSON.parse(output);
      assert.ok(parsed);
    } catch (error) {
      throw new Error('Output is not valid JSON');
    }
  });

  runner.it('should format as pretty JSON when enabled', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream, pretty: true });

    logger.info('Test');

    const output = stream.getLastLine();

    // Pretty JSON includes newlines
    assert.ok(output.includes('\n'));

    // Should still be valid JSON
    const parsed = JSON.parse(output);
    assert.equal(parsed.message, 'Test');
  });

  runner.it('should format as text', () => {
    const stream = new MockStream();
    const logger = new Logger({ format: 'text', destination: stream });

    logger.info('Test message', { key: 'value' });

    const output = stream.getLastLine();

    // Text format includes level and message
    assert.ok(output.includes('INFO'));
    assert.ok(output.includes('Test message'));
    assert.ok(output.includes('"key":"value"'));
  });

  runner.it('should omit timestamp when disabled', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream, timestamp: false });

    logger.info('Test');

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.timestamp, undefined);
  });

  runner.it('should include timestamp when enabled', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream, timestamp: true });

    logger.info('Test');

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.ok(parsed.timestamp);
    // Verify ISO 8601 format
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(parsed.timestamp));
  });

  runner.it('should return statistics', () => {
    const stream = new MockStream();
    const logger = new Logger({ level: 'debug', format: 'json', destination: stream });

    logger.startRequest('req1');
    logger.startRequest('req2');

    const stats = logger.getStats();

    assert.equal(stats.activeRequests, 2);
    assert.equal(stats.level, 'debug');
    assert.equal(stats.format, 'json');
  });

  runner.it('should support getLogger singleton', () => {
    const logger1 = getLogger();
    const logger2 = getLogger();

    // Should return same instance
    assert.equal(logger1, logger2);
  });

  runner.it('should support getLogger with options', () => {
    const stream = new MockStream();
    const logger1 = getLogger({ level: 'debug', destination: stream });
    const logger2 = getLogger();

    // Should create new instance with options
    assert.ok(logger1);
    assert.ok(logger2);
  });

  runner.it('should support configure function', () => {
    const stream = new MockStream();
    const logger = configure({ level: 'warn', destination: stream });

    assert.ok(logger);
    assert.equal(logger.level, LOG_LEVELS.warn);
  });

  runner.it('should handle empty context', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    logger.info('Test');

    const output = stream.getLastLine();
    const parsed = JSON.parse(output);

    assert.equal(parsed.message, 'Test');
    assert.equal(parsed.level, 'info');
  });

  runner.it('should handle multiple consecutive logs', () => {
    const stream = new MockStream();
    const logger = new Logger({ destination: stream });

    logger.info('Message 1');
    logger.info('Message 2');
    logger.info('Message 3');

    const lines = stream.getLines();
    assert.equal(lines.length, 3);

    const messages = lines.map(line => JSON.parse(line).message);
    assert.deepEqual(messages, ['Message 1', 'Message 2', 'Message 3']);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
