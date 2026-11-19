// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING ROWS THE ROLL'S OLD LIST PUT IN A GROUP ARE SET TO THAT GROUP. The data half of migration 0318
 * (`a_casting_row_has_a_work_group`). One transaction with every other data step.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * Until 0318 the roll for hard or simple work found a row's group in a list in src/shared/casting-roll.ts, by the row's
 * program and model. 0318 makes the group a cell of the row, and the list is gone from the roll. So each row the list
 * put in a group is set to that group here, and the roll takes the same rows for hard and for simple work as it did.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES
 * ---------------------------------------------------------------------------------------
 *
 * THE LIST below is the old list as it stood, with the words of the decision each entry carried. A row is in an
 * entry when its program is the entry's program and its model matches one of the entry's names with GLOB, which tells
 * capitals apart. A row with no model matches no entry. Every row of `casting_rows` is read, in force or not.
 *
 * For each row an entry matches, while its work group holds nothing, it writes:
 *
 *   - `work_group`: the entry's group;
 *   - `work_group_from`: the time, `by` migration 0318, no decision record, the words the old list carried for the
 *     decision in `decisionWords`, moved false and copied false;
 *   - the row's last change: `changed_at` the same time, `changed_by_kind` 'migration', `changed_by_id` 0318 and no
 *     `authority`, as every other writer of a row stamps it;
 *   - one `migrate` row in `casting_row_changes`, as migration 0190 writes them: by migration 0318, no authority, no
 *     decisions, a note, and the row before and after. The native selection of the row's newest image is carried into
 *     the new one, because a row's native selection is read from its newest image.
 *
 * It changes no other cell, writes no record, and deletes nothing.
 *
 * DECISION 13. Beside the empty work group it fills, the step overwrites the row's last change: `changed_at`,
 * `changed_by_kind`, `changed_by_id` and `authority`, which a writer had set. So it rewrites stored values, and it is
 * declared in DATA_MIGRATIONS in tests/migration.test.ts with `rewritesStoredValues: true`.
 *
 * It stops with an error unless SQLite says the row's UPDATE changed exactly one row, before it counts the row or
 * writes its history row.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS ONLY IN THE RUN THAT APPLIES 0318
 * ---------------------------------------------------------------------------------------
 *
 * Every data step runs on every `migrateInPlace`. This one must not: a row added after 0318 is in no group until its
 * cell is set, and a later start would put it in a group by its model's name. So it does its work only when `applied`
 * holds 0318. A data step writes the rows rather than the `.sql` file because tests/migration.test.ts allows no UPDATE
 * in a migration file that is not on its REBUILDS list.
 */
import type Database from 'better-sqlite3'
import { nowStamp } from '../../shared/time.ts'

/** The migration whose data half this is. The merge queue renames it here if it renumbers the migration. */
export const THE_MIGRATION = '0318_a_casting_row_has_a_work_group'

/** The migration's number, as each value, last change, history row and sentence names it. */
export const THE_MIGRATION_ID = THE_MIGRATION.slice(0, 4)

/** Who wrote each value and history row: the migration, by its number. */
const BY = { kind: 'migration', id: THE_MIGRATION_ID } as const

/**
 * THE CELLS OF A ROW AS THEY WERE FROM 0318 TO 0349, in the order the images held them. The step writes its images
 * with these, so what it writes stays the same after the row's cells change. Migration 0349's step reads a row's image
 * before it with them too.
 */
export const THE_CELLS_AT_0318 = ['program', 'model', 'effort', 'difficulty', 'quota', 'cost', 'work_group', 'probability', 'why'] as const

/** The two work groups 0318 allowed. */
type AWorkGroup = 'hard' | 'simple'

/** The roll's list as it stood before 0318: the group, the program, the model names as GLOB patterns, and the words. */
const THE_LIST: readonly { group: AWorkGroup; program: string; models: readonly string[]; words: string }[] = [
  { group: 'hard', program: 'claude-code', models: ['claude-opus-*'], words: 'A decision of the owner: Opus for hard work.' },
  { group: 'hard', program: 'codex', models: ['gpt-6.1-sol'], words: 'A decision of the owner: Sol for hard work.' },
  { group: 'hard', program: 'codex', models: ['gpt-6-astra'], words: 'A decision of the owner: Astra joins hard work.' },
  { group: 'simple', program: 'dsh', models: ['deepseek-*'], words: 'A decision of the owner: DeepSeek belongs to simple work.' },
  { group: 'simple', program: 'opencode', models: ['opencode-go/deepseek-*'], words: 'A decision of the owner: DeepSeek belongs to simple work.' },
  { group: 'simple', program: 'codex', models: ['gpt-6-luna', 'openai/gpt-6-luna'], words: 'Two decisions of the owner: Luna for simple work, on Codex first.' },
]

