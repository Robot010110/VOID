import { useEffect } from 'react'
import { prefersReducedMotion, SHOT } from '../core/env.ts'
import { nextSpectrum, nextTimeStep, useVoid } from '../core/store.ts'
import { beginDrift, endDrift } from '../scene/drift.ts'
import { journey } from '../scene/journey.ts'
import { findSecret, KeyTrail } from '../secrets/secrets.ts'
import { edge, sing } from '../secrets/sequences.ts'

/** Without input this long, VOID begins to drift on its own. */
const IDLE_DRIFT_MS = 60_000
/** A pointer must travel this far to wake VOID from drifting (CSS pixels): a desk is not still. */
const WAKE_TRAVEL = 6

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}

/** Whether VOID may begin drifting by itself now. */
function mayDrift(): boolean {
  const s = useVoid.getState()
  return (
    !SHOT &&
    !prefersReducedMotion() &&
    document.visibilityState === 'visible' &&
    s.intro === 'done' &&
    !s.driftMode &&
    s.sketch === null &&
    s.naming === null &&
    s.transition.phase === 'idle' &&
    s.secretScene === null &&
    !s.terminalOpen &&
    journey.goal === null &&
    edge.fade === 0
  )
}

/** The riddle's word, typed: the listening station opens. */
function openStation() {
  const { terminalOpen, setTerminalOpen } = useVoid.getState()
  if (terminalOpen) return
  setTerminalOpen(true)
  findSecret('door')
}

/**
 * The keys (T for time, S for what the eye sees by, D to drift), and drift mode's coming and
 * going: it begins after a minute without input (not for a visitor who prefers reduced
 * motion), and any input ends it. The input that ends it does nothing else. Two sequences of
 * keys are listened for as well (see secrets/secrets.ts); while the word is being typed, the
 * letters it shares with the keys above do only that.
 */
export function Shortcuts() {
  useEffect(() => {
    const trail = new KeyTrail()
    let idle = 0
    let origin: { x: number; y: number } | null = null
    const restart = () => {
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        if (mayDrift()) beginDrift()
        else restart()
      }, IDLE_DRIFT_MS)
    }

    /** Ends a drift with this input, and keeps the input from doing anything else. */
    const wake = (event: Event): boolean => {
      restart()
      if (!useVoid.getState().driftMode) return false
      endDrift()
      origin = null
      event.preventDefault()
      event.stopImmediatePropagation()
      return true
    }

    const onKey = (event: KeyboardEvent) => {
      if (wake(event)) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTyping(event.target)) return
      const state = useVoid.getState()
      if (state.secretScene !== null || state.terminalOpen) return
      const heard = trail.press(event.key, event.timeStamp)
      if (heard.oldCode) sing()
      if (heard.door) {
        event.preventDefault()
        openStation()
        return
      }
      if (heard.consumed) return
      const key = event.key.toLowerCase()
      if (key === 't') state.setTimeStep(nextTimeStep(state.timeStep))
      else if (key === 's') state.setSpectrum(nextSpectrum(state.spectrum))
      else if (key === 'd' && state.sketch === null) beginDrift()
    }
    const onPress = (event: Event) => {
      wake(event)
    }
    const onMove = (event: PointerEvent) => {
      if (!useVoid.getState().driftMode) {
        restart()
        return
      }
      origin ??= { x: event.clientX, y: event.clientY }
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > WAKE_TRAVEL) wake(event)
    }

    const options = { capture: true }
    window.addEventListener('keydown', onKey, options)
    window.addEventListener('pointerdown', onPress, options)
    window.addEventListener('wheel', onPress, { capture: true, passive: false })
    window.addEventListener('touchstart', onPress, options)
    window.addEventListener('pointermove', onMove, options)
    const unsubscribe = useVoid.subscribe(
      (s) => s.driftMode,
      (drifting) => {
        document.documentElement.dataset.drift = String(drifting)
        if (!drifting) restart()
      },
    )
    restart()
    return () => {
      window.clearTimeout(idle)
      window.removeEventListener('keydown', onKey, options)
      window.removeEventListener('pointerdown', onPress, options)
      window.removeEventListener('wheel', onPress, options)
      window.removeEventListener('touchstart', onPress, options)
      window.removeEventListener('pointermove', onMove, options)
      unsubscribe()
      delete document.documentElement.dataset.drift
    }
  }, [])
  return null
}
