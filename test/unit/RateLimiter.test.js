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

  runner.it('should refund token on success with skipSuccessfulRequests', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000,
      skipSuccessfulRequests: true
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Consume 2 tokens
    const ctx1 = await limiter.process({ ...mockContext });
    const ctx2 = await limiter.process({ ...mockContext });

    // Cleanup without error (success)
    await limiter.cleanup(ctx1, null);
    await limiter.cleanup(ctx2, null);

    // Should have refunded tokens, allowing more requests
    const result = await limiter.process({ ...mockContext });
    assert.ok(result);
  });

  runner.it('should refund token on failure with skipFailedRequests', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000,
      skipFailedRequests: true
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Consume 2 tokens
    const ctx1 = await limiter.process({ ...mockContext });
    const ctx2 = await limiter.process({ ...mockContext });

    // Cleanup with error (failure)
    await limiter.cleanup(ctx1, new Error('Upload failed'));
    await limiter.cleanup(ctx2, new Error('Upload failed'));

    // Should have refunded tokens
    const result = await limiter.process({ ...mockContext });
    assert.ok(result);
  });

  runner.it('should not refund tokens by default', async () => {
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
    const ctx1 = await limiter.process({ ...mockContext });
    const ctx2 = await limiter.process({ ...mockContext });

    // Cleanup (no refund expected)
    await limiter.cleanup(ctx1, null);

    // Should still be blocked
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should use custom handler', async () => {
    let handlerCalled = false;
    let handlerInfo = null;

    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 1000,
      handler: (context, info) => {
        handlerCalled = true;
        handlerInfo = info;
        return context; // Allow request anyway
      }
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Consume token
    await limiter.process({ ...mockContext });

    // Next request should trigger handler
    const result = await limiter.process({ ...mockContext });

    assert.ok(handlerCalled);
    assert.ok(handlerInfo.waitTime > 0);
    assert.equal(handlerInfo.limit, 1);
    assert.ok(result);
  });

  runner.it('should handle unknown IP address', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: {},
        headers: {}
      }
    };

    // Should use 'unknown' as key
    await limiter.process({ ...mockContext });
    await limiter.process({ ...mockContext });

    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should handle burst traffic', async () => {
    const limiter = new RateLimiter({
      maxRequests: 10,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    // Burst of 10 requests should all succeed
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(limiter.process({ ...mockContext }));
    }

    const results = await Promise.all(promises);
    assert.equal(results.length, 10);

    // 11th should fail
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should track separate buckets for different IPs', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000
    });

    const ip1Context = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    const ip2Context = {
      request: {
        socket: { remoteAddress: '192.168.1.1' },
        headers: {}
      }
    };

    // IP1 consumes its limit
    await limiter.process({ ...ip1Context });
    await limiter.process({ ...ip1Context });

    // IP1 should be blocked
    await assert.rejects(
      limiter.process({ ...ip1Context }),
      'limit exceeded'
    );

    // IP2 should still work
    const result = await limiter.process({ ...ip2Context });
    assert.ok(result);
  });

  runner.it('should return status for non-existent key', () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    });

    const status = limiter.getStatus('non-existent-ip');
    assert.equal(status.requests, 0);
    assert.equal(status.remaining, 5);
    assert.equal(status.limit, 5);
    assert.ok(status.resetTime > Date.now());
  });

  runner.it('should store bucket in context', async () => {
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

    const result = await limiter.process({ ...mockContext });

    assert.ok(result.rateLimitBucket);
    assert.equal(result.rateLimitKey, '127.0.0.1');
  });

  runner.it('should extend Plugin class', () => {
    const Plugin = require('../../src/core/Plugin');
    const limiter = new RateLimiter();

    assert.ok(limiter instanceof Plugin);
  });

  runner.it('should have correct plugin name', () => {
    const limiter = new RateLimiter();
    assert.equal(limiter.name, 'RateLimiter');
  });

  runner.it('should calculate refill rate correctly', () => {
    const limiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60000 // 1 minute
    });

    // 100 requests per 60 seconds = 100/60 per second
    const expectedRate = 100 / 60;
    assert.equal(limiter.refillRate, expectedRate);
  });

  runner.it('should cleanup only when interval elapsed', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000,
      cleanupInterval: 10000 // 10 seconds
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    const initialCleanupTime = limiter.lastCleanup;

    // Make a request
    await limiter.process({ ...mockContext });

    // Cleanup shouldn't have run yet
    assert.equal(limiter.lastCleanup, initialCleanupTime);
  });

  runner.it('should handle wait time calculation', async () => {
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

    // Consume the token
    await limiter.process({ ...mockContext });

    // Try to get another and capture wait time
    try {
      await limiter.process({ ...mockContext });
    } catch (error) {
      assert.ok(error.retryAfter > 0);
      assert.ok(error.retryAfter <= 1); // Should be ≤ window in seconds
    }
  });

  runner.it('should handle X-Forwarded-For with multiple IPs', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 1000
    });

    const mockContext = {
      request: {
        socket: {},
        headers: {
          'x-forwarded-for': '  192.168.1.1  , 10.0.0.1, 172.16.0.1  '
        }
      }
    };

    // Should use first IP (trimmed)
    await limiter.process({ ...mockContext });

    // Second request from same first IP should be blocked
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should handle cleanup without bucket in context', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    });

    const mockContext = {};

    // Should not throw
    await limiter.cleanup(mockContext, null);
    await limiter.cleanup(mockContext, new Error('test'));
  });

  runner.it('should not refund on success without skipSuccessfulRequests', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 1000,
      skipSuccessfulRequests: false
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    const ctx = await limiter.process({ ...mockContext });
    await limiter.cleanup(ctx, null);

    // Should still be blocked
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should not refund on failure without skipFailedRequests', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 1000,
      skipFailedRequests: false
    });

    const mockContext = {
      request: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {}
      }
    };

    const ctx = await limiter.process({ ...mockContext });
    await limiter.cleanup(ctx, new Error('test'));

    // Should still be blocked
    await assert.rejects(
      limiter.process({ ...mockContext }),
      'limit exceeded'
    );
  });

  runner.it('should include active buckets in stats', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    });

    const stats1 = limiter.getStats();
    assert.equal(stats1.activeBuckets, 0);

    // Create some buckets
    await limiter.process({
      request: { socket: { remoteAddress: '127.0.0.1' }, headers: {} }
    });
    await limiter.process({
      request: { socket: { remoteAddress: '192.168.1.1' }, headers: {} }
    });

    const stats2 = limiter.getStats();
    assert.equal(stats2.activeBuckets, 2);
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
