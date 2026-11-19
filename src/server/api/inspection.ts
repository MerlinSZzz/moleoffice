// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { legacyUnsealedInventory, readRunSeal } from '../lib/sealed-tip.ts'
/**
 * THE CHECK, OVER HTTP.
 *
 *   GET  /api/checks              which runs said they were finished, and which nobody released
 *   GET  /api/checks/:run         what an inspector reads about one run, and where that run stands
 *   POST /api/checks/:run/prompt  that reading assembled into the prompt an inspector's run is given
 *   POST /api/checks/:run         the one act: release, or refuse
 *   POST /api/checks/:run/standard  a standard change, released with no inspector
 *
 * Criteria C17 to C23, C25 and C26 of design/rules/ACCEPTANCE.md.
 *
 * THE RULES ARE IN src/server/lib/inspection.ts, beside the refusals that name them. Nothing here
 * repeats one. What is here is the door: who may knock, what shape the body is, and what comes back.
 *
 * WHY THE PROMPT IS A POST. It is a read — it writes nothing and `check.prompt` says so — but the
 * changed files come from a checkout on somebody's disk, and nothing under src/ may run git or read
 * a working tree. So the caller finds the changes and sends them, and the assembler is the thing
 * that decides which of them are inside the work area the worker registered.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../../config/check-records.mjs'

import { PARTICIPANT_KINDS, THE_MESSAGE_WORKER_ID } from '@shared/participants.ts'
import { A_REFUSAL_NAMES, whatAStandardReleaseChecked } from '@shared/releasing.ts'
import { A_STANDARD_KIND_SAYS, STANDARD_KINDS, THE_CHECKS_OF_A_STANDARD_KIND, THE_GATE_OF_A_STANDARD_KIND, theChangedTestFiles, whatAStandardDeclarationFinds, type StandardKind } from '@shared/standard-change.ts'
import { gateMet } from '../lib/gate-counts.ts'
import { aPathThatNeedsJudgment, eachFieldOfAVerdict, THE_VERDICT_DOOR, whatARefusalLacks, whatSaysSo, whatWasRead } from '@shared/the-verdict-door.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { onlyTheMessagesThisReaderMayRead, refuseAMessageThisReaderMayNotRead, theMessageReader, type AMessageReader } from '../lib/messages.ts'
import { refuseAnActWithNoKey, type ADoorThatAsksForAKey } from '../lib/keyheader.ts'
import { theStopOfThisSession } from '../lib/a-stopped-check.ts'
import { theInvariantsTheRulesList } from '../lib/invariants.ts'
import { route } from '../lib/route.ts'
import { getRecord, nothingWrittenSentence, patchRecord, recordInWorkspace, type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { revokeTheRunKeyRecordedOn } from '../lib/keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { sqlite } from '../db/client.ts'
import { whyThisCallerMayNotStopTheRun } from './runtime.ts'
import { recordAVerdictRefused } from '../lib/flow-runs.ts'
import { theVerdictDoorRecordedIt } from '@shared/flow-run.ts'
import { nowStamp } from '@shared/time.ts'
import { TWELVE_ID_CHARACTERS } from '@shared/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { chapterNames, readTheChaptersNamed } from '../lib/chapters.ts'
import { savedRoundChapters } from '@shared/round-chapters/manifest.ts'
import { theMergeQueueHearsAVerdict } from '../lib/merge-state-machine.ts'
// THE ONE DECLARATION OF THE KEYS A VERDICT MAY CARRY. The tool trims the model's answer against
// the same lists, so neither side keeps a copy that drifts. Problem jdHgAVP5N0f_.
import { VERDICT_KEYS, SAYS_KEYS, whatSaysTakes } from '../../config/verdict-keys.mjs'
import { FROM_ITS_COMMIT, SEAL_READ_HEADER } from '../../config/seal-read-header.mjs'
import {
  recordCheckToolStarted,
  recordCheckToolEnded,
  askForTheCheckAgain,
  checkEligibilityForRun,
  requireCheckEligibility,
  requireIndependentChecker,
  whoAnswersTheCheck,
  assembleTheInspectorsPrompt,
  WHY_THE_TOOL_WANTED_IT,
  changesInTheWorkArea,
  theFilesAreaToSortBy,
  whatNeedsJudgment,
  precedentsOfChapter,
  releaseOrRefuse,
  theStarterHearsTheRefusal,
  NOBODY_HAS_ASSEMBLED_ONE,
  rememberWhatTheCheckWouldRead,
  runsThatSaidTheyAreFinished,
  theCheckAskedFor,
  whatTheCheckWouldRead,
  whetherARunsProcessHasEnded,
  whatOneStarterHasNotChecked,
  whatTheInspectorReads,
  noRunHasThisId,
  confirmTheReport,
  recordAHandLanding,
  supersedeARun,
  closeARunUnchecked,
  howARunWouldSettle,
  requireASettlementReader,
  whatRetiringWhileACheckIsOwed,
  theMergeEntryACheckAgainIsFor,
  theWayASealIsVerified,
  theSealReadAheadOf,
  type HowASealIsRead,
} from '../lib/inspection.ts'
import {
  ONLY_THE_INSPECTOR_JUDGES_PACKAGES, assertTheInspectorOfTheRun, checkThePackage, thePackagesThisRunHandedBack, thePointsThatDoNotHold,
  theVerdictsPackagesLack, whatAVerdictsPackagesLack, type AVerdictsPackage,
} from '../lib/delegation.ts'
import { aCheckOfHandedBackPackages, onlyThePointsAreListed, theListedFaultsWith } from '../../config/verdict-kinds.mjs'
import { endTheSealReadThread, theSealReadApart } from '../lib/the-seal-read-apart.ts'
import { sayThePartsOfTheCheckDoors, thePartsOf } from '../lib/the-parts-of-a-check-door.ts'

// ============================================================================ the sentences

const LIST_NOTE =
  'WHICH RUNS SAID THEY WERE FINISHED, and which of those nobody released. A subagent saying it is done does ' +
  'not end it: a run ends when its starter or an inspector releases it, and this is the list of the ones that ' +
  'have not been. Send `?startedBy=<handle>` to narrow it to the runs of the agents one starter started, which ' +
  'is the starter reading its own list. Mole Office does not own a subagent process and cannot stop an ' +
  'unchecked finish; what it does is make one visible. Closed-unchecked archives are left out of this list.'

const READ_NOTE =
  'WHAT AN INSPECTOR READS ABOUT ONE RUN, and nothing else. Five things: what Mole Office holds of the brief, ' +
  'the chapters that brief named with the level each is read at, the precedents of those chapters, the report ' +
  'and everything the run wrote, and the work area the worker registered when it started. A run whose agent ' +
  'registered no work area reads as one nobody can check this way, not as one with nothing to check.'

/** The chapters a run saved, each at the level it was delivered, with the names the door reads a chapter by; null when it saved none. */
function theSavedChaptersOf(data: unknown): { chapters: { chapter: number; level: string }[]; chapterNames: { n: number; label: string }[] } | null {
  const saved = savedRoundChapters(data)
  return saved === null ? null : { chapters: saved.chapters.map(({ chapter, level }) => ({ chapter, level })), chapterNames: chapterNames() }
}

const PROMPT_NOTE =
  'THE PROMPT AN INSPECTOR RUN IS GIVEN, assembled at semantic levels. Every chapter is in it at its name and ' +
  'what it governs; only the chapters the brief named are written out further, at the level it named. It never ' +
  'carries the whole code. Body {"changes":[{"path":…,"changes":…}]} — the files ' +
  'the worker changed, which the caller finds because nothing in this server reads a working tree. The reply ' +
  'says the size in bytes and what the whole code at full would have been. Optional "only":[paths] makes it a ' +
  'scoped check that judges only those changed paths, the rest keeping an earlier verdict; optional ' +
  '"needsJudgment":[{"path","why","changes"}] hands on the protected paths a checker tool could not decide, where a ' +
  'path the change does not touch is dropped, the reply\'s "needsJudgment" names {"used","dropped"}, and a list left ' +
  'with no path is refused; ' +
  'optional "carries":[{"path","id","kind","title","as"}] names the records the check\'s tool wrote into files for ' +
  'its model, which has no key and no office address, so the prompt can say where to read them; optional ' +
  '"couldNotCarry":[{"id","as","why"}] names those it meant to write and could not, and why; optional ' +
  '"pinnedLinksFile":"/path" names the file the check\'s tool wrote the office\'s reading of the pinned links into, ' +
  'so the prompt can say where to read them.'

const ASSEMBLED_NOTE =
  'WHAT ONE ASSEMBLY OF THE CHECK PROMPT MEASURED, kept on the run so a person reads it in Mole Office rather ' +
  'than in the terminal it was printed to. Same body as the prompt route — {"changes":[…],"base":{…}} — because ' +
  'it assembles the same prompt with the same assembler; what it adds is that the measurement is written down. ' +
  'It holds the LAST assembly and not a list of them: what a person asks is what the check that would run now ' +
  'would read. GET /api/checks/<run> answers it back, and says so plainly where nobody has assembled one. ' +
  'A request a listener carried comes with a key this office knows, and one with none is refused.'

const ANSWER_NOTE =
  'THE ONE ACT: RELEASE, OR REFUSE. Body {"verdict":"released"|"refused","check":…,"chaptersRead":[…]} and, for ' +
  `a refusal, {"missing":[…],"says":{…}}, where says names ${whatSaysTakes()}. A release writes two messages: one to the ` +
  'subagent ending its run and carrying the check, and one to the starter carrying the result and one line ' +
  'saying it was checked. The starter is never sent the check. A refusal writes the same two shapes — the ' +
  'starter is told a refusal happened and not what it was — and opens a group holding the worker, its ' +
  'supervisor and the inspector. The refusal stands while they talk. Only an agent holding the inspector card ' +
  'may knock, and an inspector that has changed a record the run it is checking wrote is refused by name. ' +
  'A release or a refusal that a listener carried comes with a key, and one with none is refused (acceptance finding 79). ' +
  'An inspector\'s verdict judges, in packages, every point of each inside package the run handed back that waits for a check, ' +
  'and each judgement is written as that package\'s check.'

