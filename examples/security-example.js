/**
 * Security Example for FluxUpload
 *
 * Demonstrates security features:
 * - CSRF Protection
 * - Signed Upload URLs
 * - Rate Limiting
 * - Combined security layers
 *
 * Run: node examples/security-example.js
 */

const http = require('http');
const FluxUpload = require('../src');
const LocalStorage = require('../src/storage/LocalStorage');
const QuotaLimiter = require('../src/plugins/validators/QuotaLimiter');
const CsrfProtection = require('../src/plugins/validators/CsrfProtection');
const RateLimiter = require('../src/plugins/validators/RateLimiter');
const SignedUrls = require('../src/utils/SignedUrls');

// Initialize security components
const csrfProtection = new CsrfProtection({
  tokenLifetime: 3600000, // 1 hour
  doubleSubmitCookie: false // Use stateful validation for demo
});

const signedUrls = new SignedUrls({
  secret: process.env.SIGNED_URL_SECRET || 'your-secret-key-change-in-production',
  defaultExpiry: 300 // 5 minutes
});

const rateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000 // 10 uploads per minute
});

const storage = new LocalStorage({
  destination: './uploads',
  namingStrategy: 'uuid'
});

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ========================================
  // Generate CSRF Token
  // ========================================
  if (req.url === '/api/csrf-token' && req.method === 'GET') {
    const token = csrfProtection.generateToken({
      sessionId: req.headers['user-agent'] // In production, use actual session ID
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token,
      expires: Date.now() + 3600000
    }));
    return;
  }

  // ========================================
  // Generate Signed URL
  // ========================================
  if (req.url === '/api/signed-url' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const params = JSON.parse(body);

        const signedUrl = signedUrls.sign('http://localhost:3000/upload-signed', {
          expiresIn: params.expiresIn || 300, // 5 minutes
          maxFileSize: params.maxFileSize || 10 * 1024 * 1024, // 10MB
          maxFiles: params.maxFiles || 5,
          allowedTypes: params.allowedTypes || ['image/*'],
          userId: params.userId || 'anonymous',
          metadata: params.metadata || {}
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          url: signedUrl,
          expiresIn: params.expiresIn || 300
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // ========================================
  // Upload with CSRF Protection
  // ========================================
  if (req.url === '/upload-csrf' && req.method === 'POST') {
    const uploader = new FluxUpload({
      request: req,
      validators: [
        csrfProtection,
        rateLimiter,
        new QuotaLimiter({ maxFileSize: 50 * 1024 * 1024 })
      ],
      storage,

      onFinish: (results) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          security: 'CSRF Protected',
          files: results.files.map(f => ({
            filename: f.filename,
            size: f.size,
            path: f.path
          }))
        }));
      },

      onError: (error) => {
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

  // ========================================
  // Upload with Signed URL
  // ========================================
  if (req.url.startsWith('/upload-signed') && req.method === 'POST') {
    const signedUrlValidator = signedUrls.createValidator();

    const uploader = new FluxUpload({
      request: req,
      validators: [
        signedUrlValidator,
        new QuotaLimiter({ maxFileSize: 50 * 1024 * 1024 })
      ],
      storage,

      onFinish: (results) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          security: 'Signed URL',
          files: results.files.map(f => ({
            filename: f.filename,
            size: f.size,
            path: f.path
          }))
        }));
      },

      onError: (error) => {
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

  // ========================================
  // Security Stats
  // ========================================
  if (req.url === '/api/stats' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      csrf: csrfProtection.getStats(),
      rateLimit: rateLimiter.getStats(),
      signedUrls: signedUrls.getStats()
    }, null, 2));
    return;
  }

  // ========================================
  // Serve Demo HTML
  // ========================================
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>FluxUpload Security Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .header {
      background: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    h1 { color: #667eea; margin-bottom: 10px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
      gap: 20px;
    }
    .card {
      background: white;
      padding: 25px;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    }
    h2 {
      color: #333;
      font-size: 18px;
      margin-bottom: 15px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 10px;
    }
    .badge {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      background: #d4edda;
      color: #155724;
      margin: 5px;
    }
    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin: 5px;
      transition: all 0.3s;
    }
    button:hover { background: #764ba2; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    input[type="file"] {
      display: block;
      margin: 10px 0;
      padding: 10px;
      border: 2px solid #e9ecef;
      border-radius: 5px;
      width: 100%;
    }
    pre {
      background: #f8f9ff;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      font-size: 12px;
      margin: 10px 0;
    }
    .result {
      margin-top: 15px;
      padding: 15px;
      border-radius: 5px;
      display: none;
    }
    .result.success { background: #d4edda; color: #155724; }
    .result.error { background: #f8d7da; color: #721c24; }
    .feature-list {
      line-height: 1.8;
      color: #666;
      margin: 15px 0;
    }
    .feature-list li {
      margin: 5px 0;
    }
    code {
      background: #f8f9ff;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 FluxUpload Security Demo</h1>
      <p style="color: #666; margin-top: 10px;">
        Comprehensive security features for file uploads
      </p>
      <div style="margin-top: 15px;">
        <span class="badge">CSRF Protection</span>
        <span class="badge">Signed URLs</span>
        <span class="badge">Rate Limiting</span>
        <span class="badge">Zero Dependencies</span>
      </div>
    </div>

    <div class="grid">
      <!-- CSRF Protection -->
      <div class="card">
        <h2>🛡️ CSRF Protection</h2>
        <p style="color: #666; margin-bottom: 15px;">
          Prevents Cross-Site Request Forgery attacks using cryptographic tokens.
        </p>

        <ul class="feature-list">
          <li>✓ Stateful token validation</li>
          <li>✓ Configurable token lifetime</li>
          <li>✓ Automatic token rotation</li>
          <li>✓ Double-submit cookie support</li>
        </ul>

        <div style="margin-top: 20px;">
          <button onclick="getCsrfToken()">1. Get CSRF Token</button>
          <pre id="csrfToken" style="display: none;"></pre>

          <input type="file" id="csrfFile" multiple style="display: none;">
          <button id="csrfSelectBtn" onclick="document.getElementById('csrfFile').click()" disabled>
            2. Select Files
          </button>

          <button id="csrfUploadBtn" onclick="uploadWithCsrf()" disabled>
            3. Upload (Protected)
          </button>

          <div id="csrfResult" class="result"></div>
        </div>
      </div>

      <!-- Signed URLs -->
      <div class="card">
        <h2>🔐 Signed Upload URLs</h2>
        <p style="color: #666; margin-bottom: 15px;">
          Time-limited, cryptographically signed URLs for secure uploads.
        </p>

        <ul class="feature-list">
          <li>✓ HMAC-SHA256 signatures</li>
          <li>✓ Time-based expiration</li>
          <li>✓ Upload constraints (size, type, count)</li>
          <li>✓ Replay attack prevention</li>
        </ul>

        <div style="margin-top: 20px;">
          <button onclick="getSignedUrl()">1. Generate Signed URL</button>
          <pre id="signedUrl" style="display: none;"></pre>

          <input type="file" id="signedFile" multiple style="display: none;">
          <button id="signedSelectBtn" onclick="document.getElementById('signedFile').click()" disabled>
            2. Select Files
          </button>

          <button id="signedUploadBtn" onclick="uploadWithSignedUrl()" disabled>
            3. Upload (Signed)
          </button>

          <div id="signedResult" class="result"></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 20px;">
      <h2>📚 How It Works</h2>
      <div class="grid">
        <div>
          <h3 style="color: #667eea; margin: 15px 0 10px;">CSRF Protection Flow</h3>
          <ol style="line-height: 1.8; color: #666;">
            <li>Client requests CSRF token from server</li>
            <li>Server generates unique, time-limited token</li>
            <li>Client includes token in upload request header</li>
            <li>Server validates token before accepting upload</li>
            <li>Token is single-use and expires after 1 hour</li>
          </ol>
        </div>
        <div>
          <h3 style="color: #667eea; margin: 15px 0 10px;">Signed URL Flow</h3>
          <ol style="line-height: 1.8; color: #666;">
            <li>Server generates URL with HMAC signature</li>
            <li>URL includes constraints (size, type, expiry)</li>
            <li>Client uploads directly to signed URL</li>
            <li>Server validates signature and constraints</li>
            <li>URL expires after 5 minutes</li>
          </ol>
        </div>
      </div>
    </div>
  </div>

  <script>
    let csrfToken = null;
    let signedUrlData = null;

    // ========================================
    // CSRF Protection
    // ========================================

    async function getCsrfToken() {
      try {
        const response = await fetch('/api/csrf-token');
        const data = await response.json();

        csrfToken = data.token;
        document.getElementById('csrfToken').textContent =
          \`Token: \${csrfToken.substring(0, 32)}...\nExpires: \${new Date(data.expires).toLocaleString()}\`;
        document.getElementById('csrfToken').style.display = 'block';
        document.getElementById('csrfSelectBtn').disabled = false;

        console.log('[CSRF] Token received:', csrfToken);
      } catch (error) {
        console.error('[CSRF] Error:', error);
      }
    }

    document.getElementById('csrfFile').addEventListener('change', (e) => {
      document.getElementById('csrfUploadBtn').disabled = !e.target.files.length;
    });

    async function uploadWithCsrf() {
      const files = document.getElementById('csrfFile').files;
      if (!files.length || !csrfToken) return;

      const formData = new FormData();
      for (let file of files) {
        formData.append('files', file);
      }

      try {
        const response = await fetch('/upload-csrf', {
          method: 'POST',
          headers: {
            'X-CSRF-Token': csrfToken
          },
          body: formData
        });

        const result = await response.json();
        const resultDiv = document.getElementById('csrfResult');

        if (result.success) {
          resultDiv.className = 'result success';
          resultDiv.textContent = \`✅ Uploaded \${result.files.length} file(s) with CSRF protection!\`;
        } else {
          resultDiv.className = 'result error';
          resultDiv.textContent = \`❌ Error: \${result.error}\`;
        }
        resultDiv.style.display = 'block';
      } catch (error) {
        const resultDiv = document.getElementById('csrfResult');
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Upload failed: ' + error.message;
        resultDiv.style.display = 'block';
      }
    }

    // ========================================
    // Signed URLs
    // ========================================

    async function getSignedUrl() {
      try {
        const response = await fetch('/api/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expiresIn: 300,
            maxFileSize: 10 * 1024 * 1024,
            maxFiles: 5,
            allowedTypes: ['image/*', 'application/pdf'],
            userId: 'user_123',
            metadata: { session: 'demo' }
          })
        });

        signedUrlData = await response.json();

        document.getElementById('signedUrl').textContent =
          \`URL: \${signedUrlData.url.substring(0, 80)}...\nExpires in: \${signedUrlData.expiresIn} seconds\`;
        document.getElementById('signedUrl').style.display = 'block';
        document.getElementById('signedSelectBtn').disabled = false;

        console.log('[Signed URL] Received:', signedUrlData.url);
      } catch (error) {
        console.error('[Signed URL] Error:', error);
      }
    }

    document.getElementById('signedFile').addEventListener('change', (e) => {
      document.getElementById('signedUploadBtn').disabled = !e.target.files.length;
    });

    async function uploadWithSignedUrl() {
      const files = document.getElementById('signedFile').files;
      if (!files.length || !signedUrlData) return;

      const formData = new FormData();
      for (let file of files) {
        formData.append('files', file);
      }

      try {
        const response = await fetch(signedUrlData.url, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        const resultDiv = document.getElementById('signedResult');

        if (result.success) {
          resultDiv.className = 'result success';
          resultDiv.textContent = \`✅ Uploaded \${result.files.length} file(s) with signed URL!\`;
        } else {
          resultDiv.className = 'result error';
          resultDiv.textContent = \`❌ Error: \${result.error}\`;
        }
        resultDiv.style.display = 'block';
      } catch (error) {
        const resultDiv = document.getElementById('signedResult');
        resultDiv.className = 'result error';
        resultDiv.textContent = '❌ Upload failed: ' + error.message;
        resultDiv.style.display = 'block';
      }
    }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🔒 FluxUpload Security Demo running on http://localhost:${PORT}\n`);
  console.log('Security Features:');
  console.log('  ✓ CSRF Protection with token validation');
  console.log('  ✓ Signed Upload URLs with HMAC-SHA256');
  console.log('  ✓ Rate Limiting (10 uploads/minute)');
  console.log('  ✓ Replay attack prevention');
  console.log('  ✓ Time-based expiration\n');
});
