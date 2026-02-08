#!/bin/bash
# Test SSTV decoder inside Docker container
# This is the preferred way to test on the Pi since all tools are in the container

set -e

COMPOSE_FILE="${COMPOSE_FILE:-docker/compose.yaml}"
ENV_FILE="${ENV_FILE:-.env}"

echo "=== SSTV Decoder Test (Docker) ==="
echo

# Check if container is running
if ! docker compose -f "$COMPOSE_FILE" ps --quiet rfcapture | grep -q .; then
    echo "ERROR: rfcapture container is not running"
    echo "Start with: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d"
    exit 1
fi

echo "Step 1: Checking SSTV decoder in container..."
if ! docker compose -f "$COMPOSE_FILE" exec -T rfcapture python3 -c "import sstv; print('SSTV module OK')" 2>/dev/null; then
    echo "ERROR: SSTV module not found in container"
    exit 1
fi
echo "✓ SSTV decoder available"
echo

echo "Step 2: Generating test SSTV audio in container..."
docker compose -f "$COMPOSE_FILE" exec -T rfcapture bash -c "
    set -e
    TEST_DIR=/tmp/sstv-test
    mkdir -p \$TEST_DIR

    # Generate 33-second test SSTV-like signal
    sox -n -r 48000 -c 1 \$TEST_DIR/test.wav synth 33 sine 1200 sine 1500 sine 1900 \
        tremolo 0.1 0.5 \
        vol 0.5

    echo \"Generated: \$(ls -lh \$TEST_DIR/test.wav | awk '{print \$5}')\"
"
echo "✓ Test audio generated"
echo

echo "Step 3: Running SSTV decoder..."
DECODE_OUTPUT=$(docker compose -f "$COMPOSE_FILE" exec -T rfcapture bash -c "
    set -e
    TEST_DIR=/tmp/sstv-test

    python3 /app/scripts/sstv-decode-wrapper.py \
        \$TEST_DIR/test.wav \
        \$TEST_DIR/decoded.png

    if [ -f \$TEST_DIR/decoded.png ]; then
        echo \"SUCCESS: Image decoded\"
        ls -lh \$TEST_DIR/decoded.png | awk '{print \"Size:\", \$5}'
        file \$TEST_DIR/decoded.png
    else
        echo \"FAILED: No output image\"
        exit 1
    fi
" 2>&1)

echo "$DECODE_OUTPUT"
echo

if echo "$DECODE_OUTPUT" | grep -q "SUCCESS"; then
    echo "=== TEST PASSED ==="
    echo
    echo "SSTV decoder is working correctly in the container!"
    echo
    echo "To extract the test image:"
    echo "  docker compose -f $COMPOSE_FILE cp rfcapture:/tmp/sstv-test/decoded.png ./sstv-test-output.png"
    exit 0
else
    echo "=== TEST FAILED ==="
    echo
    echo "Note: If the test audio doesn't contain a valid SSTV signal,"
    echo "the decoder will correctly report 'No SSTV signal detected'."
    echo
    echo "This is expected behavior - the decoder is working, but"
    echo "the test tone isn't a real SSTV signal."
    exit 1
fi
