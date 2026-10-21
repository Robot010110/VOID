import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SHOT } from '../core/env.ts'
import { useVoid } from '../core/store.ts'
import { placeName } from '../secrets/terminal.ts'
import { film, filmReady, startFilm } from '../film/director.ts'
import { loadScore, scoreLoaded, startScore } from '../film/sound.ts'
import { COMPANY, CRUMBS, END, TITLES, type Title } from '../film/script.ts'
import { createGather, drawGather, type Gather } from '../film/gather.ts'
import { createBurst } from '../intro/particles.ts'
import { well } from '../scene/shared/well.ts'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const between = (t: number, from: number, seconds: number) => clamp01((t - from) / seconds)
const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x))

/** The light the cold open starts from, and the dark and flashes the film cuts under. */
function veilAt(t: number): { opacity: number; colour: string } {
  if (t < 4.3) return { opacity: 1 - easeInOut(between(t, 3.0, 1.3)), colour: '3 4 11' }
  // A cut into the galaxy under a flash of light; the spectrum's cuts each with a small one.
  const flash = (at: number, peak: number, decay: number) => (t >= at - 0.04 && t < at + decay ? peak * (1 - easeOut(between(t, at, decay))) : 0)
  const white = Math.max(flash(31.2, 0.92, 0.45), flash(32.0, 0.35, 0.16), flash(32.8, 0.35, 0.16), flash(33.6, 0.3, 0.16))
  if (white > 0) return { opacity: white, colour: '244 241 236' }
  // A dip to dark into the black hole, and the dark it falls into.
  if (t >= 38.95 && t < 39.75) return { opacity: t < 39.2 ? easeInOut(between(t, 38.95, 0.25)) : 1 - easeOut(between(t, 39.2, 0.55)), colour: '3 4 11' }
  if (t >= 42.55) return { opacity: easeInOut(between(t, 42.55, 0.5)), colour: '3 4 11' }
  return { opacity: 0, colour: '3 4 11' }
}

interface Painted {
  readonly title: Title
  readonly root: HTMLElement
  readonly parts: HTMLElement[]
}

/** A title's look at film second `t`. Every value comes from `t`: a render can be stepped exactly. */
function paintTitle({ title, root, parts }: Painted, t: number) {
  const { from, to, kind } = title
  const on = t >= from && t < to
  root.style.visibility = on ? 'visible' : 'hidden'
  if (!on) return
  const exit = kind === 'shout' ? 0.06 : kind === 'count' ? 0.45 : 0.55
  const leaving = between(t, to - exit, exit)
  const gap = title.lineGap ?? 0
  if (kind === 'whisper') {
    parts.forEach((letter, i) => {
      const p = easeOut(between(t, from + i * 0.07, 0.6))
      letter.style.opacity = String(p * (1 - leaving))
      letter.style.filter = `blur(${((1 - p) * 6 + leaving * 4).toFixed(2)}px)`
    })
    return
  }
  if (kind === 'count') {
    const [numeral, caption] = parts as [HTMLElement, HTMLElement]
    const roll = easeOutExpo(between(t, from + 0.1, 1.5))
    numeral.textContent = String(Math.max(1, Math.round(1 + (title.count! - 1) * roll)))
    const p = easeOut(between(t, from, 0.45))
    root.style.opacity = String(p * (1 - leaving))
    root.style.filter = `blur(${((1 - p) * 10 + leaving * 12).toFixed(2)}px)`
    root.style.transform = `scale(${(0.94 + 0.06 * easeOut(between(t, from, to - from)) + leaving * 0.08).toFixed(4)})`
    caption.style.opacity = String(easeOut(between(t, from + 0.5, 0.6)))
    return
  }
  if (kind === 'shout') {
    const p = easeOut(between(t, from, 0.2))
    root.style.opacity = String(between(t, from, 0.05) * (1 - leaving))
    root.style.transform = `scale(${(1.14 - 0.14 * p).toFixed(4)})`
    root.style.letterSpacing = `${(0.08 - 0.06 * p).toFixed(4)}em`
    return
  }
  if (kind === 'feature') {
    const [rule, text] = parts as [HTMLElement, HTMLElement]
    rule.style.transform = `scaleX(${easeOut(between(t, from, 0.5)).toFixed(4)})`
    const p = easeOut(between(t, from + 0.08, 0.55))
    text.style.transform = `translateY(${((1 - p) * 105 + leaving * 105).toFixed(2)}%)`
    root.style.opacity = String(1 - leaving)
    return
  }
  // A statement's words, or a fragment's lines, come up one after another.
  parts.forEach((part) => {
    const line = Number(part.dataset.line)
    const word = Number(part.dataset.word ?? 0)
    const start = from + line * gap + (kind === 'statement' ? word * 0.11 : 0)
    const p = easeOut(between(t, start, kind === 'fragment' ? 1.3 : 0.75))
    part.style.opacity = String(p * (1 - leaving))
    part.style.filter = `blur(${((1 - p) * (kind === 'fragment' ? 5 : 10) + leaving * 8).toFixed(2)}px)`
    part.style.transform = `translateY(${((1 - p) * 0.35 - leaving * 0.15).toFixed(3)}em)`
  })
}

