#!/usr/bin/env python3
"""
sim_runtime.py — catches the classes of bug that a parser cannot see.

gdparse proves each file is syntactically valid GDScript. It says nothing about
whether the game is *playable*. Every check here exists because a real playtest
bug got through the previous gate:

  1. UNDECLARED IDENTIFIERS
     `_surface_cache` was used in ship_builder.gd but never declared. GDScript
     resolves identifiers at compile time, so this is a hard load error: the
     ShipBuilder class fails to compile, the ship never builds, and the entire
     interior (walls, floors, collision) silently disappears. It parses fine.

  2. DOORWAY AXIS vs. THE WALL IT SITS IN
     A doorway on the plane x = k belongs to a wall running along Z, so it must
     declare axis "z". d_engineering declared "x", which rotated its frame and
     collision 90 degrees out of the partition.

  3. WHOLE-SHIP REACHABILITY
     Rebuilds the wall/jamb collision boxes exactly as ship_builder does, then
     flood-fills from the spawn point at the player's capsule radius. Any
     compartment the player cannot physically walk to is a bug — this is how the
     sealed-off cargo bay and boarding ramp were found.

  4. CO-LOCATED INTERACTABLES
     Interact.update_from scores `dot * 2.2 - dist / radius + priority`. Two
     props at the same point share dot and dist, so the one with the LARGER
     radius always wins unless the inner one carries a priority bonus. The
     throttle button lost to its own safety lid, which meant the drive could
     never be armed and the ship could never be flown.
"""
import collections
import glob
import math
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
os.chdir(ROOT)

errors = []
TILE = 4.0

# --------------------------------------------------------------- 1. identifiers

BUILTIN = set(
    """self true false null PI TAU INF NAN Vector2 Vector3 Vector4 Basis Transform3D
    Transform2D Quaternion Color Plane AABB Rect2 Rect2i Vector2i Vector3i String
    StringName NodePath RID Callable Signal Dictionary Array PackedByteArray
    PackedInt32Array PackedInt64Array PackedFloat32Array PackedFloat64Array
    PackedStringArray PackedVector2Array PackedVector3Array PackedColorArray""".split()
)
KEYWORDS = set(
    """var const func if elif else for while return break continue pass match in and or
    not is as extends class_name signal enum class static await super assert void when
    int float bool set get breakpoint tool""".split()
)

undeclared = []
for path in sorted(glob.glob("scripts/**/*.gd", recursive=True)):
    src = open(path, encoding="utf-8").read()
    decl = set(BUILTIN)
    for m in re.finditer(
        r"^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:static\s+)?(?:var|const)\s+([A-Za-z_]\w*)", src, re.M
    ):
        decl.add(m.group(1))
    for m in re.finditer(r"^\s*(?:static\s+)?func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)", src, re.M):
        decl.add(m.group(1))
        for a in m.group(2).split(","):
            if a.strip():
                decl.add(re.split(r"[:=\s]", a.strip())[0])
    for m in re.finditer(r"\bfunc\s*\(([^)]*)\)", src):
        for a in m.group(1).split(","):
            if a.strip():
                decl.add(re.split(r"[:=\s]", a.strip())[0])
    for m in re.finditer(r"^\s*for\s+([A-Za-z_]\w*)", src, re.M):
        decl.add(m.group(1))
    for m in re.finditer(r"^\s*(?:class_name|signal|enum|class)\s+([A-Za-z_]\w*)", src, re.M):
        decl.add(m.group(1))
    # signal parameter lists declare names too
    for m in re.finditer(r"^\s*signal\s+\w+\s*\(([^)]*)\)", src, re.M):
        for a in m.group(1).split(","):
            if a.strip():
                decl.add(re.split(r"[:=\s]", a.strip())[0])

    for i, line in enumerate(src.split("\n"), 1):
        code = re.sub(r'"[^"]*"', '""', line)
        code = re.sub(r"#.*", "", code)
        for m in re.finditer(r'(?<![.\w"&@$])([a-z_]\w*)\b', code):
            n = m.group(1)
            if n in decl or n in KEYWORDS:
                continue
            if n == "_":  # match-statement wildcard / throwaway
                continue
            if code[m.end():].startswith("("):  # a call — could be a global builtin
                continue
            undeclared.append(f"{path}:{i}: undeclared identifier `{n}`")

