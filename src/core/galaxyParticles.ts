/**
 * The particles that draw a galaxy, generated on the CPU into typed arrays: the brief's
 * spiral (arm angle, a twist that grows with radius, scatter that widens outward, a disc
 * that thins towards its edge, a dense warm bulge) expressed as galactic orbits, so the
 * vertex shader can move every particle without any work per frame here.
 *
 * Each particle's randomness is a pure function of the galaxy's seed and the particle's
 * index, so particles can be generated in any order, and in chunks spread over frames (an
 * ascent into a galaxy never stalls), with identical results. Particles are independent, so
 * any prefix of a set is a fair sample of it: a lower quality tier draws a prefix.
 *
 * Three sets:
 * - light: the galaxy's diffuse glow, soft and drawn at half resolution. The bulge's old warm
 *   stars, the old yellow-white disc (crowded into the arms by its orbits), young blue-white
 *   stars (bright only while they pass through an arm), and pink star-forming knots that
 *   ride the arms (Aurora-tinted, as the brief asks);
 * - sparkle: the few bright stars that read as points, drawn sharp at full resolution;
 * - dust: dark clouds along the inner edges of the arms, drawn with normal blending over the
 *   light inside and beyond the galaxy's plane, under the light in front of it.
 */
import { blackbody } from './blackbody.ts'
import { armAngle, lobedRadius, type GalaxyData } from './galaxy.ts'
import { hashSeed, mix32 } from './rng.ts'

/** Shares of a tier's particles; dust is capped, since its clouds are large. */
const LIGHT_SHARE = 0.76
const SPARKLE_SHARE = 0.09
const DUST_SHARE = 0.15
const DUST_MIN = 9000
const DUST_MAX = 34000

/** Counts the sizes and brightnesses are tuned at (the Medium tier). */
export const REFERENCE_LIGHT = 152000
const REFERENCE_SPARKLE = 18000
const REFERENCE_DUST = 30000

/** Shares of the light set by population, and the light each particle of them carries. */
const BULGE_SHARE = 0.15
const OLD_SHARE = 0.45
const YOUNG_SHARE = 0.32
const OLD_LIGHT = 0.7
const YOUNG_LIGHT = 2
/** Size of an old disc particle at the reference count, galaxy units (before sparseness). */
export const OLD_SIZE = 1.25

/**
 * The old and young discs' light per unit length of ray at their densest (before exposure),
 * and their scale lengths: what the particles add up to, for the glow that stands in for
 * particles too close to the camera to draw.
 */
export function discEmission(galaxy: GalaxyData) {
  const { shape } = galaxy
  const oldScale = shape.scaleLength * 0.85
  const youngScale = shape.radius * 0.4
  return {
    old: (OLD_SHARE * REFERENCE_LIGHT * OLD_LIGHT) / (oldScale * oldScale),
    young: (YOUNG_SHARE * REFERENCE_LIGHT * YOUNG_LIGHT) / (youngScale * youngScale),
    oldScale,
    youngScale,
  }
}

/**
 * The dust layer's half-thickness, as a share of the disc's thickness. The light is stored in
 * three runs (below the layer, inside it, above it) so each can be drawn on its own: the run
 * beyond the dust first, then the dust, then the run in front.
 */
export const LAYER_SHARE = 0.5

/** Where each run of the light lies in its arrays. */
export interface LightGroups {
  readonly below: { readonly start: number; readonly count: number }
  readonly inside: { readonly start: number; readonly count: number }
  readonly above: { readonly start: number; readonly count: number }
}

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

export interface ParticleCounts {
  readonly light: number
  readonly sparkle: number
  readonly dust: number
}

