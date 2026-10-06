import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  FrontSide,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
  type Group,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { bandPalette, type GasParams, type PlanetPreset } from '../../core/planets.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import atmosphereFrag from '../../shaders/atmosphere/atmosphere.frag'
import atmosphereVert from '../../shaders/atmosphere/atmosphere.vert'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import gasBakeFrag from '../../shaders/planet/gas-bake.frag'
import gasFrag from '../../shaders/planet/gas.frag'
import surfaceVert from '../../shaders/planet/surface.vert'
import { worldClock } from '../shared/clock.ts'
import { bakeCube, createCubeTarget, icosphere, linear, sphereDetail } from '../shared/gpu.ts'
import { AtmosphereModel } from './atmosphere.ts'
import { useAtmosphereTweaks } from './atmosphereTweaks.ts'
import { BODY_FADE_IN, fadeIn, PREMULTIPLIED, seedOffset, toObjectSpace, type Sunlight } from './body.ts'
import { Moon } from './Moon.tsx'
import { createRingTexture } from './ringTexture.ts'
import { Rings } from './Rings.tsx'

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

interface GasGiantProps {
  preset: PlanetPreset
  sun: Sunlight
}

/** A gas giant: banded cloud tops in differential rotation, storms, haze, rings and moons. */
export function GasGiant({ preset, sun }: GasGiantProps) {
  const gas = preset.gas!
  const gl = useThree((s) => s.gl)
  const [face] = useState(() => QUALITY[useVoid.getState().quality].planetFace)
  const quality = useVoid((s) => s.quality)

  const tilt = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const body = useRef<Mesh>(null)
  const shell = useRef<Mesh>(null)
  const fade = useRef(0)
  const start = useRef<number | null>(null)

  const bands = useMemo(() => createCubeTarget(face, { colorSpace: SRGBColorSpace }), [face])
  const palette = useMemo(() => createPalette(gas, preset.seed), [gas, preset.seed])
  const atmosphere = useMemo(() => new AtmosphereModel(preset.atmosphere), [preset.atmosphere])
  const ringTexture = useMemo(
    () => (preset.rings ? createRingTexture(preset.rings, preset.seed) : null),
    [preset.rings, preset.seed],
  )

  const bake = useMemo(
    () =>
      new ShaderMaterial({
        name: 'gas-bake',
        vertexShader: fullscreenVert,
        fragmentShader: gasBakeFrag,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uFace: { value: 0 },
          uSize: { value: 1 },
          uSeedOffset: { value: seedOffset(preset.seed) },
          uPalette: { value: palette },
          uTurbulence: { value: gas.turbulence },
          uPoleColor: { value: linear(gas.poleColor) },
        },
      }),
    [preset.seed, palette, gas],
  )

  const layers = useMemo(() => {
    const { storms, colours } = stormUniforms(gas)
    const deck = new ShaderMaterial({
      name: `gas-${preset.kind}`,
      vertexShader: surfaceVert,
      fragmentShader: gasFrag,
      defines: preset.rings ? { RINGS: '' } : {},
      uniforms: {
        ...atmosphere.uniforms,
        uBands: { value: bands.texture },
        uRingMap: { value: ringTexture },
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
  }, [preset, gas, atmosphere, bands, ringTexture, sun])

  const rebake = useCallback(() => {
    bakeCube(gl, bands, bake)
    atmosphere.bake(gl)
  }, [gl, bands, bake, atmosphere])

  useLayoutEffect(() => {
    rebake()
    start.current = null
  }, [rebake])

  useEffect(
    () => () => {
      bands.dispose()
      palette.dispose()
      atmosphere.dispose()
      ringTexture?.dispose()
      bake.dispose()
      layers.deck.dispose()
      layers.haze.dispose()
    },
    [bands, palette, atmosphere, ringTexture, bake, layers],
  )

  useEffect(() => {
    layers.haze.uniforms.uSteps!.value = QUALITY[quality].atmosphereSteps
  }, [layers, quality])

  const lod = useRef(-1)

  useFrame((state) => {
    if (!tilt.current || !spin.current || !body.current) return
    const time = worldClock.time
    if (start.current === null) start.current = worldClock.real
    fade.current = fadeIn(worldClock.real, start.current, BODY_FADE_IN)

    spin.current.rotation.y = (time / preset.dayLength) * Math.PI * 2
    tilt.current.updateMatrixWorld(true)

    const camera = state.camera as PerspectiveCamera
    toObjectSpace(body.current, sun.direction, camera.position, sunObj, camObj)
    const u = layers.deck.uniforms
    ;(u.uSunObj!.value as Vector3).copy(sunObj)
    ;(u.uCamObj!.value as Vector3).copy(camObj)
    u.uTime!.value = time
    u.uFade!.value = fade.current

    body.current.getWorldPosition(center)
    ;(layers.haze.uniforms.uCenter!.value as Vector3).copy(center)
    layers.haze.uniforms.uFade!.value = fade.current

    const distance = camera.position.distanceTo(center)
    const pixels =
      (1 / Math.max(distance, 1.0001)) / Math.tan((camera.fov * Math.PI) / 360) * state.size.height * state.viewport.dpr * 0.5
    const detail = sphereDetail(pixels)
    if (detail !== lod.current) {
      lod.current = detail
      body.current.geometry = icosphere(detail)
      if (shell.current) shell.current.geometry = icosphere(detail)
    }
  })

  const schema = useMemo<TweakSchema>(
    () => ({
      turbulence: { value: gas.turbulence, min: 0, max: 3, step: 0.01 },
      jetSpeed: { value: gas.jetSpeed, min: 0, max: 0.03, step: 0.0005 },
      jetCount: { value: gas.jetCount, min: 2, max: 40, step: 1 },
      stormSwirl: { value: gas.stormSwirl, min: 0, max: 8, step: 0.05 },
      limbDarkening: { value: gas.limbDarkening, min: 0, max: 1, step: 0.01 },
      poleColor: { value: gas.poleColor, color: true },
      ambient: { value: gas.ambient, min: 0, max: 0.03, step: 0.0005 },
    }),
    [gas],
  )
  const timer = useRef(0)
  const apply = useCallback(
    (key: string, value: TweakValue) => {
      const u = layers.deck.uniforms
      if (key === 'turbulence' || key === 'poleColor') {
        if (key === 'turbulence') bake.uniforms.uTurbulence!.value = value
        else (bake.uniforms.uPoleColor!.value as Color).set(value as string)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(rebake, 120)
        return
      }
      const uniform = u[`u${key.charAt(0).toUpperCase()}${key.slice(1)}`]
      if (uniform) uniform.value = value
    },
    [layers, bake, rebake],
  )
  useTweaks(`${preset.label}: bands`, schema, apply)
  useAtmosphereTweaks(preset, atmosphere, () => atmosphere.bake(gl))

  return (
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
      {preset.rings && ringTexture && <Rings rings={preset.rings} texture={ringTexture} sun={sun} fade={fade} />}
      {preset.moons.map((moon, index) => (
        <Moon key={index} spec={moon} seed={preset.seed + index * 7919} sun={sun} fade={fade} />
      ))}
    </group>
  )
}
