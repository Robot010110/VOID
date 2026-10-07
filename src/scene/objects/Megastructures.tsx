import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type IUniform,
  type PerspectiveCamera,
} from 'three'
import type { Lattice, OrbitalRing, Swarm } from '../../core/civilization.ts'
import { QUALITY } from '../../core/quality.ts'
import { hashSeed, Rng } from '../../core/rng.ts'
import { useVoid } from '../../core/store.ts'
import { orbitalPeriod, orbitPosition, type Orbit } from '../../core/universe.ts'
import beadsFrag from '../../shaders/structures/beads.frag'
import beadsVert from '../../shaders/structures/beads.vert'
import satellitesFrag from '../../shaders/structures/satellites.frag'
import satellitesVert from '../../shaders/structures/satellites.vert'
import strandsFrag from '../../shaders/structures/strands.frag'
import strandsVert from '../../shaders/structures/strands.vert'
import swarmFrag from '../../shaders/structures/swarm.frag'
import swarmVert from '../../shaders/structures/swarm.vert'
import { useLevel } from '../levels/context.ts'
import { worldClock } from '../shared/clock.ts'
import { linear } from '../shared/gpu.ts'
import type { AtmosphereModel } from './atmosphere.ts'
import { PREMULTIPLIED, pixelRadius, toObjectSpace, worldRadius, type Sunlight } from './body.ts'

/**
 * What a civilisation builds around its world: a ring of stations tethered to the equator (or
 * what is left of one), satellites in low orbit, and the lattice of the transcended. They are
 * architecture, never ships: rails, struts and tethers drawn as tubes of dull metal (see
 * strands.vert), and points of light. All of it is built once from the world's seed, in the
 * world's own units (its radius is 1); satellites move entirely on the GPU.
 */

type V3 = readonly [number, number, number]

/** Straight pieces of structure, gathered into flat arrays for one instanced draw. */
class StrandSet {
  readonly start: number[] = []
  readonly end: number[] = []
  readonly radius: number[] = []
  readonly glow: number[] = []

  add(a: V3, b: V3, radius: number, glow = 0, along = 0) {
    this.start.push(a[0], a[1], a[2])
    this.end.push(b[0], b[1], b[2])
    this.radius.push(radius)
    this.glow.push(glow, along)
  }

  get count() {
    return this.radius.length
  }
}

/** Points of light: where, how large (pixels) and how they shine. */
class BeadSet {
  readonly position: number[] = []
  readonly size: number[] = []
  readonly light: number[] = []

  add(p: V3, size: number, brightness: number, phase: number, period: number, failing: boolean) {
    this.position.push(p[0], p[1], p[2])
    this.size.push(size)
    this.light.push(brightness, phase, period, failing ? 1 : 0)
  }

  get count() {
    return this.size.length
  }
}

/** A point at angle `theta` around the equator, `r` out and `y` above it. */
function onRing(theta: number, r: number, y: number): V3 {
  return [Math.cos(theta) * r, y, -Math.sin(theta) * r]
}

/** Turn a point about the vertical axis. */
function turnY(p: V3, angle: number): V3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

const RING_SEGMENTS = 480
/** Half-width and height of the ring's triangular truss, planet radii. */
const TRUSS_HALF = 0.0035
const TRUSS_HEIGHT = 0.003

/**
 * A ring of stations: a triangular truss around the equator, stations at its tethers, and
 * lamps along its crown. A derelict ring has lost whole runs of itself; the pieces that remain
 * have sagged and turned a little out of line, the stations hang broken tethers, and its lamps
 * are out.
 */
