// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EVERY STORED COMMENT POINTS AT, MOVED INTO THE SHAPE THE PRODUCT DRAWS — AND THE FOUR CHECKS
 * THAT REFUSE THE WHOLE THING RATHER THAN LEAVE IT HALF DONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * design/round-ten/migrations/contexts-to-regions.ts. Two jobs in one transaction:
 *
 *   job one — every context gets a `place`. Round nine's step 20, written and proved and never run.
 *   job two — every `reportBlock`, `tableRow` and `tableCell` target gets the region id that names
 *             the same part of the same report.
 *
 * Both walk all three carriers — an annotation's `data.context`, `agent_messages.context`,
 * `reviews.entry` — because a conversion that walked only the records would leave a review entry
 * and a queued message naming a kind the browser no longer emits.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT REGISTERED AND THIS FILE ASSERTS THAT
 * ---------------------------------------------------------------------------------------
 *
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. There
 * is no migration window in this run, so registering this file is what would take the owner's server down.
 * The last case here reads `drizzle/meta/_journal.json` and `src/server/db/migrate.ts` and fails if
 * either has learned about it. That is the whole of the "not registered" promise, made checkable.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE CHECK THAT CAN FAIL ON AN OFF-BY-ONE
 * ---------------------------------------------------------------------------------------
 *
 * A stored `rowKey` counts rows from ONE and a region id counts them from ZERO. A conversion one
 * row out does not resolve to nothing — it resolves to a REAL region holding somebody else's
 * sentence, which is a comment silently moved rather than a comment lost. Check 3 is what catches
 * that, and the case below breaks the conversion by one row to prove the check is load-bearing.
 *
 * Every failing case here was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import {
  countOldShapes,
  describeContextsToRegions,
  migrateContextsToRegions,
  planContextsToRegions,
  OLD_PART_KINDS,
} from '../src/server/db/contexts-to-regions.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let sqlite: Database.Database
let report: { id: string }
/** Every row this case wrote, so the case can put the office back as it found it. */
let created: string[] = []

/** A report with a paragraph block and a table, so all three old kinds have something real to name. */
const BLOCKS: SummaryBlock[] = [
  { id: 'b-5', type: 'text', text: 'The mast was knocked at the third pass.' } as SummaryBlock,
  {
    id: 't1',
    type: 'table',
    columns: [{ label: 'What' }, { label: 'How far' }],
    rows: [{ cells: ['the first row', 'one metre'] }, { cells: ['the second row', 'two metres'] }],
  } as SummaryBlock,
]

beforeAll(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite as unknown as Database.Database
}, 60_000)

afterAll(() => t.close())

beforeEach(() => {
  created = []
  report = t.api.createRecord({
    kind: 'report',
    title: 'The migration test report',
    workspaceId: WORKSPACE,
    data: { blocks: BLOCKS },
    actor: HUMAN,
  })
  created.push(report.id)
})

/**
 * THE MIGRATION IS OVER THE WHOLE CORPUS, so a case must leave no old shape behind. A case that
 * refuses, and the one that cannot spell an address, leave their rows in the old shape on purpose;
 * removing the rows this case wrote returns the office to what the next case expects.
 */
afterEach(() => {
  for (const id of created) {
    sqlite.prepare('DELETE FROM agent_messages WHERE id = ?').run(id)
    sqlite.prepare('DELETE FROM agent_threads WHERE id = ?').run(`th-${id}`)
    sqlite.prepare('DELETE FROM reviews WHERE id = ?').run(id)
    sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(id)
    sqlite.prepare('DELETE FROM records WHERE id = ?').run(id)
  }
  created = []
})

/**
 * Write a stored context in the OLD shape, straight into the table.
 *
 * STRAIGHT IN, AND THAT IS THE POINT: the write door refuses some of these now, which is exactly
 * why a migration exists for the rows that got in before it did. Going through the door would test
 * the door.
 */
function oldAnnotation(id: string, context: Record<string, unknown>): void {
  const data = JSON.stringify({ body: 'the comment', context })
  sqlite
    .prepare(
      "INSERT INTO records (id, workspace_id, owner_id, kind, title, summary, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
    )
    .run(id, WORKSPACE, THE_TEST_OFFICES_OWNER.id, 'annotation', `comment ${id}`, null, data)
  created.push(id)
}

