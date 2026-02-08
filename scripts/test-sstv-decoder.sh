#!/bin/bash
# Test SSTV decoder end-to-end
# Generates test audio and decodes it to prove the pipeline works

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_DIR="$PROJECT_ROOT/test-output"
TEST_WAV="$TEST_DIR/sstv-test.wav"
TEST_PNG="$TEST_DIR/sstv-test-decoded.png"

echo "=== SSTV Decoder Test ==="
echo

# Clean up previous test
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

# Step 1: Generate test SSTV audio
echo "Step 1: Generating SSTV test audio..."
if [ ! -f "$SCRIPT_DIR/generate-sstv-test.sh" ]; then
    echo "ERROR: generate-sstv-test.sh not found"
    exit 1
fi

bash "$SCRIPT_DIR/generate-sstv-test.sh" "$TEST_WAV"
if [ ! -f "$TEST_WAV" ]; then
    echo "ERROR: Failed to generate test audio"
    exit 1
fi

FILE_SIZE=$(stat -f%z "$TEST_WAV" 2>/dev/null || stat -c%s "$TEST_WAV" 2>/dev/null)
echo "✓ Test audio generated: $TEST_WAV ($FILE_SIZE bytes)"
echo

# Step 2: Check if SSTV decoder is installed
echo "Step 2: Checking SSTV decoder installation..."
if ! python3 -c "import sstv" 2>/dev/null; then
    echo "ERROR: Python SSTV module not installed"
    echo "Install with: pip3 install git+https://github.com/colaclanth/sstv.git"
    exit 1
fi
echo "✓ SSTV decoder module found"
echo

# Step 3: Run decoder
echo "Step 3: Decoding SSTV audio..."
WRAPPER_PATH="$SCRIPT_DIR/sstv-decode-wrapper.py"
if [ ! -f "$WRAPPER_PATH" ]; then
    echo "ERROR: sstv-decode-wrapper.py not found"
    exit 1
fi

python3 "$WRAPPER_PATH" "$TEST_WAV" "$TEST_PNG"
DECODE_EXIT=$?

if [ $DECODE_EXIT -eq 0 ] && [ -f "$TEST_PNG" ]; then
    PNG_SIZE=$(stat -f%z "$TEST_PNG" 2>/dev/null || stat -c%s "$TEST_PNG" 2>/dev/null)
    echo "✓ Decoding successful: $TEST_PNG ($PNG_SIZE bytes)"
    echo

    # Check image dimensions
    if command -v identify &> /dev/null; then
        DIMENSIONS=$(identify -format "%wx%h" "$TEST_PNG")
        echo "  Image dimensions: $DIMENSIONS"
    fi

    echo
    echo "=== TEST PASSED ==="
    echo "SSTV decoder is working correctly!"
    echo "Output files in: $TEST_DIR"
    exit 0
else
    echo "✗ Decoding failed (exit code: $DECODE_EXIT)"
    echo
    echo "=== TEST FAILED ==="
    echo "Check the error messages above"
    exit 1
fi
