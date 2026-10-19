/**
 * The secrets that play out on screen, frame by frame (see secrets.ts for what each one is):
 *
 * - The fall into the black hole. The camera falls in until the shadow fills everything, the
 *   veil closes the last light, the sound drops away; in the dark, after a while, one line; then
 *   the visitor is set back outside and everything returns.
 * - Following the signal. The camera turns to the light that counts, it swells until its light
 *   is all there is, and behind it the world it comes from is made ready; then the light clears
 *   and the visitor is there, under that world's own red sun.
 * - The edge. Out past the universe's farthest view, everything fades with distance into a
 *   total dark, and in it, after a moment, a last fragment.
 *
 * The veil and the words are page elements (ui/SecretScreen.tsx) written here directly, like the
 * hover ring, so nothing re-renders per frame.
 */
import { Quaternion, Vector3, type PerspectiveCamera } from 'three'
import { galaxyNote, starNote, voiceChord, worldNote } from '../audio/notes.ts'
import { audioEngine } from '../audio/sound.ts'
import { EDGE_FRAGMENT, INTERIOR_LINE } from '../content/secrets.ts'
import { getUniverse } from '../core/cosmos.ts'
import { getGalaxy } from '../core/galaxy.ts'
import { prefersReducedMotion, SHOT } from '../core/env.ts'
import { samePath, useVoid, type VoidState } from '../core/store.ts'
import { getSystem } from '../core/universe.ts'
import { rig, settleRig, type RigPose } from '../scene/camera/rig.ts'
import { holeView, isPortrait } from '../scene/camera/views.ts'
import { startChorus, stepChorus } from '../scene/shared/chorus.ts'
import { curtain, handover, levelRuntime, sky } from '../scene/stage.ts'
import { BEACON, EDGE, edgeFade, findSecret, PALE_DOT, SIGNAL_DIRECTION } from './secrets.ts'

/** The page's layers for the secrets: a veil over the whole scene, and words set in it. */
export const secretScreen = {
  veil: null as HTMLElement | null,
  words: null as HTMLElement | null,
}

/** How the signal looks while it is being followed: held lit, and swelling. */
export const signalScene = { steady: 0, swell: 1 }

/** Where the signal is on screen, written by the signal every frame (CSS pixels). */
export const signalSpot = { x: 0, y: 0, shown: false, lit: false }

/** Whether a click or tap here is on the signal while it is lit (a finger is given more room). */
export function onSignal(x: number, y: number, touch = false): boolean {
  return signalSpot.shown && signalSpot.lit && Math.hypot(x - signalSpot.x, y - signalSpot.y) <= (touch ? 34 : 20)
}

/** The edge: open once the visitor has pulled past the universe's limit; how far it has faded. */
export const edge = { open: false, fade: 0, dark: 0 }

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
const smoothstep = (a: number, b: number, x: number) => smooth((x - a) / (b - a))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ---------------------------------------------------------------------------------------
// The veil and the words

const BLACK = [3, 4, 11] as const
const SIGNAL_LIGHT = [236, 244, 247] as const

/** A colour between two, as the veil takes it. */
function mixColour(a: readonly number[], b: readonly number[], t: number): string {
  return a.map((v, i) => Math.round(v + (b[i]! - v) * t)).join(' ')
}
const DARK = mixColour(BLACK, BLACK, 0)
const LIGHT = mixColour(SIGNAL_LIGHT, SIGNAL_LIGHT, 0)

let veilShown = -1
let veilColour = ''
function setVeil(opacity: number, colour = DARK) {
  const element = secretScreen.veil
  if (!element) return
  const value = Math.round(Math.min(1, Math.max(0, opacity)) * 1000) / 1000
  if (value !== veilShown) {
    veilShown = value
    element.style.opacity = String(value)
    element.style.visibility = value > 0 ? 'visible' : 'hidden'
  }
  if (colour !== veilColour) {
    veilColour = colour
    element.style.backgroundColor = `rgb(${colour})`
  }
}

