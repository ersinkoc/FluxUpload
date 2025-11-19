/**
 * Monitoring Example for FluxUpload
 *
 * Demonstrates comprehensive monitoring and observability:
 * - Structured logging
 * - Prometheus metrics endpoint
 * - Health check endpoints
 * - Progress tracking with WebSocket updates
 * - Rate limiting
 *
 * Endpoints:
 * - POST /upload - Upload files with full monitoring
 * - GET /metrics - Prometheus metrics
 * - GET /health - Health check
 * - GET /health/live - Liveness probe
 * - GET /health/ready - Readiness probe
 * - GET /stats - Upload statistics
 * - GET /progress/:fileId - Get progress for specific file
 *
 * Run: node examples/monitoring-example.js
 * Test: curl -F "file=@test.jpg" http://localhost:3000/upload
 */

const http = require('http');
const { FluxUpload } = require('../src');
const { LocalStorage } = require('../src/storage/LocalStorage');
const { QuotaLimiter } = require('../src/plugins/validators/QuotaLimiter');
const { MagicByteDetector } = require('../src/plugins/validators/MagicByteDetector');
const RateLimiter = require('../src/plugins/validators/RateLimiter');
const { StreamHasher } = require('../src/plugins/transformers/StreamHasher');
const {
  getLogger,
  getCollector,
  ProgressTracker,
  HealthCheck
} = require('../src/observability');

// Configure structured logging
const logger = getLogger({
  level: 'info',
  format: 'json',
  pretty: true,
  baseContext: {
    service: 'fluxupload-demo',
    environment: 'production'
  }
});

// Initialize metrics collector
const metrics = getCollector();

// Initialize progress tracker
const progressTracker = new ProgressTracker({
  emitInterval: 500 // Emit progress every 500ms
});

// Progress event listeners
progressTracker.on('started', (progress) => {
  logger.info('Upload started', progress);
});

progressTracker.on('progress', (progress) => {
  logger.debug('Upload progress', progress);
});

progressTracker.on('completed', (progress) => {
  logger.info('Upload completed', progress);
});

progressTracker.on('error', (progress) => {
  logger.error('Upload failed', progress);
});

// Initialize health check
const healthCheck = new HealthCheck();
healthCheck.registerStorageCheck('./uploads');

// Configure storage
const storage = new LocalStorage({
  destination: './uploads',
  namingStrategy: 'uuid'
});

// Configure plugins with monitoring
const quotaLimiter = new QuotaLimiter({
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxTotalSize: 500 * 1024 * 1024 // 500MB total
});

const magicByteDetector = new MagicByteDetector({
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf']
});

const rateLimiter = new RateLimiter({
  maxRequests: 10, // 10 requests
  windowMs: 60000, // per minute
  handler: (context, info) => {
    logger.warn('Rate limit exceeded', {
      ip: context.request.socket.remoteAddress,
      limit: info.limit,
      waitTime: info.waitTime
    });

    const error = new Error('Too many uploads. Please try again later.');
    error.code = 'RATE_LIMIT_EXCEEDED';
    error.statusCode = 429;
    error.retryAfter = Math.ceil(info.waitTime / 1000);
    throw error;
  }
});

