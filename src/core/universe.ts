/**
 * The deterministic universe, described one level at a time as plain data (no three.js).
 * Components turn this data into visuals. Seeds follow the brief: a galaxy's seed hashes the
 * universe seed and its index, a star's hashes its galaxy's seed and its index, and so on,
 * so any level can be generated without its siblings.
 *
 * Phase 2 generates star systems. Galaxies and the universe arrive in Phases 3 and 4.
 *
 * Units: a system's outermost orbit lies about 200 units from its star, and times are
 * seconds at 1x. Planet presets keep their own units (planet radii).
 */
import { Language } from './names.ts'
import {
  hexToRgb,
  PRESETS,
  type AtmosphereParams,
  type CloudParams,
  type GasParams,
  type MoonSpec,
  type PlanetKind,
  type PlanetPreset,
  type RingParams,
  type SurfaceParams,
  type TerrainParams,
} from './planets.ts'
import { hashSeed, Rng, UNIVERSE_SEED } from './rng.ts'

export type Level = 'universe' | 'galaxy' | 'system' | 'planet'

/** Where the visitor is: indices from the universe down (galaxy, star, planet). */
export type Path = readonly number[]

const LEVELS: readonly Level[] = ['universe', 'galaxy', 'system', 'planet']

export function levelOf(path: Path): Level {
  return LEVELS[Math.min(path.length, LEVELS.length - 1)]!
}

/** The system VOID opens on: the first star of the first galaxy. */
export const HOME: Path = [0, 0]

export function galaxySeed(galaxy: number): number {
  return hashSeed(UNIVERSE_SEED, galaxy)
}

export function starSeed(galaxy: number, star: number): number {
  return hashSeed(galaxySeed(galaxy), star)
}

/** Every galaxy speaks one language, so its stars and worlds share a sound. */
export function galaxyLanguage(galaxy: number): Language {
  return new Language(hashSeed(galaxySeed(galaxy), 0x1a46))
}

// ---------------------------------------------------------------------------------------
// Orbits

export interface Orbit {
  /** Radius of the circular orbit, system units. */
  readonly radius: number
  /** Seconds per revolution at 1x. */
  readonly period: number
  /** Angle along the orbit at time zero, radians. */
  readonly phase: number
  /** Tilt of the orbital plane against the system's plane, radians. */
  readonly inclination: number
  /** Direction of the line where the orbit crosses the system's plane, radians. */
  readonly node: number
}

/** Angle along an orbit at a moment, radians. */
export function orbitAngle(orbit: Orbit, time: number): number {
  return orbit.phase + (time / orbit.period) * Math.PI * 2
}

/**
 * Position on an orbit at a moment. Orbits run anticlockwise seen from above (+y), in the
 * xz plane tilted by the inclination about the node line.
 */
export function orbitPosition(
  orbit: Orbit,
  time: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  return orbitPoint(orbit, orbitAngle(orbit, time), out)
}

/** The point at a given angle along an orbit. */
export function orbitPoint(
  orbit: Orbit,
  angle: number,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const x = Math.cos(angle) * orbit.radius
  const z = -Math.sin(angle) * orbit.radius
  // Tilt about the x axis, then turn the node line into place about y.
  const y = -z * Math.sin(orbit.inclination)
  const zt = z * Math.cos(orbit.inclination)
  const cn = Math.cos(orbit.node)
  const sn = Math.sin(orbit.node)
  out[0] = x * cn + zt * sn
  out[1] = y
  out[2] = -x * sn + zt * cn
  return out
}

// ---------------------------------------------------------------------------------------
// Systems

export interface StarData {
  readonly seed: number
  readonly name: string
  /** Surface temperature, kelvin. */
  readonly temperature: number
  /** Radius, system units. */
  readonly radius: number
  /** Light output relative to a sun-like star. */
  readonly luminosity: number
  /** Age, billions of years. */
  readonly age: number
  /** Seconds per rotation at 1x: its spots drift with it. */
  readonly rotation: number
}

