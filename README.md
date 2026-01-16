# Night Watch

[![CI](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/ci.yml/badge.svg)](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/ci.yml)
[![Docker Build](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/docker-build.yml/badge.svg)](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)

**Night Watch** is an automated satellite signal capture and decoding platform. It tracks, receives, and decodes APT imagery from NOAA weather satellites and SSTV transmissions from the ISS - all through an elegant web interface with real-time spectrum analysis.

## Features

- Automatic satellite pass prediction using SGP4/SDP4 orbital mechanics
- Real-time capture scheduling with Doppler shift compensation
- APT signal decoding for NOAA weather satellites
- ISS SSTV event-based capture support
- Modern React web dashboard with 3D globe visualization
- SQLite database for capture history and statistics
- Docker-based deployment for Raspberry Pi and Linux
- **Flexible deployment modes**: Run everything on one device or split SDR hardware from processing

## Deployment Modes

Night Watch supports three deployment architectures controlled by the `SERVICE_MODE` environment variable:

| Mode | Description | Use Case |
|------|-------------|----------|
| **full** (default) | Everything on one machine | Single Raspberry Pi with SDR |
| **sdr-relay** | Lightweight SDR hardware interface | Pi with SDR, connects to remote server |
| **server** | API + Frontend + Scheduler | Powerful server, connects to remote SDR |

This enables flexible deployments where SDR hardware runs on a Pi at your antenna location while compute-intensive processing runs on separate server hardware. See [docker/README.md](docker/README.md) for detailed deployment instructions.

## Supported Signals

| Satellite | Signal | Frequency |
|-----------|--------|-----------|
| NOAA 15 | APT | 137.6125 MHz |
| NOAA 18 | APT | 137.9125 MHz |
| NOAA 19 | APT | 137.1000 MHz |
| ISS | SSTV | 145.800 MHz |

## Hardware Requirements

- RTL-SDR dongle (RTL2832U-based)
- VHF antenna (137MHz turnstile/QFH for APT, or 145MHz for SSTV)
- Raspberry Pi 4/5 or Linux machine with USB port

## Prerequisites

- Docker and Docker Compose v2
- RTL-SDR dongle connected via USB

### Installing Docker (Raspberry Pi / Debian / Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in (or reboot) for group changes to take effect:

```bash
docker compose version
```

## Quick Start

### Single Machine Deployment (Full Mode)

```bash
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture
cp .appcontainer/.env.example .env
nano .env   # Set your coordinates and deployment target
docker compose -f docker/compose.yaml up -d
```

Web dashboard: `http://localhost:8002`

### Split Deployment (SDR Relay + Server)

For better performance, run SDR on a Pi and processing on a server:

**On Raspberry Pi (with SDR hardware):**
```bash
docker compose -f docker/compose.yaml --profile sdr-relay up -d
```

**On Server (without SDR):**
```bash
SDR_RELAY_URL=http://your-pi-ip:3001 docker compose -f docker/compose.yaml --profile server up -d
```

See [docker/README.md](docker/README.md) for detailed deployment options.

## Configuration

All configuration is via environment variables in `.env`:

```env
# Ground station location
STATION_LATITUDE=51.5069      # Your latitude (-90 to 90)
STATION_LONGITUDE=-0.1276     # Your longitude (-180 to 180)
STATION_ALTITUDE=10           # Altitude in metres

# SDR configuration
SDR_GAIN=45                   # RTL-SDR gain (0-50, or 'auto')
SDR_PPM_CORRECTION=0          # Frequency correction in PPM
SDR_SAMPLE_RATE=48000         # Sample rate in Hz

# Capture settings
MIN_ELEVATION=20              # Minimum pass elevation in degrees
MIN_SIGNAL_STRENGTH=-20       # Minimum signal strength in dB

# Paths
RECORDINGS_DIR=/app/recordings
IMAGES_DIR=/app/images
DATABASE_PATH=/app/data/captures.db

# Web server
WEB_PORT=3000
DEPLOY_PORT=8002              # External port mapping

# Other
TLE_UPDATE_INTERVAL_HOURS=24  # TLE refresh interval
LOG_LEVEL=info                # debug, info, warn, error
```

## Docker Commands

```bash
# Start in background
docker compose up -d

# View live logs
docker compose logs -f

# Stop container
docker compose stop

# Restart container
docker compose restart

# Stop and remove (data persists in volumes)
docker compose down

# Stop and remove including volumes (deletes all data)
docker compose down -v
```

### Running Commands Inside Container

```bash
# Show upcoming passes
docker compose exec rfcapture bun run predict

# Check system status
docker compose exec rfcapture bun run status

# Run tests
docker compose exec rfcapture bun test

# Interactive shell
docker compose exec rfcapture bash
```

### Health Check

```bash
docker inspect --format='{{json .State.Health.Status}}' rfcapture
```

## Data Persistence

RFCapture uses Docker named volumes to persist data:

| Volume | Container Path | Contents |
|--------|---------------|----------|
| `rfcapture-data` | `/app/data` | SQLite database |
| `rfcapture-recordings` | `/app/recordings` | Raw WAV recordings |
| `rfcapture-images` | `/app/images` | Decoded satellite images |

