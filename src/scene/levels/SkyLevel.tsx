import { HOME_BAND } from '../../core/sky.ts'
import { CameraRig } from '../camera/CameraRig.tsx'
import { lookingAlong, type OrbitView } from '../camera/views.ts'
import { Starfield } from '../objects/Starfield.tsx'

const VIEWS: Record<string, OrbitView> = {
  home: { azimuth: 0, polar: Math.PI / 2 + 0.04 },
  core: lookingAlong(HOME_BAND.core),
  pole: lookingAlong(HOME_BAND.pole),
}

/** The night sky alone, as seen from inside the home galaxy (`?level=sky`). */
export function SkyLevel() {
  return (
    <>
      <CameraRig views={VIEWS} distance={6} minDistance={6} maxDistance={6} />
      <Starfield />
    </>
  )
}
