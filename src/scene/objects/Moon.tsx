import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  HalfFloatType,
  ShaderMaterial,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { MOON_SURFACES, type MoonSpec } from '../../core/planets.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import surfaceFrag from '../../shaders/planet/surface.frag'
import surfaceVert from '../../shaders/planet/surface.vert'
import { worldClock } from '../shared/clock.ts'
import { bakeCube, createCubeTarget, icosphere, sphereDetail } from '../shared/gpu.ts'
import { toObjectSpace, type Sunlight } from './body.ts'
import { createDeriveBake, createTerrainBake, surfaceUniforms, TERRAIN_STYLE } from './surface.ts'

interface MoonProps {
  spec: MoonSpec
  seed: number
  sun: Sunlight
  /** Follows the parent body's fade-in. */
  fade: { current: number }
}

const sunObj = new Vector3()
const camObj = new Vector3()
const center = new Vector3()

/**
 * A moon: a small airless world in its planet's equatorial frame, tidally locked, on an
 * inclined circular orbit. Uses the same surface shader as planets, without air or sea.
 */
export function Moon({ spec, seed, sun, fade }: MoonProps) {
  const gl = useThree((s) => s.gl)
  const [face] = useState(() => QUALITY[useVoid.getState().quality].moonFace)
  const body = MOON_SURFACES[spec.kind]
  const mesh = useRef<Mesh>(null)

  const maps = useMemo(
    () => ({
      terrain: createCubeTarget(face, { type: HalfFloatType }),
      derived: createCubeTarget(face),
    }),
    [face],
  )
  const bakes = useMemo(() => {
    const terrain = createTerrainBake(body.terrain, seed)
    const derive = createDeriveBake(body.terrain, body.surface)
    derive.uniforms.uTerrain!.value = maps.terrain.texture
    return { terrain, derive }
  }, [body, seed, maps])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: `moon-${spec.kind}`,
        vertexShader: surfaceVert,
        fragmentShader: surfaceFrag,
        defines: { [TERRAIN_STYLE[body.terrain.style]]: '' },
        uniforms: {
          ...surfaceUniforms(body.surface, sun),
          uTerrain: { value: maps.terrain.texture },
          uNormals: { value: maps.derived.texture },
        },
      }),
    [spec.kind, body, sun, maps],
  )

  useLayoutEffect(() => {
    bakeCube(gl, maps.terrain, bakes.terrain)
    bakeCube(gl, maps.derived, bakes.derive)
  }, [gl, maps, bakes])

  useEffect(
    () => () => {
      maps.terrain.dispose()
      maps.derived.dispose()
      bakes.terrain.dispose()
      bakes.derive.dispose()
      material.dispose()
    },
    [maps, bakes, material],
  )

  const lod = useRef(-1)

  useFrame((state) => {
    const moon = mesh.current
    if (!moon) return
    const angle = spec.phase + (worldClock.time / spec.period) * Math.PI * 2
    const r = spec.distance
    moon.position.set(Math.cos(angle) * r, Math.sin(angle) * Math.sin(spec.inclination) * r, Math.sin(angle) * Math.cos(spec.inclination) * r)
    // Tidally locked: the same face always turned to the planet.
    moon.rotation.y = -angle
    moon.updateMatrixWorld()

    const camera = state.camera as PerspectiveCamera
    toObjectSpace(moon, sun.direction, camera.position, sunObj, camObj)
    const u = material.uniforms
    ;(u.uSunObj!.value as Vector3).copy(sunObj)
    ;(u.uCamObj!.value as Vector3).copy(camObj)
    u.uFade!.value = fade.current

    moon.getWorldPosition(center)
    const distance = camera.position.distanceTo(center)
    const pixels =
      (spec.radius / Math.max(distance, spec.radius * 1.0001)) /
      Math.tan((camera.fov * Math.PI) / 360) *
      state.size.height *
      state.viewport.dpr *
      0.5
    const detail = sphereDetail(pixels)
    if (detail !== lod.current) {
      lod.current = detail
      moon.geometry = icosphere(detail)
    }
  })

  return (
    <mesh
      ref={mesh}
      geometry={icosphere(12)}
      material={material}
      scale={spec.radius}
      frustumCulled={false}
      dispose={null}
    />
  )
}
