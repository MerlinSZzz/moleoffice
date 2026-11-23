// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS STILL OPEN AROUND ONE THING, FOR SOMEBODY WHO HAS JUST ARRIVED.
 *
 * ---------------------------------------------------------------------------------------
 * THE INCIDENT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * An agent was pointed at a module and spent an afternoon re-running an exploration that had
 * already been run and had already failed. The record of that failure existed. It was three links
 * away from where the agent was standing and nothing pointed at it, so the only way to find it was
 * to already know it was there. That is the whole problem: a corpus that holds the answer and
 * cannot hand it over is a corpus nobody reads twice.
 *
 * ---------------------------------------------------------------------------------------
 * ONE READER, AND WHAT AN OPEN LOOP IS
 * ---------------------------------------------------------------------------------------
 *
 * An OPEN LOOP is a record whose own stored state says it has not reached an end, in one of the six
 * kinds a piece of unfinished work can be filed as. That is the whole definition, and every word of
 * it is a stored fact:
 *
 *   task, problem, idea, direction, obligation — the state word, read through `progressOf`, which
 *   is the same classification the attention rule and every state chip use. `finished` is out.
 *   Anything else is in, INCLUDING a record with no state word at all: nobody has said is not the
 *   same as done.
 *
 *   proposal — a fork with no decision linked to it. That is `readForks()`, the one reading behind
 *   `GET /api/needs-you` and `GET /api/forks`. This file does not decide again what "settled" means.
 *
 * A direction has no state word — it has `depth`, a ladder of its own — and the ladder has no rung
 * that means finished. So every live direction is an open loop and its rung is reported beside it,
 * UNLESS it carries `shelved`: a shelved direction is stopped and kept, so it leaves the open loops
 * and the counts and stays everywhere else. That is criterion S1, and it is a stored fact of its own
 * rather than a state word, because the direction kind deliberately has none.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES TO DO: READ A BODY TO DECIDE WHAT TO LEAVE OUT
 * ---------------------------------------------------------------------------------------
 *
 * Every exclusion below comes from a stored fact — the kind, the state word, `whose_move`, when the
 * record last changed, or how many links away it is. NOTHING here reads what a record SAYS in order
 * to decide whether to carry it. A relevance rule that reads prose is a rule that can be fooled by
 * prose, and the record it drops is the one written in words nobody thought to match.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIZE LIMIT IS MET BY SAYING LESS, NEVER BY CARRYING FEWER
 * ---------------------------------------------------------------------------------------
 *
 * The answer has to fit in a request an agent can read — 16 KB. When it does not fit at the length
 * asked for, this drops to a shorter length and says so. Membership does not move. That is the
 * point of the detail ladder: changing the rung changes how much each one says, not which ones
 * appear.
 *
 * ONLY WHEN THE SHORTEST LENGTH STILL DOES NOT FIT is anything dropped, and then it is dropped by
 * one stored fact — how long ago it last changed — with every dropped id named in `passedOver`. A
 * count of what was left out that is zero for ever counts a row cap rather than a decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY REPLY SAYS HOW MANY OPEN LOOPS ATTACH TO NO MODULE
 * ---------------------------------------------------------------------------------------
 *
 * Measured on this corpus: most of the project's open loops are linked to no module at all. An
 * agent scoped to one module and handed three loops would read that as "this module is nearly
 * clear". It is not: it is what a module-shaped question can see. So every reply carries the two
 * numbers, and a drought is never presented as an answer.
 */

import { aProjectCounted, aProjectCountedLessItsMessages, aProjectCountedWithoutMessageIds, allLinks, getRecord, liveRecordsOfKinds, whoFiled } from './records.ts'
import { PanelError } from './panel-error.ts'
import { readForks, type ForksRead } from './forks.ts'
import { refuseAMessageThisReaderMayNotRead, theLiveMessagesOfAProjectAReaderIsAPartyTo, theMessagesThisReaderMayRead, type AMessageReader } from './messages.ts'
import { MOVE_ACTORS, type MoveActor } from '@shared/kinds.ts'
import { progressOf, readWorkState, theWorkHasEnded, type Progress, type WorkStateSource } from '@shared/work.ts'
import { createI18n } from '@shared/i18n.ts'
import { RUNGS, positionOf, type Rung } from '@shared/detail.ts'
import { wordsAt } from '@shared/detailsource.ts'
import type { PanelRecord } from '@shared/types.ts'

// ============================================================================ the population

/**
 * THE SIX KINDS A PIECE OF UNFINISHED WORK IS FILED AS, and why nothing else is in the population.
 *
 * A `block` is not here: a block belongs to a pipeline, and the pipeline is the loop — an agent
 * handed 26 blocks instead of 2 pipelines has been handed the same work at the wrong grain. A
 * `module`, a `pipeline` and a `claim` are containers and results, not moves anybody owes. A
 * `session`, a `note`, a `message` and a `report` are records of what happened, and what happened
 * is not something anybody has to finish.
 *
 * They are named here rather than worked out from "which kinds declare a state", because three
 * kinds declare a state and are not work — and a rule that reads the schema would quietly change
 * what this endpoint means the day a seventeenth kind is declared.
 */
export const LOOP_KINDS = ['task', 'problem', 'idea', 'direction', 'obligation', 'proposal'] as const
export type LoopKind = (typeof LOOP_KINDS)[number]

