/**
 * Plain descriptions for the info panel, built from a place's actual properties: two or
 * three short sentences, no poetry. Story fragments are never generated (see the brief);
 * these only say what is there, including who lives there, or did, and for how long.
 */
import { anchorsIn } from '../content/anchors.ts'
import { isLit, stillThere, type Civilization } from './civilization.ts'
import { galaxySite, type GalaxyKind, type Universe } from './cosmos.ts'
import { galacticPosition, type GalaxyData } from './galaxy.ts'
import { Rng, hashSeed } from './rng.ts'
import {
  giantColourWords,
  SECONDS_PER_DAY,
  type PlanetData,
  type SystemData,
} from './universe.ts'

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

const TEENS = ['thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** A number in words, up to ninety-nine. */
function number(n: number): string {
  if (n < NUMBERS.length) return NUMBERS[n]!
  if (n < 20) return TEENS[n - 13]!
  if (n < 100) return n % 10 === 0 ? TENS[n / 10]! : `${TENS[Math.floor(n / 10)]}-${NUMBERS[n % 10]}`
  return String(n)
}

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n + 1}th`
}

/** A number of years in words, as people say long times: "about thirty-one thousand years". */
export function yearsInWords(years: number): string {
  if (years >= 1_000_000) {
    const millions = Math.round(years / 1_000_000)
    return millions === 1 ? 'about a million years' : `about ${number(millions)} million years`
  }
  if (years >= 100_000) {
    const hundreds = Math.floor(years / 100_000)
    const rest = Math.round((years % 100_000) / 1000)
    const head = hundreds === 1 ? 'a hundred' : `${number(hundreds)} hundred`
    return rest === 0 ? `about ${head} thousand years` : `about ${head} and ${number(rest)} thousand years`
  }
  if (years >= 1000) return `about ${number(Math.round(years / 1000))} thousand years`
  const hundreds = Math.max(1, Math.round(years / 100))
  return hundreds === 1 ? 'about a hundred years' : `about ${number(hundreds)} hundred years`
}

/** Names in a list: "Vaeth", "Vaeth and Lisi", "Vaeth, Lisi and Seil". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
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

/** Words for a star's colour, as the eye would put it. */
export function starColour(temperature: number): string {
  if (temperature < 3900) return 'red'
  if (temperature < 5200) return 'orange'
  if (temperature < 6000) return 'yellow'
  if (temperature < 7500) return 'yellow-white'
  if (temperature < 10000) return 'white'
  return 'blue-white'
}

/** A few words for what a galaxy is, for screen readers choosing among them. */
export const GALAXY_WORDS: Record<GalaxyKind, string> = {
  spiral: 'a spiral galaxy',
  barred: 'a barred spiral galaxy',
  elliptical: 'an elliptical galaxy',
  irregular: 'an irregular galaxy',
}

export function describeUniverse(universe: Universe): string {
  const count = universe.galaxies.length
  const spirals = universe.galaxies.filter((g) => g.kind === 'spiral' || g.kind === 'barred').length
  const cluster = universe.galaxies.filter((g) => g.node === 0)
  const golden = cluster.filter((g) => g.kind === 'elliptical').length > cluster.length / 2
  return [
    `${capitalise(number(count))} galaxies hang along faint threads of gas, gathered into clusters and strung out between them.`,
    spirals > count / 2
      ? golden
        ? 'Most are spirals; in the great cluster they are smooth golden ellipticals, the oldest of all.'
        : 'Most are spirals, a few are smooth golden ellipticals, and the smallest are ragged and young.'
      : 'Spirals, smooth golden ellipticals and small ragged galaxies hang side by side.',
    'Alone in a void between them, a black hole bends the light of everything behind it.',
  ].join(' ')
}

export function describeHole(): string {
  return [
    'A black hole, alone in the dark between the galaxies.',
    'Its disc of falling gas burns white-hot at the inner edge and cools to ember further out, brighter on the side that turns towards you.',
    'The nebula behind it, and every galaxy beyond, is bent into rings around its shadow.',
  ].join(' ')
}

export function describeGalaxy(galaxy: GalaxyData, homeIndex?: number): string {
  const { shape } = galaxy
  const peoples = peoplesOf(galaxy, homeIndex)
  if (galaxy.kind === 'elliptical') {
    const giant = galaxySite(galaxy.index).size > 23
    return [
      `${giant ? 'A giant elliptical galaxy' : 'An elliptical galaxy'}, a smooth swarm of old golden stars, with no arms and no dust.`,
      peoples ?? 'Its oldest stars gather in tight round clusters that hang around it like sparks.',
    ].join(' ')
  }
  if (galaxy.kind === 'irregular') {
    return [
      'A small irregular galaxy, lopsided and ragged, with no arms and no bright core.',
      'Young blue stars and pink clouds of new stars crowd its few bright knots.',
      ...(peoples ? [peoples] : []),
    ].join(' ')
  }
  const arms = number(shape.arms)
  const core = galaxy.light.core < 4600 ? 'golden' : 'pale gold'
  const sentences = [
    shape.bar > 0
      ? `A barred spiral galaxy, its ${arms} arms trailing from the ends of a ${core} bar.`
      : `A spiral galaxy of ${arms} arms around a bright ${core} core.`,
  ]
  // Three sentences at most: where people live matters more than the colour of the arms.
  const home = homeIndex === undefined ? undefined : galaxy.stars[homeIndex]
  if (!peoples || !home) {
    sentences.push(
      galaxy.light.dust > 0.75
        ? 'Young blue stars and pink clouds of new stars crowd along its arms, beside dark lanes of dust.'
        : 'Young blue stars and pink clouds of new stars crowd along its arms.',
    )
  }
  if (home) {
    const [x, , z] = galacticPosition(galaxy, home.orbit, 0)
    const out = Math.hypot(x, z) / shape.radius
    const where = out < 0.4 ? 'close to its core' : out < 0.7 ? 'a little over halfway out' : 'out towards its edge'
    sentences.push(`${home.star.name}, a ${starColour(home.star.temperature)} star, lies ${where}.`)
  }
  if (peoples) sentences.push(peoples)
  return sentences.join(' ')
}

/**
 * Where people live, or once lived, in a galaxy: the stars of its handcrafted worlds, named so a
 * visitor can find them. Plain fact, and the only signpost to the stories.
 */
function peoplesOf(galaxy: GalaxyData, skip: number | undefined): string | null {
  const anchors = anchorsIn(galaxy.index).filter((anchor) => anchor.star !== skip)
  if (anchors.length === 0) return null
  const names = listOf(anchors.map((anchor) => galaxy.stars[anchor.star]!.star.name))
  const living = anchors.filter((anchor) => stillThere(anchor.civilization.state)).length
  const worlds = anchors.length === 1 ? 'a world' : 'worlds'
  const verb = living === anchors.length ? 'live' : living === 0 ? 'once lived' : 'live, or once lived,'
  return `People ${verb} on ${worlds} around ${names}.`
}

export function describeStar(system: SystemData): string {
  const { star, planets, belts } = system
  const sentences = [starClass(star.temperature, star.age)]

  const count = planets.length
  let worlds = count === 1 ? 'One world circles it' : `${capitalise(number(count))} worlds circle it`
  const belt = belts[0]
  if (belt) worlds += `, and a belt of ${belt.icy ? 'ice' : 'stone'} lies beyond the ${ordinal(belt.after)}`
  sentences.push(`${worlds}.`)

  const people = planets.find((p) => p.civilization)
  const ringed = planets.find((p) => p.kind === 'ringed')
  if (people) sentences.push(peopleOfStar(system, people))
  else if (ringed) sentences.push(`${ringed.name}, the ${ordinal(ringed.index)}, has wide rings.`)
  return sentences.join(' ')
}

/** A star's people, from the system's point of view: where they are, or what they left. */
function peopleOfStar(system: SystemData, planet: PlanetData): string {
  const civilization = planet.civilization!
  const which = `${planet.name}, the ${ordinal(planet.index)}`
  if (isLit(civilization)) return `${which}, is lit at night.`
  if (civilization.state === 'gone') return `${which}, keeps the ruins of a people long gone.`
  if (civilization.structures.swarm) return `An unfinished arc of collectors circles ${system.star.name}.`
  return `${which}, turns inside a lattice of light.`
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

/** Where a people's lights gather, by the kind of world. */
function lightsOn(planet: PlanetData): string {
  switch (planet.kind) {
    case 'desert':
      return 'At night their lights gather in the valleys'
    case 'ocean':
      return 'At night their lights trace the islands'
    case 'ice':
      return 'At night their lights gather along the cracks in the ice'
    case 'toxic':
      return 'At night their cities glow through the cloud'
    default:
      return 'At night their lights trace the coasts'
  }
}

/** Two plain sentences about a world's people: who, how long, and what can be seen of them. */
function describePeople(planet: PlanetData, civilization: Civilization): string[] {
  const { people, age, since, structures } = civilization
  const ruinsIn = planet.kind === 'desert' ? 'sand' : planet.kind === 'ice' ? 'ice' : 'ground'
  switch (civilization.state) {
    case 'thriving':
      return [
        `The ${people} have lived here for ${yearsInWords(age)}.`,
        structures.ring
          ? `${lightsOn(planet)}, and a ring of stations circles the world.`
          : structures.satellites > 100
            ? `${lightsOn(planet)}, and their satellites cross the sky.`
            : `${lightsOn(planet)}.`,
      ]
    case 'fading':
      return [
        `The ${people} have lived here for ${yearsInWords(age)}.`,
        'Fewer of their lights come on each year, and whole cities go dark for hours at a time.',
      ]
    case 'gone':
      return [
        `A people called the ${people} lived here for ${yearsInWords(age)}, and have been gone for ${yearsInWords(since)}.`,
        structures.ring
          ? `Their cities are lines in the ${ruinsIn}, and their broken ring still circles the world.`
          : `Their cities are lines in the ${ruinsIn}.`,
      ]
    case 'transcended':
      return [
        `The ${people} lived here for ${yearsInWords(age)}, until ${yearsInWords(since)} ago.`,
        structures.swarm
          ? 'They left no cities, only an unfinished arc of collectors around their star.'
          : 'They left no cities, only a lattice of light around the world.',
      ]
  }
}

export function describePlanet(system: SystemData, planet: PlanetData): string {
  const rng = new Rng(hashSeed(planet.seed, 0xde5c))
  if (planet.civilization) return [planetLook(planet, rng), ...describePeople(planet, planet.civilization)].join(' ')
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
