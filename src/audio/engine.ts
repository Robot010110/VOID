/**
 * The sound of VOID: a Web Audio graph made through Tone.js, self-contained, with no React and
 * no three.js.
 *
 * Everything plays through one bus into a gentle compressor, a limiter and the master volume,
 * and most of it also into a long reverb, the space everything hangs in. Under it all a drone
 * is always present; above it, one layer per scale level crossfades in as the visitor moves:
 * a near-subsonic swell for the universe, a shimmering pad like distant voices for a galaxy, a
 * warm chord with a slow pulse for a star system, wind (and, where a people live, their hum)
 * at a world. Touching a star rings a note from D Lydian; falling sweeps noise through a filter.
 *
 * The voices are the browser's own nodes (voices.ts), each sounding as the Tone.js class it
 * replaced; Tone still provides the context, the routing gains, the noise and the dynamics.
 *
 * Nothing here exists until `startEngine()`, which must be called from the Enter click: the
 * AudioContext is created inside that gesture, so the browser lets it play and never warns.
 * Tone is imported from its class modules, not its index, which would create a context as
 * soon as it loaded.
 */
import { Analyser, Compressor, connect, Context, Gain, Limiter, Noise, Param, Volume, type BaseContext, type InputNode } from 'tone/build/esm/classes.js'
import { getContext, setContext } from 'tone/build/esm/core/Global.js'
import { setLogger } from 'tone/build/esm/core/util/Debug.js'
import { D1, D2, D3, frequency, scaleNote } from './notes.ts'
import { registerEngine, type AudioEngine, type Hum, type NoteKind, type SoundLevel, type SoundState } from './sound.ts'
import { Bells, Choir, chorus, db, fatOscillator, filter, level, lfo, oscillator, reverb, type BellShape } from './voices.ts'

/** The master volume: moderate, with the compressor and limiter keeping peaks in hand. */
const MASTER_DB = -9
/** The first bloom of sound after Enter. */
const BLOOM = 4.5
const CROSSFADE = 2
const FADE_OUT = 0.5
const FADE_IN = 0.8
/** Notes closer together than this are skipped; a quick run plays softer. */
const NOTE_GAP = 0.09
/** How long a touched note is held before it is let go to ring on. */
const STRIKE = 0.05
/** How long a gate waits, once its fade has ended, before it lets what feeds it rest. */
const REST_AFTER = 0.25

type LayerName = 'universe' | 'galaxy' | 'system' | 'planet'

/**
 * A level that lets everything behind it rest while it is silent. Once it has faded out it is
 * disconnected, and the browser stops computing whatever only feeds it (oscillators, LFOs,
 * filters, the galaxy's chorus); it is joined up again just before it rises. Only one level's
 * layer is heard at a time, so the rest cost nothing. A slow LFO behind a gate picks up where it
 * stopped, not where it would have been, which no one can hear.
 */
class Gate {
  readonly node = new Gain(0)
  private readonly context: BaseContext
  private readonly into: InputNode[]
  private joined = false
  private timer = -1

  constructor(context: BaseContext, into: InputNode[]) {
    this.context = context
    this.into = into
  }

  /** Fade to `level` over `seconds`: joined up first, or let rest once silent. */
  fadeTo(level: number, seconds: number) {
    if (level > 0) this.open()
    else this.closeAfter(seconds)
    this.node.gain.rampTo(level, seconds)
  }

  open() {
    this.context.clearTimeout(this.timer)
    if (this.joined) return
    for (const node of this.into) this.node.connect(node)
    this.joined = true
  }

  /** Let it rest once the fade now under way, `seconds` long, has ended (by the audio clock). */
  closeAfter(seconds: number) {
    this.context.clearTimeout(this.timer)
    this.timer = this.context.setTimeout(() => {
      if (!this.joined) return
      for (const node of this.into) this.node.disconnect(node)
      this.joined = false
    }, seconds + REST_AFTER)
  }
}

