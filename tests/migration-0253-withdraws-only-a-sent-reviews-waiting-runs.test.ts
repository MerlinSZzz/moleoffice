// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MIGRATION 0253 WITHDRAWS ONLY THE RUNS A SENT REVIEW WROTE THAT NO WORKER TOOK, REVOKES ONLY THEIR KEYS, TOUCHES
 * NOTHING ELSE, AND DOES IT ONCE. It is wave 13u round 19, with answers yMYX20nfBuep and
 * 69_KJoAwXeKg.
 *
 * A sent review writes no run now. The runs the old send wrote and no worker took are set to `withdrawn`, with
 * `ended_at` and a reason, and the keys they were minted are revoked. The work is the data step in
 * src/server/db/withdraw-review-runs-migration.ts; 0253's `.sql` holds one statement that writes nothing. Here a
 * database is built from the migrations before 0253, made-up runs of every shape that matters are written into it,
 * and then every migration is applied, or for the case on every other table the migrations up to 0253 and no further:
 *
 *   - a queued run in a sent review's conversation is withdrawn, with a key or without one;
 *   - a run there that a worker took (claimed, finished, or declined after its claim) is left as it is;
 *   - a queued run of any other conversation is left queued with its key live: an "Ask:" run, a run that reads a
 *     review's comments, and a run of a review that was never sent;
 *   - a key revoked before keeps the moment and the reason it was revoked with;
 *   - every row of every other table that was there before 0253 is as it was after 0253 alone. A migration after it may
 *     add a column or a table, as 0274, 0275 and 0270 do, and that is no row 0253 changed;
 *   - a later run of the migrations, which does not apply 0253, withdraws nothing, not even a new queued run in a
 *     sent review's conversation.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/migration-0253-withdraws-only-a-sent-reviews-waiting-runs.test.ts
 * After a green control, copy src/server/db/withdraw-review-runs-migration.ts, then:
 *   1. delete the line of its SELECT that holds it to a sent review's conversation (`'AND thread_id IN ...`), and end
 *      the line above it with `ORDER BY created_at, id'`: the "Ask:" run and the others are withdrawn too, and the
 *      case on what is left alone goes red;
 *   2. in the line that revokes a run's key (`const revoked = ...`), put `0` in place of `revoke.run(...).changes`:
 *      the withdrawn runs' keys stay live, and the case on keys goes red;
 *   3. delete the line that returns when `applied` does not hold 0253: a later run withdraws a new queued run, and the
 *      case on a later run goes red;
 *   4. under `report.ran = true`, add `sqlite.prepare("UPDATE agent_threads SET title = 'changed'").run()`: a row of
 *      another table changes, and the case on other tables goes red.
 * Restore the file with cp after each, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up.
 */
import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateInPlace } from '../src/server/db/migrate.ts'
import { THE_MIGRATION, WHY_ITS_KEY_WAS_REVOKED, WHY_THE_RUN_WAS_WITHDRAWN } from '../src/server/db/withdraw-review-runs-migration.ts'
import { MIGRATIONS, migrationsBefore, partialMigrations, scratch } from './migration-fixtures.ts'

const THE_JOURNAL = '__drizzle_migrations'
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
const AT = '2026-10-01 09:00:00'

/** The conversations: two sent reviews', a review's that was never sent, and two that are no review's. */
const SENT_ONE = 'thread-sent-one'
const SENT_TWO = 'thread-sent-two'
const NOT_SENT = 'thread-review-not-sent'
const ASK = 'thread-ask'
const READS_A_REVIEW = 'thread-reads-a-review'

interface Run { id: string; thread: string; state: string; claimedBy: string | null; key: string | null }

