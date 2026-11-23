// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Seed the database with three weeks of work on an invented demo project.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Every screenshot, every manual review and every demonstration of Mole Office happens on this data.
 * It used to hold 28 records, which is far too thin to judge a design on: an interface that holds
 * together on 28 records tells you nothing about 2,000. The public corpus now holds 230 records, of
 * which 227 are live, and the seed writes 51 pipeline blocks and four fixtures of its own beside them.
 * They come in the proportions of real use: many sessions, tasks, messages and notes, and few
 * decisions and purchases. The project they describe is invented: a town library digitising and
 * indexing its old weekly newspaper from microfilm.
 *
 * The content comes from a corpus file — `scripts/seed-corpus/public.json` unless
 * MOLE_OFFICE_SEED_CORPUS names another — and this script writes it through the real write path,
 * so it can carry the things a static mock-up cannot: consequence, pause, gate, fulfilment.
 * `design/fixture.json` is the static ancestor of it, still read by one test.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT HAS TO DEMONSTRATE, BECAUSE A REVIEWER CAN ONLY SEE WHAT THE DATA CONTAINS
 * ---------------------------------------------------------------------------------------
 *
 * The vocabulary is defined once, in src/shared/work.ts, and this file imports it rather than
 * restating it. Everything below is data written against that contract:
 *
 *   CONSEQUENCE   who is hurt if a thing is left alone, STORED and never inferred. All six bearers
 *                 appear, including several `none`, because an honest "nothing follows from this"
 *                 is what makes a list shorter. The safety item — two reels of nitrate film stored
 *                 beside the scanner lamp — is filed TODAY with `bearer: 'person'`, and the check below
 *                 refuses to finish unless it comes out at the top of the attention list. A rule
 *                 that ranks a three-week-old copy of that record above a fresh one is the exact
 *                 defect the whole exercise turned on.
 *   PAUSE         four of them, and all four read differently: a resume date that has passed, one
 *                 still ahead, one whose resume condition is another record, one open-ended with
 *                 no resume condition at all. A fifth carries a condition written in prose.
 *   GATE          hard and partial, on `blocks` links AND on pipeline step `needs`. The case the
 *                 partial gate exists for is here: both OCR runs on the accuracy sample can be done
 *                 without the proofread text, but nothing can be scored without it. That is a
 *                 partial gate, and recording it as a hard one would make most of that work look
 *                 blocked.
 *   NEEDS         one pipeline — the OCR accuracy check — genuinely branches and rejoins. Three
 *                 tracks run from the same step and all three feed the scoring at the end. The old
 *                 model could not express that shape at all and the fixture had to write the
 *                 branch into the step NAMES.
 *   FULFILMENT    one obligation is discharged with `done`, `fulfilledAt` and `fulfilledNote`, so
 *                 the attention list can be seen to shrink. `data.done` is not new — it was
 *                 declared in kinds.ts and read by the alarm panel from the start, and NOTHING
 *                 EVER WROTE IT. This is the thing that writes it.
 *   CLASSIFIED    every state word every seeded record carries is one STATE_MEANING can read, and
 *                 check() below FAILS if any is not. It used to require the opposite — purchases
 *                 and fixed problems were seeded precisely because their words were unclassified —
 *                 and that stopped being possible when the ten declared words were classified. The
 *                 group itself is still real; it is now reached only by a word from an older
 *                 vocabulary, which is what it was always for.
 *
 * Sessions cover all six states, nine have NO state at all — different from `unknown`, which is a
 * judgement — and twenty-four are explicitly confirmed finished so a reader can collapse those and
 * only those. Three records are soft-deleted with live links pointing at them, five modules and
 * twenty-six other records are deliberately incomplete, and one claim is contradicted by another
 * while a pipeline still consumes it.
 *
 * ---------------------------------------------------------------------------------------
 * RUNNING IT TWICE
 * ---------------------------------------------------------------------------------------
 *
 * Running this twice is a no-op. Every record is matched by title, every link by its two ends and
 * its type, and every fabricated change
 * row by a fixed id, so a second run finds everything already there and writes nothing — not even
 * a change-log row. Everything dated is measured from the START OF TODAY rather than from the
 * current instant, which is what lets idempotence and a demo that stays fresh be true at once.
 * See THE DEMO CLOCK below.
 *
 * MATCHING BY TITLE MEANS THIS SCRIPT STOPS WHEN A TITLE NAMES TWO RECORDS, and that is the right
 * answer rather than a fault. A title used to name at most one record, because `records_title_idx`
 * was UNIQUE(workspace_id, title). The migration `0030_titles_may_repeat` ended that on 17 August
 * 2026: an id is identity, a title is presentation, and two records may share a name. A spec here
 * is keyed by its title and carries no id, so when a title means two rows this script has no way to
 * say which one it meant. `upsertContent` below says what it does about that and why writing over
 * one of them would be worse.
 *
 * Importing this file runs the seed. It is a script, and scripts/reset.ts depends on that.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THIS CORPUS IS ALLOWED TO GO, AND WHAT EVERY ROW OF IT SAYS ABOUT ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * Two things, both settled by decision 17, both implemented under THE PROVENANCE MARK below.
 *
 *   1. EVERY RECORD THIS FILE WRITES IS STAMPED `fixture`, in the `records.origin` column, at the
 *      moment it is written. The word is about the PATH IN and not about the content: much of what
 *      is here paraphrases real notes from this lab. `check()` reads the stamps back out of the
 *      database and refuses to finish if one is missing.
 *   2. THIS FILE WILL NOT WRITE INTO A DATABASE HOLDING RECORDS IT CANNOT ACCOUNT FOR AS FIXTURE
 *      unless the caller says `--include-fixture`. An empty database and an already-seeded one hold
 *      none, so `npm run db:reset`, `node tools/review.mjs` and every test that seeds a throwaway
 *      database are unaffected. The working database holds 95 authored records, so seeding it is
 *      now something somebody says out loud.
 *
 * ---------------------------------------------------------------------------------------
 * COMPLETE ON PURPOSE, INCOMPLETE ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office validates a write as "strict schema, flexible completeness": an unknown key, a wrong
 * type, a value outside a vocabulary or a contradiction between two fields is refused outright,
 * while a field that is simply absent is stored and reported as incomplete on read. Every record
 * here goes through `createRecord`, which is the same gate a POST goes through, so nothing in this
 * file is stored under a rule the API does not also apply.
 *
 * Thirty-one records are incomplete ON PURPOSE and they are listed in INCOMPLETE_ON_PURPOSE below.
 * That is 14 % of the corpus, which is roughly what the real database looks like: a record filed
 * the minute work starts, with the write-up arriving later, is the normal case here and not an
 * error. Completeness itself is never stored — it is recomputed from KIND_SPECS on every read —
 * so these records carry no flag and could not carry a stale one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SEED USED TO STOP AT NINE RECORDS
 * ---------------------------------------------------------------------------------------
 *
 * A real bug, fixed in `upsert` below, and worth keeping written down because the symptom pointed
 * somewhere else entirely. The script would report "19 already current" while the app could see
 * only NINE records. Those records were still in the table, soft-deleted: Mole Office deletes by
 * setting `deleted_at`, `getRecordByTitle` does not filter on it — deliberately, because titles
 * are unique across live AND deleted rows — so `upsert` FOUND each one, compared its contents,
 * found them identical and declared it "already current", while `listRecords()` skipped them.
 *
 * The fix is to say which record is meant to be gone instead of inferring it from the fact that it
 * is gone: `retracted: true` on those three specs, and `upsert` restores any other seeded record
 * it finds deleted. Two consequences worth keeping in mind if this is edited again:
 *
 *   - "unchanged" means the CONTENT matches. It never again means "and therefore leave it alone",
 *     because deleted-ness is part of the state this script owns.
 *   - a seed that cannot repair is not idempotent, it is only harmless on a database it has to
 *     itself. Those are different properties and the first is the one that was claimed.
 */

import { and, eq } from 'drizzle-orm'
import { db, sqlite } from '../src/server/db/client.ts'
import { changes as changesTable, counterRows as counterRowsTable, links as linksTable, records as recordsTable } from '../src/server/db/schema.ts'
import {
  createLink,
  createRecord,
  deleteRecord,
  getRecordByTitle,
  listChanges,
  listRecords,
  localStamp,
  restoreRecord,
  storedSessionRefs,
  unmetDependencies,
  updateRecord,
  patchRecord,
  HUMAN,
  type Actor,
} from '../src/server/lib/records.ts'
import { resolveSessionRef } from '../src/server/lib/resolve-session-ref.ts'
import { asTheCounterDoors } from '../src/server/lib/counter-door.ts'
import { addBlock } from '../src/server/lib/blocks.ts'
import { markTheMasterPipeline } from '../src/server/lib/master-pipeline.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import {
  ITEM_STATES,
  SUMMARY_BLOCK_TYPES,
  type ActorType,
  type Change,
  type ChangeOp,
  type ChartAnnotation,
  type ChartAxis,
  type ChartBlock,
  type ChartPoint,
  type ChartSeries,
  type ChartSpec,
  type ImageBlock,
  type ItemState,
  type Link,
  type LinkType,
  type MathBlock,
  type ModuleData,
  type PanelRecord,
  type RecordKind,
  RECORD_KINDS,
  // The provenance vocabulary and its reader. This file never restates the two words and never
  // decides an origin from anything it can see about a record: it writes `fixture` because it is
  // the thing that wrote the record, which is the only evidence that word is ever allowed to rest
  // on. See THE PROVENANCE MARK below.
  readOrigin,
  type SessionState,
  type SummaryBlock,
  type SummaryBlockType,
  type TableBlock,
  type TableColumn,
  type TableRow,
  type TextBlock,
} from '@shared/types.ts'
import { completenessOf } from '@shared/kinds.ts'
import { THE_PERSON } from '@shared/person.ts'
import { theOfficeOwner } from '../src/server/db/the-office-owner.ts'
// The contract for this whole pass. What a state word means, who is hurt, what a pause is, how
// hard a gate is and whether an obligation is discharged are all defined there, once. This file
// imports the vocabulary and the predicates and restates neither.
import {
  CONSEQUENCE_BEARERS,
  gateIsWellFormed,
  isSafety,
  progressOf,
  readConsequence,
  readFulfilment,
  readPause,
  type Consequence,
  type ConsequenceBearer,
  type Gate,
  type GateKind,
  type Pause,
} from '@shared/work.ts'
// The rule that decides what needs somebody today, and the ranking over it. The seed finishes by
// running everything it just wrote through this and refusing to finish if the demo has stopped
// demonstrating. It is plain TypeScript over plain data, so a script can import it.
import { computeAttention, compareRows, type AttentionResult } from '@shared/attention.ts'
// The browser's readers for the kinds the pages draw, and its one due-date rule. The seed reads
// the data back through them so that a page which cannot parse a record fails HERE rather than in
// front of a reviewer. This used to import the browser's own attention engine as well; that engine
// is gone, and the note where it was checked says what replaced it.
import {
  parseDueStamp,
  parseLocalStamp,
  readObligations,
  readPipelines,
  readSessions,
  DUE_SOON_HOURS,
  HOUR_MS,
  SESSION_STATES,
} from '../src/web/lib/attention.ts'
// The corpus: every record's words, every pipeline's steps, and the two tables that say which
// records are incomplete on purpose and when things moved. It comes out of a JSON file named by
// MOLE_OFFICE_SEED_CORPUS, and the public one in this repository is the default. See seed-corpus.ts
// for why the words are not in this file any more.
import {
  CORPUS_DAYS_MOVED,
  TODAY,
  CORPUS,
  corpusPath,
  corpusSteps,
  OCR_SUMMARY,
  SCANNER_SUMMARY,
  writeTheOwnerIntoTheCorpus,
  type CorpusItemTransition,
  type CorpusRecord,
  type CorpusStateTransition,
  type CorpusStep,
} from './seed-corpus.ts'

// Re-exported for the tests, which read the two curated summaries the corpus carries and run every
// block through the server's own schemas. Each is named after the module it belongs to.
export { OCR_SUMMARY, SCANNER_SUMMARY }

// ============================================================================================
// THE DEMO CLOCK
// ============================================================================================
//
// The home page does not ask "what exists" — the records page answers that — it asks "what needs
// me today". Every rule behind that question is about TIME: a session that crashed in the night,
// an obligation due inside 48 hours, a pause whose resume date has passed. A seed whose every
// record was written four seconds ago exercises none of them.
//
// So every clock-sensitive value in this file is an offset from THE START OF TODAY, never from
// the current instant. That one choice is what makes the seed realistic and idempotent at once:
//
//   from Date.now()      the rules fire, but every run computes different strings, so a rerun
//                        rewrites the workspace and leaves a change row behind for each record.
//   fixed dates          a rerun is a no-op, but "due 2026-08-09" leaves the 48-hour window the
//                        day after it was written and the rule it demonstrates quietly stops
//                        firing — the exact silent staleness this project exists to prevent.
//   offset from today    both. Two runs on the same day compute byte-identical data, so the
//                        second writes nothing at all, and the demo re-anchors itself as soon
//                        as the day changes.
//
// Crossing midnight between two runs updates the dated records in place. That is a refresh, not
// a duplicate, and the summary at the end reports it as `updated`.
//
// UNDER `npm run db:reset` THE CLOCK ITSELF READS MIDNIGHT. scripts/reset.ts fixes it there, and
// makes the ids in turn, while it writes a fresh database, so two resets on one day write the same
// rows (wave 13y round 37). Everything below that is
// written "now" is then written at midnight. Run on its own, this script reads the real clock.

// TODAY — midnight this morning, local — is defined once, in seed-corpus.ts, because the corpus's
// literal stamps are moved onto the same day there; see `Corpus.today`.

/**
 * The stored timestamp format, "YYYY-MM-DD HH:MM:SS", in LOCAL time.
 *
 * `localStamp` is the one copy of that rule, in src/shared/time.ts, and it is what every row in
 * every other table is written with — so a back-dated seed row sorts against a real change row
 * instead of an hour away from it. This used to be a seventh hand-written copy of the formatter.
 */
const stampOf = localStamp

/** A calendar day away from today. Uses setDate, so month ends and DST are the calendar's job. */
function dayOffset(days: number): Date {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * When something happened, as whole days before today plus a wall-clock time.
 *
 * A tuple rather than a date string because every record in this file is dated relative to the
 * demo clock, and a literal date would leave the 48-hour window and the three-day rule behind on
 * the day after it was written.
 */
export type At = readonly [days: number, hour: number, minute: number]

/**
 * A moment on an earlier day, e.g. `agoAt(1, 23, 15)` for last night at 23:15.
 *
 * `days` must be at least 1. A time earlier today would be in the future whenever the seed is run
 * before that hour, and a session that last spoke in the future is not a thing. Records that
 * genuinely belong to today — the running sessions, and the safety item filed this morning — carry
 * no offset at all and keep the stamp they were written with, which under a reset is midnight.
 */
function agoAt(days: number, hour: number, minute: number): string {
  if (days < 1) throw new Error(`agoAt: ${days} days ago is today, which may not have happened yet.`)
  const d = dayOffset(-days)
  d.setHours(hour, minute, 0, 0)
  return stampOf(d)
}

/** A moment on a later day, e.g. `aheadAt(1, 17, 0)` for tomorrow at 17:00. */
function aheadAt(days: number, hour: number, minute: number): string {
  if (days < 1) throw new Error(`aheadAt: ${days} days ahead is today, which may already be over.`)
  const d = dayOffset(days)
  d.setHours(hour, minute, 0, 0)
  return stampOf(d)
}

/** An `At` as a stored stamp. */
const at = (when: At): string => agoAt(when[0], when[1], when[2])

/**
 * A bare date, "YYYY-MM-DD", offset from today.
 *
 * A due date written without a time is due at the END of that day — that is what parseDueStamp
 * does with it, so that something due today does not turn overdue at one minute past midnight.
 * Both forms are seeded on purpose so both branches are exercised.
 */
function dateOffset(days: number): string {
  return stampOf(dayOffset(days)).slice(0, 10)
}

// ============================================================================================
// THE CURATED SUMMARY BLOCK MODEL
// ============================================================================================
//
// A module's curated summary is an ordered list of blocks. This is the layer the README calls
// "the findings worth knowing": it sits between the checklist (structure) and the full report
// (which stays in the project directory and is never copied in).
//
// WHERE IT LIVES: `src/shared/types.ts`, and nowhere else. The shapes are imported here so the
// literals further down are checked against the same interfaces the server checks an HTTP write
// against, and so a field added to a block in shared/ is a field this script can write the moment
// it is declared.
//
// They are re-exported because the tests import them from here, and because the two curated
// summaries re-exported below are `SummaryBlock[]` values: a caller needs the type to read them,
// and one import is friendlier than two.
export type {
  ChartAnnotation,
  ChartAxis,
  ChartBlock,
  ChartPoint,
  ChartSeries,
  ChartSpec,
  ImageBlock,
  MathBlock,
  SummaryBlock,
  SummaryBlockType,
  TableBlock,
  TableColumn,
  TableRow,
  TextBlock,
}
export { SUMMARY_BLOCK_TYPES }

/**
 * Thrown when a block set could not be stored. Carries a 400 so an HTTP layer can hand the
 * message straight to the caller: every message below names the block that is wrong.
 */
export class SummaryBlockError extends Error {
  readonly status = 400
  constructor(message: string) {
    super(message)
    this.name = 'SummaryBlockError'
  }
}

// -------------------------------------------------------------------------- small checkers

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** What something is, for an error message. "undefined" alone never tells you enough. */
const describe = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'an array' : `a ${typeof v}`

function str(v: unknown, where: string, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new SummaryBlockError(
      `${where}: \`${field}\` must be a non-empty string, got ${describe(v)}.`,
    )
  }
  return v
}