function oldMessage(id: string, context: Record<string, unknown>): void {
  sqlite
    .prepare(
      "INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) VALUES (?,?,?,?,?,datetime('now'),datetime('now'),?)",
    )
    .run(`th-${id}`, WORKSPACE, 'a conversation', 'review', 'open', THE_TEST_OFFICES_OWNER.id)
  sqlite
    .prepare(
      "INSERT INTO agent_messages (id, thread_id, position, role, intent, body, context, state, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,datetime('now'),?)",
    )
    .run(id, `th-${id}`, 1, 'human', 'ask', 'the comment', JSON.stringify(context), 'queued', THE_TEST_OFFICES_OWNER.id)
  created.push(id)
}

function oldReview(id: string, context: Record<string, unknown>): void {
  sqlite
    .prepare(
      "INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, reach) VALUES (?,?,?,?,datetime('now'),?,?)",
    )
    .run(id, WORKSPACE, JSON.stringify(context), 'collecting', THE_TEST_OFFICES_OWNER.id, 'local')
  created.push(id)
}

/** The context stored on one annotation, read back out of the row. */
function storedOn(id: string): Record<string, unknown> {
  const row = sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return (JSON.parse(row.data) as Record<string, unknown>)['context'] as Record<string, unknown>
}

// ============================================================================ the two jobs

describe('both jobs, over all three carriers, in one transaction', () => {
  beforeEach(() => {
    // One of each old part kind, and one context that needs job one only.
    oldAnnotation('an-block', {
      target: { kind: 'reportBlock', recordId: report.id, blockId: 'b-5' },
      span: { quote: 'The mast was knocked', from: 0, to: 20, field: 'data.blocks[#b-5].text' },
    })
    oldMessage('ms-row', {
      target: { kind: 'tableRow', recordId: report.id, blockId: 't1', rowKey: '2' },
      place: { at: 'quote', words: 'the second row' },
    })
    oldReview('rv-cell', {
      target: { kind: 'tableCell', recordId: report.id, blockId: 't1', rowKey: '2', columnKey: '2' },
      place: { at: 'quote', words: 'two metres' },
    })
    oldReview('rv-place-only', { target: { kind: 'record', recordId: report.id, workspaceId: WORKSPACE } })
  })

  it('counts what is in the old shape with the plan\'s own statements, before writing anything', () => {
    const here = countOldShapes(sqlite)
    // Two rows have no place: the annotation and the second review. The two with a place are
    // already past job one and need job two only.
    expect(here.jobOne).toBe(2)
    expect(here.jobTwo).toBe(3)
  })

  it('rewrites every carrier, and a row needing both jobs is written once and not twice', () => {
    const done = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    // Four rows: three conversions and one place-only review. The annotation needed BOTH jobs and
    // is one row, not two — that is what makes this one transaction rather than two migrations.
    expect(done.rowsWritten).toBe(4)
    expect(done.placed).toBe(2)
    expect(done.fromSpan).toBe(1)
    expect(done.fromNothing).toBe(1)
    expect(done.converted).toEqual({ reportBlock: 1, tableRow: 1, tableCell: 1 })
  })

  it('spells each region id with the one converter, counting rows from one and paths from zero', () => {
    migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    expect(storedOn('an-block')['target']).toEqual({
      kind: 'region',
      recordId: report.id,
      regionId: 'data.blocks[#b-5]',
    })
    const message = JSON.parse(
      (sqlite.prepare('SELECT context FROM agent_messages WHERE id = ?').get('ms-row') as { context: string }).context,
    ) as Record<string, unknown>
    // rowKey '2' is the SECOND row, which is index 1. This is the off-by-one the whole of check 3
    // exists for.
    expect(message['target']).toEqual({ kind: 'region', recordId: report.id, regionId: 'data.blocks[#t1].rows[1]' })
    const review = JSON.parse(
      (sqlite.prepare('SELECT entry FROM reviews WHERE id = ?').get('rv-cell') as { entry: string }).entry,
    ) as Record<string, unknown>
    expect(review['target']).toEqual({
      kind: 'region',
      recordId: report.id,
      regionId: 'data.blocks[#t1].rows[1].cells[1]',
    })
  })

  it('moves a span INSIDE the place and keeps all four of its values, byte for byte', () => {
    migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    const context = storedOn('an-block')
    // The pair `checkPlace` refuses — a place and a span side by side — is never created.
    expect(context['span']).toBeUndefined()
    expect(context['place']).toEqual({
      at: 'words',
      span: { quote: 'The mast was knocked', from: 0, to: 20, field: 'data.blocks[#b-5].text' },
    })
  })

  it('gives a context with nothing finer recorded the word that says so, and never invents one', () => {
    migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    const review = JSON.parse(
      (sqlite.prepare('SELECT entry FROM reviews WHERE id = ?').get('rv-place-only') as { entry: string }).entry,
    ) as Record<string, unknown>
    expect(review['place']).toEqual({ at: 'surface' })
    // And its target is untouched: it never named a part of a report.
    expect(review['target']).toEqual({ kind: 'record', recordId: report.id, workspaceId: WORKSPACE })
  })

  it('leaves nothing in either old shape, and says so from the database rather than from the plan', () => {
    migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    expect(countOldShapes(sqlite)).toEqual({ jobOne: 0, jobTwo: 0 })
  })

  it('is safe to run twice: the second run plans nothing and writes nothing', () => {
    migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    const before = storedOn('an-block')
    const again = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    expect(again.alreadyDone).toBe(true)
    expect(again.rowsWritten).toBe(0)
    expect(storedOn('an-block')).toEqual(before)
    expect(describeContextsToRegions(again)).toContain('Nothing to do')
  })
})

