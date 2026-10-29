import { describe, expect, it } from 'vitest'
import { defaultsToHd, guessTier, parseTier, QUALITY, renderDpr, stepTier, STAR_CATALOGUE_SIZE, textureSize } from './quality.ts'

const desktop = { touch: false, memory: 8, cores: 8 }
const gpu = (renderer: string) => ({ webgl2: true, renderer })

describe('guessTier', () => {
  it('starts discrete and Apple silicon GPUs on high', () => {
    expect(guessTier(gpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)'), desktop)).toBe(
      'high',
    )
    expect(guessTier(gpu('Apple M1'), desktop)).toBe('high')
    expect(guessTier(gpu('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'), desktop)).toBe(
      'high',
    )
  })

  it('starts older integrated Intel graphics on low', () => {
    expect(
      guessTier(gpu('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00003EA0) Direct3D11)'), desktop),
    ).toBe('low')
  })

  it('treats software rendering as low', () => {
    expect(
      guessTier(gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))'), desktop),
    ).toBe('low')
    expect(guessTier(gpu('llvmpipe (LLVM 15.0.7, 256 bits)'), desktop)).toBe('low')
  })

  it('separates strong and weak phones', () => {
    expect(guessTier(gpu('Apple GPU'), { touch: true })).toBe('medium')
    expect(guessTier(gpu('Adreno (TM) 740'), { touch: true })).toBe('medium')
    expect(guessTier(gpu('Adreno (TM) 610'), { touch: true })).toBe('low')
    expect(guessTier(gpu('Mali-G52 MC2'), { touch: true })).toBe('low')
  })

  it('caps the tier on low memory or few cores', () => {
    expect(guessTier(gpu('NVIDIA GeForce GTX 1650'), { ...desktop, memory: 4 })).toBe('medium')
    expect(guessTier(gpu('NVIDIA GeForce GTX 1650'), { ...desktop, memory: 2 })).toBe('low')
    expect(guessTier(gpu('NVIDIA GeForce GTX 1650'), { ...desktop, cores: 2 })).toBe('low')
  })
})

describe('stepTier', () => {
  it('steps between neighbouring tiers and stops at the ends', () => {
    expect(stepTier('high', -1)).toBe('medium')
    expect(stepTier('medium', -1)).toBe('low')
    expect(stepTier('low', -1)).toBe('low')
    expect(stepTier('low', 1)).toBe('medium')
    expect(stepTier('high', 1)).toBe('high')
  })

  it('never climbs to ultra, and never leaves it', () => {
    expect(stepTier('high', 1)).not.toBe('ultra')
    expect(stepTier('ultra', -1)).toBe('ultra')
    expect(stepTier('ultra', 1)).toBe('ultra')
  })
})

describe('renderDpr', () => {
  it('supersamples ordinary screens on ultra, up to twice', () => {
    expect(renderDpr('ultra', 1)).toBe(1.5)
    expect(renderDpr('ultra', 1.25)).toBe(1.5)
    expect(renderDpr('ultra', 2)).toBe(2)
    expect(renderDpr('ultra', 3)).toBe(2)
  })

  it('clamps the device into the tier on the others', () => {
    expect(renderDpr('high', 3)).toEqual([1, 2])
    expect(renderDpr('low', 2)).toEqual([1, 1])
  })

  it('gives ultra the largest textures', () => {
    expect([textureSize('ultra'), textureSize('high'), textureSize('low')]).toEqual([2048, 1024, 512])
  })
})

describe('parseTier', () => {
  it('accepts only known tiers', () => {
    expect(parseTier('high')).toBe('high')
    expect(parseTier('ultra')).toBe('ultra')
    expect(parseTier('max')).toBeNull()
    expect(parseTier(null)).toBeNull()
  })
})

describe('QUALITY', () => {
  it('draws 30k, 15k and 6k stars and clamps the pixel ratio to 2, 1.5 and 1', () => {
    expect(STAR_CATALOGUE_SIZE * QUALITY.high.starFraction).toBe(30000)
    expect(STAR_CATALOGUE_SIZE * QUALITY.medium.starFraction).toBe(15000)
    expect(STAR_CATALOGUE_SIZE * QUALITY.low.starFraction).toBe(6000)
    expect([QUALITY.high.maxDpr, QUALITY.medium.maxDpr, QUALITY.low.maxDpr]).toEqual([2, 1.5, 1])
  })

  it('puts ultra above high everywhere it matters', () => {
    expect(QUALITY.ultra.galaxyParticles).toBeGreaterThan(QUALITY.high.galaxyParticles)
    expect(QUALITY.ultra.universeParticles).toBeGreaterThan(QUALITY.high.universeParticles)
    expect(QUALITY.ultra.planetFace).toBeGreaterThan(QUALITY.high.planetFace)
    expect(QUALITY.ultra.maxDpr).toBe(2)
  })

  it('drops film grain on low', () => {
    expect(QUALITY.low.grain).toBe(0)
    expect(QUALITY.high.grain).toBeGreaterThan(0)
  })
})

describe('defaultsToHd', () => {
  it('opens computers in HD, and phones and software rendering in the guessed tier', () => {
    expect(defaultsToHd(gpu('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), desktop)).toBe(true)
    expect(defaultsToHd(gpu('NVIDIA GeForce RTX 3060'), desktop)).toBe(true)
    expect(defaultsToHd(gpu('Apple GPU'), { touch: true })).toBe(false)
    expect(defaultsToHd(gpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))'), desktop)).toBe(false)
  })
})
