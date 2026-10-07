import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DataTexture,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  NormalBlending,
  OneFactor,
  PlaneGeometry,
  Points,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
  type Group,
  type IUniform,
  type Object3D,
  type PerspectiveCamera,
} from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { deepField, webGas, type Universe } from '../../core/cosmos.ts'
import { crestPhase, getGalaxyLook, type GalaxyLook } from '../../core/galaxy.ts'
import { GalaxyParticleJob, LAYER_SHARE, particleCounts, type ParticleSet } from '../../core/galaxyParticles.ts'
import { QUALITY } from '../../core/quality.ts'
import { useVoid } from '../../core/store.ts'
import { num, useTweaks, type TweakSchema, type TweakValue } from '../../core/tweaks.ts'
import dustFrag from '../../shaders/galaxy/dust.frag'
import lightFrag from '../../shaders/galaxy/light.frag'
import coreFrag from '../../shaders/universe/core.frag'
import coreVert from '../../shaders/universe/core.vert'
import dustVert from '../../shaders/universe/dust.vert'
import fieldFrag from '../../shaders/universe/field.frag'
import fieldVert from '../../shaders/universe/field.vert'
import gasVert from '../../shaders/universe/gas.vert'
import lightVert from '../../shaders/universe/light.vert'
import { useLevel } from '../levels/context.ts'
import { cancelBake, enqueueBake } from '../shared/bake.ts'
import { useShared, type Disposable } from '../shared/cache.ts'
import { worldClock } from '../shared/clock.ts'
import { SoftBuffer } from '../shared/softBuffer.ts'
import { cancelWork, enqueueWork, type Work } from '../shared/work.ts'
import { BlackHole } from './BlackHole.tsx'
import { ATLAS_POLICY, createUniverseNebulae, NebulaAtlas } from './Nebula.ts'

const TWEAKS: TweakSchema = {
  exposure: { value: 0.14, min: 0, max: 1, step: 0.001 },
  sparkle: { value: 0.03, min: 0, max: 0.3, step: 0.001 },
  coreLight: { value: 1.6, min: 0, max: 6, step: 0.01 },
  gas: { value: 0.0045, min: 0, max: 0.1, step: 0.0001 },
  field: { value: 0.9, min: 0, max: 4, step: 0.01 },
  nebulae: { value: 0.2, min: 0, max: 3, step: 0.01 },
}

/** Draw order on screen: the deep field, the soft light over it, then the sharp points. */
const SCREEN_ORDER = { field: -14, light: -12, sparkle: -9 } as const
/** Draw order inside the soft buffer: gas and nebulae, then each galaxy around its dust. */
const BUFFER_ORDER = { gas: 0, nebulae: 1, far: 2, cores: 3, dust: 4, near: 5 } as const

/** Light adds into the buffer and leaves its alpha, the dust's coverage, alone. */
const ADD_KEEPING_ALPHA = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const

/** Texels per galaxy in the data texture the particles read their galaxy from. */
const GALAXY_TEXELS = 7

/** The universe is always one rise away: its particles are kept for a long while unused. */
const POLICY = { keepFor: 600_000, group: 'universe', spare: 1 }

/** One set of particles for every galaxy, each tagged with its galaxy's row. */
interface Combined extends ParticleSet {
  readonly galaxy: Float32Array
}

function combined(count: number): Combined {
  return {
    count,
    orbit: new Float32Array(count * 4),
    shape: new Float32Array(count * 4),
    colour: new Uint8Array(count * 4),
    galaxy: new Float32Array(count),
  }
}

/**
 * Every galaxy's shape, motion and place, one row each, read by the particles on the GPU (see
 * shaders/universe/galaxy.glsl).
 */
