/**
 * Observability Module
 *
 * Comprehensive monitoring and observability tools for FluxUpload:
 * - Structured logging
 * - Metrics collection (Prometheus-compatible)
 * - Progress tracking
 * - Health checks
 *
 * @module observability
 */

const { Logger, getLogger, configure: configureLogger } = require('./Logger');
const { MetricsCollector, getCollector, Counter, Gauge, Histogram } = require('./MetricsCollector');
const { ProgressTracker, ProgressStream } = require('./ProgressTracker');
const { HealthCheck, HealthCheckResult } = require('./HealthCheck');

module.exports = {
  // Logger
  Logger,
  getLogger,
  configureLogger,

  // Metrics
  MetricsCollector,
  getCollector,
  Counter,
  Gauge,
  Histogram,

  // Progress
  ProgressTracker,
  ProgressStream,

  // Health
  HealthCheck,
  HealthCheckResult
};