const RUNS: Run[] = [
  // WITHDRAWN: queued and never claimed, in a sent review's conversation.
  { id: 'run-sent-queued-with-key', thread: SENT_ONE, state: 'queued', claimedBy: null, key: 'key-sent-queued' },
  { id: 'run-sent-queued-no-key', thread: SENT_TWO, state: 'queued', claimedBy: null, key: null },
  { id: 'run-sent-queued-key-revoked-before', thread: SENT_TWO, state: 'queued', claimedBy: null, key: 'key-revoked-before' },
  // LEFT AS IT IS: a worker took it.
  { id: 'run-sent-claimed', thread: SENT_ONE, state: 'claimed', claimedBy: 'made-up-worker', key: 'key-sent-claimed' },
  { id: 'run-sent-finished', thread: SENT_ONE, state: 'finished', claimedBy: 'made-up-worker', key: null },
  { id: 'run-sent-declined', thread: SENT_TWO, state: 'declined', claimedBy: 'made-up-worker', key: 'key-sent-declined' },
  // LEFT QUEUED: not a sent review's conversation.
  { id: 'run-ask', thread: ASK, state: 'queued', claimedBy: null, key: 'key-ask' },
  { id: 'run-reads-a-review', thread: READS_A_REVIEW, state: 'queued', claimedBy: null, key: 'key-reads-a-review' },
  { id: 'run-review-not-sent', thread: NOT_SENT, state: 'queued', claimedBy: null, key: 'key-review-not-sent' },
]
const WITHDRAWN = ['run-sent-queued-with-key', 'run-sent-queued-no-key', 'run-sent-queued-key-revoked-before']

function writeTheMadeUpRows(db: Database.Database): void {
  const review = db.prepare(
    'INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, from_thread_id, sent_thread_id, sent_at) ' +
      "VALUES (?, 'default', '{}', ?, ?, 'made-up-person', ?, ?, ?)",
  )
  review.run('review-sent-one', 'sent', AT, null, SENT_ONE, AT)
  review.run('review-sent-two', 'sent', AT, null, SENT_TWO, AT)
  review.run('review-not-sent', 'collected', AT, NOT_SENT, null, null)
  const thread = db.prepare("INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) VALUES (?, 'default', ?, ?, 'dispatched', ?, ?, 'made-up-person')")
  for (const id of [SENT_ONE, SENT_TWO, NOT_SENT, ASK, READS_A_REVIEW]) thread.run(id, `Made-up conversation ${id}`, id === ASK ? 'direct' : 'review', AT, AT)
  const key = db.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at, revoked_at, revoked_because) VALUES (?, 'agent', 'made-up-agent', ?, ?, ?, ?)")
  for (const run of RUNS) {
    if (run.key === null) continue
    const before = run.key === 'key-revoked-before'
    key.run(run.key, `hash-${run.key}`, AT, before ? '2026-10-02 10:00:00' : null, before ? 'Made up: revoked by hand before.' : null)
  }
  // A key that is no run's, and must stay live.
  key.run('key-of-nothing-here', 'hash-key-of-nothing-here', AT, null, null)
  const insert = db.prepare(
    'INSERT INTO agent_runs (id, thread_id, runtime, state, claimed_by, claimed_at, request, error, started_at, ended_at, created_at) ' +
      "VALUES (?, ?, 'claude-code', ?, ?, ?, ?, ?, ?, ?, ?)",
  )
  for (const run of RUNS) {
    const request = JSON.stringify({ messageIds: [`comment-of-${run.id}`], ...(run.key === null ? {} : { agentKeyId: run.key }) })
    const took = run.claimedBy !== null
    const ended = run.state === 'finished' || run.state === 'declined'
    insert.run(run.id, run.thread, run.state, run.claimedBy, took ? AT : null, request,
      run.state === 'declined' ? 'Made up: this worker cannot serve it.' : null, took ? AT : null, ended ? AT : null, AT)
  }
}

type Row = Record<string, unknown>
const rowsOf = (db: Database.Database, table: string): Row[] => db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Row[]
const byId = (rows: Row[]): Map<unknown, Row> => new Map(rows.map((row) => [row['id'], row]))
const columnsOf = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((one) => one.name)

/**
 * EACH TABLE'S ROWS READ THROUGH ONLY THE COLUMNS IT HAD BEFORE 0253. A column a later migration adds did not exist when
 * 0253 ran, so 0253 cannot have written it: 0273 adds agents.run_keys_only, with 0 in every row. A column that was there
 * before and is gone after still fails, because it then reads as undefined where it held a value or null.
 */
