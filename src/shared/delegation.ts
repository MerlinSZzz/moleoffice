// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WIRE SHAPE OF A PACKAGE: the words a package can be in, the work it suits, and the row the
 * delegation column draws.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS IN src/shared
 * ---------------------------------------------------------------------------------------
 *
 * The server works out a package's state and writes the row; the page draws it. Both need the same
 * six state words and the same rule for which one wins, and two copies of a precedence rule are
 * two rules free to disagree — the ninth invariant in USER.md. Criterion F16 points 7 and 8 say
 * the column is drawn from the records rather than from a second store, and this file is the shape
 * of that drawing, declared once.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS STORED AND WHAT IS WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * NOTHING HERE IS STORED. A task's `package` field and its `takenOutside`, `returns` and
 * `completed` fields are the facts (declared in src/shared/kinds.ts). The state below is a reading
 * of those facts and of the live claims on the record, computed fresh every time the column is
 * asked for, so a take, a return or a confirmation shows up the moment it is written and there is
 * no state row to fall out of step.
 */

import type { ParticipantRef } from './participants.ts'
import type { WordKey } from './i18n.ts'

/**
 * WHICH KIND OF OUTSIDE WORK A PACKAGE SUITS. There are three, and there is no fourth.
 *
 * The words are stored, so they keep their underscores; `packageSuitWord` in words.ts is what a
 * person reads. Each one is a kind of work that can be handed to a chat window that cannot reach
 * Mole Office: a module built on its own, desk work such as planning and finding things out, and
 * building from pictures for a chat that can read them.
 */
export const PACKAGE_SUITS = ['own_module', 'desk_work', 'from_pictures'] as const
export type PackageSuit = (typeof PACKAGE_SUITS)[number]
export const PACKAGE_SUIT_NAMES: readonly PackageSuit[] = PACKAGE_SUITS

/** Judgments a new inspector sends, and the older words kept in stored checks. */
export const PACKAGE_INSPECTOR_JUDGMENTS = ['done', 'off_target', 'narrower', 'more_than_asked', 'unfinished'] as const
const OLDER_PACKAGE_JUDGMENTS = ['part', 'not'] as const
export const PACKAGE_OLD_CHECK_JUDGMENTS = ['done', ...OLDER_PACKAGE_JUDGMENTS] as const
export const ALL_PACKAGE_CHECK_JUDGMENTS = [...PACKAGE_INSPECTOR_JUDGMENTS, ...OLDER_PACKAGE_JUDGMENTS] as const

/**
 * THE ONE SENTENCE ABOUT A PACKAGE'S FILES, criterion F16 point 1 as corrected by decision
 * 5fIvP6qTPzgM (the ruling on proposal _bCBYmUSTJDf, option 1).
 *
 * A task package names the modules the work is in, and the files come from those modules' own rows
 * in the implementation map. What a reply and an export print under those files is WRITTEN HERE
 * and nowhere else, so the sentence cannot come to two places and disagree: it says these are the
 * files of the modules this work is in — a module's own file list handed to the reader — and never
 * that they are the files this task owns, which would be false. Decision 5fIvP6qTPzgM words it that way.
 *
 * THE THREE ANSWERS ARE NEVER ONE. No module named; modules named and none of them has any stated
 * code; modules named and some have code and some do not, in which case the ones that do not are
 * named. Leaving a module out of the answer would be a silent narrowing, and naming all of them at
 * the head would say "all" of a list nobody read.
 */
export function thePackageFilesSentence(files: {
  namedModuleCount: number
  modulesWithNoStatedCode: string[]
}): string {
  if (files.namedModuleCount === 0) {
    return 'The package names no module, so it carries no file list: which code the work is in has not been said, ' +
      'and nothing is inferred from a link or a title. A module is named at packaging, through POST /api/delegation.'
  }
  // THE SECOND ANSWER: modules were named and none of them has any stated code — not the same
  // absence as case 1, and said differently so a reader can tell which one they got.
  if (files.modulesWithNoStatedCode.length === files.namedModuleCount) {
    return `The work is in ${files.namedModuleCount} module(s) (${files.modulesWithNoStatedCode.join(', ')}) and ` +
      'none of them has any stated code, so the files are not carried here. Stating code is POST ' +
      '/api/implementation on a module. When something is stated, the files the export carries are the files of ' +
      'the modules this work is in — never the files this task owns, because a task is work done on code, not code.'
  }
  const lacking =
    files.modulesWithNoStatedCode.length === 0
      ? ''
      : ' The module(s) ' +
        files.modulesWithNoStatedCode.join(', ') +
        ' name no stated code and are counted here rather than left out.'
  return 'The files the export carries are the files of the modules this work is in, not the files this task owns: ' +
    `the export states the code stated for those modules in the implementation map. This is a module's file list, ` +
    'not a list somebody chose for this task.' + lacking
}

