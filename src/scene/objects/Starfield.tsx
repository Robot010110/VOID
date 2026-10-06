import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  OrthographicCamera,
  Points,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type IUniform,
} from 'three'
import { SHOT } from '../../core/env.ts'
import { QUALITY, STAR_CATALOGUE_SIZE } from '../../core/quality.ts'
import { hashSeed, Rng, UNIVERSE_SEED } from '../../core/rng.ts'
import { generateSky, type StarLayerKind } from '../../core/sky.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import bakeFrag from '../../shaders/starfield/bake.frag'
import bakeVert from '../../shaders/starfield/bake.vert'
import glowFrag from '../../shaders/starfield/glow.frag'
import glowVert from '../../shaders/starfield/glow.vert'
import starsFrag from '../../shaders/starfield/stars.frag'
import starsVert from '../../shaders/starfield/stars.vert'

const SKY_SEED = hashSeed(UNIVERSE_SEED, 0x5c1e)
/** Latitude (radians) either side of the band covered by the baked strip. */
const BAND_LAT_MAX = 0.7
/** Seconds for the sky to fade in once the band is baked. */
const FADE_IN = SHOT ? 0 : 2.6
/** Seconds for a quality change to fade stars in or out. */
const DENSITY_EASE = 0.9
/** Parallax offset drifts back to centre over this many seconds. */
const RECENTRE = 25
const MAX_OFFSET = 0.08

const TWEAKS: TweakSchema = {
  brightness: { value: 1, min: 0, max: 4, step: 0.01 },
  saturation: { value: 0.62, min: 0, max: 1, step: 0.01 },
  twinkle: { value: 0.07, min: 0, max: 0.3, step: 0.005 },
  coreSigma: { value: 0.62, min: 0.3, max: 2, step: 0.01 },
  haloSigma: { value: 3.4, min: 1, max: 10, step: 0.1 },
  haloRatio: { value: 0.014, min: 0, max: 0.1, step: 0.001 },
  spikeRatio: { value: 0.022, min: 0, max: 0.3, step: 0.001 },
  spikeLength: { value: 7, min: 2, max: 30, step: 0.5 },
  spikeWidth: { value: 0.55, min: 0.2, max: 2, step: 0.01 },
  spikeAngle: { value: 12, min: 0, max: 90, step: 1 },
  bandGlow: { value: 0.052, min: 0, max: 0.2, step: 0.001 },
  dust: { value: 1, min: 0, max: 3, step: 0.01 },
  parallax: { value: 0.022, min: 0, max: 0.1, step: 0.001 },
}

/**
 * Per layer: how far it shifts with camera motion, how deeply it sits behind the band's
 * dust, and how strongly its stars brighten inside the band's glow.
 */
const LAYER_TUNING: Record<StarLayerKind, { parallax: number; dust: number; glowBoost: number }> = {
  far: { parallax: 0.12, dust: 1, glowBoost: 2.2 },
  mid: { parallax: 0.4, dust: 0.65, glowBoost: 0.5 },
  near: { parallax: 1, dust: 0.12, glowBoost: 0 },
}

const FULLSCREEN_TRIANGLE = new BufferGeometry().setAttribute(
  'position',
  new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
)

type Uniforms = Record<string, IUniform>

function spikeDirection(degrees: number, out: Vector2): Vector2 {
  const radians = (degrees * Math.PI) / 180
  return out.set(Math.cos(radians), Math.sin(radians))
}

const step = new Vector3()

/**
 * The background sky for every level: three parallax layers of stars at infinity, and the
 * diffuse band of the home galaxy behind them. Drawn first, at the far plane, with additive
 * light: anything opaque in the scene covers it, anything transparent glows over it.
 */
