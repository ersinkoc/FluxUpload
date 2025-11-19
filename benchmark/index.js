#!/usr/bin/env node
/**
 * FluxUpload Benchmarking Suite
 *
 * Compares performance with other upload libraries
 *
 * Note: This requires optional dependencies for comparison
 * Install with: npm install --save-dev multer busboy formidable
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { performance } = require('perf_hooks');

// Test file sizes (in MB)
const TEST_SIZES = [1, 10, 50, 100];
const UPLOAD_DIR = path.join(__dirname, 'tmp');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================================================
// Test File Generator
// ============================================================================

function generateTestFile(sizeMB) {
  const filename = path.join(UPLOAD_DIR, `test-${sizeMB}mb.bin`);

  if (fs.existsSync(filename)) {
    return filename;
  }

  console.log(`Generating ${sizeMB}MB test file...`);

  const chunkSize = 1024 * 1024; // 1MB chunks
  const chunks = sizeMB;
  const stream = fs.createWriteStream(filename);

  for (let i = 0; i < chunks; i++) {
    const buffer = Buffer.alloc(chunkSize);
    // Fill with random data
    for (let j = 0; j < chunkSize; j += 4) {
      buffer.writeUInt32BE(Math.random() * 0xFFFFFFFF, j);
    }
    stream.write(buffer);
  }

  stream.end();

  return new Promise((resolve) => {
    stream.on('finish', () => resolve(filename));
  });
}

// ============================================================================
// Memory Tracking
// ============================================================================

class MemoryTracker {
  constructor() {
    this.start = process.memoryUsage();
    this.peak = { ...this.start };
    this.interval = null;
  }

  startTracking() {
    this.interval = setInterval(() => {
      const current = process.memoryUsage();
      if (current.heapUsed > this.peak.heapUsed) {
        this.peak = current;
      }
    }, 10);
  }

  stopTracking() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    const end = process.memoryUsage();

    return {
      start: this.formatMemory(this.start.heapUsed),
      peak: this.formatMemory(this.peak.heapUsed),
      end: this.formatMemory(end.heapUsed),
      increase: this.formatMemory(this.peak.heapUsed - this.start.heapUsed)
    };
  }

  formatMemory(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}

// ============================================================================
// FluxUpload Benchmark
// ============================================================================

async function benchmarkFluxUpload(fileSize) {
  const FluxUpload = require('../src');
  const { LocalStorage } = require('../src');

  const uploader = new FluxUpload({
    storage: new LocalStorage({
      destination: path.join(UPLOAD_DIR, 'fluxupload'),
      naming: 'uuid'
    })
  });

  await uploader.initialize();

  return async (req) => {
    const tracker = new MemoryTracker();
    tracker.startTracking();

    const start = performance.now();

    try {
      await uploader.handle(req);
      const duration = performance.now() - start;
      const memory = tracker.stopTracking();

      return { duration, memory, success: true };
    } catch (error) {
      return { error: error.message, success: false };
    }
  };
}

// ============================================================================
// Multer Benchmark (if available)
// ============================================================================

async function benchmarkMulter(fileSize) {
  try {
    const multer = require('multer');

    // Create multer upload directory
    const multerDir = path.join(UPLOAD_DIR, 'multer');
    if (!fs.existsSync(multerDir)) {
      fs.mkdirSync(multerDir, { recursive: true });
    }

    const upload = multer({
      dest: multerDir
    });

    const middleware = upload.single('file');

    return async (req) => {
      const tracker = new MemoryTracker();
      tracker.startTracking();

      const start = performance.now();

      return new Promise((resolve) => {
        const res = { status: () => res, send: () => {} };

        middleware(req, res, (err) => {
          const duration = performance.now() - start;
          const memory = tracker.stopTracking();

          if (err) {
            resolve({ error: err.message, success: false });
          } else {
            resolve({ duration, memory, success: true });
          }
        });
      });
    };
  } catch (err) {
    return null; // Multer not installed
  }
}

// ============================================================================
// Busboy Benchmark (if available)
// ============================================================================

async function benchmarkBusboy(fileSize) {
  try {
    const Busboy = require('busboy');

    // Create busboy upload directory
    const busboyDir = path.join(UPLOAD_DIR, 'busboy');
    if (!fs.existsSync(busboyDir)) {
      fs.mkdirSync(busboyDir, { recursive: true });
    }

    return async (req) => {
      const tracker = new MemoryTracker();
      tracker.startTracking();

      const start = performance.now();

      return new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });

        busboy.on('file', (fieldname, file, info) => {
          // Busboy v1.0+ API: info object contains filename, encoding, mimeType
          const filename = info.filename || 'upload';
          const outputPath = path.join(busboyDir, filename);
          const writeStream = fs.createWriteStream(outputPath);

          file.pipe(writeStream);

          writeStream.on('error', (err) => {
            resolve({ error: err.message, success: false });
          });
        });

        busboy.on('finish', () => {
          const duration = performance.now() - start;
          const memory = tracker.stopTracking();
          resolve({ duration, memory, success: true });
        });

        busboy.on('error', (err) => {
          resolve({ error: err.message, success: false });
        });

        req.pipe(busboy);
      });
    };
  } catch (err) {
    return null; // Busboy not installed
  }
}

// ============================================================================
// Formidable Benchmark (if available)
// ============================================================================

async function benchmarkFormidable(fileSize) {
  try {
    const { formidable } = require('formidable');

    // Create formidable upload directory
    const formidableDir = path.join(UPLOAD_DIR, 'formidable');
    if (!fs.existsSync(formidableDir)) {
      fs.mkdirSync(formidableDir, { recursive: true });
    }

    return async (req) => {
      const tracker = new MemoryTracker();
      tracker.startTracking();

      const start = performance.now();

      return new Promise((resolve) => {
        const form = formidable({
          uploadDir: formidableDir,
          keepExtensions: true
        });

        form.parse(req, (err, fields, files) => {
          const duration = performance.now() - start;
          const memory = tracker.stopTracking();

          if (err) {
            resolve({ error: err.message, success: false });
          } else {
            resolve({ duration, memory, success: true });
          }
        });
      });
    };
  } catch (err) {
    return null; // Formidable not installed
  }
}

// ============================================================================
// Mock Request Generator
// ============================================================================

function createMockRequest(filePath) {
  const { Readable } = require('stream');
  const boundary = '----FluxUploadBenchmark';

  const fileContent = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );

  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat([header, fileContent, footer]);

  const stream = new Readable({
    read() {
      this.push(body);
      this.push(null);
    }
  });

  stream.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': body.length.toString()
  };

  return stream;
}

// ============================================================================
// Run Benchmark
// ============================================================================

async function runBenchmark(name, benchmarkFn, fileSize, iterations = 3) {
  if (!benchmarkFn) {
    return null; // Library not available
  }

  const results = [];

  for (let i = 0; i < iterations; i++) {
    const testFile = await generateTestFile(fileSize);
    const mockReq = createMockRequest(testFile);

    const handler = await benchmarkFn(fileSize);

    // Check if library is available
    if (!handler) {
      return null; // Library not installed
    }

    const result = await handler(mockReq);

    if (result.success) {
      results.push(result);
    }

    // Give GC time to run
    await new Promise(resolve => setTimeout(resolve, 100));
    global.gc && global.gc();
  }

  if (results.length === 0) {
    return null;
  }

  // Calculate averages
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const avgMemory = results[0].memory; // Use first run for memory (most consistent)

  return {
    name,
    fileSize,
    duration: avgDuration.toFixed(2) + ' ms',
    memory: avgMemory.peak,
    throughput: ((fileSize / (avgDuration / 1000)).toFixed(2)) + ' MB/s'
  };
}

// ============================================================================
// Main Benchmark Runner
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  FluxUpload Performance Benchmark');
  console.log('='.repeat(70) + '\n');

  console.log('Preparing test environment...\n');

  // Generate test files
  const testFiles = await Promise.all(
    TEST_SIZES.map(size => generateTestFile(size))
  );

  console.log('✓ Test files generated\n');

  // Run benchmarks for each size
  for (const size of TEST_SIZES) {
    console.log(`${'─'.repeat(70)}`);
    console.log(`Testing with ${size}MB file`);
    console.log('─'.repeat(70));

    const benchmarks = [
      ['FluxUpload', benchmarkFluxUpload],
      ['Multer', benchmarkMulter],
      ['Busboy', benchmarkBusboy],
      ['Formidable', benchmarkFormidable]
    ];

    const results = [];

    for (const [name, fn] of benchmarks) {
      try {
        const result = await runBenchmark(name, fn, size, 3);
        if (result) {
          results.push(result);
          console.log(`  ✓ ${name.padEnd(15)} ${result.duration.padEnd(12)} ${result.memory.padEnd(12)} ${result.throughput}`);
        } else {
          console.log(`  ○ ${name.padEnd(15)} (not installed)`);
        }
      } catch (error) {
        console.log(`  ✗ ${name.padEnd(15)} ${error.message}`);
      }
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(70));
  console.log('  Benchmark Complete');
  console.log('='.repeat(70));
  console.log('\nKey Metrics:');
  console.log('  • Duration: Time to process upload');
  console.log('  • Memory: Peak memory usage during upload');
  console.log('  • Throughput: MB processed per second\n');

  console.log('FluxUpload Advantages:');
  console.log('  ✓ Zero dependencies');
  console.log('  ✓ Constant O(1) memory usage');
  console.log('  ✓ Stream-first architecture');
  console.log('  ✓ Built-in validation & transformation');
  console.log('  ✓ Native S3 support\n');

  // Cleanup
  console.log('Cleaning up test files...');
  try {
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
    console.log('✓ Cleanup complete\n');
  } catch (err) {
    console.log('Note: Manual cleanup may be needed\n');
  }
}

// Run with --expose-gc for accurate memory measurements
if (require.main === module) {
  if (!global.gc) {
    console.log('\n⚠️  For accurate memory measurements, run with: node --expose-gc benchmark/index.js\n');
  }

  main().catch(error => {
    console.error('Benchmark error:', error);
    process.exit(1);
  });
}

module.exports = { runBenchmark, generateTestFile };
