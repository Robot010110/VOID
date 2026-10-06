import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect, type VignetteEffect } from 'postprocessing'
import { useCallback, useRef } from 'react'
import { HalfFloatType } from 'three'
import { TONE } from '../../core/env.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import { Film, type FilmEffect } from './Film.ts'

const TONE_MODES: Record<string, ToneMappingMode> = {
  agx: ToneMappingMode.AGX,
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
}

const TWEAKS: TweakSchema = {
  bloomIntensity: { value: 0.85, min: 0, max: 3, step: 0.01 },
  vignetteDarkness: { value: 0.42, min: 0, max: 1, step: 0.01 },
  vignetteOffset: { value: 0.36, min: 0, max: 1, step: 0.01 },
  contrast: { value: 1.16, min: 0.8, max: 1.6, step: 0.01 },
  saturation: { value: 1.12, min: 0, max: 2, step: 0.01 },
  grain: { value: 0.022, min: 0, max: 0.08, step: 0.001 },
}

/**
 * HDR scene → SMAA → bloom → AgX tone mapping → vignette → film grade (look, floor, grain).
 * Everything merges into one full-screen pass (plus SMAA's and bloom's own small passes).
 * SMAA goes first because it re-samples the raw input buffer at edges; anything merged
 * ahead of it in the same pass would be discarded there.
 */
export function PostPipeline() {
  const quality = useVoid((s) => s.quality)
  const bloom = useRef<BloomEffect>(null)
  const vignette = useRef<VignetteEffect>(null)
  const film = useRef<FilmEffect>(null)

  const apply = useCallback(
    (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      if (key === 'bloomIntensity' && bloom.current) bloom.current.intensity = value
      if (key === 'vignetteDarkness' && vignette.current) vignette.current.darkness = value
      if (key === 'vignetteOffset' && vignette.current) vignette.current.offset = value
      if (key === 'contrast' && film.current) film.current.contrast = value
      if (key === 'saturation' && film.current) film.current.saturation = value
      if (key === 'grain' && film.current) film.current.grain = value * QUALITY[quality].grain
    },
    [quality],
  )
  useTweaks('Post', TWEAKS, apply)

  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      <SMAA />
      <Bloom
        ref={bloom}
        mipmapBlur
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        radius={0.72}
        levels={8}
        intensity={num(TWEAKS, 'bloomIntensity')}
      />
      <ToneMapping mode={TONE_MODES[TONE ?? 'agx'] ?? ToneMappingMode.AGX} />
      <Vignette
        ref={vignette}
        offset={num(TWEAKS, 'vignetteOffset')}
        darkness={num(TWEAKS, 'vignetteDarkness')}
      />
      <Film
        ref={film}
        contrast={num(TWEAKS, 'contrast')}
        saturation={num(TWEAKS, 'saturation')}
        grain={num(TWEAKS, 'grain') * QUALITY[quality].grain}
      />
    </EffectComposer>
  )
}
