/**
 * The handcrafted worlds. The procedural universe is the canvas; the stories live here, on
 * twelve worlds placed across it, each with its people, what became of them, and one to three
 * fragments. Fragments are written by hand, never generated, following content/voice.md.
 *
 * Each anchor names a place (galaxy, star, world) and overrides what that world would have been:
 * its kind, its moons, sometimes its name, and its civilisation. Everything else about the
 * system (its star, its other worlds, their orbits) stays as the seed made it. A fragment's
 * lines are broken by hand, the way they should be read.
 */
import type { CivilizationState, Structures } from '../core/civilization.ts'
import type { PlanetKind } from '../core/planets.ts'

export interface Anchor {
  /** A short handle, for `?anchor=` and for drift mode's tour. */
  readonly id: string
  readonly galaxy: number
  readonly star: number
  /** The world's index in its system. */
  readonly world: number
  readonly kind: PlanetKind
  /** A new name for the world; otherwise it keeps the one its system gave it. */
  readonly name?: string
  /** How many moons it has, when the story needs a certain number. */
  readonly moons?: number
  readonly civilization: {
    readonly people: string
    readonly state: CivilizationState
    /** Years they have lived there, or did. */
    readonly age: number
    /** Years since they left or vanished. */
    readonly since?: number
    readonly structures?: Partial<Structures>
  }
  /** One to three fragments, each a few hand-broken lines. */
  readonly fragments: ReadonlyArray<readonly string[]>
}

