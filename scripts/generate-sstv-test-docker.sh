#!/bin/bash
# Generate SSTV test signal using Docker container
# This ensures all dependencies are available

set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yaml}"
ENV_FILE="${ENV_FILE:-.env}"
OUTPUT_FILE="${1:-sstv-test-transmission.wav}"

echo "=== Generating SSTV Test Signal (Docker) ==="
echo

# Check if container is running
if ! docker compose -f "$COMPOSE_FILE" ps --quiet rfcapture | grep -q .; then
    echo "ERROR: rfcapture container is not running"
    echo "Start with: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
    exit 1
fi

# Generate the test signal inside the container
echo "Generating test signal in container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T rfcapture \
    python3 /app/scripts/generate-sstv-test.py /tmp/sstv-test.wav

# Copy the file out
echo
echo "Copying file from container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" cp \
    rfcapture:/tmp/sstv-test.wav "$OUTPUT_FILE"

FILE_SIZE=$(stat -f%z "$OUTPUT_FILE" 2>/dev/null || stat -c%s "$OUTPUT_FILE" 2>/dev/null)
echo "✓ Test signal saved to: $OUTPUT_FILE ($FILE_SIZE bytes)"
echo

cat << 'EOF'
════════════════════════════════════════════════════════════
TRANSMISSION TEST PROCEDURE
════════════════════════════════════════════════════════════

1. Enable 2M SSTV scanning:
   - Open Night Watch dashboard
   - Toggle '2M' chip in top status bar (should turn purple)

2. Transfer audio file to playback device:
   - Phone: Email/AirDrop/USB the .wav file
   - Computer: Keep the file locally

3. Set up your handheld radio:
   - Frequency: 144.500 MHz (or 145.500 MHz)
   - Mode: FM
   - Power: Low (1-5W is plenty)
   - Squelch: OFF (open squelch)

4. Transmit the test signal:
   Method A (Audio cable):
     - Connect device headphone → radio mic input
     - Press PTT, play audio, release PTT when done

   Method B (Acoustic coupling):
     - Play audio on device speaker at 75% volume
     - Hold device near radio microphone
     - Press PTT, play audio, release PTT when done

5. Watch the Night Watch dashboard:
   - Waterfall should show SSTV signal pattern
   - Status: SCAN → REC (recording)
   - Status: REC → DEC (decoding)
   - Gallery: Decoded image appears!

Expected: Color bar test pattern with "NIGHT WATCH TEST SIGNAL"

════════════════════════════════════════════════════════════
TROUBLESHOOTING
════════════════════════════════════════════════════════════

• No signal on waterfall:
  - Check 2M scanning is enabled (purple chip)
  - Verify radio frequency (144.500 or 145.500 MHz)
  - Increase audio volume or get closer to mic

• Signal detected but not recorded:
  - Check MIN_SIGNAL_STRENGTH in .env (should be -30 to -40)
  - Increase transmission power or reduce distance

• Recorded but not decoded:
  - Check logs: docker compose -f docker/compose.yaml logs -f
  - Verify SSTV decoder is installed (run test-decoder-pi.sh)

• "Ground scanning disabled":
  - Check .env: GROUND_SSTV_SCAN_ENABLED=true
  - Restart: docker compose -f docker/compose.yaml restart

════════════════════════════════════════════════════════════
EOF
