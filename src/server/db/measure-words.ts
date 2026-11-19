// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STORED READING-MEASURE WORDS, MOVED TO THEIR NEW NAMES. One transaction.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MOVES
 * ---------------------------------------------------------------------------------------
 *
 * Note c1QOUFaNMiWz: the preset word `readable` is misleading and should be named
 * narrow. The answer SSmnHqX7CuL_ settled the
 * list, widest first: full, wide, narrow, narrowest. So two stored words change meaning:
 *
 *     "narrow"    (26rem)        ->  "narrowest"
 *     "readable"  (var(--read))  ->  "narrow"
 *
 * The `measure` of every block and of every part of a `beside` block moves, at any depth, in the
 * field `blocksFieldOf` names for the record's kind: a report's `data.blocks`, a module's
 * `data.summaryBlocks`. Nothing else in `data` is read or written. `full`, `wide` and a ratio are
 * left exactly as they are.
 *
 * THE ORDER IS THE WHOLE OF THE CORRECTNESS. `narrow` moves to `narrowest` first, and only then
 * does `readable` move to `narrow`. The other way round, a stored `readable` would become `narrow`
 * and then `narrowest` in the same run, and a block asked to read at var(--read) would be drawn at
 * 26rem with nothing saying so. `MOVES` below holds the order, and the test of this file puts it
 * the wrong way round and watches the result go wrong.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: IT REWRITES STORED VALUES, AND SAYS SO HERE
 * ---------------------------------------------------------------------------------------
 *
 * There is no additive way to do this. A stored `readable` is refused by the write door once the
 * word leaves `MEASURE_PRESETS`, and a stored `narrow` would silently be drawn wider than it was
 * written. Each word keeps the width it had; only its name changes.
 *
 * ---------------------------------------------------------------------------------------
 * IT RESTAMPS THE NEWEST REVISION, THE WAY ./module-claims.ts DOES
 * ---------------------------------------------------------------------------------------
 *
 * It runs below `migrateRevisions`, so nothing comes along afterwards to catch the ledger up. The
 * newest revision's `content_hash` is the `version` a write has to send back, so a rewritten
 * record whose newest revision still hashed the old words could never be written again. So every
 * record it rewrites has its newest revision rewritten to what the record now holds, in the same
 * transaction, with a note where the revision had none. No `changes` row and no `updated_at`: a
 * migration is not somebody saying something.
 *
 * OLDER REVISIONS KEEP THE WORDS THEY WERE WRITTEN WITH. That is the precedent, and it has a cost
 * that is said here rather than left to be found: an older revision that holds `readable` is
 * refused if somebody restores it, and one that holds `narrow` is restored at the wider width
 * `narrow` has now. Rewriting every revision instead would change the hash of revisions that
 * short forms name by `seq` and `contentHash`, and those short forms would then read as "cannot
 * check" (`changedSince` in src/server/lib/zoom.ts).
 *
 * ---------------------------------------------------------------------------------------
 * IT RUNS ONCE, AND A MARKER IS WHAT MAKES THAT TRUE
 * ---------------------------------------------------------------------------------------
 *
 * The other data steps can each tell from the data whether they have already run. This one cannot:
 * a `narrow` written before it ran and a `narrow` written after it look the same, and a second
 * run would move both to `narrowest`. So it writes the one row of `measure_words_renamed`
 * (migration 0173) in the same transaction as the rename, and when that row is there it reads
 * nothing else and writes nothing.
 */
import type Database from 'better-sqlite3'
import { blocksFieldOf } from '../../shared/kinds.ts'
import { contentOf, versionOf } from './version.ts'
import { nowStamp } from '../../shared/time.ts'

/** One stored word and the word it becomes. */
export interface Move {
  from: string
  to: string
}

/**
 * THE TWO MOVES, IN THE ORDER THEY RUN. `narrow` goes first so that nothing is moved twice; the
 * header says why.
 */
export const MOVES: readonly Move[] = [
  { from: 'narrow', to: 'narrowest' },
  { from: 'readable', to: 'narrow' },
]

/** What the marker row's `because` says. */
export const MARKER_BECAUSE =
  'The stored reading-measure words were renamed: `narrow` became `narrowest`, then `readable` became `narrow`.'

/** What the restamped revision's `note` says, where it had none. */
export const REVISION_NOTE =
  'A migration renamed the reading-measure words stored in this record on 11 September 2026: `narrow` became ' +
  '`narrowest` and `readable` became `narrow`. Each block reads at the same width it did. ' +
  'Nobody wrote this revision; its time is the moment of the migration.'

export interface Report {
  /**
   * True when this database has no `measure_words_renamed` table, so there was nowhere to write that
   * the words were renamed, and nothing was read or written. Only a database migrated partway, to a
   * file before 0173, is in this state.
   */
  tableMissing: boolean
  /** True when this step had already run on this database and wrote nothing. */
  alreadyDone: boolean
  /** Records whose `data` was rewritten. */
  records: number
  /** How many stored `measure` values moved, by the word they held before. */
  moved: Record<string, number>
  /** How many newest revisions were rewritten so their hash still names what the record holds. */
  ledgerRestamped: number
}