export function particleCounts(total: number): ParticleCounts {
  return {
    light: Math.round(total * LIGHT_SHARE),
    sparkle: Math.round(total * SPARKLE_SHARE),
    dust: Math.round(Math.min(DUST_MAX, Math.max(DUST_MIN, total * DUST_SHARE))),
  }
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

/** A gamma(2) radius (an exponential disc) between `min` and `max`. */
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

/**
 * Where things lie against the arms, as an arm phase (one arm to the next is 2 pi) from the
 * crest at their actual radius: dust lanes upstream, on the arms' inner edges; star-forming
 * knots just downstream, where the squeezed gas has begun to make stars.
 */
const DUST_LANE = -0.55
const KNOT_PLACE = 0.25

const DUST_COLOUR: [number, number, number] = [1, 0.62, 0.42]

/** How one arm's dust lane wanders, thickens and breaks along its length. */
interface Lane {
  readonly wander: number
  readonly wanderRate: number
  readonly wanderPhase: number
  readonly breakRate: number
  readonly breakPhase: number
}

/** A feathery dust spur leaving a lane: where it starts, how long, how far downstream. */
interface Spur {
  readonly arm: number
  readonly radius: number
  readonly length: number
  readonly reach: number
}

/**
 * An orbit that puts something riding the arms exactly at radius `r` and angle `phi`: its
 * scatter takes up the lobe, which never changes for things that turn with the arms.
 */
function placed(shape: GalaxyData['shape'], r: number, phi: number): [number, number, number] {
  return [r, phi, r - lobedRadius(shape, r, phi, 0)]
}

/** Hydrogen-alpha pink shading into Aurora violet: the colours of star-forming gas. */
const KNOT_PINK = hexToLinear('#ff8aae')
const KNOT_VIOLET = hexToLinear('#c69cff')

function mixColour(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]
}

function write(
  set: ParticleSet,
  i: number,
  orbit: readonly [number, number, number, number],
  shape: readonly [number, number, number, number],
  rgb: readonly [number, number, number],
) {
  set.orbit.set(orbit, i * 4)
  set.shape.set(shape, i * 4)
  const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-6)
  set.colour[i * 4] = Math.round((rgb[0] / peak) * 255)
  set.colour[i * 4 + 1] = Math.round((rgb[1] / peak) * 255)
  set.colour[i * 4 + 2] = Math.round((rgb[2] / peak) * 255)
  set.colour[i * 4 + 3] = 255
}

interface Knot {
  readonly id: number
  /** Centre at time zero, in the galaxy's plane. */
  readonly x: number
  readonly z: number
  readonly size: number
}

/**
 * Star-forming knots: clumps just downstream of the arms' crests, scattered across the arm's
 * width and bunched along it. They turn with the arms, which is the same as saying new ones
 * keep forming where old ones fade.
 */
function knotsOf(galaxy: GalaxyData): Knot[] {
  const seed = hashSeed(galaxy.seed, 0x6b07)
  const { shape } = galaxy
  return Array.from({ length: 220 }, (_, k) => {
    const arm = Math.floor(unit(seed, k, 0) * shape.arms)
    const r = discRadius(seed, k, 1, shape.radius * 0.42, shape.armStart * 1.2, shape.radius * 0.95)
    const phi = armAngle(shape, r) + (arm * Math.PI * 2 + KNOT_PLACE + gauss(seed, k, 20) * 0.3) / shape.arms
    return { id: k, x: r * Math.cos(phi), z: -r * Math.sin(phi), size: 0.7 * Math.exp(gauss(seed, k, 22) * 0.5) }
  })
}

/**
 * Builds a galaxy's particles a chunk at a time: the light (counted into its runs first, then
 * written straight into them), then sparkle, then dust. `step` does the next chunk; `run`
 * does it all.
 */
