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
  Points,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Group,
  type IUniform,
} from 'three'
import { SHOT } from '../../core/env.ts'
import { QUALITY, STAR_CATALOGUE_SIZE } from '../../core/quality.ts'
import { hashSeed, Rng, UNIVERSE_SEED } from '../../core/rng.ts'
import { generateSky, type StarLayerKind } from '../../core/sky.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import bakeFrag from '../../shaders/starfield/bake.frag'
import fullscreenVert from '../../shaders/common/fullscreen.vert'
import glowFrag from '../../shaders/starfield/glow.frag'
import glowVert from '../../shaders/starfield/glow.vert'
import starsFrag from '../../shaders/starfield/stars.frag'
import starsVert from '../../shaders/starfield/stars.vert'
import { bakeTexture } from '../shared/gpu.ts'
import { sky as skyTurn } from '../stage.ts'

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

/**
 * A ring of sky around the band's plane, in band coordinates, carrying the baked strip's
 * UVs per vertex. Segments are small enough (about 2 by 3 degrees) that interpolation of the
 * UVs across a triangle is indistinguishable from the exact mapping.
 */
function createBandRing(latMax: number, lonSegments = 192, latSegments = 24): BufferGeometry {
  const columns = lonSegments + 1
  const rows = latSegments + 1
  const positions = new Float32Array(columns * rows * 3)
  const uvs = new Float32Array(columns * rows * 2)
  for (let row = 0; row < rows; row++) {
    const v = row / latSegments
    const lat = (v - 0.5) * 2 * latMax
    for (let column = 0; column < columns; column++) {
      const u = column / lonSegments
      const lon = (u - 0.5) * Math.PI * 2
      const i = row * columns + column
      positions[i * 3] = Math.cos(lat) * Math.sin(lon)
      positions[i * 3 + 1] = Math.sin(lat)
      positions[i * 3 + 2] = Math.cos(lat) * Math.cos(lon)
      uvs[i * 2] = u
      uvs[i * 2 + 1] = v
    }
  }
  const indices: number[] = []
  for (let row = 0; row < latSegments; row++) {
    for (let column = 0; column < lonSegments; column++) {
      const a = row * columns + column
      const b = a + 1
      const c = a + columns
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

type Uniforms = Record<string, IUniform>

function spikeDirection(degrees: number, out: Vector2): Vector2 {
  const radians = (degrees * Math.PI) / 180
  return out.set(Math.cos(radians), Math.sin(radians))
}

const step = new Vector3()
/** The sky from inside a galaxy's disc: its band, and its stars at full strength. */
const INSIDE = { brightness: 0.9, band: 0.55 }
const turn = new Matrix4()
const turn3 = new Matrix3()

/**
 * The background sky for every level: three parallax layers of stars at infinity, and the
 * diffuse band of the home galaxy behind them. Drawn first, at the far plane, with additive
 * light: anything opaque in the scene covers it, anything transparent glows over it.
 */
interface StarfieldProps {
  /** Level multiplier on star brightness (a planet in view dims the sky a little). */
  brightness?: number
  /** Level multiplier on the galactic band: 1 inside a galaxy, 0 outside any. */
  band?: number
}

export function Starfield({ brightness = 1, band = 1 }: StarfieldProps) {
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
      uBandFrame: { value: new Matrix3().fromArray(sky.band.worldToBand).transpose() },
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
    const geometry = createBandRing(BAND_LAT_MAX)
    const material = new ShaderMaterial({
      name: 'band-glow',
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: {
        uBandMap: shared.uBandMap!,
        uBandToWorld: { value: (shared.uBandFrame!.value as Matrix3).clone().transpose() },
        uRadius: { value: 1 },
        uFade: shared.uFade!,
        uIntensity: { value: num(TWEAKS, 'bandGlow') },
      },
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = -1001
    return { mesh, material, geometry }
  }, [shared])

  // Bake the band once (and again if the target is recreated), then let the sky fade in.
  const fadeStart = useRef<number | null>(null)
  useLayoutEffect(() => {
    const rng = new Rng(sky.seed)
    const material = new ShaderMaterial({
      name: 'band-bake',
      vertexShader: fullscreenVert,
      fragmentShader: bakeFrag,
      uniforms: {
        uLatMax: { value: BAND_LAT_MAX },
        uSeedOffset: {
          value: new Vector3(rng.range(-40, 40), rng.range(-40, 40), rng.range(-40, 40)),
        },
      },
      depthTest: false,
      depthWrite: false,
    })
    bakeTexture(gl, bandTarget, material)
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
      glow.geometry.dispose()
    },
    [layers, glow],
  )

  const parallax = useRef(num(TWEAKS, 'parallax'))
  const tuned = useRef({ brightness: num(TWEAKS, 'brightness'), band: num(TWEAKS, 'bandGlow') })
  const level = useRef({ brightness, band })
  const target = useRef({ brightness, band })
  useEffect(() => {
    target.current = { brightness, band }
  }, [brightness, band])
  const offset = useRef(new Vector3())
  const lastCamera = useRef<Vector3 | null>(null)
  const root = useRef<Group>(null)
  // The band's frame as baked, before the sky is turned.
  const bandFrame = useMemo(() => (shared.uBandFrame!.value as Matrix3).clone(), [shared])
  const densityTarget = QUALITY[quality].starFraction

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    shared.uTime!.value = t
    shared.uPixelRatio!.value = state.gl.getPixelRatio()

    if (fadeStart.current === null) fadeStart.current = t
    const fade = FADE_IN > 0 ? Math.min(1, (t - fadeStart.current) / FADE_IN) : 1
    shared.uFade!.value = fade * fade * (3 - 2 * fade)

    // Level changes (a planet coming into view, leaving the galaxy) ease over a second. Inside
    // a galaxy's disc its band is the sky, whatever the level.
    const ease = 1 - Math.exp(-delta / 1.2)
    const inside = skyTurn.inside
    const wantBrightness = target.current.brightness + (INSIDE.brightness - target.current.brightness) * inside
    const wantBand = target.current.band + (INSIDE.band - target.current.band) * inside
    level.current.brightness += (wantBrightness - level.current.brightness) * ease
    level.current.band += (wantBand - level.current.band) * ease
    shared.uBrightness!.value = tuned.current.brightness * level.current.brightness
    glow.material.uniforms.uIntensity!.value = tuned.current.band * level.current.band

    const density = shared.uDensity!.value as number
    shared.uDensity!.value =
      density + (densityTarget - density) * (1 - Math.exp(-delta / DENSITY_EASE))

    // Parallax from camera travel relative to its distance, so it reads the same at every
    // scale. Jumps (a level swap re-centring the camera) are ignored.
    const camera = state.camera.position
    if (lastCamera.current === null) lastCamera.current = camera.clone()
    step.subVectors(camera, lastCamera.current)
    const distance = Math.max(camera.length(), 1e-3)
    if (step.length() < distance * 0.5)
      offset.current.addScaledVector(step, parallax.current / distance)
    lastCamera.current.copy(camera)
    offset.current.multiplyScalar(Math.exp(-delta / RECENTRE)).clampLength(0, MAX_OFFSET)
    for (const layer of layers) {
      ;(layer.material.uniforms.uOffset!.value as Vector3)
        .copy(offset.current)
        .multiplyScalar(layer.tuning.parallax)
    }

    // The sky turns with the frame the camera is in (a system's sky shows its galaxy's plane).
    if (root.current) root.current.quaternion.copy(skyTurn.orientation)
    turn3.setFromMatrix4(turn.makeRotationFromQuaternion(skyTurn.orientation))
    ;(shared.uBandFrame!.value as Matrix3).copy(bandFrame).multiply(turn3.transpose())
    ;(glow.material.uniforms.uBandToWorld!.value as Matrix3).copy(shared.uBandFrame!.value as Matrix3).transpose()

    // Halfway to the far plane: inside the frustum at every level, and always infinitely far.
    const camera3 = state.camera as { far?: number }
    glow.material.uniforms.uRadius!.value = (camera3.far ?? 1000) * 0.5
  })

  const apply = useCallback(
    (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      const uniformKey = `u${key.charAt(0).toUpperCase()}${key.slice(1)}`
      if (key === 'spikeAngle') spikeDirection(value, shared.uSpikeDirection!.value as Vector2)
      else if (key === 'bandGlow') tuned.current.band = value
      else if (key === 'brightness') tuned.current.brightness = value
      else if (key === 'parallax') parallax.current = value
      else if (key === 'dust')
        for (const layer of layers) layer.material.uniforms.uDust!.value = layer.tuning.dust * value
      else if (shared[uniformKey]) shared[uniformKey].value = value
    },
    [shared, layers],
  )
  useTweaks('Starfield', TWEAKS, apply)

  return (
    <group ref={root}>
      <primitive object={glow.mesh} />
      {layers.map((layer) => (
        <primitive key={layer.material.name} object={layer.points} />
      ))}
    </group>
  )
}
