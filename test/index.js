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
    // Unit tests
    { name: 'MimeDetector', path: './unit/MimeDetector.test.js' },
    { name: 'FileNaming', path: './unit/FileNaming.test.js' },
    { name: 'BoundaryScanner', path: './unit/BoundaryScanner.test.js' },
    { name: 'AwsSignatureV4', path: './unit/AwsSignatureV4.test.js' },

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
