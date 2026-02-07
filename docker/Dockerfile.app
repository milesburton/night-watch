# App image - code only, extends base image
# Builds FAST - just copies source and installs npm packages
#
# Build:   docker build -f docker/Dockerfile.app -t ghcr.io/milesburton/noaa-satellite-capture:latest .
# Or with custom base:
#          docker build -f docker/Dockerfile.app --build-arg BASE_IMAGE=mybase:tag -t rfcapture:latest .

ARG BASE_IMAGE=ghcr.io/milesburton/noaa-satellite-capture-base:latest
FROM ${BASE_IMAGE}

WORKDIR /app

# Layer 1: Install backend dependencies (cached unless package.json changes)
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

# Layer 2: Install frontend dependencies (cached unless frontend package.json changes)
COPY src/frontend/package.json src/frontend/package-lock.json ./src/frontend/
RUN cd src/frontend && npm install

# Layer 3: Copy backend code (doesn't trigger frontend rebuild)
COPY src/backend ./src/backend
COPY src/middleware ./src/middleware
COPY src/sdr-relay ./src/sdr-relay
COPY tsconfig.json ./

# Layer 4: Copy frontend source files (only invalidates if frontend code changes)
COPY src/frontend/src ./src/frontend/src
COPY src/frontend/public ./src/frontend/public
COPY src/frontend/index.html ./src/frontend/
COPY src/frontend/vite.config.ts ./src/frontend/
COPY src/frontend/tsconfig.json ./src/frontend/
COPY src/frontend/tailwind.config.js ./src/frontend/
COPY src/frontend/postcss.config.js ./src/frontend/

# Layer 5: Build frontend (only runs if Layer 4 changed)
# Ensure output directory exists
RUN mkdir -p src/middleware/web/static-react
RUN cd src/frontend && npm run build

# Layer 6: Generate version.json during build
ARG GIT_COMMIT=unknown
ARG BUILD_TIME
COPY scripts/generate-version.ts ./scripts/
COPY scripts/sstv-decode-wrapper.py ./scripts/
COPY scripts/lrpt-decode-wrapper.sh ./scripts/
RUN chmod +x scripts/lrpt-decode-wrapper.sh
RUN GIT_COMMIT=${GIT_COMMIT} BUILD_TIME=${BUILD_TIME} npx tsx scripts/generate-version.ts

# Default environment variables

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
    MIN_SIGNAL_STRENGTH=-15 \
    
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

CMD ["/bin/sh", "-c", "if [ \"$SERVICE_MODE\" = \"sdr-relay\" ]; then npx tsx src/sdr-relay/index.ts; else npx tsx src/backend/cli/main.ts run; fi"]
