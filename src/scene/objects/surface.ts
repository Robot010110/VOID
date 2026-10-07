/**
 * Factories for rocky surfaces, shared by planets and moons: the terrain and derive bake
 * materials, the surface shader's uniforms, and their debug-panel schemas.
 */
import { Color, Matrix3, ShaderMaterial, Vector3 } from 'three'
import type { SurfaceParams, TerrainParams } from '../../core/planets.ts'
import type { TweakSchema } from '../../core/tweaks.ts'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import deriveFrag from '../../shaders/planet/derive.frag'
import terrainFrag from '../../shaders/planet/terrain.frag'
import { linear } from '../shared/gpu.ts'
import { SUN_SIZE } from './atmosphere.ts'
import { seedOffset, type Sunlight } from './body.ts'

export const TERRAIN_STYLE: Record<TerrainParams['style'], string> = {
  continents: 'STYLE_CONTINENTS',
  dunes: 'STYLE_DUNES',
  ice: 'STYLE_ICE',
  lava: 'STYLE_LAVA',
  craters: 'STYLE_CRATERS',
}

/** Terrain bake material: one face at a time, style chosen at compile time. */
export function createTerrainBake(terrain: TerrainParams, seed: number): ShaderMaterial {
  return new ShaderMaterial({
    name: `terrain-${terrain.style}`,
    vertexShader: fullscreenVert,
    fragmentShader: terrainFrag,
    defines: { [TERRAIN_STYLE[terrain.style]]: '' },
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uFace: { value: 0 },
      uSize: { value: 1 },
      uSeedOffset: { value: seedOffset(seed) },
      uContinentScale: { value: terrain.continentScale },
      uWarp: { value: terrain.warp },
      uContinentBias: { value: terrain.continentBias },
      uMountainScale: { value: terrain.mountainScale },
      uMountainStrength: { value: terrain.mountainStrength },
      uHillStrength: { value: terrain.hillStrength },
      uMoistureScale: { value: terrain.moistureScale },
      uCraterDensity: { value: terrain.craterDensity },
      uCraterDepth: { value: terrain.craterDepth },
      uCrackScale: { value: terrain.crackScale },
    },
  })
}

/** Normals and settlement density, derived from the baked terrain. */
export function createDeriveBake(terrain: TerrainParams, surface: SurfaceParams): ShaderMaterial {
  return new ShaderMaterial({
    name: 'terrain-derive',
    vertexShader: fullscreenVert,
    fragmentShader: deriveFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTerrain: { value: null },
      uFace: { value: 0 },
      uSize: { value: 1 },
      uReliefScale: { value: terrain.reliefScale },
      uSeaLevel: { value: surface.seaLevel },
    },
  })
}

/** The surface material's own uniforms (atmosphere and map uniforms are merged in). */
export function surfaceUniforms(surface: SurfaceParams, sun: Sunlight) {
  return {
    uSunObj: { value: new Vector3() },
    uCamObj: { value: new Vector3() },
    uSunIrradiance: { value: sun.irradiance },
    uSunSize: { value: SUN_SIZE },
    uTime: { value: 0 },
    uFade: { value: 0 },
    uSeaLevel: { value: surface.seaLevel },
    uRelief: { value: surface.relief },
    uDetail: { value: surface.detail },
    uDetailOctaves: { value: 2 },
    uDeepWater: { value: linear(surface.deepWater) },
    uShallowWater: { value: linear(surface.shallowWater) },
    uShore: { value: linear(surface.shore) },
    uLowDry: { value: linear(surface.lowDry) },
    uLowWet: { value: linear(surface.lowWet) },
    uHighland: { value: linear(surface.highland) },
    uRock: { value: linear(surface.rock) },
    uSnow: { value: linear(surface.snow) },
    uMarking: { value: linear(surface.marking) },
    uIceCap: { value: surface.iceCap },
    uSnowLine: { value: surface.snowLine },
    uWaterRoughness: { value: surface.waterRoughness },
    uGlint: { value: surface.glint },
    uEmissive: { value: linear(surface.emissive) },
    uEmissiveStrength: { value: surface.emissiveStrength },
    uAmbient: { value: surface.ambient },
    uSkyAmbient: { value: new Color(0, 0, 0) },
    uCityColor: { value: new Color(0, 0, 0) },
    uCityDensity: { value: 0 },
    uCityIntensity: { value: 0 },
    uRoads: { value: 0 },
    uClock: { value: 0 },
    uRuinColor: { value: new Color(0, 0, 0) },
    uRuinStrength: { value: 0 },
    uRuinRelief: { value: 0 },
    uRuinSeed: { value: new Vector3() },
    uRoadNormal: { value: [new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0)] },
    uRoadAxis: { value: [new Vector3(1, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 0)] },
    uCloudShadow: { value: 0 },
    uCloudHeight: { value: 0 },
    uCloudThreshold: { value: 0.5 },
    uCloudRotation: { value: new Matrix3() },
    uRingInner: { value: 1 },
    uRingOuter: { value: 1 },
    uRingOpacity: { value: 0 },
  }
}

