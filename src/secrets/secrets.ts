/**
 * VOID's nine secrets: what each one is, how it is noticed, and what happens when one is found.
 * Nothing in the interface points at any of them. Finding one rings a soft chime and shows,
 * for a moment, how many have been found ("4 of 9 found"); that is all.
 *
 *  1. The signal: a faint star in the sky among the galaxies blinks two, three, five, and waits.
 *     Clicked while it is lit, it leads to the world it comes from.
 *  2. The radio whisper: seen by radio, one galaxy wears a ring of lights no eye can see.
 *  3. The edge: zoom out past the universe's limit and keep going, into total dark, where one
 *     last fragment waits.
 *  4. The pale dot: a small blue world with one moon, third from a yellow star on the edge of
 *     the home galaxy, says "You are here." Found only by looking.
 *  5. The black hole's interior: fall into the black hole itself.
 *  6. The developer's door: the browser's console holds a riddle; its answer, typed anywhere,
 *     opens a listening station's terminal.
 *  7. The terminal: the station's files hold the coordinates of its keepers' home; `goto` flies
 *     there.
 *  8. The old code: the Konami code makes every star in view sing one chord.
 *  9. The persistence: on a later day, a star of a visitor's constellation has a new, faint
 *     companion, and a fragment that knows they came back.
 *
 * This file holds their definitions and the logic that notices them (pure where it can be,
 * tested in secrets.test.ts). The scenes they play out in are in sequences.ts, the station in
 * terminal.ts, and what is drawn in scene/objects (SignalStar, RadioRing, Companion). The
 * spoilers, with where everything is, are in SECRETS.md.
 */
import { audioEngine } from '../audio/sound.ts'
import type { Constellation } from '../core/constellations.ts'
import type { GalacticOrbit } from '../core/galaxy.ts'
import { useVoid } from '../core/store.ts'
import type { Path } from '../core/universe.ts'
import { universeView } from '../scene/camera/views.ts'

export type SecretId =
  | 'signal'
  | 'radio'
  | 'edge'
  | 'pale-dot'
  | 'interior'
  | 'door'
  | 'terminal'
  | 'old-code'
  | 'persistence'

/** All nine, in the order the brief lists them. */
export const SECRETS: readonly SecretId[] = [
  'signal',
  'radio',
  'edge',
  'pale-dot',
  'interior',
  'door',
  'terminal',
  'old-code',
  'persistence',
]

export function isSecret(id: string): id is SecretId {
  return (SECRETS as readonly string[]).includes(id)
}

/** How many of the nine are among these (stored ids may include anything). */
export function foundCount(found: readonly string[]): number {
  return SECRETS.filter((id) => found.includes(id)).length
}

/**
 * Mark a secret found (once; it is remembered between visits), with a soft chime. The count
 * shows by itself (ui/SecretCounter.tsx). True if it was new.
 */
export function findSecret(id: SecretId): boolean {
  const { foundSecrets, markFound } = useVoid.getState()
  if (foundSecrets.includes(id)) return false
  markFound(id)
  audioEngine()?.chime()
  return true
}

/** The words that say how many have been found. */
export function foundWords(count: number): string {
  return `${count} of ${SECRETS.length} found`
}

// ---------------------------------------------------------------------------------------
// 1. The signal

/**
 * Where the signal is in the sky among the galaxies: a direction in the universe's frame, set
 * above the web and a little to the right in the universe's resting view, in a patch of sky with
 * no galaxy in front of it (high rather than wide, so a tall screen has it in view too).
 */
export const SIGNAL_DIRECTION: readonly [number, number, number] = (() => {
  const { azimuth, polar } = universeView()
  const s = Math.sin(polar)
  // The resting view looks back along this, at the centre of the universe.
  const forward = [-s * Math.sin(azimuth), -Math.cos(polar), -s * Math.cos(azimuth)]
  const right = normalise([-forward[2]!, 0, forward[0]!])
  const up = cross(right, forward)
  const across = Math.tan((9 * Math.PI) / 180)
  const above = Math.tan((18.5 * Math.PI) / 180)
  return normalise([0, 1, 2].map((k) => forward[k]! + right[k]! * across + up[k]! * above)) as [number, number, number]
})()

/** It counts in flashes, two, three, five, a second apart; waits between counts; then waits longer. */
export const SIGNAL_COUNTS: readonly number[] = [2, 3, 5]
const FLASH = 1
const LIT = 0.42
const BETWEEN_COUNTS = 1.8
const AFTER = 5
/** How faint it is between flashes: a star like any other, until it blinks. */
const RESTING = 0.1
/** A click this soon after a flash has died still counts as on it: people are not instant. */
const GRACE = 0.35

