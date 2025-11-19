/**
 * WebSocket Real-Time Progress Example
 *
 * Demonstrates real-time upload progress streaming to browser clients using WebSockets.
 * Perfect for building upload UIs with live progress bars.
 *
 * Features:
 * - Real-time progress updates via WebSocket
 * - Multiple concurrent uploads tracking
 * - Beautiful web UI with progress bars
 * - File preview and upload status
 * - Zero-dependency WebSocket implementation
 *
 * Run: node examples/websocket-progress-example.js
 * Open: http://localhost:3000
 */

const http = require('http');
const crypto = require('crypto');
const FluxUpload = require('../src');
const LocalStorage = require('../src/storage/LocalStorage');
const QuotaLimiter = require('../src/plugins/validators/QuotaLimiter');
const MagicByteDetector = require('../src/plugins/validators/MagicByteDetector');
const StreamHasher = require('../src/plugins/transformers/StreamHasher');
const { ProgressTracker } = require('../src/observability');

// Initialize progress tracker
const progressTracker = new ProgressTracker({
  emitInterval: 100 // Update every 100ms for smooth UI
});

// Storage configuration
const storage = new LocalStorage({
  destination: './uploads',
  namingStrategy: 'uuid'
});

// WebSocket connection management
const clients = new Map(); // socketId -> WebSocket connection

/**
 * Simple WebSocket server implementation (zero dependencies!)
 */
function handleWebSocket(req, socket, head) {
  // Parse the WebSocket handshake
  const key = req.headers['sec-websocket-key'];
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  // Send handshake response
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n'
  );

  const socketId = crypto.randomBytes(8).toString('hex');
  const client = { socket, id: socketId };
  clients.set(socketId, client);

  console.log(`[WebSocket] Client connected: ${socketId}`);

  // Handle incoming frames
  socket.on('data', (buffer) => {
    try {
      const frame = parseWebSocketFrame(buffer);
      if (frame.opcode === 0x8) {
        // Connection close
        socket.end();
      } else if (frame.opcode === 0x9) {
        // Ping - respond with pong
        sendWebSocketFrame(socket, 0xA, Buffer.from(''));
      }
    } catch (error) {
      console.error('[WebSocket] Frame parse error:', error.message);
    }
  });

  socket.on('close', () => {
    clients.delete(socketId);
    console.log(`[WebSocket] Client disconnected: ${socketId}`);
  });

  socket.on('error', (error) => {
    console.error(`[WebSocket] Socket error:`, error.message);
    clients.delete(socketId);
  });
}

/**
 * Parse WebSocket frame
 */
function parseWebSocketFrame(buffer) {
  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const fin = (firstByte & 0x80) !== 0;
  const opcode = firstByte & 0x0F;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7F;

  let offset = 2;

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    payloadLength = buffer.readBigUInt64BE(offset);
    offset += 8;
  }

  let payload = Buffer.alloc(0);
  if (masked) {
    const maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
    const encoded = buffer.slice(offset, offset + Number(payloadLength));
    payload = Buffer.alloc(encoded.length);
    for (let i = 0; i < encoded.length; i++) {
      payload[i] = encoded[i] ^ maskingKey[i % 4];
    }
  } else {
    payload = buffer.slice(offset, offset + Number(payloadLength));
  }

  return { fin, opcode, payload };
}

/**
 * Send WebSocket frame
 */
function sendWebSocketFrame(socket, opcode, payload) {
  const length = payload.length;
  let buffer;

  if (length < 126) {
    buffer = Buffer.allocUnsafe(2 + length);
    buffer[0] = 0x80 | opcode;
    buffer[1] = length;
    payload.copy(buffer, 2);
  } else if (length < 65536) {
    buffer = Buffer.allocUnsafe(4 + length);
    buffer[0] = 0x80 | opcode;
    buffer[1] = 126;
    buffer.writeUInt16BE(length, 2);
    payload.copy(buffer, 4);
  } else {
    buffer = Buffer.allocUnsafe(10 + length);
    buffer[0] = 0x80 | opcode;
    buffer[1] = 127;
    buffer.writeBigUInt64BE(BigInt(length), 2);
    payload.copy(buffer, 10);
  }

  socket.write(buffer);
}

/**
 * Broadcast message to all connected clients
 */
function broadcast(message) {
  const payload = Buffer.from(JSON.stringify(message));
  clients.forEach(client => {
    try {
      sendWebSocketFrame(client.socket, 0x1, payload); // 0x1 = text frame
    } catch (error) {
      console.error('[WebSocket] Broadcast error:', error.message);
    }
  });
}

