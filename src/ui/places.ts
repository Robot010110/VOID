/** What the interface says about a place: its name, its ancestors, and two or three sentences. */
import { describePlanet, describeStar } from '../core/describe.ts'
import type { PlanetKind } from '../core/planets.ts'
import { getSystem, type Path } from '../core/universe.ts'

export interface Place {
  readonly name: string
  readonly text: string
  /** The places above it, outermost first, each with the path that goes back there. */
  readonly ancestors: ReadonlyArray<{ readonly name: string; readonly path: Path }>
}

export function placeAt(path: Path): Place {
  const system = getSystem(path[0]!, path[1]!)
  if (path.length === 2) {
    return { name: system.star.name, text: describeStar(system), ancestors: [] }
  }
  const planet = system.planets[path[2]!]!
  return {
    name: planet.name,
    text: describePlanet(system, planet),
    ancestors: [{ name: system.star.name, path: path.slice(0, 2) }],
  }
}

/** A few words for what a world is, for screen readers choosing among them. */
export const KIND_WORDS: Record<PlanetKind, string> = {
  terrestrial: 'a temperate world',
  ocean: 'an ocean world',
  desert: 'a desert world',
  ice: 'a frozen world',
  lava: 'a molten world',
  toxic: 'a clouded world',
  barren: 'an airless world',
  gas: 'a gas giant',
  ringed: 'a ringed giant',
  'ice-giant': 'an ice giant',
}
