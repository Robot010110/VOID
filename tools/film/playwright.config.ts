import { defineConfig } from '@playwright/test'
import base from '../../playwright.config.ts'

/** `npm run film:render`: the trailer, frame by frame (see render.spec.ts). */
export default defineConfig({
  ...base,
  testDir: '.',
  timeout: 6 * 60 * 60 * 1000,
  reporter: 'list',
})
