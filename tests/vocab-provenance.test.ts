// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A RECORD GOT HERE — two values, and the absence that must not be read as one of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Measured on the working database: 385 records, 220 of them written by the generated fixture, and
 * nothing marking which is which. No column, no naming convention, no marker on a screen, nothing
 * in the durable export. Two separate agents read this project's own development record and the
 * robotics content written to exercise a layout as equally true, because there was no way not to.
 *
 * `RECORD_ORIGINS` in src/shared/types.ts is the vocabulary that answers it and `readOrigin` is the
 * reader. This file pins the three things about them that are easy to lose:
 *
 *   1. THERE ARE TWO VALUES. Not a provenance ontology — imported, migrated, restored, inferred —
 *      each of which is a different question with a different reader, several of which the product
 *      already answers elsewhere.
 *   3. AN UNSTAMPED ROW IS NOT `authored`. Every row written before the column exists is unstamped,
 *      and answering "authored" for one would turn the absence of a judgement into a judgement, in
 *      the exact direction that makes fixture content read as real.
 *
 * The column and the migration are the next wave's; the vocabulary and the reader are here, so both
 * can be built against one set of words.
 *
 * NO DATABASE. A pure read of one declaration file.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import {
  readOrigin,
  type PanelRecord } from '../src/shared/types.ts'

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


describe('reading an origin off a record', () => {
  it('reads both words back', () => {
    expect(readOrigin('authored')).toBe('authored')
    expect(readOrigin('fixture')).toBe('fixture')
  })

  it('is not fooled by the case and spacing a hand-written row can hold', () => {
    expect(readOrigin('  FIXTURE ')).toBe('fixture')
  })

  it('ANSWERS NULL FOR A ROW NOBODY HAS STAMPED, AND NULL IS NOT "authored"', () => {
    // The one that matters. Every row in the product is in this state today, because the column
    // does not exist yet; every row written before the migration will be in it afterwards unless
    // somebody stamps it. A reader that defaults to `authored` here reports 220 fixture records as
    // part of the project record, which is the exact failure the field was added to end.
    expect(readOrigin(undefined)).toBeNull()
    expect(readOrigin(null)).toBeNull()
    expect(readOrigin('')).toBeNull()
    expect(readOrigin('   ')).toBeNull()

    for (const stamped of [readOrigin(undefined), readOrigin(null)]) {
      expect(stamped, 'an unstamped record was read as a judgement somebody made').not.toBe('authored')
    }
  })

  it('answers null for a word this vocabulary has never heard of, rather than the nearest one', () => {
    expect(readOrigin('seeded')).toBeNull()
    expect(readOrigin('synthetic')).toBeNull()
    expect(readOrigin('real')).toBeNull()
    expect(readOrigin(1)).toBeNull()
    expect(readOrigin({ origin: 'fixture' })).toBeNull()
  })

})

describe('the field on the record itself', () => {

  it('reads an unstamped record as unstamped when the field is simply not there', () => {
    const record: PanelRecord = {
      id: 'rec-2',
      kind: 'note',
      workspaceId: 'default',
      ownerId: THE_TEST_OFFICES_OWNER.id,
      title: 'a note written before the column existed',
      summary: null,
      data: {},
      createdAt: '2026-08-11 10:00:00',
      updatedAt: '2026-08-11 10:00:00',
      deletedAt: null,
    }
    expect(readOrigin(record.origin)).toBeNull()
  })
})

// ============================================================ what a reader actually receives

/**
 * THE TESTS ABOVE ARE TYPE-LEVEL, AND THAT IS WHY THIS SECTION EXISTS.
 *
 * Every assertion before this line builds a `PanelRecord` by hand and reads the field off the
 * object it just wrote. All of them passed for a whole wave during which `records.origin` held 290
 * `fixture` stamps on disk and NOT ONE API REPLY CARRIED THE FIELD — `toRecord` in
 * src/server/lib/records.ts did not copy the column, and because the field is optional on the type,
 * nothing failed to compile and nothing went red. Every screen that had learnt to draw provenance
 * drew "origin not served" over a fully stamped corpus.
 *
 * So these ask the SERVER, over HTTP, on records it really wrote: is the stamp on the row the same
 * stamp a reader is handed? A test that constructs the answer it is checking cannot see this class
 * of defect at all.
 */