/**
 * THE FILES OF THE NAMED MODULES, as the column row and the package reply both carry them.
 * `stated` is the rows `statedFor` answers for that module in the implementation map: the code
 * somebody stated for the module, and nothing worked out or inferred.
 */
export interface PackageModuleFiles {
  recordId: string
  /** The module's own title, or null when the record it named no longer exists. */
  title: string | null
  repositoryId: string
  pattern: string
  relation: string
  authority: string
}

/** True when this word is one of the three a package may suit. */
export function isPackageSuit(value: unknown): value is PackageSuit {
  return typeof value === 'string' && (PACKAGE_SUITS as readonly string[]).includes(value)
}

/**
 * THE THREE FORMS AN OUTSIDE RETURN CAN COME IN, declared once. Criterion F16 point 5.
 *
 * `text` is words somebody outside wrote. `pictures` is a list of paths to pictures that came in
 * through the pictures door. `zip` is the path of a zip that came in through the returned-files
 * door. The stored field on an entry says which of the entry's three content keys to read, so the
 * list is the one vocabulary the write shape, the stored entry and the reading all share.
 *
 * IT IS DECLARED HERE because `words.ts` needs it for a reading and `kinds.ts` needs it for the
 * field's own type; two lists of the same three words would be two things that must agree with
 * nothing making them agree.
 */
export const RETURN_FORMS = ['text', 'pictures', 'zip'] as const
export type ReturnForm = (typeof RETURN_FORMS)[number]

/**
 * WHERE A PACKAGE HAS GOT TO. Six words and no seventh.
 *
 * `to_do` is a real answer and not a gap: it is a packaged task nobody has taken. `taken` is somebody working on it:
 * an agent that took it inside or holds a live claim on it, or a person who promised it outside the office. `aligned`
 * is the maker's yes to the taker's newest restatement, so a restatement after a yes is `taken` again until it is
 * answered. `handed_back` is the taker saying what it did, or something that came back from outside, waiting for the
 * maker's answer. `returned` is the maker sending points back to the taker with words. `done` is every point accepted
 * by the maker, or the task confirmed complete.
 */
export const PACKAGE_STATES = ['to_do', 'taken', 'aligned', 'handed_back', 'done', 'returned'] as const
export type PackageState = (typeof PACKAGE_STATES)[number]

/** The facts the state word is worked out from. Each one is already stored somewhere else. */
export interface PackageFacts {
  /** `completed` is written on the task. */
  completed: boolean
  /** `returns` holds at least one entry. */
  returned: boolean
  /** `takenOutside` holds at least one entry. */
  outside: boolean
  /** A live claim on the record exists. */
  claimed: boolean
  /** The acts on an inside package, from its own lists. Absent for an outside package. */
  inside?: PackageActs
}

/** The acts on an inside package that move its state, each list oldest first. A check moves no state. */
export interface PackageActs {
  pointIds: readonly string[]
  takenInside: readonly InsideTake[]
  alignments: readonly InsideTake[]
  alignmentAnswers: readonly PackageAlignmentAnswer[]
  handedBack: readonly InsideTake[]
  acceptances: readonly PackageAcceptance[]
}

/**
 * THE STATE OF A PACKAGE, worked out from its acts and never stored. Criterion F16 point 7.
 *
 * A row can be both claimed by an agent and taken outside by a person, and that is a real state worth drawing: the row
 * carries `heldBy` and `outsideName` for exactly it. This function answers only the state WORD.
 *
 * TWO READINGS, IN ONE PLACE. An act written since order numbers were given (`order`) is read in that order: a take
 * gives `taken`, an answer to a restatement gives `aligned` or `taken`, a restatement while aligned gives `taken` again
 * and moves no other state, a hand-back gives `handed_back`, and an
 * acceptance gives `done` once the maker has accepted every point, `returned` when it sent a point back, and leaves the
 * state as it was otherwise. An entry written before order numbers has none. Those are read first, by the rule of their
 * day, furthest along wins: a hand-back, then an aligned answer, then a return from outside, then a take outside or
 * inside or a live claim, then nothing. A completed task is `done` whatever its acts say.
 */
