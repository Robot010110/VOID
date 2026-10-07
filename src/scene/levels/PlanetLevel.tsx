import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Group, Vector3, type PerspectiveCamera } from 'three'
import { blackbody } from '../../core/blackbody.ts'
import { useVoid } from '../../core/store.ts'
import { getSystem, orbitPosition, type Path, type PlanetData, type SystemData } from '../../core/universe.ts'
import { useOpeningView } from '../camera/opening.ts'
import { planetLimits, planetViews } from '../camera/views.ts'
import { DistantSun } from '../objects/DistantSun.tsx'
import { Flare, type FlareSource } from '../objects/Flare.tsx'
import { GasGiant } from '../objects/GasGiant.tsx'
import { SwarmSky } from '../objects/Megastructures.tsx'
import { pixelRadius } from '../objects/body.ts'
import { hiddenBy, starlight } from '../objects/light.ts'
import { Planet } from '../objects/Planet.tsx'
import { worldClock } from '../shared/clock.ts'
import { focus, handover, levelRuntime } from '../stage.ts'
import { useLevel } from './context.ts'

/**
 * The star's apparent radius from one of its worlds, in radians. Larger than life for
 * presence, larger still close in and for big stars, but kept small enough that its glare
 * never washes over the world in front of it.
 */
function sunSize(system: SystemData, planet: PlanetData): number {
  const size = 0.0105 * Math.sqrt(system.habitable / planet.orbit.radius) * (system.star.radius / 4.4)
  return Math.min(0.024, Math.max(0.005, size))
}

const point: [number, number, number] = [0, 0, 0]
const centre = new Vector3()
const scale = new Vector3()
const projected = new Vector3()

/** How far out a world's own things reach, in its radii: its air, its rings or structures. */
function extentOf(planet: PlanetData): number {
  const { rings, structures } = planet.preset
  return Math.max(1.08, rings ? rings.outer : 0, structures?.ring ? structures.ring.radius + 0.02 : 0, structures?.lattice?.radius ?? 0)
}

/** One world close up, inside its system: lit from wherever its star really is. */
export function PlanetLevel({ path }: { path: Path }) {
  const system = getSystem(path[0]!, path[1]!)
  const index = path[2]!
  const planet = system.planets[index]!
  const runtime = levelRuntime(path)
  const level = useLevel()
  const handed = useVoid((s) => s.transition.phase !== 'idle')
  const body = useRef<Group>(null)

  const sun = useMemo(() => {
    orbitPosition(planet.orbit, worldClock.time, point)
    return starlight(system.star.temperature, planet.light, new Vector3(-point[0], -point[1], -point[2]).normalize())
  }, [system, planet])
  const radius = sunSize(system, planet)
  const colour = useMemo(() => {
    const [r, g, b] = blackbody(system.star.temperature)
    return new Color(r, g, b)
  }, [system])

  const limits = useMemo(() => planetLimits(planet.preset), [planet])
  const portrait = useThree((s) => s.size.width < s.size.height * 0.85)
  const views = useMemo(
    () => planetViews([sun.direction.x, sun.direction.y, sun.direction.z], planet.preset.framing, portrait),
    [sun, planet, portrait],
  )
  useOpeningView(views, planet.preset.framing, limits, !level.background)

  useEffect(() => {
    runtime.limits = limits
  }, [runtime, limits])

  const extent = useMemo(() => extentOf(planet), [planet])
  useEffect(
    () => () => {
      focus.active = false
    },
    [],
  )

  useFrame((state) => {
    orbitPosition(planet.orbit, worldClock.time, point)
    sun.direction.set(-point[0], -point[1], -point[2]).normalize()
    // Once the system owns the world again (going up), this copy steps aside.
    if (body.current) body.current.visible = !(handover.index === index && handover.owner === 'parent')

    // Where the world is on screen, for words set beside it.
    if (level.background || !body.current) return
    const camera = state.camera as PerspectiveCamera
    body.current.getWorldPosition(centre)
    const size = scale.setFromMatrixScale(body.current.matrixWorld).x
    projected.copy(centre).project(camera)
    focus.x = ((projected.x + 1) / 2) * state.size.width
    focus.y = ((1 - projected.y) / 2) * state.size.height
    focus.radius = pixelRadius(size * extent, camera.position.distanceTo(centre), camera.fov, state.size.height)
    projected.copy(camera.position).add(sun.direction).project(camera)
    focus.sunAhead = projected.z < 1
    focus.sunX = ((projected.x + 1) / 2) * state.size.width
    focus.sunY = ((1 - projected.y) / 2) * state.size.height
    focus.active = true
  }, -45)

  const flare = useMemo<FlareSource>(
    () => ({
      infinite: true,
      update(eye, out) {
        out.copy(sun.direction)
        if (!body.current || !body.current.visible) return 1
        body.current.getWorldPosition(centre)
        const size = scale.setFromMatrixScale(body.current.matrixWorld).x
        return 1 - hiddenBy(eye, sun.direction, Infinity, radius, centre, size)
      },
    }),
    [sun, radius],
  )

  return (
    <>
      <group ref={body}>
        {planet.preset.gas ? (
          <GasGiant preset={planet.preset} sun={sun} detail="close" anchor={handed} tweakable />
        ) : (
          <Planet preset={planet.preset} sun={sun} detail="close" anchor={handed} tweakable />
        )}
      </group>
      <DistantSun direction={sun.direction} temperature={system.star.temperature} angularRadius={radius} />
      {system.swarm && (
        <SwarmSky swarm={system.swarm} starRadius={system.star.radius} seed={system.seed} orbit={planet.orbit} />
      )}
      <Flare source={flare} color={colour} strength={0.8} />
    </>
  )
}