export const ANCHORS: readonly Anchor[] = [
  {
    // The home world, in front of its sun at the start of everything.
    id: 'ithasal',
    galaxy: 0,
    star: 0,
    world: 3,
    kind: 'terrestrial',
    civilization: { people: 'Linaer', state: 'thriving', age: 9_000, structures: { satellites: 260 } },
    fragments: [
      ['Every city here keeps one street unlit.', 'People walk it after supper, slowly,', 'until the galaxy comes out overhead.'],
      ['Their oldest map of the sky', 'is painted inside a cradle.', 'It is still in use.'],
    ],
  },
  {
    id: 'aelethan',
    galaxy: 0,
    star: 11,
    world: 0,
    kind: 'ocean',
    civilization: { people: 'Nieleth', state: 'fading', age: 31_000, structures: { satellites: 50 } },
    fragments: [
      ['The ferries stopped running', 'a hundred years ago.', 'On every island someone still lights', 'the lamp at the end of the pier, in case.'],
      ['There are fewer lamps every winter.', 'The ones still burning can see each other,', 'and that seems to be enough.'],
    ],
  },
  {
    id: 'sisaeth',
    galaxy: 0,
    star: 206,
    world: 4,
    kind: 'desert',
    civilization: { people: 'Elothae', state: 'gone', age: 12_000, since: 40_000 },
    fragments: [
      [
        'Their cities were laid out',
        'to catch the evening.',
        'At sunset the old streets still fill',
        'with light, one after another,',
        'as if someone were walking home.',
      ],
      ['They measured distance in rivers.', 'When the last river dried,', 'they kept the word a while longer.'],
    ],
  },
  {
    id: 'evith',
    galaxy: 0,
    star: 259,
    world: 5,
    kind: 'ocean',
    name: 'Evith',
    civilization: {
      people: 'Faeleith',
      state: 'transcended',
      age: 60_000,
      since: 3_000,
      structures: { lattice: { radius: 1.22, tilt: 0.32 } },
    },
    fragments: [
      [
        'Before they went into the lattice,',
        'they closed up every house',
        'the way you would for a long winter:',
        'shutters fastened, water drained,',
        'a note on the table.',
      ],
      ['The lattice still hums.', 'It is tuned, as far as anyone can tell,', 'to the note their children sang', 'when they were learning to count.'],
    ],
  },
  {
    // In the largest spiral of the great cluster.
    id: 'driram',
    galaxy: 54,
    star: 4,
    world: 3,
    kind: 'terrestrial',
    civilization: {
      people: 'Kandin',
      state: 'thriving',
      age: 14_000,
      structures: { ring: { radius: 1.17, tethers: 8, derelict: false }, satellites: 340 },
    },
    fragments: [
      [
        'The ring took eleven generations to close.',
        'On the night the last piece went up,',
        'everyone on the world went outside,',
        'and for a long time nobody said anything.',
      ],
      ['On the night side, children can read', 'by the light of the ring.', 'They are told not to, and do.'],
    ],
  },
  {
    // In the field, far from every cluster: the most remote of the stories.
    id: 'laelien',
    galaxy: 29,
    star: 33,
    world: 2,
    kind: 'ice',
    civilization: {
      people: 'Ilethien',
      state: 'gone',
      age: 20_000,
      since: 9_000,
      structures: { ring: { radius: 1.2, tethers: 0, derelict: true }, satellites: 12 },
    },
    fragments: [
      [
        'For nine hundred years',
        'the winters lengthened.',
        'They wrote it down as weather, every year,',
        'to the last page:',
        'clear and cold, good for seeing.',
      ],
      ['Their ring outlived them.', 'Its broken pieces still go round', 'in their old order,', 'and catch the light at every dawn.'],
    ],
  },
  {
    // In the galaxy nearest the black hole.
    id: 'kumaun',
    galaxy: 39,
    star: 15,
    world: 1,
    kind: 'terrestrial',
    civilization: { people: 'Yurota', state: 'fading', age: 26_000, structures: { satellites: 70 } },
    fragments: [
      [
        'For four centuries they measured',
        'the dark place in their sky.',
        'The last page of the record',
        'is not a measurement.',
        "It is a child's drawing of it.",
      ],
      ['They never gave it a name.', 'When they spoke of it, they pointed.'],
    ],
  },
  {
    // Around a small red star in the giant elliptical: the oldest of the stories.
    id: 'kothor',
    galaxy: 1,
    star: 63,
    world: 0,
    kind: 'desert',
    civilization: {
      people: 'Vathron',
      state: 'transcended',
      age: 900_000,
      since: 200_000,
      structures: { swarm: { radius: 2.7, span: 3.6, inclination: 0.24, node: 1.1, thickness: 0.045 } },
    },
    fragments: [
      ['Their sun is small and red,', 'and will outlast almost everything.', 'They decided long ago', 'to keep it company.'],
      ['The arc around the sun was never finished.', 'They held that anything worth building', 'should always have room', 'for one more piece.'],
      ['They are not here now.', 'But once in a long while a panel turns,', 'a little, as if someone had leaned on it.'],
    ],
  },
  {
    // In a young irregular galaxy.
    id: 'sivar',
    galaxy: 8,
    star: 33,
    world: 3,
    kind: 'terrestrial',
    civilization: { people: 'Lunen', state: 'thriving', age: 4_000, structures: { satellites: 8 } },
    fragments: [
      [
        'They have only just learned',
        'that the lights in their sky',
        'are other suns.',
        'Every night someone names another one,',
        'and every morning the arguments begin.',
      ],
      ['Their grandparents remember', 'the first person to leave the ground.', 'The first thing she did up there', 'was wave.'],
    ],
  },
  {
    id: 'ernae',
    galaxy: 18,
    star: 98,
    world: 0,
    kind: 'toxic',
    civilization: { people: 'Sivanos', state: 'thriving', age: 7_000, structures: { satellites: 0 } },
    fragments: [
      ['No one here has ever seen a star.', 'They believe in them anyway,', 'the way you believe in the sea', 'from far inland.'],
      ['Once in a generation, someone climbs', 'above the cloud.', 'They come back quieter,', 'and nobody asks them to describe it.'],
    ],
  },
  {
    id: 'kandolu',
    galaxy: 15,
    star: 3,
    world: 2,
    kind: 'terrestrial',
    civilization: { people: 'Kunala', state: 'fading', age: 40_000, structures: { satellites: 90 } },
    fragments: [
      [
        'When a comet came, a whole city',
        'would put out its lights to watch it.',
        'There are fewer cities now.',
        'They put them out for almost anything.',
      ],
      ['Nobody counts the cities any more.', 'They count meteors instead,', 'and the totals are better every year.'],
    ],
  },
  {
    // In the home galaxy's nearest neighbour.
    id: 'ensar',
    galaxy: 19,
    star: 5,
    world: 0,
    kind: 'ocean',
    moons: 2,
    civilization: { people: 'Senvaeth', state: 'gone', age: 6_000, since: 3_000, structures: { satellites: 0 } },
    fragments: [
      ['With two moons,', 'the tides here never repeat.', 'They kept a record of every one', 'for six thousand years.'],
      ['The record stops on an ordinary day,', 'at low water,', 'halfway down a page.'],
    ],
  },
]

const byStar = new Map(ANCHORS.map((anchor) => [`${anchor.galaxy}:${anchor.star}`, anchor]))
const byId = new Map(ANCHORS.map((anchor) => [anchor.id, anchor]))

/** The anchor whose world circles this star, if any. */
export function anchorAt(galaxy: number, star: number): Anchor | undefined {
  return byStar.get(`${galaxy}:${star}`)
}

/** The anchor at a place, if the place is an anchor's world. */
export function anchorOf(path: readonly number[]): Anchor | undefined {
  if (path.length !== 3) return undefined
  const anchor = anchorAt(path[0]!, path[1]!)
  return anchor && anchor.world === path[2] ? anchor : undefined
}

export function anchorById(id: string): Anchor | undefined {
  return byId.get(id)
}

/** The anchors in one galaxy. */
export function anchorsIn(galaxy: number): Anchor[] {
  return ANCHORS.filter((anchor) => anchor.galaxy === galaxy)
}
