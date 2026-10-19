/**
 * Hooks for the screenshot script and for profiling (`?shot=` or `?debug` only): trigger
 * transitions and find targets on screen without simulating a hunt with the mouse.
 */
import { audioEngine } from '../audio/sound.ts'
import { getUniverse } from '../core/cosmos.ts'
import { DEBUG, SHOT } from '../core/env.ts'
import { useVoid } from '../core/store.ts'
import { beginOpening, opening } from '../intro/opening.ts'
import { edge, signalSpot } from '../secrets/sequences.ts'
import { filmReady, filmState, startFilm } from '../film/director.ts'
import { renderScore } from '../film/sound.ts'
import { ascend, back, descend } from './camera/transitions.ts'
import { stepping, worldClock } from './shared/clock.ts'
import { bakesPending } from './shared/bake.ts'
import { workPending } from './shared/work.ts'
import { levelRuntime, warmUp } from './stage.ts'

export function installTestHooks() {
  if (!SHOT && !DEBUG) return
  ;(window as unknown as { __VOID__: unknown }).__VOID__ = {
    descend,
    ascend,
    back,
    /** Hold time still (true) or let it run (false). */
    hold: (on: boolean) => {
      stepping.manual = on
      stepping.frames = 0
    },
    /** While held, let time run for `frames` frames. */
    advance: (frames: number) => {
      stepping.frames += frames
    },
    /** Frames still to run from the last advance. */
    pending: () => stepping.frames,
    locate: (index: number) => levelRuntime(useVoid.getState().path).locate?.(index) ?? null,
    /** The black hole's index among the universe's children. */
    hole: () => getUniverse().hole.index,
    /** Press Enter on the title, without sound (a script's call is not a gesture). */
    enter: () => beginOpening(false),
    /** Where the opening is. */
    intro: () => ({
      stage: useVoid.getState().intro,
      mode: opening.mode,
      t: Number(opening.t.toFixed(3)),
      flight: opening.flight,
      loaded: Number(((performance.now() - opening.loading) / 1000).toFixed(2)),
      fonts: opening.fontsReady,
      sound: opening.soundReady,
      ready: [useVoid.getState().path, ...warmUp.paths].map((p) => levelRuntime(p).ready),
      bakes: bakesPending(),
      work: workPending(),
    }),
    /** Where the signal is on screen and whether it is lit; the secrets found and playing. */
    signal: () => ({ ...signalSpot }),
    secrets: () => {
      const { foundSecrets, secretScene, terminalOpen } = useVoid.getState()
      return { found: foundSecrets, scene: secretScene, terminal: terminalOpen, edge: Number(edge.fade.toFixed(3)) }
    },
    /** The trailer: roll it, read where it is, and render its music (a base64 WAV). */
    film: { start: startFilm, state: filmState, ready: filmReady, score: renderScore },
    /** The sound engine's state, once Enter has started it. */
    audio: () => audioEngine()?.inspect() ?? null,
    state: () => {
      const { path, level, transition, hoverTarget, sketch, naming, driftMode, timeStep, spectrum } = useVoid.getState()
      return {
        path,
        level,
        phase: transition.phase,
        hoverTarget,
        sketch: sketch?.stars ?? null,
        naming,
        driftMode,
        timeStep,
        spectrum,
        ready: levelRuntime(path).ready,
        real: Number(worldClock.real.toFixed(3)),
      }
    },
  }
}
