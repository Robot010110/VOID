/**
 * What VOID's sound is made of: oscillators, slow LFOs, filters, a chorus, a reverb, and the
 * voices that ring when something is touched, all built from the browser's own audio nodes.
 *
 * Each piece sounds as the Tone.js class it stands in for (Oscillator, FatOscillator, LFO,
 * Filter, Chorus, Reverb, and a PolySynth's FMSynth and Synth voices): the same waves, phases,
 * detunings, levels and envelopes, so the sound is unchanged to within rounding. What changes
 * is the cost. Tone feeds every frequency, detune and level through a signal that runs at audio
 * rate, so one Tone oscillator is a handful of nodes and one LFO about a dozen; and a PolySynth
 * keeps every voice it has made running long after it falls silent. Here a steady value is a
 * plain value, and a note's nodes exist only while it sounds. (DECISIONS.md, "After the build:
 * the cost of the sound", has the measurements.)
 *
 * Every node is made through Tone's context, so it connects to Tone's nodes as before.
 */
import { Param, type BaseContext } from 'tone/build/esm/classes.js'

type Context = BaseContext
export type Wave = 'sine' | 'triangle' | 'sawtooth'

export const db = (decibels: number) => 10 ** (decibels / 20)

const waves = new WeakMap<Context, Map<string, PeriodicWave>>()

/**
 * Tone starts an oscillator part-way through its cycle by drawing it as a periodic wave of 2048
 * partials, each turned by the phase. This draws the same wave (and keeps it for reuse).
 */
function turnedWave(context: Context, type: Wave, degrees: number): PeriodicWave {
  let cache = waves.get(context)
  if (!cache) waves.set(context, (cache = new Map()))
  const key = `${type} ${degrees}`
  const kept = cache.get(key)
  if (kept) return kept
  const phase = (degrees * Math.PI) / 180
  const real = new Float32Array(2048)
  const imag = new Float32Array(2048)
  for (let n = 1; n < 2048; n++) {
    const factor = 2 / (n * Math.PI)
    let b = 0
    if (type === 'sine') b = n === 1 ? 1 : 0
    else if (type === 'sawtooth') b = factor * (n & 1 ? 1 : -1)
    else if (n & 1) b = 2 * factor * factor * (((n - 1) >> 1) & 1 ? -1 : 1)
    if (b !== 0) {
      real[n] = -b * Math.sin(phase * n)
      imag[n] = b * Math.cos(phase * n)
    }
  }
  const wave = context.createPeriodicWave(real, imag)
  cache.set(key, wave)
  return wave
}

export interface OscillatorShape {
  frequency: number
  type?: Wave
  /** Cents. */
  detune?: number
  /** Where in its cycle the wave starts, in degrees. */
  phase?: number
}

/** An oscillator as Tone makes one. Not yet started. */
export function oscillator(context: Context, { frequency, type = 'sine', detune = 0, phase = 0 }: OscillatorShape): OscillatorNode {
  const node = context.createOscillator()
  if (phase === 0) node.type = type
  else node.setPeriodicWave(turnedWave(context, type, phase))
  node.frequency.value = frequency
  node.detune.value = detune
  return node
}

/** A gain node at a level in decibels, as Tone's Volume. */
export function level(context: Context, decibels: number): GainNode {
  const node = context.createGain()
  node.gain.value = db(decibels)
  return node
}

/**
 * Tone's FatOscillator: `count` copies of one wave, detuned evenly across `spread` cents and
 * begun evenly through the cycle, each 6 dB down and 1.1 dB more for every copy. Not started.
 */
export function fatOscillator(
  context: Context,
  shape: { frequency: number; type: Wave; count: number; spread: number; volume: number },
): { oscillators: OscillatorNode[]; output: GainNode } {
  const { frequency, type, count, spread, volume } = shape
  const output = level(context, -6 - count * 1.1 + volume)
  const oscillators = Array.from({ length: count }, (_, i) => {
    const node = oscillator(context, { frequency, type, phase: (i / count) * 360 })
    // Tone sets each copy's detune as it makes them, at its "now" (a look-ahead from the
    // context's time), which is when they start; Chrome takes a change at an oscillator's very
    // start a moment late. Set the same way, the copies begin beating where Tone's did.
    if (count > 1) node.detune.setValueAtTime(-spread / 2 + (spread / (count - 1)) * i, context.currentTime + context.lookAhead)
    node.connect(output)
    return node
  })
  return { oscillators, output }
}

