import { Leva, useControls } from 'leva'
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useVoid } from '../core/store.ts'
import {
  getTweakFolders,
  subscribeTweaks,
  type TweakFolder,
  type TweakValue,
} from '../core/tweaks.ts'
import { perf } from './perf.ts'

const THEME = {
  colors: {
    elevation1: '#0b0c16',
    elevation2: '#10111d',
    elevation3: '#1b1830',
    accent1: '#6fd3e0',
    accent2: '#5bb8c4',
    accent3: '#8fe0ea',
    highlight1: '#8a8478',
    highlight2: '#c9c1b3',
    highlight3: '#f4ebdd',
    vivid1: '#ffb36b',
  },
  fonts: {
    mono: "'Hanken Grotesk', system-ui, sans-serif",
    sans: "'Hanken Grotesk', system-ui, sans-serif",
  },
}

function FolderControls({ folder }: { folder: TweakFolder }) {
  const schema = useMemo(() => {
    const entries = Object.entries(folder.schema).map(([key, tweak]) => [
      key,
      { ...tweak, onChange: (value: TweakValue) => folder.apply(key, value) },
    ])
    return Object.fromEntries(entries) as never
  }, [folder])
  useControls(folder.id, schema, [schema])
  return null
}

/** A small live readout of frame rate and draw calls, written straight to the DOM. */
function PerfReadout() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!ref.current) return
      const { quality } = useVoid.getState()
      ref.current.textContent =
        `${perf.fps.toFixed(0)} fps (${perf.frameMs.toFixed(1)} ms)  ` +
        `${perf.calls} draws  ${(perf.points / 1000).toFixed(1)}k points  ` +
        `${(perf.triangles / 1000).toFixed(1)}k tris  dpr ${perf.pixelRatio.toFixed(2)}  ${quality}`
    }, 250)
    return () => window.clearInterval(id)
  }, [])
  return <div ref={ref} className="debug-readout" aria-hidden="true" />
}

/** Mounted only with ?debug, from a lazily loaded chunk, so leva never ships in the main bundle. */
export default function DebugPanel() {
  const folders = useSyncExternalStore(subscribeTweaks, getTweakFolders)
  return (
    <>
      <Leva theme={THEME} titleBar={{ title: 'Tuning', filter: false }} collapsed={false} />
      {folders.map((folder) => (
        <FolderControls key={folder.id} folder={folder} />
      ))}
      <PerfReadout />
    </>
  )
}
