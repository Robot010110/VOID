/**
 * The trailer's music, live. It is composed in score.ts and rendered offline, once, into
 * score.mp3: the very music the videos carry. A visitor's machine only plays it back, so the
 * universe keeps every cycle it needs while the film runs; synthesised live, the score cost
 * more than real time on a laptop beside the universe, and stuttered. After a change to the
 * score, render it again (README, "The trailer").
 */
import { film } from './director.ts'
import scoreUrl from './score.mp3?url'

let music: AudioBuffer | null = null
let loaded = false

/** Fetch and decode the music while the universe builds. Nothing that could sound exists yet. */
export async function loadScore(): Promise<void> {
  try {
    const data = await (await fetch(scoreUrl)).arrayBuffer()
    // An offline context decodes without asking to play, so the browser has nothing to warn of.
    music = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(data)
  } catch {
    // No music on this device: the film plays in silence, on its own clock.
  }
  loaded = true
}

export function scoreLoaded(): boolean {
  return loaded
}

/**
 * Start the music (inside the Play press); once it sounds, the film's clock follows it, so
 * every cut lands on its hit however the frames fall.
 */
export async function startScore(): Promise<void> {
  if (!music) return
  try {
    // A phone's silent switch would otherwise mute it: this is music the visitor asked for.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    const context = new AudioContext({ latencyHint: 'playback' })
    const source = new AudioBufferSourceNode(context, { buffer: music })
    source.connect(context.destination)
    await context.resume()
    const t0 = context.currentTime + 0.1
    source.start(t0)
    // The film keeps to what is heard, not what is sent: the output's own delay (a fifth of a
    // second, over Bluetooth) is taken off.
    const delay = () => context.outputLatency || context.baseLatency || 0
    film.clock = () => Math.max(0, context.currentTime - t0 - delay())
  } catch {
    // No audio on this device: the film plays in silence, on its own clock.
  }
}

/** The music rendered offline, as a base64 WAV, for making the video (and score.mp3). */
export async function renderScore(): Promise<string> {
  const { renderScoreWav } = await import('./score.ts')
  return renderScoreWav()
}
