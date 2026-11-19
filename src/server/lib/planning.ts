// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING AND WRITING THE PLAN.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOUNDARY RULE THIS FILE EXISTS TO KEEP
 * ---------------------------------------------------------------------------------------
 *
 * A planning period is person-level and spans projects deliberately: one week may hold Mole Office work,
 * greenhouse work and a dentist appointment. The settled decision that allows that also states its
 * limit, and the limit is the reason this is one file rather than a query in a route:
 *
 *   > a planning allocation must never grant access to unrelated records in another workspace
 *
 * **UNRELATED is the word that makes this implementable.** Allocating three hours to a greenhouse task
 * means the planner sees THAT task — that is the whole point of naming it. What it must never become
 * is a way to READ greenhouse: no listing, no filtering, no searching, no counting across a project
 * the caller did not otherwise have.
 *
 * So there is exactly one way records enter a planning reply: `resolveAllocated` takes the record
 * ids that allocations in this period already name, and fetches those rows BY PRIMARY KEY. There is
 * no query in this file that ranges over a workspace, and no caller-supplied filter reaches a record
 * read. A caller can learn about a record by allocating time to it, which is the same thing as
 * knowing its id already.
 *
 * That is a semantic boundary rather than a security one — Mole Office authenticates nobody and
 * `lib/records.ts` says so — and it is kept here so that the day Mole Office has more than one user, the
 * question "who may SEE this allocation" has one place to be answered.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAY BE ALLOCATED, AND WHY THE LIST IS SHORT
 * ---------------------------------------------------------------------------------------
 *
 * Five kinds, and the refusal names all five. Two exclusions are decisions rather than gaps:
 *
 * CONTAINERS ARE OUT — no `pipeline`, no `module`. Allocating six hours to a pipeline and two hours
 * to one of its blocks is either eight hours or six, and nothing here could tell which was meant.
 * Every total in `shared/planning.ts` would be a number a reader has to distrust. Allocate to the
 * blocks; the pipeline's figure is their sum, which is derived and cannot disagree.
 *
 * A DIRECTION IS IN, AND IT DELIBERATELY HAS NO `effort_hours`. Planning has to be
 * able to hold future branches, not only current tasks, and exploring a future direction has to stay
 * distinct from adopting it into the pipeline. Both hold here: you may give a direction hours in a
 * week without estimating its total, because the total effort of an exploration is usually the thing
 * you are exploring to find out. Nothing promotes it into another kind, and a surface that shows it
 * says its estimate is unknown rather than showing a zero.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { anOfficeId } from './ids.ts'
import { nowStamp, parseLocalStamp } from '@shared/time.ts'
import {
  ALLOCATION_STATES,
  GRAINS,
  parsePeriod,
  PLAN_PRESS,
  readTimeWords,
  type Allocation,
  type AllocationState,
  type Grain,
} from '@shared/planning.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import {
  CONTAINMENT_LINK,
  MAX_CONTAINMENT_DEPTH,
  ancestorsOf,
  unloadedRecordName,
  type ContainmentContext,
  type ContainmentLink,
} from '@shared/containment.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { ALLOCATABLE_KINDS, planHoursRuleOf, readWorkState, type WorkStateSource } from '@shared/work.ts'
// THE LADDER'S OWN READER OF `data.shortForms`, so a plan row draws the level-1 label by exactly
// the rule every other surface reads it by, and a half-written form is left out rather than
// repaired. Imported, never copied: a second reader of the same field is the drift this repository
// keeps finding.
import { readStoredShortForms, SHORT_FORMS_FIELD } from '@shared/zoom.ts'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import {
  allocations as allocationsTable,
  links as linksTable,
  planLines as planLinesTable,
  planningCapacity,
  planningIntents,
  planningRecurrences,
  records as recordsTable,
} from '../db/schema.ts'
import { assertMayCommitAnIntent, assertMayCommitTheHours } from './records/asks-and-commitments.ts'
import type { Actor } from './records/actor.ts'
import { pipelineHolding, pipelineTitlesByBlock } from './records/pipeline-membership.ts'
import { getRecord } from './records/reading.ts'
import { PanelError } from './panel-error.ts'

/**
 * The kinds a plan may give time to.
 *
 * NOT A LIST — THE SAME ARRAY `shared/work.ts` DECLARES, under the name the routes already import.
 * `PLAN_HOURS_BY_KIND` there is the one declaration: every kind, whether a plan may give it hours,
 * and the reason, which `checkAllocatable` prints in the refusal. There used to be a second list of
 * "work" in that file — `KIND_FAMILIES.work` — and the two disagreed about four kinds with nothing
 * making them agree. They now answer two different questions and are named differently; that file
 * says which is which and why they still differ.
 *
 * Personal commitments — visitor, family, exercise, admin — need no entry of their own: they are
 * ordinary records in a truthful Personal workspace, so they arrive as a `task` or an `obligation`
 * and consume the same capacity as everything else.
 */
export { ALLOCATABLE_KINDS }

/** What a planning reply says about the work an allocation names. Assembled, never stored. */
export interface AllocatedWork {
  id: string
  kind: RecordKind
  /** The record's real title, whatever it is. Canonical, and what a record page shows. */
  title: string
  /**
   * What to CALL it in a list, which for a block is not its title.
   *
   * A block's title is qualified by its pipeline — "Mole Office development campaign — waves 4A to 9 ›
   * Wave 5 — Planning MVP" — because a block called "Wave 5" means nothing on its own. In a plan
   * that is the wrong way round: three blocks of one pipeline in one week rendered as three rows
   * with the same visible prefix and the distinguishing part off the end. Measured on 2026-08-12,
   * dogfooding Mole Office's own campaign into its own week: all three rows read identically.
   *
   * So a plan row shows the part after the separator and reports the pipeline separately. The
   * title is untouched and still canonical; this is what to draw, not a second name.
   */
  name: string
  /** For a block, the pipeline the name belongs to. `null` for everything else. */
  within: string | null
  /** Which project owns it. Reported, because a week spanning three of them has to say which. */
  workspaceId: string
  /** Its own state word, whatever its kind uses. `null` when it has none. */
  state: string | null
  /** The canonical reader's source. Optional on older literal-state fixtures. Never persisted. */
  stateSource?: WorkStateSource | null
  /**
   * The total estimate on the WORK, or null when nobody has estimated it.
   *
   * Never confused with the allocation's `plannedHours` beside it — see `shared/planning.ts`. A
   * direction usually has none, and that is honest rather than missing.
   */
  effortHours: number | null
  /** How it entered the corpus. A plan built on fixture rows should say so. */
  origin: string | null
  /** True when the record has been soft-deleted since the allocation was written. */
  deleted: boolean
  /**
   * The record's own level-3 conclusion, read from its `summary` column, or null because nobody
   * wrote one. `resolveAllocated` always sets it; it is optional because the browser's own read of
   * the work list (`asAllocated` in Planning.tsx) builds a work row without it, and absent there
   * means the same as null — that reader does not carry the field, and it is not a claim that the
   * record has no summary.
   */
  summary?: string | null
  /**
   * The record's own level-1 label, read out of `data.shortForms` by the ladder's own reader, or
   * null because nobody wrote one. Optional for the same reason and with the same meaning as
   * `summary`.
   */
  label?: string | null
}

/** One allocation with the work it names, which is what every surface actually needs. */
export interface AllocationWithWork {
  allocation: Allocation
  /**
   * The work, or `null` when the record it names is gone entirely.
   *
   * Null is reported rather than the row being dropped: an allocation pointing at nothing is a fact
   * about the plan, and a week that quietly lost two hours would be worse than one that says so.
   */
  work: AllocatedWork | null
}

// ---------------------------------------------------------------------------- reading

type AllocationRow = typeof allocationsTable.$inferSelect

