// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * COUNTERS AND TIMED TRIGGERS: THE RULES. Criteria CT1 to CT7 of design/counters/ACCEPTANCE.md, on
 * a decision and the build decision `uLV_1NVD8jeV`.
 *
 * A counter is a record of kind `counter` in one project. Somebody adds to it by hand with a reason,
 * or it follows one of three office events. When one of its triggers holds it runs ONE action from a
 * closed list — a line from the office, a task, or a registered office job — and starts again from
 * zero. It never starts an agent or a run of an agent: that press is the owner's.
 *
 * ---------------------------------------------------------------------------------------
 * THE COUNT IS THE ROWS. NOTHING STORES IT.
 * ---------------------------------------------------------------------------------------
 *
 * Every addition, firing and held-back firing is one row of `counter_rows`. The count and the amount
 * are added up from the rows AFTER the last firing, every time they are read. A number stored beside
 * the rows could disagree with them and nothing would fail, which is invariant 9. It is also what
 * keeps a restart, an export and an import honest (CT7): the rows are in the archive, so the count
 * comes back because the rows do.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE FIRING HAPPENS, AND WHY IN TWO PLACES
 * ---------------------------------------------------------------------------------------
 *
 * A count or an amount trigger fires INSIDE the add request, so the caller that pushed it over is
 * told what happened in the same answer. A time trigger, a quiet trigger and every addition that
 * comes from an office event happen in the tick, because nobody is asking. `fireTheCountersThatAreDue`
 * is one tick and it takes `now`, so a test drives it with a clock of its own; `startTheCounters` runs
 * that function once at the start and then on a minute timer, and does nothing else. Decision
 * `uLV_1NVD8jeV`, point 14.
 *
 * ONE TICK COSTS NOTHING WHEN THERE IS NO COUNTER, and that is not an optimisation: 272 browser test
 * files start a server, every one of them runs this timer, and a tick that read the whole record
 * table would be paid for 272 times over for nothing. The first thing a tick does is ask whether any
 * counter exists at all, which is one indexed read.
 *
 * ---------------------------------------------------------------------------------------
 * AFTER DOWNTIME, A TRIGGER THAT FELL DUE FIRES ONCE (CT7)
 * ---------------------------------------------------------------------------------------
 *
 * The M94 stop notice is the model (`tellThemOncePerCause` in lib/reminders.ts). A tick asks whether
 * the trigger is due at or before `now` and fires once; the next due is worked out from the firing it
 * has just written, so it is always past `now`. Nothing here loops over the moments that were missed,
 * and a counter that was due eleven times while the office was down writes ONE firing row.
 */

import { type AMessageReader } from './messages.ts'
import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { theRowsTheReaderMaySee } from './across-projects.ts'
import type { Workspace } from '@shared/workspaces.ts'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { checkSubtraction, COUNTER_ROWS_BUCKET_WORDS, leftOutWords, type LeftOutCounts, type LeftOutGroup, type CounterRowsBucket } from '@shared/disclosure.ts'
import { anOfficeId } from './ids.ts'
import { z } from 'zod'

import {
  COUNTER_KIND,
  QUIET_CONDITIONS,
  WHO_MAY_CHANGE_A_COUNTER,
  actionWords,
  followWords,
  triggerWords,
  typedStartsReading,
  type Action,
  type ActionAnswer,
  type ActionReading,
  type CounterChange,
  type CounterEvent,
  type CounterPause,
  type CounterReading,
  type CounterRowKind,
  type CounterRowReading,
  type Follow,
  type FollowReading,
  type Party,
  type Trigger,
  type TriggerReading,
  type WhoMayAdd,
} from '@shared/counters.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { MERGE_STATE_SPECS, type MergeState } from '@shared/merge-queue.ts'
import { moleOffice, participantWord, type ParticipantRef } from '@shared/participants.ts'
import { clockStamp, latestMomentOfStampInZone, localStamp, momentOfAnInstant, parseAnyStamp, theClockZone } from '@shared/time.ts'
import { kindWord } from '@shared/words.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db, sqlite } from '../db/client.ts'
import { counterRows, records } from '../db/schema.ts'
import { asTheCounterDoors } from './counter-door.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { gateMet } from './gate-counts.ts'
import { nameOf, writeASystemLine, writeASystemLineToOne } from './groups.ts'
import { readGroup } from '../db/read-group.ts'
import { theChangedPathsOfAMergeEntry } from './merge-state-machine.ts'
import { whoHoldsTheSecretaryCard } from './inspection.ts'
import { theOfficeIsInThisDatabase } from './office.ts'
import { theOfficeJobNamed, whyThatJobIsNotOnTheList } from './office-jobs.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from './the-agent-an-arriving-reference-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  actorMayActAsSecretaryOrThePerson,
  createLink,
  createRecordWithReport,
  getRecord,
  patchRecord,
  recordInWorkspace,
  type Actor,
} from './records.ts'
import { noRecordHasThisId } from './no-record-has-this-id.ts'
import { PanelError } from './panel-error.ts'
import { sessionPlacement } from './sessions.ts'
import { writeShortForms } from './zoom.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { gateNumber } from '../../config/settings.mjs'
import { TIMING_JOB } from '../../config/timing-job.mjs'
import { named } from './named-timers.ts'

/** The office writes a counter's reminders and its firing rows in its own name, never in an agent's. */
function theOffice(): Actor { return { type: 'system', id: moleOffice().id } }
/** How often the tick looks, in milliseconds. A time trigger is a minute late at worst. */
const EVERY = 60_000

// ============================================================================ what is stored

/** A counter's definition, as its record holds it. */
interface CounterDefinition {
  counts: string
  amountIs: string | null
  createdBy: ParticipantRef
  mayAdd: WhoMayAdd
  follows: Follow[]
  triggers: Trigger[]
  action: Action
  atMostOnceEvery: number
  pause: CounterPause | null
}

/** One row of `counter_rows`, as this file reads it back. */
interface StoredRow {
  id: string
  seq: number
  what: CounterRowKind
  at: string
  atInstant: string | null
  by: string | null
  eventKind: string | null
  eventId: string | null
  eventAt: string | null
  count: number
  amount: number | null
  because: string
  whichTrigger: number | null
  answer: string | null
}

// ============================================================================ the shapes a door parses

const aParty = z
  .object({ kind: z.enum(['person', 'agent']), id: z.string().trim().min(1) })
  .strict()

const aFollow = z.union([
  z.object({ event: z.literal('landing'), lane: z.string().trim().min(1), paths: z.array(z.string().trim().min(1)).optional() }).strict(),
  z.object({ event: z.literal('run-finished'), pipeline: z.string().trim().min(1) }).strict(),
  z.object({ event: z.literal('group-message'), group: z.string().trim().min(1) }).strict(),
])

const aTrigger = z.union([
  z.object({ kind: z.literal('count'), n: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('amount'), m: z.number().positive() }).strict(),
  z
    .object({
      kind: z.literal('quiet'),
      condition: z.enum(QUIET_CONDITIONS),
      lane: z.string().trim().min(1),
      minutes: z.number().int().positive(),
    })
    .strict(),
  z.object({ kind: z.literal('every'), hours: z.number().positive(), from: z.string().trim().min(1).optional() }).strict(),
])

const anAction = z.union([
  z.object({ kind: z.literal('message'), to: z.array(aParty).min(1) }).strict(),
  z.object({ kind: z.literal('message'), group: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal('task'), title: z.string().trim().min(1).max(300) }).strict(),
  z.object({ kind: z.literal('job'), job: z.string().trim().min(1) }).strict(),
])

const whoMayAdd = z.object({ anyone: z.boolean(), who: z.array(aParty) }).strict()

const aReason = (what: string): z.ZodString =>
  z.string({ error: `${what} says why, in one sentence.` }).trim().min(1, { error: `${what} says why, in one sentence.` }).max(600)

/** Filing a counter: POST /api/counters. */
export const A_NEW_COUNTER = z
  .object({
    title: z.string().trim().min(1).max(300),
    counts: z.string().trim().min(1).max(600),
    amountIs: z.string().trim().min(1).max(300).optional(),
    mayAdd: whoMayAdd.optional(),
    follows: z.array(aFollow).optional(),
    triggers: z.array(aTrigger).min(1),
    action: anAction,
    atMostOnceEvery: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(120).optional(),
  })
  .strict()

/** Adding to a counter: POST /api/counters/<id>/add. */
export const AN_ADDITION = z
  .object({
    by: z.number().int().positive().optional(),
    amount: z.number().optional(),
    because: aReason('An addition'),
  })
  .strict()

/** Changing a counter: PATCH /api/counters/<id>. */
export const A_CHANGE = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    counts: z.string().trim().min(1).max(600).optional(),
    amountIs: z.string().trim().min(1).max(300).optional(),
    mayAdd: whoMayAdd.optional(),
    follows: z.array(aFollow).optional(),
    triggers: z.array(aTrigger).min(1).optional(),
    action: anAction.optional(),
    atMostOnceEvery: z.number().int().positive().optional(),
    label: z.string().trim().min(1).max(120).optional(),
    because: aReason('A change to a counter'),
  })
  .strict()

/** Pausing or resuming: POST /api/counters/<id>/pause and /resume. */
export const A_PAUSE_OR_RESUME = z.object({ because: aReason('Pausing or resuming a counter') }).strict()

/** A job runner answering a firing: POST /api/counters/<id>/firings/<seq>/answer. */
export const A_JOB_ANSWER = z
  .object({
    says: z.string().trim().min(1).max(2000),
    result: z.string().trim().min(1).max(300).optional(),
  })
  .strict()

/** Narrowing a counter's rows: ?before=<seq>&limit=<n>. */
export const HOW_MANY_ROWS = z
  .object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().positive().max(500).optional() })
  .strict()

/** How many rows a read gives back when the caller asks for no number. */
export const ROWS_BY_DEFAULT = 50

// ============================================================================ reading the record

/** The counter with this id in this project, or a refusal that says what the id really is. */
export function theCounter(id: string, workspaceId: string): PanelRecord {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== COUNTER_KIND) {
    throw new PanelError(
      `${id} is not a counter: it is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' called ', '')}. Nothing was written.`,
      409,
    )
  }
  return record
}

