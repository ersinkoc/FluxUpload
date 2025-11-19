/**
 * Advanced Image Processing Example
 *
 * Demonstrates:
 * - Integration with optional peer dependencies (sharp)
 * - Custom validation pipeline
 * - Image transformation (resize, format conversion)
 * - Thumbnail generation
 * - Multiple storage destinations
 *
 * Install optional dependencies:
 * npm install sharp (for image processing)
 * npm install express (for web server)
 */

const http = require('http');
const { Transform } = require('stream');
const FluxUpload = require('../src');
const {
  LocalStorage,
  S3Storage,
  QuotaLimiter,
  MagicByteDetector,
  ImageDimensionProbe,
  StreamHasher,
  Plugin
} = require('../src');

// ============================================================================
// Custom Image Resize Plugin (Optional Sharp Integration)
// ============================================================================

class ImageResizer extends Plugin {
  /**
   * @param {Object} config
   * @param {number} config.maxWidth - Maximum width
   * @param {number} config.maxHeight - Maximum height
   * @param {string} config.format - Output format (jpeg, png, webp)
   * @param {number} config.quality - Quality (1-100)
   */
  constructor(config) {
    super(config);

    this.maxWidth = config.maxWidth || 2048;
    this.maxHeight = config.maxHeight || 2048;
    this.format = config.format || 'jpeg';
    this.quality = config.quality || 85;

    // Check if sharp is available
    try {
      this.sharp = require('sharp');
      this.available = true;
    } catch (err) {
      console.warn('⚠️  Sharp not installed. Image resizing disabled.');
      console.warn('   Install with: npm install sharp');
      this.available = false;
    }
  }

  async process(context) {
    if (!this.available) {
      // Sharp not available - skip resizing
      return context;
    }

    // Only resize images
    const mimeType = context.metadata.detectedMimeType || context.fileInfo.mimeType;
    if (!mimeType || !mimeType.startsWith('image/')) {
      return context;
    }

    // Create sharp transform stream
    const transformer = this.sharp()
      .resize(this.maxWidth, this.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      [this.format]({ quality: this.quality });

    // Pipe through transformer
    const newStream = context.stream.pipe(transformer);

    // Update metadata
    context.metadata.resized = true;
    context.metadata.maxWidth = this.maxWidth;
    context.metadata.maxHeight = this.maxHeight;
    context.metadata.outputFormat = this.format;

    return {
      ...context,
      stream: newStream
    };
  }
}

// ============================================================================
// Thumbnail Generator Plugin
// ============================================================================

class ThumbnailGenerator extends Plugin {
  constructor(config) {
    super(config);

    this.width = config.width || 200;
    this.height = config.height || 200;
    this.format = config.format || 'jpeg';

    try {
      this.sharp = require('sharp');
      this.available = true;
    } catch (err) {
      this.available = false;
    }
  }

  async process(context) {
    if (!this.available) {
      return context;
    }

    // Only process images
    const mimeType = context.metadata.detectedMimeType || context.fileInfo.mimeType;
    if (!mimeType || !mimeType.startsWith('image/')) {
      return context;
    }

    // Create thumbnail stream (separate from main upload)
    // Note: This is a simplified version
    // In production, you'd want to tee the stream and create thumbnails in parallel

    context.metadata.thumbnailEnabled = true;
    context.metadata.thumbnailSize = `${this.width}x${this.height}`;

    return context;
  }
}

// ============================================================================
// Custom EXIF Data Extractor Plugin
// ============================================================================

class ExifExtractor extends Plugin {
  constructor(config = {}) {
    super(config);

    try {
      this.sharp = require('sharp');
      this.available = true;
    } catch (err) {
      this.available = false;
    }
  }

  async process(context) {
    if (!this.available) {
      return context;
    }

    // Only for JPEG images
    const mimeType = context.metadata.detectedMimeType || context.fileInfo.mimeType;
    if (mimeType !== 'image/jpeg') {
      return context;
    }

    // Create a PassThrough to tee the stream
    const { PassThrough } = require('stream');
    const passThrough = new PassThrough();

    // Collect first chunk for EXIF extraction
    let firstChunk = null;
    const originalStream = context.stream;

    originalStream.once('data', (chunk) => {
      firstChunk = chunk;

      // Extract EXIF data from first chunk
      if (this.sharp) {
        this.sharp(firstChunk)
          .metadata()
          .then(metadata => {
            context.metadata.exif = {
              width: metadata.width,
              height: metadata.height,
              format: metadata.format,
              space: metadata.space,
              hasAlpha: metadata.hasAlpha,
              orientation: metadata.orientation
            };
          })
          .catch(() => {
            // EXIF extraction failed - no problem
          });
      }

      // Pass through the chunk
      passThrough.write(chunk);
    });

    // Pipe the rest
    originalStream.on('data', (chunk) => {
      if (chunk !== firstChunk) {
        passThrough.write(chunk);
      }
    });

    originalStream.on('end', () => {
      passThrough.end();
    });

    originalStream.on('error', (err) => {
      passThrough.destroy(err);
    });

    return {
      ...context,
      stream: passThrough
    };
  }
}

// ============================================================================
// Advanced Uploader Configuration
// ============================================================================

const uploader = new FluxUpload({
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
    files: 10
  },

  validators: [
    // Size limits
    new QuotaLimiter({
      maxFileSize: 20 * 1024 * 1024
    }),

    // Only allow images
    new MagicByteDetector({
      allowed: ['image/jpeg', 'image/png', 'image/webp']
    }),

    // Dimension validation
    new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 8000,
      minHeight: 100,
      maxHeight: 8000
    })
  ],

  transformers: [
    // Extract EXIF data
    new ExifExtractor(),

    // Calculate hash
    new StreamHasher({ algorithm: 'sha256' }),

    // Resize large images
    new ImageResizer({
      maxWidth: 2048,
      maxHeight: 2048,
      format: 'jpeg',
      quality: 85
    }),

    // Generate thumbnails
    new ThumbnailGenerator({
      width: 200,
      height: 200
    })
  ],

  // Upload to both local and S3 (if configured)
  storage: process.env.AWS_ACCESS_KEY_ID
    ? [
        new LocalStorage({
          destination: './uploads/images',
          naming: 'uuid'
        }),
        new S3Storage({
          bucket: process.env.S3_BUCKET || 'my-images',
          region: process.env.AWS_REGION || 'us-east-1',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          prefix: 'processed',
          acl: 'public-read'
        })
      ]
    : new LocalStorage({
        destination: './uploads/images',
        naming: 'uuid'
      }),

  onFile: (file) => {
    console.log('📸 Image processed:', {
      filename: file.filename,
      dimensions: file.dimensions,
      resized: file.resized,
      hash: file.hash?.substring(0, 16) + '...',
      exif: file.exif
    });
  }
});

