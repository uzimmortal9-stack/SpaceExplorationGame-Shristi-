#!/usr/bin/env python3
"""Precompute the average colour of each shared kit texture.

The headless QA harness cannot decode images, so it substitutes these averages
as flat base colours — keeping scene captures representative of the real
material palette instead of rendering everything white.
"""
import json, os, sys
from PIL import Image

out = {}
for d in ("public/assets/kit", "public/assets/surfaces"):
    if not os.path.isdir(d):
        continue
    for f in sorted(os.listdir(d)):
        if not f.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        try:
            im = Image.open(os.path.join(d, f)).convert("RGB")
            im.thumbnail((64, 64))
            px = list(im.getdata())
            n = len(px)
            avg = [sum(c[i] for c in px) / n / 255.0 for i in range(3)]
            out[f] = [round(v, 4) for v in avg]
        except Exception as e:  # noqa: BLE001
            print("skip", f, e, file=sys.stderr)
json.dump(out, open("tools/texavg.json", "w"), indent=1)
print(f"{len(out)} textures averaged")
