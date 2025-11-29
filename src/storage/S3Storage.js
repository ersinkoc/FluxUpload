/**
 * S3Storage - Upload files to S3-compatible storage
 *
 * Zero Dependency: Uses native https module and manual AWS Signature V4
 * No aws-sdk required!
 *
 * Features:
 * - Direct PUT upload (for files up to 5GB)
 * - Manual signature calculation
 * - Works with AWS S3, MinIO, DigitalOcean Spaces, etc.
 * - Automatic cleanup on failure
 *
 * Limitations:
 * - Single PUT (no multipart upload yet)
 * - Max 5GB file size (S3 limit for single PUT)
 *
 * For larger files, implement multipart upload (future enhancement).
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const Plugin = require('../core/Plugin');
const AwsSignatureV4 = require('../utils/AwsSignatureV4');
const FileNaming = require('../utils/FileNaming');
const { getLogger } = require('../observability/Logger');

// Max response body size to prevent DoS (1MB should be plenty for S3 error responses)
const MAX_RESPONSE_BODY_SIZE = 1024 * 1024;

class S3Storage extends Plugin {
  /**
   * @param {Object} config
   * @param {string} config.bucket - S3 bucket name
   * @param {string} config.region - AWS region (e.g., 'us-east-1')
   * @param {string} config.accessKeyId - AWS access key ID
   * @param {string} config.secretAccessKey - AWS secret access key
   * @param {string} config.sessionToken - Session token (optional)
   * @param {string} config.endpoint - Custom endpoint (optional, for S3-compatible services)
   * @param {string} config.prefix - Key prefix (folder path)
   * @param {string|Object} config.naming - Naming strategy
   * @param {Object} config.metadata - Custom metadata to add (x-amz-meta-*)
   * @param {string} config.acl - ACL (private, public-read, etc.)
   * @param {string} config.storageClass - Storage class (STANDARD, REDUCED_REDUNDANCY, etc.)
   */
  constructor(config) {
    super(config);

    if (!config.bucket || !config.region) {
      throw new Error('bucket and region are required for S3Storage');
    }

    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint || null;
    this.prefix = config.prefix || '';
    this.acl = config.acl || 'private';
    this.storageClass = config.storageClass || 'STANDARD';
    this.customMetadata = config.metadata || {};

    // Initialize AWS signer
    this.signer = new AwsSignatureV4({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
      region: this.region,
      service: 's3'
    });

    // Setup file naming
    if (config.naming instanceof FileNaming) {
      this.naming = config.naming;
    } else if (typeof config.naming === 'string') {
      this.naming = new FileNaming({ strategy: config.naming });
    } else if (typeof config.naming === 'object') {
      this.naming = new FileNaming(config.naming);
    } else {
      this.naming = new FileNaming({ strategy: 'uuid' });
    }

    // Track uploaded keys for cleanup
    this.uploadedKeys = new Map();
  }

  async process(context) {
    // Generate S3 key (filename)
    const filename = this.naming.generate(
      context.fileInfo.filename,
      context.metadata
    );

    const key = this.prefix ? `${this.prefix}/${filename}` : filename;

    // Track for cleanup
    this.uploadedKeys.set(context, key);

    try {
      // Upload to S3
      const result = await this._uploadToS3(
        key,
        context.stream,
        context.fileInfo.mimeType,
        context.metadata
      );

      // Remove from cleanup tracking (success)
      this.uploadedKeys.delete(context);

      return {
        ...context,
        storage: {
          driver: 's3',
          bucket: this.bucket,
          key: key,
          region: this.region,
          url: result.url,
          etag: result.etag
        }
      };

    } catch (error) {
      // Cleanup will be called by PipelineManager
      throw error;
    }
  }

  async cleanup(context, error) {
    // Get uploaded key
    const key = this.uploadedKeys.get(context);
    if (!key) return;

    // Delete from S3
    try {
      await this._deleteFromS3(key);
    } catch (err) {
      const logger = getLogger();
      logger.error('Failed to cleanup S3 object', { key, error: err.message });
    }

    this.uploadedKeys.delete(context);
  }

  /**
   * Upload stream to S3 using PUT
   *
   * @param {string} key - S3 object key
   * @param {stream.Readable} stream - File stream
   * @param {string} contentType - MIME type
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} - { url, etag }
   */
  async _uploadToS3(key, stream, contentType, metadata) {
    return new Promise((resolve, reject) => {
      // Build URL
      const url = this._buildUrl(key);

      // Prepare headers
      const headers = {
        'Content-Type': contentType || 'application/octet-stream',
        'x-amz-acl': this.acl,
        'x-amz-storage-class': this.storageClass
      };

      // Add custom metadata
      for (const [metaKey, metaValue] of Object.entries(this.customMetadata)) {
        headers[`x-amz-meta-${metaKey}`] = metaValue;
      }

      // Add metadata from context
      if (metadata.hash) {
        headers['x-amz-meta-hash'] = metadata.hash;
        headers['x-amz-meta-hash-algorithm'] = metadata.hashAlgorithm;
      }
      if (metadata.dimensions) {
        headers['x-amz-meta-width'] = metadata.dimensions.width.toString();
        headers['x-amz-meta-height'] = metadata.dimensions.height.toString();
      }

      // Sign request
      // Note: For streaming uploads, we use UNSIGNED-PAYLOAD
      // because we don't know the payload hash upfront
      const signedHeaders = this.signer.sign({
        method: 'PUT',
        url: url,
        headers: {
          ...headers,
          'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'
        }
      });

      // Parse URL
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      // Prepare request options
      const requestOptions = {
        method: 'PUT',
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: signedHeaders
      };

      // Create request
      const req = client.request(requestOptions, (res) => {
        const chunks = [];
        let totalSize = 0;

        res.on('data', (chunk) => {
          totalSize += chunk.length;
          // Limit response body size to prevent DoS
          if (totalSize <= MAX_RESPONSE_BODY_SIZE) {
            chunks.push(chunk);
          }
        });

        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');

          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Success
            const etag = res.headers['etag'];
            const publicUrl = this._buildPublicUrl(key);

            resolve({
              url: publicUrl,
              etag: etag ? etag.replace(/"/g, '') : null
            });
          } else {
            // Error
            const error = new Error(`S3 upload failed: ${res.statusCode} ${res.statusMessage}`);
            error.statusCode = res.statusCode;
            error.body = responseBody;
            reject(error);
          }
        });

        res.on('error', (err) => {
          reject(new Error(`S3 response error: ${err.message}`));
        });
      });

      req.on('error', (err) => {
        reject(new Error(`S3 request failed: ${err.message}`));
      });

      // Pipe stream to request
      stream.pipe(req);

      // Handle stream errors
      stream.on('error', (err) => {
        req.destroy();
        reject(err);
      });
    });
  }

  /**
   * Delete object from S3
   *
   * @param {string} key - S3 object key
   * @returns {Promise<void>}
   */
  async _deleteFromS3(key) {
    return new Promise((resolve, reject) => {
      const url = this._buildUrl(key);

      // Sign request
      const signedHeaders = this.signer.sign({
        method: 'DELETE',
        url: url,
        headers: {}
      });

      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const requestOptions = {
        method: 'DELETE',
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers: signedHeaders
      };

      const req = client.request(requestOptions, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`S3 delete failed: ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Build S3 URL for API requests
   *
   * @param {string} key - Object key
   * @returns {string}
   */
  _buildUrl(key) {
    if (this.endpoint) {
      // Custom endpoint (MinIO, DigitalOcean Spaces, etc.)
      const endpoint = this.endpoint.replace(/\/$/, ''); // Remove trailing slash
      return `${endpoint}/${this.bucket}/${encodeURIComponent(key)}`;
    } else {
      // Standard AWS S3
      // Use virtual-hosted-style URL
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(key)}`;
    }
  }

  /**
   * Build public URL for uploaded file
   *
   * @param {string} key - Object key
   * @returns {string}
   */
  _buildPublicUrl(key) {
    if (this.endpoint) {
      const endpoint = this.endpoint.replace(/\/$/, '');
      return `${endpoint}/${this.bucket}/${encodeURIComponent(key)}`;
    } else {
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(key)}`;
    }
  }

  /**
   * Generate presigned URL for direct browser upload
   *
   * @param {string} key - Object key
   * @param {Object} options
   * @param {number} options.expiresIn - Expiration in seconds
   * @param {string} options.contentType - Content type
   * @returns {string} - Presigned URL
   */
  generatePresignedUrl(key, options = {}) {
    const url = this._buildUrl(key);

    return this.signer.presign({
      method: 'PUT',
      url: url,
      expiresIn: options.expiresIn || 3600
    });
  }
}

module.exports = S3Storage;
