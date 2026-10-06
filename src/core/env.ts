/** Read-once facts about how the page was opened, and live visitor preferences. */
import { parseTier, type QualityTier } from './quality.ts'

const params = new URLSearchParams(window.location.search)

/** `?debug` mounts the tuning panel and the frame-rate readout. */
export const DEBUG = params.has('debug')

/** `?shot=<name>` marks a run by the screenshot script. */
export const SHOT = params.get('shot')

/** `?quality=low|medium|high` pins the quality tier and disables the governor. */
export const PINNED_QUALITY: QualityTier | null = parseTier(params.get('quality'))

/** `?tone=agx|aces|neutral` overrides the tone mapper, for comparing grades. */
export const TONE = params.get('tone')

/** `?view=<name>` opens on one of the current level's named framings. */
export const VIEW = params.get('view')

/** `?level=sky|planet` picks the scene to show (until levels connect in Phase 2). */
export const LEVEL = params.get('level')

/** `?planet=<kind>` picks the planet preset shown at the planet level. */
export const PLANET = params.get('planet')

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery.matches
}
