// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Move what a task said it was blocked by into the field that kind still has. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: THIS IS AN EXPLICIT NAMED EXCEPTION, AND HERE IS WHAT IT REWRITES
 * ---------------------------------------------------------------------------------------
 *
 * Decision 13 says a migration should normally preserve rows without rewriting them, that one which
 * MUST rewrite is an explicit named exception which has to prove row preservation, index and
 * constraint preservation, idempotence and destructive-restore compatibility, and that there is no
 * hidden migration rewrite. This is such a migration. Named:
 *
 *   IT REWRITES `records.data` ON `task` RECORDS THAT STORE `blocked_by`, AND NOTHING ELSE. Inside
 *   that JSON it touches exactly two keys: it removes `blocked_by` and it writes `also_waiting_on`.
 *   Every other key of that record's `data` is carried across untouched, every other row of
 *   `records` is untouched, and no other table is written except `changes`, which gains two rows per
 *   moved record saying what moved.
 *
 * WHY IT MUST REWRITE RATHER THAN ADD. `task` no longer declares `blocked_by` — src/shared/kinds.ts
 * says at length why, and the short version is that the dependency is a `blocks` link, which every
 * reader already reads, and `data.blocked_by` was read by nothing. A stored key a kind does not
 * declare is refused by `validateData` on the next write, so a task left holding one is a record
 * nobody can edit again. There is no additive way out of that: the key has to leave `data`.
 *
 * The four proofs are in tests/migration-blocked-by.test.ts and in the DATA_MIGRATIONS list in
 * tests/migration.test.ts, which compares every cell of every table before and after a real
 * migration run and holds this file to the paragraph above.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER MAKES A LINK, AND THAT IS THE WHOLE DISCIPLINE OF THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * Four of the eleven stored values ARE, letter for letter, the title of another record in this
 * corpus. One is a task title and one is a problem title. It is obvious what to do with those and it
 * is forbidden: a `blocks` link is
 * a statement that this work is stopped until that work moves, it is read by the gate rule, the
 * attention rule, `unmetDependencies`, the record page and the graph, and NOBODY WROTE IT. The
 * author wrote a sentence in a free-text field. A string that resembles a title is evidence about
 * the string, not about the dependency — the same author may have meant a different record with a
 * similar name, or the record may have been created afterwards and named to match, or they may have
 * been describing the thing rather than pointing at it.
 *
 * So the text moves, verbatim, into the prose field, and where it happens to match a title exactly
 * the migration SAYS SO in a note naming both ends and the link somebody could write. A person with
 * the context makes that call in a second. A migration making it silently would put a dependency in
 * somebody's graph that they never stated, which is the silent substitution the invariants forbid.
 *
 * ---------------------------------------------------------------------------------------
 * OBLIGATIONS KEEP THEIRS, AND ARE NOT TOUCHED
 * ---------------------------------------------------------------------------------------
 *
 * `obligation` still declares `blocked_by`, honestly, as "a record title or as prose". It has no
 * `also_waiting_on` to move anything into and there is no replacement for the field, so an
 * obligation's value is where it belongs. Three obligations in this corpus carry one. This file
 * reads `kind = 'task'` and nothing else, and the test suite pins that both ways.
 *
 * ---------------------------------------------------------------------------------------
 * JOINING, RATHER THAN OVERWRITING
 * ---------------------------------------------------------------------------------------
 *
 * Five of the eight tasks holding `blocked_by` also hold `also_waiting_on`, so the common case is
 * two sentences arriving in one field. Both are kept. The text already in `also_waiting_on` stays
 * FIRST, because that is where its author put it, and the arriving text is appended after `; `.
 *
 * NO WORDS ARE ADDED. Not "also recorded as", not "migrated from blocked_by" — a reader would take
 * those for something the author wrote about their own work. What separates the two statements
 * afterwards is the change log: this migration files one row for the value leaving `blocked_by` and
 * one for the value arriving in `also_waiting_on`, so both original strings survive on their own,
 * exactly as typed, and "which half did somebody write" stays answerable forever.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WILL NOT MOVE
 * ---------------------------------------------------------------------------------------
 *
 * A `blocked_by` that is not a non-empty string is LEFT WHERE IT IS and reported. There is no prose
 * in an array, a number or an empty string, and appending one to somebody's `also_waiting_on` would
 * be inventing a statement rather than moving one. That record stays un-writable through the API
 * until a person decides — which is a loud failure with a sentence naming `also_waiting_on`, and is
 * better than a quiet edit nobody asked for.
 *
 * ---------------------------------------------------------------------------------------
 * THE RECORD'S OWN `updated_at` IS NOT MOVED, DELIBERATELY
 * ---------------------------------------------------------------------------------------
 *
 * This migration is not the work moving. `records.updated_at` orders the Records page, and
 * lib/sessions.ts reads it as "somebody edited this record" when nothing better is available — the
 * same class of signal the block migration destroyed by stamping every block with its own clock and
 * zeroing the age the attention rule ranks on. Lifting eight tasks to the top of the list because a
 * field changed name would be that defect again in a smaller hat. The `changes` rows carry the
 * migration's own stamp, which is where "this happened just now" belongs.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A task with no `blocked_by` key is already migrated and is skipped, so a second run plans nothing
 * and writes nothing — not even a change row. It has no journal row and cannot have one: it decides
 * what to do by looking at the data, exactly as ./blocks-migration.ts does.
 */

