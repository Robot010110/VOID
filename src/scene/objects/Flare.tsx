import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import flareFrag from '../../shaders/star/flare.frag'
import flareVert from '../../shaders/star/flare.vert'
import { useLevel } from '../levels/context.ts'

/** Place along the axis, radius (share of screen height), shape (0 halo, 1 ghost), tint, strength. */
// prettier-ignore
const ELEMENTS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0, 0.3, 0, 0, 0.0035],
  [0.34, 0.022, 1, 1, 0.016],
  [0.58, 0.05, 1, 2, 0.008],
  [0.74, 0.016, 1, 0, 0.018],
  [1.1, 0.085, 1, 3, 0.004],
  [1.32, 0.035, 1, 1, 0.007],
  [1.62, 0.15, 1, 2, 0.002],
]

function createGeometry(): BufferGeometry {
  const count = ELEMENTS.length
  const positions = new Float32Array(count * 4 * 3)
  const elements = new Float32Array(count * 4 * 4)
  const strengths = new Float32Array(count * 4)
  const indices: number[] = []
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1]
  ELEMENTS.forEach(([place, radius, shape, tint, strength], i) => {
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c
      positions.set([corners[c * 2]!, corners[c * 2 + 1]!, 0], v * 3)
      elements.set([place, radius, shape, tint], v * 4)
      strengths[v] = strength
    }
    indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aElement', new BufferAttribute(elements, 4))
  geometry.setAttribute('aStrength', new BufferAttribute(strengths, 1))
  geometry.setIndex(indices)
  return geometry
}

export interface FlareSource {
  /**
   * Writes the light's world position into `out`, or its direction if it is at infinity, and
   * returns how much of it is visible (0 to 1) from the camera, given its bodies in front.
   */
  update(camera: Vector3, out: Vector3): number
  /** True when `out` is a direction (a sun seen from one of its worlds). */
  readonly infinite: boolean
}

interface FlareProps {
  source: FlareSource
  /** Light colour, normalised so the brightest channel is 1. */
  color: Color
  strength?: number
}

const light = new Vector3()
const point = new Vector3()
const forward = new Vector3()

/** A very subtle lens flare: a halo and a few ghosts, only while the light is unobstructed. */
export function Flare({ source, color, strength = 1 }: FlareProps) {
  const level = useLevel()
  const geometry = useMemo(() => createGeometry(), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: 'lens-flare',
        vertexShader: flareVert,
        fragmentShader: flareFrag,
        blending: AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uSource: { value: new Vector2() },
          uAspect: { value: 1 },
          uColor: { value: color },
          uStrength: { value: 0 },
        },
      }),
    [color],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera
    const visible = source.update(camera.position, light)
    camera.getWorldDirection(forward)
    let ahead: number
    if (source.infinite) {
      ahead = light.dot(forward)
      point.copy(light).multiplyScalar(camera.far * 0.5).add(camera.position)
    } else {
      ahead = forward.dot(point.subVectors(light, camera.position))
      point.copy(light)
    }
    // Nothing when the light is behind the camera or hidden.
    if (ahead <= 0 || visible <= 0) {
      material.uniforms.uStrength!.value = 0
      return
    }
    point.project(camera)
    // Fade out as the light nears the edge of the frame.
    const edge = Math.max(Math.abs(point.x), Math.abs(point.y))
    const inFrame = 1 - Math.min(1, Math.max(0, (edge - 0.85) / 0.3))
    ;(material.uniforms.uSource!.value as Vector2).set(point.x, point.y)
    material.uniforms.uAspect!.value = state.size.width / Math.max(state.size.height, 1)
    material.uniforms.uStrength!.value = visible * inFrame * strength * level.fade.current
  })

  return <mesh geometry={geometry} material={material} renderOrder={1000} frustumCulled={false} />
}