const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** What one counter record says about itself. */
export function definitionOf(record: PanelRecord): CounterDefinition {
  const data = record.data
  const mayAdd = asObject(data['mayAdd'])
  return {
    counts: typeof data['counts'] === 'string' ? data['counts'] : '',
    amountIs: typeof data['amountIs'] === 'string' ? data['amountIs'] : null,
    createdBy: asObject(data['createdBy']) as unknown as ParticipantRef,
    mayAdd: {
      anyone: mayAdd['anyone'] === true,
      who: Array.isArray(mayAdd['who']) ? (mayAdd['who'] as ParticipantRef[]) : [],
    },
    follows: Array.isArray(data['follows']) ? (data['follows'] as Follow[]) : [],
    triggers: Array.isArray(data['triggers']) ? (data['triggers'] as Trigger[]) : [],
    action: asObject(data['action']) as unknown as Action,
    atMostOnceEvery: typeof data['atMostOnceEvery'] === 'number' ? data['atMostOnceEvery'] : gateNumber('counter-spacing'),
    pause: data['pause'] === undefined || data['pause'] === null ? null : (data['pause'] as CounterPause),
  }
}

/** Every counter of one project, or of every project when none is named. Newest last. */
function everyCounter(workspaceId?: string): PanelRecord[] {
  const rows = db
    .select({ id: records.id })
    .from(records)
    .where(
      workspaceId === undefined
        ? and(eq(records.kind, COUNTER_KIND), isNull(records.deletedAt))
        : and(eq(records.kind, COUNTER_KIND), eq(records.workspaceId, workspaceId), isNull(records.deletedAt)),
    )
    .orderBy(asc(records.createdAt), asc(records.id))
    .all()
  return rows.map((row) => getRecord(row.id)).filter((one): one is PanelRecord => one !== null)
}

/**
 * IS THERE A COUNTER AT ALL? One indexed read, and the first thing every tick asks.
 *
 * 272 browser test files start a server and every one of them runs the tick. This is what makes a
 * tick cost nothing in a database that has no counters, which is all of them but a few.
 */
function thereIsACounter(): boolean {
  const row = db.select({ id: records.id }).from(records).where(and(eq(records.kind, COUNTER_KIND), isNull(records.deletedAt))).limit(1).get()
  return row !== undefined
}

// ============================================================================ the rows

/** Every row of one counter, oldest first. */
function theRowsOf(counterId: string): StoredRow[] {
  return db
    .select()
    .from(counterRows)
    .where(eq(counterRows.counterId, counterId))
    .orderBy(asc(counterRows.seq))
    .all() as StoredRow[]
}

/**
 * THE SPELL OF COUNTING NOW IN PROGRESS: since when, what has been added, and the last firing.
 *
 * "Since" is the last firing, or the counter's own creation when it has never fired. Everything the
 * page draws as the count is inside it.
 */
function theSpell(record: PanelRecord, rows: readonly StoredRow[]): {
  since: string
  sinceMs: number | null
  lastFiring: StoredRow | null
  additions: StoredRow[]
  heldBack: StoredRow | null
} {
  let lastFiring: StoredRow | null = null
  for (const row of rows) if (row.what === 'firing') lastFiring = row
  const after = lastFiring === null ? rows : rows.filter((row) => row.seq > lastFiring.seq)
  const held = after.filter((row) => row.what === 'held back')
  return {
    since: lastFiring?.at ?? record.createdAt,
    sinceMs: lastFiring === null ? momentOfAnOfficeStamp(record.createdAt) : momentOfARow(lastFiring),
    lastFiring,
    additions: after.filter((row) => row.what === 'addition'),
    heldBack: held.length === 0 ? null : (held[held.length - 1] ?? null),
  }
}

/** The count and the amount of one spell, added up from its rows and stored nowhere. */
function countAndAmount(record: PanelRecord, additions: readonly StoredRow[]): { count: number; amount: number | null } {
  const definition = definitionOf(record)
  let count = 0
  let amount = 0
  for (const row of additions) {
    count += row.count
    amount += row.amount ?? 0
  }
  // AN AMOUNT OF NULL AND AN AMOUNT OF ZERO ARE DIFFERENT FACTS. A counter that measures nothing
  // besides its count has no amount at all, and a page that drew 0 there would be saying somebody
  // measured nothing rather than that nothing is measured here.
  return { count, amount: definition.amountIs === null ? null : amount }
}

/**
 * HOW A PARTY IS STORED ON A ROW: the two halves with a colon between them, in that order.
 *
 * IT IS NOT PROSE AND IT IS NEVER DRAWN. `partyFromStored` below reads it back and `partyOf` turns
 * that into the name a person sees, so the stored word never reaches a screen unread — which is the
 * rule tests/the-machine-word-gate.test.ts holds this repository to. It is built by joining rather
 * than by writing the two into a sentence, because a sentence is what that gate is looking for and
 * this is a key, not something anybody reads.
 */
function asStoredParty(who: ParticipantRef): string {
  return [who.kind, who.id].join(':')
}

/** One row written, and the reading of it. The one place a row of this table is inserted. */
function writeACounterRow(input: {
  record: PanelRecord
  what: CounterRowKind
  now: Date
  by: ParticipantRef | null
  event: { event: CounterEvent; id: string; at: string } | null
  count: number
  amount: number | null
  because: string
  whichTrigger?: number
  answer?: ActionAnswer
}): StoredRow {
  const seq =
    (db
      .select({ seq: sql<number | null>`max(${counterRows.seq})` })
      .from(counterRows)
      .where(eq(counterRows.counterId, input.record.id))
      .get()?.seq ?? 0) + 1
  // ONE READING OF THE CLOCK FOR BOTH COLUMNS, so the stamp and the instant cannot name two moments.
  const at = clockStamp(() => input.now)
  const row = {
    id: anOfficeId(),
    workspaceId: input.record.workspaceId,
    counterId: input.record.id,
    seq,
    what: input.what,
    at: at.stamp,
    atInstant: at.instant,
    by: input.by === null ? null : asStoredParty(input.by),
    eventKind: input.event?.event ?? null,
    eventId: input.event?.id ?? null,
    eventAt: input.event?.at ?? null,
    count: input.count,
    amount: input.amount,
    because: input.because,
    whichTrigger: input.whichTrigger ?? null,
    answer: input.answer === undefined ? null : JSON.stringify(input.answer),
  }
  db.insert(counterRows).values(row).run()
  return row as StoredRow
}

// ============================================================================ reading a party back

/**
 * A STORED PARTY, READ BACK BY ITS EXACT ID. Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md.
 *
 * What is stored here is what `participantForActor` or the arriving resolver already answered, which
 * is a REGISTRY ID. So it is read straight back by id and never through the arriving resolver: that
 * one is for a reference this request is telling the office, and using it here would let a handle
 * somebody freed today rename a party written down last week. A party no registry row answers to
 * keeps its id as its name, which says exactly what is known about it.
 */
function partyOf(who: ParticipantRef): Party {
  const found = readParticipant(who)
  return { kind: who.kind, id: who.id, name: found?.name ?? who.id }
}

/** A stored `kind:id` string as a party, or null because the row stored none. */
function partyFromStored(stored: string | null): Party | null {
  if (stored === null) return null
  const cut = stored.indexOf(':')
  if (cut <= 0) return null
  const kind = stored.slice(0, cut)
  const id = stored.slice(cut + 1)
  if (kind !== 'person' && kind !== 'agent') return null
  return partyOf({ kind, id })
}

// ============================================================================ the merge lane

/** What the office knows about one merge lane: whether anything is waiting, and since when it is not. */
function theLane(lane: string): { busy: boolean; quietSince: string | null } {
  const rows = sqlite
    .prepare(
      `SELECT json_extract(data, '$.state') AS state, updated_at AS updatedAt
         FROM records
        WHERE kind = 'merge_entry' AND deleted_at IS NULL AND json_extract(data, '$.changeset.root') = ?`,
    )
    .all(lane) as { state: string; updatedAt: string }[]
  if (rows.length === 0) {
    // NOBODY HAS RECORDED ANYTHING IN THIS LANE, so the office cannot say how long it has been
    // quiet. That is not the same as "it has been quiet for ever", and a trigger that fired on it
    // would be firing on a guess. Absence beats a guess.
    return { busy: false, quietSince: null }
  }
  const busy = rows.some((row) => {
    const spec = MERGE_STATE_SPECS[row.state as MergeState] as { final: boolean } | undefined
    return spec !== undefined && !spec.final
  })
  let newest: string | null = null
  for (const row of rows) if (newest === null || row.updatedAt > newest) newest = row.updatedAt
  return { busy, quietSince: busy ? null : newest }
}

// ============================================================================ the triggers

/** A stamp as milliseconds, or null because it is not one this product can read. */
function inMs(stamp: string | null): number | null {
  if (stamp === null || stamp.trim() === '') return null
  const at = parseAnyStamp(stamp)
  return at === null ? null : at.getTime()
}

/**
 * THE MOMENT OF A STAMP THE OFFICE WROTE ITSELF WITH NO OFFSET, or null because it names none.
 *
 * ON THE NIGHT THE CLOCKS GO BACK such a stamp can name two moments an hour apart, and this reads the later one, so a
 * due time counted from it is never early. A stamp in another form, such as one with its offset, is read as `inMs`
 * reads it. A stamp somebody typed is not read here: how a `from` in the hour that comes twice is read is not decided
 * yet.
 */
function momentOfAnOfficeStamp(stamp: string | null): number | null {
  if (stamp === null) return null
  return latestMomentOfStampInZone(stamp, theClockZone()) ?? inMs(stamp)
}

/** The moment a row was written: its kept instant, or its stamp read as the later moment on a row from before 0299. */
function momentOfARow(row: StoredRow): number | null {
  return row.atInstant === null ? momentOfAnOfficeStamp(row.at) : momentOfAnInstant(row.atInstant)
}

/** A moment as the reply publishes it beside its stamp: the instant with its offset, which names one moment. */
function anInstant(ms: number): string {
  return clockStamp(() => new Date(ms)).instant
}

/**
 * IS THIS COUNTER A TIMER? Nobody may add to it and it follows nothing.
 *
 * CT3's "the count is at least 1" applies to a counter somebody or something can add to. A counter
 * with neither is a timer — "every day at 07:00" is one — and asking a timer for a count of 1 would
 * mean it could never fire at all. Decision `uLV_1NVD8jeV`, point 7.
 */
function isATimer(definition: CounterDefinition): boolean {
  return !definition.mayAdd.anyone && definition.mayAdd.who.length === 0 && definition.follows.length === 0
}

/**
 * WHEN AN `every` TRIGGER IS NEXT DUE, or null because it cannot be worked out.
 *
 * The first `from + k × hours` after the last firing, or after the counter was filed when it has
 * never fired; and simply `hours` after that moment when the trigger names no `from`. Decision
 * `uLV_1NVD8jeV`, point 6 and point 8.
 */
