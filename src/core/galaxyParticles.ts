/**
 * The particles that draw a galaxy, generated on the CPU into typed arrays: the brief's
 * spiral (arm angle, a twist that grows with radius, scatter that widens outward, a disc
 * that thins towards its edge, a dense warm bulge) expressed as galactic orbits, so the
 * vertex shader can move every particle without any work per frame here.
 *
 * Each particle's randomness is a pure function of the galaxy's seed and the particle's
 * index, so particles can be generated in any order, and in chunks spread over frames (an
 * ascent into a galaxy never stalls), with identical results.
 *
 * Populations:
 * - bulge: old warm stars in a flattened sphere;
 * - disc: old yellow-white stars, crowded into the arms by their orbits;
 * - young: blue-white stars, bright only while they pass through an arm;
 * - knots: pink star-forming clumps riding the arms (Aurora-tinted, as the brief asks);
 * - dust: dark clouds along the inner edges of the arms (a separate set, drawn with normal
 *   blending between the far and near halves of the light).
 *
 * The light is split by side: particles in the first half lie above the galaxy's plane and
 * those in the second half below it, so the scene can draw the half beyond the dust first
 * and the half in front of it last.
 */
import { blackbody } from './blackbody.ts'
import { armAngle, lobedRadius, type GalaxyData } from './galaxy.ts'
import { hashSeed, mix32 } from './rng.ts'

/** Share of a tier's particles that make light; the rest are dust (up to a cap). */
const LIGHT_SHARE = 0.85
const DUST_SHARE = 0.15
const DUST_MIN = 9000
const DUST_MAX = 34000

/** Counts the sizes and brightnesses are tuned at (the Medium tier). */
const REFERENCE_LIGHT = 170000
const REFERENCE_DUST = 30000

export interface ParticleSet {
  readonly count: number
  /** Per particle: mean orbit radius, angle at time zero, height, radial scatter. */
  readonly orbit: Float32Array
  /**
   * Per particle: size (gaussian radius, galaxy units), light (or opacity, for dust), how
   * sharply the arms gate it (0 never, higher is narrower), and 1 if it turns with the arms
   * rather than at its own orbital speed.
   */
  readonly shape: Float32Array
  /** Per particle: linear colour, 0 to 255 per channel, brightest channel full. */
  readonly colour: Uint8Array
}

function createSet(count: number): ParticleSet {
  return {
    count,
    orbit: new Float32Array(count * 4),
    shape: new Float32Array(count * 4),
    colour: new Uint8Array(count * 4),
  }
}

export function particleCounts(total: number): { light: number; dust: number } {
  const dust = Math.round(Math.min(DUST_MAX, Math.max(DUST_MIN, total * DUST_SHARE)))
  // An even count, so the halves above and below the plane are the same size.
  const light = Math.round((total * LIGHT_SHARE) / 2) * 2
  return { light, dust }
}

/** Uniform in [0, 1): the k-th random number of particle i. */
function unit(seed: number, i: number, k: number): number {
  return mix32((seed ^ Math.imul(i + 1, 0x9e3779b1)) + Math.imul(k + 1, 0x85ebca77)) / 4294967296
}

