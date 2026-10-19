/**
 * The trailer's director. It runs on the film clock (world time, so a render steps it exactly),
 * fires each shot at its moment, and moves the real camera through the real universe: the
 * opening's pull-back, chained falls, flights to a framing, cuts. Each place a shot needs is
 * put on stage unseen ahead of time (`filmWarm`), so it is built and compiled before it is
 * seen; if one is not ready when its moment comes, the film waits for it: in a render, frames
 * are simply not taken; live, world time stands still on a held frame. The words and the veil
 * are painted from the same clock (FilmOverlay), and the music is cued from it (score.ts).
 */
import { Vector3 } from 'three'
import { getUniverse } from '../core/cosmos.ts'
import { SHOT } from '../core/env.ts'
import { galaxyLimits, galaxyView, holeLimits, holeView, isPortrait, planetLimits, planetViews, systemView } from '../scene/camera/views.ts'
import { getGalaxy, getGalaxyLook } from '../core/galaxy.ts'
import { useVoid } from '../core/store.ts'
import { getSystem, HOME, orbitPosition, type Path } from '../core/universe.ts'
import { flySystem, homeWorld, placeFirstShot, planFlight } from '../intro/opening.ts'
import { angleBetween, placeRig, rig, settleRig, type RigPose } from '../scene/camera/rig.ts'
import { ascendTo, descend } from '../scene/camera/transitions.ts'
import { stepping, worldClock } from '../scene/shared/clock.ts'
import { stepSpectrum } from '../scene/shared/spectrum.ts'
import { well } from '../scene/shared/well.ts'
import { handover, levelRuntime, sky } from '../scene/stage.ts'
import { cancelSketch, joinStar } from '../ui/sketch.ts'
import { CRUMBS, FILM_LENGTH } from './script.ts'

/** The places the film goes. */
const GALAXY: Path = [HOME[0]!]
const UNIVERSE: Path = []
const KISTRI: Path = [54]
const SYSTEM: Path = [54, 4]
const DRIRAM: Path = [54, 4, 3]
const hole = (): Path => [getUniverse().hole.index]

/**
 * Every place the film goes, kept on stage unseen from the start: all of it is built and
 * compiled before the film rolls, so nothing has to wait once it does and the music stays with
 * the picture. (The black hole brings the universe it is drawn by.)
 */
const PLACES = (): Path[] => [GALAXY, UNIVERSE, KISTRI, SYSTEM, DRIRAM, hole()]

export const film = {
  /** Film seconds. */
  t: 0,
  started: false,
  ended: false,
  /** A place a shot needs is not ready: world time must stand still until it is. */
  waitingForReady: false,
  /** The next event to fire. */
  next: 0,
  /** The universe turns slowly while the camera rests there. */
  drifting: false,
  /** A gravity well circling, from this film second. */
  wellFrom: -1,
  /** Stars joined into a constellation, one at each of these film seconds. */
  joins: [] as Array<{ at: number; star: number }>,
  /** When each place of the breadcrumb was reached, by depth. */
  reached: [] as number[],
  /** Live, with music: seconds of film by the music's clock, which the film follows. */
  clock: null as (() => number) | null,
}

