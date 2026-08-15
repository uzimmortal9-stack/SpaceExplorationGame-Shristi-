#!/usr/bin/env python3
"""
glbview.py — offline software renderer for .glb files (verification tool).

The build sandbox has no browser and no GPU, so this is how the project's
geometry gets *looked at* rather than merely type-checked. It loads a binary
glTF, rasterises it with a z-buffer, and writes a PNG:

  * perspective camera framed automatically on the model bounds
  * Lambert + Blinn-Phong shading from a key/fill/rim light rig
  * baseColorFactor and baseColorTexture (bilinear sampled) support
  * optional turntable contact sheet so pivots and silhouettes are obvious
  * a ground grid so "floating" and "sunken" pivots are immediately visible

Usage:
    python3 tools/glbview.py model.glb out.png [--size 800] [--views 4] [--grid]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

COMPONENT = {
    5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
    5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class GLTF:
    def __init__(self, path: str) -> None:
        self.base_dir = os.path.dirname(os.path.abspath(path))
        with open(path, "rb") as fh:
            data = fh.read()
        if data[:4] == b"glTF":
            _, _, _ = struct.unpack("<III", data[:12])
            off = 12
            self.json: dict = {}
            self.bin = b""
            while off < len(data):
                clen, ctype = struct.unpack("<II", data[off : off + 8])
                chunk = data[off + 8 : off + 8 + clen]
                if ctype == 0x4E4F534A:
                    self.json = json.loads(chunk.decode("utf-8"))
                elif ctype == 0x004E4942:
                    self.bin = chunk
                off += 8 + clen
        else:
            self.json = json.loads(data.decode("utf-8"))
            self.bin = b""
        self._images: Dict[int, np.ndarray] = {}

    def view_bytes(self, i: int) -> bytes:
        v = self.json["bufferViews"][i]
        off = v.get("byteOffset", 0)
        return self.bin[off : off + v["byteLength"]]

    def accessor(self, i: int) -> np.ndarray:
        a = self.json["accessors"][i]
        fmt, size = COMPONENT[a["componentType"]]
        n = NCOMP[a["type"]]
        count = a["count"]
        if "bufferView" not in a:
            return np.zeros((count, n), dtype=np.float32)
        v = self.json["bufferViews"][a["bufferView"]]
        raw = self.bin
        base = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride") or size * n
        out = np.empty((count, n), dtype=np.float32 if fmt == "f" else np.int64)
        for k in range(count):
            chunk = raw[base + k * stride : base + k * stride + size * n]
            out[k] = struct.unpack("<" + fmt * n, chunk)
        return out

    def image(self, tex_index: int) -> Optional[np.ndarray]:
        if tex_index in self._images:
            return self._images[tex_index]
        try:
            tex = self.json["textures"][tex_index]
            img = self.json["images"][tex["source"]]
        except (KeyError, IndexError):
            return None
        import io

        if "bufferView" in img:
            payload = io.BytesIO(self.view_bytes(img["bufferView"]))
        elif "uri" in img and not img["uri"].startswith("data:"):
            # externally-linked texture, resolved relative to the .glb
            ext_path = os.path.normpath(os.path.join(self.base_dir, img["uri"]))
            if not os.path.isfile(ext_path):
                return None
            payload = ext_path
        else:
            return None

        pil = Image.open(payload).convert("RGB")
        if max(pil.size) > 512:
            pil.thumbnail((512, 512))
        arr = np.asarray(pil, dtype=np.float32) / 255.0
        # sRGB -> linear
        arr = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
        self._images[tex_index] = arr
        return arr


def node_matrix(node: dict) -> np.ndarray:
    if "matrix" in node:
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if "scale" in node:
        s = np.eye(4)
        s[0, 0], s[1, 1], s[2, 2] = node["scale"]
        m = m @ s
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        r = np.array(
            [
                [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
                [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
                [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
                [0, 0, 0, 1],
            ]
        )
        m = r @ m
    if "translation" in node:
        t = np.eye(4)
        t[:3, 3] = node["translation"]
        m = t @ m
    return m


class Tri:
    __slots__ = ("pos", "nrm", "uv", "color", "tex", "emissive", "vcol", "alpha")


def collect(g: GLTF) -> List[Tri]:
    tris: List[Tri] = []
    scene = g.json.get("scenes", [{}])[g.json.get("scene", 0)]
    materials = g.json.get("materials", [])

    def walk(idx: int, parent: np.ndarray) -> None:
        node = g.json["nodes"][idx]
        world = parent @ node_matrix(node)
        if "mesh" in node:
            for prim in g.json["meshes"][node["mesh"]].get("primitives", []):
                if prim.get("mode", 4) != 4:
                    continue
                attrs = prim["attributes"]
                pos = g.accessor(attrs["POSITION"]).astype(np.float64)
                nrm = (
                    g.accessor(attrs["NORMAL"]).astype(np.float64)
                    if "NORMAL" in attrs
                    else np.zeros_like(pos)
                )
                uv = (
                    g.accessor(attrs["TEXCOORD_0"]).astype(np.float64)
                    if "TEXCOORD_0" in attrs
                    else np.zeros((len(pos), 2))
                )
                idxs = (
                    g.accessor(prim["indices"]).astype(np.int64).ravel()
                    if "indices" in prim
                    else np.arange(len(pos))
                )
                vcol = (
                    g.accessor(attrs["COLOR_0"]).astype(np.float64)
                    if "COLOR_0" in attrs
                    else None
                )
                ones = np.ones((len(pos), 1))
                wpos = (np.hstack([pos, ones]) @ world.T)[:, :3]
                nmat = np.linalg.inv(world[:3, :3]).T
                wnrm = nrm @ nmat.T
                ln = np.linalg.norm(wnrm, axis=1, keepdims=True)
                wnrm = wnrm / np.where(ln == 0, 1, ln)

                color = np.array([0.8, 0.8, 0.8])
                emissive = np.zeros(3)
                alpha = 1.0
                tex = None
                mi = prim.get("material")
                if mi is not None and mi < len(materials):
                    mat = materials[mi]
                    pbr = mat.get("pbrMetallicRoughness", {})
                    bcf = pbr.get("baseColorFactor", [0.8, 0.8, 0.8, 1])
                    color = np.array(bcf[:3])
                    alpha = float(bcf[3]) if len(bcf) > 3 else 1.0

                    emissive = np.array(mat.get("emissiveFactor", [0, 0, 0]))
                    bct = pbr.get("baseColorTexture")
                    if bct is not None:
                        tex = g.image(bct["index"])

                tri = Tri()
                f = idxs.reshape(-1, 3)
                tri.pos = wpos[f]
                tri.nrm = wnrm[f]
                tri.uv = uv[f]
                tri.color = color
                tri.tex = tex
                tri.emissive = emissive
                tri.alpha = alpha
                tri.vcol = vcol[f][:, :, :3] if vcol is not None else None
                tris.append(tri)
        for c in node.get("children", []):
            walk(c, world)

    for r in scene.get("nodes", []):
        walk(r, np.eye(4))
    return tris


def render(
    tris: List[Tri],
    size: int = 800,
    yaw: float = 0.6,
    pitch: float = 0.32,
    grid: bool = True,
    bounds: Optional[Tuple[np.ndarray, np.ndarray]] = None,
    cam_dist_mul: float = 1.0,
    eye_target: Optional[Tuple[np.ndarray, np.ndarray, float]] = None,
    width: Optional[int] = None,
) -> Image.Image:
    W = width or size
    H = size
    if bounds is None:
        allp = np.vstack([t.pos.reshape(-1, 3) for t in tris])
        lo, hi = allp.min(axis=0), allp.max(axis=0)
    else:
        lo, hi = bounds
    center = (lo + hi) / 2.0
    radius = max(float(np.linalg.norm(hi - lo)) / 2.0, 1e-3)
    dist = radius * 2.6 * cam_dist_mul

    fov_deg = 40.0
    if eye_target is not None:
        eye, look_at, fov_deg = eye_target
        eye = np.asarray(eye, dtype=np.float64)
        center = np.asarray(look_at, dtype=np.float64)
        dist = max(float(np.linalg.norm(center - eye)), 1e-3)
    else:
        eye = center + np.array(
            [math.cos(pitch) * math.sin(yaw), math.sin(pitch), math.cos(pitch) * math.cos(yaw)]
        ) * dist
    fwd = center - eye
    fwd = fwd / np.linalg.norm(fwd)
    right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
    if np.linalg.norm(right) < 1e-6:
        right = np.array([1.0, 0.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    view = np.eye(4)
    view[0, :3], view[1, :3], view[2, :3] = right, up, -fwd
    view[:3, 3] = -view[:3, :3] @ eye

    fov = math.radians(fov_deg)
    f = 1.0 / math.tan(fov / 2)
    near = max(min(radius, dist) * 0.002, 1e-3)
    far = dist + radius * 8

    color_buf = np.zeros((H, W, 3), dtype=np.float32)
    # sky gradient backdrop so silhouettes read clearly
    gy = np.linspace(0, 1, H)[:, None]
    color_buf += (np.array([0.055, 0.065, 0.085]) * (1 - gy) + np.array([0.012, 0.014, 0.02]) * gy)[
        :, None, :
    ].reshape(H, 1, 3)
    depth = np.full((H, W), np.inf, dtype=np.float32)

    key_dir = np.array([0.5, 0.8, 0.35]); key_dir /= np.linalg.norm(key_dir)
    fill_dir = np.array([-0.6, 0.25, 0.5]); fill_dir /= np.linalg.norm(fill_dir)
    rim_dir = np.array([-0.3, 0.4, -0.9]); rim_dir /= np.linalg.norm(rim_dir)

    def project(p: np.ndarray) -> np.ndarray:
        v = np.hstack([p, np.ones((len(p), 1))]) @ view.T
        z = -v[:, 2]
        with np.errstate(divide="ignore", invalid="ignore"):
            x = (f / (W / H)) * v[:, 0] / np.where(z == 0, 1e-9, z)
            y = f * v[:, 1] / np.where(z == 0, 1e-9, z)
        sx = (x * 0.5 + 0.5) * W
        sy = (1 - (y * 0.5 + 0.5)) * H
        return np.stack([sx, sy, z], axis=1)

    batches = []
    for t in tris:
        # Skip nearly-invisible additive helpers (god rays, glow shells); the
        # offline rasteriser has no blending and they would read as solid.
        if getattr(t, "alpha", 1.0) < 0.06:
            continue  # additive helper volumes read as solid without blending
        batches.append((t.pos, t.nrm, t.uv, t.color, t.tex, t.emissive, getattr(t, "vcol", None), getattr(t, "alpha", 1.0)))

    batches.sort(key=lambda b: -b[7])

    if grid:
        # a ground plane grid at y = lo[1] makes float/sink errors obvious
        step = max(radius / 5.0, 1e-3)
        n = 12
        gtris_p, gtris_n, gtris_u = [], [], []
        y = lo[1]
        for i in range(-n, n):
            for j in range(-n, n):
                if (i + j) % 2:
                    continue
                x0 = center[0] + i * step; x1 = x0 + step
                z0 = center[2] + j * step; z1 = z0 + step
                quad = [
                    [[x0, y, z0], [x1, y, z0], [x1, y, z1]],
                    [[x0, y, z0], [x1, y, z1], [x0, y, z1]],
                ]
                for tri3 in quad:
                    gtris_p.append(tri3)
                    gtris_n.append([[0, 1, 0]] * 3)
                    gtris_u.append([[0, 0]] * 3)
        if gtris_p:
            batches.append(
                (
                    np.array(gtris_p),
                    np.array(gtris_n, dtype=np.float64),
                    np.array(gtris_u, dtype=np.float64),
                    np.array([0.10, 0.11, 0.13]),
                    None,
                    np.zeros(3),
                    None,
                    1.0,
                )
            )

    for pos, nrm, uv, base, tex, emis, vcol, alpha_val in batches:
        flat = pos.reshape(-1, 3)
        scr = project(flat).reshape(-1, 3, 3)
        nrm_r = nrm.reshape(-1, 3, 3)
        uv_r = uv.reshape(-1, 3, 2)
        vcol_r = vcol.reshape(-1, 3, 3) if vcol is not None else None
        for ti in range(len(scr)):
            s = scr[ti]
            if np.any(s[:, 2] <= near) or np.any(s[:, 2] >= far):
                continue
            minx = max(int(np.floor(s[:, 0].min())), 0)
            maxx = min(int(np.ceil(s[:, 0].max())), W - 1)
            miny = max(int(np.floor(s[:, 1].min())), 0)
            maxy = min(int(np.ceil(s[:, 1].max())), H - 1)
            if minx > maxx or miny > maxy:
                continue
            x0, y0 = s[0, 0], s[0, 1]
            x1, y1 = s[1, 0], s[1, 1]
            x2, y2 = s[2, 0], s[2, 1]
            denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
            if abs(denom) < 1e-12:
                continue
            ys, xs = np.mgrid[miny : maxy + 1, minx : maxx + 1]
            px = xs + 0.5
            py = ys + 0.5
            w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
            w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
            w2 = 1.0 - w0 - w1
            mask = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not mask.any():
                continue
            iz = w0 / s[0, 2] + w1 / s[1, 2] + w2 / s[2, 2]
            z = 1.0 / np.where(iz == 0, 1e-9, iz)
            sub = depth[miny : maxy + 1, minx : maxx + 1]
            mask &= z < sub
            if not mask.any():
                continue
            pw0 = (w0 / s[0, 2]) * z
            pw1 = (w1 / s[1, 2]) * z
            pw2 = (w2 / s[2, 2]) * z
            n = (
                pw0[..., None] * nrm_r[ti, 0]
                + pw1[..., None] * nrm_r[ti, 1]
                + pw2[..., None] * nrm_r[ti, 2]
            )
            ln = np.linalg.norm(n, axis=-1, keepdims=True)
            n = n / np.where(ln == 0, 1, ln)

            albedo = np.broadcast_to(base, n.shape).astype(np.float32).copy()
            if vcol_r is not None:
                vc = (
                    pw0[..., None] * vcol_r[ti, 0]
                    + pw1[..., None] * vcol_r[ti, 1]
                    + pw2[..., None] * vcol_r[ti, 2]
                )
                albedo = albedo * vc
            if tex is not None:
                tu = (
                    pw0[..., None] * uv_r[ti, 0]
                    + pw1[..., None] * uv_r[ti, 1]
                    + pw2[..., None] * uv_r[ti, 2]
                )
                th, tw = tex.shape[:2]
                sx = np.clip((tu[..., 0] % 1.0) * (tw - 1), 0, tw - 1)
                sy = np.clip((tu[..., 1] % 1.0) * (th - 1), 0, th - 1)
                albedo = tex[sy.astype(np.int32), sx.astype(np.int32)] * base

            ndl = np.clip((n * key_dir).sum(-1), 0, 1)[..., None]
            ndf = np.clip((n * fill_dir).sum(-1), 0, 1)[..., None]
            ndr = np.clip((n * rim_dir).sum(-1), 0, 1)[..., None]
            lit = albedo * (
                ndl * np.array([1.15, 1.10, 1.02])
                + ndf * np.array([0.24, 0.28, 0.36])
                + ndr * np.array([0.20, 0.24, 0.34])
                + np.array([0.10, 0.11, 0.14])
            )
            lit = lit + emis
            sub_c = color_buf[miny : maxy + 1, minx : maxx + 1]
            a = float(alpha_val)
            if a >= 0.999:
                sub_c[mask] = lit[mask]
                sub[mask] = z[mask].astype(np.float32)
            else:
                sub_c[mask] = sub_c[mask] * (1.0 - a) + lit[mask] * a
                # translucent surfaces do not occlude what is behind them
                sub[mask] = np.minimum(sub[mask], z[mask].astype(np.float32))

    # ACES-ish tonemap + sRGB encode
    c = np.clip(color_buf, 0, None)
    c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14)
    c = np.clip(c, 0, 1)
    srgb = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    return Image.fromarray((np.clip(srgb, 0, 1) * 255).astype(np.uint8))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--size", type=int, default=700)
    ap.add_argument("--views", type=int, default=1)
    ap.add_argument("--no-grid", action="store_true")
    ap.add_argument("--cam", default=None, help="JSON file with {position,target,fov}")
    ap.add_argument("--width", type=int, default=0)
    args = ap.parse_args()

    g = GLTF(args.input)
    tris = collect(g)
    if not tris:
        raise SystemExit("no drawable triangles in %s" % args.input)
    allp = np.vstack([t.pos.reshape(-1, 3) for t in tris])
    lo, hi = allp.min(axis=0), allp.max(axis=0)
    print(
        json.dumps(
            {
                "file": os.path.basename(args.input),
                "min": [round(float(v), 3) for v in lo],
                "max": [round(float(v), 3) for v in hi],
                "size": [round(float(v), 3) for v in (hi - lo)],
                "tris": int(sum(len(t.pos) for t in tris)),
            }
        )
    )
    cam = None
    if args.cam and os.path.isfile(args.cam):
        spec = json.load(open(args.cam))
        cam = (
            np.array(spec["position"], dtype=np.float64),
            np.array(spec["target"], dtype=np.float64),
            float(spec.get("fov", 55)),
        )

    if args.views <= 1:
        img = render(
            tris, args.size, grid=not args.no_grid, bounds=(lo, hi),
            eye_target=cam, width=args.width or None,
        )
    else:
        cells = []
        for i in range(args.views):
            yaw = 2 * math.pi * i / args.views + 0.5
            cells.append(
                render(tris, args.size, yaw=yaw, grid=not args.no_grid, bounds=(lo, hi))
            )
        cols = min(args.views, 2)
        rows = (args.views + cols - 1) // cols
        img = Image.new("RGB", (cols * args.size, rows * args.size))
        for i, c in enumerate(cells):
            img.paste(c, ((i % cols) * args.size, (i // cols) * args.size))
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    img.save(args.output)


if __name__ == "__main__":
    main()
