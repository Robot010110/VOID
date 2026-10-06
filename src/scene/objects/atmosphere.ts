/**
 * One planet's atmosphere: its medium parameters as shared uniforms, and the precomputed
 * sunlight transmittance table. The surface, clouds, the scattering shell and gas giants all
 * read the same uniform objects, so a parameter change reaches every layer at once.
 */
import {
  ClampToEdgeWrapping,
  Color,
  ShaderMaterial,
  Vector3,
  type IUniform,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import type { AtmosphereParams } from '../../core/planets.ts'
import lutFrag from '../../shaders/atmosphere/lut.frag'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import { bakeTexture, createTarget } from '../shared/gpu.ts'

/** Angular size of the sun as seen from its planets, used to soften every terminator. */
export const SUN_SIZE = 0.02

const LUT_WIDTH = 256
const LUT_HEIGHT = 64

export type AtmosphereUniforms = Record<string, IUniform>

export class AtmosphereModel {
  readonly uniforms: AtmosphereUniforms
  readonly lut: WebGLRenderTarget
  private readonly bakeMaterial: ShaderMaterial

  constructor(params: AtmosphereParams | undefined) {
    this.lut = createTarget(LUT_WIDTH, LUT_HEIGHT)
    this.lut.texture.wrapS = ClampToEdgeWrapping
    this.lut.texture.wrapT = ClampToEdgeWrapping
    this.uniforms = {
      uTransmittance: { value: this.lut.texture },
      uAtmBottom: { value: 1 },
      uAtmTop: { value: 1.05 },
      uRayleigh: { value: new Vector3() },
      uRayleighHeight: { value: 0.008 },
      uMie: { value: 0 },
      uMieHeight: { value: 0.003 },
      uMieG: { value: 0.76 },
      uAbsorption: { value: new Vector3() },
      uOzoneCenter: { value: 0.025 },
      uOzoneWidth: { value: 0.015 },
      uMultiScatter: { value: 0.3 },
      uAirglow: { value: new Color(0, 0, 0) },
      uSunSize: { value: SUN_SIZE },
    }
    this.bakeMaterial = new ShaderMaterial({
      name: 'atmosphere-lut',
      vertexShader: fullscreenVert,
      fragmentShader: lutFrag,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    })
    if (params) this.set(params)
  }

  /** Copy parameters into the shared uniforms. Call bake() afterwards. */
  set(params: AtmosphereParams) {
    const u = this.uniforms
    u.uAtmTop!.value = 1 + params.thickness
    ;(u.uRayleigh!.value as Vector3).set(...params.rayleigh)
    u.uRayleighHeight!.value = params.rayleighHeight
    u.uMie!.value = params.mie
    u.uMieHeight!.value = params.mieHeight
    u.uMieG!.value = params.mieG
    ;(u.uAbsorption!.value as Vector3).set(...params.absorption)
    u.uOzoneCenter!.value = params.ozoneCenter
    u.uOzoneWidth!.value = params.ozoneWidth
    u.uMultiScatter!.value = params.multiScatter
    ;(u.uAirglow!.value as Color).set(params.airglow).multiplyScalar(params.airglowStrength)
  }

  bake(gl: WebGLRenderer) {
    bakeTexture(gl, this.lut, this.bakeMaterial)
  }

  dispose() {
    this.lut.dispose()
    this.bakeMaterial.dispose()
  }
}