/** A field that may be absent — but if it is there it has to be real. Empty is not absent. */
function optStr(v: unknown, where: string, field: string): string | undefined {
  return v === undefined ? undefined : str(v, where, field)
}

function num(v: unknown, where: string, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new SummaryBlockError(
      `${where}: \`${field}\` must be a finite number, got ${describe(v)}. NaN plots as a gap ` +
        `that looks like missing data.`,
    )
  }
  return v
}

function optNum(v: unknown, where: string, field: string): number | undefined {
  return v === undefined ? undefined : num(v, where, field)
}

function optState(v: unknown, where: string, field: string): ItemState | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'string' || !ITEM_STATES.includes(v as ItemState)) {
    throw new SummaryBlockError(
      `${where}: \`${field}\` is ${JSON.stringify(v)}, which is not one of ${ITEM_STATES.join(', ')}.`,
    )
  }
  return v as ItemState
}

// -------------------------------------------------------------------------- the validator

function chartSeries(raw: unknown, where: string): ChartSeries {
  if (!isObj(raw)) throw new SummaryBlockError(`${where} is not an object; it is ${describe(raw)}.`)
  const id = str(raw['id'], where, 'id')
  const name = str(raw['name'], where, 'name')
  const rawPoints = raw['points']
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
    throw new SummaryBlockError(
      `${where}: series "${id}" has no points. A named series with nothing in it puts a legend ` +
        `entry on the chart for a line that is not there.`,
    )
  }
  const points = rawPoints.map((p, k) => {
    const pw = `${where} point ${k}`
    if (!isObj(p)) throw new SummaryBlockError(`${pw} is not an object; it is ${describe(p)}.`)
    return { x: num(p['x'], pw, 'x'), y: num(p['y'], pw, 'y') }
  })
  const state = optState(raw['state'], where, 'state')
  const dashed = raw['dashed']
  if (dashed !== undefined && typeof dashed !== 'boolean') {
    throw new SummaryBlockError(`${where}: \`dashed\` must be true or false, got ${describe(dashed)}.`)
  }
  return {
    id,
    name,
    points,
    ...(state !== undefined ? { state } : {}),
    ...(dashed !== undefined ? { dashed } : {}),
  }
}

function chartAxis(raw: unknown, where: string, field: string): ChartAxis {
  if (!isObj(raw)) {
    throw new SummaryBlockError(
      `${where}: \`${field}\` must be an object with a label, got ${describe(raw)}. An unlabelled ` +
        `axis is a number with no unit, which is how a plot lies.`,
    )
  }
  const label = str(raw['label'], `${where} ${field} axis`, 'label')
  const unit = optStr(raw['unit'], `${where} ${field} axis`, 'unit')
  const min = optNum(raw['min'], `${where} ${field} axis`, 'min')
  const max = optNum(raw['max'], `${where} ${field} axis`, 'max')
  return {
    label,
    ...(unit !== undefined ? { unit } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  }
}

function chartSpec(raw: unknown, where: string): ChartSpec {
  if (!isObj(raw)) {
    throw new SummaryBlockError(`${where}: \`spec\` must be an object, got ${describe(raw)}.`)
  }
  const kind = raw['kind']
  if (kind !== 'line' && kind !== 'bar') {
    throw new SummaryBlockError(
      `${where}: chart kind is ${JSON.stringify(kind)}, which is not one of line, bar.`,
    )
  }
  const rawSeries = raw['series']
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) {
    throw new SummaryBlockError(
      `${where}: a chart needs at least one series. Empty axes read as "we measured this and ` +
        `found nothing", when what happened is that nobody supplied the numbers.`,
    )
  }
  const series = rawSeries.map((s, j) => chartSeries(s, `${where} series ${j}`))

  const rawAnnotations = raw['annotations']
  let annotations: ChartAnnotation[] | undefined
  if (rawAnnotations !== undefined) {
    if (!Array.isArray(rawAnnotations)) {
      throw new SummaryBlockError(
        `${where}: \`annotations\` must be an array, got ${describe(rawAnnotations)}.`,
      )
    }
    annotations = rawAnnotations.map((a, j) => {
      const aw = `${where} annotation ${j}`
      if (!isObj(a)) throw new SummaryBlockError(`${aw} is not an object; it is ${describe(a)}.`)
      const axis = a['axis']
      if (axis !== 'x' && axis !== 'y') {
        throw new SummaryBlockError(`${aw}: \`axis\` must be "x" or "y", got ${JSON.stringify(axis)}.`)
      }
      return {
        id: str(a['id'], aw, 'id'),
        axis,
        value: num(a['value'], aw, 'value'),
        // A reference line with no label is a mystery line. Required, not optional.
        label: str(a['label'], aw, 'label'),
      }
    })
  }

  return {
    kind,
    x: chartAxis(raw['x'], where, 'x'),
    y: chartAxis(raw['y'], where, 'y'),
    series,
    ...(annotations !== undefined ? { annotations } : {}),
  }
}

function tableBlock(raw: Record<string, unknown>, id: string, where: string): TableBlock {
  const rawColumns = raw['columns']
  if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
    throw new SummaryBlockError(`${where}: a table needs at least one column.`)
  }
  const columns = rawColumns.map((c, j): TableColumn => {
    const cw = `${where} column ${j}`
    if (!isObj(c)) throw new SummaryBlockError(`${cw} is not an object; it is ${describe(c)}.`)
    const align = c['align']
    if (align !== undefined && align !== 'left' && align !== 'right') {
      throw new SummaryBlockError(`${cw}: \`align\` must be "left" or "right", got ${JSON.stringify(align)}.`)
    }
    return { label: str(c['label'], cw, 'label'), ...(align !== undefined ? { align } : {}) }
  })

  const rawRows = raw['rows']
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new SummaryBlockError(`${where}: a table needs at least one row.`)
  }
  const rows = rawRows.map((r, j) => {
    const rw = `${where} row ${j}`
    if (!isObj(r)) throw new SummaryBlockError(`${rw} is not an object; it is ${describe(r)}.`)
    const cells = r['cells']
    if (!Array.isArray(cells)) {
      throw new SummaryBlockError(`${rw}: \`cells\` must be an array, got ${describe(cells)}.`)
    }
    // A short row would render as a silently empty cell, and a long one would drop a value off
    // the end of the table. Both are the failure this project exists to stop.
    if (cells.length !== columns.length) {
      throw new SummaryBlockError(
        `${rw} has ${cells.length} cells but the table has ${columns.length} columns.`,
      )
    }
    cells.forEach((cell, k) => {
      if (typeof cell === 'string') return
      if (typeof cell === 'number' && Number.isFinite(cell)) return
      throw new SummaryBlockError(`${rw} cell ${k} must be a string or a finite number, got ${describe(cell)}.`)
    })
    const state = optState(r['state'], rw, 'state')
    return { cells: cells as (string | number)[], ...(state !== undefined ? { state } : {}) }
  })

  const caption = optStr(raw['caption'], where, 'caption')
  return { id, type: 'table', columns, rows, ...(caption !== undefined ? { caption } : {}) }
}

/**
 * Check a curated summary and hand back the typed blocks.
 *
 * Throws on the first thing that is wrong, naming the index of the offending block. Write-time
 * validation is strict on purpose: the page-time reader reports what it cannot parse instead of
 * throwing, but nothing malformed should ever get as far as being stored.
 */
export function validateSummaryBlocks(input: unknown): SummaryBlock[] {
  if (!Array.isArray(input)) {
    throw new SummaryBlockError(
      `A curated summary must be an array of blocks, got ${describe(input)}.`,
    )
  }

  const seen = new Set<string>()
  return input.map((raw, i): SummaryBlock => {
    const where0 = `summary block at index ${i}`
    if (!isObj(raw)) throw new SummaryBlockError(`${where0} is not an object; it is ${describe(raw)}.`)

    const id = str(raw['id'], where0, 'id')
    // Ids have to be unique: they are what a reorder, an edit and a scroll-to anchor address.
    if (seen.has(id)) {
      throw new SummaryBlockError(`${where0} reuses the id "${id}", which an earlier block already has.`)
    }
    seen.add(id)

    const where = `${where0} ("${id}")`
    const caption = optStr(raw['caption'], where, 'caption')
    const withCaption = caption !== undefined ? { caption } : {}

    switch (raw['type']) {
      case 'text': {
        const heading = optStr(raw['heading'], where, 'heading')
        return {
          id,
          type: 'text',
          text: str(raw['text'], where, 'text'),
          ...(heading !== undefined ? { heading } : {}),
        }
      }
      case 'chart':
        return { id, type: 'chart', spec: chartSpec(raw['spec'], where), ...withCaption }
      case 'math':
        // `tex` is checked for being there, never for being renderable. See MathBlock.
        return { id, type: 'math', tex: str(raw['tex'], where, 'tex'), ...withCaption }
      case 'table':
        return tableBlock(raw, id, where)
      case 'image': {
        const path = str(raw['path'], where, 'path')
        if (!path.startsWith('/')) {
          throw new SummaryBlockError(
            `${where}: \`path\` must be absolute, got "${path}". A relative path means something ` +
              `different depending on where the server was started from.`,
          )
        }
        const machine = optStr(raw['machine'], where, 'machine')
        return {
          id,
          type: 'image',
          path,
          alt: str(raw['alt'], where, 'alt'),
          ...withCaption,
          ...(machine !== undefined ? { machine } : {}),
        }
      }
      default:
        // WHAT THIS SENTENCE MAY CLAIM. This checker is the SEED'S, not the product's: it reads the
        // literals in this file and knows the five kinds of block the seed writes. It used to say
        // "which Mole Office cannot render" and name the product's list, and that stopped being true the
        // day Mole Office grew a block type the seed has no literal for. The product's own list is still
        // named, because a person reading this needs to know what a real write would accept, and
        // src/server/lib/summary.ts is what checks one.
        throw new SummaryBlockError(
          `${where0} has type ${JSON.stringify(raw['type'])}, and this seed has no way to write one. ` +
            `Mole Office itself accepts ${SUMMARY_BLOCK_TYPES.join(', ')}; src/server/lib/summary.ts is what ` +
            `checks a real write.`,
        )
    }
  })
}

// ============================================================================================
// THE SPECS, AND HOW ONE IS WRITTEN
// ============================================================================================

/** One record this file owns. */
interface Seeded {
  /**
   * A short key, unique in this file, used by the link section to name records.
   *
   * Links are written by KEY rather than by title so that a typo is a compile-time-ish failure —
   * `rec()` throws and names the key — instead of a `linkByTitle` that quietly matches nothing.
   */
  key: string
  kind: RecordKind
  title: string
  /** The one line shown wherever the record is referenced. Null where a record genuinely has none. */
  summary: string | null
  data: Record<string, unknown>
  actor: Actor
  /**
   * When it was filed, as days before today. Absent means it was filed by THIS RUN, which is the
   * honest stamp for the six sessions that are still printing and for the safety item filed this
   * morning — see the safety problem below, which is the whole point of the exercise.
   */
  filed?: At
  /**
   * Set on the records the seed retracts on purpose, and nowhere else.
   *
   * `upsert` restores anything else it finds soft-deleted, so this flag is the only thing that
   * stops the demo's deliberately broken links from being quietly healed on the next run. Stating
   * which record is meant to be gone beats inferring it from the fact that it is gone — that
   * inference is precisely the bug described at the top of this file.
   */
  retracted?: true
}

const counts = {
  created: 0,
  updated: 0,
  unchanged: 0,
  restored: 0,
  blocks: 0,
  history: 0,
  gates: 0,
  /** Rows this run wrote `fixture` onto. See THE PROVENANCE MARK below. */
  stamped: 0,
}

// ============================================================================================
// THE PROVENANCE MARK — EVERYTHING THIS FILE WRITES IS FIXTURE, AND IT SAYS SO AT WRITE TIME
// ============================================================================================
//
// Decision 17 is settled: a record carries a stored mark saying whether it entered the corpus
// through the generated fixture path or was filed as real work. `RECORD_ORIGINS` in
// shared/types.ts is the vocabulary and `records.origin` is the column.
//
// THE CLAIM IS NARROW AND IT IS ABOUT THE PATH IN, NOT ABOUT THE CONTENT. `fixture` does not mean
// invented or worthless: a corpus file can hold somebody's real notes, written more carefully than
// the records beside them. It means the row got here through this script, which
// is a fact this script knows with certainty at the moment it writes, and which nothing anywhere
// may reconstruct afterwards from a title, a date or a kind.
//
// THAT CERTAINTY IS THE WHOLE REASON THE STAMP IS WRITTEN HERE. The column arrived after 385 rows
// had already been written, so their origin had to be RECOVERED by measurement — 290 fixture, 95
// authored, two independent lines of evidence that had to agree on every row. That is expensive and
// it is not repeatable. A row written from today on is stamped by whoever writes it, and there is
// nothing to recover.
//
// ---------------------------------------------------------------------------------------
// AND THE OTHER HALF: WHERE THIS CORPUS IS ALLOWED TO GO
// ---------------------------------------------------------------------------------------
//
// The measurement that produced decision 17 found 290 fixture records sitting unmarked beside 95
// real ones in the working database, and two separate agents reading both as equally true. Marking
// the rows answers that for a reader looking at ONE record. It does not answer it for the act that
// put them there, and this script is that act.
//
// So: THE SEED WILL NOT POUR FIXTURE INTO A DATABASE THAT HOLDS ANYTHING ELSE unless somebody says,
// in so many words, that it may. `--include-fixture` is the whole of the statement.
//
// THE TEST IS READ, NOT GUESSED. It is not "is this the default database file" and not "does this look like a
// test database" — both of those are guesses, and a guess about which database matters is exactly
// the kind of confident wrong answer this project has already lost an afternoon to. It is a count:
// how many rows are already stored that this corpus cannot account for as fixture. An empty database
// has none, so `npm run db:reset`, `node tools/review.mjs` and every test that seeds a throwaway
// database are untouched. A database that has already been seeded and nothing else has none either,
// so re-running the seed stays a no-op. The working database has 95 authored rows, so it refuses and
// names them.
//
// UNSTAMPED ROWS COUNT AS "SOMETHING ELSE" TOO, and that is deliberate rather than strict. A row
// with no origin is one Mole Office cannot say anything about — a colleague's database, or rows written
// before the column existed — and pouring 290 fixture records in beside rows nobody can classify is
// the same harm as pouring them in beside real ones, with the added problem that afterwards nobody
// can tell which was which.

/** The word a caller says to allow this corpus beside records that are not fixture. */
export const INCLUDE_FIXTURE_FLAG = '--include-fixture'

/** Has the caller stated it? Reads argv rather than the environment; see .env.example's own rule. */
export function fixtureIncludeStated(argv: readonly string[] = process.argv): boolean {
  return argv.includes(INCLUDE_FIXTURE_FLAG)
}

/** What is already stored that this corpus cannot account for, split by what each row says. */
export interface NotFixtureHere {
  /** Rows stamped `authored`: somebody filed them as a record of real work. */
  authored: number
  /** Rows with no origin at all. Nobody has said, which is not the same as `authored`. */
  unstamped: number
  /** Rows storing a word outside RECORD_ORIGINS. Something wrote it on purpose. */
  unreadable: number
  total: number
}

/** Is the provenance column there at all? Asked of the database, never assumed from the folder. */
function hasOriginColumn(): boolean {
  const row = sqlite
    .prepare("select count(*) as n from pragma_table_info('records') where name = 'origin'")
    .get() as { n: number }
  return row.n > 0
}

/** Every stored record this corpus cannot account for as fixture, counted before anything is written. */
export function notFixtureHere(): NotFixtureHere {
  // Soft-deleted rows included. A deleted record is still a row, it can be restored, and its
  // provenance does not change when somebody removes it from a listing.
  const rows = sqlite.prepare('select origin from records').all() as { origin: string | null }[]
  const out: NotFixtureHere = { authored: 0, unstamped: 0, unreadable: 0, total: 0 }
  for (const row of rows) {
    const origin = readOrigin(row.origin)
    if (origin === 'fixture') continue
    if (origin === 'authored') out.authored++
    else if (row.origin === null) out.unstamped++
    else out.unreadable++
    out.total++
  }
  return out
}

/**
 * Refuse to write this corpus into a database holding anything that is not fixture, unless told.
 *
 * Called before the first record is written, so a refusal leaves the database exactly as it was.
 */
