// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH AGENTS WOULD BE CANDIDATES FOR A WAKE. IT ANSWERS A QUESTION AND IT DOES NOT ACT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * This reads. It writes no row, it records no wake, it moves no work state, it sends no message and
 * it starts nothing. It calls nothing in `src/server/lib/wake.ts`. A caller that decides to act on
 * what it says has to do that itself, in the open, through the door that records a wake.
 *
 * The owner's section 19: *"Watchdog / slap only targets Agents whose Work State is Working"*, and
 * never merely because *"a process is online"*, *"the terminal is idle"* or *"a timer elapsed"*.
 * So there is no timer here and no presence reading. Presence answers whether an agent can be
 * reached; it says nothing about whether the work is unfinished, and joining the two is how an
 * agent that is deliberately standing by gets chased.
 *
 * ---------------------------------------------------------------------------------------
 * SEVEN CONDITIONS, AND THREE OF THEM THIS PRODUCT CANNOT ANSWER AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * All seven must hold before an agent is a candidate. `design/round-eleven/design/agent-lifecycle.md`
 * section 9.1 works out which the product can answer today, and the answer is three, one partly and
 * three not at all.
 *
 * **The three it cannot answer say so, and they are never defaulted to true or false.** Each
 * condition reads `holds`, `does not hold`, or `cannot be evaluated`, and the third is a real
 * answer rather than a missing one. A condition defaulted to true is a watchdog guessing, which is
 * worse than no watchdog: it would wake agents on evidence nobody has.
 *
 * **The consequence is stated rather than hidden: no agent can be a candidate today.** Three
 * conditions cannot be evaluated by anything under `src/`, so the strongest answer any agent gets
 * is *this cannot be decided*, and the reading says which conditions stopped it. That is the honest
 * state of the product and it is what the reply reports on every call.
 *
 * **What each condition needs is declared once, with the reader beside it.** A condition Mole Office
 * cannot answer carries the sentence saying why and has no reader at all, so it is not possible to
 * add a guess to one without deleting the sentence that says it is a guess.
 */

import { NOBODY_HAS_SAID, WORK_STATE, type WorkStateWord } from '@shared/lifecycle.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import type { PanelRecord } from '@shared/types.ts'
import { minutesSince } from './arrivals.ts'
import { openAttachmentsFor, type AttachmentView } from './attachments.ts'
import { readForks } from './forks.ts'
import { workStateOf, transitionStoreExists } from './lifecycle.ts'
import { openLoopsInProject } from './openloops.ts'
import {
  listChanges,
  listRecords,
  sessionFilterValues,
  whoSettlesThisFork,
} from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'

// ============================================================================ the two thresholds

/**
 * HOW LONG NOTHING MAY MOVE BEFORE IT COUNTS AS NO RECENT PROGRESS. SIXTY MINUTES.
 *
 * **NOBODY HAS MEASURED WHAT IT SHOULD BE.** The measurement that would settle it is the gap
 * between consecutive `changes` rows written inside one attachment, and attachments are new enough
 * that there is no such distribution to read yet.
 *
 * Sixty rather than five, because section 9.2 of the lifecycle design says the cost of this signal
 * is already known: an agent editing files and running tests for an hour writes no `changes` row
 * and looks like no progress. The answer to that is a slow watchdog, not a wider signal.
 */
export const QUIET_FOR_MINUTES = 60

/** The sentence that says the number is a placeholder, wherever the number is drawn. */
export const QUIET_THRESHOLD_IS_UNMEASURED =
  `${QUIET_FOR_MINUTES} minutes is the threshold this reading uses, and nobody has measured what it should be. ` +
  'The measurement that would settle it is how long an agent doing real work normally goes without anything in ' +
  'the project moving, and there is no attachment history long enough to take it.'

/**
 * HOW FAR FROM AN AGENT A PIECE OF WORK MAY BE AND STILL BE CALLED ITS WORK. TWO LINKS.
 *
 * The same two `openLoopsFor` uses, and for the same reason it gives: far enough to reach a problem
 * filed against a sibling, near enough to mean something.
 */
