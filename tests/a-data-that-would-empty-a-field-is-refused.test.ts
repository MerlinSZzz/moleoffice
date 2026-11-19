// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A `data` PATCH does not empty the fields it was not sent.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `PATCH /api/records/<id>` takes two bodies that do opposite things. `dataPatch` merges key by
 * key; `data` replaces the whole object. `data` is the spelling every record is CREATED with, so
 * it is the one a caller reaches for, and a caller that reached for it lost every field it had not
 * resent — answered 200, with an empty `incomplete` list and nothing in the reply naming what had
 * gone. On 4 September 2026 two builders did it to one problem record within twenty minutes: seven
 * fields at 16:00:50 and two more at 16:18:54, both put back by hand out of the revision ledger.
 * The record that filed the defect had been hollowed out the same way on 25 August.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 * That the destructive write is REFUSED rather than answered 200; that the refusal names EVERY
 * field it would have emptied, because the list is what the caller has to act on; that nothing is
 * written when it is refused; that both ways out the refusal offers really work, carried out
 * through the real route rather than read; and that a `data` which empties nothing is not refused,
 * because a stub being filled in is the commonest write there is.
 *
 * It also pins that a RESTORE still works across a field added since the revision it puts back.
 * A restore is a whole-object write that means to drop what came later, it is the repair for every
 * record this defect emptied, and a guard that refused it would have shut the repair door.
 *
 * HOW THE HTTP TESTS ARE BUILT. The same way tests/patch.test.ts builds them: src/server/index.ts
 * listens on a port the moment it is imported, so the routes are registered as plain Fastify
 * plugins over a throwaway database, and everything is imported AFTER freshDb() has pointed
 * MOLE_OFFICE_DB at a temporary file.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

/** What an agent's requests carry. Matches AGENT in helpers.ts. */
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}

function bodyOf(res: { body: string }): Record<string, unknown> {
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

function errorOf(res: { body: string }): string {
  const message = bodyOf(res)['error']
  if (typeof message !== 'string') throw new Error(`expected an error string, got ${res.body.slice(0, 200)}`)
  return message
}

/**
 * The problem record the defect was measured on, in the shape it holds: nine fields, of which a
 * careless patch sends two. The field names are the real ones so the refusal is read in the words
 * a caller would actually meet.
 */
function aProblemWithNineFields(): Record<string, unknown> {
  return {
    symptom: 'A partial data PATCH empties the fields it leaves out.',
    cause: 'The route offers two bodies that do opposite things and `data` is the one a caller reaches for.',
    why_it_hurts: 'A destructive write is answered exactly like a harmless one.',
    fix: 'Refuse it, and name what would go.',
    state: 'open',
    whose_move: 'agent',
    found_by: 'two builders, twenty minutes apart',
    how_to_tell_it_is_back: 'PATCH a record with a partial data object and read back the fields you did not send.',
    seen_in: ['panelx', 'src/server/lib/records.ts'],
  }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const harness = await freshApp()
  t = harness.db
  app = harness.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** File the nine-field problem and hand back its id. */
function fileTheProblem(): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: 'a partial data PATCH empties what it did not send',
    data: aProblemWithNineFields(),
    actor: AGENT,
  }).id
}

