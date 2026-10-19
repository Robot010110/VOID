import { describe, expect, it } from 'vitest'
import { anchorOf } from '../content/anchors.ts'
import { getUniverse } from '../core/cosmos.ts'
import { KEEPERS } from './secrets.ts'
import { coordinates, parsePlace, placeExists, placeName, runCommand, scan } from './terminal.ts'

const UNIVERSE: number[] = []
const lines = (input: string, here: readonly number[] = UNIVERSE) => runCommand(input, here).lines.join('\n')

describe('coordinates', () => {
  it('are written in sixteens, two digits a step', () => {
    expect(coordinates([47, 161, 1])).toBe('2f·a1·01')
    expect(coordinates([])).toBe('')
  })

  it('are read however they are typed', () => {
    for (const typed of ['2f a1 01', '2f·a1·1', '0x2f.0xA1.0x1', '2F:A1:01', ' 2f  a1  1 ']) expect(parsePlace(typed)).toEqual([47, 161, 1])
    expect(parsePlace('0')).toEqual([0])
    expect(parsePlace('')).toBeNull()
    expect(parsePlace('home')).toBeNull()
    expect(parsePlace('1 2 3 4')).toBeNull()
  })

  it('name real places only', () => {
    const hole = getUniverse().hole.index
    expect(placeExists([])).toBe(true)
    expect(placeExists([0, 0, 3])).toBe(true)
    expect(placeExists([hole])).toBe(true)
    expect(placeExists([hole, 0])).toBe(false)
    expect(placeExists([0, 0, 40])).toBe(false)
    expect(placeExists([999])).toBe(false)
    expect(placeName([0, 0, 3])).toBe('Ithasal')
  })
})

describe('the station', () => {
  it('lists its files, and the keepers’ note only to ls -a', () => {
    expect(lines('ls')).not.toContain('.keeper')
    expect(lines('ls -a')).toContain('.keeper')
    expect(lines('ls logs')).toContain('4111.log')
    expect(lines('ls nowhere')).toContain('no such file')
  })

  it('shows files, and says so when there is none', () => {
    expect(lines('cat readme')).toContain('LISTENING STATION 9')
    expect(lines('cat logs/4111.log')).toContain('two, three, five')
    expect(lines('cat logs')).toContain('is a directory')
    expect(lines('cat 4111.log')).toContain('no such file')
    expect(lines('cat')).toContain('which file')
  })

  it('keeps the coordinates of the keepers’ home in their note, and goto takes them as written', () => {
    const note = lines('cat .keeper')
    const typed = /goto ([0-9a-f ]+)/.exec(note)![1]!
    const reply = runCommand(`goto ${typed}`, UNIVERSE)
    expect(reply.effect).toEqual({ kind: 'goto', path: KEEPERS })
    expect(anchorOf(KEEPERS)?.id).toBe('keepers')
  })

  it('will not go nowhere, or where the visitor already is', () => {
    expect(runCommand('goto', UNIVERSE).effect).toBeUndefined()
    expect(runCommand('goto zz', UNIVERSE).effect).toBeUndefined()
    expect(runCommand('goto ff ff ff', UNIVERSE).effect).toBeUndefined()
    expect(runCommand('goto 2f a1 01', KEEPERS).lines.join()).toContain('already there')
  })

  it('closes, clears, and answers what it does not understand', () => {
    expect(runCommand('exit', UNIVERSE).effect).toEqual({ kind: 'close' })
    expect(runCommand('clear', UNIVERSE).effect).toEqual({ kind: 'clear' })
    expect(lines('dance')).toContain('Try help')
    expect(runCommand('   ', UNIVERSE).lines).toEqual([])
    expect(lines('help')).toContain('goto')
  })

  it('scans where the visitor is', () => {
    expect(scan([]).join('\n')).toContain('periodic')
    expect(scan([0]).join('\n')).toContain('carriers')
    expect(scan([0, 0]).join('\n')).toContain('Ithasal')
    expect(scan([0, 0, 3]).join('\n')).toContain('voices')
    expect(scan([getUniverse().hole.index]).join('\n')).toContain('falling')
  })
})
