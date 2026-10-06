/** Starlight at a world, and how much of a light the bodies in front of it hide. */
import { Color, Vector3 } from 'three'
import { blackbody } from '../../core/blackbody.ts'
import type { Sunlight } from './body.ts'

/**
 * Light from a star of `temperature` kelvin: its blackbody colour, scaled so a white surface
 * facing the star has a radiance of about 0.95 x `strength`, just under the bloom threshold.
 * Only light sources (the sun, glints, city lights, lava) rise above it.
 */
export function starlight(temperature: number, strength = 1, direction = new Vector3(0, 0, 1)): Sunlight {
  const [r, g, b] = blackbody(temperature)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const scale = (Math.PI * 0.95 * strength) / luminance
  return { direction, irradiance: new Color(r * scale, g * scale, b * scale) }
}

const toBody = new Vector3()

/**
 * The share of a light (a disc of `lightRadius` radians, `lightDistance` away along unit
 * vector `toLight`) that a sphere hides from `eye`: 1 when the disc is fully behind it, 0
 * when clear, a smooth ramp while the limb crosses it.
 */
export function hiddenBy(
  eye: Vector3,
  toLight: Vector3,
  lightDistance: number,
  lightRadius: number,
  center: Vector3,
  radius: number,
): number {
  toBody.subVectors(center, eye)
  const distance = toBody.length()
  if (distance <= radius) return 1
  if (distance - radius > lightDistance) return 0
  const separation = Math.acos(Math.min(1, Math.max(-1, toBody.dot(toLight) / distance)))
  const size = Math.asin(Math.min(1, radius / distance))
  const t = (separation - (size - lightRadius)) / Math.max(2 * lightRadius, 1e-5)
  const ramp = Math.min(1, Math.max(0, t))
  return 1 - ramp * ramp * (3 - 2 * ramp)
}
