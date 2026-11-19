// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROBLEM FILED AS A PRECEDENT EXISTS AS A RECORD — AND KEEPS EXISTING, EVEN IF LATER DELETED.
 *
 * Criterion C12 of design/rules/ACCEPTANCE.md: "The nine unrecorded breaks are filed as problem
 * records before their stories leave the general file. Measured: nine records exist, and the
 * general file's byte drop is accounted for by them."
 *
 * WHAT THIS FILE DOES NOT DO, AND WHY. C12 as written is a claim about nine specific real records
 * (RhAHVHveDB_w, 1xu5HcnWLEOh, KqxqjrMe2Iv4, HBK0VDhdov78, QQif1APDo4DI, _MarxD4lT-_d, baDqSKkkAUNS,
 * pARzefS9GUEh, LEllZO6AkfpK, per design/rules/ACCEPTANCE.md section 5) in the live corpus. Nothing
 * in this worktree may reach that corpus — the brief this test was written under forbids touching
 * the live office's port or its database — so whether those nine ids still resolve to live rows is not
 * something a test run from here can answer, and the byte-accounting half of the criterion is a
 * one-time arithmetic check on a historical file, not an ongoing property code can guard. What this
 * file proves is the mechanism "nine records exist" rests on: that Mole Office can truthfully tell
 * "this id names a problem that was filed" apart from "this id was never used" and from "this
 * problem was later deleted" — because a precedent that quietly stopped existing the moment
 * somebody deleted it would make "filed" a promise the product cannot keep.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A FILED PROBLEM IS FOUND BY ITS ID: `GET /api/records/<id>` answers 200 with `kind:
 *      "problem"`.
 *   2. AN ID NOBODY EVER USED IS REFUSED, NOT ANSWERED: 404, distinctly.
 *   3. A DELETED PROBLEM STILL EXISTS AS A RECORD. Deleting it here is soft (`DELETE
 *      /api/records/:id`'s own note: "the record stays, marked"), so "exists as a record" survives
 *      a delete — which is exactly what makes "nine problem records exist" a claim that can
 *      outlive whatever later happens to them, rather than one a single deletion could make false
 *      by accident.
 *
 * Proved by mutation with a control run of this file first: in src/server/lib/records.ts,
 * narrowing `getRecord`'s query from `.where(eq(records.id, id))` to also require
 * `isNull(records.deletedAt)` turns case 3 red — a deleted problem stops being found at all, which
 * is precisely the failure this file exists to catch.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function del(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'DELETE', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

describe('a problem filed as a precedent exists as a record, and keeps existing', () => {
  it('is found by its id, as a problem', async () => {
    const made = await post('/api/records', {
      kind: 'problem',
      title: 'A break this test invents',
      data: { symptom: 'invented for this test', state: 'open' },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const id = made.body.record.id as string

    const read = await get(`/api/records/${id}`)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body.record.kind).toBe('problem')
  })

  it('an id nobody ever used is refused, distinctly, not answered', async () => {
    const read = await get('/api/records/NEVER-FILED-ANYTHING-HERE')
    expect(read.status).toBe(404)
  })

  it('still exists as a record after it is deleted', async () => {
    const made = await post('/api/records', {
      kind: 'problem',
      title: 'A break this test deletes',
      data: { symptom: 'invented for this test', state: 'open' },
    })
    const id = made.body.record.id as string

    const gone = await del(`/api/records/${id}`)
    expect(gone.status, JSON.stringify(gone.body)).toBe(200)

    const read = await get(`/api/records/${id}`)
    expect(read.status, 'a filed problem must still exist as a record after a soft delete').toBe(200)
    expect(read.body.record.kind).toBe('problem')
    expect(read.body.record.deletedAt, 'the delete itself should be visible, not undone').not.toBeNull()
  })
})
