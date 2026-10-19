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

/** `?galaxy=<index>` opens on one galaxy (0 is the home galaxy); `?hole` on the black hole. */
export const GALAXY = params.get('galaxy')
export const HOLE = params.has('hole')

/** `?system=<index>` opens on one star system of that galaxy (0 of the home galaxy is home). */
export const SYSTEM = params.get('system')

/** `?world=<index>` opens close up on one world of that system (the home system by default). */
export const WORLD = params.get('world')

/** `?anchor=<id>` opens close up on one of the handcrafted worlds (content/anchors.ts). */
export const ANCHOR = params.get('anchor')

/**
 * `?intro` plays the opening even on a screenshot run; `?intro=skip` opens without it, straight
 * into the universe (or wherever the link points).
 */
export const INTRO = params.get('intro')

/** `?spectrum=infrared|radio` opens seeing by heat or by radio; `?time=0|100|10000` at that pace. */
export const SPECTRUM = params.get('spectrum')
export const TIME = params.get('time')

/**
 * `?film` plays VOID's trailer: a motion piece directed through the universe itself (src/film).
 * With `?shot=` it waits to be stepped frame by frame, for rendering to video.
 */
export const FILM = params.has('film')

/** `?fallback` shows the page a browser without WebGL2 sees. */
export const FALLBACK = params.has('fallback')

/** `?signal`: in a screenshot run, the signal is shown at the height of a flash. */
export const SIGNAL = params.has('signal')

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

export function prefersReducedMotion(): boolean {
  return reducedMotionQuery.matches
}
