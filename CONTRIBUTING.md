# Contributing to FluxUpload

Thank you for your interest in contributing to FluxUpload! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Architecture Philosophy](#architecture-philosophy)
- [How to Contribute](#how-to-contribute)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Creating Plugins](#creating-plugins)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and considerate
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences

---

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/fluxupload.git
   cd fluxupload
   ```
3. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```

---

## Development Setup

FluxUpload has **zero dependencies**, so setup is simple:

```bash
# Clone the repo
git clone https://github.com/yourusername/fluxupload.git
cd fluxupload

# Run tests
node test/index.js

# Run examples
node examples/basic-usage.js
node examples/s3-upload.js
```

No `npm install` needed! 🎉

---

## Architecture Philosophy

FluxUpload follows these core principles:

### 1. Zero Dependencies
- **NEVER add npm dependencies** to `dependencies` or `peerDependencies`
- Use only native Node.js modules: `stream`, `fs`, `crypto`, `http`, `https`, `zlib`, etc.
- If a feature requires an external library, make it an **optional plugin** with peer dependency

### 2. Stream-First
- Never buffer entire files in memory
- Use `stream.pipeline()` and proper backpressure handling
- Memory usage should be O(1), not O(n)

### 3. Plugin-Based
- Core provides: parsing, pipeline, error handling
- Everything else is a plugin: validators, transformers, storage
- Plugins should be composable and independent

### 4. Security by Default
- Never trust file extensions or Content-Type headers
- Always verify via magic bytes
- Sanitize filenames (path traversal, null bytes, etc.)
- Atomic operations (no partial files)

### 5. Explicit Over Implicit
- Clear, verbose error messages
- Configuration over convention
- No magic globals or side effects

---

## How to Contribute

### Reporting Bugs

1. **Check existing issues** to avoid duplicates
2. **Use the bug report template**
3. **Provide minimal reproduction**:
   ```javascript
   const FluxUpload = require('fluxupload');
   // ... minimal code that reproduces bug
   ```
4. **Include environment**:
   - Node.js version
   - Operating system
   - FluxUpload version

### Suggesting Features

1. **Check roadmap** in CHANGELOG.md
2. **Open a discussion** before implementing large features
3. **Consider plugin-based approach** for new features

### Contributing Code

Types of contributions we welcome:

- 🐛 **Bug fixes**
- 📚 **Documentation improvements**
- ✨ **New plugins** (validators, transformers, storage drivers)
- 🧪 **Test improvements**
- ⚡ **Performance optimizations**
- 🌍 **Translation** (if we add i18n)

---

## Code Style

### JavaScript Style

- **ES6+** features are fine (Node 12+)
- **CommonJS** modules (not ESM) for compatibility
- **Async/await** over callbacks
- **Descriptive variable names**

```javascript
// Good
const uploadedFiles = [];
const maxFileSizeInBytes = 100 * 1024 * 1024;

// Avoid
const arr = [];
const max = 100000000;
```

### Comments

- Explain **WHY**, not what
- Document zero-dependency alternatives
- Add JSDoc for public APIs

```javascript
/**
 * Generate UUID v4
 *
 * Zero Dependency: Manual UUID generation using crypto.randomBytes
 * instead of using the 'uuid' npm package.
 *
 * @returns {string} UUID v4 string
 */
_generateUUID() {
  const bytes = crypto.randomBytes(16);
  // Set version and variant bits per RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  // ... format as string
}
```

### File Organization

```
src/
├── core/           # Core functionality (parser, pipeline)
├── plugins/
│   ├── validators/
│   └── transformers/
├── storage/        # Storage drivers
└── utils/          # Utilities (reusable across modules)
```

---

## Testing

### Running Tests

```bash
# Run all tests
node test/index.js

# Run specific test
node test/unit/MimeDetector.test.js
```

### Writing Tests

- Use the built-in test runner (zero dependencies!)
- Test both success and failure paths
- Test edge cases (empty, null, huge values)

```javascript
const { TestRunner, assert } = require('../test-runner');

const runner = new TestRunner();

runner.describe('MyFeature', () => {
  runner.it('should do something', () => {
    const result = myFunction();
    assert.equal(result, expected);
  });

  runner.it('should throw on invalid input', () => {
    assert.throws(() => {
      myFunction(invalidInput);
    }, 'Expected error message');
  });
});

if (require.main === module) {
  runner.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}
```

### Test Coverage

- All new features must include tests
- Bug fixes should include regression tests
- Aim for >80% coverage on new code

---

## Pull Request Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/awesome-feature
   ```

2. **Make your changes**
   - Write code
   - Add tests
   - Update documentation

3. **Run tests locally**
   ```bash
   node test/index.js
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "Add support for WebP dimension detection"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/awesome-feature
   ```

6. **PR Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Motivation
   Why is this change needed?

   ## Changes
   - Added X
   - Modified Y
   - Fixed Z

   ## Testing
   - [ ] Tests added/updated
   - [ ] All tests pass
   - [ ] Documentation updated

   ## Breaking Changes
   None / Describe any breaking changes
   ```

7. **Code Review**
   - Address feedback promptly
   - Keep discussion focused and professional
   - Be open to suggestions

---

## Creating Plugins

### Validator Plugin

```javascript
const Plugin = require('../core/Plugin');

class MyValidator extends Plugin {
  constructor(config) {
    super(config);
    // Initialize validator
  }

  async process(context) {
    // Validate context.fileInfo or context.stream
    // Throw error to reject upload
    if (/* invalid */) {
      throw new Error('Validation failed: reason');
    }

    return context; // Pass through if valid
  }
}

module.exports = MyValidator;
```

### Transformer Plugin

```javascript
const { Transform } = require('stream');
const Plugin = require('../core/Plugin');

class MyTransformer extends Plugin {
  async process(context) {
    // Wrap stream with transform stream
    const transformStream = new Transform({
      transform(chunk, encoding, callback) {
        // Transform chunk
        const modified = doSomething(chunk);
        callback(null, modified);
      }
    });

    // Pipe through transformer
    const newStream = context.stream.pipe(transformStream);

    return {
      ...context,
      stream: newStream
    };
  }
}

module.exports = MyTransformer;
```

### Storage Driver

```javascript
const Plugin = require('../core/Plugin');

class MyStorage extends Plugin {
  async process(context) {
    // Upload context.stream to your storage
    const result = await this.upload(context.stream, context.fileInfo);

    return {
      ...context,
      storage: {
        driver: 'my-storage',
        url: result.url,
        // ... storage-specific metadata
      }
    };
  }

  async cleanup(context, error) {
    // Cleanup partial uploads on error
  }
}

module.exports = MyStorage;
```

---

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run full test suite
4. Create git tag
5. Push to npm
6. Create GitHub release

---

## Questions?

- 📖 Read the [API Documentation](API.md)
- 💬 Start a [Discussion](https://github.com/yourusername/fluxupload/discussions)
- 🐛 Open an [Issue](https://github.com/yourusername/fluxupload/issues)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to FluxUpload!** 🎉

**Zero dependencies. Maximum control. Community-driven.**
