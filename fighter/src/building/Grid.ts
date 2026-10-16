import * as THREE from 'three';
import { GRID, type PieceType } from '../config';

/**
 * Grid conventions (all indices are integers, world = index * GRID):
 *  - cell (i, j, k) spans x in [4i, 4i+4], y in [4j, 4j+4], z in [4k, 4k+4]
 *  - wall  axis 'x': plane x = 4i, spanning z in [4k, 4k+4], y in [4j, 4j+4]
 *  - wall  axis 'z': plane z = 4k, spanning x in [4i, 4i+4]
 *  - floor: the bottom face of cell (i, j, k) (y = 4j)
 *  - ramp / cone: occupy the volume of cell (i, j, k); ramps rise towards `dir`
 */
export type Dir = 0 | 1 | 2 | 3; // 0:+X 1:+Z 2:-X 3:-Z
export type WallAxis = 'x' | 'z';

export const DIR_VEC: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export interface PieceSpec {
  type: PieceType;
  i: number;
  j: number;
  k: number;
  axis?: WallAxis;
  dir?: Dir;
}

export function cellOf(v: number): number {
  return Math.floor(v / GRID);
}

export function dirFromVector(x: number, z: number): Dir {
  if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? 0 : 2;
  return z >= 0 ? 1 : 3;
}

export function rotateDir(d: Dir, steps: number): Dir {
  return (((d + steps) % 4) + 4) % 4 as Dir;
}

/** Yaw that turns local -Z (the "rising" direction of a ramp mesh) towards `dir`. */
export function yawForDir(d: Dir): number {
  return [-Math.PI / 2, Math.PI, Math.PI / 2, 0][d];
}

/** Occupancy key. Ramps and cones share the cell-volume slot so they cannot overlap. */
export function pieceKey(s: PieceSpec): string {
  switch (s.type) {
    case 'wall': return `W${s.axis}:${s.i},${s.j},${s.k}`;
    case 'floor': return `F:${s.i},${s.j},${s.k}`;
    default: return `V:${s.i},${s.j},${s.k}`;
  }
}

/** World-space anchor of a piece (geometric centre; cones use the base centre). */
export function pieceAnchor(s: PieceSpec, target = new THREE.Vector3()): THREE.Vector3 {
  const x = s.i * GRID;
  const y = s.j * GRID;
  const z = s.k * GRID;
  const h = GRID / 2;
  switch (s.type) {
    case 'wall':
      return s.axis === 'x' ? target.set(x, y + h, z + h) : target.set(x + h, y + h, z);
    case 'floor':
      return target.set(x + h, y, z + h);
    case 'ramp':
      return target.set(x + h, y + h, z + h);
    case 'cone':
      return target.set(x + h, y, z + h);
  }
}

/** Yaw applied to the piece group. */
export function pieceYaw(s: PieceSpec): number {
  if (s.type === 'wall') return s.axis === 'x' ? Math.PI / 2 : 0;
  if (s.type === 'ramp') return yawForDir(s.dir ?? 0);
  return 0;
}

// Lattice segment keys used for structural support (pieces sharing a segment are connected).
const hx = (i: number, j: number, k: number) => `hx${i},${j},${k}`; // (i,j,k)->(i+1,j,k)
const hz = (i: number, j: number, k: number) => `hz${i},${j},${k}`; // (i,j,k)->(i,j,k+1)
const vt = (i: number, j: number, k: number) => `v${i},${j},${k}`; // (i,j,k)->(i,j+1,k)

export function pieceSegments(s: PieceSpec): string[] {
  const { i, j, k } = s;
  switch (s.type) {
    case 'wall':
      return s.axis === 'z'
        ? [hx(i, j, k), hx(i, j + 1, k), vt(i, j, k), vt(i + 1, j, k)]
        : [hz(i, j, k), hz(i, j + 1, k), vt(i, j, k), vt(i, j, k + 1)];
    case 'floor':
    case 'cone':
      return [hx(i, j, k), hx(i, j, k + 1), hz(i, j, k), hz(i + 1, j, k)];
    case 'ramp':
      switch (s.dir ?? 0) {
        case 0: return [hz(i, j, k), hz(i + 1, j + 1, k)];
        case 2: return [hz(i + 1, j, k), hz(i, j + 1, k)];
        case 1: return [hx(i, j, k), hx(i, j + 1, k + 1)];
        default: return [hx(i, j, k + 1), hx(i, j + 1, k)];
      }
  }
}

/** A piece touching ground level is self-supporting. */
export function isGrounded(s: PieceSpec): boolean {
  return s.j === 0;
}
