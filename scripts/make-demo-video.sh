#!/usr/bin/env bash
# Turns docs/demo/frames (from record-demo.mjs) into docs/demo/overturn-demo.mp4,
# speeding up the live Gemini wait 4x and keeping every reveal at real speed.
set -euo pipefail
cd "$(dirname "$0")/../docs/demo"
ffmpeg -y -loglevel error -f concat -safe 0 -i frames.txt -vf "fps=30,scale=1600:1000:flags=lanczos,format=yuv420p" -c:v libx264 -crf 20 -preset medium full.mp4
read -r S RS RD <<<"$(python3 -c "import json;m=json.load(open('marks.json'));print(m['start'],m['run_start'],m['run_done'])")"
A=$(python3 -c "print(max(0,$RS-$S))"); B=$(python3 -c "print(max(0,$RD-$S))")
ffmpeg -y -loglevel error -i full.mp4 -filter_complex \
 "[0:v]trim=0:${A},setpts=PTS-STARTPTS[a];[0:v]trim=${A}:${B},setpts=(PTS-STARTPTS)/4[b];[0:v]trim=${B},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0,format=yuv420p[v]" \
 -map "[v]" -c:v libx264 -crf 20 -preset medium -movflags +faststart overturn-demo.mp4
rm -f full.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 overturn-demo.mp4