function buildRing(ring: OrbitalRing, seed: number, failing: boolean): { strands: StrandSet; beads: BeadSet } {
  const rng = new Rng(hashSeed(seed, 0x2147))
  const strands = new StrandSet()
  const beads = new BeadSet()
  const R = ring.radius
  const step = (Math.PI * 2) / RING_SEGMENTS
  const rails = (theta: number): [V3, V3, V3] => [
    onRing(theta, R - TRUSS_HALF, -TRUSS_HEIGHT * 0.5),
    onRing(theta, R + TRUSS_HALF, -TRUSS_HEIGHT * 0.5),
    onRing(theta, R, TRUSS_HEIGHT),
  ]

  // Which segments stand, and how each surviving piece has shifted.
  const standing = new Array<boolean>(RING_SEGMENTS).fill(true)
  const shift: Array<{ radial: number; lift: number; tilt: number; twist: number; centre: number }> = []
  if (ring.derelict) {
    let k = rng.int(0, 20)
    while (k < RING_SEGMENTS) {
      const run = rng.int(5, 42)
      const piece = {
        radial: rng.gauss(0, 0.006),
        lift: rng.gauss(0, 0.004),
        tilt: rng.gauss(0, 0.07),
        twist: rng.gauss(0, 0.004),
        centre: (k + run / 2) * step,
      }
      for (let j = k; j < Math.min(k + run, RING_SEGMENTS); j++) shift[j] = piece
      k += run
      const gap = rng.int(3, 26)
      for (let j = k; j < Math.min(k + gap, RING_SEGMENTS); j++) standing[j] = false
      k += gap
    }
  }
  const still = { radial: 0, lift: 0, tilt: 0, twist: 0, centre: 0 }
  /** Where a point of the ring now is, given the piece it belongs to. */
  const moved = (p: V3, k: number): V3 => {
    const s = shift[k] ?? still
    if (s === still) return p
    // Turn about the vertical through the piece's middle (it has drifted along), then tilt
    // about the ring's tangent there (it has rolled), then sag outward and down.
    const local = turnY(p, -s.centre)
    const r = local[0]
    const y = local[1]
    const c = Math.cos(s.tilt)
    const sn = Math.sin(s.tilt)
    const tilted: V3 = [R + (r - R) * c - y * sn + s.radial, (r - R) * sn + y * c + s.lift, local[2]]
    return turnY(tilted, s.centre + s.twist)
  }

  for (let k = 0; k < RING_SEGMENTS; k++) {
    if (!standing[k]) continue
    const a = rails(k * step).map((p) => moved(p, k))
    const b = rails((k + 1) * step).map((p) => moved(p, k))
    // The crown's windows glow faintly while its people are there.
    for (let r = 0; r < 3; r++) strands.add(a[r]!, b[r]!, 0.0011, r === 2 && !ring.derelict ? 1 : 0)
    // The truss's frames and diagonals; a derelict ring has lost some of them.
    const decay = ring.derelict ? 0.45 : 0
    if (k % 2 === 0 && rng.next() >= decay) {
      strands.add(a[0]!, a[1]!, 0.0006)
      strands.add(a[0]!, a[2]!, 0.0006)
      strands.add(a[1]!, a[2]!, 0.0006)
    }
    if (rng.next() >= decay) strands.add(k % 2 === 0 ? a[0]! : a[1]!, b[2]!, 0.0005)
    // Lamps along the crown.
    if (!ring.derelict && k % 2 === 0) beads.add(a[2]!, 2.4, 2.6 + rng.range(0, 1.2), rng.next(), k % 6 === 0 ? rng.range(4, 9) : 0, failing)
  }

  // Stations, evenly spaced: a long hull along the ring and a spire through it, and the tether
  // that runs down to the equator. A derelict ring keeps some of them, with broken tethers.
  const stations = ring.tethers > 0 ? ring.tethers : 8
  const offset = rng.range(0, step * 8)
  for (let s = 0; s < stations; s++) {
    const theta = offset + (s * Math.PI * 2) / stations
    const k = Math.floor(theta / step) % RING_SEGMENTS
    if (!standing[k] || (ring.derelict && rng.chance(0.4))) continue
    const at = (p: V3) => moved(p, k)
    strands.add(at(onRing(theta - 0.02, R, 0)), at(onRing(theta + 0.02, R, 0)), 0.0055)
    strands.add(at(onRing(theta, R, -0.012)), at(onRing(theta, R, 0.014)), 0.0028)
    strands.add(at(onRing(theta - 0.006, R - 0.012, 0)), at(onRing(theta - 0.006, R + 0.012, 0)), 0.0016)
    if (ring.tethers > 0) {
      strands.add(at(onRing(theta, R - 0.004, 0)), onRing(theta, 1.0005, 0), 0.0006)
      strands.add(onRing(theta, 1.0005, 0), onRing(theta, 1.004, 0), 0.0028)
    } else if (rng.chance(0.6)) {
      const length = rng.range(0.02, 0.07)
      const sway = rng.gauss(0, 0.004)
      strands.add(at(onRing(theta, R - 0.004, 0)), at(onRing(theta + sway, R - 0.004 - length, rng.gauss(0, 0.004))), 0.0006)
    }
    if (!ring.derelict) {
      const phase = rng.next()
      beads.add(at(onRing(theta, R, 0.016)), 3.2, 7, phase, 2.6, failing)
      beads.add(at(onRing(theta - 0.02, R, 0)), 2.8, 4, phase + 0.5, 0, failing)
      beads.add(at(onRing(theta + 0.02, R, 0)), 2.8, 4, phase + 0.25, 0, failing)
    }
  }

  // Debris drifting near the breaks.
  if (ring.derelict) {
    for (let d = 0; d < 46; d++) {
      const theta = rng.range(0, Math.PI * 2)
      const k = Math.floor(theta / step) % RING_SEGMENTS
      if (standing[k]) continue
      const centre = onRing(theta, R + rng.gauss(0, 0.012), rng.gauss(0, 0.008))
      const length = rng.range(0.003, 0.014)
      const dir: V3 = [rng.gauss(0, 1), rng.gauss(0, 0.5), rng.gauss(0, 1)]
      const n = Math.hypot(dir[0], dir[1], dir[2]) || 1
      const half: V3 = [(dir[0] / n) * length, (dir[1] / n) * length, (dir[2] / n) * length]
      strands.add(
        [centre[0] - half[0], centre[1] - half[1], centre[2] - half[2]],
        [centre[0] + half[0], centre[1] + half[1], centre[2] + half[2]],
        rng.range(0.0005, 0.0012),
      )
    }
  }
  return { strands, beads }
}

