// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO A MESSAGE COULD BE FOR, RANKED FROM WHAT MOLE OFFICE ALREADY HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * You point at something in Mole Office — a report, a plan line, a block on the week — and say you want
 * to talk to an agent about it. This file answers: which agents could you mean, and why each one.
 *
 * The aim: PanelX already knows how agent runs and sessions relate to modules, pipelines, problems,
 * ideas, reports and other project objects, and a person's message should go to the most relevant agent that
 * this durable context names, rather than every exchange starting a new agent. The recipient is never
 * guessed silently: the reading is shown, and it is easy to override.
 *
 * ---------------------------------------------------------------------------------------
 * A RECIPIENT IS A SESSION RECORD. THAT IS THE WHOLE MODEL
 * ---------------------------------------------------------------------------------------
 *
 * A session IS an agent run in this product. It is already filed under the work it belongs to, and
 * every change it made already names it. So nothing new is stored to make routing work: this file
 * is a READ over evidence Mole Office has held all along, and it adds no model of its own.
 *
 * Two limits follow from that, and both are worth saying out loud.
 *
 *   A run nobody filed cannot be addressed. There are runs on this machine that were discovered in
 *   an agent tool's log directory and never filed as records. They carry no id anything can point
 *   at and no evidence in the change log, so they are not candidates. `POST /api/sessions/discover`
 *   files them; until somebody does, they are absent rather than hidden.
 *
 *   A session belongs to one project. Every reading here is one project's — its records, its links
 *   and its change log — so a candidate is always in the project the thing you pointed at is in,
 *   and every candidate says which project that is.
 *
 * ---------------------------------------------------------------------------------------
 * THE HONESTY HAZARD, WHICH IS THE POINT OF THE WHOLE FILE
 * ---------------------------------------------------------------------------------------
 *
 * Addressing "the agent working on X" must never quietly become "a new agent that has never heard
 * of X". A Claude Code run can only really be picked up where its transcript is, and
 * `adapters/claude-code.ts` builds the resume command from that file. So every candidate carries
 * `pickUp`: whether it can be picked up again, and when it cannot, why not, in a sentence. That
 * answer is on the reply BEFORE anybody presses Send, and `WHEN_IT_CANNOT_BE_PICKED_UP` says the
 * two honest choices — start a new agent and hand it this context, or stop. Never substitute.
 *
 * `pickUp` has three answers and not two. "The transcript is not on this machine" and "the
 * transcript could not be read" are opposite findings, and collapsing them into "no" would be the
 * guess the fifth rule forbids.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND HAZARD: A TIE DECIDED BY COMPARING TWO IDS
 * ---------------------------------------------------------------------------------------
 *
 * Two runs can be on the same rung, with the same amount of evidence behind it, last seen in the
 * same second. Mole Office holds nothing finer than a second, so this is common rather than exotic. The
 * list still has to come back in SOME order, and the order it comes back in is the two ids compared
 * as strings — which says nothing about either run. A screen showing the first of them as the
 * suggested recipient would be showing a coin toss as an answer.
 *
 * So a tie is stated rather than hidden. `tiedWith` on a candidate names the other runs it is level
 * with, and `cutRecent` lengthens the list of unranked runs rather
 * than cutting between two runs nothing can tell apart. This is the fifth rule on the ranking: the
 * honest answer to "which of these two" is "Mole Office cannot tell, and here are both".
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT READS, AND WHAT IT COSTS
 * ---------------------------------------------------------------------------------------
 *
 * One `readSessionEvidence` for the project, one list of its session records, one read of the
 * change rows on the record you pointed at, one read of that record's links, and one `statSync`
 * per session record. Measured on the live corpus (225 records, 914 change rows and 31 session
 * records in the `panelx` project, 18 August 2026): 11–17 ms for the database half. `read.tookMs`
 * on every reply is the real measurement for the request that produced it, so a claim in this
 * comment can be checked against the answer.
 *
 * NOTHING IS CACHED, on purpose. A cache would go stale exactly where it matters — a run that has
 * just written to the record you are commenting on is the strongest candidate there is, and a
 * cached answer would not know about it. Saying what it costs is the honest alternative.
 *
 * IT DOES NOT SWEEP THE MACHINE. `sweepSessions` observes every transcript on disk, costs 60 ms on
 * this corpus, and answers a question this file is not asking: is this run alive right now. What is
 * given up by not calling it is said rather than papered over — `recordedState` on a candidate is
 * what the record HOLDS, labelled as that, with the endpoint that checks the machine named beside
 * it.
 *
 * ---------------------------------------------------------------------------------------
 * AN OPEN QUESTION FOR THE OWNER: should a fixture session be on this list at all?
 * ---------------------------------------------------------------------------------------
 *
 * NOT ANSWERED HERE, AND NOT TO BE ANSWERED BY WHOEVER EDITS THIS FILE NEXT. Measured on a copy of
 * the owner's corpus on 19 August 2026: 66 of the owner's 92 session records are fixture rows, and all 56
 * runs in one of the owner's projects are. So a ranked list in that project names agents that do not
 * exist — every one of them a row the generated fixture wrote — and a message addressed to one is
 * refused when it is sent.
 *
 * Three answers are possible and each costs something. Keep listing them, marked, which is what
 * happens today: the list stays honest about the sessions page but its top entry is often not
 * anybody. List them under their own heading, which needs a fourth heading on a reply that already
 * carries two. Leave them out, which makes a run a person can see on the sessions page silently
 * missing here — and "silently" is the word that makes it the wrong default to pick quietly.
 *
 * The recommendation: keep them listed and marked until the fixture corpus is
 * retired, because the cost of the other two is paid by the reader rather than by the fixture.
 */

import { statSync } from 'node:fs'
import {
  PLACEMENT_GROUNDS,
  placementGround,
  placementOf,
  readSessionEvidence,
  type PlacementGround,
  type ProjectClaim,
  type ProjectRef,
  type SessionEvidenceRead,
} from './sessions.ts'
import { stampOf } from './stamp-of.ts'
import { theNewestUsesOf } from './newest-use.ts'
import { adapterFor } from './adapters/index.ts'
// WHETHER PICKING ONE RUN UP AGAIN IS EXPENSIVE, criterion T6. The warning, its two measured
// numbers and its two thresholds are read from the one library, not rebuilt here.
import { pickUpCostOfARun, pickUpCostThresholds, type PickUpCostThresholds } from './pick-up-cost.ts'
import type { PickUpCost } from '@shared/pick-up-cost.ts'
import {
  countChangesMatching,
  getRecord,
  listChanges,
  listRecords,
  resolveLinks,
} from './records.ts'
import { sessionsIn } from './sessions-in.ts'
import { PanelError } from './panel-error.ts'
import { getPlan } from './get-plan.ts'
import { linesOf } from '../db/lines-of.ts'
// THE ONE RANKING OF AGENTS, as item 5 of a decision says. `agentRankingFor`
// below reads the
// reasons; the order is decided in the shared module, where the review pane reads it as well.
import {
  rankAgentRecipients,
  type AgentRecipientOnTheWire,
  type AgentRecipientReason,
} from '@shared/recipient-ranking.ts'
import { participantForActor } from './participant-for-actor.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { whatStopsAMessageTo } from './messages.ts'
import { theCannotReceiveLine } from '@shared/cannot-receive.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { getWindow } from '../db/get-window.ts'
import {
  readOrigin,
  unstampedOriginNote,
  type PanelRecord,
  type RecordKind,
  type RecordOrigin,
} from '@shared/types.ts'
import {
  checkSubtraction,
  type LeftOutCounts,
  type LeftOutGroup,
  type RecipientsBucket,
} from '@shared/disclosure.ts'

// ---------------------------------------------------------------------------- what you pointed at

/**
 * The thing a message would be about.
 *
 * Three shapes, because there are three places in Mole Office a person can point at work: a record, a
 * line of a plan, and a block on the week. `design/ROUND-SEVEN.md` §C18 lists a fourth — a span of
 * text — and it is not a fourth shape here, because a span is always inside something: send the
 * record it is inside. A shape with no caller would be an abstraction built for a future, which is
 * the sixth rule.
 */
export type RecipientContext =
  | { kind: 'record'; id: string }
  | { kind: 'planLine'; planId: string; lineId: string }
  | { kind: 'scheduleBlock'; windowId: string }

/** The record a piece of context is about, once Mole Office has looked it up. */
export interface ContextRecord {
  id: string
  kind: RecordKind
  title: string
  workspaceId: string
  /** True when the record has been deleted. It still has a history and can still be talked about. */
  deleted: boolean
}

/** Why nothing is filed behind what was pointed at. A word, never a paragraph. */
export const NOTHING_FILED_CODES = ['line-not-tracked', 'record-gone'] as const
export type NothingFiledCode = (typeof NOTHING_FILED_CODES)[number]

/**
 * Why there is no record behind what was pointed at.
 *
 * `code` is what a screen draws and what a caller branches on. `detail` is the sentence behind it,
 * for a `title`, a fold or Inspect — contract 8.10's sentence-on-demand, never a paragraph on the
 * page.
 */
export interface NothingFiled {
  code: NothingFiledCode
  detail: string
}

/**
 * Runs that wrote to this record and are filed in ANOTHER project.
 *
 * They cannot be addressed from here — a session belongs to one project — and leaving them out
 * would be the more comfortable lie: the change log plainly says they wrote to it. It is a count
 * and the project ids, because both were already being said inside a sentence where nothing could
 * draw either of them on its own.
 */
export interface RunsElsewhere {
  runs: number
  /** The projects they are filed in, each named once, in the order they were met. */
  projects: string[]
}

/**
 * What Mole Office made of what you pointed at, shown back to you.
 *
 * The eighth rule: an interpretation is a claim about somebody's input, so it is always visible.
 * `record` is null when nothing is filed behind what was pointed at — a plan line that has never
 * been tracked as work is the ordinary case — and `nothingFiled` then says which case it is. That
 * is a real answer and it is not an error.
 *
 * WHAT WAS POINTED AT IS `asked` AND `record`, AND THERE IS NO SENTENCE SAYING IT AGAIN. The kind
 * and the title are on `record`; what kind of thing was asked about is on `asked`. A screen builds
 * its own short line from those two, which is what step 37 and owner finding 18 asked for.
 */
