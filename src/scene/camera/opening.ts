import { useLayoutEffect } from 'react'
import { Vector3 } from 'three'
import { VIEW } from '../../core/env.ts'
import { placeRig, rig } from './rig.ts'
import type { Limits, OrbitView } from './views.ts'

/**
 * Frame the camera when a level opens as the first thing seen (`?view=` picks a named
 * framing). A level arriving mid-flight is framed by the flight instead.
 */
export function useOpeningView(
  views: Record<string, OrbitView>,
  distance: number,
  limits: Limits,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    if (!enabled) return
    rig.limits.min = limits.min
    rig.limits.max = limits.max
    const view = views[VIEW ?? 'home'] ?? views.home ?? { azimuth: 0, polar: Math.PI / 2 }
    placeRig(view, distance, view.center ? new Vector3(...view.center) : undefined)
  }, [views, distance, limits, enabled])
}
