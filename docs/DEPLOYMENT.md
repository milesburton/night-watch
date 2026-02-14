# Night Watch Deployment Guide

> **⚠️ IMPORTANT**: Deployment scripts are in the `scripts/deploy/` submodule (private homelab repo).
> **DO NOT** create new deployment scripts in the main repository. Use existing scripts:
> - `./scripts/deploy/deploy.sh --target pi` - Deploy to Pi
> - `./scripts/deploy/status.sh` - Check status
> - `./scripts/deploy/logs.sh` - View logs

**Version**: 2.0.20260208 (date-based)  
**Satellites**: METEOR-M LRPT, ISS SSTV, 2M SSTV

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

## Docker Build

> **Docker Basics**: See [Docker documentation](https://docs.docker.com/build/) for general container concepts.

**Build Strategy** (Night Watch specific):
- **Staging**: Push code to GitHub → GitHub Actions builds multi-platform images (x86_64 + ARM64)
- **Deployment**: Pi pulls pre-built ARM64 images from GitHub Container Registry (no local build needed)
- **Why?**: Raspberry Pi lacks the performance for building large container images

**Runtime**: Node.js 22.x LTS (switched from Bun in Feb 2026 for Raspberry Pi 4 compatibility). See [RUNTIME-MIGRATION.md](reference/RUNTIME-MIGRATION.md) for details if needed.

```bash
# Production workflow:
git push origin main
# → GitHub Actions builds images automatically
# → Run deploy script to pull latest
bash scripts/deploy/deploy.sh
```

**Local Development** (without SDR hardware):
```bash
export SKIP_SIGNAL_CHECK=true SERVICE_MODE=full STATION_LATITUDE=51.5 STATION_LONGITUDE=-0.1
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