# Node/CharacterBody3D inherited properties assigned in _ready are legitimate.
INHERITED = {
    "collision_layer", "collision_mask", "floor_max_angle", "floor_snap_length",
    "global_position", "global_transform", "velocity", "visible", "name", "layer",
}
undeclared = [u for u in undeclared if u.rsplit("`", 2)[1] not in INHERITED]
for u in undeclared:
    errors.append(u)

# ------------------------------------------------------------------ 2/3. layout

txt = open("scripts/world/ship_layout.gd", encoding="utf-8").read()
# Strip comments: doorway entries carry explanatory comments between their keys,
# which would otherwise break the field-order regexes below.
txt = re.sub(r"^\s*#.*$", "", txt, flags=re.M)


def rects(section):
    blk = txt.split(section)[1].split("\n]")[0]
    return [
        tuple(map(float, m))
        for m in re.findall(
            r'"x0":\s*(-?[\d.]+),\s*"z0":\s*(-?[\d.]+),\s*"x1":\s*(-?[\d.]+),\s*"z1":\s*(-?[\d.]+)',
            blk,
        )
    ]


ROOMS = rects("const ROOMS: Array = [")
CORS = rects("const CORRIDORS: Array = [")
ALL = ROOMS + CORS
RIDS = re.findall(r'"id":\s*"(\w+)"', txt.split("const ROOMS: Array = [")[1].split("\n]\n")[0])

dblk = txt.split("const DOORWAYS: Array = [")[1].split("\n]")[0]
DOORS = [
    (m[0], float(m[1]), float(m[2]), m[3], float(m[4]))
    for m in re.findall(
        r'"id":\s*"(\w+)"[\s\S]{0,320}?"x":\s*(-?[\d.]+),\s*"z":\s*(-?[\d.]+),'
        r'[\s\S]{0,320}?"axis":\s*"(\w)",\s*"width":\s*([\d.]+)',
        dblk,
    )
]

TAGGED = [(*r, RIDS[i]) for i, r in enumerate(ROOMS)] + [(*c, None) for c in CORS]

# ---- 2. every doorway must lie in the wall plane its axis implies
for did, dx, dz, axis, w in DOORS:
    on_z_edge = any(
        (abs(dz - b) < 0.01 or abs(dz - d) < 0.01) and a - 0.01 <= dx <= c + 0.01
        for a, b, c, d, _ in TAGGED
    )
    on_x_edge = any(
        (abs(dx - a) < 0.01 or abs(dx - c) < 0.01) and b - 0.01 <= dz <= d + 0.01
        for a, b, c, d, _ in TAGGED
    )
    # a wall running along X lies on a z-edge -> axis "x"
    if on_z_edge and not on_x_edge:
        want = "x"
    elif on_x_edge and not on_z_edge:
        want = "z"
    else:
        continue
    if want != axis:
        errors.append(
            f'doorway {did}: axis "{axis}" but it sits on an {"x" if want == "z" else "z"}-edge; '
            f'the wall there runs along {want.upper()} so axis must be "{want}" '
            "(frame and collision are rotated 90 degrees out of the partition)"
        )


def walkable(x, z):
    return any(x > a + 0.01 and x < c - 0.01 and z > b + 0.01 and z < d - 0.01 for a, b, c, d in ALL)


def floored(x, z):
    return any(a - 1e-3 <= x <= c + 1e-3 and b - 1e-3 <= z <= d + 1e-3 for a, b, c, d in ALL)


def room_at(x, z):
    for i, (a, b, c, d) in enumerate(ROOMS):
        if x > a and x < c and z > b and z < d:
            return RIDS[i]
    return None


def spans(a, b):
    length = b - a
    whole = int(math.floor(length / TILE + 1e-6))
    out = [(a + i * TILE + TILE / 2, 1.0) for i in range(whole)]
    rem = length - whole * TILE
    if rem > 0.05:
        out.append((a + whole * TILE + rem / 2, rem / TILE))
    return out


