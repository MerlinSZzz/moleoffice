// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE READ OF EVERY OTHER PROJECT'S ATTENTION IS EACH PROJECT'S OWN FIRST PAGE (round 23 of wave 13w).
 *
 * Home and the Projects page asked GET /api/attention?shape=home once for each project. They now ask
 * `shape=other-projects` once, and the attention thread reads every project but the one on screen in
 * one ask (`homeAttentionOfEachProjectOnItsOwnThread` in src/server/lib/attention-thread.ts). This file
 * proves three things on an office of three projects, each with a different number of rows:
 *
 *   - FROM THE THREAD, each project's reading is that project's `home` shape worked out here, at one
 *     fixed clock, for the owner and for an agent who may not read a message between two other agents;
 *   - THE ROUTE answers every project on the list but the one the request names, in the list's order,
 *     each with the rows that project's own `shape=home` answers;
 *   - `machine=include` is refused with this shape, because the first page has no machine list.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION
 * of one line for each case red; RESTORE green, checked with cmp against a saved copy.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const HERE = 'default'

/** The two other projects, and how many blocked tasks each holds, so no two readings are alike. */
const OTHERS = [
  { id: 'made-up-second', title: 'Made-up second project', blocked: 2 },
  { id: 'made-up-third', title: 'Made-up third project', blocked: 4 },
] as const

/** One fixed clock for both readings, because the rule ranks by how long a record has been in its state. */
const NOW = new Date(2026, 9, 10, 12, 0, 0).getTime()

const OWNER = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance

type Records = typeof import('../src/server/lib/records.ts')
type Thread = typeof import('../src/server/lib/attention-thread.ts')
type Messages = typeof import('../src/server/lib/messages.ts')
type Shapes = typeof import('../src/server/lib/attention-shapes.ts')
let R: Records
let thread: Thread
let messages: Messages
let shapes: Shapes

async function post(url: string, payload: unknown, workspaceId: string = HERE): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'POST',
    url,
    headers: { ...OWNER, 'x-mole-office-workspace': workspaceId, 'content-type': 'application/json' },
    payload: payload as never,
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as Record<string, unknown>
}

async function get(url: string, workspaceId: string = HERE): Promise<{ status: number; body: string }> {
  const reply = await app.inject({ method: 'GET', url, headers: { ...OWNER, 'x-mole-office-workspace': workspaceId } })
  return { status: reply.statusCode, body: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  R = await import('../src/server/lib/records.ts')
  thread = await import('../src/server/lib/attention-thread.ts')
  messages = await import('../src/server/lib/messages.ts')
  shapes = await import('../src/server/lib/attention-shapes.ts')
  for (const one of OTHERS) {
    await post('/api/workspaces', { id: one.id, title: one.title })
    for (let n = 0; n < one.blocked; n += 1) {
      await post('/api/records', { kind: 'task', title: `A made-up blocked task ${String(n + 1)}`, data: { state: 'blocked' } }, one.id)
    }
  }
  await post('/api/records', { kind: 'task', title: 'A made-up task here', data: { state: 'blocked' } })

  // A MESSAGE BETWEEN TWO AGENTS IN THE SECOND PROJECT, and a task about it, so the owner's reading of
  // that project holds a link the bystander's does not.
  for (const handle of ['ada-writer', 'bo-reader', 'dee-bystander']) {
    await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  }
  const participants = JSON.parse((await get('/api/participants')).body) as { agents?: { id: string; handle: string }[] }
  const bo = participants.agents?.find((one) => one.handle === 'bo-reader')?.id
  if (bo === undefined) throw new Error('bo-reader was registered and is not listed')
  const between = R.createRecord({
    kind: 'message',
    title: 'A made-up line from ada to bo',
    workspaceId: OTHERS[0].id,
    data: { body: 'made-up words', to: [{ kind: 'agent', id: bo }] },
    actor: { type: 'agent', id: 'ada-writer' } as never,
  }).id
  t.client.sqlite.prepare('DELETE FROM message_delivery WHERE message_id = ? AND recipient_id != ?').run(between, bo)
  const said = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(between) as { data: string }).data) as Record<string, unknown>
  delete said['routed']
  writeDataBypassingTheGate(t, between, said)
  const about = await post('/api/records', { kind: 'task', title: 'A made-up task about the line', data: { state: 'blocked' } }, OTHERS[0].id)
  await post('/api/links', { fromId: (about['record'] as { id: string }).id, toId: between, type: 'about' }, OTHERS[0].id)
}, 300_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('every other project in one ask of the attention thread', () => {
  it("is each project's own home shape, for each reader", async () => {
    const readers = {
      owner: messages.theMessageReader({ type: 'human', id: THE_PERSON }),
      dee: messages.theMessageReader({ type: 'agent', id: 'dee-bystander' }),
    }
    const each = [...OTHERS.map((one) => one.id), HERE]
    const links: Record<string, number> = {}
    for (const [name, reader] of Object.entries(readers)) {
      const together = await thread.homeAttentionOfEachProjectOnItsOwnThread({ resources: [], now: NOW, reader }, each)
      expect(together.map((one) => one.workspaceId), name).toEqual(each)
      for (const one of together) {
        const alone = shapes.homeAttention(R.attentionNow({ workspaceId: one.workspaceId, resources: [], now: NOW, reader }))
        expect(JSON.stringify(one.reading), `${name}, ${one.workspaceId}`).toBe(JSON.stringify(alone))
      }
      links[name] = together[0]?.reading.read.links ?? 0
    }
    // The two readers differ, so a thread that read for the wrong one would be seen above.
    expect(links['owner'] ?? 0, 'the owner reads the link to the message dee may not read').toBeGreaterThan(links['dee'] ?? 0)
    // And the projects differ, so a thread that read one project for all would be seen above.
    const totals = new Set((await thread.homeAttentionOfEachProjectOnItsOwnThread({ resources: [], now: NOW, reader: readers.owner }, each)).map((one) => one.reading.total))
    expect(totals.size, 'each project has its own number of rows').toBe(each.length)
  }, 120_000)
})

describe('GET /api/attention?shape=other-projects', () => {
  it('answers every project on the list but the one it names, in order, each as its own home shape', async () => {
    const listed = (JSON.parse((await get('/api/workspaces')).body) as { workspaces: { id: string }[] }).workspaces.map((one) => one.id)
    for (const asking of [HERE, OTHERS[1].id]) {
      const got = await get('/api/attention?machine=omit&shape=other-projects', asking)
      expect(got.status, got.body).toBe(200)
      const reply = JSON.parse(got.body) as { leftOut: string; projects: { workspaceId: string; reading: { total: number; visible: { key: string }[] } }[] }
      expect(reply.leftOut).toBe(asking)
      expect(reply.projects.map((one) => one.workspaceId)).toEqual(listed.filter((id) => id !== asking))
      for (const one of reply.projects) {
        const own = JSON.parse((await get('/api/attention?machine=omit&shape=home', one.workspaceId)).body) as { total: number; visible: { key: string }[] }
        expect({ total: one.reading.total, rows: one.reading.visible.map((row) => row.key) }, one.workspaceId).toEqual({
          total: own.total,
          rows: own.visible.map((row) => row.key),
        })
      }
    }
  }, 120_000)

  it('refuses machine=include, which it has no list to answer in', async () => {
    const got = await get('/api/attention?machine=include&shape=other-projects')
    expect(got.status, got.body).toBe(400)
    expect(got.body).toContain('shape=other-projects answers no machine list')
  })
})