export interface PlanetData {
  readonly index: number
  readonly seed: number
  readonly name: string
  readonly kind: PlanetKind
  readonly orbit: Orbit
  /** Radius, system units. At the planet level the planet has radius 1. */
  readonly radius: number
  /** How to draw it: its kind's preset, varied by its seed. */
  readonly preset: PlanetPreset
  /** Sunlight relative to the habitable zone: 1 inside it, dimmer further out. */
  readonly light: number
}

export interface BeltData {
  readonly seed: number
  /** Middle of the belt, system units. */
  readonly radius: number
  readonly width: number
  readonly thickness: number
  /** Ice beyond the frost line, stone inside it. */
  readonly icy: boolean
  /** The belt lies just beyond this planet's orbit. */
  readonly after: number
}

export interface SystemData {
  readonly seed: number
  /** Indices from the universe down: [galaxy, star]. */
  readonly path: Path
  readonly star: StarData
  readonly planets: readonly PlanetData[]
  readonly belts: readonly BeltData[]
  /** Distance from the star where water stays liquid on a world's surface. */
  readonly habitable: number
}

/** Radius of the outermost orbit. */
export const SYSTEM_EXTENT = 200

/** Seconds per revolution of an orbit of radius 20 at 1x; periods follow Kepler's third law. */
const BASE_PERIOD = 600
const BASE_ORBIT = 20

/** Seconds per rotation that reads as a 24-hour day in descriptions. */
export const SECONDS_PER_DAY = 300

const SPECTRAL = [
  { below: 3900, weight: 0.45, from: 2900, to: 3900 },
  { below: 5200, weight: 0.25, from: 3900, to: 5200 },
  { below: 6000, weight: 0.15, from: 5200, to: 6000 },
  { below: 7500, weight: 0.1, from: 6000, to: 7500 },
  { below: 10000, weight: 0.04, from: 7500, to: 10000 },
  { below: Infinity, weight: 0.01, from: 10000, to: 22000 },
] as const

/** A star's radius in system units, larger for hotter stars. */
function starRadius(temperature: number): number {
  const points: Array<[number, number]> = [
    [2900, 3],
    [4500, 3.8],
    [5800, 4.4],
    [7000, 5],
    [9000, 5.8],
    [15000, 7],
  ]
  if (temperature <= points[0]![0]) return points[0]![1]
  for (let i = 1; i < points.length; i++) {
    const [t1, r1] = points[i]!
    const [t0, r0] = points[i - 1]!
    if (temperature <= t1) return r0 + ((r1 - r0) * (temperature - t0)) / (t1 - t0)
  }
  return points[points.length - 1]![1]
}

export interface SystemOptions {
  /** Featured systems always hold a temperate world, a giant, and enough worlds to explore. */
  readonly featured?: boolean
}

