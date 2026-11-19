// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY RUN'S `data.toolUses` MOVES INTO `tool_uses`, ONE ROW PER LINE. The data half of migration 0231
 * (`one_use_of_a_tool_is_one_row`), wave 13s round 33, problem mR8vNPOVNQ_p. One transaction with every other
 * data step.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * A use of a tool was a line in `data.toolUses` on the calling run, so each use rewrote the record and wrote a
 * revision holding the whole list again: one made-up run of 2,000 uses wrote 268,483,514 bytes of revisions. The
 * use door now writes one row in `tool_uses` and nothing else. This step moves the lists already stored, so the
 * table is the one place a run's uses are read from (USER.md, invariant 9).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, FOR EACH RECORD THAT HOLDS `toolUses`
 * ---------------------------------------------------------------------------------------
 *
 *   - ONE `tool_uses` ROW PER LINE, in the list's order: `seq` is the line's place, from 1. `at`, `tool` and
 *     `said` are the line's own. `moved_at` is the moment of this step. `actor_type` and `actor_id` are NULL,
 *     because the list never said who wrote each line; the old change rows and revisions that do say are kept.
 *   - IT TAKES `toolUses` OFF THE RUN'S CURRENT DATA. No marker is left in its place: the session kind's
 *     declaration and the use door say where a run's uses are, and a field naming the table on every run would
 *     be a second statement of that one fact.
 *   - ONE `changes` ROW for `data.toolUses`, its old value the list it held and its new value empty, and ONE
 *     REVISION holding what the run now holds. Both are written as the office (`mole-office/the-api-server`),
 *     so the run's newest revision still names what the run holds and the run stays writable.
 *
 * It does not change `updated_at`, the title or any other field. Old revisions and change rows stay as they are.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT STOPS IT, WITH NOTHING WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * A record that holds `toolUses` and is not a run, a `toolUses` that is not a list, a line that is not
 * {at, tool, said} with three strings, and a run that already has rows in `tool_uses` (the move would store its
 * uses twice). Each stops the step with an error naming the record. Then it counts: the rows it wrote must be
 * the sum of the list lengths, or it stops the same way.
 *
 * ---------------------------------------------------------------------------------------
 * A SECOND RUN CHANGES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * After the move no record holds `toolUses`, and every door refuses to write one, so the next run finds none.
 */
import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { nowStamp } from '../../shared/time.ts'
import { THE_OFFICE_WRITER_ID } from '../../shared/participants.ts'
import { TOOL_USES_FIELD } from '../../shared/toolset.ts'
import { contentOf, versionOf } from './version.ts'

/** One run whose list was moved, and how many lines it held. */
export interface MovedList {
  run: string
  lines: number
}

export interface Report {
  /** True when this database has no `tool_uses` table yet, so nothing was read or written. */
  tableMissing: boolean
  /** The lists moved, one per run, in the order the runs were filed. */
  moved: MovedList[]
  /** The lines the lists held, summed before anything was written. */
  linesFound: number
  /** The rows written into `tool_uses`, counted there after the move. */
  rowsWritten: number
}

/** What the revision's `note` says. */
export const REVISION_NOTE =
  "Migration 0231 moved this run's tool uses out of data.toolUses into the tool_uses table, one row per use, in " +
  'the same order. Nothing else in the run changed.'

const THE_OFFICE = { type: 'agent', id: THE_OFFICE_WRITER_ID } as const

interface RecordRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  workspace_id: string
}

