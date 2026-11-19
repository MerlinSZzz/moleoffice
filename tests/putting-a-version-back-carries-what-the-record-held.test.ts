// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUTTING A VERSION BACK IS NOT WRITING A RETIRED LENGTH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * `card`, `brief` and `account` were retired on 2 September 2026, when reading levels 4, 5 and 6
 * became the by-part structure. Criterion A14 says what that retirement means: what is stored under
 * one of those keys stays, nothing draws it, and the door refuses a NEW one.
 *
 * The door read every arrival as new. A put-back is an ordinary patch of the whole of `data`, so a
 * version of the record that carried a `card` came back through the same gate and was refused for
 * carrying it. Measured on 3 September 2026 by the fifth verification, on a copy of the live
 * database: restoring the oldest version of report `OOOt4Kouc5dT` answered 200 and dropped its
 * short forms, and every later version was then unreachable — 400, `shortForms.card` is retired.
 * All 26 reports in the project store all three keys, so the act the record page offers in words,
 * *put a version back*, was refused on every one of them. Problem `MBqNmPWlSeQs`.
 *
 * ---------------------------------------------------------------------------------------
 * THE LINE THIS FILE DRAWS
 * ---------------------------------------------------------------------------------------
 *
 * A value under a retired key that some version of this record held is the record's own history
 * coming back, and it goes through. A value no version ever held is somebody writing a retired
 * length, and it is refused. Both halves are asserted here, because a fix that only opened the door
 * would have retired nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   delete the `someRevisionHeld` line from the retired-keys loop in `settleShortForms` →
 *     sections 1 and 2 go red: the put-back is refused again.
 *   make `someRevisionHeld` return true always → section 3 goes red: a new `card` is stored.
 *   drop the three `z.never` keys from the write route's `forms` → section 4 goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { RETIRED_SHORT_FORM_KEYS, SHORT_FORM_SPECS } from '../src/shared/zoom.ts'

type RevisionsLib = typeof import('../src/server/lib/revisions.ts')

const BODY = [
  { id: 'b-1', type: 'heading', text: 'What broke' },
  {
    id: 'b-2',
    type: 'text',
    text: 'Three of four printed wrist mounts cracked at about fifteen newtons, at the thin section behind the bolt circle.',
  },
]

/** What the report held under the retired keys before they were retired. */
const HELD_LONG_AGO = 'Four printed wrist mounts were pulled on the bench jig and three of them broke.'

/** Words this record has never held, at any version. */
const NEVER_HELD = 'Somebody typing a card today, which is the thing the retirement refuses.'

const AS_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/builder-k-ladder-fixes',
  'x-mole-office-session': 'sess-putback',
}

interface Harness {
  t: TestDb
  app: FastifyInstance
  revisions: RevisionsLib
  report: string
}

let h: Harness

beforeAll(async () => {
  const t = await freshDb()
  const revisions = await import('../src/server/lib/revisions.ts')
  const { app } = await apiApp()
  await app.ready()
  h = { t, app, revisions, report: '' }
}, 60_000)

beforeEach(() => {
  h.report = h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'Wrist mount pull test, round eight',
    data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-03' },
    actor: h.t.api.HUMAN,
  }).id
})

afterAll(async () => {
  await h.app.close()
  h.t.close()
})

/** The newest entry of the report's ledger: the pair a writer has to send. */
function newest(): { seq: number; contentHash: string } {
  const entry = h.revisions.listRevisions(h.report).revisions[0]
  if (entry === undefined) throw new Error('the seeded report has no revisions')
  return { seq: entry.seq, contentHash: entry.contentHash }
}

/** One stored form, in the shape the field declaration gives as its example. */
function form(text: string): Record<string, unknown> {
  return { text, madeFrom: newest(), writtenBy: 'agent', by: 'claude-code/older-run', at: '2026-08-20 11:00:00' }
}

/**
 * PUT THE THREE RETIRED FORMS INTO A VERSION OF THIS RECORD, the way history holds them.
 *
 * The forms are written straight into the row, because the gate this file is about is exactly what
 * stops them being written through a route today: a record in the live corpus holds them because
 * they were written before the retirement, and no test can reach that state through the door. The
 * title patch that follows is an ordinary write, and it is what puts a version carrying them into
 * the ledger — so the version the put-backs below reach for is one the product itself wrote.
 */
function aVersionCarryingTheRetiredForms(): void {
  writeDataBypassingTheGate(h.t, h.report, {
    blocks: BODY,
    for: THE_TEST_OFFICES_OWNER.name,
    date: '2026-09-03',
    shortForms: Object.fromEntries(RETIRED_SHORT_FORM_KEYS.map((key) => [key, form(HELD_LONG_AGO)])),
  })
  h.t.api.patchRecord(h.report, { title: 'Wrist mount pull test, round eight (checked)' }, h.t.api.HUMAN)
}

/** Put version `seq` back, the way the record page's button does. */
function putBack(seq: number): Promise<LightMyRequestResponse> {
  return h.app.inject({
    method: 'POST',
    url: `/api/records/${h.report}/revisions/${String(seq)}/restore`,
    payload: {},
    headers: { ...AS_AGENT },
  })
}

/** What the record holds under `shortForms` right now. */
function storedForms(): Record<string, unknown> {
  const record = h.t.api.getRecord(h.report)
  const data = (record?.data ?? {}) as { shortForms?: Record<string, unknown> }
  return data.shortForms ?? {}
}

