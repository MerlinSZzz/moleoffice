// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION REGISTRY: the thing Mole Office does that a notes app cannot.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * An agent working session leaves a transcript on disk. Mole Office does not copy it in -- that would
 * be two copies that drift, and a database growing by megabytes an hour to hold text nobody
 * reads. What Mole Office keeps is the WAY BACK IN (the log path and the resume command) and the WAY
 * IT CONNECTS (a `session` record, so it links to the module it broke and the problem it found
 * like everything else does). The transcript itself is read from disk, from the end, when
 * somebody wants to watch.
 *
 * ---------------------------------------------------------------------------------------
 * STATE IS COMPUTED ON READ, NEVER TRUSTED FROM THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * This is the same rule completeness follows in shared/kinds.ts, for the same reason. A stored
 * `running` is wrong the moment the process exits, and wrong SILENTLY -- the page keeps showing
 * green for a session that died at 3 a.m., which is precisely the failure this project exists to
 * remove. So every read re-derives the state from what is observable right now, and what is in
 * `data.state` is a copy for the pages that read records directly, refreshed by `syncSessions`,
 * never the authority.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT DISCOVERY MAY WRITE, AND WHAT IT MUST NEVER TOUCH
 * ---------------------------------------------------------------------------------------
 *
 * Discovery runs repeatedly over the same sessions. If it overwrote what a person typed, it would
 * quietly undo their work every few minutes, and somebody who has watched that happen once never
 * trusts the tool again. So the split is absolute and is enforced in `syncSessions` below:
 *
 *   WRITTEN ONCE, AT CREATION, THEN NEVER AGAIN
 *     title       — the name a person or the tool gave the run, or its tool and id. Never words from
 *                   its opening request, which may be a message. A human
 *                   renames a session to something they will recognise. Their name wins.
 *     summary     — left empty at creation, for the same reason; the session's purpose is a person's
 *                   to write, and the opening request is read from the transcript on each request.
 *     workspace   — the directory cannot change for a session that has already started.
 *     links       — made by a person or by POST /api/sessions/:id/link. Discovery makes none.
 *
 *   REFRESHED EVERY SWEEP, BECAUSE THEY DESCRIBE THE WORLD RATHER THAN AN OPINION
 *     state, lastOutputAt, extra.discovered
 *
 *   WRITTEN ONLY WHERE NOBODY ELSE WROTE ONE
 *     doing       — the transcript's last line, while the record holds no doing line or holds the
 *                   one discovery wrote there itself. A doing line the agent set is its own account
 *                   of its work, and a sweep never overwrites it (problem o-P0QezZ5bM8). See
 *                   `theDoingLineDiscoveryMayWrite`.
 *
 *   NEVER TOUCHED AT ALL
 *     detail      — "how it ended, in the words the exit gave you". Claude Code writes no ending,
 *                   so this adapter has nothing true to put there and puts nothing.
 *     every other key of `extra` — a person's own notes live beside `discovered`, not under it.
 *
 * Idempotence falls out of that: a second sweep over an unchanged machine computes the same
 * values, and `patchRecord` already declines to write a patch that changes nothing, down to
 * leaving `updatedAt` alone. Running discovery in a loop does not churn the change log.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THE_SESSION_NOTES_FOLDER } from '../../config/the-session-note.mjs'
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm'
import { localStamp } from '@shared/time.ts'
import {
  ADAPTERS,
  adapterFor,
  defaultEnv,
  type AdapterEnv,
  type ObservedSession,
  type ObservedSessionState,
  type SessionAdapter,
  type TailLine,
  type UnreadablePlace,
} from './adapters/index.ts'
import { OBSERVED_SESSION_STATES, storableState } from './adapters/types.ts'
import { isUnreadable, readLastLines } from './adapters/logfile.ts'
import {
  bindSessionName,
  createLink,
  createRecordWithReport,
  getRecord,
  inTheListedOrder,
  linkByTitle,
  listChanges,
  listRecords,
  listRecordNamesWithDataAs,
  listRecordsWithDataAs,
  onlyTheseFieldsOf,
  patchRecord,
  sessionFilterValues,
  storedSessionRefs,
  theRecordIdsOfSessionRefs,
  whoWroteWhereNewestFirst,
  ACROSS_WORKSPACES,
  THE_HONOUR_KEY,
  type Actor,
  type ARecordByName,
  type SessionRef,
} from './records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { recordsByTitle } from './records-by-title.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { PanelError } from './panel-error.ts'
import { theRecordedProcessIsGone, theRecordedProcessOf } from '../../config/own-rows.mjs'
import { whetherTheRecordedProcessRuns } from '../../config/session-process.mjs'
import { theRowIsOneOfTheOfficesOwn } from '@shared/offices-own-rows.ts'
import { theRowNamesAnotherMachine } from './machines.ts'
import { osProbe, theLedgerReadThisStart } from './resources.ts'
import { toChanges } from './http.ts'
import { theNewestUsesOf } from './newest-use.ts'
import { theMessagesHiddenFrom, type AMessageReader } from './messages.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { resolveProject } from './onboarding.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { moleOffice, isAgentRuntime } from '@shared/participants.ts'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { apiCalls, changes as theChangeLog, links as theLinkTable, records, theKindOfARowFoundById } from '../db/schema.ts'
import { blockIdsOf } from '@shared/blocks.ts'
import { FLOW_RUN_KIND } from '@shared/flow-run.ts'
import { NO_ADAPTED_TOOL } from '@shared/words.ts'
import { checkSubtraction, type LeftOutCounts, type LeftOutGroup, type SessionWorkBucket } from '@shared/disclosure.ts'
import {
  LINK_TYPES,
  SESSION_STATES,
  type Change,
  type LinkType,
  type PanelRecord,
  type RecordKind,
  type SessionState,
  type RecordOrigin,
} from '@shared/types.ts'
import { DISCOVERY_KEY, FILED_IN_A_CALLERS_NAME, discoveryBagOf, discoveryFiledItInACallersName, holdsADiscoveryStamp } from '@shared/discovery-stamp.ts'
import { stampOf } from './stamp-of.ts'

// ---------------------------------------------------------------------------- stored shape

export { DISCOVERY_KEY }

/** THE OFFICE, AS THE ONE THAT SAW A RUN END: the writer of an end a sweep observes (see `syncSessions`). */
function theOfficeObserving(): Actor { return { type: 'system', id: moleOffice().id } }
/** What discovery stamps onto a session record. Replaced whole on every sweep. */
export interface DiscoveryStamp {
  tool: string
  externalId: string
  logPath: string
  resumeCommand: string | null
  startedAt: string | null
  entryPoint: string | null
  /**
   * The state as an observer saw it, in the observer's own vocabulary.
   *
   * TODAY THIS IS THE SAME WORD AS `data.state`, AND THAT IS A CHANGE. This comment used to say
   * `data.state` accepted four words while observation reached six, so `orphaned` and `unknown`
   * were left out of the record and only survived here. Both are storable now -- see
   * `storableState` in adapters/types.ts, whose own docstring says it never returns null any
   * more -- so `syncSessions` writes the honest word onto the record like any other observation
   * and `stateNotStorable` counts zero.
   *
   * It is still recorded separately, and not because of the old gap. `data.state` is a copy a
   * person may edit and a page reads directly; this is what the sweep actually saw, beside the
   * `stateReason` sentence saying how it saw it. If an adapter is ever added that can report a
   * state a record may not hold, this is where it lands and the record's key is left out.
   */
  observedState: ObservedSessionState | null
  /** The sentence saying what was observed to reach that state. Null when nothing was observed. */
  stateReason: string | null
  /** Files the session worked on, as far as the bounded read could see. Empty when nobody looked. */
  filesTouched: string[]
  /** False when only the end of the log was read, so `filesTouched` is a tail rather than a list. */
  filesComplete: boolean
  /** When this stamp was written, local time. Null when whoever wrote it recorded no time. */
  at: string | null
}

/**
 * THE KEY IN THE STAMP THAT HOLDS THE DOING LINE DISCOVERY LAST WROTE ONTO THE RECORD.
 *
 * Only `ensureSessionRecord` and `syncSessions` write it, and only when they write `data.doing`. A
 * later sweep compares the record's doing line with it: the same words mean the line is discovery's
 * own and may be refreshed; other words mean somebody else set it, and it is left alone.
 */
const DOING_DISCOVERY_WROTE = 'doingItWrote'

export { discoveryFiledItInACallersName, holdsADiscoveryStamp }

/**
 * WHAT A SWEEP WRITES INTO `data.doing`, OR NOTHING (problem o-P0QezZ5bM8).
 *
 * The sweep used to write the transcript's last line into `data.doing` on every pass, so a doing line
 * an agent had set for itself was replaced by whatever it last said. Now discovery writes one only
 * where the record holds none, or where the one it holds is the line discovery wrote there itself,
 * which the stamp remembers under `DOING_DISCOVERY_WROTE`.
 *
 * A record discovered before the stamp remembered anything has no such key. Its doing line is then
 * not known to be discovery's, so it is left as it is. The transcript's last line is still read on
 * each request by GET /api/sessions, for the readers who may read the transcript.
 *
 * Returns `write: false` when the doing line is somebody else's. Otherwise `line` is what goes into
 * `data.doing`, and null there deletes discovery's old line when the transcript no longer says anything.
 */
function theDoingLineDiscoveryMayWrite(
  record: PanelRecord | null,
  reading: string | null,
): { write: false } | { write: true; line: string | null } {
  if (record === null) return { write: true, line: reading }
  const stored = stringField(record, 'doing')
  if (stored === null) return { write: true, line: reading }
  const wrote = discoveryBagOf(record)?.[DOING_DISCOVERY_WROTE]
  if (typeof wrote === 'string' && wrote === stored) return { write: true, line: reading }
  return { write: false }
}

export { stampOf } from './stamp-of.ts'

/**
 * WHAT THE OFFICE CAN SEE OF THE PROCESS A HAND-FILED RUNNING RUN NAMES (decided for wave 13y round 30).
 *
 * A run filed with no log says it is running on its writer's word alone. It stays in the running list, and this
 * reading says what the office could see of its process:
 *
 *   · `running` — its process runs, and began at the time that was recorded;
 *   · `none` — no process was recorded, the recorded one has ended, or the row names another computer, whose
 *     processes this computer cannot see;
 *   · `not-its-own` — something runs under the recorded number, and the office cannot show it is the run's own.
 *
 * `says` is the reader's own sentence, and names the pid.
 */
export interface ItsProcess {
  seen: 'running' | 'none' | 'not-its-own'
  says: string
}

/**
 * Read the process a hand-filed running run names, with the sentence its state reason adds.
 *
 * TWO READERS, EACH WHERE IT IS TRUE, as decided for wave 13y round 30. The office's own rows record their node
 * process, so they are read by `theRecordedProcessIsGone`, which checks the start time and not the program. Every
 * other row is read by `whetherTheRecordedProcessRuns`, which asks for the claude program as well. An own row that
 * recorded no start time is not called running: that reader calls its process alive, and nothing shows it is the one
 * the row began with.
 *
 * THE SENTENCE NAMES NO PID, so the rows that saw alike share one state reason, and the narrowed answer still says it
 * once. The pid is in `says`.
 */
function theProcessARunNames(record: PanelRecord): { reading: ItsProcess; sentence: string } {
  const ended = ' The office looked for its recorded process, and it is not running.'
  const seen = ' The office can see its recorded process running, and it began at the time that was recorded.'
  const notShown = ' Something runs under its recorded process number, and the office cannot show that it is this run’s process.'
  if (theRowNamesAnotherMachine(record)) {
    return {
      reading: { seen: 'none', says: 'it names another computer, so this computer cannot look for its process' },
      sentence: ' It names another computer, so this computer did not look for its process.',
    }
  }
  const recorded = theRecordedProcessOf(record)
  if (recorded.pid === null) {
    return { reading: { seen: 'none', says: 'no process was recorded for it' }, sentence: ' No process was recorded for it, so the office could not look for one.' }
  }
  const pid = String(recorded.pid)
  if (theRowIsOneOfTheOfficesOwn(record.title)) {
    const live = osProbe().processById(recorded.pid)
    if (live === null) return { reading: { seen: 'none', says: `its recorded process ${pid} is not alive` }, sentence: ended }
    if (theRecordedProcessIsGone(recorded, live) === 'gone') {
      return { reading: { seen: 'none', says: `its recorded process ${pid} has ended, and another process now has that number` }, sentence: ended }
    }
    if (recorded.pidStartedAt === null) {
      return { reading: { seen: 'not-its-own', says: `its recorded process ${pid} is running, and no start time was recorded to show it is the one` }, sentence: notShown }
    }
    return { reading: { seen: 'running', says: `its recorded process ${pid} is running, and began at the time that was recorded` }, sentence: seen }
  }
  const runs = whetherTheRecordedProcessRuns(recorded.pid, recorded.pidStartedAt)
  if (runs.runs === 'yes') return { reading: { seen: 'running', says: runs.says }, sentence: seen }
  if (runs.runs === 'no') return { reading: { seen: 'none', says: runs.says }, sentence: ended }
  return { reading: { seen: 'not-its-own', says: runs.says }, sentence: notShown }
}

/**
 * THE START THIS OFFICE READ FROM A RUN'S OWN PROCESS, or null. Wave 13y round 35, item 9.8 (c).
 *
 * A run's record names its process in one block, and more than one program writes that block: the server for its own
 * rows, and the session hook with a reading of its own. So the start time the block names is this office's reading only
 * when the ledger read the same start time for that process, registered against this run. A record that names no process
 * answers null, though processes are registered against it, because nothing says which of them is the run's own.
 *
 * AND NOT WHEN THE RUN'S PROCESS MARK SAYS ITS PROCESS IS NOT SHOWN TO BE ITS OWN (case (v) of item 9.8 (c), wave
 * 13y round 37). The mark is the run's `itsProcess`, worked out once by `theProcessARunNames`; a reading beside that mark would
 * say the office knows the run's start while the mark beside it says the office cannot tell the process is the run's.
 */
export function theStartThisOfficeReadOfItsProcess(record: PanelRecord, itsProcess: ItsProcess | null): string | null {
  if (itsProcess?.seen === 'not-its-own') return null
  const { pid, pidStartedAt } = theRecordedProcessOf(record)
  if (pid === null || pidStartedAt === null) return null
  return theLedgerReadThisStart({ workspaceId: record.workspaceId, sessionRecordId: record.id, pid, startedAt: pidStartedAt }) ? pidStartedAt : null
}

// ---------------------------------------------------------------------------- placing a run
/**
 * ---------------------------------------------------------------------------------------
 * WHICH PIPELINE OR MODULE A RUN IS FILED UNDER, AND HOW MOLE OFFICE IS ALLOWED TO KNOW
 * ---------------------------------------------------------------------------------------
 *
 * THIS RULE USED TO RUN ONLY IN THE BROWSER, in `placeSessions` in SessionPanel.tsx, and that was
 * the most expensive thing in the product. Seven agents recording their own work through the API
 * needed to know which project their run would be filed under; six of them found out by reading
 * that React component, and the one that did not read it has its session filed under a module it
 * never worked on. The rule decides what a page shows, so a rule no endpoint serves is a rule an
 * author cannot write against. It is here now, it is served on every session row, and
 * src/shared/attention.ts is the precedent: the product's rules are computed once, by the server,
 * and handed out with their reasons so that nothing has to re-derive them to draw them.
 *
 * FOUR SOURCES OF EVIDENCE, AND A TITLE IS NOT ONE OF THEM. A session called `calib · setting 13
 * force capture` looks like it belongs to the calibration module and Mole Office will not say so on
 * that basis, because a title is a string somebody typed and a rule that reads titles is a rule
 * that can be fooled by one. What counts is written down by the system itself:
 *
 *   1. A TYPED LINK between the session record and a pipeline or module. Somebody, or an agent,
 *      said these two things are related and said how.
 *   2. A TYPED LINK between the session record and a BLOCK — one step of one pipeline. The run is
 *      filed under the pipeline that holds that block. Blocks became records exactly so that work
 *      could attach to them, and a link to the step you are working on is the most specific
 *      statement an author can make; it used to place a run nowhere at all.
 *   3. THE CHANGE LOG. Every write carries the session it belonged to, so "this run changed the
 *      tray clamp module" is a fact about what happened rather than an opinion about a name. A write
 *      to a block counts as a write to the pipeline holding it, for the reason in 2.
 *   4. One hop further, which is still evidence and not a guess: a run that wrote to a record
 *      which is ITSELF linked to a pipeline or module. The middle record is named in the answer
 *      every time, so the chain can be argued with.
 *
 * ONE LINK WORD IS RANKED AND THE OTHER TWELVE STAY EQUAL. Among the run's OWN links — 1 and 2
 * above — a link that reads "part of" from the run's end wins, however many records point somewhere
 * else. It is the only type in the vocabulary whose whole meaning is containment, and containment is
 * the question this rule asks, so a run that states where it belongs is answering it directly and
 * everything else is circumstantial beside that.
 *
 * MEASURED, ON THIS WORKSPACE'S OWN RECORD. One run linked itself `part_of` the pipeline it was
 * working in and `relates_to` the sessions module. Both are statements, so the tie fell to support,
 * and the module had three claims — the link, plus two records the run wrote that reach it — against
 * the pipeline's one. The run's own statement of where it belonged was outvoted by a side effect of
 * its writing. That is what this rule changes and it is the whole of what it changes.
 *
 * NOTHING ELSE IS RANKED, and that restraint is deliberate rather than unfinished. `implements` is
 * arguable both ways, `derived_from` is arguable both ways, `discusses` is plainly not belonging, and
 * a belonging order for the remaining twelve would be twelve guesses published as rules. They are
 * equal to each other and a tie between them still breaks on support, exactly as before. The word on
 * a CHAINED link (4 above) is not ranked at all, whichever way it points: it says where the record in
 * the middle belongs, which is not a statement about the run.
 *
 * WHAT CANNOT BE PLACED IS SAID, NOT GUESSED. Unassigned is a real answer and the commonest one:
 * most runs on this machine were discovered in a tool's log directory and never filed as records
 * at all, so there is nothing that could carry a link or a change row. Every unplaced run says
 * which of the four reasons it is, and carries the one request that would place it.
 *
 * WHAT IS DELIBERATELY NOT USED. Every session record may carry `data.workspace` — a project
 * DIRECTORY like `greenhouse_bench` — and every module carries `data.paths` pointing inside those
 * directories. Matching the two would place many more runs and it would be wrong: six modules have
 * paths under `greenhouse_bench`, so every run in that directory would land in all six at once. A
 * directory is not a piece of work. The workspace is reported on the session row instead, with
 * `from` saying whether it was observed or only asserted, where a reader can use it without Mole Office
 * pretending it is a project relationship.
 */

/** A pipeline or a module — the thing a session is filed under. */
export interface ProjectRef {
  id: string
  kind: 'pipeline' | 'module'
  title: string
}

/** Any other record standing in the middle of a chain: the block, or the record that was written. */
export interface ViaRef {
  id: string
  kind: RecordKind
  title: string
}

/**
 * How Mole Office worked out that a run belongs to a pipeline or module. Five answers.
 *
 * The word is always the one on the LINK, taken from `LINK_TYPES` and read from the end that is not
 * the project — the session's own end for a `link` or a `block-link`, and the middle record's end for
 * a `through` — so a reader sees `produces` and `part of` rather than a phrase this file invented.
 *
 * THESE FIVE ARE NOT THE RANKING, and they were until `part_of` was given its meaning: two links can
 * both be `how: 'link'` and not be equally strong. `PLACEMENT_GROUNDS` below is the order, and
 * `placementGround` says which of its seven rungs one of these five stands on.
 */
