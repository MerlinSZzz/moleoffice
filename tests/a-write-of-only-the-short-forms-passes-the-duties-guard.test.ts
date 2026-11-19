// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE OF ONLY THE SHORT FORMS ON A SECRETARY'S DUTIES PASSES THE DUTIES GUARD. Wave 13s round 106, item 17 of the
 * line's requirements. src/server/lib/records.ts asks the guard of src/server/lib/grant/secretary-duties.ts on a change
 * of a duties record; a label of a few words changes no duty, and until this round it was refused as a duties write.
 *
 * WHAT "ONLY" MEANS: nothing in data changes but the short forms, and the title, summary and kind stay as they are.
 * `data.secretary` says whose duties they are, so a change of it is a duties change. A write that passes the guard still
 * meets the record's ordinary write rules, and anyone those rules let write the record may write its short forms.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The secretaries and the
 * worker are made-up agents with made-up handles, each holding the key the office answered, and none is raised under
 * the person's grant or carries a warrant. The decisions the duties rest on, the duties and every label are made up.
 * The duties fields are read from THE_DUTIES_FIELDS and their types from the kind's own declaration, the refusals from
 * WHY_DUTIES_ARE_REFUSED and the short forms' key from SHORT_FORMS_FIELD, so none is copied here.
 *
 * THE CASES, each on made-up duties of its own for a secretary of its own, so a write one case lets through cannot
 * change what another case meets:
 *   1. the secretary, with its own key and no warrant, writes only the short forms: through POST
 *      /api/records/<id>/short-forms, as a dataPatch naming only them, and as a whole data equal to the stored one but
 *      for them. Each is stored, and the duties, whose they are and the title stay as they were. The worker, which the
 *      ordinary write rules let write the record, writes the label too;
 *   2. the same write with one duties field changed as well is refused as a duties write, for each field of
 *      THE_DUTIES_FIELDS, and nothing is written;
 *   3. the same write with `data.secretary` changed to another secretary is refused, and nothing is written;
 *   4. a change of only the title is still refused, as item 7 decided, and nothing is written.
 *
 * Proof on 24 October 2026, this whole file each time. On round 105's code (tip 34747536e) case 1 was red at the short
 * forms door, refused with WHY_DUTIES_ARE_REFUSED.theGrantAlone, and cases 2 to 4 were green. With round 106's code a
 * control run passed every case. Mutations of the condition records.ts puts on the guard's call, each run alone and
 * restored byte for byte before the next, after which every case passed again:
 *   M1. the guard asked on every change of the kind, as before round 106: case 1 red, at the door;
 *   M2. the condition asked only of the kind, title and summary, so no data key counts: cases 2 and 3 red, each write
 *       stored, case 2 at its first field;
 *   M3. the condition asked with the title left out: case 4 red, the title stored;
 *   M4. the condition asked with `data.secretary` left out of a dataPatch: case 3 red, the other secretary stored.
 * The first version of this file put every case on one set of duties, and under M2 and M4 case 4 went red as well,
 * because case 3's write had named another secretary. Each case has had duties of its own since.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KIND_SPECS, THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_WORKER } from '../src/shared/roles.ts'
import { SHORT_FORMS_FIELD } from '../src/shared/zoom.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { SECRETARY_DUTIES_KIND } from '../src/shared/secretary-duties-record.ts'

type TheGuard = typeof import('../src/server/lib/grant/secretary-duties.ts')

/** The made-up agent no duties name, which case 3 tries to make the duties' secretary. */
const ANOTHER = 'short-forms-another-secretary'
const WORKER = 'short-forms-duties-worker'

let t: TestDb
let app: FastifyInstance
let guard: TheGuard
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
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

/** A made-up agent the person starts, holding the key the office answered. */
async function start(handle: string, role: string): Promise<void> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
  expect(started.status, started.raw).toBe(201)
  keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(started.body.agent?.id ?? ''))
}

/** A new made-up secretary, not raised, and the made-up duties the person files for it on a made-up decision. */
async function madeUpDutiesFor(handle: string): Promise<{ handle: string; id: string }> {
  await start(handle, THE_SECRETARY)
  const decision = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'A made-up decision the duties rest on',
    data: { option_taken: `The made-up secretary ${handle} looks after a made-up area.`, because: 'A made-up reason.', decided_by: THE_OWNER, replaces: [] },
  })
  expect(decision.status, decision.raw).toBe(201)
  const duties = await call('POST', '/api/records', PERSON, {
    kind: SECRETARY_DUTIES_KIND,
    title: 'Made-up duties whose short forms are written',
    data: { secretary: { kind: 'agent', id: idOf(handle) }, area: 'A made-up area for these duties.', restsOn: [String(decision.body.record.id)] },
  })
  expect(duties.status, duties.raw).toBe(201)
  return { handle, id: String(duties.body.record.id) }
}

