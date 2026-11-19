// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUTE IN THE PIXEL OFFICE REACHES A SINGLE DESK, AND SAYS SO WHEN IT ONLY STOPPED. Wave 13k round 43, piece 5,
 * from problem zFK7SO7Io1jz.
 *
 * Wave 13y found the high-rise route region-94 → region-100 unreachable on a migrated office copy: "No path avoids
 * the recorded furniture, walls and tree trunks." The search in src/shared/forest-map.ts had two faults, and the
 * map had no gap:
 *   1. the recipient's own stool counted as an obstacle. The single desks the high-rise and the woodland use face
 *      south-west and put the stool across the talk point, so a route to such a desk could never end;
 *   2. a search that used up its budget of turns returned the same null as one that tried every point, so
 *      "the search stopped" was reported as "there is no path".
 *
 * WHAT THIS FILE PROVES, on a synthetic high-rise office built the way the server builds one:
 *   1. a route to a seat at a south-west single desk, whose talk point is blocked by that seat's own stool,
 *      is found;
 *   2. a search cut short by its budget says it stopped, and does not say there is no path;
 *   3. a sender walled in on every side still gets "No path".
 *
 * MUTATIONS, after a control run (the commit that added this file names the logs):
 *   m1. in `routeForestMessage`, free only the sender's stool again (`free = [from.stationId]`): case 1 goes red.
 *   m2. in `search`, return null when the budget runs out (`return null`): case 2 goes red.
 *
 * Everything here is made up: the roster, the seed and the walls.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { C_NEW_ENVIRONMENTS, C_WOODLAND_ADOPTED_DEFINITION, cEnvironmentUrls, readCEnvironmentCatalog } from '../src/shared/c-environments.ts'
import {
  C_FOREST_ACTION_MIRRORS_URL,
  C_FOREST_LOOK_URLS,
  C_FOREST_SHARED_PROPS_URL,
  readCForestOfficeCatalog,
  readCForestOfficeProps,
  readCForestSurfaceCatalog,
} from '../src/shared/c-forest.ts'
import {
  forestMapLayout,
  forestPointIsClear,
  reconcileForestMap,
  routeForestMessage,
  type ForestMapLayout,
  type ForestMapSettings,
  type ForestObstacle,
  type ForestOccupant,
} from '../src/shared/forest-map.ts'

const read = (path: string): unknown => JSON.parse(readFileSync('public' + path, 'utf8'))
const characters = readCForestOfficeCatalog(
  read('/office-map/c-forest/sprites.json') as never,
  C_FOREST_LOOK_URLS.map(({ url }) => read(url)) as never,
  read(C_FOREST_ACTION_MIRRORS_URL) as never,
)
const props = readCForestOfficeProps(read('/office-map/c-forest/props.json') as never, read(C_FOREST_SHARED_PROPS_URL) as never, characters.sprites, characters)

function environments() {
  const all: Record<string, unknown> = {}
  for (const scene of ['woodland', ...C_NEW_ENVIRONMENTS] as const) {
    const root = scene === 'woodland' ? 'c-forest' : 'c-environments/' + scene
    const file = (name: string) => read(`/office-map/${root}/${name}`)
    all[scene] = readCEnvironmentCatalog(
      scene,
      (scene === 'woodland' ? C_WOODLAND_ADOPTED_DEFINITION : file('environment.json')) as never,
      (scene === 'woodland' ? props : file('props.json')) as never,
      (scene === 'woodland' ? file('terrain.json') : null) as never,
      props,
      readCForestSurfaceCatalog(read(cEnvironmentUrls(scene).surface) as never, scene),
    )
  }
  return all
}

const roster: ForestOccupant[] = Array.from({ length: 24 }, (_, i) => ({
  id: `synthetic-${String(i).padStart(3, '0')}`,
  name: `Synthetic ${i}`,
  createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}`,
  zone: i === 0 ? 'secretary' : 'team',
  team: `synthetic-team-${i % 8}`,
  projects: [],
  cLook: 'bare',
  cScale: 0.86,
}))
const settings: ForestMapSettings = { seed: 'synthetic-highrise-43', grouping: 'shared', scene: 'high-rise', workspaceScenes: {}, zh: false, decorations: 'normal' }
const layout: ForestMapLayout = forestMapLayout(reconcileForestMap(null, roster, settings), roster, settings, {
  props,
  bodyRadius: 48,
  environments: environments() as never,
})

/** Seats whose talk point only their own stool blocks: the case the search could never finish. */
const blockedByOwnStool = Object.entries(layout.seats).filter(
  ([, seat]) => !forestPointIsClear(layout, seat.talk) && forestPointIsClear(layout, seat.talk, seat.stationId),
)

describe('a route in the pixel office', () => {
  it('reaches a single desk whose own stool stands across its talk point', () => {
    expect(blockedByOwnStool.length, 'the office has such a seat; the case is real').toBeGreaterThan(0)
    const [recipient] = blockedByOwnStool[0]!
    const sender = Object.keys(layout.seats).find((id) => id !== recipient)!
    const route = routeForestMessage(layout, sender, recipient)
    expect(route.reason).toBeNull()
    expect(route.reachable).toBe(true)
    expect(route.points.at(-1)).toEqual(layout.seats[recipient]!.talk)
  }, 60_000)

  it('says it stopped when its budget runs out, not that there is no path', () => {
    const [recipient] = blockedByOwnStool[0]!
    const sender = Object.keys(layout.seats).find((id) => id !== recipient)!
    const route = routeForestMessage(layout, sender, recipient, 5)
    expect(route.reachable).toBe(false)
    expect(route.reason).toBe('The route search stopped after 5 steps without reaching the recipient, so whether a path exists is unknown.')
  }, 60_000)

  // THE SENDER IS WALLED IN, not the recipient, so the search empties its queue inside the small box at once.
  // Walling in the recipient would make it try the whole office first and stop on its budget, which is case 2.
  it('still says there is no path when the sender is walled in on every side', () => {
    const [recipient] = blockedByOwnStool[0]!
    const sender = Object.keys(layout.seats).find((id) => id !== recipient)!
    const at = layout.seats[sender]!.foot
    const wall = (x: number, y: number, width: number, height: number, side: string): ForestObstacle => ({ id: `synthetic-wall-${side}`, kind: 'wall', x, y, width, height })
    const walled: ForestMapLayout = {
      ...layout,
      obstacles: [
        ...layout.obstacles,
        wall(at.x - 200, at.y - 200, 400, 20, 'north'),
        wall(at.x - 200, at.y + 180, 400, 20, 'south'),
        wall(at.x - 200, at.y - 200, 20, 400, 'west'),
        wall(at.x + 180, at.y - 200, 20, 400, 'east'),
      ],
    }
    const route = routeForestMessage(walled, sender, recipient)
    expect(route.reachable).toBe(false)
    expect(route.reason).toMatch(/^No path avoids/)
  }, 120_000)
})
