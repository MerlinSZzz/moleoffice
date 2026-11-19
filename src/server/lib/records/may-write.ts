// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MAY WRITE: the guard on a write to a record, what a run was served, and the checks on what a
 * caller may name as a parent or file a session for. They were moved out of
 * src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`; the governance guards
 * import assertMayWrite, assertMayWriteASandbox, assertMayWriteAUseOn and assertMayWriteServed from
 * this file. This file reads `theOfficeIsBindingARunToAnIdentityItMade` from ./addressed-run.ts
 * inside a function body.
 */

import { gatePosition } from '../../../config/settings.mjs'
import { SESSION_KIND } from '../../db/agent-identity.ts'
import { sqlite } from '../../db/client.ts'
import { everyAgentAStoredStampCouldName } from '../../db/every-agent-a-stored-stamp-could-name.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { theFolderTheSandboxFieldNames } from '../../db/the-folder-the-sandbox-field-names.ts'
import { ROLE_CARD_WORDS_KIND } from '../../db/the-words-records-of-each-card.ts'
import { aRefusalForAnUnvouchedSandbox } from '../a-refusal-for-an-unvouched-sandbox.ts'
import { theBookingDoorsAreWriting } from '../booking-door.ts'
// WHAT A TOOL AND A TOOL CATEGORY NAME, asked of the database on both write paths.
// ONE LIVE WORDS RECORD PER DECLARED CARD, asked of the database on both write paths and on a restore.
import { refuseACardWordsActOffTheOwnersDecision } from '../card-words.ts'
import { theChecklistDoorsAreWriting } from '../checklist-door.ts'
import { theCounterDoorsAreWriting } from '../counter-door.ts'
// WHETHER THE DRAFT SEND DOOR IS THE WRITER. That module imports nothing, so reading it here starts no
// loop. `assertMayWrite` asks it.
import { theDraftSendDoorIsWriting } from '../draft-door.ts'
import { theOfficeIsWritingAFlowRun } from '../flow-run-door.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { theOfficeIsWritingAHostJob } from '../host-job-door.ts'
import { theKeyWithThisIdIsItsHoldersOwn } from '../keys.ts'
// WHETHER THE MERGE QUEUE IS THE WRITER. Sandbox v1, piece P6. That module imports nothing, so
// reading it here starts no loop; `assertMayWrite` below is the one place that asks it.
import { theMergeQueueIsWriting } from '../merge-entry-door.ts'
// WHICH MERGE ENTRIES A CHECK IS FOR, AND WHO SUBMITTED EACH: the door on who may file a session serving the inspector
// reads them. READ ONLY INSIDE A FUNCTION BODY: lib/merge-queue.ts imports records.ts, which imports may-write.ts, so
// the two are a cycle.
import { readMergeEntry, theMergeEntriesACheckOfThisRunIsFor } from '../merge-queue.ts'
import { everyAgentASessionsDataNames, theAgentOnlyASessionAnswersAs } from '../messages.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../not-proved-the-person.ts'
import { NOTICE_RULES_KIND, noticeRulesDoorIsWriting } from '../notice-rules-door.ts'
import { PanelError } from '../panel-error.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { theProjectRulesDoorsAreWriting } from '../project-rules-door.ts'
import { theCanonicalAgentId, theStoredWorkerRunKey } from '../registry-aliases/worker-runs.ts'
// WHAT AN AGENT OF EACH ROLE MAY DO. The role words are in design/permissions/roles.json and
// nowhere else, so the check on a write asks the declaration this server read at start rather
// than a list of its own. lib/roles.ts opens the file and imports nothing from here, so there is
// no loop: it takes the governance guards' act keys as an argument from buildApp instead.
import { theRoleCards, theRoleCardsAreRead } from '../roles.ts'
import { resolveSessionRef } from '../resolve-session-ref.ts'
// A RUN ENDING RELEASES THE CLAIMS IT WAS HOLDING, in the same act, by every path. Criterion F2.
// This edge points back at records.ts because claims.ts reads records one way
// already; the cycle is the shape lib/sealed-tip.ts has, and neither side calls the other at module
// load.
import { type AProcessToRead, theProcessesAListingReads } from '../resources.ts'
// THE DEAD-LETTER SWEEP'S RULE (c), for a letter from the person to a retired agent, asked while the letter is
// written. lib/deadletters.ts imports records.ts, so the two are a cycle of the same safe shape: read only inside
// a function body.
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { type ARunNamed, theAgentsWhoseOwnRunThisIs, theRunsOwnAgents, theRunTheHeaderNames, whyAnAgentsOwnKeyDoesNotHold } from '../the-run-a-key-holds.ts'
import { theSandboxFolderOf } from '../the-sandbox-folder-of.ts'
import { theStarterEachStringNames } from '../the-starter-each-string-names.ts'
import { theTurnDraftsAreWriting } from '../turn-draft-door.ts'
import { whichDecisionOfTheOwnersTheseWordsStandOn } from '../warrants.ts'
// WHETHER A CALLER HOLDS THE OWNER'S AUTHORITY IN A TEST WORLD. Criterion P84, rule 5 of chapter 8.
// It reads the environment and nothing else, so importing it here makes no loop.
import { whoMayDoThePersonsActsHere } from '../worldauthority.ts'
// WHICH AGENT A `to`, A `sentBy` OR A `who` IN THE BODY NAMES. Criterion I2: those are arriving
// references, so they go through the one resolver and what is stored is the id it answers.
import { type RegisteredAgent } from '../participants.ts'
import { type Actor } from './actor.ts'
import { whoFiled } from './change-log.ts'
import { aSignedItemDoesNotCarryARegulation, holdsTheInspectorCard, theChainOfStartersAbove, theCoreOfADecisionIsItsMakers, theDecisionItselfWouldChange, theDecisionWasRecordedBy, thePersonIsFilingThisSession } from './decision-core.ts'
import { wordsSinceChanged } from './fork-settling.ts'
import { humanOnlyRefusal, type HumanOnlyVerb, VERBS_THE_OWNERS_WORDS_COVER, WRITING } from './human-only.ts'
import { actsForThePerson, aRaiseCarriesIt, theSecretaryActingForThePerson, type WhatThePressTouches } from './own-words.ts'
import { getRecord } from './reading.ts'
import { type RecordPatch } from './record-patch.ts'
import { sameAgent } from './same-agent.ts'
import { aClaimToBeThePerson, aFinishedRunsKeyAskedForMore, aKeyOrTheOfficesOwnCodeCarriesIt, ARRIVAL_IS_NOT_A_CLAIM, arrivalDetail, aSealedRunWritesOnlyItsServed, aStampNamesTheOfficeItself, isSomebodyMoleOfficeCannotPlace, ONE_PERSON_AND_THE_NAME_IS_ITS_OWN, ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM, strangerDetail, theAgentThatStarted, theCallerIsTheOfficeItself, theConversationsARunNames, theHandleOfAStoredAgent, theOfficeIsCopyingItsDefaults, theProvedPerson, theSecretaryOfThisOffice, theStateAWriteLeaves, WHO_MAY_CARRY_ANOTHER_AGENTS_CONVERSATION } from './served-doors.ts'
import { theCallersAgentRow } from './the-callers-agent-row.ts'
import { assertMayDecide } from './the-persons-own-acts.ts'
import { A_BOOKING_IS_WRITTEN_BY_ITS_DOORS, BOOKING_KIND, THE_BOOKING_DOORS } from '@shared/bookings.ts'
import { A_CHECKLIST_IS_WRITTEN_BY_ITS_DOORS, CHECKLIST_KIND, THE_CHECKLIST_DOORS } from '@shared/checklists.ts'
// THE KEY A RUN'S DISCOVERY STAMP IS KEPT UNDER. lib/sessions.ts imports records.ts too, so the value is read only
// inside a function body (`theConversationsARunNames`).
import { DISCOVERY_KEY } from '@shared/discovery-stamp.ts'
import { A_COUNTER_IS_WRITTEN_BY_ITS_DOORS, COUNTER_KIND, THE_COUNTER_DOORS } from '@shared/counters.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { A_DESIGN_REMINDER_IS_WRITTEN_BY_ITS_DOORS, DESIGN_REMINDER_KIND, THE_DESIGN_REMINDER_DOORS } from '@shared/design-reminders.ts'
import { aSentDraftStandsAsItWasSent, DRAFT_KIND, sentAsOf } from '@shared/drafts.ts'
import { A_PUSH_IS_WRITTEN_BY_ITS_DOORS, EMERGENCY_PUSH_KIND, THE_PUSH_DOORS } from '@shared/emergency-push.ts'
import { A_FLOW_RUN_IS_WRITTEN_BY_THE_OFFICE, FLOW_RUN_KIND, THE_FLOW_RUN_DOORS } from '@shared/flow-run.ts'
import { A_HOST_JOB_IS_WRITTEN_BY_ITS_DOORS, HOST_JOB_KIND, THE_HOST_JOB_DOORS } from '@shared/host-jobs.ts'
import { A_MERGE_ENTRY_IS_WRITTEN_BY_ITS_DOORS, MERGE_ENTRY_KIND, THE_MERGE_QUEUE_DOORS } from '@shared/merge-queue.ts'
import { sameParticipant } from '@shared/messages.ts'
import { named } from '@shared/named.ts'
import { theOutlineChanges, theOutlineOfAChapter } from '@shared/office-rules.ts'
import { type ParticipantRef } from '@shared/participants.ts'
import { A_DESIGN_REVIEW_IS_WRITTEN_BY_ITS_DOOR, A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS, DESIGN_REVIEW_KIND, PROJECT_CHAPTER_KIND, THE_DESIGN_REVIEW_DOOR } from '@shared/project-rules.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import { REGULATION_KIND } from '@shared/regulation.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { sameJson } from '@shared/same-json.ts'
import { thePersonIsProved, theWordsAllowThis } from '@shared/the-person-proved.ts'
import { TOOL_USES_FIELD } from '@shared/toolset.ts'
import { isATurnDraft, ONLY_THE_OFFICE_WRITES_A_TURN_DRAFT } from '@shared/turn-drafts.ts'
import { HUMAN_ONLY_KINDS, type PanelRecord, type RecordKind } from '@shared/types.ts'
import { kindWord } from '@shared/words.ts'
import { aWorkerRunIsStartingUnder, theLauncherIsForThisWorkerRun, WORKER_RUNS } from '@shared/worker-runs.ts'
import { theOfficeIsBindingARunToAnIdentityItMade } from './addressed-run.ts'

// ============================================================================ what a run was served

export function assertMayWriteServed(actor: Actor, input: { recordId: string; workspaceId: string; data: unknown }): void {
  // THE PERSON, PROVED, as on a run's end: the key window's bare claim is not the person here.
  if (theProvedPerson(actor)) return
  if (actor.type === 'agent') {
    // THE RUNNER AT THE RUN'S END IS AN AGENT THAT ANSWERS FOR THE RUN: its own agent when the launcher holds the run's
    // key, and the agent that started or filed it when it does not, each with a key. A session header naming the run is
    // not asked: the office never checks one against the caller, so a stranger could name any run in it.
    if (anAgentThatAnswersForTheRun(actor, input)) return
    if (theSecretaryOfThisOffice(actor)) return
  }
  const met = () => gateMet('who-writes-a-runs-conditions')
  if (gatePosition('who-writes-a-runs-conditions') !== 'block') return void met()
  const caller = actor.type === 'agent' ? (theCallersAgentRow(actor)?.handle ?? actor.id) : actor.id
  throw gateMetOnceTheWriteIsTakenBack(new PanelError(
    `A run's served conditions are the run's own: they are written by the runner at the run's end, from the run's ` +
      `own runtime, which is the run's own agent or the agent that started it or filed it, and a hand-written value ` +
      `is accepted only from the person with their key or the secretary holding the ` +
      `${theRoleCardsAreRead() ? theRoleCards().elevation.onlyThisCardCanHoldIt : THE_SECRETARY} card. This request ` +
      `came from ${actor.type} "${caller}", which is none of them; a session header naming the run does not make a ` +
      `caller the run.${aClaimToBeThePerson(actor)}${aClaimToAnswerForTheRun(actor, input)} Nothing was written.`,
    403,
  ), met)
}

