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

  runner.it('should check eventloop lag', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.checks.eventloop);
    assert.ok(status.checks.eventloop.lag >= 0);
  });

  runner.it('should return pass status when healthy', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.equal(status.status, 'pass');
  });

  runner.it('should include timestamp', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.timestamp);
    assert.ok(new Date(status.timestamp).getTime() > 0);
  });

  runner.it('should check all standard checks', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.checks.uptime);
    assert.ok(status.checks.memory);
    assert.ok(status.checks.eventloop);
  });

  runner.it('should format uptime in human readable format', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.checks.uptime.uptimeHuman);
  });

  runner.it('should calculate memory percentage', async () => {
    const health = new HealthCheck();
    const status = await health.check();
    assert.ok(status.checks.memory.systemMemoryPercentage >= 0);
    assert.ok(status.checks.memory.systemMemoryPercentage <= 100);
  });

  runner.it('should create HealthCheckResult', () => {
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');
    const result = new HealthCheckResult('test', 'pass', { value: 123 });

    assert.equal(result.name, 'test');
    assert.equal(result.status, 'pass');
    assert.equal(result.details.value, 123);
    assert.ok(result.timestamp);
  });

  runner.it('should convert HealthCheckResult to JSON', () => {
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');
    const result = new HealthCheckResult('test', 'pass', { value: 123 });
    const json = result.toJSON();

    assert.equal(json.name, 'test');
    assert.equal(json.status, 'pass');
    assert.equal(json.value, 123);
    assert.ok(json.timestamp);
  });

  runner.it('should register custom health check', async () => {
    const health = new HealthCheck();
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');

    health.register('custom', async () => {
      return new HealthCheckResult('custom', 'pass', { message: 'OK' });
    });

    const status = await health.check();
    assert.ok(status.checks.custom);
    assert.equal(status.checks.custom.status, 'pass');
    assert.equal(status.checks.custom.message, 'OK');
  });

  runner.it('should run single health check', async () => {
    const health = new HealthCheck();
    const result = await health.runCheck('uptime');

    assert.ok(result);
    assert.equal(result.name, 'uptime');
    assert.equal(result.status, 'pass');
  });

  runner.it('should return fail for non-existent check', async () => {
    const health = new HealthCheck();
    const result = await health.runCheck('nonexistent');

    assert.equal(result.status, 'fail');
    assert.ok(result.details.error);
  });

  runner.it('should handle check errors gracefully', async () => {
    const health = new HealthCheck();

    health.register('error-check', async () => {
      throw new Error('Test error');
    });

    const result = await health.runCheck('error-check');
    assert.equal(result.status, 'fail');
    assert.ok(result.details.error.includes('Test error'));
  });

  runner.it('should have liveness probe', async () => {
    const health = new HealthCheck();
    const liveness = await health.liveness();

    assert.equal(liveness.status, 'pass');
    assert.ok(liveness.timestamp);
    assert.ok(liveness.uptime >= 0);
  });

  runner.it('should have readiness probe', async () => {
    const health = new HealthCheck();
    const readiness = await health.readiness();

    assert.equal(readiness.status, 'pass');
    assert.ok(readiness.timestamp);
    assert.equal(readiness.ready, true);
  });

  runner.it('should report not ready when checks fail', async () => {
    const health = new HealthCheck();
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');

    health.register('failing', async () => {
      return new HealthCheckResult('failing', 'fail', { error: 'Failed' });
    });

    const readiness = await health.readiness();
    assert.equal(readiness.status, 'fail');
    assert.equal(readiness.ready, false);
  });

  runner.it('should report warn status overall when any check warns', async () => {
    const health = new HealthCheck();
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');

    health.register('warning', async () => {
      return new HealthCheckResult('warning', 'warn', { message: 'Warning' });
    });

    const status = await health.check();
    assert.equal(status.status, 'warn');
  });

  runner.it('should report fail status overall when any check fails', async () => {
    const health = new HealthCheck();
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');

    health.register('failing', async () => {
      return new HealthCheckResult('failing', 'fail', { error: 'Failed' });
    });

    const status = await health.check();
    assert.equal(status.status, 'fail');
  });

  runner.it('should format uptime for seconds only', () => {
    const health = new HealthCheck();
    const formatted = health._formatUptime(45);
    assert.equal(formatted, '45s');
  });

  runner.it('should format uptime for minutes', () => {
    const health = new HealthCheck();
    const formatted = health._formatUptime(125);
    assert.equal(formatted, '2m 5s');
  });

  runner.it('should format uptime for hours', () => {
    const health = new HealthCheck();
    const formatted = health._formatUptime(3725);
    assert.equal(formatted, '1h 2m 5s');
  });

  runner.it('should format uptime for days', () => {
    const health = new HealthCheck();
    const formatted = health._formatUptime(90125);
    assert.equal(formatted, '1d 1h 2m 5s');
  });

  runner.it('should format uptime for zero seconds', () => {
    const health = new HealthCheck();
    const formatted = health._formatUptime(0);
    assert.equal(formatted, '0s');
  });

  runner.it('should track start time', () => {
    const health = new HealthCheck();
    assert.ok(health.startTime);
    assert.ok(health.startTime <= Date.now());
  });

  runner.it('should have checks map', () => {
    const health = new HealthCheck();
    assert.ok(health.checks instanceof Map);
    assert.ok(health.checks.size > 0); // Default checks registered
  });

  runner.it('should register default checks on initialization', () => {
    const health = new HealthCheck();
    assert.ok(health.checks.has('uptime'));
    assert.ok(health.checks.has('memory'));
    assert.ok(health.checks.has('eventloop'));
  });

  runner.it('should include all check details in JSON', async () => {
    const health = new HealthCheck();
    const status = await health.check();

    assert.ok(typeof status.checks.uptime.uptime === 'number');
    assert.ok(status.checks.uptime.uptimeHuman);
    assert.ok(typeof status.checks.memory.heapUsed === 'number');
    assert.ok(typeof status.checks.memory.heapTotal === 'number');
    assert.ok(typeof status.checks.eventloop.lag === 'number');
  });

  runner.it('should run checks in parallel', async () => {
    const health = new HealthCheck();
    const { HealthCheckResult } = require('../../src/observability/HealthCheck');

    let counter = 0;

    health.register('slow1', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      counter++;
      return new HealthCheckResult('slow1', 'pass', {});
    });

    health.register('slow2', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      counter++;
      return new HealthCheckResult('slow2', 'pass', {});
    });

    const startTime = Date.now();
    await health.check();
    const elapsed = Date.now() - startTime;

    // If run in parallel, should take ~10ms not ~20ms
    assert.ok(elapsed < 30); // Some tolerance
    assert.equal(counter, 2);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
