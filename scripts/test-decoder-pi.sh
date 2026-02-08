#!/bin/bash
# Test decoder on Raspberry Pi deployment
# Run this on the Pi to verify SSTV decoding works

set -e

COMPOSE_FILE="docker/compose.yaml"
ENV_FILE=".env"

echo "=== Night Watch Decoder Test (Raspberry Pi) ==="
echo

# Verify we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: Must run from project root directory"
    echo "cd ~/noaa-satellite-capture && bash scripts/test-decoder-pi.sh"
    exit 1
fi

# Check if container is running
echo "Checking container status..."
if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --quiet rfcapture | grep -q .; then
    echo "ERROR: rfcapture container is not running"
    echo
    echo "Start with:"
    echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
    exit 1
fi
echo "✓ Container is running"
echo

# Run the round-trip test inside the container
echo "Running SSTV encoder/decoder round-trip test..."
echo
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec rfcapture \
    python3 /app/scripts/test-sstv-roundtrip.py

TEST_EXIT=$?

echo
if [ $TEST_EXIT -eq 0 ]; then
    echo "=== ALL TESTS PASSED ==="
    echo
    echo "The SSTV decoder is working correctly!"
    echo "Your system is ready to capture and decode ISS/2M SSTV transmissions."
else
    echo "=== TESTS FAILED ==="
    echo
    echo "There may be an issue with the SSTV decoder installation."
    echo "Check the error messages above for details."
fi

exit $TEST_EXIT
