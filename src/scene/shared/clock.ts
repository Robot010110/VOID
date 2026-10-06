/**
 * World time: what spins planets, moves moons and churns clouds. Separate from the frame
 * clock so it can later be scaled (the time control) and so screenshot runs advance by a
 * fixed step per frame, giving the same picture every time.
 */
import { SHOT } from '../../core/env.ts'

export const worldClock = {
  /** Seconds of world time elapsed. */
  time: 0,
  /** Seconds since the page started, unscaled. */
  real: 0,
  /** Multiplier on world time. */
  scale: 1,
  /** Seconds this frame advanced, unscaled: what flights and fades step by. */
  step: 0,
}

const SHOT_STEP = 1 / 60

/**
 * Stepping by hand, for the screenshot script: while `manual`, time only moves for the
 * frames `advance` grants, so a transition can be frozen at an exact moment.
 */
export const stepping = { manual: false, frames: 0 }

export function advanceWorldClock(delta: number) {
  let step = SHOT ? SHOT_STEP : Math.min(delta, 0.1)
  if (stepping.manual) {
    step = stepping.frames > 0 ? SHOT_STEP : 0
    stepping.frames = Math.max(0, stepping.frames - 1)
  }
  worldClock.step = step
  worldClock.real += step
  worldClock.time += step * worldClock.scale
}