/**
 * WHAT A VERDICT WITH NO KEY IS TOLD, around the words `refuseAnActWithNoKey` in lib/keyheader.ts
 * writes for every door that asks for a key. Acceptance finding 79 (report EnJvvsDTF_Dx, block
 * f-79); agreed on 25 September 2026 (message YWieW_DDgUE8); criterion P83, point 1.
 *
 * WHY. A release ends a run's check and lets its work go on towards main, so this door is the merge
 * queue's review gate. It asks whether the caller holds the inspector card or is the run's starter,
 * and it reads both off the headers, while an agent's name sent with no key is still taken as that
 * agent: the key window covers only a claim to be the person. So any process that could reach the
 * office could send the inspector's name and release a run. In the seven days before this, all 107
 * verdicts the door took came with a key (the check tool's), so asking for one takes nothing from
 * anybody.
 *
 * WHAT COUNTS, and why a request no listener carried is never refused, is said once, beside the
 * helper. The other doors an agent ends a run's check through (confirm, superseded, the merge
 * queue's submit) still take a name alone: their callers had no key yet on 25 September, and the
 * keys wave takes them (same message).
 */
const A_VERDICT: ADoorThatAsksForAKey = {
  act: 'This release or refusal',
  nothingWasDone: 'Nothing was written.',
  why:
    "A verdict ends a run's check and lets its work go on towards main, so the office takes one only from a " +
    "caller that proves who it is: the check tool (node tools/the-inspector.mjs) sends the office's key with " +
    "the inspector's name, and a starter checking its own agent's run sends its own agent key.",
}

/** The whole header is one record id: the alphabet and the length search reads too (looksLikeId in search.ts). */
const ONE_RECORD_ID = new RegExp(`^${TWELVE_ID_CHARACTERS.source}$`)

/**
 * A stopped check cannot post with the inspector's still-live agent key (dbygn38VFgti, 32A_TmNldtFa).
 *
 * NOTHING THE CHECK'S INSPECTOR WRITES AFTER A STOP LANDS (since 21 Oct 2026), its own agent key included:
 * not the verdict, not the assembled step (refuseAnAssemblyFromAStoppedCheck below), and not the messages that would pass a
 * refused verdict on (the record door's refusal, lib/a-stopped-check.ts). Until then only the verdict was refused, and those
 * messages were left open on purpose, because they were how the checked run's starter learned that the verdict was refused.
 * The starter now learns it from the office itself: the stop door tells it once that the check was stopped and its verdict
 * will not count, so no process that was stopped speaks. Whether a session has stopped is read in one place,
 * theStopOfThisSession, which every one of these doors asks.
 */
function refuseAVerdictFromAnEndedCheckSession(sessionId: string | null | undefined, workspaceId: string): void {
  const id = sessionId?.trim()
  if (!id) return
  // A HEADER THAT IS NOT A RECORD ID IS REFUSED, and never read by title (gap 1, hYSaAc6dw4_Y). The sentence
  // quotes nothing the caller sent, because it is stored on the run's flow run.
  if (!ONE_RECORD_ID.test(id)) {
    throw new PanelError(
      'This verdict is refused: the x-mole-office-session header does not hold a record id. That header must hold the id ' +
        "of the check's own session, which is 12 characters, each a letter, a digit, - or _. This door never looks a session " +
        'up by its title or by a name. Nothing was written.',
      400,
    )
  }
  // AN ID NAMING NO SESSION IS TAKEN AS BEFORE (the rule for (b)). A title match would be a guess about which session
  // the caller meant.
  const stopped = theStopOfThisSession(id, workspaceId)
  if (stopped !== null) {
    throw new PanelError(`Session ${stopped.session.id} (${stopped.session.title}) cannot post a verdict: ${stopped.said} Nothing was written.`, 409)
  }
}

/**
 * THE ASSEMBLED STEP OF A STOPPED CHECK IS REFUSED as its verdict is. A --dry assembly names no session on purpose: it runs
 * no model and has no check session, so a write with no session header is taken as before.
 */
function refuseAnAssemblyFromAStoppedCheck(sessionId: string | null | undefined, workspaceId: string): void {
  const stopped = theStopOfThisSession(sessionId, workspaceId)
  if (stopped !== null) {
    throw new PanelError(
      `Session ${stopped.session.id} (${stopped.session.title}) cannot record what the check would read: ${stopped.said} Nothing was written.`,
      409,
    )
  }
}

/**
 * THE DOORS OF check.assembled THAT ASK FOR A KEY (keys wave piece 7). The inspector and one other agent
 * record an assembly; the message worker records a check tool's start and end, with the office's
 * key. ask-again does not ask: the person's own browser presses it, and a browser they have not paired
 * carries no key while the key window is open.
 */
const AN_ASSEMBLY: ADoorThatAsksForAKey = {
  act: 'This record of what a check would read',
  nothingWasDone: 'Nothing was written.',
}
const A_CHECK_TOOL_START: ADoorThatAsksForAKey = {
  act: "This record of a check tool's start",
  nothingWasDone: 'Nothing was written.',
}
const A_CHECK_TOOL_END: ADoorThatAsksForAKey = {
  act: "This record of a check tool's end",
  nothingWasDone: 'Nothing was written.',
}

// ============================================================================ the shapes

const whichRun = z.object({ run: z.string().min(1) }).strict()

const aChangedFile = z.object({ path: z.string().min(1), changes: z.string() }).strict()

/**
 * WHICH COMMIT THE CALLER READ THE CHANGES AGAINST. Optional, because a caller that does not say is
 * a caller whose prompt says nobody said, and that is a different fact from a base that was found.
 */
const theBaseUsed = z
  .object({ ref: z.string().min(1), how: z.enum(['fork point', 'typed']), says: z.string().min(1) })
  .strict()

/**
 * ONE RECORD THE CHECK'S TOOL WROTE WHOLE INTO A FILE FOR ITS MODEL, which has no key and no office address (problem
 * YxzFRQIpx9Pz). The shape is `ARecordWrittenForTheModel` in lib/inspection.ts; the prompt names each file.
 */
const aRecordWrittenForTheModel = z
  .object({
    path: z.string().regex(/^\/[^\r\n]*$/, 'a path the model can open, from the root, on one line').max(4096),
    id: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/),
    kind: z.string().min(1).max(40),
    title: z.string().max(2000),
    as: z.enum(WHY_THE_TOOL_WANTED_IT),
  })
  .strict()

/**
 * ONE RECORD THE CHECK'S TOOL MEANT TO HAND ITS MODEL AND COULD NOT, with why (problems iVfuq3VBSnih and 7vaMy2NYnNQc).
 * The shape is `ARecordTheToolCouldNotCarry` in lib/inspection.ts; the prompt names each one.
 */
const aRecordTheToolCouldNotCarry = z
  .object({
    id: z.string().regex(/^[^\r\n]+$/, 'an id on one line').max(80),
    as: z.enum(WHY_THE_TOOL_WANTED_IT),
    why: z.string().regex(/^[^\r\n]+$/, 'why, on one line').max(300),
  })
  .strict()

/**
 * HOW LARGE A BODY THE TWO DOORS THAT TAKE THE CHANGES TO CHECK MAY READ: 8 MiB.
 *
 * POST /checks/:run/prompt and POST /checks/:run/assembled take the round's whole diff as their body.
 * The server's default limit is 1 MiB, and wave 13q's round 3 (125 files, a 1.84 MB diff) was answered
 * 413 "Request body is too large", so no check could read it. It could not be split into part runs:
 * only the round's final tip passes its own tests. Wave 13k's round 11 is a 2.4 MB diff. 8 MiB holds
 * both with room, and every other route keeps its own limit.
 */
export const THE_CHANGES_TO_CHECK_BODY_LIMIT = 8 * 1024 * 1024

const promptBody = z
  .object({
    changes: z.array(aChangedFile).max(500).optional(),
    base: theBaseUsed.nullable().optional(),
    read: whatWasRead.optional(),
    execution: z.object({ model: z.string().trim().min(1), minutes: z.number().positive().finite() }).strict().optional(),
    // THE PATHS A SCOPED CHECK JUDGES (`--only`), and the protected paths a checker tool handed on,
    // each with the diff the tool read for it, because nothing in this server reads a working tree.
    only: z.array(z.string().min(1)).min(1).max(500).optional(),
    needsJudgment: z.array(aPathThatNeedsJudgment.extend({ changes: z.string() }).strict()).max(500).optional(),
    // THE RECORDS THE CHECK'S TOOL WROTE INTO FILES FOR ITS MODEL, read with the tool's key (problem YxzFRQIpx9Pz).
    carries: z.array(aRecordWrittenForTheModel).max(THE_MOST_RECORDS_A_CHECK_CARRIES).optional(),
    // AND THOSE IT MEANT TO WRITE AND COULD NOT, each with why (problems iVfuq3VBSnih and 7vaMy2NYnNQc).
    couldNotCarry: z.array(aRecordTheToolCouldNotCarry).max(THE_MOST_RECORDS_A_CHECK_CARRIES).optional(),
    // THE FILE THE CHECK'S TOOL WROTE THE READING OF THE PINNED LINKS INTO, for its model (round BM, item 2aq).
    pinnedLinksFile: z.string().regex(/^\/[^\r\n]*$/, 'a path the model can open, from the root, on one line').max(4096).optional(),
  })
  .strict()

/**
 * WHAT THE INSPECTOR READS ABOUT ONE RUN, AS THIS CALLER MAY SEE IT. The run's
 * page, the prompt a check is given and the size an assembly keeps are all built from this, for the
 * caller who asked. A message the caller may not read is left out of what the run's agent wrote, so its
 * title is in none of them; the inspector that builds the prompt is such a caller too. An id that names
 * such a message is refused as an id that names no run.
 */
