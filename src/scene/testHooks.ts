/**
 * Hooks for the screenshot script and for profiling (`?shot=` or `?debug` only): trigger
 * transitions and find targets on screen without simulating a hunt with the mouse.
 */
import { DEBUG, SHOT } from '../core/env.ts'
import { useVoid } from '../core/store.ts'
import { ascend, back, descend } from './camera/transitions.ts'
import { worldClock } from './shared/clock.ts'
import { levelRuntime } from './stage.ts'

export function installTestHooks() {
  if (!SHOT && !DEBUG) return
  ;(window as unknown as { __VOID__: unknown }).__VOID__ = {
    descend,
    ascend,
    back,
    locate: (index: number) => levelRuntime(useVoid.getState().path).locate?.(index) ?? null,
    state: () => {
      const { path, level, transition, hoverTarget } = useVoid.getState()
      return {
        path,
        level,
        phase: transition.phase,
        hoverTarget,
        ready: levelRuntime(path).ready,
        real: Number(worldClock.real.toFixed(3)),
      }
    },
  }
}