interface RecordRow {
  id: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Every object that may carry a `measure`, in a list of blocks: each block, and each part of a
 * `beside` block, at any depth. Read from the stored JSON as it is, so a malformed container
 * contributes nothing rather than throwing.
 */
function holdersOfAMeasure(blocks: unknown, into: Record<string, unknown>[]): void {
  for (const block of asList(blocks)) {
    if (!isObject(block)) continue
    into.push(block)
    switch (block['type']) {
      case 'section':
      case 'grid':
        holdersOfAMeasure(block['blocks'], into)
        break
      case 'columns':
        for (const column of asList(block['columns'])) holdersOfAMeasure(column, into)
        break
      case 'tabs':
        for (const tab of asList(block['tabs'])) if (isObject(tab)) holdersOfAMeasure(tab['blocks'], into)
        break
      case 'beside':
        for (const part of asList(block['parts'])) {
          if (!isObject(part)) continue
          into.push(part)
          holdersOfAMeasure(part['blocks'], into)
        }
        break
    }
  }
}

/**
 * ONE MOVE OVER ONE RECORD'S BLOCKS, in place. Returns how many values it changed.
 *
 * The key keeps its place in the object, because key order is part of the content hash.
 */
export function applyMove(blocks: unknown, move: Move): number {
  const holders: Record<string, unknown>[] = []
  holdersOfAMeasure(blocks, holders)
  let n = 0
  for (const holder of holders) {
    if (holder['measure'] === move.from) {
      holder['measure'] = move.to
      n += 1
    }
  }
  return n
}

/**
 * Move the stored words once, and write the marker that says so in the same transaction.
 *
 * A DATABASE WITH NO MARKER TABLE IS LEFT ALONE. Migration 0173 creates the table, and
 * `migrateInPlace` runs every schema migration in its folder before any data step, so the table is
 * missing only on a database migrated to a file before 0173. Renaming the words there would rename
 * them a second time once 0173 arrived, because nothing could say it had been done. The report says
 * which of the two it was.
 */
export function migrateMeasureWords(sqlite: Database.Database): Report {
  const tableMissing =
    sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'measure_words_renamed'")
      .get() === undefined
  const alreadyRan =
    !tableMissing && sqlite.prepare('SELECT 1 FROM measure_words_renamed WHERE only_row = 1').get() !== undefined
  const report: Report = {
    tableMissing,
    alreadyDone: alreadyRan,
    records: 0,
    moved: Object.fromEntries(MOVES.map((move) => [move.from, 0])),
    ledgerRestamped: 0,
  }
  if (tableMissing || alreadyRan) return report

  const readRows = sqlite.prepare('SELECT id, kind, title, summary, data, deleted_at FROM records')
  const setData = sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  const ledgerIsThere =
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'revisions'").get() !== undefined
  const newestRevision = ledgerIsThere
    ? sqlite.prepare('SELECT id, note FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    : null
  const restamp = ledgerIsThere
    ? sqlite.prepare('UPDATE revisions SET data = ?, content_hash = ?, note = ? WHERE id = ?')
    : null

  const run = sqlite.transaction(() => {
    for (const row of readRows.all() as RecordRow[]) {
      const field = blocksFieldOf(row.kind)
      if (field === null) continue
      const data = JSON.parse(row.data) as unknown
      if (!isObject(data) || !Array.isArray(data[field])) continue
      let changed = 0
      for (const move of MOVES) {
        const n = applyMove(data[field], move)
        report.moved[move.from] = (report.moved[move.from] ?? 0) + n
        changed += n
      }
      if (changed === 0) continue
      setData.run(JSON.stringify(data), row.id)
      report.records += 1

      if (newestRevision === null || restamp === null) continue
      const newest = newestRevision.get(row.id) as { id: string; note: string | null } | undefined
      if (newest === undefined) continue
      const content = contentOf({
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        data,
        deletedAt: row.deleted_at,
      })
      restamp.run(JSON.stringify(content.data), versionOf(content), newest.note ?? REVISION_NOTE, newest.id)
      report.ledgerRestamped += 1
    }
    sqlite
      .prepare('INSERT INTO measure_words_renamed (only_row, renamed_at, because) VALUES (1, ?, ?)')
      .run(nowStamp(), MARKER_BECAUSE)
  })
  run()
  return report
}

/** The report as a person reads it. Every number the transaction produced, and nothing invented. */
export function describeMeasureWords(report: Report): string {
  if (report.tableMissing) {
    return 'measure words: this database has no `measure_words_renamed` table yet, so nothing was read or written'
  }
  if (report.alreadyDone) return 'measure words: already renamed on this database, so nothing was read or written'
  if (report.records === 0) {
    return 'measure words: no stored block or part said `narrow` or `readable`, so no word moved; the marker row is written'
  }
  const moves = MOVES.map((move) => `${String(report.moved[move.from] ?? 0)} \`${move.from}\` became \`${move.to}\``)
  return (
    `measure words: ${moves.join(', ')}, in ${String(report.records)} record(s), and ` +
    `${String(report.ledgerRestamped)} newest revision(s) restamped. Each block reads at the width it did.`
  )
}
