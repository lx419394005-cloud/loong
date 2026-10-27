#!/usr/bin/env bash
# 一键出片：配乐 → Blender 底片和镜头 → 网页界面层 → 合成 → mp4
#   SAMPLES / PCT / WORKERS 可用环境变量调整
set -euo pipefail
cd "$(dirname "$0")"
npm install --silent
mkdir -p out
log() { echo "[$(date +%H:%M:%S)] $*"; }

log "配乐"
python3 music.py out/soundtrack.wav

log "Blender 底片"
python3 blender/plates.py laptop "${PLATE_SAMPLES:-48}" 100 | grep -E "^rendered"
python3 blender/plates.py phone "${PLATE_SAMPLES:-48}" 100 | grep -E "^rendered"

log "Blender 镜头"
for shot in reveal inserts dark end; do
  python3 blender/shots.py "$shot" --samples "${SAMPLES:-12}" --pct "${PCT:-75}" | grep -E "done|Error"
done

log "网页界面层"
for m in desk phone ui ov; do
  rm -rf "frames/$m"
  node render.mjs --mode "$m" --frames "$(python3 comp.py --list $m)" --workers "${WORKERS:-3}" | tail -1
done

log "合成"
rm -rf frames/comp
python3 comp.py --jobs 4 | tail -1

log "编码"
ffmpeg -y -v error -framerate 30 -i frames/comp/f_%05d.png -i out/soundtrack.wav \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest out/xiaofangkuai.mp4
log "→ out/xiaofangkuai.mp4"
