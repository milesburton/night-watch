# Night Watch

[![CI](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/ci.yml/badge.svg)](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/ci.yml)
[![Docker Build](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/docker-build.yml/badge.svg)](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)

**Night Watch** - an automated satellite signal capture and decoding platform inspired by maritime tradition. Like mariners keeping watch under the stars, Night Watch tracks satellites across the sky, receiving and decoding weather imagery from NOAA satellites and SSTV transmissions from the ISS.

![Night Watch Dashboard](https://via.placeholder.com/800x400?text=Night+Watch+Dashboard)

## ✨ Features

- **Autonomous Operation**: Automatically predicts, schedules, and captures satellite passes
- **Real-Time Visualization**: Modern React dashboard with live 3D globe, FFT waterfall, and pass timeline
- **Multi-Signal Support**: APT (NOAA weather satellites) and SSTV (ISS) decoding
- **Flexible Architecture**: Three deployment modes for single-device or distributed setups
- **Dynamic Status Indicators**: Favicon changes color based on capture status (green=active, amber=waiting)
- **Comprehensive History**: SQLite database tracks all captures with detailed metadata

## 🛰️ Supported Satellites

| Satellite | Signal | Frequency | Details |
|-----------|--------|-----------|---------|
| **NOAA 15** | APT | 137.6125 MHz | Weather imagery (IR + visible) |
| **NOAA 18** | APT | 137.9125 MHz | Weather imagery (IR + visible) |
| **NOAA 19** | APT | 137.1000 MHz | Weather imagery (IR + visible) |
| **ISS** | SSTV | 145.800 MHz | Event-based SSTV transmissions |
| **2m SSTV** | SSTV | 144.5 / 145.5 MHz | Ground SSTV scanning |

## 🚀 Quick Start

### Prerequisites

- RTL-SDR dongle (RTL2832U-based)
- VHF antenna (137MHz for NOAA, 145MHz for ISS)
- Docker and Docker Compose v2
- Raspberry Pi 4/5 or Linux machine

### Single Machine Setup

```bash
# Clone repository
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture

# Configure environment
cp .appcontainer/.env.example .env
nano .env  # Set your coordinates

# Start Night Watch
docker compose -f docker/compose.yaml up -d

# Access dashboard
open http://localhost:8002
```

That's it! Night Watch will automatically:
1. Fetch TLE data from CelesTrak
2. Predict upcoming passes
3. Capture and decode signals
4. Display imagery in the web dashboard

## 🏗️ Deployment Modes

Night Watch supports three architectures for flexible deployment:

| Mode | Description | Use Case |
|------|-------------|----------|
| **full** (default) | All-in-one | Single Raspberry Pi with SDR |
| **sdr-relay** | Hardware interface only | Pi at antenna, server elsewhere |
| **server** | Processing + UI only | Powerful server, remote SDR |

**Example: Split Deployment**

```bash
# On Pi (with SDR hardware)
docker compose -f docker/compose.yaml --profile sdr-relay up -d

# On Server
SDR_RELAY_URL=http://pi.local:3001 \
docker compose -f docker/compose.yaml --profile server up -d
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment scenarios.

## ⚙️ Configuration

All configuration via `.env` environment variables:

```env
# Station Location (required)
STATION_LATITUDE=51.5069       # Your latitude
STATION_LONGITUDE=-0.1276      # Your longitude
STATION_ALTITUDE=10            # Altitude in meters

# SDR Hardware
SDR_GAIN=45                    # Gain 0-50 (or 'auto')
SDR_PPM_CORRECTION=0           # Frequency correction
SDR_SAMPLE_RATE=48000          # Sample rate in Hz

# Capture Thresholds
MIN_ELEVATION=20               # Minimum pass elevation (degrees)
MIN_SIGNAL_STRENGTH=-30        # Minimum signal strength (dB)
SKIP_SIGNAL_CHECK=false        # Skip signal check (for testing)

# Web Interface
WEB_PORT=3000                  # Internal port
DEPLOY_PORT=8002               # External port mapping
```

## 📊 Dashboard Features

The React-based web dashboard provides:

- **Live System Status**: Real-time capture state with dynamic favicon
- **3D Globe View**: Satellite positions with ground tracks
- **Pass Timeline**: Visual timeline showing next 12 hours with satellite labels (N15, N18, N19, ISS)
- **FFT Waterfall**: Real-time spectrum analysis with adjustable frequency
- **Signal Monitoring**: 2m SSTV scanning on 144.5 / 145.5 MHz
- **Capture Gallery**: All decoded imagery with metadata
- **Diagnostics Panel**: System logs and WebSocket status
- **Doppler Visualization**: Frequency shift during passes

## 🔧 Docker Commands

```bash
# Start in background
docker compose -f docker/compose.yaml up -d

# View logs
docker compose -f docker/compose.yaml logs -f

# Restart
docker compose -f docker/compose.yaml restart

# Stop (data persists)
docker compose -f docker/compose.yaml down

# Run commands inside container
docker compose -f docker/compose.yaml exec rfcapture bun run predict
docker compose -f docker/compose.yaml exec rfcapture bun test

# Health check
docker inspect --format='{{json .State.Health.Status}}' rfcapture
```

## 📁 Project Structure

```
night-watch/
├── src/
│   ├── backend/           # Node.js/Bun backend
│   │   ├── capture/       # Signal capture & FFT streaming
│   │   ├── cli/           # Command-line interface
│   │   ├── prediction/    # SGP4 orbit propagation
│   │   ├── satellites/    # TLE fetching & SSTV events
│   │   ├── scheduler/     # Pass scheduling
│   │   └── sdr-client/    # Remote SDR client
│   ├── frontend/          # React + Vite + Tailwind
│   │   └── src/           # Components, hooks, types
│   ├── middleware/        # Web server & WebSocket
│   └── sdr-relay/         # Lightweight SDR interface
├── docker/                # Docker configurations
├── docs/                  # Documentation
├── scripts/               # Deployment scripts
└── tests/                 # Vitest test suites (149 tests)
```

## 🧪 Development

### Local Development

```bash
# Install dependencies
bun install

# Start backend (watch mode)
bun run dev

# Start frontend dev server (separate terminal)
bun run dev:ui

# Run tests
bun test

# Type checking
bun run typecheck

# Linting
bun run lint:fix
```

### VS Code Dev Container

1. Install [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
2. Open project in VS Code
3. Click "Reopen in Container"

### Testing

Night Watch includes 149 test cases covering:
- Orbital mechanics (SGP4/SDP4)
- Doppler shift calculations
- Pass prediction accuracy
- Ground track computation
- State management
- Decoder registry
- File system operations

```bash
bun test              # Run all tests
bun test:watch        # Watch mode
bun run test:coverage # Coverage report
```

## 🏛️ Architecture

### Signal Processing Pipeline

```
RTL-SDR → rtl_fm → sox → WAV → aptdec → PNG
          (FM demod) (resample)  (decode)  (images)
                                     ↓
                              SQLite Database
                                     ↓
                              Web Dashboard
```

### Real-Time Communication

WebSocket events keep the UI synchronized:

- `status_change` - System state updates
- `pass_start` / `pass_complete` - Capture lifecycle
- `capture_progress` - Recording progress
- `passes_updated` - New pass predictions
- `fft_data` - Spectrum data for waterfall

## 🌐 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Current system status |
| `/api/passes` | GET | Upcoming passes (next 24h) |
| `/api/captures` | GET | Capture history with pagination |
| `/api/images/:filename` | GET | Decoded satellite imagery |
| `/api/sstv/status` | GET | SSTV status & events |
| `/api/sstv/toggle` | POST | Enable/disable ISS SSTV |
| `/api/fft/start` | POST | Start FFT stream |
| `/api/fft/stop` | POST | Stop FFT stream |
| `/ws` | WebSocket | Real-time bidirectional updates |

## 🐛 Troubleshooting

### No RTL-SDR Detected

```bash
# Verify USB device
lsusb | grep RTL

# Test in container
docker compose exec rfcapture rtl_test -t

# Check permissions
sudo chmod 666 /dev/bus/usb/*/*
```

### Poor Signal Quality

- Check antenna positioning (clear line of sight)
- Adjust `SDR_GAIN` (try 30-50, or 'auto')
- Calibrate `SDR_PPM_CORRECTION` using FM stations
- Ensure minimum 20° elevation

### Container Won't Start

```bash
# View detailed logs
docker compose -f docker/compose.yaml logs rfcapture

# Check environment
docker compose -f docker/compose.yaml config

# Verify volume mounts
docker volume ls | grep rfcapture
```

## 📚 Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Comprehensive deployment scenarios
- [Final Review](docs/FINAL_REVIEW.md) - v2.0.0 release review
- [Docker README](docker/README.md) - Container configuration details

## 🤝 Contributing

Contributions welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow [Conventional Commits](https://www.conventionalcommits.org/) format
4. Ensure tests pass (`bun test`)
5. Submit a Pull Request

**Commit Format:**
```
feat: add amazing feature
fix: resolve bug in decoder
docs: update README
refactor: reorganize file structure
test: add orbital mechanics tests
```

## 🙏 Acknowledgments

- [aptdec](https://github.com/Xerbo/aptdec) - APT signal decoder
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 implementation
- [CelesTrak](https://celestrak.org/) - TLE data provider
- RTL-SDR community for hardware support

## 📄 License

MIT © 2025 - See [LICENSE](LICENSE) for details.

---

**Night Watch** - *Keeping vigil under the stars, one satellite at a time* 🌙✨
