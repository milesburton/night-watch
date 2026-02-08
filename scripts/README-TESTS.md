# Decoder Test Scripts

This directory contains test scripts to verify that the SSTV and LRPT decoders are working correctly.

## Quick Test (Raspberry Pi)

**Recommended**: Run this on your Pi to test the deployed system:

```bash
cd ~/noaa-satellite-capture
bash scripts/test-decoder-pi.sh
```

This will:
1. Check if the container is running
2. Create a test color bar image
3. Encode it to SSTV audio (Robot36 format)
4. Decode the audio back to an image
5. Verify the decoder works correctly

Expected output:
```
=== SSTV Round-Trip Test ===
✓ SSTV modules imported
✓ Test image created
✓ SSTV audio encoded (Robot36 mode, ~36 seconds)
✓ SSTV image decoded
=== TEST PASSED ===
```

## Test Scripts

### `test-decoder-pi.sh`
**Purpose**: Main test for deployed systems (Raspberry Pi)
**Requirements**: Docker container running
**Usage**:
```bash
bash scripts/test-decoder-pi.sh
```

### `test-sstv-roundtrip.py`
**Purpose**: Comprehensive encode/decode round-trip test
**Requirements**: Python SSTV module installed
**Usage**:
```bash
python3 scripts/test-sstv-roundtrip.py
```

Creates a test pattern, encodes to SSTV, decodes back, and verifies the output.

### `test-decoder-docker.sh`
**Purpose**: Test decoder in Docker without full encode/decode
**Requirements**: Docker container running
**Usage**:
```bash
bash scripts/test-decoder-docker.sh
```

### `generate-sstv-test.py`
**Purpose**: Generate **real SSTV-encoded** test signal for radio transmission
**Requirements**: Python SSTV module
**Usage**:
```bash
python3 scripts/generate-sstv-test.py sstv-test-transmission.wav
```

Creates a color bar test pattern encoded as Robot36 SSTV signal.

### `generate-sstv-test-docker.sh`
**Purpose**: Generate SSTV test signal using Docker (recommended for Pi)
**Requirements**: Docker container running
**Usage**:
```bash
bash scripts/generate-sstv-test-docker.sh
```

Outputs `sstv-test-transmission.wav` ready for radio transmission.

## Testing Real Captures

To test decoding on an actual recording:

```bash
# Find a recording
docker compose -f docker/compose.yaml exec rfcapture ls -lh /app/recordings/

# Decode it manually
docker compose -f docker/compose.yaml exec rfcapture \
  python3 /app/scripts/sstv-decode-wrapper.py \
    /app/recordings/ISS_2026-02-08T12-00-00.wav \
    /tmp/test-decode.png

# Extract the image
docker compose -f docker/compose.yaml cp \
  rfcapture:/tmp/test-decode.png \
  ./test-output.png
```

## Decoder Details

### SSTV Decoder
- **Module**: Python `sstv` (colaclanth/sstv)
- **Input**: WAV audio file (48kHz sample rate)
- **Output**: PNG image
- **Modes**: Auto-detects (Robot36, Martin M1, M2, PD120, etc.)
- **Wrapper**: `scripts/sstv-decode-wrapper.py`

### LRPT Decoder
- **Tool**: SatDump CLI
- **Input**: WAV audio file (1.024 MHz sample rate)
- **Output**: PNG images (multiple)
- **Pipeline**: `meteor_m2-x_lrpt`
- **Wrapper**: `scripts/lrpt-decode-wrapper.sh`

## Troubleshooting

### "SSTV module not found"
The SSTV Python module is missing from the container.

**Fix**: Rebuild the base image
```bash
docker build -f docker/Dockerfile.base -t ghcr.io/milesburton/noaa-satellite-capture-base:latest .
```

### "No SSTV signal detected"
This is normal if:
- The test audio doesn't contain a real SSTV signal
- The recording has no SSTV transmission
- The signal is too weak or corrupted

**Fix**: Use `test-sstv-roundtrip.py` which creates a real SSTV signal

### "SatDump not found"
The SatDump binary is missing from the container.

**Fix**: Rebuild the base image (see above)

## Radio Transmission Test (The Acid Test!)

The ultimate test: transmit a real SSTV signal via your 2m handheld radio!

### Generate Test Signal

**On the Pi** (recommended):
```bash
cd ~/noaa-satellite-capture
bash scripts/generate-sstv-test-docker.sh
```

**Locally** (requires Python SSTV module):
```bash
python3 scripts/generate-sstv-test.py sstv-test-transmission.wav
```

This creates a **real SSTV-encoded signal** with:
- Color bar test pattern (SMPTE style)
- "NIGHT WATCH TEST SIGNAL" text overlay
- Robot36 format (~36 seconds transmission)
- 48kHz sample rate, ready for radio

### Transmission Procedure

1. **Enable 2M SSTV scanning**
   - Open Night Watch dashboard
   - Toggle '2M' chip in top status bar (turns purple when enabled)

2. **Transfer audio file** to phone/computer
   ```bash
   scp sstv-test-transmission.wav your-device:/path/
   ```

3. **Set up handheld radio**
   - Frequency: **144.500 MHz** (or 145.500 MHz)
   - Mode: **FM**
   - Power: **Low** (1-5W)
   - Squelch: **OFF** (open squelch)

4. **Transmit the signal**
   - **Method A** (Audio cable): Connect device headphone → radio mic input
   - **Method B** (Acoustic): Play on speaker near radio microphone
   - Press PTT, play audio file, release PTT when done

5. **Watch Night Watch dashboard**
   - Waterfall displays SSTV signal pattern
   - Status: `SCAN` → `REC` (recording)
   - Status: `REC` → `DEC` (decoding)
   - **Result**: Decoded image appears in gallery!

### Expected Result

✅ Color bar test pattern with "NIGHT WATCH TEST SIGNAL" text appears in the capture gallery

### Troubleshooting Radio Test

**No signal on waterfall:**
- Verify 2M scanning is enabled (purple '2M' chip)
- Check radio frequency (144.500 or 145.500 MHz)
- Increase audio volume or move closer to mic

**Signal detected but not recorded:**
- Check `MIN_SIGNAL_STRENGTH` in `.env` (try -35 to -40)
- Increase transmission power or reduce distance
- Verify `GROUND_SSTV_SCAN_ENABLED=true` in `.env`

**Recorded but not decoded:**
- Check logs: `docker compose -f docker/compose.yaml logs -f`
- Verify decoder installed: `bash scripts/test-decoder-pi.sh`
- Check recording file isn't empty

## Next Steps

Once all tests pass:
1. Monitor live METEOR-M satellite captures
2. Enable ISS SSTV during events
3. Check decoded images in the gallery
4. Adjust `MIN_SIGNAL_STRENGTH` for your antenna setup
