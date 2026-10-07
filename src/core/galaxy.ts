/**
 * Galaxies, as plain data (no three.js).
 *
 * A spiral galaxy is a disc of stars on slightly lobed orbits. Each orbit bulges outward at as
 * many points as the galaxy has arms, and those points turn with radius, so neighbouring
 * orbits crowd together along logarithmic spirals: the arms. They are density waves. Every
 * star moves at its own speed (inner stars faster, from a flat rotation curve), passing
 * through the arms, while the arms keep their shape and turn slowly as a whole. The galaxy can
 * therefore turn at any speed of time without winding itself up. Young blue stars, pink
 * star-forming knots and dust are bright (or dark) only where they pass through an arm.
 *
 * Ellipticals and irregulars use the same motion without arms. An elliptical is a smooth,
 * slowly turning swarm of old stars, densest at its heart. An irregular is a thick, lopsided
 * disc whose light gathers in a few bright star-forming complexes; it turns almost as a solid
 * wheel, so its clumps keep their shape.
 *
 * The same motion runs in the particle shaders (shaders/galaxy/orbit.glsl) and here, for
 * the few hundred stars that can be visited and for the frames of their systems.
 *
 * Units: the disc's radius is about 200, so a galaxy spans about 400. Times are seconds at
 * 1x. A system inside a galaxy is scaled down by SYSTEM_SCALE.
 */
import { galaxySite, type GalaxyKind } from './cosmos.ts'
import { hashSeed, Rng } from './rng.ts'
import { HOME_BAND, type Vec3 } from './sky.ts'
import { galaxyLanguage, galaxySeed, generateStar, HOME, starSeed, type StarData } from './universe.ts'

/** Radius of a galaxy's disc: it spans about 400 units. */
export const GALAXY_RADIUS = 200

/**
 * Galaxy units per system unit. A system's outer orbit (200 units) is half a galaxy unit
 * across: far smaller than the gaps between the galaxy's particles, so a system never
 * collides with the light around it.
 */
export const SYSTEM_SCALE = 0.0025

export interface GalaxyShape {
  /** Radius of the disc. */
  readonly radius: number
  /** Number of spiral arms, 2 to 5, or 0 for a galaxy without arms. */
  readonly arms: number
  /** Pitch angle of the arms, radians: small is tightly wound. */
  readonly pitch: number
  /** Radius where the arms begin: the ends of the bar, or the edge of the bulge. */
  readonly armStart: number
  /** Angle of the first arm where it begins, radians. */
  readonly armAngle: number
  /** How far orbits bulge towards the arms, as a share of their radius. */
  readonly armEccentricity: number
  /** Gentle bends along the arms: two waves in log radius (amplitude, frequency, phase). */
  readonly wiggle: readonly [number, number, number, number, number, number]
  /** Half-length of the central bar, 0 for none. */
  readonly bar: number
  readonly barAngle: number
  readonly barEccentricity: number
  /** Exponential scale length of the disc's light. */
  readonly scaleLength: number
  /** Gaussian half-thickness of the disc at its centre; it thins towards the edge. */
  readonly thickness: number
  /**
   * Gaussian radius of the central bulge, and its flattening (1 is round). An elliptical is all
   * bulge: this is the scale of its whole swarm (a Hernquist profile), and its axis ratio.
   */
  readonly bulge: number
  readonly flattening: number
}

export interface GalaxyMotion {
  /** Orbital speed on the flat part of the rotation curve, units per second at 1x. */
  readonly speed: number
  /** Radius inside which the galaxy turns like a solid wheel. */
  readonly core: number
  /** How fast the arms turn as a whole, radians per second at 1x. */
  readonly pattern: number
}

/** Colour temperatures of a galaxy's populations, kelvin. */
export interface GalaxyLight {
  /** The old stars of the bulge. */
  readonly core: number
  /** The old disc. */
  readonly disc: number
  /** Young stars along the arms. */
  readonly young: number
  /** How dark its dust lanes are, 0 to 1. */
  readonly dust: number
}