export { sameJson }

/**
 * A RUN DOES NOT COME TO CARRY ANOTHER AGENT'S CONVERSATION ON AN AGENT'S KEY, on the create door or the patch door.
 * The office finds a conversation's runs by either place a run names one (`theConversationsARunNames`), so a run that
 * names another agent's conversation reads as part of that agent's work. `conversations` are the ones the write adds:
 * all a new run names, or those a patched run did not name before. Every live run that names one of them, in any
 * project, is asked whose own run it is (`theAgentsWhoseOwnRunThisIs` in lib/the-run-a-key-holds.ts). Where it is
 * another agent's own run and not the writer's, the write is refused. Whether that run still runs is not asked: a
 * session hook files its agent's own conversation again after the run that named it has ended. `patched` is the run a
 * patch changes, and null for a new run.
 *
 * Only a request proved by an agent's key is asked: an agent's own key, or a run key, acting for an agent or not. The
 * office's key and the person's keys are taken as given. A request with no key proves nobody, so the caller could send
 * the other agent's name as easily; that is the key window's question.
 */
export function assertARunCarriesNoOtherAgentsConversation(actor: Actor, conversations: string[], patched: string | null): void {
  if (actor.provedBy !== 'an-agent-key') return
  if (conversations.length === 0) return
  const marks = conversations.map(() => '?').join(', ')
  const runs = sqlite
    .prepare(
      "SELECT id, data FROM records WHERE kind = 'session' AND deleted_at IS NULL " +
        `AND (json_extract(data, '$.providerSession') IN (${marks}) OR json_extract(data, ?) IN (${marks})) ORDER BY created_at, id`,
    )
    .all(...conversations, `$.extra.${DISCOVERY_KEY}.externalId`, ...conversations) as { id: string; data: string }[]
  const writer = theCallersAgentRow(actor)
  for (const row of runs) {
    const run = { id: row.id, data: JSON.parse(row.data) as Record<string, unknown>, deleted: false }
    const whose = theAgentsWhoseOwnRunThisIs(run)
    if (whose.length === 0 || (writer !== null && whose.includes(writer.id))) continue
    const conversation = theConversationsARunNames(run.data).find((one) => conversations.includes(one)) ?? conversations[0]
    const theirs = whose.map((id) => `"${theHandleOfAStoredAgent(id)}"`).join(' and ')
    const naming = patched === null ? 'This new run names' : `This write would make run ${patched} name`
    throw new PanelError(
      `${naming} the conversation "${conversation}". Run ${run.id} names it too, and that run is the own run ` +
        `of agent ${theirs}. ${WHO_MAY_CARRY_ANOTHER_AGENTS_CONVERSATION}. This request came from agent ` +
        `"${writer?.handle ?? actor.id}", with an agent's key, and that run is not its own. Nothing was written.`,
      403,
    )
  }
}

/**
 * A RUN'S SANDBOX IS WRITTEN ONCE, AND NEVER BY THE RUN ITSELF. A files seal reads the sandbox folder recorded
 * here to say where the run
 * could NOT have written, and an original the run names outside that folder then counts as one. So the
 * one fact the seal trusts must come from outside the model's reach. The launcher writes it, with the
 * starter's identity, before the run's model starts. A run that could write it could name a folder it
 * never worked in and make anything outside that folder look like an original, and a run that could
 * rewrite it could do the same later. The person may still correct it; nobody else changes it once set.
 */