function assertFixtureMayBeWrittenHere(): void {
  if (!hasOriginColumn()) {
    throw new Error(
      'The `records` table has no `origin` column, so nothing this seed writes could say that it is fixture. Run ' +
        '`npm run db:migrate` — migration 0005 adds it. Seeding without it would put 290 unmarked fixture records ' +
        'into a database, which is the state decision 17 was settled to end, and the marks would then have to be ' +
        'recovered by measurement the way the first 385 had to be recovered.',
    )
  }
  const already = notFixtureHere()
  if (already.total === 0 || fixtureIncludeStated()) return
  throw new Error(
    `This database already holds ${already.total} record(s) that are not fixture — ${already.authored} filed as ` +
      `authored work, ${already.unstamped} with no origin recorded, ${already.unreadable} storing a word Mole Office ` +
      `cannot read — and the seed writes generated fixture content. Mixing the two is what decision 17 was settled ` +
      `to stop: a reader could not tell this project's own record from demo content written to give a layout ` +
      `something to draw, and two separate agents read both as equally true.\n\n` +
      `Nothing has been written. If you meant it — a review run, or a test that needs the dense corpus beside real ` +
      `records — say so:\n\n` +
      `  npx tsx scripts/seed.ts ${INCLUDE_FIXTURE_FLAG}\n` +
      `  npm run db:seed -- ${INCLUDE_FIXTURE_FLAG}\n\n` +
      `Every record it then writes is stamped \`fixture\`, so the two stay tellable apart afterwards. An empty ` +
      `database, and one holding nothing but this corpus, need no flag at all — which is why db:reset, the review ` +
      `tool and the test suite are unaffected.`,
  )
}

/** Prepared once and reused: a seed run stamps a few hundred rows. */
let stampStatement: ReturnType<typeof sqlite.prepare> | null = null

/**
 * Say that a row this run found ALREADY CURRENT came through the fixture path.
 *
 * IT NO LONGER STAMPS THE ROWS THIS RUN CREATES. `createRecord` and `addBlock` now take an origin,
 * so a record this script writes says `fixture` in the same statement that files it, which is what
 * the previous version of this comment said should happen when they learnt to. What is left is the
 * case they cannot cover: a record this run did not write because an identical one was already
 * there. The set of titles one seed run writes IS the set of records the fixture path owns — it is
 * the identity key this script matches on, and it was line 1 of the two-line measurement that
 * recovered the first 385 origins — so a row holding exactly what this file writes is a row that
 * came through here, whichever run put it there.
 *
 * It is raw SQL because there is nothing to create: it writes one envelope column on a row that
 * already exists, and it cannot create a row, change a kind, or change anything a reader reads as
 * content. That is why it is not a second way to write a RECORD in the sense
 * tests/guard-human-only.test.ts is about.
 *
 * IT REFUSES TO RELABEL. A record already stamped `authored` is one somebody filed as real work, and
 * the seed is not entitled to say otherwise no matter what its title is. That is reachable exactly
 * when `--include-fixture` was given, which is the case where a seeded title may land on a real
 * record — so the refusal is the loud half of the opt-in rather than a hypothetical.
 */
function stampFixture(record: PanelRecord): void {
  const row = sqlite.prepare('select origin from records where id = ?').get(record.id) as
    | { origin: string | null }
    | undefined
  if (row === undefined) throw new Error(`The record "${record.title}" was written and cannot be read back.`)
  if (row.origin === 'fixture') return
  if (row.origin !== null) {
    throw new Error(
      `"${record.title}" is already stored with origin "${row.origin}", and the seed writes fixture. A record ` +
        `somebody filed as real work is not something this script may relabel, and a seeded title landing on one ` +
        `means the two corpora have collided. Rename one of them, or drop ${INCLUDE_FIXTURE_FLAG} and seed a ` +
        `database of its own.`,
    )
  }
  stampStatement ??= sqlite.prepare("update records set origin = 'fixture' where id = ? and origin is null")
  stampStatement.run(record.id)
  counts.stamped++
}

/** Every record this run wrote, by its short key. `rec()` is how the link section reads it back. */
const byKey = new Map<string, PanelRecord>()

/** The ids of every record this run upserted, so the history pass re-dates only what it owns. */
const seeded = new Set<string>()

/** What was filed when, collected as the records are written. See THE FABRICATED HISTORY. */
const filedAt: { id: string; title: string; when: At }[] = []

/** A record by its id, for the block ids the server minted. Throws rather than returning null. */
function recordById(id: string): PanelRecord {
  const record = listRecords({ workspaceId: 'default', includeDeleted: true }).find((r) => r.id === id)
  if (record === undefined) throw new Error(`No record with the id "${id}".`)
  return record
}

function rec(key: string): PanelRecord {
  const record = byKey.get(key)
  if (record === undefined) {
    throw new Error(
      `No seeded record with the key "${key}". Keys are declared on the specs above; the ones ` +
        `this run wrote are: ${[...byKey.keys()].join(', ')}.`,
    )
  }
  return record
}

/**
 * Write the record, then say how it got here. Both halves, on every path, in one place.
 *
 * The stamp is applied to a record this run found ALREADY CURRENT as well as to one it created,
 * and that is the honest reading rather than a convenience: the set of titles one seed run writes
 * IS the set of records the fixture path owns — it is the identity key this script matches on, and
 * it was line 1 of the two-line measurement that recovered the first 385 origins. A row this file
 * would have written, holding exactly what this file writes, is a row that came through here.
 */
function upsert(spec: Seeded): PanelRecord {
  const record = upsertContent(spec)
  // Only the already-current case still needs this — a record this run CREATED said `fixture` in
  // the statement that filed it. Calling it on both is deliberate: `stampFixture` is a no-op on a
  // row that already reads `fixture`, and routing the two paths differently here would mean this
  // function trusting `upsertContent` to report which of the three things it did.
  stampFixture(record)
  return record
}

/** Create the record, or bring an existing one up to date, or leave it exactly as it is. */
function upsertContent(spec: Seeded): PanelRecord {
  // STOPPING HERE IS CORRECT BEHAVIOUR, NOT A BUG. Read this before "fixing" it.
  //
  // `getRecordByTitle` answers one record or none, and refuses when the title names more than one.
  // It used to be safe by luck: `records_title_idx` was UNIQUE(workspace_id, title), so a title
  // could not name two rows. Since `0030_titles_may_repeat` it can, and that function counts its
  // matches rather than handing back SQLite's first row.
  //
  // A spec above is keyed by its title and carries no id, so this script genuinely does not know
  // which of two records of one name it meant. The alternatives are both worse than stopping:
  // taking the first row would overwrite somebody's record with fixture content and report success,
  // and creating a third of the same name would grow the corpus by one every run and break the
  // no-op the section RUNNING IT TWICE promises.
  //
  // The refusal is rewritten before it is re-thrown. `getRecordByTitle` ends its sentence with "ask
  // for the one you mean by its id", which is advice for an API caller and not something a person
  // running `npm run db:seed` can act on — there is no id to give it. The original sentence is kept
  // whole, because it names both records, and what a person here should do is added after it.
  let existing: PanelRecord | null
  try {
    // A SEEDED MESSAGE IS KEPT IN THE MESSAGE CENTRE, like every message, so it is looked up there.
    existing = getRecordByTitle(spec.title, spec.kind === 'message' ? MESSAGE_CENTRE : 'default')
  } catch (err) {
    throw new Error(
      `The seed stopped and wrote nothing further. ${err instanceof Error ? err.message : String(err)}\n\n` +
        `The seed matches a record by its title, and its specs carry no ids, so it cannot tell which of those ` +
        `records "${spec.title}" means. Rename or delete all but one of them, then run the seed again — it is a ` +
        `no-op on everything it already wrote, so a second run picks up where this one stopped.`,
    )
  }
  if (!existing) {
    counts.created++
    // SAID AT THE MOMENT OF WRITING, not stamped afterwards. This script knows it is the fixture
    // path with certainty; that certainty is the only evidence the word is allowed to rest on.
    const created = createRecord({ workspaceId: 'default', ...spec, origin: 'fixture' })
    seeded.add(created.id)
    return created
  }
  seeded.add(existing.id)

  // A title says nothing about what KIND of thing a record is, and this lookup reads deleted rows
  // as well as live ones. Updating a note that happens to be called "Reel to searchable page" as
  // though it were the pipeline would leave a record whose contents and kind disagree.
  if (existing.kind !== spec.kind) {
    throw new Error(
      `"${spec.title}" already exists as a ${existing.kind}, but the seed writes it as a ` +
        `${spec.kind}. Rename or delete that record — the seed will not change what a record is.`,
    )
  }

  // Bring it back if something deleted it. Without this the record is found, compared, called
  // "already current" and left invisible to every page in the app. That is the nine-record bug at
  // the top of this file. The records that are MEANT to be gone say so with `retracted`.
  let current = existing
  const wasDeleted = current.deletedAt !== null && spec.retracted !== true
  if (wasDeleted) {
    current = restoreRecord(current.id, spec.actor)
    counts.restored++
  }

  // A PIPELINE'S ORDER IS NOT WRITTEN BY ITS SPEC, so it is not compared against one and not
  // overwritten by one. `pipelineData()` returns an EMPTY `blockIds` because a block is a record
  // and cannot be listed before it exists; `fileBlocks` writes the real order a moment later. Left
  // to itself, this comparison would see nine ids where the spec has none, call every pipeline
  // changed on every run, and blank the order in between.
  let wanted =
    spec.kind === 'pipeline' && Array.isArray(current.data['blockIds'])
      ? { ...spec.data, blockIds: current.data['blockIds'] }
      : spec.data

  // AND A DECISION'S `recorded_by` IS NOT WRITTEN BY ITS SPEC EITHER, for the same reason and with
  // the same consequence. Mole Office fills that field in from the actor on the request — a caller may
  // not send it at all — so the stored record carries a key the spec cannot have. Left to itself,
  // this comparison would call all five seeded decisions changed on every run, and the second run
  // would report "5 updated" where the truth is that nothing moved.
  if (spec.kind === 'decision' && typeof current.data['recorded_by'] === 'string') {
    wanted = { ...wanted, recorded_by: current.data['recorded_by'] }
  }

  // AND SO IS WHAT AN AGENT'S OWN FILING SAID ABOUT WHO SETTLES IT AND WHOSE MOVE IT IS, added
  // 3 September 2026 and the third case of exactly the same thing. A fork an AGENT files says
  // `who_settles_it: "an agent"` and a problem it files says `whose_move: "agent"` unless the spec
  // names something else — the rule that an engineering question is the agent's, in
  // `design/messages/ACCEPTANCE.md` W3. The value is written at filing, from the actor on the
  // request, so a spec that leaves the key out cannot have it. Left to itself this comparison would
  // call every agent-filed fork and problem changed on every run.
  for (const key of ['who_settles_it', 'whose_move']) {
    if (!Object.hasOwn(wanted, key) && typeof current.data[key] === 'string') {
      wanted = { ...wanted, [key]: current.data[key] }
    }
  }

  // AND SO IS WHO SENT A MESSAGE, which is the fourth case of the same thing and arrived with
  // criterion M59 on 6 September 2026. The door fills `sentBy` in from the registry row the
  // writer's actor id answers to, and that row's id is minted when the agent record is filed — so
  // a spec written by hand cannot hold it, and every message the demo writes would be reported
  // changed on every run.
  if (spec.kind === 'message' && !Object.hasOwn(wanted, 'sentBy') && current.data['sentBy'] !== undefined) {
    wanted = { ...wanted, sentBy: current.data['sentBy'] }
  }
  // AND WHERE A MESSAGE WAS WRITTEN, the fifth case: the office writes `writtenIn` on every message at writing, and a
  // spec cannot hold it.
  if (spec.kind === 'message' && !Object.hasOwn(wanted, 'writtenIn') && current.data['writtenIn'] !== undefined) {
    wanted = { ...wanted, writtenIn: current.data['writtenIn'] }
  }
  // AND THE MOMENT THE OFFICE STAMPED IT AT, the sixth case: the record door writes a message's `writtenTime` and a
  // run's `filedTime` at filing, in place of any value sent, and a spec cannot hold either. Left to itself, the second
  // run would call every seeded message and run changed: the message rule refuses a change that drops the field, and
  // a run's change would empty it.
  const itsMoment = spec.kind === 'message' ? 'writtenTime' : spec.kind === 'session' ? 'filedTime' : null
  if (itsMoment !== null && !Object.hasOwn(wanted, itsMoment) && current.data[itsMoment] !== undefined) {
    wanted = { ...wanted, [itsMoment]: current.data[itsMoment] }
  }

  // "Unchanged" is a statement about the content only. Deleted-ness has already been dealt with
  // above, so a restored record whose text happens to match is reported as restored, not as
  // "already current" — otherwise the one run that repaired the database would be the one run
  // that claimed to have done nothing.
  // IN ANY ORDER OF KEYS: a field the office writes at filing, such as a message's `writtenIn`, sits where the door put it,
  // and the same content in another order is the same content.
  const same = current.summary === spec.summary && inAnyOrder(current.data) === inAnyOrder(wanted)
  if (same) {
    if (!wasDeleted) counts.unchanged++
    return current
  }
  counts.updated++
  // `replace: true` because that is what a seed run is: the spec is the whole of what the record
  // is supposed to say, so a field the spec has dropped is a field this run means to empty. Every
  // other write in this file goes through the same guard without it, and `wanted` above already
  // carries across the two keys the server writes and no spec can.
  return updateRecord(current.id, { summary: spec.summary, data: wanted, replace: true }, spec.actor)
}

/** A value as JSON with every object's keys in one order, so two values that differ only in key order compare equal. */
function inAnyOrder(value: unknown): string {
  const sorted = (one: unknown): unknown =>
    Array.isArray(one)
      ? one.map(sorted)
      : one !== null && typeof one === 'object'
        ? Object.fromEntries(Object.keys(one as Record<string, unknown>).sort().map((key) => [key, sorted((one as Record<string, unknown>)[key])]))
        : one
  return JSON.stringify(sorted(value))
}

/** Write one spec, remember it by key, and note when it is supposed to have been filed. */
/**
 * Turn a reference by corpus KEY into a reference by record id, in a record about to be filed.
 *
 * A corpus cannot hold a record id: ids are minted when the seed runs, so a file written with one
 * would name a record from somebody else's run. It holds the key instead, and this resolves it
 * against the records already filed — which also makes a forward reference a refusal that names the
 * key, rather than a dangling id nothing can explain.
 *
 * The only one in the corpus today is a pause that waits on another record. `readPause` in
 * shared/work.ts is the reader and it knows nothing about keys: what reaches the database is always
 * `recordId`.
 */
function withKeysResolved(data: Record<string, unknown>): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (typeof value !== 'object' || value === null) return value
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'recordKey') {
        if (typeof v !== 'string') throw new Error(`\`recordKey\` is ${JSON.stringify(v)}, which is not a key.`)
        out.recordId = rec(v).id
      } else {
        out[k] = walk(v)
      }
    }
    return out
  }
  return walk(data) as Record<string, unknown>
}

function file(spec: Seeded): PanelRecord {
  if (byKey.has(spec.key)) throw new Error(`Two seeded records share the key "${spec.key}".`)
  const record = upsert({ ...spec, data: withSummaryChecked(withKeysResolved(spec.data)) })
  byKey.set(spec.key, record)
  if (spec.filed !== undefined) filedAt.push({ id: record.id, title: record.title, when: spec.filed })
  return record
}

/** Write a whole family of specs, in the order they are declared. */
function fileAll(specs: readonly Seeded[]): void {
  for (const spec of specs) file(spec)
}

const link = (from: PanelRecord, type: LinkType, to: PanelRecord, actor: Actor = HUMAN) =>
  createLink({ fromId: from.id, toId: to.id, type, actor })

/**
 * A `blocks` link that says HOW MUCH it blocks.
 *
 * IT GOES THROUGH `createLink`, WHICH IS THE GATE A POST GOES THROUGH. An earlier draft of this
 * function wrote the `gate` and `gate_up_to` columns with its own `db.update` after the link
 * existed, because at the time `createLink` took no gate argument. It takes one now. Two things
 * were wrong with the version that stayed:
 *
 *   1. It went round `checkGate`, so the seed never exercised the only check that stands between a
 *      caller and a half-written gate — and could itself have stored one that HTTP would refuse.
 *      This file's whole claim is that everything in it goes through the same gate a POST goes
 *      through; one function quietly not doing that is the claim being false where nothing looks.
 *   2. It asked `gateIsWellFormed` itself and threw its own sentence, which was a second statement
 *      of a rule `checkGate` already makes — and a worse one, because `checkGate`'s refusal says
 *      what to send instead. Two statements of one rule with nothing making them agree is the
 *      defect this codebase keeps producing.
 *
 * A `blocks` link with no gate is written by `link()` above and leaves NULL in both columns, and
 * that is a third answer rather than a missing one: the author said A blocks B and said nothing
 * about how much. Several links below are deliberately left that way.
 */
function gatedLink(from: PanelRecord, to: PanelRecord, gate: Gate, actor: Actor = HUMAN): void {
  createLink({ fromId: from.id, toId: to.id, type: 'blocks', actor, gate })
  counts.gates++
}

const countLinks = () => db.select({ id: linksTable.id }).from(linksTable).all().length

