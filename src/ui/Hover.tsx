import { useEffect, useMemo, useRef } from 'react'
import { galacticPosition, getGalaxy, type GalaxyData } from '../core/galaxy.ts'
import { useVoid } from '../core/store.ts'
import { getSystem, HOME } from '../core/universe.ts'
import { descend } from '../scene/camera/transitions.ts'
import { marker, pointer } from '../scene/stage.ts'
import { childName, KIND_WORDS, starWords } from './places.ts'

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

function focusTarget(index: number) {
  pointer.hovering = false
  useVoid.getState().setHoverTarget(index)
}

function blurTarget() {
  useVoid.getState().setHoverTarget(null)
}

/**
 * A galaxy's notable stars (the home star and its brightest named stars) for the keyboard:
 * a few hundred stops would be a chore, and every other star is a pointer's reach away. They
 * come in order around the galaxy, starting from home.
 */
function GalaxyTargets({ galaxy, settled }: { galaxy: GalaxyData; settled: boolean }) {
  const stars = useMemo(() => {
    const angle = (index: number) => {
      const [x, , z] = galacticPosition(galaxy, galaxy.stars[index]!.orbit, 0)
      return Math.atan2(-z, x)
    }
    const start = galaxy.stars[HOME[1]!]?.notable ? angle(HOME[1]!) : 0
    const around = (index: number) => (((angle(index) - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    return galaxy.stars.filter((s) => s.notable).sort((a, b) => around(a.index) - around(b.index))
  }, [galaxy])
  return (
    <nav className="visually-hidden" aria-label={`Stars of ${galaxy.name}`}>
      <ul>
        {stars.map(({ index, star }) => (
          <li key={index}>
            <button
              type="button"
              disabled={!settled}
              onFocus={() => focusTarget(index)}
              onBlur={blurTarget}
              onClick={() => descend(index)}
            >
              {star.name}, {starWords(star.temperature)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * What can be fallen into from here, as a list of buttons, unseen but reachable with Tab:
 * focusing one rings it in the scene, Enter falls into it.
 */
export function Targets() {
  const path = useVoid((s) => s.path)
  const settled = useVoid((s) => s.transition.phase === 'idle')
  if (path.length === 1) return <GalaxyTargets galaxy={getGalaxy(path[0]!)} settled={settled} />
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
              onFocus={() => focusTarget(planet.index)}
              onBlur={blurTarget}
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