export interface ContextReading {
  asked: RecipientContext | null
  record: ContextRecord | null
  /** Why there is no record behind this. Null when there is one. */
  nothingFiled: NothingFiled | null
  /** The project every candidate below is read from. */
  workspaceId: string
  /** The project the request named, when that is a different one. Null when they agree. */
  askedForProject: string | null
  /** Runs that wrote to this record and are filed elsewhere. Null when there are none. */
  elsewhere: RunsElsewhere | null
}

// ---------------------------------------------------------------------------- the evidence ladder

// WHICH RUNTIME WORDS NAME ONE OF THE OFFICE'S OWN PROCESSES. `isAServerProcess` below asks it. The
// agent record kind takes every other word, so what the picker offers a choice can mint.
import { THE_OFFICES_OWN_PROCESS_WORDS } from '@shared/participants.ts'

// The ranking vocabulary moved to @shared/types.ts, for the reason stated there. Imported so this
// module can use it, and re-exported so every importer of this module is unaffected.
import { RECIPIENT_GROUNDS, type RecipientGround } from '@shared/types.ts'
import { sayThePickUp, type PickUpReason } from '@shared/send-plan-words.ts'
export { RECIPIENT_GROUNDS }
export type { RecipientGround }


/** Where a ground stands in that order. Lower is stronger. */
export function groundStrength(ground: RecipientGround): number {
  return RECIPIENT_GROUNDS.indexOf(ground)
}

/**
 * Which placement grounds are a STATEMENT by the run, and which are an accident of its writing.
 *
 * A statement beats an accident, and that distinction is already made in `lib/sessions.ts`: a run
 * that linked itself to a pipeline said where it belonged; a run that happened to write three
 * records did not. This file reuses that reading rather than writing a second one — every claim
 * here comes out of `placementOf`, and `placementGround` is sessions.ts's own function. What this
 * map adds is the one thing sessions.ts states in prose and not in code: which side of the line
 * each of its seven grounds falls on.
 *
 * IT IS A TOTAL MAP OF THE UNION, so a ground added to `PLACEMENT_GROUNDS` and not classified here
 * fails `tsc --noEmit` rather than being silently read as an accident. tests/recipients.test.ts
 * pins the keys against the array as well, so the two cannot come to hold different sets.
 *
 * THIS BELONGS IN sessions.ts and could not be put there: that file is owned by another agent this
 * wave. It is written up in the report that ships with this change.
 */
const IS_A_STATEMENT: Readonly<Record<PlacementGround, boolean>> = {
  'part-of-link': true,
  link: true,
  'part-of-block-link': true,
  'block-link': true,
  changed: false,
  'block-changed': false,
  through: false,
}

/** True when this placement was something the run said, rather than something its writing did. */
export function saysWhereItBelongs(ground: PlacementGround): boolean {
  return IS_A_STATEMENT[ground]
}

/** The placement grounds that are a run's own statement. Served, so it can be argued with. */
export function statementGrounds(): PlacementGround[] {
  return PLACEMENT_GROUNDS.filter((ground) => IS_A_STATEMENT[ground])
}

// ---------------------------------------------------------------------------- can it be picked up

/**
 * Whether this run can really be picked up again, and when it cannot, why not.
 *
 * THREE ANSWERS, NOT TWO. `no` means Mole Office looked and there is nothing to pick up. `unknown` means
 * Mole Office could not find out. Reporting the second as the first would be a guess, and reporting
 * either as `yes` is the failure this whole feature is most likely to produce.
 *
 * `yes` carries what a worker needs and nothing more: the runtime's name, that runtime's own id for
 * the conversation, the transcript it lives in, and the resume command the adapter built.
 *
 * IT IS ABOUT THIS MACHINE. The server checks its own filesystem. A worker on another machine over
 * Tailscale may see something different, and the sentence says so rather than letting a reader
 * assume the answer travels.
 */
export type PickUp =
  | {
      answer: 'yes'
      /** Which agent tool this is a run of, e.g. `claude-code`. */
      runtime: string
      /** That runtime's own id for the conversation. This is what a worker picks up. */
      conversationId: string
      /** The transcript on disk, on the machine this server is on. */
      transcript: string
      /** The command the adapter built to get back in, or null when the tool offers none. */
      resumeCommand: string | null
      because: string
      /**
       * What `because` says, as a code a page can say in its own language (src/shared/send-plan-words.ts). `pickUpOf`
       * always sets it; an answer built by hand, as a test builds one, may leave it out, and is then said as `because`.
       */
      reason?: PickUpReason
    }
  | { answer: 'no'; why: 'never-observed' | 'transcript-gone'; because: string; reason?: PickUpReason }
  | { answer: 'unknown'; why: 'runtime-unknown' | 'transcript-unreadable'; because: string; reason?: PickUpReason }

/**
 * The two honest choices when a run cannot be picked up, in the words every surface should use.
 *
 * Served on the reply rather than written into a screen, so the rule and the answer arrive
 * together. This is the second engineering rule, on the path most likely to break it.
 */
export const WHEN_IT_CANNOT_BE_PICKED_UP =
  'A run that cannot be picked up is still listed, and it is never quietly replaced. There are two honest ' +
  'choices and Mole Office offers both: start a new agent and hand it this context, or stop. Sending a message ' +
  'addressed to one agent to a different agent is the one thing this must never do.'

/** How the pick-up answer was arrived at, on every reply, so nobody has to infer what was checked. */
export const HOW_PICK_UP_IS_CHECKED =
  'Whether a run can be picked up is checked by looking for its transcript on the machine this server runs on. ' +
  'A run filed by hand has no transcript and cannot be picked up at all. A run whose transcript has been deleted ' +
  'cannot be picked up here, and may still exist on another machine, which is why the answer says which machine ' +
  'was looked at. When the file could not be read for any other reason the answer is "unknown" rather than "no", ' +
  'because "I could not look" and "it is not there" are different findings.'

/**
 * Whether a session record's run can be picked up, checked now.
 *
 * The discovery stamp on the record is where the transcript path, the tool and the tool's own id
 * live — see `DISCOVERY_KEY` in lib/sessions.ts. A record with no stamp was filed by hand, which is
 * a real and common state: 66 of the 87 session records in this installation are fixture rows and
 * none of them carries a stamp.
 */
export function pickUpOf(record: PanelRecord): PickUp {
  const stamp = stampOf(record)
  if (stamp === null) {
    return {
      answer: 'no',
      why: 'never-observed',
      ...saidWithItsReason({ why: 'never-observed' }),
    }
  }
  if (adapterFor(stamp.tool) === null) {
    return {
      answer: 'unknown',
      why: 'runtime-unknown',
      ...saidWithItsReason({ why: 'runtime-unknown', tool: stamp.tool }),
    }
  }
  let found
  try {
    found = statSync(stamp.logPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return {
        answer: 'no',
        why: 'transcript-gone',
        ...saidWithItsReason({ why: 'transcript-gone', path: stamp.logPath }),
      }
    }
    return {
      answer: 'unknown',
      why: 'transcript-unreadable',
      ...saidWithItsReason({ why: 'transcript-unreadable', error: err instanceof Error ? err.message : String(err) }),
    }
  }
  // SOMETHING BEING AT THE PATH IS NOT THE SAME AS A TRANSCRIPT BEING THERE. `statSync` succeeds on
  // a directory, a socket and a device, and answering `yes` for one of those would hand a worker a
  // resume command for something it cannot read. What is there is said instead of being assumed.
  if (!found.isFile()) {
    return {
      answer: 'unknown',
      why: 'transcript-unreadable',
      ...saidWithItsReason({ why: 'transcript-not-a-file', path: stamp.logPath }),
    }
  }
  return {
    answer: 'yes',
    runtime: stamp.tool,
    conversationId: stamp.externalId,
    transcript: stamp.logPath,
    resumeCommand: stamp.resumeCommand,
    ...saidWithItsReason({ why: 'yes', tool: stamp.tool }),
  }
}

/** The reason and its English sentence, from the one composer of both (src/shared/send-plan-words.ts). */
function saidWithItsReason(reason: PickUpReason): { because: string; reason: PickUpReason } {
  return { because: sayThePickUp(reason), reason }
}

// ---------------------------------------------------------------------------- one candidate

/** Where a candidate's clock came from, because a time nobody can source cannot be argued with. */
export type SeenClock =
  /** The newest row this run wrote to the change log. It was working at that moment. */
  | 'change-log'
  /** The newest use of a tool the run wrote, a row of `tool_uses` (lib/newest-use.ts). It was working at that moment. */
  | 'tool-use'
  /** `data.lastOutputAt` on the record, which somebody wrote down. */
  | 'stated'
  /** The record's own `updatedAt`, which moves when anybody edits the record. */
  | 'record-updated'