/**
 * Tone's LFO: a sine, begun at `phase` degrees, swinging each target between `min` and `max`.
 * Tone zeroes the target and has the LFO supply all of it; here the target rests at the middle
 * and the sine adds the swing, which is the same sum. Returns the sine, to start.
 */
export function lfo(context: Context, shape: { frequency: number; min: number; max: number; phase?: number }, ...targets: AudioParam[]): OscillatorNode {
  const { frequency, min, max, phase = 0 } = shape
  const sine = oscillator(context, { frequency, phase })
  const swing = context.createGain()
  swing.gain.value = (max - min) / 2
  sine.connect(swing)
  for (const target of targets) {
    target.value = (min + max) / 2
    swing.connect(target)
  }
  return sine
}

/** Tone's Filter: identical biquads in series, one for every 12 dB an octave of rolloff. */
export function filter(
  context: Context,
  shape: { type: BiquadFilterType; frequency: number; Q?: number; rolloff?: -12 | -24 },
): { input: AudioNode; output: AudioNode; frequency: AudioParam[] } {
  const { type, frequency, Q = 1, rolloff = -12 } = shape
  const stages = Array.from({ length: rolloff === -24 ? 2 : 1 }, () => {
    const node = context.createBiquadFilter()
    node.type = type
    node.frequency.value = frequency
    node.Q.value = Q
    return node
  })
  for (let i = 1; i < stages.length; i++) stages[i - 1]!.connect(stages[i]!)
  return { input: stages[0]!, output: stages.at(-1)!, frequency: stages.map((stage) => stage.frequency) }
}

/**
 * Tone's Chorus: the sound split left and right, each side through a delay that a slow sine
 * sweeps `depth` of the way either side of `delayTime` milliseconds (the sides `spread` degrees
 * apart in their cycles), then mixed with the dry sound at equal power, `wet` of the way over.
 * Tone's feedback loop is kept, though at a gain of 0 it carries nothing: it keeps the delays in
 * a cycle, as they were, and the specification has a delay in a cycle hold a render quantum or
 * more. Returns the two sines, to start.
 */
export function chorus(
  context: Context,
  shape: { frequency: number; delayTime: number; depth: number; spread: number; wet: number },
): { input: GainNode; output: GainNode; sweeps: OscillatorNode[] } {
  const input = context.createGain()
  input.channelCount = 2
  input.channelCountMode = 'explicit'
  const split = context.createChannelSplitter(2)
  const merge = context.createChannelMerger(2)
  input.connect(split)
  const middle = shape.delayTime / 1000
  const deviation = middle * shape.depth
  const sweeps = [90 - shape.spread / 2, 90 + shape.spread / 2].map((phase, side) => {
    const delay = context.createDelay(1)
    split.connect(delay, side)
    delay.connect(merge, 0, side)
    return lfo(context, { frequency: shape.frequency, min: Math.max(middle - deviation, 0), max: middle + deviation, phase }, delay.delayTime)
  })
  const feedbackSplit = context.createChannelSplitter(2)
  const feedbackMerge = context.createChannelMerger(2)
  merge.connect(feedbackSplit)
  for (const side of [0, 1]) {
    const feedback = context.createGain()
    feedback.gain.value = 0
    feedbackSplit.connect(feedback, side)
    feedback.connect(feedbackMerge, 0, side)
  }
  feedbackMerge.connect(split)
  const output = context.createGain()
  const dry = context.createGain()
  dry.gain.value = Math.cos((shape.wet * Math.PI) / 2)
  const wet = context.createGain()
  wet.gain.value = Math.sin((shape.wet * Math.PI) / 2)
  input.connect(dry).connect(output)
  merge.connect(wet).connect(output)
  return { input, output, sweeps }
}

