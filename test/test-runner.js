/**
 * Simple Test Runner - Zero Dependencies
 *
 * A minimalist test framework for Node.js without external dependencies.
 */

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  describe(description, fn) {
    console.log(`\n${description}`);
    fn();
  }

  it(description, fn) {
    this.tests.push({ description, fn });
  }

  async run() {
    console.log('\n🧪 Running Tests...\n');
    const startTime = Date.now();

    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        console.log(`  ✓ ${test.description}`);
      } catch (error) {
        this.failed++;
        console.log(`  ✗ ${test.description}`);
        console.log(`    Error: ${error.message}`);
        if (error.stack) {
          console.log(`    ${error.stack.split('\n').slice(1, 3).join('\n    ')}`);
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log('\n' + '='.repeat(50));
    console.log(`Tests: ${this.passed} passed, ${this.failed} failed, ${this.tests.length} total`);
    console.log(`Time: ${duration}ms`);
    console.log('='.repeat(50) + '\n');

    return this.failed === 0;
  }
}

// Assertion helpers
const assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  },

  notEqual(actual, expected, message) {
    if (actual === expected) {
      throw new Error(message || `Expected ${actual} to not equal ${expected}`);
    }
  },

  deepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
    }
  },

  ok(value, message) {
    if (!value) {
      throw new Error(message || `Expected truthy value, got ${value}`);
    }
  },

  throws(fn, expectedError, message) {
    let threw = false;
    try {
      fn();
    } catch (error) {
      threw = true;
      if (expectedError && !error.message.includes(expectedError)) {
        throw new Error(message || `Expected error containing "${expectedError}", got "${error.message}"`);
      }
    }
    if (!threw) {
      throw new Error(message || 'Expected function to throw');
    }
  },

  async rejects(promise, expectedError, message) {
    let threw = false;
    try {
      await promise;
    } catch (error) {
      threw = true;
      if (expectedError && !error.message.includes(expectedError)) {
        throw new Error(message || `Expected error containing "${expectedError}", got "${error.message}"`);
      }
    }
    if (!threw) {
      throw new Error(message || 'Expected promise to reject');
    }
  },

  isBuffer(value, message) {
    if (!Buffer.isBuffer(value)) {
      throw new Error(message || `Expected Buffer, got ${typeof value}`);
    }
  },

  match(value, regex, message) {
    if (!regex.test(value)) {
      throw new Error(message || `Expected ${value} to match ${regex}`);
    }
  }
};

module.exports = { TestRunner, assert };
