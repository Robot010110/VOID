import { lazy, Suspense } from 'react'
import { DEBUG, LEVEL, PLANET } from './core/env.ts'
import { isPlanetKind } from './core/planets.ts'
import { Experience } from './scene/Experience.tsx'
import { Hud } from './ui/Hud.tsx'

const DebugPanel = DEBUG ? lazy(() => import('./debug/DebugPanel.tsx')) : null

export default function App() {
  return (
    <main className="void">
      <h1 className="visually-hidden">VOID</h1>
      <p className="visually-hidden">
        An interactive universe. Drag or use the arrow keys to look around, Tab to choose a
        star or a world and Enter to fall into it, Escape to rise back out.
      </p>
      <Experience />
      {LEVEL !== 'sky' && !isPlanetKind(PLANET) && <Hud />}
      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </main>
  )
}
