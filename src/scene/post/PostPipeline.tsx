import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode, type BloomEffect, type VignetteEffect } from 'postprocessing'
import { useFrame, useThree } from '@react-three/fiber'
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
 * Bloom's strength per level, as a share of the tuned intensity. A galaxy is a field of
 * extended light that can fill the screen, and blooms only at its core; stars and worlds are
 * small bright sources that bloom fully.
 */
const LEVEL_BLOOM: Record<string, number> = { universe: 0.6, galaxy: 0.45, system: 1, planet: 1 }

/** At or above this pixel ratio, edges are fine enough that SMAA costs more than it gives. */
const SMAA_MAX_DPR = 1.75

/**
 * HDR scene → SMAA → bloom → AgX tone mapping → vignette → film grade (look, floor, grain).
 * Everything merges into one full-screen pass (plus SMAA's and bloom's own small passes).
 * SMAA goes first because it re-samples the raw input buffer at edges; anything merged
 * ahead of it in the same pass would be discarded there.
 */
export function PostPipeline() {
  const quality = useVoid((s) => s.quality)
  const antialias = useThree((s) => s.viewport.dpr) < SMAA_MAX_DPR
  const bloom = useRef<BloomEffect>(null)
  const vignette = useRef<VignetteEffect>(null)
  const film = useRef<FilmEffect>(null)
  const bloomTuned = useRef(num(TWEAKS, 'bloomIntensity'))
  const bloomLevel = useRef(LEVEL_BLOOM[useVoid.getState().level] ?? 1)

  // Bloom follows the level, easing over a couple of seconds through a transition.
  useFrame((_, delta) => {
    const effect = bloom.current
    if (!effect) return
    const target = LEVEL_BLOOM[useVoid.getState().level] ?? 1
    bloomLevel.current += (target - bloomLevel.current) * (1 - Math.exp(-Math.min(delta, 0.1) / 0.7))
    effect.intensity = bloomTuned.current * bloomLevel.current
  })

  const apply = useCallback(
    (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      if (key === 'bloomIntensity') bloomTuned.current = value
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
      {antialias ? <SMAA /> : <></>}
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
