import { useEffect, useRef } from 'react'
import { useVoid } from '../core/store.ts'
import { beginOpening, opening } from '../intro/opening.ts'

const WORDMARK = ['V', 'O', 'I', 'D']

/** The fonts the title is set in, and every caption after it. */
const FONTS = ['300 1em "Fraunces Variable"', '300 1em "Hanken Grotesk"', '400 1em "Hanken Grotesk"']

/**
 * The opening's own layer, above the canvas: the dark, the point of light, the wordmark, one
 * line and the Enter button; then the dust the wordmark becomes. The scene drives its fades
 * frame by frame once Enter is pressed (intro/opening.ts); before that, CSS does.
 */
export function Intro() {
  const stage = useVoid((s) => s.intro)
  const backdrop = useRef<HTMLDivElement>(null)
  const light = useRef<HTMLDivElement>(null)
  const dust = useRef<HTMLCanvasElement>(null)
  const letters = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    opening.dom.backdrop = backdrop.current
    opening.dom.light = light.current
    opening.dom.dust = dust.current
    opening.dom.letters = letters.current.filter((l): l is HTMLSpanElement => l !== null)

    let live = true
    void Promise.all(FONTS.map((font) => document.fonts.load(font)))
      .catch(() => undefined)
      .then(() => document.fonts.ready)
      .finally(() => {
        if (live) opening.fontsReady = true
      })
    // Fetch the sound now, so Enter can start it at once; it stays silent until then.
    import('../audio/engine.ts')
      .then((module) => {
        opening.sound = module
      })
      .catch(() => undefined)
      .finally(() => {
        opening.soundReady = true
      })

    const size = () => {
      const canvas = dust.current
      if (!canvas) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(window.innerWidth * ratio)
      canvas.height = Math.round(window.innerHeight * ratio)
    }
    size()
    window.addEventListener('resize', size)

    // Enter (or the space bar) anywhere on the title starts it, as the button does.
    const onKey = (event: KeyboardEvent) => {
      if (useVoid.getState().intro !== 'title' || event.repeat) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      beginOpening(true)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      live = false
      window.removeEventListener('resize', size)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  if (opening.mode === 'none' || stage === 'done') return null
  return (
    <div className="intro" data-stage={stage} data-mode={opening.mode}>
      <div ref={backdrop} className="intro-backdrop" />
      <div ref={light} className="intro-light" aria-hidden="true">
        <span className="intro-glow" />
        <span className="intro-point" />
      </div>
      <canvas ref={dust} className="intro-dust" aria-hidden="true" />
      <p className="intro-wordmark" aria-hidden="true">
        {WORDMARK.map((letter, i) => (
          <span
            key={letter}
            ref={(element) => {
              letters.current[i] = element
            }}
          >
            {letter}
          </span>
        ))}
      </p>
      <div className="intro-below">
        <p className="intro-line">Sound on. Take your time.</p>
        <button
          type="button"
          className="intro-enter"
          disabled={stage !== 'title'}
          onClick={() => beginOpening(true)}
        >
          Enter
        </button>
      </div>
      <p className="visually-hidden" role="status">
        {stage === 'loading' ? 'Loading the universe.' : ''}
      </p>
    </div>
  )
}