export const REACH = 2

// ============================================================================ the vocabulary

/** What one condition came out as. Three words, and the third is an answer rather than a gap. */
export const CONDITION_VERDICTS = ['holds', 'does-not-hold', 'cannot-be-evaluated'] as const

export type ConditionVerdict = (typeof CONDITION_VERDICTS)[number]

/** What the seven conditions together came out as, for one agent. */
export const WATCHDOG_ANSWERS = ['a-candidate', 'not-a-candidate', 'cannot-be-decided'] as const

export type WatchdogAnswer = (typeof WATCHDOG_ANSWERS)[number]

/** What each of the three answers means to somebody reading it. */
export const WATCHDOG_ANSWER_SENTENCE: Readonly<Record<WatchdogAnswer, string>> = {
  'a-candidate':
    'All seven conditions hold, so this agent is one somebody could decide to wake. Nothing has been started and ' +
    'no wake has been recorded.',
  'not-a-candidate': 'At least one condition definitely does not hold, so this agent is not one to wake.',
  'cannot-be-decided':
    'No condition definitely fails, and at least one cannot be evaluated at all, so this reading cannot say ' +
    'whether this agent is a candidate. It is not a yes.',
}

// ============================================================================ the seven conditions

/** Everything one condition reading needs, worked out once for the whole project. */
interface ProjectFacts {
  workspaceId: string
  now: Date
  quietForMinutes: number
  /** Every live record in the project as an undirected neighbour list. */
  neighbours: Map<string, Set<string>>
  /** The ids of the project's open loops — work whose own state does not say it has ended. */
  openLoopIds: Set<string>
  /** The open forks in this project that only the owner may settle, or that nobody has classified. */
  ownerGateIds: Set<string>
}

/** What one condition is asked about one agent. */
interface AgentFacts {
  agentId: string
  /** The open attachments serving this agent. What condition 6 reads progress over. */
  openAttachments: AttachmentView[]
  /** Every id within `REACH` links of the agent record, the agent itself included. */
  withinReach: Set<string>
}

/** What one reader answers. */
interface ConditionAnswer {
  verdict: ConditionVerdict
  /** One plain sentence saying what was read and what it said. */
  says: string
}

/**
 * ONE CONDITION, WITH EITHER A READER OR THE REASON THERE IS NOT ONE. NEVER BOTH AND NEVER NEITHER.
 *
 * The union is the whole rule. A condition this product cannot answer carries `cannotBeAnswered`
 * and has no reader, so nothing can quietly start answering it: the sentence saying it is
 * unanswerable would have to be deleted in the same edit, and that is a visible change.
 */
type Condition = {
  number: number
  /** What it is, in a few plain words. */
  name: string
  /** What it asks, as the owner's section 19 puts it. */
  asks: string
  /** What would answer it: the rows, the reading or the event. */
  evidence: string
} & (
  | { read: (project: ProjectFacts, agent: AgentFacts) => ConditionAnswer; cannotBeAnswered?: undefined }
  | { read?: undefined; cannotBeAnswered: string }
)

/**
 * THE SEVEN, IN THE OWNER'S ORDER.
 *
 * Four have readers. Three do not, and each of those three carries the sentence saying what Mole Office
 * would need before it could have one.
 */
