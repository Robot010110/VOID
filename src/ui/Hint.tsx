import { useEffect, useState } from 'react'
import { writeFlag } from '../core/persist.ts'

/** Fade in, hold, fade out (milliseconds). */
const IN = 1100
const HOLD = 4000
const OUT = 1400

const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * The one instruction VOID ever gives, once, on a first visit, after the opening has shown
 * what falling looks like: how to fall into something yourself. Then it is gone for good.
 */
export function Hint({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    writeFlag('hint', true)
    const show = window.setTimeout(() => setShown(true), 60)
    const hide = window.setTimeout(() => setShown(false), 60 + IN + HOLD)
    const done = window.setTimeout(onDone, 60 + IN + HOLD + OUT)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
      window.clearTimeout(done)
    }
  }, [onDone])
  return (
    <p className="hint" data-shown={shown} role="status">
      {touch ? 'Tap to fall into anything' : 'Scroll to fall into anything'}
    </p>
  )
}
