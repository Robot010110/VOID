/**
 * `npm run shots`: loads each scale level in headless Chromium, waits for real frames, and
 * saves a screenshot to /screenshots for visual review. Any console error or warning fails
 * the run, so the shots double as a smoke test.
 */
import { expect, test, type Page } from '@playwright/test'

interface Shot {
  name: string
  query: string
  viewport?: { width: number; height: number }
  scale?: number
}

const PLANET = 'shot=planet&quality=high'

const SHOTS: Shot[] = [
  // Phase 0: the night sky alone.
  { name: '0-sky-home', query: 'shot=sky&level=sky&quality=high&view=home' },
  // Phase 1: the terrestrial world from every side.
  { name: '1-terrestrial-home', query: `${PLANET}&view=home` },
  { name: '1-terrestrial-day', query: `${PLANET}&view=day` },
  { name: '1-terrestrial-terminator', query: `${PLANET}&view=terminator` },
  { name: '1-terrestrial-night', query: `${PLANET}&view=night` },
  { name: '1-terrestrial-close', query: `${PLANET}&view=close` },
  // Phase 1: every other planet type.
  { name: '1-ocean-day', query: `${PLANET}&planet=ocean&view=day` },
  { name: '1-desert-day', query: `${PLANET}&planet=desert&view=day` },
  { name: '1-ice-day', query: `${PLANET}&planet=ice&view=day` },
  { name: '1-lava-terminator', query: `${PLANET}&planet=lava&view=terminator` },
  { name: '1-toxic-day', query: `${PLANET}&planet=toxic&view=day` },
  { name: '1-barren-terminator', query: `${PLANET}&planet=barren&view=terminator` },
  { name: '1-gas-day', query: `${PLANET}&planet=gas&view=day` },
  { name: '1-ringed-home', query: `${PLANET}&planet=ringed&view=home` },
  { name: '1-ice-giant-terminator', query: `${PLANET}&planet=ice-giant&view=terminator` },
  // A phone held upright.
  {
    name: '1-terrestrial-phone',
    query: 'shot=planet&quality=medium&view=home',
    viewport: { width: 390, height: 844 },
    scale: 2,
  },
]

/** Resolve after the page has presented `count` more animation frames. */
async function frames(page: Page, count: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick))
        requestAnimationFrame(tick)
      }),
    count,
  )
}

for (const shot of SHOTS) {
  test(shot.name, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: shot.viewport ?? { width: 1600, height: 900 },
      deviceScaleFactor: shot.scale ?? 1,
    })
    const page = await context.newPage()
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        problems.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

    await page.goto(`/?${shot.query}`)
    await page.waitForSelector('html[data-void-ready="true"]', { timeout: 240_000 })
    await frames(page, 12)
    await page.screenshot({ path: `screenshots/${shot.name}.png` })
    await context.close()

    expect(problems).toEqual([])
  })
}
