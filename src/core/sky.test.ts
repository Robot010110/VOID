import { describe, expect, it } from 'vitest'
import {
  bandLatitude,
  generateSky,
  HOME_BAND,
  makeBandFrame,
  SPIKE_FRACTION,
  type Sky,
} from './sky.ts'

const COUNT = 30000
const sky = generateSky(1234, COUNT)

function all(s: Sky, pick: (layer: Sky['layers'][number]) => Float32Array): number[] {
  return s.layers.flatMap((layer) => Array.from(pick(layer)))
}

describe('generateSky', () => {
  it('is deterministic for a seed', () => {
    const again = generateSky(1234, COUNT)
    sky.layers.forEach((layer, i) => {
      const other = again.layers[i]!
      expect(other.count).toBe(layer.count)
      expect(Array.from(other.direction.slice(0, 300))).toEqual(
        Array.from(layer.direction.slice(0, 300)),
      )
      expect(Array.from(other.flux)).toEqual(Array.from(layer.flux))
      expect(Array.from(other.rank)).toEqual(Array.from(layer.rank))
    })
  })

  it('changes with the seed', () => {
    const other = generateSky(1235, COUNT)
    expect(Array.from(other.layers[0]!.flux.slice(0, 50))).not.toEqual(
      Array.from(sky.layers[0]!.flux.slice(0, 50)),
    )
  })

  it('makes exactly the requested number of stars, in far, mid and near layers', () => {
    expect(sky.layers.map((l) => l.kind)).toEqual(['far', 'mid', 'near'])
    expect(sky.layers.reduce((sum, l) => sum + l.count, 0)).toBe(COUNT)
    const [far, mid, near] = sky.layers
    // Dense far layer, sparse near layer.
    expect(far!.count).toBeGreaterThan(mid!.count)
    expect(mid!.count).toBeGreaterThan(near!.count)
  })

  it('keeps every direction on the unit sphere', () => {
    for (const layer of sky.layers) {
      for (let i = 0; i < layer.count; i += 97) {
        const x = layer.direction[i * 3]!
        const y = layer.direction[i * 3 + 1]!
        const z = layer.direction[i * 3 + 2]!
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4)
      }
    }
  })

  it('crowds the far layer towards the band, but not the near layer', () => {
    const nearBand = (layerIndex: number) => {
      const layer = sky.layers[layerIndex]!
      let inside = 0
      for (let i = 0; i < layer.count; i++) {
        const lat = bandLatitude(
          HOME_BAND,
          layer.direction[i * 3]!,
          layer.direction[i * 3 + 1]!,
          layer.direction[i * 3 + 2]!,
        )
        if (Math.abs(lat) < (15 * Math.PI) / 180) inside++
      }
      return inside / layer.count
    }
    // A uniform sky puts sin(15 degrees), about 26%, within 15 degrees of any great circle.
    expect(nearBand(0)).toBeGreaterThan(0.7)
    expect(nearBand(2)).toBeLessThan(0.4)
  })

  it('makes faint stars common and bright stars rare', () => {
    const flux = all(sky, (l) => l.flux).sort((a, b) => a - b)
    const median = flux[Math.floor(flux.length / 2)]!
    const top = flux[flux.length - 1]!
    expect(median).toBeLessThan(0.1)
    expect(top).toBeGreaterThan(5)
    for (const f of flux) expect(f).toBeGreaterThan(0)
  })

  it('weights temperatures towards cool stars, within 2500 K to 30000 K', () => {
    const temps = all(sky, (l) => l.temperature)
    for (const t of temps) {
      expect(t).toBeGreaterThanOrEqual(2500)
      expect(t).toBeLessThanOrEqual(30000)
    }
    const cool = temps.filter((t) => t < 5200).length / temps.length
    const hot = temps.filter((t) => t > 10000).length / temps.length
    expect(cool).toBeGreaterThan(0.55)
    expect(hot).toBeLessThan(0.1)
  })

  it('gives diffraction spikes to the brightest half percent only', () => {
    const spikes = all(sky, (l) => l.spike)
    const spiked = spikes.filter((s) => s > 0).length
    expect(spiked).toBeGreaterThan(COUNT * SPIKE_FRACTION * 0.8)
    expect(spiked).toBeLessThan(COUNT * SPIKE_FRACTION * 1.2)
    for (const s of spikes) expect(s).toBeLessThanOrEqual(1)
  })

  it('twinkles bright stars more slowly than faint ones', () => {
    const near = sky.layers[2]!
    let brightSpeed = 0
    let brightCount = 0
    for (let i = 0; i < near.count; i++) {
      if (near.flux[i]! > 3) {
        brightSpeed += near.twinkle[i * 2 + 1]!
        brightCount++
      }
    }
    const far = sky.layers[0]!
    let faintSpeed = 0
    for (let i = 0; i < far.count; i++) faintSpeed += far.twinkle[i * 2 + 1]!
    expect(brightSpeed / brightCount).toBeLessThan(faintSpeed / far.count)
  })

  it('ranks stars brightest first, as a permutation of [0, 1)', () => {
    const ranked = sky.layers.flatMap((layer) =>
      Array.from(layer.rank, (rank, i) => ({ rank, flux: layer.flux[i]! })),
    )
    const ranks = ranked.map((r) => r.rank).sort((a, b) => a - b)
    expect(ranks[0]).toBeGreaterThan(0)
    expect(ranks[ranks.length - 1]).toBeLessThan(1)
    expect(new Set(ranks).size).toBe(ranks.length)
    // The low tier draws the first 20%: it should hold mostly bright stars.
    const low = ranked.filter((r) => r.rank < 0.2)
    const meanLow = low.reduce((sum, r) => sum + r.flux, 0) / low.length
    const meanAll = ranked.reduce((sum, r) => sum + r.flux, 0) / ranked.length
    expect(meanLow).toBeGreaterThan(meanAll * 2)
  })
})

describe('makeBandFrame', () => {
  it('builds an orthonormal rotation whose third row is the core direction', () => {
    const frame = makeBandFrame([1, 2, 3], [0, 1, 0])
    const m = frame.worldToBand
    const row = (r: number) => [m[r * 3]!, m[r * 3 + 1]!, m[r * 3 + 2]!]
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const dot = row(a).reduce((sum, v, i) => sum + v * row(b)[i]!, 0)
        expect(dot).toBeCloseTo(a === b ? 1 : 0, 6)
      }
    }
    const len = Math.hypot(1, 2, 3)
    expect(row(2)[0]).toBeCloseTo(1 / len, 6)
    expect(row(1)).toEqual([...frame.pole])
  })
})
