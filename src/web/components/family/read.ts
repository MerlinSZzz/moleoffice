// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * WHAT EACH FAMILY'S ROWS ARE MADE OF, read out of the stored record and out of nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 * The five family pages and the Modules page used to be one generic catalogue with a filter on it:
 * a state chip, a kind tag, the title, the one-line summary and `updated 3d ago`, twenty times.
 * That row is the same row whatever you are looking at, so every family page answered the same
 * question — "which of these has a state word?" — and none of them answered the question a person
 * navigated there to ask.
 *
 * A family page's row is now made of the fields that family actually stores. An obligation leads
 * with how late it is; a proposal leads with the question it asks and NOT with its title; a module
 * leads with how much of its own checklist is ticked. Every one of those is a different read of a
 * different set of stored fields, and every one of them is here — pure, so it can be tested without
 * a DOM, and in one file, so a page cannot grow a second opinion about what `open` or `parked`
 * means.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING HERE INFERS, AND ABSENCE IS ALWAYS ITS OWN ANSWER
 * ---------------------------------------------------------------------------------------
 * Every reader below answers `null` where nobody wrote anything, and the pages print the
 * difference. That is invariant 5 in USER.md and it is the rule that makes these pages worth
 * reading: `0 open problems` and `nothing links a problem to this module` are two different facts,
 * and only one of them means the subsystem is healthy.
 *
 * The one classification that IS made — what a state word means — is `progressOf` from
 * shared/work.ts, the same function the server ran to build the attention list. No page here
 * decides for itself that `blocked` is stopped short.
 */

import { blockNameIn } from '@shared/blocks.ts'
import { kindDeclaresState } from '@shared/attention.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { RecordListItem } from '../../api.ts'
import {
  latenessMs,
  progressOf,
  putDownReason,
  readConsequence,
  readDue,
  type Due,
  type Progress,
  type PutDownReason,
} from '@shared/work.ts'
import { parseDueStamp } from '../../lib/attention.ts'
import { parseLocalStamp } from '@shared/time.ts'

// ============================================================================ small readers

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A record's `data`, or an empty bag. `data` is open JSON the database does not check. */
export function dataOf(record: Pick<PanelRecord, 'data'>): Record<string, unknown> {
  return isObject(record.data) ? record.data : {}
}

/** A stored string field with content, or null. Blank is the same as absent — it says nothing. */
export function textField(record: Pick<PanelRecord, 'data'>, key: string): string | null {
  const raw = dataOf(record)[key]
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null
}

/** A stored list of strings, or null when the key is absent. An empty list is NOT null: it is a list. */
export function listField(record: Pick<PanelRecord, 'data'>, key: string): string[] | null {
  const raw = dataOf(record)[key]
  if (!Array.isArray(raw)) return null
  return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())
}

