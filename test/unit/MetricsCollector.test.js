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

  runner.it('should record field parsed', () => {
    const collector = new MetricsCollector();
    collector.recordFieldParsed();
    collector.recordFieldParsed({ type: 'text' });

    const counter = collector.getMetric('fluxupload_parser_fields_total');
    assert.equal(counter.get(), 1); // No labels
    assert.equal(counter.get({ type: 'text' }), 1); // With labels
  });

  runner.it('should record file parsed', () => {
    const collector = new MetricsCollector();
    collector.recordFileParsed();
    collector.recordFileParsed({ type: 'image' });

    const counter = collector.getMetric('fluxupload_parser_files_total');
    assert.equal(counter.get(), 1);
    assert.equal(counter.get({ type: 'image' }), 1);
  });

  runner.it('should record storage write duration', () => {
    const collector = new MetricsCollector();
    collector.recordStorageWrite(250); // 250ms

    const hist = collector.getMetric('fluxupload_storage_write_duration_seconds');
    assert.ok(hist);
  });

  runner.it('should track active uploads correctly', () => {
    const collector = new MetricsCollector();
    const activeGauge = collector.getMetric('fluxupload_uploads_active');

    const start1 = collector.recordUploadStart();
    assert.equal(activeGauge.get(), 1);

    const start2 = collector.recordUploadStart();
    assert.equal(activeGauge.get(), 2);

    collector.recordUploadComplete(start1);
    assert.equal(activeGauge.get(), 1);

    collector.recordUploadComplete(start2);
    assert.equal(activeGauge.get(), 0);
  });

  runner.it('should record upload with metadata labels', () => {
    const collector = new MetricsCollector();
    const meta = { storage: 's3', region: 'us-east-1' };

    const startTime = collector.recordUploadStart(meta);
    collector.recordUploadComplete(startTime, meta);

    const uploadsTotal = collector.getMetric('fluxupload_uploads_total');
    assert.equal(uploadsTotal.get(meta), 1);
  });

  runner.it('should record large byte values', () => {
    const collector = new MetricsCollector();
    const largeSize = 1073741824; // 1GB

    collector.recordBytesUploaded(largeSize);

    const bytesCounter = collector.getMetric('fluxupload_uploads_bytes_total');
    assert.equal(bytesCounter.get(), largeSize);
  });

  runner.it('should record plugin execution with metadata', () => {
    const collector = new MetricsCollector();
    collector.recordPluginExecution('ImageResize', 125, { size: 'thumbnail' });

    const hist = collector.getMetric('fluxupload_plugin_duration_seconds');
    const prom = hist.toPrometheus();
    assert.ok(prom.includes('plugin="ImageResize"'));
    assert.ok(prom.includes('size="thumbnail"'));
  });

  runner.it('should handle multiple concurrent operations', () => {
    const collector = new MetricsCollector();

    collector.recordBytesUploaded(1024);
    collector.recordBytesUploaded(2048);
    collector.recordBytesUploaded(4096);

    const bytesCounter = collector.getMetric('fluxupload_uploads_bytes_total');
    assert.equal(bytesCounter.get(), 7168); // Sum of all
  });

  runner.it('should return undefined for non-existent metric', () => {
    const collector = new MetricsCollector();
    assert.equal(collector.getMetric('nonexistent'), undefined);
  });
});

runner.describe('Counter - Extended', () => {
  runner.it('should handle multiple label combinations', () => {
    const counter = new Counter('test', 'Test');
    counter.inc({ method: 'POST', status: '200' });
    counter.inc({ method: 'POST', status: '400' });
    counter.inc({ method: 'GET', status: '200' });

    assert.equal(counter.get({ method: 'POST', status: '200' }), 1);
    assert.equal(counter.get({ method: 'POST', status: '400' }), 1);
    assert.equal(counter.get({ method: 'GET', status: '200' }), 1);
  });

  runner.it('should sort labels consistently', () => {
    const counter = new Counter('test', 'Test');
    counter.inc({ z: '1', a: '2' });
    counter.inc({ a: '2', z: '1' }); // Same labels, different order

    // Should be treated as same label set
    assert.equal(counter.get({ z: '1', a: '2' }), 2);
    assert.equal(counter.get({ a: '2', z: '1' }), 2);
  });

  runner.it('should handle empty labels vs no labels', () => {
    const counter = new Counter('test', 'Test');
    counter.inc();
    counter.inc({});

    // Both should increment same counter
    assert.equal(counter.get(), 2);
    assert.equal(counter.get({}), 2);
  });

  runner.it('should handle special characters in label values', () => {
    const counter = new Counter('test', 'Test');
    counter.inc({ path: '/api/v1/upload' });

    const prom = counter.toPrometheus();
    assert.ok(prom.includes('path="/api/v1/upload"'));
  });

  runner.it('should handle large counter values', () => {
    const counter = new Counter('test', 'Test');
    counter.inc({}, 1000000);
    counter.inc({}, 1000000);

    assert.equal(counter.get(), 2000000);
  });

  runner.it('should return 0 for non-existent label combination', () => {
    const counter = new Counter('test', 'Test');
    counter.inc({ method: 'POST' });

    assert.equal(counter.get({ method: 'GET' }), 0);
  });
});

