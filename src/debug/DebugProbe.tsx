import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { perf } from './perf.ts'

/**
 * Counts every draw call in a frame, including the post passes. three resets its counters
 * at each render() call by default, which would only show the last pass. Also hands the scene
 * to the console (`__VOID_SCENE__`) for inspecting what is on stage.
 */
export default function DebugProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    ;(window as unknown as { __VOID_SCENE__: unknown }).__VOID_SCENE__ = scene
  }, [scene])

  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])

  // Runs before anything renders.
  useFrame(() => gl.info.reset(), -1000)

  // Runs after the composer (priority 1) has drawn the frame.
  useFrame((_, delta) => {
    const ms = delta * 1000
    perf.frameMs = perf.frameMs === 0 ? ms : perf.frameMs * 0.92 + ms * 0.08
    perf.fps = 1000 / Math.max(perf.frameMs, 0.001)
    perf.calls = gl.info.render.calls
    perf.triangles = gl.info.render.triangles
    perf.points = gl.info.render.points
    perf.pixelRatio = gl.getPixelRatio()
  }, 1000)

  return null
}
