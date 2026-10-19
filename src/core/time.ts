/**
 * How fast world time runs at each level. The visitor chooses paused, 1x, 100x or 10,000x;
 * nearer levels cap it at a pace that still reads as motion rather than strobing: a system's
 * inner world would lap its star five times a second at 10,000x, and a world would spin
 * thirty times. A galaxy and the universe take the full 10,000x, where it is what makes them
 * visibly turn.
 */
import type { Level } from './universe.ts'

export const LEVEL_CAP: Readonly<Record<Level, number>> = {
  universe: 10000,
  hole: 10000,
  galaxy: 10000,
  system: 1000,
  planet: 150,
}

/** The scale world time runs at, for a chosen step, at the levels on screen. */
export function effectiveScale(step: number, levels: readonly Level[]): number {
  let cap = Infinity
  for (const level of levels) cap = Math.min(cap, LEVEL_CAP[level])
  return Math.min(step, cap)
}

/**
 * One frame of easing a time scale towards a target, over about a second: in log(1 + scale),
 * so 1x to 10,000x is as smooth as 1x to 100x, and pausing settles rather than stops dead.
 */
export function easeScale(scale: number, target: number, seconds: number): number {
  const from = Math.log1p(scale)
  const to = Math.log1p(target)
  const next = Math.expm1(from + (to - from) * (1 - Math.exp(-seconds * 3.2)))
  return Math.abs(next - target) < 1e-3 * Math.max(1, target) ? target : next
}

/** Words for a step, as the control says it. */
export function stepLabel(step: number): string {
  if (step === 0) return 'Time paused'
  if (step === 1) return 'Time as it is'
  return `Time ${step.toLocaleString('en-US')} times faster`
}