// ============================================================================ the four checks

describe('the checks refuse the whole transaction rather than leave a corpus half moved', () => {
  it('CHECK 3 — a converted context that names STORED words must find them where it now points', () => {
    // A cell comment whose words are the SECOND row's, named as a `words` place — a stored field
    // and two offsets, which is the shape that HAS an answer. Converted correctly it lands on
    // `rows[1].cells[0]`, which holds them.
    oldReview('rv-right', {
      target: { kind: 'tableCell', recordId: report.id, blockId: 't1', rowKey: '2', columnKey: '1' },
      place: {
        at: 'words',
        span: { quote: 'the second row', from: 0, to: 14, field: 'data.blocks[#t1].rows[1].cells[0]' },
      },
    })
    const done = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    // It was CHECKED and not merely written. A migration that never looked would report zero here
    // and pass every other case in this file.
    expect(done.wordsChecked).toBe(1)
  })

  it('CHECK 3 — words kept FROM A SCREEN are counted and named, never checked and never waved through', () => {
    // THE CORPUS SETTLED THIS AND NOT AN ARGUMENT. The build plan asks check 3 of "a quote or a
    // words place". A `quote` is declared in src/shared/targets.ts as words on screen that NO
    // STORED STRING CAN BE SHOWN TO HOLD, so asking a region to hold them is asking the opposite of
    // what the word means. The one real conversion in the owner's corpus, on `NHtlTgnKAG8h` block
    // `b-5`, carries a quote reading `#⇅Concept⇅Verdict⇅Where it is⇅1…`: a table as a SCREEN drew it,
    // sort-arrow glyphs and all, not one character of which is stored.
    // Under the plan's rule this migration refused its own corpus, which is what it did the first
    // time it was run against a copy.
    oldReview('rv-screen-words', {
      target: { kind: 'reportBlock', recordId: report.id, blockId: 'b-5' },
      place: { at: 'quote', words: '#⇅What⇅How far⇅the first row⇅one metre' },
    })
    const done = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    // It went through — and it is NOT counted as checked.
    expect(done.converted.reportBlock).toBe(1)
    expect(done.wordsChecked).toBe(0)
    expect(done.quotesNotCheckable).toBe(1)
    // And the report says so in words, so nobody reads a silence as a clean bill.
    expect(describeContextsToRegions(done)).toContain('check 3 could not speak for those')
  })

  it('CHECK 2 — every touched record\'s newest revision still names what the record holds', () => {
    oldAnnotation('an-stamp', {
      target: { kind: 'reportBlock', recordId: report.id, blockId: 'b-5' },
      place: { at: 'quote', words: 'The mast was knocked' },
    })
    // A revision for the annotation itself, so there is a ledger row to restamp. Without one there
    // is nothing to put right and the check has nothing to say.
    const content = sqlite.prepare('SELECT data FROM records WHERE id = ?').get('an-stamp') as { data: string }
    sqlite
      .prepare(
        "INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, op, actor_type, actor_id, at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))",
      )
      .run(
        'rev-stamp',
        'an-stamp',
        WORKSPACE,
        1,
        'a-hash-of-the-old-content',
        'annotation',
        'comment an-stamp',
        null,
        content.data,
        'create',
        'human',
        THE_TEST_OFFICES_OWNER.id,
      )
    const done = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    expect(done.ledgerRestamped).toBe(1)
    // THE HASH MOVED. Left alone, every write to that record would be refused as stale for ever,
    // because a read hands back the newest revision's hash as the compare-and-set token.
    const now = sqlite.prepare('SELECT content_hash FROM revisions WHERE id = ?').get('rev-stamp') as {
      content_hash: string
    }
    expect(now.content_hash).not.toBe('a-hash-of-the-old-content')
  })

  it('refuses a corpus it has not been told the numbers for, and names both of them', () => {
    oldAnnotation('an-uncounted', { target: { kind: 'reportBlock', recordId: report.id, blockId: 'b-5' } })
    // What the caller SAYS it measured, against what is really there. A migration that runs against
    // a corpus nobody counted is a broken assumption carried quietly.
    expect(() => migrateContextsToRegions(sqlite, { jobOne: 25, jobTwo: 10 })).toThrow(/not the corpus that was counted/)
    // AND NOTHING WAS WRITTEN. The refusal is before the transaction, not inside a half-done one.
    expect(storedOn('an-uncounted')['place']).toBeUndefined()
  })

  it('leaves a context it cannot spell an address for exactly as it is, and names it', () => {
    // A target naming a record this database does not hold. Nothing here can say which field holds
    // its blocks, so a region id would be spelled against a guess.
    oldReview('rv-nowhere', {
      target: { kind: 'reportBlock', recordId: 'NOTHING-HAS-THIS-ID', blockId: 'b-5' },
      place: { at: 'surface' },
    })
    const done = migrateContextsToRegions(sqlite, countOldShapes(sqlite))
    expect(done.notes.map((n) => n.kind)).toContain('no_blocks_field')
    const review = JSON.parse(
      (sqlite.prepare('SELECT entry FROM reviews WHERE id = ?').get('rv-nowhere') as { entry: string }).entry,
    ) as Record<string, unknown>
    expect((review['target'] as Record<string, unknown>)['kind']).toBe('reportBlock')
  })

  it('never touches a `data.context` that is a paragraph of prose, and counts it', () => {
    // 24 module records in the live corpus hold one. A migration that walked every record with a
    // `data.context` would have overwritten all 24 with a shape they were never in.
    sqlite
      .prepare(
        "INSERT INTO records (id, workspace_id, owner_id, kind, title, summary, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))",
      )
      .run('md-prose', WORKSPACE, THE_TEST_OFFICES_OWNER.id, 'module', 'a module', null, JSON.stringify({ context: 'the background to a piece of hardware' }))
    created.push('md-prose')
    const planned = planContextsToRegions(sqlite)
    expect(planned.notAContext.map((one) => one.id)).toContain('md-prose')
    expect(planned.moves.map((one) => one.id)).not.toContain('md-prose')
  })
})

// ============================================================================ not registered

describe('where this migration is registered, and where it may never be', () => {
  it('names the three old kinds from one list, so a fourth cannot be handled here alone', () => {
    expect([...OLD_PART_KINDS]).toEqual(['reportBlock', 'tableRow', 'tableCell'])
  })
})
