/**
 * `npm run shots`: loads each scale level in headless Chromium, waits for real frames, and
 * saves a screenshot to /screenshots for visual review. Any console error or warning fails
 * the run, so the shots double as a smoke test. Some shots hover a world or fly into one
 * first, through the hooks VOID exposes on screenshot runs (src/scene/testHooks.ts).
 */
import { expect, test, type Page } from '@playwright/test'

interface Shot {
  name: string
  query: string
  viewport?: { width: number; height: number }
  scale?: number
  /** Hover the world with this index before the picture. */
  hover?: number
  /** Fall into the world with this index and wait until the camera has settled. */
  descend?: number
}

const PLANET = 'shot=planet&quality=high'
const SYSTEM = 'shot=system&quality=high'
const PHONE = { viewport: { width: 390, height: 844 }, scale: 2 }

const SHOTS: Shot[] = [
  // Phase 0: the night sky alone.
  { name: '0-sky-home', query: 'shot=sky&level=sky&quality=high&view=home' },
  // Phase 1: the planet showroom, the terrestrial world from every side...
  { name: '1-terrestrial-home', query: `${PLANET}&planet=terrestrial&view=home` },
  { name: '1-terrestrial-day', query: `${PLANET}&planet=terrestrial&view=day` },
  { name: '1-terrestrial-terminator', query: `${PLANET}&planet=terrestrial&view=terminator` },
  { name: '1-terrestrial-night', query: `${PLANET}&planet=terrestrial&view=night` },
  { name: '1-terrestrial-close', query: `${PLANET}&planet=terrestrial&view=close` },
  // ...and every other planet type.
  { name: '1-ocean-day', query: `${PLANET}&planet=ocean&view=day` },
  { name: '1-desert-day', query: `${PLANET}&planet=desert&view=day` },
  { name: '1-ice-day', query: `${PLANET}&planet=ice&view=day` },
  { name: '1-lava-terminator', query: `${PLANET}&planet=lava&view=terminator` },
  { name: '1-toxic-day', query: `${PLANET}&planet=toxic&view=day` },
  { name: '1-barren-terminator', query: `${PLANET}&planet=barren&view=terminator` },
  { name: '1-gas-day', query: `${PLANET}&planet=gas&view=day` },
  { name: '1-ringed-home', query: `${PLANET}&planet=ringed&view=home` },
  { name: '1-ice-giant-terminator', query: `${PLANET}&planet=ice-giant&view=terminator` },
  { name: '1-terrestrial-phone', query: 'shot=planet&quality=medium&planet=terrestrial&view=home', ...PHONE },
  // Phase 2: the home system, its star, and a fall into one of its worlds.
  { name: '2-system-home', query: SYSTEM },
  { name: '2-system-hover', query: SYSTEM, hover: 6 },
  { name: '2-star-close', query: `${SYSTEM}&view=star` },
  { name: '2-arrival', query: SYSTEM, descend: 3 },
  { name: '2-ringed-world', query: `${PLANET}&world=6&view=home` },
  { name: '2-gas-world', query: `${PLANET}&world=4&view=day` },
  { name: '2-system-phone', query: 'shot=system&quality=medium', ...PHONE },
  { name: '2-arrival-phone', query: 'shot=system&quality=medium', descend: 3, ...PHONE },
]

interface Hooks {
  locate(index: number): { x: number; y: number } | null
  descend(index: number): void
  state(): { path: number[]; phase: string }
}

type HookedWindow = Window & { __VOID__: Hooks }

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

    if (shot.hover !== undefined) {
      const spot = await page.evaluate((i) => (window as unknown as HookedWindow).__VOID__.locate(i), shot.hover)
      expect(spot).not.toBeNull()
      await page.mouse.move(spot!.x, spot!.y)
      await frames(page, 30)
    }

    if (shot.descend !== undefined) {
      await page.evaluate((i) => (window as unknown as HookedWindow).__VOID__.descend(i), shot.descend)
      await expect
        .poll(() => page.evaluate(() => (window as unknown as HookedWindow).__VOID__.state()), {
          timeout: 120_000,
          intervals: [250],
        })
        .toMatchObject({ phase: 'idle', path: [0, 0, shot.descend] })
      // Let the caption fade in.
      await frames(page, 120)
    }

    await page.screenshot({ path: `screenshots/${shot.name}.png` })
    await context.close()

    expect(problems).toEqual([])
  })
}
