/**
 * The camera rig's state, shared by the rig component (which turns input into motion) and
 * the transition director (which takes over the camera for flights between levels).
 * The camera orbits a centre point at a distance; angles follow three's spherical
 * convention (polar from up, azimuth from +z towards +x) in the pose's basis, which is the
 * frame's own axes except while a flight banks from one level's plane into another's.
 */
import { Quaternion, Vector3 } from 'three'
import type { OrbitView } from './views.ts'

export interface RigPose {
  readonly center: Vector3
  distance: number
  azimuth: number
  polar: number
  /** The orbit's axes in the frame: identity, except while banking between levels. */
  readonly basis: Quaternion
}

/** Keep away from the poles, where an orbit flips over. */
export const POLAR_MIN = 0.08 * Math.PI
export const POLAR_MAX = 0.92 * Math.PI

export const rig = {
  /** Where the camera is now, in the active level's frame. */
  pose: { center: new Vector3(), distance: 6, azimuth: 0, polar: Math.PI / 2, basis: new Quaternion() } as RigPose,
  /** Where steering is taking it. */
  target: { distance: 6, azimuth: 0, polar: Math.PI / 2 },
  velocity: { azimuth: 0, polar: 0 },
  limits: { min: 1, max: 10 },
  /**
   * A scripted flight. While set, it writes the pose every frame and input only steers
   * through the director (Escape).
   */
  flight: null as ((pose: RigPose, delta: number) => void) | null,
}

/** Jump straight to a framing, e.g. when a level opens. */
export function placeRig(view: OrbitView, distance: number, center = new Vector3()) {
  const { pose, target, velocity } = rig
  pose.center.copy(center)
  pose.basis.identity()
  pose.distance = target.distance = Math.min(Math.max(view.distance ?? distance, rig.limits.min), rig.limits.max)
  pose.azimuth = target.azimuth = view.azimuth
  pose.polar = target.polar = view.polar
  velocity.azimuth = velocity.polar = 0
}

/** Hand control back to steering from wherever a flight left the camera. */
export function settleRig() {
  const { pose, target, velocity } = rig
  target.distance = Math.min(Math.max(pose.distance, rig.limits.min), rig.limits.max)
  target.azimuth = pose.azimuth
  target.polar = Math.min(Math.max(pose.polar, POLAR_MIN), POLAR_MAX)
  velocity.azimuth = velocity.polar = 0
}

/** The shortest turn from one angle to another. */
export function angleBetween(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
