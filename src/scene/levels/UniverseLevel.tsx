import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type Group, type PerspectiveCamera } from 'three'
import { getUniverse } from '../../core/cosmos.ts'
import type { Path } from '../../core/universe.ts'
import { universeLimits } from '../camera/views.ts'
import { DISC_OUTER } from '../objects/BlackHole.tsx'
import { pixelRadius } from '../objects/body.ts'
import { Cosmos } from '../objects/Cosmos.tsx'
import { levelRuntime, type Pick } from '../stage.ts'

/** Pixels around a galaxy that still count as pointing at it. */
const REACH = 14

const world = new Vector3()
const projected = new Vector3()

/** The universe: its galaxies and the black hole are what can be fallen into from here. */
export function UniverseLevel({ path }: { path: Path }) {
  const universe = getUniverse()
  const runtime = levelRuntime(path)
  const get = useThree((s) => s.get)
  const root = useRef<Group>(null)

  useEffect(() => {
    const { hole } = universe
    const locate = (index: number): Pick | null => {
      const group = root.current
      const site = index === hole.index ? hole : universe.galaxies[index]
      if (!site || !group) return null
      const { camera, size } = get()
      const cam = camera as PerspectiveCamera
      world.set(site.position[0], site.position[1], site.position[2]).applyMatrix4(group.matrixWorld)
      projected.copy(world).project(cam)
      if (projected.z > 1 || projected.z < -1) return null
      const x = ((projected.x + 1) / 2) * size.width
      const y = ((1 - projected.y) / 2) * size.height
      if (x < 0 || y < 0 || x > size.width || y > size.height) return null
      const scale = group.matrixWorld.getMaxScaleOnAxis()
      // A galaxy's ring goes round its light; the hole's round its disc.
      const extent = 'size' in site ? site.size * 0.8 : hole.radius * DISC_OUTER
      const radius = pixelRadius(extent * scale, cam.position.distanceTo(world), cam.fov, size.height)
      return { index, x, y, radius: Math.max(radius, 3) }
    }
    const pick = (x: number, y: number): Pick | null => {
      let best: Pick | null = null
      let bestScore = Infinity
      for (let i = 0; i <= hole.index; i++) {
        const spot = locate(i)
        if (!spot) continue
        const reach = Math.max(spot.radius + 6, REACH)
        const distance = Math.hypot(spot.x - x, spot.y - y)
        // Closest to the pointer for its size, so a small galaxy beside a large one can be had.
        const score = distance / reach
        if (score <= 1 && score < bestScore) {
          best = spot
          bestScore = score
        }
      }
      return best
    }
    runtime.locate = locate
    runtime.pick = pick
    runtime.limits = universeLimits()
    return () => {
      runtime.locate = null
      runtime.pick = null
    }
  }, [runtime, universe, get])

  return (
    <group ref={root}>
      <Cosmos universe={universe} />
    </group>
  )
}
