import { BlendFunction, Effect, EffectAttribute, EffectPass } from 'postprocessing'
import {
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  RedFormat,
  Uniform,
  Vector2,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { deflectionTable } from '../../core/lensing.ts'
import fragmentShader from '../../shaders/post/lensing.frag'
import { lens } from '../stage.ts'

/** The exact deflection, sampled for the GPU, as a filterable half-float texture. */
function deflectionTexture(): { texture: DataTexture; range: Vector2 } {
  const table = deflectionTable()
  const data = new Uint16Array(table.values.length)
  for (let i = 0; i < data.length; i++) data[i] = DataUtils.toHalfFloat(table.values[i]!)
  const texture = new DataTexture(data, data.length, 1, RedFormat, HalfFloatType)
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return { texture, range: new Vector2(table.from, table.to) }
}

/** An empty trace, for frames before the hole has drawn one. */
const NOTHING = new DataTexture(new Uint8Array(4), 1, 1)
NOTHING.needsUpdate = true

/**
 * The black hole's gravitational lensing, as a post effect: the scene behind the hole bent
 * around it, with the traced hole laid on top. It reads the picture at other places than its
 * own, so it is a convolution and runs in a pass of its own, ahead of bloom, which then sees
 * the disc's light. The hole writes what it needs into `lens` every frame (see BlackHole.tsx).
 */
export class LensingEffect extends Effect {
  constructor() {
    const { texture, range } = deflectionTexture()
    super('LensingEffect', fragmentShader, {
      blendFunction: BlendFunction.SET,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uTrace', new Uniform<Texture>(NOTHING)],
        ['uDeflection', new Uniform(texture)],
        ['uDeflectionRange', new Uniform(range)],
        ['uCamera', new Uniform(new Vector3(0, 0, 100))],
        ['uViewToHole', new Uniform(new Matrix3())],
        ['uHoleToView', new Uniform(new Matrix3())],
        ['uTanHalfFov', new Uniform(new Vector2(1, 1))],
        ['uStrength', new Uniform(0)],
      ]),
    })
  }

  override update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, _deltaTime?: number): void {
    const u = this.uniforms
    u.get('uTrace')!.value = lens.trace ?? NOTHING
    ;(u.get('uCamera')!.value as Vector3).copy(lens.camera)
    ;(u.get('uViewToHole')!.value as Matrix3).copy(lens.viewToHole)
    ;(u.get('uHoleToView')!.value as Matrix3).copy(lens.holeToView)
    ;(u.get('uTanHalfFov')!.value as Vector2).copy(lens.tanHalfFov)
    u.get('uStrength')!.value = lens.strength
  }
}

/** The lensing effect in a pass of its own, switched off whenever no hole is in view. */
export function createLensingPass(camera: Camera): EffectPass {
  const pass = new EffectPass(camera, new LensingEffect())
  pass.enabled = false
  return pass
}
