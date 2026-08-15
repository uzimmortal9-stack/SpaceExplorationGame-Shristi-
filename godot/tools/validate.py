#!/usr/bin/env python3
"""
validate.py - static checks for the Godot port.

The build sandbox has no Godot binary, so this catches the errors that would
otherwise only surface on first run: unbalanced blocks, tab/space mixing,
JS leftovers from the TypeScript port, missing script/scene/asset paths, and
manifest drift.
"""
import os, re, sys, json

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
errors, warnings = [], []

def gd_files():
    for base, _, files in os.walk(os.path.join(ROOT, "scripts")):
        for f in sorted(files):
            if f.endswith(".gd"):
                yield os.path.join(base, f)

for path in gd_files():
    rel = os.path.relpath(path, ROOT)
    src = open(path, encoding="utf-8").read()
    lines = src.split("\n")

    meaningful = [l for l in lines if l.strip() and not l.strip().startswith("#")]
    if meaningful and not meaningful[0].startswith(("extends", "@tool", "class_name")):
        errors.append(f"{rel}: first statement is not extends/class_name -> {meaningful[0][:50]!r}")

    no_str = re.sub(r'"[^"\n]*"', '""', src)
    no_str = re.sub(r"'[^'\n]*'", "''", no_str)
    no_str = re.sub(r"#.*", "", no_str)
    for a, b in [("(", ")"), ("[", "]"), ("{", "}")]:
        if no_str.count(a) != no_str.count(b):
            errors.append(f"{rel}: unbalanced {a}{b} ({no_str.count(a)} vs {no_str.count(b)})")

    for i, line in enumerate(lines[:-1]):
        s = line.rstrip()
        if not s.endswith(":") or s.strip().startswith("#"):
            continue
        if not re.search(r"^\s*(match|if|elif|else|for|while|func|class|static func)\b", s):
            continue
        indent = len(s) - len(s.lstrip("\t"))
        nxt = next((l for l in lines[i+1:] if l.strip() and not l.strip().startswith("#")), None)
        if nxt is not None:
            ni = len(nxt) - len(nxt.lstrip("\t"))
            if ni <= indent:
                errors.append(f"{rel}:{i+1}: block opener not followed by indented body")

    for pat, msg in [
        (r"\bMath\.", "JS Math. leftover"),
        (r"\bconst\s+\w+\s*=\s", "JS const leftover"),
        (r"===", "JS strict equality"),
        (r"[^|]\|\|[^|]", "JS || (use 'or')"),
        (r"&&", "JS && (use 'and')"),
        (r"\bthis\.", "JS this. leftover"),
        (r"\bnull\b", "JS null (use 'null' is fine in GDScript4)  -- skip"),
    ]:
        if "skip" in msg:
            continue
        for m in re.finditer(pat, src):
            ln = src[:m.start()].count("\n") + 1
            errors.append(f"{rel}:{ln}: {msg}")

for base, _, files in os.walk(os.path.join(ROOT, "scenes")):
    for f in files:
        if not f.endswith(".tscn"):
            continue
        p = os.path.join(base, f)
        rel = os.path.relpath(p, ROOT)
        for m in re.finditer(r'path="res://([^"]+)"', open(p, encoding="utf-8").read()):
            if not os.path.exists(os.path.join(ROOT, m.group(1))):
                errors.append(f"{rel}: missing resource res://{m.group(1)}")

for path in gd_files():
    rel = os.path.relpath(path, ROOT)
    src = open(path, encoding="utf-8").read()
    for m in re.finditer(r'preload\("res://([^"]+)"\)', src):
        if not os.path.exists(os.path.join(ROOT, m.group(1))):
            ln = src[:m.start()].count("\n") + 1
            errors.append(f"{rel}:{ln}: preload missing res://{m.group(1)}")

man_path = os.path.join(ROOT, "assets/manifest.json")
if not os.path.exists(man_path):
    errors.append("assets/manifest.json missing")
else:
    man = json.load(open(man_path))
    ids = {m["id"] for m in man["models"]}
    missing = [m["id"] for m in man["models"]
               if not os.path.exists(os.path.join(ROOT, "assets/models/%s.glb" % m["id"]))]
    if missing:
        errors.append(f"{len(missing)} manifest models have no .glb: {missing[:5]}")
    else:
        print(f"manifest: {len(ids)} models, all .glb present")

    reg = open(os.path.join(ROOT, "scripts/assets/asset_registry.gd"), encoding="utf-8").read()
    body = reg.split("var manifest")[0]
    listed = set(re.findall(r'"([a-z][a-z0-9_]{2,})"', body))
    unknown = sorted(i for i in listed if i not in ids)
    if unknown:
        errors.append(f"asset_registry references unknown model ids: {unknown[:10]}")

# ---- every id the world scripts request must be loadable ----------------
if os.path.exists(man_path):
    used = set()
    for f in ["scripts/world/ship_rooms.gd", "scripts/world/planet.gd",
              "scripts/world/ship_builder.gd", "scripts/world/ship_exterior.gd"]:
        fp = os.path.join(ROOT, f)
        if not os.path.exists(fp):
            continue
        src = open(fp, encoding="utf-8").read()
        for pat in [r'place\("([a-z0-9_]+)"', r'instance\("([a-z0-9_]+)"',
                    r'line\("([a-z0-9_]+)"', r'size_of\("([a-z0-9_]+)"']:
            used |= set(re.findall(pat, src))
        for arr in re.findall(r'\["([a-z0-9_"\s,]+)"\]', src):
            for tok in re.findall(r"[a-z0-9_]+", arr):
                if tok in ids:
                    used.add(tok)
    unknown_use = sorted(used - ids)
    if unknown_use:
        errors.append(f"world scripts request unknown model ids: {unknown_use[:10]}")
    never_loaded = sorted(used - listed)
    if never_loaded:
        errors.append(f"models used but in no load group: {never_loaded[:10]}")
    if not unknown_use and not never_loaded:
        print(f"cross-check: {len(used)} requested ids all present and grouped")

