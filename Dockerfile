# Multi-stage build for QuickMark
# Stage 1: Build the application
FROM node:22-alpine AS builder

# Install dependencies required for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

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
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache sqlite

# Copy built application from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

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