/** A stored number, or null. Absent is not zero — see `effort_hours` in kinds.ts. */
export function numberField(record: Pick<PanelRecord, 'data'>, key: string): number | null {
  const raw = dataOf(record)[key]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

// ============================================================================ a record's own state

/**
 * The state word a record stores, and what the shared table says it means.
 *
 * `progressOf` is the same classifier the server ran to build the
 * attention list, so a page and that list cannot disagree about what `idle` means. Three answers,
 * never collapsed: a classified word, a word nobody has classified, and no word at all.
 *
 * IT LIVES HERE RATHER THAN IN RecordsPage, WHICH IS WHERE IT USED TO LIVE, for one mechanical
 * reason: RecordsPage now imports the family pages, the family pages read state, and a reader
 * imported back out of the page that imports them is an import cycle. RecordsPage re-exports it
 * for QueriesPage and RecordPage; the ordinary rows and detail views share this reader.
 */
export interface RecordState {
  /** The shared state word. Null when the record has no readable state. */
  word: string | null
  progress: Progress | null
  /**
   * For the null case only: does the KIND declare a `state` field? True means one was expected
   * and never written, false means records of this kind have no state to read, null means Mole Office
   * does not know the kind. Three different facts, and the row says which.
   */
  expected: boolean | null
}

export function stateOf(record: Pick<PanelRecord, 'kind' | 'data'>): RecordState {
  const raw = dataOf(record)['state']
  const progress = progressOf(raw)
  return {
    word: progress === null ? null : String(raw).trim(),
    progress,
    expected: kindDeclaresState(record.kind),
  }
}

// ============================================================================ work

/**
 * The four bands a piece of work falls into, in the order a person reads them.
 *
 * THE FIRST BAND IS THE PAGE. Everything else on `#/work` exists so that the reader can see that
 * this band is not the whole list — a band with no denominator beside it is a claim nobody can
 * check.
 */
export const WORK_BANDS = ['needs-a-person', 'in-hand', 'put-down', 'settled'] as const
export type WorkBand = (typeof WORK_BANDS)[number]

/**
 * The heading each band carries. THE HEADING IS THE WHOLE OF IT NOW.
 *
 * The headings are what the page IS, so they are written as a person would say them out loud, not
 * as the state vocabulary spells them. `stopped_short` is a classification; "needs a person" is
 * what it means to the person reading the page.
 *
 * EACH OF THESE USED TO CARRY A SENTENCE UNDER IT and all four are deleted. "Started, or filed and
 * never started. Nothing here has stalled." under a heading reading *Being worked on* is the
 * heading paraphrased in smaller type, and the owner's review named exactly this: *"These
 * description or explanation of UIs are literally not needed if we design our UI or UX good."*
 * What a band holds is decided by the record's own state word, which is drawn on every row in it.
 */
export const WORK_BAND_WORDS: Readonly<Record<WorkBand, { heading: string }>> = {
  'needs-a-person': { get heading(): string { return t('g7a.work.needsPerson') } },
  'in-hand': { get heading(): string { return t('g7a.modules.active') } },
  'put-down': { get heading(): string { return t('g7a.modules.paused') } },
  settled: { get heading(): string { return t('g7a.work.settled') } },
}

/** One piece of work, read into the facts its row prints. */
export interface WorkReading {
  record: RecordListItem
  state: RecordState
  band: WorkBand
  /** How the obligation comes due, whichever of the four forms it was written in. */
  due: Due
  /** Positive = that many ms late. Negative = that long to go. Null = no date Mole Office can read. */
  lateMs: number | null
  /** What it waits on, in prose, from the field the KIND keeps it in. Null when nobody wrote one. */
  waitingOn: string | null
  /** What it costs while it is unfixed — the stored `consequence.what`. Never read off a title. */
  costs: string | null
  /** Why it was put down, and which field said so. `putDownReason` knows the one per-kind exception. */
  putDown: PutDownReason | null
  /** The estimate somebody wrote. Absent is not zero and is drawn as absent. */
  effortHours: number | null
  /** Milliseconds since the record was last written. Null when the stamp cannot be read. */
  ageMs: number | null
}

/**
 * Where the prose "what is this waiting on" lives, per kind.
 *
 * A DECLARED TABLE RATHER THAN A CHAIN OF `if`s, because the reason it differs per kind is a
 * decision somebody made and argued in kinds.ts: `task.blocked_by` was deleted in favour of a typed
 * `blocks` link and `also_waiting_on` for the prose case, while `obligation.blocked_by` was kept,
 * because an obligation has no `also_waiting_on` to move prose into. A kind missing from this table
 * has no prose field for it, which is different from having an empty one.
 *
 * NONE OF THIS IS THE DEPENDENCY GRAPH. What really waits on what is a `blocks` link, read by the
 * attention rule and drawn on the record's own page. This is the sentence somebody typed about a
 * thing that is not a record yet.
 */
const WAITING_FIELD: Readonly<Record<string, string>> = {
  task: 'also_waiting_on',
  obligation: 'blocked_by',
  problem: 'how_to_tell_it_is_back',
  purchase: 'why',
}

/**
 * WHY `problem` AND `purchase` POINT AT FIELDS THAT ARE NOT LITERALLY "WHAT IT WAITS ON".
 *
 * They are not in the table above as an approximation of a blocker. They are the one line of that
 * kind's own schema which tells a reader what to do next, and the row labels each with the words
 * the field means rather than with one shared label — see `waitingLabel`. A problem's
 * `how_to_tell_it_is_back` is the check that closes it; a purchase's `why` is the work that is
 * stopped until it arrives. Labelling both "waiting on" would be this file inventing a meaning the
 * schema does not have.
 */
export const WAITING_LABELS: Readonly<Record<string, string>> = {
  get task() { return t('g7a.work.waiting') },
  get obligation() { return t('g7a.work.waiting') },
  get problem() { return t('g7a.work.closingCheck') },
  get purchase() { return t('g7a.work.waitingDelivery') },
}

export function waitingLabel(kind: string): string {
  return WAITING_LABELS[kind] ?? t('g7a.work.waiting')
}

/**
 * Read one piece of work.
 *
 * `now` is passed in rather than read here so that every row on one page measures lateness and age
 * against ONE clock. Two rows disagreeing about when "now" is, is how a list comes to say "due
 * today" and "1 day late" about the same date.
 */
export function readWork(record: RecordListItem, now: number): WorkReading {
  const state = stateOf(record)
  const due = readDue(record.data)
  const lateMs = latenessMs(due, now, parseDueStamp)
  // A purchase says when its absence starts costing something in its own field, and it is a date.
  // It is read into the same `Due` shape rather than into a second one, so the row that prints
  // lateness prints it the same way for both kinds.
  const neededBy = record.kind === 'purchase' ? textField(record, 'needed_by') : null
  const purchaseDue: Due | null = neededBy === null ? null : { when: 'date', date: neededBy }
  const purchaseLate = purchaseDue === null ? null : latenessMs(purchaseDue, now, parseDueStamp)
  const effectiveDue = due.when === 'unstated' && purchaseDue !== null ? purchaseDue : due
  const effectiveLate = lateMs === null ? purchaseLate : lateMs

  const consequence = readConsequence(record.data)
  const waitingKey = WAITING_FIELD[record.kind]
  const updatedMs = parseLocalStamp(record.updatedAt)

  return {
    record,
    state,
    band: workBand(state.progress, effectiveLate, putDownReason(record.kind, record.data)),
    due: effectiveDue,
    lateMs: effectiveLate,
    waitingOn: waitingKey === undefined ? null : textField(record, waitingKey),
    costs: consequence === null ? null : consequence.what,
    putDown: putDownReason(record.kind, record.data),
    effortHours: numberField(record, 'effort_hours'),
    ageMs: updatedMs === null ? null : now - updatedMs,
  }
}

/**
 * Which band a piece of work belongs in.
 *
 * THE ORDER OF THESE TESTS IS THE DESIGN. A finished thing is settled even if its stored date has
 * passed — an obligation fulfilled two days after it was owed is not a thing to do today — so
 * `finished` is tested before lateness. Everything after that reads in the order a person would
 * ask: has it stopped, is it late, was it put down deliberately, is somebody on it.
 *
 * `unclassified` IS "needs a person" AND THAT IS DELIBERATE. A word nobody has classified is a
 * question for a person — see the head of shared/work.ts — and the alternative is filing it under
 * "being worked on", which is a guess that it is fine.
 */
export function workBand(
  progress: Progress | null,
  lateMs: number | null,
  putDown: PutDownReason | null,
): WorkBand {
  if (progress === 'finished') return 'settled'
  if (progress === 'stopped_short') return 'needs-a-person'
  if (lateMs !== null && lateMs > 0) return 'needs-a-person'
  if (progress === 'unclassified') return 'needs-a-person'
  if (progress === 'paused' || putDown !== null) return 'put-down'
  return 'in-hand'
}

/**
 * The order inside the first band: how late, then whether it is blocked, then how long it has sat.
 *
 * WHY LATENESS FIRST AND AGE LAST. A missed date is a promise to somebody outside this project; an
 * old record is only old. Sorting the band by write time — which is what the page did before — put
 * every overdue obligation in `greenhouse` behind "Show all 26", because a record nobody has touched
 * since the day it was filed sorts last on `updatedAt` precisely when it is most overdue.
 *
 * The record id is the final tie-break so that two rows written in the same second cannot swap
 * places between two draws.
 */
export function compareWork(a: WorkReading, b: WorkReading): number {
  const lateA = a.lateMs !== null && a.lateMs > 0 ? a.lateMs : -1
  const lateB = b.lateMs !== null && b.lateMs > 0 ? b.lateMs : -1
  if (lateA !== lateB) return lateB - lateA
  const blockedA = a.waitingOn === null ? 0 : 1
  const blockedB = b.waitingOn === null ? 0 : 1
  if (blockedA !== blockedB) return blockedB - blockedA
  const ageA = a.ageMs ?? -1
  const ageB = b.ageMs ?? -1
  if (ageA !== ageB) return ageB - ageA
  return a.record.id < b.record.id ? -1 : 1
}

// ============================================================================ structure

/** One module, read into the facts its row prints. Nothing here is stored; all of it is counted. */
export interface ModuleReading {
  record: RecordListItem
  /** The stored lifecycle word, or null when nobody has chosen one. Null is the ordinary case. */
  lifecycle: string | null
  /** Checklist items that are `done`, and how many there are. Both zero means an empty checklist. */
  checked: number
  items: number
  /**
   * Problems linked to this module that are still open, and how many are linked at all.
   *
   * `linked === 0` IS NOT `open === 0`. The first says nothing has ever been filed against this
   * subsystem, the second says everything filed against it is closed, and only the second is good
   * news. The row prints the difference.
   */
  openProblems: number
  linkedProblems: number
}

/** One pipeline, read into the facts its row prints. */
export interface PipelineReading {
  record: RecordListItem
  /** Blocks whose stored state is `done`, and how many the order names. */
  done: number
  steps: number
  /** The first block that is not done: its own name, its position, and its stored state. */
  standing: { name: string; at: number; state: string | null } | null
  /**
   * Steps whose own state word says they stopped short — `failed` or `blocked`.
   *
   * WHY THIS IS ON THE ROW AND NOT ONLY THE STANDING STEP. The rail counts what needs a person in
   * each family, and in `greenhouse` that count under Structure includes blocks. A page that drew no
   * block row and named only the FIRST not-done step would leave the reader unable to reach the
   * other two on a pipeline with three blocked steps — the number in the rail would be true and the
   * page under it would not account for it. `progressOf` classifies the words, so this and the
   * attention rule cannot disagree about what `blocked` means.
   */
  stopped: number
  /**
   * Ids in `blockIds` that no record in this project answers to.
   *
   * Never silently dropped from the denominator. A pipeline whose order names a block that is not
   * there is a pipeline whose progress cannot be counted, and the row says so instead of counting
   * what is left and calling it the whole.
   */
  missing: number
}

/**
 * Read a module. `problemsBy` is the caller's join — see `linkedProblemCounts`.
 *
 * THE CHECKLIST IS COUNTED, NOT STORED, and the page says so once. A module's `state` word is
 * deliberately coarse and says nothing about how much is done — that is argued at length beside
 * MODULE_STATES in kinds.ts — so the two facts are drawn as two different things on the row.
 */
export function readModule(
  record: RecordListItem,
  problemsBy: ReadonlyMap<string, { open: number; linked: number }>,
): ModuleReading {
  const parts = dataOf(record)['parts']
  let checked = 0
  let items = 0
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (!isObject(part)) continue
      const list = part['items']
      if (!Array.isArray(list)) continue
      for (const item of list) {
        if (!isObject(item)) continue
        items += 1
        if (item['state'] === 'done') checked += 1
      }
    }
  }
  const lifecycleRaw = textField(record, 'state')
  const problems = problemsBy.get(record.id)
  return {
    record,
    lifecycle: lifecycleRaw,
    checked,
    items,
    openProblems: problems?.open ?? 0,
    linkedProblems: problems?.linked ?? 0,
  }
}

