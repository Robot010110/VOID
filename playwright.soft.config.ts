import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

/** The screenshot run on SwiftShader only: for machines whose GPU headless Chromium can't use. */
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
})