export type PlacementEvidence =
  /** A typed link joins the session record and the pipeline or module directly. */
  | { how: 'link'; word: string }
  /** A typed link joins the session record and a block, and this pipeline holds that block. */
  | { how: 'block-link'; block: ViaRef; word: string }
  /** The change log says this run wrote to the pipeline or module record itself. */
  | { how: 'changed' }
  /** The change log says this run wrote to a block, and this pipeline holds that block. */
  | { how: 'block-changed'; block: ViaRef }
  /** The run wrote to a record, and that record is linked to the pipeline or module. */
  | { how: 'through'; via: ViaRef; word: string }

/**
 * The word that states belonging, taken from the vocabulary rather than typed out here.
 *
 * `part_of` read from the far end of the link reads "part of": the record at that end is part of the
 * one at this end. That is the run saying it belongs inside this pipeline or module, and it is the
 * one thing a link can say that answers the question this rule asks.
 *
 * THE DIRECTION IS PART OF THE MEANING, which is why this is the forward word and not the type. A
 * `part_of` link stored the other way round — from the project to the run — reads "has part" from the
 * run's end and says the PROJECT is part of the run. That is a different statement, and not one that
 * files a run anywhere, so it is not promoted. It still places the run, as any link does; it is
 * simply not the belonging claim. Mole Office ranks what was recorded, never what was probably meant.
 *
 * Derived from `LINK_TYPES` so the vocabulary and this rule cannot come to say different things, and
 * tests/sessions.test.ts pins that exactly one type in the whole table reads this word.
 */
export const BELONGING_WORD: string = LINK_TYPES.part_of.forward

/** True when a link, read from the run's own end, says the run is part of the thing at the far end. */
export function saysBelonging(word: string): boolean {
  return word === BELONGING_WORD
}

/**
 * Every ground a placement can stand on, STRONGEST FIRST. This array is the ranking — there is no
 * second table of numbers to fall out of step with it.
 *
 * THE OLD ORDER IS UNCHANGED AND STILL DOES THE HEAVY LIFTING: what somebody SAID beats what a run
 * happened to write, a direct statement beats one that travels through another record, and a link to
 * a block ranks under a link to the project itself and over any write, because it is still somebody
 * stating where the work belongs — only about a smaller thing.
 *
 * WHAT IS NEW IS ONE WORD, INSIDE THE TWO STATED-LINK TIERS. `part_of` outranks any other word at the
 * same distance, so a run that says where it belongs is not regrouped by what it happened to touch.
 * It is one word and not a ranking of the vocabulary: `relates to`, `produces`, `implements`,
 * `about`, `measures` and the rest are equal to each other here, and a tie between two of them breaks
 * on support as it always has. The word on a chained link is not read at all — see `placementGround`.
 */
export const PLACEMENT_GROUNDS = [
  'part-of-link',
  'link',
  'part-of-block-link',
  'block-link',
  'changed',
  'block-changed',
  'through',
] as const
export type PlacementGround = (typeof PLACEMENT_GROUNDS)[number]

/**
 * Which ground one piece of evidence stands on. Worked out from the evidence every time it is
 * needed, never stored beside it: a `word` and a copy of what that word means would be two facts
 * about one link with nothing making them agree.
 *
 * The chained case reads no word, on purpose. `through` evidence carries the word on the link between
 * the record the run WROTE and the project — a task that is `part_of` the tray clamp says where the
 * task belongs, and the run only touched the task. Promoting that would put somebody else's statement
 * about another record ahead of the run's own.
 */
export function placementGround(evidence: PlacementEvidence): PlacementGround {
  switch (evidence.how) {
    case 'link':
      return saysBelonging(evidence.word) ? 'part-of-link' : 'link'
    case 'block-link':
      return saysBelonging(evidence.word) ? 'part-of-block-link' : 'block-link'
    case 'changed':
      return 'changed'
    case 'block-changed':
      return 'block-changed'
    case 'through':
      return 'through'
  }
}

/** Where a piece of evidence stands in that order. Lower is stronger. */
export function placementStrength(evidence: PlacementEvidence): number {
  return PLACEMENT_GROUNDS.indexOf(placementGround(evidence))
}

/** One pipeline or module a session reaches, with the best evidence for it. */
export interface ProjectClaim {
  project: ProjectRef
  evidence: PlacementEvidence
  /** How many separate records or links connect this run to this project. Breaks ties. */
  support: number
  /** The claim in one sentence, so no surface has to build the wording a second time. */
  sentence: string
}

/**
 * Why a run could not be placed. Four answers, and they are four different things.
 *
 * Collapsing them would be the silent fallback this product bans: "nobody filed this run" and "this
 * run changed eleven records and none of them reaches a pipeline" are both empty results and they
 * mean opposite things — the first is a gap in the record, the second is a real finding about the
 * work.
 */
export type Unplaced =
  /** No session record exists, so there is nothing that could carry a link or a change row. */
  | { why: 'not-filed' }
  /** A record exists, and nothing is linked to it and nothing was written under it. */
  | { why: 'wrote-nothing' }
  /** It has links or touched records, and not one of them reaches a pipeline or a module. */
  | { why: 'reaches-nothing'; touched: number; linked: number }
  /** There is no pipeline and no module to be placed under, so it is not saying either way. */
  | { why: 'nothing-read' }
  /**
   * This request's own narrowing did not ask where runs are filed, so nobody looked this time.
   *
   * NOT `nothing-read`. That reason means the evidence WAS read and found no pipeline or module in
   * the workspace — a fact about the corpus. This one means the evidence was never read at all,
   * because the caller asked a question that does not need it. Conflating the two would tell a run
   * that is genuinely filed under three modules that it reaches nothing.
   */
  | { why: 'not-asked-for' }

/** Where a run is filed, and why — served on every session row. */
export type Placement =
  | { kind: 'in'; primary: ProjectClaim; also: ProjectClaim[] }
  | {
      kind: 'unassigned'
      reason: Unplaced
      /** Which of the four it is, in words. One sentence per answer, never a shrug. */
      sentence: string
      /** The request that would file it, because this is the authoring path's own answer. */
      howToPlace: string
    }

/**
 * One link with a pipeline or module at one end, already worded from the OTHER end.
 *
 * A session under `Tray clamp` wants the sentence the way round it would say it — "part of Tray clamp",
 * not "has part" — so the wording is flipped through `LINK_TYPES` rather than re-derived: the FROM
 * end of a link says the forward word, the TO end says the reverse one.
 */
export interface ProjectEdge {
  project: ProjectRef
  /** The record at the far end of the link. */
  otherId: string
  /** The relationship as the far end would say it: "part of", "produced by", "measures". */
  word: string
  /**
   * Set when the far end is linked to a BLOCK of the project rather than to the project itself.
   *
   * The block is named in the sentence, because "filed under this pipeline" and "filed under this
   * pipeline because you named one step of it" are different statements and only one of them is
   * something the author said.
   */
  block: ViaRef | null
}

/**
 * Everything one sweep reads out of the database about where runs belong and when they last wrote.
 *
 * Passed in rather than read inside the rule, so the rule itself is a pure function a test can
 * drive without a database. `lastWroteAt` is here, beside the placement's own fields, because both
 * answers come off the same rows of the change log and reading that table twice in one request to
 * keep two type names tidy would be a waste nobody could defend.
 */
export interface SessionEvidenceRead {
  /** Every live pipeline and module. */
  projects: readonly ProjectRef[]
  /** Block id → the block, and the pipeline whose `blockIds` lists it. */
  blocks: ReadonlyMap<string, { block: ViaRef; pipeline: ProjectRef }>
  /** Every link with a pipeline, a module, or a block of one at an end. */
  edges: readonly ProjectEdge[]
  /** Record id → how many links it has at either end. Says "you linked, it just did not reach". */
  linkCounts: ReadonlyMap<string, number>
  /** Session record id → the record ids that run wrote to, from the change log. */
  wrote: ReadonlyMap<string, readonly string[]>
  /**
   * Record id → what it is, so a record in the middle of a chain can be named: each pipeline and module, and each other
   * record a link, a pipeline's `blockIds` or a change row read names, as `listRecords` gives it. Only looked up by id.
   */
  records: ReadonlyMap<string, ViaRef>
  /**
   * Session record id → the stamp on the newest row that session wrote.
   *
   * Not read by the placement rule. It is the clock a run that has no log on disk is measured by,
   * which is what stops a session that is writing steadily through the API from reading as idle.
   */
  lastWroteAt: ReadonlyMap<string, string>
  /** How many change rows were read. Reported, so "no writes" can be told from "nothing read". */
  changesRead: number
  /** True when the log is longer than the ceiling, so the oldest writes were not read. */
  changesCapped: boolean
}

/** The empty reading: nothing was read, so nothing is claimed. */
export const NO_SESSION_EVIDENCE: SessionEvidenceRead = {
  projects: [],
  blocks: new Map(),
  edges: [],
  linkCounts: new Map(),
  wrote: new Map(),
  records: new Map(),
  lastWroteAt: new Map(),
  changesRead: 0,
  changesCapped: false,
}

/**
 * How many change rows the placement reads, newest first.
 *
 * A HUNDRED TIMES THE OLD CEILING, which was a thousand and was reached. The browser asked for a
 * thousand rows because that is the most GET /api/changes will serve, and this workspace's log
 * stood at 974 on the night this moved server-side: a run placed from a partial log silently
 * changes group as the log grows. Here there is no HTTP limit in the way — the rule reads the
 * table — and `changesCapped` still says when even this was not enough rather than assuming the
 * rest of the log holds nothing.
 */
export const PLACEMENT_CHANGE_ROWS = 100_000

/** A pipeline or module record, or null. Written once so the two kinds are never spelled twice. */
export function projectRefOf(record: Pick<PanelRecord, 'id' | 'kind' | 'title'>): ProjectRef | null {
  if (record.kind !== 'pipeline' && record.kind !== 'module') return null
  return { id: record.id, kind: record.kind, title: record.title }
}

const viaRefOf = (record: Pick<PanelRecord, 'id' | 'kind' | 'title'>): ViaRef => ({
  id: record.id,
  kind: record.kind,
  title: record.title,
})

/**
 * Read everything the placement rule needs out of the database, once.
 *
 * WHY IT RESOLVES THE CHANGE LOG'S SESSION COLUMN rather than matching record ids straight off the
 * rows: a row written before its session was filed still carries the run NAME, and matching only
 * ids would answer "this run wrote nothing" for a session whose whole night is in the log under
 * its own name. `resolveSessionRef` is the product's own resolver — the one `sessionWork` uses —
 * so what places a run and what the session detail page says it did cannot disagree.
 */
export function readSessionEvidence(workspaceId: string): SessionEvidenceRead {
  return theEvidenceFor(workspaceId, { every: true })
}

/** Which runs a reading of the evidence answers for: every run of the project, or the one run with this record id. */
type TheRunsPlaced = { every: true } | { only: string | null }

/** A link as the placement reads it: its two ends and its word. */
interface PlacementLink {
  fromId: string
  toId: string
  type: LinkType
}

/**
 * THE PROJECT'S LINKS AS THE PLACEMENT READS THEM, IN THE ORDER THEY WERE STORED, by their two ends and their word. With
 * `touching`, only the links with an end among those ids.
 *
 * THE ORDER IS PART OF THE ANSWER. At equal strength the claim offered first keeps its evidence (`placementOf`), so one
 * run's links must come in the order the whole project's do. Both are read in the table's own order, which is the order
 * the project's links came in when every column of them was read (`allLinks`) until wave 13y round 109.
 */
function theLinksPlacementReads(workspaceId: string, touching?: readonly string[]): PlacementLink[] {
  const inTheProject = workspaceId === ACROSS_WORKSPACES ? undefined : eq(theLinkTable.workspaceId, workspaceId)
  const columns = { n: sql<number>`${theLinkTable}.rowid`, fromId: theLinkTable.fromId, toId: theLinkTable.toId, type: theLinkTable.type }
  const asPlaced = (row: { fromId: string; toId: string; type: string }): PlacementLink => ({ fromId: row.fromId, toId: row.toId, type: row.type as LinkType })
  if (touching === undefined) return db.select(columns).from(theLinkTable).where(inTheProject).orderBy(sql`${theLinkTable}.rowid`).all().map(asPlaced)
  // IN PIECES (src/server/db/in-pieces.ts). A link with its two ends in two pieces comes back once for each, and is kept
  // once.
  const byOrder = new Map<number, { n: number; fromId: string; toId: string; type: string }>()
  const rows = readInPieces(touching, (piece) =>
    db.select(columns).from(theLinkTable).where(and(inTheProject, or(inArray(theLinkTable.fromId, piece), inArray(theLinkTable.toId, piece)))).all(),
  )
  for (const row of rows) byOrder.set(row.n, row)
  return [...byOrder.values()].sort((a, b) => a.n - b.n).map(asPlaced)
}

/**
 * THE EVIDENCE FOR EVERY RUN OF THE PROJECT, OR ONLY WHAT `placementOf` ASKS OF IT ABOUT ONE RUN.
 *
 * For one run, the pipelines, the modules, the newest rows of the change log and the meaning of each run spelled in them
 * are read as for every run. Only that run's rows are kept. The links read are the run's own and those of each record it
 * wrote that is not a pipeline, a module or a block of one, because the rule asks about no others. The records read are
 * those at the ends of these links and those the run wrote. A link from a run read every link of the project and every
 * record at either end of one: 402 ms of a link by record id, on a made-up office of the live office's sizes (wave 13y
 * round 109). A reading of one run answers for that run alone, so it is never handed out.
 */
function theEvidenceFor(workspaceId: string, runs: TheRunsPlaced): SessionEvidenceRead {
  // THE PIPELINES AND MODULES, IN `listRecords`' ORDER, by their id, kind and title, and only a pipeline's stored fields,
  // because a pipeline's `blockIds` is the one stored field this reads. The other records' fields are left in the
  // database, and so are their other columns (round 35 of wave 13n, wave 13y round 32).
  const aPipeline = eq(records.kind, 'pipeline')
  const pipelinesData = sql<string>`(CASE WHEN ${aPipeline} THEN ${records.data} ELSE '{}' END)`
  const projectRecords = listRecordNamesWithDataAs({ workspaceId, kinds: ['pipeline', 'module'] }, pipelinesData)
  const projects: ProjectRef[] = []
  const pipelines: ARecordByName[] = []
  for (const record of projectRecords) {
    const ref = projectRefOf(record)
    if (ref === null) continue
    projects.push(ref)
    if (ref.kind === 'pipeline') pipelines.push(record)
  }

  // One more than the ceiling, so "the log is longer than this" is measured rather than assumed. THE THREE COLUMNS
  // THIS USES AND NO VALUE, each row an array of them: see `whoWroteWhereNewestFirst`.
  const rows = whoWroteWhereNewestFirst(workspaceId, PLACEMENT_CHANGE_ROWS + 1)
  const changesCapped = rows.length > PLACEMENT_CHANGE_ROWS
  const read = changesCapped ? rows.slice(0, PLACEMENT_CHANGE_ROWS) : rows

  // Every distinct spelling in the session column OF THE ROWS READ, resolved once. Values, not rows:
  // the resolver costs a query or two and the log holds a hundred rows per name. Only these, because
  // only these are looked up below: every value of the log was read and resolved for it, 5,410 on an
  // office copy where the rows read held 2,783 (wave 13y round 32). The record ids among them in one
  // read, the rest by the resolver: see `theRecordIdsOfSessionRefs`.
  const values = new Set<string>()
  for (const [sessionId] of read) if (sessionId !== null && sessionId !== '') values.add(sessionId)
  const meaning = new Map<string, string>()
  for (const [stored, recordId] of theRecordIdsOfSessionRefs([...values], workspaceId)) {
    if (recordId !== null) meaning.set(stored, recordId)
  }

  const wrote = new Map<string, string[]>()
  const lastWroteAt = new Map<string, string>()
  for (const [sessionId, recordId, at] of read) {
    if (sessionId === null) continue
    const session = meaning.get(sessionId) ?? sessionId
    // ONE RUN'S EVIDENCE keeps only that run's rows.
    if ('only' in runs && session !== runs.only) continue
    // The rows come back newest first, so the first row seen for a session is its newest.
    if (!lastWroteAt.has(session)) lastWroteAt.set(session, at)
    const found = wrote.get(session)
    if (found === undefined) wrote.set(session, [recordId])
    else if (!found.includes(recordId)) found.push(recordId)
  }

  // THE LINKS: every link of the project, or the run's own links and those of each record it wrote that is not a
  // pipeline, a module or a block of one. `placementOf` asks for the links of no other record, because a write to one
  // of those places the run without them.
  let links: PlacementLink[]
  if ('only' in runs) {
    const placesOfTheirOwn = new Set(projects.map((project) => project.id))
    for (const pipeline of pipelines) for (const id of blockIdsOf(pipeline)) placesOfTheirOwn.add(id)
    const own = runs.only === null ? [] : [runs.only, ...(wrote.get(runs.only) ?? []).filter((id) => !placesOfTheirOwn.has(id))]
    links = theLinksPlacementReads(workspaceId, own)
  } else {
    links = theLinksPlacementReads(workspaceId)
  }

  // THE OTHER RECORDS IT LOOKS UP, BY THEIR IDS: each end of a link, each block a pipeline lists, and each record a
  // change row read names. Each is read as `listRecords` gives it, under the same condition, so a record it would not
  // give is still not found. Every record the project lists was read to look these up: on the made-up office at the
  // scale of 22 October 2026, 102 ms of each unnarrowed list of sessions, 92 of them the project's view of the message
  // centre, tested message by message, and 89 ms for a project that holds nothing (wave 13y round 103).
  const wanted = new Set<string>()
  for (const link of links) {
    wanted.add(link.fromId)
    wanted.add(link.toId)
  }
  if ('only' in runs) {
    // FOR ONE RUN, THE RECORDS IT WROTE: of the change rows' records, `placementOf` looks up only these for it. A block is
    // looked up only at the end of a link read here or among these, so it is read with them.
    for (const id of runs.only === null ? [] : (wrote.get(runs.only) ?? [])) wanted.add(id)
  } else {
    for (const pipeline of pipelines) for (const id of blockIdsOf(pipeline)) wanted.add(id)
    for (const [, recordId] of read) wanted.add(recordId)
  }
  for (const project of projects) wanted.delete(project.id)
  const byId = new Map<string, ViaRef>()
  // A RUN'S FLOW RUN IS LINKED TO IT BY THE OFFICE, not by the run (wave 13p round 25), so its link says nothing about
  // what the run worked on and is not counted as one the run has.
  const flowRuns = new Set<string>()
  for (const record of [...projectRecords, ...listRecordNamesWithDataAs({ workspaceId, ids: [...wanted] }, pipelinesData)]) {
    if (record.kind === FLOW_RUN_KIND) flowRuns.add(record.id)
    byId.set(record.id, viaRefOf(record))
  }

  // A block's pipeline is its pipeline's `blockIds`, which is the one statement of that membership
  // in the product — there is no `pipelineId` on the block, on purpose.
  const blocks = new Map<string, { block: ViaRef; pipeline: ProjectRef }>()
  for (const pipeline of pipelines) {
    const ref = projectRefOf(pipeline)
    if (ref === null) continue
    for (const id of blockIdsOf(pipeline)) {
      const block = byId.get(id)
      if (block !== undefined) blocks.set(id, { block, pipeline: ref })
    }
  }

  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const edges: ProjectEdge[] = []
  const linkCounts = new Map<string, number>()
  const count = (id: string) => linkCounts.set(id, (linkCounts.get(id) ?? 0) + 1)
  for (const link of links) {
    if (flowRuns.has(link.fromId)) continue
    // COUNTED FROM EACH LIVE END SEPARATELY, and that is not the same test as the one below. A link
    // to a record that has since been deleted is still a link somebody made, so a run that has one
    // must not be told "nothing is linked to this record" — it has to be told that what it linked
    // reaches no pipeline, which is a different sentence and the true one.
    if (byId.has(link.fromId)) count(link.fromId)
    if (byId.has(link.toId)) count(link.toId)
    // A link into a deleted record is drawn as broken elsewhere and is not evidence of where a live
    // session belongs, so PLACEMENT needs both ends still here.
    if (!byId.has(link.fromId) || !byId.has(link.toId)) continue
    const words = LINK_TYPES[link.type]
    // Each link is read from both ends, because either end may be the project and the other end is
    // then the record that reaches it. The FROM end says the forward word, the TO end the reverse.
    for (const [nearId, otherId, word] of [
      [link.toId, link.fromId, words.forward],
      [link.fromId, link.toId, words.reverse],
    ] as const) {
      const project = projectsById.get(nearId)
      if (project !== undefined) {
        edges.push({ project, otherId, word, block: null })
        continue
      }
      const held = blocks.get(nearId)
      if (held !== undefined) edges.push({ project: held.pipeline, otherId, word, block: held.block })
    }
  }

  return {
    projects,
    blocks,
    edges,
    linkCounts,
    wrote,
    records: byId,
    lastWroteAt,
    changesRead: read.length,
    changesCapped,
  }
}