/** The kinds this reader does not consider, said as a fact rather than left to be noticed. */
export const POPULATION_SENTENCE =
  'An open loop is a live task, problem, idea, direction, obligation or unsettled proposal whose own stored ' +
  'state does not say it has ended, and that is not a direction on the shelf. Blocks, modules, pipelines, ' +
  'claims, sessions, notes, messages, reports and annotations are not in this population at all: a block is ' +
  'reached through its pipeline, and the rest are records of what happened rather than moves anybody owes.'

// ============================================================================ what comes back

/** Why a candidate was not carried. Every one of these is a stored fact about the record. */
export const LEFT_OUT_BUCKETS = [
  /** Its own state word says the work reached its end. */
  'finished',
  /** A direction that has been shelved: stopped and kept, and no longer open work. */
  'shelved',
  /** A person settled this fork: a decision is linked to it. Read from `readForks`, not decided here. */
  'settled',
  /** It is further from where you are standing than the reach asked for. */
  'beyond_reach',
  /** No chain of links joins it to where you are standing at all. */
  'not_linked_to_here',
  /** It IS where you are standing. What is open around a thing does not include the thing. */
  'where_you_are_standing',
  /** It fitted nowhere: the shortest form of the whole answer was still over the size limit, so the
   *  ones that changed longest ago were dropped. Every id is named. */
  'quiet_the_longest',
] as const
export type LeftOutBucket = (typeof LEFT_OUT_BUCKETS)[number]

/** One sentence per bucket, phrased as a fact about the record a person can check against it. */
export const LEFT_OUT_SENTENCES: Readonly<Record<LeftOutBucket, string>> = {
  finished: 'its own state word says the work reached its end',
  shelved:
    'it is a direction that has been shelved — stopped and kept, with its own date and reason on it, and not open ' +
    'work any more',
  settled: 'it is a fork a person has already settled: a decision is linked to it',
  beyond_reach: 'it is further from here than the reach asked for, counted in links',
  not_linked_to_here: 'no chain of links joins it to where you are standing',
  where_you_are_standing:
    'it is the record you are standing at — what is open AROUND something does not include the thing itself, and ' +
    'its own state is on its own page',
  quiet_the_longest:
    'the whole answer was still over the size limit at its shortest length, so the loops that changed ' +
    'longest ago were dropped — these are those, oldest first',
}

/** Every candidate not carried, in named buckets, with every id in each. */
export interface LeftOutGroup {
  bucket: LeftOutBucket
  /** Absent on the existing stored-state shape; derived finished work names its source. */
  stateSource?: WorkStateSource
  sentence: string
  count: number
  /**
   * EVERY ID IN THE BUCKET, so nothing is a number a person cannot open.
   *
   * IT IS IDS HERE AND REFERENCES WHERE THE TEXT IS WRITTEN, and the reason is measured. This reply
   * is held to 16,384 bytes and drops the loops that changed longest ago until it fits; on the
   * owner's corpus the buckets hold about six hundred records, so an id each is about eight
   * kilobytes and a title each is about thirty-six. Carrying a title here made the reply drop every
   * loop it had — measured 7 September 2026, `openLoops` fell from 70 carried to 0.
   *
   * SO THE NAME IS LOOKED UP AT THE POINT SOMETHING PRINTS ONE, by `referenceTo` in
   * `src/server/lib/references.ts`, which is the one place a reference is built. Criterion B18 asks
   * that a reference IN THE COPY carry their four words, and a copy names as many as the room allows
   * — `namesOf` in `src/server/lib/bundle.ts` — rather than all six hundred.
   */
  ids: string[]
}

/** One open loop, at the length this answer could afford. */
export interface OpenLoop {
  id: string
  kind: LoopKind
  /** The record's own words, at the length that fitted. Read from a stored field, never cut. */
  says: string
  /** Which stored field those words came from, so a reader can check them. */
  from: string
  /** The state word exactly as stored. Null when the record carries none. */
  state: string | null
  /** How Mole Office classifies that word. Null when there is no word to classify. */
  progress: Progress | null
  /** A direction's rung on its own ladder. Only a direction has one. */
  depth?: string
  /** Whose move it is, as stored. Null means nobody has said, which is not `either`. */
  whoseMove: MoveActor | null
  /** A stored value that is not one of the three words. Present only when that has happened. */
  whoseMoveUnreadable?: string
  /** How many links from where you are standing. Null when the whole project was asked about. */
  hops: number | null
  /** When the record last changed. */
  lastChanged: string
  /** The modules it is linked to. Empty means none, which is the common answer. */
  modules: string[]
  /** What must not be tried again, from `problem.attempts[].do_not_repeat`. */
  doNotRepeat?: string[]
  /** How many attempts are recorded, when any are. */
  attempts?: number
  /** On a fork nobody has settled: only a person may settle it, and no field here changes that. */
  onlyAPersonCanSettle?: true
}

