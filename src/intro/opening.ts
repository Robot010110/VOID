/**
 * The opening, the first ten seconds, directed like a film.
 *
 * Loading: pure dark, one point of light breathing, while the fonts load, the sound is
 * fetched and every level the opening needs is built and compiled. Title: the point swells
 * and the wordmark comes up over it. Enter: the sound blooms, the wordmark lets go into
 * stars, the dark lifts, and the point of light turns out to be a sun with a world passing in
 * front of it. Then the pull-back: out through the system, out of the galaxy, out until the
 * galaxies hang in the dark, one continuous move (see pullback.ts).
 *
 * A visitor who arrives by a link to somewhere in particular, or who prefers reduced motion,
 * gets the same title and a gentle crossfade instead of the flight.
 *
 * Runs on the frame clock (`stepOpening`, called by the scene every frame), so a screenshot
 * run can stop it at any frame.
 */
import { Quaternion, Vector3 } from 'three'
import { anchorById } from '../content/anchors.ts'
import { getGalaxyLook } from '../core/galaxy.ts'
import { useVoid } from '../core/store.ts'
import { getSystem, HOME, orbitPosition, type Path } from '../core/universe.ts'
import { audioEngine } from '../audio/sound.ts'
import { placeRig, rig, settleRig } from '../scene/camera/rig.ts'
import { ascendTo, restDistance } from '../scene/camera/transitions.ts'
import { isPortrait, systemView, universeView, galaxyView } from '../scene/camera/views.ts'
import { anchorOf } from '../scene/frames.ts'
import { worldClock } from '../scene/shared/clock.ts'
import { curtain, levelRuntime, sky, warmUp } from '../scene/stage.ts'
import { BURST_END, createBurst, drawBurst, type Burst } from './particles.ts'
import { planPullBack, type PullBackSegment } from './pullback.ts'

/** How this visit opens: the full film, a crossfade, or not at all (screenshot runs). */
export type OpeningMode = 'film' | 'fade' | 'none'

/** The point of light breathes at least this long, however fast everything loads... */
const LOADING_MIN = 1.4
/** ...and the title comes up after this long even if something is still not ready. */
const LOADING_MAX = 15

/** Frames drawn behind the dark before the title appears. */
const WARM_FRAMES = 8

/** The dark lifts between these moments after Enter (seconds). */
const REVEAL: Record<Exclude<OpeningMode, 'none'>, [number, number]> = { film: [0.2, 1.5], fade: [0.5, 3] }
/**
 * The camera holds on the sun while the dark lifts, then pulls back: about a second and a half
 * of stillness, then ten of flight.
 */
const FLIGHT_START = 1.5
const PULL_BACK = 10
/** Its share of time inside the system, out of the galaxy, and out into the universe. */
const SHARES = [0.3, 0.37, 0.33]

/**
 * The first shot: the camera in the plane of the home world's orbit, a little below it, this
 * far beyond the world (system units, short of the belt beyond its orbit). The world, larger
 * than the sun from here, covers the top of its disc; the rising camera carries it down across.
 */
const SHOT_GAP = 7
const SHOT_BELOW = 0.0155
/** How far round the sun the camera drifts while it pulls back out of the system, radians. */
const SHOT_TURN = 0.32

export interface OpeningDom {
  backdrop: HTMLElement | null
  light: HTMLElement | null
  dust: HTMLCanvasElement | null
  letters: HTMLElement[]
}

export const opening = {
  mode: 'none' as OpeningMode,
  fontsReady: false,
  soundReady: false,
  /** When loading began (performance.now), and seconds since Enter (frame clock); -1 before. */
  loading: performance.now(),
  t: -1,
  /** Frames drawn behind the dark once everything has compiled. */
  drawn: 0,
  /** The film's first shot has been framed (while loading; again on Enter). */
  framed: false,
  /** Where the flight is: before it, inside the system, rising out of it, or landed. */
  flight: 'waiting' as 'waiting' | 'system' | 'rising' | 'landed',
  dom: { backdrop: null, light: null, dust: null, letters: [] } as OpeningDom,
  burst: null as Burst | null,
  /** The engine's module, once fetched: started by Enter, inside the click. */
  sound: null as null | { startEngine: (audible: boolean) => void },
}

/** Decide how this visit opens and where. Called once, before the first render. */
export function planOpening(mode: OpeningMode, path: Path): Path {
  opening.mode = mode
  // Nothing draws until everything has compiled, unseen behind the dark.
  curtain.closed = mode !== 'none'
  if (mode === 'film') {
    // The levels the film rises through wait on stage, unseen, built before the title.
    warmUp.paths = [[HOME[0]!], []]
    return HOME
  }
  return path
}

/** Everything the title waits for: the levels on stage built and compiled, fonts, sound. */
function loaded(): boolean {
  const { path } = useVoid.getState()
  if (!levelRuntime(path).ready) return false
  if (warmUp.paths.some((p) => !levelRuntime(p).ready)) return false
  return sky.baked && opening.fontsReady && opening.soundReady
}

