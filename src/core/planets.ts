/**
 * Planet presets. Every rocky world is a parameter set for one shader family (terrain bake,
 * surface, clouds, atmosphere); gas giants have their own. Colours are sRGB hex strings.
 * Distances are in planet radii, times in seconds at 1x. Plain data: no three.js.
 *
 * Phase 1 shows these one at a time; later the universe generator varies them by seed.
 */
import { hashSeed, UNIVERSE_SEED } from './rng.ts'

export type PlanetKind =
  | 'terrestrial'
  | 'ocean'
  | 'desert'
  | 'ice'
  | 'lava'
  | 'toxic'
  | 'barren'
  | 'gas'
  | 'ringed'
  | 'ice-giant'

export type TerrainStyle = 'continents' | 'dunes' | 'ice' | 'lava' | 'craters'
export type CloudStyle = 'weather' | 'haze' | 'wisps'

export type Rgb = readonly [number, number, number]

export interface TerrainParams {
  readonly style: TerrainStyle
  readonly continentScale: number
  readonly warp: number
  /** Shifts the land/sea balance: negative drowns continents into archipelagos. */
  readonly continentBias: number
  readonly mountainScale: number
  readonly mountainStrength: number
  readonly hillStrength: number
  readonly moistureScale: number
  readonly craterDensity: number
  readonly craterDepth: number
  readonly crackScale: number
  /** Height of the terrain, in planet radii, used for the baked normals. */
  readonly reliefScale: number
}

export interface SurfaceParams {
  /** Height of the sea; below about -1 there is no ocean at all. */
  readonly seaLevel: number
  /** Strength of terrain normals, 0 (smooth ball) to 1. */
  readonly relief: number
  /** Strength of the per-pixel fine detail seen up close. */
  readonly detail: number
  readonly deepWater: string
  readonly shallowWater: string
  readonly shore: string
  readonly lowDry: string
  readonly lowWet: string
  readonly highland: string
  readonly rock: string
  readonly snow: string
  /** Colour of the style mask: lineae, salt flats, ejecta, cooled lava crust. */
  readonly marking: string
  /** Sine of the latitude where polar ice begins. */
  readonly iceCap: number
  readonly snowLine: number
  readonly waterRoughness: number
  readonly glint: number
  readonly emissive: string
  readonly emissiveStrength: number
  /** Starlight on the night side, never pure black. */
  readonly ambient: number
}

export interface LightsParams {
  readonly density: number
  readonly intensity: number
  readonly color: string
  readonly roads: number
}

export interface CloudParams {
  readonly style: CloudStyle
  readonly coverage: number
  readonly scale: number
  readonly threshold: number
  readonly softness: number
  readonly opacity: number
  readonly color: string
  readonly flow: number
  /** Cloud rotation relative to the ground (1 = locked to the surface). */
  readonly spin: number
  readonly cyclones: number
  readonly shadow: number
  readonly height: number
}

export interface AtmosphereParams {
  readonly rayleigh: Rgb
  readonly rayleighHeight: number
  readonly mie: number
  readonly mieHeight: number
  readonly mieG: number
  readonly absorption: Rgb
  readonly ozoneCenter: number
  readonly ozoneWidth: number
  /** Top of the atmosphere above the surface. */
  readonly thickness: number
  readonly multiScatter: number
  readonly airglow: string
  readonly airglowStrength: number
}

export interface RingParams {
  readonly inner: number
  readonly outer: number
  readonly opacity: number
  readonly colorA: string
  readonly colorB: string
  readonly forward: number
  /** Number of clean gaps cut into the rings. */
  readonly gaps: number
}

export interface GasParams {
  readonly palette: readonly string[]
  readonly bands: number
  readonly turbulence: number
  readonly poleColor: string
  readonly jetSpeed: number
  readonly jetCount: number
  readonly storms: ReadonlyArray<{
    readonly lat: number
    readonly lon: number
    readonly radius: number
    readonly color: string
  }>
  readonly stormSwirl: number
  readonly limbDarkening: number
  readonly ambient: number
}