# ---- every layout room must be furnished --------------------------------
lay = os.path.join(ROOT, "scripts/world/ship_layout.gd")
if os.path.exists(lay):
    txt = open(lay, encoding="utf-8").read()
    if "const ROOMS: Array = [" in txt:
        block = txt.split("const ROOMS: Array = [")[1].split("\n]")[0]
        room_ids = re.findall(r'"id":\s*"(\w+)"', block)
        allsrc = ""
        for f in ["scripts/world/ship_rooms.gd", "scripts/world/ship_rooms_engineering.gd"]:
            fp = os.path.join(ROOT, f)
            if os.path.exists(fp):
                allsrc += open(fp, encoding="utf-8").read()
        covered = set(re.findall(r'_room\("(\w+)"\)', allsrc))
        covered |= {"cabin_a", "cabin_b", "washroom_a", "washroom_b", "bridge"}
        unfurnished = [r for r in room_ids if r not in covered]
        if unfurnished:
            errors.append(f"layout rooms never furnished: {unfurnished}")
        else:
            print(f"rooms: all {len(room_ids)} layout compartments furnished")

# ---- host.* delegation in the split rooms file must resolve --------------
rp = os.path.join(ROOT, "scripts/world/ship_rooms.gd")
ep = os.path.join(ROOT, "scripts/world/ship_rooms_engineering.gd")
if os.path.exists(rp) and os.path.exists(ep):
    rsrc = open(rp, encoding="utf-8").read()
    esrc = open(ep, encoding="utf-8").read()
    used = set(re.findall(r"host\.([_a-z][a-z0-9_]*)", esrc))
    have = set(re.findall(r"^func ([_a-z][a-z0-9_]*)", rsrc, re.M))
    have |= set(re.findall(r"^var ([_a-z][a-z0-9_]*)", rsrc, re.M))
    have |= set(re.findall(r"^signal ([_a-z][a-z0-9_]*)", rsrc, re.M))
    have |= {"add_child", "remove_child", "get_child", "get_children", "queue_free", "name", "position", "rotation"}
    unresolved = sorted(used - have)
    if unresolved:
        errors.append(f"ship_rooms_engineering references missing host members: {unresolved}")

# ---- REGRESSION: every doorway must have floor under it -----------------
# This is the bug that dropped the player into the void: rooms stopped at
# x=+-3 while the spine corridor only spanned x=-2..2, leaving an open strip
# at every threshold. Never again.
if os.path.exists(lay):
    txt = open(lay, encoding="utf-8").read()

    def _rects(section):
        if section not in txt:
            return []
        blk = txt.split(section)[1].split("\n]")[0]
        return [tuple(map(float, m)) for m in re.findall(
            r'"x0":\s*(-?[\d.]+),\s*"z0":\s*(-?[\d.]+),\s*"x1":\s*(-?[\d.]+),\s*"z1":\s*(-?[\d.]+)', blk)]

    rects = _rects("const ROOMS: Array = [") + _rects("const CORRIDORS: Array = [")
    dblk = txt.split("const DOORWAYS: Array = [")[1].split("\n]")[0] if "const DOORWAYS" in txt else ""
    doors = re.findall(
        r'"id":\s*"(\w+)"[\s\S]{0,200}?"x":\s*(-?[\d.]+),\s*"z":\s*(-?[\d.]+),\s*"axis":\s*"(\w)"', dblk)

    EPS = 1e-3
    def _floored(x, z):
        return any(x >= a - EPS and x <= c + EPS and z >= b - EPS and z <= d + EPS
                   for a, b, c, d in rects)

    holed = []
    for did, dx, dz, axis in doors:
        dx, dz = float(dx), float(dz)
        for step in [i * 0.25 for i in range(-8, 9)]:
            px, pz = (dx + step, dz) if axis == "z" else (dx, dz + step)
            if not _floored(px, pz):
                holed.append(did)
                break
    if holed:
        errors.append(f"doorways with no floor (player falls into the void): {holed}")
    elif doors:
        print(f"doorways: all {len(doors)} thresholds have floor beneath them")

    # corridors must not overlap rooms (double floor / z-fighting)
    room_rects = _rects("const ROOMS: Array = [")
    cor_rects = _rects("const CORRIDORS: Array = [")
    overlaps = 0
    for a, b, c, d in cor_rects:
        for x0, z0, x1, z1 in room_rects:
            if min(c, x1) - max(a, x0) > 0.02 and min(d, z1) - max(b, z0) > 0.02:
                overlaps += 1
    if overlaps:
        warnings.append(f"{overlaps} corridor/room overlaps (z-fighting risk)")

print(f"\n{len(errors)} errors, {len(warnings)} warnings")
for e in errors[:40]:
    print("  ERROR  ", e)
for w in warnings[:20]:
    print("  warn   ", w)
sys.exit(1 if errors else 0)