export function assertMayWriteASandbox(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown; stored: unknown; next: unknown }): void {
  if (actor.type === 'human') return
  // WRITTEN ONCE, asked first, so a change of a stored one is refused by this rule whoever asks. Nothing after the filing
  // changes it: tools/sandbox-start.mjs writes it with --run only where none is stored, and refuses a run naming another.
  if (run.stored !== undefined && run.stored !== null) {
    throw new PanelError(
      "A run's sandbox is written once, by the launcher that started it, and only the person changes it after " +
        `that: a files seal trusts it to say where the run could not have written. This request came from ${actor.type} ` +
        `"${actor.id}". Nothing was written.`,
      403,
    )
  }
  // WHICH AGENT THE RUN SERVES IS READ BY THE ONE READER, `theAgentARunServes` in lib/worker.ts, the
  // same one the message worker asks. The agent it names is compared with the live caller through
  // `sameAgent`, never by string: a caller may send its id or its handle, and a request carrying only
  // a key is the key holder's registry id.
  const held = isJsonObject(run.data) ? (run.data as Record<string, unknown>) : {}
  const serving = theAgentARunServes(held)?.id ?? null
  const said = actor.sessionId === undefined || actor.sessionId === null || String(actor.sessionId).trim() === ''
    ? null
    : resolveSessionRef(actor.sessionId, run.workspaceId)
  const itsOwnAgent = typeof serving === 'string' && serving !== '' && sameAgent({ actorType: 'agent', actorId: serving }, actor)
  if (itsOwnAgent || (said !== null && said.recordId === run.recordId)) {
    // AN AGENT IS NAMED BY THE HANDLE ON ITS ROW, never by a minted id nobody chose.
    const caller = theCallersAgentRow(actor)?.handle ?? actor.id
    throw new PanelError(
      "A run does not name its own sandbox: its launcher writes it, with the starter's identity, before the run's " +
        'model starts, and a files seal trusts it to say where the run could not have written. ' +
        `This request came from the run's own agent "${caller}". Nothing was written.`,
      403,
    )
  }
  if (actor.provedBy === 'an-agent-key' && run.next !== undefined && run.next !== null) assertTheWriteNamesTheSandboxItCameFrom(actor, run.workspaceId, run.next)
}

/**
 * A RUN NAMES ONLY THE SANDBOX IT WAS FILED FROM. Asked of a write an agent's key proved, at the write that puts the
 * field on a run: the POST that files it, or the first PATCH. The session the write came from is its session header,
 * which that key holds (lib/the-run-a-key-holds.ts).
 *
 *   - FROM A SESSION IN A SANDBOX, the new field names that same sandbox. Both fields are read by `theSandboxFolderOf` in
 *     lib/sealed-tip.ts, the new one in its form that counts nothing (`theFolderTheSandboxFieldNames`), and it vouches for
 *     one only when its container row is the sandbox of its folder. So two rows of
 *     one sandbox, before and after its container was made again, are one sandbox, and a row of another is refused.
 *   - FROM A SESSION IN NO SANDBOX, OR FROM NO SESSION, it is a host filing, which only the secretary makes: with its own
 *     key and not a run's, from a running session that key holds by the agent's own clause of the session header's rule.
 *
 * The person, the office's key and the person's tool key are not asked, and nor is a write with no key.
 */
function assertTheWriteNamesTheSandboxItCameFrom(actor: Actor, workspaceId: string, next: unknown): void {
  const session = typeof actor.sessionId === 'string' && actor.sessionId.trim() !== '' ? actor.sessionId : null
  const from = session === null ? null : theRunTheHeaderNames(session, workspaceId)
  const filer = from === null || 'because' in from ? null : from
  const itsSandbox = filer?.data['sandbox']
  if (filer !== null && itsSandbox !== undefined && itsSandbox !== null) {
    const folder = theSandboxFolderOf(filer.data)
    if (folder === null) {
      throw aRefusalForAnUnvouchedSandbox(filer.data, new PanelError(
        `The run this write came from, ${filer.id}, says it is in a sandbox, and the office cannot vouch for that sandbox: ` +
          'its field must name a folder and a container row of the sandbox of that folder. So a run filed from it names ' +
          'no sandbox. Nothing was written.',
        403,
        undefined,
        undefined,
        'The sandbox of the run this write came from cannot be vouched for.',
      ))
    }
    if (theFolderTheSandboxFieldNames(next) !== folder) {
      const row = isJsonObject(next) ? (next as Record<string, unknown>)['container'] : undefined
      throw new PanelError(
        `This run's sandbox field names the container row ${JSON.stringify(row ?? null)}, which is not a row of the ` +
          `sandbox the run this write came from is in. That run, ${filer.id}, is in the sandbox whose folder is ${folder}. ` +
          'A run filed from inside a sandbox is in that same sandbox. Nothing was written.',
        403,
        undefined,
        undefined,
        'A run filed from inside a sandbox names only that sandbox.',
      )
    }
    return
  }
  const why = whyThisWriteIsNotAHostFiling(actor, from)
  if (why === null) return
  throw new PanelError(
    'A run filed from outside every sandbox names a sandbox only when it is a host filing: the secretary files it, with ' +
      `the secretary's own key, from a running session of the secretary's that the key holds. ${why} Nothing was written.`,
    403,
    undefined,
    undefined,
    'Only the secretary names a sandbox on a run filed from the host.',
  )
}

/** Why a write is not a host filing, in a sentence, or null when it is one (`assertTheWriteNamesTheSandboxItCameFrom`). */
function whyThisWriteIsNotAHostFiling(actor: Actor, from: ARunNamed | { because: string } | null): string | null {
  if (actor.agentKeyRow === undefined) return "The key on this write does not prove an agent on its own: it acts for another run, or it is an ended run's key."
  if (!theKeyWithThisIdIsItsHoldersOwn(actor.agentKeyRow)) return "The key on this write is a run's key, not an agent's own."
  const me = theCallersAgentRow(actor)
  if (me === null || me.id !== actor.keyHolder) {
    return 'The key on this write is not the own key of the agent the request names.'
  }
  if (!theSecretaryOfThisOffice(actor)) return `"${me.handle}" is not the secretary of this office.`
  if (from === null) return 'This write names no session it came from.'
  if ('because' in from) return `Its session header names no run of the secretary's: ${from.because}.`
  const why = whyAnAgentsOwnKeyDoesNotHold({ id: me.id, handle: me.handle }, from)
  return why === null ? null : `It came from run ${from.id}, and ${why}.`
}

/**
 * That sentence, with the space before it, for an agent whose name answers for the run and whose request no key proved
 * over a listener, and nothing for any other caller.
 */
export function aClaimToAnswerForTheRun(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown }): string {
  return actor.type === 'agent' && !aKeyOrTheOfficesOwnCodeCarriesIt(actor) && theNamedAgentAnswersForTheRun(actor, run)
    ? ` ${ONLY_A_KEY_PROVES_AN_AGENTS_CLAIM}`
    : ''
}

/**
 * WHETHER THIS AGENT ANSWERS FOR THE RUN: an agent the run's facts name (`theNamedAgentAnswersForTheRun`), and a key
 * proves the request or no listener carried it (`aKeyOrTheOfficesOwnCodeCarriesIt`). The guards on a run's own facts
 * ask it, its end (`assertMayEndARun`), its served conditions (`assertMayWriteServed`) and any other change to its data
 * (`assertMayChangeARun`, through `mayEndARun`), so they cannot come to disagree about who answers for a run
 * (invariant 9).
 */
function anAgentThatAnswersForTheRun(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown }): boolean {
  return actor.type === 'agent' && aKeyOrTheOfficesOwnCodeCarriesIt(actor) && theNamedAgentAnswersForTheRun(actor, run)
}

/**
 * WHETHER THE AGENT THE CALLER NAMES IS ONE THE RUN'S FACTS NAME: the run's own agent, which is the agent it serves or
 * an agent it ran as (`theRunsOwnAgents` in lib/the-run-a-key-holds.ts, the reading the rule on an agent's own key asks
 * too), the agent that started the agent it serves (criterion P1), or the agent that filed it (the create row of its
 * change log). Compared as agents through `sameAgent`, never by string and never by a session header. A run not
 * written yet (`recordId` empty) has no create row to read. It does not ask whether a key proves the name: that is
 * `anAgentThatAnswersForTheRun`.
 */
function theNamedAgentAnswersForTheRun(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown }): boolean {
  if (actor.type !== 'agent') return false
  const held = isJsonObject(run.data) ? (run.data as Record<string, unknown>) : {}
  if (theRunsOwnAgents(held).some((own) => sameAgent({ actorType: 'agent', actorId: own }, actor))) return true
  const serving = theAgentARunServes(held)
  const started = serving === null ? null : theAgentThatStarted(serving.id)
  if (started !== null && sameAgent({ actorType: 'agent', actorId: started }, actor)) return true
  const filed = run.recordId === '' ? null : whoFiled(run.workspaceId, run.recordId)
  return filed !== null && filed.actorType === 'agent' && sameAgent({ actorType: 'agent', actorId: filed.actorId }, actor)
}

