# Night Watch Deployment Guide

> **⚠️ IMPORTANT**: Deployment scripts are in the `scripts/deploy/` submodule (private homelab repo).
> **DO NOT** create new deployment scripts in the main repository. Use existing scripts:
> - `./scripts/deploy/deploy.sh --target pi` - Deploy to Pi
> - `./scripts/deploy/status.sh` - Check status
> - `./scripts/deploy/logs.sh` - View logs

## Current Status

**Version**: 2.0.20260208 (date-based)
**Last Updated**: 2026-02-08
**Git Branch**: main
**Tests**: All passing (234/234)
**TypeScript**: No errors
**Satellites**: METEOR-M LRPT, ISS SSTV, 2M SSTV

## Directory Structure Note

This project uses `docker/` for all production Docker configurations. While this may seem asymmetric with `.devcontainer/` (used for VS Code development containers), the `docker/` convention is more widely recognized in the Docker ecosystem. The `.devcontainer/` prefix is specifically recognized by VS Code and GitHub Codespaces, whereas `.appcontainer/` is not a standard convention.

## Deployment Modes

### 1. Full Mode (Single Machine)

**Use Case**: Raspberry Pi with SDR at antenna location

```bash
# On the Pi
cd /home/pi/noaa-satellite-capture
cp .env.example .env
nano .env  # Configure your coordinates and settings

# Start the service
docker compose -f docker/compose.yaml up -d

# Check logs
docker compose -f docker/compose.yaml logs -f

# Access web dashboard
http://your-pi-ip:8002
```

### 2. Split Deployment (SDR Relay + Server)

**Use Case**: SDR on Pi, processing on powerful server

**Step 1: Start SDR Relay on Raspberry Pi**

```bash
# On the Pi
cd /home/pi/noaa-satellite-capture
cp .env.example .env
nano .env  # Set coordinates

# Start SDR relay only
docker compose -f docker/compose.yaml --profile sdr-relay up -d

# Verify relay is running
curl http://localhost:3001/health
```

**Step 2: Start Server on Remote Machine**

```bash
# On the server
cd /path/to/noaa-satellite-capture
cp .env.example .env
nano .env  # Set coordinates and SDR_RELAY_URL

# Set the relay URL
export SDR_RELAY_URL=http://your-pi-ip:3001

# Start server only
docker compose -f docker/compose.yaml --profile server up -d

# Access web dashboard
http://your-server-ip:8002
```

## Automated Deployment with Scripts

### Using scripts/deploy/deploy.sh

**Note**: Due to ARM build limitations, the deploy script transfers code and **pulls pre-built images** from GitHub Container Registry instead of building on the Pi.

```bash
# Configure .env file first
cp .env.example .env
nano .env  # Set DEPLOY_TARGET, DEPLOY_DIR, and coordinates

# Deploy to remote Pi (pulls pre-built ARM64 image from ghcr.io)
bash scripts/deploy/deploy.sh

# Full rebuild (still pulls image, but forces Docker Compose rebuild)
bash scripts/deploy/deploy.sh --full

# Skip health check
bash scripts/deploy/deploy.sh --skip-health
```

**Workflow**:
1. Make code changes locally
2. Push to GitHub: `git push origin main`
3. GitHub Actions builds ARM64 image (~5-10 min)
4. Deploy to Pi: `bash scripts/deploy/deploy.sh`
5. Pi pulls latest image from ghcr.io

## Environment Configuration

### Required Variables

```env
# Ground Station Location
STATION_LATITUDE=51.5069      # Your latitude
STATION_LONGITUDE=-0.1276     # Your longitude  
STATION_ALTITUDE=10           # Altitude in meters

# SDR Configuration
SDR_GAIN=45                   # 0-50 or 'auto'
SDR_SAMPLE_RATE=48000
SDR_PPM_CORRECTION=0

# Capture Settings
MIN_ELEVATION=20              # Minimum pass elevation (degrees)
MIN_SIGNAL_STRENGTH=-25       # Signal threshold (dB)

# Deployment (for deploy scripts)
DEPLOY_TARGET=user@your-pi-hostname
DEPLOY_DIR=noaa-satellite-capture
DEPLOY_PORT=80
```

### Service Mode Variables

```env
# For split deployment
SERVICE_MODE=full              # full, sdr-relay, or server
SDR_RELAY_URL=http://pi-ip:3001  # Required for server mode
SDR_RELAY_PORT=3001            # Port for relay (sdr-relay mode)
```

## Verification Steps

### 1. Test All Service Modes Locally

```bash
# Test configuration
export SERVICE_MODE=full
export STATION_LATITUDE=51.5
export STATION_LONGITUDE=-0.1
npx tsx src/backend/cli/main.ts --help

# Predict passes
npm run predict

# Run tests
npm test  # Should see 230 pass
```

### 2. Type Check

```bash
npx tsc --noEmit  # Should complete without errors
```

### 3. Lint Check

```bash
npx biome check .  # Frontend warnings are non-blocking
```

### 4. Build Frontend

```bash
cd src/frontend && npm run build
# Should see: ✓ built in ~2s
```

## Docker Build Commands

### ARM Build Notes

**Deployment to Raspberry Pi 4:**
The project uses Node.js 22.x LTS, which has excellent ARM compatibility including Cortex-A72 processors (Raspberry Pi 4).

