import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Color,
  FrontSide,
  Group,
  HalfFloatType,
  Matrix3,
  Mesh,
  RedFormat,
  ShaderMaterial,
  Vector3,
  Vector4,
  type DataTexture,
  type PerspectiveCamera,
} from 'three'
import type { PlanetPreset } from '../../core/planets.ts'
import { QUALITY } from '../../core/quality.ts'
import { Rng } from '../../core/rng.ts'
import { useVoid } from '../../core/store.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import atmosphereFrag from '../../shaders/atmosphere/atmosphere.frag'
import atmosphereVert from '../../shaders/atmosphere/atmosphere.vert'
import cloudBakeFrag from '../../shaders/clouds/bake.frag'
import cloudsFrag from '../../shaders/clouds/clouds.frag'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import surfaceFrag from '../../shaders/planet/surface.frag'
import surfaceVert from '../../shaders/planet/surface.vert'
import { worldClock } from '../shared/clock.ts'
import { bakeCube, createCubeTarget, icosphere, linear, sphereDetail } from '../shared/gpu.ts'
import { AtmosphereModel } from './atmosphere.ts'
import { useAtmosphereTweaks } from './atmosphereTweaks.ts'
import { BODY_FADE_IN, fadeIn, PREMULTIPLIED, seedOffset, toObjectSpace, type Sunlight } from './body.ts'
import { Moon } from './Moon.tsx'
import { createRingTexture } from './ringTexture.ts'
import { Rings } from './Rings.tsx'
import {
  createDeriveBake,
  createTerrainBake,
  surfaceSchema,
  surfaceUniforms,
  TERRAIN_STYLE,
  terrainSchema,
} from './surface.ts'

const CLOUD_RADIUS = 1.006

function applyColour(target: unknown, value: TweakValue) {
  if (target instanceof Color && typeof value === 'string') target.set(value)
}

const sunObj = new Vector3()
const camObj = new Vector3()
const cloudSun = new Vector3()
const cloudCam = new Vector3()
const worldCenter = new Vector3()

interface PlanetProps {
  preset: PlanetPreset
  sun: Sunlight
}

/**
 * A rocky world: baked terrain, a lit surface with oceans and city lights, a churning cloud
 * layer, a scattering atmosphere, optional rings, and its moons. Radius 1 at the origin.
 */