/**
 * The rule in four sentences, served beside the answer.
 *
 * It is a constant rather than a paragraph in an endpoint description because both session routes
 * hand it out, and because the thing an author most needs — what would place my run — must be
 * readable from the same reply that tells them their run is placed nowhere.
 */
export const PLACEMENT_RULE =
  'A run is filed under one pipeline or module, by what was recorded and never by what its title says. Four things ' +
  'count, strongest first: a typed link from the session record to a pipeline or module; a typed link to a block, ' +
  'which files the run under the pipeline holding that block; a write in the change log to any of those; and a write ' +
  'to a record that is itself linked to one, which is named in the answer so the chain can be argued with. One link ' +
  'word is ranked and only one: a link that reads “part of” from the run’s end is the run’s own statement that it ' +
  'belongs there, and it is taken ahead of a link that says anything else, so it cannot be outvoted by records that ' +
  'happen to point elsewhere. Every other word — “relates to”, “produces”, “implements”, “about” and the rest — is ' +
  'equal to every other, and the word on a chained link is not ranked at all, because it says where the record in ' +
  'the middle belongs rather than where the run does. The strongest evidence wins, ties break on how many separate ' +
  'links or records support the claim, and every other pipeline or module the run reaches is listed beside it under ' +
  '`also`, with its own evidence and its own support, so what pointed elsewhere is on the answer rather than behind ' +
  'it. A run nothing places is unassigned, with the reason on the row — that is an answer, not a gap.'

/** What the rule read to answer, so a short answer can be told from a small database. */
export interface PlacementReading {
  rule: string
  projects: number
  blocks: number
  links: number
  changes: number
  changesCapped: boolean
}

export function placementReading(evidence: SessionEvidenceRead): PlacementReading {
  return {
    rule: PLACEMENT_RULE,
    projects: evidence.projects.length,
    blocks: evidence.blocks.size,
    links: evidence.edges.length,
    changes: evidence.changesRead,
    changesCapped: evidence.changesCapped,
  }
}

/**
 * How the placement reads: one sentence, in the same words on every surface.
 *
 * THE LINK WORD IS QUOTED RATHER THAN SET INTO THE GRAMMAR, and that is not a style choice. The
 * thirteen link types are not one part of speech: `part of` and `produced by` are adjectival,
 * `consumes` and `blocks` are verbs. A template built round one of them breaks on the other — an
 * early draft of this printed "which is consumes the module 倒片台安全护罩" (a made-up title here), which
 * a photograph caught. Quoting the stored word says exactly what is recorded and reads correctly for all thirteen.
 *
 * ONE OF THE THIRTEEN GETS A SECOND SENTENCE, because it is the one that decides. When the quoted
 * word is `part of` the claim won on its meaning rather than on the count beside it, and a reader
 * comparing it with a claim under `also` that has three times the support has to be able to see why
 * from the answer. The rule is on the same reply as `placementRule`; this is that rule at the point
 * where it was used.
 */
export function placementSentence(claim: Omit<ProjectClaim, 'sentence'>): string {
  const where = `${claim.project.kind === 'pipeline' ? 'the pipeline' : 'the module'} “${claim.project.title}”`
  const evidence = claim.evidence
  /** Why this claim won, said where it won, for the one word that wins on its meaning. */
  const because = (word: string): string =>
    saysBelonging(word)
      ? ` That word is this run’s own statement that it belongs there, so it is taken ahead of any other link` +
        ` word and ahead of how many records point elsewhere.`
      : ''
  switch (evidence.how) {
    case 'link':
      return (
        `A link joins this run and ${where} — from this run’s end it reads “${evidence.word}”.` +
        because(evidence.word)
      )
    case 'block-link':
      return (
        `A link joins this run and the block “${evidence.block.title}” — from this run’s end it reads ` +
        `“${evidence.word}” — and ${where} holds that block, so the run is filed there.` +
        because(evidence.word)
      )
    case 'changed':
      return `The change log says this run wrote to ${where}.`
    case 'block-changed':
      return (
        `The change log says this run wrote to the block “${evidence.block.title}”, and ${where} holds that ` +
        `block, so the run is filed there.`
      )
    case 'through':
      return (
        `This run wrote to the ${evidence.via.kind} “${evidence.via.title}”, which is linked to ${where} — ` +
        `from that ${evidence.via.kind}’s end the link reads “${evidence.word}”.`
      )
  }
}

/** Why a run is unassigned, in words. One sentence per answer, never a shrug. */
export function unplacedSentence(reason: Unplaced): string {
  switch (reason.why) {
    // NOT "a change row" AND NOT "the change log". Both are the table, spoken to a person, in a
    // sentence about a process. What a reader needs is that nobody filed the run, so nothing joins
    // it to any work — and, for the second, that it was filed and still joins nothing.
    // Finding 24 of the language audit, 19 August 2026.
    case 'not-filed':
      return 'This run was found in an agent’s own log files. It was never filed in Mole Office, so nothing links it to any work.'
    case 'wrote-nothing':
      return 'This run has been filed, but nothing links it to any work and nothing it wrote says what it was for.'
    case 'reaches-nothing':
      return (
        `It has ${reason.linked} link${reason.linked === 1 ? '' : 's'} and touched ` +
        `${reason.touched} record${reason.touched === 1 ? '' : 's'}, and not one of them is a pipeline, a module, ` +
        `a block of one, or a record linked to one.`
      )
    case 'nothing-read':
      return 'There is no pipeline and no module in this workspace, so there is nothing a run could be filed under.'
    case 'not-asked-for':
      return (
        'This answer does not say where this run is filed, because the request asked for less than that. ' +
        'GET /api/sessions with no narrowing, or this run’s own page, says where it is filed.'
      )
  }
}

/**
 * The one request that would file this run, written out for whoever is holding the answer.
 *
 * It names the block case explicitly. The agent that linked its session to the block it was about
 * to work on made the most specific statement available, was answered 201, and was placed nowhere;
 * an author has to be able to read that a block IS a place to link to.
 */
export function howToPlace(sessionId: string): string {
  return (
    `Nothing files this run under a piece of work yet. POST /api/sessions/${sessionId}/link ` +
    `{"toTitle":"<the pipeline, module or block it worked on>","type":"part_of"} does it — a link to a block files ` +
    `the run under the pipeline that holds that block. GET /api/records?kind=pipeline and ?kind=module list what ` +
    `there is to name.`
  )
}

/**
 * THE EVIDENCE INDEXED FOR `placementOf`: every edge by the record at its far end, which is what both
 * the direct case and the chain case ask for, and every pipeline and module by its id.
 *
 * Worked out once for each reading and kept beside it. A sweep places every run against one reading,
 * and building these two maps again for each run was most of what placing 6,500 runs cost (round 35
 * of wave 13n). A reading is not changed after `readSessionEvidence` returns it, so the maps stay
 * true for as long as the reading is held.
 */
const INDEXED = new WeakMap<SessionEvidenceRead, { byOther: Map<string, ProjectEdge[]>; projectsById: Map<string, ProjectRef> }>()
function theEvidenceIndexed(evidence: SessionEvidenceRead): { byOther: Map<string, ProjectEdge[]>; projectsById: Map<string, ProjectRef> } {
  const held = INDEXED.get(evidence)
  if (held !== undefined) return held
  const byOther = new Map<string, ProjectEdge[]>()
  for (const edge of evidence.edges) {
    const found = byOther.get(edge.otherId)
    if (found === undefined) byOther.set(edge.otherId, [edge])
    else found.push(edge)
  }
  const indexed = { byOther, projectsById: new Map(evidence.projects.map((project) => [project.id, project])) }
  INDEXED.set(evidence, indexed)
  return indexed
}

/**
 * Where one run is filed, and why.
 *
 * ONE PRIMARY PLACE PER RUN, AND THE OTHERS NAMED. A run that touched four modules would otherwise
 * appear four times, the counts on a page would not add up, and a reader would have no way to tell
 * one row from its own copy. So the strongest claim wins and every other claim is carried beside
 * it with its own evidence — nothing is dropped, and the arithmetic still balances.
 *
 * `sessionId` is only ever used to write the request that would place it, never as evidence.
 */
export function placementOf(
  sessionId: string,
  recordId: string | null,
  evidence: SessionEvidenceRead | null,
): Placement {
  const unassigned = (reason: Unplaced): Placement => ({
    kind: 'unassigned',
    reason,
    sentence: unplacedSentence(reason),
    howToPlace: howToPlace(sessionId),
  })

  // THIS REQUEST NEVER READ THE EVIDENCE, because its narrowing did not ask where runs are filed.
  // `howToPlace` is left blank rather than telling somebody to file a run that may already be filed
  // under three modules — we did not check, so we do not suggest.
  if (evidence === null) {
    return { kind: 'unassigned', reason: { why: 'not-asked-for' }, sentence: unplacedSentence({ why: 'not-asked-for' }), howToPlace: '' }
  }

  if (recordId === null) return unassigned({ why: 'not-filed' })
  if (evidence.projects.length === 0) return unassigned({ why: 'nothing-read' })

  const { byOther, projectsById } = theEvidenceIndexed(evidence)

  /** Best claim per project. A stronger `how` replaces a weaker one; support always adds up. */
  const claims = new Map<string, Omit<ProjectClaim, 'sentence'>>()
  const offer = (project: ProjectRef, next: PlacementEvidence): void => {
    const found = claims.get(project.id)
    if (found === undefined) {
      claims.set(project.id, { project, evidence: next, support: 1 })
      return
    }
    found.support += 1
    if (placementStrength(next) < placementStrength(found.evidence)) found.evidence = next
  }

  // 1 and 2. A typed link from the session record to a pipeline, a module, or a block of one.
  for (const edge of byOther.get(recordId) ?? []) {
    offer(
      edge.project,
      edge.block === null
        ? { how: 'link', word: edge.word }
        : { how: 'block-link', block: edge.block, word: edge.word },
    )
  }

  const written = evidence.wrote.get(recordId) ?? []
  // A run's own session record is written by the sweep that filed it, and by the run itself when it
  // updates its own line. That says nothing about what the run was working ON, so it is not counted
  // as a record the run touched.
  const touched = written.filter((id) => id !== recordId)
  for (const id of touched) {
    // 3. The run wrote to the pipeline or module itself, or to one of its blocks.
    const project = projectsById.get(id)
    if (project !== undefined) {
      offer(project, { how: 'changed' })
      continue
    }
    const held = evidence.blocks.get(id)
    if (held !== undefined) {
      offer(held.pipeline, { how: 'block-changed', block: held.block })
      continue
    }
    // 4. The run wrote to a record that is linked to one.
    const via = evidence.records.get(id)
    if (via === undefined) continue
    for (const edge of byOther.get(id) ?? []) offer(edge.project, { how: 'through', via, word: edge.word })
  }

  if (claims.size === 0) {
    const linked = evidence.linkCounts.get(recordId) ?? 0
    return unassigned(
      touched.length === 0 && linked === 0
        ? { why: 'wrote-nothing' }
        : { why: 'reaches-nothing', touched: touched.length, linked },
    )
  }

  const ranked = [...claims.values()]
    .sort(
      (a, b) =>
        placementStrength(a.evidence) - placementStrength(b.evidence) ||
        b.support - a.support ||
        // Last resort so two runs with identical evidence never swap places between reads.
        (a.project.title < b.project.title ? -1 : 1),
    )
    .map((claim): ProjectClaim => ({ ...claim, sentence: placementSentence(claim) }))

  return { kind: 'in', primary: ranked[0]!, also: ranked.slice(1) }
}

/**
 * Where one session record is filed, reading the evidence fresh.
 *
 * For callers holding one session rather than sweeping all of them — the link route, which has to
 * say what the link it just made did, and any write path that wants to tell an author where the
 * record it just filed landed.
 *
 * ONLY WHAT PLACES THIS RUN IS READ (`theEvidenceFor`), and the answer is the one the reading of every run gives
 * (tests/a-link-reads-where-only-its-own-run-stands.test.ts).
 */
export function sessionPlacement(
  sessionId: string,
  recordId: string | null,
  workspaceId: string,
): Placement {
  return placementOf(sessionId, recordId, theEvidenceFor(workspaceId, { only: recordId }))
}

// ---------------------------------------------------------------------------- the view

/**
 * One session as the API hands it over: what was observed, plus how Mole Office has it filed.
 *
 * A session can be discovered and not recorded (found on disk, never filed), recorded and not
 * discovered (filed, but its log has gone, or it was written by hand), or both. All three are
 * real and all three appear in the list -- dropping either of the first two is the kind of
 * quiet omission this project exists to stop.
 */
export interface SessionView extends ObservedSession {
  /** True when an adapter found this session on disk during this request. */
  discovered: boolean
  /** The `session` record, when one exists. Null means nothing is filed yet. */
  recordId: string | null
  /** The record's title, which a person may have changed. Null when there is no record. */
  title: string | null
  /**
   * How the SESSION RECORD entered the corpus — `fixture`, `authored`, or null.
   *
   * NULL MEANS TWO DIFFERENT THINGS HERE AND `recordId` IS WHAT TELLS THEM APART. Read `recordId`
   * first: when it is null there is no record at all, so there is nothing that could have been
   * stamped and this is not a record whose provenance nobody recorded. When `recordId` is set and
   * this is null, somebody filed a session and nobody said how it got here.
   *
   * That distinction is why this is not simply `RecordOrigin | null` with a shrug. 35 of 58 rows in
   * `panelx` and 35 of 91 in another project are runs found on disk that nobody filed, and reporting
   * "nobody stamped a record" about a run that HAS no record is precisely the guess rule 5 forbids.
   * A surface drawing this must check `recordId` before it draws anything.
   */
  origin: RecordOrigin | null
  /** The record's summary: the session's purpose, as a human may have rewritten it. */
  recordedPurpose: string | null
  /**
   * THIS REQUEST'S OBSERVATION, in the vocabulary a record may store. Null when it has no word there.
   *
   * IT NEVER READS A RECORD, and the old name said it did. This was `storedState` until
   * design/invariants/provenance.md §5 measured what that name promised against what the field
   * holds: a run found on disk and never filed answered
   * `{"recordId": null, "title": null, "recordedPurpose": null, "storedState": "orphaned"}` — every
   * other record-derived field on the row correctly null, and the one that answered answering with
   * something nothing stored. A field named like something a person wrote must not carry something
   * the server observed.
   *
   * The value is unchanged: `storableState(observed.state)`, which is `state` above put through the
   * record's vocabulary. What a record actually holds is `data.state`, which nothing on this row
   * reports; `title` and `recordedPurpose` beside it are the record-derived fields, and they are
   * null when there is no record.
   */
  storableObservedState: SessionState | null
  /**
   * Which pipeline or module this run is filed under, and why. Never null: unassigned is an answer.
   *
   * Served rather than left to each surface to work out. The rule is the product's, like the
   * attention rule, and until this pass it ran only in the browser — so an agent writing through
   * the API could not find out where its own work would appear without reading a React component.
   */
  placement: Placement
  /**
   * Which project directory the run was in, and whether that was observed or only asserted.
   *
   * `data.workspace` is a field the kind spec asks every session for and, until this pass, nothing
   * read: eight sessions filed in one night all sent it and all reported `cwd: null`. A field that
   * is requested and ignored is a lie in the contract, so what a record says is reported here —
   * marked `recorded`, never mixed in with what was read off a log, which is `observed`.
   */
  workspace: SessionWorkspace | null
  /**
   * The agent named on the record, when that is not a tool any adapter answers to.
   *
   * `data.agent` used to become `tool` whatever it said, so a record filed honestly as
   * "claude-code (opus-5)" became a tool name no adapter can ever match and no log will ever be
   * found under. `tool` is now only ever a name that means "this is the thing that can read this
   * session's log"; what the writer declared is kept here, unaltered.
   */
  recordedAgent: string | null
  /** Where `lastActivityAt` came from, because a clock nobody can source cannot be argued with. */
  lastActivityFrom: ActivityClock | null
  /**
   * What the office can see of the process a run filed by hand names, when that run says it is running. Null on
   * every other row: a run with a log is read from its log, and a run that says another state claims no process.
   */
  itsProcess: ItsProcess | null
}

/** Rows the caller may see in one project, and disk rows left out of that answer. */
export interface ProjectSessionScope {
  sessions: SessionView[]
  notShown: SessionView[]
}

/**
 * Keep disk discoveries in the project their working folder resolves to.
 *
 * A session record already filed in this project remains this project's record, even if a later
 * disk read cannot place it. Only unfiled rows found on disk need to pass the folder check. Their
 * working folder is resolved by the same rule discovery uses. A folder that matches another
 * project, no project or more than one project is left out without returning any part of that row.
 */
export function scopeSessionsToProject(sessions: readonly SessionView[], workspaceId: string): ProjectSessionScope {
  const visible: SessionView[] = []
  const notShown: SessionView[] = []
  const resolutionByDirectory = new Map<string, ReturnType<typeof resolveProject>>()

  for (const session of sessions) {
    // The record belongs to this project already. A disk discovery with no such record does not.
    if (!session.discovered || session.recordId !== null || session.logPath === '') {
      visible.push(session)
      continue
    }

    const directory = session.cwd
    let resolution = directory === null ? null : resolutionByDirectory.get(directory)
    if (directory !== null && resolution === undefined) {
      resolution = resolveProject({ id: '', stated: false }, directory)
      resolutionByDirectory.set(directory, resolution)
    }

    if (resolution?.kind === 'matched' && resolution.id === workspaceId) visible.push(session)
    else notShown.push(session)
  }

  return { sessions: visible, notShown }
}

/** Which project directory a run was in, and how Mole Office knows. */
export interface SessionWorkspace {
  /** The directory's own name, e.g. `greenhouse_bench`. */
  name: string
  /** `observed` = read out of the log's own `cwd`. `recorded` = what somebody wrote on the record. */
  from: 'observed' | 'recorded'
  /** The full path, when one was observed. Null when only a name was written down. */
  path: string | null
}

/**
 * The five things a session's clock can be, worst evidence last.
 *
 * `change-log` exists because of a defect this pass fixed: a hand-filed session's clock moved when
 * somebody EDITED its record and not when the session wrote anything, so a run writing steadily
 * through the API read as idle for as long as it was busy.
 */
export type ActivityClock =
  /** The tool's own transcript on disk grew at this moment. */
  | 'log'
  /** The newest row this session wrote to the change log. It was working at that moment. */
  | 'change-log'
  /**
   * The newest use of a tool this run wrote, a row of `tool_uses` (lib/newest-use.ts). It was working at that moment.
   * Since round 33 a use moves nothing on the record, so without this a run that only uses tools read as idle.
   */
  | 'tool-use'
  /** `data.lastOutputAt`, which somebody wrote down. */
  | 'stated'
  /** The record's own `updatedAt`, which moves when the record is edited by anyone. */
  | 'record-updated'

const STATE_RANK: Record<ObservedSessionState, number> = Object.fromEntries(
  OBSERVED_SESSION_STATES.map((s, i) => [s, i]),
) as Record<ObservedSessionState, number>

