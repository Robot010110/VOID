import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Spherical } from 'three'
import { prefersReducedMotion, SHOT, VIEW } from '../../core/env.ts'
import { HOME_BAND, type Vec3 } from '../../core/sky.ts'

/** Distance from the orbit's centre. */
const ORBIT_RADIUS = 6
/** Radians of orbit per CSS pixel dragged. */
const DRAG_SPEED = 0.0042
/** Radians per second while an arrow key is held. */
const KEY_SPEED = 0.85
/** How quickly the camera eases towards where it is being steered (per second). */
const FOLLOW = 7
/** How quickly a flick's momentum dies away (per second). */
const FLING_DECAY = 3.2
/** Keep away from the poles, where an orbit flips over. */
const POLAR_MIN = 0.16 * Math.PI
const POLAR_MAX = 0.84 * Math.PI
/** Handheld drift amplitude in radians: a couple of pixels, never still, never noticed. */
const DRIFT = 0.0018

interface Orbit {
  azimuth: number
  polar: number
}

/** The orbit position whose camera looks along `direction` towards the centre. */
function lookingAlong(direction: Vec3): Orbit {
  const [x, y, z] = direction
  return { azimuth: Math.atan2(-x, -z), polar: Math.acos(Math.max(-1, Math.min(1, -y))) }
}

/** Named framings, used by `?view=` and the screenshot script. */
const VIEWS: Record<string, Orbit> = {
  home: { azimuth: 0, polar: Math.PI / 2 + 0.04 },
  core: lookingAlong(HOME_BAND.core),
  pole: lookingAlong(HOME_BAND.pole),
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}

/**
 * Orbits the camera around the current level's centre. Drag (mouse or one finger) and the
 * arrow keys steer; everything eases, a flick carries on and settles, and an idle camera
 * breathes with a slow handheld drift. Fly-to and zoom arrive with the levels in Phase 2.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)
  const start = VIEWS[VIEW ?? 'home'] ?? VIEWS.home!

  const state = useRef({
    azimuth: start.azimuth,
    polar: start.polar,
    targetAzimuth: start.azimuth,
    targetPolar: start.polar,
    velocityAzimuth: 0,
    velocityPolar: 0,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    lastMove: 0,
    keys: new Set<string>(),
  })
  const spherical = useRef(new Spherical())

  useEffect(() => {
    const s = state.current

    const onPointerDown = (event: PointerEvent) => {
      if (s.pointerId !== -1 || (event.pointerType === 'mouse' && event.button !== 0)) return
      s.pointerId = event.pointerId
      s.lastX = event.clientX
      s.lastY = event.clientY
      s.lastMove = event.timeStamp
      s.velocityAzimuth = 0
      s.velocityPolar = 0
      canvas.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== s.pointerId) return
      const dAzimuth = -(event.clientX - s.lastX) * DRAG_SPEED
      const dPolar = -(event.clientY - s.lastY) * DRAG_SPEED
      const dt = Math.max((event.timeStamp - s.lastMove) / 1000, 1 / 240)
      s.targetAzimuth += dAzimuth
      s.targetPolar = Math.min(Math.max(s.targetPolar + dPolar, POLAR_MIN), POLAR_MAX)
      // Smoothed velocity, carried on as momentum when the pointer lets go.
      s.velocityAzimuth = s.velocityAzimuth * 0.6 + (dAzimuth / dt) * 0.4
      s.velocityPolar = s.velocityPolar * 0.6 + (dPolar / dt) * 0.4
      s.lastX = event.clientX
      s.lastY = event.clientY
      s.lastMove = event.timeStamp
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== s.pointerId) return
      s.pointerId = -1
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      // A drag that stopped before release should not fling.
      if (event.timeStamp - s.lastMove > 90 || prefersReducedMotion()) {
        s.velocityAzimuth = 0
        s.velocityPolar = 0
      }
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
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
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

    if (s.pointerId === -1) {
      s.targetAzimuth += s.velocityAzimuth * dt
      s.targetPolar += s.velocityPolar * dt
      const decay = Math.exp(-FLING_DECAY * dt)
      s.velocityAzimuth *= decay
      s.velocityPolar *= decay
    }
    s.targetPolar = Math.min(Math.max(s.targetPolar, POLAR_MIN), POLAR_MAX)

    const ease = 1 - Math.exp(-FOLLOW * dt)
    s.azimuth += (s.targetAzimuth - s.azimuth) * ease
    s.polar += (s.targetPolar - s.polar) * ease

    spherical.current.set(ORBIT_RADIUS, s.polar, s.azimuth)
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