/** The six great circles of an icosidodecahedron lie across the icosahedron's six axes. */
const PHI = (1 + Math.sqrt(5)) / 2
const LATTICE_AXES: readonly V3[] = [
  [0, 1, PHI],
  [0, 1, -PHI],
  [1, PHI, 0],
  [1, -PHI, 0],
  [PHI, 0, 1],
  [-PHI, 0, 1],
]
const CIRCLE_SEGMENTS = 240

function normalise(v: V3): V3 {
  const n = Math.hypot(v[0], v[1], v[2])
  return [v[0] / n, v[1] / n, v[2] / n]
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/**
 * A lattice of light: six great circles meeting at thirty nodes, as on an icosidodecahedron, so
 * the world sits in a cage of triangles and pentagons. Its strands glow faintly from within and
 * carry slow pulses round; its nodes shine.
 */
function buildLattice(lattice: Lattice, seed: number): { strands: StrandSet; beads: BeadSet } {
  const rng = new Rng(hashSeed(seed, 0x1a77))
  const strands = new StrandSet()
  const beads = new BeadSet()
  const R = lattice.radius
  const axes = LATTICE_AXES.map(normalise)
  axes.forEach((n, c) => {
    // Two directions spanning the circle's plane.
    const u = normalise(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
    const v = cross(n, u)
    const phase = rng.next()
    const point = (k: number): V3 => {
      const t = (k / CIRCLE_SEGMENTS) * Math.PI * 2
      const cos = Math.cos(t) * R
      const sin = Math.sin(t) * R
      return [u[0] * cos + v[0] * sin, u[1] * cos + v[1] * sin, u[2] * cos + v[2] * sin]
    }
    for (let k = 0; k < CIRCLE_SEGMENTS; k++) {
      strands.add(point(k), point(k + 1), 0.0009, 1, (k / CIRCLE_SEGMENTS + phase + c * 0.37) % 1)
    }
  })
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const node = normalise(cross(axes[i]!, axes[j]!))
      for (const sign of [1, -1]) {
        beads.add([node[0] * R * sign, node[1] * R * sign, node[2] * R * sign], 3, 1.5, rng.next(), rng.range(5, 9), false)
      }
    }
  }
  return { strands, beads }
}

// ---------------------------------------------------------------------------------------
// Drawing

