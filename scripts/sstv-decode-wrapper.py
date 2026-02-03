#!/usr/bin/env python3
"""
SSTV Decoder Wrapper
Fixes TTY issues when running SSTV decoder in non-interactive environments
"""
import sys
import os

# Monkey patch get_terminal_size to avoid "Inappropriate ioctl for device" error
# This happens when running in Docker, CI, or non-interactive shells
from collections import namedtuple
TermSize = namedtuple("TermSize", ["columns", "lines"])
os.get_terminal_size = lambda: TermSize(80, 24)

# Now safely import SSTV decoder
from sstv.decode import SSTVDecoder

def main():
    if len(sys.argv) != 3:
        print("Usage: sstv-decode-wrapper.py <input.wav> <output.png>", file=sys.stderr)
        sys.exit(1)

    input_wav = sys.argv[1]
    output_png = sys.argv[2]

    # Check input file exists
    if not os.path.exists(input_wav):
        print(f"ERROR: Input file not found: {input_wav}", file=sys.stderr)
        sys.exit(1)

    try:
        # Decode SSTV signal
        decoder = SSTVDecoder(input_wav)
        decoder.decode()

        # Check if we got an image
        if hasattr(decoder, 'image') and decoder.image:
            decoder.image.save(output_png)
            print(f"SUCCESS: Saved SSTV image to {output_png}")
            sys.exit(0)
        else:
            print("FAILED: No SSTV signal detected in audio file", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"ERROR: Failed to decode SSTV: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