export const THE_SEVEN: readonly Condition[] = [
  {
    number: 1,
    name: 'the agent says it is working',
    asks: 'Is this agent\'s work state Working?',
    evidence: 'the newest row of agent_work_transitions for this agent',
    read: (project, agent) => {
      if (!transitionStoreExists()) {
        return {
          verdict: 'cannot-be-evaluated',
          says:
            'This database has no agent_work_transitions table, so no agent has a work state to read. The ' +
            'migration that creates it is held in held-migrations/ until the person opens the ' +
            'announced window.',
        }
      }
      const reading = workStateOf(agent.agentId, project.workspaceId)
      if (reading.state === null) {
        return { verdict: 'does-not-hold', says: `${NOBODY_HAS_SAID} Nothing says it is working.` }
      }
      if (reading.state === 'working') {
        return {
          verdict: 'holds',
          says: `This agent has read ${WORK_STATE.working.word} since ${reading.since}, because: ${reading.because}`,
        }
      }
      // THE TABLE IS ASKED ONCE, HERE, and the sentence below uses what it answered. Nothing
      // composes a work state into prose from the stored word — `src/shared/lifecycle.ts` holds the
      // five words and the five sentences, and this is the only place this file reads them.
      const said: WorkStateWord = WORK_STATE[reading.state]
      return {
        verdict: 'does-not-hold',
        says: `This agent reads ${said.word}, not ${WORK_STATE.working.word}. ${said.sentence}`,
      }
    },
  },
  {
    number: 2,
    name: 'work remains unfinished',
    asks: 'Does the stage or the work remain incomplete?',
    evidence: 'open loops within two links of this agent, and the campaign stage it is in',
    read: (project, agent) => {
      const open = [...agent.withinReach].filter((id) => project.openLoopIds.has(id))
      if (open.length > 0) {
        return {
          verdict: 'holds',
          says:
            `${open.length} open piece${open.length === 1 ? '' : 's'} of work ${open.length === 1 ? 'is' : 'are'} ` +
            `within ${REACH} links of this agent, and no stored state says ${open.length === 1 ? 'it has' : 'they have'} ended.`,
        }
      }
      return {
        verdict: 'cannot-be-evaluated',
        says:
          `No open piece of work is linked within ${REACH} links of this agent. That does not say the work is ` +
          'complete: the other half of this condition is the campaign stage the agent is in, and Mole Office has no ' +
          'representation of a stage, so nothing can say whether one is unfinished.',
      }
    },
  },
  {
    number: 3,
    name: 'nothing is waiting on the owner',
    asks: 'Is there no genuine owner gate?',
    evidence: 'the open forks only the owner may settle, and which of them this agent is linked to',
    read: (project, agent) => {
      const gates = [...agent.withinReach].filter((id) => project.ownerGateIds.has(id))
      if (gates.length === 0) {
        return {
          verdict: 'holds',
          says:
            `No fork the owner has to settle is linked within ${REACH} links of this agent. ` +
            `${project.ownerGateIds.size} such fork${project.ownerGateIds.size === 1 ? ' is' : 's are'} open in ` +
            'this project and none of them reaches this agent.',
        }
      }
      return {
        verdict: 'does-not-hold',
        says:
          `This agent is within ${REACH} links of ${gates.length} open fork${gates.length === 1 ? '' : 's'} the ` +
          `owner has to settle: ${gates.join(', ')}. Waking it would not move that.`,
      }
    },
  },
  {
    number: 4,
    name: 'no permission prompt is waiting',
    asks: 'Is there no permission blocker?',
    evidence: 'whether the provider is sitting on a permission prompt right now',
    cannotBeAnswered:
      'Mole Office cannot see a provider permission prompt. The evidence would be the provider\'s own notification and ' +
      'permission-request events, and nothing is wired to them. An agent stopped at a prompt looks exactly like ' +
      'an agent that stopped for no reason, so this is left unanswered rather than assumed either way.',
  },
  {
    number: 5,
    name: 'no child run is still going',
    asks: 'Is there no legitimate active child workflow still progressing?',
    evidence: 'the live sessions on the machine, which only something outside this server may list',
    cannotBeAnswered:
      'This server cannot tell whether a child run is still progressing. Mole Office records the child runs a provider ' +
      'reported to it, and a recorded child that is still open may have died without saying so. The check that ' +
      'would settle it asks the machine what is running, and a file under src/ may not run a command.',
  },
  {
    number: 6,
    name: 'nothing has moved recently',
    asks: 'Has there been no recent meaningful semantic progress?',
    evidence: 'the newest change row written by an open attachment of this agent',
    read: (project, agent) => {
      if (agent.openAttachments.length === 0) {
        return {
          verdict: 'cannot-be-evaluated',
          says:
            'This agent has no open attachment, so there is no run whose work could be read. Progress is read ' +
            'from what a participating run changed in the project, and there is no participating run.',
        }
      }
      // EVERY SPELLING OF EVERY OPEN ATTACHMENT, not just the record ids. Rows written before an
      // attachment was filed carry the run's name, and matching on the id alone would answer "this
      // agent changed nothing" with a short, confident, wrong list.
      const values = new Set<string>()
      for (const attachment of agent.openAttachments) {
        for (const value of sessionFilterValues(resolveSessionRef(attachment.id, project.workspaceId))) {
          values.add(value)
        }
      }
      const newest = listChanges({ workspaceId: project.workspaceId, session: [...values], limit: 1 })[0]
      if (newest === undefined) {
        return {
          verdict: 'holds',
          says:
            `Nothing in this project has ever been changed by ${agent.openAttachments.length === 1 ? 'the open run' : 'the open runs'} ` +
            'serving this agent. PROGRESS IS READ AS PROJECT CHANGES, so an agent working entirely outside ' +
            'Mole Office reads this way too.',
        }
      }
      const quiet = minutesSince(newest.at, project.now)
      if (quiet === null) {
        return {
          verdict: 'cannot-be-evaluated',
          says:
            `The newest change this agent's open runs made is stamped "${newest.at}", and that stamp cannot be ` +
            'read. A stamp nobody can read is not a silence and is not an arrival.',
        }
      }
      if (quiet >= project.quietForMinutes) {
        return {
          verdict: 'holds',
          says:
            `The last thing this agent's open runs changed in the project was ${quiet} minutes ago, which is at ` +
            `least the ${project.quietForMinutes} minutes this reading calls quiet.`,
        }
      }
      return {
        verdict: 'does-not-hold',
        says:
          `This agent's open runs changed something ${quiet} minutes ago, which is inside the ` +
          `${project.quietForMinutes} minutes this reading calls quiet. It is making progress.`,
      }
    },
  },
  {
    number: 7,
    name: 'there is a safe place to carry on from',
    asks: 'Does a concrete safe continuation exist?',
    evidence: 'a stated next safe action and the place the work stopped',
    cannotBeAnswered:
      'Nothing in Mole Office states a next safe action for an agent. A context bundle can be assembled for a run to ' +
      'read, and it carries what is open rather than what to do next, which is a different thing. Waking an ' +
      'agent with nowhere named to carry on from is what produces a run that asks what it should be doing.',
  },
]