let wordsKey = ''
let wordsShown = -1
/** Set the words in the dark (or none), at an opacity. */
function setWords(lines: readonly string[] | null, opacity: number) {
  const element = secretScreen.words
  if (!element) return
  const key = lines ? lines.join('\n') : ''
  if (key !== wordsKey) {
    wordsKey = key
    element.replaceChildren(
      ...(lines ?? []).map((line) => {
        const span = document.createElement('span')
        span.className = 'secret-line'
        span.textContent = line
        return span
      }),
    )
  }
  const value = Math.round(Math.min(1, Math.max(0, lines ? opacity : 0)) * 1000) / 1000
  if (value !== wordsShown) {
    wordsShown = value
    element.style.opacity = String(value)
  }
}

let pageMark = ''
/** Marks the page while a secret owns the screen, so the interface steps aside. */
function markPage(mark: string) {
  if (mark === pageMark) return
  pageMark = mark
  if (mark) document.documentElement.dataset.secret = mark
  else delete document.documentElement.dataset.secret
}

// ---------------------------------------------------------------------------------------
// The black hole's interior

/** Seconds of each part of the fall, and of the way back out. */
const INTERIOR = { fall: 4.6, dark: 2.8, rise: 2.2, hold: 5.5, sink: 2.2, pause: 1.2, back: 3.8 } as const
const REDUCED_FALL = 2.4

const interior = {
  t: 0,
  fall: INTERIOR.fall as number,
  distance: 0,
  centre: new Vector3(),
  azimuth: 0,
  polar: 0,
  hushed: false,
  returning: false,
}

/** Seconds from the start of the fall to the way back out. */
function returnAt(): number {
  return interior.fall + INTERIOR.dark + INTERIOR.rise + INTERIOR.hold + INTERIOR.sink + INTERIOR.pause
}

/** Fall into the black hole (from the black hole's own level). */
export function fallIntoHole() {
  const state = useVoid.getState()
  if (state.level !== 'hole' || state.transition.phase !== 'idle' || state.secretScene !== null || state.intro !== 'done') return
  state.setSecretScene('interior')
  state.setHoverTarget(null)
  interior.t = 0
  interior.fall = prefersReducedMotion() ? REDUCED_FALL : INTERIOR.fall
  interior.distance = rig.pose.distance
  interior.centre.copy(rig.pose.center)
  interior.azimuth = rig.pose.azimuth
  interior.polar = rig.pose.polar
  interior.hushed = false
  interior.returning = false
  rig.velocity.azimuth = rig.velocity.polar = 0
  audioEngine()?.sweep('down', interior.fall, 0.8)
  rig.flight = flyInterior
}

function flyInterior(pose: RigPose) {
  const hole = getUniverse().hole
  const t = interior.t
  if (!interior.returning) {
    // Falling faster and faster, onto the hole's centre, until the shadow is all there is.
    const u = Math.min(1, t / interior.fall)
    const along = u ** 2.2
    pose.center.copy(interior.centre).multiplyScalar(1 - smooth(u * 1.4))
    pose.distance = Math.exp(lerp(Math.log(interior.distance), Math.log(hole.radius * 2.3), along))
    pose.azimuth = interior.azimuth
    pose.polar = interior.polar
    return
  }
  // Set back outside, drifting in to the hole's resting view as the dark lifts.
  const view = holeView(hole, isPortrait())
  const u = smooth((t - returnAt()) / INTERIOR.back)
  pose.center.set(0, 0, 0)
  pose.basis.identity()
  pose.azimuth = view.azimuth
  pose.polar = view.polar
  pose.distance = Math.exp(lerp(Math.log(view.distance * 1.9), Math.log(view.distance), u))
}