/** What one call answers. Not called an envelope: that word already means a parent's own time. */
export interface OpenLoops {
  workspaceId: string
  /**
   * The record everything was measured from, or null when the whole project was asked about.
   *
   * `filedBy` IS READ HERE AND NOWHERE ELSE. Who wrote a record is a row of the change log, and the
   * change log has exactly one reader in the browser — the component that draws it. A second place
   * working out who filed a record is how three pages once gave three answers to "which session did
   * this", so the answer is worked out on the server, once, and handed over. Null means no create
   * row names anybody, which is a real answer about an imported or seeded record.
   */
  standingAt: { id: string; kind: string; title: string; filedBy: { actorType: string; actorId: string } | null } | null
  /** How many links from the anchor a loop was allowed to be. Null for a whole project. */
  reach: number | null
  /** The length asked for, and the length this answer could afford. */
  rung: { asked: Rung; drew: Rung; why: string | null }
  loops: OpenLoop[]
  leftOut: LeftOutGroup[]
  counts: {
    /** Live records of the six loop kinds in this project. */
    candidates: number
    carried: number
    /** candidates - carried. The sum of every `leftOut` bucket, exactly, always. */
    leftOut: number
    /** Records of every other kind, not in this population at all. Named by kind, never by id. */
    outsideThePopulation: number
  }
  /** How many of the project's open loops attach to no module. Carried by every reply. */
  attachment: {
    openLoopsInProject: number
    attachedToNoModule: number
    sentence: string
  }
  /**
   * How many CARRIED loops say whose move it is, and how many nobody has said anything about.
   *
   * IT IS OF THE CARRIED LIST AND THE NOTE SAYS SO. This answer is cut to a byte budget, so these
   * four numbers are about the page. The project's own answer is `GET /api/whose-move`, which is
   * not cut, and `attachment.openLoopsInProject` is how many loops there are in all.
   */
  whoseMove: { person: number; agent: number; either: number; nobodyHasSaid: number }
  /**
   * WHETHER THE ANSWER REALLY CAME IN UNDER THE SIZE IT WAS ASKED FOR.
   *
   * `fits` is false when even the shortest length with nothing carried was still over — which
   * happens when naming the excluded ids costs more than the budget. THE ANSWER IS STILL SENT, and
   * it says so here rather than lying about its own size or dropping the names to make the number
   * come out right. A caller that must have the smaller answer asks about a narrower scope.
   */
  size: { budgetBytes: number; fits: boolean }
  note: string
}

/** What a caller asks for. Every field has a stated default; nothing here is guessed from a body. */
export interface OpenLoopsAsk {
  workspaceId: string
  /** The record to stand at. Null asks about the whole project. */
  anchorId?: string | null
  /** How many links away a loop may be. Ignored when there is no anchor. */
  reach?: number
  /** How much each loop says. */
  rung?: Rung
  /** The size the whole answer has to fit in, in bytes. */
  budgetBytes?: number
  /**
   * WHO IS READING. A message this reader may not read is refused as the anchor
   * and is not counted outside the population. Left out by a caller that answers no request.
   */
  reader?: AMessageReader
  /**
   * `readForks()` ALREADY READ BY A CALLER THAT ASKS IT AGAIN, such as the brief. One request reads it
   * once: it walks every proposal of every project. Read here when it is not given.
   */
  forks?: ForksRead
}

/** Two links: far enough to reach a problem filed against a sibling, near enough to mean something. */
export const DEFAULT_REACH = 2

/** One line each, with the conclusion where somebody wrote one. */
export const DEFAULT_RUNG: Rung = 'gist'

/** 16 KB. What an agent can read at the start of a run without the corpus arriving with it. */
export const BUDGET_BYTES = 16 * 1024

// ============================================================================ small readers

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const dataOf = (record: PanelRecord): Record<string, unknown> => (isObj(record.data) ? record.data : {})

/** The state word exactly as stored, or null. Nothing is inferred from anything else. */
function storedState(record: PanelRecord): string | null {
  const word = dataOf(record)['state']
  return typeof word === 'string' && word.trim() !== '' ? word : null
}

/**
 * Whose move it is, as stored.
 *
 * A value that is not one of the three words comes back as `unreadable` rather than as null.
 * Null means nobody has said; a word nobody can read is somebody having said something Mole Office
 * cannot use, and reporting it as an absence would hide a real fault in an imported corpus.
 */
export function readWhoseMove(record: PanelRecord): { move: MoveActor | null; unreadable: string | null } {
  const value = dataOf(record)['whose_move']
  if (typeof value !== 'string' || value.trim() === '') return { move: null, unreadable: null }
  return (MOVE_ACTORS as readonly string[]).includes(value)
    ? { move: value as MoveActor, unreadable: null }
    : { move: null, unreadable: value }
}

/** What a problem's recorded attempts say must not be tried again. Text somebody wrote, unchanged. */
function doNotRepeatOf(record: PanelRecord): { lines: string[]; attempts: number } {
  const attempts = dataOf(record)['attempts']
  if (!Array.isArray(attempts)) return { lines: [], attempts: 0 }
  const lines: string[] = []
  for (const entry of attempts) {
    if (!isObj(entry)) continue
    const line = entry['do_not_repeat']
    if (typeof line === 'string' && line.trim() !== '') lines.push(line)
  }
  return { lines, attempts: attempts.length }
}

/**
 * WHO FILED THIS RECORD: `whoFiled` in lib/records/change-log.ts, the one reader of a record's create row, handed on here
 * for this file's readers (lib/records.ts cannot import this file, and the guard on ending a run asks it there).
 */
export { whoFiled }

