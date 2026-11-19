// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REVISION RESTORE CANNOT MOVE A FIELD ONLY THE OFFICE WRITES. Problem A3kDeaw1nsH3, task -1A-PyyCJ-pt.
 *
 * `needsNoCheck` and `endedWithItsMergeEntry` are written by the office alone: `submitASecretarysDesignEntry` and
 * `testOrBounce`, both through `patchRecord` in process. POST and PATCH /api/records refuse them from every caller.
 * POST /api/records/:id/revisions/:seq/restore writes a whole earlier version of the data, and before this it did
 * not ask, so putting back a version from before the office wrote either field took the field off.
 *
 * WHAT IS PROVED HERE, for each of the two fields, against a real database and the real restore door:
 *   1. The record holds the field and the version does not: 403 with the sentence, and the record, its version and
 *      its revision count are as they were.
 *   2. The version holds the field and the record does not: 403.
 *   3. Both hold it with different values: 403.
 *   4. Both hold the same value, or both leave it out: 200, as before.
 *   5. A restore across a kind change that would take the field off: 403, and the kind has not moved either.
 *   6. Taking back an act on the person's words, which puts back the version before the act through the same
 *      `restoreRevision`, is refused the same way when that version would take the field off, and writes nothing.
 *
 * HOW THE STATES ARE MADE. The office's two real writers need a merge entry and a secretary, and neither ever takes
 * the field off. So each state here is written by calling `patchRecord` in the test office as the office
 * (`THE_OFFICE`, from src/server/lib/inspection.ts), under the field's internal door mark. It is
 * not the office's own merge flow, and the values are synthetic. Case 6 needs a revision that is an act on the
 * person's words. No real warranted act can be made on a run, so the test marks one revision as such an act by a
 * direct write to the `revisions.warrant` column in the test database, with synthetic words.
 *
 * MUTATION PROOFS, each after a control, recorded in the commit message: the refusal taken out of `restoreRevision`
 * turns cases 1, 2, 3, 5 and 6 red; the field list in `anOfficeOnlyFieldAWholeDataWouldMove` cut to one field turns
 * the other field's cases red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ENDED_WITH_ITS_MERGE_ENTRY, NEEDS_NO_CHECK } from '../src/shared/releasing.ts'
import type { Actor } from '../src/server/lib/records.ts'

let t: TestDb
let app: FastifyInstance
let theOffice: Actor

const WORKSPACE = 'default'
const asPerson = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const FIELDS = [
  {
    field: NEEDS_NO_CHECK,
    refusal: "The office writes needsNoCheck when it files a run for a secretary's design/-only merge entry. Nothing was written.",
    one: { decision: 'synthetic-decision-one', at: '2026-09-25 09:00:00', because: 'Synthetic: the first value.' },
    other: { decision: 'synthetic-decision-two', at: '2026-09-25 09:30:00', because: 'Synthetic: the second value.' },
  },
  {
    field: ENDED_WITH_ITS_MERGE_ENTRY,
    refusal:
      "The office writes endedWithItsMergeEntry on a merge entry's check-again run when that check refuses and the entry bounces. Nothing was written.",
    one: { entry: 'synthetic-entry-one', at: '2026-09-25 09:00:00', because: 'Synthetic: the first value.' },
    other: { entry: 'synthetic-entry-two', at: '2026-09-25 09:30:00', because: 'Synthetic: the second value.' },
  },
] as const

const revisions = (id: string) => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n

