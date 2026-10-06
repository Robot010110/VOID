/**
 * Global state. React re-renders are for structure only: anything that changes per frame
 * lives in refs and uniforms, and components that need to react to a value without
 * re-rendering use `useVoid.subscribe(selector, listener)`.
 */
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { PlanetKind } from './planets.ts'
import type { QualityTier } from './quality.ts'

export interface VoidState {
  quality: QualityTier
  /** True when pinned by ?quality or after the governor has settled. */
  qualityLocked: boolean
  /** The preset shown at the planet level. */
  planet: PlanetKind
  setQuality: (quality: QualityTier) => void
  lockQuality: () => void
  setPlanet: (planet: PlanetKind) => void
}

export const useVoid = create<VoidState>()(
  subscribeWithSelector((set) => ({
    quality: 'high',
    qualityLocked: false,
    planet: 'terrestrial',
    setQuality: (quality) => set({ quality }),
    lockQuality: () => set({ qualityLocked: true }),
    setPlanet: (planet) => set({ planet }),
  })),
)
