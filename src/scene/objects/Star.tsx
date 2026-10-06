import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { blackbody } from '../../core/blackbody.ts'
import type { StarData } from '../../core/universe.ts'
import surfaceVert from '../../shaders/planet/surface.vert'
import coronaFrag from '../../shaders/star/corona.frag'
import coronaVert from '../../shaders/star/corona.vert'
import starFrag from '../../shaders/star/surface.frag'
import { worldClock } from '../shared/clock.ts'
import { icosphere, sphereDetail } from '../shared/gpu.ts'
import { useLevel } from '../levels/context.ts'
import { pixelRadius, seedOffset, toObjectSpace, worldRadius } from './body.ts'

/** Radiance at the centre of the disc: bright enough to bloom, dim enough to show its face. */
const SURFACE_INTENSITY = 3.2
const CORONA_INTENSITY = 1.5
/** Half-size of the corona's quad, in star radii. */
const CORONA_EXTENT = 7

const sunObj = new Vector3()
const camObj = new Vector3()
const center = new Vector3()

interface StarProps {
  star: StarData
}

/**
 * A star up close: a seething, spotted sphere and a corona of streamers and prominences.
 * Both add light rather than cover what is behind them; the sphere still writes depth, so
 * worlds behind it are hidden and worlds in front of it hide it.
 */
export function Star({ star }: StarProps) {
  const level = useLevel()
  const sphere = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)

  const materials = useMemo(() => {
    const offset = seedOffset(star.seed)
    const [r, g, b] = blackbody(star.temperature)
    const surface = new ShaderMaterial({
      name: 'star-surface',
      vertexShader: surfaceVert,
      fragmentShader: starFrag,
      blending: AdditiveBlending,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uTemperature: { value: star.temperature },
        uIntensity: { value: SURFACE_INTENSITY },
        uCamObj: { value: new Vector3() },
        uSeedOffset: { value: offset },
        uFade: { value: 0 },
      },
    })
    const corona = new ShaderMaterial({
      name: 'star-corona',
      vertexShader: coronaVert,
      fragmentShader: coronaFrag,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new Color(r, g, b) },
        uIntensity: { value: CORONA_INTENSITY },
        uTime: { value: 0 },
        uExtent: { value: CORONA_EXTENT },
        uLimb: { value: 1 },
        uSeedOffset: { value: offset.clone().multiplyScalar(0.37) },
        uFade: { value: 0 },
      },
    })
    return { surface, corona }
  }, [star])
  const quad = useMemo(() => new PlaneGeometry(2, 2), [])

  useEffect(
    () => () => {
      materials.surface.dispose()
      materials.corona.dispose()
      quad.dispose()
    },
    [materials, quad],
  )

  const lod = useRef(-1)

  useFrame((state) => {
    const mesh = sphere.current
    if (!mesh) return
    const time = worldClock.time
    mesh.rotation.y = (time / star.rotation) * Math.PI * 2
    mesh.updateWorldMatrix(true, false)

    const camera = state.camera as PerspectiveCamera
    toObjectSpace(mesh, sunObj.set(0, 1, 0), camera.position, sunObj, camObj)
    const s = materials.surface.uniforms
    ;(s.uCamObj!.value as Vector3).copy(camObj)
    s.uTime!.value = time
    s.uFade!.value = level.fade.current

    // Seen up close, the limb lies a little outside the quad's radius-1 circle.
    center.setFromMatrixPosition(mesh.matrixWorld)
    const radius = worldRadius(mesh)
    const distance = Math.max(camera.position.distanceTo(center) / radius, 1.0001)
    const c = materials.corona.uniforms
    c.uLimb!.value = 1 / Math.sqrt(1 - 1 / (distance * distance))
    c.uTime!.value = time
    c.uFade!.value = level.fade.current

    const height = state.size.height * state.viewport.dpr
    const detail = sphereDetail(pixelRadius(radius, distance * radius, camera.fov, height))
    if (detail !== lod.current) {
      lod.current = detail
      mesh.geometry = icosphere(detail)
    }
  })

  return (
    <group>
      <mesh
        ref={sphere}
        geometry={icosphere(24)}
        material={materials.surface}
        scale={star.radius}
        frustumCulled={false}
        dispose={null}
      />
      <mesh
        ref={halo}
        geometry={quad}
        material={materials.corona}
        scale={star.radius}
        renderOrder={0.5}
        frustumCulled={false}
      />
    </group>
  )
}