export class Engine implements AudioEngine {
  /** Resolves once every voice is built (they are built a stage a frame). */
  readonly ready: Promise<void>
  private readonly context = getContext()
  private readonly fader = new Gain(0)
  /** Everything but the chime passes through this, which a fall into the black hole closes. */
  private readonly depth = new Gain(1)
  private readonly bus = new Gain(1)
  private readonly reverb = reverb(this.context, { decay: 10, preDelay: 0.08 })
  private readonly layers: Record<LayerName, Gate> = {
    universe: new Gate(this.context, this.sends(db(-4), db(-14))),
    galaxy: new Gate(this.context, this.sends(db(-7), db(2))),
    system: new Gate(this.context, this.sends(db(-1), db(-5))),
    planet: new Gate(this.context, this.sends(db(-4), db(-9))),
  }
  /** Lowers the drone's light at the black hole. */
  private readonly droneTone = filter(this.context, { type: 'lowpass', frequency: 2400 })
  private readonly droneCutoff = new Param({ context: this.context, param: this.droneTone.frequency[0]!, units: 'frequency', value: 2400 })
  /** The system's chord plays into this, which its pulse swells and ebbs. */
  private readonly systemPulse = this.context.createGain()
  private readonly pulse = lfo(this.context, { frequency: 0.2, min: 0.55, max: 1 }, this.systemPulse.gain)
  private readonly pulseRate = new Param({ context: this.context, param: this.pulse.frequency, units: 'frequency', value: 0.2 })
  private readonly wind = new Gate(this.context, [this.layers.planet.node])
  private readonly falter = new Gain(1).connect(this.layers.planet.node)
  private readonly hums: Record<Exclude<Hum, 'none'>, Gate> = {
    warm: new Gate(this.context, [this.layers.planet.node]),
    faltering: new Gate(this.context, [this.falter]),
    glass: new Gate(this.context, [this.layers.planet.node]),
  }
  private readonly fallFilter = filter(this.context, { type: 'bandpass', frequency: 400, Q: 1.1 })
  private readonly fallCutoff = new Param({ context: this.context, param: this.fallFilter.frequency[0]!, units: 'frequency', value: 400 })
  private readonly fall = new Gate(this.context, this.sends(db(-4), db(-6)))
  private bells: Record<NoteKind, Bells> | null = null
  private chimes: Bells | null = null
  private choir: Choir | null = null
  /** Dark noise, shared by the drone's floor and a world's wind. */
  private pink: Noise | null = null
  /** Taps the output, so loudness can be checked without ears (screenshot runs). */
  private readonly meter = new Analyser('waveform', 2048)
  private hum: Hum = 'none'
  private falterTimer = 0
  private lastNote = -Infinity
  private notes = 0
  private audible = false
  private sleepTimer = 0

  /**
   * The routing is made at once; the voices are built a stage a frame, in the order the opening
   * needs them (the drone and the space it rings in, the system it starts in, the sweep of its
   * pull-back, the galaxy and the universe it rises through), then a world's sounds and the
   * bells. Built all at once they held the page for half a second, just as the dark lifts.
   */
  constructor() {
    const volume = new Volume(MASTER_DB).toDestination()
    volume.connect(this.meter)
    const limiter = new Limiter(-1).connect(volume)
    const compressor = new Compressor({ threshold: -24, ratio: 3, attack: 0.08, release: 0.5, knee: 12 }).connect(limiter)
    this.fader.connect(compressor)
    this.depth.connect(this.fader)
    // Always stereo, as it was while the galaxy's chorus played into it: what the gates join up
    // and let rest must not change the channels the compressor sees.
    this.bus.channelCount = 2
    this.bus.channelCountMode = 'explicit'
    this.bus.connect(this.depth)
    connect(this.reverb.output, this.depth)

    this.route(this.droneTone.output, db(-6), db(-10))
    connect(this.systemPulse, this.layers.system.node)
    this.start(this.pulse)
    this.fallFilter.output.connect(this.fall.node.input)

    let response: AudioBuffer | null = null
    const stages = [
      () => this.drone(),
      () => (response = this.reverb.response()),
      // Chrome prepares a convolver as its buffer is set: most of a frame, so a frame of its own.
      () => (this.reverb.output.buffer = response),
      () => this.systemVoices(),
      () => new Noise('white').connect(this.fallFilter.input).start(),
      () => this.galaxyVoices(),
      () => this.universeVoices(),
      () => this.planetVoices(),
      () => this.buildBells(),
      () => this.buildSecrets(),
    ]
    this.ready = new Promise((resolve) => {
      const next = () => {
        stages.shift()?.()
        if (stages.length > 0) requestAnimationFrame(() => window.setTimeout(next, 0))
        else resolve()
      }
      next()
    })
  }

