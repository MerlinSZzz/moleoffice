// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { inspectorAnswersRun } from './inspector-answers-lines.ts'
import { RULES_THE_CODE_NAMES } from '@shared/chapter-check.ts'
import { checkSavedChapterClaims, ROUND_CHAPTERS, roundChaptersText, savedRoundChapters } from '@shared/round-chapters/manifest.ts'
import { REMINDED_BEFORE_THE_SEAL } from '@shared/before-the-seal.ts'
import { endTheClaimsOfARun } from './claims.ts'
import { aLinkRowAsTheSealHashesIt, captureGit, readRunSeal, theBaseARunNames, theHashOfALinkRow, verifyRunSeal, isLegacyUnsealed, theNewestRevisionOf, theOwnLinesOf, whatALaterSealHolds, type AVerifiedSeal, type CommitNotHeld, type HeldCommit } from './sealed-tip.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { theSealReadApart, theSealReadApartOrHere, type ASealReadApart, type HowASealIsVerified } from './the-seal-read-apart.ts'
import { aPartOfThisPass, theRevisionsKeptForThisFinish, type ARevisionTheCheckRead } from './a-finish-reads-git-apart.ts'
import { listMergeQueue, maySpeakForTheSecretary, readMergeEntry, theMergeEntry, theMergeOfARun } from './merge-queue.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { readAStatement } from '@shared/commit-statements.ts'
import { aReleaseNamedTheSealBefore0154, howAReleaseNamesThisSeal, type SealedTip } from '@shared/sealed-tip.ts'
import { MERGE_STATE_SPECS, type AskedToResolveMessage } from '@shared/merge-queue.ts'
/**
 * THE CHECK: WHERE A RUN STANDS, WHAT AN INSPECTOR READS, AND THE ONE ACT THAT ENDS A SUBAGENT.
 *
 * Criteria C17 to C23, C25 and C26 of design/rules/ACCEPTANCE.md. A subagent saying it has finished
 * has not really finished: its work is checked, by the agent or by a checking agent that knows the
 * office's past rulings (read at a semantic level, not all loaded into context, which would waste too
 * much). When the check finds no problem, a message ends the subagent and its result goes back to the
 * main agent. This keeps the check out of the higher agent's context, and keeps checking apart from working.
 *
 * ---------------------------------------------------------------------------------------
 * FOUR THINGS THIS FILE DOES
 * ---------------------------------------------------------------------------------------
 *
 * 1. WHERE A RUN STANDS. One stored fact, `released` on the session record, and one reading. A run
 *    that said it was finished and was never released reads as unreleased, not as finished.
 *
 * 2. WHAT AN INSPECTOR READS. Five things and no more (section 7.3): the brief, the chapters that
 *    brief named at the levels it named, the precedents of those chapters, the report and what the
 *    run wrote, and the changes through the work area the worker registered when it started.
 *
 * 3. THE PROMPT, ASSEMBLED AT SEMANTIC LEVELS. It never carries the whole code. Every chapter is
 *    there at its name and what it governs when it is shared — and only the chapters
 *    the brief named are written out further. That is criterion C23 and it is measured in bytes.
 *
 * 4. THE ONE ACT. A release writes two messages: one to the subagent ending it, carrying the check,
 *    and one to the starter carrying the result and one line saying it was checked. The starter
 *    never receives the check itself, which keeps the check out of the higher agent's context. A refusal
 *    writes the same two shapes and opens a group holding the worker, its supervisor and the
 *    inspector, and the refusal stands while they talk.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * IT DOES NOT START A PROCESS. Nothing under src/ may start one. The inspector's
 * run is started by `tools/the-inspector.mjs`, which fetches the prompt this file assembles, runs it
 * through the same runtime `tools/agent-worker.mjs` uses, and posts the answer back to the one act.
 *
 * IT DOES NOT STOP AN UNCHECKED FINISH. Mole Office does not own a subagent's process. Section 7.2:
 * what it can do is say, on the run, whether a check happened and who did it.
 */

import { anOfficeId } from './ids.ts'
import { aRunRunsNoModel, checkEligibility, noCheckSays, noCheckSentenceFrom, type CheckEligibility, type CheckEligibilityFacts } from '@shared/check-eligibility.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { recordedHead, recordedCutFrom, COMMIT_ID, UnreadableGitObject } from './check-tip.ts'
import type { PanelRecord } from '@shared/types.ts'
import { AGENT_AUTHORITIES, DECISION_AUTHORITY_NEEDS } from '@shared/kinds.ts'
import type { OfficeChapterInBothLanguages } from '@shared/office-rules.ts'
import { chaptersInTheStandingLoad } from '@shared/office-rules.ts'
import { moleOffice, participantWord, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { type APluginOnlyChange, NOT_READ_BY_THE_PLUGIN_RULE, type ThePluginRule, thePluginRuleOf } from '@shared/plugins.ts'
import { clockStamp, nowStamp, parseAnyStamp } from '@shared/time.ts'
import { kindWord, stateWord } from '@shared/words.ts'
import { aChapterAtItsNameOnTheLadder, chaptersReadAgainstTheBrief, chaptersLineInWords, type ChapterNamed } from '@shared/chapters.ts'
import { NO_CHAPTERS_READ_SAID, whatAReportSaysItRead } from '@shared/chapters.ts'
import {
  CONFIRMED,
  NO_GROUP_FOR_A_CHECK_AGAIN,
  REFUSED,
  RELEASED,
  aRefusalHappened,
  aRunSaysItIsFinished,
  anInspectorThatFixedIt,
  checkedAndReleased,
  howARunStands,
  itClosesWhenYouConfirm,
  readRefusal,
  readWorkerCheckNotAsked,
  type AWorkerCheckNotAsked,
  theBasisNamed,
  theCheckFailedSays,
  theGroupForARefusal,
  theSupersededOn,
  whyTheGroupWasOpened,
  RUN_STANDING,
  TRACED_HOW,
  type CheckFailedNext,
  type Confirmation,
  type ClosedUnchecked,
  type Refusal,
  type Release,
  type Superseded,
  type Verdict,
  type WhatSaysSo,
  type WhereARunStands,
  type ReportConfirmation,
  type WhoChecked,
  type WroteIntoTheOffice,
  type TracedChange,
  type ListedFaults,
} from '@shared/releasing.ts'
import { aReleaseWithoutATraceSays, aTraceNamingRecordsNotHeldSays, readRelease, theFilesOfWhatWasRead, theScopeOfWhatWasRead, type LandedByHand, type PathThatNeedsJudgment, type WhatWasRead } from '@shared/releasing.ts'
import { releasedAsAStandardChange, type AStandardRelease } from '@shared/releasing.ts'
import { db, sqlite } from '../db/client.ts'
import { revisionsReaderOf, wholeRevisionData } from '../db/revision-stored-once.ts'
import { theListARevisionRowHashesUnder } from '../db/the-hash-a-seal-pins-a-row-by.ts'
import { records } from '../db/schema.ts'
import { sql, type SQL } from 'drizzle-orm'
import {
  aPatchThatReplaces,
  createLink,
  createRecord,
  getRecord,
  getRecordsWithIds,
  listRecords,
  patchRecord,
  resolveLinks,
  type Actor,
} from './records.ts'
import { resolveSessionRef } from './resolve-session-ref.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theChainUpFrom, theReleaseReadingOf, theFilesAreaOf, type FilesAreaFolder, type RegisteredAgent } from './participants.ts'
import { agentsForRecords } from '../db/agents-for-records.ts'
import { participantForActor } from './participant-for-actor.ts'
import { agentForRecord } from '../db/agent-for-record.ts'
import { agentsWithTheseIds } from '../db/agents-with-these-ids.ts'
import { listParticipants } from '../db/list-participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theCardOfAgent } from '../db/the-card-of-agent.ts'
import { isAnInspector, type AnotherNoticeKind } from './notices.ts'
// WHICH AGENT ONE STORED STRING NAMES, asked of the three-question reader that answers it against
// whatever database is open. A stored reference is never resolved by the arriving resolver.
import { theAgentWithThisId, theOneAgentAStringNames, type AgentIdentity, type TheIdentityOf } from './agent-references.ts'
import { everyAgentAReferenceCouldName } from '../db/agent-references.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { aRoleNeedsARegisteredWorkArea, theCardOffTheTree, THE_WORKER, THE_SUPERVISOR } from '@shared/roles.ts'
import { theReviewLevel } from '../db/the-review-level.ts'
import { whetherThisOfficeWouldStartThisRunCheck } from './checks-in-merges-only.ts'
import { A_CHECK_NOTHING_STARTS, A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS, aCheckNothingStartsSays, aCheckThatWillStartSays, type ACheckNothingStarts } from '@shared/whether-a-check-would-start.ts'
import { readTheHonourOfARun, storeTheHonourReading } from './honour.ts'
import { gateMet } from './gate-counts.ts'
import { gatePosition } from '../../config/settings.mjs'
import { THE_FOUR_KINDS, WHAT_A_KIND_IS, aCheckOfHandedBackPackages, theListedFaultsSay } from '../../config/verdict-kinds.mjs'
import { A_POINTS_STATE_IN_WORDS, thePackagesThisRunHandedBack, type ThePackagesARunHandedBack } from './delegation.ts'
import { theRowNamesAnotherMachine } from './machines.ts'
import { stopTheUnshownWorldsOfARun } from './isolated-worlds.ts'
import { THE_WORLDS_STOP_KEY } from '@shared/worlds.ts'
import { ACROSS_WORKSPACES, createRecordWithReport } from './records.ts'
import { THE_UNPOSTED_VERDICT, WHY_THE_TOOL_COULD_NOT_DECIDE_IT } from '../../config/inspection-ending.mjs'
import { MESSAGE_CENTRE, REVIEW_LEVEL_SAYS, REVIEW_LEVEL_WORDS, type ReviewLevel } from '@shared/workspaces.ts'
import { chapterAt, chapterNumbered, everyChapterAtItsName, MUST_READ, theAbsenceOfARule, theCardLineOf, theChapters, theChaptersLineFor, theRuleWithTheId } from './chapters.ts'
import { addAMember, isAMember, groupOpenedFor, openAGroupAndSayWhy, writeASystemLineToOne } from './groups.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { sayWhereADeliveryStands } from './messages.ts'
import { insideTheScope, insideTheWorkArea } from '../../config/work-area.mjs'
import { whatSaysTakes } from '../../config/verdict-keys.mjs'
import { NO_DECISION_WAS_GIVEN, whatSaysTakesUnderSavedChapters } from '../../config/inspection-saved-chapters-says.mjs'
import { theInvariantsTheRulesList } from './invariants.ts'
import { insideTheFilesArea, theFoldersThatMoved } from '../../config/files-area.mjs'
import { closeTheGoneProcessRowsOfAnEndedRun, listResources, theProcessGroupsLiveness, type EndedRunRows } from './resources.ts'
import { readGit } from './resources.ts'
import { theRecordedProcessOf } from '../../config/own-rows.mjs'
import { whetherTheRecordedProcessRuns } from '../../config/session-process.mjs'
import { SETTLEMENTS_ON_THE_CHECK, asTheDoorOf } from './check-field-doors.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { theRepositoryNamed } from './the-repository-named.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { theRunThatStartedItHasEnded } from './worker.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { theAgentTheKeyProves } from './the-agent-the-key-proves.ts'
import { isOneOf, theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { isOneOfTheStamps, theStampsOfAnAgent, theStampsReadOnce, type TheStampsOf } from './registry-aliases/stamps.ts'
import { THE_OFFICE_WRITES_AS } from './the-offices-secretary-run.ts'
import { theRunThatAskedForThisWorker } from './worker-runs.ts'
import { theOfficeAsksTheNextRoundAtTheRelease } from './next-round-at-the-seal.ts'
import type { NextRoundAtTheSeal } from '@shared/next-round-at-the-seal.ts'
import { THE_OFFICE } from './the-office.ts'

// ============================================================================ where a run stands

/** True when the value is a JSON object rather than an array, a null or a scalar. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A non-empty string, or null. Used on everything read out of stored JSON. */
function said(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * THE NAME A SENTENCE GIVES ONE PARTICIPANT. An agent is named by its office name, the name a person
 * sees on its page, found by its registry id or by its one handle exactly as the web's `writerNamed`
 * finds it. A person is named by the id it was given. An agent no single registry row answers,
 * because no row has that id or handle or because two rows share it, gets the unregistered-agent
 * word, as `writerNamed` gives it.
 */
export function theNameAPersonReads(who: ParticipantRef): string {
  if (who.kind !== 'agent') return who.id
  const agent = theOneAgentAStringNames(sqlite, who.id)
  if (agent === null) return sayInEnglish('record.writer.unregisteredAgent')
  return theOfficeNameOf(agent)
}

/**
 * THE OFFICE NAME OF AN AGENT WHOSE ROW THE CALLER HOLDS: its name, or its handle when the name is blank. The one rule,
 * so a sentence that already holds the row names the agent as `theNameAPersonReads` does, with no second read.
 */
export function theOfficeNameOf(agent: { name: string; handle: string }): string {
  return agent.name.trim() === '' ? agent.handle : agent.name
}

/** The office name of an agent the caller holds a row for, or its own words when it holds none. */
function theNameOfAnAgentOr(agent: { id: string } | null | undefined, whenThereIsNone: string): string {
  return agent === null || agent === undefined ? whenThereIsNone : theNameAPersonReads({ kind: 'agent', id: agent.id })
}

/**
 * THE AGENT ONE STORED STRING NAMES, the way criterion I2 reads a stored reference.
 *
 * IT IS NOT THE ARRIVING RESOLVER. This string was written earlier and is read back now.
 * `theOneAgentAStringNames` counts every agent the string could name — as an exact id, and as a live
 * or retired handle — and answers that agent only when all of those are the SAME agent, which is the
 * case of one agent said two ways. Two different agents, or nobody, gives null: an ambiguous stored
 * name is not a guess to make, and the callers here all answer "nobody" for a run they cannot place.
 *
 * `null` is the answer for both "nobody" and "more than one". `agentForRecord` is the separate join
 * to an agent RECORD id, which is not a registry reference, and every caller tries it after this.
 */
function theAgentAStoredStringNames(
  stored: string,
  rowOf: TheRowOf = inTheRegistry(() => listParticipants().agents),
): RegisteredAgent | null {
  const named = theOneAgentAStringNames(sqlite, stored)
  return named === null ? null : rowOf(named.id)
}

/**
 * THE AGENT A RUN SERVES, from any of the three names a run has written for one.
 *
 * Three spellings are accepted for the reason `recentlyWritten` accepts more than one: a durable
 * agent has written under more than one of its names over its life, and a run files whichever it
 * had. They are the handle, the registry id, and the id of the agent's own RECORD.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD ONE WAS MISSING, AND IT WAS MEASURED ON THIS FILE'S OWN AUTHOR
 * ---------------------------------------------------------------------------------------
 *
 * Run `o2RjuOUEIwpf` wrote `servingAgent: "2rBbYVnVHvq_"`, the id of the `agent` record for
 * this file's author. Neither of the first two found it: `agentByHandle` looks up the handle column, and
 * `listParticipants().agents[].id` is the REGISTRY id, which for every agent in this installation is
 * the handle again. So the run resolved to no agent at all, and `GET /api/checks/o2RjuOUEIwpf`
 * answered `workArea: null` — *a run nobody can check this way*. The work area was registered and
 * correct the whole time; nothing could reach it.
 *
 * IT IS NOT A TYPO A WRITER SHOULD HAVE AVOIDED. The session kind then described `servingAgent` as
 * the agent's *id in the agent registry*, and `ranAs.agentId` beside it is refused unless it holds
 * the RECORD id — so a run filling both from what it was given writes the record id here and is
 * then invisible to its own check. Absence beats a guess, but this was an absence that was not
 * there: the agent existed, and one join away. Wave 4 corrected that description on 23 September
 * 2026: it now says the field holds the name whoever filed the run used, which is the handle in
 * every writer in this repository, and that `servingAgentId` holds the registry id.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT RESOLVES IT NOW
 * ---------------------------------------------------------------------------------------
 *
 * `theAgentARunServes` reads `servingAgentId` by exact registry id first. An id no row holds names
 * nobody; the handle is not tried instead (problem CeWpdlseVgyE). Without an id, that same reader
 * reads `servingAgent` as a stored reference, then as an agent record id if no registry row names
 * it. The result must belong to the registry handed to this reader. With neither field, the
 * workspace's single `ranAs` binding is read as an agent record id.
 */
export function theAgentOfARun(run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>): RegisteredAgent | null {
  return theAgentOfARunAmong(run, theRowOfOneId)
}

/**
 * THE AGENT EACH OF THESE RUNS SERVES, by registry id, or null where `theAgentOfARun` finds none.
 * The answer for each run is `theAgentOfARun`'s, but the registry is read once for all of them. The
 * office scene asks this for every session record it draws; asking `theAgentOfARun` once per record
 * read the registry 3,661 times in one scene on 25 September 2026 (problem u_yThQczHiZ8).
 *
 * AND EACH OF THE OTHER TWO FACTS IS READ ONCE FOR ALL OF THEM TOO (wave 13y round 46). `identityOf` is how an id is
 * looked up (`theAgentARunServes`). The agent records the `ranAs` bindings name are read in one statement by
 * `agentsForRecords`, which answers for each record what `agentForRecord` answers; each was a statement per run.
 */
export function theAgentsOfTheseRuns(
  runs: readonly Pick<PanelRecord, 'id' | 'data' | 'workspaceId'>[],
  agents: () => readonly RegisteredAgent[] = theRegistryReadOnce(),
  identityOf?: TheIdentityOf,
): Map<string, string | null> {
  // BY ID, the first row with each id as `inTheRegistry` finds it. An id is the registry's primary key, so there is one.
  let byId: Map<string, RegisteredAgent> | null = null
  const rowOf: TheRowOf = (id) => {
    if (byId === null) {
      byId = new Map()
      for (const one of agents()) if (!byId.has(one.id)) byId.set(one.id, one)
    }
    return byId.get(id) ?? null
  }
  const named = runs.map((run) => [run.id, howARunNamesItsAgent(run, identityOf)] as const)
  const records = agentsForRecords([...new Set(named.flatMap(([, how]) => ('record' in how ? [how.record] : [])))])
  return new Map(
    named.map(([id, how]) => [id, 'record' in how ? (records.get(how.record)?.id ?? null) : 'identity' in how ? (rowOf(how.identity.id)?.id ?? null) : null]),
  )
}

/**
 * THE AGENT REGISTRY, READ THE FIRST TIME SOMETHING ASKS AND THEN KEPT. A caller that places many
 * runs in one request makes one of these and hands it to every reader below that takes `agents`.
 * Reading the registry is not cheap: each agent row asks for its runtime with a statement of its own,
 * so one read ran about 530 statements on a copy of the office on 27 September 2026.
 *
 * Keep it only for one synchronous request. A registration after it was read is not in it.
 */
export function theRegistryReadOnce(): () => readonly RegisteredAgent[] {
  let registry: readonly RegisteredAgent[] | null = null
  return () => (registry ??= listParticipants().agents)
}

/** The whole registry row of one agent id, or null where no row has that id. Each reader below is handed one. */
type TheRowOf = (id: string) => RegisteredAgent | null

/** The row found in a registry already read, for a caller that places many runs with one reading. */
const inTheRegistry = (agents: () => readonly RegisteredAgent[]): TheRowOf => (id) => agents().find((one) => one.id === id) ?? null

/**
 * THE ROW READ BY ITS ID ALONE, for a caller that places one run. `agentsWithTheseIds` builds it as `listParticipants`
 * does, retired rows included. Wave 13y round 44: the long sandbox runs step of the minute pass built the whole registry
 * for each run it placed, to keep one row of it.
 */
const theRowOfOneId: TheRowOf = (id) => agentsWithTheseIds([id]).get(id) ?? null

/** `theAgentOfARun` with the reader of a row handed in, so a caller asking about many runs reads the registry once. */
function theAgentOfARunAmong(
  run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>,
  rowOf: TheRowOf,
): RegisteredAgent | null {
  const how = howARunNamesItsAgent(run)
  if ('record' in how) return agentForRecord(how.record)
  if ('identity' in how) return rowOf(how.identity.id)
  return null
}

/**
 * HOW A RUN NAMES ITS AGENT, before any registry row is read: the agent `theAgentARunServes` finds from the run's two
 * serving fields, or, where it wrote neither, the agent record its project's one `ranAs` binding names. The answer also
 * says which of the three fields the name came from and with what value, so a refusal about that name names the same
 * field the reader read. A record that names nobody answers `noAgent`; one whose project holds more than one `ranAs`
 * binding answers `noOneAgent` with the count. `theAgentOfARunAmong`, `theAgentsOfTheseRuns` and the seal's reader all
 * ask here (wave 13y round 46), so none of them can read one run two ways.
 */
function howARunNamesItsAgent(
  run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>,
  identityOf?: TheIdentityOf,
):
  | { identity: AgentIdentity; field: 'servingAgentId' | 'servingAgent'; value: string }
  | { record: string; field: 'ranAs'; value: string }
  | { unresolved: true; field: 'servingAgentId' | 'servingAgent'; value: string }
  | { noAgent: true }
  | { noOneAgent: number } {
  if (!isObject(run.data)) return { noAgent: true }
  const id = said(run.data['servingAgentId'])
  const wrote = said(run.data['servingAgent'])
  if (id === null && wrote === null) {
    if (Object.hasOwn(run.data, 'servingAgent') || run.workspaceId === undefined || !Array.isArray(run.data['ranAs'])) return { noAgent: true }
    const bindings = run.data['ranAs'].filter(binding => isObject(binding) && binding['workspaceId'] === run.workspaceId)
    if (bindings.length === 0) return { noAgent: true }
    if (bindings.length > 1) return { noOneAgent: bindings.length }
    const bound = said(bindings[0]['agentId'])
    return bound === null ? { noAgent: true } : { record: bound, field: 'ranAs', value: bound }
  }
  const field = id !== null ? 'servingAgentId' as const : 'servingAgent' as const
  const value = (id ?? wrote) as string
  const named = theAgentARunServes(run.data, identityOf)
  return named === null ? { unresolved: true, field, value } : { identity: named, field, value }
}

/**
 * THE AGENT A FINISHING RUN WORKED AS, AS THE SEAL READS IT.
 *
 * ----------------------------------------------------------------------------------------------
 * THE ONE SPELLING `theAgentOfARun` DOES NOT READ, AND WHO IT REFUSED
 * ----------------------------------------------------------------------------------------------
 *
 * Problem `2plCt-8-b-pW`. A run filed with `ranAs` and no `servingAgent` binds itself with
 * `ranAs[].agentId`, and `theAgentOfARun` reads that binding through `agentForRecord` alone — the
 * join from an agent RECORD id. A run whose binding holds another of the three names (the handle,
 * or the registry id, which in this installation is the handle again — the same miss the comment
 * on `theAgentOfARun` records for run `o2RjuOUEIwpf`) names an agent that is in the registry, and
 * resolved to null at finish, and was refused with "its agent is not registered" although the
 * agent's row is there with everything else the seal reads. The word "not registered" was false
 * for it; this reader answers the rest of the registry, whatever the row's `retired` flag says,
 * because the seal reads a fact about identity, not about being live. A run the seal cannot name is
 * refused in `sealFinishedRun` with the words `theSealsReadingOfARunsAgent` gives, which say which
 * of the three cases it is.
 */
export function theAgentOfARunForItsSeal(run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>): RegisteredAgent | null {
  const reading = theSealsReadingOfARunsAgent(run)
  return 'agent' in reading ? reading.agent : null
}

/**
 * WHAT THE SEAL READS OF A RUN'S AGENT: the row, or the words saying why no row answers to the name
 * the record gave. One reading gives both, so the field a refusal names is the field the reader read.
 */
export function theSealsReadingOfARunsAgent(
  run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>,
): { agent: RegisteredAgent } | { refusal: string } {
  return theSealsReadingOfARunsAgentAmong(run, theRowOfOneId)
}

/**
 * `theSealsReadingOfARunsAgent` with the reader of a row handed in, so a caller asking about many runs reads the
 * registry once. The answer for each run is the same as `theSealsReadingOfARunsAgent`'s.
 */
function theSealsReadingOfARunsAgentAmong(
  run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>,
  rowOf: TheRowOf,
): { agent: RegisteredAgent } | { refusal: string } {
  const how = howARunNamesItsAgent(run)
  if ('record' in how) {
    // THE SAME ONE STORED READER: exact registry id, then the one handle. `agentForRecord` is tried
    // first, so a binding that is a RECORD id is answered there.
    const row = agentForRecord(how.record) ?? theAgentAStoredStringNames(how.record, rowOf)
    if (row !== null) return { agent: row }
  } else if ('identity' in how) {
    const row = rowOf(how.identity.id)
    if (row !== null) return { agent: row }
  }
  if ('noOneAgent' in how) {
    return { refusal: `The run cannot finish: its record names no one agent. It has no data.servingAgent or data.servingAgentId, and ${how.noOneAgent} data.ranAs bindings in its project.` }
  }
  if ('field' in how) {
    return { refusal: `The run cannot finish: its record names the agent "${how.value}" in data.${how.field}, and no registered agent answers to that name.` }
  }
  return { refusal: 'The run cannot finish: its record names no agent. A run names its agent in data.servingAgent (a handle), data.servingAgentId (a registry id) or one data.ranAs binding in its project, and this record names an agent in none of them.' }
}

/** `theAgentOfARunForItsSeal` with the reader of a row handed in. */
function theAgentOfARunForItsSealAmong(
  run: Pick<PanelRecord, 'data'> & Partial<Pick<PanelRecord, 'workspaceId'>>,
  rowOf: TheRowOf,
): RegisteredAgent | null {
  const reading = theSealsReadingOfARunsAgentAmong(run, rowOf)
  return 'agent' in reading ? reading.agent : null
}

/** Facts come from stored run/registry history, never from the inspector's request body. */
export function checkEligibilityForRun(runId: string, workspaceId: string): CheckEligibility {
  const run = theRun(runId, workspaceId)
  const facts = resolveCheckEligibilityFacts(run)
  const decision = checkEligibility(facts, aRunRunsNoModel(run.data))
  return facts.submittedTipUnreadable === undefined ? decision : {
    ...decision,
    says: decision.says + ' ' + facts.submittedTipUnreadable,
  }
}

/** Every role snapshot is relevant, including retired and no-longer-appointed holders. */
function neverAnInspector(agent: RegisteredAgent): boolean | null {
  const inspector = theCardOffTheTree(theRoleCards())?.name
  if (!inspector) return null
  if (agent.role === inspector) return false
  const cards = new Set(theRoleCards().cards.map((card) => card.name))
  if (agent.role != null && !cards.has(agent.role)) return null
  const rows = sqlite.prepare(
    'SELECT r.data FROM agent_records a LEFT JOIN revisions r ON a.record_id = r.record_id WHERE a.agent_id = ?',
  ).all(agent.id) as { data: string }[]
  if (rows.length === 0) return null
  let unknown = false
  for (const row of rows) {
    let data: unknown
    try { data = JSON.parse(row.data) } catch { unknown = true; continue }
    if (!isObject(data)) { unknown = true; continue }
    if (data['role'] === inspector) return false
    if (data['role'] != null && (typeof data['role'] !== 'string' || !cards.has(data['role']))) unknown = true
  }
  return unknown ? null : true
}

/**
 * THE FIELDS OF A REVISION THE LOOP OF `theCheckEligibilityFactsOf` READS, at the top of its data and in its `extra`:
 * role, purpose, extra.role and extra.purpose for the inspection; servingAgentId and servingAgent for the agent it names,
 * as `theAgentARunServes` reads them; ranAs for its bindings; and deliveringMessage for a check request. It reads `extra`
 * only as the object that holds those two.
 */
const THE_FIELDS_THE_CHECK_READS = ['role', 'purpose', 'servingAgentId', 'servingAgent', 'ranAs', 'deliveringMessage'] as const
const THE_FIELDS_OF_EXTRA_THE_CHECK_READS = ['role', 'purpose'] as const

/** The keys, as an SQL list of strings. */
function anSqlList(keys: readonly string[]): string {
  return keys.map((key) => `'${key}'`).join(', ')
}

/**
 * THE COLUMNS OF A REVISION AS THE CHECK READS IT INSIDE A FINISHING WRITE. Every JSON function is asked only of data
 * `json_valid` reads, because one that is handed malformed JSON throws. `shape` is the JSON type of the data, or NULL
 * where SQLite does not read it as JSON, and `unread` is then the data as it is stored. `twice` says whether a field the
 * check reads, or `extra`, is written twice: `->` reads the first copy and JSON.parse the last. Each field is its JSON
 * text, or NULL where it is absent, so a field written as null is still there.
 */
const THE_COLUMNS_THE_CHECK_READS = [
  'seq', 'id', 'actor_type', 'actor_id',
  'CASE WHEN json_valid(data) THEN json_type(data) END AS shape',
  'CASE WHEN json_valid(data) THEN NULL ELSE data END AS unread',
  "CASE WHEN json_valid(data) THEN CASE WHEN json_type(data) = 'object' THEN " +
    `EXISTS (SELECT 1 FROM json_each(data) WHERE key IN (${anSqlList([...THE_FIELDS_THE_CHECK_READS, 'extra'])}) GROUP BY key HAVING count(*) > 1) OR ` +
    `EXISTS (SELECT 1 FROM json_each(data, '$.extra') WHERE key IN (${anSqlList(THE_FIELDS_OF_EXTRA_THE_CHECK_READS)}) GROUP BY key HAVING count(*) > 1) END END AS twice`,
  ...THE_FIELDS_THE_CHECK_READS.map((field) => `CASE WHEN json_valid(data) THEN data -> '$.${field}' END AS "${field}"`),
  ...THE_FIELDS_OF_EXTRA_THE_CHECK_READS.map((field) => `CASE WHEN json_valid(data) THEN data -> '$.extra.${field}' END AS "extra.${field}"`),
].join(', ')

/**
 * A revision's data whole, as the check read it before it read the fields alone: less remindedBeforeTheSeal (the seal
 * preview's reminder) and extra.roundChapters (the round's chapters), which the loop does not read, and with malformed
 * JSON kept as it is stored, for JSON.parse to refuse.
 */
const A_REVISION_WHOLE = 'SELECT CASE WHEN json_valid(data) THEN json_remove(data, ?, ?) ELSE data END AS data, actor_type, actor_id FROM revisions'

/** A row of `THE_COLUMNS_THE_CHECK_READS`. */
type ARevisionRowTheCheckReads = {
  seq: number
  id: string
  actor_type: string | null
  actor_id: string | null
  shape: string | null
  unread: unknown
  twice: number | null
} & Record<string, unknown>

/**
 * THE REVISIONS OF A RUN, AS THE CHECK'S FACTS READ THEM: each one's data as JSON.parse reads it, with its writer, or
 * `unreadable` where JSON.parse could not read it.
 *
 * OUTSIDE A FINISHING WRITE every revision is read whole, by the statement it was always read by.
 *
 * INSIDE ONE (`theRevisionsKeptForThisFinish`), the write asks again and again: the reminder before the seal, and the gate
 * and the seal of each pass. So the first ask reads only the fields the check reads, and keeps the rows for the request.
 * A later ask reads only the rows after the newest one kept, once that row is found still stored under its number with
 * its id. A revision is only ever added, with the next number and an id of its own, so a row still stored under the
 * newest number kept means every row kept is stored as it was read, and a rolled-back row is never kept past the next ask.
 */
function theRevisionsTheCheckReads(runId: string): readonly ARevisionTheCheckRead[] {
  const kept = theRevisionsKeptForThisFinish()
  if (kept === null) {
    const rows = sqlite.prepare(`${A_REVISION_WHOLE} WHERE record_id = ?`).all(`$.${REMINDED_BEFORE_THE_SEAL}`, `$.extra.${ROUND_CHAPTERS}`, runId) as {
      data: string
      actor_type: string | null
      actor_id: string | null
    }[]
    return rows.map((row) => theRevisionParsed(row.data, { type: row.actor_type, id: row.actor_id }))
  }
  const held = kept.get(runId)
  const stored = held === undefined ? undefined : sqlite.prepare('SELECT id FROM revisions WHERE record_id = ? AND seq = ?').get(runId, held.newest.seq) as { id: string } | undefined
  const still = held !== undefined && stored?.id === held.newest.id ? held : undefined
  const rows = (still === undefined
    ? sqlite.prepare(`SELECT ${THE_COLUMNS_THE_CHECK_READS} FROM revisions WHERE record_id = ? ORDER BY seq`).all(runId)
    : sqlite.prepare(`SELECT ${THE_COLUMNS_THE_CHECK_READS} FROM revisions WHERE record_id = ? AND seq > ? ORDER BY seq`).all(runId, still.newest.seq)) as ARevisionRowTheCheckReads[]
  const read = [...(still?.read ?? []), ...rows.map(theRevisionAsTheCheckReadsIt)]
  const newest = rows.at(-1)
  if (newest !== undefined) kept.set(runId, { read, newest: { seq: newest.seq, id: newest.id } })
  else if (still === undefined) kept.delete(runId)
  return read
}

/** A revision's data as JSON.parse reads it, with its writer, or `unreadable`. */
function theRevisionParsed(data: unknown, writer: { type: string | null; id: string | null }): ARevisionTheCheckRead {
  try {
    return { snapshot: JSON.parse(data as string), writer }
  } catch {
    return { unreadable: true }
  }
}

/** A row of `THE_COLUMNS_THE_CHECK_READS` as the loop reads it: a snapshot holding the fields that are there, and no other. */
function theRevisionAsTheCheckReadsIt(row: ARevisionRowTheCheckReads): ARevisionTheCheckRead {
  const writer = { type: row.actor_type, id: row.actor_id }
  // NOT JSON SQLITE READS, such as malformed JSON or JSON nested deeper than SQLite reads: the whole text, as before.
  if (row.shape === null) return theRevisionParsed(row.unread, writer)
  // JSON THAT IS NO OBJECT holds no field, and the loop reads it as unknown, whatever it holds.
  if (row.shape !== 'object') return { snapshot: null, writer }
  // A FIELD WRITTEN TWICE is read whole, so JSON.parse reads its last copy, as it did.
  if (row.twice === 1) {
    const whole = sqlite.prepare(`${A_REVISION_WHOLE} WHERE id = ?`).get(`$.${REMINDED_BEFORE_THE_SEAL}`, `$.extra.${ROUND_CHAPTERS}`, row.id) as { data: string }
    return theRevisionParsed(whole.data, writer)
  }
  const snapshot: Record<string, unknown> = {}
  for (const field of THE_FIELDS_THE_CHECK_READS) {
    if (row[field] !== null) snapshot[field] = JSON.parse(row[field] as string)
  }
  const extra: Record<string, unknown> = {}
  for (const field of THE_FIELDS_OF_EXTRA_THE_CHECK_READS) {
    if (row[`extra.${field}`] !== null) extra[field] = JSON.parse(row[`extra.${field}`] as string)
  }
  if (Object.keys(extra).length > 0) snapshot['extra'] = extra
  return { snapshot, writer }
}

export function resolveCheckEligibilityFacts(run: PanelRecord, oneRun = false): CheckEligibilityFacts & { submittedTipUnreadable?: string } {
  // A PART OF A FINISHING WRITE'S PASS, so the finish's line says what these facts cost in it.
  return aPartOfThisPass('who may check the run', () => theCheckEligibilityFactsOf(run, oneRun))
}

function theCheckEligibilityFactsOf(run: PanelRecord, oneRun: boolean): CheckEligibilityFacts & { submittedTipUnreadable?: string } {
  const data = isObject(run.data) ? run.data : {}
  // A finish reads each named agent once; other callers keep their one registry reading for the run and its revisions.
  const rows = new Map<string, RegisteredAgent | null>()
  const rowOf: TheRowOf = oneRun ? (id) => {
    if (!rows.has(id)) rows.set(id, theRowOfOneId(id))
    return rows.get(id) ?? null
  } : inTheRegistry(theRegistryReadOnce())
  const worker = theAgentOfARunAmong(run, rowOf)
  // The loop reads role, purpose, extra.role, extra.purpose, servingAgentId, servingAgent,
  // ranAs and deliveringMessage. Outside a finishing write a revision comes without
  // remindedBeforeTheSeal (the seal preview's reminder) and extra.roundChapters (the round's
  // chapters); inside one it holds only THE_FIELDS_THE_CHECK_READS. A field this loop starts
  // reading goes in that list, or a finish reads it as absent.
  const history = theRevisionsTheCheckReads(run.id)
  let noInspector: boolean | null = history.length === 0 ? null : true
  const snapshots: { snapshot: unknown; writer: { type: string | null; id: string | null } | null }[] = [{ snapshot: data, writer: null }]
  for (const revision of history) {
    if ('unreadable' in revision) noInspector = null
    else snapshots.push(revision)
  }
  const roles = new Map<string, boolean | null>()
  for (const { snapshot, writer } of snapshots) {
    if (!isObject(snapshot)) { if (noInspector !== false) noInspector = null; continue }
    const extra = isObject(snapshot['extra']) ? snapshot['extra'] : {}
    if ([snapshot['role'], snapshot['purpose'], extra['role'], extra['purpose']].some(
      (word) => word === theCardOffTheTree(theRoleCards())?.name || word === 'inspection',
    )) noInspector = false
    // A snapshot with neither serving field says nothing from those fields; one that names an agent
    // nothing answers to is an unknown identity, as before. The handle hold writes ranAs before the
    // name is patched in, and reading the absent name as "nobody" beside the binding made those
    // revisions unknown (seq 2 to 6 of one run, 9 September 2026).
    const namedAgent = said(snapshot['servingAgentId']) ?? said(snapshot['servingAgent'])
    const identities: (RegisteredAgent | null)[] = namedAgent === null ? [] : [theAgentOfARunAmong({ data: snapshot }, rowOf)]
    const bindings = snapshot['ranAs']
    if (bindings !== undefined) {
      if (!Array.isArray(bindings)) { if (noInspector !== false) noInspector = null }
      else for (const binding of bindings) {
        const id = isObject(binding) ? said(binding['agentId']) : null
        identities.push(id === null ? null : agentForRecord(id))
      }
    }
    /**
     * A REVISION THAT NAMES NO AGENT WAS STILL WRITTEN BY SOMEBODY, and the writer is a recorded fact.
     * The hook files a session before the session knows which agent it works as, and the name is
     * patched in later; read as "nobody", that first revision made the whole history unknown and the
     * check never started (run gn3WRiJlyfvU, 9 September 2026). So a revision that names no
     * agent is read by its writer: an agent record's role decides, and the person, or a program that
     * is no agent record (the hook writes as "claude-code"), says nothing either way. A binding to an
     * agent nothing answers to is not "nobody named" and stays unknown, as before. The current data
     * has no writer here and is read as before.
     */
    const namesNobody = identities.length === 0 && !(Array.isArray(bindings) && bindings.length > 0)
    if (namesNobody) {
      if (writer === null) identities.push(null)
      else {
        const wrote = writer.type === 'agent' && writer.id ? (theAgentAStoredStringNames(writer.id, oneRun ? rowOf : undefined) ?? agentForRecord(writer.id)) : null
        if (wrote !== null) identities.push(wrote)
      }
    }
    for (const served of identities) {
      if (served && !roles.has(served.id)) roles.set(served.id, neverAnInspector(served))
      const never = served === null ? null : roles.get(served.id)
      if (never === false) noInspector = false
      else if (never === null && noInspector !== false) noInspector = null
    }
    const messageId = said(snapshot['deliveringMessage'])
    if (messageId) {
      const message = getRecord(messageId)
      const messageData = isObject(message?.data) ? message.data : {}
      const targetId = said(messageData['aboutRun'])
      const target = targetId === null ? null : getRecord(targetId)
      if (target) {
        const requests = sqlite.prepare('SELECT data FROM revisions WHERE record_id = ?').all(target.id) as { data: string }[]
        const targetData: unknown[] = [target.data]
        if (requests.length === 0 && noInspector !== false) noInspector = null
        for (const revision of requests) {
          try { targetData.push(JSON.parse(revision.data)) } catch { if (noInspector !== false) noInspector = null }
        }
        for (const previous of targetData) {
          if (!isObject(previous)) { if (noInspector !== false) noInspector = null; continue }
          if (theCheckAskedFor({ data: previous })?.message === messageId) noInspector = false
        }
      }
      if ((!message || (targetId !== null && !target)) && noInspector !== false) noInspector = null
    }
  }
  const sealed = readRunSeal(run.id)?.seal
  // A SEALED RUN IS CHECKED BY THE AREA ITS SEAL STORED: the seal may since have emptied the agent's own.
  const area = sealed?.area ?? worker?.workArea
  /**
   * A CARD THAT REGISTERS NOTHING NEEDS NO AREA HERE EITHER. Problem XivYfQN8RLQz: three doors ask
   * whether this agent needs a registered work area, and a secretary was stopped by all three. The
   * claims door and the work-area door now read the one answer in `aRoleNeedsARegisteredWorkArea`;
   * so does this gate. Without it the gate held a secretary's run back for want of an area its own
   * card forbids it to register, and told somebody to go and register one, which nothing could do.
   *
   * IT SATISFIES THE FACT, IT DOES NOT SKIP IT. Every other card still answers exactly as before:
   * no area is still `null`, an empty array is still `false`, and a worker with neither is still
   * held back with the sentence it has today. WHEN THE CARDS HAVE NOT BEEN READ the gate keeps its
   * older answer, the same way the claims door does.
   */
  const cardNeedsNoArea = worker !== null && theRoleCardsAreRead() &&
    !aRoleNeedsARegisteredWorkArea(theRoleCards(), worker.role ?? null)
  const recordScope = sealed?.kind === 'records'
    ? sealed.git === null && sealed.records?.workspace === run.workspaceId && sealed.records.records.length > 0
    : null
  const directory = said(data['workingDirectory'])
  const tip = said(data['tip'])
  const cutFrom = said(data['cutFrom'])
  /**
   * A FILES SEAL STANDS WHERE A TIP STANDS: a run whose work is a folder of files has no git HEAD and no commit,
   * because its bytes were never in any repository — so every way below of finding a tip answers "unknown", and no
   * check would ever be asked for it. Found on 23
   * September 2026 by the office's own reply to a finished files run: "No check was asked for: a
   * resolvable submitted tip is unknown." What a check reads of such a run is its seal — each file's
   * path, sha256 and mode — so a seal that holds files is the answer this fact asks for. A files run
   * that has not been sealed yet still answers "unknown", because there is nothing yet to read.
   */
  const filesSealed = sealed?.kind === 'files' && (sealed.files?.files.length ?? 0) > 0
  let submittedTip: boolean | null
  let submittedTipUnreadable: string | undefined
  try {
    submittedTip = filesSealed ? true : (isObject(data['submission']) && ['records', 'mixed'].includes(String(data['submission']['kind'])) && Array.isArray(data['submission']['records']) && data['submission']['records'].length > 0) ? true : directory !== null && recordedHead(directory) !== null ? true
      : tip !== null && cutFrom !== null && cutFrom.trim().length > 0 ? COMMIT_ID.test(tip) : null
  } catch (error) {
    if (!(error instanceof UnreadableGitObject)) throw error
    submittedTip = null
    submittedTipUnreadable = error.message
  }
  return {
    workerServed: worker !== null,
    registeredArea: recordScope !== null ? recordScope : cardNeedsNoArea ? true : area == null ? null : Array.isArray(area)
      ? area.length === 0 ? false : area.every((path) => typeof path === 'string' && path.trim().length > 0) ? true : null : null,
    submittedTip,
    ...(submittedTipUnreadable === undefined ? {} : { submittedTipUnreadable }),
    noInspector,
  }
}

/**
 * A RUN ON ANOTHER COMPUTER IS NOT CHECKED HERE, UNLESS WHAT IT SUBMITTED IS RECORDS. A check of code reads the run's
 * worktree, and that worktree is on the computer the row names (`theRowNamesAnotherMachine`), which this office cannot
 * read. Its code is checked as part of the run on this computer that takes its branch in. A records seal is read from the
 * office's own database, so a run that finished with one is checked like any other.
 */
export function refuseACheckOfCodeOnAnotherComputer(run: PanelRecord): void {
  const data = isObject(run.data) ? run.data : {}
  if (!theRowNamesAnotherMachine({ data })) return
  if (readRunSeal(run.id)?.seal.kind === 'records') return
  throw new PanelError(
    `Run ${run.id} works on another computer, ${String(data['machine'])}, so this office cannot check its code: the ` +
      "worktree a check reads is on that computer. Its code is checked as part of the run on this computer that takes " +
      'its branch in. Only a run on another computer that finished with a records submission is checked here. Nothing was written.',
    409,
  )
}

/** The same refusal reaches every write door and carries the complete decision. */
export function requireCheckEligibility(runId: string, workspaceId: string): void {
  refuseACheckOfCodeOnAnotherComputer(theRun(runId, workspaceId))
  const decision = checkEligibilityForRun(runId, workspaceId)
  if (!decision.eligible) {
    throw new PanelError(noCheckSentenceFrom(decision.says, decision.nextAct, sayInEnglish), 409, JSON.stringify({ eligibility: decision }))
  }
}

/** Eligibility of the target does not establish independence of the checker. */
export function requireIndependentChecker(runId: string, workspaceId: string, actor: Actor): void {
  const worker = theAgentOfARun(theRun(runId, workspaceId))
  // THE CALLER IS AN ARRIVING REFERENCE, so it goes through the one resolver. The comparison is
  // then between two registry ids, which is what makes an agent that wrote under its handle and
  // returns under its id the same checker. A caller no registry holds still falls back to the agent
  // RECORD join, as it did before, so an id sent as an actor is not lost.
  const caller = participantForActor(actor)
  const checker = caller !== null && caller.kind === 'agent' ? readParticipant(caller) : agentForRecord(actor.id)
  if (worker && checker !== null && checker.id === worker.id) {
    throw new PanelError('The checker serves this run. Ask an independent checker. Nothing was written.', 403)
  }
}

/** Who is answering a check, as the verdict door reads it. */
export interface WhoAnswersTheCheck {
  me: ParticipantRef
  /** The caller's registry row when it holds the checking card, otherwise null. */
  inspector: RegisteredAgent | null
  isTheInspector: boolean
  theChecker: ReturnType<typeof theCardOffTheTree>
}

/**
 * THE FIVE REFUSALS OF THE VERDICT DOOR THAT ARE KNOWN BEFORE A CHECK STARTS. The caller is registered; it holds the
 * checking card or the place of starter; and the run is one a verdict can end (`theWorkerAVerdictGoesTo`). None of
 * them depends on what the check finds. So the eligibility door asks this before a check starts, and the inspector
 * stops before its model runs. The verdict door asks it again when the verdict comes, because a worker may retire
 * while a check runs.
 */
export function whoAnswersTheCheck(runId: string, workspaceId: string, actor: Actor, read: HowASealIsRead = {}): WhoAnswersTheCheck {
  const me = participantForActor(actor)

  // ONE. THE CALLER IS SOMEBODY A REGISTRY HOLDS. A check written by a name nothing holds names
  // nobody as the checker, which is the whole of what a release is.
  if (me === null) {
    throw new PanelError(
      `Nothing is registered as "${actor.id}", so it cannot release or refuse anything. A release says who ` +
        'released it, and a name no registry holds says nobody. Register with POST /api/agents/started. ' +
        'Nothing was written.',
      403,
    )
  }

  // TWO. IT IS ONE OF THE TWO THINGS THAT MAY END A RUN. Section 7.2: the starter checks it
  // itself, or an inspector checks it. Doing neither is a break, and it is recorded as one.
  //
  // AN INSPECTOR HOLDS THE INSPECTOR CARD, which is the person's to give — one appointed by the
  // agent whose work it checks is not a check, and POST /api/agents/started already refuses any
  // agent that tries to appoint one.
  // `me` came from `participantForActor`, so its `.id` is a registry id; the row is read by that
  // exact id rather than looked up again by the handle it no longer is.
  const registered = me.kind === 'agent' ? (readParticipant(me) as RegisteredAgent | null) : null
  const reads = whatTheInspectorReads(runId, workspaceId, read)
  const startedBy = reads.agent?.startedBy ?? null
  const theChecker = theCardOffTheTree(theRoleCards())
  const isTheInspector = registered !== null && theChecker !== null && registered.role === theChecker.name
  const isTheStarter = startedBy !== null && startedBy.kind === me.kind && startedBy.id === me.id
  if (!isTheInspector && !isTheStarter) {
    throw new PanelError(
      `${me.id} holds neither the ${theChecker?.name ?? 'checking'} card nor the place of starter of ` +
        `${reads.agent?.handle ?? 'the agent this run serves'}, and those are the two things that may end a ` +
        'run. Section 7.2: the starter checks it itself, or an inspector checks it. ' +
        `${startedBy === null ? 'Nothing is recorded as having started this agent.' : `Its starter is the ${participantWord(startedBy.kind)} ${startedBy.id}.`} ` +
        'Nothing was written.',
      403,
    )
  }

  // THREE TO FIVE. THE RUN IS ONE A VERDICT CAN END.
  theWorkerAVerdictGoesTo(runId, reads)
  return { me, inspector: isTheInspector ? registered : null, isTheInspector, theChecker }
}

/**
 * THE WORKER A VERDICT ON THIS RUN GOES TO, AND ITS STARTER. Three refusals: the run was already released; it names no
 * agent it serves; its worker is retired and nothing recorded who started it. `whoAnswersTheCheck` asks them before a
 * check starts, and `releaseOrRefuse` asks them again before it writes, for a caller that comes by no door.
 */
function theWorkerAVerdictGoesTo(
  runId: string,
  reads: WhatTheInspectorReads,
): { worker: ParticipantRef; starter: ParticipantRef | null; retired: boolean } {
  // ALREADY RELEASED. A second release would leave two answers to "who released it" with nothing
  // saying which one ended it.
  if (reads.stands.released !== null) {
    throw new PanelError(
      `Run ${runId} was already released. ${reads.stands.says} A run is released once. Nothing was written.`,
      409,
    )
  }

  const told = reads.agent === null ? null : whoIsToldOfTheRun(reads.agent)
  const starter = told !== null && 'to' in told ? told.to : null
  if (reads.agent === null) {
    throw new PanelError(
      `Run ${runId} does not say which agent it serves, so there is nobody to release and nobody to tell. ` +
        'A run names its agent in `servingAgent`. Nothing was written.',
      409,
    )
  }
  const worker: ParticipantRef = { kind: 'agent', id: reads.agent.id }

  // THE WORKER MAY BE RETIRED BY THE TIME THE CHECK ENDS. Their rule of 11 September retires a worker
  // the moment its work is handed back, and a check takes forty minutes, so the two meet here: the
  // message door refuses a message to a retired agent, because nobody would read it, and until 13
  // September 2026 that refusal threw the whole verdict away — nothing written, the run left
  // "inspecting", the model's forty minutes lost (problem bVge3jfi1_gr, Cedar's road contour). The
  // door's own refusal names the right reader: the starter. So the message that carries the check
  // goes to the starter in the worker's place, saying so in its first line, and the release or the
  // refusal is written on the run exactly as before. A retired worker with no recorded starter has
  // nobody to tell, and that is said rather than guessed at; the tool keeps the verdict in its log.
  const retired = reads.agent.retired === true
  if (retired && starter === null) {
    throw new PanelError(
      `Run ${runId} serves "${theNameAPersonReads(worker)}", which is retired. ` +
        `${sayInEnglish('checks.retiredWorkerNoOwner')} Nothing was written. The tool keeps the verdict in its own log.`,
      409,
    )
  }
  return { worker, starter, retired }
}

/**
 * WHETHER THIS RUN SAYS ITS WORK IS FINISHED. Declared in src/shared/releasing.ts and read here.
 *
 * It moved there when the run's page began drawing the standing, because the page works the same
 * four stored facts out and a second copy of *what counts as finished* is a second rule. It is
 * re-exported rather than moved outright so that its callers in this server are unchanged.
 */
export { aRunSaysItIsFinished }

/**
 * WHERE ONE RUN STANDS. Criteria C17, C18 and C29.
 *
 * Four stored facts — the finish, `released`, `refused` and `confirmed` — and everything else
 * worked out here, so there is nothing that can disagree with them. Each of the four is written by
 * the office's own act at the moment it happens, and none of them is the worker's word about
 * itself: C29 says the states are the office's, and this is what that means in code.
 */
export function whereARunStands(
  run: Pick<PanelRecord, 'id' | 'data'>,
  // The registry the run's agent is looked up in. A caller placing many runs hands in one reading of
  // it (`theRegistryReadOnce`), so the registry is not read again for each run.
  agents?: () => readonly RegisteredAgent[],
): WhereARunStands {
  const data = isObject(run.data) ? run.data : {}
  // EVERYTHING BUT THE AGENT IS READ IN src/shared/releasing.ts, so the run's page in the browser
  // and this server work the four stored facts out with one reader. Which agent a run serves needs
  // the registry, which only this side has. So does the handle of whoever closed the run as
  // superseded: the stored ref holds a registry id, and the row is read by that exact id.
  const nameOf = (who: ParticipantRef): string | null => {
    const row = who.kind === 'agent' ? readParticipant(who) : null
    return row !== null && 'handle' in row ? row.handle : null
  }
  const stands = howARunStands(data, nameOf)
  // Only a reporting run needs the confirmation door's answer. Read its full record for the workspace too.
  const reporting = stands.standing === 'reporting' ? getRecord(run.id) : null
  return {
    run: run.id,
    agent: theAgentOfARunAmong(run, agents === undefined ? theRowOfOneId : inTheRegistry(agents))?.handle ?? said(data['servingAgent']),
    ...(reporting === null ? stands : howARunStands(data, nameOf, whoMayConfirmThisReport(reporting))),
  }
}

/**
 * Finished runs, newest first, leaving out the archives closed unchecked. Given `ids`, it reads only those of the
 * project's session records, and an empty list reads none.
 */
export function runsThatSaidTheyAreFinished(workspaceId: string, ids?: readonly string[]): { record: PanelRecord; stands: WhereARunStands }[] {
  // THE REGISTRY IS READ ONCE FOR THE WHOLE LIST. Read once per run, GET /api/checks took 6.9 seconds
  // for 6,000 runs on an office of the live shape, and the server answered nothing else meanwhile
  // (problem P-P3huQftq9w).
  const agents = theRegistryReadOnce()
  return listRecords({ workspaceId, kind: 'session', ...(ids === undefined ? {} : { ids }) })
    .map((record) => ({ record, stands: whereARunStands(record, agents) }))
    .filter((one) => one.stands.saidFinished && one.stands.closedUnchecked === null)
}

/**
 * THE STARTER'S LIST. Criterion C18: an unchecked finish is visible on the starter's list.
 *
 * Every run of an agent this starter started, that said it was finished. Unreleased first, because
 * that is the half somebody has to do something about.
 */
export interface OnTheStartersList {
  run: string
  title: string
  agent: string | null
  stands: WhereARunStands
}

export function whatOneStarterHasNotChecked(
  starter: ParticipantRef,
  workspaceId: string,
): { list: OnTheStartersList[]; says: string } {
  const started = listParticipants().agents.filter((one) => one.startedBy?.kind === starter.kind && one.startedBy.id === starter.id)
  const theirs = new Set(started.flatMap((one) => [one.handle, one.id]))
  const list = runsThatSaidTheyAreFinished(workspaceId)
    .filter((one) => {
      const wrote = said(isObject(one.record.data) ? one.record.data['servingAgent'] : null)
      return wrote !== null && theirs.has(wrote)
    })
    .map((one) => ({
      run: one.record.id,
      title: one.record.title,
      agent: one.stands.agent,
      stands: one.stands,
    }))
  list.sort((a, b) => Number(b.stands.unreleasedFinish) - Number(a.stands.unreleasedFinish))
  const unreleased = list.filter((one) => one.stands.unreleasedFinish).length
  const says =
    theirs.size === 0
      ? `Nothing is registered as started by ${theNameAPersonReads(starter)}, so this list is empty because nobody has been started, not because everything was checked.`
      : unreleased === 0
        ? // A RUN IS LEFT OUT OF THE COUNT for one of three reasons, and the sentence names all three: it was
          // released; it was closed (confirmed, with or without a release, superseded, or ended with its
          // merge entry); or the office filed it for a secretary's design/-only entry, which needs no check.
          // The number counts agents and not names, since an agent's id and handle may be the same string.
          `No run of the ${String(started.length)} ${started.length === 1 ? 'agent' : 'agents'} ${theNameAPersonReads(starter)} started is waiting for a check: ` +
          'every one that said it was finished was released, closed or needs no check.'
        : `${String(unreleased)} run${unreleased === 1 ? '' : 's'} said the work was finished and nobody released ${unreleased === 1 ? 'it' : 'them'}. A subagent saying it is done does not end it.`
  return { list, says }
}

// ============================================================================ what it reads

/**
 * WHAT A RETIRE WOULD SETTLE BEHIND SOMEBODY'S BACK. Option A of proposal `Dbo6FNK86ohz` holds
 * here. While a check or a
 * report of a run is not yet concluded, retiring is refused, and the refusal says what is owed.
 *
 * ONE READING. Which runs belong to the agent is read through `theAgentOfARunForItsSeal` — the
 * same resolver the finish seal uses over the three names a run may write (the handle, the
 * registry id, the agent RECORD id) — and where each run stands is read through
 * `whereARunStands`, exactly what GET /api/checks answers per run, so the door and the checks
 * reading cannot disagree about whether something is still owed.
 *
 * WHAT IS OWED AND WHAT IS NOT. A run still owed is one standing `inspecting` (it said its work
 * was finished and nothing has released it), `rebuttal` (a check refused and the refusal stands),
 * or `reporting` (a released run whose report still waits for the starter's confirm). A run whose
 * check is `closed` — its supervisor confirmed the report — is over and owes nothing. A run closed
 * unchecked is an archive with its reason written, and owes nothing either. A run closed
 * as `superseded` is settled: a later run that was on the same branch, or that was checked and merged and holds this
 * run's commits, is where the work went, so it owes nothing either, and that is the single skip this function makes
 * for it. A run that never said it was finished and was never checked stands
 * `working` and owes nothing this door can name. An agent with no runs at all owes nothing.
 */

export interface AnOwedCheckOfAnAgent {
  /** The run whose check or report is not yet concluded. */
  run: string
  /**
   * Which check was asked, by the id of what carries it: the office's check runner session where
   * the office started one, otherwise the message whose delivery asks the check. Null when
   * nothing on the run records one, which the refusal says rather than guessing.
   */
  check: string | null
  /** Where the run stands: one of the three standings that are not settled. */
  standing: 'inspecting' | 'rebuttal' | 'reporting'
  /** The sentence that says who the run is waiting on — the inspector, the group, or the confirm. */
  waitingFor: string
}

/** The same unfinished obligation for the retire door and the unchecked closure door. */
function aStandingOwesACheck(standing: WhereARunStands['standing']): standing is AnOwedCheckOfAnAgent['standing'] {
  return standing === 'inspecting' || standing === 'rebuttal' || standing === 'reporting'
}

/**
 * EVERY RUN OF THIS AGENT A RETIRE WOULD END WITH A CHECK OR A REPORT STILL OWED, newest first.
 *
 * ACROSS EVERY PROJECT, because a durable agent's runs are filed wherever that run was working: a
 * supervisor retiring a worker asks this about the agent, not about one project of it, and a
 * refusal that read only the project the request stood in would let a run of the same agent in
 * another project end with its check still unanswered.
 */
export function whatRetiringWhileACheckIsOwed(agent: Pick<RegisteredAgent, 'id' | 'handle'>): AnOwedCheckOfAnAgent[] {
  const runs = listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'session' })
  /**
   * THE REGISTRY IS READ ONCE TO PLACE EVERY RUN, not once for each run. Nothing is written while
   * this reads, so every run is placed against the same list. It used to be read again for each run
   * that named an agent. On a copy of the office on 26 September 2026, with 4,094 session records
   * and 606 agent rows, one
   * retire read the registry 1,379 times: 835,674 agent rows and about 845,000 SQL statements, and
   * about 9.9 seconds on the office's one thread (problem QJV5hVBKPsUN).
   */
  let registry: readonly RegisteredAgent[] | null = null
  const rowOf = inTheRegistry(() => (registry ??= listParticipants().agents))
  const out: AnOwedCheckOfAnAgent[] = []
  for (const run of runs) {
    const who = theAgentOfARunForItsSealAmong(run, rowOf)
    if (who === null || (who.id !== agent.id && who.handle !== agent.handle)) continue
    const owed = theOwedCheckOfARun(run)
    if (owed !== null) out.push(owed)
  }
  return out
}

/** The retire door and the settlement reading ask this same question about one run. */
function theOwedCheckOfARun(run: PanelRecord): AnOwedCheckOfAnAgent | null {
  const stands = whereARunStands(run)
  const standing = stands.standing
  if (!aStandingOwesACheck(standing)) return null
  const check = theCheckAskedFor(run)
  return {
    run: run.id,
    check: said(check?.execution?.session) ?? said(check?.message),
    standing,
    waitingFor: stands.waitingFor ?? '',
  }
}

/**
 * THE REFUSAL SENTENCE. One sentence that names every run still owed, each with its run id, its
 * check id (or nothing, where the run records no check), its standing in the words a person reads,
 * and who it is waiting on: the inspector where a check is standing, the group where a refusal is
 * not settled, or the starter's confirm where a released report still waits.
 */
export function theRetireSentenceWhileACheckIsOwed(handle: string, owed: readonly AnOwedCheckOfAnAgent[]): string {
  const parts = owed.map((one) =>
    `run ${one.run}` +
    (one.check === null ? '' : ` (check ${one.check})`) +
    ` stands ${RUN_STANDING[one.standing].word.toLowerCase()}` +
    (one.waitingFor === '' ? '' : ` and ${one.waitingFor.replace(/^(Waiting|waiting) /, 'waits ')}`),
  )
  return (
    `Retiring "${handle}" is refused while a check or a report of its runs is still owed: ` +
    `${parts.join('; ')}. Settle that first; nothing can be closed on a run whose check or report has not ` +
    'finished. Nothing was written.'
  )
}

/** One file the worker changed, as the tool that found it hands it over. */
export interface FileChanged {
  /** The path, as the work area spells paths. */
  path: string
  /** What changed in it. A diff, or a sentence saying the file is new or gone. */
  changes: string
}

/**
 * WHICH COMMIT THE CHANGES WERE READ AGAINST, AND HOW THAT COMMIT WAS FOUND.
 *
 * The caller finds it, because finding it is git and nothing under src/ runs git. What the server
 * does is carry it into the prompt, so the one reader who can catch a wrong base can see which base
 * was used without being told to trust it.
 *
 * MEASURED. The first real check was assembled against a commit that is not an ancestor of the
 * branch it was checking, so eight files of other people's work were in the diff the inspector was
 * asked to hold the run to. The prompt said nothing about where the diff came from.
 */
export interface TheBaseUsed {
  /** The commit, as git resolved it. */
  ref: string
  /** `fork point` = worked out from the branch. `typed` = somebody said it with --against. */
  how: 'fork point' | 'typed'
  /** The whole of it in words, written by whoever found it. */
  says: string
}

/** What the prompt says about the base, including the two ways nobody said. */
function theBaseSays(base: TheBaseUsed | null | undefined, submission: WhatTheInspectorReads['submission'] = null, pinnedLinks?: ThePinnedLinks): string {
  if (submission?.seal.kind === 'records') {
    // A SEAL MADE BEFORE SEALS PINNED LINKS has no link evidence, and this does not send the check to look for it.
    if (pinnedLinks?.links === null) {
      return (
        'This submission contains records only. Check the sealed record revisions and dependencies above. ' +
        'This seal was made before seals pinned links, so it cannot show which links stood when the run finished. No Git base is required.'
      )
    }
    return 'This submission contains records only. Check the sealed record revisions, dependencies and link evidence above. No Git base is required.'
  }
  // A FILES SEAL HAS NO BASE, and that is not somebody failing to say one: its files were never in a
  // repository.
  if (submission?.seal.kind === 'files') {
    return (
      `This submission is a folder of files, sealed as ${submission.id}, which were never in a repository, so there is ` +
      "no Git base. Every file below was read from a copy the check's own tool made, hashing each file as it copied " +
      "it and comparing its sha256 and mode with the seal before you ran. A file shown as ADDED has nothing landed " +
      'at its path now. A file shown as MODIFIED replaces the file landed at its path, and its diff shows the text ' +
      'it replaces: judge that as well as what lands.'
    )
  }
  if (base === null || base === undefined) {
    return (
      'NOBODY SAID WHICH COMMIT THESE CHANGES WERE READ AGAINST. So nothing here can tell you whether they are ' +
      "this run's own work or everything that happened on the branch it was cut from as well. Weigh what is " +
      'below knowing that, and say so in your check if it matters.'
    )
  }
  return `WHAT THESE CHANGES WERE READ AGAINST. ${base.says}`
}

/** The changes, sorted into the ones inside the work area and the ones outside it. Criterion C25. */
export interface ChangesInTheWorkArea {
  workArea: string[] | null
  inside: FileChanged[]
  /** Paths that changed outside the area. Named, never included, never hidden. */
  outside: string[]
  /**
   * A SCOPED CHECK ONLY (`the-inspector.mjs --only`): the paths it judges, and every other changed
   * path, which keeps an earlier verdict and is named, not read. Absent on a check of the whole
   * submission. `inside` and `outside` above then hold only the paths in the scope.
   */
  only?: string[]
  carried?: string[]
  says: string
  /**
   * GIT WORK ONLY: which way the plugin rule went, worked out by `thePluginRuleOf`
   * from every changed path, scoped or not. When it leaves the change unread, every file in `inside` says
   * NOT_READ_BY_THE_PLUGIN_RULE in place of its diff, whatever the tool sent. Absent for a files seal, whose files land
   * in a files area and never in a repository's plugins folder.
   */
  plugin?: ThePluginRule
}

/**
 * WHAT A FILES SEAL IS SORTED BY: its root and the run's agent's files area, or null for any other seal, so the
 * check door and the prompt door hand changesInTheWorkArea the same pair (acceptance finding 52).
 */
export function theFilesAreaToSortBy(reads: Pick<WhatTheInspectorReads, 'submission' | 'filesArea'>): { root: string; area: FilesAreaFolder[] | null } | null {
  const files = reads.submission?.seal.kind === 'files' ? reads.submission.seal.files : null
  return files === null || files === undefined ? null : { root: files.root, area: reads.filesArea }
}

/**
 * THE CHANGES, THROUGH THE WORK AREA THE WORKER REGISTERED. Criterion C25.
 *
 * A worker registers its work area, such as folders and files, when it is registered and started.
 * That area is what locates the changes, and this is where that happens.
 *
 * A RUN WHOSE AGENT REGISTERED NO WORK AREA IS NOT A RUN WITH NOTHING TO CHECK. It is a run nobody
 * can check this way, and the sentence says exactly that rather than handing back an empty list.
 */
export function changesInTheWorkArea(
  area: readonly string[] | null,
  everyChange: readonly FileChanged[],
  /** The paths a scoped check judges, or null for a check of the whole submission. */
  only: readonly string[] | null = null,
  /**
   * For a files seal, its root and the agent's files area: then a file is inside when its real location lies in
   * the files area, not the work area (acceptance finding 52). Null for any other seal.
   */
  files: { root: string; area: FilesAreaFolder[] | null } | null = null,
): ChangesInTheWorkArea {
  const scope = theScopeOfACheck(everyChange, only)
  const changed = everyChange.filter((one) => insideTheScope(one.path, scope?.only ?? null))
  if (files !== null) {
    // A FOLDER THAT MOVED SINCE IT WAS REGISTERED REFUSES THE WHOLE ENTRY BY NAME, and its new target is never
    // followed (message 1bbshFyI-jfU).
    const [moved] = files.area === null ? [] : theFoldersThatMoved(files.area)
    if (moved !== undefined) {
      throw new PanelError(
        `The files area ${moved.written} resolved to ${moved.resolved} when it was registered and resolves to ${moved.now ?? 'nothing'} now, ` +
          'so no file of this files run can be read as inside it until somebody registers it again. Nothing was assembled.',
        409,
      )
    }
    const read = changed.map((one) => ({ one, inside: insideTheFilesArea(files.root, one.path, files.area).inside }))
    const inside = read.filter((each) => each.inside).map((each) => each.one)
    const outside = read.filter((each) => !each.inside).map((each) => each.one.path)
    const says =
      (scope === null ? '' : `${aScopeInOneSentence(scope.only, scope.carried)} `) +
      (files.area === null || files.area.length === 0
        ? `This agent has no files area, so every file of this files run is outside it and named but not read here: ${outside.join(', ')}. A files area is registered with POST /api/participants/agent/<handle>/files-area (acceptance finding 52).`
        : `${String(inside.length)} of ${String(changed.length)} files land inside the files area (${files.area.map((folder) => folder.resolved).join(', ')}), by their real locations.` +
          (outside.length === 0 ? '' : ` ${String(outside.length)} land outside it and ${outside.length === 1 ? 'is' : 'are'} named but not read here: ${outside.join(', ')}.`))
    return { workArea: area === null ? null : [...area], inside, outside, ...(scope === null ? {} : { only: scope.only, carried: scope.carried }), says }
  }
  const plugin = thePluginRuleOf(everyChange.map((one) => one.path))
  if (area === null) {
    return {
      workArea: null,
      inside: [],
      outside: changed.map((one) => one.path),
      ...(scope === null ? {} : { only: scope.only, carried: scope.carried }),
      plugin,
      says:
        (scope === null ? '' : `${aScopeInOneSentence(scope.only, scope.carried)} `) +
        'Nobody recorded a work area for the agent this run serves, so nothing here can say which changes are ' +
        'its own. This is a run nobody can check this way, not a run with nothing to check. A work area is the ' +
        'folders and files a registration carries, and `node tools/register-a-started-agent.mjs --area <path>` ' +
        'is where it is written.',
    }
  }
  const inside = changed
    .filter((one) => insideTheWorkArea(one.path, area))
    .map((one) => (plugin.read ? one : { path: one.path, changes: NOT_READ_BY_THE_PLUGIN_RULE }))
  const outside = changed.filter((one) => !insideTheWorkArea(one.path, area)).map((one) => one.path)
  const says =
    (scope === null ? '' : `${aScopeInOneSentence(scope.only, scope.carried)} `) +
    (area.length === 0
      ? 'This agent registered an empty work area, which is somebody saying there is none. Every change below is outside it.'
      : `${String(inside.length)} of ${String(changed.length)} ${scope === null ? 'changed' : 'judged'} file${changed.length === 1 ? '' : 's'} are inside the work area (${area.join(', ')}).` +
        (outside.length === 0
          ? ''
          : ` ${String(outside.length)} changed outside it and ${outside.length === 1 ? 'is' : 'are'} named but not read here: ${outside.join(', ')}.`))
  return { workArea: [...area], inside, outside, ...(scope === null ? {} : { only: scope.only, carried: scope.carried }), says, plugin }
}

/**
 * THE SCOPE OF A SCOPED CHECK, or null for a check of the whole submission. Sandbox v1 decision R2:
 * the verdict follows file content, so a check again judges only the files whose content changed.
 *
 * EVERY PATH IN THE SCOPE MUST BE ONE THIS SUBMISSION CHANGED. A scope naming anything else is a
 * caller that has lost track of what it is checking, and a check of it would judge nothing while
 * reading as a check of something. So it is refused, and nothing is assembled.
 */
function theScopeOfACheck(
  everyChange: readonly FileChanged[],
  only: readonly string[] | null,
): { only: string[]; carried: string[] } | null {
  if (only === null) return null
  const changedPaths = new Set(everyChange.map((one) => one.path))
  const unknown = only.filter((path) => !changedPaths.has(path))
  if (unknown.length > 0) {
    throw new PanelError(
      `This check was scoped to ${unknown.join(', ')}, which this submission did not change against its base ` +
        `(it changed ${String(changedPaths.size)} path${changedPaths.size === 1 ? '' : 's'}). A scoped check judges only ` +
        'paths the submission changed. Nothing was assembled and nothing was written.',
      422,
    )
  }
  return { only: [...only], carried: everyChange.filter((one) => !insideTheScope(one.path, only)).map((one) => one.path) }
}

/** A scoped check in one sentence, for the sorting the tool prints and the record a person reads. */
function aScopeInOneSentence(only: readonly string[], carried: readonly string[]): string {
  const n = carried.length
  return (
    `This is a scoped check of ${only.join(', ')}; ` +
    `${String(n)} other changed path${n === 1 ? ' keeps' : 's keep'} an earlier verdict and ${n === 1 ? 'is' : 'are'} not read.`
  )
}

/** One path a checker tool handed on, with the diff the tool read for it. */
export interface PathHandedOn extends PathThatNeedsJudgment {
  changes: string
}

/** The needs-judgment list as a check uses it: the paths it judges, and the paths dropped because the change does not touch them. */
export interface TheNeedsJudgmentList {
  used: PathHandedOn[]
  dropped: string[]
}

/**
 * THE PATHS A CHECKER TOOL COULD NOT DECIDE, checked against what this check judges. Sandbox v1
 * decision R4: a tool decides what it can with certainty and hands the rest to the inspector.
 *
 * Null means nobody handed a list, which is a different fact from an empty one. A PATH THE SUBMISSION
 * DID NOT CHANGE IS DROPPED FROM THE LIST, and the prompt and the run say so (wave 13j). A checker
 * tool's list can name a path of an earlier submission, and refusing it had cost a check an hour.
 * Only a list left with no path at all is refused, with that reason, because the check would be told
 * to judge handed-on paths and have none. A path a scoped check carries is still refused: it is in
 * the change, and dropping it would leave it judged by nobody.
 */
export function whatNeedsJudgment(
  changes: ChangesInTheWorkArea,
  list: readonly PathHandedOn[] | undefined,
): TheNeedsJudgmentList | null {
  if (list === undefined) return null
  const judged = new Set([...changes.inside.map((one) => one.path), ...changes.outside])
  const carried = new Set(changes.carried ?? [])
  const used: PathHandedOn[] = []
  const dropped: string[] = []
  for (const one of list) {
    if (judged.has(one.path)) used.push(one)
    else if (!carried.has(one.path)) dropped.push(one.path)
    else {
      throw new PanelError(
        `${one.path} is on the needs-judgment list, but this scoped check does not judge it: it keeps an earlier ` +
          'verdict. Put it in the scope with --only, or leave it off the list. Nothing was assembled and nothing was written.',
        422,
      )
    }
  }
  if (list.length > 0 && used.length === 0) {
    throw new PanelError(
      `Every path on the needs-judgment list is outside the sealed change, so the list is left with no path: ${dropped.join(', ')}. ` +
        'A path the sealed change does not touch is dropped from the list, and a list left with no path is refused, ' +
        'because the check would be told to judge handed-on paths and have none. Nothing was assembled and nothing was written.',
      422,
    )
  }
  return { used, dropped }
}

/** The one line a check's prompt carries for the paths dropped from its needs-judgment list (wave 13j). */
function theDroppedPathsLine(dropped: readonly string[]): string {
  return `dropped from the list, not in the sealed change: ${dropped.join(', ')}`
}

/** One precedent of a chapter: a problem record linked to it with `about`. Criteria C10 to C13. */
export interface PrecedentNamed {
  id: string
  title: string
  chapter: number
}

/** The precedents of one chapter of the office, at their titles. Section 6: a precedent is read at `title`. */
export function precedentsOfChapter(n: number): PrecedentNamed[] {
  const chapter = chapterNumbered(n)
  if (chapter === null) return []
  return resolveLinks(chapter.id)
    .filter((link) => link.type === 'about' && link.isBacklink && link.other.kind === 'problem' && !link.broken)
    .map((link) => ({ id: link.other.id, title: link.other.title, chapter: n }))
}

/** Everything the inspector is given about one run. Five things and no more. Section 7.3. */
export interface WhatTheInspectorReads {
  /** The seal, and `readFrom` when it was read from its sealed commit under a later one. */
  submission: AVerifiedSeal | null
  submissionStatus: 'sealed' | 'legacy-unsealed' | 'unsealed'

  run: PanelRecord
  stands: WhereARunStands
  agent: RegisteredAgent | null
  /** What Mole Office holds of the brief the subagent was given. */
  brief: {
    doing: string | null
    startedFor: PanelRecord | null
    sessionTasks: { record: PanelRecord; source: { sessionId: string; linkId: string; kind: 'explicit-about-link'; taskReading: 'current-record' } }[]
    says: string
  }
  /** The chapters the brief named, with what applies and where it came from. */
  chapters: ReturnType<typeof theChaptersLineFor>
  /** The sentence about that line, including the two ways nothing could be read. */
  chaptersSays: string | null
  /** The reports of the run, or its check-again entry's own run, with what each says it read. */
  reports: { record: Pick<PanelRecord, 'id' | 'kind' | 'title' | 'summary' | 'data'>; chaptersRead: number[] | null; says: string }[]
  /**
   * Whether those reports are the run's own: the ones its seal pinned, or, where the seal pins no records, the ones
   * linked `about` the run. For a check-again run, this describes its entry's run (reportOfMergeEntry).
   * False where none is linked and they are every report the agent wrote (acceptance finding 57).
   */
  reportsAreTheRuns: boolean
  /**
   * What those reports were read from: `seal`, the records the run's seal pinned and nothing else; `agent`, its agent's
   * reports with their links and filings; `nothing`, because the run names no agent and its seal pinned no records.
   * For a check-again run, this describes its entry's run.
   */
  reportsReadFrom: 'seal' | 'agent' | 'nothing'
  /**
   * For a check-again run, the entry and its own run whose reports the check and starter read, and the handle of that
   * run's agent, whose reports they are; `agent` is null because the run names no agent, so nobody knows whose to read.
   */
  reportOfMergeEntry: { entry: string; run: string; agent: string | null } | null
  /** Every record this run's agent wrote in this project, newest first. */
  wrote: { id: string; kind: string; title: string; when: string }[]
  decisions: ADecisionOfTheRun[]
  decisionsComplete: boolean
  /** The inside packages whose latest hand-back this run wrote and that no check has answered since, and the ones whose points could not be read. */
  packages: ThePackagesARunHandedBack
  readingOnly: boolean
  /** The work area the worker registered, or null because nobody recorded one. */
  workArea: string[] | null
  /**
   * For a files seal, the files area the run's agent has in this project, or null for any other seal or when it has
   * none (acceptance finding 52): where a files run may land, each folder as written and as resolved.
   */
  filesArea: FilesAreaFolder[] | null
  /** Where this run's work is on disk, and which branch it was cut from. Both may be nobody-said. */
  checkout: TheRunsCheckout
  /** The links the seal pinned, read now; absent because the seal has no records part, or there is no seal. */
  pinnedLinks?: ThePinnedLinks
}

/** A decision identified by its filing session or by its maker and filing time. */
export interface ADecisionOfTheRun {
  id: string
  kind: 'decision'
  title: string
  decided_by: unknown
  decided_on: unknown
  authority: unknown
  authority_reference: unknown
  because: unknown
  replaces: unknown
  /** What would reopen it and what it turned down, by which a check judges a reversible choice. */
  revisit_when: unknown
  alternatives_rejected: unknown
  filedAt: string | null
  foundBy: ('session' | 'handle and time')[]
}

export function theDecisionsOfTheRun(run: PanelRecord, workspaceId: string, agent: RegisteredAgent | null, end: string): {
  decisions: ADecisionOfTheRun[]; decisionsComplete: boolean
} {
  const data = isObject(run.data) ? run.data : {}
  const start = said(data['startedAt'])
  const startTime = start === null ? null : parseAnyStamp(start)
  const endTime = parseAnyStamp(end)
  let decisionsComplete = agent !== null && startTime !== null && endTime !== null
  const rows = sqlite.prepare(
    "SELECT r.id, v.at AS filed_at FROM records r LEFT JOIN revisions v ON v.record_id = r.id AND v.seq = 1 " +
    "WHERE r.workspace_id = ? AND r.kind = 'decision' AND r.deleted_at IS NULL ORDER BY r.id",
  ).all(workspaceId) as { id: string; filed_at: string | null }[]
  // EACH DECISION IS READ AS `getRecord` READS IT, in one statement for every 500, and the run's create rows in one. A
  // statement for each decision took 2,291 statements and about 16 ms of one check read, on the made-up office at the
  // size of 4 November 2026 with 1,145 decisions in the project (wave 13n round DM).
  const held = getRecordsWithIds(rows.map((row) => row.id))
  const filed = theRecordsFiledInTheRun(run.id)
  const decisions: ADecisionOfTheRun[] = []
  for (const row of rows) {
    const record = held.get(row.id) ?? null
    if (record === null) continue
    const fields = isObject(record.data) ? record.data : {}
    const session = filed.has(row.id)
    const filedAt = row.filed_at
    const time = filedAt === null ? null : parseAnyStamp(filedAt)
    if (agent !== null && fields['decided_by'] === agent.handle && time === null) decisionsComplete = false
    const byTime = agent !== null && fields['decided_by'] === agent.handle && startTime !== null && endTime !== null &&
      time !== null && time.getTime() >= startTime.getTime() && time.getTime() <= endTime.getTime()
    if (!session && !byTime) continue
    decisions.push({ id: record.id, kind: 'decision', title: record.title,
      decided_by: fields['decided_by'] ?? null, decided_on: fields['decided_on'] ?? null,
      authority: fields['authority'] ?? null, authority_reference: fields['authority_reference'] ?? null,
      because: fields['because'] ?? null, replaces: fields['replaces'] ?? null,
      revisit_when: fields['revisit_when'] ?? null, alternatives_rejected: fields['alternatives_rejected'] ?? null, filedAt,
      foundBy: [...(session ? ['session' as const] : []), ...(byTime ? ['handle and time' as const] : [])] })
  }
  return { decisions, decisionsComplete }
}

/** The prompt's word for a run that handed back no inside package that waits for a check. */
export const THE_RUN_HANDED_BACK_NO_PACKAGE = 'None: the run handed back no inside package that waits for a check.'
/** The prompt's words when the office could not read which packages the run handed back, which is not the same as none. */
export const THE_PACKAGES_COULD_NOT_BE_READ = 'The office could not read which inside packages the run handed back, so whether it handed back any is unknown.'
/** The prompt's words for a package the run handed back whose points the office could not read. */
export function aPackageWhosePointsCouldNotBeRead(one: { task: string; title: string }): string {
  return `- Package ${one.task}: ${one.title}. The office could not read its points, so they cannot be judged; say so in the check.`
}

/**
 * WHAT A CHECK OF HANDED-BACK PACKAGES LEAVES OUT of the prompt, each by the words that open it there: the brief, the run's
 * reports, what it wrote, its decisions, the list of faults to fix and the trace. Such a check judges each point and looks
 * for the four kinds of fault (`aCheckOfHandedBackPackages`), and none of these is needed for that.
 */
export const THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT = {
  brief: '## The brief',
  reports: '## What the run said it did',
  wrote: '## What it wrote',
  decisions: '## The run’s decisions',
  list: 'A fault of form in a record, and a test that copies a value the code defines, are never a refusal: put them in `listed`',
  trace: '## Trace each change to the person',
} as const
/** What a check of handed-back packages is for, said after the inspector's role. */
export const THE_ROLE_IN_A_CHECK_OF_PACKAGES =
  'THIS RUN HANDED BACK AN INSIDE PACKAGE, SO THIS CHECK ASKS TWO THINGS ONLY. Judge every point of each package the run ' +
  'handed back, and look in the change for the four kinds of fault a refusal is for. The brief, the run’s reports, what it ' +
  'wrote, its decisions and a trace of each path are not part of this check, so this prompt does not carry them.'
/** How a check of handed-back packages reads the change, said with the changes. */
export const HOW_A_CHECK_OF_PACKAGES_READS_THE_CHANGE =
  'Read the change for two things: whether it does what each point says, and whether it holds one of the four kinds of ' +
  'fault. You are not asked to trace it to the person.'
/** The shape of an item in `missing`, in every check. */
const A_MISSING_ITEM_IS_SHAPED =
  'Every item in `missing` must be an object with `what` and a `kind` from that list: {"what":"<what is missing>","kind":"<one of those four>"}. '
/** What a check of handed-back packages lists, said in place of the list's instructions. */
export const A_CHECK_OF_PACKAGES_LISTS_ONLY_ITS_POINTS =
  'THE LIST OF THINGS TO FIX HOLDS ONLY THE POINTS THAT DO NOT HOLD. The office writes it from your judgement of each point, ' +
  'so give no `listed`. A fault that is neither a point that does not hold nor one of the four kinds is not refused and not ' +
  'listed: an item in `missing` that names no kind, and anything you list, is left off the list, and the release names it so.'
/** The release's words in place of the trace's count, for a check of handed-back packages. */
export const A_CHECK_OF_PACKAGES_TRACES_NO_PATH =
  'This was a check of the inside packages the run handed back: it judged each point and looked for the four kinds of ' +
  'fault, and traced no path to the person.'

/**
 * THE INSIDE PACKAGES THE RUN HANDED BACK, as the prompt lists them for the inspector to judge point by point. A
 * reading made before packages were read carries none, and that is said as unknown, never as none.
 */
export function theInsidePackagesSection(packages: ThePackagesARunHandedBack | undefined): string {
  const readable = packages !== undefined && Array.isArray(packages.packages) && Array.isArray(packages.unread) ? packages : null
  const listing = readable === null ? THE_PACKAGES_COULD_NOT_BE_READ
    : readable.packages.length === 0 && readable.unread.length === 0 ? THE_RUN_HANDED_BACK_NO_PACKAGE
      : [
        ...readable.packages.map((one) => `- Package ${one.task}: ${one.title}\n` + one.points.map((point) =>
          `  - Point ${point.pointId}${point.says === null ? ' (its backlog item could not be read)' : `: ${point.says.replace(/\s+/g, ' ')}`}. ` +
          `Handed back as ${A_POINTS_STATE_IN_WORDS[point.outcome]}, with the words: ${point.words.replace(/\s+/g, ' ')}`).join('\n')),
        ...readable.unread.map(aPackageWhosePointsCouldNotBeRead),
      ].join('\n')
  return '## The inside packages the run handed back\n\n' + listing + '\n\n' +
    'For each package listed, judge every one of its points. Give judged as done, off_target, narrower, more_than_asked or unfinished. ' +
    'off_target means done but off target; narrower means less than asked; more_than_asked means unasked work or guards; unfinished means not finished. ' +
    'Give holds (true when what the hand-back says is true), why (what you read that shows it), and rulesKept (true when the run kept the office\'s rules). ' +
    'holds can be true for done, off_target or more_than_asked only when handed back as done; ' +
    'for narrower or unfinished, only when handed back as part or not. The office refuses a verdict that says otherwise. ' +
    'A point handed back as done that is not done does not hold, and nor does a point handed back as part or not with no real reason. ' +
    'A point that does not hold is listed under "To fix in the line\'s next round"; the office lists it from your judgement. ' +
    'Never refuse the run for a point unless the point is also one of the four kinds of fault a refusal is for: ' +
    `${THE_FOUR_KINDS.map((kind) => WHAT_A_KIND_IS[kind as keyof typeof WHAT_A_KIND_IS]).join('; ')}. ` +
    'Give one entry per listed package in packages, as {task, points: [{pointId, judged, holds, why, rulesKept}]}, naming every point exactly once. ' +
    'When none are listed, leave packages out.'
}

/** ONE LINK A RECORDS SEAL PINNED, AS THE CHECK READS IT NOW (round BM, item 2aq). Every one is counted present. */
export interface APinnedLink {
  id: string
  /** `as sealed`: its row hashes to what the seal recorded. `changed`: it does not. `no longer held`: the office has no such row. */
  standing: 'as sealed' | 'changed' | 'no longer held'
  /** Whether the seal marked it inferred. */
  inferredAtTheSeal: boolean
  /** The link as the office holds it now, never as it was sealed; null because the office no longer holds it. `createdByType` null: not recorded. */
  now: { type: string; from: string; to: string; createdAt: string; createdBy: string; createdByType: string | null; inferred: boolean } | null
}

/** The links a records seal pinned, with the sentence the prompt gives; `links` is null because the seal was made before seals pinned links. */
export interface ThePinnedLinks {
  links: APinnedLink[] | null
  says: string
}

/**
 * WHERE A RUN'S WORK IS, so the check does not have to be told twice.
 *
 * Both halves are what the run's own record says, and both are absent for most runs. Where no
 * cutFrom is recorded the branch is the repository's trunk, read through `inspectionTrunk`; a
 * caller with no repository to read falls back to its own checkout and `main`, and says so.
 */
export interface TheRunsCheckout {
  /** The whole path the run worked in, or null because nobody recorded one. */
  directory: string | null
  /** The branch the fork point is read against, or null because no branch could be read. */
  cutFrom: string | null
  says: string
}

/** What the run's record says about where its work is. */
function theRunsCheckout(run: PanelRecord): TheRunsCheckout {
  const data = isObject(run.data) ? run.data : {}
  const directory = said(data['workingDirectory'])
  const recorded = theBaseARunNames(data)
  const base = recordedCutFrom(directory, recorded)
  // THE BRANCH THE CHECK IS READ AGAINST: the run's own cutFrom where it names one, and the
  // repository's trunk where it does not. `base.branch` is null only when the trunk cannot be told
  // apart from another branch or a packed object is unreadable. `base.says` names the refusal.
  const cutFrom = base.branch
  const says =
    directory === null
      ? 'This run recorded no working directory, so a check has to be told which checkout to read with --checkout.' +
        (cutFrom === null ? '' : ` It was cut from ${cutFrom}.`)
      : `This run worked in ${directory}` +
        (cutFrom === null ? '.' : `, cut from ${cutFrom}, which is what the fork point is read against.`)
  const explains = recorded !== cutFrom || (recorded === null && directory !== null)
  return { directory, cutFrom, says: says + (explains ? ` ${base.says}` : '') }
}

/** The refusal for an id that names no run. The check doors answer a message the caller may not read with it too. */
export function noRunHasThisId(runId: string): PanelError {
  return new PanelError(`No run with id ${runId}. A run is a record of kind session.`, 404)
}

/** The run, or a refusal naming what was asked for. */
function theRun(runId: string, workspaceId: string): PanelRecord {
  const record = getRecord(runId)
  if (record === null || record.deletedAt !== null) throw noRunHasThisId(runId)
  if (record.kind !== 'session') {
    throw new PanelError(
      `Record ${runId} is a ${kindWord(record.kind).text}, not a run. A run is a record of kind session, which is what a ` +
        'started agent files for itself when it begins.',
      400,
    )
  }
  if (record.workspaceId !== workspaceId) {
    throw new PanelError(
      `Run ${runId} is in the ${record.workspaceId} project and this request is about ${workspaceId}. ` +
        'Send x-mole-office-workspace naming the project the run is in.',
      404,
    )
  }
  return record
}

/**
 * WHICH CHAPTERS A RUN'S AGENT MUST READ: the agent, its record, and the chapters line read off them. The check reads it,
 * and so does the reminder before the seal (lib/before-the-seal.ts), so the two cannot disagree (invariant 9).
 */
export function theChaptersARunsAgentMustRead(run: Pick<PanelRecord, 'data' | 'workspaceId'>) {
  const savedSelection = savedRoundChapters(run.data)
  const agent = theAgentOfARun(run)
  // THE CHAPTERS LINE IS ON THE AGENT RECORD, which is one record wherever it was filed, so this
  // does not narrow by project. `recordForAgentIn` answers a different question — which record in
  // THIS project — and using it here would read "the registration is in another project" as "the
  // starter named no chapters", which is two different facts wearing one sentence.
  const record = agent === null ? null : anyRecordOfAgent(agent.id)
  const named = record === null ? null : isObject(record.data) ? record.data[MUST_READ] : null
  return {
    agent,
    record,
    // READ AGAINST THE OFFICE'S CHAPTERS, the same in every project.
    chapters: theChaptersLineFor({ named, role: agent?.role ?? null, savedSelection }),
    // THE CARD'S LINE EVEN WHEN THE BRIEF NAMED CHAPTERS, for the reminder before the seal. The check is told "Chapters
    // that apply" from the brief alone, but it also reads the role, and it refused run IEJEGL65Pw4s (13q round 48, refusal
    // 7t7cCna1f9PI) for chapters a supervisor's card names that its brief did not.
    onItsCard: savedSelection === null ? theCardLineOf(agent?.role ?? null) : savedSelection.chapters.map(({ chapter, level }) => ({ chapter, level })),
  }
}

/** The submitted revisions, read once by the same pointers and hash checks for every report source. */
function theRecordsPinnedBy(submission: ReturnType<typeof readRunSeal>) {
  // THE SEALED REVISIONS, READ FROM THE REVISIONS TABLE BY THE POINTERS THE SEAL HOLDS. Criterion
  // C34: the seal names a revision id and its hash and copies nothing, so the content comes from the
  // row the pointer names. THE HASH IS CHECKED before the content is used — a revision whose row no
  // longer hashes to what the seal recorded is a different revision wearing the same id, and reading
  // it as the submitted one would hand the check work nobody submitted.
  // THE ROW IS HASHED IN THE COLUMNS REVISIONS HAD WHEN IT WAS SEALED, so a column added since does not turn an older
  // seal's pin false. ITS DATA IS READ WHOLE, so a revision that stores a value once is given it back.
  const read = revisionsReaderOf(sqlite)
  return submission?.seal.records?.records.map((one) => {
    const row = sqlite.prepare('SELECT * FROM revisions WHERE id = ?').get(one.after.id) as Record<string, unknown> | undefined
    if (!row) throw new PanelError(`Seal ${submission.id} names revision ${one.after.id} of record ${one.id}, and the revisions table has no such row.`, 409)
    if (theListARevisionRowHashesUnder(row, one.after.hash) === null) {
      throw new PanelError(`Revision ${one.after.id} of record ${one.id} does not hash to what seal ${submission.id} recorded. The submitted revision cannot be read.`, 409)
    }
    const data = wholeRevisionData(
      { recordId: String(row['record_id']), seq: Number(row['seq']), data: JSON.parse(String(row['data'])) as Record<string, unknown>, parts: row['parts'] },
      read,
    )
    return { id: one.id, kind: row['kind'] as PanelRecord['kind'], title: String(row['title']), summary: typeof row['summary'] === 'string' ? row['summary'] : null, data }
  })
}

/** What a check of a seal made before seals pinned links is told of them, whole. Never that there are none. */
const MADE_BEFORE_SEALS_PINNED_LINKS =
  'None of the links of this submission is shown, because this seal was made before seals pinned links. ' +
  'A link this check asks for cannot be read from the seal: name it as unread rather than guess what it was.'

/**
 * THE LINKS A RECORDS SEAL PINNED, read from the links table by the ids the seal holds (round BM, item 2aq).
 *
 * A link is pinned by its id and the hash of its row, and copied nowhere, so what the check can show is the link as
 * the office holds it now. A row that still hashes to the seal's hash is the link as it was sealed. A row that does not
 * is shown as it is now and says so; a link the office no longer holds is named as such. Both are counted present and
 * neither is refused: the seal shows they stood when the run finished, and what they said then cannot be read.
 */
function theLinksPinnedBy(submission: ReturnType<typeof readRunSeal>): ThePinnedLinks | undefined {
  const held = submission?.seal.records
  if (held === null || held === undefined) return undefined
  if (held.links === undefined) return { links: null, says: MADE_BEFORE_SEALS_PINNED_LINKS }
  const links = held.links.map((one): APinnedLink => {
    const row = aLinkRowAsTheSealHashesIt(one.id)
    if (row === undefined) return { id: one.id, standing: 'no longer held', inferredAtTheSeal: one.inferred, now: null }
    return {
      id: one.id,
      standing: theHashOfALinkRow(row) === one.hash ? 'as sealed' : 'changed',
      inferredAtTheSeal: one.inferred,
      now: {
        type: String(row['type']),
        from: String(row['from_id']),
        to: String(row['to_id']),
        createdAt: String(row['created_at']),
        createdBy: String(row['created_by']),
        createdByType: typeof row['created_by_type'] === 'string' ? row['created_by_type'] : null,
        inferred: row['inferred'] === 1,
      },
    }
  })
  return { links, says: whatThePinnedLinksSay(links) }
}

/** How many links the seal pinned and how each stands, in one sentence or three. */
function whatThePinnedLinksSay(links: readonly APinnedLink[]): string {
  if (links.length === 0) return 'The seal pinned no link: no link had a sealed record at either end when the run finished.'
  const counted = (standing: APinnedLink['standing']): string => String(links.filter((one) => one.standing === standing).length)
  const counts = `${counted('as sealed')} as sealed, ${counted('changed')} changed since the seal, ${counted('no longer held')} no longer held`
  if (links.length === 1) {
    return (
      'The seal pinned 1 link, by its id and the hash of its row: the one link that had a sealed record at either end when the run finished. ' +
      `It is counted present: ${counts}. The line below shows it as the office holds it now.`
    )
  }
  const n = String(links.length)
  return (
    `The seal pinned ${n} links, each by its id and the hash of its row: every link that had a sealed record at either end when the run finished. ` +
    `All ${n} are counted present: ${counts}. Each held one is shown below as the office holds it now.`
  )
}

/** Read a run's reports in seal/about order. Finding 57's fallback is for an ordinary run; a check again's entry run also reads the reports filed in it. */
function theReportsOfARun(
  run: PanelRecord,
  workspaceId: string,
  agent: RegisteredAgent | null,
  pinned: ReturnType<typeof theRecordsPinnedBy>,
  chapters: WhatTheInspectorReads['chapters'],
  forACheckAgain: boolean,
  stampsOf: TheStampsOf,
): Pick<WhatTheInspectorReads, 'reports' | 'reportsAreTheRuns' | 'reportsReadFrom'> {
  // A RUN'S OWN REPORTS, WHERE ITS SEAL PINNED NONE: a git seal pins no records, and every report its agent ever wrote
  // would give the check and the starter another run's report whenever the agent has two runs released at once, as on
  // 23 September (acceptance finding 57, _ORPypABcx7i). The reports linked `about` the run come first; where
  // none is linked, ordinary runs read the agent's reports as before, and tell the starter they are not the run's own.
  const linkedReports = new Set(
    resolveLinks(run.id)
      .filter((link) => link.type === 'about' && link.isBacklink && !link.inferred && link.other.kind === 'report')
      .map((link) => link.other.id),
  )
  // THE AGENT'S OWN REPORTS, AND THOSE OF THEM LINKED TO THE RUN, so the flag below is read off the list it describes:
  // a report linked to the run but written by somebody else is not the agent's, and never makes the flag say so (the
  // inspector's note on the follow-ups' release, acceptance finding 58).
  const stamps = pinned || agent === null ? [] : stampsOf(agent)
  // THE TEST `wroteIt` ASKS, ASKED OF EVERY REPORT IN THE ONE STATEMENT THAT LISTS THEM, so only the agent's reports are
  // read whole. Every report of the project read whole, then a statement for each, took 5,153 statements and about 167 ms
  // of one check read, on the made-up office at the size of 4 November 2026 with 5,149 reports (wave 13n round DM).
  const theirs = pinned || agent === null ? [] : listRecords({ workspaceId, kind: 'report', alsoWhere: aCreateRowOfTheAgent(sql`${records.id}`, stamps) })
  // A CHECK AGAIN ALSO READS THE REPORTS ITS ENTRY'S RUN FILED. Report Qj2_JbZpQMjU was filed in run AoIagWYdJBJH and
  // linked to it as `relates_to`. Its `about` link came 33 seconds after the check of merge entry XE5VI_6J-1gX released,
  // so the starter was told the run had no report (wave 13s round 26). The change log says which run filed a record.
  const filed = forACheckAgain ? theRecordsFiledInTheRun(run.id) : new Set<string>()
  const linkedAndTheirs = theirs.filter((one) => linkedReports.has(one.id) || filed.has(one.id))
  const reports = pinned ? pinned.filter((one) => one.kind === 'report').map((record) => {
    const read = whatAReportSaysItRead(record)
    return { record, chaptersRead: read, says: read === null ? NO_CHAPTERS_READ_SAID : chaptersReadAgainstTheBrief(read, chapters.mustRead).says }
  }) : (linkedAndTheirs.length > 0 ? linkedAndTheirs : forACheckAgain ? [] : theirs).map((one) => {
      const read = whatAReportSaysItRead(one)
      return {
        record: one,
        chaptersRead: read,
        says: read === null ? NO_CHAPTERS_READ_SAID : chaptersReadAgainstTheBrief(read, chapters.mustRead).says,
      }
    })

  return {
    reports,
    reportsAreTheRuns: Boolean(pinned) || linkedAndTheirs.length > 0,
    reportsReadFrom: pinned ? 'seal' : agent === null ? 'nothing' : 'agent',
  }
}

/**
 * HOW A CHECK'S READING READS A GIT SEAL. `theSealFromItsCommit` reads it from its sealed commit in the repository the
 * seal names, and never from the run's folder (`verifyRunSeal`'s `fromItsRepository`). The read just before a verdict
 * asks for it, and so does the verdict door, because the next round may have moved the folder on during the check.
 */
export type HowASealIsRead = {
  theSealFromItsCommit?: boolean
  /**
   * THE SEAL ALREADY READ ON THE SEAL-READ THREAD, by a check door that would otherwise hold the server while git read it
   * (the-seal-read-apart.ts). It is used where `verifyRunSeal` was called, with the same answer or the same refusal.
   */
  readApart?: ASealReadApart
}

/** The way `verifyRunSeal` reads a run's seal for a check's reading read this way. */
export function theWayASealIsVerified(read: HowASealIsRead): HowASealIsVerified {
  return read.theSealFromItsCommit === true ? { fromItsRepository: true } : { underALaterCommit: true }
}

/** Whether a check's reading reads this run's seal as it is, with no git: a superseded run's (why, in `whatTheInspectorReads`). */
function theSealIsReadAsItIs(run: PanelRecord): boolean {
  return theSupersededOn(run.data) !== null
}

/**
 * THE SEAL READ AHEAD ON THE SEAL-READ THREAD, for a door whose reading is `whatTheInspectorReads` alone (GET
 * /api/checks/:run), so the server answers other requests while git reads it (the-seal-read-apart.ts). The refusals that
 * come before the seal there come first here, in the same order, so a refused run starts no git. A seal read as it is
 * starts none either, so it is not read ahead. What comes back is handed to `whatTheInspectorReads`.
 */
export async function theSealReadAheadOf(runId: string, workspaceId: string, read: HowASealIsRead): Promise<HowASealIsRead> {
  const run = theRun(runId, workspaceId)
  refuseACheckOfCodeOnAnotherComputer(run)
  if (theSealIsReadAsItIs(run)) return read
  return { ...read, readApart: await theSealReadApart(runId, theWayASealIsVerified(read)) }
}

/** Everything the inspector reads about one run, in one read. */
export function whatTheInspectorReads(runId: string, workspaceId: string, read: HowASealIsRead = {}): WhatTheInspectorReads {
  const run = theRun(runId, workspaceId)
  refuseACheckOfCodeOnAnotherComputer(run)
  // A SUPERSEDED RUN'S TIP HAS MOVED, AND THAT IS WHY IT WAS SUPERSEDED. `verifyRunSeal` refuses
  // when HEAD is no longer the sealed commit, which is right for a run being checked and wrong for
  // one already closed: the reading is wanted so the run's standing can be read, and nothing is
  // judged from the seal. So a superseded run is read with `readRunSeal`, which checks the seal
  // against itself and does not re-read the tip. The seal and `verifyRunSeal` are unchanged; this is
  // the one place that chooses not to re-read the tip, and it chooses so for a closed run only.
  // A WORKER THAT COMMITTED AGAIN AFTER ITS SEAL still has its sealed commit under HEAD, and the reading is of that
  // commit (problem Qrcr9t4iT2Id); `readFrom` then says so. A HEAD that does not contain it is still refused.
  // THE READ JUST BEFORE A VERDICT, AND THE VERDICT DOOR, read the sealed commit itself, and the folder is not read at
  // all (`HowASealIsRead`).
  const submission = theSealIsReadAsItIs(run) ? readRunSeal(runId)
    : theSealReadApartOrHere(runId, theWayASealIsVerified(read), read.readApart)
  const data = isObject(run.data) ? run.data : {}
  const { agent, record, chapters } = theChaptersARunsAgentMustRead(run)
  const chaptersSays = savedRoundChapters(run.data) !== null ? chapters.says :
    agent === null
      ? 'This run does not say which agent it serves, so nothing can say which chapters its starter named.'
      : record === null
        ? `No agent record was found for ${agent.handle}, so nothing can say which chapters its starter named. That is nobody having looked, not a starter having named none.`
        : (chapters.says ?? null)

  const startedFor = agent?.startedFor === null || agent?.startedFor === undefined ? null : getRecord(agent.startedFor)
  const sessionTasks = resolveLinks(runId)
    .filter(link => link.type === 'about' && !link.isBacklink && !link.inferred && link.other.kind === 'task')
    .map(link => {
      const task = getRecord(link.other.id)
      if (!task || task.workspaceId !== workspaceId) throw new PanelError('A task explicitly linked to this session could not be read in its project.', 409)
      return { record: task, source: { sessionId: runId, linkId: link.linkId, kind: 'explicit-about-link' as const, taskReading: 'current-record' as const } }
    })
  const doing = said(data['doing'])
  const brief = {
    doing,
    startedFor,
    sessionTasks,
    says:
      'The registration task is the task named when this durable agent was started. It is not necessarily ' +
      'the task of this session. Every task explicitly linked from this session is listed separately, ' +
      'with its link and current record. These links do not select one task, grant permission or prove ' +
      'what the task said when the session began. The run’s doing line, registered work area and named chapters remain separate evidence.',
  }

  const pinned = theRecordsPinnedBy(submission)
  // Problem 18U9KvRM3DDj, see aTKkeulCgIVm: askForACheckAgain files no report of its own.
  // Read its merge entry and that entry's run through the office readers. Finding 57's agent-wide
  // fallback is for ordinary runs only; absence on the entry's run must stay absence.
  const checkAgainFor = theMergeEntryACheckAgainIsFor(run)
  const entry = checkAgainFor === null ? null : readMergeEntry(theCheckAgainsEntry(checkAgainFor, run.id, workspaceId))
  const reportRun = entry === null ? run : theRun(entry.run, workspaceId)
  // A check again reads the links its entry run's seal pinned, as it reads that run's reports.
  const pinnedLinks = entry === null ? theLinksPinnedBy(submission) : theLinksPinnedBy(readRunSeal(reportRun.id))
  const entrysAgent = entry === null ? null : theAgentOfARun(reportRun)
  const reportOfMergeEntry = entry === null ? null : { entry: entry.id, run: reportRun.id, agent: entrysAgent?.handle ?? null }
  const stampsOf = theStampsReadOnce(sqlite)
  const { reports, reportsAreTheRuns, reportsReadFrom } = theReportsOfARun(
    reportRun,
    workspaceId,
    entry === null ? agent : entrysAgent,
    entry === null ? pinned : theRecordsPinnedBy(readRunSeal(reportRun.id)),
    chapters,
    entry !== null,
    stampsOf,
  )

  const readingOnly = inspectorAnswersRun(run.id, workspaceId)
  return {
    run,
    stands: whereARunStands(run),
    agent,
    brief,
    chapters,
    chaptersSays,
    reports,
    reportsAreTheRuns,
    reportsReadFrom,
    reportOfMergeEntry,
    ...theDecisionsOfTheRun(run, workspaceId, agent, submission?.seal.sealedAt ?? nowStamp()),
    packages: thePackagesThisRunHandedBack(run.id, workspaceId, readingOnly),
    readingOnly,
    wrote: pinned ? pinned.map((one) => ({ id: one.id, kind: one.kind, title: one.title, when: submission!.seal.sealedAt })) : agent === null ? [] : everythingThisAgentWrote(agent, workspaceId, stampsOf(agent)),
    submission,
    submissionStatus: submission ? 'sealed' : isLegacyUnsealed(runId) ? 'legacy-unsealed' : 'unsealed',
    workArea: submission?.seal.area ?? agent?.workArea ?? null,
    filesArea: submission?.seal.kind === 'files' && agent !== null ? theFilesAreaOf(agent.id, workspaceId) : null,
    checkout: theRunsCheckout(run),
    ...(pinnedLinks === undefined ? {} : { pinnedLinks }),
  }
}

/** The agent record behind a registry row, in whichever project it was filed in. */
function anyRecordOfAgent(agentId: string): PanelRecord | null {
  const row = sqlite.prepare('SELECT record_id FROM agent_records WHERE agent_id = ? LIMIT 1').get(agentId) as
    | { record_id?: string }
    | undefined
  const id = row?.record_id
  return id === undefined ? null : getRecord(id)
}

/**
 * Did this agent file that record? Read from the change log, which carries the actor id, under each of the agent's
 * stamps. A caller asking about many records works the stamps out once and gives them. Exported for the honour
 * reading, which finds a run's report through the same change log (src/server/lib/honour.ts).
 */
export function wroteIt(agent: RegisteredAgent, recordId: string, stamps: readonly string[] = theStampsOfAnAgent(sqlite, agent)): boolean {
  return db.get<{ yes: number }>(sql`SELECT ${aCreateRowOfTheAgent(sql`${recordId}`, stamps)} AS yes`)?.yes === 1
}

/**
 * THE TEST THAT AN AGENT FILED A RECORD: a create row in the change log, written as an agent, under one of its stamps.
 * `wroteIt` asks it of one record, and `theReportsOfARun` of every report in the statement that lists them.
 */
function aCreateRowOfTheAgent(record: SQL, stamps: readonly string[]): SQL {
  // THE STAMPS ARE ASKED IN THE WORDS OF `isOneOfTheStamps`, as every reader of a stamp asks them, each `?` given its stamp.
  const words = isOneOfTheStamps('actor_id', stamps).split('?')
  const stamped = sql.join(words.map((piece, i) => (i === 0 ? sql.raw(piece) : sql`${stamps[i - 1]}${sql.raw(piece)}`)))
  return sql`EXISTS (SELECT 1 FROM changes WHERE record_id = ${record} AND op = 'create' AND actor_type = 'agent' AND ${stamped})`
}

/** The records made in this run. Read from the change log's create rows, which carry the run that made each. */
export function theRecordsFiledInTheRun(runId: string): Set<string> {
  const rows = sqlite.prepare("SELECT record_id FROM changes WHERE op = 'create' AND session_id = ?").all(runId) as { record_id: string }[]
  return new Set(rows.map((row) => row.record_id))
}

/** The most writings of the run's agent a check read lists: the newest, when the agent filed more. */
export const THE_MOST_WRITINGS_A_CHECK_LISTS = 200

/**
 * Every record this agent filed in this project, newest first. Read from the change log, and put in the order its create
 * rows were written in (`append_order`), not by `created_at`: those words repeat in the hour the clocks go back. Each
 * record here has a create row, as the join asks for one. It is asked under each of the agent's stamps, as given.
 */
function everythingThisAgentWrote(
  agent: RegisteredAgent,
  workspaceId: string,
  stamps: readonly string[],
): { id: string; kind: string; title: string; when: string }[] {
  return (
    sqlite
      .prepare(
        'SELECT r.id AS id, r.kind AS kind, r.title AS title, r.created_at AS created_at ' +
          // THE CROSS JOIN READS THE CHANGE LOG FIRST, and each create row's record by its id. Left to choose, SQLite read
          // every live record of the project and every message, and the change rows of each: about 156 ms of one check
          // read, against about 43 ms this way, for the same rows in the same order, on the made-up office at the size
          // of 4 November 2026 with 711,564 change rows (wave 13n round DM). The log is read through the index
          // `changes_agent_create_idx` (migration 0335), which holds only the create rows written as an agent, by
          // stamp. With no index that started with the actor, the read went through every row of the log: 5.1 to 8.7 s
          // on the live office on 12 November 2026. The terms on `op` and `actor_type` are the index's WHERE word for
          // word, or SQLite cannot use it.
          'FROM changes c CROSS JOIN records r ON c.record_id = r.id ' +
          // A MESSAGE IS KEPT IN THE MESSAGE CENTRE; it counts for the project its writing was filed in.
          "WHERE (r.workspace_id = ? OR (r.workspace_id = ? AND c.workspace_id = ?)) AND r.deleted_at IS NULL AND c.op = 'create' AND c.actor_type = 'agent' " +
          `AND ${isOneOfTheStamps('c.actor_id', stamps)} GROUP BY r.id ORDER BY MAX(c.append_order) DESC LIMIT ${String(THE_MOST_WRITINGS_A_CHECK_LISTS)}`,
      )
      .all(workspaceId, MESSAGE_CENTRE, workspaceId, ...stamps) as Record<string, unknown>[]
  ).map((row) => ({
    id: String(row['id']),
    kind: String(row['kind']),
    title: String(row['title']),
    when: String(row['created_at']),
  }))
}

/** An occurrence may be appended without rewriting any occurrence already recorded. */
function onlyAddedOccurrences(before: string | null, after: string | null): boolean {
  try {
    const was: unknown = before === null ? [] : JSON.parse(before)
    const now: unknown = after === null ? null : JSON.parse(after)
    return Array.isArray(was) && Array.isArray(now) && now.length >= was.length &&
      was.every((value, index) => JSON.stringify(value) === JSON.stringify(now[index]))
  } catch { return false }
}

/** A problem's links and appended occurrences are the inspector's findings, not a fix. */
function isAProblemFinding(change: { kind: string; op: string; field: string | null; old_value: string | null; new_value: string | null }): boolean {
  if (change.kind !== 'problem') return false
  if (change.op === 'link') return true
  if (change.op !== 'update') return false
  if (change.field === 'data.seen_in') return onlyAddedOccurrences(change.old_value, change.new_value)
  // A whole-object replacement is another supported spelling of the same append.
  if (change.field === 'data' && change.old_value !== null && change.new_value !== null) {
    try {
      const before: unknown = JSON.parse(change.old_value)
      const after: unknown = JSON.parse(change.new_value)
      if (!isObject(before) || !isObject(after)) return false
      const { seen_in: was, ...oldWork } = before
      const { seen_in: now, ...newWork } = after
      return JSON.stringify(oldWork) === JSON.stringify(newWork) &&
        onlyAddedOccurrences(was === undefined ? null : JSON.stringify(was), now === undefined ? null : JSON.stringify(now))
    } catch { return false }
  }
  // Notes are annotation records, authored by the inspector and linked to the problem. Their
  // creation never changes a worker-authored record; their links are handled above.
  return false
}

/**
 * WHICH CHANGE ROWS ARE AN ASSEMBLY OF A CHECK OF A RUN. A check begins when the office records what it would read
 * on the run (`rememberWhatTheCheckWouldRead`), under the check's own session. So these rows say two things: where
 * a check's window begins, and which sessions a check of the run was assembled in. One condition, read by both.
 * The first parameter is the run's id.
 */
const AN_ASSEMBLY_ON_THE_RUN =
  "record_id = ? AND actor_type = 'agent' AND actor_id = 'mole-office/the-api-server' " +
  "AND field LIKE 'data.whatTheCheckWouldRead%'"

/**
 * THE CHECK SESSIONS OF THIS RUN: the sessions that serve this inspector and in which a check of this run was
 * assembled. Problem SnD9A9nXHpT4. Such a session is the check's own record, and the inspector writes on it as it
 * works. It is never the checked run's work, whoever filed it. A secretary files the check session of its own run
 * itself, so it was counted as the run's work, and the check was refused for writing on its own session.
 *
 * It is read from what each record is: its kind, the agent it serves (`theAgentOfARun`), and the assemblies
 * recorded on the run. A session the inspector serves in which no check of this run was assembled is not one.
 */
function theCheckSessionsOfThisRun(run: PanelRecord, inspector: RegisteredAgent): Set<string> {
  const named = sqlite.prepare(`SELECT DISTINCT session_id AS session FROM changes WHERE ${AN_ASSEMBLY_ON_THE_RUN} AND session_id IS NOT NULL`)
    .all(run.id) as { session: string }[]
  const sessions = new Set<string>()
  for (const { session } of named) {
    const id = resolveSessionRef(session, run.workspaceId).recordId
    const record = id === null ? null : getRecord(id)
    if (record === null || record.kind !== 'session' || record.deletedAt) continue
    if (theAgentOfARun(record)?.id === inspector.id) sessions.add(record.id)
  }
  return sessions
}

/** The caller's registry row when it holds the inspector card, read from the registry and the role cards; otherwise null. */
export function theInspectorCardHeldBy(actor: Actor): RegisteredAgent | null {
  const me = participantForActor(actor)
  const registered = me?.kind === 'agent' ? (readParticipant(me) as RegisteredAgent | null) : null
  const card = theCardOffTheTree(theRoleCards())
  return registered !== null && card !== null && registered.role === card.name ? registered : null
}

/**
 * WHETHER THIS INSPECTOR, IN THIS SESSION, IS THE INSPECTOR OF A CHECK OF THE RUN, read from what the office stored when
 * the check was assembled: the assembly rows on the run (`AN_ASSEMBLY_ON_THE_RUN`), which name the check's own session,
 * through `theCheckSessionsOfThisRun`. The verdict door reads the same rows (`whatTheInspectorChanged`). The session is
 * the one the request names, held by the key as on every write. `no check recorded` means nothing stored names a check of
 * this run by this inspector, so nothing says who its inspector is.
 */
export function theInspectorOfTheRun(
  runId: string,
  workspaceId: string,
  inspector: RegisteredAgent,
  sessionId: string | null,
): 'its inspector' | 'another check' | 'no check recorded' {
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || run.workspaceId !== workspaceId) return 'no check recorded'
  const sessions = theCheckSessionsOfThisRun(run, inspector)
  if (sessions.size === 0) return 'no check recorded'
  const resolved = sessionId ? resolveSessionRef(sessionId, workspaceId).recordId : null
  return resolved !== null && sessions.has(resolved) ? 'its inspector' : 'another check'
}

/**
 * Read this check's assembly-to-verdict window, never this inspector's entire history.
 * The existing change ledger gives the order even when two writes share the same wall-clock
 * second. Assembly attribution carries the check session, so simultaneous checks do not borrow
 * each other's start. Files are photographed by the tool; this function reads authored records.
 *
 * A check session of this run is left out (`theCheckSessionsOfThisRun`): the inspector writes on it as it works.
 */
export function whatTheInspectorChanged(
  worker: RegisteredAgent,
  inspector: RegisteredAgent,
  run: PanelRecord,
  sessionId?: string | null,
): string[] {
  const resolved = sessionId ? resolveSessionRef(sessionId, run.workspaceId) : null
  const check = resolved === null ? null : (resolved.recordId ?? resolved.asked)
  const assembly = sqlite.prepare(
    `SELECT MAX(rowid) AS boundary FROM changes WHERE ${AN_ASSEMBLY_ON_THE_RUN} AND session_id IS ?`,
  ).get(run.id, check) as { boundary: number | null }
  if (assembly.boundary === null) {
    throw new PanelError(
      `No assembly is recorded for this check of run ${run.id}. Assemble the check before posting its verdict. Nothing was written.`,
      409,
    )
  }
  const end = (sqlite.prepare('SELECT MAX(rowid) AS boundary FROM changes').get() as { boundary: number }).boundary
  const stampsOf = theStampsReadOnce(sqlite)
  const workers = stampsOf(worker)
  const inspectors = stampsOf(inspector)
  const changed = sqlite.prepare(
    'SELECT DISTINCT r.id, r.kind, i.op, i.field, i.old_value, i.new_value ' +
    // THE CROSS JOIN READS THE WORKER'S CREATE ROWS FIRST, through `changes_agent_create_idx` (migration 0335), and the
    // record of each by its id. Left to choose, SQLite read them first for two stamps. For three or more, which is what
    // filing an old id for the worker makes, it read every record of the project and the change rows of each.
    "FROM changes w CROSS JOIN records r ON w.record_id = r.id AND w.op = 'create' AND w.actor_type = 'agent' " +
    `AND ${isOneOfTheStamps('w.actor_id', workers)} ` +
    "JOIN changes i ON i.record_id = r.id AND i.op <> 'create' AND i.actor_type = 'agent' " +
    `AND ${isOneOfTheStamps('i.actor_id', inspectors)} ` +
    'WHERE r.workspace_id = ? AND i.rowid > ? AND i.rowid <= ?',
  ).all(...workers, ...inspectors, run.workspaceId, assembly.boundary, end) as {
    id: string; kind: string; op: string; field: string | null; old_value: string | null; new_value: string | null
  }[]
  const checkSessions = theCheckSessionsOfThisRun(run, inspector)
  return [...new Set(changed.filter((change) => !isAProblemFinding(change) && !checkSessions.has(change.id)).map((change) => change.id))]
}

// ============================================================================ the prompt

/** The prompt an inspector's run is given, and what it is made of. */
export interface TheInspectorsPrompt {
  text: string
  bytes: number
  /** Every chapter, and the position it is written out at in this prompt. Criterion C23. */
  chaptersAt: { chapter: number; level: string; bytes: number }[]
  /** How many bytes the whole code of law would have been. The saving this design exists for. */
  wholeCodeBytes: number
  says: string
}

/** The whole code at `full`, in bytes. What the inspector did NOT load, so the saving can be said. */
function wholeCodeBytes(chapters: readonly OfficeChapterInBothLanguages[]): number {
  return chapters.reduce((total, one) => total + chapterAt(one, 'full').bytes, 0)
}

/**
 * WHAT A SCOPED CHECK IS TOLD. It says whose claim the carried verdict is, because this server has
 * not compared any content: whoever started the check named the scope, and the merge queue is what
 * compares each file's content with what the earlier check read.
 */
function aScopedCheckSays(only: readonly string[], carried: readonly string[]): string {
  return (
    'THIS IS A SCOPED CHECK. It was started with --only, which names the files of this submission whose ' +
    'content changed since an earlier check judged it. A verdict follows file content (sandbox v1 decision R2): ' +
    'a file whose content is what an earlier check read keeps that verdict, and only the changed files are ' +
    `judged again. Judge these ${String(only.length)} and nothing else: ${only.join(', ')}. ` +
    (carried.length === 0
      ? ''
      : `The other ${String(carried.length)} changed path${carried.length === 1 ? '' : 's'} keep${carried.length === 1 ? 's' : ''} the ` +
        `earlier verdict and ${carried.length === 1 ? 'is' : 'are'} named here, not read: ${carried.join(', ')}. `) +
    'Read the rest of the tree for context if you need it, but what you release or refuse, and anything you ' +
    'name as missing, is about the paths in the scope.'
  )
}

/**
 * THE PATHS A CHECKER TOOL HANDED ON, with why and what changed. Sandbox v1 decision R4. A path whose
 * diff is already written out in the changes section points there rather than being written twice.
 */
export function theNeedsJudgmentSection(list: readonly PathHandedOn[], changes: ChangesInTheWorkArea, aFilesSeal = false): string {
  const writtenAbove = new Set(changes.inside.map((one) => one.path))
  // A FILES SEAL'S LIST COMES FROM THE FILES CHECKER, and its paths are files that checker could not
  // decide — a type it has no reader for, a copy it could not compare with an original — not only
  // protected paths. And its release names each one with a line of the model's own, as A2 says: "named must mean
  // judged".
  if (aFilesSeal && list.length > 0) {
    return (
      '## Files the files checker handed to you\n\n' +
      'The files checker decided everything about these files it could decide with certainty, and handed these ' +
      `${String(list.length)} on because deciding ${list.length === 1 ? 'it' : 'them'} needs judgment: each says why. ` +
      'Read each one below and decide whether it should land as it is. Then give your decision on each, one line ' +
      'per path, in `judged` in your answer: {"path": "<the path>", "concluded": "<what you decided about it and ' +
      'why>"}. A release that leaves a path on this list without its line is refused at the door, and the queue ' +
      'lands a handed-on file only on a release that names it with a line. If one should not land, refuse and name ' +
      'it in `missing`.\n\n' +
      list
        .map(
          (one) =>
            `### ${one.path}\n\nWhy the checker could not decide it: ${one.why}\n\n` +
            (writtenAbove.has(one.path) ? `Its change is written out above, under ### ${one.path}.` : one.changes),
        )
        .join('\n\n')
    )
  }
  if (list.length === 0) {
    return (
      '## Paths a checker tool handed to you\n\n' +
      'A checker tool looked at this submission and handed on no path that needs judgment: it decided every ' +
      'protected path it found by itself.'
    )
  }
  return (
    '## Paths a checker tool handed to you\n\n' +
    'A checker tool decided everything about this submission it could decide with certainty, and handed these ' +
    `${String(list.length)} path${list.length === 1 ? '' : 's'} on because deciding ${list.length === 1 ? 'it' : 'them'} ` +
    'needs judgment. Each is a path this submission changed that the tool could not verify by itself, and its reason ' +
    'says what is to be decided. For a protected path, decide whether the brief or a criterion asked for it. If it ' +
    'did, say so in your check, naming the path and what asked for it. If nothing did, refuse and name the path in ' +
    '`missing`. ' +
    // A FILE ITS SUPERVISOR RESOLVED BY HAND asks another question (round B of tier 2, part 6): the merge queue hands
    // one on for every such file, with each place set out in its reason (`whatTheCheckIsAskedOfAResolvedFile`).
    'For a file whose conflict its supervisor resolved by hand, decide whether the resolution keeps what both sides ' +
    'meant. If it does not, refuse and name the path and the place in `missing`. Read each change below, even where ' +
    'it is outside the work area. Do not release without saying in your check what you decided for every path on ' +
    'this list.\n\n' +
    list
      .map(
        (one) =>
          `### ${one.path}\n\n${WHY_THE_TOOL_COULD_NOT_DECIDE_IT} ${one.why}\n\n` +
          (writtenAbove.has(one.path) ? `Its change is written out above, under ### ${one.path}.` : one.changes),
      )
      .join('\n\n')
  )
}

/**
 * ONE RECORD THE CHECK'S TOOL WROTE WHOLE INTO A FILE FOR ITS MODEL (problem YxzFRQIpx9Pz, 29 September 2026). The model
 * runs with no key and no office address, so since wave 13n's key rules it cannot read the office at all; the tool,
 * which holds the office's key for its verdict, reads the records the check needs and writes them where the model can
 * open them, and the prompt says where.
 */
export interface ARecordWrittenForTheModel {
  /** Where the model opens the file. */
  path: string
  id: string
  kind: string
  title: string
  /** Why the tool wrote it. */
  as: (typeof WHY_THE_TOOL_WANTED_IT)[number]
}

/**
 * WHY THE CHECK'S TOOL WANTED A RECORD FOR ITS MODEL: the one list the prompt door's two schemas and the prompt's words
 * take (problem WBddfI3C1RQy, where the door spelled it twice). `named-record` is a record of any kind that a report or a kept judgment reason
 * names, such as a decision or an earlier check, which the tool carries too since problem ZTS6soSziHJ-.
 */
export const WHY_THE_TOOL_WANTED_IT = ['report', 'named-report', 'named-record', 'started-for', 'session-task', 'last-message', 'decision'] as const

/**
 * ONE RECORD THE CHECK'S TOOL MEANT TO HAND ITS MODEL AND COULD NOT, with why (problems iVfuq3VBSnih and 7vaMy2NYnNQc).
 * The prompt names it, so the model can tell a record it was not given from one that was never filed.
 */
export interface ARecordTheToolCouldNotCarry {
  id: string
  as: ARecordWrittenForTheModel['as']
  why: string
}

/** What the prompt calls each written record. */
const WHAT_A_WRITTEN_RECORD_IS: Record<ARecordWrittenForTheModel['as'], string> = {
  report: "a report this run's agent filed",
  'named-report': "a report that one of this run's reports names by its id",
  'named-record': "a record that one of this run's reports names by its id, such as a decision or an earlier check",
  'started-for': 'the record this run was started for',
  'session-task': "a task of this run's session",
  'last-message': "the newest message of this run's agent that this check may read",
  decision: "a decision of this run",
}

/**
 * ONE RECORD'S ID AS A STANDALONE TOKEN. The boundary is the one the check's tool reads ids with
 * (A_WORD_THAT_MAY_BE_AN_ID in tools/the-inspector.mjs), so a longer word that holds the id is not the id. Only
 * a kept why's own words are read, never a path, a diff or the tool's file names (uQMufaAoVuVs); a why
 * that writes a path holding the id still names the id when the id stands alone in it, as the tool would read it.
 */
function theIdAsAWholeWord(id: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`)
}

/** Every string a value holds, however deep, as the tool reads a record's own words (theTextsIn in tools/the-inspector.mjs). */
function everyStringIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(everyStringIn)
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(everyStringIn)
  return []
}

/**
 * WHICH KEPT WHYS NAME A RECORD BY ITS ID (uQMufaAoVuVs): the paths of the paths this check judges whose why
 * holds the id as a whole word, in the list's order. A dropped path's why never appears: the assembler is handed only
 * the paths the server keeps.
 */
function theKeptWhysThatName(id: string, kept: readonly PathHandedOn[]): string[] {
  if (id === '' || kept.length === 0) return []
  const whole = theIdAsAWholeWord(id)
  return kept.filter((one) => whole.test(one.why)).map((one) => one.path)
}

/** WHETHER ONE OF THE RUN'S REPORTS NAMES A RECORD BY ITS ID: its title, its summary or the strings of its data. */
function oneOfTheReportsNames(id: string, reports: WhatTheInspectorReads['reports']): boolean {
  if (id === '') return false
  const whole = theIdAsAWholeWord(id)
  return reports.some((one) => everyStringIn([one.record.title, one.record.summary, one.record.data]).some((text) => whole.test(text)))
}

/**
 * THE KEPT WHYS THAT NAME A RECORD, as one clause. The relative clause — "a record that the why for X names by its
 * id" — has the record as its own object and must not say "it" again; the independent clause — ", and the why for X
 * names it by its id" — needs the object. `withItsObject` says which.
 */
function theKeptWhysThatNameARecord(whyPaths: readonly string[], withItsObject: boolean): string {
  const it = withItsObject ? ' it' : ''
  return whyPaths.length === 1
    ? `the why for ${whyPaths[0]} names${it} by its id`
    : `the whys for ${whyPaths.join(', ')} name${it} by its id`
}

/**
 * WHAT THE PROMPT CALLS ONE RECORD A CHECK'S TOOL CARRIED OR COULD NOT CARRY, with each kept why that names it (see
 * uQMufaAoVuVs). A record only a kept why names is never said to come from a report; a record a report names keeps that
 * wording, and every kept why that names it is said beside the wording.
 */
function whatThePromptCallsARecord(
  one: { id: string; as: ARecordWrittenForTheModel['as'] },
  aReportNames: boolean,
  whyPaths: readonly string[],
  aDecisionNames: boolean,
): string {
  if ((one.as === 'named-report' || one.as === 'named-record') && aDecisionNames && !aReportNames && whyPaths.length === 0) {
    return 'a record that a decision of this run names by its id'
  }
  if ((one.as === 'named-report' || one.as === 'named-record') && whyPaths.length > 0 && !aReportNames) {
    const noun = one.as === 'named-report' ? 'a report' : 'a record'
    const tail = one.as === 'named-record' ? ', such as a decision or an earlier check' : ''
    return `${noun} that ${theKeptWhysThatNameARecord(whyPaths, false)}${tail}`
  }
  const base = WHAT_A_WRITTEN_RECORD_IS[one.as]
  return whyPaths.length === 0 ? base : `${base}, and ${theKeptWhysThatNameARecord(whyPaths, true)}`
}

/**
 * ASSEMBLE THE PROMPT AN INSPECTOR'S RUN IS GIVEN. Criteria C23 and C25.
 *
 * Every shared chapter is here at its name and what it governs — positions 1 and 2.
 * Only the chapters the brief named are written out further, at the position that brief
 * named. Nothing else is loaded at `full`: an agent first learns the rest in outline, because loading
 * all of it into context would waste too much.
 */
/**
 * THE PATHS A CHECK JUDGES, worked out in one place for the two that need them: the prompt, which lists them so the
 * inspector traces each one, and the release door, which refuses a release that traces any of them to nothing, as
 * item 6, step 3 and chapter 7 rule 5 say. On 3 October 2026 the prompt said only
 * "every changed path this check judges"; the
 * inspector traced a round's source files and none of its 18 test files, and the door refused the release (see
 * equQKUk4-QyL).
 *
 * A scoped check judges its scope. A sealed run's check judges every path its seal names. An unsealed run's check judges
 * the changes its assembly kept, inside and outside the work area, and the paths a checker tool handed on.
 */
export function thePathsACheckJudges(input: {
  only: readonly string[] | undefined
  submission: WhatTheInspectorReads['submission'] | undefined
  inside: readonly string[]
  outside: readonly string[]
  handedOn: readonly string[]
}): string[] {
  const { only, submission } = input
  return [...new Set(only ?? (
    submission === null || submission === undefined
      ? [...input.inside, ...input.outside, ...input.handedOn]
      : [...(submission.seal.git?.files ?? []), ...(submission.seal.files?.files ?? [])].map((one) => one.path)
  ))]
}

/** One pinned link as the prompt shows it: as the office holds it now, or as no longer held. */
function aPinnedLinkInThePrompt(one: APinnedLink): string {
  if (one.now === null) return `- ${one.id}: pinned at the seal; the office no longer holds it. The seal marked it ${one.inferredAtTheSeal ? 'inferred' : 'not inferred'}.`
  const { type, from, to, createdAt, createdBy, createdByType, inferred } = one.now
  const held = `- ${one.id}: ${type} from ${from} to ${to}, created ${createdAt} by ${createdBy} (${createdByType ?? 'whose type nobody recorded'}), ${inferred ? 'inferred' : 'not inferred'}.`
  if (one.standing !== 'changed') return held
  return `${held} CHANGED: its row no longer hashes to what the seal recorded, so this is the link as the office holds it now, not as it was sealed.`
}

/** The prompt's part for the links a records seal pinned, and the rule for a link the check was not handed. */
function thePinnedLinksPart(pinned: ThePinnedLinks, file: string | undefined): string {
  const heading = '## The links of this submission'
  if (pinned.links === null) return `${heading}\n\n${pinned.says}`
  return [
    `${heading}\n\n${pinned.says}`,
    ...(pinned.links.length === 0 ? [] : [pinned.links.map(aPinnedLinkInThePrompt).join('\n')]),
    'A link this check asks for must be among the links above. A link that is not among them was not sealed, so it is no evidence of this submission.',
    ...(file === undefined ? [] : [`The tool that started you wrote these links, as the office's reading gave them to it, into a file you can read: ${file}.`]),
  ].join('\n\n')
}

export function assembleTheInspectorsPrompt(input: {
  reads: WhatTheInspectorReads
  changes: ChangesInTheWorkArea
  /** Which commit the changes were read against, and how that commit was found. */
  base?: TheBaseUsed | null
  /** The protected paths a checker tool handed on, or null because nobody handed a list. */
  needsJudgment?: readonly PathHandedOn[] | null
  /** The paths dropped from that list because the change does not touch them. Absent or empty: none was dropped. */
  needsJudgmentDropped?: readonly string[]
  /** The records the check's tool wrote into files for its model, or null because it named none. */
  carries?: readonly ARecordWrittenForTheModel[] | null
  /** The records the check's tool meant to write and could not, or null because it named none. */
  couldNotCarry?: readonly ARecordTheToolCouldNotCarry[] | null
  /** The file the check's tool wrote the reading of the pinned links into, for its model; absent because it named none. */
  pinnedLinksFile?: string
  workspaceId: string
}): TheInspectorsPrompt {
  const { reads, changes } = input
  const ofPackages = aCheckOfHandedBackPackages(reads.packages)
  // THE OFFICE'S CHAPTERS, read once for the whole prompt.
  const saved = savedRoundChapters(reads.run.data)
  const chapters = saved === null ? theChapters() : []
  const chaptersAt: { chapter: number; level: string; bytes: number }[] = []
  const parts: string[] = []
  if (reads.submissionStatus === 'legacy-unsealed') parts.push('This is an unsealed legacy tip. Read the fork point as before; the verdict must say unsealed. No seal or lease was invented for its historical finish.')
  if (reads.submission) parts.push('Submitted content, sealed at finish. Judge these revisions; later record edits are not this submission.\n' + JSON.stringify(reads.submission))
  // THE LINKS THE SEAL PINNED, beside the revisions it pinned (round BM, item 2aq). Nothing for a seal with no records part.
  if (reads.pinnedLinks !== undefined) parts.push(thePinnedLinksPart(reads.pinnedLinks, input.pinnedLinksFile))

  parts.push(
    'YOU ARE AN INSPECTOR. You check whether a started agent followed the rules, and you write the message ' +
      'that lets it finish. You make no change to the work and you start nobody. Where you find a break you file a problem ' +
      'and link it to the chapter with `about`; you do not fix it. An inspector that fixes what it found is no ' +
      'longer checking it.',
  )
  if (ofPackages) parts.push(THE_ROLE_IN_A_CHECK_OF_PACKAGES)

  if (saved === null) parts.push(
    '## The office regulations, shared chapters by name\n\n' +
      // ON THE LADDER, IN ITS OWN WORDS (acceptance finding 72): a chapter read only here is at a rung the chapters line
      // can name, and not at a word like "name" that it cannot read.
      `This is what you hold of each shared chapter: its name and what it governs, ${aChapterAtItsNameOnTheLadder().rungs}. ` +
      'Open one further only when the brief named it; the chapters the brief named are written out below.\n\n' +
      everyChapterAtItsName(chapters).text,
  )

  parts.push(
    `## The run you are checking\n\n` +
      `Run ${reads.run.id}: ${reads.run.title}\n` +
      `Agent: ${theNameOfAnAgentOr(reads.agent, 'nobody recorded which agent this run serves')}` +
      `${reads.agent === null ? '' : ` (role ${reads.agent.role ?? 'none set'})`}\n` +
      `Where it stands: ${reads.stands.says}`,
  )

  if (!ofPackages) parts.push(
    `${THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT.brief}\n\n${reads.brief.says}\n\n` +
      `What it is doing: ${reads.brief.doing ?? 'the run wrote no line saying what it is doing.'}\n` +
      `The durable agent was registered for: ${reads.brief.startedFor === null ? 'nothing recorded.' : `${reads.brief.startedFor.id} — ${reads.brief.startedFor.title}`}\n` +
      `Tasks explicitly linked from this session: ${reads.brief.sessionTasks.length === 0 ? 'none recorded.' : '\n' + reads.brief.sessionTasks.map(task => JSON.stringify(task)).join('\n')}\n` +
      `Chapters its starter named: ${reads.chaptersSays ?? chaptersLineInWords(reads.chapters.named ?? [], [])}\n` +
      `Chapters that apply, from ${reads.chapters.from}: ${reads.chapters.mustRead.map((one) => `${String(one.chapter)} at ${one.level}`).join(', ')}`,
  )

  if (saved !== null) {
    chaptersAt.push(...saved.chapters.map(({ chapter, level, bytes }) => ({ chapter, level, bytes })))
    parts.push('## The saved round reading\n\n' +
      'Judge rule compliance only against this exact saved list and text. The role card, current office chapters, ' +
      'precedents and current files cannot add obligations. Report only CODE chapters actually read, at or below the saved level. ' +
      'The existing non-rule checks and invariants still apply.\n\n' +
      roundChaptersText(saved))
    parts.push('## The original task brief, unchanged\n\n' + saved.brief.text)
  } else {
    const chapterParts: string[] = ['## The chapters the brief named, at the level it named']
    for (const one of reads.chapters.mustRead) {
      const chapter = chapters.find((held) => held.n === one.chapter)
      if (chapter === undefined) continue
      const written = chapterAt(chapter, one.level)
      chaptersAt.push({ chapter: one.chapter, level: one.level, bytes: written.bytes })
      const precedents = precedentsOfChapter(one.chapter)
      chapterParts.push(
        written.text +
          '\n\n' +
          (precedents.length === 0
            ? '*No precedent is linked to this chapter.*'
            : `*Precedents of this chapter, at their titles:*\n${precedents.map((p) => `- ${p.id} — ${p.title}`).join('\n')}`),
      )
    }
    // EVERY CHAPTER NOT NAMED IS NAMED AS NOT LOADED, so the inspector knows the absence is a rule and
    // not an oversight. Criterion C23 is measured on the bytes; this is what makes the absence honest.
    const notNamed = chaptersInTheStandingLoad(chapters).map((one) => one.n).filter((n) => !reads.chapters.mustRead.some((one) => one.chapter === n))
    chapterParts.push(
      notNamed.length === 0
        ? '*Every shared chapter is written out above at the level the brief named.*'
        : `*Chapters ${notNamed.join(', ')} are held above at their name and what they govern, at \`${aChapterAtItsNameOnTheLadder().readAt}\`, and no further. The ` +
            'brief did not name them. If the work turns out to touch one, say so in your answer rather than ' +
            'assuming it: reading the whole code into every check is what this design exists to stop.*',
    )
    parts.push(chapterParts.join('\n\n'))
  }

  if (!ofPackages) parts.push(
    `${THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT.reports}\n\n` +
      (reads.reports.length === 0
        ? 'This run filed no report record in this project. That is a check with nothing to read, not a check that passed.'
        : reads.reports
            .map((one) => `${one.record.id} — ${one.record.title}\n${one.says}\n${one.record.summary ?? ''}`)
            .join('\n\n')),
  )

  if (!ofPackages) parts.push(
    `${THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT.wrote}\n\n` +
      (reads.wrote.length === 0
        ? 'Nothing in this project was filed by this agent.'
        : reads.wrote.map((one) => `- ${one.id} ${kindWord(one.kind).text}: ${one.title} (${one.when})`).join('\n')),
  )

  const listedDecisions = Array.isArray(reads.decisions) ? reads.decisions : null
  if (!ofPackages) parts.push(`${THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT.decisions}\n\n` +
    (listedDecisions === null ? "The office did not list the run's decisions; whether it recorded any is unknown." :
      listedDecisions.length === 0 ? (reads.decisionsComplete ? 'The run recorded no decisions. There are no decisions to approve.' : 'The office found no session-filed decisions, but the handle and time route is unknown.') :
      listedDecisions.map((one) => `- ${one.id}: ${one.title.replace(/\s+/g, ' ')}; decided on ${String(one.decided_on ?? 'not recorded')}; filed at ${one.filedAt ?? 'unknown'}; found by ${one.foundBy.join(' and ')}.`).join('\n') + (reads.decisionsComplete ? '' : '\nThe handle and time route is unknown.')) +
    '\n\nFor each decision handed to you, judge whether it holds, what it rests on, and whether its authority fits. ' +
    'An agent may record an owner decision only when the owner made it and a durable record supports it; an agent cannot decide an owner-only matter. ' +
    `An agent may claim these authorities for its own decisions: ${AGENT_AUTHORITIES.join(', ')}. ` +
    `What each authority requires: ${Object.entries(DECISION_AUTHORITY_NEEDS).map(([authority, need]) => `${authority}: ${need}`).join('; ')}. ` +
    'Check the reason against the evidence available to you and say when that evidence cannot be read. ' +
    'A decision that does not hold is a finding: refuse the release and explain it in missing with a rule in says. ' +
    'Give one line per decision in decisions: id, holds, restsOn, authorityFits and authorityWhy. ' +
    'Do not claim general approval when none were listed, a list is missing, or a decision could not be carried. ' +
    'If a listed decision could not be handed to you, name it as unread and refuse the release.')

  parts.push(theInsidePackagesSection(reads.packages))

  parts.push(
    `## The changes, through the work area it registered\n\n${theBaseSays(input.base, reads.submission, reads.pinnedLinks)}\n\n` +
      (ofPackages ? `${HOW_A_CHECK_OF_PACKAGES_READS_THE_CHANGE}\n\n` : '') +
      (changes.only === undefined ? '' : `${aScopedCheckSays(changes.only, changes.carried ?? [])}\n\n`) +
      `${changes.says}\n\n` +
      // THE PLUGIN RULE IS SAID ONLY FOR A PLUGIN-ONLY CHANGE, the one kind it can leave unread.
      (changes.plugin === undefined || changes.plugin.plugin === null
        ? ''
        : `THE PLUGIN RULE. ${changes.plugin.says}` +
          (changes.plugin.read ? '' : " Each file below says so in place of its diff. That is the rule, not a gap in this check.") +
          '\n\n') +
      (changes.inside.length === 0
        ? 'No changed file was handed over inside the work area.'
        : changes.inside.map((one) => `### ${one.path}\n\n${one.changes}`).join('\n\n')),
  )

  if (input.needsJudgment != null) {
    const dropped = input.needsJudgmentDropped ?? []
    parts.push(
      theNeedsJudgmentSection(input.needsJudgment, changes, reads.submission?.seal.kind === 'files') +
        (dropped.length === 0 ? '' : `\n\n${theDroppedPathsLine(dropped)}`),
    )
  }

  // Chapter 7 rule 5. Quote the office's chapter record, never a second copy of its words, and ask this in every
  // check, including a scoped one. AN OFFICE MAY HOLD NO SUCH RULE, since its owner may change its chapters: the
  // section then says which is missing and still asks for the trace, rather than failing the check with an error.
  const traceRule = saved !== null ? null : theRuleWithTheId(RULES_THE_CODE_NAMES[2].chapter, RULES_THE_CODE_NAMES[2].rule)
  const judged = thePathsACheckJudges({
    only: changes.only,
    submission: reads.submission,
    inside: changes.inside.map((one) => one.path),
    outside: changes.outside,
    handedOn: (input.needsJudgment ?? []).map((one) => one.path),
  })
  if (!ofPackages) parts.push(
    `${THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT.trace}\n\n` +
      (saved !== null ? 'Trace is an existing check invariant; no additional CODE text is loaded. ' : traceRule === null
        ? `${theAbsenceOfARule(RULES_THE_CODE_NAMES[2].chapter, RULES_THE_CODE_NAMES[2].rule)}, so no rule is quoted here. `
        : `Chapter 7 rule ${String(traceRule.number)}: ${traceRule.name}\n\n> ${traceRule.text}\n\n`) +
      'For every changed path this check judges, trace the change to an explicit word of the person or an ' +
      'engineering choice the person left to the agents. In a scoped check, trace every path in the scope. ' +
      (judged.length === 0
        ? ''
        : `This check judges ${judged.length === 1 ? 'one path' : `${String(judged.length)} paths`}, and each needs a line in ` +
          '`traced`: a test file as much as the code it tests, since a test traces to the record the code it tests ' +
          `traces to.\n\n${judged.map((path) => `- ${path}`).join('\n')}\n\n`) +
      'Give the trace as a list in `traced` in your answer: ' +
      `{"traced":[{"paths":["<changed path>","…"],"to":"<record id>","how":${JSON.stringify(TRACED_HOW[0])},` +
      '"said":"<a few words of what that record says that covers these paths>"}]}. ' +
      `Use \`how\` ${TRACED_HOW.map((how) => JSON.stringify(how)).join(' or ')}. ` +
      'One line may cover several paths that trace to the same record. Read the record and judge whether its words ' +
      'cover these changes. A changed path tracing to neither is refused: name the path in `missing`, with ' +
      (saved === null ? '`says` {"chapter":7}. ' : 'Cite a delivered CODE chapter or an applicable invariant. ') +
      'The door requires a line for every judged path on a release and checks that each ' +
      '`to` names a record in the office; you judge whether that record says enough.',
  )

  const written = input.carries ?? []
  const notWritten = input.couldNotCarry ?? []
  // WHAT EACH RECORD IS, WITH THE KEPT WHYS THAT NAME IT (uQMufaAoVuVs). Derived here from what the assembler
  // already holds: the whys this check judges, and the run's own reports' words. No record that only the check's tool's
  // files name, and no form field, is a source.
  const theKeptWhys = input.needsJudgment ?? []
  const called = (one: { id: string; as: ARecordWrittenForTheModel['as'] }): string =>
    whatThePromptCallsARecord(one, oneOfTheReportsNames(one.id, reads.reports), theKeptWhysThatName(one.id, theKeptWhys),
      (reads.decisions ?? []).some((decision) => everyStringIn([decision.authority_reference, decision.because, decision.replaces]).some((value) => theIdAsAWholeWord(one.id).test(value))))
  parts.push(
    '## Reading a record this prompt does not carry\n\n' +
      (reads.readingOnly
        ? 'You are given no office address and no key, on purpose. So ask the office '
        : 'You are given no office address and no key, on purpose. A check runs the tree\'s own tests, and those tests ' +
          'must not reach the live office by accident (acceptance finding 44, 23 September 2026). So ask the office ') +
      'nothing: a request from here carries no key, and the office refuses it. ' +
      'Your verdict goes back through the tool that started you.\n\n' +
      (written.length === 0
        ? 'The tool that started you wrote no record into a file for you, so what this prompt carries is all you can read.'
        : 'The tool that started you read these records with its own key, as the office held them when this check ' +
          'started, and wrote each one whole, as JSON, into a file you can read:\n\n' +
          // ONE LINE EACH, a title's own line breaks included, so no title can add a line to the list.
          written.map((one) => `- ${one.path}: ${called(one)}, ${kindWord(one.kind).text} ${one.id}, "${one.title.replace(/\s+/g, ' ')}"`).join('\n')) +
      (notWritten.length === 0
        ? ''
        : '\n\nThe tool meant to hand you these and could not, so no file holds them. The tool names each one here, ' +
          'so do not take any of them for a record that was never filed:\n\n' +
          notWritten.map((one) => `- ${one.id}: ${called(one)}; ${one.why}`).join('\n')) +
      '\n\nA record in neither this prompt nor one of these files is one this check cannot read. Say so in your ' +
      'answer, with its id, rather than guess what it holds.',
  )

  parts.push(
    '## What to answer, and what not to do\n\n' +
      (reads.readingOnly
        ? 'Read the change without modifying any file or running tests, mutations or a build. '
        : 'You may make temporary edits only in your own throwaway check checkout to verify tests and source mutations. ' +
          'Restore every change before giving a verdict. If no own throwaway checkout was supplied, make no file changes. ') +
      'Do not fix the submitted work, commit, push, start another agent, file or change a record, or post anything to Mole Office. ' +
      "Do not edit the run's own worktree, the main checkout, office data, carried record files or other instance files. " +
      "These are role instructions. Sandboxed checks use a private check view: carried inputs and other checks' evidence are read-only or absent. Explicit --on-the-host checks use the harness's host restrictions. " +
      'An inspector that fixes what it found is no longer checking it, and the tool that started you looks at the checkout before and after: ' +
      'a check whose inspector left the work changed is thrown away rather than posted. Where you find a break that ' +
      'wants a record, say so in your answer and let somebody who is not checking file it.\n\n' +
      'THIS RUN ENDS THE MOMENT YOU STOP WRITING. There is no next turn: nothing you start in the background ' +
      'ever comes back to you. Run every command in the foreground and wait for it to end. ' +
      'An answer that says the check is still running, or that you will resume when something finishes, is a ' +
      'check thrown away, and the run it was for waits on nothing. Measured on 8 September 2026: two checks of ' +
      'one run ended that way, and neither wrote a verdict.\n\n' +
      // THE CHECK'S OWN VERIFICATION, 18 October 2026. The id stays in this comment, and not
      // in the prompt string: the prompt ships in the bundle, which carries no decision of the owner's
      // (scripts/no-owner-content.mjs).
      (reads.readingOnly
        ? 'READ THE CHANGE YOURSELF. Read the diff path by path against every package point and the rules. ' +
          'Judge every point and look for the four kinds of fault by reading. Say in the verdict what you read and that you ran nothing.\n\n'
        : "DO ONLY THE CHECK'S OWN VERIFICATION. Do not run the build, the typecheck, the whole suite or lists of test files. " +
          'The merge queue runs them all.\n\n' +
          'READ AND TEST THE CHANGE YOURSELF. Read the diff path by path against the recorded decisions and the rules. ' +
          'Check every claim in the report against the code. For each test this run added or changed, break the code it guards once or twice. ' +
          'Run only that test file, see it turn red, and restore the code. In a scoped check, do this only for the paths in its scope.\n\n' +
          'THE TREE HAS NOT BEEN BUILT. A test that needs dist/ needs `npm run build` first; run that command yourself in your sandbox. ' +
          'tests/source-api.test.ts is the known test that needs it.\n\n' +
          'A RELEASE THAT RESTS ON THE REPORT ALONE IS NOT A CHECK. Say in the verdict what you read and which mutations you ran, with what each showed.\n\n') +
      // THE FOUR KINDS AND THE FAULTS OF FORM, in the check's own instructions.
      // A sentence in a needs-judgment list did not outweigh the regulations; this paragraph is part of the rules the prompt hands the model.
      `A REFUSAL IS ONLY FOR ONE OF FOUR KINDS OF FAULT: ${THE_FOUR_KINDS.map((kind, at) => `(${String(at + 1)}) ${kind} — ${WHAT_A_KIND_IS[kind as keyof typeof WHAT_A_KIND_IS]}`).join('; ')}. ` +
      // A CHECK OF HANDED-BACK PACKAGES IS ASKED FOR NO LIST: the office writes its list from the points that do not hold.
      (ofPackages
        ? A_MISSING_ITEM_IS_SHAPED + A_CHECK_OF_PACKAGES_LISTS_ONLY_ITS_POINTS + '\n\n'
        : 'Everything else in code, proof or design is listed for the line, not refused. ' + A_MISSING_ITEM_IS_SHAPED +
          'An item that names no kind is not a refusal; the tool moves it to the list. ' +
          `${THE_PARTS_A_CHECK_OF_PACKAGES_LEAVES_OUT.list} with ` +
          '{"what":"<the fault>","where":"after-landing"}, and a fault in code or proof with "where":"next-round". ' +
          'The faults of form in records are a missing short form, an incomplete chaptersRead, a decision without revisit_when, a count in a report that disagrees with its table, a missing link, and a yes named without its record id. ' +
          'A release that lists something carries the list into its check sentence for the line, so the list is not lost by releasing.\n\n') +
      'MAKE THE LAST THING YOU PRINT ONE JSON OBJECT AND NOTHING ELSE, on one line. The tool that started you ' +
      'posts it, once, as one act. That is what makes the release and the message to the starter happen ' +
      'together.\n\n' +
      (saved === null ? '    {"verdict":"released","check":"<what you checked and what you found>","chaptersRead":[{"chapter":5,"level":"digest"}]}\n\n' :
        '    ' + JSON.stringify({ verdict: 'released', check: '<what you checked and what you found>', chaptersRead: saved.chapters.slice(0, 1).map(({ chapter, level }) => ({ chapter, level })) }) + '\n\n') +
      (reads.submission?.seal.kind === 'files' && (input.needsJudgment?.length ?? 0) > 0
        ? 'with, because the files checker handed you files to judge, one line for each of them:\n\n' +
          '    "judged":[{"path":"<a path from that list>","concluded":"<what you decided about it and why>"}]\n\n'
        : '') +
      'or, where something is missing,\n\n' +
      '    {"verdict":"refused","check":"<what you checked>","missing":[{"what":"<what is missing>","kind":"<one of the four kinds>"}],' +
      (saved === null ? '"says":{"chapter":5},"chaptersRead":[…]}\n\n' : '"says":{"invariant":<the invariant that applies>},"chaptersRead":[…]}\n\n') +
      // WHAT `says` TAKES IS SAID FROM THE ONE LIST THE DOOR'S SHAPE IS HELD TO, src/config/verdict-keys.mjs (decision
      // OTB8vrTnnvhL, acceptance finding 69): an inspector that cited an invariant, which this sentence did not offer,
      // had its refusal refused at the door and lost.
      // UNDER SAVED ROUND CHAPTERS `says` IS OFFERED ONLY WHAT THE DOOR'S RULE TAKES there (round BL, item 2ao): a check that
      // cited a precedent the round did not give it had its verdict refused at the door.
      `A refusal names what is missing and what says so, in "says": ${saved === null ? whatSaysTakes() : whatSaysTakesUnderSavedChapters()}. ` +
      `The door reads no other key there. ${saved === null ? '' : `${NO_DECISION_WAS_GIVEN} `}` +
      'The run does not end; it goes back to work, and a group opens holding it, its supervisor and you. Your ' +
      'check goes to the worker only. The starter is told that a check happened and is never sent the check.',
  )

  const text = parts.join('\n\n---\n\n')
  const bytes = Buffer.byteLength(text, 'utf8')
  const whole = saved === null ? wholeCodeBytes(chapters) : saved.sources[0]!.sourceBytes
  return {
    text,
    bytes,
    chaptersAt,
    wholeCodeBytes: whole,
    says: saved !== null ? `${String(bytes)} bytes. Saved round manifest version 1; ${chaptersAt.length} delivered CODE chapters at their recorded levels. Whole source CODE: ${whole} bytes.` :
      `${String(bytes)} bytes. Every chapter is here at its name and what it governs; ` +
      `${chaptersAt.length === 0 ? 'no chapter' : `chapter${chaptersAt.length === 1 ? '' : 's'} ${chaptersAt.map((one) => String(one.chapter)).join(', ')}`} ` +
      `written out further because the brief named ${chaptersAt.length === 1 ? 'it' : 'them'}. The whole code at ` +
      `full would be ${String(whole)} bytes.`,
  }
}

// ============================================================================ the one act

/** What an inspector answered with. */
export interface TheCheck {
  verdict: Verdict
  /** What was checked and what was found. It goes to the worker and to nobody else. */
  check: string
  /** A refusal: what is missing. */
  missing: string[]
  /** A refusal: which chapter, precedent or invariant says so. */
  says: WhatSaysSo | null
  /** Which worktree and which tip the check read. Criterion C30. Null because it did not say. */
  read: WhatWasRead | null
  /**
   * WHAT THE MODEL'S RUN WROTE INTO THE OFFICE, or absent because the tool could not count it.
   * Acceptance finding 44, 23 September 2026: a check's model ran the tree's browser tests, the app
   * read the live office's address out of the model's environment, and 65 records were filed into the
   * live office. The tool asks GET /api/records/created-between for the window the model ran in and
   * names here what it wrote. Absent is an honest answer and not zero: zero is recorded as a count of
   * zero with no ids.
   */
  wroteIntoTheOffice?: WroteIntoTheOffice
  /** Which chapters the inspector read, and at what level. */
  chaptersRead: ChapterNamed[]
  /**
   * THE WORDS OF THE CHAPTERS LINE THAT COULD NOT BE READ, kept as text with why. Problem
   * `y_HP9aIa0Bd6`: a finished check was thrown away over one word. The verdict is recorded anyway,
   * and this says which part of the chapters line it rests on no evidence for. Absent or empty means
   * every chapters word the check sent was read.
   */
  chaptersReadUnreadable?: { said: string; because: string }[]
  /** One line of the model's own per path it was handed to judge. See `Release.judged`. */
  judged?: { path: string; concluded: string }[]
  traced?: TracedChange[]
  /** The faults the check listed instead of refusing, in the two places they are fixed. See `Release.listed`. */
  listed?: ListedFaults
}

/** What the one act wrote. */
export interface TheCheckWritten {
  verdict: Verdict
  /** The message to the worker. It carries the check. */
  toTheWorker: string
  /**
   * The message to the starter. It carries the result and one line, and never the check. EMPTY ON A REFUSAL until
   * `theStarterHearsTheRefusal` has run, because a bounce of the same verdict may be the one that tells the starter.
   */
  toTheStarter: string
  /**
   * A refusal's line for its starter, NOT YET WRITTEN, or null on a release and where no starter is told. The check
   * door hands it to `theStarterHearsTheRefusal` after the merge queue has heard the verdict.
   */
  refusalForTheStarter: { to: ParticipantRef; title: string; body: string } | null
  /** Who the starter's message went to, or null because the chain named nobody. */
  starter: ParticipantRef | null
  /**
   * The group a refusal opened, or null because none was: on a release, and on a refusal of the
   * merge queue's check again, which opens none (decision yH7W1sXTRY5q, Q4). Criterion C26.
   */
  group: string | null
  /** The release written on the run, or null on a refusal. */
  released: Release | null
  /** The refusal written on the run, or null on a release. Criterion C29. */
  refused: Refusal | null
  /**
   * What the office did about the run's next round once it was released (lib/next-round-at-the-seal.ts), or why that
   * could not be kept. Absent on a refusal, and while the gate 'next-round-at-the-release' is off.
   */
  nextRoundAtTheRelease?: NextRoundAtTheSeal | { notKept: string }
  stands: WhereARunStands
  says: string
}

/** The one line the starter is told about the result. It is the run's own words, never the check. */
function theResultForTheStarter(reads: WhatTheInspectorReads): string {
  // 18U9KvRM3DDj / aTKkeulCgIVm: name the entry's report source, including when it has no report.
  const entry = reads.reportOfMergeEntry
  // ONLY WHAT WAS LOOKED AT: a run whose seal pinned records has only its seal read; a run naming no agent has nobody's
  // reports read for it; and a report by somebody else linked to the run is not looked at, so the line speaks of the
  // run's agent's reports and of nothing wider (checks 7W5vPJyw686I and QbN8K1qeQrnV, accepted in
  // QQsjW8_5nOzy and 2VTzr7GTqNXh). Only `about` links are read, so the line says "linked about", not "linked": a
  // report linked `relates_to` is not looked at (check Yf80xrwatx1C, accepted in BCRZ_3n0esKd).
  if (entry !== null && reads.reports.length === 0) {
    if (reads.reportsReadFrom === 'seal') {
      return `Merge entry ${entry.entry}'s run ${entry.run} names no report in its seal. Only the seal was read, so a report linked to the run but not named in its seal was not looked for.`
    }
    return entry.agent === null
      ? `It is not known whether merge entry ${entry.entry}'s run ${entry.run} has a report: the run names no agent, so nobody can tell whose reports to look for.`
      : `Merge entry ${entry.entry}'s run ${entry.run} has no report by its agent ${entry.agent}: none of that agent's reports is linked about it, and none was filed in it.`
  }
  // ONLY A REPORT LINKED ABOUT THIS RUN IS NAMED. When none is, the agent's newest report may be another run's
  // (finding 57), and naming it here asked the starter to confirm the wrong report (problem of 10 November 2026:
  // the release notice for run dlXf1MadWlgd carried another run's report). The absence is said instead.
  if (reads.reports.length > 0 && (entry !== null || reads.reportsAreTheRuns)) {
    const newest = reads.reports[0]!
    const whose = entry !== null
      ? `\n\nThis is the report of merge entry ${entry.entry}'s run ${entry.run}.`
      : ''
    return `${newest.record.title}${newest.record.summary === null ? '' : `\n\n${newest.record.summary}`}${whose}`
  }
  if (reads.reports.length > 0) {
    return 'The run filed no report linked about it, so there is no report to name.'
  }
  const doing = reads.brief.doing
  if (doing !== null) return doing
  if (reads.reportsReadFrom === 'seal') return "The run's seal names no report, and the run wrote no line saying what it did."
  return 'The run filed no report and wrote no line saying what it did.'
}

/** A check-again's entry is an assumption, so a reader's refusal must name the entry it could not read. */
export function theCheckAgainsEntry(entryId: string, runId: string, workspaceId: string): PanelRecord {
  let record: PanelRecord
  try {
    record = theMergeEntry(entryId, workspaceId)
  } catch (cause) {
    throw new Error(`Run ${runId} is the merge queue's check again, and its merge entry ${entryId} could not be read.`, { cause })
  }
  if (record.deletedAt !== null) {
    throw new Error(`Run ${runId} is the merge queue's check again, and its merge entry ${entryId} has been deleted.`)
  }
  return record
}

/**
 * THE MERGE ENTRY A CHECK-AGAIN RUN WAS FILED FOR, or null because this run is not one.
 *
 * Read off the run's stored `extra.purpose`, which `askForACheckAgain` in merge-state-machine.ts
 * writes as 'reinspection' with `extra.mergeEntry` beside it. That is the one place such a run is
 * made, so a run with the purpose and no entry is a broken assumption, and it is said as one.
 */
export function theMergeEntryACheckAgainIsFor(run: Pick<PanelRecord, 'id' | 'data'>): string | null {
  const extra = isObject(run.data['extra']) ? run.data['extra'] : {}
  if (extra['purpose'] !== 'reinspection') return null
  const entry = said(extra['mergeEntry'])
  if (entry === null) throw new Error(`Run ${run.id} is the merge queue's check again and names no merge entry in extra.mergeEntry.`)
  return entry
}

/**
 * THE LINE'S SUPERVISOR FOR A RELEASE: the live agent among the run's worker and its starter that does not hold a
 * worker's card. A worker's release belongs to its starter's line; a supervisor's own round belongs to that supervisor.
 * Null when neither is a live agent that could read the task.
 */
function theLinesSupervisor(worker: ParticipantRef, starter: ParticipantRef | null): ParticipantRef | null {
  for (const who of [worker, ...(starter === null ? [] : [starter])]) {
    if (who.kind !== 'agent') continue
    const row = readParticipant(who)
    if (row === null || !('retired' in row) || row.retired === true) continue
    if (theCardOfAgent(row.id) === THE_WORKER) continue
    return { kind: 'agent', id: row.id }
  }
  return null
}

/**
 * THE LISTED FAULTS BECOME THE LINE'S WORK. The release carries them in its check sentence, which the worker reads
 * once; this files one task for the line, so the next round reads them first and closes the task when they are patched.
 * Its holder is the line's supervisor, and it is linked about the released run so it can be found from the run.
 * Nothing is filed when the check listed nothing, which is the ordinary case.
 */
function fileTheListedFaultsForTheLine(
  input: { runId: string; workspaceId: string; check: TheCheck; actor: Actor },
  reads: WhatTheInspectorReads,
  worker: ParticipantRef,
  starter: ParticipantRef | null,
): void {
  const listed = input.check.listed
  if (listed === undefined || listed.nextRound.length + listed.afterLanding.length === 0) return
  const holder = theLinesSupervisor(worker, starter)
  const task = createRecord({
    workspaceId: input.workspaceId,
    kind: 'task',
    title: `Patch the faults listed at the release of ${reads.run.title}`,
    summary:
      `The release of run ${input.runId} listed these faults. The line's next round reads this task first and closes it ` +
      `when they are patched.\n\n${theListedFaultsSay(listed.nextRound, listed.afterLanding)}`,
    data: {
      state: 'todo',
      whose_move: 'agent',
      ...(holder === null ? {} : { holder }),
      source: `The release of run ${input.runId}`,
    },
    actor: input.actor,
  })
  createLink({ fromId: task.id, toId: input.runId, type: 'about', actor: input.actor })
}

/**
 * THE ONE ACT: RELEASE OR REFUSE. Criteria C19, C20, C21, C22 and C26.
 *
 * It writes two messages, and on a refusal it opens a group as well, except on a refusal of the merge
 * queue's check again, which opens none (decision yH7W1sXTRY5q, Q4). It is one act because the design
 * makes it one act: the check runs, and when nothing is wrong one message both ends the subagent
 * and hands its result to the main agent. And a build that could write one of the two would be a build where a subagent is
 * released and its starter never hears, or the other way round.
 */
export function releaseOrRefuse(input: {
  runId: string
  workspaceId: string
  /** Who is writing it. */
  by: ParticipantRef
  /** Which of the two ways of section 7.2 this is. */
  how: WhoChecked
  /**
   * The inspector's registry row, when this is an inspector's check. Null when a starter is
   * releasing its own agent, where the C22 rule does not apply: a starter that changed the work is
   * doing its own job, and an inspector that changed it has stopped doing its own.
   */
  inspector: RegisteredAgent | null
  check: TheCheck
  actor: Actor
  /**
   * A STANDARD CHANGE, released by the standard-change rule with no inspector's reading (wave 13r round F). Only the
   * standard door passes it, after it found the declared kind matches the files and the kind's own checks passed. The
   * release then carries no trace lines and no chapters line, because no model read the change, and says so.
   */
  standard?: AStandardRelease
  /** The verdict door passes it, so the seal is read from its sealed commit and not from the run's folder (`HowASealIsRead`). */
  theSealFromItsCommit?: boolean
  /** The seal the verdict door already read on the seal-read thread (`HowASealIsRead`). */
  readApart?: ASealReadApart
}): TheCheckWritten {
  if ((input.standard !== undefined) !== (input.how === 'the standard-change rule') ||
      (input.standard !== undefined && input.check.verdict !== 'released')) {
    throw new Error('releaseOrRefuse: a standard change is released by the standard-change rule and nothing else, and that rule only releases.')
  }
  requireCheckEligibility(input.runId, input.workspaceId)
  requireIndependentChecker(input.runId, input.workspaceId, input.actor)
  const reads = whatTheInspectorReads(input.runId, input.workspaceId, {
    theSealFromItsCommit: input.theSealFromItsCommit === true,
    ...(input.readApart === undefined ? {} : { readApart: input.readApart }),
  })
  const saved = savedRoundChapters(reads.run.data)
  if (saved !== null) {
    try { checkSavedChapterClaims(saved, input.check) }
    catch (why) { throw new PanelError(why instanceof Error ? why.message : String(why), 400) }
  }
  const me: ParticipantRef = input.by
  const checkerSaid = theNameAPersonReads(input.by)

  if (reads.submission) {
    const seal = reads.submission
    if (input.check.read?.sealId !== seal.id || input.check.read?.sealHash !== seal.seal.hash ||
        (seal.seal.git && input.check.read?.tip !== seal.seal.git.commit)) {
      throw new PanelError('The verdict does not name the current seal ' + seal.id + ' and its exact submitted tip.', 409)
    }
    // 8Rqdy6PXQnG2, inspector ab2Bj-DkFm7S on adTmco_wIzln; invariants 2, 8 and 9:
    // refuse rather than replace the sent kind, because a different kind means this reading
    // is not what the check believes it read. An absent kind makes no claim to compare.
    if (input.check.read?.sealKind !== undefined && input.check.read.sealKind !== seal.seal.kind) {
      throw new PanelError(`The reading names seal kind ${input.check.read.sealKind}, but the seal's own kind is ${seal.seal.kind}.`, 409)
    }
  }

  // NAMED MUST MEAN JUDGED, which is A2 and the first addition. A release of a files seal
  // gives one line of the model's own for every path it was handed to judge. Refused here, while the
  // check can still be asked again, rather than found by the queue after the run is released once.
  if (input.check.verdict === 'released' && reads.submission?.seal.kind === 'files') {
    const lined = new Set((input.check.judged ?? []).filter((one) => one.concluded.trim() !== '').map((one) => one.path))
    const without = (input.check.read?.needsJudgment ?? []).map((one) => one.path).filter((path) => !lined.has(path))
    if (without.length > 0) {
      throw new PanelError(
        `A release of a files seal gives one line of its own, in \`judged\`, for every file it was handed to judge, and this one ` +
          `gives none for ${without.join(', ')}. Nothing was written; the check can be asked again.`,
        400,
      )
    }
  }

  if (reads.submissionStatus === 'legacy-unsealed') {
    input.check.read = { worktree: reads.checkout.directory ?? 'legacy checkout not recorded', ofItsOwn: false,
      ...input.check.read, unsealed: true, says: 'Unsealed legacy tip; the check used the historical fork-point reader. ' + (input.check.read?.says ?? '') }
  }

  // The seal names all changed paths; an unsealed check uses the changes its assembly kept. The inspector judges
  // the words. This follows item 6, step 3, record oj9CRzzB2_8m and chapter 7 rule 5.
  const assembly = whatTheCheckWouldRead(reads.run)
  const judgedPaths = thePathsACheckJudges({
    only: input.check.read?.only ?? assembly?.read?.only,
    submission: reads.submission,
    inside: assembly?.inside ?? [],
    outside: assembly?.outside ?? [],
    handedOn: (input.check.read?.needsJudgment ?? []).map((one) => one.path),
  })
  // A STANDARD CHANGE IS TRACED BY ITS KIND: the door found every changed path inside it, and no model read the paths.
  // AN INSPECTOR'S CHECK OF HANDED-BACK PACKAGES IS ASKED FOR NO TRACE (assembleTheInspectorsPrompt), so it is not refused for one.
  const ofPackages = input.inspector !== null && aCheckOfHandedBackPackages(reads.packages)
  if (input.check.verdict === 'released' && input.standard === undefined && !ofPackages) {
    const lined = new Set((input.check.traced ?? []).flatMap((one) => one.paths))
    const without = judgedPaths.filter((path) => !lined.has(path))
    if (without.length > 0) {
      // The inspector asks the check's session once more on exactly this sentence (wave 13y round 23), so it is written once.
      throw new PanelError(aReleaseWithoutATraceSays(without), 400)
    }
    const unknown = (input.check.traced ?? []).filter((one) => getRecord(one.to) === null)
    if (unknown.length > 0) {
      // The inspector asks the check's session once more on exactly this sentence (wave 13v round 33), so it is written once.
      throw new PanelError(aTraceNamingRecordsNotHeldSays(unknown), 400)
    }
  }

  // ALREADY RELEASED, NO AGENT, OR A RETIRED WORKER NOBODY STARTED: refused before anything is written.
  const { worker: workerRef, starter, retired: workerRetired } = theWorkerAVerdictGoesTo(input.runId, reads)

  // The inspector may record findings, but may not change the work during this check.
  if (reads.agent !== null && input.inspector !== null) {
    const fixed = whatTheInspectorChanged(reads.agent, input.inspector, reads.run, input.actor.sessionId)
    if (fixed.length > 0) throw new PanelError(anInspectorThatFixedIt(fixed), 403)
  }

  const theCheckGoesTo: ParticipantRef = workerRetired && starter !== null ? starter : workerRef
  // THE CONFIRMATION GIVES THE OWNER THIS SENTENCE TOO, from the same word entry, so the two cannot drift.
  const inTheWorkersPlace = workerRetired
    ? `${sayInEnglish('checks.retiredWorkerReachesOwner', { name: theNameAPersonReads(workerRef) })}\n\n`
    : ''

  const chaptersRead = chaptersLineInWords(
    input.check.chaptersRead,
    reads.chapters.mustRead.map((one) => ({ n: one.chapter, label: `chapter ${String(one.chapter)}` })),
  )
  // A CHAPTERS LINE THAT COULD NOT BE READ IS SAID, NOT DROPPED. The verdict is what the check is
  // for, and the words it did not read are kept beside it as text. Problem `y_HP9aIa0Bd6`: a finished
  // check was thrown away over one word, and the run stayed inspecting with nothing recorded.
  const chaptersReadUnreadable = (input.check.chaptersReadUnreadable ?? []).map(
    (one) => `${one.said} — ${one.because}`,
  )
  // A LINE NOTHING OF WHICH COULD BE READ SAYS NOT KNOWN, NEVER NONE (acceptance finding 65; problem
  // OZfz8TM0M-xF): "none" would say the check read no chapter, which a reader auditing the release cannot tell from a
  // check that really read nothing. What could not be read is kept beside it as text, as before.
  const nothingOfItRead = input.check.chaptersRead.length === 0
  const chaptersSentence =
    chaptersReadUnreadable.length === 0
      ? `Chapters read for this check: ${chaptersRead}.`
      : nothingOfItRead
        ? `Chapters read for this check: not known, because the chapters line it sent could not be read: ` +
          `${chaptersReadUnreadable.join(' ')}`
        : `Chapters read for this check: ${chaptersRead}. Part of the chapters line it sent could not be read: ` +
          `${chaptersReadUnreadable.join(' ')}`

  let group: string | null = null
  let released: Release | null = null
  let refused: Refusal | null = null
  let nextRoundAtTheRelease: NextRoundAtTheSeal | { notKept: string } | null = null
  let toTheWorker: string
  let toTheStarter: string
  let refusalForTheStarter: TheCheckWritten['refusalForTheStarter'] = null

  if (input.check.verdict === 'released') {
    const time = clockStamp()
    const at = time.stamp
    const tracedTo = (how: TracedChange['how']): number => new Set(
      (input.check.traced ?? []).filter((one) => one.how === how).flatMap((one) => one.paths).filter((path) => judgedPaths.includes(path)),
    ).size
    // ONE PATH IS "1 path", not "1 paths" (the inspector's note on run I--L2QyM5Glq, erpfQnsRX1sx).
    const paths = (n: number): string => `${String(n)} ${n === 1 ? 'path' : 'paths'}`
    const tracedSentence = ofPackages ? A_CHECK_OF_PACKAGES_TRACES_NO_PATH : `${paths(tracedTo(TRACED_HOW[0]))} traced to ${TRACED_HOW[0]} and ` +
      `${paths(tracedTo(TRACED_HOW[1]))} to ${TRACED_HOW[1]}.`
    // WHETHER EACH LINE WAKES ITS READER is `theKindOfARelease`'s: a release wakes the one who submits the run.
    // A merge queue's check again keeps its kinds, because the queue goes on by itself (message CPeOoo0w8SyD).
    const aCheckAgain = theMergeEntryACheckAgainIsFor(reads.run) !== null
    const kindFor = (reader: ParticipantRef, line: 'released' | 'checkedAndReleased') =>
      aCheckAgain ? line : theKindOfARelease({ reader, line, worker: workerRef, starter })
    // ONE. THE MESSAGE TO THE WORKER. It is what ends it, and it carries the check, so the
    // subagent's own record says what it was released on.
    toTheWorker = writeAMessage({
      workspaceId: input.workspaceId,
      to: [theCheckGoesTo],
      body:
        inTheWorkersPlace +
        `You are released. Your run ${input.runId} may end.\n\n` +
        `What was checked: ${input.check.check}` +
        (input.standard === undefined ? `\n\n${chaptersSentence}\n\n${tracedSentence}` : ''),
      aboutRun: input.runId,
      actor: input.actor,
      title: `Released${workerRetired ? ' (the worker is retired)' : ''}: ${theNameOfAnAgentOr(reads.agent, input.runId)}`,
      notice: kindFor(theCheckGoesTo, 'released'),
      theChecksOwnLine: true,
    })
    // TWO. THE MESSAGE TO THE STARTER. The result, and one line. Criterion C20: it never carries
    // the check. The line is built here from the inspector's handle and nothing the inspector sent.
    // THE STARTER IS NOT WRITTEN TO WHEN THE STARTER IS THE ONE RELEASING. Section 7.2's other
    // way: 'the starter checks it itself'. A message telling somebody what they have just done is
    // not a message, and the reply says why there was none rather than being silent about it.
    //
    // WRITTEN BEFORE THE RELEASE AND NOT AFTER IT. Criterion C29: the release is what puts the run
    // into reporting, and a run in reporting is waiting for a named supervisor to confirm — so the
    // release itself carries who was told. The two writes in the other order would leave a moment
    // where the run reads as waiting for nobody.
    //
    // ONE SHORT LINE ABOUT THE CLOSE, AND THE REST ON THE RUN'S PAGE. C20 is measured in bytes —
    // the starter's message is the result plus one line — and a paragraph explaining the
    // confirmation broke that gate the first time it was written here. What the supervisor has to
    // know is that the run is not over; where the press is belongs on the page the press is on.
    toTheStarter =
      starter === null || isTheSame(starter, me)
        ? ''
        : writeAMessage({
            workspaceId: input.workspaceId,
            to: [starter],
            body:
              `${theResultForTheStarter(reads)}\n\n` +
              `${input.standard === undefined ? checkedAndReleased(checkerSaid) : releasedAsAStandardChange()}` +
              // IT ASKS ABOUT A REPORT ONLY WHEN THE RUN HAS ONE OF ITS OWN. A run with none still waits for its
              // supervisor's confirmation on its page, but the notice must not ask about a report it did not name.
              (input.standard === undefined && reads.reports.length > 0 && reads.reportsAreTheRuns
                ? ` ${itClosesWhenYouConfirm()}`
                : ''),
            aboutRun: input.runId,
            actor: input.actor,
            title: `${input.standard === undefined ? 'Checked and released' : 'Released as a standard change'}: ${theNameOfAnAgentOr(reads.agent, input.runId)}`,
            notice: kindFor(starter, 'checkedAndReleased'),
          })

    // THE KEY IS OMITTED WHERE THE CHECK DID NOT SAY, never written as null. A stored shape says
    // "nobody said" by leaving the key out, and a `read: null` is refused by the session shape
    // outright — which broke every release posted without one until the suite said so. The same
    // spelling holds for who was told: absent means nobody was, which is a real answer.
    released = {
      by: me,
      at,
      time,
      how: input.how,
      check: toTheWorker,
      ...asTheReleaseSpellsIt(input.check.read),
      ...(input.check.wroteIntoTheOffice === undefined ? {} : { wroteIntoTheOffice: input.check.wroteIntoTheOffice }),
      ...(chaptersReadUnreadable.length === 0 ? {} : { chaptersReadUnreadable }),
      ...(toTheStarter === '' || starter === null ? {} : { reportedTo: starter, report: toTheStarter }),
      ...(input.check.judged === undefined || input.check.judged.length === 0 ? {} : { judged: input.check.judged.map((one) => ({ path: one.path, concluded: one.concluded.trim() })) }),
      ...(input.check.traced === undefined ? {} : { traced: input.check.traced }),
      ...(input.check.listed === undefined ? {} : { listed: input.check.listed }),
      ...(input.standard === undefined ? {} : { standard: input.standard }),
    }
    asTheDoorOf('released', () => patchRecord(input.runId, { dataPatch: { [RELEASED]: released } }, { ...THE_OFFICE, sessionId: input.actor.sessionId }))
    // THE FAULTS THE CHECK LISTED BECOME ONE TASK FOR THE LINE. It is filed
    // after the release is on the run, so the task can be linked about it, and before the office asks for the next round,
    // so the round that starts reads a task that already exists.
    fileTheListedFaultsForTheLine(input, reads, workerRef, starter)
    // THE OFFICE ASKS FOR THE NEXT ROUND ONCE THE RELEASE IS ON THE RUN (13r round AX, item 24). A standard change comes
    // through here too, so both ways of releasing ask.
    nextRoundAtTheRelease = theOfficeAsksTheNextRoundAtTheRelease(input.runId)
  } else {
    // A REFUSAL OF THE MERGE QUEUE'S CHECK AGAIN OPENS NO GROUP AND SENDS NOBODY BACK TO WORK. The
    // decision yH7W1sXTRY5q, Q4, on finding 76. The office files that run itself in the merge tool's
    // clone, and nobody works in it, so "go back to work" would be false and a talk about the refusal
    // would have nowhere to lead. The refusal's points still reach the worker in the message below.
    const checkAgainFor = theMergeEntryACheckAgainIsFor(reads.run)

    // ANY OTHER REFUSAL OPENS A GROUP FIRST, so the message to the starter can name it. Criterion C26.
    if (checkAgainFor === null) {
      const members = [
        { who: workerRef, because: 'Its work is what the refusal is about.' },
        ...(starter === null ? [] : [{ who: starter, because: 'It started the worker and answers for it.' }]),
        { who: me, because: 'It wrote the refusal.' },
      ]
      const opened = openAGroupAndSayWhy(
        {
          workspaceId: input.workspaceId,
          name: theGroupForARefusal(reads.agent?.handle ?? input.runId),
          openedBy: me,
          because: whyTheGroupWasOpened(checkerSaid, reads.agent?.handle ?? input.runId),
          members,
        },
        input.actor,
      )
      group = opened.id
    }

    // WHAT THE REFUSAL RESTS ON, in the words every place uses (`theBasisNamed`), with an invariant's name read from
    // CLAUDE.md as it is now.
    const invariants = theInvariantsTheRulesList().listed ?? []
    const saysSo =
      input.check.says === null
        ? ''
        : theBasisNamed(input.check.says, (number) => invariants.find((one) => one.number === number)?.name ?? null)

    toTheWorker = writeAMessage({
      workspaceId: input.workspaceId,
      to: [theCheckGoesTo],
      body:
        inTheWorkersPlace +
        (checkAgainFor === null
          ? `You are not released. Your run ${input.runId} does not end; go back to work.\n\n`
          : `The check refused to release run ${input.runId}. This run is the merge queue's check again for merge ` +
            `entry ${checkAgainFor}, cut in the merge tool's clone, and nobody works in it. What happens to the ` +
            `entry is recorded on merge entry ${checkAgainFor}, not here.\n\n`) +
        `What is missing:\n${input.check.missing.map((one) => `- ${one}`).join('\n')}\n\n` +
        `What says so: ${saysSo === '' ? 'nothing named' : saysSo}.\n\n` +
        `What was checked: ${input.check.check}\n\n` +
        `${chaptersSentence}\n\n` +
        (group === null ? NO_GROUP_FOR_A_CHECK_AGAIN : `The refusal stands while it is talked out. A group is open: ${group}.`),
      aboutRun: input.runId,
      actor: input.actor,
      title: `Refused release${workerRetired ? ' (the worker is retired)' : ''}: ${theNameOfAnAgentOr(reads.agent, input.runId)}`,
      notice: 'refused',
      theChecksOwnLine: true,
    })

    // THE STARTER'S LINE IS WRITTEN LATER, BY `theStarterHearsTheRefusal`, once the merge queue has heard this
    // verdict: an entry it bounces tells the starter in its own notice, which then carries this line too.
    toTheStarter = ''
    refusalForTheStarter =
      starter === null || isTheSame(starter, me)
        ? null
        : {
            to: starter,
            title: `A refusal: ${theNameOfAnAgentOr(reads.agent, input.runId)}`,
            body: aRefusalHappened(checkerSaid, theNameOfAnAgentOr(reads.agent, input.runId), group),
          }

    // AND THE REFUSAL IS WRITTEN ON THE RUN. Criterion C29: a refused run enters rebuttal, and a
    // state nothing stores is a state no page can draw. Until this, a refusal wrote two messages
    // and a group and left the run itself saying "nobody has released it, so no check happened" —
    // which was false on exactly the runs somebody most needed to read.
    //
    // THE STORED OBJECT IS BUILT FIRST AND THEN READ BACK, rather than built twice. A stored shape
    // says "nobody said" by leaving the key out and refuses a null, and what a reader gets always
    // answers, with null — so the two spellings differ, and writing both by hand is two places free
    // to disagree. `readRefusal` is the one reader every other caller uses.
    const stored = {
      by: me,
      at: nowStamp(),
      missing: [...input.check.missing],
      ...(input.check.traced === undefined ? {} : { traced: input.check.traced }),
      ...(input.check.says?.chapter === null || input.check.says?.chapter === undefined
        ? {}
        : { chapter: input.check.says.chapter }),
      ...(input.check.says?.precedent === null || input.check.says?.precedent === undefined
        ? {}
        : { precedent: input.check.says.precedent }),
      ...(input.check.says?.invariant === null || input.check.says?.invariant === undefined
        ? {}
        : { invariant: input.check.says.invariant }),
      ...(group === null ? {} : { group }),
      check: toTheWorker,
      ...(input.check.wroteIntoTheOffice === undefined ? {} : { wroteIntoTheOffice: input.check.wroteIntoTheOffice }),
      ...(chaptersReadUnreadable.length === 0 ? {} : { chaptersReadUnreadable }),
      ...(input.check.read === null
        ? {}
        : {
            read: {
              worktree: input.check.read.worktree,
              ...(input.check.read.tip === undefined ? {} : { tip: input.check.read.tip }),
              ofItsOwn: input.check.read.ofItsOwn,
              says: input.check.read.says,
              ...theScopeOfWhatWasRead(input.check.read),
              ...theFilesOfWhatWasRead(input.check.read),
            },
          }),
    }
    // A NEW REFUSAL REPLACES THE OLD ONE WHOLE (problem o9u6zBzXqAkS). A merge patch keeps every key
    // the new refusal leaves out, so a second refusal showed the first one's precedent and tip as its
    // own. The old refusal stays in the run's revisions and in the messages it sent.
    const before = getRecord(input.runId)?.data[REFUSED]
    asTheDoorOf('refused', () => patchRecord(input.runId, { dataPatch: { [REFUSED]: isObject(before) ? aPatchThatReplaces(before, stored) : stored } }, { ...THE_OFFICE, sessionId: input.actor.sessionId }))
    refused = readRefusal(stored)
  }

  const after = whereARunStands(getRecord(input.runId) ?? reads.run)
  return {
    verdict: input.check.verdict,
    toTheWorker,
    toTheStarter,
    refusalForTheStarter,
    starter,
    group,
    released,
    refused,
    ...(nextRoundAtTheRelease === null ? {} : { nextRoundAtTheRelease }),
    stands: after,
    says:
      starter === null
        ? `${after.says} Nobody is recorded as having started ${theNameOfAnAgentOr(reads.agent, 'this agent')}, so no starter was told.`
        : after.says,
  }
}

/**
 * WHICH KIND A RELEASE CARRIES FOR ONE READER: a release wakes the one who submits the run, and nobody else. Wave
 * 13y round 9, with answer HeBxwj6QRGjS. Whoever sends a release to a reader asks this for its kind, so who
 * receives a release (wave 13s's) and whether it wakes (this) are decided once each.
 *
 *   1. A reader that has said it reads a release from the check's own result is not woken by one
 *      (`releasedToOneThatReadsTheCheck`). It is an agent, and it said so, or the owner said so for it.
 *   2. The worker's own "You are released" does not wake it when the run's starter is another agent: the starter
 *      submits the run (`releasedAndTheStarterIsTold`). With no starter, or a person as starter, the worker submits,
 *      so it wakes.
 *   3. Otherwise the line keeps its own kind, which wakes.
 *
 * A refusal is never asked about here: it always wakes (the second condition).
 */
export function theKindOfARelease(input: {
  reader: ParticipantRef
  line: 'released' | 'checkedAndReleased'
  worker: ParticipantRef
  starter: ParticipantRef | null
}): AnotherNoticeKind {
  // A REFERENCE MAY HOLD A HANDLE OR A REGISTRY ID; both sides are read as registry ids before they are compared.
  const idOf = (who: ParticipantRef): string | null => (who.kind === 'agent' ? (theOneAgentAStringNames(sqlite, who.id)?.id ?? who.id) : null)
  const reader = idOf(input.reader)
  if (reader !== null && theReleaseReadingOf(reader)?.on === true) return 'releasedToOneThatReadsTheCheck' satisfies AnotherNoticeKind
  const worker = idOf(input.worker)
  const starter = input.starter === null ? null : idOf(input.starter)
  if (input.line === 'released' && reader !== null && reader === worker && starter !== null && starter !== worker) {
    return 'releasedAndTheStarterIsTold' satisfies AnotherNoticeKind
  }
  return input.line === 'released' ? ('released' satisfies AnotherNoticeKind) : ('checkedAndReleased' satisfies AnotherNoticeKind)
}

/**
 * THE STARTER HEARS A REFUSAL ONCE. Check FtAaQVz8KES9 (wave 13y, round 9): a refused merge entry wrote its starter
 * both "A refusal" and the bounce notice, two notices for one event. When the merge queue
 * bounced an entry on this verdict and that bounce notice went to the starter, the notice carries the refusal's line
 * as well (`bounce` in ./merge-state-machine.ts), so it is the one, and nothing more is written. Otherwise the line
 * is written here as its own message, as before. Either way `toTheStarter` names the message that told the starter.
 */
export function theStarterHearsTheRefusal(
  written: TheCheckWritten,
  bounceNotices: readonly string[],
  input: { workspaceId: string; runId: string; actor: Actor },
): TheCheckWritten {
  const line = written.refusalForTheStarter
  if (line === null) return written
  const theStarter = theOneAgentAStringNames(sqlite, line.to.id)?.id ?? line.to.id
  const told = bounceNotices.find((id) => {
    const to = getRecord(id)?.data['to']
    return Array.isArray(to) && to.some((one) => isObject(one) && typeof one['id'] === 'string' && (theOneAgentAStringNames(sqlite, one['id'])?.id ?? one['id']) === theStarter)
  })
  if (told !== undefined) return { ...written, toTheStarter: told, refusalForTheStarter: null }
  const message = writeAMessage({
    workspaceId: input.workspaceId,
    to: [line.to],
    body: line.body,
    aboutRun: input.runId,
    actor: input.actor,
    title: line.title,
    notice: 'aRefusalForTheStarter',
    theChecksOwnLine: true,
  })
  return { ...written, toTheStarter: message, refusalForTheStarter: null }
}

/** Two references to the same participant. */
function isTheSame(a: ParticipantRef, b: ParticipantRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

/**
 * Whether a registrar other than the asker may confirm: the asking run has ended, and no other run of the asker's
 * agent is still running. A later run of the same agent may still confirm, so while one runs the registrar may not.
 * Both ends are read with theRunHasEnded. A run belongs to the asker by servingAgentId, or by the stored
 * servingAgent handle where no id was written. The asker's id may be an alias filed for the agent, and so may a run's
 * servingAgentId: the statement asks for each of the agent's ids, and the agent a run serves is compared by canonical id.
 */
function nobodyElseCanConfirmForTheAsker(askingRun: PanelRecord, askerId: string): boolean {
  if (!theRunHasEnded(askingRun.data['state'])) return false
  const asker = theAgentWithThisId(sqlite, askerId)
  const ids = theFiledAliasesReadOnce(sqlite).everyIdOf(askerId)
  const runs = sqlite.prepare(`
    SELECT data FROM records
    WHERE kind = 'session' AND deleted_at IS NULL
      AND (json_extract(data, '$.servingAgentId') ${isOneOf(ids)} OR json_extract(data, '$.servingAgent') = ?)
  `).all(...ids, asker?.handle ?? null) as { data: string }[]
  return !runs.some(row => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    return theAgentARunServes(data)?.id === ids[0] && !theRunHasEnded(data['state'])
  })
}

/**
 * The door and the record's read ask this one reader who may confirm a report. At off, the gate who-confirms-a-report
 * lets anybody registered confirm, and the answer says so, with the rule at block in its sentence (wave 13r round M).
 */
export function whoMayConfirmThisReport(run: PanelRecord): ReportConfirmation {
  const atBlock = whoMayConfirmAtBlock(run)
  if (atBlock.allowed === null || gatePosition('who-confirms-a-report') === 'block') return atBlock
  return {
    ...atBlock,
    rule: 'any-registered-at-off',
    agent: null,
    allowed: null,
    registrarMayConfirmWhen: null,
    says: `The gate for who may confirm a report is off, so anybody registered may confirm. At block the rule would be this: ${atBlock.says}`,
  }
}

/** Who may confirm a report at block. The door refuses by this answer and counts the confirmations it would refuse. */
function whoMayConfirmAtBlock(run: PanelRecord): ReportConfirmation {
  const told = readRelease(run.data[RELEASED])?.reportedTo ?? null
  const asker = theRunThatAskedForThisWorker(run)
  if (asker === null) {
    return {
      rule: told === null ? 'any-registered' : 'reported-to',
      agent: told,
      allowed: told === null ? null : [told],
      asker: null,
      registrar: null,
      registrarMayConfirmWhen: null,
      says: told === null
        ? 'Anybody registered may confirm because nobody was told.'
        : `The run reported to ${theNameAPersonReads(told)}, so confirming that report is theirs to do.`,
    }
  }
  const who: ParticipantRef = { kind: 'agent', id: asker.askerId }
  const name = theNameAPersonReads(who)
  const registrar = theAgentOfARun(run)?.startedBy ?? null
  const askingRun = getRecord(asker.run)
  const answer: ReportConfirmation = {
    rule: 'asker',
    agent: who,
    allowed: [who],
    asker,
    registrar,
    registrarMayConfirmWhen: null,
    says: `"${name}" asked for this worker from run ${asker.run}, so confirming its report is theirs to do.`,
  }
  if (askingRun === null) answer.says += ' The asking run could not be read.'
  if (registrar === null || isTheSame(who, registrar)) return answer
  const registeredBy = theNameAPersonReads(registrar)
  if (askingRun === null) answer.says += ' The registrar cannot take over.'
  answer.registrarMayConfirmWhen = `"${registeredBy}", which registered the worker, may confirm only once that run has ended and no other run of "${name}" is still running.`
  answer.says += ` ${answer.registrarMayConfirmWhen}`
  if (askingRun === null || !nobodyElseCanConfirmForTheAsker(askingRun, asker.askerId)) return answer
  return {
    ...answer,
    rule: 'registrar-after-asker-ended',
    agent: registrar,
    allowed: [who, registrar],
    says: `Run ${asker.run}, which asked for this worker, has ended, and no other run of "${name}" is still running, so "${registeredBy}", which registered the worker, may confirm as well as "${name}".`,
  }
}

// ============================================================ the act that closes a run

/** What the confirmation wrote, and where the run stands afterwards. */
export interface TheReportConfirmed {
  confirmed: Confirmation
  /** The message telling the worker its run is closed, by record id. */
  toTheWorker: string
  stands: WhereARunStands
  says: string
  /**
   * THE HONOUR READING the close pressed, criterion HB2, stored on the session record beside it.
   * Absent exactly when the reading could not be made; `honourSays` says which of the two in a
   * sentence, either way.
   */
  honour?: ReturnType<typeof readTheHonourOfARun>
  honourSays: string
  /** Which test worlds were stopped, left for the person, or could not be checked; stored on the run. */
  worldsSays: string
}

/**
 * THE SUPERVISOR CONFIRMS THE REPORT, AND THAT IS WHAT CLOSES THE RUN. Criterion C29.
 *
 * A passed check puts the run into reporting; the run reports to its supervisor and closes once that is confirmed.
 *
 * ---------------------------------------------------------------------------------------
 * A RELEASE IS NOT A CLOSE, AND THAT IS THE WHOLE CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * Before this, a release was the end of the story: an inspector released the run and everything
 * downstream read it as over. What a release actually settles is the CHECK. The run then reports to
 * whoever started it, and the person or agent who has to live with that work is the one who says it
 * is done. Until they do, the run is in `reporting`, its worktree is kept, and nothing about it is
 * removed.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY CONFIRM, AND WHY IT IS NOT ANYBODY
 * ---------------------------------------------------------------------------------------
 *
 * The supervisor that asked for a worker's run confirms its report, because it joins and judges the
 * work. A different agent that registered the worker may confirm only once the asking run has ended
 * and no other run of the asker is running; whoMayConfirmThisReport reads that. The person may always confirm.
 * With no asker, the participant the release reported to confirms, as before.
 *
 * WHERE NOBODY WAS TOLD, ANY REGISTERED PARTICIPANT MAY CONFIRM AND THE REPLY SAYS SO. A run whose
 * release recorded no supervisor has nobody to wait on: refusing every confirmation would leave it
 * in `reporting` for ever, which is worse than saying out loud that whoever closed it was not its
 * supervisor.
 */
export function confirmTheReport(input: {
  runId: string
  workspaceId: string
  by: ParticipantRef
  because: string
  actor: Actor
}): TheReportConfirmed {
  const run = theRun(input.runId, input.workspaceId)
  const stands = whereARunStands(run)

  if (stands.confirmed !== null) {
    throw new PanelError(
      `Run ${input.runId} was already confirmed. ${stands.says} A run is closed once, and a second confirmation ` +
        'would leave two answers to who ended it. Nothing was written.',
      409,
    )
  }
  // ------------------------------------------------------------- WHETHER A RELEASE IS REQUIRED
  //
  // AT `full` IT IS, EXACTLY AS BEFORE: a confirmation is the supervisor accepting a report a check
  // released, and skipping the release would be a way round the check.
  //
  // AT `none` AND `light` THERE IS NO CHECK TO GO ROUND. The office starts no inspector at those levels and the
  // secretary confirms the finished run directly, so a release naming a check is a thing that will never be written
  // and requiring one would leave every run at `none` unclosable for ever. The decision of
  // 11 September 2026 is this branch, and its
  // price is paid below: the confirmation itself carries the seal, the hash and the tip, so a
  // closure at `none` still proves WHICH WORK was accepted. It never says anybody checked it.
  const level = theReviewLevel(input.workspaceId)
  const mustBeReleasedFirst = level === 'full'
  if (stands.released === null && mustBeReleasedFirst) {
    throw new PanelError(
      `Run ${input.runId} has not been released, so there is no report to confirm. ${stands.says} A confirmation ` +
        'is the supervisor accepting a report a check released; it is not a way round the check. Nothing was ' +
        'written.',
      409,
    )
  }
  if (stands.released === null && !stands.saidFinished) {
    throw new PanelError(
      `Run ${input.runId} has not said its work is finished, so there is nothing to confirm. ${stands.says} ` +
        `This project's review level is ${REVIEW_LEVEL_WORDS[level]}, which decides whether a check runs — it ` +
        'does not let a run be closed before it says it is done. Nothing was written.',
      409,
    )
  }

  // THE SEAL IS VERIFIED EITHER WAY, and `verifyRunSeal` is the guard rather than the comparison
  // below: it re-reads HEAD and every sealed file, and throws where the tip moved after the seal. At
  // `full` the comparison beside it is the second half — the release must have named THIS seal, so a
  // tip that moved between the check and the confirmation cannot be closed over. At `none` and
  // `light` there is no earlier reading to compare with, because this read IS the reading.
  // THE CONFIRM MAY READ THE SEAL FROM ITS COMMIT when the worktree or the sealed repository is gone (problem
  // ubRkOIcdBWnS); `readFrom` then says so, and the answer carries it. A check-again run reads it from the repository
  // its merge entry names (problem JCSXirDhnzaE).
  // THE CONFIRM ALSO READS THE SEAL UNDER A LATER COMMIT, as the inspector does (round 20, problem Qrcr9t4iT2Id): a
  // worktree whose HEAD holds the sealed commit, in the sealed repository, with every sealed file at its sealed hash
  // in that commit, is the sealed work with more on top.
  // THE CONFIRM READS THE SEAL FROM ITS COMMIT AFTER THE FOLDER MOVED ON (wave 13u round 72, option B): where the
  // folder's read refuses, the folder is still a worktree of the sealed repository, and a branch there still holds the
  // sealed commit. Anything else is still refused with the folder's words.
  const submission = verifyRunSeal(input.runId, { fromTheCommit: true, underALaterCommit: true })
  // A RELEASE WRITTEN EARLIER NAMES THE SEAL as it is, or as it was before migration 0154 re-hashed it
  // (`howAReleaseNamesThisSeal`); the answer says which when it is the second.
  const named = submission && stands.released !== null ? howAReleaseNamesThisSeal(stands.released.read, submission.id, submission.seal) : null
  if (submission && stands.released !== null && named === null) {
    throw new PanelError('The release does not match current seal ' + submission.id + '. A new check is required before confirmation.', 409)
  }

  const told = stands.released?.reportedTo ?? null
  const permission = whoMayConfirmAtBlock(run)
  // At off the gate who-confirms-a-report lets any registered caller confirm. The door reads the answer at block, so it
  // counts each confirmation the gate would have refused.
  if (input.by.kind !== 'person' && permission.allowed !== null && !permission.allowed.some(who => isTheSame(who, input.by)) && gateMet('who-confirms-a-report') === 'block') {
    throw new PanelError(
      permission.asker === null && told !== null
        ? `Run ${input.runId} reported to ${participantWord(told.kind)} ${theNameAPersonReads(told)}, and confirming that report is ` +
          `theirs to do. ${theNameAPersonReads(input.by)} is neither the supervisor it reported to nor the person. Nothing was written.`
        : `Run ${input.runId}: ${permission.says} ${theNameAPersonReads(input.by)} may not confirm this report. The person may always confirm. Nothing was written.`,
      403,
    )
  }

  // WHAT THIS CONFIRMATION ACCEPTED, WRITTEN ONLY WHERE NO RELEASE CARRIES IT. At `full` the release
  // holds the seal, the hash and the tip and this stays absent; at `none` and `light` the
  // confirmation is the only act there is, so it carries them or nothing does.
  //
  // ABSENT WHERE NO SEAL NAMES A TREE — a run sealed for its records only, or one that finished
  // before seals existed. Naming a directory nothing sealed would be an invented fact.
  const accepted: WhatWasRead | null =
    stands.released !== null || submission === null || submission.seal.git === null
      ? null
      : {
          sealId: submission.id,
          sealHash: submission.seal.hash,
          worktree: submission.seal.git.directory,
          tip: submission.seal.git.commit,
          // NOTHING READ A WORKTREE HERE. A confirmation is not a check and never reads one; saying
          // `true` would claim a detached tree that was never made.
          ofItsOwn: false,
          says:
            `This project's review level is ${REVIEW_LEVEL_WORDS[level]}, so no inspector was started and no ` +
            'check released this run. The seal, its hash and the tip are named here so a reader can say which ' +
            'work was accepted. Nothing read that work against the office regulations.',
        }

  const confirmed: Confirmation = {
    by: input.by,
    at: nowStamp(),
    because: input.because,
    ...(accepted === null ? {} : { read: accepted }),
  }

  // WHO IS TOLD THAT THE RUN IS CLOSED, worked out BEFORE anything is written. The worker may be
  // retired by now: their rule of 11 September retires a worker the moment its work is handed back,
  // and a confirmation comes after the handback by definition, so this is the common case and not
  // the odd one. The message door refuses a message to a retired agent, rightly, and until 13
  // September 2026 that refusal arrived AFTER the confirmation had been written, so the door
  // answered 409 "nothing was written" over a run that was already closed (problem kmBCj5Zki18R,
  // Cedar's confirmation of Wren's report). Two mendings: the closure goes to the run's starter in
  // a retired worker's place, saying so in its first line; and the two writes below are one
  // transaction, so a refused message leaves no half-written confirmation and the reply is true
  // either way.
  const worker = theAgentOfARun(run)
  const workerRetired = worker?.retired === true
  const owner = workerRetired && worker !== null ? whoIsToldOfTheRun(worker) : null
  const toldInstead = owner !== null && 'to' in owner ? owner.to : null
  const recipients: ParticipantRef[] =
    worker === null ? [] : toldInstead !== null ? [toldInstead] : [{ kind: 'agent', id: worker.id }]
  const inTheWorkersPlace =
    toldInstead === null
      ? ''
      : `${sayInEnglish('checks.retiredWorkerReachesOwner', { name: theNameOfAnAgentOr(worker, '') })}\n\n`

  const toTheWorker = sqlite.transaction((): string => {
    asTheDoorOf('confirmed', () => patchRecord(input.runId, { dataPatch: { [CONFIRMED]: confirmed } }, input.actor))
    return writeAMessage({
      workspaceId: input.workspaceId,
      to: recipients,
      body:
        inTheWorkersPlace +
        `Your run ${input.runId} is closed. ${participantWord(input.by.kind)} ${theNameAPersonReads(input.by)} confirmed ` +
        (stands.released === null
          ? `it directly. This project's review level is ${REVIEW_LEVEL_WORDS[level]}, so no inspector was started ` +
            'and no check read your work.'
          : 'the report you made after the check released you.') +
        `\n\n${input.because}\n\nWhat this run was holding may be let go: ` +
        'the worktree, the handle, anything registered against it.',
      aboutRun: input.runId,
      actor: input.actor,
      title: `Closed${toldInstead === null ? '' : ' (the worker is retired)'}: ${theNameOfAnAgentOr(worker, input.runId)}`,
      notice: 'aRunWasClosed',
      theChecksOwnLine: true,
    })
  })()

  // FrF3zyjDmnOE: CONFIRM is per run; retire is per agent and could stop another run's worlds.
  // C31/C32 leave a shown world up for the person's look. Cleanup follows the committed close,
  // like the honour reading, so a failed signal or record write never rolls the close back.
  // A message is delivered when created; its closing words must never be edited afterward.
  const worldsStopped = stopTheUnshownWorldsOfARun(run)
  let worldsSays = worldsStopped.says
  try {
    patchRecord(input.runId, { dataPatch: { [THE_WORLDS_STOP_KEY]: worldsStopped } }, input.actor)
  } catch (error) {
    worldsSays += ` The test-world outcome could not be stored on the run: ${error instanceof Error ? error.message : String(error)}. The run is closed either way.`
  }

  const after = whereARunStands(getRecord(input.runId) ?? run)
  // THE HONOUR READING, PRESSED BY THE CLOSE. Criterion HB2: the reading runs when a run is closed
  // and again on demand, never on a timer. It comes AFTER the transaction above, so a reading that
  // cannot be made, or stored, does not leave a half-closed run behind; the reply says out loud
  // what happened either way, in one sentence, because a silent gap between a closed run and an
  // unmarked board is a defect waiting the other way round.
  let honour: ReturnType<typeof readTheHonourOfARun> | null = null
  let honourSays = ''
  try {
    honour = readTheHonourOfARun({ runId: input.runId, workspaceId: input.workspaceId })
    storeTheHonourReading({ runId: input.runId, workspaceId: input.workspaceId, actor: input.actor })
    honourSays = 'The office read the five honour signals off the records this run left and stored the reading on its session record.'
  } catch (error) {
    honourSays =
      'The honour reading could not be made: ' + (error instanceof Error ? error.message : String(error)) +
      ' The run is closed either way, and the board will read it when the records are whole.'
  }
  const whoWasTold =
    toldInstead === null ? '' : ` ${sayInEnglish('checks.retiredWorkerOwnerWasTold', { worker: theNameOfAnAgentOr(worker, ''), owner: theNameAPersonReads(toldInstead) })}`
  return {
    confirmed,
    toTheWorker,
    stands: after,
    ...(honour === null ? {} : { honour }),
    honourSays,
    worldsSays,
    says:
      (told === null
        ? `${after.says} Nothing on the release said who this run reported to, so whoever confirmed it was not ` +
          'recorded as its supervisor.'
        : after.says) +
      whoWasTold +
      ` ${worldsSays}` +
      (submission?.readFrom === undefined ? '' : ` ${submission.readFrom}`) +
      (named === 'before 0154' && submission ? ` ${aReleaseNamedTheSealBefore0154(submission.id)}` : ''),
  }
}

/**
 * One message, filed the way every message is: a record of kind `message`.
 *
 * EXPORTED FOR THE MERGE QUEUE'S STATE MACHINE (sandbox v1, piece P7), which tells a submitter why
 * its entry bounced and tells the secretary one line when an entry ends, in exactly this shape.
 */
export function writeAMessage(input: {
  workspaceId: string
  to: ParticipantRef[]
  toGroup?: string
  body: string
  /** The run the message is about, or null when it is about none: an emergency push's red follow-up is about the push (wave 13u round 83). */
  aboutRun: string | null
  actor: Actor
  title: string
  /**
   * TO THESE RECIPIENTS AND NOBODY ELSE. An office message to one recipient otherwise goes to the run's
   * agent as well, which is what the check's notices want; the merge queue's one line to the secretary
   * (SPEC.md 5.7) and its question about deletes are for the secretary alone, and each message to an
   * agent is delivered by starting that agent's tool.
   */
  onlyThem?: true
  /**
   * WHAT KIND OF NOTICE THIS IS, stored as `data.notice`. Its row in lib/notices.ts says whether it wakes its
   * reader. Required, so no notice is written without a kind. It is stored only when
   * Mole Office or an inspector writes: a starter's own release or refusal is that starter's message, which
   * wakes as every agent's does, and the message door refuses a kind from anybody else.
   */
  notice: AnotherNoticeKind
  /**
   * WHAT A PROGRAM READS OFF THE MESSAGE THAT ASKS AN ENTRY'S SUPERVISOR TO RESOLVE ITS CONFLICT (Fr7xGMIidn97,
   * way (a)), stored as `data.askedToResolve`. Only Mole Office writes it, and the message door refuses it from anybody
   * else.
   */
  askedToResolve?: AskedToResolveMessage
  /** One of the check's own lines, which lib/delegation.ts may hand to the supervisor that took the run's package. */
  theChecksOwnLine?: true
}): string {
  const office = input.actor.id === 'mole-office/the-api-server'
  if (input.askedToResolve !== undefined && !office) throw new Error(`Only Mole Office writes \`askedToResolve\` on a message, and ${input.actor.id} was writing it.`)
  const target = input.aboutRun === null ? null : getRecord(input.aboutRun)
  const worker = target === null ? null : theAgentOfARun(target)
  // THE RUN'S AGENT IS ADDED ONLY WHEN IT IS NOT ALREADY THE ONE RECIPIENT, by id or by handle: the
  // message door refuses an agent named twice, so a note the office writes to the run's own agent (a
  // bounce of its own submission) would otherwise not be written at all. Sandbox v1 integration.
  const alreadyNamed = worker !== null && input.to.some((one) => one.kind === 'agent' && (one.id === worker.id || one.id === worker.handle))
  const to = office && !input.toGroup && input.onlyThem !== true && input.to.length === 1 && worker !== null && !alreadyNamed
    ? [...input.to, { kind: 'agent' as const, id: worker.id }]
    : input.to
  return createRecord({
    workspaceId: input.workspaceId,
    kind: 'message',
    title: input.title,
    data: { body: input.body, ...(office || isAnInspector(participantForActor(input.actor)) ? { notice: input.notice } : {}), ...(input.actor.id === 'mole-office/the-api-server' ? { sentBy: moleOffice() } : {}), ...(input.toGroup ? { toGroup: input.toGroup } : { to }), ...(input.aboutRun === null ? {} : { aboutRun: input.aboutRun }), ...(input.askedToResolve === undefined ? {} : { askedToResolve: input.askedToResolve }) },
    actor: input.actor,
    ...(input.actor.id === 'mole-office/the-api-server' ? { senderIsMoleOffice: true } : {}),
    ...(input.theChecksOwnLine === true ? { theChecksOwnLine: true } : {}),
  }).id
}

/** The chain above one agent, for a reply that has to say who would be told. */
export function whoWouldBeTold(agent: RegisteredAgent | null): ParticipantRef | null {
  if (agent === null) return null
  const above = theChainUpFrom(agent.startedBy, listParticipants().agents)
  return above.chain[0] ?? agent.startedBy
}

// ============================================================ the office starts the check itself

export { THE_OFFICE } from './the-office.ts'

/** Where the field the office writes lives on a run. */
const THE_CHECK = 'theCheck'

/** What the office did when a run said its work was finished. Criterion C28. */
export interface TheCheckTheOfficeAskedFor {
  /** No ask at this worker's seal; its round's check covers its work. Decision xqEqVk7M-9jE. */
  notAsked?: AWorkerCheckNotAsked
  execution?: { session: string; log: string; model: string; minutes: number; endedAt?: string; failed?: string; ending?: 'no-verdict' }
  /** The earlier ask and its tool session whose completed second answer gave no verdict. Present only on its one automatic repeat. */
  askedAgainFrom?: { message: string; session: string }
  eligibility?: CheckEligibility
  /** When the office recorded the ask or the reason it asked none, in local time. */
  askedAt: string
  /** The inspector it asked, by handle. Absent when no check was asked for. */
  askedOf?: string
  /** The message whose delivery starts the run. Absent when the office wrote only a note. */
  message?: string
  /** Which checkout the check was told to read, and which branch it was cut from. */
  checkout: { directory?: string; cutFrom?: string }
  /**
   * THE PATHS THIS CHECK IS SCOPED TO, and the paths a checker tool handed on to it. Sandbox v1,
   * decisions R2 and R4: the merge queue asks for a scoped check of the files whose content changed
   * when an entry was put on top of the main world, and the message worker passes both to
   * `tools/the-inspector.mjs` as `--only` and `--needs-judgment`. Absent on an ordinary check.
   */
  only?: string[]
  needsJudgment?: PathThatNeedsJudgment[]
  /**
   * THE PROJECT'S REVIEW LEVEL WHEN THE FINISH WAS DECLARED.
   *
   * WRITTEN AT THE MOMENT, NOT LOOKED UP AFTERWARDS. Somebody may change the level next week, and
   * the question a reader has later is what the office did on the day. Absent on a run that finished
   * before the level existed, which is a different fact from a run at `full`.
   */
  reviewLevel?: ReviewLevel
  /**
   * THE LATER RUN THAT OVERTOOK THIS ONE. Absent means the run was not
   * closed as superseded. It is the one field this file writes that no check process does, and it
   * lives here because `theCheck` is where the office keeps what it did about a finished run.
   */
  superseded?: Superseded
  says: string
}

/** Who holds the inspector card today, or null because nobody does. */
export function whoHoldsTheInspectorCard(): RegisteredAgent | null {
  const card = theCardOffTheTree(theRoleCards())
  if (card === null) return null
  const holders = listParticipants().agents.filter((one) => one.role === card.name && one.retired !== true)
  return holders[0] ?? null
}

/**
 * Who holds the secretary card today, or null because nobody does.
 *
 * THE CARD IS READ OFF THE DECLARATION, never written here as a word. `elevation.onlyThisCardCanHoldIt`
 * in design/permissions/roles.json is the one statement of which card the secretary is — the same
 * route `theCardOffTheTree` takes for the inspector — so a renamed card moves both together.
 * `src/server/lib/participants.ts` reads it the same way for the authorised period.
 */
export function whoHoldsTheSecretaryCard(): RegisteredAgent | null {
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  if (!card) return null
  const holders = listParticipants().agents.filter((one) => one.role === card && one.retired !== true)
  return holders[0] ?? null
}

/** What the office reads on a run about the check it asked for, or null because it asked for none. */
export function theCheckAskedFor(run: Pick<PanelRecord, 'data'>): TheCheckTheOfficeAskedFor | null {
  const held = isObject(run.data) ? run.data[THE_CHECK] : undefined
  if (!isObject(held)) return null
  return held as unknown as TheCheckTheOfficeAskedFor
}

/**
 * A RUN WHOSE CHECK RAN AS ONE OF THESE RUNS: the run `execution.session` of the check `theCheckAskedFor` reads is one of
 * `runs` (wave 13y round 51). It narrows a read of session records and does not decide. A record whose data is not valid
 * JSON is kept, so the read fails on it as a read of every session does.
 */
export function aRunWhoseCheckRanAsOneOf(runs: readonly string[]): SQL {
  return sql`(case when json_valid(${records.data}) then json_extract(${records.data}, ${`$.${THE_CHECK}.execution.session`}) in (select value from json_each(${JSON.stringify(runs)})) else 1 end)`
}

/**
 * The one worker classification for decision xqEqVk7M-9jE. The registry records both cards and the
 * starter when a supervisor registers its worker. Missing identity keeps the ordinary check.
 */
export function theSupervisorOfAWorkerRun(run: PanelRecord): { kind: 'agent'; id: string } | null {
  const worker = theAgentOfARunForItsSeal(run)
  if (worker?.role !== THE_WORKER || worker.startedBy?.kind !== 'agent') return null
  const starter = readParticipant(worker.startedBy)
  return starter !== null && 'role' in starter && starter.role === THE_SUPERVISOR ? { kind: 'agent', id: starter.id } : null
}


/**
 * The one reading of who is left out under the owner's decision of 12 November 2026. The seal notice, held-check notice
 * and child-finished line ask it. Only that supervisor is left out; a notice to anybody else is sent as before: an owner
 * recorded later, a supervisor that took a moved package, a secretary or the person.
 */
export function whyAWorkersSupervisorIsNotTold(run: PanelRecord, to: ParticipantRef): string | null {
  const supervisor = theSupervisorOfAWorkerRun(run)
  if (supervisor === null || to.kind !== 'agent' || to.id !== supervisor.id) return null
  return "This run's agent is a worker that a line's supervisor started, and that supervisor is not told when the run is sealed or its check is held: the worker's own last message says the run ends, and a worker's run is not checked by itself."
}

/**
 * THE OFFICE STARTS THE CHECK ITSELF. Criterion C28: nobody keeps a checking agent open in a tmux window;
 * Mole Office starts one itself. And one rule stands over all of it: a user is never
 * asked to run a command in a terminal, and everything a user does can be done inside Mole Office.
 *
 * ---------------------------------------------------------------------------------------
 * IT STARTS NO PROCESS, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * The message worker runs the tool directly through its ordinary start and ending lifecycle.
 * The request message is a notice; no model is asked to run a command or resume a conversation.
 * Repeated finishes keep the same request until rework, an explicit retry or the office's one
 * automatic repeat after a completed second answer with no verdict asks for another.
 */
export function theOfficeStartsTheCheck(input: {
  runId: string
  workspaceId: string
  actor: Actor
  /** Only the records seal call sets this. Explicit, held, repeat and scoped asks keep their behavior. */
  atTheSeal?: true
  /** An earlier completed check with no verdict. It links the new ask without bypassing any start gate. */
  askedAgainFrom?: { message: string; session: string }
  /**
   * A SCOPED CHECK, asked for by the merge queue (sandbox v1, piece P7): judge only these changed
   * paths, and these paths a checker tool handed on. Absent asks for a check of the whole submission.
   */
  scope?: { only: string[]; needsJudgment: PathThatNeedsJudgment[] }
}): TheCheckTheOfficeAskedFor | null {
  const run = getRecord(input.runId)
  if (run === null || run.deletedAt !== null || run.kind !== 'session') return null
  if (run.workspaceId !== input.workspaceId) return null
  const stands = whereARunStands(run)
  // NOT FINISHED, OR ALREADY RELEASED. Nothing to start in either.
  if (!stands.unreleasedFinish) return null

  // ------------------------------------------------- HOW MUCH REVIEW THIS PROJECT ASKED FOR
  //
  // At `none` and `light` the office starts no inspector; at `full` it does exactly what it did
  // before. The level is asked
  // BEFORE eligibility, and that order matters: eligibility answers whether a check CAN run, and
  // recording an eligibility refusal for a project that asked for no check would put a refusal on
  // the record about a check nobody wanted.
  //
  // THE SECRETARY IS TOLD EITHER WAY, because a finished run nobody reads is worse than a checked
  // one. The two levels differ in what the secretary is being asked for, which is their distinction:
  // at `light` the report goes to the secretary, who answers; at `none` the secretary confirms the
  // finished run directly.
  const level = theReviewLevel(input.workspaceId)
  if (level !== 'full') {
    const already = theCheckAskedFor(run)
    if (already !== null && already.reviewLevel === level) return already
    return theOfficeTellsTheSecretary(run, input.workspaceId, level)
  }

  // Re-resolve before retries and rework too. A prior request is not evidence of eligibility now.
  // THE NOTE NAMES ONLY THE ACTS THAT CAN APPLY TO THIS RUN: a run that runs no model is not told to
  // name the worker it serves or to submit a worker's run, because it serves no worker. The facts it
  // is missing are still listed, because they are still true.
  const eligibility = checkEligibilityForRun(input.runId, input.workspaceId)
  if (!eligibility.eligible) {
    const refused: TheCheckTheOfficeAskedFor = {
      askedAt: nowStamp(), checkout: whereItIs(theRunsCheckout(run)),
      says: noCheckSays(eligibility.missing, sayInEnglish, aRunRunsNoModel(run.data)), eligibility,
    }
    rememberTheCheck(input.runId, refused)
    return refused
  }

  // Decision xqEqVk7M-9jE: a worker's work is checked in its supervisor's round. This is after
  // eligibility, because a worker run that could not be checked anyway — no submitted tip, say —
  // must hear at its seal which fact is missing, so its supervisor fixes it before the round. A
  // real ask or a refusal still stands.
  if (input.atTheSeal && !aRefusalStandsOn(run)) {
    const starter = theSupervisorOfAWorkerRun(run)
    if (starter !== null) {
      const already = theCheckAskedFor(run)
      if (already?.message !== undefined && already.askedOf !== undefined) return already
      const note: TheCheckTheOfficeAskedFor = {
        askedAt: nowStamp(), checkout: whereItIs(theRunsCheckout(run)),
        notAsked: { why: 'worker-of-a-round', starter },
        says: sayInEnglish('chk.workerRound.sentence'),
      }
      rememberTheCheck(input.runId, note)
      return note
    }
  }

  // A REBUTTAL THE WORKER HAS JUST ANSWERED BY REWORKING IT. Criterion C29: the worker fixes what
  // is missing and says its work is finished again, and that sends the run back to being checked.
  // This is the office's act at that moment. It marks the refusal answered, which is what takes the
  // run out of rebuttal, and then falls through to ask for a fresh check exactly as a first finish
  // does. Nothing here is the worker's word about its own state: the worker patched `state`, and
  // what that means is decided here.
  const standingRefusal = aRefusalStandsOn(run)
  if (standingRefusal) {
    markARefusalAnswered(run, 'The worker said its work was finished again after the refusal, so the office asked for a fresh ' +
      'check. The refusal stays on the record: it is what the rework answered.')
  }

  // ALREADY ASKED, AND NOT A REWORK. The field this writes is also what says it has been written.
  const already = theCheckAskedFor(run)
  if (already !== null && readWorkerCheckNotAsked(run.data) === null && already.eligibility?.eligible !== false && !standingRefusal) return already

  const worker = theAgentOfARun(run)
  const checkout = theRunsCheckout(run)
  const inspector = whoHoldsTheInspectorCard()
  const askedAt = nowStamp()

  if (inspector === null) {
    const owner = worker !== null ? whoIsToldOfTheRun(worker) : null
    const starter = owner !== null && 'to' in owner ? owner.to : null
    const message =
      starter === null
        ? null
        : writeAMessage({
            workspaceId: input.workspaceId,
            to: [starter],
            title: `${theNameOfAnAgentOr(worker, 'A run')} says its work is finished and no inspector is appointed`,
            notice: 'noInspectorCheckItYourself',
            aboutRun: input.runId,
            actor: THE_OFFICE,
            body:
              `Run ${input.runId} — ${run.title} — says its work is finished. Nobody released it, and no ` +
              'inspector is appointed: no agent holds the inspector card, so the office started no check and ' +
              'nothing is checking it.\n\n' +
              'A subagent saying it is done does not end it. Two things may: you check it yourself, or an ' +
              'inspector checks it. Until one of them happens this run reads as a finish nobody released.\n\n' +
              'Appointing an inspector is the person\'s act and not yours: only the person gives that card. Ask the person, ' +
              'or check the run yourself and release it.',
          })
    const said: TheCheckTheOfficeAskedFor = {
      askedAt,
      ...(message === null ? {} : { message }),
      checkout: whereItIs(checkout),
      says:
        'Nobody holds the inspector card, so no check was started. The finish is recorded and reads as one ' +
        'nobody released. ' +
        (message === null
          ? owner !== null && 'because' in owner ? owner.because : 'Nothing is recorded as having started this run\'s agent, so there was nobody to tell either.'
          : `${starter === null ? 'Nobody' : theNameAPersonReads(starter)} was told, in message ${message}.`),
    }
    rememberTheCheck(input.runId, said)
    return said
  }

  const group = groupForTheRun(run)
  if (group !== null && !isAMember(group, { kind: 'agent', id: inspector.id })) {
    addAMember(group, { kind: 'agent', id: inspector.id }, 'The inspector reads the check notices for this run.')
  }
  // A SCOPED CHECK SAYS SO IN THE NOTICE AND ON THE RUN, so the worker that starts the tool and the
  // person reading the run both see that this check judges some paths and carries the rest.
  const scope = input.scope
  const scopeSays =
    scope === undefined
      ? ''
      : ` It is a scoped check of ${String(scope.only.length)} path${scope.only.length === 1 ? '' : 's'} (${scope.only.join(', ')})` +
        (scope.needsJudgment.length === 0
          ? '; the other changed paths keep an earlier verdict.'
          : `, of which ${String(scope.needsJudgment.length)} ${scope.needsJudgment.length === 1 ? 'was' : 'were'} handed on by a checker tool; the other changed paths keep an earlier verdict.`)
  // WHETHER ANYTHING IN THIS OFFICE WOULD START THE CHECK, read at the ask (wave 13n round DP). When nothing would, the notice
  // and the run say so in the same sentence, in the past tense, with the time and who can start it, and the run keeps the
  // mark the minute pass reads an hour on.
  const willItStart = whetherThisOfficeWouldStartThisRunCheck(input.workspaceId, input.runId)
  const message = writeAMessage({
    workspaceId: input.workspaceId,
    to: [{ kind: 'agent', id: inspector.id }],
    ...(group === null ? {} : { toGroup: group }),
    title: `The office queued a ${scope === undefined ? '' : 'scoped '}check of ${theNameOfAnAgentOr(worker, input.runId)}`,
    notice: 'aCheckWasQueued',
    aboutRun: input.runId,
    actor: THE_OFFICE,
    body: (willItStart.starts
      ? `The office will run the check tool for run ${input.runId}, serving ${theNameAPersonReads({ kind: 'agent', id: inspector.id })}. ` +
        'The check runs in its own worktree and its result will be recorded here.'
      : aCheckNothingStartsSays(theNameAPersonReads({ kind: 'agent', id: inspector.id }), askedAt, willItStart)) + scopeSays +
      (input.askedAgainFrom === undefined ? '' : ` It was asked again after ${input.askedAgainFrom.message} answered with no verdict.`),
  })
  if (input.askedAgainFrom !== undefined) sayWhereADeliveryStands(message, { kind: 'agent', id: inspector.id }, {
    because: `asked again after ${input.askedAgainFrom.message} answered with no verdict`,
  })
  // A RESEAL OF A REFUSED RUN IS TOLD TO WHOEVER FILED THE REFUSED CHECK (problem oSbOIC2Jypn0), directly and as the
  // office, never in a group: the answer for wave 13y (message LA1ZbbRWX9sj). It asks for the check, so its kind
  // wakes (the name wave 13y gave it, message uFwR6-TEwZgb).
  const told = standingRefusal ? whoFiledTheRefusedCheck(run, inspector) : []
  const tellings = told.map((who) => ({
    who,
    message: writeAMessage({
      workspaceId: input.workspaceId,
      to: [who],
      onlyThem: true,
      title: `A refused run was sealed again and needs a check: ${theNameOfAnAgentOr(worker, input.runId)}`,
      notice: 'aResealAsksForACheck',
      aboutRun: input.runId,
      actor: THE_OFFICE,
      body: `Run ${input.runId} — ${run.title} — was refused, and it has been sealed again. You filed the check that ` +
        `refused it, so the office tells you: please start a fresh check of it. The office queued that check for ` +
        `${theNameAPersonReads({ kind: 'agent', id: inspector.id })} in message ${message}.`,
    }),
  }))
  const toldSays = tellings.map((one) => ` ${theNameAPersonReads(one.who)}, who filed the refused check, was told in message ${one.message}.`).join('')
  const said: TheCheckTheOfficeAskedFor = {
    askedAt, askedOf: inspector.handle, message, checkout: whereItIs(checkout),
    ...(input.askedAgainFrom === undefined ? {} : { askedAgainFrom: input.askedAgainFrom }),
    ...(scope === undefined ? {} : { only: [...scope.only], needsJudgment: scope.needsJudgment.map((one) => ({ path: one.path, why: one.why })) }),
    says: `${willItStart.starts ? aCheckThatWillStartSays(theNameAPersonReads({ kind: 'agent', id: inspector.id })) : aCheckNothingStartsSays(theNameAPersonReads({ kind: 'agent', id: inspector.id }), askedAt, willItStart)}${scopeSays}${toldSays}`,
  }
  rememberTheCheck(input.runId, said)
  if (!willItStart.starts) {
    markThatNothingStartsTheCheck(input.runId, {
      message, askedAt, inspector: inspector.handle, because: willItStart.because, tellAfterMs: Date.now() + A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS,
    })
  }
  return said
}

/**
 * A REFUSAL STANDS ON THIS RUN: it was refused, and no rework has answered the refusal yet. One reading, used where
 * the office asks for a check again (`theOfficeStartsTheCheck`) and where the record door decides that a reseal is a
 * rework (src/server/api/records.ts, problem oSbOIC2Jypn0).
 */
export function aRefusalStandsOn(run: Pick<PanelRecord, 'id' | 'data'>): boolean {
  const refused = whereARunStands(run).refused
  return refused !== null && (refused.reworked ?? null) === null
}

/** Mark a standing refusal answered, retaining the refusal and its history. */
export function markARefusalAnswered(run: Pick<PanelRecord, 'id' | 'data'>, because: string): void {
  if (!aRefusalStandsOn(run)) return
  const held = run.data[REFUSED] as Record<string, unknown>
  asTheDoorOf('refused', () => patchRecord(run.id, {
    dataPatch: { [REFUSED]: { ...held, reworked: { at: nowStamp(), because } } },
  }, THE_OFFICE))
}

/**
 * WHOEVER FILED THE REFUSED CHECK'S SESSION. Problem oSbOIC2Jypn0: on 29 September a refused run was resealed and the
 * only note of it went to the refusal's group. The agent that files the checks was not in that group, so the check
 * waited two hours unasked.
 *
 * It is read from the change log, one recorded step at a time: the refusal's message (`check` on the refusal) was
 * written under the check's own session; that session's first change row names who filed it. The office and the
 * inspector are left out: the office files nothing it must be told about, and the inspector is asked by the queued
 * check's own message. Nothing recorded at any step answers an empty list, and nobody is guessed.
 */
function whoFiledTheRefusedCheck(run: PanelRecord, inspector: RegisteredAgent): ParticipantRef[] {
  const message = isObject(run.data) && isObject(run.data[REFUSED]) ? run.data[REFUSED]['check'] : undefined
  if (typeof message !== 'string') return []
  const written = sqlite.prepare("SELECT session_id AS session FROM changes WHERE record_id = ? AND op = 'create' AND session_id IS NOT NULL LIMIT 1")
    .get(message) as { session?: string } | undefined
  const sessionId = written?.session === undefined ? null : resolveSessionRef(written.session, run.workspaceId).recordId
  if (sessionId === null) return []
  const filed = sqlite.prepare("SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? AND op = 'create' LIMIT 1")
    .get(sessionId) as { type?: string; id?: string } | undefined
  if (filed?.id === undefined) return []
  const who = participantForActor({ type: filed.type ?? '', id: filed.id })
  if (who === null || isTheSame(who, { kind: 'agent', id: inspector.id }) || filed.id === THE_OFFICE.id) return []
  // A RETIRED AGENT IS NOT WRITTEN TO: the message door refuses it, because nobody would read it.
  const row = who.kind === 'agent' ? readParticipant(who) as RegisteredAgent | null : null
  if (row?.retired === true) return []
  return [who]
}

/**
 * THE OFFICE TELLS THE SECRETARY, AT THE LEVELS THAT HAVE NO INSPECTOR.
 *
 * IT STARTS NO INSPECTOR AND ASKS FOR NO CHECK. That is the whole of what the level changes about
 * the office's act. The run is still sealed at the finish door (the seal stays and blocks nobody at
 * any level), and the finish is still recorded as unreleased until
 * somebody answers for it.
 *
 * WHAT THE SECRETARY IS ASKED FOR DIFFERS BY LEVEL, and the two are separate steps rather than a shade of
 * one thing. At `light` the report goes to the secretary, who answers it: F12's step 5, where the report is handed in
 * and waits for the secretary's approval. At `none` there is no report step and the secretary confirms the finished run itself.
 *
 * NOBODY HOLDING THE CARD IS SAID OUT LOUD rather than fixed here. The office cannot appoint a
 * secretary; that card is the person's to give, exactly as the inspector's is. A run in that state
 * reads as a finish nobody has answered for, which is what it is.
 */
function theOfficeTellsTheSecretary(
  run: PanelRecord,
  workspaceId: string,
  level: ReviewLevel,
): TheCheckTheOfficeAskedFor {
  const askedAt = nowStamp()
  const worker = theAgentOfARun(run)
  const checkout = whereItIs(theRunsCheckout(run))
  const secretary = whoHoldsTheSecretaryCard()
  const whoSaysWhat =
    level === 'none'
      ? 'confirm this finished run, which is what this project asked for at the level None'
      : 'answer the report of this finished run, which is what this project asked for at the level Light'

  if (secretary === null) {
    const said: TheCheckTheOfficeAskedFor = {
      askedAt,
      checkout,
      reviewLevel: level,
      says:
        `This project's review level is ${REVIEW_LEVEL_WORDS[level]}, so the office started no check. ` +
        `${REVIEW_LEVEL_SAYS[level]}. Nobody holds the secretary card, so there was nobody to tell either: ` +
        'the finish is recorded and reads as one nobody has answered for. Giving that card is the person\'s act.',
    }
    rememberTheCheck(run.id, said)
    return said
  }

  const group = groupForTheRun(run)
  if (group !== null && !isAMember(group, { kind: 'agent', id: secretary.id })) {
    addAMember(group, { kind: 'agent', id: secretary.id }, 'The secretary answers for this run, which has no inspector.')
  }
  const message = writeAMessage({
    workspaceId,
    to: [{ kind: 'agent', id: secretary.id }],
    ...(group === null ? {} : { toGroup: group }),
    title: `${theNameOfAnAgentOr(worker, run.id)} says its work is finished, and this project has no inspector`,
    notice: 'noInspectorTellTheSecretary',
    aboutRun: run.id,
    actor: THE_OFFICE,
    body:
      `Run ${run.id} — ${run.title} — says its work is finished. This project's review level is ` +
      `${REVIEW_LEVEL_WORDS[level]}, so the office started no check: ${REVIEW_LEVEL_SAYS[level].toLowerCase()}.\n\n` +
      `You are being asked to ${whoSaysWhat}.\n\n` +
      'The work is sealed as it always is, and the seal blocks nobody. What is not here is an inspector: ' +
      'nothing has checked this run against the office regulations, and confirming it does not say anything has.',
  })
  const said: TheCheckTheOfficeAskedFor = {
    askedAt,
    askedOf: secretary.handle,
    message,
    checkout,
    reviewLevel: level,
    says:
      `This project's review level is ${REVIEW_LEVEL_WORDS[level]}, so the office started no check and told ` +
      `${theNameAPersonReads({ kind: 'agent', id: secretary.id })}, who holds the secretary card, in message ${message}. ${REVIEW_LEVEL_SAYS[level]}.`,
  }
  rememberTheCheck(run.id, said)
  return said
}

/** The conversation that already holds this run, when it belongs to a group. */
function groupForTheRun(run: PanelRecord): string | null {
  const messageId = said(run.data['deliveringMessage'])
  const message = messageId === null ? null : getRecord(messageId)
  return said(message?.data['toGroup']) ?? groupOpenedFor(run.id)?.id ?? null
}

/** A queued tool is selected from the office's stored request, never from message prose. */
export function inspectionForMessage(
  messageId: string,
  agent: string,
  workspaceId: string,
  aboutRun?: string | null,
  agents?: () => readonly RegisteredAgent[],
): { run: string; checkout: string | null; only?: string[]; needsJudgment?: PathThatNeedsJudgment[] } | null {
  const asked = theInspectionForMessage(messageId, agent, workspaceId, aboutRun, agents)
  if (asked === null) return null
  const { run, check } = asked
  // THE SCOPE TRAVELS WITH THE JOB, so the worker starts the tool with `--only` and `--needs-judgment`
  // exactly as the office asked, and a scoped check can never be run as a whole one by mistake.
  return {
    run: run.id,
    checkout: theRunsCheckout(run).directory,
    ...(Array.isArray(check.only) ? { only: [...check.only] } : {}),
    ...(Array.isArray(check.needsJudgment) ? { needsJudgment: check.needsJudgment.map((one) => ({ path: one.path, why: one.why })) } : {}),
  }
}

/** Whether this is a queued check needs no checkout, Git object, or scope reconstruction. */
export function isInspectionForMessage(messageId: string, agent: string, workspaceId: string, aboutRun?: string | null): boolean {
  return theInspectionForMessage(messageId, agent, workspaceId, aboutRun) !== null
}

/** The same inspection answer using run records already read for this request. */
export function isInspectionForMessageWithRuns(
  messageId: string, agent: string, workspaceId: string, aboutRun: string | null,
  runs: ReadonlyMap<string, PanelRecord>,
): boolean {
  return theInspectionForMessage(messageId, agent, workspaceId, aboutRun, undefined, (id) => runs.get(id) ?? null, false) !== null
}

/** One matcher for the queue's full inspection and the press's yes/no reading. A settled run's ask is no check. */
function theInspectionForMessage(messageId: string, agent: string, workspaceId: string, aboutRun?: string | null, agents?: () => readonly RegisteredAgent[], readRun: (id: string) => PanelRecord | null = getRecord, fullWords = true) {
  const asked = theAskAndItsRun(messageId, agent, workspaceId, aboutRun, readRun)
  return asked === null || howTheAskedRunWasSettled(asked.run, asked.check, agents, fullWords) !== null ? null : asked
}

/** The run this message asks a check of, and the ask, while the ask is the run's own, unstarted and of this agent. */
function theAskAndItsRun(messageId: string, agent: string, workspaceId: string, aboutRun?: string | null, readRun: (id: string) => PanelRecord | null = getRecord) {
  const runId = aboutRun === undefined ? said(getRecord(messageId)?.data['aboutRun']) : aboutRun
  const run = runId === null ? null : readRun(runId)
  if (!run || run.workspaceId !== workspaceId) return null
  const check = theCheckAskedFor(run)
  if (!check || check.message !== messageId || check.execution || check.askedOf !== agent) return null
  return { run, check }
}

/**
 * HOW THE RUN AN UNSTARTED ASK IS FOR WAS SETTLED, in the run's own sentence, or null because it is not settled.
 *
 * A run released, superseded, closed unchecked, confirmed, ended with its merge entry, needing no check, or landed by
 * hand is settled, and a check of it would spend a check on nothing. So is a run whose refusal was written after this
 * ask: the refusal answered it. The office marks a refusal reworked before it asks again, so a refusal that still
 * stands and is not later than the ask is a check of an older ask that raced a rework, and the ask stays a check. So
 * does an ask whose moment or whose refusal's moment cannot be read.
 */
function howTheAskedRunWasSettled(run: PanelRecord, check: TheCheckTheOfficeAskedFor, agents?: () => readonly RegisteredAgent[], fullWords = true): string | null {
  // The yes/no reader needs the same standing, but not the names and confirmation details in its sentence.
  const stands = fullWords ? whereARunStands(run, agents) : howARunStands(run.data)
  const closed = stands.standing === 'closed unchecked' || stands.standing === 'superseded' || stands.standing === 'closed' || stands.standing === 'reporting'
  const answered = (() => {
    if (stands.standing !== 'rebuttal' || stands.refused === null) return false
    const refusedAt = parseAnyStamp(stands.refused.at)
    const askedAt = parseAnyStamp(check.askedAt)
    return refusedAt !== null && askedAt !== null && refusedAt.getTime() > askedAt.getTime()
  })()
  return closed || answered || stands.landedByHand !== null ? stands.says : null
}

/**
 * WHY THIS MESSAGE NEEDS NO CHECK, or null because it is not the unstarted ask of a settled run. The queue gives it as
 * the row's reason. The needs-no-run door and the checks-only reading with markDelivered=1 ask it again about the
 * stored message before writing it beside the delivery: the run, that it is settled, that no check was started, and how.
 */
export function whyAnAskNeedsNoCheck(messageId: string, agent: string, workspaceId: string, aboutRun?: string | null, agents?: () => readonly RegisteredAgent[]): string | null {
  const asked = theAskAndItsRun(messageId, agent, workspaceId, aboutRun)
  const how = asked === null ? null : howTheAskedRunWasSettled(asked.run, asked.check, agents)
  return how === null ? null : `This message asked for a check of run ${asked!.run.id}, and that run is settled, so no check was started for it. How it was settled: ${how}`
}

/**
 * WHY AN ASK A NEWER ASK REPLACED NEEDS NO CHECK, or null because this message is not such an ask. Asking for a check
 * again writes a new ask, and the run's check names the new one, while the old ask can still be queued. Only the run's
 * check says which ask is current, so a replaced ask is the office's ask for a check whose run's check names another
 * ask. The sentence says what is true now and not what happened before: a check started for an ask marks only the
 * inspector's delivery, and the copy to the run's own agent can still be queued after that check ran.
 * `stored` is the message's data where the caller has read it already.
 */
export function whyAReplacedAskNeedsNoCheck(messageId: string, workspaceId: string, stored?: Record<string, unknown>): string | null {
  const data = stored ?? getRecord(messageId)?.data
  if (data?.['notice'] !== 'aCheckWasQueued') return null
  const runId = said(data['aboutRun'])
  const run = runId === null ? null : getRecord(runId)
  if (!run || run.workspaceId !== workspaceId) return null
  const newer = theCheckAskedFor(run)?.message
  if (newer === undefined || newer === messageId || getRecord(newer)?.data['notice'] !== 'aCheckWasQueued') return null
  return `This message asked for a check of run ${run.id}, and a newer ask, message ${newer}, replaced it. No check is started for this message.`
}

/**
 * THE AGENT A CHECK WAS ASKED OF, AS AN ADDRESS FOR A MESSAGE.
 *
 * `askedOf` is stored as the agent's handle, and a message is addressed by the agent's registry id.
 * The stored string is read with the stored-reference reader. Where it names no agent, or more than
 * one, this refuses in words before anything is written, rather than send the message to nobody.
 */
function theAgentTheCheckWasAskedOf(check: TheCheckTheOfficeAskedFor, runId: string): ParticipantRef {
  const askedOf = check.askedOf ?? null
  const named = askedOf === null ? null : theOneAgentAStringNames(sqlite, askedOf)
  if (named === null) {
    throw new PanelError(
      askedOf === null
        ? `The check of run ${runId} does not say which agent it was asked of, so there is nobody to tell. Nothing was written.`
        : `The check of run ${runId} was asked of "${askedOf}", and that name does not lead to exactly one agent, so there is nobody to tell. Nothing was written.`,
      409,
    )
  }
  return { kind: 'agent', id: named.id }
}

export function recordCheckToolStarted(input: { run: string; session: string; log: string; model: string; minutes: number; workspaceId: string }): TheCheckTheOfficeAskedFor {
  const run = getRecord(input.run)
  const tool = getRecord(input.session)
  const check = run === null ? null : theCheckAskedFor(run)
  if (!run || run.workspaceId !== input.workspaceId || !tool || tool.workspaceId !== input.workspaceId ||
      !check || tool.data['deliveringMessage'] !== check.message || tool.data['runtime'] !== 'inspection-tool') {
    throw new PanelError('This is not the office tool run for this check.', 409)
  }
  if (check.execution && check.execution.session !== input.session) throw new PanelError('Another tool run already owns this check.', 409)
  const inspector = theAgentTheCheckWasAskedOf(check, run.id)
  const execution = { session: input.session, log: input.log, model: input.model, minutes: input.minutes }
  patchRecord(tool.id, { dataPatch: { model: input.model, extra: { ...(isObject(tool.data['extra']) ? tool.data['extra'] : {}), purpose: 'inspection', inspectionRun: input.run, inspectionMinutes: input.minutes, log: input.log } } }, THE_OFFICE)
  const updated = { ...check, execution, says: `The office started check ${input.session} as ${check.askedOf}. Model ${input.model}, ${input.minutes} minutes. Log: ${input.log}.` }
  rememberTheCheck(run.id, updated)
  const eligibility = checkEligibilityForRun(run.id, input.workspaceId)
  if (!eligibility.eligible) {
    const reason = noCheckSentenceFrom(eligibility.says, eligibility.nextAct, sayInEnglish)
    recordCheckToolEnded(run.id, input.session, reason, input.workspaceId)
    throw new PanelError(reason, 409)
  }
  writeAMessage({ workspaceId: input.workspaceId, to: [inspector],
    ...(groupForTheRun(run) === null ? {} : { toGroup: groupForTheRun(run)! }),
    title: 'The office started the check', body: updated.says, aboutRun: run.id, actor: THE_OFFICE, notice: 'theCheckStarted' })
  return updated
}

/** The ending is read from the verdict on the target run, never from the tool's prose. */
export function recordCheckToolEnded(runId: string, session: string, reason: string, workspaceId: string, ending?: 'no-verdict', onAlreadyStored?: () => void): { failed: boolean; says: string; askedAgain?: string } {
  const run = getRecord(runId)
  if (!run || run.workspaceId !== workspaceId) throw new PanelError('No such checked run in this project.', 404)
  let check = theCheckAskedFor(run)
  const current = check?.execution?.session === session
  if (!current) {
    // A worker can rework a refusal while the previous tool is still exiting. Its original
    // request remains in the existing revision history and owns that tool's ending.
    const history = sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? ORDER BY seq DESC').all(runId) as { data: string }[]
    check = history.map((row) => theCheckAskedFor({ data: JSON.parse(row.data) as Record<string, unknown> }))
      .find((previous) => previous?.execution?.session === session) ?? null
  }
  if (check?.execution?.session !== session) throw new PanelError('This tool run was not recorded for this check.', 409)
  const execution = check.execution
  const tool = getRecord(session)
  const extra = isObject(tool?.data['extra']) ? tool.data['extra'] : {}
  const prior = isObject(extra['inspectionEnding']) ? extra['inspectionEnding'] : null
  if (prior) {
    onAlreadyStored?.()
    return { failed: prior['failed'] === true, says: String(prior['says']), ...(typeof prior['askedAgain'] === 'string' ? { askedAgain: prior['askedAgain'] } : {}) }
  }
  if (execution.endedAt) {
    onAlreadyStored?.()
    return { failed: execution.failed !== undefined, says: check.says }
  }
  const inspector = theAgentTheCheckWasAskedOf(check, runId)
  // The office's verdict write carries the checker session. Another checker releasing the
  // same run is never evidence that this tool returned a verdict.
  const verdictRow = sqlite.prepare(
    "SELECT field FROM changes WHERE record_id = ? AND session_id = ? AND actor_id = 'mole-office/the-api-server' " +
    "AND (field = 'data.released' OR field LIKE 'data.released.%' OR field = 'data.refused' OR field LIKE 'data.refused.%') ORDER BY rowid DESC LIMIT 1",
  ).get(runId, session) as { field: string } | undefined
  const verdict = verdictRow?.field.startsWith('data.released') ? 'released' : verdictRow?.field.startsWith('data.refused') ? 'refused' : null
  const failed = verdict === null
  const standing = whereARunStands(run).standing
  const next: CheckFailedNext = current && standing === 'inspecting' ? { stays: true } : current ? { now: standing } : { newer: true }
  // A failure with no new ask keeps the ordinary failure sentence. A queued repeat has its own
  // sentence because asking somebody to restart a check the office already queued would be false.
  let says = failed
    ? theCheckFailedSays(reason, next, sayInEnglish)
    : `The office check ${session} ${verdict} run ${runId}.`
  if (current) rememberTheCheck(runId, { ...check, execution: { ...execution, endedAt: nowStamp(), ...(failed ? { failed: reason } : {}),
    ...(ending === undefined ? {} : { ending }) }, says })
  const repeat = failed && current && ending === 'no-verdict' ? askOnceMoreAfterNoVerdict(runId, session, workspaceId) : null
  const askedAgain = repeat !== null && 'askedAgain' in repeat ? repeat.askedAgain : undefined
  if (askedAgain !== undefined) says = theCheckFailedSays(reason, next, sayInEnglish, askedAgain)
  if (tool) patchRecord(session, { dataPatch: { extra: { ...extra, inspectionEnding: { failed, says, at: nowStamp(),
    ...(ending === undefined ? {} : { ending }), ...(askedAgain === undefined ? {} : { askedAgain }) } } } }, THE_OFFICE)
  if (askedAgain === undefined) {
    writeAMessage({ workspaceId, to: [inspector],
      ...(groupForTheRun(run) === null ? {} : { toGroup: groupForTheRun(run)! }),
      title: verdict === null ? 'The check failed' : `The check ${verdict} the run`, body: says, aboutRun: runId, actor: THE_OFFICE,
      notice: failed ? 'theCheckFailed' : 'theCheckEnded' })
  }
  if (repeat !== null && 'firstSession' in repeat) {
    const secretary = whoHoldsTheSecretaryCard()
    if (secretary !== null) writeASystemLineToOne({ kind: 'agent', id: secretary.id }, workspaceId,
      SYSTEM_LINES.aCheckGaveNoVerdictTwice(runId, repeat.firstSession, session), THE_OFFICE, { run: runId })
    fileTheProblemOfTwoChecksWithNoVerdict(run, repeat.firstSession, session, extra)
  }
  return { failed, says, ...(askedAgain === undefined ? {} : { askedAgain }) }
}

/**
 * A SECOND CHECK OF A RUN THAT ENDED WITH NO VERDICT FILES A PROBLEM FOR THE RUN'S STARTER (round BL, item 2ao). The office
 * asks nothing more after it, and the secretary's one quiet line stays. Until this round the starter heard nothing, and a
 * verdict the check tool refused before posting it sat on two session records that nobody was pointed at.
 *
 * The problem quotes what each check session kept under THE_UNPOSTED_VERDICT (src/config/inspection-ending.mjs), word for
 * word, or says that the session kept none. `secondExtra` is the second session's `extra` as it was read before the office
 * wrote its ending there. The problem reaches the starter by one message that wakes. A run whose starter the office cannot
 * name still gets the problem, and no message is sent.
 */
function fileTheProblemOfTwoChecksWithNoVerdict(run: PanelRecord, first: string, second: string, secondExtra: Record<string, unknown>): void {
  const firstRecord = getRecord(first)
  const quote = (session: string, extra: unknown): string => {
    const stored = isObject(extra) ? extra[THE_UNPOSTED_VERDICT] : undefined
    if (stored === undefined) return `Check session ${session} kept no verdict words.`
    const kept = theUnpostedVerdictAsTheToolWritesIt(stored)
    if (kept === null) return `Check session ${session} kept verdict words in a shape the check tool does not write. They are, word for word:\n${JSON.stringify(stored, null, 2)}`
    return `Check session ${session} kept the verdict its check tool refused before posting it. The verdict, word for word:\n${kept.verdict}\n` +
      `The tool's refusals, word for word:\n${kept.refusals.map((one) => `- ${one}`).join('\n')}` +
      (kept.answer === null ? '' : `\nWhat the model answered when asked, word for word:\n${kept.answer}`)
  }
  const symptom = `Check sessions ${first} and ${second} of run ${run.id} both ended with no verdict, and the run stays inspecting. ` +
    `Nothing starts again by itself.\n\n${quote(first, firstRecord?.data['extra'])}\n\n${quote(second, secondExtra)}`
  const agent = theAgentOfARun(run)
  const told = agent === null ? null : whoIsToldOfTheRun(agent)
  sqlite.transaction(() => {
    const problem = createRecordWithReport({
      kind: 'problem',
      title: `Two checks of run ${run.id} ended with no verdict`,
      workspaceId: run.workspaceId,
      data: { symptom, state: 'open', whose_move: 'agent', found_by: 'the office, when the second check of the run ended with no verdict' },
      links: [{ type: 'about', toId: run.id }],
      actor: THE_OFFICE,
      bindCallerSession: false,
      // NEITHER LIST OF TITLES ALREADY FILED. Nothing this write gives back is kept.
      namesWhatIsAlreadyFiled: false,
    }).record
    if (told !== null && 'to' in told) {
      writeAMessage({ workspaceId: run.workspaceId, to: [told.to], title: problem.title,
        body: `Problem ${problem.id}. Check sessions ${first} and ${second} of run ${run.id} both ended with no verdict. The problem says what each session kept.`,
        aboutRun: run.id, actor: THE_OFFICE, onlyThem: true, notice: 'aNoVerdictProblemWasFiled' })
    }
  })()
}

/** What a check session kept under THE_UNPOSTED_VERDICT, in the shape tools/the-inspector.mjs writes it, or null when it is in another. */
function theUnpostedVerdictAsTheToolWritesIt(stored: unknown): { verdict: string; answer: string | null; refusals: string[] } | null {
  if (!isObject(stored) || typeof stored['verdict'] !== 'string') return null
  const answer = stored['answer'] ?? null
  const refusals = stored['refusals']
  if ((answer !== null && typeof answer !== 'string') || !Array.isArray(refusals) || !refusals.every((one): one is string => typeof one === 'string')) return null
  return { verdict: stored['verdict'], answer, refusals }
}

/**
 * One stored link allows one automatic repeat. Both retry paths use the same guards before clearing
 * the check. If the ordinary asking door cannot file a new ask, its writes are rolled back so the
 * failed check and its delivery keep their meaning.
 */
function askOnceMoreAfterNoVerdict(runId: string, session: string, workspaceId: string): { askedAgain: string } | { firstSession: string } | null {
  const run = getRecord(runId)
  const check = run === null ? null : theCheckAskedFor(run)
  if (!run || !check?.message || check.execution?.session !== session) return null
  try { requireTheCheckMayBeAskedAgain(run, workspaceId) }
  catch (why) { if (why instanceof PanelError) return null; throw why }
  if (whereARunStands(run).standing !== 'inspecting') return null
  if (check.askedAgainFrom !== undefined) return { firstSession: check.askedAgainFrom.session }
  const noAsk = Symbol('The ordinary check door filed no new ask')
  try {
    return sqlite.transaction(() => {
      patchRecord(runId, { dataPatch: { [THE_CHECK]: null } }, THE_OFFICE)
      const asked = theOfficeStartsTheCheck({ runId, workspaceId, actor: THE_OFFICE,
        askedAgainFrom: { message: check.message!, session },
        ...(check.only === undefined ? {} : { scope: { only: check.only, needsJudgment: check.needsJudgment ?? [] } }),
      })
      if (!asked?.message || !asked.askedOf || (asked.reviewLevel !== undefined && asked.reviewLevel !== 'full')) throw noAsk
      sayWhereADeliveryStands(check.message!, theAgentTheCheckWasAskedOf(check, runId), {
        mark: 'delivered', because: `answered with no verdict; asked again as ${asked.message}`,
      })
      return { askedAgain: asked.message }
    })()
  } catch (why) {
    if (why === noAsk || why instanceof PanelError) return null
    throw why
  }
}

export function askForTheCheckAgain(runId: string, workspaceId: string, actor: Actor, onNothingToCheck?: () => void): TheCheckTheOfficeAskedFor | null {
  const run = getRecord(runId)
  if (!run || run.workspaceId !== workspaceId) throw new PanelError('No such run in this project.', 404)
  const starter = theAgentOfARun(run)?.startedBy
  // An agent's headers name its handle and startedBy holds a registry id, so the agent's own key is
  // what proves it is the starter, as at the held-check release.
  const theStarterAsks = starter?.kind === 'agent' && (theAgentTheKeyProves(actor) === starter.id || starter.id === actor.id)
  let counted = false
  if (actor.type !== 'human' && !theStarterAsks) {
    const gate = gateMet('who-asks-for-a-check-again')
    counted = true
    if (gate === 'block') throw new PanelError('Only this run’s starter can ask for its check again.', 403)
  }
  requireTheCheckMayBeAskedAgain(run, workspaceId)
  const cleared = patchRecord(runId, { dataPatch: { [THE_CHECK]: null } }, THE_OFFICE)
  const asked = theOfficeStartsTheCheck({ runId, workspaceId, actor })
  if (!counted && cleared.nothingWritten && asked === null) onNothingToCheck?.()
  return asked
}

/** Both explicit and automatic asks keep settlements and eligibility intact before replacing a check. */
function requireTheCheckMayBeAskedAgain(run: PanelRecord, workspaceId: string): void {
  const runId = run.id
  const check = theCheckAskedFor(run)
  if (check?.execution && !check.execution.endedAt) throw new PanelError('This check is still running.', 409)
  if (whereARunStands(run).closedUnchecked !== null) throw new PanelError(`Run ${runId} is closed unchecked. Nothing was written.`, 409)
  // A SETTLED RUN IS NOT CHECKED AGAIN (problem 5Sxsr68-_m8m; wave 13k round 7). A run a later run superseded, or whose
  // content reached main by hand, is closed, so no check would start. Round 6 dropped every other key of the old check
  // around the settlement instead, and the session kind refuses a check with no asking, so the starter was answered 400
  // about fields they never sent. It is refused in words, nothing is written, and only the settlement's door changes it.
  const before = isObject(run.data[THE_CHECK]) ? run.data[THE_CHECK] : {}
  // A RUN THAT HOLDS NO CHECK KEEPS ITS SUPERSEDED MARK ON ITSELF (problem FuHKnNDBzrXW), so the mark is read by its one reader.
  const overtaken = theSupersededOn(run.data)
  const settlement = SETTLEMENTS_ON_THE_CHECK.find((key) => isObject(before[key])) ?? (overtaken === null ? undefined : 'superseded')
  if (settlement !== undefined) {
    const held = before[settlement] as Record<string, unknown> | undefined
    const what = settlement === 'superseded'
      ? `run ${String(overtaken?.by)} superseded it`
      : `its content reached main by hand, in ${String(held?.['commit']).slice(0, 12)}`
    throw new PanelError(
      `Run ${runId} is settled: ${what}. A settled run is closed, so a check asked again would start nothing, and the ` +
        'settlement stays as its own door wrote it. Nothing was written.',
      409,
    )
  }
  requireCheckEligibility(run.id, workspaceId)
}

// ============================================================ what one assembly measured

/** Where what an assembly measured lives on a run. */
const WHAT_IT_WOULD_READ = 'whatTheCheckWouldRead'

/**
 * WHAT ONE ASSEMBLY OF THE CHECK PROMPT MEASURED. Criterion C28's second half.
 *
 * A user is never asked to run a command in a terminal; everything can be done inside Mole Office. The
 * tool prints these five things on `--dry` and they were only ever readable in the terminal it was
 * printed to. They are the answer to *what will this check actually read*, which is the question a
 * person asks before letting one run.
 */
export interface WhatTheCheckWouldRead {
  /** Distinguishes repeated assemblies even within one wall-clock second. */
  assemblyId?: string
  /** When it was assembled, in local time. */
  at: string
  /** The prompt's size in bytes. */
  bytes: number
  /** What the whole code of law at full would have been, which is the saving. */
  wholeCodeBytes: number
  /** Every chapter written out further, with the level and the bytes it took. */
  chaptersAt: { chapter: number; level: string; bytes: number }[]
  /** The paths inside the work area, which the check reads. */
  inside: string[]
  /** The paths outside it, which the check names and does not read. */
  outside: string[]
  /** The commit the changes were read against, and how it was found. Absent because nobody said. */
  base?: TheBaseUsed
  /** Which worktree and which tip the check read. Criterion C30. Absent because nobody said. */
  read?: WhatWasRead
  /** The model and clock resolved for this assembly, including one-check overrides. */
  execution?: { model: string; minutes: number }
  /**
   * THE NEEDS-JUDGMENT PATHS AS THE CHECK'S TOOL ASKED AND AS THE CHECK USED THEM (wave 13j): a path the change does not
   * touch is dropped from the list. Absent: nobody handed a list, or the assembly is from before this was kept.
   */
  needsJudgment?: { asked: string[]; used: string[] }
  /**
   * GIT WORK ONLY: which way the plugin rule went. `plugin` is absent when the change
   * is not plugin-only. Absent as a whole on a files seal, and on an assembly from before wave 13x round 17.
   */
  pluginRule?: { plugin?: APluginOnlyChange; read: boolean; says: string }
  says: string
}

/**
 * THE SAME FACT, AS A RELEASE SPELLS IT.
 *
 * A stored record field says "nobody said" by leaving the key out, which is what `WhatWasRead` does
 * with `tip`. A release is READ BACK by `readRelease`, which answers every field, so what a reader
 * gets is `null`; but what is STORED must still omit the key, because the session shape declares
 * `read` optional and refuses a null outright. So this hands back a spread: the key with a value,
 * or nothing at all. Writing `read: null` here broke every release posted without one, and
 * tests/an-inspector-releases-or-refuses-in-one-act.test.ts is what said so.
 */
function asTheReleaseSpellsIt(read: WhatWasRead | null): { read?: NonNullable<Release['read']> } {
  if (read === null) return {}
  // adTmco_wIzln, note 52ZNPB44bOPb; USER.md invariants 2 and 5: preserve the named kind.
  return { read: { ...(read.sealKind === undefined ? {} : { sealKind: read.sealKind }), ...(read.sealId ? { sealId: read.sealId, sealHash: read.sealHash } : {}), ...(read.unsealed ? { unsealed: true } : {}), worktree: read.worktree, ...(read.tip === undefined ? {} : { tip: read.tip }), ofItsOwn: read.ofItsOwn, says: read.says, ...theScopeOfWhatWasRead(read),
    // A FILES SEAL'S TWO FACTS travel on the release, because the queue binds a modify's `before` to them.
    ...theFilesOfWhatWasRead(read) } }
}

/**
 * WHICH WORKTREE AND WHICH TIP A CHECK READ. Criterion C30.
 *
 * A check reads a detached worktree of its own at the run's tip, never the worker's own tree and
 * never the office's checkout. Whether it did is not something the server can see — nothing under
 * src/ reads a working tree — so the check says, and the record carries it. `ofItsOwn: false` is
 * therefore a real answer and not a gap: it says this check read somebody else's tree.
 *
 * ONE DECLARATION, IN src/shared/releasing.ts. This file carried its own copy of the same six
 * fields until 11 September 2026, which is two places that must agree with nothing making them
 * agree — the ninth invariant. It is re-exported here so every caller that reached for it through
 * this module still finds it.
 */
export type { WhatWasRead } from '@shared/releasing.ts'

/** What a run says the last assembly measured, or null because nobody has assembled one. */
export function whatTheCheckWouldRead(run: Pick<PanelRecord, 'data'>): WhatTheCheckWouldRead | null {
  const held = isObject(run.data) ? run.data[WHAT_IT_WOULD_READ] : undefined
  if (!isObject(held)) return null
  return held as unknown as WhatTheCheckWouldRead
}

/** The sentence for a run nobody has assembled a check for, which is not a run with nothing to read. */
export const NOBODY_HAS_ASSEMBLED_ONE =
  'Nobody has assembled a check for this run yet, so nothing here can say what one would read. The file list ' +
  'and the base need a checkout on disk, and nothing in this server reads a working tree: they are known only ' +
  'once a check has been assembled against one. This is a check nobody has looked at, not a check with nothing ' +
  'in it.'

/**
 * KEEP WHAT AN ASSEMBLY MEASURED ON THE RUN, so it can be read in Mole Office.
 *
 * It is the LAST assembly and not a list of them. A person asking what this check reads is asking
 * about the check that would run now, and a history of prompt sizes is a different question nobody
 * has asked.
 */
export function rememberWhatTheCheckWouldRead(input: {
  runId: string
  workspaceId: string
  prompt: TheInspectorsPrompt
  changes: ChangesInTheWorkArea
  base: TheBaseUsed | null
  /** The paths a checker tool handed on, as asked and as used, or null because nobody handed a list. */
  needsJudgment?: { asked: readonly PathThatNeedsJudgment[]; list: TheNeedsJudgmentList } | null
  read: WhatWasRead | null
  sessionId?: string | null
  execution?: { model: string; minutes: number }
  /** The seal the assembly door already read on the seal-read thread (`HowASealIsRead`). */
  readApart?: ASealReadApart
}): WhatTheCheckWouldRead {
  requireCheckEligibility(input.runId, input.workspaceId)
  const run = theRun(input.runId, input.workspaceId)
  // The check's reading is of the sealed commit, under any later commit of the worker's (problem Qrcr9t4iT2Id).
  const submission = theSealReadApartOrHere(input.runId, { underALaterCommit: true }, input.readApart)
  if (submission && (input.read?.sealId !== submission.id || input.read?.sealHash !== submission.seal.hash ||
      (submission.seal.git && (input.read?.tip !== submission.seal.git.commit || input.base?.ref !== submission.seal.git.forkBase)))) {
    throw new PanelError('The assembly does not match current seal ' + submission.id + ' and its fixed fork base.', 409)
  }
  // 8Rqdy6PXQnG2, inspector ab2Bj-DkFm7S on adTmco_wIzln; invariants 2, 8 and 9:
  // refuse rather than replace the sent kind, because a different kind means this reading
  // is not what the check believes it read. An absent kind makes no claim to compare.
  if (submission && input.read?.sealKind !== undefined && input.read.sealKind !== submission.seal.kind) {
    throw new PanelError(`The reading names seal kind ${input.read.sealKind}, but the seal's own kind is ${submission.seal.kind}.`, 409)
  }
  // WHAT THE CHECK SAYS IT READ MUST BE WHAT WAS ASSEMBLED, or the record would contradict itself: a
  // scope or a list in one half and not the other. Both come from the same caller, so a difference
  // is a broken caller, and it is refused rather than stored. The list it read is the list as used.
  const used = input.needsJudgment?.list.used ?? null
  const dropped = input.needsJudgment?.list.dropped ?? []
  const assembledScope = theScopeOfWhatWasRead({
    ...(input.changes.only === undefined ? {} : { only: input.changes.only }),
    ...(used === null ? {} : { needsJudgment: used }),
  })
  if (input.read !== null && JSON.stringify(theScopeOfWhatWasRead(input.read)) !== JSON.stringify(assembledScope)) {
    throw new PanelError(
      'What the check says it read does not match what was assembled: the scope (--only) or the needs-judgment ' +
        'list differs between `read` and the body. Nothing was written.',
      409,
    )
  }
  const inside = input.changes.inside.map((one) => one.path)
  const rule = input.changes.plugin
  const unread = rule !== undefined && !rule.read
  const said: WhatTheCheckWouldRead = {
    assemblyId: anOfficeId(),
    at: nowStamp(),
    bytes: input.prompt.bytes,
    wholeCodeBytes: input.prompt.wholeCodeBytes,
    chaptersAt: input.prompt.chaptersAt,
    inside,
    outside: [...input.changes.outside],
    ...(input.base === null ? {} : { base: input.base }),
    ...(input.read === null ? {} : { read: input.read }),
    ...(input.execution === undefined ? {} : { execution: input.execution }),
    ...(input.needsJudgment == null
      ? {}
      : { needsJudgment: { asked: input.needsJudgment.asked.map((one) => one.path), used: input.needsJudgment.list.used.map((one) => one.path) } }),
    ...(rule === undefined ? {} : { pluginRule: { ...(rule.plugin === null ? {} : { plugin: rule.plugin }), read: rule.read, says: rule.says } }),
    says:
      `${String(input.prompt.bytes)} bytes, where the whole of the office regulations at full would have been ` +
      `${String(input.prompt.wholeCodeBytes)}. ` +
      `${input.prompt.chaptersAt.length === 0 ? 'No chapter is' : `${String(input.prompt.chaptersAt.length)} chapter${input.prompt.chaptersAt.length === 1 ? ' is' : 's are'}`} ` +
      `written out further: ${input.prompt.chaptersAt.map((one) => `${String(one.chapter)} at ${one.level} (${String(one.bytes)} bytes)`).join(', ') || 'none'}. ` +
      (input.changes.only === undefined ? '' : `${aScopeInOneSentence(input.changes.only, input.changes.carried ?? [])} `) +
      `${String(inside.length)} changed file${inside.length === 1 ? '' : 's'} inside the work area ` +
      `${inside.length === 1 ? 'is' : 'are'} ${unread ? 'named and not read' : 'read'}; ${String(input.changes.outside.length)} outside it ` +
      `${input.changes.outside.length === 1 ? 'is' : 'are'} named and not read. ` +
      (rule === undefined || rule.plugin === null ? '' : `${rule.says} `) +
      (dropped.length === 0
        ? ''
        : `${String(dropped.length)} path${dropped.length === 1 ? '' : 's'} on the needs-judgment list ${dropped.length === 1 ? 'was' : 'were'} dropped, not in the sealed change: ${dropped.join(', ')}. `) +
      (used === null
        ? ''
        : used.length === 0
          ? 'A checker tool handed on no path that needs judgment. '
          : `A checker tool handed on ${String(used.length)} path${used.length === 1 ? '' : 's'} that need${used.length === 1 ? 's' : ''} judgment, and the check reads ${used.length === 1 ? 'it' : 'them'}: ${used.map((one) => one.path).join(', ')}. `) +
      (submission?.seal.kind === 'records' ? 'The check reads sealed record revisions; no Git base is required.' : submission?.seal.kind === 'files' ? `The check reads a copy of the staged files of seal ${submission.id}, verified against it; no Git base is required.` : input.base === null ? 'Nobody said which commit the changes were read against.' : input.base.says) +
      (input.read === null ? ' Nobody said which worktree it read.' : ` ${input.read.says}`) +
      (input.execution === undefined ? '' : ` The check uses ${input.execution.model}, with ${input.execution.minutes} minutes to finish.`),
  }
  patchRecord(run.id, { dataPatch: { [WHAT_IT_WOULD_READ]: said } }, { ...THE_OFFICE, sessionId: input.sessionId })
  return said
}

/**
 * THE CHECKOUT AS THE STORED FIELD SPELLS IT: what is known, and nothing for what is not.
 *
 * An absent key is how this product says nobody recorded one, and it is not the same as a key
 * holding null, which reads as somebody having written down that there is none.
 */
function whereItIs(checkout: TheRunsCheckout): { directory?: string; cutFrom?: string } {
  return {
    ...(checkout.directory === null ? {} : { directory: checkout.directory }),
    ...(checkout.cutFrom === null ? {} : { cutFrom: checkout.cutFrom }),
  }
}

/**
 * Write what the office did onto the run, which is also what says it has been done.
 *
 * AS THE OFFICE AND NOT AS WHOEVER PATCHED THE RUN. See `THE_OFFICE` above: this is bookkeeping
 * about the run rather than an edit of it, and attributing it to the caller put an update row under
 * a name that then failed C22's guard.
 */
function rememberTheCheck(runId: string, said: TheCheckTheOfficeAskedFor): void {
  const previous = getRecord(runId)?.data[THE_CHECK]
  // Merge patches delete keys with null only when their parent already exists. Build the
  // deletion paths from the current request so a fresh check cannot inherit an old execution.
  function replacing(before: unknown, after: Record<string, unknown>): Record<string, unknown> {
    if (!isObject(before)) return after
    const patch: Record<string, unknown> = {}
    for (const key of Object.keys(before)) if (!(key in after)) patch[key] = null
    for (const [key, value] of Object.entries(after)) patch[key] = isObject(value) ? replacing(before[key], value) : value
    return patch
  }
  // THE RUN'S SETTLEMENTS ARE NEVER NAMED: a new check does not undo them, and only their doors write them. A check
  // built from the stored one carries them back unchanged, and the settlement guard refuses any write that names them
  // (wave 13k round 7, piece 2), so they are left out of the patch at its top level, where they live.
  // A COPY, because `replacing` hands back the caller's own object when nothing was stored.
  const whole = { ...replacing(previous, said as unknown as Record<string, unknown>) }
  for (const key of SETTLEMENTS_ON_THE_CHECK) delete whole[key]
  patchRecord(runId, { dataPatch: { [THE_CHECK]: whole } }, THE_OFFICE)
}

/**
 * THE MARK OF AN ASK NOTHING IN THIS OFFICE WOULD START, written on the run as the office, as `theCheck` is (wave 13n round
 * DP). A mark an earlier ask left is replaced whole, because its `told` or `notTold` was about that ask.
 */
function markThatNothingStartsTheCheck(runId: string, mark: ACheckNothingStarts): void {
  const before = getRecord(runId)?.data[A_CHECK_NOTHING_STARTS]
  const dropped = isObject(before) ? Object.fromEntries(Object.keys(before).filter((key) => !(key in mark)).map((key) => [key, null])) : {}
  patchRecord(runId, { dataPatch: { [A_CHECK_NOTHING_STARTS]: { ...dropped, ...mark } } }, THE_OFFICE)
}

// ============================================================ closing a run as superseded

/** Where a run worked, read for the same-branch comparison: the seal's own record, or the session. */
function theCheckoutOfARun(run: PanelRecord): { repository: string | null; directory: string | null } {
  const seal = readRunSeal(run.id)?.seal
  if (seal?.git) return { repository: seal.git.repository, directory: seal.git.directory }
  const data = isObject(run.data) ? run.data : {}
  return { repository: null, directory: said(data['workingDirectory']) }
}

/**
 * WHETHER TWO RUNS ARE ON THE SAME BRANCH: the comparison is the two seals' git repository and working
 * directory, or the two sessions' `workingDirectory` where a seal is missing.
 *
 * The working directory is what names the branch in practice: one repository has one worktree
 * checked out at one branch at a time, so the same directory in the same repository is the same
 * branch. The repository is compared only where both seals name one; where either run is unsealed
 * there is nothing to compare it with, and the directory is the whole of the answer.
 *
 * The merge queue does not ask this. For it, two entries are the same work only when the newer
 * commit contains the older one (problem YL2A9GqoUWHd, wave 13v round 16).
 */
export function runsAreOnTheSameBranch(a: PanelRecord, b: PanelRecord): boolean {
  const left = theCheckoutOfARun(a)
  const right = theCheckoutOfARun(b)
  if (left.directory === null || right.directory === null) return false
  if (left.directory !== right.directory) return false
  if (left.repository !== null && right.repository !== null) return left.repository === right.repository
  return true
}

/** What one run's checkout is, said in the refusal so the reader can see the two it compared. */
function checkoutSays(run: PanelRecord): string {
  const where = theCheckoutOfARun(run)
  if (where.directory === null) return `Run ${run.id} records no working directory.`
  return `Run ${run.id} worked in ${where.directory}${where.repository === null ? '' : `, in the repository ${where.repository}`}.`
}

/** Say which process rows the settlement closed and which it kept open. */
function whatClosingProcessRowsSays(rows: EndedRunRows): string {
  const sentences: string[] = []
  if (rows.closed.length > 0) {
    const n = rows.closed.length
    sentences.push(`It closed ${n} process ${n === 1 ? 'row whose process had' : 'rows whose processes had'} ended (${rows.closed.map(one => one.resource.id).join(', ')}).`)
  }
  if (rows.left.length > 0) {
    const n = rows.left.length
    sentences.push(`${n} process ${n === 1 ? 'row stays' : 'rows stay'} open because ${n === 1 ? 'its process is' : 'their processes are'} still running or could not be read (${rows.left.map(one => one.resource.id).join(', ')}).`)
  }
  return sentences.length === 0 ? '' : ` ${sentences.join(' ')}`
}

function whatEndingClaimsSays(claims: string[]): string {
  return claims.length === 0 ? '' : ` It ended ${claims.length} ${claims.length === 1 ? 'claim' : 'claims'} (${claims.join(', ')}).`
}

/** Close a run as an unchecked archive, with the secretary's or person's proved identity and reason. */
export function closeARunUnchecked(input: {
  runId: string
  workspaceId: string
  because: string
  decision?: string
  actor: Actor
}): { stands: WhereARunStands; says: string } {
  const run = theRun(input.runId, input.workspaceId)
  const proof = input.actor.provedBy
  const keyed = input.actor.type === 'human' ? proof === 'the-person-key' : proof === 'an-agent-key'
  if (!keyed) {
    throw new PanelError('Closing a run unchecked requires the secretary’s own key or the person’s key, even while the key window is open. Nothing was written.', 403)
  }
  const me = maySpeakForTheSecretary(input.actor)
  if (me === null) {
    throw new PanelError('Only a holder of the secretary card or the person may close a run unchecked. Nothing was written.', 403)
  }
  const stands = whereARunStands(run)
  if (!stands.saidFinished && !theRunHasEnded(run.data['state'])) throw new PanelError(`Run ${run.id} has not ended, so it cannot be closed unchecked. Nothing was written.`, 409)
  if (stands.closedUnchecked !== null) throw new PanelError(`Run ${run.id} is already closed unchecked. Nothing was written.`, 409)
  if (stands.superseded !== null) throw new PanelError(`Run ${run.id} is already superseded. Nothing was written.`, 409)
  if (stands.landedByHand !== null) throw new PanelError(`Run ${run.id} is already recorded as landed by hand. Nothing was written.`, 409)
  if (stands.confirmed !== null) throw new PanelError(`Run ${run.id} is already confirmed. Nothing was written.`, 409)
  if (stands.standing === 'closed') throw new PanelError(`Run ${run.id} is already closed. Nothing was written.`, 409)
  if (!aStandingOwesACheck(stands.standing)) throw new PanelError(`Run ${run.id} owes no check or report, so there is nothing to close unchecked. Nothing was written.`, 409)
  const active = listMergeQueue({ workspaceId: input.workspaceId }).lanes.flatMap((lane) => lane.entries).find((entry) =>
    !MERGE_STATE_SPECS[entry.state].final && (entry.run === run.id || (isObject(entry.machine['reinspection']) && entry.machine['reinspection']['run'] === run.id)))
  if (active !== undefined) throw new PanelError(`Run ${run.id} still has merge entry ${active.id} that has not ended. Nothing was written.`, 409)
  const because = input.because.trim()
  if (because === '') throw new PanelError('Say why this run is being closed unchecked. Nothing was written.', 409)
  const decision = input.decision === undefined ? null : getRecord(input.decision)
  if (input.decision !== undefined && (decision === null || decision.deletedAt !== null || decision.kind !== 'decision')) {
    throw new PanelError('The named decision is not a decision this office holds. Nothing was written.', 409)
  }
  const closedUnchecked: ClosedUnchecked = { by: me, at: nowStamp(), because, ...(decision === null ? {} : { decision: decision.id }) }
  const { rows, claims } = sqlite.transaction(() => {
    asTheDoorOf('closedUnchecked', () => patchRecord(run.id, { dataPatch: { closedUnchecked } }, input.actor))
    const rows = closeTheGoneProcessRowsOfAnEndedRun(run.id, input.workspaceId, input.actor)
    const claims = endTheClaimsOfARun(run.id, input.workspaceId, input.actor, 'The run it belonged to was closed unchecked.')
    return { rows, claims }
  })()
  const after = whereARunStands(getRecord(run.id)!)
  return { stands: after, says: after.says + whatClosingProcessRowsSays(rows) + whatEndingClaimsSays(claims) }
}

/**
 * CLOSE A RUN AS SUPERSEDED BY A LATER RUN: one on the same branch, or one that was checked and merged
 * and holds this run's commits. Item 2 of the midday report `p0oJZeu-Grdo` says so.
 * Another decision took the change as proposed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A run whose branch tip moved after its seal can be checked by nobody: `verifyRunSeal` refuses
 * every reading, so the finish it owes can never conclude and its worker can never be retired. Four
 * runs of 16 September 2026 were left that way. When a later run on the same branch finished that
 * same work and its check released and confirmed it, the first run is not unfinished — it was
 * overtaken. This writes that one fact and nothing else.
 *
 * A WORKER'S RUN IN A WAVE is the second case (problem `1pzFUvtcfLNu`). Its commits reach the wave's
 * branch by cherry-pick, and only the wave's run is checked and merged, so the worker's own check
 * is never made. Once the wave's run was released by an inspector, confirmed and merged, and it
 * holds each of the worker's commits, the worker's run is settled by it. Holding is proved in git,
 * by `whatALaterSealHolds`, and never taken from a list somebody wrote.
 *
 * A RELEASED RUN WHOSE ENTRY DID NOT LAND is the third case (message `_v9zAhpFEefO`). Its check
 * released it, and the merge entry it was submitted in bounced, so a later run on the same branch was
 * checked and merged instead. Confirming the released run would say its own entry landed. Once the
 * later run was released by an inspector, confirmed and merged, and it holds each of this run's
 * commits, the released run is settled by it, as a worker's run is. Its release is left as it was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT WRITES, AND WHAT IT LEAVES EXACTLY AS IT WAS
 * ---------------------------------------------------------------------------------------
 *
 * One field on the run's `theCheck`: `superseded` = {by, at, byWhom, because}, and `contains` too
 * when the later run was on another branch or this run was released, saying how the holding was
 * proved. On a run that holds no check the same field is written on the run itself (problem
 * FuHKnNDBzrXW), because a theCheck written for it would say a check was asked that nobody asked.
 * The seal, the report, the release and every refusal are untouched, and so is every other
 * field. The standing then reads `superseded`
 * from that field (`theSupersededOn` in src/shared/releasing.ts), and the retire rule of a decision no longer
 * counts the run as a check owed.
 *
 * A RUN THAT HAS NOT SAID ITS WORK IS FINISHED is the fourth case (problem FuHKnNDBzrXW). Its work may
 * have landed inside a later run although the run itself never finished. It is closed only once its
 * process has ended (`whetherARunsProcessHasEnded`), and its commits, which no seal holds, are read
 * from its working directory by the reader a seal uses. Every proof asked of the later run is the same.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY, AND WHAT IT REFUSES
 * ---------------------------------------------------------------------------------------
 *
 * The run's starter — the agent or person recorded on the agent this run serves, read the way the
 * office reads it everywhere else — the owner, proved by `thePersonIsProved`, and a secretary
 * proved by a key. Everybody else is refused in one sentence.
 *
 * Each refusal names what is wrong: a `by` that names the run itself; a later run not in this
 * project; a later run on the same branch whose check has not been released and confirmed; a first
 * run already confirmed or superseded; a first run already released, unless the later run is on the
 * same branch. A released first run is refused when one of its merge entries landed or is still in
 * the queue, and on each of the grounds below that a later run on another branch is refused on. A
 * first run that has not said it is finished is refused while its process has not been shown to have ended. A
 * later run on another branch is refused when it
 * was not released by an inspector, not confirmed or not merged; when either run has no git seal, or,
 * for a first run that has not said it is finished, when its working directory cannot be read;
 * when the two seals name different repositories; when git cannot read that repository; and when
 * any of this run's commits is not found in it, naming each one. Everything is asked before
 * anything is written.
 */
export interface SupersedingARun {
  runId: string
  workspaceId: string
  by: string
  because: string
  /** A released statement naming what changed worker commits became. */
  statement?: string
  actor: Actor
}

/**
 * WHO MAY CLOSE A RUN AS SUPERSEDED, asked once for each request. The door asks it through the check below; the batch
 * reading asks it once before its loop over the later runs and hands the answer to every check it makes, so the gate
 * who-closes-a-run-as-superseded counts the reading once however many later runs it tries. At off the gate lets any
 * registered caller close the run, and the mark names that caller.
 */
function whoClosesARunAsSuperseded(run: PanelRecord, input: { runId: string; actor: Actor }): ParticipantRef {
  // WHO MAY. Nothing registered cannot be the starter or the owner, and a sentence that says so is
  // better than one about a starter the caller never claimed to be.
  const me = participantForActor(input.actor)
  if (me === null) {
    throw new PanelError(
      `Nothing is registered as "${input.actor.id}", so it cannot close a run as superseded. Closing a run is ` +
        "the act of the run's starter, a secretary proved by a key, or the owner. Nothing was written.",
      403,
    )
  }
  const worker = theAgentOfARun(run)
  const starter = worker?.startedBy ?? null
  const isTheOwner = me.kind === 'person' && thePersonIsProved(input.actor)
  const isTheStarter = starter !== null && isTheSame(starter, me)
  // A secretary may settle every wave's workers. A secretary's name
  // without a key never gains this authority, including while the key window is open.
  const isTheSecretary = me.kind === 'agent' && input.actor.provedBy === 'an-agent-key' && maySpeakForTheSecretary(input.actor) !== null
  if (!isTheOwner && !isTheStarter && !isTheSecretary && gateMet('who-closes-a-run-as-superseded') === 'block') {
    throw new PanelError(
      `Closing run ${input.runId} as superseded is the act of its starter` +
        (starter === null
          ? ', and nothing is recorded as having started the agent this run serves'
          : ` (${participantWord(starter.kind)} ${theNameAPersonReads(starter)})`) +
        `, of a secretary proved by a key, or of the owner. ${input.actor.type === 'agent' ? `The agent "${input.actor.id}"` : `"${input.actor.id}"`} does not hold that authority. ` +
        'Nothing was written.',
      403,
    )
  }
  return me
}

/**
 * Validate the whole superseded act without writing. The door and the batch reading both call it. `me` is the answer of
 * `whoClosesARunAsSuperseded` when the caller has asked it already; the check asks it otherwise.
 */
export function checkSupersedingARun(input: SupersedingARun, asked?: { me: ParticipantRef }): {
  run: PanelRecord
  me: ParticipantRef
  contains: Superseded['contains']
  entriesSay: string | null
} {
  const run = theRun(input.runId, input.workspaceId)
  const me = asked?.me ?? whoClosesARunAsSuperseded(run, input)

  // A RUN IS NOT SUPERSEDED BY ITSELF. Asked before the later run is resolved, so the sentence is
  // about the request rather than about a record the caller happened to name twice.
  if (input.by === input.runId) {
    throw new PanelError(
      `Run ${input.runId} cannot be superseded by itself. Name the later run that finished the work. ` +
        'Nothing was written.',
      409,
    )
  }

  const later = theRun(input.by, input.workspaceId)
  const sameBranch = runsAreOnTheSameBranch(run, later)
  const laterStands = whereARunStands(later)
  if (sameBranch && (laterStands.released === null || laterStands.confirmed === null)) {
    throw new PanelError(
      `Run ${input.by} has not been released and confirmed, so it cannot supersede anything. ${laterStands.says} ` +
        'A run supersedes another only once its own check has released it and its supervisor has confirmed the ' +
        'report. Nothing was written.',
      409,
    )
  }

  const stands = whereARunStands(run)
  if (stands.closedUnchecked !== null) throw new PanelError(`Run ${run.id} is already closed unchecked. Nothing was written.`, 409)
  // A RELEASED RUN ON THE SAME BRANCH, NOT CONFIRMED, is the one closed run a later run may still settle,
  // when its own merge entry did not land. Every other released, confirmed or superseded run is closed once.
  const releasedOnTheSameBranch = sameBranch && stands.released !== null && stands.confirmed === null && stands.superseded === null
  if (!releasedOnTheSameBranch && (stands.released !== null || stands.confirmed !== null || stands.superseded !== null)) {
    const already = stands.superseded !== null ? 'superseded' : stands.confirmed !== null ? 'confirmed' : 'released'
    throw new PanelError(`Run ${input.runId} is already ${already}. ${stands.says} A run is closed once. Nothing was written.`, 409)
  }
  // A RUN THAT NEVER SAID ITS WORK WAS FINISHED is closed only once its process has ended (problem FuHKnNDBzrXW). A run
  // whose process is still going may still be working, and closing it would take its work away from under it.
  if (!stands.saidFinished) {
    const ended = whetherARunsProcessHasEnded(run)
    if (!ended.ended) {
      throw new PanelError(
        `Run ${run.id} has not said its work is finished, and ${ended.says} A run that has not said it is finished is ` +
          'closed as superseded only once its process has ended. Nothing was written.',
        409,
      )
    }
  }

  let contains: Superseded['contains']
  let entriesSay: string | null = null
  if (releasedOnTheSameBranch) {
    entriesSay = noEntryOfAReleasedRunLanded(run)
    contains = theLaterRunHoldsThisRun(
      run,
      later,
      laterStands,
      `Run ${run.id} is already released, and no merge entry of it landed. A later run on the same branch closes a released run ` +
        "only when an inspector released the later run, its report was confirmed, it was merged, and it holds each of this run's commits.",
      input.statement,
    )
  } else if (!sameBranch) {
    contains = theLaterRunHoldsThisRun(
      run,
      later,
      laterStands,
      `Run ${later.id} is not on the same branch as run ${run.id}. ${checkoutSays(run)} ${checkoutSays(later)} ` +
        "A run on another branch closes this one only when an inspector released it, its report was confirmed, it was merged, and it holds each of this run's commits.",
      input.statement,
    )
  } else {
    // A LATER ROUND OF THE SAME BRANCH replaces an earlier round that was never released, and no commit is compared
    // (message pbdbhR5auhrd: Iags8Fr7OJYh was settled so, and that is meant). The mark says so, rather than
    // leaving a reader to take the later run for one proved to hold this run's sealed commit.
    const laterCommit = readRunSeal(later.id)?.seal.git?.commit
    contains = { how: 'a later round of the same branch', ...(laterCommit === undefined ? {} : { laterCommit }), commits: [] }
  }

  return { run, me, contains, entriesSay }
}

/** The superseded door alone writes the act, after the shared validation succeeds. */
export function supersedeARun(input: SupersedingARun): {
  superseded: Superseded
  theCheck: TheCheckTheOfficeAskedFor | null
  stands: WhereARunStands
  says: string
} {
  const { run, me, contains, entriesSay } = checkSupersedingARun(input)
  const superseded: Superseded = {
    by: input.by,
    at: nowStamp(),
    byWhom: me,
    because: input.because,
    ...(contains === undefined ? {} : { contains }),
  }
  // MERGED, NOT REPLACED. `dataPatch` walks into theCheck and keeps every key already there, so the
  // asked-at, the checkout, the execution and the refusal recorded on it are left exactly as they
  // were. The seal, the report and the refusals are other fields and are not touched at all.
  // A RUN THAT HOLDS NO CHECK gets the mark on itself (problem FuHKnNDBzrXW). Written into theCheck, it would make a
  // theCheck that no check was asked for, and the session kind refuses a theCheck without its asking.
  const onItsCheck = theCheckAskedFor(run) !== null
  const { rows, claims } = sqlite.transaction(() => {
    asTheDoorOf('superseded', () => patchRecord(input.runId, { dataPatch: onItsCheck ? { [THE_CHECK]: { superseded } } : { superseded } }, input.actor))
    const rows = closeTheGoneProcessRowsOfAnEndedRun(input.runId, input.workspaceId, input.actor)
    const claims = endTheClaimsOfARun(input.runId, input.workspaceId, input.actor, 'The run it belonged to was closed as superseded.')
    return { rows, claims }
  })()
  const after = getRecord(input.runId) ?? run
  const afterStands = whereARunStands(after)
  return {
    superseded,
    theCheck: theCheckAskedFor(after),
    stands: afterStands,
    says: (entriesSay === null ? afterStands.says : `${afterStands.says} ${entriesSay}`) + whatClosingProcessRowsSays(rows) + whatEndingClaimsSays(claims),
  }
}

/**
 * A secretary or the person reads the proposed settlement, proved by a key even inside the open window. At off the gate
 * who-reads-a-settlement lets any caller proved by a key read it, so such a caller may read the owed runs of every
 * project. A caller with no key is refused at both positions, and is not counted as one the gate would stop.
 */
export function requireASettlementReader(actor: Actor): void {
  const keyed = actor.type === 'human' ? actor.provedBy === 'the-person-key' : actor.provedBy === 'an-agent-key'
  if (keyed && maySpeakForTheSecretary(actor) !== null &&
      (actor.type !== 'human' || thePersonIsProved(actor))) return
  if (!keyed && gatePosition('who-reads-a-settlement') !== 'block') {
    throw new PanelError('Only a caller proved by a key may read how an owed run would be settled. Nothing was written.', 403)
  }
  if (keyed && gateMet('who-reads-a-settlement') !== 'block') return
  throw new PanelError('Only a secretary or the person, proved by a key, may read how an owed run would be settled. Nothing was written.', 403)
}

export interface HowARunWouldSettle {
  run: string
  workspaceId: string
  agent: (ParticipantRef & { handle: string }) | null
  owed: AnOwedCheckOfAnAgent | null
  settlement: null | {
    way: 'superseded'
    by: string
    because: string
    proof: NonNullable<Superseded['contains']>
    statement?: string
  } | {
    way: 'closed unchecked'
    because: string
  } | {
    way: 'could not be read'
    because: string
    candidates: { by: string | null; statement?: string; because: string }[]
  }
}

/** A missing Git reading is never treated as evidence that a later run does not hold the work. */
const unreadableSupersededProofs = new WeakSet<PanelError>()

function anUnreadableSupersededProof(because: string): PanelError {
  const error = new PanelError(because, 409)
  unreadableSupersededProofs.add(error)
  return error
}

function isAnUnreadableSupersededProof(error: unknown): error is PanelError {
  return error instanceof PanelError && unreadableSupersededProofs.has(error)
}

function requireAReadableSettlementRepository(repository: string): void {
  try { readGit(repository, ['rev-parse', '--git-dir']) }
  catch (error) { throw anUnreadableSupersededProof(`The superseded proof could not read repository ${repository}: ${String(error)}. Nothing was written.`) }
}

/** The place a record was written in (`theOrderWritten`), or null when the change log holds no create row of it. */
function thePlaceWritten(recordId: string): number | null {
  const row = sqlite.prepare(`SELECT ${theOrderWritten('records')} AS written FROM records WHERE id = ?`).get(recordId) as { written: number | null } | undefined
  return row?.written ?? null
}

/**
 * THE PLACE OF THE NEWEST WRITE OF ONE KEY OF A RECORD'S DATA in the change log (`append_order`), or null when none is
 * recorded or a row that may hold it cannot be read. The records door logs a write by the path it changed: `data.<key>`
 * for a value written, `data.<key>.<leaf>` for an object merged over an object, and `data` for the whole bag, which
 * counts only when that key differs in it.
 */
function theNewestWriteOf(recordId: string, key: string): number | null {
  const rows = sqlite
    .prepare(
      'SELECT field, old_value AS oldValue, new_value AS newValue, append_order AS written FROM changes ' +
        "WHERE record_id = ? AND op = 'update' AND (field = 'data' OR field = ? OR substr(field, 1, ?) = ?) ORDER BY append_order DESC",
    )
    .all(recordId, `data.${key}`, key.length + 6, `data.${key}.`) as { field: string; oldValue: string | null; newValue: string | null; written: number | null }[]
  const theKeyIn = (text: string | null): unknown => {
    const bag: unknown = text === null ? null : JSON.parse(text)
    return isObject(bag) ? bag[key] : undefined
  }
  for (const row of rows) {
    if (row.field !== 'data') return row.written
    try {
      if (JSON.stringify(theKeyIn(row.oldValue)) !== JSON.stringify(theKeyIn(row.newValue))) return row.written
    } catch {
      return null
    }
  }
  return null
}

/**
 * One reading for the dry run and apply. It writes nothing, including on a refused proof.
 * Candidates have a later merge in this repository. A wave may start before its workers, so
 * its merge, rather than its start, is compared with the worker's end.
 * Each candidate and each statement is validated by the superseded door's own code.
 *
 * THE END AND EACH MERGE ARE COMPARED IN THE ORDER WRITTEN, not as times in words: those repeat in the hour the clocks go
 * back, and a merge at 01:10 winter time was read as before a seal at 01:50 summer time, twenty minutes earlier. The end
 * is the seal's create row; for a run with no seal, the newest write of its `finishedAt`, or its own create row when it
 * says no finish. A merge is the newest write of the later run's `integrated` receipt. An end or a merge with no place is
 * named as unreadable, and the run stays unsettled.
 */
export function howARunWouldSettle(input: { runId: string; workspaceId: string; actor: Actor }): HowARunWouldSettle {
  const run = theRun(input.runId, input.workspaceId)
  requireASettlementReader(input.actor)
  const storedId = said(run.data['servingAgentId'])
  const worker = storedId === null ? theAgentOfARunForItsSeal(run) : theAgentWithThisId(sqlite, storedId)
  const agent: HowARunWouldSettle['agent'] = worker !== null
    ? { kind: 'agent', id: worker.id, handle: worker.handle }
    : said(run.data['servingAgent']) === THE_PERSON ? { kind: 'person', id: THE_PERSON, handle: THE_PERSON } : null
  const owed = theOwedCheckOfARun(run)
  const base = { run: run.id, workspaceId: run.workspaceId, agent, owed }
  if (owed === null) return { ...base, settlement: null }
  if (agent === null) {
    const stored = storedId ?? said(run.data['servingAgent'])
    const could = stored === null ? null : everyAgentAReferenceCouldName(sqlite, stored)
    const names = new Set(could === null ? [] : [could.byId, could.liveByHandle, ...could.everyRetiredByHandle].filter(one => one !== null).map(one => one.id))
    const because = storedId !== null
      ? `The run's agent cannot be placed: stored registry id "${storedId}" names no registered agent.`
      : stored !== null && names.size > 1
        ? `The run's agent cannot be placed: "${stored}" names ${names.size} agents (${[...names].join(', ')}).`
        : `The run's agent cannot be placed: ${stored === null ? 'no agent was recorded' : `"${stored}" names no registered agent`}.`
    return { ...base, settlement: { way: 'could not be read', because, candidates: [{ by: null, because }] } }
  }

  const earlier = readRunSeal(run.id)
  const repository = earlier?.seal.git?.repository ?? null
  const unreadable: { by: string | null; statement?: string; because: string }[] = []
  const end: { place: number | null; unplaced: string } = earlier !== null ? { place: thePlaceWritten(earlier.id), unplaced: `its seal ${earlier.id} has no create row` }
    : said(run.data['finishedAt']) !== null ? { place: theNewestWriteOf(run.id, 'finishedAt'), unplaced: 'no write of its finishedAt is recorded' }
    : { place: thePlaceWritten(run.id), unplaced: 'it has no create row' }
  const ended = end.place
  if (ended === null) {
    unreadable.push({ by: null, because: `The end of run ${run.id} has no place in the change log: ${end.unplaced}. ` +
      'The office does not read the end from its time in words instead, because that time repeats when the clocks go back.' })
  }
  const candidates = ended === null ? [] : listRecords({ workspaceId: run.workspaceId, kind: 'session' }).filter((later) => {
    if (later.id === run.id || !theMergeOfARun(later).merged) return false
    const inThisRepository = repository === null ? runsAreOnTheSameBranch(run, later) : readRunSeal(later.id)?.seal.git?.repository === repository
    if (!inThisRepository) return false
    const merged = theNewestWriteOf(later.id, 'integrated')
    if (merged === null) {
      unreadable.push({ by: later.id, because: `No write of run ${later.id}'s merge receipt is recorded in the change log, so whether it merged after run ` +
        `${run.id} ended is not known. The office does not read it from the time in words instead, because that time repeats when the clocks go back.` })
      return false
    }
    return merged > ended
  })
  // A report's shape only makes it a candidate. Its release and every row are checked by the door.
  const statements = candidates.length === 0 ? [] : listRecords({ workspaceId: run.workspaceId, kind: 'report' })
    .filter((report) => {
      const read = readAStatement(report)
      return 'rows' in read && read.rows.some((row) => row.run === run.id)
    }).map((report) => report.id)
  // WHO MAY IS ASKED ONCE, before the first check it would have been asked in, so its gate counts this reading once.
  const asked = candidates.length === 0 ? undefined : { me: whoClosesARunAsSuperseded(run, input) }
  for (const later of candidates) {
    for (const statement of [undefined, ...statements]) {
      const because = `Later merged run ${later.id} holds this run's work.`
      try {
        const checked = checkSupersedingARun({ ...input, by: later.id, because, ...(statement === undefined ? {} : { statement }) }, asked)
        if (checked.contains === undefined) throw new Error('The superseded proof did not say how the later run holds the work.')
        return { ...base, settlement: {
          way: 'superseded', by: later.id, because, proof: checked.contains,
          ...(checked.contains.statement === undefined ? {} : { statement: checked.contains.statement }),
        } }
      } catch (error) {
        if (isAnUnreadableSupersededProof(error)) {
          unreadable.push({ by: later.id, ...(statement === undefined ? {} : { statement }), because: error.message })
          break
        }
        if (!(error instanceof PanelError) || error.status !== 409) throw error
      }
    }
  }
  // Even with no matching candidate, an absent sealed repository is named as unreadable.
  // The batch must not turn a moved repository into permission to close a run unchecked.
  if (repository !== null && unreadable.length === 0) {
    try { requireAReadableSettlementRepository(repository) }
    catch (error) {
      if (!(isAnUnreadableSupersededProof(error))) throw error
      unreadable.push({ by: null, because: error.message })
    }
  }
  if (unreadable.length > 0) return { ...base, settlement: {
    way: 'could not be read',
    because: 'The superseded proofs could not all be read. This run must remain unsettled until they can be read.',
    candidates: unreadable,
  } }
  return { ...base, settlement: {
    way: 'closed unchecked',
    because: `No later merged run in this repository passed the superseded door's proofs for run ${run.id}. Its outstanding check or report will not be completed.`,
  } }
}

/**
 * RECORD THAT A RELEASED RUN'S CONTENT REACHED MAIN BY HAND, at point
 * 12. On 26 September 2026 the content of three released runs was landed
 * on main by hand,
 * because the merge queue could not land them, and the office showed them only as released and confirmed.
 *
 * The person or a holder of the secretary card names the commit and says why. Everything is checked before anything
 * is written, and each refusal is a 409 (403 for the caller) naming what is wrong:
 *   - the run was released and confirmed, and nobody has recorded a hand-landing for it yet;
 *   - no merge entry of it merged or is still in the queue; the lane whose checkout is read is the one git lane its
 *     entries name, or, when it was never submitted as a git entry, the project's one registered repository;
 *   - the named commit is in that checkout, and main (the checkout's HEAD) holds it;
 *   - that commit holds the run's sealed commits, by the proofs of the superseded door (`whatALaterSealHolds`:
 *     ancestor, the same patches, the same changed lines), read from the run's fork base to the named commit.
 * Then one field is written, `theCheck.landedByHand`, and nothing else of the run changes. It adds no standing.
 */
export function recordAHandLanding(input: { runId: string; workspaceId: string; commit: string; because: string; repository?: string; actor: Actor }): {
  landedByHand: LandedByHand
  stands: WhereARunStands
  says: string
} {
  const me = maySpeakForTheSecretary(input.actor)
  if (me === null) {
    throw new PanelError(
      `Only the person, or whoever holds the secretary card, records that run ${input.runId}'s content reached main by hand. Nothing was written.`,
      403,
    )
  }
  const run = theRun(input.runId, input.workspaceId)
  const stands = whereARunStands(run)
  if (stands.released === null || stands.confirmed === null) {
    throw new PanelError(
      `Run ${input.runId} was not ${stands.released === null ? 'released' : 'confirmed'}. ${stands.says} Only a run that was released and confirmed ` +
        'can be recorded as landed by hand. Nothing was written.',
      409,
    )
  }
  if (stands.landedByHand !== null) {
    throw new PanelError(`Run ${input.runId} is already recorded as landed by hand, in ${stands.landedByHand.commit}. It is recorded once. Nothing was written.`, 409)
  }
  const entries = listMergeQueue({ workspaceId: run.workspaceId })
    .lanes.flatMap((lane) => lane.entries)
    .filter((entry) => entry.run === run.id)
  const landed = entries.filter((entry) => entry.state === 'merged')
  if (landed.length > 0) {
    throw new PanelError(
      `Run ${input.runId}'s merge ${landed.length === 1 ? 'entry' : 'entries'} ${landed.map((entry) => entry.id).join(', ')} merged, so its content ` +
        'reached main through the merge queue, not by hand. Nothing was written.',
      409,
    )
  }
  const waiting = entries.filter((entry) => !MERGE_STATE_SPECS[entry.state].final)
  if (waiting.length > 0) {
    throw new PanelError(
      `Run ${input.runId}'s merge ${waiting.length === 1 ? 'entry' : 'entries'} ${waiting.map((entry) => `${entry.id} (${stateWord(entry.state).text})`).join(', ')} ` +
        'can still land, so its content is not recorded as landed by hand while that is so. Nothing was written.',
      409,
    )
  }
  // WHICH MAIN TO READ: the lane every git entry of the run names; for a run never submitted as a git entry, the
  // project's one registered repository, the rule coverage and the work domains use too. Two of the three runs
  // landed by hand on 26 September (TpN6TqIUMN-_ and 6qcS_13nhfSZ) were never submitted, which is why they were.
  // The body's repository is read only for a run without a git entry when several checkouts are registered, and is refused elsewhere.
  const lanes = [...new Set(entries.filter((entry) => entry.changeset.adapter === 'git').map((entry) => entry.changeset.root))]
  if (lanes.length > 1) {
    throw new PanelError(`Run ${input.runId}'s merge entries name ${String(lanes.length)} lanes (${lanes.join(', ')}), so the office cannot tell which main to read. Nothing was written.`, 409)
  }
  let lane: string
  if (lanes.length === 1) {
    lane = lanes[0]!
    if (input.repository !== undefined) {
      throw new PanelError(`Run ${input.runId}'s merge entries name the lane ${lane}, so the office reads main there and takes no repository from the body. Send no repository. Nothing was written.`, 409)
    }
  } else {
    const registered = listRepositories(run.workspaceId).filter((one) => one.root !== null)
    if (registered.length === 0 || (registered.length > 1 && input.repository === undefined)) {
      throw new PanelError(
        `Run ${input.runId} was never submitted as a git entry to the merge queue, and this project has ${String(registered.length)} registered repositories with a checkout ` +
          `${registered.length === 0 ? '' : `(${registered.map((one) => `${one.name} (${one.id}) at ${one.root}`).join(', ')}) `}rather than one, so the office cannot tell which main to read. ` +
          `${registered.length === 0 ? '' : 'Name the one that holds this run\'s main as "repository" in the body, by its id or its name. '}Nothing was written.`,
        409,
      )
    }
    if (registered.length === 1) {
      lane = registered[0]!.root!
      if (input.repository !== undefined) {
        throw new PanelError(`Run ${input.runId} was never submitted as a git entry to the merge queue, and this project has one registered repository with a checkout (${lane}), so the office reads main there and takes no repository from the body. Send no repository. Nothing was written.`, 409)
      }
    } else {
      const repository = theRepositoryNamed(input.repository!, run.workspaceId)
      if (repository.root === null) {
        throw new PanelError(`Repository ${repository.name} (${repository.id}) has no checkout on this machine, so there is no main to read in it. Nothing was written.`, 409)
      }
      lane = repository.root
    }
  }
  const sealed = readRunSeal(run.id)?.seal.git ?? null
  if (sealed === null) throw new PanelError(`Run ${input.runId} has no seal of git work, so there are no commits to find on main. Nothing was written.`, 409)

  // THE COMMIT, ON MAIN. The checkout's HEAD is the lane's main, the one the merge tool lands on.
  let commit: string
  try {
    commit = readGit(lane, ['rev-parse', '--verify', `${input.commit}^{commit}`]).toString('utf8').trim()
  } catch {
    throw new PanelError(`${input.commit} is not a commit in ${lane}. Nothing was written.`, 409)
  }
  let onMain: boolean
  try {
    readGit(lane, ['merge-base', '--is-ancestor', commit, 'HEAD'])
    onMain = true
  } catch (error) {
    if ((error as { status?: unknown }).status !== 1) {
      throw new PanelError(`Git could not read the repository ${lane}: ${String(error)}. Nothing was written.`, 409)
    }
    onMain = false
  }
  if (!onMain) {
    throw new PanelError(`${commit} is not on main in ${lane}: its HEAD does not hold it. Nothing was written.`, 409)
  }

  // THE COMMIT HOLDS THE RUN'S WORK, by the superseded door's proofs, from the run's fork base to the named commit.
  const held = whatALaterSealHolds(lane, sealed, { forkBase: sealed.forkBase, commit })
  if (!held.holds) {
    throw new PanelError(
      `${commit} holds no commit with the same patch, or the same changed lines, as ${held.missing.length === 1 ? 'this commit' : `these ${String(held.missing.length)} commits`} ` +
        `of run ${input.runId}: ${held.missing.map((one) => `${one.commit.slice(0, 12)} "${one.subject}"`).join(', ')}. So it does not hold the run's content, ` +
        'and a person has to look. Nothing was written.',
      409,
    )
  }

  const landedByHand: LandedByHand = {
    commit,
    lane,
    by: me,
    at: nowStamp(),
    because: input.because,
    contains: { how: held.how, laterCommit: commit, commits: held.commits },
  }
  // MERGED, NOT REPLACED, as the superseded door writes: every other key of theCheck stays as it is.
  asTheDoorOf('landedByHand', () => patchRecord(input.runId, { dataPatch: { [THE_CHECK]: { landedByHand } } }, input.actor))
  const after = whereARunStands(getRecord(input.runId) ?? run)
  return { landedByHand, stands: after, says: after.says }
}

/**
 * A RELEASED RUN IS SETTLED BY A LATER RUN ONLY WHEN ITS OWN ENTRY DID NOT LAND, as message _v9zAhpFEefO
 * says.
 *
 * Every merge entry the run was submitted in is read from the merge queue. It throws a 409 when one of
 * them landed, because then the run's own entry carried its work, and when one is still in the queue,
 * because it may still land. Otherwise each entry ended without landing (bounced, withdrawn, or
 * superseded by a newer entry), or the run was never submitted. It then returns one sentence saying
 * which, for the door's answer.
 */
function noEntryOfAReleasedRunLanded(run: PanelRecord): string {
  const entries = listMergeQueue({ workspaceId: run.workspaceId })
    .lanes.flatMap((lane) => lane.entries)
    .filter((entry) => entry.run === run.id)
  const landed = entries.filter((entry) => entry.state === 'merged')
  if (landed.length > 0) {
    throw new PanelError(
      `Run ${run.id} is already released, and its merge ${landed.length === 1 ? 'entry' : 'entries'} ${landed.map((entry) => entry.id).join(', ')} ` +
        `landed: ${landed.length === 1 ? 'it is' : 'they are'} ${stateWord('merged').text}. An entry of its own carried its work, so a ` +
        'later run does not supersede it. Nothing was written.',
      409,
    )
  }
  const waiting = entries.filter((entry) => !MERGE_STATE_SPECS[entry.state].final)
  if (waiting.length > 0) {
    throw new PanelError(
      `Run ${run.id} is already released, and ${waiting.map((entry) => `its merge entry ${entry.id} is still in the queue, ${stateWord(entry.state).text}`).join('; ')}. ` +
        'A released run can be closed as superseded only when no entry of it can still land. Nothing was written.',
      409,
    )
  }
  if (entries.length === 0) return `Run ${run.id} was released and was never submitted to the merge queue.`
  return (
    `Run ${run.id} was released, and no merge entry of it landed: ` +
    `${entries.map((entry) => `${entry.id} is ${stateWord(entry.state).text}`).join(', ')}.`
  )
}

/**
 * THE FOURTH PROOF: A RELEASED STATEMENT NAMES WHAT A CHANGED WORKER COMMIT BECAME.
 * It was recorded in a message, on a worker's design (report aUYFiA68BGIz, block b-17, point 2).
 *
 * Asked only for the commits of the run the first three proofs left unpaired; the rest stay paired as they were. It
 * holds only when every one of these holds, and `refuse` names the first that does not:
 *   - the statement is a report that `readAStatement` reads (src/shared/commit-statements.ts), in this project;
 *   - an inspector's release covers it: its newest revision is the one a sealed submission (records or mixed) of some
 *     run holds, and that run's release, by an inspector, names that seal and its hash;
 *   - each unpaired commit has a row naming this run and that commit;
 *   - the commit the row says it became is on main in the lane the later run merged into;
 *   - the files where the worker commit's own lines (-U0, `theOwnLinesOf`) differ from the commit it became are exactly
 *     the files the row names: a file the row names whose lines did not change, or a changed file it does not name,
 *     is refused. So every file the row does not name holds the worker's own lines unchanged.
 */
function theStatementSettles(input: {
  run: PanelRecord
  later: PanelRecord
  statementId: string
  missing: CommitNotHeld[]
  held: HeldCommit[]
  workerRepository: string
  laterCommit: string
  refuse: (what: string) => never
}): NonNullable<Superseded['contains']> {
  const { run, later } = input
  // A LOCAL WITH ITS TYPE WRITTEN OUT, so the compiler reads each refusal as the end of its path.
  const refuse: (what: string) => never = input.refuse
  const record = getRecord(input.statementId)
  if (record === null || record.deletedAt || record.workspaceId !== run.workspaceId) refuse(`No statement ${input.statementId} is held in this project.`)
  const read = readAStatement(record)
  if ('says' in read) refuse(read.says)

  // AN INSPECTOR'S RELEASE COVERS IT, by the seal that holds its newest revision.
  const newest = theNewestRevisionOf(record.id)
  const sealRows = sqlite
    .prepare("SELECT id FROM records WHERE workspace_id = ? AND kind = 'sealed_tip' AND deleted_at IS NULL AND data LIKE ?")
    .all(run.workspaceId, `%${record.id}%`) as { id: string }[]
  const covering = sealRows.find((row) => {
    const seal = getRecord(row.id)?.data['seal'] as { run?: unknown; hash?: unknown; records?: { records?: { id: string; after: { seq: number; hash: string } }[] } | null } | undefined
    const sealed = seal?.records?.records?.find((one) => one.id === record.id)
    if (seal === undefined || sealed === undefined || newest === null || sealed.after.seq !== newest.seq || sealed.after.hash !== newest.hash) return false
    const sealedRun = typeof seal.run === 'string' ? getRecord(seal.run) : null
    const release = sealedRun === null ? null : readRelease(sealedRun.data['released'])
    return release !== null && release.how === 'an inspector' && typeof seal.hash === 'string' &&
      howAReleaseNamesThisSeal(release.read, row.id, { hash: seal.hash, reduced: (seal as { reduced?: SealedTip['reduced'] }).reduced }) !== null
  })
  if (covering === undefined) {
    refuse(
      `No inspector's release covers statement ${record.id}: no run's release by an inspector names a seal that holds the statement as it now stands ` +
        `(revision ${String(newest?.seq ?? 'none')}).`,
    )
  }

  // THE LANE THE LATER RUN MERGED INTO, whose main the commits must be on.
  const merge = theMergeOfARun(later)
  const entry = merge.merged ? getRecord(merge.entry) : null
  const changeset = entry === null ? null : readMergeEntry(entry).changeset
  if (changeset === null || changeset.adapter !== 'git') refuse(`Run ${later.id}'s merge names no git lane, so no main can be read.`)
  const lane = changeset.root
  requireAReadableSettlementRepository(lane)

  const commits: HeldCommit[] = [...input.held]
  for (const one of input.missing) {
    const row = read.rows.find((stated) => stated.run === run.id && one.commit.toLowerCase().startsWith(stated.workerCommit.toLowerCase()))
    if (row === undefined) refuse(`Statement ${record.id} names no commit ${one.commit.slice(0, 12)} "${one.subject}" of run ${run.id}, and no other proof found it.`)
    let became: string
    try {
      became = readGit(lane, ['rev-parse', '--verify', `${row.became}^{commit}`]).toString('utf8').trim()
    } catch {
      refuse(`Statement ${record.id} says ${one.commit.slice(0, 12)} became ${row.became}, which is not a commit in ${lane}.`)
    }
    try {
      readGit(lane, ['merge-base', '--is-ancestor', became, 'HEAD'])
    } catch (error) {
      if ((error as { status?: unknown }).status !== 1) throw anUnreadableSupersededProof(`Git could not read the repository ${lane}: ${String(error)}. Nothing was written.`)
      refuse(`Statement ${record.id} says ${one.commit.slice(0, 12)} became ${became}, which is not on main in ${lane}.`)
    }
    const ownLines = (repository: string, commit: string): ReturnType<typeof theOwnLinesOf> => {
      try { return theOwnLinesOf(repository, commit) }
      catch (error) { throw anUnreadableSupersededProof(`The superseded proof could not read commit ${commit} in ${repository}: ${String(error)}. Nothing was written.`) }
    }
    const worker = ownLines(input.workerRepository, one.commit)
    const merged = ownLines(lane, became)
    const differ = [...new Set([...worker.keys(), ...merged.keys()])]
      .filter((path) => JSON.stringify(worker.get(path) ?? null) !== JSON.stringify(merged.get(path) ?? null))
      .sort()
    const named = [...row.files].sort()
    const unnamed = differ.filter((path) => !named.includes(path))
    const unchanged = named.filter((path) => !differ.includes(path))
    if (unnamed.length > 0) {
      refuse(`The worker's own lines of ${one.commit.slice(0, 12)} also differ in ${became.slice(0, 12)} in ${unnamed.join(', ')}, which statement ${record.id} does not name.`)
    }
    if (unchanged.length > 0) {
      refuse(`Statement ${record.id} names ${unchanged.join(', ')} for ${one.commit.slice(0, 12)}, where the worker's own lines did not change in ${became.slice(0, 12)}.`)
    }
    commits.push({ commit: one.commit, as: became })
  }
  return { how: 'named by a released statement', laterCommit: input.laterCommit, commits, statement: record.id }
}

/**
 * A LATER RUN THAT MUST HOLD THIS RUN'S COMMITS, ASKED EVERYTHING BEFORE ANYTHING IS
 * WRITTEN. It is asked of a later run on another branch, and of a later run on the same branch
 * when this run was released.
 *
 * It answers how the later run holds this run's commits, or throws a 409 naming what it could not
 * find. Every sentence starts with `why`, which says why more is asked of the later run and what it
 * must be.
 */
function theLaterRunHoldsThisRun(run: PanelRecord, later: PanelRecord, laterStands: WhereARunStands, why: string, statement?: string): NonNullable<Superseded['contains']> {
  function refuse(what: string): never {
    throw new PanelError(`${why} ${what} Nothing was written.`, 409)
  }

  // RELEASED BY AN INSPECTOR, CONFIRMED AND MERGED. Every one that is missing is named.
  const lacks: string[] = []
  if (laterStands.released === null) lacks.push(`Run ${later.id} was not released.`)
  else if (laterStands.released.how !== 'an inspector') {
    lacks.push(`Run ${later.id} was released by ${laterStands.released.how}, not checked by an inspector.`)
  }
  if (laterStands.confirmed === null) lacks.push(`Run ${later.id}'s report was not confirmed.`)
  const merge = theMergeOfARun(later)
  if (!merge.merged) lacks.push(`Run ${later.id} was not merged: ${merge.says}`)
  if (lacks.length > 0) refuse(lacks.join(' '))

  // BOTH SEALS HOLD GIT WORK, IN ONE REPOSITORY. A run that never said its work was finished was never sealed, or its
  // seal is from an earlier finish, so its commits are read from its working directory as a seal would read them.
  const unsealed = aRunSaysItIsFinished(run.data) ? null : theCommitsInTheWorkingDirectoryOf(run, refuse)
  const earlierSeal = unsealed ?? readRunSeal(run.id)?.seal.git ?? null
  const laterSeal = readRunSeal(later.id)?.seal.git ?? null
  const noSeal = [
    ...(earlierSeal === null ? [run.id] : []),
    ...(laterSeal === null ? [later.id] : []),
  ]
  if (earlierSeal === null || laterSeal === null) {
    refuse(`${noSeal.map((id) => `Run ${id} has no seal of git work.`).join(' ')} Without both seals there are no commits to compare.`)
  }
  if (earlierSeal.repository !== laterSeal.repository) {
    refuse(
      `Run ${run.id} was sealed in the repository ${earlierSeal.repository}, and run ${later.id} in the repository ` +
        `${laterSeal.repository}. Commits can only be compared inside one repository.`,
    )
  }

  // HOLDS EACH COMMIT, read in git. A repository git cannot read is refused inside the reader.
  let held: ReturnType<typeof whatALaterSealHolds>
  try { held = whatALaterSealHolds(earlierSeal.repository, earlierSeal, laterSeal) }
  catch (error) { throw anUnreadableSupersededProof(`The superseded proof could not read the commits of ${run.id} and ${later.id} in ${earlierSeal.repository}: ${String(error)}. Nothing was written.`) }
  // THE FOURTH PROOF, only when a statement is named and the first three left commits unpaired.
  const readFrom = unsealed === null ? {} : { readFromItsWorkingDirectory: { directory: unsealed.directory, forkBase: unsealed.forkBase, commit: unsealed.commit } }
  if (!held.holds && statement !== undefined) {
    return { ...theStatementSettles({ run, later, statementId: statement, missing: held.missing, held: held.held, workerRepository: earlierSeal.repository, laterCommit: laterSeal.commit, refuse }), ...readFrom }
  }
  if (!held.holds) {
    refuse(
      `Run ${later.id} holds no commit with the same patch, or the same changed lines, as ${held.missing.length === 1 ? 'this commit' : `these ${String(held.missing.length)} commits`} ` +
        `of run ${run.id}: ${held.missing.map((one) => `${one.commit.slice(0, 12)} "${one.subject}"`).join(', ')}. ` +
        'A commit changed by hand has a different patch, so a person has to look at this run.',
    )
  }
  return { how: held.how, laterCommit: laterSeal.commit, commits: held.commits, ...readFrom }
}

/**
 * THE COMMITS OF A RUN THAT HAS NOT SAID ITS WORK IS FINISHED, read from its working directory. Problem FuHKnNDBzrXW.
 *
 * Such a run holds no seal of this work, so the superseded door reads its commits with `captureGit`, the reader a seal
 * uses, against the branch the run was cut from. Nothing is written. The same refusals a seal makes apply: a working
 * directory that is gone or is not a git checkout, a base that does not resolve, and a file changed outside a commit,
 * which is work no later run can be shown to hold. Each is refused through `refuse`, with what could not be read.
 */
function theCommitsInTheWorkingDirectoryOf(run: PanelRecord, refuse: (what: string) => never): { repository: string; directory: string; forkBase: string; commit: string } {
  const directory = typeof run.data['workingDirectory'] === 'string' ? run.data['workingDirectory'].trim() : ''
  const before = `Run ${run.id} has not said its work is finished, so it holds no seal of it, and its commits are read from its working directory.`
  if (directory === '') refuse(`${before} It names no working directory.`)
  const cutFrom = theBaseARunNames(run.data)
  try {
    const read = captureGit(directory, cutFrom, [])
    return { repository: read.repository, directory, forkBase: read.forkBase, commit: read.commit }
  } catch (error) {
    refuse(`${before} Reading ${directory} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * WHETHER THE PROCESS OF A RUN IS KNOWN TO HAVE ENDED, with a sentence saying what was read. Problem FuHKnNDBzrXW.
 *
 * Three things are read, and nothing else:
 *   - the process the run's own record names (`theRecordedProcessOf`), read by `whetherTheRecordedProcessRuns`, which the
 *     session hook also asks. It is still going when `theRecordedProcess` trusts it; it has ended when no process runs
 *     under its number.
 *   - the process rows registered under the run on the ledger, released ones included. A row that is alive, or whose
 *     state cannot be read, means the run cannot be said to have ended. A row whose pid leads its group also reads the
 *     group through theProcessGroupsLiveness in src/server/lib/resources.ts: members can survive their leader. Without its start time, the group is unknown.
 *   - the run that started it (`parentAttachment`), by `theRunThatStartedItHasEnded`, which the worker also asks. A run
 *     started as a subagent has no process of its own, and it ends with the run that started it.
 * It has ended only when nothing read says it is still going or cannot be read, and at least one of the three says it
 * has ended. When nothing says either way, it has not been shown to have ended, and the sentence says so.
 */
export function whetherARunsProcessHasEnded(run: PanelRecord): { ended: boolean; says: string } {
  try {
    const recorded = theRecordedProcessOf(run)
    let itsOwnHasEnded = false
    if (recorded.pid !== null) {
      const reading = whetherTheRecordedProcessRuns(recorded.pid, recorded.pidStartedAt)
      if (reading.runs === 'yes') return { ended: false, says: `its recorded process ${String(recorded.pid)} is still running.` }
      if (reading.runs === 'cannot-tell') return { ended: false, says: `whether its recorded process ended cannot be told: ${reading.says}.` }
      itsOwnHasEnded = true
    }
    const rows = listResources({ workspaceId: run.workspaceId, sessionRecordId: run.id, includeReleased: true, alsoCheckReleasedRows: true })
      .filter((one) => one.type === 'process')
    const running = rows.filter((one) => one.liveness.state === 'alive').map((one) => `process ${one.key}, registered under it, is still running`)
    const unread = rows.filter((one) => one.liveness.state === 'unknown').map((one) => `process ${one.key}, registered under it, is in a state that cannot be read`)
    if (running.length + unread.length > 0) return { ended: false, says: `${[...running, ...unread].join('; ')}.` }
    for (const row of rows) {
      if (row.pgid === null || row.pgid !== Number(row.key)) continue
      if (row.osStartedAt === null) return { ended: false, says: `whether process group ${String(row.pgid)} has ended cannot be told: its row has no start time.` }
      const group = theProcessGroupsLiveness({ pgid: row.pgid, leaderStartedAt: row.osStartedAt }, 'this run')
      if (group.state === 'alive') return { ended: false, says: `${group.detail}.` }
      if (group.state === 'unknown') return { ended: false, says: `whether process group ${String(row.pgid)} has ended cannot be told: ${group.reason}` }
    }
    const itsRowsHaveEnded = rows.length > 0
    const itsStarterHasEnded = theRunThatStartedItHasEnded(run.data, run.workspaceId)
    if (itsOwnHasEnded || itsRowsHaveEnded || itsStarterHasEnded) return { ended: true, says: 'its process has ended.' }
    return {
      ended: false,
      says: 'nothing says its process has ended: it records no process of its own, no process row is registered under it, ' +
        'and the run that started it is not known to have ended.',
    }
  } catch (error) {
    return { ended: false, says: `whether its process ended cannot be told: ${error instanceof Error ? error.message : String(error)}.` }
  }
}
