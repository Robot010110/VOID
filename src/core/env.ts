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

/** `?level=sky` shows the Phase 0 night sky on its own. */
export const LEVEL = params.get('level')

/** `?planet=<kind>` opens the planet showroom on one preset. */
export const PLANET = params.get('planet')

/** `?world=<index>` opens close up on one world of the home system. */
export const WORLD = params.get('world')

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery.matches
}
