/**
 * Nebulae: clouds of glowing gas and dust. Each is a handful of camera-facing layers at
 * different depths, sizes and slow turns, each a different stretch of one shared baked noise
 * atlas, so a nebula is a cloud from every side and its edges dissolve rather than end.
 * Emission nebulae glow hydrogen rose and Aurora violet around a Tide-teal heart; reflection
 * nebulae scatter blue starlight; remnants are thin Ember and Tide shells.
 *
 * A galaxy's nebulae ride its arms. They are drawn into the galaxy's half-resolution light
 * buffer, after its light, so their dust dims what lies behind them.
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
import { armAngle, type GalaxyData, type NebulaData } from '../../core/galaxy.ts'
import { Rng } from '../../core/rng.ts'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import bakeFrag from '../../shaders/nebula/bake.frag'
import nebulaFrag from '../../shaders/nebula/nebula.frag'
import nebulaVert from '../../shaders/nebula/nebula.vert'
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

export interface Nebulae {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  dispose(): void
}

/**
 * A galaxy's nebulae as one instanced draw. `orbit` holds the galaxy's motion uniforms (they
 * ride the arms); `fade` and `atlas` are shared with the caller.
 */
export function createNebulae(
  galaxy: GalaxyData,
  orbit: Record<string, IUniform>,
  fade: IUniform,
  atlas: NebulaAtlas,
): Nebulae {
  const all = galaxy.nebulae.flatMap((nebula) => layersOf(nebula).map((layer) => ({ nebula, layer })))
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
    const phase = armAngle(galaxy.shape, nebula.radius) + (nebula.arm * Math.PI * 2) / galaxy.shape.arms + nebula.offset
    nebulaAt.set([nebula.radius, phase, nebula.height, nebula.size], i * 4)
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
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
    uniforms: {
      ...orbit,
      uFade: fade,
      uAtlas: { value: atlas.target.texture },
      uGlow: { value: 0.6 },
    },
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
