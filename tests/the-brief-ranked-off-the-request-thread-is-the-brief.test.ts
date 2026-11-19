// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BRIEF, WITH ITS OPEN WORK RANKED ON THE ATTENTION THREAD, IS THE BRIEF IT WAS (problem
 * CtH8CGBkE5Bz, round 9).
 *
 * GET /api/brief used to run the attention rule inside `rankOpenWork`, on the thread that reads
 * requests, in the same step as it read the open loops. Now the reading is asked of the attention
 * thread first (`theReadingOpenWorkIsRankedBy`) and the loops are read after it, so a write can land
 * between the two. This file proves two things on one small seeded office, small enough that its open
 * work fits in the brief.
 *
 * THE BRIEF IS THE SAME. The route's reply is compared with `theBriefFor` worked out as it was before:
 * the loops read, and the rule run on this thread at once, with nothing written between. Every reply
 * carries `narrowedByPermission: null` (src/server/lib/across-projects.ts), so that is added to the
 * side worked out here.
 *
 * A WRITE BETWEEN THE TWO IS SAID. A task is moved after the reading is taken and before the loops are
 * read. That task's ranking sentence says it changed after the rule was run, and no other loop's does.
 *
 * That health is answered while a brief is worked out is proved on a grown office in
 * tests/the-attention-read-does-not-hold-the-office.test.ts.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION of
 * one line for each case red; RESTORE green, checked with cmp against a saved copy.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
const moved: string[] = []

async function post(url: string, payload: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url, headers: { ...OWNER, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

async function patch(url: string, payload: unknown): Promise<void> {
  const reply = await app.inject({ method: 'PATCH', url, headers: { ...OWNER, 'content-type': 'application/json' }, payload: payload as never })
  expect(reply.statusCode, reply.body).toBe(200)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  // RECORDS THE RULE RANKS, as tests/the-attention-read-does-not-hold-the-office.test.ts writes them.
  const add = t.client.sqlite.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, '${HERE}', 'owner', '2026-09-01 09:00:00', '2026-09-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
  )
  add.run('at-owed', 'task', 'A promise to somebody outside', JSON.stringify({ state: 'doing', owed_to: 'the printer shop', due: '2026-09-10' }))
  add.run('at-blocker', 'task', 'The thing holding the promise up', JSON.stringify({ state: 'todo' }))
  add.run('at-paused', 'task', 'Put down until a date that has passed', JSON.stringify({ state: 'blocked', paused: { since: '2026-09-01', why: 'waiting for parts', until: { date: '2026-09-05' } } }))
  add.run('at-stopped', 'problem', 'Stopped short with a consequence', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'the rig may move' } }))
  t.client.sqlite
    .prepare(
      `INSERT INTO links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at)
       VALUES ('at-link', '${HERE}', 'owner', 'at-blocker', 'at-owed', 'blocks', 0, 'made-up', 'agent', '2026-09-01 09:00:00', '2026-09-01 09:00:00')`,
    )
    .run()
  // TASKS MADE AND MOVED THROUGH THE OFFICE, so they have change rows.
  for (const title of ['A made-up task moved twice', 'A made-up task moved once', 'A made-up task left as it was']) {
    const made = await post('/api/records', { kind: 'task', title, data: { state: 'todo' } })
    moved.push((made['record'] as { id: string }).id)
  }
  await patch(`/api/records/${moved[0] ?? ''}`, { dataPatch: { state: 'doing' } })
  await patch(`/api/records/${moved[0] ?? ''}`, { dataPatch: { state: 'blocked' } })
  await patch(`/api/records/${moved[1] ?? ''}`, { dataPatch: { state: 'doing' } })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the brief, whose open work is ranked by the attention reading from its own thread', () => {
  it('is the brief worked out on the request thread, from the reading and the loops read together', async () => {
    const { theBriefFor } = await import('../src/server/api/brief.ts')
    const { readForks } = await import('../src/server/lib/forks.ts')
    const { openLoopsFor } = await import('../src/server/lib/openloops.ts')
    const { theMessageReader } = await import('../src/server/lib/messages.ts')
    const { attentionNow } = await import('../src/server/lib/records.ts')

    const reply = await app.inject({ method: 'GET', url: '/api/brief', headers: OWNER })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)

    // AS IT WAS WORKED OUT BEFORE: the loops read and the rule run in one step, with nothing written after.
    const actor = { type: 'human', id: THE_PERSON } as const
    const forks = readForks()
    const loops = openLoopsFor({ workspaceId: HERE, reader: theMessageReader(actor), forks })
    const lastChange = (t.client.sqlite.prepare('SELECT MAX(append_order) AS last FROM changes').get() as { last: number }).last
    const before = theBriefFor(HERE, actor as never, forks, loops, { reading: attentionNow({ workspaceId: HERE, resources: [] }), lastChange })

    expect(loops.loops.length, 'the open work fits in the brief').toBeGreaterThanOrEqual(5)
    expect(reply.body, 'the brief ranks open work').toContain('The attention rule puts this 1 of')
    expect(reply.json()).toEqual({ ...(JSON.parse(JSON.stringify(before)) as Record<string, unknown>), narrowedByPermission: null })
  }, 120_000)

  it('says on a loop whose record changed after the reading that its place is from before that change, and on no other', async () => {
    const { theReadingOpenWorkIsRankedBy, rankOpenWork } = await import('../src/server/lib/openwork.ts')
    const { readForks } = await import('../src/server/lib/forks.ts')
    const { openLoopsFor } = await import('../src/server/lib/openloops.ts')
    const { theMessageReader } = await import('../src/server/lib/messages.ts')

    const ranking = await theReadingOpenWorkIsRankedBy(HERE)
    // A WRITE THAT LANDS BETWEEN THE READING AND THE LOOPS.
    const changed = moved[2] ?? ''
    await patch(`/api/records/${changed}`, { dataPatch: { state: 'doing' } })
    const loops = openLoopsFor({ workspaceId: HERE, reader: theMessageReader({ type: 'human', id: THE_PERSON }), forks: readForks() })
    expect(loops.loops.map((loop) => loop.id), 'the changed task is open work').toContain(changed)

    const told = rankOpenWork(loops, ranking).filter((loop) => loop.ranking.includes('after the attention rule was run'))
    expect(told.map((loop) => loop.id)).toEqual([changed])
  }, 120_000)
})
