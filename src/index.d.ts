/**
 * FluxUpload - TypeScript Definitions
 *
 * Zero-dependency file upload package for Node.js
 * @version 1.0.0
 */

/// <reference types="node" />

import { IncomingMessage } from 'http';
import { Readable, Writable, Transform } from 'stream';

// ============================================================================
// Core Types
// ============================================================================

export interface FileInfo {
  fieldName: string;
  filename: string;
  mimeType: string;
  encoding?: string;
}

export interface UploadMetadata {
  hash?: string;
  hashAlgorithm?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  detectedMimeType?: string;
  compressed?: boolean;
  compressionAlgorithm?: string;
  originalFilename?: string;
  compressedFilename?: string;
  [key: string]: any;
}

export interface UploadContext {
  stream: Readable;
  fileInfo: FileInfo;
  metadata: UploadMetadata;
}

export interface StorageResult {
  driver: string;
  [key: string]: any;
}

export interface UploadResult {
  fields: { [key: string]: string | string[] };
  files: Array<{
    fieldName: string;
    filename: string;
    mimeType: string;
    detectedMimeType?: string;
    hash?: string;
    hashAlgorithm?: string;
    dimensions?: { width: number; height: number };
    size?: number;
    path?: string;
    url?: string;
    [key: string]: any;
  }>;
}

export interface Limits {
  fileSize?: number;
  files?: number;
  fields?: number;
  fieldSize?: number;
  fieldNameSize?: number;
}

// ============================================================================
// Main API
// ============================================================================

export interface FluxUploadConfig {
  limits?: Limits;
  validators?: Plugin[];
  transformers?: Plugin[];
  storage: Plugin | Plugin[];
  onField?: (name: string, value: string) => void;
  onFile?: (file: any) => void;
  onError?: (error: Error) => void;
  onFinish?: (result: UploadResult) => void;
}

export class FluxUpload {
  constructor(config: FluxUploadConfig);

  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  handle(req: IncomingMessage): Promise<UploadResult>;
  parseBuffer(buffer: Buffer, fileInfo: FileInfo): Promise<any>;
}

// ============================================================================
// Plugin System
// ============================================================================

export class Plugin {
  constructor(config?: any);

  process(context: UploadContext): Promise<UploadContext | any>;
  cleanup(context: UploadContext, error: Error): Promise<void>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  validateConfig(): void;
}

export class PipelineManager {
  constructor(options: {
    validators?: Plugin[];
    transformers?: Plugin[];
    storage: Plugin;
  });

  execute(sourceStream: Readable, fileInfo: FileInfo): Promise<any>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

export class StreamMultiplexer {
  static split(sourceStream: Readable, count: number): Readable[];
  static executeParallel(
    sourceStream: Readable,
    storagePlugins: Plugin[],
    context: UploadContext
  ): Promise<any[]>;
}

// ============================================================================
// Validators
// ============================================================================

export interface QuotaLimiterConfig {
  maxFileSize?: number;
  maxTotalSize?: number;
}

export class QuotaLimiter extends Plugin {
  constructor(config: QuotaLimiterConfig);
  reset(): void;
}

export interface MagicByteDetectorConfig {
  allowed?: string[];
  denied?: string[];
  bytesToRead?: number;
}

export class MagicByteDetector extends Plugin {
  constructor(config: MagicByteDetectorConfig);
}

export interface ImageDimensionProbeConfig {
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  bytesToRead?: number;
}

export class ImageDimensionProbe extends Plugin {
  constructor(config?: ImageDimensionProbeConfig);
}

// ============================================================================
// Transformers
// ============================================================================

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';
export type HashEncoding = 'hex' | 'base64' | 'base64url';

export interface StreamHasherConfig {
  algorithm?: HashAlgorithm;
  encoding?: HashEncoding;
}

export class StreamHasher extends Plugin {
  constructor(config?: StreamHasherConfig);
}

export type CompressionAlgorithm = 'gzip' | 'deflate' | 'brotli';

export interface StreamCompressorConfig {
  algorithm?: CompressionAlgorithm;
  level?: number;
  compressibleTypes?: string[];
}

export class StreamCompressor extends Plugin {
  constructor(config?: StreamCompressorConfig);
}

// ============================================================================
// Storage
// ============================================================================

export type NamingStrategy = 'original' | 'uuid' | 'timestamp' | 'hash' | 'slugify';

export interface FileNamingConfig {
  strategy?: NamingStrategy;
  prefix?: string;
  suffix?: string;
  preserveExtension?: boolean;
  maxLength?: number;
}

export interface LocalStorageConfig {
  destination: string;
  naming?: NamingStrategy | FileNamingConfig | FileNaming;
  createDirectories?: boolean;
  fileMode?: number;
  dirMode?: number;
}

export class LocalStorage extends Plugin {
  constructor(config: LocalStorageConfig);