/** A star's path around its galaxy: a lobed orbit, so it rides the arms like the rest. */
export interface GalacticOrbit {
  /** Mean radius. */
  readonly radius: number
  /** Angle at time zero, radians. */
  readonly phase: number
  /** Height above the galaxy's plane. */
  readonly height: number
  /** Offset from the orbit's radius: the scatter that widens the arms. */
  readonly scatter: number
}

/** A star that can be visited: its system's star, and where it lies in the galaxy. */
export interface GalaxyStar {
  /** Its system's index in the galaxy. */
  readonly index: number
  readonly star: StarData
  readonly orbit: GalacticOrbit
  /** One of the few stars the keyboard visits, and the galaxy's description names. */
  readonly notable: boolean
}

export type NebulaKind = 'emission' | 'reflection' | 'remnant'

/** A cloud of glowing gas in an arm. Nebulae turn with the arms, so they stay in them. */
export interface NebulaData {
  readonly seed: number
  readonly kind: NebulaKind
  /** Which arm, and how far along it (mean orbit radius). */
  readonly arm: number
  readonly radius: number
  /** Angle from the arm's crest, radians; positive is downstream. */
  readonly offset: number
  readonly height: number
  /** Radius of the cloud, galaxy units. */
  readonly size: number
}

/** A star-forming complex of an irregular galaxy, in its plane at time zero. */
export interface Clump {
  readonly x: number
  readonly z: number
  /** Gaussian radius. */
  readonly size: number
  /** Share of the young light it holds, relative to the others. */
  readonly weight: number
}

/** What makes an irregular galaxy lopsided: its complexes, its old envelope and a short bar. */
export interface IrregularForm {
  readonly clumps: readonly Clump[]
  /** The old stars' envelope: centre (x, z), radii along and across, and its turn. */
  readonly envelope: readonly [number, number, number, number, number]
  /** An offset bar of older stars: centre (x, z), half-length, half-width, and its turn. */
  readonly bar: readonly [number, number, number, number, number]
}

/** Everything about a galaxy's look and motion: what the universe draws it from. */
export interface GalaxyLook {
  readonly seed: number
  readonly index: number
  readonly kind: GalaxyKind
  readonly name: string
  readonly shape: GalaxyShape
  readonly motion: GalaxyMotion
  readonly light: GalaxyLight
  readonly nebulae: readonly NebulaData[]
  /** An irregular's complexes and envelope; null for every other kind. */
  readonly irregular: IrregularForm | null
  /** How many of its stars can be visited. */
  readonly starCount: number
}

