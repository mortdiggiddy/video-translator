# ==========================================
# Development Stage
# ==========================================
# Using debian-based image instead of alpine because Temporal SDK requires glibc
FROM node:20-slim AS development

# Install required packages including ffmpeg for audio extraction, ca-certificates for HTTPS,
# and procps for the 'ps' command needed by fluent-ffmpeg progress tracking
RUN apt-get update && \
    apt-get install -y --no-install-recommends bash git curl ffmpeg ca-certificates procps && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g pnpm@9.14.1

WORKDIR /usr/src/app

# Create temp and upload directories for processing
RUN mkdir -p /tmp/video-translator /tmp/video-translator/uploads

# Copy package files (pnpm-lock.yaml is optional for dev)
COPY package.json pnpm-lock.yaml* ./

# Install dependencies using pnpm with --force to ensure all deps are installed
RUN pnpm install --force

# Copy source code
COPY . .

# Expose port
EXPOSE 3001

# Development command (with watch mode)
CMD ["pnpm", "start:dev"]

# ==========================================
# Build Stage
# ==========================================
FROM development AS build

RUN pnpm run build

# Remove devDependencies so that only prod deps remain
FROM build AS prune

RUN pnpm prune --prod

# ==========================================
# Production Stage
# ==========================================
FROM node:20-slim AS production

# Install ffmpeg for audio extraction at runtime, ca-certificates for HTTPS,
# and procps for the 'ps' command needed by fluent-ffmpeg progress tracking
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates procps && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV APP_NAME=video-translator

# Create temp and upload directories for processing
RUN mkdir -p /tmp/video-translator /tmp/video-translator/uploads

# Copy production dependencies and built application
COPY --from=prune /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# Expose port
EXPOSE 3001

# Production command
CMD ["node", "dist/main"]
