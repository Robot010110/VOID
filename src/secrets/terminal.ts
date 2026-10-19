/**
 * Listening Station 9: the terminal behind the developer's door. A handful of commands over a
 * few files (content/station.ts), and two that touch the universe: `scan` listens to where the
 * visitor is, and `goto` flies anywhere, given coordinates as the station writes them, two
 * digits in sixteens for each step down (galaxy, star, world: `2f·a1·01`). The keepers' note
 * gives the coordinates of their home.
 *
 * Pure: a command and where the visitor is go in, lines and what to do come out. The terminal
 * itself is ui/Terminal.tsx.
 */
import { STATION_FILES, STATION_LOGS, type StationFile } from '../content/station.ts'
import type { CivilizationState } from '../core/civilization.ts'
import { galaxyCount, getUniverse, isHole } from '../core/cosmos.ts'
import { getGalaxy, getGalaxyLook } from '../core/galaxy.ts'
import { getSystem, type Path } from '../core/universe.ts'

/** What a command asks of the terminal besides its words. */
export type Effect = { readonly kind: 'close' } | { readonly kind: 'clear' } | { readonly kind: 'goto'; readonly path: Path }

export interface Reply {
  readonly lines: readonly string[]
  readonly effect?: Effect
}

export const PROMPT = 'station 9 ›'

const HELP: readonly string[] = [
  'help            this list',
  'ls [-a] [dir]   list files',
  'cat <file>      show a file',
  'whoami          who is asking',
  'scan            listen to where you are',
  'goto <place>    go there, written in sixteens',
  'clear           clear the screen',
  'exit            close the station',
]

/** A place written as the station writes it: `2f·a1·01`. */
export function coordinates(path: Path): string {
  return path.map((index) => index.toString(16).padStart(2, '0')).join('·')
}

/** A place read as typed (`2f a1 01`, `2f·a1·1`, `0x2f.0xa1`), or null if it is not one. */
export function parsePlace(text: string): Path | null {
  const parts = text
    .trim()
    .toLowerCase()
    .split(/[\s.·:/,-]+/)
    .filter((part) => part.length > 0)
  if (parts.length === 0 || parts.length > 3) return null
  const path: number[] = []
  for (const part of parts) {
    const digits = part.startsWith('0x') ? part.slice(2) : part
    if (!/^[0-9a-f]{1,3}$/.test(digits)) return null
    path.push(Number.parseInt(digits, 16))
  }
  return path
}

/** Whether a place is somewhere in the universe. */
export function placeExists(path: Path): boolean {
  if (path.length === 0) return true
  const [g, s, w] = path
  if (g === undefined || g < 0 || !(g < galaxyCount() || isHole(g))) return false
  if (s === undefined) return true
  if (isHole(g) || s >= getGalaxy(g).stars.length) return false
  if (w === undefined) return true
  return w < getSystem(g, s).planets.length
}

/** What a place is called. */
export function placeName(path: Path): string {
  if (path.length === 0) return 'between the galaxies'
  const [g, s, w] = path as [number, number?, number?]
  if (isHole(g)) return getUniverse().hole.name
  if (s === undefined) return getGalaxyLook(g).name
  if (w === undefined) return getGalaxy(g).stars[s]!.star.name
  return getSystem(g, s).planets[w]!.name
}

/** What the station hears from a people, by what became of them. */
const CARRIER: Record<CivilizationState, string> = {
  thriving: 'voices',
  fading: 'voices, fewer than before',
  transcended: 'one held note',
  gone: 'silence',
}

const row = (label: string, value: string) => `${label.padEnd(12)}${value}`