/** Debug controls for a surface: colours and shading apply live to the uniforms. */
export function surfaceSchema(surface: SurfaceParams): TweakSchema {
  return {
    // Dry worlds keep their sea far below the ground (-9); the panel must not clamp it up.
    seaLevel: { value: surface.seaLevel, min: -10, max: 1, step: 0.01 },
    relief: { value: surface.relief, min: 0, max: 1, step: 0.01 },
    detail: { value: surface.detail, min: 0, max: 2, step: 0.01 },
    deepWater: { value: surface.deepWater, color: true },
    shallowWater: { value: surface.shallowWater, color: true },
    shore: { value: surface.shore, color: true },
    lowDry: { value: surface.lowDry, color: true },
    lowWet: { value: surface.lowWet, color: true },
    highland: { value: surface.highland, color: true },
    rock: { value: surface.rock, color: true },
    snow: { value: surface.snow, color: true },
    marking: { value: surface.marking, color: true },
    iceCap: { value: surface.iceCap, min: 0, max: 1.2, step: 0.01 },
    snowLine: { value: surface.snowLine, min: 0, max: 2, step: 0.01 },
    waterRoughness: { value: surface.waterRoughness, min: 0.05, max: 1, step: 0.01 },
    glint: { value: surface.glint, min: 0, max: 3, step: 0.01 },
    emissive: { value: surface.emissive, color: true },
    emissiveStrength: { value: surface.emissiveStrength, min: 0, max: 12, step: 0.1 },
    ambient: { value: surface.ambient, min: 0, max: 0.03, step: 0.0005 },
  }
}

/** Debug controls for the terrain bake. Changing any of them re-bakes the maps. */
export function terrainSchema(terrain: TerrainParams): TweakSchema {
  return {
    continentScale: { value: terrain.continentScale, min: 0.3, max: 4, step: 0.01 },
    warp: { value: terrain.warp, min: 0, max: 2, step: 0.01 },
    continentBias: { value: terrain.continentBias, min: -0.6, max: 0.6, step: 0.01 },
    mountainScale: { value: terrain.mountainScale, min: 0.5, max: 10, step: 0.05 },
    mountainStrength: { value: terrain.mountainStrength, min: 0, max: 1.5, step: 0.01 },
    hillStrength: { value: terrain.hillStrength, min: 0, max: 0.5, step: 0.005 },
    moistureScale: { value: terrain.moistureScale, min: 0.3, max: 6, step: 0.05 },
    craterDensity: { value: terrain.craterDensity, min: 0, max: 1, step: 0.01 },
    craterDepth: { value: terrain.craterDepth, min: 0, max: 1, step: 0.01 },
    crackScale: { value: terrain.crackScale, min: 0, max: 8, step: 0.05 },
    reliefScale: { value: terrain.reliefScale, min: 0, max: 0.08, step: 0.001 },
  }
}

