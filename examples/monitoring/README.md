# FluxUpload Monitoring Stack

Complete monitoring and observability setup for FluxUpload using Prometheus and Grafana.

## Features

- **Prometheus** - Metrics collection and storage
- **Grafana** - Metrics visualization and dashboards
- **Node Exporter** - System-level metrics
- **Pre-configured Dashboard** - Ready-to-use FluxUpload dashboard

## Quick Start

### 1. Start the monitoring stack

```bash
cd examples/monitoring
docker-compose -f docker-compose.monitoring.yml up -d
```

### 2. Access the services

- **FluxUpload Web UI**: http://localhost:3000
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### 3. View the dashboard

1. Open Grafana at http://localhost:3001
2. Login with username `admin` and password `admin`
3. Navigate to Dashboards → FluxUpload Dashboard
4. Upload some files to see metrics in action

## Architecture

```
┌─────────────┐
│ FluxUpload  │ :3000
│ Application │
└──────┬──────┘
       │
       │ /metrics endpoint
       │
       ▼
┌─────────────┐
│ Prometheus  │ :9090
│  (Metrics)  │
└──────┬──────┘
       │
       │ PromQL queries
       │
       ▼
┌─────────────┐
│  Grafana    │ :3001
│(Dashboards) │
└─────────────┘
```

## Metrics Exposed

### Upload Metrics

- `fluxupload_uploads_total` - Total number of uploads
- `fluxupload_uploads_active` - Currently active uploads
- `fluxupload_uploads_failed_total` - Failed uploads
- `fluxupload_uploads_bytes_total` - Total bytes uploaded
- `fluxupload_upload_duration_seconds` - Upload duration histogram
- `fluxupload_file_size_bytes` - File size distribution

### Parser Metrics

- `fluxupload_parser_fields_total` - Form fields parsed
- `fluxupload_parser_files_total` - Files parsed

### Plugin Metrics

- `fluxupload_plugin_duration_seconds` - Plugin execution time

### Storage Metrics

- `fluxupload_storage_write_duration_seconds` - Storage write duration

## Grafana Dashboard

The pre-configured dashboard includes:

1. **Upload Rate** - Requests per second
2. **Active Uploads** - Real-time gauge
3. **Upload Throughput** - Bytes per second
4. **Duration Percentiles** - p50, p95, p99 latencies
5. **Success vs Failed** - Error rate tracking
6. **Plugin Performance** - Individual plugin metrics

## Custom Metrics

Add custom metrics in your application:

```javascript
const { getCollector } = require('fluxupload/src/observability');

const metrics = getCollector();

// Custom counter
const myCounter = metrics.registerCounter(
  'my_custom_metric',
  'Description of my metric'
);

myCounter.inc({ label: 'value' });

// Custom histogram
const myHistogram = metrics.registerHistogram(
  'my_custom_duration',
  'Duration of my operation',
  [0.1, 0.5, 1, 2, 5]
);

myHistogram.observe({ operation: 'foo' }, 1.5);
```

## Health Checks

FluxUpload exposes multiple health check endpoints:

### Overall Health
```bash
curl http://localhost:3000/health
```

Returns:
```json
{
  "status": "pass",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "checks": {
    "uptime": { "status": "pass", "uptime": 3600 },
    "memory": { "status": "pass", "heapUsed": 45 },
    "eventloop": { "status": "pass", "lag": 2 },
    "storage": { "status": "pass", "writable": true }
  }
}
```

### Liveness Probe (Kubernetes)
```bash
curl http://localhost:3000/health/live
```

### Readiness Probe (Kubernetes)
```bash
curl http://localhost:3000/health/ready
```

## Prometheus Queries

### Useful PromQL Queries

**Upload rate (per second)**
```promql
rate(fluxupload_uploads_total[5m])
```

**Error rate**
```promql
rate(fluxupload_uploads_failed_total[5m]) / rate(fluxupload_uploads_total[5m])
```

**Average upload duration**
```promql
rate(fluxupload_upload_duration_seconds_sum[5m]) / rate(fluxupload_upload_duration_seconds_count[5m])
```

**95th percentile upload time**
```promql
histogram_quantile(0.95, rate(fluxupload_upload_duration_seconds_bucket[5m]))
```

**Throughput (MB/s)**
```promql
rate(fluxupload_uploads_bytes_total[5m]) / 1024 / 1024
```

## Alerting

Create alerts in Prometheus by adding an `alerts.yml` file:

```yaml
groups:
  - name: fluxupload
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(fluxupload_uploads_failed_total[5m]) / rate(fluxupload_uploads_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High upload error rate"
          description: "Error rate is {{ $value }}%"

      - alert: SlowUploads
        expr: histogram_quantile(0.95, rate(fluxupload_upload_duration_seconds_bucket[5m])) > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow upload performance"
          description: "95th percentile upload time is {{ $value }}s"
```

## Production Deployment

For production, configure:

1. **Persistent Storage** - Ensure Prometheus and Grafana data persists
2. **Alerting** - Set up Alertmanager for notifications
3. **Authentication** - Secure Grafana and Prometheus
4. **Retention** - Configure appropriate retention policies
5. **High Availability** - Deploy multiple instances

Example production setup:

```yaml
# docker-compose.prod.yml
services:
  prometheus:
    volumes:
      - /data/prometheus:/prometheus
    command:
      - '--storage.tsdb.retention.time=90d'
      - '--storage.tsdb.retention.size=50GB'

  grafana:
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_SERVER_ROOT_URL=https://monitoring.example.com
      - GF_AUTH_ANONYMOUS_ENABLED=false
```

## Troubleshooting

### Prometheus not scraping metrics

1. Check FluxUpload is running: `curl http://localhost:3000/health`
2. Check metrics endpoint: `curl http://localhost:3000/metrics`
3. Check Prometheus targets: http://localhost:9090/targets

### Grafana not showing data

1. Verify Prometheus datasource is configured correctly
2. Check time range in Grafana (default: last 1 hour)
3. Generate some traffic to create metrics

### No data in dashboard

1. Upload some files to generate metrics
2. Wait ~30 seconds for Prometheus to scrape
3. Refresh Grafana dashboard

## Advanced Configuration

### Custom Scrape Interval

Edit `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'fluxupload'
    scrape_interval: 5s  # More frequent scraping
```

### Grafana Provisioning

Add custom dashboards to `grafana/dashboards/` directory - they'll be automatically imported.

### Remote Storage

Configure Prometheus to use remote storage (e.g., Thanos, Cortex):

```yaml
remote_write:
  - url: "https://remote-storage.example.com/api/v1/push"
```

## Resources

- [Prometheus Documentation](https://prometheus.io/website/)
- [Grafana Documentation](https://grafana.com/website/)
- [PromQL Tutorial](https://prometheus.io/website/prometheus/latest/querying/basics/)
- [Grafana Dashboard Best Practices](https://grafana.com/website/grafana/latest/best-practices/)
