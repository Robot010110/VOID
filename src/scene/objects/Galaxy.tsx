import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Group,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  Mesh,
  NormalBlending,
  OneFactor,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  ZeroFactor,
  type IUniform,
  type Object3D,
  type PerspectiveCamera,
} from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { crestPhase, SYSTEM_SCALE, type GalaxyData } from '../../core/galaxy.ts'
import {
  discEmission,
  GalaxyParticleJob,
  OLD_SIZE,
  particleCounts,
  REFERENCE_LIGHT,
  type ParticleCounts,
} from '../../core/galaxyParticles.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import compositeFrag from '../../shaders/galaxy/composite.frag'
import compositeVert from '../../shaders/galaxy/composite.vert'
import coreFrag from '../../shaders/galaxy/core.frag'
import coreVert from '../../shaders/galaxy/core.vert'
import dustFrag from '../../shaders/galaxy/dust.frag'
import dustVert from '../../shaders/galaxy/dust.vert'
import fogFrag from '../../shaders/galaxy/fog.frag'
import lightFrag from '../../shaders/galaxy/light.frag'
import lightVert from '../../shaders/galaxy/light.vert'
import starsFrag from '../../shaders/galaxy/stars.frag'
import starsVert from '../../shaders/galaxy/stars.vert'
import { useLevel } from '../levels/context.ts'
import { useShared, type Disposable } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { FULLSCREEN_TRIANGLE } from '../shared/gpu.ts'
import { cancelWork, enqueueWork, type Work } from '../shared/work.ts'
import { handover, sky } from '../stage.ts'

const TWEAKS: TweakSchema = {
  exposure: { value: 0.2, min: 0, max: 1, step: 0.001 },
  sparkle: { value: 0.03, min: 0, max: 0.3, step: 0.001 },
  coreLight: { value: 1.6, min: 0, max: 6, step: 0.01 },
  starLight: { value: 2.2, min: 0, max: 10, step: 0.01 },
  dust: { value: 1, min: 0, max: 3, step: 0.01 },
  softness: { value: 0.75, min: 0.3, max: 2, step: 0.01 },
  spread: { value: 3.6, min: 0.8, max: 10, step: 0.01 },
  youngShift: { value: 0.25, min: -1.5, max: 1.5, step: 0.01 },
}

/** The soft light is drawn at this share of the screen's resolution, then laid over it. */
const BUFFER_SCALE = 0.5

/** Draw order inside the light buffer, with the camera above the plane (mirrored below). */
const BUFFER_ORDER = { fog: -1, back: 0, coreBack: 1, middle: 2, dust: 3, front: 4, coreFront: 5 } as const
/** Draw order on screen: the soft light behind, then the sharp stars over it. */
const SCREEN_ORDER = { light: -12, sparkle: -9, stars: -8 } as const

/** Light adds into the buffer and leaves its alpha, the dust's coverage, alone. */
const ADD_KEEPING_ALPHA = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const

/** How far the galaxy's glow dims once the camera is inside its disc. */
const ADAPTATION = 0.55

/** How long an unused galaxy's particles are kept: returning from a system should be instant. */
const POLICY = { keepFor: 300_000, group: 'galaxy', spare: 1 }

/** The galaxy's motion as uniforms, shared by every material that draws it. */
function orbitUniforms(galaxy: GalaxyData): Record<string, IUniform> {
  const { shape, motion } = galaxy
  return {
    uTime: { value: 0 },
    uArms: { value: new Vector4(shape.arms, 1 / Math.tan(shape.pitch), shape.armAngle, shape.armStart) },
    uArmShape: { value: new Vector3(shape.armEccentricity, crestPhase(shape), shape.radius) },
    uBend1: { value: new Vector3(shape.wiggle[0], shape.wiggle[1], shape.wiggle[2]) },
    uBend2: { value: new Vector3(shape.wiggle[3], shape.wiggle[4], shape.wiggle[5]) },
    uBar: { value: new Vector3(shape.bar, shape.barAngle, shape.barEccentricity) },
    uMotion: { value: new Vector3(motion.speed, motion.core, motion.pattern) },
  }
}

