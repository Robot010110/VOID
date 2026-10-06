import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ShaderMaterial, Vector3, type Mesh, type PerspectiveCamera } from 'three'
import { MOON_SURFACES, type MoonSpec } from '../../core/planets.ts'
import { useVoid } from '../../core/store.ts'
import surfaceFrag from '../../shaders/planet/surface.frag'
import surfaceVert from '../../shaders/planet/surface.vert'
import { cancelBake, enqueueBake } from '../shared/bake.ts'
import { peek, useShared } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { icosphere, sphereDetail } from '../shared/gpu.ts'
import { useLevel } from '../levels/context.ts'
import { pixelRadius, SOLID, toObjectSpace, worldRadius, type Sunlight } from './body.ts'
import { surfaceUniforms, TERRAIN_STYLE } from './surface.ts'
import { moonFace, moonKey, moonPolicy, MoonWorld, type Detail } from './worlds.ts'

interface MoonProps {
  spec: MoonSpec
  seed: number
  sun: Sunlight
  /** Follows the parent body's fade. */
  fade: { current: number }
  detail: Detail
}

const sunObj = new Vector3()
const camObj = new Vector3()
const center = new Vector3()

/**
 * A moon: a small airless world in its planet's equatorial frame, tidally locked, on an
 * inclined circular orbit. Uses the same surface shader as planets, without air or sea.
 */
export function Moon({ spec, seed, sun, fade, detail }: MoonProps) {
  const gl = useThree((s) => s.gl)
  const level = useLevel()
  const [tier] = useState(() => useVoid.getState().quality)
  const face = moonFace(detail, tier)
  const closeKey = moonKey(spec, seed, moonFace('close', tier))
  const world = useShared(moonKey(spec, seed, face), () => new MoonWorld(spec, seed, face), moonPolicy(detail))
  const body = MOON_SURFACES[spec.kind]
  const mesh = useRef<Mesh>(null)
  const bound = useRef<MoonWorld | null>(null)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: `moon-${spec.kind}`,
        vertexShader: surfaceVert,
        fragmentShader: surfaceFrag,
        defines: { [TERRAIN_STYLE[body.terrain.style]]: '' },
        ...SOLID,
        uniforms: {
          ...surfaceUniforms(body.surface, sun),
          uTerrain: { value: null },
          uNormals: { value: null },
        },
      }),
    [spec.kind, body, sun],
  )

  useLayoutEffect(() => {
    if (world.job.ready) return
    if (level.background) {
      enqueueBake(world.job)
      return () => cancelBake(world.job)
    }
    world.job.run(gl)
  }, [world, gl, level.background])

  useEffect(() => {
    bound.current = null
    return () => material.dispose()
  }, [material])

  const lod = useRef(-1)

  useFrame((state) => {
    const moon = mesh.current
    if (!moon) return
    let maps: MoonWorld | null = world.job.ready ? world : null
    if (detail === 'system') {
      const close = peek<MoonWorld>(closeKey)
      if (close?.job.ready) maps = close
    }
    moon.visible = maps !== null
    if (!maps) return
    if (maps !== bound.current) {
      material.uniforms.uTerrain!.value = maps.terrain.texture
      material.uniforms.uNormals!.value = maps.derived.texture
      bound.current = maps
    }

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

    center.setFromMatrixPosition(moon.matrixWorld)
    const height = state.size.height * state.viewport.dpr
    const pixels = pixelRadius(worldRadius(moon), camera.position.distanceTo(center), camera.fov, height)
    const detailLevel = sphereDetail(pixels)
    if (detailLevel !== lod.current) {
      lod.current = detailLevel
      moon.geometry = icosphere(detailLevel)
    }
  })

  return (
    <mesh
      ref={mesh}
      geometry={icosphere(12)}
      material={material}
      scale={spec.radius}
      visible={false}
      frustumCulled={false}
      dispose={null}
    />
  )
}
