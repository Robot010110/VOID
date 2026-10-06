import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Color, FrontSide, ShaderMaterial, Vector3, Vector4, type Group, type Mesh, type PerspectiveCamera } from 'three'
import type { GasParams } from '../../core/planets.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import atmosphereFrag from '../../shaders/atmosphere/atmosphere.frag'
import atmosphereVert from '../../shaders/atmosphere/atmosphere.vert'
import gasFrag from '../../shaders/planet/gas.frag'
import surfaceVert from '../../shaders/planet/surface.vert'
import { cancelBake, enqueueBake } from '../shared/bake.ts'
import { peek, useShared } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { icosphere, linear, sphereDetail } from '../shared/gpu.ts'
import { FULL, useLevel } from '../levels/context.ts'
import { useAtmosphereTweaks } from './atmosphereTweaks.ts'
import { BODY_FADE_IN, fadeIn, pixelRadius, PREMULTIPLIED, SOLID, toObjectSpace, worldRadius } from './body.ts'
import { Moon } from './Moon.tsx'
import type { WorldProps } from './Planet.tsx'
import { Rings } from './Rings.tsx'
import { gasKey, GasWorld, keepPolicy, planetFace } from './worlds.ts'

/** Storm centres as unit directions with their radius in w. */
function stormUniforms(gas: GasParams) {
  const storms = Array.from({ length: 3 }, (_, i) => {
    const storm = gas.storms[i]
    if (!storm) return new Vector4(0, 1, 0, 0.01)
    const c = Math.cos(Math.asin(storm.lat))
    return new Vector4(c * Math.sin(storm.lon), storm.lat, c * Math.cos(storm.lon), storm.radius)
  })
  const colours = Array.from({ length: 3 }, (_, i) => linear(gas.storms[i]?.color ?? '#000000'))
  return { storms, colours }
}

const sunObj = new Vector3()
const camObj = new Vector3()
const center = new Vector3()
const EMPTY: TweakSchema = {}

