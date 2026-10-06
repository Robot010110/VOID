import type { PlanetPreset } from '../../core/planets.ts'
import type { Vec3 } from '../../core/sky.ts'
import { SYSTEM_EXTENT, type SystemData } from '../../core/universe.ts'

/** A named framing: orbit angles (three.js spherical convention) and optional distance. */
export interface OrbitView {
  azimuth: number
  polar: number
  distance?: number
}

export interface Limits {
  min: number
  max: number
}

/** The orbit whose camera looks along `direction` towards the centre. */
export function lookingAlong(direction: Vec3): OrbitView {
  const [x, y, z] = direction
  return { azimuth: Math.atan2(-x, -z), polar: Math.acos(Math.max(-1, Math.min(1, -y))) }
}

/**
 * A system at rest: the star at the centre, seen from a little above the plane of its
 * orbits, far enough out that the inner worlds and the habitable zone fill the frame and
 * the outer orbits sweep past its edges.
 */
export function systemView(system: SystemData): Required<OrbitView> {
  return {
    azimuth: 0.62,
    polar: 1.13,
    distance: Math.min(Math.max(system.habitable * 3.4, 150), 430),
  }
}

/** Named framings of a system for `?view=`. */
export function systemViews(system: SystemData): Record<string, OrbitView> {
  const home = systemView(system)
  return {
    home,
    top: { azimuth: home.azimuth, polar: 0.16, distance: home.distance * 1.15 },
    edge: { azimuth: home.azimuth, polar: 1.5, distance: home.distance },
    wide: { azimuth: home.azimuth, polar: 1.0, distance: SYSTEM_EXTENT * 2.2 },
    star: { azimuth: home.azimuth, polar: 1.32, distance: system.star.radius * 3.2 },
  }
}

export function systemLimits(system: SystemData): Limits {
  return { min: system.star.radius * 2.6, max: SYSTEM_EXTENT * 2.4 }
}

export function planetLimits(preset: PlanetPreset): Limits {
  return { min: 1.32, max: Math.max(preset.framing * 3, 10) }
}

/**
 * Named framings around a planet, relative to its sun. `home` is the opening shot: the
 * planet in front of its star, which sits just beyond the limb: beside it on a wide screen,
 * rising below it on a tall one, where the planet also stands a little further back.
 */
export function planetViews(sun: Vec3, framing: number, portrait: boolean): Record<string, OrbitView> {
  const sunAzimuth = Math.atan2(sun[0], sun[2])
  const sunPolar = Math.acos(Math.max(-1, Math.min(1, sun[1])))
  const awayAzimuth = sunAzimuth + Math.PI
  const awayPolar = Math.PI - sunPolar
  const home = portrait
    ? { azimuth: awayAzimuth - 0.06, polar: awayPolar + 0.42, distance: framing * 1.25 }
    : { azimuth: awayAzimuth - 0.42, polar: awayPolar + 0.08, distance: framing }
  return {
    home,
    night: { azimuth: awayAzimuth - 0.85, polar: awayPolar - 0.12, distance: framing },
    terminator: { azimuth: sunAzimuth + Math.PI / 2, polar: 1.42, distance: framing },
    day: { azimuth: sunAzimuth + 0.5, polar: 1.2, distance: framing },
    pole: { azimuth: sunAzimuth + 1.1, polar: 0.4, distance: framing },
    close: { azimuth: sunAzimuth + Math.PI / 2 - 0.2, polar: 1.36, distance: 1.6 },
  }
}
