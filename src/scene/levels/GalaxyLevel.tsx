import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3, type Group, type PerspectiveCamera } from 'three'
import { galacticPosition, getGalaxy, SYSTEM_SCALE } from '../../core/galaxy.ts'
import { samePath, useVoid, type Transition } from '../../core/store.ts'
import type { Path } from '../../core/universe.ts'
import { galaxyLimits } from '../camera/views.ts'
import { pixelRadius } from '../objects/body.ts'
import { Galaxy } from '../objects/Galaxy.tsx'
import { worldClock } from '../shared/clock.ts'
import { levelRuntime, type Pick } from '../stage.ts'

/** Pixels around a star that still count as pointing at it. */
const REACH = 14

/** The star a running transition hands between this galaxy and its system, or -1. */
function handedStar(transition: Transition, galaxy: Path): number {
  if (transition.phase === 'idle') return -1
  for (const path of [transition.from, transition.to]) {
    if (path.length === 2 && path[0] === galaxy[0]) return path[1]!
  }
  return -1
}

const point: [number, number, number] = [0, 0, 0]
const world = new Vector3()
const projected = new Vector3()

/** One galaxy, with the few hundred stars that can be visited. */
export function GalaxyLevel({ path }: { path: Path }) {
  const galaxy = getGalaxy(path[0]!)
  const runtime = levelRuntime(path)
  const get = useThree((s) => s.get)
  const active = useVoid((s) => samePath(s.path, path))
  const handed = useVoid((s) => handedStar(s.transition, path))
  const root = useRef<Group>(null)

  useEffect(() => {
    const locate = (index: number): Pick | null => {
      const entry = galaxy.stars[index]
      const group = root.current
      if (!entry || !group) return null
      const { camera, size } = get()
      const cam = camera as PerspectiveCamera
      galacticPosition(galaxy, entry.orbit, worldClock.time, point)
      world.set(point[0], point[1], point[2]).applyMatrix4(group.matrixWorld)
      projected.copy(world).project(cam)
      if (projected.z > 1 || projected.z < -1) return null
      const x = ((projected.x + 1) / 2) * size.width
      const y = ((1 - projected.y) / 2) * size.height
      if (x < 0 || y < 0 || x > size.width || y > size.height) return null
      const scale = group.matrixWorld.getMaxScaleOnAxis()
      const disc = pixelRadius(entry.star.radius * SYSTEM_SCALE * scale, cam.position.distanceTo(world), cam.fov, size.height)
      return { index, x, y, radius: Math.max(disc, 2.5) }
    }
    const pick = (x: number, y: number): Pick | null => {
      let best: Pick | null = null
      let bestDistance = Infinity
      for (let i = 0; i < galaxy.stars.length; i++) {
        const spot = locate(i)
        if (!spot) continue
        const reach = Math.max(spot.radius + 6, REACH)
        const distance = Math.hypot(spot.x - x, spot.y - y)
        if (distance <= reach && distance < bestDistance) {
          best = spot
          bestDistance = distance
        }
      }
      return best
    }
    runtime.locate = locate
    runtime.pick = pick
    runtime.limits = galaxyLimits(galaxy)
    return () => {
      runtime.locate = null
      runtime.pick = null
    }
  }, [runtime, galaxy, get])

  return (
    <group ref={root}>
      <Galaxy galaxy={galaxy} active={active} handed={handed} />
    </group>
  )
}
