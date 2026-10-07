/**
 * The universe, as plain data (no three.js): about sixty galaxies strung along a cosmic web,
 * a few vast clouds of glowing gas in the voids between them, and one black hole.
 *
 * The web is a handful of nodes (one rich cluster, smaller groups) joined by curved filaments.
 * Galaxies gather in the nodes and along the filaments, and, as in the real universe, their
 * kind follows their surroundings: smooth golden ellipticals crowd the dense core of the
 * cluster, while spirals and ragged irregulars live along the filaments and in the quiet field.
 *
 * Units: the web lies within about 1000 units of the centre, so the visible universe spans
 * about 2000. A galaxy's own frame (its disc's radius about 200) is scaled into this one.
 */
import { blackbody } from './blackbody.ts'
import { hashSeed, Rng, UNIVERSE_SEED } from './rng.ts'
import type { Vec3 } from './sky.ts'

export type GalaxyKind = 'spiral' | 'barred' | 'elliptical' | 'irregular'

/** A unit quaternion (x, y, z, w). */
export type Quat = readonly [number, number, number, number]

/** The web lies within this distance of the centre (and flatter vertically). */
export const UNIVERSE_RADIUS = 1000

export interface WebNode {
  readonly position: Vec3
  /** 1 for the great cluster, less for the groups. */
  readonly richness: number
  /** Gaussian radius of the spread of its galaxies. */
  readonly radius: number
}

export interface Filament {
  readonly from: number
  /** The node it joins, or -1 for a tendril fading out into the void. */
  readonly to: number
  /** A cubic Bézier curve: the two nodes and two control points between them. */
  readonly curve: readonly [Vec3, Vec3, Vec3, Vec3]
  /** Gaussian half-width of its gas. */
  readonly width: number
}

export interface GalaxySite {
  readonly index: number
  readonly kind: GalaxyKind
  readonly position: Vec3
  /** How the galaxy's own frame is turned in the universe. */
  readonly orientation: Quat
  /** Radius of its light, universe units. */
  readonly size: number
  /** The node it belongs to, or -1 along a filament or alone in the field. */
  readonly node: number
}

export type UniverseNebulaKind = 'aurora' | 'tide' | 'ember'

/** A vast cloud of glowing gas in a void. */
export interface UniverseNebula {
  readonly seed: number
  readonly kind: UniverseNebulaKind
  readonly position: Vec3
  /** Radius, universe units. */
  readonly size: number
}

/** The black hole: one handcrafted place, alone in a void in front of a nebula. */
export interface HoleSite {
  /** Its index among the universe's children: the one after the last galaxy. */
  readonly index: number
  readonly name: string
  readonly position: Vec3
  /** Its frame: the disc lies in the frame's xz plane. */
  readonly orientation: Quat
  /** Schwarzschild radius, universe units. */
  readonly radius: number
  /** The nebula it is seen against from its resting view. */
  readonly nebula: number
}

export interface Universe {
  readonly seed: number
  readonly nodes: readonly WebNode[]
  readonly filaments: readonly Filament[]
  readonly galaxies: readonly GalaxySite[]
  readonly nebulae: readonly UniverseNebula[]
  readonly hole: HoleSite
}

/** How far from its axis the black hole is seen at rest: nearly edge-on, from a little above. */
export const HOLE_POLAR = 1.36

// ---------------------------------------------------------------------------------------
// Small vector helpers (plain tuples, so the data stays free of three.js)

type V = [number, number, number]

const add = (a: Vec3, b: Vec3): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, s: number): V => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const normalise = (a: Vec3): V => scale(a, 1 / Math.max(length(a), 1e-9))
const distance = (a: Vec3, b: Vec3) => length(sub(a, b))

/** A point on a cubic Bézier curve. */
export function bezier(curve: Filament['curve'], t: number, out: V = [0, 0, 0]): V {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  for (let k = 0; k < 3; k++) out[k] = a * curve[0][k]! + b * curve[1][k]! + c * curve[2][k]! + d * curve[3][k]!
  return out
}

/** A uniformly random rotation (Shoemake). */
function randomRotation(rng: Rng): Quat {
  const u1 = rng.next()
  const u2 = rng.next() * Math.PI * 2
  const u3 = rng.next() * Math.PI * 2
  const a = Math.sqrt(1 - u1)
  const b = Math.sqrt(u1)
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)]
}

/** The rotation whose columns are the given orthonormal axes. */
function quatFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const [m00, m10, m20] = x
  const [m01, m11, m21] = y
  const [m02, m12, m22] = z
  const trace = m00 + m11 + m22
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
  }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]
}