import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '@shared/time.ts'

/** Something this migration did, or would not do, that a person needs to know about. */
export interface BlockedByNote {
  kind:
    /** Moved into an `also_waiting_on` that was empty. */
    | 'moved'
    /** Joined onto an `also_waiting_on` that already said something. */
    | 'joined'
    /** The text is exactly the title of another record. Reported, and NO link was made. */
    | 'names_a_record'
    /** Not a non-empty string, so there was no prose to move. Left exactly where it is. */
    | 'not_prose'
    /** The record's `data` is not readable JSON, so nothing can be read out of it. */
    | 'unreadable_data'
  recordId: string
  detail: string
}

export interface BlockedByMigrationReport {
  /** True when no task stored `blocked_by`. A second run always reports this. */
  alreadyDone: boolean
  /** Tasks whose prose moved into an empty `also_waiting_on`. */
  moved: number
  /** Tasks whose prose was appended to an `also_waiting_on` that already said something. */
  joined: number
  /** Tasks left holding `blocked_by` because there was no prose in it. */
  leftInPlace: number
  /** How many of the moved values are exactly the title of another record. No link was made for any. */
  namesARecord: number
  notes: BlockedByNote[]
}

/** A record as this file needs it. Raw SQL, so `data` is still text. */
interface RecordRow {
  id: string
  kind: string
  title: string
  data: string
}