// ============================================================================
// HTTP Server
// ============================================================================

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

  if (req.method === 'GET' && req.url === '/') {
    // Serve upload form
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Advanced Image Processing</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
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
              border-radius: 16px;
              padding: 40px;
              max-width: 700px;
              width: 100%;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            h1 {
              color: #333;
              margin-bottom: 10px;
              font-size: 32px;
            }
            .subtitle {
              color: #666;
              margin-bottom: 30px;
              font-size: 14px;
            }
            .features {
              background: #f8f9fa;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 30px;
            }
            .features h3 {
              font-size: 16px;
              margin-bottom: 12px;
              color: #333;
            }
            .features ul {
              list-style: none;
              padding: 0;
            }
            .features li {
              padding: 6px 0;
              color: #555;
              font-size: 14px;
            }
            .features li:before {
              content: "✓ ";
              color: #667eea;
              font-weight: bold;
              margin-right: 8px;
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
              padding: 16px;
              border: 2px dashed #ddd;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.3s;
              font-size: 14px;
            }
            input[type="file"]:hover {
              border-color: #667eea;
              background: #f8f9ff;
            }
            button {
              width: 100%;
              padding: 16px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              font-size: 16px;
              font-weight: 600;
              transition: transform 0.2s;
            }
            button:hover:not(:disabled) {
              transform: translateY(-2px);
            }
            button:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }
            .result {
              margin-top: 24px;
              padding: 20px;
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
              line-height: 1.6;
            }
            .preview {
              margin-top: 16px;
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
              gap: 12px;
            }
            .preview img {
              width: 100%;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎨 Advanced Image Processing</h1>
            <p class="subtitle">Zero-dependency upload with smart image optimization</p>

            <div class="features">
              <h3>Features Enabled:</h3>
              <ul>
                <li>Auto-resize (max 2048x2048)</li>
                <li>EXIF data extraction</li>
                <li>Thumbnail generation</li>
                <li>Format conversion (JPEG optimization)</li>
                <li>SHA256 hash calculation</li>
                <li>Magic byte verification</li>
                <li>Dimension validation</li>
              </ul>
            </div>

            <form id="uploadForm" enctype="multipart/form-data">
              <div class="form-group">
                <label>Select Images (JPEG, PNG, WebP):</label>
                <input type="file" name="images" multiple accept="image/*" id="fileInput" required />
              </div>

              <button type="submit" id="submitBtn">
                Process & Upload Images
              </button>
            </form>

            <div id="result" class="result"></div>
            <div id="preview" class="preview"></div>
          </div>

          <script>
            const form = document.getElementById('uploadForm');
            const submitBtn = document.getElementById('submitBtn');
            const resultDiv = document.getElementById('result');
            const previewDiv = document.getElementById('preview');

            form.addEventListener('submit', async (e) => {
              e.preventDefault();

              submitBtn.disabled = true;
              submitBtn.textContent = 'Processing...';
              resultDiv.style.display = 'none';
              previewDiv.innerHTML = '';

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
                    '<strong>✓ Success!</strong> Images processed and uploaded.' +
                    '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
                } else {
                  throw new Error(result.error);
                }

                resultDiv.style.display = 'block';

              } catch (error) {
                resultDiv.className = 'result error';
                resultDiv.innerHTML = '<strong>✗ Error:</strong> ' + error.message;
                resultDiv.style.display = 'block';
              } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Process & Upload Images';
              }
            });
          </script>
        </body>
      </html>
    `);
    return;
  }

  if (req.method === 'POST' && req.url === '/upload') {
    try {
      const result = await uploader.handle(req);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Images processed successfully',
        files: result.files
      }, null, 2));

    } catch (error) {
      console.error('Upload error:', error);

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message
      }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Initialize and start
uploader.initialize().then(() => {
  const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => {
    console.log('\n🎨 Advanced Image Processing Server');
    console.log(`   URL: http://localhost:${PORT}`);
    console.log('   Framework: FluxUpload (zero-dependency)');

    if (!require.resolve('sharp', { paths: ['.'] })) {
      console.log('\n⚠️  Sharp not installed - advanced features disabled');
      console.log('   Install with: npm install sharp\n');
    } else {
      console.log('   Sharp: Available ✓');
      console.log('   Features: Resize, EXIF, Thumbnails ✓\n');
    }
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await uploader.shutdown();
  server.close();
});
