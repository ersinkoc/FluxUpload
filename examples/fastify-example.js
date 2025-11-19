/**
 * Fastify Integration Example
 *
 * Shows how to use FluxUpload with Fastify
 */

// Note: Fastify is not included - install separately if needed
// npm install fastify

const fastify = require('fastify')({ logger: true });
const FluxUpload = require('../src');
const {
  LocalStorage,
  QuotaLimiter,
  MagicByteDetector,
  StreamHasher
} = require('../src');

// Configure uploader
const uploader = new FluxUpload({
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
    files: 5
  },

  validators: [
    new QuotaLimiter({ maxFileSize: 20 * 1024 * 1024 }),
    new MagicByteDetector({ allowed: ['image/*'] })
  ],

  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],

  storage: new LocalStorage({
    destination: './uploads',
    naming: {
      strategy: 'timestamp',
      prefix: 'img-'
    }
  }),

  onFile: (file) => {
    fastify.log.info(`File uploaded: ${file.filename}`);
  }
});

// Initialize uploader
uploader.initialize().then(() => {
  fastify.log.info('FluxUpload initialized');
});

// Home route with upload form
fastify.get('/', async (request, reply) => {
  reply.type('text/html').send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>FluxUpload + Fastify</title>
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
          }
          .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
          }
          .form-group {
            margin-bottom: 24px;
          }
          label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
            font-size: 14px;
          }
          input[type="file"] {
            width: 100%;
            padding: 12px;
            border: 2px dashed #ddd;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s;
          }
          input[type="file"]:hover {
            border-color: #667eea;
            background: #f8f9ff;
          }
          button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: transform 0.2s;
          }
          button:hover {
            transform: translateY(-2px);
          }
          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .result {
            margin-top: 24px;
            padding: 16px;
            border-radius: 8px;
            display: none;
          }
          .success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
          }
          .error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
          }
          pre {
            margin-top: 12px;
            padding: 12px;
            background: rgba(0,0,0,0.05);
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
          }
          .file-info {
            font-size: 12px;
            color: #666;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚡ FluxUpload + Fastify</h1>
          <p class="subtitle">High-performance file uploads with zero dependencies</p>

          <form id="uploadForm" enctype="multipart/form-data">
            <div class="form-group">
              <label>Select Images:</label>
              <input type="file" name="photos" multiple accept="image/*" id="fileInput" />
              <div class="file-info" id="fileInfo"></div>
            </div>

            <button type="submit" id="submitBtn">
              Upload Files
            </button>
          </form>

          <div id="result" class="result"></div>
        </div>

        <script>
          const fileInput = document.getElementById('fileInput');
          const fileInfo = document.getElementById('fileInfo');
          const submitBtn = document.getElementById('submitBtn');
          const resultDiv = document.getElementById('result');

          fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
              const totalSize = files.reduce((sum, f) => sum + f.size, 0);
              fileInfo.textContent = \`\${files.length} file(s) selected • \${(totalSize / 1024 / 1024).toFixed(2)} MB total\`;
            } else {
              fileInfo.textContent = '';
            }
          });

          document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            submitBtn.disabled = true;
            submitBtn.textContent = 'Uploading...';

            resultDiv.style.display = 'none';

            try {
              const formData = new FormData(e.target);
              const response = await fetch('/upload', {
                method: 'POST',
                body: formData
              });

              const result = await response.json();

              if (response.ok) {
                resultDiv.className = 'result success';
                resultDiv.innerHTML =
                  '<strong>✓ Success!</strong>' +
                  '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
              } else {
                throw new Error(result.error);
              }

              resultDiv.style.display = 'block';
              e.target.reset();
              fileInfo.textContent = '';

            } catch (error) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '<strong>✗ Error:</strong> ' + error.message;
              resultDiv.style.display = 'block';
            } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Upload Files';
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Upload endpoint
fastify.post('/upload', async (request, reply) => {
  try {
    // FluxUpload works directly with the Node.js request object
    const result = await uploader.handle(request.raw);

    return {
      success: true,
      message: 'Files uploaded successfully',
      files: result.files.map(file => ({
        filename: file.filename,
        originalName: file.filename,
        mimeType: file.mimeType,
        detectedMimeType: file.detectedMimeType,
        size: file.size || 'unknown',
        hash: file.hash,
        path: file.path
      })),
      fields: result.fields
    };

  } catch (error) {
    request.log.error({ error }, 'Upload failed');

    reply.status(400);
    return {
      success: false,
      error: error.message
    };
  }
});

// Health check
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
});

// List uploaded files
fastify.get('/api/files', async (request, reply) => {
  const fs = require('fs').promises;
  const path = require('path');

  try {
    const uploadDir = './uploads';
    const files = await fs.readdir(uploadDir);

    const fileList = await Promise.all(
      files.map(async (filename) => {
        const stats = await fs.stat(path.join(uploadDir, filename));
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );

    return { files: fileList };
  } catch (error) {
    return { files: [] };
  }
});

// Serve static files
fastify.register(require('@fastify/static'), {
  root: require('path').join(__dirname, '../uploads'),
  prefix: '/uploads/'
}).catch(() => {
  // @fastify/static not installed - serving files not available
  fastify.log.warn('@fastify/static not installed - file serving disabled');
});

// Start server
const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3000,
      host: '0.0.0.0'
    });

    console.log('\n⚡ Fastify + FluxUpload server started');
    console.log(`   URL: http://localhost:${process.env.PORT || 3000}`);
    console.log('   Framework: Fastify (high-performance)');
    console.log('   Upload: FluxUpload (zero-dependency)\n');

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const closeGracefully = async (signal) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);

  await uploader.shutdown();
  await fastify.close();

  process.exit(0);
};

process.on('SIGTERM', closeGracefully);
process.on('SIGINT', closeGracefully);

// Start
start();
