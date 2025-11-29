# Code Review Report

## 📊 Executive Summary
- **Overall Quality Score:** 6.5/10
- **Deployment Status:** ⚠️ With Risks
- **Brief Overview:** FluxUpload is an ambitious zero-dependency file upload library with solid architecture and streaming-first design. However, critical race conditions, security vulnerabilities in CSRF protection, and error handling flaws must be addressed before production deployment. The codebase demonstrates good separation of concerns and plugin architecture, but several edge cases and security hardening opportunities exist.

## 🚨 Critical & High Priority Issues

### **[CRITICAL] Race Condition in QuotaLimiter Error Handling**
  - **File:** `src/plugins/validators/QuotaLimiter.js` (Lines: 41-74)
  - **Problem:** The `process()` method returns a Promise that resolves immediately (line 72) BEFORE the stream has finished processing. Error handlers attached to `limiterStream` (lines 48, 51-59) will fire asynchronously AFTER the promise has already resolved. This means quota violations that occur during streaming will not reject the promise, causing the upload to appear successful even when it should fail.
  - **Consequence:** Files exceeding size limits could be partially written to storage without the caller knowing. This defeats the purpose of DDOS protection and can lead to storage exhaustion attacks. An attacker could upload multiple oversized files that all appear to "succeed" initially.
  - **Recommendation:** The promise should only resolve when the stream completes or errors. Refactor to return the modified context synchronously without wrapping in Promise, or wait for stream completion before resolving. Validators should mutate `context.stream` and return the context immediately, letting the PipelineManager handle stream completion.

### **[CRITICAL] CSRF Token Exposure via Query String**
  - **File:** `src/plugins/validators/CsrfProtection.js` (Lines: 182-184)
  - **Problem:** The default token getter accepts CSRF tokens from the query string (`?csrf_token=...`). Query parameters are logged in server logs, proxy logs, browser history, and referrer headers. This violates CSRF token security best practices.
  - **Consequence:** CSRF tokens become persistently exposed in multiple logging systems and browser history. An attacker who gains access to logs or browser history can extract valid CSRF tokens and perform CSRF attacks. This completely defeats the purpose of CSRF protection.
  - **Recommendation:** Remove query string token extraction entirely. Only accept tokens from headers (`X-CSRF-Token`) or request body. Document this as a breaking security requirement. Add explicit warnings in documentation against passing tokens in URLs.

### **[CRITICAL] AWS S3 Integrity Bypass with UNSIGNED-PAYLOAD**
  - **File:** `src/storage/S3Storage.js` (Lines: 176-183)
  - **Problem:** The S3 upload uses `x-amz-content-sha256: UNSIGNED-PAYLOAD` for streaming uploads. While AWS allows this for streaming, it means AWS S3 cannot verify payload integrity. A man-in-the-middle attacker could modify the upload data in transit without AWS detecting the tampering.
  - **Consequence:** Data integrity cannot be guaranteed. If an attacker intercepts the HTTPS connection (via compromised certificate, corporate proxy, or other MITM), they can modify uploaded file content without detection. For sensitive applications (medical records, legal documents, financial data), this is unacceptable.
  - **Recommendation:** For security-critical applications, implement chunked upload with payload signatures, or compute the full SHA256 hash before upload (requires buffering or two-pass streaming). Document this limitation prominently. For large file streaming, consider AWS S3 Multipart Upload API which supports per-chunk signatures.

### **[CRITICAL] Parser State Machine Hang on Malformed Headers**
  - **File:** `src/core/MultipartParser.js` (Lines: 256-262)
  - **Problem:** The `_parseHeaders()` method returns early if it doesn't find double CRLF (`\r\n\r\n`), leaving the parser in `HEADER` state indefinitely. If a malicious client sends headers without proper termination, the parser accumulates data in `headerBuffer` without ever transitioning to `BODY` state.
  - **Consequence:** Memory exhaustion DOS attack. An attacker sends infinite header data without `\r\n\r\n`, causing `headerBuffer` to grow unbounded (line 181). The parser never rejects the request, consuming all available memory and crashing the server.
  - **Recommendation:** Implement maximum header size limit (e.g., 8KB). Check `headerBuffer.length` in `_handleBodyData()` when state is `HEADER` and throw error if exceeded. Add timeout mechanism to detect stalled parsing states.

