/**
 * S3 Upload Example
 *
 * This example demonstrates:
 * - Uploading to S3 (or S3-compatible storage)
 * - Using all validators and transformers
 * - Multiple storage targets (local + S3 simultaneously)
 */

const http = require('http');
const FluxUpload = require('../src');
const {
  LocalStorage,
  S3Storage,
  QuotaLimiter,
  MagicByteDetector,
  ImageDimensionProbe,
  StreamHasher,
  StreamCompressor
} = require('../src');

// Configure uploader with S3
const uploader = new FluxUpload({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },

  validators: [
    // Size limit
    new QuotaLimiter({
      maxFileSize: 50 * 1024 * 1024,
      maxTotalSize: 200 * 1024 * 1024 // 200MB per request
    }),

    // File type verification
    new MagicByteDetector({
      allowed: ['image/*', 'application/pdf']
    }),

    // Image dimension validation
    new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 8000,
      minHeight: 100,
      maxHeight: 8000
    })
  ],

  transformers: [
    // Calculate hash
    new StreamHasher({
      algorithm: 'sha256'
    })

    // Optional: Compress text files
    // new StreamCompressor({
    //   algorithm: 'gzip',
    //   compressibleTypes: ['text/*', 'application/json']
    // })
  ],

  // Upload to S3
  storage: new S3Storage({
    bucket: process.env.S3_BUCKET || 'my-uploads',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    prefix: 'uploads', // Store in 'uploads/' folder
    naming: 'uuid',
    acl: 'private',
    storageClass: 'STANDARD'
  })

  // Alternative: Upload to both local AND S3 simultaneously
  // storage: [
  //   new LocalStorage({
  //     destination: './uploads',
  //     naming: 'uuid'
  //   }),
  //   new S3Storage({
  //     bucket: process.env.S3_BUCKET,
  //     region: process.env.AWS_REGION,
  //     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  //     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  //     prefix: 'uploads',
  //     naming: 'uuid'
  //   })
  // ]
});

// Initialize
uploader.initialize().then(() => {
  console.log('FluxUpload with S3 initialized');
});

// Create server
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/upload') {
    try {
      const result = await uploader.handle(req);

      // Response includes S3 URLs
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Files uploaded to S3',
        files: result.files.map(file => ({
          filename: file.filename,
          size: file.size,
          url: file.url,
          hash: file.hash,
          dimensions: file.dimensions,
          bucket: file.bucket,
          key: file.key,
          etag: file.etag
        }))
      }, null, 2));

    } catch (error) {
      console.error('Upload error:', error);

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
  } else if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>FluxUpload S3 Demo</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; }
            .form-group { margin: 20px 0; }
            label { display: block; margin-bottom: 5px; font-weight: bold; }
            input[type="file"] { padding: 10px; }
            button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
            button:hover { background: #0056b3; }
            .result { margin-top: 20px; padding: 10px; background: #f0f0f0; }
            pre { overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>FluxUpload - S3 Upload Demo</h1>
          <p>Zero dependencies • Stream-first • Plugin-based</p>

          <form id="uploadForm" enctype="multipart/form-data">
            <div class="form-group">
              <label>Select Images or PDFs:</label>
              <input type="file" name="files" multiple accept="image/*,.pdf" />
            </div>
            <button type="submit">Upload to S3</button>
          </form>

          <div id="result" class="result" style="display: none;">
            <h3>Upload Result:</h3>
            <pre id="resultContent"></pre>
          </div>

          <script>
            document.getElementById('uploadForm').addEventListener('submit', async (e) => {
              e.preventDefault();

              const formData = new FormData(e.target);
              const resultDiv = document.getElementById('result');
              const resultContent = document.getElementById('resultContent');

              try {
                const response = await fetch('/upload', {
                  method: 'POST',
                  body: formData
                });

                const result = await response.json();

                resultDiv.style.display = 'block';
                resultContent.textContent = JSON.stringify(result, null, 2);

                if (result.success) {
                  resultDiv.style.background = '#d4edda';
                } else {
                  resultDiv.style.background = '#f8d7da';
                }
              } catch (error) {
                resultDiv.style.display = 'block';
                resultDiv.style.background = '#f8d7da';
                resultContent.textContent = 'Error: ' + error.message;
              }
            });
          </script>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`S3 Upload Server running at http://localhost:${PORT}`);
  console.log('\nEnvironment variables needed:');
  console.log('  AWS_ACCESS_KEY_ID');
  console.log('  AWS_SECRET_ACCESS_KEY');
  console.log('  AWS_REGION');
  console.log('  S3_BUCKET');
});

process.on('SIGTERM', async () => {
  await uploader.shutdown();
  server.close();
});
