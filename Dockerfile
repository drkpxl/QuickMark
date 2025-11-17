# Multi-stage build for QuickMark
# Stage 1: Build the application
FROM node:22-bookworm-slim AS builder

# Install dependencies required for native modules (better-sqlite3) and Playwright
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Install Playwright browsers with system dependencies
# Using chromium only to reduce image size
RUN npx playwright install --with-deps chromium

# Copy source code
COPY . .

# Build the SvelteKit application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production image
FROM node:22-bookworm-slim

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Install Playwright browsers with all required system dependencies
# This ensures all runtime dependencies are properly installed
RUN npx playwright install --with-deps chromium

# Create data directory structure for database and assets
RUN mkdir -p /app/data/assets

# Expose the application port
EXPOSE 9022

# Set environment variables
ENV NODE_ENV=production
ENV PORT=9022
ENV HOST=0.0.0.0

# Run the application
CMD ["node", "build"]