const QUAD = new Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3)
const QUAD_INDEX = new BufferAttribute(new Uint16Array([0, 1, 2, 2, 1, 3]), 1)

function strandGeometry(set: StrandSet): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', QUAD)
  geometry.setIndex(QUAD_INDEX)
  geometry.setAttribute('aStart', new InstancedBufferAttribute(new Float32Array(set.start), 3))
  geometry.setAttribute('aEnd', new InstancedBufferAttribute(new Float32Array(set.end), 3))
  geometry.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(set.radius), 1))
  geometry.setAttribute('aGlow', new InstancedBufferAttribute(new Float32Array(set.glow), 2))
  geometry.instanceCount = set.count
  return geometry
}

function beadGeometry(set: BeadSet): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(set.position, 3))
  geometry.setAttribute('aSize', new Float32BufferAttribute(set.size, 1))
  geometry.setAttribute('aLight', new Float32BufferAttribute(set.light, 4))
  return geometry
}

/** The uniforms every structure reads each frame, in its own object space. */
function frameUniforms(sun: Sunlight) {
  return {
    uSunObj: { value: new Vector3() },
    uCamObj: { value: new Vector3() },
    uSunIrradiance: { value: sun.irradiance },
    uViewport: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uClock: { value: 0 },
    uPixelRatio: { value: 1 },
    uFade: { value: 0 },
  }
}

/** The world's air, for sunlight that grazes it; nothing for an airless world. */
function airUniforms(air: AtmosphereModel | null): Record<string, IUniform> {
  if (!air) return {}
  const { uTransmittance, uAtmBottom, uAtmTop } = air.uniforms
  return { uTransmittance: uTransmittance!, uAtmBottom: uAtmBottom!, uAtmTop: uAtmTop! }
}

interface StrandLook {
  albedo: string
  glow: string
  /** How much the strands hide what lies behind them. */
  solid: number
  /** Whether the glow travels along in pulses (a lattice) or holds steady (lit windows). */
  pulse: boolean
}

function strandMaterial(sun: Sunlight, air: AtmosphereModel | null, look: StrandLook): ShaderMaterial {
  return new ShaderMaterial({
    name: 'strands',
    vertexShader: strandsVert,
    fragmentShader: strandsFrag,
    defines: air ? { ATMOSPHERE: '' } : {},
    ...PREMULTIPLIED,
    depthTest: true,
    // A ribbon's winding depends on which way its piece runs across the screen.
    side: DoubleSide,
    uniforms: {
      ...frameUniforms(sun),
      ...airUniforms(air),
      uMinPixels: { value: 1.6 },
      uAlbedo: { value: linear(look.albedo) },
      uGlowColor: { value: linear(look.glow) },
      uSolid: { value: look.solid },
      uPulse: { value: look.pulse ? 1 : 0 },
    },
  })
}

function beadMaterial(sun: Sunlight, color: string): ShaderMaterial {
  return new ShaderMaterial({
    name: 'beads',
    vertexShader: beadsVert,
    fragmentShader: beadsFrag,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: { ...frameUniforms(sun), uColor: { value: linear(color) } },
  })
}

const sunObj = new Vector3()
const camObj = new Vector3()
const centre = new Vector3()

/**
 * Keep a structure's per-frame uniforms current, and fade it in as its world grows on screen:
 * across a system, where the world is a few pixels wide, its structures would only glitter.
 */
function useStructureFrame(
  object: { current: Mesh | Points | null },
  materials: readonly ShaderMaterial[],
  sun: Sunlight,
  fade: { current: number },
  appear: readonly [number, number],
) {
  useFrame((state) => {
    const mesh = object.current
    if (!mesh) return
    const camera = state.camera as PerspectiveCamera
    const height = state.size.height * state.viewport.dpr
    centre.setFromMatrixPosition(mesh.matrixWorld)
    const pixels = pixelRadius(worldRadius(mesh), camera.position.distanceTo(centre), camera.fov, height)
    const t = Math.min(1, Math.max(0, (pixels - appear[0]) / (appear[1] - appear[0])))
    const strength = t * t * (3 - 2 * t) * fade.current
    mesh.visible = strength > 0.001
    if (!mesh.visible) return
    toObjectSpace(mesh, sun.direction, camera.position, sunObj, camObj)
    for (const material of materials) {
      const u = material.uniforms
      ;(u.uSunObj!.value as Vector3).copy(sunObj)
      ;(u.uCamObj!.value as Vector3).copy(camObj)
      ;(u.uViewport!.value as Vector2).set(state.size.width * state.viewport.dpr, height)
      u.uTime!.value = worldClock.time
      u.uClock!.value = worldClock.real
      u.uPixelRatio!.value = state.viewport.dpr
      u.uFade!.value = strength
    }
  })
}