interface Line {
  at: string
  tool: string
  said: string
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The list as lines, or an error naming the record and the first line that is not one. */
function linesOf(id: string, list: unknown): Line[] {
  if (!Array.isArray(list)) {
    throw new Error(`Record ${id} holds a data.${TOOL_USES_FIELD} that is not a list, so this step cannot tell what its uses were. Nothing was written.`)
  }
  return list.map((one, i) => {
    if (!isObject(one) || typeof one['at'] !== 'string' || typeof one['tool'] !== 'string' || typeof one['said'] !== 'string') {
      throw new Error(
        `Line ${String(i + 1)} of data.${TOOL_USES_FIELD} on record ${id} is not {at, tool, said} with three strings, so this ` +
          'step cannot move it without changing it. Nothing was written.',
      )
    }
    return { at: one['at'], tool: one['tool'], said: one['said'] }
  })
}

/**
 * Move every stored `data.toolUses` into `tool_uses`, and take it off the run.
 * These old lines contain no file results, so this step invents no test_file_runs rows. It never
 * moves or deletes an existing use; a run with use rows is refused before writing.
 */
export function moveToolUsesIntoTheirTable(sqlite: Database.Database): Report {
  const tableMissing = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tool_uses'").get() === undefined
  const report: Report = { tableMissing, moved: [], linesFound: 0, rowsWritten: 0 }
  if (tableMissing) return report
  const holders = sqlite
    .prepare(
      'SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records ' +
        `WHERE json_valid(data) AND json_type(data, '$.${TOOL_USES_FIELD}') IS NOT NULL ORDER BY created_at, rowid`,
    )
    .all() as RecordRow[]
  if (holders.length === 0) return report

  const addUse = sqlite.prepare(
    'INSERT INTO tool_uses (id, workspace_id, run_id, seq, at, tool, said, actor_type, actor_id, moved_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
  )
  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const newestSeq = sqlite.prepare('SELECT max(seq) AS seq FROM revisions WHERE record_id = ?')
  const addChange = sqlite.prepare(
    'INSERT INTO changes (id, record_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at, workspace_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const addRevision = sqlite.prepare(
    'INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, summary, data, deleted_at, op, ' +
      'actor_type, actor_id, session_id, at, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const rowsOfRun = sqlite.prepare('SELECT count(*) AS n FROM tool_uses WHERE run_id = ?')
  const movedRows = sqlite.prepare('SELECT count(*) AS n FROM tool_uses WHERE moved_at = ?')

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    for (const row of holders) {
      if (row.kind !== 'session') {
        throw new Error(
          `Record ${row.id} is a ${row.kind} and holds data.${TOOL_USES_FIELD}, which only a run's use door ever wrote. ` +
            'This step cannot tell whose uses they are. Nothing was written.',
        )
      }
      const data = JSON.parse(row.data) as unknown
      if (!isObject(data)) throw new Error(`Run ${row.id} holds data that is not an object. Nothing was written.`)
      const list = data[TOOL_USES_FIELD]
      const lines = linesOf(row.id, list)
      if ((rowsOfRun.get(row.id) as { n: number }).n > 0) {
        throw new Error(
          `Run ${row.id} holds data.${TOOL_USES_FIELD} and already has rows in tool_uses, so moving the list would store ` +
            'its uses twice. Nothing was written.',
        )
      }
      report.linesFound += lines.length
      for (const [i, line] of lines.entries()) {
        addUse.run(anOfficeId(), row.workspace_id, row.id, i + 1, line.at, line.tool, line.said, at)
      }
      delete data[TOOL_USES_FIELD]
      setData.run(JSON.stringify(data), row.id)
      addChange.run(anOfficeId(), row.id, 'update', THE_OFFICE.type, THE_OFFICE.id, null, `data.${TOOL_USES_FIELD}`, JSON.stringify(list), null, at, row.workspace_id)
      const content = contentOf({ kind: row.kind, title: row.title, summary: row.summary, data, deletedAt: row.deleted_at })
      const seq = ((newestSeq.get(row.id) as { seq: number | null } | undefined)?.seq ?? 0) + 1
      addRevision.run(
        anOfficeId(),
        row.id,
        row.workspace_id,
        seq,
        versionOf(content),
        row.kind,
        row.title,
        row.summary,
        JSON.stringify(content.data),
        row.deleted_at,
        'update',
        THE_OFFICE.type,
        THE_OFFICE.id,
        null,
        at,
        REVISION_NOTE,
      )
      report.moved.push({ run: row.id, lines: lines.length })
    }
    report.rowsWritten = (movedRows.get(at) as { n: number }).n
    if (report.rowsWritten !== report.linesFound) {
      throw new Error(
        `The lists held ${String(report.linesFound)} line(s) and tool_uses holds ${String(report.rowsWritten)} moved row(s). ` +
          'The move lost or added a use. Nothing was written.',
      )
    }
  })
  run()
  return report
}

/** The rows this step wrote, in every table: the uses, and one change row and one revision per list. */
export function rowsTheToolUseMoveWrote(report: Report): number {
  return report.rowsWritten + 2 * report.moved.length
}

/** The report as a person reads it. */
export function describeTheToolUseMove(report: Report): string {
  if (report.tableMissing) return 'tool uses: this database has no `tool_uses` table yet, so nothing was read or written'
  if (report.moved.length === 0 && report.linesFound === 0 && report.rowsWritten === 0) {
    return 'tool uses: no run held a list of tool uses in its data, so nothing was moved'
  }
  const runs = report.moved.length === 0 ? '' : ` (${report.moved.map((one) => `${one.run}: ${String(one.lines)}`).join(', ')})`
  return (
    `tool uses: moved ${String(report.moved.length)} list(s) holding ${String(report.linesFound)} line(s) into tool_uses ` +
    `as ${String(report.rowsWritten)} row(s), in order${runs}, ` +
    'and took data.toolUses off each run with one change row and one revision written as the office'
  )
}