export interface Report {
  /** False when this run of the migrations did not apply 0318, so nothing was read or written. */
  ran: boolean
  /** The rows set to each group. */
  hard: number
  simple: number
  /** The rows of `casting_rows` and the history rows it wrote, as SQLite counted them. */
  rowsWritten: number
}

/** The newest history image of one row, or nothing when the row has no history. */
export const THE_NEWEST_IMAGE = 'SELECT "after" FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1'

/**
 * A row's image as the Casting table's writers store it: each cell with its source, the mark, and the native selection.
 * The cells are the ones 0318 knew, unless a later step names its own.
 */
export function imageOf(row: Record<string, unknown>, native: Record<string, unknown>, named: readonly string[] = THE_CELLS_AT_0318): string {
  const cells = Object.fromEntries(named.map((cell) => {
    const from = row[`${cell}_from`]
    return [cell, { value: row[cell], from: typeof from === 'string' ? JSON.parse(from) as unknown : null }]
  }))
  return JSON.stringify({ ...cells, marked: row['marked'] === 1, ...native })
}

/** The native selection of the newest image, when it holds one, copied as it is. */
export function theNativeOf(newest: string | null): Record<string, unknown> {
  if (newest === null) return {}
  const image = JSON.parse(newest) as Record<string, unknown>
  return Object.hasOwn(image, 'native') ? { native: image['native'], selectionRevision: image['selectionRevision'], hold: image['hold'] } : {}
}

/** Set the rows the old list put in a group, when `applied` holds 0318. */
export function setTheCastingWorkGroups(sqlite: Database.Database, applied: readonly string[]): Report {
  const report: Report = { ran: false, hard: 0, simple: 0, rowsWritten: 0 }
  if (!applied.includes(THE_MIGRATION)) return report
  report.ran = true
  const at = nowStamp()
  const rowsOf = sqlite.prepare('SELECT * FROM casting_rows WHERE program = ? AND model GLOB ? AND work_group IS NULL ORDER BY id')
  const newestImage = sqlite.prepare(THE_NEWEST_IMAGE).pluck()
  const setTheCell = sqlite.prepare(
    'UPDATE casting_rows SET work_group = ?, work_group_from = ?, changed_at = ?, changed_by_kind = ?, changed_by_id = ?, authority = NULL ' +
      'WHERE id = ? AND work_group IS NULL',
  )
  const writeTheHistory = sqlite.prepare(
    'INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, authority, decisions, note, before, after) ' +
      "VALUES (?, ?, ?, 'migrate', ?, ?, ?, NULL, '[]', ?, ?, ?)",
  )
  for (const entry of THE_LIST) {
    const from = JSON.stringify({ at, by: BY, decision: null, decisionWords: entry.words, moved: false, copied: false })
    for (const model of entry.models) {
      for (const row of rowsOf.all(entry.program, model) as Record<string, unknown>[]) {
        const native = theNativeOf((newestImage.get(row['id']) as string | null | undefined) ?? null)
        const before = imageOf(row, native)
        const after = imageOf({ ...row, work_group: entry.group, work_group_from: from }, native)
        const changed = setTheCell.run(entry.group, from, at, BY.kind, BY.id, row['id']).changes
        if (changed !== 1) {
          throw new Error(`Migration ${BY.id} set the work group of Casting row ${String(row['id'])}, and SQLite said ${String(changed)} rows changed, not 1.`)
        }
        report.rowsWritten += changed
        const note = `Migration ${BY.id} set the work group to ${entry.group}, as the list in the roll's code gave it until then.`
        report.rowsWritten += writeTheHistory.run(row['id'], row['role'], row['project'], at, BY.kind, BY.id, note, before, after).changes
        report[entry.group] += 1
      }
    }
  }
  return report
}

/** The rows this step wrote, as SQLite counted them. */
export function rowsTheWorkGroupStepWrote(report: Report): number {
  return report.rowsWritten
}

/** What it did, in one sentence without the step's name: the line the preview puts after that name. */
export function whatTheWorkGroupStepDid(report: Report): string {
  if (report.rowsWritten === 0) {
    return report.ran
      ? 'no Casting row with an empty work group was in the roll\'s old list, so nothing was written'
      : `this run did not apply migration ${THE_MIGRATION_ID}, so nothing was read or written`
  }
  return `set the work group of ${String(report.hard + report.simple)} Casting row(s) from the roll's old list, ` +
    `${String(report.hard)} hard and ${String(report.simple)} simple, with one history row each`
}

/** The report as a person reads it. */
export function describeTheWorkGroupStep(report: Report): string {
  return `casting work groups: ${whatTheWorkGroupStepDid(report)}`
}
