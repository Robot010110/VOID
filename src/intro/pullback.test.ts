import { describe, expect, it } from 'vitest'
import { planPullBack } from './pullback.ts'

// Roughly the home system's: inside the system, out to the galaxy, out to the universe.
const RATIOS = [1.13, 6.8, 3.75]
const SHARES = [0.3, 0.38, 0.32]

describe('planPullBack', () => {
  const plan = planPullBack(RATIOS, SHARES, 10.5)

  it('shares out the time', () => {
    const seconds = plan.map((s) => s.seconds)
    expect(seconds.reduce((a, b) => a + b, 0)).toBeCloseTo(10.5, 9)
    expect(seconds[0]).toBeCloseTo(3.15, 9)
    expect(seconds[1]).toBeCloseTo(3.99, 9)
  })

  it('runs each segment from its start to its end, never turning back', () => {
    for (const segment of plan) {
      expect(segment.ease(0)).toBe(0)
      expect(segment.ease(1)).toBe(1)
      let previous = 0
      for (let i = 1; i <= 200; i++) {
        const value = segment.ease(i / 200)
        expect(value).toBeGreaterThanOrEqual(previous - 1e-12)
        previous = value
      }
    }
  })

  /** Log-distance per second at the start or end of a segment. */
  const speed = (k: number, at: 0 | 1) => {
    const segment = plan[k]!
    const dt = 1e-5
    const t = at === 0 ? 0 : 1 - dt
    return ((segment.ease(t + dt) - segment.ease(t)) / dt) * (RATIOS[k]! / segment.seconds)
  }

  it('starts and ends at rest', () => {
    expect(speed(0, 0)).toBeCloseTo(0, 3)
    expect(speed(2, 1)).toBeCloseTo(0, 3)
  })

  it('keeps its speed across every hand-over', () => {
    for (let k = 0; k < plan.length - 1; k++) {
      const out = speed(k, 1)
      const into = speed(k + 1, 0)
      expect(out).toBeGreaterThan(0.1)
      expect(into / out).toBeCloseTo(1, 3)
    }
  })

  it('rejects plans that cannot be flown', () => {
    expect(() => planPullBack([1, 2], [1], 5)).toThrow()
    expect(() => planPullBack([1, -2], [1, 1], 5)).toThrow()
    expect(() => planPullBack([], [], 5)).toThrow()
  })
})
