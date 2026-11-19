// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TASK SAYS WHOSE IT IS, WHAT IT WAITS ON AND WHAT IT IS PART OF. Wave 13s round 142, the third part of item 38 of
 * the line's requirements: a task names its agent, a task can wait on a
 * condition, and a task can point to the record it belongs to.
 *
 * ONE OF THE THREE IS NEW. `holder` on a task, declared in src/shared/kinds.ts, names whose task it is by kind and
 * registry id, as a booking's and a watch's holder do, and src/server/lib/participant-fields.ts refuses one no
 * registry row answers to. The other two were already there and are proved here where a reader meets them: a task
 * paused until a condition is on the attention reading's paused list with that condition and off today's list, and a
 * `part_of` link from a task is on the task's own read. The task's rules say both, so an agent reading GET /api/kinds
 * finds them.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agent is a made-up
 * agent with a made-up handle, holding the key the office answered. Every task, condition and record here is made up.
 *
 * THE CASES, in order, on one world:
 *   1. a task declares `holder` as a participant, and its rules say how a task waits on a condition and how it points
 *      to the record it belongs to;
 *   2. an agent files a task it holds, and one the person holds, and each is stored as it was sent;
 *   3. a task held by a handle, or by an id no registry row answers to, is refused with 400 and nothing is written;
 *   4. a task paused until a condition is on the paused list with that condition, and not on today's list;
 *   5. a task linked `part_of` to the record it belongs to shows that record on its own read.
 *
 * RED BEFORE: cases 1 to 3, as no task held a `holder`. Cases 4 and 5 prove what was already there and were green.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - `holder` is taken out of the task's fields: cases 1 to 3 are red;
 *   - `task` is taken out of PARTICIPANT_FIELDS: cases 1 and 3 are red;
 *   - the rule naming `part_of` is taken out of the task's rules: case 1 is red;
 *   - the attention rule's sentence no longer says a pause's condition: case 4 is red;
 *   - the record read no longer carries the links from the record: case 5 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KIND_SPECS } from '../src/shared/kinds.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { namesAParticipant } from '../src/shared/sections.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const HOLDER = 'task-holding-worker'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let agentKey = ''
let agentId = ''

const asTheAgent = (): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HOLDER,
  'x-mole-office-key': agentKey,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

/** How many tasks the table holds, deleted or not. */
function tasksStored(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'task'").get() as { n: number }).n
}

async function fileATask(title: string, data: Record<string, unknown>): Promise<string> {
  const filed = await call('POST', '/api/records', asTheAgent(), { kind: 'task', title, data })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const started = await call('POST', '/api/agents/started', PERSON, { handle: HOLDER, name: HOLDER, role: THE_WORKER })
  expect(started.status, started.raw).toBe(201)
  agentKey = String(started.body.whatToGiveIt?.key ?? '')
  agentId = String(started.body.agent?.id ?? '')
  // Case 3 tells a handle from a registry id, so the two have to differ here.
  expect(agentId).not.toBe(HOLDER)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a task', () => {
  it('1. declares whose it is, and its rules say how it waits on a condition and what it is part of', () => {
    const spec = KIND_SPECS.task
    const holder = spec.fields.find((one) => one.key === 'holder')
    expect(holder, 'a task declares no holder').toBeDefined()
    expect(holder!.type).toBe('ParticipantRef')
    expect(holder!.required).toBe(false)
    expect(namesAParticipant('task', 'holder')).toBe(true)
    const rules = spec.rules ?? []
    expect(rules.some((rule) => rule.includes('paused') && rule.includes('until') && rule.includes('condition')), 'no rule says how a task waits on a condition').toBe(true)
    expect(rules.some((rule) => rule.includes('part_of')), 'no rule says how a task points to the record it belongs to').toBe(true)
  })

  it('2. is filed held by an agent, or by the person, and stored as it was sent', async () => {
    for (const holder of [
      { kind: 'agent', id: agentId },
      { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    ]) {
      const data = { state: 'todo', holder }
      const id = await fileATask(`Made-up task held by a made-up ${holder.kind}`, data)
      const read = await call('GET', `/api/records/${id}`, asTheAgent())
      expect(read.status, read.raw).toBe(200)
      expect(read.body.record.data).toEqual(data)
    }
  })

  it('3. refuses a task held by a handle or by nobody, and writes nothing', async () => {
    const before = tasksStored()
    for (const holder of [
      { kind: 'agent', id: HOLDER },
      { kind: 'person', id: 'made-up-nobody' },
    ]) {
      const refused = await call('POST', '/api/records', asTheAgent(), {
        kind: 'task',
        title: `A made-up task held by nobody, as a ${holder.kind}`,
        data: { state: 'todo', holder },
      })
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.error).toContain(`data.holder names the ${holder.kind} "${holder.id}"`)
      expect(refused.error).toContain('Nothing was written.')
    }
    expect(tasksStored()).toBe(before)
  })

  it('4. waits on a condition: it is on the paused list with the condition, and not on today’s list', async () => {
    const condition = 'the made-up disk is 99% full'
    const id = await fileATask('Made-up task that waits on a condition', {
      state: 'todo',
      paused: { since: '2026-10-29', why: 'Made-up: there is nothing to clear until then.', until: { condition } },
    })
    const read = await call('GET', '/api/attention?machine=omit&shape=full', asTheAgent())
    expect(read.status, read.raw).toBe(200)
    const paused = (read.body.paused as { rows: { recordId: string; standing: string; note: string }[] }).rows.find((one) => one.recordId === id)
    expect(paused, 'the paused task is not on the paused list').toBeDefined()
    expect(paused!.standing).toBe('condition-in-words')
    expect(paused!.note).toContain(condition)
    const today = [...(read.body.visible as { recordId: string }[]), ...(read.body.remainder as { rows: { recordId: string }[] }).rows]
    expect(today.map((row) => row.recordId)).not.toContain(id)
  })

  it('5. points to the record it belongs to, and its own read shows that record', async () => {
    const whole = await call('POST', '/api/records', asTheAgent(), {
      kind: 'note',
      title: 'Made-up warrant for a made-up upgrade',
      data: { body: 'Made-up: the made-up upgrade may go ahead.' },
    })
    expect(whole.status, whole.raw).toBe(201)
    const wholeId = String(whole.body.record.id)
    const part = await fileATask('Made-up step after the made-up upgrade', { state: 'todo' })
    const linked = await call('POST', '/api/links', asTheAgent(), { fromId: part, toId: wholeId, type: 'part_of' })
    expect(linked.status, linked.raw).toBe(201)
    const read = await call('GET', `/api/records/${part}`, asTheAgent())
    expect(read.status, read.raw).toBe(200)
    const belongsTo = (read.body.links as { type: string; isBacklink: boolean; other: { id: string } }[]).filter((one) => one.type === 'part_of' && !one.isBacklink)
    expect(belongsTo.map((one) => one.other.id)).toEqual([wholeId])
  })
})
