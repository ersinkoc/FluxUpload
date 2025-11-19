/**
 * FileNaming Tests
 */

const { TestRunner, assert } = require('../test-runner');
const FileNaming = require('../../src/utils/FileNaming');

const runner = new TestRunner();

runner.describe('FileNaming', () => {
  runner.it('should generate UUID filenames', () => {
    const naming = new FileNaming({ strategy: 'uuid' });
    const filename = naming.generate('test.jpg');

    assert.ok(filename, 'Should generate filename');
    assert.match(filename, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/);
  });

  runner.it('should preserve extensions by default', () => {
    const naming = new FileNaming({ strategy: 'uuid' });
    const filename = naming.generate('photo.png');

    assert.ok(filename.endsWith('.png'));
  });

  runner.it('should generate timestamp filenames', () => {
    const naming = new FileNaming({ strategy: 'timestamp' });
    const filename = naming.generate('test.jpg');

    assert.ok(filename, 'Should generate filename');
    assert.ok(filename.includes('T')); // ISO timestamp format
    assert.ok(filename.endsWith('.jpg'));
  });

  runner.it('should sanitize original filenames', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('../../../etc/passwd');

    assert.ok(filename, 'Should generate filename');
    assert.ok(!filename.includes('..'), 'Should remove path traversal');
    assert.ok(!filename.includes('/'), 'Should remove slashes');
  });

  runner.it('should slugify filenames', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('My Photo 2024!.jpg');

    assert.equal(filename, 'my-photo-2024.jpg');
  });

  runner.it('should handle Unicode in slugify', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('café-menü.jpg');

    assert.equal(filename, 'cafe-menu.jpg');
  });

  runner.it('should use hash strategy with metadata', () => {
    const naming = new FileNaming({ strategy: 'hash' });
    const filename = naming.generate('test.jpg', { hash: 'abc123' });

    assert.equal(filename, 'abc123.jpg');
  });

  runner.it('should throw error if hash strategy without hash', () => {
    const naming = new FileNaming({ strategy: 'hash' });

    assert.throws(() => {
      naming.generate('test.jpg', {});
    }, 'Hash strategy requires hash');
  });

  runner.it('should add prefix and suffix', () => {
    const naming = new FileNaming({
      strategy: 'original',
      prefix: 'upload-',
      suffix: '-prod'
    });
    const filename = naming.generate('test.jpg');

    assert.ok(filename.startsWith('upload-'));
    assert.ok(filename.includes('-prod'));
    assert.ok(filename.endsWith('.jpg'));
  });

  runner.it('should truncate long filenames', () => {
    const naming = new FileNaming({
      strategy: 'original',
      maxLength: 20
    });
    const longName = 'a'.repeat(100) + '.jpg';
    const filename = naming.generate(longName);

    assert.ok(filename.length <= 20);
    assert.ok(filename.endsWith('.jpg'));
  });

  runner.it('should check filename safety', () => {
    assert.ok(FileNaming.isSafe('test.jpg'));
    assert.ok(FileNaming.isSafe('my-file_2024.png'));
    assert.ok(!FileNaming.isSafe('../etc/passwd'));
    assert.ok(!FileNaming.isSafe('test\x00.jpg')); // null byte
    assert.ok(!FileNaming.isSafe('CON')); // Windows reserved
  });

  runner.it('should handle missing extension', () => {
    const naming = new FileNaming({ strategy: 'uuid' });
    const filename = naming.generate('noextension');

    assert.ok(filename);
    assert.ok(!filename.includes('.'));
  });

  runner.it('should handle empty filename', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('');

    assert.equal(filename, 'unnamed');
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
