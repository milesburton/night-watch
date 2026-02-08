#!/usr/bin/env python3
"""
Generate real SSTV test signal for radio transmission testing
Creates a valid SSTV-encoded audio file that can be transmitted via 2m radio
and decoded by the SDR receiver.

Usage: ./generate-sstv-test.py [output.wav]
"""

import sys
import os
from pathlib import Path

def main():
    # Parse arguments
    output_file = sys.argv[1] if len(sys.argv) > 1 else "sstv-test-transmission.wav"

    print("=== SSTV Test Signal Generator ===\n")

    # Check if SSTV module is available
    try:
        from pysstv.color import Robot36
        from PIL import Image, ImageDraw, ImageFont
        print("✓ SSTV encoder module loaded")
    except ImportError as e:
        print(f"ERROR: SSTV module not installed: {e}")
        print("\nInstall with: pip3 install pysstv")
        return 1

    # Create test pattern image (320x256 for Robot36)
    print("Creating test pattern image...")
    img = Image.new('RGB', (320, 256), color='black')
    draw = ImageDraw.Draw(img)

    # Draw color bars (classic SMPTE pattern)
    colors = [
        ('white', (255, 255, 255)),
        ('yellow', (255, 255, 0)),
        ('cyan', (0, 255, 255)),
        ('green', (0, 255, 0)),
        ('magenta', (255, 0, 255)),
        ('red', (255, 0, 0)),
        ('blue', (0, 0, 255)),
    ]

    bar_width = 320 // len(colors)
    for i, (name, color) in enumerate(colors):
        x = i * bar_width
        draw.rectangle([x, 0, x + bar_width, 256], fill=color)

    # Add identifying text
    draw.rectangle([50, 100, 270, 160], fill='black')
    try:
        # Try to use a larger font if available
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
    except:
        font = ImageFont.load_default()

    draw.text((60, 110), "NIGHT WATCH", fill='white', font=font)
    draw.text((60, 135), "TEST SIGNAL", fill='yellow', font=font)

    print("✓ Test pattern created (320x256, color bars)")

    # Encode to SSTV audio using Robot36 (fastest mode, ~36 seconds)
    print(f"\nEncoding to SSTV audio (Robot36 mode)...")
    print("  This will take about 36 seconds of audio...")

    try:
        # Create Robot36 SSTV mode with the image
        sstv = Robot36(img, 48000, 16)  # 48kHz sample rate, 16-bit

        # Generate the WAV file
        sstv.write_wav(output_file)

        file_size = Path(output_file).stat().st_size
        print(f"\n✓ SSTV signal generated successfully!")
        print(f"  File: {output_file}")
        print(f"  Size: {file_size:,} bytes ({file_size / 1024 / 1024:.1f} MB)")
        print(f"  Duration: ~36 seconds")
        print(f"  Mode: Robot36")
        print(f"  Sample rate: 48kHz")

        print("\n" + "=" * 60)
        print("TRANSMISSION TEST PROCEDURE")
        print("=" * 60)
        print()
        print("1. Transfer the file to your phone/computer:")
        print(f"   scp {output_file} your-device:/path/")
        print()
        print("2. Enable 2M SSTV scanning in Night Watch dashboard")
        print("   (Toggle '2M' chip in the top status bar)")
        print()
        print("3. Set your handheld radio:")
        print("   - Frequency: 144.500 MHz or 145.500 MHz")
        print("   - Mode: FM")
        print("   - Power: Low (1-5W)")
        print()
        print("4. Play the audio file through the radio:")
        print("   - Connect phone/computer audio to radio mic input")
        print("   - OR play near radio speaker at moderate volume")
        print("   - Press PTT and start playback")
        print()
        print("5. Watch Night Watch dashboard:")
        print("   - Waterfall should show SSTV signal")
        print("   - System status should change to 'SCAN' → 'REC'")
        print("   - After recording, status → 'DEC' (decoding)")
        print("   - Decoded image appears in gallery")
        print()
        print("Expected result: Color bar test pattern in the gallery!")
        print()

        return 0

    except Exception as e:
        print(f"\n✗ ERROR: Failed to encode SSTV: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
