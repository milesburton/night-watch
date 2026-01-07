# NOAA Satellite Pass Recorder

Automatically capture NOAA weather satellite imagery using an RTL-SDR, a tuned 137MHz turnstile antenna, and a Raspberry Pi.

## Overview

This system automates the recording and decoding of passes from NOAA weather satellites (NOAA-15, NOAA-18, and NOAA-19) as they orbit overhead, capturing APT (Automatic Picture Transmission) signals directly from space.

Features:
- Real-time web dashboard with pass status and image gallery
- Automatic satellite pass prediction using SGP4 orbital mechanics
- Continuous capture daemon with SQLite history
- WebSocket-based live updates

## Hardware Requirements

- Raspberry Pi (3B+ or newer recommended)
- RTL-SDR dongle
- 137MHz turnstile antenna (optimised for APT signals)
- Appropriate cables and connectors

## Quick Start with Docker

The easiest way to run on a Raspberry Pi:

```bash
# Clone the repository
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture

# Create your configuration
cp .env.example .env
# Edit .env with your coordinates (STATION_LATITUDE, STATION_LONGITUDE)

# Start the container
docker compose up -d

# View logs
docker compose logs -f
```

The web dashboard will be available at `http://your-pi-ip:3000`

### Docker Environment Variables

You can configure the system via environment variables or a `.env` file:

```env
# Required: Your location
STATION_LATITUDE=51.5074
STATION_LONGITUDE=-0.1278
STATION_ALTITUDE=10

# Optional: SDR settings
SDR_GAIN=45
SDR_PPM_CORRECTION=0

# Optional: Recording settings
MIN_ELEVATION=20
```

## Manual Installation

### Software Requirements

- [Bun](https://bun.sh) (v1.0.0 or newer)
- RTL-SDR drivers (`rtl-sdr` package)
- Sox audio processing (`sox` package)
- [aptdec](https://github.com/Xerbo/aptdec) for APT signal decoding

### Installing Dependencies (Raspberry Pi / Debian)

```bash
# Install system packages
sudo apt update
sudo apt install rtl-sdr sox

# Install aptdec
sudo apt install cmake git gcc libsndfile-dev libpng-dev
git clone --recursive https://github.com/Xerbo/aptdec.git
cd aptdec
cmake -B build
cmake --build build
sudo cp build/aptdec /usr/local/bin/

# Install Bun
curl -fsSL https://bun.sh/install | bash
```

### Installation

```bash
# Clone the repository
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture

# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env with your station coordinates
```

## Configuration

Edit `.env` with your receiver location and settings:

```env
# Receiver Location (required)
# Example uses Charing Cross, London - replace with your coordinates
STATION_LATITUDE=51.5074    # Your latitude in decimal degrees
STATION_LONGITUDE=-0.1278   # Your longitude in decimal degrees
STATION_ALTITUDE=10         # Altitude in metres

# RTL-SDR Settings
SDR_GAIN=45                 # Gain setting (0-50)
SDR_SAMPLE_RATE=48000       # Sample rate
SDR_PPM_CORRECTION=0        # Frequency correction

# Recording Settings
MIN_ELEVATION=20            # Minimum pass elevation in degrees
MIN_SIGNAL_STRENGTH=-20     # Minimum signal strength in dB
RECORDINGS_DIR=./recordings
IMAGES_DIR=./images

# Web Dashboard
WEB_PORT=3000
WEB_HOST=0.0.0.0

# Database
DATABASE_PATH=./data/captures.db
```

## Usage

### Start the Capture Daemon

```bash
bun start
```

This starts the continuous capture daemon with the web dashboard. The system will:
1. Fetch current TLE orbital data from CelesTrak
2. Predict satellite passes for your location
3. Wait for each pass and automatically record
4. Decode the audio into weather images
5. Store results in SQLite and display on the web dashboard

### Other Commands

```bash
# Predict upcoming passes
bun run predict
bun run predict 48    # Next 48 hours

# Check system status
bun run status

# Start web server only (no capture)
bun run serve

# Show help
bun run src/cli/main.ts help
```

### Development

```bash
# Run with hot reload
bun run dev

# Run tests
bun test

# Type check
bun run typecheck

# Lint and format
bun run lint:fix
bun run format
```

## Web Dashboard

Access the dashboard at `http://localhost:3000` (or your Pi's IP address).

Features:
- **Live Status**: Current system state (Standby/Waiting/Capturing/Decoding)
- **Progress Bar**: Real-time capture progress with time remaining
- **Upcoming Passes**: Table of predicted satellite passes
- **Image Gallery**: Recent captures with thumbnails and metadata
- **Statistics**: Total, successful, and failed capture counts

## Project Structure

```
src/
├── cli/
│   ├── main.ts                 # Unified CLI entry point
│   └── commands/               # CLI subcommands
├── config/
│   └── config.ts               # Environment configuration
├── db/
│   └── database.ts             # SQLite database layer
├── state/
│   └── state-manager.ts        # System state management
├── web/
│   ├── server.ts               # HTTP/WebSocket server
│   └── static/                 # Dashboard frontend
├── satellites/
│   ├── constants.ts            # NOAA frequencies, NORAD IDs
│   └── tle.ts                  # TLE fetching & caching
├── prediction/
│   ├── orbit.ts                # SGP4 orbital calculations
│   └── passes.ts               # Pass prediction & filtering
├── capture/
│   ├── signal.ts               # Signal strength monitoring
│   ├── recorder.ts             # RTL-SDR audio recording
│   └── decoder.ts              # aptdec image decoding
├── scheduler/
│   └── scheduler.ts            # Pass scheduling & orchestration
├── utils/
│   ├── logger.ts               # Structured logging
│   ├── shell.ts                # Command execution
│   └── fs.ts                   # File system utilities
└── types.ts                    # TypeScript type definitions
```

## NOAA Satellites

| Satellite | Frequency   | NORAD ID |
|-----------|-------------|----------|
| NOAA 15   | 137.6125 MHz | 25338   |
| NOAA 18   | 137.9125 MHz | 28654   |
| NOAA 19   | 137.1000 MHz | 33591   |

## References

- [NOAA Satellite Information](https://www.nesdis.noaa.gov/our-satellites/currently-flying)
- [RTL-SDR Documentation](https://www.rtl-sdr.com/rtl-sdr-quick-start-guide/)
- [aptdec Decoder](https://github.com/Xerbo/aptdec)
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 propagation library

## Licence

This project is licensed under the MIT Licence - see the [LICENSE](LICENSE) file for details.