/** A gas giant: banded cloud tops in differential rotation, storms, haze, rings and moons. */
export function GasGiant({ preset, sun, detail = 'close', anchor = false, tweakable = false }: WorldProps) {
  const gas = preset.gas!
  const gl = useThree((s) => s.gl)
  const level = useLevel()
  const [tier] = useState(() => useVoid.getState().quality)
  const quality = useVoid((s) => s.quality)
  const face = planetFace(detail, tier)
  const closeKey = gasKey(preset, planetFace('close', tier))
  const world = useShared(gasKey(preset, face), () => new GasWorld(preset, face), keepPolicy(detail))

  const root = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const body = useRef<Mesh>(null)
  const shell = useRef<Mesh>(null)
  const fade = useRef(0)
  const start = useRef<number | null>(null)
  const bound = useRef<GasWorld | null>(null)

  const layers = useMemo(() => {
    const atmosphere = world.atmosphere
    const { storms, colours } = stormUniforms(gas)
    const deck = new ShaderMaterial({
      name: `gas-${preset.kind}`,
      vertexShader: surfaceVert,
      fragmentShader: gasFrag,
      defines: preset.rings ? { RINGS: '' } : {},
      ...SOLID,
      uniforms: {
        ...atmosphere.uniforms,
        uBands: { value: null },
        uRingMap: { value: world.ringTexture },
        uSunObj: { value: new Vector3() },
        uCamObj: { value: new Vector3() },
        uSunIrradiance: { value: sun.irradiance },
        uTime: { value: 0 },
        uFade: { value: 0 },
        uJetSpeed: { value: gas.jetSpeed },
        uJetCount: { value: gas.jetCount },
        uStorms: { value: storms },
        uStormColors: { value: colours },
        uStormCount: { value: gas.storms.length },
        uStormSwirl: { value: gas.stormSwirl },
        uLimbDarkening: { value: gas.limbDarkening },
        uAmbient: { value: gas.ambient },
        uDetail: { value: 1 },
        uRingInner: { value: preset.rings?.inner ?? 1 },
        uRingOuter: { value: preset.rings?.outer ?? 1 },
        uRingOpacity: { value: preset.rings?.opacity ?? 0 },
      },
    })
    const haze = new ShaderMaterial({
      name: 'gas-atmosphere',
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
    return { deck, haze }
  }, [preset, gas, world, sun])

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
      layers.deck.dispose()
      layers.haze.dispose()
    }
  }, [layers])

  useEffect(() => {
    layers.haze.uniforms.uSteps!.value = QUALITY[quality].atmosphereSteps
  }, [layers, quality])

  const lod = useRef(-1)

  useFrame((state) => {
    if (!root.current || !tilt.current || !spin.current || !body.current) return
    let maps: GasWorld | null = world.job.ready ? world : null
    if (detail === 'system') {
      const close = peek<GasWorld>(closeKey)
      if (close?.job.ready) maps = close
    }
    root.current.visible = maps !== null
    if (!maps) return
    if (maps !== bound.current) {
      layers.deck.uniforms.uBands!.value = maps.bands.texture
      bound.current = maps
    }

    const time = worldClock.time
    if (start.current === null) start.current = anchor ? -Infinity : worldClock.real
    fade.current = fadeIn(worldClock.real, start.current, BODY_FADE_IN) * (anchor ? FULL : level.fade).current

    root.current.updateWorldMatrix(true, false)
    spin.current.rotation.y = (time / preset.dayLength) * Math.PI * 2
    tilt.current.updateMatrixWorld(true)

    const camera = state.camera as PerspectiveCamera
    toObjectSpace(body.current, sun.direction, camera.position, sunObj, camObj)
    const u = layers.deck.uniforms
    ;(u.uSunObj!.value as Vector3).copy(sunObj)
    ;(u.uCamObj!.value as Vector3).copy(camObj)
    u.uTime!.value = time
    u.uFade!.value = fade.current

    center.setFromMatrixPosition(body.current.matrixWorld)
    const radius = worldRadius(body.current)
    ;(layers.haze.uniforms.uCenter!.value as Vector3).copy(center)
    layers.haze.uniforms.uScale!.value = radius
    layers.haze.uniforms.uFade!.value = fade.current

    const height = state.size.height * state.viewport.dpr
    const detailLevel = sphereDetail(pixelRadius(radius, camera.position.distanceTo(center), camera.fov, height))
    if (detailLevel !== lod.current) {
      lod.current = detailLevel
      body.current.geometry = icosphere(detailLevel)
      if (shell.current) shell.current.geometry = icosphere(detailLevel)
    }
  })

  const schema = useMemo<TweakSchema>(
    () =>
      tweakable
        ? {
            turbulence: { value: gas.turbulence, min: 0, max: 3, step: 0.01 },
            jetSpeed: { value: gas.jetSpeed, min: 0, max: 0.03, step: 0.0005 },
            jetCount: { value: gas.jetCount, min: 2, max: 40, step: 1 },
            stormSwirl: { value: gas.stormSwirl, min: 0, max: 8, step: 0.05 },
            limbDarkening: { value: gas.limbDarkening, min: 0, max: 1, step: 0.01 },
            poleColor: { value: gas.poleColor, color: true },
            ambient: { value: gas.ambient, min: 0, max: 0.03, step: 0.0005 },
          }
        : EMPTY,
    [gas, tweakable],
  )
  const timer = useRef(0)
  const apply = useCallback(
    (key: string, value: TweakValue) => {
      const u = layers.deck.uniforms
      if (key === 'turbulence' || key === 'poleColor') {
        if (key === 'turbulence') world.bake.uniforms.uTurbulence!.value = value
        else (world.bake.uniforms.uPoleColor!.value as Color).set(value as string)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          world.job.restart()
          world.job.run(gl)
        }, 120)
        return
      }
      const uniform = u[`u${key.charAt(0).toUpperCase()}${key.slice(1)}`]
      if (uniform) uniform.value = value
    },
    [layers, world, gl],
  )
  useTweaks(`${preset.label}: bands`, schema, apply)
  useAtmosphereTweaks(preset, world.atmosphere, () => world.atmosphere.bake(gl), tweakable)

  return (
    <group ref={root} visible={false}>
      <group ref={tilt} rotation={[0, 0, preset.tilt]}>
        <group ref={spin}>
          <mesh ref={body} geometry={icosphere(24)} material={layers.deck} frustumCulled={false} dispose={null} />
        </group>
        <mesh
          ref={shell}
          geometry={icosphere(24)}
          material={layers.haze}
          scale={1 + (preset.atmosphere?.thickness ?? 0)}
          renderOrder={2}
          frustumCulled={false}
          dispose={null}
        />
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
