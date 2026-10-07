/**
 * Nebulae: clouds of glowing gas and dust. Each is a handful of camera-facing layers at
 * different depths, sizes and slow turns, each a different stretch of one shared baked noise
 * atlas, so a nebula is a cloud from every side and its edges dissolve rather than end.
 * Emission nebulae glow hydrogen rose and Aurora violet around a Tide-teal heart; reflection
 * nebulae scatter blue starlight; remnants are thin Ember and Tide shells.
 *
 * A galaxy's nebulae ride its arms. They are drawn into the galaxy's half-resolution light
 * buffer, after its light, so their dust dims what lies behind them. The universe's nebulae
 * are vaster and stay where they are, in the voids between the galaxies: many more layers each,
 * in Aurora, Tide or Ember.
 */
import {
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MirroredRepeatWrapping,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type IUniform,
} from 'three'
import type { UniverseNebula } from '../../core/cosmos.ts'
import { armAngle, type GalaxyLook, type NebulaData } from '../../core/galaxy.ts'
import { Rng } from '../../core/rng.ts'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import bakeFrag from '../../shaders/nebula/bake.frag'
import nebulaFrag from '../../shaders/nebula/nebula.frag'
import nebulaVert from '../../shaders/nebula/nebula.vert'
import universeNebulaVert from '../../shaders/universe/nebula.vert'
import { BakeJob } from '../shared/bake.ts'
import type { Disposable } from '../shared/cache.ts'

/** The shared noise every nebula samples, baked once. */
export class NebulaAtlas implements Disposable {
  readonly target: WebGLRenderTarget
  readonly bake: ShaderMaterial
  readonly job: BakeJob

  constructor(size: number) {
    this.target = new WebGLRenderTarget(size, size, {
      type: UnsignedByteType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    })
    this.target.texture.wrapS = this.target.texture.wrapT = MirroredRepeatWrapping
    this.bake = new ShaderMaterial({
      name: 'nebula-bake',
      vertexShader: fullscreenVert,
      fragmentShader: bakeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: { uSize: { value: new Vector2(size, size) }, uSeedOffset: { value: new Vector3(13.7, -4.1, 7.9) } },
    })
    this.job = new BakeJob([{ target: this.target, material: this.bake }])
  }

  dispose() {
    this.target.dispose()
    this.bake.dispose()
  }
}

export const ATLAS_POLICY = { keepFor: 600_000, group: 'nebula', spare: 1 }

function srgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  const c = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return [c(((n >> 16) & 255) / 255), c(((n >> 8) & 255) / 255), c((n & 255) / 255)]
}

const COLOURS = {
  rose: srgb('#ff5a86'),
  violet: srgb('#b07cff'),
  teal: srgb('#6fd3e0'),
  pale: srgb('#d8f4f6'),
  tide: srgb('#78b8ff'),
  sky: srgb('#cfe2ff'),
  ember: srgb('#ffb36b'),
  dusk: srgb('#3a1a26'),
  gold: srgb('#ffd59a'),
  rust: srgb('#b8573a'),
  deep: srgb('#1b1830'),
  ocean: srgb('#2f6f9a'),
} as const

type Colour = readonly [number, number, number]

interface Layer {
  readonly size: number
  readonly place: readonly [number, number, number]
  /** Atlas window: centre, spread, turn speed. */
  readonly window: readonly [number, number, number, number]
  /** 0 billows, 1 filaments, 2 wisps, 3 clumps. */
  readonly channel: number
  readonly a: Colour
  readonly b: Colour
  readonly glow: number
  readonly dust: number
  readonly threshold: number
  readonly shell: number
}