function stepInterior(step: number) {
  const hole = getUniverse().hole
  interior.t += step
  const t = interior.t
  const fall = interior.fall
  if (!interior.hushed && t > fall * 0.35) {
    interior.hushed = true
    audioEngine()?.hush(true, fall * 0.65 + 0.4)
  }
  const back = returnAt()
  if (!interior.returning && t >= back) {
    interior.returning = true
    audioEngine()?.hush(false, 4)
  }
  // The veil closes as the shadow fills the view, and stays closed until the way back.
  let veil: number
  if (!interior.returning) {
    const r = Math.max(rig.pose.distance / hole.radius, 1)
    veil = Math.max(smoothstep(Math.log(7), Math.log(3.1), Math.log(r)), t >= fall ? 1 : 0)
  } else veil = 1 - smoothstep(0.3, INTERIOR.back, t - back)
  setVeil(veil)

  const shown = fall + INTERIOR.dark
  const words =
    t < shown
      ? 0
      : t < shown + INTERIOR.rise
        ? smooth((t - shown) / INTERIOR.rise)
        : t < shown + INTERIOR.rise + INTERIOR.hold
          ? 1
          : 1 - smooth((t - shown - INTERIOR.rise - INTERIOR.hold) / INTERIOR.sink)
  setWords(t >= shown && !interior.returning ? [INTERIOR_LINE] : null, words)
  markPage('interior')

  if (t >= back + INTERIOR.back) {
    rig.flight = null
    settleRig()
    setVeil(0)
    setWords(null, 0)
    markPage('')
    useVoid.getState().setSecretScene(null)
    findSecret('interior')
  }
}

/**
 * Whether a point on screen (CSS pixels) is on the black hole's shadow, seen from the black
 * hole's level, where the hole is the frame's centre.
 */
export function onHoleShadow(x: number, y: number, camera: PerspectiveCamera, width: number, height: number): boolean {
  const hole = getUniverse().hole
  const distance = camera.position.length() / hole.radius
  if (distance < 1.6) return true
  const centre = new Vector3().project(camera)
  if (centre.z > 1) return false
  const sine = Math.min(1, (2.598 * Math.sqrt(1 - 1 / distance)) / distance)
  const radius = (Math.tan(Math.asin(sine)) / Math.tan((camera.fov * Math.PI) / 360)) * (height / 2)
  const cx = ((centre.x + 1) / 2) * width
  const cy = ((1 - centre.y) / 2) * height
  return Math.hypot(x - cx, y - cy) <= radius * 1.05 + 6
}

// ---------------------------------------------------------------------------------------
// Following the signal

/**
 * Seconds to turn to the light, for it to swell over everything, to hold, and to dim to dark
 * while the world behind it is made ready (and the least that takes); frames it is then drawn
 * unseen; seconds for it to come up out of the dark; and the longest the dark waits for a world
 * that never gets ready (a lost GPU context) before it lifts anyway.
 */
const SIGNAL = { turn: 2.4, swell: 1.9, hold: 0.5, dim: 1.8, frames: 24, reveal: 3.4, patience: 20 } as const
const REDUCED_SIGNAL = { turn: 1.2, swell: 1.2 } as const

const follow = {
  stage: 'turning' as 'turning' | 'swelling' | 'waiting' | 'drawing' | 'revealing',
  t: 0,
  turn: SIGNAL.turn as number,
  swell: SIGNAL.swell as number,
  frames: 0,
  eye: new Vector3(),
  from: new Vector3(),
  look: new Vector3(),
}

const offset = new Vector3()
const arc = new Quaternion()
const partial = new Quaternion()
const towards = new Vector3(...SIGNAL_DIRECTION)

