/**
 * Constellations the visitor draws: stars of one galaxy joined in order by thin lines, and a
 * name if they gave one. They are kept between visits (localStorage), so this file also reads
 * them back defensively: storage may hold anything, from an older version or from no version
 * at all, and a bad entry is dropped rather than trusted.
 */

export interface Constellation {
  readonly id: string
  /** The galaxy whose stars it joins. */
  readonly galaxy: number
  /** Indices of its stars in the galaxy, in the order they were joined. */
  readonly stars: readonly number[]
  /** What the visitor called it; empty if they did not. */
  readonly name: string
  /** When it was drawn, in milliseconds since 1970. */
  readonly made: number
}

/** A constellation needs two stars to be a line, and is held to a sky's worth. */
export const MIN_STARS = 2
export const MAX_STARS = 24
export const MAX_NAME = 40
/** More than a visitor could want; enough to keep storage small. */
export const MAX_CONSTELLATIONS = 64

/** Tidy a name as typed: one line, single spaces, no longer than a short phrase. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

/** Add a star to a constellation being drawn: never the same star twice in a row, at most a sky's worth. */
export function extend(stars: readonly number[], star: number): readonly number[] {
  if (stars.length >= MAX_STARS || stars[stars.length - 1] === star) return stars
  return [...stars, star]
}

/** The joined pairs, as indices into `stars`: consecutive stars. */
export function segments(stars: readonly number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 1; i < stars.length; i++) pairs.push([stars[i - 1]!, stars[i]!])
  return pairs
}

const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0

function parseOne(value: unknown): Constellation | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > 64) return null
  if (!isIndex(v.galaxy)) return null
  if (!Array.isArray(v.stars) || v.stars.length < MIN_STARS || v.stars.length > MAX_STARS) return null
  if (!v.stars.every(isIndex)) return null
  const name = typeof v.name === 'string' ? cleanName(v.name) : ''
  const made = typeof v.made === 'number' && Number.isFinite(v.made) && v.made > 0 ? v.made : 0
  return { id: v.id, galaxy: v.galaxy, stars: v.stars as number[], name, made }
}

/** Constellations from stored text; anything malformed is left out. */
export function parseConstellations(text: string | null): Constellation[] {
  if (!text) return []
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: Constellation[] = []
  for (const item of data) {
    const c = parseOne(item)
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
    if (out.length >= MAX_CONSTELLATIONS) break
  }
  return out
}

export function serializeConstellations(list: readonly Constellation[]): string {
  return JSON.stringify(list.slice(-MAX_CONSTELLATIONS))
}

/** A short id that will not collide in one visitor's sky. */
export function newId(now: number, random: () => number = Math.random): string {
  return `${now.toString(36)}-${Math.floor(random() * 36 ** 5).toString(36)}`
}
