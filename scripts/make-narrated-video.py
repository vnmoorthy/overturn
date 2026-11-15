#!/usr/bin/env python3
"""Builds docs/demo/overturn-demo-narrated.mp4 from the recorded frames (record-demo.mjs) and the
Gemini Live narration (narrate-live.mjs). Each scene is held on a still frame just long enough for
its line; the Gemini wait is sped up to fit its line. Usage: python3 scripts/make-narrated-video.py"""
import json, os, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DEMO = os.path.join(ROOT, 'docs', 'demo')
NAR = os.path.join(DEMO, 'narration')
marks = json.load(open(os.path.join(DEMO, 'marks.json')))
durs = json.load(open(os.path.join(NAR, 'durations.json')))
order = [s['id'] for s in json.load(open(os.path.join(ROOT, 'scripts', 'narration.json')))['segments']]

# frames.txt: alternating "file '<path>'" / "duration <s>" lines, last file repeated without duration
frames = []
lines = open(os.path.join(DEMO, 'frames.txt')).read().splitlines()
for i in range(0, len(lines) - 1, 2):
    frames.append([lines[i][6:-1], float(lines[i + 1].split()[1])])

S = marks['start']
rel = {k: v - S for k, v in marks.items() if isinstance(v, (int, float))}
rel['hero_start'] = 3.65            # title card is shown for 3.6 s after 'start'
LEAD, TAIL = 0.3, 0.55              # silence before / after each line
seg_start = {sid: rel[d['mark']] for sid, d in durs.items()}
starts = sorted(seg_start[s] for s in order)
total_raw = sum(d for _, d in frames)
seg_end = {s: (starts[starts.index(seg_start[s]) + 1] if starts.index(seg_start[s]) + 1 < len(starts) else total_raw) for s in order}

# where to freeze inside each scene (a moment where the screen is settled)
hold_at = {
    'title': rel['hero_start'] - 0.2,
    'problem': rel['hero_done'] - 0.15,
    'stamp': seg_end['stamp'] - 0.2,
    'receipt': rel['tt_done'] - 0.75,
    'evidence': rel['tamper_done'] - 0.2,
    'findings': rel['findings_done'] - 0.2,
    'letter': rel['letter_done'] - 0.2,
    'close': total_raw - 0.05,
}
run_len = seg_end['run'] - seg_start['run']
run_need = durs['run']['seconds'] + LEAD + TAIL
speed = max(1.0, run_len / run_need)
extra = {}
for s in order:
    if s == 'run':
        continue
    need = durs[s]['seconds'] + LEAD + TAIL + (0.8 if s == 'close' else 0)
    have = seg_end[s] - seg_start[s]
    if need > have:
        extra[s] = need - have

t = 0.0
new = []
pending = dict(extra)
for f, d in frames:
    nd = d / speed if seg_start['run'] <= t < seg_end['run'] else d
    for s, at in list(pending.items()):
        if t <= hold_at[s] < t + d:
            nd += pending.pop(s)
    new.append((f, nd, t))
    t += d
for s, x in pending.items():   # anything not placed (shouldn't happen) goes on the last frame
    new[-1] = (new[-1][0], new[-1][1] + x, new[-1][2])

def final_time(raw_t):
    acc = 0.0
    for f, nd, t0 in new:
        if t0 >= raw_t:
            return acc
        acc += nd
    return acc

lst = os.path.join(DEMO, 'frames-narrated.txt')
with open(lst, 'w') as fh:
    for f, nd, _ in new:
        fh.write(f"file '{f}'\nduration {max(0.001, nd):.4f}\n")
    fh.write(f"file '{new[-1][0]}'\n")
video_len = sum(nd for _, nd, _ in new)

inputs, filters, labels = [], [], []
for i, s in enumerate(order):
    at = final_time(seg_start[s]) + LEAD + {'close': 1.3}.get(s, 0)  # end card fades in ~1 s after the cut
    inputs += ['-i', os.path.join(NAR, f'{s}.wav')]
    ms = int(at * 1000)
    filters.append(f'[{i + 1}:a]aresample=48000,adelay={ms}|{ms}[a{i}]')
    labels.append(f'[a{i}]')
    print(f'{s:9s} at {at:6.2f}s  line {durs[s]["seconds"]:.2f}s')
fc = ';'.join(filters) + f";{''.join(labels)}amix=inputs={len(order)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]"
out = os.path.join(DEMO, 'overturn-demo-narrated.mp4')
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, *inputs,
       '-filter_complex', fc + ';[0:v]fps=30,scale=1600:1000:flags=lanczos,format=yuv420p[v]',
       '-map', '[v]', '-map', '[aout]', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium',
       '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out]
subprocess.run(cmd, check=True)
os.remove(lst)
print(f'run sped {speed:.2f}x · video {video_len:.1f}s →', out)
