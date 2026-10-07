/**
 * A buffer for soft, diffuse light (a galaxy's glow, the universe's gas and nebulae), drawn at
 * a share of the screen's size and then laid over the scene. A diffuse glow needs no retina
 * resolution, and blending tens of thousands of sprites is what a weak GPU pays for.
 *
 * Its own little scene is carried by the level's transform. Its alpha is coverage by dust,
 * which dims whatever lies behind; the full-screen triangle that lays it over the scene sits
 * at the far plane, behind everything that writes depth and over the sky.
 *
 * Close up, a glow covers the screen and can cost more than a frame allows. The buffer's
 * resolution then steps down (to half at most) until frames are on time, and back up when
 * there is room: the glow is soft enough that the change never shows. Steps are coarse and
 * slow, so the buffer is rarely reallocated and the resolution never oscillates.
 */
import {
  Color,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NormalBlending,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Matrix4,
  type WebGLRenderer,
} from 'three'
import type { QualityTier } from '../../core/quality.ts'
import compositeFrag from '../../shaders/galaxy/composite.frag'
import compositeVert from '../../shaders/galaxy/composite.vert'
import { FULLSCREEN_TRIANGLE } from './gpu.ts'

/** The buffer's share of the screen's size in CSS pixels, by tier. */
const BUFFER_SCALE: Record<QualityTier, number> = { high: 0.6, medium: 0.48, low: 0.34 }

const ADAPT_STEP = 0.1
const ADAPT_MIN = 0.5
const ADAPT_SLOW = 1 / 52
const ADAPT_FAST = 1 / 58
const ADAPT_HOLD = 0.8

const clearColour = new Color()

export class SoftBuffer {
  readonly target: WebGLRenderTarget
  /** The buffer's own scene; add what it draws to `holder`. */
  readonly scene = new Scene()
  readonly holder = new Group()
  /** Lays the buffer over the scene: add it to the level's group. */
  readonly composite: Mesh
  private readonly material: ShaderMaterial
  private readonly adapt = { share: 1, frame: 1 / 60, hold: 0 }
  /** The buffer's size this frame, device pixels. */
  width = 1
  height = 1

  constructor(name: string, renderOrder: number) {
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    })
    this.holder.matrixAutoUpdate = false
    this.scene.add(this.holder)
    this.material = new ShaderMaterial({
      name: `${name}-composite`,
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      uniforms: { uLight: { value: this.target.texture }, uResolution: { value: new Vector2(1, 1) } },
      blending: NormalBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthWrite: false,
    })
    this.composite = new Mesh(FULLSCREEN_TRIANGLE, this.material)
    this.composite.frustumCulled = false
    this.composite.renderOrder = renderOrder
  }

  /**
   * Size the buffer for this frame from the screen (CSS pixels and pixel ratio), the frame's
   * duration and the tier, following the frame rate while the glow is on screen.
   */
  resize(width: number, height: number, dpr: number, delta: number, quality: QualityTier) {
    const a = this.adapt
    a.frame += (Math.min(delta, 0.1) - a.frame) * 0.08
    a.hold = Math.max(0, a.hold - delta)
    if (a.hold === 0 && a.frame > ADAPT_SLOW && a.share > ADAPT_MIN) {
      a.share = Math.max(ADAPT_MIN, a.share - ADAPT_STEP)
      a.hold = ADAPT_HOLD
    } else if (a.hold === 0 && a.frame < ADAPT_FAST && a.share < 1) {
      a.share = Math.min(1, a.share + ADAPT_STEP)
      a.hold = ADAPT_HOLD * 2
    }
    const share = BUFFER_SCALE[quality] * a.share
    this.width = Math.max(1, Math.round(width * share))
    this.height = Math.max(1, Math.round(height * share))
    if (this.target.width !== this.width || this.target.height !== this.height) this.target.setSize(this.width, this.height)
    ;(this.material.uniforms.uResolution!.value as Vector2).set(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)))
  }

  /** Buffer pixels per unit of size at unit distance, for a camera's vertical field of view. */
  pixelsPerUnit(fov: number): number {
    return this.height / (2 * Math.tan((fov * Math.PI) / 360))
  }

  /** Draw the buffer's scene, carried by `matrixWorld`. */
  render(gl: WebGLRenderer, camera: Camera, matrixWorld: Matrix4) {
    this.holder.matrix.copy(matrixWorld)
    this.holder.matrixWorldNeedsUpdate = true
    const previous = gl.getRenderTarget()
    gl.getClearColor(clearColour)
    const alpha = gl.getClearAlpha()
    gl.setRenderTarget(this.target)
    gl.setClearColor(0x000000, 0)
    // The post pipeline turns the renderer's automatic clear off.
    gl.clear(true, false, false)
    gl.render(this.scene, camera)
    gl.setRenderTarget(previous)
    gl.setClearColor(clearColour, alpha)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
  }
}