/** Turn a vector by a quaternion. */
export function rotate(q: Quat, v: Vec3): V {
  const [x, y, z, w] = q
  const t = scale(cross([x, y, z], v), 2)
  return add(add(v, scale(t, w)), cross([x, y, z], t))
}

/** A point inside the web's flattened ball, uniform in volume. */
function inBall(rng: Rng, rx: number, ry: number): V {
  for (;;) {
    const p: V = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]
    if (dot(p, p) <= 1) return [p[0] * rx, p[1] * ry, p[2] * rx]
  }
}

function gaussian(rng: Rng, sigma: number, flatten = 1): V {
  return [rng.gauss(0, sigma), rng.gauss(0, sigma * flatten), rng.gauss(0, sigma)]
}

// ---------------------------------------------------------------------------------------
// Generation

/** The web's nodes: one great cluster near the centre and smaller groups around it. */
function generateNodes(rng: Rng): WebNode[] {
  const count = rng.int(9, 11)
  const nodes: WebNode[] = []
  for (let i = 0; i < count; i++) {
    const great = i === 0
    let position: V = [0, 0, 0]
    for (let tries = 0; tries < 400; tries++) {
      position = great ? inBall(rng, 300, 160) : inBall(rng, UNIVERSE_RADIUS * 0.95, UNIVERSE_RADIUS * 0.45)
      if (nodes.every((n) => distance(n.position, position) > 360)) break
    }
    const richness = great ? 1 : rng.range(0.25, 0.6)
    nodes.push({ position, richness, radius: 38 + 62 * richness })
  }
  return nodes
}

/**
 * Filaments: every node joins its nearest neighbours, and a spanning tree keeps the whole web
 * in one piece. Each thread bows gently, and is thicker towards the richer of its two ends.
 */
function generateFilaments(nodes: readonly WebNode[], rng: Rng): Filament[] {
  const pairs: Array<[number, number, number]> = []
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) pairs.push([a, b, distance(nodes[a]!.position, nodes[b]!.position)])
  pairs.sort((p, q) => p[2] - q[2])

  const chosen = new Set<string>()
  const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  // A spanning tree (Kruskal), so nothing floats free.
  const parent = nodes.map((_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)))
  for (const [a, b] of pairs) {
    if (root(a) !== root(b)) {
      parent[root(a)] = root(b)
      chosen.add(key(a, b))
    }
  }
  // Then each node's two nearest, for the web's loops, unless the thread is very long.
  for (let a = 0; a < nodes.length; a++) {
    const near = pairs.filter((p) => p[0] === a || p[1] === a).slice(0, 2)
    for (const [p, q, d] of near) if (d < 1100) chosen.add(key(p, q))
  }

  const thread = (a: number, from: Vec3, to: Vec3, rich: number, b: number): Filament => {
    const span = sub(to, from)
    const len = length(span)
    const side = normalise(cross(span, rng.chance(0.5) ? [0, 1, 0] : [1, 0, 0]))
    const lift = normalise(cross(span, side))
    const bow = (s: number): V =>
      add(add(add(from, scale(span, s)), scale(side, rng.gauss(0, len * 0.18))), scale(lift, rng.gauss(0, len * 0.1)))
    return { from: a, to: b, curve: [from, bow(1 / 3), bow(2 / 3), to], width: 14 + 20 * rich + rng.range(0, 8) }
  }
  const threads = [...chosen].sort().map((k) => {
    const [a, b] = k.split(':').map(Number) as [number, number]
    return thread(a, nodes[a]!.position, nodes[b]!.position, Math.max(nodes[a]!.richness, nodes[b]!.richness), b)
  })
  // Tendrils: the outer nodes reach on into the void, towards the rest of the universe.
  const outer = nodes.map((n, i) => ({ i, far: length(n.position) })).sort((p, q) => q.far - p.far)
  for (const { i } of outer.slice(0, 4)) {
    const from = nodes[i]!.position
    const outward = normalise(add(normalise(from), gaussian(rng, 0.35)))
    const to = add(from, scale(outward, rng.range(380, 620)))
    threads.push(thread(i, from, to, nodes[i]!.richness * 0.5, -1))
  }
  return threads
}

const SIZES: Record<GalaxyKind, [number, number]> = {
  spiral: [10, 16],
  barred: [10, 15],
  elliptical: [9, 15],
  irregular: [4.5, 7.5],
}

