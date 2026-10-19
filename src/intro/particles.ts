/**
 * The wordmark becoming stars. On Enter its letters are drawn once into an offscreen canvas,
 * exactly where they stand on the page, and sampled into specks of light. The page's own
 * letters fade as the specks take their place; then the specks drift outward from the centre,
 * slowing as they go. Most dim away; a few linger as single points of light, twinkling, until
 * the real sky has come up behind them.
 *
 * Time is passed in, never read from a clock, so a screenshot run steps it exactly; and the
 * randomness is seeded, so every run draws the same dust.
 */
import { Rng, seedFromString } from '../core/rng.ts'

interface Speck {
  x: number
  y: number
  vx: number
  vy: number
  /** When it lets go of its letter, seconds after Enter. */
  delay: number
  /** When it has faded, seconds after letting go. */
  life: number
  size: number
  /** One of the few that linger as stars. */
  star: boolean
  twinkle: number
  /** Warm or cool, a little, as stars are. */
  tint: 0 | 1 | 2
}

export interface Burst {
  readonly specks: Speck[]
  readonly width: number
  readonly height: number
}

/** When the last speck has gone, seconds after Enter. */
export const BURST_END = 4.8
/** How long the page's letters take to hand over to the specks. */
export const HANDOVER = 0.35
/** How long the drift takes to slow (seconds): it eases out, never stops dead. */
const DRIFT_EASE = 2.2

const TINTS = ['#f4ebdd', '#ffd9b0', '#dcecf2'] as const

/**
 * Sample the letters (elements holding one letter each, on screen) into specks. `target` is
 * roughly how many: the sampling grid is sized to the ink to land near it.
 */
export function createBurst(letters: readonly HTMLElement[], target: number, width: number, height: number): Burst {
  const rng = new Rng(seedFromString('VOID / the wordmark lets go'))
  const specks: Speck[] = []
  if (letters.length === 0) return { specks, width, height }

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { specks, width, height }
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const boxes = letters.map((letter) => letter.getBoundingClientRect())
  for (const [i, letter] of letters.entries()) {
    const style = getComputedStyle(letter)
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const metrics = ctx.measureText(letter.textContent ?? '')
    // An inline box is its font's content area: the baseline sits the font's ascent below its top.
    ctx.fillText(letter.textContent ?? '', boxes[i]!.left, boxes[i]!.top + metrics.fontBoundingBoxAscent)
  }

  const left = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.left)) * scale))
  const top = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.top)) * scale))
  const right = Math.min(canvas.width, Math.ceil(Math.max(...boxes.map((b) => b.right)) * scale))
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...boxes.map((b) => b.bottom)) * scale))
  if (right <= left || bottom <= top) return { specks, width, height }
  const pixels = ctx.getImageData(left, top, right - left, bottom - top)
  const span = right - left

  let ink = 0
  for (let i = 3; i < pixels.data.length; i += 4) ink += pixels.data[i]! / 255
  const step = Math.max(1, Math.sqrt(ink / Math.max(1, target)))

  const cx = width / 2
  const cy = height / 2
  // Which letter a point belongs to: the middle ones let go first.
  const order = boxes.map((b) => Math.abs((b.left + b.right) / 2 - cx))
  const rank = order.map((d) => order.filter((other) => other < d).length)
  for (let y = 0; y < bottom - top; y += step) {
    for (let x = 0; x < span; x += step) {
      const jx = x + rng.range(0, step)
      const jy = y + rng.range(0, step)
      const alpha = pixels.data[(Math.floor(jy) * span + Math.floor(jx)) * 4 + 3] ?? 0
      if (alpha < 90) continue
      const px = (left + jx) / scale
      const py = (top + jy) / scale
      const letter = Math.max(0, boxes.findIndex((b) => px <= b.right))
      const dx = px - cx
      const dy = py - cy
      const away = Math.hypot(dx, dy) || 1
      const speed = rng.range(26, 80) * (0.6 + Math.min(1, away / 300))
      const swirl = rng.range(-6, 6)
      const star = rng.chance(0.07)
      specks.push({
        x: px,
        y: py,
        vx: (dx / away) * speed - (dy / away) * swirl,
        vy: (dy / away) * speed + (dx / away) * swirl,
        delay: (rank[letter] ?? 0) * 0.07 + rng.range(0, 0.18),
        life: star ? rng.range(2.2, 3.4) : rng.range(0.7, 1.7),
        size: star ? rng.range(1.2, 1.7) : rng.range(0.9, 1.5),
        star,
        twinkle: rng.range(0, Math.PI * 2),
        tint: star ? (rng.int(0, 2) as 0 | 1 | 2) : 0,
      })
    }
  }
  return { specks, width, height }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Draw the burst `t` seconds after Enter onto a canvas the size of the screen. */
export function drawBurst(burst: Burst, ctx: CanvasRenderingContext2D, t: number, pixelRatio: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  if (t >= BURST_END) return
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  const arrive = smooth(0, HANDOVER, t)
  for (let tint = 0; tint < TINTS.length; tint++) {
    ctx.fillStyle = TINTS[tint]!
    for (const speck of burst.specks) {
      if (speck.tint !== tint) continue
      const local = Math.max(0, t - speck.delay)
      const drift = DRIFT_EASE * (1 - Math.exp(-local / DRIFT_EASE))
      const x = speck.x + speck.vx * drift
      const y = speck.y + speck.vy * drift
      let alpha: number
      let size: number
      if (speck.star) {
        // It tightens into a point, brightens a little, twinkles, then goes as the sky arrives.
        const twinkle = 0.75 + 0.25 * Math.sin(t * 5.3 + speck.twinkle)
        alpha = arrive * (1 - smooth(speck.life - 1.2, speck.life, local)) * twinkle
        size = speck.size * (1 - 0.35 * smooth(0, 1.2, local))
      } else {
        alpha = arrive * 0.85 * (1 - smooth(0.25, speck.life, local))
        size = speck.size * (1 - 0.4 * smooth(0, speck.life, local))
      }
      if (alpha <= 0.01) continue
      ctx.globalAlpha = alpha
      ctx.fillRect(x - size / 2, y - size / 2, size, size)
    }
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}