function nextDueOfEvery(trigger: Extract<Trigger, { kind: 'every' }>, sinceMs: number | null): number | null {
  if (sinceMs === null) return null
  const step = trigger.hours * 60 * 60 * 1000
  if (trigger.from === undefined) return sinceMs + step
  const fromMs = inMs(trigger.from)
  if (fromMs === null) return null
  if (fromMs > sinceMs) return fromMs
  const steps = Math.floor((sinceMs - fromMs) / step) + 1
  return fromMs + steps * step
}

/** What one trigger is watching right now: whether it holds, why, and when it is next due. */
function readTrigger(
  trigger: Trigger,
  state: { definition: CounterDefinition; count: number; amount: number | null; sinceMs: number | null; now: Date },
): { holdsNow: boolean; because: string; dueAt: string | null; dueMs: number | null; since?: string | null; waitsForACount?: boolean } {
  const atLeastOne = isATimer(state.definition) || state.count >= 1
  if (trigger.kind === 'count') {
    return { holdsNow: state.count >= trigger.n, because: `The count reached ${String(state.count)}, and it fires at ${String(trigger.n)}.`, dueAt: null, dueMs: null }
  }
  if (trigger.kind === 'amount') {
    const amount = state.amount
    if (amount === null) {
      // A COUNTER THAT MEASURES NOTHING CAN NEVER MEET AN AMOUNT. The door refuses that pairing when
      // the counter is filed, so this is the reading of a counter whose `amountIs` was taken off
      // afterwards; it says the honest thing rather than treating a missing amount as zero.
      return { holdsNow: false, because: 'This counter carries no amount, so an amount trigger can never hold.', dueAt: null, dueMs: null }
    }
    return { holdsNow: amount >= trigger.m, because: `The amount reached ${String(amount)}, and it fires at ${String(trigger.m)}.`, dueAt: null, dueMs: null }
  }
  if (trigger.kind === 'quiet') {
    const lane = theLane(trigger.lane)
    const quietSince = momentOfAnOfficeStamp(lane.quietSince)
    if (!atLeastOne || lane.busy || quietSince === null) {
      return { holdsNow: false, because: whyTheQuietTriggerDoesNotHold(trigger.lane, atLeastOne, lane), dueAt: null, dueMs: null, since: lane.quietSince }
    }
    const dueMs = quietSince + trigger.minutes * 60 * 1000
    return {
      holdsNow: state.now.getTime() >= dueMs,
      because: `Nothing has been waiting in ${trigger.lane} since ${lane.quietSince ?? ''}, which is ${String(trigger.minutes)} minutes or more, and the count is ${String(state.count)}.`,
      dueAt: localStamp(new Date(dueMs)),
      dueMs,
      since: lane.quietSince,
    }
  }
  // THE DUE TIME IS WORKED OUT AND COMPARED AS A MOMENT, and only then written as a stamp for a person. Read back, the
  // stamp of a moment in the hour that comes twice names the first pass of it, an hour early.
  const dueMs = nextDueOfEvery(trigger, state.sinceMs)
  const dueAt = dueMs === null ? null : localStamp(new Date(dueMs))
  const holdsNow = atLeastOne && dueMs !== null && state.now.getTime() >= dueMs
  if (!atLeastOne) {
    // THE COUNT IS 0 AND THIS IS NO TIMER, so the moment is true but the counter will not fire at
    // it. This is the same reading the quiet branch gives, and the reply carries this reason on the
    // next due moment, so an agent reads why and the page can draw its own sentence for it rather
    // than drawing a firing that cannot happen. `dueAt` is kept: the time is still the time.
    return {
      holdsNow: false,
      because: `The count is 0, and it waits for a count of at least 1 before it fires at ${dueAt ?? 'a moment the office could not work out'}.`,
      dueAt,
      dueMs,
      waitsForACount: true,
    }
  }
  return {
    holdsNow,
    because: `${String(trigger.hours)} hours have passed: it was due at ${dueAt ?? 'a moment the office could not work out'}.`,
    dueAt,
    dueMs,
  }
}

/** Why a quiet trigger does not hold, in the words of whichever half of it is not true. */
function whyTheQuietTriggerDoesNotHold(lane: string, atLeastOne: boolean, reading: { busy: boolean; quietSince: string | null }): string {
  if (!atLeastOne) return 'The count is 0, and a quiet trigger fires only when something has been counted.'
  if (reading.busy) return `Something is waiting in ${lane} now.`
  return `Nobody has recorded anything waiting in ${lane}, so the office cannot say how long it has been quiet.`
}

/** The first trigger that holds, by its position in the counter's own list, or null because none does. */
function whichTriggerHolds(
  record: PanelRecord,
  rows: readonly StoredRow[],
  now: Date,
  only: 'count-and-amount' | 'every kind',
): { index: number; because: string } | null {
  const definition = definitionOf(record)
  const spell = theSpell(record, rows)
  const { count, amount } = countAndAmount(record, spell.additions)
  const state = { definition, count, amount, sinceMs: spell.sinceMs, now }
  for (const [index, trigger] of definition.triggers.entries()) {
    if (only === 'count-and-amount' && trigger.kind !== 'count' && trigger.kind !== 'amount') continue
    const read = readTrigger(trigger, state)
    if (read.holdsNow) return { index, because: read.because }
  }
  return null
}

// ============================================================================ the actions

/** The stored message's own account of where it went, read back rather than assumed. */
function whereTheLineWent(messageId: string): string {
  const message = getRecord(messageId)
  if (message === null) return 'a message the office cannot read back'
  const to = message.data['to']
  const group = message.data['toGroup']
  if (typeof group === 'string' && group !== '') return `the group ${readGroup(group, EVERY_PROJECT)?.name ?? group}`
  if (Array.isArray(to) && to.length > 0) {
    return (to as ParticipantRef[]).map((who) => `${participantWord(who.kind)} ${partyOf(who).name}`).join(' and ')
  }
  return 'no recipient the message names'
}

/** What a job firing's row says until the job's runner answers. */
export function aJobWaitsForItsRunner(job: string): string {
  return `The office wants the job ${job} run, and is waiting for its runner to answer.`
}

/**
 * RUN THE ACTION, AND SAY WHAT IT ANSWERED (CT4, CT5).
 *
 * A MESSAGE IS ONE LINE EACH, because lib/records.ts allows an office line to a group, to one
 * participant, or to both of a pair, and never to three or more. So a counter naming four
 * participants writes four lines and the firing row keeps all four ids.
 *
 * WHERE EACH LINE WENT IS READ BACK OFF THE STORED MESSAGE, not taken from where it was aimed. An
 * office line addressed to a retired agent is re-delivered to the agent that started it, and the row
 * has to say where the line really is or a reader would go looking in the wrong conversation.
 */
function runTheAction(record: PanelRecord, because: string): ActionAnswer {
  const definition = definitionOf(record)
  const action = definition.action
  const line = SYSTEM_LINES.aCounterFired(record.title, because)

  if (action.kind === 'message' && 'group' in action) {
    const written = writeASystemLine(action.group, record.workspaceId, line, theOffice())
    if (written === null) {
      // A GROUP WITH NOBODY IN IT HAS NOBODY TO READ THE LINE. That is a real state and not a
      // failure: the counter fired, and the row says the line reached nobody.
      return { kind: 'message', ids: [], says: `The group has no members, so no line was written.`, finished: true }
    }
    return { kind: 'message', ids: [written.id], says: `One line went to ${whereTheLineWent(written.id)}.`, finished: true }
  }

  if (action.kind === 'message') {
    const ids = action.to.map((who) => writeASystemLineToOne(who, record.workspaceId, line, theOffice()).id)
    return {
      kind: 'message',
      ids,
      says: `${String(ids.length)} ${ids.length === 1 ? 'line' : 'lines'} went out: ${ids.map((id) => whereTheLineWent(id)).join('; ')}.`,
      finished: true,
    }
  }

  if (action.kind === 'task') {
    const task = createRecordWithReport({
      kind: 'task',
      title: action.title,
      data: { state: 'todo' },
      workspaceId: record.workspaceId,
      actor: theOffice(),
      // NEITHER LIST OF TITLES ALREADY FILED. Only the task's id is kept, and no answer of a firing names either list.
      namesWhatIsAlreadyFiled: false,
    }).record
    createLink({ fromId: task.id, toId: record.id, type: 'about', actor: theOffice() })
    return { kind: 'task', ids: [task.id], says: `Task ${task.id} was filed, about this counter.`, finished: true }
  }

  // A JOB. The office says it wants the job run and stops there: nothing under src/ may start a
  // process, so a runner outside this server does the work and answers through its own door. The row
  // is unfinished until it does, and `finished: false` is what says so rather than an empty result
  // reading as a job that did nothing.
  return {
    kind: 'job',
    job: action.job,
    ids: [],
    says: aJobWaitsForItsRunner(action.job),
    finished: false,
  }
}

// ============================================================================ the limit, and firing

/**
 * WHEN THE COUNTER MAY FIRE AGAIN, given its last firing, or null because it has never fired.
 *
 * THE WINDOW IS THE LONGER OF ITS OWN LIMIT AND THE OFFICE'S SHORTEST TIME FOR COUNTERS, counted from
 * the last firing. The shortest time is read from its row now, never kept, because a person may
 * change it while the server runs: a counter made at 30 waits 60 after the row is set to 60.
 */
function theWindowEnds(
  definition: CounterDefinition,
  lastFiring: StoredRow | null,
  shortest: number = gateNumber('counter-spacing'),
): number | null {
  const firedAt = lastFiring === null ? null : momentOfARow(lastFiring)
  if (firedAt === null) return null
  return firedAt + Math.max(definition.atMostOnceEvery, shortest) * 60 * 1000
}

/**
 * FIRE THE COUNTER, OR WRITE THAT THE FIRING WAS HELD BACK (CT5, CT6).
 *
 * THE LIMIT IS A ROLLING WINDOW and the held-back row is written ONCE per held spell: a counter over
 * its trigger for an hour with a two-hour limit writes one held-back row, not sixty. The count is
 * kept either way — a held-back firing resets nothing — so it fires as soon as the window frees.
 */
