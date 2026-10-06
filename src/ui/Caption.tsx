import { useEffect, useMemo } from 'react'
import { useVoid } from '../core/store.ts'
import { ascendTo } from '../scene/camera/transitions.ts'
import { holdInterface, readingTime } from './idle.ts'
import { placeAt } from './places.ts'

/**
 * Bottom left: where you are. The breadcrumb's ancestors make a quiet line (each one a way
 * back up), the current place is its large last item, and two or three plain sentences
 * describe it. Hidden while the camera travels; it returns once the camera has settled.
 */
export function Caption() {
  const path = useVoid((s) => s.path)
  const settled = useVoid((s) => s.transition.phase === 'idle')
  const place = useMemo(() => placeAt(path), [path])

  useEffect(() => {
    if (settled) holdInterface(readingTime(place.text))
  }, [settled, place])

  return (
    <section className="caption" data-shown={settled} aria-live="polite" aria-label="Where you are">
      <nav aria-label="Breadcrumb">
        <ol className="crumbs">
          {place.ancestors.map((ancestor) => (
            <li key={ancestor.path.join('/')} className="crumb">
              <button type="button" className="crumb-button" onClick={() => ascendTo(ancestor.path)}>
                {ancestor.name}
              </button>
            </li>
          ))}
          <li className="crumb-here" aria-current="location">
            {place.name}
          </li>
        </ol>
      </nav>
      <p className="caption-text">{place.text}</p>
    </section>
  )
}
