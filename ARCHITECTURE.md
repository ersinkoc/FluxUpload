# FluxUpload Architecture

## Overview
FluxUpload is a zero-dependency, stream-first Node.js file upload package with a micro-kernel architecture.

## Design Principles

1. **Zero Runtime Dependencies**: Only native Node.js modules
2. **Stream-First**: Never buffer entire files in memory
3. **Plugin-Based**: Core is a pipeline runner; everything else is a plugin
4. **Backpressure Aware**: Proper handling of slow consumers
5. **Fail-Safe**: Atomic operations with automatic cleanup on failure

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         HTTP Request                             │
│                    (multipart/form-data)                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Multipart Parser (Core)                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Boundary Detection State Machine                           │ │
│  │ - PREAMBLE → HEADER → BODY → BOUNDARY → ...               │ │
│  │ - Emits: 'field', 'file', 'finish', 'error'               │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pipeline Manager                              │
│                                                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ Source   │──▶│Validators│──▶│Transform │──▶│ Storage  │    │
│  │ Stream   │   │ Plugins  │   │ Plugins  │   │ Driver   │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘    │
│                                                                   │
│  Features:                                                        │
│  - Automatic backpressure handling                               │
│  - Error propagation & cleanup                                   │
│  - Stream multiplexing (Tee)                                     │
└─────────────────────────────────────────────────────────────────┘

```

## Module Breakdown

### 1. Core (`/src/core`)
- **MultipartParser**: Stream-based boundary detector and parser
- **PipelineManager**: Orchestrates plugin execution
- **StreamMultiplexer**: Splits streams for multiple destinations

### 2. Plugins (`/src/plugins`)

#### Validators (`/src/plugins/validators`)
- **QuotaLimiter**: Byte counting with immediate abort on exceed
- **MagicByteDetector**: MIME type verification via file signatures
- **ImageDimensionProbe**: Lightweight header parsing for dimensions

#### Transformers (`/src/plugins/transformers`)
- **StreamHasher**: Calculate checksums during upload
- **StreamCompressor**: Gzip/Deflate on-the-fly
- **ExternalBridge**: Interface for optional peer dependencies (sharp, etc.)

### 3. Storage Drivers (`/src/storage`)
- **LocalStorage**: Filesystem with atomic writes
- **S3Storage**: Manual AWS Signature V4 implementation
- **MemoryStorage**: For testing

### 4. Utilities (`/src/utils`)
- **AwsSignatureV4**: Signature calculation logic
- **BoundaryScanner**: Boyer-Moore-like boundary search
- **MimeDetector**: Magic byte database
- **FileNaming**: Strategies (uuid, timestamp, slugify)
- **AtomicCleanup**: Rollback failed uploads

## Data Flow Example

```javascript
// User uploads 3 files
POST /upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

// FluxUpload processes:
1. MultipartParser detects boundary "----WebKitFormBoundary"
2. For each file:
   a. Parse headers (filename, content-type)
   b. Create PassThrough stream
   c. Run through validators:
      - QuotaLimiter checks size
      - MagicByteDetector verifies MIME
   d. Run through transformers:
      - StreamHasher calculates SHA256
   e. Pipe to storage:
      - LocalStorage writes to /uploads/uuid.jpg
      - (Optional) S3Storage uploads simultaneously
3. On success: Return file metadata
4. On error: Cleanup partial files
```

## Plugin Interface

All plugins implement the `Plugin` interface:

```javascript
class Plugin {
  /**
   * Initialize plugin with config
   * @param {Object} config - Plugin configuration
   */
  constructor(config) {}

  /**
   * Process the stream
   * @param {Object} context - { stream, headers, metadata }
   * @returns {Promise<Object>} - Modified context
   */
  async process(context) {
    // Return context with modified stream
    return context;
  }

  /**
   * Cleanup on error
   * @param {Object} context
   */
  async cleanup(context) {}
}
```

## Error Handling & Atomicity

### Validation Failure
```
Upload starts → Validator detects issue → Stream destroyed immediately
                                       → Partial file deleted
                                       → Error response sent
```

### Network Disconnect
```
Upload 50% done → Client disconnects → 'close' event fired
                                     → Cleanup triggered
                                     → Partial file deleted
```

### Storage Failure
```
Upload complete → S3 write fails → Local file cleaned up
                                 → Transaction rolled back
                                 → Error logged
```

## Security Features

1. **DDOS Protection**
   - Max file count per request
   - Max field name length
   - Max total request size

2. **File Type Verification**
   - Extension ignored
   - Magic byte verification required
   - Whitelist/blacklist support

3. **Filename Sanitization**
   - Path traversal prevention
   - UTF-8 normalization
   - Reserved character removal

4. **Memory Safety**
   - Configurable highWaterMark
   - Stream pause/resume
   - Automatic backpressure

## Performance Targets

- **Memory**: O(1) - Constant regardless of file size
- **CPU**: Minimal overhead (<5% for parser)
- **Throughput**: Limited only by I/O (disk/network)
- **Concurrent Uploads**: Limited by system file descriptors

## Extensibility Points

Users can extend FluxUpload by:

1. **Custom Validators**: Implement Plugin interface
2. **Custom Transformers**: Hook into stream pipeline
3. **Custom Storage**: Implement StorageDriver interface
4. **Event Hooks**: Listen to lifecycle events

## Example Configuration

```javascript
const uploader = new FluxUpload({
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10,
    fields: 20
  },
  validators: [
    new MagicByteDetector({
      allowed: ['image/jpeg', 'image/png']
    }),
    new ImageDimensionProbe({
      maxWidth: 4096,
      maxHeight: 4096
    })
  ],
  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],
  storage: new S3Storage({
    bucket: 'my-bucket',
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }),
  naming: 'uuid'
});
```
