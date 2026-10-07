/** What the interface says about a place: its name, its ancestors, and two or three sentences. */
import { describeGalaxy, describePlanet, describeStar, starColour } from '../core/describe.ts'
import { getGalaxy, isHomeGalaxy } from '../core/galaxy.ts'
import type { PlanetKind } from '../core/planets.ts'
import { getSystem, HOME, type Path } from '../core/universe.ts'

export interface Place {
  readonly name: string
  readonly text: string
  /** The places above it, outermost first, each with the path that goes back there. */
  readonly ancestors: ReadonlyArray<{ readonly name: string; readonly path: Path }>
}

export function placeAt(path: Path): Place {
  const galaxy = getGalaxy(path[0]!)
  const top = [{ name: galaxy.name, path: path.slice(0, 1) }]
  if (path.length === 1) {
    return {
      name: galaxy.name,
      text: describeGalaxy(galaxy, isHomeGalaxy(galaxy.index) ? HOME[1] : undefined),
      ancestors: [],
    }
  }
  const system = getSystem(path[0]!, path[1]!)
  if (path.length === 2) {
    return { name: system.star.name, text: describeStar(system), ancestors: top }
  }
  const planet = system.planets[path[2]!]!
  return {
    name: planet.name,
    text: describePlanet(system, planet),
    ancestors: [...top, { name: system.star.name, path: path.slice(0, 2) }],
  }
}

/** The name of a child of the place at `path`, for the hover ring. */
export function childName(path: Path, index: number): string {
  if (path.length === 1) return getGalaxy(path[0]!).stars[index]?.star.name ?? ''
  if (path.length === 2) return getSystem(path[0]!, path[1]!).planets[index]?.name ?? ''
  return ''
}

/** A few words for what a star is, for screen readers choosing among them: "a yellow star". */
export function starWords(temperature: number): string {
  const colour = starColour(temperature)
  return `${/^[aeiou]/.test(colour) ? 'an' : 'a'} ${colour} star`
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
