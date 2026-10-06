import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from 'three'
import { ringProfile, type RingParams } from '../../core/planets.ts'

/** The radial density (r) and tint (g) profile of a ring system, shared with the planet. */
export function createRingTexture(rings: RingParams, seed: number): DataTexture {
  const count = 1024
  const profile = ringProfile(rings, seed, count)
  const data = new Uint8Array(count * 4)
  for (let i = 0; i < count; i++) {
    data[i * 4] = Math.round(profile[i * 2]! * 255)
    data[i * 4 + 1] = Math.round(profile[i * 2 + 1]! * 255)
    data[i * 4 + 3] = 255
  }
  const texture = new DataTexture(data, count, 1, RGBAFormat, UnsignedByteType)
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.generateMipmaps = true
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
