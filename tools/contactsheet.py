#!/usr/bin/env python3
"""Render a labelled contact sheet of many .glb files for visual QA."""
from __future__ import annotations

import argparse
import glob
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbview import GLTF, collect, render  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("pattern")
ap.add_argument("output")
ap.add_argument("--cell", type=int, default=230)
ap.add_argument("--cols", type=int, default=8)
ap.add_argument("--limit", type=int, default=0)
ap.add_argument("--filter", default="")
a = ap.parse_args()

files = sorted(glob.glob(a.pattern))
if a.filter:
    files = [f for f in files if a.filter in os.path.basename(f)]
if a.limit:
    files = files[: a.limit]
if not files:
    raise SystemExit("no files match")

cols = a.cols
rows = math.ceil(len(files) / cols)
sheet = Image.new("RGB", (cols * a.cell, rows * (a.cell + 16)), (16, 18, 24))
draw = ImageDraw.Draw(sheet)

for i, f in enumerate(files):
    name = os.path.basename(f)[:-4]
    try:
        g = GLTF(f)
        tris = collect(g)
        if not tris:
            raise ValueError("empty")
        allp = np.vstack([t.pos.reshape(-1, 3) for t in tris])
        lo, hi = allp.min(axis=0), allp.max(axis=0)
        img = render(tris, a.cell, yaw=0.7, pitch=0.28, grid=True, bounds=(lo, hi))
        label = f"{name}  {hi[1]-lo[1]:.1f}m"
        if lo[1] > 0.02 * max(hi[1] - lo[1], 0.01):
            label += " FLOAT!"
        if lo[1] < -0.02 * max(hi[1] - lo[1], 0.01):
            label += " SUNK!"
    except Exception as exc:  # noqa: BLE001
        img = Image.new("RGB", (a.cell, a.cell), (60, 20, 20))
        label = f"{name}  ERR {exc}"
    x = (i % cols) * a.cell
    y = (i // cols) * (a.cell + 16)
    sheet.paste(img, (x, y))
    draw.text((x + 4, y + a.cell + 2), label[:38], fill=(210, 220, 235))

sheet.save(a.output)
print(a.output, sheet.size, len(files), "models")