  delete(filename: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
  getMetadata(filename: string): Promise<{
    size: number;
    created: Date;
    modified: Date;
    path: string;
  }>;
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  endpoint?: string;
  prefix?: string;
  naming?: NamingStrategy | FileNamingConfig | FileNaming;
  metadata?: { [key: string]: string };
  acl?: string;
  storageClass?: string;
}

export class S3Storage extends Plugin {
  constructor(config: S3StorageConfig);

  generatePresignedUrl(key: string, options?: {
    expiresIn?: number;
    contentType?: string;
  }): string;
}

// ============================================================================
// Utilities
// ============================================================================

export class FileNaming {
  constructor(config?: FileNamingConfig);

  generate(originalFilename: string, metadata?: UploadMetadata): string;

  static isSafe(filename: string): boolean;
}

export interface MimeDetectionResult {
  mime: string;
  extensions: string[];
}

export class MimeDetector {
  detect(buffer: Buffer): MimeDetectionResult | null;
  isAllowed(detectedMime: string, allowedMimes: string[]): boolean;
}

export interface AwsSignatureV4Config {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service?: string;
}

export interface SignRequest {
  method: string;
  url: string;
  headers: { [key: string]: string };
  body?: string | Buffer;
  date?: Date;
}

export interface PresignOptions {
  method: string;
  url: string;
  expiresIn?: number;
}

export class AwsSignatureV4 {
  constructor(config: AwsSignatureV4Config);

  sign(request: SignRequest): { [key: string]: string };
  presign(options: PresignOptions): string;
}

export class BoundaryScanner {
  constructor(boundary: Buffer);

  scan(chunk: Buffer): {
    parts: Array<{ data: Buffer; boundaryIndex: number }>;
    emitData: Buffer | null;
    carryover: Buffer;
  };

  flush(): Buffer;
  reset(): void;
}

// ============================================================================
// Multipart Parser
// ============================================================================

export interface MultipartParserOptions {
  boundary: string;
  limits?: Limits;
}

export class MultipartParser extends Writable {
  constructor(options: MultipartParserOptions);

  static getBoundary(contentType: string): string;

  on(event: 'field', listener: (name: string, value: string) => void): this;
  on(event: 'file', listener: (fileInfo: FileInfo, stream: Readable) => void): this;
  on(event: 'finish', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'limit', listener: (type: string, limit: number) => void): this;
  on(event: string, listener: Function): this;
}

// ============================================================================
// Observability - Logging
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogFormat = 'json' | 'text';

export interface LoggerConfig {
  level?: LogLevel;
  format?: LogFormat;
  destination?: Writable;
  baseContext?: { [key: string]: any };
  timestamp?: boolean;
  pretty?: boolean;
}

export interface LogContext {
  [key: string]: any;
}

export class Logger {
  constructor(config?: LoggerConfig);

  child(context: LogContext): Logger;
  generateRequestId(): string;
  startRequest(requestId: string, metadata?: LogContext): void;
  endRequest(requestId: string, result?: LogContext): void;
  time(label: string): (metadata?: LogContext) => number;

  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;

  getStats(): {
    activeRequests: number;
    level: string;
    format: string;
  };
}

export function getLogger(config?: LoggerConfig): Logger;
export function configure(config: LoggerConfig): Logger;

// ============================================================================
// Observability - Metrics
// ============================================================================

export interface MetricLabels {
  [key: string]: string | number;
}

export class Counter {
  constructor(name: string, help: string);