/**
 * WHETHER THIS CALLER MAY END THIS RUN, by the rule `assertMayEndARun` in `records/patching.ts` states. The run's own agent is the agent
 * the run serves or an agent it ran as. Exported for the door that stops a run that will not stop
 * (src/server/api/runtime.ts), which ends a run's work and so admits no caller this rule does not.
 */
export function mayEndARun(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown }): boolean {
  // THE PERSON, PROVED. `thePersonIsProved` is the one answer to who is the person; the key window's bare claim is taken out
  // of it here, and only here.
  if (theProvedPerson(actor)) return true
  // THE OFFICE ITSELF.
  if (theCallerIsTheOfficeItself(actor)) return true
  return actor.type === 'agent' && (theSecretaryOfThisOffice(actor) || anAgentThatAnswersForTheRun(actor, run))
}

/**
 * THE CHECKS A USE OF A TOOL MEETS ON ITS RUN. Before uses moved to `tool_uses`, a use was a patch of the run's record, and
 * `patchRecord` asked two things of it before it wrote: that the caller did not prove itself with the key of a run
 * that had ended (which proves nobody for any write but the two its own doors take), and `assertMayWrite` for a
 * change to a session. The use door no longer patches the record, so it asks them here, in the same order, with the
 * same refusals.
 */
export function assertMayWriteAUseOn(run: string, actor: Actor): void {
  // Neither exception covers a use: a sealed run's key writes only `served`, and a finished run's only its receipt.
  if (actor.sealedRunsOwnKey !== undefined) aSealedRunWritesOnlyItsServed(run, { dataPatch: { [TOOL_USES_FIELD]: null } }, actor.sealedRunsOwnKey)
  if (actor.finishedRunsOwnKey !== undefined) throw aFinishedRunsKeyAskedForMore(actor.finishedRunsOwnKey)
  assertMayWrite('session', 'change', actor, run)
}

export function refuseAnOutlineChangeWithoutTheirDecision(before: { kind: string; data: unknown } | null, after: { kind: string; data: unknown }, actor: Actor): void {
  const was = before === null ? null : theOutlineOfAChapter(before)
  const is = theOutlineOfAChapter(after)
  if (!theOutlineChanges(was, is)) return
  if (theOfficeIsCopyingItsDefaults || thePersonIsProved(actor)) return
  const found = actor.warrant === undefined ? null : whichDecisionOfTheOwnersTheseWordsStandOn(actor.warrant)
  if (found !== null && found.decision !== null) {
    // The warrant opened this door, so the ledgers write it on this act.
    theWordsAllowThis(actor)
    return
  }
  const n = (was ?? is)?.n
  throw new PanelError(
    `This write would change the outline of chapter ${String(n)} (which rules it holds, in what order, under which English ` +
      `headings), and only the person, or an agent acting on a decision of the owner's, changes an outline. ` +
      `${found === null ? 'This request carries no warrant.' : found.because} ` +
      'Send the change as PATCH /api/records/<id>, or as POST /api/records for a new chapter, carrying a warrant whose where ' +
      'is message:<id>, a message the person wrote that a live decision with decided_by "the owner" and authority "the owner said ' +
      'so" names as its authority_reference. Nothing was written.',
    403,
  )
}

/**
 * The processes `patchRecord` reads for this write, for `readFirst`. A write that ends a run closes the run's gone
 * process rows in its transaction (`closeTheGoneProcessRowsOfAnEndedRun`), and that reads each of them.
 */
export function theProcessesAWriteReads(id: string, patch: RecordPatch): AProcessToRead[] {
  const before = getRecord(id)
  if (before?.kind !== 'session') return []
  const storedState = before.data['state']
  if (theRunHasEnded(storedState) || !theRunHasEnded(theStateAWriteLeaves(storedState, patch))) return []
  return theProcessesAListingReads({ workspaceId: before.workspaceId, sessionRecordId: id, type: 'process' })
}

// ============================================================ THE DECISION'S CORE AND ITS NOTES
//
// Criterion P76. Whoever made the decision may change it,
// and the administrator may too. The decision itself is the option taken, the words why, the title
// and the words added after the press. The notes around it are when to revisit it, what was
// rejected, its links and its provenance. The guard below is the one place that tells the two
// apart, and it reads the field declaration so it cannot drift from the page.
//
// IT READS `recorded_by` AND NOT `decided_by`. `recorded_by` is written once by Mole Office from the
// actor on the request and refused from every caller (`assertNobodyTypesWhoRecordedIt` in `./who-recorded-it.ts`).
// `decided_by` is the caller's own statement, so a guard built on it would let an agent write
// itself the right with one word in the same request it is refused for. `design/permissions/DESIGN-2026-09-08-perm-5.md`,
// version 2, specifies this use of the recorded actor.