/** A galaxy's particles on the GPU, shared like a planet's maps. */
class GalaxyBuffers implements Disposable, Work {
  readonly job: GalaxyParticleJob
  readonly light = new BufferGeometry()
  readonly sparkle = new BufferGeometry()
  readonly dust = new BufferGeometry()
  ready = false

  constructor(galaxy: GalaxyData, total: number) {
    this.job = new GalaxyParticleJob(galaxy, total)
    const pairs = [
      [this.light, this.job.light],
      [this.sparkle, this.job.sparkle],
      [this.dust, this.job.dust],
    ] as const
    for (const [geometry, set] of pairs) {
      geometry.setAttribute('aOrbit', new BufferAttribute(set.orbit, 4))
      geometry.setAttribute('aShape', new BufferAttribute(set.shape, 4))
      geometry.setAttribute('aColour', new BufferAttribute(set.colour, 4, true))
    }
    this.draw(particleCounts(total))
  }

  /** Draw a prefix of each set: particles are independent, so a prefix is a fair sample. */
  draw(counts: ParticleCounts) {
    this.light.setDrawRange(0, Math.min(counts.light, this.job.light.count))
    this.sparkle.setDrawRange(0, Math.min(counts.sparkle, this.job.sparkle.count))
    this.dust.setDrawRange(0, Math.min(counts.dust, this.job.dust.count))
  }

  step(deadline: number): boolean {
    while (!this.job.done && performance.now() < deadline) this.job.step(4096)
    this.ready = this.job.done
    return this.ready
  }

  run() {
    this.job.run()
    this.ready = true
  }

  dispose() {
    this.light.dispose()
    this.sparkle.dispose()
    this.dust.dispose()
  }
}

/** A visited star's light: brighter stars read brighter, within a narrow range. */
function starLight(luminosity: number, notable: boolean): number {
  const light = Math.min(1.5, Math.max(0.35, 0.6 + 0.28 * Math.log10(Math.max(luminosity, 1e-3))))
  return light * (notable ? 1.15 : 1)
}

