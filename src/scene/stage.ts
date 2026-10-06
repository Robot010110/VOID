/**
 * Runtime state shared by the scene, the camera director and the interface, outside React:
 * it changes every frame. React state (the store) holds only what changes structure.
 */
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

/** Camera speed through scale, for the post effects (log distance per second, smoothed). */
export const motion = { speed: 0 }

/** The interface's hover ring, positioned by the scene every frame (no React state). */
export const marker = {
  element: null as HTMLElement | null,
}
