import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  Points,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { SHOT } from '../../core/env.ts'
import type { GalaxyLook } from '../../core/galaxy.ts'
import { findSecret, RADIO_SEEN, RADIO_WATCH } from '../../secrets/secrets.ts'
import { useLevel } from '../levels/context.ts'
import { worldClock } from '../shared/clock.ts'
import { spectrum } from '../shared/spectrum.ts'

const vertexShader = /* glsl */ `
attribute float aAngle;
uniform float uTime;
uniform float uSize;
uniform float uLight;
varying float vLight;
void main() {
  // A slow wave runs round the ring, each light flaring as it passes and fading behind it.
  float behind = mod(uTime * 0.42 - aAngle, 6.2831853);
  float pulse = exp(-behind * 2.4);
  vLight = (0.34 + 0.95 * pulse) * uLight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uLight > 0.0 ? uSize * (0.85 + 0.45 * pulse) : 0.0;
}
`

const fragmentShader = /* glsl */ `
varying float vLight;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r2 = dot(p, p) * 4.0;
  float light = exp(-r2 * 7.0) + 0.12 * exp(-r2 * 1.6);
  gl_FragColor = vec4(vec3(0.78, 0.94, 1.0) * light * (1.0 - r2) * vLight, 1.0);
}
`

/** Lights round the ring, and the ring's radius in its galaxy's radii. */
const LIGHTS = 64
const RADIUS = 1.28
/** The lights' size in CSS pixels, close (in the galaxy) and from among the galaxies. */
const SIZE = { galaxy: 8, universe: 4 } as const
/** Pixels across the ring must span, on screen, before it counts as seen. */
const SEEN_RADIUS = { galaxy: 60, universe: 40 } as const

const centre = new Vector3()
const rim = new Vector3()

/**
 * The radio whisper: round one galaxy, out past its disc, a ring of lights that only radio
 * shows, a slow wave of brightness running round it. No eye could see them; nobody knows who
 * hung them there. Drawn in the galaxy's own frame, close up (`galaxy`) or from among the
 * galaxies (`universe`); watched by radio for a moment, it counts as found.
 */
export function RadioRing({ look, detail, active }: { look: GalaxyLook; detail: 'galaxy' | 'universe'; active: boolean }) {
  const level = useLevel()
  const root = useRef<Group>(null)
  const watched = useRef(0)
  const radius = look.shape.radius * RADIUS

  const parts = useMemo(() => {
    const positions = new Float32Array(LIGHTS * 3)
    const angles = new Float32Array(LIGHTS)
    for (let i = 0; i < LIGHTS; i++) {
      const angle = (i / LIGHTS) * Math.PI * 2
      positions.set([Math.cos(angle) * radius, 0, -Math.sin(angle) * radius], i * 3)
      angles[i] = angle
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('aAngle', new BufferAttribute(angles, 1))
    const material = new ShaderMaterial({
      name: 'radio-ring',
      vertexShader,
      fragmentShader,
      uniforms: { uTime: { value: 0 }, uSize: { value: 4 }, uLight: { value: 0 } },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    // The thread the lights hang on: a faint line all the way round.
    const segments = 256
    const thread = new Float32Array(segments * 3)
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      thread.set([Math.cos(angle) * radius, 0, -Math.sin(angle) * radius], i * 3)
    }
    const threadGeometry = new BufferGeometry()
    threadGeometry.setAttribute('position', new BufferAttribute(thread, 3))
    const threadMaterial = new LineBasicMaterial({
      name: 'radio-thread',
      color: 0xbfe8f2,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    return {
      points: new Points(geometry, material),
      line: new LineLoop(threadGeometry, threadMaterial),
      geometry,
      material,
      threadGeometry,
      threadMaterial,
    }
  }, [radius])
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
      parts.threadGeometry.dispose()
      parts.threadMaterial.dispose()
    },
    [parts],
  )

  useFrame((state, delta) => {
    const group = root.current
    if (!group) return
    const radio = spectrum.radio
    const light = radio > 0.01 ? radio ** 1.5 * level.fade.current : 0
    group.visible = light > 0
    const u = parts.material.uniforms
    u.uTime!.value = SHOT ? 4 : worldClock.real
    u.uLight!.value = light * (detail === 'galaxy' ? 1.7 : 2)
    u.uSize!.value = SIZE[detail] * state.viewport.dpr
    parts.threadMaterial.opacity = light * (detail === 'galaxy' ? 0.16 : 0.3)

    // Watched by radio, close enough to make out, for a moment: found.
    if (!active || radio < RADIO_SEEN) {
      watched.current = 0
      return
    }
    const camera = state.camera as PerspectiveCamera
    group.getWorldPosition(centre)
    rim.set(radius, 0, 0).applyMatrix4(group.matrixWorld)
    centre.project(camera)
    rim.project(camera)
    const span = Math.hypot((rim.x - centre.x) * state.size.width, (rim.y - centre.y) * state.size.height) / 2
    const inView = centre.z < 1 && Math.abs(centre.x) < 1 && Math.abs(centre.y) < 1
    watched.current = inView && span >= SEEN_RADIUS[detail] ? watched.current + Math.min(delta, 0.1) : 0
    if (watched.current >= RADIO_WATCH) findSecret('radio')
  })

  return (
    <group ref={root} visible={false}>
      <primitive object={parts.line} frustumCulled={false} renderOrder={-7} />
      <primitive object={parts.points} frustumCulled={false} renderOrder={-6} />
    </group>
  )
}
