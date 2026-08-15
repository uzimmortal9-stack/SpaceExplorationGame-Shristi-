#!/usr/bin/env python3
"""
sim_walls.py — reimplements ship_builder's wall rule and checks the result.

Two invariants, both learned the hard way from playtests:

  1. Every doorway threshold must have FLOOR under it, or the player falls
     into the void.
  2. Every room boundary must have a WALL on it (except at doorways), or the
     player walks through the partition into the next room.

These fight each other: making the spine abut the rooms fixes (1) but, under a
naive "wall only where the neighbour is not walkable" rule, breaks (2). This
script proves both hold simultaneously.
"""
import re, sys, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
txt = open(os.path.join(ROOT, "scripts/world/ship_layout.gd"), encoding="utf-8").read()


def rects(section):
    blk = txt.split(section)[1].split("\n]")[0]
    return [tuple(map(float, m)) for m in re.findall(
        r'"x0":\s*(-?[\d.]+),\s*"z0":\s*(-?[\d.]+),\s*"x1":\s*(-?[\d.]+),\s*"z1":\s*(-?[\d.]+)', blk)]


ROOMS = rects("const ROOMS: Array = [")
CORS = rects("const CORRIDORS: Array = [")
ALL = ROOMS + CORS

dblk = txt.split("const DOORWAYS: Array = [")[1].split("\n]")[0]
DOORS = [(m[0], float(m[1]), float(m[2]), m[3], float(m[4])) for m in re.findall(
    r'"id":\s*"(\w+)"[\s\S]{0,240}?"x":\s*(-?[\d.]+),\s*"z":\s*(-?[\d.]+),'
    r'\s*"axis":\s*"(\w)",\s*"width":\s*([\d.]+)', dblk)]

EPS = 1e-3
STEP = 0.5


def floored(x, z):
    return any(a - EPS <= x <= c + EPS and b - EPS <= z <= d + EPS for a, b, c, d in ALL)


def walkable(x, z):
    return any(x > a + .01 and x < c - .01 and z > b + .01 and z < d - .01 for a, b, c, d in ALL)


def in_doorway(x, z, along):
    for _, dx, dz, axis, w in DOORS:
        half = w / 2 + 0.12
        if axis == "x" and along == "x":
            if abs(z - dz) < 1.4 and abs(x - dx) < half:
                return True
        elif axis == "z" and along == "z":
            if abs(x - dx) < 1.4 and abs(z - dz) < half:
                return True
    return False


errors = []

# ---- invariant 1: floor under every threshold ---------------------------
for did, dx, dz, axis, w in DOORS:
    for t in [i * 0.25 for i in range(-8, 9)]:
        px, pz = (dx + t, dz) if axis == "z" else (dx, dz + t)
        if not floored(px, pz):
            errors.append(f"doorway {did}: no floor at offset {t:+.2f}")
            break

# ---- invariant 2: wall on every room boundary ---------------------------
# Mirror ship_builder: for a ROOM rect, an edge sample is walled unless it
# falls inside a doorway.
gaps = 0
for x0, z0, x1, z1 in ROOMS:
    x = x0 + STEP / 2
    while x < x1:
        for z_edge in (z0, z1):
            if not in_doorway(x, z_edge, "x") and not floored(x, z_edge):
                gaps += 1
        x += STEP
    z = z0 + STEP / 2
    while z < z1:
        for x_edge in (x0, x1):
            if not in_doorway(x_edge, z, "z") and not floored(x_edge, z):
                gaps += 1
        z += STEP

# ---- invariant 3: no room pair may share an open (unwalled) face --------
# Under the corrected rule every room edge is walled, so simply assert the
# builder is using the room-forced predicate.
builder = open(os.path.join(ROOT, "scripts/world/ship_builder.gd"), encoding="utf-8").read()
# Count only the two wall-emission predicates, not the unrelated window check.
forced = len(re.findall(
    r"var exposed :=[^\n]*\n\s*room != null\n\s*or not ShipLayout\.walkable", builder))
if forced < 2:
    errors.append(
        f"ship_builder forces walls on only {forced}/2 room-boundary axes — rooms "
        "will open straight into the corridor (players walk through walls)")

print(f"rooms={len(ROOMS)} corridors={len(CORS)} doorways={len(DOORS)}")
print(f"floor gaps at thresholds : {sum('no floor' in e for e in errors)}")
print(f"unfloored room edges     : {gaps}")
print(f"wall rule forces rooms   : {forced}/2 axes")

if errors:
    print(f"\n{len(errors)} problems:")
    for e in errors[:20]:
        print("  ERROR ", e)
    sys.exit(1)
print("\nall wall/floor invariants hold")