export function generateSystem(galaxy: number, index: number, options: SystemOptions = {}): SystemData {
  const seed = starSeed(galaxy, index)
  const rng = new Rng(seed)
  const language = galaxyLanguage(galaxy)
  const names = new Rng(hashSeed(seed, 0x4a3e))
  const featured = options.featured ?? false

  // The star.
  const band = featured
    ? SPECTRAL[2]
    : rng.weighted(
        SPECTRAL,
        SPECTRAL.map((s) => s.weight),
      )
  const temperature = featured ? rng.range(5500, 5900) : rng.range(band.from, band.to)
  const radius = starRadius(temperature) * rng.range(0.93, 1.07)
  const luminosity = (radius / 4.4) ** 2 * (temperature / 5778) ** 4
  const habitable = Math.min(Math.max(60 * Math.sqrt(luminosity), 26), 120)
  const star: StarData = {
    seed: hashSeed(seed, 0x57a2),
    name: language.name(names, { minSyllables: 1, maxSyllables: 2, maxLength: 7 }),
    temperature,
    radius,
    luminosity,
    age: featured ? rng.range(3, 6) : temperature > 9000 ? rng.range(0.05, 0.6) : rng.range(0.8, 9.5),
    rotation: rng.range(900, 1600),
  }

  // Orbits: geometric spacing with jitter, stretched so the outermost sits near the edge.
  const count = featured ? rng.int(6, 8) : rng.weighted([3, 4, 5, 6, 7, 8], [1, 2, 3, 3, 2, 1])
  const first = Math.max(radius * 5, 22) * rng.range(1, 1.15)
  const raw = [first]
  for (let i = 1; i < count; i++) raw.push(raw[i - 1]! * rng.range(1.38, 1.85))
  const outer = SYSTEM_EXTENT * rng.range(0.93, 1)
  const span = Math.log(raw[count - 1]! / first)
  const radii = raw.map((r) =>
    count === 1 ? first : first * Math.exp((Math.log(r / first) / span) * Math.log(outer / first)),
  )

  // Kinds by temperature zone, measured against the habitable zone, favouring variety.
  const kinds: PlanetKind[] = []
  for (const r of radii) kinds.push(kindForZone(r / habitable, rng, kinds))
  if (featured) enforceFeatured(kinds, radii, habitable)

  // Until civilisations arrive (Phase 5), lights burn on at most one temperate world: the
  // home world of a featured system, and about half the others.
  let lit = -1
  for (let i = 0; i < count; i++) {
    if (kinds[i] !== 'terrestrial' && kinds[i] !== 'ocean') continue
    if (lit < 0 || Math.abs(Math.log(radii[i]! / habitable)) < Math.abs(Math.log(radii[lit]! / habitable)))
      lit = i
  }
  if (!featured && !rng.chance(0.55)) lit = -1

  // Names, unique within the system.
  const used = new Set([star.name])
  const planetName = () => {
    for (let tries = 0; tries < 40; tries++) {
      const name = language.name(names, { minSyllables: 2, maxSyllables: 3, maxLength: 8 })
      if (!used.has(name)) {
        used.add(name)
        return name
      }
    }
    return language.name(names, { minSyllables: 3, maxSyllables: 4, maxLength: 9 })
  }

  const planets: PlanetData[] = radii.map((orbitRadius, i) => {
    const kind = kinds[i]!
    const planetSeed = hashSeed(seed, 0x91a7, i)
    const planetRng = new Rng(planetSeed)
    const size = planetRadius(kind, planetRng)
    // Moons stay well inside the gap to the neighbouring orbits.
    const gap = Math.min(
      i > 0 ? orbitRadius - radii[i - 1]! : orbitRadius - radius * 2,
      i < count - 1 ? radii[i + 1]! - orbitRadius : Infinity,
    )
    const reach = Math.min(8, (gap * 0.4) / size)
    const preset = variedPreset(kind, planetSeed, planetRng, { moonReach: reach, lights: i === lit })
    return {
      index: i,
      seed: planetSeed,
      name: planetName(),
      kind,
      radius: size,
      preset,
      light: Math.min(1, Math.max(0.55, (habitable / orbitRadius) ** 0.35)),
      orbit: {
        radius: orbitRadius,
        period: BASE_PERIOD * (orbitRadius / BASE_ORBIT) ** 1.5,
        phase: rng.range(0, Math.PI * 2),
        inclination: Math.max(-0.05, Math.min(0.05, rng.gauss(0, 0.02))),
        node: rng.range(0, Math.PI * 2),
      },
    }
  })

  // An asteroid belt in the widest gap between a rocky world and a giant.
  const belts: BeltData[] = []
  let best = -1
  let bestRatio = featured ? 1.3 : 1.45
  for (let i = 0; i < count - 1; i++) {
    const ratio = radii[i + 1]! / radii[i]!
    const giantBeyond = isGiant(kinds[i + 1]!)
    if (!isGiant(kinds[i]!) && giantBeyond && ratio > bestRatio) {
      best = i
      bestRatio = ratio
    }
  }
  if (best >= 0 && (featured || rng.chance(0.75))) {
    const middle = Math.sqrt(radii[best]! * radii[best + 1]!)
    const room = Math.min(middle - radii[best]!, radii[best + 1]! - middle)
    belts.push({
      seed: hashSeed(seed, 0xbe17),
      radius: middle,
      width: Math.min(middle * 0.16, room * 0.55),
      thickness: middle * 0.025,
      icy: middle / habitable > 2,
      after: best,
    })
  }

  return { seed, path: [galaxy, index], star, planets, belts, habitable }
}

