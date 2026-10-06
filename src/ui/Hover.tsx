import { useEffect, useRef } from 'react'
import { useVoid } from '../core/store.ts'
import { getSystem } from '../core/universe.ts'
import { descend } from '../scene/camera/transitions.ts'
import { marker, pointer } from '../scene/stage.ts'
import { childName, KIND_WORDS } from './places.ts'

/**
 * The thin ring and soft name beside a hovered or focused world. Its place on screen is
 * written by the scene every frame; React only changes the name.
 */
export function HoverMarker() {
  const ref = useRef<HTMLDivElement>(null)
  const target = useVoid((s) => s.hoverTarget)
  const path = useVoid((s) => s.path)
  const name = target !== null ? childName(path, target) : ''

  useEffect(() => {
    marker.element = ref.current
    return () => {
      marker.element = null
    }
  }, [])

  return (
    <div ref={ref} className="marker" data-shown="false" aria-hidden="true">
      <span className="marker-ring" />
      <span className="marker-name">{name}</span>
    </div>
  )
}

/**
 * The worlds of the current system as a list of buttons, unseen but reachable with Tab:
 * focusing one rings it in the scene, Enter falls into it.
 */
export function Targets() {
  const path = useVoid((s) => s.path)
  const settled = useVoid((s) => s.transition.phase === 'idle')
  if (path.length !== 2) return null
  const system = getSystem(path[0]!, path[1]!)
  return (
    <nav className="visually-hidden" aria-label={`Worlds around ${system.star.name}`}>
      <ul>
        {system.planets.map((planet) => (
          <li key={planet.index}>
            <button
              type="button"
              disabled={!settled}
              onFocus={() => {
                pointer.hovering = false
                useVoid.getState().setHoverTarget(planet.index)
              }}
              onBlur={() => useVoid.getState().setHoverTarget(null)}
              onClick={() => descend(planet.index)}
            >
              {planet.name}, {KIND_WORDS[planet.kind]}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
