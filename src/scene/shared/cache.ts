/**
 * GPU resources shared between components and levels, counted by reference. A planet's
 * baked maps outlive the component that made them for a while, so the same planet seen
 * from the system and then close up, or visited twice, is never baked twice. Disposal
 * always happens in a timer, never during a frame, so a component that only peeks at a
 * resource can drop it at its next frame before anything renders with it.
 */
import { useEffect, useMemo } from 'react'

export interface Disposable {
  dispose(): void
}

export interface KeepPolicy {
  /** Milliseconds an unused resource is kept before it is disposed. */
  readonly keepFor: number
  /** Resources in one group compete for space: only `spare` unused ones are kept. */
  readonly group: string
  readonly spare: number
}

interface Entry {
  readonly value: Disposable
  readonly policy: KeepPolicy
  refs: number
  timer: number | null
  released: number
}

const entries = new Map<string, Entry>()

function schedule(key: string, entry: Entry) {
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    if (entry.refs === 0 && entries.get(key) === entry) {
      entries.delete(key)
      entry.value.dispose()
    }
  }, entry.policy.keepFor)
}

/** Keep at most `spare` unused resources per group, dropping the longest unused first. */
function trim(group: string, spare: number) {
  const idle = [...entries.entries()]
    .filter(([, entry]) => entry.policy.group === group && entry.refs === 0)
    .sort((a, b) => b[1].released - a[1].released)
  for (const [key, entry] of idle.slice(spare)) {
    if (entry.timer !== null) window.clearTimeout(entry.timer)
    entry.timer = window.setTimeout(() => {
      if (entry.refs === 0 && entries.get(key) === entry) {
        entries.delete(key)
        entry.value.dispose()
      }
    }, 0)
  }
}

/** The resource under `key`, created if needed. It is disposed unless retained soon. */
export function obtain<T extends Disposable>(key: string, create: () => T, policy: KeepPolicy): T {
  let entry = entries.get(key)
  if (!entry) {
    entry = { value: create(), policy, refs: 0, timer: null, released: performance.now() }
    entries.set(key, entry)
    schedule(key, entry)
  }
  return entry.value as T
}

export function retain(key: string) {
  const entry = entries.get(key)
  if (!entry) return
  entry.refs++
  if (entry.timer !== null) {
    window.clearTimeout(entry.timer)
    entry.timer = null
  }
}

export function release(key: string) {
  const entry = entries.get(key)
  if (!entry) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs === 0) {
    entry.released = performance.now()
    schedule(key, entry)
    trim(entry.policy.group, entry.policy.spare)
  }
}

/** The resource under `key` if it exists, without keeping it alive. */
export function peek<T extends Disposable>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined
}

/** Use a shared resource for as long as the component is mounted. */
export function useShared<T extends Disposable>(key: string, create: () => T, policy: KeepPolicy): T {
  // The factory and policy are fixed per key; only the key decides identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => obtain(key, create, policy), [key])
  useEffect(() => {
    retain(key)
    return () => release(key)
  }, [key])
  return value
}

/** Hold a resource from outside React (the transition director). Returns the release. */
export function hold<T extends Disposable>(key: string, create: () => T, policy: KeepPolicy): [T, () => void] {
  const value = obtain(key, create, policy)
  retain(key)
  let held = true
  return [
    value,
    () => {
      if (held) release(key)
      held = false
    },
  ]
}
