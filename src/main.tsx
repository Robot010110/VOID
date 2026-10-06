import '@fontsource-variable/fraunces/full.css'
import '@fontsource/hanken-grotesk/300.css'
import '@fontsource/hanken-grotesk/400.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { PINNED_QUALITY, PLANET, SYSTEM, WORLD } from './core/env.ts'
import { getGalaxy } from './core/galaxy.ts'
import { isPlanetKind } from './core/planets.ts'
import { guessTier, probeGpu, readDeviceHints } from './core/quality.ts'
import { useVoid } from './core/store.ts'
import { getSystem, HOME, levelOf, type Path } from './core/universe.ts'

/** Where the page opens: the home galaxy, or a system (`?system=`) or world (`?world=`) in it. */
function openingPath(): Path {
  const galaxy = HOME[0]!
  const index = (value: string | null) => (value === null ? -1 : Number.parseInt(value, 10))
  const star = index(SYSTEM)
  const world = index(WORLD)
  const system = star >= 0 && star < getGalaxy(galaxy).stars.length ? star : world >= 0 ? HOME[1]! : -1
  if (system < 0) return [galaxy]
  const worlds = getSystem(galaxy, system).planets.length
  return world >= 0 && world < worlds ? [galaxy, system, world] : [galaxy, system]
}

const path = openingPath()

useVoid.setState({
  quality: PINNED_QUALITY ?? guessTier(probeGpu(), readDeviceHints()),
  qualityLocked: PINNED_QUALITY !== null,
  planet: isPlanetKind(PLANET) ? PLANET : 'terrestrial',
  path,
  level: levelOf(path),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