function createStars(galaxy: GalaxyData): BufferGeometry {
  const count = galaxy.stars.length
  const orbit = new Float32Array(count * 4)
  const info = new Float32Array(count * 4)
  const colour = new Float32Array(count * 3)
  galaxy.stars.forEach(({ index, star, orbit: o, notable }, i) => {
    orbit.set([o.radius, o.phase, o.height, o.scatter], i * 4)
    info.set([index, starLight(star.luminosity, notable), star.radius, star.temperature], i * 4)
    colour.set(blackbody(star.temperature), i * 3)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('aOrbit', new BufferAttribute(orbit, 4))
  geometry.setAttribute('aStar', new BufferAttribute(info, 4))
  geometry.setAttribute('aColour', new BufferAttribute(colour, 3))
  geometry.setDrawRange(0, count)
  return geometry
}

/** True when the object and everything above it is shown. */
function shown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return true
}

const cameraLocal = new Vector3()
const clearColour = new Color()
const toLocal = new Matrix4()
const viewToLocal = new Matrix4()

interface GalaxyProps {
  galaxy: GalaxyData
  /** Whether this galaxy is where the visitor is: only then do its stars answer the pointer. */
  active: boolean
  /** The star being handed to (or from) its system in a transition, or -1. */
  handed: number
}

/**
 * A galaxy. Its soft light is drawn at half resolution into its own buffer: the light beyond
 * the plane, the bulge's glow, the light inside the dust layer, the dust (normal blending),
 * then the light in front. That buffer is laid over the scene, its dust dimming the sky
 * behind; the bright point stars and the stars that can be visited are drawn sharp over it.
 * Everything moves in the vertex shaders; per frame this only writes a few uniforms.
 */
export function Galaxy({ galaxy, active, handed }: GalaxyProps) {
  const level = useLevel()
  const gl = useThree((s) => s.gl)
  const quality = useVoid((s) => s.quality)
  const [total] = useState(() => QUALITY[useVoid.getState().quality].galaxyParticles)
  const buffers = useShared(`galaxy:${galaxy.index}:${total}`, () => new GalaxyBuffers(galaxy, total), POLICY)
  const root = useRef<Group>(null)
  const warmed = useRef(false)
  const tuned = useRef({
    exposure: num(TWEAKS, 'exposure'),
    softness: num(TWEAKS, 'softness'),
    spread: num(TWEAKS, 'spread'),
  })

  // The first galaxy seen is built at once, while the page loads; one arrived at mid-flight is
  // built a slice per frame.
  useLayoutEffect(() => {
    if (buffers.ready) return
    if (level.background) {
      enqueueWork(buffers)
      return () => cancelWork(buffers)
    }
    buffers.run()
  }, [buffers, level.background])

  const orbit = useMemo(() => orbitUniforms(galaxy), [galaxy])

  const parts = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    })
    // Uniforms of the soft light, in buffer pixels.
    const soft = {
      uFade: { value: 0 },
      uPixelsPerUnit: { value: 1000 },
      uMinSigma: { value: num(TWEAKS, 'softness') },
      uMaxSigma: { value: num(TWEAKS, 'spread') },
      uMaxPointSize: { value: 256 },
      uNear: { value: 1.2 },
      uSizeScale: { value: 1 },
      uLightScale: { value: 1 },
      uLayer: { value: galaxy.shape.thickness * 0.5 },
      uResolve: { value: 0 },
    }
    const lightUniforms = {
      ...orbit,
      ...soft,
      uExposure: { value: num(TWEAKS, 'exposure') },
      uPeakMax: { value: 6 },
      uYoungShift: { value: num(TWEAKS, 'youngShift') },
    }
    const lightMaterial = (group: number) =>
      new ShaderMaterial({
        name: 'galaxy-light',
        vertexShader: lightVert,
        fragmentShader: lightFrag,
        uniforms: { ...lightUniforms, uGroup: { value: group } },
        ...ADD_KEEPING_ALPHA,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    const below = lightMaterial(-1)
    const inside = lightMaterial(0)
    const above = lightMaterial(1)
    const dust = new ShaderMaterial({
      name: 'galaxy-dust',
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: {
        ...orbit,
        ...soft,
        uMaxSigma: { value: 4 },
        uSizeScale: { value: 1 },
        uDustScale: { value: num(TWEAKS, 'dust') },
        // Dust scatters a little of the galaxy's light: dark lanes read warm brown, not grey.
        uColour: { value: new Color(0.035, 0.018, 0.009) },
      },
      blending: NormalBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const core = new ShaderMaterial({
      name: 'galaxy-core',
      vertexShader: coreVert,
      fragmentShader: coreFrag,
      uniforms: {
        uColour: { value: new Color(...blackbody(galaxy.light.core)) },
        uIntensity: { value: num(TWEAKS, 'coreLight') / 2 },
        uRadius: { value: galaxy.shape.bulge * 0.55 },
        uSize: { value: galaxy.shape.bulge * 2.4 },
        uFade: soft.uFade,
      },
      ...ADD_KEEPING_ALPHA,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    // Sharp point stars, at full resolution.
    const sparkle = new ShaderMaterial({
      name: 'galaxy-sparkle',
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      uniforms: {
        ...orbit,
        uFade: soft.uFade,
        uPixelsPerUnit: { value: 1000 },
        uMinSigma: { value: 0.6 },
        uMaxSigma: { value: 1.3 },
        uMaxPointSize: soft.uMaxPointSize,
        uNear: { value: 0.8 },
        uSizeScale: { value: 1 },
        uLightScale: { value: 1 },
        uLayer: soft.uLayer,
        uResolve: { value: 1 },
        uGroup: { value: 2 },
        uExposure: { value: num(TWEAKS, 'sparkle') },
        uPeakMax: { value: 10 },
        uYoungShift: lightUniforms.uYoungShift,
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const stars = new ShaderMaterial({
      name: 'galaxy-stars',
      vertexShader: starsVert,
      fragmentShader: starsFrag,
      uniforms: {
        ...orbit,
        uFade: soft.uFade,
        uPixelsPerUnit: sparkle.uniforms.uPixelsPerUnit!,
        uPixelRatio: { value: 1 },
        uMaxPointSize: soft.uMaxPointSize,
        uSystemScale: { value: SYSTEM_SCALE },
        uStarLight: { value: num(TWEAKS, 'starLight') },
        uReach: { value: 40 },
        uHover: { value: -1 },
        uHidden: { value: -1 },
        uPeakMax: { value: 8 },
        uDiscLight: { value: 1.9 },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    // The near disc's light, standing in for particles too close to draw.
    const emission = discEmission(galaxy)
    const fog = new ShaderMaterial({
      name: 'galaxy-fog',
      vertexShader: compositeVert,
      fragmentShader: fogFrag,
      uniforms: {
        ...orbit,
        uFade: soft.uFade,
        uResolution: { value: new Vector2(1, 1) },
        uCameraLocal: { value: new Vector3() },
        uViewToLocal: { value: new Matrix3() },
        uTanHalfFov: { value: new Vector2(1, 1) },
        uNear: { value: new Vector2(50, 100) },
        uResolve: { value: 30 },
        uOldLight: { value: 0 },
        uYoungLight: { value: 0 },
        uScaleLength: { value: emission.oldScale },
        uYoungScale: { value: emission.youngScale },
        uThickness: { value: galaxy.shape.thickness },
        uYoungShift: lightUniforms.uYoungShift,
        uDustLane: { value: -0.55 },
        uDust: { value: 0.7 * galaxy.light.dust },
        uDiscColour: { value: new Color(...blackbody(galaxy.light.disc)) },
        uYoungColour: { value: new Color(...blackbody(galaxy.light.young)) },
      },
      ...ADD_KEEPING_ALPHA,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })

    const composite = new ShaderMaterial({
      name: 'galaxy-composite',
      vertexShader: compositeVert,
      fragmentShader: compositeFrag,
      uniforms: { uLight: { value: target.texture }, uResolution: { value: new Vector2(1, 1) } },
      blending: NormalBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthWrite: false,
    })

    // The buffer's own little scene, carried by the level's transform each frame.
    const scene = new Scene()
    const holder = new Group()
    holder.matrixAutoUpdate = false
    scene.add(holder)
    const quad = new PlaneGeometry(2, 2)
    const layers = {
      below: new Points(buffers.light, below),
      inside: new Points(buffers.light, inside),
      above: new Points(buffers.light, above),
      dust: new Points(buffers.dust, dust),
      coreBack: new Mesh(quad, core),
      coreFront: new Mesh(quad, core),
      fog: new Mesh(FULLSCREEN_TRIANGLE, fog),
    }
    for (const object of Object.values(layers)) {
      object.frustumCulled = false
      holder.add(object)
    }
    layers.inside.renderOrder = BUFFER_ORDER.middle
    layers.dust.renderOrder = BUFFER_ORDER.dust
    layers.coreBack.renderOrder = BUFFER_ORDER.coreBack
    layers.coreFront.renderOrder = BUFFER_ORDER.coreFront
    layers.fog.renderOrder = BUFFER_ORDER.fog

    const starGeometry = createStars(galaxy)
    const screen = {
      composite: new Mesh(FULLSCREEN_TRIANGLE, composite),
      sparkle: new Points(buffers.sparkle, sparkle),
      stars: new Points(starGeometry, stars),
    }
    screen.composite.renderOrder = SCREEN_ORDER.light
    screen.sparkle.renderOrder = SCREEN_ORDER.sparkle
    screen.stars.renderOrder = SCREEN_ORDER.stars
    for (const object of Object.values(screen)) object.frustumCulled = false

    const materials = [below, inside, above, dust, core, sparkle, stars, composite, fog]
    return {
      target,
      soft,
      lightUniforms,
      materials,
      scene,
      holder,
      layers,
      screen,
      quad,
      starGeometry,
      dust,
      core,
      sparkle,
      stars,
      composite,
      fog,
      emission,
    }
  }, [galaxy, buffers, orbit])

  // Leaving the stage, the sky stops being this galaxy's band.
  useEffect(
    () => () => {
      sky.inside = 0
    },
    [],
  )

  useEffect(
    () => () => {
      for (const material of parts.materials) material.dispose()
      parts.target.dispose()
      parts.quad.dispose()
      parts.starGeometry.dispose()
    },
    [parts],
  )

  // The buffer's objects are not in the scene graph: they are compiled with the level's own.
  useLayoutEffect(() => {
    level.extras.add(parts.scene)
    return () => {
      level.extras.delete(parts.scene)
    }
  }, [level, parts])

  useLayoutEffect(() => {
    const context = gl.getContext()
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    parts.soft.uMaxPointSize.value = range ? range[1] : 64
  }, [gl, parts])

  // A lower tier draws fewer of the same particles, each larger and brighter to make up.
  useEffect(() => {
    const { job } = buffers
    const generated = job.light.count + job.sparkle.count + job.dust.count
    const counts = particleCounts(Math.min(QUALITY[quality].galaxyParticles, generated))
    buffers.draw(counts)
    const light = job.light.count / Math.max(1, Math.min(counts.light, job.light.count))
    const sparkle = job.sparkle.count / Math.max(1, Math.min(counts.sparkle, job.sparkle.count))
    parts.soft.uSizeScale.value = Math.sqrt(light)
    parts.soft.uLightScale.value = light
    parts.sparkle.uniforms.uLightScale!.value = sparkle
    parts.dust.uniforms.uSizeScale!.value = Math.sqrt(job.dust.count / Math.max(1, Math.min(counts.dust, job.dust.count)))
  }, [quality, buffers, parts])

  const apply = useMemo(
    () => (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      if (key === 'exposure') tuned.current.exposure = value
      if (key === 'sparkle') parts.sparkle.uniforms.uExposure!.value = value
      if (key === 'youngShift') parts.lightUniforms.uYoungShift.value = value
      if (key === 'softness') tuned.current.softness = value
      if (key === 'spread') tuned.current.spread = value
      if (key === 'dust') parts.dust.uniforms.uDustScale!.value = value
      if (key === 'coreLight') parts.core.uniforms.uIntensity!.value = value / 2
      if (key === 'starLight') parts.stars.uniforms.uStarLight!.value = value
    },
    [parts],
  )
  useTweaks('Galaxy', TWEAKS, apply)

  useFrame((state) => {
    const group = root.current
    if (!group) return
    const ready = buffers.ready
    const { soft, screen, layers, target } = parts
    screen.sparkle.visible = ready
    screen.composite.visible = false

    orbit.uTime!.value = worldClock.time
    soft.uFade.value = level.fade.current
    const cam = state.camera as PerspectiveCamera
    const dpr = state.viewport.dpr
    const width = Math.max(1, Math.round(state.size.width * dpr))
    const height = Math.max(1, Math.round(state.size.height * dpr))
    const bufferWidth = Math.max(1, Math.round(width * BUFFER_SCALE))
    const bufferHeight = Math.max(1, Math.round(height * BUFFER_SCALE))
    if (target.width !== bufferWidth || target.height !== bufferHeight) target.setSize(bufferWidth, bufferHeight)
    ;(parts.composite.uniforms.uResolution!.value as Vector2).set(width, height)
    const focal = 1 / (2 * Math.tan((cam.fov * Math.PI) / 360))
    soft.uPixelsPerUnit.value = bufferHeight * focal
    parts.sparkle.uniforms.uPixelsPerUnit!.value = height * focal
    parts.sparkle.uniforms.uMinSigma!.value = 0.6 * dpr
    parts.sparkle.uniforms.uMaxSigma!.value = 1.3 * dpr
    parts.stars.uniforms.uPixelRatio!.value = dpr
    soft.uMinSigma.value = tuned.current.softness
    soft.uMaxSigma.value = tuned.current.spread
    parts.stars.uniforms.uHover!.value = active ? (useVoid.getState().hoverTarget ?? -1) : -1
    // Once the system owns its star, the galaxy's point of light for it steps aside.
    parts.stars.uniforms.uHidden!.value = handed >= 0 && handover.owner === 'child' ? handed : -1

    // The light beyond the plane goes first, then the bulge, the light inside the dust
    // layer, the dust, and the light in front.
    group.worldToLocal(cameraLocal.copy(cam.position))
    const above = cameraLocal.y >= 0
    // How far inside the disc the camera is: there, the galaxy's band is the sky.
    const { radius, thickness } = galaxy.shape
    const away = Math.max(0, Math.abs(cameraLocal.y) - thickness) + Math.max(0, Math.hypot(cameraLocal.x, cameraLocal.z) - radius)
    const t = Math.min(1, Math.max(0, (away - 15) / 125))
    sky.inside = 1 - t * t * (3 - 2 * t)

    // Falling into the disc, the eye adapts: the galaxy's glow, which surrounds the camera
    // there, dims, while its resolved stars keep their light.
    const exposure = tuned.current.exposure * (1 - ADAPTATION * sky.inside)
    parts.lightUniforms.uExposure.value = exposure

    // The near glow covers the distances where the disc's particles have thinned away.
    const typical = OLD_SIZE * Math.sqrt(REFERENCE_LIGHT / buffers.job.light.count) * (soft.uSizeScale.value as number)
    const reach = (typical * (soft.uPixelsPerUnit.value as number)) / tuned.current.spread
    const f = parts.fog.uniforms
    ;(f.uNear!.value as Vector2).set(reach * 0.5, reach)
    f.uResolve!.value = reach * 0.3
    layers.fog.visible = away < reach
    f.uOldLight!.value = parts.emission.old * exposure
    f.uYoungLight!.value = parts.emission.young * exposure
    ;(f.uResolution!.value as Vector2).set(bufferWidth, bufferHeight)
    ;(f.uCameraLocal!.value as Vector3).copy(cameraLocal)
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360)
    ;(f.uTanHalfFov!.value as Vector2).set(tanHalf * cam.aspect, tanHalf)
    toLocal.copy(group.matrixWorld).invert()
    ;(f.uViewToLocal!.value as Matrix3).setFromMatrix4(viewToLocal.multiplyMatrices(toLocal, cam.matrixWorld))
    layers.below.renderOrder = above ? BUFFER_ORDER.back : BUFFER_ORDER.front
    layers.above.renderOrder = above ? BUFFER_ORDER.front : BUFFER_ORDER.back

    // Draw the soft light whenever it shows, and once before it ever shows, so its buffers are
    // uploaded while the level is still hidden rather than in the frame it appears.
    const visible = shown(group) && level.fade.current > 0
    if (!ready || (!visible && warmed.current)) return
    warmed.current = true
    screen.composite.visible = visible
    parts.holder.matrix.copy(group.matrixWorld)
    const previous = gl.getRenderTarget()
    gl.getClearColor(clearColour)
    const alpha = gl.getClearAlpha()
    gl.setRenderTarget(target)
    gl.setClearColor(0x000000, 0)
    // The post pipeline turns the renderer's automatic clear off.
    gl.clear(true, false, false)
    gl.render(parts.scene, cam)
    gl.setRenderTarget(previous)
    gl.setClearColor(clearColour, alpha)
  })

  return (
    <group ref={root}>
      <primitive object={parts.screen.composite} />
      <primitive object={parts.screen.sparkle} />
      <primitive object={parts.screen.stars} />
    </group>
  )
}
