/**
 * The words the secrets leave where they are found. Written by hand, in the voice of
 * content/voice.md, like every fragment; where each one appears is in secrets/secrets.ts, and
 * the spoilers are in SECRETS.md.
 */

/** The one line in the dark, inside the black hole. */
export const INTERIOR_LINE = 'Everything that ever fell in here is still falling, together.'

/** The last fragment, out past the edge, where everything has faded. */
export const EDGE_FRAGMENT: readonly string[] = ['Nothing is out here.', 'Only the way back,', 'lit all the way.']

/** Beside the small new star that comes to a visitor's constellation on a later day. */
export const COMPANION_FRAGMENT: readonly string[] = [
  'You came back.',
  'While you were away,',
  'a small star came',
  'to keep yours company.',
]

/**
 * What the browser's console says to anyone who opens it: a riddle whose answer, typed
 * anywhere on the page, opens the listening station.
 */
export const CONSOLE_RIDDLE: readonly string[] = [
  'You found the back of the sky.',
  '',
  'There is a door here. It opens for one word,',
  'which is what the quiet becomes, rearranged:',
  '',
  '    S I L E N T',
  '',
  'Type it anywhere in VOID.',
]
