/**
 * Procedural names. Each galaxy speaks one language: a phonetic family (its sound) plus a
 * dialect drawn from the galaxy's seed (which sounds it favours, and a signature ending).
 * Stars of one galaxy therefore share a feel, and neighbouring galaxies sound different.
 *
 * Target sound: Ithren, Vael, Oru, Saelith, Kethra, Amaru Veil, Nostrim.
 * Minor, unremarkable stars get catalogue designations instead (VX-11).
 */
import { REAL_WORDS } from './realWords.ts'
import { Rng } from './rng.ts'

export type FamilyId = 'lir' | 'oru' | 'keth' | 'cael'

type Inventory = ReadonlyArray<readonly [sound: string, weight: number]>

interface Family {
  /** Onsets allowed at the start of a word. '' means the word opens on a vowel. */
  readonly initials: Inventory
  /** Onsets between syllables. */
  readonly medials: Inventory
  readonly nuclei: Inventory
  /** Codas that close a syllable inside the word. */
  readonly innerCodas: Inventory
  /** Codas that close the final syllable. */
  readonly finalCodas: Inventory
  /** Relative weights for one, two, three and four syllables. */
  readonly syllables: readonly [number, number, number, number]
}

// prettier-ignore
const FAMILIES: Record<FamilyId, Family> = {
  // Liquid and airy: Ithren, Vael, Saelith.
  lir: {
    initials: [['', 26], ['s', 12], ['v', 12], ['l', 8], ['th', 7], ['n', 6], ['r', 4], ['sh', 4], ['f', 3]],
    medials: [['l', 20], ['r', 15], ['th', 12], ['n', 12], ['s', 8], ['v', 8], ['thr', 4], ['nd', 3]],
    nuclei: [['a', 18], ['e', 20], ['i', 20], ['ae', 14], ['ei', 4], ['ie', 3], ['o', 6], ['y', 2]],
    innerCodas: [['', 56], ['l', 10], ['n', 8], ['th', 10], ['r', 6], ['s', 5]],
    finalCodas: [['', 20], ['l', 15], ['n', 18], ['th', 16], ['r', 8], ['s', 6], ['rn', 3], ['ss', 2]],
    syllables: [18, 60, 21, 1],
  },
  // Open vowels, soft consonants: Oru, Amaru.
  oru: {
    initials: [['', 32], ['m', 9], ['k', 7], ['t', 8], ['n', 7], ['h', 5], ['y', 4], ['p', 3], ['r', 4], ['s', 4]],
    medials: [['r', 22], ['m', 13], ['n', 12], ['k', 7], ['t', 9], ['y', 4], ['h', 4], ['l', 6], ['nd', 3], ['mb', 2]],
    nuclei: [['a', 36], ['o', 20], ['u', 20], ['i', 13], ['e', 5], ['au', 3], ['ai', 3]],
    innerCodas: [['', 90], ['n', 10]],
    finalCodas: [['', 80], ['n', 16], ['m', 4]],
    syllables: [6, 52, 38, 4],
  },
  // Stony and northern: Kethra, Nostrim.
  keth: {
    initials: [['k', 14], ['n', 10], ['', 12], ['th', 7], ['st', 5], ['dr', 6], ['h', 6], ['v', 7], ['g', 5], ['m', 6], ['b', 4], ['tr', 3], ['br', 3]],
    medials: [['r', 14], ['thr', 8], ['tr', 7], ['k', 8], ['m', 8], ['n', 8], ['th', 8], ['st', 5], ['d', 7], ['l', 7], ['g', 5], ['v', 5], ['dr', 3]],
    nuclei: [['e', 25], ['o', 20], ['a', 20], ['i', 20], ['u', 8], ['y', 3]],
    innerCodas: [['', 50], ['s', 11], ['r', 10], ['n', 10], ['th', 7], ['l', 6], ['k', 3]],
    finalCodas: [['', 20], ['m', 12], ['r', 12], ['n', 12], ['th', 10], ['st', 5], ['k', 5], ['rn', 4], ['l', 6], ['nd', 4]],
    syllables: [20, 66, 14, 0],
  },
  // Rounded and latinate: Calien, Velorin, Mirelis.
  cael: {
    initials: [['', 14], ['c', 12], ['l', 10], ['v', 8], ['m', 8], ['s', 8], ['r', 6], ['n', 6], ['d', 5], ['t', 5], ['p', 4], ['f', 4], ['qu', 2], ['cl', 2]],
    medials: [['l', 18], ['r', 16], ['n', 12], ['m', 8], ['c', 7], ['s', 7], ['v', 7], ['t', 6], ['d', 5], ['nd', 3], ['x', 1]],
    nuclei: [['a', 22], ['e', 22], ['i', 20], ['o', 16], ['u', 5], ['ia', 3], ['io', 2], ['ae', 4]],
    innerCodas: [['', 74], ['n', 8], ['l', 7], ['r', 6], ['s', 5]],
    finalCodas: [['', 32], ['s', 20], ['n', 17], ['l', 11], ['r', 9], ['x', 3], ['nt', 3]],
    syllables: [8, 56, 33, 3],
  },
}

