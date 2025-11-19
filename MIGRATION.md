# Migration Guide

Complete guide for migrating from Multer or Busboy to FluxUpload.

## Table of Contents

- [Why Migrate to FluxUpload?](#why-migrate-to-fluxupload)
- [From Multer](#from-multer)
- [From Busboy](#from-busboy)
- [From Formidable](#from-formidable)
- [Breaking Changes](#breaking-changes)
- [Feature Comparison](#feature-comparison)

## Why Migrate to FluxUpload?

### Advantages Over Alternatives

| Feature | FluxUpload | Multer | Busboy | Formidable |
|---------|------------|---------|---------|------------|
| **Dependencies** | 0 | 7+ | 3+ | 5+ |
| **Memory Usage** | O(1) | O(n) | O(1) | O(n) |
| **S3 Support** | Native | Via multer-s3 | Manual | Manual |
| **Plugin System** | ✅ | Limited | ❌ | Limited |
| **TypeScript** | Native | @types needed | @types needed | @types needed |
| **Magic Byte Detection** | ✅ | ❌ | ❌ | ❌ |
| **Image Dimensions** | ✅ | ❌ | ❌ | ❌ |
| **Progress Tracking** | ✅ | ❌ | ❌ | Limited |
| **Rate Limiting** | ✅ | ❌ | ❌ | ❌ |
| **Observability** | ✅ | ❌ | ❌ | ❌ |
| **Security** | CSRF, Signed URLs | Basic | Basic | Basic |

## From Multer

### Basic Upload

**Multer:**
```javascript
const multer = require('multer');
const upload = multer({ dest: './uploads' });

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ file: req.file });
});
```

**FluxUpload:**
```javascript
const { FluxUpload, LocalStorage } = require('fluxupload');

app.post('/upload', (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({ destination: './uploads' }),

    onFinish: (results) => {
      res.json({ file: results.files[0] });
    }
  });
});
```

### File Size Limit

**Multer:**
```javascript
const upload = multer({
  dest: './uploads',
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});
```

**FluxUpload:**
```javascript
const { QuotaLimiter } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 })
  ],
  storage: new LocalStorage({ destination: './uploads' })
});
```

### File Filter

**Multer:**
```javascript
const upload = multer({
  dest: './uploads',
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});
```

**FluxUpload:**
```javascript
const { MagicByteDetector } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new MagicByteDetector({ allowed: ['image/*'] })
  ],
  storage: new LocalStorage({ destination: './uploads' })
});
```

### Custom Filename

**Multer:**
```javascript
const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix);
  }
});

const upload = multer({ storage });
```

**FluxUpload:**
```javascript
const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({
    destination: './uploads',
    namingStrategy: 'timestamp' // or 'uuid', 'hash', 'slugify'
  })
});

// Or custom:
const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({
    destination: './uploads',
    naming: {
      generate: (originalFilename, metadata) => {
        return `${Date.now()}-${originalFilename}`;
      }
    }
  })
});
```

### Multiple Files

**Multer:**
```javascript
app.post('/upload', upload.array('photos', 12), (req, res) => {
  res.json({ files: req.files });
});
```

**FluxUpload:**
```javascript
app.post('/upload', (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    validators: [
      new QuotaLimiter({ maxFiles: 12 })
    ],
    storage: new LocalStorage({ destination: './uploads' }),

    onFinish: (results) => {
      res.json({ files: results.files });
    }
  });
});
```

### Memory Storage

**Multer:**
```javascript
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
  const buffer = req.file.buffer;
  // Process buffer
});
```

**FluxUpload:**
```javascript
// FluxUpload discourages buffering, but you can:
const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({ destination: './uploads' }),

  onFile: async (file) => {
    const chunks = [];
    file.stream.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      file.stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        // Process buffer
        resolve();
      });
      file.stream.on('error', reject);
    });
  }
});
```

### S3 Upload

**Multer + multer-s3:**
```javascript
const multer = require('multer');
const multerS3 = require('multer-s3');
const aws = require('aws-sdk');

const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: 'my-bucket',
    acl: 'public-read',
    key: (req, file, cb) => {
      cb(null, Date.now().toString())
    }
  })
});
```

**FluxUpload (no dependencies!):**
```javascript
const { S3Storage } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  storage: new S3Storage({
    bucket: 'my-bucket',
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    acl: 'public-read',
    namingStrategy: 'timestamp'
  })
});
```

## From Busboy

### Basic Upload

**Busboy:**
```javascript
const Busboy = require('busboy');

app.post('/upload', (req, res) => {
  const busboy = Busboy({ headers: req.headers });

  busboy.on('file', (fieldname, file, info) => {
    const { filename, encoding, mimeType } = info;
    const saveTo = path.join('./uploads', filename);
    file.pipe(fs.createWriteStream(saveTo));
  });

  busboy.on('finish', () => {
    res.json({ message: 'Upload complete' });
  });

  req.pipe(busboy);
});
```

**FluxUpload:**
```javascript
const { FluxUpload, LocalStorage } = require('fluxupload');

app.post('/upload', (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({ destination: './uploads' }),

    onFinish: (results) => {
      res.json({ files: results.files });
    }
  });
});
```

### File and Field Handling

**Busboy:**
```javascript
const busboy = Busboy({ headers: req.headers });
const files = [];
const fields = {};

busboy.on('file', (fieldname, file, info) => {
  const chunks = [];
  file.on('data', (chunk) => chunks.push(chunk));
  file.on('end', () => {
    files.push({ fieldname, buffer: Buffer.concat(chunks), info });
  });
});

busboy.on('field', (fieldname, value) => {
  fields[fieldname] = value;
});

busboy.on('finish', () => {
  res.json({ files, fields });
});

req.pipe(busboy);
```

**FluxUpload:**
```javascript
const uploader = new FluxUpload({
  request: req,
  storage: new LocalStorage({ destination: './uploads' }),

  onFinish: (results) => {
    res.json({
      files: results.files,
      fields: results.fields
    });
  }
});
```

### File Size Limit

**Busboy:**
```javascript
const busboy = Busboy({
  headers: req.headers,
  limits: { fileSize: 10 * 1024 * 1024 }
});

busboy.on('file', (fieldname, file, info) => {
  file.on('limit', () => {
    file.resume(); // Drain stream
    res.status(413).json({ error: 'File too large' });
  });
});
```

**FluxUpload:**
```javascript
const { QuotaLimiter } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 })
  ],
  storage,

  onError: (error) => {
    if (error.code === 'QUOTA_EXCEEDED') {
      res.status(413).json({ error: 'File too large' });
    }
  }
});
```

### Stream Processing

**Busboy:**
```javascript
const crypto = require('crypto');

busboy.on('file', (fieldname, file, info) => {
  const hash = crypto.createHash('sha256');
  const saveTo = path.join('./uploads', info.filename);
  const writeStream = fs.createWriteStream(saveTo);

  file.pipe(hash);
  file.pipe(writeStream);

  file.on('end', () => {
    console.log('Hash:', hash.digest('hex'));
  });
});
```

**FluxUpload:**
```javascript
const { StreamHasher } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],
  storage: new LocalStorage({ destination: './uploads' }),

  onFinish: (results) => {
    results.files.forEach(file => {
      console.log('Hash:', file.hash);
    });
  }
});
```

## From Formidable

### Basic Upload

**Formidable:**
```javascript
const formidable = require('formidable');

app.post('/upload', (req, res) => {
  const form = formidable({ uploadDir: './uploads' });

  form.parse(req, (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ fields, files });
  });
});
```

**FluxUpload:**
```javascript
const { FluxUpload, LocalStorage } = require('fluxupload');

app.post('/upload', (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    storage: new LocalStorage({ destination: './uploads' }),

    onFinish: (results) => {
      res.json({
        fields: results.fields,
        files: results.files
      });
    },

    onError: (error) => {
      res.status(500).json({ error: error.message });
    }
  });
});
```

### File Size and Count Limits

**Formidable:**
```javascript
const form = formidable({
  uploadDir: './uploads',
  maxFileSize: 50 * 1024 * 1024,
  maxFiles: 10
});
```

**FluxUpload:**
```javascript
const { QuotaLimiter } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new QuotaLimiter({
      maxFileSize: 50 * 1024 * 1024,
      maxTotalSize: 500 * 1024 * 1024
    })
  ],
  storage: new LocalStorage({ destination: './uploads' })
});
```

### File Filter

**Formidable:**
```javascript
const form = formidable({
  uploadDir: './uploads',
  filter: ({ name, originalFilename, mimetype }) => {
    return mimetype && mimetype.includes('image');
  }
});
```

**FluxUpload:**
```javascript
const { MagicByteDetector } = require('fluxupload');

const uploader = new FluxUpload({
  request: req,
  validators: [
    new MagicByteDetector({ allowed: ['image/*'] })
  ],
  storage: new LocalStorage({ destination: './uploads' })
});
```

## Breaking Changes

### API Differences

| Feature | Multer/Busboy | FluxUpload |
|---------|---------------|------------|
| **Request Object** | Modified (`req.file`, `req.files`) | Not modified (results in callback) |
| **Middleware** | Express middleware | Event-based API |
| **Errors** | Callback/middleware errors | `onError` callback |
| **Configuration** | Single config object | Plugin-based validators/transformers |

### Behavioral Differences

1. **Stream Handling**: FluxUpload always streams (never buffers by default)
2. **Security**: FluxUpload validates file types via magic bytes, not Content-Type
3. **File Names**: FluxUpload provides multiple naming strategies
4. **Error Handling**: Explicit `onError` callback instead of middleware next()

## Feature Comparison

### What FluxUpload Adds

**Security:**
- ✅ Magic byte file type detection
- ✅ Image dimension validation
- ✅ CSRF protection
- ✅ Signed upload URLs
- ✅ Rate limiting

**Observability:**
- ✅ Structured logging
- ✅ Prometheus metrics
- ✅ Real-time progress tracking
- ✅ Health checks

**Performance:**
- ✅ Clustering support
- ✅ Stream multiplexing (multiple destinations)
- ✅ Compression on-the-fly
- ✅ Zero dependencies

**Storage:**
- ✅ Native S3 support (no aws-sdk needed)
- ✅ Multiple storage targets
- ✅ Atomic file operations

### Migration Checklist

- [ ] Install FluxUpload: `npm install fluxupload`
- [ ] Remove old dependencies: `npm uninstall multer busboy formidable`
- [ ] Update upload endpoints to use FluxUpload API
- [ ] Replace middleware with FluxUpload event handlers
- [ ] Update file access from `req.file/req.files` to results callback
- [ ] Add validators for file size, type, etc.
- [ ] Update error handling to use `onError` callback
- [ ] Test all upload functionality
- [ ] Add observability (optional but recommended)
- [ ] Update documentation

### Example: Complete Migration

**Before (Multer):**
```javascript
const express = require('express');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images allowed'));
    }
  }
});

app.post('/upload', upload.single('photo'), (req, res) => {
  res.json({ file: req.file });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }
  next(error);
});
```

**After (FluxUpload):**
```javascript
const express = require('express');
const {
  FluxUpload,
  LocalStorage,
  QuotaLimiter,
  MagicByteDetector
} = require('fluxupload');

app.post('/upload', (req, res) => {
  const uploader = new FluxUpload({
    request: req,
    validators: [
      new QuotaLimiter({ maxFileSize: 10 * 1024 * 1024 }),
      new MagicByteDetector({ allowed: ['image/*'] })
    ],
    storage: new LocalStorage({
      destination: './uploads',
      namingStrategy: 'timestamp'
    }),

    onFinish: (results) => {
      res.json({ file: results.files[0] });
    },

    onError: (error) => {
      res.status(400).json({ error: error.message });
    }
  });
});
```

### Benefits After Migration

1. **Zero Dependencies**: Removed 7+ dependencies (if using multer + multer-s3)
2. **Better Security**: Magic byte detection prevents file type spoofing
3. **Observability**: Built-in logging, metrics, and progress tracking
4. **TypeScript**: Full type safety without @types packages
5. **Production Ready**: Health checks, clustering, monitoring out of the box

## Need Help?

- Check [RECIPES.md](RECIPES.md) for common patterns
- See [examples/](examples/) for working code
- Read [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues
- Open an issue on GitHub

Happy migrating! 🚀
