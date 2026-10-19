import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { stepOpening, wantsCurtainUp } from '../intro/opening.ts'
import { CompileJob } from './shared/compile.ts'
import { worldClock } from './shared/clock.ts'
import { curtain } from './stage.ts'

/**
 * Runs the opening on the frame clock: after world time has advanced, before the camera
 * moves, so a flight the opening starts flies from this very frame.
 *
 * Before the curtain rises on the loaded scene, everything in it is compiled once more: some
 * materials only take their final form once their maps are baked, after their level's first
 * compile. Drawn without this, they would compile one by one in the first frame.
 */
export function IntroDriver() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const pending = useRef<CompileJob | null>(null)
  useFrame(() => {
    if (curtain.closed && wantsCurtainUp()) {
      pending.current ??= new CompileJob([scene])
      if (pending.current.step(gl, camera, scene)) {
        pending.current = null
        curtain.closed = false
      }
    }
    stepOpening(worldClock.step)
  }, -70)
  return null
}