/** The duties record and its whole ledger, so a refusal can be shown to write nothing and a write to change only the short forms. */
function stored(id: string): { record: { kind: string; title: string; summary: string | null; data: Record<string, unknown> }; changes: number; revisions: number } {
  const sqlite = t.client.sqlite
  const row = sqlite.prepare('SELECT kind, title, summary, data FROM records WHERE id = ?').get(id) as { kind: string; title: string; summary: string | null; data: string }
  const count = (table: string): number => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE record_id = ?`).get(id) as { n: number }).n
  return { record: { ...row, data: JSON.parse(row.data) as Record<string, unknown> }, changes: count('changes'), revisions: count('revisions') }
}

/** The newest revision of the duties, which a short form names as what it was made from. */
async function newestRevision(id: string): Promise<{ seq: number; contentHash: string }> {
  const read = await call('GET', `/api/records/${id}/revisions`, PERSON)
  expect(read.status, read.raw).toBe(200)
  const newest = [...(read.body.revisions as { seq: number; contentHash: string }[])].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the duties have no revision')
  return { seq: newest.seq, contentHash: newest.contentHash }
}

/** A made-up label as a short-forms value, made from the newest revision. */
async function aLabel(id: string, text: string): Promise<Record<string, unknown>> {
  return { label: { text, madeFrom: await newestRevision(id), writtenBy: 'agent' } }
}

/** The label the record holds now. */
function theLabel(id: string): unknown {
  const forms = stored(id).record.data[SHORT_FORMS_FIELD] as { label?: { text?: unknown } } | undefined
  return forms?.label?.text
}

/**
 * A MADE-UP CHANGE TO ONE DUTIES FIELD, of the type the kind declares for it. A type this does not know fails here, so
 * a new kind of field is met by a new change rather than skipped.
 */
function aChangeTo(field: string): unknown {
  const declared = KIND_SPECS[SECRETARY_DUTIES_KIND].fields.find((one) => one.key === field)
  if (declared === undefined) throw new Error(`the duties kind declares no field ${field}`)
  const words = `A made-up change to ${field}.`
  if (declared.type === 'string') return words
  if (declared.type === 'string[]') return [words]
  if (declared.type === 'Record<string, unknown>[]') return [{ area: words }]
  throw new Error(`this test makes no change to a field of type ${declared.type} (${field})`)
}

/** Every duty and whose they are, which a write of only the short forms leaves exactly as it found them. */
function theDutiesAndWhoseTheyAre(data: Record<string, unknown>): unknown {
  return { duties: guard.theDutiesIn(data), secretary: data['secretary'] }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  guard = await import('../src/server/lib/grant/secretary-duties.ts')
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  await start(ANOTHER, THE_SECRETARY)
  await start(WORKER, THE_WORKER)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a write of only the short forms on a secretary's duties", () => {
  it('1: the secretary, with no warrant, writes only the short forms by every door, and so does the worker', async () => {
    const { handle, id } = await madeUpDutiesFor('short-forms-secretary-one')
    const before = stored(id)
    const door = await call('POST', `/api/records/${id}/short-forms`, as(handle), {
      madeFrom: await newestRevision(id),
      forms: { label: 'Made-up label by door' },
    })
    expect(door.status, door.raw).toBe(200)
    expect(theLabel(id)).toBe('Made-up label by door')

    const patched = await call('PATCH', `/api/records/${id}`, as(handle), {
      dataPatch: { [SHORT_FORMS_FIELD]: await aLabel(id, 'Made-up label by patch') },
    })
    expect(patched.status, patched.raw).toBe(200)
    expect(theLabel(id)).toBe('Made-up label by patch')

    const held = stored(id).record.data
    const whole = await call('PATCH', `/api/records/${id}`, as(handle), {
      data: { ...held, [SHORT_FORMS_FIELD]: { ...(held[SHORT_FORMS_FIELD] as object), ...(await aLabel(id, 'Made-up whole data label')) } },
    })
    expect(whole.status, whole.raw).toBe(200)
    expect(theLabel(id)).toBe('Made-up whole data label')

    // ANYONE THE ORDINARY WRITE RULES LET WRITE THE RECORD, and not only the secretary and the person.
    const worker = await call('POST', `/api/records/${id}/short-forms`, as(WORKER), {
      madeFrom: await newestRevision(id),
      forms: { label: 'Made-up label by worker' },
    })
    expect(worker.status, worker.raw).toBe(200)
    expect(theLabel(id)).toBe('Made-up label by worker')

    const after = stored(id)
    expect(after.revisions).toBe(before.revisions + 4)
    expect(theDutiesAndWhoseTheyAre(after.record.data)).toEqual(theDutiesAndWhoseTheyAre(before.record.data))
    expect({ ...after.record, data: null }).toEqual({ ...before.record, data: null })
  })

  it('2: the same write with one duties field changed is refused as a duties write, for each field', async () => {
    const { handle, id } = await madeUpDutiesFor('short-forms-secretary-two')
    expect(guard.THE_DUTIES_FIELDS.length, 'the guard names no duties field').toBeGreaterThan(0)
    for (const field of guard.THE_DUTIES_FIELDS) {
      const before = stored(id)
      const change = aChangeTo(field)
      expect(before.record.data[field], `${field} already holds the made-up change`).not.toEqual(change)
      const refused = await call('PATCH', `/api/records/${id}`, as(handle), {
        dataPatch: { [SHORT_FORMS_FIELD]: await aLabel(id, `Made-up label with ${field}`), [field]: change },
      })
      expect(refused.status, `${field}: ${refused.raw}`).toBe(403)
      expect(refused.error, field).toContain(guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone)
      expect(stored(id), field).toEqual(before)
    }
  })

  it('3: the same write with whose duties they are changed is refused, and nothing is written', async () => {
    const { handle, id } = await madeUpDutiesFor('short-forms-secretary-three')
    const before = stored(id)
    const refused = await call('PATCH', `/api/records/${id}`, as(handle), {
      dataPatch: { [SHORT_FORMS_FIELD]: await aLabel(id, 'Made-up label, another secretary'), secretary: { kind: 'agent', id: idOf(ANOTHER) } },
    })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.notTheSecretary)
    expect(stored(id)).toEqual(before)
  })

  it('4: a change of only the title is still refused, and nothing is written', async () => {
    const { handle, id } = await madeUpDutiesFor('short-forms-secretary-four')
    const before = stored(id)
    const refused = await call('PATCH', `/api/records/${id}`, as(handle), { title: 'Made-up duties with a new title' })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain(guard.WHY_DUTIES_ARE_REFUSED.theGrantAlone)
    expect(stored(id)).toEqual(before)
  })
})
