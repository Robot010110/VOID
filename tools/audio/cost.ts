/**
 * Loaded in the browser by cost.spec.ts: the sound engine's whole graph, built inside Tone's
 * Offline() and held at one level while a visitor would linger there, ringing two bursts of
 * notes. The render is timed against the music it makes.
 */
import { Offline } from 'tone/build/esm/classes.js'
import { scaleNote } from '../../src/audio/notes.ts'

type Level = 'universe' | 'galaxy' | 'system' | 'planet' | 'hole'
type NoteKind = 'star' | 'world' | 'galaxy'

interface Engine {
  readonly ready: Promise<void>
  setLevel(level: Level): void
  setPlace(wind: number, hum: 'warm'): void
  bloom(): void
  note(kind: NoteKind, midi: number): void
}

export interface Cost {
  level: Level
  seconds: number
  /** Time spent rendering, in seconds. */
  render: number
  /** Loudness after the first three seconds' crossfade, dBFS. */
  rms: number
  peak: number
}

export async function cost(level: Level, seconds = 30): Promise<Cost> {
  const engineModule = '/src/audio/engine.ts'
  const { Engine } = (await import(/* @vite-ignore */ engineModule)) as { Engine: new () => Engine }
  const kind: NoteKind = level === 'galaxy' ? 'star' : level === 'system' ? 'world' : 'galaxy'
  let render = 0
  const buffer = await Offline(async (context) => {
    const engine = new Engine()
    await engine.ready
    engine.setLevel(level)
    if (level === 'planet') engine.setPlace(0.7, 'warm')
    engine.bloom()
    // Ten notes a fifth of a second apart, up the scale and then down: a quick sweep over stars.
    for (let i = 0; i < 10; i++) {
      context.setTimeout(() => engine.note(kind, scaleNote(i * 2)), 5 + i * 0.2)
      context.setTimeout(() => engine.note(kind, scaleNote(20 - i * 2)), 15 + i * 0.2)
    }
    const raw = context.rawContext as unknown as { startRendering(): Promise<AudioBuffer> }
    const start = raw.startRendering.bind(raw)
    raw.startRendering = async () => {
      const began = performance.now()
      const rendered = await start()
      render = (performance.now() - began) / 1000
      return rendered
    }
  }, seconds)
  let sum = 0
  let peak = 0
  const from = Math.floor(3 * buffer.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = from; i < data.length; i++) {
      sum += data[i]! ** 2
      peak = Math.max(peak, Math.abs(data[i]!))
    }
  }
  const decibels = (value: number) => 20 * Math.log10(Math.max(value, 1e-9))
  return { level, seconds, render, rms: decibels(Math.sqrt(sum / (buffer.numberOfChannels * (buffer.length - from)))), peak: decibels(peak) }
}
