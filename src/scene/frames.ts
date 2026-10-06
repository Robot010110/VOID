/**
 * Every level lives in its own frame with its own units (a galaxy's disc ~200, a system's
 * outer orbit ~200, a planet's radius 1), so precision never suffers. A child's frame sits
 * inside its parent's at an anchor: the child's origin at a moving point, turned, and scaled
 * by the child's size. During a swap the leaving level is drawn through this anchor, in the
 * arriving level's frame.
 *
 * A planet's frame is not turned within its system. A system's frame is turned within its
 * galaxy (see systemOrientation): its sky's band is the galaxy's real plane.
 */
import { Matrix4, Quaternion, Vector3 } from 'three'
import { galacticPosition, getGalaxy, SYSTEM_SCALE, systemOrientation } from '../core/galaxy.ts'
import { getSystem, orbitPosition, type Path } from '../core/universe.ts'

const point: [number, number, number] = [0, 0, 0]
const turn = new Matrix4()
const rows: number[] = new Array<number>(9).fill(0)

/**
 * Where the child level at `path` sits in its parent's frame at `time`: writes its origin
 * into `out` and its turn into `rotation`, and returns its scale (parent units per child
 * unit).
 */
export function anchorOf(path: Path, time: number, out: Vector3, rotation: Quaternion): number {
  if (path.length === 3) {
    const planet = getSystem(path[0]!, path[1]!).planets[path[2]!]!
    orbitPosition(planet.orbit, time, point)
    out.set(point[0], point[1], point[2])
    rotation.identity()
    return planet.radius
  }
  if (path.length === 2) {
    const galaxy = getGalaxy(path[0]!)
    const star = galaxy.stars[path[1]!]!
    galacticPosition(galaxy, star.orbit, time, point)
    out.set(point[0], point[1], point[2])
    systemOrientation(point, rows)
    turn.set(rows[0]!, rows[1]!, rows[2]!, 0, rows[3]!, rows[4]!, rows[5]!, 0, rows[6]!, rows[7]!, rows[8]!, 0, 0, 0, 0, 1)
    rotation.setFromRotationMatrix(turn)
    return SYSTEM_SCALE
  }
  out.set(0, 0, 0)
  rotation.identity()
  return 1
}

const anchor = new Vector3()

/**
 * The transform that draws a level's frame inside the active frame: writes its origin into
 * `position` and its turn into `rotation`, and returns its uniform scale. Only parent and
 * child of each other are ever on screen together.
 */
export function frameTransform(level: Path, active: Path, time: number, position: Vector3, rotation: Quaternion): number {
  if (level.length === active.length) {
    position.set(0, 0, 0)
    rotation.identity()
    return 1
  }
  if (level.length === active.length + 1) {
    // A child drawn in its parent's frame.
    const scale = anchorOf(level, time, anchor, rotation)
    position.copy(anchor)
    return scale
  }
  // A parent drawn in its child's frame: the anchor undone.
  const scale = anchorOf(active, time, anchor, rotation)
  rotation.invert()
  position.copy(anchor).applyQuaternion(rotation).multiplyScalar(-1 / scale)
  return 1 / scale
}
