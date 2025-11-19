# FluxUpload Observability Guide

Complete guide to monitoring, logging, and observability features in FluxUpload.

## Table of Contents

- [Overview](#overview)
- [Structured Logging](#structured-logging)
- [Metrics Collection](#metrics-collection)
- [Progress Tracking](#progress-tracking)
- [Health Checks](#health-checks)
- [Rate Limiting](#rate-limiting)
- [Monitoring Stack](#monitoring-stack)
- [Production Best Practices](#production-best-practices)

## Overview

FluxUpload provides enterprise-grade observability features with **zero dependencies**:

- **Structured Logging** - JSON logs with context propagation
- **Metrics Collection** - Prometheus-compatible metrics
- **Progress Tracking** - Real-time upload progress events
- **Health Checks** - Liveness and readiness probes
- **Rate Limiting** - Built-in DDOS protection with metrics

All observability features are built using only native Node.js modules.

## Structured Logging

### Basic Usage

```javascript
const { getLogger } = require('fluxupload');

const logger = getLogger({
  level: 'info',           // trace, debug, info, warn, error, fatal
  format: 'json',          // json or text
  pretty: true,            // Pretty-print JSON
  timestamp: true,         // Include timestamps
  baseContext: {           // Context included in all logs
    service: 'my-api',
    environment: 'production'
  }
});

logger.info('Server started', { port: 3000 });
// Output: {"service":"my-api","environment":"production","port":3000,"level":"info","message":"Server started","timestamp":"2025-01-15T12:00:00.000Z"}
```

### Child Loggers

Create child loggers with additional context:

```javascript
const requestLogger = logger.child({ requestId: 'req_123' });

requestLogger.info('Processing upload');
// Output includes requestId in every log
```

### Request Tracking

Track requests from start to finish:

```javascript
const requestId = logger.generateRequestId();

logger.startRequest(requestId, {
  method: 'POST',
  path: '/upload',
  ip: req.socket.remoteAddress
});

// ... process request ...

logger.endRequest(requestId, {
  status: 'success',
  duration: 1234
});
```

### Performance Timing

Measure operation duration:

```javascript
const endTimer = logger.time('database_query');

// ... perform operation ...

const duration = endTimer({ query: 'SELECT * FROM users' });
// Logs: {"label":"database_query","duration":125,"query":"SELECT * FROM users"}
```

### Log Levels

```javascript
logger.trace('Detailed debug info');       // Level 0
logger.debug('Debug information');         // Level 1
logger.info('Informational message');      // Level 2
logger.warn('Warning message');            // Level 3
logger.error('Error occurred', { error }); // Level 4
logger.fatal('Fatal error', { error });    // Level 5
```

### Error Logging

Automatically extracts error details:

```javascript
try {
  throw new Error('Something went wrong');
} catch (error) {
  logger.error('Upload failed', { error });
  // Output: {
  //   "message": "Upload failed",
  //   "error": {
  //     "name": "Error",
  //     "message": "Something went wrong",
  //     "stack": "Error: Something went wrong\n    at ..."
  //   }
  // }
}
```

### Text Format

For local development:

```javascript
const logger = getLogger({
  format: 'text',
  pretty: false
});

logger.info('Server started', { port: 3000 });
// Output: [2025-01-15T12:00:00.000Z] INFO  Server started {"port":3000}
```

## Metrics Collection

### Overview

Prometheus-compatible metrics with counters, gauges, and histograms:

```javascript
const { getCollector } = require('fluxupload');

const metrics = getCollector();
```

### Built-in Metrics

FluxUpload automatically collects:

| Metric | Type | Description |
|--------|------|-------------|
| `fluxupload_uploads_total` | Counter | Total uploads |
| `fluxupload_uploads_active` | Gauge | Active uploads |
| `fluxupload_uploads_failed_total` | Counter | Failed uploads |
| `fluxupload_uploads_bytes_total` | Counter | Total bytes uploaded |
| `fluxupload_upload_duration_seconds` | Histogram | Upload duration |
| `fluxupload_file_size_bytes` | Histogram | File size distribution |
| `fluxupload_plugin_duration_seconds` | Histogram | Plugin execution time |
| `fluxupload_parser_fields_total` | Counter | Form fields parsed |
| `fluxupload_parser_files_total` | Counter | Files parsed |
| `fluxupload_storage_write_duration_seconds` | Histogram | Storage write time |

### Custom Metrics

#### Counter

Tracks monotonically increasing values:

```javascript
const uploadCounter = metrics.registerCounter(
  'my_uploads_total',
  'Total number of uploads'
);

uploadCounter.inc({ type: 'image' }, 1);
uploadCounter.inc({ type: 'video' }, 1);

// Get current value
const count = uploadCounter.get({ type: 'image' }); // 1
```

#### Gauge

Tracks values that can go up or down:

```javascript
const activeUsers = metrics.registerGauge(
  'active_users',
  'Number of active users'
);

activeUsers.set({ room: 'lobby' }, 42);
activeUsers.inc({ room: 'lobby' }, 1);  // 43
activeUsers.dec({ room: 'lobby' }, 1);  // 42
```

#### Histogram

Tracks distribution of values:

```javascript
const responseTime = metrics.registerHistogram(
  'http_request_duration_seconds',
  'HTTP request duration',
  [0.1, 0.5, 1, 2, 5, 10]  // Buckets
);

responseTime.observe({ method: 'POST', path: '/upload' }, 1.23);
```

### Prometheus Endpoint

Expose metrics for Prometheus:

```javascript
const http = require('http');

http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(metrics.toPrometheus());
    return;
  }
  // ... other routes
}).listen(3000);
```

### JSON Export

Export metrics as JSON:

```javascript
const stats = metrics.toJSON();
console.log(JSON.stringify(stats, null, 2));
```

### Recording Upload Metrics

```javascript
const uploader = new FluxUpload({
  request: req,
  // ... other options ...

  onFile: async (file) => {
    const startTime = metrics.recordUploadStart({ type: 'file' });
    file._startTime = startTime;
  },

  onFinish: (results) => {
    results.files.forEach(file => {
      metrics.recordUploadComplete(file._startTime, { type: 'file' });
      metrics.recordBytesUploaded(file.size, { mimetype: file.mimetype });
    });
  },

  onError: (error) => {
    metrics.recordUploadFailure(Date.now(), { error: error.code });
  }
});
```

## Progress Tracking

### Real-time Progress Events

Track upload progress with events:

```javascript
const { ProgressTracker } = require('fluxupload');

const tracker = new ProgressTracker({
  emitInterval: 500  // Emit every 500ms
});

// Listen to events
tracker.on('started', (progress) => {
  console.log(`Upload started: ${progress.filename}`);
});

tracker.on('progress', (progress) => {
  console.log(`${progress.percentage}% - ${progress.bytesPerSecond} bytes/s`);
});

tracker.on('completed', (progress) => {
  console.log(`Upload completed in ${progress.elapsed}s`);
});

tracker.on('error', (progress) => {
  console.log(`Upload failed: ${progress.error.message}`);
});
```

### Using Progress Stream

Wrap file streams with progress tracking:

```javascript
const uploader = new FluxUpload({
  request: req,
  // ... other options ...

  onFile: async (file) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    const progressStream = tracker.createProgressStream({
      fileId: 'unique-file-id',
      filename: file.filename,
      totalBytes: contentLength
    });

    file.stream = file.stream.pipe(progressStream);
  }
});
```

### Progress Data Structure

```javascript
{
  fileId: 'file_1234567890_abc123',
  filename: 'photo.jpg',
  bytesProcessed: 524288,
  totalBytes: 1048576,
  percentage: 50.0,
  bytesPerSecond: 131072,
  elapsed: 4.0,
  estimatedTimeRemaining: 4.0,
  timestamp: '2025-01-15T12:00:00.000Z'
}
```

### Get Progress Statistics

```javascript
// Active uploads
const active = tracker.getActiveUploads();
console.log(`${active.length} uploads in progress`);

// Completed uploads (last 100)
const completed = tracker.getCompletedUploads();

// Overall statistics
const stats = tracker.getStatistics();
console.log(stats);
// {
//   active: { count: 3, totalBytes: 15728640 },
//   completed: { count: 97, successCount: 95, errorCount: 2, successRate: 98 },
//   overall: { totalUploads: 100, totalBytes: 108003328 }
// }
```

### WebSocket Integration

Stream progress to clients:

```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

tracker.on('progress', (progress) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(progress));
    }
  });
});
```

## Health Checks

### Basic Health Check

```javascript
const { HealthCheck } = require('fluxupload');

const healthCheck = new HealthCheck();

// Check health
const health = await healthCheck.check();
console.log(health);
// {
//   status: 'pass',
//   timestamp: '2025-01-15T12:00:00.000Z',
//   checks: {
//     uptime: { status: 'pass', uptime: 3600 },
//     memory: { status: 'pass', heapUsed: 45 },
//     eventloop: { status: 'pass', lag: 2 }
//   }
// }
```

### Built-in Checks

- **Uptime** - How long the service has been running
- **Memory** - Heap usage and system memory
- **Event Loop** - Event loop lag detection

### Custom Health Checks

```javascript
healthCheck.register('database', async () => {
  try {
    await db.ping();
    return new HealthCheckResult('database', 'pass', {
      connected: true,
      latency: 5
    });
  } catch (error) {
    return new HealthCheckResult('database', 'fail', {
      error: error.message
    });
  }
});
```

### Storage Health Check

```javascript
healthCheck.registerStorageCheck('./uploads');
```

### S3 Health Check

```javascript
const s3Storage = new S3Storage({ /* config */ });
healthCheck.registerS3Check(s3Storage);
```

### Kubernetes Probes

#### Liveness Probe

Indicates if the service is running:

```javascript
app.get('/health/live', async (req, res) => {
  const liveness = await healthCheck.liveness();
  res.json(liveness);
});
```

Kubernetes config:
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
```

#### Readiness Probe

Indicates if the service can accept traffic:

```javascript
app.get('/health/ready', async (req, res) => {
  const readiness = await healthCheck.readiness();
  const status = readiness.status === 'pass' ? 200 : 503;
  res.status(status).json(readiness);
});
```

Kubernetes config:
```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Rate Limiting

### Basic Rate Limiting

Prevent abuse with built-in rate limiting:

```javascript
const { RateLimiter } = require('fluxupload');

const rateLimiter = new RateLimiter({
  maxRequests: 100,       // Maximum requests
  windowMs: 60000,        // Per minute
});

const uploader = new FluxUpload({
  request: req,
  validators: [rateLimiter],
  // ... other options
});
```

### Per-IP Rate Limiting

Default behavior - limits based on IP address:

```javascript
// Automatically uses req.socket.remoteAddress or X-Forwarded-For header
```

### Custom Key Generator

Rate limit by user ID, API key, etc.:

```javascript
const rateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  keyGenerator: (context) => {
    // Use user ID from auth
    return context.user?.id || 'anonymous';
  }
});
```

### Custom Handler

Customize rate limit response:

```javascript
const rateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  handler: (context, info) => {
    logger.warn('Rate limit exceeded', {
      ip: context.request.socket.remoteAddress,
      limit: info.limit,
      waitTime: info.waitTime
    });

    const error = new Error('Too many requests. Please try again later.');
    error.statusCode = 429;
    error.retryAfter = Math.ceil(info.waitTime / 1000);
    throw error;
  }
});
```

### Skip Successful/Failed Requests

Don't count certain requests against the limit:

```javascript
const rateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000,
  skipSuccessfulRequests: false,  // Count successful uploads
  skipFailedRequests: true         // Don't count failed uploads
});
```

### Token Bucket Algorithm

Uses token bucket for smooth rate limiting:

- Allows burst traffic up to `maxRequests`
- Tokens refill continuously at steady rate
- More flexible than fixed window

### Get Rate Limit Status

```javascript
const status = rateLimiter.getStatus(ipAddress);
console.log(status);
// {
//   requests: 75,
//   remaining: 25,
//   limit: 100,
//   resetTime: 1642252800000
// }
```

### Reset Rate Limit

```javascript
rateLimiter.reset(ipAddress);
```

### Rate Limit Headers

Add standard rate limit headers to responses:

```javascript
const status = rateLimiter.getStatus(key);

res.setHeader('X-RateLimit-Limit', status.limit);
res.setHeader('X-RateLimit-Remaining', status.remaining);
res.setHeader('X-RateLimit-Reset', new Date(status.resetTime).toISOString());
```

## Monitoring Stack

### Prometheus + Grafana

See `examples/monitoring/` for complete setup with:

- Prometheus for metrics collection
- Grafana for visualization
- Pre-configured dashboard
- Docker Compose setup

### Quick Start

```bash
cd examples/monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

Access:
- Application: http://localhost:3000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

### Grafana Dashboard

Pre-configured dashboard includes:

- Upload rate and throughput
- Active uploads gauge
- Duration percentiles (p50, p95, p99)
- Success vs failed uploads
- Plugin performance metrics
- File size distribution

## Production Best Practices

### 1. Structured Logging

```javascript
const logger = getLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: 'json',
  pretty: false,  // Disable in production
  baseContext: {
    service: 'fluxupload-api',
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
    hostname: require('os').hostname()
  }
});
```

### 2. Metrics Collection

```javascript
// Record all upload operations
const metrics = getCollector();

uploader.on('file', (file) => {
  const startTime = Date.now();
  file._metrics = { startTime };
});

uploader.on('finish', (results) => {
  results.files.forEach(file => {
    const duration = Date.now() - file._metrics.startTime;
    metrics.recordUploadComplete(file._metrics.startTime, {
      mimetype: file.mimetype,
      size_bucket: getSizeBucket(file.size)
    });
  });
});
```

### 3. Error Tracking

```javascript
uploader.on('error', (error) => {
  logger.error('Upload failed', {
    error,
    requestId: req.id,
    ip: req.socket.remoteAddress,
    userAgent: req.headers['user-agent']
  });

  metrics.recordUploadFailure(Date.now(), {
    errorCode: error.code,
    errorType: error.name
  });

  // Send to error tracking service (e.g., Sentry)
  errorTracker.captureException(error);
});
```

### 4. Health Monitoring

```javascript
const healthCheck = new HealthCheck();

// Register all critical dependencies
healthCheck.registerStorageCheck('/data/uploads');
healthCheck.registerS3Check(s3Storage);

// Custom checks for your infrastructure
healthCheck.register('redis', async () => {
  // Check Redis connection
});

// Expose endpoints
app.get('/health', async (req, res) => {
  const health = await healthCheck.check();
  res.status(health.status === 'pass' ? 200 : 503).json(health);
});
```

### 5. Alerting

Configure Prometheus alerts:

```yaml
groups:
  - name: fluxupload
    rules:
      - alert: HighErrorRate
        expr: rate(fluxupload_uploads_failed_total[5m]) > 0.1
        for: 5m
        annotations:
          summary: "Upload error rate is high"

      - alert: SlowUploads
        expr: histogram_quantile(0.95, rate(fluxupload_upload_duration_seconds_bucket[5m])) > 30
        for: 5m
        annotations:
          summary: "Upload performance degraded"
```

### 6. Dashboard Design

Create role-specific dashboards:

- **Operations Dashboard** - Health, error rates, throughput
- **Performance Dashboard** - Latencies, resource usage
- **Business Dashboard** - Upload counts, storage usage, user metrics

### 7. Log Aggregation

Send logs to centralized system:

```javascript
const logger = getLogger({
  destination: process.stdout,  // Captured by container runtime
  format: 'json'
});

// Logs are picked up by:
// - Docker logs
// - Kubernetes
// - Fluentd/Logstash
// - CloudWatch/Stackdriver
```

### 8. Distributed Tracing

Add correlation IDs for request tracing:

```javascript
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || generateId();
  res.setHeader('X-Request-ID', req.id);
  next();
});

const logger = getLogger().child({ requestId: req.id });
```

## Complete Example

See `examples/monitoring-example.js` for a complete implementation with:

- Structured logging
- Prometheus metrics
- Progress tracking
- Health checks
- Rate limiting
- Beautiful web UI

Run with:
```bash
node examples/monitoring-example.js
```

## Zero Dependencies

All observability features use only native Node.js modules:

- `events` - EventEmitter for progress tracking
- `stream` - Transform streams for progress
- `util` - Formatting and utilities
- No external logging libraries
- No metrics collection libraries
- No monitoring agents

This ensures:
- Zero installation overhead
- No supply chain vulnerabilities
- Minimal bundle size
- Maximum performance
