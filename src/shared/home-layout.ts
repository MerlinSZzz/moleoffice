// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S LAYOUT. Home has parts: the key items, Needs you, Agents at work, Schedule, and the figures drawn by the picture
 * parts. A layout puts each of them once in one of four places: a band across the whole width, the first column, the
 * second column, or hidden. Each place is an ordered list of parts, and an empty place takes no space. A hidden part is
 * not drawn and not read, and the person shows it again from the list of hidden parts. The layout also keeps which
 * projects Home shows: every project together, or one project.
 *
 * The door that keeps a person's layout and the page that draws it both read this file, so the shapes, the check of a
 * stored layout, the reading of an older kept layout and every move are written here once.
 */
import { EVERY_PROJECT, type ProjectChoice } from './across-projects.ts'

/**
 * THE FIGURES HOME CAN DRAW, each through one of the picture parts (src/web/components/home/HomeFigures.tsx). His three
 * numbers come first: his open checklist items, the forks he settled and the time a fork waited on him.
 */
export const HOME_FIGURES = [
  'myChecklist', 'myDecisions', 'myDecisionTime', 'packagesByLine', 'packagesDone', 'timeToLive', 'suiteMinutes',
] as const
export type HomeFigure = (typeof HOME_FIGURES)[number]

export const HOME_PARTS = ['keyItems', 'needs', 'agents', 'schedule', ...HOME_FIGURES] as const
export type HomePart = (typeof HOME_PARTS)[number]

/** The places Home draws, in the order they stand on a narrow screen. */
export const HOME_DRAWN_PLACES = ['band', 'first', 'second'] as const
export type HomeDrawnPlace = (typeof HOME_DRAWN_PLACES)[number]
export const HOME_PLACES = [...HOME_DRAWN_PLACES, 'hidden'] as const
export type HomePlace = (typeof HOME_PLACES)[number]

export interface HomeLayout {
  band: readonly HomePart[]
  first: readonly HomePart[]
  second: readonly HomePart[]
  hidden: readonly HomePart[]
  /** Which projects Home shows: every project together, or one project by its id. */
  project: ProjectChoice
}

/** The figures Home hides until the person shows them, so the first view asks for few reads. */
const HIDDEN_AT_FIRST: readonly HomePart[] = ['packagesByLine', 'packagesDone', 'timeToLive', 'suiteMinutes']

/**
 * The three pictures: one column, two columns, and a band above two columns. With nothing kept, Home draws A, for every
 * project. The key items stand first, and his three numbers are drawn; the other figures are hidden.
 */
export const HOME_LAYOUT_A: HomeLayout = {
  band: [], first: ['keyItems', 'needs', 'agents', 'schedule', 'myChecklist', 'myDecisions', 'myDecisionTime'], second: [],
  hidden: HIDDEN_AT_FIRST, project: EVERY_PROJECT,
}
export const HOME_LAYOUT_B: HomeLayout = {
  band: [], first: ['keyItems', 'needs', 'myChecklist', 'myDecisions', 'myDecisionTime'], second: ['agents', 'schedule'],
  hidden: HIDDEN_AT_FIRST, project: EVERY_PROJECT,
}
export const HOME_LAYOUT_C: HomeLayout = {
  band: ['agents'], first: ['keyItems', 'needs', 'myChecklist', 'myDecisions', 'myDecisionTime'], second: ['schedule'],
  hidden: HIDDEN_AT_FIRST, project: EVERY_PROJECT,
}

/** Each person's layout is one runtime setting row of its own, named for that person. */
export function homeLayoutSettingName(personId: string): string {
  return `home.layout:${personId}`
}

export const THE_KEPT_LAYOUT_IS_NOT_JSON = 'The kept Home layout is not readable JSON.'
const PLACE_NAMES: Record<HomePlace, string> = { band: 'band', first: 'first column', second: 'second column', hidden: 'hidden list' }
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const KEYS = [...HOME_PLACES, 'project'] as const

/** The problems with the places and the project a value holds, leaving out a place or the project that is not there. */
function problemsWithWhatIsThere(value: Record<string, unknown>): string[] {
  const unknown = Object.keys(value).filter(key => !(KEYS as readonly string[]).includes(key))
  if (unknown.length > 0) return [`A Home layout holds a band, a first column, a second column, a hidden list and a project, and nothing else. It holds ${unknown.map(key => JSON.stringify(key)).join(', ')}.`]
  const problems: string[] = []
  const counts = new Map<HomePart, number>()
  for (const place of HOME_PLACES) {
    if (!(place in value)) continue
    const parts = value[place]
    if (!Array.isArray(parts)) {
      problems.push(`The ${PLACE_NAMES[place]} of a Home layout is a list of parts.`)
      continue
    }
    for (const part of parts) {
      if (typeof part !== 'string' || !(HOME_PARTS as readonly string[]).includes(part)) {
        problems.push(`${JSON.stringify(part)} is not a part of Home. Its parts are ${HOME_PARTS.map(one => `"${one}"`).join(', ')}.`)
      } else counts.set(part as HomePart, (counts.get(part as HomePart) ?? 0) + 1)
    }
  }
  if ('project' in value && (typeof value['project'] !== 'string' || value['project'].trim() === '')) {
    problems.push(`The project of a Home layout is "${EVERY_PROJECT}" for every project, or the id of one project.`)
  }
  for (const [part, placed] of counts) if (placed > 1) problems.push(`"${part}" is placed ${String(placed)} times. Each part of Home is placed once.`)
  return problems
}