export function assertMayWrite(
  kind: string,
  verb: HumanOnlyVerb,
  actor: Actor,
  subject: string,
  /**
   * THE BODY THE WRITE IS ABOUT TO STORE, handed over only by the two callers that have it.
   *
   * WHAT IT OPENS. A `decision` used to be refused to every agent outright. Since 27 August 2026 an
   * agent may write one it can cite authority for — and this parameter is how the caller says *here
   * is what it stands on, ask the authority rule*. `assertMayDecide` above is that rule.
   *
   * OMITTING IT IS THE OLD SENTENCE, AND THAT IS THE SAFE DIRECTION. `src/server/api/import.ts`
   * borrows this guard to refuse an agent that would overwrite the whole archive, and it has no
   * decision body to hand over; it must keep getting the flat 403 it gets today. So the authority
   * path opens only when a caller passes a body, never by default.
   *
   * `title` travels with it because the TITLE is part of a decision's core (criterion P76): a change
   * that renames the decision moves the decision itself, and `patchRecord` passes the title it was
   * sent. It is absent on every caller with no title to hand over, which leaves the title alone.
   */
  body?: { data: unknown; title?: string },
  /** A move's destination, passed by both preflight and the writer for every record that moves. */
  movingTo?: string,
): void {
  // A MERGE ENTRY IS WRITTEN BY THE MERGE QUEUE AND BY NOTHING ELSE, whoever is asking — the person
  // included. Sandbox v1, piece P6: its state decides which entry holds a lane, so an edit from
  // anywhere else could take a lane, free one, or say something landed that never did. Asked here
  // because every create, change, kind change (into the kind and out of it), delete, restore and
  // move asks this guard, so one sentence covers every path. The queue's own writes set the mark.
  if (kind === MERGE_ENTRY_KIND && !theMergeQueueIsWriting()) {
    throw new PanelError(A_MERGE_ENTRY_IS_WRITTEN_BY_ITS_DOORS, 403, THE_MERGE_QUEUE_DOORS, undefined, 'Only the merge queue writes a merge entry.')
  }
  // An emergency push names who pushed, and only its two doors know that. They set the same mark.
  if (kind === EMERGENCY_PUSH_KIND && !theMergeQueueIsWriting()) {
    throw new PanelError(A_PUSH_IS_WRITTEN_BY_ITS_DOORS, 403, THE_PUSH_DOORS, undefined, 'Only the emergency push doors write an emergency push.')
  }
  // AND A COUNTER IS WRITTEN BY ITS OWN DOORS AND BY NOTHING ELSE, whoever is asking — the person
  // included. Criteria CT2 and CT6: only whoever filed it, a secretary or the owner may change what
  // it does, every change says why, and its count is the rows rather than a field a caller can set.
  // The doors carry all three; POST /api/records carries none of them. The counter's own writes set
  // the mark. Criterion CT1.
  // AND A FLOW RUN IS WRITTEN BY THE OFFICE AND BY NOTHING ELSE, whoever is asking — the person included.
  // Under M1 of the office flow, it is the office's own record of what it saw a run do, so a copy written
  // by anybody else would be a forged record. A step done by hand goes through its own door, which writes
  // with the mark set. This refuses nothing of a run's own work.
  // A MOVE IS LET THROUGH: a run moved to another project carries its flow run with it, since their link may not
  // cross projects, and a move changes which project holds the record and nothing it says. Refused, it refused
  // the run's own move.
  if (kind === FLOW_RUN_KIND && verb !== 'move' && !theOfficeIsWritingAFlowRun()) {
    throw new PanelError(A_FLOW_RUN_IS_WRITTEN_BY_THE_OFFICE, 403, THE_FLOW_RUN_DOORS, undefined, 'Only the office writes a flow run.')
  }
  if (kind === NOTICE_RULES_KIND && !noticeRulesDoorIsWriting()) {
    throw new PanelError('Change your notice wake rules on Messages, in Your notice wake rules. Nothing was changed.', 403, undefined, undefined, undefined, {code:'noticeRulesRefused',values:{reason:'Open Messages, then Your notice wake rules. Other recipients’ rules cannot be changed.'}})
  }
  if (kind === COUNTER_KIND && !theCounterDoorsAreWriting()) {
    throw new PanelError(A_COUNTER_IS_WRITTEN_BY_ITS_DOORS, 403, THE_COUNTER_DOORS, undefined, 'Only its own doors write a counter.')
  }
  // AND A HOST JOB IS WRITTEN BY ITS OWN DOORS AND BY NOTHING ELSE, whoever is asking: it says which registered tool
  // ran for which run and what came of it, so a copy written by anybody else would be a forged result.
  // A MOVE IS LET THROUGH, as for a flow run: a run moved to another project carries its host job with it, since their
  // link may not cross projects, and a move changes which project holds the record and nothing it says.
  if (kind === HOST_JOB_KIND && verb !== 'move' && !theOfficeIsWritingAHostJob()) {
    throw new PanelError(A_HOST_JOB_IS_WRITTEN_BY_ITS_DOORS, 403, THE_HOST_JOB_DOORS, undefined, 'Only its own doors write a host job.')
  }
  // AND A CHECKLIST IS WRITTEN BY ITS OWN DOORS AND BY NOTHING ELSE, whoever is asking — the person
  // included. The office writes the owner from the caller, and only
  // the owner switches an item's reminder on. The general doors can keep neither. Its own writes set
  // the mark.
  if (kind === CHECKLIST_KIND && !theChecklistDoorsAreWriting()) {
    throw new PanelError(A_CHECKLIST_IS_WRITTEN_BY_ITS_DOORS, 403, THE_CHECKLIST_DOORS, undefined, 'Only its own doors write a checklist.')
  }
  // AND A BOOKING IS WRITTEN BY ITS OWN DOORS AND BY NOTHING ELSE, whoever is asking — the person included.
  // The office places a booking in the line and moves the ones it pushes later; a
  // write through the general doors could put two bookings on more card memory than there is.
  if (kind === BOOKING_KIND && !theBookingDoorsAreWriting()) {
    throw new PanelError(A_BOOKING_IS_WRITTEN_BY_ITS_DOORS, 403, THE_BOOKING_DOORS, undefined, 'Only its own doors write a booking.')
  }
  // AND A PROJECT CHAPTER, A DESIGN REVIEW AND A DESIGN REMINDER ARE WRITTEN BY THEIR OWN DOORS AND BY NOTHING ELSE,
  // whoever is asking — the person included (the design-first build of wave 13s's requirements). The chapter's door asks
  // who may write a rule, reads every rule against the closed lists and keeps a revision with its reason; the review's
  // door writes the reviewer from the key; a reminder is kept by the office before a seal and judged once by its judges
  // (./design-reminders.ts). The general doors can do none of that. Their own writes set the mark.
  if (kind === PROJECT_CHAPTER_KIND && !theProjectRulesDoorsAreWriting()) {
    throw new PanelError(`${A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS} Nothing was changed.`, 403, undefined, undefined, undefined, {
      code: 'chapterEditRefused',
      values: { reason: A_PROJECT_CHAPTER_IS_WRITTEN_BY_ITS_DOORS },
    })
  }
  if (kind === DESIGN_REVIEW_KIND && !theProjectRulesDoorsAreWriting()) {
    throw new PanelError(A_DESIGN_REVIEW_IS_WRITTEN_BY_ITS_DOOR, 403, THE_DESIGN_REVIEW_DOOR, undefined, 'Only its own door writes a design review.')
  }
  if (kind === DESIGN_REMINDER_KIND && !theProjectRulesDoorsAreWriting()) {
    throw new PanelError(A_DESIGN_REMINDER_IS_WRITTEN_BY_ITS_DOORS, 403, THE_DESIGN_REMINDER_DOORS, undefined, 'Only its own doors write a design reminder.')
  }
  // AND A SENT DRAFT STAYS AS IT WAS SENT, whoever is asking — the person included. Asked here for the verbs
  // `patchRecord` does not settle itself: a delete, a
  // restore, a move, a reclassification, and a change that hands over no body (a kind change, a
  // checklist line). `patchRecord` hands a body over and settles its own change, because it alone can
  // tell a short-forms write, which is allowed, from a change to what the draft says.
  if (kind === DRAFT_KIND && verb !== 'create' && !(verb === 'change' && body !== undefined) && !theDraftSendDoorIsWriting()) {
    const sent = sentAsOf(getRecord(subject)?.data)
    if (sent !== null) throw new PanelError(aSentDraftStandsAsItWasSent(subject, sent), 409)
  }
  // AND A TURN DRAFT IS WRITTEN BY MOLE OFFICE ALONE, whoever is asking (lib/turn-drafts.ts): its `turn` field holds a
  // message's fields as the record door checked them, and Mole Office sends it as the agent's message. Asked of every
  // verb: a create that sets the field, and any change, delete, restore, move or kind change of a turn draft.
  if (kind === DRAFT_KIND && !theTurnDraftsAreWriting() && (verb === 'create' ? isATurnDraft(body?.data) : isATurnDraft(getRecord(subject)?.data))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_A_TURN_DRAFT, 403)
  }
  // AND AN AGENT'S ACT ON A CARD'S WORDS STANDS ON A DECISION OF THE OWNER'S (lib/card-words.ts). Asked here of a create,
  // a delete, a restore, a move and a change that hands over no body: a kind change into this kind, a part, a checklist
  // line. `patchRecord` hands a body over and asks its own change, because it alone can tell a write of short forms. A
  // move needs only this guard: the office reads a card's words from every project, so a move does not take them off its
  // card.
  if (
    kind === ROLE_CARD_WORDS_KIND &&
    (verb === 'create' || verb === 'delete' || verb === 'restore' || verb === 'move' || (verb === 'change' && body === undefined))
  ) {
    refuseACardWordsActOffTheOwnersDecision(actor, verb, subject)
  }
  if (HUMAN_ONLY_KINDS.includes(kind as RecordKind) && actor.type !== 'human') {
    // AND THE CLAUSE THAT ARRIVED ON 8 SEPTEMBER 2026. Criterion P84, rule 5 of chapter 8: inside a
    // test world its starter and the secretary hold the owner's authority, so a governance write
    // they make there is theirs to make. `theOwnersAuthority` is set by `actorFrom` from what the
    // world was told at start, and it is absent in the office, which is never a test world.
    //
    // THE ACTOR IS UNCHANGED AND STAYS AN AGENT. The change row and the revision say which agent
    // wrote it, by its own handle, so nothing here is the person's word — which is the other half of the
    // rule. Asked first, because it is a question about WHERE this is rather than about the write.
    // WRITING A REGULATION OR A DECISION IS A PART BESIDE THE DOORS. A
    // raised secretary holds the person's rights except a few acts, and any write of a regulation is one of them. That is now the
    // card's default answer about `record:regulation`, which each office's person may change
    // (src/shared/what-the-grant-carries.ts), so the grant is asked about this kind under that name as well as the
    // door's own. A decision is the same kind of part, named `record:decision`, whose default is the record door's: every
    // door that writes one through this guard names the press the same way. The check asks whether it is kept before it
    // asks for the reason, so a secretary is never told to send a reason for a write it is then refused.
    const touches: WhatThePressTouches = {
      also: kind === REGULATION_KIND ? ['record:regulation'] : kind === DECISION_KIND ? ['record:decision'] : [],
    }
    if (actor.theOwnersAuthority?.holds === true) {
      // Allowed here, and recorded as the agent that asked.
    } else if (VERBS_THE_OWNERS_WORDS_COVER.includes(verb) && actsForThePerson(actor, touches)) {
      // THE ONE CLAUSE THAT MOVED. Writing a decision is now a question about what it stands on, and
      // only for a caller that handed the body over. Everything else about this kind — deleting,
      // restoring, moving, promoting, and the three clauses below — is exactly as it was.
      //
      // The person's quoted words for this one write, a warrant, carry a regulation as they always did. One signed item does not.
      if (kind === REGULATION_KIND && actor.signedItem !== undefined && !theWordsAllowThis(actor)) throw aSignedItemDoesNotCarryARegulation(actor)
    } else if (kind === DECISION_KIND && verb === 'change' && body !== undefined) {
      // A DECISION HAS A CORE AND NOTES, criterion P76. The core is the maker's and the person's;
      // the notes are open to any agent. A change that touches neither is left to the doors below,
      // which is why this only speaks when the decision itself would move.
      if (theDecisionItselfWouldChange({ subject, data: body.data, title: body.title })) {
        // WORDS ADDED AFTER THE PRESS KEEP THEIR OWN REFUSAL, and it comes first because it is
        // narrower. M83 singles `words_since` out as untouchable by any agent whatever authority it
        // cites; `assertMayDecide` writes that refusal and this guard must not replace it with the
        // maker's. It always throws when this field moved.
        const incoming = isJsonObject(body.data) ? body.data : {}
        if (wordsSinceChanged(subject, incoming)) {
          assertMayDecide({ verb, data: body.data, subject }, actor)
        }
        if (theDecisionWasRecordedBy(actor, subject)) {
          // THE MAKER STILL HAS TO STAND ON SOMETHING. Its own decision is its to change, but not
          // into one that says nothing — the same authority rule the create door asks.
          assertMayDecide({ verb, data: body.data, subject }, actor)
        } else {
          theCoreOfADecisionIsItsMakers(actor, subject, verb)
        }
      }
      // NOTES ONLY, and any agent may change those. Nothing is refused here.
    } else if (kind === DECISION_KIND && body !== undefined && verb === 'create') {
      assertMayDecide({ verb, data: body.data, subject }, actor)
    } else if (kind === REGULATION_KIND && (verb === 'restore' || verb === 'move') && actor.warrant !== undefined) {
      // Carried words must name this act. Wrong words never fall through to the grant.
      // Both move callers hand over the destination, so companions ask this same binding too.
      const act = verb === 'restore'
        ? `regulation.restore:${subject}`
        : movingTo === undefined ? undefined : `regulation.move:${JSON.stringify({ record: subject, to: movingTo })}`
      if (
        actor.warrant !== undefined && actor.signedItem === undefined && actor.provedBy === 'an-agent-key' &&
        act !== undefined && actor.warrant.for.includes(subject) && actor.warrant.for.includes(act) &&
        theSecretaryActingForThePerson(actor, touches)
      ) {
        // The actor stays the secretary; the check marks the words for both ledgers.
      } else {
        const refused = humanOnlyRefusal(kind as RecordKind, verb, actor, subject)
        throw new PanelError(refused.message, 403, undefined, undefined, refused.reason)
      }
    } else if (aRaiseCarriesIt(actor, touches)) {
      // A RAISE CARRIES THE PERSON'S OTHER ACTS ON THESE KINDS TOO. A raised
      // secretary holds the person's rights except a few acts, so deleting, restoring or moving one of these records is its to do
      // while the raise holds, as writing one already was. Regulation restore and move words were asked above;
      // a regulation is asked about by its own name, which the card keeps for the person by default. The
      // actor stays the agent, and the change row and the revision name the grant.
    } else {
      // BOTH LENGTHS OF THE REFUSAL COME BACK FROM ONE CALL. See `Refusal` above.
      const refused = humanOnlyRefusal(kind as RecordKind, verb, actor, subject)
      // AND IN A TEST WORLD THE REFUSAL NAMES WHO MAY. Criterion P84: a refusal that does not say
      // who to ask is a refusal the reader has to research. Null in the office, where the sentence
      // above already names the one person who may.
      const inAWorld = whoMayDoThePersonsActsHere()
      throw new PanelError(
        inAWorld === null ? refused.message : `${refused.message} ${inAWorld}`,
        403,
        undefined,
        undefined,
        refused.reason,
      )
    }
  }
  // AND IT HAS TO BE SAID. Owner decision §36: a governance act requires an explicit human, because
  // an absent header is not evidence of one. `stated: false` is set only by `actorFrom` for a
  // request that sent no actor header at all; an in-process caller leaves it undefined and is not
  // affected, because nothing about it came through a header.
  if (HUMAN_ONLY_KINDS.includes(kind as RecordKind) && actor.stated === false) {
    throw new PanelError(
      `This request sent no actor headers, so nothing said who is asking. Ordinary writes take that as ` +
        `the person typing by hand, and ${verb === 'promote' ? 'promoting a proposal' : `a ${kind}`} is not an ` +
        `ordinary write — it is a governance act, and an absent header is not evidence that a person made it. ` +
        `Nothing was written. Send x-mole-office-actor-type: human and x-mole-office-actor-id: <who you are>. ` +
        `The browser does this for you; the actor selector in the sidebar is what sets it.`,
      403,
      undefined,
      undefined,
      'Nothing said who is asking, and this act has to be somebody.',
    )
  }
  // AND IS IT SOMEBODY MOLE OFFICE KNOWS. The third actor clause, asked with the other two and before the
  // machine one: it is true from any machine. The two above read `actor.type` and `actor.stated`,
  // which are both the caller's word for itself, so until this clause existed anything that could
  // reach the port and type `human` wrote decisions under any name it liked.
  if (HUMAN_ONLY_KINDS.includes(kind as RecordKind) && isSomebodyMoleOfficeCannotPlace(actor)) {
    const act =
      verb === 'promote' ? `Promoting a proposal into a ${kind}` : `${WRITING[verb]} a ${kind}`
    const aftermath =
      verb === 'promote'
        ? `Nothing was written: no ${kind} was created, no link was made, and the proposal ${subject} is exactly ` +
          `as it was and still reads as open.`
        : verb === 'create'
          ? `Nothing was written and no ${kind} was created.`
          : `Nothing was written and ${kind} ${subject} is exactly as it was.`
    throw new PanelError(
      `${act} is the person's own act, and this request was made in the name "${actor.id}", which is not ` +
        `somebody Mole Office can place. ${aftermath} ${ONE_PERSON_AND_THE_NAME_IS_ITS_OWN}`,
      403,
      strangerDetail(`${verb} ${kind} ${subject}`, actor),
      undefined,
      `Mole Office does not know anybody by the name "${actor.id}".`,
    )
  }
  // AND WHERE IT WAS ASKED FROM. Asked last, after both actor clauses, because those two are true
  // from any machine and their advice — file a proposal, say who you are — is worth giving wherever
  // the caller is. This one is only ever the answer once the caller has passed as a stated person.
  if (HUMAN_ONLY_KINDS.includes(kind as RecordKind) && actor.from === 'another machine' && !thePersonIsProved(actor)) {
    const act =
      verb === 'promote' ? `Promoting a proposal into a ${kind}` : `${WRITING[verb]} a ${kind}`
    const aftermath =
      verb === 'promote'
        ? `Nothing was written: no ${kind} was created, no link was made, and the proposal ${subject} is exactly ` +
          `as it was and still reads as open.`
        : verb === 'create'
          ? `Nothing was written and no ${kind} was created.`
          : `Nothing was written and ${kind} ${subject} is exactly as it was.`
    throw new PanelError(
      `${act} is the person's own act, and it is done at the machine Mole Office runs on. This request came from ` +
        `another machine. ${aftermath} ${ARRIVAL_IS_NOT_A_CLAIM} From another machine a ${kind} is open to ` +
        `read and to comment on, and a proposal about it is open to write; the ${kind} itself is written at ` +
        `the machine Mole Office is running on.`,
      403,
      arrivalDetail(`${verb} ${kind} ${subject}`),
      undefined,
      `A ${kind} is made at the machine Mole Office runs on, not from another machine.`,
    )
  }
  /**
   * AND FROM THIS MACHINE, A CLAIM TO BE THE PERSON NEEDS THEIR PROOF TOO. The clause
   * above asks only about another machine. From this machine a claim with no key was covered by the
   * key window, and once the person closes it that claim is nobody here as well. Before this clause a
   * keyless decision from this machine would still have been written after the close.
   *
   * ONLY A CLAIM TO BE THE PERSON IS ASKED. An agent that got past the first clause did so on its own
   * ground — a test world's authority, or their words or their press — and none of those is their key,
   * so asking it here would refuse what that clause allowed.
   *
   * `actorFrom` refuses a write with no key after the close before it reaches any guard, so over
   * HTTP this is the second wall. It is here so the guard is true on its own.
   */
  if (
    HUMAN_ONLY_KINDS.includes(kind as RecordKind) &&
    actor.type === 'human' &&
    actor.from === 'this machine' &&
    !thePersonIsProved(actor)
  ) {
    const act =
      verb === 'promote' ? `Promoting a proposal into a ${kind}` : `${WRITING[verb]} a ${kind}`
    throw new PanelError(
      theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, null), {
        refused: `${act} is the person's own act`,
        nothingWasDone: 'Nothing was written.',
        whoMay: `Any agent may file a proposal; the ${kind} itself is the person's.`,
      }),
      403,
    )
  }
}

