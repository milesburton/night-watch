# App image - code only, extends base image
# Builds FAST - just copies source and installs npm packages
#
# Build:   docker build -f docker/Dockerfile.app -t ghcr.io/milesburton/noaa-satellite-capture:latest .
# Or with custom base:
#          docker build -f docker/Dockerfile.app --build-arg BASE_IMAGE=mybase:tag -t rfcapture:latest .

ARG BASE_IMAGE=ghcr.io/milesburton/noaa-satellite-capture-base:latest
FROM ${BASE_IMAGE}

WORKDIR /app

# Install backend dependencies
COPY package.json bun.lock* ./
RUN bun install --ignore-scripts

# Install frontend dependencies BEFORE copying source (better caching!)
# This layer is cached unless frontend dependencies change
COPY src/frontend/package.json src/frontend/bun.lock* ./src/frontend/
RUN cd src/frontend && bun install

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY version.json ./

# Build frontend (fast - just compilation, dependencies already installed)
RUN cd src/frontend && bun run build

# Default environment variables
ENV SERVICE_MODE=full \
    SDR_RELAY_URL= \
    SDR_RELAY_PORT=3001 \
    SDR_RELAY_HOST=0.0.0.0 \
    STATION_LATITUDE=51.5069 \
    STATION_LONGITUDE=-0.1276 \
    STATION_ALTITUDE=10 \
    SDR_GAIN=45 \
    SDR_SAMPLE_RATE=48000 \
    SDR_PPM_CORRECTION=0 \
    MIN_ELEVATION=20 \
    MIN_SIGNAL_STRENGTH=-30 \
    SKIP_SIGNAL_CHECK=true \
    RECORDINGS_DIR=/app/recordings \
    IMAGES_DIR=/app/images \
    TLE_UPDATE_INTERVAL_HOURS=24 \
    WEB_PORT=3000 \
    WEB_HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/captures.db \
    LOG_LEVEL=info

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || curl -f http://localhost:3001/health || exit 1

CMD ["/bin/sh", "-c", "if [ \"$SERVICE_MODE\" = \"sdr-relay\" ]; then bun run src/sdr-relay/index.ts; else bun run src/backend/cli/main.ts run; fi"]
