import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  DoubleSide,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector3,
  type DataTexture,
} from 'three'
import type { RingParams } from '../../core/planets.ts'
import ringsFrag from '../../shaders/rings/rings.frag'
import ringsVert from '../../shaders/rings/rings.vert'
import { SUN_SIZE } from './atmosphere.ts'
import { PREMULTIPLIED, toObjectSpace, type Sunlight } from './body.ts'

interface RingsProps {
  rings: RingParams
  texture: DataTexture
  sun: Sunlight
  /** 0 to 1, shared with the planet's fade-in. */
  fade: { current: number }
}

const sunObj = new Vector3()
const camObj = new Vector3()

/** A ring system in its planet's equatorial plane (lives inside the tilted, unspun frame). */
export function Rings({ rings, texture, sun, fade }: RingsProps) {
  const mesh = useRef<Mesh>(null)
  const geometry = useMemo(() => {
    const ring = new RingGeometry(rings.inner, rings.outer, 256, 1)
    ring.rotateX(-Math.PI / 2)
    return ring
  }, [rings.inner, rings.outer])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: 'rings',
        vertexShader: ringsVert,
        fragmentShader: ringsFrag,
        side: DoubleSide,
        ...PREMULTIPLIED,
        uniforms: {
          uRingMap: { value: texture },
          uSunObj: { value: new Vector3() },
          uCamObj: { value: new Vector3() },
          uSunIrradiance: { value: sun.irradiance },
          uInner: { value: rings.inner },
          uOuter: { value: rings.outer },
          uOpacity: { value: rings.opacity },
          uColorA: { value: new Color(rings.colorA) },
          uColorB: { value: new Color(rings.colorB) },
          uForward: { value: rings.forward },
          uSunSize: { value: SUN_SIZE },
          uFade: { value: 0 },
        },
      }),
    [texture, sun, rings],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    if (!mesh.current) return
    toObjectSpace(mesh.current, sun.direction, state.camera.position, sunObj, camObj)
    ;(material.uniforms.uSunObj!.value as Vector3).copy(sunObj)
    ;(material.uniforms.uCamObj!.value as Vector3).copy(camObj)
    material.uniforms.uFade!.value = fade.current
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />
}