/** What kinds of galaxy live where: ellipticals crowd the cluster, spirals the threads. */
const KIND_WEIGHTS: Record<'cluster' | 'group' | 'filament' | 'field', readonly number[]> = {
  // spiral, barred, elliptical, irregular
  cluster: [15, 12, 58, 15],
  group: [36, 26, 20, 18],
  filament: [48, 26, 6, 20],
  field: [40, 20, 4, 36],
}
const KINDS: readonly GalaxyKind[] = ['spiral', 'barred', 'elliptical', 'irregular']

/** The home galaxy is a barred spiral of this size, in a modest group (like our Local Group). */
const HOME_SIZE = 14

function generateGalaxies(nodes: readonly WebNode[], filaments: readonly Filament[], rng: Rng): GalaxySite[] {
  const total = rng.int(56, 66)
  const sites: GalaxySite[] = []
  const fits = (position: Vec3, size: number) =>
    sites.every((s) => distance(s.position, position) > (s.size + size) * 2.1 + 10)

  const place = (kind: GalaxyKind, size: number, node: number, at: () => V) => {
    let position = at()
    for (let tries = 0; tries < 60 && !fits(position, size); tries++) position = at()
    if (!fits(position, size)) return
    sites.push({ index: sites.length, kind, position, orientation: randomRotation(rng), size, node })
  }
  const sized = (kind: GalaxyKind, dwarf = false) => {
    const [min, max] = SIZES[kind]
    return dwarf && kind === 'elliptical' ? rng.range(5.5, 8) : rng.range(min, max)
  }

  // Home: the group whose richness is most modest-but-not-least, a little off its centre.
  const home = nodes
    .map((n, i) => ({ i, score: Math.abs(n.richness - 0.42) }))
    .filter((n) => n.i !== 0)
    .sort((a, b) => a.score - b.score)[0]!.i
  {
    const node = nodes[home]!
    const offset = normalise(gaussian(rng, 1, 0.5))
    place('barred', HOME_SIZE, home, () => add(node.position, scale(offset, node.radius * 0.7)))
  }

  // The great cluster's heart: a giant elliptical.
  place('elliptical', rng.range(19, 23), 0, () => add(nodes[0]!.position, gaussian(rng, 8)))

  // The rest, node by node, then along the threads, then alone.
  const slots: Array<{ node: number; filament: number }> = []
  nodes.forEach((n, i) => {
    const count = i === 0 ? 13 : Math.round(2 + 6 * n.richness) - (i === home ? 1 : 0)
    for (let k = 0; k < count; k++) slots.push({ node: i, filament: -1 })
  })
  filaments.forEach((_, i) => {
    for (let k = rng.int(1, 2); k > 0; k--) slots.push({ node: -1, filament: i })
  })
  rng.shuffle(slots)
  for (const slot of slots) {
    if (sites.length >= total - 3) break
    if (slot.node >= 0) {
      const node = nodes[slot.node]!
      const kind = rng.weighted(KINDS, slot.node === 0 ? KIND_WEIGHTS.cluster : KIND_WEIGHTS.group)
      place(kind, sized(kind, slot.node !== 0), slot.node, () => add(node.position, gaussian(rng, node.radius, 0.8)))
    } else {
      const filament = filaments[slot.filament]!
      const kind = rng.weighted(KINDS, KIND_WEIGHTS.filament)
      place(kind, sized(kind, true), -1, () =>
        add(bezier(filament.curve, rng.range(0.2, 0.8)), gaussian(rng, filament.width * 0.8)),
      )
    }
  }
  // A few alone in the field, far from everything.
  while (sites.length < total) {
    const kind = rng.weighted(KINDS, KIND_WEIGHTS.field)
    const before = sites.length
    place(kind, sized(kind, true), -1, () => {
      for (;;) {
        const p = inBall(rng, UNIVERSE_RADIUS * 0.85, UNIVERSE_RADIUS * 0.4)
        if (nodes.every((n) => distance(n.position, p) > n.radius * 3 + 120)) return p
      }
    })
    if (sites.length === before) break
  }
  return sites
}

const NEBULA_KINDS: readonly UniverseNebulaKind[] = ['aurora', 'tide', 'ember']

/** Nebulae fill voids: far from the nodes, clear of every galaxy. */
function generateNebulae(nodes: readonly WebNode[], galaxies: readonly GalaxySite[], seed: number, rng: Rng): UniverseNebula[] {
  const count = rng.int(4, 5)
  const nebulae: UniverseNebula[] = []
  for (let i = 0; i < count; i++) {
    const size = i === 0 ? 230 : rng.range(150, 240)
    let position: V = [0, 0, 0]
    for (let tries = 0; tries < 400; tries++) {
      position = inBall(rng, UNIVERSE_RADIUS * 0.9, UNIVERSE_RADIUS * 0.45)
      const clear =
        nodes.every((n) => distance(n.position, position) > n.radius * 2 + size + 60) &&
        galaxies.every((g) => distance(g.position, position) > g.size * 2 + size * 0.75) &&
        nebulae.every((n) => distance(n.position, position) > n.size + size + 120)
      if (clear) break
    }
    nebulae.push({ seed: hashSeed(seed, 0x4eb1, i), kind: NEBULA_KINDS[i % 3]!, position, size })
  }
  return nebulae
}

