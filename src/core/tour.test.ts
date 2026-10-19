import { describe, expect, it } from 'vitest'
import { ANCHORS } from '../content/anchors.ts'
import { getUniverse } from './cosmos.ts'
import { HOLE_AFTER, planTour } from './tour.ts'

describe('drift tour', () => {
  const hole = getUniverse().hole.index

  it('visits every handcrafted world once, and the black hole once', () => {
    const tour = planTour([])
    expect(tour).toHaveLength(ANCHORS.length + 1)
    expect(tour.filter((p) => p.length === 1 && p[0] === hole)).toHaveLength(1)
    const worlds = new Set(tour.filter((p) => p.length === 3).map((p) => p.join('/')))
    expect(worlds.size).toBe(ANCHORS.length)
    expect(tour[HOLE_AFTER]).toEqual([hole])
  })

  it('begins in the galaxy the camera is in', () => {
    const anchor = ANCHORS.find((a) => a.galaxy !== ANCHORS[0]!.galaxy)!
    const tour = planTour([anchor.galaxy, 3])
    expect(tour[0]![0]).toBe(anchor.galaxy)
  })

  it('begins with the first world from the universe or a galaxy without stories', () => {
    expect(planTour([])[0]).toEqual([ANCHORS[0]!.galaxy, ANCHORS[0]!.star, ANCHORS[0]!.world])
    const empty = getUniverse().galaxies.find((g) => !ANCHORS.some((a) => a.galaxy === g.index))!
    expect(planTour([empty.index])[0]).toEqual([ANCHORS[0]!.galaxy, ANCHORS[0]!.star, ANCHORS[0]!.world])
  })
})
