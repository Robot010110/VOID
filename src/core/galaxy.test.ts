import { describe, expect, it } from 'vitest'
import {
  armAngle,
  crestAngle,
  galacticPosition,
  GALAXY_RADIUS,
  generateGalaxy,
  getGalaxy,
  lobedRadius,
  nebulaPosition,
  orbitalSpeed,
  systemOrientation,
} from './galaxy.ts'
import { getUniverse } from './cosmos.ts'
import { GalaxyParticleJob, LAYER_SHARE, particleCounts } from './galaxyParticles.ts'
import { HOME_BAND } from './sky.ts'
import { generateStar, getSystem, HOME } from './universe.ts'

const home = getGalaxy(HOME[0]!)
const SAMPLE = Array.from({ length: 8 }, (_, i) => generateGalaxy(i))
const SPIRALS = SAMPLE.filter((g) => g.kind === 'spiral' || g.kind === 'barred')
/** The first galaxy of each kind in the universe. */
const firstOf = (kind: string) => getGalaxy(getUniverse().galaxies.find((g) => g.kind === kind)!.index)
const elliptical = firstOf('elliptical')
const irregular = firstOf('irregular')

function apply(m: readonly number[], v: readonly number[]): number[] {
  return [0, 1, 2].map((i) => m[i * 3]! * v[0]! + m[i * 3 + 1]! * v[1]! + m[i * 3 + 2]! * v[2]!)
}

describe('generateGalaxy', () => {
  it('is deterministic', () => {
    expect(generateGalaxy(3)).toEqual(generateGalaxy(3))
    expect(getGalaxy(2)).toBe(getGalaxy(2))
  })

  it('makes each galaxy the kind the universe gave it', () => {
    for (const galaxy of SAMPLE) expect(galaxy.kind).toBe(getUniverse().galaxies[galaxy.index]!.kind)
    expect(new Set(SAMPLE.map((g) => g.kind)).size).toBeGreaterThan(2)
  })

  it('makes varied spirals of two to five arms', () => {
    expect(SPIRALS.length).toBeGreaterThan(2)
    const arms = new Set(SPIRALS.map((g) => g.shape.arms))
    expect(arms.size).toBeGreaterThan(1)
    for (const galaxy of SPIRALS) {
      const { shape } = galaxy
      expect(shape.arms).toBeGreaterThanOrEqual(2)
      expect(shape.arms).toBeLessThanOrEqual(5)
      expect(shape.radius).toBeGreaterThan(GALAXY_RADIUS * 0.85)
      expect(shape.radius).toBeLessThan(GALAXY_RADIUS * 1.1)
      // Orbits crowd into arms but never cross one another.
      const crowding = shape.armEccentricity * Math.hypot(1, shape.arms / Math.tan(shape.pitch))
      expect(crowding).toBeLessThan(0.9)
      expect(crowding).toBeGreaterThan(0.6)
    }
  })

  it('offers a few hundred stars to visit, spread through the galaxy', () => {
    for (const galaxy of SAMPLE) {
      expect(galaxy.stars.length).toBeGreaterThanOrEqual(galaxy.kind === 'irregular' ? 150 : 200)
      expect(galaxy.stars.length).toBeLessThanOrEqual(340)
      galaxy.stars.forEach((s, i) => {
        expect(s.index).toBe(i)
        const [x, y, z] = galacticPosition(galaxy, s.orbit, 0)
        expect(Math.hypot(x, y, z)).toBeLessThan(galaxy.shape.radius * 1.1)
        if (galaxy.kind === 'spiral' || galaxy.kind === 'barred') expect(s.orbit.radius).toBeGreaterThan(galaxy.shape.armStart)
      })
      const notable = galaxy.stars.filter((s) => s.notable)
      expect(notable.length).toBeGreaterThanOrEqual(8)
      expect(notable.length).toBeLessThanOrEqual(12)
      for (const s of notable) expect(s.star.catalogued).toBe(false)
    }
  })

  it("draws each star as its own system's star", () => {
    for (const s of home.stars.slice(0, 12)) expect(s.star).toEqual(generateStar(home.index, s.index))
    expect(home.stars[HOME[1]!]!.star).toEqual(getSystem(HOME[0]!, HOME[1]!).star)
  })

  it('keeps visited stars apart', () => {
    const at = home.stars.map((s) => galacticPosition(home, s.orbit, 0))
    let closest = Infinity
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const [a, b] = [at[i]!, at[j]!]
        closest = Math.min(closest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
      }
    }
    expect(closest).toBeGreaterThan(1.5)
  })

  it('names the home galaxy with a title, like Amaru Veil', () => {
    expect(home.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect(home.stars[0]!.notable).toBe(true)
  })

  it('places nebulae in the arms', () => {
    for (const galaxy of SPIRALS) {
      expect(galaxy.nebulae.length).toBeGreaterThanOrEqual(5)
      for (const nebula of galaxy.nebulae) {
        expect(nebula.radius).toBeGreaterThan(galaxy.shape.armStart)
        expect(Math.abs(nebula.offset)).toBeLessThan(0.3)
      }
    }
  })
})