def subtract_doors(a, b, fixed, along):
    pieces = [(a, b)]
    for _, dx, dz, axis, w in DOORS:
        perp = dz if along == "x" else dx
        if abs(perp - fixed) > 1.4:
            continue
        c = dx if along == "x" else dz
        half = w / 2 + 0.12
        lo, hi = c - half, c + half
        nxt = []
        for s0, s1 in pieces:
            if hi <= s0 or lo >= s1:
                nxt.append((s0, s1))
                continue
            if lo > s0:
                nxt.append((s0, lo))
            if hi < s1:
                nxt.append((hi, s1))
        pieces = nxt
    return [p for p in pieces if p[1] - p[0] > 0.08]


# ---- rebuild ship_builder's collision boxes
boxes = []


def emit_wall(bx, bz, nx, nz, length):
    t = 0.45
    if nz != 0.0:
        boxes.append((bx, bz + nz * t * 0.5, length, t))
    else:
        boxes.append((bx + nx * t * 0.5, bz, t, length))


for a, b, c, d in ALL:
    room = room_at((a + c) / 2, (b + d) / 2)
    for z_edge, nz in ((b, 1.0), (d, -1.0)):
        run, x = None, a
        while x <= c + 1e-6:
            exposed = x < c and (room is not None or not walkable(x + 0.25, z_edge - nz * 0.5))
            if exposed and run is None:
                run = x
            if (not exposed or x >= c) and run is not None:
                for p0, p1 in subtract_doors(run, min(x, c), z_edge, "x"):
                    for cc, s in spans(p0, p1):
                        emit_wall(cc, z_edge, 0.0, nz, s * TILE)
                run = None
            x += 0.5
    for x_edge, nx in ((a, 1.0), (c, -1.0)):
        run, z = None, b
        while z <= d + 1e-6:
            exposed = z < d and (room is not None or not walkable(x_edge - nx * 0.5, z + 0.25))
            if exposed and run is None:
                run = z
            if (not exposed or z >= d) and run is not None:
                for p0, p1 in subtract_doors(run, min(z, d), x_edge, "z"):
                    for cc, s in spans(p0, p1):
                        emit_wall(x_edge, cc, nx, 0.0, s * TILE)
                run = None
            z += 0.5

for did, dx, dz, axis, w in DOORS:
    half, jamb = w / 2, 0.7
    if axis == "x":
        boxes.append((dx - half - jamb / 2, dz, jamb, 0.6))
        boxes.append((dx + half + jamb / 2, dz, jamb, 0.6))
    else:
        boxes.append((dx, dz - half - jamb / 2, 0.6, jamb))
        boxes.append((dx, dz + half + jamb / 2, 0.6, jamb))

# ---- 3. flood fill at the player's capsule radius
R, G = 0.34, 0.125


def blocked(x, z):
    return any(abs(x - cx) < sx / 2 + R and abs(z - cz) < sz / 2 + R for cx, cz, sx, sz in boxes)


minx = min(a for a, b, c, d in ALL)
maxx = max(c for a, b, c, d in ALL)
minz = min(b for a, b, c, d in ALL)
maxz = max(d for a, b, c, d in ALL)
W = int((maxx - minx) / G) + 1
H = int((maxz - minz) / G) + 1

free = [[False] * H for _ in range(W)]
for i in range(W):
    xx = minx + i * G
    for j in range(H):
        zz = minz + j * G
        if floored(xx, zz) and not blocked(xx, zz):
            free[i][j] = True

spawn = re.search(r'const SPAWN := \{"x": (-?[\d.]+), "y": (-?[\d.]+), "z": (-?[\d.]+)', txt)
sx, sz = (float(spawn.group(1)), float(spawn.group(3))) if spawn else (-8.0, -2.0)
start = (int(round((sx - minx) / G)), int(round((sz - minz) / G)))

if not free[start[0]][start[1]]:
    errors.append(f"spawn point ({sx}, {sz}) is inside collision — the player starts stuck")
    reach = set()
else:
    seen = {start}
    q = collections.deque([start])
    while q:
        i, j = q.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p, r = i + di, j + dj
            if 0 <= p < W and 0 <= r < H and free[p][r] and (p, r) not in seen:
                seen.add((p, r))
                q.append((p, r))
    reach = {room_at(minx + i * G, minz + j * G) for i, j in seen} - {None}

