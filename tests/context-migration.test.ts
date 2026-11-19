// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE MESSAGE IN THE OWNER'S CORPUS SURVIVES, WITH ITS WORDS AND WHAT IT POINTED AT.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH ROW THIS IS ABOUT, AND WHY IT IS NAMED
 * ---------------------------------------------------------------------------------------
 *
 * The live corpus holds exactly one row in `agent_messages`. It is `mGYhhpVnfVbZ`: the owner
 * pointed at a line of a plan on 18 August 2026 and wrote *"some of the things still cannot be
 * used as agent call (the right click)"*. It is still queued — it was never sent to anybody — and
 * that one row is the whole of what round seven produced in real use.
 *
 * IT IS CHECKED BY ID AND NOT BY COUNTING ROWS. A count says a row is there; it does not say WHICH
 * row, and a migration that dropped the owner's message and left one it had created itself would pass a
 * count. The id, the words and the target are asserted individually.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE MIGRATION IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Round seven stored one of four shapes in `agent_messages.context`, one of which wrapped another
 * in an `inside` field. Round eight separates the three facts that were folded together — WHAT
 * THING, WHICH WORDS, WHICH REVISION — so the same comment is stored as {target, span, revision}.
 * There is no additive way out: the read path dispatches through one declared vocabulary, and a row
 * left in the old shape reads as a context with no target at all.
 *
 * NO DATABASE OF THE OWNER'S IS TOUCHED BY ANY OF THIS. Every test here builds its own throwaway
 * file and writes the owner's row into it, which is the only honest way to test a migration against a shape
 * that no longer exists anywhere.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { migrateContexts, planContextMigration } from '../src/server/db/context-migration.ts'

/** The owner's row, exactly as the live corpus holds it. */
const THE_OWNERS_ROW = {
  id: 'mGYhhpVnfVbZ',
  body: 'some of the things still cannot be used as agent call (the right click)',
  context: '{"kind":"planLine","planId":"BcO6p5CRMhk3","lineId":"Omc1DshUbkBq"}',
}

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

/** Put a conversation and a message into this throwaway database, in the round-seven shape. */
function write(row: { id: string; body: string; context: string | null; state?: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT OR IGNORE INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
        "VALUES ('th-1', 'default', 'Round seven, in use', 'review', 'open', '2026-08-18 09:40:00', " +
        `'2026-08-18 09:40:00', 'human:${THE_TEST_OFFICES_OWNER.id}')`,
    )
    .run()
  t.client.sqlite
    .prepare(
      'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, context, state, created_at, created_by) ' +
        `VALUES (@id, 'th-1', 1, 'human', 'review', @body, @context, @state, '2026-08-18 09:41:00', 'human:${THE_TEST_OFFICES_OWNER.id}')`,
    )
    .run({ id: row.id, body: row.body, context: row.context, state: row.state ?? 'queued' })
}

/** One row back out, by id. */
function read(id: string): { id: string; body: string; context: string | null; state: string } | undefined {
  return t.client.sqlite.prepare('SELECT id, body, context, state FROM agent_messages WHERE id = ?').get(id) as
    | { id: string; body: string; context: string | null; state: string }
    | undefined
}

describe('the owner’s one message comes through the move with everything it said', () => {
  it('keeps the owner’s words, the owner’s target and the owner’s state, checked by id', () => {
    write(THE_OWNERS_ROW)
    const report = migrateContexts(t.client.sqlite)
    expect(report.moved).toBe(1)

    const after = read(THE_OWNERS_ROW.id)
    expect(after, `the message ${THE_OWNERS_ROW.id} is not in the database at all after the migration`).toBeDefined()
    // THE OWNER'S WORDS, BYTE FOR BYTE.
    expect(after?.body).toBe(THE_OWNERS_ROW.body)
    // AND IT IS STILL WAITING. Nothing about a migration sends anything.
    expect(after?.state).toBe('queued')
    // WHAT THE OWNER POINTED AT, in the new shape and naming the same line of the same plan.
    expect(JSON.parse(after?.context ?? 'null')).toEqual({
      target: { kind: 'planLine', planId: 'BcO6p5CRMhk3', lineId: 'Omc1DshUbkBq' },
    })
  })

  it('changes nothing on a second run, so the command is safe to run twice', () => {
    write(THE_OWNERS_ROW)
    migrateContexts(t.client.sqlite)
    const afterFirst = read(THE_OWNERS_ROW.id)

    const second = migrateContexts(t.client.sqlite)
    expect(second.alreadyDone).toBe(true)
    expect(second.moved).toBe(0)
    expect(second.alreadyNew).toBe(1)
    expect(read(THE_OWNERS_ROW.id)).toEqual(afterFirst)
  })

  it('is what the whole migration command does, not something this test does on its own', async () => {
    // THE PRODUCT'S OWN PATH. `freshDb` has already run `migrateInPlace`, so running it again over a
    // database holding the owner's row in the old shape is exactly what `npm run db:migrate` would do to a
    // corpus that has not been through this yet.
    write(THE_OWNERS_ROW)
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const outcome = migrateInPlace(t.client.sqlite, new URL('../drizzle', import.meta.url).pathname)
    expect(outcome.contexts.moved).toBe(1)
    // AND THE PLACE, which is a SECOND registered step rather than this one. Window B registered
    // `contexts-to-regions`, which runs last and gives every stored context that has none the place
    // it points at — `surface` where nothing finer was ever recorded. What this test is about is the
    // target and the words, and those come through the move untouched; the place beside them is the
    // command doing the rest of its job in the same run.
    expect(JSON.parse(read(THE_OWNERS_ROW.id)?.context ?? 'null')).toEqual({
      target: { kind: 'planLine', planId: 'BcO6p5CRMhk3', lineId: 'Omc1DshUbkBq' },
      place: { at: 'surface' },
    })
    expect(outcome.regions.placed).toBeGreaterThan(0)
  })
})

