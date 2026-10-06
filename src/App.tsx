import { lazy, Suspense } from 'react'
import { DEBUG } from './core/env.ts'
import { Experience } from './scene/Experience.tsx'

const DebugPanel = DEBUG ? lazy(() => import('./debug/DebugPanel.tsx')) : null

export default function App() {
  return (
    <main className="void">
      <h1 className="visually-hidden">VOID</h1>
      <p className="visually-hidden">
        An interactive universe. Drag or use the arrow keys to look around the night sky.
      </p>
      <Experience />
      {DebugPanel && (
        <Suspense fallback={null}>
          <DebugPanel />
        </Suspense>
      )}
    </main>
  )
}
