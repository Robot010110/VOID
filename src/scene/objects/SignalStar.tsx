import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { SHOT, SIGNAL } from '../../core/env.ts'
import { SIGNAL_DIRECTION, signalLight, signalLit } from '../../secrets/secrets.ts'
import { signalScene, signalSpot } from '../../secrets/sequences.ts'
import { useLevel } from '../levels/context.ts'
import { worldClock } from '../shared/clock.ts'

const vertexShader = /* glsl */ `
uniform vec3 uDirection;
uniform float uSize;
void main() {
  // A direction only: as far away as the sky, wherever the camera is.
  vec3 direction = normalize(mat3(modelViewMatrix) * uDirection);
  vec4 clip = projectionMatrix * vec4(direction, 0.0);
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
  gl_PointSize = uSize;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColour;
uniform float uLight;
void main() {
  // A tight core in a faint halo, as the sky's other stars, measured in the sprite's own
  // pixels at its usual size: as it swells, all of it swells.
  vec2 p = (gl_PointCoord - 0.5) * 22.0;
  float r2 = dot(p, p);
  float core = exp(-r2 / 2.6);
  float halo = 0.07 * exp(-r2 / 34.0);
  float edge = 1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uColour * (core + halo) * edge * uLight, 1.0);
}
`

/** Its light: a cool white, a little bluer than starlight, as no star quite is. */
const COLOUR = new Vector3(0.82, 0.93, 1)
/** Brightest at the height of a flash; and its sprite's size in CSS pixels. */
const PEAK = 2.4
const SIZE = 22

/** In a screenshot run (`?signal`), the moment of the first flash, so it can be seen. */
const SHOT_MOMENT = 0.2

const world = new Vector3()
const projected = new Vector3()

/**
 * The signal: one faint star in the sky between the galaxies that blinks two, three, five, and
 * waits, and begins again (secrets/secrets.ts). It is fixed in the universe's sky, as far away
 * as the stars; while it is lit, a click on it is answered (see secrets/sequences.ts).
 */
export function SignalStar({ active }: { active: boolean }) {
  const level = useLevel()
  const points = useRef<Points>(null)
  const { geometry, material } = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    const material = new ShaderMaterial({
      name: 'signal',
      vertexShader,
      fragmentShader,
      uniforms: {
        uDirection: { value: new Vector3(...SIGNAL_DIRECTION) },
        uColour: { value: COLOUR },
        uLight: { value: 0 },
        uSize: { value: SIZE },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    return { geometry, material }
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      signalSpot.shown = false
    },
    [geometry, material],
  )

  useFrame((state) => {
    const object = points.current
    if (!object) return
    const t = SHOT ? (SIGNAL ? SHOT_MOMENT : 3) : worldClock.real
    const steady = signalScene.steady
    const light = signalLight(t) + (1 - signalLight(t)) * steady
    const dpr = state.viewport.dpr
    material.uniforms.uLight!.value = light * PEAK * level.fade.current
    material.uniforms.uSize!.value = SIZE * dpr * signalScene.swell

    // Where it is on screen, for a click.
    const camera = state.camera as PerspectiveCamera
    world.set(...SIGNAL_DIRECTION).transformDirection(object.matrixWorld)
    projected.copy(camera.position).addScaledVector(world, camera.far * 0.5).project(camera)
    const x = ((projected.x + 1) / 2) * state.size.width
    const y = ((1 - projected.y) / 2) * state.size.height
    const inView = projected.z < 1 && x >= 0 && y >= 0 && x <= state.size.width && y <= state.size.height
    signalSpot.x = x
    signalSpot.y = y
    signalSpot.shown = active && inView && level.fade.current > 0.5
    signalSpot.lit = signalLit(t)
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={-8} />
}
