/**
 * The transition director: one unbroken fall between levels.
 *
 * Descending: the camera flies towards the target (power3.inOut, about 2.2 s) while the
 * child level mounts unseen, bakes its maps in the background and compiles its shaders.
 * Once the target fills most of the view and the child is ready, the levels swap: the active
 * frame becomes the child's, the camera is re-expressed in it (the same picture, new units),
 * the shared body is handed over at full strength, and everything else crossfades over
 * 0.8 s. The camera never stops: the same flight carries on into the child's resting
 * framing. Ascending is the same sequence in reverse.
 *
 * Clocks advance with the frames the scene renders, so motion and fades stay in lockstep
 * with the picture (and screenshot runs are repeatable); GSAP supplies the easing curves.
 * Input is ignored while a transition runs, except Escape, which turns an approach back
 * before the swap.
 */
import gsap from 'gsap'
import { Vector3 } from 'three'
import { prefersReducedMotion } from '../../core/env.ts'
import { IDLE, useVoid, type Transition } from '../../core/store.ts'
import { getSystem, levelOf, type Path } from '../../core/universe.ts'
import { anchorOf } from '../frames.ts'
import { worldClock } from '../shared/clock.ts'
import { handover, levelRuntime } from '../stage.ts'
import { angleBetween, rig, settleRig, type RigPose } from './rig.ts'
import { systemView } from './views.ts'

const APPROACH = 2.2
const ASCENT = 2.6
const RETREAT = 1.3
const CROSSFADE = 0.8
/**
 * Where the levels swap, as a multiple of the world's resting distance: once it fills most
 * of the view going down, a little further out going up. Ringed worlds rest further out, so
 * they swap further out too.
 */
const SWAP_DOWN = 1.35
const SWAP_UP = 1.5
/** Share of an approach over which the camera's centre moves onto the target. */
const CENTRE_SHARE = 0.6
/** How fast an ascent creeps on while the level above is still getting ready. */
const WAITING_PACE = 0.15

const easeDistance = gsap.parseEase('power3.inOut')
const easeCentre = gsap.parseEase('power2.inOut')
const easeFade = gsap.parseEase('sine.inOut')
const easeRetreat = gsap.parseEase('power2.inOut')

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

interface Running {
  /** Escape before the swap: fly back to where the approach began. */
  retreat?: () => void
}

let running: Running | null = null

function setTransition(transition: Transition) {
  useVoid.getState().setTransition(transition)
}

function snapshot(): { center: Vector3; distance: number; azimuth: number; polar: number } {
  const { center, distance, azimuth, polar } = rig.pose
  return { center: center.clone(), distance, azimuth, polar }
}

const anchor = new Vector3()
const centre = new Vector3()
const offset = new Vector3()
const origin = new Vector3()

/** Turned from wherever the camera comes in, a three-quarter lit view a little above the orbit. */
function arrivalAngles(planet: Vector3, camera: Vector3) {
  const sunAzimuth = Math.atan2(-planet.x, -planet.z)
  offset.subVectors(camera, planet)
  const comingFrom = Math.atan2(offset.x, offset.z)
  const left = sunAzimuth + 1.08
  const right = sunAzimuth - 1.08
  const azimuth = Math.abs(angleBetween(comingFrom, left)) < Math.abs(angleBetween(comingFrom, right)) ? left : right
  return { azimuth, polar: 1.2 }
}

function cameraPosition(pose: RigPose, out: Vector3): Vector3 {
  const s = Math.sin(pose.polar)
  return out
    .set(s * Math.sin(pose.azimuth), Math.cos(pose.polar), s * Math.cos(pose.azimuth))
    .multiplyScalar(pose.distance)
    .add(pose.center)
}

/** Steps a crossfade between two levels; true once it has finished. */
function crossfade(state: { t: number }, leaving: { current: number }, arriving: { current: number }): boolean {
  state.t = Math.min(1, state.t + worldClock.step / CROSSFADE)
  const share = easeFade(state.t)
  leaving.current = 1 - share
  arriving.current = share
  return state.t >= 1
}

function end(path: Path) {
  rig.flight = null
  running = null
  settleRig()
  handover.index = -1
  setTransition({ ...IDLE, from: path, to: path })
}