// ============================================================================ what it answers

/** One condition, as it is read back. */
export interface ConditionReading {
  number: number
  name: string
  asks: string
  evidence: string
  verdict: ConditionVerdict
  /** What was read and what it said, in plain words. */
  says: string
}

/** One agent, with all seven conditions and what they come to. */
export interface AgentWatchdogReading {
  agentId: string
  title: string
  conditions: ConditionReading[]
  answer: WatchdogAnswer
  /** What the answer means, and which conditions decided it. */
  says: string
}

/** What one call answers. */
export interface WatchdogReading {
  workspaceId: string
  /** The moment this was read, because every number in it is relative to that moment. */
  at: string
  quietForMinutes: number
  /** The sentence saying nobody has measured the threshold. Drawn wherever the number is. */
  thresholdIsUnmeasured: string
  agents: AgentWatchdogReading[]
  /** The agents where all seven hold. Empty on this product, and `note` says why. */
  candidates: string[]
  /** The agents where nothing failed and something could not be evaluated. */
  cannotBeDecided: string[]
  /** The agents where at least one condition definitely does not hold. */
  notCandidates: string[]
  /** The conditions no reader exists for, by number, counted from the declaration. */
  cannotBeAnswered: number[]
  note: string
  /** What this reading did not do, on every call. */
  startsNothing: string
}

/** What the reading did not do, said on every call because a reader may assume otherwise. */
export const THIS_READING_STARTS_NOTHING =
  'THIS ANSWERED A QUESTION AND DID NOTHING ELSE. No wake was recorded, no process was started, no message was ' +
  'sent and no work state was moved. Deciding to act on this is a separate act by somebody else.'

