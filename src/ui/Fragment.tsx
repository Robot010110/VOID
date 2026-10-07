import { useEffect, useMemo, useRef, useState } from 'react'
import { anchorOf, type Anchor } from '../content/anchors.ts'
import { prefersReducedMotion, SHOT } from '../core/env.ts'
import { useVoid } from '../core/store.ts'
import { focus } from '../scene/stage.ts'

/**
 * A handcrafted world's fragments, set beside it once the camera has settled: line by line, in
 * Fraunces, never over the world itself. On a wide screen the fragments gather into a short
 * poem; on a narrow one each gives way to the next, and the last one stays. They leave with the
 * visitor. The words are also real text for screen readers, announced once they begin.
 */
export function Fragment() {
  const path = useVoid((s) => s.path)
  const settled = useVoid((s) => s.transition.phase === 'idle')
  const anchor = useMemo(() => anchorOf(path), [path])
  if (!anchor) return null
  return <Fragments key={anchor.id} anchor={anchor} settled={settled} />
}

/** Seconds before the first line once the camera has settled: the caption comes first. */
const FIRST_LINE = 1.8
/** Each line follows the last after a beat and the time it takes to read it. */
const lineGap = (previous: string) => 0.7 + previous.length * 0.045
/** A longer pause between fragments. */
const BETWEEN = 1.6
/** On a narrow screen, how long a fragment stays before the next takes its place. */
const holdFor = (lines: readonly string[]) => 2.5 + lines.join(' ').split(/\s+/).length * 0.32

/** Gutter from the screen's edges, the gap kept from the world, and the narrowest the words may
 * be set, CSS pixels. */
const GUTTER = 24
const GAP = 32
const MIN_WIDTH = 240

type Side = 'right' | 'left' | 'above'

function Fragments({ anchor, settled }: { anchor: Anchor; settled: boolean }) {
  const block = useRef<HTMLDivElement>(null)
  const total = anchor.fragments.reduce((sum, lines) => sum + lines.length, 0)
  // Lines shown so far, counted across all fragments, and which fragment leads.
  const [shown, setShown] = useState(SHOT ? total : 0)
  const [current, setCurrent] = useState(SHOT ? anchor.fragments.length - 1 : 0)
  const [poem] = useState(() => window.innerWidth >= 820 && window.innerWidth > window.innerHeight * 1.1)

  // The reveal, once the camera settles: line after line, fragment after fragment. Leaving
  // stops it where it is.
  useEffect(() => {
    if (!settled || SHOT) return
    const timers: number[] = []
    const reduced = prefersReducedMotion()
    let at = reduced ? 0.6 : FIRST_LINE
    let count = 0
    anchor.fragments.forEach((lines, f) => {
      if (f > 0) {
        at += BETWEEN + (poem ? 0 : holdFor(anchor.fragments[f - 1]!))
        const t = at
        timers.push(window.setTimeout(() => setCurrent(f), t * 1000))
      }
      for (const line of lines) {
        const t = at
        const n = ++count
        timers.push(window.setTimeout(() => setShown((was) => Math.max(was, n)), t * 1000))
        at += reduced ? 0.15 : lineGap(line)
      }
    })
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [settled, anchor, poem])

  // Placement beside the world, every frame and outside React: on the side away from the sun
  // where there is room, above the world on a tall screen, and hidden while nothing fits. The
  // block narrows to the room it has (long lines then hang); it is measured again only when
  // the world's place on screen, the window or the lines shown change.
  useEffect(() => {
    const element = block.current
    if (!element) return
    let frame = 0
    let side: Side | null = null
    let layout = ''
    let target: [number, number] = [0, 0]
    let x = 0
    let y = 0
    let last = performance.now()
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!focus.active) return
      const width = window.innerWidth
      const height = window.innerHeight
      // Measured again only when the world moves by a few pixels (not with the camera's drift).
      const key = [focus.x / 6, focus.y / 6, focus.radius / 6, width, height, Number(element.dataset.lines)].map(Math.round).join()
      if (key !== layout) {
        layout = key
        const caption = document.querySelector('.caption')?.getBoundingClientRect()
        const sunOnLeft = focus.sunAhead && focus.sunX < focus.x
        const order: Side[] = sunOnLeft ? ['right', 'left', 'above'] : ['left', 'right', 'above']
        if (side) order.unshift(side)
        side = null
        for (const candidate of order) {
          // Close up the world fills the screen: no side has room, and nothing need be measured.
          if (candidate === 'above' ? focus.y - focus.radius - GAP - GUTTER < 80 : roomOn(candidate, width) < MIN_WIDTH) continue
          element.style.maxWidth = `${Math.floor(roomOn(candidate, width))}px`
          const w = element.offsetWidth
          const h = element.offsetHeight
          const [left, top] = place(candidate, w, h)
          if (top < GUTTER || top + h > height - GUTTER || left < GUTTER || left + w > width - GUTTER) continue
          if (caption && caption.height > 0 && !(left > caption.right || left + w < caption.left || top > caption.bottom || top + h < caption.top)) continue
          side = candidate
          target = [left, top]
          break
        }
        element.dataset.room = side ? 'true' : 'false'
      }
      if (!side) return
      const ease = element.dataset.placed === 'true' ? 1 - Math.exp(-dt * 5) : 1
      x += (target[0] - x) * ease
      y += (target[1] - y) * ease
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      element.dataset.side = side
      element.dataset.placed = 'true'
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  let index = 0
  return (
    <>
      <div
        ref={block}
        className="fragment"
        data-poem={poem}
        data-leaving={!settled && shown > 0}
        data-instant={!!SHOT}
        data-lines={shown}
        aria-hidden="true"
      >
        {anchor.fragments.map((lines, f) => (
          <p key={f} className="fragment-stanza" data-current={poem || f === current}>
            {lines.map((line, l) => {
              const n = ++index
              return (
                <span key={l} className="fragment-line" data-shown={n <= shown}>
                  {line}
                </span>
              )
            })}
          </p>
        ))}
      </div>
      <section className="visually-hidden" aria-live="polite" aria-label="A fragment">
        {shown > 0 && anchor.fragments.map((lines, f) => <p key={f}>{lines.join(' ')}</p>)}
      </section>
    </>
  )
}

/** How wide the words may be on one side of the world in view. */
function roomOn(side: Side, width: number): number {
  const { x, radius } = focus
  if (side === 'right') return Math.min(MAX_WIDTH, width - GUTTER - (x + radius + GAP))
  if (side === 'left') return Math.min(MAX_WIDTH, x - radius - GAP - GUTTER)
  return Math.min(MAX_WIDTH, width - GUTTER * 2)
}

/** The widest the words are set: a little over the longest written line. */
const MAX_WIDTH = 520

/** Where the block's top left corner goes, beside or above the world in view. */
function place(side: Side, w: number, h: number): [number, number] {
  const { x, y, radius } = focus
  if (side === 'right') return [x + radius + GAP, y - h * 0.55]
  if (side === 'left') return [x - radius - GAP - w, y - h * 0.55]
  return [x - w / 2, y - radius - GAP - h]
}
