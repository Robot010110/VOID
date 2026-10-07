import { Caption } from './Caption.tsx'
import { Fragment } from './Fragment.tsx'
import { HoverMarker, Targets } from './Hover.tsx'
import { useIdle } from './idle.ts'

/**
 * The interface: almost invisible, fading away when nothing is touched. A world's fragments
 * are not interface: they stay while they are read.
 */
export function Hud() {
  const idle = useIdle()
  return (
    <>
      <div className="hud" data-idle={idle}>
        <HoverMarker />
        <Caption />
        <Targets />
      </div>
      <Fragment />
    </>
  )
}