/** A direction's rung on its own ladder, as stored. */
function depthOf(record: PanelRecord): string | null {
  const depth = dataOf(record)['depth']
  return typeof depth === 'string' && depth.trim() !== '' ? depth : null
}

// ============================================================================ the reading

interface Candidate {
  record: PanelRecord
  kind: LoopKind
}

/**
 * WHETHER THIS RECORD'S OWN STATE SAYS IT HAS ENDED. `theWorkHasEnded` in shared/work.ts is the one
 * answer, which the waiting list and the side card on a record page ask too.
 */
function hasEnded(record: PanelRecord): boolean {
  return theWorkHasEnded(record.data)
}

/**
 * WHETHER THIS DIRECTION HAS BEEN SHELVED.
 *
 * A shelf is a stored fact of its own, not a state word: the direction kind declares no `state` at all, and
 * the ladder has no rung that means stopped. `shelved` on a direction is `{since, because, restart_when}`,
 * and its presence is the whole question. The shape is checked at the write, so anything non-empty here is a
 * shelf somebody deliberately set; a value that is not an object is not read as one.
 */
function isShelved(record: PanelRecord): boolean {
  if (record.kind !== 'direction') return false
  return isObj(dataOf(record)['shelved'])
}

/** Every link in the project, as an undirected neighbour list. Broken links are still edges. The gate is not read. */
function neighboursIn(workspaceId: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (from: string, to: string) => {
    const set = out.get(from) ?? new Set<string>()
    set.add(to)
    out.set(from, set)
  }
  for (const link of allLinks(workspaceId)) {
    add(link.fromId, link.toId)
    add(link.toId, link.fromId)
  }
  return out
}

/** How many links each record is from the anchor. Absent means no chain of links reaches it. */
function hopsFrom(anchorId: string, neighbours: Map<string, Set<string>>, reach: number): Map<string, number> {
  const seen = new Map<string, number>([[anchorId, 0]])
  let edge = [anchorId]
  for (let hop = 1; hop <= reach; hop += 1) {
    const next: string[] = []
    for (const id of edge) {
      for (const other of neighbours.get(id) ?? []) {
        if (seen.has(other)) continue
        seen.set(other, hop)
        next.push(other)
      }
    }
    if (next.length === 0) break
    edge = next
  }
  return seen
}

/**
 * How far the walk goes when it is allowed to run to the end of the graph.
 *
 * Used only to tell `beyond_reach` from `not_linked_to_here`, which are different facts about a
 * record and would otherwise arrive as one number.
 */
function connectedTo(anchorId: string, neighbours: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>([anchorId])
  const queue = [anchorId]
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const other of neighbours.get(id) ?? []) {
      if (seen.has(other)) continue
      seen.add(other)
      queue.push(other)
    }
  }
  return seen
}

/** The rungs shorter than this one, longest first. The order the answer is shortened in. */
function shorterThan(rung: Rung): Rung[] {
  return RUNGS.filter((one) => positionOf(one) < positionOf(rung)).reverse()
}

/**
 * ONE OPEN LOOP AT ONE LENGTH.
 *
 * `wordsAt` is the shared resolver: it reads a stored field and never cuts, generates or guesses.
 * A record whose title column is the only thing written comes back with the title, and the answer
 * says which field it came from.
 */
function loopAt(
  candidate: Candidate,
  rung: Rung,
  hops: number | null,
  modules: string[],
  unsettledForks: Set<string>,
): OpenLoop {
  const { record, kind } = candidate
  const words = wordsAt(record, rung)
  const { move, unreadable } = readWhoseMove(record)
  const { lines, attempts } = doNotRepeatOf(record)
  const state = storedState(record)
  const depth = depthOf(record)

  return {
    id: record.id,
    kind,
    says: words.kind === 'text' ? words.text : record.title,
    from: words.kind === 'text' ? words.field : 'title',
    state,
    progress: state === null ? null : progressOf(state),
    ...(depth === null ? {} : { depth }),
    whoseMove: move,
    ...(unreadable === null ? {} : { whoseMoveUnreadable: unreadable }),
    hops,
    lastChanged: record.updatedAt,
    modules,
    ...(lines.length === 0 ? {} : { doNotRepeat: lines }),
    ...(attempts === 0 ? {} : { attempts }),
    ...(unsettledForks.has(record.id) ? { onlyAPersonCanSettle: true as const } : {}),
  }
}

/**
 * EVERY OPEN LOOP IN ONE PROJECT. THE MEMBERSHIP RULE, WRITTEN ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * Two readings need it and they used to get it two different ways. `openLoopsFor` worked it out and
 * then cut the answer to a byte budget; `whoseMoveIn` called `openLoopsFor` and counted the CUT
 * list, so `GET /api/whose-move` reported the page as the project. Measured on 27 August 2026: it
 * said 38 where the project holds 143, and it hid `RK4zJb6hJyV6` — a loop whose move is the
 * person's. The two answers now come from here, once, and neither can work it out for itself.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY EXCLUSION IS A STORED FACT
 * ---------------------------------------------------------------------------------------
 *
 * The kind, the state word read through `progressOf`, and — for a fork — whether `readForks` says a
 * person settled it. Nothing here reads what a record SAYS in order to decide whether to carry it.
 * Distance from an anchor is NOT here: that is a fact about where the reader is standing, not about
 * the project, and it is applied by `openLoopsFor` on top of this.
 */
