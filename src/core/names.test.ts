import { describe, expect, it } from 'vitest'
import { catalogueName, FAMILY_IDS, Language } from './names.ts'
import { Rng, UNIVERSE_SEED } from './rng.ts'

function sample(language: Language, seed: number, count: number): string[] {
  const rng = new Rng(seed)
  return Array.from({ length: count }, () => language.name(rng))
}

describe('Language', () => {
  it('is deterministic for a seed', () => {
    const a = sample(new Language(UNIVERSE_SEED), 1, 50)
    const b = sample(new Language(UNIVERSE_SEED), 1, 50)
    expect(a).toEqual(b)
  })

  it('locks the first names of the universe', () => {
    const language = new Language(UNIVERSE_SEED)
    expect(language.family).toBe('oru')
    expect(sample(language, UNIVERSE_SEED, 6)).toEqual([
      'Semo',
      'Sakitu',
      'Marambi',
      'Inau',
      'Otumo',
      'Amatu',
    ])
  })

  it('picks a family from the seed when none is given', () => {
    const families = new Set(Array.from({ length: 40 }, (_, i) => new Language(i * 7919).family))
    expect(families.size).toBe(FAMILY_IDS.length)
  })

  for (const family of FAMILY_IDS) {
    describe(`family ${family}`, () => {
      const names = Array.from({ length: 8 }, (_, d) =>
        sample(new Language(1000 + d, family), 500 + d, 600),
      ).flat()

      it('produces capitalised words of four to eight letters, with no digits', () => {
        for (const name of names) expect(name).toMatch(/^[A-Z][a-z]{3,7}$/)
      })

      it('never produces profanity or blocked real-world words', () => {
        const blocked = /fuk|shit|cunt|dick|cock|piss|tit|cum|fag|nig|rape|slut|nazi|sex|porn|ass|poo|god|hell|kill/
        for (const name of names) expect(name.toLowerCase()).not.toMatch(blocked)
        const lower = new Set(names.map((n) => n.toLowerCase()))
        for (const real of ['mars', 'venus', 'luna', 'vega', 'paris', 'tokyo', 'than', 'mine']) {
          expect(lower.has(real)).toBe(false)
        }
      })

      it('rarely repeats itself', () => {
        expect(new Set(names).size / names.length).toBeGreaterThan(0.75)
      })
    })
  }

  it('gives families distinct sounds', () => {
    const vowelEnding = (names: string[]) => names.filter((n) => /[aeiou]$/.test(n)).length / names.length
    const oru = sample(new Language(1, 'oru'), 2, 2000)
    const keth = sample(new Language(1, 'keth'), 2, 2000)
    // Oru opens and closes on vowels; keth closes on consonants.
    expect(vowelEnding(oru)).toBeGreaterThan(0.6)
    expect(vowelEnding(keth)).toBeLessThan(0.45)
    const clusters = (names: string[]) =>
      names.filter((n) => /(thr|str|tr|dr|st|br)/i.test(n)).length / names.length
    expect(clusters(keth)).toBeGreaterThan(clusters(oru) + 0.15)
  })

  it('gives two dialects of one family different habits', () => {
    // Total variation distance between the distributions of two-letter endings.
    const endings = (names: string[]) => {
      const counts = new Map<string, number>()
      for (const n of names) counts.set(n.slice(-2), (counts.get(n.slice(-2)) ?? 0) + 1 / names.length)
      return counts
    }
    const distance = (x: Map<string, number>, y: Map<string, number>) => {
      let total = 0
      for (const key of new Set([...x.keys(), ...y.keys()])) total += Math.abs((x.get(key) ?? 0) - (y.get(key) ?? 0))
      return total / 2
    }
    const dialectA = endings(sample(new Language(10, 'lir'), 3, 3000))
    const dialectB = endings(sample(new Language(11, 'lir'), 3, 3000))
    const sameDialect = endings(sample(new Language(10, 'lir'), 4, 3000))
    expect(distance(dialectA, dialectB)).toBeGreaterThan(distance(dialectA, sameDialect) * 2)
  })

  it('titles featured places with two words', () => {
    const language = new Language(4242, 'oru')
    const rng = new Rng(1)
    for (let i = 0; i < 200; i++) expect(language.titled(rng)).toMatch(/^[A-Z][a-z]{3,6} [A-Z][a-z]+$/)
  })
})

describe('catalogueName', () => {
  it('formats minor stars as two letters and a number', () => {
    const rng = new Rng(6)
    for (let i = 0; i < 500; i++) expect(catalogueName(rng)).toMatch(/^[B-DF-HJ-NP-TV-XZ]{2}-[1-9]\d{0,2}$/)
  })

  it('is deterministic', () => {
    expect(catalogueName(new Rng(12))).toBe(catalogueName(new Rng(12)))
  })
})
