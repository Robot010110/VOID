import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ClampToEdgeWrapping,
  Color,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  NoBlending,
  OrthographicCamera,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Group,
  type Object3D,
  type PerspectiveCamera,
} from 'three'
import type { HoleSite } from '../../core/cosmos.ts'
import type { QualityTier } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import noiseFrag from '../../shaders/blackhole/noise.frag'
import traceFrag from '../../shaders/blackhole/trace.frag'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import { useLevel } from '../levels/context.ts'
import { BakeJob, cancelBake, enqueueBake } from '../shared/bake.ts'
import { useShared, type Disposable } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { FULLSCREEN_TRIANGLE } from '../shared/gpu.ts'
import { lens } from '../stage.ts'

/** The disc's inner edge (the innermost stable orbit) and its outer edge, in the hole's radii. */
export const DISC_INNER = 3
export const DISC_OUTER = 13
/** Rays are traced through this sphere; beyond it the lensing pass alone bends them. */
const BOUND = DISC_OUTER * 1.12

/** The trace's share of the screen's size, and its most steps along a ray, by tier. */
const TRACE_SCALE: Record<QualityTier, number> = { high: 0.85, medium: 0.7, low: 0.55 }
const STEPS: Record<QualityTier, number> = { high: 88, medium: 76, low: 64 }

/** Below this many pixels of bending anywhere on screen, the lensing pass is skipped. */
const VISIBLE_BEND = 0.75

const TWEAKS: TweakSchema = {
  brightness: { value: 9, min: 0, max: 40, step: 0.01 },
  temperature: { value: 11000, min: 3000, max: 25000, step: 10 },
  beaming: { value: 0.72, min: 0, max: 1, step: 0.01 },
}

const NOISE_POLICY = { keepFor: 600_000, group: 'hole-noise', spare: 1 }

/** The disc's turbulence, baked once. */
class DiscNoise implements Disposable {
  readonly target: WebGLRenderTarget
  readonly bake: ShaderMaterial
  readonly job: BakeJob

  constructor(width: number) {
    const height = width / 4
    this.target = new WebGLRenderTarget(width, height, {
      type: UnsignedByteType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    })
    this.target.texture.wrapS = RepeatWrapping
    this.target.texture.wrapT = ClampToEdgeWrapping
    this.bake = new ShaderMaterial({
      name: 'hole-noise',
      vertexShader: fullscreenVert,
      fragmentShader: noiseFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: { uSize: { value: new Vector2(width, height) } },
    })
    this.job = new BakeJob([{ target: this.target, material: this.bake }])
  }

  dispose() {
    this.target.dispose()
    this.bake.dispose()
  }
}

/** True when the object and everything above it is shown. */
function shown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return true
}

const clearColour = new Color()
const inverse = new Matrix4()
const holeTurn = new Matrix3()
const viewTurn = new Matrix3()
const towards = new Vector3()
const nearest = new Vector3()
const column = new Vector3()

/** The rotation part of a matrix whose scale is uniform. */
function rotationOf(matrix: Matrix4, out: Matrix3): Matrix3 {
  out.setFromMatrix4(matrix)
  const scale = column.setFromMatrixColumn(matrix, 0).length()
  const e = out.elements
  for (let i = 0; i < 9; i++) e[i] = e[i]! / scale
  return out
}

/**
 * The black hole, the universe's one handcrafted wonder. Each frame the camera's rays near it are
 * traced through its gravity into a buffer of their own (the shadow, the disc, the photon ring),
 * and the lensing pass bends the rest of the scene around it and lays the trace on top.
 */
