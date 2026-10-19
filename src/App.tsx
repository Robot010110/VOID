import { lazy, Suspense, useCallback, useState } from 'react'
import { AudioDirector } from './audio/AudioDirector.tsx'
import { DEBUG, LEVEL, PLANET } from './core/env.ts'
import { readFlag } from './core/persist.ts'
import { isPlanetKind } from './core/planets.ts'
import { useVoid } from './core/store.ts'
import { opening } from './intro/opening.ts'
import { Experience } from './scene/Experience.tsx'
import { Hint } from './ui/Hint.tsx'
import { CompanionWords } from './ui/CompanionWords.tsx'
import { Hud } from './ui/Hud.tsx'
import { Intro } from './ui/Intro.tsx'
import { SecretCounter } from './ui/SecretCounter.tsx'
import { SecretScreen } from './ui/SecretScreen.tsx'
import { Shortcuts } from './ui/Shortcuts.tsx'
import { Terminal } from './ui/Terminal.tsx'

const DebugPanel = DEBUG ? lazy(() => import('./debug/DebugPanel.tsx')) : null

/**
 * The page: the canvas, the opening over it, and once the opening is over, the interface.
 * On a first visit the one hint VOID ever gives comes before the interface does.
 */
export default function App() {
  const opened = useVoid((s) => s.intro === 'done')
  // Only a visitor who has seen the opening is shown the hint after it.
  const [hinted, setHinted] = useState(() => opening.mode === 'none' || readFlag('hint', false))
  const hintDone = useCallback(() => setHinted(true), [])
  const devView = LEVEL === 'sky' || isPlanetKind(PLANET)
  return (
    <main className="void">
      <h1 className="visually-hidden">VOID</h1>
      <p className="visually-hidden">
        An interactive universe. Drag or use the arrow keys to look around, Tab to choose a
        galaxy, a star or a world and Enter to fall into it, Escape to rise back out. M turns the
        sound on and off, T changes how fast time runs, S what the eye sees by (visible light,
        infrared, radio), and D lets VOID drift through its stories on its own. In a galaxy, hold
        Shift and choose stars to join them into a constellation.
      </p>
      <Experience />
      {!devView && <SecretScreen />}
      {!devView && opened && hinted && <Hud />}
      {!devView && opened && <CompanionWords />}
      {!devView && opened && <SecretCounter />}
      {!devView && opened && <Shortcuts />}
      {!devView && opened && !hinted && <Hint onDone={hintDone} />}
      {!devView && <Terminal />}
      <Intro />
      <AudioDirector />
      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </main>
  )
}