### **[CRITICAL] Multiple Concurrent Error Handlers Without Locking**
  - **File:** `src/core/PipelineManager.js` (Lines: 68-74)
  - **Problem:** The `errorHandler` function checks `rejected` flag but multiple async errors can race. If two streams error simultaneously, both can see `rejected === false` before either sets it to `true`. This causes `_cleanup()` to run multiple times and `rejectPromise()` to be called multiple times.
  - **Consequence:** Cleanup logic may execute twice, potentially causing file system errors (deleting same temp file twice), double-billing on cloud storage deletions, or promise rejection errors. In high-concurrency scenarios with stream multiplexing, this becomes likely.
  - **Recommendation:** Use atomic compare-and-swap pattern. Replace boolean flag with: `if (rejected) return; rejected = true;` is insufficient. Better: use a Promise-based lock or ensure the cleanup and reject operations are idempotent. Consider wrapping critical section in try-catch to handle double-rejection gracefully.

### **[CRITICAL] Resource Leak from setInterval in Constructor**
  - **File:** `src/plugins/validators/CsrfProtection.js` (Lines: 46-48)
  - **Problem:** The constructor starts a `setInterval()` that runs every minute to cleanup tokens. If the plugin is instantiated but never properly initialized or shutdown (e.g., during testing, or if initialization fails), this interval continues forever, preventing garbage collection of the plugin instance.
  - **Consequence:** Memory leak in long-running processes. Each time a new `CsrfProtection` instance is created without proper shutdown (common in test suites or dynamic plugin loading), a new interval timer leaks. In applications that frequently reload configuration, this accumulates.
  - **Recommendation:** Move interval setup to `initialize()` method instead of constructor. This ensures intervals are only created when plugin is actively used and pairs naturally with `shutdown()` cleanup. Store interval ID and defensively clear in shutdown even if null.

### **[HIGH] Missing Request Validation Causes TypeError**
  - **File:** `src/plugins/validators/CsrfProtection.js` (Lines: 54-60)
  - **Problem:** Multiple validators require `context.request` to function (CsrfProtection line 55, RateLimiter line 176). However, not all code paths populate this field. The `parseBuffer()` method (FluxUpload.js:306-316) creates a context without `request`, causing TypeErrors if CSRF or RateLimiter validators are configured.
  - **Consequence:** Application crashes with unhelpful `Cannot read property 'headers' of undefined` when using certain feature combinations. This creates a foot-gun API where valid-looking configurations silently fail.
  - **Recommendation:** Make `context.request` optional with proper null checks. Validators should gracefully skip or throw meaningful errors like "CsrfProtection requires HTTP request context, not available in buffer parsing mode." Document which plugins require request context vs work without it.

### **[HIGH] Unbounded Memory Growth in Token/Bucket Storage**
  - **File:** `src/plugins/validators/CsrfProtection.js` (Lines: 43, 99-104)
  - **File:** `src/plugins/validators/RateLimiter.js` (Lines: 109, 130-132)
  - **Problem:** Both plugins use `Map()` to store tokens/buckets without maximum size limits. Cleanup is periodic (every 60 seconds for CSRF, on-demand for rate limiter) but an attacker can create millions of unique identifiers faster than cleanup runs.
  - **Consequence:** Slow memory exhaustion attack. An attacker sends requests with unique session IDs or from rotating IP addresses, filling the Maps faster than cleanup. In distributed systems without sticky sessions, every request from different IPs creates new buckets. Over hours/days, memory grows to gigabytes.
  - **Recommendation:** Implement LRU cache with maximum size (e.g., 10,000 entries). Use a library like QuickLRU pattern or implement simple LRU with linked list. Alternatively, use external storage (Redis) for production deployments with shared state across instances.

### **[HIGH] Path Traversal in S3 Key Generation**
  - **File:** `src/storage/S3Storage.js` (Lines: 82-88)
  - **File:** `src/utils/FileNaming.js` (Lines: 107-123)
  - **Problem:** Even though `FileNaming._sanitize()` removes path separators (line 112), the S3Storage combines `prefix` with filename using string concatenation (line 88: `${this.prefix}/${filename}`). If `prefix` comes from user input or contains `..`, path traversal is possible. The `encodeURIComponent()` in `_buildUrl()` (line 295) happens AFTER key construction.
  - **Consequence:** If application allows user-controlled prefix (e.g., per-tenant folders), an attacker with prefix = `../../` could escape intended bucket structure and overwrite protected objects or access other tenants' data in S3.
  - **Recommendation:** Validate and sanitize `prefix` during S3Storage construction. Use `path.join()` with normalization instead of string concatenation. Explicitly check that final key doesn't contain `..` after joining. Consider making prefix a static configuration, not runtime parameter.

