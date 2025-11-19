# FluxUpload Recipes & Common Patterns

Practical patterns and recipes for common upload scenarios.

## Table of Contents

- [Basic Patterns](#basic-patterns)
- [File Type Handling](#file-type-handling)
- [Storage Patterns](#storage-patterns)
- [Security Patterns](#security-patterns)
- [Performance Optimization](#performance-optimization)
- [Integration Patterns](#integration-patterns)
- [Error Handling](#error-handling)
- [Advanced Patterns](#advanced-patterns)

## Basic Patterns

### Simple File Upload

```javascript
const { FluxUpload, LocalStorage } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({ destination: './uploads' }),

  onFinish: (results) => {
    res.json({ files: results.files });
  },

  onError: (error) => {
    res.status(500).json({ error: error.message });
  }
});
```

### Upload with File Size Limit

```javascript
const { QuotaLimiter } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({
      maxFileSize: 10 * 1024 * 1024  // 10MB
    })
  ],
  storage: new LocalStorage({ destination: './uploads' })
});
```

### Upload with Progress Tracking

```javascript
const { ProgressTracker } = require('fluxupload');

const tracker = new ProgressTracker();

tracker.on('progress', (progress) => {
  console.log(`${progress.filename}: ${progress.percentage}%`);
  // Send to client via WebSocket, SSE, or polling
});

const uploader = new FluxUpload({
  request: req,
  storage,

  onFile: (file) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    const progressStream = tracker.createProgressStream({
      fileId: file.filename,
      filename: file.filename,
      totalBytes: contentLength
    });
    file.stream = file.stream.pipe(progressStream);
  }
});
```

## File Type Handling

### Image Uploads Only

```javascript
const { MagicByteDetector } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new MagicByteDetector({
      allowed: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    })
  ],
  storage
});
```

### Image with Dimension Constraints

```javascript
const { MagicByteDetector, ImageDimensionProbe } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new MagicByteDetector({ allowed: ['image/*'] }),
    new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 4096,
      minHeight: 100,
      maxHeight: 4096
    })
  ],
  storage
});
```

### Profile Picture Upload

```javascript
const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({ maxFileSize: 5 * 1024 * 1024 }), // 5MB
    new MagicByteDetector({ allowed: ['image/jpeg', 'image/png'] }),
    new ImageDimensionProbe({
      minWidth: 200,
      minHeight: 200,
      maxWidth: 2000,
      maxHeight: 2000
    })
  ],
  storage: new LocalStorage({
    destination: './uploads/avatars',
    namingStrategy: 'uuid'
  }),

  onFinish: (results) => {
    const file = results.files[0];
    // Update user profile with file.path
    db.updateUser(userId, { avatar: file.path });
    res.json({ avatarUrl: `/uploads/avatars/${file.filename}` });
  }
});
```

### Document Upload (PDF, DOCX)

```javascript
const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({ maxFileSize: 50 * 1024 * 1024 }), // 50MB
    new MagicByteDetector({
      allowed: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword'
      ]
    })
  ],
  transformers: [
    new StreamHasher({ algorithm: 'sha256' }) // Verify integrity
  ],
  storage: new LocalStorage({
    destination: './uploads/documents',
    namingStrategy: 'hash'
  })
});
```

## Storage Patterns

### Upload to S3

```javascript
const { S3Storage } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  storage: new S3Storage({
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    prefix: 'uploads',
    acl: 'private'
  })
});
```

### Upload to Multiple Destinations

```javascript
const uploader = new FluxUpload({
  request: req,
  storage: [
    new LocalStorage({ destination: './uploads/backup' }),
    new S3Storage({
      bucket: 'my-bucket',
      region: 'us-east-1',
      // ... credentials
    })
  ],

  onFinish: (results) => {
    // Files uploaded to both local and S3
    console.log('Local path:', results.files[0].localStorage.path);
    console.log('S3 URL:', results.files[0].s3Storage.url);
  }
});
```

### Upload with Compression

```javascript
const { StreamCompressor } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  transformers: [
    new StreamCompressor({
      algorithm: 'gzip',
      level: 6
    })
  ],
  storage: new LocalStorage({
    destination: './uploads'
  }),

  onFinish: (results) => {
    const file = results.files[0];
    console.log('Original size:', file.metadata.originalSize);
    console.log('Compressed size:', file.size);
    console.log('Compression ratio:',
      ((1 - file.size / file.metadata.originalSize) * 100).toFixed(1) + '%'
    );
  }
});
```

### Temporary Upload Directory

```javascript
const path = require('path');
const os = require('os');

const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({
    destination: path.join(os.tmpdir(), 'uploads'),
    namingStrategy: 'uuid'
  }),

  onFinish: async (results) => {
    // Process files
    for (const file of results.files) {
      await processFile(file.path);
      // Delete temp file
      await fs.promises.unlink(file.path);
    }
  }
});
```

## Security Patterns

### CSRF Protection

```javascript
const { CsrfProtection } = require('fluxupload');

const csrf = new CsrfProtection({
  tokenLifetime: 3600000 // 1 hour
});

// Route to get CSRF token
app.get('/api/csrf-token', (req, res) => {
  const token = csrf.generateToken({
    sessionId: req.session.id
  });
  res.json({ token });
});

// Protected upload endpoint
app.post('/upload', (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    validators: [csrf],
    storage
  });
});
```

### Signed Upload URLs

```javascript
const { SignedUrls } = require('fluxupload');

const signer = new SignedUrls({
  secret: process.env.UPLOAD_SECRET
});

// Generate signed URL
app.post('/api/generate-upload-url', (req, res) => {
  const url = signer.sign('https://api.example.com/upload', {
    expiresIn: 300, // 5 minutes
    maxFileSize: 10 * 1024 * 1024,
    allowedTypes: ['image/*'],
    userId: req.user.id
  });

  res.json({ uploadUrl: url });
});

// Validate and process upload
app.post('/upload', (req, res) => {
  const validator = signer.createValidator();

  const uploader = new FluxUpload({
    request: req,
    validators: [validator],
    storage
  });
});
```

### Rate Limiting

```javascript
const { RateLimiter } = require('fluxupload');

const rateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60000, // 10 uploads per minute
  keyGenerator: (context) => {
    // Rate limit by user ID instead of IP
    return context.request.user?.id || 'anonymous';
  }
});

const uploader = new FluxUpload({
  request: req,
  validators: [rateLimiter],
  storage
});
```

### Authenticated Uploads

```javascript
// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/upload', requireAuth, (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({
      destination: `./uploads/${req.user.id}`,
      namingStrategy: 'uuid'
    }),

    onFinish: async (results) => {
      // Save file metadata to database
      for (const file of results.files) {
        await db.files.create({
          userId: req.user.id,
          filename: file.filename,
          path: file.path,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date()
        });
      }

      res.json({ files: results.files });
    }
  });
});
```

## Performance Optimization

### Streaming to S3 with Hash Verification

```javascript
const { StreamHasher } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  transformers: [
    new StreamHasher({ algorithm: 'md5' })
  ],
  storage: new S3Storage({
    bucket: 'my-bucket',
    region: 'us-east-1',
    // ... credentials
  }),

  onFinish: (results) => {
    const file = results.files[0];
    // Verify S3 ETag matches our hash
    console.log('Local MD5:', file.hash);
    console.log('S3 ETag:', file.etag);
  }
});
```

### Parallel Processing

```javascript
const { Worker } = require('worker_threads');

const uploader = new FluxUpload({
  request: req,
  storage,

  onFinish: async (results) => {
    // Process files in parallel using worker threads
    const workers = results.files.map(file => {
      return new Promise((resolve, reject) => {
        const worker = new Worker('./process-file.js', {
          workerData: { filePath: file.path }
        });

        worker.on('message', resolve);
        worker.on('error', reject);
      });
    });

    const processed = await Promise.all(workers);
    res.json({ results: processed });
  }
});
```

### Lazy Loading Large Files

```javascript
const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({
    destination: './uploads'
  }),

  onFile: (file) => {
    // Don't read entire file, just store metadata
    console.log('Receiving:', file.filename);
  },

  onFinish: (results) => {
    // Process files on-demand later
    const fileIds = results.files.map(f => ({
      id: generateId(),
      path: f.path,
      size: f.size
    }));

    res.json({ fileIds });
  }
});
```

## Integration Patterns

### Express.js Middleware

```javascript
// middleware/upload.js
const { FluxUpload, LocalStorage, QuotaLimiter } = require('fluxupload');

function createUploadMiddleware(options = {}) {
  return (req, res, next) => {
    const uploader = new FluxUpload({
      request: req,
      validators: [
        new QuotaLimiter(options.limits || {})
      ],
      storage: options.storage || new LocalStorage({ destination: './uploads' }),

      onFinish: (results) => {
        req.uploadedFiles = results.files;
        req.uploadedFields = results.fields;
        next();
      },

      onError: (error) => {
        next(error);
      }
    });
  };
}

// Usage
app.post('/upload', createUploadMiddleware({
  limits: { maxFileSize: 10 * 1024 * 1024 }
}), (req, res) => {
  res.json({ files: req.uploadedFiles });
});
```

### Next.js API Route

```javascript
// pages/api/upload.js
import { FluxUpload, LocalStorage } from 'fluxupload';

export const config = {
  api: {
    bodyParser: false, // Disable built-in parser
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({
      destination: './public/uploads'
    }),

    onFinish: (results) => {
      const files = results.files.map(f => ({
        filename: f.filename,
        url: `/uploads/${f.filename}`,
        size: f.size
      }));

      res.status(200).json({ files });
    },

    onError: (error) => {
      res.status(500).json({ error: error.message });
    }
  });
}
```

### GraphQL Upload

```javascript
const { GraphQLUpload } = require('graphql-upload');

const resolvers = {
  Upload: GraphQLUpload,

  Mutation: {
    singleUpload: async (parent, { file }) => {
      const { createReadStream, filename, mimetype } = await file;

      // Convert GraphQL upload to FluxUpload
      const stream = createReadStream();

      return new Promise((resolve, reject) => {
        const uploader = new FluxUpload({
          request: {
            // Mock request with stream
            headers: { 'content-type': 'multipart/form-data' },
            pipe: (dest) => stream.pipe(dest)
          },
          storage: new LocalStorage({ destination: './uploads' }),

          onFinish: (results) => {
            resolve({
              filename: results.files[0].filename,
              path: results.files[0].path
            });
          },

          onError: reject
        });
      });
    }
  }
};
```

### Webhook Handler

```javascript
// Handle webhooks with file uploads
app.post('/webhook/:service', async (req, res) => {
  const service = req.params.service;

  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({
      destination: `./webhooks/${service}`
    }),

    onFinish: async (results) => {
      // Process webhook files
      await processWebhook(service, {
        files: results.files,
        fields: results.fields
      });

      res.status(200).json({ received: true });
    },

    onError: (error) => {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
});
```

## Error Handling

### Graceful Error Recovery

```javascript
const uploader = new FluxUpload({
  request: req,
  storage,

  onError: (error) => {
    if (error.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({
        error: 'File too large',
        maxSize: '10MB'
      });
    }

    if (error.code === 'INVALID_FILE_TYPE') {
      return res.status(415).json({
        error: 'Invalid file type',
        allowed: ['image/jpeg', 'image/png']
      });
    }

    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      return res.status(429).json({
        error: 'Too many uploads',
        retryAfter: error.retryAfter
      });
    }

    // Generic error
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});
```

### Retry Logic

```javascript
async function uploadWithRetry(req, res, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const uploader = new FluxUpload({
          request: req,
          storage: new S3Storage({ /* config */ }),
          onFinish: resolve,
          onError: reject
        });
      });

      return res.json({ success: true });
    } catch (error) {
      if (attempt === maxRetries) {
        return res.status(500).json({
          error: 'Upload failed after retries',
          attempts: maxRetries
        });
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

### Validation Errors

```javascript
const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 }),
    new MagicByteDetector({ allowed: ['image/*'] }),
    new ImageDimensionProbe({ maxWidth: 4096, maxHeight: 4096 })
  ],
  storage,

  onError: (error) => {
    const validationErrors = {
      'QUOTA_EXCEEDED': 'File exceeds maximum size of 10MB',
      'MAGIC_BYTE_MISMATCH': 'Only images are allowed',
      'DIMENSION_EXCEEDED': 'Image dimensions exceed 4096x4096'
    };

    const userMessage = validationErrors[error.code] || error.message;

    res.status(400).json({
      error: userMessage,
      code: error.code,
      details: error.details
    });
  }
});
```

## Advanced Patterns

### Custom Plugin

```javascript
const { Plugin } = require('fluxupload');

class VirusScanPlugin extends Plugin {
  constructor(options = {}) {
    super('VirusScan');
    this.scanCommand = options.scanCommand || 'clamscan';
  }

  async process(context) {
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      // Create temp file for scanning
      const tempPath = `/tmp/${Date.now()}`;
      const writeStream = fs.createWriteStream(tempPath);

      context.stream.pipe(writeStream);

      writeStream.on('finish', () => {
        // Scan file
        const scanner = spawn(this.scanCommand, [tempPath]);

        scanner.on('close', (code) => {
          fs.unlinkSync(tempPath);

          if (code !== 0) {
            const error = new Error('Virus detected');
            error.code = 'VIRUS_DETECTED';
            return reject(error);
          }

          // Re-read file for next plugin
          context.stream = fs.createReadStream(tempPath);
          resolve(context);
        });
      });
    });
  }
}

// Usage
const uploader = new FluxUpload({
  request: req,
  validators: [new VirusScanPlugin()],
  storage
});
```

### Watermarking Images

```javascript
const sharp = require('sharp'); // Optional dependency

class WatermarkPlugin extends Plugin {
  constructor(options) {
    super('Watermark');
    this.watermarkPath = options.watermarkPath;
  }

  async process(context) {
    if (!context.fileInfo.mimeType.startsWith('image/')) {
      return context; // Skip non-images
    }

    const chunks = [];
    context.stream.on('data', chunk => chunks.push(chunk));

    return new Promise((resolve, reject) => {
      context.stream.on('end', async () => {
        const buffer = Buffer.concat(chunks);

        try {
          const watermarked = await sharp(buffer)
            .composite([{
              input: this.watermarkPath,
              gravity: 'southeast'
            }])
            .toBuffer();

          const { Readable } = require('stream');
          context.stream = Readable.from(watermarked);
          context.metadata.watermarked = true;

          resolve(context);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
```

### File Deduplication

```javascript
const uploader = new FluxUpload({
  request: req,
  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],
  storage,

  onFinish: async (results) => {
    for (const file of results.files) {
      // Check if file with same hash exists
      const existing = await db.files.findOne({
        hash: file.hash
      });

      if (existing) {
        // Delete duplicate
        await fs.promises.unlink(file.path);

        // Return existing file info
        file.path = existing.path;
        file.deduplicated = true;
      } else {
        // Save new file
        await db.files.create({
          hash: file.hash,
          path: file.path,
          filename: file.filename
        });
      }
    }

    res.json({ files: results.files });
  }
});
```

### Chunked Upload (Resume Support)

```javascript
// Client sends chunks with metadata
app.post('/upload/chunk', async (req, res) => {
  const { chunkIndex, totalChunks, fileId } = req.query;

  const chunkPath = `./temp/${fileId}_chunk_${chunkIndex}`;

  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({
      destination: path.dirname(chunkPath),
      namingStrategy: () => path.basename(chunkPath)
    }),

    onFinish: async (results) => {
      if (parseInt(chunkIndex) === parseInt(totalChunks) - 1) {
        // Last chunk - reassemble file
        const finalPath = `./uploads/${fileId}`;
        const writeStream = fs.createWriteStream(finalPath);

        for (let i = 0; i < totalChunks; i++) {
          const chunk = fs.readFileSync(`./temp/${fileId}_chunk_${i}`);
          writeStream.write(chunk);
          fs.unlinkSync(`./temp/${fileId}_chunk_${i}`);
        }

        writeStream.end();
        res.json({ complete: true, path: finalPath });
      } else {
        res.json({ chunkReceived: chunkIndex });
      }
    }
  });
});
```

## Production Patterns

### Health Monitoring

```javascript
const { HealthCheck } = require('fluxupload');

const healthCheck = new HealthCheck();
healthCheck.registerStorageCheck('./uploads');

app.get('/health', async (req, res) => {
  const health = await healthCheck.check();
  const status = health.status === 'pass' ? 200 : 503;
  res.status(status).json(health);
});
```

### Metrics Collection

```javascript
const { getCollector } = require('fluxupload');

const metrics = getCollector();

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(metrics.toPrometheus());
});
```

### Structured Logging

```javascript
const { getLogger } = require('fluxupload');

const logger = getLogger({
  level: 'info',
  format: 'json'
});

const uploader = new FluxUpload({
  request: req,
  storage,

  onFile: (file) => {
    logger.info('File upload started', {
      filename: file.filename,
      size: file.size,
      userId: req.user.id
    });
  },

  onFinish: (results) => {
    logger.info('Upload completed', {
      fileCount: results.files.length,
      userId: req.user.id
    });
  },

  onError: (error) => {
    logger.error('Upload failed', {
      error,
      userId: req.user.id
    });
  }
});
```

These recipes cover the most common upload scenarios. Mix and match patterns to build the exact solution you need!
