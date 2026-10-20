import { defineConfig } from '@playwright/test'
import base from '../../playwright.config.ts'

/** `npm run audio:cost`: the sound engine's cost, rendered offline (see cost.spec.ts). */
export default defineConfig({
  ...base,
  testDir: '.',
  timeout: 30 * 60 * 1000,
  reporter: 'list',
})