export class GalaxyParticleJob {
  readonly light: ParticleSet
  readonly sparkle: ParticleSet
  readonly dust: ParticleSet
  /** The light's runs, known once it has been counted. */
  groups: LightGroups | null = null
  private next = 0
  private readonly counts = [0, 0, 0]
  private readonly filled = [0, 0, 0]
  private readonly orbit: [number, number, number, number] = [0, 0, 0, 0]
  private readonly look: [number, number, number, number] = [0, 0, 0, 0]
  private colour: readonly [number, number, number] = [1, 1, 1]
  private readonly layer: number
  private readonly galaxy: GalaxyData
  private readonly seed: number
  private readonly knots: Knot[]
  private readonly lanes: Lane[]
  private readonly spurs: Spur[]
  private readonly emission: ReturnType<typeof discEmission>
  /** How much larger and brighter each particle is than at the reference count. */
  private readonly scale: ParticleCounts

  constructor(galaxy: GalaxyData, total: number) {
    this.galaxy = galaxy
    const counts = particleCounts(total)
    this.light = createSet(counts.light)
    this.sparkle = createSet(counts.sparkle)
    this.dust = createSet(counts.dust)
    this.seed = hashSeed(galaxy.seed, 0x9a41)
    this.knots = knotsOf(galaxy)
    this.emission = discEmission(galaxy)
    this.layer = galaxy.shape.thickness * LAYER_SHARE
    const laneSeed = hashSeed(galaxy.seed, 0x1a7e)
    const { shape } = galaxy
    this.lanes = Array.from({ length: shape.arms }, (_, arm) => ({
      wander: 0.12 + 0.12 * unit(laneSeed, arm, 0),
      wanderRate: 2 + 2.5 * unit(laneSeed, arm, 1),
      wanderPhase: unit(laneSeed, arm, 2) * Math.PI * 2,
      breakRate: 4 + 4 * unit(laneSeed, arm, 3),
      breakPhase: unit(laneSeed, arm, 4) * Math.PI * 2,
    }))
    this.spurs = Array.from({ length: 22 * shape.arms }, (_, k) => ({
      arm: Math.floor(unit(laneSeed, k + 16, 0) * shape.arms),
      radius: discRadius(laneSeed, k + 16, 1, shape.radius * 0.45, shape.armStart * 1.3, shape.radius * 0.9),
      length: 4 + 9 * unit(laneSeed, k + 16, 20),
      reach: 0.5 + 0.9 * unit(laneSeed, k + 16, 21),
    }))
    // Fewer particles are drawn larger and brighter, so every tier shows the same galaxy.
    this.scale = {
      light: REFERENCE_LIGHT / counts.light,
      sparkle: REFERENCE_SPARKLE / counts.sparkle,
      dust: REFERENCE_DUST / counts.dust,
    }
  }

  private get total(): number {
    return this.light.count * 2 + this.sparkle.count + this.dust.count
  }

  get done(): boolean {
    return this.next >= this.total
  }

  /** Share generated so far, 0 to 1. */
  get progress(): number {
    return this.next / this.total
  }

  /** Do up to `count` more particles, never crossing from one phase into the next. */
  step(count: number) {
    if (this.done) return
    const phases: Array<[number, (i: number) => void]> = [
      [this.light.count, (i) => this.countLight(i)],
      [this.light.count, (i) => this.fillLight(i)],
      [this.sparkle.count, (i) => this.fillSparkle(i)],
      [this.dust.count, (i) => this.fillDust(i)],
    ]
    let offset = 0
    for (const [length, work] of phases) {
      if (this.next < offset + length) {
        const start = this.next - offset
        const end = Math.min(length, start + count)
        for (let i = start; i < end; i++) work(i)
        this.next = offset + end
        if (offset === 0 && end === length) this.settleGroups()
        return
      }
      offset += length
    }
  }

  /** Which run a light particle belongs to: below the dust layer, inside it, or above it. */
  private group(y: number): number {
    return y < -this.layer ? 0 : y > this.layer ? 2 : 1
  }

  private countLight(i: number) {
    this.drawLight(i)
    this.counts[this.group(this.orbit[2])]!++
  }

  private settleGroups() {
    const [below, inside, above] = this.counts as [number, number, number]
    this.groups = {
      below: { start: 0, count: below },
      inside: { start: below, count: inside },
      above: { start: below + inside, count: above },
    }
  }

