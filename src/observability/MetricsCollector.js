/**
 * Metrics Collector for FluxUpload
 *
 * Collects and aggregates metrics about upload operations:
 * - Upload counts and sizes
 * - Duration histograms
 * - Success/failure rates
 * - Active uploads
 * - Plugin performance
 *
 * Provides Prometheus-compatible text format output.
 *
 * @module observability/MetricsCollector
 */

class Counter {
  constructor(name, help) {
    this.name = name;
    this.help = help;
    this.values = new Map();
  }

  inc(labels = {}, value = 1) {
    const key = this._labelsToKey(labels);
    const current = this.values.get(key) || { labels, value: 0 };
    current.value += value;
    this.values.set(key, current);
  }

  get(labels = {}) {
    const key = this._labelsToKey(labels);
    return this.values.get(key)?.value || 0;
  }

  reset() {
    this.values.clear();
  }

  toPrometheus() {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`
    ];

    for (const { labels, value } of this.values.values()) {
      const labelStr = this._labelsToString(labels);
      lines.push(`${this.name}${labelStr} ${value}`);
    }

    return lines.join('\n');
  }

  _labelsToKey(labels) {
    return JSON.stringify(Object.entries(labels).sort());
  }

  _labelsToString(labels) {
    if (Object.keys(labels).length === 0) return '';
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${pairs}}`;
  }
}

class Gauge {
  constructor(name, help) {
    this.name = name;
    this.help = help;
    this.values = new Map();
  }

  set(labels = {}, value) {
    const key = this._labelsToKey(labels);
    this.values.set(key, { labels, value });
  }

  inc(labels = {}, value = 1) {
    const key = this._labelsToKey(labels);
    const current = this.values.get(key) || { labels, value: 0 };
    current.value += value;
    this.values.set(key, current);
  }

  dec(labels = {}, value = 1) {
    this.inc(labels, -value);
  }

  get(labels = {}) {
    const key = this._labelsToKey(labels);
    return this.values.get(key)?.value || 0;
  }

  reset() {
    this.values.clear();
  }

  toPrometheus() {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`
    ];

    for (const { labels, value } of this.values.values()) {
      const labelStr = this._labelsToString(labels);
      lines.push(`${this.name}${labelStr} ${value}`);
    }

    return lines.join('\n');
  }

  _labelsToKey(labels) {
    return JSON.stringify(Object.entries(labels).sort());
  }

  _labelsToString(labels) {
    if (Object.keys(labels).length === 0) return '';
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${pairs}}`;
  }
}

class Histogram {
  constructor(name, help, buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets.sort((a, b) => a - b);
    this.observations = new Map();
  }

  observe(labels = {}, value) {
    const key = this._labelsToKey(labels);
    let obs = this.observations.get(key);

    if (!obs) {
      obs = {
        labels,
        count: 0,
        sum: 0,
        buckets: new Map(this.buckets.map(b => [b, 0]))
      };
      this.observations.set(key, obs);
    }

    obs.count++;
    obs.sum += value;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        obs.buckets.set(bucket, obs.buckets.get(bucket) + 1);
      }
    }
  }

  reset() {
    this.observations.clear();
  }

  toPrometheus() {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`
    ];

    for (const { labels, count, sum, buckets } of this.observations.values()) {
      const labelStr = this._labelsToString(labels);

      for (const [bucket, bucketCount] of buckets) {
        const bucketLabels = { ...labels, le: bucket };
        const bucketLabelStr = this._labelsToString(bucketLabels);
        lines.push(`${this.name}_bucket${bucketLabelStr} ${bucketCount}`);
      }

      // +Inf bucket
      const infLabels = { ...labels, le: '+Inf' };
      const infLabelStr = this._labelsToString(infLabels);
      lines.push(`${this.name}_bucket${infLabelStr} ${count}`);

      lines.push(`${this.name}_sum${labelStr} ${sum}`);
      lines.push(`${this.name}_count${labelStr} ${count}`);
    }

    return lines.join('\n');
  }

  _labelsToKey(labels) {
    return JSON.stringify(Object.entries(labels).sort());
  }

  _labelsToString(labels) {
    if (Object.keys(labels).length === 0) return '';
    const pairs = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${pairs}}`;
  }
}