export interface ProjectOpenLoops {
  /** Live records of the six loop kinds in this project. Carried plus left out, always. */
  candidates: Candidate[]
  /** The ones whose own stored state does not say they have ended. This is the project's answer. */
  open: Candidate[]
  /** The ids this rule left out, by the three buckets it can fill. */
  leftOut: { finished: string[]; shelved: string[]; settled: string[] }
  /** Forks nobody has settled, for the row that says only a person may settle one. */
  unsettledForks: Set<string>
  /**
   * HOW MANY LIVE RECORDS OF THE PROJECT THIS READER MAY READ, messages in its view included, counted
   * without reading them whole. The population is read from the loop kinds and modules alone.
   */
  readableCount: (reader: AMessageReader | undefined) => number
  /** Which modules a record is linked to. Empty is the common answer and it is a real one. */
  modulesOf: (id: string) => string[]
  /** Every link in the project as an undirected neighbour list, built once. */
  neighbours: Map<string, Set<string>>
}

export function openLoopsInProject(workspaceId: string, forksRead: ForksRead = readForks()): ProjectOpenLoops {
  // ONLY THE LOOP KINDS AND THE MODULES ARE READ WHOLE, in the order every record of the project would
  // come in. The rest of the project is counted, never parsed: see `readableCount` below.
  const everything = liveRecordsOfKinds(workspaceId, [...LOOP_KINDS, 'module'])
  const loopKinds = new Set<string>(LOOP_KINDS)
  const candidates: Candidate[] = everything
    .filter((record) => loopKinds.has(record.kind))
    .map((record) => ({ record, kind: record.kind as LoopKind }))

  // WHICH FORKS ARE OPEN IS `readForks`, NOT A SECOND OPINION. That reading spans projects by
  // design, so it is narrowed to this one here — narrowing what came back is not filtering the
  // query, and no caller-supplied value reaches it.
  const forks = forksRead
  const unsettledForks = new Set(forks.open.filter((one) => one.workspaceId === workspaceId).map((one) => one.recordId))
  const settledForks = new Set(
    forks.settled.filter((one) => one.workspaceId === workspaceId).map((one) => one.proposalId),
  )

  const neighbours = neighboursIn(workspaceId)
  const moduleIds = new Set(everything.filter((record) => record.kind === 'module').map((record) => record.id))
  const modulesOf = (id: string): string[] => [...(neighbours.get(id) ?? [])].filter((other) => moduleIds.has(other))

  const open: Candidate[] = []
  const finished: string[] = []
  const shelved: string[] = []
  const settled: string[] = []
  for (const candidate of candidates) {
    const { record, kind } = candidate
    if (kind === 'proposal') {
      // A proposal is not work with a state word. It is open until a decision is linked to it.
      if (settledForks.has(record.id)) {
        settled.push(record.id)
        continue
      }
      // A proposal `readForks` calls neither open nor settled has no readable resolution at all —
      // and, since 27 August 2026, may also be one something supersedes or one that is a duplicate
      // of another fork. None of those is the same as settled: nobody decided anything, so it stays
      // in. Its row simply does not claim that only a person may settle it, because this reading
      // cannot say so.
    } else if (isShelved(record)) {
      // A DIRECTION ON THE SHELF IS STOPPED AND KEPT, not finished and not open. It is left out of
      // the open loops and the counts and stays everywhere else — see criterion S1.
      shelved.push(record.id)
      continue
    } else if (hasEnded(record)) {
      finished.push(record.id)
      continue
    }
    open.push(candidate)
  }

  return {
    candidates,
    open,
    leftOut: { finished, shelved, settled },
    unsettledForks,
    // A READER LIMITED TO ITS OWN MESSAGES IS COUNTED FROM THOSE MESSAGES. The count is the project's live records that
    // are not messages, and the project's live messages this reader is a party to. Counting from every message of the
    // project's view would read the id of each one only to keep the reader's own. This gives the number that count
    // gives, as `theLiveMessagesOfAProjectAReaderIsAPartyTo` says. A reader who reads every message, and a reader with
    // no participant, are counted as before.
    readableCount: (reader) => {
      if (reader === undefined || reader.readsEveryMessage) return aProjectCountedWithoutMessageIds(workspaceId)
      if (reader.who === null) {
        const counted = aProjectCounted(workspaceId)
        return counted.notMessages + theMessagesThisReaderMayRead(reader, counted.messageIds).size
      }
      return aProjectCountedLessItsMessages(workspaceId) + theLiveMessagesOfAProjectAReaderIsAPartyTo(reader.who, workspaceId).size
    },
    modulesOf,
    neighbours,
  }
}

/**
 * WHAT IS STILL OPEN AROUND ONE THING.
 *
 * It reads. It writes nothing, it starts nothing, and every number it reports is counted from the
 * rows rather than judged.
 */
