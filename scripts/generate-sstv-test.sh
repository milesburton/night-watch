#!/bin/bash
# Generate a simple SSTV test tone sequence for Radio 36 mode testing
# This creates a recognizable tone pattern that can be transmitted via handheld radio

OUTPUT_FILE="${1:-sstv-test-signal.wav}"

echo "Generating SSTV test signal: $OUTPUT_FILE"
echo ""
echo "Test Instructions:"
echo "1. This will create a ~40 second Robot36-style test signal"
echo "2. Transmit on 144.500 MHz or 145.500 MHz using your handheld radio"
echo "3. The system will detect and attempt to decode it during idle scanning"
echo ""

# Robot36 SSTV uses specific tones:
# - VIS code: 1200 Hz leader + specific pattern
# - Sync pulses: 1200 Hz
# - Video: 1500-2300 Hz (luminance), 1500-2300 Hz (chrominance)
# - Image transmission: ~36 seconds

# Generate a simplified SSTV-like test pattern
# VIS header (5 seconds) + test tones (35 seconds)

# Leader tone (1900 Hz for 300ms)
sox -n -r 48000 -c 1 /tmp/leader.wav synth 0.3 sine 1900

# VIS start bit (1200 Hz for 30ms)
sox -n -r 48000 -c 1 /tmp/vis_start.wav synth 0.03 sine 1200

# Calibration header (alternating 1900/1500 Hz)
sox -n -r 48000 -c 1 /tmp/cal1.wav synth 0.2 sine 1900
sox -n -r 48000 -c 1 /tmp/cal2.wav synth 0.2 sine 1500

# Sync pulse (1200 Hz, 9ms) - used throughout transmission
sox -n -r 48000 -c 1 /tmp/sync.wav synth 0.009 sine 1200

# Generate test "image" data - sweeping tones
# This creates a recognizable pattern if decoded
sox -n -r 48000 -c 1 /tmp/sweep1.wav synth 8 sine 1500:2300
sox -n -r 48000 -c 1 /tmp/sweep2.wav synth 8 sine 2300:1500
sox -n -r 48000 -c 1 /tmp/sweep3.wav synth 8 sine 1500:2100

# Concatenate everything
sox /tmp/leader.wav \
    /tmp/vis_start.wav \
    /tmp/cal1.wav /tmp/cal2.wav /tmp/cal1.wav /tmp/cal2.wav \
    /tmp/sync.wav /tmp/sweep1.wav \
    /tmp/sync.wav /tmp/sweep2.wav \
    /tmp/sync.wav /tmp/sweep3.wav \
    /tmp/sync.wav /tmp/sweep1.wav \
    "$OUTPUT_FILE"

# Clean up temp files
rm -f /tmp/leader.wav /tmp/vis_start.wav /tmp/cal*.wav /tmp/sync.wav /tmp/sweep*.wav

# Get file info
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
DURATION=$(soxi -D "$OUTPUT_FILE" 2>/dev/null | cut -d. -f1)

echo "✓ Generated: $OUTPUT_FILE"
echo "  Size: $FILE_SIZE"
echo "  Duration: ${DURATION}s"
echo ""
echo "To transmit this test:"
echo "  1. Copy to your phone/computer: scp $OUTPUT_FILE your-device:/"
echo "  2. Play through handheld radio on 144.500 or 145.500 MHz"
echo "  3. Or use: aplay $OUTPUT_FILE | radio-transmit-app"
echo ""
echo "The system scans these frequencies during idle time (when no satellites are overhead)"
