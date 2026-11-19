// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE WRITES `needsNoCheck` ON A SECRETARY'S RUN IT FILED BEFORE IT WROTE THAT FIELD. Problem
 * 7zhliUpNgKPx. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Since main 3822e94cd (25 September 2026), `submitASecretarysDesignEntry` writes `needsNoCheck` in
 * the first write of the run it files for a secretary's design/-only merge entry, so the run reads
 * closed. Runs it filed before that carry no such field and still read as waiting for a check that
 * nothing will ask for. The record door refuses `needsNoCheck` from every caller, so no door can add
 * it now. This step adds it.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH RUNS, FOUND THROUGH THEIR MERGE ENTRY
 * ---------------------------------------------------------------------------------------
 *
 * It reads every merge entry that is not deleted and names a run. It takes the run the entry names
 * when `theOfficeFiledThisRunForASecretarysEntry` (src/server/lib/the-offices-secretary-run.ts) says
 * the office filed it for that entry: the state machine asks the same function before it merges such
 * an entry with no release. Of those runs it writes only on one that holds no `needsNoCheck` key at
 * all. It never reads a run's title.
 *
 * A seal that is not a seal, or does not hash to what its entry holds, stops the step with an error
 * naming the entry, and nothing is written. The state machine refuses such an entry too.
 * A run that holds a `needsNoCheck` the product cannot read stops the step the same way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AS THE OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * On each such run, and nothing else:
 *   - `data.needsNoCheck`, naming a decision, the moment of this step, and a sentence saying the
 *     office wrote it at a migration, through which entry;
 *   - one `changes` row for that field, and one revision holding what the run now holds. Both are
 *     written as the office (`mole-office/the-api-server`), which is who writes the field at filing.
 * It does not change `updated_at`, the title or any other field.
 *
 * It runs below the revision pass and writes its own revision, so the run's newest revision still
 * names what the run holds and the run stays writable.
 *
 * ---------------------------------------------------------------------------------------
 * A SECOND RUN CHANGES NOTHING
 * ---------------------------------------------------------------------------------------
 *
 * A run that holds `needsNoCheck` is left alone, so the runs this step wrote on are left alone the
 * next time. No marker row is needed.
 */
import type Database from 'better-sqlite3'
import { anOfficeId } from './ids.ts'
import { NEEDS_NO_CHECK, readNeedsNoCheck, type NeedsNoCheck } from '../../shared/releasing.ts'
import { MERGE_ENTRY_KIND } from '../../shared/merge-queue.ts'
import { nowStamp } from '../../shared/time.ts'
import { contentOf, versionOf } from './version.ts'
import {
  NO_CHECK_OF_A_SECRETARYS_ENTRY,
  THE_OFFICE_WRITES_AS,
  theOfficeFiledThisRunForASecretarysEntry,
} from './the-offices-secretary-run.ts'

/** One run this step wrote on, and the merge entry it was found through. */
export interface Marked {
  run: string
  entry: string
}

export interface Report {
  /**
   * True when this database has no `revisions` table, so no run's first writer can be read, and nothing was read
   * or written. Only a database migrated partway, to a file before 0060, is in this state, and it holds no merge
   * entry either.
   */
  ledgerMissing: boolean
  /** Runs this step wrote `needsNoCheck` on. */
  written: number
  /** Which runs, each with its entry. */
  marked: Marked[]
  /** Runs the office filed for a secretary's entry that already held `needsNoCheck`, and were left alone. */
  alreadyHeldIt: number
}

/** The sentence the step writes into the field's `because`. */
export function whyTheOfficeWroteIt(entry: string, at: string): string {
  return (
    `The office filed this run for a secretary's design/-only merge entry (${entry}) before runs carried this field. ` +
    `A migration wrote it for the office on ${at}. Decision ${NO_CHECK_OF_A_SECRETARYS_ENTRY} asks no check of such an entry.`
  )
}

/** What the revision's `note` says. */
export const REVISION_NOTE =
  "A migration wrote needsNoCheck on this run for the office, because the office filed it for a secretary's design/-only " +
  'merge entry before it wrote that field. Nothing else in the run changed.'

interface RecordRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  workspace_id: string | null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored `seal` of an entry, `{ id, hash }`, or null. */
function theEntrysSeal(data: Record<string, unknown>): { id: string; hash: string } | null {
  const seal = data['seal']
  if (!isObject(seal) || typeof seal['id'] !== 'string' || typeof seal['hash'] !== 'string') return null
  return { id: seal['id'], hash: seal['hash'] }
}

