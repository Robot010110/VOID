/**
 * Runtime state shared by the scene, the camera director and the interface, outside React:
 * it changes every frame. React state (the store) holds only what changes structure.
 */
import { Matrix3, Quaternion, Vector2, Vector3, type Texture } from 'three'
import { pathKey } from '../core/store.ts'
import type { Path } from '../core/universe.ts'
import type { Limits } from './camera/views.ts'

export interface Pick {
  index: number
  /** Screen position and radius of the target's ring, CSS pixels. */
  x: number
  y: number
  radius: number
}

interface LevelRuntime {
  /** Share of the screen, 0 to 1, animated by the director during a swap. */
  readonly fade: { current: number }
  /** Shown at all: the arriving level stays hidden while it prepares. */
  visible: boolean
  /** Shaders compiled and maps baked. */
  ready: boolean
  /** Finds what is under a screen point (CSS pixels), for the active level. */
  pick: ((x: number, y: number) => Pick | null) | null
  /** Where a target is on screen right now, or null when it is not in view. */
  locate: ((index: number) => Pick | null) | null
  /** How close and how far the camera may go while this level is active. */
  limits: Limits | null
}

const levels = new Map<string, LevelRuntime>()

export function levelRuntime(path: Path): LevelRuntime {
  const key = pathKey(path)
  let runtime = levels.get(key)
  if (!runtime) {
    runtime = { fade: { current: 1 }, visible: true, ready: false, pick: null, locate: null, limits: null }
    levels.set(key, runtime)
  }
  return runtime
}

export function forgetLevel(path: Path) {
  levels.delete(pathKey(path))
}

export const pointer = {
  /** CSS pixels relative to the canvas. */
  x: 0,
  y: 0,
  /** Over the canvas and not dragging. */
  hovering: false,
  /** The last input came from touch: no hover states. */
  touch: false,
}

/**
 * The child being handed between levels, if a transition is running: drawn at full strength
 * by whichever level currently owns it, hidden in the other.
 */
export const handover = {
  /** Index of the child in the parent level, or -1. */
  index: -1,
  /** Which level draws it: the parent until the swap of a descent, the child after it. */
  owner: 'parent' as 'parent' | 'child',
}

/**
 * How the background sky is turned in the active frame. Each system's sky shows the band of
 * its galaxy, so the sky is fixed in a system's frame (and its planets'); seen from the
 * galaxy's frame it is turned like the system the camera came from or is falling towards.
 */
export const sky = {
  orientation: new Quaternion(),
  /**
   * How far inside a galaxy's disc the camera is, 0 to 1, while a galaxy is on stage. Inside,
   * the galaxy's own light has resolved away and the sky's band is what is left of it.
   */
  inside: 0,
}

/**
 * The black hole's lensing, written by the hole every frame it is on stage and read by the post
 * effect that bends the scene around it (see BlackHole.tsx and post/Lensing.ts).
 */
export const lens = {
  /** Whether the hole bends anything on screen this frame: its pass is skipped otherwise. */
  active: false,
  /** How much of the bending applies, 0 to 1: it fades with the universe. */
  strength: 0,
  /** The camera in the hole's frame, in the hole's radii. */
  camera: new Vector3(0, 0, 100),
  viewToHole: new Matrix3(),
  holeToView: new Matrix3(),
  /** Tangent of half the field of view, across and up. */
  tanHalfFov: new Vector2(1, 1),
  /** The traced hole: its disc's light, and its shadow's cover in alpha. */
  trace: null as Texture | null,
}

/** Camera speed through scale, for the post effects (log distance per second, smoothed). */
export const motion = { speed: 0 }

/** The interface's hover ring, positioned by the scene every frame (no React state). */
export const marker = {
  element: null as HTMLElement | null,
}

/**
 * Where the world in view is on screen, written by the planet level every frame for the
 * interface to set words beside it without covering it. CSS pixels.
 */
export const focus = {
  /** A world is on stage and settled at its level. */
  active: false,
  x: 0,
  y: 0,
  /** Radius of everything that belongs to the world: its air, its rings and structures. */
  radius: 0,
  /** Where its sun is on screen, if in front of the camera. */
  sunX: 0,
  sunY: 0,
  sunAhead: false,
}
