/**
 * Health Check System
 *
 * Provides health check endpoints for monitoring and load balancers.
 * Checks various system components and returns health status.
 *
 * Features:
 * - Liveness probe (is the service running?)
 * - Readiness probe (can the service accept traffic?)
 * - Detailed health checks for dependencies
 * - Configurable health check functions
 *
 * @module observability/HealthCheck
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { promisify } = require('util');

const stat = promisify(fs.stat);
const access = promisify(fs.access);

/**
 * Health Check Result
 */
class HealthCheckResult {
  constructor(name, status, details = {}) {
    this.name = name;
    this.status = status; // 'pass', 'fail', 'warn'
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      ...this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Health Check System
 */
class HealthCheck {
  constructor() {
    this.checks = new Map();
    this.startTime = Date.now();
    this._registerDefaultChecks();
  }

  /**
   * Register default health checks
   *
   * @private
   */
  _registerDefaultChecks() {
    // Uptime check
    this.register('uptime', async () => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      return new HealthCheckResult('uptime', 'pass', {
        uptime,
        uptimeHuman: this._formatUptime(uptime)
      });
    });

    // Memory check
    this.register('memory', async () => {
      const usage = process.memoryUsage();
      const totalMem = require('os').totalmem();
      const freeMem = require('os').freemem();
      const usedMem = totalMem - freeMem;
      const memoryPercentage = (usedMem / totalMem) * 100;

      const status = memoryPercentage > 90 ? 'warn' : 'pass';

      return new HealthCheckResult('memory', status, {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        systemMemoryPercentage: Math.round(memoryPercentage * 100) / 100,
        unit: 'MB'
      });
    });

    // Event loop lag check
    this.register('eventloop', async () => {
      const start = Date.now();
      await new Promise(resolve => setImmediate(resolve));
      const lag = Date.now() - start;

      const status = lag > 100 ? 'warn' : 'pass';

      return new HealthCheckResult('eventloop', status, {
        lag,
        unit: 'ms'
      });
    });
  }

  /**
   * Register a health check
   *
   * @param {string} name - Check name
   * @param {Function} checkFn - Async function that returns HealthCheckResult
   */
  register(name, checkFn) {
    this.checks.set(name, checkFn);
  }

  /**
   * Register storage health check
   *
   * @param {string} path - Path to check
   */
  registerStorageCheck(path) {
    this.register('storage', async () => {
      try {
        await access(path, fs.constants.W_OK);
        const stats = await stat(path);

        return new HealthCheckResult('storage', 'pass', {
          path,
          writable: true,
          isDirectory: stats.isDirectory()
        });
      } catch (error) {
        return new HealthCheckResult('storage', 'fail', {
          path,
          error: error.message
        });
      }
    });
  }

  /**
   * Register S3 connectivity check
   *
   * @param {Object} s3Storage - S3Storage instance
   */
  registerS3Check(s3Storage) {
    this.register('s3', async () => {
      try {
        // Check configuration first
        const configured = !!(
          s3Storage.bucket &&
          s3Storage.region &&
          s3Storage.signer
        );

        if (!configured) {
          return new HealthCheckResult('s3', 'fail', {
            error: 'S3 not properly configured'
          });
        }

        // Actually test S3 connectivity with a HEAD request to the bucket
        const connectivityResult = await this._testS3Connectivity(s3Storage);

        if (!connectivityResult.success) {
          return new HealthCheckResult('s3', 'fail', {
            bucket: s3Storage.bucket,
            region: s3Storage.region,
            error: connectivityResult.error,
            latency: connectivityResult.latency
          });
        }

        return new HealthCheckResult('s3', 'pass', {
          bucket: s3Storage.bucket,
          region: s3Storage.region,
          latency: connectivityResult.latency
        });
      } catch (error) {
        return new HealthCheckResult('s3', 'fail', {
          error: error.message
        });
      }
    });
  }

  /**
   * Test S3 connectivity by making a HEAD request to the bucket
   *
   * @private
   * @param {Object} s3Storage - S3Storage instance
   * @returns {Promise<Object>} - { success: boolean, latency: number, error?: string }
   */
  async _testS3Connectivity(s3Storage) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const timeout = 5000; // 5 second timeout for health check

      // Build URL for HEAD bucket request
      let url;
      if (s3Storage.endpoint) {
        const endpoint = s3Storage.endpoint.replace(/\/$/, '');
        url = `${endpoint}/${s3Storage.bucket}/`;
      } else {
        url = `https://${s3Storage.bucket}.s3.${s3Storage.region}.amazonaws.com/`;
      }

      // Sign the request
      const signedHeaders = s3Storage.signer.sign({
        method: 'HEAD',
        url: url,
        headers: {}
      });

      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const requestOptions = {
        method: 'HEAD',
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        headers: signedHeaders,
        timeout: timeout
      };

      const req = client.request(requestOptions, (res) => {
        const latency = Date.now() - startTime;

        // S3 returns 200 for bucket exists, 403 for no access, 404 for not exists
        if (res.statusCode === 200 || res.statusCode === 403) {
          // 403 means bucket exists but we may not have ListBucket permission
          // This is still a successful connectivity test
          resolve({ success: true, latency });
        } else if (res.statusCode === 404) {
          resolve({ success: false, latency, error: 'Bucket not found' });
        } else {
          resolve({ success: false, latency, error: `HTTP ${res.statusCode}` });
        }
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, latency: timeout, error: 'Connection timeout' });
      });

      req.on('error', (err) => {
        const latency = Date.now() - startTime;
        resolve({ success: false, latency, error: err.message });
      });

      req.end();
    });
  }

  /**
   * Run a single health check
   *
   * @param {string} name - Check name
   * @returns {HealthCheckResult} Check result
   */
  async runCheck(name) {
    const checkFn = this.checks.get(name);
    if (!checkFn) {
      return new HealthCheckResult(name, 'fail', {
        error: 'Check not found'
      });
    }

    try {
      return await checkFn();
    } catch (error) {
      return new HealthCheckResult(name, 'fail', {
        error: error.message
      });
    }
  }

  /**
   * Run all health checks
   *
   * @returns {Object} Overall health status
   */
  async check() {
    const results = {};
    const checks = [];

    for (const name of this.checks.keys()) {
      checks.push(
        this.runCheck(name).then(result => {
          results[name] = result.toJSON();
        })
      );
    }

    await Promise.all(checks);

    // Determine overall status
    const statuses = Object.values(results).map(r => r.status);
    const hasFail = statuses.includes('fail');
    const hasWarn = statuses.includes('warn');

    let overallStatus = 'pass';
    if (hasFail) overallStatus = 'fail';
    else if (hasWarn) overallStatus = 'warn';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results
    };
  }

  /**
   * Liveness probe - is the service alive?
   *
   * @returns {Object} Liveness status
   */
  async liveness() {
    return {
      status: 'pass',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }

  /**
   * Readiness probe - can the service accept traffic?
   *
   * @returns {Object} Readiness status
   */
  async readiness() {
    const health = await this.check();

    // Service is ready if no checks failed
    const ready = health.status !== 'fail';

    return {
      status: ready ? 'pass' : 'fail',
      timestamp: new Date().toISOString(),
      ready
    };
  }

  /**
   * Format uptime in human-readable format
   *
   * @private
   */
  _formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
  }
}

module.exports = {
  HealthCheck,
  HealthCheckResult
};
