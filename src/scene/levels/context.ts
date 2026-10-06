import { createContext, useContext } from 'react'

export interface LevelInfo {
  /**
   * The level's share of the screen, 0 to 1, crossfading during a transition. Everything in
   * the level multiplies it into its opacity, except the body handed over to the next level.
   */
  readonly fade: { current: number }
  /** The level mounted during a transition: bake in the background so motion never stops. */
  readonly background: boolean
}

const STATIC: LevelInfo = { fade: { current: 1 }, background: false }

export const LevelContext = createContext<LevelInfo>(STATIC)

export function useLevel(): LevelInfo {
  return useContext(LevelContext)
}

/** A fade that is always fully on: for a body being handed between levels. */
export const FULL = { current: 1 }
