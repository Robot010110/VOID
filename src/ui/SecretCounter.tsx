import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useVoid } from '../core/store.ts'
import { foundCount, foundWords } from '../secrets/secrets.ts'

/** How long the count stays before it fades. */
const SHOWN_MS = 4200
/** Space kept between the count and the breadcrumb above which it sits, CSS pixels. */
const ABOVE = 12

/**
 * When a secret is found, for a moment, just above the breadcrumb: how many of the nine have
 * been found. Nothing else ever lists them.
 */
export function SecretCounter() {
  const count = useVoid((s) => foundCount(s.foundSecrets))
  const element = useRef<HTMLParagraphElement>(null)
  const seen = useRef(count)
  const [shown, setShown] = useState(false)
  const [words, setWords] = useState('')

  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count
      return
    }
    seen.current = count
    setWords(foundWords(count))
    setShown(true)
    const timer = window.setTimeout(() => setShown(false), SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [count])

  // Above the caption, wherever its text has left the breadcrumb today.
  useLayoutEffect(() => {
    const own = element.current
    if (!shown || !own) return
    const caption = document.querySelector('.crumbs')?.getBoundingClientRect()
    if (caption && caption.height > 0) own.style.bottom = `${Math.round(window.innerHeight - caption.top + ABOVE)}px`
    else own.style.removeProperty('bottom')
  }, [shown])

  return (
    <p ref={element} className="secret-count" data-shown={shown} role="status" aria-live="polite">
      {words}
    </p>
  )
}