### **[HIGH] Header Injection in AWS Signature**
  - **File:** `src/utils/AwsSignatureV4.js` (Lines: 67-76, 136-142)
  - **Problem:** Headers from `request.headers` are merged directly into canonical headers without sanitization (line 70). If application passes user-controlled headers, an attacker could inject headers containing newlines (`\r\n`) to manipulate canonical request string or add malicious headers.
  - **Consequence:** AWS signature bypass or header smuggling. An attacker injects a header like `X-Custom: foo\r\nAuthorization: AWS4-HMAC-SHA256 ...` to potentially override authorization. While AWS signature would fail, it may cause unexpected behavior or information disclosure in logging systems.
  - **Recommendation:** Validate and sanitize all header values before signing. Strip control characters (`\x00-\x1F`) and ensure no `\r\n` sequences exist. The `trim()` on line 139 is insufficient. Use whitelist approach: only allow known-safe headers into signing process.

### **[HIGH] Boundary Scanner Buffer Confusion**
  - **File:** `src/utils/BoundaryScanner.js` (Lines: 32-76)
  - **Problem:** The scanner maintains `carryover` buffer across chunks to handle split boundaries. However, if a malicious client sends a boundary-like sequence that's exactly `boundaryLength - 1` bytes repeated, the carryover grows on every chunk without ever emitting data. The `keepSize` calculation (line 59) caps at `boundaryLength - 1` per chunk, but accumulated over many chunks this can grow.
  - **Consequence:** Subtle memory exhaustion. An attacker crafts chunks where each ends with N-1 bytes of the boundary prefix, causing carryover to accumulate. While slower than header attack, it's harder to detect.
  - **Recommendation:** Limit total carryover size to `boundaryLength - 1` strictly. Assert `newCarryover.length <= this.boundaryLength - 1` and throw error if violated. Add explicit bounds checking. Current code should already prevent this but defensive validation is warranted.

## 🛠️ Medium & Low Priority Issues

### **[MEDIUM] Inconsistent Error Handling in Pipeline**
  - **File:** `src/core/FluxUpload.js` (Lines: 162-177, 180-185)
  - **Details:** Error handlers are attached to stream (line 162), to filePromise (line 170), and to parser (lines 180, 210). If a stream errors, it may be handled 2-3 times through different paths. While the code tries to deduplicate via `this.errors.push()`, the error callback `this.onError` can fire multiple times for the same error.

### **[MEDIUM] Missing Content-Type Validation**
  - **File:** `src/core/FluxUpload.js` (Lines: 141-144)
  - **Details:** Code checks for `multipart/form-data` but doesn't validate the boundary format before extracting it. A malicious `Content-Type: multipart/form-data; boundary=` (empty boundary) passes the check but causes parser to initialize with empty boundary, leading to undefined behavior.

### **[MEDIUM] No Upload Timeout Mechanism**
  - **File:** `src/core/FluxUpload.js` (Lines: 128-217)
  - **Details:** Slow-loris style attacks are possible. An attacker sends data at 1 byte per second, keeping the upload active indefinitely. No timeout mechanism exists to abort stalled uploads. In production, this exhausts connection pools.

### **[MEDIUM] Stream Multiplexer Error Propagation**
  - **File:** `src/core/PipelineManager.js` (Lines: 232-243)
  - **Details:** When splitting streams to multiple storage targets, if one storage fails, the source stream errors propagate to all outputs (line 238-240). However, if one output stream errors independently, it doesn't abort the source or other outputs. This can lead to inconsistent state where upload succeeds to S3 but fails to local storage.

### **[MEDIUM] Magic Byte Detection Insufficient Buffer**
  - **File:** `src/plugins/validators/MagicByteDetector.js` (Lines: 32-34)
  - **Details:** Default `bytesToRead` is 16 bytes, but some formats need more for reliable detection (e.g., some ZIP variants, Office documents). This can cause false negatives where valid files are rejected as "unknown type."

