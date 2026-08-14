import * as THREE from 'three';

export type PivotMode = 'floor' | 'wall' | 'ceiling' | 'center';

/**
 * Normalizes imported or procedural geometry before it is placed. Floor props
 * end at y=0, wall props end at z=0, ceiling props begin at y=0, while kinetic
 * objects retain a true volumetric centroid.
 */
export function normalizeGeometryPivot<T extends THREE.BufferGeometry>(geometry: T, mode: PivotMode = 'floor'): T {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;
  const center = new THREE.Vector3();
  box.getCenter(center);

  if (mode === 'floor') geometry.translate(-center.x, -box.min.y, -center.z);
  if (mode === 'wall') geometry.translate(-center.x, -center.y, -box.max.z);
  if (mode === 'ceiling') geometry.translate(-center.x, -box.max.y, -center.z);
  if (mode === 'center') geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function normalizedBox(width: number, height: number, depth: number, mode: PivotMode = 'floor'): THREE.BoxGeometry {
  return normalizeGeometryPivot(new THREE.BoxGeometry(width, height, depth), mode);
}

export function normalizedCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 12,
  mode: PivotMode = 'floor',
): THREE.CylinderGeometry {
  return normalizeGeometryPivot(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), mode);
}

export interface SurfaceSnapOptions {
  alignToNormal?: boolean;
  epsilon?: number;
  maxDistance?: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** Downward ray clamp used for every free-placed surface or terrain prop. */
export function snapToSurface(
  object: THREE.Object3D,
  surfaces: THREE.Object3D[],
  raycaster: THREE.Raycaster,
  options: SurfaceSnapOptions = {},
): THREE.Intersection | null {
  const epsilon = options.epsilon ?? 0.001;
  const origin = object.position.clone();
  origin.y += options.maxDistance ?? 500;
  raycaster.set(origin, DOWN);
  raycaster.far = (options.maxDistance ?? 500) * 2;
  const hit = raycaster.intersectObjects(surfaces, true)[0];
  if (!hit) return null;
  object.position.y = hit.point.y + epsilon;
  if (options.alignToNormal && hit.face) {
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    object.quaternion.premultiply(tilt);
  }
  return hit;
}

export function worldAABB(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}
