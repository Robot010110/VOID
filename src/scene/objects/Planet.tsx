import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Color,
  FrontSide,
  Group,
  Matrix3,
  Mesh,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import type { PlanetPreset } from '../../core/planets.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import atmosphereFrag from '../../shaders/atmosphere/atmosphere.frag'
import atmosphereVert from '../../shaders/atmosphere/atmosphere.vert'
import cloudsFrag from '../../shaders/clouds/clouds.frag'
import surfaceFrag from '../../shaders/planet/surface.frag'
import surfaceVert from '../../shaders/planet/surface.vert'
import { cancelBake, enqueueBake } from '../shared/bake.ts'
import { peek, useShared } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { icosphere, linear, sphereDetail } from '../shared/gpu.ts'
import { FULL, useLevel } from '../levels/context.ts'
import { useAtmosphereTweaks } from './atmosphereTweaks.ts'
import {
  BODY_FADE_IN,
  fadeIn,
  pixelRadius,
  PREMULTIPLIED,
  SOLID,
  toObjectSpace,
  worldRadius,
  type Sunlight,
} from './body.ts'
import { Moon } from './Moon.tsx'
import { Rings } from './Rings.tsx'
import { surfaceSchema, surfaceUniforms, TERRAIN_STYLE, terrainSchema } from './surface.ts'
import { keepPolicy, planetFace, rockyKey, RockyWorld, type Detail } from './worlds.ts'

const CLOUD_RADIUS = 1.006

function applyColour(target: unknown, value: TweakValue) {
  if (target instanceof Color && typeof value === 'string') target.set(value)
}

const sunObj = new Vector3()
const camObj = new Vector3()
const cloudSun = new Vector3()
const cloudCam = new Vector3()
const worldCenter = new Vector3()

export interface WorldProps {
  preset: PlanetPreset
  sun: Sunlight
  /** Small maps for a world seen across its system, full-size maps close up. */
  detail?: Detail
  /**
   * The body being handed between levels: shown at once and kept at full strength through
   * the crossfade, since the other level's copy of it disappears in the same frame.
   */
  anchor?: boolean
  /** Expose every parameter to the debug panel (one world at a time). */
  tweakable?: boolean
}

/**
 * A rocky world: baked terrain, a lit surface with oceans and city lights, a churning cloud
 * layer, a scattering atmosphere, optional rings, and its moons. A unit sphere: its parent
 * places and scales it.
 */