### **[MEDIUM] Image Dimension Integer Overflow**
  - **File:** `src/plugins/validators/ImageDimensionProbe.js` (Lines: 182-183, 207-209)
  - **Details:** JPEG/PNG parsers use `readUInt16BE/readUInt32BE` but don't validate maximum values. A malformed image with dimensions 0xFFFFFFFF (4 billion pixels) passes dimension checks if `maxWidth` is Infinity. This could be used to bypass validation or cause integer overflow in downstream processing.

### **[MEDIUM] CSRF Double Submit Cookie Timing Attack**
  - **File:** `src/plugins/validators/CsrfProtection.js` (Lines: 196-199)
  - **Details:** The double-submit cookie validation uses simple string comparison (line 199) which is vulnerable to timing attacks. An attacker can use timing differences to guess valid tokens character by character.

### **[MEDIUM] Incomplete Temp File Cleanup**
  - **File:** `src/storage/LocalStorage.js` (Lines: 85-87, 130-145)
  - **Details:** Temp files are tracked per-context in Map (line 86). If server crashes during upload, temp files remain on disk. No startup cleanup to remove orphaned `.tmp` files. Over time, failed uploads accumulate disk space.

### **[MEDIUM] S3 Endpoint Validation Missing**
  - **File:** `src/storage/S3Storage.js` (Lines: 51, 291-295)
  - **Details:** Custom S3 endpoint is used without validation (line 51). An attacker who controls S3Storage configuration could set endpoint to attacker-controlled server and exfiltrate all uploaded files. While this requires configuration access, it's a privilege escalation vector.

### **[MEDIUM] Rate Limiter IP Spoofing**
  - **File:** `src/plugins/validators/RateLimiter.js` (Lines: 180-182)
  - **Details:** Default key generator trusts `X-Forwarded-For` header (line 181) without validation. An attacker can send arbitrary `X-Forwarded-For` values to bypass rate limiting by rotating IP addresses. Should validate against known proxy IPs or use rightmost trusted IP.

### **[LOW] Magic Number in ByteCounterStream**
  - **File:** `src/plugins/validators/QuotaLimiter.js` (Lines: 87-114)
  - **Details:** The stream emits 'bytes' event but nothing consumes it except in QuotaLimiter's test for total size. This is a code smell indicating potential for memory leaks if event listeners accumulate.

### **[LOW] Boundary Scanner indexOf Abstraction Leak**
  - **File:** `src/utils/BoundaryScanner.js` (Lines: 96-112)
  - **Details:** Comment claims "zero dependency" and mentions implementing Boyer-Moore, but then uses native `Buffer.indexOf()` (line 111). This is misleading documentation. Either implement the algorithm or remove the comment.

### **[LOW] Hardcoded Buffer Sizes**
  - **File:** `src/plugins/validators/ImageDimensionProbe.js` (Lines: 41, 112)
  - **Details:** Magic number 8192 appears twice (lines 41, 112). Should be a named constant for maintainability.

### **[LOW] Missing JSDoc Parameter Types**
  - **File:** `src/core/Plugin.js` (Lines: 28-36)
  - **Details:** JSDoc describes context shape but doesn't use @typedef. This makes IDE autocomplete less effective. Should define Context type once and reference it.

### **[LOW] Console.log in Production Code**
  - **File:** `src/core/PipelineManager.js` (Line: 166)
  - **File:** `src/plugins/validators/CsrfProtection.js` (Line: 257)
  - **Details:** Direct console.error/console.log calls instead of using the Logger module. Inconsistent with the library's observability features. Should use structured logging.

### **[LOW] Promise Anti-pattern in QuotaLimiter**
  - **File:** `src/plugins/validators/QuotaLimiter.js` (Lines: 42-73)
  - **Details:** Creating explicit Promise with executor when async/await would be clearer. The Promise wrapping doesn't add value since we could just mutate context and return synchronously.

## 💡 Architectural & Performance Insights

### **Architecture Strengths**
- **Excellent Plugin Pattern:** The micro-kernel architecture with validators/transformers/storage separation is well-designed and follows SOLID principles (Open/Closed, Dependency Inversion). New features can be added without modifying core code.
- **Stream-First Design:** Proper use of Node.js streams for memory efficiency. The backpressure handling through native streams is correct and production-ready.
- **Zero Dependencies Achievement:** Successfully implements complex features (multipart parsing, AWS signatures, magic byte detection) without external dependencies. This reduces supply chain risk significantly.

