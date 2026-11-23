// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILING AND MERGING DEPARTMENTS LOSES NO PACKAGE, POINT OR BOARD LANE. Wave 13s, departments step 1b, by its first
 * option: work keeps its line codes and is read through the department that holds each code, and nothing is written to
 * a package or a backlog point when a department is filed or merged.
 *
 * WHAT IS PROVED, in a test office with made-up packages and backlog points under three made-up codes:
 *   1. The package figures by line, GET /api/backlog?line= for each code and the board's lanes are read before any
 *      department is filed. A department holding the first code and one holding the second are filed, and the second is
 *      merged into the first. Read again, each code holds the same packages and points, the board keeps one lane for
 *      each code with the same packages and points, and every package and point is stored as it was.
 *   2. On the board the lanes of the first two codes name the first department, the second by following its merge to
 *      the end, and the lane of the third code says no department holds it.
 *
 * These cases may be green from the start: they pin what the office does now, so that the code of step 1b keeps it.
 * Every package, point, code and department here is made up, and the packages and points are filed as fixtures.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { ProjectBoard } from '../src/shared/project-board.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'

/** The three made-up codes: the first and second are held by departments this test files, the third by none. */
const FIRST = 'made-up-first-code'
const SECOND = 'made-up-second-code'
const THIRD = 'made-up-third-code'
const CODES = [FIRST, SECOND, THIRD]

/** The made-up packages, each with the codes it is filed under. */
const PACKAGES: { title: string; lines: string[] }[] = [
  { title: 'A made-up package of the first code', lines: [FIRST] },
  { title: 'A made-up package of the second code', lines: [SECOND] },
  { title: 'A made-up package of the first and second codes', lines: [FIRST, SECOND] },
  { title: 'A made-up package of the third code', lines: [THIRD] },
]

/** The made-up backlog points, each with its code and its number there. */
const POINTS: { line: string; number: string }[] = [
  { line: FIRST, number: '1' },
  { line: SECOND, number: '1' },
  { line: SECOND, number: '2' },
  { line: THIRD, number: '1' },
]

let t0: TestDb
let app: FastifyInstance
const work: string[] = []
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What the doors read of the work under the three codes, with the departments the board names left out. */
interface WhatTheDoorsRead {
  figures: unknown
  backlog: Record<string, string[]>
  lanes: Record<string, { count: number; next: string[]; later: string[] }>
}

let before: WhatTheDoorsRead
let storedBefore = ''
let board: ProjectBoard
let first = ''
let second = ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown): Promise<any> {
  const reply = await app.inject({ method, url, headers: PERSON, ...(payload === undefined ? {} : { payload: payload as object }) })
  expect(reply.statusCode < 300, `${method} ${url}: ${reply.body.slice(0, 400)}`).toBe(true)
  return reply.json()
}

async function theBoard(): Promise<ProjectBoard> {
  return (await call('GET', '/api/projects/default/board')) as ProjectBoard
}

/** The package figures, the backlog of each code and the board's lane for each code, each list of ids in order. */
async function whatTheDoorsRead(): Promise<WhatTheDoorsRead> {
  const figures = await call('GET', '/api/figures/packages-by-line')
  const backlog: WhatTheDoorsRead['backlog'] = {}
  for (const code of CODES) {
    const read = (await call('GET', `/api/backlog?line=${code}`)) as { items: { id: string }[] }
    backlog[code] = read.items.map((item) => item.id).sort()
  }
  const lines = (await theBoard()).lines
  const lanes: WhatTheDoorsRead['lanes'] = {}
  for (const code of CODES) {
    const lane = lines.filter((one) => one.line === code)
    lanes[code] = {
      count: lane.length,
      next: lane.flatMap((one) => one.next.map((record) => record.id)).sort(),
      later: lane.flatMap((one) => one.later.map((record) => record.id)).sort(),
    }
  }
  return { figures: { lines: figures.lines, packages: figures.packages, inMoreThanOneLine: figures.inMoreThanOneLine }, backlog, lanes }
}

/** Every package and point this test filed, whole as stored, with how many changes and revisions each has. */
function theWorkAsStored(): string {
  const marks = work.map(() => '?').join(', ')
  return JSON.stringify([
    t0.client.sqlite.prepare(`SELECT * FROM records WHERE id IN (${marks}) ORDER BY id`).all(...work),
    t0.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM changes WHERE record_id IN (${marks})`).get(...work),
    t0.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM revisions WHERE record_id IN (${marks})`).get(...work),
  ])
}

beforeAll(async () => {
  t0 = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const one of PACKAGES) {
    const filed = t0.api.createRecord({
      kind: 'task',
      title: one.title,
      workspaceId: 'default',
      origin: 'fixture',
      actor: t0.api.HUMAN,
      data: {
        state: 'todo',
        package: {
          moduleIds: [],
          pointIds: [],
          lines: one.lines,
          bundleId: 'madeUpBundle',
          forTheOutside: 'Made-up: nothing leaves.',
          acceptance: 'Made-up: nothing is judged.',
          at: '2026-11-20 12:00:00',
          by: { actorType: 'human', actorId: t0.api.HUMAN.id },
        },
      },
    })
    work.push(filed.id)
  }
  for (const one of POINTS) {
    const filed = t0.api.createRecord({
      kind: 'backlog_item',
      title: `Made-up point ${one.number} of ${one.line}`,
      workspaceId: 'default',
      origin: 'fixture',
      actor: t0.api.HUMAN,
      data: {
        line: one.line,
        number: one.number,
        placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
        why: 'Made-up: a point under a made-up code.',
        doneWhen: 'Made-up: nothing is judged.',
        state: 'todo',
      },
    })
    work.push(filed.id)
  }
  before = await whatTheDoorsRead()
  storedBefore = theWorkAsStored()

  first = String((await call('POST', '/api/departments', { codes: [FIRST], nameEn: 'Made-up first department', state: 'running' })).department.id)
  second = String((await call('POST', '/api/departments', { codes: [SECOND], nameEn: 'Made-up second department', state: 'running' })).department.id)
  await call('PUT', `/api/departments/${second}`, { codes: [SECOND], nameEn: 'Made-up second department', state: 'merged', mergedInto: first })
  board = await theBoard()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t0?.close()
})

describe('filing and merging departments loses no package, point or board lane', () => {
  it('1: each code keeps its packages, points and one board lane, and nothing stored changes', async () => {
    expect(before.lanes).toEqual({
      [FIRST]: { count: 1, next: [work[0], work[2]].sort(), later: [work[4]] },
      [SECOND]: { count: 1, next: [work[1], work[2]].sort(), later: [work[5], work[6]].sort() },
      [THIRD]: { count: 1, next: [work[3]], later: [work[7]] },
    })
    expect(before.backlog).toEqual({ [FIRST]: [work[4]], [SECOND]: [work[5], work[6]].sort(), [THIRD]: [work[7]] })
    expect(await whatTheDoorsRead()).toEqual(before)
    expect(theWorkAsStored()).toBe(storedBefore)
  })

  it('2: the board names a code by the department that holds it, following a merge to the end, and says when none does', () => {
    const department = (code: string) => board.lines.find((one) => one.line === code)?.department
    expect(department(FIRST)).toMatchObject({ state: 'held', id: first })
    expect(department(SECOND)).toMatchObject({ state: 'held', id: first })
    expect(department(THIRD)).toEqual({ state: 'not-held' })
  })
})