export function isGiant(kind: PlanetKind): boolean {
  return kind === 'gas' || kind === 'ringed' || kind === 'ice-giant'
}

const ZONES: ReadonlyArray<{ below: number; kinds: readonly PlanetKind[]; weights: readonly number[] }> = [
  { below: 0.55, kinds: ['lava', 'barren', 'toxic', 'desert'], weights: [35, 25, 20, 20] },
  { below: 0.85, kinds: ['toxic', 'desert', 'barren', 'terrestrial'], weights: [30, 35, 20, 15] },
  { below: 1.35, kinds: ['terrestrial', 'ocean', 'desert', 'toxic'], weights: [45, 35, 12, 8] },
  { below: 2.2, kinds: ['desert', 'ice', 'barren', 'gas'], weights: [30, 30, 25, 15] },
  { below: Infinity, kinds: ['gas', 'ringed', 'ice-giant', 'ice', 'barren'], weights: [30, 25, 25, 14, 6] },
]

/** A kind suited to the temperature zone, less likely for every world of it already made. */
function kindForZone(zone: number, rng: Rng, made: readonly PlanetKind[]): PlanetKind {
  const { kinds, weights } = ZONES.find((z) => zone < z.below)!
  const adjusted = kinds.map((kind, i) => weights[i]! * 0.35 ** made.filter((k) => k === kind).length)
  return rng.weighted(kinds, adjusted)
}

/**
 * A featured system shows the range of worlds: a temperate world nearest the habitable zone
 * (where its people live), and both a banded and a ringed giant further out.
 */
function enforceFeatured(kinds: PlanetKind[], radii: readonly number[], habitable: number) {
  let home = 0
  for (let i = 1; i < radii.length; i++) {
    if (Math.abs(Math.log(radii[i]! / habitable)) < Math.abs(Math.log(radii[home]! / habitable))) home = i
  }
  kinds[home] = 'terrestrial'
  const beyond = (kind: PlanetKind) => kinds.some((k, i) => i > home && k === kind)
  if (!beyond('ringed')) {
    let last = kinds.length - 1
    for (let i = kinds.length - 1; i > home; i--) {
      if (isGiant(kinds[i]!)) {
        last = i
        break
      }
    }
    kinds[last] = 'ringed'
  }
  if (!beyond('gas')) {
    for (let i = home + 1; i < kinds.length; i++) {
      if (kinds[i] !== 'ringed' && radii[i]! / habitable > 1.4) {
        kinds[i] = 'gas'
        break
      }
    }
  }
}

function planetRadius(kind: PlanetKind, rng: Rng): number {
  const ranges: Record<PlanetKind, [number, number]> = {
    barren: [0.6, 0.9],
    lava: [0.7, 1],
    desert: [0.8, 1.1],
    terrestrial: [0.95, 1.25],
    ocean: [0.95, 1.25],
    toxic: [0.95, 1.2],
    ice: [0.8, 1.15],
    gas: [2.2, 2.9],
    ringed: [1.9, 2.5],
    'ice-giant': [1.5, 2],
  }
  const [min, max] = ranges[kind]
  return rng.range(min, max)
}