/**
 * The black hole sits between the first nebula and the centre of the web, so from its resting
 * view (looking outward from the web) the nebula lies right behind it and bends into arcs.
 * Its disc is seen nearly edge-on, from a little above.
 */
function generateHole(nebulae: readonly UniverseNebula[], galaxies: readonly GalaxySite[]): HoleSite {
  const nebula = nebulae[0]!
  const inward = normalise(scale(nebula.position, -1))
  let position = add(nebula.position, scale(inward, nebula.size * 2.6))
  // Clear of galaxies: slide along the line if one is too close.
  for (let tries = 0; tries < 20 && galaxies.some((g) => distance(g.position, position) < g.size * 3 + 60); tries++) {
    position = add(position, scale(inward, 25))
  }
  // The camera rests on the side away from the nebula (towards the web).
  const towardsCamera = inward
  const up: V = [0, 1, 0]
  const across = normalise(sub(up, scale(towardsCamera, dot(up, towardsCamera))))
  // The disc's axis makes HOLE_POLAR with the resting view direction, tilted a little towards up.
  const axis = normalise(add(scale(towardsCamera, Math.cos(HOLE_POLAR)), scale(across, Math.sin(HOLE_POLAR))))
  const inPlane = normalise(sub(towardsCamera, scale(axis, dot(towardsCamera, axis))))
  const x = cross(axis, inPlane)
  return {
    index: galaxies.length,
    name: 'Nostrim',
    position,
    orientation: quatFromAxes(x, axis, inPlane),
    radius: 0.55,
    nebula: 0,
  }
}

export function generateUniverse(seed = UNIVERSE_SEED): Universe {
  const rng = new Rng(hashSeed(seed, 0xc05e))
  const nodes = generateNodes(rng)
  const filaments = generateFilaments(nodes, rng)
  const galaxies = generateGalaxies(nodes, filaments, rng)
  const nebulae = generateNebulae(nodes, galaxies, seed, rng)
  const hole = generateHole(nebulae, galaxies)
  return { seed, nodes, filaments, galaxies, nebulae, hole }
}

let universe: Universe | null = null

/** The universe, generated once and remembered. */
export function getUniverse(): Universe {
  universe ??= generateUniverse()
  return universe
}

export function galaxySite(index: number): GalaxySite {
  const site = getUniverse().galaxies[index]
  if (!site) throw new Error(`No galaxy ${index}`)
  return site
}

/** The number of galaxies; the black hole's index is this. */
export function galaxyCount(): number {
  return getUniverse().galaxies.length
}

export function isHole(index: number): boolean {
  return index === getUniverse().hole.index
}

