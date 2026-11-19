// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readStoredWord as t } from './i18n.ts'
import type { Mode } from './mode.ts'
/**
 * COUNTERS AND TIMED TRIGGERS: THE WORDS, THE SHAPES AND THE ONE NUMBER THEY SHARE.
 *
 * design/counters/ACCEPTANCE.md, criteria CT1 to CT10, on the build decision `uLV_1NVD8jeV` and one
 * more.
 *
 * A counter is a record of its own kind. Somebody adds to it by hand, or it follows an office event;
 * when one of its triggers holds it runs ONE action from a closed list and starts again from zero.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE VOCABULARIES AND THE REPLY SHAPES ARE HERE AND NOT ON THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * The kind's own declaration (src/shared/kinds.ts) builds its field descriptions from these lists,
 * the server's rules read them, and the page reads the reply types. Three copies of one closed list
 * is the defect this repository names as its own, so there is one copy and it is this file.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because it is imported by the browser.
 */

import type { ParticipantRef } from './participants.ts'
import { gapBetween } from './spacing.ts'
import { theClockChangeATypedStampFallsIn } from './time.ts'

/** The kind word, in one place, for the reason `MERGE_ENTRY_KIND` gives. */
export const COUNTER_KIND = 'counter'

// ============================================================================ the closed lists

/**
 * THE OFFICE EVENTS A COUNTER MAY FOLLOW (CT2), and nothing else in this version.
 *
 * Each is read by polling in the counters' own tick, keyed by the event's own id, so an event is
 * counted once however many ticks read it (decision `uLV_1NVD8jeV`, point 3).
 */
export const COUNTER_EVENTS = ['landing', 'run-finished', 'group-message'] as const
export type CounterEvent = (typeof COUNTER_EVENTS)[number]

/** The four kinds of trigger (CT3). A counter fires on the first of its triggers to hold. */
export const TRIGGER_KINDS = ['count', 'amount', 'quiet', 'every'] as const
export type TriggerKind = (typeof TRIGGER_KINDS)[number]

/**
 * THE QUIET CONDITIONS, of which there is one so far: a merge lane with nothing waiting.
 *
 * A list of one rather than a boolean, because CT3 says "some named quiet condition" and the second
 * one is a value added here rather than a second shape added everywhere.
 */
export const QUIET_CONDITIONS = ['merge-lane-idle'] as const
export type QuietCondition = (typeof QUIET_CONDITIONS)[number]

/**
 * THE ACTIONS, from a closed list (CT4), and nothing else in this version.
 *
 * A counter never starts an agent or a run of an agent: starting an agent spends money and quota,
 * and that press is the owner's.
 */
export const COUNTER_ACTIONS = ['message', 'task', 'job'] as const
export type CounterActionKind = (typeof COUNTER_ACTIONS)[number]

/** What one row of a counter's ledger is (CT2, CT5, CT6). The stored words. */
export const COUNTER_ROW_KINDS = ['addition', 'firing', 'held back'] as const
export type CounterRowKind = (typeof COUNTER_ROW_KINDS)[number]

// ============================================================================ what is stored

/** Who may add to a counter: anybody the registry holds, or the parties named (CT2). */
export interface WhoMayAdd {
  anyone: boolean
  who: ParticipantRef[]
}

/** One office event a counter follows (CT2). */
export type Follow =
  | { event: 'landing'; lane: string; paths?: string[] }
  | { event: 'run-finished'; pipeline: string }
  | { event: 'group-message'; group: string }

/** One trigger (CT3), as it is stored. */
export type Trigger =
  | { kind: 'count'; n: number }
  | { kind: 'amount'; m: number }
  | { kind: 'quiet'; condition: QuietCondition; lane: string; minutes: number }
  | { kind: 'every'; hours: number; from?: string }

/** One action (CT4), as it is stored. A message names participants or one group, never both. */
export type Action =
  | { kind: 'message'; to: ParticipantRef[] }
  | { kind: 'message'; group: string }
  | { kind: 'task'; title: string }
  | { kind: 'job'; job: string }

/** When a counter was paused, by whom and why (CT6). Absent means it is running. */
export interface CounterPause {
  at: string
  by: ParticipantRef
  because: string
}

// ============================================================================ what is read back

/** A participant as a reply names one: the reference, and the name a reader sees. */
export interface Party {
  kind: ParticipantRef['kind']
  id: string
  name: string
}

/** One office event a counter follows, with the sentence a reader sees. */
export type FollowReading = Follow & { words: string }