/** Fly into one of the current level's children and swap to its level. */
export function descend(index: number) {
  const state = useVoid.getState()
  if (state.transition.phase !== 'idle' || levelOf(state.path) !== 'system') return
  const from = state.path
  const planet = getSystem(from[0]!, from[1]!).planets[index]
  if (!planet) return
  const to: Path = [...from, index]

  const arriving = levelRuntime(to)
  const leaving = levelRuntime(from)
  arriving.visible = false
  arriving.ready = false
  arriving.fade.current = 0
  leaving.fade.current = 1
  handover.index = index
  handover.owner = 'parent'
  state.setHoverTarget(null)
  setTransition({ phase: 'approaching', direction: 'down', from, to })

  const start = snapshot()
  const radius = anchorOf(to, worldClock.time, anchor)
  const arrival = arrivalAngles(anchor.clone(), cameraPosition(rig.pose, new Vector3()))
  const restDistance = radius * planet.preset.framing
  const duration = prefersReducedMotion() ? 1.4 : APPROACH
  let t = 0
  let swapped = false
  let faded = false
  const fade = { t: 0 }

  rig.flight = (pose, step) => {
    t = Math.min(1, t + step / duration)
    anchorOf(to, worldClock.time, anchor)
    const towards = easeCentre(clamp01(t / CENTRE_SHARE))
    const along = easeDistance(t)
    centre.lerpVectors(start.center, anchor, towards)
    const distance = Math.exp(lerp(Math.log(start.distance), Math.log(restDistance), along))
    pose.azimuth = start.azimuth + angleBetween(start.azimuth, arrival.azimuth) * along
    pose.polar = lerp(start.polar, arrival.polar, along)

    if (!swapped && towards >= 1 && distance <= restDistance * SWAP_DOWN && arriving.ready) {
      swapped = true
      handover.owner = 'child'
      arriving.visible = true
      useVoid.getState().setPath(to)
      setTransition({ phase: 'swapping', direction: 'down', from, to })
    }
    if (swapped && !faded && crossfade(fade, leaving.fade, arriving.fade)) {
      faded = true
      setTransition({ phase: 'settling', direction: 'down', from, to })
    }

    if (swapped) {
      // The same camera in the planet's frame: its origin at the planet, its unit a radius.
      pose.center.copy(centre).sub(anchor).divideScalar(radius)
      pose.distance = distance / radius
    } else {
      pose.center.copy(centre)
      pose.distance = distance
    }
    if (faded && t >= 1) end(to)
  }

  running = {
    retreat: () => {
      if (swapped) return
      const turn = snapshot()
      let back = 0
      setTransition({ phase: 'approaching', direction: 'up', from: to, to: from })
      running = {}
      rig.flight = (pose, step) => {
        back = Math.min(1, back + step / RETREAT)
        const e = easeRetreat(back)
        pose.center.lerpVectors(turn.center, start.center, e)
        pose.distance = Math.exp(lerp(Math.log(turn.distance), Math.log(start.distance), e))
        pose.azimuth = turn.azimuth + angleBetween(turn.azimuth, start.azimuth) * e
        pose.polar = lerp(turn.polar, start.polar, e)
        if (back >= 1) end(from)
      }
    },
  }
}

/** Pull back out of the current level into its parent. */
export function ascend() {
  const state = useVoid.getState()
  if (state.transition.phase !== 'idle' || levelOf(state.path) !== 'planet') return
  const from = state.path
  const to: Path = from.slice(0, -1)
  const index = from[from.length - 1]!
  const system = getSystem(to[0]!, to[1]!)

  const arriving = levelRuntime(to)
  const leaving = levelRuntime(from)
  arriving.visible = false
  arriving.ready = false
  arriving.fade.current = 0
  leaving.fade.current = 1
  handover.index = index
  handover.owner = 'child'
  state.setHoverTarget(null)
  setTransition({ phase: 'approaching', direction: 'up', from, to })

  // Everything in the system's frame: the camera starts at the planet and ends on the star,
  // still facing the way it was.
  const radius = anchorOf(from, worldClock.time, anchor)
  const swapDistance = radius * system.planets[index]!.preset.framing * SWAP_UP
  const start = snapshot()
  const startPosition = cameraPosition(rig.pose, new Vector3()).multiplyScalar(radius).add(anchor)
  const rest = systemView(system)
  const endAzimuth = Math.atan2(startPosition.x, startPosition.z)
  const duration = prefersReducedMotion() ? 1.6 : ASCENT
  let t = 0
  let swapAt = 1
  let swapped = false
  let faded = false
  const fade = { t: 0 }

  rig.flight = (pose, step) => {
    const along = easeDistance(t)
    const distance = Math.exp(lerp(Math.log(start.distance * radius), Math.log(rest.distance), along))
    const waiting = !swapped && distance >= swapDistance && !arriving.ready
    t = Math.min(1, t + (step / duration) * (waiting ? WAITING_PACE : 1))
    anchorOf(from, worldClock.time, anchor)

    if (!swapped && distance >= swapDistance && arriving.ready) {
      swapped = true
      swapAt = t
      handover.owner = 'parent'
      arriving.visible = true
      useVoid.getState().setPath(to)
      setTransition({ phase: 'swapping', direction: 'up', from, to })
    }
    if (swapped && !faded && crossfade(fade, leaving.fade, arriving.fade)) {
      faded = true
      setTransition({ phase: 'settling', direction: 'up', from, to })
    }

    // The centre leaves the planet for the star only after the swap, once the system shows.
    const towards = swapped ? easeCentre(clamp01((t - swapAt) / Math.max(1 - swapAt, 1e-3))) : 0
    centre.copy(start.center).multiplyScalar(radius).add(anchor).lerp(origin, towards)
    pose.azimuth = start.azimuth + angleBetween(start.azimuth, endAzimuth) * along
    pose.polar = lerp(start.polar, rest.polar, along)
    if (swapped) {
      pose.center.copy(centre)
      pose.distance = distance
    } else {
      pose.center.copy(centre).sub(anchor).divideScalar(radius)
      pose.distance = distance / radius
    }
    if (faded && t >= 1) end(to)
  }

  running = {}
}

/** Escape and Backspace: turn back an approach that has not swapped yet, or go up a level. */
export function back() {
  const { transition } = useVoid.getState()
  if (transition.phase === 'idle') {
    ascend()
    return
  }
  if (transition.phase === 'approaching') running?.retreat?.()
}
