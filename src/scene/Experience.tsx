import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber'
import { lazy, Suspense, useRef } from 'react'
import type { WebGLRendererParameters } from 'three'
import { galaxySite, type GalaxyKind } from '../core/cosmos.ts'
import { DEBUG, LEVEL, PLANET } from '../core/env.ts'
import { isPlanetKind } from '../core/planets.ts'
import { QUALITY } from '../core/quality.ts'
import { useVoid } from '../core/store.ts'
import { HOME } from '../core/universe.ts'
import { CameraRig } from './camera/CameraRig.tsx'
import { Levels } from './levels/Levels.tsx'
import { ShowroomLevel } from './levels/ShowroomLevel.tsx'
import { SkyLevel } from './levels/SkyLevel.tsx'
import { Starfield } from './objects/Starfield.tsx'
import { PostPipeline } from './post/PostPipeline.tsx'
import { QualityGovernor } from './QualityGovernor.tsx'
import { bakesPending, currentBake, runBakeQueue } from './shared/bake.ts'
import { advanceWorldClock } from './shared/clock.ts'
import { runWork, workPending } from './shared/work.ts'
import { levelRuntime, marker, pointer } from './stage.ts'
import { installTestHooks } from './testHooks.ts'

const DebugProbe = DEBUG ? lazy(() => import('../debug/DebugProbe.tsx')) : null

installTestHooks()

const SHOWROOM = LEVEL !== 'sky' && isPlanetKind(PLANET)

// Antialiasing happens in post (SMAA); alpha and stencil are never used.
const GL: WebGLRendererParameters = {
  antialias: false,
  alpha: false,
  stencil: false,
  depth: true,
  powerPreference: 'high-performance',
}

/**
 * The far plane is far enough for the whole universe, even drawn in a galaxy's frame (some
 * twenty times larger) while the two crossfade. Depth precision is set by the near plane,
 * which follows the camera's distance.
 */
const CAMERA = { fov: 50, near: 0.05, far: 120000, position: [0, 0, 6] as [number, number, number] }

/**
 * Tiles baked per frame in the background follow the frame rate: one more for every frame on
 * time, half as many after a late one, and back to one whenever a new pass begins (passes
 * differ in cost by an order of magnitude). A strong GPU bakes a world in a few dozen
 * frames; a weak one overshoots by at most a tile. One tile is always baked, so a bake
 * always ends.
 */
const BAKE_MAX_TILES = 48

/**
 * Milliseconds of CPU work (a galaxy's particles) per frame in the background: a few while
 * frames are on time, less after a late one.
 */
const WORK_BUDGET = 4

function onCreated({ gl }: RootState) {
  // The film grade lifts black to Abyss after tone mapping, so the clear colour is true black.
  gl.setClearColor(0x000000, 1)
  // Reading back compile logs stalls the pipeline on a program's first use. Production
  // builds skip it; shader errors are caught in development and by the screenshot run.
  gl.debug.checkShaderErrors = import.meta.env.DEV
}

/** Advances world time before anything else reads it this frame. */
function WorldClock() {
  useFrame((_, delta) => advanceWorldClock(delta), -100)
  return null
}

/** Spends each frame's background budgets (GPU bakes and CPU work), adapting to the frame rate. */
function BakeDriver() {
  const gl = useThree((s) => s.gl)
  const tiles = useRef(1)
  const pass = useRef<object | null>(null)
  useFrame((_, delta) => {
    if (workPending()) runWork(delta > 1 / 45 ? WORK_BUDGET / 2 : WORK_BUDGET)
    if (!bakesPending()) {
      pass.current = null
      return
    }
    const current = currentBake()
    if (current !== pass.current) {
      pass.current = current
      tiles.current = 1
    } else if (delta > 1 / 45) tiles.current = Math.max(1, Math.floor(tiles.current / 2))
    else if (delta < 1 / 55) tiles.current = Math.min(BAKE_MAX_TILES, tiles.current + 1)
    runBakeQueue(gl, tiles.current)
  }, -80)
  return null
}

/** What the pointer is over, the hover ring's place on screen, and the cursor. */
function HoverDriver() {
  const canvas = useThree((s) => s.gl.domElement)
  useFrame(() => {
    const store = useVoid.getState()
    const runtime = levelRuntime(store.path)
    const idle = store.transition.phase === 'idle'
    if (idle && pointer.hovering && runtime.pick) {
      const hit = runtime.pick(pointer.x, pointer.y)
      const index = hit ? hit.index : null
      if (index !== store.hoverTarget) store.setHoverTarget(index)
    }
    const target = useVoid.getState().hoverTarget
    canvas.style.cursor = idle && pointer.hovering && target !== null ? 'pointer' : ''
    const element = marker.element
    if (!element) return
    const spot = idle && target !== null ? runtime.locate?.(target) : null
    if (spot) {
      element.style.transform = `translate3d(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px, 0)`
      element.style.setProperty('--ring', `${Math.max(spot.radius + 7, 13).toFixed(1)}px`)
      element.dataset.side = spot.x > canvas.clientWidth - 220 ? 'left' : 'right'
      element.dataset.shown = 'true'
    } else {
      element.dataset.shown = 'false'
    }
  })
  return null
}

/** Marks the document once the scene is compiled, baked and on screen, for the screenshot script. */
function ReadySignal() {
  const frames = useRef(0)
  useFrame(() => {
    const ready = SHOWROOM || LEVEL === 'sky' || levelRuntime(useVoid.getState().path).ready
    if (!ready) {
      frames.current = 0
      return
    }
    frames.current++
    if (frames.current === 8) document.documentElement.dataset.voidReady = 'true'
  })
  return null
}

/**
 * How much of a band the sky inside a galaxy shows, by the galaxy's kind: a spiral's disc
 * crosses its sky; an irregular's thick, patchy disc less clearly; an elliptical has none.
 */
const BAND: Record<GalaxyKind, number> = { spiral: 1, barred: 1, irregular: 0.5, elliptical: 0 }

function Sky() {
  const level = useVoid((s) => s.level)
  const galaxy = useVoid((s) => (s.path.length >= 2 ? s.path[0]! : HOME[0]!))
  const band = BAND[galaxySite(galaxy).kind]
  if (LEVEL === 'sky') return <Starfield />
  if (SHOWROOM || level === 'planet') return <Starfield brightness={0.75} band={0.4 * band} />
  // Outside a galaxy its band is gone: what is left are a few stars between the galaxies,
  // fewer still out among the clusters.
  if (level === 'galaxy') return <Starfield brightness={0.45} band={0} />
  if (level === 'universe' || level === 'hole') return <Starfield brightness={0.3} band={0} />
  return <Starfield brightness={0.9} band={0.55 * band} />
}

/** The single canvas: every level, the camera, and the post pipeline live here. */
export function Experience() {
  const quality = useVoid((s) => s.quality)
  return (
    <Canvas
      className="void-canvas"
      dpr={[1, QUALITY[quality].maxDpr]}
      gl={GL}
      camera={CAMERA}
      onCreated={onCreated}
    >
      <WorldClock />
      <BakeDriver />
      <QualityGovernor />
      <CameraRig />
      <Sky />
      {LEVEL === 'sky' ? <SkyLevel /> : SHOWROOM ? <ShowroomLevel /> : <Levels />}
      <HoverDriver />
      <PostPipeline />
      <ReadySignal />
      {DebugProbe && (
        <Suspense fallback={null}>
          <DebugProbe />
        </Suspense>
      )}
    </Canvas>
  )
}