/** One agent a message could go to. */
export interface RecipientCandidate {
  /** The session record. This is the address a message is written to. */
  sessionId: string
  /** Its title, which a person may have changed. */
  title: string
  /** What the run says it is doing, or null because nothing says. */
  doing: string | null
  /** Why the run exists, in the words it was asked in, or null. */
  purpose: string | null
  /** The project this run is filed in, always, even when it is the one you are already in. */
  workspaceId: string
  /**
   * True when the session record has been deleted. It still owns its history.
   *
   * READ BY A SCREEN SINCE 19 August 2026, and until then it was not. A soft-deleted run keeps its
   * discovery stamp, so it answered "can be picked up: yes" and was drawn in the picker as an
   * ordinary agent with nothing at all to tell it apart. Choosing it stored the comment and then
   * held it at dispatch with "no run has that id any more", while this route's own "say who you
   * mean" reply said plainly that the run had been deleted — two routing surfaces, one record, two
   * answers. `WHEN_A_RUN_HAS_BEEN_DELETED` below is this route's sentence; the picker draws the
   * same fact in a few words, the way it already does for the pick-up answer.
   */
  deleted: boolean
  /**
   * Why this run is on the list, in one plain sentence.
   *
   * The strongest reason. Everything else that is true about it is in `alsoWhy`, so nothing is
   * dropped to make the list read tidily.
   */
  why: string
  /** Which rung of the ladder `why` stands on. Null in the recent list, which has no rung. */
  ground: RecipientGround | null
  /** The other reasons, weaker than `why`, strongest first. Empty when there are none. */
  alsoWhy: string[]
  /** How many separate pieces of evidence stand behind `why`. Breaks ties in the ranking. */
  support: number
  /**
   * The other runs on this reply the evidence cannot tell this one from. Empty when there are none.
   *
   * A TIE IS AN ANSWER AND IT IS SAID OUT LOUD. Two runs on the same rung, with the same amount of
   * evidence behind it, last seen in the same second are level, and the order between them is then
   * their ids in alphabetical order — which is not evidence about anything. A screen that shows the
   * first of them as the suggested recipient would be showing a choice Mole Office made by comparing two
   * random strings. So each of them names the others here, which is the whole of the fact: a screen
   * draws the tie off these rows and no second reading of it is worked out anywhere.
   *
   * A clock with second resolution is why this is not a rare case. Two runs that wrote to the same
   * record inside one second get the same `lastSeenAt`, and Mole Office holds nothing finer.
   */
  tiedWith: string[]
  /** Whether it can be picked up again, and when it cannot, why not. */
  pickUp: PickUp
  /**
   * THE WARNING THAT PICKING THIS RUN UP AGAIN IS EXPENSIVE, or null. Criterion T6.
   *
   * IT IS NOT A REFUSAL. `pickUp` above says whether the run can be resumed at all; this says the
   * run's last turn was large and it has been idle past the declared window, so the person about to
   * send is told before the message goes. The send still goes: a small fix is bad practice here,
   * not an act the product has any business forbidding.
   *
   * ABSENT ON A HAND-BUILT CANDIDATE and null on the wire are read the same by the composer, which
   * is what lets an old fixture stand. The server's own reply always carries the key.
   */
  pickUpCost?: PickUpCost | null
  /** How the record entered this corpus. Null means nobody said. */
  origin: RecordOrigin | null
  /**
   * What to say about the origin, when it needs saying. Null when the record is `authored`.
   *
   * A fixture session is not a real run, and offering one as a recipient without saying so would be
   * offering a made-up agent. It is still listed, because hiding it would leave a person wondering
   * why a run they can see on the sessions page is missing from this list.
   */
  originNote: string | null
  /**
   * The state word the RECORD holds, and when it was written. Null when the record holds none.
   *
   * NOT AN OBSERVATION. `lib/sessions.ts` re-derives a session's state on every read for a good
   * reason — a stored `running` is wrong the moment the process exits — and this file does not do
   * that derivation, because it would mean reading every transcript on the machine every time a
   * context menu opens. So what is served is what is stored, labelled as that, with the endpoint
   * that checks the machine named in `because`.
   */
  recordedState: { word: string; writtenAt: string | null; because: string } | null
  /** When Mole Office last saw this run do anything, from the database alone. */
  lastSeenAt: string
  /** Which of the three clocks that was. */
  lastSeenFrom: SeenClock
}

// ---------------------------------------------------------------------------- the answer

/**
 * Whether the agents on this reply can be picked up where they left off, as counts.
 *
 * THE ALL-OR-NOTHING CASE IS WHY `stuck` IS SERVED BESIDE `total`. "24 of them" and "all of them"
 * are different facts and a person acts differently on them, and a bare 24 with no denominator
 * beside it leaves the reader to work out which of three counts on the reply it was 24 of.
 *
 * `allSameReason` is the reason when it is the reason for every one of them. On this installation
 * that was true of all 92 session records, so the shape of the problem is a fact about the corpus
 * rather than about any run — and a reader of one candidate cannot see it.
 */
export interface PickUpTally {
  /** How many agents are on this reply at all. */
  total: number
  /** How many of them cannot be picked up where they left off. */
  stuck: number
  /** The one reason, when every stuck run gives the same one. Null otherwise. */
  allSameReason: 'never-observed' | 'transcript-gone' | 'runtime-unknown' | 'transcript-unreadable' | null
}

/**
 * What kind of rows these are: real work, made-up example, or nobody said.
 *
 * BOTH SIDES ARE COUNTED. Naming only the fixture rows leaves the reader to subtract, and on the
 * owner's corpus the subtraction is the whole answer: 56 of the 56 runs in one project are fixture
 * rows, so the ranked list there holds no agent at all. `authored: 0` is the case that matters
 * most and it is a number a screen can draw, not a sentence it has to parse.
 */
export interface OriginTally {
  /** Made-up example rows. There is no agent behind one to answer. */
  fixture: number
  /** Rows carrying no mark saying how they entered the corpus. Not the same as `fixture`. */
  unmarked: number
  /** Rows marked as a record of real work. */
  authored: number
  /** Rows whose record has been deleted. */
  deleted: number
}

/** What the reading had to look at, so a short answer can be told from a small project. */
export interface ReadingCounts {
  /** How the ranking works, in words, on every reply. */
  rule: string
  /** How the pick-up answer was arrived at. */
  pickUpRule: string
  /** Session records read in this project, deleted ones included. */
  sessions: number
  /** Pipelines and modules read. */
  projects: number
  /** Links read. */
  links: number
  /** Change rows on the record you pointed at. */
  changesOnThis: number
  /** True when there are more of those than were read, so the counts above are a floor. */
  changesOnThisCapped: boolean
  /** Change rows the placement rule read across the project. */
  changesRead: number
  /** True when the project's change log is longer than the placement rule reads. */
  changesCapped: boolean
  /** Transcripts looked for on disk, one per session record. */
  transcriptsChecked: number
  /** What this request took, in milliseconds. Measured, not estimated. */
  tookMs: number
}

/**
 * THE ONE BLOCK ON THIS REPLY WHERE A SENTENCE IS ALLOWED, and everything else is a count.
 *
 * The three rules are constants: they say how the answer was arrived at and they are the same on
 * every reply, so a reader meets them once and a screen can put them behind a press. The two
 * tallies are the facts that used to be worked out inside a paragraph, where nothing could draw
 * either half of one.
 */
export interface RecipientsReading extends ReadingCounts {
  /** What Mole Office does when a run cannot be picked up. The two honest choices, in one wording. */
  whenItCannotBePickedUp: string
  /** What writes a conversation down, so a list of refusals says what would change it. */
  conversationRule: string
  /** Whether these can be picked up, counted. */
  pickUp: PickUpTally
  /** What kind of rows these are, counted. */
  origins: OriginTally
}

/** How the ranking works, in words. Served on every reply, beside the answer it explains. */
export const RECIPIENT_RULE =
  'Mole Office ranks the agents a message could go to from what it already holds, and it never guesses. Five things ' +
  'count, strongest first: the change log says this run created the record you pointed at; the run said which ' +
  'work it was on and what you pointed at is part of that work; the change log says this run wrote to the record ' +
  'you pointed at; Mole Office filed the run under the same pipeline or module, from what it wrote rather than from ' +
  'anything it said; and it wrote to a record this one is linked to, which is the weakest and says so. A run with ' +
  'none of those is not ranked at all — it appears under a separate heading, listed only because it was active ' +
  'recently, so recency is never mistaken for relevance. Ties break on how much evidence stands behind the ' +
  'reason, then on which run was seen more recently. Two runs still level after that are TIED, and the answer says ' +
  'so: the order between them is their ids in alphabetical order and means nothing, each of them names the others ' +
  'it is tied with, and the list of unranked runs is lengthened rather than cut through the middle of a tie. ' +
  'Every candidate carries the sentence saying why it is there, ' +
  'and the top one is shown rather than applied: a recipient is only ever settled by a person pressing something. ' +
  'Only a run filed as a session record can be addressed; a run found on disk and never filed has nothing to ' +
  'point at.'

/**
 * Everything this file answers about one piece of context.
 *
 * THERE IS NO `note` AND THERE ARE NO HEADINGS. Both were finished English on the wire — owner
 * finding 18 — and every fact they carried is a field here or a count in `read`: how many are
 * connected is `connected.length`, which of them are level is `connected[0].tiedWith`, whether
 * they can be picked up is `read.pickUp`, and what kind of rows they are is `read.origins`. The
 * words a screen draws are the screen's own; the sentences behind them are in `read`.
 */
export interface RecipientsAnswer {
  context: ContextReading
  /** The ranked list. Empty is a real answer: nothing Mole Office holds connects a run to this. */
  connected: RecipientCandidate[]
  /** Runs with no connection to the context, most recently seen first. */
  recent: RecipientCandidate[]
  /** How many recent runs were left off the list. */
  recentLeftOut: number
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<RecipientsBucket>[]
  read: RecipientsReading
}

/** How many change rows on the record you pointed at are read. A record's own history is short. */
export const CONTEXT_CHANGE_ROWS = 2000

/** How many unconnected runs the ranked answer carries. The rest are counted, never hidden. */
export const RECENT_SHOWN = 8

// ---------------------------------------------------------------------------- reading the context

