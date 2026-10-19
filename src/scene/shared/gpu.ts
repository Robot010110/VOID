/**
 * Small GPU helpers shared by every procedural object: bake passes into 2D and cube render
 * targets, cached sphere geometry by level of detail, and linear colours from sRGB hex.
 */
import { compileSlotFree, compiling } from './compile.ts'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  HalfFloatType,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
  type Camera,
  type ColorSpace,
  type Material,
  type Object3D,
  type PixelFormat,
  type ShaderMaterial,
  type TextureDataType,
  type WebGLRenderer,
} from 'three'

export const FULLSCREEN_TRIANGLE = new BufferGeometry().setAttribute(
  'position',
  new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
)

const bakeScene = new Scene()
const bakeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
const bakeMesh = new Mesh(FULLSCREEN_TRIANGLE)
bakeMesh.frustumCulled = false
bakeScene.add(bakeMesh)

function renderWith(gl: WebGLRenderer, material: ShaderMaterial, draw: () => void) {
  const previous = gl.getRenderTarget()
  const previousFace = gl.getActiveCubeFace()
  const previousLevel = gl.getActiveMipmapLevel()
  bakeMesh.material = material
  draw()
  gl.setRenderTarget(previous, previousFace, previousLevel)
}

/** Render a full-screen pass into a 2D target. */
export function bakeTexture(gl: WebGLRenderer, target: WebGLRenderTarget, material: ShaderMaterial) {
  renderWith(gl, material, () => {
    gl.setRenderTarget(target)
    gl.render(bakeScene, bakeCamera)
  })
}

/** Render a pass into all six faces of a cube target. The material reads uFace and uSize. */
export function bakeCube(gl: WebGLRenderer, target: WebGLCubeRenderTarget, material: ShaderMaterial) {
  for (let face = 0; face < 6; face++) {
    bakeCubeTile(gl, target, material, face, 0, 0, target.width, target.width, face === 5)
  }
}

/** Render one rectangle of a 2D target; mipmaps are built only with the last one. */
export function bakeTile(
  gl: WebGLRenderer,
  target: WebGLRenderTarget,
  material: ShaderMaterial,
  x: number,
  y: number,
  width: number,
  height: number,
  last: boolean,
) {
  const mipmaps = target.texture.minFilter !== LinearFilter
  renderWith(gl, material, () => {
    const whole = x === 0 && y === 0 && width === target.width && height === target.height
    target.scissor.set(x, y, width, height)
    target.scissorTest = !whole
    target.texture.generateMipmaps = mipmaps && last
    gl.setRenderTarget(target)
    gl.render(bakeScene, bakeCamera)
    target.scissorTest = false
    target.texture.generateMipmaps = mipmaps
  })
}

/**
 * Render one rectangle of one cube face. three regenerates a target's whole mip chain after
 * every render into it, so mipmaps are only built on the pass that completes the map.
 */
export function bakeCubeTile(
  gl: WebGLRenderer,
  target: WebGLCubeRenderTarget,
  material: ShaderMaterial,
  face: number,
  x: number,
  y: number,
  width: number,
  height: number,
  last: boolean,
) {
  const mipmaps = target.texture.minFilter !== LinearFilter
  renderWith(gl, material, () => {
    material.uniforms.uSize!.value = target.width
    material.uniforms.uFace!.value = face
    const whole = x === 0 && y === 0 && width === target.width && height === target.width
    target.scissor.set(x, y, width, height)
    target.scissorTest = !whole
    target.texture.generateMipmaps = mipmaps && last
    gl.setRenderTarget(target, face)
    gl.render(bakeScene, bakeCamera)
    target.scissorTest = false
    target.texture.generateMipmaps = mipmaps
  })
}

let warmTarget: WebGLRenderTarget | null = null

interface ProgramState {
  currentProgram?: { isReady(): boolean }
}

const started = new WeakSet<Material>()

/**
 * Whether a bake material's program is ready to use. The first call starts compiling it in the
 * background (with KHR_parallel_shader_compile), so the first tile baked with it does not wait
 * on the driver, which for a large noise shader can take seconds. Without the extension it
 * compiles in the first tile, as before.
 */
export function bakeProgramReady(gl: WebGLRenderer, material: ShaderMaterial): boolean {
  if (!gl.extensions.has('KHR_parallel_shader_compile')) return true
  if (!started.has(material)) {
    // Wait for room: a driver handed many programs at once stalls every frame until all are done.
    if (!compileSlotFree(gl)) return false
    started.add(material)
    // Bake targets are render targets: programs keyed for one compile for all of them.
    warmTarget ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true })
    const previous = gl.getRenderTarget()
    gl.setRenderTarget(warmTarget)
    bakeMesh.material = material
    gl.compile(bakeScene, bakeCamera)
    gl.setRenderTarget(previous)
    compiling(gl, material)
  }
  const program = (gl.properties.get(material) as ProgramState).currentProgram
  return !program || program.isReady()
}

/**
 * Draw an object once into a one-pixel target, so its buffers are uploaded (and its program
 * linked) while it is still hidden, not in the frame it first appears in.
 */
export function warmUp(gl: WebGLRenderer, object: Object3D, camera: Camera) {
  warmTarget ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true })
  const previous = gl.getRenderTarget()
  const visible = object.visible
  object.visible = true
  gl.setRenderTarget(warmTarget)
  gl.render(object, camera)
  gl.setRenderTarget(previous)
  object.visible = visible
}

export interface TargetOptions {
  type?: TextureDataType
  format?: PixelFormat
  colorSpace?: ColorSpace
  mipmaps?: boolean
}

export function createCubeTarget(size: number, options: TargetOptions = {}): WebGLCubeRenderTarget {
  const mipmaps = options.mipmaps ?? true
  const target = new WebGLCubeRenderTarget(size, {
    type: options.type ?? UnsignedByteType,
    format: options.format ?? RGBAFormat,
    colorSpace: options.colorSpace,
    generateMipmaps: mipmaps,
    minFilter: mipmaps ? LinearMipmapLinearFilter : LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  })
  target.texture.anisotropy = 4
  return target
}

export function createTarget(width: number, height: number, options: TargetOptions = {}): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, {
    type: options.type ?? HalfFloatType,
    format: options.format ?? RGBAFormat,
    colorSpace: options.colorSpace,
    generateMipmaps: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
  })
}

/** Linear-light colour from an sRGB hex string. */
export function linear(hex: string): Color {
  return new Color(hex)
}

const spheres = new Map<number, BufferGeometry>()

/** A shared unit icosphere. Never disposed: a handful are reused by every body. */
export function icosphere(detail: number): BufferGeometry {
  let geometry = spheres.get(detail)
  if (!geometry) {
    geometry = new IcosahedronGeometry(1, detail)
    spheres.set(detail, geometry)
  }
  return geometry
}

/**
 * Detail for a sphere whose silhouette is `pixelRadius` pixels across, chosen so the polygon
 * never strays more than about a quarter of a pixel from the true circle.
 */
export function sphereDetail(pixelRadius: number): number {
  if (pixelRadius > 800) return 40
  if (pixelRadius > 250) return 24
  if (pixelRadius > 80) return 12
  return 6
}
