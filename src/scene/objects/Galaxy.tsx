import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Group,
  type IUniform,
  type PerspectiveCamera,
} from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { crestPhase, SYSTEM_SCALE, type GalaxyData } from '../../core/galaxy.ts'
import { GalaxyParticleJob, particleCounts } from '../../core/galaxyParticles.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import coreFrag from '../../shaders/galaxy/core.frag'
import coreVert from '../../shaders/galaxy/core.vert'
import dustFrag from '../../shaders/galaxy/dust.frag'
import dustVert from '../../shaders/galaxy/dust.vert'
import lightFrag from '../../shaders/galaxy/light.frag'
import lightVert from '../../shaders/galaxy/light.vert'
import starsFrag from '../../shaders/galaxy/stars.frag'
import starsVert from '../../shaders/galaxy/stars.vert'
import { useLevel } from '../levels/context.ts'
import { useShared, type Disposable } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { warmUp } from '../shared/gpu.ts'
import { cancelWork, enqueueWork, type Work } from '../shared/work.ts'

const TWEAKS: TweakSchema = {
  exposure: { value: 0.05, min: 0, max: 0.3, step: 0.001 },
  coreLight: { value: 1.6, min: 0, max: 6, step: 0.01 },
  starLight: { value: 2.2, min: 0, max: 10, step: 0.01 },
  dust: { value: 1, min: 0, max: 2, step: 0.01 },
  minSigma: { value: 0.65, min: 0.3, max: 2, step: 0.01 },
  maxSigma: { value: 2.4, min: 0.8, max: 6, step: 0.01 },
  youngShift: { value: 0.35, min: -1.5, max: 1.5, step: 0.01 },
  dustShift: { value: -0.55, min: -1.5, max: 1.5, step: 0.01 },
}

/** Draw order: the light beyond the plane, the dust, the light in front, then the rest. */
const ORDER = { back: -14, coreBack: -13, dust: -12, front: -11, coreFront: -10, stars: -8 } as const

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

/**
 * A galaxy's particles on the GPU, shared like a planet's maps. The light is one buffer
 * drawn as two halves (above and below the plane); the dust is its own buffer.
 */
class GalaxyBuffers implements Disposable, Work {
  readonly job: GalaxyParticleJob
  readonly upper = new BufferGeometry()
  readonly lower = new BufferGeometry()
  readonly dust = new BufferGeometry()
  ready = false
  warmed = false

  constructor(galaxy: GalaxyData, total: number) {
    this.job = new GalaxyParticleJob(galaxy, total)
    const { light, dust } = this.job
    const orbit = new BufferAttribute(light.orbit, 4)
    const shape = new BufferAttribute(light.shape, 4)
    const colour = new BufferAttribute(light.colour, 4, true)
    for (const geometry of [this.upper, this.lower]) {
      geometry.setAttribute('aOrbit', orbit)
      geometry.setAttribute('aShape', shape)
      geometry.setAttribute('aColour', colour)
    }
    this.dust.setAttribute('aOrbit', new BufferAttribute(dust.orbit, 4))
    this.dust.setAttribute('aShape', new BufferAttribute(dust.shape, 4))
    this.draw(light.count, dust.count)
  }