interface StructureProps {
  sun: Sunlight
  /** The world's fade, which its structures follow. */
  fade: { current: number }
  /** The world's air, for sunlight grazing it. */
  air: AtmosphereModel | null
  seed: number
}

/** World radii on screen over which structures fade in. */
const APPEAR: readonly [number, number] = [10, 26]

/**
 * A ring of stations, or the wreck of one. A tethered ring turns with its world (mount it in
 * the world's spinning frame); a broken one has come loose and drifts slowly against it.
 */
export function RingStructure({ ring, failing, sun, fade, air, seed }: StructureProps & { ring: OrbitalRing; failing: boolean }) {
  const strandsRef = useRef<Mesh>(null)
  const beadsRef = useRef<Points>(null)
  const drift = useRef<Group>(null)
  const built = useMemo(() => buildRing(ring, seed, failing), [ring, seed, failing])
  const parts = useMemo(() => {
    const strands = strandGeometry(built.strands)
    const beads = built.beads.count > 0 ? beadGeometry(built.beads) : null
    const metal = strandMaterial(sun, air, {
      albedo: ring.derelict ? '#5c5a57' : '#8b8a87',
      glow: '#3a2410',
      solid: 1,
      pulse: false,
    })
    const lamps = beadMaterial(sun, '#ffb36b')
    return { strands, beads, metal, lamps }
  }, [built, sun, air, ring.derelict])

  useEffect(
    () => () => {
      parts.strands.dispose()
      parts.beads?.dispose()
      parts.metal.dispose()
      parts.lamps.dispose()
    },
    [parts],
  )

  useStructureFrame(strandsRef, [parts.metal], sun, fade, APPEAR)
  useStructureFrame(beadsRef, [parts.lamps], sun, fade, APPEAR)
  useFrame(() => {
    // A loose ring has slipped against its world: about a turn every hour at 1x.
    if (drift.current && ring.derelict) drift.current.rotation.y = (worldClock.time / 3600) * Math.PI * 2
  })

  return (
    <group ref={drift}>
      <mesh ref={strandsRef} geometry={parts.strands} material={parts.metal} renderOrder={3} frustumCulled={false} />
      {parts.beads && (
        <points ref={beadsRef} geometry={parts.beads} material={parts.lamps} renderOrder={4} frustumCulled={false} />
      )}
    </group>
  )
}

/** The transcended's lattice, turning slowly about its own tilted axis. */
export function LatticeStructure({ lattice, sun, fade, air, seed }: StructureProps & { lattice: Lattice }) {
  const strandsRef = useRef<Mesh>(null)
  const beadsRef = useRef<Points>(null)
  const turn = useRef<Group>(null)
  const parts = useMemo(() => {
    const built = buildLattice(lattice, seed)
    return {
      strands: strandGeometry(built.strands),
      beads: beadGeometry(built.beads),
      light: strandMaterial(sun, air, { albedo: '#9d99aa', glow: '#7c63b8', solid: 0.3, pulse: true }),
      nodes: beadMaterial(sun, '#d2c2ff'),
    }
  }, [lattice, seed, sun, air])

  useEffect(
    () => () => {
      parts.strands.dispose()
      parts.beads.dispose()
      parts.light.dispose()
      parts.nodes.dispose()
    },
    [parts],
  )

  useStructureFrame(strandsRef, [parts.light], sun, fade, APPEAR)
  useStructureFrame(beadsRef, [parts.nodes], sun, fade, APPEAR)
  useFrame(() => {
    // Once round in half an hour at 1x.
    if (turn.current) turn.current.rotation.y = (worldClock.time / 1800) * Math.PI * 2
  })

  return (
    <group rotation={[lattice.tilt, 0, 0]}>
      <group ref={turn}>
        <mesh ref={strandsRef} geometry={parts.strands} material={parts.light} renderOrder={3} frustumCulled={false} />
        <points ref={beadsRef} geometry={parts.beads} material={parts.nodes} renderOrder={4} frustumCulled={false} />
      </group>
    </group>
  )
}

