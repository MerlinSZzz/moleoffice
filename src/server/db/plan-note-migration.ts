// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Move a plan line's note out of `plan_lines.remark` and into the line's own words. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: THIS IS AN EXPLICIT NAMED EXCEPTION, AND HERE IS WHAT IT REWRITES
 * ---------------------------------------------------------------------------------------
 *
 * Decision 13 says a migration should normally preserve rows without rewriting them, that one which
 * MUST rewrite is an explicit named exception which has to prove row preservation, idempotence and
 * destructive-restore compatibility, and that there is no hidden migration rewrite. This is such a
 * migration. Named:
 *
 *   IT WRITES `plan_lines.text` AND EMPTIES `plan_lines.remark`, ON THE ROWS THAT HOLD A REMARK,
 *   AND NOTHING ELSE. No row is deleted, no other column is touched, no other table is read or
 *   written. Every note that was stored is still stored: in a different column of the same row.
 *
 * WHY IT MUST REWRITE RATHER THAN ADD. The note was hidden state and it was destroyed silently.
 * Saving an edited plan matches the stored rows against the new text BY THEIR EXACT CHARACTERS and
 * re-inserts every line whose words changed with the remark left null — so changing one word of a
 * line deleted its note, and while a lost record binding was reported back to the caller, a lost
 * note was reported nowhere. Problem `6DIqEdKWuMgN`. Afterwards the note is a `{note: …}` group in
 * the line's own text, so editing the words KEEPS the note, because the note is part of those words.
 * There is no additive way out of that: the note has to leave the column, or the same note is in two
 * places and the two disagree the first time anybody edits a line.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS TYPESCRIPT AND NOT A `.sql` FILE
 * ---------------------------------------------------------------------------------------
 *
 * TWO REASONS, AND EITHER ONE IS ENOUGH.
 *
 * `src/shared/planline.ts` is the ONE reader and writer of this syntax. A `.sql` file would have to
 * build the group by joining strings, which is the syntax written down in a second place, and the
 * two would drift the first time the syntax changed.
 *
 * AND IT REFUSES, WITH A SENTENCE. A note holding a curly bracket or a line ending cannot be written
 * into a line at all: the brackets are what mark a note in the text, and a plan line holds no line
 * ending. Moving such a note would change the words somebody wrote; leaving it in a column nothing
 * reads any more would lose it where nobody could see it had gone. So the whole migration stops and
 * names the rows. `src/server/db/migrate.ts` says exactly this about the other three data
 * migrations: a `.sql` file cannot refuse with a sentence naming what it will not guess at.
 *
 * ---------------------------------------------------------------------------------------
 * THE COLUMN STAYS, EMPTY
 * ---------------------------------------------------------------------------------------
 *
 * SQLite cannot drop a column without rebuilding the table, and a rebuild is a bigger exception than
 * this change needs. Nothing in Mole Office reads or writes `remark` after this: `toLine` in
 * src/server/lib/plans.ts reads the note out of the words, and says so.
 *
 * ---------------------------------------------------------------------------------------
 * THE LINE'S OWN `updated_at` IS NOT MOVED, DELIBERATELY
 * ---------------------------------------------------------------------------------------
 *
 * This migration is not somebody writing in their plan. `plan_lines.updated_at` is what "written
 * since you read this" counts, so restamping these rows would report the whole document as written
 * by the migration, at two in the morning, by nobody. The same reason ./blocked-by-migration.ts
 * gives for leaving `records.updated_at` where it is.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A row with no remark is already migrated and is skipped, so a second run plans nothing and writes
 * nothing. It has no journal row and cannot have one: it decides what to do by looking at the data,
 * exactly as the other three data migrations do.
 */

import type Database from 'better-sqlite3'
import { lineWithNote, parsePlanLine, whyNoteCannotBeWritten } from '@shared/planline.ts'

/** Something this migration did, or would not do, that a person needs to know about. */
export interface PlanNoteMigrationNote {
  kind:
    /** The note was nothing but spaces, so the column was emptied and no words were added. */
    | 'blank'
    /** The line already carries a note in its words, so the column's note was left where it is. */
    | 'two_notes'
  lineId: string
  detail: string
}

/** What the note migration did. */
export interface PlanNoteMigrationReport {
  /** True when no row held a note to move, which is the second run and every fresh database. */
  alreadyDone: boolean
  /** How many notes were written into their line's words. */
  moved: number
  /** How many rows held a note that was nothing but spaces. */
  blank: number
  /** How many rows were left holding their note, and why. Every one is printed. */
  notes: PlanNoteMigrationNote[]
}

