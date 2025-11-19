#!/usr/bin/env node
/**
 * Master Test Runner
 *
 * Runs all unit and integration tests
 */

const path = require('path');

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  FluxUpload Test Suite');
  console.log('='.repeat(60));

  const tests = [
    // Unit tests - Utils
    { name: 'MimeDetector', path: './unit/MimeDetector.test.js' },
    { name: 'FileNaming', path: './unit/FileNaming.test.js' },
    { name: 'BoundaryScanner', path: './unit/BoundaryScanner.test.js' },
    { name: 'AwsSignatureV4', path: './unit/AwsSignatureV4.test.js' },
    { name: 'SignedUrls', path: './unit/SignedUrls.test.js' },

    // Unit tests - Core
    { name: 'MultipartParser', path: './unit/MultipartParser.test.js' },

    // Unit tests - Validators
    { name: 'RateLimiter', path: './unit/RateLimiter.test.js' },
    { name: 'QuotaLimiter', path: './unit/QuotaLimiter.test.js' },
    { name: 'CsrfProtection', path: './unit/CsrfProtection.test.js' },
    { name: 'MagicByteDetector', path: './unit/MagicByteDetector.test.js' },
    { name: 'ImageDimensionProbe', path: './unit/ImageDimensionProbe.test.js' },

    // Unit tests - Transformers
    { name: 'StreamCompressor', path: './unit/StreamCompressor.test.js' },
    { name: 'StreamHasher', path: './unit/StreamHasher.test.js' },

    // Unit tests - Storage
    { name: 'LocalStorage', path: './unit/LocalStorage.test.js' },

    // Integration tests
    { name: 'Upload Integration', path: './integration/upload.test.js' }
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  const startTime = Date.now();

  for (const test of tests) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📦 ${test.name}`);
    console.log('─'.repeat(60));

    try {
      const testModule = require(test.path);
      const success = await testModule.run();

      totalPassed += testModule.passed;
      totalFailed += testModule.failed;
      totalTests += testModule.tests.length;

      if (!success) {
        console.log(`\n❌ ${test.name} FAILED`);
      } else {
        console.log(`\n✅ ${test.name} PASSED`);
      }
    } catch (error) {
      console.error(`\n❌ Error running ${test.name}:`);
      console.error(error.message);
      totalFailed++;
    }
  }

  const duration = Date.now() - startTime;

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('  Test Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests:  ${totalTests}`);
  console.log(`Passed:       ${totalPassed} ✅`);
  console.log(`Failed:       ${totalFailed} ${totalFailed > 0 ? '❌' : '✅'}`);
  console.log(`Duration:     ${duration}ms`);
  console.log('='.repeat(60));

  if (totalFailed === 0) {
    console.log('\n🎉 All tests passed!\n');
    return true;
  } else {
    console.log(`\n❌ ${totalFailed} test(s) failed\n`);
    return false;
  }
}

// Run tests
if (require.main === module) {
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
