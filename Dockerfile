# FluxUpload Docker Example
# Multi-stage build for optimal size

# Stage 1: Base
FROM node:18-alpine AS base
WORKDIR /app

# Stage 2: Dependencies (none for FluxUpload!)
FROM base AS deps
# Copy package files
COPY package.json ./
# Verify zero dependencies
RUN node -e "const pkg = require('./package.json'); if (Object.keys(pkg.dependencies || {}).length > 0) { throw new Error('Dependencies detected!'); }"

# Stage 3: Application
FROM base AS app
WORKDIR /app

# Copy source code
COPY src/ ./src/
COPY examples/ ./examples/
COPY package.json ./

# Create upload directory
RUN mkdir -p /app/uploads && \
    chmod 755 /app/uploads

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1))"

# Default to basic example
CMD ["node", "examples/basic-usage.js"]

# Labels
LABEL maintainer="FluxUpload Team"
LABEL org.opencontainers.image.title="FluxUpload"
LABEL org.opencontainers.image.description="Zero-dependency file upload server"
LABEL org.opencontainers.image.vendor="FluxUpload"
LABEL org.opencontainers.image.licenses="MIT"