/**
 * WHICH SESSION A CALLER MAY NAME AS A RUN'S `parentAttachment`.
 *
 * A run's parent is told when the run ends (the finished-child line), and other readers follow it
 * upward. So a caller may name only a session it has a part in. This is the one place that says
 * which. The create path, the lifecycle door (which files through the create path) and the patch
 * path all ask it before they write anything. The parent the office fills in itself
 * (`theRunThatStartedThisOne`) is the office's own fact and is not asked about.
 *
 * WHOSE SESSION IT IS. The agent it answers as, read by `theAgentOnlyASessionAnswersAs`: the handle
 * it holds, then `ranAs`, then `servingAgent`. That is the function the finished-child line uses to
 * choose whom it wakes, so the agent this rule protects is the agent that line would reach. A session
 * that answers as no agent belongs to whoever filed it, an agent or the person.
 *
 * A PARENT IS ACCEPTED WHEN ONE OF FOUR HOLDS:
 *   1. OWN. It belongs to the caller.
 *   2. STARTED. The caller started it: the caller filed a session that answers as no agent (its
 *      change log's create row), or the caller is in the chain of starters above the agent the session
 *      belongs to. Filing a session that answers as an agent is not starting it: a secretary, or the
 *      submitter of a merge entry, may file a session for the inspector without being above it
 *      (`whyThisCallerMayNotFileASessionFor`), and runs filed before that door may name anybody. The office's own
 *      writers count as one filer (`theCallerIsTheOfficeItself`, `aStampNamesTheOfficeItself`): the
 *      API server files the message worker's own session, and the worker names it as the parent of
 *      each run it starts.
 *   3. ANCESTOR. It belongs to somebody in the caller's own chain of starters.
 *   4. ASKED. The caller is the office, proved by its key, filing a new run for a worker that
 *      the session's agent asked for at the worker-run door, from the launcher run the office is starting it with
 *      (`theAgentOfAnAskedWorkerRunUnder`). Only on a create. A supervisor starts its own
 *      workers, and the parent is what makes the worker's end wake the supervisor.
 * Anything else is refused: a stranger's session, a sibling's, a cousin's, an id this project holds
 * no session under, and a record that is not a session.
 *
 * THE SESSION HEADER COUNTS FOR NOTHING HERE. Nothing proves it: `actorFrom` stores it as the caller
 * sent it, and a run key proves its agent, not its run. A caller could send any run's id there.
 *
 * THE PERSON, PROVED, MAY NAME ANY SESSION: by their key, or from inside the office's own program
 * (`theProvedPerson`, read as `assertMayEndARun` reads them). The harm this rule stops is an agent waking another
 * agent's session; the person is the root of every chain
 * of starters, and a broken chain (a loop, a gone starter) must not lock them out of their own office.
 * A request that only says it is the person, with no key of theirs, is read by the three rules like anyone:
 * rule 2 still lets it name the session of an agent whose chain reaches the person.
 *
 * EACH FACT IS READ BY ITS EXISTING READER. Which agent a session answers as:
 * `theAgentOnlyASessionAnswersAs` in lib/messages.ts. Who
 * filed a record: `whoFiled`, compared with the live caller by `sameAgent` and read as an agent by
 * `everyAgentAStoredStampCouldName`, because it is a stored stamp. A chain of starters:
 * `theChainUpWith`, which reads each stored `startedBy` with the stored reader, here over the rows each string names
 * (`theStarterEachStringNames`). The caller:
 * `participantForActor`.
 *
 * Answers null when the parent may be named, and the refusal's sentence when it names no session of this project. A
 * caller with no part in the session is refused here, at its gate's block; at off it is let through and counted.
 */