/** Split a title into the parts its painter moves. */
function TitleView({ title, register }: { title: Title; register: (painted: Painted) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = root.current
    if (!element) return
    register({ title, root: element, parts: [...element.querySelectorAll<HTMLElement>('[data-part]')] })
  }, [title, register])

  const className = `film-title film-${title.kind}${title.low ? ' film-low' : ''}`
  if (title.kind === 'whisper') {
    return (
      <div ref={root} className={className}>
        {[...title.lines[0]!].map((letter, i) => (
          <span key={i} data-part>
            {letter}
          </span>
        ))}
      </div>
    )
  }
  if (title.kind === 'count') {
    return (
      <div ref={root} className={className}>
        <span className="film-numeral" data-part>
          1
        </span>
        <span className="film-count-line" data-part>
          {title.lines[0]}
        </span>
      </div>
    )
  }
  if (title.kind === 'shout') {
    return (
      <div ref={root} className={className} style={{ '--glow': title.colour } as CSSProperties}>
        {title.lines[0]}
      </div>
    )
  }
  if (title.kind === 'feature') {
    return (
      <div ref={root} className={className}>
        <span className="film-rule" data-part />
        <span className="film-feature-mask">
          <span className="film-feature-text" data-part>
            {title.lines[0]}
          </span>
        </span>
      </div>
    )
  }
  return (
    <div ref={root} className={className}>
      {title.lines.map((line, l) =>
        title.kind === 'fragment' ? (
          <span key={l} className="film-line" data-part data-line={l}>
            {line}
          </span>
        ) : (
          <span key={l} className="film-line">
            {line.split(' ').map((word, w) => (
              <span key={w} className="film-word" data-part data-line={l} data-word={w}>
                {word}
                {w < line.split(' ').length - 1 ? ' ' : ''}
              </span>
            ))}
          </span>
        ),
      )}
    </div>
  )
}

/**
 * The trailer's own layer, over the universe (`?film`): the dark it opens in and cuts through,
 * its words, the breadcrumb of the fall, and the end card, where stars stream together into the
 * company's name. Painted every frame from the film's clock alone. Live, a quiet gate waits for the
 * universe to be built, then for a press of Play (the music needs one).
 */