function whatThisReaderMaySeeOfTheRun(runId: string, workspaceId: string, reader: AMessageReader, read: HowASealIsRead = {}): ReturnType<typeof whatTheInspectorReads> {
  refuseAMessageThisReaderMayNotRead(reader, runId, () => noRunHasThisId(runId))
  const reads = whatTheInspectorReads(runId, workspaceId, read)
  return { ...reads, wrote: onlyTheMessagesThisReaderMayRead(reader, reads.wrote) }
}

/**
 * HOW THIS READ OF A CHECK ASKS FOR A GIT SEAL TO BE READ (src/config/seal-read-header.mjs). Without the header it is
 * read in the run's folder, as before. With its one value it is read from its sealed commit. Any other value is
 * refused, rather than read as either.
 */
function howThisRequestReadsTheSeal(req: FastifyRequest): HowASealIsRead {
  const asked = req.headers[SEAL_READ_HEADER]
  if (asked === undefined) return {}
  if (asked === FROM_ITS_COMMIT) return { theSealFromItsCommit: true }
  throw new PanelError(`The ${SEAL_READ_HEADER} header takes one value, ${FROM_ITS_COMMIT}, and this request sent ${JSON.stringify(asked)}. Nothing was read.`, 400)
}

function baseForSubmission(reads: ReturnType<typeof whatTheInspectorReads>, body: z.infer<typeof promptBody>) {
  if (reads.submission?.seal.kind === 'records') {
    if (body.base != null || body.changes?.length) throw new PanelError('A records submission is checked from its sealed revisions, without Git changes or a Git base.', 400)
    if (body.only !== undefined || body.needsJudgment !== undefined) {
      throw new PanelError('A records submission has no changed paths, so a check of it cannot be scoped to paths or handed paths that need judgment.', 400)
    }
    return null
  }
  // A FILES SUBMISSION HAS CHANGES AND NO GIT BASE. Its changes are the
  // sealed files — each an addition, or a modification of the file already landed at that path —
  // read by the check's tool from a copy it verified against the seal. There is no commit, so there
  // is no base to read them against, and a base sent for one is a mistake rather than extra detail.
  if (reads.submission?.seal.kind === 'files') {
    if (body.base != null) throw new PanelError('A files submission is checked from its sealed files, which were never in a repository, so it takes no Git base.', 400)
    // EVERY SEALED FILE IS HANDED OVER, AND NOTHING ELSE IS. A git check's changes can be reproduced
    // from its fixed base and tip; a files check's cannot, so the list itself is held to the seal
    // here: a sealed file left out would be released without the model ever being shown it.
    const sealed = (reads.submission.seal.files?.files ?? []).map((one) => one.path).sort()
    const handed = (body.changes ?? []).map((one) => one.path).sort()
    if (JSON.stringify(handed) !== JSON.stringify(sealed)) {
      const missing = sealed.filter((path) => !handed.includes(path))
      const extra = handed.filter((path) => !sealed.includes(path))
      throw new PanelError(
        `A files submission's changes are exactly the files of seal ${reads.submission.id}, so a check can neither leave one out nor add one. ` +
          (missing.length === 0 ? '' : `Not handed over: ${missing.join(', ')}. `) +
          (extra.length === 0 ? '' : `Not in the seal: ${extra.join(', ')}. `) +
          (missing.length === 0 && extra.length === 0 ? 'A path was handed over more than once.' : ''),
        400,
      )
    }
    return null
  }
  if (body.base === null) throw new PanelError('A null Git base is only valid for a sealed records or files submission.', 400)
  return body.base ?? null
}

/** The keys this door accepts, exported so a test can hold them against the one declaration. */
export const VERDICT_KEYS_THE_DOOR_ACCEPTS: readonly string[] = Object.keys(eachFieldOfAVerdict)

/** The keys this door accepts inside `says`, exported for the same reason. */
export const SAYS_KEYS_THE_DOOR_ACCEPTS: readonly string[] = Object.keys(whatSaysSo.shape)

/** Whether two lists name the same words, order and repetition aside. */
function theSameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((one) => b.includes(one))
}

/**
 * THE ONE DECLARATION IS ENFORCED AT LOAD, so a key added on one side alone cannot pass quietly.
 * `src/config/verdict-keys.mjs` is what the tool trims against; this is the shape the door parses
 * with. If they differ, one of them is wrong and the server must not start.
 */
if (!theSameKeys(VERDICT_KEYS_THE_DOOR_ACCEPTS, VERDICT_KEYS)) {
  throw new Error(
    `The verdict door accepts ${VERDICT_KEYS_THE_DOOR_ACCEPTS.join(', ')}, and src/config/verdict-keys.mjs ` +
      `declares ${VERDICT_KEYS.join(', ')}. They are one declaration and must not drift.`,
  )
}
if (!theSameKeys(SAYS_KEYS_THE_DOOR_ACCEPTS, SAYS_KEYS)) {
  throw new Error(
    `The verdict door accepts ${SAYS_KEYS_THE_DOOR_ACCEPTS.join(', ')} inside says, and ` +
      `src/config/verdict-keys.mjs declares ${SAYS_KEYS.join(', ')}. They are one declaration and must not drift.`,
  )
}

const theAnswer = THE_VERDICT_DOOR

const STANDARD_NOTE =
  'A STANDARD CHANGE, RELEASED WITH NO INSPECTOR. Body {"kind":…,"read":{…},"toolRead":{…},"checks":[…]}. A git ' +
  'seal may declare one of the standard kinds one-plugin, words, tests and documents; the check tool asks this ' +
  'door before it starts an inspector. The door releases the run when the seal declares the kind asked for, ' +
  'the kind\'s switch in the gate list is on, every changed file is inside the kind and none is never standard, ' +
  'and each of the kind\'s other checks ran on the sealed tree ' +
  'and exited 0. The test check changed-tests must name exactly the changed runnable test files when there are any; ' +
  'when there are none, an empty test selection is recorded, no test process runs, and the merge queue\'s related ' +
  'run is the test proof. The release says how: the standard-change rule, with which kind and why. Anything else answers ' +
  '409 saying why it goes the ordinary way, writes nothing, and the tool goes on to the inspector. Only the ' +
  'inspector\'s check tool may ask, with a key.'

const A_STANDARD_RELEASE: ADoorThatAsksForAKey = {
  act: 'This standard release',
  nothingWasDone: 'Nothing was written.',
  why:
    "A standard release ends a run's check with no inspector reading it and lets its work go on towards main, so the " +
    "office takes one only from the inspector's check tool (node tools/the-inspector.mjs), which sends the office's key.",
}

/**
 * WHAT THE CHECK TOOL SENDS FOR A STANDARD RELEASE (src/shared/standard-change.ts). `read` is the seal it read, as a
 * verdict names it, with no scoped paths and none handed on to judge. `toolRead` is what only the tool can read of the
 * change; `checks` is each of the kind's own checks as it ran on the sealed tree.
 */
const theStandardAsk = z
  .object({
    kind: z.enum(STANDARD_KINDS),
    read: whatWasRead,
    toolRead: z
      .object({
        neverStandard: z.array(z.object({ path: z.string().min(1), why: z.string().min(1) }).strict()).nullable(),
        cases: z.array(z.object({ path: z.string().min(1), removed: z.array(z.string()) }).strict()).nullable(),
        words: z.array(z.object({ path: z.string().min(1), plain: z.boolean(), why: z.string() }).strict()).nullable(),
      })
      .strict(),
    checks: z
      .array(
        z.object({ name: z.string().min(1), argv: z.array(z.string()), code: z.number().int().nullable(), seconds: z.number().min(0) }).strict(),
      )
      .max(20),
  })
  .strict()

/**
 * THE KIND'S SWITCH, COUNTED WHERE IT IS MET. Each id is written out so the gate list's test finds its counting site;
 * a declared change of the kind meets its gate whether it then matches or not.
 */
function theSwitchOfAStandardKind(kind: StandardKind): string {
  switch (kind) {
    case 'one-plugin':
      return gateMet('standard-one-plugin')
    case 'words':
      return gateMet('standard-words')
    case 'tests':
      return gateMet('standard-tests')
    case 'documents':
      return gateMet('standard-documents')
  }
}

const narrowedTo = z
  .object({ startedBy: z.string().min(1).optional(), startedByKind: z.enum(PARTICIPANT_KINDS).optional() })
  .strict()

/** What a supervisor sends when it confirms a report. The line is required. Criterion C29. */
const theConfirmation = z.object({ because: z.string().min(1) }).strict()

const CONFIRM_NOTE =
  'THE SUPERVISOR CONFIRMS THE REPORT, AND THAT IS WHAT CLOSES A RUN. Criterion C29: a run whose check passes ' +
  'moves to reporting and reports to its supervisor, and it closes only once the supervisor confirms it. Body {"because":"…"} — what ' +
  'you are saying when you confirm it, required, because a close with nothing behind it is indistinguishable ' +
  'from a mis-press a year later. A release settles the CHECK and does not end the run: the run reports to ' +
  'whoever started it and stays live, worktree kept, until this. Only the supervisor the run reported to may ' +
  'confirm, or the person; where the release recorded no supervisor, anybody registered may, and the reply ' +
  'says out loud that they were not its supervisor. It writes one message, telling the worker its run is ' +
  'closed and what it was holding may be let go.'

/**
 * WHAT THE STARTER SENDS TO CLOSE A RUN AS SUPERSEDED BY A LATER ONE.
 *
 * `because` is required for the same reason a retirement's is: a close with nothing behind it reads
 * a year later exactly like a mis-press.
 */
const theSuperseding = z
  .object({
    by: z.string({ error: 'a superseded run names the later run that overtook it.' }).min(1, { error: 'a superseded run names the later run that overtook it.' }),
    because: z
      .string({ error: 'closing a run as superseded says why, in one sentence.' })
      .min(1, { error: 'closing a run as superseded says why, in one sentence.' })
      .max(600),
    statement: z.string({ error: 'a statement is named by its record id.' }).min(1, { error: 'a statement is named by its record id.' }).optional(),
  })
  .strict()

