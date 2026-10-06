/**
 * Every level lives in its own frame with its own units (a system's outer orbit ~200, a
 * planet's radius 1), so precision never suffers. A child's frame sits inside its parent's
 * at an anchor: the child's origin at a moving point, scaled by the child's size. During a
 * swap the leaving level is drawn through this anchor, in the arriving level's frame.
 */
import { Vector3 } from 'three'
import { getSystem, orbitPosition, type Path } from '../core/universe.ts'

const point: [number, number, number] = [0, 0, 0]

/**
 * Where the child level at `path` sits in its parent's frame at `time`: writes its origin
 * into `out` and returns its scale (parent units per child unit).
 */
export function anchorOf(path: Path, time: number, out: Vector3): number {
  if (path.length === 3) {
    const planet = getSystem(path[0]!, path[1]!).planets[path[2]!]!
    orbitPosition(planet.orbit, time, point)
    out.set(point[0], point[1], point[2])
    return planet.radius
  }
  out.set(0, 0, 0)
  return 1
}

const anchor = new Vector3()

/**
 * The transform that draws a level's frame inside the active frame: writes its origin into
 * `position` and returns its uniform scale. Only parent and child of each other are ever
 * on screen together.
 */
export function frameTransform(level: Path, active: Path, time: number, position: Vector3): number {
  if (level.length === active.length) {
    position.set(0, 0, 0)
    return 1
  }
  if (level.length === active.length + 1) {
    // A child drawn in its parent's frame.
    const scale = anchorOf(level, time, anchor)
    position.copy(anchor)
    return scale
  }
  // A parent drawn in its child's frame.
  const scale = anchorOf(active, time, anchor)
  position.copy(anchor).multiplyScalar(-1 / scale)
  return 1 / scale
}