export function BlackHole({ hole }: { hole: HoleSite }) {
  const level = useLevel()
  const gl = useThree((s) => s.gl)
  const [quality] = useState(() => useVoid.getState().quality)
  const noise = useShared(`hole-noise:${quality === 'low' ? 512 : 1024}`, () => new DiscNoise(quality === 'low' ? 512 : 1024), NOISE_POLICY)
  const root = useRef<Group>(null)

  useLayoutEffect(() => {
    if (noise.job.ready) return
    if (level.background) {
      enqueueBake(noise.job)
      return () => cancelBake(noise.job)
    }
    noise.job.run(gl)
  }, [noise, gl, level.background])

  const parts = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    })
    const material = new ShaderMaterial({
      name: 'hole-trace',
      vertexShader: fullscreenVert,
      fragmentShader: traceFrag,
      defines: { STEPS: STEPS[quality] },
      uniforms: {
        uResolution: { value: new Vector2(1, 1) },
        uCamera: { value: new Vector3() },
        uViewToHole: { value: new Matrix3() },
        uTanHalfFov: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uNoise: { value: noise.target.texture },
        uNoiseSize: { value: new Vector2(noise.target.width, noise.target.height) },
        uPixelAngle: { value: 0.001 },
        uDisc: { value: new Vector2(DISC_INNER, DISC_OUTER) },
        uBound: { value: BOUND },
        uInnerTemperature: { value: num(TWEAKS, 'temperature') },
        uBrightness: { value: num(TWEAKS, 'brightness') },
        uBeaming: { value: num(TWEAKS, 'beaming') },
        uFade: { value: 1 },
      },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    const scene = new Scene()
    const mesh = new Mesh(FULLSCREEN_TRIANGLE, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { target, material, scene, camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1) }
  }, [noise, quality])

  useEffect(
    () => () => {
      parts.target.dispose()
      parts.material.dispose()
    },
    [parts],
  )

  // Its program is compiled with the level's, not in the frame it first appears.
  useLayoutEffect(() => {
    level.extras.add(parts.scene)
    return () => {
      level.extras.delete(parts.scene)
    }
  }, [level, parts])

  // Off stage, nothing bends.
  useEffect(
    () => () => {
      lens.active = false
      lens.trace = null
    },
    [],
  )

  const apply = useMemo(
    () => (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      const u = parts.material.uniforms
      if (key === 'brightness') u.uBrightness!.value = value
      if (key === 'temperature') u.uInnerTemperature!.value = value
      if (key === 'beaming') u.uBeaming!.value = value
    },
    [parts],
  )
  useTweaks('Black hole', TWEAKS, apply)

  useFrame((state) => {
    const group = root.current
    if (!group) return
    group.updateWorldMatrix(true, false)
    const cam = state.camera as PerspectiveCamera
    const u = parts.material.uniforms

    // The camera and its view, in the hole's frame and radii.
    inverse.copy(group.matrixWorld).invert()
    const local = (u.uCamera!.value as Vector3).copy(cam.position).applyMatrix4(inverse).divideScalar(hole.radius)
    rotationOf(group.matrixWorld, holeTurn)
    rotationOf(cam.matrixWorld, viewTurn)
    lens.viewToHole.copy(holeTurn).transpose().multiply(viewTurn)
    lens.holeToView.copy(lens.viewToHole).transpose()
    ;(u.uViewToHole!.value as Matrix3).copy(lens.viewToHole)
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360)
    lens.tanHalfFov.set(tanHalf * cam.aspect, tanHalf)
    ;(u.uTanHalfFov!.value as Vector2).copy(lens.tanHalfFov)
    lens.camera.copy(local)

    // How far the hole bends what is on screen: weighed at the ray nearest to it.
    const distance = Math.max(local.length(), 1.01)
    towards.copy(local).multiplyScalar(-1 / distance).applyMatrix3(lens.holeToView)
    const ndcX = towards.z < 0 ? towards.x / -towards.z / lens.tanHalfFov.x : Math.sign(towards.x) * 4
    const ndcY = towards.z < 0 ? towards.y / -towards.z / lens.tanHalfFov.y : Math.sign(towards.y) * 4
    nearest
      .set(Math.min(1, Math.max(-1, ndcX)) * lens.tanHalfFov.x, Math.min(1, Math.max(-1, ndcY)) * lens.tanHalfFov.y, -1)
      .normalize()
    const cosine = Math.min(1, Math.max(-1, nearest.dot(towards)))
    const impact = distance * Math.sqrt(1 - cosine * cosine)
    const pixelsPerRadian = (state.size.height * state.viewport.dpr) / (2 * tanHalf)
    const bend = (2 / Math.max(impact, 2.6)) * ((1 + cosine) / 2) * pixelsPerRadian
    const fade = level.fade.current
    lens.active = shown(group) && fade > 0 && bend > VISIBLE_BEND && noise.job.ready
    lens.strength = fade
    if (!lens.active) {
      lens.trace = null
      return
    }

    // Trace only where the traced sphere lands on screen.
    const width = Math.max(1, Math.round(state.size.width * TRACE_SCALE[quality]))
    const height = Math.max(1, Math.round(state.size.height * TRACE_SCALE[quality]))
    const { target } = parts
    if (target.width !== width || target.height !== height) target.setSize(width, height)
    ;(u.uResolution!.value as Vector2).set(width, height)
    u.uPixelAngle!.value = (2 * tanHalf) / height
    u.uTime!.value = worldClock.time
    u.uFade!.value = fade
    let x0 = 0
    let y0 = 0
    let x1 = width
    let y1 = height
    if (distance > BOUND * 1.05 && towards.z < 0) {
      const spread = Math.tan(Math.asin(BOUND / distance)) / -towards.z
      x0 = Math.floor(((ndcX - spread / lens.tanHalfFov.x) * 0.5 + 0.5) * width) - 2
      x1 = Math.ceil(((ndcX + spread / lens.tanHalfFov.x) * 0.5 + 0.5) * width) + 2
      y0 = Math.floor(((ndcY - spread / lens.tanHalfFov.y) * 0.5 + 0.5) * height) - 2
      y1 = Math.ceil(((ndcY + spread / lens.tanHalfFov.y) * 0.5 + 0.5) * height) + 2
      x0 = Math.max(0, x0)
      y0 = Math.max(0, y0)
      x1 = Math.min(width, x1)
      y1 = Math.min(height, y1)
    }
    const previous = gl.getRenderTarget()
    gl.getClearColor(clearColour)
    const alpha = gl.getClearAlpha()
    target.scissorTest = false
    gl.setRenderTarget(target)
    gl.setClearColor(0x000000, 0)
    // The post pipeline turns the renderer's automatic clear off.
    gl.clear(true, false, false)
    if (x1 > x0 && y1 > y0 && (distance <= BOUND * 1.05 || towards.z < 0)) {
      target.scissor.set(x0, y0, x1 - x0, y1 - y0)
      target.scissorTest = true
      gl.setRenderTarget(target)
      gl.render(parts.scene, parts.camera)
      target.scissorTest = false
    }
    gl.setRenderTarget(previous)
    gl.setClearColor(clearColour, alpha)
    lens.trace = target.texture
  })

  return (
    <group
      ref={root}
      position={hole.position}
      quaternion={[hole.orientation[0], hole.orientation[1], hole.orientation[2], hole.orientation[3]]}
    />
  )
}