export function openLoopsFor(ask: OpenLoopsAsk): OpenLoops {
  const workspaceId = ask.workspaceId
  const anchorId = ask.anchorId ?? null
  const reach = ask.reach ?? DEFAULT_REACH
  const asked = ask.rung ?? DEFAULT_RUNG
  const budget = ask.budgetBytes ?? BUDGET_BYTES

  // The anchor first, so a bad id is a plain answer rather than an empty list that reads as good news.
  const noLiveRecordHere = (): PanelError => new PanelError(`There is no live record ${anchorId ?? ''} to stand at.`, 404)
  // A MESSAGE THIS READER MAY NOT READ IS NOT A PLACE TO STAND, and is refused in the words an id naming
  // nothing is refused with, so the answer does not say it is there.
  if (anchorId !== null && ask.reader !== undefined) refuseAMessageThisReaderMayNotRead(ask.reader, anchorId, noLiveRecordHere)
  const anchor = anchorId === null ? null : getRecord(anchorId)
  if (anchorId !== null && (anchor === null || anchor.deletedAt !== null)) throw noLiveRecordHere()

  // THE PROJECT'S OWN ANSWER, from the one membership rule. Everything below this line is about
  // where the reader is standing and how much the answer may weigh; nothing below decides again
  // whether a record is an open loop.
  const population = openLoopsInProject(workspaceId, ask.forks)
  const { candidates, modulesOf, neighbours, unsettledForks } = population
  const derivedStateIds = new Set(candidates
    .filter(({ record }) => readWorkState(record.data).source === 'derived from mainSuiteFix')
    .map(({ record }) => record.id))
  const english = createI18n('en').t

  const hops = anchor === null ? null : hopsFrom(anchor.id, neighbours, reach)
  const connected = anchor === null ? null : connectedTo(anchor.id, neighbours)

  // ------------------------------------------------------------------ membership, from stored facts

  const buckets = new Map<LeftOutBucket, string[]>()
  // ADDED IN PLACE: a new bucket for each id copied every id the bucket already held.
  const leaveOut = (bucket: LeftOutBucket, id: string): void => {
    const ids = buckets.get(bucket)
    if (ids === undefined) buckets.set(bucket, [id])
    else ids.push(id)
  }
  const kept: Candidate[] = []

  // The buckets the membership rule already answered, in the order it saw them.
  for (const id of population.leftOut.finished) leaveOut('finished', id)
  for (const id of population.leftOut.shelved) leaveOut('shelved', id)
  for (const id of population.leftOut.settled) leaveOut('settled', id)

  for (const candidate of population.open) {
    const { record } = candidate
    if (anchor !== null && record.id === anchor.id) {
      // THE ANCHOR IS NOT SOMETHING AROUND ITSELF. It is left out by name rather than skipped, so
      // the arithmetic still balances and a reader can see why its own record is not on the list.
      leaveOut('where_you_are_standing', record.id)
      continue
    }
    if (hops !== null && connected !== null) {
      const distance = hops.get(record.id)
      if (distance === undefined) {
        leaveOut(connected.has(record.id) ? 'beyond_reach' : 'not_linked_to_here', record.id)
        continue
      }
    }
    kept.push(candidate)
  }

  // The whole project's open loops, for the attachment line and for every sentence that has to name
  // the project total beside a cut number. It is the membership rule's own answer rather than
  // arithmetic over the buckets, so the anchor cannot change it.
  const openInProject = population.open
  const attachedToNoModule = openInProject.filter((one) => modulesOf(one.record.id).length === 0).length

  // ------------------------------------------------------------------ length, then the last resort

  const order = [...kept].sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))

  const build = (rung: Rung, rows: Candidate[]): OpenLoop[] =>
    rows.map((candidate) =>
      loopAt(
        candidate,
        rung,
        hops === null ? null : (hops.get(candidate.record.id) ?? null),
        modulesOf(candidate.record.id),
        unsettledForks,
      ),
    )

  // HOW MANY RECORDS THIS READER MAY READ, worked out once. `assemble` runs once per rung of the ladder,
  // and asking the rule inside it asked it over every record of the project on every rung: 79 s for one
  // brief to an ordinary agent on a copy of the office's data (27 September 2026), against 0.3 s once.
  const readableCount = population.readableCount(ask.reader)
  const assemble = (rung: Rung, rows: Candidate[], why: string | null, dropped: string[]): OpenLoops => {
    // SET, never append: this runs once per attempt at fitting the answer, and appending would
    // count the same dropped record again on every attempt.
    if (dropped.length > 0) buckets.set('quiet_the_longest', [...dropped])
    const loops = build(rung, rows)
    const leftOut: LeftOutGroup[] = LEFT_OUT_BUCKETS.flatMap((bucket): LeftOutGroup[] => {
      const ids = buckets.get(bucket) ?? []
      if (ids.length === 0) return []
      if (bucket !== 'finished') return [{ bucket, sentence: LEFT_OUT_SENTENCES[bucket], count: ids.length, ids }]
      const stored = ids.filter(id => !derivedStateIds.has(id))
      const derived = ids.filter(id => derivedStateIds.has(id))
      return [
        ...(stored.length === 0 ? [] : [{ bucket, sentence: LEFT_OUT_SENTENCES[bucket], count: stored.length, ids: stored }]),
        ...(derived.length === 0 ? [] : [{ bucket, stateSource: 'derived from mainSuiteFix' as const,
          sentence: english('g2b.open.leftOut.finishedDerived'), count: derived.length, ids: derived }]),
      ]
    })
    const leftOutCount = leftOut.reduce((sum, group) => sum + group.count, 0)

    // THE ARITHMETIC IS CHECKED, NOT ASSERTED IN PROSE. Every candidate is carried or is in exactly
    // one bucket. A reader that quietly dropped one would otherwise report a shorter list as a
    // complete answer, which is the failure this whole endpoint exists to prevent.
    if (loops.length + leftOutCount !== candidates.length) {
      throw new Error(
        `openLoopsFor lost a record: ${String(candidates.length)} candidates, ${String(loops.length)} carried, ` +
          `${String(leftOutCount)} left out.`,
      )
    }

    const tally = { person: 0, agent: 0, either: 0, nobodyHasSaid: 0 }
    for (const loop of loops) {
      if (loop.whoseMove === null) tally.nobodyHasSaid += 1
      else tally[loop.whoseMove] += 1
    }

    return {
      workspaceId,
      standingAt:
        anchor === null
          ? null
          : { id: anchor.id, kind: anchor.kind, title: anchor.title, filedBy: whoFiled(workspaceId, anchor.id) },
      reach: anchor === null ? null : reach,
      rung: { asked, drew: rung, why },
      loops,
      leftOut,
      counts: {
        candidates: candidates.length,
        carried: loops.length,
        leftOut: leftOutCount,
        // Counted over what this reader may read, so no message it may not read is in the number.
        outsideThePopulation: readableCount - candidates.length,
      },
      attachment: {
        openLoopsInProject: openInProject.length,
        attachedToNoModule,
        sentence:
          `${String(attachedToNoModule)} of the ${String(openInProject.length)} open loops in this project are ` +
          'linked to no module at all, so a module-shaped question cannot see them.',
      },
      whoseMove: tally,
      // MEASURED WITH `fits: false` AND ONLY THEN SET TRUE. The answer carries its own verdict, so
      // the measurement has to be taken on the longer of the two spellings; setting it to the
      // shorter one afterwards can only make the answer smaller.
      size: { budgetBytes: budget, fits: false },
      // THE NUMBER AND THE CUT IN ONE SENTENCE. `GET /api/whose-move` used to state a count of the
      // carried list as the project's, and this note used to open with "38 open loops in this
      // project" when the project held 143. A reading that cuts to a byte budget says so where its
      // number is, or the number is read as the answer.
      note:
        `${String(loops.length)} of the ${String(openInProject.length)} open loop` +
        (openInProject.length === 1 ? '' : 's') +
        (anchor === null ? ' in this project' : ` in this project, and within ${String(reach)} links of "${anchor.title}",`) +
        ` ${loops.length === 1 ? 'is' : 'are'} carried here; ${String(leftOutCount)} left out and every one of ` +
        `them named. The counts under "whoseMove" are of the ${String(loops.length)} carried, not of the ` +
        `project — GET /api/whose-move counts all ${String(openInProject.length)}. ` +
        POPULATION_SENTENCE +
        ' Nothing here reads what a record says in order to decide whether to carry it.',
    }
  }

  const sizeOf = (answer: OpenLoops): number => Buffer.byteLength(JSON.stringify(answer), 'utf8')

  /** The same answer with its own verdict set. Only ever makes it one byte shorter. */
  const fitting = (answer: OpenLoops): OpenLoops => ({ ...answer, size: { ...answer.size, fits: true } })

  let answer = assemble(asked, order, null, [])
  if (sizeOf(answer) < budget) return fitting(answer)

  for (const rung of shorterThan(asked)) {
    answer = assemble(
      rung,
      order,
      `The whole answer did not fit in ${String(budget)} bytes at "${asked}", so every loop says less. ` +
        'Which loops are here did not change.',
      [],
    )
    if (sizeOf(answer) < budget) return fitting(answer)
  }

  // THE LAST RESORT, AND IT IS THE ONLY PLACE MEMBERSHIP MOVES. The shortest length still did not
  // fit, so the loops that changed longest ago come out — one stored fact, oldest first, and every
  // id named in `quiet_the_longest`.
  const shortest = shorterThan(asked)[shorterThan(asked).length - 1] ?? asked
  /** The answer with the `count` loops that changed longest ago taken out, as the last resort words it. */
  const withOut = (count: number): { answer: OpenLoops; dropped: string[] } => {
    const rows = order.slice(0, order.length - count)
    const dropped = order.slice(order.length - count).reverse().map((one) => one.record.id)
    return {
      dropped,
      answer: assemble(
        shortest,
        rows,
        `The whole answer did not fit in ${String(budget)} bytes even at "${shortest}", so ` +
          `${String(dropped.length)} loop${dropped.length === 1 ? '' : 's'} that changed longest ago came out. ` +
          'Every one of them is named below.',
        dropped,
      ),
    }
  }
  // THE FEWEST LOOPS TO TAKE OUT, FOUND BY HALVING RATHER THAN ONE AT A TIME. Taking one more loop out
  // puts its id in the list of those taken out and takes its whole row away, and a row always says
  // more than its id, so each loop taken out makes the answer shorter. So the answer with all of them
  // out is the shortest; when even that does not fit, none does. Otherwise the fewest that fit are
  // found by halving. One at a time, every try built and measured the whole answer again: about half
  // a second for 457 loops on an office of the live shape (round 34 of wave 13n).
  let dropped: string[] = order.map((one) => one.record.id).reverse()
  if (order.length > 0 && sizeOf(withOut(order.length).answer) < budget) {
    let low = 1
    let high = order.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (sizeOf(withOut(middle).answer) < budget) high = middle
      else low = middle + 1
    }
    const found = withOut(low)
    // THE SHORTENING IS CHECKED, NOT ASSUMED: with one loop fewer taken out the answer must not fit.
    if (low > 1 && sizeOf(withOut(low - 1).answer) < budget) {
      throw new Error(`openLoopsFor found ${String(low)} loops to take out, but ${String(low - 1)} already fit.`)
    }
    return fitting(found.answer)
  }

  // NOTHING FITS, AND THAT IS SAID RATHER THAN HIDDEN. Naming every excluded id costs more than the
  // budget allows, so there is no honest answer under it: the names are what make a left-out count
  // checkable, and dropping them to make a number come out right would be the fake success this
  // product exists to refuse. `size.fits` is false and the note says why.
  return assemble(
    shortest,
    [],
    `Nothing this scope can answer fits in ${String(budget)} bytes: naming the ${String(candidates.length)} ` +
      'records it left out costs more than that on its own. The answer is here in full and it is over the ' +
      'size asked for. Ask about a narrower scope.',
    dropped,
  )
}