### **Architecture Weaknesses**
- **Context Object Mutation:** The pattern where validators mutate `context.stream` in place is error-prone. Some validators return new context (MagicByteDetector line 73-76), others mutate in place (QuotaLimiter line 69). This inconsistency causes the bugs mentioned above.
- **Error Handling Inconsistency:** Three different error handling patterns exist: throw, promise rejection, and event emission. This makes it hard to reason about error propagation through the pipeline.
- **Missing Lifecycle Hooks:** No `onStart`, `onProgress`, or `onAbort` hooks for fine-grained control. Applications needing detailed progress tracking must rely on ProgressTracker which is separate from the main upload flow.

### **Performance Observations**

1. **O(n) Boundary Scanning:** The `BoundaryScanner._indexOf()` using native `Buffer.indexOf()` is optimized by V8 but still O(n*m) worst case. For large uploads with many parts, this could be noticeable. Consider implementing Boyer-Moore-Horspool for O(n) average case.

2. **Memory Allocation in Header Parsing:** `MultipartParser._handleBodyData()` concatenates buffers on line 181 (`Buffer.concat([this.headerBuffer, data])`). For multipart requests with many small parts, this causes frequent large buffer allocations. Consider using a growing buffer pool or pre-allocated circular buffer.

3. **Stream Multiplexing Overhead:** `StreamMultiplexer.split()` (PipelineManager.js:224-243) uses PassThrough streams which add event loop overhead. For high-throughput scenarios (thousands of small files per second), this could become a bottleneck. Consider native stream piping when possible.

4. **Map Iteration in Cleanup:** CSRF token cleanup (CsrfProtection.js:245-258) iterates entire Map every minute. For 10,000 tokens, this is O(n) every 60 seconds. Consider using a priority queue or timestamp-bucketed approach for O(1) amortized cleanup.

5. **No Connection Pooling:** S3Storage creates new HTTPS connections per upload (S3Storage.js:201). For burst uploads, this causes TCP handshake overhead. Consider using `http.Agent` with connection pooling (keepAlive: true).

### **Scalability Concerns**

1. **Stateful CSRF/Rate Limiting:** In-memory Maps don't scale horizontally. In Kubernetes/multi-instance deployments, each pod has independent state. A user could bypass rate limits by hitting different pods. Needs Redis/external state store for production.

2. **No Graceful Shutdown:** The `shutdown()` methods exist but `FluxUpload.handle()` doesn't respect shutdown state. During rolling deployments, in-flight uploads could be aborted incorrectly. Need to track active uploads and reject new ones during shutdown.

3. **Synchronous Crypto Operations:** AWS signature calculation (AwsSignatureV4.js) uses synchronous `crypto.createHash()` and `crypto.createHmac()`. Under high load, this blocks the event loop. Consider using `crypto.webcrypto` async APIs for Node 15+.

## 🔍 Security Audit

### **Status:** Vulnerable

### **Audit Notes:**

**Authentication & Authorization:**
- ❌ No built-in authentication. Relies on application to protect endpoints.
- ⚠️ CSRF protection exists but has critical flaws (query string exposure).
- ✅ S3 signature implementation appears correct (modulo UNSIGNED-PAYLOAD issue).
- ❌ No role-based access control for multi-tenant scenarios.

**Input Validation:**
- ✅ File type validation via magic bytes is security-conscious.
- ✅ Path traversal protection in FileNaming is solid.
- ⚠️ Content-Type header validation is weak (missing boundary validation).
- ❌ No validation of file metadata fields (fieldName, filename) for length or content.
- ❌ Missing validation on custom header values in AWS signing.

**Injection Attacks:**
- ✅ No SQL injection risk (no database).
- ✅ No XSS risk in file handling itself (URL encoding in LocalStorage._generateUrl).
- ⚠️ Potential header injection in AWS signatures if headers come from untrusted source.
- ✅ Command injection prevented (no shell execution).

**Denial of Service:**
- ⚠️ Partial protection via QuotaLimiter, but critical bugs make it ineffective.
- ❌ No request timeout mechanism.
- ❌ Unbounded header buffer in MultipartParser.
- ❌ Unbounded Maps in CSRF/RateLimiter plugins.
- ⚠️ Rate limiting exists but vulnerable to IP spoofing.

