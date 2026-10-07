import { useEffect } from 'react'
import { getUniverse } from '../../core/cosmos.ts'
import type { Path } from '../../core/universe.ts'
import { holeLimits } from '../camera/views.ts'
import { levelRuntime } from '../stage.ts'

/**
 * The black hole, close up. It is drawn by the universe around it (the two are one place,
 * staged once), so this level only sets the camera's reach.
 */
export function HoleLevel({ path }: { path: Path }) {
  const runtime = levelRuntime(path)
  useEffect(() => {
    runtime.limits = holeLimits(getUniverse().hole)
  }, [runtime])
  return null
}
