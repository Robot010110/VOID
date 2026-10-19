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
  /** Fall into the child with this index (or the black hole) and wait until it settles. */
  descend?: number | 'hole'
  /** Where that fall arrives (by default a world of the home system). */
  arrive?: number[]
  /**
   * A moment of the opening: while it loads, the title, a frame of the film after Enter (on
   * the frame clock), or the first-visit hint once it has ended.
   */
  intro?: 'loading' | 'title' | number | 'hint'
  /** localStorage to start from (a visitor's constellations). */
  storage?: Record<string, string>
  /** Hold the pointer down here for a moment (gravity touch) before the picture. */
  hold?: { x: number; y: number }
  /** A touch screen. */
  touch?: boolean
}

/** A visitor's constellation in the home galaxy, as stored. */
const KITE = JSON.stringify([{ id: 'kite', galaxy: 0, stars: [0, 1, 2, 5, 0], name: 'The Kite', made: 1_760_000_000_000 }])

const PLANET = 'shot=planet&quality=high'
const SYSTEM = 'shot=system&quality=high&system=0'
const GALAXY = 'shot=galaxy&quality=high&galaxy=0'
const UNIVERSE = 'shot=universe&quality=high'
const HOLE = 'shot=hole&quality=high&hole'
const ANCHOR = 'shot=planet&quality=high&anchor'
const PHONE = { viewport: { width: 390, height: 844 }, scale: 2 }
const OPENING = 'shot=opening&intro&quality=high'

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
  { name: '2-system-phone', query: 'shot=system&quality=medium&system=0', ...PHONE },
  { name: '2-arrival-phone', query: 'shot=system&quality=medium&system=0', descend: 3, ...PHONE },
  // Phase 3: the galaxy from every side, a star to visit, and the fall into its system.
  { name: '3-galaxy-home', query: GALAXY },
  { name: '3-galaxy-top', query: `${GALAXY}&view=top` },
  { name: '3-galaxy-edge', query: `${GALAXY}&view=edge` },
  { name: '3-galaxy-core', query: `${GALAXY}&view=core` },
  { name: '3-galaxy-nebula', query: `${GALAXY}&view=nebula` },
  { name: '3-galaxy-hover', query: GALAXY, hover: 0 },
  { name: '3-arrival', query: GALAXY, descend: 0, arrive: [0, 0] },
  { name: '3-galaxy-low', query: 'shot=galaxy&quality=low&galaxy=0' },
  { name: '3-galaxy-phone', query: 'shot=galaxy&quality=medium&galaxy=0', ...PHONE },
  // Phase 4: the universe, its kinds of galaxy, the black hole, and the falls into them.
  { name: '4-universe-home', query: UNIVERSE },
  { name: '4-universe-top', query: `${UNIVERSE}&view=top` },
  { name: '4-universe-cluster', query: `${UNIVERSE}&view=cluster` },
  { name: '4-universe-local', query: `${UNIVERSE}&view=local` },
  { name: '4-universe-nebula', query: `${UNIVERSE}&view=nebula` },
  { name: '4-universe-hover', query: UNIVERSE, hover: 0 },
  { name: '4-arrival-galaxy', query: UNIVERSE, descend: 0, arrive: [0] },
  { name: '4-elliptical', query: 'shot=galaxy&quality=high&galaxy=1' },
  { name: '4-irregular', query: 'shot=galaxy&quality=high&galaxy=8' },
  { name: '4-spiral', query: 'shot=galaxy&quality=high&galaxy=15' },
  { name: '4-hole', query: HOLE },
  { name: '4-hole-close', query: `${HOLE}&view=close` },
  { name: '4-hole-edge', query: `${HOLE}&view=edge` },
  { name: '4-hole-top', query: `${HOLE}&view=top` },
  { name: '4-arrival-hole', query: UNIVERSE, descend: 'hole' },
  { name: '4-universe-low', query: 'shot=universe&quality=low' },
  { name: '4-universe-phone', query: 'shot=universe&quality=medium', ...PHONE },
  { name: '4-hole-phone', query: 'shot=hole&quality=medium&hole', ...PHONE },
  // Phase 5: peoples in every state, what they built, and the fragments of the handcrafted worlds.
  { name: '5-home-fragment', query: `${ANCHOR}=ithasal&view=home` },
  { name: '5-ring-night', query: `${ANCHOR}=driram&view=night` },
  { name: '5-ring-day', query: `${ANCHOR}=driram&view=day` },
  { name: '5-ring-close', query: `${ANCHOR}=driram&view=close` },
  { name: '5-fading-night', query: `${ANCHOR}=kandolu&view=night` },
  { name: '5-cloud-cities', query: `${ANCHOR}=ernae&view=night` },
  { name: '5-ruins-close', query: `${ANCHOR}=sisaeth&view=close` },
  { name: '5-derelict-ring', query: `${ANCHOR}=laelien&view=terminator` },
  { name: '5-lattice', query: `${ANCHOR}=evith&view=day` },
  { name: '5-arc-sky', query: `${ANCHOR}=kothor&view=home` },
  { name: '5-arc-system', query: 'shot=system&quality=high&galaxy=1&system=63' },
  { name: '5-arrival-story', query: 'shot=system&quality=high&system=11', descend: 0, arrive: [0, 11, 0] },
  { name: '5-fragment-phone', query: 'shot=planet&quality=medium&anchor=sivar&view=home', ...PHONE },
  // Phase 6: the opening, from the point of light to the universe.
  { name: '6-loading', query: OPENING, intro: 'loading' },
  { name: '6-title', query: OPENING, intro: 'title' },
  { name: '6-letting-go', query: OPENING, intro: 20 },
  { name: '6-eclipse', query: OPENING, intro: 110 },
  { name: '6-pull-back-system', query: OPENING, intro: 200 },
  { name: '6-pull-back-galaxy', query: OPENING, intro: 380 },
  { name: '6-pull-back-universe', query: OPENING, intro: 560 },
  { name: '6-hint', query: OPENING, intro: 'hint' },
  { name: '6-title-phone', query: 'shot=opening&intro&quality=medium', intro: 'title', ...PHONE },
  { name: '6-eclipse-phone', query: 'shot=opening&intro&quality=medium', intro: 110, ...PHONE },
  { name: '6-linked', query: 'shot=opening&intro&quality=high&anchor=driram&view=night', intro: 'hint' },
  // Phase 7: seeing by heat and by radio at every scale, a constellation, gravity touch.
  { name: '7-universe-infrared', query: `${UNIVERSE}&spectrum=infrared` },
  { name: '7-universe-radio', query: `${UNIVERSE}&spectrum=radio` },
  { name: '7-galaxy-infrared', query: `${GALAXY}&spectrum=infrared` },
  { name: '7-galaxy-radio', query: `${GALAXY}&spectrum=radio` },
  { name: '7-system-infrared', query: `${SYSTEM}&spectrum=infrared` },
  { name: '7-system-radio', query: `${SYSTEM}&spectrum=radio` },
  { name: '7-world-infrared', query: `${ANCHOR}=ithasal&view=night&spectrum=infrared` },
  { name: '7-world-radio', query: `${ANCHOR}=ithasal&view=night&spectrum=radio` },
  { name: '7-hole-radio', query: `${HOLE}&spectrum=radio` },
  { name: '7-constellation', query: GALAXY, storage: { 'void.constellations': KITE } },
  { name: '7-gravity-galaxy', query: GALAXY, hold: { x: 640, y: 470 } },
  { name: '7-gravity-universe', query: UNIVERSE, hold: { x: 900, y: 420 } },
  { name: '7-controls-phone', query: 'shot=galaxy&quality=medium&galaxy=0', storage: { 'void.constellations': KITE }, touch: true, ...PHONE },
]

