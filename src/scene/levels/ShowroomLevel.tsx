import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, Vector3 } from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { PLANET_KINDS, PRESETS, type PlanetKind } from '../../core/planets.ts'
import { useVoid } from '../../core/store.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import { useOpeningView } from '../camera/opening.ts'
import { planetLimits, planetViews } from '../camera/views.ts'
import { DistantSun } from '../objects/DistantSun.tsx'
import { Flare, type FlareSource } from '../objects/Flare.tsx'
import { GasGiant } from '../objects/GasGiant.tsx'
import { hiddenBy, starlight } from '../objects/light.ts'
import { Planet } from '../objects/Planet.tsx'
import { levelRuntime } from '../stage.ts'

/** The star lights the scene from the upper left, slightly behind the opening view. */
const SUN_DIRECTION = new Vector3(-0.62, 0.26, -0.74).normalize()
const SUN_TEMPERATURE = 5650
const SUN_RADIUS = 0.0105
const ORIGIN = new Vector3()

/**
 * The planet showroom (`?planet=<kind>`): one preset in front of a fixed sun, every
 * parameter in the debug panel, and the preset itself switchable there. This is where the
 * planet types were tuned; the universe varies them by seed.
 */
export function ShowroomLevel() {
  const kind = useVoid((s) => s.planet)
  const path = useVoid((s) => s.path)
  const preset = PRESETS[kind]
  const sun = useMemo(() => starlight(SUN_TEMPERATURE, 1, SUN_DIRECTION.clone()), [])
  const colour = useMemo(() => new Color(...blackbody(SUN_TEMPERATURE)), [])
  const portrait = useThree((s) => s.size.width < s.size.height * 0.85)
  const views = useMemo(
    () => planetViews([SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z], preset.framing, portrait),
    [preset.framing, portrait],
  )
  const limits = useMemo(() => planetLimits(preset), [preset])
  useOpeningView(views, preset.framing, limits, true)

  useEffect(() => {
    levelRuntime(path).limits = limits
  }, [path, limits])

  const schema = useMemo<TweakSchema>(() => ({ preset: { value: kind, options: PLANET_KINDS } }), [kind])
  const apply = useMemo(
    () => (key: string, value: TweakValue) => {
      if (key === 'preset' && typeof value === 'string' && value !== useVoid.getState().planet) {
        useVoid.getState().setPlanet(value as PlanetKind)
      }
    },
    [],
  )
  useTweaks('Planet', schema, apply)

  const flare = useMemo<FlareSource>(
    () => ({
      infinite: true,
      update(eye, out) {
        out.copy(SUN_DIRECTION)
        return 1 - hiddenBy(eye, SUN_DIRECTION, Infinity, SUN_RADIUS, ORIGIN, 1)
      },
    }),
    [],
  )

  return (
    <>
      <DistantSun direction={sun.direction} temperature={SUN_TEMPERATURE} angularRadius={SUN_RADIUS} />
      {preset.gas ? (
        <GasGiant key={`body-${kind}`} preset={preset} sun={sun} tweakable />
      ) : (
        <Planet key={`body-${kind}`} preset={preset} sun={sun} tweakable />
      )}
      <Flare source={flare} color={colour} strength={0.8} />
    </>
  )
}
