/**
 * BoundaryScanner Tests
 */

const { TestRunner, assert } = require('../test-runner');
const BoundaryScanner = require('../../src/utils/BoundaryScanner');

const runner = new TestRunner();

runner.describe('BoundaryScanner', () => {
  runner.it('should find boundary in simple chunk', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const chunk = Buffer.from('some data--BOUNDARYmore data');

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 1);
    assert.equal(result.parts[0].data.toString(), 'some data');
  });

  runner.it('should find multiple boundaries', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const chunk = Buffer.from('data1--BOUNDARYdata2--BOUNDARYdata3');

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 2);
    assert.equal(result.parts[0].data.toString(), 'data1');
    assert.equal(result.parts[1].data.toString(), 'data2');
  });

  runner.it('should handle boundary at start', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const chunk = Buffer.from('--BOUNDARYdata');

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 1);
    assert.equal(result.parts[0].data.length, 0);
  });

  runner.it('should handle boundary at end', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const chunk = Buffer.from('data--BOUNDARY');

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 1);
    assert.equal(result.parts[0].data.toString(), 'data');
  });

  runner.it('should handle chunk with no boundary', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const chunk = Buffer.from('just some data without boundary');

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 0);
    assert.ok(result.emitData);
  });

  runner.it('should maintain carryover for split boundaries', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));

    // First chunk ends with partial boundary
    const chunk1 = Buffer.from('data--BOU');
    const result1 = scanner.scan(chunk1);

    assert.ok(scanner.carryover.length > 0, 'Should have carryover');

    // Second chunk completes boundary
    const chunk2 = Buffer.from('NDARYmore');
    const result2 = scanner.scan(chunk2);

    assert.equal(result2.parts.length, 1);
  });

  runner.it('should reset scanner state', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));

    scanner.scan(Buffer.from('data--BOU')); // Creates carryover
    assert.ok(scanner.carryover.length > 0);

    scanner.reset();
    assert.equal(scanner.carryover.length, 0);
  });

  runner.it('should flush remaining data', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));

    scanner.scan(Buffer.from('remaining data'));
    const flushed = scanner.flush();

    assert.ok(flushed.length > 0);
    assert.equal(scanner.carryover.length, 0);
  });

  runner.it('should handle empty chunks', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const chunk = Buffer.alloc(0);

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 0);
  });

  runner.it('should handle binary data', () => {
    const scanner = new BoundaryScanner(Buffer.from('BOUNDARY'));
    const binaryData = Buffer.from([0x00, 0x01, 0xFF, 0xFE]);
    const chunk = Buffer.concat([
      binaryData,
      Buffer.from('--BOUNDARY'),
      binaryData
    ]);

    const result = scanner.scan(chunk);

    assert.equal(result.parts.length, 1);
    assert.isBuffer(result.parts[0].data);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