// Listen to progress events and broadcast
progressTracker.on('started', (progress) => {
  broadcast({ type: 'started', data: progress });
});

progressTracker.on('progress', (progress) => {
  broadcast({ type: 'progress', data: progress });
});

progressTracker.on('completed', (progress) => {
  broadcast({ type: 'completed', data: progress });
});

progressTracker.on('error', (progress) => {
  broadcast({ type: 'error', data: progress });
});

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Upload endpoint
  if (req.url === '/upload' && req.method === 'POST') {
    const uploader = new FluxUpload({
      request: req,
      validators: [
        new QuotaLimiter({ maxFileSize: 100 * 1024 * 1024 }),
        new MagicByteDetector({
          allowed: ['image/*', 'application/pdf', 'text/*']
        })
      ],
      transformers: [new StreamHasher({ algorithm: 'sha256' })],
      storage,

      onFile: async (file) => {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);
        const fileId = crypto.randomBytes(8).toString('hex');

        // Create progress stream
        const progressStream = progressTracker.createProgressStream({
          fileId,
          filename: file.filename,
          totalBytes: contentLength
        });

        // Wrap stream with progress tracking
        file.stream = file.stream.pipe(progressStream);
        file.fileId = fileId;
      },

      onFinish: (results) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          files: results.files.map(f => ({
            filename: f.filename,
            fileId: f.fileId,
            size: f.size,
            hash: f.hash,
            path: f.path
          }))
        }, null, 2));
      },

      onError: (error) => {
        res.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message
        }));
      }
    });

    return;
  }

  // Statistics endpoint
  if (req.url === '/stats' && req.method === 'GET') {
    const stats = progressTracker.getStatistics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ...stats,
      connectedClients: clients.size
    }, null, 2));
    return;
  }

  // Serve HTML UI
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Upload Progress - FluxUpload</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 900px;
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
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      margin-left: 10px;
    }
    .status.connected {
      background: #d4edda;
      color: #155724;
    }
    .status.disconnected {
      background: #f8d7da;
      color: #721c24;
    }
    .card {
      background: white;
      padding: 25px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      margin-bottom: 20px;
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
    button:hover:not(:disabled) {
      background: #764ba2;
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0,0,0,0.2);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .upload-item {
      background: #f8f9ff;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 15px;
      border-left: 4px solid #667eea;
    }
    .upload-item.completed {
      border-left-color: #28a745;
    }
    .upload-item.error {
      border-left-color: #dc3545;
    }
    .filename {
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .progress-container {
      position: relative;
      height: 30px;
      background: #e9ecef;
      border-radius: 15px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-bar {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .progress-bar.completed {
      background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
    }
    .progress-text {
      position: relative;
      z-index: 1;
      font-size: 12px;
      font-weight: bold;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      line-height: 30px;
      text-align: center;
    }
    .upload-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      font-size: 12px;
      color: #666;
      margin-top: 10px;
    }
    .stat {
      background: white;
      padding: 8px;
      border-radius: 5px;
      text-align: center;
    }
    .stat-value {
      font-weight: bold;
      color: #667eea;
      font-size: 14px;
    }
    #uploads {
      min-height: 100px;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 WebSocket Upload Progress</h1>
      <p class="subtitle">Real-time progress tracking with FluxUpload</p>
      <span id="wsStatus" class="status disconnected">Disconnected</span>
    </div>

    <div class="card">
      <h2>Upload Files</h2>
      <div class="upload-area" onclick="document.getElementById('fileInput').click()">
        <div style="font-size: 48px;">📁</div>
        <div style="margin-top: 10px;">Click to select files</div>
        <div style="font-size: 12px; color: #666; margin-top: 5px;">Max 100MB per file</div>
        <input type="file" id="fileInput" multiple>
      </div>
      <button id="uploadBtn" onclick="uploadFiles()" disabled>Upload Selected Files</button>
    </div>

    <div class="card">
      <h2>Active Uploads</h2>
      <div id="uploads">
        <div class="empty-state">No active uploads. Select files to begin.</div>
      </div>
    </div>
  </div>

  <script>
    let ws = null;
    let selectedFiles = null;
    const uploads = new Map();

    // Connect to WebSocket
    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        document.getElementById('wsStatus').textContent = 'Connected';
        document.getElementById('wsStatus').className = 'status connected';
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        document.getElementById('wsStatus').textContent = 'Disconnected';
        document.getElementById('wsStatus').className = 'status disconnected';
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleProgressUpdate(message);
        } catch (error) {
          console.error('[WebSocket] Message parse error:', error);
        }
      };
    }

    // Handle progress updates
    function handleProgressUpdate(message) {
      const { type, data } = message;

      if (type === 'started') {
        createUploadItem(data);
      } else if (type === 'progress') {
        updateUploadItem(data);
      } else if (type === 'completed') {
        completeUploadItem(data);
      } else if (type === 'error') {
        errorUploadItem(data);
      }
    }

    // Create upload item
    function createUploadItem(data) {
      const item = document.createElement('div');
      item.id = 'upload-' + data.fileId;
      item.className = 'upload-item';
      item.innerHTML = \`
        <div class="filename">\${escapeHtml(data.filename)}</div>
        <div class="progress-container">
          <div class="progress-bar" style="width: 0%"></div>
          <div class="progress-text">0%</div>
        </div>
        <div class="upload-stats">
          <div class="stat">
            <div>Speed</div>
            <div class="stat-value">0 KB/s</div>
          </div>
          <div class="stat">
            <div>Progress</div>
            <div class="stat-value">0 / 0 MB</div>
          </div>
          <div class="stat">
            <div>ETA</div>
            <div class="stat-value">--</div>
          </div>
        </div>
      \`;

      const container = document.getElementById('uploads');
      if (container.querySelector('.empty-state')) {
        container.innerHTML = '';
      }
      container.appendChild(item);
      uploads.set(data.fileId, item);
    }

    // Update upload item
    function updateUploadItem(data) {
      const item = uploads.get(data.fileId);
      if (!item) return;

      const progressBar = item.querySelector('.progress-bar');
      const progressText = item.querySelector('.progress-text');
      const stats = item.querySelectorAll('.stat-value');

      progressBar.style.width = data.percentage + '%';
      progressText.textContent = data.percentage.toFixed(1) + '%';

      stats[0].textContent = formatSpeed(data.bytesPerSecond);
      stats[1].textContent = \`\${formatBytes(data.bytesProcessed)} / \${formatBytes(data.totalBytes)}\`;
      stats[2].textContent = formatTime(data.estimatedTimeRemaining);
    }

    // Complete upload item
    function completeUploadItem(data) {
      const item = uploads.get(data.fileId);
      if (!item) return;

      item.className = 'upload-item completed';
      const progressBar = item.querySelector('.progress-bar');
      const progressText = item.querySelector('.progress-text');

      progressBar.style.width = '100%';
      progressBar.className = 'progress-bar completed';
      progressText.textContent = '✓ Completed';
    }

    // Error upload item
    function errorUploadItem(data) {
      const item = uploads.get(data.fileId);
      if (!item) return;

      item.className = 'upload-item error';
      const progressText = item.querySelector('.progress-text');
      progressText.textContent = '✗ Failed';
    }

    // File input change
    document.getElementById('fileInput').addEventListener('change', (e) => {
      selectedFiles = e.target.files;
      document.getElementById('uploadBtn').disabled = !selectedFiles || selectedFiles.length === 0;
    });

    // Upload files
    async function uploadFiles() {
      if (!selectedFiles) return;

      const formData = new FormData();
      for (let file of selectedFiles) {
        formData.append('files', file);
      }

      const btn = document.getElementById('uploadBtn');
      btn.disabled = true;

      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        console.log('[Upload] Result:', result);

        if (result.success) {
          setTimeout(() => {
            selectedFiles = null;
            document.getElementById('fileInput').value = '';
            btn.disabled = false;
          }, 2000);
        }
      } catch (error) {
        console.error('[Upload] Error:', error);
        btn.disabled = false;
      }
    }

    // Utility functions
    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function formatSpeed(bytesPerSecond) {
      return formatBytes(bytesPerSecond) + '/s';
    }

    function formatTime(seconds) {
      if (!seconds || seconds === Infinity) return '--';
      if (seconds < 60) return Math.round(seconds) + 's';
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return \`\${mins}m \${secs}s\`;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Connect on load
    connectWebSocket();
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

// Handle WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
  handleWebSocket(req, socket, head);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 WebSocket Upload Progress Server running on http://localhost:${PORT}\n`);
  console.log('Features:');
  console.log('  ✓ Real-time progress via WebSocket');
  console.log('  ✓ Multiple concurrent uploads');
  console.log('  ✓ Beautiful web UI');
  console.log('  ✓ Zero dependencies!\n');
});