  inc(labels?: MetricLabels, value?: number): void;
  get(labels?: MetricLabels): number;
  reset(): void;
  toPrometheus(): string;
}

export class Gauge {
  constructor(name: string, help: string);

  set(labels: MetricLabels, value: number): void;
  inc(labels?: MetricLabels, value?: number): void;
  dec(labels?: MetricLabels, value?: number): void;
  get(labels?: MetricLabels): number;
  reset(): void;
  toPrometheus(): string;
}

export class Histogram {
  constructor(name: string, help: string, buckets?: number[]);

  observe(labels: MetricLabels, value: number): void;
  reset(): void;
  toPrometheus(): string;
}

export class MetricsCollector {
  constructor();

  registerCounter(name: string, help: string): Counter;
  registerGauge(name: string, help: string): Gauge;
  registerHistogram(name: string, help: string, buckets?: number[]): Histogram;
  getMetric(name: string): Counter | Gauge | Histogram | undefined;

  recordUploadStart(metadata?: MetricLabels): number;
  recordUploadComplete(startTime: number, metadata?: MetricLabels): void;
  recordUploadFailure(startTime: number, metadata?: MetricLabels): void;
  recordBytesUploaded(bytes: number, metadata?: MetricLabels): void;
  recordPluginExecution(pluginName: string, duration: number, metadata?: MetricLabels): void;
  recordFieldParsed(metadata?: MetricLabels): void;
  recordFileParsed(metadata?: MetricLabels): void;
  recordStorageWrite(duration: number, metadata?: MetricLabels): void;

  toPrometheus(): string;
  toJSON(): { [key: string]: any };
  reset(): void;
}

export function getCollector(): MetricsCollector;

// ============================================================================
// Observability - Progress Tracking
// ============================================================================

export interface ProgressStreamConfig {
  fileId?: string;
  filename?: string;
  totalBytes?: number;
  emitInterval?: number;
  tracker?: ProgressTracker;
}

export interface ProgressData {
  fileId: string;
  filename: string;
  bytesProcessed: number;
  totalBytes: number;
  percentage: number;
  bytesPerSecond: number;
  elapsed: number;
  estimatedTimeRemaining: number;
  timestamp: string;
}

export class ProgressStream extends Transform {
  constructor(config: ProgressStreamConfig);
}

export interface ProgressTrackerConfig {
  emitInterval?: number;
  maxCompletedHistory?: number;
}

export interface UploadStatistics {
  active: {
    count: number;
    totalBytes: number;
  };
  completed: {
    count: number;
    successCount: number;
    errorCount: number;
    totalBytes: number;
    successRate: number;
  };
  overall: {
    totalUploads: number;
    totalBytes: number;
  };
}

export class ProgressTracker {
  constructor(config?: ProgressTrackerConfig);

  createProgressStream(options: ProgressStreamConfig): ProgressStream;
  getProgress(fileId: string): ProgressData | null;
  getActiveUploads(): ProgressData[];
  getCompletedUploads(): ProgressData[];
  getStatistics(): UploadStatistics;
  clearHistory(): void;

  on(event: 'started', listener: (progress: ProgressData) => void): this;
  on(event: 'progress', listener: (progress: ProgressData) => void): this;
  on(event: 'completed', listener: (progress: ProgressData) => void): this;
  on(event: 'error', listener: (progress: ProgressData & { error: any }) => void): this;
  on(event: string, listener: Function): this;
}

// ============================================================================
// Observability - Health Checks
// ============================================================================

export type HealthStatus = 'pass' | 'fail' | 'warn';

export interface HealthCheckDetails {
  [key: string]: any;
}

export class HealthCheckResult {
  constructor(name: string, status: HealthStatus, details?: HealthCheckDetails);

  name: string;
  status: HealthStatus;
  details: HealthCheckDetails;
  timestamp: string;

  toJSON(): {
    name: string;
    status: HealthStatus;
    timestamp: string;
    [key: string]: any;
  };
}

export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  checks: {
    [name: string]: {
      name: string;
      status: HealthStatus;
      timestamp: string;
      [key: string]: any;
    };
  };
}

export interface LivenessResponse {
  status: 'pass';
  timestamp: string;
  uptime: number;
}

export interface ReadinessResponse {
  status: HealthStatus;
  timestamp: string;
  ready: boolean;
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

export class HealthCheck {
  constructor();