/**
 * Tone's Reverb: stereo white noise falling away from its pre-delay as e^(-t/τ), convolved.
 * Tone takes τ = ln(decay + 1) / ln(200) and draws `decay` seconds of it: at a decay of 10 that
 * is τ = 0.45 s, a fall of 60 dB in 3.1 s. It draws the fall with setTargetAtTime, which Chrome
 * ends at ten time constants (e^-10, 87 dB down: 4.5 s here), so in Chrome the rest of the 10 s
 * was silence, convolved all the same. This draws the same fall, ends it where Chrome did, and
 * convolves less than half as much.
 *
 * The convolver scales a response by its average power over its whole length, so a shorter
 * response with the same energy comes out quieter by √(kept / full); the input is raised by as
 * much. `response()` draws the response, for the convolver's buffer; until then it is silent.
 */
export function reverb(context: Context, shape: { decay: number; preDelay: number }): { input: GainNode; output: ConvolverNode; response(): AudioBuffer } {
  const rate = context.sampleRate
  const timeConstant = Math.log(shape.decay + 1) / Math.log(200)
  const full = Math.floor((shape.decay + shape.preDelay) * rate)
  const kept = Math.min(full, Math.ceil((shape.preDelay + 10 * timeConstant) * rate))
  const input = context.createGain()
  input.channelCount = 2
  input.channelCountMode = 'explicit'
  input.gain.value = Math.sqrt(full / kept)
  const output = context.createConvolver()
  input.connect(output)
  const response = () => {
    const buffer = context.createBuffer(2, kept, rate)
    const start = shape.preDelay * rate
    const first = Math.ceil(start)
    // Half a million samples, so a quick generator (xorshift) inline and a running fall.
    let seed = (Math.random() * 2 ** 32) >>> 0 || 1
    const fall = Math.exp(-1 / rate / timeConstant)
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      let level = Math.exp(-(first - start) / rate / timeConstant)
      for (let i = first; i < kept; i++) {
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        const a = seed >>> 0
        seed ^= seed << 13
        seed ^= seed >>> 17
        seed ^= seed << 5
        // Tone's noise reaches each side as the average of two white channels.
        data[i] = ((a + (seed >>> 0)) / 2 ** 32 - 1) * level
        level *= fall
      }
    }
    return buffer
  }
  return { input, output, response }
}

export interface Envelope {
  attack: number
  decay: number
  sustain: number
  release: number
}

/** A gain node whose level is a Tone Param, so Tone's envelope arithmetic can drive it. */
function enveloped(context: Context): { node: GainNode; level: Param<'number'> } {
  const node = context.createGain()
  return { node, level: new Param({ context, param: node.gain, units: 'number', value: 0 }) }
}

/**
 * Tone's Envelope.triggerAttack (a linear attack, then an exponential fall to the sustain) and
 * triggerRelease (an exponential fall to silence), step for step, on a Param.
 */
function attack(level: Param<'number'>, time: number, velocity: number, shape: Envelope) {
  let rise = shape.attack
  const current = level.getValueAtTime(time)
  if (current > 0) rise = (1 - current) / (1 / shape.attack)
  if (rise < level.sampleTime) {
    level.cancelScheduledValues(time)
    level.setValueAtTime(velocity, time)
  } else level.linearRampTo(velocity, rise, time)
  if (shape.decay && shape.sustain < 1) level.exponentialApproachValueAtTime(velocity * shape.sustain, time + rise, shape.decay)
}

function release(level: Param<'number'>, time: number, release: number) {
  if (level.getValueAtTime(time) <= 0) return
  if (release < level.sampleTime) level.setValueAtTime(0, time)
  else level.targetRampTo(0, release, time)
}

/**
 * When Tone stops a voice's oscillator. With no sustain it stops it as the decay ends, and the
 * stop its release then asks for comes too late to count: the release is cut off there. With a
 * sustain the release runs its course.
 */
function silence(time: number, hold: number, shape: Envelope): number {
  return shape.sustain === 0 ? time + shape.attack + shape.decay : time + hold + shape.release
}

/** Tone's PolySynth held up to eight voices here; a note that found all eight busy was dropped. */
const POLYPHONY = 8

