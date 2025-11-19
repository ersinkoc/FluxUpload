# Security Policy

## Supported Versions

We actively support the following versions of FluxUpload with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Features

FluxUpload is built with security as a core principle. The following security features are built-in:

### File Type Validation

**Magic Byte Detection** - Never trust file extensions or `Content-Type` headers:

```javascript
const { MagicByteDetector } = require('fluxupload');

new MagicByteDetector({
  allowed: ['image/jpeg', 'image/png']
})
```

This prevents attacks where malicious files are uploaded with spoofed extensions (e.g., `malware.exe` renamed to `photo.jpg`).

### DDOS Protection

**Quota Limits** - Prevent resource exhaustion:

```javascript
const { QuotaLimiter } = require('fluxupload');

new QuotaLimiter({
  maxFileSize: 10 * 1024 * 1024,
  maxTotalSize: 50 * 1024 * 1024
})
```

Streams are immediately aborted when limits are exceeded, preventing memory exhaustion attacks.

### Rate Limiting

**Request Rate Limiting** - Prevent abuse:

```javascript
const { RateLimiter } = require('fluxupload');

new RateLimiter({
  maxRequests: 100,
  windowMs: 60000  // per minute
})
```

### CSRF Protection

**Token-based CSRF validation**:

```javascript
const { CsrfProtection } = require('fluxupload');

new CsrfProtection({
  secret: process.env.CSRF_SECRET,
  tokenLength: 32
})
```

### Signed URLs

**HMAC-signed upload URLs** with expiration:

```javascript
const { SignedUrls } = require('fluxupload');

const signer = new SignedUrls({
  secret: process.env.URL_SIGNING_SECRET
});

const signedUrl = signer.sign('/upload', {
  expiresIn: 3600,
  maxFileSize: 10 * 1024 * 1024
});
```

### Atomic File Operations

- Files are written to temporary locations first
- Atomic rename operations prevent partial writes
- Automatic cleanup on failure
- No partially written files visible to application

### Path Traversal Prevention

- All file paths are sanitized
- Directory traversal attempts are blocked
- Filenames are validated and sanitized

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### 1. **DO NOT** Create a Public Issue

Please **do not** create a public GitHub issue for security vulnerabilities. This could put users at risk.

### 2. Report Privately

Report security vulnerabilities through one of these methods:

#### Option A: GitHub Security Advisories (Preferred)

