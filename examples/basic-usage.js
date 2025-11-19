/**
 * Basic Usage Example
 *
 * This example shows the simplest way to use FluxUpload
 * with a vanilla Node.js HTTP server and local storage.
 */

const http = require('http');
const FluxUpload = require('../src');
const { LocalStorage, QuotaLimiter, MagicByteDetector, StreamHasher } = require('../src');

// Configure uploader
const uploader = new FluxUpload({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5,
    fields: 20
  },

  validators: [
    // Enforce size limits
    new QuotaLimiter({
      maxFileSize: 10 * 1024 * 1024
    }),

    // Verify file types (only images)
    new MagicByteDetector({
      allowed: ['image/jpeg', 'image/png', 'image/gif']
    })
  ],

  transformers: [
    // Calculate SHA256 hash during upload
    new StreamHasher({
      algorithm: 'sha256'
    })
  ],

  storage: new LocalStorage({
    destination: './uploads',
    naming: 'uuid' // Use UUID for filenames
  }),

  // Callbacks
  onField: (name, value) => {
    console.log(`Field: ${name} = ${value}`);
  },

  onFile: (file) => {
    console.log('File uploaded:', file);
  }
});

// Initialize plugins
uploader.initialize().then(() => {
  console.log('FluxUpload initialized');
});

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/upload') {
    try {
      // Handle upload
      const result = await uploader.handle(req);

      // Send response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        fields: result.fields,
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
  } else if (req.method === 'GET' && req.url === '/') {
    // Serve upload form
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>FluxUpload Demo</title>
        </head>
        <body>
          <h1>FluxUpload - Zero Dependency Upload</h1>
          <form action="/upload" method="POST" enctype="multipart/form-data">
            <div>
              <label>Name:</label>
              <input type="text" name="username" />
            </div>
            <div>
              <label>Files:</label>
              <input type="file" name="photos" multiple accept="image/*" />
            </div>
            <button type="submit">Upload</button>
          </form>
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
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Open in browser to test file upload');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await uploader.shutdown();
  server.close();
});