**Data Exposure:**
- ✅ No sensitive data in logs by default.
- ❌ CSRF tokens exposed via query strings and logs.
- ⚠️ Generated URLs in LocalStorage might expose internal paths.
- ✅ S3 URLs respect ACL settings.

**Cryptography:**
- ✅ Uses crypto.randomBytes for UUID/token generation (cryptographically secure).
- ❌ CSRF token comparison vulnerable to timing attacks.
- ✅ AWS signature implementation matches spec.
- ⚠️ No integrity verification for S3 uploads (UNSIGNED-PAYLOAD).

**Dependency Security:**
- ✅ Zero runtime dependencies = minimal supply chain risk.
- ✅ DevDependencies (multer, busboy, formidable) only used for benchmarks.
- ⚠️ Single dependency 'sharp' in package.json - why is this here if zero-dependency? Check if actually used.

**OWASP Top 10 (2021) Assessment:**
1. **A01 Broken Access Control:** ⚠️ No built-in access control, application's responsibility
2. **A02 Cryptographic Failures:** ❌ CSRF timing attack, UNSIGNED-PAYLOAD issue
3. **A03 Injection:** ✅ Well-protected against common injection attacks
4. **A04 Insecure Design:** ⚠️ Error handling design has race conditions
5. **A05 Security Misconfiguration:** ⚠️ Defaults could be more secure (e.g., CSRF should require header-only by default)
6. **A06 Vulnerable Components:** ✅ No vulnerable dependencies (zero dependencies)
7. **A07 Identification/Authentication Failures:** ⚠️ CSRF implementation has flaws
8. **A08 Software and Data Integrity Failures:** ❌ No integrity checks on S3 uploads
9. **A09 Security Logging Failures:** ✅ Good logging framework exists
10. **A10 Server-Side Request Forgery:** ⚠️ Custom S3 endpoints could enable SSRF if user-controlled

### **Recommendations for Security Hardening:**
1. Remove query string CSRF token support (breaking change, document clearly)
2. Implement request timeouts (default 5 minutes)
3. Add maximum header size validation (8KB limit)
4. Implement LRU caching for Maps with size limits (10,000 entries)
5. Use constant-time comparison for CSRF tokens
6. Add S3 endpoint validation (whitelist approach)
7. Implement graceful shutdown with in-flight tracking
8. Add X-Forwarded-For validation for rate limiter
9. Document security assumptions clearly (application must protect endpoints, validate user input, etc.)
10. Consider implementing signed S3 uploads (multipart with chunk signatures)

## 📝 Nitpicks & Style

### **Code Style**
- Inconsistent error creation: sometimes `new Error('message')`, sometimes with custom properties (`.code`, `.statusCode`). Should standardize on a custom Error class hierarchy.
- Magic numbers throughout (8192, 60000, 100, etc.) should be named constants at file or class level
- Some files use `async/await`, others use Promise chains, others use callbacks. While all valid, consistency aids readability.
- JSDoc comments are excellent in some files (AwsSignatureV4.js) but sparse in others (Plugin.js). Should standardize.

### **Naming Conventions**
- `_handleBodyData` vs `_parseHeaders` - inconsistent use of verb (handle vs parse)
- `ByteCounterStream` class is defined inside QuotaLimiter.js but could be reusable utility
- `PARSER_STATE` constant vs inline `PARSER_STATE.PREAMBLE` - good pattern, should apply to other state machines

### **Comments & Documentation**
- Excellent header comments explaining "why" and "how" (especially in MultipartParser.js, AwsSignatureV4.js)
- Some TODOs/FIXMEs in comments should be tracked as issues: "future enhancement" comments scattered in code
- ASCII art in README architecture diagram doesn't match actual code structure (shows linear pipeline but code supports parallel storage)

### **Testing Observations**
- Test files exist but haven't been reviewed deeply - positive sign
- Missing edge case tests for boundary spanning chunks
- Missing security-focused tests (malicious input, DOS attacks, timing attacks)

### **TypeScript Definitions**
- `src/index.d.ts` exists which is great
- Should be kept in sync with code changes (easy to forget)

---
*Review generated by AI Principal Engineer - FluxUpload Security Audit 2024*