function whyThisCallerMayNotNameThisParent(parentId: string, actor: Actor, workspaceId: string, filedData?: Record<string, unknown>): string | null {
  const rule =
    'A caller may name as a run\'s parent only its own session, a session it filed that serves no agent, a session of an agent it ' +
    'started, or a session of an agent or person above it in its chain of starters. A session header does not ' +
    'make a session the caller\'s own. Nothing was written.'
  const parent = getRecord(parentId)
  if (parent === null || parent.deletedAt !== null || parent.workspaceId !== workspaceId) {
    return `parentAttachment names "${parentId}", and this project holds no session with that id. ${rule}`
  }
  if (parent.kind !== SESSION_KIND) {
    return `parentAttachment names "${parentId}", which is a ${kindWord(parent.kind).text} and not a session. ${rule}`
  }
  // THE PERSON, PROVED, MAY NAME ANY SESSION. The harm this rule stops is an
  // agent waking another agent's session, and the person is the root of every chain of starters, so a broken chain (a loop,
  // a gone starter) must not lock them out. A request that only says it is the person gets no exemption.
  if (theProvedPerson(actor)) return null
  // WHOSE SESSION IT IS, read by the function the finished-child line uses to choose whom it wakes
  // (`tellTheParentAChildFinished`), so the two can never disagree: the handle the session holds, then
  // `ranAs`, then `servingAgent`.
  const serves = theAgentOnlyASessionAnswersAs(parent, workspaceId)
  const me = participantForActor(actor)
  // THE ROWS THE TWO CHAINS BELOW NAME, each read once when it is asked, and no other agent.
  const theAgentThisNames = theStarterEachStringNames()
  const filed = whoFiled(workspaceId, parentId)
  // WHOSE SESSION IT IS: the agent it answers as; when it answers as none, whoever filed it. The filer is a
  // stored stamp, so an agent stamp is read with the stored reader: the one agent it can name, and
  // nobody where it names none or two. Null when neither names an agent or a person.
  const filerAgents = filed !== null && filed.actorType === 'agent' ? everyAgentAStoredStampCouldName(filed.actorId) : []
  const filer: ParticipantRef | null =
    filed === null
      ? null
      : filed.actorType === 'human'
        ? { kind: 'person', id: filed.actorId }
        : filerAgents.length === 1
          ? { kind: 'agent', id: filerAgents[0]!.id }
          : null
  const owner: ParticipantRef | null = serves !== null ? { kind: 'agent', id: serves.id } : filer

  // 1. OWN.
  if (me !== null && owner !== null && sameParticipant(me, owner)) return null
  // 2. STARTED. Filing counts as starting only for a session that answers as no agent. A session that
  // answers as an agent is started by whoever started that agent, which the chain below asks. A secretary or a
  // submitter may file a session for the inspector without being above it, so filing one gives no part in it.
  if (serves === null && filed !== null && sameAgent(filed, actor)) return null
  if (serves === null && filed !== null && theCallerIsTheOfficeItself(actor) && aStampNamesTheOfficeItself(filed)) return null
  if (me !== null && owner !== null && owner.kind === 'agent') {
    if (theChainOfStartersAbove(owner, theAgentThisNames).some((one) => sameParticipant(one, me))) return null
  }
  // 3. ANCESTOR.
  if (me !== null && me.kind === 'agent' && owner !== null) {
    if (theChainOfStartersAbove(me, theAgentThisNames).some((one) => sameParticipant(one, owner))) return null
  }
  // 4. ASKED.
  if (filedData !== undefined && theAgentOfAnAskedWorkerRunUnder(parent, filedData, actor) !== null) return null

  const met = () => gateMet('who-names-a-runs-parent')
  if (gatePosition('who-names-a-runs-parent') !== 'block') {
    met()
    return null
  }
  throw gateMetOnceTheWriteIsTakenBack(new PanelError(`parentAttachment names the session "${parentId}" ("${parent.title}"), and "${actor.id}" has no part in it. ${rule}`, 403), met)
}