/**
 * Type-check a module's `data` against ModuleData, then hand it back in the shape the record
 * accepts.
 *
 * The spread is not decoration: `data` is declared as an open bag of unknown fields, and
 * TypeScript will not pass a named interface into one directly. Spreading into a fresh object
 * satisfies it while still checking the literal against ModuleData on the way in.
 */
const moduleData = (d: ModuleData): Record<string, unknown> => ({ ...d })

/**
 * The same, for the five modules that are deliberately unfinished.
 *
 * `ModuleData` declares `context` and `parts` as required, because that is what a FINISHED module
 * carries. The write gate is the authority on what may be stored and it takes a different view on
 * purpose — strict about wrong, flexible about unfinished — so a module with no context is stored
 * and then reported as incomplete on every read. This helper is how that case is written down
 * without turning the interface's required fields into optional ones for everybody else.
 *
 * It is only for the records named in INCOMPLETE_ON_PURPOSE, and check() fails if any other record
 * comes out incomplete.
 */
const partialModuleData = (d: Partial<ModuleData>): Record<string, unknown> => ({ ...d })

/**
 * The same, plus a curated summary.
 *
 * The blocks go through the validator even though they are written as typed literals here. The
 * compiler cannot see, for example, that a table row is one cell short of its header — and a bad
 * block found at seed time is a stack trace in this script, while a bad block found at page time
 * is a reviewer looking at a hole in the middle of a module page.
 */
/**
 * Check a module's curated summary before it is filed, and count the blocks.
 *
 * THE CHECK IS THE POINT, not the counting. A corpus is a file somebody may edit, so the blocks in
 * it go through the same validator an HTTP write goes through before they reach the database —
 * where a bad block would be a module page that cannot draw its own summary. The count is what the
 * seed prints at the end so that a summary silently emptied is visible.
 */
function withSummaryChecked(data: Record<string, unknown>): Record<string, unknown> {
  const blocks = data.summaryBlocks
  if (blocks === undefined) return data
  const checked = validateSummaryBlocks(blocks)
  counts.blocks += checked.length
  return { ...data, summaryBlocks: checked }
}

// ============================================================================================
// PIPELINE STEPS: THE N:M MAPPING, AND THE SHAPE THE OLD MODEL COULD NOT EXPRESS
// ============================================================================================
//
// A pipeline is an ordered list of BLOCKS, and each block is carried by zero, one or several
// modules. The mapping is genuinely N:M and this seed is where that is proven rather than
// asserted: one block is carried by two modules, one module carries three blocks of one pipeline,
// and several blocks are carried by none because nobody owns them yet.
//
// A BLOCK IS A RECORD NOW, and the seed writes one the way an agent would: through
// `addBlock(pipelineId, …)`, which mints the block record and appends its id to the pipeline's
// order in one transaction. There is no `data.steps` anywhere any more.
//
// WHAT `SeedBlock` BELOW IS, AND WHAT IT IS NOT. It is this script's AUTHORING shape — the literal
// an author types, with a short readable id like `rp-07` so that `needs` below can be written by
// hand. Nothing stores it. `fileBlocks` turns each one into a block record, an `implements` link
// per module and a `blocks` link per dependency, and the short id lives only inside this file, in a
// map from it to the record id the server minted. It is a fixture, not a second model of a block.
//
// The module list is written as TITLES here because that is what an author types; `fileBlocks`
// resolves each one to a record and stores the LINK. That resolution is the whole point: a title
// copied into a record and a link naming the same thing by id were two representations of one fact,
// and one accepted module rename broke ten of them behind a 200.

/** One block as this script's author writes it. An input to `fileBlocks`; never stored. */
export interface SeedBlock {
  /** A short id, unique within this pipeline, used only to write `needs` by hand below. */
  id: string
  name: string
  state: ItemState
  /** The TITLES of the modules that carry it. Resolved to `implements` links by `fileBlocks`. */
  modules: string[]
  measured?: string
  /** What it waits on, by the short id above. Becomes a `blocks` link carrying the gate. */
  needs?: { stepId: string; gate: GateKind; upTo?: string }[]
}

/**
 * A pipeline's `data` as it is FILED: no blocks yet, because a block is a record and needs the
 * pipeline to exist before it can be appended to its order.
 *
 * `fileBlocks` fills `blockIds` in, one `addBlock` at a time. Filing the pipeline with the ids
 * already in it would mean writing ids for records that do not exist, which `checkBlockIds` on the
 * server refuses — correctly, and this seed goes through the same checks a POST goes through.
 */
function pipelineData(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { blockIds: [], ...extra }
}

/**
 * File a pipeline's blocks: the records, the `implements` links and the `blocks` links.
 *
 * Returns the map from this file's short ids to the record ids the server minted, so that a GATE
 * written further down can name a block — `upTo` is a block record id now, not a step id, and it is
 * a reference that resolves rather than free text nothing could check.
 *
 * A block that names a module which is not there is REFUSED, for the reason it always was: a
 * pointer at a module that does not exist renders as an ordinary word, which is worse than an error.
 */
function fileBlocks(pipeline: PanelRecord, blocks: readonly SeedBlock[], when: At): Map<string, string> {
  const ids = new Map<string, string>()
  for (const block of blocks) {
    // RUNNING THE SEED TWICE CHANGES NOTHING, which is the rule every other record here follows
    // through `upsert`. A block is found by the title `addBlock` would give it, because that title
    // is built from the pipeline's title and the block's name and is therefore stable.
    // A BLOCK'S TITLE IS ITS OWN NAME. Seeded blocks are shaped like
    // written ones, or the fixture would teach a reader a shape the product no longer writes.
    const title = block.name
    const existing = getRecordByTitle(title, 'default')
    if (existing !== null && existing.kind === BLOCK_KIND) {
      ids.set(block.id, existing.id)
      seeded.add(existing.id)
      // A block is a record and came through this script like every other one, so it is stamped on
      // the same terms. Sixty-one of the 290 fixture rows in the measured corpus are blocks.
      stampFixture(existing)
      // Counted like every other record this script files, because the run's own summary — "0
      // created, 0 updated, N already current" — is what a reader checks a re-run against, and a
      // sixty-one-record hole in it would make that number mean nothing.
      counts.unchanged++
      continue
    }
    const created = addBlock(
      pipeline.id,
      {
        name: block.name,
        state: block.state,
        ...(block.measured === undefined ? {} : { measured: block.measured }),
        // A block is a record and came through this script like every other one. Sixty-one of the
        // 290 fixture rows in the measured corpus are blocks.
        origin: 'fixture',
      },
      HUMAN,
    )
    ids.set(block.id, created.block.id)
    seeded.add(created.block.id)
    stampFixture(created.block)
    counts.created++
    // Dated with its pipeline, so a block is as old as the work it records rather than as old as
    // this run. `fabricateHistory` reads this list and back-dates the create row.
    filedAt.push({ id: created.block.id, title: created.block.title, when })
  }

  // THE WHOLE ORDER, WRITTEN AT THE END, and this is what makes a re-run a no-op rather than a
  // pipeline with no blocks. `upsert` rewrites a pipeline's `data` wholesale from `pipelineData()`,
  // which is `{blockIds: []}` — so on the second run the order is emptied before this function is
  // reached, and the blocks it finds by title are already filed but no longer listed. Setting the
  // order from the authored list puts it back, and says exactly what the order is either way.
  patchRecord(pipeline.id, { dataPatch: { blockIds: blocks.map((b) => ids.get(b.id) ?? '') } }, HUMAN)

  for (const block of blocks) {
    const blockId = ids.get(block.id)
    if (blockId === undefined) throw new Error(`No block was filed for "${block.id}".`)
    for (const title of block.modules) {
      const module = getRecordByTitle(title, 'default')
      if (!module) {
        throw new Error(
          `Block "${block.name}" names the module "${title}", which does not exist. ` +
            `Seed the module before the pipeline that maps onto it.`,
        )
      }
      if (module.kind !== 'module') {
        throw new Error(`Block "${block.name}" names "${title}", which is a ${module.kind}, not a module.`)
      }
      createLink({ fromId: module.id, toId: blockId, type: 'implements', inferred: true, actor: HUMAN })
    }
    for (const need of block.needs ?? []) {
      const fromId = ids.get(need.stepId)
      if (fromId === undefined) {
        throw new Error(`Block "${block.name}" waits on "${need.stepId}", which is not a block of this pipeline.`)
      }
      createLink({
        fromId,
        toId: blockId,
        type: 'blocks',
        actor: HUMAN,
        gate: need.upTo === undefined ? { kind: need.gate } : { kind: need.gate, upTo: need.upTo },
      })
      counts.gates++
    }
  }
  return ids
}

// ============================================================================================
// THE SESSIONS
// ============================================================================================
//
// Fifty-eight agent runs over three weeks, which is what this work actually leaves behind, and the
// largest family in the corpus by a long way. They are declared here at module scope rather
// than inside seed() for one reason: `agentRun` below validates every run name against this list,
// so a write attributed to a run that was never filed fails immediately with a message naming the
// runs that exist, instead of leaving a change row that joins to nothing.
//
// WHAT THE SPREAD IS FOR, state by state:
//
//   running (5)    output in the last few minutes. These carry NO `filed` offset and no
//                  `lastOutputAt`: the only honest "a moment ago" this script can write is the
//                  moment it ran, and putting Date.now() inside `data` would make every rerun a
//                  rewrite. attention.ts falls back to the record's updatedAt, which IS that
//                  moment, so a live session reads as live without a fabricated stamp. Under a
//                  reset that moment is midnight (THE DEMO CLOCK above), so these read as quiet
//                  since midnight, by however long the day has run.
//   idle (6)       alive and silent, and every one of them is waiting on an answer from the
//                  operator. `idle` is kept apart from `running` because a session that has waited
//                  four days must not look like one that is busy.
//   finished (24)  ended cleanly and said so. This is the group a reader should be able to
//                  collapse, and it is deliberately the biggest: an interface that cannot fold
//                  away twenty-four confirmed-finished runs will drown in them.
//   crashed (6)    died or stopped without finishing. Each says what killed it AND what it was in
//                  the middle of, because "crashed" alone tells you nothing about whether to
//                  restart it.
//   orphaned (3)   ended without saying so and left something running — a port, a container, a
//                  GPU allocation. This is what the resource ledger looks for.
//   paused (1)     stopped on purpose by a shutdown of Mole Office, with its conversation kept,
//                  waiting for a press to carry on (criterion W6). It never resumes by itself.
//   unknown (5)    somebody looked and could not tell. A JUDGEMENT, and an honest one.
//   no state (9)   nobody ever said anything. Found by scanning agent log directories. This is
//                  NOT the same as `unknown` and a reader that collapses the two turns a gap in
//                  the record into a judgement nobody made. These are the nine records that make
//                  the difference visible, and they are filed by the sweep rather than by a run,
//                  so they bind no name and their change rows carry no session at all.

/**
 * Which agent each run name belongs to.
 *
 * READ BACK OUT OF THE CORPUS'S OWN SESSION RECORDS rather than written a second time. A session
 * record filed by its own run carries that run's name on its actor and the agent's name in
 * `data.runtime`, so the pairing is already there; stating it again here would be one more pair
 * that can disagree with nothing making them agree.
 */
const AGENT_OF = new Map(
  CORPUS.records.flatMap((r) => {
    if (r.kind !== 'session') return []
    const run = r.actor.type === 'agent' ? (r.actor as { sessionId?: string }).sessionId : undefined
    const runtime = r.data.runtime
    if (run === undefined || typeof runtime !== 'string') return []
    return [[run, runtime] as const]
  }),
)

/**
 * One named agent run, for the writes a particular session is responsible for.
 *
 * The change log stores the session id beside every write, which is what lets a page say "this was
 * changed by the run called scan-1923b" rather than "by an agent".
 *
 * EVERY NAME PASSED HERE MUST BE A SESSION THIS FILE ALSO FILES, and this throws when it is not.
 * The name is what the log stores until a session record answers to it; filing that record binds
 * the name and repoints the rows. A run name nothing is ever filed under leaves rows that join to
 * nothing for ever — POST /api/sessions/discover can only report them as dangling, because there is
 * no record it could honestly point them at. check() below refuses to finish on the same condition;
 * this is the same rule stated where the mistake is made, so the message names the typo.
 */
function agentRun(name: string): Actor {
  const agent = AGENT_OF.get(name)
  if (agent === undefined) {
    throw new Error(
      `"${name}" is not a run this seed files a session for, so a write attributed to it would ` +
        `leave a change row that joins to nothing. The runs are: ${[...AGENT_OF.keys()].join(', ')}.`,
    )
  }
  return { type: 'agent', id: agent, sessionId: name }
}

/** The sweep that finds sessions on disk. It is an agent, and it writes under no run of its own. */
const SWEEP: Actor = { type: 'agent', id: 'log-sweeper' }

/**
 * The run that scored the 300-page OCR sample, and the default author for agent-written records
 * that no other run has a better claim to.
 */
const AGENT: Actor = agentRun('ocr-sample')

// ============================================================================================

