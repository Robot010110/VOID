import { Caption } from './Caption.tsx'
import { HoverMarker, Targets } from './Hover.tsx'
import { useIdle } from './idle.ts'

/** The interface: almost invisible, fading away when nothing is touched. */
export function Hud() {
  const idle = useIdle()
  return (
    <div className="hud" data-idle={idle}>
      <HoverMarker />
      <Caption />
      <Targets />
    </div>
  )
}