// ---------------------------------------------------------------------------------------
// Presets varied by seed

/** Scale a colour's brightness, keeping it a valid sRGB hex. */
export function shade(hex: string, factor: number): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value * factor)) * 255)
      .toString(16)
      .padStart(2, '0')
  const [r, g, b] = hexToRgb(hex)
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

// prettier-ignore
const GAS_PALETTES: Record<'gas' | 'ringed' | 'ice-giant', ReadonlyArray<{ palette: string[]; pole: string; words: string }>> = {
  gas: [
    { palette: [...PRESETS.gas.gas!.palette], pole: '#7d6a58', words: 'cream and rust' },
    { palette: ['#e8d2b0', '#c08a5a', '#dcbf98', '#9c6a48', '#f0e4cc', '#ad7b55', '#cfae86', '#7f5a43', '#b39a86'], pole: '#76604c', words: 'amber and cream' },
    { palette: ['#ddd6cc', '#b07a5c', '#cfc5b8', '#8e5f4a', '#ebe6dd', '#a37763', '#c2b4a4', '#6f5246', '#9a948c'], pole: '#6e6359', words: 'ash and rust' },
    { palette: ['#d9d5c8', '#a9a08a', '#c8bfa8', '#8a7f68', '#e6e1d4', '#b29b72', '#bcb4a0', '#76705f'], pole: '#6f6a5c', words: 'pale grey and ochre' },
  ],
  ringed: [
    { palette: [...PRESETS.ringed.gas!.palette], pole: '#8f8a72', words: 'pale gold' },
    { palette: ['#e9dcc0', '#cdb98f', '#efe3c9', '#b9a27a', '#dccaa3', '#c7b088'], pole: '#8c8670', words: 'cream' },
    { palette: ['#e2d6c6', '#c9b5a0', '#ebe1d3', '#b49d88', '#d6c6b2', '#bfa891'], pole: '#857a6e', words: 'dusty rose' },
  ],
  'ice-giant': [
    { palette: [...PRESETS['ice-giant'].gas!.palette], pole: '#2a4c9a', words: 'deep blue' },
    { palette: ['#58a6b8', '#73bccb', '#4793a6', '#8ccfd9', '#5fb0c0', '#4f9db0'], pole: '#3c7f90', words: 'teal' },
    { palette: ['#7fc4c6', '#94d0d0', '#6ab6ba', '#a7dbd9', '#86c8c9', '#72bcc0'], pole: '#5a9fa3', words: 'pale green' },
  ],
}

// prettier-ignore
const RING_COLOURS: Record<'ringed' | 'ice' | 'ice-giant', ReadonlyArray<[string, string]>> = {
  ringed: [['#d8c9a8', '#8e7f67'], ['#e3d7bf', '#9b8b70'], ['#cfc3b0', '#857a6c']],
  ice: [['#f1f5f9', '#b9c9d8'], ['#e8eef3', '#a9b9c8']],
  'ice-giant': [['#8a96a4', '#5b6470'], ['#97a3ad', '#646d77']],
}

/** Words for a giant's colouring, for its description. */
export function giantColourWords(preset: PlanetPreset): string | null {
  if (!preset.gas) return null
  for (const [, options] of Object.entries(GAS_PALETTES)) {
    for (const option of options) {
      if (option.palette[0] === preset.gas.palette[0]) return option.words
    }
  }
  return null
}

function varyTerrain(terrain: TerrainParams, rng: Rng): TerrainParams {
  return {
    ...terrain,
    continentScale: terrain.continentScale * rng.range(0.88, 1.15),
    warp: Math.max(0, terrain.warp + rng.range(-0.1, 0.1)),
    continentBias: terrain.continentBias + rng.range(-0.06, 0.06),
    mountainStrength: Math.max(0, terrain.mountainStrength + rng.range(-0.08, 0.08)),
    moistureScale: terrain.moistureScale * rng.range(0.88, 1.15),
    craterDensity: Math.min(1, terrain.craterDensity * rng.range(0.85, 1.15)),
    crackScale: terrain.crackScale * rng.range(0.88, 1.12),
  }
}