/** A string field of a record's `data`, or null. Trimmed, because a blank is not a value. */
function textField(record: PanelRecord, key: string): string | null {
  const value = record.data[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The date part of a stored local stamp: `2026-08-15` out of `2026-08-15 14:03:11`.
 *
 * WHY A DATE IS PRINTED AS IT IS STORED, and not as "15 August". Two reasons, and the second is the
 * one that matters. There is no writer of month names anywhere in this product — `MONTHS` in
 * shared/planning.ts is a READER, for understanding what somebody typed — so a second table of
 * month names would be a new fact in a new place. And "15 August" drops the year, which on a list
 * whose whole job is ranking by recency would let a run from last year read as one from last week.
 */
function dayOf(stamp: string): string {
  return stamp.slice(0, 10)
}

/** Read what was pointed at, or refuse saying what could not be found. */
export function readContext(context: RecipientContext | null, workspaceAsked: string): ContextReading {
  if (context === null) {
    return {
      asked: null,
      record: null,
      nothingFiled: null,
      workspaceId: workspaceAsked,
      askedForProject: null,
      elsewhere: null,
    }
  }

  const fromRecord = (record: PanelRecord): ContextReading => ({
    asked: context,
    record: {
      id: record.id,
      kind: record.kind,
      title: record.title,
      workspaceId: record.workspaceId,
      deleted: record.deletedAt !== null,
    },
    nothingFiled: null,
    workspaceId: record.workspaceId,
    // The project comes off the RECORD and never off the request. A plan is person-level and its
    // lines bind to work in any project, so the header and the record can honestly disagree — and
    // when they do, the answer says which project it actually read.
    askedForProject: record.workspaceId === workspaceAsked ? null : workspaceAsked,
    elsewhere: null,
  })

  const unfiled = (nothingFiled: NothingFiled): ContextReading => ({
    asked: context,
    record: null,
    nothingFiled,
    workspaceId: workspaceAsked,
    askedForProject: null,
    elsewhere: null,
  })

  switch (context.kind) {
    case 'record': {
      const record = getRecord(context.id)
      if (record === null) {
        throw new PanelError(
          `No record with id ${context.id}. GET /api/records lists what there is; the id on this route is the ` +
            'record you want to talk about.',
          404,
        )
      }
      return fromRecord(record)
    }
    case 'planLine': {
      const plan = getPlan(context.planId)
      if (plan === null) {
        throw new PanelError(`No plan with id ${context.planId}. GET /api/plans lists them.`, 404)
      }
      const line = linesOf(context.planId).find((l) => l.id === context.lineId)
      if (line === undefined) {
        throw new PanelError(
          `The plan “${plan.title}” has no line with id ${context.lineId}. GET /api/plans/${context.planId} lists ` +
            'its lines with their ids.',
          404,
        )
      }
      if (line.recordId === null) {
        return unfiled({
          code: 'line-not-tracked',
          detail:
            'This line is not tracked as work yet, so there is no record for a run to have touched. Nothing ' +
            'Mole Office holds can connect an agent to it.',
        })
      }
      const record = getRecord(line.recordId)
      if (record === null) {
        return unfiled({
          code: 'record-gone',
          detail:
            `This line is bound to the record ${line.recordId}, and no record answers to that id, so there is ` +
            'nothing to read evidence about.',
        })
      }
      return fromRecord(record)
    }
    case 'scheduleBlock': {
      const block = getWindow(context.windowId)
      if (block === null) {
        throw new PanelError(
          `No scheduled block with id ${context.windowId}. A block is a stretch of days given to one piece of ` +
            'work; GET /api/planning lists the ones on a week.',
          404,
        )
      }
      const record = getRecord(block.recordId)
      if (record === null) {
        return unfiled({
          code: 'record-gone',
          detail:
            `This block is about the record ${block.recordId}, and no record answers to that id, so there is ` +
            'nothing to read evidence about.',
        })
      }
      return fromRecord(record)
    }
  }
}

// ---------------------------------------------------------------------------- building candidates

/** One reason a run is on the list, before the strongest of them is picked. */
interface Reason {
  ground: RecipientGround
  why: string
  support: number
}

/** The pipelines and modules one record reaches, so "and this step is in it" can be checked. */
export function workReachedBy(recordId: string, evidence: SessionEvidenceRead): Map<string, ProjectRef> {
  const reached = new Map<string, ProjectRef>()
  // The record IS a pipeline or a module. Talking about the pipeline itself is the commonest case
  // there is, and a rule that only read links would answer nothing for it.
  const self = evidence.projects.find((project) => project.id === recordId)
  if (self !== undefined) reached.set(self.id, self)
  // It is a block, so the work it is part of is the pipeline that holds it.
  const held = evidence.blocks.get(recordId)
  if (held !== undefined) reached.set(held.pipeline.id, held.pipeline)
  // A typed link joins it to a pipeline, a module, or a block of one.
  for (const edge of evidence.edges) {
    if (edge.otherId === recordId) reached.set(edge.project.id, edge.project)
  }
  return reached
}

/** The claims a run's placement makes, primary first. Empty when nothing places it. */
function claimsOf(sessionRecordId: string, evidence: SessionEvidenceRead): ProjectClaim[] {
  const placement = placementOf(sessionRecordId, sessionRecordId, evidence)
  return placement.kind === 'in' ? [placement.primary, ...placement.also] : []
}

/** When Mole Office last saw this run do anything, from the database alone. */
function lastSeen(record: PanelRecord, evidence: SessionEvidenceRead, usedAt: string | null): { at: string; from: SeenClock } {
  const wrote = evidence.lastWroteAt.get(record.id) ?? null
  const stated = textField(record, 'lastOutputAt')
  const clocks: { at: string; from: SeenClock }[] = [
    { at: record.updatedAt, from: 'record-updated' },
    ...(stated === null ? [] : [{ at: stated, from: 'stated' as const }]),
    ...(wrote === null ? [] : [{ at: wrote, from: 'change-log' as const }]),
    ...(usedAt === null ? [] : [{ at: usedAt, from: 'tool-use' as const }]),
  ]
  return clocks.reduce((best, next) => (next.at.localeCompare(best.at) > 0 ? next : best))
}

/**
 * What to say about a run whose record has been deleted. The one wording, for every surface.
 *
 * A deleted run is still listed, because the change log still names it and dropping it would take a
 * real reason off the list with nothing saying why. What it cannot do is receive anything: a
 * message addressed to it is stored, and then held at dispatch. So the row has to say it.
 */
export const WHEN_A_RUN_HAS_BEEN_DELETED =
  'That run has been deleted. Its history is still here and it can still be talked about, but nothing can be sent ' +
  'to it: a message addressed to it is kept, and then held when the conversation is sent.'

/** What to say about how a session record got into the corpus, when it needs saying. */
function originNoteFor(origin: RecordOrigin | null): string | null {
  if (origin === 'fixture') {
    return (
      'This session record is fixture content. It is not a real run, so there is no agent behind it to answer. ' +
      'It is listed rather than hidden, so that a run visible on the sessions page is not silently missing here.'
    )
  }
  if (origin === null) return unstampedOriginNote()
  return null
}

/** The state word the record holds, labelled as stored rather than observed. */
function recordedStateOf(record: PanelRecord): RecipientCandidate['recordedState'] {
  const word = textField(record, 'state')
  if (word === null) return null
  const stamp = stampOf(record)
  return {
    word,
    writtenAt: stamp?.at ?? null,
    because:
      'This is the word the record holds, not a check made now. A run that died an hour ago still says whatever ' +
      `was last written down. GET /api/sessions/${record.id} looks at the machine and works the state out again.`,
  }
}

/**
 * Every session record in a project, deleted ones included.
 *
 * DELETED RUNS ARE LISTED AND MARKED, rather than left out. The change log still names them, so
 * leaving them out would drop a real reason on the floor — a run that filed the very record you are
 * commenting on would simply not appear, and nothing would say why. `deleted` on the candidate is
 * how a screen tells a reader.
 */
function everySessionIn(workspaceId: string): PanelRecord[] {
  return listRecords({ workspaceId, kind: 'session', includeDeleted: true }).filter(
    (record) => !isAChildRun(record) && !isAServerProcess(record),
  )
}

/**
 * A RUN NOTHING CAN BE ADDRESSED TO, BECAUSE NO AGENT CAN STAND BEHIND IT.
 *
 * Mole Office files a session record for its own processes: one for the API server at every start, one
 * for the message worker, one for the browser app and one for the dev supervisor. Every one of
 * those is a session, so every one used to be offered in the To control as a run a comment could be
 * written to. On a copy of the owner's database the first six rows offered were all of them, and
 * the one durable agent was fifth. Problem `TXUeeKcpTVI4`.
 *
 * SO THE TEST HERE IS READ FROM THE RECORD rather than from the title. A run filed with one of the
 * runtime words the office files for its own processes (`THE_OFFICES_OWN_PROCESS_WORDS`) has no
 * agent behind it, so there is nothing a person could do with the choice and it is not offered.
 * `startedByMoleOffice` is asked as well, because it is the plainest statement that Mole Office
 * started the process itself, and the message worker carries it.
 *
 * A RUN OF A HARNESS THE OFFICE HAS NO ADAPTER FOR IS STILL OFFERED. Any harness's word is taken on
 * the agent kind, so `identityForAddressedRun` in lib/records/addressed-run.ts can copy that word
 * onto the agent it makes. Such a run used to be dropped here as if it were the office's own.
 *
 * A RUN THAT NAMES NO RUNTIME IS STILL OFFERED. Absent means nobody said, and minting works for it:
 * the runtime is left off the agent rather than guessed. Dropping those would take real runs off
 * the list to make this test simpler.
 *
 * They are dropped here rather than ranked last, for the reason `isAChildRun` is: ranking last
 * still offers it. This is the one place the candidate list is built.
 */
function isAServerProcess(record: PanelRecord): boolean {
  if (record.data['startedByMoleOffice'] === true) return true
  const runtime = record.data['runtime']
  return typeof runtime === 'string' && THE_OFFICES_OWN_PROCESS_WORDS.includes(runtime)
}

/**
 * A RUN THAT IS A PROVIDER'S OWN CHILD RUN, WHICH IS NEVER SOMETHING A MESSAGE MAY BE ADDRESSED TO.
 *
 * The owner's section 18: Mole Office observes a provider's internal subagents and does not make one an
 * independent message-pool recipient by default. A child run takes part under the attachment that
 * started it — `data.parentAttachment` names that attachment — and a message aimed at a child would
 * be a message aimed at something with no inbox, no identity that outlives the run, and nobody
 * responsible for reading it.
 *
 * **They are dropped here rather than ranked last**, because ranking last still offers it. This is
 * the one place the candidate list is built, so dropping them here means no picker, no resolver and
 * no fuzzy match can reach one.
 *
 * A child run is still readable, still on the sessions page, and still in its parent's history —
 * `childrenOf` in lib/attachments.ts is the reader. It is only not addressable.
 */
function isAChildRun(record: PanelRecord): boolean {
  const parent = record.data['parentAttachment']
  return typeof parent === 'string' && parent !== ''
}

/** The part of a candidate that has nothing to do with what you pointed at. */
type CandidateBase = Omit<RecipientCandidate, 'why' | 'ground' | 'alsoWhy' | 'support' | 'tiedWith'>

function baseCandidate(
  record: PanelRecord,
  evidence: SessionEvidenceRead,
  usedAt: string | null,
  now: Date,
  thresholds: PickUpCostThresholds,
): CandidateBase {
  const seen = lastSeen(record, evidence, usedAt)
  const origin = readOrigin(record.origin)
  return {
    sessionId: record.id,
    title: record.title,
    doing: textField(record, 'doing'),
    purpose: record.summary,
    workspaceId: record.workspaceId,
    deleted: record.deletedAt !== null,
    pickUp: pickUpOf(record),
    // THE WARNING IS COMPUTED ON THE SERVER FROM THE RECORD THE PERSON WOULD ACTUALLY ADDRESS, so
    // the composer cannot warn about one run and send to another. It is null when the run carries no
    // large last turn, or no readable receipt or idle stamp, and null is not a claim of smallness.
    pickUpCost: pickUpCostOfARun(record.data, now, thresholds),
    origin,
    originNote: originNoteFor(origin),
    recordedState: recordedStateOf(record),
    lastSeenAt: seen.at,
    lastSeenFrom: seen.from,
  }
}

/** Reasons, strongest first, then by how much stands behind them. */
function byStrength(a: Reason, b: Reason): number {
  return groundStrength(a.ground) - groundStrength(b.ground) || b.support - a.support
}

/**
 * Everything the ranking sorted on, as one string. Two candidates with the same one are level.
 *
 * DERIVED FROM THE SORT RATHER THAN RESTATED BESIDE IT: the three parts here are the three
 * comparisons in `connected.sort` below, in order, and the fourth comparison there — the id — is
 * deliberately not one of them, because that is the arbitrary part this exists to expose.
 */
function rankKey(candidate: RecipientCandidate): string {
  return `${candidate.ground ?? ''}|${candidate.support}|${candidate.lastSeenAt}`
}

/** Fill in `tiedWith` on one ranked list. Called after it is sorted, on the list as served. */
function markTies(candidates: RecipientCandidate[]): void {
  const level = new Map<string, RecipientCandidate[]>()
  for (const candidate of candidates) {
    const key = rankKey(candidate)
    const found = level.get(key)
    if (found === undefined) level.set(key, [candidate])
    else found.push(candidate)
  }
  for (const group of level.values()) {
    if (group.length < 2) continue
    for (const candidate of group) {
      candidate.tiedWith = group.filter((other) => other !== candidate).map((other) => other.sessionId)
    }
  }
}

/**
 * The unconnected runs one reply carries. `recentShown` is a FLOOR, not a ceiling.
 *
 * The list never stops in the middle of a group of runs the evidence cannot tell apart. Cutting
 * there would leave one of two identical candidates on the reply and the other in a count, with
 * nothing saying that the one you can see beat the one you cannot by having a smaller id.
 */
export function cutRecent(all: readonly RecipientCandidate[], recentShown: number): RecipientCandidate[] {
  let end = Math.min(Math.max(0, recentShown), all.length)
  while (end > 0 && end < all.length && all[end - 1]!.tiedWith.includes(all[end]!.sessionId)) end += 1
  return all.slice(0, end)
}

/** Everything one reading produced, before anything is cut down for a screen. */
interface WholeReading {
  context: ContextReading
  connected: RecipientCandidate[]
  recent: RecipientCandidate[]
  /** Every session record read, so the word matcher does not have to read them again. */
  sessions: PanelRecord[]
  evidence: SessionEvidenceRead
  read: ReadingCounts
}

/**
 * The whole reading, uncapped.
 *
 * `recipientsFor` cuts the recent list down for a screen; `resolveRecipient` needs all of them,
 * because matching words against a shortened list would refuse to find a run that is right there.
 */
function readEverything(context: RecipientContext | null, workspaceAsked: string): WholeReading {
  if (context === null && oneReading !== null) {
    const held = oneReading.get(workspaceAsked)
    if (held !== undefined) return held
    const read = readEverythingNow(null, workspaceAsked)
    oneReading.set(workspaceAsked, read)
    return read
  }
  return readEverythingNow(context, workspaceAsked)
}

/**
 * THE READING WITHOUT A CONTEXT, ONCE PER PROJECT FOR THE LENGTH OF ONE READ, or null outside one.
 *
 * GET /api/messages/comments matched each comment's own words about who it is for against a whole reading of every
 * session, so a page of comments read every session's evidence once per comment (wave 13y round 15, finding 3).
 * The read that holds it is synchronous and writes nothing, so the sessions cannot change while it is held, and it
 * is let go when the read returns.
 */
let oneReading: Map<string, WholeReading> | null = null

export function withOneReadingOfRecipients<T>(read: () => T): T {
  // A READ INSIDE A READ uses the outer one's reading; it is the same moment.
  if (oneReading !== null) return read()
  oneReading = new Map()
  try {
    return read()
  } finally {
    oneReading = null
  }
}

/**
 * HOW MANY TIMES A READING OF RECIPIENTS HAS READ THE CLOCK, since the process started. A reading judges every session
 * against now, so an answer built with one can change with nothing written. The comments read keeps an answer only
 * when this did not move while it was built (lib/comments-answer.ts).
 */
let clockReadings = 0
export function howManyRecipientReadingsReadTheClock(): number {
  return clockReadings
}

function readEverythingNow(context: RecipientContext | null, workspaceAsked: string): WholeReading {
  clockReadings += 1
  const startedAt = performance.now()
  // ONE CLOCK AND ONE READ OF THE TWO THRESHOLDS FOR THE WHOLE REPLY, criterion T6. Every candidate
  // is judged against the same window and the same token line, so two rows cannot differ because
  // one was read a moment later.
  const now = new Date()
  const pickUpThresholds = pickUpCostThresholds()
  const reading = readContext(context, workspaceAsked)
  const workspaceId = reading.workspaceId

  const evidence = readSessionEvidence(workspaceId)
  const sessions = everySessionIn(workspaceId)

  /** Every reason each run has to be on the list, by session record id. */
  const reasons = new Map<string, Reason[]>()
  const add = (sessionId: string, reason: Reason): void => {
    const found = reasons.get(sessionId)
    if (found === undefined) reasons.set(sessionId, [reason])
    else found.push(reason)
  }

  const target = reading.record
  let changesOnThis = 0
  let changesOnThisCapped = false

  if (target !== null) {
    // Rungs 1 and 3: what the change log says was done to the record you pointed at.
    const rows = listChanges({ workspaceId, recordId: target.id, limit: CONTEXT_CHANGE_ROWS })
    changesOnThis = countChangesMatching({ workspaceId, recordId: target.id })
    changesOnThisCapped = changesOnThis > rows.length
    // `sessionsIn` is the product's own resolver for the change log's session column — the same one
    // the session pages use — so "which run wrote this record" and "who a message can go to" cannot
    // come to disagree. A row whose run is filed in another project resolves to nothing here, and
    // `elsewhereIn` on it is what `reading.elsewhere` below counts.
    const wroteThis = sessionsIn(rows, workspaceId)
    const meaning = new Map(wroteThis.map((s) => [s.stored, s.recordId]))
    const elsewhere = wroteThis.filter((s) => s.elsewhereIn !== null)
    const created = new Map<string, string>()
    const changed = new Map<string, { rows: number; latest: string }>()
    for (const row of rows) {
      if (row.sessionId === null || row.sessionId === '') continue
      const id = meaning.get(row.sessionId) ?? null
      if (id === null) continue
      if (row.op === 'create') {
        created.set(id, row.at)
        continue
      }
      const seen = changed.get(id)
      // listChanges hands rows back newest first, so the first row seen for a run is its newest.
      if (seen === undefined) changed.set(id, { rows: 1, latest: row.at })
      else seen.rows += 1
    }
    for (const [id, at] of created) {
      add(id, { ground: 'filed-this-record', why: `It filed this ${target.kind} on ${dayOf(at)}.`, support: 1 })
    }
    for (const [id, seen] of changed) {
      add(id, {
        ground: 'wrote-to-this-record',
        why:
          `It changed this ${target.kind} ${seen.rows === 1 ? 'once' : `${seen.rows} times`}, most recently on ` +
          `${dayOf(seen.latest)}.`,
        support: seen.rows,
      })
    }
    if (elsewhere.length > 0) {
      // Not a candidate, and not silence either. A run filed in another project cannot be addressed
      // from here, and leaving those rows out would be the more comfortable lie.
      reading.elsewhere = {
        runs: elsewhere.length,
        projects: [...new Set(elsewhere.map((s) => s.elsewhereIn ?? ''))],
      }
    }

    // Rungs 2 and 4: where the run is filed, against where the thing you pointed at sits.
    const around = workReachedBy(target.id, evidence)
    if (around.size > 0) {
      for (const session of sessions) {
        for (const claim of claimsOf(session.id, evidence)) {
          if (!around.has(claim.project.id)) continue
          const ground = placementGround(claim.evidence)
          const where = claim.project.kind === 'pipeline' ? 'pipeline' : 'module'
          add(
            session.id,
            saysWhereItBelongs(ground)
              ? {
                  ground: 'said-it-was-on-this-work',
                  why: `This run said which work it was on, and what you pointed at is part of it. ${claim.sentence}`,
                  support: claim.support,
                }
              : {
                  ground: 'filed-under-the-same-work',
                  why:
                    `Mole Office filed this run under the same ${where}, from what it wrote rather than from anything ` +
                    `it said. ${claim.sentence}`,
                  support: claim.support,
                },
          )
        }
      }
    }

    // Rung 5: it wrote to something this record is linked to. The weakest, and it says so.
    const neighbours = new Map<string, { kind: RecordKind; title: string }>()
    for (const link of resolveLinks(target.id)) {
      if (link.other.id === target.id) continue
      neighbours.set(link.other.id, { kind: link.other.kind, title: link.other.title })
    }
    if (neighbours.size > 0) {
      for (const session of sessions) {
        // Named in title order. Which one the sentence names used to be whichever came first out of
        // the change log, so the same evidence read twice could name a different record.
        const touched = (evidence.wrote.get(session.id) ?? [])
          .filter((id) => neighbours.has(id))
          .sort((a, b) => (neighbours.get(a)?.title ?? '').localeCompare(neighbours.get(b)?.title ?? ''))
        const first = neighbours.get(touched[0] ?? '')
        if (first === undefined) continue
        add(session.id, {
          ground: 'wrote-to-something-this-is-linked-to',
          why:
            `It worked on the ${first.kind} “${first.title}”, which this ${target.kind} is linked to` +
            (touched.length === 1
              ? ''
              : `, and on ${touched.length - 1} more record${touched.length === 2 ? '' : 's'} linked to it`) +
            '. This is the weakest reason on the list: it says the two are near each other, not that this run ' +
            'touched what you pointed at.',
          support: touched.length,
        })
      }
    }
  }

  const connected: RecipientCandidate[] = []
  const recent: RecipientCandidate[] = []
  // EACH RUN'S NEWEST USE OF A TOOL, one indexed lookup per run: a use moves nothing on the run's record.
  const used = theNewestUsesOf(sessions.map((record) => record.id))
  for (const record of sessions) {
    const base = baseCandidate(record, evidence, used.get(record.id) ?? null, now, pickUpThresholds)
    const mine = (reasons.get(record.id) ?? []).sort(byStrength)
    const best = mine[0]
    if (best === undefined) {
      recent.push({
        ...base,
        why:
          (target === null
            ? 'You did not point at anything, so nothing ranks this run.'
            : 'Nothing Mole Office holds connects this run to what you pointed at.') +
          ` It is listed because it was active on ${dayOf(base.lastSeenAt)}.`,
        ground: null,
        alsoWhy: [],
        support: 0,
        tiedWith: [],
      })
      continue
    }
    connected.push({
      ...base,
      why: best.why,
      ground: best.ground,
      alsoWhy: mine.slice(1).map((reason) => reason.why),
      support: best.support,
      tiedWith: [],
    })
  }

  /** Null sorts last, though nothing in `connected` carries it. One rule, no cast. */
  const rank = (c: RecipientCandidate): number =>
    c.ground === null ? RECIPIENT_GROUNDS.length : groundStrength(c.ground)
  connected.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.support - a.support ||
      b.lastSeenAt.localeCompare(a.lastSeenAt) ||
      // Last resort, so two runs with identical evidence never swap places between two reads. It is
      // not evidence about either of them, so `markTies` says which pairs got here.
      a.sessionId.localeCompare(b.sessionId),
  )
  recent.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.sessionId.localeCompare(b.sessionId))
  markTies(connected)
  markTies(recent)

  return {
    context: reading,
    connected,
    recent,
    sessions,
    evidence,
    read: {
      rule: RECIPIENT_RULE,
      pickUpRule: HOW_PICK_UP_IS_CHECKED,
      sessions: sessions.length,
      projects: evidence.projects.length,
      links: evidence.edges.length,
      changesOnThis,
      changesOnThisCapped,
      changesRead: evidence.changesRead,
      changesCapped: evidence.changesCapped,
      transcriptsChecked: sessions.length,
      tookMs: Math.round((performance.now() - startedAt) * 10) / 10,
    },
  }
}