interface Hooks {
  locate(index: number): { x: number; y: number } | null
  descend(index: number): void
  hole(): number
  state(): { path: number[]; phase: string }
  hold(on: boolean): void
  advance(frames: number): void
  pending(): number
  enter(): void
  intro(): { stage: string }
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

const stage = (page: Page) => page.evaluate(() => (window as unknown as HookedWindow).__VOID__.intro().stage)

/** Bring the opening to the moment a shot shows. */
async function opening(page: Page, moment: NonNullable<Shot['intro']>) {
  if (moment === 'loading') {
    await page.waitForFunction(() => document.querySelector('.intro-point') !== null)
    await page.waitForTimeout(900)
    return
  }
  await expect.poll(() => stage(page), { timeout: 240_000, intervals: [250] }).toBe('title')
  if (moment === 'title') {
    // The wordmark, the line and Enter have come up.
    await page.waitForTimeout(4500)
    return
  }
  if (moment === 'hint') {
    await page.evaluate(() => (window as unknown as HookedWindow).__VOID__.enter())
    await expect.poll(() => stage(page), { timeout: 120_000, intervals: [250] }).toBe('done')
    await page.waitForTimeout(2600)
    return
  }
  await page.evaluate(() => {
    const hooks = (window as unknown as HookedWindow).__VOID__
    hooks.hold(true)
    hooks.enter()
  })
  await page.evaluate((n) => (window as unknown as HookedWindow).__VOID__.advance(n), moment)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HookedWindow).__VOID__.pending()), { timeout: 120_000, intervals: [100] })
    .toBe(0)
  await frames(page, 3)
}

