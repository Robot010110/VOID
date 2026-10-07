import { describe, expect, it } from 'vitest'
import { generateCivilization, isLit, roundYears, stillThere } from './civilization.ts'
import { describePlanet, describeStar, yearsInWords } from './describe.ts'
import { getGalaxyLook } from './galaxy.ts'
import { Rng } from './rng.ts'
import { galaxyLanguage, getSystem, HOME, variedPreset, type PlanetData, type SystemData } from './universe.ts'

/** Every world with a people across the first systems of a few galaxies, and its system. */
const SAMPLE: Array<{ system: SystemData; planet: PlanetData }> = []
for (const galaxy of [2, 3, 6, 9]) {
  for (let star = 0; star < Math.min(160, getGalaxyLook(galaxy).starCount); star++) {
    const system = getSystem(galaxy, star)
    for (const planet of system.planets) if (planet.civilization) SAMPLE.push({ system, planet })
  }
}
const PEOPLED = SAMPLE.map((s) => s.planet)

describe('generateCivilization', () => {
  it('is deterministic', () => {
    const language = galaxyLanguage(3)
    expect(generateCivilization(1234, language, new Set(), true)).toEqual(generateCivilization(1234, language, new Set(), true))
  })

  it('gives a people a name of their galaxy, never one already taken in the system', () => {
    const language = galaxyLanguage(5)
    const first = generateCivilization(77, language, new Set(), true)
    const second = generateCivilization(77, language, new Set([first.people]), true)
    expect(second.people).not.toBe(first.people)
    expect(first.people).toMatch(/^[A-Z][a-z]+$/)
  })

  it('keeps the state it is given', () => {
    const language = galaxyLanguage(1)
    for (const state of ['thriving', 'fading', 'gone', 'transcended'] as const) {
      expect(generateCivilization(9, language, new Set(), true, state).state).toBe(state)
    }
  })
})

describe('peoples across the universe', () => {
  it('live on some temperate worlds, and leave ruins on a few dry or frozen ones', () => {
    expect(PEOPLED.length).toBeGreaterThan(200)
    const kinds = new Set(PEOPLED.map((p) => p.kind))
    for (const kind of kinds) expect(['terrestrial', 'ocean', 'desert', 'ice', 'toxic']).toContain(kind)
    for (const planet of PEOPLED) {
      if (planet.kind === 'desert' || planet.kind === 'ice' || planet.kind === 'toxic') {
        // Outside the anchors, only ruins outlast a climate that turned.
        expect(planet.civilization!.state).toBe('gone')
      }
    }
  })

  it('come in every state, mostly still there', () => {
    const count = (state: string) => PEOPLED.filter((p) => p.civilization!.state === state).length
    for (const state of ['thriving', 'fading', 'gone', 'transcended']) expect(count(state)).toBeGreaterThan(10)
    expect(count('thriving')).toBeGreaterThan(count('transcended'))
  })

  it('light their worlds only while they are there, and leave ruins once gone', () => {
    for (const planet of PEOPLED) {
      const civilization = planet.civilization!
      expect(!!planet.preset.lights).toBe(isLit(civilization))
      expect(!!planet.preset.ruins).toBe(civilization.state === 'gone')
      expect(planet.preset.lights?.flicker ?? 0).toBe(civilization.state === 'fading' ? 1 : 0)
      expect(planet.preset.structures).toEqual(civilization.structures)
    }
  })

  it('build what their state allows', () => {
    for (const planet of PEOPLED) {
      const { state, structures, age, since } = planet.civilization!
      expect(age).toBeGreaterThan(0)
      expect(since > 0).toBe(!stillThere(state))
      if (structures.ring) {
        expect(structures.ring.radius).toBeGreaterThan(1.1)
        // Below the closest the camera comes (1.32 radii).
        expect(structures.ring.radius).toBeLessThan(1.3)
        expect(structures.ring.derelict).toBe(state === 'gone')
        expect(structures.ring.tethers > 0).toBe(!structures.ring.derelict)
      }
      if (structures.lattice || structures.swarm) expect(state).toBe('transcended')
      if (state === 'transcended') expect(!!structures.lattice !== !!structures.swarm).toBe(true)
      // A world ringed by its people keeps no rings of its own.
      if (structures.ring || structures.lattice) expect(planet.preset.rings).toBeUndefined()
    }
  })

  it('build at most one arc per star, and the star knows of it', () => {
    for (const galaxy of [2, 3]) {
      for (let star = 0; star < 120; star++) {
        const system = getSystem(galaxy, star)
        const arcs = system.planets.filter((p) => p.civilization?.structures.swarm)
        expect(arcs.length).toBeLessThanOrEqual(1)
        expect(system.swarm).toBe(arcs[0]?.civilization?.structures.swarm ?? null)
      }
    }
  })

  it('leaves the showroom presets lit as they were', () => {
    expect(variedPreset('terrestrial', 11, new Rng(11)).lights).toBeDefined()
    expect(variedPreset('terrestrial', 11, new Rng(11), { civilization: null }).lights).toBeUndefined()
  })
})

describe('describing a people', () => {
  it('says who lived where, and for how long, in plain words', () => {
    for (const { system, planet } of SAMPLE.slice(0, 80)) {
      const text = describePlanet(system, planet)
      expect(text).toContain(planet.civilization!.people)
      expect(text.split(/(?<=\.) /).length).toBeLessThanOrEqual(3)
      expect(text).not.toMatch(/!/)
    }
  })

  it('tells the star which of its worlds holds a people', () => {
    const home = getSystem(HOME[0]!, HOME[1]!)
    expect(describeStar(home)).toMatch(/Ithasal, the fourth, is lit at night\./)
  })

  it('rounds and words long times', () => {
    expect(roundYears(31_234)).toBe(31_000)
    expect(roundYears(987)).toBe(990)
    expect(yearsInWords(9_000)).toBe('about nine thousand years')
    expect(yearsInWords(31_000)).toBe('about thirty-one thousand years')
    expect(yearsInWords(120_000)).toBe('about a hundred and twenty thousand years')
    expect(yearsInWords(900_000)).toBe('about nine hundred thousand years')
    expect(yearsInWords(800)).toBe('about eight hundred years')
    expect(yearsInWords(2_000_000)).toBe('about two million years')
  })
})
