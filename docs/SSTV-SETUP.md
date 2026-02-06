# SSTV Decoder Setup

This document explains how to enable SSTV decoding for ISS and 2m amateur radio SSTV transmissions.

## Background

The system uses the [colaclanth/sstv](https://github.com/colaclanth/sstv) Python decoder to decode SSTV (Slow Scan Television) images from audio recordings. This decoder supports multiple SSTV modes including:

- Robot 36, Robot 72
- Martin M1, M2
- Scottie S1, S2
- PD modes (PD90, PD120, PD160, PD180, PD240, PD290)

## ARM64 / Raspberry Pi Considerations

The SSTV decoder has special requirements on ARM64 (aarch64) platforms like Raspberry Pi:

### Dependencies

The Python dependencies (numpy, scipy, pillow, soundfile) require additional system libraries on ARM64:

- `libatlas-base-dev` - ATLAS BLAS implementation
- `libopenblas-dev` - OpenBLAS linear algebra library
- `gfortran` - Fortran compiler (needed for scipy)
- `python3-soundfile` - Audio file I/O library

These are now included in the base Docker image.

## Installation Status

### Current Setup

The `Dockerfile.base` includes:
1. All required system dependencies for arm64
2. Python 3 with numpy, scipy, pillow, and soundfile
3. The colaclanth/sstv decoder installed from source

### Checking Installation

To verify SSTV decoder is installed:

```bash
# Check if sstv command exists
docker compose -f docker/compose.yaml exec rfcapture which sstv

# Test decoder version
docker compose -f docker/compose.yaml exec rfcapture sstv --version

# Check Python module
docker compose -f docker/compose.yaml exec rfcapture python3 -c "import sstv; print('SSTV module installed')"
```

## Rebuilding Base Image

If the SSTV decoder is missing, you need to rebuild the base image:

### Option 1: Pull Pre-built Image (Recommended)

```bash
docker pull ghcr.io/milesburton/noaa-satellite-capture-base:latest
docker compose -f docker/compose.yaml up -d --force-recreate
```

### Option 2: Build Locally

```bash
# Build base image (takes ~15-30 minutes on Raspberry Pi)
docker build -f docker/Dockerfile.base -t ghcr.io/milesburton/noaa-satellite-capture-base:latest .

# Rebuild app image
docker compose -f docker/compose.yaml build --no-cache

# Restart
docker compose -f docker/compose.yaml up -d --force-recreate
```

### Option 3: Manual Installation (Quick Fix)

If you need SSTV decoding immediately without rebuilding:

```bash
docker compose -f docker/compose.yaml exec rfcapture sh -c '
  apt-get update && \
  apt-get install -y python3-numpy python3-pil python3-scipy python3-soundfile \
                      libatlas-base-dev libopenblas-dev gfortran git && \
  git clone https://github.com/colaclanth/sstv.git /tmp/sstv && \
  cd /tmp/sstv && \
  python3 setup.py install && \
  rm -rf /tmp/sstv
'
```

**Note**: Manual installation is temporary and will be lost when the container is recreated.

## TTY Fix for Non-Interactive Environments

The SSTV decoder requires a terminal for progress output. We've created a Python wrapper that fixes TTY issues:

**Location**: `scripts/sstv-decode-wrapper.py`

This wrapper:
- Patches `os.get_terminal_size()` to avoid ioctl errors
- Handles SSTV decoding in Docker, CI, and non-interactive shells
- Used automatically by the SSTV decoder

## Usage

Once installed, SSTV decoding happens automatically:

### Automatic Decoding

1. **ISS SSTV Events**: When ISS has an active SSTV event, the system automatically captures and decodes transmissions on 145.800 MHz

2. **2m Ground SSTV**: During idle time (when no satellites are being tracked), the system scans 144.5 MHz and 145.5 MHz for amateur SSTV transmissions

3. **Retroactive Decoding**: Use the maintenance script to decode existing SSTV recordings:

```bash
# Using npm scripts
npm run maintenance:decode

# Or directly
npm run src/backend/cli/commands/maintenance.ts --decode

# Inside Docker
docker compose -f docker/compose.yaml exec rfcapture npm run maintenance:decode
```

### Manual Testing

To test SSTV decoding with a recording:

```bash
docker compose -f docker/compose.yaml exec rfcapture \
  sstv -d /app/recordings/ISS_2026-02-03T13-56-39.wav -o /app/images/test-sstv.png
```

## Supported SSTV Modes

The decoder automatically detects the SSTV mode. Common modes include:

| Mode | Description | Duration | Resolution |
|------|-------------|----------|------------|
| Robot 36 | Most common ISS mode | ~36s | 320×240 |
| Robot 72 | Higher quality | ~72s | 320×240 |
| PD120 | High quality | ~120s | 640×496 |
| Martin M1 | Amateur standard | ~114s | 320×256 |
| Scottie S1 | Amateur standard | ~110s | 320×256 |

## Troubleshooting

### "sstv: command not found"

The SSTV decoder isn't installed. Rebuild the base image or use manual installation (see above).

### "ImportError: No module named 'sstv'"

The Python module wasn't installed correctly. Try manual installation.

### "Error: scipy import failed"

On ARM64, scipy requires BLAS libraries. Ensure `libatlas-base-dev` and `libopenblas-dev` are installed.

### Decoder succeeds but image is garbled

This is normal for weak signals or partial transmissions. SSTV requires very good signal quality throughout the entire transmission.

### No SSTV transmissions detected

- **ISS**: Check if there's an active SSTV event at [ARISS SSTV](https://www.ariss.org/current-sstv-information.html)
- **2m Ground**: SSTV transmissions are sporadic. Most activity on weekends.
- **Signal Strength**: SSTV requires stronger signals than voice. Ensure `MIN_SIGNAL_STRENGTH` is appropriate.

## Performance Notes

### Decoding Speed

On Raspberry Pi 4/5:
- Robot 36: ~5-10 seconds to decode
- PD120: ~15-30 seconds to decode

### Memory Usage

SSTV decoding uses approximately:
- 50-100MB RAM per decode
- Temporary disk space for audio processing

## References

- [colaclanth/sstv GitHub](https://github.com/colaclanth/sstv) - SSTV decoder source code
- [ARISS SSTV](https://www.ariss.org/current-sstv-information.html) - ISS SSTV event schedule
- [SSTV Modes](https://www.chonky.net/hamradio/sstv) - Technical details about SSTV modes
- [Raspberry Pi Piwheels](https://blog.piwheels.org/raspberry-pi-os-64-bit-aarch64/) - ARM64 Python package notes

## Alternative: Browser-Based Decoder

If you have trouble with the Python decoder, consider using the browser-based SSTV decoder:

- Your own [milesburton/sstv-webapp](https://github.com/milesburton/sstv-webapp) project
- [Web-SSTV](https://mtkhai.github.io/Web-SSTV/) - Online SSTV encoder/decoder

These can decode the WAV files manually after capture.