/** The stored row as every reader sees it. One conversion, so no surface invents a second shape. */
function toAllocation(row: AllocationRow): Allocation {
  return {
    id: row.id,
    horizon: row.horizon as Grain,
    period: row.period,
    recordId: row.recordId,
    plannedHours: row.plannedHours,
    actualHours: row.actualHours,
    state: row.state as AllocationState,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Every allocation at one horizon and period. */
export function allocationsIn(horizon: Grain, period: string): Allocation[] {
  return db
    .select()
    .from(allocationsTable)
    .where(and(eq(allocationsTable.horizon, horizon), eq(allocationsTable.period, period)))
    .all()
    .map(toAllocation)
}

/**
 * Every allocation whose period falls inside `from`..`to`, at any horizon.
 *
 * Compared as strings, which works because every period key sorts as its own calendar does for a
 * given horizon — and the days a period covers are computed by `parsePeriod` rather than by
 * comparing keys of different shapes to each other. A week key is never string-compared to a day.
 */
export function allocationsCovering(from: string, to: string): Allocation[] {
  return db
    .select()
    .from(allocationsTable)
    .all()
    .map(toAllocation)
    .filter((a) => {
      const p = parsePeriod(a.period)
      // A period whose key cannot be parsed is not silently dropped from a total; it is not in a
      // range either, because nothing can say where it is. `checkPeriod` refuses these on write, so
      // reaching this line means a row was written before that check existed or by hand.
      return p !== null && p.to >= from && p.from <= to
    })
}

/** Everywhere one piece of work has been given time. The other read there is. */
export function allocationsOf(recordId: string): Allocation[] {
  return db.select().from(allocationsTable).where(eq(allocationsTable.recordId, recordId)).all().map(toAllocation)
}

/**
 * Fetch the work these allocations name — BY PRIMARY KEY, and only these.
 *
 * THE ONLY RECORD READ IN THIS FILE. It takes ids that are already in the plan and nothing else, so
 * planning can show a greenhouse task it was pointed at without being a way to read greenhouse. See the
 * header. There is deliberately no workspace parameter: filtering by one would be the wrong shape of
 * answer, because a week legitimately spans several and the reply names each row's project instead.
 */
export function resolveAllocated(
  // Anything that NAMES a record, which is an allocation here and a plan line in lib/plans.ts. It
  // was `readonly Allocation[]` and nothing in the body ever read another field; widening it is
  // what stops a second reader of the same rows being written beside this one, with the block-title
  // rule and the state-and-estimate reading copied into it.
  allocations: readonly { recordId: string }[],
): Map<string, AllocatedWork> {
  const ids = [...new Set(allocations.map((a) => a.recordId))]
  const found = new Map<string, AllocatedWork>()
  if (ids.length === 0) return found

  // IN PIECES (src/server/db/in-pieces.ts): a plan asks this of every record its lines are filed as,
  // and nothing caps how many lines a plan has. The rows go into a map by id; with no ORDER BY, the
  // map's order was SQLite's before and is SQLite's within each piece now.
  const rows = readInPieces(ids, (piece) => db.select().from(recordsTable).where(inArray(recordsTable.id, piece)).all())
  // WHICH PIPELINE EACH BLOCK IS IN, asked once for the whole page. It used to be cut off the front
  // of the block's own title, because a block's title carried its pipeline's; a decision ended
  // that, so the fact is read where it always really lived — the pipeline's
  // own order. A block no pipeline lists has no `within`, and that is a true answer rather than a
  // gap: it is drawn nowhere.
  const within = pipelineTitlesByBlock(rows.filter((row) => row.kind === BLOCK_KIND).map((row) => row.id))
  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, unknown>
    const reading = readWorkState(data)
    const rawState = reading.state
    const state = typeof rawState === 'string' ? rawState : null
    const effort = typeof data['effort_hours'] === 'number' ? data['effort_hours'] : null
    // THE RECORD'S OWN SHORTER WORDS, READ HERE BECAUSE THIS IS THE ONE READ OF THESE ROWS. A plan
    // line filed as this record draws the conclusion beside it and may take the label into itself,
    // and both are the record's own columns rather than a second copy kept on the line.
    const summary = typeof row.summary === 'string' && row.summary.trim() !== '' ? row.summary : null
    const label = readStoredShortForms(data[SHORT_FORMS_FIELD])['label']?.text ?? null
    found.set(row.id, {
      id: row.id,
      kind: row.kind as RecordKind,
      title: row.title,
      name: row.title,
      within: row.kind === BLOCK_KIND ? (within.get(row.id) ?? null) : null,
      workspaceId: row.workspaceId,
      state,
      stateSource: reading.source,
      effortHours: effort,
      origin: row.origin ?? null,
      deleted: row.deletedAt !== null,
      summary,
      label,
    })
  }
  return found
}

/** Pair each allocation with its work, keeping the ones whose record has gone. */
export function withWork(allocations: readonly Allocation[]): AllocationWithWork[] {
  const work = resolveAllocated(allocations)
  return allocations.map((allocation) => ({ allocation, work: work.get(allocation.recordId) ?? null }))
}

// ---------------------------------------------------------------- the same hours, counted twice

/**
 * IN ONE PERIOD, A PIECE OF WORK MAY HOLD AN ENVELOPE AND ITS PARTS MAY EXPLAIN SOME OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS READS, AND WHAT CHANGED ON 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * This function reads one period and says which of its rows hold work that is inside another row's
 * work. It has always done that. What changed is what the answer is FOR.
 *
 * Until round five it was a refusal. Hours went to a piece of work or to its parts and never to
 * both, and `createAllocation` refused the second one — because `loadOf` added the two rows, so
 * three hours on a task and two on a task inside it made the week report five hours for three hours
 * of work.
 *
 * Planning may be coarse first and refined later: 15 hours on a large piece of work this
 * week, then 5 on one part and 4 on another, with the rest not yet broken down. The refusal made
 * that impossible. So the refusal is gone and the arithmetic reads this instead: the hours on the
 * highest allocated piece of work are an envelope, the hours below explain part of it, and the tree
 * contributes the envelope to the week and never the sum. `envelopesOf` in shared/planning.ts is
 * that arithmetic, and this reading is its only input.
 *
 * WHAT DID NOT CHANGE. Two rows for the SAME record in the same period are still refused: they
 * cannot say whether they add up or correct each other, which is a different question from this one.
 *
 * ---------------------------------------------------------------------------------------
 * ONE WALK UPWARDS ANSWERS BOTH DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 * The rule is stated as "no ancestor and no descendant of this record may already hold hours here",
 * and it is computed by walking UP from every record that holds hours in the period and seeing which
 * of the others it meets. That finds both directions with one walk each: if B is inside A and both
 * hold hours, walking up from B reaches A. Walking down as well would be the same fact worked out
 * twice, and the two could then disagree about one pair.
 *
 * `shared/containment.ts` is the walk. This file does not know what containment is; it loads the
 * records and links that reader needs and asks it.
 *
 * ---------------------------------------------------------------------------------------
 * THE BOUNDARY IN THE HEADER STILL HOLDS: EVERY RECORD READ HERE IS BY PRIMARY KEY
 * ---------------------------------------------------------------------------------------
 *
 * The records this loads are the ones already named by allocations in the period, and then the
 * records those are part of, one at a time, by id. Nothing ranges over a workspace, and nothing a
 * caller typed reaches a record read. `tests/planning.test.ts` asserts that in the source.
 *
 * THE ONE READ THAT IS NOT BY ID is `pipelineHolding` in lib/records/pipeline-membership.ts, which finds the pipeline
 * whose stored order lists a block. It is the existing single statement of that fact — a block's
 * membership lives in its pipeline's `blockIds` and nowhere else — and it answers with ONE record
 * rather than a listing. Writing the scan again here would be the recurring defect; and its LIMIT is
 * written down rather than hidden: it looks at live pipelines only, so a chain running up through a
 * soft-deleted pipeline is not walked. A pipeline can never hold hours itself, so that matters only
 * for a deleted pipeline that is itself part of something that does.
 */

/** Every stored `part_of` link OUT of these records: what each of them says it is part of. */
function partOfLinksOutOf(ids: readonly string[]): ContainmentLink[] {
  if (ids.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): the walk asks for every record holding hours in a period
  // and then for what those are part of, and nothing caps either. With no ORDER BY, the order was
  // SQLite's before and is SQLite's within each piece now; all the links out of one record are in
  // one piece.
  return readInPieces(ids, (piece) =>
    db
      .select()
      .from(linksTable)
      .where(and(eq(linksTable.type, CONTAINMENT_LINK), inArray(linksTable.fromId, piece)))
      .all(),
  ).map((row) => ({ id: row.id, fromId: row.fromId, toId: row.toId, type: row.type }))
}

/**
 * Everything above these records, loaded for `ancestorsOf` to read.
 *
 * UPWARDS ONLY, because that is the only direction the rule needs — see the section header. It stops
 * one round past `MAX_CONTAINMENT_DEPTH`, which is one more level than the reader will walk; a chain
 * longer than that makes the reader answer `complete: false`, which is refused rather than trusted.
 *
 * A record whose row is gone is simply not in the answer. The reader then reports it as a record it
 * was not handed, which is how "Mole Office could not check this" reaches the caller instead of a guess.
 */
function containmentAbove(seedIds: readonly string[]): ContainmentContext {
  const loaded = new Map<string, PanelRecord>()
  const links = new Map<string, ContainmentLink>()
  const asked = new Set<string>()
  let frontier = [...new Set(seedIds)]

  for (let round = 0; frontier.length > 0 && round <= MAX_CONTAINMENT_DEPTH + 1; round += 1) {
    const above: string[] = []
    for (const id of frontier) {
      asked.add(id)
      const record = getRecord(id)
      if (record === null) continue
      loaded.set(id, record)
      // Only a block can be a step of a pipeline: `checkBlockIds` in lib/records/pipeline-blocks.ts refuses a
      // `blockIds` entry that names anything else, so asking for the other kinds would be a scan
      // per record that can never find anything.
      if (record.kind === BLOCK_KIND) {
        const holding = pipelineHolding(id)
        if (holding !== null) above.push(holding.id)
      }
    }
    for (const link of partOfLinksOutOf(frontier)) {
      links.set(link.id, link)
      above.push(link.toId)
    }
    frontier = [...new Set(above)].filter((id) => !asked.has(id))
  }
  return { records: [...loaded.values()], links: [...links.values()] }
}

/** One end of a pair: a record, and the hours it holds in the period being read. */
export interface CountedTwiceEnd {
  /** The record id. This is the identity; the title is only what to print. */
  id: string
  /** Its title, or plain words saying the record was not found. */
  title: string
  /**
   * Every allocation this record has in this period.
   *
   * A LIST RATHER THAN ONE ROW, and normally it holds exactly one: `createAllocation` refuses a
   * second allocation for the same record and period. A row written by hand can still break that,
   * and picking one of two to report would be a quiet choice about which of them is real.
   *
   * EMPTY means this record has no hours here yet — which is the record a write is asking about.
   */
  allocations: Allocation[]
}

/**
 * One place a period holds hours at two levels: hours on a record, and hours on a part of it.
 *
 * The name is older than what it means. See the section header: this is ordinary coarse-to-fine
 * planning now, and the name is kept only so that the surfaces reading it go on compiling.
 */
export interface CountedTwicePair {
  /** The record that holds the other. Its hours are the envelope over the work below it. */
  outer: CountedTwiceEnd
  /** The record inside it. Its hours explain part of the envelope above. */
  inner: CountedTwiceEnd
}

/** What a period's containment reading found, including what it could not read. */
export interface CountedTwice {
  horizon: Grain
  period: string
  /** Every pair where one record's hours are inside another's. Empty is the ordinary answer. */
  pairs: CountedTwicePair[]
  /**
   * Every record here whose containment could not be read, with the reader's own sentence.
   *
   * NOT EMPTY MEANS THE PAIRS ARE INCOMPLETE. A total built on this says what it could not count
   * rather than reporting a clean number over rows it could not read.
   */
  notChecked: { recordId: string; title: string; why: string }[]
}

/**
 * Which of this period's rows hold work inside another row's work, and what it could not read.
 *
 * `alsoCounting` names a record that has no hours here yet, so a caller can ask what its hours WOULD
 * make before making them. Without it, this reads the period exactly as stored.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READER OF CONTAINMENT FOR A PERIOD, DELIBERATELY
 * ---------------------------------------------------------------------------------------
 *
 * Every total in the product is built on this one answer. `loadOf` and `envelopesOf` in
 * shared/planning.ts arrange it into trees and count each tree once; a surface reporting a period
 * prints what it finds. A second reader would be one fact worked out twice, and the two could then
 * disagree about what a week costs.
 *
 * IT NO LONGER FEEDS A REFUSAL. Until 16 August 2026 `createAllocation` asked this and refused any
 * pair naming the record being written. That refusal is gone — see the section header — and this is
 * read by the arithmetic instead.
 */
export function hoursCountedTwiceIn(horizon: Grain, period: string, alsoCounting?: string): CountedTwice {
  const here = allocationsIn(horizon, period)
  const byRecord = new Map<string, Allocation[]>()
  for (const allocation of here) {
    const held = byRecord.get(allocation.recordId)
    if (held === undefined) byRecord.set(allocation.recordId, [allocation])
    else held.push(allocation)
  }
  const ids = [...byRecord.keys()]
  if (alsoCounting !== undefined && !byRecord.has(alsoCounting)) ids.push(alsoCounting)
  // One record cannot be inside itself, so there is nothing to read and nothing to load.
  if (ids.length < 2) return { horizon, period, pairs: [], notChecked: [] }

  const context = containmentAbove(ids)
  const byId = new Map(context.records.map((record) => [record.id, record]))
  const holdsHoursHere = new Set(ids)
  const end = (id: string): CountedTwiceEnd => ({
    id,
    title: byId.get(id)?.title ?? unloadedRecordName(id),
    allocations: byRecord.get(id) ?? [],
  })

  const pairs: CountedTwicePair[] = []
  const notChecked: CountedTwice['notChecked'] = []
  for (const id of ids) {
    const record = byId.get(id)
    if (record === undefined) {
      notChecked.push({
        recordId: id,
        title: unloadedRecordName(id),
        why: `No record has the id ${id}, so nothing can say what it is part of.`,
      })
      continue
    }
    const above = ancestorsOf(record, context)
    for (const step of above.steps) {
      if (holdsHoursHere.has(step.id)) pairs.push({ outer: end(step.id), inner: end(id) })
    }
    if (!above.complete) notChecked.push({ recordId: id, title: record.title, why: above.stopped })
  }
  return { horizon, period, pairs, notChecked }
}

/**
 * WHAT WAS HERE, AND WHY IT IS GONE.
 *
 * Four builders made the refusal a person read when hours were given to a piece of work and to a
 * part of it in one period: `endNamed`, `endHours`, `endRemoval` and `countedTwiceRefusal`. That
 * refusal was removed on 16 August 2026 to let planning be coarse first and refined later,
 * so nothing built it any more. They are deleted rather than left unused, because a sentence nobody
 * can reach is a sentence nobody maintains.
 *
 * TWO THINGS USED TO READ THAT WORDING AND BOTH WERE CHANGED WITH IT, on the same day.
 * `waysOutOf` in src/web/components/Planning.tsx read allocation ids out of the clause "take the
 * hours off …" and drew a press that deleted the row; it is deleted, and `Refusal` there now prints
 * the server's sentence and reads nothing out of it. tests/refusal-way-out.test.ts provokes the
 * refusals that remain and checks that every word of each one reaches the screen with no press
 * under it. Nothing anywhere reads a refusal sentence any more.
 */

// ---------------------------------------------------------------------------- writing

/** Refuse a horizon that is not one of the three, naming them. */
function checkGrain(horizon: string): Grain {
  if ((GRAINS as readonly string[]).includes(horizon)) return horizon as Grain
  throw new PanelError(`horizon must be one of: ${GRAINS.join(', ')}. It is "${horizon}".`)
}

/**
 * Refuse a period key that cannot be placed on a calendar, or that is not of this horizon.
 *
 * Both halves matter. `2026-W99` is not a week, and `2026-09` is a real key that is not a day — a
 * row holding either would make every total that reads it wrong in a way nothing could later
 * explain.
 */
function checkPeriod(horizon: Grain, period: string): string {
  const parsed = parsePeriod(period)
  if (parsed === null) {
    throw new PanelError(
      `"${period}" is not a period Mole Office can place on a calendar. A month is 2026-09, a week is ` +
        `2026-W36 (ISO-8601, Monday first), a day is 2026-09-07.`,
    )
  }
  if (parsed.horizon !== horizon) {
    throw new PanelError(
      `"${period}" is a ${parsed.horizon}, and this allocation says its horizon is ${horizon}. ` +
        `The key and the horizon have to be the same thing, or every total that reads them is wrong.`,
    )
  }
  return period
}

/** Refuse a number that is not usable as hours. Null is allowed and means nobody said. */
function checkHours(value: number | null | undefined, what: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isFinite(value) || value < 0) {
    throw new PanelError(`${what} must be a number of hours, zero or more. It is ${JSON.stringify(value)}.`)
  }
  // A week has 168 hours in it. Anything above that is a typo — 80 instead of 8.0 — and a plan built
  // on it would be arithmetic nobody could read.
  if (value > 168) {
    throw new PanelError(
      `${what} is ${value}, which is more hours than there are in a week. If that is really what you ` +
        `meant, split it across periods; a single allocation that large makes every total unreadable.`,
    )
  }
  return value
}

