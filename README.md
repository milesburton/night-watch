# Night Watch

[![CI](https://github.com/milesburton/night-watch/actions/workflows/ci.yml/badge.svg)](https://github.com/milesburton/night-watch/actions/workflows/ci.yml)
[![Docker Build](https://github.com/milesburton/night-watch/actions/workflows/docker-build.yml/badge.svg)](https://github.com/milesburton/night-watch/actions/workflows/docker-build.yml)
[![Tests](https://img.shields.io/badge/tests-234%20passing-brightgreen)](https://github.com/milesburton/night-watch/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/docker-multi--arch-2496ED?logo=docker&logoColor=white)](https://github.com/milesburton/night-watch/pkgs/container/night-watch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Night Watch** - an automated satellite signal capture and decoding platform. Tracks satellites across the sky, receiving and decoding weather imagery from METEOR-M satellites and SSTV transmissions from the ISS.

## Features

- **Autonomous Operation**: Automatically predicts, schedules, and captures satellite passes
- **Real-Time Visualization**: Web dashboard with live 3D globe, FFT waterfall/spectrum, and pass timeline
- **Multi-Signal Support**: LRPT (METEOR-M weather satellites) and SSTV (ISS + 2m ground) decoding
- **2m SSTV Scanner**: Scans amateur SSTV frequencies during idle time using FFT-based signal detection
- **Per-Band Gain Calibration**: Automatic gain adjustment per frequency band (METEOR vs 2m)
- **Persistent Waterfall**: Server-side FFT history buffer — waterfall survives page refreshes
- **Flexible Architecture**: Single-device or distributed setups

## Supported Satellites

| Satellite | Signal | Frequency | Status |
|-----------|--------|-----------|--------|
| **METEOR-M N2-3** | LRPT | 137.9 MHz | Active |
| **METEOR-M N2-4** | LRPT | 137.9 MHz | Active |
| **ISS** | SSTV | 145.800 MHz | Event-based |
| **2m SSTV** | SSTV | 144.5 / 145.5 MHz | Ground |

> **Note**: All NOAA APT satellites (NOAA-15, NOAA-18, NOAA-19) were decommissioned in 2025. This project now focuses on METEOR-M LRPT and ISS SSTV signals.

## Quick Start

### Prerequisites

- RTL-SDR dongle (RTL2832U-based)
- VHF antenna (137MHz for METEOR-M, 145MHz for ISS)
- Docker and Docker Compose v2
- Raspberry Pi 4/5 or Linux machine

### Setup

```bash
git clone https://github.com/milesburton/night-watch.git
cd night-watch

cp .env.example .env
vi .env  # Set your coordinates

docker compose -f docker/compose.yaml up -d
```

Access dashboard at http://localhost:8002

## Configuration

All configuration via `.env` environment variables:

```env
# Station Location (required)
STATION_LATITUDE=51.5069
STATION_LONGITUDE=-0.1276
STATION_ALTITUDE=10

# SDR Hardware
SDR_GAIN=45
SDR_PPM_CORRECTION=0
SDR_SAMPLE_RATE=48000

# Capture Thresholds
MIN_ELEVATION=20
MIN_SIGNAL_STRENGTH=-30
```

## Deployment Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **full** (default) | All-in-one | Single Raspberry Pi with SDR |
| **sdr-relay** | Hardware interface only | Pi at antenna, server elsewhere |
| **server** | Processing + UI only | Powerful server, remote SDR |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for details.

## Docker Commands

```bash
docker compose -f docker/compose.yaml up -d      # Start
docker compose -f docker/compose.yaml logs -f    # View logs
docker compose -f docker/compose.yaml restart    # Restart
docker compose -f docker/compose.yaml down       # Stop
```

## Troubleshooting

### No RTL-SDR Detected

```bash
lsusb | grep RTL
docker compose exec rfcapture rtl_test -t
sudo chmod 666 /dev/bus/usb/*/*
```

### Poor Signal Quality

- Check antenna positioning (clear line of sight)
- Adjust `SDR_GAIN` (try 30-50, or 'auto') — per-band gain is calibrated automatically at runtime
- Calibrate `SDR_PPM_CORRECTION` using FM stations
- The Raspberry Pi 4 generates significant QRN (electrical noise) - use a USB extension cable to place the SDR dongle away from the Pi

### SDR Device Conflicts

The system uses a single RTL-SDR device shared between the FFT stream (waterfall display) and recording. The FFT stream is automatically stopped when recording begins, and restarted afterward. If you see "usb_claim_interface error -6", ensure no other processes (e.g. `rtl_test`, `rtl_power`) are using the device.

## Technical Details

**Runtime**: Node.js 22.x LTS
**Backend**: TypeScript, SQLite
**Frontend**: React, Vite, Tailwind CSS, Zustand
**Signal Processing**: rtl_sdr → fft.js (real-time waterfall), rtl_fm → sox → SatDump (LRPT recording)

## Documentation

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## License

MIT © 2025–2026 - See [LICENSE](LICENSE) for details.

## Acknowledgments

- [SatDump](https://github.com/SatDump/SatDump) - LRPT signal decoder
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 implementation
- [CelesTrak](https://celestrak.org/) - TLE data provider