function gauss(seed: number, i: number, k: number): number {
  const u = 1 - unit(seed, i, k)
  const v = unit(seed, i, k + 1)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

/** A gamma(2) radius (an exponential disc) between `min` and `max`, by inversion of the tail. */
function discRadius(seed: number, i: number, k: number, scale: number, min: number, max: number): number {
  for (let tries = 0; tries < 8; tries++) {
    const r = -scale * Math.log(Math.max(1e-9, (1 - unit(seed, i, k + tries * 2)) * (1 - unit(seed, i, k + tries * 2 + 1))))
    if (r >= min && r <= max) return r
  }
  return min + (max - min) * unit(seed, i, k + 17)
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function hexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

/** Hydrogen-alpha pink shading into Aurora violet: the colours of star-forming gas. */
const KNOT_PINK = hexToLinear('#ff6f9a')
const KNOT_VIOLET = hexToLinear('#b07cff')

function writeColour(set: ParticleSet, i: number, rgb: readonly [number, number, number]) {
  const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-6)
  set.colour[i * 4] = Math.round((rgb[0] / peak) * 255)
  set.colour[i * 4 + 1] = Math.round((rgb[1] / peak) * 255)
  set.colour[i * 4 + 2] = Math.round((rgb[2] / peak) * 255)
  set.colour[i * 4 + 3] = 255
}

interface Knot {
  /** Centre at time zero, in the galaxy's plane. */
  readonly x: number
  readonly z: number
  readonly size: number
}

/**
 * Star-forming knots: compact clumps just downstream of the arms' crests. They turn with
 * the arms, which is the same as saying new ones keep forming where old ones fade.
 */
function knotsOf(galaxy: GalaxyData): Knot[] {
  const seed = hashSeed(galaxy.seed, 0x6b07)
  const { shape } = galaxy
  return Array.from({ length: 260 }, (_, k) => {
    const arm = Math.floor(unit(seed, k, 0) * shape.arms)
    const radius = discRadius(seed, k, 1, shape.radius * 0.45, shape.armStart * 1.15, shape.radius * 0.95)
    const phi =
      armAngle(shape, radius) + (arm * Math.PI * 2) / shape.arms + (0.12 + gauss(seed, k, 20) * 0.08) / shape.arms
    const r = lobedRadius(shape, radius, phi, 0)
    return { x: r * Math.cos(phi), z: -r * Math.sin(phi), size: 0.45 * Math.exp(gauss(seed, k, 22) * 0.45) }
  })
}

/**
 * Builds a galaxy's particles a chunk at a time. `step` fills the next particles and reports
 * which set and range it filled, so the scene can upload just that range.
 */
export class GalaxyParticleJob {
  readonly light: ParticleSet
  readonly dust: ParticleSet
  private next = 0
  private readonly galaxy: GalaxyData
  private readonly seed: number
  private readonly knots: Knot[]
  private readonly lightScale: number
  private readonly dustScale: number

  constructor(galaxy: GalaxyData, total: number) {
    this.galaxy = galaxy
    const counts = particleCounts(total)
    this.light = createSet(counts.light)
    this.dust = createSet(counts.dust)
    this.seed = hashSeed(galaxy.seed, 0x9a41)
    this.knots = knotsOf(galaxy)
    // Fewer particles are drawn larger and brighter, so every tier shows the same galaxy.
    this.lightScale = REFERENCE_LIGHT / counts.light
    this.dustScale = REFERENCE_DUST / counts.dust
  }

  get done(): boolean {
    return this.next >= this.light.count + this.dust.count
  }

  /** Share generated so far, 0 to 1. */
  get progress(): number {
    return this.next / (this.light.count + this.dust.count)
  }

  /** Fill up to `count` more particles. */
  step(count: number): { set: ParticleSet; start: number; end: number } | null {
    const total = this.light.count
    if (this.done) return null
    if (this.next < total) {
      const start = this.next
      const end = Math.min(total, start + count)
      for (let i = start; i < end; i++) this.fillLight(i)
      this.next = end
      return { set: this.light, start, end }
    }
    const start = this.next - total
    const end = Math.min(this.dust.count, start + count)
    for (let i = start; i < end; i++) this.fillDust(i)
    this.next = end + total
    return { set: this.dust, start, end }
  }

  /** Everything at once (tests, and a galaxy opened as the first thing seen). */
  run(): this {
    while (!this.done) this.step(1 << 16)
    return this
  }

  private fillLight(i: number) {
    const { galaxy, seed } = this
    const { shape, light } = galaxy
    const set = this.light
    const side = i < set.count / 2 ? 1 : -1
    const sizeScale = Math.sqrt(this.lightScale)
    const roll = unit(seed, i, 0)
    let a: number
    let phase: number
    let height: number
    let scatter = 0
    let size: number
    let brightness: number
    let gate = 0
    let turnsWithArms = 0
    let colour: [number, number, number]

    if (roll < 0.14) {
      // Bulge: a flattened sphere of old warm stars, densest at the centre.
      const r = shape.bulge * 0.62 * -Math.log(Math.max(1e-9, (1 - unit(seed, i, 1)) * (1 - unit(seed, i, 2))))
      const cosTheta = unit(seed, i, 3) * 2 - 1
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta)
      const phi = unit(seed, i, 4) * Math.PI * 2
      a = r * sinTheta
      phase = phi
      height = side * Math.abs(r * cosTheta * shape.flattening)
      size = 1.15 * sizeScale * (0.8 + 0.5 * unit(seed, i, 5))
      brightness = 1.05
      colour = blackbody(light.core + gauss(seed, i, 6) * 350)
    } else if (roll < 0.6) {
      // The old disc: smooth, yellow-white, its scatter widening outward.
      a = discRadius(seed, i, 1, shape.scaleLength, shape.radius * 0.02, shape.radius * 1.08)
      phase = unit(seed, i, 20) * Math.PI * 2
      height = side * Math.abs(gauss(seed, i, 21)) * shape.thickness * (1.15 - 0.55 * Math.min(1, a / shape.radius))
      scatter = gauss(seed, i, 23) * (0.4 + 0.03 * a)
      const giant = unit(seed, i, 25) < 0.06
      size = (giant ? 0.14 : 1) * sizeScale * (0.75 + 0.5 * unit(seed, i, 26))
      brightness = giant ? 2.4 : 0.85
      colour = blackbody(giant ? 3600 + unit(seed, i, 27) * 1400 : light.disc + gauss(seed, i, 27) * 450)
    } else if (roll < 0.88) {
      // Young stars: born in the arms, bright only while they pass through one.
      a = discRadius(seed, i, 1, shape.radius * 0.42, shape.armStart, shape.radius)
      phase = unit(seed, i, 20) * Math.PI * 2
      height = side * Math.abs(gauss(seed, i, 21)) * shape.thickness * 0.45
      scatter = gauss(seed, i, 23) * (0.3 + 0.018 * a)
      const bright = unit(seed, i, 25) < 0.18
      size = (bright ? 0.12 : 0.85) * sizeScale * (0.75 + 0.5 * unit(seed, i, 26))
      brightness = bright ? 3.4 : 1.3
      gate = 2.5
      colour = blackbody(light.young * Math.exp(gauss(seed, i, 27) * 0.3))
    } else {
      // Knots: compact pink clumps, a few with a hot blue cluster at their heart.
      const knot = this.knots[Math.floor(unit(seed, i, 1) * this.knots.length)]!
      const spread = knot.size * Math.sqrt(-2 * Math.log(1 - unit(seed, i, 2)))
      const angle = unit(seed, i, 3) * Math.PI * 2
      const x = knot.x + Math.cos(angle) * spread
      const z = knot.z + Math.sin(angle) * spread
      a = Math.hypot(x, z)
      phase = Math.atan2(-z, x)
      height = side * Math.abs(gauss(seed, i, 21)) * shape.thickness * 0.25
      turnsWithArms = 1
      const cluster = unit(seed, i, 25) < 0.14
      size = (cluster ? 0.1 : 0.42) * Math.sqrt(sizeScale) * (0.75 + 0.5 * unit(seed, i, 26))
      brightness = cluster ? 3.2 : 2.3
      const t = unit(seed, i, 27) * 0.55
      colour = cluster
        ? blackbody(20000)
        : [
            KNOT_PINK[0] + (KNOT_VIOLET[0] - KNOT_PINK[0]) * t,
            KNOT_PINK[1] + (KNOT_VIOLET[1] - KNOT_PINK[1]) * t,
            KNOT_PINK[2] + (KNOT_VIOLET[2] - KNOT_PINK[2]) * t,
          ]
    }

    set.orbit[i * 4] = a
    set.orbit[i * 4 + 1] = phase
    set.orbit[i * 4 + 2] = height
    set.orbit[i * 4 + 3] = scatter
    set.shape[i * 4] = size
    set.shape[i * 4 + 1] = brightness * this.lightScale
    set.shape[i * 4 + 2] = gate
    set.shape[i * 4 + 3] = turnsWithArms
    writeColour(set, i, colour)
  }

  private fillDust(i: number) {
    const { galaxy } = this
    const { shape, light } = galaxy
    const seed = hashSeed(this.seed, 0xd057)
    const set = this.dust
    const a = discRadius(seed, i, 1, shape.radius * 0.45, shape.armStart * 0.9, shape.radius * 0.98)
    // Most dust gathers tightly on the arms' inner edges; the rest hazes the disc between.
    const lane = unit(seed, i, 24) < 0.8
    set.orbit[i * 4] = a
    set.orbit[i * 4 + 1] = unit(seed, i, 20) * Math.PI * 2
    set.orbit[i * 4 + 2] = gauss(seed, i, 21) * shape.thickness * 0.28
    set.orbit[i * 4 + 3] = gauss(seed, i, 23) * (0.25 + 0.012 * a)
    set.shape[i * 4] = 1.5 * Math.sqrt(this.dustScale) * (0.7 + 0.7 * unit(seed, i, 26))
    set.shape[i * 4 + 1] = light.dust * (lane ? 0.55 : 0.18) * (0.6 + 0.6 * unit(seed, i, 27))
    set.shape[i * 4 + 2] = lane ? 3.5 : 0.8
    set.shape[i * 4 + 3] = 0
    writeColour(set, i, [1, 0.62, 0.42])
  }
}
