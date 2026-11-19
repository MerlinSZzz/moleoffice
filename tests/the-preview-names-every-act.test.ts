// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PREVIEW NAMES EVERY ACT A MIGRATION WOULD PERFORM, and `migrateRevisions` performs two.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE WAS WRITTEN AGAINST, MEASURED BEFORE IT WAS REPAIRED
 * ---------------------------------------------------------------------------------------
 *
 * `migrateRevisions` has two acts and says so in its own comment — `revision-backfill.ts`, "TWO
 * ACTS, AND THEY ARE THE SAME JOB FROM TWO STARTING POINTS". `written` counts baselines, for a
 * record with no revision at all. `caughtUp` counts records whose newest revision no longer hashes
 * to what the record holds, because something rewrote the record and kept no revision.
 *
 * `previewMigration` gave a `wouldWrite` line to only the first of them. The clause read
 * `if (!outcome.revisions.alreadyDone && outcome.revisions.written > 0)`, so a run whose only work
 * was the catch-up act pushed no line at all — and then fell into the catch-all at the end of
 * `previewMigration`, which fires when the copy came out byte-different and no report named the
 * write:
 *
 *     write something none of the 16 migration reports names: the copy came out byte-different
 *     from the image it was made from, and every report said it had nothing to do…
 *
 * That is what `prepareToServe` prints when it REFUSES TO SERVE. So every future migration that
 * rewrites `records.data` collided with `migrateRevisions` silently, and the operator's only
 * warning was a refusal that names nothing.
 *
 * The number in that sentence is `THE_STEPS.length`, so it has been four, seven and sixteen. This
 * file no longer looks for the sentence at all — see `actNamedBy` below for why, and for what it
 * looks for instead.
 *
 * ---------------------------------------------------------------------------------------
 * REPRODUCED THREE TIMES ON A REAL CORPUS BEFORE ANY LINE OF THE REPAIR WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * On a private scratch copy of the round-ten baseline corpus copy, WAL folded in, 652 records, 22
 * annotations, all 22 carrying `data.state`:
 *
 *     control:  revisions {written: 0, caughtUp: 0,  alreadyDone: true}   wouldWrite 0  → serves
 *     UPDATE records SET data = json_remove(data,'$.state') WHERE kind='annotation'   → 22 rows
 *     after:    revisions {written: 0, caughtUp: 22, alreadyDone: false}  wouldWrite 1  → REFUSES
 *               and the one line is the nameless catch-all above.
 *
 * THE TESTS BELOW DO NOT READ THAT FILE, and the reason is the one `tests/migration.test.ts`
 * already gives for the same choice: a test that behaves differently depending on whether
 * somebody's working database happens to be on disk reports different things to different people,
 * and the one it would report nothing to is whoever checks out this repository fresh. The corpus
 * numbers are recorded above because they are the measurement; the fixture below builds the same
 * two states out of the repository's own migrations, at one annotation instead of twenty-two.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { migrateInPlace, prepareToServe, previewMigration, THE_STEPS } from '../src/server/db/migrate.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(REPO, 'drizzle')

/**
 * Which act a `wouldWrite` line names, or null when it names none.
 *
 * `previewMigration` writes two kinds of line and then a catch-all. A schema line begins `apply N
 * schema migration…`. A step's line is `<step name>: …`, built from `THE_STEPS`. The catch-all —
 * "write something none of the N migration reports names" — matches neither, and that is the whole
 * of what makes it nameless.
 *
 * READ FROM `THE_STEPS` RATHER THAN FROM A SENTENCE TYPED HERE. This was a constant holding the
 * words "none of the four migration reports names", and the product had long since stopped saying
 * four: the number in that sentence is `THE_STEPS.length`, which is sixteen. So the three
 * assertions that the operator meets no nameless refusal were looking for a string the product
 * cannot produce, and passed whatever happened. Nothing here depends on the catch-all's wording now.
 */
function actNamedBy(line: string): string | null {
  if (/^apply \d+ schema migrations? /.test(line)) return 'the schema migrations'
  const step = THE_STEPS.find((one) => line.startsWith(`${one.name}: `))
  return step?.name ?? null
}

