import { useEffect } from 'react'
import { Vector3 } from 'three'
import { getUniverse, isHole } from '../core/cosmos.ts'
import { getGalaxy } from '../core/galaxy.ts'
import { useVoid, type Transition } from '../core/store.ts'
import { getSystem, orbitPosition, type Level, type Path } from '../core/universe.ts'
import { rig } from '../scene/camera/rig.ts'
import { worldClock } from '../scene/shared/clock.ts'
import { D2, galaxyNote, orbitPulse, scaleNote, starNote, worldNote } from './notes.ts'
import { audioEngine, onEngine, type Hum } from './sound.ts'

/** What a people's world hums, by what became of them. */
function humOf(path: Path): Hum {
  const planet = getSystem(path[0]!, path[1]!).planets[path[2]!]
  switch (planet?.civilization?.state) {
    case 'thriving':
      return 'warm'
    case 'fading':
      return 'faltering'
    case 'transcended':
      return 'glass'
    default:
      return 'none'
  }
}

/** How much air moves at a world: a giant's storms, a world's wind, an airless rock's hush. */
function windOf(path: Path): number {
  const preset = getSystem(path[0]!, path[1]!).planets[path[2]!]?.preset
  if (!preset) return 0
  if (preset.gas) return 1
  return preset.atmosphere ? 0.7 : 0.06
}

/** The note a child of the current place rings when touched, if it rings one. */
function noteFor(path: Path, level: Level, index: number): { kind: 'star' | 'world' | 'galaxy'; midi: number } | null {
  if (level === 'universe') {
    if (isHole(index)) return { kind: 'galaxy', midi: scaleNote(0, D2) }
    const site = getUniverse().galaxies[index]
    return site ? { kind: 'galaxy', midi: galaxyNote(site.size) } : null
  }
  if (level === 'galaxy') {
    const star = getGalaxy(path[0]!).stars[index]
    return star ? { kind: 'star', midi: starNote(star.star.temperature) } : null
  }
  if (level === 'system') {
    const planet = getSystem(path[0]!, path[1]!).planets[index]
    return planet ? { kind: 'world', midi: worldNote(planet.orbit.radius) } : null
  }
  return null
}

const camera = new Vector3()
const world = new Vector3()
const point: [number, number, number] = [0, 0, 0]

/** The orbital period of the world nearest the camera in a system. */
function nearestPeriod(path: Path): number {
  const { pose } = rig
  const s = Math.sin(pose.polar)
  camera
    .set(s * Math.sin(pose.azimuth), Math.cos(pose.polar), s * Math.cos(pose.azimuth))
    .applyQuaternion(pose.basis)
    .multiplyScalar(pose.distance)
    .add(pose.center)
  let best = Infinity
  let period = 2000
  for (const planet of getSystem(path[0]!, path[1]!).planets) {
    orbitPosition(planet.orbit, worldClock.time, point)
    const d = camera.distanceToSquared(world.set(point[0], point[1], point[2]))
    if (d < best) {
      best = d
      period = planet.orbit.period
    }
  }
  return period
}

/** True for a flight that has just begun (or turned back), not one changing phase. */
function begins(next: Transition, previous: Transition): boolean {
  return next.phase === 'approaching' && (previous.phase !== 'approaching' || previous.direction !== next.direction)
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
  )
}

/**
 * Keeps the sound in step with the visitor: the level's layer, a world's wind and hum, a note
 * for whatever is touched, a sweep for every fall, and mute (the M key, the toggle, a hidden
 * tab). Reacts through store subscriptions only; renders nothing.
 */
export function AudioDirector() {
  useEffect(() => {
    /** Bring a newly started engine (or a new place) up to date. */
    const syncPlace = () => {
      const engine = audioEngine()
      if (!engine) return
      const { level, path } = useVoid.getState()
      engine.setLevel(level)
      if (level === 'planet') engine.setPlace(windOf(path), humOf(path))
      else engine.setPlace(0, 'none')
      if (level === 'system') engine.setPulse(orbitPulse(nearestPeriod(path)))
    }
    const syncAudible = () => {
      audioEngine()?.setAudible(useVoid.getState().audioEnabled && document.visibilityState === 'visible')
    }

    const unsubscribers = [
      onEngine(() => {
        syncPlace()
        syncAudible()
      }),
      useVoid.subscribe((s) => s.path, syncPlace),
      useVoid.subscribe((s) => s.audioEnabled, syncAudible),
      useVoid.subscribe(
        (s) => s.hoverTarget,
        (target) => {
          const { intro, transition, path, level } = useVoid.getState()
          if (target === null || intro !== 'done' || transition.phase !== 'idle') return
          const note = noteFor(path, level, target)
          if (note) audioEngine()?.note(note.kind, note.midi)
        },
      ),
      useVoid.subscribe(
        (s) => s.transition,
        (next, previous) => {
          // The opening sweeps once for its whole pull-back.
          if (useVoid.getState().intro !== 'done' || !begins(next, previous)) return
          audioEngine()?.sweep(next.direction, next.seconds ?? 2.5)
        },
      ),
    ]

    const onVisibility = () => syncAudible()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'm' && event.key !== 'M') return
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
      const { audioEnabled, setAudioEnabled } = useVoid.getState()
      setAudioEnabled(!audioEnabled)
    }
    // A system's pulse follows whichever world the camera is nearest, checked now and then.
    const pulse = window.setInterval(() => {
      const { level, path } = useVoid.getState()
      if (level === 'system') audioEngine()?.setPulse(orbitPulse(nearestPeriod(path)))
    }, 2000)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      window.clearInterval(pulse)
    }
  }, [])
  return null
}
