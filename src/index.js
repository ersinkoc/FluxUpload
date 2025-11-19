/**
 * FluxUpload - Zero-dependency file upload for Node.js
 *
 * Main exports for the package
 */

// Core
const FluxUpload = require('./FluxUpload');
const Plugin = require('./core/Plugin');
const MultipartParser = require('./core/MultipartParser');
const { PipelineManager, StreamMultiplexer } = require('./core/PipelineManager');

// Validators
const QuotaLimiter = require('./plugins/validators/QuotaLimiter');
const MagicByteDetector = require('./plugins/validators/MagicByteDetector');
const ImageDimensionProbe = require('./plugins/validators/ImageDimensionProbe');

// Transformers
const StreamHasher = require('./plugins/transformers/StreamHasher');
const StreamCompressor = require('./plugins/transformers/StreamCompressor');

// Storage
const LocalStorage = require('./storage/LocalStorage');
const S3Storage = require('./storage/S3Storage');

// Utilities
const FileNaming = require('./utils/FileNaming');
const MimeDetector = require('./utils/MimeDetector');
const AwsSignatureV4 = require('./utils/AwsSignatureV4');

// Export main class as default
module.exports = FluxUpload;

// Export everything as named exports
module.exports.FluxUpload = FluxUpload;

// Core
module.exports.Plugin = Plugin;
module.exports.MultipartParser = MultipartParser;
module.exports.PipelineManager = PipelineManager;
module.exports.StreamMultiplexer = StreamMultiplexer;

// Validators
module.exports.QuotaLimiter = QuotaLimiter;
module.exports.MagicByteDetector = MagicByteDetector;
module.exports.ImageDimensionProbe = ImageDimensionProbe;

// Transformers
module.exports.StreamHasher = StreamHasher;
module.exports.StreamCompressor = StreamCompressor;

// Storage
module.exports.LocalStorage = LocalStorage;
module.exports.S3Storage = S3Storage;

// Utilities
module.exports.FileNaming = FileNaming;
module.exports.MimeDetector = MimeDetector;
module.exports.AwsSignatureV4 = AwsSignatureV4;
