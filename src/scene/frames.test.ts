import { Matrix4, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { getUniverse } from '../core/cosmos.ts'
import { getGalaxyLook } from '../core/galaxy.ts'
import { HOME_BAND } from '../core/sky.ts'
import { anchorOf, frameTransform } from './frames.ts'

function transform(level: number[], active: number[], time: number): Matrix4 {
  const position = new Vector3()
  const rotation = new Quaternion()
  const scale = frameTransform(level, active, time, position, rotation)
  return new Matrix4().compose(position, rotation, new Vector3(scale, scale, scale))
}

function expectIdentity(m: Matrix4) {
  const identity = new Matrix4()
  m.elements.forEach((value, i) => expect(value).toBeCloseTo(identity.elements[i]!, 6))
}

describe('frameTransform', () => {
  it('draws the active frame as it is', () => {
    expectIdentity(transform([0, 0], [0, 0], 12))
  })

  it("undoes a system's anchor in its galaxy exactly, turn and all", () => {
    for (const time of [0, 37, 9000]) {
      const childInParent = transform([0, 0], [0], time)
      const parentInChild = transform([0], [0, 0], time)
      expectIdentity(childInParent.multiply(parentInChild))
    }
  })

  it("undoes a world's anchor in its system exactly", () => {
    const childInParent = transform([0, 0, 3], [0, 0], 120)
    const parentInChild = transform([0, 0], [0, 0, 3], 120)
    expectIdentity(childInParent.multiply(parentInChild))
  })

  it("turns a system so its sky's band lies in the galaxy's plane", () => {
    const anchor = new Vector3()
    const rotation = new Quaternion()
    anchorOf([0, 0], 0, anchor, rotation)
    const pole = new Vector3(...HOME_BAND.pole).applyQuaternion(rotation)
    expect(pole.x).toBeCloseTo(0, 6)
    expect(pole.y).toBeCloseTo(1, 6)
    expect(pole.z).toBeCloseTo(0, 6)
    const core = new Vector3(...HOME_BAND.core).applyQuaternion(rotation)
    const towards = anchor.clone().setY(0).negate().normalize()
    expect(core.dot(towards)).toBeCloseTo(1, 6)
  })

  it("undoes a galaxy's anchor in the universe exactly, turn and scale", () => {
    for (const galaxy of [0, 1, 2, 7]) {
      const childInParent = transform([galaxy], [], 5)
      const parentInChild = transform([], [galaxy], 5)
      expectIdentity(childInParent.multiply(parentInChild))
    }
  })

  it('scales a galaxy down into the universe to its size there', () => {
    const site = getUniverse().galaxies[1]!
    const scale = anchorOf([1], 0, new Vector3(), new Quaternion())
    expect(scale * getGalaxyLook(1).shape.radius).toBeCloseTo(site.size, 9)
  })

  it("keeps the universe's own units at the black hole, turned to its disc", () => {
    const { hole } = getUniverse()
    const anchor = new Vector3()
    const rotation = new Quaternion()
    expect(anchorOf([hole.index], 0, anchor, rotation)).toBe(1)
    expect(anchor.toArray()).toEqual([...hole.position])
    const axis = new Vector3(0, 1, 0).applyQuaternion(rotation)
    const expected = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...hole.orientation))
    expect(axis.distanceTo(expected)).toBeLessThan(1e-9)
    expectIdentity(transform([hole.index], [], 0).multiply(transform([], [hole.index], 0)))
  })

  it('leaves a world unturned within its system', () => {
    const rotation = new Quaternion(1, 2, 3, 4).normalize()
    anchorOf([0, 0, 2], 50, new Vector3(), rotation)
    expect(rotation.w).toBeCloseTo(1, 9)
  })
})
