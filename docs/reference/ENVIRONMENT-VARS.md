# Environment Variables Reference

All Night Watch configuration is controlled via environment variables in `.env`.

Start with `.env.example` as a template:
```bash
cp .env.example .env
nano .env
```

## Ground Station Location

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `STATION_LATITUDE` | float | `51.5069` | Your latitude (degrees, -90 to 90) |
| `STATION_LONGITUDE` | float | `-0.1276` | Your longitude (degrees, -180 to 180) |
| `STATION_ALTITUDE` | int | `10` | Altitude above sea level (meters) |

These affect satellite pass predictions and Doppler shift calculations. Accuracy to ±0.1° is sufficient.

## SDR Hardware Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SDR_GAIN` | int \| "auto" | `45` | RTL-SDR gain (0-50). Use 45-49 for typical setups, or "auto" |
| `SDR_SAMPLE_RATE` | int | `48000` | Sample rate in Hz (48000, 1M, 2M common) |
| `SDR_PPM_CORRECTION` | int | `0` | Frequency error correction in PPM (parts per million) |

### Finding Your SDR Settings

```bash
# Determine PPM correction
docker exec rfcapture rtl_test -p

# Test gain levels with a known satellite
docker exec rfcapture rtl_fm -f 137900000 -M ssb | sox -t raw -r 48k -b 16 -c 1 -e signed-integer - -n stat
```

## Capture Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MIN_ELEVATION` | int | `20` | Minimum elevation angle to capture (degrees, 0-90) |
| `MIN_SIGNAL_STRENGTH` | int | `-20` | Minimum signal strength threshold (dB) |

Higher `MIN_ELEVATION` = fewer passes but better quality. 20-30° is typical.

For reference: 0° is horizon, 90° is directly overhead.

## Recording & Output

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RECORDINGS_DIR` | path | `/app/recordings` | Where raw WAV files are stored |
| `IMAGES_DIR` | path | `/app/images` | Where decoded images are saved |
| `DATABASE_PATH` | path | `/app/data/captures.db` | SQLite database location |

## Web Server

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WEB_PORT` | int | `3000` | Internal API port |
| `WEB_HOST` | string | `0.0.0.0` | Bind address (0.0.0.0 = all interfaces) |

The web dashboard is exposed via Docker on the port you specify in `docker/compose.yaml`.

## Satellite Updates

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TLE_UPDATE_INTERVAL_HOURS` | int | `24` | How often to fetch fresh TLE data (hours) |

TLE (Two-Line Element) data defines satellite orbits. Updates every 24h is typical; more frequent isn't helpful.

## Service Mode

| Variable | Type | Options | Description |
|----------|------|---------|-------------|
| `SERVICE_MODE` | string | `full` \| `sdr-relay` \| `server` | Operating mode |
| `SDR_RELAY_URL` | URL | | URL of SDR relay (only for `server` mode) |
| `SDR_RELAY_PORT` | int | `3001` | Port for relay service (only for `sdr-relay` mode) |
| `SDR_RELAY_HOST` | string | `0.0.0.0` | Bind address for relay |

**Modes:**
- **`full`** (default) - Everything on one machine (Raspberry Pi)
- **`sdr-relay`** - SDR hardware interface only (lightweight, runs on Pi with antenna)
- **`server`** - Processing + web UI only (points to remote SDR relay)

## Logging & Debugging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `info` | Verbosity: `debug`, `info`, `warn`, `error` |
| `GROUND_SSTV_SCAN_ENABLED` | bool | `false` | Enable 2M SSTV scanning (experimental) |
| `ISS_SSTV_ENABLED` | bool | `true` | Enable ISS SSTV decoding |

## Example Configurations

### Typical Pi Setup (Full Mode)

```env
STATION_LATITUDE=51.5069
STATION_LONGITUDE=-0.1276
STATION_ALTITUDE=10

SDR_GAIN=45
SDR_PPM_CORRECTION=0
MIN_ELEVATION=20
MIN_SIGNAL_STRENGTH=-20

SERVICE_MODE=full
WEB_PORT=3000
LOG_LEVEL=info
```

### Split Deployment (Pi SDR Relay)

```env
# On the Pi (SDR, encoder, decoder)
SERVICE_MODE=sdr-relay
SDR_RELAY_HOST=0.0.0.0
SDR_RELAY_PORT=3001

STATION_LATITUDE=51.5069
STATION_LONGITUDE=-0.1276
SDR_GAIN=45
```

### Split Deployment (Server)

```env
# On the processing server (no SDR hardware)
SERVICE_MODE=server
SDR_RELAY_URL=http://192.168.1.206:3001  # IP of your Pi

STATION_LATITUDE=51.5069
STATION_LONGITUDE=-0.1276
WEB_PORT=3000
```

## Deployment Variables

These are used by deployment scripts (in `scripts/deploy/`), not by the application itself:

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `DEPLOY_TARGET` | string | `miles@raspberry-pi` | SSH target for deployment |
| `DEPLOY_DIR` | string | `noaa-satellite-capture` | Directory on target system |
| `DEPLOY_PORT` | int | `80` | External port (maps to WEB_PORT) |

```bash
DEPLOY_TARGET=pi-user@192.168.1.206 DEPLOY_DIR=/home/pi/rfcapture bash scripts/deploy/deploy.sh
```

## See Also

- **[Quick Start](../QUICKSTART.md)** - Getting started guide
- **[Deployment Guide](../DEPLOYMENT.md)** - Prod setup details
- **[API Reference](../API.md)** - Runtime endpoints