/**
 * One trigger, with the sentence a reader sees and whether it holds at the moment of the reading.
 *
 * `holdsNow` is worked out on every read from the rows and the clock, and never stored: a stored
 * copy would be wrong the moment somebody added to the counter.
 *
 * `since` is on a quiet trigger and says when the condition it watches began — when the lane it
 * names last had something waiting. NULL IS A REAL ANSWER AND IT IS NOT "LONG AGO": it means nobody
 * has recorded anything waiting in that lane, so the office cannot say how long it has been quiet,
 * and the trigger does not hold. Absent on every other kind of trigger, which watches no spell.
 */
export type TriggerReading = Trigger & {
  words: string
  holdsNow: boolean
  since?: string | null
  /**
   * WHEN A TYPED START FALLS IN A CLOCK CHANGE, the sentence saying which moment the office read it as.
   * Absent on every other trigger and outside those hours.
   */
  fromReading?: string | null
}

/** The action, with the sentence a reader sees. A group is named as well as identified. */
export type ActionReading =
  | { kind: 'message'; to: Party[]; words: string }
  | { kind: 'message'; group: { id: string; name: string }; words: string }
  | { kind: 'task'; title: string; words: string }
  | { kind: 'job'; job: string; words: string }

/** What an action answered (CT5): the ids it wrote, one sentence, and whether it is over. */
export interface ActionAnswer {
  kind: CounterActionKind
  /** The job asked for at this firing; changing the counter later cannot change it. */
  job?: string
  /** The message ids, the task id, or none yet for a job nobody has run. */
  ids: string[]
  says: string
  /**
   * WHETHER THE ACTION IS OVER. A message and a task are finished the moment they are written; an
   * office job is not, because the office marks it wanted and a runner answers later through its
   * own door. False with no ids is a job waiting for its runner, which is a real state.
   */
  finished: boolean
  /** Who answered a job firing, when somebody has. Absent on every other action and until they do. */
  answeredBy?: Party
  /** When they answered. Absent for the same reasons. */
  answeredAt?: string
}

/** One row of a counter's ledger, as a reply gives it (CT2, CT5, CT6). */
export interface CounterRowReading {
  seq: number
  what: CounterRowKind
  at: string
  /**
   * The same moment as `at` with its offset, as the office wrote it beside the stamp. On the night the clocks go
   * back `at` can name two moments an hour apart, so a program that acts on when a row was written reads this.
   * Null for a row written before the office kept the instant, because nothing is made up from its stamp.
   */
  atInstant: string | null
  /** Who added, or null because an event did, or because the office wrote the row itself. */
  by: Party | null
  /** The event that added, or null because a person or an agent did. */
  event: null | { event: CounterEvent; id: string; at: string; words: string }
  /**
   * An addition: what it added. A firing: what was reset. A held-back row: what the counter stood
   * at when the firing was held back, which is not what it stands at now — more may have been added
   * to it since, and the held-back row is a statement about the moment it was written.
   */
  count: number
  amount: number | null
  because: string
  /** Which trigger held, by its position in the counter's own list. Only on a firing. */
  trigger?: number
  /** What the action answered. Only on a firing. */
  answer?: ActionAnswer
}

/** One counter, as a reply gives it (CT1). */
export interface CounterReading {
  id: string
  title: string
  counts: string
  amountIs: string | null
  /** The count and the amount since `since`, worked out from the rows and never stored. */
  count: number
  amount: number | null
  /** When the counting now on screen began: the last firing, or the counter's own creation. */
  since: string
  createdBy: Party
  createdAt: string
  paused: null | { at: string; by: Party; because: string }
  follows: FollowReading[]
  mayAdd: { anyone: boolean; who: Party[] }
  /** Who may change the triggers, the action and who may add, in words (CT6). */
  mayChange: string
  triggers: TriggerReading[]
  action: ActionReading
  atMostOnceEvery: number
  lastFiring: CounterRowReading | null
  /**
   * When a trigger is next due, where one can be worked out. Null when none can.
   *
   * `because` is present only when the counter waits for a count: it is no timer, its count is 0,
   * and it will not fire at that moment until somebody adds to it. The sentence gives the reason to
   * an agent that reads the reply; the page draws its own words from the word lists, and it knows
   * to draw them because this field is here. A timer's due moment carries no `because`, because it
   * really will fire at its time.
   *
   * `instant` is the same moment as `at` with its offset. On the night the clocks go back `at` can name two
   * moments an hour apart, so a program that acts on the due time reads `instant`.
   */
  nextDue: null | { at: string; instant: string; trigger: number; words: string; because?: string }
  /**
   * The spell being held back right now, or null because none is. `untilInstant` is `until` with its offset, for
   * the same reason as `nextDue.instant`, and null where the office cannot read that moment.
   */
  heldBack: null | { at: string; reason: string; until: string; untilInstant: string | null }
}

/** One change to a counter's definition, read off the revision ledger (CT6). */
export interface CounterChange {
  at: string
  by: Party
  because: string
  what: string
}

