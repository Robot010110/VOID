/**
 * Gravity touch: holding the pointer down on empty space in a galaxy or among the galaxies
 * makes a well there; nearby particles bend towards it in their vertex shaders
 * (shaders/common/well.glsl) and spring back when it is let go.
 *
 * The camera rig decides when a press is a hold (`well.holding`) and where the pointer is; this
 * eases its strength in and out, and finds where it sits in a drawn object's own frame.
 */
import { Camera, Matrix4, Vector3, Vector4, type IUniform, type Object3D } from 'three'

export const well = {
  /** The pointer is held down on empty space. */
  holding: false,
  /** Where, CSS pixels from the canvas's top left. */
  x: 0,
  y: 0,
  /** How strong it is now, 0 to 1, easing in while held and out once let go. */
  strength: 0,
}

/** Seconds to gather, and to let go. */
const GATHER = 0.9
const RELEASE = 1.4

export function stepWell(seconds: number) {
  const target = well.holding ? 1 : 0
  const time = well.holding ? GATHER : RELEASE
  well.strength += (target - well.strength) * (1 - Math.exp((-seconds * 3) / time))
  if (!well.holding && well.strength < 1e-3) well.strength = 0
}

/** The uniforms a material takes for the well (see well.glsl), with its reach in its own units. */
export function wellUniforms(reach: number): { uWell: IUniform<Vector4>; uWellAxis: IUniform<Vector4> } {
  return { uWell: { value: new Vector4() }, uWellAxis: { value: new Vector4(0, 1, 0, reach) } }
}

const inverse = new Matrix4()
const origin = new Vector3()
const along = new Vector3()

/**
 * Point the well uniforms at the pointer, in `object`'s frame: where its ray meets the object's
 * plane (y = 0) when that is seen from well above or below, else a plane facing the camera
 * through the object's centre (`facing`). Things turn about the plane's normal.
 */
export function aimWell(
  uniforms: { uWell: IUniform<Vector4>; uWellAxis: IUniform<Vector4> },
  object: Object3D,
  camera: Camera,
  width: number,
  height: number,
  facing = false,
) {
  const strength = well.strength
  uniforms.uWell.value.w = strength
  if (strength <= 0) return
  inverse.copy(object.matrixWorld).invert()
  origin.copy(camera.position).applyMatrix4(inverse)
  along
    .set((well.x / width) * 2 - 1, 1 - (well.y / height) * 2, 0.5)
    .unproject(camera)
    .applyMatrix4(inverse)
    .sub(origin)
    .normalize()
  const axis = uniforms.uWellAxis.value
  let t = -1
  if (!facing && Math.abs(along.y) > 0.25) {
    t = -origin.y / along.y
    axis.set(0, origin.y > 0 ? 1 : -1, 0, axis.w)
  }
  if (t <= 0) {
    t = -origin.dot(along)
    axis.set(-along.x, -along.y, -along.z, axis.w)
  }
  if (t <= 0) {
    uniforms.uWell.value.w = 0
    return
  }
  const point = origin.addScaledVector(along, t)
  uniforms.uWell.value.set(point.x, point.y, point.z, strength)
}

export type WellUniforms = ReturnType<typeof wellUniforms>
