/**
 * Renders the trailer (`?film`) frame by frame, for making it into a video: world time is held
 * and stepped one frame at a time, every place is built before the first frame, and each frame
 * is captured as the page shows it, words and all. Then the music is rendered offline.
 *
 *   SIZE=540x960 (vertical, 1080x1920 out) or 960x540 (landscape, 1920x1080 out)
 *   DSF=2        pixel density: the page is laid out at SIZE, frames are SIZE times DSF
 *   FPS=30       frames a second
 *   OUT=film-render/<name>    where frames/00000.jpg ... and score.wav are written
 *   AT=3.5,8     only stills at these film seconds, for a quick look
 *   FRAMES=0-935     only these frames again (the film still runs from its start to reach them).
 *                    Splice them in only at a cut: some of the sky eases by frame time, not film
 *                    time, so no two renders are quite the same picture mid-shot.
 *   SCORE=1      also render the music
 *
 * Then, with ffmpeg:
 *   ffmpeg -framerate 30 -i OUT/frames/%05d.jpg -i OUT/score.wav
 *     -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 16
 *     -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 256k -shortest
 *     -movflags +faststart void.mp4
 * (The frames are JPEGs, BT.601; converting and tagging BT.709 keeps the colours on every player.)
 */
import { test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

type Hooks = {
  hold(on: boolean): void
  advance(frames: number): void
  pending(): number
  film: { start(): void; state(): { t: number; waiting: boolean; ended: boolean; path: number[] }; ready(): boolean; score(): Promise<string> }
}
type W = Window & { __VOID__: Hooks }

test('film', async ({ browser }) => {
  test.setTimeout(6 * 60 * 60 * 1000)
  const [w, h] = (process.env.SIZE ?? '960x540').split('x').map(Number)
  const out = process.env.OUT ?? 'film-render/look'
  mkdirSync(`${out}/frames`, { recursive: true })
  // Laid out at a screen's size and drawn at twice its density: phone-sized words, full-size frames.
  const context = await browser.newContext({ viewport: { width: w!, height: h! }, deviceScaleFactor: Number(process.env.DSF ?? 2) })
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
  await page.goto(`/?film&shot=film&quality=${process.env.QUALITY ?? 'high'}`)
  await page.waitForFunction(() => (window as unknown as W).__VOID__?.film.ready(), null, { timeout: 600_000, polling: 250 })
  await page.evaluate(() => document.fonts.ready)
  console.log('every place ready')

  const state = () => page.evaluate(() => (window as unknown as W).__VOID__.film.state())
  // Let world time move by `frames` frames once the film is not waiting for a place.
  const step = async (frames: number) => {
    for (;;) {
      const s = await state()
      if (!s.waiting) break
      await page.waitForTimeout(60)
    }
    await page.evaluate((n) => (window as unknown as W).__VOID__.advance(n), frames)
    await page.waitForFunction(() => (window as unknown as W).__VOID__.pending() === 0, null, { polling: 'raf' })
  }

  await page.evaluate(() => {
    const v = (window as unknown as W).__VOID__
    v.hold(true)
    v.film.start()
  })

  const perFrame = 60 / Number(process.env.FPS ?? 30)
  const stills = process.env.AT ? process.env.AT.split(',').map(Number) : null
  const t0 = Date.now()
  if (stills) {
    for (const at of stills) {
      for (let s = await state(); s.t < at - 1e-6 && !s.ended; s = await state()) {
        const left = Math.ceil((at - s.t) * 60)
        await step(Math.min(left, 30))
      }
      // A couple of frames drawn at this moment, for the overlay and post to catch up.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      await page.screenshot({ path: `${out}/at-${at.toFixed(2)}.png` })
      console.log(`still ${at}  (${(await state()).path.join('.')})  ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }
  } else {
    // FRAMES=from-to takes only that stretch again; the film still runs from its start to reach it.
    const [from, to] = (process.env.FRAMES ?? '0-').split('-').map((v) => (v === '' ? Infinity : Number(v))) as [number, number]
    let frame = 0
    for (let s = await state(); !s.ended && frame <= to; s = await state()) {
      if (frame >= from) {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        await page.screenshot({ path: `${out}/frames/${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 })
      }
      frame++
      if (frame % 60 === 0) console.log(`frame ${frame}  t=${s.t.toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(0)} s`)
      await step(perFrame)
    }
    console.log(`${frame} frames`)
  }

  if (process.env.SCORE) {
    const wav = await page.evaluate(() => (window as unknown as W).__VOID__.film.score())
    writeFileSync(`${out}/score.wav`, Buffer.from(wav, 'base64'))
    console.log('score written')
  }
  await context.close()
})