describe('ellipticals and irregulars', () => {
  it('gives an elliptical no arms, no dust and no nebulae, and a slow turn', () => {
    expect(elliptical.shape.arms).toBe(0)
    expect(elliptical.light.dust).toBe(0)
    expect(elliptical.nebulae).toEqual([])
    expect(elliptical.motion.speed).toBeLessThan(home.motion.speed * 0.5)
    expect(particleCounts(200000, 'elliptical').dust).toBe(0)
  })

  it('fills an elliptical from the heart out, flattened by its axis ratio', () => {
    const { light } = new GalaxyParticleJob(elliptical, 20000).run()
    const R = elliptical.shape.radius
    let inner = 0
    let maxHeight = 0
    let maxAcross = 0
    for (let i = 0; i < light.count; i++) {
      const a = light.orbit[i * 4]!
      const y = Math.abs(light.orbit[i * 4 + 2]!)
      if (Math.hypot(a, y) < R * 0.25) inner++
      maxHeight = Math.max(maxHeight, y)
      maxAcross = Math.max(maxAcross, a)
    }
    // A Hernquist swarm: about half of it within a quarter of the radius.
    expect(inner / light.count).toBeGreaterThan(0.35)
    expect(maxHeight / maxAcross).toBeLessThan(elliptical.shape.flattening + 0.05)
  })

  it('gives an irregular complexes that turn with it, and nebulae on the largest', () => {
    const form = irregular.irregular!
    expect(form.clumps.length).toBeGreaterThanOrEqual(6)
    expect(irregular.nebulae.length).toBeGreaterThanOrEqual(2)
    const largest = [...form.clumps].sort((a, b) => b.weight - a.weight)[0]!
    const [x, , z] = nebulaPosition(irregular, irregular.nebulae[0]!, 0)
    expect(Math.hypot(x - largest.x, z - largest.z)).toBeLessThan(1e-6)
    // Everything turns at the pattern's speed, so the clumps keep their shape.
    const { light } = new GalaxyParticleJob(irregular, 8000).run()
    for (let i = 0; i < light.count; i++) expect(light.shape[i * 4 + 3]).toBe(1)
  })

  it('keeps every particle of every kind finite and inside its galaxy', () => {
    for (const galaxy of [elliptical, irregular]) {
      const job = new GalaxyParticleJob(galaxy, 12000).run()
      let bad = 0
      for (const set of [job.light, job.sparkle, job.dust]) {
        for (let i = 0; i < set.count; i++) {
          const a = set.orbit[i * 4]!
          const y = set.orbit[i * 4 + 2]!
          if (!Number.isFinite(a) || !Number.isFinite(y) || Math.hypot(a, y) > galaxy.shape.radius * 1.4) bad++
          if (!(set.shape[i * 4]! > 0) || !(set.shape[i * 4 + 1]! >= 0)) bad++
        }
      }
      expect(bad).toBe(0)
    }
  })
})

