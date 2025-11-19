# Troubleshooting Guide

This guide helps you diagnose and fix common issues with FluxUpload.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Upload Failures](#upload-failures)
- [Memory Issues](#memory-issues)
- [Performance Problems](#performance-problems)
- [S3 Integration Issues](#s3-integration-issues)
- [Parser Errors](#parser-errors)
- [Security Issues](#security-issues)
- [Docker/Kubernetes Issues](#dockerkubernetes-issues)

---

## Installation Issues

### Problem: Module not found

**Symptoms:**
```
Error: Cannot find module 'fluxupload'
```

**Solution:**
```bash
# Verify FluxUpload is in the correct location
ls -la node_modules/fluxupload  # If installed via npm
ls -la src/                      # If using source

# For source usage:
const FluxUpload = require('./src');  # Use relative path
```

### Problem: TypeScript definitions not working

**Symptoms:**
- No IntelliSense in IDE
- Type errors despite correct usage

**Solution:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["node"],
    "moduleResolution": "node"
  }
}
```

Or explicitly import types:
```typescript
import FluxUpload, { LocalStorage } from 'fluxupload';
```

---

## Upload Failures

### Problem: "Missing boundary in Content-Type"

**Symptoms:**
```
Error: Missing boundary in Content-Type
```

**Cause:** Request doesn't have proper multipart headers

**Solution:**
```javascript
// Correct: Browser form
<form enctype="multipart/form-data">

// Correct: Fetch API
const formData = new FormData();
formData.append('file', file);
fetch('/upload', {
  method: 'POST',
  body: formData  // Don't set Content-Type manually!
});

// Incorrect: Manual Content-Type
fetch('/upload', {
  method: 'POST',
  headers: { 'Content-Type': 'multipart/form-data' },  // Missing boundary!
  body: formData
});
```

### Problem: File size limit exceeded

**Symptoms:**
```
Error: File size limit exceeded: 100000000 bytes
```

**Solution:**
```javascript
// Increase limit
new QuotaLimiter({
  maxFileSize: 500 * 1024 * 1024  // 500MB
})

// Or remove validator entirely for unlimited
const uploader = new FluxUpload({
  validators: [],  // No size limits
  storage: ...
});
```

### Problem: "File type not allowed"

**Symptoms:**
```
Error: File type mismatch: declared as image/jpeg, but detected as application/x-executable
```

**Cause:** Magic byte verification detected file type mismatch (security feature!)

**Solution:**
```javascript
// Option 1: Add the correct MIME type
new MagicByteDetector({
  allowed: ['image/*', 'application/pdf', 'video/mp4']
})

// Option 2: Disable magic byte detection (NOT RECOMMENDED)
const uploader = new FluxUpload({
  validators: [
    // Remove MagicByteDetector
  ],
  storage: ...
});
```

**Security Warning:** Never disable MagicByteDetector in production! It prevents malware uploads disguised as safe files.

---

## Memory Issues

### Problem: High memory usage with large files

**Symptoms:**
- Node.js process using excessive RAM
- Out of memory errors

**Diagnosis:**
```bash
# Check memory usage
node --expose-gc --trace-gc examples/basic-usage.js

# Monitor in real-time
watch -n 1 'ps aux | grep node'
```

**Solution:**

FluxUpload uses **O(1) memory** by design. High memory usually indicates:

1. **Buffering outside FluxUpload:**
```javascript
// BAD: Buffering entire request
app.use(bodyParser.raw({ limit: '100mb' }));  // Remove this!
app.post('/upload', (req) => {
  uploader.handle(req);  // req already buffered
});

// GOOD: Stream directly
app.post('/upload', (req) => {
  uploader.handle(req);  // Streaming
});
```

2. **Not using streams properly:**
```javascript
// BAD: Reading entire file into memory
const buffer = await fs.promises.readFile(filePath);

// GOOD: Stream processing
const stream = fs.createReadStream(filePath);
await uploader.parseBuffer(stream, fileInfo);
```

3. **Transform plugins buffering:**
```javascript
// Check custom plugins
class MyPlugin extends Plugin {
  async process(context) {
    // BAD: Collecting all data
    let buffer = Buffer.alloc(0);
    context.stream.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);  // Memory leak!
    });

    // GOOD: Stream-through
    const transform = new Transform({
      transform(chunk, encoding, callback) {
        // Process chunk immediately
        callback(null, chunk);
      }
    });
    return {
      ...context,
      stream: context.stream.pipe(transform)
    };
  }
}
```

---

## Performance Problems

### Problem: Slow upload speed

**Diagnosis:**
```bash
# Run benchmarks
npm run benchmark

# Check Node.js version
node --version  # Use Node 18+ for best performance
```

**Solutions:**

1. **Increase highWaterMark:**
```javascript
const stream = fs.createReadStream(path, {
  highWaterMark: 64 * 1024  // 64KB chunks (default: 16KB)
});
```

2. **Use faster hash algorithm:**
```javascript
// Slower
new StreamHasher({ algorithm: 'sha512' })

// Faster
new StreamHasher({ algorithm: 'md5' })

// Fastest (no hashing)
// Remove StreamHasher entirely
```

3. **Disable unnecessary validators:**
```javascript
// Only use what you need
validators: [
  new QuotaLimiter({ ... }),  // Fast
  // new ImageDimensionProbe()  // Slower for large images
]
```

### Problem: CPU usage too high

**Diagnosis:**
```bash
# Profile CPU
node --prof examples/basic-usage.js
# ... run upload ...
node --prof-process isolate-*.log > profile.txt
```

**Solutions:**

1. **Reduce compression level:**
```javascript
new StreamCompressor({
  algorithm: 'gzip',
  level: 3  // Lower = faster, less compression
})
```

2. **Limit concurrent uploads:**
```javascript
const MAX_CONCURRENT = 5;
let activeUploads = 0;

app.post('/upload', async (req, res) => {
  if (activeUploads >= MAX_CONCURRENT) {
    return res.status(429).send('Too many uploads');
  }

  activeUploads++;
  try {
    await uploader.handle(req);
  } finally {
    activeUploads--;
  }
});
```

---

## S3 Integration Issues

### Problem: "S3 upload failed: 403 Forbidden"

**Cause:** Invalid AWS credentials or permissions

**Solution:**
```javascript
// 1. Verify credentials
console.log('Access Key:', process.env.AWS_ACCESS_KEY_ID);
console.log('Region:', process.env.AWS_REGION);

// 2. Test with AWS CLI
aws s3 ls s3://your-bucket/ --region us-east-1

// 3. Check IAM permissions
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutObject",
      "s3:PutObjectAcl",
      "s3:DeleteObject"
    ],
    "Resource": "arn:aws:s3:::your-bucket/*"
  }]
}
```

### Problem: "Signature mismatch"

**Symptoms:**
```
Error: The request signature we calculated does not match the signature you provided
```

**Solutions:**

1. **Check for URL encoding issues:**
```javascript
// Ensure filename doesn't have special characters
naming: 'uuid'  // Instead of 'original'
```

2. **Verify system time:**
```bash
# AWS requires accurate time (±15 minutes)
date
sudo ntpdate -s time.nist.gov  # Sync time
```

3. **Check endpoint format:**
```javascript
// Correct
endpoint: 'https://s3.us-east-1.amazonaws.com'