  /** The bus (dry) and the reverb (wet), each at its own level, for a voice to play into. */
  private sends(dry: number, wet: number): Gain[] {
    return [new Gain(dry).connect(this.bus), new Gain(wet).connect(this.reverb.input)]
  }

  /** Connect a voice to the bus and the reverb. */
  private route(node: AudioNode | Gain, dry: number, wet: number) {
    for (const send of this.sends(dry, wet)) connect(node, send)
  }

  /** Start sources as Tone starts its own, at the context's now(): a look-ahead from its time. */
  private start(...sources: AudioScheduledSourceNode[]) {
    const at = this.context.now()
    for (const source of sources) source.start(at)
  }

  /**
   * The drone: two oscillators a few cents apart on D2 and a quiet fifth above, through a
   * low-pass whose cutoff wanders over a minute; and under it, very quiet dark noise.
   */
  private drone() {
    const context = this.context
    const low = filter(context, { type: 'lowpass', frequency: 320, rolloff: -24, Q: 0.6 })
    low.output.connect(this.droneTone.input)
    const sources = [lfo(context, { frequency: 0.018, min: 180, max: 600 }, ...low.frequency)]
    for (const [midi, detune, volume] of [
      [D2, -7, -14],
      [D2, 7, -14],
      [D2 + 7, 4, -21],
    ] as const) {
      const source = oscillator(context, { frequency: frequency(midi), type: 'sawtooth', detune })
      source.connect(level(context, volume)).connect(low.input)
      sources.push(source)
    }
    this.start(...sources)
    this.pink = new Noise('pink').start()
    const hush = filter(context, { type: 'lowpass', frequency: 650, rolloff: -24 })
    this.pink.connect(hush.input)
    this.route(hush.output, db(-40), db(-36))
  }

  /** The universe: D1 and its octave, swelling and ebbing over half a minute. */
  private universeVoices() {
    const context = this.context
    const swell = context.createGain()
    connect(swell, this.layers.universe.node)
    const sources = [lfo(context, { frequency: 0.031, min: 0.25, max: 1 }, swell.gain)]
    for (const [midi, volume] of [
      [D1, -10],
      [D1 + 12, -11],
      [D1 + 19, -27],
    ] as const) {
      const source = oscillator(context, { frequency: frequency(midi) })
      source.connect(level(context, volume)).connect(swell)
      sources.push(source)
    }
    this.start(...sources)
  }

  /**
   * A galaxy: D major seventh with the raised fourth, high and thin, each voice swelling on its
   * own slow breath through a wide chorus, like voices far off.
   */
  private galaxyVoices() {
    const context = this.context
    const wide = chorus(context, { frequency: 0.22, delayTime: 4.5, depth: 0.8, spread: 180, wet: 0.7 })
    connect(wide.output, this.layers.galaxy.node)
    const sources = [...wide.sweeps]
    const breaths = [0.047, 0.061, 0.073, 0.089, 0.101]
    const notes = [scaleNote(14), scaleNote(16), scaleNote(17), scaleNote(18), scaleNote(20)]
    notes.forEach((midi, i) => {
      const breath = context.createGain()
      breath.connect(wide.input)
      sources.push(lfo(context, { frequency: breaths[i]!, min: 0.08, max: 1, phase: i * 77 }, breath.gain))
      const voice = fatOscillator(context, { frequency: frequency(midi), type: 'sine', count: 2, spread: 16, volume: -29 - i })
      voice.output.connect(breath)
      sources.push(...voice.oscillators)
    })
    this.start(...sources)
  }

