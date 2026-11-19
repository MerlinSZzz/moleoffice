// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DIRECTION CAN BE SHELVED, AND IT LEAVES THE OPEN LOOPS. CRITERION S1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY EACH HALF IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * The whole shape of this: a line of research that is stopped, or shelved, is kept rather than
 * deleted, so a later reader finds it. A shelf is NOT a pause —
 * a pause waits on purpose and is expected back, and this file proves the difference where it is
 * real: a shelved direction leaves the open loops and the counts, while a paused one does not.
 *
 * The shelving act is the person's, or the secretary's on the owner's own quoted words. Three cases are
 * tested side by side, because a file that only proved the refusal would pass with the door welded
 * shut and a file that only proved the acceptance would pass with the door taken off:
 *
 *   1. the door writes `since`, `because` and `restart_when`, and refuses a shelf with no reason;
 *   2. an agent is refused in the refusal's own words, the person is not, and the secretary
 *      carrying the owner's quoted words is not;
 *   3. the open-loop reading drops the shelved direction by one, names it in its own bucket with
 *      its own sentence, and still serves the record to a reader.
 *
 * NOTHING HERE READS A BODY TO DECIDE MEMBERSHIP. The open-loop check is a stored fact — the
 * `shelved` object on the direction's own data — and the test an agent writes no prose at all.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { LeftOutBucket, OpenLoops } from '../src/server/lib/openloops.ts'

/**
 * A project for the case alone. The open loops are read for one project, and a shelved direction is
 * counted in its bucket there, so a project each case owns is what keeps one case's shelf out of
 * another's count. It is not a narrower read: the reading was always for one project.
 */
let PROJECT = 'default'
let caseNumber = 0

let AS_PERSON: Record<string, string>
let AS_AGENT: Record<string, string>
let AS_OTHER_AGENT: Record<string, string>

/** What the owner said, and where and when. The words are the owner's, copied. */
const THE_OWNERS_WORDS = {
  saidBy: THE_TEST_OFFICES_OWNER.id,
  words: '这一部分先搁置，以后有需要再做',
  where: 'terminal',
  when: '2026-09-15 09:14',
} as const

function about(...ids: string[]): Record<string, unknown> {
  return { ...THE_OWNERS_WORDS, for: ids }
}

/** A direction as the person files it, at a depth that is true of a written design. */
function aDirection(title = 'A direction somebody stopped and kept'): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'direction',
    title,
    summary: 'A line of research that was written down and then stopped.',
    data: { depth: 'read', depth_reason: 'The design was written, and nothing was run.' },
    actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
  }).id
}

/** The whole shelf, the shape the door stores. */
const A_SHELF = {
  since: '2026-09-15',
  because: 'It was over-built before any real need, so it was stopped on purpose.',
  restart_when: 'a task that needs this design again',
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = AS_PERSON,
): Promise<{ status: number; error: string; body: unknown }> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  const body = res.json() as { error?: string }
  return { status: res.statusCode, error: body.error ?? '', body }
}

function stored(id: string): Record<string, unknown> {
  return (t.api.getRecord(id) as { data: Record<string, unknown> }).data
}

let t: TestDb
let app: FastifyInstance
let openLoopsFor: (ask: { workspaceId: string }) => OpenLoops
let LEFT_OUT_SENTENCES: Record<LeftOutBucket, string>

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const openloops = await import('../src/server/lib/openloops.ts')
  openLoopsFor = (ask) => openloops.openLoopsFor(ask)
  LEFT_OUT_SENTENCES = openloops.LEFT_OUT_SENTENCES
  // THE CARD THE SECRETARY'S HALF ASKS FOR, registered once as the person, the way a card is issued.
  const card = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
      'x-mole-office-workspace': 'default',
    },
    payload: { handle: 'claude-code', name: 'Claude Code', role: 'secretary' },
  })
  expect(card.statusCode, card.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  PROJECT = `shelved-case-${String(caseNumber)}`
  AS_PERSON = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': PROJECT,
  }
  AS_AGENT = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'claude-code',
    'x-mole-office-workspace': PROJECT,
  }
  AS_OTHER_AGENT = { ...AS_AGENT, 'x-mole-office-actor-id': 'claude-other' }
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: PROJECT, title: 'A project for one case' } })
  expect(made.statusCode, made.body).toBe(201)
})

// ============================================================================ a. the door

describe('the shelving door writes the three facts and insists on a reason', () => {
  it('stores since, because and restart_when, and refuses a shelf with no because', async () => {
    const id = aDirection()

    // A SHELF WITH NO REASON IS REFUSED INSIDE THE OBJECT. The shape's own required field is what
    // does it, so the refusal is the schema's and not a sentence this file wrote.
    const noReason = await patch(id, { dataPatch: { shelved: { since: '2026-09-15' } } })
    expect(noReason.status, noReason.error).toBe(400)
    expect(noReason.error).toContain('data.shelved.because is required')
    expect(stored(id)['shelved']).toBeUndefined()

    const done = await patch(id, { dataPatch: { shelved: A_SHELF } })
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['shelved']).toEqual(A_SHELF)
  })
})

