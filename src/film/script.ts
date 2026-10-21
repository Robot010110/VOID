/**
 * The trailer's words and their timing, in film seconds. The film is directed through VOID
 * itself (director.ts moves the real camera through the real universe); this file is only what
 * is said over it, and when. Sentence case throughout, as everywhere in VOID; the copy follows
 * content/voice.md where it can, and is a little louder where an advertisement must be.
 *
 * It is ENVOR's advertisement, made of VOID: what was built, shown and said. The shape of it: a
 * point of light; the opening's pull-back from one world out to the whole universe, counted; a
 * fall straight down into a world where people live, and one of their fragments; what else can
 * be done there, cut on the beat; the black hole; the company's name.
 */

/** How long the film runs, seconds. */
export const FILM_LENGTH = 50.5

/** How each title moves: see FilmOverlay's painters. */
export type TitleKind = 'whisper' | 'statement' | 'count' | 'shout' | 'feature' | 'fragment'

export interface Title {
  readonly id: string
  readonly kind: TitleKind
  /** On screen from (its entrance begins) and to (its exit ends). */
  readonly from: number
  readonly to: number
  /** The words, a line each. */
  readonly lines: readonly string[]
  /** A count rolls up to this number, under its line. */
  readonly count?: number
  /** A shout's colour. */
  readonly colour?: string
  /** Seconds between one line and the next coming in. */
  readonly lineGap?: number
  /** Set low on the screen, clear of what the camera looks at. */
  readonly low?: boolean
}

export const TITLES: readonly Title[] = [
  { id: 'look-up', kind: 'whisper', from: 0.5, to: 2.75, lines: ['Look up.'] },
  { id: 'worlds', kind: 'count', from: 4.5, to: 7.45, count: 8, lines: ['worlds around one sun'] },
  { id: 'stars', kind: 'count', from: 7.6, to: 11.0, count: 300, lines: ['stars in one galaxy'] },
  { id: 'galaxies', kind: 'count', from: 11.15, to: 14.6, count: 61, lines: ['galaxies, and one black hole'] },
  { id: 'every-light', kind: 'statement', from: 14.9, to: 17.25, lines: ['Every point of light', 'is a place you can go.'], lineGap: 0.75 },
  { id: 'fall', kind: 'statement', from: 17.45, to: 19.7, lines: ['Fall into anything.'] },
  {
    id: 'browser',
    kind: 'statement',
    from: 20.5,
    to: 25.5,
    lines: ['No download. No plug-in.', 'A whole universe,', 'in a browser tab.'],
    lineGap: 1.0,
    low: true,
  },
  {
    id: 'fragment',
    kind: 'fragment',
    from: 26.3,
    to: 30.9,
    lines: ['On the night side, children can read', 'by the light of the ring.', 'They are told not to, and do.'],
    lineGap: 1.1,
  },
  { id: 'visible', kind: 'shout', from: 31.2, to: 31.98, lines: ['Visible.'], colour: '#f4ebdd' },
  { id: 'infrared', kind: 'shout', from: 32.0, to: 32.78, lines: ['Infrared.'], colour: '#ffb36b' },
  { id: 'radio', kind: 'shout', from: 32.8, to: 33.58, lines: ['Radio.'], colour: '#6fd3e0' },
  { id: 'bend', kind: 'feature', from: 33.75, to: 35.3, lines: ['Bend the stars.'] },
  { id: 'time', kind: 'feature', from: 35.45, to: 37.0, lines: ['Speed up time.'] },
  { id: 'draw', kind: 'feature', from: 37.15, to: 39.05, lines: ['Draw your own constellations.'] },
  { id: 'computed', kind: 'statement', from: 39.55, to: 41.45, lines: ['Every orbit computed.', 'Every word written.'], lineGap: 0.6, low: true },
  { id: 'nothing', kind: 'statement', from: 41.6, to: 42.85, lines: ['All of it', 'built from nothing.'], lineGap: 0.3 },
]

/** Who made it, for the end card. */
export const COMPANY = { name: 'ENVOR', address: 'envor.com' } as const

/** The end card: the company's name gathers out of stars, then three lines under it. */
export const END = {
  /** The screen goes dark and silent. */
  dark: 43.0,
  /** Stars stream in and settle into the letters. */
  gather: 43.7,
  gathered: 46.0,
  lines: [
    { at: 46.2, text: 'We built this.', tone: 'name' },
    { at: 47.0, text: 'We can build anything.', tone: 'claim' },
    { at: 47.8, text: COMPANY.address, tone: 'url' },
  ],
} as const

/** The breadcrumb that builds as the camera falls, shown over this stretch. */
export const CRUMBS = { from: 17.6, to: 30.7 }

