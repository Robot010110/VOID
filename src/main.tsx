import '@fontsource-variable/fraunces/full.css'
import '@fontsource/hanken-grotesk/300.css'
import '@fontsource/hanken-grotesk/400.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { anchorById } from './content/anchors.ts'
import { getUniverse } from './core/cosmos.ts'
import { ANCHOR, GALAXY, HOLE, INTRO, LEVEL, PINNED_QUALITY, PLANET, prefersReducedMotion, SHOT, SPECTRUM, SYSTEM, TIME, WORLD } from './core/env.ts'
import { getGalaxy } from './core/galaxy.ts'
import { isPlanetKind } from './core/planets.ts'
import { guessTier, probeGpu, readDeviceHints } from './core/quality.ts'
import { SPECTRA, TIME_STEPS, useVoid, type Spectrum, type TimeStep } from './core/store.ts'
import { getSystem, HOME, levelOf, type Path } from './core/universe.ts'
import { planOpening, type OpeningMode } from './intro/opening.ts'
import { greetConsole } from './secrets/console.ts'

// Tone.js greets the console when it loads; VOID's console is kept for other things.
;(window as Window & { TONE_SILENCE_LOGGING?: boolean }).TONE_SILENCE_LOGGING = true

/**
 * Where the page opens: the universe; or the black hole (`?hole`), one of the handcrafted
 * worlds (`?anchor=`), a galaxy (`?galaxy=`), or a system (`?system=`) or world (`?world=`) in
 * that galaxy (the home galaxy by default).
 */
function openingPath(): Path {
  const universe = getUniverse()
  if (HOLE) return [universe.hole.index]
  const anchor = ANCHOR ? anchorById(ANCHOR) : undefined
  if (anchor) return [anchor.galaxy, anchor.star, anchor.world]
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

/**
 * How the visit opens: the full film from a sun out to the universe; a crossfade for a link to
 * somewhere in particular, or for a visitor who prefers reduced motion; nothing at all for the
 * screenshot script and the development views.
 */
function openingMode(linked: boolean): OpeningMode {
  if (INTRO === 'skip' || LEVEL === 'sky' || isPlanetKind(PLANET)) return 'none'
  if (SHOT && INTRO === null) return 'none'
  return linked || prefersReducedMotion() ? 'fade' : 'film'
}

const linkedPath = openingPath()
const mode = openingMode(linkedPath.length > 0)
const path = planOpening(mode, linkedPath)

useVoid.setState({
  quality: PINNED_QUALITY ?? guessTier(probeGpu(), readDeviceHints()),
  qualityLocked: PINNED_QUALITY !== null,
  planet: isPlanetKind(PLANET) ? PLANET : 'terrestrial',
  path,
  level: levelOf(path),
  intro: mode === 'none' ? 'done' : 'loading',
  spectrum: SPECTRA.includes(SPECTRUM as Spectrum) ? (SPECTRUM as Spectrum) : 'visible',
  timeStep: TIME_STEPS.includes(Number(TIME) as TimeStep) && TIME !== null ? (Number(TIME) as TimeStep) : 1,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// For whoever opens the console: a riddle (see secrets/console.ts).
greetConsole()
