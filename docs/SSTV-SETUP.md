# SSTV Decoder Setup

Night Watch uses the [colaclanth/sstv](https://github.com/colaclanth/sstv) Python decoder for ISS and 2m amateur SSTV transmissions.

## Overview

SSTV (Slow Scan Television) encodes images as audio. The decoder:
- Reads WAV files captured by the SDR
- Detects SSTV mode (Robot, Martin, Scottie, PD series)
- Extracts the image
- Saves as PNG

**Supported modes**: Robot 36/72, Martin M1/M2, Scottie S1/S2, PD90/120/160/180/240/290

## Installation Status

The decoder is **already included** in the production Docker image (`Dockerfile.base`).

### Verify Installation

```bash
docker exec rfcapture python3 -c "from sstv.decode import SSTVDecoder; print('✓ SSTV installed')"
```

If that fails, rebuild the base image:

```bash
# Option 1: Pull pre-built image (recommended)
docker pull ghcr.io/milesburton/night-watch-base:latest
docker compose -f docker/compose.yaml up -d --force-recreate

# Option 2: Build locally on x86_64 (takes 15-30 min)
docker build -f docker/Dockerfile.base -t night-watch-base:latest .
docker compose -f docker/compose.yaml build --no-cache
docker compose -f docker/compose.yaml up -d --force-recreate
```

## Raspberry Pi ARM64 Considerations

The SSTV decoder has heavy dependencies (scipy, numpy) that require:

- System libraries: `libatlas-base-dev`, `libopenblas-dev`, `gfortran`
- Compilation time on Pi: **5-10 minutes** (high CPU usage during build)

These are included in `Dockerfile.base` to avoid runtime installation.

## TTY Fix for Non-Interactive Environments

The SSTV decoder expects a terminal for progress output. In Docker, this causes `OSError: Inappropriate ioctl for device`.

**Solution**: We've included `scripts/sstv-decode-wrapper.py` that patches TTY issues automatically. The decoder integration uses this wrapper by default.

## Automatic Decoding

SSTV decoding happens automatically in two scenarios:

1. **ISS SSTV Events** - Captures & decodes when ISS transmits on 145.800 MHz
2. **2m Amateur Scanning** - During idle time, scans 144.5/145.5 MHz for ground SSTV

For existing recordings, use maintenance:
```bash
npm run maintenance:decode      # Retroactively decode all WAV files
docker compose -f docker/compose.yaml exec rfcapture npm run maintenance:decode
```

## Supported Modes

The decoder auto-detects the SSTV mode:

| Mode | Source | Duration | Resolution |
|------|--------|----------|------------|
| Robot 36 | ISS SSTV events | ~36s | 320×240 |
| Robot 72 | ISS SSTV events | ~72s | 320×240 |
| Martin M1 | Amateur 2m SSTV | ~114s | 320×256 |
| Scottie S1 | Amateur 2m SSTV | ~110s | 320×256 |
| PD120 | Amateur 2m SSTV | ~120s | 640×496 |

## Troubleshooting

### Decoder not found
```bash
docker exec rfcapture python3 -c "from sstv.decode import SSTVDecoder; print('OK')"
```
If this fails, rebuild the Docker image.

### scipy import error
On ARM64, requires BLAS libraries (already included in base image).

### Garbled images
Normal for weak signals or incomplete transmissions. SSTV requires strong signal quality throughout.

### No SSTV detected
- **ISS events**: Check [ARISS SSTV schedule](https://www.ariss.org/current-sstv-information.html)
- **Amateur 2m**: Sporadic, mostly weekends
- **Signal strength**: May need to adjust `MIN_SIGNAL_STRENGTH`

## Resources

- **SSTV Decoder**: [colaclanth/sstv](https://github.com/colaclanth/sstv)
- **ISS Events**: [ARISS SSTV Info](https://www.ariss.org/current-sstv-information.html)
- **SSTV Modes**: [Technical Details](https://www.chonky.net/hamradio/sstv)
- **Alternative**: [Web-SSTV](https://mtkhai.github.io/Web-SSTV/) online decoder

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
