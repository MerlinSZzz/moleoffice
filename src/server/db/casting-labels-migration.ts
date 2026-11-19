// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK GROUPS BECOME THE FIRST CASTING LABELS. The data half of migration 0349
 * (`a_casting_label_is_the_persons_own`). One transaction with every other data step.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * Until 0349 a row's work group was hard or simple, fixed by a CHECK in 0318. 0349 makes each label a row of its own,
 * which the person makes, renames and removes, and a row carries the ids of its labels. So each work group a row is in
 * becomes a label here, and each such row carries it, and the roll takes the same rows for hard and for simple work as
 * it did.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES
 * ---------------------------------------------------------------------------------------
 *
 * A row is grouped when its `work_group` is hard or simple and its `labels` is empty. For each work group a grouped
 * row is in, in the order of THE_FIRST_LABELS below, it writes:
 *
 *   - one label in `casting_labels`, named as the group, with its meaning: the words of the owner's decision on what
 *     makes work hard or simple, `from` the time, `by` migration 0349, no decision record, the words of the decision in
 *     `decisionWords`, moved false and copied false; last changed by migration 0349 with no authority;
 *   - one `migrate` row in `casting_label_changes`, with no label before and the label after.
 *
 * A work group no row is in makes no label, so a store with no grouped row gets none.
 *
 * Then, for each grouped row in the order of its id, it writes:
 *
 *   - `labels`: the list holding its group's label id;
 *   - `labels_from`: the source of its work group, with the time and `by` migration 0349;
 *   - the row's last change: the same time, by migration 0349 and no authority, as every other writer stamps it;
 *   - one `migrate` row in `casting_row_changes`: the row before, with the cells as they were since 0318, and after,
 *     with the cells as they are now. The native selection of the row's newest image is carried into the new one.
 *
 * It changes no other cell, writes no record, and deletes nothing. `work_group` and `work_group_from` stay as they are,
 * and nothing reads them after this step.
 *
 * DECISION 13. Beside the empty labels it fills, the step overwrites the row's last change: `changed_at`,
 * `changed_by_kind`, `changed_by_id` and `authority`, which a writer had set. So it rewrites stored values, and it is
 * declared in DATA_MIGRATIONS in tests/migration.test.ts with `rewritesStoredValues: true`.
 *
 * It stops with an error unless SQLite says each write changed exactly one row, and when a grouped row has no source
 * for its work group, because each writer stores a source with every value.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS ONLY IN THE RUN THAT APPLIES 0349
 * ---------------------------------------------------------------------------------------
 *
 * Every data step runs on every `migrateInPlace`. This one must not: after 0349 the person may take a label off a
 * row, and a later start would give it back. So it does its work only when `applied` holds 0349. A data step writes
 * the rows rather than the `.sql` file because tests/migration.test.ts allows no UPDATE in a migration file that is
 * not on its REBUILDS list.
 */
import type Database from 'better-sqlite3'
import { CASTING_CELLS } from '../../shared/casting.ts'
import { nowStamp } from '../../shared/time.ts'
import { THE_NEWEST_IMAGE, imageOf, theNativeOf } from './casting-work-groups-migration.ts'

/** The migration whose data half this is. The merge queue renames it here if it renumbers the migration. */
export const THE_MIGRATION_TAG = '0349_a_casting_label_is_the_persons_own'

/** The migration's number, as each value, last change, history row and sentence names it. */
export const THE_MIGRATION_ID = THE_MIGRATION_TAG.slice(0, 4)

/** Who wrote each value and history row: the migration, by its number. */
const BY = { kind: 'migration', id: THE_MIGRATION_ID } as const

/** The words that say where both meanings came from. */
const THE_DECISION_IN_WORDS = 'A decision of the owner, 17 November: what makes a piece of work hard or simple.'

/** The labels the work groups become, in the order they are made, with what each means in the owner's words. */
export const THE_FIRST_LABELS = [
  {
    name: 'hard',
    meaning: "Handling a lot of connected context or planning, for example turning a month-old pipeline page into today's visualisation and schedule.",
    words: THE_DECISION_IN_WORDS,
  },
  {
    name: 'simple',
    meaning: 'Mechanical work, such as scanning ids or deleting and editing hundreds of tests, is simple and goes to one DeepSeek worker that does it all at once.',
    words: THE_DECISION_IN_WORDS,
  },
] as const

export interface Report {
  /** False when this run of the migrations did not apply 0349, so nothing was read or written. */
  ran: boolean
  /** The labels it made. */
  labels: number
  /** The rows given each label. */
  hard: number
  simple: number
  /** The rows of `casting_labels`, `casting_label_changes`, `casting_rows` and `casting_row_changes` it wrote, as SQLite counted them. */
  rowsWritten: number
}

/** Stop unless SQLite says a write changed exactly one row. */
function one(changed: number, what: string): number {
  if (changed !== 1) throw new Error(`Migration ${BY.id} ${what}, and SQLite said ${String(changed)} rows changed, not 1.`)
  return changed
}