export function FilmOverlay() {
  const stage = useVoid((s) => s.film)
  const [ready, setReady] = useState(false)
  const titles = useRef<Painted[]>([])
  const veil = useRef<HTMLDivElement>(null)
  const point = useRef<HTMLDivElement>(null)
  const crumbs = useRef<HTMLDivElement>(null)
  const touch = useRef<HTMLDivElement>(null)
  const dust = useRef<HTMLCanvasElement>(null)
  const mark = useRef<HTMLParagraphElement>(null)
  const endLines = useRef<HTMLDivElement>(null)

  const register = (painted: Painted) => {
    titles.current = [...titles.current.filter((p) => p.title.id !== painted.title.id), painted]
  }

  // Live: fetch the music and wait until every place is built, then offer Play.
  useEffect(() => {
    if (SHOT || ready) return
    void loadScore()
    let frame = 0
    const watch = () => {
      if (filmReady() && scoreLoaded()) setReady(true)
      else frame = requestAnimationFrame(watch)
    }
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [ready])

  // The painter: every frame, from the film's clock.
  useEffect(() => {
    let frame = 0
    let gather: Gather | null = null
    let lastCrumbs = ''
    const paint = () => {
      frame = requestAnimationFrame(paint)
      const t = film.t
      const width = window.innerWidth
      const height = window.innerHeight

      const shade = veilAt(film.started ? t : 0)
      if (veil.current) {
        veil.current.style.opacity = String(shade.opacity)
        veil.current.style.backgroundColor = `rgb(${shade.colour})`
      }
      if (point.current) {
        const breath = 1 + 0.18 * Math.sin((film.started ? t : performance.now() / 1000) * 1.7)
        const swell = film.started ? 1 + 1.6 * easeInOut(between(t, 2.55, 0.5)) : 1
        point.current.style.opacity = String(film.started ? 1 - easeOut(between(t, 2.8, 0.5)) : 1)
        point.current.style.transform = `translate(-50%, -50%) scale(${(breath * swell).toFixed(4)})`
      }

      for (const painted of titles.current) paintTitle(painted, film.started ? t : -1)

      // Where gravity is being touched.
      if (touch.current) {
        touch.current.style.opacity = String(film.started && well.holding ? Math.min(1, well.strength * 1.1) * 0.85 : 0)
        touch.current.style.transform = `translate3d(${well.x.toFixed(1)}px, ${well.y.toFixed(1)}px, 0) scale(${(0.8 + 0.2 * well.strength).toFixed(3)})`
      }

      // The breadcrumb of the fall, a place at a time.
      const shown = film.started && t >= CRUMBS.from && t < CRUMBS.to
      if (crumbs.current) {
        const element = crumbs.current
        element.style.visibility = shown ? 'visible' : 'hidden'
        if (shown) {
          const path = useVoid.getState().path
          const names = ['Universe', ...path.map((_, i) => placeName(path.slice(0, i + 1)))]
          const key = names.join('/')
          if (key !== lastCrumbs) {
            lastCrumbs = key
            element.replaceChildren(
              ...names.map((name, i) => {
                const span = document.createElement('span')
                span.className = i === names.length - 1 ? 'film-crumb film-crumb-here' : 'film-crumb'
                span.textContent = name
                return span
              }),
            )
          }
          const leaving = between(t, CRUMBS.to - 0.6, 0.6)
          ;[...element.children].forEach((child, i) => {
            const at = film.reached[i] ?? t
            const p = easeOut(between(t, at, 0.6))
            ;(child as HTMLElement).style.opacity = String(p * (1 - leaving))
            ;(child as HTMLElement).style.transform = `translateX(${((1 - p) * -10).toFixed(2)}px)`
          })
        }
      }

      // The end card: stars gather into the wordmark; then its lines.
      const canvas = dust.current
      const letters = mark.current ? [...mark.current.querySelectorAll<HTMLElement>('span')] : []
      if (canvas && mark.current) {
        const ratio = window.devicePixelRatio || 1
        if (canvas.width !== Math.round(width * ratio)) {
          canvas.width = Math.round(width * ratio)
          canvas.height = Math.round(height * ratio)
        }
        const ending = film.started && t >= END.dark
        mark.current.style.visibility = ending ? 'visible' : 'hidden'
        if (ending && !gather && t >= END.gather - 0.3) gather = createGather(createBurst(letters, width < 700 ? 1500 : 2300, width, height), width, height)
        const ctx = canvas.getContext('2d')
        if (ctx && gather) {
          const progress = between(t, END.gather, END.gathered - END.gather)
          drawGather(gather, ctx, progress, ending ? 1 - between(t, END.gathered, 0.9) : 0, ratio)
        }
        const solid = easeOut(between(t, END.gathered - 0.45, 0.7))
        for (const letter of letters) letter.style.opacity = String(ending ? solid : 0)
      }
      if (endLines.current) {
        ;[...endLines.current.children].forEach((child, i) => {
          const p = easeOut(between(t, END.lines[i]!.at, 0.9))
          ;(child as HTMLElement).style.opacity = String(film.started ? p : 0)
          ;(child as HTMLElement).style.transform = `translateY(${((1 - p) * 8).toFixed(2)}px)`
        })
      }
    }
    frame = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(frame)
  }, [])

  const [starting, setStarting] = useState(false)
  const play = () => {
    if (starting) return
    setStarting(true)
    void startScore().then(startFilm)
  }

  return (
    <div className="film" data-stage={stage}>
      <div ref={veil} className="film-veil" />
      <div ref={point} className="film-point" />
      {TITLES.map((title) => (
        <TitleView key={title.id} title={title} register={register} />
      ))}
      <div ref={crumbs} className="film-crumbs" />
      <div ref={touch} className="film-touch" />
      <canvas ref={dust} className="film-dust" />
      <div className="film-end">
        <p ref={mark} className="film-wordmark">
          {[...COMPANY.name].map((letter, i) => (
            <span key={i}>{letter}</span>
          ))}
        </p>
        <div ref={endLines} className="film-end-lines">
          {END.lines.map((line) => (
            <p key={line.tone} className={`film-end-${line.tone}`}>
              {line.text}
            </p>
          ))}
        </div>
      </div>
      {!SHOT && stage === 'waiting' && (
        <div className="film-gate" data-starting={starting || undefined}>
          {ready ? (
            <>
              <button type="button" className="film-play" onClick={play} disabled={starting} autoFocus>
                Play
              </button>
              <p className="film-gate-line">Sound on.</p>
            </>
          ) : (
            <p className="visually-hidden" role="status">
              Loading.
            </p>
          )}
        </div>
      )}
      {!SHOT && stage === 'ended' && (
        <div className="film-after">
          <a className="film-again" href={`${window.location.pathname}?film`}>
            Play again
          </a>
          <a className="film-again" href={window.location.pathname}>
            Enter VOID
          </a>
        </div>
      )}
    </div>
  )
}