/**
 * How many problems each module is linked to, and how many of those are open.
 *
 * THE LINK IS THE ONLY EVIDENCE. A problem is counted against a module when a typed link joins the
 * two, in either direction, and never because a title mentions the module — a rule that reads
 * titles is a rule a title can fool, which is the finding that produced shared/work.ts in the first
 * place. The link TYPE is not filtered on: `about`, `relates_to`, `discusses` and `implements` all
 * say this problem and this subsystem are joined, and picking a favourite here would silently drop
 * the ones written with the other word.
 */
export function linkedProblemCounts(
  records: readonly PanelRecord[],
  links: readonly { fromId: string; toId: string }[],
): Map<string, { open: number; linked: number }> {
  const problems = new Map<string, PanelRecord>()
  const modules = new Set<string>()
  for (const record of records) {
    if (record.kind === 'problem') problems.set(record.id, record)
    if (record.kind === 'module') modules.add(record.id)
  }
  const counts = new Map<string, { open: number; linked: number }>()
  // A module and a problem can be joined by more than one link, and the count is of PROBLEMS.
  // Nested rather than one joined string key: a record id is opaque, so a delimiter would be a
  // guess about what an id may not contain, and this needs no such guess.
  const seen = new Map<string, Set<string>>()
  for (const link of links) {
    for (const [moduleId, problemId] of [
      [link.fromId, link.toId],
      [link.toId, link.fromId],
    ]) {
      if (moduleId === undefined || problemId === undefined) continue
      if (!modules.has(moduleId)) continue
      const problem = problems.get(problemId)
      if (problem === undefined) continue
      const already = seen.get(moduleId) ?? new Set<string>()
      if (already.has(problemId)) continue
      already.add(problemId)
      seen.set(moduleId, already)
      const entry = counts.get(moduleId) ?? { open: 0, linked: 0 }
      entry.linked += 1
      if (progressOf(dataOf(problem)['state']) === 'stopped_short') entry.open += 1
      counts.set(moduleId, entry)
    }
  }
  return counts
}