export function Starfield() {
  const gl = useThree((s) => s.gl)
  const quality = useVoid((s) => s.quality)
  const [bandWidth] = useState(() => QUALITY[useVoid.getState().quality].bandWidth)

  const sky = useMemo(() => generateSky(SKY_SEED, STAR_CATALOGUE_SIZE), [])

  const bandTarget = useMemo(() => {
    const target = new WebGLRenderTarget(bandWidth, bandWidth / 4, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    })
    target.texture.wrapS = RepeatWrapping
    target.texture.wrapT = ClampToEdgeWrapping
    return target
  }, [bandWidth])

  // Uniforms shared by every layer and the glow, so one write updates them all.
  const shared = useMemo<Uniforms>(
    () => ({
      uTime: { value: 0 },
      uFade: { value: 0 },
      uPixelRatio: { value: 1 },
      uMaxPointSize: { value: 256 },
      uBrightness: { value: num(TWEAKS, 'brightness') },
      uSaturation: { value: num(TWEAKS, 'saturation') },
      uTwinkle: { value: num(TWEAKS, 'twinkle') },
      uCoreSigma: { value: num(TWEAKS, 'coreSigma') },
      uHaloSigma: { value: num(TWEAKS, 'haloSigma') },
      uHaloRatio: { value: num(TWEAKS, 'haloRatio') },
      uSpikeRatio: { value: num(TWEAKS, 'spikeRatio') },
      uSpikeLength: { value: num(TWEAKS, 'spikeLength') },
      uSpikeWidth: { value: num(TWEAKS, 'spikeWidth') },
      uSpikeDirection: { value: spikeDirection(num(TWEAKS, 'spikeAngle'), new Vector2()) },
      uDensity: { value: QUALITY[useVoid.getState().quality].starFraction },
      uBandMap: { value: bandTarget.texture },
      uBandFrame: { value: new Matrix3().set(...(sky.band.worldToBand as [number, number, number, number, number, number, number, number, number])) },
      uBandLatMax: { value: BAND_LAT_MAX },
    }),
    [bandTarget, sky],
  )

  const layers = useMemo(
    () =>
      sky.layers.map((layer, index) => {
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(layer.direction, 3))
        geometry.setAttribute('aFlux', new BufferAttribute(layer.flux, 1))
        geometry.setAttribute('aTemp', new BufferAttribute(layer.temperature, 1))
        geometry.setAttribute('aTwinkle', new BufferAttribute(layer.twinkle, 2))
        geometry.setAttribute('aSpike', new BufferAttribute(layer.spike, 1))
        geometry.setAttribute('aRank', new BufferAttribute(layer.rank, 1))
        const tuning = LAYER_TUNING[layer.kind]
        const material = new ShaderMaterial({
          name: `stars-${layer.kind}`,
          vertexShader: starsVert,
          fragmentShader: starsFrag,
          uniforms: {
            ...shared,
            uOffset: { value: new Vector3() },
            uDust: { value: tuning.dust * num(TWEAKS, 'dust') },
            uGlowBoost: { value: tuning.glowBoost },
          },
          blending: AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        })
        const points = new Points(geometry, material)
        points.frustumCulled = false
        points.renderOrder = -1000 + index
        return { points, material, geometry, tuning }
      }),
    [sky, shared],
  )

  const glow = useMemo(() => {
    const material = new ShaderMaterial({
      name: 'band-glow',
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: {
        uBandMap: shared.uBandMap!,
        uBandFrame: shared.uBandFrame!,
        uBandLatMax: shared.uBandLatMax!,
        uFade: shared.uFade!,
        uIntensity: { value: num(TWEAKS, 'bandGlow') },
        uInverseProjection: { value: new Matrix4() },
      },
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new Mesh(FULLSCREEN_TRIANGLE, material)
    mesh.frustumCulled = false
    mesh.renderOrder = -1001
    return { mesh, material }
  }, [shared])

  // Bake the band once (and again if the target is recreated), then let the sky fade in.
  const fadeStart = useRef<number | null>(null)
  useLayoutEffect(() => {
    const rng = new Rng(sky.seed)
    const material = new ShaderMaterial({
      name: 'band-bake',
      vertexShader: bakeVert,
      fragmentShader: bakeFrag,
      uniforms: {
        uLatMax: { value: BAND_LAT_MAX },
        uSeedOffset: { value: new Vector3(rng.range(-40, 40), rng.range(-40, 40), rng.range(-40, 40)) },
      },
      depthTest: false,
      depthWrite: false,
    })
    const scene = new Scene()
    const mesh = new Mesh(FULLSCREEN_TRIANGLE, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    const previous = gl.getRenderTarget()
    gl.setRenderTarget(bandTarget)
    gl.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1))
    gl.setRenderTarget(previous)
    material.dispose()
    fadeStart.current = null
    const context = gl.getContext()
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    shared.uMaxPointSize!.value = range ? range[1] : 64
    return () => bandTarget.dispose()
  }, [gl, bandTarget, sky, shared])

  useEffect(
    () => () => {
      for (const layer of layers) {
        layer.geometry.dispose()
        layer.material.dispose()
      }
      glow.material.dispose()
    },
    [layers, glow],
  )

  const parallax = useRef(num(TWEAKS, 'parallax'))
  const offset = useRef(new Vector3())
  const lastCamera = useRef<Vector3 | null>(null)
  const densityTarget = QUALITY[quality].starFraction

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    shared.uTime!.value = t
    shared.uPixelRatio!.value = state.gl.getPixelRatio()

    if (fadeStart.current === null) fadeStart.current = t
    const fade = FADE_IN > 0 ? Math.min(1, (t - fadeStart.current) / FADE_IN) : 1
    shared.uFade!.value = fade * fade * (3 - 2 * fade)

    const density = shared.uDensity!.value as number
    shared.uDensity!.value = density + (densityTarget - density) * (1 - Math.exp(-delta / DENSITY_EASE))

    // Parallax from camera travel relative to its distance, so it reads the same at every
    // scale. Jumps (a level swap re-centring the camera) are ignored.
    const camera = state.camera.position
    if (lastCamera.current === null) lastCamera.current = camera.clone()
    step.subVectors(camera, lastCamera.current)
    const distance = Math.max(camera.length(), 1e-3)
    if (step.length() < distance * 0.5) offset.current.addScaledVector(step, parallax.current / distance)
    lastCamera.current.copy(camera)
    offset.current.multiplyScalar(Math.exp(-delta / RECENTRE)).clampLength(0, MAX_OFFSET)
    for (const layer of layers) {
      ;(layer.material.uniforms.uOffset!.value as Vector3).copy(offset.current).multiplyScalar(layer.tuning.parallax)
    }

    ;(glow.material.uniforms.uInverseProjection!.value as Matrix4).copy(state.camera.projectionMatrixInverse)
  })

  const apply = useCallback(
    (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      const uniformKey = `u${key.charAt(0).toUpperCase()}${key.slice(1)}`
      if (key === 'spikeAngle') spikeDirection(value, shared.uSpikeDirection!.value as Vector2)
      else if (key === 'bandGlow') glow.material.uniforms.uIntensity!.value = value
      else if (key === 'parallax') parallax.current = value
      else if (key === 'dust') for (const layer of layers) layer.material.uniforms.uDust!.value = layer.tuning.dust * value
      else if (shared[uniformKey]) shared[uniformKey].value = value
    },
    [shared, layers, glow],
  )
  useTweaks('Starfield', TWEAKS, apply)

  return (
    <group>
      <primitive object={glow.mesh} />
      {layers.map((layer) => (
        <primitive key={layer.material.name} object={layer.points} />
      ))}
    </group>
  )
}
