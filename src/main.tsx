import '@fontsource-variable/fraunces/full.css'
import '@fontsource/hanken-grotesk/300.css'
import '@fontsource/hanken-grotesk/400.css'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { PINNED_QUALITY } from './core/env.ts'
import { guessTier, probeGpu, readDeviceHints } from './core/quality.ts'
import { useVoid } from './core/store.ts'

useVoid.setState({
  quality: PINNED_QUALITY ?? guessTier(probeGpu(), readDeviceHints()),
  qualityLocked: PINNED_QUALITY !== null,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
