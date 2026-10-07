import { describe, expect, it } from 'vitest'
import { getUniverse } from '../core/cosmos.ts'
import { getGalaxy } from '../core/galaxy.ts'
import { getSystem, HOME } from '../core/universe.ts'
import { childName, placeAt } from './places.ts'

const universe = getUniverse()
const home = getGalaxy(HOME[0]!)

describe('placeAt', () => {
  it('names the universe, with no way further up', () => {
    const place = placeAt([])
    expect(place.name).toBe('Universe')
    expect(place.ancestors).toEqual([])
    expect(place.text).toMatch(/^[A-Z][a-z-]+ galaxies hang along faint threads of gas/)
  })

  it('roots every breadcrumb in the universe', () => {
    expect(placeAt([HOME[0]!]).ancestors).toEqual([{ name: 'Universe', path: [] }])
    const world = placeAt([...HOME, 3])
    expect(world.ancestors.map((a) => a.name)).toEqual(['Universe', home.name, getSystem(HOME[0]!, HOME[1]!).star.name])
    expect(world.ancestors.map((a) => a.path)).toEqual([[], [HOME[0]], [...HOME]])
  })

  it('describes the black hole as a place of its own beneath the universe', () => {
    const place = placeAt([universe.hole.index])
    expect(place.name).toBe(universe.hole.name)
    expect(place.ancestors).toEqual([{ name: 'Universe', path: [] }])
    expect(place.text.split('. ').length).toBeLessThanOrEqual(3)
  })

  it('describes each kind of galaxy for what it is', () => {
    const first = (kind: string) => universe.galaxies.find((g) => g.kind === kind)!.index
    expect(placeAt([first('elliptical')]).text).toMatch(/elliptical galaxy/)
    expect(placeAt([first('irregular')]).text).toMatch(/irregular galaxy/)
    expect(placeAt([first('spiral')]).text).toMatch(/spiral galaxy/)
    expect(placeAt([HOME[0]!]).text).toMatch(/barred spiral/)
  })
})

describe('childName', () => {
  it('names what the pointer finds at each level', () => {
    expect(childName([], HOME[0]!)).toBe(home.name)
    expect(childName([], universe.hole.index)).toBe(universe.hole.name)
    expect(childName([], 999)).toBe('')
    expect(childName([universe.hole.index], 0)).toBe('')
    expect(childName([HOME[0]!], HOME[1]!)).toBe(home.stars[HOME[1]!]!.star.name)
  })
})
