/**
 * The end card's stars: the wordmark's letters, sampled into specks (intro/particles.ts), each
 * speck sent out far across the screen and brought back, so that out of a scatter of stars the
 * name gathers. Each comes in on a gentle curve with a short trail, in its own time, brightening
 * as it settles. Seeded and given its progress, never a clock: every render draws the same.
 */
import { Rng, seedFromString } from '../core/rng.ts'
import type { Burst } from '../intro/particles.ts'

interface Mote {
  readonly fromX: number
  readonly fromY: number
  readonly toX: number
  readonly toY: number
  /** How far it bows off the straight line, and which way. */
  readonly bow: number
  /** When it sets out, as a share of the gathering, and how long it takes. */
  readonly delay: number
  readonly span: number
  readonly size: number
  readonly tint: number
}

export interface Gather {
  readonly motes: readonly Mote[]
}

const TINTS = ['#f4ebdd', '#ffd9b0', '#dcecf2'] as const

/** Send every speck of the letters out across the screen, for it to come back. */
export function createGather(burst: Burst, width: number, height: number): Gather {
  const rng = new Rng(seedFromString('VOID / the stars gather into its name'))
  const reach = Math.hypot(width, height) * 0.55
  const cx = width / 2
  const cy = height / 2
  const motes = burst.specks.map((speck) => {
    // Out along roughly the line from the centre through its letter, and on further.
    const angle = Math.atan2(speck.y - cy, speck.x - cx) + rng.gauss(0, 0.9)
    const distance = reach * (0.35 + 0.75 * rng.next() ** 0.7)
    return {
      fromX: speck.x + Math.cos(angle) * distance,
      fromY: speck.y + Math.sin(angle) * distance,
      toX: speck.x,
      toY: speck.y,
      bow: rng.range(-0.35, 0.35),
      delay: rng.next() ** 1.4 * 0.42,
      span: rng.range(0.45, 0.58),
      size: rng.range(0.9, 1.7),
      tint: rng.weighted([0, 1, 2], [70, 18, 12]),
    }
  })
  return { motes }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Where a mote is at its own progress `q` (0 to 1). */
function place(mote: Mote, q: number): [number, number] {
  const e = ease(q)
  const x = mote.fromX + (mote.toX - mote.fromX) * e
  const y = mote.fromY + (mote.toY - mote.fromY) * e
  // Bowed sideways, most in the middle of the way.
  const dx = mote.toX - mote.fromX
  const dy = mote.toY - mote.fromY
  const sway = Math.sin(Math.PI * e) * mote.bow
  return [x - dy * sway, y + dx * sway]
}

/**
 * Draw the gathering at `progress` (0: scattered, 1: in the letters), fading by `fade` once the
 * letters themselves have taken over.
 */
export function drawGather(gather: Gather, ctx: CanvasRenderingContext2D, progress: number, fade: number, pixelRatio: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (fade <= 0) return
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let tint = 0; tint < TINTS.length; tint++) {
    ctx.fillStyle = TINTS[tint]!
    ctx.strokeStyle = TINTS[tint]!
    for (const mote of gather.motes) {
      if (mote.tint !== tint) continue
      const q = clamp01((progress - mote.delay) / mote.span)
      const [x, y] = place(mote, q)
      // Faint far out, bright as it arrives.
      const alpha = fade * clamp01(q * 6) * (0.35 + 0.65 * q)
      if (alpha <= 0.01) continue
      if (q > 0 && q < 1) {
        const [px, py] = place(mote, Math.max(0, q - 0.018))
        ctx.globalAlpha = alpha * 0.3
        ctx.lineWidth = mote.size * 0.7
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      ctx.globalAlpha = alpha
      ctx.fillRect(x - mote.size / 2, y - mote.size / 2, mote.size, mote.size)
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
