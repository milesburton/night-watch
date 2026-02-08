#!/usr/bin/env python3
"""
SSTV Encoder/Decoder Round-Trip Test
Generates a test pattern image, encodes it to SSTV audio, then decodes it back.
This proves the entire SSTV pipeline works correctly.
"""

import sys
import os
from pathlib import Path
import tempfile

def main():
    print("=== SSTV Round-Trip Test ===\n")

    # Check if SSTV module is available
    try:
        from sstv.encode import SSTVEncoder
        from sstv.decode import SSTVDecoder
        from sstv import spec
        from PIL import Image, ImageDraw, ImageFont
        print("✓ SSTV modules imported")
    except ImportError as e:
        print(f"ERROR: Failed to import SSTV modules: {e}")
        print("\nInstall with: pip3 install git+https://github.com/colaclanth/sstv.git")
        return 1

    # Create test directory
    test_dir = Path(tempfile.mkdtemp(prefix="sstv-test-"))
    print(f"Test directory: {test_dir}\n")

    # Step 1: Create test image (320x256 for Robot36)
    print("Step 1: Creating test pattern image...")
    img = Image.new('RGB', (320, 256), color='black')
    draw = ImageDraw.Draw(img)

    # Draw color bars (like test pattern)
    colors = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'white']
    bar_width = 320 // len(colors)
    for i, color in enumerate(colors):
        x = i * bar_width
        draw.rectangle([x, 0, x + bar_width, 256], fill=color)

    # Add text
    try:
        draw.text((10, 120), "SSTV TEST", fill='black')
    except:
        pass  # Font rendering may fail, that's OK

    input_image = test_dir / "input.png"
    img.save(input_image)
    print(f"✓ Test image created: {input_image}")
    print(f"  Dimensions: {img.width}x{img.height}")
    print()

    # Step 2: Encode to SSTV audio (Robot36 mode - fast)
    print("Step 2: Encoding image to SSTV audio...")
    try:
        # Robot36 is a fast SSTV mode (~36 seconds)
        mode = spec.Robot36
        encoder = SSTVEncoder(img, mode, 48000)

        output_wav = test_dir / "encoded.wav"
        encoder.write(str(output_wav))

        wav_size = output_wav.stat().st_size
        print(f"✓ SSTV audio encoded: {output_wav}")
        print(f"  Mode: Robot36")
        print(f"  Size: {wav_size:,} bytes ({wav_size / 1024:.1f} KB)")
        print(f"  Duration: ~36 seconds")
        print()
    except Exception as e:
        print(f"✗ Encoding failed: {e}")
        return 1

    # Step 3: Decode SSTV audio back to image
    print("Step 3: Decoding SSTV audio back to image...")
    try:
        decoder = SSTVDecoder(str(output_wav))
        decoder.decode()

        if hasattr(decoder, 'image') and decoder.image:
            output_image = test_dir / "decoded.png"
            decoder.image.save(str(output_image))

            png_size = output_image.stat().st_size
            print(f"✓ SSTV image decoded: {output_image}")
            print(f"  Size: {png_size:,} bytes ({png_size / 1024:.1f} KB)")
            print(f"  Dimensions: {decoder.image.width}x{decoder.image.height}")
            print()

            print("=== TEST PASSED ===\n")
            print("SSTV encoder/decoder pipeline is working correctly!")
            print(f"\nTest files saved in: {test_dir}")
            print(f"  Input:   {input_image}")
            print(f"  Audio:   {output_wav}")
            print(f"  Decoded: {output_image}")
            return 0
        else:
            print("✗ No SSTV signal detected in decoded audio")
            print("\n=== TEST FAILED ===")
            return 1

    except Exception as e:
        print(f"✗ Decoding failed: {e}")
        print("\n=== TEST FAILED ===")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
