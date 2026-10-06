/**
 * The baked resources behind a world: its cube maps, their bake passes, its atmosphere's
 * lookup table and its ring profile. Shared through the resource cache, at two levels of
 * detail: small maps for a world seen across its system, full-size maps close up. The same
 * maps serve the system view and the planet level, so a world handed from one to the other
 * looks exactly the same at the moment of the swap.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  HalfFloatType,
  LinearFilter,
  RedFormat,
  RGBAFormat,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  type WebGLCubeRenderTarget,
} from 'three'
import { bandPalette, MOON_SURFACES, type GasParams, type MoonSpec, type PlanetPreset } from '../../core/planets.ts'
import { QUALITY, type QualityTier } from '../../core/quality.ts'
import { Rng } from '../../core/rng.ts'
import cloudBakeFrag from '../../shaders/clouds/bake.frag'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import gasBakeFrag from '../../shaders/planet/gas-bake.frag'
import { BakeJob, type BakePass } from '../shared/bake.ts'
import type { Disposable, KeepPolicy } from '../shared/cache.ts'
import { createCubeTarget, linear } from '../shared/gpu.ts'
import { AtmosphereModel } from './atmosphere.ts'
import { seedOffset } from './body.ts'
import { createRingTexture } from './ringTexture.ts'
import { createDeriveBake, createTerrainBake } from './surface.ts'

export type Detail = 'system' | 'close'

/** Face size of the maps used while a world is seen from across its system. */
const SYSTEM_FACE = 128
const SYSTEM_MOON_FACE = 48

export function planetFace(detail: Detail, tier: QualityTier): number {
  return detail === 'close' ? QUALITY[tier].planetFace : SYSTEM_FACE
}

export function moonFace(detail: Detail, tier: QualityTier): number {
  return detail === 'close' ? QUALITY[tier].moonFace : SYSTEM_MOON_FACE
}

/**
 * Close-up maps are large (about 100 MB for a rocky world on High), so only one unused set
 * is kept, for going back and forth between a planet and its system. A world's moons keep
 * theirs alongside (they are a tenth the size). Small maps are cheap and kept for a few
 * minutes, so returning to a system is instant.
 */
export function keepPolicy(detail: Detail): KeepPolicy {
  return detail === 'close'
    ? { keepFor: 60_000, group: 'close', spare: 1 }
    : { keepFor: 180_000, group: 'system', spare: 96 }
}

export function moonPolicy(detail: Detail): KeepPolicy {
  return detail === 'close'
    ? { keepFor: 60_000, group: 'close-moons', spare: 6 }
    : { keepFor: 180_000, group: 'system', spare: 96 }
}

/** A rocky world: terrain, normals and population, clouds, air and rings. */
export class RockyWorld implements Disposable {
  readonly terrain: WebGLCubeRenderTarget
  readonly derived: WebGLCubeRenderTarget
  readonly clouds: WebGLCubeRenderTarget
  readonly terrainBake: ShaderMaterial
  readonly deriveBake: ShaderMaterial
  readonly cloudBake: ShaderMaterial | null
  readonly atmosphere: AtmosphereModel
  readonly ringTexture: DataTexture | null
  readonly job: BakeJob

  constructor(preset: PlanetPreset, face: number) {
    const terrain = preset.terrain!
    const surface = preset.surface!
    this.terrain = createCubeTarget(face, { type: HalfFloatType })
    this.derived = createCubeTarget(face)
    this.clouds = createCubeTarget(preset.clouds ? face : 4, { format: RedFormat })
    this.terrainBake = createTerrainBake(terrain, preset.seed)
    this.deriveBake = createDeriveBake(terrain, surface)
    this.deriveBake.uniforms.uTerrain!.value = this.terrain.texture
    this.cloudBake = preset.clouds ? createCloudBake(preset) : null
    this.atmosphere = new AtmosphereModel(preset.atmosphere)
    this.ringTexture = preset.rings ? createRingTexture(preset.rings, preset.seed) : null

    const passes: BakePass[] = [
      { target: this.terrain, material: this.terrainBake },
      { target: this.derived, material: this.deriveBake },
    ]
    if (this.cloudBake) passes.push({ target: this.clouds, material: this.cloudBake })
    this.job = new BakeJob(passes, (gl) => this.atmosphere.bake(gl))
  }

  dispose() {
    this.terrain.dispose()
    this.derived.dispose()
    this.clouds.dispose()
    this.terrainBake.dispose()
    this.deriveBake.dispose()
    this.cloudBake?.dispose()
    this.atmosphere.dispose()
    this.ringTexture?.dispose()
  }
}