interface Row {
  id: string
  text: string
  remark: string
}

/** Whether this database has the table at all. A database migrated before 0010 does not. */
function hasPlanLines(sqlite: Database.Database): boolean {
  return (
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plan_lines'").get() !==
    undefined
  )
}

export function migratePlanNotes(sqlite: Database.Database): PlanNoteMigrationReport {
  const empty: PlanNoteMigrationReport = { alreadyDone: true, moved: 0, blank: 0, notes: [] }
  if (!hasPlanLines(sqlite)) return empty

  const rows = sqlite
    .prepare('SELECT id, text, remark FROM plan_lines WHERE remark IS NOT NULL ORDER BY id')
    .all() as Row[]
  if (rows.length === 0) return empty

  // ---- THE REFUSAL FIRST, BEFORE ANY ROW IS WRITTEN. Half a migration is worse than none.
  const impossible = rows
    .map((row) => ({ row, why: whyNoteCannotBeWritten(row.remark) }))
    .filter((one): one is { row: Row; why: string } => one.why !== null)
  if (impossible.length > 0) {
    throw new Error(
      `NOTHING WAS MIGRATED. ${impossible.length} plan line note${impossible.length === 1 ? '' : 's'} cannot ` +
        'be written into the line it belongs to, and Mole Office will not rewrite somebody\'s words for them. ' +
        `${impossible.map((one) => `${one.row.id}: ${JSON.stringify(one.row.remark)} — ${one.why}`).join(' ')} ` +
        'Take the curly brackets or the line endings out of those notes by hand, then run this again. Every ' +
        'other row is exactly as it was: this ran before anything was written.',
    )
  }

  const notes: PlanNoteMigrationNote[] = []
  const toWrite: { id: string; text: string }[] = []
  let blank = 0
  for (const row of rows) {
    if (row.remark.trim() === '') {
      // A note that is nothing but spaces was never a note. The column is emptied and no words are
      // added, because adding an empty group would put a mark in somebody's document for nothing.
      blank += 1
      notes.push({
        kind: 'blank',
        lineId: row.id,
        detail: `The note on line ${row.id} was ${JSON.stringify(row.remark)}, which is nothing but spaces. The column was emptied and the line's words were not touched.`,
      })
      continue
    }
    if (parsePlanLine(row.text).values.some((value) => value.key === 'note')) {
      // TWO NOTES, AND THIS FILE WILL NOT CHOOSE. The words already carry one, so writing the
      // column's note into the line would replace something somebody typed.
      notes.push({
        kind: 'two_notes',
        lineId: row.id,
        detail:
          `Line ${row.id} already holds a note in its words (${JSON.stringify(row.text)}) and its remark ` +
          `column holds ${JSON.stringify(row.remark)}. Both were kept exactly as they are and NOTHING was ` +
          'moved for this line: Mole Office will not pick one of two things somebody wrote. Put the one you want ' +
          'into the line and clear the other by hand.',
      })
      continue
    }
    toWrite.push({ id: row.id, text: lineWithNote(row.text, row.remark) })
  }

  // `updated_at` and `updated_by` are NOT in these statements, on purpose. See the header.
  const write = sqlite.prepare('UPDATE plan_lines SET text = ?, remark = NULL WHERE id = ?')
  const clear = sqlite.prepare('UPDATE plan_lines SET remark = NULL WHERE id = ?')
  const move = sqlite.transaction(() => {
    for (const one of toWrite) write.run(one.text, one.id)
    for (const one of notes.filter((note) => note.kind === 'blank')) clear.run(one.lineId)
  })
  move()

  return { alreadyDone: false, moved: toWrite.length, blank, notes }
}

/** The one line the migration command prints, plus every row it would not touch. */
export function describePlanNotes(report: PlanNoteMigrationReport): string {
  const head = report.alreadyDone
    ? 'plan notes: nothing to move'
    : `plan notes: ${report.moved} moved into the line's own words, ${report.blank} blank note` +
      `${report.blank === 1 ? '' : 's'} cleared, ${report.notes.filter((n) => n.kind === 'two_notes').length} ` +
      'left in place'
  const lines = report.notes.map((note) => `  [${note.kind}] ${note.detail}`)
  return head + (lines.length === 0 ? '' : `\n${lines.join('\n')}`)
}
