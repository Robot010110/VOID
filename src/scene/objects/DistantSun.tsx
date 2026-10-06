import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, Color, PlaneGeometry, ShaderMaterial, Vector2, type PerspectiveCamera, type Vector3 } from 'three'
import { blackbody } from '../../core/blackbody.ts'
import distantFrag from '../../shaders/star/distant.frag'
import distantVert from '../../shaders/star/distant.vert'
import { worldClock } from '../shared/clock.ts'
import { BODY_FADE_IN, fadeIn } from './body.ts'

/** Fraction of the quad's half-size taken by the disc; the rest is corona. */
const DISC = 0.06

interface DistantSunProps {
  /** Unit vector towards the sun, world space. */
  direction: Vector3
  temperature: number
  /** Angular radius of the disc, radians. A little larger than life, for presence. */
  angularRadius?: number
  intensity?: number
}

/**
 * The system's star as seen from one of its planets: a small, intensely bright disc at
 * infinity with a soft corona. Drawn with the sky, so planets and moons pass in front of it.
 */
export function DistantSun({ direction, temperature, angularRadius = 0.0105, intensity = 60 }: DistantSunProps) {
  const geometry = useMemo(() => new PlaneGeometry(2, 2), [])
  const material = useMemo(() => {
    const [r, g, b] = blackbody(temperature)
    return new ShaderMaterial({
      name: 'distant-sun',
      vertexShader: distantVert,
      fragmentShader: distantFrag,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uDirection: { value: direction },
        uSize: { value: 100 },
        uViewport: { value: new Vector2(1, 1) },
        uColor: { value: new Color(r, g, b) },
        uIntensity: { value: intensity },
        uDisc: { value: DISC },
        uCorona: { value: 1.6 },
        uFade: { value: 0 },
      },
    })
  }, [direction, temperature, intensity])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera
    const height = state.size.height * state.viewport.dpr
    const pixelsPerRadian = height / 2 / Math.tan((camera.fov * Math.PI) / 360)
    const u = material.uniforms
    u.uSize!.value = (angularRadius * pixelsPerRadian) / DISC
    ;(u.uViewport!.value as Vector2).set(state.size.width * state.viewport.dpr, height)
    u.uFade!.value = fadeIn(worldClock.real, 0, BODY_FADE_IN)
  })

  return <mesh geometry={geometry} material={material} renderOrder={-999} frustumCulled={false} />
}