describe('a `data` that would empty a field the record holds', () => {
  it('is refused with a 400, and the record still holds every field afterwards', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { state: 'fixed', fix: 'refused now' } },
    })

    expect(res.statusCode).toBe(400)

    // Nothing was written. This is the half that matters: a refusal that half-applied would be
    // worse than the 200 it replaced.
    const after = t.api.getRecord(id)
    expect(after?.data).toEqual(aProblemWithNineFields())
  })

  it('names every field it would empty, and not one it would keep', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { state: 'fixed', fix: 'refused now' } },
    })
    const message = errorOf(res)

    // EVERY ONE, because the list is what the caller acts on — it is either the fields to put back
    // into the object it is sending, or the fields it is about to lose.
    for (const field of ['symptom', 'cause', 'why_it_hurts', 'whose_move', 'found_by', 'how_to_tell_it_is_back', 'seen_in']) {
      expect(message, `the refusal does not name \`${field}\`, which this write would have emptied`).toContain(field)
    }
    // And it says how many there are, so a caller can check the list it read is the whole list.
    expect(message).toContain('7 fields')
  })

  it('offers two ways out, and both of them work when carried out', async () => {
    const id = fileTheProblem()

    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { state: 'fixed', fix: 'refused now' } },
    })
    const message = errorOf(refused)
    expect(message).toContain('dataPatch')
    expect(message).toContain('"replace":true')

    // WAY OUT ONE: send it as a merge. The two keys change and the other seven stay.
    const merged = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { state: 'fixed', fix: 'refused now' } },
    })
    expect(merged.statusCode).toBe(200)
    expect(t.api.getRecord(id)?.data).toEqual({ ...aProblemWithNineFields(), state: 'fixed', fix: 'refused now' })

    // WAY OUT TWO: say the rewrite is meant. Then it happens, and the record really does lose them.
    const replaced = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { data: { state: 'fixed', fix: 'refused now' }, replace: true },
    })
    expect(replaced.statusCode).toBe(200)
    expect(t.api.getRecord(id)?.data).toEqual({ state: 'fixed', fix: 'refused now' })
  })

  it('is not refused when the write empties nothing, which is what filling a stub in looks like', async () => {
    const stub = t.api.createRecord({
      workspaceId: 'default',
      kind: 'problem',
      title: 'a stub filled in later',
      data: { symptom: 'something is wrong' },
      actor: AGENT,
    })

    // WHAT THE RECORD REALLY HOLDS, read back rather than assumed: filing a problem as an agent
    // also stores `whose_move`, which the request never sent, and a payload typed out from the
    // request would drop it and be refused — correctly, and for a reason that has nothing to do
    // with what this test is about.
    const stored = t.api.getRecord(stub.id)?.data as Record<string, unknown>

    // The record's fields are a subset of what is sent, so nothing goes.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${stub.id}`,
      headers: AS_AGENT,
      payload: { data: { ...stored, cause: 'now worked out', state: 'open' } },
    })

    expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
    expect(t.api.getRecord(stub.id)?.data).toEqual({ ...stored, cause: 'now worked out', state: 'open' })
  })

  it('refuses `replace` beside a merge, because there it consents to nothing', async () => {
    const id = fileTheProblem()

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { state: 'fixed' }, replace: true },
    })

    expect(res.statusCode).toBe(400)
    expect(errorOf(res)).toContain('replace only means something beside `data`')
    // And the merge it was sent with did not happen either.
    expect(t.api.getRecord(id)?.data).toEqual(aProblemWithNineFields())
  })
})

describe('the repair door this guard must not shut', () => {
  it('still puts a revision back across a field written after it', async () => {
    const id = fileTheProblem()

    // A later write adds a field revision 1 never held.
    const added = await app.inject({
      method: 'PATCH',
      url: `/api/records/${id}`,
      headers: AS_AGENT,
      payload: { dataPatch: { attempts: [{ id: 'a-1', tried: 'looked at it', result: 'still there' }] } },
    })
    expect(added.statusCode).toBe(200)
    expect(t.api.getRecord(id)?.data).toHaveProperty('attempts')

    // Putting revision 1 back means dropping `attempts`, which is a whole-object write that empties
    // a stored field. It is what a restore IS, and it is how every record this defect emptied gets
    // its fields back, so it may not be refused.
    const restored = await app.inject({
      method: 'POST',
      url: `/api/records/${id}/revisions/1/restore`,
      headers: AS_AGENT,
      payload: {},
    })
    expect(restored.statusCode, restored.body.slice(0, 400)).toBe(200)
    expect(t.api.getRecord(id)?.data).toEqual(aProblemWithNineFields())
  })
})