interface FilmEvent {
  readonly at: number
  /** Places that must be ready (built, compiled) before it fires. */
  readonly needs?: readonly Path[]
  /** It must wait for the camera's last flight between levels to have ended. */
  readonly idle?: boolean
  readonly run: () => void
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeIn = (t: number) => t * t * t

/** Keep these places on stage unseen (in addition to wherever the camera is). */
function warm(...paths: Path[]) {
  useVoid.getState().setFilmWarm(paths)
}

/** A flight to a framing of the level the camera is in, over `seconds`. */
function flyTo(to: { azimuth: number; polar: number; distance: number }, seconds: number, ease: (t: number) => number) {
  const from = { azimuth: rig.pose.azimuth, polar: rig.pose.polar, distance: rig.pose.distance, center: rig.pose.center.clone() }
  const turn = angleBetween(from.azimuth, to.azimuth)
  let t = 0
  rig.flight = (pose: RigPose, step: number) => {
    t = Math.min(1, t + step / seconds)
    const e = ease(t)
    pose.basis.identity()
    pose.center.copy(from.center).multiplyScalar(1 - e)
    pose.azimuth = from.azimuth + turn * e
    pose.polar = lerp(from.polar, to.polar, e)
    pose.distance = Math.exp(lerp(Math.log(from.distance), Math.log(to.distance), e))
    if (t >= 1) {
      rig.flight = null
      settleRig()
    }
  }
}

/**
 * Cut to a place that has been kept on stage, ready: it becomes where the camera is, at the
 * given framing. A cut happens under a flash or a dip to dark (FilmOverlay), never in the open.
 */
function cutTo(path: Path, view: { azimuth: number; polar: number; distance: number }, limits: { min: number; max: number }) {
  rig.flight = null
  sky.orientation.identity()
  sky.inside = 0
  handover.index = -1
  // The black hole is drawn by the universe around it: both come into view.
  for (const shown of path.length === 1 && path[0] === getUniverse().hole.index ? [path, UNIVERSE] : [path]) {
    const runtime = levelRuntime(shown)
    runtime.visible = true
    runtime.fade.current = 1
  }
  useVoid.getState().setPath(path)
  rig.limits.min = limits.min
  rig.limits.max = limits.max
  placeRig(view, view.distance)
}

/** The night side of Driram, its ring and its cities, framed as the site frames a world. */
function driramNight() {
  const system = getSystem(DRIRAM[0]!, DRIRAM[1]!)
  const planet = system.planets[DRIRAM[2]!]!
  const at = orbitPosition(planet.orbit, worldClock.time)
  const sun = new Vector3(-at[0], -at[1], -at[2]).normalize()
  const views = planetViews([sun.x, sun.y, sun.z], planet.preset.framing, isPortrait())
  const night = views.night!
  return { azimuth: night.azimuth, polar: night.polar, distance: (night.distance ?? planet.preset.framing) * (isPortrait() ? 1.25 : 1), limits: planetLimits(planet.preset) }
}

/** Choose the stars of the film's constellation: a chain across the middle of the view. */
function chooseConstellation(at: number) {
  const locate = levelRuntime(GALAXY).locate
  if (!locate) return
  const width = window.innerWidth
  const height = window.innerHeight
  const spots = getGalaxy(GALAXY[0]!)
    .stars.map((s) => locate(s.index))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter((s) => s.x > width * 0.2 && s.x < width * 0.8 && s.y > height * 0.28 && s.y < height * 0.68)
  if (spots.length === 0) return
  // From the star nearest the left of the middle, on to the nearest star at a pleasing distance.
  const gap = Math.min(width, height) * 0.11
  let current = spots.reduce((best, s) => (Math.abs(s.y - height * 0.48) + s.x * 0.6 < Math.abs(best.y - height * 0.48) + best.x * 0.6 ? s : best))
  const chain = [current]
  for (let i = 0; i < 6; i++) {
    const options = spots.filter((s) => !chain.includes(s) && Math.hypot(s.x - current.x, s.y - current.y) > gap && s.x >= current.x - gap * 0.6)
    if (options.length === 0) break
    current = options.reduce((best, s) => (Math.hypot(s.x - current.x, s.y - current.y) < Math.hypot(best.x - current.x, best.y - current.y) ? s : best))
    chain.push(current)
  }
  film.joins = chain.map((spot, i) => ({ at: at + i * 0.27, star: spot.index }))
}

/** Every shot, in order. */
const EVENTS: readonly FilmEvent[] = [
  // The pull-back: from the sun with its world passing in front of it, out to the universe.
  {
    at: 4.0,
    needs: [HOME, GALAXY, UNIVERSE],
    run: () => {
      const plan = planFlight()
      flySystem(plan[0]!, systemView(homeWorld().system), () => ascendTo([], plan.slice(1)))
    },
  },
  {
    at: 14.6,
    idle: true,
    run: () => {
      film.drifting = true
    },
  },
  // Straight down: a galaxy, a star, a world where people live.
  {
    at: 17.6,
    idle: true,
    needs: [KISTRI],
    run: () => {
      film.drifting = false
      descend(KISTRI[0]!, 2.6)
    },
  },
  {
    at: 20.95,
    idle: true,
    needs: [SYSTEM],
    run: () => {
      descend(SYSTEM[1]!, 2.2)
    },
  },
  {
    at: 23.6,
    idle: true,
    needs: [DRIRAM],
    run: () => {
      descend(DRIRAM[2]!, 1.9)
    },
  },
  {
    at: 25.75,
    idle: true,
    run: () => {
      const night = driramNight()
      flyTo(night, 3.6, easeInOut)
    },
  },
  // What else there is: seeing by heat and by radio, gravity, time, constellations.
  {
    at: 31.2,
    needs: [GALAXY],
    run: () => {
      const look = getGalaxyLook(GALAXY[0]!)
      const view = galaxyView(look, isPortrait())
      cutTo(GALAXY, { ...view, azimuth: view.azimuth - 0.25 }, galaxyLimits(look))
      useVoid.getState().setSpectrum('visible')
      stepSpectrum(0, true)
    },
  },
  { at: 32.0, run: () => spectrumNow('infrared') },
  { at: 32.8, run: () => spectrumNow('radio') },
  { at: 33.6, run: () => spectrumNow('visible') },
  {
    at: 33.7,
    run: () => {
      film.wellFrom = film.t
    },
  },
  {
    at: 35.25,
    run: () => {
      film.wellFrom = -1
      well.holding = false
    },
  },
  { at: 35.4, run: () => useVoid.getState().setTimeStep(10000) },
  { at: 37.0, run: () => useVoid.getState().setTimeStep(1) },
  { at: 37.1, run: () => chooseConstellation(37.15) },
  {
    at: 39.1,
    run: () => {
      film.joins = []
      cancelSketch()
    },
  },
  // The black hole, close; closer; in.
  {
    at: 39.2,
    needs: [hole()],
    run: () => {
      const site = getUniverse().hole
      cutTo(hole(), holeView(site, isPortrait()), holeLimits(site))
      warm()
      const view = holeView(site, isPortrait())
      flyTo({ azimuth: view.azimuth + 0.22, polar: view.polar - 0.04, distance: site.radius * 11 }, 2.7, easeInOut)
    },
  },
  {
    at: 41.95,
    run: () => {
      flyTo({ azimuth: rig.pose.azimuth + 0.05, polar: rig.pose.polar, distance: getUniverse().hole.radius * 2.4 }, 1.25, easeIn)
    },
  },
]

function spectrumNow(spectrum: 'visible' | 'infrared' | 'radio') {
  useVoid.getState().setSpectrum(spectrum)
  stepSpectrum(0, true)
}

/** Ready the first shot: the home system, the camera on the sun, the levels of the pull-back on stage. */
export function prepareFilm() {
  const state = useVoid.getState()
  state.setPath(HOME)
  state.setFilm('waiting')
  warm(...PLACES())
  film.t = 0
  film.next = 0
  film.started = false
  film.ended = false
  film.reached = []
}

/** Whether every place in the film is built and compiled. */
export function filmReady(): boolean {
  return [HOME, ...PLACES()].every((path) => levelRuntime(path).ready)
}

/** Roll the film. */
export function startFilm() {
  if (film.started) return
  film.started = true
  film.t = 0
  film.next = 0
  placeFirstShot()
  useVoid.getState().setFilm('playing')
}

/** One frame of the film. */
export function stepFilm(step: number) {
  if (!film.started || film.ended) return
  const state = useVoid.getState()
  const idle = state.transition.phase === 'idle'

  // The next event, if its moment has come: it fires, or the film waits for what it needs.
  let waitingForReady = false
  let waitingForIdle = false
  while (film.next < EVENTS.length && film.t >= EVENTS[film.next]!.at) {
    const event = EVENTS[film.next]!
    if (event.needs && !event.needs.every((path) => levelRuntime(path).ready)) {
      waitingForReady = true
      break
    }
    if (event.idle && (!idle || rig.flight !== null)) {
      waitingForIdle = true
      break
    }
    event.run()
    film.next++
  }
  // A flight between levels waits on the place it is falling into: so does the film.
  if (!idle && state.transition.phase === 'approaching' && !levelRuntime(state.transition.to).ready) waitingForReady = true
  film.waitingForReady = waitingForReady
  // Live, world time stands still while something is not ready; a render simply waits.
  if (!SHOT) {
    stepping.manual = waitingForReady
    stepping.frames = 0
  }
  if (!waitingForReady && !waitingForIdle) film.t = film.clock && !SHOT ? Math.max(film.t, film.clock()) : film.t + step

  // What carries on between events.
  if (film.drifting && idle && rig.flight === null) rig.target.azimuth += 0.045 * step
  if (film.wellFrom >= 0) {
    const local = film.t - film.wellFrom
    // Over an arm of the galaxy, where there are stars to bend, circling slowly.
    const angle = local * 1.5 - 1.2
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.085
    well.holding = true
    well.x = window.innerWidth * (isPortrait() ? 0.58 : 0.6) + Math.cos(angle) * radius
    well.y = window.innerHeight * (isPortrait() ? 0.52 : 0.58) + Math.sin(angle) * radius * 0.7
  }
  for (const join of film.joins) {
    if (film.t >= join.at && !(useVoid.getState().sketch?.stars ?? []).includes(join.star)) joinStar(join.star)
  }
  // The breadcrumb: when each depth of the fall was reached.
  const depth = useVoid.getState().path.length
  if (film.t >= CRUMBS.from && film.reached.length < depth + 1) film.reached.push(film.t)

  if (film.t >= FILM_LENGTH) {
    film.ended = true
    // Live, time runs on again; a render keeps its hold on the clock to the last frame.
    if (!SHOT) stepping.manual = false
    state.setFilm('ended')
  }
}

/** Where the film is, for the render script. */
export function filmState(): { t: number; waiting: boolean; ended: boolean; path: readonly number[] } {
  return { t: Number(film.t.toFixed(4)), waiting: film.waitingForReady, ended: film.ended, path: useVoid.getState().path }
}
