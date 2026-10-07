import { describe, expect, it } from 'vitest'
import { describePlanet, describeStar } from './describe.ts'
import { Rng } from './rng.ts'
import {
  generateStar,
  generateSystem,
  getSystem,
  HOME,
  isGiant,
  levelOf,
  orbitPosition,
  shade,
  SYSTEM_EXTENT,
  variedPreset,
  type SystemData,
} from './universe.ts'

const HEX = /^#[0-9a-f]{6}$/i

function coloursOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && value.startsWith('#')) out.push(value)
  else if (Array.isArray(value)) for (const item of value) coloursOf(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) coloursOf(item, out)
  return out
}

const SAMPLE: SystemData[] = Array.from({ length: 60 }, (_, i) => generateSystem(i % 4, i))

describe('levelOf', () => {
  it('reads the level from the depth of a path', () => {
    expect(levelOf([])).toBe('universe')
    expect(levelOf([3])).toBe('galaxy')
    expect(levelOf(HOME)).toBe('system')
    expect(levelOf([...HOME, 2])).toBe('planet')
  })
})

describe('orbitPosition', () => {
  const orbit = { radius: 50, period: 100, phase: 0.4, inclination: 0.04, node: 1.1 }

  it('stays on the orbit and comes back after one period', () => {
    const a = orbitPosition(orbit, 12)
    expect(Math.hypot(...a)).toBeCloseTo(50, 6)
    const b = orbitPosition(orbit, 112)
    for (let i = 0; i < 3; i++) expect(b[i]).toBeCloseTo(a[i]!, 6)
  })

  it('lies in the system plane without inclination', () => {
    const flat = { ...orbit, inclination: 0 }
    for (let t = 0; t < 100; t += 7) expect(orbitPosition(flat, t)[1]).toBeCloseTo(0, 9)
  })
})

describe('generateSystem', () => {
  it('is deterministic for a galaxy and index', () => {
    expect(generateSystem(1, 17)).toEqual(generateSystem(1, 17))
    expect(generateSystem(1, 17)).not.toEqual(generateSystem(1, 18))
    expect(generateSystem(1, 17)).not.toEqual(generateSystem(2, 17))
  })

  it('remembers systems it has generated', () => {
    expect(getSystem(0, 3)).toBe(getSystem(0, 3))
  })

  it('makes stars across the real range, mostly cool ones', () => {
    const temperatures = SAMPLE.map((s) => s.star.temperature)
    for (const t of temperatures) {
      expect(t).toBeGreaterThanOrEqual(2900)
      expect(t).toBeLessThanOrEqual(22000)
    }
    const cool = temperatures.filter((t) => t < 5200).length
    expect(cool / temperatures.length).toBeGreaterThan(0.5)
  })

  for (const system of SAMPLE.slice(0, 20)) {
    describe(`system ${system.path.join(':')} (${system.star.name})`, () => {
      it('spaces its orbits outward from a safe distance to the edge', () => {
        const radii = system.planets.map((p) => p.orbit.radius)
        expect(radii[0]).toBeGreaterThanOrEqual(system.star.radius * 5)
        for (let i = 1; i < radii.length; i++) expect(radii[i]! / radii[i - 1]!).toBeGreaterThan(1.2)
        expect(radii[radii.length - 1]).toBeLessThanOrEqual(SYSTEM_EXTENT)
        expect(radii[radii.length - 1]).toBeGreaterThan(SYSTEM_EXTENT * 0.9)
      })

      it("follows Kepler's third law", () => {
        const constants = system.planets.map((p) => p.orbit.period / p.orbit.radius ** 1.5)
        for (const c of constants) expect(c).toBeCloseTo(constants[0]!, 6)
      })

      it('keeps every moon clear of its planet, its rings and its neighbours', () => {
        system.planets.forEach((planet, i) => {
          const neighbour = Math.min(
            i > 0 ? planet.orbit.radius - system.planets[i - 1]!.orbit.radius : Infinity,
            i < system.planets.length - 1 ? system.planets[i + 1]!.orbit.radius - planet.orbit.radius : Infinity,
          )
          for (const moon of planet.preset.moons) {
            expect(moon.distance).toBeGreaterThan(Math.max(1, planet.preset.rings?.outer ?? 0) + moon.radius)
            expect((moon.distance + moon.radius) * planet.radius).toBeLessThan(neighbour * 0.45)
          }
        })
      })

      it('places worlds in the temperature zone that suits them', () => {
        for (const planet of system.planets) {
          const zone = planet.orbit.radius / system.habitable
          if (planet.kind === 'lava') expect(zone).toBeLessThan(0.55)
          if (isGiant(planet.kind)) expect(zone).toBeGreaterThan(1.35)
        }
      })

      it('lights at most one world', () => {
        expect(system.planets.filter((p) => p.preset.lights).length).toBeLessThanOrEqual(1)
      })

      it('names every place uniquely and cleanly', () => {
        const names = [system.star.name, ...system.planets.map((p) => p.name)]
        expect(new Set(names).size).toBe(names.length)
        for (const name of names.slice(1)) expect(name).toMatch(/^[A-Z][a-z]{3,8}$/)
        expect(system.star.name).toMatch(system.star.catalogued ? /^[A-Z]{2}-\d{1,3}$/ : /^[A-Z][a-z]{1,6}$/)
      })

      it('draws every world from a valid preset', () => {
        for (const planet of system.planets) {
          const { preset } = planet
          expect(preset.kind).toBe(planet.kind)
          expect(preset.seed).toBe(planet.seed)
          for (const colour of coloursOf(preset)) expect(colour).toMatch(HEX)
          expect((preset.terrain !== undefined) !== (preset.gas !== undefined)).toBe(true)
          if (preset.rings) {
            expect(preset.rings.inner).toBeGreaterThan(1 + (preset.atmosphere?.thickness ?? 0))
            expect(preset.rings.outer).toBeGreaterThan(preset.rings.inner)
            expect(preset.framing).toBeGreaterThan(preset.rings.outer * 2)
          }
          expect(planet.light).toBeGreaterThan(0.5)
          expect(planet.light).toBeLessThanOrEqual(1)
        }
      })

      it('describes its star and worlds in two or three plain sentences', () => {
        const texts = [describeStar(system), ...system.planets.map((p) => describePlanet(system, p))]
        for (const text of texts) {
          const sentences = text.split(/(?<=\.)\s+/)
          expect(sentences.length).toBeGreaterThanOrEqual(2)
          expect(sentences.length).toBeLessThanOrEqual(3)
          for (const sentence of sentences) expect(sentence).toMatch(/^[A-Z].*\.$/)
          expect(text).not.toMatch(/undefined|NaN|null|!/)
          expect(text.split(/\s+/).length).toBeLessThanOrEqual(60)
        }
      })
    })
  }

  it('balances small and large systems', () => {
    const counts = SAMPLE.map((s) => s.planets.length)
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(3)
    expect(Math.max(...counts)).toBeLessThanOrEqual(8)
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length
    expect(mean).toBeGreaterThan(4.5)
    expect(mean).toBeLessThan(6.5)
  })
})