export const FAMILY_IDS: readonly FamilyId[] = ['lir', 'oru', 'keth', 'cael']

/** Poetic second words for featured places: Amaru Veil, Ithren Reach. */
// prettier-ignore
const TITLES = [
  'Veil', 'Reach', 'Drift', 'Crown', 'Hollow', 'Wake', 'Choir', 'Lantern', 'Cradle', 'Shoal',
  'Fold', 'Garden', 'Mirror', 'Spindle', 'Wheel', 'Lace', 'Weave', 'Bloom', 'Shore', 'Well',
] as const

/** Profanity, slurs and nursery sounds, rejected anywhere inside a generated name. */
// prettier-ignore
const BANNED_SUBSTRINGS = [
  'fuk', 'fuc', 'shit', 'cunt', 'dick', 'cock', 'piss', 'tit', 'cum', 'fag', 'nig', 'rape',
  'slut', 'whore', 'kkk', 'nazi', 'anus', 'anal', 'sex', 'porn', 'ass', 'poo', 'pee', 'butt',
  'fart', 'boob', 'dum', 'kill', 'hate', 'puke', 'snot', 'turd', 'bum', 'jew', 'wank', 'twat',
  'homo', 'gay', 'lesb', 'spic', 'kike', 'coon', 'paki', 'retard', 'damn', 'hell', 'god',
  'kak', 'cac', 'kaka', 'pupu', 'pipi', 'moron', 'satan', 'koran', 'quran', 'kuran', 'allah',
  'jesus', 'buddh', 'karma', 'kama', 'rama', 'mana', 'nazi', 'stalin', 'hitler', 'vix',
  'kathr', 'drogo', 'runn',
] as const

/**
 * Real-world names (planets, stars, places, people, brands) and common English words that
 * would break the spell if a star or planet were called them.
 */