function fireOrHoldBack(record: PanelRecord, held: { index: number; because: string }, now: Date): {
  fired: CounterRowReading | null
  heldBack: CounterRowReading | null
} {
  const definition = definitionOf(record)
  const shortest = gateNumber('counter-spacing')
  const rows = theRowsOf(record.id)
  const spell = theSpell(record, rows)
  const { count, amount } = countAndAmount(record, spell.additions)
  const windowEndsMs = theWindowEnds(definition, spell.lastFiring, shortest)
  const windowEndsAt = windowEndsMs === null ? null : localStamp(new Date(windowEndsMs))

  if (windowEndsMs !== null && now.getTime() < windowEndsMs) {
    // ONE ROW PER HELD SPELL. A second row would say the same thing about the same spell, and a
    // reader counting held-back rows would read one held firing as many.
    if (spell.heldBack !== null) return { fired: null, heldBack: null }
    // THIS GATE COUNTS A FIRING THE OFFICE'S SHORTEST TIME ALONE HOLDS BACK. A firing held back only
    // by the longer limit its creator chose is the counter's own brake, not this gate's.
    const lastFiredAt = spell.lastFiring === null ? null : momentOfARow(spell.lastFiring)
    const theShortestTimeAloneHoldsItBack = lastFiredAt !== null && now.getTime() < lastFiredAt + shortest * 60 * 1000
    const row = writeACounterRow({
      record,
      what: 'held back',
      now,
      by: null,
      event: null,
      count,
      amount,
      because:
        `${held.because} It was not fired: this counter fires at most once every ${String(Math.max(definition.atMostOnceEvery, shortest))} minutes, ` +
        `it last fired at ${spell.lastFiring?.at ?? ''}, and it may fire again at ${windowEndsAt ?? ''}. The count is kept.`,
    })
    // THE COUNT GOES IN AFTER THE HELD-BACK ROW IS WRITTEN, so a row that could not be written cannot
    // leave a count saying a firing was held back when no held-back row exists.
    if (theShortestTimeAloneHoldsItBack) gateMet('counter-spacing', String(shortest))
    return { fired: null, heldBack: readACounterRow(row) }
  }

  const answer = runTheAction(record, held.because)
  const row = writeACounterRow({
    record,
    what: 'firing',
    now,
    by: null,
    event: null,
    count,
    amount,
    because: held.because,
    whichTrigger: held.index,
    answer,
  })
  return { fired: readACounterRow(row), heldBack: null }
}

/**
 * ASK WHETHER THIS COUNTER SHOULD FIRE, AND FIRE IT IF SO.
 *
 * A PAUSED COUNTER FIRES NOTHING AND STILL COUNTS. Decision `uLV_1NVD8jeV`, point 10: the additions
 * go on being written while it is paused, and on resume a trigger that holds fires once.
 */
function considerFiring(record: PanelRecord, now: Date, only: 'count-and-amount' | 'every kind'): {
  fired: CounterRowReading | null
  heldBack: CounterRowReading | null
} {
  const definition = definitionOf(record)
  if (definition.pause !== null) return { fired: null, heldBack: null }
  if (definition.action.kind === 'job' && !theOfficeIsInThisDatabase()) {
    // A WORLD IS A COPY OF THE OFFICE'S DATABASE, counters and all. A copy that fired the office's
    // jobs would run the whole suite twice and neither run would know about the other. The office
    // itself is never a copy, so nothing is lost there. Decision `uLV_1NVD8jeV`, point 14.
    return { fired: null, heldBack: null }
  }
  const rows = theRowsOf(record.id)
  const held = whichTriggerHolds(record, rows, now, only)
  if (held === null) return { fired: null, heldBack: null }
  return fireOrHoldBack(record, held, now)
}

// ============================================================================ the readings

/** One row, as a reply gives it. */
function readACounterRow(row: StoredRow): CounterRowReading {
  const answer = row.answer === null ? undefined : (JSON.parse(row.answer) as ActionAnswer)
  return {
    seq: row.seq,
    what: row.what,
    at: row.at,
    atInstant: row.atInstant,
    by: partyFromStored(row.by),
    event:
      row.eventKind === null || row.eventId === null
        ? null
        : {
            event: row.eventKind as CounterEvent,
            id: row.eventId,
            at: row.eventAt ?? row.at,
            words: row.because,
          },
    count: row.count,
    amount: row.amount,
    because: row.because,
    ...(row.whichTrigger === null ? {} : { trigger: row.whichTrigger }),
    ...(answer === undefined ? {} : { answer }),
  }
}

/** The action with the sentence a reader sees, and a group named as well as identified. */
function readTheAction(action: Action): ActionReading {
  if (action.kind === 'task') return { kind: 'task', title: action.title, words: actionWords(action) }
  if (action.kind === 'job') return { kind: 'job', job: action.job, words: actionWords(action) }
  if ('group' in action) {
    const group = readGroup(action.group, EVERY_PROJECT)
    return {
      kind: 'message',
      group: { id: action.group, name: group?.name ?? action.group },
      words: actionWords(action, group?.name ?? null),
    }
  }
  return { kind: 'message', to: action.to.map(partyOf), words: actionWords(action) }
}

/** One counter, whole (CT1). Its count and its amount are worked out here and stored nowhere. */
export function readACounter(record: PanelRecord, now: Date = new Date()): CounterReading {
  const definition = definitionOf(record)
  const rows = theRowsOf(record.id)
  const spell = theSpell(record, rows)
  const { count, amount } = countAndAmount(record, spell.additions)
  const state = { definition, count, amount, sinceMs: spell.sinceMs, now }

  const triggers: TriggerReading[] = definition.triggers.map((trigger) => {
    const read = readTrigger(trigger, state)
    const fromReading = typedStartsReading(trigger, theClockZone())
    return {
      ...trigger,
      ...(fromReading === null ? {} : { fromReading }),
      words: triggerWords({ ...trigger, fromReading }),
      holdsNow: read.holdsNow,
      // WHEN THE SPELL A QUIET TRIGGER WATCHES BEGAN, and absent on every other kind, which watches
      // no spell. Null here is nobody having recorded anything waiting in that lane.
      ...(read.since === undefined ? {} : { since: read.since }),
    }
  })
  const follows: FollowReading[] = definition.follows.map((follow) => ({ ...follow, words: followWords(follow) }))

  // THE NEXT ONE DUE, WHICH IS THE EARLIEST OF THE TRIGGERS THAT CAN NAME A MOMENT. A count trigger
  // names none: when it will be reached depends on somebody adding to it. Null means no trigger of
  // this counter can say when, which is a real answer and the common one. `because` rides with the
  // moment only when the counter waits for a count, so the reply says why it will not fire there and
  // the page can draw its own sentence.
  let nextDue: CounterReading['nextDue'] = null
  let nextDueMs: number | null = null
  for (const [index, trigger] of definition.triggers.entries()) {
    const read = readTrigger(trigger, state)
    if (read.dueAt === null || read.dueMs === null) continue
    // COMPARED AS MOMENTS. Two stamps compared as words put the second 01:30 of the night the clocks go back
    // level with the first.
    if (nextDue === null || nextDueMs === null || read.dueMs < nextDueMs) {
      nextDueMs = read.dueMs
      nextDue = {
        at: read.dueAt,
        instant: anInstant(read.dueMs),
        trigger: index,
        words: triggerWords(trigger),
        ...(read.waitsForACount === true ? { because: read.because } : {}),
      }
    }
  }

  const windowEndsMs = theWindowEnds(definition, spell.lastFiring)
  return {
    id: record.id,
    title: record.title,
    counts: definition.counts,
    amountIs: definition.amountIs,
    count,
    amount,
    since: spell.since,
    createdBy: partyOf(definition.createdBy),
    createdAt: record.createdAt,
    paused:
      definition.pause === null
        ? null
        : { at: definition.pause.at, by: partyOf(definition.pause.by), because: definition.pause.because },
    follows,
    mayAdd: { anyone: definition.mayAdd.anyone, who: definition.mayAdd.who.map(partyOf) },
    mayChange: WHO_MAY_CHANGE_A_COUNTER,
    triggers,
    action: readTheAction(definition.action),
    atMostOnceEvery: definition.atMostOnceEvery,
    lastFiring: spell.lastFiring === null ? null : readACounterRow(spell.lastFiring),
    nextDue,
    heldBack: spell.heldBack === null ? null : theHeldBackReading(spell.heldBack, windowEndsMs),
  }
}

/**
 * A HELD-BACK FIRING AS THE REPLY GIVES IT, with the moment it may fire again as a stamp and as an instant.
 *
 * WITHOUT A WINDOW the boundary is the held-back row's own moment, as it was before the instant was published. The
 * instant is null where that moment cannot be read, which is a real answer: nobody can say when.
 */
function theHeldBackReading(row: StoredRow, windowEndsMs: number | null): NonNullable<CounterReading['heldBack']> {
  const untilMs = windowEndsMs ?? momentOfARow(row)
  return {
    at: row.at,
    reason: row.because,
    until: windowEndsMs === null ? row.at : localStamp(new Date(windowEndsMs)),
    untilInstant: untilMs === null ? null : anInstant(untilMs),
  }
}

/** Every change somebody made to this counter's definition, with who, when and why (CT6). */
export function theChangesTo(record: PanelRecord): CounterChange[] {
  const rows = sqlite
    .prepare(
      `SELECT at, actor_type AS actorType, actor_id AS actorId, note, op
         FROM revisions
        WHERE record_id = ? AND note IS NOT NULL
        ORDER BY seq ASC`,
    )
    .all(record.id) as { at: string; actorType: string; actorId: string; note: string; op: string }[]
  return rows.map((row) => ({
    at: row.at,
    by: partyOf({ kind: row.actorType === 'human' ? 'person' : 'agent', id: row.actorId }),
    because: row.note,
    what: row.op,
  }))
}

// ============================================================================ who may add, who may change

/** Whether two participant references are the same party. */
const samePartyAs = (a: ParticipantRef, b: ParticipantRef): boolean => a.kind === b.kind && a.id === b.id

/** Who may add to this counter, in words, for the refusal and for the page. */
function whoMayAddInWords(definition: CounterDefinition): string {
  if (definition.mayAdd.anyone) return 'every agent and person this office holds a registry row for'
  if (definition.mayAdd.who.length === 0) return 'nobody: this counter is a timer and is added to by nothing'
  return definition.mayAdd.who.map((who) => `${participantWord(who.kind)} ${partyOf(who).name}`).join(', ')
}

/** The caller as a registered party, or a refusal saying why an unregistered caller cannot do this. */
function theCallerOrARefusal(actor: Actor, doing: string): ParticipantRef {
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `${doing} needs a caller this office holds a registry row for, because the counter keeps who did it and ` +
        `only a party it can name may be kept. Nothing here answers to ${actor.type} "${actor.id}". Register with ` +
        `POST /api/agents/started, or ask somebody who is registered to do it. Nothing was written.`,
      403,
    )
  }
  return me
}

/** Refuse a caller the counter does not allow to add (CT2). The sentence names who may. */
function assertMayAdd(record: PanelRecord, definition: CounterDefinition, me: ParticipantRef): void {
  if (definition.mayAdd.anyone) return
  if (definition.mayAdd.who.some((who) => samePartyAs(who, me))) return
  throw new PanelError(
    `Only ${whoMayAddInWords(definition)} may add to the counter "${record.title}". This request came from ` +
      `${participantWord(me.kind)} ${partyOf(me).name}. Whoever filed it, a secretary or the owner can change who ` +
      `may add, with PATCH /api/counters/${record.id}. Nothing was written.`,
    403,
  )
}