function refusal(res: LightMyRequestResponse): string {
  return (res.json() as { error?: string }).error ?? res.body
}

/** A plain record edit that writes one key of `shortForms`. The second door onto the same field. */
function patchForm(key: string, value: unknown): Promise<LightMyRequestResponse> {
  return h.app.inject({
    method: 'PATCH',
    url: `/api/records/${h.report}`,
    payload: { dataPatch: { shortForms: { [key]: value } } } as InjectOptions['payload'],
    headers: { ...AS_AGENT },
  })
}

// ============================================================ 1. the put-back goes through

describe('a version of a report that held a retired form can be put back', () => {
  it('puts the version back and brings its card, brief and account with it', async () => {
    aVersionCarryingTheRetiredForms()
    const withTheForms = newest().seq

    // The first put-back drops them, which is what a put-back to a version before they existed
    // means, and which has always been allowed.
    const backToTheStart = await putBack(1)
    expect(backToTheStart.statusCode, backToTheStart.body).toBe(200)
    expect(Object.keys(storedForms())).toEqual([])

    // And the second brings them back. This is the one that was refused.
    const forward = await putBack(withTheForms)
    expect(forward.statusCode, forward.body).toBe(200)
    for (const key of RETIRED_SHORT_FORM_KEYS) {
      expect(storedForms()[key], key).toMatchObject({ text: HELD_LONG_AGO })
    }
  })

  it('leaves the whole record on the version it was asked for, not half of it', async () => {
    aVersionCarryingTheRetiredForms()
    const withTheForms = newest().seq
    expect((await putBack(1)).statusCode).toBe(200)
    expect((await putBack(withTheForms)).statusCode).toBe(200)
    const record = h.t.api.getRecord(h.report)
    expect(record?.title).toBe('Wrist mount pull test, round eight (checked)')
  })
})

// ============================================================ 2. the same words through the other door

describe('the stored words go through whichever door they arrive at', () => {
  it('accepts a plain PATCH that carries back what a version of this record held', async () => {
    aVersionCarryingTheRetiredForms()
    const held = storedForms()['card']
    expect((await putBack(1)).statusCode, 'the setup put-back').toBe(200)

    const wrote = await patchForm('card', held)
    expect(wrote.statusCode, wrote.body).toBe(200)
    expect(storedForms()['card']).toMatchObject({ text: HELD_LONG_AGO })
  })

  it('still accepts a write that changes nothing, on a record that holds one now', async () => {
    // The rule that was already there: storing back the same bytes forges nothing, so a record
    // holding a retired form is not frozen out of every later edit.
    aVersionCarryingTheRetiredForms()
    const wrote = await patchForm('card', storedForms()['card'])
    expect(wrote.statusCode, wrote.body).toBe(200)
  })
})

// ============================================================ 3. new words are still refused

describe('words no version of this record ever held are refused under a retired key', () => {
  it('refuses a card, a brief and an account nobody ever stored, naming the seven levels', async () => {
    for (const key of RETIRED_SHORT_FORM_KEYS) {
      const refused = await patchForm(key, form(NEVER_HELD))
      expect(refused.statusCode, `${key}: ${refused.body}`).toBe(400)
      expect(refusal(refused), key).toContain(`${key}\` is retired`)
      expect(storedForms()[key], `${key} was not stored`).toBeUndefined()
    }
  })

  it('refuses a change to the words a version held, which is a new write wearing an old key', async () => {
    aVersionCarryingTheRetiredForms()
    const refused = await patchForm('card', form(NEVER_HELD))
    expect(refused.statusCode, refused.body).toBe(400)
    expect(storedForms()['card'], 'the words this record held are untouched').toMatchObject({
      text: HELD_LONG_AGO,
    })
  })

  it('refuses words another record held, because the ledger read is of this record', async () => {
    aVersionCarryingTheRetiredForms()
    const other = h.t.api.createRecord({
      workspaceId: 'default',
      kind: 'report',
      title: 'A different report entirely',
      data: { blocks: BODY, for: THE_TEST_OFFICES_OWNER.name, date: '2026-09-03' },
      actor: h.t.api.HUMAN,
    }).id
    const refused = await h.app.inject({
      method: 'PATCH',
      url: `/api/records/${other}`,
      payload: { dataPatch: { shortForms: { card: form(HELD_LONG_AGO) } } } as InjectOptions['payload'],
      headers: { ...AS_AGENT },
    })
    expect(refused.statusCode, refused.body).toBe(400)
  })
})

// ============================================================ 4. the write route is unchanged

describe('the front door still refuses a retired length by name', () => {
  it('refuses card, brief and account on POST /api/records/:id/short-forms', async () => {
    aVersionCarryingTheRetiredForms()
    for (const key of RETIRED_SHORT_FORM_KEYS) {
      const refused = await h.app.inject({
        method: 'POST',
        url: `/api/records/${h.report}/short-forms`,
        payload: { madeFrom: newest(), forms: { [key]: SHORT_FORM_SPECS.gist.example } },
        headers: { ...AS_AGENT },
      })
      expect(refused.statusCode, `${key}: ${refused.body}`).toBe(400)
      expect(refusal(refused), key).toContain(key)
    }
  })
})
