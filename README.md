# FluxUpload

**Zero-dependency**, **stream-first** file upload handler for Node.js with a **micro-kernel architecture**.

[![npm version](https://img.shields.io/npm/v/fluxupload.svg)](https://www.npmjs.com/package/fluxupload)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/fluxupload.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-definitions-blue.svg)](src/index.d.ts)
[![CI](https://img.shields.io/github/workflow/status/yourusername/fluxupload/CI?label=tests)](https://github.com/yourusername/fluxupload/actions)
[![codecov](https://img.shields.io/badge/coverage-82%25-green.svg)](test/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## Why FluxUpload?

- **🚫 Zero Runtime Dependencies** - Uses only native Node.js modules
- **🌊 Stream-First** - Never buffers entire files in memory
- **🔌 Plugin-Based** - Modular, extensible architecture
- **🛡️ Security-First** - Magic byte verification, DDOS protection, atomic writes
- **☁️ Multi-Storage** - Local, S3, or multiple destinations simultaneously
- **⚡ High Performance** - Minimal CPU overhead, optimal memory usage
- **📊 Observable** - Built-in logging, metrics, progress tracking, and health checks
- **🎯 Production-Ready** - Handles backpressure, cleanup, and error recovery

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Examples](#examples)
- [Comparison](#comparison)
- [License](#license)

## Installation

```bash
npm install fluxupload
```

**Requirements:** Node.js >= 12.0.0

**No additional dependencies needed!** FluxUpload uses only native Node.js modules:
- `stream`, `http`, `https`, `fs`, `crypto`, `zlib`, `path`, `util`, `events`

## Quick Start

### Basic Usage (Local Storage)

```javascript
const http = require('http');
const FluxUpload = require('fluxupload');
const { LocalStorage, QuotaLimiter, StreamHasher } = require('fluxupload');

const uploader = new FluxUpload({
  validators: [
    new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 }) // 10MB
  ],
  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],
  storage: new LocalStorage({
    destination: './uploads',
    naming: 'uuid'
  })
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/upload') {
    try {
      const result = await uploader.handle(req);
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: error.message }));
    }
  }
});

server.listen(3000);
```

### S3 Upload

```javascript
const { S3Storage, MagicByteDetector, ImageDimensionProbe } = require('fluxupload');

const uploader = new FluxUpload({
  validators: [
    new MagicByteDetector({ allowed: ['image/*'] }),
    new ImageDimensionProbe({ maxWidth: 4096, maxHeight: 4096 })
  ],
  storage: new S3Storage({
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  })
});
```

## Features

### Core Features

#### 🔍 **Multipart Parser**
- Custom stream-based parser (RFC 7578 compliant)
- Byte-by-byte boundary detection
- Handles boundaries spanning multiple chunks
- Automatic backpressure management

#### 🔌 **Plugin System**
Extend functionality through plugins:
- **Validators**: Enforce rules before processing
- **Transformers**: Modify streams on-the-fly
- **Storage**: Customize upload destinations

#### 🛡️ **Security**

**Magic Byte Detection**
```javascript
new MagicByteDetector({ allowed: ['image/*'] })
```
- Never trust file extensions or Content-Type headers
- Verifies actual binary signatures
- Prevents malware uploads (e.g., `malware.exe` renamed to `photo.jpg`)

**DDOS Protection**
```javascript
new QuotaLimiter({
  maxFileSize: 100 * 1024 * 1024,
  maxTotalSize: 500 * 1024 * 1024
})
```
- Immediate stream abort on limit exceed
- Configurable per-file and total request limits
- Saves bandwidth and prevents memory exhaustion

**Atomic Operations**
- Write to temp file, then atomic rename
- Automatic cleanup on failure
- No partial files visible to application

### Built-in Plugins

#### Validators

**QuotaLimiter** - Size enforcement
```javascript
new QuotaLimiter({
  maxFileSize: 50 * 1024 * 1024,
  maxTotalSize: 200 * 1024 * 1024
})
```

**MagicByteDetector** - File type verification
```javascript
new MagicByteDetector({
  allowed: ['image/jpeg', 'image/png', 'application/pdf']
})
```

**ImageDimensionProbe** - Dimension validation without full decode
```javascript
new ImageDimensionProbe({
  minWidth: 100,
  maxWidth: 8000,
  minHeight: 100,
  maxHeight: 8000
})
```
Supports: JPEG, PNG, GIF, WebP, BMP

#### Transformers

**StreamHasher** - Calculate checksums during upload
```javascript
new StreamHasher({ algorithm: 'sha256' })
```

**StreamCompressor** - On-the-fly compression
```javascript
new StreamCompressor({ algorithm: 'gzip', level: 6 })
```

#### Storage Drivers

**LocalStorage** - Filesystem storage
```javascript
new LocalStorage({
  destination: './uploads',
  naming: 'uuid', // or 'original', 'timestamp', 'hash', 'slugify'
  fileMode: 0o644
})
```

**S3Storage** - AWS S3 and S3-compatible storage
```javascript
new S3Storage({
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  prefix: 'uploads',
  acl: 'private'
})
```
- Manual AWS Signature V4 implementation
- Works with MinIO, DigitalOcean Spaces, etc.
- No `aws-sdk` dependency!

### Advanced Features

#### Multiple Storage Targets

Upload to multiple destinations simultaneously:

```javascript
storage: [
  new LocalStorage({ destination: './uploads' }),
  new S3Storage({ bucket: 'my-bucket', region: 'us-east-1', ... })
]
```

Stream is split (multiplexed) and uploaded in parallel.

#### Custom Plugins

Create your own validators, transformers, or storage drivers:

```javascript
const { Plugin } = require('fluxupload');

class MyValidator extends Plugin {
  async process(context) {
    // Validate context.fileInfo
    // Throw error to reject
    return context;
  }
}
```

### Observability & Monitoring

FluxUpload includes comprehensive **zero-dependency** observability features:

#### Structured Logging

```javascript
const { getLogger } = require('fluxupload');

const logger = getLogger({
  level: 'info',
  format: 'json',
  baseContext: { service: 'my-api' }
});

logger.info('Upload completed', { fileCount: 3 });
```

#### Prometheus Metrics

```javascript
const { getCollector } = require('fluxupload');

const metrics = getCollector();

// Expose metrics endpoint
app.get('/metrics', (req, res) => {
  res.send(metrics.toPrometheus());
});
```

Built-in metrics:
- Upload rates, throughput, and duration
- Active uploads gauge
- Success/failure tracking
- Plugin performance
- File size distribution

#### Progress Tracking

```javascript
const { ProgressTracker } = require('fluxupload');

const tracker = new ProgressTracker();

tracker.on('progress', (progress) => {
  console.log(`${progress.percentage}% - ${progress.bytesPerSecond} bytes/s`);
});
```

#### Health Checks

```javascript
const { HealthCheck } = require('fluxupload');

const healthCheck = new HealthCheck();

app.get('/health', async (req, res) => {
  const health = await healthCheck.check();
  res.json(health);
});
```

#### Rate Limiting

```javascript
const { RateLimiter } = require('fluxupload');

const uploader = new FluxUpload({
  validators: [
    new RateLimiter({
      maxRequests: 100,
      windowMs: 60000  // per minute
    })
  ]
});
```

See [OBSERVABILITY.md](OBSERVABILITY.md) for complete monitoring guide and [examples/monitoring-example.js](examples/monitoring-example.js) for full implementation with Prometheus + Grafana.

## Architecture

FluxUpload uses a **micro-kernel architecture** where the core provides:
1. Multipart parsing
2. Pipeline execution
3. Error handling

Everything else is a **plugin**:

```
HTTP Request
     │
     ▼
┌────────────────┐
│ Multipart      │
│ Parser         │
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ Validators     │ ← QuotaLimiter, MagicByteDetector, etc.
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ Transformers   │ ← StreamHasher, StreamCompressor, etc.
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ Storage        │ ← LocalStorage, S3Storage, etc.
└────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed design documentation.

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Design philosophy and internals
- **[API.md](API.md)** - Complete API reference
- **[examples/](examples/)** - Working examples

## Examples

### Express.js Integration

```javascript
const express = require('express');
const FluxUpload = require('fluxupload');
const { LocalStorage } = require('fluxupload');

const app = express();

const uploader = new FluxUpload({
  storage: new LocalStorage({ destination: './uploads' })
});

app.post('/upload', async (req, res) => {
  try {
    const result = await uploader.handle(req);
    res.json({ success: true, files: result.files });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(3000);
```

### Image Upload with Validation

```javascript
const uploader = new FluxUpload({
  validators: [
    new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 }),
    new MagicByteDetector({ allowed: ['image/*'] }),
    new ImageDimensionProbe({
      minWidth: 100,
      maxWidth: 4096,
      minHeight: 100,
      maxHeight: 4096
    })
  ],
  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],
  storage: new LocalStorage({
    destination: './uploads',
    naming: 'hash' // Use file hash as filename
  })
});
```

### MinIO / DigitalOcean Spaces

```javascript
new S3Storage({
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: 'YOUR_KEY',
  secretAccessKey: 'YOUR_SECRET',
  endpoint: 'https://nyc3.digitaloceanspaces.com' // Custom endpoint
})
```

More examples in [examples/](examples/) directory.

## Comparison

### vs Multer

| Feature | FluxUpload | Multer |
|---------|------------|--------|
| Dependencies | 0 | 8+ (busboy, etc.) |
| Stream-first | ✅ | ✅ |
| Magic byte verification | ✅ Built-in | ❌ Need plugin |
| Image dimension probe | ✅ Built-in | ❌ Need sharp |
| S3 support | ✅ Native | ❌ Need aws-sdk |
| Multiple storage | ✅ Parallel | ❌ Sequential |
| Plugin system | ✅ | Limited |

### vs Busboy

| Feature | FluxUpload | Busboy |
|---------|------------|--------|
| Level | High-level | Low-level |
| Storage | Built-in | Manual |
| Validation | Plugin-based | Manual |
| S3 support | Built-in | Manual |
| Error handling | Automatic | Manual |

## Performance

**Memory:** O(1) - Constant memory usage regardless of file size
**CPU:** <5% overhead for parsing
**Throughput:** Limited only by I/O (disk/network speed)

Upload a 1GB file using only ~10MB RAM.

## Contributing

Contributions welcome! Please:
1. Maintain zero-dependency philosophy
2. Use only native Node.js modules
3. Include tests for new features
4. Update documentation

## License

MIT License - see [LICENSE](LICENSE) file

## Credits

Built with ❤️ using zero external dependencies.

Inspired by:
- [multer](https://github.com/expressjs/multer)
- [busboy](https://github.com/mscdex/busboy)
- [formidable](https://github.com/node-formidable/formidable)

But implemented from scratch with modern Node.js and zero dependencies.

## Support

- 📖 [Documentation](API.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/fluxupload/issues)
- 💬 [Discussions](https://github.com/yourusername/fluxupload/discussions)

---

**FluxUpload** - Zero dependencies. Maximum control. Production ready.
