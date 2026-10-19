import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type PerspectiveCamera,
} from 'three'
import { MAX_CONSTELLATIONS, MAX_STARS, segments } from '../../core/constellations.ts'
import { galacticPosition, type GalaxyData } from '../../core/galaxy.ts'
import { useVoid } from '../../core/store.ts'
import { useLevel } from '../levels/context.ts'
import { worldClock } from '../shared/clock.ts'
import { constellationLabels, pointer } from '../stage.ts'

const vertexShader = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute float aAlpha;
uniform vec2 uViewport;
uniform float uWidth;
uniform float uGap;
varying float vAcross;
varying float vAlpha;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(aStart, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aEnd, 1.0);
  if (a.w <= 0.0 || b.w <= 0.0 || aAlpha <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 halfView = uViewport * 0.5;
  vec2 sa = a.xy / a.w * halfView;
  vec2 sb = b.xy / b.w * halfView;
  vec2 d = sb - sa;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  // A little space is left round each star, as on a star chart.
  float gap = min(uGap, len * 0.3);
  vec2 s = mix(sa + dir * gap, sb - dir * gap, position.x) + normal * position.y * uWidth;
  gl_Position = vec4(s / halfView, 0.0, 1.0);
  vAcross = position.y;
  vAlpha = aAlpha * smoothstep(uGap * 2.0, uGap * 3.0, len);
}
`

const fragmentShader = /* glsl */ `
uniform float uFade;
varying float vAcross;
varying float vAlpha;
void main() {
  float edge = 1.0 - abs(vAcross);
  vec3 starlight = vec3(1.0, 0.93, 0.84);
  gl_FragColor = vec4(starlight * 1.9 * edge * vAlpha * uFade, 1.0);
}
`

/** Lines drawn at most: every constellation the visitor could keep, a drawing, and its tether. */
const CAPACITY = MAX_CONSTELLATIONS * (MAX_STARS - 1) + MAX_STARS + 1
/** Kept constellations are faint; one being drawn, and its tether to the pointer, brighter. */
const KEPT = 0.55
const DRAWING = 1
const TETHER = 0.45

const point: [number, number, number] = [0, 0, 0]
const a = new Vector3()
const b = new Vector3()
const centre = new Vector3()
const projected = new Vector3()
const inverse = new Matrix4()

/**
 * The visitor's constellations in this galaxy: thin glowing lines from star to star, moving
 * with the stars as the galaxy turns, faint once kept. A constellation being drawn is brighter,
 * with a tether from its last star to the pointer. Names are set beside them on the page, at
 * places this works out each frame (see ui/ConstellationLabels.tsx).
 */
export function Constellations({ galaxy, active }: { galaxy: GalaxyData; active: boolean }) {
  const level = useLevel()
  const mesh = useRef<Mesh>(null)
  const all = useVoid((s) => s.constellations)
  const sketch = useVoid((s) => s.sketch)
  const kept = useMemo(
    () => all.filter((c) => c.galaxy === galaxy.index && c.stars.every((star) => star < galaxy.stars.length)),
    [all, galaxy],
  )

  const { geometry, material, starts, ends, alphas } = useMemo(() => {
    const geometry = new InstancedBufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3))
    geometry.setIndex([0, 1, 2, 0, 2, 3])
    const starts = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3)
    const ends = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3)
    const alphas = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1)
    for (const attribute of [starts, ends, alphas]) attribute.setUsage(35048) // DynamicDrawUsage
    geometry.setAttribute('aStart', starts)
    geometry.setAttribute('aEnd', ends)
    geometry.setAttribute('aAlpha', alphas)
    geometry.instanceCount = 0
    const material = new ShaderMaterial({
      name: 'constellations',
      vertexShader,
      fragmentShader,
      uniforms: { uViewport: { value: new Vector2(1, 1) }, uWidth: { value: 1.4 }, uGap: { value: 7 }, uFade: { value: 0 } },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    return { geometry, material, starts, ends, alphas }
  }, [])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    const object = mesh.current
    const group = object?.parent as Group | null
    if (!object || !group) return
    const camera = state.camera as PerspectiveCamera
    const dpr = state.viewport.dpr
    const u = material.uniforms
    ;(u.uViewport!.value as Vector2).set(state.size.width * dpr, state.size.height * dpr)
    u.uWidth!.value = 1.5 * dpr
    u.uGap!.value = 7 * dpr
    u.uFade!.value = level.fade.current
    const time = worldClock.time
    const at = (star: number, out: Vector3) => {
      galacticPosition(galaxy, galaxy.stars[star]!.orbit, time, point)
      return out.set(point[0], point[1], point[2])
    }

    let n = 0
    const line = (from: Vector3, to: Vector3, alpha: number) => {
      if (n >= CAPACITY) return
      starts.setXYZ(n, from.x, from.y, from.z)
      ends.setXYZ(n, to.x, to.y, to.z)
      alphas.setX(n, alpha)
      n++
    }
    for (const c of kept) for (const [s, e] of segments(c.stars)) line(at(s, a), at(e, b), KEPT)

    const drawing = active && sketch?.galaxy === galaxy.index ? sketch.stars : null
    if (drawing) {
      for (const [s, e] of segments(drawing)) line(at(s, a), at(e, b), DRAWING)
      // A tether from the last star to the pointer, at that star's depth.
      if (pointer.hovering && !pointer.touch) {
        at(drawing[drawing.length - 1]!, a)
        projected.copy(a).applyMatrix4(group.matrixWorld).project(camera)
        b.set((pointer.x / state.size.width) * 2 - 1, 1 - (pointer.y / state.size.height) * 2, projected.z)
          .unproject(camera)
          .applyMatrix4(inverse.copy(group.matrixWorld).invert())
        line(a, b, TETHER)
      }
    }
    geometry.instanceCount = n
    object.visible = n > 0
    starts.needsUpdate = ends.needsUpdate = alphas.needsUpdate = true

    // Where each name goes: below the middle of its stars.
    for (const c of kept) {
      const element = constellationLabels.elements.get(c.id)
      if (!element) continue
      centre.set(0, 0, 0)
      for (const star of c.stars) centre.add(at(star, a))
      centre.divideScalar(c.stars.length).applyMatrix4(group.matrixWorld)
      projected.copy(centre).project(camera)
      const onScreen = active && level.fade.current > 0.5 && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05
      if (!onScreen) {
        element.dataset.shown = 'false'
        continue
      }
      const x = ((projected.x + 1) / 2) * state.size.width
      const y = ((1 - projected.y) / 2) * state.size.height
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + 16).toFixed(1)}px, 0) translateX(-50%)`
      element.dataset.shown = 'true'
    }
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={30} />
}