/**
 * WHOSE MOVE IT IS, ACROSS ONE PROJECT.
 *
 * The projection `whose_move` gets for itself. It is NOT `GET /api/needs-you`: that route answers
 * what an agent is REFUSED — settling a fork — from the kind and the resolution, with no
 * caller-supplied filter reaching it. This one reads a field an agent may write. Folding the two
 * together would let an agent put work into the owner's governance queue by writing a word.
 */
export interface WhoseMoveReading {
  workspaceId: string
  /**
   * Every open loop IN THE PROJECT that says whose move it is, grouped by the word.
   *
   * NOT CUT TO A BYTE BUDGET, unlike `GET /api/open-loops`. Only the loops that carry one of the
   * three words are drawn in full, and in this corpus that is twenty-three of a hundred and
   * forty-three, so the whole answer fits without anything being dropped. If it ever stops fitting
   * this has to grow a budget AND a sentence saying it was cut — never the count of the cut list.
   */
  person: OpenLoop[]
  agent: OpenLoop[]
  either: OpenLoop[]
  /** How many open loops carry no word at all. Named, because absence is the common answer. */
  nobodyHasSaid: { count: number; ids: string[] }
  /**
   * Loops carrying a value that is not one of the three words. Named separately from absence.
   *
   * A word nobody can read is somebody having said something Mole Office cannot use, and counting it as
   * "nobody has said" would hide a real fault in an imported corpus behind the honest answer.
   */
  unreadable: { count: number; ids: string[] }
  /** How many open loops there are in this project, from the same rule the groups come from. */
  openLoopsInProject: number
  note: string
}

