# RFCapture Deployment Guide

## Current Status

**Version**: 2.0.0  
**Last Updated**: 2026-01-16  
**Git Branch**: master  
**Tests**: 149 passing ✓  
**TypeScript**: No errors ✓  
**Commits Ahead**: 5 commits ahead of origin/master  

## Recent Commits

```
a657303 - style: fix backend linting issues
59d91ca - fix: resolve TypeScript error in tle-fetcher test
934f777 - docs: add service modes architecture to README
82d9e41 - feat: restructure project with SDR relay separation architecture
f64a86f - fix: improve doppler calculation accuracy for edge positions
```

## Deployment Modes

### 1. Full Mode (Single Machine)

**Use Case**: Raspberry Pi with SDR at antenna location

```bash
# On the Pi
cd /home/pi/noaa-satellite-capture
cp .appcontainer/.env.example .env
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
cp .appcontainer/.env.example .env
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
cp .appcontainer/.env.example .env
nano .env  # Set coordinates and SDR_RELAY_URL

# Set the relay URL
export SDR_RELAY_URL=http://your-pi-ip:3001

# Start server only
docker compose -f docker/compose.yaml --profile server up -d

# Access web dashboard
http://your-server-ip:8002
```

## Automated Deployment with Scripts

### Using deploy/deploy.sh

```bash
# Configure .env file first
cp .appcontainer/.env.example .env
nano .env  # Set DEPLOY_TARGET, DEPLOY_DIR, and coordinates

# Deploy to remote Pi
./deploy/deploy.sh

# Deploy with full rebuild
./deploy/deploy.sh --full

# Skip health check
./deploy/deploy.sh --skip-health
```

### Other Helper Scripts

```bash
# Check deployment status
./deploy/status.sh

# View logs
./deploy/logs.sh

# Restart services
./deploy/restart.sh

# SSH into deployment
./deploy/ssh.sh
```

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
DEPLOY_TARGET=pi@192.168.1.100
DEPLOY_DIR=noaa-satellite-capture
DEPLOY_PORT=8002
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
bun run src/backend/cli/main.ts --help

# Predict passes
bun run predict

# Run tests
bun test  # Should see 149 pass
```

### 2. Type Check

```bash
bunx tsc --noEmit  # Should complete without errors
```

### 3. Lint Check

```bash
bunx biome check .  # Frontend warnings are non-blocking
```

### 4. Build Frontend

```bash
cd frontend && bun run build
# Should see: ✓ built in ~2s
```

## Docker Build Commands

### Build Full Image

```bash
docker build -f docker/Dockerfile -t rfcapture:latest .
```

### Two-Tier Build (Faster Deploys)

```bash
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
bun test  # Run tests
# All 149 should pass
# Some TLE fetch errors are expected (test mocks)
```

### TypeScript Errors

```bash
bunx tsc --noEmit  # Should complete silently
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
   ./deploy/deploy.sh
   ```

4. **Monitor Initial Passes**:
   ```bash
   ./deploy/logs.sh -f
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
│   ├── middleware/        # Web server
│   └── sdr-relay/         # SDR hardware interface
├── frontend/              # React UI
├── docker/                # All Docker configs
├── deploy/                # Deployment scripts
└── tests/                 # 149 tests

Tests: 149 passing ✓
TypeScript: 0 errors ✓  
Architecture: Modular & scalable ✓
```

## Success Criteria

- [x] All 149 tests passing
- [x] TypeScript compiles without errors
- [x] Frontend builds successfully
- [x] Docker Compose configs valid
- [x] Three service modes working
- [x] Documentation complete
- [x] Deployment scripts ready

**Status**: ✅ READY FOR DEPLOYMENT
