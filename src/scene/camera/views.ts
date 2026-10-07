import { HOLE_POLAR, type HoleSite, type Universe } from '../../core/cosmos.ts'
import { nebulaPosition, type GalaxyLook } from '../../core/galaxy.ts'
import type { PlanetPreset } from '../../core/planets.ts'
import type { Vec3 } from '../../core/sky.ts'
import { SYSTEM_EXTENT, type SystemData } from '../../core/universe.ts'

/** A named framing: orbit angles (three.js spherical convention), distance and centre. */
export interface OrbitView {
  azimuth: number
  polar: number
  distance?: number
  /** What the camera orbits, if not the level's centre. */
  center?: readonly [number, number, number]
}

/** A level's resting framing: around its centre, at a set distance. */
export type RestView = Required<Omit<OrbitView, 'center'>>

export interface Limits {
  min: number
  max: number
}

/** The orbit whose camera looks along `direction` towards the centre. */
export function lookingAlong(direction: Vec3): OrbitView {
  const [x, y, z] = direction
  return { azimuth: Math.atan2(-x, -z), polar: Math.acos(Math.max(-1, Math.min(1, -y))) }
}

/** A tall screen, where a wide subject needs the camera further back. */
export function isPortrait(): boolean {
  return window.innerWidth < window.innerHeight * 0.85
}

/**
 * The universe at rest: seen from outside its web and a little above it, the whole web in view
 * with room around it. A tall screen stands further back.
 */
export function universeView(portrait = false): RestView {
  return { azimuth: 0.62, polar: 1.12, distance: portrait ? 2700 : 1850 }
}

/** Named framings of the universe for `?view=`. */
export function universeViews(universe: Universe, portrait = false): Record<string, OrbitView> {
  const home = universeView(portrait)
  const cluster = universe.nodes[0]!
  const local = universe.galaxies[0]!
  const nebula = universe.nebulae[1] ?? universe.nebulae[0]!
  return {
    home,
    top: { azimuth: home.azimuth, polar: 0.18, distance: home.distance * 1.1 },
    edge: { azimuth: home.azimuth, polar: 1.5, distance: home.distance },
    wide: { azimuth: home.azimuth, polar: 1.05, distance: home.distance * 1.7 },
    cluster: { azimuth: 0.9, polar: 1.12, distance: cluster.radius * 5, center: cluster.position },
    local: { azimuth: 0.5, polar: 1.0, distance: local.size * 16, center: local.position },
    nebula: { azimuth: 0.3, polar: 1.2, distance: nebula.size * 3.4, center: nebula.position },
    hole: { azimuth: 0.7, polar: 1.25, distance: 160, center: universe.hole.position },
  }
}

/** Close enough to pick out a cluster's galaxies, never inside one of them. */
export function universeLimits(): Limits {
  return { min: 220, max: 5200 }
}

/**
 * The black hole at rest: its disc nearly edge-on, seen from a little above, the nebula it
 * hangs in front of right behind it.
 */
export function holeView(hole: HoleSite, portrait = false): RestView {
  return { azimuth: 0, polar: HOLE_POLAR, distance: hole.radius * (portrait ? 46 : 32) }
}

/** Named framings of the black hole for `?view=`. */
export function holeViews(hole: HoleSite, portrait = false): Record<string, OrbitView> {
  const home = holeView(hole, portrait)
  return {
    home,
    top: { azimuth: 0, polar: 0.4, distance: home.distance },
    edge: { azimuth: 0, polar: 1.565, distance: home.distance },
    close: { azimuth: 0.35, polar: 1.3, distance: hole.radius * 15 },
    far: { azimuth: 0, polar: HOLE_POLAR, distance: hole.radius * 120 },
  }
}

export function holeLimits(hole: HoleSite): Limits {
  return { min: hole.radius * 8, max: hole.radius * 240 }
}

/**
 * A galaxy at rest: seen from well above its plane and a little turned, so its arms read as
 * a spiral with depth and the whole disc fills the frame with room to spare. A tall screen
 * stands further back, to keep the disc's width in view.
 */
export function galaxyView(galaxy: GalaxyLook, portrait = false): RestView {
  return { azimuth: 0.35, polar: 0.9, distance: galaxy.shape.radius * (portrait ? 3.4 : 2.3) }
}

/** Named framings of a galaxy for `?view=`. */
export function galaxyViews(galaxy: GalaxyLook, portrait = false): Record<string, OrbitView> {
  const home = galaxyView(galaxy, portrait)
  return {
    home,
    top: { azimuth: home.azimuth, polar: 0.12, distance: home.distance * 1.08 },
    edge: { azimuth: home.azimuth, polar: 1.53, distance: home.distance },
    core: { azimuth: home.azimuth + 0.5, polar: 1.12, distance: galaxy.shape.radius * 0.75 },
    wide: { azimuth: home.azimuth, polar: 1.05, distance: home.distance * 1.7 },
    nebula: nebulaView(galaxy),
  }
}

/** Close to the galaxy's brightest emission nebula, for looking at one. */
function nebulaView(galaxy: GalaxyLook): OrbitView {
  const nebula = galaxy.nebulae.filter((n) => n.kind === 'emission').sort((a, b) => b.size - a.size)[0] ?? galaxy.nebulae[0]
  if (!nebula) return galaxyView(galaxy)
  return { azimuth: 0.9, polar: 1.05, distance: nebula.size * 5, center: nebulaPosition(galaxy, nebula, 0) }
}

export function galaxyLimits(galaxy: GalaxyLook): Limits {
  return { min: galaxy.shape.radius * 0.3, max: galaxy.shape.radius * 4.2 }
}

/**
 * A system at rest: the star at the centre, seen from a little above the plane of its
 * orbits, far enough out that the inner worlds and the habitable zone fill the frame and
 * the outer orbits sweep past its edges.
 */
export function systemView(system: SystemData): RestView {
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