// ============================================================================ the sentences

/** The sentence a reader sees for one follow. */
export function followWords(follow: Follow, mode: Mode = 'inspect'): string {
  if (mode === 'normal') {
    if (follow.event === 'landing') return t('g7a.counters.followLanding')
    if (follow.event === 'run-finished') return t('g7a.counters.followWork')
    return t('g7a.counters.followMessages')
  }
  if (follow.event === 'landing') {
    const paths = follow.paths === undefined || follow.paths.length === 0 ? '' : t('g7a.counters.followPaths', { paths: follow.paths.join(', ') })
    return t('g7a.counters.followLandingInspect', { lane: follow.lane, paths })
  }
  if (follow.event === 'run-finished') {
    return t('g7a.counters.followRunInspect', { pipeline: follow.pipeline })
  }
  return t('g7a.counters.followGroupInspect', { group: follow.group })
}

/**
 * The sentence a reader sees for one trigger.
 *
 * A TYPED START THE ZONE READ DIFFERENTLY is appended when the reading is there: on the two nights the clocks
 * change, the silent shift of an hour is said in words beside the trigger that names it. Every other trigger, and
 * every trigger outside those hours, is exactly the sentence it was before.
 */
export function triggerWords(trigger: Trigger & { fromReading?: string | null }, mode: Mode = 'inspect'): string {
  let words: string
  if (trigger.kind === 'count') words = t('g7a.counters.triggerCount', { n: trigger.n })
  else if (trigger.kind === 'amount') words = t('g7a.counters.triggerAmount', { n: trigger.m })
  else if (trigger.kind === 'quiet') {
    words = mode === 'normal' ? t('g7a.counters.triggerQuiet', { n: trigger.minutes }) : t('g7a.counters.triggerQuietInspect', { lane: trigger.lane, n: trigger.minutes })
  } else words = t('g7a.counters.triggerEvery', { n: trigger.hours })
  if (trigger.kind !== 'every' || typeof trigger.fromReading !== 'string' || trigger.fromReading === '') return words
  return words + gapBetween(words, trigger.fromReading) + trigger.fromReading
}

/** The sentence saying which moment a typed start was read as, or null when it names one moment. */
export function typedStartsReading(trigger: Trigger, zone: string): string | null {
  if (trigger.kind !== 'every' || trigger.from === undefined) return null
  const how = theClockChangeATypedStampFallsIn(trigger.from, zone)
  if (how === null) return null
  return how.kind === 'skipped'
    ? t('g7a.counters.triggerFromSkipped', { from: how.wall, readAs: how.readAt })
    : t('g7a.counters.triggerFromRepeated', { from: how.wall, readAs: how.readAt })
}

/** The sentence a reader sees for the action. `groupName` is null when the group has no name here. */
export function actionWords(action: Action, groupName?: string | null, mode: Mode = 'inspect'): string {
  if (action.kind === 'task') return t('g7a.counters.actionTask', { title: action.title })
  if (action.kind === 'job') return mode === 'normal' ? t('g7a.counters.actionJob') : t('g7a.counters.actionJobInspect', { job: action.job })
  if ('group' in action) return mode === 'normal' && !groupName ? t('g7a.counters.actionGroup') : t('g7a.counters.actionNamedGroup', { group: groupName ?? action.group })
  return t('g7a.counters.actionPeople', { n: action.to.length })
}

/** Who may change this counter, in words (CT6). The same sentence everywhere it is said. */
export const WHO_MAY_CHANGE_A_COUNTER =
  'Whoever filed it, a secretary, and the owner.'

// ============================================================================ the write refusal

/**
 * WHY A COUNTER IS REFUSED TO POST /api/records AND TO EVERY OTHER GENERAL WRITE DOOR.
 *
 * The same shape `A_MERGE_ENTRY_IS_WRITTEN_BY_ITS_DOORS` has, and for a related reason: CT6 puts a
 * guard on every change — only whoever filed it, a secretary or the owner — and asks for a reason on
 * each one, and the general record doors can carry neither.
 */
export const A_COUNTER_IS_WRITTEN_BY_ITS_DOORS =
  'A counter is written only through its own doors: filing it, adding to it, changing it, and pausing or resuming ' +
  'it. Each of those says who may and keeps why. Nothing was written.'

/** The same refusal with the doors named, for an agent and for Developer mode. */
export const THE_COUNTER_DOORS =
  'File one with POST /api/counters, add to it with POST /api/counters/<id>/add, change it with PATCH ' +
  '/api/counters/<id>, pause and resume it with POST /api/counters/<id>/pause and /resume, and read it with GET ' +
  '/api/counters and GET /api/counters/<id>.'
