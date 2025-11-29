# Changelog

All notable changes to FluxUpload will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-30

### Added

- Official documentation website at [fluxupload.oxog.dev](https://fluxupload.oxog.dev)
- GitHub Pages deployment workflow
- Comprehensive API reference documentation
- Interactive code examples on website

### Changed

- Minimum Node.js version bumped to 14.0.0
- Improved PipelineManager with Promise.race pattern for better stream error handling
- SignedUrls now uses Map with expiry-based cleanup (more efficient memory usage)
- MimeDetector DOCX/XLSX verification now checks actual content markers
- S3Storage health check now performs real connectivity test

### Fixed

- Fixed async Promise anti-pattern in PipelineManager
- Fixed stream error propagation in StreamHasher, ImageDimensionProbe, MagicByteDetector
- Fixed potential DoS via S3 response body size (added MAX_RESPONSE_BODY_SIZE limit)
- Fixed decodeURIComponent crash in CsrfProtection cookie parsing
- Fixed QuotaLimiter unhandled error event
- Replaced all console.log/error with proper Logger usage

### Security

- Added S3 response body size limit to prevent memory exhaustion
- Improved MIME type detection for Office documents
- Better error handling prevents information leakage

### Removed

- Removed unnecessary documentation files (API.md, ARCHITECTURE.md, etc.)
- Documentation now lives on the website

## [1.0.0] - 2025-01-19

### Initial Release

- Initial release of FluxUpload
- Zero-dependency file upload package for Node.js
- Stream-first architecture with constant memory usage
- Micro-kernel plugin-based design

#### Core Features

- **MultipartParser**: RFC 7578 compliant multipart/form-data parser
- **PipelineManager**: Plugin orchestration system
- **StreamMultiplexer**: Upload to multiple destinations simultaneously

#### Built-in Validators

- **QuotaLimiter**: File size limits with immediate abort
- **MagicByteDetector**: File type verification via magic bytes
- **ImageDimensionProbe**: Extract image dimensions from headers
- **RateLimiter**: Token bucket rate limiting
- **CsrfProtection**: CSRF token validation

#### Built-in Transformers

- **StreamHasher**: Calculate checksums (MD5, SHA256, etc.)
- **StreamCompressor**: Gzip/Brotli compression

#### Storage Drivers

- **LocalStorage**: Filesystem with atomic writes
- **S3Storage**: AWS S3 with manual Signature V4 (no aws-sdk)

---

## Release History

- **1.1.0** (2025-11-30): Documentation website, bug fixes, security improvements
- **1.0.0** (2025-01-19): Initial release

---

**FluxUpload** - Zero dependencies. Maximum control.

[Website](https://fluxupload.oxog.dev) · [GitHub](https://github.com/ersinkoc/fluxupload)