describe('galactic motion', () => {
  it('turns faster inside than outside, all in the same sense', () => {
    const inner = orbitalSpeed(home.motion, 40)
    const outer = orbitalSpeed(home.motion, 180)
    expect(inner).toBeGreaterThan(outer)
    expect(outer).toBeGreaterThan(0)
    // The middle of the disc turns once in roughly twenty-five minutes at 1x.
    const period = (Math.PI * 2) / orbitalSpeed(home.motion, 100)
    expect(period).toBeGreaterThan(1200)
    expect(period).toBeLessThan(1800)
  })

  it('keeps a star on its orbit, give or take its lobes', () => {
    const star = home.stars[5]!
    for (const t of [0, 100, 1000, 54321]) {
      const [x, y, z] = galacticPosition(home, star.orbit, t)
      const r = Math.hypot(x, z)
      expect(Math.abs(r - star.orbit.radius)).toBeLessThan(star.orbit.radius * 0.2)
      expect(y).toBe(star.orbit.height)
    }
  })

  it('crowds orbits along the arms', () => {
    // Where the arm crosses a ring of radius r, orbits from just inside and just outside
    // land closer together than anywhere else around the ring.
    const { shape } = home
    const a = shape.radius * 0.5
    const gapAt = (phi: number) => lobedRadius(shape, a + 0.5, phi, 0) - lobedRadius(shape, a - 0.5, phi, 0)
    const crest = armAngle(shape, a)
    const away = crest + Math.PI / shape.arms
    expect(gapAt(crest)).toBeLessThan(gapAt(away) * 0.5)
  })

  it('carries nebulae around with their arm', () => {
    const nebula = home.nebulae[0]!
    for (const t of [0, 500, 5000]) {
      const [x, , z] = nebulaPosition(home, nebula, t)
      const angle = Math.atan2(-z, x)
      const crest = crestAngle(home, nebula.arm, nebula.radius, t) + nebula.offset
      const d = Math.atan2(Math.sin(angle - crest), Math.cos(angle - crest))
      expect(Math.abs(d)).toBeLessThan(1e-6)
    }
  })
})

describe('systemOrientation', () => {
  const position: [number, number, number] = [60, 0.4, -90]
  const m = systemOrientation(position)

  it('is a proper rotation', () => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dot = m[i * 3]! * m[j * 3]! + m[i * 3 + 1]! * m[j * 3 + 1]! + m[i * 3 + 2]! * m[j * 3 + 2]!
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 9)
      }
    }
    const det =
      m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
    expect(det).toBeCloseTo(1, 9)
  })

  it("lays the sky's band in the galactic plane, its core towards the centre", () => {
    const pole = apply(m, HOME_BAND.pole)
    expect(pole[0]).toBeCloseTo(0, 9)
    expect(pole[1]).toBeCloseTo(1, 9)
    expect(pole[2]).toBeCloseTo(0, 9)
    const core = apply(m, HOME_BAND.core)
    const length = Math.hypot(position[0], position[2])
    expect(core[0]).toBeCloseTo(-position[0] / length, 9)
    expect(core[1]).toBeCloseTo(0, 9)
    expect(core[2]).toBeCloseTo(-position[2] / length, 9)
  })

  it('tilts systems about 25 degrees against the galactic plane', () => {
    const north = apply(m, [0, 1, 0])
    const tilt = (Math.acos(north[1]!) * 180) / Math.PI
    expect(tilt).toBeGreaterThan(15)
    expect(tilt).toBeLessThan(35)
  })
})

