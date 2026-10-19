import { describe, expect, it } from 'vitest'
import {
  cleanName,
  extend,
  MAX_CONSTELLATIONS,
  MAX_NAME,
  MAX_STARS,
  newId,
  parseConstellations,
  segments,
  serializeConstellations,
  type Constellation,
} from './constellations.ts'

const one: Constellation = { id: 'a1', galaxy: 0, stars: [3, 9, 14], name: 'The Kite', made: 1_760_000_000_000 }

describe('constellations', () => {
  it('round-trips through storage', () => {
    expect(parseConstellations(serializeConstellations([one]))).toEqual([one])
  })

  it('reads nothing from nothing, and nothing from garbage', () => {
    expect(parseConstellations(null)).toEqual([])
    expect(parseConstellations('')).toEqual([])
    expect(parseConstellations('{not json')).toEqual([])
    expect(parseConstellations('{"a":1}')).toEqual([])
    expect(parseConstellations('[1, "x", null]')).toEqual([])
  })

  it('drops malformed entries and keeps the rest', () => {
    const text = JSON.stringify([
      one,
      { ...one, id: 'b', stars: [4] },
      { ...one, id: 'c', galaxy: -1 },
      { ...one, id: 'd', stars: [1, 2.5] },
      { ...one, id: '' },
      { ...one, id: 'a1', name: 'duplicate' },
      { ...one, id: 'e', name: 42, made: 'yesterday' },
    ])
    const parsed = parseConstellations(text)
    expect(parsed.map((c) => c.id)).toEqual(['a1', 'e'])
    expect(parsed[1]).toMatchObject({ name: '', made: 0 })
  })

  it('cleans names', () => {
    expect(cleanName('  the   long\nwatch  ')).toBe('the long watch')
    expect(cleanName('x'.repeat(100))).toHaveLength(MAX_NAME)
  })

  it('extends a line without repeating the last star, up to a limit', () => {
    expect(extend([1, 2], 2)).toEqual([1, 2])
    expect(extend([1, 2], 1)).toEqual([1, 2, 1])
    const full = Array.from({ length: MAX_STARS }, (_, i) => i)
    expect(extend(full, 99)).toBe(full)
  })

  it('joins consecutive stars', () => {
    expect(segments([5, 6, 7])).toEqual([
      [5, 6],
      [6, 7],
    ])
    expect(segments([5])).toEqual([])
  })

  it('keeps storage bounded', () => {
    const many = Array.from({ length: MAX_CONSTELLATIONS + 10 }, (_, i) => ({ ...one, id: `c${i}` }))
    expect(parseConstellations(serializeConstellations(many))).toHaveLength(MAX_CONSTELLATIONS)
  })

  it('makes distinct ids', () => {
    const ids = new Set(Array.from({ length: 200 }, (_, i) => newId(1000 + i)))
    expect(ids.size).toBe(200)
    expect(newId(5, () => 0.5)).toMatch(/^5-[0-9a-z]+$/)
  })
})