/** The layers of one nebula, drawn from its seed. */
function layersOf(nebula: NebulaData): Layer[] {
  const rng = new Rng(nebula.seed)
  const place = (spread = 0.3): [number, number, number] => [rng.gauss(0, spread), rng.gauss(0, spread * 0.4), rng.gauss(0, spread)]
  const window = (spread: number): [number, number, number, number] => [
    rng.range(0.25, 0.75),
    rng.range(0.25, 0.75),
    spread * rng.range(0.8, 1.2),
    rng.sign() * rng.range(0.002, 0.006),
  ]
  const layer = (partial: Omit<Layer, 'place' | 'window'> & { spread: number; placeSpread?: number }): Layer => ({
    ...partial,
    place: place(partial.placeSpread),
    window: window(partial.spread),
  })
  const layers: Layer[] = []
  if (nebula.kind === 'emission') {
    for (let i = 0; i < 2; i++)
      layers.push(layer({ size: rng.range(0.9, 1.1), channel: 0, a: COLOURS.rose, b: COLOURS.violet, glow: 2.6, dust: 0, threshold: 0.38, shell: 0, spread: 0.2 }))
    for (let i = 0; i < 2; i++)
      layers.push(layer({ size: rng.range(0.6, 0.85), channel: 2, a: COLOURS.rose, b: COLOURS.violet, glow: 2.1, dust: 0, threshold: 0.48, shell: 0, spread: 0.16 }))
    for (let i = 0; i < 2; i++)
      layers.push(layer({ size: rng.range(0.55, 0.8), channel: 1, a: COLOURS.dusk, b: COLOURS.rose, glow: 0.5, dust: 0.32, threshold: 0.36, shell: 0, spread: 0.18 }))
    layers.push(layer({ size: rng.range(0.3, 0.42), channel: 0, a: COLOURS.teal, b: COLOURS.pale, glow: 3.4, dust: 0, threshold: 0.3, shell: 0, spread: 0.14, placeSpread: 0.12 }))
  } else if (nebula.kind === 'reflection') {
    for (let i = 0; i < 3; i++)
      layers.push(layer({ size: rng.range(0.7, 1.05), channel: i === 0 ? 0 : 2, a: COLOURS.tide, b: COLOURS.sky, glow: 1.8, dust: 0, threshold: 0.42, shell: 0, spread: 0.18 }))
    for (let i = 0; i < 2; i++)
      layers.push(layer({ size: rng.range(0.6, 0.85), channel: 1, a: COLOURS.dusk, b: COLOURS.tide, glow: 0.3, dust: 0.3, threshold: 0.34, shell: 0, spread: 0.18 }))
  } else {
    for (let i = 0; i < 3; i++)
      layers.push(layer({ size: rng.range(0.85, 1.05), channel: 1, a: COLOURS.ember, b: COLOURS.teal, glow: 2.6, dust: 0, threshold: 0.42, shell: 1, spread: 0.22, placeSpread: 0.06 }))
    layers.push(layer({ size: rng.range(0.9, 1.1), channel: 2, a: COLOURS.teal, b: COLOURS.ember, glow: 1.0, dust: 0, threshold: 0.5, shell: 1, spread: 0.2, placeSpread: 0.06 }))
  }
  return layers
}

/**
 * The layers of one of the universe's nebulae: Aurora, Tide or Ember, with a bright heart. A
 * cloud is two or three lobes strung along an axis, so it is long and uneven, never a ball.
 */
function universeLayersOf(nebula: UniverseNebula): Layer[] {
  const rng = new Rng(nebula.seed)
  const layers: Layer[] = []
  const axis = rng.onSphere([0, 0, 0])
  const count = rng.int(2, 3)
  const lobes = Array.from({ length: count }, (_, k): [number, number, number] => {
    const along = (k - (count - 1) / 2) * rng.range(0.42, 0.6)
    return [axis[0] * along + rng.gauss(0, 0.1), axis[1] * along * 0.6 + rng.gauss(0, 0.06), axis[2] * along + rng.gauss(0, 0.1)]
  })
  let next = 0
  type Spec = Omit<Layer, 'place' | 'window' | 'size'> & { size: [number, number]; spread: number; placeSpread?: number }
  const add = (count: number, spec: Spec) => {
    for (let i = 0; i < count; i++) {
      const spread = spec.placeSpread ?? 0.18
      // Round the lobes in turn; a tight spread (the heart) stays in the first.
      const lobe = lobes[spec.placeSpread !== undefined ? 0 : next++ % lobes.length]!
      layers.push({
        a: spec.a,
        b: spec.b,
        channel: spec.channel,
        glow: spec.glow,
        dust: spec.dust,
        threshold: spec.threshold,
        shell: spec.shell,
        size: rng.range(spec.size[0], spec.size[1]),
        place: [lobe[0] + rng.gauss(0, spread), lobe[1] + rng.gauss(0, spread * 0.6), lobe[2] + rng.gauss(0, spread)],
        window: [rng.range(0.2, 0.8), rng.range(0.2, 0.8), spec.spread * rng.range(0.8, 1.2), rng.sign() * rng.range(0.0015, 0.004)],
      })
    }
  }
  const { rose, violet, teal, pale, tide, sky, ember, dusk, gold, rust, deep, ocean } = COLOURS
  // Billows of the main colour, wisps drawn out by a flow, bright filaments, dark dust, a heart.
  const [billowA, billowB, wispA, wispB, threadA, threadB, dustB, heartA, heartB] =
    nebula.kind === 'aurora'
      ? [violet, rose, rose, violet, pale, rose, dusk, teal, pale]
      : nebula.kind === 'tide'
        ? [ocean, tide, teal, sky, pale, teal, ocean, pale, violet]
        : [rust, ember, ember, gold, gold, pale, dusk, teal, pale]
  // Seen from far across the universe, a cloud is mostly soft billows; wisps and threads are
  // only the faint grain on them, so it never looks combed.
  add(6, { size: [0.5, 0.78], channel: 0, a: billowA, b: billowB, glow: 1.1, dust: 0, threshold: 0.3, shell: 0, spread: 0.13 })
  add(4, { size: [0.45, 0.75], channel: 2, a: wispA, b: wispB, glow: 0.55, dust: 0, threshold: 0.44, shell: 0, spread: 0.12 })
  add(2, { size: [0.4, 0.6], channel: 1, a: threadA, b: threadB, glow: 0.35, dust: 0, threshold: 0.44, shell: 0, spread: 0.12 })
  add(3, { size: [0.45, 0.7], channel: 0, a: deep, b: dustB, glow: 0.12, dust: 0.2, threshold: 0.38, shell: 0, spread: 0.11 })
  add(1, { size: [0.22, 0.32], channel: 0, a: heartA, b: heartB, glow: 1.5, dust: 0, threshold: 0.28, shell: 0, spread: 0.1, placeSpread: 0.06 })
  return layers
}

