/**
 * What the eye sees by, as the scene reads it each frame: how far into infrared and into radio
 * the view has turned, each 0 to 1 and easing over most of a second, so the universe crossfades
 * from one way of seeing to the next. At most one of the two is far from zero, except while
 * changing between them.
 *
 * Materials respond with `lens(infrared, radio)`: a multiplier on what they emit, for each way
 * of seeing (stars dim in heat and almost vanish in radio; dust and nebulae glow in heat; the
 * cosmic web's gas comes out in radio). The post effect (post/SpectrumLens.ts) then re-colours
 * the whole picture into heat or into cold radio tones.
 */
import { useVoid, type Spectrum } from '../../core/store.ts'

export const spectrum = { infrared: 0, radio: 0 }

/** Seconds for a change of spectrum to mostly settle. */
const EASE = 0.7

const TARGETS: Record<Spectrum, { infrared: number; radio: number }> = {
  visible: { infrared: 0, radio: 0 },
  infrared: { infrared: 1, radio: 0 },
  radio: { infrared: 0, radio: 1 },
}

/** One frame of easing towards the chosen spectrum (`instant` for screenshot runs). */
export function stepSpectrum(seconds: number, instant: boolean) {
  const target = TARGETS[useVoid.getState().spectrum]
  const k = instant ? 1 : 1 - Math.exp((-seconds * 3) / EASE)
  spectrum.infrared += (target.infrared - spectrum.infrared) * k
  spectrum.radio += (target.radio - spectrum.radio) * k
  if (Math.abs(spectrum.infrared - target.infrared) < 1e-3) spectrum.infrared = target.infrared
  if (Math.abs(spectrum.radio - target.radio) < 1e-3) spectrum.radio = target.radio
}

/** A material's multiplier now: 1 in visible light, `infrared` in heat, `radio` in radio. */
export function lens(infrared: number, radio: number): number {
  return 1 + (infrared - 1) * spectrum.infrared + (radio - 1) * spectrum.radio
}