// Incorrect
endpoint: 's3.us-east-1.amazonaws.com'  // Missing https://
```

### Problem: MinIO connection refused

**Solution:**
```javascript
// Use correct MinIO endpoint
new S3Storage({
  bucket: 'my-bucket',
  region: 'us-east-1',  // Required even for MinIO
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  endpoint: 'http://localhost:9000'  // Note: http not https
})

// Create bucket first
// mc alias set myminio http://localhost:9000 minioadmin minioadmin
// mc mb myminio/my-bucket
```

---

## Parser Errors

### Problem: "Unexpected end of multipart data"

**Cause:** Client closed connection or sent incomplete data

**Solution:**
```javascript
// Handle aborted uploads
uploader.on('error', (error) => {
  if (error.message.includes('Unexpected end')) {
    console.log('Client disconnected');
    // Cleanup happens automatically
  }
});

// Client-side: Don't cancel uploads
const controller = new AbortController();
fetch('/upload', {
  method: 'POST',
  body: formData,
  signal: controller.signal
});
// Don't call: controller.abort()
```

### Problem: Boundary not found

**Diagnosis:**
```javascript
// Log the Content-Type header
app.post('/upload', (req) => {
  console.log('Content-Type:', req.headers['content-type']);
  // Should be: multipart/form-data; boundary=----WebKitFormBoundary...
});
```

**Solution:**
- Ensure client sets proper Content-Type
- Don't manually override multipart headers
- Use browser FormData API

---

## Security Issues

### Problem: Malware uploaded despite MagicByteDetector

**This should NEVER happen.** If it does:

1. **Verify magic byte detector is enabled:**
```javascript
validators: [
  new MagicByteDetector({
    allowed: ['image/*']
  })
]
```

2. **Check file was actually validated:**
```javascript
onFile: (file) => {
  console.log('Detected type:', file.detectedMimeType);
  // Should exist and match allowed types
}
```

3. **File bypassed validator?**
- Check if error handling is swallowing exceptions
- Ensure validators run before storage

### Problem: Path traversal in filenames

**Example attack:**
```
filename: "../../../etc/passwd"
```

**FluxUpload prevents this automatically:**
```javascript
// FileNaming sanitizes all filenames
const naming = new FileNaming({ strategy: 'original' });
naming.generate('../../../etc/passwd');
// Returns: "etcpasswd" (safe)