export function seed(): SeedSummary {
  // Fail loudly rather than throwing a raw SQLite error at someone who has simply not migrated.
  const table = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = 'records'")
    .get()
  if (!table) {
    throw new Error(
      'The database has no tables yet. Run `npm run db:migrate` first, or `npm run db:reset` to do the whole thing.',
    )
  }
  const gateColumn = sqlite
    .prepare("select 1 as ok from pragma_table_info('links') where name = 'gate'")
    .get()
  if (!gateColumn) {
    throw new Error(
      'The `links` table has no `gate` column, so no gate could be recorded. Run `npm run db:migrate` — ' +
        'migration 0001 adds it. A seed that wrote the links and silently dropped their gates would ' +
        'ship a demo where every dependency looks unqualified.',
    )
  }

  // THE OFFICE'S OWNER, read from the database this seeds: the person its migrate marked, from
  // MOLE_OFFICE_OWNER_ID, or `owner` when nothing said. Never a built-in person (problem Nht4tEXhgM8B).
  // It is written into the corpus wherever the corpus says THE_OWNER_IN_A_CORPUS, before anything is
  // written, and the fixture counter below names the same owner.
  const ownerId = theOfficeOwner().id
  writeTheOwnerIntoTheCorpus(ownerId)

  // BEFORE THE FIRST RECORD IS WRITTEN, so a refusal leaves the database exactly as it was found.
  // See THE PROVENANCE MARK above for what this asks and why the answer is read rather than guessed.
  assertFixtureMayBeWrittenHere()

  counts.created = 0
  counts.updated = 0
  counts.unchanged = 0
  counts.restored = 0
  counts.blocks = 0
  counts.history = 0
  counts.gates = 0
  counts.stamped = 0
  seeded.clear()
  byKey.clear()
  filedAt.length = 0
  const linksBefore = countLinks()

  // ------------------------------------------------------------------ every record of the corpus
  //
  // ONE CALL, IN CORPUS ORDER. The records used to be written out here as TypeScript literals,
  // family by family — twelve modules, nine pipelines, thirteen problems, and so on down to the
  // twenty messages. They are in `scripts/seed-corpus/public.json` now, and the setting
  // MOLE_OFFICE_SEED_CORPUS points this at any other corpus of the same shape. scripts/seed-corpus.ts
  // says why they moved.
  //
  // THE ORDER MATTERS AND THE FILE KEEPS IT. Two things depend on it. A session record binds its run
  // name when it is written, so every row attributed to a run before that is waiting for the
  // binding — which is why the sessions, notes and messages are at the end of the corpus rather
  // than at the front. And the first module filed is the one the duplicate-title refusal is proved
  // against in tests/seed-title-repeats.test.ts.
  //
  // WHAT IS NOT IN THE FILE: the links, the gates, the retraction and the fabricated history, which
  // are all below. Those are the SHAPE of the demo rather than its words.

  fileAll(CORPUS.records)

  // ------------------------------------------------------------------ the seed's secretary
  //
  // WHY A SEEDED AGENT HOLDS THE SECRETARY CARD. The fixture incident below is refused to an actor
  // that holds neither the person's proof nor the secretary card (criterion I4,
  // `checkWhoMayFileAnIncident`), and that refusal holds wherever the role cards have been read.
  // The seed process alone never reads them, so a run of this file passed; scripts/restore-check.ts
  // reads them before its build phase runs this same seed, so tests/restore-command went red on
  // 14 September 2026 with the door's own sentence. The sweep actor `log-sweeper` is a registry row
  // with no card. So this seed registers one agent of its own holding the secretary card, the way
  // scripts/restore-check.ts plants `restore-check-secretary`, and files the incident as that agent:
  // a fixture office with a fixture secretary, stamped `fixture` like everything else here.
  //
  // THE CARD IS WRITTEN BY THE CORPUS'S FIXTURE PERSON, not by the sweep: `role` on an agent record
  // is refused to an agent actor (a card an agent could write for itself is not a permission), and
  // the seed already writes its links and its people as `HUMAN`, the fixture person of this
  // throwaway corpus. That is the corpus's own convention, not an act in anybody's real office.
  file({
    key: 'agent-seed-secretary',
    kind: 'agent',
    title: 'The seed\u2019s secretary \u2014 a fixture agent holding the secretary card, so the corpus can file its fixture incident',
    summary:
      'A registered fixture agent with the secretary card. It exists so the fixture incident below has an actor the incident door admits wherever the role cards are read.',
    actor: HUMAN,
    data: { handle: 'seed-secretary', runtime: 'claude-code', state: 'active', role: 'secretary' },
  })

  // ------------------------------------------------------------------ one fixture incident
  //
  // WHY THE SEED WRITES AN INCIDENT AT ALL, WHEN IT DELIBERATELY WROTE NONE BEFORE. Every page
  // the router declares is photographed by `node tools/review.mjs` at four widths in both themes,
  // and `#/incident/<id>` is only reachable with an incident's id. Filing one through
  // POST /api/records is refused to an agent — filing is the secretary's or the person's,
  // criterion I4, `checkWhoMayFileAnIncident` in src/server/lib/records.ts — and the review tool
  // holds neither card. Round one proved that refusal rather than smuggling the record in under
  // another name; the seed is the honest place, because every record the review photographs comes
  // from this corpus, through `createRecord`, stamped `fixture`. A fixture incident is no more a
  // fabricated observation than the fixture modules and tasks beside it, PROVIDED it carries the
  // mark and its title says what it is, which is the whole job of the title below.
  //
  // FILED BY AN AGENT, NEVER UNDER A PERSON'S NAME. The actor is the seed's own secretary,
  // registered just above with the card the incident door asks for. `responsibility.person` is the sentence the page draws for The person, and it names
  // the seed's fixture person rather than attributing this write to anybody.
  //
  // THE EVIDENCE IS A RECORD ID, resolved here because ids are minted when the seed runs. It points
  // at the safety problem filed this morning, so the moment's evidence press opens a record that
  // really exists.
  file({
    key: 'inc-review-fixture',
    kind: 'incident',
    title: 'The review’s fixture incident — a seeded scene for tools/review.mjs, deleted with its database',
    summary:
      'Not a loss that happened: the four-width review’s own fixture incident, so the incident page has a scene to photograph.',
    actor: { type: 'agent', id: 'seed-secretary' },
    data: {
      happened_at: { from: 'the moment the review seeded its throwaway database' },
      where: { project: 'courier_archive', experimentOrModule: 'the page walk in tools/review.mjs' },
      loss:
        'No real loss: this is the review’s fixture. It stands in for the loss an incident page is looked at ' +
        'for, and its title says so, so nobody reads it as an observation.',
      expected: 'The review reaches the incident page and photographs the scene at four widths in both themes.',
      actual: 'The fixture stands in for a real incident; nothing was lost, and the record is labelled a fixture.',
      timeline: [
        {
          id: 'fixture-moment-1',
          at: 'the moment the review seeded its database',
          who: 'the seed',
          what: 'Filed this fixture so the incident page has a scene to draw.',
          evidence: rec('prb-nitrate').id,
        },
      ],
      responsibility: {
        person: {
          sentence: 'The seed’s fixture person has no share of this: there is no loss and no person was involved.',
          uncertainty: 'not applicable — the title says this is the review’s fixture incident',
        },
        agents: {
          sentence: 'No agent caused this; the seed wrote the fixture and says so in its title.',
          uncertainty: 'not applicable',
          handles: [],
        },
        office: {
          sentence: 'Nothing in the office failed here; this is the review’s fixture, not an observation.',
          uncertainty: 'not applicable',
        },
      },
      state: 'open',
      found_by: 'the seed, so the review tool has an incident page to photograph',
    },
  })

  // ------------------------------------------------------------------ one fixture counter
  //
  // WHY THE SEED WRITES A COUNTER. Criterion CT8's page lists this project's counters, and
  // `node tools/review.mjs` photographs it at four widths in both themes. A project with no counters
  // draws only the door's empty sentence, so the page would be reviewed at its emptiest and nothing
  // about how a full one draws. Decision uLV_1NVD8jeV point 17 settles that this script writes ONE
  // counter, PAUSED, with fixture rows: additions, one firing and one held-back firing. A paused
  // counter fires nothing while a review has it on screen, so the pictures do not change under the
  // photographer, and the rows give the opened counter a history to draw.
  //
  // WRITTEN WITH THE COUNTER DOORS' MARK, because the real filing door stamps `authored` and this
  // corpus is fixture. `asTheCounterDoors` is the same mark the door sets around its own write, so
  // the write still goes through `createRecord`; only the origin differs, and the title says what
  // the record is. The rows are inserted directly for the same reason: the real add door would run
  // the action and file a task, and this fixture is a picture, not work.
  const COUNTER_TITLE =
    'The review’s fixture counter — a paused counter with rows, so the counters page has a full one to draw'
  const existingCounter = getRecordByTitle(COUNTER_TITLE, 'default')
  if (existingCounter === null) {
    const owner = { kind: 'person' as const, id: ownerId }
    const made = asTheCounterDoors(() =>
      createRecord({
        workspaceId: 'default',
        kind: 'counter',
        title: COUNTER_TITLE,
        summary:
          'Not a counter anybody filed: the four-width review’s own fixture, so the counters page has a counter with a history to photograph.',
        origin: 'fixture',
        actor: HUMAN,
        data: {
          counts: 'Landings in this repository since the whole suite last ran, in this fixture for the review.',
          createdBy: owner,
          mayAdd: { anyone: false, who: [owner] },
          triggers: [
            { kind: 'count', n: 2 },
            { kind: 'every', hours: 12 },
          ],
          action: { kind: 'task', title: 'Run the whole suite on main, as the fixture counter asks' },
          atMostOnceEvery: 30,
          pause: {
            at: stampOf(new Date()),
            by: owner,
            because:
              'The review is being photographed, and nothing should fire while somebody is looking at the page.',
          },
        },
      }),
    )
    seeded.add(made.id)

    // THE FOUR ROWS, newest last. One addition, the firing it caused, the second addition, and the
    // held-back firing the limit wrote. The firing's reason is the words `readTrigger` writes, and
    // the held-back row's is the words `fireOrHoldBack` writes, so the fixture reads like the real
    // reading rather than like a hand-invented history.
    const nowMs = Date.now()
    const additionOne = stampOf(new Date(nowMs - 4000))
    const firedAt = stampOf(new Date(nowMs - 3000))
    const additionTwo = stampOf(new Date(nowMs - 2000))
    const heldAt = stampOf(new Date(nowMs - 1000))
    const mayFireAgain = stampOf(new Date(nowMs - 3000 + 30 * 60 * 1000))
    const firingReason = 'The count reached 2, and it fires at 2.'
    const heldReason =
      `${firingReason} It was not fired: this counter fires at most once every 30 minutes, it last fired at ` +
      `${firedAt}, and it may fire again at ${mayFireAgain}. The count is kept.`
    db.insert(counterRowsTable)
      .values([
        {
          id: 'counter-fixture-add-1',
          workspaceId: 'default',
          counterId: made.id,
          seq: 1,
          what: 'addition',
          at: additionOne,
          by: `person:${ownerId}`,
          eventKind: null,
          eventId: null,
          eventAt: null,
          count: 2,
          amount: null,
          because: 'Two landings in the fixture lane, counted so the count reaches its trigger.',
          whichTrigger: null,
          answer: null,
        },
        {
          id: 'counter-fixture-firing-1',
          workspaceId: 'default',
          counterId: made.id,
          seq: 2,
          what: 'firing',
          at: firedAt,
          by: null,
          eventKind: null,
          eventId: null,
          eventAt: null,
          count: 2,
          amount: null,
          because: firingReason,
          whichTrigger: 0,
          answer: JSON.stringify({
            kind: 'task',
            ids: [],
            says: 'The fixture firing filed no task: this row is here so the page has a firing to draw.',
            finished: true,
          }),
        },
        {
          id: 'counter-fixture-add-2',
          workspaceId: 'default',
          counterId: made.id,
          seq: 3,
          what: 'addition',
          at: additionTwo,
          by: `person:${ownerId}`,
          eventKind: null,
          eventId: null,
          eventAt: null,
          count: 2,
          amount: null,
          because: 'Two more landings, added straight after the firing so the limit holds the next one back.',
          whichTrigger: null,
          answer: null,
        },
        {
          id: 'counter-fixture-held-1',
          workspaceId: 'default',
          counterId: made.id,
          seq: 4,
          what: 'held back',
          at: heldAt,
          by: null,
          eventKind: null,
          eventId: null,
          eventAt: null,
          count: 2,
          amount: null,
          because: heldReason,
          whichTrigger: null,
          answer: null,
        },
      ])
      .run()
  } else {
    seeded.add(existingCounter.id)
  }

  // ------------------------------------------------------------------ one fixture flow
  //
  // WHY THE SEED WRITES A FLOW. The flow register is a page and a route, and a review of either on
  // an empty corpus says nothing about how one draws. A flow is not a record of anything that
  // happened — it says what the office DOES — so the honest fixture is a description of one real
  // office procedure, read against what actually happens and marked a fixture like everything else
  // this script owns. The office's own session start is the procedure whose evidence is closest to
  // hand: the hook, the record it files, and the identity every later call is attributed to.
  //
  // EVERY REQUIRED FIELD IS WRITTEN, so this record is not one of the incomplete-on-purpose family
  // below and the count those tests pin does not move.
  //
  // EACH STEP SAYS WHY IT IS THERE AND NAMES ITS SOURCE, and a source is a
  // record. The note below is that source: a fixture like the flow, saying what goes wrong without
  // each step, so the flow's reasons stand on a record the corpus holds and not on an invented id.
  const sessionStartReasons = file({
    key: 'flow-session-start-reasons',
    kind: 'note',
    title: 'Why the start of an agent session has three steps — a fixture note',
    summary: 'What goes wrong without each step of the fixture flow for the start of an agent session.',
    actor: HUMAN,
    data: {
      body:
        'Without the session id the hook cannot tell one run from another. Without the session record nothing in the office ' +
        'says the run happened or where it landed. Without the exported identity every later call is written down as nobody.',
    },
  })
  file({
    key: 'flow-session-start',
    kind: 'flow',
    title: 'The start of an agent session — a fixture flow describing what the office really does',
    summary:
      'The session hook files a session record when a run starts, prints its id, and the runner exports the identity every later call is attributed to.',
    actor: HUMAN,
    data: {
      declared_in: 'tools/session-hook.mjs',
      runs: 'the office itself',
      trigger: 'An agent session starts, and Claude Code runs the session hook.',
      stages: [
        {
          n: 1,
          does: 'The hook reads the session id the runtime sent on stdin and asks the one declaration where the API is.',
          evidence: 'tools/session-hook.mjs',
          why: 'Without the session id the hook cannot tell one run from another.',
          sources: [sessionStartReasons.id],
        },
        {
          n: 2,
          does: 'The hook files a session record and prints one line beginning MOLE OFFICE that names its id.',
          evidence: 'a session record filed by the hook',
          why: 'Without the session record nothing in the office says the run happened or where it landed.',
          sources: [sessionStartReasons.id],
        },
        {
          n: 3,
          does: 'The runner exports MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE, so every later call is attributed to this run.',
          evidence: 'the environment of the run',
          why: 'Without the exported identity every later call is written down as nobody.',
          sources: [sessionStartReasons.id],
        },
      ],
      leaves_behind: 'a session record, and through it where the run landed',
      governed_by: 'tools/session-hook.mjs',
      reviewed_at: dateOffset(0),
      source: "the flow kind's own example in src/shared/kinds.ts; the office-flow inventory, report jDwkhne4tDWR",
    },
  })

  // The seven pipelines that carry steps, and the two obligations the link section names directly.
  // `rec` throws and names the key when a corpus does not hold one, which is the same refusal the
  // link section has always had for a mistyped key. The eighth pipeline, the oral-history stub, has
  // no steps on purpose and is named nowhere here.
  const reel = rec('pipe-reel')
  const accuracy = rec('pipe-accuracy')
  const places = rec('pipe-places')
  const adPrices = rec('pipe-ad-prices')
  const reportPack = rec('pipe-report-pack')
  const conservation = rec('pipe-conservation')
  const proofRound = rec('pipe-proof-round')
  const interim = rec('obl-interim')
  const countyScanner = rec('obl-county-scanner')

  // -------------------------------------------------------------------------- links
  //
  // About a hundred, over all the types. `consumes` is the type the whole product exists for: it
  // answers "which results is nobody using?" and "what work is waiting on a result that does not
  // exist yet?", and it is the type that makes a retraction visible as a broken dependency rather
  // than as a record quietly disappearing.
  //
  // NOTHING CONSUMES THE PROOFREADING-RATE CLAIM, deliberately. It is the demo's answer to "which
  // measured result is nobody using": a claim with numbers, evidence and a caveat that no pipeline
  // and no task depends on. tests/records.test.ts and tests/seed.test.ts pin that, and adding a
  // `consumes` into it would quietly remove the only example of that query having something to say.

  // What waits on what. Two of these point at a claim that has been retracted, and those two are
  // what `unmetDependencies()` reports.
  link(rec('tsk-threshold'), 'consumes', rec('clm-default-90'))
  link(reportPack, 'consumes', rec('clm-default-90'))
  // The contradicted claim that something still depends on: the full sample says the 1880s read at
  // 81 %, the early 40-page try said 88 %, both claims are on file, nothing has decided between them,
  // and the reel pipeline goes on consuming the older one.
  link(reel, 'consumes', rec('clm-1880s-88'))
  link(interim, 'consumes', rec('clm-1880s-81'))
  link(interim, 'consumes', rec('clm-dates-976'))
  link(rec('tsk-accuracy-table'), 'consumes', rec('clm-1880s-81'))
  link(rec('mod-site'), 'consumes', rec('mod-index'))
  link(rec('idea-map'), 'consumes', rec('mod-index'))
  link(rec('idea-bread-prices'), 'consumes', rec('clm-layout-f1'))
  link(adPrices, 'consumes', rec('mod-layout'))
  link(places, 'consumes', rec('mod-metadata'))
  link(rec('obl-museum'), 'consumes', rec('mod-site'))
  link(rec('obl-final-report'), 'consumes', rec('clm-vinegar'))
  link(rec('tsk-newsletter-pages'), 'consumes', rec('mod-scanner'))

  // ---- the blocks of every pipeline, and the two kinds of link they need --------------------
  //
  // ONE CALL PER PIPELINE, AND IT WRITES THREE THINGS: a block record per entry, an `implements`
  // link from each module that carries it, and a `blocks` link per dependency, carrying the gate.
  //
  // `implements` and not `consumes`: the pipeline is the plan and the module is what carries it
  // out. Calling it consumption would put every module into the "results nobody is using" query's
  // opposite column and quietly change what that query means.
  //
  // The `implements` links are written as `inferred`, because that is what they are: the corpus's
  // author wrote a list of module titles on each block and the link was worked out from it. A
  // reader is meant to be able to tell an edge somebody wrote from one the product deduced.
  const blockIds = new Map<string, string>()
  // Each pipeline with its steps, in the order the corpus lists them. The steps are the corpus's;
  // which pipeline they belong to and when they were filed come with them.
  const filedBlocks: [PanelRecord, CorpusStep[], At][] = [
    [reel, corpusSteps('reel').steps, corpusSteps('reel').when],
    [accuracy, corpusSteps('accuracy').steps, corpusSteps('accuracy').when],
    [places, corpusSteps('places').steps, corpusSteps('places').when],
    [adPrices, corpusSteps('ad-prices').steps, corpusSteps('ad-prices').when],
    [reportPack, corpusSteps('report-pack').steps, corpusSteps('report-pack').when],
    [conservation, corpusSteps('conservation').steps, corpusSteps('conservation').when],
    [proofRound, corpusSteps('proof-round').steps, corpusSteps('proof-round').when],
  ]
  for (const [pipeline, blocks, when] of filedBlocks) {
    for (const [short, id] of fileBlocks(pipeline, blocks, when)) blockIds.set(short, id)
  }

  /**
   * The record id of a block, by the short id the corpus writes.
   *
   * A GATE'S `upTo` NAMES A RECORD NOW. It used to be the step's own short id, which was free text
   * nothing could check: a gate naming a step of the wrong pipeline was indistinguishable from a
   * stage named in words, and both were stored behind a 201. This refuses a name nothing holds, in
   * the seed, where it is cheap to notice.
   */
  const blockId = (short: string): string => {
    const id = blockIds.get(short)
    if (id === undefined) {
      throw new Error(`No block was filed with the short id "${short}". The ones this run filed are: ${[...blockIds.keys()].join(', ')}.`)
    }
    return id
  }

  // ---- what attaches to ONE BLOCK rather than to a whole pipeline ---------------------------
  //
  // Four kinds, because four different things would otherwise be lost:
  //   a PROBLEM   — the masthead misreading is about the date step and about nothing else.
  //   a MEASURES  — a claim that times one block, which `measured` on a step can only say in prose.
  //   an IDEA     — something to try, aimed at the block it would change.
  //   a CLAIM     — a measured result that stands behind one block, not behind twelve.
  link(rec('prb-masthead'), 'blocks', recordById(blockId('rp-07')))
  link(rec('clm-scan-time'), 'measures', recordById(blockId('rp-02')))
  link(rec('idea-bread-prices'), 'relates_to', recordById(blockId('ad-03')))
  link(rec('clm-layout-f1'), 'measures', recordById(blockId('rp-06')))

  // ---- gates on `blocks` links ------------------------------------------------------------
  //
  // Three shapes, and all three are here on purpose:
  //
  //   hard        B cannot proceed at all until A finishes.
  //   partial     B may proceed as far as a named stage, and no further.
  //   unqualified NULL in both columns — the author said A blocks B and said nothing about how
  //               much. Reading that as `hard` would put a word in their mouth and make work that
  //               is mostly doable look completely stuck.

  // THE CASE THE PARTIAL GATE EXISTS FOR. Both OCR runs on the sample can be done without the
  // proofread text; nothing can be SCORED without it. Recorded as a hard gate, the three finished
  // blocks of the accuracy check would read as blocked work.
  gatedLink(rec('tsk-proof-sample'), accuracy, { kind: 'partial', upTo: blockId('ac-04') })

  // The adverts the segmenter calls articles do not stop the price series being collected; they stop
  // it at the step after collection, where a wrong box becomes a wrong price.
  gatedLink(rec('prb-ads'), adPrices, { kind: 'partial', upTo: blockId('ad-01') })

  // The broken splicer holds the return of the damaged reels, but not completely: the four with torn
  // leaders can be mended by hand, and only the two with vinegar syndrome need the machine.
  gatedLink(rec('prb-splicer'), rec('tsk-studio-return'), {
    kind: 'partial',
    upTo: 'the four reels with torn leaders can be mended by hand; the two with vinegar syndrome cannot',
  })

  // Hard gates: nothing can proceed until the other thing finishes.
  gatedLink(rec('tsk-proof-sample'), rec('tsk-accuracy-table'), { kind: 'hard' })
  gatedLink(rec('tsk-accuracy-table'), interim, { kind: 'hard' })
  gatedLink(rec('tsk-ad-definition'), rec('tsk-relabel-ads'), { kind: 'hard' })
  gatedLink(rec('prb-broadsheet'), rec('tsk-ocr-1889'), { kind: 'hard' })
  gatedLink(rec('prb-geocoder'), rec('tsk-geocode'), { kind: 'hard' }, agentRun('places-geo'))
  gatedLink(rec('tsk-last-county-reels'), countyScanner, { kind: 'hard' }, agentRun('scan-1924'))

  // The safety item, and what it holds up. Four live records stand behind it, which is what a rule
  // that ranks by recorded consequence has to be able to see: it is not on the list because it is
  // old — it was filed this morning — it is on the list because a person could be hurt. The reels can
  // still be checked out of cold storage; nothing past that may run beside the lamp.
  gatedLink(rec('prb-nitrate'), rec('tsk-scan-1931'), { kind: 'hard' })
  gatedLink(rec('prb-nitrate'), rec('tsk-overnight'), { kind: 'hard' })
  gatedLink(rec('prb-nitrate'), rec('tsk-visit'), { kind: 'hard' })
  gatedLink(rec('prb-nitrate'), reel, { kind: 'partial', upTo: blockId('rp-01') })

  // Unqualified on purpose: both were written by the run that found the problem, before anybody
  // thought about how hard they were, and neither has been qualified since. NULL is the honest
  // reading and a reader shows it as an unqualified block rather than inventing a strength for it.
  link(rec('prb-filenames'), 'blocks', rec('tsk-copy-offsite'))
  link(rec('prb-port'), 'blocks', rec('tsk-site-port'))

  // ---- the rest of the graph --------------------------------------------------------------

  link(rec('mod-ads'), 'part_of', rec('mod-layout'), agentRun('ad-labels'))
  link(rec('tsk-scan-1931'), 'part_of', rec('mod-scanner'))
  link(rec('tsk-overnight'), 'part_of', rec('mod-scanner'))
  link(rec('tsk-last-county-reels'), 'part_of', rec('mod-scanner'))
  link(rec('tsk-masthead-1890s'), 'part_of', rec('mod-dates'))
  link(rec('tsk-ocr-1889'), 'part_of', rec('mod-ocr'))
  link(rec('tsk-threshold'), 'part_of', rec('mod-ocr'))
  link(rec('tsk-gpu-trial'), 'part_of', rec('mod-ocr'))
  // The memory problem on the 1889 broadsheets is the OCR module's own, so the module's card has more
  // attached work than it has room for, and says what it left out by kind.
  link(rec('prb-broadsheet'), 'relates_to', rec('mod-ocr'))
  link(rec('tsk-accuracy-table'), 'relates_to', rec('mod-ocr'))
  link(rec('tsk-ad-definition'), 'part_of', rec('mod-ads'))
  link(rec('tsk-geocode'), 'part_of', rec('mod-index'))
  link(rec('tsk-dedupe-pages'), 'part_of', rec('mod-split'))
  link(rec('tsk-guard-fit'), 'part_of', rec('mod-guard'))
  link(rec('tsk-skip-button'), 'part_of', rec('mod-proof'))

  // What each run actually produced. This is the join that answers "where did this number come
  // from" — the change log says which session wrote a record, and these say what a session was for.
  link(rec('ses-grant-figures'), 'produces', interim, agentRun('grant-figures'))
  link(rec('ses-ocr-sample'), 'produces', rec('clm-1880s-81'), agentRun('ocr-sample'))
  link(rec('ses-bin-trial'), 'produces', rec('clm-1880s-88'), agentRun('bin-trial'))
  link(rec('ses-scan-1923b'), 'produces', rec('clm-scan-time'), agentRun('scan-1923b'))
  link(rec('ses-layout-v1'), 'produces', rec('clm-layout-f1'), agentRun('layout-v1'))
  link(rec('ses-dates-v1'), 'produces', rec('clm-dates-976'), agentRun('dates-v1'))
  link(rec('ses-missing-1923'), 'produces', rec('clm-1923-missing'), agentRun('missing-1923'))
  link(rec('ses-places-v1'), 'produces', rec('clm-places'), agentRun('places-v1'))
  link(rec('ses-vinegar-survey'), 'produces', rec('clm-vinegar'), agentRun('vinegar-survey'))
  link(accuracy, 'produces', rec('clm-1880s-81'))

  link(rec('mod-proof'), 'measures', rec('mod-ocr'))
  link(rec('mod-proof'), 'measures', rec('mod-layout'))
  link(rec('ses-proof-export'), 'measures', rec('clm-proof-rate'), agentRun('proof-export'))
  link(accuracy, 'measures', rec('mod-ocr'))
  link(places, 'measures', rec('clm-places'))

  // Two claims that disagree, and both are on file. Nothing has decided between them, which is the
  // state the product is for: the reel pipeline is standing on the older number.
  link(rec('clm-1880s-81'), 'contradicts', rec('clm-1880s-88'), agentRun('ocr-sample'))
  // A broken link at the FROM end, which is the rarer shape: most broken links point at something
  // deleted, and this one is written BY something deleted.
  link(rec('clm-1923-complete'), 'contradicts', rec('clm-1923-missing'), agentRun('reel-census'))
  link(rec('clm-binarise-cost'), 'contradicts', rec('idea-scan-ocr'), agentRun('bin-trial'))

  link(rec('tsk-borrow-scanner'), 'supersedes', rec('pur-second-scanner'))
  link(rec('tsk-site-port'), 'supersedes', rec('wt-library-host'))
  link(rec('clm-1923-missing'), 'supersedes', rec('clm-1923-complete'), agentRun('missing-1923'))

  link(rec('dec-400dpi'), 'derived_from', rec('clm-scan-time'))
  link(rec('dec-1950s-binarise'), 'derived_from', rec('clm-1880s-81'))
  link(rec('dec-geocoder-week'), 'derived_from', rec('prb-geocoder'))
  link(rec('clm-1880s-81'), 'derived_from', rec('mod-proof'), AGENT)
  link(rec('clm-vinegar'), 'derived_from', rec('mod-conservation'), agentRun('vinegar-survey'))
  link(rec('idea-light-box'), 'derived_from', rec('prb-splicer'))

  link(rec('msg-threshold'), 'discusses', rec('tsk-threshold'), agentRun('proof-queue'))
  link(rec('msg-1880s'), 'discusses', rec('clm-1880s-88'), agentRun('ocr-sample'))
  link(rec('msg-gpu-held'), 'discusses', rec('ses-ocr-gpu'), SWEEP)
  link(rec('msg-masthead'), 'discusses', rec('prb-masthead'), agentRun('dates-fix'))
  link(rec('msg-geocoder'), 'discusses', rec('prb-geocoder'), agentRun('places-geo'))
  link(rec('msg-blade'), 'discusses', rec('prb-splicer'), agentRun('conservation-list'))
  link(rec('nte-fund-call'), 'discusses', interim)
  link(rec('nte-board'), 'discusses', rec('obl-board-note'))

  link(rec('tsk-move-nitrate'), 'relates_to', rec('prb-nitrate'))
  link(rec('pur-cabinet'), 'relates_to', rec('tsk-move-nitrate'))
  link(rec('ses-scan-1924'), 'relates_to', rec('mod-scanner'), agentRun('scan-1924'))
  link(rec('pur-splicer-blade'), 'relates_to', rec('prb-splicer'))
  link(rec('pur-gpu-hours'), 'relates_to', rec('tsk-gpu-trial'))
  link(rec('pur-drives'), 'relates_to', rec('tsk-copy-offsite'))
  link(rec('nte-gpu-costs'), 'relates_to', rec('dir-gpu'))
  link(rec('nte-waiting-on'), 'relates_to', reportPack)
  link(rec('mod-scanner'), 'relates_to', rec('tsk-borrow-scanner'))

  // ---------------------------------------------------------------- work that serves a goal
  //
  // CRITERION P1's `serves` LINK, and criterion P4: a cluster serves a goal. The demo has no
  // trajectory — it is on the list of kinds the demo deliberately leaves out — so most of these run
  // from a module, and one from an obligation, which `serves` also accepts. Each of the five seeded
  // goals is served by something, so the horizons page draws a cluster under every horizon rather
  // than empty bands; the first decade is served by two modules.
  link(rec('mod-site'), 'serves', rec('goal-first-decade'))
  link(rec('mod-ocr'), 'serves', rec('goal-first-decade'))
  link(interim, 'serves', rec('goal-interim-on-time'))
  link(rec('mod-scanner'), 'serves', rec('goal-all-reels'))
  link(rec('mod-proof'), 'serves', rec('goal-volunteers-alone'))
  link(rec('mod-index'), 'serves', rec('goal-whole-run'))

  // -------------------------------------------------------------------------- the master pipeline
  //
  // WHY THE SEED MARKS ONE. The project board's rows are the steps of the project's master pipeline,
  // and a project with none draws only its title, by design. `node tools/review.mjs` photographs
  // `#/board` on an office this seed wrote, so while nothing was marked every picture of the board was
  // a heading, and the review's empty-page check refused all eight. The report pack's steps, filed
  // above, become the board's rows.
  //
  // NOT THE REEL PIPELINE, though it is the corpus's whole path. A master's own page draws the big
  // map above its drawing. The reel is the pipeline the review photographs on its own page, and the
  // one tests/one-pipelines-drawing-opens-on-its-first-step.test.ts opens, so marking it would change
  // that picture and push its first step out of that test's window.
  //
  // THROUGH THE ONE WRITER, AND WITH NO CHANGE ROW. `markTheMasterPipeline` refuses a record that is
  // not a live pipeline of this project, as it does for the door. The door also writes a change row
  // for the secretary or the owner who chose; nobody chose here, so none is written, and the door's
  // `lastChange` reads null: the change log holds no change to this mark. A rerun writes the same id.
  markTheMasterPipeline('default', reportPack.id)

  // -------------------------------------------------------------------------- retraction
  //
  // Done after the links so the links exist to be broken. deleteRecord is a soft delete and returns
  // immediately if the record is already deleted, so a rerun changes nothing.
  // WHICH RECORDS ARE RETRACTED IS READ OFF THE CORPUS, not listed again here. A corpus record
  // carries `retracted: true` so that `upsert` does not quietly heal it on the next run, and this
  // used to be a second list of the same three keys beside it — two places stating one fact, which
  // is the defect this repository keeps producing.
  const retractions = CORPUS.records.filter((r) => r.retracted === true).map((r) => r.key)
  let retracted = 0
  for (const key of retractions) {
    const record = rec(key)
    if (getRecordByTitle(record.title, 'default')?.deletedAt === null) retracted++
    deleteRecord(record.id, HUMAN)
  }

  // -------------------------------------------------------------------------- history

  // Last, because it re-dates the rows every step above has just written.
  fabricateHistory()

  // -------------------------------------------------------------------------- the check

  const report = check()

  const summary: SeedSummary = {
    created: counts.created,
    updated: counts.updated,
    unchanged: counts.unchanged,
    restored: counts.restored,
    blocksValidated: counts.blocks,
    linksCreated: countLinks() - linksBefore,
    gatesWritten: counts.gates,
    retracted,
    historyRows: counts.history,
    stamped: counts.stamped,
    byKind: report.byKind,
  }

  const kinds = RECORD_KINDS.map((kind) => `${summary.byKind[kind] ?? 0} ${kind}`).join(', ')
  console.log(
    `seed: ${summary.created} records created, ${summary.updated} updated, ${summary.unchanged} already current`,
  )
  // Only printed when it happened. A "0 restored" line every run would train the reader to skip
  // the one line that says the database had drifted away from the demo.
  if (summary.restored > 0) {
    console.log(
      `seed: ${summary.restored} seeded records were soft-deleted and have been restored — ` +
        `something removed them after the last seed`,
    )
  }
  console.log(`seed: ${report.live} live records — ${kinds}`)
  console.log(`seed: ${summary.linksCreated} links created, ${summary.gatesWritten} of them carrying a gate`)
  console.log(
    `seed: ${summary.blocksValidated} curated summary blocks validated ` +
      `(${String(SCANNER_SUMMARY.length)} on ${rec('mod-scanner').title}, ${String(OCR_SUMMARY.length)} on ${rec('mod-ocr').title})`,
  )
  console.log(`seed: sessions — ${report.sessionStates}`)
  console.log(`seed: change log — ${report.sessionColumn}`)
  console.log(`seed: pipelines — ${report.mapping}`)
  console.log(`seed: gates — ${report.gates}`)
  console.log(`seed: consequence — ${report.consequence}`)
  console.log(`seed: pauses — ${report.pauses}`)
  console.log(`seed: obligations — ${report.obligations}`)
  console.log(`seed: incomplete on purpose — ${report.incomplete}`)
  console.log(
    `seed: history anchored to ${stampOf(TODAY).slice(0, 10)} · corpus written as of ${CORPUS.today}, ` +
      `every stamp moved by ${CORPUS_DAYS_MOVED} day(s) · ` +
      `${summary.historyRows} back-dated change rows filed, ${filedAt.length} records dated back`,
  )
  console.log(`seed: provenance — ${report.origin}`)
  if (summary.stamped > 0) {
    console.log(`seed: ${summary.stamped} record(s) were marked \`fixture\` by this run; the rest already said so`)
  }
  console.log(`seed: what needs somebody today — ${report.attention}`)
  console.log(`seed: ${report.safety}`)
  if (retracted > 0) {
    console.log(`seed: retracted ${retracted} records — the links into them now show as broken`)
  }
  if (summary.created === 0 && summary.updated === 0 && summary.restored === 0) {
    console.log('seed: nothing to do, the database already matches the seed')
  }
  return summary
}