/** Follow the signal, clicked while it was lit, to the world it comes from. */
export function followSignal() {
  const state = useVoid.getState()
  if (state.level !== 'universe' || state.transition.phase !== 'idle' || state.secretScene !== null || state.intro !== 'done') return
  state.setSecretScene('signal')
  state.setHoverTarget(null)
  const reduced = prefersReducedMotion()
  follow.stage = 'turning'
  follow.t = 0
  follow.turn = reduced ? REDUCED_SIGNAL.turn : SIGNAL.turn
  follow.swell = reduced ? REDUCED_SIGNAL.swell : SIGNAL.swell
  // Where the camera is, and where it looks: it stays put and turns to the light.
  const { pose } = rig
  const s = Math.sin(pose.polar)
  offset.set(s * Math.sin(pose.azimuth), Math.cos(pose.polar), s * Math.cos(pose.azimuth)).applyQuaternion(pose.basis)
  follow.eye.copy(pose.center).addScaledVector(offset, pose.distance)
  follow.from.copy(offset).negate()
  rig.velocity.azimuth = rig.velocity.polar = 0
  signalScene.steady = 0
  signalScene.swell = 1
  audioEngine()?.sweep('down', follow.turn + follow.swell + 0.6, 0.55)
  rig.flight = flySignal
}

function flySignal(pose: RigPose) {
  const u = smooth(Math.min(1, follow.stage === 'turning' ? follow.t / follow.turn : 1))
  arc.setFromUnitVectors(follow.from, towards)
  partial.identity().slerp(arc, u)
  follow.look.copy(follow.from).applyQuaternion(partial)
  pose.basis.identity()
  pose.center.copy(follow.eye).addScaledVector(follow.look, pose.distance)
  pose.azimuth = Math.atan2(-follow.look.x, -follow.look.z)
  pose.polar = Math.acos(Math.min(1, Math.max(-1, -follow.look.y)))
}

function stepSignal(step: number) {
  follow.t += step
  markPage('signal')
  if (follow.stage === 'turning') {
    signalScene.steady = smooth(follow.t / 0.4)
    signalScene.swell = 1 + 1.4 * smooth(follow.t / follow.turn)
    setVeil(0, LIGHT)
    if (follow.t >= follow.turn) {
      follow.stage = 'swelling'
      follow.t = 0
    }
    return
  }
  if (follow.stage === 'swelling') {
    const u = Math.min(1, follow.t / follow.swell)
    signalScene.swell = 2.4 + 16 * u * u
    setVeil(u * u, LIGHT)
    if (u >= 1) arrive()
    return
  }
  if (follow.stage === 'waiting') {
    // The light holds, then dims to dark; behind it the world is built and compiled unseen,
    // then drawn for a few frames (anything drawn for the first time does so now), and only
    // then shown, coming up out of the dark.
    setVeil(1, mixColour(SIGNAL_LIGHT, BLACK, smooth((follow.t - SIGNAL.hold) / SIGNAL.dim)))
    const waited = follow.t >= SIGNAL.hold + SIGNAL.dim
    if (waited && (levelRuntime(BEACON).ready || follow.t > SIGNAL.patience)) {
      curtain.closed = false
      follow.stage = 'drawing'
      follow.frames = 0
      follow.t = 0
    }
    return
  }
  if (follow.stage === 'drawing') {
    setVeil(1)
    if (++follow.frames >= SIGNAL.frames) {
      follow.stage = 'revealing'
      follow.t = 0
    }
    return
  }
  const u = Math.min(1, follow.t / SIGNAL.reveal)
  setVeil(1 - smooth(u) ** 0.8)
  if (u >= 1) {
    setVeil(0)
    markPage('')
    useVoid.getState().setSecretScene(null)
    findSecret('signal')
  }
}

/** Behind the light: the universe gives way to the beacon's world. */
function arrive() {
  rig.flight = null
  curtain.closed = true
  sky.orientation.identity()
  sky.inside = 0
  handover.index = -1
  const runtime = levelRuntime(BEACON)
  runtime.visible = true
  runtime.ready = false
  runtime.fade.current = 1
  useVoid.getState().setPath(BEACON)
  signalScene.steady = 0
  signalScene.swell = 1
  follow.stage = 'waiting'
  follow.t = 0
}

// ---------------------------------------------------------------------------------------
// The edge