/** The door checks a layout with this before it keeps one: every place and the project are there, and every part once. */
export function problemsWithTheHomeLayout(value: unknown): string[] {
  if (!isObject(value)) return ['A Home layout is an object with a band, a first column, a second column and a hidden list, each a list of parts, and a project.']
  const missing = KEYS.filter(key => !(key in value))
  if (missing.length > 0) return [`A Home layout holds a band, a first column, a second column, a hidden list and a project. This one has no ${missing.map(key => PLACE_NAMES[key as HomePlace] ?? key).join(', ')}.`]
  const problems = problemsWithWhatIsThere(value)
  if (problems.length > 0) return problems
  const placed = new Set(HOME_PLACES.flatMap(place => value[place] as HomePart[]))
  return HOME_PARTS.filter(part => !placed.has(part)).map(part => `"${part}" is left out. Each part of Home is placed once.`)
}

/** What Home made of a kept layout: the layout it draws, the parts it put in their first places, and any problem. */
export interface AKeptLayoutReadIn {
  layout: HomeLayout
  /** The parts the kept layout did not hold, each put where layout A puts it. Empty when it held every part. */
  filledIn: HomePart[]
  /** Why the kept layout could not be read. When there is one, the layout is A. */
  problems: string[]
}

/**
 * READS A KEPT LAYOUT INTO TODAY'S SHAPE. A layout kept before Home had a hidden list, a project or some of its parts
 * still reads: each part it holds stays where it is, each part it does not hold goes to the end of the place A puts it,
 * and the project is every project. Nothing it holds is lost. Only a value that is not a layout, a part Home does not
 * have, or a part placed twice cannot be read, and then Home draws A and says why.
 */
export function theHomeLayoutReadIn(value: unknown): AKeptLayoutReadIn {
  const problems = isObject(value)
    ? (HOME_DRAWN_PLACES.some(place => !(place in value)) ? ['A kept Home layout holds at least a band, a first column and a second column.'] : problemsWithWhatIsThere(value))
    : ['A kept Home layout is an object.']
  if (problems.length > 0 || !isObject(value)) return { layout: HOME_LAYOUT_A, filledIn: [], problems }
  const listed = (place: HomePlace): HomePart[] => (Array.isArray(value[place]) ? [...value[place] as HomePart[]] : [])
  const layout = {
    band: listed('band'), first: listed('first'), second: listed('second'), hidden: listed('hidden'),
    project: typeof value['project'] === 'string' ? value['project'] : EVERY_PROJECT,
  }
  const placed = new Set(HOME_PLACES.flatMap(place => layout[place]))
  const filledIn = HOME_PARTS.filter(part => !placed.has(part))
  for (const part of filledIn) layout[placeOf(HOME_LAYOUT_A, part)].push(part)
  return { layout, filledIn, problems: [] }
}

/** The place that holds a part. A layout that holds the part nowhere is a broken assumption, and this throws. */
export function placeOf(layout: HomeLayout, part: HomePart): HomePlace {
  const place = HOME_PLACES.find(one => layout[one].includes(part))
  if (place === undefined) throw new Error(`The Home layout holds no "${part}".`)
  return place
}

/** The three places Home draws, without the hidden list and the project. */
export function drawnPlaces(layout: HomeLayout): Record<HomeDrawnPlace, readonly HomePart[]> {
  return { band: layout.band, first: layout.first, second: layout.second }
}

/** On a narrow screen the places stand one under another: the band, then the first column, then the second. */
export function stackedOrder(layout: HomeLayout): HomePart[] {
  return [...layout.band, ...layout.first, ...layout.second]
}

/**
 * Takes a part out of where it is and puts it in a place at a position. The position counts the place's other parts,
 * so 0 is first and anything past the end is last. The layout handed in is left as it was.
 */
export function movePart(layout: HomeLayout, part: HomePart, place: HomePlace, position: number): HomeLayout {
  const without = (parts: readonly HomePart[]) => parts.filter(one => one !== part)
  const moved: HomeLayout = { ...layout, band: without(layout.band), first: without(layout.first), second: without(layout.second), hidden: without(layout.hidden) }
  const target = [...moved[place]]
  target.splice(Math.max(0, Math.min(position, target.length)), 0, part)
  return { ...moved, [place]: target }
}

/** The moves a part's small menu offers: up and down within its place, to each other place, and hidden. */
export type HomeMenuMove = 'up' | 'down' | HomePlace

/**
 * Only the moves that change something are offered. A drawn part moves up, down, to the other drawn places, or to
 * hidden; a hidden part is shown in one of the three drawn places.
 */
export function menuMovesFor(layout: HomeLayout, part: HomePart): HomeMenuMove[] {
  const place = placeOf(layout, part)
  if (place === 'hidden') return [...HOME_DRAWN_PLACES]
  const index = layout[place].indexOf(part)
  const moves: HomeMenuMove[] = []
  if (index > 0) moves.push('up')
  if (index < layout[place].length - 1) moves.push('down')
  for (const other of HOME_PLACES) if (other !== place) moves.push(other)
  return moves
}

/** Up and down swap a part with its neighbour. A move to another place puts the part last there. */
export function applyMenuMove(layout: HomeLayout, part: HomePart, move: HomeMenuMove): HomeLayout {
  const place = placeOf(layout, part)
  const index = layout[place].indexOf(part)
  if (move === 'up') return movePart(layout, part, place, index - 1)
  if (move === 'down') return movePart(layout, part, place, index + 1)
  return movePart(layout, part, move, Number.POSITIVE_INFINITY)
}

/** The same layout showing every project, or one project. The places are left as they were. */
export function chooseTheProject(layout: HomeLayout, project: ProjectChoice): HomeLayout {
  return { ...layout, project }
}