  private fillLight(i: number) {
    this.drawLight(i)
    const group = this.group(this.orbit[2])
    const runs = this.groups!
    const start = group === 0 ? runs.below.start : group === 1 ? runs.inside.start : runs.above.start
    write(this.light, start + this.filled[group]!++, this.orbit, this.look, this.colour)
  }

  /** Set the orbit, look and colour of the light's i-th particle, for whichever pass wants it. */
  private set(orbit: readonly number[], look: readonly number[], colour: readonly [number, number, number]) {
    for (let k = 0; k < 4; k++) {
      this.orbit[k] = orbit[k]!
      this.look[k] = look[k]!
    }
    this.colour = colour
  }

  /** Everything at once (tests, and a galaxy opened as the first thing seen). */
  run(): this {
    while (!this.done) this.step(1 << 16)
    return this
  }

  /** Light fades away over the disc's outer edge, so it ends in a haze, not a rim. */
  private edge(a: number): number {
    const { radius } = this.galaxy.shape
    const t = Math.min(1, Math.max(0, (a - radius * 0.72) / (radius * 0.38)))
    return 1 - 0.85 * t * t * (3 - 2 * t)
  }

  /** The disc's half-thickness at a radius: it thins towards the edge. */
  private thickness(a: number): number {
    const { shape } = this.galaxy
    return shape.thickness * (1.15 - 0.55 * Math.min(1, a / shape.radius))
  }

  private drawLight(i: number) {
    const { galaxy, knots } = this
    const seed = this.seed
    const { shape, light } = galaxy
    const size = Math.sqrt(this.scale.light)
    const brightness = this.scale.light
    const side = unit(seed, i, 30) < 0.5 ? 1 : -1
    const roll = unit(seed, i, 0)

    if (roll < BULGE_SHARE) {
      // Bulge: a flattened sphere of old warm stars, densest at the centre. Its particles grow
      // with radius as the bulge thins, so its edge is a haze, not a spray.
      const r = shape.bulge * Math.abs(gauss(seed, i, 1)) * (0.8 + 0.4 * unit(seed, i, 7))
      const cosTheta = unit(seed, i, 3) * 2 - 1
      const sinTheta = Math.sqrt(1 - cosTheta * cosTheta)
      this.set(
        [r * sinTheta, unit(seed, i, 4) * Math.PI * 2, side * Math.abs(r * cosTheta * shape.flattening), 0],
        [1.1 * size * (0.8 + 0.5 * unit(seed, i, 5)) * (0.8 + 0.7 * (r / shape.bulge)), 1.0 * brightness, 0, 0],
        blackbody(light.core + gauss(seed, i, 6) * 300),
      )
    } else if (roll < BULGE_SHARE + OLD_SHARE) {
      // The old disc: smooth, yellow-white, its scatter widening outward. Particles grow where
      // the disc thins (like a smoothing length), so its outskirts are a haze that fades out.
      const scale = this.emission.oldScale
      const a = discRadius(seed, i, 1, scale, shape.radius * 0.02, shape.radius * 1.1)
      const sparse = Math.min(1.9, Math.max(0.8, Math.exp((a - shape.radius * 0.3) / (2 * scale))))
      this.set(
        [a, unit(seed, i, 20) * Math.PI * 2, side * Math.abs(gauss(seed, i, 21)) * this.thickness(a), gauss(seed, i, 23) * (0.4 + 0.025 * a)],
        [OLD_SIZE * size * sparse * (0.75 + 0.5 * unit(seed, i, 26)), OLD_LIGHT * brightness * this.edge(a), 0, 0],
        blackbody(light.disc + gauss(seed, i, 27) * 450),
      )
    } else if (roll < BULGE_SHARE + OLD_SHARE + YOUNG_SHARE) {
      // Young stars: born in the arms, bright only while they pass through one.
      const a = discRadius(seed, i, 1, this.emission.youngScale, shape.armStart * 0.9, shape.radius * 1.08)
      const sparse = Math.min(2, Math.max(0.85, Math.exp((a - shape.radius * 0.45) / (shape.radius * 0.8))))
      this.set(
        [a, unit(seed, i, 20) * Math.PI * 2, side * Math.abs(gauss(seed, i, 21)) * this.thickness(a) * 0.4, gauss(seed, i, 23) * (0.3 + 0.022 * a)],
        [0.9 * size * sparse * (0.75 + 0.5 * unit(seed, i, 26)), YOUNG_LIGHT * brightness * this.edge(a), 2, 0],
        blackbody(light.young * Math.exp(gauss(seed, i, 27) * 0.25)),
      )
    } else {
      // Knots: soft pink clumps of glowing gas around new stars, each a few smaller clumps.
      const knot = knots[Math.floor(unit(seed, i, 1) * knots.length)]!
      const clump = Math.floor(unit(seed, i, 8) * 3)
      const offset = knot.size * 1.6
      const cx = knot.x + (unit(seed, knot.id, 40 + clump) - 0.5) * offset * 2
      const cz = knot.z + (unit(seed, knot.id, 50 + clump) - 0.5) * offset * 2
      const spread = knot.size * 0.6 * Math.sqrt(-2 * Math.log(1 - unit(seed, i, 2)))
      const angle = unit(seed, i, 3) * Math.PI * 2
      const x = cx + Math.cos(angle) * spread
      const z = cz + Math.sin(angle) * spread
      const [a, phi, scatter] = placed(shape, Math.hypot(x, z), Math.atan2(-z, x))
      this.set(
        [a, phi, side * Math.abs(gauss(seed, i, 21)) * shape.thickness * 0.2, scatter],
        [0.6 * size * (0.75 + 0.5 * unit(seed, i, 26)), 0.6 * brightness * (0.5 + unit(seed, i, 28)), 0, 1],
        mixColour(KNOT_PINK, KNOT_VIOLET, unit(seed, i, 27) * 0.5),
      )
    }
  }