describe('the home system', () => {
  const home = getSystem(HOME[0]!, HOME[1]!)

  it('shows the range of worlds', () => {
    const kinds = home.planets.map((p) => p.kind)
    expect(home.planets.length).toBeGreaterThanOrEqual(6)
    expect(kinds).toContain('terrestrial')
    expect(kinds).toContain('gas')
    expect(kinds).toContain('ringed')
    expect(home.belts.length).toBe(1)
  })

  it('has a lit temperate world nearest the habitable zone', () => {
    const lit = home.planets.filter((p) => p.preset.lights)
    expect(lit.length).toBe(1)
    expect(lit[0]!.kind).toBe('terrestrial')
    expect(lit[0]!.light).toBe(1)
  })

  it('circles a calm, sun-like star', () => {
    expect(home.star.temperature).toBeGreaterThan(5400)
    expect(home.star.temperature).toBeLessThan(6000)
    expect(describeStar(home)).toMatch(/^A yellow star/)
  })

  it('keeps the names visitors already know', () => {
    expect(home.star.name).toBe('Vileth')
    expect(home.star.catalogued).toBe(false)
    expect(home.planets.map((p) => p.name)).toEqual([
      'Eleth', 'Sithaen', 'Indith', 'Ithasal', 'Virlithe', 'Veni', 'Leilel', 'Lilaer',
    ])
  })
})

describe('generateStar', () => {
  it('draws the same star its system is built around', () => {
    for (let i = 0; i < 40; i++) expect(generateStar(i % 3, i)).toEqual(getSystem(i % 3, i).star)
  })

  it('catalogues unremarkable stars only', () => {
    const stars = Array.from({ length: 400 }, (_, i) => generateStar(0, i))
    const catalogued = stars.filter((star) => star.catalogued)
    expect(catalogued.length / stars.length).toBeGreaterThan(0.25)
    expect(catalogued.length / stars.length).toBeLessThan(0.6)
    for (const star of catalogued) expect(star.temperature).toBeLessThanOrEqual(7200)
    expect(stars[0]!.catalogued).toBe(false)
  })
})

describe('variedPreset', () => {
  it('varies a preset by seed but keeps its character', () => {
    const a = variedPreset('terrestrial', 11, new Rng(11))
    const b = variedPreset('terrestrial', 12, new Rng(12))
    expect(a).not.toEqual(b)
    expect(a.terrain!.style).toBe('continents')
    expect(a.surface!.seaLevel).toBe(0)
    expect(a.lights).toBeDefined()
    expect(variedPreset('terrestrial', 11, new Rng(11), { civilization: null }).lights).toBeUndefined()
  })
})

describe('shade', () => {
  it('scales brightness and clamps to valid hex', () => {
    expect(shade('#808080', 1)).toBe('#808080')
    expect(shade('#808080', 0.5)).toBe('#404040')
    expect(shade('#ffffff', 2)).toBe('#ffffff')
    expect(shade('#000000', 1.4)).toBe('#000000')
  })
})
