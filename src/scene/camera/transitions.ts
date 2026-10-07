/**
 * The transition director: one unbroken fall between levels.
 *
 * Descending: the camera flies towards the target (power3.inOut, a little over two seconds)
 * while the child level mounts unseen, builds what it needs in the background and compiles
 * its shaders. Once the target fills most of the view and the child is ready, the levels
 * swap: the active frame becomes the child's, the camera is re-expressed in it (the same
 * picture, new units), and everything crossfades over 0.8 s; a world is handed over whole.
 * The camera never stops: the same flight carries on into the child's resting framing.
 * Ascending is the same sequence in reverse.
 *
 * A system's frame is turned within its galaxy (its sky's band is the galactic plane), so a
 * fall from a galaxy into a system banks the camera from one plane into the other, and the
 * sky turns with it. Flights move the camera's direction and its up along shortest arcs,
 * planned in the frame where they end, so nothing ever swings round.
 *
 * Clocks advance with the frames the scene renders, so motion and fades stay in lockstep
 * with the picture (and screenshot runs are repeatable); GSAP supplies the easing curves.
 * Input is ignored while a transition runs, except Escape, which turns an approach back
 * before the swap.
 */
import gsap from 'gsap'
import { Quaternion, Vector3 } from 'three'
import { prefersReducedMotion } from '../../core/env.ts'
import { getGalaxy } from '../../core/galaxy.ts'
import { IDLE, samePath, useVoid, type Transition } from '../../core/store.ts'
import { getSystem, levelOf, type Level, type Path } from '../../core/universe.ts'
import { anchorOf } from '../frames.ts'
import { worldClock } from '../shared/clock.ts'
import { handover, levelRuntime, sky } from '../stage.ts'
import { rig, settleRig, type RigPose } from './rig.ts'
import { galaxyView, isPortrait, systemView } from './views.ts'

/** Seconds for each fall, by the level fallen into or risen to: a galaxy is the longest drop. */
const DOWN: Partial<Record<Level, number>> = { system: 3, planet: 2.2 }
const UP_TO: Partial<Record<Level, number>> = { galaxy: 3.2, system: 2.6 }
const REDUCED_DOWN = 1.4
const REDUCED_UP = 1.6
const RETREAT = 1.3
const CROSSFADE = 0.8
/**
 * Where the levels swap, as a multiple of the child's resting distance: once it fills most
 * of the view going down, a little further out going up.
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

const UP = new Vector3(0, 1, 0)
const IDENTITY = new Quaternion()

interface Running {
  /** Escape before the swap: fly back to where the approach began. */
  retreat?: () => void
}

let running: Running | null = null
/** Where a chain of ascents (a breadcrumb several levels up) is heading. */
let goal: Path | null = null

function setTransition(transition: Transition) {
  useVoid.getState().setTransition(transition)
}

// Scratch space, reused every frame.
const anchor = new Vector3()
const turn = new Quaternion()
const inverse = new Quaternion()
const centre = new Vector3()
const direction = new Vector3()
const up = new Vector3()
const local = new Vector3()
const arc = new Quaternion()
const partial = new Quaternion()
const turnedSky = new Quaternion()
const origin = new Vector3()

/** Which way the camera sits from its centre, and its up, in the pose's frame. */
function readPose(pose: RigPose, outDirection: Vector3, outUp: Vector3) {
  const s = Math.sin(pose.polar)
  outDirection.set(s * Math.sin(pose.azimuth), Math.cos(pose.polar), s * Math.cos(pose.azimuth)).applyQuaternion(pose.basis)
  outUp.copy(UP).applyQuaternion(pose.basis)
}

/** Write a pose from a centre, a distance, the camera's direction from the centre, and its up. */
function setPose(pose: RigPose, at: Vector3, distance: number, towards: Vector3, cameraUp: Vector3) {
  pose.center.copy(at)
  pose.distance = distance
  pose.basis.setFromUnitVectors(UP, cameraUp)
  local.copy(towards).applyQuaternion(inverse.copy(pose.basis).invert())
  pose.polar = Math.acos(Math.min(1, Math.max(-1, local.y)))
  pose.azimuth = Math.atan2(local.x, local.z)
}

/** Turn unit vector `from` towards `to` by share `t`, along the shortest arc. */
function turnTowards(from: Vector3, to: Vector3, t: number, out: Vector3): Vector3 {
  arc.setFromUnitVectors(from, to)
  partial.identity().slerp(arc, t)
  return out.copy(from).applyQuaternion(partial)
}

function fromAngles(azimuth: number, polar: number, out = new Vector3()): Vector3 {
  const s = Math.sin(polar)
  return out.set(s * Math.sin(azimuth), Math.cos(polar), s * Math.cos(azimuth))
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
  rig.pose.basis.identity()
  settleRig()
  handover.index = -1
  setTransition({ ...IDLE, from: path, to: path })
  // Climbing several levels at once: on to the next.
  if (goal && path.length > goal.length) ascend()
  else goal = null
}

