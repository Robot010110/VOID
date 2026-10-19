/**
 * A journey to any place: up a level at a time until the goal is below, then down a level at a
 * time into it, each flight at its usual pace and straight on from the last. The station's
 * `goto` flies this way. Escape ends a journey where it is.
 */
import { samePath, useVoid } from '../core/store.ts'
import type { Path } from '../core/universe.ts'
import { ascend, descend } from './camera/transitions.ts'

export const journey = {
  goal: null as Path | null,
  arrive: null as ((path: Path) => void) | null,
}

/** Set off for a place; `arrive` is called once there. */
export function journeyTo(goal: Path, arrive?: (path: Path) => void) {
  journey.goal = goal
  journey.arrive = arrive ?? null
}

export function endJourney() {
  journey.goal = null
  journey.arrive = null
}

/** One frame: once the last flight has landed, take the next. */
export function stepJourney() {
  const goal = journey.goal
  if (!goal) return
  const { transition, path, intro, secretScene } = useVoid.getState()
  if (intro !== 'done' || transition.phase !== 'idle' || secretScene !== null) return
  if (samePath(path, goal)) {
    const arrive = journey.arrive
    endJourney()
    arrive?.(path)
    return
  }
  const below = path.length < goal.length && samePath(goal.slice(0, path.length), path)
  if (below) descend(goal[path.length]!)
  else ascend()
}