export function packageStateOf(facts: PackageFacts): PackageState {
  if (facts.completed) return 'done'
  const acts = facts.inside
  let state: PackageState = 'to_do'
  if (acts !== undefined && acts.handedBack.some(isOrderless)) state = 'handed_back'
  else if (acts !== undefined && theAlignmentOf(theOrderless(acts)) === 'aligned') state = 'aligned'
  else if (facts.returned) state = 'handed_back'
  else if (facts.outside || facts.claimed || (acts !== undefined && acts.takenInside.some(isOrderless))) state = 'taken'
  if (acts === undefined) return state
  const answers = new Map<string, PackageAcceptedPoint['answer']>()
  for (const act of theOrderedActsOf(acts)) {
    if (act.kind === 'acceptance') {
      for (const point of act.entry.points) answers.set(point.pointId, point.answer)
      if (acts.pointIds.every((pointId) => answers.get(pointId) === 'accepted')) state = 'done'
      else if (act.entry.points.some((point) => point.answer === 'returned')) state = 'returned'
    } else if (state === 'done') {
      continue
    } else if (act.kind === 'take') {
      state = 'taken'
    } else if (act.kind === 'answer') {
      if (state !== 'handed_back') state = act.entry.answer === 'aligned' ? 'aligned' : 'taken'
    } else if (act.kind === 'restatement') {
      if (state === 'aligned') state = 'taken'
    } else {
      state = 'handed_back'
    }
  }
  return state
}

/**
 * THE ANSWER TO THE NEWEST RESTATEMENT: none when nobody restated the package, waiting when the newest restatement has
 * no answer after it, else that answer. An ordered restatement takes the newest answer with a greater order. An entry
 * from before order numbers is read by the rule of its day: as many answers as restatements means the last one answered.
 */
export function theAlignmentOf(acts: Pick<PackageActs, 'alignments' | 'alignmentAnswers'>): 'none' | 'waiting' | 'aligned' | 'differs' {
  if (acts.alignments.length === 0) return 'none'
  return theAnswerToTheNewest(acts)?.answer ?? 'waiting'
}

/** The newest answer to the newest restatement, read as `theAlignmentOf` reads it. Undefined when there is none. */
export function theAnswerToTheNewest(acts: Pick<PackageActs, 'alignments' | 'alignmentAnswers'>): PackageAlignmentAnswer | undefined {
  const newest = acts.alignments.at(-1)
  if (newest === undefined) return undefined
  const answers = acts.alignmentAnswers
  return newest.order === undefined
    ? answers.filter((answer) => answer.order !== undefined).at(-1) ?? (answers.length < acts.alignments.length ? undefined : answers.at(-1))
    : answers.filter((answer) => answer.order !== undefined && answer.order > newest.order!).at(-1)
}

/** The next order number on a package: one more than the number of acts it holds, old ones included. */
export function theNextOrderOf(lists: readonly (readonly unknown[] | undefined)[]): number {
  return 1 + lists.reduce((sum, list) => sum + (list?.length ?? 0), 0)
}

const isOrderless = (entry: { order?: number }): boolean => entry.order === undefined

function theOrderless(acts: PackageActs): Pick<PackageActs, 'alignments' | 'alignmentAnswers'> {
  return { alignments: acts.alignments.filter(isOrderless), alignmentAnswers: acts.alignmentAnswers.filter(isOrderless) }
}

type AnOrderedAct =
  | { kind: 'take'; order: number; entry: InsideTake }
  | { kind: 'restatement'; order: number; entry: InsideTake }
  | { kind: 'answer'; order: number; entry: PackageAlignmentAnswer }
  | { kind: 'handBack'; order: number; entry: InsideTake }
  | { kind: 'acceptance'; order: number; entry: PackageAcceptance }

