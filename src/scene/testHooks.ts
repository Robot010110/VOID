/**
 * Hooks for the screenshot script and for profiling (`?shot=` or `?debug` only): trigger
 * transitions and find targets on screen without simulating a hunt with the mouse.
 */
import { getUniverse } from '../core/cosmos.ts'
import { DEBUG, SHOT } from '../core/env.ts'
import { useVoid } from '../core/store.ts'
import { ascend, back, descend } from './camera/transitions.ts'
import { stepping, worldClock } from './shared/clock.ts'
import { levelRuntime } from './stage.ts'

export function installTestHooks() {
  if (!SHOT && !DEBUG) return
  ;(window as unknown as { __VOID__: unknown }).__VOID__ = {
    descend,
    ascend,
    back,
    /** Hold time still (true) or let it run (false). */
    hold: (on: boolean) => {
      stepping.manual = on
      stepping.frames = 0
    },
    /** While held, let time run for `frames` frames. */
    advance: (frames: number) => {
      stepping.frames += frames
    },
    /** Frames still to run from the last advance. */
    pending: () => stepping.frames,
    locate: (index: number) => levelRuntime(useVoid.getState().path).locate?.(index) ?? null,
    /** The black hole's index among the universe's children. */
    hole: () => getUniverse().hole.index,
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
