# App image for RF Capture
# Extends rfcapture-base with just the application code
# Build with: docker build -f Dockerfile.app -t rfcapture:latest .
# This builds FAST because it only copies source code (no npm install, no apt-get)

ARG BASE_IMAGE=rfcapture-base:latest
FROM ${BASE_IMAGE}

WORKDIR /app

# Build frontend (uses cached node_modules from base)
COPY frontend ./frontend
RUN cd frontend && /usr/local/bin/bun run build

# Copy backend source
COPY src ./src
COPY tsconfig.json ./
COPY version.json ./

# Copy built frontend to middleware static directory
RUN cp -r frontend/dist/* src/middleware/web/static-react/ 2>/dev/null || true

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1

CMD ["/usr/local/bin/bun", "run", "src/backend/cli/main.ts", "run"]
