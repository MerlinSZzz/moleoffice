// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY CARRIES THE RECORDS SOMEBODY ADDED BY NAME, ON TOP OF WHAT ITS SUBJECT CARRIES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B8 of `design/bundle/ACCEPTANCE.md`: choosing what a copy contains stays, even with a detail
 * ladder, which was answer C of a decision. How detailed a copy is and what it
 * contains are two questions, and the ladder answers only the first.
 *
 * A copy's subject was the whole project or exactly one record. A person who wanted the project AND
 * two particular records could not ask for it, and the record search — the only place a record
 * could be named — read as how a copy is composed rather than as what to add to one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A PROJECT-SCOPED COPY CARRIES THEM, under a part of their own, with the reference shape
 *      criterion B18 sets: kind, id, title and what it means here.
 *   2. NAMING RECORDS PUTS THE PART IN, whichever preset the copy uses, so a person does not have
 *      to choose the preset that happens to declare it.
 *   3. THE TWO AXES ARE SEPARATE. The same added records come out at every position of the ladder;
 *      the position changes what each one says, not whether it is there.
 *   4. A NAME THAT ANSWERS TO NOTHING IS REFUSED BY NAME, never quietly dropped, and so is a list
 *      naming none.
 *   5. IT IS STORED AND READ BACK. A filed bundle keeps the list, so the same copy can be made
 *      again later.
 *
 * Proved by mutation with a control run of this file first: dropping the `additionalRecords` clause
 * from `slotsOf` in `src/shared/bundles.ts` turns cases 1, 2 and 3 red, and returning `null` from
 * `whyTheseAdditionalRecordsCannotBeUsed` turns case 4 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_RUNGS, SCOPES } from '../src/shared/bundles.ts'

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
}, 60_000)
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
async function aRecord(kind: string, title: string, data: unknown, summary?: string): Promise<string> {
  const made = await post('/api/records', { kind, title, ...(summary === undefined ? {} : { summary }), data })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

describe('a copy carries the records somebody added by name', () => {
  it('carries them under a part of their own, named in the reference shape', async () => {
    const one = await aRecord('claim', 'The seed window is measured in wall-clock time', {}, 'And that is the bug.')
    const two = await aRecord('report', 'What the first night measured', {})
    // A preset that carries none of these kinds, so the two below can only be here because they
    // were added by name.
    const preview = await get(
      `/api/bundles/preview?preset=owner_governance&detail=gist&additionalRecords=${one},${two}`,
    )
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const text = String(preview.body.text)

    // 1 and 2. THE PART IS IN, AND IT CARRIES THEM.
    expect(text).toContain(SCOPES.additionalRecords.heading)
    expect(text).toContain(`(claim, ${one})`)
    expect(text).toContain(`(report, ${two})`)
    const { COPY_SAYS } = await import('../src/server/lib/continuation.ts')
    expect(text).toContain(COPY_SAYS.addedByName)
    const part = (preview.body.parts as { name: string; carried: number }[]).find(
      (p) => p.name === 'additionalRecords',
    )
    expect(part?.carried).toBe(2)
  })

  it('carries the same records at every position, because the two axes are different questions', async () => {
    const one = await aRecord('claim', 'The seed window is measured in wall-clock time', {}, 'And that is the bug.')
    for (const detail of BUNDLE_RUNGS) {
      const preview = await get(
        `/api/bundles/preview?preset=owner_governance&detail=${String(detail)}&additionalRecords=${one}`,
      )
      expect(preview.status, `at ${String(detail)}: ${JSON.stringify(preview.body)}`).toBe(200)
      // 3. THERE AT EVERY POSITION. What changes is how much it says, not whether it is in.
      expect(String(preview.body.text), `at ${String(detail)}`).toContain(one)
    }
  })

  it('refuses a name that answers to nothing, and a list naming none', async () => {
    const real = await aRecord('claim', 'A real record', {})
    // 4. BY NAME, never quietly dropped.
    const wrong = await get(`/api/bundles/preview?preset=owner_governance&additionalRecords=${real},not-a-record`)
    expect(wrong.status).toBe(400)
    expect(String(wrong.body.error)).toContain('not-a-record')
    expect(String(wrong.body.error)).toContain('no live record in this project')

    // AND A COPY IS NOT ASSEMBLED WITH THE REST. Nothing about the reply is a narrowed success.
    expect(wrong.body.text).toBeUndefined()

    // A LIST NAMING NONE IS NOT ABSENCE. Through the JSON door, where an empty array is somebody
    // sending one rather than a trailing comma in a query string.
    const none = await post('/api/records', {
      kind: 'context_bundle',
      title: 'A copy that names no record to add',
      data: { scope: 'project', preset: 'owner_governance', additionalRecords: [] },
    })
    expect(none.status, JSON.stringify(none.body)).toBe(201)
    const listed = await get('/api/bundles')
    const row = (listed.body.bundles as { id: string; unreadable: string | null }[]).find(
      (one) => one.id === none.body.record.id,
    )
    expect(String(row?.unreadable), 'a bundle naming none of them reads as all of them').toContain(
      'no record was named',
    )
    void real
  })

  it('keeps the list on a filed bundle, so the same copy can be made again', async () => {
    const one = await aRecord('claim', 'The seed window is measured in wall-clock time', {})
    const filed = await post('/api/records', {
      kind: 'context_bundle',
      title: 'The governance pack and two records',
      data: { scope: 'project', preset: 'owner_governance', additionalRecords: [one] },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    // 5. READ BACK OFF THE STORED SPEC.
    const listed = await get('/api/bundles')
    const row = (listed.body.bundles as { id: string; spec: { additionalRecords?: string[] } }[]).find(
      (r) => r.id === filed.body.record.id,
    )
    expect(row?.spec.additionalRecords).toEqual([one])

    // AND THE EXPORT RESOLVES IT, which is the only path that records what left the building.
    const handed = await post('/api/bundles/export', { bundleId: filed.body.record.id })
    expect(handed.status, JSON.stringify(handed.body)).toBe(200)
    expect(String(handed.body.text)).toContain(`(claim, ${one})`)
  })
})
