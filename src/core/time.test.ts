import { describe, expect, it } from 'vitest'
import { easeScale, effectiveScale, stepLabel } from './time.ts'

describe('time', () => {
  it('caps the pace at nearer levels', () => {
    expect(effectiveScale(10000, ['galaxy'])).toBe(10000)
    expect(effectiveScale(10000, ['system'])).toBe(1000)
    expect(effectiveScale(10000, ['planet'])).toBe(150)
    expect(effectiveScale(100, ['planet'])).toBe(100)
    expect(effectiveScale(0, ['system'])).toBe(0)
  })

  it('takes the slower cap while two levels share the screen', () => {
    expect(effectiveScale(10000, ['galaxy', 'system'])).toBe(1000)
    expect(effectiveScale(10000, ['system', 'planet'])).toBe(150)
  })

  it('eases over about a second, and arrives', () => {
    let scale = 1
    for (let i = 0; i < 30; i++) scale = easeScale(scale, 10000, 1 / 60)
    expect(scale).toBeGreaterThan(30)
    expect(scale).toBeLessThan(10000)
    for (let i = 0; i < 300; i++) scale = easeScale(scale, 10000, 1 / 60)
    expect(scale).toBe(10000)
    for (let i = 0; i < 300; i++) scale = easeScale(scale, 0, 1 / 60)
    expect(scale).toBe(0)
  })

  it('never overshoots', () => {
    let scale = 0
    let previous = 0
    for (let i = 0; i < 200; i++) {
      scale = easeScale(scale, 100, 1 / 30)
      expect(scale).toBeGreaterThanOrEqual(previous)
      expect(scale).toBeLessThanOrEqual(100)
      previous = scale
    }
  })

  it('says each step in words', () => {
    expect(stepLabel(0)).toBe('Time paused')
    expect(stepLabel(1)).toBe('Time as it is')
    expect(stepLabel(10000)).toBe('Time 10,000 times faster')
  })
})