/** Every line of a preview that names no act. An empty list is the only acceptable answer. */
function linesThatNameNoAct(lines: readonly string[]): string[] {
  return lines.filter((line) => actNamedBy(line) === null)
}

/**
 * What an operator starting the server actually reads, on a database that needs migrating.
 *
 * `prepareToServe` is the function `start()` calls, and its refusal is the text on the terminal.
 * This is where the defect was met: a run whose only work was the catch-up act pushed no line, fell
 * into the catch-all, and stopped the server with a message that named nothing. The three cases
 * below assert the preview AND this, so a repair that fixed the report and left the refusal alone
 * cannot pass.
 */
function whatTheOperatorReads(db: Database.Database): string {
  const decision = prepareToServe(db, MIGRATIONS)
  if (decision.serve) {
    throw new Error(`expected a refusal to serve, but the server would have started:\n${decision.report}`)
  }
  return decision.refusal
}

interface Scratch {
  dir: string
  db: Database.Database
}

const open: Scratch[] = []

afterEach(() => {
  for (const s of open.splice(0)) {
    if (s.db.open) s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  }
})

/** A fully migrated database with nothing left to do, holding one annotation with a `state` key. */
function upToDateWithOneAnnotation(name: string): Scratch {
  const dir = aTestDatabaseFolder(`preview-acts-${name}`)
  const db = new Database(join(dir, 'panelx.db'))
  // The two pragmas db/client.ts sets, so the fixture is the shape a real boot meets.
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const s = { dir, db }
  open.push(s)

  migrateInPlace(db, MIGRATIONS)
  addAnnotation(db, 'ann-1', 'what the reader marked', '{"state":"queued"}')
  // MIGRATED AGAIN ON PURPOSE, exactly as `tests/migration.test.ts` does: the second run is what
  // gives the new record its baseline revision, so the fixture genuinely has nothing left to do
  // rather than being asserted to.
  migrateInPlace(db, MIGRATIONS)
  return s
}

/**
 * `origin` is written explicitly because a record with none is work for `migrateOrigins`, which
 * would push its own `wouldWrite` line and leave every count below reading one line too many.
 */
function addAnnotation(db: Database.Database, id: string, title: string, data: string): void {
  db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
      `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', 'annotation', ?, NULL, ?, 'authored')`,
  ).run(id, title, data)
}

/** The one `wouldWrite` line `migrateRevisions` is responsible for, or `undefined` when it pushed none. */
function theRevisionsLine(lines: readonly string[]): string | undefined {
  return lines.find((line) => line.startsWith('revisions:'))
}

