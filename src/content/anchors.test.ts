import { describe, expect, it } from 'vitest'
import { stillThere } from '../core/civilization.ts'
import { getUniverse } from '../core/cosmos.ts'
import { describeGalaxy, describePlanet } from '../core/describe.ts'
import { getGalaxy } from '../core/galaxy.ts'
import { getSystem, HOME } from '../core/universe.ts'
import { anchorAt, anchorById, anchorOf, ANCHORS, anchorsIn } from './anchors.ts'

const world = (id: string) => {
  const anchor = anchorById(id)!
  const system = getSystem(anchor.galaxy, anchor.star)
  return { anchor, system, planet: system.planets[anchor.world]! }
}

describe('the handcrafted worlds', () => {
  it('are about a dozen, each in its own place', () => {
    expect(ANCHORS.length).toBe(12)
    expect(new Set(ANCHORS.map((a) => a.id)).size).toBe(ANCHORS.length)
    expect(new Set(ANCHORS.map((a) => `${a.galaxy}:${a.star}`)).size).toBe(ANCHORS.length)
    // Spread across the universe, with the home galaxy holding a few to be found first.
    expect(new Set(ANCHORS.map((a) => a.galaxy)).size).toBeGreaterThanOrEqual(8)
    expect(anchorsIn(HOME[0]!).length).toBeGreaterThanOrEqual(3)
  })

  it('stand at real places, around named stars a visitor can reach by keyboard', () => {
    const galaxies = getUniverse().galaxies.length
    for (const anchor of ANCHORS) {
      expect(anchor.galaxy).toBeLessThan(galaxies)
      const galaxy = getGalaxy(anchor.galaxy)
      const star = galaxy.stars[anchor.star]!
      expect(star.star.catalogued).toBe(false)
      expect(star.notable).toBe(true)
      expect(getSystem(anchor.galaxy, anchor.star).planets[anchor.world]).toBeDefined()
      expect(anchorAt(anchor.galaxy, anchor.star)).toBe(anchor)
      expect(anchorOf([anchor.galaxy, anchor.star, anchor.world])).toBe(anchor)
      expect(anchorOf([anchor.galaxy, anchor.star])).toBeUndefined()
    }
  })

  it('are the worlds their stories describe', () => {
    for (const anchor of ANCHORS) {
      const { system, planet } = world(anchor.id)
      expect(planet.kind).toBe(anchor.kind)
      if (anchor.name) expect(planet.name).toBe(anchor.name)
      if (anchor.moons !== undefined) expect(planet.preset.moons.length).toBe(anchor.moons)
      expect(planet.civilization).toMatchObject({ people: anchor.civilization.people, state: anchor.civilization.state })
      // The only people of their system, so the star's caption points at the story.
      expect(system.planets.filter((p) => p.civilization).length).toBe(1)
      expect(new Set(system.planets.map((p) => p.name)).size).toBe(system.planets.length)
    }
    expect(world('ensar').planet.preset.moons.length).toBe(2)
    expect(world('driram').planet.preset.structures?.ring?.tethers).toBeGreaterThan(0)
    expect(world('laelien').planet.preset.structures?.ring?.derelict).toBe(true)
    expect(world('evith').planet.preset.structures?.lattice).not.toBeNull()
    expect(world('kothor').system.swarm).not.toBeNull()
    expect(world('ithasal').planet.name).toBe('Ithasal')
  })

  it('cover every state and many kinds of world', () => {
    const states = new Set(ANCHORS.map((a) => a.civilization.state))
    expect([...states].sort()).toEqual(['fading', 'gone', 'thriving', 'transcended'])
    expect(new Set(ANCHORS.map((a) => a.kind)).size).toBeGreaterThanOrEqual(5)
  })

  it('are signposted, in plain words, by the galaxies they lie in', () => {
    for (const galaxy of new Set(ANCHORS.map((a) => a.galaxy))) {
      const text = describeGalaxy(getGalaxy(galaxy), galaxy === HOME[0] ? HOME[1] : undefined)
      for (const anchor of anchorsIn(galaxy)) {
        if (galaxy === HOME[0] && anchor.star === HOME[1]) continue
        expect(text).toContain(getGalaxy(galaxy).stars[anchor.star]!.star.name)
      }
      expect(text).toMatch(/People (live|once lived|live, or once lived,) on/)
    }
  })

  it('are described plainly, by their people', () => {
    for (const anchor of ANCHORS) {
      const { system, planet } = world(anchor.id)
      const text = describePlanet(system, planet)
      expect(text).toContain(anchor.civilization.people)
      expect(text).toMatch(stillThere(anchor.civilization.state) ? /have lived here/ : /lived here/)
    }
  })
})

/** Words the voice guide keeps out (content/voice.md). */
const STOCK = /\b(ancient|eternal|infinite|vast|vastness|cosmos|cosmic|whisper\w*|echo\w*|stardust|tapestry|journey|beings|energy|destiny)\b/i

describe('the fragments', () => {
  it('number one to three a world, each one to three sentences of about forty words at most', () => {
    for (const anchor of ANCHORS) {
      expect(anchor.fragments.length).toBeGreaterThanOrEqual(1)
      expect(anchor.fragments.length).toBeLessThanOrEqual(3)
      for (const lines of anchor.fragments) {
        const text = lines.join(' ')
        expect(text.split(/\s+/).length).toBeLessThanOrEqual(40)
        const sentences = text.split(/(?<=[.?])\s+/).filter(Boolean)
        expect(sentences.length).toBeGreaterThanOrEqual(1)
        expect(sentences.length).toBeLessThanOrEqual(3)
        expect(text).toMatch(/[.]$/)
      }
    }
  })

  it('keep to the voice: no exclamations, no stock words, no invented names', () => {
    for (const anchor of ANCHORS) {
      for (const lines of anchor.fragments) {
        const text = lines.join(' ')
        expect(text).not.toMatch(/!/)
        expect(text).not.toMatch(STOCK)
        expect(text).not.toContain(anchor.civilization.people)
        expect(text).not.toContain(world(anchor.id).planet.name)
      }
    }
  })

  it('are broken into lines that fit beside a world', () => {
    for (const anchor of ANCHORS) {
      for (const lines of anchor.fragments) {
        for (const line of lines) {
          expect(line.length).toBeGreaterThan(0)
          expect(line.length).toBeLessThanOrEqual(42)
          expect(line).toBe(line.trim())
        }
      }
    }
  })
})