function theOrderedActsOf(acts: PackageActs): AnOrderedAct[] {
  const ordered = <K extends AnOrderedAct['kind'], E extends { order?: number }>(kind: K, list: readonly E[]) =>
    list.flatMap((entry) => (entry.order === undefined ? [] : [{ kind, order: entry.order, entry }]))
  return ([
    ...ordered('take', acts.takenInside),
    ...ordered('restatement', acts.alignments),
    ...ordered('answer', acts.alignmentAnswers),
    ...ordered('handBack', acts.handedBack),
    ...ordered('acceptance', acts.acceptances),
  ] as AnOrderedAct[]).sort((a, b) => a.order - b.order)
}

/** The refusal of a return that carries no words, no picture and no zip. */
export const NOTHING_WAS_BROUGHT_BACK =
  'Nothing was brought back: the words, the pictures and the zip are all empty. A return carries at least one ' +
  'of them. Nothing was written.'

/** The last sentence of every `responsibleWhy`. */
export const THE_PERSON_MAY_ALWAYS_CONFIRM = 'The person may always confirm it.'

/** The row's one sentence: the only gap in a package that the row's tag and facts do not show. */
export const NO_MODULE_IS_NAMED = 'No module is named, so the files are not carried.'

/**
 * ONE ROW OF THE DELEGATION COLUMN, as the server hands it over and the page draws it.
 *
 * `heldBy` and `outsideName` are kept apart from `state` on purpose: a package can be held by an
 * agent right now AND already promised outside, and collapsing the two into one word would lose
 * one of the two facts. `responsible` answers who owns the task to the end, and `responsibleWhy`
 * is the sentence saying how that was worked out — the whole of criterion F16 point 8.
 */
export interface PackageParent { kind: 'decision' | 'task'; id: string }
export interface PackageMaterial { kind: 'decision' | 'point' | 'bundle' | 'task'; ref: string; says: string }
/** `order` is the act's place among every act on the package, from 1. Entries written before order numbers have none. */
export interface InsideTake { by: { actorType: string; actorId: string }; at: string; order?: number }
export interface PackageRestatement extends InsideTake {
  restated: string
  /** The fixed shape, or the older free text kept exactly as it was written. */
  plan: string | PackagePlanShape
  /** The supervisor's sentence for going on past the office's hints, when it wrote one. */
  goOnWhy?: string
  /**
   * The office's hints, worked out once by the align door when it wrote this entry. Present on an entry written from
   * the round that stored them, even when it holds no hint. Absent on an earlier entry, which means they were not
   * stored and not that there was no hint.
   */
  hints?: PlanHint[]
}
export interface PackageAlignmentAnswer extends InsideTake { answer: 'aligned' | 'differs'; words: string }
export interface PackagePointOutcome { pointId: string; outcome: 'done' | 'part' | 'not'; words: string }
/** `run` is the run whose own run key wrote the hand-back; absent when no run key proved one. */
export interface PackageHandback extends InsideTake { points: PackagePointOutcome[]; run?: string }
/** One point as the inspector judged it. Older checks have no `rulesKept` answer. */
export interface PackageCheckPoint { pointId: string; judged: (typeof ALL_PACKAGE_CHECK_JUDGMENTS)[number]; holds: boolean; rulesKept?: boolean; why: string; outcome: 'done' | 'part' | 'not' }
/** `run` and `points` are written by the inspector of the run that handed the package back, and by nobody else. */
export interface PackageCheck extends InsideTake { answer: 'holds' | 'refused'; words: string; run?: string; points?: PackageCheckPoint[] }
/** The maker's answer to one handed-back point. A returned point carries the words that say why. */
export interface PackageAcceptedPoint { pointId: string; answer: 'accepted' | 'returned'; words?: string }
/** One answer of the maker, or of the person, to the points of a hand-back. */
export interface PackageAcceptance extends InsideTake { points: PackageAcceptedPoint[] }
export interface InsideDelegation {
  waiting: boolean
  takenBy: ParticipantRef | null
  takenAt: string | null
  alignment: 'none' | 'waiting' | 'aligned' | 'differs'
  handedBack: boolean
  handedBackAt: string | null
  /** The latest answer of the person or the parent's agent. An inspector's check is not counted here. */
  check: 'none' | 'holds' | 'refused'
  checkWords: string | null
}