/**
 * What writes a conversation down. Served on every reply, in the `read` block, beside the counts.
 *
 * MEASURED ON THE OWNER'S OWN CORPUS, on a copy of it, on 19 August 2026. All 92 session records
 * carried no conversation, so `pickUpOf` answered `never-observed` for every one, and 292 of the 326
 * records in the corpus had a ranked list where not one agent could be picked up.
 *
 * A READER OF ONE LIST CANNOT SEE THAT FROM THE CANDIDATES, so the shape of it is `read.pickUp` —
 * `stuck` out of `total`, and `allSameReason` when it is one reason for all of them. That is the
 * finding. This is the rule behind it: a person looking at a whole list of refusals is entitled to
 * know whether anything can change it.
 */
export const HOW_A_CONVERSATION_GETS_WRITTEN_DOWN =
  'There are two ways the conversation a run belongs to gets written down. A sweep of this machine ' +
  '(POST /api/sessions/discover) writes it onto a record Mole Office’s own session hook filed, because the hook wrote ' +
  'down which record it filed for which conversation; and a run Mole Office itself dispatched writes down the ' +
  'conversation its answer came from. A run somebody typed in by hand and a fixture row have neither, and a sweep ' +
  'cannot repair them: nothing on this machine says which conversation they were.'

/**
 * Whether the agents on this reply can be picked up where they left off, counted.
 *
 * WHY `allSameReason` EXISTS. Each candidate already says why it cannot be picked up, so on a list
 * of thirty the reason is on the reply thirty times and the fact that it is the SAME reason every
 * time is on it nowhere. That fact is about the corpus, not about any run, and it is the one a
 * person acts on.
 */