function createCloudBake(preset: PlanetPreset): ShaderMaterial {
  const clouds = preset.clouds!
  const rng = new Rng(preset.seed ^ 0x5eed)
  const cyclones = Array.from({ length: 6 }, () => {
    const lat = rng.sign() * rng.range(0.22, 0.62)
    const lon = rng.range(0, Math.PI * 2)
    const c = Math.cos(Math.asin(lat))
    return new Vector4(c * Math.sin(lon), lat, c * Math.cos(lon), Math.sign(lat) * rng.range(0.8, 1.2))
  })
  const style = clouds.style === 'haze' ? 'STYLE_HAZE' : clouds.style === 'wisps' ? 'STYLE_WISPS' : 'STYLE_WEATHER'
  return new ShaderMaterial({
    name: 'clouds-bake',
    vertexShader: fullscreenVert,
    fragmentShader: cloudBakeFrag,
    defines: { [style]: '' },
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uFace: { value: 0 },
      uSize: { value: 1 },
      uSeedOffset: { value: seedOffset(preset.seed ^ 0xc10d) },
      uCoverage: { value: clouds.coverage },
      uScale: { value: clouds.scale },
      uCyclones: { value: cyclones },
      uCycloneCount: { value: clouds.cyclones },
    },
  })
}

export function rockyKey(preset: PlanetPreset, face: number): string {
  return `rocky:${preset.seed}:${face}`
}

/** Colour of every latitude of a gas giant, as a 256 x 1 strip. */
function createPalette(gas: GasParams, seed: number): DataTexture {
  const count = 256
  const colours = bandPalette(gas, seed, count)
  const data = new Uint8Array(count * 4)
  for (let i = 0; i < count; i++) {
    data[i * 4] = Math.round(colours[i * 3]! * 255)
    data[i * 4 + 1] = Math.round(colours[i * 3 + 1]! * 255)
    data[i * 4 + 2] = Math.round(colours[i * 3 + 2]! * 255)
    data[i * 4 + 3] = 255
  }
  const texture = new DataTexture(data, count, 1, RGBAFormat, UnsignedByteType)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

/** A gas giant: its banded cloud tops, its haze and its rings. */
export class GasWorld implements Disposable {
  readonly bands: WebGLCubeRenderTarget
  readonly palette: DataTexture
  readonly bake: ShaderMaterial
  readonly atmosphere: AtmosphereModel
  readonly ringTexture: DataTexture | null
  readonly job: BakeJob

  constructor(preset: PlanetPreset, face: number) {
    const gas = preset.gas!
    this.bands = createCubeTarget(face, { colorSpace: SRGBColorSpace })
    this.palette = createPalette(gas, preset.seed)
    this.bake = new ShaderMaterial({
      name: 'gas-bake',
      vertexShader: fullscreenVert,
      fragmentShader: gasBakeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uFace: { value: 0 },
        uSize: { value: 1 },
        uSeedOffset: { value: seedOffset(preset.seed) },
        uPalette: { value: this.palette },
        uTurbulence: { value: gas.turbulence },
        uPoleColor: { value: linear(gas.poleColor) },
      },
    })
    this.atmosphere = new AtmosphereModel(preset.atmosphere)
    this.ringTexture = preset.rings ? createRingTexture(preset.rings, preset.seed) : null
    this.job = new BakeJob([{ target: this.bands, material: this.bake }], (gl) =>
      this.atmosphere.bake(gl),
    )
  }

  dispose() {
    this.bands.dispose()
    this.palette.dispose()
    this.bake.dispose()
    this.atmosphere.dispose()
    this.ringTexture?.dispose()
  }
}

export function gasKey(preset: PlanetPreset, face: number): string {
  return `gas:${preset.seed}:${face}`
}

/** A moon: the barren or icy surface maps. */
export class MoonWorld implements Disposable {
  readonly terrain: WebGLCubeRenderTarget
  readonly derived: WebGLCubeRenderTarget
  readonly terrainBake: ShaderMaterial
  readonly deriveBake: ShaderMaterial
  readonly job: BakeJob

  constructor(spec: MoonSpec, seed: number, face: number) {
    const body = MOON_SURFACES[spec.kind]
    this.terrain = createCubeTarget(face, { type: HalfFloatType })
    this.derived = createCubeTarget(face)
    this.terrainBake = createTerrainBake(body.terrain, seed)
    this.deriveBake = createDeriveBake(body.terrain, body.surface)
    this.deriveBake.uniforms.uTerrain!.value = this.terrain.texture
    this.job = new BakeJob([
      { target: this.terrain, material: this.terrainBake },
      { target: this.derived, material: this.deriveBake },
    ])
  }

  dispose() {
    this.terrain.dispose()
    this.derived.dispose()
    this.terrainBake.dispose()
    this.deriveBake.dispose()
  }
}

export function moonKey(spec: MoonSpec, seed: number, face: number): string {
  return `moon:${spec.kind}:${seed}:${face}`
}
