import { describe, expect, it } from 'vitest'
import { hashSeed, hashString, mix32, Rng, seedFromString, UNIVERSE_SEED } from './rng.ts'

describe('hashString (cyrb53)', () => {
  it('matches the published reference values', () => {
    expect(hashString('a')).toBe(7929297801672961)
    expect(hashString('b')).toBe(8684336938537663)
    expect(hashString('revenge')).toBe(4051478007546757)
    expect(hashString('revenue')).toBe(8309097637345594)
  })

  it('changes with the seed', () => {
    expect(hashString('void', 1)).not.toBe(hashString('void', 2))
  })

  it('reduces to a 32-bit seed', () => {
    const seed = seedFromString('void')
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(2 ** 32)
  })
})

describe('hashSeed', () => {
  it('is deterministic and order-sensitive', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3))
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(1, 3, 2))
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1))
  })

  it('gives every child of a parent a distinct seed', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 20000; i++) seen.add(hashSeed(UNIVERSE_SEED, i))
    expect(seen.size).toBe(20000)
  })

  it('avalanches: neighbouring indices differ in about half their bits', () => {
    let totalBits = 0
    const samples = 2000
    for (let i = 0; i < samples; i++) {
      let x = (hashSeed(7, i) ^ hashSeed(7, i + 1)) >>> 0
      while (x) {
        totalBits += x & 1
        x >>>= 1
      }
    }
    const mean = totalBits / samples
    expect(mean).toBeGreaterThan(14)
    expect(mean).toBeLessThan(18)
  })

  it('mixes zero into a non-zero value', () => {
    expect(mix32(0)).toBe(0)
    expect(hashSeed(0)).not.toBe(0)
  })
})

describe('Rng', () => {
  it('locks the universe: golden outputs never change', () => {
    // If this fails, every returning visitor's universe (and saved constellation) moved.
    const rng = new Rng(42)
    expect([rng.uint32(), rng.uint32(), rng.uint32(), rng.uint32(), rng.uint32()]).toEqual([
      1028872839, 2516511472, 400437680, 853279530, 1920286840,
    ])
    expect(hashSeed(1, 2, 3)).toBe(1729481826)
    expect(UNIVERSE_SEED).toBe(4105036330)
  })

  it('repeats exactly for the same seed', () => {
    const a = new Rng(123456)
    const b = new Rng(123456)
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next())
  })

  it('diverges for different seeds', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    let same = 0
    for (let i = 0; i < 1000; i++) if (a.next() === b.next()) same++
    expect(same).toBe(0)
  })

  it('produces uniform floats in [0, 1)', () => {
    const rng = new Rng(99)
    const buckets = new Array<number>(20).fill(0)
    const n = 200000
    let sum = 0
    for (let i = 0; i < n; i++) {
      const x = rng.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      sum += x
      buckets[Math.floor(x * 20)]!++
    }
    expect(sum / n).toBeCloseTo(0.5, 2)
    // Chi-square with 19 degrees of freedom; 43.8 is the 0.1% critical value.
    const expected = n / 20
    const chi = buckets.reduce((acc, count) => acc + (count - expected) ** 2 / expected, 0)
    expect(chi).toBeLessThan(43.8)
  })

  it('keeps int() inside its inclusive bounds and reaches both ends', () => {
    const rng = new Rng(5)
    let sawMin = false
    let sawMax = false
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(3, 9)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(9)
      if (v === 3) sawMin = true
      if (v === 9) sawMax = true
    }
    expect(sawMin && sawMax).toBe(true)
  })

  it('draws normal values with the requested mean and deviation', () => {
    const rng = new Rng(77)
    const n = 100000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const g = rng.gauss(10, 2)
      sum += g
      sumSq += g * g
    }
    const mean = sum / n
    const sd = Math.sqrt(sumSq / n - mean * mean)
    expect(mean).toBeCloseTo(10, 1)
    expect(sd).toBeCloseTo(2, 1)
  })

  it('follows the requested weights', () => {
    const rng = new Rng(11)
    const counts = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 60000; i++) counts[rng.weighted(['a', 'b', 'c'] as const, [1, 2, 3])]++
    expect(counts.a / 60000).toBeCloseTo(1 / 6, 2)
    expect(counts.b / 60000).toBeCloseTo(2 / 6, 2)
    expect(counts.c / 60000).toBeCloseTo(3 / 6, 2)
  })

  it('places points uniformly on the unit sphere', () => {
    const rng = new Rng(3)
    const p: [number, number, number] = [0, 0, 0]
    let mx = 0
    let my = 0
    let mz = 0
    let northern = 0
    const n = 50000
    for (let i = 0; i < n; i++) {
      rng.onSphere(p)
      expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(1, 10)
      mx += p[0]
      my += p[1]
      mz += p[2]
      if (p[2] > 0.5) northern++
    }
    expect(Math.abs(mx / n)).toBeLessThan(0.01)
    expect(Math.abs(my / n)).toBeLessThan(0.01)
    expect(Math.abs(mz / n)).toBeLessThan(0.01)
    // The cap above z = 0.5 holds exactly a quarter of a uniform sphere's area.
    expect(northern / n).toBeCloseTo(0.25, 2)
  })

  it('draws a heavy-tailed pareto distribution above its minimum', () => {
    const rng = new Rng(8)
    const values = Array.from({ length: 20000 }, () => rng.pareto(1, 1.5))
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1)
    const above10 = values.filter((v) => v > 10).length / values.length
    // P(X > 10) = 10^-1.5 for alpha = 1.5.
    expect(above10).toBeCloseTo(10 ** -1.5, 2)
  })

  it('forks into independent, reproducible children', () => {
    const parent = new Rng(1000)
    const childA = parent.fork(4)
    const childB = new Rng(1000).fork(4)
    const sibling = parent.fork(5)
    const a = Array.from({ length: 10 }, () => childA.next())
    expect(a).toEqual(Array.from({ length: 10 }, () => childB.next()))
    expect(a).not.toEqual(Array.from({ length: 10 }, () => sibling.next()))
  })

  it('shuffles reproducibly without losing items', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const a = new Rng(9).shuffle([...items])
    const b = new Rng(9).shuffle([...items])
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual(items)
    expect(a).not.toEqual(items)
  })
})