  /** A system: a warm open chord (D3, A3, E4) that pulses with the nearest world's orbit. */
  private systemVoices() {
    const context = this.context
    const warm = filter(context, { type: 'lowpass', frequency: 1100, rolloff: -24, Q: 0.5 })
    warm.output.connect(this.systemPulse)
    const sources: OscillatorNode[] = []
    for (const [degree, volume] of [
      [0, -24],
      [4, -27],
      [8, -31],
    ] as const) {
      const voice = fatOscillator(context, { frequency: frequency(scaleNote(degree)), type: 'triangle', count: 2, spread: 12, volume })
      voice.output.connect(warm.input)
      sources.push(...voice.oscillators)
    }
    this.start(...sources)
  }

  /** A world: wind in its air, and the hum of its people, if they are there. */
  private planetVoices() {
    const context = this.context
    const band = filter(context, { type: 'bandpass', frequency: 520, Q: 0.9 })
    this.pink?.connect(band.input)
    const gust = context.createGain()
    band.output.connect(gust)
    connect(gust, this.wind.node)
    const sources = [
      lfo(context, { frequency: 0.067, min: 260, max: 950 }, ...band.frequency),
      lfo(context, { frequency: 0.113, min: 0.2, max: 1, phase: 90 }, gust.gain),
    ]

    // Warm: a low hum with a slow waver; a fading people's falters now and then.
    const hum = filter(context, { type: 'lowpass', frequency: 800 })
    connect(hum.output, this.hums.warm.node)
    connect(hum.output, this.hums.faltering.node)
    const hummed: OscillatorNode[] = []
    for (const [midi, volume] of [
      [D3, -24],
      [D3 + 7, -30],
      [D3 - 12, -27],
    ] as const) {
      const source = oscillator(context, { frequency: frequency(midi) })
      source.connect(level(context, volume)).connect(hum.input)
      hummed.push(source)
    }
    sources.push(lfo(context, { frequency: 0.19, min: -5, max: 5 }, ...hummed.map((source) => source.detune)), ...hummed)

    // Glass: a pure high fifth, breathing slowly, for a people who became light.
    const shimmer = context.createGain()
    connect(shimmer, this.hums.glass.node)
    sources.push(lfo(context, { frequency: 0.09, min: 0.3, max: 1 }, shimmer.gain))
    for (const [degree, volume] of [
      [18, -32],
      [22, -36],
    ] as const) {
      const source = oscillator(context, { frequency: frequency(scaleNote(degree)) })
      source.connect(level(context, volume)).connect(shimmer)
      sources.push(source)
    }
    this.start(...sources)
  }

  /** Notes: soft FM bells, each kind its own colour, all ringing on into the reverb. */
  private buildBells() {
    this.bells = {
      star: this.bell({ harmonicity: 3, modulationIndex: 7, decay: 1.8, release: 3.2 }, -16, db(-6), db(-2)),
      world: this.bell({ harmonicity: 2, modulationIndex: 3, decay: 1.3, release: 2.6 }, -18, db(-8), db(-3)),
      galaxy: this.bell({ harmonicity: 1.5, modulationIndex: 4, decay: 2.6, release: 4.5 }, -14, db(-6), db(-1)),
    }
  }

  /**
   * The chime for a secret found: its own bell, high and glassy, outside the depth gain so it is
   * heard even as the rest of the sound comes back. And the choir the old code wakes: soft sine
   * voices that swell and die away together.
   */
  private buildSecrets() {
    this.chimes = this.bell({ harmonicity: 4, modulationIndex: 2.2, decay: 2.4, release: 3.6 }, -19, db(-9), db(-4), this.fader)
    const choir = new Choir(this.context, { attack: 0.35, decay: 1.4, sustain: 0.55, release: 3.8, spread: 14 }, -27)
    this.route(choir.output, db(-8), db(0))
    this.choir = choir
  }

