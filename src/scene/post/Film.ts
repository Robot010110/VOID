import { createEffectComponent } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { Color, Uniform, Vector3, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { prefersReducedMotion } from '../../core/env.ts'
import { useVoid } from '../../core/store.ts'
import fragmentShader from '../../shaders/post/film.frag'
import { motion } from '../stage.ts'

/** Grain frames per second: film cadence rather than the display's refresh rate. */
const GRAIN_RATE = 24
/** Strongest edge fringe, as a share of the distance from the centre at the corners. */
const MAX_ABERRATION = 0.006

/**
 * The last step of the grade: a gentle look on top of AgX, the Abyss black point, and grain.
 * Tone mappers crush near-black to pure black, so the floor is applied here, after tone
 * mapping, rather than as a clear colour. Grain is added in display space so it doubles as
 * dithering against banding.
 */
export class FilmEffect extends Effect {
  private elapsed = 0

  constructor() {
    super('FilmEffect', fragmentShader, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, Uniform>([
        ['uFloor', new Uniform(new Vector3())],
        ['uContrast', new Uniform(1.16)],
        ['uSaturation', new Uniform(1.12)],
        ['uGrain', new Uniform(0.02)],
        ['uSeed', new Uniform(0)],
        ['uAberration', new Uniform(0)],
      ]),
    })
    this.floor = '#03040b'
  }

  /** Strength of the mid-tone grain in display units (0 keeps only the dither). */
  get grain(): number {
    return this.uniforms.get('uGrain')!.value as number
  }

  set grain(value: number) {
    this.uniforms.get('uGrain')!.value = value
  }

  /** Power applied to display values: above 1 deepens the low mids. */
  get contrast(): number {
    return this.uniforms.get('uContrast')!.value as number
  }

  set contrast(value: number) {
    this.uniforms.get('uContrast')!.value = value
  }

  /** Saturation of the look, 1 leaves colour as tone mapped. */
  get saturation(): number {
    return this.uniforms.get('uSaturation')!.value as number
  }

  set saturation(value: number) {
    this.uniforms.get('uSaturation')!.value = value
  }

  /** The darkest colour the screen can show, as an sRGB hex string. */
  set floor(hex: string) {
    const linear = new Color(hex)
    ;(this.uniforms.get('uFloor')!.value as Vector3).set(linear.r, linear.g, linear.b)
  }

  override update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, deltaTime = 0): void {
    this.elapsed += deltaTime
    this.uniforms.get('uSeed')!.value = Math.floor(this.elapsed * GRAIN_RATE) % 1024
    // Only while falling between levels, and only as fast as the fall.
    const falling = useVoid.getState().transition.phase !== 'idle' && !prefersReducedMotion()
    const target = falling ? MAX_ABERRATION * Math.min(1, Math.max(0, (motion.speed - 0.3) / 2.2)) : 0
    const uniform = this.uniforms.get('uAberration')!
    const value = uniform.value as number
    const next = value + (target - value) * (1 - Math.exp(-deltaTime * 8))
    uniform.value = next < 1e-5 ? 0 : next
  }
}

export interface FilmProps {
  grain?: number
  contrast?: number
  saturation?: number
  floor?: string
}

export const Film = createEffectComponent<typeof FilmEffect, FilmProps>(FilmEffect)
