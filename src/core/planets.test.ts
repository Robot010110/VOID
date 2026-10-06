import { describe, expect, it } from 'vitest'
import {
  bandPalette,
  hexToRgb,
  isPlanetKind,
  MOON_SURFACES,
  PLANET_KINDS,
  PRESETS,
  ringProfile,
} from './planets.ts'

const HEX = /^#[0-9a-f]{6}$/i

function coloursOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && value.startsWith('#')) out.push(value)
  else if (Array.isArray(value)) for (const item of value) coloursOf(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) coloursOf(item, out)
  return out
}

describe('PRESETS', () => {
  it('covers every planet type in the brief', () => {
    for (const kind of ['terrestrial', 'ocean', 'desert', 'ice', 'lava', 'toxic', 'barren', 'gas', 'ringed']) {
      expect(isPlanetKind(kind)).toBe(true)
    }
    expect(isPlanetKind('cheese')).toBe(false)
    expect(isPlanetKind(null)).toBe(false)
  })

  for (const kind of PLANET_KINDS) {
    describe(kind, () => {
      const preset = PRESETS[kind]

      it('is keyed by its own kind and has a label', () => {
        expect(preset.kind).toBe(kind)
        expect(preset.label.length).toBeGreaterThan(0)
      })

      it('is either a rocky world or a gas giant, never both', () => {
        const rocky = preset.terrain !== undefined && preset.surface !== undefined
        const gas = preset.gas !== undefined
        expect(rocky !== gas).toBe(true)
      })

      it('uses only valid hex colours', () => {
        for (const colour of coloursOf(preset)) expect(colour).toMatch(HEX)
      })

      it('has physically sensible proportions', () => {
        expect(preset.dayLength).toBeGreaterThan(0)
        expect(Math.abs(preset.tilt)).toBeLessThan(Math.PI / 2)
        expect(preset.framing).toBeGreaterThan(1.5)
        if (preset.atmosphere) {
          expect(preset.atmosphere.thickness).toBeGreaterThan(0)
          expect(preset.atmosphere.thickness).toBeLessThan(0.15)
          expect(preset.atmosphere.rayleighHeight).toBeLessThan(preset.atmosphere.thickness)
          for (const c of preset.atmosphere.rayleigh) expect(c).toBeGreaterThanOrEqual(0)
          expect(preset.atmosphere.mieG).toBeGreaterThanOrEqual(0)
          expect(preset.atmosphere.mieG).toBeLessThan(1)
        }
        if (preset.rings) {
          expect(preset.rings.inner).toBeGreaterThan(1 + (preset.atmosphere?.thickness ?? 0))
          expect(preset.rings.outer).toBeGreaterThan(preset.rings.inner)
        }
        for (const moon of preset.moons) {
          expect(moon.radius).toBeLessThan(0.5)
          // Clear of the planet, and of any rings.
          expect(moon.distance).toBeGreaterThan(Math.max(1, preset.rings?.outer ?? 0) + moon.radius)
          expect(moon.period).toBeGreaterThan(0)
        }
      })
    })
  }

  it('gives every preset its own seed', () => {
    const seeds = new Set(PLANET_KINDS.map((kind) => PRESETS[kind].seed))
    expect(seeds.size).toBe(PLANET_KINDS.length)
  })

  it('keeps the airless moon surfaces dry and dark at night', () => {
    for (const body of Object.values(MOON_SURFACES)) {
      expect(body.surface.seaLevel).toBeLessThan(-1)
      expect(body.surface.emissiveStrength).toBe(0)
    }
  })
})

describe('ringProfile', () => {
  const rings = PRESETS.ringed.rings!

  it('is deterministic for a seed', () => {
    expect(Array.from(ringProfile(rings, 42, 256))).toEqual(Array.from(ringProfile(rings, 42, 256)))
    expect(Array.from(ringProfile(rings, 42, 256))).not.toEqual(Array.from(ringProfile(rings, 43, 256)))
  })

  it('returns density and tint pairs in [0, 1]', () => {
    const profile = ringProfile(rings, 7, 512)
    expect(profile.length).toBe(1024)
    for (const value of profile) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('thins towards its inner and outer edges', () => {
    const profile = ringProfile(rings, 7, 512)
    const density = (i: number) => profile[i * 2]!
    expect(density(0)).toBeLessThan(0.05)
    expect(density(511)).toBeLessThan(0.05)
    let middle = 0
    for (let i = 200; i < 312; i++) middle = Math.max(middle, density(i))
    expect(middle).toBeGreaterThan(0.4)
  })
})

describe('bandPalette', () => {
  const gas = PRESETS.gas.gas!

  it('is deterministic and stays inside the colour cube', () => {
    const a = bandPalette(gas, 9, 128)
    expect(Array.from(a)).toEqual(Array.from(bandPalette(gas, 9, 128)))
    expect(a.length).toBe(128 * 3)
    for (const value of a) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('draws every band from the preset palette', () => {
    const palette = gas.palette.map(hexToRgb)
    const colours = bandPalette(gas, 3, 256)
    // Away from the soft edges, each latitude takes one palette colour exactly.
    let exact = 0
    for (let i = 0; i < 256; i++) {
      const rgb = [colours[i * 3]!, colours[i * 3 + 1]!, colours[i * 3 + 2]!]
      if (palette.some((p) => p.every((c, k) => Math.abs(c - rgb[k]!) < 1e-6))) exact++
    }
    expect(exact / 256).toBeGreaterThan(0.6)
  })
})

describe('hexToRgb', () => {
  it('parses sRGB hex into [0, 1] components', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(hexToRgb('#03040b')).toEqual([3 / 255, 4 / 255, 11 / 255])
  })
})