export interface MoonSpec {
  readonly kind: 'barren' | 'ice'
  readonly radius: number
  readonly distance: number
  readonly period: number
  readonly inclination: number
  readonly phase: number
}

export interface PlanetPreset {
  readonly kind: PlanetKind
  readonly label: string
  readonly seed: number
  /** Axial tilt in radians. */
  readonly tilt: number
  /** Seconds per rotation at 1x. */
  readonly dayLength: number
  /** Comfortable viewing distance from the planet's centre. */
  readonly framing: number
  readonly terrain?: TerrainParams
  readonly surface?: SurfaceParams
  readonly lights?: LightsParams
  readonly clouds?: CloudParams
  readonly atmosphere?: AtmosphereParams
  readonly rings?: RingParams
  readonly gas?: GasParams
  readonly moons: readonly MoonSpec[]
}

const seedFor = (key: number) => hashSeed(UNIVERSE_SEED, 0x9a7e7, key)

const EARTH_AIR: AtmosphereParams = {
  rayleigh: [5.8, 13.5, 33.1],
  rayleighHeight: 0.008,
  mie: 4,
  mieHeight: 0.003,
  mieG: 0.76,
  absorption: [0.65, 1.88, 0.085],
  ozoneCenter: 0.025,
  ozoneWidth: 0.015,
  thickness: 0.05,
  multiScatter: 0.3,
  airglow: '#5fd6c4',
  airglowStrength: 0.012,
}

const CITY_LIGHTS: LightsParams = { density: 0.44, intensity: 5, color: '#ffb36b', roads: 0.18 }

const BARREN_SURFACE: SurfaceParams = {
  seaLevel: -9,
  relief: 1,
  detail: 0.8,
  deepWater: '#000000',
  shallowWater: '#000000',
  shore: '#000000',
  lowDry: '#8f8b85',
  lowWet: '#4a4744',
  highland: '#a39f98',
  rock: '#6e6b66',
  snow: '#d9dbdc',
  marking: '#cfccc5',
  iceCap: 2,
  snowLine: 9,
  waterRoughness: 0.5,
  glint: 0,
  emissive: '#000000',
  emissiveStrength: 0,
  ambient: 0.0025,
}

const BARREN_TERRAIN: TerrainParams = {
  style: 'craters',
  continentScale: 1.2,
  warp: 0.3,
  continentBias: 0,
  mountainScale: 3,
  mountainStrength: 0,
  hillStrength: 0,
  moistureScale: 2,
  craterDensity: 0.55,
  craterDepth: 0.32,
  crackScale: 0,
  reliefScale: 0.03,
}

const ICE_SURFACE: SurfaceParams = {
  seaLevel: -9,
  relief: 0.7,
  detail: 0.6,
  deepWater: '#000000',
  shallowWater: '#000000',
  shore: '#000000',
  lowDry: '#eef3f7',
  lowWet: '#95b5cc',
  highland: '#c6d3de',
  rock: '#6f7f8e',
  snow: '#f4f8fb',
  marking: '#a2654c',
  iceCap: 0.9,
  snowLine: 9,
  waterRoughness: 0.35,
  glint: 0,
  emissive: '#000000',
  emissiveStrength: 0,
  ambient: 0.003,
}

const ICE_TERRAIN: TerrainParams = {
  style: 'ice',
  continentScale: 1.3,
  warp: 0.4,
  continentBias: 0,
  mountainScale: 4,
  mountainStrength: 0,
  hillStrength: 0.06,
  moistureScale: 2.2,
  craterDensity: 0,
  craterDepth: 0,
  crackScale: 2.6,
  reliefScale: 0.012,
}