/** Seconds per orbit at 1x for the lowest satellites; higher ones follow Kepler's third law. */
const LOW_ORBIT_PERIOD = 34

/**
 * Satellites, in a few shells as real constellations fly, each shell at its own height and
 * inclination, plus strays. Dead ones (a vanished people's) still catch the sun.
 */
function buildSatellites(count: number, seed: number): BufferGeometry {
  const rng = new Rng(hashSeed(seed, 0x5a7e))
  const shells = Array.from({ length: rng.int(3, 5) }, () => ({
    radius: rng.range(1.035, 1.16),
    inclination: rng.pick([rng.range(0.85, 1.05), rng.range(0.4, 0.65), rng.range(1.35, 1.6)]),
  }))
  const orbit: number[] = []
  const motion: number[] = []
  const position: number[] = []
  for (let i = 0; i < count; i++) {
    const stray = rng.chance(0.18)
    const shell = rng.pick(shells)
    const radius = stray ? rng.range(1.03, 1.28) : shell.radius + rng.gauss(0, 0.002)
    const inclination = stray ? rng.range(0, Math.PI) : shell.inclination + rng.gauss(0, 0.01)
    orbit.push(radius, inclination, rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2))
    motion.push(LOW_ORBIT_PERIOD * (radius / 1.05) ** 1.5, rng.range(0.5, 1.3), rng.next())
    position.push(0, 0, 0)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('aOrbit', new Float32BufferAttribute(orbit, 4))
  geometry.setAttribute('aMotion', new Float32BufferAttribute(motion, 3))
  return geometry
}

export function Satellites({ count, sun, fade, air, seed }: StructureProps & { count: number }) {
  const ref = useRef<Points>(null)
  const parts = useMemo(() => {
    const geometry = buildSatellites(count, seed)
    const material = new ShaderMaterial({
      name: 'satellites',
      vertexShader: satellitesVert,
      fragmentShader: satellitesFrag,
      defines: air ? { ATMOSPHERE: '' } : {},
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { ...frameUniforms(sun), ...airUniforms(air), uSize: { value: 2 } },
    })
    return { geometry, material }
  }, [count, seed, sun, air])

  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )

  // Satellites only show once their world is large on screen: before that they would crowd it.
  useStructureFrame(ref, [parts.material], sun, fade, [36, 70])
  useFrame((state) => {
    parts.material.uniforms.uSize!.value = 2 * state.viewport.dpr
  })

  return <points ref={ref} geometry={parts.geometry} material={parts.material} renderOrder={4} frustumCulled={false} />
}

/** Thin towards an arc's ends, where its building stopped, and across its gaps. */
function arcDensity(u: number, gaps: ReadonlyArray<{ at: number; width: number }>): number {
  const ends = Math.min(1, u / 0.2, (1 - u) / 0.2)
  let keep = ends * ends * (3 - 2 * ends)
  for (const gap of gaps) keep *= 1 - 0.92 * Math.exp(-(((u - gap.at) / gap.width) ** 2))
  return keep
}

/**
 * The collectors of an arc around a star: denser in its middle, thinning towards its unfinished
 * ends, broken by a few gaps, all within a band about one tilted plane.
 */