/** Seconds in one whole round of the signal. */
export const SIGNAL_CYCLE = SIGNAL_COUNTS.reduce((sum, n) => sum + n * FLASH, 0) + BETWEEN_COUNTS * (SIGNAL_COUNTS.length - 1) + AFTER

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Seconds into the flash under way at `seconds`, or -1 between flashes. */
function intoFlash(seconds: number): number {
  let t = ((seconds % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE
  for (let i = 0; i < SIGNAL_COUNTS.length; i++) {
    const length = SIGNAL_COUNTS[i]! * FLASH
    if (t < length) return t % FLASH
    t -= length
    if (i < SIGNAL_COUNTS.length - 1) {
      if (t < BETWEEN_COUNTS) return -1
      t -= BETWEEN_COUNTS
    }
  }
  return -1
}

/** How bright the signal is at a moment (real seconds), 0 to 1. */
export function signalLight(seconds: number): number {
  const u = intoFlash(seconds)
  const flash = u < 0 ? 0 : smoothstep(0, 0.07, u) * (1 - smoothstep(LIT, LIT + 0.3, u))
  return RESTING + (1 - RESTING) * flash
}

/** Whether the signal is lit at a moment: in a flash, or only just out of one. */
export function signalLit(seconds: number): boolean {
  const u = intoFlash(seconds)
  return u >= 0 && u <= LIT + GRACE
}

/** The world the signal comes from. */
export const BEACON: Path = [34, 2, 0]

// ---------------------------------------------------------------------------------------
// 2. The radio whisper

/** The galaxy that wears the ring of lights, by radio only. */
export const RADIO_GALAXY = 41
/** How strongly the view must be by radio to see it, and how long it must be watched. */
export const RADIO_SEEN = 0.85
export const RADIO_WATCH = 1.5

// ---------------------------------------------------------------------------------------
// 3. The edge

/**
 * Out past the universe's farthest view (the camera stops there, at 5200, until the visitor
 * keeps pulling as if to rise out of it): everything has begun to fade by `FADING`, is gone by
 * `DARK`, and the camera goes no further than `BEYOND`.
 */
export const EDGE = { fading: 6200, dark: 21000, beyond: 26000 } as const

/** How far everything has faded at a distance from the centre of the universe, 0 to 1. */
export function edgeFade(distance: number): number {
  return smoothstep(Math.log(EDGE.fading), Math.log(EDGE.dark), Math.log(Math.max(distance, 1)))
}

// ---------------------------------------------------------------------------------------
// 4, 7. Hidden worlds

export const PALE_DOT: Path = [0, 250, 2]
export const KEEPERS: Path = [47, 161, 1]

// ---------------------------------------------------------------------------------------
// 6, 8. Keys: the word the console's riddle points to, and the old code

export const DOOR_WORD = 'listen'
export const OLD_CODE: readonly string[] = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
]
/** A pause longer than this between keys starts a sequence over. */
const KEY_PAUSE = 2500

/**
 * How far into a sequence the last keys have come: the longest run of them that begins the
 * sequence (so a key repeated too often, as in "up up up down", still counts from where it can).
 */
export function progress(sequence: readonly string[], keys: readonly string[]): number {
  for (let length = Math.min(keys.length, sequence.length); length > 0; length--) {
    const tail = keys.slice(keys.length - length)
    if (tail.every((key, i) => key === sequence[i])) return length
  }
  return 0
}

export interface KeyResult {
  /** The door's word has just been typed. */
  readonly door: boolean
  /** The old code has just been entered. */
  readonly oldCode: boolean
  /**
   * The key is part of the word, well under way, and should do nothing else: "listen" passes
   * through S and T, which are also VOID's keys for what the eye sees by and for time.
   */
  readonly consumed: boolean
}

/** Follows the keys pressed (outside text fields) for the door's word and the old code. */
export class KeyTrail {
  private keys: string[] = []
  private last = -Infinity

  press(key: string, time: number): KeyResult {
    if (time - this.last > KEY_PAUSE) this.keys = []
    this.last = time
    this.keys.push(key.toLowerCase())
    if (this.keys.length > 16) this.keys.shift()
    const letters = this.keys.map((k) => (k.length === 1 ? k : '\u0000'))
    const word = progress([...DOOR_WORD], letters)
    const code = progress(OLD_CODE, this.keys)
    const door = word === DOOR_WORD.length
    const oldCode = code === OLD_CODE.length
    if (door || oldCode) this.keys = []
    return { door, oldCode, consumed: word >= 3 }
  }
}

// ---------------------------------------------------------------------------------------
// 9. The persistence

/** Local midnight before a moment, in milliseconds. */
function dayOf(time: number): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * The constellation whose star has a companion now: the oldest one drawn on an earlier day than
 * `now`, or null if every one was drawn today (or there are none).
 */
export function returning(constellations: readonly Constellation[], now: number): Constellation | null {
  const today = dayOf(now)
  let oldest: Constellation | null = null
  for (const c of constellations) {
    if (c.made <= 0 || dayOf(c.made) >= today) continue
    if (!oldest || c.made < oldest.made) oldest = c
  }
  return oldest
}

/** When this visit began: a star that comes on a later day comes with the visit, not at midnight. */
export const VISIT_BEGAN = Date.now()

/**
 * The companion's path round the galaxy: just beside its star's, a few units out and a little
 * above, riding round with it.
 */
export function companionOrbit(orbit: GalacticOrbit): GalacticOrbit {
  const radius = orbit.radius + 3.1
  return { ...orbit, radius, phase: orbit.phase + 2.4 / Math.max(radius, 1), height: orbit.height + 1.6 }
}

// ---------------------------------------------------------------------------------------

function normalise(v: readonly number[]): number[] {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!)
  return [v[0]! / length, v[1]! / length, v[2]! / length]
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
}
