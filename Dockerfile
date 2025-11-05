# Multi-stage build for QuickMark
# Stage 1: Build the application
FROM node:22-bookworm-slim AS builder

# Install dependencies required for native modules (better-sqlite3)
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

# Copy source code
COPY . .

# Build the SvelteKit application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production image
FROM node:22-bookworm-slim

WORKDIR /app

# Install Playwright system dependencies
# Note: We install these first so Playwright can find them
RUN apt-get update && apt-get install -y \
    sqlite3 \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# Copy built application from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Install Playwright browsers in production stage
# This ensures they're available at runtime
RUN npx playwright install chromium

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