/**
 * Most in need of a human first: crashed, orphaned, running, idle, unknown, finished; then most
 * recently active first within a state. The order is OBSERVED_SESSION_STATES itself, so the
 * ranking cannot drift away from the list it ranks.
 */
function bySeverityThenRecency(a: SessionView, b: SessionView): number {
  const rank = STATE_RANK[a.state] - STATE_RANK[b.state]
  if (rank !== 0) return rank
  return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
}

// ------------------------------------------------------- sessions that exist only as records

/** Every live `session` record, with its stamp read once. */
function sessionRecords(workspaceId: string): { record: PanelRecord; stamp: DiscoveryStamp | null }[] {
  return listRecords({ workspaceId, kind: 'session' }).map((record) => ({ record, stamp: stampOf(record) }))
}

/**
 * EVERY STORED FIELD OF A SESSION RECORD THAT A ROW OF THE SWEEP IS BUILT FROM: the state word, the
 * doing line, the runtime under both of its names, the stated clock, the project directory,
 * `extra`, and the computer the run names, which says whether this computer may look for that
 * process (`theProcessARunNames`). Of `extra` a row reads only `discovered`, which holds the discovery
 * stamp (`stampOf`) and the recorded process (`theRecordedProcessOf`); a person's notes and anything
 * else kept beside it are not read. `viewFromRecord`, `attachRecord`, `workspaceOf` and
 * `theProcessARunNames` read these and no other field.
 */
const THE_FIELDS_A_SESSION_ROW_READS = ['state', 'doing', 'runtime', 'agent', 'lastOutputAt', 'workspace', 'extra', 'machine'] as const
const THE_PARTS_OF_EXTRA_A_SESSION_ROW_READS = { extra: [DISCOVERY_KEY] } as const

/**
 * Every live `session` record as `sessionRecords` gives it, with only the fields a row reads kept.
 *
 * A session record's other fields hold its notes and its log of what it did, and on an office of the
 * live shape those were most of what GET /api/sessions read (round 35 of wave 13n). The parts of
 * `extra` beside `discovered` can be as large. The sweep writes nothing back from these records, so a
 * record read this way is never saved.
 */
function sessionRecordsForTheRows(workspaceId: string): { record: PanelRecord; stamp: DiscoveryStamp | null }[] {
  const data = onlyTheseFieldsOf(THE_FIELDS_A_SESSION_ROW_READS, [], THE_PARTS_OF_EXTRA_A_SESSION_ROW_READS)
  return listRecordsWithDataAs({ workspaceId, kind: 'session' }, data).map((record) => ({
    record,
    stamp: stampOf(record),
  }))
}

/** The state a record claims in `data.state`, when it claims a usable one. */
function recordedState(record: PanelRecord): SessionState | null {
  const value = record.data['state']
  if (typeof value !== 'string') return null
  return (SESSION_STATES as readonly string[]).includes(value) ? (value as SessionState) : null
}

function stringField(record: PanelRecord, key: string): string | null {
  const v = record.data[key]
  return typeof v === 'string' && v !== '' ? v : null
}

/**
 * The name of the directory a path ends in: `/srv/my_project` → `my_project`.
 *
 * One definition, used both when discovery writes `data.workspace` onto a new record and when a
 * sweep reports the workspace back, so the name a reader sees and the name that was stored cannot
 * be derived two different ways.
 */
export function workspaceNameOf(cwd: string | null): string | null {
  if (cwd === null) return null
  return cwd.split('/').filter(Boolean).pop() ?? null
}

/**
 * A session that exists only as a record: written by hand, or discovered once and since gone.
 *
 * A record carrying a stamp is re-observed through its adapter, which is what turns "the log this
 * record points at has been deleted" into a visible `orphaned` rather than a row that silently
 * stops appearing.
 */
function viewFromRecord(
  record: PanelRecord,
  stamp: DiscoveryStamp | null,
  env: AdapterEnv,
  evidence: SessionEvidenceRead | null,
  usedAt: string | null,
): SessionView {
  if (stamp !== null) {
    const adapter = adapterFor(stamp.tool)
    if (adapter !== null) {
      const observed = adapter.observe({ externalId: stamp.externalId, logPath: stamp.logPath }, env)
      return attachRecord(observed, record, false, evidence, 'log')
    }
    // A record written by a version of Mole Office that had an adapter this one does not. Nothing can
    // be checked, and saying so is the only honest answer.
    // ITS CLOCK is what the record says, or failing that its last change, unless it used a tool later than that.
    const stated = stringField(record, 'lastOutputAt')
    const recorded: { at: string; from: ActivityClock } = stated === null ? { at: record.updatedAt, from: 'record-updated' } : { at: stated, from: 'stated' }
    const clock: { at: string; from: ActivityClock } = usedAt !== null && usedAt.localeCompare(recorded.at) > 0 ? { at: usedAt, from: 'tool-use' } : recorded
    const observed: ObservedSession = {
      id: theSessionIdOfAStamp(stamp),
      tool: stamp.tool,
      externalId: stamp.externalId,
      name: record.title,
      purpose: record.summary,
      doing: stringField(record, 'doing'),
      cwd: null,
      state: 'unknown',
      stateReason:
        `this session was recorded as a "${stamp.tool}" session, and this build has no adapter that can ` +
        `read that tool's logs (it has: ${ADAPTERS.map((a) => a.tool).join(', ')}), so nothing about it ` +
        `can be checked.`,
      logPath: stamp.logPath,
      resumeCommand: stamp.resumeCommand,
      startedAt: stamp.startedAt,
      lastActivityAt: clock.at,
      // No `??` here any more: `stampOf` reads both of these itself and hands back a list and a
      // boolean whatever the record holds, so the defence that used to live here is gone from the
      // one place it could disagree with the reader.
      filesTouched: { paths: stamp.filesTouched, complete: stamp.filesComplete, scannedBytes: 0 },
      pid: null,
      entryPoint: stamp.entryPoint,
    }
    return attachRecord(observed, record, false, evidence, clock.from)
  }

  // No stamp at all: somebody filed this session by hand. Their `state` is the only evidence
  // there is, so it is reported as theirs, and its absence is reported as absence.
  const claimed = recordedState(record)
  // A RUN THAT SAYS IT IS RUNNING NAMES A PROCESS, so the office looks for it, and says what it saw.
  const its = claimed === 'running' ? theProcessARunNames(record) : null
  // `runtime` FIRST, `agent` AFTER IT. Window B renamed that key on every session in the corpus and
  // took the older name off the kind; a corpus restored from a backup taken before that window still
  // holds the old spelling, and reading only the new one there would answer `unrecorded` for every
  // run somebody had honestly recorded.
  const declared = stringField(record, 'runtime') ?? stringField(record, 'agent')
  // `tool` names the thing that can READ this session's log, and `adapterFor` is the list of names
  // that means anything. "claude-code (opus-5)" is an honest answer to "which agent is this" and a
  // tool name nothing will ever match, so it stays on `recordedAgent` and this says `unrecorded`.
  const tool = declared !== null && adapterFor(declared) !== null ? declared : NO_ADAPTED_TOOL

  /**
   * The clock, worst evidence last.
   *
   * A hand-filed session has no log, so its clock used to be `data.lastOutputAt` or — for the many
   * that carry neither — the record's own `updatedAt`, which moves when SOMEBODY EDITS THE RECORD
   * and not when the session does anything. A run writing steadily through the API therefore read
   * as idle for as long as it was busy. The newest row it wrote is what it was doing, so it wins
   * whenever it is the most recent of the three.
   */
  const stated = stringField(record, 'lastOutputAt')
  // `evidence` is null when this request's narrowing skipped the change-log read. There is then no
  // change-log clock for a hand-filed session to be measured by, and it falls back to `stated` or
  // `record-updated` below exactly as it already does for a session the change log never mentions.
  const wroteAt = evidence?.lastWroteAt.get(record.id) ?? null
  const dated: { at: string; from: ActivityClock }[] = [
    { at: record.updatedAt, from: 'record-updated' },
    ...(stated === null ? [] : [{ at: stated, from: 'stated' as const }]),
    ...(wroteAt === null ? [] : [{ at: wroteAt, from: 'change-log' as const }]),
    ...(usedAt === null ? [] : [{ at: usedAt, from: 'tool-use' as const }]),
  ]
  const newest = dated.reduce((best, next) => (next.at.localeCompare(best.at) > 0 ? next : best))

  const observed: ObservedSession = {
    id: record.id,
    tool,
    externalId: record.id,
    name: record.title,
    purpose: record.summary,
    doing: stringField(record, 'doing'),
    cwd: null,
    state: claimed ?? 'unknown',
    stateReason:
      (claimed === null
        ? 'this session was filed by hand with no state word and no log path, so there is nothing on disk to ' +
          'check it against.'
        : `this session was filed by hand and says it is "${claimed}". There is no log path on the record, ` +
          `so nothing on disk was checked — this is the writer's word, not an observation.` +
          (its?.sentence ?? '')) +
      // Said out loud, because a clock that comes from a different place than the state word is
      // exactly the pair a reader would otherwise assume agree.
      (newest.from === 'change-log'
        ? ` Its clock is the newest row it wrote to the change log, at ${newest.at}, which is a fact about ` +
          `this session rather than about its record.`
        : newest.from === 'tool-use'
          ? ` Its clock is the newest use of a tool it wrote, at ${newest.at}, which is a fact about this session ` +
            `rather than about its record.`
          : ''),
    logPath: '',
    resumeCommand: null,
    startedAt: null,
    lastActivityAt: newest.at,
    filesTouched: { paths: [], complete: false, scannedBytes: 0 },
    pid: null,
    entryPoint: null,
  }
  return attachRecord(observed, record, false, evidence, newest.from, its?.reading ?? null)
}

/**
 * Which project directory the run was in: what the log showed, or failing that what the record says.
 *
 * OBSERVED BEATS RECORDED AND THE ANSWER SAYS WHICH IT IS. They are different claims — one is a
 * path a tool wrote into its own transcript, the other is a word somebody typed into a field — and
 * a reader deciding whether to trust it needs to know which one they have.
 */
function workspaceOf(observed: ObservedSession, record: PanelRecord | null): SessionWorkspace | null {
  const seen = workspaceNameOf(observed.cwd)
  if (seen !== null) return { name: seen, from: 'observed', path: observed.cwd }
  const written = record === null ? null : stringField(record, 'workspace')
  return written === null ? null : { name: written, from: 'recorded', path: null }
}

function attachRecord(
  observed: ObservedSession,
  record: PanelRecord | null,
  discovered: boolean,
  evidence: SessionEvidenceRead | null,
  lastActivityFrom: ActivityClock | null,
  itsProcess: ItsProcess | null = null,
): SessionView {
  return {
    ...observed,
    discovered,
    recordId: record?.id ?? null,
    title: record?.title ?? null,
    origin: record?.origin ?? null,
    recordedPurpose: record?.summary ?? null,
    storableObservedState: storableState(observed.state),
    placement: placementOf(observed.id, record?.id ?? null, evidence),
    workspace: workspaceOf(observed, record),
    recordedAgent: record === null ? null : stringField(record, 'runtime') ?? stringField(record, 'agent'),
    lastActivityFrom: observed.lastActivityAt === null ? null : lastActivityFrom,
    itsProcess,
  }
}

// ---------------------------------------------------------------------------- listing

/** Every session Mole Office can see, and every place it was not able to look. */
export interface SessionSweep {
  sessions: SessionView[]
  /**
   * Directories an adapter could not open, with the reason and the path.
   *
   * Non-empty means `sessions` is a floor rather than a total: there may be sessions in these
   * places, and there is no way to tell from here. A caller reporting a count to a person has to
   * say so — see `warnAbout` in api/sessions.ts, which is what puts it on the page.
   */
  unreadable: UnreadablePlace[]
  /**
   * What the placement rule read to answer, and the rule itself in words.
   *
   * Null when this sweep's caller narrowed the request so that placement was never worked out —
   * see `SweepOptions.placement`. Never null for a sweep that read the evidence, even one that read
   * an empty workspace: that case is `{rule, projects: 0, ...}`, a real reading of a real corpus.
   */
  placement: PlacementReading | null
}

/**
 * What `sweepSessions` may be asked to hold back on.
 */
export interface SweepOptions {
  /**
   * Whether to work out where each run is filed. Default true.
   *
   * `false` skips `readSessionEvidence` entirely: no no-kind read of every record, no read of every
   * link, no read of the change log, and none of the N+1 lookups that resolve a spelling in the
   * change log's session column to a record id. That read is the most expensive thing this file
   * does — measured at 886 ms on the owner's corpus, against the sweep's own 1,791 session records alone.
   *
   * Every row still carries a `placement`, honestly: `{kind: 'unassigned', reason: {why:
   * 'not-asked-for'}, ...}` rather than a silently wrong or missing field. Nothing may quietly
   * answer about less than it was asked, so a caller that wants placement back always can — this
   * flag holds back one piece of the answer for a caller that said it does not want it, and the
   * reply's own shape says which is which.
   */
  placement?: boolean
  /**
   * The state the caller is asking to DRAW, echoing the door's `?only=` narrowing. Default: unset,
   * which reads every transcript at `full` depth and answers with every row, exactly as before.
   *
   * When set, the disk walk runs at `states` depth — the end of each log and the process table,
   * the evidence a state word is decided from, and none of the prose — so the tally over every
   * session costs a fraction of a full walk. The rows in the asked state are then read AGAIN at
   * `full` depth through `observe`, because those are the rows the caller will draw and they must
   * carry what a drawn row shows. Rows in every other state stay at `states` depth, and a caller
   * that drew them would see no name and no purpose in them — which is why the door filters them
   * out rather than shipping them.
   */
  only?: 'running'
}

/**
 * Every session Mole Office can see: found on disk, filed as a record, or both — and what it missed.
 *
 * Nothing here is cached. The whole value of the answer is that it is true at the moment it is
 * asked for, and a cache is how a page ends up showing a session as running for ten minutes after
 * it stopped.
 *
 * An adapter that could not read one of its directories does not fail the sweep. The sessions it
 * COULD read are still listed, and what it could not open comes back beside them: half an answer
 * that names its own hole is worth more than a page that will not load, and far more than a whole
 * answer that is quietly short.
 */
export function sweepSessions(
  workspaceId: string,
  env: AdapterEnv = defaultEnv(),
  opts: SweepOptions = {},
): SessionSweep {
  const filed = sessionRecordsForTheRows(workspaceId)
  // Read once for the whole sweep, and only when asked for. Every session is placed against the
  // same reading, so two rows of one answer cannot be decided against two different states of the
  // database — and when nobody asked where runs are filed, nothing reads the change log at all.
  const evidence = opts.placement === false ? null : readSessionEvidence(workspaceId)

  // Matched on tool + externalId, which is what a stamp is for. Titles are deliberately not used:
  // a person renaming a session must not detach it from its log, and two sessions given the same
  // name must not merge into one.
  const byKey = new Map<string, { record: PanelRecord; stamp: DiscoveryStamp }>()
  for (const { record, stamp } of filed) {
    if (stamp !== null) byKey.set(theSessionIdOfAStamp(stamp), { record, stamp })
  }

  const views: SessionView[] = []
  const claimed = new Set<string>()
  const unreadable: UnreadablePlace[] = []

  for (const adapter of ADAPTERS) {
    const found = adapter.discover(env, opts.only === undefined ? 'full' : 'states')
    unreadable.push(...found.unreadable)
    for (const observed of found.sessions) {
      const match = byKey.get(observed.id)
      if (match) claimed.add(match.record.id)
      // A ROW THE CALLER WILL DRAW is read in full, whatever depth the walk ran at: the tally
      // needs only the state word, but the drawn rows must carry what a drawn row shows, and the
      // door filters every other row out rather than ship a nameless one.
      if (opts.only !== undefined && observed.state === opts.only) {
        views.push(attachRecord(adapter.observe({ externalId: observed.externalId, logPath: observed.logPath }, env), match?.record ?? null, true, evidence, 'log'))
      } else {
        views.push(attachRecord(observed, match?.record ?? null, true, evidence, 'log'))
      }
    }
  }

  // Records the sweep did not account for: a log that has been deleted, a tool with no adapter,
  // or a session somebody typed in themselves. Every one of them keeps its row.
  // A RUN'S NEWEST USE OF A TOOL, one indexed lookup for each record no log accounted for. A run with a log is
  // measured by its log, which grows with each use, because the use is a command that run gave.
  const unclaimed = filed.filter(({ record }) => !claimed.has(record.id))
  const used = theNewestUsesOf(unclaimed.map(({ record }) => record.id))
  for (const { record, stamp } of unclaimed) {
    views.push(viewFromRecord(record, stamp, env, evidence, used.get(record.id) ?? null))
  }

  return {
    sessions: views.sort(bySeverityThenRecency),
    unreadable,
    placement: evidence === null ? null : placementReading(evidence),
  }
}

/**
 * The sessions alone, for callers that are reporting on the sessions rather than on the sweep.
 *
 * A narrowing of `sweepSessions`, not a second implementation, so the two can never come to
 * different conclusions. Anything that puts a COUNT in front of a person should call the sweep
 * instead: "0 sessions" from here is indistinguishable from "0 sessions and two directories I was
 * refused", and that is the whole point of the pair.
 */
export function listSessions(workspaceId: string, env: AdapterEnv = defaultEnv()): SessionView[] {
  return sweepSessions(workspaceId, env).sessions
}

/**
 * Is this the session that id names? True for Mole Office's own `<tool>:<externalId>` and for the id of
 * its record, because both are ids a caller legitimately holds: the list hands back the first, and
 * anything that reached the session through a link holds the second.
 *
 * A named function rather than an inline predicate because more than one caller needs exactly this
 * test: `getSession` and the link of a run. `theSessionAnIdNames` picks the rows this test picks
 * before it builds them, so this rule is written there a second time, and
 * tests/the-detail-of-a-run-reads-only-that-run.test.ts holds the two to one answer.
 */
export function isSessionId(view: SessionView, id: string): boolean {
  return view.id === id || view.recordId === id
}

/** One session, by Mole Office's session id (`<tool>:<externalId>`) or by its record id. */
export function getSession(id: string, workspaceId: string, env: AdapterEnv = defaultEnv()): SessionView | null {
  // Deliberately the same sweep the list does, rather than a faster path that looks up one
  // session directly. The two endpoints must not be able to disagree: a detail page saying
  // `running` beside a list saying `orphaned` is the sort of contradiction that makes somebody
  // stop believing both. The sweep costs about 60ms across every transcript on this machine,
  // which is well within what a page that is about to render a log tail can afford.
  return listSessions(workspaceId, env).find((s) => isSessionId(s, id)) ?? null
}

/** The run an id names, as the detail of a run shows it, and every place the search for it could not open. */
export interface TheSessionAnIdNames {
  /** The row the sweep gives first for the id, within the project's scope. Null when the sweep gives none. */
  session: SessionView | null
  /** Every place an adapter could not open, as `SessionSweep.unreadable` says them. */
  unreadable: UnreadablePlace[]
}

/** `theSessionIdOfAStamp` in SQL: a stored stamp's tool and conversation, with a colon between them. */
const THE_SESSION_ID_OF_A_STORED_STAMP = sql`(json_extract(${records.data}, ${`$.extra.${DISCOVERY_KEY}.tool`}) || ':' || json_extract(${records.data}, ${`$.extra.${DISCOVERY_KEY}.externalId`}))`

