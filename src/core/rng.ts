/**
 * Seeded randomness. Everything in VOID derives from one universe seed, so the same
 * universe appears on every visit and every device. Child seeds are hashed from their
 * parent and an index (`hashSeed(galaxySeed, starIndex)`), which lets any level be
 * generated on its own without generating its siblings first.
 *
 * Changing anything in this file changes the universe for returning visitors, whose
 * saved constellations point at specific stars. The golden values in rng.test.ts exist
 * to catch that.
 */

const GOLDEN_GAMMA = 0x9e3779b9

/** Murmur3 finaliser: a strong 32-bit integer mix. */
export function mix32(value: number): number {
  let x = value >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  return (x ^ (x >>> 16)) >>> 0
}

/** cyrb53: a fast, well-distributed 53-bit hash of a string. */
export function hashString(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** A 32-bit seed from any string, e.g. `seedFromString('void')`. */
export function seedFromString(text: string): number {
  return hashString(text) >>> 0
}

/** Derive a child seed from a parent seed and one or more integer keys. Order matters. */
export function hashSeed(parent: number, ...keys: number[]): number {
  let h = mix32((parent >>> 0) ^ GOLDEN_GAMMA)
  for (const key of keys) {
    h = mix32(h + GOLDEN_GAMMA + mix32(key >>> 0))
  }
  return h
}

/**
 * sfc32 (Chris Doty-Humphrey's Small Fast Counting generator), seeded through splitmix32.
 * Passes PractRand and BigCrush, and is cheap enough for hundreds of thousands of calls.
 */
export class Rng {
  readonly seed: number
  private a: number
  private b: number
  private c: number
  private d: number
  private spareGauss: number | null = null

  constructor(seed: number) {
    this.seed = seed >>> 0
    let s = this.seed
    const next = () => {
      s = (s + GOLDEN_GAMMA) >>> 0
      return mix32(s)
    }
    this.a = next() | 0
    this.b = next() | 0
    this.c = next() | 0
    this.d = next() | 0
    for (let i = 0; i < 12; i++) this.uint32()
  }

  /** Next raw 32-bit unsigned integer. */
  uint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.uint32() / 4294967296
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** -1 or 1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list')
    return items[Math.floor(this.next() * items.length)] as T
  }

  /** Pick by relative weight. Weights need not sum to one. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new Error('Rng.weighted: items and weights must be non-empty and the same length')
    }
    let total = 0
    for (const w of weights) total += w
    let roll = this.next() * total
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] as number
      if (roll < 0) return items[i] as T
    }
    return items[items.length - 1] as T
  }

  /** Normally distributed value (Box-Muller, caching the spare). */
  gauss(mean = 0, deviation = 1): number {
    if (this.spareGauss !== null) {
      const spare = this.spareGauss
      this.spareGauss = null
      return mean + deviation * spare
    }
    const u = 1 - this.next() // (0, 1], keeps log() finite
    const v = this.next()
    const r = Math.sqrt(-2 * Math.log(u))
    const theta = 2 * Math.PI * v
    this.spareGauss = r * Math.sin(theta)
    return mean + deviation * r * Math.cos(theta)
  }

  /** Pareto (power-law) sample: many small values, a long tail of large ones. */
  pareto(min: number, alpha: number): number {
    return min * Math.pow(1 - this.next(), -1 / alpha)
  }

  /** Uniform point on the unit sphere, written into `out` (x, y, z). */
  onSphere(out: [number, number, number]): [number, number, number] {
    const z = this.next() * 2 - 1
    const phi = this.next() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    out[0] = r * Math.cos(phi)
    out[1] = r * Math.sin(phi)
    out[2] = z
    return out
  }

  /** Fisher-Yates shuffle in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const tmp = items[i] as T
      items[i] = items[j] as T
      items[j] = tmp
    }
    return items
  }

  /** An independent generator for a numbered child, e.g. `galaxyRng.fork(starIndex)`. */
  fork(key: number): Rng {
    return new Rng(hashSeed(this.seed, key))
  }
}

/** The one seed the whole universe grows from. */
export const UNIVERSE_SEED = seedFromString('VOID / first light')
