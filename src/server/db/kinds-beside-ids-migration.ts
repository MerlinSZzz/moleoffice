// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROWS WRITTEN BEFORE MIGRATION 0311 ARE TOLD WHOSE ID THEY HOLD, WHERE THE REGISTRIES SAY IT. The data half of
 * migration 0311 (`four_ids_have_a_kind_beside_them`), wave 13s round 155, item 30c part 3. One transaction with every
 * other data step.
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * 0311 puts a kind column, `person` or `agent`, beside four columns that hold the id of whoever did a thing, and their
 * writers fill it from now on. A row written before 0311 has no kind, so the identity census counts its value as one
 * that cannot be told, and a project's archive is refused while one is counted. This step tells the rows it can, by
 * what the registries hold when it runs, and leaves the rest without a kind.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES
 * ---------------------------------------------------------------------------------------
 *
 * It writes only a kind column that holds nothing, and only on a row whose id it can tell:
 *
 *   - `folder_readings.read_by`, `folder_readings.owner_id` and `revalidations.decided_by`: the kind of the one
 *     registry the id is in. An id is in the people registry when a person's row has it as its id or its handle, and in
 *     the agent registry when an agent's row has it as its id or its handle, or an alias names it. An id in both, or in
 *     neither, is left without a kind. A `decided_by` that holds nothing is left as it is.
 *   - `conversation_reads.as_side`, on a read of a conversation between two agents: `agent`, when the side is one of
 *     the two ids in `pair`. Any other side is left without a kind.
 *   - `conversation_reads.as_side`, on a read of a group: the kind of that group's member rows with that id, left or
 *     not, when they all say the same kind and it is `person` or `agent`. Rows that say different kinds leave it
 *     without a kind.
 *   - `conversation_reads.as_side`, on a read of a group as a side that no member row has: the kind stored beside the
 *     row's reader when the side is its reader, and otherwise the kind stored beside the group's opener when the side
 *     is its opener. Either is told only when that kind is `person` or `agent` and the id is not in both registries.
 *     Any other side is left without a kind. The office does not write a read of a group it is not in as the reader's
 *     own side; it reads that group as a member's side, or as the opener's when there is no member.
 *
 * A read as neither side is left without a kind, because it names nobody. It deletes nothing, writes no record, no
 * change row and no revision, and changes no id.
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS ONLY IN THE RUN THAT APPLIES 0311
 * ---------------------------------------------------------------------------------------
 *
 * Every data step runs on every `migrateInPlace`. This one must not: a row a writer leaves without a kind later, or one
 * an archive's import brings in, would be told by what the registries hold on some later start, which is not what was
 * known when it was written. So it does its work only when `applied` holds 0311. A data step writes the rows rather
 * than the `.sql` file because tests/migration.test.ts allows no UPDATE in a migration file that is not on its REBUILDS
 * list.
 */
import type Database from 'better-sqlite3'
import { NEITHER_SIDE } from '../../shared/messages.ts'
import { isParticipantKind, type ParticipantKind } from '../../shared/participants.ts'

/** The migration whose data half this is. The merge queue renames it here if it renumbers the migration. */
export const THE_MIGRATION = '0311_four_ids_have_a_kind_beside_them'

/** The three columns told by the registry their id is in, each by its table, a dot and the column, with its kind column. */
const TOLD_BY_THE_REGISTRIES = [
  { site: 'folder_readings.read_by', kind: 'read_by_kind' },
  { site: 'folder_readings.owner_id', kind: 'owner_kind' },
  { site: 'revalidations.decided_by', kind: 'decided_by_kind' },
] as const

/** The side a conversation was read as, told by the conversation. */
const THE_SIDES = { site: 'conversation_reads.as_side', kind: 'as_side_kind' } as const

/** Each column this step tells, with the kind column beside it. */
export const THE_COLUMNS_IT_TELLS = [...TOLD_BY_THE_REGISTRIES, THE_SIDES] as const

/** How many rows of one column were told each kind, and how many were left without one. */
export interface Told {
  person: number
  agent: number
  untold: number
}

export interface Report {
  /** False when this run of the migrations did not apply 0311, so nothing was read or written. */
  ran: boolean
  /** Each column of THE_COLUMNS_IT_TELLS, by its site. A row that holds nothing, or a read as neither side, is not counted. */
  told: Record<string, Told>
  /** The rows whose kind it wrote, as SQLite counted them. A row with two columns told is counted once for each. */
  rowsWritten: number
}

// THE PAIR AS THE ROWS BEFORE 0311 WERE WRITTEN: two different ids that are not empty, with one tilde between them. The
// rule lives in src/server/lib/messages.ts as `pairFrom`, which this step cannot import, because that file opens the
// office's database when it loads. This copy reads only rows written before 0311, so it stays the rule they were
// written by if that one changes.
function theTwoSides(pair: string): [string, string] | null {
  const parts = pair.split('~')
  if (parts.length !== 2) return null
  const [a, b] = parts as [string, string]
  return a === '' || b === '' || a === b ? null : [a, b]
}