describe('previewMigration names every act migrateRevisions would perform', () => {
  it('names the CATCH-UP act and its count when catching up is the only thing it would do', () => {
    const s = upToDateWithOneAnnotation('catch-up-only')

    // THE CONTROL, asserted rather than assumed. Without it, a fixture that was never up to date
    // would produce the same red for a reason that has nothing to do with this defect.
    const control = previewMigration(s.db, MIGRATIONS)
    expect(control.outcome.revisions.caughtUp).toBe(0)
    expect(control.wouldWrite).toEqual([])

    // A WRITE TO `records` THAT KEEPS NO REVISION, which is the shape of every stale ledger.
    //
    // IT USED TO BE `json_remove(data,'$.state')`, the exact statement the annotation-state
    // migration runs, because that migration was not registered and nothing would undo it. Window B
    // registered it, so `previewMigration` now takes that key off itself and restamps as it goes,
    // and the fixture would have been asserting that the repair works rather than that the report
    // names the act. So it rewrites the summary instead: no registered step reads or writes that,
    // and it moves the content hash exactly as the key removal did.
    const rewritten = s.db
      .prepare("UPDATE records SET summary = 'a summary nothing wrote a revision for' WHERE kind='annotation'")
      .run()
    expect(rewritten.changes).toBe(1)

    const preview = previewMigration(s.db, MIGRATIONS)
    // The sensor agrees there is work: one record's ledger no longer describes it, and no record
    // needs a baseline. This is the case the old clause could not see.
    expect(preview.outcome.revisions.caughtUp).toBe(1)
    expect(preview.outcome.revisions.written).toBe(0)

    const line = theRevisionsLine(preview.wouldWrite)
    expect(line, `no line named revisions. wouldWrite was:\n${preview.wouldWrite.join('\n')}`).toBeDefined()
    expect(line).toContain('1 CATCH-UP revision')
    // And every line names an act, so the operator is not handed a refusal that names nothing.
    expect(linesThatNameNoAct(preview.wouldWrite)).toEqual([])

    // THE REFUSAL THE OPERATOR ACTUALLY MEETS, which is where the defect was met.
    const refusal = whatTheOperatorReads(s.db)
    expect(refusal).toContain('1 CATCH-UP revision')
    expect(refusal, 'the refusal an operator reads does not carry the line the preview built').toContain(line ?? '')
  })

  it('still names the BASELINE act and its count when a baseline is the only thing it would do', () => {
    // GREEN BEFORE THE REPAIR AND AFTER IT, deliberately. This is the half the old clause had, and
    // it is here so that a repair which merely swapped one act for the other cannot pass.
    const s = upToDateWithOneAnnotation('baseline-only')
    addAnnotation(s.db, 'ann-2', 'a record with no ledger at all', '{}')

    const preview = previewMigration(s.db, MIGRATIONS)
    expect(preview.outcome.revisions.written).toBe(1)
    expect(preview.outcome.revisions.caughtUp).toBe(0)

    const line = theRevisionsLine(preview.wouldWrite)
    expect(line, `no line named revisions. wouldWrite was:\n${preview.wouldWrite.join('\n')}`).toBeDefined()
    expect(line).toContain('1 BASELINE revision')
    expect(linesThatNameNoAct(preview.wouldWrite)).toEqual([])

    const refusal = whatTheOperatorReads(s.db)
    expect(refusal).toContain('1 BASELINE revision')
    expect(refusal, 'the refusal an operator reads does not carry the line the preview built').toContain(line ?? '')
  })

  it('names BOTH acts and BOTH counts in one line when both have something to do', () => {
    // The case a window with several data migrations in it actually produces, and the one where a
    // single-act line is worst: it looks like a complete report and is missing half the writes.
    const s = upToDateWithOneAnnotation('both-acts')
    addAnnotation(s.db, 'ann-2', 'a record with no ledger at all', '{}')
    expect(
      s.db
        .prepare("UPDATE records SET summary = 'a summary nothing wrote a revision for' WHERE kind='annotation'")
        .run().changes,
    ).toBe(2)

    const preview = previewMigration(s.db, MIGRATIONS)
    expect(preview.outcome.revisions.written).toBe(1)
    expect(preview.outcome.revisions.caughtUp).toBe(1)

    const line = theRevisionsLine(preview.wouldWrite)
    expect(line, `no line named revisions. wouldWrite was:\n${preview.wouldWrite.join('\n')}`).toBeDefined()
    expect(line).toContain('1 BASELINE revision')
    expect(line).toContain('1 CATCH-UP revision')
    expect(linesThatNameNoAct(preview.wouldWrite)).toEqual([])

    const refusal = whatTheOperatorReads(s.db)
    expect(refusal).toContain('1 BASELINE revision')
    expect(refusal).toContain('1 CATCH-UP revision')
    expect(refusal, 'the refusal an operator reads does not carry the line the preview built').toContain(line ?? '')
  })

  /**
   * THE CATCH-ALL IS REAL, AND THIS IS WHAT IT LOOKS LIKE WHEN IT FIRES.
   *
   * Without this, `linesThatNameNoAct` could be a function that returns an empty list for every
   * input and the three cases above would still be green — the mistake the constant it replaced was
   * making. So a line the product would never write is put through the same reader, and it has to
   * come back as naming nothing.
   */
  it('and a line naming no act is recognised as one, so the check above can fail', () => {
    const catchAll =
      `write something none of the ${THE_STEPS.length} migration reports names: the copy came out ` +
      'byte-different from the image it was made from, and every report said it had nothing to do.'
    expect(linesThatNameNoAct([catchAll])).toEqual([catchAll])
    // And a real line from every registered step is recognised as naming its act.
    for (const step of THE_STEPS) expect(actNamedBy(`${step.name}: whatever it would write`)).toBe(step.name)
  })
})
