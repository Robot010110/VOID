/**
 * Drift mode: the camera tours the handcrafted worlds on its own, for a screen left to itself
 * or shown to a room. It rises and falls a level at a time, more slowly than a visitor's falls,
 * pausing a few seconds at each level on the way and lingering at each world long enough to
 * read what is written there. The black hole is one stop of the tour. Any input ends it
 * (see ui/Shortcuts.tsx), where the camera then is.
 */
import { samePath, useVoid } from '../core/store.ts'
import { planTour } from '../core/tour.ts'
import { levelOf, type Level, type Path } from '../core/universe.ts'
import { ascend, descend, paced, usualSeconds } from './camera/transitions.ts'

/** Seconds at a stop of the tour, by the kind of place it is. */
const LINGER: Record<Level, number> = { universe: 8, hole: 12, galaxy: 8, system: 8, planet: 24 }
/** Seconds at a place passed through on the way. */
const PASSING: Record<Level, number> = { universe: 4.5, hole: 4, galaxy: 4.5, system: 4, planet: 4 }
/** Falls and rises take this much longer than a visitor's. */
const PACE = 1.7

export const drift = {
  stops: [] as Path[],
  next: 0,
  waited: 0,
}

export function beginDrift() {
  const { path, transition, setDriftMode } = useVoid.getState()
  if (transition.phase !== 'idle') return
  drift.stops = planTour(path)
  drift.next = 0
  drift.waited = 0
  setDriftMode(true)
}

export function endDrift() {
  useVoid.getState().setDriftMode(false)
}

/** One frame of the tour: wait out the pause here, then rise or fall a level towards the next stop. */
export function stepDrift(seconds: number) {
  const { driftMode, transition, path, intro } = useVoid.getState()
  if (!driftMode || intro !== 'done' || drift.stops.length === 0) return
  if (transition.phase !== 'idle') {
    drift.waited = 0
    return
  }
  const goal = drift.stops[drift.next % drift.stops.length]!
  const level = levelOf(path)
  const arrived = samePath(path, goal)
  drift.waited += seconds
  if (drift.waited < (arrived ? LINGER : PASSING)[level]) return
  drift.waited = 0
  if (arrived) {
    drift.next++
    return
  }
  const below = path.length < goal.length && samePath(goal.slice(0, path.length), path)
  if (below) {
    const into = goal.slice(0, path.length + 1)
    descend(goal[path.length]!, usualSeconds('down', levelOf(into)) * PACE)
  } else {
    ascend(paced(usualSeconds('up', levelOf(path.slice(0, -1))) * PACE))
  }
}