export interface Nebulae {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  dispose(): void
}

/**
 * Layers as one instanced draw. Each layer's `nebula` is where its cloud is (for a galaxy, the
 * orbit it rides; for the universe, its centre) and the cloud's size.
 */
function nebulaMesh(
  all: ReadonlyArray<{ nebula: readonly [number, number, number, number]; layer: Layer }>,
  vertexShader: string,
  uniforms: Record<string, IUniform>,
): Nebulae {
  const count = all.length
  const attribute = (size: number) => new Float32Array(count * size)
  const nebulaAt = attribute(4)
  const placeAt = attribute(4)
  const windowAt = attribute(4)
  const channelAt = attribute(4)
  const colourA = attribute(3)
  const colourB = attribute(3)
  const look = attribute(4)
  all.forEach(({ nebula, layer }, i) => {
    nebulaAt.set(nebula, i * 4)
    placeAt.set([...layer.place, layer.size], i * 4)
    windowAt.set(layer.window, i * 4)
    channelAt[i * 4 + layer.channel] = 1
    colourA.set(layer.a, i * 3)
    colourB.set(layer.b, i * 3)
    look.set([layer.glow, layer.dust, layer.threshold, layer.shell], i * 4)
  })

  const quad = new PlaneGeometry(2, 2)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('aNebula', new InstancedBufferAttribute(nebulaAt, 4))
  geometry.setAttribute('aPlace', new InstancedBufferAttribute(placeAt, 4))
  geometry.setAttribute('aWindow', new InstancedBufferAttribute(windowAt, 4))
  geometry.setAttribute('aChannel', new InstancedBufferAttribute(channelAt, 4))
  geometry.setAttribute('aColourA', new InstancedBufferAttribute(colourA, 3))
  geometry.setAttribute('aColourB', new InstancedBufferAttribute(colourB, 3))
  geometry.setAttribute('aLook', new InstancedBufferAttribute(look, 4))
  geometry.instanceCount = count

  const material = new ShaderMaterial({
    name: 'nebula',
    vertexShader,
    fragmentShader: nebulaFrag,
    uniforms,
    // Premultiplied: the gas adds light, its dust (alpha) dims what lies behind.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  return {
    mesh,
    material,
    dispose() {
      geometry.dispose()
      quad.dispose()
      material.dispose()
    },
  }
}

/**
 * A galaxy's nebulae as one instanced draw. `orbit` holds the galaxy's motion uniforms (they
 * ride the arms); `fade` and `atlas` are shared with the caller.
 */
export function createNebulae(galaxy: GalaxyLook, orbit: Record<string, IUniform>, fade: IUniform, atlas: NebulaAtlas): Nebulae {
  const arms = galaxy.shape.arms
  const all = galaxy.nebulae.flatMap((nebula) => {
    const phase = armAngle(galaxy.shape, nebula.radius) + (arms > 0 ? (nebula.arm * Math.PI * 2) / arms : 0) + nebula.offset
    const at = [nebula.radius, phase, nebula.height, nebula.size] as const
    return layersOf(nebula).map((layer) => ({ nebula: at, layer }))
  })
  return nebulaMesh(all, nebulaVert, { ...orbit, uFade: fade, uAtlas: { value: atlas.target.texture }, uGlow: { value: 0.6 } })
}

/** The universe's nebulae as one instanced draw; `time` and `fade` are shared with the caller. */
export function createUniverseNebulae(nebulae: readonly UniverseNebula[], time: IUniform, fade: IUniform, atlas: NebulaAtlas): Nebulae {
  const all = nebulae.flatMap((nebula) => {
    const at = [...nebula.position, nebula.size] as const
    return universeLayersOf(nebula).map((layer) => ({ nebula: at, layer }))
  })
  return nebulaMesh(all, universeNebulaVert, { uTime: time, uFade: fade, uAtlas: { value: atlas.target.texture }, uGlow: { value: 0.6 } })
}
