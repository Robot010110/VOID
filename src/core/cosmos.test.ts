import { describe, expect, it } from 'vitest'
import { bezier, deepField, galaxyCount, generateUniverse, getUniverse, HOLE_POLAR, isHole, rotate, webGas } from './cosmos.ts'
import { getGalaxyLook } from './galaxy.ts'
import { HOME, levelOf } from './universe.ts'

const universe = getUniverse()
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!)

describe('generateUniverse', () => {
  it('is deterministic', () => {
    expect(generateUniverse()).toEqual(generateUniverse())
    expect(getUniverse()).toBe(getUniverse())
  })

  it('holds forty to eighty galaxies of every kind', () => {
    const count = universe.galaxies.length
    expect(count).toBeGreaterThanOrEqual(40)
    expect(count).toBeLessThanOrEqual(80)
    expect(galaxyCount()).toBe(count)
    const kinds = new Map<string, number>()
    for (const g of universe.galaxies) kinds.set(g.kind, (kinds.get(g.kind) ?? 0) + 1)
    for (const kind of ['spiral', 'barred', 'elliptical', 'irregular']) expect(kinds.get(kind) ?? 0).toBeGreaterThanOrEqual(4)
    universe.galaxies.forEach((g, i) => expect(g.index).toBe(i))
  })

  it('crowds ellipticals into the great cluster, as the real universe does', () => {
    const cluster = universe.galaxies.filter((g) => g.node === 0)
    const elsewhere = universe.galaxies.filter((g) => g.node !== 0)
    const share = (list: typeof cluster) => list.filter((g) => g.kind === 'elliptical').length / list.length
    expect(share(cluster)).toBeGreaterThan(share(elsewhere) * 2)
  })

  it('keeps galaxies apart and within the visible universe', () => {
    for (const a of universe.galaxies) {
      expect(Math.hypot(...a.position)).toBeLessThan(1400)
      for (const b of universe.galaxies) {
        if (a === b) continue
        expect(distance(a.position, b.position)).toBeGreaterThan((a.size + b.size) * 2)
      }
    }
  })

  it('makes the home galaxy a barred spiral in a modest group', () => {
    const home = universe.galaxies[HOME[0]!]!
    expect(home.kind).toBe('barred')
    expect(home.node).toBeGreaterThan(0)
    expect(getGalaxyLook(HOME[0]!).name).toBe('Valath Drift')
  })

  it('names every galaxy differently', () => {
    const names = universe.galaxies.map((g) => getGalaxyLook(g.index).name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('joins the web into one piece', () => {
    const joined = new Set([0])
    let grew = true
    while (grew) {
      grew = false
      for (const f of universe.filaments) {
        if (f.to < 0) continue
        if (joined.has(f.from) !== joined.has(f.to)) {
          joined.add(f.from)
          joined.add(f.to)
          grew = true
        }
      }
    }
    expect(joined.size).toBe(universe.nodes.length)
    for (const f of universe.filaments) {
      expect(bezier(f.curve, 0)).toEqual(f.curve[0])
      expect(distance(bezier(f.curve, 1), f.curve[3])).toBeLessThan(1e-9)
    }
  })

  it('fills voids with nebulae, clear of the galaxies', () => {
    expect(universe.nebulae.length).toBeGreaterThanOrEqual(3)
    for (const n of universe.nebulae) {
      for (const g of universe.galaxies) expect(distance(n.position, g.position)).toBeGreaterThan(n.size * 0.7)
    }
  })
})

describe('the black hole', () => {
  const { hole } = universe

  it("is the universe's last child, a level of its own", () => {
    expect(hole.index).toBe(universe.galaxies.length)
    expect(isHole(hole.index)).toBe(true)
    expect(isHole(0)).toBe(false)
    expect(levelOf([hole.index])).toBe('hole')
    expect(levelOf([0])).toBe('galaxy')
    expect(levelOf([])).toBe('universe')
  })

  it('sits alone, clear of every galaxy', () => {
    for (const g of universe.galaxies) expect(distance(hole.position, g.position)).toBeGreaterThan(g.size * 3)
  })

  it('is seen at rest against its nebula, its disc nearly edge-on', () => {
    // The resting camera looks along the frame's -z (azimuth 0) from HOLE_POLAR off the axis.
    const camera = [0, Math.cos(HOLE_POLAR), Math.sin(HOLE_POLAR)] as const
    const towardsCamera = rotate(hole.orientation, camera)
    const nebula = universe.nebulae[hole.nebula]!
    const towardsNebula = [0, 1, 2].map((k) => nebula.position[k]! - hole.position[k]!)
    const length = Math.hypot(...towardsNebula)
    const cosine = (towardsCamera[0] * towardsNebula[0]! + towardsCamera[1] * towardsNebula[1]! + towardsCamera[2] * towardsNebula[2]!) / length
    // Straight behind the hole, as the camera sees it.
    expect(cosine).toBeLessThan(-0.99)
    const axis = rotate(hole.orientation, [0, 1, 0])
    expect(Math.hypot(...axis)).toBeCloseTo(1, 9)
  })
})

describe('the deep field and the web', () => {
  it('is any prefix a fair sample, and deterministic', () => {
    const a = deepField(universe, 600)
    const b = deepField(universe, 300)
    expect(Array.from(a.place.slice(0, 1200))).toEqual(Array.from(b.place))
    const far = (field: typeof a) => {
      let n = 0
      for (let i = 0; i < field.count; i++) if (field.place[i * 4 + 3] === 0) n++
      return n / field.count
    }
    expect(far(a)).toBeGreaterThan(0.45)
    expect(far(a)).toBeLessThan(0.7)
  })

  it('lays the faint distant galaxies at infinity as unit directions', () => {
    const field = deepField(universe, 400)
    for (let i = 0; i < field.count; i++) {
      if (field.place[i * 4 + 3] !== 0) continue
      expect(Math.hypot(field.place[i * 4]!, field.place[i * 4 + 1]!, field.place[i * 4 + 2]!)).toBeCloseTo(1, 5)
    }
  })

  it('keeps the gas on the threads and around the nodes', () => {
    const gas = webGas(universe, 800)
    let lost = 0
    for (let i = 0; i < gas.count; i++) {
      const p = [gas.place[i * 4]!, gas.place[i * 4 + 1]!, gas.place[i * 4 + 2]!]
      expect(gas.place[i * 4 + 3]).toBeGreaterThan(0)
      if (Math.hypot(p[0]!, p[1]!, p[2]!) > 1800) lost++
    }
    expect(lost).toBe(0)
  })
})