function exists(path: Path): boolean {
  if (path.length === 2) return getGalaxy(path[0]!).stars[path[1]!] !== undefined
  if (path.length === 3) return getSystem(path[0]!, path[1]!).planets[path[2]!] !== undefined
  return false
}

/** How far from a level's centre the camera rests, in the level's own units. */
function restDistance(path: Path): number {
  if (path.length === 3) return getSystem(path[0]!, path[1]!).planets[path[2]!]!.preset.framing
  if (path.length === 2) return systemView(getSystem(path[0]!, path[1]!)).distance
  return galaxyView(getGalaxy(path[0]!), isPortrait()).distance
}

/**
 * Which way the camera arrives at a world, in the system's frame: three-quarter lit, the
 * star 62 degrees to the side, turned from wherever the camera comes in.
 */
function worldArrival(planet: Vector3, camera: Vector3): Vector3 {
  const sunAzimuth = Math.atan2(-planet.x, -planet.z)
  const comingFrom = Math.atan2(camera.x - planet.x, camera.z - planet.z)
  const left = sunAzimuth + 1.08
  const right = sunAzimuth - 1.08
  const near = (a: number) => Math.abs(Math.atan2(Math.sin(a - comingFrom), Math.cos(a - comingFrom)))
  return fromAngles(near(left) < near(right) ? left : right, 1.2)
}

/** Fly into one of the current level's children and swap to its level. */
export function descend(index: number) {
  const state = useVoid.getState()
  if (state.transition.phase !== 'idle') return
  const from = state.path
  const to: Path = [...from, index]
  if (!exists(to)) return
  const level = levelOf(to)

  const arriving = levelRuntime(to)
  const leaving = levelRuntime(from)
  arriving.visible = false
  arriving.ready = false
  arriving.fade.current = 0
  leaving.fade.current = 1
  handover.index = index
  handover.owner = 'parent'
  goal = null
  state.setHoverTarget(null)
  setTransition({ phase: 'approaching', direction: 'down', from, to })

  // Where the flight began, in the parent's frame, for turning back.
  const parent = {
    centre: rig.pose.center.clone(),
    distance: rig.pose.distance,
    direction: new Vector3(),
    up: new Vector3(),
    sky: sky.orientation.clone(),
  }
  readPose(rig.pose, parent.direction, parent.up)

  // The flight is planned in the child's frame, where it ends at rest.
  let scale = anchorOf(to, worldClock.time, anchor, turn)
  inverse.copy(turn).invert()
  const startCentre = parent.centre.clone().sub(anchor).applyQuaternion(inverse).divideScalar(scale)
  const startDistance = parent.distance / scale
  const startDirection = parent.direction.clone().applyQuaternion(inverse)
  const startUp = parent.up.clone().applyQuaternion(inverse)
  const startSky = inverse.clone().multiply(sky.orientation)
  const camera = startDirection.clone().multiplyScalar(startDistance).add(startCentre)
  const rest = {
    distance: restDistance(to),
    direction:
      level === 'planet'
        ? // The world's own frame is not turned: arrival is planned from the system's.
          worldArrival(anchor, parent.direction.clone().multiplyScalar(parent.distance).add(parent.centre))
        : // A system is entered from the side the camera falls in from, a little above its plane.
          fromAngles(Math.atan2(camera.x, camera.z), systemView(getSystem(to[0]!, to[1]!)).polar),
  }
  const duration = prefersReducedMotion() ? REDUCED_DOWN : (DOWN[level] ?? 2.2)
  let t = 0
  let swapped = false
  let faded = false
  const fade = { t: 0 }
  const skyNow = new Quaternion()

  rig.flight = (pose, step) => {
    t = Math.min(1, t + step / duration)
    scale = anchorOf(to, worldClock.time, anchor, turn)
    const towards = easeCentre(clamp01(t / CENTRE_SHARE))
    const along = easeDistance(t)
    centre.copy(startCentre).multiplyScalar(1 - towards)
    const distance = Math.exp(lerp(Math.log(startDistance), Math.log(rest.distance), along))
    turnTowards(startDirection, rest.direction, along, direction)
    turnTowards(startUp, UP, along, up)
    // The sky turns early, while the galaxy's band is still too faint to see turning.
    skyNow.slerpQuaternions(startSky, IDENTITY, clamp01(along / 0.18))

    if (!swapped && towards >= 1 && distance <= rest.distance * SWAP_DOWN && arriving.ready) {
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
      setPose(pose, centre, distance, direction, up)
      sky.orientation.copy(skyNow)
    } else {
      // The same camera in the parent's frame.
      centre.multiplyScalar(scale).applyQuaternion(turn).add(anchor)
      setPose(pose, centre, distance * scale, direction.applyQuaternion(turn), up.applyQuaternion(turn))
      sky.orientation.copy(turn).multiply(skyNow)
    }
    if (faded && t >= 1) end(to)
  }

  running = {
    retreat: () => {
      if (swapped) return
      const turnCentre = rig.pose.center.clone()
      const turnDistance = rig.pose.distance
      const turnDirection = new Vector3()
      const turnUp = new Vector3()
      readPose(rig.pose, turnDirection, turnUp)
      const turnSky = sky.orientation.clone()
      let back = 0
      setTransition({ phase: 'approaching', direction: 'up', from: to, to: from })
      running = {}
      rig.flight = (pose, step) => {
        back = Math.min(1, back + step / RETREAT)
        const e = easeRetreat(back)
        centre.lerpVectors(turnCentre, parent.centre, e)
        turnTowards(turnDirection, parent.direction, e, direction)
        turnTowards(turnUp, parent.up, e, up)
        setPose(pose, centre, Math.exp(lerp(Math.log(turnDistance), Math.log(parent.distance), e)), direction, up)
        sky.orientation.slerpQuaternions(turnSky, parent.sky, e)
        if (back >= 1) end(from)
      }
    },
  }
}

