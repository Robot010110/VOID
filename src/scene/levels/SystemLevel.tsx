import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Group, Vector3, type PerspectiveCamera } from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { useVoid, type Transition } from '../../core/store.ts'
import { getSystem, orbitPosition, type Path } from '../../core/universe.ts'
import { systemLimits } from '../camera/views.ts'
import { Belt } from '../objects/Belt.tsx'
import { pixelRadius } from '../objects/body.ts'
import { Flare, type FlareSource } from '../objects/Flare.tsx'
import { GasGiant } from '../objects/GasGiant.tsx'
import { hiddenBy, starlight } from '../objects/light.ts'
import { Orbits } from '../objects/Orbits.tsx'
import { Planet } from '../objects/Planet.tsx'
import { Star } from '../objects/Star.tsx'
import { worldClock } from '../shared/clock.ts'
import { handover, levelRuntime, type Pick } from '../stage.ts'

const MAX_ORBITS = 12

/** Whether a running transition hands this system's star to or from its galaxy. */
function starHanded(transition: Transition, system: Path): boolean {
  if (transition.phase === 'idle') return false
  const involves = (path: Path) => path.length === 2 && path[0] === system[0] && path[1] === system[1]
  return (involves(transition.from) && transition.to.length === 1) || (involves(transition.to) && transition.from.length === 1)
}

/** The child taking part in a running transition, by index, or -1. */
function transitionChild(transition: Transition, system: Path): number {
  if (transition.phase === 'idle') return -1
  for (const path of [transition.from, transition.to]) {
    if (path.length === system.length + 1 && path[0] === system[0] && path[1] === system[1]) return path[system.length]!
  }
  return -1
}

const point: [number, number, number] = [0, 0, 0]
const world = new Vector3()
const projected = new Vector3()
const starWorld = new Vector3()
const toStar = new Vector3()
const bodyCentre = new Vector3()

