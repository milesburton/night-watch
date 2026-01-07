# NOAA Satellite Pass Recorder 🛰️📡

Automatically capture NOAA weather satellite imagery using an RTL-SDR, a tuned 137MHz turnstile antenna, and a Raspberry Pi.

## Overview

This system automates the recording and decoding of passes from NOAA weather satellites (NOAA-15, NOAA-18, and NOAA-19) as they orbit overhead, capturing APT (Automatic Picture Transmission) signals directly from space.

## Hardware Requirements

- Raspberry Pi (3B+ or newer recommended)
- RTL-SDR dongle
- 137MHz turnstile antenna (optimised for APT signals)
- Appropriate cables and connectors

## Software Requirements

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

## Installation

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
STATION_LATITUDE=51.5074    # Your latitude in decimal degrees
STATION_LONGITUDE=-0.1278    # Your longitude in decimal degrees
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
```

## Usage

### Predict Upcoming Passes

```bash
bun run predict

# Predict for next 48 hours
bun run predict 48
```

### Start Automatic Capture

```bash
bun start
```

The system will:
1. Fetch current TLE orbital data from CelesTrak
2. Predict satellite passes for your location
3. Wait for each pass and automatically record
4. Decode the audio into weather images

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

## Project Structure

```
src/
├── index.ts                    # Main entry point
├── types.ts                    # TypeScript type definitions
├── config/
│   └── config.ts               # Environment configuration
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
│   └── scheduler.ts            # Pass scheduling & capture orchestration
├── cli/
│   └── predict.ts              # CLI pass prediction tool
└── utils/
    ├── logger.ts               # Structured logging
    ├── shell.ts                # Command execution
    └── fs.ts                   # File system utilities
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