/** Ordinary missing links are shown by the rows' short marks, without a page-wide sentence. */
export function problemLinkNote(_readings: readonly ModuleReading[]): string | null {
  return null
}

/** An absent lifecycle is shown on its row, without a page-wide sentence. */
export function postureNote(_readings: readonly ModuleReading[]): string | null {
  return null
}

/** Read a pipeline against the block records this project holds. */
export function readPipeline(record: RecordListItem, byId: ReadonlyMap<string, PanelRecord>): PipelineReading {
  const ids = listField(record, 'blockIds') ?? []
  let done = 0
  let missing = 0
  let stopped = 0
  let standing: PipelineReading['standing'] = null
  ids.forEach((id, index) => {
    const block = byId.get(id)
    if (block === undefined) {
      missing += 1
      return
    }
    const word = textField(block, 'state')
    if (progressOf(word) === 'stopped_short') stopped += 1
    if (word === 'done') {
      done += 1
      return
    }
    if (standing === null) {
      standing = {
        name: blockNameIn(block.title, record.title),
        // One-based and padded the way a person counts steps, not the way an array indexes them.
        at: index + 1,
        state: word,
      }
    }
  })
  return { record, done, steps: ids.length, standing, stopped, missing }
}

// ============================================================================ what we believe

/**
 * A proposal, read into the row that asks its question.
 *
 * THE `question` FIELD IS THE ROW'S TITLE AND THE RECORD'S TITLE IS NOT. A proposal's title is a
 * label somebody wrote for a list; its `question` is the fork, and it is a required field precisely
 * because "a proposal without it is a piece of reasoning with nothing at stake". A page that leads
 * with the title is asking the reader to open four records to find out what four decisions are.
 */
