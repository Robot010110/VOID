/**
 * Plain descriptions for the info panel, built from a place's actual properties: two or
 * three short sentences, no poetry. Story fragments are never generated (see the brief);
 * these only say what is there.
 */
import { Rng, hashSeed } from './rng.ts'
import {
  giantColourWords,
  SECONDS_PER_DAY,
  type PlanetData,
  type SystemData,
} from './universe.ts'

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

function number(n: number): string {
  return NUMBERS[n] ?? String(n)
}

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n + 1}th`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function starClass(temperature: number, age: number): string {
  if (temperature < 3900) return 'A small red star that burns slowly and steadily.'
  if (temperature < 5200) return 'An orange star, a little cooler and smaller than most.'
  if (temperature < 6000) {
    if (age < 2) return 'A young yellow star.'
    if (age > 7.5) return 'An old yellow star, beginning to swell.'
    return 'A yellow star in the long, steady middle of its life.'
  }
  if (temperature < 7500) return 'A yellow-white star, hotter and brighter than most.'
  if (temperature < 10000) return 'A white star that burns hot and fast.'
  return 'A blue-white star, fierce and short-lived.'
}

export function describeStar(system: SystemData): string {
  const { star, planets, belts } = system
  const sentences = [starClass(star.temperature, star.age)]

  const count = planets.length
  let worlds = count === 1 ? 'One world circles it' : `${capitalise(number(count))} worlds circle it`
  const belt = belts[0]
  if (belt) worlds += `, and a belt of ${belt.icy ? 'ice' : 'stone'} lies beyond the ${ordinal(belt.after)}`
  sentences.push(`${worlds}.`)

  const lit = planets.find((p) => p.preset.lights)
  const ringed = planets.find((p) => p.kind === 'ringed')
  if (lit) sentences.push(`${lit.name} is lit at night.`)
  else if (ringed) sentences.push(`${ringed.name}, the ${ordinal(ringed.index)}, has wide rings.`)
  return sentences.join(' ')
}

function planetLook(planet: PlanetData, rng: Rng): string {
  const { preset } = planet
  switch (planet.kind) {
    case 'terrestrial': {
      const islands = (preset.terrain?.continentBias ?? 0) < -0.08
      return islands
        ? 'A temperate world of wide oceans and scattered islands.'
        : rng.pick([
            'A temperate world of blue oceans and green continents.',
            'A temperate world with deep oceans, broad green continents and white poles.',
          ])
    }
    case 'ocean':
      return rng.pick([
        'An ocean world, its one sea broken only by scattered islands.',
        'A world of water, with only a scattering of islands above it.',
      ])
    case 'desert':
      return (preset.surface?.iceCap ?? 2) < 1
        ? 'A dry world of red dust and dark stone, with frost at its poles.'
        : 'A dry world of red dust and dark stone.'
    case 'ice':
      return preset.rings
        ? 'A frozen world crossed by long dark cracks, circled by a thin ring of ice.'
        : 'A frozen world, its surface crossed by long dark cracks.'
    case 'lava':
      return 'A world still molten under a thin, cracked crust.'
    case 'toxic':
      return 'A world wrapped in thick yellow cloud, hot and heavy beneath.'
    case 'barren':
      return rng.pick(['An airless world of craters.', 'A small airless world, cratered and grey.'])
    case 'gas': {
      const colours = giantColourWords(preset) ?? 'cream and rust'
      const great = preset.gas?.storms.some((storm) => storm.radius > 0.08)
      return great
        ? `A gas giant banded in ${colours}, with a storm wider than most worlds.`
        : `A gas giant banded in ${colours}.`
    }
    case 'ringed': {
      const colours = giantColourWords(preset) ?? 'pale gold'
      return `A ${colours} gas giant with wide, bright rings.`
    }
    case 'ice-giant': {
      const colours = giantColourWords(preset) ?? 'deep blue'
      return preset.rings
        ? `A cold ${colours} giant with a faint, thin ring.`
        : `A cold ${colours} giant of water, ammonia and methane.`
    }
  }
}

function dayAndMoons(planet: PlanetData): string {
  const hours = Math.max(2, Math.round((planet.preset.dayLength / SECONDS_PER_DAY) * 24))
  const moons = planet.preset.moons.length
  const giant = planet.preset.gas !== undefined
  const day = giant ? `It turns once every ${hours} hours` : `A day here lasts ${hours} hours`
  if (moons === 0) return `${day}, and it has no moons.`
  if (moons === 1) return `${day}, and one small moon circles it.`
  return `${day}, and ${number(moons)} moons circle it.`
}

export function describePlanet(system: SystemData, planet: PlanetData): string {
  const rng = new Rng(hashSeed(planet.seed, 0xde5c))
  const sentences = [planetLook(planet, rng), dayAndMoons(planet)]
  if (planet.preset.lights) {
    sentences.push(
      planet.kind === 'desert'
        ? 'At night, a few lights gather in its valleys.'
        : 'At night, lights trace its coasts.',
    )
  } else {
    const count = system.planets.length
    sentences.push(
      count === 1
        ? `It is the only world around ${system.star.name}.`
        : `It is the ${ordinal(planet.index)} of ${number(count)} worlds around ${system.star.name}.`,
    )
  }
  return sentences.join(' ')
}