// prettier-ignore
const BANNED_NAMES = new Set([
  'mars', 'venus', 'terra', 'sol', 'luna', 'vega', 'rigel', 'sirius', 'titan', 'europa', 'ceres',
  'pluto', 'saturn', 'neptune', 'uranus', 'mercury', 'earth', 'gaia', 'orion', 'lyra', 'altair',
  'deneb', 'antares', 'polaris', 'nova', 'rome', 'oslo', 'lima', 'peru', 'iran', 'iraq', 'mali',
  'chad', 'cuba', 'oman', 'togo', 'fiji', 'bali', 'java', 'kyoto', 'tokyo', 'osaka', 'paris',
  'milan', 'nile', 'congo', 'texas', 'ohio', 'utah', 'maine', 'nepal', 'tibet', 'india', 'kenya',
  'maria', 'mario', 'anna', 'tara', 'kara', 'sara', 'nina', 'mona', 'lisa', 'emma', 'mia', 'leo',
  'luka', 'noah', 'liam', 'ella', 'ava', 'tom', 'tim', 'sam', 'max', 'eva', 'kim', 'lee', 'ray',
  'diana', 'helena', 'elena', 'irene', 'selene', 'helios', 'apollo', 'athena', 'thor', 'odin',
  'loki', 'zeus', 'hera', 'aurora', 'tide', 'ember', 'dust', 'abyss', 'void', 'amen', 'alamo',
  'kona', 'maui', 'hilo', 'oahu', 'toyota', 'honda', 'nokia', 'sony', 'tesla', 'kodak', 'ikea',
  'mazda', 'amazon', 'canon', 'nikon', 'alexa', 'siri', 'naruto', 'harun', 'karen', 'karin',
  'koko', 'momo', 'tokyo', 'sumo', 'tofu', 'miso', 'sake', 'sushi', 'kimono', 'yoga', 'yoda',
  'than', 'then', 'them', 'thin', 'thing', 'tin', 'ten', 'tan', 'ran', 'run', 'ruin', 'rain',
  'main', 'man', 'men', 'mine', 'line', 'lane', 'lean', 'lie', 'sir', 'sin', 'son', 'sun',
  'set', 'sat', 'sit', 'net', 'nit', 'not', 'nut', 'rat', 'rot', 'ram', 'rim', 'rum', 'kin',
  'kit', 'kite', 'mat', 'mate', 'moon', 'mom', 'nun', 'nor', 'near', 'ear', 'era', 'err', 'ore',
  'oil', 'ill', 'all', 'ale', 'eel', 'elm', 'inn', 'ion', 'iron', 'isle', 'lens', 'less', 'lore',
  'lose', 'lost', 'love', 'lure', 'mile', 'mire', 'mole', 'more', 'most', 'muse', 'nail', 'name',
  'nose', 'note', 'once', 'one', 'open', 'oral', 'pole', 'pore', 'pose', 'rare', 'rest', 'rise',
  'role', 'rose', 'rule', 'safe', 'sail', 'sale', 'same', 'sane', 'seal', 'seen', 'sell', 'send',
  'sent', 'shin', 'shot', 'site', 'slim', 'slot', 'soil', 'sole', 'some', 'song', 'soon', 'sore',
  'stem', 'step', 'tale', 'tame', 'tile', 'time', 'tone', 'torn', 'trim', 'vain', 'vale', 'vane',
  'vase', 'veil', 'vile', 'vine', 'wane', 'west', 'wine', 'wise', 'yarn', 'hen', 'her', 'him',
  'his', 'hit', 'hot', 'hut', 'kid', 'mad', 'mud', 'nod', 'red', 'rid', 'rod', 'sad', 'tab',
  'ton', 'tun', 'van', 'vet', 'den', 'din', 'don', 'dot', 'dim', 'gem', 'gin', 'gun', 'gut',
  'hem', 'hum', 'mum', 'nan', 'pan', 'pen', 'pin', 'pit', 'pot', 'put', 'tag', 'tug', 'tot',
  'sis', 'cat', 'cut', 'cod', 'cot', 'con', 'can', 'cola', 'coca', 'cake', 'kale', 'kilo',
  'menu', 'meal', 'mean', 'mere', 'melon', 'lemon', 'salon', 'solar', 'lunar', 'stellar',
  'nadir', 'vapor', 'tenor', 'manor', 'minor', 'motor', 'rotor', 'sonar', 'radar', 'tumor',
  'humor', 'honor', 'valor', 'color', 'saber', 'satin', 'cabin', 'robin', 'rival', 'naval',
  'navel', 'novel', 'level', 'lever', 'never', 'river', 'liver', 'silver', 'sliver', 'vessel',
  'kitten', 'mitten', 'button', 'demon', 'devil', 'evil', 'vomit', 'penis', 'move', 'viva',
  'sith', 'kuru', 'kiran', 'lara', 'rana', 'amir', 'vida', 'nome', 'tula', 'cade', 'anon',
  'kanon', 'narn', 'unam', 'ayam', 'ikan', 'saka', 'naya', 'sate', 'tere', 'horda', 'varia',
  'edas', 'stirer', 'tamil', 'roma', 'romo', 'nana', 'mama', 'papa', 'dada', 'seth', 'vino',
  'tate', 'kano', 'rina', 'momi', 'drer', 'yate',
  // Common words the liquid families like to fall into.
  'this', 'that', 'thus', 'these', 'those', 'there', 'their', 'here', 'hers', 'thee', 'thine',
  'fell', 'fill', 'file', 'fine', 'fire', 'fish', 'five', 'flee', 'fled', 'lithe', 'loin',
  'lion', 'lien', 'liar', 'lair', 'rail', 'real', 'reel', 'rein', 'rile', 'sill', 'silo',
  'sire', 'shine', 'shire', 'shell', 'sheer', 'shy', 'vein', 'vial', 'vise', 'noel', 'neon',
  'nile', 'nine', 'noon', 'lease', 'sear', 'seer', 'sees', 'seine', 'sense', 'shea', 'shed',
  'sheen', 'shelf', 'ship', 'shore', 'shorn', 'siren', 'sisal', 'solo', 'soul', 'sour',
  'earn', 'ease', 'east', 'else', 'alien', 'alone', 'area', 'aria', 'arise', 'aroma', 'ether',
  'ethos', 'aisle', 'ally', 'only', 'oily', 'lily', 'rely', 'reply', 'lisle', 'senile',
  'ethan', 'ellen', 'ellis', 'elise', 'eliza', 'emil', 'enid', 'erin', 'eric', 'ivan', 'iris',
  'isla', 'lena', 'leon', 'lila', 'lina', 'lois', 'lola', 'lyla', 'lynn', 'nell', 'neil', 'nora',
  'nils', 'olin', 'omar', 'oren', 'rhea', 'rosa', 'ruth', 'ryan', 'sean', 'sian', 'silas',
  'sven', 'theo', 'tess', 'vera', 'vern', 'viola', 'yara', 'alan', 'alana', 'elena', 'ines',
  'luna', 'lune', 'nyla', 'nala', 'simba', 'elsa', 'arya', 'eden', 'evan', 'ithil', 'sakura',
  'sess', 'maril', 'vila', 'nukel', 'andu', 'sali', 'lini', 'monda', 'aesir', 'haru', 'akutan',
  'aman', 'sono', 'kuro',
])