/**
 * REFUSE A CHANGE BY SOMEBODY WHO MAY NOT MAKE IT (CT6).
 *
 * THREE PARTIES AND NO OTHERS: whoever filed it, a secretary, and the owner. The creator is compared
 * against the party stored on the record when it was filed; the other two are
 * `actorMayActAsSecretaryOrThePerson`, which is the one place this product asks that question.
 */
function assertMayChange(record: PanelRecord, definition: CounterDefinition, actor: Actor, what: string): ParticipantRef | null {
  const me = participantForActor(actor)
  if (me !== null && samePartyAs(definition.createdBy, me)) return me
  if (actorMayActAsSecretaryOrThePerson(actor)) return me
  throw new PanelError(
    `Only the creator of the counter "${record.title}" (${participantWord(definition.createdBy.kind)} ` +
      `${partyOf(definition.createdBy).name}), a secretary, or the owner may ${what}. This request came from ` +
      `${actor.type} "${actor.id}". Nothing was written.`,
    403,
  )
}

// ============================================================================ checking what a caller sent

/** One party a body names, resolved to the registry id it means, or a refusal. */
function thePartyABodyNames(who: ParticipantRef, what: string): ParticipantRef {
  if (who.kind === 'person') {
    const person = readParticipant(who)
    if (person === null) {
      throw new PanelError(`${what} names the person "${who.id}", and this office holds no such person. Nothing was written.`, 400)
    }
    return { kind: 'person', id: who.id }
  }
  const found = theAgentAnArrivingReferenceNames(who.id, 'writing')
  if (found === null) {
    throw new PanelError(`${what} names the agent "${who.id}", and this office holds no such agent. Nothing was written.`, 400)
  }
  return { kind: 'agent', id: found.agent.id }
}

/** Every follow a body names, checked and resolved. */
function theFollowsABodyNames(follows: readonly Follow[], workspaceId: string): Follow[] {
  return follows.map((follow) => {
    if (follow.event === 'group-message') {
      const group = readGroup(follow.group, EVERY_PROJECT)
      if (group === null) {
        throw new PanelError(`A counter cannot follow the group "${follow.group}": this office holds no such group. Nothing was written.`, 400)
      }
      return { event: 'group-message', group: group.id }
    }
    if (follow.event === 'run-finished') {
      const where = thePipelineOrModuleNamed(follow.pipeline, workspaceId)
      return { event: 'run-finished', pipeline: where }
    }
    return follow
  })
}

/** The id of the pipeline or module a follow names, by id or by title, or a refusal. */
function thePipelineOrModuleNamed(said: string, workspaceId: string): string {
  const byId = getRecord(said)
  if (byId !== null && byId.workspaceId === workspaceId && (byId.kind === 'pipeline' || byId.kind === 'module')) return byId.id
  const row = db
    .select({ id: records.id })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.title, said), isNull(records.deletedAt)))
    .all()
    .map((one) => getRecord(one.id))
    .find((one) => one !== null && (one.kind === 'pipeline' || one.kind === 'module'))
  if (row !== undefined && row !== null) return row.id
  throw new PanelError(
    `A counter can follow runs finishing in a pipeline or a module, and "${said}" is neither in this project. A ` +
      `flow cannot be followed at all yet: nothing ties a run to a flow, so the office could not tell which runs ` +
      `were in one. Nothing was written.`,
    400,
  )
}

/** The action a body names, checked and resolved. */
function theActionABodyNames(action: Action, workspaceId: string): Action {
  if (action.kind === 'job') {
    if (theOfficeJobNamed(action.job) === null) throw new PanelError(whyThatJobIsNotOnTheList(action.job), 400)
    return { kind: 'job', job: action.job.trim() }
  }
  if (action.kind === 'task') return action
  if ('group' in action) {
    const group = readGroup(action.group, EVERY_PROJECT)
    if (group === null) {
      throw new PanelError(`A counter cannot write into the group "${action.group}": this office holds no such group. Nothing was written.`, 400)
    }
    return { kind: 'message', group: group.id }
  }
  return { kind: 'message', to: action.to.map((who) => thePartyABodyNames(who, "A counter's message")) }
}

/**
 * THE LIMIT A BODY NAMES, or a refusal saying the limit may only be made longer (CT6).
 *
 * A CREATOR MAY SET IT LARGER AND NEVER SMALLER: the limit is a brake on the office's own writing and
 * on whatever the action starts, and a counter allowed to fire every minute would be a way round it.
 * The shortest time is read from the counter-spacing row here each time, never kept, because a
 * person may change it while the server runs.
 */
function theLimitABodyNames(said: number | undefined): number {
  const shortest = gateNumber('counter-spacing')
  if (said === undefined) return shortest
  if (said < shortest) {
    throw new PanelError(
      `A counter fires at most once every ${String(shortest)} minutes, the shortest time set for counters on the Gates ` +
        `panel, and this asked for once every ${String(said)}. The limit may only be made LONGER: it is the brake on what a firing ` +
        `writes and on whatever its action starts. Nothing was written.`,
      400,
    )
  }
  return said
}

/** Refuse an amount trigger on a counter that measures no amount: it could never hold. */
function assertTheTriggersCanHold(triggers: readonly Trigger[], amountIs: string | null): void {
  if (amountIs !== null) return
  if (!triggers.some((trigger) => trigger.kind === 'amount')) return
  throw new PanelError(
    'This counter has an amount trigger and says nothing about what its amount measures, so the amount would ' +
      'always be nothing and the trigger could never hold. Give it `amountIs`, or take the amount trigger off. ' +
      'Nothing was written.',
    400,
  )
}

// ============================================================================ the loop check (CT6)

/** A counter as the loop check reads it: what it messages, and which groups it follows. */
interface CounterInTheGraph {
  id: string
  title: string
  writesTo: string | null
  follows: string[]
}

function inTheGraph(id: string, title: string, definition: CounterDefinition): CounterInTheGraph {
  const action = definition.action
  return {
    id,
    title,
    writesTo: action.kind === 'message' && 'group' in action ? action.group : null,
    follows: definition.follows.filter((one) => one.event === 'group-message').map((one) => one.group),
  }
}

/**
 * THE LOOP THIS WOULD MAKE, IN WORDS, OR NULL BECAUSE IT MAKES NONE (CT6).
 *
 * AN OFFICE LINE IN A GROUP IS A MESSAGE IN THAT GROUP, which is what makes a loop possible at all:
 * a counter whose action writes into a group it follows adds to itself, fires again, and writes
 * again. Decision `uLV_1NVD8jeV`, point 12.
 *
 * THE WALK IS OVER EVERY COUNTER IN THE PROJECT, not only the one being written, because a change to
 * one counter can close a ring that runs through two others. It follows the groups a firing can
 * reach: this counter writes into G, every counter that follows G can fire and write into its own
 * group, and so on. If any group reached that way is one the counter itself follows, the ring is
 * closed and the sentence names it.
 *
 * THE OTHER TWO ACTIONS CANNOT LOOP. A task and an office job add to no counter, so nothing they do
 * comes back round.
 */
function theLoopThisWouldMake(graph: readonly CounterInTheGraph[]): string | null {
  const followers = new Map<string, CounterInTheGraph[]>()
  for (const one of graph) {
    for (const group of one.follows) {
      const found = followers.get(group)
      if (found === undefined) followers.set(group, [one])
      else found.push(one)
    }
  }
  for (const start of graph) {
    if (start.writesTo === null) continue
    const reached = new Map<string, string[]>([[start.writesTo, [start.title]]])
    const frontier = [start.writesTo]
    while (frontier.length > 0) {
      const group = frontier.shift()
      if (group === undefined) continue
      const path = reached.get(group) ?? []
      if (start.follows.includes(group)) {
        const groupName = readGroup(group, EVERY_PROJECT)?.name ?? group
        return (
          `The counter "${start.title}" would add to itself: it writes a line into ${groupName}` +
          (path.length > 1 ? ` through ${path.slice(1).map((one) => `"${one}"`).join(', then ')}` : '') +
          `, and it follows messages in ${groupName}, so every firing would count itself and fire again. ` +
          `Nothing was written.`
        )
      }
      for (const next of followers.get(group) ?? []) {
        if (next.writesTo === null || reached.has(next.writesTo)) continue
        reached.set(next.writesTo, [...path, next.title])
        frontier.push(next.writesTo)
      }
    }
  }
  return null
}

/** Refuse a definition that would make a loop, reading every other counter in the project with it. */
function assertNoLoop(workspaceId: string, written: { id: string; title: string; definition: CounterDefinition }): void {
  const others = everyCounter(workspaceId)
    .filter((record) => record.id !== written.id)
    .map((record) => inTheGraph(record.id, record.title, definitionOf(record)))
  const loop = theLoopThisWouldMake([...others, inTheGraph(written.id, written.title, written.definition)])
  if (loop !== null) throw new PanelError(loop, 409)
}

/**
 * WRITE THE COUNTER'S NAME AT READING LEVEL 1, THROUGH ITS OWN DOOR.
 *
 * Chapter 10, rule 3: every record gets a name of two to five words, written in the run that files
 * it. The ordinary short-forms door goes through `patchRecord`, which `assertMayWrite` refuses for
 * this kind, so a counter's label is written here, inside the counter doors' own write mark. The
 * words are judged by exactly the same budget as every other label: `writeShortForms` is the one
 * writer and this only reaches it.
 *
 * `madeFrom` IS THE RECORD AS IT STANDS RIGHT NOW, read a line before the write. That is the true
 * statement about what the label was written from: this door has just written the record, and the
 * label is a name for what it wrote.
 */
function writeTheLabel(recordId: string, workspaceId: string, label: string, actor: Actor) {
  const newest = sqlite
    .prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1')
    .get(recordId) as { seq: number; contentHash: string } | undefined
  if (newest === undefined) {
    throw new PanelError(
      `Counter ${recordId} has no revision to write a name from, so its name cannot say what it was written from. ` +
        `Nothing was written.`,
      409,
    )
  }
  return writeShortForms(recordId, workspaceId, { madeFrom: newest, forms: { label } }, actor)
}

// ============================================================================ the doors