/**
 * The work exists, and it is a kind a plan may give time to.
 *
 * BY PRIMARY KEY AND WITHOUT A WORKSPACE, which is the point: a plan may name work in any project.
 * A soft-deleted record is refused — allocating time to something that has been deleted is a
 * mistake worth catching at the moment it is made rather than showing as a hole in next week's plan.
 */
function checkAllocatable(recordId: string): { kind: string; title: string; workspaceId: string } {
  const row = db.select().from(recordsTable).where(eq(recordsTable.id, recordId)).get()
  if (row === undefined) {
    throw new PanelError(`No record has the id "${recordId}", so there is nothing to give time to.`, 404)
  }
  if (row.deletedAt !== null) {
    throw new PanelError(
      `"${row.title}" has been deleted, so time cannot be planned against it. Restore it first if the ` +
        `plan is right.`,
    )
  }
  if (!(ALLOCATABLE_KINDS as readonly string[]).includes(row.kind)) {
    // THE REASON COMES OUT OF THE TABLE, one per kind. It used to be two sentences for eleven kinds
    // — one for a container and one for everything else — so somebody who tried to plan a `claim`
    // was told to file a task and never told what was wrong with planning a claim.
    // "a idea" is what this said until 2026-08-14. Five of the sixteen kinds start with a vowel.
    const a = /^[aeiou]/i.test(row.kind) ? 'an' : 'a'
    throw new PanelError(
      `A plan gives time to work, and ${a} ${row.kind} is not one of the kinds it can: ` +
        `${ALLOCATABLE_KINDS.join(', ')}. Why not: ${planHoursRuleOf(row.kind).why}`,
    )
  }
  return { kind: row.kind, title: row.title, workspaceId: row.workspaceId }
}