/** A galaxy in full: its look and the stars that can be visited. */
export interface GalaxyData extends GalaxyLook {
  readonly stars: readonly GalaxyStar[]
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Angular speed of an orbit, radians per second: a flat rotation curve with a solid core. */
export function orbitalSpeed(motion: GalaxyMotion, radius: number): number {
  return (motion.speed * (1 - Math.exp(-radius / motion.core))) / Math.max(radius, 1e-3)
}

/** How far orbits at this radius bulge towards the arms: none in the bulge or past the edge. */
export function armStrength(shape: GalaxyShape, radius: number): number {
  return (
    shape.armEccentricity *
    smoothstep(shape.armStart * 0.75, shape.armStart * 1.25, radius) *
    (1 - smoothstep(shape.radius * 0.9, shape.radius * 1.15, radius))
  )
}

/** How far orbits inside the bar are stretched along it. */
export function barStrength(shape: GalaxyShape, radius: number): number {
  return shape.bar > 0 ? shape.barEccentricity * (1 - smoothstep(shape.bar * 0.75, shape.bar * 1.1, radius)) : 0
}

/**
 * Angle of the first arm's crest at this radius when the arms have not yet turned: a
 * trailing logarithmic spiral (the angle falls as the radius grows) with gentle bends.
 */
export function armAngle(shape: GalaxyShape, radius: number): number {
  const l = Math.log(Math.max(radius, 1e-3) / shape.armStart)
  const [a1, f1, p1, a2, f2, p2] = shape.wiggle
  const bend = a1 * (Math.sin(l * f1 + p1) - Math.sin(p1)) + a2 * (Math.sin(l * f2 + p2) - Math.sin(p2))
  return shape.armAngle - l / Math.tan(shape.pitch) + bend
}

/**
 * Phase of the lobes against the arms' crest. Orbits crowd most where the radius changes
 * least from one orbit to the next, which for a lobed orbit r = a (1 + e cos x) whose lobes
 * turn as a log spiral lies a little before the lobe's peak. Shifting by this puts the
 * crowding (the arm) exactly on armAngle().
 */
export function crestPhase(shape: GalaxyShape): number {
  return Math.PI - Math.atan(shape.arms / Math.tan(shape.pitch))
}

/** Radius at absolute angle `phi` of an orbit whose mean radius is `radius`. */
export function lobedRadius(shape: GalaxyShape, radius: number, phi: number, turned: number): number {
  const arms = shape.arms * (phi - armAngle(shape, radius) - turned) + crestPhase(shape)
  const bar = 2 * (phi - shape.barAngle - turned)
  return radius * (1 + armStrength(shape, radius) * Math.cos(arms) + barStrength(shape, radius) * Math.cos(bar))
}

/**
 * How bright a galaxy's unresolved heart is, by kind: an elliptical's heart is part of one
 * smooth swarm, and an irregular has none.
 */
export const CORE_LIGHT: Record<GalaxyKind, number> = { spiral: 1, barred: 1, elliptical: 0.45, irregular: 0 }

/** What a galaxy's motion depends on. */
export type GalaxyForm = Pick<GalaxyLook, 'shape' | 'motion'>

/** Where a star on a galactic orbit is at a moment. */
export function galacticPosition(
  galaxy: GalaxyForm,
  orbit: GalacticOrbit,
  time: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const phi = orbit.phase + orbitalSpeed(galaxy.motion, orbit.radius) * time
  const r = lobedRadius(galaxy.shape, orbit.radius, phi, galaxy.motion.pattern * time) + orbit.scatter
  out[0] = r * Math.cos(phi)
  out[1] = orbit.height
  out[2] = -r * Math.sin(phi)
  return out
}

/** Absolute angle of an arm's crest at this radius and moment (a galaxy without arms turns as one). */
export function crestAngle(galaxy: GalaxyForm, arm: number, radius: number, time: number): number {
  const arms = galaxy.shape.arms > 0 ? (arm * Math.PI * 2) / galaxy.shape.arms : 0
  return armAngle(galaxy.shape, radius) + galaxy.motion.pattern * time + arms
}

/** Where a nebula is at a moment: it keeps its place in its arm. */
export function nebulaPosition(
  galaxy: GalaxyForm,
  nebula: NebulaData,
  time: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const phi = crestAngle(galaxy, nebula.arm, nebula.radius, time) + nebula.offset
  const r = lobedRadius(galaxy.shape, nebula.radius, phi, galaxy.motion.pattern * time)
  out[0] = r * Math.cos(phi)
  out[1] = nebula.height
  out[2] = -r * Math.sin(phi)
  return out
}

/**
 * How a system's frame is turned inside its galaxy, as a row-major 3x3 rotation from system
 * axes to galaxy axes. Every system's sky shows the same band (HOME_BAND, composed for the
 * earlier phases' views), so the frame is turned to make that band the galaxy's real plane
 * and its bright core face the galaxy's real centre. Seen from inside, the galaxy's light
 * and the sky's band are then one thing, and a fall from one into the other lines up.
 * Systems end up tilted about 25 degrees against the galactic plane, as real ones are.
 */
export function systemOrientation(position: Readonly<Vec3>, out: number[] = new Array<number>(9).fill(0)): number[] {
  const length = Math.hypot(position[0], position[2])
  const zx = length > 1e-9 ? -position[0] / length : 0
  const zz = length > 1e-9 ? -position[2] / length : -1
  // The galaxy's basis at this point: x = y × z, north, and towards the centre.
  const gx = [zz, 0, -zx]
  const gy = [0, 1, 0]
  const gz = [zx, 0, zz]
  // The band's basis in system axes: the rows of worldToBand (x, pole, core).
  const b = HOME_BAND.worldToBand
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = gx[i]! * b[j]! + gy[i]! * b[3 + j]! + gz[i]! * b[6 + j]!
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------
// Generation

/** The galaxy VOID's home system lies in. */
export function isHomeGalaxy(index: number): boolean {
  return index === HOME[0]
}

const NO_BENDS = [0, 0, 0, 0, 0, 0] as const

function generateSpiralShape(rng: Rng, featured: boolean, barred: boolean): GalaxyShape {
  const radius = featured ? GALAXY_RADIUS : GALAXY_RADIUS * rng.range(0.9, 1.06)
  const arms = featured ? 2 : rng.weighted([2, 3, 4, 5], [35, 25, 25, 15])
  const pitch = featured ? 0.3 : rng.range(0.2, 0.42)
  const bar = barred ? radius * (featured ? 0.15 : rng.range(0.09, 0.2)) : 0
  const barAngle = rng.range(0, Math.PI * 2)
  // Arms leave the ends of a bar; without one, they rise out of the bulge.
  const armStart = barred ? bar : radius * rng.range(0.12, 0.2)
  // Strength of the crowding where orbits pass closest: just short of crossing, so arms
  // are strong but stars never pile into a hard line.
  const crowding = featured ? 0.84 : rng.range(0.68, 0.86)
  const armEccentricity = crowding / Math.hypot(1, arms / Math.tan(pitch))
  return {
    radius,
    arms,
    pitch,
    armStart,
    armAngle: barred ? barAngle : rng.range(0, Math.PI * 2),
    armEccentricity,
    wiggle: [rng.range(0.04, 0.12), rng.range(1.2, 2.6), rng.range(0, 6.28), rng.range(0.02, 0.06), rng.range(3.5, 6), rng.range(0, 6.28)],
    bar,
    barAngle,
    barEccentricity: barred ? (featured ? 0.42 : rng.range(0.3, 0.5)) : 0,
    scaleLength: radius * (featured ? 0.3 : rng.range(0.26, 0.36)),
    thickness: radius * (featured ? 0.022 : rng.range(0.016, 0.028)),
    bulge: radius * (featured ? 0.075 : rng.range(0.05, 0.11)),
    flattening: featured ? 0.72 : rng.range(0.6, 0.85),
  }
}

/** A shape without arms or bar: what ellipticals and irregulars share. */
function armless(radius: number, thickness: number, bulge: number, flattening: number): GalaxyShape {
  return {
    radius,
    arms: 0,
    pitch: 0.3,
    armStart: radius * 0.2,
    armAngle: 0,
    armEccentricity: 0,
    wiggle: NO_BENDS,
    bar: 0,
    barAngle: 0,
    barEccentricity: 0,
    scaleLength: radius * 0.28,
    thickness,
    bulge,
    flattening,
  }
}

/** An elliptical: one smooth swarm, its light falling steeply from a bright heart. */
function generateEllipticalShape(rng: Rng): GalaxyShape {
  const radius = GALAXY_RADIUS * rng.range(0.92, 1.05)
  return armless(radius, radius * 0.02, radius * rng.range(0.11, 0.15), rng.range(0.55, 0.95))
}

/**
 * An irregular: a thick disc whose young light gathers in a handful of complexes, most of them
 * leaning towards one side, around an old envelope and a short bar both a little off centre.
 */
function generateIrregular(rng: Rng): { shape: GalaxyShape; form: IrregularForm } {
  const radius = GALAXY_RADIUS * rng.range(0.92, 1.05)
  const shape = armless(radius, radius * rng.range(0.05, 0.07), radius * 0.05, 0.8)
  const lean = rng.range(0, Math.PI * 2)
  const count = rng.int(6, 9)
  const clumps: Clump[] = []
  for (let i = 0; i < count; i++) {
    const great = i === 0
    const r = great ? radius * rng.range(0.16, 0.3) : radius * 0.55 * Math.sqrt(rng.next())
    const angle = lean + rng.gauss(0, great ? 0.5 : 1.3)
    const size = radius * (great ? rng.range(0.085, 0.11) : rng.range(0.035, 0.075))
    clumps.push({ x: r * Math.cos(angle), z: -r * Math.sin(angle), size, weight: size * size * (great ? 1.6 : 1) })
  }
  const envelopeAt = radius * rng.range(0.05, 0.12)
  const barAt = radius * rng.range(0.05, 0.11)
  const barSide = lean + rng.range(1, 2.2)
  return {
    shape,
    form: {
      clumps,
      envelope: [envelopeAt * Math.cos(lean), -envelopeAt * Math.sin(lean), radius * rng.range(0.4, 0.5), radius * rng.range(0.26, 0.34), rng.range(0, Math.PI)],
      bar: [barAt * Math.cos(barSide), -barAt * Math.sin(barSide), radius * rng.range(0.15, 0.21), radius * rng.range(0.035, 0.05), rng.range(0, Math.PI)],
    },
  }
}

/**
 * At 1x a spiral's inner disc turns once in about ten minutes and the middle of the disc in
 * about twenty-five, so the galaxy is visibly alive without seeming to spin. The arms turn with
 * the stars about three quarters of the way out. Ellipticals turn slowly, held up by their
 * stars' random motions more than by rotation; irregulars turn almost as a solid wheel.
 */
function generateMotion(shape: GalaxyShape, kind: GalaxyKind, rng: Rng): GalaxyMotion {
  const speed = ((Math.PI * 2 * 100) / 1500) * rng.range(0.92, 1.08)
  if (kind === 'elliptical') {
    const motion = { speed: speed * 0.35, core: shape.bulge, pattern: 0 }
    return { ...motion, pattern: orbitalSpeed(motion, shape.radius * 0.5) }
  }
  if (kind === 'irregular') {
    const motion = { speed: speed * 0.7, core: shape.radius * 1.6, pattern: 0 }
    return { ...motion, pattern: orbitalSpeed(motion, shape.radius * 0.35) }
  }
  const core = shape.radius * 0.06
  const motion = { speed, core, pattern: 0 }
  return { ...motion, pattern: orbitalSpeed(motion, shape.radius * 0.75) }
}

function generateLight(kind: GalaxyKind, rng: Rng, featured: boolean): GalaxyLight {
  // An elliptical's stars are all old: golden at the heart, paler in its outskirts.
  if (kind === 'elliptical') return { core: rng.range(3700, 4200), disc: rng.range(4300, 5000), young: 9000, dust: 0 }
  // An irregular is young almost everywhere.
  if (kind === 'irregular') {
    return { core: rng.range(5000, 5600), disc: rng.range(5800, 6800), young: rng.range(14000, 22000), dust: rng.range(0.45, 0.75) }
  }
  return {
    core: featured ? 4100 : rng.range(3900, 4800),
    disc: featured ? 5000 : rng.range(4800, 5800),
    young: featured ? 15000 : rng.range(11000, 20000),
    dust: featured ? 0.9 : rng.range(0.55, 1),
  }
}

/** Mean radius of a star in the disc, between `min` and `max`, from an exponential disc. */
function discRadius(rng: Rng, scale: number, min: number, max: number): number {
  for (let tries = 0; tries < 64; tries++) {
    // A gamma(2) draw: the radius distribution of an exponential disc.
    const r = -scale * Math.log(Math.max(1e-9, (1 - rng.next()) * (1 - rng.next())))
    if (r >= min && r <= max) return r
  }
  return rng.range(min, max)
}

/** A radius in a Hernquist swarm of scale `a` (most light within a few scales), in [min, max]. */
export function hernquistRadius(u: number, a: number, min: number, max: number): number {
  const enclosed = (r: number) => (r / (r + a)) ** 2
  const s = Math.sqrt(enclosed(min) + (enclosed(max) - enclosed(min)) * u)
  return (a * s) / (1 - s)
}

/** Where a visited star's orbit lies, by the galaxy's kind. */
function drawOrbit(galaxy: GalaxyLook, rng: Rng): GalacticOrbit {
  const { shape } = galaxy
  if (galaxy.kind === 'elliptical') {
    // Anywhere in the swarm but its blinding heart.
    const r = hernquistRadius(rng.next(), shape.bulge, shape.radius * 0.1, shape.radius * 0.92)
    const cos = rng.range(-1, 1)
    const phase = rng.range(0, Math.PI * 2)
    return { radius: r * Math.sqrt(1 - cos * cos), phase, height: r * cos * shape.flattening, scatter: 0 }
  }
  if (galaxy.irregular) {
    // Most in the bright complexes, the rest in the old envelope.
    const form = galaxy.irregular
    let x: number
    let z: number
    if (rng.chance(0.62)) {
      const clump = rng.weighted(form.clumps, form.clumps.map((c) => c.weight))
      x = clump.x + rng.gauss(0, clump.size * 1.1)
      z = clump.z + rng.gauss(0, clump.size * 1.1)
    } else {
      const [cx, cz, along, across, turn] = form.envelope
      const u = rng.gauss(0, along * 0.6)
      const v = rng.gauss(0, across * 0.6)
      x = cx + u * Math.cos(turn) - v * Math.sin(turn)
      z = cz + u * Math.sin(turn) + v * Math.cos(turn)
    }
    return { radius: Math.hypot(x, z), phase: Math.atan2(-z, x), height: rng.gauss(0, shape.thickness * 0.6), scatter: 0 }
  }
  const radius = discRadius(rng, shape.radius * 0.4, shape.armStart * 1.15, shape.radius * 1.02)
  // Most visited stars lie along the arms, where the bright young stars are.
  const inArm = rng.chance(0.6)
  const arm = rng.int(0, shape.arms - 1)
  const phase = inArm ? armAngle(shape, radius) + (arm * Math.PI * 2) / shape.arms + rng.gauss(0.04, 0.12) : rng.range(0, Math.PI * 2)
  const height = rng.gauss(0, shape.thickness * 0.5)
  return { radius, phase, height, scatter: 0 }
}

function generateStars(galaxy: GalaxyLook): GalaxyStar[] {
  const { shape } = galaxy
  const featured = isHomeGalaxy(galaxy.index)
  const stars: GalaxyStar[] = []
  const placed: Array<[number, number, number]> = []
  const minimum = 3.2
  for (let index = 0; index < galaxy.starCount; index++) {
    const star = generateStar(galaxy.index, index)
    const orbitRng = new Rng(hashSeed(starSeed(galaxy.index, index), 0x6a1a))
    let orbit: GalacticOrbit
    if (featured && index === HOME[1]) {
      // The home star rides the inner edge of an arm a little over halfway out.
      const radius = shape.radius * 0.56
      orbit = { radius, phase: armAngle(shape, radius) + 0.06, height: 0.5, scatter: 0 }
    } else {
      orbit = { radius: 0, phase: 0, height: 0, scatter: 0 }
      for (let tries = 0; tries < 24; tries++) {
        orbit = drawOrbit(galaxy, orbitRng)
        const at = galacticPosition(galaxy, orbit, 0)
        if (placed.every((p) => (p[0] - at[0]) ** 2 + (p[1] - at[1]) ** 2 + (p[2] - at[2]) ** 2 > minimum * minimum)) break
      }
    }
    placed.push(galacticPosition(galaxy, orbit, 0))
    stars.push({ index, star, orbit, notable: false })
  }

  // The notable few: the home star and the brightest named stars, spread around the disc.
  const named = stars
    .filter((s) => !s.star.catalogued && s.index !== HOME[1])
    .sort((a, b) => b.star.luminosity - a.star.luminosity)
    .slice(0, featured ? 11 : 12)
  const notable = new Set(named.map((s) => s.index))
  if (featured) notable.add(HOME[1]!)
  return stars.map((s) => (notable.has(s.index) ? { ...s, notable: true } : s))
}

function generateNebulae(shape: GalaxyShape, seed: number, rng: Rng, featured: boolean): NebulaData[] {
  const count = featured ? 9 : rng.int(5, 11)
  return Array.from({ length: count }, (_, i) => {
    const kind = rng.weighted<NebulaKind>(['emission', 'reflection', 'remnant'], [60, 25, 15])
    // Larger than life, so they read as clouds from across the galaxy, not as specks.
    const size =
      kind === 'emission' ? rng.range(8, 15) : kind === 'reflection' ? rng.range(6, 10) : rng.range(4.5, 7)
    return {
      seed: hashSeed(seed, 0x4eb0, i),
      kind,
      arm: rng.int(0, shape.arms - 1),
      radius: discRadius(rng, shape.radius * 0.45, shape.armStart * 1.4, shape.radius * 0.92),
      offset: rng.gauss(0.03, 0.05),
      height: rng.gauss(0, shape.thickness * 0.3),
      size,
    }
  })
}

/** An irregular's giant star-forming clouds sit on its largest complexes. */
function irregularNebulae(shape: GalaxyShape, form: IrregularForm, seed: number, rng: Rng): NebulaData[] {
  const largest = [...form.clumps].sort((a, b) => b.weight - a.weight).slice(0, rng.int(2, 4))
  return largest.map((clump, i) => {
    const radius = Math.hypot(clump.x, clump.z)
    return {
      seed: hashSeed(seed, 0x4eb0, i),
      kind: i === 0 || rng.chance(0.7) ? 'emission' : 'reflection',
      arm: 0,
      radius,
      offset: Math.atan2(-clump.z, clump.x) - armAngle(shape, radius),
      height: rng.gauss(0, shape.thickness * 0.2),
      size: i === 0 ? rng.range(13, 17) : rng.range(8, 12),
    }
  })
}

/** A galaxy's look and motion, without its stars: all the universe needs to draw it. */
export function generateGalaxyLook(index: number): GalaxyLook {
  const seed = galaxySeed(index)
  const rng = new Rng(hashSeed(seed, 0x6a1a))
  const featured = isHomeGalaxy(index)
  const kind = galaxySite(index).kind
  const language = galaxyLanguage(index)
  // The home galaxy's name was chosen by ear from the first few its language offered.
  const names = new Rng(hashSeed(seed, featured ? 0x4a47 : 0x4a3e))
  let shape: GalaxyShape
  let irregular: IrregularForm | null = null
  if (kind === 'elliptical') shape = generateEllipticalShape(rng)
  else if (kind === 'irregular') {
    const generated = generateIrregular(rng)
    shape = generated.shape
    irregular = generated.form
  } else shape = generateSpiralShape(rng, featured, featured || kind === 'barred')
  const motion = generateMotion(shape, kind, rng)
  const light = generateLight(kind, rng, featured)
  const name = featured || rng.chance(0.5) ? language.titled(names) : language.name(names, { minSyllables: 2, maxSyllables: 3 })
  const starCount = featured ? 300 : kind === 'irregular' ? rng.int(150, 240) : rng.int(200, 340)
  const nebulae =
    kind === 'elliptical' ? [] : irregular ? irregularNebulae(shape, irregular, seed, rng) : generateNebulae(shape, seed, rng, featured)
  return { seed, index, kind, name, shape, motion, light, nebulae, irregular, starCount }
}

export function generateGalaxy(index: number): GalaxyData {
  const look = generateGalaxyLook(index)
  return { ...look, stars: generateStars(look) }
}

const looks = new Map<number, GalaxyLook>()
const galaxies = new Map<number, GalaxyData>()

/** A galaxy's look, generated once and remembered. */
export function getGalaxyLook(index: number): GalaxyLook {
  let look = looks.get(index)
  if (!look) {
    look = generateGalaxyLook(index)
    looks.set(index, look)
  }
  return look
}

/** A galaxy with its stars, generated once and remembered. */
export function getGalaxy(index: number): GalaxyData {
  let galaxy = galaxies.get(index)
  if (!galaxy) {
    const look = getGalaxyLook(index)
    galaxy = { ...look, stars: generateStars(look) }
    galaxies.set(index, galaxy)
  }
  return galaxy
}
