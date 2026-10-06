import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Spherical } from 'three'
import { prefersReducedMotion, SHOT, VIEW } from '../../core/env.ts'
import type { OrbitView } from './views.ts'

interface CameraRigProps {
  /** Named framings for `?view=`; `home` is where the camera starts. */
  views: Record<string, OrbitView>
  distance: number
  minDistance: number
  maxDistance: number
}

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
/** Keep away from the poles, where an orbit flips over. */
const POLAR_MIN = 0.08 * Math.PI
const POLAR_MAX = 0.92 * Math.PI
/** Handheld drift amplitude in radians: a couple of pixels, never still, never noticed. */
const DRIFT = 0.0018

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Orbits the camera around the current level's centre. Drag (mouse or one finger) and the
 * arrow keys steer; the wheel and a pinch zoom. Everything eases, a flick carries on and
 * settles, and an idle camera breathes with a slow handheld drift. Fly-to and descending
 * between levels arrive in Phase 2.
 */
export function CameraRig({ views, distance, minDistance, maxDistance }: CameraRigProps) {
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)
  const start = views[VIEW ?? 'home'] ?? views.home ?? { azimuth: 0, polar: Math.PI / 2 }
  const startDistance = clamp(start.distance ?? distance, minDistance, maxDistance)

  const state = useRef({
    azimuth: start.azimuth,
    polar: start.polar,
    distance: startDistance,
    targetAzimuth: start.azimuth,
    targetPolar: start.polar,
    targetDistance: startDistance,
    velocityAzimuth: 0,
    velocityPolar: 0,
    pointers: new Map<number, { x: number; y: number }>(),
    pinch: 0,
    lastMove: 0,
    keys: new Set<string>(),
  })
  const limits = useRef({ minDistance, maxDistance })
  const spherical = useRef(new Spherical())

  useEffect(() => {
    limits.current = { minDistance, maxDistance }
    const s = state.current
    s.targetDistance = clamp(s.targetDistance, minDistance, maxDistance)
  }, [minDistance, maxDistance])

  useEffect(() => {
    const s = state.current
    const zoomBy = (factor: number) => {
      const { minDistance: min, maxDistance: max } = limits.current
      s.targetDistance = clamp(s.targetDistance * factor, min, max)
    }
    const pinchSpan = () => {
      const [a, b] = [...s.pointers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      s.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      s.lastMove = event.timeStamp
      s.velocityAzimuth = 0
      s.velocityPolar = 0
      s.pinch = pinchSpan()
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const previous = s.pointers.get(event.pointerId)
      if (!previous) return
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      s.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (s.pointers.size >= 2) {
        // Pinch: spread zooms in, squeeze zooms out.
        const span = pinchSpan()
        if (s.pinch > 0 && span > 0) zoomBy(s.pinch / span)
        s.pinch = span
        return
      }
      const dAzimuth = -dx * DRAG_SPEED
      const dPolar = -dy * DRAG_SPEED
      const dt = Math.max((event.timeStamp - s.lastMove) / 1000, 1 / 240)
      s.targetAzimuth += dAzimuth
      s.targetPolar = clamp(s.targetPolar + dPolar, POLAR_MIN, POLAR_MAX)
      // Smoothed velocity, carried on as momentum when the pointer lets go.
      s.velocityAzimuth = s.velocityAzimuth * 0.6 + (dAzimuth / dt) * 0.4
      s.velocityPolar = s.velocityPolar * 0.6 + (dPolar / dt) * 0.4
      s.lastMove = event.timeStamp
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!s.pointers.delete(event.pointerId)) return
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      s.pinch = pinchSpan()
      // A drag that stopped before release, or the end of a pinch, should not fling.
      if (s.pointers.size > 0 || event.timeStamp - s.lastMove > 90 || prefersReducedMotion()) {
        s.velocityAzimuth = 0
        s.velocityPolar = 0
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
      zoomBy(Math.exp(clamp(pixels, -240, 240) * WHEEL_ZOOM))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!ARROWS.has(event.key) || isTyping(event.target)) return
      event.preventDefault()
      s.keys.add(event.key)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      s.keys.delete(event.key)
    }
    const onBlur = () => s.keys.clear()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [canvas])

  useFrame((frame, delta) => {
    const s = state.current
    const dt = Math.min(delta, 0.1)

    if (s.keys.has('ArrowLeft')) s.targetAzimuth += KEY_SPEED * dt
    if (s.keys.has('ArrowRight')) s.targetAzimuth -= KEY_SPEED * dt
    if (s.keys.has('ArrowUp')) s.targetPolar -= KEY_SPEED * dt
    if (s.keys.has('ArrowDown')) s.targetPolar += KEY_SPEED * dt

    if (s.pointers.size === 0) {
      s.targetAzimuth += s.velocityAzimuth * dt
      s.targetPolar += s.velocityPolar * dt
      const decay = Math.exp(-FLING_DECAY * dt)
      s.velocityAzimuth *= decay
      s.velocityPolar *= decay
    }
    s.targetPolar = clamp(s.targetPolar, POLAR_MIN, POLAR_MAX)

    const ease = 1 - Math.exp(-FOLLOW * dt)
    s.azimuth += (s.targetAzimuth - s.azimuth) * ease
    s.polar += (s.targetPolar - s.polar) * ease
    // Zoom eases in log space, so near and far approach at the same pace.
    s.distance *= Math.exp(Math.log(s.targetDistance / s.distance) * ease)

    spherical.current.set(s.distance, s.polar, s.azimuth)
    camera.position.setFromSpherical(spherical.current)
    camera.lookAt(0, 0, 0)

    if (!SHOT && !prefersReducedMotion()) {
      const t = frame.clock.elapsedTime
      camera.rotateY(DRIFT * (0.6 * Math.sin(t * 0.11 + 1.3) + 0.4 * Math.sin(t * 0.27 + 4.1)))
      camera.rotateX(DRIFT * (0.6 * Math.sin(t * 0.09 + 2.2) + 0.4 * Math.sin(t * 0.23 + 0.7)))
      camera.rotateZ(DRIFT * 0.5 * Math.sin(t * 0.07 + 3.3))
    }
  })

  return null
}
