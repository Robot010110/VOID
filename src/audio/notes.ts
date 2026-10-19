/**
 * Every note VOID plays comes from one scale, D Lydian: a major scale with a raised fourth,
 * bright and unresolved, a sound of wonder rather than of arrival. Pure functions, no audio.
 */

/** Semitones above D of each degree of D Lydian: D E F♯ G♯ A B C♯. */
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const

/** MIDI note numbers of the scale's anchors. */
export const D1 = 26
export const D2 = 38
export const D3 = 50

/** The MIDI note of a scale degree counted from D at `base` (degree 7 is the next D up). */
export function scaleNote(degree: number, base = D3): number {
  const octave = Math.floor(degree / 7)
  const step = degree - octave * 7
  return base + octave * 12 + LYDIAN[step]!
}

/** Frequency in hertz of a MIDI note. */
export function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Whether a MIDI note belongs to D Lydian. */
export function inScale(midi: number): boolean {
  const step = (((midi - D3) % 12) + 12) % 12
  return (LYDIAN as readonly number[]).includes(step)
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Where `value` falls between `low` and `high` on a log scale, 0 to 1. */
function logShare(value: number, low: number, high: number): number {
  return clamp01((Math.log(Math.max(value, 1e-9)) - Math.log(low)) / (Math.log(high) - Math.log(low)))
}

/** A star's note: cool red stars low, hot blue stars high, over three octaves from D3. */
export function starNote(temperature: number): number {
  return scaleNote(Math.round(logShare(temperature, 2500, 30000) * 21))
}

/** A world's note: the innermost high, the outermost low, over two octaves from D3. */
export function worldNote(orbitRadius: number): number {
  return scaleNote(Math.round((1 - logShare(orbitRadius, 20, 200)) * 14))
}

/** A galaxy's note: deep, an octave from D2, the largest lowest. */
export function galaxyNote(size: number): number {
  return scaleNote(Math.round((1 - logShare(size, 7, 27)) * 7), D2)
}

/**
 * How fast the warm layer of a system pulses, in hertz, from the orbital period (seconds) of
 * the world nearest the camera: a quick inner world a little faster, a slow outer one slower.
 */
export function orbitPulse(period: number): number {
  const t = logShare(period, 600, 20000)
  return 0.5 * (0.1 / 0.5) ** t
}
