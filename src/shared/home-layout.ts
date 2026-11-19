// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME'S LAYOUT. Home has three parts, and a layout puts each of them once in one of three places: a band across
 * the whole width, the first column or the second. Each place is an ordered list of parts, and an empty place takes
 * no space. The door that keeps a person's layout and the page that draws it both read this file, so the shapes, the
 * check of a stored layout and every move are written here once.
 */
export const HOME_PARTS = ['needs', 'agents', 'schedule'] as const
export type HomePart = (typeof HOME_PARTS)[number]
export const HOME_PLACES = ['band', 'first', 'second'] as const
export type HomePlace = (typeof HOME_PLACES)[number]
export interface HomeLayout { band: readonly HomePart[]; first: readonly HomePart[]; second: readonly HomePart[] }

/** The three pictures: one column, two columns, and a band above two columns. With nothing kept, Home draws A. */
export const HOME_LAYOUT_A: HomeLayout = { band: [], first: ['needs', 'agents', 'schedule'], second: [] }
export const HOME_LAYOUT_B: HomeLayout = { band: [], first: ['needs'], second: ['agents', 'schedule'] }
export const HOME_LAYOUT_C: HomeLayout = { band: ['agents'], first: ['needs'], second: ['schedule'] }

/** Each person's layout is one runtime setting row of its own, named for that person. */
export function homeLayoutSettingName(personId: string): string {
  return `home.layout:${personId}`
}

export const THE_KEPT_LAYOUT_IS_NOT_JSON = 'The kept Home layout is not readable JSON.'
const PLACE_NAMES: Record<HomePlace, string> = { band: 'band', first: 'first column', second: 'second column' }
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The door checks a layout with this before it keeps one, and again when it reads a kept one back. */
export function problemsWithTheHomeLayout(value: unknown): string[] {
  if (!isObject(value)) return ['A Home layout is an object with a band, a first column and a second column, each a list of parts.']
  const keys = Object.keys(value)
  if (keys.length !== HOME_PLACES.length || HOME_PLACES.some(place => !keys.includes(place))) {
    return ['A Home layout holds a band, a first column and a second column, and nothing else.']
  }
  const problems: string[] = []
  const counts = new Map<HomePart, number>()
  for (const place of HOME_PLACES) {
    const parts = value[place]
    if (!Array.isArray(parts)) {
      problems.push(`The ${PLACE_NAMES[place]} of a Home layout is a list of parts.`)
      continue
    }
    for (const part of parts) {
      if (typeof part !== 'string' || !(HOME_PARTS as readonly string[]).includes(part)) {
        problems.push(`${JSON.stringify(part)} is not a part of Home. Its parts are "needs", "agents" and "schedule".`)
      } else counts.set(part as HomePart, (counts.get(part as HomePart) ?? 0) + 1)
    }
  }
  if (problems.length > 0) return problems
  for (const part of HOME_PARTS) {
    const placed = counts.get(part) ?? 0
    if (placed === 0) problems.push(`"${part}" is left out. Each part of Home is placed once.`)
    if (placed > 1) problems.push(`"${part}" is placed ${String(placed)} times. Each part of Home is placed once.`)
  }
  return problems
}

/** The place that holds a part. A layout that holds the part nowhere is a broken assumption, and this throws. */
export function placeOf(layout: HomeLayout, part: HomePart): HomePlace {
  const place = HOME_PLACES.find(one => layout[one].includes(part))
  if (place === undefined) throw new Error(`The Home layout holds no "${part}".`)
  return place
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
  const moved: HomeLayout = { band: without(layout.band), first: without(layout.first), second: without(layout.second) }
  const target = [...moved[place]]
  target.splice(Math.max(0, Math.min(position, target.length)), 0, part)
  return { ...moved, [place]: target }
}

/** The moves a part's small menu offers: up and down within its place, and to each other place. */
export type HomeMenuMove = 'up' | 'down' | HomePlace

/** Only the moves that change something are offered. */
export function menuMovesFor(layout: HomeLayout, part: HomePart): HomeMenuMove[] {
  const place = placeOf(layout, part)
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