/**
 * THE RUN AN ID NAMES, AS THE SWEEP GIVES IT, BUILT FROM THAT RUN ALONE (wave 13y round 136).
 *
 * GET /api/sessions/:id found the run it shows through `sweepSessions`: every run of the project, and every transcript on
 * the computer read in full. It was measured on the made-up office at the 4 November scale, with a made-up home folder
 * of the live server's transcript sizes. A run that was found took a median of 241 to 263 ms and 17,576 statements. An
 * id that nothing has took 167 ms and 17,561 statements. This way, a run that is found takes 87 to 147 ms and 19 to 21
 * statements, and an id that nothing has takes 55 ms and 4 statements. Each answer is the same, byte for byte. Of what
 * is left, the search for a stamp by its session id takes about 50 ms: it reads the data of every session record of
 * the project.
 *
 * The sweep's rows of an id come from three places. They are the transcripts of the conversation the id names, and of
 * the conversation its record's stamp names when that record is the last of that stamp in the listed order. They are
 * also the records no transcript accounts for whose id or stamp is the id. This reads only those records and only
 * those transcripts, and builds each row as the sweep builds it. The sweep's order sorts without moving rows that tie,
 * so the first of these rows is the sweep's first, and the project's scope is decided row by row as the sweep decides
 * it. Every place is walked as the sweep walks it, so a miss can say what the search could not open.
 * tests/the-detail-of-a-run-reads-only-that-run.test.ts holds the answer to the sweep's.
 */
export function theSessionAnIdNames(id: string, workspaceId: string, env: AdapterEnv = defaultEnv()): TheSessionAnIdNames {
  const data = onlyTheseFieldsOf(THE_FIELDS_A_SESSION_ROW_READS, [], THE_PARTS_OF_EXTRA_A_SESSION_ROW_READS)
  const itsRecord = listRecordsWithDataAs({ workspaceId, kind: 'session', ids: [id] }, data)[0] ?? null
  const itsStamp = itsRecord === null ? null : stampOf(itsRecord)
  // THE SESSION IDS WHOSE RECORDS CAN GIVE A ROW OF THE ID: the id itself, which a stamp's session id can only be with a
  // colon in it, and the session id its record's stamp names.
  const stampIds = [...new Set([...(id.includes(':') ? [id] : []), ...(itsStamp === null ? [] : [theSessionIdOfAStamp(itsStamp)])])]
  const stamped =
    stampIds.length === 0
      ? []
      : listRecordsWithDataAs({ workspaceId, kind: 'session', alsoWhere: inArray(THE_SESSION_ID_OF_A_STORED_STAMP, stampIds) }, data)
  const read = itsRecord === null || stamped.some((record) => record.id === itsRecord.id) ? stamped : inTheListedOrder([itsRecord, ...stamped])
  const filed = read.map((record) => ({ record, stamp: stampOf(record) }))

  // The same matching as the sweep's: the last record of a stamp, in the listed order, is the one its transcript is read with.
  const byKey = new Map<string, { record: PanelRecord; stamp: DiscoveryStamp }>()
  for (const { record, stamp } of filed) {
    if (stamp !== null) byKey.set(theSessionIdOfAStamp(stamp), { record, stamp })
  }

  // THE CONVERSATIONS WHOSE TRANSCRIPTS GIVE A ROW OF THE ID: the one it names, and the one its record's stamp names when
  // that record is the one that stamp's transcript is read with.
  const asked = stampIds.filter((one) => one === id || byKey.get(one)?.record.id === id)
  const views: SessionView[] = []
  const claimed = new Set<string>()
  const unreadable: UnreadablePlace[] = []
  for (const adapter of ADAPTERS) {
    const prefix = `${adapter.tool}:`
    const found = adapter.discoverThese(asked.filter((one) => one.startsWith(prefix)).map((one) => one.slice(prefix.length)), env)
    unreadable.push(...found.unreadable)
    for (const observed of found.sessions) {
      const match = byKey.get(observed.id)
      if (match) claimed.add(match.record.id)
      views.push(attachRecord(observed, match?.record ?? null, true, null, 'log'))
    }
  }

  // The records of the id that no transcript accounted for, each the row the sweep makes of it.
  const unclaimed = filed.filter(
    ({ record, stamp }) => !claimed.has(record.id) && (record.id === id || (stamp !== null && theSessionIdOfAStamp(stamp) === id)),
  )
  const used = theNewestUsesOf(unclaimed.map(({ record }) => record.id))
  for (const { record, stamp } of unclaimed) {
    views.push(viewFromRecord(record, stamp, env, null, used.get(record.id) ?? null))
  }

  return { session: scopeSessionsToProject(views.sort(bySeverityThenRecency), workspaceId).sessions[0] ?? null, unreadable }
}

// ---------------------------------------------------------------------------- the tail

/** The last lines of a session's own log, or the reason there are none. */
export interface SessionTail {
  /** The file that was read. Null when the session has no log at all. */
  path: string | null
  /** How many lines were asked for. */
  requested: number
  /** The lines, oldest first, so it reads in the order it happened. */
  lines: TailLine[]
  /** False when there was nothing to read; `reason` then says why, in plain English. */
  available: boolean
  reason: string | null
  /** True when the whole file was covered, so nothing came before these lines. */
  wholeFile: boolean
  /** The log's size in bytes, when it could be read. */
  fileSize: number | null
}

/** How many lines a caller gets when it does not say. Enough to see what happened, not a dump. */
export const DEFAULT_TAIL_LINES = 40

/** The most a caller may ask for, so one request cannot pull a 13 MB transcript into memory. */
export const MAX_TAIL_LINES = 500

/**
 * Read the end of a session's log.
 *
 * Mole Office never stores these lines. They are read from the tool's own file at the moment somebody
 * asks, which is why watching a running session shows what it is doing now rather than what it
 * was doing when a sweep last ran.
 */
export function readSessionTail(view: SessionView, lines = DEFAULT_TAIL_LINES): SessionTail {
  const requested = Math.min(Math.max(1, Math.trunc(lines)), MAX_TAIL_LINES)
  const base: SessionTail = {
    path: view.logPath === '' ? null : view.logPath,
    requested,
    lines: [],
    available: false,
    reason: null,
    wholeFile: false,
    fileSize: null,
  }

  if (view.logPath === '') {
    return {
      ...base,
      reason:
        'this session was filed by hand and carries no log path, so there is no transcript for Mole Office to ' +
        'read. Sessions found by discovery carry the path of the file their tool writes.',
    }
  }

  const adapter: SessionAdapter | null = adapterFor(view.tool)
  if (adapter === null) {
    return {
      ...base,
      reason:
        `no adapter in this build can read a "${view.tool}" log (it has: ` +
        `${ADAPTERS.map((a) => a.tool).join(', ')}), so its lines cannot be rendered.`,
    }
  }

  const read = readLastLines(view.logPath, requested)
  if (isUnreadable(read)) return { ...base, reason: read.reason }

  return {
    ...base,
    available: true,
    wholeFile: read.complete,
    fileSize: read.fileSize,
    // Numbered from the end, so line 1 is the newest whatever the window turned out to be, but
    // handed back oldest-first so it reads downwards the way it happened.
    lines: read.lines.map((raw, i) => adapter.renderLine(raw, read.lines.length - i)),
  }
}

/**
 * THE TAIL A READER IS GIVEN WHEN IT MAY NOT READ THE TRANSCRIPT, as a decision says.
 * `theRunsWhoseTranscriptThisReaderMayRead` in lib/messages.ts says who may. No lines, and the reason. The file is
 * not opened.
 */
export function aTailThisReaderMayNotRead(view: SessionView, lines = DEFAULT_TAIL_LINES): SessionTail {
  return {
    path: view.logPath === '' ? null : view.logPath,
    requested: Math.min(Math.max(1, Math.trunc(lines)), MAX_TAIL_LINES),
    lines: [],
    available: false,
    reason: A_TRANSCRIPT_IS_READ_BY,
    wholeFile: false,
    fileSize: null,
  }
}

/**
 * A SESSION AS A READER WHO MAY NOT READ ITS TRANSCRIPT SEES IT. Four fields are
 * read from the transcript on disk at the moment of the request: `name` and `purpose` are its opening
 * request, `givenName` is the name the run was given there, and `doing` is its last line. Those are the
 * transcript's own words, so they are taken out: `givenName`, `purpose` and `doing` are null, and `name`
 * is the record's title, or the session's own id when nothing is filed. A session with no transcript read nothing from disk and is handed back as it came. What the
 * record stores, its title and its summary among it, is left as every other door shows it.
 */
export function aSessionWithoutItsTranscript(view: SessionView): SessionView {
  if (view.logPath === '') return view
  return { ...view, name: view.title ?? view.id, givenName: null, purpose: null, doing: null }
}

/** Why a transcript's lines are not shown to a reader who may not read it. */
export const A_TRANSCRIPT_IS_READ_BY =
  'the lines of a run\'s transcript are shown only to the agent the run answers as, to a secretary and to the owner. ' +
  'A transcript holds the messages the run was given and whatever it read while it worked, and nothing in it says ' +
  'reliably which message a line came from, so it cannot be cut down to the messages you may read.'

// ---------------------------------------------------------------------------- persisting

/** What one sweep did. Every number is something that actually happened to the database. */
export interface SyncReport {
  /** Sessions found on disk this sweep. */
  discovered: number
  /** Records created, because the session had never been filed. */
  created: number
  /**
   * Runs this project already had a record for, written onto instead of being filed a second time.
   *
   * A SECOND RECORD FOR ONE RUN IS THE DEFECT THIS COUNTS. The record Mole Office's own hook filed holds
   * everything that run did; a fresh row for its transcript holds nothing. Filing the second one
   * left the history unreachable and the reachable row connected to no work, which is the whole of
   * why the ranked list of recipients came out backwards. See `recordsTheHookFiled` above.
   *
   * These are counted apart from `updated` because they are a different event for a reader: nothing
   * about the session moved, Mole Office simply found out which conversation a record it already had is.
   */
  adopted: number
  /** Records whose observation fields moved since last time. */
  updated: number
  /**
   * Records already holding exactly what was observed — nothing about the SESSION moved.
   *
   * This does NOT mean nothing was written for them: see `stampOnly`. It used to say so, and the
   * endpoint list said "a second run over an unchanged machine writes nothing at all", and both
   * were measurably false — a third sweep over a machine nothing had happened on reported 34
   * unchanged and wrote 35 change rows.
   */
  unchanged: number
  /**
   * How many of `unchanged` were still written to, because the discovery stamp carries the time
   * it was taken and that time is new on every sweep.
   *
   * NORMALLY EQUAL TO `unchanged`, and that is the point of reporting it. `data.extra.discovered`
   * holds what was observed plus `at`, the moment of the observation; re-stamping `at` writes a
   * change row and moves the record's `updated_at`. That is not movement of the session, which is
   * why it is filtered out of `updated`, and it is not nothing either. A reader has to know,
   * because `updated_at` is what the attention rule falls back to when a session record carries no
   * `data.state` change row: a run that stopped four days ago is scored from the clock of the last
   * sweep, not from when it stopped.
   */
  stampOnly: number
  /**
   * Sessions whose honest state has nowhere to live in `data.state`.
   *
   * ZERO ON EVERY SWEEP TODAY, and it is reported anyway. The two words that used to land here
   * were `orphaned` and `unknown`; `SESSION_STATES` declares both now, so every state an adapter
   * can report is a state a record may hold and nothing is dropped. This comment used to name
   * those two as the ones being counted, which sent a reader looking for a gap that has closed.
   *
   * Kept because a non-zero value would mean an adapter had started reporting a word the record
   * schema does not accept. That session's `state` key is then left out on purpose, so the
   * record reads as incomplete rather than as a session that is fine, and this count is what
   * says it was a decision and not an oversight.
   */
  stateNotStorable: number
  /**
   * Places the sweep could not read, so `discovered` is a floor rather than a total.
   *
   * A sweep that filed nothing because it was refused every directory reports the same zeros as a
   * sweep over a machine with no sessions on it. These are what tells them apart, and the note on
   * POST /api/sessions/discover says so out loud when the list is not empty.
   */
  unreadable: UnreadablePlace[]
  /** One line per session touched, for a caller that wants to see what moved. */
  notes: string[]
  /**
   * TRUE WHEN NOTHING WAS WRITTEN (problem kDKj9iXd4Vft). A dry run reads the disk and the records, and answers
   * what it would do in `where`; `created`, `adopted`, `updated`, `unchanged` and `stampOnly` are then all zero,
   * because nothing was filed or written to.
   */
  dryRun: boolean
  /**
   * EVERY CONVERSATION FOUND ON DISK, AND WHERE IT WENT OR WOULD GO. One entry each, in the order found.
   *
   * `filed` is a new record in `project`, the project the conversation's own working directory matched (deepest
   * first). `observed` is the record it already had, written to in the project that record is in. `not filed` is a
   * conversation no project holds, or more than one does equally, or whose working directory was not observed: it
   * is never filed into the caller's project, and `because` says why.
   */
  where: WhereAConversationGoes[]
}

/** Where one conversation on disk went, or would go on a dry run. */
export interface WhereAConversationGoes {
  /** The conversation, as `tool:externalId`. */
  conversation: string
  /** The working directory read from its log, or null when none was observed. */
  directory: string | null
  action: 'filed' | 'observed' | 'not filed'
  /** The project it went into, or null when it was not filed. */
  project: string | null
  because: string
}

/**
 * A title nothing else in this project is already called. A preference now, not a rule.
 *
 * TITLES MAY REPEAT — id is identity, title is presentation — so this no longer has to produce a
 * name nobody else holds; a sweep that filed two runs under one title would be storing the truth.
 * It keeps doing it anyway, because two rows called `claude-code` in a list of sessions is a list
 * a person cannot read, and a sweep is the one write with nobody watching it choose.
 *
 * IT COUNTS ROWS RATHER THAN RESOLVING THE NAME, and that is the change of 17 August 2026. It used
 * to ask `getRecordByTitle`, which REFUSES a title that names more than one record — a sensible
 * answer to "which record is this" and the wrong answer to "is anything called this". Once titles
 * may repeat, a project with two records of one name would have made every discovery sweep throw a
 * 409 out of a function whose job is to pick a different name.
 *
 * DELETED ROWS COUNT. `recordsByTitle` includes them and they are not filtered, deliberately: a
 * deleted session record is still in the change log and still reachable, so reusing its exact title
 * for a different run would make the history of two runs read as one.
 *
 * EXPORTED, AND TAKING ONLY THE TWO FIELDS IT READS. It used to take a whole `SessionView`, which is
 * a forty-field object an adapter builds off a transcript on disk — so the only way to reach this
 * rule from a test was to run a whole discovery sweep. It reads `tool` and `externalId` and nothing
 * else, so that is what it asks for, and tests/title-identity.test.ts calls it directly.
 */
export function uniqueTitle(
  preferred: string,
  view: Pick<SessionView, 'tool' | 'externalId'>,
  workspaceId: string,
): string {
  const taken = (title: string): boolean => recordsByTitle(title, workspaceId).length > 0
  const base = preferred.trim() === '' ? `${view.tool} ${view.externalId.slice(0, 8)}` : preferred.trim()
  if (!taken(base)) return base

  // The tool and a short id tell two same-named sessions apart. The full id is the last resort and
  // cannot collide, because it is the key sessions are matched on.
  const shortened = `${base} · ${view.tool} ${view.externalId.slice(0, 8)}`
  if (!taken(shortened)) return shortened
  return `${base} · ${view.tool} ${view.externalId}`
}

/**
 * A stamp from one observation. Takes an `ObservedSession`, which `SessionView` also is.
 *
 * Widened from `SessionView` on 18 August 2026 so that `stampFinishedRun` below can use it: that
 * function has an adapter's own observation and no record-derived fields, and building a second
 * stamp shape there would be the same fact worked out in two places.
 */
function stampFor(view: ObservedSession, at: string): DiscoveryStamp {
  return {
    tool: view.tool,
    externalId: view.externalId,
    logPath: view.logPath,
    resumeCommand: view.resumeCommand,
    startedAt: view.startedAt,
    entryPoint: view.entryPoint,
    observedState: view.state,
    stateReason: view.stateReason,
    filesTouched: view.filesTouched.paths,
    filesComplete: view.filesTouched.complete,
    at,
  }
}

/** Local `YYYY-MM-DD HH:MM:SS`, the format every stored timestamp in Mole Office uses. */
// The sixth copy of this helper lived here. Timestamps are LOCAL, not UTC, on purpose -- a day
// has to mean the operator's day -- and every copy of that reasoning was a chance for one to
// drift to UTC and quietly file a late evening's work under tomorrow. One definition now.

/**
 * File the session as a record if it is not filed already. Returns the record and whether it is new.
 *
 * Exported because linking needs it: you cannot link to a session that has no record, and
 * refusing to link a session that Mole Office can plainly see would be a dead end for the caller. The
 * response says when a record was created, so nothing appears behind anybody's back.
 */
export function ensureSessionRecord(
  view: SessionView,
  actor: Actor,
  /**
   * WHICH PROJECT A DISCOVERED SESSION IS FILED IN: the one the request that asked for the sweep is
   * working in, and NEVER `data.workspace`.
   *
   * Those two words look like the same fact and are not. `data.workspace` is a DIRECTORY — the cwd
   * the run was in, which shared/kinds.ts calls "which project directory it was working in" — and it
   * is free text that no record answers to. This is a project boundary, declared in the registry.
   * Reading a directory name as a workspace id would file a run into a project on the strength of a
   * folder name, which is precisely the "never infer a workspace" rule. The corpus migration used
   * the directory as EVIDENCE, once, under measurement; a write path may not.
   */
  workspaceId: string,
  env: AdapterEnv = defaultEnv(),
): { record: PanelRecord; created: boolean } {
  if (view.recordId !== null) {
    const existing = getRecord(view.recordId)
    if (existing !== null) return { record: existing, created: false }
  }

  const at = localStamp(env.now)
  const state = storableState(view.state)
  const workspace = workspaceNameOf(view.cwd)

  const data: Record<string, unknown> = {
    // `runtime`, WHICH IS WHAT THE FIELD IS CALLED SINCE WINDOW B. It was `agent`; an agent is a
    // durable identity in this product now, and a session is one run of a tool.
    runtime: view.tool,
    // THE DECLARED TOOL, the one the usage page counts: the adapter that found this run on disk is
    // the tool's own adapter, so its word is declared when it is one of the tools Mole Office adapts.
    ...(isAgentRuntime(view.tool) ? { adaptedTool: view.tool } : {}),
    // A new record holds no doing line yet, so discovery's reading goes in below, and the stamp
    // remembers it as discovery's own. See `theDoingLineDiscoveryMayWrite`. The stamp also says
    // the run is filed in the caller's name, and is not the caller's own run.
    extra: {
      [DISCOVERY_KEY]: {
        ...stampFor(view, at),
        ...(view.doing === null ? {} : { [DOING_DISCOVERY_WROTE]: view.doing }),
        [FILED_IN_A_CALLERS_NAME]: true,
      },
    },
  }
  // Left out entirely when there is no honest value, rather than filled with a plausible one.
  // shared/kinds.ts stores a record with a field missing and REPORTS it; that report is the point.
  if (state !== null) data['state'] = state
  if (view.doing !== null) data['doing'] = view.doing
  if (view.lastActivityAt !== null) data['lastOutputAt'] = view.lastActivityAt
  if (view.lastActivityTime != null) {
    data['lastOutputTime'] = view.lastActivityTime
    data['lastOutputTimeSource'] = 'transcript-timestamp'
  }
  if (workspace !== null) data['workspace'] = workspace

  const { record } = createRecordWithReport({
    workspaceId,
    kind: 'session',
    // NO WORD OF WHAT THE RUN WAS ASKED GOES INTO WHAT IS STORED. The opening
    // request of a run the office started is the message it was handed, word for word, and a record's
    // title and summary show wherever records show, to readers that may not read that message. So the
    // title is the name a person or the tool gave the run, or its tool and the start of its id when it
    // was given none, which says which run it is and claims nothing about what it was for. The summary
    // is left empty until somebody writes one. The opening request
    // is still read from the transcript on each request, by GET /api/sessions, for the readers
    // `theRunsWhoseTranscriptThisReaderMayRead` lets read it.
    title: uniqueTitle(view.givenName ?? '', view, workspaceId),
    summary: null,
    data,
    actor,
    // These are OTHER PEOPLE'S sessions: transcripts found on disk, filed on their behalf. The
    // caller's own run name must not be bound to one of them, or a sweep run under
    // `x-mole-office-session: checkpoint3` would hand checkpoint3's whole history to whichever
    // transcript the adapter happened to read first.
    bindCallerSession: false,
  })
  return { record, created: true }
}