function pickUpTally(candidates: readonly RecipientCandidate[]): PickUpTally {
  const stuck = candidates.filter((c) => c.pickUp.answer !== 'yes')
  const first = stuck[0]
  const reason = first === undefined || first.pickUp.answer === 'yes' ? null : first.pickUp.why
  const allSame =
    reason !== null && stuck.every((c) => c.pickUp.answer !== 'yes' && c.pickUp.why === reason) ? reason : null
  return { total: candidates.length, stuck: stuck.length, allSameReason: allSame }
}

/**
 * Which of these are runs somebody could answer for and which are not, counted.
 *
 * A FIXTURE ROW IS NOT AN AGENT, AND A COUNT ON THE ANSWER IS WHERE A READER MEETS THAT. Each
 * candidate already carries `originNote`, and a reply that stayed quiet would be leaning on a
 * screen drawing that field. The skill's rule is the reason: a record carrying no mark is not
 * `authored`, and reading the absence of a judgement as a judgement is the one direction that makes
 * fixture content read as real.
 *
 * BOTH SIDES ARE COUNTED, which is the change of 19 August 2026, and `authored` is the one that
 * matters most: nought of them means this list holds no agent at all.
 *
 * WHETHER A FIXTURE ROW SHOULD BE ON THIS LIST AT ALL IS NOT ANSWERED HERE, and that is deliberate.
 * It is the owner's decision. The question is written out in full at the top of this file, under
 * "AN OPEN QUESTION FOR THE OWNER". Until the owner settles it the list keeps showing fixture rows and
 * keeps saying what they are.
 */
function originTally(candidates: readonly RecipientCandidate[]): OriginTally {
  return {
    fixture: candidates.filter((c) => c.origin === 'fixture').length,
    unmarked: candidates.filter((c) => c.origin === null).length,
    authored: candidates.filter((c) => c.origin === 'authored').length,
    deleted: candidates.filter((c) => c.deleted).length,
  }
}

/**
 * The agents a message could go to, ranked, each carrying the sentence saying why.
 *
 * `context` may be null, which is a real request: "show me the agents in this project". Nothing is
 * ranked then, and the answer says so rather than putting a recency order under a heading that
 * claims relevance.
 */
export function recipientsFor(
  context: RecipientContext | null,
  workspaceAsked: string,
  recentShown: number = RECENT_SHOWN,
): RecipientsAnswer {
  const all = readEverything(context, workspaceAsked)
  const recent = cutRecent(all.recent, recentShown)
  const leftOut = all.recent.length - recent.length
  const leftOutGroups: LeftOutGroup<RecipientsBucket>[] = [{
    cause: 'budget',
    bucket: 'recent_limit',
    count: leftOut,
    ids: all.recent.slice(recent.length).map((candidate) => candidate.sessionId),
  }]
  const subtraction: LeftOutCounts = {
    candidates: all.connected.length + all.recent.length,
    carried: all.connected.length + recent.length,
    leftOut,
    shortened: 0,
  }
  checkSubtraction('recipientsFor recent', subtraction, leftOutGroups)
  const onTheReply = [...all.connected, ...recent]

  return {
    context: all.context,
    connected: all.connected,
    recent,
    recentLeftOut: subtraction.leftOut,
    subtraction,
    leftOutGroups,
    read: {
      ...all.read,
      whenItCannotBePickedUp: WHEN_IT_CANNOT_BE_PICKED_UP,
      conversationRule: HOW_A_CONVERSATION_GETS_WRITTEN_DOWN,
      pickUp: pickUpTally(onTheReply),
      origins: originTally(onTheReply),
    },
  }
}

// ---------------------------------------------------------------------------- the agents, ranked

/** The ranked agents for what was pointed at, and what was read to rank them. */
export interface AgentRankingAnswer {
  context: ContextReading
  /** Strongest first, in the order `rankAgentRecipients` gives. Empty is a real answer. */
  agents: AgentRecipientOnTheWire[]
  /**
   * Change rows written by an agent whose stamp names no registered agent, or names two. They are
   * counted, not ranked: an agent the registry cannot name cannot be written to, and choosing one of
   * two would be a guess.
   */
  stampsNotNamed: number
  /**
   * THE REVIEW'S STARTER THE ANSWER READ, or null because no review was asked about. `agentRecord` is the review's
   * `startedByAgent` as it is stored, null because the review names nobody; `agentId` is the registered agent that
   * record is mapped to, null because no agent is mapped to it. Only a starter with an `agentId` is ranked, so a
   * starter left off the ranking is said here rather than missing in silence.
   */
  startedBy: { review: string; agentRecord: string | null; agentId: string | null } | null
}

/** A review's starter as the route read it off the review, handed in so this file need not read reviews. */
export interface AReviewsStarter {
  review: string
  /** The review's `startedByAgent`: the agent RECORD that asked for it, or null because nobody did. */
  agentRecord: string | null
  /** When the review was started, as the review stores it: the time of the evidence for the rung. */
  started: string
}

/**
 * WHICH AGENTS FILED OR WROTE THE RECORD POINTED AT, RANKED BY THE ONE RANKING, as item 5 of a decision
 * says; problem Nu0y2IKdzPcw.
 *
 * It reads the same change rows the run ranking above reads (`listChanges`, `CONTEXT_CHANGE_ROWS`),
 * but by who wrote them rather than by which run: the chat and the composer address agents, not
 * runs. A `create` row is the rung `filed-this-record`; any other row is `wrote-to-this-record`,
 * which is how `readEverything` reads the same rows for runs. The order is `rankAgentRecipients` in
 * src/shared/recipient-ranking.ts and nowhere here.
 *
 * `started-this-review` IS ANSWERED HERE WHEN A REVIEW IS ASKED ABOUT: the route reads that review's
 * `startedByAgent` and hands it in as `starter`. The agent record is turned into the registered agent by
 * `agentForRecord`, the registry's own mapping, and ranked on that rung with the same function and the
 * same `cannotReceive`, so the review column reads one answer and asks nothing itself. A review with no
 * starter adds no reason, and the answer is what it would be without the review.
 *
 * A STAMP IS NAMED BY THE PRODUCT'S ONE RESOLVER, `participantForActor`. A stamp that names two
 * agents is refused there with a 409; here it is counted in `stampsNotNamed` and left off, because
 * picking one of the two would be a guess and refusing the whole ranking for one old row would take
 * away the answer for every other writer.
 *
 * EACH AGENT CARRIES `cannotReceive`, the message door's own refusal sentence or null, so a screen
 * never chooses somebody a message cannot reach, and `cannotReceiveSaid`, the facts that sentence was
 * built from, so a page can say it in its own language.
 */
