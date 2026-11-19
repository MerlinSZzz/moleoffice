// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAVE'S STATEMENT OF WHAT EACH CHANGED WORKER COMMIT BECAME. This follows a decision, on a worker's design (report
 * aUYFiA68BGIz, block b-17, point 2), and option B of a message.
 *
 * When a wave's rounds resolve a conflict inside a worker's commit, the worker's own lines change, and no proof git can
 * check alone tells that from damage (the same report measured it). So the wave states, for each such commit, what it
 * became, and the superseded door accepts the statement as a fourth proof only when an inspector's release covers it
 * and git agrees with every other line of it (`theStatementSettles` in src/server/lib/inspection.ts).
 *
 * THE SHAPE: a `report` record holding exactly one `table` block whose columns are exactly `STATEMENT_COLUMNS`, one row
 * per changed worker commit. A report and a table, rather than a new record kind, because the statement is finished
 * writing a person reads beside the evidence it rests on, which a report already is; a table is already stored,
 * validated, drawn at every width and sealed with the run that files it; and a new kind would add a page nobody needs.
 * The columns are declared here and nowhere else, and `readAStatement` reads them strictly: a statement that does not
 * parse is refused in words, never read loosely.
 */

/** The columns of a statement's table, in this order, spelled exactly so. */
export const STATEMENT_COLUMNS = ['worker run', 'worker commit', 'became on main', "files where the wave changed the worker's own lines"] as const

/** How the files of one row are separated in their cell. */
export const STATEMENT_FILES_SEPARATOR = ', '

/** One changed worker commit, as a statement names it. */
export interface StatedCommit {
  /** The worker's run, by record id. */
  run: string
  /** The worker's commit, as written: its hexadecimal name, 7 to 40 characters. */
  workerCommit: string
  /** The commit it became on the lane's main, as written. */
  became: string
  /** The files where the wave changed the worker's own lines. */
  files: string[]
}

const A_COMMIT = /^[0-9a-f]{7,40}$/i

/**
 * THE STATEMENT A RECORD HOLDS, or the one sentence saying why it holds none. Strict: the record is a report with
 * exactly one table whose column labels are exactly `STATEMENT_COLUMNS`, and every row has a run, two commit names and
 * at least one file, with no file named twice.
 */
export function readAStatement(record: { id: string; kind: string; data: Record<string, unknown> }): { rows: StatedCommit[] } | { says: string } {
  if (record.kind !== 'report') return { says: `Record ${record.id} is not a report, and a statement is a report.` }
  const blocks = Array.isArray(record.data['blocks']) ? (record.data['blocks'] as unknown[]) : []
  const tables = blocks.filter((block): block is Record<string, unknown> => {
    if (typeof block !== 'object' || block === null) return false
    const one = block as Record<string, unknown>
    if (one['type'] !== 'table' || !Array.isArray(one['columns'])) return false
    const labels = (one['columns'] as unknown[]).map((column) => (typeof column === 'object' && column !== null ? (column as Record<string, unknown>)['label'] : undefined))
    return labels.length === STATEMENT_COLUMNS.length && labels.every((label, at) => label === STATEMENT_COLUMNS[at])
  })
  if (tables.length !== 1) {
    return { says: `Report ${record.id} holds ${String(tables.length)} tables with the statement's columns (${STATEMENT_COLUMNS.join(' | ')}), and a statement holds exactly one.` }
  }
  const rows: StatedCommit[] = []
  const table = tables[0]!
  for (const [at, row] of (Array.isArray(table['rows']) ? (table['rows'] as unknown[]) : []).entries()) {
    const cells = typeof row === 'object' && row !== null && Array.isArray((row as Record<string, unknown>)['cells']) ? ((row as Record<string, unknown>)['cells'] as unknown[]) : []
    const [run, workerCommit, became, files] = cells.map((cell) => (typeof cell === 'string' ? cell.trim() : ''))
    const named = (files ?? '').split(STATEMENT_FILES_SEPARATOR).map((one) => one.trim()).filter((one) => one !== '')
    if (cells.length !== STATEMENT_COLUMNS.length || !run || !A_COMMIT.test(workerCommit ?? '') || !A_COMMIT.test(became ?? '') || named.length === 0 || new Set(named).size !== named.length) {
      return { says: `Row ${String(at + 1)} of report ${record.id}'s statement is not a run, a worker commit, the commit it became, and the files, each file once.` }
    }
    rows.push({ run: run!, workerCommit: workerCommit!, became: became!, files: named })
  }
  if (rows.length === 0) return { says: `Report ${record.id}'s statement names no commit.` }
  return { rows }
}