for (const shot of SHOTS) {
  test(shot.name, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: shot.viewport ?? { width: 1600, height: 900 },
      deviceScaleFactor: shot.scale ?? 1,
      hasTouch: shot.touch ?? false,
      isMobile: shot.touch ?? false,
    })
    const page = await context.newPage()
    if (shot.storage) {
      await page.addInitScript((entries) => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
      }, shot.storage)
    }
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        problems.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

    await page.goto(`/?${shot.query}`)
    if (shot.intro !== undefined) {
      await opening(page, shot.intro)
      await page.screenshot({ path: `screenshots/${shot.name}.png` })
      await context.close()
      expect(problems).toEqual([])
      return
    }
    await page.waitForSelector('html[data-void-ready="true"]', { timeout: 240_000 })
    await frames(page, 12)

    if (shot.hover !== undefined) {
      const spot = await page.evaluate((i) => (window as unknown as HookedWindow).__VOID__.locate(i), shot.hover)
      expect(spot).not.toBeNull()
      await page.mouse.move(spot!.x, spot!.y)
      await frames(page, 30)
    }

    if (shot.hold) {
      await page.mouse.move(shot.hold.x, shot.hold.y)
      await page.mouse.down()
      await frames(page, 90)
      await page.screenshot({ path: `screenshots/${shot.name}.png` })
      await page.mouse.up()
      await context.close()
      expect(problems).toEqual([])
      return
    }

    if (shot.descend !== undefined) {
      const index =
        shot.descend === 'hole' ? await page.evaluate(() => (window as unknown as HookedWindow).__VOID__.hole()) : shot.descend
      await page.evaluate((i) => (window as unknown as HookedWindow).__VOID__.descend(i), index)
      await expect
        .poll(() => page.evaluate(() => (window as unknown as HookedWindow).__VOID__.state()), {
          timeout: 120_000,
          intervals: [250],
        })
        .toMatchObject({ phase: 'idle', path: shot.arrive ?? (shot.descend === 'hole' ? [index] : [0, 0, index]) })
      // Let the caption fade in, and the sky settle after the fall.
      await frames(page, 150)
    }

    await page.screenshot({ path: `screenshots/${shot.name}.png` })
    await context.close()

    expect(problems).toEqual([])
  })
}