runner.describe('Gauge - Extended', () => {
  runner.it('should reset gauge', () => {
    const gauge = new Gauge('test', 'Test');
    gauge.set({}, 100);
    gauge.reset();

    assert.equal(gauge.get(), 0);
  });

  runner.it('should export gauge to Prometheus format', () => {
    const gauge = new Gauge('test_gauge', 'Test gauge');
    gauge.set({ node: '1' }, 42);

    const prom = gauge.toPrometheus();
    assert.ok(prom.includes('# HELP test_gauge'));
    assert.ok(prom.includes('# TYPE test_gauge gauge'));
    assert.ok(prom.includes('test_gauge{node="1"} 42'));
  });

  runner.it('should handle negative gauge values', () => {
    const gauge = new Gauge('test', 'Test');
    gauge.set({}, -10);

    assert.equal(gauge.get(), -10);
  });

  runner.it('should handle gauge decrement below zero', () => {
    const gauge = new Gauge('test', 'Test');
    gauge.set({}, 5);
    gauge.dec({}, 10);

    assert.equal(gauge.get(), -5);
  });

  runner.it('should overwrite gauge values', () => {
    const gauge = new Gauge('test', 'Test');
    gauge.set({}, 100);
    gauge.set({}, 200);

    assert.equal(gauge.get(), 200);
  });

  runner.it('should increment gauge from zero', () => {
    const gauge = new Gauge('test', 'Test');
    gauge.inc({}, 5);

    assert.equal(gauge.get(), 5);
  });

  runner.it('should handle multiple gauge labels', () => {
    const gauge = new Gauge('test', 'Test');
    gauge.set({ worker: '1' }, 10);
    gauge.set({ worker: '2' }, 20);
    gauge.set({ worker: '3' }, 30);

    const prom = gauge.toPrometheus();
    assert.ok(prom.includes('worker="1"'));
    assert.ok(prom.includes('worker="2"'));
    assert.ok(prom.includes('worker="3"'));
  });
});

runner.describe('Histogram - Extended', () => {
  runner.it('should handle custom bucket configuration', () => {
    const hist = new Histogram('test', 'Test', [0.1, 0.5, 1.0, 5.0]);
    hist.observe({}, 0.3);

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('le="0.1"'));
    assert.ok(prom.includes('le="0.5"'));
    assert.ok(prom.includes('le="1"'));
    assert.ok(prom.includes('le="5"'));
  });

  runner.it('should reset histogram', () => {
    const hist = new Histogram('test', 'Test', [1, 5, 10]);
    hist.observe({}, 3);
    hist.observe({}, 7);
    hist.reset();

    const prom = hist.toPrometheus();
    assert.ok(!prom.includes('test_count') || prom.includes('test_count 0'));
  });

  runner.it('should handle histogram with labels', () => {
    const hist = new Histogram('test', 'Test', [1, 5]);
    hist.observe({ method: 'POST' }, 2);
    hist.observe({ method: 'GET' }, 3);

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('method="POST"'));
    assert.ok(prom.includes('method="GET"'));
  });

  runner.it('should handle value exactly on bucket boundary', () => {
    const hist = new Histogram('test', 'Test', [1, 5, 10]);
    hist.observe({}, 5); // Exactly on boundary

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('le="5"'));
  });

  runner.it('should calculate histogram sum correctly', () => {
    const hist = new Histogram('test', 'Test', [10]);
    hist.observe({}, 3);
    hist.observe({}, 5);
    hist.observe({}, 7);

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('test_sum 15'));
  });

  runner.it('should calculate histogram count correctly', () => {
    const hist = new Histogram('test', 'Test', [10]);
    hist.observe({}, 1);
    hist.observe({}, 2);
    hist.observe({}, 3);

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('test_count 3'));
  });

  runner.it('should sort buckets automatically', () => {
    const hist = new Histogram('test', 'Test', [10, 1, 5]); // Unsorted
    hist.observe({}, 3);

    const prom = hist.toPrometheus();
    const le1Index = prom.indexOf('le="1"');
    const le5Index = prom.indexOf('le="5"');
    const le10Index = prom.indexOf('le="10"');

    // Should appear in sorted order
    assert.ok(le1Index < le5Index);
    assert.ok(le5Index < le10Index);
  });

  runner.it('should include +Inf bucket', () => {
    const hist = new Histogram('test', 'Test', [1, 5]);
    hist.observe({}, 100); // Above all buckets

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('le="+Inf"'));
  });

  runner.it('should accumulate values in buckets', () => {
    const hist = new Histogram('test', 'Test', [5, 10]);
    hist.observe({}, 3);  // Goes in 5, 10, +Inf
    hist.observe({}, 7);  // Goes in 10, +Inf
    hist.observe({}, 12); // Goes in +Inf only

    const prom = hist.toPrometheus();
    // Bucket 5 should have 1
    // Bucket 10 should have 2
    // Bucket +Inf should have 3
    assert.ok(prom.includes('le="5"'));
    assert.ok(prom.includes('le="10"'));
    assert.ok(prom.includes('{le="+Inf"} 3'));
  });

  runner.it('should handle multiple observations with same labels', () => {
    const hist = new Histogram('test', 'Test', [10]);
    hist.observe({ endpoint: '/upload' }, 5);
    hist.observe({ endpoint: '/upload' }, 5);

    const prom = hist.toPrometheus();
    assert.ok(prom.includes('test_count{endpoint="/upload"} 2'));
    assert.ok(prom.includes('test_sum{endpoint="/upload"} 10'));
  });

  runner.it('should handle empty histogram', () => {
    const hist = new Histogram('test', 'Test', [1, 5, 10]);
    const prom = hist.toPrometheus();

    assert.ok(prom.includes('# HELP test'));
    assert.ok(prom.includes('# TYPE test histogram'));
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
