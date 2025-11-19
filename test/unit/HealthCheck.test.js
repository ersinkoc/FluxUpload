/**
 * HealthCheck Tests - Basic coverage
 */

const { TestRunner, assert } = require('../test-runner');
const { HealthCheck } = require('../../src/observability/HealthCheck');

const runner = new TestRunner();

runner.describe('HealthCheck', () => {
  runner.it('should initialize', () => {
    const health = new HealthCheck();
    assert.ok(health);
  });

  runner.it('should return health status', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status);
    assert.ok(status.status);
  });

  runner.it('should check uptime', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.checks);
    assert.ok(status.checks.uptime);
    assert.ok(status.checks.uptime.uptime >= 0);
  });

  runner.it('should check memory', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.checks);
    assert.ok(status.checks.memory);
    assert.ok(status.checks.memory.heapUsed >= 0);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
