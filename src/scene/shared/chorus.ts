/**
 * The old code's song, as the scene reads it each frame: how brightly every star in view is
 * singing, 0 to 1. It swells in a third of a second, holds while the chord sounds, and dies away
 * with it. Materials multiply what they emit by `sung(gain)`.
 */
export const chorus = { level: 0, t: -1 }

const RISE = 0.3
const HOLD = 1.7
const FALL = 2.8

const smooth = (t: number) => t * t * (3 - 2 * t)

export function startChorus() {
  chorus.t = 0
}

export function stepChorus(seconds: number) {
  if (chorus.t < 0) return
  chorus.t += seconds
  const t = chorus.t
  if (t < RISE) chorus.level = smooth(t / RISE)
  else if (t < RISE + HOLD) chorus.level = 1
  else if (t < RISE + HOLD + FALL) chorus.level = 1 - smooth((t - RISE - HOLD) / FALL)
  else {
    chorus.level = 0
    chorus.t = -1
  }
}

/** A material's multiplier now: 1, rising to `1 + gain` at the height of the song. */
export function sung(gain: number): number {
  return 1 + gain * chorus.level
}
