---
name: Bug Report
about: Report a bug or unexpected behavior
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## To Reproduce

Steps to reproduce the behavior:

1. Set up FluxUpload with the following configuration:
```javascript
// Your configuration here
```

2. Send the following request:
```bash
# curl command or request details
```

3. Observe the error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

What actually happened, including error messages or logs:

```
Paste error output here
```

## Environment

- **Node.js version**: [e.g., 18.17.0]
- **FluxUpload version**: [e.g., 1.0.0]
- **Operating System**: [e.g., Ubuntu 22.04, macOS 13.4, Windows 11]
- **Storage backend**: [e.g., LocalStorage, S3Storage]
- **HTTP framework**: [e.g., Express 4.18.2, native http, Fastify]

## Configuration

<details>
<summary>FluxUpload Configuration (click to expand)</summary>

```javascript
// Paste your FluxUpload configuration here
const uploader = new FluxUpload({
  // ...
});
```

</details>

## Additional Context

Add any other context about the problem here, such as:
- Does this happen consistently or intermittently?
- Did this work in a previous version?
- Are there any relevant log entries from the Logger?
- Metrics or health check output if available

## Possible Solution

If you have an idea of what might be causing the issue or how to fix it, please share here.

## Checklist

- [ ] I have searched existing issues to ensure this is not a duplicate
- [ ] I have tested with the latest version of FluxUpload
- [ ] I have included my Node.js and FluxUpload versions
- [ ] I have provided a minimal reproduction example
- [ ] I have checked the [TROUBLESHOOTING.md](../../TROUBLESHOOTING.md) guide
