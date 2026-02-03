FROM debian:bookworm-slim AS builder

WORKDIR /app

RUN echo "1" > /var/lib/dpkg/info/format \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && apt-get update --allow-insecure-repositories \
    && apt-get install -y --allow-unauthenticated ca-certificates gnupg curl unzip \
    && mkdir -p /etc/apt/keyrings \
    && for key in 6ED0E7B82643E131 78DBA3BC47EF2265 F8D2585B8783D481 54404762BBB6E853 BDE6D2B9216EC7A8; do \
         for i in 1 2 3 4 5; do \
           gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys $key && break || sleep 5; \
         done; \
       done \
    && gpg --export 6ED0E7B82643E131 78DBA3BC47EF2265 F8D2585B8783D481 54404762BBB6E853 BDE6D2B9216EC7A8 | tee /etc/apt/trusted.gpg.d/debian.gpg > /dev/null \
    && apt-get update \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

# Install backend dependencies
COPY package.json bun.lock* ./
RUN /usr/local/bin/bun install --ignore-scripts

# Copy source code and config
COPY src ./src
COPY tsconfig.json ./
COPY version.json ./

# Build React frontend
RUN cd src/frontend && /usr/local/bin/bun install
RUN cd src/frontend && /usr/local/bin/bun run build

FROM debian:bookworm-slim

RUN echo "1" > /var/lib/dpkg/info/format \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && apt-get update --allow-insecure-repositories \
    && apt-get install -y --allow-unauthenticated ca-certificates gnupg curl \
    && mkdir -p /etc/apt/keyrings \
    && for key in 6ED0E7B82643E131 78DBA3BC47EF2265 F8D2585B8783D481 54404762BBB6E853 BDE6D2B9216EC7A8; do \
         for i in 1 2 3 4 5; do \
           gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys $key && break || sleep 5; \
         done; \
       done \
    && gpg --export 6ED0E7B82643E131 78DBA3BC47EF2265 F8D2585B8783D481 54404762BBB6E853 BDE6D2B9216EC7A8 | tee /etc/apt/trusted.gpg.d/debian.gpg > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    rtl-sdr \
    sox \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    make \
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
    && apt-get purge -y cmake make gcc g++ git \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install SSTV decoder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-numpy \
    python3-pil \
    python3-scipy \
    python3-setuptools \
    git \
    && pip3 install --no-cache-dir --break-system-packages PySoundFile \
    && git clone https://github.com/colaclanth/sstv.git /tmp/sstv \
    && cd /tmp/sstv \
    && python3 setup.py install \
    && cd / \
    && rm -rf /tmp/sstv \
    && apt-get purge -y git \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/version.json ./

# Copy React frontend build
COPY --from=builder /app/src/middleware/web/static-react ./src/middleware/web/static-react

RUN mkdir -p /app/data /app/recordings /app/images

# Service mode: 'full' (default), 'sdr-relay', or 'server'
ENV SERVICE_MODE=full \
    # SDR Relay settings (when SERVICE_MODE=server)
    SDR_RELAY_URL= \
    # SDR Relay server settings (when SERVICE_MODE=sdr-relay)
    SDR_RELAY_PORT=3001 \
    SDR_RELAY_HOST=0.0.0.0 \
    # Standard settings
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

# Expose both web port and SDR relay port
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || curl -f http://localhost:3001/health || exit 1

# Use a shell script to select the right entry point based on SERVICE_MODE
CMD ["/bin/sh", "-c", "if [ \"$SERVICE_MODE\" = \"sdr-relay\" ]; then /usr/local/bin/bun run src/sdr-relay/index.ts; else /usr/local/bin/bun run src/backend/cli/main.ts run; fi"]
