import { useEffect } from 'react'
import { useVoid } from '../core/store.ts'
import { recovery } from '../scene/recovery.ts'
import { levelRuntime } from '../scene/stage.ts'

/**
 * While the graphics are lost and the scene starts again (scene/recovery.ts): the dark, and
 * the opening's point of light breathing in it. It lifts once the new canvas has drawn the
 * visitor's place, ready.
 */
export function Outage() {
  const outage = useVoid((s) => s.outage)

  useEffect(() => {
    if (!outage) return
    const lostIn = useVoid.getState().canvasEpoch
    let frame = 0
    const watch = () => {
      const { canvasEpoch, path, setOutage } = useVoid.getState()
      if (canvasEpoch > lostIn && recovery.readyEpoch === canvasEpoch && levelRuntime(path).ready) {
        setOutage(false)
        return
      }
      frame = requestAnimationFrame(watch)
    }
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [outage])

  return (
    <div className="outage" data-shown={outage} role="status" aria-live="polite">
      <span className="outage-point" aria-hidden="true" />
      <span className="visually-hidden">{outage ? 'The picture went out for a moment, and is coming back.' : ''}</span>
    </div>
  )
}