export interface NewAllocation {
  horizon: string
  period: string
  recordId: string
  plannedHours?: number | null
  note?: string | null
}

/**
 * Give a piece of work some time in a period.
 *
 * ONE ALLOCATION PER RECORD PER PERIOD, and a second one is refused rather than added beside it.
 * Two rows saying "Monday, this task, 2 hours" and "Monday, this task, 3 hours" is five hours by
 * one reading and a correction by another, and nothing stored could tell them apart. The refusal
 * names the existing row so the caller can change it instead.
 *
 * A PARENT AND ITS PARTS MAY BOTH HOLD HOURS HERE, and that used to be refused. The owner plans
 * coarse first and refines later, so 15 hours on a large piece of work and then 5 and 4 on parts of
 * it is an ordinary week. The arithmetic reads it as an envelope with 9 hours assigned inside it and
 * 6 not yet broken down; it is never 24 hours. See the section above, and `envelopesOf` in
 * shared/planning.ts.
 */
export function createAllocation(input: NewAllocation, actor: Actor): Allocation {
  // THE HOURS ARE THE PERSON'S, ASKED AT THE ONE DOOR EVERY PATH GOES THROUGH. Measured on 15
  // September 2026 as problem pOTggQdXY6AZ: this function had no actor-type check, so the plan's
  // give-time door wrote hours for an agent while the intent-commit door refused the same act. The
  // clause is not restated here — it is `assertMayCommitTheHours` in lib/records/asks-and-commitments.ts, the same
  // sentence `assertMayCommitAnIntent` speaks, so the two doors cannot drift apart again.
  assertMayCommitTheHours(
    actor,
    'Nothing was scheduled: no hours were written, no capacity was used, and no total moved.',
  )
  const horizon = checkGrain(input.horizon)
  const period = checkPeriod(horizon, input.period)
  const work = checkAllocatable(input.recordId)
  const plannedHours = checkHours(input.plannedHours, 'plannedHours')

  const existing = db
    .select()
    .from(allocationsTable)
    .where(
      and(
        eq(allocationsTable.horizon, horizon),
        eq(allocationsTable.period, period),
        eq(allocationsTable.recordId, input.recordId),
      ),
    )
    .get()
  if (existing !== undefined) {
    throw new PanelError(
      // THE WAY OUT IS A SCREEN AND A PRESS, NOT A REQUEST. This ended
      // `PATCH /api/planning/allocations/<id> changes it.`, which is the one thing a person reading
      // it cannot do — and deliberately offers NO removal clause, because the row is to be changed
      // and not deleted. The browser reads nothing out of this sentence — it prints it whole — so
      // no press is drawn under a sentence that says to change something.
      `"${work.title}" already has an allocation in ${period} (${existing.id}, ` +
        `${existing.plannedHours === null ? 'no hours stated' : `${existing.plannedHours}h`}). A second one ` +
        `would be two rows that cannot say whether they add up or correct each other. ` +
        `Change the row it already has instead. Open ${period} under Schedule, press "${PLAN_PRESS[horizon]}" at the top ` +
        `right, and set the hours on its row.`,
      409,
    )
  }

  // NOTHING IS ASKED HERE ABOUT WHAT CONTAINS WHAT, and that is the change of 16 August 2026. A
  // parent and its parts may both hold hours in one period, because that is how the owner plans. The
  // period's own arithmetic reads containment and counts the tree once; a row whose containment
  // cannot be read is named in the total rather than refused at this door.

  const stamp = nowStamp()
  const row = {
    id: anOfficeId(),
    horizon,
    period,
    recordId: input.recordId,
    plannedHours,
    actualHours: null,
    state: 'planned' as const,
    note: input.note ?? null,
    // Null here means nobody planned this in a document. `lib/plans.ts` sets it, in the same
    // transaction as this insert, when the hours came from pressing "Give it time" on a plan line.
    fromPlanLine: null,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: `${actor.type}:${actor.id}`,
  }
  db.insert(allocationsTable).values(row).run()
  return toAllocation(row)
}

export interface AllocationPatch {
  plannedHours?: number | null
  actualHours?: number | null
  state?: string
  note?: string | null
}

