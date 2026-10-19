import { createContext, useContext } from 'react'
import type { Object3D } from 'three'

export interface LevelInfo {
  /**
   * The level's share of the screen, 0 to 1, crossfading during a transition. Everything in
   * the level multiplies it into its opacity, except the body handed over to the next level.
   */
  readonly fade: { current: number }
  /** The level mounted during a transition (or kept unseen for the opening): it never frames the camera. */
  readonly background: boolean
  /**
   * Build in the background: bake and generate a little each frame, and compile in parallel,
   * rather than all at once in the first frame. Arriving levels do, so motion never stops; so
   * does every level while the opening loads behind the dark.
   */
  readonly patient: boolean
  /**
   * Objects the level draws outside the scene graph (into its own buffers), whose shaders
   * must be compiled with the level's before it appears.
   */
  readonly extras: Set<Object3D>
  /**
   * Every shader of the level has finished compiling. Until then, nothing hidden should draw:
   * drawing waits on the driver, in the frame it happens.
   */
  readonly compiled: { current: boolean }
}

const STATIC: LevelInfo = {
  fade: { current: 1 },
  background: false,
  patient: false,
  extras: new Set(),
  compiled: { current: true },
}

export const LevelContext = createContext<LevelInfo>(STATIC)

export function useLevel(): LevelInfo {
  return useContext(LevelContext)
}

/** A fade that is always fully on: for a body being handed between levels. */
export const FULL = { current: 1 }
