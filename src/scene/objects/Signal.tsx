import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three'
import { useLevel } from '../levels/context.ts'
import { worldClock } from '../shared/clock.ts'
import { spectrum } from '../shared/spectrum.ts'

const vertexShader = /* glsl */ `
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  gl_PointSize = uSize;
}
`

// A soft cold glow with a faint ring breathing outward from it, slowly, as a voice carries.
const fragmentShader = /* glsl */ `
uniform float uStrength;
uniform float uPhase;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.0) discard;
  float glow = exp(-r * r * 9.0) * 1.6 + exp(-r * r * 2.2) * 0.25;
  float ring = exp(-pow((r - uPhase) * 9.0, 2.0)) * 0.35 * (1.0 - uPhase);
  vec3 colour = vec3(0.62, 0.9, 1.0) * (glow + ring) * uStrength;
  gl_FragColor = vec4(colour, 1.0);
}
`

/** CSS pixels across, at a device pixel ratio of 1. */
const SIZE = 96
/** Seconds for one ring to carry outward. */
const PERIOD = 3.2

/**
 * Seen by radio from its system, a world whose people are still there gives itself away: a
 * cold glow at its place, a faint ring carrying outward from it every few seconds. Drawn
 * only while the view is turning to radio.
 */
export function Signal() {
  const level = useLevel()
  const points = useRef<Points>(null)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: 'signal',
        vertexShader,
        fragmentShader,
        uniforms: { uSize: { value: SIZE }, uStrength: { value: 0 }, uPhase: { value: 0 } },
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  )
  const geometry = useMemo(() => new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(3), 3)), [])
  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  useFrame((state) => {
    const object = points.current
    if (!object) return
    const strength = spectrum.radio * level.fade.current
    object.visible = strength > 0.01
    material.uniforms.uStrength!.value = strength
    material.uniforms.uPhase!.value = (worldClock.real / PERIOD) % 1
    material.uniforms.uSize!.value = SIZE * state.viewport.dpr
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={20} />
}