**Build Strategy:**
- Build images using GitHub Actions (multi-platform support)
- Or build locally on x86_64 with cross-compilation
- Pi pulls pre-built arm64 images from GitHub Container Registry

**Historical Note:** The project originally used Bun runtime but switched to Node.js in Feb 2026 due to "Illegal instruction" crashes on Raspberry Pi 4's Cortex-A72. See [RUNTIME-MIGRATION.md](RUNTIME-MIGRATION.md) for details.

```bash
# DO NOT run these on Raspberry Pi - they will hang!
# Instead, push code and let GitHub Actions build:
git push origin main
# GitHub Actions builds ARM64 + AMD64 images automatically

# Or build locally with buildx (requires x86_64 machine):
docker buildx build --platform linux/arm64 -f docker/Dockerfile.app \
  -t ghcr.io/milesburton/noaa-satellite-capture:latest --push .
```

### Build Full Image

```bash
# x86_64 only - DO NOT run on Pi
docker build -f docker/Dockerfile -t rfcapture:latest .
```

### Two-Tier Build (Faster Deploys)

```bash
# x86_64 only - DO NOT run on Pi
# 1. Build base image (once)
docker build -f docker/Dockerfile.base -t rfcapture-base:latest .

# 2. Build app image (on each deploy)
docker build -f docker/Dockerfile.app -t rfcapture:latest .
```

### Test Locally (Without SDR)

```bash
# Set environment to skip SDR checks
export SKIP_SIGNAL_CHECK=true
export SERVICE_MODE=full
export STATION_LATITUDE=51.5
export STATION_LONGITUDE=-0.1

docker compose -f docker/compose.yaml up
```

## Port Mapping

| Service | Internal Port | External Port | Description |
|---------|--------------|---------------|-------------|
| Web UI | 3000 | 8002 | Main application |
| SDR Relay | 3001 | 3001 | SDR hardware interface |

## Health Checks

```bash
# Full/Server mode
curl http://localhost:8002/api/status

# SDR Relay mode  
curl http://localhost:3001/health

# Docker health check
docker inspect --format='{{json .State.Health.Status}}' rfcapture
```

## Troubleshooting

### Tests Failing

```bash
npm test  # Run tests
# All 230 should pass
# Some TLE fetch errors are expected (test mocks)
```

### TypeScript Errors

```bash
npx tsc --noEmit  # Should complete silently
```

### Docker Build Issues

```bash
# Check Dockerfile syntax
docker compose -f docker/compose.yaml config

# View build logs
docker compose -f docker/compose.yaml build --progress=plain
```

### Runtime Issues

```bash
# Check logs
docker compose -f docker/compose.yaml logs -f

# Check container status
docker compose -f docker/compose.yaml ps

# Interactive shell
docker compose -f docker/compose.yaml exec rfcapture bash
```

## Next Steps for Production

1. **Push to GitHub**:
   ```bash
   git push origin master
   git push origin feat/sdr-relay-separation  # If needed
   ```

2. **Tag Release**:
   ```bash
   git tag v2.0.0
   git push --tags
   ```

3. **Deploy to Hardware**:
   ```bash
   # Configure .env with actual hardware settings
   scripts/deploy/deploy.sh
   ```

4. **Monitor Initial Passes**:
   ```bash
   scripts/deploy/logs.sh -f
   # Watch for successful captures
   ```

## Architecture Summary

```
┌─────────────────────────────────────────────────┐
│               Full Mode (Default)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Frontend │ │  Backend │ │   SDR    │        │
│  │  (React) │─│ (Node.js)│─│ Hardware │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│       All components on one machine              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│            Split Mode (SDR Relay)                │
│                                                   │
│  ┌─────────────────────┐  ┌─────────────────┐  │
│  │  Raspberry Pi       │  │   Server        │  │
│  │  ┌──────────────┐   │  │  ┌──────────┐  │  │
│  │  │  SDR Relay   │   │  │  │ Backend  │  │  │
│  │  │  + Hardware  │───┼──┼─▶│+Frontend │  │  │
│  │  └──────────────┘   │  │  └──────────┘  │  │
│  │    Port 3001        │  │   Port 8002     │  │
│  └─────────────────────┘  └─────────────────┘  │
│   Lightweight SDR ops      Heavy processing     │
└─────────────────────────────────────────────────┘
```

## Project Structure

```
.
├── src/
│   ├── backend/           # Backend services
│   │   ├── capture/       # Signal capture
│   │   ├── cli/           # CLI commands
│   │   ├── prediction/    # Orbital mechanics
│   │   ├── sdr-client/    # Remote SDR client
│   │   └── ...
│   ├── frontend/          # React frontend
│   │   ├── src/           # React components
│   │   └── package.json   # Frontend dependencies
│   ├── middleware/        # Web server
│   └── sdr-relay/         # SDR hardware interface
├── docker/                # All Docker configs
├── deploy/                # Deployment scripts
└── tests/                 # 206 tests

Tests: 206 passing
TypeScript: 0 errors
Architecture: Modular & scalable
```

## Success Criteria

- [x] All 206 tests passing
- [x] TypeScript compiles without errors
- [x] Frontend builds successfully
- [x] Docker Compose configs valid
- [x] Three service modes working
- [x] Documentation complete
- [x] Deployment scripts ready

**Status**: ✅ READY FOR DEPLOYMENT
