/**
 * The trailer's music, composed from VOID's own sound: D Lydian, a drone under everything, FM
 * bells, a shimmering pad, falls swept through noise. Every sound is cued in film seconds and
 * scheduled on the audio clock.
 *
 * Composed here, it is rendered offline (`renderScoreWav`, through the render tool) into the
 * videos and into score.mp3, which `?film` plays: a visitor's machine only plays the music back.
 *
 * Its shape follows the film (script.ts): a heartbeat in the dark; a bloom as the dark lifts and
 * a long rise under the pull-back, a bell for each count; a soft pulse at 100 beats a minute
 * under the falls; the people's chord and a bell for each line; a hit on each cut of what the
 * eye sees by; a glide for gravity, ticks for time, a run of bells for the constellation; the
 * black hole's rumble and two last heartbeats; silence; the stars gathering; the last chord.
 */
import {
  Chorus,
  Compressor,
  FatOscillator,
  Filter,
  FMSynth,
  Gain,
  LFO,
  Limiter,
  MembraneSynth,
  Noise,
  NoiseSynth,
  Oscillator,
  PolySynth,
  Reverb,
  Synth,
  Volume,
} from 'tone/build/esm/classes.js'
import { Offline } from 'tone/build/esm/core/context/Offline.js'
import { D1, D2, D3, frequency, scaleNote } from '../audio/notes.ts'
import { FILM_LENGTH } from './script.ts'

const db = (decibels: number) => 10 ** (decibels / 20)
/** A note of D Lydian, by degree from D3 (or another D). */
const note = (degree: number, base = D3) => frequency(scaleNote(degree, base))
const notes = (degrees: readonly number[], base = D3) => degrees.map((d) => note(d, base))

/** One beat at 100 beats a minute. */
const BEAT = 0.6

