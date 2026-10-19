import { useMemo } from 'react'
import { blackbody } from '../core/blackbody.ts'
import { hashSeed, Rng, UNIVERSE_SEED } from '../core/rng.ts'

/** The sky's size in its own units: wide, and cropped to whatever shape the screen is. */
const WIDTH = 1600
const HEIGHT = 1000
/** The band crosses the sky on this line, as a galaxy's would seen from inside it. */
const BAND = { x: 800, y: 500, angle: -24, length: 2300, width: 330 }

interface StarDot {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly colour: string
  readonly opacity: number
}

/** Linear sRGB to an sRGB colour, lightened towards white as small stars look. */
function starColour(kelvin: number): string {
  const encode = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
  const [r, g, b] = blackbody(kelvin).map((v) => 0.55 * v + 0.45)
  return `rgb(${encode(r!)} ${encode(g!)} ${encode(b!)})`
}

/**
 * A fixed sky, the same every time: many faint stars, fewer bright ones, gathered more densely
 * along a band of soft light. Temperatures are drawn as the real sky's are: mostly cool, few hot.
 */
function sky(): StarDot[] {
  const rng = new Rng(hashSeed(UNIVERSE_SEED, 0xfa11))
  const turn = (BAND.angle * Math.PI) / 180
  const stars: StarDot[] = []
  for (let i = 0; i < 900; i++) {
    let x: number
    let y: number
    if (rng.chance(0.5)) {
      // Along the band, thinning away from its middle line.
      const along = rng.range(-0.5, 0.5) * BAND.length
      const across = rng.gauss(0, BAND.width * 0.32)
      x = BAND.x + along * Math.cos(turn) - across * Math.sin(turn)
      y = BAND.y + along * Math.sin(turn) + across * Math.cos(turn)
    } else {
      x = rng.range(0, WIDTH)
      y = rng.range(0, HEIGHT)
    }
    const bright = rng.next() ** 7
    const kelvin = rng.weighted([3200, 4400, 5600, 7500, 12000], [40, 28, 16, 10, 6]) * rng.range(0.9, 1.1)
    stars.push({ x, y, r: 0.4 + bright * 1.9, colour: starColour(kelvin), opacity: 0.28 + 0.72 * Math.min(1, bright * 2.4 + rng.range(0, 0.4)) })
  }
  return stars
}

/**
 * What VOID shows where it cannot run: a browser without WebGL2, or graphics that could not be
 * started or brought back. A still sky in the same light (an SVG starfield and its band), the
 * wordmark, and one line saying what is needed. No scene is loaded.
 */
export function Fallback() {
  const stars = useMemo(() => sky(), [])
  return (
    <main className="fallback">
      <svg className="fallback-sky" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id="fallback-band" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#f4ebdd" stopOpacity="0.12" />
            <stop offset="0.4" stopColor="#b07cff" stopOpacity="0.055" />
            <stop offset="1" stopColor="#1b1830" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="fallback-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffd6a8" stopOpacity="0.2" />
            <stop offset="0.42" stopColor="#ffb36b" stopOpacity="0.07" />
            <stop offset="1" stopColor="#ffb36b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse
          cx={BAND.x}
          cy={BAND.y}
          rx={BAND.length / 2}
          ry={BAND.width}
          fill="url(#fallback-band)"
          transform={`rotate(${BAND.angle} ${BAND.x} ${BAND.y})`}
        />
        <circle cx={WIDTH / 2} cy={HEIGHT / 2} r={190} fill="url(#fallback-glow)" />
        {stars.map((star, i) => (
          <circle key={i} cx={star.x.toFixed(1)} cy={star.y.toFixed(1)} r={star.r.toFixed(2)} fill={star.colour} opacity={star.opacity.toFixed(2)} />
        ))}
      </svg>
      <h1 className="fallback-wordmark">VOID</h1>
      <p className="fallback-line">VOID needs a browser with WebGL2.</p>
    </main>
  )
}