function galaxyTexture(universe: Universe, looks: readonly GalaxyLook[]): DataTexture {
  const data = new Float32Array(GALAXY_TEXELS * 4 * looks.length)
  looks.forEach((look, row) => {
    const site = universe.galaxies[row]!
    const { shape, motion } = look
    const w = shape.wiggle
    // prettier-ignore
    data.set([
      shape.arms, 1 / Math.tan(shape.pitch), shape.armAngle, shape.armStart,
      shape.armEccentricity, crestPhase(shape), shape.radius, shape.thickness * LAYER_SHARE,
      w[0], w[1], w[2], w[3],
      w[4], w[5], shape.bar, shape.barAngle,
      shape.barEccentricity, motion.speed, motion.core, motion.pattern,
      site.position[0], site.position[1], site.position[2], site.size / shape.radius,
      ...site.orientation,
    ], row * GALAXY_TEXELS * 4)
  })
  const texture = new DataTexture(data, GALAXY_TEXELS, looks.length, RGBAFormat, FloatType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.needsUpdate = true
  return texture
}

/**
 * Every galaxy of the universe, each drawn from a few thousand of the very particles its own
 * level draws (so the galaxy fallen into is the galaxy seen from afar), generated a galaxy at a
 * time over frames and drawn in one pass for all.
 */
class UniverseGalaxies implements Disposable, Work {
  readonly light = new BufferGeometry()
  readonly sparkle = new BufferGeometry()
  readonly dust = new BufferGeometry()
  readonly data: DataTexture
  ready = false
  private readonly sets: { light: Combined; sparkle: Combined; dust: Combined }
  private readonly looks: GalaxyLook[]
  private readonly perGalaxy: number
  private galaxy = 0
  private job: GalaxyParticleJob | null = null
  private readonly offsets = { light: 0, sparkle: 0, dust: 0 }

  constructor(universe: Universe, perGalaxy: number) {
    this.perGalaxy = perGalaxy
    this.looks = universe.galaxies.map((site) => getGalaxyLook(site.index))
    const totals = { light: 0, sparkle: 0, dust: 0 }
    for (const look of this.looks) {
      const counts = particleCounts(perGalaxy, look.kind)
      totals.light += counts.light
      totals.sparkle += counts.sparkle
      totals.dust += counts.dust
    }
    this.sets = { light: combined(totals.light), sparkle: combined(totals.sparkle), dust: combined(totals.dust) }
    const pairs = [
      [this.light, this.sets.light],
      [this.sparkle, this.sets.sparkle],
      [this.dust, this.sets.dust],
    ] as const
    for (const [geometry, set] of pairs) {
      geometry.setAttribute('aOrbit', new BufferAttribute(set.orbit, 4))
      geometry.setAttribute('aShape', new BufferAttribute(set.shape, 4))
      geometry.setAttribute('aColour', new BufferAttribute(set.colour, 4, true))
      geometry.setAttribute('aGalaxy', new BufferAttribute(set.galaxy, 1))
      geometry.setDrawRange(0, 0)
    }
    this.data = galaxyTexture(universe, this.looks)
  }

  step(deadline: number): boolean {
    while (this.galaxy < this.looks.length && performance.now() < deadline) {
      this.job ??= new GalaxyParticleJob(this.looks[this.galaxy]!, this.perGalaxy, { grouped: false })
      this.job.step(2048)
      if (this.job.done) {
        this.append(this.job, this.galaxy)
        this.job = null
        this.galaxy++
      }
    }
    if (this.galaxy >= this.looks.length) this.finish()
    return this.ready
  }

  run() {
    this.step(Infinity)
  }

  private append(job: GalaxyParticleJob, galaxy: number) {
    for (const name of ['light', 'sparkle', 'dust'] as const) {
      const from = job[name]
      const into = this.sets[name]
      const at = this.offsets[name]
      into.orbit.set(from.orbit, at * 4)
      into.shape.set(from.shape, at * 4)
      into.colour.set(from.colour, at * 4)
      into.galaxy.fill(galaxy, at, at + from.count)
      this.offsets[name] = at + from.count
    }
  }

  private finish() {
    if (this.ready) return
    this.ready = true
    this.light.setDrawRange(0, this.sets.light.count)
    this.sparkle.setDrawRange(0, this.sets.sparkle.count)
    this.dust.setDrawRange(0, this.sets.dust.count)
  }

  dispose() {
    this.light.dispose()
    this.sparkle.dispose()
    this.dust.dispose()
    this.data.dispose()
  }
}

/** Each galaxy's unresolved heart, one camera-facing card per galaxy (none for irregulars). */
function createCores(universe: Universe): InstancedBufferGeometry {
  const count = universe.galaxies.length
  const centre = new Float32Array(count * 3)
  const core = new Float32Array(count * 3)
  const colour = new Float32Array(count * 3)
  universe.galaxies.forEach((site, i) => {
    const look = getGalaxyLook(site.index)
    const scale = site.size / look.shape.radius
    centre.set(site.position, i * 3)
    // An elliptical's heart is part of one smooth swarm; an irregular has none.
    const intensity = look.irregular ? 0 : look.kind === 'elliptical' ? 0.45 : 1
    core.set([look.shape.bulge * 0.55 * scale, look.shape.bulge * 2.4 * scale, intensity], i * 3)
    colour.set(blackbody(look.light.core), i * 3)
  })
  const quad = new PlaneGeometry(2, 2)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('aCentre', new InstancedBufferAttribute(centre, 3))
  geometry.setAttribute('aCore', new InstancedBufferAttribute(core, 3))
  geometry.setAttribute('aColour', new InstancedBufferAttribute(colour, 3))
  geometry.instanceCount = count
  return geometry
}

function createField(universe: Universe, count: number): BufferGeometry {
  const field = deepField(universe, count)
  const geometry = new BufferGeometry()
  geometry.setAttribute('aPlace', new BufferAttribute(field.place, 4))
  geometry.setAttribute('aLook', new BufferAttribute(field.look, 4))
  geometry.setAttribute('aColour', new BufferAttribute(field.colour, 4, true))
  geometry.setDrawRange(0, count)
  return geometry
}

function createGas(universe: Universe, count: number): BufferGeometry {
  const gas = webGas(universe, count)
  const geometry = new BufferGeometry()
  geometry.setAttribute('aPlace', new BufferAttribute(gas.place, 4))
  geometry.setAttribute('aLook', new BufferAttribute(gas.look, 4))
  geometry.setDrawRange(0, count)
  return geometry
}

/** True when the object and everything above it is shown. */
function shown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return true
}

