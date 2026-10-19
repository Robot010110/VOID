/**
 * What VOID remembers between visits, in localStorage. Storage can be missing, full, or
 * blocked outright (private windows, strict settings), and then every read falls back to its
 * default and every write is dropped: VOID still works, it only forgets.
 */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

let store: KeyValueStore | null | undefined

function current(): KeyValueStore | null {
  if (store === undefined) store = defaultStore()
  return store
}

/** Use another store (tests), or `undefined` to go back to localStorage. */
export function setStorage(next: KeyValueStore | null | undefined) {
  store = next
}

const PREFIX = 'void.'

export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = current()?.getItem(PREFIX + key)
    return value === '1' ? true : value === '0' ? false : fallback
  } catch {
    return fallback
  }
}

export function writeFlag(key: string, value: boolean) {
  try {
    current()?.setItem(PREFIX + key, value ? '1' : '0')
  } catch {
    // Storage is full or blocked: forget quietly.
  }
}

export function readText(key: string): string | null {
  try {
    return current()?.getItem(PREFIX + key) ?? null
  } catch {
    return null
  }
}

export function writeText(key: string, value: string) {
  try {
    current()?.setItem(PREFIX + key, value)
  } catch {
    // Storage is full or blocked: forget quietly.
  }
}
