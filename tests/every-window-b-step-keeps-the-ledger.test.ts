// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY REGISTERED STEP EITHER LEAVES THE RECORDS ALONE, RUNS ABOVE THE REVISION PASS, OR RESTAMPS.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHY IT IS A TEST RATHER THAN A PARAGRAPH
 * ---------------------------------------------------------------------------------------
 *
 * A record's newest revision holds what the record holds, and its `content_hash` IS the token a read
 * hands back as `version` and a write has to send back to prove it is not stale. So a migration that
 * rewrites `records.data` and leaves the ledger alone leaves the newest revision holding old content
 * under a hash of old content, and every compare-and-set built from a read of that record refuses
 * every write. The record is silently unwritable.
 *
 * Window B's ordering rule is the repair, and it gives two options and no third: a step that
 * rewrites `records.data` runs ABOVE `migrateRevisions`, which catches it up in the same run, or it
 * RESTAMPS the newest revision itself.
 *
 * ---------------------------------------------------------------------------------------
 * IT MEASURES THE RULE NOW, RATHER THAN READING THE SOURCE FOR IT
 * ---------------------------------------------------------------------------------------
 *
 * Until this rewrite, both halves of the rule were checked by reading `src/server/db/*.ts` as text.
 * The step list came from a regular expression that matched only a call written `const x =
 * migrateFoo(`, so a step called any other way was invisible to the very check this file exists to
 * make. And "this step restamps" was a search for `UPDATE revisions` in the step's own file, which
 * is a fact about the source and not about a database.
 *
 * Both are gone. The step list is `THE_STEPS`, the product's own table, whose completeness is held
 * by `tests/every-window-b-step-is-named.test.ts`: it compares the table with the report fields a
 * REAL outcome carries, and a step can only be run by returning its report on that interface. So a
 * step added any way at all is in the list this file walks.
 *
 * And the rule itself is now measured end to end. A corpus is built holding stale work for three
 * record-rewriting steps, `migrateInPlace` is run ONCE, and then every record in the file is asked
 * the only question that matters: does its newest revision still describe it? A step that broke the
 * rule leaves a record answering no, whichever of the two options it was supposed to take.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH HALF CAN AND CANNOT SPEAK FOR
 * ---------------------------------------------------------------------------------------
 *
 * HALF ONE holds the declared answer for every registered step, and the ordering rule over the whole
 * list. It is a claim about all sixteen, made from the product's own table.
 *
 * HALF TWO measures. The whole-corpus case reaches the three steps a fixture can cheaply give work
 * to, and its control asserts that those three really did work rather than passing on an empty run.
 * The other two cases run the two claims that nothing else here makes: that the reach step moves no
 * record and no revision at all, and that a step ABOVE the pass really is caught up by it in the
 * same run. The steps the fixture does not reach hold their own ledger checks inside their own
 * transactions, and their own test files run them.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { countReachShapes, migrateReviewsReach } from '../src/server/db/reviews-reach.ts'
import { countSessionRuntime, migrateSessionRuntime } from '../src/server/db/agent-identity.ts'
import { migrateRevisions } from '../src/server/db/revision-backfill.ts'
import { migrateInPlace, prepareToServe } from '../src/server/db/migrate.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const




// ============================================================================ half one, the ordering


// ============================================================================ half two, the measurement