/** Make the first labels and give each grouped row its group's label, when `applied` holds 0349. */
export function makeTheFirstCastingLabels(sqlite: Database.Database, applied: readonly string[]): Report {
  const report: Report = { ran: false, labels: 0, hard: 0, simple: 0, rowsWritten: 0 }
  if (!applied.includes(THE_MIGRATION_TAG)) return report
  report.ran = true
  const at = nowStamp()
  const names = THE_FIRST_LABELS.map((first) => first.name)
  const grouped = sqlite
    .prepare(`SELECT * FROM casting_rows WHERE work_group IN (${names.map(() => '?').join(', ')}) AND labels IS NULL ORDER BY id`)
    .all(...names) as Record<string, unknown>[]
  const newestImage = sqlite.prepare(THE_NEWEST_IMAGE).pluck()
  const makeTheLabel = sqlite.prepare(
    'INSERT INTO casting_labels (name, meaning, meaning_from, changed_at, changed_by_kind, changed_by_id, authority) VALUES (?, ?, ?, ?, ?, ?, NULL)',
  )
  const writeTheLabelHistory = sqlite.prepare(
    'INSERT INTO casting_label_changes (label_id, what, at, by_kind, by_id, authority, note, before, after) ' +
      "VALUES (?, 'migrate', ?, ?, ?, NULL, ?, NULL, ?)",
  )
  const setTheCell = sqlite.prepare(
    'UPDATE casting_rows SET labels = ?, labels_from = ?, changed_at = ?, changed_by_kind = ?, changed_by_id = ?, authority = NULL ' +
      'WHERE id = ? AND labels IS NULL',
  )
  const writeTheHistory = sqlite.prepare(
    'INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, authority, decisions, note, before, after) ' +
      "VALUES (?, ?, ?, 'migrate', ?, ?, ?, NULL, '[]', ?, ?, ?)",
  )
  const labelOf = new Map<string, number>()
  for (const first of THE_FIRST_LABELS) {
    if (!grouped.some((row) => row['work_group'] === first.name)) continue
    const meaningFrom = { at, by: BY, decision: null, decisionWords: first.words, moved: false, copied: false }
    const made = makeTheLabel.run(first.name, first.meaning, JSON.stringify(meaningFrom), at, BY.kind, BY.id)
    report.rowsWritten += one(made.changes, `made the Casting label "${first.name}"`)
    const id = Number(made.lastInsertRowid)
    const labelNote = `Migration ${BY.id} made the label ${first.name} from the work group of that name.`
    const image = JSON.stringify({ name: first.name, meaning: { value: first.meaning, from: meaningFrom } })
    report.rowsWritten += one(writeTheLabelHistory.run(id, at, BY.kind, BY.id, labelNote, image).changes, `wrote the history of the Casting label "${first.name}"`)
    report.labels += 1
    labelOf.set(first.name, id)
  }
  for (const row of grouped) {
    const name = row['work_group'] as (typeof names)[number]
    const groupFrom = row['work_group_from']
    if (typeof groupFrom !== 'string') {
      throw new Error(`Migration ${BY.id} found Casting row ${String(row['id'])} in the work group ${name} with no source for it.`)
    }
    const labels = JSON.stringify([labelOf.get(name)])
    const from = JSON.stringify({ ...(JSON.parse(groupFrom) as Record<string, unknown>), at, by: BY })
    const native = theNativeOf((newestImage.get(row['id']) as string | null | undefined) ?? null)
    const before = imageOf(row, native)
    const after = imageOf({ ...row, labels, labels_from: from }, native, CASTING_CELLS)
    report.rowsWritten += one(setTheCell.run(labels, from, at, BY.kind, BY.id, row['id']).changes, `gave Casting row ${String(row['id'])} the label ${name}`)
    const note = `Migration ${BY.id} gave the row the label ${name}, from its work group of that name.`
    report.rowsWritten += one(writeTheHistory.run(row['id'], row['role'], row['project'], at, BY.kind, BY.id, note, before, after).changes, `wrote the history of Casting row ${String(row['id'])}`)
    report[name] += 1
  }
  return report
}

/** The rows this step wrote, as SQLite counted them. */
export function rowsTheLabelStepWrote(report: Report): number {
  return report.rowsWritten
}

/** What it did, in one sentence without the step's name: the line the preview puts after that name. */
export function whatTheLabelStepDid(report: Report): string {
  if (report.rowsWritten === 0) {
    return report.ran
      ? 'no Casting row was in a work group, so no label was made and nothing was written'
      : `this run did not apply migration ${THE_MIGRATION_ID}, so nothing was read or written`
  }
  return `made ${String(report.labels)} Casting label(s) from the work groups and gave ${String(report.hard + report.simple)} row(s) ` +
    `their group's label, ${String(report.hard)} hard and ${String(report.simple)} simple, with one history row each`
}

/** The report as a person reads it. */
export function describeTheLabelStep(report: Report): string {
  return `casting labels: ${whatTheLabelStepDid(report)}`
}
