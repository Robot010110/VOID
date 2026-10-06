/**
 * The interface fades away after 4 seconds without input and comes back on any input. A new
 * place's description holds it a little longer, long enough to be read.
 */
import { useEffect, useState } from 'react'
import { SHOT } from '../core/env.ts'

const IDLE_MS = 4000
let holdUntil = 0

/** Keep the interface up for at least `ms` from now. */
export function holdInterface(ms: number) {
  holdUntil = Math.max(holdUntil, performance.now() + ms)
}

/** Reading time for a short text: a moment to notice it, then about 0.3 s a word. */
export function readingTime(text: string): number {
  return 1500 + text.split(/\s+/).length * 300
}

const WAKE_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart', 'focusin'] as const

export function useIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (SHOT) return
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      const wait = Math.max(IDLE_MS, holdUntil - performance.now())
      timer = window.setTimeout(() => {
        if (performance.now() < holdUntil) schedule()
        else setIdle(true)
      }, wait)
    }
    const wake = () => {
      setIdle(false)
      schedule()
    }
    for (const type of WAKE_EVENTS) window.addEventListener(type, wake, { passive: true })
    schedule()
    return () => {
      window.clearTimeout(timer)
      for (const type of WAKE_EVENTS) window.removeEventListener(type, wake)
    }
  }, [])
  return idle
}