/** Write `needsNoCheck` on every run the office filed for a secretary's design/-only entry that holds none. */
export function markSecretaryRunsAsNeedingNoCheck(sqlite: Database.Database): Report {
  const ledgerMissing = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'revisions'").get() === undefined
  const report: Report = { ledgerMissing, written: 0, marked: [], alreadyHeldIt: 0 }
  if (ledgerMissing) return report
  const readRecord = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at, workspace_id FROM records WHERE id = ?')
  const entries = sqlite
    .prepare(
      "SELECT id, data FROM records WHERE kind = ? AND deleted_at IS NULL AND json_type(data, '$.run') = 'text' ORDER BY created_at, rowid",
    )
    .all(MERGE_ENTRY_KIND) as { id: string; data: string }[]
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

  const run = sqlite.transaction(() => {
    const at = nowStamp()
    const seen = new Set<string>()
    for (const entryRow of entries) {
      const entryData = JSON.parse(entryRow.data) as unknown
      if (!isObject(entryData)) continue
      const runId = entryData['run'] as string
      const entrySeal = theEntrysSeal(entryData)
      if (entrySeal === null || seen.has(runId)) continue
      const row = readRecord.get(runId) as RecordRow | undefined
      if (row === undefined) continue
      const data = JSON.parse(row.data) as unknown
      if (!isObject(data)) continue
      const filedForIt = theOfficeFiledThisRunForASecretarysEntry(
        sqlite,
        { id: row.id, kind: row.kind, deletedAt: row.deleted_at, data },
        entrySeal.id,
        () => {
          const sealRow = readRecord.get(entrySeal.id) as RecordRow | undefined
          const sealData = sealRow === undefined ? null : (JSON.parse(sealRow.data) as unknown)
          const seal = isObject(sealData) ? sealData['seal'] : undefined
          if (sealRow?.kind !== 'sealed_tip' || !isObject(seal)) {
            throw new Error(`Merge entry ${entryRow.id} names seal ${entrySeal.id}, which is not a seal here. Nothing was written.`)
          }
          if (seal['hash'] !== entrySeal.hash) {
            throw new Error(`Seal ${entrySeal.id} does not hash to what merge entry ${entryRow.id} holds. Nothing was written.`)
          }
          const git = seal['git']
          if (!isObject(git) || !Array.isArray(git['files'])) return null
          return git['files'].map((one) => (isObject(one) && typeof one['path'] === 'string' ? one['path'] : ''))
        },
      )
      if (!filedForIt) continue
      seen.add(runId)
      if (NEEDS_NO_CHECK in data) {
        if (readNeedsNoCheck(data[NEEDS_NO_CHECK]) === null) {
          throw new Error(`Run ${runId} holds a needsNoCheck that names no decision, so this step cannot tell what it says. Nothing was written.`)
        }
        report.alreadyHeldIt += 1
        continue
      }
      const needsNoCheck: NeedsNoCheck = { decision: NO_CHECK_OF_A_SECRETARYS_ENTRY, at, because: whyTheOfficeWroteIt(entryRow.id, at) }
      data[NEEDS_NO_CHECK] = needsNoCheck
      setData.run(JSON.stringify(data), runId)
      addChange.run(
        anOfficeId(),
        runId,
        'update',
        THE_OFFICE_WRITES_AS.type,
        THE_OFFICE_WRITES_AS.id,
        null,
        `data.${NEEDS_NO_CHECK}`,
        null,
        JSON.stringify(needsNoCheck),
        at,
        row.workspace_id,
      )
      const content = contentOf({ kind: row.kind, title: row.title, summary: row.summary, data, deletedAt: row.deleted_at })
      const seq = ((newestSeq.get(runId) as { seq: number | null } | undefined)?.seq ?? 0) + 1
      addRevision.run(
        anOfficeId(),
        runId,
        row.workspace_id,
        seq,
        versionOf(content),
        row.kind,
        row.title,
        row.summary,
        JSON.stringify(content.data),
        row.deleted_at,
        'update',
        THE_OFFICE_WRITES_AS.type,
        THE_OFFICE_WRITES_AS.id,
        null,
        at,
        REVISION_NOTE,
      )
      report.written += 1
      report.marked.push({ run: runId, entry: entryRow.id })
    }
  })
  run()
  return report
}

/** The report as a person reads it. */
export function describeSecretaryRunsNeedNoCheck(report: Report): string {
  if (report.ledgerMissing) return 'secretary runs: this database has no `revisions` table yet, so nothing was read or written'
  const held = `${String(report.alreadyHeldIt)} already held it`
  if (report.written === 0) {
    return `secretary runs: no run the office filed for a secretary's design/-only entry lacked needsNoCheck; ${held}`
  }
  return (
    `secretary runs: needsNoCheck written for the office on ${String(report.written)} run(s) it filed for a secretary's ` +
    `design/-only entry (${report.marked.map((one) => `${one.run} through entry ${one.entry}`).join(', ')}); ${held}`
  )
}