// ---------------------------------------------------------------------------------------
// What the universe level draws besides its galaxies: plain arrays, any prefix a fair sample

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function hexToLinear(hex: string): V {
  const n = Number.parseInt(hex.slice(1), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

/** Thousands of faint, distant galaxies: some trace the web, the rest lie far beyond it. */
export interface DeepField {
  readonly count: number
  /**
   * Per galaxy: a position (w = 1) along the web, or a direction (w = 0) for those so far away
   * they lie at infinity.
   */
  readonly place: Float32Array
  /** Per galaxy: size (universe units, or radians at infinity), light, axis ratio, turn. */
  readonly look: Float32Array
  /** Per galaxy: linear colour, brightest channel full. */
  readonly colour: Uint8Array
}

export function deepField(universe: Universe, count: number): DeepField {
  const seed = hashSeed(universe.seed, 0xdeef)
  const place = new Float32Array(count * 4)
  const look = new Float32Array(count * 4)
  const colour = new Uint8Array(count * 4)
  const point: V = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    const rng = new Rng(hashSeed(seed, i))
    const far = rng.chance(0.58)
    if (far) {
      rng.onSphere(point)
      place.set([point[0], point[1], point[2], 0], i * 4)
    } else if (rng.chance(0.72)) {
      const filament = rng.pick(universe.filaments)
      const at = bezier(filament.curve, rng.next(), point)
      const offset = gaussian(rng, filament.width * 1.4)
      place.set([at[0] + offset[0], at[1] + offset[1], at[2] + offset[2], 1], i * 4)
    } else {
      const node = rng.weighted(universe.nodes, universe.nodes.map((n) => n.richness))
      const offset = gaussian(rng, node.radius * 2.2, 0.8)
      place.set([node.position[0] + offset[0], node.position[1] + offset[1], node.position[2] + offset[2], 1], i * 4)
    }
    // Many faint, a few brighter; far ones are tiny.
    const light = Math.min(1, 0.06 * rng.pareto(1, 1.6))
    const size = far ? 0.0012 * Math.exp(rng.gauss(0, 0.35)) : 0.9 * Math.exp(rng.gauss(0, 0.35))
    const roll = rng.next()
    const kelvin = roll < 0.34 ? rng.range(3600, 4700) : roll < 0.84 ? rng.range(5200, 9000) : roll < 0.94 ? rng.range(10000, 16000) : rng.range(2600, 3300)
    // Ellipticals are rounder, spirals are discs seen at any angle.
    const axis = roll < 0.34 ? rng.range(0.6, 1) : Math.max(0.3, Math.abs(Math.cos(rng.range(0, Math.PI / 2))))
    look.set([size, light, axis, rng.range(0, Math.PI)], i * 4)
    const [r, g, b] = blackbody(kelvin)
    colour.set([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255], i * 4)
  }
  return { count, place, look, colour }
}

/** The faint gas of the cosmic web: soft clouds along the filaments, haloes on the nodes. */
export interface WebGas {
  readonly count: number
  /** Per cloud: position, gaussian radius. */
  readonly place: Float32Array
  /** Per cloud: light, and linear colour. */
  readonly look: Float32Array
}

const THREAD = hexToLinear('#5a63c8')
const THREAD_TIDE = hexToLinear('#4aa6b8')
const HALO = hexToLinear('#c9a9d6')

export function webGas(universe: Universe, count: number): WebGas {
  const seed = hashSeed(universe.seed, 0x9a5e)
  const place = new Float32Array(count * 4)
  const look = new Float32Array(count * 4)
  const point: V = [0, 0, 0]
  const lengths = universe.filaments.map((f) => distance(f.curve[0], f.curve[3]) * (f.width / 30))
  // Each thread is beaded: denser knots strung along it, so it reads as gas, not a tube.
  const beads = universe.filaments.map((_, f) => {
    const rng = new Rng(hashSeed(seed, 0xbead, f))
    return { rate: rng.range(5, 11), phase: rng.range(0, Math.PI * 2), twist: rng.range(0, Math.PI * 2) }
  })
  for (let i = 0; i < count; i++) {
    const rng = new Rng(hashSeed(seed, i))
    if (rng.chance(0.86)) {
      // Along a thread: thinnest in the middle, wider as it nears its nodes.
      const f = rng.weighted(
        universe.filaments.map((_, k) => k),
        lengths,
      )
      const filament = universe.filaments[f]!
      const bead = beads[f]!
      const t = rng.next()
      const at = bezier(filament.curve, t, point)
      const width = filament.width * (0.45 + 0.5 * (2 * Math.abs(t - 0.5)) ** 2)
      const knots = 0.5 + 0.5 * Math.sin(t * bead.rate * Math.PI * 2 + bead.phase)
      const offset = gaussian(rng, width * (0.6 + 0.5 * knots))
      const c = rng.chance(0.7) ? THREAD : THREAD_TIDE
      place.set([at[0] + offset[0], at[1] + offset[1], at[2] + offset[2], width * rng.range(0.5, 1)], i * 4)
      look.set([rng.range(0.5, 1.2) * (0.35 + 0.9 * knots * knots), c[0], c[1], c[2]], i * 4)
    } else {
      // A node's halo of hot gas, warmer and denser towards its heart.
      const node = rng.weighted(universe.nodes, universe.nodes.map((n) => 0.3 + n.richness))
      const r = node.radius * 2.4 * Math.abs(rng.gauss(0, 1))
      const dir = rng.onSphere(point)
      const at = add(node.position, [dir[0] * r, dir[1] * r * 0.8, dir[2] * r])
      const warmth = Math.exp(-r / (node.radius * 1.5))
      const c: V = [
        THREAD[0] + (HALO[0] - THREAD[0]) * warmth,
        THREAD[1] + (HALO[1] - THREAD[1]) * warmth,
        THREAD[2] + (HALO[2] - THREAD[2]) * warmth,
      ]
      place.set([at[0], at[1], at[2], node.radius * rng.range(0.5, 0.9)], i * 4)
      look.set([rng.range(0.3, 0.6) * (0.5 + node.richness), c[0], c[1], c[2]], i * 4)
    }
  }
  return { count, place, look }
}
