/**
 * Helpers shared by planets, moons and rings: per-frame object-space light and camera
 * vectors, the fade-in that every layer follows, seed-driven noise offsets, and the
 * premultiplied blending used by every translucent layer.
 */
import { Color, Matrix4, NormalBlending, Vector3, type Object3D } from 'three'
import { SHOT } from '../../core/env.ts'
import { Rng } from '../../core/rng.ts'

/** Seconds for a body to fade in once its maps are baked. */
export const BODY_FADE_IN = SHOT ? 0 : 1.8

/** Where a body's star is, and how bright its light is there. */
export interface Sunlight {
  /** Unit vector towards the star, world space. */
  readonly direction: Vector3
  /** Sunlight arriving at the body, linear RGB. */
  readonly irradiance: Color
}

/** Translucent layers output premultiplied colour: light added, plus alpha that dims behind. */
export const PREMULTIPLIED = {
  transparent: true,
  premultipliedAlpha: true,
  blending: NormalBlending,
  depthWrite: false,
} as const

const inverse = new Matrix4()

/** The sun direction and camera position in an object's own space (its unit sphere). */
export function toObjectSpace(
  object: Object3D,
  sunWorld: Vector3,
  cameraWorld: Vector3,
  sunOut: Vector3,
  cameraOut: Vector3,
) {
  inverse.copy(object.matrixWorld).invert()
  sunOut.copy(sunWorld).transformDirection(inverse)
  cameraOut.copy(cameraWorld).applyMatrix4(inverse)
}

/** A noise-space offset from a seed, so every world's terrain is its own. */
export function seedOffset(seed: number): Vector3 {
  const rng = new Rng(seed)
  return new Vector3(rng.range(-60, 60), rng.range(-60, 60), rng.range(-60, 60))
}

/** Smooth 0 → 1 over `duration` seconds from `start`. */
export function fadeIn(now: number, start: number, duration: number): number {
  if (duration <= 0) return 1
  const t = Math.min(1, Math.max(0, (now - start) / duration))
  return t * t * (3 - 2 * t)
}