async function restore(id: string, seq: number) {
  const r = await app.inject({ method: 'POST', url: `/api/records/${id}/revisions/${seq}/restore`, headers: asPerson })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A finished run with no office-only field, at revision 1. */
function aRun(title: string): string {
  return t.api.createRecord({
    kind: 'session',
    title,
    workspaceId: WORKSPACE,
    actor: { type: 'human', id: THE_PERSON },
    origin: 'fixture',
    data: { state: 'finished' },
  }).id
}

/** The office writes the field as `value`, or takes it off when `value` is undefined. Each call is one revision. */
function theOfficeWrites(id: string, field: typeof NEEDS_NO_CHECK | typeof ENDED_WITH_ITS_MERGE_ENTRY, value: unknown): void {
  const data = { ...t.api.getRecord(id)!.data }
  if (value === undefined) delete data[field]
  else data[field] = value
  t.doors.asTheDoorOf(field, () => t.api.patchRecord(id, { data, replace: true }, theOffice))
}

/** Everything a refused restore must leave as it was. */
function standing(id: string) {
  const record = t.api.getRecord(id)!
  return { kind: record.kind, title: record.title, data: record.data, revisions: revisions(id) }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  theOffice = (await import('../src/server/lib/inspection.ts')).THE_OFFICE
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe.each(FIELDS)('a restore and $field', ({ field, refusal, one, other }) => {
  it('refuses a version without the field when the record holds it, and writes nothing', async () => {
    const run = aRun(`Synthetic run that the office marks with ${field}`)
    theOfficeWrites(run, field, one)
    const before = standing(run)
    expect(before.revisions).toBe(2)

    const r = await restore(run, 1)
    expect(r.status, r.raw).toBe(403)
    expect(r.body['error']).toBe(
      `${refusal} Version 1 does not hold that field and this record holds it now, so putting that version back would take the field off.`,
    )
    expect(standing(run)).toEqual(before)
  })

  it('refuses a version holding the field when the record does not hold it now', async () => {
    const run = aRun(`Synthetic run the office marked and then unmarked with ${field}`)
    theOfficeWrites(run, field, one)
    theOfficeWrites(run, field, undefined)
    const before = standing(run)
    expect(before.data[field]).toBeUndefined()

    const r = await restore(run, 2)
    expect(r.status, r.raw).toBe(403)
    expect(r.body['error']).toBe(
      `${refusal} Version 2 holds that field and this record does not hold it now, so putting that version back would put the field back on.`,
    )
    expect(standing(run)).toEqual(before)
  })

  it('refuses a version holding a different value of the field', async () => {
    const run = aRun(`Synthetic run the office marked twice with ${field}`)
    theOfficeWrites(run, field, one)
    theOfficeWrites(run, field, other)
    const before = standing(run)

    const r = await restore(run, 2)
    expect(r.status, r.raw).toBe(403)
    expect(r.body['error']).toBe(
      `${refusal} Version 2 holds a different value of that field from the one this record holds now, so putting that version back would change it.`,
    )
    expect(standing(run)).toEqual(before)
  })

  it('puts back a version holding the same value of the field', async () => {
    const run = aRun(`Synthetic run marked with ${field}, then renamed`)
    theOfficeWrites(run, field, one)
    t.api.patchRecord(run, { title: `Synthetic run marked with ${field}, renamed` }, { type: 'human', id: THE_PERSON })

    const r = await restore(run, 2)
    expect(r.status, r.raw).toBe(200)
    const after = t.api.getRecord(run)!
    expect(after.title).toBe(`Synthetic run marked with ${field}, then renamed`)
    expect(after.data[field]).toEqual(one)
    expect(revisions(run)).toBe(4)
  })

  it('puts back a version when neither it nor the record holds the field', async () => {
    const run = aRun(`Synthetic run never marked with ${field}`)
    t.api.patchRecord(run, { title: `Synthetic run never marked with ${field}, renamed` }, { type: 'human', id: THE_PERSON })

    const r = await restore(run, 1)
    expect(r.status, r.raw).toBe(200)
    expect(t.api.getRecord(run)!.title).toBe(`Synthetic run never marked with ${field}`)
    expect(revisions(run)).toBe(3)
  })

  it('refuses a restore across a kind change before the kind is written', async () => {
    const id = t.api.createRecord({
      kind: 'note',
      title: `Synthetic note that becomes a run marked with ${field}`,
      workspaceId: WORKSPACE,
      actor: { type: 'human', id: THE_PERSON },
      origin: 'fixture',
      data: {},
    }).id
    t.api.patchRecord(id, { kind: 'session' }, { type: 'human', id: THE_PERSON })
    t.api.patchRecord(id, { dataPatch: { state: 'finished' } }, { type: 'human', id: THE_PERSON })
    theOfficeWrites(id, field, one)
    const before = standing(id)
    expect(before.kind).toBe('session')

    const r = await restore(id, 1)
    expect(r.status, r.raw).toBe(403)
    expect(r.body['error']).toBe(
      `${refusal} Version 1 does not hold that field and this record holds it now, so putting that version back would take the field off.`,
    )
    expect(standing(id)).toEqual(before)
  })

  it('refuses to take back an act when the version before it would take the field off, and writes nothing', async () => {
    const run = aRun(`Synthetic run with an act on the words, then marked with ${field}`)
    t.api.patchRecord(run, { title: `Synthetic run with an act on the words, then marked with ${field}, renamed` }, { type: 'human', id: THE_PERSON })
    // A DIRECT WRITE IN THE TEST DATABASE: revision 2 is marked as an act on the person's words. The words are synthetic.
    const words = {
      saidBy: THE_PERSON,
      words: 'Synthetic words, written by this test.',
      where: 'terminal',
      when: '2026-09-25 09:00:00',
      for: [run],
    }
    t.client.sqlite.prepare('UPDATE revisions SET warrant = ? WHERE record_id = ? AND seq = 2').run(JSON.stringify(words), run)
    theOfficeWrites(run, field, one)
    const before = standing(run)
    expect(before.revisions).toBe(3)

    const r = await app.inject({ method: 'POST', url: `/api/records/${run}/revisions/2/revoke`, headers: asPerson })
    expect(r.statusCode, r.body).toBe(403)
    expect((r.json() as { error: string }).error).toBe(
      `${refusal} Version 1 does not hold that field and this record holds it now, so putting that version back would take the field off.`,
    )
    expect(standing(run)).toEqual(before)
    const revoked = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ? AND revokes_seq IS NOT NULL').get(run) as { n: number }
    expect(revoked.n).toBe(0)
  })
})
