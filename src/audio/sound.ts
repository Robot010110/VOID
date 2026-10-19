/**
 * The sound as the rest of VOID sees it: what the engine can do, and the engine itself once
 * Enter has started it. Kept apart from engine.ts so that Tone.js stays in its own chunk,
 * fetched while the opening loads, and nothing else has to wait for it.
 */
import type { Level } from '../core/universe.ts'

export type SoundLevel = Level

/** What a people's world sounds like, if anything: by the state they are in. */
export type Hum = 'none' | 'warm' | 'faltering' | 'glass'

export type NoteKind = 'star' | 'world' | 'galaxy'

export interface SoundState {
  /** The audio context: 'running', or 'suspended' while muted or hidden. */
  readonly state: string
  readonly audible: boolean
  /** Each layer's gain right now, 0 to 1. */
  readonly layers: Readonly<Record<string, number>>
  /** Notes rung so far. */
  readonly notes: number
  /** Loudness of the output, dBFS: its RMS and its peak over the last few milliseconds. */
  readonly rms: number
  readonly peak: number
}

export interface AudioEngine {
  /** Crossfade to a level's layer (over about two seconds). */
  setLevel(level: SoundLevel): void
  /** At a world: how much air moves there (0 to 1), and what its people hum. */
  setPlace(wind: number, hum: Hum): void
  /** How fast the system's warm layer pulses, in hertz. */
  setPulse(hertz: number): void
  /** Ring one note (a MIDI number) for something touched. */
  note(kind: NoteKind, midi: number): void
  /** Noise swept through a filter: down for a fall, up for a rise. */
  sweep(direction: 'down' | 'up', seconds: number, strength?: number): void
  /** Fade everything in or out; while out, the audio context sleeps. */
  setAudible(audible: boolean): void
  /** For the screenshot script and debugging. */
  inspect(): SoundState
}

let current: AudioEngine | null = null
const listeners = new Set<() => void>()

/** The engine, once Enter has started it; null before. */
export function audioEngine(): AudioEngine | null {
  return current
}

/** Call `listener` when the engine has started, to bring it up to date. */
export function onEngine(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerEngine(engine: AudioEngine) {
  current = engine
  for (const listener of listeners) listener()
}