/**
 * Change an allocation.
 *
 * **Setting `state` to `done` completes THIS SLICE OF TIME AND NOTHING ELSE.** It does not touch the
 * record it names, and that is the settled owner decision of 2026-08-12 rather than an unfinished
 * feature: work larger than a day is the normal case, so a plan that closed the task would be wrong
 * most of the time. Canonical completion stays an explicit change to the record, through the record
 * routes, by somebody who means it.
 */
export function patchAllocation(id: string, patch: AllocationPatch, actor: Actor): Allocation {
  const existing = db.select().from(allocationsTable).where(eq(allocationsTable.id, id)).get()
  if (existing === undefined) throw new PanelError(`No allocation has the id "${id}".`, 404)

  const next: Partial<AllocationRow> = { updatedAt: nowStamp() }
  if ('plannedHours' in patch) next.plannedHours = checkHours(patch.plannedHours, 'plannedHours')
  if ('actualHours' in patch) next.actualHours = checkHours(patch.actualHours, 'actualHours')
  if ('note' in patch) next.note = patch.note ?? null
  if (patch.state !== undefined) {
    if (!(ALLOCATION_STATES as readonly string[]).includes(patch.state)) {
      throw new PanelError(`state must be one of: ${ALLOCATION_STATES.join(', ')}. It is "${patch.state}".`)
    }
    next.state = patch.state
  }
  void actor
  db.update(allocationsTable).set(next).where(eq(allocationsTable.id, id)).run()
  const after = db.select().from(allocationsTable).where(eq(allocationsTable.id, id)).get()
  return toAllocation(after as AllocationRow)
}

/** Take an allocation off the plan entirely. The work is untouched. */
export function deleteAllocation(id: string): Allocation {
  const existing = db.select().from(allocationsTable).where(eq(allocationsTable.id, id)).get()
  if (existing === undefined) throw new PanelError(`No allocation has the id "${id}".`, 404)
  db.delete(allocationsTable).where(eq(allocationsTable.id, id)).run()
  return toAllocation(existing)
}

// ---------------------------------------------------------------------------- capacity

export interface Capacity {
  horizon: Grain
  period: string
  hours: number
  note: string | null
  updatedAt: string
}

/**
 * How many hours a period holds, or `null` when nobody has said.
 *
 * NULL IS NOT A FULL WORKING WEEK. Every reader treats it as unknown and answers null for the
 * numbers that would need it, because a default capacity would report a week as fitting when the
 * truth is that nobody has looked at it.
 */
export function capacityOf(horizon: Grain, period: string): Capacity | null {
  const row = db
    .select()
    .from(planningCapacity)
    .where(and(eq(planningCapacity.horizon, horizon), eq(planningCapacity.period, period)))
    .get()
  if (row === undefined) return null
  return { horizon: row.horizon as Grain, period: row.period, hours: row.hours, note: row.note, updatedAt: row.updatedAt }
}

/**
 * Take back what a period holds, so "nobody has said" is reachable again.
 *
 * ABSENT IS A REAL ANSWER IN THIS PRODUCT and it was the one answer a person could not get back to.
 * An independent reviewer typed a number into a week to see what the control did, and then found
 * there was no way to remove it: no browser control, no DELETE route, and `hours: null` refused by
 * the schema, which is right — a capacity of null is not a capacity of nothing. So a number typed by
 * mistake was permanent, on the one field whose whole doctrine is that unknown must stay reachable.
 *
 * Returns whether a row was really there, because "removed" and "there was nothing to remove" are
 * different answers and the caller should be able to say which happened.
 */
export function clearCapacity(grainInput: string, periodInput: string): { removed: boolean } {
  const horizon = checkGrain(grainInput)
  const period = checkPeriod(horizon, periodInput)
  const existing = capacityOf(horizon, period)
  if (existing === null) return { removed: false }
  db.delete(planningCapacity)
    .where(and(eq(planningCapacity.horizon, horizon), eq(planningCapacity.period, period)))
    .run()
  return { removed: true }
}

/** Say how many hours a period holds. Writing it again replaces it; there is one answer per period. */
/**
 * How many hours a period holds, and what somebody called it.
 *
 * `note` HAS THREE VALUES AND THEY MEAN THREE THINGS. `undefined` — the caller did not mention the
 * note — LEAVES THE STORED ONE ALONE. `null` clears it. A string replaces it.
 *
 * That distinction was bought at a cost. Absence used to mean null, so the browser's hours control,
 * which sends only a number, silently erased the label every time somebody adjusted a week: an
 * independent reviewer typed 30 into a week that already held 30, pressed the button, and "Mole
 * Office development, this week" was gone with nothing on screen saying so. Nothing in the UI could
 * put it back. Invariant 5 of USER.md is what decides it — absence is a real answer and it is not
 * the same answer as "clear this".
 */
export function setCapacity(
  grainInput: string,
  periodInput: string,
  hours: number,
  note: string | null | undefined,
  actor: Actor,
): Capacity {
  const horizon = checkGrain(grainInput)
  const period = checkPeriod(horizon, periodInput)
  const checked = checkHours(hours, 'hours')
  if (checked === null) throw new PanelError('hours is required: this route says how many hours a period holds.')

  const kept = note === undefined ? (capacityOf(horizon, period)?.note ?? null) : note
  const row = {
    horizon,
    period,
    hours: checked,
    note: kept,
    updatedAt: nowStamp(),
    updatedBy: `${actor.type}:${actor.id}`,
  }
  db.insert(planningCapacity)
    .values(row)
    .onConflictDoUpdate({
      target: [planningCapacity.horizon, planningCapacity.period],
      set: { hours: row.hours, note: row.note, updatedAt: row.updatedAt, updatedBy: row.updatedBy },
    })
    .run()
  return { horizon, period, hours: checked, note: kept, updatedAt: row.updatedAt }
}

// ------------------------------------------------------------ what a person wrote about time

/**
 * WHAT SOMEBODY WROTE ABOUT TIME, AND WHAT MOLE OFFICE MADE OF IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE LAYERS, AND WHY ONLY THE LAST ONE COUNTS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's eighth rule: a person may write what they mean, Mole Office stores only what it can
 * defend, and what it made of their words is shown back to them. This is the middle of that. `said`
 * is what they wrote, kept byte for byte. `horizon`, `period` and `hours` are what was read from it,
 * and they are empty when nothing could be read honestly.
 *
 * `state` says how far it got:
 *
 *     kept        the words are stored and nothing was interpreted
 *     offered     an interpretation was made and waits for a person
 *     committed   it became an allocation, which is the canonical row
 *
 * NOTHING BUT `committed` EVER ENTERS ARITHMETIC. Every total in this product reads `allocations`
 * and none of them reads this table. `tests/planning-intent.test.ts` is the test that fails if that
 * ever stops being true, and it is the load-bearing test of this layer: an interpretation that
 * quietly joined a week's hours would be Mole Office claiming the interpretation had happened.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES TWO OF THESE THE SAME THING: THE PLAN LINE
 * ---------------------------------------------------------------------------------------
 *
 * A plan line has ONE answer to "when". It has one size, one note and one project the same way, and
 * the Table draws one box for each. So writing time for a line REPLACES what that line last said
 * about time instead of adding a second answer beside it — see `createIntent`, which does the
 * replacing, and `deleteIntent`, which is how a person takes one off.
 *
 * THIS WAS MEASURED, and the measurement is why the rule exists. Driving the owner's own path once
 * left two rows saying "next week": one written when they typed it into the table with a week button
 * pressed, and one written when filing the line moved `{time: next week}` out of its words. They
 * carried DIFFERENT readings — 2026-W33 and 2026-W34 — and the schedule drew both, so the product
 * showed one phrase they had typed once as two different weeks, with no way to remove either.
 *
 * A COMMITTED INTENT IS NEVER REPLACED AND NEVER REMOVED. It is where an allocation came from, so
 * dropping it would delete the provenance of a canonical row; the way to undo one is to delete the
 * allocation. Only `kept` and `offered` are the line's current answer.
 *
 * AN INTENT THAT NAMES NO LINE IS LEFT ALONE. The line is what makes two writes the same write.
 * Words written about a record from somewhere else are separate statements by separate people at
 * separate times, and Mole Office has nothing that says one replaces another.
 */