/** Shape problems that make a name hard to say or awkward on the page. */
const AWKWARD = [
  /(.)\1\1/, // a tripled letter
  /(..)\1/, // reduplication: koko, mama, lili
  /aa|ee|ii|uu|yy|ao|(?<!q)u[aeo]|yi|iy|ae[aeiou]|[aeiou]ae|ei[aeiou]|ie[aeiou]|ia[aeiou]|io[aeiou]/,
  /^ie|ae.*ae|th.*th|y.*y|x.*x/, // one flourish per name
  /hh|wh|kk|gg|bb|dd|tt|vv|rr|cc|ss(?!$)/,
  // Two-consonant joins that stumble in the mouth.
  /s[dgbvr]|d[nmgkt]|g[dktmv]|v[dkgtmnsl]|k[dgvmntl]|t[kgdbmnvl]|b[dgktmnv]|m[gkdtlrw]|n[mrlbw]|l[rnw]|p[kt]/,
  /^(nd|mb|rn|ss|nt|ng|rs|ls)/,
  /q(?!u)/,
  /x[^aeiouy]/,
]

/** The only three-consonant runs allowed; anything heavier reads as a typo. */
const TRIPLES = new Set([
  'thr',
  'str',
  'ndr',
  'nth',
  'rth',
  'lth',
  'ntr',
  'mbr',
  'ldr',
  'nst',
  'rst',
])

const VOWEL = /[aeiouy]/

function consonantClusters(word: string): string[] {
  return word.split(/[aeiouy]+/).filter((run) => run.length >= 2)
}

