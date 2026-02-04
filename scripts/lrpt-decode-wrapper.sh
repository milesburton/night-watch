#!/bin/bash
#
# LRPT Decoder Wrapper for SatDump
# Decodes METEOR-M LRPT signals from WAV files
#
# Usage: lrpt-decode-wrapper.sh <input.wav> <output_dir>
#

set -e

if [ $# -ne 2 ]; then
    echo "Usage: $0 <input.wav> <output_dir>" >&2
    exit 1
fi

INPUT_WAV="$1"
OUTPUT_DIR="$2"

# Validate input file exists
if [ ! -f "$INPUT_WAV" ]; then
    echo "ERROR: Input file not found: $INPUT_WAV" >&2
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Detect sample rate from WAV file (SatDump needs to know this)
SAMPLE_RATE=1024000

# Run SatDump to decode LRPT
# Pipeline: meteor_m2-x_lrpt for METEOR-M N2-3/N2-4
# Input level: baseband (IQ samples from WAV)
# Baseband format: s16 (16-bit signed samples, typical for WAV)
satdump meteor_m2-x_lrpt baseband "$INPUT_WAV" "$OUTPUT_DIR" \
    --samplerate "$SAMPLE_RATE" \
    --baseband_format s16 \
    --fill_missing \
    2>&1

# Check if decode was successful (SatDump creates image files in output dir)
if compgen -G "$OUTPUT_DIR/*.png" > /dev/null 2>&1; then
    echo "SUCCESS: LRPT decoded successfully"
    ls -1 "$OUTPUT_DIR"/*.png
    exit 0
else
    echo "FAILED: No images generated - no valid LRPT signal detected" >&2
    exit 1
fi