const theHandLanding = z
  .object({
    commit: z
      .string({ error: 'a hand-landing names the commit on main that holds the run\'s content.' })
      .regex(/^[0-9a-f]{7,40}$/i, { error: 'a hand-landing names the commit on main as its hexadecimal name, 7 to 40 characters.' }),
    because: z
      .string({ error: 'recording a hand-landing says why, in one sentence.' })
      .trim()
      .min(1, { error: 'recording a hand-landing says why, in one sentence.' })
      .max(600),
  })
  .strict()

const LANDED_BY_HAND_NOTE =
  'RECORD THAT A RELEASED RUN\'S CONTENT REACHED MAIN BY HAND, NOT THROUGH THE MERGE QUEUE. ' +
  'Body {"commit":"<the commit on main>","because":"<one sentence>"}. Only the person, or ' +
  'whoever holds the secretary card. The office checks, before writing anything: the run was released and confirmed ' +
  'and has no hand-landing yet; no merge entry of it merged or is still in the queue, and its entries name one git ' +
  'lane; the commit is in that lane\'s checkout and main (its HEAD) holds it; and git finds each of the run\'s ' +
  'commits in it, by the superseded door\'s proofs (ancestor, the same patches, the same changed lines). Then it ' +
  'writes theCheck.landedByHand and nothing else, and the run\'s sentence says where its content went. It adds no ' +
  'standing. 403 for any other caller, 409 naming what is wrong, and nothing is written.'

const SUPERSEDE_NOTE =
  'CLOSE A RUN AS SUPERSEDED BY A LATER RUN: one on the same branch, or one that was checked and merged and ' +
  'holds this run\'s commits. ' +
  'Body {"by":"<the later run\'s id>","because":"<one sentence>"}. The run\'s starter, a secretary, ' +
  'or the owner may ask, carrying a key. The seal, report, refusals and any release stay as they ' +
  'were, and one field is written: theCheck.superseded on a run that holds a check, and the run\'s own superseded on a ' +
  'run that holds none. A run that has not said its work is finished is refused until its ' +
  'process has ended: the process its record names, the process rows registered under it, and the run that started it ' +
  'are read, and its commits are read from its working directory, as a seal would read them. ' +
  'A later run on the same branch must have been released and ' +
  'confirmed. A later run on another branch must have been released by an inspector, confirmed and merged, both ' +
  'runs must have git seals in one repository, and git must find each of this run\'s commits in the later run: its ' +
  'sealed commit is an ancestor of the later one, or each commit has a commit with the same patch-id in the later ' +
  'run. A first run that was released is closed only by a later run on the same branch, and only when no merge ' +
  'entry of it landed or is still in the queue; the later run must then meet everything asked of a run on another ' +
  'branch, and the answer says what became of the first run\'s entries, or that it was never submitted. It ' +
  'refuses, each naming what is wrong, a `by` that names the run itself, a first run already confirmed or ' +
  'superseded, a released first run that a later run on another branch names, and each of these conditions that ' +
  'does not hold, naming every commit it could not find. A FOURTH PROOF: with ' +
  '"statement":"<a report id>" in the body, a commit the first three proofs do not find is settled when that report holds ' +
  'one table with the columns of src/shared/commit-statements.ts naming this run, the commit, the commit it became on ' +
  'main and the files where the wave changed its own lines; an inspector\'s release names a seal that holds the report ' +
  'as it now stands; the commit it became is on the main the later run merged into; and the files where the worker\'s ' +
  'own lines differ are exactly the files named. contains.how then says "named by a released statement" and names the ' +
  'statement.'

// ============================================================================ the routes

/** A session in this project, without revealing records in another project. */
function theRunForItsEnd(id: string, workspaceId: string) {
  const filed = getRecord(id)
  if (filed === null || filed.kind !== 'session' || filed.deletedAt !== null) {
    throw new PanelError(`No run ${id} in this project. Nothing was done.`, 404)
  }
  try {
    return recordInWorkspace(id, workspaceId)
  } catch (error) {
    if (error instanceof PanelError) error.message += ' Nothing was done.'
    throw error
  }
}

