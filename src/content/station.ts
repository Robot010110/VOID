/**
 * Listening Station 9: what is on it, for the terminal the console's riddle opens. The station
 * was sent out by a people to listen, and left to listen on its own; its logs keep what it
 * heard, and its keepers' note says where they went home. The note's coordinates (in sixteens,
 * as the station counts) lead to their world. Plain words, like a log, in VOID's voice.
 */

export interface StationFile {
  readonly name: string
  readonly lines: readonly string[]
}

export interface StationDirectory {
  readonly name: string
  readonly files: readonly StationFile[]
}

/** What the station prints when it wakes. */
export const STATION_GREETING: readonly string[] = ['Listening Station 9.', 'Listening. Type help for what it understands.']

/** Files at the top of the station: shown by `ls`, the hidden one only by `ls -a`. */
export const STATION_FILES: readonly StationFile[] = [
  {
    name: 'readme',
    lines: [
      'Listening Station 9.',
      '',
      'Unattended since the last keeper went home.',
      'The station listens, keeps its log, and sends home one word a day.',
      '',
      'The logs are in logs/.',
      'The keepers kept their own notes out of sight, as keepers do.',
    ],
  },
  {
    name: '.keeper',
    lines: [
      'If anyone ever reads this: we are not far.',
      'Home is at 2f.a1.01. The station counts in sixteens.',
      'Tell it: goto 2f a1 01',
      'We would be glad of the company.',
    ],
  },
]

export const STATION_LOGS: StationDirectory = {
  name: 'logs',
  files: [
    {
      name: '0001.log',
      lines: ['Day 1. The array is cold and the sky is loud.', 'Everything we hear is noise. Good: noise means it works.'],
    },
    {
      name: '0002-4110.log',
      lines: ['Nothing.', 'Nothing.', 'Nothing.', '(4,106 more days, all the same)'],
    },
    {
      name: '4111.log',
      lines: [
        'Day 4111. A source, very faint, out in the sky between the galaxies.',
        'It blinks: two, three, five. Then it waits, and begins again.',
        'Stars do not count. Someone is counting.',
      ],
    },
    {
      name: '4112.log',
      lines: ['Day 4112. We answered: seven, eleven, thirteen.', 'No change. It may be very far away. It may be very old.'],
    },
    {
      name: '4140.log',
      lines: [
        'Day 4140. Still there. It can only be seen from outside everything,',
        'out among the galaxies, and only while it is lit.',
        'If you go looking, look for the star that keeps time.',
      ],
    },
    {
      name: '5020.log',
      lines: [
        'Day 5020. Heard something new, in radio only:',
        'a galaxy wearing a ring of lights that no eye could see.',
        'Bonyr Wake. We do not know who hung them there.',
      ],
    },
    {
      name: '6315.log',
      lines: [
        'Day 6315. A small blue world, third from a yellow star',
        'on the outer edge of Valath Drift. One moon. No lights.',
        'Its star has only a catalogue number. We watched it for a year.',
        'None of us can say why it matters. It does.',
      ],
    },
    {
      name: '7302.log',
      lines: [
        'Day 7302. The last keeper is going home.',
        'The station will go on listening on its own,',
        'and send home its word every day, as it always has.',
      ],
    },
  ],
}
