/**
 * AwsSignatureV4 - AWS Signature Version 4 signing
 *
 * Zero Dependency: Manual implementation of AWS Signature V4
 * Uses only native crypto module.
 *
 * This is the authentication mechanism for AWS services (S3, etc.)
 *
 * References:
 * - https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
 * - https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 *
 * Algorithm:
 * 1. Create canonical request (method, URI, headers, payload hash)
 * 2. Create string to sign (timestamp, credential scope, canonical hash)
 * 3. Calculate signing key (derived from secret key)
 * 4. Sign the string
 * 5. Add Authorization header
 */

const crypto = require('crypto');

class AwsSignatureV4 {
  /**
   * @param {Object} config
   * @param {string} config.accessKeyId - AWS access key ID
   * @param {string} config.secretAccessKey - AWS secret access key
   * @param {string} config.sessionToken - AWS session token (optional, for temporary credentials)
   * @param {string} config.region - AWS region (e.g., 'us-east-1')
   * @param {string} config.service - AWS service (e.g., 's3')
   */
  constructor(config) {
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.sessionToken = config.sessionToken;
    this.region = config.region;
    this.service = config.service || 's3';

    if (!this.accessKeyId || !this.secretAccessKey || !this.region) {
      throw new Error('accessKeyId, secretAccessKey, and region are required');
    }
  }

  /**
   * Sign an HTTP request
   *
   * @param {Object} request
   * @param {string} request.method - HTTP method (GET, PUT, POST, etc.)
   * @param {string} request.url - Full URL
   * @param {Object} request.headers - HTTP headers
   * @param {string|Buffer} request.body - Request body (for payload hash)
   * @param {Date} request.date - Request date (optional, defaults to now)
   * @returns {Object} - Signed headers to add to request
   */
  sign(request) {
    const now = request.date || new Date();
    const amzDate = this._getAmzDate(now);
    const dateStamp = this._getDateStamp(now);

    // Parse URL
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname || '/';
    const query = url.search.slice(1); // Remove leading '?'

    // Prepare headers
    const headers = {
      'host': host,
      'x-amz-date': amzDate,
      ...request.headers
    };

    // Add session token if present (temporary credentials)
    if (this.sessionToken) {
      headers['x-amz-security-token'] = this.sessionToken;
    }

    // Calculate payload hash
    const payloadHash = this._hash(request.body || '');
    headers['x-amz-content-sha256'] = payloadHash;

    // Step 1: Create canonical request
    const canonicalRequest = this._createCanonicalRequest(
      request.method,
      path,
      query,
      headers,
      payloadHash
    );

    // Step 2: Create string to sign
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = this._createStringToSign(
      amzDate,
      credentialScope,
      canonicalRequest
    );

    // Step 3: Calculate signing key
    const signingKey = this._getSigningKey(dateStamp);

    // Step 4: Calculate signature
    const signature = this._hmac(signingKey, stringToSign).toString('hex');

    // Step 5: Create authorization header
    const signedHeaders = Object.keys(headers).sort().join(';');
    const authorizationHeader = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(', ');

    headers['authorization'] = authorizationHeader;

    return headers;
  }

