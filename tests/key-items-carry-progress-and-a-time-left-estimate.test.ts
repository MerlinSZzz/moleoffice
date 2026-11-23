// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * KEY ITEMS: A FEW THINGS THAT MATTER MOST, EACH WITH ITS PROGRESS AND AN ESTIMATE OF THE TIME LEFT. Wave 13s round 281,
 * point HD-2c of home as a data dashboard.
 *
 * A key item is a record of its own kind, written only through its own doors at /api/key-items, by the person or by a
 * secretary as itself. The office writes who set its progress or its estimate, and when, from the writer and its own
 * clock. Its progress is counted from the points of the packages it names, or is a figure somebody set when it names
 * none. These cases drive the doors in a test office of their own:
 *
 *   1. the person and a secretary file three key items, the office writes who and when, and a supervisor is refused at
 *      the key item doors and at POST and PATCH /api/records alike, with nothing written;
 *   2. the key item that names two packages counts their points, done of all;
 *   3. a secretary changes one estimate: the read shows the new one with who and when, and the history keeps the old;
 *   4. one is moved in the order, one is closed and leaves the open list, and it is opened again at the end;
 *   5. every project together lists the open key items of two projects, each with its project.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage } from '../src/shared/i18n.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb, governsTheWholeProject } from './helpers.ts'
import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'

type TheShared = typeof import('../src/shared/key-items.ts')

const SECRETARY = 'key-item-made-up-secretary'
const SUPERVISOR = 'key-item-made-up-supervisor'
const WORKER = 'key-item-made-up-worker'

/** A made-up second project, for the read of every project together. */
const OTHER_PROJECT = 'made-up-key-item-project'

/** The stored form of a time the office writes: local wall-clock, to the second. */
const A_STAMP = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/

let t0: TestDb
let app: FastifyInstance
let shared: TheShared
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

const idOf = (handle: string): string => {
  const id = ids.get(handle)
  if (id === undefined || id === '') throw new Error(`the test registered no agent ${handle}`)
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** One record filed through POST /api/records, answered 201. */
async function file(kind: string, title: string, data: Record<string, unknown>, headers: Record<string, string>): Promise<string> {
  const filed = await call('POST', '/api/records', headers, { kind, title, data: kind === 'decision' ? { ...governsTheWholeProject(), replaces: [], ...data } : data })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

/** One act on a package through its own door, answered 201. */
async function step(task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>): Promise<void> {
  const done = await call('POST', `/api/delegation/${task}/${door}`, headers, payload)
  expect(done.status, `${door}: ${done.raw}`).toBe(201)
}

/** Every key item record and every change and revision of one, so a refusal can be shown to write nothing. */
function theKeyItemsAsStored(): string {
  const kind = shared.KEY_ITEM_KIND
  return JSON.stringify([
    t0.client.sqlite.prepare('SELECT id, title, data, deleted_at FROM records WHERE kind = ? ORDER BY id').all(kind),
    t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
    t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id IN (SELECT id FROM records WHERE kind = ?)').get(kind),
  ])
}

/** How many revisions one record has, read from the table. */
function revisionsOf(id: string): number {
  return (t0.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
}

/** A key item filed through its own door, answered 201, and its id. */
async function filed(item: Record<string, unknown>, headers: Record<string, string>): Promise<string> {
  const made = await call('POST', '/api/key-items', headers, item)
  expect(made.status, made.raw).toBe(201)
  return String(made.body.item.id)
}

/** The open key items of this project, or of every project, as the list door reads them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function theOpenItems(query = ''): Promise<any[]> {
  const read = await call('GET', `/api/key-items${query}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return read.body.items
}

/** One key item as the one-item door reads it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readOne(id: string): Promise<any> {
  const one = await call('GET', `/api/key-items/${id}`, PERSON)
  expect(one.status, one.raw).toBe(200)
  return one.body
}

/** The three key items of the first case, and the two packages the second one names. */
let first = ''
let second = ''
let third = ''
const packages: string[] = []

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t0 = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  shared = await import('../src/shared/key-items.ts')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t0.file), 'keys.json')))
  for (const [handle, role] of [
    [SECRETARY, THE_SECRETARY],
    [SUPERVISOR, THE_SUPERVISOR],
    [WORKER, THE_WORKER],
  ] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }

  // TWO MADE-UP PACKAGES OF THE SUPERVISOR'S, of two points and of one. The worker takes the first and hands both its
  // points back, and the supervisor accepts one and returns the other, so one point of the three is done.
  const decision = await file('decision', 'A made-up decision above the packages', {}, PERSON)
  const pointsOf = async (count: number): Promise<string[]> => {
    const points: string[] = []
    for (let n = 1; n <= count; n++) {
      points.push(await file('backlog_item', `A made-up point ${String(packages.length + 1)}.${String(n)}`, {
        line: 'a-made-up-line', number: `${String(packages.length + 1)}.${String(n)}`, placedBy: { kind: 'person', id: THE_PERSON },
        why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo',
      }, PERSON))
    }
    return points
  }
  const twoPoints = await pointsOf(2)
  for (const [title, points] of [['A made-up package of two points', twoPoints], ['A made-up package of one point', null]] as const) {
    const pointIds = points ?? await pointsOf(1)
    const task = await file('task', title, {}, as(SUPERVISOR))
    await step(task, 'package', {
      forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.',
      moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, 'default'))],
      parent: { kind: 'decision', id: decision }, pointIds,
    }, as(SUPERVISOR))
    packages.push(task)
  }
  const run = await call('POST', '/api/records', {
    'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': 'default', ...theOfficesKeyHeader(),
  }, { kind: 'session', title: 'A made-up run of the worker', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf(WORKER) } })
  expect(run.status, run.raw).toBe(201)
  const theRun = { ...as(WORKER), 'x-mole-office-session': String(run.body.record.id), 'x-mole-office-key': String(run.body.runKey?.key ?? '') }
  const twoPackage = packages[0]!
  await step(twoPackage, 'take-inside', {}, as(WORKER))
  await step(twoPackage, 'align', { restated: 'I will do the two made-up points.', plan: 'Do them.' }, as(WORKER))
  await step(twoPackage, 'align-answer', { answer: 'aligned', words: 'Yes.' }, as(SUPERVISOR))
  await step(twoPackage, 'hand-back', { points: twoPoints.map((pointId) => ({ pointId, outcome: 'done', words: 'Built.' })) }, theRun)
  await step(twoPackage, 'accept', {
    points: [{ pointId: twoPoints[0]!, answer: 'accepted' }, { pointId: twoPoints[1]!, answer: 'returned', words: 'The second made-up point draws nothing.' }],
  }, as(SUPERVISOR))

  const made = await call('POST', '/api/workspaces', PERSON, { id: OTHER_PROJECT, title: 'A made-up project of key items' })
  expect(made.status, made.raw).toBe(201)
}, 120_000)

