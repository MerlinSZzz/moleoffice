// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readStoredWord as t } from './i18n.ts'
import type { Mode } from './mode.ts'
/**
 * THE HORIZONS, THE CLUSTERS UNDER EACH, THE PARTS, AND WHO IS ON EACH PART NOW. Criterion P5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS, AND WHY THE READING IS HERE RATHER THAN IN THE PAGE
 * ---------------------------------------------------------------------------------------
 *
 * P5 asks one page to draw four horizons, the goals at each, the clusters that serve each goal, the
 * planned states (the parts) of each cluster, who is on each part now and the window they carry,
 * and three facts that put what was planned beside what actually happened. That is a reading of
 * records and links, not a drawing, and a reading that lives inside a React component can only be
 * checked by driving a browser. So the reading is a pure function here and the page draws what it
 * returns. `tests/the-horizons-page.test.ts` calls it with plain objects.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS READ, AND FROM WHERE
 * ---------------------------------------------------------------------------------------
 *
 *   goals             records of kind `goal`, at one of the four horizons `GOAL_HORIZONS` declares.
 *   serving work      the `serves` link. It runs FROM a trajectory, an obligation, a task or a
 *                     cluster (a `module` record) TO a goal, which is why `servesTo` reads the `to`
 *                     end as the goal.
 *   clusters          a trajectory that serves a goal, or a module that serves one. P4 makes a
 *                     cluster a trajectory, and `serves` also accepts a module, so both are drawn
 *                     and each says which it is. A trajectory's parts are its `plannedStateIds`, in
 *                     the order it stores them; a module has no parts and says so.
 *   who is on a part  live work domains that are `about` the part, handed in already resolved by
 *                     `GET /api/work-domains/presence`. That is the product's own reader for "who
 *                     is working on this record now", and it answers about every id it was asked
 *                     about, so nobody-there and nobody-looked stay apart.
 *   a part's window   `work_windows` rows whose record is the part or a record that `realises` the
 *                     part. A window never names hours; `windowHoursOf` below is forbidden to exist
 *                     and nothing in this file adds one into a total.
 *   whose window      `ownerOfWindow` in ./windowowner.ts, the one reader of the stamp.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE FACTS THAT PUT PLANNED BESIDE ACTUAL
 * ---------------------------------------------------------------------------------------
 *
 * `againstActual` returns three lists and each entry is a SENTENCE a person can check against the
 * record, never a number on its own and never a colour on its own:
 *
 *   a late window   a window still `planned` whose last day has gone by.
 *   a dropped line  a line of the plan (an allocation) whose state is `dropped`. It is handed to
 *                   this file by the server, which is the only place that reads allocations.
 *   a part built    a planned state that a record `realises` while no trajectory lists it among its
 *                   parts — something got built and no plan wrote the part down.
 */

import { GOAL_HORIZONS, type GoalHorizon } from './goal.ts'
import { isAnAnsweringLink, type ActorType, type AnsweringLinkType } from './types.ts'
import type { LinkAnswered, LinkOnTheWire } from './link-shapes.ts'
import { ownerOfWindow, type WindowOwner } from './windowowner.ts'

/** The four horizon words in the order the page draws them, coarse to fine. */
export { GOAL_HORIZONS }
export type { GoalHorizon }

/** What a horizon is called on the page. The span is drawn beside it from the office's own setting. */
export const HORIZON_WORDS: Readonly<Record<GoalHorizon, string>> = {
  get short() { return t('g7a.horizons.short') },
  get medium() { return t('g7a.horizons.medium') },
  get long() { return t('g7a.horizons.long') },
  get distant() { return t('g7a.horizons.distant') },
}

/** The one sentence a horizon with no goal of its own says. */
export function noGoalAtThisHorizon(horizon: GoalHorizon): string {
  return t('g7a.horizons.noneAt', { horizon: HORIZON_WORDS[horizon].toLowerCase() })
}

/** A record as this reader needs it: the fields every planning read already carries. */
export interface HorizonRecord {
  id: string
  kind: string
  title: string
  data: Record<string, unknown>
  /** Where the record came from, as the server sent it; absent when the reader was not sent one. */
  origin?: unknown
}

/**
 * One link as the Goals page's answer shape names it. The three fields every row has come from
 * `THE_FIELDS_OF_A_LINK_SHAPE.answer`; the writer and moment are optional only because a caller's
 * plain-object fixture may leave them out, and a missing one is drawn as not recorded.
 */