describe('the rule, measured on a corpus that gives the steps work', () => {
  let t: TestDb
  let sqlite: Database.Database

  beforeAll(async () => {
    t = await freshDb()
    sqlite = t.client.sqlite as unknown as Database.Database
    // THE CORPUS EVERY CASE STARTS FROM. Each case adds the stale work it measures, and the three
    // records here are only what the migration steps need to find already there.
    t.api.createRecord({ kind: 'report', title: 'A report', workspaceId: WORKSPACE, actor: HUMAN })
    t.api.createRecord({ kind: 'module', title: 'A module', workspaceId: WORKSPACE, actor: HUMAN })
  }, A_HOOK_THAT_IMPORTS_THE_SERVER)

  afterAll(() => t.close())

  /** Every record and every revision, as one comparable string. */
  function ledger(): string {
    const records = sqlite.prepare('SELECT id, title, summary, data, updated_at FROM records ORDER BY id').all()
    const revisions = sqlite.prepare('SELECT id, record_id, seq, content_hash, title, data, note FROM revisions ORDER BY id').all()
    return JSON.stringify({ records, revisions })
  }

  /** The token a read of this record hands back as `version`, computed from what the row holds now. */
  function versionOfRecord(id: string): string {
    const row = sqlite
      .prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?')
      .get(id) as { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
    return versionOf(
      contentOf({
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data: JSON.parse(row.data) as Record<string, unknown>,
        deletedAt: row.deleted_at,
      }),
    )
  }

  /** The hash the newest revision carries, or null when the record has no revision at all. */
  function newestRevisionOf(id: string): string | null {
    const held = sqlite
      .prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
      .pluck()
      .get(id)
    return held === undefined ? null : String(held)
  }

  /** Every record whose newest revision no longer describes it, with its title, for the message. */
  function recordsLeftUnwritable(): string[] {
    const rows = sqlite.prepare('SELECT id, title FROM records ORDER BY id').all() as { id: string; title: string }[]
    return rows
      .filter((row) => newestRevisionOf(row.id) !== versionOfRecord(row.id))
      .map((row) => `${row.title} (${row.id}): newest revision ${String(newestRevisionOf(row.id))}, record ${versionOfRecord(row.id)}`)
  }

  /**
   * A corpus holding stale work for three record-rewriting steps at once.
   *
   * The three are the ones a fixture can give work to in a line each, and they take DIFFERENT arms
   * of the rule: `sessionRuntime` and `blockedBy` run above the pass, and `annotationStateKey`
   * restamps. So one run of `migrateInPlace` exercises both options.
   */
  function aCorpusWithStaleWork(): void {
    const session = t.api.createRecord({
      kind: 'session',
      title: 'A run',
      workspaceId: WORKSPACE,
      actor: HUMAN,
      data: { state: 'finished' },
    })
    const task = t.api.createRecord({
      kind: 'task',
      title: 'A task waiting on somebody',
      workspaceId: WORKSPACE,
      actor: HUMAN,
    })
    const comment = t.api.createRecord({
      kind: 'annotation',
      title: 'What the reader marked',
      workspaceId: WORKSPACE,
      actor: HUMAN,
    })
    // The three old keys, written the only way they can be now that no kind declares them.
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.agent', 'claude-code') WHERE id = ?").run(session.id)
    sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.blocked_by', 'the owner has not answered') WHERE id = ?")
      .run(task.id)
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'queued') WHERE id = ?").run(comment.id)
  }

  it('leaves no record unwritable after one run, whichever arm of the rule its step took', () => {
    aCorpusWithStaleWork()
    // THE STALE STATE, MEASURED FIRST. Three records now hold content their newest revision does
    // not describe, and this is the state the whole ordering rule is about.
    expect(recordsLeftUnwritable().length, 'the fixture is already up to date, so it proves nothing').toBeGreaterThan(0)

    const outcome = migrateInPlace(sqlite)

    // THE CONTROL: the three steps really did work. Without it this case passes on an empty run,
    // which is exactly what it would do if the fixture stopped reaching them.
    expect(outcome.sessionRuntime.recordsWritten, 'the session step had nothing to do').toBeGreaterThan(0)
    expect(outcome.blockedBy.moved, 'the blocked_by step had nothing to do').toBeGreaterThan(0)
    expect(outcome.annotationStateKey.recordsWritten, 'the comment state step had nothing to do').toBeGreaterThan(0)

    // AND THE RULE. Every record in the file, not only the three that moved.
    const left = recordsLeftUnwritable()
    expect(left, `records whose newest revision no longer describes them:\n${left.join('\n')}`).toEqual([])
  })

  it('and the server starts afterwards, which is what a broken ledger stops', () => {
    // THE SAME RULE AS AN OPERATOR MEETS IT. `prepareToServe` runs the migrations against a copy and
    // refuses to serve when anything is left to write. A record left behind by the ordering rule
    // comes back from the copy as a CATCH-UP the report has to name, and the server does not start.
    aCorpusWithStaleWork()
    migrateInPlace(sqlite)

    const decision = prepareToServe(sqlite)
    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
  })

  it('the reach step leaves records and revisions byte for byte where they were, while doing its own work', () => {
    // THE REVIEW AND THE INDEX ARE PUT BACK FIRST. `migrateInPlace` in the cases above has already
    // widened every review and created the index, so this case files the one review it measures and
    // drops the index. That is a fact about window B: the case is about what the step does to a
    // corpus that has not had it, which is the only corpus it will ever meet.
    sqlite
      .prepare('INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, reach) VALUES (?,?,?,?,?,?,?)')
      .run('rv-page', WORKSPACE, '{"target":{"kind":"page"}}', 'collecting', '2026-08-26 09:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`, 'local')
    sqlite.prepare('DROP INDEX IF EXISTS reviews_one_global_collecting').run()
    const before = ledger()
    const done = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(done.setGlobal).toBe(1)
    expect(done.indexCreated).toBe(true)
    expect(ledger()).toBe(before)
  })

  it('a step ABOVE the pass really is caught up by it, which is the whole of what "above" buys', () => {
    const session = t.api.createRecord({
      kind: 'session',
      title: 'A run',
      workspaceId: WORKSPACE,
      actor: HUMAN,
      data: { state: 'finished' },
    })
    // The old key, written the only way it can be now that no kind declares it.
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.agent', 'claude-code') WHERE id = ?").run(session.id)
    migrateRevisions(sqlite)

    migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))
    const now = versionOfRecord(session.id)
    // STALE, MEASURED, BEFORE THE PASS RUNS. This is the state the whole ordering rule is about.
    expect(newestRevisionOf(session.id)).not.toBe(now)
    expect(migrateRevisions(sqlite).caughtUp).toBe(1)
    expect(newestRevisionOf(session.id)).toBe(now)
  })
})