export const PRESETS: Record<PlanetKind, PlanetPreset> = {
  terrestrial: {
    kind: 'terrestrial',
    label: 'Terrestrial',
    seed: seedFor(1),
    tilt: 0.41,
    dayLength: 300,
    framing: 3.4,
    terrain: {
      style: 'continents',
      continentScale: 1.15,
      warp: 0.65,
      continentBias: -0.04,
      mountainScale: 3.3,
      mountainStrength: 0.5,
      hillStrength: 0.1,
      moistureScale: 1.9,
      craterDensity: 0,
      craterDepth: 0,
      crackScale: 0,
      reliefScale: 0.02,
    },
    surface: {
      seaLevel: 0,
      relief: 0.85,
      detail: 1,
      deepWater: '#04102a',
      shallowWater: '#155774',
      shore: '#b5a27c',
      lowDry: '#a08a5c',
      lowWet: '#2b4726',
      highland: '#675a44',
      rock: '#5b534a',
      snow: '#eef2f5',
      marking: '#000000',
      iceCap: 0.93,
      snowLine: 0.85,
      waterRoughness: 0.22,
      glint: 1,
      emissive: '#000000',
      emissiveStrength: 0,
      ambient: 0.0035,
    },
    lights: CITY_LIGHTS,
    clouds: {
      style: 'weather',
      coverage: 0.44,
      scale: 1.1,
      threshold: 0.5,
      softness: 0.22,
      opacity: 0.97,
      color: '#ffffff',
      flow: 0.02,
      spin: 1.07,
      cyclones: 6,
      shadow: 0.4,
      height: 0.005,
    },
    atmosphere: EARTH_AIR,
    moons: [{ kind: 'barren', radius: 0.24, distance: 7, period: 220, inclination: 0.09, phase: 2.2 }],
  },

  ocean: {
    kind: 'ocean',
    label: 'Ocean world',
    seed: seedFor(2),
    tilt: 0.3,
    dayLength: 260,
    framing: 3.4,
    terrain: {
      style: 'continents',
      continentScale: 1.55,
      warp: 0.8,
      continentBias: -0.3,
      mountainScale: 3.8,
      mountainStrength: 0.45,
      hillStrength: 0.12,
      moistureScale: 2.1,
      craterDensity: 0,
      craterDepth: 0,
      crackScale: 0,
      reliefScale: 0.02,
    },
    surface: {
      seaLevel: 0,
      relief: 0.8,
      detail: 1,
      deepWater: '#030c24',
      shallowWater: '#11607d',
      shore: '#c4b48c',
      lowDry: '#7d8a4c',
      lowWet: '#28502b',
      highland: '#5a5c40',
      rock: '#4f4c45',
      snow: '#eef3f6',
      marking: '#000000',
      iceCap: 0.9,
      snowLine: 0.5,
      waterRoughness: 0.2,
      glint: 1.1,
      emissive: '#000000',
      emissiveStrength: 0,
      ambient: 0.0035,
    },
    lights: { ...CITY_LIGHTS, density: 0.5 },
    clouds: {
      style: 'weather',
      coverage: 0.55,
      scale: 1.8,
      threshold: 0.5,
      softness: 0.22,
      opacity: 0.96,
      color: '#ffffff',
      flow: 0.04,
      spin: 1.08,
      cyclones: 6,
      shadow: 0.42,
      height: 0.005,
    },
    atmosphere: { ...EARTH_AIR, rayleigh: [5.2, 13.8, 36], mie: 3.2 },
    moons: [{ kind: 'barren', radius: 0.2, distance: 6.2, period: 200, inclination: 0.12, phase: 0.7 }],
  },

  desert: {
    kind: 'desert',
    label: 'Desert',
    seed: seedFor(3),
    tilt: 0.44,
    dayLength: 280,
    framing: 3.4,
    terrain: {
      style: 'dunes',
      continentScale: 1,
      warp: 0.5,
      continentBias: 0.05,
      mountainScale: 3,
      mountainStrength: 0.35,
      hillStrength: 0.05,
      moistureScale: 2.4,
      craterDensity: 0.25,
      craterDepth: 0.2,
      crackScale: 0,
      reliefScale: 0.024,
    },
    surface: {
      seaLevel: -9,
      relief: 0.9,
      detail: 0.9,
      deepWater: '#000000',
      shallowWater: '#000000',
      shore: '#d8ccb3',
      lowDry: '#c98e58',
      lowWet: '#5e3b2b',
      highland: '#9a603a',
      rock: '#3f2a20',
      snow: '#ece6dc',
      marking: '#d8ccb3',
      iceCap: 0.97,
      snowLine: 9,
      waterRoughness: 0.5,
      glint: 0,
      emissive: '#000000',
      emissiveStrength: 0,
      ambient: 0.003,
    },
    lights: { ...CITY_LIGHTS, density: 0.28, intensity: 2.2 },
    clouds: {
      style: 'wisps',
      coverage: 0.32,
      scale: 2,
      threshold: 0.55,
      softness: 0.3,
      opacity: 0.5,
      color: '#f3e8d8',
      flow: 0.03,
      spin: 1.04,
      cyclones: 0,
      shadow: 0.2,
      height: 0.006,
    },
    atmosphere: {
      rayleigh: [1.6, 2.4, 4],
      rayleighHeight: 0.01,
      mie: 7,
      mieHeight: 0.006,
      mieG: 0.65,
      absorption: [0.15, 0.9, 2.6],
      ozoneCenter: 0,
      ozoneWidth: 0.03,
      thickness: 0.05,
      multiScatter: 0.35,
      airglow: '#ff9a6b',
      airglowStrength: 0.004,
    },
    moons: [
      { kind: 'barren', radius: 0.07, distance: 3, period: 60, inclination: 0.02, phase: 1 },
      { kind: 'barren', radius: 0.05, distance: 4.4, period: 95, inclination: 0.03, phase: 3 },
    ],
  },

  ice: {
    kind: 'ice',
    label: 'Ice',
    seed: seedFor(4),
    tilt: 0.1,
    dayLength: 340,
    framing: 4.4,
    terrain: ICE_TERRAIN,
    surface: ICE_SURFACE,
    clouds: {
      style: 'wisps',
      coverage: 0.3,
      scale: 2.2,
      threshold: 0.55,
      softness: 0.3,
      opacity: 0.45,
      color: '#f2f6fa',
      flow: 0.03,
      spin: 1.05,
      cyclones: 0,
      shadow: 0.15,
      height: 0.006,
    },
    atmosphere: {
      rayleigh: [3.2, 7.5, 18],
      rayleighHeight: 0.006,
      mie: 1.5,
      mieHeight: 0.003,
      mieG: 0.8,
      absorption: [0, 0, 0],
      ozoneCenter: 0.02,
      ozoneWidth: 0.01,
      thickness: 0.035,
      multiScatter: 0.3,
      airglow: '#6fd3e0',
      airglowStrength: 0.01,
    },
    rings: {
      inner: 1.5,
      outer: 1.95,
      opacity: 0.78,
      colorA: '#f1f5f9',
      colorB: '#b9c9d8',
      forward: 1.8,
      gaps: 2,
    },
    moons: [],
  },

  lava: {
    kind: 'lava',
    label: 'Lava',
    seed: seedFor(5),
    tilt: 0.05,
    dayLength: 240,
    framing: 3.4,
    terrain: {
      style: 'lava',
      continentScale: 1.2,
      warp: 0.5,
      continentBias: 0.05,
      mountainScale: 3.4,
      mountainStrength: 0.35,
      hillStrength: 0.05,
      moistureScale: 2,
      craterDensity: 0,
      craterDepth: 0,
      crackScale: 2.2,
      reliefScale: 0.022,
    },
    surface: {
      seaLevel: -9,
      relief: 0.8,
      detail: 0.8,
      deepWater: '#000000',
      shallowWater: '#000000',
      shore: '#000000',
      lowDry: '#1d1917',
      lowWet: '#2a2420',
      highland: '#38302a',
      rock: '#141110',
      snow: '#4a4440',
      marking: '#3d1a10',
      iceCap: 2,
      snowLine: 9,
      waterRoughness: 0.5,
      glint: 0,
      emissive: '#ff6a1f',
      emissiveStrength: 5,
      ambient: 0.002,
    },
    clouds: {
      style: 'wisps',
      coverage: 0.38,
      scale: 1.8,
      threshold: 0.55,
      softness: 0.3,
      opacity: 0.7,
      color: '#4a403a',
      flow: 0.05,
      spin: 1.03,
      cyclones: 0,
      shadow: 0.3,
      height: 0.006,
    },
    atmosphere: {
      rayleigh: [2, 2.5, 3],
      rayleighHeight: 0.01,
      mie: 9,
      mieHeight: 0.007,
      mieG: 0.6,
      absorption: [0.5, 1.5, 3],
      ozoneCenter: 0,
      ozoneWidth: 0.03,
      thickness: 0.05,
      multiScatter: 0.3,
      airglow: '#ff5a2a',
      airglowStrength: 0.02,
    },
    moons: [{ kind: 'barren', radius: 0.16, distance: 5, period: 150, inclination: 0.06, phase: 2.6 }],
  },

  toxic: {
    kind: 'toxic',
    label: 'Toxic',
    seed: seedFor(6),
    tilt: 0.05,
    dayLength: 400,
    framing: 3.4,
    terrain: {
      style: 'continents',
      continentScale: 1.25,
      warp: 0.7,
      continentBias: -0.12,
      mountainScale: 3,
      mountainStrength: 0.4,
      hillStrength: 0.1,
      moistureScale: 2,
      craterDensity: 0,
      craterDepth: 0,
      crackScale: 0,
      reliefScale: 0.02,
    },
    surface: {
      seaLevel: 0,
      relief: 0.8,
      detail: 0.8,
      deepWater: '#1d260a',
      shallowWater: '#4a6214',
      shore: '#6a5f2e',
      lowDry: '#5b4f25',
      lowWet: '#3a4119',
      highland: '#4a4030',
      rock: '#2f2a22',
      snow: '#d6d39f',
      marking: '#000000',
      iceCap: 0.92,
      snowLine: 0.7,
      waterRoughness: 0.3,
      glint: 0.6,
      emissive: '#000000',
      emissiveStrength: 0,
      ambient: 0.003,
    },
    clouds: {
      style: 'haze',
      coverage: 0.56,
      scale: 1.6,
      threshold: 0.45,
      softness: 0.4,
      opacity: 0.88,
      color: '#cfc483',
      flow: 0.05,
      spin: 1.12,
      cyclones: 0,
      shadow: 0.3,
      height: 0.008,
    },
    atmosphere: {
      rayleigh: [2.6, 5, 3],
      rayleighHeight: 0.016,
      mie: 7,
      mieHeight: 0.012,
      mieG: 0.7,
      absorption: [0.6, 0.25, 5.5],
      ozoneCenter: 0.01,
      ozoneWidth: 0.05,
      thickness: 0.08,
      multiScatter: 0.45,
      airglow: '#b8d65a',
      airglowStrength: 0.02,
    },
    moons: [],
  },

  barren: {
    kind: 'barren',
    label: 'Barren',
    seed: seedFor(7),
    tilt: 0.02,
    dayLength: 500,
    framing: 3.4,
    terrain: BARREN_TERRAIN,
    surface: BARREN_SURFACE,
    moons: [],
  },

  gas: {
    kind: 'gas',
    label: 'Gas giant',
    seed: seedFor(8),
    tilt: 0.05,
    dayLength: 160,
    framing: 3.6,
    gas: {
      palette: ['#ede2cc', '#c6a17c', '#e2d0b2', '#a8805f', '#f3ede0', '#b88d68', '#d8c3a3', '#8f6d55', '#a3a49e'],
      bands: 15,
      turbulence: 1,
      poleColor: '#7d6a58',
      jetSpeed: 0.004,
      jetCount: 22,
      storms: [
        { lat: -0.36, lon: 1.2, radius: 0.11, color: '#c2603c' },
        { lat: 0.5, lon: 3.8, radius: 0.045, color: '#f4eee4' },
      ],
      stormSwirl: 2.6,
      limbDarkening: 0.7,
      ambient: 0.002,
    },
    atmosphere: {
      rayleigh: [1, 2, 4.5],
      rayleighHeight: 0.012,
      mie: 3,
      mieHeight: 0.01,
      mieG: 0.7,
      absorption: [0, 0.1, 0.6],
      ozoneCenter: 0.02,
      ozoneWidth: 0.04,
      thickness: 0.05,
      multiScatter: 0.3,
      airglow: '#000000',
      airglowStrength: 0,
    },
    moons: [
      { kind: 'barren', radius: 0.12, distance: 4.2, period: 90, inclination: 0.02, phase: 0.5 },
      { kind: 'ice', radius: 0.09, distance: 5.6, period: 140, inclination: 0.05, phase: 2 },
      { kind: 'barren', radius: 0.15, distance: 7.5, period: 230, inclination: 0.03, phase: 4.1 },
    ],
  },

  ringed: {
    kind: 'ringed',
    label: 'Ringed giant',
    seed: seedFor(9),
    tilt: 0.47,
    dayLength: 170,
    framing: 5.6,
    gas: {
      palette: ['#ecdcb2', '#d6bf8a', '#f1e6c6', '#c4a873', '#e4d1a2', '#d0b37f'],
      bands: 11,
      turbulence: 0.45,
      poleColor: '#8f8a72',
      jetSpeed: 0.003,
      jetCount: 16,
      storms: [],
      stormSwirl: 0,
      limbDarkening: 0.6,
      ambient: 0.002,
    },
    atmosphere: {
      rayleigh: [1, 1.6, 2.8],
      rayleighHeight: 0.012,
      mie: 4,
      mieHeight: 0.012,
      mieG: 0.7,
      absorption: [0, 0.2, 1.2],
      ozoneCenter: 0.02,
      ozoneWidth: 0.05,
      thickness: 0.05,
      multiScatter: 0.3,
      airglow: '#000000',
      airglowStrength: 0,
    },
    rings: {
      inner: 1.24,
      outer: 2.27,
      opacity: 0.92,
      colorA: '#d8c9a8',
      colorB: '#8e7f67',
      forward: 1.2,
      gaps: 3,
    },
    moons: [
      { kind: 'ice', radius: 0.11, distance: 3.6, period: 110, inclination: 0, phase: 1 },
      { kind: 'barren', radius: 0.17, distance: 6.8, period: 260, inclination: 0.04, phase: 3.4 },
    ],
  },

  'ice-giant': {
    kind: 'ice-giant',
    label: 'Ice giant',
    seed: seedFor(10),
    tilt: 0.49,
    dayLength: 190,
    framing: 3.6,
    gas: {
      palette: ['#3f6fd1', '#5c8ce2', '#2c56b1', '#7fa6ea', '#4673cf', '#335fbf'],
      bands: 8,
      turbulence: 0.6,
      poleColor: '#2a4c9a',
      jetSpeed: 0.005,
      jetCount: 10,
      storms: [{ lat: -0.3, lon: 2.2, radius: 0.08, color: '#1d3478' }],
      stormSwirl: 2,
      limbDarkening: 0.5,
      ambient: 0.002,
    },
    atmosphere: {
      rayleigh: [2.5, 6, 12],
      rayleighHeight: 0.012,
      mie: 2,
      mieHeight: 0.01,
      mieG: 0.7,
      absorption: [3, 0.6, 0],
      ozoneCenter: 0.02,
      ozoneWidth: 0.05,
      thickness: 0.05,
      multiScatter: 0.35,
      airglow: '#000000',
      airglowStrength: 0,
    },
    rings: {
      inner: 1.7,
      outer: 2.05,
      opacity: 0.12,
      colorA: '#8a96a4',
      colorB: '#5b6470',
      forward: 2,
      gaps: 1,
    },
    moons: [{ kind: 'ice', radius: 0.13, distance: 5, period: 170, inclination: 0.35, phase: 1 }],
  },
}