function throughTheColumnsBefore(tables: Record<string, Row[]>, columns: Record<string, string[]>): Record<string, Row[]> {
  return Object.fromEntries(Object.entries(tables).map(([table, rows]) => {
    const these = columns[table]
    if (these === undefined) throw new Error(`No columns were read for ${table} before 0253.`)
    return [table, rows.map((row) => Object.fromEntries(these.map((column) => [column, row[column]])))]
  }))
}

/**
 * Every table but the migration journal, and the two this migration writes, read whole.
 *
 * AFTER THE MIGRATIONS, ONLY THE TABLES THAT WERE THERE BEFORE 0253 (`these`). A table a later migration makes did not
 * exist when 0253 ran, so 0253 cannot have changed a row of it, and it may start with rows of its own, as 0272's
 * quick_input_list does. Reading every table there is now made this case fail for each later migration that adds a
 * table, 0270 and 0272, with nothing wrong in 0253 (for 0270, merge entry FbFqoMJLZopv, 14 October 2026). A table that
 * was there before and is gone after still fails here, because reading it fails.
 */
function everyOtherTable(db: Database.Database, these?: readonly string[]): Record<string, Row[]> {
  const names = these ?? (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map((one) => one.name)
    .filter((name) => ![THE_JOURNAL, 'agent_runs', 'held_keys'].includes(name))
  return Object.fromEntries(names.map((name) => [name, rowsOf(db, name)]))
}

/** A database before 0253 with the made-up rows in it, what it held, and the same database after the migrations in `folder`. */
function migrateTheMadeUpOffice(folder = MIGRATIONS): {
  db: Database.Database
  outcome: ReturnType<typeof migrateInPlace>
  runsBefore: Map<unknown, Row>
  keysBefore: Map<unknown, Row>
  othersBefore: Record<string, Row[]>
  columnsBefore: Record<string, string[]>
} {
  const s = scratch('sent-reviews-waiting-runs')
  migrateInPlace(s.db, partialMigrations(migrationsBefore(THE_MIGRATION)))
  writeTheMadeUpRows(s.db)
  const runsBefore = byId(rowsOf(s.db, 'agent_runs'))
  const keysBefore = byId(rowsOf(s.db, 'held_keys'))
  // THE FIXTURE IS BEFORE 0253, or every case below would be measuring nothing.
  expect([...runsBefore.values()].filter((row) => row['state'] === 'withdrawn')).toEqual([])
  const othersBefore = everyOtherTable(s.db)
  const columnsBefore = Object.fromEntries(Object.keys(othersBefore).map((table) => [table, columnsOf(s.db, table)]))
  const outcome = migrateInPlace(s.db, folder)
  return { db: s.db, outcome, runsBefore, keysBefore, othersBefore, columnsBefore }
}

describe('migration 0253 on an office whose sent reviews left queued runs', () => {
  it('withdraws each queued run in a sent review’s conversation, with the moment and a reason that says nothing was tried', () => {
    const { db, outcome, runsBefore } = migrateTheMadeUpOffice()
    const after = byId(rowsOf(db, 'agent_runs'))
    expect(outcome.reviewRunsWithdrawn.ran).toBe(true)
    expect([...outcome.reviewRunsWithdrawn.withdrawn].sort()).toEqual([...WITHDRAWN].sort())
    // THREE RUNS AND THE ONE KEY STILL LIVE AMONG THEM, as SQLite counted the rows it changed.
    expect(outcome.reviewRunsWithdrawn.rowsWritten).toBe(4)
    for (const id of WITHDRAWN) {
      const was = runsBefore.get(id)!
      const is = after.get(id)!
      expect(is['state'], id).toBe('withdrawn')
      expect(String(is['ended_at']), id).toMatch(STAMP)
      expect(String(is['error']), id).toContain('nothing was tried')
      expect(String(is['error']), id).toContain('A sent review now gives each agent one message')
      expect(is['error'], id).toBe(WHY_THE_RUN_WAS_WITHDRAWN)
      // THE STATE, THE END AND THE REASON, AND NOTHING ELSE.
      expect({ ...is, state: null, ended_at: null, error: null }, id).toEqual({ ...was, state: null, ended_at: null, error: null })
    }
  })

  it('leaves every other run as it was: the ones a worker took, and every queued run of another conversation', () => {
    const { db, runsBefore } = migrateTheMadeUpOffice()
    const after = byId(rowsOf(db, 'agent_runs'))
    expect(after.size).toBe(runsBefore.size)
    const left = RUNS.map((run) => run.id).filter((id) => !WITHDRAWN.includes(id))
    for (const id of left) expect(after.get(id), id).toEqual(runsBefore.get(id))
    expect(['run-ask', 'run-reads-a-review', 'run-review-not-sent'].map((id) => after.get(id)?.['state'])).toEqual(['queued', 'queued', 'queued'])
  })

  it('revokes the keys of the withdrawn runs alone, and keeps an earlier revocation as it was', () => {
    const { db, outcome, keysBefore } = migrateTheMadeUpOffice()
    const after = byId(rowsOf(db, 'held_keys'))
    expect(outcome.reviewRunsWithdrawn.keysRevoked).toEqual(['key-sent-queued'])
    expect(after.size).toBe(keysBefore.size)
    const revoked = after.get('key-sent-queued')!
    expect(String(revoked['revoked_at'])).toMatch(STAMP)
    expect(String(revoked['revoked_because'])).toContain('Its run was withdrawn before any worker took it')
    expect(revoked['revoked_because']).toBe(WHY_ITS_KEY_WAS_REVOKED)
    expect({ ...revoked, revoked_at: null, revoked_because: null }).toEqual(keysBefore.get('key-sent-queued'))
    for (const [id, was] of keysBefore) {
      if (id !== 'key-sent-queued') expect(after.get(id), String(id)).toEqual(was)
    }
    expect(after.get('key-ask')?.['revoked_at']).toBeNull()
  })

  it('changes no row of any other table', () => {
    const { db, outcome, othersBefore, columnsBefore } = migrateTheMadeUpOffice(partialMigrations(migrationsBefore(THE_MIGRATION) + 1))
    expect(outcome.reviewRunsWithdrawn.withdrawn.length).toBe(WITHDRAWN.length)
    expect(throughTheColumnsBefore(everyOtherTable(db, Object.keys(othersBefore)), columnsBefore)).toEqual(othersBefore)
  })

  it('withdraws nothing on a later run of the migrations, not even a new queued run in a sent review’s conversation', () => {
    const { db } = migrateTheMadeUpOffice()
    // A RUN THE PERSON STARTS LATER IN A SENT REVIEW'S CONVERSATION is a real request, with a live key.
    db.prepare("INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES ('key-later', 'agent', 'made-up-agent', 'hash-key-later', ?)").run(AT)
    db.prepare(
      'INSERT INTO agent_runs (id, thread_id, runtime, state, request, created_at) ' +
        "VALUES ('run-later', ?, 'claude-code', 'queued', ?, ?)",
    ).run(SENT_ONE, JSON.stringify({ messageIds: ['comment-of-run-later'], agentKeyId: 'key-later' }), AT)
    const runsBefore = rowsOf(db, 'agent_runs')
    const keysBefore = rowsOf(db, 'held_keys')
    const again = migrateInPlace(db, MIGRATIONS)
    expect(again.newlyApplied).toBe(0)
    expect(again.reviewRunsWithdrawn).toEqual({ ran: false, withdrawn: [], keysRevoked: [], rowsWritten: 0 })
    expect(rowsOf(db, 'agent_runs')).toEqual(runsBefore)
    expect(rowsOf(db, 'held_keys')).toEqual(keysBefore)
    expect(byId(rowsOf(db, 'agent_runs')).get('run-later')?.['state']).toBe('queued')
  })
})