export function Planet({ preset, sun }: PlanetProps) {
  const terrain = preset.terrain!
  const surface = preset.surface!
  const gl = useThree((s) => s.gl)
  const [tier] = useState(() => useVoid.getState().quality)
  const settings = QUALITY[tier]
  const quality = useVoid((s) => s.quality)

  const tilt = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const cloudSpin = useRef<Group>(null)
  const surfaceMesh = useRef<Mesh>(null)
  const cloudMesh = useRef<Mesh>(null)
  const shellMesh = useRef<Mesh>(null)
  const fade = useRef(0)
  const start = useRef<number | null>(null)

  const maps = useMemo(
    () => ({
      terrain: createCubeTarget(settings.planetFace, { type: HalfFloatType }),
      derived: createCubeTarget(settings.planetFace),
      clouds: createCubeTarget(preset.clouds ? settings.planetFace : 4, { format: RedFormat }),
    }),
    [settings.planetFace, preset.clouds],
  )
  const atmosphere = useMemo(() => new AtmosphereModel(preset.atmosphere), [preset.atmosphere])
  const ringTexture = useMemo<DataTexture | null>(
    () => (preset.rings ? createRingTexture(preset.rings, preset.seed) : null),
    [preset.rings, preset.seed],
  )

  const bakes = useMemo(() => {
    const terrainBake = createTerrainBake(terrain, preset.seed)
    const deriveBake = createDeriveBake(terrain, surface)
    deriveBake.uniforms.uTerrain!.value = maps.terrain.texture
    let cloudBake: ShaderMaterial | null = null
    if (preset.clouds) {
      const rng = new Rng(preset.seed ^ 0x5eed)
      const cyclones = Array.from({ length: 6 }, () => {
        const lat = rng.sign() * rng.range(0.22, 0.62)
        const lon = rng.range(0, Math.PI * 2)
        const c = Math.cos(Math.asin(lat))
        return new Vector4(c * Math.sin(lon), lat, c * Math.cos(lon), Math.sign(lat) * rng.range(0.8, 1.2))
      })
      const style = preset.clouds.style === 'haze' ? 'STYLE_HAZE' : preset.clouds.style === 'wisps' ? 'STYLE_WISPS' : 'STYLE_WEATHER'
      cloudBake = new ShaderMaterial({
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
          uCoverage: { value: preset.clouds.coverage },
          uScale: { value: preset.clouds.scale },
          uCyclones: { value: cyclones },
          uCycloneCount: { value: preset.clouds.cyclones },
        },
      })
    }
    return { terrainBake, deriveBake, cloudBake }
  }, [terrain, surface, preset.seed, preset.clouds, maps])

  const layers = useMemo(() => {
    const hasAtmosphere = preset.atmosphere !== undefined
    const defines: Record<string, string> = { [TERRAIN_STYLE[terrain.style]]: '' }
    if (hasAtmosphere) defines.ATMOSPHERE = ''
    if (surface.seaLevel > -1) defines.OCEAN = ''
    if (preset.clouds) defines.CLOUDS = ''
    if (preset.rings) defines.RINGS = ''
    if (preset.lights) defines.LIGHTS = ''
    if (surface.emissiveStrength > 0) defines.LAVA = ''

    const ground = new ShaderMaterial({
      name: `surface-${preset.kind}`,
      vertexShader: surfaceVert,
      fragmentShader: surfaceFrag,
      defines,
      uniforms: {
        ...atmosphere.uniforms,
        ...surfaceUniforms(surface, sun),
        uTerrain: { value: maps.terrain.texture },
        uNormals: { value: maps.derived.texture },
        uClouds: { value: maps.clouds.texture },
        uRingMap: { value: ringTexture },
      },
    })
    const u = ground.uniforms
    if (hasAtmosphere) {
      const r = preset.atmosphere!.rayleigh
      const peak = Math.max(...r)
      ;(u.uSkyAmbient!.value as Color).setRGB(r[0] / peak, r[1] / peak, r[2] / peak).multiplyScalar(0.03)
    }
    if (preset.lights) {
      ;(u.uCityColor!.value as Color).set(preset.lights.color)
      u.uCityDensity!.value = preset.lights.density
      u.uCityIntensity!.value = preset.lights.intensity
      u.uRoads!.value = preset.lights.roads
    }
    if (preset.clouds) {
      u.uCloudShadow!.value = preset.clouds.shadow
      u.uCloudHeight!.value = preset.clouds.height
      u.uCloudThreshold!.value = preset.clouds.threshold
    }
    if (preset.rings) {
      u.uRingInner!.value = preset.rings.inner
      u.uRingOuter!.value = preset.rings.outer
      u.uRingOpacity!.value = preset.rings.opacity
    }

    let clouds: ShaderMaterial | null = null
    if (preset.clouds) {
      clouds = new ShaderMaterial({
        name: 'clouds',
        vertexShader: surfaceVert,
        fragmentShader: cloudsFrag,
        side: FrontSide,
        ...PREMULTIPLIED,
        uniforms: {
          ...atmosphere.uniforms,
          uCloudMap: { value: maps.clouds.texture },
          uNormals: { value: maps.derived.texture },
          uSurfaceRotation: { value: new Matrix3() },
          uSunObj: { value: new Vector3() },
          uSunIrradiance: { value: sun.irradiance },
          uTime: { value: 0 },
          uFlow: { value: preset.clouds.flow },
          uThreshold: { value: preset.clouds.threshold },
          uSoftness: { value: preset.clouds.softness },
          uOpacity: { value: preset.clouds.opacity },
          uCloudColor: { value: linear(preset.clouds.color) },
          uAmbient: { value: surface.ambient },
          uDetail: { value: 1 },
          uCloudRadius: { value: CLOUD_RADIUS },
          uCityColor: { value: linear(preset.lights?.color ?? '#000000') },
          uCityGlow: { value: preset.lights ? 0.015 : 0 },
          uFade: { value: 0 },
        },
      })
    }

    let shell: ShaderMaterial | null = null
    if (hasAtmosphere) {
      shell = new ShaderMaterial({
        name: 'atmosphere',
        vertexShader: atmosphereVert,
        fragmentShader: atmosphereFrag,
        side: FrontSide,
        ...PREMULTIPLIED,
        uniforms: {
          ...atmosphere.uniforms,
          uCenter: { value: new Vector3() },
          uScale: { value: 1 },
          uSunDir: { value: sun.direction },
          uSunIrradiance: { value: sun.irradiance },
          uSteps: { value: 8 },
          uFade: { value: 0 },
        },
      })
    }
    return { ground, clouds, shell }
  }, [preset, terrain, surface, atmosphere, maps, ringTexture, sun])

  // Bake every map, then let the planet fade in.
  const bake = useCallback(() => {
    bakeCube(gl, maps.terrain, bakes.terrainBake)
    bakeCube(gl, maps.derived, bakes.deriveBake)
    if (bakes.cloudBake) bakeCube(gl, maps.clouds, bakes.cloudBake)
    atmosphere.bake(gl)
  }, [gl, maps, bakes, atmosphere])

  useLayoutEffect(() => {
    bake()
    start.current = null
  }, [bake])

  useEffect(
    () => () => {
      maps.terrain.dispose()
      maps.derived.dispose()
      maps.clouds.dispose()
      atmosphere.dispose()
      ringTexture?.dispose()
      bakes.terrainBake.dispose()
      bakes.deriveBake.dispose()
      bakes.cloudBake?.dispose()
      layers.ground.dispose()
      layers.clouds?.dispose()
      layers.shell?.dispose()
    },
    [maps, atmosphere, ringTexture, bakes, layers],
  )

  // Tier-dependent shading cost, adjustable at runtime without recompiling.
  useEffect(() => {
    layers.ground.uniforms.uDetailOctaves!.value = QUALITY[quality].detailOctaves
    if (layers.shell) layers.shell.uniforms.uSteps!.value = QUALITY[quality].atmosphereSteps
  }, [layers, quality])

  const lod = useRef(-1)

  useFrame((state) => {
    if (!tilt.current || !spin.current || !surfaceMesh.current) return
    const time = worldClock.time
    if (start.current === null) start.current = worldClock.real
    fade.current = fadeIn(worldClock.real, start.current, BODY_FADE_IN)

    const angle = (time / preset.dayLength) * Math.PI * 2
    spin.current.rotation.y = angle
    if (cloudSpin.current && preset.clouds) cloudSpin.current.rotation.y = angle * preset.clouds.spin
    tilt.current.updateMatrixWorld(true)

    const camera = state.camera as PerspectiveCamera
    toObjectSpace(surfaceMesh.current, sun.direction, camera.position, sunObj, camObj)
    const g = layers.ground.uniforms
    ;(g.uSunObj!.value as Vector3).copy(sunObj)
    ;(g.uCamObj!.value as Vector3).copy(camObj)
    g.uTime!.value = time
    g.uFade!.value = fade.current

    if (layers.clouds && cloudMesh.current && preset.clouds) {
      // Clouds turn `relative` radians further than the ground. A surface direction maps to
      // the cloud layer's own space by turning back through that angle, and vice versa.
      const relative = angle * (preset.clouds.spin - 1)
      const cos = Math.cos(relative)
      const sin = Math.sin(relative)
      ;(g.uCloudRotation!.value as Matrix3).set(cos, 0, -sin, 0, 1, 0, sin, 0, cos)
      const c = layers.clouds.uniforms
      ;(c.uSurfaceRotation!.value as Matrix3).copy(g.uCloudRotation!.value as Matrix3).transpose()
      toObjectSpace(cloudMesh.current, sun.direction, camera.position, cloudSun, cloudCam)
      ;(c.uSunObj!.value as Vector3).copy(cloudSun)
      c.uTime!.value = time
      c.uFade!.value = fade.current
    }

    if (layers.shell && shellMesh.current) {
      shellMesh.current.getWorldPosition(worldCenter)
      ;(layers.shell.uniforms.uCenter!.value as Vector3).copy(worldCenter)
      layers.shell.uniforms.uFade!.value = fade.current
    }

    // Level of detail from the planet's size on screen.
    const distance = camera.position.distanceTo(worldCenter.setFromMatrixPosition(surfaceMesh.current.matrixWorld))
    const pixels = (1 / Math.max(distance, 1.0001)) / Math.tan((camera.fov * Math.PI) / 360) * state.size.height * state.viewport.dpr * 0.5
    const detail = sphereDetail(pixels)
    if (detail !== lod.current) {
      lod.current = detail
      const sphere = icosphere(detail)
      surfaceMesh.current.geometry = sphere
      if (cloudMesh.current) cloudMesh.current.geometry = sphere
      if (shellMesh.current) shellMesh.current.geometry = sphere
    }
  })

  // Debug: every surface, terrain, cloud and atmosphere parameter.
  const rebakeTimer = useRef(0)
  const scheduleRebake = useCallback(() => {
    window.clearTimeout(rebakeTimer.current)
    rebakeTimer.current = window.setTimeout(bake, 120)
  }, [bake])

  const surfaceTweaks = useMemo(() => surfaceSchema(surface), [surface])
  const applySurface = useCallback(
    (key: string, value: TweakValue) => {
      const uniform = layers.ground.uniforms[`u${key.charAt(0).toUpperCase()}${key.slice(1)}`]
      if (!uniform) return
      if (uniform.value instanceof Color) applyColour(uniform.value, value)
      else uniform.value = value
      if (key === 'seaLevel') {
        bakes.deriveBake.uniforms.uSeaLevel!.value = value
        scheduleRebake()
      }
    },
    [layers, bakes, scheduleRebake],
  )
  useTweaks(`${preset.label}: surface`, surfaceTweaks, applySurface)

  const terrainTweaks = useMemo(() => terrainSchema(terrain), [terrain])
  const applyTerrain = useCallback(
    (key: string, value: TweakValue) => {
      const name = `u${key.charAt(0).toUpperCase()}${key.slice(1)}`
      const uniform = key === 'reliefScale' ? bakes.deriveBake.uniforms[name] : bakes.terrainBake.uniforms[name]
      if (!uniform || typeof value !== 'number') return
      uniform.value = value
      scheduleRebake()
    },
    [bakes, scheduleRebake],
  )
  useTweaks(`${preset.label}: terrain`, terrainTweaks, applyTerrain)

  const cloudTweaks = useMemo<TweakSchema | null>(
    () =>
      preset.clouds
        ? {
            coverage: { value: preset.clouds.coverage, min: 0, max: 1, step: 0.01 },
            threshold: { value: preset.clouds.threshold, min: 0, max: 1, step: 0.01 },
            softness: { value: preset.clouds.softness, min: 0.01, max: 0.6, step: 0.01 },
            opacity: { value: preset.clouds.opacity, min: 0, max: 1, step: 0.01 },
            flow: { value: preset.clouds.flow, min: 0, max: 0.2, step: 0.001 },
            color: { value: preset.clouds.color, color: true },
            shadow: { value: preset.clouds.shadow, min: 0, max: 1, step: 0.01 },
            cityGlow: { value: preset.lights ? 0.015 : 0, min: 0, max: 0.2, step: 0.001 },
          }
        : null,
    [preset.clouds, preset.lights],
  )
  const applyClouds = useCallback(
    (key: string, value: TweakValue) => {
      if (!layers.clouds) return
      const c = layers.clouds.uniforms
      const g = layers.ground.uniforms
      if (key === 'coverage' && bakes.cloudBake) {
        bakes.cloudBake.uniforms.uCoverage!.value = value
        scheduleRebake()
      } else if (key === 'color') applyColour(c.uCloudColor!.value, value)
      else if (key === 'shadow') g.uCloudShadow!.value = value
      else if (key === 'cityGlow') c.uCityGlow!.value = value
      else if (key === 'threshold') {
        c.uThreshold!.value = value
        g.uCloudThreshold!.value = value
      } else {
        const uniform = c[`u${key.charAt(0).toUpperCase()}${key.slice(1)}`]
        if (uniform) uniform.value = value
      }
    },
    [layers, bakes, scheduleRebake],
  )
  useTweaks(`${preset.label}: clouds`, cloudTweaks ?? EMPTY, applyClouds)

  const lightTweaks = useMemo<TweakSchema | null>(
    () =>
      preset.lights
        ? {
            density: { value: preset.lights.density, min: 0, max: 1.5, step: 0.01 },
            intensity: { value: preset.lights.intensity, min: 0, max: 10, step: 0.05 },
            roads: { value: preset.lights.roads, min: 0, max: 1, step: 0.01 },
            color: { value: preset.lights.color, color: true },
          }
        : null,
    [preset.lights],
  )
  const applyLights = useCallback(
    (key: string, value: TweakValue) => {
      const g = layers.ground.uniforms
      if (key === 'density') g.uCityDensity!.value = value
      else if (key === 'intensity') g.uCityIntensity!.value = value
      else if (key === 'roads') g.uRoads!.value = value
      else if (key === 'color') {
        applyColour(g.uCityColor!.value, value)
        if (layers.clouds) applyColour(layers.clouds.uniforms.uCityColor!.value, value)
      }
    },
    [layers],
  )
  useTweaks(`${preset.label}: lights`, lightTweaks ?? EMPTY, applyLights)

  useAtmosphereTweaks(preset, atmosphere, () => atmosphere.bake(gl))

  return (
    <group ref={tilt} rotation={[0, 0, preset.tilt]}>
      <group ref={spin}>
        <mesh
          ref={surfaceMesh}
          geometry={icosphere(24)}
          material={layers.ground}
          frustumCulled={false}
          dispose={null}
        />
      </group>
      {layers.clouds && (
        <group ref={cloudSpin}>
          <mesh
            ref={cloudMesh}
            geometry={icosphere(24)}
            material={layers.clouds}
            scale={CLOUD_RADIUS}
            renderOrder={1}
            frustumCulled={false}
            dispose={null}
          />
        </group>
      )}
      {layers.shell && (
        <mesh
          ref={shellMesh}
          geometry={icosphere(24)}
          material={layers.shell}
          scale={1 + (preset.atmosphere?.thickness ?? 0)}
          renderOrder={2}
          frustumCulled={false}
          dispose={null}
        />
      )}
      {preset.rings && ringTexture && <Rings rings={preset.rings} texture={ringTexture} sun={sun} fade={fade} />}
      {preset.moons.map((moon, index) => (
        <Moon key={index} spec={moon} seed={preset.seed + index * 7919} sun={sun} fade={fade} />
      ))}
    </group>
  )
}

const EMPTY: TweakSchema = {}