export interface SeedSummary {
  created: number
  updated: number
  unchanged: number
  /**
   * Seeded records that were found soft-deleted and brought back. Non-zero means the database had
   * drifted from the demo — see WHY THE SEED USED TO STOP AT NINE RECORDS. On a fresh `db:reset`
   * this is always 0, and on a healthy database a rerun leaves it 0 too.
   */
  restored: number
  linksCreated: number
  /** How many of those links carry a gate. See `gatedLink`. */
  gatesWritten: number
  retracted: number
  /** Curated summary blocks checked on the way in. See validateSummaryBlocks. */
  blocksValidated: number
  /** Back-dated change rows written to give the seeded work a past. */
  historyRows: number
  /**
   * Records this run wrote `fixture` onto.
   *
   * Zero on a re-run, because every row already says it, and that is the point: the mark is written
   * once, at write time, by the thing that knows. It is NOT the number of fixture records in the
   * database — `check()` reads that back out of the column and reports it under `origin`.
   */
  stamped: number
  /** Live records by kind, which is the number a reviewer asks for first. */
  byKind: Record<string, number>
}

// ============================================================================================
// INCOMPLETE ON PURPOSE
// ============================================================================================
//
// Thirty-one records are missing a required field, and every one of them is listed here with the
// field it is missing. check() compares this list against what `completenessOf` actually reports
// and refuses to finish if they disagree in either direction — a record that quietly became
// complete is as much a drift as one that quietly became incomplete.
//
// This is not a second source of truth about completeness. Nothing here is stored, and Mole Office
// recomputes the answer from KIND_SPECS on every read; the list is an assertion about the CONTENT
// above, in the same file as the content, which is what stops it going stale silently.

