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

  runner.it('should remove Windows reserved characters', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('file<name>:test|?.jpg');

    assert.ok(!filename.includes('<'));
    assert.ok(!filename.includes('>'));
    assert.ok(!filename.includes(':'));
    assert.ok(!filename.includes('|'));
    assert.ok(!filename.includes('?'));
  });

  runner.it('should remove control characters', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('test\x00\x01\x1f.jpg');

    assert.ok(!filename.includes('\x00'));
    assert.ok(!filename.includes('\x01'));
    assert.ok(!filename.includes('\x1f'));
  });

  runner.it('should handle leading dots', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('...hidden.txt');

    assert.ok(!filename.startsWith('.'));
    assert.ok(filename.endsWith('.txt'));
  });

  runner.it('should handle trailing dots', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('file...txt');

    assert.ok(filename.endsWith('.txt'));
  });

  runner.it('should handle multiple path separators', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('path/to\\file.jpg');

    assert.ok(!filename.includes('/'));
    assert.ok(!filename.includes('\\'));
    assert.ok(filename.includes('_'));
  });

  runner.it('should handle multiple dots in extension', () => {
    const naming = new FileNaming({ strategy: 'uuid' });
    const filename = naming.generate('archive.tar.gz');

    assert.ok(filename.endsWith('.gz'));
    assert.match(filename, /^[0-9a-f-]+\.gz$/);
  });

  runner.it('should not preserve extension when disabled', () => {
    const naming = new FileNaming({
      strategy: 'uuid',
      preserveExtension: false
    });
    const filename = naming.generate('test.jpg');

    assert.ok(!filename.includes('.jpg'));
    assert.match(filename, /^[0-9a-f-]+$/);
  });

  runner.it('should handle null filename gracefully', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate(null);

    assert.equal(filename, 'unnamed');
  });

  runner.it('should handle undefined filename', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate(undefined);

    assert.equal(filename, 'unnamed');
  });

  runner.it('should generate valid UUID v4 format', () => {
    const naming = new FileNaming({ strategy: 'uuid' });
    const filename = naming.generate('test.jpg', {});

    const uuidPart = filename.replace('.jpg', '');
    const parts = uuidPart.split('-');

    assert.equal(parts.length, 5);
    assert.equal(parts[0].length, 8);
    assert.equal(parts[1].length, 4);
    assert.equal(parts[2].length, 4);
    assert.equal(parts[3].length, 4);
    assert.equal(parts[4].length, 12);

    // Check version 4
    assert.ok(parts[2].startsWith('4'));
  });

  runner.it('should generate unique UUIDs', () => {
    const naming = new FileNaming({ strategy: 'uuid' });
    const file1 = naming.generate('test.jpg');
    const file2 = naming.generate('test.jpg');

    assert.notEqual(file1, file2);
  });

  runner.it('should generate timestamp with correct format', () => {
    const naming = new FileNaming({ strategy: 'timestamp' });
    const filename = naming.generate('test.jpg');

    // Format: YYYYMMDDTHHMMSS-RANDOM.jpg
    const withoutExt = filename.replace('.jpg', '');
    assert.ok(withoutExt.includes('T'));
    assert.ok(withoutExt.includes('-'));

    const parts = withoutExt.split('-');
    assert.ok(parts.length >= 2);
  });

  runner.it('should slugify removes multiple spaces', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('my   photo   file.jpg');

    assert.equal(filename, 'my-photo-file.jpg');
  });

  runner.it('should slugify removes underscores', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('my_photo_file.jpg');

    assert.equal(filename, 'my-photo-file.jpg');
  });

  runner.it('should slugify removes multiple consecutive hyphens', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('my---photo.jpg');

    assert.equal(filename, 'my-photo.jpg');
  });

  runner.it('should slugify handles empty result', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('!@#$%');

    assert.ok(filename.includes('unnamed'));
  });

  runner.it('should throw error for unknown strategy', () => {
    const naming = new FileNaming({ strategy: 'invalid' });

    assert.throws(() => {
      naming.generate('test.jpg');
    }, 'Unknown naming strategy');
  });

  runner.it('should check Windows reserved names - CON', () => {
    assert.ok(!FileNaming.isSafe('CON'));
    assert.ok(!FileNaming.isSafe('con'));
    assert.ok(!FileNaming.isSafe('CON.txt'));
  });

  runner.it('should check Windows reserved names - PRN', () => {
    assert.ok(!FileNaming.isSafe('PRN'));
    assert.ok(!FileNaming.isSafe('prn.jpg'));
  });

  runner.it('should check Windows reserved names - LPT1', () => {
    assert.ok(!FileNaming.isSafe('LPT1'));
    assert.ok(!FileNaming.isSafe('lpt1.txt'));
  });

  runner.it('should check Windows reserved names - COM1', () => {
    assert.ok(!FileNaming.isSafe('COM1'));
    assert.ok(!FileNaming.isSafe('com1.dat'));
  });

  runner.it('should reject empty string in isSafe', () => {
    assert.ok(!FileNaming.isSafe(''));
  });

  runner.it('should reject null in isSafe', () => {
    assert.ok(!FileNaming.isSafe(null));
  });

  runner.it('should reject path traversal in isSafe', () => {
    assert.ok(!FileNaming.isSafe('../../etc/passwd'));
    assert.ok(!FileNaming.isSafe('..\\windows\\system32'));
  });

  runner.it('should accept safe filenames in isSafe', () => {
    assert.ok(FileNaming.isSafe('photo.jpg'));
    assert.ok(FileNaming.isSafe('document-2024.pdf'));
    assert.ok(FileNaming.isSafe('my_file.txt'));
  });

  runner.it('should truncate preserving extension', () => {
    const naming = new FileNaming({
      strategy: 'original',
      maxLength: 15
    });
    const filename = naming.generate('verylongfilename.jpg');

    assert.ok(filename.length <= 15);
    assert.ok(filename.endsWith('.jpg'));
  });

  runner.it('should handle maxLength exactly at limit', () => {
    const naming = new FileNaming({
      strategy: 'original',
      maxLength: 10
    });
    const filename = naming.generate('exact.jpg');

    assert.ok(filename.length <= 10);
  });

  runner.it('should handle prefix without suffix', () => {
    const naming = new FileNaming({
      strategy: 'uuid',
      prefix: 'img-'
    });
    const filename = naming.generate('test.jpg');

    assert.ok(filename.startsWith('img-'));
    assert.ok(filename.endsWith('.jpg'));
  });

  runner.it('should handle suffix without prefix', () => {
    const naming = new FileNaming({
      strategy: 'uuid',
      suffix: '-thumb'
    });
    const filename = naming.generate('test.jpg');

    assert.ok(filename.includes('-thumb'));
    assert.ok(filename.endsWith('.jpg'));
  });

  runner.it('should handle long prefix and suffix', () => {
    const naming = new FileNaming({
      strategy: 'uuid',
      prefix: 'production-upload-',
      suffix: '-processed'
    });
    const filename = naming.generate('test.jpg');

    assert.ok(filename.startsWith('production-upload-'));
    assert.ok(filename.includes('-processed'));
  });

  runner.it('should default to uuid strategy', () => {
    const naming = new FileNaming();
    const filename = naming.generate('test.jpg');

    assert.match(filename, /^[0-9a-f-]+\.jpg$/);
  });

  runner.it('should default maxLength to 255', () => {
    const naming = new FileNaming();
    assert.equal(naming.maxLength, 255);
  });

  runner.it('should default preserveExtension to true', () => {
    const naming = new FileNaming();
    assert.equal(naming.preserveExtension, true);
  });

  runner.it('should handle whitespace-only filename', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('   ');

    assert.equal(filename, 'unnamed');
  });

  runner.it('should normalize Unicode in slugify', () => {
    const naming = new FileNaming({ strategy: 'slugify' });
    const filename = naming.generate('naïve-résumé.pdf');

    assert.equal(filename, 'naive-resume.pdf');
  });

  runner.it('should handle combination of attacks', () => {
    const naming = new FileNaming({ strategy: 'original' });
    const filename = naming.generate('..\\..\\<script>alert("xss")</script>.jpg');

    // Should sanitize all dangerous characters
    assert.ok(!filename.includes('..'));
    assert.ok(!filename.includes('\\'));
    assert.ok(!filename.includes('<'));
    assert.ok(!filename.includes('>'));
    assert.ok(filename.endsWith('.jpg'));
    // Result should be safe
    assert.ok(FileNaming.isSafe(filename));
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runner;
