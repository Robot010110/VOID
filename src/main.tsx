import '@fontsource-variable/fraunces/full.css'
import '@fontsource/hanken-grotesk/300.css'
import '@fontsource/hanken-grotesk/400.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { PINNED_QUALITY, PLANET, WORLD } from './core/env.ts'
import { isPlanetKind } from './core/planets.ts'
import { guessTier, probeGpu, readDeviceHints } from './core/quality.ts'
import { useVoid } from './core/store.ts'
import { getSystem, HOME, levelOf } from './core/universe.ts'

const home = getSystem(HOME[0]!, HOME[1]!)
const world = WORLD === null ? -1 : Number.parseInt(WORLD, 10)
const path = world >= 0 && world < home.planets.length ? [...HOME, world] : HOME

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