const INCOMPLETE_ON_PURPOSE: Readonly<Record<string, readonly string[]>> = CORPUS.incompleteOnPurpose

// ============================================================================================
// THE FABRICATED HISTORY
// ============================================================================================
//
// Two of the rules that decide what needs somebody today are answered from the change log: how
// long a checklist item has said `doing`, and when a record ENTERED the state it is in now. In a
// fresh seed every row is minutes old, so both answers are "0 days" and both rules look broken
// when they are not.
//
// So the seed writes the past as well as the present: it dates the records it just created back
// across the three weeks of work they describe, drags their change rows with them, and files the
// state transitions that three weeks would have left behind. All of it is derived from the demo
// clock, so a second run on the same day computes the same stamps, writes no new rows, and leaves
// the change log exactly as it was.
//
// This is fabrication, and it is confined to this block so nobody mistakes it for a feature: only
// the seed does it, only for records the seed itself wrote, and the numbers are the story the
// checklists already tell.

/** Checklist items that are `doing` now, and when they started being that. From the corpus. */
const ITEM_TRANSITIONS: readonly CorpusItemTransition[] = CORPUS.itemTransitions

/** When a handful of records entered the state they are in now. From the corpus. */
const STATE_TRANSITIONS: readonly CorpusStateTransition[] = CORPUS.stateTransitions

/**
 * The value the `session_id` column should hold for a write by this actor.
 *
 * Everything else in this file writes through lib/records.ts, whose logChange resolves the caller's
 * run name to the session RECORD it means before storing it — that resolution is what makes "which
 * session did this" a join rather than a string match. The rows below are the one place that
 * INSERTs into `changes` directly, because they are back-dated rows describing edits that were
 * never really made, so they resolve their names the same way logChange does: the record id when
 * the name is bound to one, and the name itself when it is not, because a name nobody has filed is
 * still the only thing known about who wrote the row.
 */
function sessionColumnFor(actor: Actor): string | null {
  const name = actor.sessionId ?? null
  if (name === null) return null
  const ref = resolveSessionRef(name, 'default')
  return ref.recordId ?? ref.asked
}

/** A copy of a module's `data` with one checklist item put back into an earlier state. */
function dataWithItemState(record: PanelRecord, itemId: string, state: ItemState): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(record.data)) as Record<string, unknown>
  const parts = clone['parts']
  if (!Array.isArray(parts)) {
    throw new Error(`"${record.title}" has no parts array, so its history cannot be written.`)
  }
  for (const part of parts) {
    if (typeof part !== 'object' || part === null) continue
    const items = (part as Record<string, unknown>)['items']
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue
      const fields = item as Record<string, unknown>
      if (fields['id'] !== itemId) continue
      fields['state'] = state
      return clone
    }
  }
  throw new Error(
    `"${record.title}" has no checklist item "${itemId}". The history table and the checklist above ` +
      `it have drifted apart.`,
  )
}

/**
 * The project a record is in, for the change rows this file writes without going through
 * `logChange`. Throws rather than guessing: a back-dated row about a record that is not there is
 * a broken history table, not a row to file under a default.
 */
function workspaceOfRecord(recordId: string): string {
  const row = db.select({ workspaceId: recordsTable.workspaceId }).from(recordsTable).where(eq(recordsTable.id, recordId)).get()
  if (row === undefined) {
    throw new Error(
      `The history table names the record ${recordId}, which this seed did not write. A change row's project is ` +
        `read off the record it is about, so there is nothing to read it off.`,
    )
  }
  return row.workspaceId
}

/** Write one back-dated change row, or bring the one that is already there up to date. */
function backdatedRow(row: {
  id: string
  recordId: string
  actor: Actor
  field: string
  oldValue: string
  newValue: string
  at: string
}): void {
  const values = {
    id: row.id,
    // WHICH PROJECT THIS CHANGE HAPPENED IN, read off the record it is about, exactly as
    // `logChange` derives it — this is the one place in the product that writes a change row
    // without going through that function. Left out, the row would carry a NULL workspace and
    // every scoped read of the log would skip it, which is what a fabricated history is least able
    // to survive: the rows exist to be found by the three-day rule and by "how long has this been
    // stuck", and both read the log through a workspace.
    workspaceId: workspaceOfRecord(row.recordId),
    recordId: row.recordId,
    op: 'update' as ChangeOp,
    actorType: row.actor.type,
    actorId: row.actor.id,
    // Resolved, never the raw name — see sessionColumnFor. Every session record is filed by the
    // time this runs, so "scan-1923b" here becomes the id of the session record filed under that name.
    sessionId: sessionColumnFor(row.actor),
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    at: row.at,
  }
  const existing = db.select({ id: changesTable.id }).from(changesTable).where(eq(changesTable.id, row.id)).get()
  if (existing) {
    // Same row, recomputed: the stamp moves with the demo clock and the JSON moves with the
    // content. Updating rather than inserting is what keeps a rerun free of new rows. `sessionId`
    // is rewritten too, because a database seeded before these rows were resolved still holds the
    // raw name, and a seed that only fixed itself on a fresh database would leave every existing
    // one broken while reporting success.
    db.update(changesTable)
      .set({
        at: values.at,
        oldValue: values.oldValue,
        newValue: values.newValue,
        sessionId: values.sessionId,
        // Rewritten for the same reason `sessionId` is: a database seeded before the workspace
        // column existed holds NULL here, and a seed that only got it right on a fresh database
        // would leave every existing one invisible to a scoped read while reporting success.
        workspaceId: values.workspaceId,
      })
      .where(eq(changesTable.id, row.id))
      .run()
    return
  }
  db.insert(changesTable).values(values).run()
  counts.history++
}

/**
 * Give the seeded work a past: date the records back, drag their change rows with them, and file
 * the transitions above.
 *
 * Idempotent by construction. Every stamp is computed from today, every row is addressed by a key
 * that does not change between runs, and nothing here inserts a record.
 */
function fabricateHistory(): void {
  const now = Date.now()
  const createdMs = new Map<string, number>()

  // ---- the records, and the `create` row that announced each one -----------------------
  for (const entry of filedAt) {
    const stamp = at(entry.when)
    const ms = parseLocalStamp(stamp)
    if (ms === null) throw new Error(`Built an unreadable timestamp for "${entry.title}": "${stamp}".`)
    createdMs.set(entry.id, ms)
    sqlite.prepare('update records set created_at = ? where id = ?').run(stamp, entry.id)
    sqlite.prepare("update changes set at = ? where record_id = ? and op = 'create'").run(stamp, entry.id)
  }

  // Seeded records the table does not mention — the six running sessions and the safety item filed
  // this morning — keep the stamp they were written with, which for those is the whole point. Under
  // a reset that stamp is midnight (THE DEMO CLOCK above).
  for (const record of listRecords({ workspaceId: 'default', includeDeleted: true })) {
    if (!seeded.has(record.id) || createdMs.has(record.id)) continue
    createdMs.set(record.id, parseLocalStamp(record.createdAt) ?? now)
  }

  // ---- the links --------------------------------------------------------------------
  // A link cannot predate either of the things it joins, so each one is dated an hour after the
  // later end appeared — or now, when that would put it in the future. Links with an end the seed
  // did not write belong to someone else and are left alone.
  for (const row of db.select().from(linksTable).all()) {
    const from = createdMs.get(row.fromId)
    const to = createdMs.get(row.toId)
    if (from === undefined || to === undefined) continue
    const stamp = stampOf(new Date(Math.min(Math.max(from, to) + HOUR_MS, now)))
    sqlite.prepare('update links set created_at = ?, updated_at = ? where id = ?').run(stamp, stamp, row.id)
    db.update(changesTable)
      .set({ at: stamp })
      .where(
        and(
          eq(changesTable.recordId, row.fromId),
          eq(changesTable.op, 'link'),
          eq(changesTable.field, row.type),
          eq(changesTable.newValue, row.toId),
        ),
      )
      .run()
  }

  // ---- the checklist transitions ------------------------------------------------------
  for (const transition of ITEM_TRANSITIONS) {
    const record = getRecordByTitle(transition.module, 'default')
    if (!record) throw new Error(`No module called "${transition.module}" to write a history for.`)
    const before = dataWithItemState(record, transition.item, transition.from)
    backdatedRow({
      id: transition.id,
      recordId: record.id,
      actor: transition.actor,
      field: 'data',
      oldValue: JSON.stringify(before),
      newValue: JSON.stringify(record.data),
      at: at(transition.when),
    })
  }

  // ---- the record state transitions ---------------------------------------------------
  for (const transition of STATE_TRANSITIONS) {
    const record = rec(transition.key)
    const state = (record.data as Record<string, unknown>)['state']
    if (typeof state !== 'string') {
      throw new Error(
        `"${record.title}" has no state word, so a row saying when it entered one would be read as ` +
          `describing a state it is not in, and dropped.`,
      )
    }
    backdatedRow({
      id: transition.id,
      recordId: record.id,
      actor: transition.actor,
      field: 'data.state',
      oldValue: transition.from,
      newValue: state,
      at: at(transition.when),
    })
  }

  // ---- what "last updated" means once the log has been re-dated ------------------------
  // A record's updatedAt is the newest thing that happened to it, so it is derived from the log
  // rather than set by hand — otherwise a record dated three weeks ago would still claim to have
  // been touched this second. Stamps are "YYYY-MM-DD HH:MM:SS", so text order is time order.
  const ids = [...seeded]
  if (ids.length > 0) {
    sqlite
      .prepare(
        'update records set updated_at = (select max(at) from changes where changes.record_id = records.id) ' +
          `where id in (${ids.map(() => '?').join(', ')}) ` +
          'and exists (select 1 from changes where changes.record_id = records.id)',
      )
      .run(...ids)
  }
}

// ============================================================================================
// THE CHECK
// ============================================================================================
//
// The seed exists to make the product reviewable, so it finishes by asking the rules whether that
// worked. Everything below re-reads what was just written and runs it through the real readers:
// shared/attention.ts, which is the approved rule, and the older engine in src/web/lib, which is
// what the running pages draw today.
//
// WHY THIS IS HERE RATHER THAN IN tests/: because it is about the CONTENT, and content rots on a
// different clock from code. Nothing in a unit test fails when "due tomorrow at 17:00" drifts out
// of the 48-hour window, or when somebody renames a module and four pipeline steps quietly stop
// pointing at anything. This does, on every `npm run db:seed`, and it throws rather than warning:
// a seed that no longer demonstrates the rules is a broken seed.

interface CheckReport {
  live: number
  byKind: Record<string, number>
  sessionStates: string
  sessionColumn: string
  mapping: string
  gates: string
  consequence: string
  pauses: string
  obligations: string
  incomplete: string
  attention: string
  safety: string
  /** What every record this run wrote says about how it got here. See THE PROVENANCE MARK. */
  origin: string
}

function fail(what: string): never {
  throw new Error(`seed check: ${what}`)
}

/** Every link in the workspace, in the shape the rule reads. */
function allLinks(): Link[] {
  return db
    .select()
    .from(linksTable)
    .all()
    .map((row) => ({
      id: row.id,
      fromId: row.fromId,
      toId: row.toId,
      type: row.type as LinkType,
      inferred: row.inferred,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      createdByType: row.createdByType,
    }))
}

/** The change log, in the shape the rule reads. */
function allChanges(): Change[] {
  return listChanges({ workspaceId: 'default', limit: 20000 }).map((row) => ({
    ...row,
    op: row.op as ChangeOp,
    actorType: row.actorType as ActorType,
    // The attention rule reads these to date a state word and shows none of them to anybody, so
    // the provenance of each row's record would be a join for a field nothing on this path reads.
    // Rows that ARE shown go through `toChanges` in lib/http.ts, which reads it in one query.
    origin: null,
  }))
}

