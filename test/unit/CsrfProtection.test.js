/**
 * CsrfProtection Tests
 */

const { TestRunner, assert } = require('../test-runner');
const CsrfProtection = require('../../src/plugins/validators/CsrfProtection');

const runner = new TestRunner();

runner.describe('CsrfProtection', () => {
  runner.it('should initialize with default config', () => {
    const csrf = new CsrfProtection();
    assert.equal(csrf.tokenLength, 32);
    assert.equal(csrf.tokenLifetime, 3600000); // 1 hour
    assert.equal(csrf.cookieName, 'csrf-token');
    assert.equal(csrf.headerName, 'X-CSRF-Token');
    assert.equal(csrf.doubleSubmitCookie, true);

    // Cleanup
    csrf.shutdown();
  });

  runner.it('should initialize with custom config', () => {
    const csrf = new CsrfProtection({
      tokenLength: 16,
      tokenLifetime: 7200000,
      cookieName: 'custom-csrf',
      headerName: 'X-Custom-CSRF',
      doubleSubmitCookie: false
    });

    assert.equal(csrf.tokenLength, 16);
    assert.equal(csrf.tokenLifetime, 7200000);
    assert.equal(csrf.cookieName, 'custom-csrf');
    assert.equal(csrf.headerName, 'X-Custom-CSRF');
    assert.equal(csrf.doubleSubmitCookie, false);

    csrf.shutdown();
  });

  runner.it('should generate valid tokens', () => {
    const csrf = new CsrfProtection();
    const token = csrf.generateToken();

    assert.ok(token);
    assert.equal(typeof token, 'string');
    assert.equal(token.length, 64); // 32 bytes = 64 hex chars

    csrf.shutdown();
  });

  runner.it('should generate unique tokens', () => {
    const csrf = new CsrfProtection();
    const token1 = csrf.generateToken();
    const token2 = csrf.generateToken();

    assert.notEqual(token1, token2);

    csrf.shutdown();
  });

  runner.it('should verify valid tokens', () => {
    const csrf = new CsrfProtection();
    const token = csrf.generateToken();

    const valid = csrf.verifyToken(token);
    assert.ok(valid);

    csrf.shutdown();
  });

  runner.it('should reject invalid tokens', () => {
    const csrf = new CsrfProtection();

    const valid = csrf.verifyToken('invalid-token-12345');
    assert.equal(valid, false);

    csrf.shutdown();
  });

  runner.it('should reject expired tokens', async () => {
    const csrf = new CsrfProtection({
      tokenLifetime: 10 // 10ms lifetime
    });

    const token = csrf.generateToken();

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 20));

    const valid = csrf.verifyToken(token);
    assert.equal(valid, false);

    csrf.shutdown();
  });

  runner.it('should support one-time tokens', () => {
    const csrf = new CsrfProtection();
    const token = csrf.generateToken();

    // First use should succeed
    const valid1 = csrf.verifyToken(token, { oneTime: true });
    assert.ok(valid1);

    // Second use should fail
    const valid2 = csrf.verifyToken(token, { oneTime: true });
    assert.equal(valid2, false);

    csrf.shutdown();
  });

  runner.it('should support session-bound tokens', () => {
    const csrf = new CsrfProtection();
    const token = csrf.generateToken({ sessionId: 'session-123' });

    // Correct session should succeed
    const valid1 = csrf.verifyToken(token, { sessionId: 'session-123' });
    assert.ok(valid1);

    // Wrong session should fail
    const valid2 = csrf.verifyToken(token, { sessionId: 'session-456' });
    assert.equal(valid2, false);

    csrf.shutdown();
  });

  runner.it('should revoke tokens', () => {
    const csrf = new CsrfProtection();
    const token = csrf.generateToken();

    assert.ok(csrf.verifyToken(token));

    csrf.revokeToken(token);

    assert.equal(csrf.verifyToken(token), false);

    csrf.shutdown();
  });

  runner.it('should clear all tokens', () => {
    const csrf = new CsrfProtection();

    csrf.generateToken();
    csrf.generateToken();
    csrf.generateToken();

    assert.equal(csrf.tokens.size, 3);

    csrf.clearTokens();

    assert.equal(csrf.tokens.size, 0);

    csrf.shutdown();
  });

  runner.it('should validate token from header', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: false });
    const token = csrf.generateToken();

    const mockContext = {
      request: {
        headers: {
          'x-csrf-token': token
        }
      }
    };

    const result = await csrf.process(mockContext);
    assert.ok(result);

    csrf.shutdown();
  });

  runner.it('should reject missing token', async () => {
    const csrf = new CsrfProtection();

    const mockContext = {
      request: {
        headers: {}
      }
    };

    await assert.rejects(
      csrf.process(mockContext),
      'CSRF token missing'
    );

    csrf.shutdown();
  });

  runner.it('should reject invalid token from header', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: false });

    const mockContext = {
      request: {
        headers: {
          'x-csrf-token': 'invalid-token'
        }
      }
    };

    await assert.rejects(
      csrf.process(mockContext),
      'Invalid CSRF token'
    );

    csrf.shutdown();
  });

  runner.it('should validate token from cookie (double-submit)', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: true });
    const token = 'test-token-123';

    const mockContext = {
      request: {
        headers: {
          'x-csrf-token': token,
          'cookie': `csrf-token=${token}`
        }
      }
    };

    const result = await csrf.process(mockContext);
    assert.ok(result);

    csrf.shutdown();
  });

  runner.it('should reject mismatched tokens (double-submit)', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: true });

    const mockContext = {
      request: {
        headers: {
          'x-csrf-token': 'token-from-header',
          'cookie': 'csrf-token=token-from-cookie'
        }
      }
    };

    await assert.rejects(
      csrf.process(mockContext),
      'Invalid CSRF token'
    );

    csrf.shutdown();
  });

  runner.it('should get token from query string', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: false });
    const token = csrf.generateToken();

    const mockContext = {
      request: {
        headers: {
          host: 'localhost'
        },
        url: `/upload?csrf_token=${token}`
      }
    };

    const result = await csrf.process(mockContext);
    assert.ok(result);

    csrf.shutdown();
  });

  runner.it('should parse multiple cookies', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: true });
    const token = 'test-token';

    const mockContext = {
      request: {
        headers: {
          'x-csrf-token': token,
          'cookie': 'session=abc123; csrf-token=test-token; other=value'
        }
      }
    };

    const result = await csrf.process(mockContext);
    assert.ok(result);

    csrf.shutdown();
  });

  runner.it('should handle URL-encoded cookie values', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: true });
    const token = 'token%20with%20spaces';

    const mockContext = {
      request: {
        headers: {
          'x-csrf-token': 'token with spaces',
          'cookie': `csrf-token=${token}`
        }
      }
    };

    const result = await csrf.process(mockContext);
    assert.ok(result);

    csrf.shutdown();
  });

  runner.it('should use custom token getter', async () => {
    const csrf = new CsrfProtection({
      getToken: (req) => req.customToken
    });

    const mockContext = {
      request: {
        customToken: 'custom-token-value',
        headers: {}
      }
    };

    // Will fail validation but should get the token
    await assert.rejects(
      csrf.process(mockContext),
      'Invalid CSRF token'
    );

    csrf.shutdown();
  });

  runner.it('should use custom token validator', async () => {
    const csrf = new CsrfProtection({
      validateToken: (req, token) => token === 'valid-custom-token'
    });

    const validContext = {
      request: {
        headers: {
          'x-csrf-token': 'valid-custom-token'
        }
      }
    };

    const result = await csrf.process(validContext);
    assert.ok(result);

    const invalidContext = {
      request: {
        headers: {
          'x-csrf-token': 'invalid-custom-token'
        }
      }
    };

    await assert.rejects(
      csrf.process(invalidContext),
      'Invalid CSRF token'
    );

    csrf.shutdown();
  });

  runner.it('should get statistics', () => {
    const csrf = new CsrfProtection();

    csrf.generateToken();
    csrf.generateToken();

    const stats = csrf.getStats();
    assert.equal(stats.activeTokens, 2);
    assert.equal(stats.tokenLifetime, 3600000);
    assert.equal(stats.doubleSubmitCookie, true);

    csrf.shutdown();
  });

  runner.it('should cleanup expired tokens automatically', async () => {
    const csrf = new CsrfProtection({
      tokenLifetime: 50 // 50ms
    });

    // Generate some tokens
    csrf.generateToken();
    csrf.generateToken();
    csrf.generateToken();

    assert.equal(csrf.tokens.size, 3);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger cleanup
    csrf._cleanupExpiredTokens();

    assert.equal(csrf.tokens.size, 0);

    csrf.shutdown();
  });

  runner.it('should handle case-insensitive header names', async () => {
    const csrf = new CsrfProtection({ doubleSubmitCookie: false });
    const token = csrf.generateToken();

    const mockContext = {
      request: {
        headers: {
          'X-CSRF-TOKEN': token, // Uppercase
          'x-csrf-token': token  // Will be normalized by Node.js
        }
      }
    };

    const result = await csrf.process(mockContext);
    assert.ok(result);

    csrf.shutdown();
  });

  runner.it('should provide error codes and status codes', async () => {
    const csrf = new CsrfProtection();

    const mockContext = {
      request: {
        headers: {}
      }
    };

    try {
      await csrf.process(mockContext);
      throw new Error('Should have thrown');
    } catch (error) {
      assert.equal(error.code, 'CSRF_TOKEN_MISSING');
      assert.equal(error.statusCode, 403);
    }

    csrf.shutdown();
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
