/**
 * Drift mode's tour: the handcrafted worlds in their order, beginning with one in the galaxy the
 * camera is in, and the black hole as one stop along the way.
 */
import { ANCHORS } from '../content/anchors.ts'
import { getUniverse } from './cosmos.ts'
import type { Path } from './universe.ts'

/** The black hole comes after this many worlds. */
export const HOLE_AFTER = 5

export function planTour(from: Path): Path[] {
  const worlds = ANCHORS.map((a): Path => [a.galaxy, a.star, a.world])
  const start = Math.max(0, from.length > 0 ? worlds.findIndex((p) => p[0] === from[0]) : 0)
  const ordered = [...worlds.slice(start), ...worlds.slice(0, start)]
  ordered.splice(HOLE_AFTER, 0, [getUniverse().hole.index])
  return ordered
}
