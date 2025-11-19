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
// Default Export
// ============================================================================

export default FluxUpload;
