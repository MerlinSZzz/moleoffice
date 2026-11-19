// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RETITLE: 89 BLOCK TITLES, WRITTEN AND PROVED AND NOT REGISTERED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/migrations/block-identity.ts` takes the pipeline's title off every block's own
 * title. It is not in `migrateInPlace` and must not be: `npm run db:migrate` runs on every clone and
 * on every server start, and this rewrites the display title of every block there is.
 *
 * Four things have to be true of it, and each one is a way a corpus gets quietly broken:
 *
 *   1. IT REFUSES A CORPUS IT HAS NOT MEASURED. Eleven counts, re-measured against the database in
 *      front of it, compared with what the caller says it counted. Any difference and nothing is
 *      written.
 *   2. IT REFUSES A COLLISION. Two live blocks of one pipeline that would end up with one title is
 *      the state the write door refuses, so a migration must not create it — and it refuses the
 *      WHOLE run, not the colliding rows, because half a corpus of renamed blocks is worse than
 *      none.
 *   3. IT IS IDEMPOTENT. A second run writes no change row and no revision.
 *   4. THE LEDGER STILL NAMES WHAT THE RECORD HOLDS. A record's newest revision carries the token
 *      every compare-and-set write is checked against. A migration that moved the title and left
 *      that behind would leave a corpus that refuses every write to a block.
 *
 * ---------------------------------------------------------------------------------------
 * WHY ONE FIXTURE IS BUILT WITH RAW SQL, AND WHY THAT IS THE HONEST WAY TO BUILD IT
 * ---------------------------------------------------------------------------------------
 *
 * The collision test needs a pipeline listing two blocks whose names would collide. The write door
 * refuses to create that, which is the whole point of the rule. The importer, though, writes
 * `records` with hand-built SQL and never goes through the write path, and `FORMAT.md` §10 invites
 * somebody to hand-edit an export while Mole Office is down. So the state is reachable in the field and
 * not through any function this test could call. `tests/helpers.ts` keeps
 * `writeDataBypassingTheGate` for exactly this reason and states it at length.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import type { BlockIdentityCounts } from '../src/server/db/block-identity.ts'
// Imported plainly because src/server/lib/version.ts reaches node:crypto and a type and no
// database, which is what tests/helpers.ts says makes an import safe at module scope.
import { contentOf, versionOf } from '../src/server/lib/version.ts'

let t: TestDb
let migration: typeof import('../src/server/db/block-identity.ts')

beforeEach(async () => {
  t = await freshDb()
  migration = await import('../src/server/db/block-identity.ts')
})
afterEach(() => {
  t.close()
})

function pipeline(title: string) {
  return t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title, data: { blockIds: [] }, actor: t.api.HUMAN })
}
/**
 * A BLOCK AS THE WRITE PATH WROTE ONE BEFORE 26 AUGUST 2026: title `<pipeline> › <name>`.
 *
 * THE WRITE DOOR NO LONGER MAKES THIS SHAPE: a block's title is its own name.
 * This migration exists to take the prefix off the blocks that were written before
 * it, so its fixture has to be a corpus of that shape and there is no function left that builds
 * one. Raw SQL is the honest way, for the reason this file's header already gives about
 * `writeDataBypassingTheGate`: the state is real, it is in every archive, and no code path this
 * test could call will produce it.
 *
 * It rewrites the record AND every revision of it, because that is what the old write path left
 * behind and because one of the cases below is about what the ledger still says afterwards.
 */