const hasher = new StreamHasher({ algorithm: 'sha256' });

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const requestId = logger.generateRequestId();
  const requestLogger = logger.child({ requestId });

  // Log request
  requestLogger.info('Request received', {
    method: req.method,
    url: req.url,
    ip: req.socket.remoteAddress
  });

  // Metrics endpoint
  if (req.url === '/metrics' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(metrics.toPrometheus());
    return;
  }

  // Health check endpoints
  if (req.url === '/health' && req.method === 'GET') {
    const health = await healthCheck.check();
    const statusCode = health.status === 'pass' ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
    return;
  }

  if (req.url === '/health/live' && req.method === 'GET') {
    const liveness = await healthCheck.liveness();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(liveness, null, 2));
    return;
  }

  if (req.url === '/health/ready' && req.method === 'GET') {
    const readiness = await healthCheck.readiness();
    const statusCode = readiness.status === 'pass' ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readiness, null, 2));
    return;
  }

  // Statistics endpoint
  if (req.url === '/stats' && req.method === 'GET') {
    const stats = {
      progress: progressTracker.getStatistics(),
      metrics: metrics.toJSON(),
      rateLimit: rateLimiter.getStats()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  // Progress endpoint
  if (req.url.startsWith('/progress/') && req.method === 'GET') {
    const fileId = req.url.split('/')[2];
    const progress = progressTracker.getProgress(fileId);

    if (!progress) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(progress, null, 2));
    return;
  }

  // Upload endpoint
  if (req.url === '/upload' && req.method === 'POST') {
    const uploadStartTime = metrics.recordUploadStart({
      endpoint: '/upload'
    });

    logger.startRequest(requestId, {
      endpoint: '/upload',
      ip: req.socket.remoteAddress
    });

    const uploader = new FluxUpload({
      request: req,
      validators: [rateLimiter, quotaLimiter, magicByteDetector],
      transformers: [hasher],
      storage,

      onFile: async (file) => {
        requestLogger.info('File received', {
          filename: file.filename,
          mimetype: file.mimetype,
          encoding: file.encoding
        });

        metrics.recordFileParsed({ mimetype: file.mimetype });

        // Create progress stream
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        const fileId = progressTracker._generateFileId();

        const progressStream = progressTracker.createProgressStream({
          fileId,
          filename: file.filename,
          totalBytes: contentLength
        });

        // Wrap the file stream with progress tracking
        file.stream = file.stream.pipe(progressStream);

        // Store file ID for response
        file.fileId = fileId;
      },

      onField: (name, value) => {
        requestLogger.debug('Field received', { name, value });
        metrics.recordFieldParsed();
      },

      onFinish: (results) => {
        requestLogger.info('Upload complete', {
          fileCount: results.files.length,
          fieldCount: Object.keys(results.fields).length
        });

        metrics.recordUploadComplete(uploadStartTime, {
          endpoint: '/upload',
          status: 'success'
        });

        logger.endRequest(requestId, {
          status: 'success',
          files: results.files.length
        });

        // Record bytes uploaded
        results.files.forEach(file => {
          if (file.size) {
            metrics.recordBytesUploaded(file.size, {
              mimetype: file.mimetype
            });
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          requestId,
          files: results.files.map(f => ({
            filename: f.filename,
            path: f.path,
            size: f.size,
            mimetype: f.mimetype,
            hash: f.hash,
            fileId: f.fileId
          })),
          fields: results.fields
        }, null, 2));
      },

      onError: (error) => {
        requestLogger.error('Upload failed', {
          error: error.message,
          code: error.code
        });

        metrics.recordUploadFailure(uploadStartTime, {
          endpoint: '/upload',
          error: error.code || 'UNKNOWN'
        });

        logger.endRequest(requestId, {
          status: 'error',
          error: error.message
        });

        const statusCode = error.statusCode || 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          requestId,
          error: error.message,
          code: error.code,
          ...(error.retryAfter && { retryAfter: error.retryAfter })
        }, null, 2));
      }
    });

    return; // FluxUpload handles the response
  }

  // Serve demo HTML
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>FluxUpload Monitoring Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    h1 {
      color: #667eea;
      margin-bottom: 10px;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: white;
      padding: 25px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    .card h2 {
      color: #333;
      font-size: 18px;
      margin-bottom: 15px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .upload-area {
      border: 3px dashed #667eea;
      border-radius: 10px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #f8f9ff;
    }
    .upload-area:hover {
      background: #667eea;
      color: white;
    }
    .upload-area input {
      display: none;
    }
    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 12px 30px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      margin-top: 15px;
      width: 100%;
      transition: all 0.3s;
    }
    button:hover {
      background: #764ba2;
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .progress {
      width: 100%;
      height: 30px;
      background: #f0f0f0;
      border-radius: 15px;
      overflow: hidden;
      margin-top: 15px;
      display: none;
    }
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
    }
    .metric {
      padding: 15px;
      background: #f8f9ff;
      border-radius: 5px;
      margin-bottom: 10px;
    }
    .metric-label {
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .metric-value {
      color: #333;
      font-size: 24px;
      font-weight: bold;
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
    }
    .status.pass {
      background: #d4edda;
      color: #155724;
    }
    .status.fail {
      background: #f8d7da;
      color: #721c24;
    }
    .link-button {
      display: inline-block;
      background: #764ba2;
      color: white;
      text-decoration: none;
      padding: 8px 20px;
      border-radius: 5px;
      margin: 5px;
      font-size: 14px;
    }
    #result {
      margin-top: 15px;
      padding: 15px;
      border-radius: 5px;
      display: none;
    }
    #result.success {
      background: #d4edda;
      color: #155724;
    }
    #result.error {
      background: #f8d7da;
      color: #721c24;
    }
    pre {
      background: #f8f9ff;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 FluxUpload Monitoring Demo</h1>
      <p class="subtitle">Enterprise-grade observability for file uploads</p>
    </div>

    <div class="grid">
      <div class="card">
        <h2>📤 Upload Files</h2>
        <div class="upload-area" onclick="document.getElementById('fileInput').click()">
          <div>📁 Click to select files</div>
          <div style="font-size: 12px; color: #666; margin-top: 10px;">Max 100MB per file</div>
          <input type="file" id="fileInput" multiple>
        </div>
        <button id="uploadBtn" onclick="uploadFiles()" disabled>Upload</button>
        <div class="progress" id="progress">
          <div class="progress-bar" id="progressBar">0%</div>
        </div>
        <div id="result"></div>
      </div>

      <div class="card">
        <h2>📊 Live Statistics</h2>
        <div id="stats">Loading...</div>
        <a href="/metrics" target="_blank" class="link-button">View Prometheus Metrics</a>
      </div>

      <div class="card">
        <h2>💚 Health Status</h2>
        <div id="health">Loading...</div>
        <a href="/health" target="_blank" class="link-button">Full Health Report</a>
      </div>
    </div>

    <div class="card">
      <h2>📚 Monitoring Endpoints</h2>
      <pre>
GET  /metrics       - Prometheus metrics endpoint
GET  /health        - Overall health check
GET  /health/live   - Liveness probe (K8s)
GET  /health/ready  - Readiness probe (K8s)
GET  /stats         - Upload statistics
POST /upload        - Upload files with monitoring</pre>
    </div>
  </div>

  <script>
    let selectedFiles = null;

    document.getElementById('fileInput').addEventListener('change', (e) => {
      selectedFiles = e.target.files;
      document.getElementById('uploadBtn').disabled = !selectedFiles || selectedFiles.length === 0;
    });

    async function uploadFiles() {
      if (!selectedFiles) return;

      const formData = new FormData();
      for (let file of selectedFiles) {
        formData.append('files', file);
      }

      const btn = document.getElementById('uploadBtn');
      const progress = document.getElementById('progress');
      const progressBar = document.getElementById('progressBar');
      const result = document.getElementById('result');

      btn.disabled = true;
      progress.style.display = 'block';
      result.style.display = 'none';

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
          }
        });

        xhr.onload = function() {
          const data = JSON.parse(xhr.responseText);
          result.className = data.success ? 'success' : 'error';
          result.textContent = data.success
            ? \`✅ Uploaded \${data.files.length} file(s) successfully!\`
            : \`❌ Error: \${data.error}\`;
          result.style.display = 'block';
          btn.disabled = false;
          progress.style.display = 'none';
          loadStats();
        };

        xhr.onerror = function() {
          result.className = 'error';
          result.textContent = '❌ Upload failed';
          result.style.display = 'block';
          btn.disabled = false;
          progress.style.display = 'none';
        };

        xhr.open('POST', '/upload');
        xhr.send(formData);
      } catch (error) {
        result.className = 'error';
        result.textContent = '❌ Error: ' + error.message;
        result.style.display = 'block';
        btn.disabled = false;
        progress.style.display = 'none';
      }
    }

    async function loadStats() {
      try {
        const response = await fetch('/stats');
        const stats = await response.json();

        document.getElementById('stats').innerHTML = \`
          <div class="metric">
            <div class="metric-label">Active Uploads</div>
            <div class="metric-value">\${stats.progress.active.count}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Completed Uploads</div>
            <div class="metric-value">\${stats.progress.completed.count}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Success Rate</div>
            <div class="metric-value">\${stats.progress.completed.successRate}%</div>
          </div>
        \`;
      } catch (error) {
        document.getElementById('stats').innerHTML = '<p>Error loading stats</p>';
      }
    }

    async function loadHealth() {
      try {
        const response = await fetch('/health');
        const health = await response.json();

        const statusClass = health.status === 'pass' ? 'pass' : 'fail';
        const statusIcon = health.status === 'pass' ? '✅' : '❌';

        document.getElementById('health').innerHTML = \`
          <div style="margin-bottom: 15px;">
            <span class="status \${statusClass}">\${statusIcon} \${health.status.toUpperCase()}</span>
          </div>
          <div class="metric">
            <div class="metric-label">Uptime</div>
            <div class="metric-value" style="font-size: 16px;">\${health.checks.uptime?.uptimeHuman || 'N/A'}</div>
          </div>
        \`;
      } catch (error) {
        document.getElementById('health').innerHTML = '<p>Error loading health</p>';
      }
    }

    // Load stats and health on page load
    loadStats();
    loadHealth();

    // Refresh every 5 seconds
    setInterval(() => {
      loadStats();
      loadHealth();
    }, 5000);
  </script>
</body>
</html>
    `);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    endpoints: [
      'POST /upload',
      'GET /metrics',
      'GET /health',
      'GET /health/live',
      'GET /health/ready',
      'GET /stats',
      'GET /'
    ]
  });
  console.log(`\n🚀 FluxUpload Monitoring Demo running on http://localhost:${PORT}\n`);
  console.log('Endpoints:');
  console.log('  🌐 Web UI:            http://localhost:' + PORT);
  console.log('  📊 Prometheus:        http://localhost:' + PORT + '/metrics');
  console.log('  💚 Health Check:      http://localhost:' + PORT + '/health');
  console.log('  📈 Statistics:        http://localhost:' + PORT + '/stats');
  console.log('');
});
