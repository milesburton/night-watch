# Docker Deployment

This directory contains all Docker-related configuration files for the NOAA Satellite Capture system.

## Service Modes

The system supports three deployment modes controlled by the `SERVICE_MODE` environment variable:

| Mode | Description | Use Case |
|------|-------------|----------|
| `full` | Everything on one machine (default) | Single Raspberry Pi deployment |
| `sdr-relay` | SDR hardware only | Pi with SDR, connects to remote server |
| `server` | API + Frontend + Scheduler | Server hardware, connects to remote SDR |

## Quick Start

### Full Mode (Default)

Run everything on a single machine (e.g., Raspberry Pi with SDR):

```bash
# From project root
docker compose -f docker/compose.yaml up -d
```

### Split Deployment

For better performance, run the SDR relay on the Pi and the server on more powerful hardware.

**On the Raspberry Pi (with SDR hardware):**

```bash
docker compose -f docker/compose.yaml --profile sdr-relay up -d
```

**On the Server (no SDR required):**

```bash
SDR_RELAY_URL=http://your-pi-ip:3001 docker compose -f docker/compose.yaml --profile server up -d
```

## Files

| File | Description |
|------|-------------|
| `Dockerfile` | Main production image with all dependencies |
| `Dockerfile.app` | Fast rebuild image (extends base image) |
| `Dockerfile.base` | Base image with OS, Bun, system deps |
| `compose.yaml` | Docker Compose configuration |
| `.dockerignore` | Files to exclude from Docker builds |

## Environment Variables

### Service Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVICE_MODE` | `full` | `full`, `sdr-relay`, or `server` |
| `SDR_RELAY_URL` | - | URL of SDR relay (required when `SERVICE_MODE=server`) |
| `SDR_RELAY_PORT` | `3001` | Port for SDR relay server |
| `SDR_RELAY_HOST` | `0.0.0.0` | Host for SDR relay server |

### Station Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `STATION_LATITUDE` | `51.5069` | Station latitude |
| `STATION_LONGITUDE` | `-0.1276` | Station longitude |
| `STATION_ALTITUDE` | `10` | Station altitude in meters |

### SDR Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SDR_GAIN` | `45` | SDR gain (0-50) |
| `SDR_SAMPLE_RATE` | `48000` | Sample rate in Hz |
| `SDR_PPM_CORRECTION` | `0` | PPM frequency correction |

### Recording Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_ELEVATION` | `20` | Minimum pass elevation in degrees |
| `MIN_SIGNAL_STRENGTH` | `-20` | Minimum signal strength in dB |
| `RECORDINGS_DIR` | `/app/recordings` | Directory for recordings |
| `IMAGES_DIR` | `/app/images` | Directory for decoded images |

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_PORT` | `3000` | Web server port |
| `WEB_HOST` | `0.0.0.0` | Web server host |
| `DATABASE_PATH` | `/app/data/captures.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |

## Building Images

### Full Build

Build the complete image with all dependencies:

```bash
docker compose -f docker/compose.yaml build
```

### Two-Tier Build (Faster Deploys)

1. Build the base image once (contains OS, Bun, dependencies):

```bash
# From project root
docker build -f docker/Dockerfile.base -t rfcapture-base:latest .
```

2. Build the app image (just copies source code):

```bash
docker build -f docker/Dockerfile.app -t rfcapture:latest .
```

## Volumes

| Volume | Description |
|--------|-------------|
| `rfcapture-data` | SQLite database and app data |
| `rfcapture-recordings` | Raw WAV recordings |
| `rfcapture-images` | Decoded satellite images |
| `sdr-relay-recordings` | Temporary recordings on SDR relay |

## Network Ports

| Port | Service | Description |
|------|---------|-------------|
| `8002` | Web UI | Main application (mapped from internal 3000) |
| `3001` | SDR Relay | SDR relay API and WebSocket |

## Health Checks

All services include health checks:

- **Full/Server mode**: `curl -f http://localhost:3000/api/status`
- **SDR Relay mode**: `curl -f http://localhost:3001/health`

## Troubleshooting

### View Logs

```bash
# All services
docker compose -f docker/compose.yaml logs -f

# Specific service
docker compose -f docker/compose.yaml logs -f rfcapture
```

### Check Container Status

```bash
docker compose -f docker/compose.yaml ps
```

### Access Container Shell

```bash
docker compose -f docker/compose.yaml exec rfcapture /bin/bash
```

### Rebuild After Code Changes

```bash
docker compose -f docker/compose.yaml up -d --build
```
