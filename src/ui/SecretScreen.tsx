import { useLayoutEffect, useRef } from 'react'
import { secretScreen } from '../secrets/sequences.ts'

/**
 * The secrets' own layer over the scene: a veil (the dark inside the black hole and past the
 * edge, the light of the signal) and the few words that wait in it. The scene writes both every
 * frame (secrets/sequences.ts); the words are also announced to screen readers.
 */
export function SecretScreen() {
  const veil = useRef<HTMLDivElement>(null)
  const words = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    secretScreen.veil = veil.current
    secretScreen.words = words.current
    return () => {
      secretScreen.veil = null
      secretScreen.words = null
    }
  }, [])
  return (
    <>
      <div ref={veil} className="secret-veil" aria-hidden="true" />
      <p ref={words} className="secret-words" role="status" aria-live="polite" />
    </>
  )
}