function buildSwarm(swarm: Swarm, starRadius: number, seed: number, count: number): BufferGeometry {
  const rng = new Rng(hashSeed(seed, 0x5a12))
  const radius = swarm.radius * starRadius
  const start = rng.range(0, Math.PI * 2)
  const gaps = Array.from({ length: rng.int(2, 4) }, () => ({ at: rng.range(0.15, 0.85), width: rng.range(0.015, 0.04) }))
  const orbit: number[] = []
  const motion: number[] = []
  const position: number[] = []
  for (let made = 0, tries = 0; made < count && tries < count * 20; tries++) {
    const u = rng.next()
    if (rng.next() > arcDensity(u, gaps)) continue
    const r = radius * (1 + rng.gauss(0, 0.012))
    orbit.push(r, swarm.inclination + rng.gauss(0, swarm.thickness * 0.45), swarm.node + rng.gauss(0, swarm.thickness * 0.25), start + u * swarm.span)
    motion.push(orbitalPeriod(r), u, rng.next(), rng.next())
    position.push(0, 0, 0)
    made++
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('aOrbit', new Float32BufferAttribute(orbit, 4))
  geometry.setAttribute('aMotion', new Float32BufferAttribute(motion, 4))
  return geometry
}

interface SwarmProps {
  swarm: Swarm
  /** Radius of the star it circles, system units. */
  starRadius: number
  seed: number
}

function swarmMaterial(sky: boolean): ShaderMaterial {
  return new ShaderMaterial({
    name: sky ? 'swarm-sky' : 'swarm',
    vertexShader: swarmVert,
    fragmentShader: swarmFrag,
    defines: sky ? { SKY: '' } : {},
    // In a world's sky the arc only adds light (its colour is already premultiplied); around its
    // star, its panels also veil what lies behind them.
    ...(sky
      ? { blending: AdditiveBlending, premultipliedAlpha: true, depthTest: false, depthWrite: false }
      : { ...PREMULTIPLIED, depthTest: true }),
    uniforms: {
      uTime: { value: 0 },
      uClock: { value: 0 },
      uSize: { value: 2 },
      uFrom: { value: new Vector3() },
      uGlowColor: { value: linear('#ffb36b').multiplyScalar(sky ? 0.16 : 0.32) },
      uGlintColor: { value: linear('#fff1dc').multiplyScalar(sky ? 3 : 5) },
      uOpacity: { value: sky ? 0 : 0.6 },
      uFade: { value: 0 },
    },
  })
}

/** The collectors and their material, sized by the tier the level opened on. */
function useSwarm(swarm: Swarm, starRadius: number, seed: number, sky: boolean) {
  const [tier] = useState(() => useVoid.getState().quality)
  const parts = useMemo(
    () => ({ geometry: buildSwarm(swarm, starRadius, seed, QUALITY[tier].swarmCollectors), material: swarmMaterial(sky) }),
    [swarm, starRadius, seed, tier, sky],
  )
  useEffect(
    () => () => {
      parts.geometry.dispose()
      parts.material.dispose()
    },
    [parts],
  )
  return parts
}

/**
 * The arc around its star, in the star's system: dark collectors that veil the star where they
 * cross it, glowing faintly against the dark beyond.
 */
export function SwarmStructure({ swarm, starRadius, seed }: SwarmProps) {
  const level = useLevel()
  const parts = useSwarm(swarm, starRadius, seed, false)
  useFrame((state) => {
    const u = parts.material.uniforms
    u.uTime!.value = worldClock.time
    u.uClock!.value = worldClock.real
    u.uSize!.value = 1.8 * state.viewport.dpr
    u.uFade!.value = level.fade.current
  })
  return <points geometry={parts.geometry} material={parts.material} renderOrder={5} frustumCulled={false} />
}

const from: [number, number, number] = [0, 0, 0]

/**
 * The same arc in the sky of one of the star's worlds: a faint band of specks about the sun,
 * drawn with the sky so the world passes in front of it.
 */
export function SwarmSky({ swarm, starRadius, seed, orbit }: SwarmProps & { orbit: Orbit }) {
  const level = useLevel()
  const parts = useSwarm(swarm, starRadius, seed, true)
  useFrame((state) => {
    const u = parts.material.uniforms
    u.uTime!.value = worldClock.time
    u.uClock!.value = worldClock.real
    u.uSize!.value = 1.6 * state.viewport.dpr
    orbitPosition(orbit, worldClock.time, from)
    ;(u.uFrom!.value as Vector3).set(from[0], from[1], from[2])
    u.uFade!.value = level.fade.current
  })
  return <points geometry={parts.geometry} material={parts.material} renderOrder={-998} frustumCulled={false} />
}
