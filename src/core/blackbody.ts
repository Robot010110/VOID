/**
 * Colour of a blackbody at a given temperature, as linear sRGB normalised so the brightest
 * channel is 1. Planckian locus from Kang et al. (2002), valid 1667 K to 25000 K.
 * Mirrors src/shaders/common/blackbody.glsl so CPU-side light colours match the shaders.
 */
export function blackbody(kelvin: number): [number, number, number] {
  const t = Math.min(Math.max(kelvin, 1667), 25000)
  const k = 1000 / t
  const k2 = k * k
  const k3 = k2 * k

  const x =
    t <= 4000
      ? -0.2661239 * k3 - 0.2343589 * k2 + 0.8776956 * k + 0.17991
      : -3.0258469 * k3 + 2.1070379 * k2 + 0.2226347 * k + 0.24039
  const x2 = x * x
  const x3 = x2 * x

  const y =
    t <= 2222
      ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483

  const X = x / y
  const Z = (1 - x - y) / y
  const r = Math.max(0, 3.2404542 * X - 1.5371385 - 0.4985314 * Z)
  const g = Math.max(0, -0.969266 * X + 1.8760108 + 0.041556 * Z)
  const b = Math.max(0, 0.0556434 * X - 0.2040259 + 1.0572252 * Z)
  const peak = Math.max(r, g, b, 1e-4)
  return [r / peak, g / peak, b / peak]
}
