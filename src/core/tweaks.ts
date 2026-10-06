/**
 * A tiny registry of tunable parameters. Components describe their parameters here (the
 * schema's values are the production values) and apply changes to their own uniforms.
 * The leva panel in src/debug reads this registry, so leva is only ever loaded with
 * ?debug and never enters the main bundle.
 */
import { useEffect } from 'react'
import { DEBUG } from './env.ts'

export interface NumberTweak {
  value: number
  min: number
  max: number
  step?: number
}
export interface BooleanTweak {
  value: boolean
}
export interface ColorTweak {
  value: string
  color: true
}
export interface OptionTweak {
  value: string
  options: readonly string[]
}
export type Tweak = NumberTweak | BooleanTweak | ColorTweak | OptionTweak
export type TweakSchema = Record<string, Tweak>
export type TweakValue = number | boolean | string

export interface TweakFolder {
  readonly id: string
  readonly schema: TweakSchema
  readonly apply: (key: string, value: TweakValue) => void
}

const folders = new Map<string, TweakFolder>()
const listeners = new Set<() => void>()
let snapshot: readonly TweakFolder[] = []

function emit() {
  snapshot = [...folders.values()]
  for (const listener of listeners) listener()
}

export function registerTweaks(folder: TweakFolder): () => void {
  folders.set(folder.id, folder)
  emit()
  return () => {
    if (folders.get(folder.id) === folder) {
      folders.delete(folder.id)
      emit()
    }
  }
}

export function subscribeTweaks(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTweakFolders(): readonly TweakFolder[] {
  return snapshot
}

/** Expose a component's parameters to the debug panel while it is mounted (debug only). */
export function useTweaks(
  id: string,
  schema: TweakSchema,
  apply: (key: string, value: TweakValue) => void,
): void {
  useEffect(() => {
    if (!DEBUG) return
    return registerTweaks({ id, schema, apply })
  }, [id, schema, apply])
}

/** Read the production value of a numeric tweak. */
export function num(schema: TweakSchema, key: string): number {
  const tweak = schema[key]
  if (!tweak || typeof tweak.value !== 'number') throw new Error(`Tweak ${key} is not a number`)
  return tweak.value
}