class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this._initializeDefaultMetrics();
  }

  _initializeDefaultMetrics() {
    // Upload metrics
    this.registerCounter(
      'fluxupload_uploads_total',
      'Total number of upload requests'
    );

    this.registerCounter(
      'fluxupload_uploads_bytes_total',
      'Total bytes uploaded'
    );

    this.registerCounter(
      'fluxupload_uploads_failed_total',
      'Total number of failed uploads'
    );

    this.registerGauge(
      'fluxupload_uploads_active',
      'Number of currently active uploads'
    );

    this.registerHistogram(
      'fluxupload_upload_duration_seconds',
      'Upload duration in seconds',
      [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
    );

    this.registerHistogram(
      'fluxupload_file_size_bytes',
      'File size distribution',
      [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824]
    );

    // Plugin metrics
    this.registerHistogram(
      'fluxupload_plugin_duration_seconds',
      'Plugin execution duration',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
    );

    // Parser metrics
    this.registerCounter(
      'fluxupload_parser_fields_total',
      'Total number of form fields parsed'
    );

    this.registerCounter(
      'fluxupload_parser_files_total',
      'Total number of files parsed'
    );

    // Storage metrics
    this.registerHistogram(
      'fluxupload_storage_write_duration_seconds',
      'Storage write duration',
      [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    );
  }

  registerCounter(name, help) {
    const counter = new Counter(name, help);
    this.metrics.set(name, counter);
    return counter;
  }

  registerGauge(name, help) {
    const gauge = new Gauge(name, help);
    this.metrics.set(name, gauge);
    return gauge;
  }

  registerHistogram(name, help, buckets) {
    const histogram = new Histogram(name, help, buckets);
    this.metrics.set(name, histogram);
    return histogram;
  }

  getMetric(name) {
    return this.metrics.get(name);
  }

  /**
   * Record an upload start
   */
  recordUploadStart(metadata = {}) {
    const activeGauge = this.getMetric('fluxupload_uploads_active');
    activeGauge.inc(metadata);

    const totalCounter = this.getMetric('fluxupload_uploads_total');
    totalCounter.inc(metadata);

    return Date.now();
  }

  /**
   * Record an upload completion
   */
  recordUploadComplete(startTime, metadata = {}) {
    const duration = (Date.now() - startTime) / 1000;

    const activeGauge = this.getMetric('fluxupload_uploads_active');
    activeGauge.dec(metadata);

    const durationHistogram = this.getMetric('fluxupload_upload_duration_seconds');
    durationHistogram.observe(metadata, duration);
  }

  /**
   * Record an upload failure
   */
  recordUploadFailure(startTime, metadata = {}) {
    const activeGauge = this.getMetric('fluxupload_uploads_active');
    activeGauge.dec(metadata);

    const failedCounter = this.getMetric('fluxupload_uploads_failed_total');
    failedCounter.inc(metadata);
  }

  /**
   * Record bytes uploaded
   */
  recordBytesUploaded(bytes, metadata = {}) {
    const bytesCounter = this.getMetric('fluxupload_uploads_bytes_total');
    bytesCounter.inc(metadata, bytes);

    const sizeHistogram = this.getMetric('fluxupload_file_size_bytes');
    sizeHistogram.observe(metadata, bytes);
  }

  /**
   * Record plugin execution
   */
  recordPluginExecution(pluginName, duration, metadata = {}) {
    const histogram = this.getMetric('fluxupload_plugin_duration_seconds');
    histogram.observe({ ...metadata, plugin: pluginName }, duration / 1000);
  }

  /**
   * Record field parsed
   */
  recordFieldParsed(metadata = {}) {
    const counter = this.getMetric('fluxupload_parser_fields_total');
    counter.inc(metadata);
  }

  /**
   * Record file parsed
   */
  recordFileParsed(metadata = {}) {
    const counter = this.getMetric('fluxupload_parser_files_total');
    counter.inc(metadata);
  }

  /**
   * Record storage write
   */
  recordStorageWrite(duration, metadata = {}) {
    const histogram = this.getMetric('fluxupload_storage_write_duration_seconds');
    histogram.observe(metadata, duration / 1000);
  }

  /**
   * Get metrics in Prometheus text format
   */
  toPrometheus() {
    const lines = [];

    for (const metric of this.metrics.values()) {
      lines.push(metric.toPrometheus());
    }

    return lines.join('\n\n') + '\n';
  }

  /**
   * Get metrics as JSON
   */
  toJSON() {
    const result = {};

    for (const [name, metric] of this.metrics) {
      if (metric instanceof Counter || metric instanceof Gauge) {
        result[name] = Array.from(metric.values.values());
      } else if (metric instanceof Histogram) {
        result[name] = Array.from(metric.observations.values());
      }
    }

    return result;
  }

  /**
   * Reset all metrics
   */
  reset() {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }
}

// Singleton instance
let defaultCollector = null;

function getCollector() {
  if (!defaultCollector) {
    defaultCollector = new MetricsCollector();
  }
  return defaultCollector;
}

module.exports = {
  MetricsCollector,
  getCollector,
  Counter,
  Gauge,
  Histogram
};