  private fillSparkle(i: number) {
    const { galaxy, knots } = this
    const seed = hashSeed(this.seed, 0x5ba4)
    const { shape, light } = galaxy
    const brightness = this.scale.sparkle
    const side = unit(seed, i, 30) < 0.5 ? 1 : -1
    const roll = unit(seed, i, 0)
    // Point-like: their size only sets how bright they are, they never resolve.
    const size = 0.12
    if (roll < 0.42) {
      // Red and orange giants of the old disc.
      const a = discRadius(seed, i, 1, shape.scaleLength, shape.radius * 0.05, shape.radius * 1.05)
      write(
        this.sparkle,
        i,
        [a, unit(seed, i, 20) * Math.PI * 2, side * Math.abs(gauss(seed, i, 21)) * this.thickness(a), gauss(seed, i, 23) * (0.4 + 0.03 * a)],
        [size, 0.55 * brightness * Math.exp(gauss(seed, i, 25) * 0.5), 0, 0],
        blackbody(3500 + unit(seed, i, 27) * 1500),
      )
    } else if (roll < 0.9) {
      // Blue supergiants along the arms.
      const a = discRadius(seed, i, 1, shape.radius * 0.4, shape.armStart, shape.radius)
      write(
        this.sparkle,
        i,
        [a, unit(seed, i, 20) * Math.PI * 2, side * Math.abs(gauss(seed, i, 21)) * this.thickness(a) * 0.35, gauss(seed, i, 23) * (0.3 + 0.02 * a)],
        [size, 1.1 * brightness * Math.exp(gauss(seed, i, 25) * 0.5), 3, 0],
        blackbody(light.young * Math.exp(gauss(seed, i, 27) * 0.3)),
      )
    } else {
      // The hot young clusters at the hearts of the knots.
      const knot = knots[Math.floor(unit(seed, i, 1) * knots.length)]!
      const spread = knot.size * 0.6 * Math.sqrt(-2 * Math.log(1 - unit(seed, i, 2)))
      const angle = unit(seed, i, 3) * Math.PI * 2
      const x = knot.x + Math.cos(angle) * spread
      const z = knot.z + Math.sin(angle) * spread
      const [a, phi, scatter] = placed(shape, Math.hypot(x, z), Math.atan2(-z, x))
      write(
        this.sparkle,
        i,
        [a, phi, side * Math.abs(gauss(seed, i, 21)) * shape.thickness * 0.15, scatter],
        [size, 1.3 * brightness, 0, 1],
        blackbody(19000),
      )
    }
  }

