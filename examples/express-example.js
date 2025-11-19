/**
 * Express.js Integration Example
 *
 * Shows how to use FluxUpload with Express.js
 */

// Note: Express is not included - install separately if needed
// npm install express

const express = require('express');
const FluxUpload = require('../src');
const {
  LocalStorage,
  S3Storage,
  QuotaLimiter,
  MagicByteDetector,
  ImageDimensionProbe,
  StreamHasher
} = require('../src');

const app = express();

// Configure uploader
const uploader = new FluxUpload({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },

  validators: [
    new QuotaLimiter({
      maxFileSize: 50 * 1024 * 1024
    }),
    new MagicByteDetector({
      allowed: ['image/*', 'application/pdf']
    }),
    new ImageDimensionProbe({
      maxWidth: 4096,
      maxHeight: 4096
    })
  ],

  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],

  storage: new LocalStorage({
    destination: './uploads',
    naming: 'uuid'
  })
});

// Initialize uploader
uploader.initialize().then(() => {
  console.log('✓ FluxUpload initialized');
});

// Serve upload form
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>FluxUpload + Express</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
          }
          .form-group {
            margin: 20px 0;
          }
          label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
          }
          input[type="text"],
          input[type="email"] {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
          }
          input[type="file"] {
            padding: 10px 0;
          }
          button {
            padding: 12px 24px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
          }
          button:hover {
            background: #0056b3;
          }
          .result {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
            display: none;
          }
          .error {
            background: #f8d7da;
            color: #721c24;
          }
          .success {
            background: #d4edda;
            color: #155724;
          }
          pre {
            overflow-x: auto;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h1>FluxUpload + Express.js</h1>
        <p>Zero-dependency file upload example</p>

        <form id="uploadForm" enctype="multipart/form-data">
          <div class="form-group">
            <label>Your Name:</label>
            <input type="text" name="name" required />
          </div>

          <div class="form-group">
            <label>Email:</label>
            <input type="email" name="email" required />
          </div>

          <div class="form-group">
            <label>Upload Files (Images or PDFs):</label>
            <input type="file" name="files" multiple accept="image/*,.pdf" required />
          </div>

          <button type="submit">Upload Files</button>
        </form>

        <div id="result" class="result"></div>

        <script>
          document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const resultDiv = document.getElementById('result');
            resultDiv.textContent = 'Uploading...';
            resultDiv.className = 'result';
            resultDiv.style.display = 'block';

            try {
              const formData = new FormData(e.target);

              const response = await fetch('/upload', {
                method: 'POST',
                body: formData
              });

              const result = await response.json();

              if (response.ok) {
                resultDiv.className = 'result success';
                resultDiv.innerHTML = '<h3>✓ Upload Successful</h3><pre>' +
                  JSON.stringify(result, null, 2) + '</pre>';
              } else {
                throw new Error(result.error || 'Upload failed');
              }
            } catch (error) {
              resultDiv.className = 'result error';
              resultDiv.innerHTML = '<h3>✗ Upload Failed</h3><p>' + error.message + '</p>';
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Handle file upload
app.post('/upload', async (req, res) => {
  try {
    const result = await uploader.handle(req);

    res.json({
      success: true,
      message: `${result.files.length} file(s) uploaded successfully`,
      fields: result.fields,
      files: result.files.map(file => ({
        filename: file.filename,
        size: file.size || 'unknown',
        mimeType: file.mimeType,
        detectedMimeType: file.detectedMimeType,
        hash: file.hash,
        dimensions: file.dimensions,
        path: file.path
      }))
    });

  } catch (error) {
    console.error('Upload error:', error);

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// List uploaded files
app.get('/files', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  const uploadDir = './uploads';

  if (!fs.existsSync(uploadDir)) {
    return res.json({ files: [] });
  }

  const files = fs.readdirSync(uploadDir).map(filename => {
    const stats = fs.statSync(path.join(uploadDir, filename));
    return {
      filename,
      size: stats.size,
      created: stats.birthtime
    };
  });

  res.json({ files });
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Express + FluxUpload server running`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await uploader.shutdown();
  process.exit(0);
});
