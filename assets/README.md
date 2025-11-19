# FluxUpload Assets

This directory contains visual assets and diagrams for FluxUpload documentation.

## Files

### banner.txt
ASCII art banner logo for FluxUpload. Use this in CLI tools, terminal output, or documentation headers.

**Usage:**
```javascript
const fs = require('fs');
const banner = fs.readFileSync('./assets/banner.txt', 'utf8');
console.log(banner);
```

### architecture-diagram.txt
Complete architecture diagram showing the data flow through FluxUpload's components:
- Multipart Parser
- Validators
- Transformers
- Storage Drivers
- Observability Layer

### progress-example.txt
Example of progress tracking output showing:
- Real-time upload progress bars
- Multiple file uploads
- Speed and ETA calculations
- JSON output format

## Usage in Documentation

Include these assets in your documentation:

### In Markdown
```markdown
<!-- Show architecture -->
![Architecture](assets/architecture-diagram.txt)

<!-- Show banner -->
![FluxUpload](assets/banner.txt)
```

### In Terminal
```bash
# Display banner
cat assets/banner.txt

# Show architecture
cat assets/architecture-diagram.txt

# Show progress example
cat assets/progress-example.txt
```

### In Code Examples
```javascript
// Display banner when CLI starts
const { readFileSync } = require('fs');
const { join } = require('path');

function showBanner() {
  const banner = readFileSync(join(__dirname, 'assets', 'banner.txt'), 'utf8');
  console.log(banner);
}

showBanner();
```

## Creating Custom Assets

When creating new assets:

1. **Use plain text/ASCII** - No binary files for maximum compatibility
2. **Keep it simple** - Terminal fonts vary
3. **Test in different terminals** - Check on Windows, Mac, Linux
4. **Document usage** - Add examples to this README

## Box Drawing Characters

Common Unicode box drawing characters used in these diagrams:

```
┌─┐  ╔═╗  ╭─╮  Top borders
│ │  ║ ║  │ │  Sides
└─┘  ╚═╝  ╰─╯  Bottom borders
├─┤  ╠═╣       Connectors
┬ ┴  ╦ ╩       T-junctions
┼    ╬         Cross
▲ ▼  ◄ ►       Arrows
█ ░ ▓          Blocks (for progress bars)
✓ ✗            Checkmarks
```

## Color in Terminal (ANSI Codes)

For colored output in examples:

```javascript
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}FluxUpload${colors.reset}`);
console.log(`${colors.green}✓ Upload complete${colors.reset}`);
console.log(`${colors.red}✗ Upload failed${colors.reset}`);
```

## License

These assets are part of FluxUpload and released under the MIT License.
