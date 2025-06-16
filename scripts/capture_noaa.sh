#!/bin/bash

SAT="$1"
FREQ=""

case "$SAT" in
  "NOAA 15") FREQ="137.6200M" ;;
  "NOAA 18") FREQ="137.9125M" ;;
  "NOAA 19") FREQ="137.1000M" ;;
  *) echo "❌ Unknown satellite: $SAT" && exit 1 ;;
esac

DATE=$(date +%Y-%m-%d-%H-%M)
OUT_WAV="/workspace/recordings/${DATE}-${SAT}.wav"
OUT_IMG="/workspace/images/${DATE}-${SAT}.png"
FINAL_IMG="/website/${DATE}-${SAT}.png"

echo "📡 Capturing $SAT at $FREQ..."
rtl_fm -f $FREQ -M fm -s 48000 -g 36 - | \
sox -t raw -e signed -b 16 -r 110250 -c 1 - -t wav "$OUT_WAV"

echo "🖼️ Decoding image..."
noaa-apt $OUT_WAV -o $OUT_IMG

echo "🌐 Publishing image..."
cp $OUT_IMG $FINAL_IMG