export const INTENT_STATES = ['kept', 'offered', 'committed'] as const
export type IntentState = (typeof INTENT_STATES)[number]

export interface PlanningIntent {
  id: string
  /** What the person wrote, exactly as they wrote it. */
  said: string
  /** The work this is about, or null because it is not about a record yet. */
  recordId: string | null
  /** The plan line it was written on, or null. A line may hold time before it is filed as work. */
  planLineId: string | null
  /** What was read from the words, or null on all three when nothing was read. */
  horizon: Grain | null
  period: string | null
  hours: number | null
  state: IntentState
  createdAt: string
  createdBy: string
}

/** What the words name when read on the day they were written, and whether that is the stored period. */
export interface IntentPeriodReading {
  /** The period named by the words, or null when they name none. */
  period: string | null
  /** True only when the words name the same period held by the intent. */
  namesStoredPeriod: boolean
}

/** An intent returned to a page that needs to explain where its period came from. */
export interface PlanningIntentWithPeriodReading extends PlanningIntent {
  periodReading: IntentPeriodReading
}

type IntentRow = typeof planningIntents.$inferSelect

const toIntent = (row: IntentRow): PlanningIntent => ({
  id: row.id,
  said: row.said,
  recordId: row.recordId,
  planLineId: row.planLineId,
  horizon: row.horizon === null ? null : (row.horizon as Grain),
  period: row.period,
  hours: row.hours,
  state: row.state as IntentState,
  createdAt: row.createdAt,
  createdBy: row.createdBy,
})

/** Every intent, newest first, or the ones written on one line or about one record. */
export function listIntents(filter: { recordId?: string; planLineId?: string } = {}): PlanningIntent[] {
  const rows = db.select().from(planningIntents).all().map(toIntent)
  return rows
    .filter((row) => filter.recordId === undefined || row.recordId === filter.recordId)
    .filter((row) => filter.planLineId === undefined || row.planLineId === filter.planLineId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1))
}

export function getIntent(id: string): PlanningIntent | null {
  const row = db.select().from(planningIntents).where(eq(planningIntents.id, id)).get()
  return row === undefined ? null : toIntent(row)
}

export interface NewIntent {
  /** The words. Required, because the words are the point of the row. */
  said: string
  recordId?: string | null
  planLineId?: string | null
  /**
   * The interpretation, when the caller already has one. Left out, the words are read for it.
   *
   * A person may speak the canonical form and so may an agent, and that is allowed — it is just
   * never the requirement. Whatever arrives is checked exactly as an allocation's would be.
   */
  period?: string | null
  hours?: number | null
}

/** What creating an intent did, including what was read from the words and what was not. */
export interface IntentMade {
  intent: PlanningIntent
  /** What Mole Office made of the words, in a sentence, or why it made nothing. Always something. */
  interpretation: string
  /**
   * The words this line said about time BEFORE, which this write replaced. Empty when there were none.
   *
   * NEVER SILENT. A line holds one answer about time, so writing a new one takes the old one away,
   * and a person who is not told that cannot tell a replacement from a second row they now have to
   * find and remove. See the header above for why a line is what makes two writes the same write.
   */
  replaced: PlanningIntent[]
}

/**
 * Keep what somebody wrote about time, with an interpretation only when one can be made honestly.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS STRICT HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The WORDS are not judged at all. `sometime next week` is stored and answered with a sentence
 * saying nothing has been scheduled from it yet, which is a complete and honest answer.
 *
 * The INTERPRETATION is as strict as a stored allocation, because that is what it may become. A
 * period key is read by `parsePeriod` and refused if it is not one; hours go through `checkHours`; a
 * record id has to name a record that is really there. A caller cannot put a period in this table
 * that nothing could place on a calendar.
 *
 * NOTHING WRITTEN HERE COUNTS AS TIME PLANNED. No allocation is made, no capacity is used, and no
 * total moves. `commitIntent` is the only way from these words to a canonical row.
 *
 * IT REPLACES WHAT THE LINE LAST SAID ABOUT TIME. When the words are written on a plan line, the
 * words that line was already holding are removed in the same transaction and handed back in
 * `replaced`. The header above holds the rule and the measurement behind it.
 */
export function createIntent(input: NewIntent, actor: Actor): IntentMade {
  const said = input.said
  if (said.trim() === '') {
    throw new PanelError('An intent needs the words somebody wrote. There is nothing here to keep.')
  }

  if (input.recordId !== undefined && input.recordId !== null) {
    // BY PRIMARY KEY, like every other record read in this file. It says the work exists; it does
    // NOT say a plan may give it hours, because the words are worth keeping either way and that
    // question belongs at the moment somebody commits.
    const record = getRecord(input.recordId)
    if (record === null) {
      throw new PanelError(`No record has the id "${input.recordId}", so there is nothing to write this about.`, 404)
    }
  }

  if (input.planLineId !== undefined && input.planLineId !== null) {
    const line = db.select().from(planLinesTable).where(eq(planLinesTable.id, input.planLineId)).get()
    if (line === undefined) {
      throw new PanelError(`No plan line has the id "${input.planLineId}".`, 404)
    }
  }

  // WHAT THE WORDS SAY, when the caller did not say it themselves. `readTimeWords` returns a period
  // or nothing and never a guess — see shared/planning.ts.
  const createdAt = nowStamp()
  const read = readTimeWords(said, new Date(createdAt))
  const givenPeriod = input.period ?? null
  const period = givenPeriod === null ? (read.period.read ? read.period.period.key : null) : checkAnyPeriod(givenPeriod)
  const horizon = period === null ? null : (parsePeriod(period)?.horizon ?? null)
  const hours =
    input.hours === undefined || input.hours === null
      ? read.hours.read
        ? checkHours(read.hours.hours, 'hours')
        : null
      : checkHours(input.hours, 'hours')

  // OFFERED MEANS THERE IS SOMETHING TO ACCEPT. Without a period nothing could become an
  // allocation, however many hours were read, so the row stops at the words.
  const state: IntentState = period === null ? 'kept' : 'offered'

  const row: IntentRow = {
    id: anOfficeId(),
    // STORED EXACTLY AS TYPED. No trim, no normalising: what a person wrote is what comes back.
    said,
    recordId: input.recordId ?? null,
    planLineId: input.planLineId ?? null,
    horizon,
    period,
    hours,
    state,
    createdAt,
    createdBy: `${actor.type}:${actor.id}`,
  }

  // ONE LINE, ONE ANSWER ABOUT TIME. Whatever this line said before is removed and handed back, in
  // the same transaction as the write, so a reader never sees the line holding two answers and a
  // failure here cannot leave it holding none.
  const line = input.planLineId ?? null
  let replaced: PlanningIntent[] = []
  sqlite.transaction(() => {
    // READ INSIDE THE TRANSACTION, so what is handed back as replaced is what was really deleted
    // rather than what was there a moment before the write.
    replaced = line === null ? [] : keptWordsOfLine(line)
    for (const old of replaced) db.delete(planningIntents).where(eq(planningIntents.id, old.id)).run()
    db.insert(planningIntents).values(row).run()
  })()
  return { intent: toIntent(row), interpretation: interpretationOf(toIntent(row), read), replaced }
}

/**
 * WHAT ONE PLAN LINE IS SAYING ABOUT TIME NOW: its kept and offered intents, oldest first.
 *
 * Committed ones are left out on purpose. A committed intent became an allocation, and that
 * allocation is what the line has now — reading it back here as well would show one lot of hours as
 * two things.
 *
 * IT IS A LIST AND NOT ONE ROW, although `createIntent` now keeps it to one. Databases written
 * before that rule existed hold more, and this installation's own corpus is one of them. Handing
 * back one of two rows would be Mole Office picking which of somebody's two sentences it liked, so it
 * hands back both and every surface can offer to remove either.
 */
