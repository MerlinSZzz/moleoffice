// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S PAST RAIL WHEN EVENTS SHARE A MOMENT.
 *
 * WHAT THIS CLAIMS, against a real server and a real browser in a fresh workspace:
 *   - a revision and two stopping points stored at the same wall-clock time are drawn as three separate marks,
 *     with no two marks touching, at 1440, 990, 660 and 390 pixels and in light and dark;
 *   - events a second apart, and events just past the space the rail keeps between marks, are equally separate;
 *   - a three-digit revision number and stopping-point targets at both ends of the narrowest rail keep their
 *     distance from each other and from the lane's edge;
 *   - each stopping point's diamond is a link with its own 24 by 24 pixel target, nothing else is drawn over it,
 *     and pressing it opens that stopping point's record;
 *   - every mark still carries its stored time in data-at, its stored sequence and its full accessible name, and
 *     the marks stay in stored-time order;
 *   - a lane with one event still draws that event at the start of the rail and explains it in one line.
 *
 * MADE-UP DATA ONLY. Four modules. The first has two revisions and two stopping points, and the test writes the
 * revisions and the stopping points' created times to one exact minute. The second has two revisions one second
 * apart and a third months later. The third places a long revision number and three stopping points on one rail,
 * with the stopping points at both ends and just past the rail's spacing. The fourth has one revision at another
 * exact time. Nothing is written to the live office: every request goes to the test's own server, on its own
 * database in its own temporary folder.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { deleteTheCopiedDefaultChapters, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { parseLocalStamp } from '../src/shared/time.ts'
import {
  PROJECT_GRAPH_LEVELS,
  type ProjectGraphLevel,
  type ProjectGraphReply,
} from '../src/shared/project-graph.ts'
import { buildProjectGraph, marksAtLevel } from '../src/web/components/graph/project-graph-model.ts'
import { recordPath } from '../src/web/components/router.tsx'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const MODULE_CLUSTER = 'Test coincident rail module'
const MODULE_NEAR = 'Test near rail module'
const MODULE_EDGE = 'Test edge rail module'
const MODULE_LONE = 'Test lone rail module'
const CHECKPOINT_ONE = 'Test stop at the same moment'
const CHECKPOINT_TWO = 'Test other stop at the same moment'
const EDGE_LEFT = 'Test stop at the left end'
const EDGE_NEAR = 'Test stop just past the gap'
const EDGE_RIGHT = 'Test stop at the right end'
const CLUSTER_STAMP = '2026-09-01 10:00:00'
const NEAR_FIRST = '2026-09-01 10:00:00'
const NEAR_SECOND = '2026-09-01 10:00:01'
const NEAR_FAR = '2026-12-01 00:00:00'
const LONE_STAMP = '2026-09-02 12:00:00'
// TEN THOUSAND SECONDS FROM LEFT TO RIGHT: 8.5 percent is 850 seconds, 17 percent is 1,700 seconds.
const EDGE_LEFT_STAMP = '2026-09-01 10:00:00'
const EDGE_NEAR_STAMP = '2026-09-01 10:14:10'
const EDGE_REVISION_STAMP = '2026-09-01 10:28:20'
const EDGE_RIGHT_STAMP = '2026-09-01 12:46:40'
const EDGE_LONG_SEQ = 123
const CHECKPOINT_DOING = 'Test move the made-up arm.'
const CHECKPOINT_NEXT = 'Test check the made-up clamp.'

const shots = testShots('project-graph-coincident')

async function call<T>(api: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: AS_THE_PERSON,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`${method} ${path} answered ${String(response.status)}: ${await response.text()}`)
  return (await response.json()) as T
}

interface Made {
  id: string
}

async function make(api: string, kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await call<{ record: Made }>(api, 'POST', '/api/records', { kind, title, data })
  return reply.record.id
}

async function link(api: string, fromId: string, toId: string, type: string): Promise<void> {
  await call(api, 'POST', '/api/links', { fromId, toId, type })
}

async function graphOf(api: string): Promise<ProjectGraphReply> {
  return call<ProjectGraphReply>(api, 'GET', '/api/project-graph')
}

interface DrawnMark {
  mark: 'revision' | 'checkpoint'
  at: string | null
  title: string | null
  seq: string | null
  row: string | null
  left: number
  top: number
  width: number
  height: number
  ink: { left: number; top: number; width: number; height: number }
}

