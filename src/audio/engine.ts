/**
 * The sound of VOID: a Tone.js graph, self-contained, with no React and no three.js.
 *
 * Everything plays through one bus into a gentle compressor, a limiter and the master volume,
 * and most of it also into a long reverb, the space everything hangs in. Under it all a drone
 * is always present; above it, one layer per scale level crossfades in as the visitor moves:
 * a near-subsonic swell for the universe, a shimmering pad like distant voices for a galaxy, a
 * warm chord with a slow pulse for a star system, wind (and, where a people live, their hum)
 * at a world. Touching a star rings a note from D Lydian; falling sweeps noise through a filter.
 *
 * Nothing here exists until `startEngine()`, which must be called from the Enter click: the
 * AudioContext is created inside that gesture, so the browser lets it play and never warns.
 * Tone is imported from its class modules, not its index, which would create a context as
 * soon as it loaded.
 */
import {
  Analyser,
  Chorus,
  Compressor,
  Context,
  FatOscillator,
  Filter,
  FMSynth,
  Gain,
  LFO,
  Limiter,
  Noise,
  Oscillator,
  PolySynth,
  Reverb,
  Volume,
} from 'tone/build/esm/classes.js'
import { getContext, setContext } from 'tone/build/esm/core/Global.js'
import { setLogger } from 'tone/build/esm/core/util/Debug.js'
import { D1, D2, D3, frequency, scaleNote } from './notes.ts'
import { registerEngine, type AudioEngine, type Hum, type NoteKind, type SoundLevel, type SoundState } from './sound.ts'

const db = (decibels: number) => 10 ** (decibels / 20)

/** The master volume: moderate, with the compressor and limiter keeping peaks in hand. */
const MASTER_DB = -9
/** The first bloom of sound after Enter. */
const BLOOM = 4.5
const CROSSFADE = 2
const FADE_OUT = 0.5
const FADE_IN = 0.8
/** Notes closer together than this are skipped; a quick run plays softer. */
const NOTE_GAP = 0.09

type LayerName = 'universe' | 'galaxy' | 'system' | 'planet'

class Engine implements AudioEngine {
  private readonly context = getContext()
  private readonly fader = new Gain(0)
  private readonly bus = new Gain(1)
  private readonly reverb = new Reverb({ decay: 10, preDelay: 0.08, wet: 1 })
  private readonly layers: Record<LayerName, Gain> = {
    universe: new Gain(0),
    galaxy: new Gain(0),
    system: new Gain(0),
    planet: new Gain(0),
  }
  /** Lowers the drone's light at the black hole. */
  private readonly droneTone = new Filter({ type: 'lowpass', frequency: 2400, rolloff: -12 })
  /** The system's chord plays into this, which its pulse swells and ebbs. */
  private readonly systemPulse = new Gain(1)
  private readonly pulse = new LFO({ frequency: 0.2, min: 0.55, max: 1 })
  private readonly wind = new Gain(0)
  private readonly hums: Record<Exclude<Hum, 'none'>, Gain> = {
    warm: new Gain(0),
    faltering: new Gain(0),
    glass: new Gain(0),
  }
  private readonly falter = new Gain(1)
  private readonly fallFilter = new Filter({ type: 'bandpass', frequency: 400, Q: 1.1 })
  private readonly fallGain = new Gain(0)
  private bells: Record<NoteKind, PolySynth<FMSynth>> | null = null
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
   * needs them (the drone, the system it starts in, the sweep of its pull-back, the galaxy and
   * the universe it rises through), then a world's sounds and the bells. Built all at once they
   * held the page for half a second, just as the dark lifts.
   */
  constructor() {
    const volume = new Volume(MASTER_DB).toDestination()
    volume.connect(this.meter)
    const limiter = new Limiter(-1).connect(volume)
    const compressor = new Compressor({ threshold: -24, ratio: 3, attack: 0.08, release: 0.5, knee: 12 }).connect(limiter)
    this.fader.connect(compressor)
    this.bus.connect(this.fader)
    this.reverb.connect(this.fader)

    this.route(this.droneTone, db(-6), db(-10))
    this.route(this.layers.universe, db(-4), db(-14))
    this.route(this.layers.galaxy, db(-7), db(2))
    this.route(this.layers.system, db(-1), db(-5))
    this.route(this.layers.planet, db(-4), db(-9))
    this.systemPulse.connect(this.layers.system)
    this.pulse.connect(this.systemPulse.gain).start()
    this.wind.connect(this.layers.planet)
    this.hums.warm.connect(this.layers.planet)
    this.hums.faltering.chain(this.falter, this.layers.planet)
    this.hums.glass.connect(this.layers.planet)
    this.fallFilter.connect(this.fallGain)
    this.route(this.fallGain, db(-4), db(-6))

    const stages = [
      () => this.drone(),
      () => this.systemVoices(),
      () => new Noise('white').connect(this.fallFilter).start(),
      () => this.galaxyVoices(),
      () => this.universeVoices(),
      () => this.planetVoices(),
      () => this.buildBells(),
    ]
    const next = () => {
      stages.shift()?.()
      if (stages.length > 0) requestAnimationFrame(() => window.setTimeout(next, 0))
    }
    next()
  }

