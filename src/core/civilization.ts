/**
 * Civilisations, as plain data (no three.js). Some habitable worlds hold a people: a name, how
 * long they have lived there, and what has become of them.
 *
 * - Thriving: dense city lights, satellites, sometimes a ring of stations tethered to the
 *   equator.
 * - Fading: sparse lights that flicker, and whole cities going dark for a while.
 * - Gone: no lights, but their cities show as lines in the ground, and a ring of theirs may
 *   still turn, broken and silent.
 * - Transcended: no cities at all, only a vast structure faintly humming with light: a lattice
 *   around their world, or an unfinished arc of collectors around their star.
 *
 * Structures are architecture, never ships: rails, tethers, great circles and points of light.
 * Their sizes are in the world's radii (or, for an arc around a star, the star's).
 *
 * Twelve worlds are handcrafted anchors (content/anchors.ts) whose people and state are chosen
 * by hand; every other civilisation is drawn here from its world's seed.
 */
import type { Language } from './names.ts'
import type { PlanetKind } from './planets.ts'
import { hashSeed, Rng } from './rng.ts'

export type CivilizationState = 'thriving' | 'fading' | 'gone' | 'transcended'

/** A ring of stations around a world's equator. */
export interface OrbitalRing {
  /** Radius, planet radii. */
  readonly radius: number
  /** Tethers running down to the equator; none once the ring has come loose. */
  readonly tethers: number
  /** Broken: whole runs of it missing, pieces adrift, its lights out. */
  readonly derelict: boolean
}

/** A lattice of great circles around a world, faintly lit from within. */
export interface Lattice {
  /** Radius, planet radii. */
  readonly radius: number
  /** Tilt of the lattice against the world's axis, radians. */
  readonly tilt: number
}

/** An arc of light collectors circling a star: a Dyson swarm, partly built. */
export interface Swarm {
  /** Orbit radius, in the star's radii. */
  readonly radius: number
  /** How much of the circle the arc covers, radians. */
  readonly span: number
  /** The arc's plane: its tilt against the system's plane, and where it crosses it, radians. */
  readonly inclination: number
  readonly node: number
  /** Spread of the collectors' orbits about that plane, radians. */
  readonly thickness: number
}

export interface Structures {
  readonly ring: OrbitalRing | null
  /** Satellites in low orbit. Dead ones still catch the sun. */
  readonly satellites: number
  readonly lattice: Lattice | null
  readonly swarm: Swarm | null
}

export interface Civilization {
  /** What the people are called. */
  readonly people: string
  readonly state: CivilizationState
  /** Years they have lived on their world, or did. */
  readonly age: number
  /** Years since they left or vanished; 0 while they are still there. */
  readonly since: number
  readonly structures: Structures
  /** For details drawn from it: the rhythm of failing lights, where a ring broke. */
  readonly seed: number
}

export const NO_STRUCTURES: Structures = { ring: null, satellites: 0, lattice: null, swarm: null }

/** Whether a people in this state still live on their world (and light it at night). */
export function stillThere(state: CivilizationState): boolean {
  return state === 'thriving' || state === 'fading'
}

/** A world that is alive at night: its people are still there. */
export function isLit(civilization: Civilization | null | undefined): boolean {
  return civilization !== null && civilization !== undefined && stillThere(civilization.state)
}

const STATES: readonly CivilizationState[] = ['thriving', 'fading', 'gone', 'transcended']
const STATE_WEIGHTS = [40, 22, 25, 13]

/** Round a number of years to two significant figures, as people speak of long times. */
export function roundYears(years: number): number {
  const scale = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(years, 1))) - 1)
  return Math.round(years / scale) * scale
}

/** A number of years drawn evenly in log space. */
function years(rng: Rng, min: number, max: number): number {
  return roundYears(Math.exp(rng.range(Math.log(min), Math.log(max))))
}

/** A ring of stations rides low, well inside the closest the camera comes to its world. */
function ringRadius(rng: Rng): number {
  return rng.range(1.14, 1.2)
}

/** The structures a people of this state build, drawn from their world's seed. */
function drawStructures(state: CivilizationState, rng: Rng, starStructures: boolean): Structures {
  switch (state) {
    case 'thriving': {
      const ring = rng.chance(0.25) ? { radius: ringRadius(rng), tethers: rng.int(6, 10), derelict: false } : null
      return { ring, satellites: rng.int(180, 420), lattice: null, swarm: null }
    }
    case 'fading': {
      const ring = rng.chance(0.1) ? { radius: ringRadius(rng), tethers: rng.int(4, 8), derelict: false } : null
      return { ring, satellites: rng.int(40, 110), lattice: null, swarm: null }
    }
    case 'gone': {
      const ring = rng.chance(0.3) ? { radius: ringRadius(rng), tethers: 0, derelict: true } : null
      return { ring, satellites: rng.int(0, 24), lattice: null, swarm: null }
    }
    case 'transcended': {
      if (starStructures && rng.chance(0.45)) {
        return {
          ring: null,
          satellites: 0,
          lattice: null,
          swarm: {
            radius: rng.range(2.4, 3.2),
            span: rng.range(2.4, 4.2),
            inclination: rng.range(0.12, 0.35),
            node: rng.range(0, Math.PI * 2),
            thickness: rng.range(0.03, 0.06),
          },
        }
      }
      return { ring: null, satellites: 0, lattice: { radius: rng.range(1.2, 1.25), tilt: rng.range(0.15, 0.5) }, swarm: null }
    }
  }
}

/**
 * A people for a world, drawn from its seed and named in its galaxy's language. `starStructures`
 * allows an arc around the star (only one world per system may build one).
 */
export function generateCivilization(
  worldSeed: number,
  language: Language,
  avoid: ReadonlySet<string>,
  starStructures: boolean,
  state?: CivilizationState,
): Civilization {
  const rng = new Rng(hashSeed(worldSeed, 0xc1f1))
  const names = new Rng(hashSeed(worldSeed, 0xc1f3))
  const chosen = state ?? rng.weighted(STATES, STATE_WEIGHTS)
  let people = language.name(names, { minSyllables: 2, maxSyllables: 3, maxLength: 8 })
  for (let tries = 0; tries < 20 && avoid.has(people); tries++) {
    people = language.name(names, { minSyllables: 2, maxSyllables: 3, maxLength: 8 })
  }
  const age =
    chosen === 'thriving'
      ? years(rng, 3_000, 40_000)
      : chosen === 'fading'
        ? years(rng, 15_000, 120_000)
        : chosen === 'gone'
          ? years(rng, 2_000, 60_000)
          : years(rng, 20_000, 900_000)
  const since = chosen === 'gone' ? years(rng, 800, 400_000) : chosen === 'transcended' ? years(rng, 2_000, 200_000) : 0
  return {
    people,
    state: chosen,
    age,
    since,
    structures: drawStructures(chosen, rng, starStructures),
    seed: hashSeed(worldSeed, 0xc1f5),
  }
}

/**
 * Worlds that cannot hold a temperate people may still hold what is left of one: a dry or
 * frozen world near the habitable zone sometimes keeps the ruins of a people who outlived its
 * climate. Kinds and the chance of it.
 */
export const RUIN_KINDS: ReadonlySet<PlanetKind> = new Set(['desert', 'ice', 'toxic'])
export const RUIN_CHANCE = 0.16