/**
 * THE SHAPE A SUPERVISOR'S PLAN HAS, from 17 November 2026. A supervisor plans in outcomes: for each
 * worker it decides which whole outcome that worker makes, and for the package it decides how many
 * waves the work takes and what outside the line each later wave waits for. The worker decides its
 * own steps, so no field here holds them.
 *
 * A plan is stored on the alignment either as this object or as the older free text. `readAStoredPlan`
 * is the one reading of the stored value: it never guesses a shape the value does not have, so a plan
 * written before this shape existed is shown as the words it was.
 */
/** The keys a structured plan may hold. `steps` is not one of them: a worker's steps are its own. */
export const PACKAGE_PLAN_KEYS = ['workers', 'waves', 'waits'] as const
/** The keys one worker's line may hold. There is deliberately no field for the worker's own steps. */
export const PLANNED_WORKER_KEYS = [
  'worker',
  'outcome',
  'points',
  'files',
  'difficulty',
  'difficultyWhy',
  'model',
  'modelWhy',
] as const

export interface PlannedWorker {
  /** The worker's name, as its starter will start it. */
  worker: string
  /** The whole outcome this worker makes. */
  outcome: string
  /** The package points the worker takes: part of one, up to several. */
  points: string[]
  /** The files or areas the worker changes. Two workers naming the same one is a hint. */
  files: string[]
  /** Simple, middling or hard. Empty when the plan left it out, which is a hint and not a refusal. */
  difficulty: string
  /** Why that difficulty. Empty when the plan left it out, which is a hint and not a refusal. */
  difficultyWhy: string
  /** The model the worker is given. */
  model: string
  /** Why that model. Empty when the plan left it out, which is a hint and not a refusal. */
  modelWhy: string
}

export interface PackagePlanShape {
  workers: PlannedWorker[]
  /** How many waves the package takes. One wave is the ordinary answer. */
  waves: number
  /** For each wave after the first, the thing outside the line it waits for. Empty entries are hints. */
  waits: string[]
}

/** A stored plan: the older free text, or the shape above. */
export type StoredPlan =
  | { kind: 'text'; text: string }
  | { kind: 'shape'; plan: PackagePlanShape }