// ------------------------------------------------ the record a conversation already has

/**
 * ---------------------------------------------------------------------------------------
 * WHY A SWEEP HAS TO ASK THIS, AND WHY ASKING ONLY THE STAMP MADE ROUTING COME OUT BACKWARDS
 * ---------------------------------------------------------------------------------------
 *
 * A sweep matched a transcript to a session record by `tool:externalId` off the record's discovery
 * stamp, and by nothing else. The stamp is the field the sweep exists to WRITE. So a record that
 * had never been swept carried no key, could never be matched, and got a SECOND record filed beside
 * it — one row holding the run's whole history and unable to be picked up, another row able to be
 * picked up and holding no history.
 *
 * That is why Phase 10 came out inverted. Measured on a copy of the owner's corpus on 19 August
 * 2026, on seven records of six kinds: every agent under "Agents connected to what you pointed at"
 * answered "cannot be picked up" (11 of 11, on every record), and every agent that could be picked
 * up was under "Nothing connects these to what you pointed at" (41 of 41). The two sets were
 * disjoint BY CONSTRUCTION and no amount of ranking could have crossed them: connected candidates
 * are the records this project's runs wrote under, reachable ones were the rows the sweep had just
 * filed for their transcripts, and a row filed one second ago has written nothing to anything.
 *
 * ---------------------------------------------------------------------------------------
 * THE SECOND KEY, WHICH MOLE OFFICE WROTE DOWN ITSELF AND HAD NEVER READ BACK
 * ---------------------------------------------------------------------------------------
 *
 * `tools/session-hook.mjs` files a session record at the start of every run, and it holds the
 * conversation id in its own input at that moment. It writes `.logs/session-<conversation>.json`
 * holding the record id it filed, so it can find the same record again on a compaction. Nothing
 * else has ever read that file.
 *
 * So Mole Office already held both halves of the join and used neither. Reading them back is not an
 * inference about what a run is probably about: it is Mole Office reading a pair Mole Office wrote at the
 * moment it filed the record.
 *
 * THE PAIRS ARE NOT REPAIRABLE FROM ANYTHING ELSE. A transcript names several Mole Office record ids in
 * its own text — the agent was reading and writing records — so grepping one for an id finds four
 * answers on this machine and cannot tell which is its own. That is the guess the fifth rule
 * forbids, and it is why this reads a file written for the purpose rather than the transcript.
 *
 * KNOWN LIMIT, WRITTEN DOWN RATHER THAN HIDDEN: the hook writes the pair into `.logs` and
 * not onto the record, so the pairs live only as long as `.logs` does and only for runs started
 * where the hook is wired. Five survive on this machine. The change that stops this corpus growing
 * more unreachable runs is the hook writing the conversation onto the record it files; this repairs
 * the ones already filed.
 */
/**
 * Where Mole Office's own session hook writes down which record it filed for which conversation. The folder is
 * worked out once, in src/config/the-session-note.mjs, which the hook writes through: `.logs` in the data folder of
 * the install, which in a checkout is the checkout.
 */
export const HOOK_NOTES_DIR = THE_SESSION_NOTES_FOLDER

/** The one file name the hook uses, read in one place, so the two cannot come to disagree. */
const HOOK_NOTE = /^session-(.+)\.json$/

/**
 * Which record Mole Office's own hook filed for which conversation: conversation id → record id.
 *
 * Missing, unreadable and malformed files are all the same answer — this conversation has no pair —
 * and none of them is a failure. The hook writes these on a best-effort basis and deletes nothing,
 * so a directory that is not there is the ordinary state of a checkout nobody has run a session in.
 */
export function recordsTheHookFiled(dir: string = HOOK_NOTES_DIR): Map<string, string> {
  const pairs = new Map<string, string>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return pairs
  }
  for (const name of names) {
    const found = HOOK_NOTE.exec(name)
    if (found === null) continue
    try {
      const held = JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown
      if (typeof held !== 'object' || held === null) continue
      const id = (held as Record<string, unknown>)['id']
      if (typeof id === 'string' && id !== '') pairs.set(found[1]!, id)
    } catch {
      // A half-written or hand-edited note names no pair. Nothing is claimed from it.
    }
  }
  return pairs
}

/**
 * Whether this project already has a record for this conversation, and when it does not, why not.
 *
 * THREE ANSWERS RATHER THAN TWO. `null` is the ordinary case — the hook wrote no pair for this
 * conversation, so there is nothing to say about it. `refused` is a pair that exists and cannot be
 * used, and it is reported: a person who can see the note file has to be told why the record it
 * names was not the one written onto.
 *
 * The refusal that matters most is a record that already names a conversation. Quietly repointing
 * it at a second one would tell a worker to resume the wrong transcript, which is the substitution
 * the whole routing feature exists to prevent.
 */
type Adoption = { adopt: PanelRecord } | { refused: string }

function recordAlreadyFiledFor(
  externalId: string,
  workspaceId: string,
  pairs: Map<string, string>,
): Adoption | null {
  const id = pairs.get(externalId)
  if (id === undefined) return null
  const record = getRecord(id)
  if (record === null) return { refused: `the record it names (${id}) is not in this database` }
  if (record.deletedAt !== null) return { refused: `the record it names (${id}) has been deleted` }
  if (record.kind !== 'session') return { refused: `the record it names (${id}) is a ${record.kind}, not a session` }
  if (record.workspaceId !== workspaceId) {
    return { refused: `the record it names (${id}) is filed in the project ${record.workspaceId}` }
  }
  if (stampOf(record) !== null) {
    return { refused: `the record it names (${id}) already names a conversation, and one record is one run` }
  }
  return { adopt: record }
}

/**
 * Bring the records in line with what is on disk, without standing on anything a person wrote.
 *
 * Idempotent in what it computes: the same machine gives the same values, and `patchRecord` writes
 * nothing at all -- not even `updatedAt` -- for a merge patch that changes nothing.
 *
 * IT IS NOT IDEMPOTENT IN WHAT IT WRITES, and this used to claim it was. The discovery stamp
 * carries `at`, the moment the observation was taken, so a second sweep over a machine nothing has
 * happened on hands `patchRecord` a patch that DOES change something and every session record is
 * written to again. `stampOnly` counts them, and the report says so rather than reporting a
 * quiet no-op that did not happen.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PRESS FILED 41 RECORDS, AND 36 OF THEM STILL DO. THE DECISION, AND WHAT IT COSTS
 * ---------------------------------------------------------------------------------------
 *
 * MEASURED ON A COPY OF THE OWNER'S CORPUS, 19 August 2026. Pressing "Look for runs on this
 * computer" while looking at the `panelx` project filed 41 session records into it, taking the
 * project from 229 records to 270. The 41 transcripts were working in 13 different directories:
 * 18 of them under this checkout or its parent, and 23 in other projects' folders, `~/Downloads`,
 * `/tmp` and an agent job directory — work with nothing to do with Mole Office. Adopting (above) takes
 * that to 36 and 265, because five of the 41 were second records for runs this project already had.
 *
 * THE DECISION, MADE (problem kDKj9iXd4Vft, 28 September 2026): A SWEEP FILES EACH RUN WHERE ITS OWN WORKING
 * DIRECTORY IS, OR NOWHERE. Filing a record into a project asserts the run is part of that project, and the project
 * the person or agent was looking at when they asked is not evidence about the run. So each conversation found on
 * disk is handled by what is known of it:
 *
 *   - IT ALREADY HAS A RECORD, in any project: the observation is written onto that record, where it is. A sweep
 *     never files a second record for one run, whichever project it was asked from.
 *   - MOLE OFFICE'S OWN SESSION HOOK WROTE DOWN A RECORD FOR IT: that record is adopted, in its own project.
 *   - NEITHER: it is filed into the project its observed working directory matches (`resolveProject`'s match,
 *     deepest first). When nothing holds that directory, when two projects hold it equally, or when no directory was
 *     read from its log, it is reported in `where` and filed nowhere. It is never filed into the caller's project.
 *
 * A DRY RUN WRITES NOTHING AT ALL. It reads the disk and the records, and answers the same `where` with nothing
 * filed, adopted or written to. It used to hold back only the change-log half of the door, and a caller that asked
 * for a harmless look filled a project with every conversation on the machine.
 */
export function syncSessions(
  actor: Actor,
  /**
   * THE PROJECT THE SWEEP WAS ASKED FROM. It decides nothing about where a run is filed (see above); it is kept so
   * the door and every caller say which project asked, and it is not read.
   */
  _askedFrom: string,
  env: AdapterEnv = defaultEnv(),
  /**
   * Where Mole Office's own session hook wrote its record-for-conversation pairs.
   *
   * A PARAMETER FOR THE SAME REASON `AdapterEnv` CARRIES `homeDir`: a test describes the machine it
   * is testing against rather than sampling the one it happens to run on. It belongs on `AdapterEnv`
   * beside `homeDir`, and it is here because that type is owned by another file this wave.
   */
  hookNotes: string = HOOK_NOTES_DIR,
  opts: { dryRun?: boolean; onWrite?: () => void } = {},
): SyncReport {
  const dryRun = opts.dryRun === true
  const report: SyncReport = {
    discovered: 0,
    created: 0,
    adopted: 0,
    updated: 0,
    unchanged: 0,
    stampOnly: 0,
    stateNotStorable: 0,
    unreadable: [],
    notes: [],
    dryRun,
    where: [],
  }
  const at = localStamp(env.now)
  // EVERY STAMPED SESSION RECORD, IN EVERY PROJECT, read once: a run already filed anywhere is observed where it is.
  const filed = new Map<string, PanelRecord>()
  for (const workspace of listWorkspaces()) {
    for (const { record, stamp } of sessionRecords(workspace.id)) {
      if (stamp !== null) filed.set(`${stamp.tool}:${stamp.externalId}`, record)
    }
  }
  // Read once for the whole sweep, like the records above, so two runs of one sweep cannot be
  // decided against two states of the directory.
  const pairs = recordsTheHookFiled(hookNotes)

  for (const adapter of ADAPTERS) {
    const found = adapter.discover(env, 'full')
    // Carried through rather than dropped here: this is the number that says whether "nothing new
    // on disk" means the disk was read.
    report.unreadable.push(...found.unreadable)
    for (const observed of found.sessions) {
      const record = filed.get(observed.id) ?? null
      const view = attachRecord(observed, record, true, null, 'log')
      report.discovered += 1
      const directory = view.workspace !== null && view.workspace.from === 'observed' ? view.workspace.path : null

      const state = storableState(view.state)
      if (state === null) report.stateNotStorable += 1

      // WHERE IT GOES. A record it already has decides first, then a record Mole Office's own hook wrote down for it,
      // then its working directory.
      //
      // ADOPT BEFORE FILING. The record matched above carries a discovery stamp; a record the hook filed for this
      // conversation may carry none yet, and the pair the hook wrote down is the second answer to the same question
      // (see `recordsTheHookFiled` for the measurement). It is adopted in its own project, and a pair that cannot be
      // adopted is said in `notes` and decides nothing about where the new record goes.
      const already = record !== null ? null : recordAlreadyFiledFor(view.externalId, projectOfThePairedRecord(view.externalId, pairs), pairs)
      const adopting = already !== null && 'adopt' in already ? already.adopt : null
      if (already !== null && 'refused' in already) {
        report.notes.push(
          `${view.id} was not adopted, though Mole Office's own session hook wrote down a record for it: ` +
            `${already.refused}. Nothing was written onto that one.`,
        )
      }
      const matched =
        record !== null || adopting !== null || directory === null ? null : resolveProject({ id: '', stated: false }, directory)
      if (record === null && adopting === null && (matched === null || matched.kind !== 'matched')) {
        report.where.push({
          conversation: view.id,
          directory,
          action: 'not filed',
          project: null,
          because:
            matched === null
              ? 'No working directory was read from its log, so no project can be said to hold it. It was not filed.'
              : `${matched.because} It was not filed.`,
        })
        continue
      }
      const workspaceId = record?.workspaceId ?? adopting?.workspaceId ?? (matched as { id: string }).id
      const recordId = record?.id ?? adopting?.id ?? null

      if (recordId === null) {
        report.where.push({
          conversation: view.id,
          directory,
          action: 'filed',
          project: workspaceId,
          because: (matched as { because: string }).because,
        })
        if (dryRun) continue
        const made = ensureSessionRecord(view, actor, workspaceId, env)
        if (made.created) opts.onWrite?.()
        report.created += 1
        report.notes.push(
          `created "${made.record.title}" in ${workspaceId} for ${view.id} — ${view.state}` +
            (state === null ? ' (no `state` stored: that word is not one a session record may hold)' : ''),
        )
        continue
      }
      report.where.push({
        conversation: view.id,
        directory,
        action: 'observed',
        project: workspaceId,
        because:
          adopting !== null
            ? `Mole Office's own session hook wrote down the record ${adopting.id} for it, in ${workspaceId}.`
            : `It already has the record ${recordId}, in ${workspaceId}.`,
      })
      if (dryRun) continue
      if (adopting !== null) {
        report.adopted += 1
        report.notes.push(
          `${view.id} is the run already filed as "${adopting.title}" (${adopting.id}) — Mole Office's own session hook ` +
            'wrote that pair down when it filed the record. It can be picked up now, and no second record was filed.',
        )
      }

      // Read once here: the doing line and the stored state below are both decided against it.
      const stored = getRecord(recordId)
      const doing = theDoingLineDiscoveryMayWrite(stored, view.doing)

      // Observation only. Title and summary are absent from this patch on purpose, and that absence
      // is the promise made at the top of this file. `doing` is in it only when the record's doing
      // line is discovery's own or there is none.
      const patch: Record<string, unknown> = {
        // null DELETES the key in a merge patch, which is what is wanted for a state that cannot be
        // stored: a stale `running` left behind from the last sweep would be a page reporting a dead
        // session as alive, which is the exact failure this file is against. See storableState.
        state: state,
        ...(doing.write ? { doing: doing.line } : {}),
        lastOutputAt: view.lastActivityAt,
        // A fresh observation with no offset must not leave an older instant beside its wall time.
        lastOutputTime: view.lastActivityTime ?? null,
        lastOutputTimeSource: view.lastActivityTime == null ? null : 'transcript-timestamp',
        // The stamp remembers the doing line discovery wrote, and forgets it (null deletes the key)
        // when discovery wrote none, so a line somebody else set is never mistaken for its own.
        extra: { [DISCOVERY_KEY]: { ...stampFor(view, at), [DOING_DISCOVERY_WROTE]: doing.write ? doing.line : null } },
      }

      // AN END THE SWEEP SEES IS THE OFFICE'S OBSERVATION, NOT THE CALLER'S ACT. The caller only asked the office to
      // look; the office read the transcript and found no process. Ending a run revokes its key, and the guard on that
      // (`assertMayEndARun` in lib/records.ts, problem FZQflYp1vHuY) lets the office end a run and lets a caller end
      // only the runs it answers for. So a patch that moves the run to an end is written as the office; every other
      // observation stays under the caller who asked for the sweep.
      const storedState = (stored?.data as Record<string, unknown> | undefined)?.['state']
      const endsTheRun = !theRunHasEnded(storedState) && theRunHasEnded(state)
      const result = patchRecord(recordId, { dataPatch: patch }, endsTheRun ? theOfficeObserving() : actor)
      if (result.newSeq !== null) opts.onWrite?.()
      const outcome = result.dataPatch

      // `extra.discovered.at` changes on every sweep and would make every session look changed. The
      // question being answered is "did anything about the SESSION move", so the timestamp of the
      // stamp itself does not count as movement.
      const changed = outcome?.changed ?? []
      const moved = changed.filter((p) => !p.endsWith(`.${DISCOVERY_KEY}.at`))
      const removed = outcome?.deleted ?? []

      // An adoption always writes — the record had no stamp and now has one — and it is counted as an
      // adoption and not as an update, so the two events stay separate on the report.
      if (adopting !== null) continue

      if (moved.length === 0 && removed.length === 0) {
        report.unchanged += 1
        // Counting the write that the word "unchanged" would otherwise hide. `changed` is what
        // patchRecord actually wrote, and it is non-empty here whenever the stamp's own clock moved
        // -- which is every sweep that does not land in the same second as the one before it.
        if (changed.length > 0) report.stampOnly += 1
        continue
      }
      report.updated += 1
      report.notes.push(
        `${view.id} is ${view.state}: ${[...moved, ...removed.map((p) => `${p} (cleared)`)].join(', ')}`,
      )
    }
  }

  return report
}

/**
 * The project of the record Mole Office's own session hook wrote down for a conversation, or an empty string when there
 * is no such record. `recordAlreadyFiledFor` then refuses the pair in words (missing, deleted, not a session, already
 * naming a conversation), so a pair is adopted only where its record really is.
 */
function projectOfThePairedRecord(externalId: string, pairs: Map<string, string>): string {
  const id = pairs.get(externalId)
  return id === undefined ? '' : (getRecord(id)?.workspaceId ?? '')
}

// ------------------------------------------------ what a finished run says about its conversation

/**
 * What writing a run's conversation onto its session record did. Never silent, either way.
 */
export interface RunStamped {
  /** True when the record's discovery stamp was written or refreshed. */
  written: boolean
  /** The conversation the stamp names now, or null when nothing was written. */
  externalId: string | null
  /** The transcript that was found on this machine, or null when none was. */
  logPath: string | null
  /** What happened and why, in one sentence a person can read. */
  says: string
}

/**
 * ---------------------------------------------------------------------------------------
 * THIS IS ALSO THE ONLY WAY TO TELL AN EXISTING RECORD WHICH CONVERSATION IT IS
 * ---------------------------------------------------------------------------------------
 *
 * Written down here on 19 August 2026 because the measurement below says it is the whole of the
 * routing problem, and nothing in the product calls this function except a run finishing.
 *
 * MEASURED ON A COPY OF THE OWNER'S CORPUS. All 92 of its session records carried no conversation,
 * so every recipient Mole Office could rank answered "cannot be picked up", for all 326 records in the
 * corpus. Running a discovery sweep does NOT fix that: a sweep matches a transcript to a record by
 * `tool:externalId`, no record holds either, so the sweep filed 40 NEW records — one per transcript
 * on this machine — and left the 92 exactly as they were. Reachable recipients went from 0 to 0.
 *
 * WHAT DID FIX IT was calling this function once for each pair of (session record, conversation)
 * that Mole Office's own session hook had written into `.logs/session-<conversation>.json`. Five such
 * pairs survive on this machine. Adopting those five took the records with at least one reachable
 * agent from 0 to 161 of 197 in the `panelx` project, because the five include the runs that did
 * most of the writing.
 *
 * THE PAIR HAS TO BE WRITTEN DOWN WHEN THE RUN IS FILED, or it is lost. `tools/session-hook.mjs`
 * has the conversation id and the transcript path in its own input at session start, files the
 * record, and writes neither onto it. That is the one change that stops this corpus growing more
 * unreachable runs; this function is what repairs the ones already filed, one at a time, and only
 * for the pairs somebody can still evidence.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FINISHED RUN WRITES A DISCOVERY STAMP AT ALL — the defect, measured 18 August 2026
 * ---------------------------------------------------------------------------------------
 *
 * You could not reply to the agent that had just answered you, which is the routing feature failing
 * on its most obvious case. A run comes back carrying `runtime.sessionId` — the tool's own id for
 * the conversation that produced the answer — and the transcript is on this machine. Nothing wrote
 * that anywhere, so the session record the run belongs to still named whatever conversation it
 * named before, and `pickUpOf` in lib/recipients.ts answered off that. Worse, a later discovery
 * sweep matches records on `tool:externalId` and found nothing for the new conversation, so it
 * filed a SECOND session record for it — one real conversation with two records, the resumable one
 * connected to no work and the connected one out of date.
 *
 * ---------------------------------------------------------------------------------------
 * THE TRANSCRIPT PATH IS LOOKED FOR, NEVER ASSEMBLED
 * ---------------------------------------------------------------------------------------
 *
 * `stampOf` treats a stamp with no `logPath` as absent, and `pickUpOf` reads that path to decide
 * whether a conversation can be picked up. So a stamp naming a file that is not there would rebuild
 * the same defect one layer down: the product would say a run is resumable and a worker would find
 * nothing. This function therefore asks the ADAPTER to discover what is really on this machine and
 * uses the path of the conversation it finds. **When the adapter finds no such conversation nothing
 * is written and this says so.** A path built by hand out of a home directory and an id would be a
 * guess, and invariant 5 of USER.md is that absence beats one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES AND WHAT IT LEAVES ALONE
 * ---------------------------------------------------------------------------------------
 *
 * The discovery stamp, and nothing else. `syncSessions` also refreshes `state` and `lastOutputAt`,
 * and a doing line nobody else set, because a sweep is an observation of every session at one moment; this is one
 * answer arriving, and rewriting a state word from it would make the record say something about
 * the run that nobody looked for. The stamp itself carries `observedState` and its own reason, so
 * what was seen is recorded without any of it being copied onto keys a person edits.
 *
 * REFRESHING A STAMP THAT ALREADY NAMES A DIFFERENT CONVERSATION IS DELIBERATE, and it is the case
 * that fixes replying twice. Picking a Claude Code conversation up again can produce a new
 * conversation id, so the run that answered you is not the conversation the record named when it
 * was dispatched. Leaving the old id there means the next reply resumes the conversation as it was
 * BEFORE it answered — the agent has never heard the exchange you are replying to. The old
 * transcript is not touched; only which one this record points at changes.
 */