function cleanName(raw: string, maxLength: number): string | null {
  // Three-letter words collide with real ones too often (Six, Ken, Ara), so names start at four.
  if (raw.length < 4 || raw.length > maxLength) return null
  if (!VOWEL.test(raw.slice(0, 3))) return null
  for (const pattern of AWKWARD) if (pattern.test(raw)) return null
  // At most two consonant clusters per name, never the same one twice (Trortrest), and no
  // run longer than an allowed triple.
  const clusters = consonantClusters(raw)
  if (clusters.length > 2 || new Set(clusters).size !== clusters.length) return null
  for (const run of clusters)
    if (run.length > 3 || (run.length === 3 && !TRIPLES.has(run))) return null
  for (const banned of BANNED_SUBSTRINGS) if (raw.includes(banned)) return null
  if (BANNED_NAMES.has(raw) || REAL_WORDS.has(raw)) return null
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

interface Table {
  readonly sounds: readonly string[]
  readonly weights: readonly number[]
}

/** Copy an inventory, nudging every weight and boosting one sound (the dialect's habit). */
function dialectTable(inventory: Inventory, rng: Rng, favour: number): Table {
  const sounds: string[] = []
  const weights: number[] = []
  const favourite = rng.int(0, inventory.length - 1)
  inventory.forEach(([sound, weight], i) => {
    if (weight < 8 && i !== favourite && rng.chance(0.18)) return
    sounds.push(sound)
    weights.push(weight * rng.range(0.4, 1.6) * (i === favourite ? favour : 1))
  })
  return { sounds, weights }
}

export interface NameOptions {
  minSyllables?: number
  maxSyllables?: number
  maxLength?: number
}

export class Language {
  readonly family: FamilyId
  readonly seed: number
  private readonly initials: Table
  private readonly medials: Table
  private readonly nuclei: Table
  private readonly innerCodas: Table
  private readonly finalCodas: Table
  private readonly syllableWeights: readonly number[]

  constructor(seed: number, family?: FamilyId) {
    const rng = new Rng(seed)
    this.seed = seed >>> 0
    this.family = family ?? rng.pick(FAMILY_IDS)
    const f = FAMILIES[this.family]
    this.initials = dialectTable(f.initials, rng, 1.8)
    this.medials = dialectTable(f.medials, rng, 1.8)
    this.nuclei = dialectTable(f.nuclei, rng, 1.6)
    this.innerCodas = dialectTable(f.innerCodas, rng, 1.4)
    this.finalCodas = dialectTable(f.finalCodas, rng, 3.0)
    this.syllableWeights = f.syllables.map((w) => w * rng.range(0.7, 1.3))
  }

  private draw(table: Table, rng: Rng): string {
    return rng.weighted(table.sounds, table.weights)
  }

  private attempt(rng: Rng, minSyl: number, maxSyl: number): string {
    const counts = [1, 2, 3, 4].filter((n) => n >= minSyl && n <= maxSyl)
    const weights = counts.map((n) => this.syllableWeights[n - 1] ?? 0)
    const count = weights.some((w) => w > 0) ? rng.weighted(counts, weights) : minSyl
    let word = ''
    for (let s = 0; s < count; s++) {
      let onset = this.draw(s === 0 ? this.initials : this.medials, rng)
      // Between syllables, keep a consonant at the seam so vowels don't pile up.
      if (s > 0 && onset === '' && VOWEL.test(word.charAt(word.length - 1))) {
        onset = this.draw(this.medials, rng)
      }
      word += onset
      word += this.draw(this.nuclei, rng)
      word += this.draw(s === count - 1 ? this.finalCodas : this.innerCodas, rng)
    }
    return word
  }

  /** A pronounceable single-word name, e.g. "Saelith". Deterministic for a given rng state. */
  name(rng: Rng, options: NameOptions = {}): string {
    const minSyl = Math.max(1, options.minSyllables ?? 1)
    const maxSyl = Math.min(4, Math.max(minSyl, options.maxSyllables ?? 4))
    const maxLength = options.maxLength ?? 8
    for (let tries = 0; tries < 200; tries++) {
      const clean = cleanName(this.attempt(rng, minSyl, maxSyl), maxLength)
      if (clean !== null) return clean
    }
    // Practically unreachable; still return something that sounds like the family.
    return FALLBACKS[this.family]
  }

  /** A two-word name for a featured place, e.g. "Amaru Veil". */
  titled(rng: Rng): string {
    return `${this.name(rng, { minSyllables: 2, maxSyllables: 3, maxLength: 7 })} ${rng.pick(TITLES)}`
  }
}

const FALLBACKS: Record<FamilyId, string> = {
  lir: 'Vael',
  oru: 'Oru',
  keth: 'Kethra',
  cael: 'Calien',
}

const CATALOGUE_LETTERS = 'BCDFGHJKLMNPRSTVWXZ'

/** A catalogue designation for an unremarkable star, e.g. "VX-11". Never used for featured stars. */
export function catalogueName(rng: Rng): string {
  const a = CATALOGUE_LETTERS.charAt(rng.int(0, CATALOGUE_LETTERS.length - 1))
  const b = CATALOGUE_LETTERS.charAt(rng.int(0, CATALOGUE_LETTERS.length - 1))
  const digits = rng.chance(0.3) ? rng.int(1, 99) : rng.int(100, 999)
  return `${a}${b}-${digits}`
}