  /**
   * Step 1: Create canonical request
   *
   * Format:
   * HTTPMethod\n
   * CanonicalURI\n
   * CanonicalQueryString\n
   * CanonicalHeaders\n
   * SignedHeaders\n
   * HashedPayload
   */
  _createCanonicalRequest(method, path, query, headers, payloadHash) {
    // Canonical URI (encode path)
    const canonicalUri = this._encodePath(path);

    // Canonical query string (sort parameters)
    const canonicalQuery = this._canonicalizeQuery(query);

    // Canonical headers (lowercase, sort, trim)
    const headerKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
    const canonicalHeaders = headerKeys
      .map(key => `${key}:${headers[key].toString().trim()}`)
      .join('\n') + '\n';

    const signedHeaders = headerKeys.join(';');

    return [
      method.toUpperCase(),
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
  }

  /**
   * Step 2: Create string to sign
   *
   * Format:
   * Algorithm\n
   * RequestDateTime\n
   * CredentialScope\n
   * HashedCanonicalRequest
   */
  _createStringToSign(amzDate, credentialScope, canonicalRequest) {
    const hashedRequest = this._hash(canonicalRequest);

    return [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      hashedRequest
    ].join('\n');
  }

  /**
   * Step 3: Calculate signing key
   *
   * DerivedKey = HMAC(HMAC(HMAC(HMAC("AWS4" + SecretKey, Date), Region), Service), "aws4_request")
   */
  _getSigningKey(dateStamp) {
    const kDate = this._hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = this._hmac(kDate, this.region);
    const kService = this._hmac(kRegion, this.service);
    const kSigning = this._hmac(kService, 'aws4_request');

    return kSigning;
  }

  /**
   * Canonicalize query string
   *
   * @param {string} query - Query string (without leading '?')
   * @returns {string}
   */
  _canonicalizeQuery(query) {
    if (!query) return '';

    // Parse query parameters
    const params = [];
    for (const pair of query.split('&')) {
      const [key, value] = pair.split('=');
      params.push({
        key: this._encodeURIComponent(decodeURIComponent(key)),
        value: this._encodeURIComponent(decodeURIComponent(value || ''))
      });
    }

    // Sort by key, then by value
    params.sort((a, b) => {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      if (a.value < b.value) return -1;
      if (a.value > b.value) return 1;
      return 0;
    });

    return params.map(p => `${p.key}=${p.value}`).join('&');
  }

  /**
   * Encode path per RFC 3986
   *
   * @param {string} path
   * @returns {string}
   */
  _encodePath(path) {
    return path.split('/').map(segment => {
      return this._encodeURIComponent(segment);
    }).join('/');
  }

  /**
   * RFC 3986 URI encoding
   *
   * @param {string} str
   * @returns {string}
   */
  _encodeURIComponent(str) {
    return encodeURIComponent(str)
      .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }

  /**
   * SHA256 hash
   *
   * @param {string|Buffer} data
   * @returns {string} - Hex string
   */
  _hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * HMAC-SHA256
   *
   * @param {string|Buffer} key
   * @param {string} data
   * @returns {Buffer}
   */
  _hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  /**
   * Get AMZ date format: YYYYMMDDTHHMMSSZ
   *
   * @param {Date} date
   * @returns {string}
   */
  _getAmzDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  /**
   * Get date stamp: YYYYMMDD
   *
   * @param {Date} date
   * @returns {string}
   */
  _getDateStamp(date) {
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  /**
   * Generate presigned URL (for browser uploads)
   *
   * @param {Object} options
   * @param {string} options.method - HTTP method
   * @param {string} options.url - Full URL
   * @param {number} options.expiresIn - Expiration time in seconds
   * @returns {string} - Presigned URL
   */
  presign(options) {
    const now = new Date();
    const amzDate = this._getAmzDate(now);
    const dateStamp = this._getDateStamp(now);
    const expiresIn = options.expiresIn || 3600; // 1 hour default

    const url = new URL(options.url);
    const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;

    // Add query parameters
    const params = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': 'host'
    };

    if (this.sessionToken) {
      params['X-Amz-Security-Token'] = this.sessionToken;
    }

    // Add params to URL
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }

    // Create canonical request
    const canonicalRequest = this._createCanonicalRequest(
      options.method,
      url.pathname,
      url.search.slice(1),
      { 'host': url.hostname },
      'UNSIGNED-PAYLOAD'
    );

    // String to sign
    const stringToSign = this._createStringToSign(
      amzDate,
      credentialScope,
      canonicalRequest
    );

    // Sign
    const signingKey = this._getSigningKey(dateStamp);
    const signature = this._hmac(signingKey, stringToSign).toString('hex');

    // Add signature to URL
    url.searchParams.append('X-Amz-Signature', signature);

    return url.toString();
  }
}

module.exports = AwsSignatureV4;
