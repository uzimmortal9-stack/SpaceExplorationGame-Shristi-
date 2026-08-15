import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Authored-geometry helpers. Every prop is built from real, beveled geometry
 * (rounded boxes, lathed silhouettes, capsules) with clean pivots — never a
 * bare primitive with a material slapped on.
 */

const _bbox = new THREE.Box3();

/** Reposition an object so its origin sits on the given "ground" Y. */
export function groundPivot(obj: THREE.Object3D, targetY = 0): void {
  obj.updateMatrixWorld(true);
  _bbox.setFromObject(obj);
  const size = _bbox.getSize(new THREE.Vector3());
  const center = _bbox.getCenter(new THREE.Vector3());
  // Recenter XZ on true center, set origin bottom to targetY.
  obj.position.x += center.x;
  obj.position.z += center.z;
  obj.position.y += targetY - _bbox.min.y;
  void size;
}

/** Recenter the object origin on the volumetric centroid (for floating items). */
export function centerPivot(obj: THREE.Object3D): void {
  obj.updateMatrixWorld(true);
  _bbox.setFromObject(obj);
  const c = _bbox.getCenter(new THREE.Vector3());
  obj.position.add(c);
}

export function box(w: number, h: number, d: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  return new THREE.Mesh(g, m);
}

export function roundedBox(w: number, h: number, d: number, r: number, m: THREE.Material, seg = 2): THREE.Mesh {
  const g = new RoundedBoxGeometry(w, h, d, Math.min(r, Math.min(w, h, d) / 2), seg);
  const mesh = new THREE.Mesh(g, m);
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
}

export function cone(rt: number, h: number, m: THREE.Material, seg = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(rt, h, seg), m);
}

export function sphere(r: number, m: THREE.Material, seg = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
}

export function torus(r: number, tube: number, m: THREE.Material, seg = 24): THREE.Mesh {
  return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, seg), m);
}

export function capsule(r: number, len: number, m: THREE.Material, seg = 12): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, seg), m);
}

/** Lathed silhouette for flasks, tanks, bowls. */
export function lathe(points: THREE.Vector2[], m: THREE.Material, segments = 32): THREE.Mesh {
  const g = new THREE.LatheGeometry(points, segments);
  return new THREE.Mesh(g, m);
}

/** A thin emissive strip (accent lighting). */
export function glowStrip(w: number, h: number, m: THREE.Material): THREE.Mesh {
  return box(w, h, 0.02, m);
}

export function plane(w: number, h: number, m: THREE.Material, rotX = -Math.PI / 2): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.rotation.x = rotX;
  return mesh;
}

/** Build a group and add children. */
export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}