  private fillDust(i: number) {
    const { galaxy } = this
    const { shape, light } = galaxy
    const seed = hashSeed(this.seed, 0xd057)
    // Most dust lies in lanes on the arms' inner edges, where gas is squeezed before it forms
    // stars; lanes are made anew as the gas flows through, so lane dust turns with the arms.
    // A lane wanders and thickens and breaks along its arm, and throws off feathery spurs
    // downstream. The rest is a faint haze over the disc, moving with the stars.
    const roll = unit(seed, i, 24)
    const arm = Math.floor(unit(seed, i, 25) * shape.arms)
    const height = gauss(seed, i, 21) * shape.thickness * 0.22
    const grain = 0.6 + 0.6 * unit(seed, i, 27)
    const scale = Math.sqrt(this.scale.dust)
    if (roll < 0.9) {
      let r: number
      let phase: number
      let strength: number
      let laneArm = arm
      if (roll < 0.74) {
        r = discRadius(seed, i, 1, shape.radius * 0.42, shape.armStart * 0.85, shape.radius * 0.98)
        const lane = this.lanes[arm]!
        const l = Math.log(r / shape.armStart)
        phase = DUST_LANE + lane.wander * Math.sin(l * lane.wanderRate + lane.wanderPhase) + gauss(seed, i, 20) * 0.17
        // Thick and dark in places, thin or broken in others.
        const along = Math.sin(l * lane.breakRate + lane.breakPhase) + 0.6 * Math.sin(l * lane.breakRate * 2.3 + lane.breakPhase * 1.7)
        strength = Math.min(1, Math.max(0.05, 0.55 + 0.45 * along))
      } else {
        // A spur: a thin streak leaving the lane, trailing outward and downstream.
        const spur = this.spurs[Math.floor(unit(seed, i, 1) * this.spurs.length)]!
        const t = unit(seed, i, 2)
        r = spur.radius + t * spur.length * 0.45 + gauss(seed, i, 23) * 0.3
        phase = DUST_LANE + t * spur.reach + gauss(seed, i, 20) * 0.06
        strength = 0.8 * (1 - t * 0.7)
        laneArm = spur.arm
      }
      const phi = armAngle(shape, r) + (laneArm * Math.PI * 2 + phase) / shape.arms
      const [a, angle, scatter] = placed(shape, r + gauss(seed, i, 23) * 0.25, phi)
      write(
        this.dust,
        i,
        [a, angle, height, scatter],
        [1.05 * scale * (0.7 + 0.6 * unit(seed, i, 26)), light.dust * 0.62 * strength * grain * this.edge(r), 0, 1],
        DUST_COLOUR,
      )
    } else {
      const r = discRadius(seed, i, 1, shape.radius * 0.42, shape.armStart * 0.85, shape.radius * 0.98)
      const scatter = gauss(seed, i, 23) * (0.3 + 0.012 * r)
      write(
        this.dust,
        i,
        [r, unit(seed, i, 20) * Math.PI * 2, height, scatter],
        [2.2 * scale * (0.7 + 0.6 * unit(seed, i, 26)), light.dust * 0.09 * grain, 0, 0],
        DUST_COLOUR,
      )
    }
  }
}