function varySurface(surface: SurfaceParams, rng: Rng): SurfaceParams {
  const light = rng.range(0.94, 1.06)
  const land = (hex: string) => shade(hex, light * rng.range(0.97, 1.03))
  return {
    ...surface,
    shore: land(surface.shore),
    lowDry: land(surface.lowDry),
    lowWet: land(surface.lowWet),
    highland: land(surface.highland),
    rock: land(surface.rock),
    iceCap: surface.iceCap < 1.5 ? Math.min(0.99, surface.iceCap + rng.range(-0.03, 0.03)) : surface.iceCap,
    snowLine: surface.snowLine < 2 ? surface.snowLine + rng.range(-0.05, 0.05) : surface.snowLine,
  }
}

function varyClouds(clouds: CloudParams, rng: Rng): CloudParams {
  return {
    ...clouds,
    coverage: Math.min(0.75, Math.max(0.15, clouds.coverage + rng.range(-0.05, 0.05))),
    scale: clouds.scale * rng.range(0.9, 1.15),
    cyclones: clouds.cyclones > 0 ? rng.int(Math.max(2, clouds.cyclones - 2), clouds.cyclones) : 0,
  }
}

function varyAtmosphere(air: AtmosphereParams, rng: Rng): AtmosphereParams {
  const tint = (value: number) => value * rng.range(0.94, 1.06)
  return {
    ...air,
    rayleigh: [tint(air.rayleigh[0]), tint(air.rayleigh[1]), tint(air.rayleigh[2])],
    mie: air.mie * rng.range(0.85, 1.15),
  }
}

function varyGas(kind: 'gas' | 'ringed' | 'ice-giant', gas: GasParams, rng: Rng): GasParams {
  const look = rng.pick(GAS_PALETTES[kind])
  const storms: Array<GasParams['storms'][number]> = []
  const stormCount = kind === 'gas' ? rng.int(1, 3) : rng.chance(0.5) ? 1 : 0
  const darkest = look.palette.reduce((a, b) => (luma(a) < luma(b) ? a : b))
  for (let i = 0; i < stormCount; i++) {
    const great = i === 0 && kind === 'gas'
    storms.push({
      lat: rng.sign() * rng.range(0.15, 0.55),
      lon: rng.range(0, Math.PI * 2),
      radius: great ? rng.range(0.07, 0.12) : rng.range(0.03, 0.06),
      color: great ? rng.pick(['#c2603c', '#b4583a', '#a9644a']) : kind === 'ice-giant' ? shade(darkest, 0.7) : '#f4eee4',
    })
  }
  return {
    ...gas,
    palette: look.palette,
    poleColor: look.pole,
    bands: Math.max(6, gas.bands + rng.int(-3, 3)),
    turbulence: gas.turbulence * rng.range(0.85, 1.15),
    jetCount: Math.max(6, gas.jetCount + rng.int(-4, 4)),
    storms,
  }
}

function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function varyRings(kind: 'ringed' | 'ice' | 'ice-giant', base: RingParams, rng: Rng): RingParams {
  const [colorA, colorB] = rng.pick(RING_COLOURS[kind])
  const inner = base.inner * rng.range(0.96, 1.08)
  return {
    ...base,
    inner,
    outer: inner + (base.outer - base.inner) * rng.range(0.85, 1.15),
    opacity: Math.min(1, base.opacity * rng.range(0.85, 1.1)),
    colorA,
    colorB,
    gaps: Math.max(1, base.gaps + rng.int(-1, 1)),
  }
}