/** Tell the four columns of the rows written before 0311, when `applied` holds it. */
export function tellTheKindsBesideTheIds(sqlite: Database.Database, applied: readonly string[]): Report {
  const report: Report = { ran: false, told: {}, rowsWritten: 0 }
  if (!applied.includes(THE_MIGRATION)) return report
  report.ran = true
  const isAPerson = sqlite.prepare('SELECT 1 FROM people WHERE id = ? OR handle = ? LIMIT 1')
  const isAnAgent = sqlite.prepare(
    "SELECT 1 FROM agents WHERE id = ? OR handle = ? UNION ALL SELECT 1 FROM registry_aliases WHERE namespace = 'agent-registry' AND alias_id = ? LIMIT 1",
  )
  const theRegistryOf = (id: string): ParticipantKind | null => {
    const person = isAPerson.get(id, id) !== undefined
    const agent = isAnAgent.get(id, id, id) !== undefined
    return person === agent ? null : person ? 'person' : 'agent'
  }
  const inBoth = (id: string): boolean => isAPerson.get(id, id) !== undefined && isAnAgent.get(id, id, id) !== undefined
  for (const { site } of THE_COLUMNS_IT_TELLS) report.told[site] = { person: 0, agent: 0, untold: 0 }
  const count = (site: string, kind: ParticipantKind | null) => {
    report.told[site]![kind ?? 'untold'] += 1
  }

  for (const { site, kind: kindColumn } of TOLD_BY_THE_REGISTRIES) {
    const [table, column] = site.split('.') as [string, string]
    const write = sqlite.prepare(`UPDATE "${table}" SET "${kindColumn}" = ? WHERE id = ? AND "${kindColumn}" IS NULL`)
    const rows = sqlite.prepare(`SELECT id, "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL AND "${kindColumn}" IS NULL ORDER BY id`).all() as {
      id: string
      value: string
    }[]
    for (const row of rows) {
      const kind = theRegistryOf(row.value)
      count(site, kind)
      if (kind !== null) report.rowsWritten += write.run(kind, row.id).changes
    }
  }

  const theMembersKinds = sqlite.prepare('SELECT DISTINCT member_kind AS kind FROM group_members WHERE group_id = ? AND member_id = ?')
  const theOpenerOf = sqlite.prepare('SELECT opened_by_kind AS kind, opened_by_id AS id FROM groups WHERE id = ?')
  const writeTheSide = sqlite.prepare('UPDATE conversation_reads SET as_side_kind = ? WHERE id = ? AND as_side_kind IS NULL')
  const reads = sqlite
    .prepare('SELECT id, pair, as_side AS side, reader_kind AS readerKind, reader_id AS reader FROM conversation_reads WHERE as_side_kind IS NULL AND as_side <> ? ORDER BY id')
    .all(NEITHER_SIDE) as { id: string; pair: string; side: string; readerKind: string; reader: string }[]
  const told = (kind: unknown): ParticipantKind | null => (isParticipantKind(kind) ? kind : null)
  for (const read of reads) {
    let kind: ParticipantKind | null = null
    if (read.pair.includes('~')) {
      if (theTwoSides(read.pair)?.includes(read.side) === true) kind = 'agent'
    } else {
      const kinds = (theMembersKinds.all(read.pair, read.side) as { kind: string }[]).map(one => one.kind)
      const only = kinds.length === 1 ? kinds[0] : undefined
      if (isParticipantKind(only)) kind = only
      // NO MEMBER ROW HAS THE SIDE: it is told by the kind stored beside the same id in this row or in the group's own.
      else if (kinds.length === 0 && !inBoth(read.side)) {
        const opener = theOpenerOf.get(read.pair) as { kind: string; id: string } | undefined
        if (read.side === read.reader) kind = told(read.readerKind)
        else if (read.side === opener?.id) kind = told(opener.kind)
      }
    }
    count(THE_SIDES.site, kind)
    if (kind !== null) report.rowsWritten += writeTheSide.run(kind, read.id).changes
  }
  return report
}

/** The rows this step wrote, as SQLite counted them. */
export function rowsTheKindsStepWrote(report: Report): number {
  return report.rowsWritten
}

/** What it did, in one sentence without the step's name: the line the preview puts after that name. */
export function whatTheKindsStepDid(report: Report): string {
  if (report.rowsWritten === 0 && !report.ran) return 'this run did not apply migration 0311, so nothing was read or written'
  const each = THE_COLUMNS_IT_TELLS.map(({ site }) => {
    const told = report.told[site] ?? { person: 0, agent: 0, untold: 0 }
    return `${site} ${String(told.person)} person, ${String(told.agent)} agent, ${String(told.untold)} left untold`
  })
  return `wrote the kind beside ${String(report.rowsWritten)} id(s) written before migration 0311: ${each.join('; ')}`
}

/** The report as a person reads it. */
export function describeTheKindsStep(report: Report): string {
  return `kinds beside ids: ${whatTheKindsStepDid(report)}`
}
