# NOAA Satellite Capture - Production Dockerfile
# Multi-stage build for minimal image size

# Stage 1: Build dependencies
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Stage 2: Production image
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    rtl-sdr \
    sox \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install aptdec for APT signal decoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    gcc \
    g++ \
    libsndfile-dev \
    libpng-dev \
    git \
    && git clone --recursive https://github.com/Xerbo/aptdec.git /tmp/aptdec \
    && cd /tmp/aptdec \
    && cmake -B build \
    && cmake --build build \
    && cp build/aptdec /usr/local/bin/ \
    && cd / \
    && rm -rf /tmp/aptdec \
    && apt-get purge -y cmake gcc g++ git \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install Bun runtime
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Create data directories
RUN mkdir -p /app/data /app/recordings /app/images

# Default environment variables
ENV STATION_LATITUDE=51.5074 \
    STATION_LONGITUDE=-0.1278 \
    STATION_ALTITUDE=10 \
    SDR_GAIN=45 \
    SDR_SAMPLE_RATE=48000 \
    SDR_PPM_CORRECTION=0 \
    MIN_ELEVATION=20 \
    MIN_SIGNAL_STRENGTH=-20 \
    RECORDINGS_DIR=/app/recordings \
    IMAGES_DIR=/app/images \
    TLE_UPDATE_INTERVAL_HOURS=24 \
    WEB_PORT=3000 \
    WEB_HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/captures.db \
    LOG_LEVEL=info

# Expose web dashboard port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

# Run the application
CMD ["bun", "run", "src/cli/main.ts", "run"]