export function stampFinishedRun(
  recordId: string,
  tool: string,
  externalId: string,
  actor: Actor,
  env: AdapterEnv = defaultEnv(),
): RunStamped {
  const record = getRecord(recordId)
  if (record === null || record.deletedAt !== null) {
    return {
      written: false,
      externalId: null,
      logPath: null,
      says: 'The run this answer belongs to has no record any more, so there was nothing to write the conversation onto.',
    }
  }
  if (record.kind !== 'session') {
    return {
      written: false,
      externalId: null,
      logPath: null,
      says:
        `The run this answer belongs to is filed as a ${record.kind} rather than a session, so nothing was ` +
        'written onto it. Only a session record carries a conversation.',
    }
  }
  const adapter = adapterFor(tool)
  if (adapter === null) {
    return {
      written: false,
      externalId: null,
      logPath: null,
      says:
        `This build of Mole Office cannot read "${tool}" transcripts, so it could not check that the conversation ` +
        'this answer came from is on this machine and wrote nothing down about it.',
    }
  }
  const found = adapter.discover(env)
  const observed = found.sessions.find((one) => one.externalId === externalId) ?? null
  if (observed === null) {
    return {
      written: false,
      externalId: null,
      logPath: null,
      says:
        `The conversation this answer came from is not on this machine — ${adapter.looksIn(env)} was searched ` +
        'and it is not there — so nothing was written onto the run. Mole Office does not write down a transcript it ' +
        'has not found.',
    }
  }
  const before = stampOf(record)
  const result = patchRecord(
    recordId,
    { dataPatch: { extra: { [DISCOVERY_KEY]: stampFor(observed, localStamp(env.now)) } } },
    actor,
  )
  const moved = (result.dataPatch?.changed ?? []).filter((path) => !path.endsWith(`.${DISCOVERY_KEY}.at`))
  return {
    written: true,
    externalId: observed.externalId,
    logPath: observed.logPath,
    says:
      before === null
        ? `This run can be picked up again now. Mole Office found the conversation it came from on this machine and ` +
          'wrote it down, so a reply reaches the same agent.'
        : before.externalId === observed.externalId
          ? `This run can still be picked up again. It came from the conversation the record already named` +
            `${moved.length === 0 ? ', and nothing about it moved' : ''}.`
          : 'This run now points at the conversation that answered you, which is a different one from the ' +
            'conversation it was picked up from. A reply reaches the agent as it is now rather than as it was ' +
            'before it answered. Nothing was deleted: the earlier transcript is still on this machine.',
  }
}

// ---------------------------------------------------------------------------- linking

/** What linking a session to a record produced. */
export interface SessionLinkResult {
  linkId: string
  /** The session's record. Created by this call when the session had never been filed. */
  sessionRecordId: string
  /** True when this call is what filed the session. Said out loud so nothing appears unexplained. */
  createdSessionRecord: boolean
  type: LinkType
  /** The record at the other end. */
  toId: string
  /**
   * Where the run stands AFTER this link, and why.
   *
   * The whole reason this is here: an agent linked its session to the block it was about to work
   * on, was answered `201` with a sentence saying the association existed, and the run was placed
   * nowhere — nothing in the reply could have told it. A link that places the run says which
   * project it landed in; a link that does not place it says that too, and carries the request
   * that would.
   */
  placement: Placement
  note: string
}

/** The refusal for an id that names no session to link. The door answers a message the caller may not read with it too. */
export function noSessionToLinkHasThisId(id: string): PanelError {
  return new PanelError(
    `No session with id ${id}. GET /api/sessions lists every session Mole Office can see, each with the id ` +
      `to use here.`,
    404,
  )
}

/**
 * Link a session to a record it worked on.
 *
 * This is the reason sessions are records rather than a side table: once a session is a record,
 * "which session broke this" and "what did this session touch" are the same backlink query
 * everything else already uses, and the change log, the link panel and the record page all work
 * on it without being taught anything.
 *
 * A session that has been seen but never filed is filed here rather than refused. Refusing would
 * hand the caller an id the list just gave them and tell them it is not real; the result says a
 * record was created, so nothing is silent about it.
 */
export function linkSession(
  id: string,
  target: { toId?: string; toTitle?: string; type: LinkType },
  actor: Actor,
  workspaceId: string,
  env: AdapterEnv = defaultEnv(),
  // WHO IS ASKING, handed to `linkByTitle` so a far end typed as a name is never a message this reader
  // may not read. The door refuses such a message named by its id itself.
  reader?: AMessageReader,
): SessionLinkResult {
  const { sessionId, record, created } = theSessionToLink(id, actor, workspaceId, env)

  // THE FAR END IS RESOLVED ONCE, BY WHOEVER RESOLVED IT. This used to make the link and then look
  // the same title up a SECOND time to say what had been linked — one fact worked out in two
  // places, and once titles may repeat the second lookup is a different question with a different
  // answer. `linkByTitle` hands back the record its own resolution chose.
  let linkId: string
  let other: PanelRecord | null
  if (target.toTitle !== undefined) {
    const made = linkByTitle(record.id, target.toTitle, target.type, actor, record.workspaceId, undefined, reader)
    linkId = made.id
    other = made.to
  } else {
    const toId = target.toId ?? ''
    linkId = createLink({ fromId: record.id, toId, type: target.type, actor }).id
    other = getRecord(toId)
  }
  if (other === null) throw new PanelError('The link was made but its other end could not be read back', 500)

  // Read AFTER the link is made, so what comes back is what the caller has just done rather than
  // what was true a moment before it.
  const placement = sessionPlacement(sessionId, record.id, workspaceId)

  return {
    linkId,
    sessionRecordId: record.id,
    createdSessionRecord: created,
    type: target.type,
    toId: other.id,
    placement,
    note:
      (created
        ? `This session had not been filed, so a session record "${record.title}" was created for it. `
        : '') +
      `"${record.title}" now ${linkPhrase(target.type)} "${other.title}". ` +
      // The sentence names the project itself, so the label does not name it a second time.
      (placement.kind === 'in'
        ? `Where this run is now filed: ${placement.primary.sentence}`
        : `${placement.sentence} ${placement.howToPlace}`),
  }
}

/**
 * THE SESSION A LINK IS MADE FROM: the id the sweep gives it, its record, and whether that record was filed just now.
 *
 * AN ID THAT IS A LIVE SESSION RECORD FILED IN THIS PROJECT IS READ AS THAT RECORD, WITHOUT THE SWEEP. The sweep gives
 * every such record a row whose record id is that id, and no other row has that id: a run's own id is its tool, a colon
 * and its conversation, and a record with no stamp has a row of its own id. A link reads of that row only its record,
 * which is already filed, and its id: the stamp's `<tool>:<externalId>`, which a log is matched to the record by and
 * which the adapter gives the log, or the record's own id when it has no stamp. The sweep reads every run of the project
 * and every transcript on this computer. On the made-up office at the 22 October scale, with every run in one project and
 * no transcript on disk, a link took 142 ms and 14,624 statements, and takes 22 ms and 33 statements this way (wave 13y
 * round 107). Any other id is found by the sweep, as `getSession` finds it, but without working out where every run
 * stands (wave 13y round 109).
 */
function theSessionToLink(id: string, actor: Actor, workspaceId: string, env: AdapterEnv): { sessionId: string; record: PanelRecord; created: boolean } {
  const filed = id.includes(':') ? null : getRecord(id)
  if (filed !== null && filed.kind === 'session' && filed.workspaceId === workspaceId && filed.deletedAt === null) {
    const stamp = stampOf(filed)
    return { sessionId: stamp === null ? filed.id : theSessionIdOfAStamp(stamp), record: filed, created: false }
  }
  // THE SWEEP WITHOUT WHERE EVERY RUN STANDS. The link reads of the row only what the log and its record give, and says
  // where its own run stands afterwards from that run's own links and writes.
  const view = sweepSessions(workspaceId, env, { placement: false }).sessions.find((s) => isSessionId(s, id)) ?? null
  if (view === null) throw noSessionToLinkHasThisId(id)
  return { sessionId: view.id, ...ensureSessionRecord(view, actor, workspaceId, env) }
}

/** A stamped run's session id, `<tool>:<externalId>`: the key the sweep matches a log to its record by. */
function theSessionIdOfAStamp(stamp: DiscoveryStamp): string {
  return `${stamp.tool}:${stamp.externalId}`
}

function linkPhrase(type: LinkType): string {
  return type === 'relates_to' ? 'relates to' : type.replace(/_/g, ' ')
}

// ------------------------------------------------------------------ what a session actually did

/** One record a session wrote to, and how much of it was that session's doing. */
export interface SessionWorkRecord {
  id: string
  kind: RecordKind
  title: string
  /** Change rows this session made on it. */
  rows: number
  /** The first and last of those rows, so "when was this session in here" is answerable. */
  firstAt: string
  lastAt: string
  /** True when this session is the one that filed the record in the first place. */
  created: boolean
  /** True when the record has since been deleted. It is still what the session did. */
  deleted: boolean
}

/**
 * What one session did: the records it wrote, the records it only touched, and its change rows.
 *
 * This is one half of the question Mole Office exists to answer. The other half -- "which session did
 * this to my record" -- is the `sessions` block on GET /api/changes, computed from the same
 * column by the same resolver, so the two answers cannot disagree.
 */
export interface SessionWork {
  /** What the reference given turned out to mean, and how it matched. */
  ref: SessionRef
  /** Records this session created. */
  wrote: SessionWorkRecord[]
  /** Records it changed without creating them. */
  touched: SessionWorkRecord[]
  /** Its change rows, newest first, capped -- see `note` when the cap was reached. */
  changes: Change[]
  subtraction: LeftOutCounts
  leftOutGroups: LeftOutGroup<SessionWorkBucket>[]
  counts: {
    changes: number
    wrote: number
    touched: number
    /**
     * Rows still stored under a run name rather than this session's record id.
     *
     * Nonzero means the log has not been migrated since this session was filed. The rows are
     * still found -- the filter matches both spellings -- but the number is reported rather than
     * hidden, because it is the difference between "this joins to the record" and "this happens
     * to be a matching string".
     */
    storedByName: number
  }
  note: string
}

/** How many change rows one call will look at. A local single-user log does not reach this. */
const WORK_SCAN_LIMIT = 5000

/**
 * EVERY ID THE CHANGE ROWS STORED UNDER THESE SESSION VALUES NAME, so the reader's rule can be asked of the messages
 * among them alone, and not of every message in the office.
 *
 * IT MUST COVER `aChangeNamingNoneOf` IN lib/records.ts, the rule that leaves out a row naming a message the reader may
 * not read. A row names a message in four ways there: as the record it is about, as its old value, as its new value,
 * and as a string inside the old or the new value of a row logged under a run's honour reading. So this gives the record
 * of every row, each old or new value that is a message's id, and each string inside an honour row's values, opened as
 * that rule opens them. A longer list is safe: an id that is no message, or names a message the reader may read, costs
 * only time. A shorter one would leave in a row that names a message the reader may not read. For that reason it reads
 * every row stored under the values, in any project, and not only the rows `listChanges` gives.
 */
export function theIdsTheChangeRowsOfASessionName(values: readonly string[]): string[] {
  if (values.length === 0) return []
  const log = theChangeLog
  const ofTheSession = inArray(log.sessionId, [...values])
  // A VALUE THAT IS A MESSAGE'S ID, asked of the records table by its key.
  const aMessage = (value: typeof log.oldValue | typeof log.newValue) =>
    sql`EXISTS (SELECT 1 FROM ${records} WHERE ${records.id} = ${value} AND ${theKindOfARowFoundById('message')})`
  const inTheHonour = sql`coalesce(${log.field}, '') LIKE ${`data.${THE_HONOUR_KEY}%`}`
  const quoted = (value: typeof log.oldValue | typeof log.newValue) =>
    sql`SELECT one.atom FROM ${log}, json_tree(CASE WHEN json_valid(${value}) THEN ${value} ELSE '[]' END) AS one WHERE ${ofTheSession} AND ${inTheHonour} AND one.type = 'text'`
  return db
    .all<{ id: string }>(
      sql`SELECT ${log.recordId} AS id FROM ${log} WHERE ${ofTheSession}
        UNION SELECT ${log.oldValue} FROM ${log} WHERE ${ofTheSession} AND ${aMessage(log.oldValue)}
        UNION SELECT ${log.newValue} FROM ${log} WHERE ${ofTheSession} AND ${aMessage(log.newValue)}
        UNION ${quoted(log.oldValue)}
        UNION ${quoted(log.newValue)}`,
    )
    .map((row) => row.id)
}

/**
 * THE MESSAGES A SESSION'S CHANGE ROWS NAME THAT THIS READER MAY NOT READ, as `sessionWork` takes them in `hidden`. It
 * leaves out the same rows as every message the reader may not read (`everyMessageHiddenFrom`), because a row that
 * names no message among them names none of those either. MEASURED on the made-up office at the scale of 22 October
 * 2026, for an agent who may not read 37,796 of its messages: working out that whole list took 255 ms, and the detail
 * of a run took 331 ms with it and 38 ms with this (wave 13y round 103).
 */
export function theMessagesASessionsRowsNameHiddenFrom(reader: AMessageReader, ref: string, workspaceId: string): string[] {
  if (reader.readsEveryMessage) return []
  const named = theIdsTheChangeRowsOfASessionName(sessionFilterValues(resolveSessionRef(ref, workspaceId)))
  return [...theMessagesHiddenFrom(reader, named)]
}

/**
 * Everything one session did, by record id, by run name, or by the title of its record.
 *
 * A reference nothing answers to is not an error: it comes back with `ref.matchedBy` of
 * `unresolved` and whatever rows carry that exact string, which is the honest answer for a run
 * that wrote things and was never filed.
 */
export function sessionWork(
  ref: string,
  workspaceId: string,
  limit = 200,
  // MESSAGES THE READER MAY NOT READ, as a decision says.
  // `everyMessageHiddenFrom`: no change row
  // naming one is read, so none is listed, counted or titled here. Empty for a reader who reads all.
  hidden: readonly string[] = [],
): SessionWork {
  const resolved = resolveSessionRef(ref, workspaceId)
  const values = sessionFilterValues(resolved)
  const rows = listChanges({ workspaceId, session: values, limit: WORK_SCAN_LIMIT, hidden })

  const byRecord = new Map<string, { rows: number; firstAt: string; lastAt: string; created: boolean }>()
  let storedByName = 0
  for (const row of rows) {
    if (resolved.recordId !== null && row.sessionId !== resolved.recordId) storedByName += 1
    const seen = byRecord.get(row.recordId)
    if (seen === undefined) {
      byRecord.set(row.recordId, {
        rows: 1,
        firstAt: row.at,
        lastAt: row.at,
        created: row.op === 'create',
      })
      continue
    }
    seen.rows += 1
    // listChanges hands rows back newest first, so every row after the first is older.
    seen.firstAt = row.at
    if (row.op === 'create') seen.created = true
  }

  const wrote: SessionWorkRecord[] = []
  const touched: SessionWorkRecord[] = []
  for (const [id, seen] of byRecord) {
    const record = getRecord(id)
    // A change row whose record has been hard-removed should not exist -- deletes are soft -- so
    // if one turns up it is reported as what it is rather than dropped from the count.
    const entry: SessionWorkRecord = {
      id,
      kind: record?.kind ?? 'note',
      title: record?.title ?? `(no record ${id} any more)`,
      rows: seen.rows,
      firstAt: seen.firstAt,
      lastAt: seen.lastAt,
      created: seen.created,
      deleted: record?.deletedAt != null,
    }
    ;(seen.created ? wrote : touched).push(entry)
  }
  const byRecency = (a: SessionWorkRecord, b: SessionWorkRecord) => b.lastAt.localeCompare(a.lastAt)
  wrote.sort(byRecency)
  touched.sort(byRecency)

  const capped = rows.length >= WORK_SCAN_LIMIT
  const changes = toChanges(rows.slice(0, Math.max(1, Math.trunc(limit))))
  const leftOut = rows.length - changes.length
  const leftOutGroups: LeftOutGroup<SessionWorkBucket>[] = [{
    cause: 'budget',
    bucket: 'change_limit',
    count: leftOut,
    ids: rows.slice(changes.length).map((row) => row.id),
  }]
  const subtraction: LeftOutCounts = {
    candidates: rows.length,
    carried: changes.length,
    leftOut,
    shortened: 0,
    // AT THE SCAN LIMIT THE COUNTS ARE A LOWER BOUND: rows past WORK_SCAN_LIMIT were never read, so neither were they
    // counted.
    atLeast: capped,
  }
  checkSubtraction('sessionWork changes', subtraction, leftOutGroups)
  return {
    ref: resolved,
    wrote,
    touched,
    changes,
    subtraction,
    leftOutGroups,
    counts: { changes: rows.length, wrote: wrote.length, touched: touched.length, storedByName },
    note:
      (resolved.recordId === null
        ? `Nothing is filed as the session "${resolved.asked}", so this is only what was written under that ` +
          `name: ${resolved.why} `
        : `"${resolved.title}" (${resolved.recordId}) matched by ${resolved.matchedBy}` +
          (resolved.names.length > 0 ? `, also known as ${resolved.names.join(', ')}` : '') +
          '. ') +
      `${rows.length} change row${rows.length === 1 ? '' : 's'}, ${wrote.length} record${wrote.length === 1 ? '' : 's'} ` +
      `written and ${touched.length} touched.` +
      (storedByName > 0
        ? ` ${storedByName} of those rows still store a run name rather than this record's id — ` +
          `POST /api/sessions/discover repoints them and says which.`
        : '') +
      (capped ? ` Stopped at ${WORK_SCAN_LIMIT} rows, so the counts are a floor, not a total.` : ''),
  }
}

// ------------------------------------------------------- the log's own session column, migrated

/** A run name that now points at the session record it always meant. */
export interface MigratedSessionName {
  name: string
  recordId: string
  title: string
  /** `title` = the record is called exactly that. `titlePrefix` = the name is its first segment. */
  matchedBy: 'title' | 'titlePrefix'
  rows: number
}

/**
 * A stored value that names a session record filed in ANOTHER project.
 *
 * Not dangling and not migratable. Moving a record carries its change rows and never the session
 * that wrote them — the rule is in lib/move.ts — so these rows are correct, and they are correct
 * about a session this project may not read. Reporting them as names nothing answers to would send
 * somebody looking for a session record to file that already exists, and the honest offer ("bind the
 * name") would be an offer to attribute another project's run to a record of this one.
 */