export const PLANET_KINDS = Object.keys(PRESETS) as PlanetKind[]

export function isPlanetKind(value: string | null | undefined): value is PlanetKind {
  return value !== null && value !== undefined && value in PRESETS
}

/** Small airless bodies: the barren and icy presets, reused for moons. */
export const MOON_SURFACES: Record<MoonSpec['kind'], { terrain: TerrainParams; surface: SurfaceParams }> = {
  barren: { terrain: BARREN_TERRAIN, surface: BARREN_SURFACE },
  ice: { terrain: { ...ICE_TERRAIN, crackScale: 3.4 }, surface: { ...ICE_SURFACE, iceCap: 2 } },
}

/** Radial density and colour profile of a ring system, sampled at `count` points. */
export function ringProfile(rings: RingParams, seed: number, count = 1024): Float32Array {
  // Deterministic sum of radial waves gives fine banding; gaps are smooth clean notches.
  let s = seed >>> 0
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const waves = Array.from({ length: 24 }, (_, i) => ({
    frequency: 6 + i * i * 2.5 + random() * 8,
    phase: random() * Math.PI * 2,
    amplitude: 0.5 / (1 + i * 0.35),
  }))
  const gaps = Array.from({ length: rings.gaps }, () => ({
    at: 0.2 + random() * 0.65,
    width: 0.012 + random() * 0.03,
  }))
  const out = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const x = i / (count - 1)
    let wave = 0
    for (const w of waves) wave += Math.sin(x * w.frequency + w.phase) * w.amplitude
    // Denser in the middle, thinning to soft edges.
    const body = Math.sin(Math.PI * Math.min(1, Math.max(0, x))) ** 0.6
    let density = body * (0.62 + 0.3 * Math.tanh(wave))
    for (const gap of gaps) density *= 1 - Math.exp(-(((x - gap.at) / gap.width) ** 2) * 2.5) * 0.92
    const tint = 0.5 + 0.5 * Math.sin(x * 9 + wave * 0.8)
    out[i * 2] = Math.min(1, Math.max(0, density))
    out[i * 2 + 1] = Math.min(1, Math.max(0, tint))
  }
  return out
}

