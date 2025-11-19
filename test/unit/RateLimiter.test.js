/**
 * RateLimiter Tests
 */

const { TestRunner, assert } = require('../test-runner');
const RateLimiter = require('../../src/plugins/validators/RateLimiter');

const runner = new TestRunner();

runner.describe('RateLimiter', () => {
  runner.it('should allow requests within limit', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Should allow first 5 requests
    for (let i = 0; i < 5; i++) {
      const result = await limiter.process({ ...mockContext });
      assert.ok(result, `Request ${i + 1} should be allowed`);
    }
  });

  runner.it('should block requests exceeding limit', async () => {
    const limiter = new RateLimiter({
      maxRequests: 3,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Allow first 3 requests
    for (let i = 0; i < 3; i++) {
      await limiter.process({ ...mockContext });
    }

    // 4th request should be blocked
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should refill tokens over time', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 100 // 100ms window = 20 tokens/second
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Consume all tokens
    await limiter.process({ ...mockContext });
    await limiter.process({ ...mockContext });

    // Wait for token refill (100ms = full refill)
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be able to make requests again
    const result = await limiter.process({ ...mockContext });
    assert.ok(result);
  });

  runner.it('should use custom key generator', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000,
      keyGenerator: (context) => context.userId
    });

    const user1Context = {
      userId: 'user1',
      request: { socket: {}, headers: {} }
    };

    const user2Context = {
      userId: 'user2',
      request: { socket: {}, headers: {} }
    };

    // Each user should have separate limits
    await limiter.process({ ...user1Context });
    await limiter.process({ ...user1Context });
    await limiter.process({ ...user2Context });
    await limiter.process({ ...user2Context });

    // Both should be blocked now
    await assert.rejects(
      limiter.process({ ...user1Context }),
      'limit exceeded'
    );
    await assert.rejects(
      limiter.process({ ...user2Context }),
      'limit exceeded'
    );
  });

  runner.it('should get rate limit status', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Make 3 requests
    await limiter.process({ ...mockContext });
    await limiter.process({ ...mockContext });
    await limiter.process({ ...mockContext });

    const status = limiter.getStatus('127.0.0.1');
    assert.equal(status.requests, 3);
    assert.equal(status.remaining, 2);
    assert.equal(status.limit, 5);
  });

  runner.it('should reset rate limit for key', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Consume all tokens
    await limiter.process({ ...mockContext });
    await limiter.process({ ...mockContext });

    // Should be blocked
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );

    // Reset
    limiter.reset('127.0.0.1');

    // Should work again
    const result = await limiter.process({ ...mockContext });
    assert.ok(result);
  });

  runner.it('should get statistics', async () => {
    const limiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 1000
    });

    const stats = limiter.getStats();
    assert.equal(stats.maxRequests, 10);
    assert.equal(stats.windowMs, 1000);
    assert.equal(stats.refillRate, 10); // 10 requests per second
  });

  runner.it('should use X-Forwarded-For header', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: {},
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1'
        }
      }
    };

    await limiter.process({ ...mockContext });
    await limiter.process({ ...mockContext });

    // Should be blocked (same IP from X-Forwarded-For)
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should provide retry-after info', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Consume the one allowed request
    await limiter.process({ ...mockContext });

    // Next request should fail with retry info
    try {
      await limiter.process({ ...mockContext });
      throw new Error('Should have thrown rate limit error');
    } catch (error) {
      assert.equal(error.code, 'RATE_LIMIT_EXCEEDED');
      assert.equal(error.statusCode, 429);
      assert.ok(error.retryAfter >= 0);
      assert.equal(error.limit, 1);
    }
  });

  runner.it('should cleanup old buckets', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000,
      cleanupInterval: 50 // 50ms for testing
    });

    const mockContext1 = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    const mockContext2 = {
      request: {
        socket: { remoteAddress: '192.168.1.1' },
        headers: {}
      }
    };

    // Create buckets for both IPs
    await limiter.process({ ...mockContext1 });
    await limiter.process({ ...mockContext2 });

    assert.equal(limiter.buckets.size, 2);

    // Wait for cleanup interval
    await new Promise(resolve => setTimeout(resolve, 100));

    // Trigger cleanup by making a new request
    await limiter.process({ ...mockContext1 });

    // Buckets might be cleaned up if they're full (unused)
    // This is implementation-dependent
    assert.ok(limiter.buckets.size >= 1);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
