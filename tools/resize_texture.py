#!/usr/bin/env python3
"""Downscale a texture to a sane runtime size, preserving format and alpha."""
import argparse, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("input")
ap.add_argument("output")
ap.add_argument("--max", type=int, default=1024)
a = ap.parse_args()

img = Image.open(a.input)
if max(img.size) > a.max:
    img.thumbnail((a.max, a.max), Image.LANCZOS)
os.makedirs(os.path.dirname(os.path.abspath(a.output)), exist_ok=True)
ext = os.path.splitext(a.output)[1].lower()
if ext in (".jpg", ".jpeg"):
    img.convert("RGB").save(a.output, quality=88, optimize=True)
else:
    if img.mode == "P":
        img = img.convert("RGBA")
    if img.mode == "RGBA" and img.getchannel("A").getextrema() == (255, 255):
        img = img.convert("RGB")
    img.save(a.output, optimize=True)
print(a.output, img.size)
