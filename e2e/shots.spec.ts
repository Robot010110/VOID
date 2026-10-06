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

const SHOTS: Shot[] = [
  { name: '0-sky-home', query: 'shot=sky&quality=high&view=home' },
  { name: '0-sky-core', query: 'shot=sky&quality=high&view=core' },
  { name: '0-sky-pole', query: 'shot=sky&quality=high&view=pole' },
  { name: '0-sky-home-low', query: 'shot=sky&quality=low&view=home' },
  { name: '0-sky-phone', query: 'shot=sky&quality=medium&view=home', viewport: { width: 390, height: 844 }, scale: 2 },
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
    await page.waitForSelector('html[data-void-ready="true"]', { timeout: 180_000 })
    await frames(page, 12)
    await page.screenshot({ path: `screenshots/${shot.name}.png` })
    await context.close()

    expect(problems).toEqual([])
  })
}
