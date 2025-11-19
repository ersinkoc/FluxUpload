# FluxUpload API Documentation

## Table of Contents

1. [Core Classes](#core-classes)
2. [Validators](#validators)
3. [Transformers](#transformers)
4. [Storage Drivers](#storage-drivers)
5. [Utilities](#utilities)

---

## Core Classes

### FluxUpload

Main class for handling file uploads.

```javascript
const uploader = new FluxUpload(config);
```

**Configuration:**

```javascript
{
  limits: {
    fileSize: 100 * 1024 * 1024,  // Max file size in bytes
    files: 10,                      // Max number of files
    fields: 100,                    // Max number of form fields
    fieldSize: 1024 * 1024,        // Max field value size
    fieldNameSize: 100             // Max field name length
  },
  validators: [],      // Array of validator plugins
  transformers: [],    // Array of transformer plugins
  storage: null,       // Storage plugin (or array for multiple)
  onField: null,       // Callback: (name, value) => {}
  onFile: null,        // Callback: (file) => {}
  onError: null,       // Callback: (error) => {}
  onFinish: null       // Callback: ({ fields, files }) => {}
}
```

**Methods:**

- `async initialize()` - Initialize all plugins
- `async shutdown()` - Shutdown all plugins
- `async handle(req)` - Handle HTTP request, returns `{ fields, files }`
- `async parseBuffer(buffer, fileInfo)` - Parse single file from buffer

**Example:**

```javascript
const uploader = new FluxUpload({
  validators: [new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 })],
  storage: new LocalStorage({ destination: './uploads' })
});

await uploader.initialize();

server.on('request', async (req, res) => {
  const result = await uploader.handle(req);
  // result = { fields: {...}, files: [...] }
});
```

---

### Plugin

Base class for all plugins.

```javascript
class MyPlugin extends Plugin {
  constructor(config) {
    super(config);
  }

  async process(context) {
    // Modify context.stream or context.metadata
    return context;
  }

  async cleanup(context, error) {
    // Cleanup on error
  }
}
```

**Context Object:**

```javascript
{
  stream: ReadableStream,     // File stream
  fileInfo: {
    fieldName: string,
    filename: string,
    mimeType: string
  },
  metadata: {
    // Populated by plugins
    hash: string,
    dimensions: { width, height },
    detectedMimeType: string,
    // ... custom metadata
  }
}
```

---

### MultipartParser

Stream-based multipart/form-data parser.

```javascript
const parser = new MultipartParser({
  boundary: 'boundary-string',
  limits: { ... }
});

parser.on('field', (name, value) => {});
parser.on('file', (fileInfo, stream) => {});
parser.on('error', (error) => {});
parser.on('finish', () => {});

request.pipe(parser);
```

**Static Methods:**

- `MultipartParser.getBoundary(contentType)` - Extract boundary from Content-Type header

---

### PipelineManager

Orchestrates plugin execution.

```javascript
const pipeline = new PipelineManager({
  validators: [...],
  transformers: [...],
  storage: storagePlugin
});

await pipeline.initialize();
const result = await pipeline.execute(stream, fileInfo);
```

---

### StreamMultiplexer

Split streams for multiple destinations.

```javascript
const [stream1, stream2] = StreamMultiplexer.split(sourceStream, 2);

// Upload to multiple storages
const results = await StreamMultiplexer.executeParallel(
  sourceStream,
  [storage1, storage2],
  context
);
```

---

## Validators

### QuotaLimiter

Enforce file size limits with immediate abort.

```javascript
new QuotaLimiter({
  maxFileSize: 100 * 1024 * 1024,  // Per-file limit
  maxTotalSize: 500 * 1024 * 1024  // Total upload limit (optional)
})
```

**Throws:**
- `LIMIT_FILE_SIZE` - File exceeds size limit
- `LIMIT_TOTAL_SIZE` - Total upload exceeds limit

---

### MagicByteDetector

Verify file types using magic bytes (file signatures).

```javascript
new MagicByteDetector({
  allowed: ['image/jpeg', 'image/png', 'image/*'],  // Whitelist
  denied: ['application/x-executable'],              // Blacklist (optional)
  bytesToRead: 16                                    // Bytes to read (default: 16)
})
```

**Supported Types:**
- Images: JPEG, PNG, GIF, WebP, BMP, TIFF, ICO
- Documents: PDF, ZIP, DOCX, XLSX
- Audio: MP3, WAV
- Video: MP4, AVI
- Archives: RAR, GZIP, 7Z

**Metadata Added:**
- `context.metadata.detectedMimeType` - Actual MIME type from magic bytes

**Example:**

```javascript
new MagicByteDetector({
  allowed: ['image/*']  // Only allow images
})
```

---

### ImageDimensionProbe

Extract image dimensions from headers without decoding entire file.

```javascript
new ImageDimensionProbe({
  minWidth: 100,
  maxWidth: 8000,
  minHeight: 100,
  maxHeight: 8000,
  bytesToRead: 8192  // Max bytes to read (default: 8KB)
})
```

**Supported Formats:**
- JPEG
- PNG
- GIF
- WebP (VP8, VP8L, VP8X)
- BMP

**Metadata Added:**
- `context.metadata.dimensions` - `{ width: number, height: number }`

**Example:**

```javascript
new ImageDimensionProbe({
  maxWidth: 4096,   // Reject > 4K
  maxHeight: 4096
})
```

---

## Transformers

### StreamHasher

Calculate file checksums during upload.

```javascript
new StreamHasher({
  algorithm: 'sha256',  // md5, sha1, sha256, sha384, sha512
  encoding: 'hex'       // hex, base64, base64url
})
```

**Metadata Added:**
- `context.metadata.hash` - Checksum string
- `context.metadata.hashAlgorithm` - Algorithm used

**Example:**

```javascript
new StreamHasher({ algorithm: 'sha256' })
// Result: metadata.hash = "abc123..."
```

---

### StreamCompressor

Compress files during upload.

```javascript
new StreamCompressor({
  algorithm: 'gzip',        // gzip, deflate, brotli
  level: 6,                 // 0-9 (0=no compression, 9=max)
  compressibleTypes: [      // MIME types to compress
    'text/*',
    'application/json',
    'application/xml',
    'image/svg+xml'
  ]
})
```

**Metadata Added:**
- `context.metadata.compressed` - Boolean
- `context.metadata.compressionAlgorithm` - Algorithm used
- `context.metadata.compressedFilename` - New filename with extension (.gz, .br)

**Note:** Only compresses text-based formats. Skips already-compressed formats (JPEG, PNG, MP4, ZIP).

---

## Storage Drivers

### LocalStorage

Store files on local filesystem with atomic writes.

```javascript
new LocalStorage({
  destination: './uploads',      // Upload directory
  naming: 'uuid',                // Naming strategy
  createDirectories: true,       // Auto-create dirs
  fileMode: 0o644,              // File permissions
  dirMode: 0o755                // Directory permissions
})
```

**Naming Strategies:**
- `'original'` - Keep original filename (sanitized)
- `'uuid'` - Generate UUID v4
- `'timestamp'` - Use timestamp + random suffix
- `'hash'` - Use file hash (requires StreamHasher)
- `'slugify'` - Sanitize and normalize Unicode

**Custom Naming:**

```javascript
naming: {
  strategy: 'uuid',
  prefix: 'upload-',
  suffix: '-prod',
  preserveExtension: true,
  maxLength: 255
}
```

**Methods:**

- `async delete(filename)` - Delete file
- `async exists(filename)` - Check if file exists
- `async getMetadata(filename)` - Get file metadata

**Storage Result:**

```javascript
{
  driver: 'local',
  path: '/absolute/path/to/file.jpg',
  filename: 'abc-123.jpg',
  size: 12345,
  url: '/uploads/abc-123.jpg'
}
```

---

### S3Storage

Upload to S3 or S3-compatible storage (MinIO, DigitalOcean Spaces).

```javascript
new S3Storage({
  bucket: 'my-bucket',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: null,           // Optional (for temporary credentials)
  endpoint: null,               // Custom endpoint (for MinIO, Spaces)
  prefix: 'uploads',            // Key prefix (folder)
  naming: 'uuid',               // Naming strategy
  acl: 'private',              // ACL (private, public-read, etc.)
  storageClass: 'STANDARD',    // Storage class
  metadata: {}                  // Custom metadata (x-amz-meta-*)
})
```

**Storage Result:**

```javascript
{
  driver: 's3',
  bucket: 'my-bucket',
  key: 'uploads/abc-123.jpg',
  region: 'us-east-1',
  url: 'https://my-bucket.s3.us-east-1.amazonaws.com/uploads/abc-123.jpg',
  etag: 'abc123...'
}
```

**Methods:**

- `generatePresignedUrl(key, options)` - Generate presigned URL for browser uploads

**Example with MinIO:**

```javascript
new S3Storage({
  bucket: 'uploads',
  region: 'us-east-1',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  endpoint: 'http://localhost:9000'
})
```

---

## Utilities

### FileNaming

Generate safe, unique filenames.

```javascript
const naming = new FileNaming({
  strategy: 'uuid',
  prefix: '',
  suffix: '',
  preserveExtension: true,
  maxLength: 255
});

const filename = naming.generate('photo.jpg', metadata);
// Result: "abc-123-def-456.jpg"
```

**Static Methods:**

- `FileNaming.isSafe(filename)` - Check if filename is safe

---

### MimeDetector

Detect file types from magic bytes.

```javascript
const detector = new MimeDetector();

const result = detector.detect(buffer);
// Result: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] }

const allowed = detector.isAllowed('image/jpeg', ['image/*']);
// Result: true
```

---

### AwsSignatureV4

AWS Signature Version 4 signing (for custom S3 operations).

```javascript
const signer = new AwsSignatureV4({
  accessKeyId: 'YOUR_KEY',
  secretAccessKey: 'YOUR_SECRET',
  region: 'us-east-1',
  service: 's3'
});

const headers = signer.sign({
  method: 'PUT',
  url: 'https://bucket.s3.amazonaws.com/key',
  headers: {},
  body: buffer
});

// Use headers in HTTP request
```

**Methods:**

- `sign(request)` - Sign HTTP request, returns headers
- `presign(options)` - Generate presigned URL

---

## Complete Example

```javascript
const FluxUpload = require('fluxupload');
const {
  LocalStorage,
  S3Storage,
  QuotaLimiter,
  MagicByteDetector,
  ImageDimensionProbe,
  StreamHasher
} = require('fluxupload');

const uploader = new FluxUpload({
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10
  },

  validators: [
    new QuotaLimiter({ maxFileSize: 50 * 1024 * 1024 }),
    new MagicByteDetector({ allowed: ['image/*'] }),
    new ImageDimensionProbe({ maxWidth: 4096, maxHeight: 4096 })
  ],

  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],

  // Upload to both local and S3 simultaneously
  storage: [
    new LocalStorage({ destination: './uploads', naming: 'uuid' }),
    new S3Storage({
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    })
  ]
});

await uploader.initialize();

const result = await uploader.handle(req);
/*
Result:
{
  fields: { username: 'john' },
  files: [
    {
      fieldName: 'photo',
      filename: 'abc-123.jpg',
      mimeType: 'image/jpeg',
      hash: 'sha256-hash-here',
      dimensions: { width: 1920, height: 1080 },
      path: '/uploads/abc-123.jpg',
      url: '/uploads/abc-123.jpg',
      size: 123456
    }
  ]
}
*/
```
