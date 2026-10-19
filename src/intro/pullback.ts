/**
 * The opening's pull-back: one move out from a sun to the whole universe, flown as a chain of
 * flights (inside the system, then out of it into the galaxy, then out of the galaxy), each in
 * its own level's units. Chained naively, every flight would ease in and out on its own and the
 * camera would stall at each level. Instead the whole move follows one curve of log-distance
 * over time, and each flight is handed its stretch of it.
 *
 * The curve passes through each level's resting distance at a chosen share of the time, and
 * is a monotone cubic (Fritsch and Carlson) through those points: it never turns back, its
 * speed is continuous across every hand-over, and it starts and ends at rest.
 */

export interface PullBackSegment {
  /** How long this flight takes. */
  readonly seconds: number
  /** How far along its own distance (in log space) the flight is at each moment, 0 to 1. */
  readonly ease: (t: number) => number
}

/**
 * Plan a pull-back of `seconds` in all, through segments that each multiply the camera's
 * distance by `e^ratios[i]`, given `shares` of the time (normalised to sum to one).
 */
export function planPullBack(ratios: readonly number[], shares: readonly number[], seconds: number): PullBackSegment[] {
  const n = ratios.length
  if (n === 0 || shares.length !== n) throw new Error('planPullBack: one share per segment')
  if (ratios.some((r) => !(r > 0)) || shares.some((s) => !(s > 0))) throw new Error('planPullBack: ratios and shares must be positive')

  const total = shares.reduce((a, b) => a + b, 0)
  // Knots: time (0 to 1) and log-distance travelled (0 to the sum of ratios).
  const times = [0]
  const logs = [0]
  for (let i = 0; i < n; i++) {
    times.push(times[i]! + shares[i]! / total)
    logs.push(logs[i]! + ratios[i]!)
  }
  times[n] = 1

  // Slopes: zero at both ends (the move starts and settles at rest); inside, Fritsch and
  // Butland's weighted harmonic mean of the neighbouring secants, which keeps the curve
  // monotone.
  const widths = shares.map((_, i) => times[i + 1]! - times[i]!)
  const secants = ratios.map((r, i) => r / widths[i]!)
  const slopes = [0]
  for (let k = 1; k < n; k++) {
    const h0 = widths[k - 1]!
    const h1 = widths[k]!
    const d0 = secants[k - 1]!
    const d1 = secants[k]!
    slopes.push((3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1))
  }
  slopes.push(0)

  /** Log-distance travelled at overall time `tau`, within segment `k`. */
  const curve = (k: number, tau: number) => {
    const h = widths[k]!
    const s = Math.min(1, Math.max(0, (tau - times[k]!) / h))
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2 * s3 - 3 * s2 + 1) * logs[k]! +
      (s3 - 2 * s2 + s) * h * slopes[k]! +
      (-2 * s3 + 3 * s2) * logs[k + 1]! +
      (s3 - s2) * h * slopes[k + 1]!
    )
  }

  return ratios.map((ratio, k) => ({
    seconds: seconds * widths[k]!,
    ease: (t: number) => {
      if (t <= 0) return 0
      if (t >= 1) return 1
      return (curve(k, times[k]! + t * widths[k]!) - logs[k]!) / ratio
    },
  }))
}
