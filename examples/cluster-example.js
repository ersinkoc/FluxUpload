/**
 * Cluster Example for FluxUpload
 *
 * Demonstrates horizontal scaling using Node.js cluster module.
 * Distributes upload load across multiple CPU cores for maximum throughput.
 *
 * Features:
 * - Automatic worker spawning (one per CPU core)
 * - Round-robin load balancing
 * - Worker health monitoring
 * - Automatic restart on crash
 * - Shared upload statistics
 * - Graceful shutdown
 *
 * Run: node examples/cluster-example.js
 */

const cluster = require('cluster');
const os = require('os');
const http = require('http');
const { FluxUpload } = require('../src');
const { LocalStorage } = require('../src/storage/LocalStorage');
const { QuotaLimiter } = require('../src/plugins/validators/QuotaLimiter');
const { MagicByteDetector } = require('../src/plugins/validators/MagicByteDetector');
const RateLimiter = require('../src/plugins/validators/RateLimiter');
const { StreamHasher } = require('../src/plugins/transformers/StreamHasher');
const { getLogger, getCollector, HealthCheck } = require('../src/observability');

const PORT = process.env.PORT || 3000;
const NUM_WORKERS = process.env.WORKERS || os.cpus().length;

// ============================================================================
// Master Process
// ============================================================================

if (cluster.isMaster) {
  console.log(`\n🚀 FluxUpload Cluster Mode`);
  console.log(`Master process ${process.pid} starting...`);
  console.log(`CPU cores: ${os.cpus().length}`);
  console.log(`Spawning ${NUM_WORKERS} workers\n`);

  const logger = getLogger({
    level: 'info',
    format: 'json',
    pretty: true,
    baseContext: {
      process: 'master',
      pid: process.pid
    }
  });

  // Worker statistics
  const workerStats = new Map();

  // Spawn workers
  for (let i = 0; i < NUM_WORKERS; i++) {
    spawnWorker();
  }

  /**
   * Spawn a new worker
   */
  function spawnWorker() {
    const worker = cluster.fork();
    workerStats.set(worker.id, {
      pid: worker.process.pid,
      spawned: Date.now(),
      uploads: 0,
      errors: 0,
      status: 'starting'
    });

    logger.info('Worker spawned', {
      workerId: worker.id,
      pid: worker.process.pid
    });

    worker.on('message', (msg) => {
      handleWorkerMessage(worker, msg);
    });

    worker.on('online', () => {
      const stats = workerStats.get(worker.id);
      stats.status = 'online';
      logger.info('Worker online', {
        workerId: worker.id,
        pid: worker.process.pid
      });
    });

    worker.on('exit', (code, signal) => {
      logger.warn('Worker exited', {
        workerId: worker.id,
        pid: worker.process.pid,
        code,
        signal
      });

      workerStats.delete(worker.id);

      // Respawn if not a graceful shutdown
      if (signal !== 'SIGTERM' && code !== 0) {
        logger.info('Respawning worker');
        setTimeout(spawnWorker, 1000);
      }
    });
  }

  /**
   * Handle messages from workers
   */
  function handleWorkerMessage(worker, msg) {
    const stats = workerStats.get(worker.id);
    if (!stats) return;

    switch (msg.type) {
      case 'upload_complete':
        stats.uploads++;
        break;
      case 'upload_error':
        stats.errors++;
        break;
      case 'stats':
        stats.memory = msg.data.memory;
        stats.uptime = msg.data.uptime;
        break;
    }
  }

  /**
   * Periodic health check
   */
  setInterval(() => {
    const totalUploads = Array.from(workerStats.values())
      .reduce((sum, s) => sum + s.uploads, 0);
    const totalErrors = Array.from(workerStats.values())
      .reduce((sum, s) => sum + s.errors, 0);

    logger.debug('Cluster statistics', {
      workers: workerStats.size,
      totalUploads,
      totalErrors,
      successRate: totalUploads > 0
        ? Math.round((totalUploads / (totalUploads + totalErrors)) * 100)
        : 100
    });
  }, 30000); // Every 30 seconds

  /**
   * Graceful shutdown
   */
  process.on('SIGTERM', () => {
    logger.info('Master received SIGTERM, shutting down gracefully');

    for (const id in cluster.workers) {
      cluster.workers[id].send({ type: 'shutdown' });
    }

    setTimeout(() => {
      for (const id in cluster.workers) {
        cluster.workers[id].kill();
      }
      process.exit(0);
    }, 10000); // 10 second grace period
  });

  // Handle master termination
  process.on('SIGINT', () => {
    logger.info('Master received SIGINT, shutting down');
    process.exit(0);
  });

  // Display ready message
  console.log(`✅ Master ready on port ${PORT}`);
  console.log(`Workers: ${NUM_WORKERS}`);
  console.log(`Load balancing: Round-robin\n`);
}

