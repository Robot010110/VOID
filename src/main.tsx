import '@fontsource-variable/fraunces/full.css'
import '@fontsource/hanken-grotesk/300.css'
import '@fontsource/hanken-grotesk/400.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { getUniverse } from './core/cosmos.ts'
import { GALAXY, HOLE, PINNED_QUALITY, PLANET, SYSTEM, WORLD } from './core/env.ts'
import { getGalaxy } from './core/galaxy.ts'
import { isPlanetKind } from './core/planets.ts'
import { guessTier, probeGpu, readDeviceHints } from './core/quality.ts'
import { useVoid } from './core/store.ts'
import { getSystem, HOME, levelOf, type Path } from './core/universe.ts'

/**
 * Where the page opens: the universe; or the black hole (`?hole`), a galaxy (`?galaxy=`), or a
 * system (`?system=`) or world (`?world=`) in that galaxy (the home galaxy by default).
 */
function openingPath(): Path {
  const universe = getUniverse()
  if (HOLE) return [universe.hole.index]
  const index = (value: string | null) => (value === null ? -1 : Number.parseInt(value, 10))
  const requested = index(GALAXY)
  const star = index(SYSTEM)
  const world = index(WORLD)
  if (requested < 0 && star < 0 && world < 0) return []
  const galaxy = requested >= 0 && requested < universe.galaxies.length ? requested : HOME[0]!
  const first = galaxy === HOME[0] ? HOME[1]! : 0
  const system = star >= 0 && star < getGalaxy(galaxy).stars.length ? star : world >= 0 ? first : -1
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
