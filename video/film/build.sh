#!/usr/bin/env bash
# 一键出片：配乐 → 逐帧渲染 → 合成 mp4
set -euo pipefail
cd "$(dirname "$0")"
npm install --silent
mkdir -p out
python3 music.py out/soundtrack.wav
rm -rf frames/seq
node render.mjs --workers "${WORKERS:-3}"
ffmpeg -y -v error -framerate 30 -i frames/seq/f_%05d.png -i out/soundtrack.wav \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest out/xiaofangkuai.mp4
echo "→ out/xiaofangkuai.mp4"
