import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Color, Vector3 } from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { PLANET_KINDS, PRESETS, type PlanetKind } from '../../core/planets.ts'
import { useVoid } from '../../core/store.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import { CameraRig } from '../camera/CameraRig.tsx'
import type { OrbitView } from '../camera/views.ts'
import type { Sunlight } from '../objects/body.ts'
import { DistantSun } from '../objects/DistantSun.tsx'
import { GasGiant } from '../objects/GasGiant.tsx'
import { Planet } from '../objects/Planet.tsx'
import { Starfield } from '../objects/Starfield.tsx'

/** The star lights the scene from the upper left, slightly behind the opening view. */
const SUN_DIRECTION = new Vector3(-0.62, 0.26, -0.74).normalize()
const SUN_TEMPERATURE = 5650

/**
 * Sunlight at the planet: blackbody colour scaled so a white surface facing the sun has a
 * radiance of about 0.95, comfortably under the bloom threshold. Only light sources
 * (the sun, glints, city lights, lava) rise above it.
 */
function sunlight(direction: Vector3, temperature: number): Sunlight {
  const [r, g, b] = blackbody(temperature)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const scale = (Math.PI * 0.95) / luminance
  return { direction: direction.clone(), irradiance: new Color(r * scale, g * scale, b * scale) }
}

/**
 * Named framings around the planet, relative to its sun. `home` is the opening shot: the
 * planet in front of its star, which sits just beyond the limb: beside it on a wide screen,
 * rising below it on a tall one, where the planet also stands a little further back.
 */
function planetViews(sun: Vector3, framing: number, portrait: boolean): Record<string, OrbitView> {
  const sunAzimuth = Math.atan2(sun.x, sun.z)
  const sunPolar = Math.acos(sun.y)
  const awayAzimuth = sunAzimuth + Math.PI
  const awayPolar = Math.PI - sunPolar
  const home = portrait
    ? { azimuth: awayAzimuth - 0.06, polar: awayPolar + 0.42, distance: framing * 1.25 }
    : { azimuth: awayAzimuth - 0.42, polar: awayPolar + 0.08, distance: framing }
  return {
    home,
    night: { azimuth: awayAzimuth - 0.85, polar: awayPolar - 0.12, distance: framing },
    terminator: { azimuth: sunAzimuth + Math.PI / 2, polar: 1.42, distance: framing },
    day: { azimuth: sunAzimuth + 0.5, polar: 1.2, distance: framing },
    pole: { azimuth: sunAzimuth + 1.1, polar: 0.4, distance: framing },
    close: { azimuth: sunAzimuth + Math.PI / 2 - 0.2, polar: 1.36, distance: 1.6 },
  }
}

/** One planet in front of its sun, with the night sky behind. */
export function PlanetLevel() {
  const kind = useVoid((s) => s.planet)
  const preset = PRESETS[kind]
  const sun = useMemo(() => sunlight(SUN_DIRECTION, SUN_TEMPERATURE), [])
  const portrait = useThree((s) => s.size.width < s.size.height * 0.85)
  const views = useMemo(
    () => planetViews(SUN_DIRECTION, preset.framing, portrait),
    [preset.framing, portrait],
  )

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

  return (
    <>
      <CameraRig
        key={`rig-${kind}`}
        views={views}
        distance={preset.framing}
        minDistance={1.32}
        maxDistance={Math.max(preset.framing * 3, 10)}
      />
      <Starfield brightness={0.75} band={0.4} />
      <DistantSun direction={sun.direction} temperature={SUN_TEMPERATURE} />
      {preset.gas ? (
        <GasGiant key={`body-${kind}`} preset={preset} sun={sun} tweakable />
      ) : (
        <Planet key={`body-${kind}`} preset={preset} sun={sun} tweakable />
      )}
    </>
  )
}
