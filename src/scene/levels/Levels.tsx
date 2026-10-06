import { useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  HalfFloatType,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Group,
  type Material,
  type Scene,
  type WebGLRenderer,
} from 'three'
import { getGalaxy } from '../../core/galaxy.ts'
import { pathKey, useVoid } from '../../core/store.ts'
import { getSystem, levelOf, type Path } from '../../core/universe.ts'
import { useOpeningView } from '../camera/opening.ts'
import { galaxyLimits, galaxyViews, systemLimits, systemViews } from '../camera/views.ts'
import { frameTransform } from '../frames.ts'
import { bakesPending } from '../shared/bake.ts'
import { worldClock } from '../shared/clock.ts'
import { workPending } from '../shared/work.ts'
import { levelRuntime } from '../stage.ts'
import { LevelContext, type LevelInfo } from './context.ts'
import { GalaxyLevel } from './GalaxyLevel.tsx'
import { PlanetLevel } from './PlanetLevel.tsx'
import { SystemLevel } from './SystemLevel.tsx'

/**
 * A one-pixel target of the kind the scene really renders into (linear, half float), bound
 * while shaders are precompiled: three keys programs by output colour space, and programs
 * compiled for the screen would be compiled again at first use.
 */
let compileTarget: WebGLRenderTarget | null = null

interface ProgramState {
  currentProgram?: { isReady(): boolean; getUniforms(): unknown }
}

function programOf(gl: WebGLRenderer, material: Material) {
  return (gl.properties.get(material) as ProgramState).currentProgram
}

/**
 * Start compiling a level's shaders. With KHR_parallel_shader_compile the driver compiles in
 * the background and the returned materials are polled until their programs are ready;
 * without it, linking is forced now, mid-flight, rather than at the moment of the swap.
 */
function precompile(gl: WebGLRenderer, root: Group, camera: Camera, scene: Scene): Set<Material> {
  compileTarget ??= new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true })
  const previous = gl.getRenderTarget()
  gl.setRenderTarget(compileTarget)
  const materials = gl.compile(root, camera, scene)
  gl.setRenderTarget(previous)
  if (!gl.extensions.has('KHR_parallel_shader_compile')) {
    for (const material of materials) programOf(gl, material)?.getUniforms()
    materials.clear()
  }
  return materials
}

/** True once every program has finished compiling. Disposed materials no longer count. */
function compiledAll(gl: WebGLRenderer, materials: Set<Material>): boolean {
  for (const material of materials) {
    const program = programOf(gl, material)
    if (!program || program.isReady()) materials.delete(material)
  }
  return materials.size === 0
}

const position = new Vector3()

function GalaxyFrame({ path, background }: { path: Path; background: boolean }) {
  const galaxy = getGalaxy(path[0]!)
  const views = useMemo(() => galaxyViews(galaxy), [galaxy])
  const limits = useMemo(() => galaxyLimits(galaxy), [galaxy])
  useOpeningView(views, views.home!.distance!, limits, !background)
  return <GalaxyLevel path={path} />
}

function SystemFrame({ path, background }: { path: Path; background: boolean }) {
  const system = getSystem(path[0]!, path[1]!)
  const views = useMemo(() => systemViews(system), [system])
  const limits = useMemo(() => systemLimits(system), [system])
  useOpeningView(views, views.home!.distance!, limits, !background)
  return <SystemLevel path={path} />
}

/**
 * One mounted level in its own frame. The active level is drawn as is; a level leaving or
 * arriving is drawn through its anchor in the active frame, with its share of the screen.
 * Memoised: a swap changes the store but not the levels, and must not re-render them.
 */
const LevelFrame = memo(function LevelFrame({ path }: { path: Path }) {
  const runtime = levelRuntime(path)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const root = useRef<Group>(null)
  // 'pending' until the first frame after mounting (React's development double-mount has
  // settled by then), then the materials still compiling, then 'done'.
  const compile = useRef<'pending' | Set<Material> | 'done'>('pending')
  const [background] = useState(() => useVoid.getState().transition.phase !== 'idle')
  const info = useMemo<LevelInfo>(() => ({ fade: runtime.fade, background }), [runtime, background])

  useEffect(() => {
    compile.current = 'pending'
  }, [])

  useFrame(() => {
    const group = root.current
    if (!group) return
    const scale = frameTransform(path, useVoid.getState().path, worldClock.time, position)
    group.position.copy(position)
    group.scale.setScalar(scale)
    group.visible = runtime.visible
    // Compile this level's shaders in parallel instead of stalling the frame it appears in.
    if (compile.current === 'pending') compile.current = precompile(gl, group, camera, scene)
    if (compile.current !== 'done' && compiledAll(gl, compile.current)) compile.current = 'done'
    runtime.ready = compile.current === 'done' && !bakesPending() && !workPending()
  }, -50)

  const level = levelOf(path)
  return (
    <group ref={root}>
      <LevelContext.Provider value={info}>
        {level === 'galaxy' && <GalaxyFrame path={path} background={background} />}
        {level === 'system' && <SystemFrame path={path} background={background} />}
        {level === 'planet' && <PlanetLevel path={path} />}
      </LevelContext.Provider>
    </group>
  )
})

/** The levels on stage: the current one, plus the next one while a transition runs. */
export function Levels() {
  const path = useVoid((s) => s.path)
  const transition = useVoid((s) => s.transition)
  const mounted = useMemo(() => {
    const both = transition.phase === 'approaching' || transition.phase === 'swapping'
    const list = both ? [transition.from, transition.to] : [path]
    const seen = new Set<string>()
    return list.filter((p) => {
      const key = pathKey(p)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [path, transition])

  return (
    <>
      {mounted.map((p) => (
        <LevelFrame key={pathKey(p)} path={p} />
      ))}
    </>
  )
}