// ============================================================================ b. who may do it

describe('only the person, or the secretary on the owner’s quoted words, may shelve', () => {
  it('refuses an agent in the guard’s own sentence, and writes nothing', async () => {
    const id = aDirection()
    const refused = await patch(id, { dataPatch: { shelved: A_SHELF } }, AS_AGENT)
    expect(refused.status).toBe(403)
    // THE SENTENCE, IN ITS OWN WORDS. What was refused, who may do it, and the way through.
    expect(refused.error).toContain('put this direction on the shelf')
    expect(refused.error).toContain('this request came from agent "claude-code"')
    expect(refused.error).toContain("a shelf is the person's own act")
    expect(refused.error).toContain('by their press in Mole Office')
    expect(refused.error).toContain('by the secretary on their own words carried as a warrant')
    expect(refused.error).toContain('nothing was written')
    expect(stored(id)['shelved']).toBeUndefined()
  })

  it('does not refuse the person, and the person may take it off again', async () => {
    const id = aDirection()
    const done = await patch(id, { dataPatch: { shelved: A_SHELF } })
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['shelved']).toEqual(A_SHELF)

    const cleared = await patch(id, { dataPatch: { shelved: null } })
    expect(cleared.status, cleared.error).toBe(200)
    expect(stored(id)['shelved']).toBeUndefined()
  })

  it('does not refuse a secretary carrying the person’s own quoted words', async () => {
    const id = aDirection()
    const done = await patch(id, { dataPatch: { shelved: A_SHELF }, warrant: about(id) }, AS_AGENT)
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['shelved']).toEqual(A_SHELF)
  })

  it('still refuses an agent that is not the secretary even with the owner’s words', async () => {
    const id = aDirection()
    const refused = await patch(id, { dataPatch: { shelved: A_SHELF }, warrant: about(id) }, AS_OTHER_AGENT)
    expect(refused.status).toBe(403)
    expect(stored(id)['shelved']).toBeUndefined()
  })

  it('leaves an ordinary direction write to an agent alone', async () => {
    // THE GUARD IS ON THE SHELF AND NOWHERE ELSE. An agent may still patch the depth, which is the
    // write the direction kind is for.
    const id = aDirection()
    const done = await patch(id, { dataPatch: { depth: 'ran' } }, AS_AGENT)
    expect(done.status, done.error).toBe(200)
    expect(stored(id)['depth']).toBe('ran')
  })
})

// ============================================================================ c. the open loops

describe('a shelved direction leaves the open loops and is still a record', () => {
  it('drops the count by one, names it in its own bucket, and still serves it', async () => {
    // A second open loop, so the drop is one of two and not an empty list becoming empty.
    t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'task',
      title: 'A task that stays open',
      data: { state: 'doing' },
      actor: { type: 'agent', id: 'claude-code' },
    })
    const id = aDirection()

    const before = openLoopsFor({ workspaceId: PROJECT })
    expect(before.loops.some((loop) => loop.id === id), 'the direction was not open before the shelf').toBe(true)
    expect(before.leftOut.some((group) => group.bucket === 'shelved')).toBe(false)

    const done = await patch(id, { dataPatch: { shelved: A_SHELF } })
    expect(done.status, done.error).toBe(200)

    const after = openLoopsFor({ workspaceId: PROJECT })
    expect(after.loops.some((loop) => loop.id === id), 'a shelved direction is still an open loop').toBe(false)
    expect(after.attachment.openLoopsInProject).toBe(before.attachment.openLoopsInProject - 1)

    const group = after.leftOut.find((one) => one.bucket === 'shelved')
    expect(group, 'the shelf has no bucket of its own').toBeDefined()
    expect(group?.count).toBe(1)
    expect(group?.ids).toEqual([id])
    // THE BUCKET SAYS WHAT IT IS, in the reader’s own sentence, word for word.
    expect(group?.sentence).toBe(LEFT_OUT_SENTENCES.shelved)
    expect(group?.sentence).toContain('shelved')

    // AND IT IS NOT `finished`. A shelved direction has not finished, which is the whole point.
    expect(after.leftOut.find((one) => one.bucket === 'finished')?.ids ?? []).not.toContain(id)

    // NEVER DELETED: the record is still there and a reader still gets it.
    expect(t.api.getRecord(id)).not.toBeNull()
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_PERSON })
    expect(read.statusCode).toBe(200)
    expect((read.json() as { record: { data: { shelved?: unknown } } }).record.data.shelved).toEqual(A_SHELF)
  })

  it('does not drop a paused direction, which is a different fact', async () => {
    // THE OTHER DIRECTION, so the shelf cannot have been implemented as "any put-down record".
    const id = t.api.createRecord({
      workspaceId: PROJECT,
      kind: 'direction',
      title: 'A direction that is paused, not shelved',
      data: { depth: 'read', paused: { since: '2026-09-15', why: 'Waiting on the gauge.' } },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true },
    }).id
    const after = openLoopsFor({ workspaceId: PROJECT })
    expect(after.loops.some((loop) => loop.id === id), 'a paused direction is not an open loop').toBe(true)
  })
})
