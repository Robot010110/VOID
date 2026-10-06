import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import {
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  type PerspectiveCamera,
} from 'three'
import { createNoise3D } from 'simplex-noise'
import { Rng } from '../../core/rng.ts'
import { useVoid } from '../../core/store.ts'
import { orbitalPeriod, type BeltData } from '../../core/universe.ts'
import beltFrag from '../../shaders/system/belt.frag'
import beltVert from '../../shaders/system/belt.vert'
import { worldClock } from '../shared/clock.ts'
import { useLevel } from '../levels/context.ts'
import { SOLID } from './body.ts'

/** Rocks per tier: a prefix of one seeded list, so the tiers agree on where rocks are. */
const ROCKS = { high: 3200, medium: 2000, low: 1000 } as const

/** One lumpy rock: an icosphere pushed in and out by noise. */
function createRock(seed: number): IcosahedronGeometry {
  const rng = new Rng(seed)
  const noise = createNoise3D(() => rng.next())
  const rock = new IcosahedronGeometry(1, 1)
  const position = rock.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const bump = 1 + 0.32 * noise(x * 1.3, y * 1.3, z * 1.3) + 0.12 * noise(x * 3.1 + 7, y * 3.1, z * 3.1)
    position.setXYZ(i, x * bump, y * bump, z * bump)
  }
  rock.computeVertexNormals()
  return rock
}

function createBelt(belt: BeltData, count: number): InstancedBufferGeometry {
  const rock = createRock(belt.seed)
  const geometry = new InstancedBufferGeometry()
  geometry.index = rock.index
  geometry.setAttribute('position', rock.getAttribute('position'))
  geometry.setAttribute('normal', rock.getAttribute('normal'))
  const rng = new Rng(belt.seed ^ 0xa57e)
  const orbits = new Float32Array(count * 4)
  const shapes = new Float32Array(count * 4)
  const spins = new Float32Array(count * 4)
  const axis: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < count; i++) {
    const radius = belt.radius + Math.max(-1, Math.min(1, rng.gauss(0, 0.42))) * belt.width * 0.5
    orbits.set([radius, rng.range(0, Math.PI * 2), rng.gauss(0, belt.thickness * 0.5), 0], i * 4)
    shapes.set([Math.min(0.55, rng.pareto(0.05, 2.2)), rng.range(0.55, 1), rng.range(0.5, 0.95), rng.next()], i * 4)
    rng.onSphere(axis)
    spins.set([axis[0], axis[1], axis[2], rng.range(0.05, 0.5) * rng.sign()], i * 4)
  }
  geometry.setAttribute('aOrbit', new InstancedBufferAttribute(orbits, 4))
  geometry.setAttribute('aShape', new InstancedBufferAttribute(shapes, 4))
  geometry.setAttribute('aSpin', new InstancedBufferAttribute(spins, 4))
  geometry.instanceCount = count
  rock.dispose()
  return geometry
}

interface BeltProps {
  belt: BeltData
  /** Starlight at the belt's distance, linear RGB. */
  light: Color
}

/** A belt of rocks between the worlds, in one instanced draw. */
export function Belt({ belt, light }: BeltProps) {
  const level = useLevel()
  const quality = useVoid((s) => s.quality)
  const [capacity] = useState(() => ROCKS.high)
  const geometry = useMemo(() => createBelt(belt, capacity), [belt, capacity])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: 'belt',
        vertexShader: beltVert,
        fragmentShader: beltFrag,
        ...SOLID,
        uniforms: {
          uTime: { value: 0 },
          uRadius: { value: belt.radius },
          uOmega: { value: (Math.PI * 2) / orbitalPeriod(belt.radius) },
          uPixelsPerUnit: { value: 1 },
          uMinPixels: { value: 0.9 },
          uLight: { value: light },
          uAlbedo: { value: new Color(belt.icy ? '#b9c3cc' : '#8c8177') },
          uFade: { value: 0 },
        },
      }),
    [belt, light],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useEffect(() => {
    geometry.instanceCount = Math.min(capacity, ROCKS[quality])
  }, [geometry, capacity, quality])

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera
    const u = material.uniforms
    u.uTime!.value = worldClock.time
    u.uPixelsPerUnit!.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360))
    u.uFade!.value = level.fade.current
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