/** Build the instruments and schedule the whole score, from the audio clock's zero. */
async function compose(): Promise<void> {

  // The space: one bus into a gentle compressor and a limiter, and a long reverb beside it.
  const master = new Volume(0).toDestination()
  const limiter = new Limiter(-1).connect(master)
  const compressor = new Compressor({ threshold: -20, ratio: 3, attack: 0.02, release: 0.3, knee: 10 }).connect(limiter)
  const duck = new Gain(1).connect(compressor)
  const reverb = new Reverb({ decay: 7, preDelay: 0.04, wet: 1 })
  await reverb.generate()
  reverb.connect(duck)
  // A cue's moment on the audio clock: film seconds, as the music starts with the film.
  const at = (seconds: number) => seconds
  const send = (node: { connect: (destination: Gain) => unknown }, dry: number, wet: number) => {
    node.connect(new Gain(dry).connect(duck))
    node.connect(new Gain(wet).connect(reverb))
  }

  // The drone: D2 twice, a few cents apart, and A2, through a slowly wandering low-pass.
  const droneTone = new Filter({ type: 'lowpass', frequency: 520, rolloff: -24, Q: 0.7 })
  const drone = new Gain(0)
  droneTone.connect(drone)
  send(drone, db(-7), db(-9))
  new LFO({ frequency: 0.06, min: 260, max: 760 }).connect(droneTone.frequency).start(at(0))
  for (const [midi, detune, level] of [
    [D2, -7, -13],
    [D2, 7, -13],
    [D2 + 7, 3, -19],
  ] as const) {
    new FatOscillator({ frequency: frequency(midi), type: 'sawtooth', count: 2, spread: 10, detune, volume: level }).connect(droneTone).start(at(0))
  }
  const droneLevel: Array<[number, number]> = [
    [0, 0],
    [2.6, 0.45],
    [3.3, 0.9],
    [14.6, 1],
    [17.6, 0.55],
    [25.8, 0.8],
    [31.1, 0.55],
    [39.2, 1],
    [42.85, 1],
    [43.05, 0],
    [45.6, 0],
    [46.4, 0.85],
    [49.4, 0.6],
    [FILM_LENGTH + 1, 0],
  ]
  drone.gain.setValueAtTime(0, at(0))
  for (const [time, level] of droneLevel.slice(1)) drone.gain.linearRampToValueAtTime(level, at(time))
  // Into the black hole, the drone's light goes.
  droneTone.frequency.setValueAtTime(520, at(39.1))

  // The sub: D1 and its octave, swelling at the universe, the black hole and the end.
  const sub = new Gain(0)
  send(sub, db(-6), db(-18))
  new Oscillator({ frequency: frequency(D1), type: 'sine', volume: -8 }).connect(sub).start(at(0))
  new Oscillator({ frequency: frequency(D1 + 12), type: 'sine', volume: -11 }).connect(sub).start(at(0))
  for (const [time, level] of [
    [0, 0],
    [3.0, 0],
    [3.6, 0.7],
    [10.5, 0.5],
    [14.6, 0.9],
    [17.4, 0.4],
    [25.8, 0.2],
    [39.2, 1],
    [42.85, 1],
    [43.05, 0],
    [45.8, 0],
    [46.3, 0.9],
    [FILM_LENGTH + 1, 0],
  ] as const)
    sub.gain.linearRampToValueAtTime(level, at(time))

  // The heartbeat, and the deeper hits on the cuts.
  const heart = new MembraneSynth({ pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.002, decay: 0.45, sustain: 0, release: 0.2 }, volume: -6 })
  send(heart, db(-2), db(-14))
  const boom = new MembraneSynth({ pitchDecay: 0.12, octaves: 6, envelope: { attack: 0.003, decay: 1.6, sustain: 0, release: 0.6 }, volume: -5 })
  send(boom, db(-2), db(-8))
  for (const [time, velocity] of [
    [0.6, 0.9],
    [0.86, 0.55],
    [1.8, 0.9],
    [2.06, 0.55],
    [40.2, 0.8],
    [40.46, 0.5],
    [41.3, 0.85],
    [41.56, 0.5],
  ] as const)
    heart.triggerAttackRelease(frequency(D1 + 5), 0.3, at(time), velocity)
  for (const [time, velocity] of [
    [3.0, 1],
    [17.45, 0.8],
    [31.2, 0.85],
    [39.2, 1],
    [46.0, 1],
  ] as const)
    boom.triggerAttackRelease(frequency(D1), 1.4, at(time), velocity)

  // Noise, shaped: rises before what is revealed, falls with every fall.
  const noise = new Noise('white').start(at(0))
  const riseTone = new Filter({ type: 'bandpass', frequency: 300, Q: 1.3 })
  const rise = new Gain(0)
  noise.connect(riseTone)
  riseTone.connect(rise)
  send(rise, db(-10), db(-4))
  const riseUp = (from: number, to: number, peak: number, lowHz: number, highHz: number) => {
    riseTone.frequency.setValueAtTime(lowHz, at(from))
    riseTone.frequency.exponentialRampToValueAtTime(highHz, at(to))
    rise.gain.setValueAtTime(0, at(from))
    rise.gain.linearRampToValueAtTime(peak, at(to - 0.05))
    rise.gain.linearRampToValueAtTime(0, at(to + 0.08))
  }
  riseUp(1.9, 3.0, 0.07, 400, 2600)
  riseUp(4.0, 14.2, 0.11, 160, 3800)
  riseUp(43.7, 46.0, 0.16, 260, 6200)
  const fallTone = new Filter({ type: 'bandpass', frequency: 2000, Q: 1.1 })
  const fall = new Gain(0)
  noise.connect(fallTone)
  fallTone.connect(fall)
  send(fall, db(-8), db(-6))
  const fallDown = (from: number, seconds: number, peak: number) => {
    fallTone.frequency.setValueAtTime(2600, at(from))
    fallTone.frequency.exponentialRampToValueAtTime(170, at(from + seconds))
    fall.gain.setValueAtTime(0, at(from))
    fall.gain.linearRampToValueAtTime(peak, at(from + seconds * 0.45))
    fall.gain.linearRampToValueAtTime(0, at(from + seconds + 0.5))
  }
  fallDown(17.6, 2.6, 0.16)
  fallDown(20.95, 2.2, 0.14)
  fallDown(23.6, 1.9, 0.13)
  fallDown(41.95, 1.0, 0.2)

  // The black hole's rumble: dark noise, very low.
  const rumbleTone = new Filter({ type: 'lowpass', frequency: 90, rolloff: -24 })
  const rumble = new Gain(0)
  new Noise('brown').connect(rumbleTone).start(at(0))
  rumbleTone.connect(rumble)
  send(rumble, db(4), db(-12))
  rumble.gain.setValueAtTime(0, at(39.1))
  rumble.gain.linearRampToValueAtTime(0.9, at(39.4))
  rumble.gain.linearRampToValueAtTime(1.3, at(42.7))
  rumble.gain.linearRampToValueAtTime(0, at(42.95))

  // Bells: soft FM bells, as stars ring when touched.
  const bells = new PolySynth(FMSynth, {
    harmonicity: 3,
    modulationIndex: 6,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.004, decay: 1.8, sustain: 0, release: 3.4 },
    modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0, release: 1.6 },
    volume: -15,
  })
  bells.maxPolyphony = 16
  send(bells, db(-6), db(-1))
  const ring = (time: number, degrees: readonly number[], velocity = 0.5, base = D3) =>
    bells.triggerAttackRelease(notes(degrees, base), 0.05, at(time), velocity)
  ring(3.0, [7, 11, 14, 18], 0.55)
  ring(4.5, [9, 16], 0.4)
  ring(7.6, [11, 18], 0.4)
  ring(11.15, [14, 21], 0.42)
  ring(14.9, [16], 0.35)
  ring(15.65, [18], 0.35)
  ring(26.3, [11], 0.32)
  ring(27.4, [9], 0.3)
  ring(28.5, [7], 0.3)
  ring(31.2, [7, 11, 14, 16], 0.5)
  ring(33.6, [14, 18], 0.32)
  ;[7, 9, 11, 13, 14, 16, 18].forEach((degree, i) => ring(37.15 + i * 0.27, [degree], 0.38))
  ring(46.0, [0, 4, 7, 11, 14], 0.55, D2)
  ring(47.8, [21], 0.3)

  // The pad: slow sines in chorus, like voices far off.
  const chorus = new Chorus({ frequency: 0.25, delayTime: 4.5, depth: 0.7, spread: 160, wet: 0.6 }).start(at(0))
  const pad = new PolySynth(Synth, {
    oscillator: { type: 'fatsine', count: 3, spread: 18 },
    envelope: { attack: 1.4, decay: 2, sustain: 0.8, release: 3.6 },
    volume: -24,
  })
  pad.maxPolyphony = 16
  pad.connect(chorus)
  send(chorus, db(-6), db(0))
  const hold = (from: number, to: number, degrees: readonly number[], velocity = 0.6, base = D3) => {
    const chord = notes(degrees, base)
    pad.triggerAttack(chord, at(from), velocity)
    pad.triggerRelease(chord, at(to))
  }
  hold(3.0, 13.6, [0, 4, 8, 9])
  hold(14.4, 17.5, [14, 16, 18, 20], 0.5)
  hold(25.9, 31.0, [0, 4, 8, 13], 0.55)
  hold(46.0, FILM_LENGTH - 0.8, [0, 4, 7, 9, 11, 13], 0.75, D2)

  // The fall's pulse: a soft kick on the beat, a breath of noise off it, a bass walking under.
  const kick = new MembraneSynth({ pitchDecay: 0.04, octaves: 4, envelope: { attack: 0.002, decay: 0.26, sustain: 0, release: 0.1 }, volume: -6 })
  send(kick, db(-2), db(-20))
  const air = new NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 }, volume: -30 })
  const airTone = new Filter({ type: 'highpass', frequency: 7000 })
  air.connect(airTone)
  send(airTone, db(-4), db(-10))
  const bass = new Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.3 }, volume: -12 })
  send(bass, db(-2), db(-18))
  const walk = [0, 0, -3, 0, -2, 0, -3, 0] as const
  for (let beat = 0; 17.45 + beat * BEAT < 25.5; beat++) {
    const time = 17.45 + beat * BEAT
    kick.triggerAttackRelease(frequency(D1), 0.2, at(time), beat % 4 === 0 ? 0.9 : 0.6)
    air.triggerAttackRelease(0.04, at(time + BEAT / 2), 0.5)
    bass.triggerAttackRelease(note(walk[beat % walk.length]!, D2), BEAT * 0.8, at(time), 0.7)
  }

  // What the eye sees by: a growl for heat, blips and crackle for radio.
  const growlTone = new Filter({ type: 'lowpass', frequency: 420, rolloff: -24 })
  const growl = new Gain(0)
  growlTone.connect(growl)
  send(growl, db(-6), db(-10))
  for (const midi of [D2, D2 + 7]) new FatOscillator({ frequency: frequency(midi), type: 'sawtooth', count: 3, spread: 30, volume: -12 }).connect(growlTone).start(at(0))
  growl.gain.setValueAtTime(0, at(31.98))
  growl.gain.linearRampToValueAtTime(0.9, at(32.04))
  growl.gain.linearRampToValueAtTime(0, at(32.75))
  const blip = new Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.05 }, volume: -16 })
  send(blip, db(-4), db(-6))
  blip.triggerAttackRelease(note(21), 0.05, at(32.8), 0.7)
  blip.triggerAttackRelease(note(18), 0.05, at(32.95), 0.6)
  blip.triggerAttackRelease(note(21), 0.05, at(33.25), 0.5)
  const crackle = new NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.1 }, volume: -22 })
  const crackleTone = new Filter({ type: 'bandpass', frequency: 3200, Q: 2 })
  crackle.connect(crackleTone)
  send(crackleTone, db(-4), db(-8))
  crackle.triggerAttackRelease(0.5, at(32.8), 0.8)

  // Gravity: a low glide, as if the floor tilted.
  const glide = new Oscillator({ frequency: 73, type: 'sine', volume: -10 })
  const glideLevel = new Gain(0)
  glide.connect(glideLevel)
  send(glideLevel, db(-2), db(-12))
  glide.start(at(0))
  glide.frequency.setValueAtTime(73, at(33.7))
  glide.frequency.exponentialRampToValueAtTime(41, at(35.2))
  glideLevel.gain.setValueAtTime(0, at(33.7))
  glideLevel.gain.linearRampToValueAtTime(0.8, at(34.0))
  glideLevel.gain.linearRampToValueAtTime(0, at(35.35))

  // Time: ticks, quickening.
  const tick = new NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 }, volume: -24 })
  const tickTone = new Filter({ type: 'bandpass', frequency: 2400, Q: 3 })
  tick.connect(tickTone)
  send(tickTone, db(-2), db(-12))
  for (let time = 35.45, gap = 0.26; time < 36.95; time += gap, gap = Math.max(0.035, gap * 0.8)) tick.triggerAttackRelease(0.02, at(time), 0.7)

  // The silence before the name.
  duck.gain.setValueAtTime(1, at(42.85))
  duck.gain.linearRampToValueAtTime(0, at(43.05))
  duck.gain.setValueAtTime(0, at(43.5))
  duck.gain.linearRampToValueAtTime(1, at(43.7))
  master.volume.setValueAtTime(0, at(FILM_LENGTH - 1.4))
  master.volume.linearRampToValueAtTime(-40, at(FILM_LENGTH + 0.4))
}