export async function inspectionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/runs/:run/process-ended', route('run.process-ended', 'remote', 'Read whether the process of a run is known to have ended, with a sentence saying what was read.'), async (req) => {
    const { run: id } = req.params as { run: string }
    return whetherARunsProcessHasEnded(theRunForItsEnd(id, workspaceOf(req)))
  })

  app.post('/runs/:run/closed-after-its-end', route('run.closed-after-its-end', 'remote', 'Close a run whose command and process have both ended, as crashed, with one sentence saying why, and revoke its key if it holds one.'), async (req) => {
    const { run: id } = req.params as { run: string }
    const run = theRunForItsEnd(id, workspaceOf(req))
    const actor = actorFrom(req)
    const refusal = whyThisCallerMayNotStopTheRun(actor, run, 'close it after its command ended', '')
    if (refusal !== null) throw new PanelError(`${refusal} Nothing was done.`, 403)
    if (theRunHasEnded(run.data['state'])) throw new PanelError(`Run ${run.id} is already over: its state is ${String(run.data['state'])}. Nothing was done.`, 409)
    const ended = run.data['commandEnded']
    if (typeof ended !== 'object' || ended === null || Array.isArray(ended) || typeof (ended as Record<string, unknown>)['at'] !== 'string') {
      throw new PanelError(`Run ${run.id} does not record when its command ended. Nothing was done.`, 409)
    }
    const reading = whetherARunsProcessHasEnded(run)
    if (!reading.ended) throw new PanelError(`Run ${run.id} cannot be closed: ${reading.says} Nothing was done.`, 409)
    const body = req.body
    if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 1 ||
      typeof (body as Record<string, unknown>)['why'] !== 'string' ||
      !/^[^.!?\r\n]+[.!?]?$/.test(((body as Record<string, unknown>)['why'] as string).trim()) ||
      ((body as Record<string, unknown>)['why'] as string).trim().length > 500) {
      throw new PanelError('The close request must give why as one nonempty sentence of at most 500 characters. Nothing was done.', 400)
    }
    const why = ((body as Record<string, unknown>)['why'] as string).trim().replace(/[.!?\s]+$/, '')
    const command = ended as Record<string, unknown>
    const how = typeof command['signal'] === 'string' ? `signal ${command['signal']}` :
      typeof command['code'] === 'number' ? `exit code ${String(command['code'])}` : 'no exit code or signal recorded'
    return sqlite.transaction(() => {
      const keyRevoked = revokeTheRunKeyRecordedOn(run.data as Record<string, unknown>, `The agent ${actor.id} closed run ${run.id} after its command ended: ${why}.`) !== null
      const key = keyRevoked ? 'Its key was revoked, so its writes to the office stop now.' :
        'This close revoked no key: the run was minted none, or its key was revoked already.'
      const earlier = run.data['doing']
      const before = typeof earlier === 'string' && earlier.trim() !== '' ? `Before this, the run said: ${earlier}` : 'Before this, its doing line was empty.'
      const doing = `The agent ${actor.id} closed this run after its command ended: ${why}. Its command ended at ${String(command['at'])} with ${how}. The process reading says ${reading.says} ${key} ${before}`
      patchRecord(run.id, { dataPatch: { state: 'crashed', doing } }, actor)
      return { run: run.id, closed: true, keyRevoked, recorded: doing }
    })()
  })

  // THE CHECK DOORS' PARTS, said in the log for every call, and the seal-read thread ended with the server (item 2o).
  sayThePartsOfTheCheckDoors(app)
  app.addHook('onClose', async () => {
    await endTheSealReadThread()
  })

  app.get('/checks/owed', route('check.how-it-would-settle', 'remote',
    'Read every check or report one agent still owes, across projects. With the gate who-reads-a-settlement at block, only a secretary or the person, proved by a key, may read it. With that gate at off, any caller proved by a key may read it. A caller with no key is refused at both positions. Writes nothing.'), async (req) => {
    requireASettlementReader(actorFrom(req))
    const asked = parse(z.object({ agent: z.string().min(1) }).strict(), req.query, 'The agent whose runs are owed')
    const named = theAgentAnArrivingReferenceNames(asked.agent, 'reading')
    if (named === null) throw new PanelError(`No agent is registered as "${asked.agent}". Nothing was written.`, 404)
    const agent = named.agent
    return {
      agent: { kind: 'agent', id: agent.id, handle: agent.handle },
      runs: whatRetiringWhileACheckIsOwed(agent).map((owed) => ({ ...owed, workspaceId: getRecord(owed.run)!.workspaceId })),
    }
  })

  app.get('/checks/:run/how-it-would-settle', route('check.how-it-would-settle', 'remote',
    'Read how one owed run would be settled, using the superseded door\'s proofs against later merged runs in the same repository. With the gate who-reads-a-settlement at block, only a secretary or the person, proved by a key, may read it. With that gate at off, any caller proved by a key may read it, but when the run has a later merged run to try, the gate who-closes-a-run-as-superseded is asked too, and at block it refuses a caller that may not close the run. A caller with no key is refused at both positions. Writes nothing.'), async (req) => {
    const asked = parse(whichRun, req.params, 'The run whose settlement is being read')
    return howARunWouldSettle({ runId: asked.run, workspaceId: workspaceOf(req), actor: actorFrom(req) })
  })

  app.get('/checks', route('check.list', 'remote', LIST_NOTE), async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(narrowedTo, req.query ?? {}, 'The list to narrow to')
    if (asked.startedBy !== undefined) {
      // AN AGENT STARTER MAY BE NAMED BY ITS ID OR ITS HANDLE, criterion I2. The one resolver says
      // which agent it is, and the stored startedBy it is compared with holds the registry id. A name
      // nobody bears is passed on as it is, and the list for it is empty. A person is matched by id.
      const kind = asked.startedByKind ?? 'agent'
      const found = kind === 'agent' ? theAgentAnArrivingReferenceNames(asked.startedBy, 'reading') : null
      const narrowed = whatOneStarterHasNotChecked(
        { kind, id: found === null ? asked.startedBy : found.agent.id },
        workspaceId,
      )
      return { ...narrowed, startedBy: asked.startedBy, workspaceId }
    }
    const every = runsThatSaidTheyAreFinished(workspaceId)
    const unreleased = every.filter((one) => one.stands.unreleasedFinish)
    // A RUN CLOSED AS SUPERSEDED BY A LATER RUN IS COUNTED APART FROM ONE NOBODY
    // RELEASED. It is settled rather than waiting, so folding it into
    // the unreleased number would say a check was still owed when the later run is where the work went.
    const superseded = every.filter((one) => one.stands.standing === 'superseded')
    return {
      list: every.map((one) => ({
        run: one.record.id,
        title: one.record.title,
        agent: one.stands.agent,
        stands: one.stands,
      })),
      says:
        every.length === 0
          ? 'No finished run in this project is waiting for a check.'
          : `${String(unreleased.length)} of ${String(every.length)} runs that said the work was finished have not been released.` +
            (superseded.length === 0
              ? ''
              : ` ${String(superseded.length)} ${superseded.length === 1 ? 'was' : 'were'} closed as superseded by a later run that was on the same branch, or that was checked and merged and holds its commits.`) +
            ' A subagent saying it is done does not end it. Closed-unchecked archives are left out of this list.',
      workspaceId,
    }
  })

  app.get('/checks/:run/eligibility', route('check.read', 'remote',
    'Resolve the four eligibility facts from the run and its history before allocating a check. Unknown facts refuse the check. ' +
      'An eligible run is then refused here with the five refusals of the verdict door that do not depend on what the check finds, so a check that could not end the run does not start. Writes nothing.'),
  async (req) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to check eligibility for')
    const decision = checkEligibilityForRun(asked.run, workspaceId)
    if (decision.eligible) {
      requireIndependentChecker(asked.run, workspaceId, actorFrom(req))
      whoAnswersTheCheck(asked.run, workspaceId, actorFrom(req))
    }
    return decision
  })

  app.get('/checks/legacy-unsealed', route('check.read', 'remote', 'Read the preserved inventory of runs that finished before sealed submissions.'), async (req) => ({ runs: legacyUnsealedInventory(workspaceOf(req)) }))
  app.post('/checks/:run/tool-started', route('check.assembled', 'remote', 'The office records the tool run and its log.'), async (req) => {
    const { run } = parse(whichRun, req.params, 'The run being checked')
    refuseAnActWithNoKey(req, A_CHECK_TOOL_START)
    recordInWorkspace(run, workspaceOf(req), theMessageReader(actorFrom(req)))
    const actor = actorFrom(req)
    if (actor.type !== 'agent' || actor.id !== THE_MESSAGE_WORKER_ID) throw new PanelError('Only the message worker records a tool start.', 403)
    const body = parse(z.object({ session: z.string().min(1), log: z.string().min(1), model: z.string().min(1), minutes: z.number().positive() }), req.body, 'The tool run')
    return recordCheckToolStarted({ run, ...body, workspaceId: workspaceOf(req) })
  })
  app.post('/checks/:run/tool-ended', route('check.assembled', 'remote', 'Only the message worker records a tool ending: {session, reason, ending?: "no-verdict", dshTranscriptRefused?: true}. dshTranscriptRefused says the check\'s dsh transcript was refused, and only the call that records the ending counts it. The dedicated ending means both answers completed without a verdict. The office may file one new ask through the ordinary check door; a second such ending keeps the failure and sends one quiet line to the secretary. Stops, start failures, settled runs and other failures start nothing. The reply carries failed, says and askedAgain when a new ask was filed.'), async (req) => {
    const { run } = parse(whichRun, req.params, 'The run being checked')
    refuseAnActWithNoKey(req, A_CHECK_TOOL_END)
    recordInWorkspace(run, workspaceOf(req), theMessageReader(actorFrom(req)))
    const actor = actorFrom(req)
    if (actor.type !== 'agent' || actor.id !== THE_MESSAGE_WORKER_ID) throw new PanelError('Only the message worker records a tool ending.', 403)
    const body = parse(z.object({ session: z.string().min(1), reason: z.string().min(1), ending: z.literal('no-verdict').optional(), dshTranscriptRefused: z.literal(true).optional() }), req.body, 'The tool ending')
    // A REFUSED DSH TRANSCRIPT IS COUNTED ONCE FOR THE CHECK: only by the call that writes the tool's ending on its
    // record. A retried call finds the ending already written and counts nothing.
    const theToolsEnding = () => { const extra = getRecord(body.session)?.data['extra']; return extra !== null && typeof extra === 'object' && 'inspectionEnding' in extra }
    const endedBefore = theToolsEnding()
    let nothingWritten: string | undefined
    const ended = recordCheckToolEnded(run, body.session, body.reason, workspaceOf(req), body.ending, () => { nothingWritten = nothingWrittenSentence({ kind: 'already-stored' }) })
    if (body.dshTranscriptRefused === true && !endedBefore && theToolsEnding()) gateMet('a-dsh-checks-transcript-is-its-own', 'block')
    return nothingWritten === undefined ? ended : { ...ended, says: nothingWritten, nothingWritten }
  })
  app.post('/checks/:run/ask-again', route('check.assembled', 'remote', 'The starter or a person asks the office to check this run again. This files a new ask with no automatic-repeat link; its completed no-verdict ending may lead to one automatic repeat. Running checks, closed or settled runs and ineligible checks keep their existing refusals.'), async (req) => {
    const { run } = parse(whichRun, req.params, 'The run to check again')
    recordInWorkspace(run, workspaceOf(req), theMessageReader(actorFrom(req)))
    let nothingWritten: string | undefined
    const theCheck = askForTheCheckAgain(run, workspaceOf(req), actorFrom(req), () => { nothingWritten = nothingWrittenSentence({ kind: 'no-finish-to-check' }) })
    return { theCheck, ...(nothingWritten === undefined ? {} : { nothingWritten }) }
  })

  app.get('/checks/:run', route('check.read', 'remote', READ_NOTE), async (req) => {
    const parts = thePartsOf(req, 'check.read')
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to read the check of')
    const reader = theMessageReader(actorFrom(req))
    const how = howThisRequestReadsTheSeal(req)
    // THE SEAL IS READ ON A THREAD OF ITS OWN, as the POST doors read it, so the server answers other requests while git
    // reads it. A message the caller may not read is refused first, as an id naming no run, as the reading refuses it.
    // THE PARTS ARE NAMED AS THE POST DOORS NAME THEIRS, so a slow read says which part was slow, and the seal is a wait
    // because it is read on a thread of its own (`theSealReadAheadOf`, the-seal-read-apart.ts).
    parts.part('the refusals before the seal is read', () => {
      refuseAMessageThisReaderMayNotRead(reader, asked.run, () => noRunHasThisId(asked.run))
    })
    const read = await parts.waited('the seal read on its own thread', () => theSealReadAheadOf(asked.run, workspaceId, how))
    const reads = parts.part('the reading of the run', () => whatThisReaderMaySeeOfTheRun(asked.run, workspaceId, reader, read))
    const savedChapters = parts.part('the saved chapters', () => theSavedChaptersOf(reads.run.data))
    const precedents = parts.part('the precedents of its chapters', () => reads.chapters.mustRead.flatMap((one) => precedentsOfChapter(one.chapter)))
    const workAreaSays = parts.part('the work area', () => changesInTheWorkArea(reads.workArea, []).says)
    const theCheck = parts.part('the check the office asked for', () => theCheckAskedFor(reads.run))
    const whatItWouldRead = parts.part('what the check would read', () => whatTheCheckWouldRead(reads.run))
    return {
      run: reads.run.id,
      title: reads.run.title,
      stands: reads.stands,
      agent: reads.agent,
      brief: reads.brief,
      chapters: reads.chapters,
      chaptersSays: reads.chaptersSays,
      // THE RUN'S SAVED ROUND CHAPTERS, or null because it saved none (round BL, item 2ao). The check tool holds a verdict
      // to them before posting it, with the door's own rule, and reads each chapter it names with the door's chapter names.
      savedChapters,
      precedents,
      reports: reads.reports.map((one) => ({
        id: one.record.id,
        title: one.record.title,
        chaptersRead: one.chaptersRead,
        says: one.says,
      })),
      wrote: reads.wrote,
      decisions: reads.decisions,
      decisionsComplete: reads.decisionsComplete,
      workArea: reads.workArea,
      workAreaSays,
      filesArea: reads.filesArea,
      checkout: reads.checkout,
      submission: reads.submission,
      // THE LINKS A RECORDS SEAL PINNED, as the office holds them now (round BM, item 2aq). Absent for any other seal.
      ...(reads.pinnedLinks === undefined ? {} : { pinnedLinks: reads.pinnedLinks }),
      submissionStatus: reads.submissionStatus,
      // WHAT THE OFFICE DID WHEN THIS RUN DECLARED ITS FINISH, or null because it did nothing —
      // which is what a run that has not finished, or one released before the office looked, holds.
      theCheck,
      // WHAT A CHECK OF THIS RUN WOULD READ: the five things the tool prints on --dry, so a person
      // reads them here instead of in a terminal. Null until one has been assembled, with a
      // sentence saying which of the two that is.
      whatTheCheckWouldRead: whatItWouldRead,
      whatTheCheckWouldReadSays: whatItWouldRead?.says ?? NOBODY_HAS_ASSEMBLED_ONE,
      workspaceId,
    }
  })

  app.post('/checks/:run/prompt', { bodyLimit: THE_CHANGES_TO_CHECK_BODY_LIMIT, ...route('check.prompt', 'remote', PROMPT_NOTE) }, async (req) => {
    const parts = thePartsOf(req, 'check.prompt')
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to build the check prompt for')
    // A MESSAGE THE CALLER MAY NOT READ IS REFUSED FIRST, as an id naming no run, before the eligibility
    // refusals can say what kind of record it is.
    const reader = theMessageReader(actorFrom(req))
    const theRefusals = (): void => {
      refuseAMessageThisReaderMayNotRead(reader, asked.run, () => noRunHasThisId(asked.run))
      requireCheckEligibility(asked.run, workspaceId)
      requireIndependentChecker(asked.run, workspaceId, actorFrom(req))
    }
    parts.part('the refusals before the seal is read', theRefusals)
    const body = parse(promptBody, req.body ?? {}, 'The changes to check')
    // THE SEAL IS READ ON A THREAD OF ITS OWN, so the server answers other requests while git reads it
    // (the-seal-read-apart.ts). The refusals are asked again after it, because a request answered meanwhile may have
    // changed what they read.
    const how: HowASealIsRead = {}
    const readApart = await parts.waited('the seal read on its own thread', () => theSealReadApart(asked.run, theWayASealIsVerified(how)))
    const read: HowASealIsRead = { ...how, readApart }
    parts.part('the refusals again after the seal was read', theRefusals)
    const reads = parts.part('the reading of the run', () => whatThisReaderMaySeeOfTheRun(asked.run, workspaceId, reader, read))
    const base = parts.part('the base', () => baseForSubmission(reads, body))
    const changes = parts.part('the changes in the work area', () => changesInTheWorkArea(reads.workArea, body.changes ?? [], body.only ?? null, theFilesAreaToSortBy(reads)))
    const needsJudgment = parts.part('the paths that need judgment', () => whatNeedsJudgment(changes, body.needsJudgment))
    const prompt = parts.part('the assembly of the prompt', () => assembleTheInspectorsPrompt({
      reads,
      changes,
      base,
      needsJudgment: needsJudgment?.used ?? null,
      needsJudgmentDropped: needsJudgment?.dropped ?? [],
      carries: body.carries ?? null,
      couldNotCarry: body.couldNotCarry ?? null,
      ...(body.pinnedLinksFile === undefined ? {} : { pinnedLinksFile: body.pinnedLinksFile }),
      workspaceId,
    }))
    // WHICH PATHS OF THE LIST THE CHECK USES AND WHICH WERE DROPPED, so the tool's verdict says it read the list as used.
    return {
      prompt: prompt.text,
      ...withoutTheText(prompt),
      changes,
      base,
      needsJudgment: needsJudgment === null ? null : { used: needsJudgment.used.map((one) => one.path), dropped: needsJudgment.dropped },
      verdictKeys: VERDICT_KEYS_THE_DOOR_ACCEPTS,
      // THE INSIDE PACKAGES THE PROMPT LISTS, so the tool can ask the model again for any it left out.
      packages: reads.packages,
      workspaceId,
    }
  })

  app.post('/checks/:run/assembled', { bodyLimit: THE_CHANGES_TO_CHECK_BODY_LIMIT, ...route('check.assembled', 'remote', ASSEMBLED_NOTE) }, async (req, reply) => {
    const parts = thePartsOf(req, 'check.assembled')
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to record an assembly for')
    refuseAnActWithNoKey(req, AN_ASSEMBLY)
    // A MESSAGE THE CALLER MAY NOT READ IS REFUSED FIRST, as an id naming no run, before the eligibility
    // refusals can say what kind of record it is.
    const reader = theMessageReader(actorFrom(req))
    const theRefusals = (): void => {
      refuseAnAssemblyFromAStoppedCheck(actorFrom(req).sessionId, workspaceId)
      refuseAMessageThisReaderMayNotRead(reader, asked.run, () => noRunHasThisId(asked.run))
      requireCheckEligibility(asked.run, workspaceId)
      requireIndependentChecker(asked.run, workspaceId, actorFrom(req))
    }
    parts.part('the refusals before the seal is read', theRefusals)
    const body = parse(promptBody, req.body ?? {}, 'The changes the check would read')
    // THE SEAL IS READ ONCE, ON A THREAD OF ITS OWN, and used by the reading and by what is kept, which each read it
    // before (the-seal-read-apart.ts). The refusals are asked again after it, as the prompt door asks them.
    const how: HowASealIsRead = {}
    const readApart = await parts.waited('the seal read on its own thread', () => theSealReadApart(asked.run, theWayASealIsVerified(how)))
    const read: HowASealIsRead = { ...how, readApart }
    parts.part('the refusals again after the seal was read', theRefusals)
    // THE SAME READING THE PROMPT DOOR ASSEMBLED FROM, for the same caller, so the size kept here is the
    // size of the prompt that caller was given.
    const reads = parts.part('the reading of the run', () => whatThisReaderMaySeeOfTheRun(asked.run, workspaceId, reader, read))
    const base = parts.part('the base', () => baseForSubmission(reads, body))
    const changes = parts.part('the changes in the work area', () => changesInTheWorkArea(reads.workArea, body.changes ?? [], body.only ?? null, theFilesAreaToSortBy(reads)))
    const needsJudgment = parts.part('the paths that need judgment', () => whatNeedsJudgment(changes, body.needsJudgment))
    // ASSEMBLED THE SAME WAY THE PROMPT ROUTE ASSEMBLES IT, by calling the same assembler with the
    // same arguments. A second way of working out the size would be a second number to keep right.
    const prompt = parts.part('the assembly of the prompt', () => assembleTheInspectorsPrompt({
      reads,
      changes,
      base,
      needsJudgment: needsJudgment?.used ?? null,
      needsJudgmentDropped: needsJudgment?.dropped ?? [],
      carries: body.carries ?? null,
      couldNotCarry: body.couldNotCarry ?? null,
      ...(body.pinnedLinksFile === undefined ? {} : { pinnedLinksFile: body.pinnedLinksFile }),
      workspaceId,
    }))
    // NOT `actor`. The office keeps this, not the inspector that handed the changes over: an update
    // row under the inspector's name on a record the worker created is what C22's guard looks for,
    // and it refused the one act with 403 until this was moved. Problem c5t2eEAGjQjy.
    const said = parts.part('keeping what the check would read', () => rememberWhatTheCheckWouldRead({
      runId: asked.run,
      workspaceId,
      prompt,
      changes,
      base,
      needsJudgment: needsJudgment === null || body.needsJudgment === undefined ? null : { asked: body.needsJudgment, list: needsJudgment },
      read: body.read ?? null,
      execution: body.execution,
      sessionId: actorFrom(req).sessionId,
      readApart,
    }))
    void reply.code(201)
    return { run: asked.run, whatTheCheckWouldRead: said, workspaceId }
  })

  app.post('/checks/:run/landed-by-hand', route('check.landed-by-hand', 'remote', LANDED_BY_HAND_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run whose content reached main by hand')
    const body = parse(theHandLanding, req.body, 'The commit and why')
    const written = recordAHandLanding({ runId: asked.run, workspaceId, commit: body.commit, because: body.because, actor: actorFrom(req) })
    void reply.code(201)
    return { ...written, workspaceId }
  })

  app.post('/checks/:run/closed-unchecked', route('check.closed-unchecked', 'remote', 'The secretary or the person closes a run unchecked, proved by a key, with the reason recorded.'), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const { run } = parse(whichRun, req.params, 'The run to close unchecked')
    const body = parse(z.object({ because: z.string().trim().min(1), decision: z.string().trim().min(1).optional() }).strict(), req.body, 'The reason and decision')
    const written = closeARunUnchecked({ runId: run, workspaceId, ...body, actor: actorFrom(req) })
    void reply.code(201)
    return { ...written, workspaceId }
  })

  app.post('/checks/:run/superseded', route('check.superseded', 'remote', SUPERSEDE_NOTE), async (req, reply) => {
    refuseAnActWithNoKey(req, { act: 'Closing a run as superseded', nothingWasDone: 'Nothing was written.' })
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to close as superseded')
    const body = parse(theSuperseding, req.body, 'The later run and why')
    const written = supersedeARun({
      runId: asked.run,
      workspaceId,
      by: body.by,
      because: body.because,
      ...(body.statement === undefined ? {} : { statement: body.statement }),
      actor: actorFrom(req),
    })
    void reply.code(201)
    return { ...written, workspaceId }
  })

  app.post('/checks/:run', route('check.answer', 'remote', ANSWER_NOTE), async (req, reply) => {
    const parts = thePartsOf(req, 'check.answer')
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to answer about')
    // BEFORE ANYTHING ABOUT THE RUN IS READ: a verdict comes with a key (A_VERDICT above).
    refuseAnActWithNoKey(req, A_VERDICT)
    // A REFUSAL FROM HERE ON IS A CHECK WHOSE ANSWER THE DOOR WOULD NOT TAKE, and it goes on the run's flow run
    // as a step of its own, "refused by the verdict door", never "failed" (wave 1 of the office flow, M1;
    // ask 2). The refusal itself is answered exactly as before, and `recorded` says the step beside it.
    try {
      return await answerTheCheck()
    } catch (error) {
      if (!(error instanceof PanelError) || error.status < 400 || error.status >= 500 || error.status === 404) throw error
      const recorded = parts.part('the refusal recorded on the flow run', () => recordAVerdictRefused(
        asked.run,
        actorFrom(req),
        { said: error.message, status: error.status, ...(error.code === undefined ? {} : { code: error.code }) },
        nowStamp(),
      ))
      if (recorded.written) error.recorded = theVerdictDoorRecordedIt(String(recorded.flowRun))
      throw error
    }

    async function answerTheCheck() {
      const theRefusals = (): void => {
        requireCheckEligibility(asked.run, workspaceId)
        requireIndependentChecker(asked.run, workspaceId, actorFrom(req))
        refuseAVerdictFromAnEndedCheckSession(actorFrom(req).sessionId, workspaceId)
      }
      parts.part('the refusals before the seal is read', theRefusals)
      // STORED AS THE INSPECTOR WROTE IT, with nothing left out that looks like a key.
      const body = parse(theAnswer, req.body, 'The check')
      if (body.verdict === 'released' && body.decisions?.some((one) => !one.holds || !one.authorityFits)) {
        throw new PanelError('A release cannot include a decision that does not hold or whose authority does not fit. Nothing was written.', 400)
      }
      const actor = actorFrom(req)
      // THE SEAL IS READ ONCE, ON A THREAD OF ITS OWN, from its sealed commit, and used here and in `releaseOrRefuse`,
      // which each read it before (the-seal-read-apart.ts). The refusals are asked again after it, because a request
      // answered meanwhile may have changed what they read.
      const how: HowASealIsRead = { theSealFromItsCommit: true }
      const readApart = await parts.waited('the seal read on its own thread', () => theSealReadApart(asked.run, theWayASealIsVerified(how)))
      parts.part('the refusals again after the seal was read', theRefusals)
      // ONE AND TWO, AND THE RUN IS ONE A VERDICT CAN END: the refusals the eligibility door already gave
      // before the check started, asked again now that the verdict has come. The seal is read from its sealed commit
      // here and in `releaseOrRefuse`, because the next round may have moved the run's folder on during the check.
      const { me, inspector, isTheInspector, theChecker } = parts.part('who answers the check', () => whoAnswersTheCheck(asked.run, workspaceId, actor, { ...how, readApart }))

      // THREE. A REFUSAL IS THE INSPECTOR'S ACT. A starter that is not satisfied does not release and
      // says so to its own agent; it does not need a group holding itself twice. The refusal, the
      // group and the amendment to decision 4Q_R6XoVBU0d are all about a check the checked party
      // cannot overrule, which is what an inspector is for.
      if (body.verdict === 'refused' && !isTheInspector) {
        throw new PanelError(
          `${me.id} is the starter of this agent and holds no ${theChecker?.name ?? 'checking'} card, so it may release the run but may not ` +
            'refuse it here. A refusal opens a group holding the worker, its supervisor and the inspector, and a ' +
            'starter refusing its own agent is that group with two of the three seats filled by one participant. ' +
            'Tell your own agent what is missing. Nothing was written.',
          403,
        )
      }

      // THREE. A REFUSAL NAMES WHAT IS MISSING AND WHAT SAYS SO. Criterion C21, checked at the door so
      // that no refusal can be an opinion: the rule it rests on is what makes it arguable.
      // The rule is src/shared/the-verdict-door.ts's whatARefusalLacks, which the inspector tool asks before it posts.
      const says = body.says ?? null
      if (body.verdict === 'refused') {
        if (whatARefusalLacks(body).length > 0) {
          throw new PanelError(`${A_REFUSAL_NAMES} Nothing was written.`, 400)
        }
        // AN INVARIANT IS ONE USER.md LISTS, read from that file and not from a range typed here (decision
        // OTB8vrTnnvhL, acceptance finding 69): the file is where the invariants are written.
        if (says?.invariant !== undefined) {
          const invariants = theInvariantsTheRulesList()
          if (invariants.listed === null) {
            throw new PanelError(
              `A refusal resting on invariant ${String(says.invariant)} cannot be checked: ${invariants.why}. Nothing was written.`,
              409,
            )
          }
          if (!invariants.listed.some((one) => one.number === says.invariant)) {
            throw new PanelError(
              `Invariant ${String(says.invariant)} is not one USER.md lists. It lists ` +
                `${invariants.listed.map((one) => `${String(one.number)}, ${one.name}`).join('; ')}. Nothing was written.`,
              400,
            )
          }
        }
      }

      // THE INSIDE PACKAGES THE RUN HANDED BACK ARE JUDGED IN THE INSPECTOR'S VERDICT, released or refused, every point of
      // each, and asked before anything is written. A point that does not hold is listed for the line's next round, and
      // never refuses the release. The list holds only those points (`onlyThePointsAreListed`): what else the check
      // listed is named as left off it. It is not a part of its own: the door's parts are one fixed list, and its time is
      // counted outside them.
      let theirPackages: { given: AVerdictsPackage[]; notHeld: string[] } | null = null
      let ofPackages = false
      if (!isTheInspector || inspector === null) {
        if (body.packages !== undefined) throw new PanelError(ONLY_THE_INSPECTOR_JUDGES_PACKAGES, 400)
      } else {
        const waiting = thePackagesThisRunHandedBack(asked.run, workspaceId)
        ofPackages = aCheckOfHandedBackPackages(waiting)
        const given = body.packages ?? []
        if (waiting.packages.length > 0 || given.length > 0) {
          assertTheInspectorOfTheRun(asked.run, workspaceId, inspector, actor)
          const lacks = whatAVerdictsPackagesLack(waiting.packages, given)
          if (lacks.length > 0) throw new PanelError(theVerdictsPackagesLack(lacks), 400)
          theirPackages = { given, notHeld: thePointsThatDoNotHold(waiting.packages, given) }
        }
      }
      const listing = (ofPackages ? onlyThePointsAreListed : theListedFaultsWith)(body.check, body.listed, theirPackages?.notHeld ?? [])

      // A FINISHED CHECK IS NOT THROWN AWAY OVER ONE WORD. Problem `y_HP9aIa0Bd6`: a check ran for
      // twelve minutes, its chapters line named a word the reading ladder has not got, and the door
      // refused the whole submission with 400, so the verdict was lost and the run stayed inspecting
      // with its worktree kept. The verdict and everything else are readable, so the check is recorded;
      // the words of the chapters line that could not be read are kept as text on the release or the
      // refusal. `readTheChaptersNamed` reads every entry, so one bad word does not hide the others.
      const chaptersRead = parts.part('the chapters the check says it read', () => readTheChaptersNamed(body.chaptersRead))
      const chaptersReadUnreadable = chaptersRead.problems.map((one) => `${one.said} — ${one.because}`)

      // ONE TRANSACTION FOR THE VERDICT AND EACH PACKAGE'S CHECK, so neither is kept without the other. The verdict is
      // written first: the release reads what the inspector changed after the assembly, and a package's check is not that.
      const checked = parts.part('the release or the refusal', () => sqlite.transaction(() => {
        const written = releaseOrRefuse({
          runId: asked.run,
          workspaceId,
          by: me,
          how: isTheInspector ? 'an inspector' : 'its starter',
          inspector: isTheInspector ? inspector : null,
          actor,
          theSealFromItsCommit: true,
          readApart,
          check: {
            verdict: body.verdict,
            check: listing.check + (body.decisions === undefined ? '' : `\n\nDecision judgments:\n${JSON.stringify(body.decisions)}`),
            missing: body.missing ?? [],
            read: body.read ?? null,
            wroteIntoTheOffice: body.wroteIntoTheOffice,
            says:
              says === null
                ? null
                : { chapter: says.chapter ?? null, precedent: says.precedent ?? null, invariant: says.invariant ?? null },
            chaptersRead: chaptersRead.named,
            chaptersReadUnreadable: chaptersRead.problems,
            ...(body.judged === undefined ? {} : { judged: body.judged }),
            ...(body.traced === undefined ? {} : { traced: body.traced }),
            ...(listing.listed === undefined ? {} : { listed: listing.listed }),
          },
        })
        for (const one of theirPackages?.given ?? []) checkThePackage({ taskId: one.task, workspaceId, actor, points: one.points })
        return written
      })())
      // THE MERGE QUEUE HEARS THE VERDICT. Sandbox v1, piece P7: an entry pinned on this run's seal is
      // judged by a release and bounced by a refusal, and an entry waiting on a scoped check of this
      // run goes on to testing or bounces. It is asked here, after the verdict is on the run, because
      // the queue reads the verdict off the run and nothing else; nothing here starts a process.
      const mergeQueue = parts.part('the merge queue hearing the verdict', () => theMergeQueueHearsAVerdict({ runId: asked.run, workspaceId, actor }))
      // A REFUSAL'S STARTER IS TOLD ONCE: by the bounce notice when the queue bounced an entry on it, otherwise by
      // its own line, written now (check FtAaQVz8KES9).
      // The line itself is spent here, so the reply does not carry it.
      const { refusalForTheStarter: _spent, ...written } = parts.part('the starter told of a refusal', () =>
        theStarterHearsTheRefusal(checked, mergeQueue.bounceNotices, { workspaceId, runId: asked.run, actor }))
      void reply.code(201)
      return {
        ...written,
        // THE REPLY SAYS SO, so the checker knows the words it sent were not read and what the ladder
        // accepts, even though the verdict stands.
        ...(chaptersReadUnreadable.length === 0
          ? {}
          : {
              chaptersReadUnreadable,
              says:
                `${written.says} The chapters this check says it read could not be read: ` +
                `${chaptersReadUnreadable.join(' ')} The check was recorded anyway.`,
            }),
        ...(mergeQueue.moved.length === 0 && mergeQueue.waiting.length === 0 ? {} : { mergeQueue }),
        workspaceId,
      }
    }
  })

  /**
   * A STANDARD CHANGE, RELEASED WITH NO INSPECTOR (the owner's approved design for how lines merge; wave 13r round F).
   * The rule is src/shared/standard-change.ts's; the release is releaseOrRefuse's, the same act an inspector's release
   * is, with the standard-change rule as its how. Every answer but a release is a 409 that says why the change goes the
   * ordinary way, and writes nothing, so the tool goes on to start the inspector.
   */
  app.post('/checks/:run/standard', route('check.standard', 'remote', STANDARD_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to release as a standard change')
    refuseAnActWithNoKey(req, A_STANDARD_RELEASE)
    requireCheckEligibility(asked.run, workspaceId)
    requireIndependentChecker(asked.run, workspaceId, actorFrom(req))
    refuseAVerdictFromAnEndedCheckSession(actorFrom(req).sessionId, workspaceId)
    const body = parse(theStandardAsk, req.body, 'The standard release')
    const actor = actorFrom(req)
    const { me, inspector, isTheInspector } = whoAnswersTheCheck(asked.run, workspaceId, actor)
    if (!isTheInspector || inspector === null) {
      throw new PanelError(
        `${me.id} holds no inspector card. Only the inspector's check tool may ask for a standard release, because it is ` +
          'the check that decides whether an inspector reads the change. Nothing was written.',
        403,
      )
    }
    const ordinary = (why: string): never => {
      throw new PanelError(`${why} Nothing was written.`, 409)
    }
    if (body.read.only !== undefined || body.read.needsJudgment !== undefined) {
      ordinary('A standard release reads the whole seal, and this one names scoped paths or paths to judge, so it goes the ordinary way.')
    }
    const run = getRecord(asked.run)!
    if (theMergeEntryACheckAgainIsFor(run) !== null) {
      ordinary("This run is the merge queue's check again, which an inspector reads, so it goes the ordinary way.")
    }
    const sealed = readRunSeal(asked.run)
    if (sealed === null || sealed.seal.kind !== 'git' || sealed.seal.git === null) {
      ordinary(`Only a git seal may declare a standard change, and this run's seal is ${sealed === null ? 'missing' : sealed.seal.kind}, so it goes the ordinary way.`)
    }
    const seal = sealed!.seal
    const changed = seal.git!.files.map((one) => ({ path: one.path, deleted: one.hash === null }))
    if (seal.standard === undefined) ordinary(whatAStandardDeclarationFinds(undefined, changed, body.toolRead).why)
    if (seal.standard !== body.kind) {
      ordinary(`The seal declares ${String(seal.standard)}, and the check tool asked for ${body.kind}, so it goes the ordinary way.`)
    }
    const kind = body.kind
    if (theSwitchOfAStandardKind(kind) !== '1') {
      ordinary(`The switch ${THE_GATE_OF_A_STANDARD_KIND[kind]} is off, so ${A_STANDARD_KIND_SAYS[kind]} goes the ordinary way.`)
    }
    const found = whatAStandardDeclarationFinds(seal.standard, changed, body.toolRead)
    if (!found.matches) ordinary(found.why)
    // THE CHANGED-TEST SELECTION IS DERIVED FROM THE SEAL, NOT TAKEN FROM THE TOOL. The tool runs the changed test files
    // when there are any; when there are none it runs no test process and the queue's related run is the proof. A claim
    // that names a different set, or claims changed-tests ran when the seal cannot support it, is refused in words.
    const runnable = theChangedTestFiles(changed)
    const changedTests = body.checks.find((one) => one.name === 'changed-tests')
    const oldRelatedTests = body.checks.find((one) => one.name === 'related-tests')
    let theOlderToolsWords = ''
    if (runnable.length === 0) {
      if (changedTests !== undefined) {
        ordinary(
          `The seal changes no runnable test file (a path under tests/ ending .test.ts), and the check says changed-tests ran` +
            ` after naming ${changedTests.argv.slice(2).join(', ') || 'no file'}, so the claim does not match the diff and it goes the ordinary way.`,
        )
      }
      if (oldRelatedTests !== undefined) {
        ordinary(
          'The seal changes no runnable test file, and this check carries an older related-tests answer; an empty selection cannot be ' +
            'shown by that older shape, so it goes the ordinary way.',
        )
      }
    } else if (changedTests === undefined) {
      // AN OLDER CHECK TOOL RAN THE RELATED LIST, which names the changed test files. Accept that shape in words, but only
      // when its answer names every changed test file, so it proves the same set.
      if (oldRelatedTests === undefined) ordinary('changed-tests did not run, so it goes the ordinary way.')
      if (oldRelatedTests!.code === null) ordinary('related-tests did not run to an end, so it goes the ordinary way.')
      if (oldRelatedTests!.code !== 0) ordinary(`related-tests exited ${String(oldRelatedTests!.code)}, so it goes the ordinary way.`)
      const oldShape = ['node', 'tools/run-named-tests.mjs', '--list', 'related', '--base']
      if (!oldShape.every((word, at) => oldRelatedTests!.argv[at] === word) || typeof oldRelatedTests!.argv[5] !== 'string' || oldRelatedTests!.argv[5] === '') {
        ordinary('The older check tool\'s related-tests answer is not the named runner\'s related-list command, so it goes the ordinary way.')
      }
      const named = oldRelatedTests!.argv.slice(6)
      const missing = runnable.filter((path) => !named.includes(path))
      if (missing.length > 0) {
        ordinary(
          `The older check tool's related-tests answer does not name ${missing.join(', ')}, so it does not prove the changed test files and it goes the ordinary way.`,
        )
      }
      theOlderToolsWords = ' An older check tool ran the related list, which names the changed test files.'
    } else {
      if (changedTests.argv[0] !== 'node' || changedTests.argv[1] !== 'tools/run-named-tests.mjs') {
        ordinary('The changed-tests answer is not the named runner\'s command, so it goes the ordinary way.')
      }
      if (changedTests.code === null) ordinary('changed-tests did not run to an end, so it goes the ordinary way.')
      if (changedTests.code !== 0) ordinary(`changed-tests exited ${String(changedTests.code)}, so it goes the ordinary way.`)
      const named = changedTests.argv.slice(2)
      const notRunnable = named.filter((path) => !runnable.includes(path))
      const missing = runnable.filter((path) => !named.includes(path))
      if (notRunnable.length > 0 || missing.length > 0) {
        ordinary(
          `The changed-tests answer names ${notRunnable.length > 0 ? notRunnable.join(', ') : 'no changed test file it should'}, and the seal changes ` +
            `${runnable.join(', ')}, so the claim does not match the diff and it goes the ordinary way.`,
        )
      }
    }
    // EACH OF THE KIND'S OTHER CHECKS RAN ON THE SEALED TREE AND EXITED 0, or the change goes the ordinary way.
    for (const name of THE_CHECKS_OF_A_STANDARD_KIND[kind]) {
      if (name === 'changed-tests') continue
      const ran = body.checks.find((one) => one.name === name)
      if (ran === undefined) ordinary(`${name} did not run, so it goes the ordinary way.`)
      if (ran!.code === null) ordinary(`${name} did not run to an end, so it goes the ordinary way.`)
      if (ran!.code !== 0) ordinary(`${name} exited ${String(ran!.code)}, so it goes the ordinary way.`)
    }
    const checksThatRan = THE_CHECKS_OF_A_STANDARD_KIND[kind].flatMap((name) => {
      if (name !== 'changed-tests') return [{ name, code: 0 }]
      if (runnable.length === 0) return []
      return [{ name: changedTests === undefined ? 'related-tests' : 'changed-tests', code: 0 }]
    })
    const theSelection =
      runnable.length === 0
        ? " The changed-test selection is empty: no changed file is a runnable test file (a path under tests/ ending .test.ts), so no test process ran, and the merge queue's related run is the proof of the tests."
        : theOlderToolsWords
    const standard = {
      kind,
      why: `${found.why}${theSelection}`,
      checks: checksThatRan,
    }
    const checked = releaseOrRefuse({
      runId: asked.run,
      workspaceId,
      by: me,
      how: 'the standard-change rule',
      // NO ROW FOR THE RULE OF CRITERION C22. It asks what the inspector changed between the check's assembly and its
      // verdict, and a standard change has neither: no model reads it, so nothing is assembled.
      inspector: null,
      actor,
      check: { verdict: 'released', check: whatAStandardReleaseChecked(standard), missing: [], says: null, read: body.read, chaptersRead: [] },
      standard,
    })
    const mergeQueue = theMergeQueueHearsAVerdict({ runId: asked.run, workspaceId, actor })
    const { refusalForTheStarter: _spent, ...written } = checked
    void reply.code(201)
    return { ...written, ...(mergeQueue.moved.length === 0 && mergeQueue.waiting.length === 0 ? {} : { mergeQueue }), workspaceId }
  })

  /**
   * THE PRESS THAT CLOSES A RUN. Criterion C29.
   *
   * It is a separate route from the one act above because it is a separate act by a separate party:
   * the check is the inspector's and this is the supervisor's, and folding the second into the first
   * would make a release a close again, which is exactly what C29 says it is not.
   */
  app.post('/checks/:run/confirm', route('check.confirm', 'remote', CONFIRM_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const asked = parse(whichRun, req.params, 'The run to confirm the report of')
    const body = parse(theConfirmation, req.body, 'The confirmation')
    const actor = actorFrom(req)
    const me = participantForActor(actor)

    // THE CALLER IS SOMEBODY A REGISTRY HOLDS, for the reason the one act asks it: a confirmation
    // that names nobody is not a confirmation, and a run closed by a name no registry holds has no
    // answer to who ended it.
    if (me === null) {
      throw new PanelError(
        `Nothing is registered as "${actor.id}", so it cannot confirm anything. A confirmation says who closed ` +
          'the run, and a name no registry holds says nobody. Register with POST /api/agents/started. Nothing ' +
          'was written.',
        403,
      )
    }

    const written = confirmTheReport({
      runId: asked.run,
      workspaceId,
      by: me,
      because: body.because,
      actor,
    })
    // A CONFIRMATION COVERS A PINNED ENTRY AT A REVIEW LEVEL WITH NO INSPECTOR, so the queue hears it as it hears a verdict.
    const mergeQueue = theMergeQueueHearsAVerdict({ runId: asked.run, workspaceId, actor })
    void reply.code(201)
    return { ...written, ...(mergeQueue.moved.length === 0 && mergeQueue.waiting.length === 0 ? {} : { mergeQueue }), workspaceId }
  })
}

/** The prompt's measurements without the prompt itself, so the reply carries the text once. */
function withoutTheText(prompt: ReturnType<typeof assembleTheInspectorsPrompt>): {
  bytes: number
  chaptersAt: { chapter: number; level: string; bytes: number }[]
  wholeCodeBytes: number
  says: string
} {
  return {
    bytes: prompt.bytes,
    chaptersAt: prompt.chaptersAt,
    wholeCodeBytes: prompt.wholeCodeBytes,
    says: prompt.says,
  }
}