// ============================================================================ the reading

export interface WatchdogAsk {
  workspaceId: string
  /** How long nothing may move before it counts as no progress. Defaults to `QUIET_FOR_MINUTES`. */
  quietForMinutes?: number
  /** The moment to read as now. Supplied by tests; the server passes its own clock. */
  now?: Date
}

/**
 * WHICH AGENTS IN THIS PROJECT WOULD BE CANDIDATES FOR A WAKE.
 *
 * It reads every live durable agent in the project, puts all seven conditions to each, and reports
 * every verdict with the sentence behind it. **It never returns a bare list of candidates**: a
 * caller has to be able to see which condition decided each answer, because a watchdog whose
 * reasoning cannot be read is one nobody can argue with.
 */
export function watchdogCandidates(ask: WatchdogAsk): WatchdogReading {
  const now = ask.now ?? new Date()
  const quietForMinutes = ask.quietForMinutes ?? QUIET_FOR_MINUTES

  const project = projectFacts(ask.workspaceId, now, quietForMinutes)
  const agents = listRecords({ workspaceId: ask.workspaceId, kind: 'agent' })

  const readings = agents.map((agent) => readOneAgent(agent, project))
  const candidates = readings.filter((one) => one.answer === 'a-candidate').map((one) => one.agentId)
  const cannotBeDecided = readings.filter((one) => one.answer === 'cannot-be-decided').map((one) => one.agentId)
  const notCandidates = readings.filter((one) => one.answer === 'not-a-candidate').map((one) => one.agentId)
  // COUNTED FROM THE DECLARATION AND NEVER TYPED OUT. A condition given a reader drops off this
  // list in the same edit that gives it one, so the reply cannot go on saying three when it is two.
  const cannotBeAnswered = THE_SEVEN.filter((one) => one.read === undefined).map((one) => one.number)

  return {
    workspaceId: ask.workspaceId,
    at: now.toISOString(),
    quietForMinutes,
    thresholdIsUnmeasured: QUIET_THRESHOLD_IS_UNMEASURED,
    agents: readings,
    candidates,
    cannotBeDecided,
    notCandidates,
    cannotBeAnswered,
    note: noteFor(readings.length, candidates.length, cannotBeDecided.length, notCandidates.length, cannotBeAnswered),
    startsNothing: THIS_READING_STARTS_NOTHING,
  }
}

/** The one sentence the whole reading says about itself. Counted, never estimated. */
function noteFor(
  agents: number,
  candidates: number,
  cannotBeDecided: number,
  notCandidates: number,
  cannotBeAnswered: readonly number[],
): string {
  if (agents === 0) {
    return 'No durable agent is filed in this project, so there is nobody to read. That is nothing there, not nobody looked.'
  }
  const counted =
    `${agents} durable agent${agents === 1 ? '' : 's'} read: ${candidates} would be a candidate, ` +
    `${notCandidates} definitely not, and ${cannotBeDecided} cannot be decided.`
  if (cannotBeAnswered.length === 0) return counted
  return (
    `${counted} NO AGENT CAN READ AS A CANDIDATE HERE, whatever the corpus says: ` +
    `condition${cannotBeAnswered.length === 1 ? '' : 's'} ${cannotBeAnswered.join(', ')} of the seven ` +
    `cannot be evaluated by anything in this product, and all seven must hold. Each of those conditions says ` +
    'what it would need. Answering one by guessing would be worse than not answering it.'
  )
}

