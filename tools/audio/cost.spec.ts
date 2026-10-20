/**
 * What the sound engine costs to compute: `npm run audio:cost`. Each level is rendered offline
 * for 30 s with two bursts of hover notes (cost.ts), and the render time printed against the
 * music's length. Near or above 1x, the audio thread has no room left beside the universe.
 *
 *   LEVELS=universe,galaxy,system,planet,hole   the levels to render
 *   ROUNDS=3                                    rounds, interleaved (a laptop's speed drifts)
 *
 * Run it on a quiet machine. Numbers from the UHD 620 laptop are in DECISIONS.md.
 */
import { test } from '@playwright/test'
import type { Cost } from './cost.ts'

test('audio cost', async ({ page }) => {
  test.setTimeout(30 * 60 * 1000)
  const problems: string[] = []
  page.on('console', (message) => {
    // The blank page has no dev-server client to keep, so its hot-reload socket may not connect.
    if (/\[vite\]|WebSocket|your current setup|<--|vite\.dev/.test(message.text())) return
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  // A blank page from the dev server, so the engine's modules load and nothing else runs.
  await page.route('**/audio-cost', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Audio cost</title>' }))
  const levels = (process.env.LEVELS ?? 'universe,galaxy,system,planet,hole').split(',')
  for (let round = 0; round < Number(process.env.ROUNDS ?? 3); round++) {
    for (const level of levels) {
      await page.goto('/audio-cost')
      const result = await page.evaluate(async (level) => {
        const module = '/tools/audio/cost.ts'
        const { cost } = (await import(/* @vite-ignore */ module)) as { cost(level: string): Promise<Cost> }
        return cost(level)
      }, level)
      console.log(
        `${result.level.padEnd(9)} ${(result.render / result.seconds).toFixed(2)}x real time (${result.render.toFixed(1)} s for ${result.seconds} s)  ` +
          `rms ${result.rms.toFixed(1)} dBFS, peak ${result.peak.toFixed(1)} dBFS`,
      )
    }
  }
  if (problems.length) console.log(problems.join('\n'))
})