// ============================================================================
// Worker Process
// ============================================================================

else {
  const logger = getLogger({
    level: 'info',
    format: 'json',
    pretty: false,
    baseContext: {
      process: 'worker',
      workerId: cluster.worker.id,
      pid: process.pid
    }
  });

  const metrics = getCollector();
  const healthCheck = new HealthCheck();

  // Storage configuration (shared across workers)
  const storage = new LocalStorage({
    destination: './uploads',
    namingStrategy: 'uuid'
  });

  // Health check
  healthCheck.registerStorageCheck('./uploads');

  // Rate limiter (per-worker, adjust limits accordingly)
  const rateLimiter = new RateLimiter({
    maxRequests: Math.ceil(100 / NUM_WORKERS), // Distribute limit across workers
    windowMs: 60000
  });

  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Add worker info header
    res.setHeader('X-Worker-ID', cluster.worker.id);
    res.setHeader('X-Worker-PID', process.pid);

    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      const health = await healthCheck.check();
      res.writeHead(health.status === 'pass' ? 200 : 503, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({
        ...health,
        workerId: cluster.worker.id,
        workerPid: process.pid
      }, null, 2));
      return;
    }

    // Metrics
    if (req.url === '/metrics' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics.toPrometheus());
      return;
    }

    // Worker stats
    if (req.url === '/worker-stats' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        workerId: cluster.worker.id,
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }, null, 2));
      return;
    }

    // Upload endpoint
    if (req.url === '/upload' && req.method === 'POST') {
      const uploadStart = Date.now();

      logger.info('Upload request received', {
        ip: req.socket.remoteAddress,
        contentLength: req.headers['content-length']
      });

      const uploader = new FluxUpload({
        request: req,
        validators: [
          rateLimiter,
          new QuotaLimiter({
            maxFileSize: 100 * 1024 * 1024,
            maxTotalSize: 500 * 1024 * 1024
          }),
          new MagicByteDetector({
            allowed: ['image/*', 'application/pdf', 'text/*']
          })
        ],
        transformers: [
          new StreamHasher({ algorithm: 'sha256' })
        ],
        storage,

        onFile: (file) => {
          logger.debug('File received', {
            filename: file.filename,
            mimetype: file.mimetype
          });
        },

        onFinish: (results) => {
          const duration = Date.now() - uploadStart;

          logger.info('Upload completed', {
            fileCount: results.files.length,
            duration
          });

          // Notify master
          process.send({ type: 'upload_complete' });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            workerId: cluster.worker.id,
            workerPid: process.pid,
            files: results.files.map(f => ({
              filename: f.filename,
              size: f.size,
              hash: f.hash,
              path: f.path
            }))
          }, null, 2));
        },

        onError: (error) => {
          logger.error('Upload failed', {
            error: error.message,
            code: error.code
          });

          // Notify master
          process.send({ type: 'upload_error', error: error.message });

          res.writeHead(error.statusCode || 500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            success: false,
            error: error.message,
            code: error.code
          }));
        }
      });

      return;
    }

    // Serve demo HTML
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>FluxUpload Cluster Mode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 800px; margin: 0 auto; }
    .card {
      background: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    h1 { color: #667eea; margin-bottom: 10px; }
    .badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      background: #d4edda;
      color: #155724;
      margin-left: 10px;
    }
    .upload-area {
      border: 3px dashed #667eea;
      border-radius: 10px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      background: #f8f9ff;
      transition: all 0.3s;
    }
    .upload-area:hover {
      background: #667eea;
      color: white;
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
    }
    button:hover { background: #764ba2; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    #result {
      margin-top: 15px;
      padding: 15px;
      border-radius: 5px;
      display: none;
    }
    #result.success { background: #d4edda; color: #155724; }
    #result.error { background: #f8d7da; color: #721c24; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-top: 15px;
    }
    .stat {
      background: #f8f9ff;
      padding: 15px;
      border-radius: 5px;
      text-align: center;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
    }
    .stat-label {
      font-size: 12px;
      color: #666;
      margin-top: 5px;
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
    <div class="card">
      <h1>⚡ FluxUpload Cluster Mode</h1>
      <span class="badge">${NUM_WORKERS} Workers</span>
      <span class="badge">Worker ${cluster.worker.id} (PID ${process.pid})</span>

      <div class="stats">
        <div class="stat">
          <div class="stat-value" id="totalUploads">0</div>
          <div class="stat-label">Total Uploads</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="currentWorker">${cluster.worker.id}</div>
          <div class="stat-label">Served By Worker</div>
        </div>
        <div class="stat">
          <div class="stat-value" id="uptime">0s</div>
          <div class="stat-label">Worker Uptime</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Upload Files</h2>
      <div class="upload-area" onclick="document.getElementById('fileInput').click()">
        <div>📁 Click to select files</div>
        <input type="file" id="fileInput" multiple style="display:none">
      </div>
      <button id="uploadBtn" onclick="uploadFiles()" disabled>Upload</button>
      <div id="result"></div>
    </div>

    <div class="card">
      <h2>How Clustering Works</h2>
      <ul style="line-height: 1.8; color: #666;">
        <li>✓ <strong>Round-Robin Load Balancing</strong> - OS distributes requests across workers</li>
        <li>✓ <strong>${NUM_WORKERS} Worker Processes</strong> - One per CPU core for maximum throughput</li>
        <li>✓ <strong>Automatic Restart</strong> - Workers auto-restart on crash</li>
        <li>✓ <strong>Shared Storage</strong> - All workers write to same upload directory</li>
        <li>✓ <strong>Independent State</strong> - Each worker has own metrics and rate limits</li>
      </ul>
    </div>
  </div>

  <script>
    let uploadCount = 0;

    document.getElementById('fileInput').addEventListener('change', (e) => {
      document.getElementById('uploadBtn').disabled = !e.target.files.length;
    });

    async function uploadFiles() {
      const files = document.getElementById('fileInput').files;
      if (!files.length) return;

      const formData = new FormData();
      for (let file of files) {
        formData.append('files', file);
      }

      const btn = document.getElementById('uploadBtn');
      const result = document.getElementById('result');
      btn.disabled = true;

      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        const workerHeader = response.headers.get('X-Worker-ID');

        if (data.success) {
          uploadCount++;
          document.getElementById('totalUploads').textContent = uploadCount;
          document.getElementById('currentWorker').textContent = workerHeader;

          result.className = 'success';
          result.textContent = \`✅ Uploaded \${data.files.length} file(s) via Worker \${workerHeader}\`;
        } else {
          result.className = 'error';
          result.textContent = \`❌ Error: \${data.error}\`;
        }
        result.style.display = 'block';
      } catch (error) {
        result.className = 'error';
        result.textContent = '❌ Upload failed: ' + error.message;
        result.style.display = 'block';
      }

      btn.disabled = false;
      document.getElementById('fileInput').value = '';
      btn.disabled = true;
    }

    // Update uptime
    let startTime = Date.now();
    setInterval(() => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      document.getElementById('uptime').textContent = uptime + 's';
    }, 1000);
  </script>
</body>
</html>
      `);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // Start worker server
  server.listen(PORT, () => {
    logger.info('Worker started', {
      port: PORT,
      workerId: cluster.worker.id,
      pid: process.pid
    });

    console.log(`[Worker ${cluster.worker.id}] Ready on port ${PORT}`);
  });

  // Send periodic stats to master
  setInterval(() => {
    process.send({
      type: 'stats',
      data: {
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    });
  }, 10000); // Every 10 seconds

  // Handle shutdown signal from master
  process.on('message', (msg) => {
    if (msg.type === 'shutdown') {
      logger.info('Received shutdown signal');
      server.close(() => {
        logger.info('Server closed, exiting');
        process.exit(0);
      });
    }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Worker received SIGTERM');
    server.close(() => {
      process.exit(0);
    });
  });
}