for rid in RIDS:
    if rid not in reach:
        errors.append(f"compartment `{rid}` is unreachable on foot from the spawn point")

# ----------------------------------------------------- 3b. shader builtins

# Godot 4 removed the implicit SCREEN_TEXTURE / DEPTH_TEXTURE builtins. Reading
# the framebuffer now requires a declared `uniform sampler2D ... :
# hint_screen_texture`. Using the old name is a shader COMPILE error, so the
# effect silently renders as a blank rect -- which is what killed the warp
# tunnel. gdparse only reads .gd files, so nothing else covers this.
for path in sorted(glob.glob("shaders/*.gdshader")):
    shader_src = open(path, encoding="utf-8").read()
    shader_body = re.sub(r"//.*", "", shader_src)
    for builtin, hint in (("SCREEN_TEXTURE", "hint_screen_texture"),
                          ("DEPTH_TEXTURE", "hint_depth_texture")):
        if re.search(r"\b" + builtin + r"\b", shader_body):
            errors.append(
                path + ": uses the removed Godot 3 builtin `" + builtin
                + "` -- declare `uniform sampler2D screen_texture : " + hint
                + ";` and sample that instead, or the shader fails to compile "
                "at runtime and the effect renders as a blank rect")


# ------------------------------------------------------- 4. co-located interacts

items = []
for path in sorted(glob.glob("scripts/**/*.gd", recursive=True)):
    src = open(path, encoding="utf-8").read()
    for m in re.finditer(r"Interact\.register\(\{(.*?)\n\t\}\)", src, re.S):
        body = m.group(1)
        mid = re.search(r'"id":\s*"([^"]+)"', body)
        mpos = re.search(r'"position":\s*Vector3\(([^)]*)\)', body)
        if not (mid and mpos):
            continue
        try:
            pos = [float(eval(t, {"PI": math.pi})) for t in mpos.group(1).split(",")]
        except Exception:
            continue
        mrad = re.search(r'"radius":\s*([\d.]+)', body)
        mpri = re.search(r'"priority":\s*(-?[\d.]+)', body)
        gated = re.search(r'"enabled":\s*false', body) is not None
        items.append(
            (mid.group(1), pos, float(mrad.group(1)) if mrad else 2.0,
             float(mpri.group(1)) if mpri else 0.0, gated)
        )

for i, a in enumerate(items):
    for b in items[i + 1:]:
        if math.dist(a[1], b[1]) >= 0.5:
            continue
        # identical dot and dist: whoever ends up with the higher constant wins
        for lo, hi in ((a, b), (b, a)):
            # A gated control (enabled: false until its cover is opened) MUST be
            # able to win once enabled, or opening the cover achieves nothing.
            # The cover itself losing afterwards is intended, so only flag a
            # loser that is gated, or a pair where neither is gated.
            if hi[4] or (not lo[4] and (a[4] or b[4])):
                continue
            # can `lo` ever beat `hi` at any distance within both radii?
            best = max(
                (-d / max(lo[2], 1e-3) + lo[3]) - (-d / max(hi[2], 1e-3) + hi[3])
                for d in [x * 0.05 for x in range(1, int(min(lo[2], hi[2]) / 0.05))]
            )
            if best <= 0:
                errors.append(
                    f"interactables `{lo[0]}` and `{hi[0]}` are "
                    f"{math.dist(a[1], b[1]):.2f} m apart and `{lo[0]}` can never win the "
                    f"candidate score (r={lo[2]} p={lo[3]} vs r={hi[2]} p={hi[3]}) — "
                    "it is permanently unusable; give it a `priority` bonus"
                )

# ----------------------------------------------------------------------- report

print(f"undeclared identifiers   : {len(undeclared)}")
print(f"doorway axis mismatches  : {sum('axis' in e for e in errors)}")
print(f"reachable compartments   : {len(reach)}/{len(RIDS)}")
print(f"wall collision boxes     : {len(boxes)}")
print(f"shaders checked          : {len(glob.glob('shaders/*.gdshader'))}")
print(f"interactables checked    : {len(items)} (with literal positions)")

if errors:
    print(f"\n{len(errors)} problems:")
    for e in errors[:25]:
        print("  ERROR ", e)
    sys.exit(1)
print("\nruntime invariants hold")