/** Whether the scene may draw: everything built, or loading has gone on too long. */
export function wantsCurtainUp(): boolean {
  return useVoid.getState().intro === 'loading' && (loaded() || performance.now() - opening.loading > LOADING_MAX * 1000)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Enter: start the sound (inside the click), let the letters go, and roll the film. */
export function beginOpening(withSound: boolean) {
  const store = useVoid.getState()
  if (store.intro !== 'title') return
  if (withSound) {
    try {
      opening.sound?.startEngine(store.audioEnabled && document.visibilityState === 'visible')
    } catch {
      // No audio on this device: the opening goes on in silence.
    }
  }
  opening.t = 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const target = window.innerWidth < 700 ? 1400 : 2200
  opening.burst = reduced ? null : createBurst(opening.dom.letters, target, window.innerWidth, window.innerHeight)
  if (opening.mode === 'film') placeFirstShot()
  store.setIntro('opening')
}

/** The home world, which the first shot sees crossing its sun. */
export function homeWorld() {
  const home = anchorById('ithasal')
  const system = getSystem(HOME[0]!, HOME[1]!)
  return { system, planet: system.planets[home?.world ?? 3]! }
}

export function placeFirstShot() {
  const { planet } = homeWorld()
  const at = orbitPosition(planet.orbit, worldClock.time)
  const azimuth = Math.atan2(at[0], at[2])
  placeRig({ azimuth, polar: Math.PI / 2 + SHOT_BELOW, distance: planet.orbit.radius + SHOT_GAP }, planet.orbit.radius + SHOT_GAP)
}

/** Plan the pull-back from wherever the first shot stands, through each level at rest. */
export function planFlight(): PullBackSegment[] {
  const { system } = homeWorld()
  const scaleOf = (path: Path) => anchorOf(path, worldClock.time, new Vector3(), new Quaternion())
  const systemRest = systemView(system).distance
  const galaxyRest = galaxyView(getGalaxyLook(HOME[0]!), isPortrait()).distance
  const universeRest = universeView(isPortrait()).distance
  const ratios = [
    Math.log(systemRest / rig.pose.distance),
    Math.log(galaxyRest / (restDistance(HOME) * scaleOf(HOME))),
    Math.log(universeRest / (galaxyRest * scaleOf([HOME[0]!]))),
  ]
  return planPullBack(ratios, SHARES, PULL_BACK)
}

/** Fly the first stretch, inside the system: back from the sun and up out of the plane. */
export function flySystem(segment: PullBackSegment, rest: ReturnType<typeof systemView>, onDone: () => void) {
  const start = { distance: rig.pose.distance, azimuth: rig.pose.azimuth, polar: rig.pose.polar }
  let t = 0
  rig.flight = (pose, step) => {
    t = Math.min(1, t + step / segment.seconds)
    const along = segment.ease(t)
    pose.distance = Math.exp(Math.log(start.distance) + (Math.log(rest.distance) - Math.log(start.distance)) * along)
    pose.azimuth = start.azimuth + SHOT_TURN * along
    pose.polar = start.polar + (rest.polar - start.polar) * along
    if (t >= 1) {
      rig.flight = null
      settleRig()
      onDone()
    }
  }
}

/** One frame of the opening: `step` seconds of the frame clock. */
export function stepOpening(step: number) {
  const store = useVoid.getState()
  if (store.intro === 'loading') {
    // Frame the first shot from the start, so what it shows (the world close up, its moons and
    // cities) is built and compiled behind the dark, not when Enter reveals it.
    if (opening.mode === 'film' && !opening.framed) {
      opening.framed = true
      placeFirstShot()
    }
    const waited = (performance.now() - opening.loading) / 1000
    // The scene raises the curtain once it is compiled (see wantsCurtainUp); then it draws for
    // real for a few frames, still behind the dark, so anything drawn for the first time does
    // so now rather than as the film begins.
    if (curtain.closed) return
    opening.drawn++
    if ((opening.drawn >= WARM_FRAMES && waited >= LOADING_MIN && loaded()) || waited >= LOADING_MAX) store.setIntro('title')
    return
  }
  if (store.intro !== 'opening' || opening.mode === 'none') return

  opening.t += step
  const t = opening.t
  const [from, to] = REVEAL[opening.mode]
  const { backdrop, light, dust } = opening.dom
  if (backdrop) backdrop.style.opacity = String(1 - smooth(from, to, t))
  if (light) light.style.opacity = String(1 - smooth(from + 0.2, to - 0.3, t))
  if (dust && opening.burst) {
    const ctx = dust.getContext('2d')
    if (ctx) drawBurst(opening.burst, ctx, t, dust.width / Math.max(1, opening.burst.width))
  }

  if (opening.mode === 'film') {
    if (opening.flight === 'waiting' && t >= FLIGHT_START) {
      const plan = planFlight()
      opening.flight = 'system'
      audioEngine()?.sweep('up', PULL_BACK + 0.6, 0.55)
      flySystem(plan[0]!, systemView(homeWorld().system), () => {
        opening.flight = 'rising'
        ascendTo([], plan.slice(1))
      })
    }
    const { path, transition } = useVoid.getState()
    if (opening.flight === 'rising' && path.length === 0 && transition.phase === 'idle') opening.flight = 'landed'
    if (opening.flight === 'landed' && t >= BURST_END) store.setIntro('done')
  } else if (t >= Math.max(to, BURST_END)) {
    store.setIntro('done')
  }
}