/** File a counter (CT1). The office writes who filed it, and refuses that field from every caller. */
export function makeACounter(input: {
  workspaceId: string
  said: z.output<typeof A_NEW_COUNTER>
  actor: Actor
}): CounterReading {
  const me = theCallerOrARefusal(input.actor, 'Filing a counter')
  const said = input.said
  const mayAdd: WhoMayAdd =
    said.mayAdd === undefined
      ? { anyone: false, who: [me] }
      : { anyone: said.mayAdd.anyone, who: said.mayAdd.who.map((who) => thePartyABodyNames(who, 'Who may add')) }
  const follows = theFollowsABodyNames(said.follows ?? [], input.workspaceId)
  const action = theActionABodyNames(said.action, input.workspaceId)
  const atMostOnceEvery = theLimitABodyNames(said.atMostOnceEvery)
  const amountIs = said.amountIs ?? null
  assertTheTriggersCanHold(said.triggers, amountIs)
  const definition: CounterDefinition = {
    counts: said.counts,
    amountIs,
    createdBy: me,
    mayAdd,
    follows,
    triggers: [...said.triggers],
    action,
    atMostOnceEvery,
    pause: null,
  }
  assertNoLoop(input.workspaceId, { id: 'the counter being filed', title: said.title, definition })

  // THE COUNTER AND ITS NAME ARE ONE WRITE. Without the transaction, a name that could not be
  // written would leave a counter filed and a refusal saying nothing was written — a sentence this
  // product may not print. The database is written synchronously, so this is one savepoint around
  // two writes and nothing can get between them.
  const written = asTheCounterDoors(() =>
    sqlite.transaction(() => {
      const made = createRecordWithReport({
        kind: COUNTER_KIND,
        title: said.title,
        data: {
          counts: definition.counts,
          ...(amountIs === null ? {} : { amountIs }),
          createdBy: me,
          mayAdd,
          ...(follows.length === 0 ? {} : { follows }),
          triggers: definition.triggers,
          action,
          atMostOnceEvery,
        },
        workspaceId: input.workspaceId,
        actor: input.actor,
        // NEITHER LIST OF TITLES ALREADY FILED. Only the record is kept, and the counter door's answer names neither list.
        namesWhatIsAlreadyFiled: false,
      }).record
      if (said.label !== undefined) writeTheLabel(made.id, input.workspaceId, said.label, input.actor)
      return made
    })(),
  )
  return readACounter(getRecord(written.id) ?? written)
}

/** Change what a counter does (CT6). Every change says why, and the reason is kept with it. */
export function changeACounter(input: {
  workspaceId: string
  id: string
  said: z.output<typeof A_CHANGE>
  actor: Actor
}): { counter: CounterReading; nothingWritten?: string } {
  const record = theCounter(input.id, input.workspaceId)
  const definition = definitionOf(record)
  assertMayChange(record, definition, input.actor, 'change it')
  const said = input.said

  const mayAdd =
    said.mayAdd === undefined
      ? definition.mayAdd
      : { anyone: said.mayAdd.anyone, who: said.mayAdd.who.map((who) => thePartyABodyNames(who, 'Who may add')) }
  const follows = said.follows === undefined ? definition.follows : theFollowsABodyNames(said.follows, input.workspaceId)
  const action = said.action === undefined ? definition.action : theActionABodyNames(said.action, input.workspaceId)
  const atMostOnceEvery = said.atMostOnceEvery === undefined ? definition.atMostOnceEvery : theLimitABodyNames(said.atMostOnceEvery)
  const amountIs = said.amountIs ?? definition.amountIs
  const triggers = said.triggers === undefined ? definition.triggers : [...said.triggers]
  assertTheTriggersCanHold(triggers, amountIs)
  const next: CounterDefinition = { ...definition, counts: said.counts ?? definition.counts, amountIs, mayAdd, follows, triggers, action, atMostOnceEvery }
  assertNoLoop(input.workspaceId, { id: record.id, title: said.title ?? record.title, definition: next })

  const dataPatch: Record<string, unknown> = {
    ...(said.counts === undefined ? {} : { counts: said.counts }),
    ...(said.amountIs === undefined ? {} : { amountIs: said.amountIs }),
    ...(said.mayAdd === undefined ? {} : { mayAdd }),
    ...(said.follows === undefined ? {} : { follows }),
    ...(said.triggers === undefined ? {} : { triggers }),
    ...(said.action === undefined ? {} : { action }),
    ...(said.atMostOnceEvery === undefined ? {} : { atMostOnceEvery }),
  }
  // THE CHANGE AND THE NAME ARE ONE WRITE, for the reason the filing door gives above.
  const changed = asTheCounterDoors(() =>
    sqlite.transaction(() => {
      const patched = patchRecord(
        record.id,
        { ...(said.title === undefined ? {} : { title: said.title }), dataPatch },
        input.actor,
        { op: 'update', note: said.because },
      )
      const label = said.label === undefined ? undefined : writeTheLabel(patched.record.id, input.workspaceId, said.label, input.actor)
      return { record: patched.record, nothingWritten: patched.nothingWritten !== undefined && (label === undefined || label.nothingWritten !== undefined) }
    })(),
  )
  return { counter: readACounter(getRecord(changed.record.id) ?? changed.record), ...(changed.nothingWritten ? { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) } : {}) }
}

/** Pause a counter (CT6). It goes on counting and fires nothing until it is resumed. */
export function pauseACounter(input: { workspaceId: string; id: string; because: string; actor: Actor; now?: Date }): CounterReading {
  const record = theCounter(input.id, input.workspaceId)
  const definition = definitionOf(record)
  assertMayChange(record, definition, input.actor, 'pause it')
  if (definition.pause !== null) {
    throw new PanelError(
      `The counter "${record.title}" was already paused at ${definition.pause.at} by ` +
        `${participantWord(definition.pause.by.kind)} ${partyOf(definition.pause.by).name}: ${definition.pause.because} ` +
        `Nothing was written.`,
      409,
    )
  }
  const me = participantForActor(input.actor)
  const pause: CounterPause = {
    at: localStamp(input.now ?? new Date()),
    // WHO PAUSED IT, AND THE OWNER WHERE THE CALLER IS NOT IN THE REGISTRY. A secretary acting for
    // the person, and the person typing by hand, both reach this door; the stored party is whoever
    // the registry could name, and the person when it could name nobody.
    by: me ?? { kind: 'person', id: input.actor.id },
    because: input.because,
  }
  const paused = asTheCounterDoors(() =>
    patchRecord(record.id, { dataPatch: { pause } }, input.actor, { op: 'update', note: `Paused: ${input.because}` }),
  ).record
  return readACounter(paused)
}

/**
 * RESUME A COUNTER (CT6). It keeps its count, and a trigger that holds fires once, here and now.
 *
 * FIRING ON RESUME IS THE WHOLE POINT OF KEEPING THE COUNT. A counter that reached its trigger while
 * it was paused has something to say the moment it is allowed to; waiting for the next tick would
 * make "resume" mean "resume, and maybe in a minute". Decision `uLV_1NVD8jeV`, point 10.
 */
export function resumeACounter(input: { workspaceId: string; id: string; because: string; actor: Actor; now?: Date }): {
  counter: CounterReading
  fired: CounterRowReading | null
  heldBack: CounterRowReading | null
} {
  const record = theCounter(input.id, input.workspaceId)
  const definition = definitionOf(record)
  assertMayChange(record, definition, input.actor, 'resume it')
  if (definition.pause === null) {
    throw new PanelError(`The counter "${record.title}" is not paused, so there is nothing to resume. Nothing was written.`, 409)
  }
  const resumed = asTheCounterDoors(() =>
    patchRecord(record.id, { dataPatch: { pause: null } }, input.actor, { op: 'update', note: `Resumed: ${input.because}` }),
  ).record
  const now = input.now ?? new Date()
  const done = considerFiring(resumed, now, 'every kind')
  return { counter: readACounter(getRecord(resumed.id) ?? resumed, now), fired: done.fired, heldBack: done.heldBack }
}

/** Add to a counter (CT2), and fire it when a count or an amount trigger holds (CT3). */
export function addToACounter(input: {
  workspaceId: string
  id: string
  said: z.output<typeof AN_ADDITION>
  actor: Actor
  now?: Date
}): { row: CounterRowReading; counter: CounterReading; fired: CounterRowReading | null; heldBack: CounterRowReading | null } {
  const record = theCounter(input.id, input.workspaceId)
  const definition = definitionOf(record)
  const me = theCallerOrARefusal(input.actor, 'Adding to a counter')
  assertMayAdd(record, definition, me)
  if (input.said.amount !== undefined && definition.amountIs === null) {
    throw new PanelError(
      `The counter "${record.title}" measures no amount, so there is nowhere to put ${String(input.said.amount)}. ` +
        `Whoever filed it can say what an amount would measure, with PATCH /api/counters/${record.id}. Nothing was written.`,
      400,
    )
  }
  const now = input.now ?? new Date()
  const row = writeACounterRow({
    record,
    what: 'addition',
    now,
    by: me,
    event: null,
    count: input.said.by ?? 1,
    amount: input.said.amount ?? null,
    because: input.said.because,
  })
  const done = considerFiring(record, now, 'count-and-amount')
  return {
    row: readACounterRow(row),
    counter: readACounter(getRecord(record.id) ?? record, now),
    fired: done.fired,
    heldBack: done.heldBack,
  }
}

/**
 * A JOB RUNNER ANSWERS ONE FIRING (CT4c, CT5).
 *
 * The office cannot run a job itself — nothing under src/ starts a process — so a firing whose action
 * is a job writes a row saying the office wants it, and whoever runs it says here what it did. The
 * answer lands on that firing row and nowhere else.
 */