/** A star system: the star and its corona, its worlds on their orbits, and any belt. */
export function SystemLevel({ path }: { path: Path }) {
  const system = getSystem(path[0]!, path[1]!)
  const runtime = levelRuntime(path)
  const get = useThree((s) => s.get)
  const handed = useVoid((s) => transitionChild(s.transition, path))
  const starAnchor = useVoid((s) => starHanded(s.transition, path))
  const star = useRef<Group>(null)
  const anchors = useRef<Array<Group | null>>([])
  const root = useRef<Group>(null)

  const worlds = useMemo(
    () =>
      system.planets.map((planet) => ({
        planet,
        sun: starlight(system.star.temperature, planet.light),
      })),
    [system],
  )
  const strength = useMemo(() => new Float32Array(MAX_ORBITS).fill(1), [])
  const belt = system.belts[0]
  const beltLight = useMemo(() => {
    if (!belt) return null
    const light = Math.min(1, Math.max(0.55, (system.habitable / belt.radius) ** 0.35))
    return starlight(system.star.temperature, light).irradiance
  }, [belt, system])
  const starColour = useMemo(() => {
    const [r, g, b] = blackbody(system.star.temperature)
    return new Color(r, g, b)
  }, [system])

  // Screen-space picking and placement of the hover ring, for the active level.
  useEffect(() => {
    const locate = (index: number): Pick | null => {
      const anchor = anchors.current[index]
      const planet = system.planets[index]
      if (!anchor || !planet || !anchor.visible) return null
      const { camera, size } = get()
      const cam = camera as PerspectiveCamera
      anchor.getWorldPosition(world)
      projected.copy(world).project(cam)
      if (projected.z > 1 || projected.z < -1) return null
      const scale = world.setFromMatrixScale(anchor.matrixWorld).x
      anchor.getWorldPosition(world)
      const extent = planet.preset.rings ? planet.preset.rings.outer * 0.85 : 1
      const radius = pixelRadius(scale * extent, cam.position.distanceTo(world), cam.fov, size.height)
      return {
        index,
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        radius,
      }
    }
    const pick = (x: number, y: number): Pick | null => {
      let best: Pick | null = null
      let bestDepth = Infinity
      for (let i = 0; i < system.planets.length; i++) {
        const spot = locate(i)
        if (!spot) continue
        const reach = Math.max(spot.radius + 6, 14)
        if ((spot.x - x) ** 2 + (spot.y - y) ** 2 > reach * reach) continue
        const depth = get().camera.position.distanceTo(anchors.current[i]!.getWorldPosition(world))
        if (depth < bestDepth) {
          best = spot
          bestDepth = depth
        }
      }
      return best
    }
    runtime.locate = locate
    runtime.pick = pick
    runtime.limits = systemLimits(system)
    return () => {
      runtime.locate = null
      runtime.pick = null
    }
  }, [runtime, system, get])

  useFrame((state) => {
    const time = worldClock.time
    const hover = useVoid.getState().hoverTarget
    // Once the galaxy owns the star again (rising out), this copy steps aside.
    if (star.current) star.current.visible = !(starAnchor && handover.owner === 'parent')
    const camera = state.camera
    for (let i = 0; i < worlds.length; i++) {
      const anchor = anchors.current[i]
      const { planet, sun } = worlds[i]!
      if (!anchor) continue
      orbitPosition(planet.orbit, time, point)
      anchor.position.set(point[0], point[1], point[2])
      sun.direction.set(-point[0], -point[1], -point[2]).normalize()
      // The world being handed over is drawn by the planet level once it owns it.
      anchor.visible = !(handover.index === i && i === handed && handover.owner === 'child')
      if (i < MAX_ORBITS) {
        anchor.updateWorldMatrix(true, false)
        const near = camera.position.distanceTo(anchor.getWorldPosition(world)) / world.setFromMatrixScale(anchor.matrixWorld).x
        // A visited world's orbit fades as the camera nears it, so no line cuts across it.
        const approach = Math.min(1, Math.max(0, (near - 8) / 40))
        strength[i] = (i === hover ? 2.6 : 1) * approach
      }
    }
  }, -45)

  const flare = useMemo<FlareSource>(
    () => ({
      infinite: false,
      update(eye, out) {
        if (!root.current) return 0
        root.current.getWorldPosition(starWorld)
        out.copy(starWorld)
        const scale = world.setFromMatrixScale(root.current.matrixWorld).x
        const distance = eye.distanceTo(starWorld)
        toStar.subVectors(starWorld, eye).divideScalar(Math.max(distance, 1e-6))
        const size = Math.asin(Math.min(1, (system.star.radius * scale) / Math.max(distance, 1e-6)))
        let visible = 1
        for (const anchor of anchors.current) {
          if (!anchor || !anchor.visible) continue
          anchor.getWorldPosition(bodyCentre)
          const radius = world.setFromMatrixScale(anchor.matrixWorld).x
          visible *= 1 - hiddenBy(eye, toStar, distance, size, bodyCentre, radius)
        }
        return visible
      },
    }),
    [system],
  )

  return (
    <group ref={root}>
      <group ref={star}>
        <Star star={system.star} anchor={starAnchor} />
      </group>
      <Orbits planets={system.planets} strength={strength} />
      {belt && beltLight && <Belt belt={belt} light={beltLight} />}
      {worlds.map(({ planet, sun }, i) => (
        <group
          key={planet.index}
          ref={(group) => {
            anchors.current[i] = group
          }}
          scale={planet.radius}
        >
          {planet.preset.gas ? (
            <GasGiant preset={planet.preset} sun={sun} detail="system" anchor={handed === i} />
          ) : (
            <Planet preset={planet.preset} sun={sun} detail="system" anchor={handed === i} />
          )}
        </group>
      ))}
      <Flare source={flare} color={starColour} />
    </group>
  )
}
