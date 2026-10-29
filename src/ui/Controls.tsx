import { useEffect, useRef, useState } from 'react'
import { nextSpectrum, nextTimeStep, useVoid, type Spectrum, type TimeStep } from '../core/store.ts'
import { stepLabel } from '../core/time.ts'
import { ascend } from '../scene/camera/transitions.ts'
import { toggleHd } from './hd.ts'

/** A gentle wave while sound is on; the same line lying flat when it is off. */
const WAVE = 'M3 12 C 5.2 6.5, 8.3 6.5, 10.5 12 S 15.8 17.5, 18 12 S 20.4 9.4, 21 10'
const FLAT = 'M3 12 C 5.2 12, 8.3 12, 10.5 12 S 15.8 12, 18 12 S 20.4 12, 21 12'

/** Full quality: the letters HD, drawn in the same line. */
const HD = 'M3.5 7.5 V16.5 M3.5 12 H9.5 M9.5 7.5 V16.5 M13 7.5 V16.5 H15.5 A 4.5 4.5 0 0 0 15.5 7.5 Z'

/**
 * Time is a world on its orbit: still when paused, trailing an arc as long as its pace. The
 * orbit is drawn anticlockwise from the world, so the trail runs behind it.
 */
const ORBIT = 'M17.66 6.34 A 8 8 0 1 0 17.66 17.66 A 8 8 0 0 0 17.66 6.34'
const TRAIL: Record<TimeStep, number> = { 0: 0, 1: 6, 100: 18, 10000: 38 }

/** Seeing by heat or by radio: a point that radiates further, one ring, then two. */
const RINGS: Record<Spectrum, number> = { visible: 0, infrared: 1, radio: 2 }
const SPECTRUM_WORDS: Record<Spectrum, string> = { visible: 'Visible light', infrared: 'Infrared', radio: 'Radio' }

const TIME_WORDS: Record<TimeStep, string> = { 0: 'Paused', 1: 'Time as it is', 100: '100 times faster', 10000: '10,000 times faster' }

const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/** A word beside the controls for a moment after one changes, so a glyph is never a puzzle. */
function useAnnouncement(): [string, (words: string) => void] {
  const [words, setWords] = useState('')
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const say = (next: string) => {
    window.clearTimeout(timer.current)
    setWords(next)
    timer.current = window.setTimeout(() => setWords(''), 1800)
  }
  return [words, say]
}

/**
 * Top right: the few controls VOID has, drawn as single lines (time, what the eye sees by,
 * sound, full quality). On a touch screen, top left, a way up a level. Their keys work
 * anywhere: T, S, M, H.
 */
export function Controls() {
  const enabled = useVoid((s) => s.audioEnabled)
  const timeStep = useVoid((s) => s.timeStep)
  const spectrum = useVoid((s) => s.spectrum)
  const canRise = useVoid((s) => s.path.length > 0 && s.transition.phase === 'idle')
  const hd = useVoid((s) => s.quality === 'ultra')
  const [words, say] = useAnnouncement()
  const seen = useRef({ timeStep, spectrum })

  // Announce changes however they were made (a control or a key), never the values found.
  useEffect(() => {
    if (seen.current.timeStep === timeStep) return
    seen.current.timeStep = timeStep
    say(TIME_WORDS[timeStep])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeStep])
  useEffect(() => {
    if (seen.current.spectrum === spectrum) return
    seen.current.spectrum = spectrum
    say(SPECTRUM_WORDS[spectrum])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectrum])

  const rings = RINGS[spectrum]
  return (
    <>
      <div className="controls">
        <p className="control-words" role="status" data-shown={words !== ''}>
          {words}
        </p>
        <button
          type="button"
          className="control"
          aria-label={stepLabel(timeStep)}
          aria-keyshortcuts="T"
          onClick={() => useVoid.getState().setTimeStep(nextTimeStep(timeStep))}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path className="control-faint" d={ORBIT} />
            <path className="control-line control-trail" d={ORBIT} style={{ strokeDasharray: `${TRAIL[timeStep]} 60` }} />
            <circle className="control-dot" cx="17.66" cy="6.34" r="1.7" />
          </svg>
        </button>
        <button
          type="button"
          className="control"
          aria-label={`Seeing by ${SPECTRUM_WORDS[spectrum].toLowerCase()}`}
          aria-keyshortcuts="S"
          onClick={() => useVoid.getState().setSpectrum(nextSpectrum(spectrum))}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <circle className="control-line" cx="12" cy="12" r="2.2" />
            <path className="control-line control-ring" data-on={rings >= 1} d="M7.8 8.2 A 5.6 5.6 0 0 0 7.8 15.8 M16.2 8.2 A 5.6 5.6 0 0 1 16.2 15.8" />
            <path className="control-line control-ring" data-on={rings >= 2} d="M5 5.4 A 9.2 9.2 0 0 0 5 18.6 M19 5.4 A 9.2 9.2 0 0 1 19 18.6" />
          </svg>
        </button>
        <button
          type="button"
          className="control"
          aria-label="Sound"
          aria-pressed={enabled}
          aria-keyshortcuts="M"
          onClick={() => useVoid.getState().setAudioEnabled(!enabled)}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path className="control-line" d={enabled ? WAVE : FLAT} />
          </svg>
        </button>
        <button type="button" className="control" aria-label="Full quality" aria-pressed={hd} aria-keyshortcuts="H" onClick={toggleHd}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path className="control-line" d={HD} />
          </svg>
        </button>
      </div>
      {touch && canRise && (
        <div className="controls controls-up">
          <button type="button" className="control" aria-label="Up a level" onClick={() => ascend()}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path className="control-line" d="M7 14.5 L12 9.5 L17 14.5" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}
