/**
 * Small GPU helpers shared by every procedural object: bake passes into 2D and cube render
 * targets, cached sphere geometry by level of detail, and linear colours from sRGB hex.
 */
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
  type ColorSpace,
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
  renderWith(gl, material, () => {
    material.uniforms.uSize!.value = target.width
    for (let face = 0; face < 6; face++) {
      material.uniforms.uFace!.value = face
      gl.setRenderTarget(target, face)
      gl.render(bakeScene, bakeCamera)
    }
  })
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
