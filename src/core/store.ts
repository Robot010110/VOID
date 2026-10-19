/**
 * Global state. React re-renders are for structure only: anything that changes per frame
 * lives in refs and uniforms, and components that need to react to a value without
 * re-rendering use `useVoid.subscribe(selector, listener)`.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { parseConstellations, serializeConstellations, type Constellation } from './constellations.ts'
import { readFlag, readText, writeFlag, writeText } from './persist.ts'
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

/** How fast world time runs: paused, as it is, a hundred times, ten thousand times. */
export type TimeStep = 0 | 1 | 100 | 10000
export const TIME_STEPS: readonly TimeStep[] = [0, 1, 100, 10000]

/** What the eye sees by: visible light, heat (infrared), or radio. */
export type Spectrum = 'visible' | 'infrared' | 'radio'
export const SPECTRA: readonly Spectrum[] = ['visible', 'infrared', 'radio']

/** The next pace, round the cycle: faster, faster, paused, as it is. */
export function nextTimeStep(step: TimeStep): TimeStep {
  return TIME_STEPS[(TIME_STEPS.indexOf(step) + 1) % TIME_STEPS.length]!
}

/** The next way of seeing, round the cycle: visible, infrared, radio. */
export function nextSpectrum(spectrum: Spectrum): Spectrum {
  return SPECTRA[(SPECTRA.indexOf(spectrum) + 1) % SPECTRA.length]!
}

/** The secrets that take the camera for a while. */
export type SecretScene = 'interior' | 'signal'

/** A constellation being drawn: the stars joined so far, in one galaxy. */
export interface Sketch {
  readonly galaxy: number
  readonly stars: readonly number[]
}

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
  timeStep: TimeStep
  spectrum: Spectrum
  /** The camera touring the handcrafted worlds on its own, the interface away. */
  driftMode: boolean
  /** The visitor's constellations, kept between visits. */
  constellations: readonly Constellation[]
  sketch: Sketch | null
  /** The constellation whose name is being written, if any. */
  naming: string | null
  /** The secrets found so far, by id (kept between visits; see secrets/secrets.ts). */
  foundSecrets: readonly string[]
  /** The listening station's terminal is open. */
  terminalOpen: boolean
  /**
   * A secret playing out on its own (the fall into the black hole, following the signal): the
   * camera is not the visitor's, and the interface stays away until it ends.
   */
  secretScene: SecretScene | null
  setQuality: (quality: QualityTier) => void
  lockQuality: () => void
  setPlanet: (planet: PlanetKind) => void
  setPath: (path: Path) => void
  setHoverTarget: (index: number | null) => void
  setTransition: (transition: Transition) => void
  setIntro: (intro: IntroStage) => void
  setAudioEnabled: (enabled: boolean) => void
  setTimeStep: (step: TimeStep) => void
  setSpectrum: (spectrum: Spectrum) => void
  setDriftMode: (drifting: boolean) => void
  setSketch: (sketch: Sketch | null) => void
  addConstellation: (constellation: Constellation) => void
  renameConstellation: (id: string, name: string) => void
  forgetConstellation: (id: string) => void
  setNaming: (id: string | null) => void
  markFound: (id: string) => void
  setTerminalOpen: (open: boolean) => void
  setSecretScene: (scene: SecretScene | null) => void
}

function keep(constellations: readonly Constellation[]) {
  writeText('constellations', serializeConstellations(constellations))
}

/** Found secrets as stored: a short list of short ids, anything else dropped. */
export function parseFound(text: string | null): string[] {
  try {
    const value: unknown = JSON.parse(text ?? '[]')
    if (!Array.isArray(value)) return []
    const ids = value.filter((id): id is string => typeof id === 'string' && /^[a-z-]{1,24}$/.test(id))
    return [...new Set(ids)].slice(0, 32)
  } catch {
    return []
  }
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
    timeStep: 1,
    spectrum: 'visible',
    driftMode: false,
    constellations: parseConstellations(readText('constellations')),
    sketch: null,
    naming: null,
    foundSecrets: parseFound(readText('secrets')),
    terminalOpen: false,
    secretScene: null,
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
    setTimeStep: (timeStep) => set({ timeStep }),
    setSpectrum: (spectrum) => set({ spectrum }),
    setDriftMode: (driftMode) => set({ driftMode }),
    setSketch: (sketch) => set({ sketch }),
    addConstellation: (constellation) =>
      set((state) => {
        const constellations = [...state.constellations, constellation]
        keep(constellations)
        return { constellations }
      }),
    renameConstellation: (id, name) =>
      set((state) => {
        const constellations = state.constellations.map((c) => (c.id === id ? { ...c, name } : c))
        keep(constellations)
        return { constellations }
      }),
    forgetConstellation: (id) =>
      set((state) => {
        const constellations = state.constellations.filter((c) => c.id !== id)
        keep(constellations)
        return { constellations, naming: state.naming === id ? null : state.naming }
      }),
    setNaming: (naming) => set({ naming }),
    markFound: (id) =>
      set((state) => {
        if (state.foundSecrets.includes(id)) return {}
        const foundSecrets = [...state.foundSecrets, id]
        writeText('secrets', JSON.stringify(foundSecrets))
        return { foundSecrets }
      }),
    setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
    setSecretScene: (secretScene) => set({ secretScene }),
  })),
)

/** A stable string for a path, for keys and maps. */
export function pathKey(path: Path): string {
  return path.join('/')
}

export function samePath(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i])
}
