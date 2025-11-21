# FluxUpload Website

Modern, responsive landing page for FluxUpload built with:

- **Tailwind CSS** - Utility-first CSS framework
- **Alpine.js** - Lightweight JavaScript framework
- **Highlight.js** - Syntax highlighting for code examples

## Features

- 📱 Fully responsive design
- 🎨 Modern UI with shadcn-inspired styling
- ⚡ Fast loading with CDN-delivered assets
- 🎯 SEO optimized
- ♿ Accessible navigation
- 🌙 Dark theme optimized

## Development

The website is a static HTML page that can be opened directly in a browser or served with any static file server:

```bash
# Serve locally
cd website
python -m http.server 8000
# or
npx serve .
```

Visit `http://localhost:8000` to view the site.

## Deployment

The website is automatically deployed to GitHub Pages when changes are pushed to the `main` branch.

Deployment workflow: `.github/workflows/deploy-website.yml`

## Structure

```
website/
├── index.html          # Main landing page
├── assets/
│   ├── css/           # Custom CSS (if needed)
│   ├── js/            # Custom JavaScript (if needed)
│   └── img/           # Images and icons
└── README.md          # This file
```

## Technologies

- **Tailwind CSS 3.x** - Via CDN
- **Alpine.js 3.x** - Via CDN
- **Highlight.js 11.x** - For code syntax highlighting

No build step required - all dependencies loaded via CDN for simplicity.

## Sections

1. **Hero** - Introduction and quick CTA
2. **Quick Start** - Installation and basic usage
3. **Features** - Key features with icons
4. **Security** - Recent security improvements
5. **Code Example** - Full working example
6. **CTA** - Call to action
7. **Footer** - Links and resources

## Customization

### Colors

The primary color scheme can be customized in the Tailwind config within `index.html`:

```javascript
tailwind.config = {
    theme: {
        extend: {
            colors: {
                primary: {
                    // Customize these values
                    50: '#f0f9ff',
                    500: '#0ea5e9',
                    // ...
                }
            }
        }
    }
}
```

### Content

All content is directly in `index.html` for easy editing. No build process needed.

## License

MIT License - Same as FluxUpload project
