# Scripts & Utilities

This directory contains helper scripts for testing andmaintenance.

## Decoder Tests

### Quick Test ← Start Here

Test your SSTV decoder installation (Raspberry Pi):

```bash
cd ~/noaa-satellite-capture
bash scripts/test-decoder-pi.sh
```

This creates a test color bar image, encodes to SSTV audio, decodes it back, and verifies the result.

### All Test Scripts

| Script | Purpose | Platform |
|--------|---------|----------|
| `test-decoder-pi.sh` | SSTV encode/decode round-trip | Docker container |
| `test-sstv-roundtrip.py` | Pure Python SSTV test | Local Python |
| `test-decoder-docker.sh` | Decoder verification only | Docker container |
| `test-sstv-decoder.sh` | Simple SSTV test | Docker container |

### Generate SSTV Test Signal

Create a real SSTV-encoded audio file for radio transmission:

```bash
# Using Docker (recommended on Pi)
bash scripts/generate-sstv-test-docker.sh

# Using local Python
python3 scripts/generate-sstv-test.py output.wav
```

Outputs `sstv-test-transmission.wav` — a real Robot36 SSTV signal ready to transmit.

## Maintenance Scripts

These are executed by cron or manually:

```bash
scripts/deploy/deploy.sh          # Deploy to remote Pi
scripts/deploy/setup-maintenance-cron.sh  # Schedule daily maintenance
scripts/setup-maintenance-cron.sh  # Alternative path
```

See [Maintenance Guide](../docs/MAINTENANCE.md) for details.

## Decoding Wrappers

These scripts handle special cases:

| Wrapper | Purpose |
|---------|---------|
| `sstv-decode-wrapper.py` | Fixes TTY issues for SSTV in non-interactive shells |
| `lrpt-decode-wrapper.sh` | Wrapper for SatDump METEOR-M LRPT decoding |

These are used internally by the application.

## Testing Decoders Manually

### SSTV Decoder

```bash
# List recordings
docker exec rfcapture ls -lh /app/recordings/

# Decode one manually
docker exec rfcapture python3 /app/scripts/sstv-decode-wrapper.py \
  /app/recordings/ISS_2026-02-08T12-00-00.wav \
  /tmp/test-decode.png

# Extract image to view locally
docker cp rfcapture:/tmp/test-decode.png ./
```

### Verify Installations

```bash
# SSTV module
docker exec rfcapture python3 -c "from sstv.decode import SSTVDecoder; print('✓ SSTV OK')"

# SatDump (LRPT decoder)
docker exec rfcapture satdump --help | head -5

# Both should succeed
```

## Troubleshooting

### "SSTV module not found"

Rebuild the Docker base image:
```bash
docker build -f docker/Dockerfile.base -t night-watch-base:latest .
```

### "SatDump not found"

Same fix — rebuild the base image. This includes all decoders and system dependencies.

### Test Passes Locally but Fails in Docker

- Run inside the container: `docker exec rfcapture bash scripts/test-decoder-pi.sh`
- Check logs: `docker logs rfcapture`
- Verify decoder: `docker exec rfcapture which sstv; docker exec rfcapture which satdump`

## See Also

- **[Quick Start](../docs/QUICKSTART.md)** - Getting started
- **[Test Scripts README](README-TESTS.md)** - Original detailed test guide  
- **[Maintenance Guide](../docs/MAINTENANCE.md)** - Retroactive decoding, cleanup
- **[SSTV Setup](../docs/SSTV-SETUP.md)** - SSTV decoder details