/** Parse "#rrggbb" into sRGB components in [0, 1]. */
export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

/**
 * Colour of every latitude, from the south pole (index 0) to the north, as sRGB triples.
 * Bands have uneven widths and slightly soft edges; turbulence in the bake tears them up.
 */
export function bandPalette(gas: GasParams, seed: number, count = 256): Float32Array {
  let s = (seed ^ 0x5bd1e995) >>> 0
  const random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const edges: number[] = [0]
  for (let i = 1; i < gas.bands; i++) edges.push(i / gas.bands + (random() - 0.5) * (0.6 / gas.bands))
  edges.push(1)
  const colours = edges.slice(0, -1).map(() => hexToRgb(gas.palette[Math.floor(random() * gas.palette.length)]!))
  const softness = 0.4 / gas.bands
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const y = i / (count - 1)
    let band = 0
    while (band < colours.length - 1 && y >= edges[band + 1]!) band++
    const own = colours[band]!
    const next = colours[Math.min(band + 1, colours.length - 1)]!
    const toEdge = edges[band + 1]! - y
    const t = band < colours.length - 1 ? Math.max(0, 1 - toEdge / softness) * 0.5 : 0
    for (let c = 0; c < 3; c++) out[i * 3 + c] = own[c]! + (next[c]! - own[c]!) * t
  }
  return out
}
