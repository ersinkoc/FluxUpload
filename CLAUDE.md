# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FluxUpload is a zero-dependency, stream-first file upload handler for Node.js with a plugin-based micro-kernel architecture. It uses only native Node.js modules (stream, http, fs, crypto, zlib) plus `sharp` for image dimension probing.

## Commands

```bash
npm test                    # Run all tests (unit + integration)
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests only
npm run benchmark          # Run benchmarks with memory profiling (--expose-gc)
npm run benchmark:simple   # Quick benchmark without GC exposure
npm run example:express    # Run Express.js example server
npm run example:fastify    # Run Fastify example server
npm run example:s3         # Run S3 upload example
```

No build step required - this is pure Node.js JavaScript with no transpilation.

## Architecture

### Core Pipeline Flow
```
HTTP Request (multipart/form-data)
    ↓
MultipartParser (RFC 7578 compliant)
    ↓
PipelineManager
    ├── Validators (pre-upload checks, abort on failure)
    ├── Transformers (modify stream: hash, compress)
    └── Storage (write to destination)
    ↓
UploadResult { fields, files, errors }
```

### Key Source Files
- `src/FluxUpload.js` - Main API class, orchestrates the upload pipeline
- `src/core/MultipartParser.js` - RFC 7578 multipart parser implementation
- `src/core/PipelineManager.js` - Executes validator→transformer→storage pipeline
- `src/core/Plugin.js` - Base class all plugins extend

### Plugin System
Three plugin types, all extending the `Plugin` base class:

**Validators** (`src/plugins/validators/`):
- `QuotaLimiter` - File size limits, DDOS protection
- `MagicByteDetector` - Binary signature verification (not just extension)
- `ImageDimensionProbe` - Image dimension validation using sharp
- `RateLimiter` - Request rate limiting
- `CsrfProtection` - CSRF token validation

**Transformers** (`src/plugins/transformers/`):
- `StreamHasher` - Calculate SHA256/MD5 hash during stream
- `StreamCompressor` - Gzip/deflate compression

**Storage** (`src/storage/`):
- `LocalStorage` - Atomic writes (temp file → rename)
- `S3Storage` - AWS S3 with manual Signature V4 implementation

### Utilities (`src/utils/`)
- `FileNaming.js` - Naming strategies (uuid, timestamp, hash, slugify)
- `MimeDetector.js` - Magic byte database (20+ formats)
- `AwsSignatureV4.js` - Manual AWS Signature V4 (no aws-sdk dependency)
- `BoundaryScanner.js` - Multipart boundary detection algorithm

### Observability (`src/observability/`)
- `Logger.js` - Structured logging
- `MetricsCollector.js` - Prometheus-format metrics
- `ProgressTracker.js` - Real-time upload progress
- `HealthCheck.js` - Health status endpoint

## Testing

Custom test runner in `test/test-runner.js` - no external test framework. Each test file exports `run()`, `passed`, `failed`, and `tests` array.

Run individual test file:
```bash
node test/unit/FluxUpload.test.js
```

Test temp directory: `test/tmp/uploads/`

## Design Principles

1. **Stream-First**: O(1) memory regardless of file size - never buffer entire files
2. **Atomic Operations**: LocalStorage writes to `.tmp` then renames to prevent partial files
3. **Plugin Architecture**: Core is minimal; all features are composable plugins
4. **Zero Dependencies**: Uses native Node.js modules only (except sharp for images)
5. **Context Object Pattern**: Plugins receive `{ stream, fileInfo, metadata }` and can augment it
