import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber'
import { lazy, Suspense, useRef } from 'react'
import type { WebGLRendererParameters } from 'three'
import { DEBUG, LEVEL, PLANET } from '../core/env.ts'
import { isPlanetKind } from '../core/planets.ts'
import { QUALITY, type QualityTier } from '../core/quality.ts'
import { useVoid } from '../core/store.ts'
import { CameraRig } from './camera/CameraRig.tsx'
import { Levels } from './levels/Levels.tsx'
import { ShowroomLevel } from './levels/ShowroomLevel.tsx'
import { SkyLevel } from './levels/SkyLevel.tsx'
import { Starfield } from './objects/Starfield.tsx'
import { PostPipeline } from './post/PostPipeline.tsx'
import { QualityGovernor } from './QualityGovernor.tsx'
import { runBakeQueue } from './shared/bake.ts'
import { advanceWorldClock } from './shared/clock.ts'
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

const CAMERA = { fov: 50, near: 0.05, far: 4000, position: [0, 0, 6] as [number, number, number] }

/**
 * Cost-weighted texels baked per frame in the background. Measured so a full-size world's
 * maps finish in well under a second during a 2.2 s approach, without dropping frames.
 */
const BAKE_BUDGET: Record<QualityTier, number> = { high: 1_600_000, medium: 1_000_000, low: 500_000 }

function onCreated({ gl }: RootState) {
  // The film grade lifts black to Abyss after tone mapping, so the clear colour is true black.
  gl.setClearColor(0x000000, 1)
}

/** Advances world time before anything else reads it this frame. */
function WorldClock() {
  useFrame((_, delta) => advanceWorldClock(delta), -100)
  return null
}

/** Spends each frame's background-bake budget. */
function BakeDriver() {
  const gl = useThree((s) => s.gl)
  useFrame(() => runBakeQueue(gl, BAKE_BUDGET[useVoid.getState().quality]), -80)
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

function Sky() {
  const level = useVoid((s) => s.level)
  if (LEVEL === 'sky') return <Starfield />
  if (SHOWROOM || level === 'planet') return <Starfield brightness={0.75} band={0.4} />
  return <Starfield brightness={0.9} band={0.55} />
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