export function answerAFiring(input: {
  workspaceId: string
  id: string
  seq: number
  said: z.output<typeof A_JOB_ANSWER>
  actor: Actor
  now?: Date
}): CounterRowReading {
  const record = theCounter(input.id, input.workspaceId)
  const me = theCallerOrARefusal(input.actor, 'Answering a counter firing')
  const row = db
    .select()
    .from(counterRows)
    .where(and(eq(counterRows.counterId, record.id), eq(counterRows.seq, input.seq)))
    .get() as StoredRow | undefined
  if (row === undefined) {
    throw new PanelError(`The counter "${record.title}" has no row ${String(input.seq)}. Nothing was written.`, 404)
  }
  if (row.what !== 'firing' || row.answer === null) {
    throw new PanelError(`Row ${String(input.seq)} of the counter "${record.title}" is not a firing, so no job was asked for on it. Nothing was written.`, 409)
  }
  const answer = JSON.parse(row.answer) as ActionAnswer
  if (answer.kind !== 'job') {
    throw new PanelError(
      `Firing ${String(input.seq)} of the counter "${record.title}" asked for no job: its action wrote what it had ` +
        `to write when it fired, and there is nothing for a runner to answer. Nothing was written.`,
      409,
    )
  }
  if (answer.finished) {
    throw new PanelError(
      `Firing ${String(input.seq)} of the counter "${record.title}" was already answered${answer.answeredAt === undefined ? '' : ` at ${answer.answeredAt}`}: ` +
        `${answer.says} Nothing was written.`,
      409,
    )
  }
  const answered: ActionAnswer = {
    kind: 'job',
    // THE JOB THE FIRING ASKED FOR, kept on the finished row so a later reader can name it.
    job: answer.job,
    ids: input.said.result === undefined ? [] : [input.said.result],
    says: input.said.says,
    finished: true,
    answeredBy: partyOf(me),
    answeredAt: localStamp(input.now ?? new Date()),
  }
  let timingOutcome: string | null = null
  let timingReason = 'No failure reason was recorded.'
  if (answer.job === TIMING_JOB) {
    const result = input.said.result === undefined ? null : getRecord(input.said.result)
    const extra = result?.data['extra'] as { timingJob?: { counter?: string; seq?: number; status?: string; because?: string; code?: number | null; measurements?: { status?: string; coldFixtureMs?: number; limitMs?: number; runs?: { ms: number }[][] } } } | undefined
    const timing = extra?.timingJob
    if (result?.kind !== 'report' || result.workspaceId !== input.workspaceId || timing?.counter !== record.id || timing.seq !== row.seq || !['passed', 'failed', 'not-run'].includes(timing.status ?? '')) {
      throw new PanelError('A timing firing needs its dated result report, naming this counter, firing and a final outcome. Nothing was written.', 400)
    }
    timingOutcome = timing.status!
    const reasons: string[] = []
    if (timing.because) reasons.push(timing.because)
    const measurements = timing.measurements
    if (!timing.because) {
      const runStatus = measurements?.status
      const exit = timing.code
      if (runStatus !== undefined || (exit !== undefined && exit !== null)) {
        reasons.push(`The run${runStatus === undefined ? '' : ` reported "${runStatus}"`}${exit === undefined || exit === null ? '' : `${runStatus === undefined ? '' : ' and'} exited with code ${exit}`}.`)
      }
    }
    if (measurements) {
      if (measurements.coldFixtureMs !== undefined && measurements.coldFixtureMs >= 60_000) {
        reasons.push(`The cold fixture took ${measurements.coldFixtureMs} ms against a limit below 60000 ms (${measurements.coldFixtureMs - 60_000} ms over the boundary).`)
      }
      const slowest = Math.max(...(measurements.runs ?? []).flat().map(press => press.ms))
      if (measurements.limitMs !== undefined && slowest > measurements.limitMs) {
        reasons.push(`The slowest review press took ${slowest} ms against ${measurements.limitMs} ms (${slowest - measurements.limitMs} ms over).`)
      }
    }
    if (reasons.length > 0) timingReason = reasons.join(' ')
  }
  // Answer and wake are one transaction. A restart cannot wake the coordinator
  // twice, or mark a failed firing finished without its message.
  sqlite.transaction(() => {
    // THE ALERT GOES TO WHOEVER HOLDS THE SECRETARY CARD, read from the registry, because an office's agents are its
    // own. Nobody holding it is said on the answer, and nobody is told.
    const secretary = timingOutcome === 'failed' || timingOutcome === 'not-run' ? whoHoldsTheSecretaryCard() : null
    if ((timingOutcome === 'failed' || timingOutcome === 'not-run') && secretary === null) {
      answered.says = `${answered.says} Nobody holds the secretary card, so nobody was told that review timing needs attention.`
    }
    if (secretary !== null) {
      const message = createRecordWithReport({
        kind: 'message', title: 'Review timing needs attention', workspaceId: input.workspaceId, actor: input.actor,
        data: { body: timingOutcome === 'failed' ? `Review timing failed. ${timingReason}` : 'Review timing found no quiet window in three days.', to: [{ kind: 'agent', id: secretary.id }], urgent: true },
      }).record
      writeTheLabel(message.id, input.workspaceId, 'Review timing alert', input.actor)
      createLink({ fromId: message.id, toId: input.said.result!, type: 'about', actor: input.actor })
      answered.ids.push(message.id)
    }
    db.update(counterRows).set({ answer: JSON.stringify(answered) }).where(eq(counterRows.id, row.id)).run()
  })()
  return readACounterRow({ ...row, answer: JSON.stringify(answered) })
}

// ============================================================================ the reads

/** Every counter of one project, sorted by title, with the sentence an empty list needs (CT1). */
export function listCounters(workspaceId: string, now: Date = new Date()): { workspaceId: string; counters: CounterReading[]; says: string } {
  const counters = everyCounter(workspaceId)
    .map((record) => readACounter(record, now))
    .sort((a, b) => a.title.localeCompare(b.title))
  const firing = counters.filter((one) => one.paused === null).length
  return {
    workspaceId,
    counters,
    says:
      counters.length === 0
        ? 'This project has no counters. A counter counts something and does one thing when it has counted enough: file one with POST /api/counters.'
        : `${String(counters.length)} ${counters.length === 1 ? 'counter' : 'counters'}, of which ${String(firing)} ${firing === 1 ? 'is' : 'are'} running and ${String(counters.length - firing)} paused.`,
  }
}

/**
 * EVERY COUNTER OF THE PROJECTS ASKED, for the Counters page under All projects.
 * Each counter carries the project it is in. The projects and the rows the reader may
 * see come from src/server/lib/across-projects.ts, the one place that says so. A counter is never a
 * message, so today the message rule there takes none of these out.
 */
export function listCountersIn(
  projects: readonly Workspace[],
  reader: AMessageReader,
  now: Date = new Date(),
): { projects: string[]; counters: (CounterReading & { workspaceId: string })[]; says: string } {
  const counters = theRowsTheReaderMaySee(everyCounter(), projects, reader)
    .map((record) => ({ ...readACounter(record, now), workspaceId: record.workspaceId }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.workspaceId.localeCompare(b.workspaceId))
  const firing = counters.filter((one) => one.paused === null).length
  const where = projects.length === 1 ? `the project "${projects[0]!.id}"` : `the ${String(projects.length)} projects read`
  return {
    projects: projects.map((project) => project.id),
    counters,
    says:
      counters.length === 0
        ? `No counter is in ${where}. A counter counts something and does one thing when it has counted enough: file one with POST /api/counters.`
        : `${String(counters.length)} ${counters.length === 1 ? 'counter' : 'counters'} in ${where}, of which ${String(firing)} ${firing === 1 ? 'is' : 'are'} running and ${String(counters.length - firing)} paused.`,
  }
}

/**
 * ONE COUNTER BY ITS ID, IN WHICHEVER OF THE PROJECTS ASKED HOLDS IT, for a counter opened from the
 * Counters page under All projects. An id that names nothing, a deleted record and a message this
 * reader may not read are all refused as an id naming nothing, with the one refusal every by-id door
 * gives. A record in a project that was not asked is refused the way `recordInWorkspace` refuses it
 * for the first project asked.
 */
export function theCounterIn(id: string, projects: readonly Workspace[], reader: AMessageReader): PanelRecord {
  const record = getRecord(id)
  if (record === null || record.deletedAt !== null) throw noRecordHasThisId(id)
  if (theRowsTheReaderMaySee([record], projects, reader).length === 0) {
    recordInWorkspace(id, projects[0]?.id ?? '', reader)
    throw noRecordHasThisId(id)
  }
  return theCounter(id, record.workspaceId)
}

/** One counter, its rows newest first, and every change somebody made to it (CT1, CT2, CT5, CT6). */
export function readOneCounter(input: {
  workspaceId: string
  id: string
  before?: number
  limit?: number
  now?: Date
}): { counter: CounterReading; rows: CounterRowReading[]; more: boolean; changes: CounterChange[]; subtraction: LeftOutCounts; leftOutGroups: LeftOutGroup<CounterRowsBucket>[]; says: string | null } {
  const record = theCounter(input.id, input.workspaceId)
  const limit = input.limit ?? ROWS_BY_DEFAULT
  const rows = db
    .select()
    .from(counterRows)
    .where(
      input.before === undefined
        ? eq(counterRows.counterId, record.id)
        : and(eq(counterRows.counterId, record.id), sql`${counterRows.seq} < ${input.before}`),
    )
    .orderBy(desc(counterRows.seq))
    .all() as StoredRow[]
  const carried = rows.slice(0, limit).map(readACounterRow)
  const leftOutGroups: LeftOutGroup<CounterRowsBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: rows.length - carried.length,
    ids: rows.slice(limit).map((row) => row.id),
  }]
  const subtraction: LeftOutCounts = { candidates: rows.length, carried: carried.length, leftOut: rows.length - carried.length, shortened: 0 }
  checkSubtraction('readOneCounter', subtraction, leftOutGroups)
  return {
    subtraction,
    leftOutGroups,
    counter: readACounter(record, input.now ?? new Date()),
    rows: carried,
    more: rows.length > limit,
    changes: theChangesTo(record),
    // THE ROWS LEFT OUT, IN WORDS, from this read's own word map. Null when the reply carries every row.
    says: subtraction.leftOut === 0 ? null : leftOutWords(COUNTER_ROWS_BUCKET_WORDS.row_limit, subtraction.leftOut),
  }
}

// ============================================================================ the three event pollers

/**
 * FROM WHEN AN EVENT COUNTS: the moment the counter was filed, and that moment included.
 *
 * A stamp in this product is one second wide, so an event that happened in the same second as the
 * filing cannot be told from one that happened just after it. The two readings are not equally
 * costly. Counting it means at worst one event from the second the counter was filed; NOT counting
 * it means an event that really did happen after the filing is silently missed, and a count that is
 * quietly one short is the failure this whole feature exists to avoid. So the window includes its
 * first second, and this sentence is why.
 */

/** One office event a counter has not counted yet. */
interface CountableEvent {
  event: CounterEvent
  id: string
  at: string
  count: number
  amount: number | null
  words: string
}

/** The event ids this counter has already counted, for one kind of event. */
function alreadyCounted(counterId: string, event: CounterEvent): Set<string> {
  const rows = db
    .select({ eventId: counterRows.eventId })
    .from(counterRows)
    .where(and(eq(counterRows.counterId, counterId), eq(counterRows.eventKind, event)))
    .all()
  return new Set(rows.map((row) => row.eventId).filter((one): one is string => one !== null))
}

