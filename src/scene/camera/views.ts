import type { Vec3 } from '../../core/sky.ts'

/** A named framing: orbit angles (three.js spherical convention) and optional distance. */
export interface OrbitView {
  azimuth: number
  polar: number
  distance?: number
}

/** The orbit whose camera looks along `direction` towards the centre. */
export function lookingAlong(direction: Vec3): OrbitView {
  const [x, y, z] = direction
  return { azimuth: Math.atan2(-x, -z), polar: Math.acos(Math.max(-1, Math.min(1, -y))) }
}
