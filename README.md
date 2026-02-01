# Night Watch

[![CI](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/ci.yml/badge.svg)](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/ci.yml)
[![Docker Build](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/docker-build.yml/badge.svg)](https://github.com/milesburton/noaa-satellite-capture/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Night Watch** - an automated satellite signal capture and decoding platform. Tracks satellites across the sky, receiving and decoding weather imagery from NOAA satellites and SSTV transmissions from the ISS.

## Features

- **Autonomous Operation**: Automatically predicts, schedules, and captures satellite passes
- **Real-Time Visualization**: Web dashboard with live 3D globe, FFT waterfall/spectrum, and pass timeline
- **Multi-Signal Support**: APT (NOAA weather satellites) and SSTV (ISS + 2m ground) decoding
- **2m SSTV Scanner**: Scans amateur SSTV frequencies during idle time using FFT-based signal detection
- **Per-Band Gain Calibration**: Automatic gain adjustment per frequency band (NOAA vs 2m)
- **Persistent Waterfall**: Server-side FFT history buffer — waterfall survives page refreshes
- **Flexible Architecture**: Single-device or distributed setups

## Supported Satellites

| Satellite | Signal | Frequency |
|-----------|--------|-----------|
| **NOAA 15** | APT | 137.6125 MHz |
| **NOAA 18** | APT | 137.9125 MHz |
| **NOAA 19** | APT | 137.1000 MHz |
| **ISS** | SSTV | 145.800 MHz |
| **2m SSTV** | SSTV | 144.5 / 145.5 MHz |

## Quick Start

### Prerequisites

- RTL-SDR dongle (RTL2832U-based)
- VHF antenna (137MHz for NOAA, 145MHz for ISS)
- Docker and Docker Compose v2
- Raspberry Pi 4/5 or Linux machine

### Setup

```bash
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture

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

**Runtime**: Bun
**Backend**: TypeScript, SQLite
**Frontend**: React, Vite, Tailwind CSS, Zustand
**Signal Processing**: rtl_sdr → fft.js (real-time waterfall), rtl_fm → sox → aptdec (recording)

## Documentation

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## License

MIT © 2025–2026 - See [LICENSE](LICENSE) for details.

## Acknowledgments

- [aptdec](https://github.com/Xerbo/aptdec) - APT signal decoder
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 implementation
- [CelesTrak](https://celestrak.org/) - TLE data provider
