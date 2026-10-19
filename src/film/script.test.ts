import { describe, expect, it } from 'vitest'
import type { Burst } from '../intro/particles.ts'
import { createGather } from './gather.ts'
import { END, FILM_LENGTH, siteAddress, TITLES } from './script.ts'

describe('the trailer script', () => {
  it('keeps every title inside the film, in order, each on screen for a while', () => {
    let previous = -Infinity
    for (const title of TITLES) {
      expect(title.from).toBeGreaterThanOrEqual(previous)
      expect(title.to).toBeGreaterThan(title.from + 0.5)
      expect(title.to).toBeLessThanOrEqual(END.dark)
      expect(title.lines.length).toBeGreaterThan(0)
      previous = title.from
    }
    expect(new Set(TITLES.map((t) => t.id)).size).toBe(TITLES.length)
  })

  it('gives every count its number and every shout its colour', () => {
    for (const title of TITLES) {
      if (title.kind === 'count') expect(title.count).toBeGreaterThan(1)
      if (title.kind === 'shout') expect(title.colour).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('ends on the name, its lines in turn, before the film is over', () => {
    expect(END.dark).toBeLessThan(END.gather)
    expect(END.gather).toBeLessThan(END.gathered)
    let previous: number = END.gathered
    for (const line of END.lines) {
      expect(line.at).toBeGreaterThan(previous)
      previous = line.at
    }
    expect(previous + 1.5).toBeLessThan(FILM_LENGTH)
  })

  it('writes the address without its scheme', () => {
    expect(siteAddress()).not.toMatch(/^https?:/)
    expect(siteAddress()).not.toMatch(/\/$/)
  })
})

describe('the stars that gather into the name', () => {
  const burst: Burst = {
    width: 800,
    height: 600,
    specks: Array.from({ length: 40 }, (_, i) => ({
      x: 300 + i * 5,
      y: 290 + (i % 3) * 4,
      vx: 0,
      vy: 0,
      delay: 0,
      life: 1,
      size: 1,
      star: false,
      twinkle: 0,
      tint: 0 as const,
    })),
  }

  it('is the same every time', () => {
    expect(createGather(burst, 800, 600)).toEqual(createGather(burst, 800, 600))
  })

  it('sends every star out and brings each back to its place in a letter', () => {
    const { motes } = createGather(burst, 800, 600)
    expect(motes).toHaveLength(40)
    motes.forEach((mote, i) => {
      expect(mote.toX).toBe(burst.specks[i]!.x)
      expect(mote.toY).toBe(burst.specks[i]!.y)
      expect(Math.hypot(mote.fromX - mote.toX, mote.fromY - mote.toY)).toBeGreaterThan(50)
      // Every one has arrived by the end of the gathering.
      expect(mote.delay + mote.span).toBeLessThanOrEqual(1.0001)
    })
  })
})
