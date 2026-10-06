import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Spherical, Vector3, type PerspectiveCamera } from 'three'
import { prefersReducedMotion, SHOT } from '../../core/env.ts'
import { useVoid } from '../../core/store.ts'
import { worldClock } from '../shared/clock.ts'
import { levelRuntime, motion, pointer } from '../stage.ts'
import { POLAR_MAX, POLAR_MIN, rig } from './rig.ts'
import { ascend, back, descend } from './transitions.ts'

/** Radians of orbit per CSS pixel dragged. */
const DRAG_SPEED = 0.0042
/** Radians per second while an arrow key is held. */
const KEY_SPEED = 0.85
/** How quickly the camera eases towards where it is being steered (per second). */
const FOLLOW = 7
/** How quickly a flick's momentum dies away (per second). */
const FLING_DECAY = 3.2
/** Zoom per wheel pixel (multiplicative, so it feels the same near and far). */
const WHEEL_ZOOM = 0.0011
/** Handheld drift amplitude in radians: a couple of pixels, never still, never noticed. */
const DRIFT = 0.0018
/** Vertical field of view on landscape screens. */
const FOV = 50
/** On portrait screens the view widens to keep at least this much horizontally... */
const MIN_HORIZONTAL_FOV = 42
/** ...but never beyond this vertically, where perspective starts to stretch. */
const MAX_FOV = 72
/** Wheel pixels (or the pinch equivalent) of intent that fall into a target or out of a level. */
const DESCEND_INTENT = 140
const ASCEND_INTENT = 260
/** Intent drains away if the scrolling pauses. */
const INTENT_WINDOW = 700
/** A press shorter and stiller than this is a tap. */
const TAP_MS = 350
const TAP_PIXELS = 6

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Vertical field of view for a screen shape: 50 degrees, widened for tall screens. */
function fieldOfView(aspect: number): number {
  const half = (MIN_HORIZONTAL_FOV * Math.PI) / 360
  const needed = (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI
  return clamp(needed, FOV, MAX_FOV)
}

const offset = new Vector3()

function activeRuntime() {
  return levelRuntime(useVoid.getState().path)
}

/**
 * The one camera rig, for every level. Drag (mouse or one finger) and the arrow keys orbit;
 * the wheel and a pinch zoom, and keep zooming over a world to fall into it, or past the
 * limit to rise out of a level. A tap or click on a world flies there. Everything eases, a
 * flick carries on and settles, and an idle camera breathes with a slow handheld drift.
 * During a transition the director flies the camera and input waits, except Escape.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)
  const spherical = useRef(new Spherical())
  const lastLog = useRef<number | null>(null)
  const keysHeld = useRef<Set<string>>(new Set())

  useEffect(() => {
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0
    let lastMove = 0
    let press = { x: 0, y: 0, time: 0, moved: 0 }
    const intent = { amount: 0, target: -1, time: 0 }
    const keys = new Set<string>()

    const local = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const steering = () => rig.flight === null && useVoid.getState().transition.phase === 'idle'

    const zoomBy = (factor: number) => {
      rig.target.distance = clamp(rig.target.distance * factor, rig.limits.min, rig.limits.max)
    }
    const pinchSpan = () => {
      const [a, b] = [...pointers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }

    /** Accumulate zoom-in over a target; enough of it falls into the target. */
    const leanInto = (x: number, y: number, amount: number, now: number): boolean => {
      const level = useVoid.getState().level
      if (level !== 'galaxy' && level !== 'system') return false
      const hit = activeRuntime().pick?.(x, y)
      if (!hit) return false
      if (hit.index !== intent.target || now - intent.time > INTENT_WINDOW) intent.amount = 0
      intent.target = hit.index
      intent.time = now
      intent.amount += amount
      if (intent.amount >= DESCEND_INTENT) {
        intent.amount = 0
        descend(hit.index)
      }
      return true
    }

    /** Accumulate zoom-out past the limit; enough of it rises out of the level. */
    const leanOut = (amount: number, now: number) => {
      const level = useVoid.getState().level
      if ((level !== 'planet' && level !== 'system') || rig.target.distance < rig.limits.max * 0.999) return
      if (intent.target !== -2 || now - intent.time > INTENT_WINDOW) intent.amount = 0
      intent.target = -2
      intent.time = now
      intent.amount += amount
      if (intent.amount >= ASCEND_INTENT) {
        intent.amount = 0
        ascend()
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const at = local(event)
      pointers.set(event.pointerId, at)
      pointer.touch = event.pointerType !== 'mouse'
      press = { x: at.x, y: at.y, time: event.timeStamp, moved: 0 }
      lastMove = event.timeStamp
      rig.velocity.azimuth = 0
      rig.velocity.polar = 0
      pinch = pinchSpan()
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const at = local(event)
      pointer.x = at.x
      pointer.y = at.y
      pointer.touch = event.pointerType !== 'mouse'
      pointer.hovering = event.pointerType === 'mouse' && pointers.size === 0
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      const dx = at.x - previous.x
      const dy = at.y - previous.y
      pointers.set(event.pointerId, at)
      press.moved += Math.hypot(dx, dy)
      if (!steering()) return
      if (pointers.size >= 2) {
        // Pinch: spread zooms in (and over a world, falls into it), squeeze zooms out.
        const span = pinchSpan()
        if (pinch > 0 && span > 0) {
          const ratio = pinch / span
          const [a, b] = [...pointers.values()]
          const amount = Math.log(ratio) * -900
          const leaning = ratio < 1 && a && b && leanInto((a.x + b.x) / 2, (a.y + b.y) / 2, amount, event.timeStamp)
          if (!leaning) zoomBy(ratio)
          if (ratio > 1) leanOut(-amount, event.timeStamp)
        }
        pinch = span
        return
      }
      const dAzimuth = -dx * DRAG_SPEED
      const dPolar = -dy * DRAG_SPEED
      const dt = Math.max((event.timeStamp - lastMove) / 1000, 1 / 240)
      rig.target.azimuth += dAzimuth
      rig.target.polar = clamp(rig.target.polar + dPolar, POLAR_MIN, POLAR_MAX)
      // Smoothed velocity, carried on as momentum when the pointer lets go.
      rig.velocity.azimuth = rig.velocity.azimuth * 0.6 + (dAzimuth / dt) * 0.4
      rig.velocity.polar = rig.velocity.polar * 0.6 + (dPolar / dt) * 0.4
      lastMove = event.timeStamp
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      pinch = pinchSpan()
      // A drag that stopped before release, or the end of a pinch, should not fling.
      if (pointers.size > 0 || event.timeStamp - lastMove > 90 || prefersReducedMotion()) {
        rig.velocity.azimuth = 0
        rig.velocity.polar = 0
      }
      // A tap or click on a world flies into it.
      const tap = event.timeStamp - press.time < TAP_MS && press.moved < TAP_PIXELS
      if (tap && pointers.size === 0 && event.type === 'pointerup' && steering()) {
        rig.velocity.azimuth = 0
        rig.velocity.polar = 0
        const hit = activeRuntime().pick?.(press.x, press.y)
        if (hit) descend(hit.index)
      }
    }

    const onPointerLeave = () => {
      pointer.hovering = false
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (!steering()) return
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
      const at = local(event)
      if (pixels < 0 && leanInto(at.x, at.y, -pixels, event.timeStamp)) return
      zoomBy(Math.exp(clamp(pixels, -240, 240) * WHEEL_ZOOM))
      if (pixels > 0) leanOut(pixels, event.timeStamp)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.key === 'Escape' || (event.key === 'Backspace' && !event.repeat)) {
        event.preventDefault()
        back()
        return
      }
      if (!ARROWS.has(event.key)) return
      event.preventDefault()
      keys.add(event.key)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key)
    }
    const onBlur = () => keys.clear()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    keysHeld.current = keys
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [canvas])

  useFrame((frame, delta) => {
    const dt = Math.min(delta, 0.1)
    const cam = camera as PerspectiveCamera
    const { pose, target, velocity } = rig
    const limits = activeRuntime().limits
    if (limits) {
      rig.limits.min = limits.min
      rig.limits.max = limits.max
    }

    const fov = fieldOfView(frame.size.width / Math.max(frame.size.height, 1))
    let projection = Math.abs(cam.fov - fov) > 0.01
    if (projection) cam.fov = fov

    if (rig.flight) {
      rig.flight(pose, worldClock.step)
    } else {
      const keys = keysHeld.current
      if (keys.has('ArrowLeft')) target.azimuth += KEY_SPEED * dt
      if (keys.has('ArrowRight')) target.azimuth -= KEY_SPEED * dt
      if (keys.has('ArrowUp')) target.polar -= KEY_SPEED * dt
      if (keys.has('ArrowDown')) target.polar += KEY_SPEED * dt
      target.azimuth += velocity.azimuth * dt
      target.polar += velocity.polar * dt
      const decay = Math.exp(-FLING_DECAY * dt)
      velocity.azimuth *= decay
      velocity.polar *= decay
      target.polar = clamp(target.polar, POLAR_MIN, POLAR_MAX)
      target.distance = clamp(target.distance, rig.limits.min, rig.limits.max)

      const ease = 1 - Math.exp(-FOLLOW * dt)
      pose.azimuth += (target.azimuth - pose.azimuth) * ease
      pose.polar += (target.polar - pose.polar) * ease
      // Zoom eases in log space, so near and far approach at the same pace.
      pose.distance *= Math.exp(Math.log(target.distance / pose.distance) * ease)
    }

    spherical.current.set(pose.distance, pose.polar, pose.azimuth)
    offset.setFromSpherical(spherical.current).applyQuaternion(pose.basis)
    cam.position.copy(pose.center).add(offset)
    cam.up.set(0, 1, 0).applyQuaternion(pose.basis)
    cam.lookAt(pose.center)

    if (!SHOT && !prefersReducedMotion()) {
      const t = frame.clock.elapsedTime
      cam.rotateY(DRIFT * (0.6 * Math.sin(t * 0.11 + 1.3) + 0.4 * Math.sin(t * 0.27 + 4.1)))
      cam.rotateX(DRIFT * (0.6 * Math.sin(t * 0.09 + 2.2) + 0.4 * Math.sin(t * 0.23 + 0.7)))
      cam.rotateZ(DRIFT * 0.5 * Math.sin(t * 0.07 + 3.3))
    }

    // Depth precision follows the scale of what is in front of the camera.
    const near = clamp(pose.distance * 0.01, 0.004, 2)
    if (Math.abs(cam.near - near) > near * 0.02) {
      cam.near = near
      projection = true
    }
    if (projection) cam.updateProjectionMatrix()
    cam.updateMatrixWorld()

    // How fast the camera moves through scale, for the transition's edge fringing. A swap
    // re-expresses the distance in new units in one frame, which is not motion.
    const log = Math.log(pose.distance)
    if (lastLog.current !== null && dt > 0) {
      const step = Math.abs(log - lastLog.current)
      if (step < 0.5) motion.speed += (step / dt - motion.speed) * (1 - Math.exp(-dt * 6))
    }
    lastLog.current = log
  }, -60)

  return null
}