  /** Connect a voice to the bus (dry) and the reverb (wet), each at its own level. */
  private route(node: { connect: (destination: Gain) => unknown }, dry: number, wet: number) {
    if (dry > 0) node.connect(new Gain(dry).connect(this.bus))
    if (wet > 0) node.connect(new Gain(wet).connect(this.reverb))
  }

  /**
   * The drone: two oscillators a few cents apart on D2 and a quiet fifth above, through a
   * low-pass whose cutoff wanders over a minute; and under it, very quiet dark noise.
   */
  private drone() {
    const filter = new Filter({ type: 'lowpass', frequency: 320, rolloff: -24, Q: 0.6 }).connect(this.droneTone)
    new LFO({ frequency: 0.018, min: 180, max: 600 }).connect(filter.frequency).start()
    for (const [midi, detune, level] of [
      [D2, -7, -14],
      [D2, 7, -14],
      [D2 + 7, 4, -21],
    ] as const) {
      new Oscillator({ frequency: frequency(midi), type: 'sawtooth', detune, volume: level }).connect(filter).start()
    }
    this.pink = new Noise('pink').start()
    const hush = new Filter({ type: 'lowpass', frequency: 650, rolloff: -24 })
    this.pink.connect(hush)
    this.route(hush, db(-40), db(-36))
  }

  /** The universe: D1 and its octave, swelling and ebbing over half a minute. */
  private universeVoices() {
    const swell = new Gain(0.6).connect(this.layers.universe)
    new LFO({ frequency: 0.031, min: 0.25, max: 1 }).connect(swell.gain).start()
    new Oscillator({ frequency: frequency(D1), type: 'sine', volume: -10 }).connect(swell).start()
    new Oscillator({ frequency: frequency(D1 + 12), type: 'sine', volume: -11 }).connect(swell).start()
    new Oscillator({ frequency: frequency(D1 + 19), type: 'sine', volume: -27 }).connect(swell).start()
  }

  /**
   * A galaxy: D major seventh with the raised fourth, high and thin, each voice swelling on its
   * own slow breath through a wide chorus, like voices far off.
   */
  private galaxyVoices() {
    const chorus = new Chorus({ frequency: 0.22, delayTime: 4.5, depth: 0.8, spread: 180, wet: 0.7 }).start()
    chorus.connect(this.layers.galaxy)
    const breaths = [0.047, 0.061, 0.073, 0.089, 0.101]
    const notes = [scaleNote(14), scaleNote(16), scaleNote(17), scaleNote(18), scaleNote(20)]
    notes.forEach((midi, i) => {
      const breath = new Gain(0.5).connect(chorus)
      new LFO({ frequency: breaths[i]!, min: 0.08, max: 1, phase: i * 77 }).connect(breath.gain).start()
      new FatOscillator({ frequency: frequency(midi), type: 'sine', count: 2, spread: 16, volume: -29 - i }).connect(breath).start()
    })
  }

  /** A system: a warm open chord (D3, A3, E4) that pulses with the nearest world's orbit. */
  private systemVoices() {
    const warm = new Filter({ type: 'lowpass', frequency: 1100, rolloff: -24, Q: 0.5 }).connect(this.systemPulse)
    for (const [degree, level] of [
      [0, -24],
      [4, -27],
      [8, -31],
    ] as const) {
      new FatOscillator({ frequency: frequency(scaleNote(degree)), type: 'triangle', count: 2, spread: 12, volume: level }).connect(warm).start()
    }
  }