/** One task's move, decided before anything is written. */
interface PlannedMove {
  id: string
  title: string
  /** The whole `data` object as it will be stored, with the two keys settled. */
  data: Record<string, unknown>
  /** What `blocked_by` held. Kept for the change row, so the original survives on its own. */
  wasBlockedBy: string
  /** What `also_waiting_on` held before, or null. Kept for the change row for the same reason. */
  wasAlsoWaitingOn: string | null
  /** What `also_waiting_on` holds now. */
  nowAlsoWaitingOn: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * What goes between the two statements when both exist.
 *
 * A semicolon and a space. It is punctuation rather than a word, so it adds no claim of its own,
 * and it survives being read aloud as two things rather than one sentence.
 */
export const JOIN_SEPARATOR = '; '

/**
 * Work out the whole change without writing any of it.
 *
 * Exported so an operator can see what would happen to their corpus first, and so a test can assert
 * on what would be moved without a database it is willing to lose.
 */
export function planBlockedByMigration(sqlite: Database.Database): {
  moves: PlannedMove[]
  notes: BlockedByNote[]
} {
  const moves: PlannedMove[] = []
  const notes: BlockedByNote[] = []

  const all = sqlite.prepare('SELECT id, kind, title, data FROM records').all() as RecordRow[]
  // Titles of every record in the corpus, live or deleted, so a value that names one can be
  // REPORTED. This map is read for nothing else — no link is made from it, ever. See the header.
  const titles = new Map<string, RecordRow>()
  for (const row of all) titles.set(row.title, row)

  for (const row of all) {
    // OBLIGATIONS ARE NOT TOUCHED. They still declare the field. See the header.
    if (row.kind !== 'task') continue
    let data: unknown
    try {
      data = JSON.parse(row.data)
    } catch {
      notes.push({
        kind: 'unreadable_data',
        recordId: row.id,
        detail:
          `the task "${row.title}" has a \`data\` column that is not readable JSON, so nothing can be read out ` +
          `of it and nothing has been written to it. If it stores \`blocked_by\`, that is still there.`,
      })
      continue
    }
    if (!isObj(data)) continue
    if (!('blocked_by' in data)) continue

    const value = data['blocked_by']
    if (typeof value !== 'string' || value.trim() === '') {
      notes.push({
        kind: 'not_prose',
        recordId: row.id,
        detail:
          `the task "${row.title}" stores \`blocked_by\` as ${describeValue(value)}, and there is no prose in ` +
          `that to move. It is LEFT EXACTLY WHERE IT IS rather than being turned into something — appending it ` +
          `to \`also_waiting_on\` would be inventing a statement rather than moving one. The record cannot be ` +
          `written through the API while it holds a key its kind does not declare, and the refusal names ` +
          `\`also_waiting_on\`, so a person can settle it in one edit.`,
      })
      continue
    }

    const prose = value.trim()
    const existingRaw = data['also_waiting_on']
    const existing = typeof existingRaw === 'string' && existingRaw.trim() !== '' ? existingRaw.trim() : null

    const next: Record<string, unknown> = { ...data }
    delete next['blocked_by']
    const joined = existing === null ? prose : `${existing}${JOIN_SEPARATOR}${prose}`
    next['also_waiting_on'] = joined

    moves.push({
      id: row.id,
      title: row.title,
      data: next,
      wasBlockedBy: prose,
      wasAlsoWaitingOn: existing,
      nowAlsoWaitingOn: joined,
    })

    notes.push({
      kind: existing === null ? 'moved' : 'joined',
      recordId: row.id,
      detail:
        existing === null
          ? `"${row.title}": "${prose}" moved from \`blocked_by\` into \`also_waiting_on\`, which was empty.`
          : `"${row.title}": \`also_waiting_on\` said "${existing}" and now says "${joined}". Both statements ` +
            `are kept and neither was rewritten; the change log holds each on its own.`,
    })

    // REPORTED, NEVER ACTED ON. A value that is exactly another record's title is the case this
    // migration exists to not get wrong. See the header.
    const named = titles.get(prose)
    if (named !== undefined && named.id !== row.id) {
      notes.push({
        kind: 'names_a_record',
        recordId: row.id,
        detail:
          `"${row.title}" said it was blocked by "${prose}", which is exactly the title of the ${named.kind} ` +
          `${named.id}. NO LINK WAS MADE. If that really is the dependency, it is a \`blocks\` link from ` +
          `${named.id} to ${row.id} and only somebody who knows the work can say so: ` +
          `POST /api/links {"fromId":"${named.id}","toId":"${row.id}","type":"blocks","gate":{"kind":"hard"}}. ` +
          `Until then the sentence is in \`also_waiting_on\`, exactly as it was written.`,
      })
    }
  }

  return { moves, notes }
}

/** What a value is, in words, for a note that has to be read by a person. */
function describeValue(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `an array of ${value.length}`
  if (typeof value === 'string') return 'an empty string'
  return `a ${typeof value}`
}

/**
 * Apply the moves. One transaction, and it either all lands or none of it does.
 *
 * `dryRun` plans and reports and writes nothing.
 */
export function migrateBlockedBy(
  sqlite: Database.Database,
  opts: { dryRun?: boolean } = {},
): BlockedByMigrationReport {
  const { moves, notes } = planBlockedByMigration(sqlite)

  const report: BlockedByMigrationReport = {
    alreadyDone: moves.length === 0,
    moved: notes.filter((n) => n.kind === 'moved').length,
    joined: notes.filter((n) => n.kind === 'joined').length,
    leftInPlace: notes.filter((n) => n.kind === 'not_prose' || n.kind === 'unreadable_data').length,
    namesARecord: notes.filter((n) => n.kind === 'names_a_record').length,
    notes,
  }
  if (moves.length === 0) return report
  if (opts.dryRun === true) return report

  const at = nowStamp()
  // `updated_at` is NOT in this statement, on purpose. See the header: a migration is not the work
  // moving, and this column is read as though it were.
  //
  // NO REVISION IS WRITTEN HERE, AND THAT IS NOT AN OVERSIGHT. This rewrites what a record holds, so
  // the record's newest revision stops being true the moment it runs — the ledger and the change log
  // would then disagree about the same write with nothing failing. The repair is `planStaleLedgers`
  // in ./revision-backfill.ts, which runs LAST of the data migrations in the same command and writes
  // one revision for every record whose ledger has fallen behind, whichever migration moved it. It is
  // there rather than here because a copy of it in each migration is the same fact worked out in as
  // many places as there are migrations, and the next migration would forget.
  const write = sqlite.prepare('UPDATE records SET data = @data WHERE id = @id')
  // `workspace_id` IS DERIVED HERE, IN THE STATEMENT, RATHER THAN LEFT NULL FOR A LATER PASS.
  // A change row's project is the project of the record it is about — the column exists to keep that
  // derivation, and `logChange` in lib/records.ts refuses a parameter for it for the same reason.
  // These rows used to be written NULL and stamped afterwards by `migrateWorkspaces`, which runs
  // later in the same command. That covered the ordinary `npm run db:migrate`, and nothing else: a
  // caller running this migration on its own left rows the daily page filters out, because it
  // selects by project and NULL is not a project. The subquery reads the record this row is about,
  // in the same transaction, at the moment the row is written.
  const logChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) ' +
      "VALUES (@id, @record_id, (SELECT r.workspace_id FROM records r WHERE r.id = @record_id), " +
      "'update', 'system', 'blocked-by-migration', NULL, @field, @old_value, @new_value, @at)",
  )

  const run = sqlite.transaction(() => {
    for (const move of moves) {
      write.run({ id: move.id, data: JSON.stringify(move.data) })
      // TWO ROWS, NOT ONE, AND THAT IS WHAT MAKES THE JOIN SAFE. The field the text left and the
      // field it arrived in are logged separately, so both original strings survive on their own
      // and nobody afterwards has to guess which half of a joined sentence somebody typed.
      logChange.run({
        id: anOfficeId(),
        record_id: move.id,
        field: 'data.blocked_by',
        old_value: move.wasBlockedBy,
        new_value: null,
        at,
      })
      logChange.run({
        id: anOfficeId(),
        record_id: move.id,
        field: 'data.also_waiting_on',
        old_value: move.wasAlsoWaitingOn,
        new_value: move.nowAlsoWaitingOn,
        at,
      })
    }
  })
  run()

  return report
}