interface DrawnTarget {
  title: string | null
  width: number
  height: number
  hitsItself: boolean
  over: string
  markIndex: number
  left: number
  top: number
  right: number
  bottom: number
  insideLane: boolean
  insideWindow: boolean
}

interface RailReading {
  marks: DrawnMark[]
  overlappingInk: number[][]
  checkpointTargets: DrawnTarget[]
  overlappingTargets: number[][]
  targetInkOverlaps: number[][]
  minimumTargetClearance: number
  railHeight: number
  documentWidth: number
  windowWidth: number
}

/** The first element of the page whose text holds a made-up title, so a lane is found by what the reader sees. */
function laneFor(page: Page, title: string) {
  return page.locator('.gph-lane').filter({ has: page.getByRole('link', { name: title, exact: true }) }).first()
}

async function readRail(page: Page, title: string): Promise<RailReading> {
  const lane = laneFor(page, title)
  // THE HIT TEST NEEDS THE MARKS ON SCREEN. A page opened at 390 may put the rail below the first window;
  // scrolling to it is what a reader does, and it changes no mark, time or name.
  await lane.locator('.gph-past-rail').scrollIntoViewIfNeeded()
  return lane.locator('.gph-past-rail').evaluate((rail) => {
    const nodes = [...rail.querySelectorAll(':scope > [data-mark="revision"], :scope > [data-mark="checkpoint"]')]
    const rectanglesOverlap = (
      one: { left: number; top: number; width: number; height: number },
      other: { left: number; top: number; width: number; height: number },
    ): boolean =>
      Math.min(one.left + one.width, other.left + other.width) > Math.max(one.left, other.left) &&
      Math.min(one.top + one.height, other.top + other.height) > Math.max(one.top, other.top)
    const box = (element: Element): { left: number; top: number; width: number; height: number } => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }
    const marks = nodes.map((node) => {
      const labelled = node.querySelector('a') ?? node
      const ink = node.matches('[data-mark="checkpoint"]') ? (node.querySelector('.gph-diamond') ?? node) : node
      return {
        mark: node.getAttribute('data-mark') === 'checkpoint' ? ('checkpoint' as const) : ('revision' as const),
        at: node.getAttribute('data-at'),
        title: labelled.getAttribute('title'),
        seq: node.querySelector('.gph-rail-seq')?.textContent ?? null,
        row: node.getAttribute('data-rail-row'),
        ...box(node),
        ink: box(ink),
      }
    })
    const overlappingInk: number[][] = []
    for (let one = 0; one < marks.length; one += 1) {
      for (let other = one + 1; other < marks.length; other += 1) {
        const first = marks[one]
        const second = marks[other]
        if (first !== undefined && second !== undefined && rectanglesOverlap(first.ink, second.ink)) {
          overlappingInk.push([one, other])
        }
      }
    }
    const railRect = rail.getBoundingClientRect()
    const laneRect = rail.closest('.gph-lane')?.getBoundingClientRect() ?? railRect
    const checkpointTargets = nodes.flatMap((node, index) => {
      if (!node.matches('[data-mark="checkpoint"]')) return []
      const link = node.matches('a') ? node : (node.querySelector('a') ?? node)
      const rect = link.getBoundingClientRect()
      const atTheMiddle = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return [
        {
          title: link.getAttribute('title'),
          width: rect.width,
          height: rect.height,
          hitsItself: atTheMiddle !== null && (atTheMiddle === link || link.contains(atTheMiddle)),
          over:
            atTheMiddle === null
              ? 'nothing'
              : `${atTheMiddle.tagName.toLowerCase()}.${atTheMiddle.getAttribute('class') ?? ''} ${
                  atTheMiddle === link ? '(itself)' : link.contains(atTheMiddle) ? '(inside)' : '(other)'
                }`,
          markIndex: index,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          insideLane:
            rect.left >= laneRect.left - 1 &&
            rect.right <= laneRect.right + 1 &&
            rect.top >= laneRect.top - 1 &&
            rect.bottom <= laneRect.bottom + 1,
          insideWindow: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
        },
      ]
    })
    const asEdges = (rect: {
      left: number
      top: number
      right?: number
      bottom?: number
      width?: number
      height?: number
    }): { left: number; top: number; right: number; bottom: number } => ({
      left: rect.left,
      top: rect.top,
      right: rect.right ?? rect.left + (rect.width ?? 0),
      bottom: rect.bottom ?? rect.top + (rect.height ?? 0),
    })
    const edgesOverlap = (
      one: { left: number; top: number; right: number; bottom: number },
      other: { left: number; top: number; right: number; bottom: number },
    ): boolean => one.left < other.right && one.right > other.left && one.top < other.bottom && one.bottom > other.top
    const spread = (
      one: { left: number; top: number; right: number; bottom: number },
      other: { left: number; top: number; right: number; bottom: number },
    ): number => {
      const horizontal = Math.max(one.left - other.right, other.left - one.right)
      const vertical = Math.max(one.top - other.bottom, other.top - one.bottom)
      if (horizontal >= 0 && vertical >= 0) return Math.hypot(horizontal, vertical)
      return Math.max(0, horizontal, vertical)
    }
    const overlappingTargets: number[][] = []
    const targetInkOverlaps: number[][] = []
    let minimumTargetClearance = Number.POSITIVE_INFINITY
    for (let one = 0; one < checkpointTargets.length; one += 1) {
      const target = checkpointTargets[one]
      if (target === undefined) continue
      for (let other = one + 1; other < checkpointTargets.length; other += 1) {
        const beside = checkpointTargets[other]
        if (beside === undefined) continue
        if (edgesOverlap(asEdges(target), asEdges(beside))) overlappingTargets.push([one, other])
        minimumTargetClearance = Math.min(minimumTargetClearance, spread(asEdges(target), asEdges(beside)))
      }
      for (let markIndex = 0; markIndex < marks.length; markIndex += 1) {
        if (markIndex === target.markIndex) continue
        const ink = marks[markIndex]?.ink
        if (ink === undefined) continue
        if (edgesOverlap(asEdges(target), asEdges(ink))) targetInkOverlaps.push([one, markIndex])
        minimumTargetClearance = Math.min(minimumTargetClearance, spread(asEdges(target), asEdges(ink)))
      }
    }
    return {
      marks,
      overlappingInk,
      checkpointTargets,
      overlappingTargets,
      targetInkOverlaps,
      minimumTargetClearance,
      railHeight: railRect.height,
      documentWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    }
  })
}