export function keptWordsOfLine(planLineId: string): PlanningIntent[] {
  return db
    .select()
    .from(planningIntents)
    .where(eq(planningIntents.planLineId, planLineId))
    .all()
    .map(toIntent)
    .filter((intent) => intent.state !== 'committed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : 1))
}

/**
 * The kept and offered words of several lines at once, by line id. One read, whatever the plan holds.
 *
 * A plan of two hundred lines is an ordinary plan, so the plan read asks for every line's words in
 * one query rather than one query per line. It is the same filter and the same order as
 * `keptWordsOfLine`, because it calls neither a second copy of them nor a second query shape.
 */
export function keptWordsOfLines(planLineIds: readonly string[]): Map<string, PlanningIntent[]> {
  const answer = new Map<string, PlanningIntent[]>()
  if (planLineIds.length === 0) return answer
  // IN PIECES (src/server/db/in-pieces.ts): a plan asks this of every line it holds, and nothing caps
  // how many lines a plan has. The sort below runs after every piece is read.
  const rows = readInPieces(planLineIds, (piece) =>
    db.select().from(planningIntents).where(inArray(planningIntents.planLineId, piece)).all(),
  )
    .map(toIntent)
    .filter((intent) => intent.state !== 'committed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : 1))
  for (const intent of rows) {
    if (intent.planLineId === null) continue
    const held = answer.get(intent.planLineId)
    if (held === undefined) answer.set(intent.planLineId, [intent])
    else held.push(intent)
  }
  return answer
}

/**
 * WHAT MOLE OFFICE MADE OF WORDS IT ALREADY HOLDS, in the sentence a screen prints beside them.
 *
 * The same sentence `createIntent` answers with, worked out from the stored row rather than written
 * a second time. Two sentences saying what Mole Office made of one phrase is the defect this repository
 * keeps finding: the plan page would say one thing and the receipt another, and nothing would fail.
 */
export function readingOfIntent(intent: PlanningIntent): string {
  return interpretationOf(intent, wordsReadAtCreation(intent))
}

/**
 * Read the words on the date stored with them, then say whether they name this intent's period.
 * The optional reading is already in hand when `interpretationOf` also needs its hour reading.
 */
export function periodReadingOfIntent(
  intent: PlanningIntent,
  read: ReturnType<typeof readTimeWords> = wordsReadAtCreation(intent),
): IntentPeriodReading {
  const period = read.period.read ? read.period.period.key : null
  return { period, namesStoredPeriod: intent.period !== null && period === intent.period }
}

function wordsReadAtCreation(intent: PlanningIntent): ReturnType<typeof readTimeWords> {
  // READ AS OF THE DAY THEY WERE WRITTEN. "this week" written in 2026-W33 means 2026-W33, and read
  // today it would name another week, so the sentence below would call a period that was read from
  // the words one that was not.
  const written = parseLocalStamp(intent.createdAt)
  if (written === null) {
    throw new PanelError(
      `The words "${intent.said}" (${intent.id}) carry the time they were written as "${intent.createdAt}", ` +
        'which is not a time Mole Office wrote. Nothing can say what they read as on that day.',
      500,
    )
  }
  return readTimeWords(intent.said, new Date(written))
}

/**
 * SAY THAT SOME KEPT WORDS ARE ABOUT THIS PIECE OF WORK NOW. Nothing is created and nothing is read.
 *
 * A person writes time on a line before deciding the line is work — that is the ordinary order, and
 * it is why an intent may name a line and no record at all. When the line is later filed or pointed
 * at work, the words they kept are about THAT work: they were written on the line and the line names
 * it. Without this the words stay attached to nothing, and `commitIntent` refuses them for ever
 * because hours from them would point at nothing.
 *
 * IT NEVER TOUCHES A COMMITTED ONE, for the reason in the header: that row says where an allocation
 * came from, and moving it would make the allocation's provenance say something else.
 *
 * IT CREATES NOTHING. A line with no kept words gets no words invented for it, and the empty list
 * that comes back is how a caller knows there were none.
 *
 * IT TAKES NO ACTOR AND WRITES NO STAMP. Nothing about the words changed — not one character, and
 * not who wrote them. Restamping them as written by whoever pressed "file this line" would report a
 * person's own sentence as somebody else's edit.
 */
export function keptWordsNowAbout(planLineId: string, recordId: string): PlanningIntent[] {
  const moved = keptWordsOfLine(planLineId).filter((intent) => intent.recordId !== recordId)
  if (moved.length === 0) return []
  db.update(planningIntents)
    .set({ recordId })
    .where(inArray(planningIntents.id, moved.map((intent) => intent.id)))
    .run()
  // WHAT THEY SAY NOW, read back rather than the copies this function was holding, so the caller is
  // told what is stored and not what was expected.
  return moved.map((intent) => getIntent(intent.id)).filter((intent): intent is PlanningIntent => intent !== null)
}

/**
 * REMOVE ONE PIECE OF KEPT WRITING: kept writing has a way out.
 *
 * A COMMITTED ONE IS REFUSED AND THE REFUSAL SAYS WHAT TO DO INSTEAD. Its hours are a stored
 * allocation; taking the words away would leave that allocation with no account of where it came
 * from, which is the fifth rule broken by a delete button.
 */
export function deleteIntent(id: string): PlanningIntent {
  const intent = getIntent(id)
  if (intent === null) throw new PanelError(`No intent has the id "${id}".`, 404)
  if (intent.state === 'committed') {
    throw new PanelError(
      `"${intent.said}" has already been committed, and its hours are the time this work has in ` +
        `${intent.period}. Removing the words would leave those hours with nothing saying where they came ` +
        'from. Nothing was removed. Take the hours off that period instead.',
      409,
    )
  }
  db.delete(planningIntents).where(eq(planningIntents.id, id)).run()
  return intent
}

/** A period key of any horizon, checked. The horizon comes from the key, so the two cannot disagree. */
function checkAnyPeriod(period: string): string {
  const parsed = parsePeriod(period)
  if (parsed === null) {
    throw new PanelError(
      `"${period}" is not a period Mole Office can place on a calendar. A month is 2026-09, a week is ` +
        `2026-W36 (ISO-8601, Monday first), a day is 2026-09-07.`,
    )
  }
  return period
}

/** What Mole Office made of somebody's words, in a sentence they can read. Never silent about a gap. */
function interpretationOf(intent: PlanningIntent, read: ReturnType<typeof readTimeWords>): string {
  const periodReading = periodReadingOfIntent(intent, read)
  if (intent.state === 'committed') {
    return `Committed. ${intent.period} now gives this work ${intent.hours === null ? 'time without saying how long for' : `${intent.hours} hours`}.`
  }
  if (intent.period === null) {
    const why = read.period.read ? '' : ` ${read.period.why}`
    return (
      `Your words are kept exactly as you wrote them. Nothing has been scheduled from them yet.${why}` +
      (intent.hours === null ? '' : ` Mole Office did read ${intent.hours} hours, and hours alone cannot make a plan.`)
    )
  }
  const hours =
    intent.hours === null
      ? 'It says no number of hours, so committing it would give the work time here without saying how long for.'
      : `It reads ${intent.hours} hours.`
  // A PERIOD BESIDE THE WORDS IS NOT ALWAYS ONE READ FROM THEM (problem bZ571Mf18WTT). The plan
  // table's hours box sends the period whose button was pressed, and the words beside it may name no
  // period at all. The column holds either, so the sentence claims a reading only when the words,
  // read on the day they were written, name this same period. Otherwise it says what the words read
  // as, and claims nothing about where the period came from.
  const readHere = periodReading.namesStoredPeriod
  const period = readHere
    ? `Mole Office read this as ${intent.period}.`
    : `This is for ${intent.period}. The words themselves do not name it: ` +
      (periodReading.period !== null
        ? `Mole Office reads them as ${periodReading.period}.`
        : 'Mole Office reads no period in them.')
  return (
    `${period} ${hours} ` +
    (readHere
      ? 'Nothing has been scheduled yet: this is what Mole Office made of your words, and it waits for you.'
      : 'Nothing has been scheduled yet: it waits for you to commit it.')
  )
}

/** What committing an intent did. */
export interface IntentCommitted {
  intent: PlanningIntent
  allocation: Allocation
  note: string
}

/**
 * Turn an intent into the canonical row: one ordinary allocation.
 *
 * ---------------------------------------------------------------------------------------
 * THE SAME DOOR EVERYTHING ELSE USES
 * ---------------------------------------------------------------------------------------
 *
 * It calls `createAllocation`, so the kind check, the period check, the hours check and the
 * one-row-per-record-per-period rule all apply exactly as they do to any other write. There is no
 * second way into `allocations` and there must never be one — an agent whose input was already
 * structured goes through this same function, which is the rule that agents get no separate
 * door.
 *
 * IT REFUSES RATHER THAN GUESSING. An intent with no period cannot be committed, because committing
 * it would mean choosing a week nobody named. An intent about no record cannot be committed either:
 * a plan line that has not been filed as work has nothing for the hours to point at. Both refusals
 * say what is missing and leave the words exactly where they were.
 */
export function commitIntent(id: string, actor: Actor): IntentCommitted {
  const intent = getIntent(id)
  if (intent === null) throw new PanelError(`No intent has the id "${id}".`, 404)
  // WHO MAY DO THIS, asked through `assertMayCommitAnIntent` in lib/records/asks-and-commitments.ts and not restated here.
  //
  // This function took an `Actor` and never looked at it. Measured on 25 August 2026 as
  // `x-mole-office-actor-type: agent`, POST /api/planning/intents/JeYItSlU1uSg/commit answered 201 and
  // wrote a week of the owner's time into the allocations table. Owner decision §36 names planning
  // approval and apply among the acts needing an explicit person; for apply that was built, in
  // api/planning.ts, and for commit it was not.
  //
  // ASKED AFTER THE 404 AND BEFORE EVERYTHING ELSE, so the refusal can quote the words that would
  // have been scheduled and so that nothing about the intent is written or read first.
  assertMayCommitAnIntent(intent, actor)
  if (intent.state === 'committed') {
    throw new PanelError(
      `This intent has already been committed, so there is nothing left to do with it. ` +
        `Its hours are in ${intent.period}.`,
      409,
    )
  }
  if (intent.period === null) {
    throw new PanelError(
      `Mole Office read no period from "${intent.said}", so there is nothing to commit. Your words are kept ` +
        `exactly as they are. Say which day, week or month you meant, and Mole Office will schedule it.`,
      409,
    )
  }
  if (intent.recordId === null) {
    throw new PanelError(
      `This is written about no piece of work, so hours from it would point at nothing. A plan line has ` +
        `to be filed as work before its time can be scheduled. Your words are kept exactly as they are.`,
      409,
    )
  }

  const horizon = intent.horizon ?? parsePeriod(intent.period)?.horizon
  if (horizon === undefined || horizon === null) {
    // Only reachable from a row written by hand: `createIntent` reads the horizon off the key.
    throw new PanelError(
      `The stored period "${intent.period}" on this intent has no horizon beside it, so nothing can say ` +
        `whether it is a day, a week or a month. Nothing was committed.`,
      409,
    )
  }

  const allocation = createAllocation(
    { horizon, period: intent.period, recordId: intent.recordId, plannedHours: intent.hours },
    actor,
  )
  db.update(planningIntents).set({ state: 'committed' }).where(eq(planningIntents.id, id)).run()
  const after = getIntent(id)
  return {
    intent: after ?? { ...intent, state: 'committed' },
    allocation,
    note:
      `"${intent.said}" is now ${allocation.plannedHours === null ? 'time in' : `${allocation.plannedHours} hours in`} ` +
      `${allocation.period}. Your words are kept beside it, unchanged, because they are what you wrote and the ` +
      `allocation is what Mole Office made of them.`,
  }
}

// ---------------------------------------------------------------------------- what comes round

/** How often work comes round. Three shapes and no grammar — see the table's own header. */
export const RECURS = ['daily', 'weekly', 'weekdays'] as const
export type Recurs = (typeof RECURS)[number]

export interface Recurrence {
  id: string
  recordId: string
  every: Recurs
  /** ISO weekday numbers for `weekdays`, 1 = Monday. Null for the other two. */
  days: number[] | null
  hoursEach: number | null
}

type RecurrenceRow = typeof planningRecurrences.$inferSelect

const toRecurrence = (row: RecurrenceRow): Recurrence => ({
  id: row.id,
  recordId: row.recordId,
  every: row.every as Recurs,
  days: row.days === null ? null : row.days.split(',').map(Number),
  hoursEach: row.hoursEach,
})

export function listRecurrences(): Recurrence[] {
  return db.select().from(planningRecurrences).all().map(toRecurrence)
}

/**
 * Say that a piece of work comes round.
 *
 * It creates no allocation. The occurrences are made when a day or a week is planned, which is what
 * keeps §34 true of a routine: completing today's login completes today's allocation, and the
 * recurring source is untouched and comes round tomorrow.
 */
export function createRecurrence(
  input: { recordId: string; every: string; days?: string | null; hoursEach?: number | null },
  actor: Actor,
): Recurrence {
  if (!(RECURS as readonly string[]).includes(input.every)) {
    throw new PanelError(`every must be one of: ${RECURS.join(', ')}. It is "${input.every}".`)
  }
  checkAllocatable(input.recordId)
  const hoursEach = checkHours(input.hoursEach, 'hoursEach')
  let days: string | null = null
  if (input.every === 'weekdays') {
    const parsed = (input.days ?? '')
      .split(',')
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d))
    if (parsed.length === 0 || parsed.some((d) => d < 1 || d > 7)) {
      throw new PanelError(
        'every: "weekdays" needs `days` — ISO weekday numbers, 1 = Monday to 7 = Sunday, comma separated. ' +
          'Without them nothing could say which days it comes round on.',
      )
    }
    days = [...new Set(parsed)].sort().join(',')
  }
  const stamp = nowStamp()
  const row: RecurrenceRow = {
    id: anOfficeId(),
    recordId: input.recordId,
    every: input.every,
    days,
    hoursEach,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: `${actor.type}:${actor.id}`,
  }
  db.insert(planningRecurrences).values(row).run()
  return toRecurrence(row)
}

export function deleteRecurrence(id: string): Recurrence {
  const existing = db.select().from(planningRecurrences).where(eq(planningRecurrences.id, id)).get()
  if (existing === undefined) throw new PanelError(`No recurrence has the id "${id}".`, 404)
  db.delete(planningRecurrences).where(eq(planningRecurrences.id, id)).run()
  return toRecurrence(existing)
}

/**
 * Which recurrences fall on a given day — the occurrences a day's plan should offer.
 *
 * It RETURNS them rather than writing them. Nothing is materialised until a person plans the day,
 * because a table full of generated allocations nobody asked for is a calendar engine's problem and
 * this is not one.
 */
export function dueOn(day: string, all: readonly Recurrence[] = listRecurrences()): Recurrence[] {
  const parsed = parsePeriod(day)
  if (parsed === null || parsed.horizon !== 'day') return []
  const [y, m, d] = day.split('-').map(Number)
  const weekday = ((new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1).getDay() + 6) % 7) + 1
  return all.filter((r) =>
    r.every === 'daily' ? true : r.every === 'weekdays' ? (r.days ?? []).includes(weekday) : weekday === 1,
  )
}