  /** A world: wind in its air, and the hum of its people, if they are there. */
  private planetVoices() {
    const band = new Filter({ type: 'bandpass', frequency: 520, Q: 0.9 })
    this.pink?.connect(band)
    new LFO({ frequency: 0.067, min: 260, max: 950 }).connect(band.frequency).start()
    const gust = new Gain(0.6)
    new LFO({ frequency: 0.113, min: 0.2, max: 1, phase: 90 }).connect(gust.gain).start()
    band.chain(gust, this.wind)

    // Warm: a low hum with a slow waver; a fading people's falters now and then.
    const humFilter = new Filter({ type: 'lowpass', frequency: 800, rolloff: -12 })
    humFilter.connect(this.hums.warm)
    humFilter.connect(this.hums.faltering)
    const waver = new LFO({ frequency: 0.19, min: -5, max: 5 }).start()
    for (const [midi, level] of [
      [D3, -24],
      [D3 + 7, -30],
      [D3 - 12, -27],
    ] as const) {
      const oscillator = new Oscillator({ frequency: frequency(midi), type: 'sine', volume: level }).connect(humFilter).start()
      waver.connect(oscillator.detune)
    }

    // Glass: a pure high fifth, breathing slowly, for a people who became light.
    const shimmer = new Gain(0.6).connect(this.hums.glass)
    new LFO({ frequency: 0.09, min: 0.3, max: 1 }).connect(shimmer.gain).start()
    new Oscillator({ frequency: frequency(scaleNote(18)), type: 'sine', volume: -32 }).connect(shimmer).start()
    new Oscillator({ frequency: frequency(scaleNote(22)), type: 'sine', volume: -36 }).connect(shimmer).start()
  }

  /** Notes: soft FM bells, each kind its own colour, all ringing on into the reverb. */
  private buildBells() {
    this.bells = {
      star: this.bell({ harmonicity: 3, modulationIndex: 7, decay: 1.8, release: 3.2, level: -16 }, db(-6), db(-2)),
      world: this.bell({ harmonicity: 2, modulationIndex: 3, decay: 1.3, release: 2.6, level: -18 }, db(-8), db(-3)),
      galaxy: this.bell({ harmonicity: 1.5, modulationIndex: 4, decay: 2.6, release: 4.5, level: -14 }, db(-6), db(-1)),
    }
  }

  private bell(
    shape: { harmonicity: number; modulationIndex: number; decay: number; release: number; level: number },
    dry: number,
    wet: number,
  ): PolySynth<FMSynth> {
    const synth = new PolySynth(FMSynth, {
      harmonicity: shape.harmonicity,
      modulationIndex: shape.modulationIndex,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.004, decay: shape.decay, sustain: 0, release: shape.release },
      modulationEnvelope: { attack: 0.002, decay: shape.decay * 0.35, sustain: 0, release: shape.release * 0.5 },
      volume: shape.level,
    })
    synth.maxPolyphony = 8
    this.route(synth, dry, wet)
    return synth
  }

  setLevel(level: SoundLevel) {
    const target = level === 'hole' ? 'universe' : level
    for (const [name, gain] of Object.entries(this.layers)) gain.gain.rampTo(name === target ? 1 : 0, CROSSFADE)
    this.droneTone.frequency.rampTo(level === 'hole' ? 260 : 2400, CROSSFADE * 1.5)
  }

  setPlace(wind: number, hum: Hum) {
    this.wind.gain.rampTo(Math.min(1, Math.max(0, wind)), CROSSFADE)
    this.hums.warm.gain.rampTo(hum === 'warm' ? 1 : 0, CROSSFADE)
    this.hums.faltering.gain.rampTo(hum === 'faltering' ? 1 : 0, CROSSFADE)
    this.hums.glass.gain.rampTo(hum === 'glass' ? 1 : 0, CROSSFADE)
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
    this.pulse.frequency.rampTo(hertz, 3)
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
    bell.triggerAttackRelease(frequency(midi), 0.05, now, velocity)
  }

  sweep(direction: 'down' | 'up', seconds: number, strength = 1) {
    if (!this.audible) return
    const now = this.context.currentTime
    const [from, to] = direction === 'down' ? [2600, 180] : [180, 2600]
    const filter = this.fallFilter.frequency
    const gain = this.fallGain.gain
    filter.cancelScheduledValues(now)
    filter.setValueAtTime(from, now)
    filter.exponentialRampToValueAtTime(to, now + seconds)
    const peak = 0.2 * strength
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(peak, now + seconds * 0.45)
    gain.linearRampToValueAtTime(peak * 0.6, now + seconds * 0.8)
    gain.linearRampToValueAtTime(0, now + seconds + 0.8)
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
    for (const [name, gain] of Object.entries(this.layers)) layers[name] = Number(gain.gain.value.toFixed(3))
    layers.wind = Number(this.wind.gain.value.toFixed(3))
    layers.fader = Number(this.fader.gain.value.toFixed(4))
    for (const [name, gain] of Object.entries(this.hums)) layers[name] = Number(gain.gain.value.toFixed(3))
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
