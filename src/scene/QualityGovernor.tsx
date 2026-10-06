import { PerformanceMonitor } from '@react-three/drei'
import { useCallback, useRef } from 'react'
import { stepTier } from '../core/quality.ts'
import { useVoid } from '../core/store.ts'

/** Ignore the first seconds: shader compilation and the band bake skew frame times. */
const WARMUP_MS = 3500
/** Minimum time between tier changes. Stepping up waits longer than stepping down. */
const DOWN_COOLDOWN_MS = 2500
const UP_COOLDOWN_MS = 9000

/**
 * Steps the quality tier down when frames drop and back up when there is headroom.
 * Hysteresis comes from three places: separate decline and incline thresholds, a longer
 * cool-down before stepping up, and a lock after three flip-flops.
 */
export function QualityGovernor() {
  const locked = useVoid((s) => s.qualityLocked)
  const mounted = useRef<number | null>(null)
  const lastChange = useRef(0)

  const change = useCallback((direction: -1 | 1) => {
    const now = performance.now()
    mounted.current ??= now
    if (now - mounted.current < WARMUP_MS) return
    if (now - lastChange.current < (direction < 0 ? DOWN_COOLDOWN_MS : UP_COOLDOWN_MS)) return
    const { quality, setQuality } = useVoid.getState()
    const next = stepTier(quality, direction)
    if (next === quality) return
    lastChange.current = now
    setQuality(next)
  }, [])

  const onDecline = useCallback(() => change(-1), [change])
  const onIncline = useCallback(() => change(1), [change])
  const onFallback = useCallback(() => useVoid.getState().lockQuality(), [])
  const bounds = useCallback((refreshRate: number): [number, number] => {
    return [Math.min(refreshRate * 0.75, 50), Math.min(refreshRate * 0.95, 100)]
  }, [])

  if (locked) return null
  return (
    <PerformanceMonitor
      ms={300}
      iterations={10}
      threshold={0.8}
      flipflops={3}
      bounds={bounds}
      onDecline={onDecline}
      onIncline={onIncline}
      onFallback={onFallback}
    />
  )
}