const cameraLocal = new Vector3()

/**
 * The universe's content: its galaxies, the faint gas of the cosmic web, its nebulae, the deep
 * field of distant galaxies behind them all, and the black hole. The galaxies' glow, the gas and the nebulae
 * are soft light, drawn into their own reduced-resolution buffer and laid over the deep field;
 * the galaxies' brightest stars are drawn sharp on top. Everything moves in vertex shaders.
 */
export function Cosmos({ universe }: { universe: Universe }) {
  const level = useLevel()
  const gl = useThree((s) => s.gl)
  const [tier] = useState(() => QUALITY[useVoid.getState().quality])
  const galaxies = useShared(`universe:${tier.universeParticles}`, () => new UniverseGalaxies(universe, tier.universeParticles), POLICY)
  const [atlasSize] = useState(() => (useVoid.getState().quality === 'low' ? 512 : 1024))
  const atlas = useShared(`nebula-atlas:${atlasSize}`, () => new NebulaAtlas(atlasSize), ATLAS_POLICY)
  const root = useRef<Group>(null)
  const warmed = useRef(false)

  // Seen first, the universe is built at once while the page loads; arrived at mid-flight, it
  // is built a galaxy at a time.
  useLayoutEffect(() => {
    if (galaxies.ready) return
    if (level.background) {
      enqueueWork(galaxies)
      return () => cancelWork(galaxies)
    }
    galaxies.run()
  }, [galaxies, level.background])

  useLayoutEffect(() => {
    if (atlas.job.ready) return
    if (level.background) {
      enqueueBake(atlas.job)
      return () => cancelBake(atlas.job)
    }
    atlas.job.run(gl)
  }, [atlas, gl, level.background])

  const parts = useMemo(() => {
    const buffer = new SoftBuffer('universe', SCREEN_ORDER.light)
    const time: IUniform = { value: 0 }
    const fade: IUniform = { value: 0 }
    const camera: IUniform = { value: new Vector3() }
    const softPixels: IUniform = { value: 1000 }
    const screenPixels: IUniform = { value: 1000 }
    const maxPointSize: IUniform = { value: 256 }
    const exposure: IUniform = { value: num(TWEAKS, 'exposure') }
    const lightUniforms = (side: number): Record<string, IUniform> => ({
      uTime: time,
      uGalaxies: { value: galaxies.data },
      uFade: fade,
      uCamera: camera,
      uSide: { value: side },
      uExposure: exposure,
      uPixelsPerUnit: softPixels,
      uMinSigma: { value: 0.75 },
      uMaxSigma: { value: 14 },
      uMaxPointSize: maxPointSize,
      uPeakMax: { value: 6 },
      uYoungShift: { value: 0.25 },
      uResolve: { value: 0 },
    })
    const light = (name: string, side: number) =>
      new ShaderMaterial({
        name,
        vertexShader: lightVert,
        fragmentShader: lightFrag,
        uniforms: lightUniforms(side),
        ...ADD_KEEPING_ALPHA,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    const far = light('universe-light-far', 0)
    const near = light('universe-light-near', 1)
    const dust = new ShaderMaterial({
      name: 'universe-dust',
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      uniforms: {
        uTime: time,
        uGalaxies: { value: galaxies.data },
        uFade: fade,
        uPixelsPerUnit: softPixels,
        uMinSigma: { value: 0.75 },
        uMaxSigma: { value: 10 },
        uMaxPointSize: maxPointSize,
        uDustScale: { value: 1 },
        // Dust scatters a little of its galaxy's light: dark lanes read warm brown, not grey.
        uColour: { value: new Color(0.035, 0.018, 0.009) },
      },
      blending: NormalBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const cores = new ShaderMaterial({
      name: 'universe-cores',
      vertexShader: coreVert,
      fragmentShader: coreFrag,
      uniforms: { uFade: fade, uPixelsPerUnit: softPixels, uMinRadius: { value: 0.9 }, uIntensity: { value: num(TWEAKS, 'coreLight') / 2 } },
      ...ADD_KEEPING_ALPHA,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const gas = new ShaderMaterial({
      name: 'universe-gas',
      vertexShader: gasVert,
      fragmentShader: lightFrag,
      uniforms: {
        uFade: fade,
        uExposure: { value: num(TWEAKS, 'gas') },
        uPixelsPerUnit: softPixels,
        uMinSigma: { value: 0.75 },
        uMaxSigma: { value: 40 },
        uMaxPointSize: maxPointSize,
      },
      ...ADD_KEEPING_ALPHA,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const sparkle = new ShaderMaterial({
      name: 'universe-sparkle',
      vertexShader: lightVert,
      fragmentShader: lightFrag,
      uniforms: {
        ...lightUniforms(-1),
        uExposure: { value: num(TWEAKS, 'sparkle') },
        uPixelsPerUnit: screenPixels,
        uMinSigma: { value: 0.6 },
        uMaxSigma: { value: 1.3 },
        uPeakMax: { value: 10 },
        uResolve: { value: 1 },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const field = new ShaderMaterial({
      name: 'universe-field',
      vertexShader: fieldVert,
      fragmentShader: fieldFrag,
      uniforms: {
        uFade: fade,
        uExposure: { value: num(TWEAKS, 'field') },
        uPixelsPerUnit: screenPixels,
        uMinSigma: { value: 0.65 },
        uMaxPointSize: maxPointSize,
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
    const nebulae = createUniverseNebulae(universe.nebulae, time, fade, atlas)
    nebulae.material.uniforms.uGlow!.value = num(TWEAKS, 'nebulae')

    const coreGeometry = createCores(universe)
    const fieldGeometry = createField(universe, tier.deepField)
    const gasGeometry = createGas(universe, tier.webGas)
    const layers = {
      gas: new Points(gasGeometry, gas),
      nebulae: nebulae.mesh,
      far: new Points(galaxies.light, far),
      cores: new Mesh(coreGeometry, cores),
      dust: new Points(galaxies.dust, dust),
      near: new Points(galaxies.light, near),
    }
    for (const [name, object] of Object.entries(layers)) {
      object.frustumCulled = false
      object.renderOrder = BUFFER_ORDER[name as keyof typeof BUFFER_ORDER]
      buffer.holder.add(object)
    }
    const screen = {
      field: new Points(fieldGeometry, field),
      composite: buffer.composite,
      sparkle: new Points(galaxies.sparkle, sparkle),
    }
    screen.field.renderOrder = SCREEN_ORDER.field
    screen.sparkle.renderOrder = SCREEN_ORDER.sparkle
    for (const object of Object.values(screen)) object.frustumCulled = false

    return {
      buffer,
      time,
      fade,
      camera,
      softPixels,
      screenPixels,
      maxPointSize,
      exposure,
      materials: [far, near, dust, cores, gas, sparkle, field],
      sparkle,
      cores,
      gas,
      field,
      nebulae,
      geometries: [coreGeometry, fieldGeometry, gasGeometry],
      screen,
    }
  }, [universe, galaxies, atlas, tier])

  useEffect(
    () => () => {
      for (const material of parts.materials) material.dispose()
      for (const geometry of parts.geometries) geometry.dispose()
      parts.nebulae.dispose()
      parts.buffer.dispose()
    },
    [parts],
  )

  // The buffer's objects are not in the scene graph: they are compiled with the level's own.
  useLayoutEffect(() => {
    level.extras.add(parts.buffer.scene)
    return () => {
      level.extras.delete(parts.buffer.scene)
    }
  }, [level, parts])

  useLayoutEffect(() => {
    const context = gl.getContext()
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array | null
    parts.maxPointSize.value = range ? range[1] : 64
  }, [gl, parts])

  const apply = useMemo(
    () => (key: string, value: TweakValue) => {
      if (typeof value !== 'number') return
      if (key === 'exposure') parts.exposure.value = value
      if (key === 'sparkle') parts.sparkle.uniforms.uExposure!.value = value
      if (key === 'coreLight') parts.cores.uniforms.uIntensity!.value = value / 2
      if (key === 'gas') parts.gas.uniforms.uExposure!.value = value
      if (key === 'field') parts.field.uniforms.uExposure!.value = value
      if (key === 'nebulae') parts.nebulae.material.uniforms.uGlow!.value = value
    },
    [parts],
  )
  useTweaks('Universe', TWEAKS, apply)

  useFrame((state, delta) => {
    const group = root.current
    if (!group) return
    const ready = galaxies.ready && atlas.job.ready
    const { buffer, screen } = parts
    const cam = state.camera as PerspectiveCamera
    const dpr = state.viewport.dpr
    buffer.resize(state.size.width, state.size.height, dpr, delta, useVoid.getState().quality)
    parts.softPixels.value = buffer.pixelsPerUnit(cam.fov)
    parts.screenPixels.value = (state.size.height * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360))
    parts.time.value = worldClock.time
    parts.fade.value = level.fade.current
    ;(parts.camera.value as Vector3).copy(group.worldToLocal(cameraLocal.copy(cam.position)))
    parts.sparkle.uniforms.uMinSigma!.value = 0.6 * dpr
    parts.sparkle.uniforms.uMaxSigma!.value = 1.3 * dpr
    parts.field.uniforms.uMinSigma!.value = 0.65 * dpr

    const visible = shown(group) && level.fade.current > 0
    screen.composite.visible = false
    screen.sparkle.visible = ready
    screen.field.visible = ready
    // Draw once before it ever shows, so its buffers upload while the level is still hidden.
    if (!ready || (!visible && warmed.current)) return
    warmed.current = true
    screen.composite.visible = visible
    buffer.render(gl, cam, group.matrixWorld)
  })

  return (
    <group ref={root}>
      <primitive object={parts.screen.field} />
      <primitive object={parts.screen.composite} />
      <primitive object={parts.screen.sparkle} />
      <BlackHole hole={universe.hole} />
    </group>
  )
}