/** Listen to where the visitor is. */
export function scan(path: Path): string[] {
  const lines = ['Scanning…']
  const here = path.length === 0 ? '' : `${coordinates(path)}  `
  lines.push(row('position', `${here}${placeName(path)}`))
  if (path.length === 0) {
    lines.push(row('galaxies', String(galaxyCount())))
    lines.push(row('sources', '1 periodic, faint, unresolved'))
    lines.push(row('gravity', `1 well, very deep, at ${coordinates([getUniverse().hole.index])}`))
    return lines
  }
  const [g, s, w] = path as [number, number?, number?]
  if (isHole(g)) {
    lines.push(row('gravity', 'everything here is falling'))
    return lines
  }
  if (s === undefined) {
    const galaxy = getGalaxy(g)
    let peoples = 0
    for (const star of galaxy.stars) {
      if (getSystem(g, star.index).planets.some((p) => p.civilization && p.civilization.state !== 'gone')) peoples++
    }
    lines.push(row('stars', String(galaxy.stars.length)))
    lines.push(row('carriers', `${peoples} of them, on the air`))
    return lines
  }
  const system = getSystem(g, s)
  if (w === undefined) {
    lines.push(row('worlds', String(system.planets.length)))
    for (const planet of system.planets) {
      const carrier = planet.civilization ? CARRIER[planet.civilization.state] : ''
      lines.push(`  ${coordinates([planet.index])}  ${planet.name.padEnd(10)}${planet.kind.padEnd(13)}${carrier}`.trimEnd())
    }
    return lines
  }
  const planet = system.planets[w]!
  lines.push(row('air', planet.preset.atmosphere ? 'yes' : 'none'))
  lines.push(row('carrier', planet.civilization ? CARRIER[planet.civilization.state] : 'nothing'))
  return lines
}

/** A file by path (`readme`, `./.keeper`, `logs/4111.log`), or the logs directory itself. */
function find(name: string): StationFile | 'directory' | null {
  const clean = name.replace(/^\.\//, '').replace(/^\//, '')
  if (clean === STATION_LOGS.name || clean === `${STATION_LOGS.name}/`) return 'directory'
  const top = STATION_FILES.find((f) => f.name === clean)
  if (top) return top
  const prefix = `${STATION_LOGS.name}/`
  if (!clean.startsWith(prefix)) return null
  return STATION_LOGS.files.find((f) => f.name === clean.slice(prefix.length)) ?? null
}

function list(args: readonly string[]): string[] {
  const all = args.includes('-a') || args.includes('-la') || args.includes('-al')
  const target = args.find((a) => !a.startsWith('-'))
  if (target !== undefined) {
    const found = find(target)
    if (found === 'directory') return [STATION_LOGS.files.map((f) => f.name).join('  ')]
    if (found) return [target]
    return [`ls: ${target}: no such file or directory`]
  }
  const names = STATION_FILES.filter((f) => all || !f.name.startsWith('.'))
    .map((f) => f.name)
    .sort()
  return [[...(all ? ['.', '..'] : []), ...names, `${STATION_LOGS.name}/`].join('  ')]
}

function show(args: readonly string[]): string[] {
  if (args.length === 0) return ['cat: which file?']
  const lines: string[] = []
  for (const name of args) {
    const found = find(name)
    if (found === 'directory') lines.push(`cat: ${name}: is a directory`)
    else if (found) lines.push(...found.lines)
    else lines.push(`cat: ${name}: no such file`)
  }
  return lines
}

function go(args: readonly string[], here: Path): Reply {
  if (args.length === 0) return { lines: ['goto: where? Galaxy, star and world, in sixteens: goto 00 00 03'] }
  const path = parsePlace(args.join(' '))
  if (!path || !placeExists(path)) return { lines: ['goto: there is no such place. The station counts in sixteens.'] }
  if (path.length === here.length && path.every((v, i) => v === here[i])) return { lines: ['goto: you are already there.'] }
  return { lines: [`Setting a course for ${coordinates(path)}, ${placeName(path)}.`], effect: { kind: 'goto', path } }
}

/** Run one line typed at the station, from where the visitor is. */
export function runCommand(input: string, here: Path): Reply {
  const [command = '', ...args] = input.trim().split(/\s+/)
  switch (command.toLowerCase()) {
    case '':
      return { lines: [] }
    case 'help':
    case '?':
      return { lines: HELP }
    case 'ls':
      return { lines: list(args) }
    case 'cat':
      return { lines: show(args) }
    case 'whoami':
      return { lines: ['A visitor. The first since the keepers went home.'] }
    case 'scan':
      return { lines: scan(here) }
    case 'goto':
      return go(args, here)
    case 'clear':
      return { lines: [], effect: { kind: 'clear' } }
    case 'exit':
    case 'quit':
    case 'logout':
      return { lines: [], effect: { kind: 'close' } }
    case 'listen':
      return { lines: ['The station is already listening.'] }
    case 'cd':
      return { lines: ['cd: the station has only the one room.'] }
    case 'sudo':
      return { lines: ['There is no one here to ask.'] }
    default:
      return { lines: [`${command}: not something the station understands. Try help.`] }
  }
}