export interface ProposalReading {
  record: RecordListItem
  /** The fork, verbatim. Null when nobody wrote one — which makes the proposal incomplete. */
  question: string | null
  options: string[] | null
  recommendation: string | null
  /** How long it has been waiting for a person, in ms. Measured on when it was filed, not written. */
  waitingMs: number | null
  /** True when the server's own `needs-you` answer still lists this proposal as yours to settle. */
  waitingOnYou: boolean
}

export function readProposal(record: RecordListItem, now: number, waitingOnYou: boolean): ProposalReading {
  const created = parseLocalStamp(record.createdAt)
  return {
    record,
    question: textField(record, 'question'),
    options: listField(record, 'options'),
    recommendation: textField(record, 'recommendation'),
    waitingMs: created === null ? null : now - created,
    waitingOnYou,
  }
}

/** A claim: the measurement, how it was taken, and what it was taken on. */
export interface ClaimReading {
  record: RecordListItem
  state: RecordState
  method: string | null
  /**
   * WHAT it was measured on and WHEN, in prose — "transplant demo replays, 2026-05".
   *
   * NOT A DATE, which is the mistake this field's name invites and which cost a row on `#/belief`
   * its layout: drawn in the right-hand cell beside a stamp, at `white-space: nowrap`, one of these
   * pushed the whole page 588px wider than a phone. It is a sentence and it wraps like one.
   */
  measuredOn: string | null
  /** The named measurements, as `name value` pairs. Null when nobody recorded any. */
  numbers: string | null
  confidence: string | null
}

