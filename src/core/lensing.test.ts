import { describe, expect, it } from 'vitest'
import {
  CRITICAL_IMPACT,
  deflection,
  deflectionTable,
  periapsis,
  PHOTON_SPHERE,
  strongDeflection,
  weakDeflection,
} from './lensing.ts'

/** The same deflection by brute force: the orbit integral, sampled finely. */
function integrated(b: number): number {
  const u0 = 1 / periapsis(b)
  const steps = 200000
  let sum = 0
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps
    const u = u0 * (1 - t * t)
    sum += (2 * u0 * t) / Math.sqrt(1 / (b * b) - u * u + u * u * u) / steps
  }
  return 2 * sum - Math.PI
}

describe('light bent by a black hole', () => {
  it('skims the photon sphere at the critical impact parameter', () => {
    expect(periapsis(CRITICAL_IMPACT * (1 + 1e-9))).toBeCloseTo(PHOTON_SPHERE, 3)
    expect(periapsis(100)).toBeGreaterThan(99)
  })

  it('agrees with the orbit integral', () => {
    for (const b of [3.2, 6, 15]) expect(deflection(b)).toBeCloseTo(integrated(b), 3)
  })

  it('tends to 2 / b far away, and without limit near the shadow', () => {
    expect(deflection(400) / weakDeflection(400)).toBeCloseTo(1, 3)
    expect(deflection(CRITICAL_IMPACT * 1.0001)).toBeCloseTo(strongDeflection(CRITICAL_IMPACT * 1.0001), 2)
    expect(deflection(CRITICAL_IMPACT * 1.001)).toBeGreaterThan(Math.PI * 2)
  })

  it('falls steadily with distance from the hole', () => {
    const { values, from, to } = deflectionTable(64)
    expect(from).toBeLessThan(to)
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeLessThan(values[i - 1]!)
  })
})