const isABag = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const nonEmptyWords = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''
const wordsOrMissing = (value: unknown): value is string => value === undefined || typeof value === 'string'
const onlyTheseKeys = (held: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(held).every(key => keys.includes(key))

function readAPlannedWorker(value: unknown): PlannedWorker | null {
  if (!isABag(value) || !onlyTheseKeys(value, PLANNED_WORKER_KEYS)) return null
  const worker = value['worker']
  const outcome = value['outcome']
  const points = value['points']
  const files = value['files']
  const difficulty = value['difficulty']
  const difficultyWhy = value['difficultyWhy']
  const model = value['model']
  const modelWhy = value['modelWhy']
  if (!nonEmptyWords(worker) || !nonEmptyWords(outcome) || !nonEmptyWords(model)) return null
  if (!Array.isArray(points) || points.length === 0 || !points.every(nonEmptyWords)) return null
  if (!Array.isArray(files) || files.length === 0 || !files.every(nonEmptyWords)) return null
  if (!wordsOrMissing(difficulty) || !wordsOrMissing(difficultyWhy) || !wordsOrMissing(modelWhy)) return null
  return {
    worker: worker.trim(),
    outcome: outcome.trim(),
    points: points.map(point => point.trim()),
    files: files.map(file => file.trim()),
    difficulty: (difficulty ?? '').trim(),
    difficultyWhy: (difficultyWhy ?? '').trim(),
    model: model.trim(),
    modelWhy: (modelWhy ?? '').trim(),
  }
}

/**
 * READ ONE STORED PLAN, AND NEVER GUESS. A string is the older free text and is returned whole. An
 * object is the shape above and is returned only when every key and every value is in it. Anything
 * else answers null, so a page can say it could not read the plan rather than inventing one.
 */
export function readAStoredPlan(value: unknown): StoredPlan | null {
  if (nonEmptyWords(value)) return { kind: 'text', text: value.trim() }
  if (!isABag(value) || !onlyTheseKeys(value, PACKAGE_PLAN_KEYS)) return null
  const workers = value['workers']
  const waves = value['waves']
  const waits = value['waits']
  if (!Array.isArray(workers) || workers.length === 0) return null
  if (typeof waves !== 'number' || !Number.isInteger(waves) || waves < 1) return null
  if (waits !== undefined && (!Array.isArray(waits) || !waits.every(wait => typeof wait === 'string'))) return null
  const read = workers.map(readAPlannedWorker)
  if (read.some(worker => worker === null)) return null
  return { kind: 'shape', plan: { workers: read as PlannedWorker[], waves, waits: ((waits ?? []) as string[]).map(wait => wait.trim()) } }
}

/**
 * THE THINGS THE OFFICE POINTS OUT ABOUT A PLAN. A hint never refuses the alignment.
 *
 * The order is the order the align door answers and the page draws, grouped by what the hint is about rather than by
 * the worker it happens to name, so a plan read twice always gives its hints in one order.
 */
export const PLAN_HINT_CODES = [
  'sameFiles',
  'moreWorkersThanPoints',
  'strongModelNoReason',
  'strongModelNoModel',
  'difficultyNotALabel',
  'missingDifficultyOrReason',
  'moreThanOneWave',
  'waveWaitsForNothing',
] as const
export type PlanHintCode = (typeof PLAN_HINT_CODES)[number]
export interface PlanHint {
  code: PlanHintCode
  values: Readonly<Record<string, string | number>>
}

/** The word list's key for each hint, read by the server's notice and by the page alike. */
export const PLAN_HINT_WORD_KEYS: Readonly<Record<PlanHintCode, WordKey>> = {
  sameFiles: 'delegation.hint.sameFiles',
  moreWorkersThanPoints: 'delegation.hint.moreWorkersThanPoints',
  strongModelNoReason: 'delegation.hint.strongModelNoReason',
  strongModelNoModel: 'delegation.hint.strongModelNoModel',
  difficultyNotALabel: 'delegation.hint.difficultyNotALabel',
  missingDifficultyOrReason: 'delegation.hint.missingDifficultyOrReason',
  moreThanOneWave: 'delegation.hint.moreThanOneWave',
  waveWaitsForNothing: 'delegation.hint.waveWaitsForNothing',
}

export interface DelegationRow {
  /** The packaged task. */
  recordId: string
  title: string
  /** Which of the three kinds of outside work the packager said this suits. */
  suits: PackageSuit | null
  parent: PackageParent | null
  lines: string[]
  pointIds: string[]
  materials: PackageMaterial[]
  pointCount: number
  inside: InsideDelegation | null
  /** The plan blocks linked to the task by `relates_to`, sorted by id, whose cards draw this package's state. */
  planBlocks: string[]
  /** The furthest-along state that is true. */
  state: PackageState
  /** The participant holding a live claim on the record, or null because nobody is. */
  heldBy: ParticipantRef | null
  /** The outside chat or person a take named, or null because no person has taken it. */
  outsideName: string | null
  /** Who is responsible for this task. Null only when the change log cannot say. */
  responsible: ParticipantRef | null
  /** One sentence saying how `responsible` was worked out. */
  responsibleWhy: string
  /** When the package was made, in local wall clock. */
  packagedAt: string
  /** The `context_bundle` record that produces this package's text. */
  bundleId: string
  /** How many code relationships are stated for the task. Zero means the package names no code. */
  statedCodeCount: number
  /** The modules the package names the work is in, with the code stated for each, read through `statedFor`. */
  modules: PackageModuleFiles[]
  /** How many modules were named, and how many stated rows came back across them. */
  namedModuleCount: number
  statedCodeFromModules: number
  /** The titles (or ids) of the named modules that have no stated code, named rather than dropped. */
  modulesWithNoStatedCode: string[]
  /** The one sentence about the files, drawn from `thePackageFilesSentence` at the one place it is written. */
  filesSays: string
  /** How many times that bundle has been exported. */
  exportCount: number
  /** How many returns from outside are recorded. */
  returnCount: number
  /** When the responsible one confirmed the task complete, or null. */
  confirmedAt: string | null
  /** The one sentence the row needs beyond its tag and facts, NO_MODULE_IS_NAMED, or null when modules are named. */
  says: string | null
}
