import { createEffectComponent } from '@react-three/postprocessing'
import { BlendFunction, Effect } from 'postprocessing'
import { Uniform } from 'three'
import fragmentShader from '../../shaders/post/spectrum.frag'
import { spectrum } from '../shared/spectrum.ts'

/**
 * The spectrum lens: re-colours the tone-mapped picture into heat (infrared) or cold radio
 * tones, as far as the view has turned into either. It merges into the same full-screen pass
 * as the rest of the grade, and in visible light it changes nothing.
 */
export class SpectrumLensEffect extends Effect {
  constructor() {
    super('SpectrumLensEffect', fragmentShader, {
      blendFunction: BlendFunction.SET,
      uniforms: new Map<string, Uniform>([
        ['uInfrared', new Uniform(0)],
        ['uRadio', new Uniform(0)],
      ]),
    })
  }

  override update(): void {
    this.uniforms.get('uInfrared')!.value = spectrum.infrared
    this.uniforms.get('uRadio')!.value = spectrum.radio
  }
}

export const SpectrumLens = createEffectComponent<typeof SpectrumLensEffect, object>(SpectrumLensEffect)
