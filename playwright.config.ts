import { defineConfig } from '@playwright/test'

const PORT = 5199

// `npm run shots` renders on the machine's GPU through ANGLE and falls back to SwiftShader
// (software) where there is none. `npm run shots:soft` (playwright.soft.config.ts) forces
// SwiftShader: identical pictures, roughly ten times slower once planets bake their maps.
const gpuArgs = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-unsafe-swiftshader',
  ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
]

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: { args: gpuArgs },
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