1. Go to the [Security Advisories](https://github.com/yourusername/fluxupload/security/advisories) page
2. Click "Report a vulnerability"
3. Fill out the form with details

#### Option B: Email

Send an email to: **security@fluxupload.dev** (or your security contact email)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any proof-of-concept code (if applicable)
- Your contact information for follow-up

### 3. What to Include in Your Report

Please provide as much information as possible:

```
**Summary**: Brief description of the vulnerability

**Severity**: [Critical/High/Medium/Low]

**Affected Versions**: Which versions are affected?

**Attack Vector**: How can this vulnerability be exploited?

**Impact**: What can an attacker accomplish?

**Proof of Concept**:
```javascript
// Code demonstrating the vulnerability
```

**Suggested Fix**: If you have ideas on how to fix it

**Disclosure Timeline**: When do you plan to disclose publicly?
```

### 4. Response Timeline

We are committed to the following response times:

| Severity  | Initial Response | Status Update | Fix Timeline |
|-----------|-----------------|---------------|--------------|
| Critical  | 24 hours        | Every 48h     | 7 days       |
| High      | 48 hours        | Weekly        | 30 days      |
| Medium    | 5 days          | Bi-weekly     | 60 days      |
| Low       | 7 days          | Monthly       | 90 days      |

### 5. Disclosure Policy

We follow a **coordinated disclosure** approach:

1. **Acknowledgment**: We'll acknowledge your report within the timeline above
2. **Investigation**: We'll investigate and validate the vulnerability
3. **Fix Development**: We'll develop and test a fix
4. **Security Advisory**: We'll prepare a security advisory
5. **Release**: We'll release a patched version
6. **Public Disclosure**: We'll publicly disclose 7-14 days after the patch is released

We request that you:
- Give us reasonable time to address the issue before public disclosure
- Make a good faith effort to avoid privacy violations and service disruption
- Do not exploit the vulnerability beyond what's necessary to demonstrate it

### 6. Recognition

We maintain a security hall of fame to recognize security researchers who responsibly disclose vulnerabilities:

- Your name (or handle) will be listed in our SECURITY.md
- Credit in the security advisory and release notes
- A thank you in the CHANGELOG.md

If you prefer to remain anonymous, we will respect that.

## Security Best Practices for Users

### Environment Variables

**Never hardcode secrets in your code:**

```javascript
// ❌ BAD
new S3Storage({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
})

// ✅ GOOD
new S3Storage({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})
```

Use `.env` files and keep them out of version control:

```bash
# .env
AWS_ACCESS_KEY_ID=your_key_here
AWS_SECRET_ACCESS_KEY=your_secret_here
CSRF_SECRET=your_csrf_secret_here
URL_SIGNING_SECRET=your_signing_secret_here
```

```javascript
// .gitignore
.env
.env.local
.env.*.local
```

### File Upload Security Checklist

- [ ] **Validate file types** using `MagicByteDetector`, not just extensions
- [ ] **Enforce size limits** using `QuotaLimiter`
- [ ] **Use rate limiting** with `RateLimiter`
- [ ] **Validate image dimensions** with `ImageDimensionProbe` if applicable
- [ ] **Implement CSRF protection** for public-facing uploads
- [ ] **Use signed URLs** for time-limited upload permissions
- [ ] **Sanitize filenames** (built-in with naming strategies)
- [ ] **Store uploads outside web root** (e.g., `./uploads` not `./public/uploads`)
- [ ] **Use authentication** to restrict who can upload
- [ ] **Scan for malware** if handling untrusted files (use custom validator)
- [ ] **Log all upload attempts** for audit trails
- [ ] **Monitor metrics** for unusual activity

### Production Deployment

```javascript
// Secure production configuration
const uploader = new FluxUpload({
  validators: [
    // Size limits
    new QuotaLimiter({
      maxFileSize: 10 * 1024 * 1024,
      maxTotalSize: 50 * 1024 * 1024
    }),

    // Rate limiting
    new RateLimiter({
      maxRequests: 100,
      windowMs: 60000,
      keyGenerator: (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress
    }),

    // CSRF protection
    new CsrfProtection({
      secret: process.env.CSRF_SECRET
    }),

    // File type validation
    new MagicByteDetector({
      allowed: ['image/jpeg', 'image/png', 'application/pdf']
    }),

    // Image dimension limits
    new ImageDimensionProbe({
      maxWidth: 4096,
      maxHeight: 4096
    })
  ],

  // Hash files for integrity
  transformers: [
    new StreamHasher({ algorithm: 'sha256' })
  ],

  storage: new S3Storage({
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    acl: 'private'  // Never use 'public-read' unless absolutely necessary
  })
});
```

### Monitoring for Security Events

Enable logging to detect suspicious activity:

```javascript
const { getLogger } = require('fluxupload');

const logger = getLogger({
  level: 'info',
  format: 'json'
});

// Logs will include:
// - Failed upload attempts
// - Rate limit violations
// - File type mismatches
// - Quota exceeded events
// - CSRF validation failures
```

Monitor these metrics for anomalies:

- Sudden spikes in upload rate
- Repeated quota exceeded errors from same IP
- High rate of CSRF validation failures
- Unusual file type distribution

### Secure Headers

When serving uploaded files, use appropriate headers:

```javascript
app.get('/uploads/:filename', (req, res) => {
  // Prevent execution of uploaded files
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment');

  // Serve file
});
```

## Known Security Considerations

### Zero Dependencies = Zero Known Vulnerabilities from Dependencies

FluxUpload has **zero runtime dependencies**, which means:
- No risk of supply chain attacks through compromised npm packages
- No transitive dependency vulnerabilities
- Smaller attack surface
- Complete control over all code execution

### Manual AWS Signature V4

FluxUpload implements AWS Signature V4 manually without `aws-sdk`. This:
- Reduces dependencies
- Has been carefully implemented and tested
- Is regularly audited for correctness

### Stream-Based Processing

All file processing is stream-based, which:
- Prevents memory exhaustion (constant O(1) memory usage)
- Makes DDOS attacks harder
- Allows immediate abortion of oversized uploads

## Security Updates

Subscribe to security updates:

1. **Watch** this repository on GitHub
2. Enable **"Releases only"** notifications
3. Check the [Security Advisories](https://github.com/yourusername/fluxupload/security/advisories) page

Security updates are released as:
- Patch versions (1.0.x) for non-breaking security fixes
- Clearly marked in CHANGELOG.md with `[SECURITY]` prefix
- Accompanied by a security advisory

## Security Hall of Fame

We thank the following security researchers for responsibly disclosing vulnerabilities:

<!-- List will be populated as vulnerabilities are reported and fixed -->

*No vulnerabilities have been reported yet.*

---

**Questions about security?** Email: security@fluxupload.dev

**Thank you for helping keep FluxUpload secure!** 🔒