/**
 * RULE 4 OF THE PARENT RULE, AND THE RUN-KEY DOOR'S FOURTH CALLER: the agent of the worker run the office is filing under
 * this parent, or null when it is not filing one. The office's key is filing a run for exactly one agent, from a
 * session the header names, and the parent keeps a worker run of that agent that is `starting` with that session as its
 * launcher run, which the office filed for that worker under that parent. The header is unproved, but the office's key
 * is held only by the office's own programs, and the header must name the one launcher run the parent's entry names.
 * `theWorkerRunThisRunStarts` in lib/worker-runs.ts asks it again for the mint, so the two read one rule. The entry is
 * found by the agent's canonical id (`theStoredWorkerRunKey`), and the agent answered is its canonical id.
 */
export function theAgentOfAnAskedWorkerRunUnder(parent: PanelRecord, filedData: Record<string, unknown>, actor: Actor): string | null {
  if (actor.provedBy !== 'the-office-key' || typeof actor.sessionId !== 'string' || actor.sessionId === '') return null
  const named = everyAgentASessionsDataNames(filedData)
  if (named.length !== 1 || named[0]!.kind !== 'agent') return null
  const agentId = theCanonicalAgentId(sqlite, named[0]!.id)
  // THE PARENT'S ENTRY MAY BE KEPT UNDER AN ALIAS FILED FOR THE AGENT.
  const workerRuns = parent.data[WORKER_RUNS]
  const key = workerRuns !== null && typeof workerRuns === 'object' && !Array.isArray(workerRuns) ? theStoredWorkerRunKey(sqlite, workerRuns as Record<string, unknown>, agentId) : null
  if (key === null || !aWorkerRunIsStartingUnder(parent.data, key, actor.sessionId)) return null
  const launcher = getRecord(actor.sessionId)
  if (launcher === null || launcher.kind !== SESSION_KIND) return null
  // THE LAUNCHER MAY NAME THE WORKER BY AN OLD ID, and the shared check reads both ids through the aliases.
  return theLauncherIsForThisWorkerRun(launcher.data, parent.id, agentId, (id) => theCanonicalAgentId(sqlite, id)) ? agentId : null
}

/** Refuse a `parentAttachment` the caller may not name. See `whyThisCallerMayNotNameThisParent`. */
export function assertThisCallerMayNameThisParent(parentId: string, actor: Actor, workspaceId: string, filed?: Record<string, unknown>): void {
  const why = whyThisCallerMayNotNameThisParent(parentId, actor, workspaceId, filed)
  if (why !== null) throw new PanelError(why, 403)
}

/**
 * WHETHER THE CALLER SUBMITTED A MERGE ENTRY THE CHECK THIS SESSION IS FOR. The session says which run it checks in
 * `extra.inspectionRun`, as the hand-run check again files it (`theCommandsThatRunACheckAgain` in
 * lib/merge-state-machine.ts). The entries a check of that run is for are read by `theMergeEntriesACheckOfThisRunIsFor`,
 * and each submitter by `readMergeEntry`, from the stored entry and never from the request.
 */
function theCallerSubmittedTheEntryThisCheckIsFor(data: unknown, me: ParticipantRef | null, workspaceId: string): boolean {
  if (me === null || !isJsonObject(data)) return false
  const extra = data['extra']
  const run = isJsonObject(extra) ? extra['inspectionRun'] : undefined
  if (typeof run !== 'string' || run === '') return false
  return theMergeEntriesACheckOfThisRunIsFor(run, workspaceId).some((entry) => sameParticipant(readMergeEntry(entry).submittedBy, me))
}

/**
 * WHO MAY FILE A SESSION FOR AN AGENT.
 *
 * The office acts on the agent a session names: the agent's message limit, its finished-child line and its stop are
 * read from it. So a stranger that could file a session for an agent could make that agent look busy, or hold its
 * stop. A session write that names an agent (`ranAs`, `servingAgent` or `servingAgentId`, read by
 * `everyAgentASessionsDataNames`) is accepted only from:
 *   1. that agent;
 *   2. an agent above it in its chain of starters (`theChainOfStartersAbove`, the chain the parent rule reads);
 *   3. the person, proved (`thePersonIsFilingThisSession`). A request that only says it is the person, with no key of theirs,
 *      is not the person here, except at their press that admits a registration;
 *   4. the office itself (`theCallerIsTheOfficeItself`).
 * A SESSION FOR THE INSPECTOR may also be filed by a secretary (`theSecretaryOfThisOffice`) or by whoever submitted a
 * merge entry the check is for.
 *
 * THE OFFICE'S OWN BINDING IS THE OFFICE'S ACT. When somebody addresses a run that answers as nobody,
 * `identityForAddressedRun` makes an agent for the run and writes it into the run's `ranAs`. The caller chose who a
 * message is for; the office made the identity and bound it. So that one write is read as the office.
 *
 * THE PATCH PATH IS THE SAME DOOR. A stranger that could not file a session for an agent could otherwise file one for
 * nobody and then write the agent onto it. On a patch only the agents the write adds are asked: an agent the session
 * already named, carried unchanged, is not asked again.
 *
 * Answers null when the write may go ahead, and the refusal's sentence when it may not. Nothing has been written when
 * either path asks.
 */
function whyThisCallerMayNotFileASessionFor(data: unknown, before: unknown, actor: Actor, workspaceId: string): string | null {
  const held = before === undefined ? [] : everyAgentASessionsDataNames(before)
  const added = everyAgentASessionsDataNames(data).filter((one) => !held.some((already) => sameParticipant(already, one)))
  if (added.length === 0) return null
  if (theOfficeIsBindingARunToAnIdentityItMade > 0) return null
  if (theCallerIsTheOfficeItself(actor)) return null
  if (thePersonIsFilingThisSession(actor)) return null
  const me = participantForActor(actor)
  const theAgentThisNames = theStarterEachStringNames()
  for (const agent of added) {
    if (me !== null && sameParticipant(me, agent)) continue
    if (me !== null && me.kind === 'agent' && theChainOfStartersAbove(agent, theAgentThisNames).some((one) => sameParticipant(one, me))) continue
    const theInspector = holdsTheInspectorCard(agent)
    if (theInspector && (theSecretaryOfThisOffice(actor) || theCallerSubmittedTheEntryThisCheckIsFor(data, me, workspaceId))) continue
    const row = readParticipant(agent) as RegisteredAgent | null
    const name = row?.handle ?? agent.id
    const caller = actor.type === 'agent' ? (theCallersAgentRow(actor)?.handle ?? actor.id) : actor.id
    return (
      `This session names the agent "${name}", and ${actor.type} "${caller}" may not file or change a session for it. ` +
      'A session for an agent is filed only by that agent, an agent above it in its chain of starters, the person with their key, or the office itself.' +
      (theInspector ? ` A session for the inspector may also be filed by a secretary, or by whoever submitted the merge entry the check is for.` : '') +
      aClaimToBeThePerson(actor) +
      // WHAT TO DO INSTEAD, for an agent: the road of filing runs for a worker it did not register is not
      // used any more, and these are the two that are.
      (actor.type === 'agent'
        ? ' To start a run for an agent you did not register, ask a secretary to file it, or register the agent yourself, as its starter.'
        : '') +
      ' Nothing was written.'
    )
  }
  return null
}

/** Refuse a session write that names an agent the caller may not file for. See `whyThisCallerMayNotFileASessionFor`. */
export function assertThisCallerMayFileASessionFor(data: unknown, before: unknown, actor: Actor, workspaceId: string): void {
  const why = whyThisCallerMayNotFileASessionFor(data, before, actor, workspaceId)
  if (why === null) return
  const met = () => gateMet('who-files-a-session')
  if (gatePosition('who-files-a-session') !== 'block') return void met()
  throw gateMetOnceTheWriteIsTakenBack(new PanelError(why, 403), met)
}
