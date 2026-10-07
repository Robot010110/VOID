/**
 * How a black hole bends light, in units of its Schwarzschild radius: plain math (no three.js),
 * for the post effect that bends the scene behind the hole, and for tests.
 */

/** The photon sphere: light can circle the hole here, unstably. */
export const PHOTON_SPHERE = 1.5

/** Rays aimed closer than this (their impact parameter) fall in: the edge of the hole's shadow. */
export const CRITICAL_IMPACT = (3 * Math.sqrt(3)) / 2

/** Carlson's symmetric elliptic integral of the first kind, by duplication. */
function carlsonRF(x: number, y: number, z: number): number {
  for (let i = 0; i < 60; i++) {
    const mean = (x + y + z) / 3
    if (Math.max(Math.abs(x - mean), Math.abs(y - mean), Math.abs(z - mean)) < 1e-9 * mean) break
    const lambda = Math.sqrt(x * y) + Math.sqrt(y * z) + Math.sqrt(z * x)
    x = (x + lambda) / 4
    y = (y + lambda) / 4
    z = (z + lambda) / 4
  }
  const mean = (x + y + z) / 3
  const dx = 1 - x / mean
  const dy = 1 - y / mean
  const dz = 1 - z / mean
  const e2 = dx * dy - dz * dz
  const e3 = dx * dy * dz
  return (1 - e2 / 10 + e3 / 14 + (e2 * e2) / 24 - (3 * e2 * e3) / 44) / Math.sqrt(mean)
}

/** Closest approach of a ray with impact parameter `b` (larger than the critical one). */
export function periapsis(b: number): number {
  return ((2 * b) / Math.sqrt(3)) * Math.cos(Math.acos(-CRITICAL_IMPACT / b) / 3)
}

/**
 * How far a ray passing from infinity to infinity is turned, in radians: Darwin's exact
 * result in elliptic integrals. About 2 / b far from the hole, and without limit as the ray
 * nears the critical impact parameter, where it circles the photon sphere before escaping.
 */
export function deflection(b: number): number {
  const p = periapsis(b)
  const q = Math.sqrt((p - 1) * (p + 3))
  const k2 = (q - p + 3) / (2 * q)
  const sin2 = (q - p + 1) / (q - p + 3)
  const complete = carlsonRF(0, 1 - k2, 1)
  const partial = Math.sqrt(sin2) * carlsonRF(1 - sin2, 1 - k2 * sin2, 1)
  return -Math.PI + 4 * Math.sqrt(p / q) * (complete - partial)
}

/** Deflection far from the hole: the weak-field series to second order. */
export function weakDeflection(b: number): number {
  return 2 / b + (15 * Math.PI) / (16 * b * b)
}

/** Deflection just outside the critical impact parameter: the strong-field limit. */
export function strongDeflection(b: number): number {
  return -Math.log(b / CRITICAL_IMPACT - 1) + Math.log(216 * (7 - 4 * Math.sqrt(3))) - Math.PI
}

export interface DeflectionTable {
  readonly values: Float32Array
  /** The range sampled, in log(b / critical - 1). */
  readonly from: number
  readonly to: number
}

/**
 * Deflection sampled evenly in log(b / critical - 1), for a texture the GPU looks up. Below the
 * table the strong-field limit is exact enough; above it, the weak-field series.
 */
export function deflectionTable(size = 256, from = Math.log(1e-3), to = Math.log(40)): DeflectionTable {
  const values = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const s = from + ((to - from) * i) / (size - 1)
    values[i] = deflection(CRITICAL_IMPACT * (1 + Math.exp(s)))
  }
  return { values, from, to }
}
