import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { SHOT } from '../../core/env.ts'
import { galacticPosition, type GalaxyData } from '../../core/galaxy.ts'
import { useVoid } from '../../core/store.ts'
import { companionOrbit, findSecret, returning, VISIT_BEGAN } from '../../secrets/secrets.ts'
import { useLevel } from '../levels/context.ts'
import { worldClock } from '../shared/clock.ts'
import { companion } from '../stage.ts'

const vertexShader = /* glsl */ `
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
}
`

const fragmentShader = /* glsl */ `
uniform float uLight;
void main() {
  // In CSS pixels at its usual size: a small core, a smaller halo than its neighbours'.
  vec2 p = (gl_PointCoord - 0.5) * 18.0;
  float r2 = dot(p, p);
  float light = exp(-r2 / 1.6) + 0.06 * exp(-r2 / 18.0);
  float edge = 1.0 - smoothstep(0.25, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * light * edge * uLight, 1.0);
}
`

/** Seconds its words must have been in view before the persistence counts as found. */
const READ = 3
/** Space between the new star and its words, and kept from the screen's edge, CSS pixels. */
const GAP = 16
const EDGE = 12

const point: [number, number, number] = [0, 0, 0]
const world = new Vector3()
const projected = new Vector3()

/**
 * The persistence: on a visit on a later day than one of the visitor's constellations was drawn,
 * the first star of the oldest such constellation has a companion, a small new star close
 * beside it, riding round the galaxy with it; and beside the companion, a few words for the
 * visitor who came back (ui/CompanionWords.tsx, placed from here).
 */
export function Companion({ galaxy, active }: { galaxy: GalaxyData; active: boolean }) {
  const constellations = useVoid((s) => s.constellations)
  const star = useMemo(() => {
    const kept = returning(constellations, VISIT_BEGAN)
    const first = kept?.stars[0]
    return kept && kept.galaxy === galaxy.index && first !== undefined && first < galaxy.stars.length ? first : null
  }, [constellations, galaxy])
  if (star === null) return null
  return <NewStar galaxy={galaxy} star={star} active={active} />
}

function NewStar({ galaxy, star, active }: { galaxy: GalaxyData; star: number; active: boolean }) {
  const level = useLevel()
  const points = useRef<Points>(null)
  const read = useRef(0)
  const orbit = useMemo(() => companionOrbit(galaxy.stars[star]!.orbit), [galaxy, star])
  const { geometry, material } = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3))
    const material = new ShaderMaterial({
      name: 'companion',
      vertexShader,
      fragmentShader,
      uniforms: { uSize: { value: 18 }, uLight: { value: 0 } },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    return { geometry, material }
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
      if (companion.element) companion.element.dataset.shown = 'false'
    },
    [geometry, material],
  )

  useFrame((state, delta) => {
    const object = points.current
    if (!object) return
    galacticPosition(galaxy, orbit, worldClock.time, point)
    object.position.set(point[0], point[1], point[2])
    // Fainter than its neighbour, and breathing a little: it is new.
    const t = SHOT ? 0 : worldClock.real
    material.uniforms.uLight!.value = (2 + 0.45 * Math.sin(t * 0.8)) * level.fade.current
    material.uniforms.uSize!.value = 18 * state.viewport.dpr

    const element = companion.element
    if (!element) return
    const camera = state.camera as PerspectiveCamera
    object.getWorldPosition(world)
    projected.copy(world).project(camera)
    const x = ((projected.x + 1) / 2) * state.size.width
    const y = ((1 - projected.y) / 2) * state.size.height
    const { transition, secretScene } = useVoid.getState()
    const shown =
      active &&
      transition.phase === 'idle' &&
      secretScene === null &&
      level.fade.current > 0.5 &&
      projected.z < 1 &&
      x > 24 &&
      y > 24 &&
      x < state.size.width - 24 &&
      y < state.size.height - 24
    if (element.dataset.shown !== String(shown)) {
      element.dataset.shown = String(shown)
      element.setAttribute('aria-hidden', String(!shown))
    }
    if (!shown) {
      read.current = 0
      return
    }
    // Beside the new star, on whichever side has the room for the words.
    const room = element.offsetWidth + GAP + EDGE
    const left = x + room > state.size.width && x - room >= 0
    element.dataset.side = left ? 'left' : 'right'
    const at = left ? x - GAP : Math.min(x + GAP, state.size.width - room + GAP)
    element.style.transform = `translate3d(${at.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    read.current += Math.min(delta, 0.1)
    if (read.current >= (SHOT ? 0 : READ)) findSecret('persistence')
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={31} />
}