afterAll(async () => {
  setWordLanguage('en')
  await app?.close()
  t0?.close()
})

describe('key items', () => {
  it('are filed by the person and by a secretary, who and when written by the office, and a supervisor is refused', async () => {
    first = await filed({ title: 'A made-up first key item', progress: 40, hoursLeft: 30 }, PERSON)
    second = await filed({ title: 'A made-up second key item', packages, hoursLeft: 50 }, as(SECRETARY))
    third = await filed({ title: 'A made-up third key item' }, as(SECRETARY))

    const one = (await readOne(first)).item
    expect(one.title).toBe('A made-up first key item')
    expect(one.state).toBe('open')
    expect(one.place).toBe(1)
    expect(one.project.id).toBe('default')
    expect(one.progress.from).toBe('set')
    expect(one.progress.percent).toBe(40)
    expect(one.progress.setBy.kind).toBe('person')
    expect(one.progress.setAt).toMatch(A_STAMP)
    expect(one.estimate.state).toBe('estimated')
    expect(one.estimate.hoursLeft).toBe(30)
    expect([one.estimate.days, one.estimate.hours]).toEqual([1, 6])
    expect(one.estimate.estimatedBy.kind).toBe('person')
    expect(one.estimate.estimatedAt).toMatch(A_STAMP)

    const two = (await readOne(second)).item
    expect(two.place).toBe(2)
    expect(two.estimate.estimatedBy).toMatchObject({ kind: 'agent', id: idOf(SECRETARY), handle: SECRETARY })
    const three = (await readOne(third)).item
    expect(three.place).toBe(3)
    // NOBODY SET A FIGURE OR AN ESTIMATE, and the read says so rather than showing a zero.
    expect(three.progress).toEqual({ from: 'not-set' })
    expect(three.estimate).toEqual({ state: 'not-estimated' })

    // NOBODY TYPES WHO OR WHEN: the door takes no such field.
    const typed = await call('POST', '/api/key-items', as(SECRETARY), { title: 'A made-up typed key item', hoursLeft: 3, estimatedBy: { kind: 'person', id: THE_PERSON } })
    expect(typed.status, typed.raw).toBe(400)

    // A SUPERVISOR IS REFUSED at the key item doors and at POST and PATCH /api/records alike, and every refusal says who
    // may write a key item. The person is refused at /api/records too, and pointed at the doors.
    const before = theKeyItemsAsStored()
    const atTheDoors = [
      await call('POST', '/api/key-items', as(SUPERVISOR), { title: 'A made-up supervisor key item' }),
      await call('PATCH', `/api/key-items/${first}`, as(SUPERVISOR), { hoursLeft: 1 }),
      await call('POST', `/api/key-items/${first}/close`, as(SUPERVISOR)),
    ]
    for (const refused of atTheDoors) {
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain(shared.WHO_MAY_WRITE_A_KEY_ITEM)
    }
    const atTheRecords = [
      await call('POST', '/api/records', as(SUPERVISOR), { kind: shared.KEY_ITEM_KIND, title: 'A made-up supervisor key item', data: { state: 'open', place: 4 } }),
      await call('PATCH', `/api/records/${first}`, as(SUPERVISOR), { dataPatch: { hoursLeft: 1 } }),
      await call('POST', '/api/records', PERSON, { kind: shared.KEY_ITEM_KIND, title: 'A made-up key item past the doors', data: { state: 'open', place: 4 } }),
    ]
    for (const refused of atTheRecords) {
      expect(refused.status, refused.raw).toBe(403)
      expect(refused.error).toContain(shared.A_KEY_ITEM_IS_WRITTEN_BY_ITS_DOORS)
    }
    expect(theKeyItemsAsStored()).toBe(before)
  })

  it('counts the progress of a key item that names two packages from their points', async () => {
    const two = (await readOne(second)).item
    expect(two.packages).toEqual(packages)
    expect(two.progress.from).toBe('packages')
    expect([two.progress.done, two.progress.of]).toEqual([1, 3])
    expect(two.progress.percent).toBe(33)
    expect(two.progress.packages.map((one: { id: string; done: number; of: number }) => [one.id, one.done, one.of])).toEqual([
      [packages[0], 1, 2],
      [packages[1], 0, 1],
    ])
    // A FIGURE SET BY HAND IS REFUSED BESIDE PACKAGES, which count it already. Nothing is written.
    const before = theKeyItemsAsStored()
    const both = await call('PATCH', `/api/key-items/${second}`, as(SECRETARY), { progress: 50 })
    expect(both.status, both.raw).toBe(400)
    expect(theKeyItemsAsStored()).toBe(before)
  })

  it('shows a changed estimate with who changed it and when, and keeps the earlier one in its history', async () => {
    const revisions = revisionsOf(first)
    const changed = await call('PATCH', `/api/key-items/${first}`, as(SECRETARY), { hoursLeft: 12 })
    expect(changed.status, changed.raw).toBe(200)
    expect(changed.body.written).toBe('changed')
    expect(revisionsOf(first)).toBe(revisions + 1)

    const one = await readOne(first)
    expect(one.item.estimate).toMatchObject({ state: 'estimated', hoursLeft: 12, days: 0, hours: 12 })
    expect(one.item.estimate.estimatedBy).toMatchObject({ kind: 'agent', id: idOf(SECRETARY), handle: SECRETARY })
    expect(one.item.estimate.estimatedAt).toMatch(A_STAMP)
    // THE SET PROGRESS IS UNTOUCHED: still the person's.
    expect(one.item.progress).toMatchObject({ from: 'set', percent: 40 })
    expect(one.item.progress.setBy.kind).toBe('person')
    // THE HISTORY OF ITS ESTIMATES, newest first, read from the record's own revisions.
    expect(one.estimates.map((each: { hoursLeft: number; estimatedBy: { kind: string } }) => [each.hoursLeft, each.estimatedBy.kind])).toEqual([
      [12, 'agent'],
      [30, 'person'],
    ])
  })

  it('moves a key item in the order, closes one out of the open list and opens it again at the end', async () => {
    const moved = await call('POST', `/api/key-items/${second}/place`, as(SECRETARY), { place: 1 })
    expect(moved.status, moved.raw).toBe(200)
    expect((await theOpenItems()).map((item: { id: string; place: number }) => [item.id, item.place])).toEqual([
      [second, 1],
      [first, 2],
      [third, 3],
    ])

    const closed = await call('POST', `/api/key-items/${third}/close`, PERSON)
    expect(closed.status, closed.raw).toBe(200)
    expect((await theOpenItems()).map((item: { id: string }) => item.id)).toEqual([second, first])
    const closedOnes = await call('GET', '/api/key-items?state=closed', PERSON)
    expect(closedOnes.status, closedOnes.raw).toBe(200)
    expect(closedOnes.body.items.map((item: { id: string; state: string; place: number | null }) => [item.id, item.state, item.place])).toEqual([[third, 'closed', null]])

    const reopened = await call('POST', `/api/key-items/${third}/reopen`, as(SECRETARY))
    expect(reopened.status, reopened.raw).toBe(200)
    expect((await theOpenItems()).map((item: { id: string; place: number }) => [item.id, item.place])).toEqual([
      [second, 1],
      [first, 2],
      [third, 3],
    ])
    const again = await call('POST', `/api/key-items/${third}/close`, as(SECRETARY))
    expect(again.status, again.raw).toBe(200)
  })

  it('lists the open key items of every project together, each with its project', async () => {
    const elsewhere = await filed({ title: 'A made-up key item of another project', hoursLeft: 8 }, { ...PERSON, 'x-mole-office-workspace': OTHER_PROJECT })
    expect((await theOpenItems()).map((item: { id: string }) => item.id)).toEqual([second, first])
    const every = await theOpenItems('?projects=every')
    expect(every.map((item: { id: string; project: { id: string } }) => [item.id, item.project.id])).toEqual(expect.arrayContaining([
      [second, 'default'],
      [first, 'default'],
      [elsewhere, OTHER_PROJECT],
    ]))
    expect(every).toHaveLength(3)
    expect(every.find((item: { id: string }) => item.id === elsewhere).project.title).toBe('A made-up project of key items')
  })
})
