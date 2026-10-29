/**
 * Quality tiers. A first guess comes from the device (GPU string, memory, cores, touch);
 * the frame-rate governor then steps down when frames drop and back up when there is
 * headroom, with hysteresis so it never oscillates. Ultra (HD) is above them all: the default
 * on a computer, and otherwise chosen with the HD button or `?quality=ultra`. The governor
 * never reaches it or leaves it.
 */
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra'

/** The governor's ladder. Ultra is not on it. */
export const TIERS: readonly QualityTier[] = ['low', 'medium', 'high']

export interface QualitySettings {
  /** Upper bound for the device pixel ratio. */
  readonly maxDpr: number
  /**
   * The pixel ratio at the black hole, once the camera has settled there, where it is lower
   * than usual: the hole is the one place that is traced, and on the weakest GPUs it alone runs
   * over a frame's budget. Its light is soft; a little fewer pixels barely show.
   */
  readonly holeDpr: number
  /** Share of the star catalogue drawn, brightest first (30k / 15k / 6k). */
  readonly starFraction: number
  /** Film grain strength. Low keeps only the dither that prevents banding. */
  readonly grain: number
  /** Width in texels of the baked galactic band. */
  readonly bandWidth: number
  /** Face size of a planet's baked terrain and cloud cube maps. */
  readonly planetFace: number
  /** Face size of a moon's cube maps. */
  readonly moonFace: number
  /** Raymarch steps through an atmosphere. */
  readonly atmosphereSteps: number
  /** Octaves of per-pixel surface detail seen up close. */
  readonly detailOctaves: number
  /** Particles drawing a galaxy: its light and its dust together. */
  readonly galaxyParticles: number
  /** Particles drawing each galaxy seen from the universe. */
  readonly universeParticles: number
  /** Faint distant galaxies in the universe's deep field. */
  readonly deepField: number
  /** Soft clouds of the cosmic web's gas. */
  readonly webGas: number
  /** Collectors in an arc built around a star. */
  readonly swarmCollectors: number
}

/** Stars in the full catalogue; tiers draw a fraction of it. */
export const STAR_CATALOGUE_SIZE = 30000

// prettier-ignore
export const QUALITY: Record<QualityTier, QualitySettings> = {
  ultra: { maxDpr: 2, holeDpr: 2, starFraction: 1, grain: 1, bandWidth: 4096, planetFace: 2048, moonFace: 512, atmosphereSteps: 18, detailOctaves: 4, galaxyParticles: 800000, universeParticles: 10000, deepField: 9000, webGas: 12000, swarmCollectors: 8000 },
  high: { maxDpr: 2, holeDpr: 2, starFraction: 1, grain: 1, bandWidth: 2048, planetFace: 1024, moonFace: 384, atmosphereSteps: 14, detailOctaves: 3, galaxyParticles: 400000, universeParticles: 6000, deepField: 6000, webGas: 9000, swarmCollectors: 6000 },
  medium: { maxDpr: 1.5, holeDpr: 1.5, starFraction: 0.5, grain: 1, bandWidth: 2048, planetFace: 768, moonFace: 256, atmosphereSteps: 10, detailOctaves: 2, galaxyParticles: 200000, universeParticles: 3600, deepField: 4000, webGas: 6000, swarmCollectors: 4000 },
  low: { maxDpr: 1, holeDpr: 0.85, starFraction: 0.2, grain: 0, bandWidth: 1024, planetFace: 512, moonFace: 192, atmosphereSteps: 5, detailOctaves: 1, galaxyParticles: 80000, universeParticles: 2200, deepField: 2500, webGas: 3500, swarmCollectors: 2500 },
}

export interface GpuInfo {
  readonly webgl2: boolean
  readonly renderer: string
}

export interface DeviceHints {
  /** navigator.deviceMemory in GB (Chromium only). */
  readonly memory?: number
  /** navigator.hardwareConcurrency. */
  readonly cores?: number
  /** Primary pointer is coarse: a phone or tablet. */
  readonly touch: boolean
}

export function parseTier(value: string | null | undefined): QualityTier | null {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'ultra' ? value : null
}

/** One step along the governor's ladder. Ultra was chosen, so it stays. */
export function stepTier(tier: QualityTier, direction: -1 | 1): QualityTier {
  if (tier === 'ultra') return tier
  const index = TIERS.indexOf(tier) + direction
  return TIERS[Math.min(Math.max(index, 0), TIERS.length - 1)]!
}

/**
 * The canvas's pixel ratio, or the range R3F clamps the device's into. Ultra draws at least
 * one and a half pixels for every screen pixel, at most two: on a 1080p laptop that
 * supersamples, so stars are round and edges smooth; on a retina screen it is the screen.
 */
export function renderDpr(tier: QualityTier, deviceDpr: number): number | [number, number] {
  if (tier === 'ultra') return Math.min(2, Math.max(1.5, deviceDpr))
  return [1, QUALITY[tier].maxDpr]
}

/** Atlas and noise textures: 2048 on Ultra, 512 on Low, 1024 otherwise. */
export function textureSize(tier: QualityTier): number {
  return tier === 'ultra' ? 2048 : tier === 'low' ? 512 : 1024
}

/** Whether HD is on before the visitor has chosen: on a computer with a real GPU, yes. */
export function defaultsToHd(gpu: GpuInfo, hints: DeviceHints): boolean {
  return !hints.touch && !isSoftware(gpu)
}

function isSoftware(gpu: GpuInfo): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/.test(gpu.renderer.toLowerCase())
}

/** Best first guess before any frame has been measured. */
export function guessTier(gpu: GpuInfo, hints: DeviceHints): QualityTier {
  const renderer = gpu.renderer.toLowerCase()
  if (isSoftware(gpu)) return 'low'

  let tier: QualityTier = 'high'
  if (hints.touch) {
    // Recent Apple, Adreno 7xx/8xx and Mali-G7xx+/Immortalis GPUs handle medium on phones.
    const strongMobile = /apple|adreno[^0-9]*[78]\d\d|mali-g(7[1-9]|[89]\d|\d{3})|immortalis/.test(
      renderer,
    )
    tier = strongMobile ? 'medium' : 'low'
  } else if (/intel/.test(renderer) && !/iris|arc|xe/.test(renderer)) {
    // Older integrated Intel (HD, UHD 620 and friends) is bandwidth-starved: measured at
    // about 27 fps at a 1.5 pixel ratio, 60 fps at 1. Iris Xe and Arc start high.
    tier = 'low'
  }

  if (hints.memory !== undefined && hints.memory <= 2) return 'low'
  if (hints.cores !== undefined && hints.cores <= 2) return 'low'
  if (hints.memory !== undefined && hints.memory <= 4 && tier === 'high') tier = 'medium'
  return tier
}

/**
 * Inspect the GPU with a throwaway WebGL2 context. Chrome masks RENDERER and needs the debug
 * extension; Firefox already reports the real string and warns if the extension is touched,
 * so the extension is only asked for when RENDERER is masked.
 */
export function probeGpu(): GpuInfo {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return { webgl2: false, renderer: '' }
    let renderer = String(gl.getParameter(gl.RENDERER) ?? '')
    if (/^(webkit webgl|mozilla)?$/i.test(renderer.trim())) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo)
        renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? renderer)
    }
    return { webgl2: true, renderer }
  } catch {
    return { webgl2: false, renderer: '' }
  }
}

export function readDeviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    memory: nav.deviceMemory,
    cores: nav.hardwareConcurrency || undefined,
    touch: window.matchMedia('(pointer: coarse)').matches,
  }
}
