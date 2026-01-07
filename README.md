# RFCapture

Multi-signal RF capture platform for satellite imagery. Automatically captures and decodes APT signals from NOAA weather satellites, with support for ISS SSTV events.

## Supported Signals

| Satellite | Signal | Frequency |
|-----------|--------|-----------|
| NOAA 15 | APT | 137.6125 MHz |
| NOAA 18 | APT | 137.9125 MHz |
| NOAA 19 | APT | 137.1000 MHz |
| ISS | SSTV | 145.800 MHz |

## Hardware

- RTL-SDR dongle
- VHF antenna (137MHz turnstile for APT, or 145MHz for SSTV)
- Raspberry Pi or Linux machine

## Quick Start

Use the Dev Container for the easiest setup:

```bash
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture
cp .env.example .env
```

Edit `.env` with your coordinates:

```env
STATION_LATITUDE=51.5069
STATION_LONGITUDE=-0.1276
STATION_ALTITUDE=10
```

Open in VS Code with the Dev Containers extension, or run with Docker:

```bash
docker compose up -d
```

Web dashboard: `http://localhost:3000`

## Configuration

```env
STATION_LATITUDE=51.5069
STATION_LONGITUDE=-0.1276
STATION_ALTITUDE=10

SDR_GAIN=45
SDR_PPM_CORRECTION=0
MIN_ELEVATION=20

WEB_PORT=3000
DATABASE_PATH=./data/captures.db
```

## Commands

```bash
bun start          # Start capture daemon
bun run predict    # Show upcoming passes
bun run status     # Check system status
bun test           # Run tests
```

## Web Dashboard

- Live system status with capture progress
- Upcoming passes with frequency and signal type
- Doppler shift visualization during captures
- ISS SSTV toggle for event-based capture
- Image gallery with capture history

## References

- [aptdec](https://github.com/Xerbo/aptdec) - APT signal decoder
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 orbital mechanics
- [RTL-SDR](https://www.rtl-sdr.com/rtl-sdr-quick-start-guide/)

## Licence

MIT