/**
 * EVERY LANDING IN ONE LANE SINCE THE COUNTER WAS FILED, with its changed-file count as the amount.
 *
 * WHICH FILES COUNT IS THE FOLLOW'S OWN BUSINESS. The whole-suite counter of CT10 counts only files
 * under src/, tests/ and tools/, because a landing that moves a design document does not need the
 * suite run; a follow that names no prefixes counts every changed path. The paths themselves come
 * from `theChangedPathsOfAMergeEntry`, which is the same reading the queue's own "N files" uses.
 *
 * THE LANE IS A DIRECTORY AND NOT A PROJECT. A merge entry belongs to whichever project submitted
 * it, and the lane is where the changes land, so landings are counted by lane whatever project the
 * entry is filed in — the same rule GET /api/merge-queue reads the queue by.
 */
function theLandings(record: PanelRecord, follow: Extract<Follow, { event: 'landing' }>): CountableEvent[] {
  const counted = alreadyCounted(record.id, 'landing')
  const rows = sqlite
    .prepare(
      `SELECT id, json_extract(data, '$.integrated.at') AS at
         FROM records
        WHERE kind = 'merge_entry' AND deleted_at IS NULL
          AND json_extract(data, '$.changeset.root') = ?
          AND json_extract(data, '$.state') = 'merged'
          AND json_extract(data, '$.integrated.at') >= ?`,
    )
    .all(follow.lane, record.createdAt) as { id: string; at: string | null }[]
  const events: CountableEvent[] = []
  for (const row of rows) {
    if (counted.has(row.id)) continue
    const entry = getRecord(row.id)
    if (entry === null) continue
    const paths = theChangedPathsOfAMergeEntry(entry).filter(
      (path) => follow.paths === undefined || follow.paths.length === 0 || follow.paths.some((prefix) => path.startsWith(prefix)),
    )
    if (follow.paths !== undefined && follow.paths.length > 0 && paths.length === 0) continue
    events.push({
      event: 'landing',
      id: row.id,
      at: row.at ?? entry.updatedAt,
      count: 1,
      amount: paths.length,
      words: `Merge entry ${row.id} landed in ${follow.lane} with ${String(paths.length)} changed ${paths.length === 1 ? 'file' : 'files'} counted.`,
    })
  }
  return events
}

/**
 * EVERY RUN THAT REACHED `finished` IN ONE PIPELINE OR MODULE SINCE THE COUNTER WAS FILED.
 *
 * ONLY `finished`, AND THAT IS THE WHOLE RULE. A run that stopped or crashed did not do the work, so
 * counting it would make "ten experiments" mean "ten attempts, some of which fell over". The change
 * log is what says a run REACHED that state — the record's own field says only where it is now — so
 * each change row is the event, and its id is what keeps it counted once.
 *
 * WHERE A RUN BELONGS is `sessionPlacement`, the one reading in this product that answers it. A run
 * whose primary placement is the named pipeline or module counts; a run that reaches nothing does
 * not, and neither does one placed somewhere else.
 */
function theRunsThatFinished(record: PanelRecord, follow: Extract<Follow, { event: 'run-finished' }>): CountableEvent[] {
  const counted = alreadyCounted(record.id, 'run-finished')
  const rows = sqlite
    .prepare(
      `SELECT id, record_id AS recordId, at
         FROM changes
        WHERE field = 'data.state' AND new_value = 'finished' AND at >= ?`,
    )
    .all(record.createdAt) as { id: string; recordId: string; at: string }[]
  const where = getRecord(follow.pipeline)
  const events: CountableEvent[] = []
  for (const row of rows) {
    if (counted.has(row.id)) continue
    const run = getRecord(row.recordId)
    if (run === null || run.kind !== 'session' || run.workspaceId !== record.workspaceId) continue
    const placement = sessionPlacement(run.id, run.id, run.workspaceId)
    if (placement.kind !== 'in' || placement.primary.project.id !== follow.pipeline) continue
    events.push({
      event: 'run-finished',
      id: row.id,
      at: row.at,
      count: 1,
      amount: null,
      words: `The run "${run.title}" finished in ${where?.title ?? follow.pipeline}.`,
    })
  }
  return events
}

/**
 * EVERY MESSAGE IN ONE GROUP SINCE THE COUNTER WAS FILED, THE OFFICE'S OWN LINES INCLUDED.
 *
 * An office line in a group IS a message in that group — it is the same row, with Mole Office as its
 * sender — so counting it is not a choice this file makes, it is what the group holds. That is also
 * why a counter may not write into a group it follows: the loop check above refuses that pairing.
 */
function theGroupMessages(record: PanelRecord, follow: Extract<Follow, { event: 'group-message' }>): CountableEvent[] {
  const counted = alreadyCounted(record.id, 'group-message')
  const rows = sqlite
    .prepare(
      `SELECT id, created_at AS at
         FROM records
        WHERE kind = 'message' AND deleted_at IS NULL
          AND json_extract(data, '$.toGroup') = ? AND created_at >= ?`,
    )
    .all(follow.group, record.createdAt) as { id: string; at: string }[]
  const name = readGroup(follow.group, EVERY_PROJECT)?.name ?? follow.group
  return rows
    .filter((row) => !counted.has(row.id))
    .map((row) => ({
      event: 'group-message' as const,
      id: row.id,
      at: row.at,
      count: 1,
      amount: null,
      words: `A message in ${name}.`,
    }))
}

/** Everything this counter follows that it has not counted yet, oldest first. */
function theEventsNotYetCounted(record: PanelRecord, definition: CounterDefinition): CountableEvent[] {
  const events: CountableEvent[] = []
  for (const follow of definition.follows) {
    if (follow.event === 'landing') events.push(...theLandings(record, follow))
    else if (follow.event === 'run-finished') events.push(...theRunsThatFinished(record, follow))
    else events.push(...theGroupMessages(record, follow))
  }
  return events.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)))
}

// ============================================================================ the tick

/** What one tick did. Empty lists are the ordinary answer and the log says nothing about them. */
export interface CountersPass {
  /** `<counter id> counted <event> <event id>`, one entry per addition an event made. */
  added: string[]
  /** The counters that fired, by id. */
  fired: string[]
  /** The counters whose firing was held back by the limit, by id. */
  heldBack: string[]
  /**
   * THE COUNTERS THIS TICK COULD NOT FINISH, each with the reason in its own words.
   *
   * A counter is asked inside its own try, so one whose action cannot be written does not stop the
   * counters after it. The reason is kept rather than swallowed: a tick that quietly did less than
   * it was asked to do, and said nothing, is the silent failure this feature exists to prevent.
   */
  failed: { counter: string; because: string }[]
}

/**
 * ONE TICK: COUNT WHAT THE OFFICE'S EVENTS ADDED, AND FIRE WHAT IS DUE (CT3, CT7).
 *
 * Exported so a test can run exactly one tick with a clock of its own; the timer below is this
 * function called for ever with the real clock, and nothing else.
 *
 * A PAUSED COUNTER STILL COUNTS ITS EVENTS and fires nothing, which is why the additions are made
 * before `considerFiring` is asked and are not skipped for a paused one.
 *
 * ONE COUNTER'S FAILURE IS NOT THE TICK'S. A counter whose action cannot be written — a group that
 * has gone, a message the office refuses — must not stop every other counter in the office from
 * firing, so each one is asked inside its own try and the reason goes in `failed` on the pass, which
 * the watcher below writes into the log. The counters after it in the same tick are asked as usual,
 * and the next tick asks the failed one again.
 */
export function fireTheCountersThatAreDue(now: Date): CountersPass {
  const pass: CountersPass = { added: [], fired: [], heldBack: [], failed: [] }
  // THE WHOLE COST OF A TICK IN A DATABASE WITH NO COUNTERS: one indexed read. 272 browser test
  // files start a server that runs this.
  if (!thereIsACounter()) return pass
  for (const record of everyCounter()) {
    // ONE COUNTER'S FAILURE IS NOT THE TICK'S. Everything this counter needs is asked inside this
    // try, the additions its events make as well as its firing, because either can throw and
    // neither is a reason for the counters after it to go uncounted. The next tick asks this
    // counter again from its rows, so nothing it failed to do is lost by being skipped here.
    try {
      theCounterIsAsked(record, now, pass)
    } catch (why) {
      pass.failed.push({ counter: record.id, because: why instanceof Error ? why.message : String(why) })
    }
  }
  return pass
}

/** One counter's whole turn in a tick: what its events added, and whether it fires. */
function theCounterIsAsked(record: PanelRecord, now: Date, pass: CountersPass): void {
  const definition = definitionOf(record)
  for (const event of theEventsNotYetCounted(record, definition)) {
    writeACounterRow({
      record,
      what: 'addition',
      now,
      by: null,
      event: { event: event.event, id: event.id, at: event.at },
      count: event.count,
      // AN EVENT'S AMOUNT IS ONLY WRITTEN WHERE THE COUNTER MEASURES ONE. A landing knows how many
      // files it changed whether or not anybody asked, and storing it on a counter that measures
      // nothing would put a number on a row no reading adds up.
      amount: definition.amountIs === null ? null : event.amount,
      because: event.words,
    })
    pass.added.push(`${record.id} counted ${event.event} ${event.id}`)
  }
  const done = considerFiring(record, now, 'every kind')
  if (done.fired !== null) pass.fired.push(record.id)
  if (done.heldBack !== null) pass.heldBack.push(record.id)
}

/**
 * START THE COUNTERS' OWN WATCHER, AND SAY WHAT IT DID.
 *
 * One unref'd interval, so it never holds the server open, and one tick's failure is a line in the
 * log rather than a server down — the same shape `startTheReminders` has, beside which this is
 * started. THE FIRST TICK IS RUN AT ONCE, which is the half CT7 asks for: a trigger that fell due
 * while the office was down fires when the office is back, and not up to a minute afterwards.
 */
export function startTheCounters(log: (line: string) => void): void {
  const tick = (): void => {
    try {
      const done = fireTheCountersThatAreDue(new Date())
      const said = [
        done.added.length === 0 ? null : `counted ${String(done.added.length)} office event(s): ${done.added.join('; ')}`,
        done.fired.length === 0 ? null : `fired ${done.fired.join(', ')}`,
        done.heldBack.length === 0 ? null : `held back a firing of ${done.heldBack.join(', ')}`,
        done.failed.length === 0
          ? null
          : `could not finish ${done.failed.map((one) => `${one.counter} (${one.because})`).join('; ')}`,
      ].filter((one) => one !== null)
      if (said.length > 0) log(`The counters ticked: ${said.join('; ')}.`)
    } catch (err) {
      log(`The counter watcher could not finish a tick: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // NAMED, so a long run is a line in the log and the loop watch can say whose a hold was (lib/named-timers.ts).
  const run = named('the counters', log, tick)
  run()
  const watch: NodeJS.Timeout = setInterval(run, EVERY)
  watch.unref()
}
