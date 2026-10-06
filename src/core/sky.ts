/**
 * The background sky: a deterministic catalogue of stars in three parallax layers, shaped
 * like the view from inside a disc galaxy. Stars crowd towards a great circle (the band),
 * thicken towards the galactic core, and gather in a few young open clusters. The band's
 * diffuse glow and dust are rendered on the GPU from the same frame (see Starfield.tsx), and
 * the dust dims the stars behind it there too, so lanes in the light and gaps in the stars
 * always line up.
 *
 * Plain data only: no three.js, so it runs in tests and could move to a worker.
 */
import { Rng } from './rng.ts'

export type Vec3 = readonly [number, number, number]
export type StarLayerKind = 'far' | 'mid' | 'near'

export interface StarLayer {
  readonly kind: StarLayerKind
  readonly count: number
  /** Unit directions, xyz interleaved. */
  readonly direction: Float32Array
  /** Peak brightness of the star's core in linear light (before grading). */
  readonly flux: Float32Array
  /** Surface temperature in kelvin. */
  readonly temperature: Float32Array
  /** Twinkle phase (radians) and angular speed (radians per second), interleaved. */
  readonly twinkle: Float32Array
  /** Diffraction spike strength, 0 for all but the brightest half percent. */
  readonly spike: Float32Array
  /** Position in the brightness-first draw order, in [0, 1). Lower tiers draw a prefix. */
  readonly rank: Float32Array
}

export interface BandFrame {
  /** Unit vector towards the galactic core: band longitude 0. */
  readonly core: Vec3
  /** Unit normal of the band's plane: band latitude +90 degrees. */
  readonly pole: Vec3
  /** Rotation from world directions into band coordinates, row-major 3x3. */
  readonly worldToBand: readonly number[]
}

export interface Sky {
  readonly seed: number
  readonly band: BandFrame
  readonly layers: readonly StarLayer[]
}

interface LayerSpec {
  readonly kind: StarLayerKind
  /** Share of the whole catalogue. */
  readonly share: number
  /** Share of this layer drawn along the band rather than evenly over the sky. */
  readonly bandShare: number
  /** Angular half-thickness of this layer's band, radians. */
  readonly bandSigma: number
  /** Share of this layer packed into the core's bulge. */
  readonly bulgeShare: number
  readonly fluxMin: number
  readonly fluxMax: number
  /** Power-law slope: higher means more faint stars. */
  readonly slope: number
}

// Far: dense, tiny, dim. Mid: the body of the sky. Near: sparse, larger, brighter.
// prettier-ignore
const LAYERS: readonly LayerSpec[] = [
  { kind: 'far', share: 0.74, bandShare: 0.72, bandSigma: 0.085, bulgeShare: 0.14, fluxMin: 0.025, fluxMax: 0.4, slope: 1.7 },
  { kind: 'mid', share: 0.2, bandShare: 0.38, bandSigma: 0.16, bulgeShare: 0.03, fluxMin: 0.08, fluxMax: 2.2, slope: 1.45 },
  { kind: 'near', share: 0.06, bandShare: 0.1, bandSigma: 0.32, bulgeShare: 0, fluxMin: 0.18, fluxMax: 12, slope: 1.2 },
]

/** Brightest fraction of all stars that carry diffraction spikes. */
export const SPIKE_FRACTION = 0.005

// Spectral classes and their temperature ranges (kelvin): M, K, G, F, A, B/O.
const CLASS_RANGES: ReadonlyArray<readonly [number, number]> = [
  [2500, 3700],
  [3700, 5200],
  [5200, 6000],
  [6000, 7500],
  [7500, 10000],
  [10000, 30000],
]
const CLASS_INDICES = [0, 1, 2, 3, 4, 5] as const
// Faint stars are mostly cool dwarfs; the bright end mixes hot blue stars and orange giants.
const FAINT_CLASS_WEIGHTS = [40, 32, 14, 8, 4, 2] as const
const BRIGHT_CLASS_WEIGHTS = [8, 30, 12, 13, 20, 17] as const

const LOG_FLUX_MIN = Math.log(0.03)
const LOG_FLUX_MAX = Math.log(14)

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  v[0] /= len
  v[1] /= len
  v[2] /= len
  return v
}

function cross(a: Vec3, b: Vec3): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Build a band frame from a core direction and an approximate pole (re-orthogonalised). */
export function makeBandFrame(core: Vec3, pole: Vec3): BandFrame {
  const z = normalize([core[0], core[1], core[2]])
  const x = normalize(cross(pole, z))
  const y = cross(z, x)
  return { core: z, pole: y, worldToBand: [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]] }
}