export function agentRankingFor(
  context: RecipientContext | null,
  workspaceAsked: string,
  starter: AReviewsStarter | null = null,
): AgentRankingAnswer {
  const reading = readContext(context, workspaceAsked)
  const target = reading.record
  const startersAgent = starter === null || starter.agentRecord === null ? null : (agentForRecord(starter.agentRecord)?.id ?? null)
  const startedBy =
    starter === null ? null : { review: starter.review, agentRecord: starter.agentRecord, agentId: startersAgent }
  const fromTheStarter: AgentRecipientReason[] =
    starter === null || startersAgent === null
      ? []
      : [{ agentId: startersAgent, rung: 'started-this-review', support: 1, latest: starter.started }]
  const answered = (reasons: AgentRecipientReason[], stampsNotNamed: number): AgentRankingAnswer => ({
    context: reading,
    agents: rankAgentRecipients(reasons).map((ranked) => {
      // THE FACTS ONCE, AND THE ENGLISH SENTENCE BUILT FROM THEM by the message door's own builder, so the page's
      // words and the door's words come from one reading.
      const said = whatStopsAMessageTo({ kind: 'agent', id: ranked.agentId }, reading.workspaceId)
      return { ...ranked, cannotReceive: said === null ? null : theCannotReceiveLine(said, sayInEnglish), cannotReceiveSaid: said }
    }),
    stampsNotNamed,
    startedBy,
  })
  if (target === null) return answered(fromTheStarter, 0)
  const rows = listChanges({ workspaceId: reading.workspaceId, recordId: target.id, limit: CONTEXT_CHANGE_ROWS })
  const named = new Map<string, string | null>()
  const nameOf = (actorId: string): string | null => {
    if (named.has(actorId)) return named.get(actorId) ?? null
    let found: string | null = null
    try {
      const who = participantForActor({ type: 'agent', id: actorId })
      found = who !== null && who.kind === 'agent' ? who.id : null
    } catch (err) {
      // ONLY THE AMBIGUITY IS HANDLED: a stamp naming two agents. Anything else is a fault and is
      // thrown on, because this function has no honest answer to it.
      if (!(err instanceof PanelError) || err.status !== 409) throw err
    }
    named.set(actorId, found)
    return found
  }
  const filed = new Map<string, string>()
  const wrote = new Map<string, { rows: number; latest: string }>()
  let stampsNotNamed = 0
  for (const row of rows) {
    if (row.actorType !== 'agent') continue
    const agentId = nameOf(row.actorId)
    if (agentId === null) {
      stampsNotNamed += 1
      continue
    }
    if (row.op === 'create') {
      filed.set(agentId, row.at)
      continue
    }
    const seen = wrote.get(agentId)
    // listChanges hands rows back newest first, so the first row seen for an agent is its newest.
    if (seen === undefined) wrote.set(agentId, { rows: 1, latest: row.at })
    else seen.rows += 1
  }
  const reasons: AgentRecipientReason[] = [
    ...fromTheStarter,
    ...[...filed].map(([agentId, at]) => ({ agentId, rung: 'filed-this-record' as const, support: 1, latest: at })),
    ...[...wrote].map(([agentId, seen]) => ({
      agentId,
      rung: 'wrote-to-this-record' as const,
      support: seen.rows,
      latest: seen.latest,
    })),
  ]
  return answered(reasons, stampsNotNamed)
}

// ---------------------------------------------------------------------------- say who you mean

/**
 * THE WORDS THROWN AWAY BEFORE ANY MATCHING HAPPENS, AND WHY THERE IS A DECLARED LIST OF THEM.
 *
 * Type *the agent working on clamp calibration* and four of the five words match every run
 * there has ever been. A matcher that counted them would rank by noise: the run with the longest
 * title would win, because a longer title holds more common words.
 *
 * So they are stripped first, and the list is DECLARED rather than buried inside a regular
 * expression, for two reasons. A person reading a refusal has to be able to see which of their
 * words Mole Office ignored — the reply carries them, each with the reason it was dropped. And the day
 * this list is wrong, it is a list somebody can argue with.
 *
 * Three groups, because the words are dropped for three different reasons.
 */
export const STOP_WORDS: Readonly<Record<'namesAnyAgent' | 'theActOfAsking' | 'grammar', readonly string[]>> = {
  /**
   * Words that name the thing being addressed. Every candidate is an agent, so "agent"
   * distinguishes nothing.
   */
  namesAnyAgent: [
    'agent',
    'agents',
    'session',
    'sessions',
    'run',
    'runs',
    'claude',
    'assistant',
    'bot',
    'worker',
    'ai',
  ],
  /** Words for the act of asking. They describe what you are doing, not who you mean. */
  theActOfAsking: [
    'talk',
    'talking',
    'speak',
    'speaking',
    'message',
    'ask',
    'asking',
    'tell',
    'telling',
    'send',
    'sending',
    'please',
    'want',
    'need',
    'about',
    'regarding',
  ],
  /**
   * Ordinary grammar, and the vague verbs of working.
   *
   * `working`, `work` and `doing` are in here on purpose. They appear in almost every phrase of
   * this shape and in a great many session titles, so keeping them would make nearly everything
   * match nearly everything.
   */
  grammar: [
    'the', 'a', 'an', 'my', 'our', 'your', 'their', 'that', 'which', 'who', 'whom', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'am', 'on', 'in', 'at', 'to', 'of', 'for', 'with', 'and', 'or', 'it', 'its', 'this',
    'these', 'those', 'there', 'here', 'one', 'some', 'any', 'work', 'works', 'worked', 'working', 'do', 'does',
    'did', 'doing', 'currently', 'still', 'now', 'recent', 'recently', 'last', 'latest', 'i', 'me',
  ],
}

/** Why one word was dropped, on the reply, so a person can see what Mole Office ignored. */
export interface StrippedWord {
  word: string
  because: string
}

const WHY_STRIPPED: Readonly<Record<keyof typeof STOP_WORDS, string>> = {
  namesAnyAgent: 'every candidate is an agent, so this word does not tell one from another',
  theActOfAsking: 'this word says what you are doing, not who you mean',
  grammar: 'this is ordinary grammar and appears in nearly every title',
}

/** The stop list as one lookup, built from the declared groups so the two cannot disagree. */
const STOP_SET = new Map<string, keyof typeof STOP_WORDS>(
  (Object.keys(STOP_WORDS) as (keyof typeof STOP_WORDS)[]).flatMap((group) =>
    STOP_WORDS[group].map((word) => [word, group] as const),
  ),
)

/**
 * The words in a phrase, lower case.
 *
 * A word is a run of letters or digits, taken with a unicode-aware pattern rather than with `\w`,
 * because `\w` is ASCII only and this corpus holds record titles in Chinese. A language that does
 * not put spaces between words comes out as one long word, which means this path can only find such
 * a run by a phrase that appears in its stored text exactly. That is a real limit, and it is said
 * here rather than discovered.
 */
export function wordsIn(said: string): string[] {
  return [...said.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0])
}

/** What a phrase was reduced to before anything was matched. */
export interface WordsRead {
  /** What was typed, exactly. Never parsed away. */
  said: string
  /** The words matching was done with, in the order they were typed. */
  words: string[]
  /** The words thrown away first, each with the reason. */
  stripped: StrippedWord[]
  /** The whole stop list, so a refusal can be argued with rather than guessed at. */
  stopWords: typeof STOP_WORDS
}

/** Read a phrase into the words it will be matched with. Nothing is stemmed: see `matchedWords`. */
export function readWords(said: string): WordsRead {
  const words: string[] = []
  const stripped: StrippedWord[] = []
  for (const word of wordsIn(said)) {
    const group = STOP_SET.get(word)
    if (group === undefined) words.push(word)
    else stripped.push({ word, because: WHY_STRIPPED[group] })
  }
  return { said, words, stripped, stopWords: STOP_WORDS }
}

/** Which of the five things Mole Office durably holds about a run a word was found in. */
export type MatchedIn = 'title' | 'doing' | 'purpose' | 'filed-under' | 'wrote'

/** One word, found in one thing Mole Office holds about one run. */
export interface MatchedWord {
  word: string
  where: MatchedIn
  /** The stored text the word was found in, exactly. */
  text: string
  /**
   * True when the word stands on its own in that text. False when it is only inside a longer word.
   *
   * `lamp` is inside `clamp`, and a match on that is not the same finding as a match on the word
   * `lamp`. Both are kept — the containment rule is what lets a stored word carry a suffix, and what
   * lets a language written without spaces be matched at all — and the two are told apart on the
   * reply so a resolution that rests on an accident inside a longer word can be seen to.
   */
  whole: boolean
}

/**
 * Whether `word` appears in `text` on its own, rather than only inside a longer word.
 *
 * A word boundary here is the same thing `wordsIn` splits on: anything that is not a letter or a
 * digit. One rule, so a phrase cannot be split one way and matched by another.
 */
function standsAlone(text: string, word: string): boolean {
  const lower = text.toLowerCase()
  const isWordChar = (character: string | undefined): boolean =>
    character !== undefined && /[\p{L}\p{N}]/u.test(character)
  for (let from = 0; ; ) {
    const at = lower.indexOf(word, from)
    if (at === -1) return false
    if (!isWordChar(lower[at - 1]) && !isWordChar(lower[at + word.length])) return true
    from = at + 1
  }
}

/** What each place is, in words, so a reply can say where a word matched. */
export const WHERE_WORDS_ARE_MATCHED: Readonly<Record<MatchedIn, string>> = {
  title: 'the run’s title',
  doing: 'what the run says it is doing',
  purpose: 'why the run was started',
  'filed-under': 'the title of the work the run is filed under',
  wrote: 'the title of a record the run wrote to',
}

/** Everything Mole Office durably holds about one run that a phrase may be matched against. */
export function whatIsHeldAbout(
  record: PanelRecord,
  evidence: SessionEvidenceRead,
): { where: MatchedIn; text: string }[] {
  const pieces: { where: MatchedIn; text: string }[] = [{ where: 'title', text: record.title }]
  const doing = textField(record, 'doing')
  if (doing !== null) pieces.push({ where: 'doing', text: doing })
  if (record.summary !== null && record.summary.trim() !== '') {
    pieces.push({ where: 'purpose', text: record.summary })
  }
  for (const claim of claimsOf(record.id, evidence)) {
    pieces.push({ where: 'filed-under', text: claim.project.title })
  }
  for (const id of evidence.wrote.get(record.id) ?? []) {
    // Its own record is written by the sweep that filed it and by the run updating its own line.
    // That says nothing about what the run was working on, so it is not something to match against.
    if (id === record.id) continue
    const written = evidence.records.get(id)
    if (written !== undefined) pieces.push({ where: 'wrote', text: written.title })
  }
  return pieces
}

