import { describe, expect, it } from 'vitest'
import { D2, D3, frequency, galaxyNote, inScale, orbitPulse, scaleNote, starNote, voiceChord, worldNote } from './notes.ts'

describe('notes', () => {
  it('builds D Lydian', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => scaleNote(d))).toEqual([50, 52, 54, 56, 57, 59, 61, 62])
    expect(scaleNote(0, D2)).toBe(38)
    expect(inScale(56)).toBe(true) // G sharp, the raised fourth
    expect(inScale(55)).toBe(false) // G natural is not in it
    expect(inScale(26)).toBe(true)
  })

  it('tunes A to 440', () => {
    expect(frequency(69)).toBeCloseTo(440, 9)
    expect(frequency(D3)).toBeCloseTo(146.83, 2)
  })

  it('pitches hot stars above cool ones, within three octaves of D3', () => {
    const temperatures = [2500, 3200, 4000, 5800, 7500, 10000, 20000, 30000]
    const notes = temperatures.map(starNote)
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeGreaterThanOrEqual(notes[i - 1]!)
    expect(notes[0]).toBe(D3)
    expect(notes[notes.length - 1]).toBe(D3 + 36)
    expect(starNote(1000)).toBe(D3)
    expect(starNote(90000)).toBe(D3 + 36)
    for (const note of notes) expect(inScale(note)).toBe(true)
  })

  it('pitches inner worlds above outer ones', () => {
    const notes = [22, 32, 54, 80, 130, 194].map(worldNote)
    for (let i = 1; i < notes.length; i++) expect(notes[i]).toBeLessThanOrEqual(notes[i - 1]!)
    expect(notes[0]).toBeGreaterThan(notes[notes.length - 1]!)
    for (const note of notes) expect(inScale(note)).toBe(true)
  })

  it('keeps galaxies deep', () => {
    for (const size of [6, 10, 19, 30, 50]) {
      const note = galaxyNote(size)
      expect(note).toBeGreaterThanOrEqual(D2)
      expect(note).toBeLessThanOrEqual(D2 + 12)
      expect(inScale(note)).toBe(true)
    }
    expect(galaxyNote(27)).toBeLessThan(galaxyNote(7))
  })

  it('pulses quick orbits faster, within 0.1 to 0.5 Hz', () => {
    expect(orbitPulse(600)).toBeCloseTo(0.5, 9)
    expect(orbitPulse(20000)).toBeCloseTo(0.1, 9)
    expect(orbitPulse(2693)).toBeGreaterThan(orbitPulse(9864))
    expect(orbitPulse(10)).toBeCloseTo(0.5, 9)
  })
})

describe('a chord from many notes', () => {
  it('keeps each pitch once, low to high, thinned evenly', () => {
    const many = Array.from({ length: 40 }, (_, i) => scaleNote(i % 22))
    const chord = voiceChord(many)
    expect(chord).toHaveLength(7)
    expect([...chord].sort((a, b) => a - b)).toEqual(chord)
    expect(new Set(chord).size).toBe(7)
    expect(chord[0]).toBe(scaleNote(0))
    expect(chord[6]).toBe(scaleNote(21))
    expect(chord.every(inScale)).toBe(true)
  })

  it('fills in an open chord when there are too few notes', () => {
    expect(voiceChord([]).length).toBeGreaterThanOrEqual(5)
    expect(voiceChord([scaleNote(3)])).toContain(scaleNote(3))
    expect(voiceChord([scaleNote(2), scaleNote(5), scaleNote(9)])).toEqual([scaleNote(2), scaleNote(5), scaleNote(9)])
  })
})