/** The words wait this long in the total dark, rise over `RISE`, and count as found after `READ`. */
const EDGE_WAIT = 1.4
const EDGE_RISE = 2.6
const EDGE_READ = 3.5
let edgeWords = 0

/** The visitor has pulled on past the universe's farthest view: let them go. */
export function openEdge() {
  edge.open = true
}

/** How far the camera may go out at the universe now, if past its usual limit. */
export function edgeReach(): number | null {
  return edge.open ? EDGE.beyond : null
}

function stepEdge(step: number, state: VoidState, limit: number) {
  const atUniverse = state.level === 'universe' && state.intro === 'done'
  const distance = rig.pose.distance
  if (edge.open && (!atUniverse || distance < limit * 0.98)) edge.open = false
  edge.fade = atUniverse ? edgeFade(distance) : 0
  edge.dark = edge.fade > 0.985 ? edge.dark + step : 0
  setVeil(edge.fade)
  markPage(edge.fade > 0.12 ? 'edge' : '')
  const want = edge.dark > EDGE_WAIT ? smooth((edge.dark - EDGE_WAIT) / EDGE_RISE) : 0
  edgeWords += (want - edgeWords) * (1 - Math.exp(-step * (want > edgeWords ? 8 : 4)))
  if (edgeWords < 0.002 && want === 0) edgeWords = 0
  setWords(edgeWords > 0 ? EDGE_FRAGMENT : null, edgeWords)
  if (edge.dark > EDGE_WAIT + EDGE_RISE + EDGE_READ) findSecret('edge')
}

// ---------------------------------------------------------------------------------------
// The old code

/**
 * Every star in view sings: in a galaxy its stars, each on its own note (hot stars high, cool
 * stars low); among the galaxies, the galaxies, an octave up; in a system, its star and its
 * worlds; anywhere else, the sky's open chord. They brighten while they sing.
 */
export function sing() {
  const { path, level } = useVoid.getState()
  const locate = levelRuntime(path).locate
  const notes: number[] = []
  if (locate && level === 'galaxy') {
    for (const entry of getGalaxy(path[0]!).stars) if (locate(entry.index)) notes.push(starNote(entry.star.temperature))
  } else if (locate && level === 'universe') {
    const universe = getUniverse()
    for (const site of universe.galaxies) if (locate(site.index)) notes.push(galaxyNote(site.size) + 12)
  } else if (level === 'system') {
    const system = getSystem(path[0]!, path[1]!)
    notes.push(starNote(system.star.temperature))
    for (const planet of system.planets) if (locate?.(planet.index)) notes.push(worldNote(planet.orbit.radius))
  }
  audioEngine()?.chord(voiceChord(notes))
  startChorus()
  findSecret('old-code')
}

// ---------------------------------------------------------------------------------------

let atPaleDot = 0

/** The pale dot is found once its one line has had a moment to be read. */
function watchPaleDot(step: number, state: VoidState) {
  const there = samePath(state.path, PALE_DOT) && state.transition.phase === 'idle' && state.secretScene === null && state.intro === 'done'
  atPaleDot = there ? atPaleDot + step : 0
  if (atPaleDot > (SHOT ? 0.2 : 3) && !state.foundSecrets.includes('pale-dot')) findSecret('pale-dot')
}

/** One frame of the secrets on screen. `limit` is the universe's usual farthest view. */
export function stepSecrets(step: number, limit: number) {
  stepChorus(step)
  const state = useVoid.getState()
  if (state.secretScene === 'interior') stepInterior(step)
  else if (state.secretScene === 'signal') stepSignal(step)
  else stepEdge(step, state, limit)
  watchPaleDot(step, state)
}

/** Escape during a secret: the fall into the black hole goes straight to the way back out. */
export function skipSecretScene() {
  if (useVoid.getState().secretScene !== 'interior' || interior.returning) return
  interior.t = Math.max(interior.t, returnAt())
}