function moonsFor(kind: PlanetKind, preset: PlanetPreset, rng: Rng, reach: number): MoonSpec[] {
  const counts: Record<PlanetKind, readonly number[]> = {
    barren: [70, 30],
    lava: [60, 40],
    desert: [30, 40, 30],
    terrestrial: [20, 60, 20],
    ocean: [40, 60],
    toxic: [70, 30],
    ice: [50, 50],
    gas: [0, 0, 30, 40, 30],
    ringed: [0, 40, 40, 20],
    'ice-giant': [0, 60, 40],
  }
  const weights = counts[kind]
  const count = rng.weighted(
    weights.map((_, i) => i),
    weights,
  )
  const giant = isGiant(kind)
  const inner = Math.max(giant ? 2 : 2.6, (preset.rings?.outer ?? 0) + 0.6)
  const moons: MoonSpec[] = []
  let distance = inner
  for (let i = 0; i < count; i++) {
    const radius = giant ? rng.range(0.05, 0.16) : rng.range(0.06, 0.27)
    distance += radius + rng.range(0.4, 2.2)
    if (distance + radius > reach) break
    moons.push({
      kind: rng.chance(giant ? 0.45 : 0.15) ? 'ice' : 'barren',
      radius,
      distance,
      period: 60 * (distance / 3) ** 1.5 * rng.range(0.9, 1.1),
      inclination: kind === 'ice-giant' && rng.chance(0.4) ? rng.range(0.2, 0.4) : rng.range(0, 0.12),
      phase: rng.range(0, Math.PI * 2),
    })
    distance += radius
  }
  return moons
}

export interface VariationOptions {
  /** Furthest a moon may orbit, in planet radii. */
  readonly moonReach?: number
  /** Whether city lights burn on the night side. */
  readonly lights?: boolean
}

/** A kind's preset, varied by a world's seed. Variations stay close to the tuned presets. */
export function variedPreset(kind: PlanetKind, seed: number, rng: Rng, options: VariationOptions = {}): PlanetPreset {
  const base = PRESETS[kind]
  let preset: PlanetPreset = {
    ...base,
    seed,
    lights: options.lights === false ? undefined : base.lights,
    tilt: Math.max(-1.2, Math.min(1.2, base.tilt + rng.gauss(0, isGiant(kind) ? 0.15 : 0.1))),
    dayLength: base.dayLength * rng.range(0.8, 1.3),
  }
  if (base.terrain) preset = { ...preset, terrain: varyTerrain(base.terrain, rng) }
  if (base.surface) preset = { ...preset, surface: varySurface(base.surface, rng) }
  if (base.clouds) preset = { ...preset, clouds: varyClouds(base.clouds, rng) }
  if (base.atmosphere) preset = { ...preset, atmosphere: varyAtmosphere(base.atmosphere, rng) }
  if (base.gas && (kind === 'gas' || kind === 'ringed' || kind === 'ice-giant')) {
    preset = { ...preset, gas: varyGas(kind, base.gas, rng) }
  }
  if (base.rings && (kind === 'ringed' || kind === 'ice' || kind === 'ice-giant')) {
    const keep = kind === 'ringed' || rng.chance(kind === 'ice' ? 0.4 : 0.6)
    preset = { ...preset, rings: keep ? varyRings(kind, base.rings, rng) : undefined }
  }
  const moons = moonsFor(kind, preset, rng, options.moonReach ?? 8)
  // Rings need room in the frame; a world that lost its preset's rings can come closer.
  const framing = preset.rings
    ? Math.max(base.framing, preset.rings.outer * 2.4)
    : base.rings
      ? 3.6
      : base.framing
  return { ...preset, moons, framing }
}

const systems = new Map<string, SystemData>()

/** A system, generated once and remembered. */
export function getSystem(galaxy: number, index: number): SystemData {
  const key = `${galaxy}:${index}`
  let system = systems.get(key)
  if (!system) {
    const featured = galaxy === HOME[0] && index === HOME[1]
    system = generateSystem(galaxy, index, { featured })
    systems.set(key, system)
  }
  return system
}
