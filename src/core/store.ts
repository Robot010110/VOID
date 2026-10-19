/**
 * Global state. React re-renders are for structure only: anything that changes per frame
 * lives in refs and uniforms, and components that need to react to a value without
 * re-rendering use `useVoid.subscribe(selector, listener)`.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { readFlag, writeFlag } from './persist.ts'
import type { PlanetKind } from './planets.ts'
import type { QualityTier } from './quality.ts'
import { HOME, levelOf, type Level, type Path } from './universe.ts'

/**
 * A move between levels: `idle`, then `approaching` (the camera flies in, the next level
 * prepares unseen), `swapping` (both levels on screen, crossfading), `settling` (the old
 * level is gone and the camera eases into its resting framing), and `idle` again.
 */
export type TransitionPhase = 'idle' | 'approaching' | 'swapping' | 'settling'

export interface Transition {
  readonly phase: TransitionPhase
  /** Down into a child of the current level, or up to its parent. */
  readonly direction: 'down' | 'up'
  readonly from: Path
  readonly to: Path
  /** How long the flight takes, for what follows it (the sound of the fall). */
  readonly seconds?: number
}

/**
 * The opening: the point of light while everything loads, the title waiting for Enter, the
 * film that follows it, and then the universe is the visitor's.
 */
export type IntroStage = 'loading' | 'title' | 'opening' | 'done'

export interface VoidState {
  quality: QualityTier
  /** True when pinned by ?quality or after the governor has settled. */
  qualityLocked: boolean
  /** The preset shown by the planet showroom (`?planet=`). */
  planet: PlanetKind
  /** Where the visitor is, and the level that implies. */
  path: Path
  level: Level
  /** The child under the pointer or keyboard focus, by index, at the current level. */
  hoverTarget: number | null
  transition: Transition
  intro: IntroStage
  /** Sound wanted (remembered between visits); it only plays once Enter has been pressed. */
  audioEnabled: boolean
  setQuality: (quality: QualityTier) => void
  lockQuality: () => void
  setPlanet: (planet: PlanetKind) => void
  setPath: (path: Path) => void
  setHoverTarget: (index: number | null) => void
  setTransition: (transition: Transition) => void
  setIntro: (intro: IntroStage) => void
  setAudioEnabled: (enabled: boolean) => void
}

export const IDLE: Transition = { phase: 'idle', direction: 'down', from: HOME, to: HOME }

export const useVoid = create<VoidState>()(
  subscribeWithSelector((set) => ({
    quality: 'high',
    qualityLocked: false,
    planet: 'terrestrial',
    path: HOME,
    level: levelOf(HOME),
    hoverTarget: null,
    transition: IDLE,
    intro: 'loading',
    audioEnabled: readFlag('audio', true),
    setQuality: (quality) => set({ quality }),
    lockQuality: () => set({ qualityLocked: true }),
    setPlanet: (planet) => set({ planet }),
    setPath: (path) => set({ path, level: levelOf(path), hoverTarget: null }),
    setHoverTarget: (hoverTarget) => set({ hoverTarget }),
    setTransition: (transition) => set({ transition }),
    setIntro: (intro) => set({ intro }),
    setAudioEnabled: (audioEnabled) => {
      writeFlag('audio', audioEnabled)
      set({ audioEnabled })
    },
  })),
)

/** A stable string for a path, for keys and maps. */
export function pathKey(path: Path): string {
  return path.join('/')
}

export function samePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}