/**
 * Every place each word was found. Empty when any one of the words was found nowhere.
 *
 * A candidate has to carry EVERY word to match. Requiring all of them is what makes "more than one
 * matched" mean something: a scorer that added up partial matches would always have a top answer
 * and would therefore never refuse, which is the behaviour this rule exists to prevent.
 *
 * A word matches by being CONTAINED in the stored text, case-folded. It is one rule, it is
 * deterministic, and it covers both a stored word carrying a suffix and a language written without
 * spaces. NOTHING IS STEMMED and nothing is spell-corrected: a stemmer is an interpretation of
 * somebody's words, and this path exists precisely because interpretations must be visible. Every
 * match says which word was found in which stored text, so a match that is too generous is on the
 * reply rather than behind it.
 */
export function matchedWords(
  words: readonly string[],
  pieces: readonly { where: MatchedIn; text: string }[],
): MatchedWord[] {
  const found: MatchedWord[] = []
  for (const word of words) {
    const hits = pieces.filter((piece) => piece.text.toLowerCase().includes(word))
    if (hits.length === 0) return []
    for (const hit of hits) {
      found.push({ word, where: hit.where, text: hit.text, whole: standsAlone(hit.text, word) })
    }
  }
  return found
}

/** One run a phrase reached, and the words that reached it. */
export interface WordMatch {
  candidate: RecipientCandidate
  matched: MatchedWord[]
  /** Which words matched what, in one sentence. */
  sentence: string
}

/**
 * What "say who you mean" answered. Exactly three outcomes and no fourth.
 *
 * WHY A REFUSAL COMES BACK 200 AND NOT AS AN ERROR. Nothing was asked to be done here, and nothing
 * was written. The question was "which agent do these words mean", and "more than one, here they
 * are" is a true and complete answer to it — the caller needs that list to choose from, and an
 * error would carry a sentence instead. `recipient` is null on both refusals, so a caller reading
 * the answer instead of the outcome gets nothing rather than a guess.
 */
export type Resolution =
  | {
      outcome: 'one'
      read: WordsRead
      searched: Searched
      recipient: RecipientCandidate
      matched: MatchedWord[]
      /** Empty. Present so a caller can read the same field whatever the outcome. */
      candidates: WordMatch[]
      note: string
    }
  | {
      outcome: 'many'
      read: WordsRead
      searched: Searched
      recipient: null
      /** Every run the words reached. Naming all of them is the refusal. */
      candidates: WordMatch[]
      note: string
    }
  | {
      outcome: 'none'
      read: WordsRead
      searched: Searched
      recipient: null
      candidates: WordMatch[]
      /** Which kind of nothing: no words left to match with, or words that reached no run. */
      why: 'no-words-to-match-with' | 'nothing-matched'
      /** The honest offer, since there is nobody to send to. */
      startANewAgent: string
      note: string
    }

/**
 * WHAT THE WORDS WERE MATCHED AGAINST: how many runs, in which project.
 *
 * On every outcome, including the refusals, because "nothing matched" means something different
 * over one agent than over thirty and a reader cannot tell those apart from the word `none`.
 *
 * IT IS A COUNT AND A PROJECT ID BECAUSE BOTH WERE ALREADY BEING SAID — inside `note`, as the
 * phrase "31 agents in the project panelx", where nothing can draw either of them separately. This
 * is the same two facts, in a shape a screen can use, from the same reading. The sentence is built
 * from these; they are not built from the sentence.
 */
export interface Searched {
  /** How many runs the words were matched against. */
  agents: number
  /** The project they were read from, which is the project the thing you pointed at is in. */
  workspaceId: string
}

/**
 * How many things one sentence names before it stops naming and starts counting.
 *
 * A SENTENCE A PERSON READS HAS A LENGTH AND THE INPUT DOES NOT. Five thousand characters of words
 * produced a 45,690-character `note` before this existed — measured on 18 August 2026 — which is
 * not a sentence anybody reads. Nothing is hidden by the cut: what is left out is counted in the
 * same breath, and every one of these lists is also a field on the reply.
 */
export const NAMED_IN_A_SENTENCE = 12

/** A list for a sentence: the first few named, then how many more there are. */
function named(items: readonly string[], joiner: string = ', '): string {
  if (items.length <= NAMED_IN_A_SENTENCE) return items.join(joiner)
  const rest = items.length - NAMED_IN_A_SENTENCE
  return `${items.slice(0, NAMED_IN_A_SENTENCE).join(joiner)}, and ${rest} more`
}

/** How a match reads in one sentence: which words matched what, and which only matched part of a word. */
function matchSentence(matched: readonly MatchedWord[]): string {
  const byWord = new Map<string, MatchedWord[]>()
  for (const hit of matched) {
    const found = byWord.get(hit.word)
    if (found === undefined) byWord.set(hit.word, [hit])
    else found.push(hit)
  }
  const said = [...byWord.entries()].map(([word, hits]) => {
    const places = hits.map((hit) => `${WHERE_WORDS_ARE_MATCHED[hit.where]}, “${hit.text}”`)
    // A word found only inside longer words is a weaker finding than a word found on its own, and
    // saying "matched" for both would hide the difference behind one verb.
    const verb = hits.some((hit) => hit.whole) ? 'matched' : 'was found only inside a longer word, in'
    return `“${word}” ${verb} ${named(places, '; and ')}`
  })
  return `${named(said, '. ')}.`
}

/** The offer to make when nothing was resolved. One wording, so every refusal says the same. */
export const START_A_NEW_AGENT =
  'Nothing was resolved, so nothing has been addressed. Start a new agent and hand it this context, or say who ' +
  'you mean in different words. Mole Office will not pick one for you.'

/**
 * Words to one agent, or a refusal naming every candidate. NO LANGUAGE MODEL.
 *
 * The matching is over what Mole Office durably holds about each run: its title, what it says it is
 * doing, why it was started, the title of the work it is filed under, and the titles of the records
 * it wrote. `context` is optional and changes nothing about the matching — it is there so that a
 * resolved recipient comes back carrying its relationship to what you were pointing at, which is
 * the sentence a screen shows beside the choice.
 */
export function resolveRecipient(
  said: string,
  context: RecipientContext | null,
  workspaceAsked: string,
): Resolution {
  const read = readWords(said)
  const all = readEverything(context, workspaceAsked)
  const workspaceId = all.context.workspaceId
  const byId = new Map<string, RecipientCandidate>()
  for (const candidate of [...all.connected, ...all.recent]) byId.set(candidate.sessionId, candidate)

  const searched: Searched = { agents: byId.size, workspaceId }
  // THE SENTENCE IS BUILT FROM THE FIELD, never beside it. A count on the reply and a count in a
  // sentence worked out separately are the defect this repository keeps producing: change one and
  // the other is wrong with nothing failing.
  const searchedPhrase =
    `${searched.agents} agent${searched.agents === 1 ? '' : 's'} in the project ${searched.workspaceId}`

  if (read.words.length === 0) {
    return {
      outcome: 'none',
      read,
      searched,
      recipient: null,
      candidates: [],
      why: 'no-words-to-match-with',
      startANewAgent: START_A_NEW_AGENT,
      note:
        'Every word you wrote is one Mole Office throws away before matching, so there was nothing left to look for. ' +
        `You wrote “${said}”. Say what the work is about — the name of a pipeline, a module or a record — rather ` +
        'than what the agent is.',
    }
  }

  const matches: WordMatch[] = []
  for (const record of all.sessions) {
    const candidate = byId.get(record.id)
    if (candidate === undefined) continue
    const matched = matchedWords(read.words, whatIsHeldAbout(record, all.evidence))
    if (matched.length === 0) continue
    matches.push({ candidate, matched, sentence: matchSentence(matched) })
  }

  const only = matches[0]
  if (only === undefined) {
    return {
      outcome: 'none',
      read,
      searched,
      recipient: null,
      candidates: [],
      why: 'nothing-matched',
      startANewAgent: START_A_NEW_AGENT,
      note:
        `Nothing matched. Mole Office looked for ${named(read.words.map((w) => `“${w}”`))} in the title of every ` +
        'run, what it says it is doing, why it was started, the work it is filed under and the records it wrote, ' +
        `over ${searchedPhrase}. Every one of those words had to be found for a run to match.`,
    }
  }

  if (matches.length > 1) {
    return {
      outcome: 'many',
      read,
      searched,
      recipient: null,
      candidates: matches,
      // THE OWNER BANNED THE LAST CLAUSE OF THIS BY NAME. It used to end "Mole Office will not choose
      // between them", which says a second time what `recipient: null` and "Pick one" have already
      // said. The refusal itself is untouched: it names how many agents the words reached, names
      // every one of them, and says the two things a person can do about it.
      note:
        `Those words name ${matches.length} agents, so nothing has been addressed: ` +
        `${named(matches.map((m) => `“${m.candidate.title}” (${m.candidate.sessionId})`))}. Every one of them is on ` +
        'this reply under `candidates`. Pick one, or add a word that tells them apart.',
    }
  }

  return {
    outcome: 'one',
    read,
    searched,
    recipient: only.candidate,
    matched: only.matched,
    candidates: [],
    note:
      `Those words name one agent: “${only.candidate.title}” (${only.candidate.sessionId}), out of ` +
      `${searchedPhrase}. ` +
      `${only.sentence}` +
      // WHAT IT IS COMES BEFORE WHETHER IT CAN BE RESUMED. A fixture row and a deleted record are
      // both "one agent" to the matcher and neither has anybody behind it to answer, so a note that
      // named only the pick-up problem would leave the larger one to a field on the reply.
      (only.candidate.deleted ? ` ${WHEN_A_RUN_HAS_BEEN_DELETED}` : '') +
      (only.candidate.originNote === null ? '' : ` ${only.candidate.originNote}`) +
      (only.candidate.pickUp.answer === 'yes'
        ? ''
        : ` It cannot be picked up where it left off. ${only.candidate.pickUp.because} ${WHEN_IT_CANNOT_BE_PICKED_UP}`),
  }
}