  /** A bell: struck at once, falling away over `decay`, ringing on for `release` once let go. */
  private bell(
    shape: Pick<BellShape, 'harmonicity' | 'modulationIndex' | 'decay' | 'release'>,
    volume: number,
    dry: number,
    wet: number,
    output?: Gain,
  ): Bells {
    const bells = new Bells(this.context, { ...shape, attack: 0.004, sustain: 0 }, volume)
    if (output) {
      connect(bells.output, new Gain(dry).connect(output))
      connect(bells.output, new Gain(wet).connect(this.reverb.input))
    } else this.route(bells.output, dry, wet)
    return bells
  }

  setLevel(level: SoundLevel) {
    const target = level === 'hole' ? 'universe' : level
    for (const [name, layer] of Object.entries(this.layers)) layer.fadeTo(name === target ? 1 : 0, CROSSFADE)
    this.droneCutoff.rampTo(level === 'hole' ? 260 : 2400, CROSSFADE * 1.5)
  }

  setPlace(wind: number, hum: Hum) {
    this.wind.fadeTo(Math.min(1, Math.max(0, wind)), CROSSFADE)
    this.hums.warm.fadeTo(hum === 'warm' ? 1 : 0, CROSSFADE)
    this.hums.faltering.fadeTo(hum === 'faltering' ? 1 : 0, CROSSFADE)
    this.hums.glass.fadeTo(hum === 'glass' ? 1 : 0, CROSSFADE)
    if (hum !== this.hum) {
      this.hum = hum
      this.scheduleFalter()
    }
  }

  /** A fading people's hum drops away at odd moments, like their lights. */
  private scheduleFalter() {
    window.clearTimeout(this.falterTimer)
    if (this.hum !== 'faltering') {
      this.falter.gain.rampTo(1, 0.3)
      return
    }
    const next = () => {
      const gain = this.falter.gain
      const now = this.context.currentTime
      const drop = 0.05 + Math.random() * 0.25
      const hold = 0.15 + Math.random() * 1.4
      gain.cancelScheduledValues(now)
      gain.setValueAtTime(gain.value, now)
      gain.linearRampToValueAtTime(drop, now + 0.06)
      gain.setValueAtTime(drop, now + 0.06 + hold)
      gain.linearRampToValueAtTime(1, now + 0.3 + hold)
      this.falterTimer = window.setTimeout(next, (2 + Math.random() * 6) * 1000)
    }
    this.falterTimer = window.setTimeout(next, 1500)
  }

  setPulse(hertz: number) {
    this.pulseRate.rampTo(hertz, 3)
  }

  note(kind: NoteKind, midi: number) {
    if (!this.audible) return
    const now = this.context.currentTime
    const gap = now - this.lastNote
    if (gap < NOTE_GAP) return
    this.lastNote = now
    const bell = this.bells?.[kind]
    if (!bell) return
    this.notes++
    const velocity = 0.5 * Math.min(1, Math.max(0.35, gap / 0.6))
    bell.ring(frequency(midi), now, velocity, STRIKE)
  }

  chime() {
    if (!this.audible || !this.chimes) return
    const now = this.context.currentTime
    this.chimes.ring(frequency(scaleNote(18)), now, 0.45, STRIKE)
    this.chimes.ring(frequency(scaleNote(22)), now + 0.17, 0.32, STRIKE)
  }

  chord(midis: readonly number[]) {
    if (!this.audible || !this.choir) return
    const now = this.context.currentTime
    // Rolled upwards a little, as hands would play it, and held while the stars brighten.
    midis.forEach((midi, i) => {
      const at = now + i * 0.035
      this.choir?.sing(frequency(midi), at, 0.42, 2.2)
      this.bells?.star.ring(frequency(midi), at, 0.18, STRIKE)
    })
  }

  hush(hushed: boolean, seconds: number) {
    const now = this.context.currentTime
    const gain = this.depth.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(hushed ? 0 : 1, now + seconds)
  }