export interface SessionNamedElsewhere {
  /** The value stored on the rows: the session record's id. */
  name: string
  rows: number
  /** The project that session is filed in. */
  workspaceId: string
}

/** A run name nothing answers to, with whatever could be offered instead. */
export interface DanglingSessionName {
  name: string
  rows: number
  why: string
  /** Session records a person might mean, when the guess was not certain enough to make. */
  candidates: { recordId: string; title: string }[]
}

/** What one pass over `changes.session_id` found and what it moved. */
export interface SessionLogMigration {
  /** Distinct values in the column. */
  scanned: number
  /** Values that are already a session record's id. Nothing to do for these. */
  alreadyRecordIds: number
  /** Values already bound to a record by an earlier pass or by a session filing itself. */
  alreadyNamed: number
  migrated: MigratedSessionName[]
  dangling: DanglingSessionName[]
  /** Values naming a session filed in another project. Right already, and none of this pass's business. */
  namedElsewhere: SessionNamedElsewhere[]
  rowsRepointed: number
  /** False for a dry run: everything below was worked out and nothing was written. */
  applied: boolean
  note: string
}

/** The separator Mole Office titles sessions with: "baseline · transplant replay sweep". */
const TITLE_SEPARATOR = ' · '

/**
 * Point the change log's session column at session records, and say what could not be pointed.
 *
 * WHY THIS EXISTS: rows written before this rule did what everyone's rows did -- they stored
 * whatever string the caller sent. Leaving them is a log that answers "which session" with a word
 * that joins to nothing; rewriting them without a word to anybody is a migration that could
 * silently file one run's work under another. So this resolves only what it can defend, reports
 * every match BEFORE it is relied on (`apply: false` gives the same report and writes nothing),
 * and names every value it could not resolve together with the session records that might be
 * meant.
 *
 * The one match this makes that the write path will not: a name that is the first segment of a
 * session's title, which is how sessions are titled here ("baseline · transplant replay sweep" for
 * the run called "baseline"). It is safe HERE because it is reported to a person and because an
 * ambiguous prefix -- two sessions starting the same way -- is refused rather than guessed. It is
 * not safe on the write path, where nobody would see it.
 */
export function migrateChangeSessions(
  actor: Actor,
  workspaceId: string,
  opts: { apply?: boolean; onWrite?: () => void } = {},
): SessionLogMigration {
  const apply = opts.apply !== false
  const stored = storedSessionRefs(workspaceId)
  const sessions = listRecords({ workspaceId, kind: 'session', includeDeleted: true })

  const report: SessionLogMigration = {
    scanned: stored.length,
    alreadyRecordIds: 0,
    alreadyNamed: 0,
    migrated: [],
    dangling: [],
    namedElsewhere: [],
    rowsRepointed: 0,
    applied: apply,
    note: '',
  }

  for (const { stored: value, rows } of stored) {
    const ref = resolveSessionRef(value, workspaceId)
    if (ref.matchedBy === 'recordId') {
      report.alreadyRecordIds += 1
      continue
    }
    // A session of another project, which is what a move leaves behind on purpose. Tested on the
    // FIELD rather than on `matchedBy`, because the field is what carries the project id this line
    // reports and a branch that read one and reported the other would be two facts with nothing
    // making them agree.
    if (ref.elsewhereIn !== null) {
      report.namedElsewhere.push({ name: value, rows, workspaceId: ref.elsewhereIn })
      continue
    }
    if (ref.matchedBy === 'name') {
      // A binding exists and these rows still carry the name: repoint them.
      if (ref.recordId !== null) {
        if (apply) {
          const done = bindSessionName(ref.recordId, value, actor)
          if (done.bindingWritten || done.repointed > 0) opts.onWrite?.()
          report.rowsRepointed += done.repointed
        } else {
          report.rowsRepointed += rows
        }
        report.alreadyNamed += 1
      }
      continue
    }
    if (ref.matchedBy === 'title' && ref.recordId !== null) {
      if (apply) {
        const done = bindSessionName(ref.recordId, value, actor)
        if (done.bindingWritten || done.repointed > 0) opts.onWrite?.()
        report.rowsRepointed += done.repointed
      } else {
        report.rowsRepointed += rows
      }
      report.migrated.push({ name: value, recordId: ref.recordId, title: ref.title ?? value, matchedBy: 'title', rows })
      continue
    }

    const prefixed = sessions.filter((s) => s.title.split(TITLE_SEPARATOR)[0] === value)
    if (prefixed.length === 1) {
      const target = prefixed[0] as PanelRecord
      if (apply) {
        const done = bindSessionName(target.id, value, actor)
        if (done.bindingWritten || done.repointed > 0) opts.onWrite?.()
        report.rowsRepointed += done.repointed
      } else {
        report.rowsRepointed += rows
      }
      report.migrated.push({
        name: value,
        recordId: target.id,
        title: target.title,
        matchedBy: 'titlePrefix',
        rows,
      })
      continue
    }

    report.dangling.push({
      name: value,
      rows,
      why:
        prefixed.length > 1
          ? `${prefixed.length} session records are titled "${value}${TITLE_SEPARATOR}…", so there is no single ` +
            `one this name can mean. Picking one would file this run's work under a coin toss.`
          : `no session record is called "${value}", is titled "${value}${TITLE_SEPARATOR}…", or has ever been ` +
            `bound to that name. The rows keep the name, which is the only thing known about who wrote them.`,
      candidates: prefixed
        .slice(0, 5)
        .map((s) => ({ recordId: s.id, title: s.title })),
    })
  }

  const moved = report.migrated.length
  const elsewhereRows = report.namedElsewhere.reduce((n, e) => n + e.rows, 0)
  report.note =
    `${report.scanned} distinct session reference${report.scanned === 1 ? '' : 's'} in the change log: ` +
    `${report.alreadyRecordIds} already a record id, ${report.alreadyNamed} already bound to one, ` +
    `${moved} newly resolved, ` +
    (report.namedElsewhere.length === 0
      ? ''
      : `${report.namedElsewhere.length} naming a session filed in another project, `) +
    `${report.dangling.length} that nothing answers to. ` +
    (apply
      ? `${report.rowsRepointed} row${report.rowsRepointed === 1 ? '' : 's'} now carry a record id.`
      : // "Nothing was written" is what this said, and it is only true of the change log. The
        // sweep half of POST /api/sessions/discover runs on a dry run too and files session
        // records, so a caller reading this sentence in that reply was told nothing happened by
        // the same response that reported 35 records created. Say which half is held back.
        `No change row was repointed: this was a dry run, and ${report.rowsRepointed} row` +
        `${report.rowsRepointed === 1 ? ' would move' : 's would move'}.`) +
    (report.dangling.length > 0
      ? ` The unresolved ones are listed with their row counts — file the session record, or bind the name ` +
        `by filing a session record while writing under it, and run this again.`
      : '') +
    (report.namedElsewhere.length === 0
      ? ''
      : ` ${elsewhereRows} row${elsewhereRows === 1 ? '' : 's'} name a session record filed in ` +
        `${[...new Set(report.namedElsewhere.map((e) => `"${e.workspaceId}"`))].join(', ')}. Those rows are ` +
        `already right and nothing here will touch them: moving a record carries its change log and leaves the ` +
        `session that wrote it where it is, so the id they carry is the run that really did the work.`)
  return report
}

// --------------------------------------------------------------------------- one run, as a timeline

/**
 * ONE RUN'S OWN CALLS, READ BACK IN TIME ORDER, WITH ITS POLLS FOLDED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A READ OVER `api_calls` AND NOT A PAGE OVER THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * The office records every flow operation itself: one row per request in `api_calls`, with the
 * session header on it (design/REVIEW-2026-09-07.md), as a message says. A
 * run that polled 3,000 times wrote 3,000 rows, so the raw list is unreadable —
 * and its polls are not work. So consecutive calls of the same operation, asking the same question,
 * all answered, become ONE entry with a count and a span, and a run of a thousand polls reads as a
 * line that says how many asks it was.
 *
 * FOLDED HERE AT READ TIME, NOT AT WRITE TIME. Write-time folding was the next step and stops
 * where the schema stops: folding into a previous row needs somewhere to keep a count, and
 * `api_calls` has no column for one and this worker may not add a migration. Nothing on the
 * recorder changes; the recorder keeps one row per call and its own hourly fold for the counted
 * operations, and this reading folds on top of what is stored.
 *
 * WHAT IS FOLDED AND WHAT NEVER IS. Only calls that were answered: a 200 each side, the same
 * operation, the same effect, the same target, the same purpose. A refused call — or a call of a
 * different operation, or one that reached at a different record — sits between two polls and
 * breaks the run, on the same ruling recorded for the hourly fold: the refusal is the
 * evidence a person needs, and folding it would hide it.
 */

/** How many `api_calls` rows one timeline read will walk before it stops and says so in the note. */
const TIMELINE_CALL_LIMIT = 20_000

/** How many change rows one timeline read will list. */
const TIMELINE_CHANGE_LIMIT = 2_000

/** One thing a call reached: the record's kind, id and title, where the record still exists. */
export interface TimelineTarget {
  /** The kind the record has now, or the kind the route declared when the store had none. */
  kind: string | null
  /** The id the route named. */
  id: string
  /** The record's title, or null when nothing answers to the id any more. */
  title: string | null
}

/** One call, carried whole. */
export interface TimelineCallEntry {
  type: 'call'
  /** Local wall clock, rendered at read time from the stored epoch milliseconds. */
  at: string
  /** The semantic operation, or null on a call that matched no route at all. */
  operation: string | null
  effect: string | null
  target: TimelineTarget | null
  /** Why the caller said it asked, out of the closed list. */
  purpose: string | null
  ms: number
  bytes: number | null
  status: number
}

/**
 * A run of identical answered polls, carried as one line.
 *
 * `count` is how many calls it stands for; `first` and `last` are the span, both rendered local
 * wall-clock; `ms` and `bytes` are the sums.
 */
export interface TimelineFoldEntry {
  type: 'folded'
  operation: string
  effect: string | null
  target: TimelineTarget | null
  purpose: string | null
  count: number
  first: string
  last: string
  ms: number
  bytes: number | null
}

export interface TimelineChangeEntry {
  at: string
  op: string
  recordId: string
  recordKind: string | null
  recordTitle: string | null
  field: string | null
}

export interface SessionTimeline {
  ref: SessionRef
  /**
   * THE RUN, AS THE SESSION RECORD NAMES IT.
   *
   * Every field is exactly what the record holds, and null where nobody wrote: a run filed before a
   * field existed carries null there, never a guess. `agent` is the durable agent the record's
   * `servingAgent` names, falling back to the first entry of `ranAs`, because an older record carries
   * one and not the other.
   */
  run: {
    recordId: string | null
    title: string | null
    agent: string | null
    ranAs: unknown | null
    model: string | null
    runtime: string | null
    state: string | null
    started: string | null
    ended: string | null
    /**
     * WHICH FLOW THIS RUN RAN, as the starter wrote it on the session record. It is written into the
     * record's summary — the field the session kind already calls the session's purpose, which
     * discovery seeds once and never overwrites and GET /api/sessions already serves as
     * `recordedPurpose` — because no field of this kind names it better and the run's brief is what
     * the flow is the name of. Null when nobody said, which is every run filed before this doorway.
     */
    flow: string | null
  }
  entries: (TimelineCallEntry | TimelineFoldEntry)[]
  changes: TimelineChangeEntry[]
  totals: {
    /** Every `api_calls` row this run made, folded and unfolded together. */
    calls: number
    /** How many of those rows are folded into fold entries rather than drawn one each. */
    folded: number
    /** Whether the timeline stopped at its call limit, so the counts are only lower bounds. */
    capped: boolean
    bytes: number
    ms: number
  }
  note: string
}

/** The one record lookup one timeline read makes, so every target and change row shares it. */
function recordsFor(ids: string[]): Map<string, { kind: string | null; title: string | null }> {
  const out = new Map<string, { kind: string | null; title: string | null }>()
  // IN PIECES (src/server/db/in-pieces.ts): the two timeline limits together allow more ids than is safe
  // in one statement. The rows go into a map by id.
  const rows = readInPieces(ids, (piece) =>
    db.select({ id: records.id, kind: records.kind, title: records.title }).from(records).where(inArray(records.id, piece)).all(),
  )
  for (const row of rows) out.set(row.id, { kind: row.kind, title: row.title })
  return out
}

function targetOf(id: string | null, declaredKind: string | null, known: Map<string, { kind: string | null; title: string | null }>): TimelineTarget | null {
  if (id === null) return null
  const row = known.get(id)
  return { kind: row?.kind ?? declaredKind ?? null, id, title: row?.title ?? null }
}

/**
 * One run's calls, in time order, polls folded, with its record changes beside them.
 *
 * The reference is resolved exactly as `sessionWork` resolves one, so the two doors cannot disagree
 * about what an id means; a reference that answers nothing in this project is refused with the same
 * 404 GET /api/sessions/:id answers, and the reply says where the run stands when it stands in
 * another project.
 */
export function sessionTimeline(
  ref: string,
  workspaceId: string,
  // MESSAGES THE READER MAY NOT READ: a call aimed at one, and a change row naming
  // one, are left out before anything is folded or counted. Empty for a reader who reads all.
  hidden: readonly string[] = [],
): SessionTimeline {
  const resolved = resolveSessionRef(ref, workspaceId)
  if (resolved.recordId === null) {
    throw new PanelError(
      `No session answers to ${JSON.stringify(resolved.asked)} in this project. ${resolved.why ?? ''}` +
        (resolved.elsewhereIn !== null
          ? ` A session record with this exact id is filed in the project "${resolved.elsewhereIn}", which this request does not reach.`
          : ''),
      404,
    )
  }

  const values = sessionFilterValues(resolved)
  const idColumn = inArray(apiCalls.sessionId, values)
  const aimedAtNoHidden =
    hidden.length === 0
      ? idColumn
      : and(idColumn, sql`coalesce(${apiCalls.targetId}, '') NOT IN (SELECT value FROM json_each(${JSON.stringify(hidden)}))`)
  const rows = db
    .select()
    .from(apiCalls)
    .where(aimedAtNoHidden)
    .orderBy(asc(apiCalls.atMs), sql`rowid asc`)
    .limit(TIMELINE_CALL_LIMIT)
    .all()
  const capped = rows.length >= TIMELINE_CALL_LIMIT

  // Every target id at once, once: one lookup for the whole timeline, not one per entry.
  const targetIds = [...new Set(rows.map((r) => r.targetId).filter((v): v is string => v !== null))]
  const changeRows = listChanges({ workspaceId, session: values, limit: TIMELINE_CHANGE_LIMIT, hidden })
  const changeRecordIds = [...new Set(changeRows.map((r) => r.recordId))]
  const known = recordsFor([...targetIds, ...changeRecordIds])

  const entries: (TimelineCallEntry | TimelineFoldEntry)[] = []
  let foldedCalls = 0
  let totalMs = 0
  let totalBytes = 0
  /**
   * ONE ADJACENT PAIR DECIDES. `prev` is the row drawn or folded before this one. A row continues
   * the run exactly when it is the same asked question, answered, straight after it: same
   * operation, same effect, same target, same purpose, all answered 200. Anything else — a refused
   * poll, a different operation, a call that reached at a different record — closes the run instead
   * of joining it.
   */
  const continues = (row: (typeof rows)[number], prev: (typeof rows)[number] | undefined): boolean =>
    prev !== undefined &&
    prev.operation !== null &&
    row.operation === prev.operation &&
    row.effect === prev.effect &&
    row.targetId === prev.targetId &&
    row.purpose === prev.purpose &&
    row.status === 200 &&
    prev.status === 200

  /** The open run since the last entry was pushed, held never more than one row deep. */
  let openRun: { firstRowFabric: (typeof rows)[number]; last: string; count: number; ms: number; bytes: number | null; lastRow: (typeof rows)[number] } | null = null
  const flush = (): void => {
    if (openRun === null) return
    if (openRun.count === 1) {
      const row = openRun.lastRow
      totalMs += row.ms
      if (row.bytes !== null) totalBytes += row.bytes
      entries.push({
        type: 'call',
        at: localStamp(new Date(row.atMs)),
        operation: row.operation,
        effect: row.effect,
        target: row.targetId === null ? null : targetOf(row.targetId, row.targetKind, known),
        purpose: row.purpose,
        ms: row.ms,
        bytes: row.bytes,
        status: row.status,
      })
    } else {
      const first = openRun.firstRowFabric
      const total = openRun
      entries.push({
        type: 'folded',
        operation: String(first.operation),
        effect: first.effect,
        target: first.targetId === null ? null : targetOf(first.targetId, first.targetKind, known),
        purpose: first.purpose,
        count: total.count,
        first: localStamp(new Date(first.atMs)),
        last: total.last,
        ms: total.ms,
        bytes: total.bytes,
      })
      totalMs += total.ms
      if (total.bytes !== null) totalBytes += total.bytes
      foldedCalls += total.count
    }
    openRun = null
  }
  for (const row of rows) {
    if (openRun === null || !continues(row, openRun.lastRow)) {
      flush()
      openRun = { firstRowFabric: row, last: localStamp(new Date(row.atMs)), count: 1, ms: row.ms, bytes: row.bytes, lastRow: row }
    } else {
      openRun.lastRow = row
      openRun.last = localStamp(new Date(row.atMs))
      openRun.count += 1
      openRun.ms += row.ms
      if (row.bytes !== null) openRun.bytes = (openRun.bytes ?? 0) + row.bytes
    }
  }
  flush()

  const changes: TimelineChangeEntry[] = changeRows
    .slice()
    .reverse()
    .map((row) => {
      const record = known.get(row.recordId)
      return {
        at: row.at,
        op: row.op,
        recordId: row.recordId,
        recordKind: record?.kind ?? null,
        recordTitle: record?.title ?? null,
        field: row.field,
      }
    })

  const record = getRecord(resolved.recordId)
  const data = (record?.data ?? {}) as Record<string, unknown>
  const ranAs = data.ranAs ?? null
  return {
    ref: resolved,
    run: {
      recordId: record?.id ?? null,
      title: record?.title ?? null,
      agent: typeof data.servingAgent === 'string' ? data.servingAgent : null,
      ranAs,
      model: typeof data.model === 'string' ? data.model : null,
      runtime: typeof data.runtime === 'string' ? data.runtime : null,
      flow: record?.summary ?? null,
      state: typeof data.state === 'string' ? data.state : null,
      started: typeof data.startedAt === 'string' ? data.startedAt : null,
      ended:
        typeof data.closedAt === 'string'
          ? data.closedAt
          : typeof data.answeredAt === 'string'
            ? data.answeredAt
            : typeof data.lastOutputAt === 'string'
              ? data.lastOutputAt
              : null,
    },
    entries,
    changes,
    totals: {
      calls: rows.length,
      folded: foldedCalls,
      capped,
      bytes: totalBytes,
      ms: totalMs,
    },
    note:
      `${rows.length} api_calls row${rows.length === 1 ? '' : 's'} for this run` +
      (capped ? `, capped at ${TIMELINE_CALL_LIMIT} — the counts and the entries are floors, not totals` : '') +
      `. Consecutive calls of one operation, each answered 200 and asking the same question, fold into one ` +
      `entry that carries a count and a span instead of one row each; ${foldedCalls} of these rows are folded.` +
      ` Each entry's time is local wall-clock, rendered from the stored instant; the changes below are the ` +
      `change log's rows carried with this run's id, capped at ${TIMELINE_CHANGE_LIMIT}, oldest last.`,
  }
}

// ---------------------------------------------------------------------------- incompleteness

/** What the session's record is still missing, for a caller that just wrote one. */
export function sessionIncompleteness(recordId: string): ReturnType<typeof incompletenessOf> {
  const record = getRecord(recordId)
  return record === null ? [] : incompletenessOf(record)
}
