import { defineConfig } from '@playwright/test'

const PORT = 5199

// Headless Chromium has no GPU here, so WebGL runs on SwiftShader (software). Set VOID_GPU=1
// to try the machine's real GPU through ANGLE instead.
const gpuArgs =
  process.env.VOID_GPU === '1'
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  timeout: 240_000,
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