  sweep(direction: 'down' | 'up', seconds: number, strength = 1) {
    if (!this.audible) return
    const now = this.context.currentTime
    const [from, to] = direction === 'down' ? [2600, 180] : [180, 2600]
    const filter = this.fallCutoff
    const gain = this.fall.node.gain
    this.fall.open()
    filter.cancelScheduledValues(now)
    filter.setValueAtTime(from, now)
    filter.exponentialRampToValueAtTime(to, now + seconds)
    const peak = 0.2 * strength
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(peak, now + seconds * 0.45)
    gain.linearRampToValueAtTime(peak * 0.6, now + seconds * 0.8)
    gain.linearRampToValueAtTime(0, now + seconds + 0.8)
    this.fall.closeAfter(seconds + 0.8)
  }

  /**
   * The first bloom, after Enter. Fades are linear in amplitude: heard from the first moment,
   * swelling on from there (an exponential fade from silence stays inaudible for half its length).
   */
  bloom() {
    const now = this.context.currentTime
    this.audible = true
    this.fader.gain.cancelScheduledValues(now)
    this.fader.gain.setValueAtTime(0, now)
    this.fader.gain.linearRampToValueAtTime(1, now + BLOOM)
  }

  setAudible(audible: boolean) {
    if (audible === this.audible) return
    this.audible = audible
    window.clearTimeout(this.sleepTimer)
    const raw = this.context.rawContext as AudioContext
    const gain = this.fader.gain
    if (audible) {
      void raw.resume().then(() => {
        if (!this.audible) return
        const now = this.context.currentTime
        gain.cancelScheduledValues(now)
        gain.setValueAtTime(gain.value, now)
        gain.linearRampToValueAtTime(1, now + FADE_IN)
      })
      return
    }
    const now = this.context.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + FADE_OUT)
    // Once silent, let the context sleep: no audio work at all while muted or hidden.
    this.sleepTimer = window.setTimeout(() => {
      if (!this.audible) void raw.suspend()
    }, (FADE_OUT + 0.15) * 1000)
  }

  inspect(): SoundState {
    const layers: Record<string, number> = {}
    for (const [name, layer] of Object.entries(this.layers)) layers[name] = Number(layer.node.gain.value.toFixed(3))
    layers.wind = Number(this.wind.node.gain.value.toFixed(3))
    layers.fader = Number(this.fader.gain.value.toFixed(4))
    for (const [name, hum] of Object.entries(this.hums)) layers[name] = Number(hum.node.gain.value.toFixed(3))
    const samples = this.meter.getValue() as Float32Array
    let sum = 0
    let peak = 0
    for (const sample of samples) {
      sum += sample * sample
      peak = Math.max(peak, Math.abs(sample))
    }
    const decibels = (value: number) => Number((20 * Math.log10(Math.max(value, 1e-6))).toFixed(1))
    return {
      state: this.context.state,
      audible: this.audible,
      layers,
      notes: this.notes,
      rms: decibels(Math.sqrt(sum / Math.max(1, samples.length))),
      peak: decibels(peak),
    }
  }
}

let started = false

/**
 * Tone warns whenever a sound is scheduled on a sleeping context. VOID's context sleeps on
 * purpose (muted, or the tab hidden), so that one warning is dropped; anything else Tone has to
 * say still reaches the console.
 */
const SLEEPING = 'The AudioContext is "suspended"'
setLogger({
  log: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith(SLEEPING)) return
    console.warn(...args)
  },
})

/**
 * Create and start the engine. Call it synchronously from the Enter click: the context is made
 * and resumed inside the gesture. The graph is built once the context runs (starting sound on a
 * context that has not yet woken would only be warned about), then blooms up when `audible`,
 * or goes back to sleep until sound is wanted.
 */
export function startEngine(audible: boolean) {
  if (started) return
  started = true
  setContext(new Context({ latencyHint: 'interactive', lookAhead: 0.05 }))
  const context = getContext()
  void context.resume().then(() => {
    const engine = new Engine()
    if (audible) engine.bloom()
    else void (context.rawContext as AudioContext).suspend()
    registerEngine(engine)
  })
}
