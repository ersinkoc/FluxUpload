/**
 * MetricsCollector Tests
 */

const { TestRunner, assert } = require('../test-runner');
const { MetricsCollector, Counter, Gauge, Histogram, getCollector } = require('../../src/observability/MetricsCollector');

const runner = new TestRunner();

runner.describe('Counter', () => {
  runner.it('should increment counter', () => {
    const counter = new Counter('test', 'Test counter');
    counter.inc();
    counter.inc();
    assert.equal(counter.get(), 2);
  });

  runner.it('should increment with custom value', () => {
    const counter = new Counter('test', 'Test counter');
    counter.inc({}, 5);
    assert.equal(counter.get(), 5);
  });

  runner.it('should support labels', () => {
    const counter = new Counter('test', 'Test counter');
    counter.inc({ method: 'POST' });
    counter.inc({ method: 'GET' });
    assert.equal(counter.get({ method: 'POST' }), 1);
    assert.equal(counter.get({ method: 'GET' }), 1);
  });

  runner.it('should reset', () => {
    const counter = new Counter('test', 'Test counter');
    counter.inc();
    counter.reset();
    assert.equal(counter.get(), 0);
  });

  runner.it('should export to Prometheus format', () => {
    const counter = new Counter('test_counter', 'Test counter');
    counter.inc({ status: 'success' });
    const prom = counter.toPrometheus();
    assert.ok(prom.includes('# HELP test_counter'));
    assert.ok(prom.includes('# TYPE test_counter counter'));
  });
});

runner.describe('Gauge', () => {
  runner.it('should set gauge value', () => {
    const gauge = new Gauge('test', 'Test gauge');
    gauge.set({}, 42);
    assert.equal(gauge.get(), 42);
  });

  runner.it('should increment gauge', () => {
    const gauge = new Gauge('test', 'Test gauge');
    gauge.set({}, 10);
    gauge.inc({}, 5);
    assert.equal(gauge.get(), 15);
  });

  runner.it('should decrement gauge', () => {
    const gauge = new Gauge('test', 'Test gauge');
    gauge.set({}, 10);
    gauge.dec({}, 3);
    assert.equal(gauge.get(), 7);
  });

  runner.it('should support labels', () => {
    const gauge = new Gauge('test', 'Test gauge');
    gauge.set({ worker: '1' }, 5);
    gauge.set({ worker: '2' }, 10);
    assert.equal(gauge.get({ worker: '1' }), 5);
    assert.equal(gauge.get({ worker: '2' }), 10);
  });
});

runner.describe('Histogram', () => {
  runner.it('should observe values', () => {
    const hist = new Histogram('test', 'Test', [1, 5, 10]);
    hist.observe({}, 3);
    hist.observe({}, 7);
    const prom = hist.toPrometheus();
    assert.ok(prom.includes('test_count'));
    assert.ok(prom.includes('test_sum'));
  });

  runner.it('should count values in buckets', () => {
    const hist = new Histogram('test', 'Test', [5, 10]);
    hist.observe({}, 3); // Falls in 5 bucket
    hist.observe({}, 8); // Falls in 10 bucket
    hist.observe({}, 15); // Falls in +Inf only
    const prom = hist.toPrometheus();
    assert.ok(prom.includes('+Inf'));
  });
});

runner.describe('MetricsCollector', () => {
  runner.it('should initialize with default metrics', () => {
    const collector = new MetricsCollector();
    assert.ok(collector.getMetric('fluxupload_uploads_total'));
    assert.ok(collector.getMetric('fluxupload_uploads_active'));
  });

  runner.it('should register custom counter', () => {
    const collector = new MetricsCollector();
    const counter = collector.registerCounter('custom', 'Custom counter');
    assert.ok(counter);
    assert.equal(collector.getMetric('custom'), counter);
  });

  runner.it('should register custom gauge', () => {
    const collector = new MetricsCollector();
    const gauge = collector.registerGauge('custom', 'Custom gauge');
    assert.ok(gauge);
  });

  runner.it('should register custom histogram', () => {
    const collector = new MetricsCollector();
    const hist = collector.registerHistogram('custom', 'Custom', [1, 5, 10]);
    assert.ok(hist);
  });

  runner.it('should record upload lifecycle', () => {
    const collector = new MetricsCollector();
    const startTime = collector.recordUploadStart();
    collector.recordUploadComplete(startTime);
    
    const uploadsTotal = collector.getMetric('fluxupload_uploads_total');
    assert.equal(uploadsTotal.get(), 1);
  });

  runner.it('should record upload failure', () => {
    const collector = new MetricsCollector();
    const startTime = collector.recordUploadStart();
    collector.recordUploadFailure(startTime);
    
    const failedCounter = collector.getMetric('fluxupload_uploads_failed_total');
    assert.equal(failedCounter.get(), 1);
  });

  runner.it('should record bytes uploaded', () => {
    const collector = new MetricsCollector();
    collector.recordBytesUploaded(1024);
    
    const bytesCounter = collector.getMetric('fluxupload_uploads_bytes_total');
    assert.equal(bytesCounter.get(), 1024);
  });

  runner.it('should record plugin execution', () => {
    const collector = new MetricsCollector();
    collector.recordPluginExecution('TestPlugin', 50);
    
    const hist = collector.getMetric('fluxupload_plugin_duration_seconds');
    assert.ok(hist);
  });

  runner.it('should export to Prometheus format', () => {
    const collector = new MetricsCollector();
    collector.recordUploadStart();
    
    const prom = collector.toPrometheus();
    assert.ok(prom.includes('fluxupload_uploads_total'));
    assert.ok(prom.includes('# HELP'));
    assert.ok(prom.includes('# TYPE'));
  });

  runner.it('should export to JSON', () => {
    const collector = new MetricsCollector();
    collector.recordUploadStart();
    
    const json = collector.toJSON();
    assert.ok(json.fluxupload_uploads_total);
  });

  runner.it('should reset all metrics', () => {
    const collector = new MetricsCollector();
    collector.recordUploadStart();
    collector.reset();
    
    const uploadsTotal = collector.getMetric('fluxupload_uploads_total');
    assert.equal(uploadsTotal.get(), 0);
  });

  runner.it('should support singleton pattern', () => {
    const collector1 = getCollector();
    const collector2 = getCollector();
    assert.equal(collector1, collector2);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
