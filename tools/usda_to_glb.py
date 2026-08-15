#!/usr/bin/env python3
"""
usda_to_glb.py — convert Quaternius CC0 `.usda` meshes into binary glTF (.glb).

The Quaternius asset mirror (github.com/weftspun/quaternius-stage, CC0-1.0)
distributes every model as a Blender-exported ASCII USD file. This tool parses
that subset of USD (Xform / Mesh / GeomSubset / UsdPreviewSurface) and emits a
standards-compliant .glb with:

  * de-duplicated interleaved-free vertex attributes (POSITION / NORMAL / TEXCOORD_0)
  * one glTF primitive per GeomSubset so per-material assignment survives
  * triangulated faces (fan triangulation of the convex n-gons Blender exports)
  * UsdPreviewSurface -> pbrMetallicRoughness (baseColor / metallic / roughness)
  * the +Z-up -> +Y-up correction baked into the vertex data, and the pivot
    normalised (see --pivot) so the caller never has to guess an offset.

Usage:
    python3 tools/usda_to_glb.py IN.usda OUT.glb [--pivot bottom|center|keep]
                                                 [--scale S] [--name NAME]
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import os
import re
import struct
import sys
from typing import Dict, List, Optional, Tuple

# --------------------------------------------------------------------------
# tiny USDA reader
# --------------------------------------------------------------------------

NUM = r"[-+0-9eE.]+"


def _floats(text: str) -> List[float]:
    return [float(x) for x in re.findall(NUM, text)]


def _bracket_payload(src: str, start: int) -> Tuple[str, int]:
    """Return the text inside the [...] beginning at/after `start`."""
    i = src.index("[", start)
    depth = 0
    for j in range(i, len(src)):
        c = src[j]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return src[i + 1 : j], j + 1
    raise ValueError("unterminated bracket")


def _block(src: str, start: int) -> Tuple[str, int]:
    """Return the text inside the prim body {...} beginning at/after `start`.

    A USD prim may carry a parenthesised metadata section between its
    declaration and its body -- `def Xform "root" ( customData = { ... } ) { ... }`.
    That metadata can itself contain braces, so skip it before scanning.
    """
    probe = start
    while probe < len(src) and src[probe] in " \t\r\n":
        probe += 1
    if probe < len(src) and src[probe] == "(":
        depth = 0
        for j in range(probe, len(src)):
            if src[j] == "(":
                depth += 1
            elif src[j] == ")":
                depth -= 1
                if depth == 0:
                    start = j + 1
                    break
    i = src.index("{", start)
    depth = 0
    for j in range(i, len(src)):
        c = src[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return src[i + 1 : j], j + 1
    raise ValueError("unterminated block")


def _vec_list(payload: str, width: int) -> List[Tuple[float, ...]]:
    out: List[Tuple[float, ...]] = []
    for m in re.finditer(r"\(([^)]*)\)", payload):
        v = _floats(m.group(1))
        if len(v) >= width:
            out.append(tuple(v[:width]))
    return out


def _int_list(payload: str) -> List[int]:
    return [int(x) for x in re.findall(r"-?\d+", payload)]


def _tex_uri(base: Optional[str], filename: str, tex_dir: Optional[str]) -> Optional[str]:
    """Build the external URI for a texture, or None to embed it.

    Returns None when the source image is not present, so the caller drops the
    texture reference entirely rather than emitting a glTF that points at a
    missing file (which would render as untextured white at runtime).
    """
    if not base:
        return None
    name = os.path.basename(filename)
    if tex_dir and not os.path.isfile(os.path.join(tex_dir, name)):
        return None
    return base.rstrip("/") + "/" + name


class Material:
    __slots__ = (
        "name", "base_color", "metallic", "roughness", "opacity", "emissive",
        "base_color_tex", "normal_tex",
    )

    def __init__(self, name: str) -> None:
        self.name = name
        self.base_color = (0.8, 0.8, 0.8)
        self.metallic = 0.0
        self.roughness = 0.5
        self.opacity = 1.0
        self.emissive = (0.0, 0.0, 0.0)
        self.base_color_tex: Optional[str] = None
        self.normal_tex: Optional[str] = None


def parse_materials(src: str) -> Dict[str, Material]:
    """Collect every `def Material "X"` and its UsdPreviewSurface inputs."""
    mats: Dict[str, Material] = {}
    for m in re.finditer(r'def Material\s+"([^"]+)"', src):
        name = m.group(1)
        body, _ = _block(src, m.end())
        mat = Material(name)

        def scalar(key: str) -> Optional[float]:
            mm = re.search(r"float inputs:%s\s*=\s*(%s)" % (key, NUM), body)
            return float(mm.group(1)) if mm else None

        def color(key: str) -> Optional[Tuple[float, float, float]]:
            mm = re.search(r"color3f inputs:%s\s*=\s*\(([^)]*)\)" % key, body)
            if not mm:
                return None
            v = _floats(mm.group(1))
            return (v[0], v[1], v[2]) if len(v) >= 3 else None

        c = color("diffuseColor")
        if c:
            mat.base_color = c
        e = color("emissiveColor")
        if e:
            mat.emissive = e
        for attr, key in (("metallic", "metallic"), ("roughness", "roughness"), ("opacity", "opacity")):
            v = scalar(key)
            if v is not None:
                setattr(mat, attr, v)

        # Textured variants wire diffuseColor / normal to a UsdUVTexture shader.
        # Resolve those connections back to the referenced image file.
        shaders: Dict[str, str] = {}
        for sm in re.finditer(r'def Shader\s+"([^"]+)"', body):
            sbody, _ = _block(body, sm.end())
            fm = re.search(r"asset inputs:file\s*=\s*@([^@]+)@", sbody)
            if fm:
                shaders[sm.group(1)] = os.path.basename(fm.group(1).strip())

        def connected(key: str) -> Optional[str]:
            mm = re.search(
                r"inputs:%s\.connect\s*=\s*<[^>]*/([\w.]+)\.outputs:" % key, body
            )
            return shaders.get(mm.group(1)) if mm else None

        mat.base_color_tex = connected("diffuseColor")
        mat.normal_tex = connected("normal")
        if mat.base_color_tex:
            # A textured material must not also tint via baseColorFactor.
            mat.base_color = (1.0, 1.0, 1.0)
        mats[name] = mat
    return mats


class SubMesh:
    __slots__ = ("material", "faces")

    def __init__(self, material: str) -> None:
        self.material = material
        self.faces: List[int] = []


class Mesh:
    __slots__ = (
        "name", "points", "normals", "uvs", "counts", "indices", "material",
        "subsets", "xform", "uv_indices", "normal_indices",
    )

    def __init__(self, name: str) -> None:
        self.name = name
        self.points: List[Tuple[float, float, float]] = []
        self.normals: List[Tuple[float, float, float]] = []
        self.uvs: List[Tuple[float, float]] = []
        self.counts: List[int] = []
        self.indices: List[int] = []
        self.material: Optional[str] = None
        self.subsets: List[SubMesh] = []
        self.xform: Optional[List[float]] = None  # 4x4 row-major, or None
        self.uv_indices: List[int] = []
        self.normal_indices: List[int] = []


def _mat_ident() -> List[float]:
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def _mat_mul(a: List[float], b: List[float]) -> List[float]:
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[r * 4 + c] = sum(a[r * 4 + k] * b[k * 4 + c] for k in range(4))
    return out


def _mat_from_trs(t, r_xyz_deg, s) -> List[float]:
    m = _mat_ident()
    if r_xyz_deg:
        rx, ry, rz = (math.radians(v) for v in r_xyz_deg)
        cx, sx = math.cos(rx), math.sin(rx)
        cy, sy = math.cos(ry), math.sin(ry)
        cz, sz = math.cos(rz), math.sin(rz)
        # USD rotateXYZ == apply X, then Y, then Z
        rot = [
            cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz, 0,
            cy * sz, cx * cz + sx * sy * sz, -cz * sx + cx * sy * sz, 0,
            -sy,     cy * sx,                cx * cy,                 0,
            0, 0, 0, 1,
        ]
        m = rot
    if s:
        sc = _mat_ident()
        sc[0], sc[5], sc[10] = s
        m = _mat_mul(m, sc)
    if t:
        m[3], m[7], m[11] = t
    return m


def _read_xform_ops(body: str) -> Optional[List[float]]:
    """Read the xformOp:* attributes declared directly in `body` (non-recursive)."""
    head = body.split("def ", 1)[0]
    mm = re.search(r"matrix4d\s+xformOp:transform\s*=\s*\(([\s\S]*?)\)\s*\n", head)
    if mm:
        v = _floats(mm.group(1))
        if len(v) == 16:
            # USD matrices are row-vector convention; transpose to row-major point-major.
            return [
                v[0], v[4], v[8], v[12],
                v[1], v[5], v[9], v[13],
                v[2], v[6], v[10], v[14],
                v[3], v[7], v[11], v[15],
            ]
    t = r = s = None
    mt = re.search(r"(?:double3|float3)\s+xformOp:translate\s*=\s*\(([^)]*)\)", head)
    if mt:
        t = _floats(mt.group(1))[:3]
    mr = re.search(r"(?:double3|float3)\s+xformOp:rotateXYZ\s*=\s*\(([^)]*)\)", head)
    if mr:
        r = _floats(mr.group(1))[:3]
    ms = re.search(r"(?:double3|float3)\s+xformOp:scale\s*=\s*\(([^)]*)\)", head)
    if ms:
        s = _floats(ms.group(1))[:3]
    if t is None and r is None and s is None:
        return None
    return _mat_from_trs(t, r, s)


def parse_meshes(src: str) -> List[Mesh]:
    """Walk every `def Mesh`, accumulating the parent Xform chain."""
    meshes: List[Mesh] = []

    def walk(body: str, parent: List[float]) -> None:
        pos = 0
        while True:
            m = re.compile(r'def (\w+)\s+"([^"]+)"').search(body, pos)
            if not m:
                return
            kind, name = m.group(1), m.group(2)
            try:
                inner, end = _block(body, m.end())
            except ValueError:
                return
            pos = end
            local = _read_xform_ops(inner)
            world = _mat_mul(parent, local) if local else parent

            if kind == "Mesh":
                mesh = Mesh(name)
                mesh.xform = world
                mp = re.search(r"point3f\[\]\s+points\s*=", inner)
                if mp:
                    payload, _ = _bracket_payload(inner, mp.end())
                    mesh.points = _vec_list(payload, 3)
                mn = re.search(r"normal3f\[\]\s+normals\s*=", inner)
                if mn:
                    payload, _ = _bracket_payload(inner, mn.end())
                    mesh.normals = _vec_list(payload, 3)
                mu = re.search(r"texCoord2f\[\]\s+primvars:st\s*=", inner)
                if mu:
                    payload, _ = _bracket_payload(inner, mu.end())
                    mesh.uvs = _vec_list(payload, 2)
                mui = re.search(r"int\[\]\s+primvars:st:indices\s*=", inner)
                if mui:
                    payload, _ = _bracket_payload(inner, mui.end())
                    mesh.uv_indices = _int_list(payload)
                mni = re.search(r"int\[\]\s+primvars:normals:indices\s*=", inner)
                if mni:
                    payload, _ = _bracket_payload(inner, mni.end())
                    mesh.normal_indices = _int_list(payload)
                mc = re.search(r"int\[\]\s+faceVertexCounts\s*=", inner)
                if mc:
                    payload, _ = _bracket_payload(inner, mc.end())
                    mesh.counts = _int_list(payload)
                mi = re.search(r"int\[\]\s+faceVertexIndices\s*=", inner)
                if mi:
                    payload, _ = _bracket_payload(inner, mi.end())
                    mesh.indices = _int_list(payload)
                mb = re.search(r"rel material:binding\s*=\s*<[^>]*/([\w.]+)>", inner.split("def ", 1)[0])
                if mb:
                    mesh.material = mb.group(1)
                for gm in re.finditer(r'def GeomSubset\s+"([^"]+)"', inner):
                    gbody, _ = _block(inner, gm.end())
                    sub = SubMesh(gm.group(1))
                    gi = re.search(r"int\[\]\s+indices\s*=", gbody)
                    if gi:
                        payload, _ = _bracket_payload(gbody, gi.end())
                        sub.faces = _int_list(payload)
                    gb = re.search(r"rel material:binding\s*=\s*<[^>]*/([\w.]+)>", gbody)
                    if gb:
                        sub.material = gb.group(1)
                    mesh.subsets.append(sub)
                if mesh.points and mesh.counts:
                    meshes.append(mesh)
                walk(inner, world)
            elif kind in ("Xform", "Scope", "SkelRoot"):
                walk(inner, world)

    walk(src, _mat_ident())
    return meshes


# --------------------------------------------------------------------------
# glTF writer
# --------------------------------------------------------------------------


class GLB:
    def __init__(self) -> None:
        self.bin = bytearray()
        self.buffer_views: List[dict] = []
        self.accessors: List[dict] = []
        self.materials: List[dict] = []
        self.meshes: List[dict] = []
        self.nodes: List[dict] = []
        self.images: List[dict] = []
        self.textures: List[dict] = []
        self.samplers: List[dict] = [
            {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}
        ]
        self._tex_cache: Dict[str, int] = {}

    def add_texture(self, file_path: str, uri: Optional[str] = None) -> Optional[int]:
        """Reference (or embed) an image and return its glTF texture index.

        When `uri` is given the image is linked externally, so the many models
        that share one Quaternius atlas do not each carry a private copy -- the
        browser downloads and caches the atlas exactly once.
        """
        key = uri or os.path.abspath(file_path)
        if key in self._tex_cache:
            return self._tex_cache[key]
        if uri:
            self.images.append({"uri": uri, "name": os.path.basename(uri)})
        else:
            if not os.path.isfile(file_path):
                return None
            with open(file_path, "rb") as fh:
                data = fh.read()
            ext = os.path.splitext(file_path)[1].lower()
            mime = "image/png" if ext == ".png" else "image/jpeg"
            view = self.add_view(data)
            self.images.append(
                {"bufferView": view, "mimeType": mime, "name": os.path.basename(file_path)}
            )
        self.textures.append({"sampler": 0, "source": len(self.images) - 1})
        idx = len(self.textures) - 1
        self._tex_cache[key] = idx
        return idx

    def _align(self, n: int = 4) -> None:
        while len(self.bin) % n:
            self.bin.append(0)

    def add_view(self, data: bytes, target: Optional[int] = None) -> int:
        self._align()
        off = len(self.bin)
        self.bin.extend(data)
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.buffer_views.append(view)
        return len(self.buffer_views) - 1

    def add_vec_accessor(self, values: List[Tuple[float, ...]], width: int) -> int:
        fmt = "<" + "f" * width
        data = b"".join(struct.pack(fmt, *v) for v in values)
        view = self.add_view(data, 34962)
        mins = [min(v[i] for v in values) for i in range(width)]
        maxs = [max(v[i] for v in values) for i in range(width)]
        self.accessors.append(
            {
                "bufferView": view,
                "componentType": 5126,
                "count": len(values),
                "type": {2: "VEC2", 3: "VEC3", 4: "VEC4"}[width],
                "min": mins,
                "max": maxs,
            }
        )
        return len(self.accessors) - 1

    def add_index_accessor(self, indices: List[int]) -> int:
        if not indices:
            raise ValueError("empty index buffer")
        hi = max(indices)
        if hi < 65535:
            data = struct.pack("<%dH" % len(indices), *indices)
            ctype = 5123
        else:
            data = struct.pack("<%dI" % len(indices), *indices)
            ctype = 5125
        view = self.add_view(data, 34963)
        self.accessors.append(
            {"bufferView": view, "componentType": ctype, "count": len(indices), "type": "SCALAR"}
        )
        return len(self.accessors) - 1

    def write(self, path: str, name: str) -> None:
        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "usda_to_glb.py (Quaternius CC0 -> glTF)",
                "copyright": "Model: Quaternius (CC0 1.0)",
            },
            "scene": 0,
            "scenes": [{"name": name, "nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin)}],
        }
        if self.images:
            gltf["images"] = self.images
            gltf["textures"] = self.textures
            gltf["samplers"] = self.samplers
        json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        while len(json_bytes) % 4:
            json_bytes += b" "
        bin_bytes = bytes(self.bin)
        while len(bin_bytes) % 4:
            bin_bytes += b"\0"
        total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
        with open(path, "wb") as fh:
            fh.write(struct.pack("<III", 0x46546C67, 2, total))
            fh.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
            fh.write(json_bytes)
            fh.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
            fh.write(bin_bytes)


def convert(
    in_path: str,
    out_path: str,
    pivot: str = "bottom",
    scale: float = 1.0,
    name: Optional[str] = None,
    tex_dir: Optional[str] = None,
    tex_uri_base: Optional[str] = None,
) -> dict:
    src = open(in_path, "r", encoding="utf-8", errors="replace").read()
    if tex_dir is None:
        tex_dir = os.path.join(os.path.dirname(os.path.abspath(in_path)), "textures")
    up_z = "upAxis" in src and re.search(r'upAxis\s*=\s*"Z"', src) is not None
    mats = parse_materials(src)
    meshes = parse_meshes(src)
    if not meshes:
        raise SystemExit("no meshes found in %s" % in_path)

    # ---- flatten every mesh/subset into world space -----------------------
    # key: material name -> (positions, normals, uvs, indices)
    buckets: Dict[str, Tuple[List, List, List, List]] = {}
    dedup: Dict[str, Dict[Tuple, int]] = {}

    def emit(mat_name: str, p, n, uv) -> int:
        b = buckets.setdefault(mat_name, ([], [], [], []))
        d = dedup.setdefault(mat_name, {})
        key = (
            round(p[0], 6), round(p[1], 6), round(p[2], 6),
            round(n[0], 4), round(n[1], 4), round(n[2], 4),
            round(uv[0], 5), round(uv[1], 5),
        )
        idx = d.get(key)
        if idx is None:
            idx = len(b[0])
            b[0].append(p)
            b[1].append(n)
            b[2].append(uv)
            d[key] = idx
        return idx

    def xf_point(m: List[float], v) -> Tuple[float, float, float]:
        x, y, z = v
        return (
            m[0] * x + m[1] * y + m[2] * z + m[3],
            m[4] * x + m[5] * y + m[6] * z + m[7],
            m[8] * x + m[9] * y + m[10] * z + m[11],
        )

    def xf_dir(m: List[float], v) -> Tuple[float, float, float]:
        x, y, z = v
        out = (
            m[0] * x + m[1] * y + m[2] * z,
            m[4] * x + m[5] * y + m[6] * z,
            m[8] * x + m[9] * y + m[10] * z,
        )
        ln = math.sqrt(sum(c * c for c in out)) or 1.0
        return (out[0] / ln, out[1] / ln, out[2] / ln)

    for mesh in meshes:
        xform = mesh.xform or _mat_ident()
        # face -> corner offset table
        offsets: List[int] = []
        acc = 0
        for c in mesh.counts:
            offsets.append(acc)
            acc += c
        # face -> material
        face_mat: List[str] = [mesh.material or "Default"] * len(mesh.counts)
        for sub in mesh.subsets:
            for f in sub.faces:
                if 0 <= f < len(face_mat):
                    face_mat[f] = sub.material
        has_uv = len(mesh.uvs) > 0
        uv_indexed = len(mesh.uv_indices) >= acc
        uv_per_corner = has_uv and not uv_indexed and len(mesh.uvs) >= acc
        normal_indexed = len(mesh.normal_indices) >= acc
        normals_per_corner = not normal_indexed and len(mesh.normals) >= acc

        for fi, count in enumerate(mesh.counts):
            base = offsets[fi]
            mat_name = face_mat[fi]
            corners = []
            for k in range(count):
                ci = base + k
                vi = mesh.indices[ci]
                p = xf_point(xform, mesh.points[vi])
                if normal_indexed:
                    ni = mesh.normal_indices[ci]
                    n = xf_dir(xform, mesh.normals[ni]) if ni < len(mesh.normals) else (0.0, 1.0, 0.0)
                elif normals_per_corner:
                    n = xf_dir(xform, mesh.normals[ci])
                elif mesh.normals and vi < len(mesh.normals):
                    n = xf_dir(xform, mesh.normals[vi])
                else:
                    n = (0.0, 1.0, 0.0)
                if uv_indexed:
                    ui = mesh.uv_indices[ci]
                    uv = mesh.uvs[ui] if ui < len(mesh.uvs) else (0.0, 0.0)
                elif uv_per_corner:
                    uv = mesh.uvs[ci]
                elif has_uv and vi < len(mesh.uvs):
                    uv = mesh.uvs[vi]
                else:
                    uv = (0.0, 0.0)
                # glTF UV origin is top-left, USD is bottom-left
                corners.append((p, n, (uv[0], 1.0 - uv[1])))
            if count < 3:
                continue
            if not normals_per_corner and not mesh.normals:
                # derive a flat normal so shading is never black
                (ax, ay, az) = corners[0][0]
                (bx, by, bz) = corners[1][0]
                (cx, cy, cz) = corners[2][0]
                ux, uy, uz = bx - ax, by - ay, bz - az
                vx, vy, vz = cx - ax, cy - ay, cz - az
                nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
                ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
                fn = (nx / ln, ny / ln, nz / ln)
                corners = [(p, fn, uv) for (p, _, uv) in corners]
            ids = [emit(mat_name, p, n, uv) for (p, n, uv) in corners]
            for k in range(1, count - 1):
                buckets[mat_name][3].extend((ids[0], ids[k], ids[k + 1]))

    # ---- axis fix + pivot normalisation -----------------------------------
    all_pts = [p for b in buckets.values() for p in b[0]]
    if not all_pts:
        raise SystemExit("no geometry emitted for %s" % in_path)

    def convert_axis(p):
        # Blender/USD Z-up -> glTF Y-up
        return (p[0], p[2], -p[1]) if up_z else p

    for b in buckets.values():
        b[0][:] = [convert_axis(p) for p in b[0]]
        b[1][:] = [convert_axis(n) for n in b[1]]

    all_pts = [p for b in buckets.values() for p in b[0]]
    min_x = min(p[0] for p in all_pts); max_x = max(p[0] for p in all_pts)
    min_y = min(p[1] for p in all_pts); max_y = max(p[1] for p in all_pts)
    min_z = min(p[2] for p in all_pts); max_z = max(p[2] for p in all_pts)

    cx = (min_x + max_x) * 0.5
    cz = (min_z + max_z) * 0.5
    if pivot == "bottom":
        ox, oy, oz = cx, min_y, cz
    elif pivot == "center":
        ox, oy, oz = cx, (min_y + max_y) * 0.5, cz
    else:
        ox = oy = oz = 0.0

    s = scale
    for b in buckets.values():
        b[0][:] = [((p[0] - ox) * s, (p[1] - oy) * s, (p[2] - oz) * s) for p in b[0]]

    # ---- build the glb ----------------------------------------------------
    glb = GLB()
    mat_index: Dict[str, int] = {}
    primitives = []
    for mat_name, (pos, nor, uvs, idx) in sorted(buckets.items()):
        if not idx:
            continue
        if mat_name not in mat_index:
            src_mat = mats.get(mat_name, Material(mat_name))
            gm = {
                "name": mat_name,
                "doubleSided": False,
                "pbrMetallicRoughness": {
                    "baseColorFactor": [*src_mat.base_color, src_mat.opacity],
                    "metallicFactor": src_mat.metallic,
                    "roughnessFactor": src_mat.roughness,
                },
            }
            if src_mat.base_color_tex:
                uri = _tex_uri(tex_uri_base, src_mat.base_color_tex, tex_dir)
                if uri or not tex_uri_base:
                    ti = glb.add_texture(os.path.join(tex_dir, src_mat.base_color_tex), uri)
                    if ti is not None:
                        gm["pbrMetallicRoughness"]["baseColorTexture"] = {"index": ti}
            if src_mat.normal_tex:
                uri = _tex_uri(tex_uri_base, src_mat.normal_tex, tex_dir)
                if uri or not tex_uri_base:
                    ti = glb.add_texture(os.path.join(tex_dir, src_mat.normal_tex), uri)
                    if ti is not None:
                        gm["normalTexture"] = {"index": ti}
            if any(c > 0.001 for c in src_mat.emissive):
                gm["emissiveFactor"] = list(src_mat.emissive)
            if src_mat.opacity < 0.999:
                gm["alphaMode"] = "BLEND"
            glb.materials.append(gm)
            mat_index[mat_name] = len(glb.materials) - 1
        attrs = {
            "POSITION": glb.add_vec_accessor(pos, 3),
            "NORMAL": glb.add_vec_accessor(nor, 3),
        }
        if any(u != (0.0, 1.0) and u != (0.0, 0.0) for u in uvs):
            attrs["TEXCOORD_0"] = glb.add_vec_accessor(uvs, 2)
        primitives.append(
            {"attributes": attrs, "indices": glb.add_index_accessor(idx), "material": mat_index[mat_name]}
        )

    label = name or os.path.splitext(os.path.basename(out_path))[0]
    glb.meshes.append({"name": label, "primitives": primitives})
    glb.nodes.append({"name": label, "mesh": 0})
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    glb.write(out_path, label)

    return {
        "file": out_path,
        "vertices": sum(len(b[0]) for b in buckets.values()),
        "triangles": sum(len(b[3]) for b in buckets.values()) // 3,
        "materials": len(glb.materials),
        "primitives": len(primitives),
        "size": [round((max_x - min_x) * s, 4), round((max_y - min_y) * s, 4), round((max_z - min_z) * s, 4)],
        "bytes": os.path.getsize(out_path),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--pivot", default="bottom", choices=["bottom", "center", "keep"])
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--name", default=None)
    ap.add_argument("--textures", default=None, help="directory holding the referenced texture images")
    ap.add_argument(
        "--texture-uri-base",
        default=None,
        help="link textures externally under this relative URI prefix instead of embedding them",
    )
    args = ap.parse_args()
    info = convert(
        args.input, args.output, args.pivot, args.scale, args.name, args.textures,
        args.texture_uri_base,
    )
    print(json.dumps(info))


if __name__ == "__main__":
    main()