/**
 * The home sky's band, composed for the opening view: the camera starts looking down -Z,
 * and the band crosses the frame on a rising diagonal with the bright core off to the right.
 */
export const HOME_BAND: BandFrame = (() => {
  const tilt = (24 * Math.PI) / 180
  const along: Vec3 = [Math.cos(tilt), Math.sin(tilt), 0]
  const forward: Vec3 = [0, -0.12, -1]
  const pole = normalize(cross(along, forward))
  const coreAngle = (22 * Math.PI) / 180
  const f = normalize([forward[0], forward[1], forward[2]])
  const core: Vec3 = [
    f[0] * Math.cos(coreAngle) + along[0] * Math.sin(coreAngle),
    f[1] * Math.cos(coreAngle) + along[1] * Math.sin(coreAngle),
    f[2] * Math.cos(coreAngle) + along[2] * Math.sin(coreAngle),
  ]
  return makeBandFrame(core, pole)
})()

/** Band coordinates (longitude, latitude in radians) to a world direction. */
export function bandToWorld(
  frame: BandFrame,
  lon: number,
  lat: number,
  out: [number, number, number],
) {
  const cl = Math.cos(lat)
  const bx = cl * Math.sin(lon)
  const by = Math.sin(lat)
  const bz = cl * Math.cos(lon)
  const m = frame.worldToBand
  // Transpose of worldToBand takes band coordinates back to world.
  out[0] = m[0]! * bx + m[3]! * by + m[6]! * bz
  out[1] = m[1]! * bx + m[4]! * by + m[7]! * bz
  out[2] = m[2]! * bx + m[5]! * by + m[8]! * bz
  return out
}

/** Latitude (radians) of a world direction above the band's plane. */
export function bandLatitude(frame: BandFrame, x: number, y: number, z: number): number {
  const p = frame.pole
  return Math.asin(Math.max(-1, Math.min(1, x * p[0] + y * p[1] + z * p[2])))
}

function wrapAngle(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI))
}

function sampleTemperature(rng: Rng, brightness: number): number {
  const weights = FAINT_CLASS_WEIGHTS.map((w, i) => w + (BRIGHT_CLASS_WEIGHTS[i]! - w) * brightness)
  const [lo, hi] = CLASS_RANGES[rng.weighted(CLASS_INDICES, weights)]!
  return Math.exp(rng.range(Math.log(lo), Math.log(hi)))
}

function brightnessOf(flux: number): number {
  const b = (Math.log(flux) - LOG_FLUX_MIN) / (LOG_FLUX_MAX - LOG_FLUX_MIN)
  return Math.pow(Math.min(Math.max(b, 0), 1), 0.7)
}

interface Draft {
  dir: [number, number, number]
  flux: number
  temperature: number
}

interface Cluster {
  centre: [number, number, number]
  radius: number
  members: number
}