### Backup Data

```bash
# Backup images
docker run --rm -v rfcapture-images:/data -v $(pwd):/backup alpine \
  tar czf /backup/images-backup.tar.gz -C /data .

# Backup database
docker run --rm -v rfcapture-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/database-backup.tar.gz -C /data .
```

## Web Dashboard

The React-based web dashboard provides:

- Real-time system status with capture progress
- 3D globe with satellite positions and ground tracks
- Upcoming passes with frequency and signal information
- Doppler shift visualization during captures
- ISS SSTV toggle for event-based capture
- Image gallery with capture history
- Diagnostics panel for debugging

## Project Structure

```
src/
├── backend/           # Node.js/Bun backend
│   ├── capture/       # Signal capture and decoding
│   │   └── decoders/  # APT and SSTV decoders
│   ├── cli/           # Command-line interface
│   ├── config/        # Configuration management
│   ├── db/            # SQLite database
│   ├── prediction/    # Orbital mechanics and pass prediction
│   ├── satellites/    # Satellite definitions and TLE fetching
│   ├── scheduler/     # Pass scheduling
│   ├── sdr-client/    # Client for remote SDR relay communication
│   ├── state/         # Application state management
│   ├── types.ts       # Shared type definitions
│   └── utils/         # Utilities (logger, fs, shell)
├── frontend/          # React frontend (Vite + Tailwind)
│   ├── src/           # React components
│   ├── package.json   # Frontend dependencies
│   └── vite.config.ts # Vite build configuration
├── middleware/        # Web server and API
│   └── web/           # HTTP server, WebSocket, static files
└── sdr-relay/         # Lightweight SDR hardware interface (for sdr-relay mode)

docker/                # Docker configuration for all deployment modes
tests/                 # Vitest test suites
deploy/                # Deployment scripts (git submodule)
```

## Development

### Local Development

```bash
# Install dependencies
bun install

# Start backend in development mode
bun run dev

# Start frontend development server (separate terminal)
bun run dev:ui

# Run tests
bun test

# Run tests with coverage
bun run test:coverage

# Type check
bun run typecheck

# Lint
bun run lint
bun run lint:fix
```

### VS Code Dev Container

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
2. Open the project in VS Code
3. Click "Reopen in Container" when prompted

### Testing

Tests use [Vitest](https://vitest.dev/) with 145+ test cases covering:

- Orbital mechanics and pass prediction
- Doppler shift calculations
- Ground track computation
- State management
- TLE fetching
- File system utilities
- Shell command execution
- Decoder registry

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run with coverage report
bun run test:coverage
```

## Architecture

### Signal Flow

```
RTL-SDR → rtl_fm → sox → WAV file → aptdec → PNG images
                                          ↓
                                    SQLite database
                                          ↓
                                    Web dashboard
```

### Pass Prediction

1. Fetch TLE (Two-Line Element) data from CelesTrak
2. Propagate satellite position using SGP4/SDP4 algorithm
3. Calculate pass times (AOS/LOS) for ground station
4. Filter passes by minimum elevation
5. Schedule captures with Doppler compensation

### WebSocket Events

The backend emits real-time events to connected clients:

- `status_change` - System status updates
- `pass_start` - Capture beginning
- `capture_progress` - Recording progress
- `pass_complete` - Capture finished
- `passes_updated` - New pass predictions
- `satellite_positions` - Real-time satellite positions

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | System status |
| `/api/passes` | GET | Upcoming passes |
| `/api/captures` | GET | Capture history |
| `/api/images` | GET | Image gallery |
| `/api/satellites` | GET | Satellite list |
| `/api/sstv/status` | GET | SSTV status |
| `/api/sstv/toggle` | POST | Toggle SSTV capture |
| `/ws` | WebSocket | Real-time updates |

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs rfcapture

# Verify USB device
lsusb | grep RTL
```

### No RTL-SDR detected

```bash
# Ensure device is accessible
docker compose exec rfcapture rtl_test -t

# Check permissions
sudo chmod 666 /dev/bus/usb/*/*
```

### Poor signal quality

- Check antenna connection and positioning
- Adjust `SDR_GAIN` (try 30-50)
- Calibrate `SDR_PPM_CORRECTION` using known FM stations
- Ensure minimum 20 degree elevation (`MIN_ELEVATION`)

### TLE fetch failures

TLEs are cached for 24 hours. If fetching fails:

```bash
# Check network connectivity
docker compose exec rfcapture curl -I https://celestrak.org

# Force TLE refresh by restarting
docker compose restart
```

## References

- [aptdec](https://github.com/Xerbo/aptdec) - APT signal decoder
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 orbital mechanics
- [RTL-SDR Quick Start](https://www.rtl-sdr.com/rtl-sdr-quick-start-guide/)
- [NOAA APT Protocol](https://www.sigidwiki.com/wiki/Automatic_Picture_Transmission_(APT))
- [CelesTrak](https://celestrak.org/) - TLE data source

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

The project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

## License

MIT - see [LICENSE](LICENSE) for details.
