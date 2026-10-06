import { Canvas, useFrame, type RootState } from '@react-three/fiber'
import { lazy, Suspense, useRef } from 'react'
import type { WebGLRendererParameters } from 'three'
import { DEBUG } from '../core/env.ts'
import { QUALITY } from '../core/quality.ts'
import { useVoid } from '../core/store.ts'
import { CameraRig } from './camera/CameraRig.tsx'
import { Starfield } from './objects/Starfield.tsx'
import { PostPipeline } from './post/PostPipeline.tsx'
import { QualityGovernor } from './QualityGovernor.tsx'

const DebugProbe = DEBUG ? lazy(() => import('../debug/DebugProbe.tsx')) : null

// Antialiasing happens in post (SMAA); alpha and stencil are never used.
const GL: WebGLRendererParameters = {
  antialias: false,
  alpha: false,
  stencil: false,
  depth: true,
  powerPreference: 'high-performance',
}

const CAMERA = { fov: 50, near: 0.05, far: 4000, position: [0, 0, 6] as [number, number, number] }

function onCreated({ gl }: RootState) {
  // The film grade lifts black to Abyss after tone mapping, so the clear colour is true black.
  gl.setClearColor(0x000000, 1)
}

/** Marks the document once real frames are on screen, for the screenshot script. */
function ReadySignal() {
  const frames = useRef(0)
  useFrame(() => {
    frames.current++
    if (frames.current === 8) document.documentElement.dataset.voidReady = 'true'
  })
  return null
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
      <QualityGovernor />
      <CameraRig />
      <Starfield />
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