/** Everything the seven need that is about the project rather than about one agent. */
function projectFacts(workspaceId: string, now: Date, quietForMinutes: number): ProjectFacts {
  // ONE READING OF THE PROJECT'S OPEN WORK, not a second opinion about it. `openLoopsInProject` is
  // what the open-loops surfaces answer from, and taking a different view here would let two
  // screens disagree about whether a piece of work had ended.
  const loops = openLoopsInProject(workspaceId)

  // WHICH FORKS THE OWNER HAS TO SETTLE, from the same reader the settle guard asks. A fork nobody
  // has classified counts, because `assertMaySettleFork` treats an unclassified fork as the owner's — so
  // leaving it out would call something a candidate that is in fact waiting on the owner.
  const ownerGateIds = new Set<string>()
  for (const fork of readForks().open) {
    if (fork.workspaceId !== workspaceId) continue
    const settles = whoSettlesThisFork(fork.recordId)
    if (settles === null || settles === THE_OWNER) ownerGateIds.add(fork.recordId)
  }

  return {
    workspaceId,
    now,
    quietForMinutes,
    neighbours: loops.neighbours,
    openLoopIds: new Set(loops.open.map((one) => one.record.id)),
    ownerGateIds,
  }
}

/** Put all seven to one agent and say what they come to together. */
function readOneAgent(agent: PanelRecord, project: ProjectFacts): AgentWatchdogReading {
  const facts: AgentFacts = {
    agentId: agent.id,
    openAttachments: openAttachmentsFor(agent.id, project.workspaceId),
    withinReach: within(project.neighbours, agent.id, REACH),
  }

  const conditions: ConditionReading[] = THE_SEVEN.map((one) => {
    const answered: ConditionAnswer =
      one.read === undefined
        ? { verdict: 'cannot-be-evaluated', says: one.cannotBeAnswered }
        : one.read(project, facts)
    return {
      number: one.number,
      name: one.name,
      asks: one.asks,
      evidence: one.evidence,
      verdict: answered.verdict,
      says: answered.says,
    }
  })

  const failed = conditions.filter((one) => one.verdict === 'does-not-hold')
  const unknown = conditions.filter((one) => one.verdict === 'cannot-be-evaluated')
  const answer: WatchdogAnswer =
    failed.length > 0 ? 'not-a-candidate' : unknown.length > 0 ? 'cannot-be-decided' : 'a-candidate'

  const which =
    failed.length > 0
      ? ` Condition${failed.length === 1 ? '' : 's'} ${failed.map((one) => one.number).join(', ')} ` +
        `${failed.length === 1 ? 'does' : 'do'} not hold.`
      : unknown.length > 0
        ? ` Condition${unknown.length === 1 ? '' : 's'} ${unknown.map((one) => one.number).join(', ')} ` +
          `cannot be evaluated.`
        : ''

  return {
    agentId: agent.id,
    title: agent.title,
    conditions,
    answer,
    says: `${WATCHDOG_ANSWER_SENTENCE[answer]}${which}`,
  }
}

/**
 * Every id within `hops` links of a starting id, the starting id included.
 *
 * Breadth first over the same undirected neighbour list `openLoopsFor` measures its own reach with,
 * so *two links away* means one thing across the two readings.
 */
function within(neighbours: Map<string, Set<string>>, from: string, hops: number): Set<string> {
  const seen = new Set<string>([from])
  let edge = [from]
  for (let step = 0; step < hops; step += 1) {
    const next: string[] = []
    for (const id of edge) {
      for (const other of neighbours.get(id) ?? []) {
        if (seen.has(other)) continue
        seen.add(other)
        next.push(other)
      }
    }
    if (next.length === 0) break
    edge = next
  }
  return seen
}

// ============================================================================ what is not here

/**
 * WHAT THIS FILE DELIBERATELY DOES NOT DO, so that the next reader does not add it.
 *
 * - **It does not act.** It records no wake, sends no message, moves no work state and starts
 *   nothing. It imports nothing from `src/server/lib/wake.ts`.
 * - **It has no timer and no schedule.** Nothing here runs unless somebody asks it a question. A
 *   poller that ran it on a clock would be the thing the owner's section 19 refuses in its first
 *   sentence, and it would live outside `src/` anyway.
 * - **It reads no presence and no heartbeat.** An agent being online is not progress and being
 *   offline is not being stuck. Section 19: *progress means semantic progress*.
 * - **It never defaults an unanswerable condition.** A condition with no reader answers *cannot be
 *   evaluated*, which stops the agent being a candidate. That is the safe direction and it is also
 *   the true one.
 */