/**
 * The named measurements a claim rests on, flattened for one line.
 *
 * `numbers` is declared as `Record<string, number>` so that every measurement is NAMED — the
 * argument is beside the field in kinds.ts. Reading it with `textField` returned null for every
 * claim in the corpus, silently, because an object is not a string: the row simply had no numbers
 * on it and nothing said so. Twelve of the seventeen claims in `panelx` carry one.
 */
export function readNumbers(record: Pick<PanelRecord, 'data'>): string | null {
  const raw = dataOf(record)['numbers']
  if (!isObject(raw)) return null
  const pairs = Object.entries(raw)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    .map(([k, v]) => `${k} ${v}`)
  return pairs.length === 0 ? null : pairs.join(' · ')
}

export function readClaim(record: RecordListItem): ClaimReading {
  return {
    record,
    state: stateOf(record),
    method: textField(record, 'method'),
    measuredOn: textField(record, 'measured_on'),
    numbers: readNumbers(record),
    confidence: textField(record, 'confidence'),
  }
}

/** A decision: when it was made, why, and what would reopen it. */
export interface DecisionReading {
  record: RecordListItem
  decidedOn: string | null
  because: string | null
  revisitWhen: string | null
  rejected: string[] | null
}

export function readDecision(record: RecordListItem): DecisionReading {
  return {
    record,
    decidedOn: textField(record, 'decided_on'),
    because: textField(record, 'because'),
    revisitWhen: textField(record, 'revisit_when'),
    rejected: listField(record, 'alternatives_rejected'),
  }
}

/** A direction: how far it has been taken, and what is next. */
export interface DirectionReading {
  record: RecordListItem
  depth: string | null
  next: string | null
  blockedOn: string | null
  question: string | null
}

export function readDirection(record: RecordListItem): DirectionReading {
  return {
    record,
    depth: textField(record, 'depth'),
    next: textField(record, 'next'),
    blockedOn: textField(record, 'blocked_on'),
    question: textField(record, 'question'),
  }
}

// ============================================================================ might do

export const MAYBE_BANDS = ['live', 'parked', 'want-to-try', 'dropped'] as const
export type MaybeBand = (typeof MAYBE_BANDS)[number]

/** The heading, and nothing under it — see the note on WORK_BAND_WORDS. */
export const MAYBE_BAND_WORDS: Readonly<Record<MaybeBand, { heading: string }>> = {
  live: { get heading(): string { return t('g7a.ideas.live') } },
  parked: { get heading(): string { return t('g7a.ideas.parked') } },
  'want-to-try': { get heading(): string { return t('g7a.ideas.wantTry') } },
  dropped: { get heading(): string { return t('g7a.ideas.dropped') } },
}

export interface MaybeReading {
  record: RecordListItem
  state: RecordState
  band: MaybeBand
  /** What would have to exist first. An idea's `would_need`. */
  wouldNeed: string[] | null
  /** Why it is parked. An idea keeps this in `parked_because` — see the exception in work.ts. */
  parkedBecause: string | null
  /** A wanna_try's own two fields: what makes it worth an hour, and roughly what it would cost. */
  why: string | null
  effort: string | null
}

export function readMaybe(record: RecordListItem): MaybeReading {
  const state = stateOf(record)
  const putDown = putDownReason(record.kind, record.data)
  return {
    record,
    state,
    band:
      record.kind === 'wanna_try'
        ? 'want-to-try'
        : state.progress === 'finished'
          ? 'dropped'
          : state.progress === 'paused'
            ? 'parked'
            : 'live',
    wouldNeed: listField(record, 'would_need'),
    parkedBecause: putDown === null ? null : putDown.why,
    why: textField(record, 'why'),
    effort: textField(record, 'effort'),
  }
}
