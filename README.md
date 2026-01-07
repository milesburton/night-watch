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

## Prerequisites

- Docker and Docker Compose v2 installed on the host machine
- RTL-SDR dongle connected via USB

### Installing Docker (Raspberry Pi / Debian / Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in (or reboot) for group changes to take effect. Verify with:

```bash
docker compose version
```

## Quick Start

```bash
git clone https://github.com/milesburton/noaa-satellite-capture.git
cd noaa-satellite-capture
cp .env.example .env
nano .env   # Set your coordinates (see Configuration below)
docker compose up -d
```

Web dashboard: `http://localhost:3000`

**Troubleshooting:** If you get "no configuration file provided", ensure you're in the project directory and have Docker Compose v2 installed (`docker compose version`). The project uses `compose.yaml` which requires Compose v2.

## Running Continuously

The container runs as a daemon and automatically restarts unless stopped.

```bash
docker compose up -d      # Start in background
docker compose logs -f    # View live logs
docker compose stop       # Stop the container
docker compose start      # Start a stopped container
docker compose down       # Stop and remove container (data persists)
docker compose down -v    # Stop and remove container AND volumes (deletes all data)
```

## Data Persistence

RFCapture uses Docker named volumes to persist data across container restarts and updates:

| Volume | Path | Contents |
|--------|------|----------|
| `rfcapture-data` | `/app/data` | SQLite database with capture history |
| `rfcapture-recordings` | `/app/recordings` | Raw WAV recordings |
| `rfcapture-images` | `/app/images` | Decoded satellite images |

To inspect volumes:

```bash
docker volume ls | grep rfcapture
docker volume inspect rfcapture-images
```

To backup your data:

```bash
docker run --rm -v rfcapture-images:/data -v $(pwd):/backup alpine tar czf /backup/images-backup.tar.gz -C /data .
```

## Running Commands

All commands should be run inside the container:

```bash
docker compose exec rfcapture bun run predict    # Show upcoming passes
docker compose exec rfcapture bun run status     # Check system status
docker compose exec rfcapture bun test           # Run tests
```

Or start an interactive shell:

```bash
docker compose exec rfcapture bash
```

## Configuration

All configuration is via environment variables in `.env`:

```env
STATION_LATITUDE=51.5069      # Your latitude
STATION_LONGITUDE=-0.1276     # Your longitude
STATION_ALTITUDE=10           # Altitude in metres

SDR_GAIN=45                   # RTL-SDR gain (0-50, or 'auto')
SDR_PPM_CORRECTION=0          # Frequency correction
MIN_ELEVATION=20              # Minimum pass elevation in degrees

WEB_PORT=3000                 # Web dashboard port
LOG_LEVEL=info                # debug, info, warn, error
```

## Web Dashboard

- Live system status with capture progress
- Upcoming passes with frequency and signal type
- Doppler shift visualization during captures
- ISS SSTV toggle for event-based capture
- Image gallery with capture history

## Development

For development, use the VS Code Dev Container:

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension
2. Open the project in VS Code
3. Click "Reopen in Container" when prompted

Inside the dev container:

```bash
bun install           # Install dependencies
bun start             # Start capture daemon
bun test              # Run tests
bun run lint          # Check code style
```

## References

- [aptdec](https://github.com/Xerbo/aptdec) - APT signal decoder
- [satellite.js](https://github.com/shashwatak/satellite-js) - SGP4 orbital mechanics
- [RTL-SDR](https://www.rtl-sdr.com/rtl-sdr-quick-start-guide/)

## Licence

MIT
