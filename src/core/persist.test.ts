import { afterEach, describe, expect, it } from 'vitest'
import { readFlag, setStorage, writeFlag, type KeyValueStore } from './persist.ts'

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  }
}

afterEach(() => setStorage(undefined))

describe('persist', () => {
  it('round-trips flags under a VOID prefix', () => {
    const store = memory()
    setStorage(store)
    expect(readFlag('audio', true)).toBe(true)
    writeFlag('audio', false)
    expect(store.data.get('void.audio')).toBe('0')
    expect(readFlag('audio', true)).toBe(false)
    writeFlag('audio', true)
    expect(readFlag('audio', false)).toBe(true)
  })

  it('falls back to the default when storage throws', () => {
    setStorage({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(readFlag('hint', true)).toBe(true)
    expect(readFlag('hint', false)).toBe(false)
    expect(() => writeFlag('hint', true)).not.toThrow()
  })

  it('works with no storage at all', () => {
    setStorage(null)
    expect(readFlag('audio', true)).toBe(true)
    expect(() => writeFlag('audio', false)).not.toThrow()
  })

  it('ignores values it did not write', () => {
    const store = memory()
    store.data.set('void.audio', 'yes')
    setStorage(store)
    expect(readFlag('audio', false)).toBe(false)
  })
})
