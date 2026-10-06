import { describe, expect, it } from 'vitest'
import { blackbody } from './blackbody.ts'

describe('blackbody', () => {
  it('is close to white near 6500 K', () => {
    const [r, g, b] = blackbody(6500)
    expect(Math.min(r, g, b)).toBeGreaterThan(0.9)
  })

  it('is orange for a cool star', () => {
    const [r, g, b] = blackbody(3000)
    expect(r).toBe(1)
    expect(g).toBeLessThan(0.8)
    expect(b).toBeLessThan(g)
  })

  it('is blue-white for a hot star', () => {
    const [r, g, b] = blackbody(20000)
    expect(b).toBe(1)
    expect(r).toBeLessThan(0.85)
    expect(g).toBeLessThan(1)
  })

  it('grows steadily bluer with temperature', () => {
    let previous = -Infinity
    for (let t = 2500; t <= 25000; t += 500) {
      const [r, , b] = blackbody(t)
      const blueness = b - r
      expect(blueness).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = blueness
    }
  })

  it('normalises the brightest channel to one and never goes negative', () => {
    for (let t = 1000; t <= 40000; t += 1000) {
      const rgb = blackbody(t)
      expect(Math.max(...rgb)).toBeCloseTo(1, 6)
      for (const channel of rgb) expect(channel).toBeGreaterThanOrEqual(0)
    }
  })
})
