# Changelog

All notable changes to FluxUpload will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-19

### Added
- 🎉 Initial release of FluxUpload
- Zero-dependency file upload package for Node.js
- Stream-first architecture with constant memory usage
- Micro-kernel plugin-based design

#### Core Features
- **MultipartParser**: RFC 7578 compliant multipart/form-data parser
  - State machine with boundary detection
  - Handles split boundaries across chunks
  - Automatic backpressure management
- **PipelineManager**: Plugin orchestration system
  - Automatic error propagation
  - Stream cleanup on failure
- **StreamMultiplexer**: Upload to multiple destinations simultaneously

#### Built-in Validators
- **QuotaLimiter**: File size limits with immediate abort
- **MagicByteDetector**: File type verification via magic bytes
  - Supports 20+ file formats
  - Prevents malware uploads
- **ImageDimensionProbe**: Extract image dimensions from headers
  - Supports JPEG, PNG, GIF, WebP, BMP
  - Reads only headers (~1KB for 50MB image)

#### Built-in Transformers
- **StreamHasher**: Calculate checksums during upload
  - Supports MD5, SHA1, SHA256, SHA384, SHA512
- **StreamCompressor**: On-the-fly compression
  - Supports gzip, deflate, brotli
  - Smart: only compresses text-based formats

#### Storage Drivers
- **LocalStorage**: Filesystem storage
  - Atomic writes (temp → rename)
  - 5 naming strategies: uuid, timestamp, hash, slugify, original
  - Automatic cleanup on failure
- **S3Storage**: AWS S3 and S3-compatible storage
  - Manual AWS Signature V4 implementation (no aws-sdk!)
  - Works with MinIO, DigitalOcean Spaces, etc.
  - Presigned URL generation

#### Utilities
- **BoundaryScanner**: Efficient boundary detection with rolling buffer
- **MimeDetector**: Magic byte database for 20+ file types
- **FileNaming**: UUID generation, sanitization, slugification
- **AwsSignatureV4**: Complete AWS Signature V4 implementation

#### Security
- Magic byte verification (never trust extensions)
- DDOS protection (immediate stream abort on limit)
- Atomic operations (no partial files)
- Path traversal prevention
- Unicode normalization
- Automatic cleanup on errors

#### Documentation
- Comprehensive README with examples
- ARCHITECTURE.md with design philosophy
- API.md with complete API reference
- Working examples for basic and S3 usage
- PROJECT_SUMMARY.md with technical details

#### Testing
- Unit tests for core utilities
- Integration tests for upload flows
- Zero-dependency test runner

### Dependencies
- **Runtime**: 0 dependencies
- **Peer**: 0 dependencies
- **Dev**: 0 dependencies

### Supported Node.js Versions
- Node.js >= 12.0.0

---

## [Unreleased]

### Planned Features
- Multipart S3 upload for files >5GB
- Image resizing integration (optional sharp peer dependency)
- Video processing integration (optional ffmpeg)
- Virus scanning (ClamAV integration)
- Progress events for real-time upload tracking
- Azure Blob Storage driver
- Google Cloud Storage driver
- TypeScript definitions (.d.ts files)
- Comprehensive benchmarks

### Under Consideration
- WebDAV storage driver
- FTP/SFTP storage driver
- Custom transformation chains
- Plugin marketplace/registry
- CLI tool for testing uploads
- GraphQL multipart spec support

---

## Release History

- **1.0.0** (2025-01-19): Initial release

---

## Migration Guides

### From Multer

```javascript
// Before (Multer)
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ file: req.file });
});

// After (FluxUpload)
const FluxUpload = require('fluxupload');
const { LocalStorage } = require('fluxupload');

const uploader = new FluxUpload({
  storage: new LocalStorage({ destination: 'uploads/' })
});

app.post('/upload', async (req, res) => {
  const result = await uploader.handle(req);
  res.json({ file: result.files[0] });
});
```

### From Busboy

```javascript
// Before (Busboy)
const busboy = require('busboy');
const bb = busboy({ headers: req.headers });

bb.on('file', (name, file, info) => {
  file.pipe(fs.createWriteStream('output.dat'));
});

bb.on('close', () => {
  res.send('Done');
});

req.pipe(bb);

// After (FluxUpload)
const uploader = new FluxUpload({
  storage: new LocalStorage({ destination: './uploads' })
});

const result = await uploader.handle(req);
res.json(result);
```

---

## Support

- 📖 [Documentation](API.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/fluxupload/issues)
- 💬 [Discussions](https://github.com/yourusername/fluxupload/discussions)

---

**FluxUpload** - Zero dependencies. Maximum control.