function check(): CheckReport {
  const now = Date.now()
  const live = listRecords({ workspaceId: 'default' })
  const everything = listRecords({ workspaceId: 'default', includeDeleted: true })

  const byKind: Record<string, number> = {}
  for (const kind of RECORD_KINDS) byKind[kind] = 0
  for (const record of live) byKind[record.kind] = (byKind[record.kind] ?? 0) + 1

  // ---- the corpus is the size it claims to be -------------------------------------------
  // A seed that quietly shrank back to a handful of records would still pass every rule below on
  // the two or three records it kept. The size IS the demonstration: an interface that holds
  // together on 28 records says nothing about 2,000.
  if (live.length < 200) {
    fail(`only ${live.length} live records. The demo is meant to be about 220 — see the header.`)
  }

  // ---- everything this run wrote says it is fixture ----------------------------------------
  //
  // READ BACK OUT OF THE DATABASE rather than counted from `counts.stamped`, because the number
  // this script kept and the value the column holds are two things that must agree, and only one of
  // them is what a reader will ever see. A record that reached the corpus through this file and
  // came out unmarked is the exact defect decision 17 was settled to end — 290 rows sitting
  // unmarked beside 95 real ones — and it must fail here, on the run that produced it, rather than
  // be recovered by measurement months later the way the first 385 had to be.
  const stamps = sqlite.prepare('select id, title, origin from records').all() as {
    id: string
    title: string
    origin: string | null
  }[]
  const mine = stamps.filter((row) => seeded.has(row.id))
  const unmarked = mine.filter((row) => readOrigin(row.origin) !== 'fixture')
  if (unmarked.length > 0) {
    fail(
      `${unmarked.length} of the ${mine.length} records this run wrote do not say they are fixture — ` +
        `${unmarked
          .slice(0, 5)
          .map((r) => `"${r.title}" (${r.origin === null ? 'no origin' : `origin "${r.origin}"`})`)
          .join(', ')}. Everything written here came through the fixture path and has to say so, or a reader ` +
        `cannot tell it from the project's own record.`,
    )
  }
  if (mine.length === 0) fail('this run wrote no records at all, so there is nothing to mark or to demonstrate')
  const others = stamps.filter((row) => !seeded.has(row.id))
  const otherFixture = others.filter((row) => readOrigin(row.origin) === 'fixture').length
  const otherAuthored = others.filter((row) => readOrigin(row.origin) === 'authored').length
  const otherUnstamped = others.filter((row) => readOrigin(row.origin) === null).length

  // ---- what the write gate would have refused ---------------------------------------------
  // Every record here went through createRecord, which runs the same gate a POST runs, so nothing
  // can be wrong. What CAN happen is that a record is incomplete in a way nobody intended, and the
  // list of deliberate ones is compared in both directions.
  const incomplete = everything
    .map((r) => ({ title: r.title, missing: completenessOf(r.kind, r.data).map((m) => m.path) }))
    .filter((r) => r.missing.length > 0)
  for (const found of incomplete) {
    const expected = INCOMPLETE_ON_PURPOSE[found.title]
    if (expected === undefined) {
      fail(
        `"${found.title}" is incomplete (${found.missing.join(', ')}) and INCOMPLETE_ON_PURPOSE does not ` +
          `mention it. Either fill the field in or add it to that list with the reason.`,
      )
    }
    if (expected.join(', ') !== found.missing.join(', ')) {
      fail(`"${found.title}" is missing ${found.missing.join(', ')}, but the list says ${expected.join(', ')}.`)
    }
  }
  for (const title of Object.keys(INCOMPLETE_ON_PURPOSE)) {
    if (!incomplete.some((r) => r.title === title)) {
      fail(`INCOMPLETE_ON_PURPOSE names "${title}", which is either complete now or is not in the database.`)
    }
  }

  // ---- sessions: all six states, plus the nine that have none -----------------------------
  const seen = readSessions(live)
  const stateless = live.filter((r) => r.kind === 'session' && (r.data as Record<string, unknown>)['state'] === undefined)
  // The old reader reports a session with no state as unreadable, which is honest: it cannot rank
  // one. What it must not do is report a session whose state word is WRONG, because the seed never
  // writes one — so the two counts have to match exactly.
  if (seen.problems.length !== stateless.length) {
    fail(
      `${seen.problems.length} sessions cannot be read but ${stateless.length} have no state. The extra ones ` +
        `have a state word that is not one of ${SESSION_STATES.join(', ')}: ` +
        `${seen.problems.map((p) => `"${p.record.title}" (${p.problem})`).join(', ')}`,
    )
  }
  if (stateless.length < 5) fail(`only ${stateless.length} sessions have no state at all; the demo needs several`)
  const states = new Set(seen.sessions.map((s) => s.state))
  for (const state of SESSION_STATES) {
    if (!states.has(state)) fail(`no session is "${state}", so that state is never drawn`)
  }
  const confirmedFinished = seen.sessions.filter((s) => s.state === 'finished').length
  if (confirmedFinished < 10) {
    fail(`only ${confirmedFinished} sessions are confirmed finished; a reader cannot be judged on collapsing that few`)
  }

  // ---- the change log names sessions in one language --------------------------------------
  // Every value in `changes.session_id` has to be a session RECORD's id. A raw run name left in
  // there is a row whose author cannot be followed, and it is the state POST /api/sessions/discover
  // exists to clean up. A seed that ships it hands every fresh database the defect on day one.
  const stored = storedSessionRefs('default')
  const unresolved = stored.filter(({ stored: value }) => resolveSessionRef(value, 'default').matchedBy !== 'recordId')
  if (unresolved.length > 0) {
    fail(
      `the change log stores ${unresolved.length} session reference(s) that are not session record ids: ` +
        `${unresolved.map((r) => `"${r.stored}" on ${r.rows} row(s)`).join(', ')}.`,
    )
  }

  // ---- obligations: both sides of the window, and one discharged ---------------------------
  const read = readObligations(live)
  const windows = { overdue: 0, soon: 0, later: 0 }
  for (const found of read.obligations) {
    const left = found.dueMs - now
    if (left < 0) windows.overdue++
    else if (left <= DUE_SOON_HOURS * HOUR_MS) windows.soon++
    else windows.later++
  }
  if (windows.overdue < 1 || windows.soon < 1 || windows.later < 1) {
    fail(
      `obligations are ${windows.overdue} overdue, ${windows.soon} inside ${DUE_SOON_HOURS} hours and ` +
        `${windows.later} beyond it. All three are needed, or a window that passed everything would look ` +
        `exactly like one that works.`,
    )
  }
  const discharged = live.filter((r) => r.kind === 'obligation' && readFulfilment(r.data).done)
  if (discharged.length < 1) fail('no obligation is discharged, so the attention list can never be seen to shrink')
  for (const record of discharged) {
    const fulfilment = readFulfilment(record.data)
    if (fulfilment.at === null || fulfilment.note === null) {
      fail(
        `"${record.title}" is marked done but does not say when or what settled it. A boolean cannot say ` +
          `WHEN a promise was kept, which is the part somebody asks about a year later.`,
      )
    }
  }

  // ---- consequence: stored, and across the range of bearers --------------------------------
  const bearers = new Map<ConsequenceBearer, number>()
  let withConsequence = 0
  for (const record of live) {
    const consequence = readConsequence(record.data)
    if (consequence === null) continue
    withConsequence++
    bearers.set(consequence.bearer, (bearers.get(consequence.bearer) ?? 0) + 1)
  }
  for (const bearer of CONSEQUENCE_BEARERS) {
    if ((bearers.get(bearer) ?? 0) === 0) {
      fail(`no record records a consequence borne by "${bearer}", so that bearer is never seen`)
    }
  }

  // ---- pauses: four shapes, and all four read differently ----------------------------------
  const paused = live
    .map((record) => ({ record, pause: readPause(record.data) }))
    .filter((p): p is { record: PanelRecord; pause: Pause } => p.pause !== null)
  if (paused.length < 4) fail(`only ${paused.length} records are paused; the demo needs four shapes of pause`)
  const shapes = {
    datePassed: paused.filter((p) => p.pause.until?.date !== undefined && (parseDueStamp(p.pause.until.date) ?? Infinity) < now).length,
    dateAhead: paused.filter((p) => p.pause.until?.date !== undefined && (parseDueStamp(p.pause.until.date) ?? 0) > now).length,
    onRecord: paused.filter((p) => p.pause.until?.recordId !== undefined).length,
    openEnded: paused.filter((p) => p.pause.until === undefined).length,
    condition: paused.filter((p) => p.pause.until?.condition !== undefined).length,
  }
  for (const [shape, count] of Object.entries(shapes)) {
    if (count < 1) fail(`no pause of the "${shape}" shape, so that reading is never exercised`)
  }
  for (const { record, pause } of paused) {
    const until = pause.until?.recordId
    if (until !== undefined && everything.every((r) => r.id !== until)) {
      fail(`"${record.title}" is paused until record ${until}, which does not exist. That is a dangling reference dressed as a condition.`)
    }
  }

  // ---- gates: hard, partial and unqualified, on the one carrier there is now ----------------
  const allLinkRows = db.select().from(linksTable).all()
  const gateRows = allLinkRows.filter((row) => row.gate !== null)
  const linkGates = { hard: 0, partial: 0 }
  for (const row of gateRows) {
    if (row.type !== 'blocks') fail(`a ${row.type} link carries a gate. A gate rides on a \`blocks\` link and nothing else.`)
    const gate: Gate = row.gateUpTo === null ? { kind: row.gate as Gate['kind'] } : { kind: row.gate as Gate['kind'], upTo: row.gateUpTo }
    if (!gateIsWellFormed(gate)) fail(`a ${gate.kind} gate on link ${row.id} is not well formed — a partial gate must say how far`)
    linkGates[gate.kind]++
  }
  if (linkGates.hard < 2 || linkGates.partial < 2) {
    fail(`links carry ${linkGates.hard} hard and ${linkGates.partial} partial gates; at least two of each are needed`)
  }
  const unqualified = db.select().from(linksTable).all().filter((row) => row.type === 'blocks' && row.gate === null).length
  if (unqualified < 1) {
    fail('every `blocks` link is qualified. One that is not is worth keeping: NULL means the author said nothing about how hard it is.')
  }

  // ---- the pipelines, their blocks and the two kinds of link ---------------------------------
  //
  // THIS CHECK USED TO EXIST BECAUSE TWO THINGS COULD DISAGREE. A step named its modules by TITLE
  // and a parallel `implements` link named the same modules by ID, and this loop was the ONLY place
  // in the whole product that refused to finish unless the two agreed — not the write path, which
  // accepted a rename that broke ten of them behind a 200. There is one representation now, so what
  // is checked here is different: that every id a pipeline's order names is a live block, that the
  // links carry the mapping, and that the demo still shows the shapes it exists to show.
  const blockGates = { hard: 0, partial: 0 }
  let branching = 0
  let rejoining = 0
  const mapping = { steps: 0, pairs: new Map<string, number>(), widest: 0 }
  const linkRows = allLinks()
  for (const pipeline of live.filter((r) => r.kind === 'pipeline')) {
    const ids = blockIdsOf(pipeline)
    if (ids.length === 0) continue
    const held = new Set(ids)
    const needCount = new Map<string, number>()
    for (const id of ids) {
      const block = live.find((r) => r.id === id)
      if (!block) fail(`the pipeline "${pipeline.title}" lists the block "${id}", which is not a live record`)
      if (block?.kind !== BLOCK_KIND) fail(`the pipeline "${pipeline.title}" lists "${id}", which is a ${block?.kind}, not a block`)
      const name = block === undefined ? id : block.title
      // A BLOCK'S TITLE IS ITS OWN NAME. This used to fail when a block
      // title did NOT carry its pipeline's; what is checked instead is the rule that survived, which
      // is the one the prefix was buying: no two live blocks of one pipeline read as the same name.
      if (block !== undefined && ids.filter((other) => live.find((r) => r.id === other)?.title === block.title).length > 1) {
        fail(`the pipeline "${pipeline.title}" has two live blocks called "${block.title}", which a reader cannot tell apart`)
      }
      mapping.steps++

      const carriers = linkRows.filter((l) => l.type === 'implements' && l.toId === id)
      mapping.widest = Math.max(mapping.widest, carriers.length)
      for (const carrier of carriers) {
        const module = live.find((r) => r.id === carrier.fromId)
        if (!module || module.kind !== 'module') {
          fail(`an implements link into the block "${name}" comes from ${carrier.fromId}, which is not a live module`)
          continue
        }
        mapping.pairs.set(module.title, (mapping.pairs.get(module.title) ?? 0) + 1)
      }

      // The raw rows, because the gate columns are not on the shared `Link` shape.
      const needs = allLinkRows.filter((l) => l.type === 'blocks' && l.toId === id && held.has(l.fromId))
      for (const need of needs) {
        if (need.gate === 'hard' || need.gate === 'partial') blockGates[need.gate]++
        needCount.set(need.fromId, (needCount.get(need.fromId) ?? 0) + 1)
      }
      // A rejoin: one block waiting on two or more others.
      if (needs.length >= 2) rejoining++
    }
    // A branch: two blocks waiting on the same predecessor.
    for (const count of needCount.values()) if (count >= 2) branching++
  }
  if (blockGates.hard < 2 || blockGates.partial < 2) {
    fail(`pipeline blocks carry ${blockGates.hard} hard and ${blockGates.partial} partial gates; at least two of each are needed`)
  }
  if (branching < 1 || rejoining < 1) {
    fail(
      `the pipelines branch ${branching} times and rejoin ${rejoining} times. A pipeline that genuinely ` +
        `branches and rejoins is the shape the old model could not express at all, and it has to be here.`,
    )
  }
  if (mapping.widest < 2) fail('no block is carried by two modules, so N:M is claimed but never shown')
  const busiest = [...mapping.pairs.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!busiest || busiest[1] < 2) fail('no module carries two blocks, so N:M is claimed but never shown')

  // A PROBLEM, A CLAIM AND AN IDEA ATTACHED TO A BLOCK. This is what B7 is, and it was structurally
  // impossible before: `links.from_id` and `to_id` are foreign keys to `records.id`, so nothing
  // could point at a nested step. The demo has to show it, or nothing does.
  const blockRecords = new Set(live.filter((r) => r.kind === BLOCK_KIND).map((r) => r.id))
  const attachedKinds = new Set<string>()
  for (const row of linkRows) {
    // Exactly ONE end a block. Both ends a block is a dependency inside a pipeline, which is the
    // order and not an attachment; neither end a block is somebody else's link entirely.
    const fromIsBlock = blockRecords.has(row.fromId)
    const toIsBlock = blockRecords.has(row.toId)
    if (fromIsBlock === toIsBlock) continue
    const other = live.find((r) => r.id === (fromIsBlock ? row.toId : row.fromId))
    if (other !== undefined) attachedKinds.add(other.kind)
  }
  for (const kind of ['problem', 'claim', 'idea']) {
    if (!attachedKinds.has(kind)) {
      fail(`no ${kind} is attached to a pipeline block. Attaching one to the block rather than to the whole pipeline is the whole point of a block being a record.`)
    }
  }

  // ---- broken links ------------------------------------------------------------------------
  const unmet = unmetDependencies('default')
  if (unmet.length < 2) fail(`only ${unmet.length} unmet dependencies; the demo needs work depending on records that were retracted`)

  // ---- the approved rule -------------------------------------------------------------------
  const attention: AttentionResult = computeAttention({
    now,
    records: everything,
    links: allLinks(),
    changes: allChanges(),
    // The machine sweep is a live reading of this computer and has nothing to do with what is
    // recorded. The seed cannot fabricate it and does not try; the rule counts what it is given.
    resources: [],
    dueMs: parseDueStamp,
  })

  // The safety item, and the whole reason this vocabulary exists. It was filed TODAY. If age has
  // pushed it down the list, that is the defect the measurement found, and it must fail loudly
  // rather than be discovered again in six months.
  // FOUND BY ITS CORPUS KEY, not by a title written out again here. The title is the corpus's to
  // choose, and a copy of it in this file would be one more pair that can disagree.
  const estop = getRecordByTitle(rec('prb-nitrate').title, 'default')
  if (!estop) fail('the safety item is not in the database')
  if (!isSafety(readConsequence(estop.data))) fail('the safety item does not record a consequence borne by a person')
  if (estop.createdAt.slice(0, 10) !== stampOf(TODAY).slice(0, 10)) {
    fail(`the safety item was filed on ${estop.createdAt.slice(0, 10)}, not today. It is meant to be the NEWLY filed one.`)
  }
  const ranked = [...attention.visible, ...attention.remainder].sort(compareRows)
  const firstUnsafe = ranked.findIndex((row) => !row.safety)
  const lastSafe = ranked.map((row) => row.safety).lastIndexOf(true)
  if (firstUnsafe !== -1 && lastSafe > firstUnsafe) {
    fail('a row that is not safety-critical outranks one that is, which the safety floor exists to prevent')
  }
  const top = attention.visible[0]
  if (!top || top.recordId !== estop.id) {
    fail(
      `the top of the attention list is "${top?.title ?? '(nothing)'}", not the safety item filed this morning. ` +
        `A newly filed record that says a person could be hurt must not be ranked below anything, and if it is, ` +
        `that is the bug this whole exercise is about.`,
    )
  }

  // THIS CHECK USED TO DEMAND AN UNCLASSIFIED ROW. IT NOW REFUSES ONE, AND THAT IS THE FIX.
  //
  // Two gates stand between a seeded record and the group labelled "nobody has said what this word
  // means". `createRecord` — the same gate a POST goes through, which is why the seed uses it —
  // refuses any state word a kind does not declare, naming the words that are allowed. And every
  // word a kind DOES declare is now classified in STATE_MEANING. So a record written here cannot
  // carry an unclassified word, and one that did would mean one of those two gates had broken silently.
  //
  // WHERE THE GROUP STILL COMES FROM, because it is not dead. A word from an older vocabulary
  // survives on a record already stored, and an import applies a word it cannot classify rather
  // than refusing the row — `tests/import-conflicts.test.ts` §7 covers that path with `gnawing`.
  // The group is for archaeology, which is what it was always for; what it must not be is the
  // ordinary result of filing a fixed problem, which it was until this pass.
  if (attention.unclassified.length > 0) {
    const words = [...new Set(attention.unclassified.map((row) => row.state))].join(', ')
    fail(
      `${attention.unclassified.length} seeded records carry a state word nobody has classified (${words}). Every ` +
        `word a kind declares is meant to be in STATE_MEANING in src/shared/work.ts, and the write gate refuses ` +
        `any other, so this can only mean a kind gained a word without a meaning.`,
    )
  }
  if (attention.noState.length < 1) fail('no record is missing a state word, which is a different thing from an unclassified one')
  if (attention.paused.length < 4) fail(`the rule reports ${attention.paused.length} paused rows; four shapes are seeded`)

  // ---- what the pages draw -------------------------------------------------------------------
  const pipes = readPipelines(live)
  const blockless = live.filter(
    (r) => r.kind === 'pipeline' && !Array.isArray((r.data as Record<string, unknown>)['blockIds']),
  )
  if (pipes.problems.length !== blockless.length) {
    fail(`${pipes.problems.length} pipelines cannot be read but ${blockless.length} have no blocks at all`)
  }
  // THE OLD HOME-PAGE ENGINE WAS CHECKED HERE, AND IT NO LONGER EXISTS.
  //
  // This block ran `computeAttention` from src/web/lib/attention.ts — the browser's own copy of
  // the rule — and asserted that each of its six hard-coded conditions fired at least once, so
  // that a reviewer opening the running product saw a page with every panel populated.
  //
  // Both halves of that are gone. The browser's rule was deleted when the shared rule became the
  // one the server serves, so the import at the top of this file named an export that is not
  // there and the seed would not LOAD at all — `npm run db:reset` and `node tools/review.mjs`
  // both stopped at a SyntaxError. And the page those six conditions described has been replaced
  // by the ranked attention list, which is checked above, against the rule that now decides it.
  //
  // Removed rather than repaired, because there is nothing left to repair it against. The
  // pipeline check above is kept: it is about the seeded data, not about the old engine.
  void unmet

  const bearerCounts = CONSEQUENCE_BEARERS.map((b) => `${bearers.get(b) ?? 0} ${b}`).join(', ')
  return {
    live: live.length,
    byKind,
    sessionStates:
      [...SESSION_STATES].map((state) => `${seen.sessions.filter((s) => s.state === state).length} ${state}`).join(', ') +
      `, ${stateless.length} with no state at all`,
    sessionColumn: `${stored.reduce((n, r) => n + r.rows, 0)} rows name a session, ${stored.length} distinct — all of them record ids`,
    mapping:
      `${mapping.steps} blocks over ${mapping.pairs.size} modules · widest block is carried by ${mapping.widest} · ` +
      `"${busiest[0]}" carries ${busiest[1]} blocks · ${branching} branch points, ${rejoining} rejoins`,
    gates:
      `links: ${linkGates.hard} hard, ${linkGates.partial} partial, ${unqualified} unqualified · ` +
      `blocks: ${blockGates.hard} hard, ${blockGates.partial} partial`,
    consequence: `${withConsequence} records say who is hurt — ${bearerCounts}`,
    pauses:
      `${paused.length} paused — ${shapes.datePassed} past their resume date, ${shapes.dateAhead} still ahead, ` +
      `${shapes.onRecord} waiting on another record, ${shapes.condition} on a condition in words, ${shapes.openEnded} open-ended`,
    obligations:
      `${read.obligations.length} readable — ${windows.overdue} overdue, ${windows.soon} inside ${DUE_SOON_HOURS} hours, ` +
      `${windows.later} beyond it, ${discharged.length} discharged`,
    incomplete: `${incomplete.length} records are missing a required field, all of them on purpose`,
    attention:
      `${attention.total} selected (${attention.visible.length} visible), ${attention.unclassified.length} unclassified, ` +
      `${attention.noState.length} with no state, ${attention.paused.length} paused, ${attention.counts.passedOver} passed over`,
    safety: `the top row is "${top.title}", filed ${estop.createdAt.slice(0, 10)} — ${top.reason.because}`,
    origin:
      `all ${mine.length} records this run wrote are stamped \`fixture\`` +
      (others.length === 0
        ? ' — and nothing else is in this database'
        : `; ${others.length} row(s) here came from somewhere else — ${otherFixture} fixture, ${otherAuthored} ` +
          `authored, ${otherUnstamped} with no origin recorded`),
  }
}

seed()
