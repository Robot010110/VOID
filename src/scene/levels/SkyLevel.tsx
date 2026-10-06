import { useEffect } from 'react'
import { HOME_BAND } from '../../core/sky.ts'
import { useVoid } from '../../core/store.ts'
import { useOpeningView } from '../camera/opening.ts'
import { lookingAlong, type Limits, type OrbitView } from '../camera/views.ts'
import { levelRuntime } from '../stage.ts'

const VIEWS: Record<string, OrbitView> = {
  home: { azimuth: 0, polar: Math.PI / 2 + 0.04 },
  core: lookingAlong(HOME_BAND.core),
  pole: lookingAlong(HOME_BAND.pole),
}
const LIMITS: Limits = { min: 6, max: 6 }

/** The night sky alone, as seen from inside the home galaxy (`?level=sky`). */
export function SkyLevel() {
  const path = useVoid((s) => s.path)
  useOpeningView(VIEWS, 6, LIMITS, true)
  useEffect(() => {
    levelRuntime(path).limits = LIMITS
  }, [path])
  return null
}