// Best practice: Use UUID naming
naming: 'uuid'  // No user input in filename
```

---

## Docker/Kubernetes Issues

### Problem: Permission denied writing to /app/uploads

**Solution:**
```dockerfile
# Ensure correct permissions
RUN mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app/uploads

USER nodejs
```

Or use volume mount:
```yaml
# docker-compose.yml
volumes:
  - ./uploads:/app/uploads
```

### Problem: Container crashes with OOM

**Diagnosis:**
```bash
# Check container memory
docker stats fluxupload

# Check limits
docker inspect fluxupload | grep -i memory
```

**Solution:**
```yaml
# docker-compose.yml
services:
  fluxupload:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 128M
```

**Important:** If FluxUpload OOMs, you're likely buffering somewhere. FluxUpload itself uses O(1) memory.

### Problem: Health check failing

**Solution:**
```javascript
// Add health endpoint to your app
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
```

---

## Debugging Tips

### Enable Debug Logging

```javascript
const uploader = new FluxUpload({
  onFile: (file) => {
    console.log('[DEBUG] File:', file);
  },
  onField: (name, value) => {
    console.log('[DEBUG] Field:', name, '=', value);
  },
  onError: (error) => {
    console.error('[DEBUG] Error:', error);
  }
});
```

### Inspect Multipart Data

```javascript
// Log raw chunks (for debugging only!)
const MultipartParser = require('fluxupload/src/core/MultipartParser');

class DebugParser extends MultipartParser {
  _write(chunk, encoding, callback) {
    console.log('Chunk:', chunk.length, 'bytes');
    console.log('First 100 bytes:', chunk.slice(0, 100).toString());
    super._write(chunk, encoding, callback);
  }
}
```

### Memory Profiling

```bash
# Generate heap snapshot
node --expose-gc --inspect examples/basic-usage.js

# In Chrome DevTools:
# 1. Open chrome://inspect
# 2. Click "inspect"
# 3. Go to Memory tab
# 4. Take heap snapshot before/after upload
```

---

## Getting Help

If you're still stuck:

1. **Check existing issues:** https://github.com/yourusername/fluxupload/issues
2. **Create minimal reproduction:** Share code that reproduces the problem
3. **Include environment:**
   ```
   - Node.js version: `node --version`
   - OS: Linux/macOS/Windows
   - FluxUpload version
   - Error messages
   - Debug logs
   ```

4. **For security issues:** Email security@fluxupload.io (DO NOT open public issue)

---

## Common Gotchas

✅ **DO:**
- Use streams, never buffer
- Enable MagicByteDetector in production
- Use UUID naming for security
- Set appropriate size limits
- Handle errors properly
- Test with large files (>1GB)

❌ **DON'T:**
- Use bodyParser middleware with FluxUpload
- Trust file extensions
- Allow unlimited file sizes
- Ignore error events
- Buffer entire uploads
- Run as root in containers

---

**FluxUpload** - Zero dependencies. Maximum control. Secure by design.