function block(pipelineId: string, name: string) {
  const made = t.blocks.addBlock(pipelineId, { name, state: 'todo' }, t.api.HUMAN).block
  const pipelineTitle = (sqlite().prepare('SELECT title FROM records WHERE id = ?').get(pipelineId) as { title: string }).title
  const composed = `${pipelineTitle} \u203a ${name}`
  sqlite().prepare('UPDATE records SET title = ? WHERE id = ?').run(composed, made.id)
  const row = sqlite()
    .prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?')
    .get(made.id) as { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
  const hash = versionOf(
    contentOf({
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      data: JSON.parse(row.data) as Record<string, unknown>,
      deletedAt: row.deleted_at,
    }),
  )
  sqlite().prepare('UPDATE revisions SET title = ?, content_hash = ? WHERE record_id = ?').run(composed, hash, made.id)
  return { ...made, title: composed }
}

const sqlite = () => t.client.sqlite
const countOf = (table: string): number =>
  (sqlite().prepare(`SELECT count(*) as n FROM "${table}"`).get() as { n: number }).n
const titleOf = (id: string): string =>
  (sqlite().prepare('SELECT title FROM records WHERE id = ?').get(id) as { title: string }).title

/** The counts as they really are, which is what an honest caller measures before it runs. */
const measured = (): BlockIdentityCounts => migration.planBlockIdentity(sqlite()).counts

/** A pipeline with three blocks, which is the ordinary case. */
function threeBlocks(): { pipelineId: string; blockIds: string[] } {
  const p = pipeline('Transplant v2')
  const ids = ['Sense the pot', 'Close and hold', 'Hand it over'].map((n) => block(p.id, n).id)
  return { pipelineId: p.id, blockIds: ids }
}

describe('the retitle', () => {
  it('takes the pipeline’s title off every block, and says which rule did it', () => {
    const { blockIds } = threeBlocks()
    expect(titleOf(blockIds[0] as string)).toBe('Transplant v2 › Sense the pot')

    const report = migration.migrateBlockIdentity(sqlite(), measured())

    expect(report.retitled).toBe(3)
    expect(report.fromTheirPipeline).toBe(3)
    expect(report.fromTheSeparator).toBe(0)
    expect(titleOf(blockIds[0] as string)).toBe('Sense the pot')
    expect(titleOf(blockIds[1] as string)).toBe('Close and hold')
    expect(titleOf(blockIds[2] as string)).toBe('Hand it over')
  })

  it('leaves the revision ledger naming exactly what each record now holds', () => {
    const { blockIds } = threeBlocks()
    migration.migrateBlockIdentity(sqlite(), measured())

    for (const id of blockIds) {
      const row = sqlite()
        .prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?')
        .get(id) as { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
      const newest = sqlite()
        .prepare('SELECT content_hash, title FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
        .get(id) as { content_hash: string; title: string }
      expect(newest.title).toBe(row.title)
      expect(newest.content_hash).toBe(
        versionOf(
          contentOf({
            kind: row.kind,
            title: row.title,
            summary: row.summary,
            data: JSON.parse(row.data) as Record<string, unknown>,
            deletedAt: row.deleted_at,
          }),
        ),
      )
    }
  })

  it('keeps the composed title in every revision written before it, and in the change log', () => {
    const { blockIds } = threeBlocks()
    const id = blockIds[0] as string
    migration.migrateBlockIdentity(sqlite(), measured())

    const titles = sqlite()
      .prepare('SELECT title FROM revisions WHERE record_id = ? ORDER BY seq')
      .all(id)
      .map((raw) => (raw as { title: string }).title)
    // The first revision still says what the block was called. This is why `splitBlockTitle` and
    // `blockNameIn` are kept for ever: a reader of the past needs the cut.
    expect(titles[0]).toBe('Transplant v2 › Sense the pot')
    expect(titles[titles.length - 1]).toBe('Sense the pot')

    const change = sqlite()
      .prepare("SELECT old_value, new_value, actor_type, actor_id FROM changes WHERE record_id = ? AND field = 'title'")
      .get(id) as { old_value: string; new_value: string; actor_type: string; actor_id: string }
    expect(change.old_value).toBe('Transplant v2 › Sense the pot')
    expect(change.new_value).toBe('Sense the pot')
    expect(change.actor_type).toBe('system')
    expect(change.actor_id).toBe('block-identity-migration')
  })
})

describe('what it refuses', () => {
  it('refuses when two blocks of one pipeline would end with the same title, and writes nothing', () => {
    const one_ = pipeline('Transplant v2')
    const two = pipeline('Calibration sweep')
    const a = block(one_.id, 'Calibrate')
    const b = block(two.id, 'Calibrate')
    // The state a hand-edited archive can leave behind and the write door will not create: one
    // pipeline listing a block whose title carries another pipeline's name.
    writeDataBypassingTheGate(t, one_.id, { blockIds: [a.id, b.id] })

    const changesBefore = countOf('changes')
    const revisionsBefore = countOf('revisions')

    expect(() => migration.migrateBlockIdentity(sqlite(), measured())).toThrow(/would all be called "Calibrate"/)
    // BOTH are named, and so is the pipeline and where each one sits.
    expect(() => migration.migrateBlockIdentity(sqlite(), measured())).toThrow(new RegExp(a.id))
    expect(() => migration.migrateBlockIdentity(sqlite(), measured())).toThrow(new RegExp(b.id))
    expect(() => migration.migrateBlockIdentity(sqlite(), measured())).toThrow(/Transplant v2/)

    // NOT ONE ROW MOVED — not even the blocks that would not have collided.
    expect(titleOf(a.id)).toBe('Transplant v2 › Calibrate')
    expect(titleOf(b.id)).toBe('Calibration sweep › Calibrate')
    expect(countOf('changes')).toBe(changesBefore)
    expect(countOf('revisions')).toBe(revisionsBefore)
  })

  it('refuses a database whose counts are not the ones the caller measured', () => {
    const { blockIds } = threeBlocks()
    const wrong: BlockIdentityCounts = { ...measured(), blockRecords: 99 }

    const changesBefore = countOf('changes')
    expect(() => migration.migrateBlockIdentity(sqlite(), wrong)).toThrow(/blockRecords: measured 99, found 3/)
    expect(titleOf(blockIds[0] as string)).toBe('Transplant v2 › Sense the pot')
    expect(countOf('changes')).toBe(changesBefore)

    // The other direction: the counts it really has, and it runs.
    expect(migration.migrateBlockIdentity(sqlite(), measured()).retitled).toBe(3)
  })
})

describe('running it twice', () => {
  it('writes no change row and no revision the second time', () => {
    threeBlocks()
    const first = migration.migrateBlockIdentity(sqlite(), measured())
    expect(first.retitled).toBe(3)

    const changesAfterFirst = countOf('changes')
    const revisionsAfterFirst = countOf('revisions')
    const titlesAfterFirst = sqlite()
      .prepare("SELECT id, title FROM records WHERE kind = 'block' ORDER BY id")
      .all()
      .map((raw) => (raw as { id: string; title: string }).title)

    const second = migration.migrateBlockIdentity(sqlite(), measured())

    expect(second.alreadyDone).toBe(true)
    expect(second.retitled).toBe(0)
    expect(countOf('changes')).toBe(changesAfterFirst)
    expect(countOf('revisions')).toBe(revisionsAfterFirst)
    expect(
      sqlite()
        .prepare("SELECT id, title FROM records WHERE kind = 'block' ORDER BY id")
        .all()
        .map((raw) => (raw as { id: string; title: string }).title),
    ).toEqual(titlesAfterFirst)
  })
})