export type HorizonLink = Pick<LinkAnswered<LinkOnTheWire, 'answer'>, 'fromId' | 'toId' | 'type'> &
  Partial<Pick<LinkAnswered<LinkOnTheWire, 'answer'>, 'createdAt' | 'createdBy' | 'createdByType'>>

/**
 * ONE ANSWER TO A PLANNED STATE: a `realises` or `instead_of` link, with the writer and moment the
 * link row already stores. The page draws every answer it is given, and `answersDrawn` counts them.
 */
export interface HorizonAnswer {
  /** `realises` when the work made the part real, `instead_of` when it answered the part another way. */
  type: AnsweringLinkType
  /** The record that gave the answer, by the id the link stores. */
  workId: string
  /** Its title, or the reader's word for a work record the read did not carry. */
  title: string
  /** Who wrote the link, or null when the row records no author this reader can name. */
  by: { actorType: ActorType; actorId: string } | null
  /** When the link was written, or null when the row records no moment. */
  at: string | null
}

/** One work domain about a record, already resolved to the agent's own name. */
export interface HorizonPerson {
  domainId: string
  domainTitle: string
  /** The durable agent's own title, or '' when the registry cannot name it. */
  agentTitle: string
  objective: string
  /** `live`, `warm`, `stale`, `never` — the age band, from `presenceFromAge`. */
  presence: string
  quietForMinutes: number | null
}

/** One work window, with the stamp that says whose it is. Hours never appear here. */
export interface HorizonWindow {
  id: string
  recordId: string
  startsOn: string
  endsOn: string
  state: string
  note: string | null
  createdBy: string | null
}

/** One line of the plan the server read as dropped, with the work it named. */
export interface HorizonDroppedLine {
  id: string
  workTitle: string | null
  period: string
  plannedHours: number | null
  note: string | null
  createdBy: string | null
}

/** Everything the reading takes. Nothing here opens a database or a socket. */
export interface HorizonsInput {
  goals: readonly HorizonRecord[]
  trajectories: readonly HorizonRecord[]
  plannedStates: readonly HorizonRecord[]
  /**
   * The module records. A `serves` link may run from a module as well as from a trajectory — a
   * cluster is a trajectory by P4, and the link accepts a module — so the reading needs their
   * titles and their kind to draw one under a goal.
   */
  modules: readonly HorizonRecord[]
  links: readonly HorizonLink[]
  /** Keyed by record id, one key per id asked about — see `GET /api/work-domains/presence`. */
  presenceByRecord: Readonly<Record<string, readonly HorizonPerson[]>>
  windows: readonly HorizonWindow[]
  /** Dropped plan lines, read by the server from `allocations`. */
  droppedLines: readonly HorizonDroppedLine[]
  /** A title per record id, for the work a window or a line names. Missing is drawn as its id. */
  titlesById: Readonly<Record<string, string>>
  /** The server's own day, `YYYY-MM-DD`. Everything that says "late" is measured against this. */
  today: string
}

// ---------------------------------------------------------------------------- small readings

