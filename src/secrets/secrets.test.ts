import { describe, expect, it } from 'vitest'
import type { Constellation } from '../core/constellations.ts'
import { parseFound } from '../core/store.ts'
import {
  companionOrbit,
  DOOR_WORD,
  EDGE,
  edgeFade,
  foundCount,
  foundWords,
  isSecret,
  KeyTrail,
  OLD_CODE,
  progress,
  returning,
  SECRETS,
  SIGNAL_COUNTS,
  SIGNAL_CYCLE,
  SIGNAL_DIRECTION,
  signalLight,
  signalLit,
} from './secrets.ts'

describe('what is remembered', () => {
  it('keeps short ids from storage and drops anything else', () => {
    expect(parseFound('["signal","edge","signal"]')).toEqual(['signal', 'edge'])
    expect(parseFound('{"signal":true}')).toEqual([])
    expect(parseFound('not json')).toEqual([])
    expect(parseFound(null)).toEqual([])
    expect(parseFound(JSON.stringify(['ok', 42, '<script>', 'x'.repeat(40)]))).toEqual(['ok'])
  })
})

describe('the nine', () => {
  it('are nine, each once', () => {
    expect(SECRETS).toHaveLength(9)
    expect(new Set(SECRETS).size).toBe(9)
  })

  it('counts only real ids among what storage holds', () => {
    expect(foundCount(['signal', 'edge', 'nonsense', 'signal'])).toBe(2)
    expect(isSecret('old-code')).toBe(true)
    expect(isSecret('konami')).toBe(false)
    expect(foundWords(4)).toBe('4 of 9 found')
  })
})

describe('the signal', () => {
  /** Flashes in one round, counted from the light curve sampled finely. */
  function flashes(): number[] {
    const counts: number[] = []
    let run = 0
    let lit = false
    let gap = 0
    for (let t = 0; t < SIGNAL_CYCLE; t += 0.01) {
      const on = signalLight(t) > 0.55
      if (on && !lit) run++
      if (!on) gap += 0.01
      if (on) gap = 0
      if (!on && gap > 1.2 && run > 0) {
        counts.push(run)
        run = 0
      }
      lit = on
    }
    if (run > 0) counts.push(run)
    return counts
  }

  it('counts two, three, five, and begins again', () => {
    expect(flashes()).toEqual([...SIGNAL_COUNTS])
    expect(signalLight(0.2)).toBeCloseTo(signalLight(0.2 + SIGNAL_CYCLE), 6)
  })

  it('is a faint star between flashes, never dark', () => {
    let lowest = Infinity
    for (let t = 0; t < SIGNAL_CYCLE; t += 0.05) lowest = Math.min(lowest, signalLight(t))
    expect(lowest).toBeGreaterThan(0.05)
    expect(lowest).toBeLessThan(0.2)
  })

  it('answers a click during a flash and just after it, not in the pauses', () => {
    expect(signalLit(0.2)).toBe(true)
    expect(signalLit(0.7)).toBe(true)
    expect(signalLit(0.9)).toBe(false)
    expect(signalLit(SIGNAL_CYCLE - 1)).toBe(false)
  })

  it('has a direction, a unit vector', () => {
    expect(Math.hypot(...SIGNAL_DIRECTION)).toBeCloseTo(1, 9)
  })
})

describe('keys', () => {
  it('finds the longest run that begins a sequence', () => {
    expect(progress(['a', 'a', 'b'], ['a', 'a', 'a'])).toBe(2)
    expect(progress(['a', 'a', 'b'], ['x', 'a', 'a', 'b'])).toBe(3)
    expect(progress(['a', 'b'], ['b'])).toBe(0)
  })

  it('opens the door on the word, and keeps S and T for it once it is well under way', () => {
    const trail = new KeyTrail()
    const results = [...DOOR_WORD].map((key, i) => trail.press(key, i * 100))
    expect(results.map((r) => r.consumed)).toEqual([false, false, true, true, true, true])
    expect(results[5]!.door).toBe(true)
    expect(results.slice(0, 5).some((r) => r.door)).toBe(false)
  })

  it('does not take S on its own, or the word typed too slowly', () => {
    const trail = new KeyTrail()
    expect(trail.press('s', 0).consumed).toBe(false)
    const slow = new KeyTrail()
    const pressed = [...DOOR_WORD].map((key, i) => slow.press(key, i * 3000))
    expect(pressed.some((r) => r.door)).toBe(false)
  })

  it('hears the old code, even after a stray press', () => {
    const trail = new KeyTrail()
    const keys = ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A']
    const heard = keys.map((key, i) => trail.press(key, i * 150))
    expect(heard.pop()!.oldCode).toBe(true)
    expect(heard.some((r) => r.oldCode)).toBe(false)
    expect(OLD_CODE).toHaveLength(10)
  })
})

describe('the edge', () => {
  it('fades from the end of the usual view to total dark', () => {
    expect(edgeFade(5200)).toBe(0)
    expect(edgeFade(EDGE.fading)).toBe(0)
    expect(edgeFade((EDGE.fading + EDGE.dark) / 2)).toBeGreaterThan(0.2)
    expect(edgeFade(EDGE.dark)).toBe(1)
    expect(edgeFade(EDGE.beyond)).toBe(1)
  })
})

describe('the persistence', () => {
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
  const drawn = (id: string, made: number): Constellation => ({ id, galaxy: 0, stars: [3, 4], name: '', made })

  it('waits for a later day', () => {
    expect(returning([drawn('a', at(2026, 10, 19, 1))], at(2026, 10, 19, 23))).toBeNull()
    expect(returning([drawn('a', at(2026, 10, 18, 23))], at(2026, 10, 19, 0))?.id).toBe('a')
    expect(returning([], at(2026, 10, 19))).toBeNull()
  })

  it('chooses the oldest constellation from before today', () => {
    const list = [drawn('new', at(2026, 10, 19)), drawn('mid', at(2026, 9, 1)), drawn('old', at(2026, 1, 1)), drawn('unknown', 0)]
    expect(returning(list, at(2026, 10, 19, 20))?.id).toBe('old')
  })

  it('sets the companion close beside its star', () => {
    const orbit = { radius: 100, phase: 1, height: 0.5, scatter: 0 }
    const near = companionOrbit(orbit)
    const position = (o: typeof orbit) => [o.radius * Math.cos(o.phase), o.height, o.radius * Math.sin(o.phase)]
    const [a, b] = [position(orbit), position(near)]
    const apart = Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)
    expect(apart).toBeGreaterThan(2)
    expect(apart).toBeLessThan(6)
  })
})