/** Pull back out of the current level into its parent. */
export function ascend() {
  const state = useVoid.getState()
  if (state.transition.phase !== 'idle') return
  const from = state.path
  // A galaxy has nowhere to rise to until the universe arrives.
  if (from.length < 2) return
  const to: Path = from.slice(0, -1)
  const index = from[from.length - 1]!
  const level = levelOf(to)

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

  // The flight is planned in the parent's frame, where it ends at rest; until the swap its
  // centre stays on the child, which may be moving.
  let scale = anchorOf(from, worldClock.time, anchor, turn)
  readPose(rig.pose, direction, up)
  const startCentre = rig.pose.center.clone()
  const startDistance = rig.pose.distance * scale
  const startDirection = direction.clone().applyQuaternion(turn)
  const startUp = up.clone().applyQuaternion(turn)
  const startSky = sky.orientation.clone()
  const camera = direction.clone().multiplyScalar(rig.pose.distance).add(startCentre)
  camera.multiplyScalar(scale).applyQuaternion(turn).add(anchor)
  // Rising out of a world ends on its star, out of a system on its galaxy's centre: still
  // facing the way the camera faced, from the side it was on.
  const view = level === 'system' ? systemView(getSystem(to[0]!, to[1]!)) : galaxyView(getGalaxy(to[0]!), isPortrait())
  const rest = { distance: view.distance, direction: fromAngles(Math.atan2(camera.x, camera.z), view.polar) }
  const swapDistance = restDistance(from) * SWAP_UP * scale
  const duration = prefersReducedMotion() ? REDUCED_UP : (UP_TO[level] ?? 2.6)
  let t = 0
  let swapAt = 1
  let swapped = false
  let faded = false
  const fade = { t: 0 }

  rig.flight = (pose, step) => {
    const along = easeDistance(t)
    const distance = Math.exp(lerp(Math.log(startDistance), Math.log(rest.distance), along))
    const waiting = !swapped && distance >= swapDistance && !arriving.ready
    t = Math.min(1, t + (step / duration) * (waiting ? WAITING_PACE : 1))
    scale = anchorOf(from, worldClock.time, anchor, turn)

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

    // The centre leaves the child for the parent's centre only after the swap.
    const towards = swapped ? easeCentre(clamp01((t - swapAt) / Math.max(1 - swapAt, 1e-3))) : 0
    centre.copy(startCentre).multiplyScalar(scale).applyQuaternion(turn).add(anchor).lerp(origin, towards)
    turnTowards(startDirection, rest.direction, along, direction)
    turnTowards(startUp, UP, along, up)
    // The sky stays where it was among the child's stars.
    turnedSky.copy(turn).multiply(startSky)
    if (swapped) {
      setPose(pose, centre, distance, direction, up)
      sky.orientation.copy(turnedSky)
    } else {
      // The same camera in the child's frame.
      inverse.copy(turn).invert()
      centre.sub(anchor).applyQuaternion(inverse).divideScalar(scale)
      setPose(pose, centre, distance / scale, direction.applyQuaternion(inverse), up.applyQuaternion(inverse))
      sky.orientation.copy(startSky)
    }
    if (faded && t >= 1) end(to)
  }

  running = {}
}

/** Rise to an ancestor of the current place, one level after another. */
export function ascendTo(path: Path) {
  const { path: current, transition } = useVoid.getState()
  if (transition.phase !== 'idle' || path.length >= current.length || !samePath(current.slice(0, path.length), path)) return
  goal = path
  ascend()
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