export function Planet({ preset, sun, detail = 'close', anchor = false, tweakable = false }: WorldProps) {
  const terrain = preset.terrain!
  const surface = preset.surface!
  const gl = useThree((s) => s.gl)
  const level = useLevel()
  const [tier] = useState(() => useVoid.getState().quality)
  const quality = useVoid((s) => s.quality)
  const face = planetFace(detail, tier)
  const closeKey = rockyKey(preset, planetFace('close', tier))
  const world = useShared(rockyKey(preset, face), () => new RockyWorld(preset, face), keepPolicy(detail))

  const root = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const cloudSpin = useRef<Group>(null)
  const surfaceMesh = useRef<Mesh>(null)
  const cloudMesh = useRef<Mesh>(null)
  const shellMesh = useRef<Mesh>(null)
  const fade = useRef(0)
  const start = useRef<number | null>(null)
  const bound = useRef<RockyWorld | null>(null)

  const layers = useMemo(() => {
    const atmosphere = world.atmosphere
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
      ...SOLID,
      uniforms: {
        ...atmosphere.uniforms,
        ...surfaceUniforms(surface, sun),
        uTerrain: { value: null },
        uNormals: { value: null },
        uClouds: { value: null },
        uRingMap: { value: world.ringTexture },
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
          uCloudMap: { value: null },
          uNormals: { value: null },
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
          uDetailOctaves: { value: 2 },
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
  }, [preset, terrain, surface, world, sun])

  /** Point every layer at a set of baked maps (the small ones, or the close-up ones). */
  const bind = useCallback(
    (maps: RockyWorld) => {
      const g = layers.ground.uniforms
      g.uTerrain!.value = maps.terrain.texture
      g.uNormals!.value = maps.derived.texture
      g.uClouds!.value = maps.clouds.texture
      if (layers.clouds) {
        layers.clouds.uniforms.uCloudMap!.value = maps.clouds.texture
        layers.clouds.uniforms.uNormals!.value = maps.derived.texture
      }
      bound.current = maps
    },
    [layers],
  )

  // Bake now, or a little each frame when the level arrived mid-transition.
  useLayoutEffect(() => {
    if (world.job.ready) return
    if (level.background) {
      enqueueBake(world.job)
      return () => cancelBake(world.job)
    }
    world.job.run(gl)
  }, [world, gl, level.background])

  useEffect(() => {
    bound.current = null
    return () => {
      layers.ground.dispose()
      layers.clouds?.dispose()
      layers.shell?.dispose()
    }
  }, [layers])

  // Tier-dependent shading cost, adjustable at runtime without recompiling.
  useEffect(() => {
    layers.ground.uniforms.uDetailOctaves!.value = QUALITY[quality].detailOctaves
    if (layers.clouds) layers.clouds.uniforms.uDetailOctaves!.value = Math.min(2, QUALITY[quality].detailOctaves)
    if (layers.shell) layers.shell.uniforms.uSteps!.value = QUALITY[quality].atmosphereSteps
  }, [layers, quality])

  const lod = useRef(-1)

  useFrame((state) => {
    if (!root.current || !tilt.current || !spin.current || !surfaceMesh.current) return

    // Use the close-up maps whenever they exist and are baked; they are identical to the
    // planet level's, which is what makes the hand-over seamless.
    let maps: RockyWorld | null = world.job.ready ? world : null
    if (detail === 'system') {
      const close = peek<RockyWorld>(closeKey)
      if (close?.job.ready) maps = close
    }
    root.current.visible = maps !== null
    if (!maps) return
    if (maps !== bound.current) bind(maps)

    const time = worldClock.time
    if (start.current === null) start.current = anchor ? -Infinity : worldClock.real
    fade.current = fadeIn(worldClock.real, start.current, BODY_FADE_IN) * (anchor ? FULL : level.fade).current

    // Parents move every frame (orbits, level frames): bring their matrices up to date first.
    root.current.updateWorldMatrix(true, false)
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

    worldCenter.setFromMatrixPosition(surfaceMesh.current.matrixWorld)
    const radius = worldRadius(surfaceMesh.current)
    if (layers.shell) {
      ;(layers.shell.uniforms.uCenter!.value as Vector3).copy(worldCenter)
      layers.shell.uniforms.uScale!.value = radius
      layers.shell.uniforms.uFade!.value = fade.current
    }

    // Level of detail from the planet's size on screen.
    const height = state.size.height * state.viewport.dpr
    const pixels = pixelRadius(radius, camera.position.distanceTo(worldCenter), camera.fov, height)
    const detailLevel = sphereDetail(pixels)
    if (detailLevel !== lod.current) {
      lod.current = detailLevel
      const sphere = icosphere(detailLevel)
      surfaceMesh.current.geometry = sphere
      if (cloudMesh.current) cloudMesh.current.geometry = sphere
      if (shellMesh.current) shellMesh.current.geometry = sphere
    }
  })

  // Debug: every surface, terrain, cloud and atmosphere parameter of the one world in focus.
  const rebakeTimer = useRef(0)
  const scheduleRebake = useCallback(() => {
    window.clearTimeout(rebakeTimer.current)
    rebakeTimer.current = window.setTimeout(() => {
      world.job.restart()
      world.job.run(gl)
    }, 120)
  }, [world, gl])

  const surfaceTweaks = useMemo(() => (tweakable ? surfaceSchema(surface) : EMPTY), [surface, tweakable])
  const applySurface = useCallback(
    (key: string, value: TweakValue) => {
      const uniform = layers.ground.uniforms[`u${key.charAt(0).toUpperCase()}${key.slice(1)}`]
      if (!uniform) return
      if (uniform.value instanceof Color) applyColour(uniform.value, value)
      else uniform.value = value
      if (key === 'seaLevel') {
        world.deriveBake.uniforms.uSeaLevel!.value = value
        scheduleRebake()
      }
    },
    [layers, world, scheduleRebake],
  )
  useTweaks(`${preset.label}: surface`, surfaceTweaks, applySurface)

  const terrainTweaks = useMemo(() => (tweakable ? terrainSchema(terrain) : EMPTY), [terrain, tweakable])
  const applyTerrain = useCallback(
    (key: string, value: TweakValue) => {
      const name = `u${key.charAt(0).toUpperCase()}${key.slice(1)}`
      const uniform = key === 'reliefScale' ? world.deriveBake.uniforms[name] : world.terrainBake.uniforms[name]
      if (!uniform || typeof value !== 'number') return
      uniform.value = value
      scheduleRebake()
    },
    [world, scheduleRebake],
  )
  useTweaks(`${preset.label}: terrain`, terrainTweaks, applyTerrain)

  const cloudTweaks = useMemo<TweakSchema>(
    () =>
      tweakable && preset.clouds
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
        : EMPTY,
    [preset.clouds, preset.lights, tweakable],
  )
  const applyClouds = useCallback(
    (key: string, value: TweakValue) => {
      if (!layers.clouds) return
      const c = layers.clouds.uniforms
      const g = layers.ground.uniforms
      if (key === 'coverage' && world.cloudBake) {
        world.cloudBake.uniforms.uCoverage!.value = value
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
    [layers, world, scheduleRebake],
  )
  useTweaks(`${preset.label}: clouds`, cloudTweaks, applyClouds)

  const lightTweaks = useMemo<TweakSchema>(
    () =>
      tweakable && preset.lights
        ? {
            density: { value: preset.lights.density, min: 0, max: 1.5, step: 0.01 },
            intensity: { value: preset.lights.intensity, min: 0, max: 10, step: 0.05 },
            roads: { value: preset.lights.roads, min: 0, max: 1, step: 0.01 },
            color: { value: preset.lights.color, color: true },
          }
        : EMPTY,
    [preset.lights, tweakable],
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
  useTweaks(`${preset.label}: lights`, lightTweaks, applyLights)

  useAtmosphereTweaks(preset, world.atmosphere, () => world.atmosphere.bake(gl), tweakable)

  return (
    <group ref={root} visible={false}>
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
        {preset.rings && world.ringTexture && (
          <Rings rings={preset.rings} texture={world.ringTexture} sun={sun} fade={fade} />
        )}
        {preset.moons.map((moon, index) => (
          <Moon key={index} spec={moon} seed={preset.seed + index * 7919} sun={sun} fade={fade} detail={detail} />
        ))}
      </group>
    </group>
  )
}

const EMPTY: TweakSchema = {}