  /** Draw a prefix of each half: particles are independent, so any prefix is a fair sample. */
  draw(light: number, dust: number) {
    const half = this.job.light.count / 2
    const shown = Math.min(half, Math.round(light / 2))
    this.upper.setDrawRange(0, shown)
    this.lower.setDrawRange(half, shown)
    this.dust.setDrawRange(0, Math.min(this.job.dust.count, dust))
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
    this.upper.dispose()
    this.lower.dispose()
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
    info.set([index, starLight(star.luminosity, notable), star.radius, notable ? 1 : 0], i * 4)
    colour.set(blackbody(star.temperature), i * 3)
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('aOrbit', new BufferAttribute(orbit, 4))
  geometry.setAttribute('aStar', new BufferAttribute(info, 4))
  geometry.setAttribute('aColour', new BufferAttribute(colour, 3))
  geometry.setDrawRange(0, count)
  return geometry
}

const cameraLocal = new Vector3()

interface GalaxyProps {
  galaxy: GalaxyData
  /** Whether this galaxy is where the visitor is: only then do its stars answer the pointer. */
  active: boolean
}

/**
 * A galaxy: its light in two halves either side of its plane with the dust between them, the
 * smooth glow of its bulge, and the stars that can be visited. Everything moves in the
 * vertex shaders; per frame this only writes a few uniforms.
 */
export function Galaxy({ galaxy, active }: GalaxyProps) {
  const level = useLevel()
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const quality = useVoid((s) => s.quality)
  const [total] = useState(() => QUALITY[useVoid.getState().quality].galaxyParticles)
  const buffers = useShared(`galaxy:${galaxy.index}:${total}`, () => new GalaxyBuffers(galaxy, total), POLICY)
  const root = useRef<Group>(null)

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
  const coreColour = useMemo(() => new Color(...blackbody(galaxy.light.core)), [galaxy])

  const parts = useMemo(() => {
    const common = {
      uFade: { value: 0 },
      uPixelsPerUnit: { value: 1000 },
      uPixelRatio: { value: 1 },
      uMinSigma: { value: num(TWEAKS, 'minSigma') },
      uMaxSigma: { value: num(TWEAKS, 'maxSigma') },
      uMaxPointSize: { value: 256 },
      uNear: { value: 1.2 },
      uSizeScale: { value: 1 },
      uLightScale: { value: 1 },
    }
    const light = new ShaderMaterial({
      name: 'galaxy-light',
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      uniforms: {
        ...orbit,
        ...common,
        uExposure: { value: num(TWEAKS, 'exposure') },
        uPeakMax: { value: 6 },
        uYoungShift: { value: num(TWEAKS, 'youngShift') },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const dust = new ShaderMaterial({
      name: 'galaxy-dust',
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: {
        ...orbit,
        ...common,
        uMaxSigma: { value: 7 },
        uSizeScale: { value: 1 },
        uDustShift: { value: num(TWEAKS, 'dustShift') },
        uDustScale: { value: num(TWEAKS, 'dust') },
        uColour: { value: new Color(0.012, 0.0085, 0.006) },
      },
      blending: NormalBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthWrite: false,
    })
    const coreUniforms = {
      uColour: { value: coreColour },
      uIntensity: { value: num(TWEAKS, 'coreLight') / 2 },
      uRadius: { value: galaxy.shape.bulge * 0.55 },
      uSize: { value: galaxy.shape.bulge * 2.4 },
      uFade: common.uFade,
    }
    const core = new ShaderMaterial({
      name: 'galaxy-core',
      vertexShader: coreVert,
      fragmentShader: coreFrag,
      uniforms: coreUniforms,
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
        uFade: common.uFade,
        uPixelsPerUnit: common.uPixelsPerUnit,
        uPixelRatio: common.uPixelRatio,
        uMaxPointSize: common.uMaxPointSize,
        uSystemScale: { value: SYSTEM_SCALE },
        uStarLight: { value: num(TWEAKS, 'starLight') },
        uReach: { value: 40 },
        uHover: { value: -1 },
        uPeakMax: { value: 8 },
        uDiscLight: { value: 1.9 },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const quad = new PlaneGeometry(2, 2)
    const starGeometry = createStars(galaxy)

    const upper = new Points(buffers.upper, light)
    const lower = new Points(buffers.lower, light)
    const dustPoints = new Points(buffers.dust, dust)
    const coreBack = new Mesh(quad, core)
    const coreFront = new Mesh(quad, core)
    const starPoints = new Points(starGeometry, stars)
    for (const object of [upper, lower, dustPoints, coreBack, coreFront, starPoints]) object.frustumCulled = false
    dustPoints.renderOrder = ORDER.dust
    coreBack.renderOrder = ORDER.coreBack
    coreFront.renderOrder = ORDER.coreFront
    starPoints.renderOrder = ORDER.stars
    return { light, dust, core, stars, quad, starGeometry, upper, lower, dustPoints, coreBack, coreFront, starPoints, common }
  }, [galaxy, buffers, orbit, coreColour])

  useEffect(
    () => () => {
      parts.light.dispose()
      parts.dust.dispose()
      parts.core.dispose()
      parts.stars.dispose()
      parts.quad.dispose()
      parts.starGeometry.dispose()
    },
    [parts],
  )

  useLayoutEffect(() => {
    const context = gl.getContext()
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    parts.common.uMaxPointSize.value = range ? range[1] : 64
  }, [gl, parts])

  // A lower tier draws fewer of the same particles, each larger and brighter to make up.
  useEffect(() => {
    const generated = buffers.job.light.count + buffers.job.dust.count
    const wanted = Math.min(QUALITY[quality].galaxyParticles, generated)
    const counts = particleCounts(wanted)
    buffers.draw(counts.light, counts.dust)
    const ratio = buffers.job.light.count / Math.max(2, counts.light)
    parts.common.uSizeScale.value = Math.sqrt(ratio)
    parts.common.uLightScale.value = ratio
    parts.dust.uniforms.uSizeScale!.value = Math.sqrt(buffers.job.dust.count / Math.max(1, counts.dust))
  }, [quality, buffers, parts])

  const apply = useMemo(
    () => (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      const u = parts.light.uniforms
      if (key === 'exposure') u.uExposure!.value = value
      if (key === 'youngShift') u.uYoungShift!.value = value
      if (key === 'minSigma' || key === 'maxSigma') parts.common[key === 'minSigma' ? 'uMinSigma' : 'uMaxSigma'].value = value
      if (key === 'dust') parts.dust.uniforms.uDustScale!.value = value
      if (key === 'dustShift') parts.dust.uniforms.uDustShift!.value = value
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
    parts.upper.visible = parts.lower.visible = parts.dustPoints.visible = ready
    // Upload the particles while the level is still hidden, not in the frame it appears.
    if (ready && !buffers.warmed) {
      buffers.warmed = true
      warmUp(gl, parts.upper, camera)
      warmUp(gl, parts.dustPoints, camera)
    }
    orbit.uTime!.value = worldClock.time
    const { common } = parts
    common.uFade.value = level.fade.current
    const cam = state.camera as PerspectiveCamera
    const height = state.size.height * state.viewport.dpr
    common.uPixelsPerUnit.value = height / (2 * Math.tan((cam.fov * Math.PI) / 360))
    common.uPixelRatio.value = state.viewport.dpr
    parts.light.uniforms.uMinSigma!.value = num(TWEAKS, 'minSigma') * state.viewport.dpr
    // The half of the light beyond the plane goes behind the dust, the near half in front.
    group.worldToLocal(cameraLocal.copy(cam.position))
    const above = cameraLocal.y >= 0
    parts.upper.renderOrder = above ? ORDER.front : ORDER.back
    parts.lower.renderOrder = above ? ORDER.back : ORDER.front
    parts.stars.uniforms.uHover!.value = active ? (useVoid.getState().hoverTarget ?? -1) : -1
  })

  return (
    <group ref={root}>
      <primitive object={parts.upper} />
      <primitive object={parts.lower} />
      <primitive object={parts.dustPoints} />
      <primitive object={parts.coreBack} />
      <primitive object={parts.coreFront} />
      <primitive object={parts.starPoints} />
    </group>
  )
}
