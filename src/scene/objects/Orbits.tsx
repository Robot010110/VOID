import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector2 } from 'three'
import { orbitAngle, orbitPoint, type PlanetData } from '../../core/universe.ts'
import orbitFrag from '../../shaders/system/orbit.frag'
import orbitVert from '../../shaders/system/orbit.vert'
import { worldClock } from '../shared/clock.ts'
import { useLevel } from '../levels/context.ts'

const MAX_ORBITS = 12
const SEGMENTS = 360
/** Half the ribbon's width in drawing-buffer pixels, before the pixel ratio. */
const HALF_WIDTH = 1.15
/** Starlight, dimmed far below everything that is lit. */
const COLOUR = new Color('#f4ebdd').multiplyScalar(0.11)

/** Every orbit of a system in one ribbon mesh: one draw call. */
function createGeometry(planets: readonly PlanetData[]): BufferGeometry {
  const points = SEGMENTS + 1
  const count = planets.length * points * 2
  const positions = new Float32Array(count * 3)
  const nexts = new Float32Array(count * 3)
  const sides = new Float32Array(count)
  const angles = new Float32Array(count)
  const orbits = new Float32Array(count)
  const indices: number[] = []
  const p: [number, number, number] = [0, 0, 0]
  const q: [number, number, number] = [0, 0, 0]
  planets.forEach((planet, o) => {
    for (let k = 0; k < points; k++) {
      const angle = (k / SEGMENTS) * Math.PI * 2
      orbitPoint(planet.orbit, angle, p)
      orbitPoint(planet.orbit, angle + (Math.PI * 2) / SEGMENTS, q)
      for (let side = 0; side < 2; side++) {
        const v = (o * points + k) * 2 + side
        positions.set(p, v * 3)
        nexts.set(q, v * 3)
        sides[v] = side === 0 ? -1 : 1
        angles[v] = angle
        orbits[v] = o
      }
      if (k < SEGMENTS) {
        const a = (o * points + k) * 2
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aNext', new BufferAttribute(nexts, 3))
  geometry.setAttribute('aSide', new BufferAttribute(sides, 1))
  geometry.setAttribute('aAngle', new BufferAttribute(angles, 1))
  geometry.setAttribute('aOrbit', new BufferAttribute(orbits, 1))
  geometry.setIndex(indices)
  return geometry
}

interface OrbitsProps {
  planets: readonly PlanetData[]
  /** Per-orbit strength, written by the level (hover brightens, a world being visited fades). */
  strength: Float32Array
}

/** The paths of a system's worlds: faint lines, each brightest just behind its world. */
export function Orbits({ planets, strength }: OrbitsProps) {
  const level = useLevel()
  const geometry = useMemo(() => createGeometry(planets.slice(0, MAX_ORBITS)), [planets])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: 'orbits',
        vertexShader: orbitVert,
        fragmentShader: orbitFrag,
        defines: { MAX_ORBITS },
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uViewport: { value: new Vector2(1, 1) },
          uHalfWidth: { value: HALF_WIDTH },
          uAngles: { value: new Float32Array(MAX_ORBITS) },
          uStrength: { value: strength },
          uColor: { value: COLOUR },
          uFade: { value: 0 },
        },
      }),
    [strength],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    const u = material.uniforms
    const dpr = state.viewport.dpr
    ;(u.uViewport!.value as Vector2).set(state.size.width * dpr, state.size.height * dpr)
    u.uHalfWidth!.value = HALF_WIDTH * Math.max(1, dpr * 0.8)
    const angles = u.uAngles!.value as Float32Array
    for (let i = 0; i < Math.min(planets.length, MAX_ORBITS); i++) {
      angles[i] = orbitAngle(planets[i]!.orbit, worldClock.time)
    }
    u.uFade!.value = level.fade.current
  })

  return <mesh geometry={geometry} material={material} renderOrder={0.6} frustumCulled={false} />
}
