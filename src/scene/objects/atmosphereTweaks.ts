import { useCallback, useMemo, useRef } from 'react'
import { Color, Vector3 } from 'three'
import type { PlanetPreset } from '../../core/planets.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import type { AtmosphereModel } from './atmosphere.ts'

const EMPTY: TweakSchema = {}

/** Debug controls for an atmosphere: every medium parameter, re-baking the table on change. */
export function useAtmosphereTweaks(
  preset: PlanetPreset,
  atmosphere: AtmosphereModel,
  rebake: () => void,
  enabled: boolean,
) {
  const params = preset.atmosphere
  const schema = useMemo<TweakSchema>(
    () =>
      enabled && params
        ? {
            rayleighR: { value: params.rayleigh[0], min: 0, max: 60, step: 0.1 },
            rayleighG: { value: params.rayleigh[1], min: 0, max: 60, step: 0.1 },
            rayleighB: { value: params.rayleigh[2], min: 0, max: 60, step: 0.1 },
            rayleighHeight: { value: params.rayleighHeight, min: 0.001, max: 0.04, step: 0.0005 },
            mie: { value: params.mie, min: 0, max: 40, step: 0.1 },
            mieHeight: { value: params.mieHeight, min: 0.0005, max: 0.03, step: 0.0005 },
            mieG: { value: params.mieG, min: 0, max: 0.95, step: 0.01 },
            absorptionR: { value: params.absorption[0], min: 0, max: 8, step: 0.05 },
            absorptionG: { value: params.absorption[1], min: 0, max: 8, step: 0.05 },
            absorptionB: { value: params.absorption[2], min: 0, max: 8, step: 0.05 },
            multiScatter: { value: params.multiScatter, min: 0, max: 2, step: 0.01 },
            airglow: { value: params.airglow, color: true },
          }
        : EMPTY,
    [params, enabled],
  )
  const timer = useRef(0)
  const apply = useCallback(
    (key: string, value: TweakValue) => {
      const u = atmosphere.uniforms
      if (typeof value === 'number') {
        if (key.startsWith('rayleigh') && key.length === 9) {
          const axis = key.endsWith('R') ? 'x' : key.endsWith('G') ? 'y' : 'z'
          ;(u.uRayleigh!.value as Vector3)[axis] = value
        } else if (key.startsWith('absorption')) {
          const axis = key.endsWith('R') ? 'x' : key.endsWith('G') ? 'y' : 'z'
          ;(u.uAbsorption!.value as Vector3)[axis] = value
        } else {
          const uniform = u[`u${key.charAt(0).toUpperCase()}${key.slice(1)}`]
          if (uniform) uniform.value = value
        }
      } else if (key === 'airglow' && params && typeof value === 'string') {
        ;(u.uAirglow!.value as Color).set(value).multiplyScalar(params.airglowStrength)
      }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(rebake, 60)
    },
    [atmosphere, params, rebake],
  )
  useTweaks(`${preset.label}: atmosphere`, schema, apply)
}