/** Generate the sky. Deterministic: the same seed and count always give the same stars. */
export function generateSky(seed: number, count: number, band: BandFrame = HOME_BAND): Sky {
  const rng = new Rng(seed)

  const bandDirection = (sigma: number, out: [number, number, number]) => {
    const lon = rng.chance(0.38) ? wrapAngle(rng.gauss(0, 0.6)) : rng.range(-Math.PI, Math.PI)
    const towardCore = Math.exp((-lon * lon) / (2 * 0.36 * 0.36))
    const lat = rng.gauss(0, sigma * (1 + 0.9 * towardCore))
    return bandToWorld(band, lon, lat, out)
  }
  const bulgeDirection = (out: [number, number, number]) =>
    bandToWorld(band, rng.gauss(0, 0.22), rng.gauss(0, 0.13), out)

  // Young open clusters sit close to the band; their members come from the mid and near layers.
  const clusters: Cluster[] = Array.from({ length: 9 }, () => ({
    centre: [...bandDirection(0.12, [0, 0, 0])] as [number, number, number],
    radius: rng.range(0.004, 0.016),
    members: Math.round(rng.range(18, 55) * Math.min(1, count / 30000)),
  }))
  const clusterStars = clusters.reduce((sum, c) => sum + c.members, 0)

  const drafts: Draft[][] = []
  let remaining = count
  LAYERS.forEach((spec, layerIndex) => {
    const isLast = layerIndex === LAYERS.length - 1
    const layerCount = isLast ? remaining : Math.round(count * spec.share)
    remaining -= layerCount
    const stars: Draft[] = []
    const clusterBudget =
      spec.kind === 'mid'
        ? Math.round(clusterStars * 0.75)
        : spec.kind === 'near'
          ? clusterStars - Math.round(clusterStars * 0.75)
          : 0
    const free = Math.max(0, layerCount - clusterBudget)

    for (let i = 0; i < free; i++) {
      const dir: [number, number, number] = [0, 0, 0]
      const roll = rng.next()
      if (roll < spec.bulgeShare) bulgeDirection(dir)
      else if (roll < spec.bulgeShare + spec.bandShare) bandDirection(spec.bandSigma, dir)
      else rng.onSphere(dir)
      const flux = Math.min(rng.pareto(spec.fluxMin, spec.slope), spec.fluxMax)
      stars.push({ dir, flux, temperature: sampleTemperature(rng, brightnessOf(flux)) })
    }
    drafts.push(stars)
  })

  // Distribute cluster members: hot, fairly bright, packed into a small cap around each centre.
  const midStars = drafts[1]!
  const nearStars = drafts[2]!
  let midBudget = Math.round(clusterStars * 0.75)
  for (const cluster of clusters) {
    const c = cluster.centre
    // Two tangent vectors around the centre.
    const helper: Vec3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const u = normalize(cross(c, helper))
    const v = cross(c, u)
    for (let m = 0; m < cluster.members; m++) {
      const a = rng.gauss(0, cluster.radius)
      const b = rng.gauss(0, cluster.radius)
      const dir = normalize([
        c[0] + u[0] * a + v[0] * b,
        c[1] + u[1] * a + v[1] * b,
        c[2] + u[2] * a + v[2] * b,
      ])
      const toMid = midBudget > 0
      const flux = Math.min(rng.pareto(toMid ? 0.12 : 0.3, 1.3), toMid ? 2.2 : 6)
      const temperature = Math.exp(rng.range(Math.log(7000), Math.log(22000)))
      ;(toMid ? midStars : nearStars).push({ dir, flux, temperature })
      if (toMid) midBudget--
    }
  }

  // Spikes for the brightest half percent of the whole sky.
  const allFlux = drafts.flat().map((s) => s.flux)
  const sorted = [...allFlux].sort((a, b) => b - a)
  const spikeCount = Math.max(1, Math.round(sorted.length * SPIKE_FRACTION))
  const spikeThreshold = sorted[spikeCount - 1] ?? Infinity
  const spikeSpan = Math.max(Math.log((sorted[0] ?? 1) / spikeThreshold), 1e-3)

  // Brightness-first draw order with a little jitter, so lower tiers keep the bright sky.
  const order = allFlux
    .map((flux, index) => ({ index, priority: Math.log(flux) + rng.gauss(0, 0.3) }))
    .sort((a, b) => b.priority - a.priority)
  const rankOf = new Float32Array(allFlux.length)
  order.forEach((entry, position) => {
    rankOf[entry.index] = (position + 0.5) / allFlux.length
  })

  let globalIndex = 0
  const layers: StarLayer[] = drafts.map((stars, layerIndex) => {
    const n = stars.length
    const layer: StarLayer = {
      kind: LAYERS[layerIndex]!.kind,
      count: n,
      direction: new Float32Array(n * 3),
      flux: new Float32Array(n),
      temperature: new Float32Array(n),
      twinkle: new Float32Array(n * 2),
      spike: new Float32Array(n),
      rank: new Float32Array(n),
    }
    stars.forEach((star, i) => {
      layer.direction[i * 3] = star.dir[0]
      layer.direction[i * 3 + 1] = star.dir[1]
      layer.direction[i * 3 + 2] = star.dir[2]
      layer.flux[i] = star.flux
      layer.temperature[i] = star.temperature
      const b = brightnessOf(star.flux)
      layer.twinkle[i * 2] = rng.range(0, Math.PI * 2)
      // Bright stars twinkle more slowly.
      layer.twinkle[i * 2 + 1] = (2.4 + (0.6 - 2.4) * b) * rng.range(0.75, 1.3)
      layer.spike[i] =
        star.flux >= spikeThreshold
          ? 0.35 + 0.65 * Math.min(1, Math.log(star.flux / spikeThreshold) / spikeSpan)
          : 0
      layer.rank[i] = rankOf[globalIndex++]!
    })
    return layer
  })

  return { seed: rng.seed, band, layers }
}
