import { useLayoutEffect, useRef } from 'react'
import { COMPANION_FRAGMENT } from '../content/secrets.ts'
import { SHOT } from '../core/env.ts'
import { companion } from '../scene/stage.ts'

/**
 * The words beside the new star that comes on a later day (scene/objects/Companion.tsx places
 * them). Like a world's fragments they are not interface, and stay while they are in view.
 */
export function CompanionWords() {
  const element = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    companion.element = element.current
    return () => {
      companion.element = null
    }
  }, [])
  return (
    <p ref={element} className="companion-words" data-shown="false" data-side="right" data-instant={!!SHOT} aria-hidden="true">
      {COMPANION_FRAGMENT.map((line) => (
        <span key={line} className="companion-line">
          {line}
        </span>
      ))}
    </p>
  )
}