describe('a quoted span loses its wrapper and keeps every word of what it said', () => {
  it('separates the thing, the words and where they were', () => {
    write({
      id: 'quoted-1',
      body: 'These words claim more than the note does.',
      context: JSON.stringify({
        kind: 'textSpan',
        inside: { kind: 'record', recordId: 'rec-1', workspaceId: 'default' },
        quote: 'nobody measured it',
        from: 34,
        to: 52,
        field: 'data.body',
      }),
    })
    migrateContexts(t.client.sqlite)
    expect(JSON.parse(read('quoted-1')?.context ?? 'null')).toEqual({
      target: { kind: 'record', recordId: 'rec-1', workspaceId: 'default' },
      span: { quote: 'nobody measured it', from: 34, to: 52, field: 'data.body' },
    })
  })

  it('keeps a span that never said which field its words came from, without inventing one', () => {
    write({
      id: 'quoted-2',
      body: 'These words.',
      context: JSON.stringify({
        kind: 'textSpan',
        inside: { kind: 'scheduleBlock', windowId: 'w-1' },
        quote: 'the bench jig',
        from: 0,
        to: 13,
      }),
    })
    migrateContexts(t.client.sqlite)
    const span = (JSON.parse(read('quoted-2')?.context ?? 'null') as { span: Record<string, unknown> }).span
    expect(span).toEqual({ quote: 'the bench jig', from: 0, to: 13 })
    expect('field' in span, 'the migration invented a field nobody wrote').toBe(false)
  })
})

describe('it leaves alone every row it cannot read, and says which they are', () => {
  it('does not guess at unreadable JSON', () => {
    write({ id: 'broken-1', body: 'Something.', context: '{this is not json' })
    const report = migrateContexts(t.client.sqlite)
    expect(report.moved).toBe(0)
    expect(report.notes.map((n) => n.kind)).toEqual(['unreadable'])
    expect(report.notes[0]?.messageId).toBe('broken-1')
    // UNTOUCHED, byte for byte. A migration that "repaired" this would be inventing what somebody
    // pointed at.
    expect(read('broken-1')?.context).toBe('{this is not json')
  })

  it('does not guess at a kind no vocabulary declares', () => {
    write({ id: 'odd-1', body: 'Something.', context: '{"kind":"sofa","sofaId":"s-1"}' })
    const report = migrateContexts(t.client.sqlite)
    expect(report.moved).toBe(0)
    expect(report.notes[0]?.kind).toBe('unknown_kind')
    expect(report.notes[0]?.detail).toContain('sofa')
    expect(read('odd-1')?.context).toBe('{"kind":"sofa","sofaId":"s-1"}')
  })

  it('does not guess at a quoted span with nothing to sit inside', () => {
    write({ id: 'orphan-1', body: 'Something.', context: '{"kind":"textSpan","quote":"x","from":0,"to":1}' })
    const report = migrateContexts(t.client.sqlite)
    expect(report.moved).toBe(0)
    expect(report.notes[0]?.kind).toBe('no_inside')
    expect(read('orphan-1')?.context).toBe('{"kind":"textSpan","quote":"x","from":0,"to":1}')
  })

  it('counts a comment that points at nothing in particular, which is not a problem', () => {
    write({ id: 'nowhere-1', body: 'Just a thought.', context: null })
    const report = migrateContexts(t.client.sqlite)
    expect(report.withoutContext).toBe(1)
    expect(report.notes).toEqual([])
    expect(report.alreadyDone).toBe(true)
  })

  it('plans without writing, so a preview really is a preview', () => {
    write(THE_OWNERS_ROW)
    const plan = planContextMigration(t.client.sqlite)
    expect(plan.moves.length).toBe(1)
    expect(read(THE_OWNERS_ROW.id)?.context).toBe(THE_OWNERS_ROW.context)

    const dry = migrateContexts(t.client.sqlite, { dryRun: true })
    expect(dry.moved).toBe(1)
    expect(read(THE_OWNERS_ROW.id)?.context, 'a dry run wrote to the database').toBe(THE_OWNERS_ROW.context)
  })
})