describe('GalaxyParticleJob', () => {
  const whole = new GalaxyParticleJob(home, 20000).run()

  it('splits each tier into light, sparkle and a capped share of dust', () => {
    expect(particleCounts(400000)).toEqual({ light: 304000, sparkle: 36000, dust: 34000 })
    expect(particleCounts(80000)).toEqual({ light: 60800, sparkle: 7200, dust: 12000 })
    // The universe draws each galaxy from a few thousand: dust keeps its share.
    expect(particleCounts(6000)).toEqual({ light: 4560, sparkle: 540, dust: 900 })
  })

  it('needs no runs for the universe, which sorts each particle in its shader', () => {
    const plain = new GalaxyParticleJob(home, 6000, { grouped: false }).run()
    expect(plain.groups).toBeNull()
    // The same particles, only in natural order: the same light in total.
    const sum = (set: { shape: Float32Array; count: number }) => {
      let total = 0
      for (let i = 0; i < set.count; i++) total += set.shape[i * 4 + 1]!
      return total
    }
    const grouped = new GalaxyParticleJob(home, 6000).run()
    expect(sum(plain.light)).toBeCloseTo(sum(grouped.light), 0)
  })

  it('gives the same particles however it is chunked', () => {
    const chunked = new GalaxyParticleJob(home, 20000)
    let steps = 0
    while (!chunked.done) {
      chunked.step(997)
      steps++
    }
    expect(steps).toBeGreaterThan(10)
    // Compared byte for byte: deep equality on typed arrays this long is slow.
    const same = (a: ArrayBufferView, b: ArrayBufferView) => {
      const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
      const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
      return x.length === y.length && x.every((value, i) => value === y[i])
    }
    for (const set of ['light', 'sparkle', 'dust'] as const) {
      expect(same(chunked[set].orbit, whole[set].orbit)).toBe(true)
      expect(same(chunked[set].shape, whole[set].shape)).toBe(true)
      expect(same(chunked[set].colour, whole[set].colour)).toBe(true)
    }
    expect(chunked.groups).toEqual(whole.groups)
  })

  it('stores the light in runs below, inside and above the dust layer', () => {
    const { light, groups } = whole
    expect(groups).not.toBeNull()
    const runs = groups!
    expect(runs.below.count + runs.inside.count + runs.above.count).toBe(light.count)
    expect(runs.inside.start).toBe(runs.below.count)
    expect(runs.above.start).toBe(runs.below.count + runs.inside.count)
    const layer = home.shape.thickness * LAYER_SHARE
    let wrong = 0
    for (let i = 0; i < light.count; i++) {
      const y = light.orbit[i * 4 + 2]!
      const run = i < runs.inside.start ? 'below' : i < runs.above.start ? 'inside' : 'above'
      if ((run === 'below' && y >= -layer) || (run === 'above' && y <= layer) || (run === 'inside' && Math.abs(y) > layer)) wrong++
    }
    expect(wrong).toBe(0)
  })

  it('fills both sides of the plane alike', () => {
    const { light } = whole
    let above = 0
    for (let i = 0; i < light.count; i++) if (light.orbit[i * 4 + 2]! > 0) above++
    expect(above / light.count).toBeGreaterThan(0.45)
    expect(above / light.count).toBeLessThan(0.55)
  })

  it('keeps every particle finite and inside the galaxy', () => {
    let bad = 0
    for (const set of [whole.light, whole.sparkle, whole.dust]) {
      for (let i = 0; i < set.count; i++) {
        const a = set.orbit[i * 4]!
        if (!Number.isFinite(a) || a > home.shape.radius * 1.2) bad++
        if (!(set.shape[i * 4]! > 0) || !(set.shape[i * 4 + 1]! > 0)) bad++
      }
    }
    expect(bad).toBe(0)
  })

  it('is brightest per area at the centre, like a real disc', () => {
    const { light } = whole
    const R = home.shape.radius
    let inner = 0
    let outer = 0
    for (let i = 0; i < light.count; i++) {
      const a = light.orbit[i * 4]!
      if (a < R * 0.25) inner += light.shape[i * 4 + 1]!
      else if (a > R * 0.75) outer += light.shape[i * 4 + 1]!
    }
    const innerArea = Math.PI * (R * 0.25) ** 2
    const outerArea = Math.PI * (R * R - (R * 0.75) ** 2)
    expect(inner / innerArea).toBeGreaterThan((outer / outerArea) * 4)
  })

  it('crowds the old disc onto the arms', () => {
    // Around a ring at mid radius, more disc light lies near an arm's crest than between arms.
    const { light } = whole
    let onArm = 0
    let between = 0
    const shape = home.shape
    for (let i = 0; i < light.count; i++) {
      if (light.shape[i * 4 + 3]! > 0 || light.shape[i * 4 + 2]! > 0) continue
      const orbit = { radius: light.orbit[i * 4]!, phase: light.orbit[i * 4 + 1]!, height: 0, scatter: light.orbit[i * 4 + 3]! }
      const [x, , z] = galacticPosition(home, orbit, 0)
      const r = Math.hypot(x, z)
      if (r < 85 || r > 115) continue
      const d = Math.atan2(-z, x) - armAngle(shape, r)
      const phase = Math.cos(d * shape.arms)
      if (phase > 0.7) onArm++
      else if (phase < -0.7) between++
    }
    expect(onArm).toBeGreaterThan(between * 2)
  })
})

describe('the home galaxy', () => {
  it('is a barred two-armed spiral with the home star in its disc', () => {
    expect(home.shape.arms).toBe(2)
    expect(home.shape.bar).toBeGreaterThan(0)
    const [x, , z] = galacticPosition(home, home.stars[HOME[1]!]!.orbit, 0)
    const r = Math.hypot(x, z)
    expect(r).toBeGreaterThan(home.shape.radius * 0.45)
    expect(r).toBeLessThan(home.shape.radius * 0.7)
  })

  it('prints its name', () => {
    console.log(home.name, home.stars.length, home.stars.filter((s) => s.notable).map((s) => s.star.name).join(', '))
    console.log(home.stars.slice(0, 20).map((s) => s.star.name).join(', '))
  })
})