export function whoseMoveIn(workspaceId: string, rung: Rung = 'title'): WhoseMoveReading {
  // THE PROJECT, NOT THE PAGE. This used to call `openLoopsFor` and count `open.loops` — the list
  // that had already been cut to 16 KB — and write its length into the sentence below as the
  // project total. Measured on 27 August 2026 it said "Of 38 open loops in this project" where the
  // project held 143, and the one person-move loop it hid was `RK4zJb6hJyV6`, *A block that was put
  // down still reads as the pipeline's live front*. It now reads the membership rule directly.
  const population = openLoopsInProject(workspaceId)

  const rowsFor = (rows: Candidate[]): OpenLoop[] =>
    rows.map((candidate) =>
      // `hops` is null because nothing here stands anywhere: this is a question about a project.
      loopAt(candidate, rung, null, population.modulesOf(candidate.record.id), population.unsettledForks),
    )

  const said = new Map<MoveActor, Candidate[]>(MOVE_ACTORS.map((word) => [word, [] as Candidate[]]))
  const unsaid: Candidate[] = []
  const unreadable: Candidate[] = []
  for (const candidate of population.open) {
    const read = readWhoseMove(candidate.record)
    if (read.unreadable !== null) unreadable.push(candidate)
    else if (read.move === null) unsaid.push(candidate)
    else (said.get(read.move) as Candidate[]).push(candidate)
  }

  const total = population.open.length
  const withAWord = total - unsaid.length - unreadable.length

  return {
    workspaceId,
    person: rowsFor(said.get('person') ?? []),
    agent: rowsFor(said.get('agent') ?? []),
    either: rowsFor(said.get('either') ?? []),
    nobodyHasSaid: { count: unsaid.length, ids: unsaid.map((one) => one.record.id) },
    unreadable: { count: unreadable.length, ids: unreadable.map((one) => one.record.id) },
    openLoopsInProject: total,
    note:
      `Of ${String(total)} open loops in this project — all of them, not a page of them — ` +
      `${String(withAWord)} say whose move it is and ${String(unsaid.length)} do not` +
      (unreadable.length === 0
        ? ''
        : `, and ${String(unreadable.length)} carry a word Mole Office cannot read, named under "unreadable"`) +
      '. NOBODY HAS SAID IS NOT "either": one is a gap and the other is somebody having decided it does not ' +
      'matter which. THIS ANSWER IS NOT CUT TO A SIZE — GET /api/open-loops is, and says so beside its own ' +
      'numbers. This is not GET /api/needs-you, which answers what only a person may DO — settling a fork — ' +
      'and reads nothing written here.',
  }
}
