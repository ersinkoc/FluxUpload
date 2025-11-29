# FluxUpload

**Zero-dependency**, **stream-first** file upload handler for Node.js with a **micro-kernel architecture**.

[![npm version](https://img.shields.io/npm/v/fluxupload.svg)](https://www.npmjs.com/package/fluxupload) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Node.js Version](https://img.shields.io/node/v/fluxupload.svg)](https://nodejs.org) [![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

## Why FluxUpload?

- **Zero Runtime Dependencies** - Uses only native Node.js modules
- **Stream-First** - Never buffers entire files in memory (O(1) memory)
- **Plugin-Based** - Modular, extensible micro-kernel architecture
- **Security-First** - Magic byte verification, atomic writes, path traversal prevention
- **Multi-Storage** - Local filesystem, S3, or multiple destinations simultaneously
- **Production-Ready** - Handles backpressure, cleanup, and error recovery

## Installation

```bash
npm install fluxupload
```

**Requirements:** Node.js >= 14.0.0

## Quick Start

```javascript
const http = require('http');
const FluxUpload = require('fluxupload');
const { LocalStorage, QuotaLimiter, MagicByteDetector } = require('fluxupload');

const uploader = new FluxUpload({
  validators: [
    new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 }), // 10MB
    new MagicByteDetector({ allowed: ['image/*'] })
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

## S3 Upload

```javascript
const { S3Storage } = require('fluxupload');

const uploader = new FluxUpload({
  storage: new S3Storage({
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  })
});
```

Works with MinIO, DigitalOcean Spaces, and any S3-compatible storage.

## Built-in Plugins

### Validators

- **QuotaLimiter** - File size limits with immediate stream abort
- **MagicByteDetector** - Verify file types via magic bytes
- **ImageDimensionProbe** - Validate image dimensions
- **RateLimiter** - Request rate limiting
- **CsrfProtection** - CSRF token validation

### Transformers

- **StreamHasher** - Calculate SHA256/MD5 checksums
- **StreamCompressor** - Gzip/Brotli compression

### Storage

- **LocalStorage** - Filesystem with atomic writes
- **S3Storage** - AWS S3 (manual Signature V4, no aws-sdk)

## Architecture

```
HTTP Request → MultipartParser → Validators → Transformers → Storage
```

FluxUpload uses a micro-kernel design where everything is a plugin.

## Documentation

Full documentation available at **[fluxupload.oxog.dev](https://fluxupload.oxog.dev)**

- [Getting Started](https://fluxupload.oxog.dev/guide/)
- [API Reference](https://fluxupload.oxog.dev/api/)
- [Examples](https://fluxupload.oxog.dev/examples/)

## Performance

- **Memory:** O(1) - Upload a 10GB file using ~10MB RAM
- **CPU:** <5% overhead for parsing
- **Throughput:** Limited only by I/O

## Contributing

Contributions welcome! Please maintain the zero-dependency philosophy.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE)

---

**FluxUpload** - Zero dependencies. Maximum control.

[Website](https://fluxupload.oxog.dev) · [GitHub](https://github.com/ersinkoc/fluxupload) · [npm](https://www.npmjs.com/package/fluxupload)