describe('the origin a reader is handed is the origin on the row', () => {
  /** Stamp a row the way the migration does — the column, not a key inside `data`. */
  const stamp = (id: string, word: string | null): void => {
    t.client.sqlite.prepare('UPDATE records SET origin = ? WHERE id = ?').run(word, id)
  }

  it('carries the stamp on one record, over HTTP', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'A fixture note', actor: t.api.HUMAN })
    stamp(record.id, 'fixture')

    const res = await app.inject({ method: 'GET', url: `/api/records/${record.id}` })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { record: { origin?: unknown } }).record.origin).toBe('fixture')
  })

  it('carries it on every row of the list, which is where most records are ever seen', async () => {
    const fixture = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Generated', actor: t.api.HUMAN })
    const authored = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Real work', actor: t.api.HUMAN })
    const unstamped = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Nobody has said', actor: t.api.HUMAN })
    stamp(fixture.id, 'fixture')
    stamp(authored.id, 'authored')
    stamp(unstamped.id, null)

    const res = await app.inject({ method: 'GET', url: '/api/records' })
    const rows = (res.json() as { records: Array<{ id: string; origin?: unknown }> }).records
    const by = new Map(rows.map((r) => [r.id, r]))

    // The field is PRESENT on all three. Absent would mean the reply did not carry it, which a
    // screen must be able to tell apart from "nobody stamped this row".
    for (const id of [fixture.id, authored.id, unstamped.id]) {
      expect(by.get(id), `record ${id} is missing from the list`).toBeDefined()
      expect('origin' in (by.get(id) as object), `record ${id} was served with no origin field`).toBe(true)
    }
    expect(by.get(fixture.id)?.origin).toBe('fixture')
    expect(by.get(authored.id)?.origin).toBe('authored')
    // Nobody has said. NOT `authored` — that is the one direction this field must never guess in.
    expect(by.get(unstamped.id)?.origin).toBeNull()
  })

  it('reads a word nothing could have written as nobody-has-said, not as authored', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Hand edited', actor: t.api.HUMAN })
    // Only a hand edit can put this here. The column is text, so the type system is not the check.
    stamp(record.id, 'imported')

    const res = await app.inject({ method: 'GET', url: `/api/records/${record.id}` })
    expect((res.json() as { record: { origin?: unknown } }).record.origin).toBeNull()
  })

  it('survives a write: patching a record does not drop or invent its origin', async () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Still fixture after editing', actor: t.api.HUMAN })
    stamp(record.id, 'fixture')

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record.id}`,
      headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { summary: 'edited' },
    })
    expect(res.statusCode, res.body).toBe(200)
    // A record's origin is how it ENTERED the corpus. Editing it later does not make it authored,
    // and the reply a caller reads back must not say it did.
    expect((res.json() as { record: { origin?: unknown } }).record.origin).toBe('fixture')
  })
})

// ============================================================ what a NEW record says

/**
 * A RECORD FILED TODAY SAYS HOW IT GOT HERE, and for one wave it did not.
 *
 * The column landed, 385 existing rows were classified by measurement — 290 fixture, 95 authored,
 * two independent lines of evidence that had to agree on every row — and `createRecord` was not
 * changed. So every record filed from that moment on stored NULL, which a reader is told means
 * *nobody has recorded how this got here*. That is false about a record somebody had just filed
 * through the API, and it is false in the direction that makes the whole mark useless: a corpus
 * whose new rows are all unclassified cannot be read for what is real.
 *
 * Nothing failed, because the expensive part — recovering 385 origins by measurement — had been
 * done and tested, and nobody asked what the NEXT record would say.
 */
describe('a record filed now says how it got here', () => {
  it('is authored when it arrives over HTTP, because that is what filing one is', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { kind: 'note', title: 'Filed by an agent doing the work', data: {} },
    })
    expect(res.statusCode, res.body).toBe(201)
    expect((res.json() as { record: { origin?: unknown } }).record.origin).toBe('authored')
  })

  it('cannot be told its own provenance by the request body', async () => {
    // A caller saying "this record of mine is fixture" is a claim HTTP cannot make honestly: a
    // request arriving with an actor on it is authored by definition. The strict body refuses the
    // key rather than accepting and ignoring it, which would be the quiet half of the same problem.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' },
      payload: { kind: 'note', title: 'Trying to mark itself fixture', data: {}, origin: 'fixture' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('is authored through the library too, so no write path is left behind', () => {
    const record = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Filed in process', actor: t.api.HUMAN })
    expect(t.api.getRecord(record.id)?.origin).toBe('authored')
  })

  it('is fixture when the generator says so, which is the one caller that knows different', () => {
    const record = t.api.createRecord({ workspaceId: 'default',
      kind: 'note',
      title: 'Written by the fixture path',
      actor: t.api.HUMAN,
      origin: 'fixture',
    })
    expect(t.api.getRecord(record.id)?.origin).toBe('fixture')
  })

  it('carries the origin onto a block, which is filed through its pipeline and not through create', () => {
    // A block is a record and takes a different road to the table. Sixty-one of the 290 fixture
    // rows in the measured corpus are blocks, so a road that dropped the stamp would leave a fifth
    // of the fixture corpus unmarked.
    const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Sim-to-real', actor: t.api.HUMAN })
    const plain = t.blocks.addBlock(pipeline.id, { name: 'Plan the approach', state: 'todo' }, t.api.HUMAN)
    expect(t.api.getRecord(plain.block.id)?.origin).toBe('authored')

    const seeded = t.blocks.addBlock(
      pipeline.id,
      { name: 'Written by the fixture path', state: 'todo', origin: 'fixture' },
      t.api.HUMAN,
    )
    expect(t.api.getRecord(seeded.block.id)?.origin).toBe('fixture')
  })
})