/** The film's music as a 16-bit stereo WAV, base64, rendered offline (for the video). */
export async function renderScoreWav(): Promise<string> {
  const rate = 48000
  const buffer = await Offline(async () => {
    await compose()
  }, FILM_LENGTH + 0.5, 2, rate)
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)]
  const frames = channels[0]!.length
  const bytes = new DataView(new ArrayBuffer(44 + frames * 4))
  const text = (offset: number, value: string) => [...value].forEach((c, i) => bytes.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  bytes.setUint32(4, 36 + frames * 4, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  bytes.setUint32(16, 16, true)
  bytes.setUint16(20, 1, true)
  bytes.setUint16(22, 2, true)
  bytes.setUint32(24, rate, true)
  bytes.setUint32(28, rate * 4, true)
  bytes.setUint16(32, 4, true)
  bytes.setUint16(34, 16, true)
  text(36, 'data')
  bytes.setUint32(40, frames * 4, true)
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < 2; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i]!))
      bytes.setInt16(44 + i * 4 + c * 2, Math.round(sample * 32767), true)
    }
  }
  let binary = ''
  const raw = new Uint8Array(bytes.buffer)
  for (let i = 0; i < raw.length; i += 0x8000) binary += String.fromCharCode(...raw.subarray(i, i + 0x8000))
  return btoa(binary)
}