/** Voices for one instrument: when each sounding one ends, and where they all play into. */
abstract class Voices {
  readonly output: GainNode
  protected readonly context: Context
  private ends: number[] = []

  constructor(context: Context, decibels: number) {
    this.context = context
    this.output = level(context, decibels)
  }

  /**
   * A voice for a note at `time` that sounds until `end`, or none if all are busy. Tone frees a
   * voice once its sound has stopped, and chooses one as the note is handed over: at once, or a
   * look-ahead before it is due.
   */
  protected claim(time: number, end: number): boolean {
    const now = this.context.currentTime
    this.ends = this.ends.filter((busy) => busy > now)
    const chosen = Math.max(now, time - this.context.lookAhead)
    if (this.ends.filter((busy) => busy > chosen).length >= POLYPHONY) return false
    this.ends.push(end)
    return true
  }
}

export interface BellShape extends Envelope {
  harmonicity: number
  modulationIndex: number
}

/**
 * Tone's FMSynth, one voice a note: a sine carrier whose frequency a second sine (at
 * `harmonicity` times the note) swings by `modulationIndex` times the note, each sine with its
 * own envelope. Tone plays the carrier and the modulator 10 dB down; the carrier's share is in
 * the output level, and the modulator's in the depth its envelope swings to.
 */
export class Bells extends Voices {
  private readonly shape: BellShape

  constructor(context: Context, shape: BellShape, decibels: number) {
    super(context, decibels - 10)
    this.shape = shape
  }

  /** A note at `frequency` Hz, struck at `time` and let go after `hold` seconds. */
  ring(frequency: number, time: number, velocity: number, hold: number) {
    const { context, shape } = this
    const modulation = { attack: 0.002, decay: shape.decay * 0.35, sustain: 0, release: shape.release * 0.5 }
    const end = silence(time, hold, shape)
    if (!this.claim(time, end)) return
    const carrier = oscillator(context, { frequency })
    // Tone multiplies in single precision, as the audio graph does.
    const modulator = oscillator(context, { frequency: Math.fround(Math.fround(frequency) * Math.fround(shape.harmonicity)) })
    const amplitude = enveloped(context)
    const index = enveloped(context)
    modulator.connect(index.node).connect(carrier.frequency)
    carrier.connect(amplitude.node).connect(this.output)
    const depth = velocity * db(-10) * Math.fround(Math.fround(frequency) * Math.fround(shape.modulationIndex))
    attack(amplitude.level, time, velocity, shape)
    attack(index.level, time, depth, modulation)
    release(amplitude.level, time + hold, shape.release)
    release(index.level, time + hold, modulation.release)
    carrier.start(time)
    modulator.start(time)
    carrier.stop(end)
    modulator.stop(silence(time, hold, modulation))
    carrier.onended = () => {
      carrier.disconnect()
      modulator.disconnect()
      amplitude.node.disconnect()
      index.node.disconnect()
      amplitude.level.dispose()
      index.level.dispose()
    }
  }
}

/** Tone's Synth on a fat sine, one voice a note: two sines `spread` cents apart, half a cycle apart. */
export class Choir extends Voices {
  private readonly shape: Envelope & { spread: number }

  constructor(context: Context, shape: Envelope & { spread: number }, decibels: number) {
    super(context, decibels)
    this.shape = shape
  }

  sing(frequency: number, time: number, velocity: number, hold: number) {
    const { context, shape } = this
    const end = silence(time, hold, shape)
    if (!this.claim(time, end)) return
    const { oscillators, output } = fatOscillator(context, { frequency, type: 'sine', count: 2, spread: shape.spread, volume: 0 })
    const amplitude = enveloped(context)
    output.connect(amplitude.node).connect(this.output)
    attack(amplitude.level, time, velocity, shape)
    release(amplitude.level, time + hold, shape.release)
    for (const node of oscillators) {
      node.start(time)
      node.stop(end)
    }
    oscillators[0]!.onended = () => {
      for (const node of oscillators) node.disconnect()
      output.disconnect()
      amplitude.node.disconnect()
      amplitude.level.dispose()
    }
  }
}
