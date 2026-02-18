#!/usr/bin/env bash
# Generate a synthetic ~3 second scream audio file using FFmpeg
# Output: scream.ogg (Opus codec, 96kbps)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT="$SCRIPT_DIR/scream.ogg"

# Use aevalsrc to generate a rising frequency sweep with harmonics and noise
# Layer 1: Rising sine sweep 400Hz -> 2000Hz
# Layer 2: Higher harmonic 800Hz -> 3200Hz (quieter)
# Layer 3: Random noise for texture
ffmpeg -y \
  -f lavfi -i "aevalsrc=exprs=sin(2*PI*t*(400+533*t))*0.7+sin(2*PI*t*(800+800*t))*0.3+sin(2*PI*t*(1200+400*t))*0.15+(random(0)*0.2-0.1):s=48000:d=3" \
  -af "highpass=f=200,lowpass=f=6000,acrusher=bits=10:mix=0.25:mode=log:aa=1,acompressor=threshold=0.08:ratio=6:attack=5:release=50,volume=6dB,afade=t=in:d=0.02,afade=t=out:st=2.4:d=0.6" \
  -c:a libopus -b:a 96k -ar 48000 -ac 2 \
  "$OUTPUT"

echo "Generated: $OUTPUT"
ls -lh "$OUTPUT"