  register(name: string, checkFn: HealthCheckFunction): void;
  registerStorageCheck(path: string): void;
  registerS3Check(s3Storage: S3Storage): void;

  runCheck(name: string): Promise<HealthCheckResult>;
  check(): Promise<HealthCheckResponse>;
  liveness(): Promise<LivenessResponse>;
  readiness(): Promise<ReadinessResponse>;
}

// ============================================================================
// Validators - Rate Limiting
// ============================================================================

export interface RateLimitInfo {
  key: string;
  limit: number;
  windowMs: number;
  waitTime: number;
  tokensRemaining: number;
}

export type RateLimitHandler = (
  context: UploadContext,
  info: RateLimitInfo
) => void | never;

export type RateLimitKeyGenerator = (context: UploadContext) => string;

export interface RateLimiterConfig {
  maxRequests?: number;
  windowMs?: number;
  keyGenerator?: RateLimitKeyGenerator;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  handler?: RateLimitHandler;
  cleanupInterval?: number;
}

export interface RateLimitStatus {
  requests: number;
  remaining: number;
  limit: number;
  resetTime: number;
}

export class RateLimiter extends Plugin {
  constructor(config?: RateLimiterConfig);

  getStatus(key: string): RateLimitStatus;
  reset(key: string): void;
  getStats(): {
    activeBuckets: number;
    maxRequests: number;
    windowMs: number;
    refillRate: number;
  };
}

// ============================================================================
// Security - CSRF Protection
// ============================================================================

export interface CsrfProtectionConfig {
  tokenLength?: number;
  tokenLifetime?: number;
  cookieName?: string;
  headerName?: string;
  getToken?: (req: any) => string | null;
  validateToken?: (req: any, token: string) => boolean | Promise<boolean>;
  doubleSubmitCookie?: boolean;
}

export interface TokenOptions {
  sessionId?: string;
}

export interface VerifyOptions {
  oneTime?: boolean;
  sessionId?: string;
}

export class CsrfProtection extends Plugin {
  constructor(config?: CsrfProtectionConfig);

  generateToken(options?: TokenOptions): string;
  verifyToken(token: string, options?: VerifyOptions): boolean;
  revokeToken(token: string): void;
  clearTokens(): void;
  getStats(): {
    activeTokens: number;
    tokenLifetime: number;
    doubleSubmitCookie: boolean;
  };
}

// ============================================================================
// Security - Signed URLs
// ============================================================================

export interface SignedUrlOptions {
  expiresIn?: number;
  maxFileSize?: number;
  allowedTypes?: string[];
  maxFiles?: number;
  userId?: string;
  metadata?: { [key: string]: any };
}

export interface SignedUrlConstraints {
  maxFileSize?: number;
  maxFiles?: number;
  allowedTypes?: string[];
  userId?: string;
  expires: Date;
}

export interface SignedUrlValidation {
  valid: boolean;
  error?: string;
  constraints?: SignedUrlConstraints;
  metadata?: { [key: string]: any };
  expiresAt?: Date;
  timeRemaining?: number;
  expiredAt?: Date;
}

export interface SignedUrlsConfig {
  secret: string;
  defaultExpiry?: number;
  algorithm?: string;
}

export class SignedUrls {
  constructor(config: SignedUrlsConfig);

  sign(baseUrl: string, options?: SignedUrlOptions): string;
  validate(url: string, options?: { preventReplay?: boolean }): SignedUrlValidation;
  createValidator(options?: any): Plugin;
  shutdown(): void;
  getStats(): {
    usedSignatures: number;
    defaultExpiry: number;
    algorithm: string;
  };
}

// ============================================================================
// Observability Namespace
// ============================================================================

export namespace observability {
  export {
    Logger,
    getLogger,
    configure as configureLogger,
    MetricsCollector,
    getCollector,
    Counter,
    Gauge,
    Histogram,
    ProgressTracker,
    ProgressStream,
    HealthCheck,
    HealthCheckResult
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default FluxUpload;