function stringOf(record: HorizonRecord, key: string): string | null {
  const value = record.data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function stringListOf(record: HorizonRecord, key: string): string[] {
  const value = record.data[key]
  if (!Array.isArray(value)) return []
  return value.filter((one): one is string => typeof one === 'string')
}

/** A record's own short name for a reader, or its id when nothing here can name it. */
function nameOf(id: string, titlesById: Readonly<Record<string, string>>, mode: Mode): string {
  const title = titlesById[id]
  return title === undefined || title === '' ? (mode === 'inspect' ? id : t('g7a.horizons.unnamed')) : title
}

/**
 * WHO WROTE A LINK, from the three fields the link row stores. NULL IS NOT A PERSON OR AN AGENT:
 * the row either records no id or records no kind, and in both cases naming the id would guess at
 * which registry it came from. The page says the writer is not recorded.
 */
function writerOf(link: HorizonLink): { actorType: ActorType; actorId: string } | null {
  const actorId = link.createdBy
  if (typeof actorId !== 'string' || actorId.trim() === '') return null
  const actorType = link.createdByType ?? null
  if (actorType === null) return null
  return { actorType, actorId }
}

/** WHEN A LINK WAS WRITTEN, or null when the row records no moment. An empty string is not a time. */
function momentOf(link: HorizonLink): string | null {
  const at = link.createdAt
  return typeof at === 'string' && at.trim() !== '' ? at : null
}

/** Whether a goal has been confirmed by the person, from the two fields the mark is made of. */
export function goalIsConfirmed(record: HorizonRecord): boolean {
  if (stringOf(record, 'filed_by') === null) return true
  const held = record.data['confirmed_by']
  return typeof held === 'object' && held !== null
}

/** The agent name on a goal, or null when a person filed it or the record has no mark. */
export function goalFiledBy(record: HorizonRecord): string | null {
  return stringOf(record, 'filed_by')
}

// ---------------------------------------------------------------------------- the reading

/** One part of a cluster: what would be true, who is on it now, and the windows it carries. */
export interface HorizonPart {
  id: string
  /** What would be true when this part is real. One sentence, from the record. */
  what: string
  /** True when the record could not say what it would be, so the page says that instead. */
  whatUnreadable: boolean
  /** Who is on it NOW, from the live work domains that are about it. */
  people: HorizonPerson[]
  /**
   * EVERY ANSWER TO THIS PART, in the order the link read gave them: `realises` and `instead_of`
   * alike, each with the writer and moment the link row stores. This is what the page draws and
   * what its count is made from.
   */
  answers: HorizonAnswer[]
  /** The records that have made this part real, through a `realises` link. Kept for the windows and the built fact. */
  builtBy: { id: string; title: string }[]
  /** The windows on the part or on the work that makes it real, each with whose it is. */
  windows: {
    id: string
    startsOn: string
    endsOn: string
    state: string
    note: string | null
    owner: WindowOwner
  }[]
}

/** One cluster under a goal: a trajectory (its parts) or a module (no parts). */
export interface HorizonCluster {
  id: string
  title: string
  /** `trajectory` or `module` — what the serving record really is. */
  kind: string
  parts: HorizonPart[]
  /** True when this cluster is a trajectory, so an empty `parts` means nobody wrote one. */
  isTrajectory: boolean
}

/** One goal, with the work that serves it. */
export interface HorizonGoal {
  id: string
  title: string
  what: string
  whatUnreadable: boolean
  owner: string
  /** True when the goal records no owner, so `owner` holds the words for that and not a name. */
  ownerMissing: boolean
  state: string
  stateAt: string | null
  stateBecause: string | null
  /** The agent that filed it, when an agent did. */
  filedBy: string | null
  confirmed: boolean
  clusters: HorizonCluster[]
  /** The goal record's own origin, copied only when the record carried one. */
  origin?: unknown
}

/** Whether a person still needs to confirm an agent-filed goal. */
export function goalNeedsConfirmation(goal: Pick<HorizonGoal, 'filedBy' | 'confirmed'>): boolean {
  return goal.filedBy !== null && !goal.confirmed
}

/** One horizon and its goals. An empty `goals` is a real state and the page says so. */
export interface HorizonLevel {
  horizon: GoalHorizon
  goals: HorizonGoal[]
}

/**
 * Read the four horizons. Every one of the four is present, even with nothing at it, because
 * absence is a state this page must be able to draw.
 */
export function readHorizons(input: HorizonsInput, mode: Mode = 'inspect'): HorizonLevel[] {
  const goalById = new Map(input.goals.map((one) => [one.id, one]))
  const trajectoryById = new Map(input.trajectories.map((one) => [one.id, one]))
  const plannedStateById = new Map(input.plannedStates.map((one) => [one.id, one]))
  const recordById = new Map<string, HorizonRecord>([
    ...input.goals.map((one) => [one.id, one] as const),
    ...input.trajectories.map((one) => [one.id, one] as const),
    ...input.plannedStates.map((one) => [one.id, one] as const),
    ...input.modules.map((one) => [one.id, one] as const),
  ])

  /** Every link FROM a piece of work TO a goal, so a goal can ask what serves it. */
  const serving = new Map<string, string[]>()
  for (const link of input.links) {
    if (link.type !== 'serves') continue
    if (!goalById.has(link.toId)) continue
    const held = serving.get(link.toId) ?? []
    if (!held.includes(link.fromId)) held.push(link.fromId)
    serving.set(link.toId, held)
  }

  /**
   * Every answer to one planned state, in the order the link read gave it. The link row carries
   * its own writer and moment; a row that records neither is still an answer and is still drawn,
   * with the absence said rather than filled in.
   */
  const answersOf = new Map<string, HorizonAnswer[]>()
  for (const link of input.links) {
    if (!isAnAnsweringLink(link.type)) continue
    if (!plannedStateById.has(link.toId)) continue
    const held = answersOf.get(link.toId) ?? []
    held.push({
      type: link.type,
      workId: link.fromId,
      title: nameOf(link.fromId, input.titlesById, mode),
      by: writerOf(link),
      at: momentOf(link),
    })
    answersOf.set(link.toId, held)
  }

  /** Every window on one record id. */
  const windowsOn = new Map<string, HorizonWindow[]>()
  for (const window of input.windows) {
    const held = windowsOn.get(window.recordId) ?? []
    held.push(window)
    windowsOn.set(window.recordId, held)
  }

  /** The trajectory that names a planned state, so an orphan can be told from a named part. */
  const namedByATrajectory = new Set<string>()
  for (const trajectory of input.trajectories) {
    for (const id of stringListOf(trajectory, 'plannedStateIds')) namedByATrajectory.add(id)
  }

  const readPart = (id: string): HorizonPart => {
    const record = plannedStateById.get(id)
    const what = record === undefined ? null : stringOf(record, 'what')
    const answers = record === undefined ? [] : (answersOf.get(id) ?? [])
    // THE WINDOWS READ THE `realises` ANSWERS ONLY. An `instead_of` answer says the part was
    // answered another way, so it did not make the part real and no window on it belongs here.
    const builtByIds = answers.filter((one) => one.type === 'realises').map((one) => one.workId)
    const windowRecords = [id, ...builtByIds]
    const windows = windowRecords.flatMap((recordId) => windowsOn.get(recordId) ?? [])
    return {
      id,
      what: what ?? '',
      whatUnreadable: what === null,
      people: [...(input.presenceByRecord[id] ?? [])],
      answers,
      builtBy: builtByIds.map((workId) => ({ id: workId, title: nameOf(workId, input.titlesById, mode) })),
      windows: windows
        .slice()
        .sort((a, b) => (a.startsOn === b.startsOn ? a.id.localeCompare(b.id) : a.startsOn < b.startsOn ? -1 : 1))
        .map((window) => ({
          id: window.id,
          startsOn: window.startsOn,
          endsOn: window.endsOn,
          state: window.state,
          note: window.note,
          owner: ownerOfWindow(window.createdBy),
        })),
    }
  }

  const readCluster = (id: string): HorizonCluster | null => {
    const trajectory = trajectoryById.get(id)
    if (trajectory !== undefined) {
      const parts = stringListOf(trajectory, 'plannedStateIds').map(readPart)
      return { id, title: trajectory.title, kind: 'trajectory', parts, isTrajectory: true }
    }
    const module = recordById.get(id)
    if (module !== undefined) {
      return { id, title: module.title, kind: module.kind, parts: [], isTrajectory: false }
    }
    return null
  }

  return GOAL_HORIZONS.map((horizon) => {
    const goals = input.goals
      .filter((goal) => stringOf(goal, 'horizon') === horizon)
      .map((goal): HorizonGoal => {
        const what = stringOf(goal, 'what')
        const clusterIds = (serving.get(goal.id) ?? []).slice()
        const clusters = clusterIds
          .map(readCluster)
          .filter((one): one is HorizonCluster => one !== null)
        return {
          id: goal.id,
          title: goal.title,
          what: what ?? '',
          whatUnreadable: what === null,
          owner: stringOf(goal, 'owner') ?? (mode === 'inspect' ? t('g7a.horizons.noOwner') : t('absence.mark')),
          ownerMissing: stringOf(goal, 'owner') === null,
          state: stringOf(goal, 'state') ?? 'open',
          stateAt: stringOf(goal, 'state_at'),
          stateBecause: stringOf(goal, 'state_because'),
          filedBy: stringOf(goal, 'filed_by'),
          confirmed: goalIsConfirmed(goal),
          clusters,
          ...('origin' in goal ? { origin: goal.origin } : {}),
        }
      })
    return { horizon, goals }
  })
}

/**
 * HOW MANY ANSWERS THE PAGE DRAWS, from the levels it is about to draw. It counts the answer rows
 * themselves, not the plans they made real and not every answering link in the project: an answer
 * on a planned state no trajectory names is not under any part and so is not in these lists.
 */
export function answersDrawn(levels: readonly HorizonLevel[]): number {
  let drawn = 0
  for (const level of levels) {
    for (const goal of level.goals) {
      for (const cluster of goal.clusters) {
        for (const part of cluster.parts) drawn += part.answers.length
      }
    }
  }
  return drawn
}

// ---------------------------------------------------------------------------- planned against actual

/** One fact that puts what was planned beside what happened, as a sentence a person can check. */
export interface AgainstActualFact {
  kind: 'late-window' | 'dropped-line' | 'part-built'
  /** The record or row the sentence is about, so the page can link to it. */
  id: string
  said: string
}

/** Each of the three facts, in the order the page draws them. */
export interface AgainstActual {
  lateWindows: AgainstActualFact[]
  droppedLines: AgainstActualFact[]
  partsBuilt: AgainstActualFact[]
}

/** The page keeps the owner category while leaving stored stamps in the developer view. */
export function wordsOfWindow(owner: WindowOwner, mode: Mode): string {
  if (mode === 'inspect') return owner.word
  if (owner.kind === 'person') return t('g7a.horizons.personWindow')
  if (owner.kind === 'agent') return t('g7a.horizons.agentWindow')
  if (owner.kind === 'unreadable') return t('absence.mark')
  return t('g7a.horizons.otherWindow')
}

/** What a window's days are called, in words. Nothing here turns them into hours. */
function windowSaid(window: { startsOn: string; endsOn: string }): string {
  if (window.startsOn === window.endsOn) return window.startsOn
  return t('g7a.horizons.days', { start: window.startsOn, end: window.endsOn })
}

/**
 * The three facts. Everything here is computed from the reading and the server's own dropped lines.
 *
 * A PART IS "BUILT BUT NOT NAMED" WHEN A RECORD `realises` IT AND NO TRAJECTORY LISTS IT. Both
 * halves are stored facts: the `realises` link is the claim that something made it real, and
 * `plannedStateIds` is the only place a part is written down as part of a plan. A part that is
 * real and planned is ordinary; a part that is real and in no trajectory is what P5 asks to see.
 */
export function againstActual(input: HorizonsInput, mode: Mode = 'inspect'): AgainstActual {
  const lateWindows = input.windows
    .filter((window) => window.state === 'planned' && window.endsOn < input.today)
    .sort((a, b) => (a.endsOn === b.endsOn ? a.id.localeCompare(b.id) : a.endsOn < b.endsOn ? -1 : 1))
    .map((window): AgainstActualFact => {
      const owner = ownerOfWindow(window.createdBy)
      return {
        kind: 'late-window',
        id: window.id,
        said: t('g7a.horizons.lateFact', { work: nameOf(window.recordId, input.titlesById, mode), end: window.endsOn, owner: wordsOfWindow(owner, mode) }),
      }
    })

  const droppedLines = input.droppedLines
    .slice()
    .sort((a, b) => (a.period === b.period ? a.id.localeCompare(b.id) : a.period < b.period ? -1 : 1))
    .map((line): AgainstActualFact => {
      const owner = ownerOfWindow(line.createdBy)
      const work = line.workTitle === null ? t('g7a.horizons.goneWork') : `"${line.workTitle}"`
      const hours = line.plannedHours === null ? t('g7a.horizons.noHours') : t('g7a.horizons.hours', { n: line.plannedHours })
      const because = line.note === null || line.note.trim() === '' ? '' : t('g7a.horizons.reason', { reason: line.note })
      return {
        kind: 'dropped-line',
        id: line.id,
        said: t('g7a.horizons.droppedFact', { work, hours, period: line.period, owner: wordsOfWindow(owner, mode), because }),
      }
    })

  // A PART THAT IS REAL AND IN NO TRAJECTORY. Read from the same links the horizons read.
  const plannedStateById = new Map(input.plannedStates.map((one) => [one.id, one]))
  const namedByATrajectory = new Set<string>()
  for (const trajectory of input.trajectories) {
    for (const id of stringListOf(trajectory, 'plannedStateIds')) namedByATrajectory.add(id)
  }
  const realisersOf = new Map<string, string[]>()
  for (const link of input.links) {
    if (link.type !== 'realises') continue
    if (!plannedStateById.has(link.toId)) continue
    const held = realisersOf.get(link.toId) ?? []
    if (!held.includes(link.fromId)) held.push(link.fromId)
    realisersOf.set(link.toId, held)
  }
  const partsBuilt = [...realisersOf.entries()]
    .filter(([partId]) => !namedByATrajectory.has(partId))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([partId, workIds]): AgainstActualFact => {
      const part = plannedStateById.get(partId)
      const what = part === undefined ? null : stringOf(part, 'what')
      const named = part === undefined ? partId : (what ?? part.title)
      const built = workIds.map((id) => `"${nameOf(id, input.titlesById, mode)}"`).join(t('g7a.horizons.and'))
      return {
        kind: 'part-built',
        id: partId,
        said: t('g7a.horizons.builtFact', { built, part: named }),
      }
    })

  return { lateWindows, droppedLines, partsBuilt }
}