async function chooseLevel(page: Page, level: ProjectGraphLevel): Promise<void> {
  await page.locator(`button[data-level="${level}"]`).click()
  await page.waitForFunction(
    (one) => document.querySelector('[data-graph-level]')?.getAttribute('data-graph-level') === one,
    level,
  )
}

async function openTheGraph(page: Page, site: string, theme: 'light' | 'dark'): Promise<void> {
  await page.goto(`${site}/?lang=en&look=${theme}#/project-graph`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-graph-level]').waitFor({ timeout: 30_000 })
  await chooseLevel(page, 'summaries')
  await laneFor(page, MODULE_CLUSTER).waitFor({ timeout: 30_000 })
}

let app: LiveApp
let page: Page
let graph: ProjectGraphReply
let checkpointOneId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'project-graph-coincident', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  await page.addInitScript(() => {
    const look = new URLSearchParams(location.search).get('look')
    if (look === 'light' || look === 'dark') localStorage.setItem('mole-office.preset.theme', look)
  })
  const api = app.api
  await deleteTheCopiedDefaultChapters(api)

  const clusterId = await make(api, 'module', MODULE_CLUSTER, {})
  const nearId = await make(api, 'module', MODULE_NEAR, {})
  const edgeId = await make(api, 'module', MODULE_EDGE, {})
  const loneId = await make(api, 'module', MODULE_LONE, {})
  // A second revision on the cluster module, so its rail holds two revisions as well as the two stopping points.
  await call(api, 'PATCH', `/api/records/${clusterId}`, { summary: 'Test summary stored on the coincident module.' })
  // TWO REVISIONS ONE SECOND APART, and a third months later, so the first two are within a pixel of each other on
  // every width even though their stored times are different.
  await call(api, 'PATCH', `/api/records/${nearId}`, { summary: 'Test summary stored on the near module.' })
  await call(api, 'PATCH', `/api/records/${nearId}`, { summary: 'Test summary rewritten on the near module.' })

  checkpointOneId = await make(api, 'stopping_point', CHECKPOINT_ONE, {
    doing: CHECKPOINT_DOING,
    next: CHECKPOINT_NEXT,
  })
  const checkpointTwoId = await make(api, 'stopping_point', CHECKPOINT_TWO, {
    doing: CHECKPOINT_DOING,
    next: CHECKPOINT_NEXT,
  })
  await link(api, checkpointOneId, clusterId, 'about')
  await link(api, checkpointTwoId, clusterId, 'about')

  const edgeLeftId = await make(api, 'stopping_point', EDGE_LEFT, {
    doing: CHECKPOINT_DOING,
    next: CHECKPOINT_NEXT,
  })
  const edgeNearId = await make(api, 'stopping_point', EDGE_NEAR, {
    doing: CHECKPOINT_DOING,
    next: CHECKPOINT_NEXT,
  })
  const edgeRightId = await make(api, 'stopping_point', EDGE_RIGHT, {
    doing: CHECKPOINT_DOING,
    next: CHECKPOINT_NEXT,
  })
  for (const id of [edgeLeftId, edgeNearId, edgeRightId]) await link(api, id, edgeId, 'about')

  // THE STORED TIMES ARE PLACED EXACTLY. The office stamps whole seconds, so four records made in one test would
  // collide only by luck. Writing the made-up store's own rows is what makes the collision happen every run.
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    const clusterIds = [clusterId, checkpointOneId, checkpointTwoId]
    const marks = clusterIds.map(() => '?').join(', ')
    database.prepare(`UPDATE revisions SET at = ? WHERE record_id IN (${marks})`).run(CLUSTER_STAMP, ...clusterIds)
    database.prepare('UPDATE revisions SET at = ? WHERE record_id = ?').run(LONE_STAMP, loneId)
    for (const [seq, at] of [
      [1, NEAR_FIRST],
      [2, NEAR_SECOND],
      [3, NEAR_FAR],
    ] as const) {
      database.prepare('UPDATE revisions SET at = ? WHERE record_id = ? AND seq = ?').run(at, nearId, seq)
    }
    for (const id of [checkpointOneId, checkpointTwoId]) {
      database.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(CLUSTER_STAMP, id)
    }
    database
      .prepare('UPDATE revisions SET seq = ?, at = ? WHERE record_id = ? AND seq = 1')
      .run(EDGE_LONG_SEQ, EDGE_REVISION_STAMP, edgeId)
    for (const [id, at] of [
      [edgeLeftId, EDGE_LEFT_STAMP],
      [edgeNearId, EDGE_NEAR_STAMP],
      [edgeRightId, EDGE_RIGHT_STAMP],
    ] as const) {
      database.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(at, id)
      database.prepare('UPDATE revisions SET at = ? WHERE record_id = ?').run(at, id)
    }
  } finally {
    database.close()
  }

  graph = await graphOf(api)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('the project graph when revisions and stopping points share a moment', () => {
  it('draws each coincident mark apart, keeps every stored time and name, and opens each checkpoint link', async () => {
    await openTheGraph(page, app.site, 'light')

    const model = buildProjectGraph(graph)
    const lane = model.lanes.find((one) => one.module.title === MODULE_CLUSTER)
    expect(lane, 'the made-up cluster module is one lane of the graph').toBeDefined()
    if (lane === undefined) return
    const loneLane = model.lanes.find((one) => one.module.title === MODULE_LONE)
    expect(loneLane, 'the made-up lone module is one lane of the graph').toBeDefined()
    if (loneLane === undefined) return
    const nearLane = model.lanes.find((one) => one.module.title === MODULE_NEAR)
    expect(nearLane, 'the made-up near module is one lane of the graph').toBeDefined()
    if (nearLane === undefined) return
    const edgeLane = model.lanes.find((one) => one.module.title === MODULE_EDGE)
    expect(edgeLane, 'the made-up edge module is one lane of the graph').toBeDefined()
    if (edgeLane === undefined) return

    const expectedLabels = [
      ...lane.revisions.entries.map(
        (entry) => `${t('projectGraph.revision')} ${String(entry.seq)}: ${entry.title} (${entry.at})`,
      ),
      ...lane.checkpoints.map(
        (checkpoint) => `${t('projectGraph.checkpoint')}: ${checkpoint.title} (${checkpoint.at})`,
      ),
    ]
    const expectedTimes = [
      ...lane.revisions.entries.map((entry) => entry.at),
      ...lane.checkpoints.map((checkpoint) => checkpoint.at),
    ]
    const reading = await readRail(page, MODULE_CLUSTER)

    expect(reading.marks.length, 'every revision and stopping point on the lane is drawn once').toBe(expectedLabels.length)
    expect(reading.marks.map((mark) => mark.at).sort(), 'every mark keeps its stored time').toEqual([...expectedTimes].sort())
    expect(
      reading.marks.map((mark) => mark.at).every((at) => at === CLUSTER_STAMP),
      'the made-up cluster really is stored at one moment',
    ).toBe(true)
    expect(
      reading.marks.map((mark) => mark.title).sort(),
      'every mark keeps the title that names its record and its stored time',
    ).toEqual([...expectedLabels].sort())
    const times = reading.marks.map((mark) => parseLocalStamp(mark.at ?? '') ?? 0)
    expect(times, 'the marks are drawn in stored-time order').toEqual([...times].sort((one, other) => one - other))
    expect(
      reading.marks.filter((mark) => mark.mark === 'checkpoint').map((mark) => mark.seq),
      'a stopping point carries no revision number',
    ).toEqual(reading.marks.filter((mark) => mark.mark === 'checkpoint').map(() => null))

    expect(
      reading.overlappingInk,
      `no two marks on the coincident rail may touch: ${JSON.stringify(reading.overlappingInk)}`,
    ).toEqual([])
    expect(reading.checkpointTargets.length, 'both stopping points are links on the rail').toBe(2)
    for (const target of reading.checkpointTargets) {
      expect(target.width, `${String(target.title)} is wide enough to press`).toBeGreaterThanOrEqual(24)
      expect(target.height, `${String(target.title)} is tall enough to press`).toBeGreaterThanOrEqual(24)
      expect(target.hitsItself, `${String(target.title)} is not covered by another mark: ${JSON.stringify(target)}`).toBe(true)
    }
    expect(
      new Set(reading.checkpointTargets.map((target) => `${String(target.width)}x${String(target.height)}`)).size,
      'both links have their own target',
    ).toBe(1)
    expect(reading.overlappingTargets, 'the stopping-point targets do not touch').toEqual([])
    expect(reading.targetInkOverlaps, 'no stopping-point target covers another mark').toEqual([])
    expect(
      reading.checkpointTargets.every((target) => target.insideLane && target.insideWindow),
      'no stopping-point target is clipped',
    ).toBe(true)
    expect(reading.documentWidth, 'the taller rail does not draw the page wider than the window').toBeLessThanOrEqual(
      reading.windowWidth,
    )

    // THE LONE EVENT: still at the start of its rail, still explained in one line built from its own stored words.
    const lone = laneFor(page, MODULE_LONE).locator('.gph-past-rail')
    expect(await lone.locator('[data-mark="revision"]').count(), 'the lone module draws its one revision').toBe(1)
    expect(await lone.locator('[data-mark="checkpoint"]').count(), 'the lone module draws no stopping point').toBe(0)
    const loneEntry = loneLane.revisions.entries[0]
    expect(loneEntry, 'the lone module has one stored revision').toBeDefined()
    if (loneEntry !== undefined) {
      expect(
        (await lone.locator('.gph-rail-single').textContent())?.trim(),
        'the lone event is explained in its own label and stored time',
      ).toBe(`${t('projectGraph.revision')} ${String(loneEntry.seq)}: ${loneEntry.title} · ${loneEntry.at}`)
    }

    // TWO REVISIONS ONE SECOND APART ARE TWO MARKS, not one drawn over the other.
    const nearReading = await readRail(page, MODULE_NEAR)
    expect(nearReading.marks.length, 'the near module draws its three revisions').toBe(nearLane.revisions.entries.length)
    expect(
      nearReading.marks.map((mark) => mark.at),
      'the near marks keep the stored order and the exact one-second gap',
    ).toEqual([NEAR_FIRST, NEAR_SECOND, NEAR_FAR])
    expect(nearReading.overlappingInk, 'the two nearly coincident revisions do not touch').toEqual([])
    expect(
      new Set(nearReading.marks.slice(0, 2).map((mark) => mark.row)).size,
      'the two nearly coincident revisions take different rows',
    ).toBe(2)

    // A LONG REVISION NUMBER NEXT TO STOPPING POINTS: no target covers another mark, no target is clipped,
    // and the left and right targets stay inside the lane at the widest page too.
    const edgeReading = await readRail(page, MODULE_EDGE)
    const expectedEdgeLabels = [
      ...edgeLane.revisions.entries.map(
        (entry) => `${t('projectGraph.revision')} ${String(entry.seq)}: ${entry.title} (${entry.at})`,
      ),
      ...edgeLane.checkpoints.map(
        (checkpoint) => `${t('projectGraph.checkpoint')}: ${checkpoint.title} (${checkpoint.at})`,
      ),
    ]
    const expectedEdgeTimes = [
      ...edgeLane.revisions.entries.map((entry) => entry.at),
      ...edgeLane.checkpoints.map((checkpoint) => checkpoint.at),
    ]
    expect(edgeReading.marks.length, 'the edge module draws every revision and stopping point once').toBe(
      expectedEdgeLabels.length,
    )
    expect(
      edgeReading.marks.map((mark) => mark.at).sort(),
      'the edge marks keep their exact stored times',
    ).toEqual([...expectedEdgeTimes].sort())
    expect(
      edgeReading.marks.map((mark) => mark.title).sort(),
      'the edge marks keep their names',
    ).toEqual([...expectedEdgeLabels].sort())
    expect(
      edgeReading.marks.filter((mark) => mark.mark === 'revision').map((mark) => mark.seq),
      'the edge revision keeps its three-digit stored number',
    ).toContain(String(EDGE_LONG_SEQ))
    expect(edgeReading.checkpointTargets.length, 'the edge module draws three stopping-point links').toBe(3)
    const edgeProblems = {
      overlappingInk: edgeReading.overlappingInk,
      overlappingTargets: edgeReading.overlappingTargets,
      targetInkOverlaps: edgeReading.targetInkOverlaps,
      minimumTargetClearance: edgeReading.minimumTargetClearance,
    }
    expect(edgeReading.overlappingInk, `the edge marks do not touch: ${JSON.stringify(edgeProblems)}`).toEqual([])
    expect(edgeReading.overlappingTargets, `the edge targets do not touch: ${JSON.stringify(edgeProblems)}`).toEqual([])
    expect(edgeReading.targetInkOverlaps, `no edge target covers another mark: ${JSON.stringify(edgeProblems)}`).toEqual([])
    for (const target of edgeReading.checkpointTargets) {
      expect(target.width, `${String(target.title)} is wide enough to press`).toBeGreaterThanOrEqual(24)
      expect(target.height, `${String(target.title)} is tall enough to press`).toBeGreaterThanOrEqual(24)
      expect(target.hitsItself, `${String(target.title)} is not covered: ${JSON.stringify(target)}`).toBe(true)
      expect(target.insideLane, `${String(target.title)} is not clipped by the lane: ${JSON.stringify(target)}`).toBe(true)
      expect(target.insideWindow, `${String(target.title)} is inside the window: ${JSON.stringify(target)}`).toBe(true)
    }
    for (const name of [EDGE_LEFT, EDGE_RIGHT]) {
      expect(
        edgeReading.checkpointTargets.some((target) => target.title?.includes(name) === true),
        `the target at the ${name} end is drawn`,
      ).toBe(true)
    }

    // THE LINK IS PRESSED, not only measured: it opens the stopping point's own record.
    const checkpointOne = lane.checkpoints.find((one) => one.title === CHECKPOINT_ONE)
    expect(checkpointOne, 'the first made-up stopping point is on the lane').toBeDefined()
    if (checkpointOne !== undefined) {
      const name = `${t('projectGraph.checkpoint')}: ${checkpointOne.title} (${checkpointOne.at})`
      await page.getByRole('link', { name, exact: true }).click()
      await waitForThePage(page, 60_000)
      expect(await page.evaluate(() => window.location.hash), 'pressing the diamond opens its stopping point').toBe(
        `#${recordPath(checkpointOne.id)}`,
      )
    }
  }, 300_000)

  it('takes the coincident rail at four widths in both looks, and keeps every mark apart at each one', async () => {
    const widths = [1440, 990, 660, 390] as const
    const themes = ['light', 'dark'] as const
    const cluster = buildProjectGraph(graph).lanes.find((one) => one.module.title === MODULE_CLUSTER)
    expect(cluster, 'the made-up cluster module is one lane of the graph').toBeDefined()
    const expectedMarks = (cluster?.revisions.entries.length ?? 0) + (cluster?.checkpoints.length ?? 0)
    const edgeLane = buildProjectGraph(graph).lanes.find((one) => one.module.title === MODULE_EDGE)
    expect(edgeLane, 'the made-up edge module is one lane of the graph').toBeDefined()
    const expectedEdgeMarks = (edgeLane?.revisions.entries.length ?? 0) + (edgeLane?.checkpoints.length ?? 0)
    const expectedEdgeTimes = [
      ...(edgeLane?.revisions.entries.map((entry) => entry.at) ?? []),
      ...(edgeLane?.checkpoints.map((checkpoint) => checkpoint.at) ?? []),
    ]
    const evidence: Array<{
      width: number
      theme: string
      marks: number
      rows: number
      railHeight: number
      overlappingInk: number[][]
      documentWidth: number
      windowWidth: number
      checkpointTargets: RailReading['checkpointTargets']
      nearMarks: number
      nearOverlappingInk: number[][]
      edgeMarks: number
      edgeRows: number
      edgeLongSeq: string | null
      edgeOverlappingInk: number[][]
      edgeOverlappingTargets: number[][]
      edgeTargetInkOverlaps: number[][]
      edgeMinimumTargetClearance: number
      edgeClippedTargets: number
    }> = []
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 })
      for (const theme of themes) {
        await openTheGraph(page, app.site, theme)
        const reading = await readRail(page, MODULE_CLUSTER)
        const near = await readRail(page, MODULE_NEAR)
        const edge = await readRail(page, MODULE_EDGE)
        expect(near.marks.length, `${String(width)} ${theme}: the near lane still draws three revisions`).toBe(3)
        expect(
          near.overlappingInk,
          `${String(width)} ${theme}: the nearly coincident revisions do not touch: ${JSON.stringify(near.overlappingInk)}`,
        ).toEqual([])
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), `${String(width)}: the ${theme} look is on the page`).toBe(theme)
        const edgeProblems = {
          overlappingInk: edge.overlappingInk,
          overlappingTargets: edge.overlappingTargets,
          targetInkOverlaps: edge.targetInkOverlaps,
          minimumTargetClearance: edge.minimumTargetClearance,
          targets: edge.checkpointTargets,
        }
        expect(edge.marks.length, `${String(width)} ${theme}: every edge mark is drawn`).toBe(expectedEdgeMarks)
        expect(
          edge.marks.map((mark) => mark.at).sort(),
          `${String(width)} ${theme}: the edge lane keeps its exact stored times`,
        ).toEqual([...expectedEdgeTimes].sort())
        expect(
          edge.marks.filter((mark) => mark.mark === 'revision').map((mark) => mark.seq),
          `${String(width)} ${theme}: the long revision number is on the edge lane`,
        ).toContain(String(EDGE_LONG_SEQ))
        expect(edge.overlappingInk, `${String(width)} ${theme}: the edge marks do not touch: ${JSON.stringify(edgeProblems)}`).toEqual([])
        expect(
          edge.overlappingTargets,
          `${String(width)} ${theme}: the edge targets do not touch: ${JSON.stringify(edgeProblems)}`,
        ).toEqual([])
        expect(
          edge.targetInkOverlaps,
          `${String(width)} ${theme}: no edge target covers another mark: ${JSON.stringify(edgeProblems)}`,
        ).toEqual([])
        for (const target of edge.checkpointTargets) {
          expect(target.width, `${String(width)} ${theme}: the edge target is wide enough`).toBeGreaterThanOrEqual(24)
          expect(target.height, `${String(width)} ${theme}: the edge target is tall enough`).toBeGreaterThanOrEqual(24)
          expect(target.hitsItself, `${String(width)} ${theme}: the edge target is uncovered: ${JSON.stringify(target)}`).toBe(true)
          expect(target.insideLane, `${String(width)} ${theme}: the edge target is not clipped by the lane: ${JSON.stringify(target)}`).toBe(true)
          expect(target.insideWindow, `${String(width)} ${theme}: the edge target is inside the window: ${JSON.stringify(target)}`).toBe(true)
        }
        for (const name of [EDGE_LEFT, EDGE_RIGHT]) {
          expect(
            edge.checkpointTargets.some((target) => target.title?.includes(name) === true),
            `${String(width)} ${theme}: the target at the ${name} end is drawn`,
          ).toBe(true)
        }
        expect(
          reading.marks.length,
          `${String(width)} ${theme}: every coincident mark is still drawn`,
        ).toBe(expectedMarks)
        expect(
          reading.overlappingInk,
          `${String(width)} ${theme}: no two marks touch: ${JSON.stringify(reading.overlappingInk)}`,
        ).toEqual([])
        for (const target of reading.checkpointTargets) {
          expect(target.width, `${String(width)} ${theme}: the checkpoint target is wide enough`).toBeGreaterThanOrEqual(24)
          expect(target.height, `${String(width)} ${theme}: the checkpoint target is tall enough`).toBeGreaterThanOrEqual(24)
          expect(target.hitsItself, `${String(width)} ${theme}: the checkpoint link is uncovered: ${JSON.stringify(target)}`).toBe(true)
        }
        expect(
          reading.documentWidth,
          `${String(width)} ${theme}: the document is not wider than its window`,
        ).toBeLessThanOrEqual(reading.windowWidth)
        const path = join(shots, `project-graph-coincident-${String(width)}-${theme}.png`)
        await page.locator('.gph-page').screenshot({ path })
        await laneFor(page, MODULE_CLUSTER).screenshot({
          path: join(shots, `project-graph-coincident-lane-${String(width)}-${theme}.png`),
        })
        await laneFor(page, MODULE_EDGE).screenshot({
          path: join(shots, `project-graph-edge-lane-${String(width)}-${theme}.png`),
        })
        evidence.push({
          width,
          theme,
          marks: reading.marks.length,
          rows: new Set(reading.marks.map((mark) => mark.row)).size,
          railHeight: reading.railHeight,
          overlappingInk: reading.overlappingInk,
          documentWidth: reading.documentWidth,
          windowWidth: reading.windowWidth,
          checkpointTargets: reading.checkpointTargets,
          nearMarks: near.marks.length,
          nearOverlappingInk: near.overlappingInk,
          edgeMarks: edge.marks.length,
          edgeRows: new Set(edge.marks.map((mark) => mark.row)).size,
          edgeLongSeq: edge.marks.find((mark) => mark.seq === String(EDGE_LONG_SEQ))?.seq ?? null,
          edgeOverlappingInk: edge.overlappingInk,
          edgeOverlappingTargets: edge.overlappingTargets,
          edgeTargetInkOverlaps: edge.targetInkOverlaps,
          edgeMinimumTargetClearance: edge.minimumTargetClearance,
          edgeClippedTargets: edge.checkpointTargets.filter((target) => !target.insideLane || !target.insideWindow).length,
        })
      }
    }
    writeFileSync(
      join(shots, 'measurements.json'),
      `${JSON.stringify(
        {
          stamps: {
            cluster: CLUSTER_STAMP,
            lone: LONE_STAMP,
            edge: {
              left: EDGE_LEFT_STAMP,
              near: EDGE_NEAR_STAMP,
              revision: EDGE_REVISION_STAMP,
              right: EDGE_RIGHT_STAMP,
              longSeq: EDGE_LONG_SEQ,
            },
          },
          evidence,
        },
        null,
        2,
      )}\n`,
    )

    // EVERY LEVEL OF THE OWNER'S FOUR STILL DRAWS EXACTLY WHAT THE MODEL SAYS IT DRAWS.
    const built = buildProjectGraph(graph)
    for (const level of PROJECT_GRAPH_LEVELS) {
      await chooseLevel(page, level)
      const counts = await page.evaluate(() => {
        const root = document.querySelector('[data-graph-level]')
        if (root === null) throw new Error('The graph page is not on screen.')
        const count = (mark: string) => root.querySelectorAll(`[data-mark="${mark}"]`).length
        return {
          modules: count('module'),
          futures: count('future'),
          plannedStates: count('plannedState'),
          revisions: count('revision'),
          checkpoints: count('checkpoint'),
          counts: count('count'),
          boundaries: count('boundary'),
          summaries: count('summary'),
        }
      })
      expect(counts, `level ${level}`).toEqual(marksAtLevel(built, level))
    }
  }, 300_000)
})
