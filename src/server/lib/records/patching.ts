// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHANGING A RECORD: `patchRecord`, the shape of its answer, the two writes of a run key's binding, and what only they
 * call. It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. records.ts still calls `patchRecord` itself, so it imports that one name from here.
 *
 * WHAT MOVED is every top-level declaration that only the patch path calls, found by call graph and not by line
 * number. WHAT STAYED IN records.ts is every helper that another operation calls too, such as `mergeData`, `logChange`
 * and `assertMayWrite`. `checkBlockIds` moved to records/pipeline-blocks.ts with the pipeline blocks. Sixteen
 * declarations there gained the export word for the move, because the code here calls them.
 *
 * THE TWO WRITES OF A RUN KEY'S BINDING MOVED WITH IT. `recordTheOriginalRunKeyMint` and
 * `replaceTheRunKeyOfAReopenedRun` are the only writers of the two private symbols `patchRecord` reads,
 * `ORIGINAL_RUN_KEY_MINT_AT` and `THE_STARTERS_KEY_ON_ITS_MINT`. The symbols stay in one module that exports neither,
 * so no other module can write a binding at a time it chose. Leaving the two writes in records.ts would have meant
 * exporting the symbols.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER. That is safe for the same reason as records/creating.ts: every reference
 * this file makes to records.ts is inside a function body, so nothing of records.ts is read while it is still being
 * evaluated. The names records.ts takes from records/reading.ts, records/territory.ts and records/run-writes.ts are
 * imported from them directly.
 */
import { MESSAGE_QUOTE_POSITIONS_INVALID } from '@shared/refusal-codes.ts'
import { refuseModulePartChanges } from '../module-requirements.ts'
import { originalGreenFollowsRepair } from '@shared/main-suite-fix-chronology.ts'
import { applyAWaitingStarterChangeForARunEnded, refuseARunEnteringALiveSet } from '../agent-starter.ts'
import { CASTING_ROLL, ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL } from '@shared/casting-roll.ts'
import { moleOffice } from '@shared/participants.ts'
import { ENDED_RUN_LOOK_FIELD, ONLY_THE_OFFICE_WRITES_THE_LOOK_MARK } from '@shared/ended-run-resources.ts'
import { HOW_THE_ROUND_ENDED, ONLY_THE_OFFICE_WRITES_HOW_THE_ROUND_ENDED } from '@shared/how-the-round-ended.ts'
import { NEXT_ROUND, ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND } from '@shared/next-round.ts'
import {
  CUT_ASKED,
  IMAGES_GIVEN,
  WORKER_PACKAGE,
  ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED,
  ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN,
  ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE,
  ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS,
  WORKER_RUNS,
} from '@shared/worker-runs.ts'
import { refuseTheSealOverAFault } from '../before-the-seal.ts'
import { recordHowARoundEndedWithoutASeal } from '../how-a-round-ended.ts'
import { readRunSeal, runSubmitsWork, sealFinishedRun } from '../sealed-tip.ts'
import {
  aRunKeyNoticeIsAlreadyOn,
  theRunKeyNoticeLine,
  theRunKeyReminderSentence,
  theRunsOwnAgents,
} from '../the-run-a-key-holds.ts'
import { isDeepStrictEqual } from 'node:util'
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { BLOCK_KIND, blockIdsOf } from '@shared/blocks.ts'
import { INTENDED_KINDS } from '@shared/world.ts'
import { mainSuiteFixSchema, mainSuiteFixPinned, type MainSuiteFix } from '@shared/main-suite-fix.ts'
import { wholeSuiteReceiptIsGreen } from '@shared/whole-suite-receipt.ts'
import { readStoredWord } from '@shared/i18n.ts'
import { makeARunKey, revokeTheKeyNamed, revokeTheRunKeyRecordedOn, whyARunsKeyWasRevokedAtItsEnd } from '../keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { createRunTokenStore } from '../keyrouter/run-tokens.ts'
import type { HowAKeysMintWasProved } from '../provedkeys.ts'
import { endTheClaimsOfARun } from '../claims.ts'
import { closeTheGoneProcessRowsOfAnEndedRun } from '../resources.ts'
import { readGit } from '../resources.ts'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../who-may-act.ts'
import { gatePosition } from '../../../config/settings.mjs'
import { db, sqlite } from '../../db/client.ts'
import { PanelError } from '../panel-error.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import {
  allocations,
  links,
  planLines,
  planningRecurrences,
  presentationIntent,
  records,
  reviews,
  workWindows,
} from '../../db/schema.ts'
import { pipelineScope } from '@shared/presentation.ts'
import { validateRecordData, type Incompleteness } from '../validate.ts'
import { canonicalise } from '../summary.ts'
import { blocksFieldOf, KIND_SPECS, validateData } from '@shared/kinds.ts'
import { nowStamp, parseStoredStamp } from '@shared/time.ts'
import { messageEditWindowSeconds } from '../env.ts'
import {
  // WHICH KINDS MAY HOLD HOURS, read from the one declaration rather than through
  // `ALLOCATABLE_KINDS` in lib/planning.ts, which is that same list under its older name. Taken from
  // shared/ so this file does not import the planning layer to ask one question about a list.
  KINDS_A_PLAN_CAN_GIVE_HOURS_TO,
  displayWord,
  fieldWords,
  withArticle,
} from '@shared/work.ts'
import {
  RECORD_KINDS,
  readOrigin,
  type PanelRecord,
  type ProvedHolder,
  type RecordKind,
  type RevisionOp,
} from '@shared/types.ts'
import { fieldsThatDiffer } from '@shared/fielddiff.ts'
import { UNREADABLE, readFrozen } from '../frozen-membership.ts'
import { versionOf } from '../version.ts'
import {
  checkAnnotationContext,
  checkMessageLead,
  checkMessageQuotes,
  checkMessageTarget,
  contextAsItWouldBeStored,
} from '../targets.ts'
import { whetherAgentsMayInject } from '../inject-setting.ts'
import {
  aNewMessageAsToldTo,
  thePartiesOf,
  theMessageReader,
  keepTheDeliveryRowsInStep,
  whatANewMessageChanges,
  whoAMessageIsTo,
  whyThisInjectIsRefused,
  aMessageHasGoneOut,
} from '../messages.ts'
import { refFrom } from '../message-pool-at-or-after.ts'
import { answeringOfTheAgentsTheseRunsServeMayHaveChanged } from '../answering-told.ts'
import { tellTheParentAChildFinished } from '../worker.ts'
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import {
  readTheMarkedParts,
  theChangeOfWordsThatBreaksAPart,
  theFlagForLabel,
  theFlagsOf,
  theNameOfTheMark,
  THE_INTENT_MARK_IS_SET_WHEN_WRITTEN,
  THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN,
} from '@shared/intent-mark.ts'
import { THE_LABEL_IS_SET_WHEN_WRITTEN } from '@shared/message-label.ts'
import { fileARecordWhoseKindChanged, whereAKindChangeFilesARecord } from '../move.ts'
import {
  A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER,
  ASKS_THE_PERSON_IS_SET_WHEN_WRITTEN,
  WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN,
  ONLY_THE_OFFICE_FOLDS_A_LINE,
  sameParticipant,
  targetOfRecord,
  whyQuotePositionsAreInvalid,
} from '@shared/messages.ts'
import { whyARunsMachineIsNotKnown } from '../machines.ts'
import { assertTheGovernedPlacesAreReal } from '../assert-the-governed-places-are-real.ts'
import {
  checkTheDecisionBasis,
  checkTheFlowSteps,
  checkTheRetiredMark,
  checkWhomTheFlowIsFor,
} from '../flow-reasons.ts'
import { HANDBOOK_KIND } from '@shared/handbooks.ts'
import { checkAHandbookWrite } from '../handbooks.ts'
import { announce } from '../events.ts'
import { type Context } from '@shared/targets.ts'
import { assertMayChangeThisDomain } from '../workdomain.ts'
import { checkWorkDomainIds } from '../check-work-domain-ids.ts'
import { WORK_DOMAIN_KIND } from '@shared/work-domain-kind.ts'
import { assertMayRevokeARegulation } from '../regulations.ts'
import { REGULATION_KIND } from '@shared/regulation.ts'
import { assertMayConfirmAGoal } from '../goals.ts'
import { checkTheToolsetReferences, TOOL_CATEGORY_KIND } from '../toolset.ts'
import { TOOL_KIND } from '@shared/tool-kind.ts'
import {
  refuseACardWordsActOffTheOwnersDecision,
} from '../card-words.ts'
import { checkTheCardWords } from '../check-the-card-words.ts'
import { readTheAddedCardsAgainWhenStored } from '../read-the-added-cards-again-when-stored.ts'
import { refuseAWriteThatTakesTheWordsOfAnAddedCard } from '../refuse-a-write-that-takes-the-words-of-an-added-card.ts'
import { ROLE_CARD_WORDS_KIND } from '../../db/the-words-records-of-each-card.ts'
import { GOAL_KIND } from '@shared/goal.ts'
import { goalIsConfirmed } from '@shared/horizons.ts'
import { hasGoneOut as goneOut } from '../dispatch.ts'
import { refuseAFileTheDoorWouldNotServe } from '../messages/the-file-a-message-may-carry.ts'
import { AGENT_KIND } from '../inbox.ts'
import {
  aCrashedRunEmptiesTheAreaSetForIt,
  keepTheAgentRegistryInStep,
  whyThisIsNotYoursToRetire,
  theStarterAWriteWouldGive,
} from '../participants.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { agentForRecord } from '../../db/agent-for-record.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { isMoleOffice, participantWord, type ParticipantRef } from '@shared/participants.ts'
import { NOTEBOOK_KIND, THE_NOTEBOOK_DOOR } from '@shared/notebook.ts'
import { INCIDENT_KIND, THE_INCIDENT_CLOSING_DOOR, THE_INCIDENT_TIMELINE_DOOR } from '@shared/incident.ts'
import {
  fileTheFlowRunOf,
  recordTheStepsOfAChange,
  theFlowRunOf,
  type FlowRunFiled,
  type FlowRunStepsNotWritten,
} from '../flow-runs.ts'
import { theDraftSendDoorIsWriting } from '../draft-door.ts'
import { theTurnDraftsAreWriting } from '../turn-draft-door.ts'
import { isATurnDraft, ONLY_THE_OFFICE_WRITES_A_TURN_DRAFT } from '@shared/turn-drafts.ts'
// WHETHER THE ANSWER DOOR IS THE WRITER of a report's `answers`. That
// module imports nothing, so reading it here starts no loop. `refuseWhatOnlyTheAnswerDoorWrites` below asks it.
import { theAnswerDoorIsWriting } from '../answer-door.ts'
import { ANSWERS_FIELD } from '@shared/answers.ts'
// WHETHER THE DOOR THAT OWNS A SETTLEMENT ON A RUN'S theCheck, OR ONE OF A RUN'S THREE VERDICTS, IS THE WRITER. That
// module imports nothing, so reading it here starts no loop. `refuseWhatOnlyTheSettlementDoorsWrite` and
// `refuseWhatOnlyTheVerdictDoorsWrite` below ask it.
import {
  SETTLEMENTS_ON_THE_CHECK,
  THE_DOOR_OF,
  TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS,
  theDoorOfThisFieldIsWriting,
} from '../check-field-doors.ts'
import { anOfficeOnlyFieldAWholeDataWouldMove } from '../office-only-run-fields.ts'
import { whyThisWriteMayNotMoveHeldByItsFiler } from '../held-by-its-filer.ts'
import { ONLY_THE_USE_DOOR_WRITES_TOOL_USES, TOOL_USES_FIELD } from '@shared/toolset.ts'
import {
  DRAFT_KIND,
  ONLY_THE_SEND_DOOR_WRITES_SENT,
  WRITTEN_ONLY_BY_THE_SEND_DOOR,
  aSentDraftStandsAsItWasSent,
  sentAsOf,
} from '@shared/drafts.ts'
import {
  refuseAChangeToTheWordsOfThePersonsNote,
  refuseAnAgentsMarkThatTheWordsAreNotThePersons,
  tellTheWriterOfTheNote,
  waitsForThePerson,
} from '../the-persons-own-words.ts'
import { theKeyReminderFor } from '../the-key-reminder-for.ts'
import { theWordsAWriteChanges, theWordsOfAMessage, type AKeyReminder } from '@shared/message-keys.ts'
import { SHORT_FORMS_FIELD as THE_SHORT_FORMS_KEY } from '@shared/zoom.ts'
import { aReleasedRunGoesInUnderANewRun, theBranchGoesInAgainUnderANewRun } from '@shared/merge-queue.ts'
import { SESSION_KIND } from '../../db/agent-identity.ts'
import { whoWroteRecord } from '../../db/who-wrote-record.ts'
import { settleShortForms } from '../zoom.ts'
import {
  checkNoDutiesRestOn,
  checkTheSecretaryDuties,
  checkTheDutiesTakenAway,
  theActThatWouldStrandTheDuties,
} from '../grant/secretary-duties.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import { checkTheParticipantsNamed } from '../participant-fields.ts'
import { writeTheNextDayOfADailyObligation } from '../daily-obligations.ts'
import { getRecord } from './reading.ts'
import { checkAndNormalizeTerritory, type TerritoryWriteCheck } from './territory.ts'
import { writeTheEndedRunLookMark } from './run-writes.ts'
import { now } from '@shared/now.ts'
import { sameJson } from '@shared/same-json.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import {
  A_NOTICE_IS_THE_OFFICES,
  aClaimToAnswerForTheRun,
  aClaimToBeThePerson,
  type Actor,
  actorMayActAsSecretaryOrThePerson,
  aFinishedRunsKeyAskedForMore,
  AN_EXPORT_IS_WRITTEN_BY_THE_SERVER,
  andList,
  aSealedRunWritesOnlyItsServed,
  assertABundleShiftIsAMove,
  assertARunCarriesNoOtherAgentsConversation,
  assertMainSuiteFixController,
  assertMayChangeACanonicalMethod,
  assertMayPassTheQuestionOn,
  assertMayPinAFork,
  assertMayReclassifyAFork,
  assertMayRemoveAnAsk,
  assertMayShapeTheFuture,
  assertMayShelve,
  assertMayTakeARecordOutOfItsKind,
  assertMayWrite,
  assertMayWriteACountOfWhatIsWaiting,
  assertMayWriteAnExportList,
  assertMayWriteASandbox,
  assertMayWriteServed,
  assertNobodyTypesWhoRecordedIt,
  assertOptionsForThemAreTheirMove,
  assertThisCallerMayFileASessionFor,
  assertThisCallerMayNameThisParent,
  authoritativeMainSuiteFix,
  blockMustBeFiledInAPipeline,
  checkAgentHandle,
  checkAgentNotes,
  checkAgentRole,
  checkAgentStartFolder,
  checkBlockIds,
  checklistLines,
  checkNobodyIsChangingAStartFolder,
  checkNobodyIsChangingBroadcastTimes,
  checkNobodyIsWritingTheirOwnCard,
  checkNobodyIsWritingTheirOwnCredential,
  checkNobodyIsWritingTheirOwnRaise,
  checkPlannedStateIds,
  checkTheNotebook,
  checkTheNotebookEntries,
  checkWhoMayFileAnIncident,
  chosenRecipientAsStored,
  type DataPatchOutcome,
  type FutureAct,
  isPlanned,
  mayEndARun,
  mergeData,
  ONLY_THE_ANSWER_DOOR_WRITES_ANSWERS,
  ONLY_THE_CRITICISM_DOOR_WRITES_INDEPENDENT,
  onlyItsDoorWritesThisVerdict,
  onlyItsWriterChangesAMessage,
  pipelinesHolding,
  planIdsIn,
  PROPOSAL_KIND,
  recordInWorkspace,
  type RecordPatch,
  refuseAChineseHalfNotFromThisEnglish,
  refuseAGenericUpgradeNotice,
  refuseAnOutlineChangeWithoutTheirDecision,
  refuseAQuestionThatNamesNothing,
  sameAgent,
  saveRevision,
  tellThePagesWhenARequestWaitsForThePerson,
  THE_DEAD_LETTER_SWEEP,
  THE_OFFICE_FOLDS_ITS_LINES,
  THE_OFFICES_OWN_LINE,
  THE_START_AN_AGENT_DOOR,
  theAgentThatStarted,
  theBroadcastScheduleWriteIsOpen,
  theCallersAgentRow,
  theClaimedSenderIsTheWriter,
  theConversationsARunNames,
  theHandleOfAStoredAgent,
  theParentADataGives,
  thePinnedSuiteReceipt,
  theRecordTheDoorWrites,
  theRetireDoorIsOpen,
  theRoleRequestDoorIsWriting,
  theRunsAgentByItsCanonicalId,
  theSecretaryOfThisOffice,
  theStateAWriteLeaves,
  theTwoHalvesOfAStamp,
  theWriterAStampNames,
  validateMainSuiteFixNoticeRecipients,
  whetherThisWriteFinishesTheRun,
  whoFiled,
  WHY_A_BLOCK_NAME_MAY_NOT_REPEAT,
  writtenFromAStaleCopy,
} from '../records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { logChange } from '../log-change.ts'
import { named } from '@shared/named.ts'
import { noRecordHasThisId } from '../no-record-has-this-id.ts'
import { toRecord } from '../to-record.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'

function validateMainSuiteFixTransition(id: string, after: unknown, actor: Actor, workspaceId: string, ifVersion: string | undefined): void {
  const current = authoritativeMainSuiteFix(id, workspaceId)
  assertMainSuiteFixController(actor, current.claim, workspaceId)
  if (after === undefined) throw new PanelError('The original mainSuiteFix namespace cannot be removed by a machine transition. Nothing was written.', 409)
  // Read proof before shape/CAS so another run cannot learn a route to claiming this controller's work.
  const candidate = mainSuiteFixSchema.parse(after)
  assertMainSuiteFixController(actor, candidate.claim, workspaceId)
  validateMainSuiteFixNoticeRecipients(candidate)
  if (ifVersion === undefined) throw new PanelError('mainSuiteFix transitions require the current ifVersion. Nothing was written.', 409)
  if (JSON.stringify(mainSuiteFixPinned(current)) !== JSON.stringify(mainSuiteFixPinned(candidate))) throw new PanelError('mainSuiteFix original receipt, cause and deadline correlation cannot drift. Nothing was written.', 409)
  if (current.outcome !== undefined && JSON.stringify(current.outcome) !== JSON.stringify(candidate.outcome)) throw new PanelError('A mainSuiteFix outcome is terminal. Nothing was written.', 409)
  validateMainSuiteFixVerification(candidate, current, id, workspaceId)
  validateMainSuiteFixOutcome(candidate, id, workspaceId)
}

function validateMainSuiteFixOutcome(value: MainSuiteFix, problem: string, workspaceId: string): void {
  if (value.outcome === undefined) return
  const returned = 'returned' in value.outcome
  const correlation = returned ? value.takeout : value.repair
  const entryId = correlation?.entry
  const entry = entryId === undefined ? null : recordInWorkspace(entryId, workspaceId)
  const reference = entry?.data['fixRound'] as { problem?: unknown; kind?: unknown } | undefined
  const landed = entry?.data['integrated'] as { mainAfter?: unknown; at?: unknown } | undefined
  if (entry === null || entry.kind !== 'merge_entry' || entry.data['state'] !== 'merged' || reference?.problem !== problem || reference.kind !== (returned ? 'takeout' : 'repair') || entry.data['run'] !== correlation?.run || typeof landed?.mainAfter !== 'string') {
    throw new PanelError('A repair outcome requires its correlated normal merge entry to have actually landed. Nothing was written.', 409)
  }
  if (returned) {
    if (!('returned' in value.outcome) || value.outcome.returned !== entryId) throw new PanelError('Returned must name the actual landed take-out entry. Nothing was written.', 409)
    return
  }
  const green = thePinnedSuiteReceipt(value.fixedReceipt!, workspaceId)
  if (!('fixed' in value.outcome) || !wholeSuiteReceiptIsGreen(green.data) || green.data['repository'] !== value.repository || green.data['commit'] !== value.outcome.fixed || !originalGreenFollowsRepair({ endedAt: green.data['endedAt'], landedAt: landed.at, originalEndedAtMs: value.endedAtMs, timeZone: value.timeZone })) {
    throw new PanelError('Fixed requires the landed repair and a later original green receipt of that exact main commit. Nothing was written.', 409)
  }
  assertRepairAncestry(value.repository, landed.mainAfter, value.outcome.fixed)
}

function assertRepairAncestry(repository: string, repair: string, target: string): void {
  try { readGit(repository, ['merge-base', '--is-ancestor', repair, target], { timeoutMs: 10_000 }) }
  catch { throw new PanelError('The exact verification target does not prove ancestry of the actually landed repair. Nothing was written.', 409) }
}

function validateMainSuiteFixVerification(value: MainSuiteFix, previous: MainSuiteFix, problem: string, workspaceId: string): void {
  const verification = value.verification
  const prior = previous.verification
  if (prior !== undefined && (verification === undefined || prior.repairCommit !== verification.repairCommit || prior.targetCommit !== verification.targetCommit || (prior.attempt !== undefined && prior.attempt !== verification.attempt))) {
    throw new PanelError('The reserved verification attempt and exact source cannot be replaced. Nothing was written.', 409)
  }
  if (verification === undefined) return
  if (prior === undefined && verification.state !== 'planned') throw new PanelError('Plan verification before reserving its producer invocation. Nothing was written.', 409)
  if (prior?.state === 'planned' && !['planned', 'attempted'].includes(verification.state)) throw new PanelError('Reserve the verification attempt before recording its result. Nothing was written.', 409)
  if (prior?.attempt !== undefined && verification.state === 'planned') throw new PanelError('An invoked verification cannot become a new plan. Nothing was written.', 409)
  if (prior?.receipt !== undefined && JSON.stringify(prior.receipt) !== JSON.stringify(verification.receipt)) throw new PanelError('An observed original verification receipt cannot be replaced. Nothing was written.', 409)
  const entry = value.repair?.entry === undefined ? null : recordInWorkspace(value.repair.entry, workspaceId)
  const reference = entry?.data['fixRound'] as { problem?: unknown; kind?: unknown } | undefined
  const landed = entry?.data['integrated'] as { mainAfter?: unknown } | undefined
  if (entry === null || entry.kind !== 'merge_entry' || entry.data['state'] !== 'merged' || reference?.problem !== problem || reference.kind !== 'repair' || entry.data['run'] !== value.repair?.run || landed?.mainAfter !== verification.repairCommit) {
    throw new PanelError('Verification reserves an attempt only for its actually landed correlated repair. Nothing was written.', 409)
  }
  assertRepairAncestry(value.repository, verification.repairCommit, verification.targetCommit)
  if (verification.receipt === undefined) return
  const receipt = thePinnedSuiteReceipt(verification.receipt, workspaceId).data
  const outcome = wholeSuiteReceiptIsGreen(receipt) ? 'green' : typeof receipt['buildExitCode'] === 'number' && receipt['buildExitCode'] !== 0 ? 'build-failed' : typeof receipt['suiteExitCode'] === 'number' && receipt['suiteExitCode'] !== 0 ? 'red' : 'incomplete'
  if (receipt['repository'] !== value.repository || receipt['commit'] !== verification.targetCommit || outcome !== verification.outcome) throw new PanelError('Verification result must match its original exact-target receipt. Nothing was written.', 409)
}

/**
 * `responsibility` MAY ONLY BE CHANGED BY A SECRETARY OR THE PERSON. Criterion I4.
 *
 * PATCH ONLY: `responsibility` may be set at filing by whoever is filing, and filing is already
 * gated to a secretary or the person by `checkWhoMayFileAnIncident`, so there is nothing left to
 * check on the create path. A write that leaves `responsibility` exactly as it was is not a change
 * and passes, the same reading `checkTheNotebookEntries` gives an unchanged `entries`: a
 * whole-object `data` PATCH carries every field including ones the caller never meant to touch.
 */
function checkTheIncidentResponsibility(arriving: unknown, before: unknown, actor: Actor): void {
  if (!isJsonObject(arriving) || !Object.hasOwn(arriving, 'responsibility')) return
  const now = isJsonObject(before) ? before['responsibility'] : undefined
  if (JSON.stringify(arriving['responsibility']) === JSON.stringify(now)) return
  if (actorMayActAsSecretaryOrThePerson(actor)) return
  throw new PanelError(
    `Changing responsibility on an incident is the secretary's or the person's own act. This request came ` +
      `from ${actor.type} "${actor.id}", so nothing was written and responsibility reads exactly as it did. ` +
      `These three sentences are the office's own account of who answers for what, and an agent that could ` +
      `rewrite them could rewrite its own share of it. Write what you think responsibility should say in a ` +
      `message instead, and let the secretary or the person change the record.`,
    403,
  )
}

/**
 * `timeline` IS WRITTEN BY ITS OWN DOOR AND BY NOTHING ELSE. Criteria I1 and I4, on the same
 * argument `checkTheNotebookEntries` makes for a notebook's `entries`: each moment says who or what
 * did it, what happened, when, and the record that is its evidence, and the door
 * (`POST /api/records/:id/timeline`) writes the moment's own id and checks that its evidence really
 * exists. A caller that could send `timeline` directly could add a moment naming evidence nothing
 * answers to, or rewrite one that is already there.
 *
 * PATCH ONLY, AND UNCONDITIONALLY SO — UNLIKE `checkTheNotebookEntries` THERE IS NO "EMPTY ON
 * CREATE IS FINE" CASE. A notebook may be created with an empty `entries` because nothing about
 * that loses anything; an incident may not be created with an empty `timeline` at all —
 * `checkTheIncidentHasLossAndTimeline` already refuses that on the create path — so this function
 * is never asked the question on a create and does not need to answer it.
 */
function checkTheIncidentTimeline(arriving: unknown, before: unknown, throughTheDoor: boolean, id: string): void {
  if (throughTheDoor) return
  if (!isJsonObject(arriving) || !Object.hasOwn(arriving, 'timeline')) return
  const now = isJsonObject(before) ? before['timeline'] : undefined
  if (JSON.stringify(arriving['timeline']) === JSON.stringify(now)) return
  throw new PanelError(
    `An incident's timeline is written by its own door and not by a record write. Nothing was written. Each ` +
      `moment says who or what did it, what happened, when, and the record that is its evidence, and the door ` +
      `writes the moment's own id and checks that its evidence really exists — a write that could send ` +
      `"timeline" directly could add a moment with no such check at all. Append one with ` +
      `POST /api/records/${id}/timeline {"at":"…","who":"…","what":"…","evidence":"<record id>"}. Everything ` +
      `else about this record — its title, its loss, its responsibility, its corrective actions — is an ` +
      `ordinary edit.`,
    403,
  )
}

/**
 * `state` MAY NOT MOVE TO `closed` EXCEPT THROUGH THE CLOSING DOOR. Criterion I7: "the person or a
 * secretary closes an incident when its corrective decisions are done, with one line saying so." A
 * caller that could send `dataPatch: {"state":"closed"}` directly could close one with no note at
 * all, so this refuses that write unless it carries the door's own mark.
 * `POST /api/records/:id/close-incident` is the only caller that sets it, and the person-or-secretary
 * check lives there, beside the note it requires — the same split `checkTheIncidentTimeline` makes
 * between the shape guard here and the role check at the route.
 *
 * MOVING OFF `closed` IS AN ORDINARY EDIT. Nothing in criterion I7 locks a closed incident against being
 * reopened, and a lock nobody asked for is the speculative abstraction invariant 6 refuses.
 */
function checkTheIncidentClosing(arriving: unknown, before: unknown, throughTheDoor: boolean): void {
  if (throughTheDoor) return
  if (!isJsonObject(arriving) || !Object.hasOwn(arriving, 'state')) return
  if (arriving['state'] !== 'closed') return
  const now = isJsonObject(before) ? before['state'] : undefined
  if (now === 'closed') return
  throw new PanelError(
    `An incident is closed only through its own door. Nothing was written. Closing takes one line ` +

      `saying the corrective decisions are done, and a plain write to "state" cannot carry that line. Close it ` +
      `with POST /api/records/<this incident>/close-incident {"note":"…"}.`,
    403,
  )
}

/** Each part's own fields — its heading and anything else on it — without the lines beneath it. */
function checklistParts(data: unknown): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>()
  if (!isJsonObject(data)) return found
  const parts = data['parts']
  if (!Array.isArray(parts)) return found
  for (const [index, part] of parts.entries()) {
    if (!isJsonObject(part)) continue
    const { items: _items, ...rest } = part
    found.set(typeof part['id'] === 'string' ? part['id'] : `#${index}`, rest)
  }
  return found
}

/** A checklist key as a person reads it: "the line i2 in part mount". */
function readKey(key: string): string {
  const [part, item] = key.split('\u0000')
  return item === undefined ? `part "${part}"` : `"${item}" in part "${part}"`
}

/**
 * Which keys of one checklist line the incoming copy would change. `[]` means it changes nothing.
 *
 * KEY ORDER IS NOT CONTENT and neither is an absent key against a null one. `versionOf`'s own
 * header warns about the mirror image of this — a compare-and-set that refuses a write losing
 * nothing — and the same mistake here would refuse a client that rebuilt an item from its own
 * model with the keys in another order. So this compares key by key, sorted, and treats absent and
 * null as the same missing value. Nested objects are compared by their stable-key JSON, which is
 * the same reading `mergeData` would store.
 */
function rewrittenKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.filter((key) => key !== 'id' && stableJson(before[key]) !== stableJson(after[key]))
}

/** A value as text, with object keys in a fixed order, so two equal values read the same. */
function stableJson(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isJsonObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

// ============================================ CHANGING WHAT KIND OF THING A RECORD IS
//
// A record's kind was fixed at creation until 17 August 2026. `PATCH /api/records/:id` refused the
// key outright, and the only way to correct a first choice was to delete the record and write it
// again. A mistaken initial kind must remain correctable without deleting and recreating the
// record. A change preserves stored values and reports incompatibilities rather than discarding data.
//
// ---------------------------------------------------------------------------------------
// THE RULE THIS PATH KEEPS: NOTHING STORED IS DISCARDED, AND WHAT MOVED IS NAMED
// ---------------------------------------------------------------------------------------
//
// Each kind declares its own fields in KIND_SPECS, and every kind declares an `extra` bag. When the
// new kind has no place for a field the record is holding, that field's value is moved into `extra`
// under the key it already had, and the reply names every one that moved and where it went. Nothing
// is dropped, nothing is invented, and the change is not refused because of one field.
//
// That is invariant 8 of USER.md — what Mole Office made of your change is shown back to you —
// applied to the one edit that can quietly cost you a field.
//
// ---------------------------------------------------------------------------------------
// WHAT DECIDES WHETHER A VALUE FITS IS THE WRITE GATE, NEVER A SECOND COPY OF THE TYPE RULES
// ---------------------------------------------------------------------------------------
//
// `moveWhatTheNewKindCannotHold` asks `validateData` — the same function every POST and every
// PATCH goes through — and reads the paths it complains about. So a field spec that changes, a
// vocabulary that grows a word, a nested shape that gains a rule and a kind added tomorrow all
// reach this path without it being touched, and what is moved here is exactly what a POST of the
// new kind would have refused. Deciding it here from a hand-written table of "what is compatible
// with what" would be the same fact worked out in two places, which is the defect this repository
// keeps producing.
//
// ---------------------------------------------------------------------------------------
// WHY `data` AND `dataPatch` MAY NOT RIDE ALONG
// ---------------------------------------------------------------------------------------
//
// A kind change rewrites `data` itself, and a `data` or `dataPatch` in the same request would be a
// second writer of the same object in one write. Worse, the same key means different things under
// the two kinds — `state` alone has eight separate vocabularies across the kinds — so Mole Office could
// not tell whether the fields sent were written for the kind the record is or the kind it is
// becoming. Guessing which is exactly the silent substitution rule 2 forbids, so it is refused and
// the caller is told to send two writes. `title`, `summary` and `ifVersion` mean the same thing
// whatever the kind and may be sent with it.

/** One field that could not stay where it was, and where its value is now. */
export interface FieldKeptInExtra {
  /** The key it was stored under. It keeps that key inside `extra`. */
  key: string
  /** The full path it is stored at now, so the reply names the place and not only the field. */
  nowAt: string
  /** Why it could not stay, in one sentence, with the field key and the validator's own words. */
  why: string
  /**
   * The same reason as a clause a person reads: "a problem has no estimate".
   *
   * WHY THERE ARE TWO. `why` is the whole account and it is what an agent and Developer mode need.
   * This is what goes into the sentence printed in the plan table's ninety-pixel cell. Both are
   * built in the same place from the same branch, so they cannot come to disagree about what
   * happened; they differ only in how much they say. `ChildAdopted` in lib/plans.ts is the same
   * pair for the same reason.
   */
  plainly: string
}

/**
 * One value that was already sitting in `extra` when the kind changed, and what became of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A VALUE COMES BACK — the defect this exists to fix, measured 18 August 2026
 * ---------------------------------------------------------------------------------------
 *
 * A person typed `6h` on a plan line, tracked it as a task, and changed the kind twice. A problem
 * has no estimate, so the 6 was moved into `extra` and Mole Office said it had been kept. It had been:
 * `data.extra.effort_hours` held it and nothing in the product could read it there. Changing back
 * to a task did not bring it back, because the move only ever went one way. The sentence was
 * therefore true and useless at the same time, which is worse than either.
 *
 * The owner's rule for this path is *"preserve what can be preserved"*. A value parked in `extra`
 * whose key the new kind DECLARES, and which that kind's own validation accepts, is exactly what
 * can be preserved, so it comes home and the reply says so.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NEVER OVERWRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * A value the record is holding at that key right now. Two values want one place and only the
 * person can say which is meant, so the stored one stays, the one in `extra` stays where it is,
 * and this says so. Choosing between them would be Mole Office deciding which of two things somebody
 * wrote it believes.
 */
export interface FieldFromExtra {
  /** The key, inside `extra` and on the record. They are the same key; that is what makes this work. */
  key: string
  /** Where it was: `data.extra.<key>`. */
  wasAt: string
  /** True when it is on the record now. False when it stayed in `extra`, and `why` says why. */
  restored: boolean
  /** Why it came back, or why it could not, with the field key and the validator's own words. */
  why: string
  /** The same reason as a clause a person reads. See `plainly` on FieldKeptInExtra. */
  plainly: string
}

/** What changing a record's kind did. Reported on the patch that did it. */
export interface KindChangeOutcome {
  from: RecordKind
  to: RecordKind
  /**
   * False when the record was already this kind. Nothing was written, and no change row exists —
   * a history saying a record was changed from a task to a task is a history that has to be read
   * to find out that nothing happened.
   */
  changed: boolean
  /** Every field moved into `extra` to keep its value. Empty when every field fitted the new kind. */
  kept: FieldKeptInExtra[]
  /**
   * Every value already in `extra` that the NEW kind declares a field for, and what became of it.
   *
   * Empty in the ordinary case, because `extra` is usually empty. One entry per candidate,
   * restored or not: a value that could not come back is reported for the same reason a value that
   * did is, which is that the record changed in a way the caller did not ask for and cannot see.
   */
  broughtBack: FieldFromExtra[]
  /**
   * WHAT HAPPENED, IN THE WORDS A PERSON READS. No stored paths and no requests.
   *
   * The plan table prints this in a cell about ninety pixels wide, so it is what a person reads in
   * the second their answers move. It used to be `detail` below, and the reader met
   * *"One field a problem has no place for was kept under "extra" rather than dropped: "state" is
   * now at data.extra.state. Nothing reads "extra" …"* and could not act on any of it.
   */
  note: string
  /**
   * THE SAME NEWS WITH THE EXACT PLACES IN IT, for an agent and for Developer mode.
   *
   * Built beside `note` from the same two lists, so the short answer cannot come to say something
   * the long one does not. `kept[].nowAt` and `broughtBack[].wasAt` carry the same paths as data.
   */
  detail: string
}

/**
 * The top-level `data` key one validation error is about, or null when it is about none.
 *
 * Paths look like `data.state`, `data.parts[0].name` or `data.numbers.trials`. A field is moved
 * whole or not at all, so the key is what matters and the rest of the path is not read.
 */
function fieldPathBelongsTo(path: string): string | null {
  if (!path.startsWith('data.')) return null
  const rest = path.slice('data.'.length)
  const cut = rest.search(/[.[]/)
  return cut === -1 ? rest : rest.slice(0, cut)
}

/**
 * What is planned against this record and would be left pointing at work that cannot hold hours.
 *
 * FOUR TABLES, AND EACH ONE REFUSES A RECORD OUTSIDE `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` AT THE MOMENT
 * IT IS WRITTEN. `createAllocation` and `createRecurrence` ask `checkAllocatable` in
 * lib/planning.ts, `createWindow` asks `checkSchedulable` in lib/windows.ts, and binding a plan line
 * to work asks the same list in lib/plans.ts. So a row in any of them is a standing claim that this
 * record is work a plan may give time to.
 *
 * `planning_intents` IS DELIBERATELY NOT HERE. An intent is words somebody wrote about time before
 * any of it is a fact, and `createIntent` checks only that the record exists — the words are worth
 * keeping whatever the record turns out to be, and the allocatable question is asked when somebody
 * commits them. Counting them here would refuse a kind change over something that is not a claim.
 *
 * Counted rather than listed whole: a record may hold many weeks of hours, and a refusal naming
 * forty periods is a refusal nobody reads. The first few of each are named so the sentence points
 * somewhere real.
 */
function plannedAgainst(recordId: string): {
  allocations: { id: string; period: string }[]
  windows: { id: string; startsOn: string; endsOn: string }[]
  recurrences: { id: string }[]
  planLines: { id: string; planId: string }[]
  total: number
} {
  const allocationRows = db
    .select({ id: allocations.id, period: allocations.period })
    .from(allocations)
    .where(eq(allocations.recordId, recordId))
    .all()
  const windowRows = db
    .select({ id: workWindows.id, startsOn: workWindows.startsOn, endsOn: workWindows.endsOn })
    .from(workWindows)
    .where(eq(workWindows.recordId, recordId))
    .all()
  const recurrenceRows = db
    .select({ id: planningRecurrences.id })
    .from(planningRecurrences)
    .where(eq(planningRecurrences.recordId, recordId))
    .all()
  const lineRows = db
    .select({ id: planLines.id, planId: planLines.planId })
    .from(planLines)
    .where(eq(planLines.recordId, recordId))
    .all()
  return {
    allocations: allocationRows,
    windows: windowRows,
    recurrences: recurrenceRows,
    planLines: lineRows,
    total: allocationRows.length + windowRows.length + recurrenceRows.length + lineRows.length,
  }
}

/** "3 things" or "1 thing", so a refusal reads as a sentence rather than as a count. */
function countedAs(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * A kind this record may not become, refused before anything is written.
 *
 * Every rule here is a rule `createRecord` already applies to a record of the new kind, read off
 * the same list or thrown with the same sentence, so the two cannot come to disagree about what a
 * kind means. The two that are not `createRecord`'s are the pipeline pair, and they are marked.
 */
function refuseAKindThisRecordCannotBecome(before: PanelRecord, to: RecordKind, actor: Actor): void {
  // A kind nothing declares. The HTTP route's zod enum refuses this first and in the same terms;
  // this is for the seed, the importer and the tests, which never go through a route.
  if (!(RECORD_KINDS as readonly string[]).includes(to)) {
    throw new PanelError(
      `"${String(to)}" is not a kind of record Mole Office has, so nothing was written and "${before.title}" is still ` +
        `a ${before.kind}. The kinds are: ${RECORD_KINDS.join(', ')}. GET /api/kinds says what each one is for ` +
        `and what it takes.`,
    )
  }

  // HUMAN-ONLY, ASKED ABOUT THE KIND THE RECORD WOULD BECOME. The guard at the top of `patchRecord`
  // asks it about the kind the record IS, which stops an agent editing a decision; this stops an
  // agent making one. Both call `assertMayWrite`, which is the one place the rule and its wording
  // live, so neither can drift from the other or from the delete, the restore and the move.
  //
  // IT USED TO BE ITS OWN COPY, and the copy asked only about `actor.type`. `assertMayWrite` also
  // refuses a request that sent no actor headers at all, so a header-less PATCH could turn a note
  // into a decision — filing a governance record with nothing saying who filed it.
  assertMayWrite(to, 'change', actor, before.id)

  if (to === 'whole_suite_receipt') {
    throw new PanelError(readStoredWord('server.receiptNeedsOriginalRun'), 409, undefined, undefined, undefined,
      { code: 'receiptNeedsOriginalRun', values: {} })
  }

  // A BLOCK CANNOT BE FILED ON ITS OWN, and turning an existing record into one would be exactly
  // that: the two facts that live on a block's pipeline — where it comes in the order, and the
  // pipeline half of its title — would both be missing. The sentence is
  // `blockMustBeFiledInAPipeline`'s, imported rather than written again, so this refusal and the
  // one a bare POST gets cannot drift apart. lib/plans.ts does the same at its own block gate.
  if (to === BLOCK_KIND) {
    throw new PanelError(
      `A ${before.kind} cannot be changed into a block. ${blockMustBeFiledInAPipeline(before.title)}`,
    )
  }

  // ---- the two the create path has no need for, because nothing exists yet to break ----------
  //
  // Both are the same defect in two directions: a pipeline's `blockIds` is the ONE statement that a
  // block belongs to it, `checkBlockIds` requires every id in it to name a live record of kind
  // `block`, and neither end is re-checked when the other end changes. Letting either move would be
  // one record's write silently breaking a different record — the pipeline could never be written
  // to again, and it would draw a hole where the step was — with nothing anywhere saying so.

  // EVERY PIPELINE HOLDING IT, not the first one the scan meets. Several may list one block since 6
  // September 2026, and a refusal that named one of two would send the writer to take the block out
  // of that one and meet the same refusal again from the other.
  if (before.kind === BLOCK_KIND) {
    const holders = pipelinesHolding(before.id)
    if (holders.length > 0) {
      const named = holders.map((one) => `"${one.title}" (${one.id})`).join(', ')
      throw new PanelError(
        `"${before.title}" is a step of ${holders.length === 1 ? 'the pipeline' : `${String(holders.length)} pipelines`}: ` +
          `${named}. Its kind cannot be changed while any of them lists it. A pipeline's blockIds holds blocks and ` +
          `nothing else, so the pipeline would then name a ${to} at that position, draw a hole where the step was, ` +
          `and refuse its own next write. Nothing was written. Take it out of ` +
          `${holders.length === 1 ? 'that order' : 'every one of those orders'} first with ` +
          `${holders.map((one) => `DELETE /api/records/${one.id}/blocks/${before.id}`).join(', ')}, then change the kind.`,
      )
    }
  }

  if (before.kind === 'pipeline') {
    const held = blockIdsOf(before)
    if (held.length > 0) {
      throw new PanelError(
        `"${before.title}" is a pipeline holding ${held.length} ${held.length === 1 ? 'step' : 'steps'}, so its ` +
          `kind cannot be changed while it holds them. A ${to} has no blockIds, so the order would be kept under ` +
          `"extra" where nothing reads it, and ${held.length === 1 ? 'that block would' : 'those blocks would'} ` +
          `belong to no pipeline at all — each one keeps a title qualified by a pipeline that is no longer one. ` +
          `Nothing was written. Take the steps out first with DELETE /api/records/${before.id}/blocks/<block id>, ` +
          `then change the kind.`,
      )
    }
  }

  // ---- a third of the same shape: the plan already points at this record ----------------------
  //
  // ---------------------------------------------------------------------------------------
  // THE CHOICE MADE HERE, AND THE ONE THAT WAS NOT
  // ---------------------------------------------------------------------------------------
  //
  // `PATCH /api/records/:id` has taken `kind` since 17 August 2026. Four write paths check
  // `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` before they will point at a record — an allocation, a window, a
  // recurrence and a plan line's binding — and nothing asked the question again afterwards. So
  // changing a task into a note left hours allocated to a note, a block on a week naming a note, and
  // a plan line bound to work no plan may give time to. Every one of those was written under a rule
  // the record no longer meets, and nothing anywhere said so.
  //
  // TWO ANSWERS WERE DEFENSIBLE AND THIS FILE TAKES THE FIRST.
  //
  //   1. REFUSE while something depends on it, naming what to remove first. Taken. It follows the
  //      two refusals directly above, which are the same defect in the same shape: one record's
  //      write silently breaking a different record. It is reversible — remove the hours, change the
  //      kind, put them back if the new kind can hold them — and it never destroys anything. It also
  //      keeps one rule for one question: `KINDS_A_PLAN_CAN_GIVE_HOURS_TO` decides what may hold
  //      hours, at every moment and not only at the moment of writing.
  //
  //   2. ALLOW IT AND REPORT THE DANGLING HOURS WHEREVER THEY ARE READ. Not taken, and the cost of
  //      not taking it is stated rather than hidden: a person who mis-typed a kind must now tidy the
  //      plan before correcting it, which is friction on the exact path owner message §3 asked to be
  //      made easy. What it would take is also more than a message — the Plan, the Schedule, the
  //      week arithmetic and the record page each read these rows, and every one of them would need
  //      a way to say "these hours are given to something that cannot hold them". Five surfaces
  //      carrying a state nothing can create is more code than the refusal, and until they all
  //      carried it the hours would be silently wrong in whichever one was missed.
  //
  // NOTHING IS DELETED AND NOTHING IS SILENTLY REFUSED: the sentence names every kind of thing that
  // depends on this record, gives the request that removes one, and says what happens if you would
  // rather keep them.
  if (!(KINDS_A_PLAN_CAN_GIVE_HOURS_TO as readonly string[]).includes(to)) {
    const planned = plannedAgainst(before.id)
    if (planned.total > 0) {
      // WHAT POINTS AT IT AND HOW TO TAKE EACH ONE OFF, built together so the sentence can never
      // name a way out that does not exist. A recurrence has no route of its own — nothing in the
      // API creates or removes one today — so its line says that instead of inventing a request.
      const what: string[] = []
      const how: string[] = []
      if (planned.allocations.length > 0) {
        what.push(
          `${countedAs(planned.allocations.length, 'allocation of hours', 'allocations of hours')} ` +
            `(${planned.allocations.slice(0, 3).map((a) => a.period).join(', ')}` +
            `${planned.allocations.length > 3 ? ', …' : ''})`,
        )
        how.push(`DELETE /api/planning/allocations/${planned.allocations[0]?.id ?? '<id>'} takes hours off`)
      }
      if (planned.windows.length > 0) {
        what.push(
          `${countedAs(planned.windows.length, 'span on the schedule', 'spans on the schedule')} ` +
            `(${planned.windows.slice(0, 3).map((w) => `${w.startsOn} to ${w.endsOn}`).join(', ')}` +
            `${planned.windows.length > 3 ? ', …' : ''})`,
        )
        how.push(`DELETE /api/planning/windows/${planned.windows[0]?.id ?? '<id>'} takes it off the schedule`)
      }
      if (planned.recurrences.length > 0) {
        what.push(countedAs(planned.recurrences.length, 'recurring routine', 'recurring routines'))
        how.push('a recurring routine cannot be removed through the API yet, so that one has to go first')
      }
      if (planned.planLines.length > 0) {
        const line = planned.planLines[0]
        what.push(
          `${countedAs(planned.planLines.length, 'plan line', 'plan lines')} filed as this work ` +
            `(plan ${[...new Set(planned.planLines.map((l) => l.planId))].slice(0, 3).join(', ')})`,
        )
        how.push(
          `PATCH /api/plans/${line?.planId ?? '<plan>'}/lines/${line?.id ?? '<line>'} {"recordId":null} takes ` +
            'the work off a line and keeps both',
        )
      }
      // ONE RULE FOR JOINING A WORD TO ITS ARTICLE, in shared/work.ts. This used to be worked out
      // inline here and in two other server files, and a fourth place did not work it out at all —
      // which is how "This record was a obligation and is now a problem" reached a reader.
      const becomes = withArticle(to)
      const wasA = withArticle(before.kind)
      throw new PanelError(
        `"${before.title}" has time planned against it, and ${becomes} is not one of the kinds a plan can give ` +
          `time to: ${KINDS_A_PLAN_CAN_GIVE_HOURS_TO.join(', ')}. What points at it: ${what.join('; ')}. ` +
          `Nothing was written and it is still ${wasA}. Take the plan off it first — ` +
          `${how.join('; ')} — then change the kind. If the plan is what you meant to keep, the kind it has ` +
          `now is the one that lets you keep it.`,
      )
    }
  }
}

/**
 * The `data` this record would hold as a `to`: what had to move out, and what can come back.
 *
 * Three passes. The first two move a value OUT of the record and into `extra`, and the third moves
 * one back the other way. The two directions are what makes a mis-typed kind correctable rather
 * than merely survivable: task → problem → task ends with the task it started as.
 *
 * The first two answer two different questions:
 *
 *   1. A field the new kind DOES NOT DECLARE AT ALL. Its value moves into `extra` under its own
 *      key. This is the common case — a `task`'s `command` on a `problem`, a `problem`'s `symptom`
 *      on a `task`.
 *   2. A field the new kind DOES declare, holding a value it cannot take: a state word from another
 *      kind's vocabulary, a boolean where the new kind wants one of two words. `read` is `boolean`
 *      on a `message` and `'read' | 'unread'` on a `report`, and `state` has a different vocabulary
 *      on each of the eight kinds that declare one, so this is not a rare corner. The value moves
 *      into `extra` too, rather than being stored somewhere the new kind's own validation would
 *      refuse it. THE VALIDATOR SAYS WHICH FIELDS THESE ARE, so this pass cannot disagree with what
 *      a POST of the new kind would accept.
 *
 * The third asks the opposite question, and it is why the same record can go back and forth:
 *
 *   3. A KEY ALREADY IN `extra` THAT THE NEW KIND DECLARES. Its value comes back onto the record,
 *      as long as the record is not already holding something at that key and as long as the new
 *      kind's own validation accepts it — both checked here, both reported either way. This is what
 *      makes task → problem → task give the estimate back. Only keys that were in `extra` BEFORE
 *      this write are candidates, so nothing moves out and back in one change.
 *
 * A field the record does not hold and `extra` has nothing for is not this function's business:
 * the record simply becomes incomplete for its new kind, which is a real and honest state that
 * `completenessOf` already reports on every read and every write.
 *
 * Throws when the move itself cannot be made honestly — when `extra` is not a bag, or when moving
 * a field into it would write over something already there. Both leave the record untouched.
 */
function moveWhatTheNewKindCannotHold(
  record: PanelRecord,
  to: RecordKind,
): { data: Record<string, unknown>; kept: FieldKeptInExtra[]; broughtBack: FieldFromExtra[] } {
  const from = record.kind
  const stored = record.data
  if (!isJsonObject(stored)) {
    throw new PanelError(
      `This ${from}'s data is not an object, so Mole Office cannot tell which fields it is holding and cannot say ` +
        `which of them a ${to} has no place for. Nothing was written. Send the fields as an object first — ` +
        `PATCH /api/records/${record.id} {"data":{…}} — and then change the kind.`,
    )
  }

  const declared = new Set(KIND_SPECS[to].fields.map((field) => field.key))
  const next: Record<string, unknown> = { ...stored }
  const kept: FieldKeptInExtra[] = []

  // THE BAG EVERYTHING MOVES INTO. Every kind declares `extra`, so it survives the change itself
  // and is never moved into itself. A stored `extra` that is not an object is refused rather than
  // replaced: replacing it would drop whatever it holds, which is the one thing this whole path
  // exists to make impossible.
  const bag = next['extra']
  if (bag !== undefined && !isJsonObject(bag)) {
    throw new PanelError(
      `This record's "extra" is not an object, so there is nowhere to keep the fields a ${to} has no place for. ` +
        `Nothing was written and it is still a ${from}. Make "extra" an object first — ` +
        `PATCH /api/records/${record.id} {"dataPatch":{"extra":{…}}} — and then change the kind.`,
    )
  }
  const extra: Record<string, unknown> = bag === undefined ? {} : { ...bag }

  // THE WORDS FOR THIS CHANGE, worked out once. `displayWord` is what turns `block` into "step",
  // `fieldWords` turns `effort_hours` into "effort hours", and `withArticle` is what stops this
  // file writing "a obligation".
  const becomes = withArticle(displayWord(to))

  const move = (key: string, why: string, plainly: string): void => {
    if (key in extra) {
      throw new PanelError(
        `Changing this ${from} into a ${to} has to keep its "${key}" by moving it into "extra", and "extra" ` +
          `already holds a key called "${key}". Storing one over the other would lose a value, so nothing was ` +
          `written. Rename or remove extra.${key} first — PATCH /api/records/${record.id} ` +
          `{"dataPatch":{"extra":{"${key}":null}}} deletes it — and then change the kind.`,
      )
    }
    extra[key] = next[key]
    delete next[key]
    kept.push({ key, nowAt: `data.extra.${key}`, why, plainly })
  }

  // Pass one. Object.keys is taken before anything moves, so deleting as we go is safe.
  for (const key of Object.keys(next)) {
    if (key === 'extra' || declared.has(key)) continue
    move(key, `a ${to} has no field called "${key}"`, `${becomes} has no ${fieldWords(key)}`)
  }

  // Pass two. `validateData` reports every problem it finds rather than the first, so one call
  // names every field that does not fit. Cross-field rules are NOT reached here — that function
  // runs them only once the fields themselves are sound — which is the order this wants: move the
  // fields that cannot fit, then let the caller's final check judge what is left as a whole.
  const checked = validateData(to, next)
  if (!checked.ok) {
    const saidAbout = new Map<string, string[]>()
    for (const error of checked.errors) {
      const key = fieldPathBelongsTo(error.path)
      // `extra` is skipped because it has already been checked above and cannot move into itself.
      // A path of `data` or `kind` names no field and is left for the final validation to report.
      if (key === null || key === 'extra' || !declared.has(key)) continue
      const said = saidAbout.get(key)
      if (said === undefined) saidAbout.set(key, [error.message])
      else said.push(error.message)
    }
    for (const [key, messages] of saidAbout) {
      move(
        key,
        `a ${to}'s "${key}" cannot hold what this record has — ${messages.join(' ')}`,
        `${fieldWords(key)} does not mean the same thing on ${becomes}`,
      )
    }
  }

  // ---- PASS THREE: WHAT WAS SET ASIDE BY AN EARLIER KIND CHANGE AND CAN COME BACK NOW ---------
  //
  // Only keys that were ALREADY in the bag before this write are considered. A key the two passes
  // above have just put there cannot come back — pass one moved it because the new kind has no
  // such field, pass two because the new kind's own validation refused the value — so the two sets
  // never overlap and there is no way for a value to move out and straight back in.
  //
  // EACH CANDIDATE IS TRIED AGAINST THE WHOLE RECORD, ONE AT A TIME, so a cross-field rule sees the
  // record it would really be judging. `validateData` runs those rules once the fields are sound,
  // which they are by this point. A candidate that would break one is left in `extra` and the
  // reason is reported: refusing the whole kind change over a value nobody asked to restore would
  // make a correctable mistake permanent again, which is the thing this path exists to end.
  const broughtBack: FieldFromExtra[] = []
  for (const key of bag === undefined ? [] : Object.keys(bag)) {
    if (key === 'extra' || !declared.has(key)) continue
    const wasAt = `data.extra.${key}`
    if (key in next) {
      broughtBack.push({
        key,
        wasAt,
        restored: false,
        why:
          `this record already holds a "${key}" of its own, and writing one over the other would lose a value. ` +
          `Only a person can say which of the two is meant.`,
        plainly: `this record already has its own ${fieldWords(key)}`,
      })
      continue
    }
    const value = extra[key]
    const trial: Record<string, unknown> = { ...next, [key]: value }
    const rest = { ...extra }
    delete rest[key]
    if (bag !== undefined || kept.length > 0) trial['extra'] = rest
    const tried = validateData(to, trial)
    if (!tried.ok) {
      broughtBack.push({
        key,
        wasAt,
        restored: false,
        why:
          `a ${to}'s "${key}" cannot hold what was set aside — ` +
          `${tried.errors.map((error) => error.message).join(' ')}`,
        plainly: `${becomes} cannot hold that ${fieldWords(key)}`,
      })
      continue
    }
    next[key] = value
    delete extra[key]
    broughtBack.push({
      key,
      wasAt,
      restored: true,
      why: `a ${to} has a "${key}" and the value that was set aside fits it`,
      plainly: fieldWords(key),
    })
  }

  if (kept.length > 0 || bag !== undefined) next['extra'] = extra
  return { data: next, kept, broughtBack }
}

/** What happened, in one sentence, for whoever reads the first line of the answer. */
function describeKindChange(
  from: RecordKind,
  to: RecordKind,
  kept: readonly FieldKeptInExtra[],
  broughtBack: readonly FieldFromExtra[],
  drawing = '',
): string {
  if (from === to) {
    return (
      `This record is already a ${to}, so nothing was changed and nothing was written. No change row was ` +
      `added either: a history saying a ${to} became a ${to} has to be read to find out that nothing happened.`
    )
  }
  const parts: string[] = [`This record was ${withArticle(from)} and is now ${withArticle(to)}.`]
  if (kept.length === 0) {
    parts.push(`Every field it was holding is a field ${withArticle(to)} has, so nothing moved.`)
  } else {
    const named = kept.map((field) => `"${field.key}" is now at ${field.nowAt}`).join(', ')
    parts.push(
      `${kept.length === 1 ? 'One field' : `${kept.length} fields`} ${withArticle(to)} has no place for ` +
        `${kept.length === 1 ? 'was' : 'were'} kept under "extra" rather than dropped: ${named}. ` +
        `Nothing reads "extra", so anything there that a ${to} should really carry belongs in one of its own ` +
        `fields — GET /api/kinds/${to} lists them.`,
    )
  }
  const came = broughtBack.filter((field) => field.restored)
  const stayed = broughtBack.filter((field) => !field.restored)
  if (came.length > 0) {
    parts.push(
      `${came.length === 1 ? 'One value' : `${came.length} values`} already in "extra" came back onto the record, ` +
        `because ${withArticle(to)} declares that key and its own validation accepts the value: ` +
        `${came.map((field) => `"${field.key}" moved from ${field.wasAt} to data.${field.key}`).join(', ')}.`,
    )
  }
  for (const field of stayed) {
    parts.push(`"${field.key}" stayed at ${field.wasAt}: ${field.why}`)
  }
  return `${parts.join(' ')}${drawing}`
}

/** "A task" from "a task", so a clause can start a sentence. */
function startsSentence(clause: string): string {
  return clause === '' ? clause : `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`
}

/**
 * THE SAME NEWS IN THE WORDS A PERSON READS. No paths, no requests, no key spellings.
 *
 * The model for this voice is the sentence the plan table already draws beside it, which the owner
 * read and could act on: *"A problem has no estimate, so there is nowhere on this record to store
 * one. Whatever this line says about how big it is stays in the line."* One idea per sentence,
 * conclusion first, and every clause comes from the same `kept` and `broughtBack` entries that
 * `describeKindChange` accounts for above.
 */
function plainKindChange(
  from: RecordKind,
  to: RecordKind,
  kept: readonly FieldKeptInExtra[],
  broughtBack: readonly FieldFromExtra[],
  drawing = '',
): string {
  const becomes = withArticle(displayWord(to))
  const was = withArticle(displayWord(from))
  if (from === to) {
    return (
      `This record is already ${becomes}, so nothing changed and nothing was written. ` +
      `No history was added either, because a line saying ${becomes} became ${becomes} tells nobody anything.`
    )
  }
  const parts: string[] = [`This record was ${was} and is now ${becomes}.`]

  if (kept.length > 0) {
    // WHY EACH VALUE HAD TO BE SET ASIDE, in the reader's words, then what that means for them.
    // The promise about changing back is qualified on purpose: Mole Office puts a value back only when
    // nothing has been written in its place, and a promise it cannot always keep is a fake success.
    parts.push(`${startsSentence(andList(kept.map((field) => field.plainly)))}.`)
    parts.push(
      `${kept.length === 1 ? 'That value is set aside' : 'Those values are set aside'}. ` +
        `Nothing reads ${kept.length === 1 ? 'it' : 'them'} while this is ${becomes}. ` +
        `${kept.length === 1 ? 'It comes' : 'They come'} back if you make this ${was} again, unless something ` +
        `else has been written in ${kept.length === 1 ? 'its' : 'their'} place.`,
    )
  } else {
    parts.push(`${startsSentence(becomes)} has a place for everything it was holding, so nothing was set aside.`)
  }

  const came = broughtBack.filter((field) => field.restored)
  if (came.length > 0) {
    parts.push(
      `${startsSentence(andList(came.map((field) => field.plainly)))} came back onto this record. ` +
        `${came.length === 1 ? 'It was' : 'They were'} set aside by an earlier change of kind, and ${becomes} ` +
        `has a place for ${came.length === 1 ? 'it' : 'them'} again.`,
    )
  }
  for (const field of broughtBack) {
    if (field.restored) continue
    parts.push(`${startsSentence(field.plainly)}, so what was set aside stays set aside.`)
  }
  return `${parts.join(' ')}${drawing}`
}

/**
 * The sentence to add when a pipeline that had a saved drawing stops being a pipeline.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SENTENCE AND NOT A REFUSAL OR A MIGRATION — judged 18 August 2026
 * ---------------------------------------------------------------------------------------
 *
 * A pipeline's drawing is stored in `presentation_intent` under the scope `pipeline:<record id>`,
 * and `parseScope` in lib/presentation.ts refuses any read of that scope once the record is not a
 * pipeline any more. So changing an empty pipeline into something else makes its saved arrangement
 * unreadable. A pipeline that still holds steps is refused above, so this is only ever an empty one.
 *
 * IT IS GOOD ENOUGH AS IT STANDS, and that is a judgement rather than an omission. The rows are not
 * deleted, nothing overwrites them, and changing the kind back makes every one of them readable
 * again. It fails loudly — a 400 naming the record's real kind and title — and it is reversible with
 * one request. Refusing the kind change outright would lock a record over an arrangement nobody may
 * even be able to see, and rewriting the scope on the way through would be this file inventing a
 * meaning for another subsystem's key.
 *
 * WHAT WAS ACTUALLY MISSING IS THE WARNING, and it is here rather than on the 400. Somebody meeting
 * that refusal later has no way to know the drawing survived; somebody making this change now can be
 * told before it matters. Nothing is guessed and nothing is hidden.
 */
function drawingLeftBehind(record: PanelRecord, to: RecordKind): string {
  if (record.kind !== 'pipeline' || to === 'pipeline') return ''
  const scope = pipelineScope(record.id)
  const rows = db
    .select({ target: presentationIntent.target })
    .from(presentationIntent)
    .where(eq(presentationIntent.scope, scope))
    .all()
  if (rows.length === 0) return ''
  return (
    ` This pipeline had a saved drawing — ${countedAs(rows.length, 'arrangement', 'arrangements')} of how it is ` +
    `laid out — and only a pipeline has a drawing of its own, so nothing can read it while this record is a ${to}. ` +
    `NOTHING WAS DELETED: the rows are still there, and changing this back to a pipeline makes the drawing ` +
    `readable again exactly as it was.`
  )
}

/** One place words every answer to a record patch that stored nothing. */
export function nothingWrittenSentence(reason: { kind: 'reminder' | 'unchanged' | 'absent' | 'mixed' | 'empty' | 'answer-absent' | 'answer-unchanged' | 'check-also-absent' | 'check-also-unchanged' | 'order-unchanged' | 'not-deleted' | 'short-forms-absent' | 'short-forms-unchanged' | 'link-exists' | 'already-stored' | 'nothing-to-clear' | 'no-job-waiting' | 'no-child-to-close' | 'no-finish-to-check'; fields?: string[]; absent?: string[] }): string {
  const fields = reason.fields?.join(', ') ?? ''
  const absent = reason.absent?.join(', ') ?? ''
  switch (reason.kind) {
    case 'no-finish-to-check':
      return 'Nothing was written because the run has no finish waiting for a check.'
    case 'already-stored':
      return 'Nothing was written because everything this request asked for was already stored.'
    case 'nothing-to-clear':
      return 'Nothing was written because there was nothing to clear.'
    case 'no-job-waiting':
      return 'Nothing was written because no job was waiting to be taken.'
    case 'no-child-to-close':
      return 'Nothing was written because no child run needed to be closed.'
    case 'reminder':
      return 'Nothing was written to the record because the finish was held for the reminder before the seal; send it again to request the seal.'
    case 'unchanged':
      return `Nothing was written to the record because the requested values for ${fields} were already stored.`
    case 'absent':
      return `Nothing was written to the record because the requested deletions found ${fields} already absent.`
    case 'mixed':
      return `Nothing was written to the record because the requested values for ${fields} were already stored and ${absent} were already absent.`
    case 'empty':
      return 'Nothing was written to the record because the request asked for no changes.'
    case 'answer-absent':
      return 'Nothing was written because there was no draft answer to clear.'
    case 'answer-unchanged':
      return 'Nothing was written because the draft answer was already the same.'
    case 'check-also-absent':
      return 'Nothing was written because there was no reminder list to clear.'
    case 'check-also-unchanged':
      return 'Nothing was written because the reminder list was already the same.'
    case 'order-unchanged':
      return 'Nothing was written because the blocks were already in that order.'
    case 'not-deleted':
      return 'Nothing was written because the record was not deleted.'
    case 'short-forms-absent':
      return 'Nothing was written because the requested short forms were already absent.'
    case 'short-forms-unchanged':
      return 'Nothing was written because the requested short forms were already the same.'
    case 'link-exists':
      return 'Nothing was written because that link already exists.'
  }
}

export interface PatchResult {
  /** The stored, normalized territory changed on this write. */
  territoryChanged?: true
  record: PanelRecord
  /**
   * The revision this patch WROTE, or null when it wrote none.
   *
   * NULL MEANS NOTHING WAS WRITTEN. A patch that changes nothing writes nothing at all — no row, no
   * `updatedAt`, no change row and no revision — and without this the reply for "I set the title to
   * B" was byte-identical to the reply for "the title was already B". The caller could not tell the
   * two apart, and they are different events.
   *
   * IT IS THE SAME WORD THE RESTORE REPLY USES, deliberately. `RestoredRevision.newSeq` in
   * lib/revisions.ts already means exactly this, and a restore is an ordinary patch underneath, so a
   * second vocabulary for one fact would be this codebase's recurring defect in the replies.
   */
  newSeq: number | null
  /** Why this patch wrote nothing, when it wrote nothing. */
  nothingWritten?: string
  /** What the merge did. null when the caller sent `data` or no data at all — nothing was merged. */
  dataPatch: DataPatchOutcome | null
  /**
   * WHAT A WHOLESALE `data` REMOVED: every field the record held that the new object does not.
   *
   * PRESENT EXACTLY WHEN THE REQUEST SENT `data`, and empty when the replace removed nothing. It is
   * present on a replace that emptied nothing for the same reason `kindChange` is present when the
   * kind sent was the one the record already had: sending `data` asks what the whole-object rewrite
   * cost, and "nothing" is the answer to a question that was asked. Absent on a merge and on a
   * patch that touched no data, because neither can empty a field it does not name and there is no
   * question there to answer.
   *
   * NEVER ABSENT WHEN SOMETHING WENT. That is the whole of what it is for. The write that emptied
   * seven fields of a problem record on 4 September 2026 was answered 200 with an empty
   * `incomplete` list and nothing anywhere in the reply naming what had gone, so the loss was found
   * two hours later by somebody reading the record.
   */
  emptied?: string[]
  /**
   * What the record is still missing NOW, after the patch. Empty means complete.
   *
   * It describes the record, not the patch, and it is computed from the record that ends up
   * stored rather than taken from the gate: a patch that only changes a title never reaches the
   * gate at all, and answering "nothing missing" there because nothing was checked would be a
   * fallback that quietly reports a half-written module as finished.
   */
  incomplete: Incompleteness[]
  /**
   * Present when renaming a PIPELINE also rewrote its blocks' titles. Absent when it did not.
   *
   * Reported because the request named one record and the write changed several, and a caller that
   * is not told cannot know its own agents' bookmarks have moved. This is the same reason
   * `sessionBinding` is reported on a create: a write that touches rows the request did not name
   * has to say so.
   */
  /**
   * Present exactly when the patch named a `kind`. Absent on every other patch.
   *
   * It is present even when the kind sent was the one the record already had, because "nothing
   * changed" is the answer to a question that was asked, and a silent 200 there is the caller
   * being left to assume its write took.
   */
  kindChange?: KindChangeOutcome
  /**
   * PRESENT WHEN THIS PATCH MADE A RECORD A SESSION, and so filed the run's flow run, or said why it could not. A record
   * changed into a session is a run from then on, and gets its flow run as a filed run does.
   */
  flowRun?: FlowRunFiled
  /** PRESENT WHEN STEPS THE OFFICE SAW IN THIS CHANGE WERE NOT WRITTEN to the run's flow run. The change itself stands. */
  flowRunStepsNotWritten?: FlowRunStepsNotWritten
  /**
   * PRESENT WHEN THIS PATCH SAID THE RUN IS FINISHED IN THE WAY THAT SEALS IT (`sealsTheRun` below), including a run
   * that already said so: that is a reseal. The record door reads it to ask for a check again when a refused run is
   * resealed. A run that submits no work is sealed with nothing, and this is still present.
   */
  sealsTheRun?: true
  /** PRESENT WHEN THE WORDS THIS PATCH CHANGED IN A MESSAGE SEEM TO HOLD A KEY. The change itself stands (lib/message-keys.ts). */
  keyReminder?: AKeyReminder
  /**
   * PRESENT WHEN THIS PATCH WAS MADE WITH A RUN KEY BOUND TO ANOTHER RUN OF THE SAME AGENT. The write is taken, and the
   * sentence names the key's run and the run it wrote; the written run carries one line saying so, once for the pair.
   */
  runKeyReminder?: string
}

/**
 * HOW THIS WRITE IS LABELLED IN THE REVISION LEDGER, when it is not an ordinary edit.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PARAMETER AND NOT A KEY OF `RecordPatch`
 * ---------------------------------------------------------------------------------------
 *
 * `RecordPatch` is the body a caller sends, and every key of it is something a request may ask for.
 * How the ledger describes a write is not: a request that could label its own revision `restore`
 * could claim to have put back a revision it never read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL, WHEN A RESTORE IS AN ORDINARY PATCH
 * ---------------------------------------------------------------------------------------
 *
 * Because it IS an ordinary patch, and that is the point. `restoreRevision` in lib/revisions.ts puts
 * an earlier revision's content back by calling this function, so the validation, the human-only
 * gate and the change log are the ones every other edit goes through — there is no second write
 * path past them. What it cannot get that way is the one thing that is true about the write and not
 * about the patch: that somebody put revision 4 back, and which revision that was. Without this the
 * ledger would record the most significant write it has as an unexplained edit.
 *
 * ONLY `restoreRevision` PASSES IT. Everything else leaves it out and gets `update` with no note,
 * which is what an ordinary edit is.
 */
export interface LedgerLabel {
  op: RevisionOp
  /** Why, in plain words. It goes into `revisions.note`, which is otherwise null on an edit. */
  note: string
}

/*
 * WHETHER SOMEBODY HAS BEEN GIVEN A COMMENT'S WORDS is `goneOut`, imported at the top of this file
 * from lib/dispatch.ts. `STATES_NOBODY_HAS_READ_YET` and `stillADraft` stood here and read
 * `data.state` on the record.
 *
 * THAT FIELD COULD BE WRONG IN BOTH DIRECTIONS. It was stamped from the BROWSER, after the send,
 * inside a `try/catch` that reported its failure and changed nothing — so a comment could be out
 * and still read `queued`, and this gate would have let anybody rewrite it. And it could be walked
 * back: measured 19 August 2026, three writes and three 200s put a sent comment back to `queued`,
 * rewrote its body and marked it sent again.
 *
 * `goneOut` asks the one store instead: is there a message carrying these words that is past
 * `queued`. It is stronger in three measured ways — nothing un-sends a message, it is keyed on the
 * record id so a kind change carries nothing away, and it closes inside the send transaction rather
 * than in a browser call afterwards.
 */

/**
 * THE REVIEWS THAT WROTE THIS COMMENT DOWN WHEN THEY FINISHED COLLECTING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A SECOND THING FIXES A COMMENT'S WORDS, BESIDE HAVING BEEN SENT
 * ---------------------------------------------------------------------------------------
 *
 * A comment stays `queued` after a review has frozen it. Freezing writes down which comments were
 * in the review; it does not send them and it does not touch them, which is right — an annotation
 * belongs to the person who wrote it and not to the collection. But a frozen review stores IDS and
 * re-reads the words on every request. So while the words could still be changed, what a frozen
 * review contained could be changed after it froze, by somebody who did not write it.
 *
 * Measured on 19 August 2026 on an isolated copy: a comment of 67 characters, written by
 * the person, inside a review whose membership had been written down, was replaced through one
 * PATCH sent as an agent and answered 200. `GET /api/reviews/<id>` then served the
 * agent's sentence as the person's, with the row's own reading still saying the anchor was there.
 *
 * SO FREEZING PROTECTS THE WORDS AS WELL AS THE LIST. That is what "this is what the review
 * contained" has to mean. A membership that is fixed while its contents are not is a list of ids
 * whose meaning anybody can rewrite afterwards, which is not a record of anything.
 *
 * ---------------------------------------------------------------------------------------
 * IT READS THE STORED VALUE THROUGH THE ONE PARSER, WHICH IT DID NOT USED TO
 * ---------------------------------------------------------------------------------------
 *
 * `reviews.frozen` was parsed here and again in lib/reviews.ts. Two readers of one stored shape is
 * the defect this repository names as its own, and this one failed open: anything that was not a
 * JSON array was read as a review holding nothing, so widening the stored shape would have turned
 * this refusal off with nothing failing. That is exactly what happened next — the column now also
 * carries why each comment was left out — and the fix is that both callers use `readFrozen` in
 * lib/frozen-membership.ts. That file imports neither of these two, so there is no import cycle,
 * which is why importing lib/reviews.ts from here was never an option.
 *
 * tests/a-comment-belongs-to-whoever-wrote-it.test.ts freezes a review through the ordinary route
 * and then asks this gate to refuse, so a shape this parser cannot read goes red there.
 *
 * A MEMBERSHIP THAT CANNOT BE READ IS A REFUSAL, not a shrug. Mole Office cannot then say whether this
 * comment is inside that review, and letting the write through would be answering "no" to a
 * question nobody could ask. lib/reviews.ts refuses the same row for the same reason.
 */
function frozenReviewsHolding(annotationId: string, workspaceId: string): string[] {
  const rows = db
    .select({ id: reviews.id, frozen: reviews.frozen })
    .from(reviews)
    .where(and(eq(reviews.workspaceId, workspaceId), isNotNull(reviews.frozen)))
    .all()
  const holding: string[] = []
  for (const row of rows) {
    const written = readFrozen(row.frozen)
    if (written === UNREADABLE) {
      throw new PanelError(
        `Review ${row.id} stores a membership that is not readable, so Mole Office cannot say whether comment ` +
          `${annotationId} is inside it — and a comment inside a review that has finished collecting may not be ` +
          `rewritten. Nothing was written and nothing has been guessed. Read the review with ` +
          `GET /api/reviews/${row.id}, which refuses the same row and says the same thing.`,
        500,
      )
    }
    if (written === null) continue
    if (written.members.some((member) => member.source === 'annotation' && member.id === annotationId)) {
      holding.push(row.id)
    }
  }
  return holding
}


/**
 * Change a record, and report what changed.
 *
 * `updateRecord` below is this function with the report dropped; it is what most callers use.
 * The report exists because a merge patch is the one write whose effect the caller cannot work
 * out from what it sent: it does not know what was there before.
 *
 * ---------------------------------------------------------------------------------------
 * `deleting`: BLOCKS THIS ACT DELIBERATELY TAKES OUT OF A PIPELINE
 * ---------------------------------------------------------------------------------------
 *
 * A PARAMETER AND NOT A KEY OF `RecordPatch`, for `LedgerLabel`'s reason: `RecordPatch` is the body
 * a caller sends, and a request that could say "these blocks are leaving" would be a request that
 * can orphan a block by claiming a deletion it never makes.
 *
 * ONE CALLER PASSES IT — `removeBlock` in lib/blocks.ts — and it needs it because rule 4 of
 * `checkBlockIds` refuses an order that leaves out a live block. Removing a block is that write
 * followed by deletion if no other live pipeline lists it, in one transaction, so the block is
 * still alive at the moment the shorter order is written. Without this the two guards would face each other and a block could never be
 * removed at all: `deleteRecord` refuses to delete a block a pipeline still lists, and rule 4
 * refuses an order that stops listing a live one.
 *
 * IT IS A PROMISE AND NOT A PERMISSION. Every id here is deliberately removed and the transaction
 * either deletes it or leaves it listed by another live pipeline.
 */
/**
 * AN AGENT MAY NOT HIDE WRITING THAT ALREADY EXISTS.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND IT IS MONOTONE
 * ---------------------------------------------------------------------------------------
 *
 * > Adding `audience: "developers"` to a block that is already stored is a change to somebody's
 * > writing, so an agent may not make it. An agent may mark blocks it is CREATING in the same
 * > write. Anyone may REMOVE a mark. A person may do anything.
 *
 * `design/round-ten/design/projections.md` §9.2 rule 3. The report holding the owner's own
 * criticism of this product's direction is a `report`, not a human-only kind, so without this any
 * caller with the three write headers could have marked the block quoting the owner and it would have
 * left the person's Normal-mode screen.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS RULE HAS, AND THE SIGNATURE OF SOMEBODY USING IT
 * ---------------------------------------------------------------------------------------
 *
 * IT MATCHES BY ID, so deleting the block and writing the same words back under a NEW id gets the
 * mark through: the new id has no entry on the other side, the loop below skips it, and the words
 * leave the person's Normal-mode screen anyway. Per-block authorship is not stored, which is why the rule can
 * only match by id — there is nothing else to match on.
 *
 * LEAVE THE GAP OPEN AND WATCH FOR ITS SIGNATURE. The signature is documented so a real case can be recognised.
 *
 * THE SIGNATURE, IN FULL: a rule-3 refusal, followed in the same project by the same record gaining
 * a marked block with an id nothing had seen before.
 *
 * WHAT CAN AND CANNOT BE ASKED. `GET /api/queries/rule-three-signature` answers the second half from
 * the revision ledger: which records gained an already-marked block whose id appears in no earlier
 * revision, and who wrote it. THE FIRST HALF IS RECORDED NOWHERE. The refusal below throws, so
 * nothing about it is stored; `api_calls` keeps the operation, the status and the time, and not
 * which record was refused. So that query answers with candidates and says in as many words that a
 * candidate is not the signature. Criterion P40, and criterion P41 narrows the hole without closing
 * it: a worker cannot delete a block at all now, and a supervisor still can.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN `validateRecordData`
 * ---------------------------------------------------------------------------------------
 *
 * That function takes `(kind, data)`, so it can see neither the record as it stands nor who is
 * writing. Both are in hand here, a few lines above the `logChange` that names the actor.
 *
 * ---------------------------------------------------------------------------------------
 * PUTTING A REVISION BACK IS EXEMPT, AND IT HAS TO BE
 * ---------------------------------------------------------------------------------------
 *
 * `restoreRevision` writes through `patchRecord`, so without this exemption putting back a version
 * in which a block carried the mark looks — to a check comparing against the record as it stands
 * NOW — exactly like an agent adding one. An agent asked to put a report back would get a 400 whose
 * message is about marking somebody's writing, which is not what it was doing.
 *
 * KEYING ON THE LEDGER LABEL IS SAFE RATHER THAN A HOLE OF ITS OWN: `ledger` is a parameter and not
 * a key of `RecordPatch`, `restoreRevision` is the only caller that sets it, and the restore route
 * passes none. A caller cannot send it.
 *
 * THE RESIDUAL IS STATED RATHER THAN ARGUED AWAY. An agent can therefore put back an older revision
 * in which a block was marked, and the mark returns with it. Against that: the count on the page
 * still fires, and the ledger row names the actor, the revision and the time in words.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * IT IS A SPEED BUMP AND NOT A WALL, and the design says so. An agent that copies a stored block's
 * prose into a NEW block with a NEW id, marks that one and drops the old is — from here — marking a
 * block it is creating, which the rule permits. Nothing detects it. Both closures are worse than
 * the hole: matching on CONTENT puts a fuzzy text comparison in charge of refusing a write, and
 * making block ids immutable forbids a real editing operation to prevent an imagined one. What the
 * route around costs is real: changing a block's id destroys the identity annotations anchor to,
 * and the revision diff reports the old id removed and a new id added, by name, in history.
 *
 * MATCHING IS BY ID, and where an id cannot decide the raise is REFUSED rather than guessed at.
 */
function assertMayNotHideExistingWriting(
  before: { id: string; kind: string; title: string; data: unknown },
  after: unknown,
  actor: Actor,
  ledger: LedgerLabel | undefined,
): void {
  // A PERSON MAY DO EITHER. This is a rule about an agent editing somebody else's writing, and
  // Mole Office has one person, whose writing it is.
  if (actor.type === 'human') return
  if (ledger?.op === 'restore') return
  const field = blocksFieldOf(before.kind)
  if (field === null) return
  const wasMarked = markedById(readBlocks(before.data, field))
  const nowMarked = markedById(readBlocks(after, field))
  for (const [blockId, mark] of nowMarked) {
    if (mark !== 'developers') continue
    const wasHere = wasMarked.get(blockId)
    // A block this write is CREATING has no entry on the other side. That is the main use of the
    // field and the reason it is not human-only outright: an agent writing a report may mark its
    // own machinery paragraphs as it writes them.
    if (wasHere === undefined) continue
    if (wasHere === 'developers') continue
    throw new PanelError(
      `Block "${blockId}" is already stored in "${before.title}", so marking it for developers is a change to ` +
        'writing that already exists, and that is a person\'s call rather than an agent\'s. Nothing was written. ' +
        'You may say so in a comment and let them decide; you may mark blocks you are writing in the same ' +
        'request; and removing a mark is always allowed, by anybody.',
    )
  }
}

/**
 * EVERY BLOCK IN ONE RECORD'S BODY, AT ANY DEPTH, KEYED BY ID, WITH WHAT IT SAYS ABOUT ITS READER.
 *
 * A DUPLICATE ID IS `'ambiguous'` AND NOT A WINNER. Absence beats a guess: if two blocks share an
 * id, this cannot say which one a mark landed on, so a raise against that id is refused above. That
 * is `byId`'s own rule — the one the change log and the server's target reader already spell — and
 * it is applied here per id rather than per array so that one duplicate deep in a section does not
 * turn the whole record unwritable.
 */
function markedById(blocks: readonly unknown[]): Map<string, string | 'ambiguous'> {
  const out = new Map<string, string | 'ambiguous'>()
  for (const block of blocks) {
    if (!isJsonObject(block)) continue
    const blockId = block['id']
    if (typeof blockId !== 'string' || blockId === '') continue
    const audience = typeof block['audience'] === 'string' ? String(block['audience']) : ''
    out.set(blockId, out.has(blockId) ? 'ambiguous' : audience)
  }
  return out
}

/** One record's blocks, flattened out of its four containers. Anything unreadable contributes none. */
function readBlocks(data: unknown, field: string): unknown[] {
  if (!isJsonObject(data)) return []
  const top = data[field]
  return Array.isArray(top) ? flattenBlocks(top) : []
}

function flattenBlocks(blocks: readonly unknown[]): unknown[] {
  const out: unknown[] = []
  for (const block of blocks) {
    if (!isJsonObject(block)) continue
    out.push(block)
    for (const key of ['blocks', 'columns', 'tabs'] as const) {
      const held = block[key]
      if (!Array.isArray(held)) continue
      for (const one of held) {
        if (Array.isArray(one)) out.push(...flattenBlocks(one))
        else if (isJsonObject(one) && Array.isArray(one['blocks'])) out.push(...flattenBlocks(one['blocks']))
        else if (isJsonObject(one)) out.push(...flattenBlocks([one]))
      }
    }
  }
  return out
}

/**
 * EVERY FIELD THIS RECORD HOLDS THAT A WHOLESALE `data` DOES NOT CARRY — what the write would empty.
 *
 * A KEY HOLDING `null` IS NOT ONE OF THEM. `mergeData` never stores a null, and the reason it gives
 * is that a stored null is a value which says nothing; a write that drops such a key takes nothing
 * away, and naming it would be a refusal about a loss that is not there.
 */
function fieldsAReplaceWouldEmpty(stored: unknown, sent: Record<string, unknown>): string[] {
  if (!isJsonObject(stored)) return []
  return Object.keys(stored).filter((key) => stored[key] !== null && stored[key] !== undefined && !Object.hasOwn(sent, key))
}

/**
 * THE BODY'S HALF OF A FINISHED RUN'S KEY.
 * For fifteen minutes after a run's finish revoked its key, the key may still store that run's usage
 * receipt, post the sandbox helper's message about that run's end, and read that run's record, and nothing else.
 * `aFinishedRunsOwnKey` in lib/keys.ts lets the key prove the run's agent only on those three doors, read from the URL
 * before the body is parsed; these read the body of the two that write.
 *
 * THE RECEIPT: the patch must be that run's, and a `dataPatch` of `usageReceipt` alone, as the helper sends it
 * (theReceiptIsWritten in tools/sandbox-start.mjs): no other field of the record and no other key of its data. False
 * means this is not that write, and `patchRecord` refuses it, unless the served-conditions exception above allows it.
 */
function aFinishedRunStoresOnlyItsReceipt(id: string, patch: RecordPatch, run: string): boolean {
  const only = patch.dataPatch !== undefined && Object.keys(patch.dataPatch).length === 1 && Object.hasOwn(patch.dataPatch, 'usageReceipt')
  const nothingElse = Object.entries(patch).every(([field, value]) => field === 'dataPatch' || value === undefined)
  return id === run && only && nothingElse
}

/**
 * WHO MAY END A RUN.
 * Ending a run revokes its key and ends its claims in the same write (below, in
 * `patchRecord`), so a keyed agent that could end any run could stop another agent's work and take its key away.
 * A run's state moves to an end only for:
 *
 *   - the person, proved: their key or a paired browser's, or a call no listener carried (the office's own code, a
 *     script, a test's inject). A claim with no key does not count here even while the key window is open: the
 *     window does not authorize ending a run;
 *   - the office itself: a system writer, a caller proved by the office's key, or one of its own writers by name;
 *   - the run's own agent: the agent the run serves, or an agent it ran as;
 *   - its starter: the agent that started the run's agent (criterion P1: whoever starts an agent answers for it),
 *     or the agent that filed the run, from the create row of its change log;
 *     each of these agents with a key or by a call no listener carried, and not by its name alone even while the key
 *     window is open (`anAgentThatAnswersForTheRun`);
 *   - a secretary, raised or not.
 *
 * A SESSION HEADER NAMING THE RUN IS NOT ENOUGH. The office does not check that a caller's session header names one
 * of its own runs, so it could name any run: who the caller is comes from its key or its name, never from the header.
 *
 * ASKED ONLY ON THE MOVE TO AN END, the moment the key is revoked, so a sweep writing the same end again is not asked.
 */
function assertMayEndARun(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown }): void {
  if (mayEndARun(actor, run)) return
  const met = () => gateMet('who-ends-a-run')
  if (gatePosition('who-ends-a-run') !== 'block') return void met()
  const caller = actor.type === 'agent' ? (theCallersAgentRow(actor)?.handle ?? actor.id) : actor.id
  throw gateMetOnceTheWriteIsTakenBack(new PanelError(
    `${WHO_MAY_END_A_RUN}, because ending it revokes its key and ends its claims. This ` +
      `request came from ${actor.type} "${caller}", which is none of them.${aClaimToBeThePerson(actor)}` +
      `${aClaimToAnswerForTheRun(actor, run)} Nothing was written.`,
    403,
  ), met)
}

/** Who answers for a run, as `mayEndARun` reads them, in the words both 403s below say them in. */
const THOSE_WHO_ANSWER_FOR_A_RUN =
  'the person with their key, the office itself, its own agent (the agent it serves or an agent it ran as), the agent ' +
  'that started it or filed it, or a secretary'

/** Who may end a run, as the 403 above says it. Exported so a test reads the words rather than copying them. */
export const WHO_MAY_END_A_RUN = `A run is ended only by ${THOSE_WHO_ANSWER_FOR_A_RUN}`

/** Who may change a run's data, as the 403 of `assertMayChangeARun` says it. Exported for the same reason. */
export const WHO_MAY_CHANGE_A_RUN = `A run's data is changed only by ${THOSE_WHO_ANSWER_FOR_A_RUN}`

/**
 * The fields of a record's data a write changes: each a `dataPatch` names, or each a whole `data` holds differently
 * from the stored one, a field it leaves out included. A whole `data` is read first, as `patchRecord` reads it.
 */
function theDataFieldsAWriteChanges(stored: Record<string, unknown>, patch: RecordPatch): string[] {
  const next = patch.data
  if (next !== undefined) {
    return [...new Set([...Object.keys(stored), ...Object.keys(next)])].filter((field) => !sameJson(stored[field], next[field]))
  }
  return patch.dataPatch === undefined ? [] : Object.keys(patch.dataPatch)
}

/**
 * WHOSE RUN THIS IS, in the words of the 403 below: its own agents, the agent that started the agent it serves, and
 * the agent that filed it, each as `theNamedAgentAnswersForTheRun` reads them.
 */
function whoseRunThisIs(run: { recordId: string; workspaceId: string; data: unknown }): string {
  const held = isJsonObject(run.data) ? (run.data as Record<string, unknown>) : {}
  const own = theRunsOwnAgents(held).map((id) => `"${theHandleOfAStoredAgent(id)}"`)
  const serving = theAgentARunServes(held)
  const started = serving === null ? null : theAgentThatStarted(serving.id)
  const filed = run.recordId === '' ? null : whoFiled(run.workspaceId, run.recordId)
  const whose = own.length === 0 ? 'It is a run of no agent' : `It is the run of agent${own.length === 1 ? '' : 's'} ${own.join(' and ')}`
  const starter = started === null ? '' : `, which agent "${theHandleOfAStoredAgent(started)}" started`
  const filer = filed === null || filed.actorType !== 'agent' ? '' : `; agent "${theHandleOfAStoredAgent(filed.actorId)}" filed it`
  return `${whose}${starter}${filer}.`
}

/**
 * WHO MAY CHANGE A RUN'S DATA: whoever may end it (`mayEndARun`), and nobody else. A run's data holds its state, the
 * id of its key and what it says it is doing, so an agent whose key could change any run's data could rewrite another
 * agent's run, and a worker's own key could rewrite the run of the agent that started it. The same callers as the
 * end's, read by the same function, so the two cannot come to disagree about who answers for a run (invariant 9).
 *
 * ASKED BY `patchRecord` ONLY OF A WRITE THE RECORD DOOR CARRIES (`throughTheRecordDoor`) THAT CHANGES THE RUN'S DATA,
 * and last, just before the write, so a caller another rule refuses still reads that rule's words. A field the guards
 * on a run's end, its served conditions or its sandbox answered is theirs: this asks only whether the write changes
 * anything else. A session header naming the run is not asked, as on the end.
 */
function assertMayChangeARun(actor: Actor, run: { recordId: string; workspaceId: string; data: unknown }): void {
  if (mayEndARun(actor, run)) return
  const caller = actor.type === 'agent' ? (theCallersAgentRow(actor)?.handle ?? actor.id) : actor.id
  throw new PanelError(
    `${whoseRunThisIs(run)} ${WHO_MAY_CHANGE_A_RUN}. This request came from ${actor.type} "${caller}", which is none ` +
      `of them; a session header naming the run does not make a caller the run.${aClaimToBeThePerson(actor)}` +
      `${aClaimToAnswerForTheRun(actor, run)} Nothing was written.`,
    403,
  )
}

/**
 * WHETHER A PATCH CHANGES ANYTHING BUT THE RECORD'S SHORT FORMS. Short forms are names for the record, written through
 * POST /api/records/<id>/short-forms, and they change nothing the record says. So a sent draft takes them, and an
 * agent writes them on a card's words with no warrant. A kind change, a new title, a new summary, a `dataPatch` naming
 * any other key, or a whole `data` that differs from the stored one apart from short forms, is more.
 */
function aPatchWritesMoreThanShortForms(before: { kind: string; title: string; summary: string | null; data: unknown }, patch: RecordPatch): boolean {
  const stored = isJsonObject(before.data) ? (before.data as Record<string, unknown>) : {}
  const withoutShortForms = (data: Record<string, unknown>): Record<string, unknown> => {
    const { [THE_SHORT_FORMS_KEY]: _left, ...rest } = data
    return rest
  }
  return (
    (patch.kind !== undefined && patch.kind !== before.kind) ||
    (patch.title !== undefined && patch.title !== before.title) ||
    (patch.summary !== undefined && (patch.summary ?? null) !== (before.summary ?? null)) ||
    (patch.dataPatch !== undefined && !Object.keys(patch.dataPatch).every((key) => key === THE_SHORT_FORMS_KEY)) ||
    (patch.data !== undefined && !sameJson(withoutShortForms(patch.data), withoutShortForms(stored)))
  )
}

/**
 * A DRAFT'S `sentAs` AND `sentAt` ARE THE SEND DOOR'S, AND A SENT DRAFT STAYS AS IT WAS SENT.
 *
 * A sent draft is kept and linked to what it became. So
 * a caller may not write either field by hand, on either body, and may not change a draft once it
 * carries `sentAs`. ITS SHORT FORMS ARE THE ONE EXCEPTION: they are names for the record, written
 * through POST /api/records/<id>/short-forms, and they change nothing the draft says.
 *
 * Asked of every patch, before anything else reads the patch, unless the send door is the writer.
 * The delete, the restore, the move and the kind change of a sent draft are refused in
 * `assertMayWrite`, which every one of those asks.
 */
function refuseWhatOnlyTheSendDoorWrites(before: { id: string; kind: string; title: string; summary: string | null; data: unknown }, patch: RecordPatch): void {
  if (theDraftSendDoorIsWriting()) return
  if (before.kind !== DRAFT_KIND && patch.kind !== DRAFT_KIND) return
  const stored = isJsonObject(before.data) ? (before.data as Record<string, unknown>) : {}
  const sent = before.kind === DRAFT_KIND ? sentAsOf(stored) : null
  if (sent !== null) {
    if (aPatchWritesMoreThanShortForms(before, patch)) throw new PanelError(aSentDraftStandsAsItWasSent(before.id, sent), 409)
    return
  }
  for (const key of WRITTEN_ONLY_BY_THE_SEND_DOOR) {
    const onThePatch = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, key)
    const onTheReplace = patch.data !== undefined && patch.data !== null && !sameJson(patch.data[key], stored[key])
    if (onThePatch || onTheReplace) throw new PanelError(ONLY_THE_SEND_DOOR_WRITES_SENT, 403)
  }
}

/**
 * A REPORT'S `answers` ARE THE ANSWER DOOR'S: only the person answers the
 * questions in a report, and an answer sent is recorded as their decision and sent to an agent. A write that could set
 * `answers` by hand could put words in the person's mouth, or make an answer read as sent when nothing carried it.
 *
 * So no write but the answer door's may set, change or drop it, on either body, on a record that is a report after the
 * write. A `dataPatch` that names the key is refused whatever it carries. A whole `data` that carries the stored answers
 * back unchanged is a round trip and passes; one that changes them or leaves them out is refused. A record that becomes
 * a report is asked the same, against no answers at all, so a kind change cannot bring answers in from `extra`.
 *
 * Asked of every patch before anything else reads it, and again of the data a kind change would store.
 */
function refuseWhatOnlyTheAnswerDoorWrites(before: { kind: string; data: unknown }, patch: RecordPatch): void {
  if (theAnswerDoorIsWriting()) return
  if ((patch.kind ?? before.kind) !== 'report') return
  const stored = before.kind === 'report' && isJsonObject(before.data) ? (before.data as Record<string, unknown>)[ANSWERS_FIELD] : undefined
  const onThePatch = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, ANSWERS_FIELD)
  const onTheReplace = patch.data !== undefined && patch.data !== null && !sameJson(patch.data[ANSWERS_FIELD], stored)
  if (onThePatch || onTheReplace) throw new PanelError(ONLY_THE_ANSWER_DOOR_WRITES_ANSWERS, 409)
}

/**
 * A RUN'S USES ARE NOT IN ITS RECORD. Since migration 0231 a use of a tool is one row in
 * `tool_uses`, written by POST /api/toolset/uses, and no record holds `data.toolUses`. So no write may set, change
 * or drop it on a session record, on either body. A `dataPatch` that names the key is refused whatever it carries.
 * A whole `data` that leaves it out, as every run now does, passes.
 *
 * Asked of every patch, before anything else reads the patch.
 */
function refuseWhatOnlyTheUseDoorWrites(before: { kind: string; data: unknown }, patch: RecordPatch): void {
  if (before.kind !== 'session' && patch.kind !== 'session') return
  const stored = isJsonObject(before.data) ? (before.data as Record<string, unknown>)[TOOL_USES_FIELD] : undefined
  const onThePatch = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, TOOL_USES_FIELD)
  const onTheReplace = patch.data !== undefined && patch.data !== null && !sameJson(patch.data[TOOL_USES_FIELD], stored)
  if (onThePatch || onTheReplace) throw new PanelError(ONLY_THE_USE_DOOR_WRITES_TOOL_USES, 403)
}

/**
 * A RUN'S SETTLEMENTS ARE THEIR DOORS'. Each field in
 * SETTLEMENTS_ON_THE_CHECK is written only by its own door, after that door checks its conditions.
 * No other write may set, change or drop one, on either body:
 *   - a `dataPatch` whose `theCheck` names the field, whatever it carries; or whose `theCheck` is not an object (a
 *     whole theCheck replaced or dropped) while the run holds the field;
 *   - a whole `data` whose `theCheck` carries a different value of the field, or none where one is stored. A round
 *     trip that sends the stored value back unchanged passes.
 * Asked of every patch, before anything else reads the patch, unless the field's own door is the writer.
 */
function refuseWhatOnlyTheSettlementDoorsWrite(before: { kind: string; data: unknown }, patch: RecordPatch): void {
  if (before.kind !== 'session' && patch.kind !== 'session') return
  const storedCheck = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['theCheck'] : undefined
  for (const field of SETTLEMENTS_ON_THE_CHECK) {
    if (theDoorOfThisFieldIsWriting(field)) continue
    const stored = isJsonObject(storedCheck) ? (storedCheck as Record<string, unknown>)[field] : undefined
    let touched = false
    if (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'theCheck')) {
      const arriving = patch.dataPatch['theCheck']
      touched = isJsonObject(arriving) ? Object.hasOwn(arriving as Record<string, unknown>, field) : stored !== undefined
    }
    if (!touched && patch.data !== undefined && patch.data !== null) {
      const arrivingCheck = patch.data['theCheck']
      const arriving = isJsonObject(arrivingCheck) ? (arrivingCheck as Record<string, unknown>)[field] : undefined
      touched = !sameJson(arriving, stored)
    }
    if (touched) {
      throw new PanelError(
        `Only ${THE_DOOR_OF[field]} writes theCheck.${field} on a run; an ordinary write may not ` +
          'set, change or drop it. Nothing was written.',
        403,
      )
    }
  }
}

/**
 * A RUN'S VERDICTS, TOP-LEVEL SETTLEMENTS AND METHOD MARK ARE THEIR DOORS'. `released`, `refused`, `confirmed`,
 * `closedUnchecked`, the top-level `superseded` and `methodWork` are written only by their own doors (lib/check-field-doors.ts), and every reader of a run's standing takes them as the
 * check's own word. So no other write may set, change or drop one, on either body:
 *   - a `dataPatch` that names the field, whatever it carries;
 *   - a whole `data` that carries a different value of the field, or none where one is stored. A round trip that sends
 *     the stored value back unchanged passes.
 * The create door refuses a run filed already carrying one. Asked of every patch, before anything else reads the
 * patch, unless the field's own door is the writer.
 */
function refuseWhatOnlyTheVerdictDoorsWrite(before: { kind: string; data: unknown }, patch: RecordPatch): void {
  if (before.kind !== 'session' && patch.kind !== 'session') return
  const stored = isJsonObject(before.data) ? (before.data as Record<string, unknown>) : {}
  for (const field of TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS) {
    if (theDoorOfThisFieldIsWriting(field)) continue
    const onThePatch = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, field)
    const onTheReplace = patch.data !== undefined && patch.data !== null && !sameJson(patch.data[field], stored[field])
    if (onThePatch || onTheReplace) throw new PanelError(onlyItsDoorWritesThisVerdict(field), 403)
  }
}

/**
 * WHO SENT A MESSAGE IS SET WHEN IT IS WRITTEN, AND NO LATER WRITE CHANGES IT. The create path makes the sender
 * whoever wrote the message,
 * and Mole Office only from the office's own code (`senderIsMoleOffice`, which no request can set). Until this, the
 * update path did not ask: an agent's PATCH naming `sentBy` on its own message was answered 200, so a message could be
 * made to say Mole Office sent it after it was written. lib/key-files.ts, which reads what the office already told off
 * the office's own notices, is one reader that trusts the field; every page that draws who said what is another.
 *
 * Asked of the data this write would store, so both roads are closed:
 *   - A MESSAGE KEEPS ITS SENDER. A patch naming `sentBy` is refused, whatever it carries, and a wholesale `data` that
 *     changes it or leaves it out is refused, as `routed`, `summons` and `asksThePerson` are. A round trip of the stored
 *     value changes nothing and is allowed.
 *   - A RECORD THAT BECOMES A MESSAGE names no sender but whoever changes its kind. A kind that does not hold `sentBy`
 *     keeps it in `extra`, and a kind change into a message brings it back (moveWhatTheNewKindCannotHold), so without
 *     this a note carrying one could become a message from anybody, Mole Office included.
 */
function refuseASenderThisWriteWouldChange(
  before: { kind: string; data: unknown },
  patch: RecordPatch,
  next: { kind: string; data: unknown },
  actor: Actor,
): void {
  if (next.kind !== 'message') return
  const arriving = isJsonObject(next.data) && Object.hasOwn(next.data, 'sentBy') ? next.data['sentBy'] : undefined
  if (before.kind === 'message') {
    const stored = isJsonObject(before.data) && Object.hasOwn(before.data, 'sentBy') ? before.data['sentBy'] : undefined
    const naming = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'sentBy')
    if (naming || !sameJson(arriving, stored)) throw new PanelError(WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN, 403)
    return
  }
  if (arriving === undefined) return
  const claimed = refFrom(arriving)
  const mine = participantForActor(actor)
  if (claimed === null || mine === null || !theClaimedSenderIsTheWriter(claimed, mine)) {
    throw new PanelError(A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER, 403)
  }
}

/**
 * THE PERSON'S MARK ON A MESSAGE IS SET WHEN THEY WRITE IT. The rule is on
 * src/shared/intent-mark.ts. The person alone sets it on every road that can write a message's data, not only
 * the send door.
 *
 * Asked of the data this write would store, as the sender is above, so both roads are closed for everybody, the person
 * included:
 *   - A MESSAGE KEEPS ITS MARK. A patch naming `intent` is refused, whatever it carries, and a wholesale `data` that
 *     changes it or leaves it out is refused. A round trip of the stored value changes nothing and is allowed.
 *   - Marked parts may move with their unchanged words during a body edit, but their flags and quotes stay fixed.
 *   - A RECORD THAT BECOMES A MESSAGE carries no mark, because nobody wrote that message with one: a kind that does not
 *     hold `intent` keeps it in `extra`, and a kind change into a message would bring it back.
 *
 * A LABEL OF THE PERSON'S OWN, `label`, has the same rule, from src/shared/message-label.ts, and is asked the same way.
 */
function refuseAnIntentMarkThisWriteWouldChange(
  before: { kind: string; data: unknown },
  patch: RecordPatch,
  next: { kind: string; data: unknown },
): void {
  if (next.kind !== 'message') return
  for (const [field, refusal] of [
    ['intent', THE_INTENT_MARK_IS_SET_WHEN_WRITTEN],
    ['label', THE_LABEL_IS_SET_WHEN_WRITTEN],
  ] as const) {
    const arriving = isJsonObject(next.data) && Object.hasOwn(next.data, field) ? next.data[field] : undefined
    if (before.kind === 'message') {
      const stored = isJsonObject(before.data) && Object.hasOwn(before.data, field) ? before.data[field] : undefined
      const naming = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, field)
      if (naming || !sameJson(arriving, stored)) throw new PanelError(refusal, 403)
    } else if (arriving !== undefined) {
      throw new PanelError(refusal, 403)
    }
  }
  if (before.kind !== 'message') {
    if (isJsonObject(next.data) && next.data['markedParts'] !== undefined) throw new PanelError(THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN, 403)
    return
  }
  const oldData = isJsonObject(before.data) ? before.data as Record<string, unknown> : {}
  const newData = isJsonObject(next.data) ? next.data as Record<string, unknown> : {}
  const named = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'markedParts')
  if (!named && sameJson(oldData['markedParts'], newData['markedParts'])) return
  const oldParts = readTheMarkedParts(oldData)
  const newParts = readTheMarkedParts(newData)
  if (!oldParts.ok || !newParts.ok || oldParts.parts.length === 0 || oldParts.parts.length !== newParts.parts.length ||
      oldData['body'] === newData['body'] || oldParts.parts.some((part, i) => {
        const nextPart = newParts.parts[i]
        return nextPart === undefined || part.quote !== nextPart.quote || part.intent !== nextPart.intent || !sameJson(part.label, nextPart.label)
      })) throw new PanelError(THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN, 403)
}

/** The person's name for a part's flag, or the label's own word when their row no longer carries it. */
function theFlagsNamesOfTheBrokenParts(
  data: Record<string, unknown>,
  parts: readonly { quote: string; intent?: 'just-ask' | 'proposal-first'; label?: { text: string } }[],
): { quote: string; name: string }[] {
  const who = refFrom(data['sentBy'])
  const row = who !== null && who.kind === 'person' ? readParticipant(who) : null
  const flags = row !== null && 'chatLabels' in row ? theFlagsOf(row.shippedFlags, row.chatLabels) : null
  return parts.map((part) => ({
    quote: part.quote,
    name:
      part.intent === undefined
        ? theFlagForLabel(part.label as never, flags ?? theFlagsOf(null, null))?.name ?? part.label?.text ?? ''
        : theNameOfTheMark(part.intent, flags),
  }))
}

/**
 * A CHANGE OF WORDS THAT WOULD LEAVE A MARKED PART NOT MATCHING THE WORDS AT ITS PLACE IS REFUSED. The person wrote a
 * message, marked runs of it with flags, and the agent was handed those parts. Moving the words out from under a part
 * would hand the agent a part with no words, or different ones. A validated move carries the same quotes and flags to
 * their new positions; otherwise the refusal names each part the edit would break.
 */
function refuseAChangeOfWordsThatBreaksAPart(
  before: { kind: string; data: unknown },
  next: { kind: string; data: unknown },
): void {
  if (before.kind !== 'message' || next.kind !== 'message') return
  const oldData = isJsonObject(before.data) ? (before.data as Record<string, unknown>) : {}
  const newData = isJsonObject(next.data) ? (next.data as Record<string, unknown>) : {}
  const oldBody = typeof oldData['body'] === 'string' ? oldData['body'] : ''
  const newBody = typeof newData['body'] === 'string' ? newData['body'] : ''
  if (oldBody === newBody) return
  const read = readTheMarkedParts(oldData)
  if (!read.ok || read.parts.length === 0) return
  const nextRead = readTheMarkedParts(newData)
  if (nextRead.ok && !sameJson(oldData['markedParts'], newData['markedParts'])) return
  const broken = read.parts.filter((part) => newBody.slice(part.from, part.to) !== part.quote)
  if (broken.length === 0) return
  throw new PanelError(theChangeOfWordsThatBreaksAPart(theFlagsNamesOfTheBrokenParts(oldData, broken)), 400)
}

/**
 * WHO MAY NAME A MODULE'S PLANNER: the person, an agent holding the secretary card, or whoever made the module (the
 * create row of its change log). The planning flow's first real use named
 * its planner by an ordinary PATCH that nothing checked, and the planner is the one caller the planning doors let in.
 * Asked of a write that would set, change or drop `planner` on a module; one that sends the stored value back passes.
 * Naming one when the module is made is the maker's act, so the create door does not ask.
 */
function refuseAPlannerNamedByAnother(
  before: { id: string; workspaceId: string; kind: string; data: unknown },
  after: { kind: string; data: unknown },
  actor: Actor,
): void {
  if (before.kind !== 'module' && after.kind !== 'module') return
  const was = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['planner'] : undefined
  const is = isJsonObject(after.data) ? (after.data as Record<string, unknown>)['planner'] : undefined
  if (sameJson(was ?? null, is ?? null)) return
  if (actor.type === 'human' || theSecretaryOfThisOffice(actor)) return
  const me = participantForActor(actor)
  const filed = whoFiled(before.workspaceId, before.id)
  const maker = filed === null ? null : participantForActor({ type: filed.actorType as Actor['type'], id: filed.actorId })
  if (me !== null && maker !== null && sameParticipant(me, maker)) return
  // AT OFF, AN AGENT ITS OWN KEY PROVES NAMES THE PLANNER TOO, and the change row names it. Any other
  // caller is refused in the off words. At block that agent is counted as stopped, and the count is made again if the
  // write this is asked in is taken back.
  const position = gatePosition('who-names-a-modules-planner')
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-names-a-modules-planner', position!) !== 'block') return
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-names-a-modules-planner', "name a module's planner")
  const refusal = new PanelError(
    `A module's planner is named only by the person, by a secretary, or by whoever made the module, because the ` +
      `planner is the one caller the planning doors let in. This request came from ${actor.type} "${actor.id}", and ` +
      `module ${before.id} was made by ${filed === null ? 'nobody the change log records' : `"${filed.actorId}"`}. ` +
      'Ask one of them to name the planner. Nothing was written.',
    403,
    undefined,
    undefined,
    undefined,
    { code: 'plannerNamedByAnother', values: {} },
  )
  if (!keyed) throw refusal
  throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-names-a-modules-planner', 'block'))
}

/**
 * NOBODY BUT THE OFFICE FOLDS A LINE OR UNFOLDS ONE. `foldedInto` is written only by the office's fold of its own old
 * lines (`THE_OFFICE_FOLDS_ITS_LINES`, scripts/fold-the-old-dead-letter-lines.ts). Asked of the data this write would
 * store, so every road is closed:
 *   - a patch naming `foldedInto` is refused, whatever it carries;
 *   - a wholesale `data` that changes it or leaves it out is refused, as `summons` is; a round trip changes nothing;
 *   - a record that becomes a message may not bring one in from `extra`.
 */
function refuseAFoldThisWriteWouldMake(
  before: { kind: string; data: unknown },
  patch: RecordPatch,
  next: { kind: string; data: unknown },
): void {
  if (patch[THE_OFFICE_FOLDS_ITS_LINES] === true || next.kind !== 'message') return
  const stored = before.kind === 'message' && isJsonObject(before.data) ? before.data['foldedInto'] : undefined
  const arriving = isJsonObject(next.data) ? next.data['foldedInto'] : undefined
  const naming = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'foldedInto')
  if (naming || !sameJson(arriving, stored)) throw new PanelError(ONLY_THE_OFFICE_FOLDS_A_LINE, 403)
}

/**
 * WHO MAY CHANGE A MESSAGE.
 *
 *   - Only its writer may change its words, which are its `title` and `data.body`. Once the message has gone out,
 *     only within MOLE_OFFICE_MESSAGE_EDIT_WINDOW_SECONDS of writing it (two minutes), and the
 *     first change stores `data.edited`: when, by whom, and the title and body as first written. A later change keeps
 *     that original and moves `at`.
 *   - A MESSAGE THAT HAS NOT GONE OUT is a comment its writer did not send as it was written (`sentWhenWritten`) and
 *     that nobody has been handed yet (`aMessageHasGoneOut`), such as the person's review comments written to nobody. Its writer
 *     changes its words at any age with no mark, because nobody has read the first ones, and the review pane offers Edit
 *     on it until it goes.
 *   - Besides the words, the writer may still choose who a comment is for (`chosenRecipient`, which the
 *     review pane writes after the comment is filed and before it is sent) and write its short forms
 *     (`shortForms`, which chapter 10 asks every record to have). Neither changes what was said.
 *   - WHILE A COMMENT HAS NOT GONE OUT, its writer may also add the person to `data.to`
 *     (`theCommentOnlyGainsThePerson`). Every addressee already in `to` stays, and only a person may be added
 *     this way, because an agent added here would skip the agent checks of the create door. An urgent comment
 *     meets the create door's urgent-message limits before it gains the person (`whyThisInjectIsRefused`). The record
 *     door then writes the person's delivery row (`keepTheDeliveryRowsInStep`). Once the comment has gone out,
 *     `to` is fixed like every other field that is not its words.
 *   - A recipient changes only its own read state, and that is a delivery row, changed at
 *     POST /api/messages/:id/mark and never through the record.
 *   - Nobody changes a notice the office wrote (`sentBy` Mole Office).
 *   - A message that has gone out stays a message: a kind change out of one would make its words ordinary text any
 *     write could replace, and a change back would bring the words home rewritten. A message that has not gone out
 *     may be corrected into another kind by its writer, as any record may (the owner's rule that a mistaken first
 *     choice must not lock a record, design/ROUND-SEVEN-OWNER-MESSAGE.md section 3).
 *
 * Asked of the title and the data this write would store, so `data`, `dataPatch`, a kind change and a
 * put-back of an earlier revision are all judged the same way. The one exception is the start-an-agent
 * door, which writes `runWasAskedFor` on the person's press.
 *
 * It returns the edit mark to store when the words change, and null when they do not.
 */
function whatAChangeToAMessageMustCarry(
  before: { id: string; kind: string; title: string; summary: string | null; data: unknown; createdAt: string; workspaceId: string },
  patch: RecordPatch,
  next: { kind: string; data: unknown },
  actor: Actor,
): Record<string, unknown> | null {
  if (before.kind !== 'message') return null
  // ASKED ONCE, AND ONLY WHEN THE ANSWER IS NEEDED: a kind change out, or a change of the words.
  let goneOut: boolean | undefined
  const hasItGoneOut = (): boolean => (goneOut ??= aMessageHasGoneOut(before))
  if (next.kind !== 'message') {
    if (hasItGoneOut()) {
      throw new PanelError(A_MESSAGE_STAYS_A_MESSAGE, 403, undefined, undefined, 'A message stays a message.', {
        code: 'messageStaysAMessage',
        values: {},
      })
    }
    theWriterAloneChangesAMessage(before, refFrom((isJsonObject(before.data) ? before.data : {})['sentBy']), actor)
    return null
  }
  const stored: Record<string, unknown> = isJsonObject(before.data) ? before.data : {}
  const arriving: Record<string, unknown> = isJsonObject(next.data) ? next.data : {}
  const changed: string[] = []
  if (patch.title !== undefined && patch.title !== before.title) changed.push('title')
  if (patch.summary !== undefined && patch.summary !== before.summary) changed.push('summary')
  for (const key of new Set([...Object.keys(stored), ...Object.keys(arriving)])) {
    if (key === 'edited') continue
    if (!isDeepStrictEqual(stored[key], arriving[key])) changed.push(`data.${key}`)
  }
  const wordsChange = changed.includes('title') || changed.includes('data.body') || changed.includes('data.quotePositions')
  // THE EDIT MARK IS WRITTEN BY MOLE OFFICE. A caller naming it, or changing it while the words stay as
  // they are, is refused below with the other fields. When the words change, the mark below replaces
  // whatever the write carried, so a put-back of a revision without one still keeps the original.
  const namesTheMark = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'edited')
  if (namesTheMark || (!wordsChange && !isDeepStrictEqual(stored['edited'], arriving['edited']))) changed.push('data.edited')
  if (changed.length === 0) return null

  if (patch[THE_START_AN_AGENT_DOOR] === true && changed.every((field) => field === 'data.runWasAskedFor' || field === 'data.carriedTo')) return null
  if (patch[THE_DEAD_LETTER_SWEEP] === true && changed.every((field) => field === 'data.routed')) return null

  const sender = refFrom(stored['sentBy'])
  if (
    patch[THE_OFFICES_OWN_LINE] === true &&
    sender !== null &&
    isMoleOffice(sender) &&
    changed.every((field) => field === 'data.body' || field === 'data.saidInFull')
  ) {
    return null
  }
  if (patch[THE_OFFICE_FOLDS_ITS_LINES] === true && sender !== null && isMoleOffice(sender) && changed.every((field) => field === 'data.foldedInto')) {
    return null
  }
  const mine = theWriterAloneChangesAMessage(before, sender, actor)
  // `data.to` passes only when the comment gains the person and nothing else, and has not gone out.
  const toMayChange =
    changed.includes('data.to') && theCommentOnlyGainsThePerson(stored['to'], arriving['to']) && !hasItGoneOut()
  const notWords = changed.filter((field) => !WHAT_A_WRITER_MAY_CHANGE.includes(field) && !(field === 'data.to' && toMayChange) && !(field === 'data.markedParts' && changed.includes('data.body')))
  if (notWords.length > 0) {
    throw new PanelError(aWriterChangesOnlyTheWords(notWords), 403, undefined, undefined, 'A writer may change only the words of a message.', {
      code: 'messageFieldNotAWord',
      values: {},
    })
  }
  // AND A COMMENT THAT GAINS THE PERSON MEETS THE LIMITS OF AN URGENT MESSAGE, asked by the one function the create door
  // asks (`whyThisInjectIsRefused`): the person's switch that lets agents inject, and one unread urgent message per
  // agent. The data asked about is what this write would store, with the writer as its sender, and it is asked before
  // anything is written. Without it, an urgent comment written to nobody and then given the person reached them past
  // both limits.
  if (toMayChange) {
    const injecting = whyThisInjectIsRefused({ ...arriving, sentBy: mine }, mine, whetherAgentsMayInject)
    if (injecting !== null) throw new PanelError(injecting, 403)
  }
  if (!wordsChange) return null
  if (!hasItGoneOut()) return null

  const written = parseStoredStamp(before.createdAt)
  if (written === null) {
    throw new PanelError(
      `Mole Office cannot tell when message ${before.id} was written: its stored time ${JSON.stringify(before.createdAt)} ` +
        'is not one Mole Office writes. So it cannot tell whether the words may still be changed, and the change is ' +
        'refused. Nothing was written.',
      409,
    )
  }
  const window = messageEditWindowSeconds()
  const ago = Math.floor((Date.now() - written) / 1000)
  if (ago > window) {
    throw new PanelError(
      `The words of this message can no longer be changed. Nothing was written. Its writer may change them for ` +
        `${String(window)} seconds after writing it, and it was written at ${before.createdAt}, ${String(ago)} seconds ago. ` +
        'Write a new message instead.',
      403,
      undefined,
      undefined,
      'The time to change this message has passed.',
      { code: 'messageEditWindowClosed', values: { seconds: window } },
    )
  }
  const had = stored['edited']
  const original =
    isJsonObject(had) && isJsonObject(had['original'])
      ? had['original']
      : { title: before.title, body: typeof stored['body'] === 'string' ? stored['body'] : null }
  return { at: nowStamp(), by: { kind: mine.kind, id: mine.id }, original }
}

/**
 * NOBODY CHANGES A NOTICE FROM MOLE OFFICE, AND NOBODY BUT ITS WRITER CHANGES ANY OTHER MESSAGE. Asked of a change of
 * the words and of a kind change out of a message that has not gone out. Returns the writer.
 */
function theWriterAloneChangesAMessage(
  before: { id: string },
  sender: ParticipantRef | null,
  actor: Actor,
): ParticipantRef {
  if (sender !== null && isMoleOffice(sender)) {
    throw new PanelError(A_NOTICE_IS_THE_OFFICES, 403, undefined, undefined, 'Nobody may change a notice from Mole Office.', {
      code: 'messageIsTheOfficesNotice',
      values: {},
    })
  }
  const mine = participantForActor(actor)
  const notTheWriters = () =>
    new PanelError(onlyItsWriterChangesAMessage(before.id, sender === null, 'change'), 403, undefined, undefined, 'Only its writer may change this message.', {
      code: 'messageNotYourWords',
      values: {},
    })
  if (sender === null || mine === null) throw notTheWriters()
  if (!theClaimedSenderIsTheWriter(sender, mine)) {
    const met = () => gateMet('who-changes-a-message')
    if (gatePosition('who-changes-a-message') === 'block') throw gateMetOnceTheWriteIsTakenBack(notTheWriters(), met)
    met()
  }
  return mine
}

/**
 * WHETHER A CHANGE OF `data.to` ONLY ADDS THE PERSON. True when the new list keeps every addressee the stored list
 * holds, adds at least one, and every one it adds is a person the registry holds. Anything else is false: a dropped
 * addressee, an agent, or a list that is not a list.
 */
function theCommentOnlyGainsThePerson(stored: unknown, arriving: unknown): boolean {
  if (!Array.isArray(arriving)) return false
  const had = Array.isArray(stored) ? stored.map(refFrom) : []
  const has = arriving.map(refFrom)
  if (had.some((one) => one === null) || has.some((one) => one === null)) return false
  const named = (list: (ParticipantRef | null)[], who: ParticipantRef): boolean => list.some((one) => one !== null && sameParticipant(one, who))
  if (!had.every((one) => one !== null && named(has, one))) return false
  const added = has.filter((one): one is ParticipantRef => one !== null && !named(had, one))
  return added.length > 0 && added.every((one) => one.kind === 'person' && readParticipant(one) !== null)
}

/** The fields a message's writer may change: the words, within the window, and two that are not words. */
const WHAT_A_WRITER_MAY_CHANGE: readonly string[] = ['title', 'data.body', 'data.quotePositions', 'data.chosenRecipient', `data.${THE_SHORT_FORMS_KEY}`]

const A_MESSAGE_STAYS_A_MESSAGE =
  'A message stays a message, so its kind cannot be changed. Nothing was written. Its words were given to the ' +
  'people it was addressed to, and as another kind any write could replace them. File a new record for what you ' +
  'mean now, and link it to this one.'

/** Why the writer may not change a field of its message that is not its words. */
function aWriterChangesOnlyTheWords(fields: readonly string[]): string {
  return (
    `The writer of a message may change only its words, which are its title and data.body, and this change also ` +
    `names ${fields.join(', ')}. Nothing was written. The rest of a message is fixed once it is written, except who ` +
    `a comment is for (data.chosenRecipient), the person added to data.to while a comment has not gone out, and its ` +
    `short forms (data.${THE_SHORT_FORMS_KEY}).` +
    (fields.includes('data.edited') ? ' Mole Office writes data.edited itself when the words change.' : '')
  )
}

/** The parts of a role request that say who answers it and what the answer is. Only the role request door writes them. */
const THE_ANSWER_OF_A_REQUEST = ['answersTo', 'answer', 'answeredAt', 'answerSays', 'extra'] as const
/** The parts of a role request that say what it asks. Only the person may change them once it is filed. */
const THE_WORDS_OF_A_REQUEST = ['asking', 'because', 'asker', 'holding'] as const

/**
 * A REQUEST THAT WAITS FOR THE PERSON IS NOT MOVED, ANSWERED OR REWORDED PAST THEM. Deletion is already guarded;
 * this guards every other change door, because each of them writes through `patchRecord` : PATCH
 * /api/records/:id, a revision restore, and a revoke. Who it answers to and its answer are written by the role request door
 * only, whoever calls. Its kind is not changed, because a new kind would carry `answersTo` off into `extra`. Its title,
 * its summary and what it asks are changed by the person only.
 */
function refuseAChangeToARequestThatWaitsForThePerson(
  before: { id: string; kind: string; title: string; summary: string | null; data: unknown },
  patch: RecordPatch,
  actor: Actor,
): void {
  if (before.kind !== 'role_request' || !isJsonObject(before.data)) return
  const stored = before.data as Record<string, unknown>
  const answersTo = stored['answersTo']
  if (!isJsonObject(answersTo) || answersTo['kind'] !== 'person') return
  if (patch.kind !== undefined && patch.kind !== 'role_request') {
    throw new PanelError(
      `Request ${before.id} waits for the person, and its kind cannot be changed: a new kind would take it off their ` +
        `list. Nothing was written.`,
      403,
    )
  }
  const after =
    patch.data !== undefined && patch.data !== null
      ? patch.data
      : patch.dataPatch !== undefined
        ? mergeData(stored, patch.dataPatch).data
        : stored
  const changed = (field: string): boolean =>
    !sameJson(Object.hasOwn(after, field) ? after[field] : undefined, Object.hasOwn(stored, field) ? stored[field] : undefined)
  if (theRoleRequestDoorIsWriting === 0) {
    const answer = THE_ANSWER_OF_A_REQUEST.filter(changed)
    if (answer.length > 0) {
      throw new PanelError(
        `Request ${before.id} waits for the person, and this write would change ${answer.map((f) => `data.${f}`).join(', ')}. ` +
          'Who a request answers to and its answer are written only by the answer door: the person, or a secretary ' +
          `they raised, presses POST /api/roles/requests/${before.id}/grant or /refuse, and its asker may press ` +
          '/withdraw. Nothing was written.',
        403,
      )
    }
  }
  if (thePersonIsProved(actor)) return
  const words = [
    ...(patch.title !== undefined && patch.title !== before.title ? ['title'] : []),
    ...(patch.summary !== undefined && patch.summary !== before.summary ? ['summary'] : []),
    ...THE_WORDS_OF_A_REQUEST.filter(changed).map((f) => `data.${f}`),
  ]
  if (words.length > 0) {
    throw new PanelError(
      `Request ${before.id} waits for the person, and this write would change its ${words.join(', ')}. Once it is ` +
        'filed, only the person may change what it says, so it cannot be reworded before they read it. Nothing was ' +
        'written.',
      403,
    )
  }
}

/** The moment a run key's binding is written: its key row's own `made_at`. Only the two functions below set it. */
const ORIGINAL_RUN_KEY_MINT_AT: unique symbol = Symbol('the original run-key mint event')
/** The starter's own key on the mint of a run a starter files by hand. Only the first function below sets it. */
const THE_STARTERS_KEY_ON_ITS_MINT: unique symbol = Symbol("the starter's key on its run's mint")
type OriginalRunKeyMintPatch = RecordPatch & { readonly [ORIGINAL_RUN_KEY_MINT_AT]: string; readonly [THE_STARTERS_KEY_ON_ITS_MINT]?: ProvedHolder }

/**
 * The original create transaction publishes the key row and its first run binding as one event. `startersKey` is the
 * holder the create of the same run was given, so the two revisions carry the same one (`theOriginalMintOf` in lib/keys.ts).
 */
export function recordTheOriginalRunKeyMint(runId: string, heldKeyId: string, actor: Actor, startersKey?: ProvedHolder): PatchResult {
  const run = getRecord(runId)
  const serving = run?.kind === 'session' ? theAgentARunServes(run.data as Record<string, unknown>) : null
  const held = sqlite.prepare('SELECT whose_kind, whose_id, made_at, revoked_at FROM held_keys WHERE id = ?').get(heldKeyId) as
    { whose_kind: string; whose_id: string; made_at: string; revoked_at: string | null } | undefined
  const original = sqlite.prepare('SELECT seq, kind, op, data FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(runId) as
    { seq: number; kind: string; op: string; data: string } | undefined
  const created = original === undefined ? null : JSON.parse(original.data) as Record<string, unknown>
  if (run === null || run.deletedAt !== null || run.kind !== 'session' || run.data['state'] !== 'running' || serving === null
    || held === undefined || held.whose_kind !== 'agent' || held.whose_id !== serving.id || held.revoked_at !== null
    || original?.seq !== 1 || original.kind !== 'session' || original.op !== 'create' || created?.['state'] !== 'running'
    || theAgentARunServes(created)?.id !== serving.id) {
    throw new PanelError("The original run-key mint needs its running session's first create and its own fresh key row. Its binding was not written.", 409)
  }
  // Only this internal patch carries the event time already written by the key producer.
  // A request cannot supply this private symbol or choose a revision timestamp.
  const patch: OriginalRunKeyMintPatch = {
    dataPatch: { extra: { runKeyId: heldKeyId } },
    [ORIGINAL_RUN_KEY_MINT_AT]: held.made_at,
    ...(startersKey === undefined ? {} : { [THE_STARTERS_KEY_ON_ITS_MINT]: startersKey }),
  }
  return patchRecord(runId, patch, actor)
}

/**
 * A REOPENED TERMINAL'S NEW KEY, BOUND IN THE TRANSACTION THAT REVOKES THE OLD ONE. The run's
 * new key is made, the key the run names is revoked at the new key's own `made_at`, and the binding is written as the
 * office at that same moment. `theReopenBindingOf` in lib/keys.ts reads exactly this, so a patch that names a key and
 * revokes nothing binds nothing. Where the old key cannot be revoked, because it was revoked already or is not the key
 * the run names, nothing is written and the new key's row goes with the transaction.
 */
export function replaceTheRunKeyOfAReopenedRun(runId: string, oldKeyId: string, agentId: string, provedBy: HowAKeysMintWasProved | null, because: string): { key: string; heldKeyId: string } {
  return sqlite.transaction(() => {
    const run = getRecord(runId)
    const extra = run !== null && isJsonObject(run.data['extra']) ? (run.data['extra'] as Record<string, unknown>) : null
    if (run === null || run.deletedAt !== null || run.kind !== 'session' || extra?.['runKeyId'] !== oldKeyId || theAgentARunServes(run.data as Record<string, unknown>)?.id !== agentId) {
      throw new PanelError(`The run ${runId} does not name the key it was to replace, or serves another agent. No new key was made.`, 409)
    }
    const made = makeARunKey(agentId, provedBy)
    const held = sqlite.prepare('SELECT made_at FROM held_keys WHERE id = ?').get(made.heldKeyId) as { made_at: string }
    if (!revokeTheKeyNamed(oldKeyId, because, held.made_at)) {
      throw new PanelError(`The run ${runId}'s key was revoked already, so it was not replaced. No new key was made.`, 409)
    }
    const patch: OriginalRunKeyMintPatch = {
      dataPatch: { extra: { runKeyId: made.heldKeyId } },
      [ORIGINAL_RUN_KEY_MINT_AT]: held.made_at,
    }
    patchRecord(runId, patch, { type: 'system', id: moleOffice().id })
    return made
  })()
}

export function patchRecord(
  id: string,
  patch: RecordPatch,
  actor: Actor,
  ledger?: LedgerLabel,
  deleting: readonly string[] = [],
  checkTerritoryBeforeWrite?: TerritoryWriteCheck,
): PatchResult {
  const before = db.select().from(records).where(eq(records.id, id)).get()
  if (!before) throw noRecordHasThisId(id)
  // A SEALED RUN'S OWN KEY WRITES THAT RUN'S SERVED CONDITIONS AND NOTHING ELSE, AND FOR FIFTEEN
  // MINUTES AFTER A FINISH ITS USAGE RECEIPT AS WELL. A patch that is the receipt alone passes on
  // the second; any other patch with either proof meets the first, or the second's refusal where there is no first.
  const theReceiptAlone = actor.finishedRunsOwnKey !== undefined && aFinishedRunStoresOnlyItsReceipt(id, patch, actor.finishedRunsOwnKey)
  if (!theReceiptAlone && actor.sealedRunsOwnKey !== undefined) aSealedRunWritesOnlyItsServed(id, patch, actor.sealedRunsOwnKey)
  else if (!theReceiptAlone && actor.finishedRunsOwnKey !== undefined) throw aFinishedRunsKeyAskedForMore(actor.finishedRunsOwnKey)

  if (before.kind === 'session' || patch.kind === 'session') {
    const stored = (before.data as Record<string, unknown>)[ENDED_RUN_LOOK_FIELD]
    if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, ENDED_RUN_LOOK_FIELD)) ||
        (patch.data && !sameJson(patch.data[ENDED_RUN_LOOK_FIELD], stored))) {
      throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_LOOK_MARK, 403)
    }
  }
  // HOW THE ROUND ENDED IS THE OFFICE'S OWN ACCOUNT, written by `writeHowTheRoundEnded` alone.
  // A patch naming it is refused, and so is a whole `data` that changes it or leaves it out.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, HOW_THE_ROUND_ENDED)) ||
      (patch.data && !sameJson(patch.data[HOW_THE_ROUND_ENDED], (before.data as Record<string, unknown>)[HOW_THE_ROUND_ENDED]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_HOW_THE_ROUND_ENDED, 403)
  }
  // THE NEXT ROUND IS THE OFFICE'S TOO, written by `writeTheNextRound` alone, the same way.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, NEXT_ROUND)) ||
      (patch.data && !sameJson(patch.data[NEXT_ROUND], (before.data as Record<string, unknown>)[NEXT_ROUND]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND, 403)
  }
  // SO ARE THE WORKER RUNS A SUPERVISOR ASKED FOR, written by `writeTheWorkerRun` alone.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, WORKER_RUNS)) ||
      (patch.data && !sameJson(patch.data[WORKER_RUNS], (before.data as Record<string, unknown>)[WORKER_RUNS]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS, 403)
  }
  // The Casting choice is the office's record too, including the absence of a draw.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, CASTING_ROLL)) ||
      (patch.data && !sameJson(patch.data[CASTING_ROLL], (before.data as Record<string, unknown>)[CASTING_ROLL]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL, 403)
  }
  // So is which commit a worker's run was asked to be cut from, written by `writeTheCutAsked` alone.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, CUT_ASKED)) ||
      (patch.data && !sameJson(patch.data[CUT_ASKED], (before.data as Record<string, unknown>)[CUT_ASKED]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED, 403)
  }
  // And which images a worker's run was given, written by `writeTheImagesGiven` alone.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, IMAGES_GIVEN)) ||
      (patch.data && !sameJson(patch.data[IMAGES_GIVEN], (before.data as Record<string, unknown>)[IMAGES_GIVEN]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN, 403)
  }
  // And the package it was started for, written by `writeTheWorkerPackage` alone.
  if ((patch.dataPatch && Object.hasOwn(patch.dataPatch, WORKER_PACKAGE)) ||
      (patch.data && !sameJson(patch.data[WORKER_PACKAGE], (before.data as Record<string, unknown>)[WORKER_PACKAGE]))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE, 403)
  }
  // THE INDEPENDENT MARK IS WRITTEN ONCE, by the door that files the criticism, and nothing the office does
  // patches it afterwards. A patch may not add or change it, whatever the caller: a `dataPatch` naming it is
  // refused, and a whole `data` that changes it or leaves it out is refused too, so the mark cannot be
  // added to a plain criticism or taken off a filed one.
  if (before.kind === 'criticism' || patch.kind === 'criticism') {
    const stored = isJsonObject(before.data) ? before.data['independent'] : undefined
    if ((patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'independent')) ||
        (patch.data !== undefined && !sameJson(isJsonObject(patch.data) ? patch.data['independent'] : undefined, stored))) {
      throw new PanelError(ONLY_THE_CRITICISM_DOOR_WRITES_INDEPENDENT, 403)
    }
  }
  refuseAChangeToARequestThatWaitsForThePerson(before, patch, actor)
  if (before.kind === 'sealed_tip' || patch.kind === 'sealed_tip') throw new PanelError('A sealed tip is immutable. Finish the run again to submit a new seal.', 409)
  if (patch.dataPatch && Object.hasOwn(patch.dataPatch, 'sealedTip')) throw new PanelError('The office writes sealedTip when a run finishes.', 403)
  if (patch.data && patch.data['sealedTip'] !== (before.data as Record<string, unknown>)['sealedTip']) throw new PanelError('A replacement must retain the seal written by the office.', 403)
  // AND NOBODY CHANGES THE ROUTING. `routed` is the office's own account of
  // where it also gave the words, written once at send time from the reach reading. A `dataPatch`
  // that names it is refused, and a wholesale `data` that changes it OR leaves it out is refused, so
  // a caller can neither forge a copy nor take the record of one off a message. A round trip that
  // sends the stored value back unchanged is not a change and is allowed, as `served` is.
  //
  // THE ONE EXCEPTION IS THE DEAD-LETTER SWEEP, which routes a letter to a retired agent
  // later, the way the send door would have. It may only ADD entries after the stored ones, through `dataPatch`, and
  // change nothing else; anything more is refused as from any caller.
  const theSweepAddsToTheRouting = (stored: unknown): boolean => {
    if (patch[THE_DEAD_LETTER_SWEEP] !== true || patch.data !== undefined || patch.dataPatch === undefined) return false
    if (Object.keys(patch.dataPatch).some((key) => key !== 'routed')) return false
    const arrives = patch.dataPatch['routed']
    const held = Array.isArray(stored) ? stored : []
    return Array.isArray(arrives) && arrives.length > held.length && sameJson(arrives.slice(0, held.length), held)
  }
  if (before.kind === 'message') {
    const storedRouted = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['routed'] : undefined
    if (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'routed') && !theSweepAddsToTheRouting(storedRouted)) {
      throw new PanelError(
        'Mole Office writes `routed` when it routes a message, and a caller may not set or change it. Nothing was written.',
        403,
      )
    }
    if (patch.data !== undefined && patch.data !== null) {
      const arrives = Object.hasOwn(patch.data, 'routed') ? patch.data['routed'] : undefined
      if (!sameJson(arrives, storedRouted)) {
        throw new PanelError(
          'Mole Office writes `routed` when it routes a message, and a caller may not set or change it. Nothing was written.',
          403,
        )
      }
    }
  }
  // AND A WRITER WHO CHANGES A MESSAGE'S WORDS IS REMINDED OF A PIECE THAT LOOKS LIKE A KEY. Only
  // the words that change are asked: a patch that carries the stored words back unchanged is not reminded of what an
  // older message already holds. Every part of the words is asked, as on the way in (src/shared/message-keys.ts lists them).
  let keyReminder: AKeyReminder | null = null
  // THE RUN-KEY REMINDER AND THE LEDGER NOTE IT NEEDS, written just before the write once the stamp it names is known.
  let runKeyReminder: string | null = null
  let ledgerNote = ledger?.note
  if (before.kind === 'message') {
    const stored = isJsonObject(before.data) ? (before.data as Record<string, unknown>) : {}
    const after = patch.data !== undefined && patch.data !== null ? patch.data : { ...stored, ...(patch.dataPatch ?? {}) }
    const sender = refFrom(stored['sentBy'])
    const officeLine = sender !== null && isMoleOffice(sender)
    keyReminder = theKeyReminderFor(
      theWordsAWriteChanges(
        theWordsOfAMessage({ title: before.title, summary: before.summary, data: stored, officeLine }),
        theWordsOfAMessage({ title: patch.title ?? before.title, summary: patch.summary ?? before.summary, data: after, officeLine }),
      ),
      actor,
    )
  }
  // AND NOBODY CHANGES THE TWO MARKS OF A DEAD-LETTER SWEEP LINE, THE KIND OF A NOTICE, WHAT A MESSAGE ASKED A
  // SUPERVISOR TO RESOLVE OR WHICH COMMENTS A REVIEW'S MESSAGE CARRIES. Each is written once,
  // by its writer, when the line is written, so a patch naming one is refused, and a wholesale `data` that changes or
  // leaves out one is refused, as `routed` is above.
  if (before.kind === 'message') {
    for (const field of ['deliveredOnlyTo', 'deadLetterSweep', 'notice', 'askedToResolve', 'carries'] as const) {
      const stored = isJsonObject(before.data) ? (before.data as Record<string, unknown>)[field] : undefined
      const naming = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, field)
      const changing = patch.data !== undefined && patch.data !== null && !sameJson(Object.hasOwn(patch.data, field) ? patch.data[field] : undefined, stored)
      if (naming || changing) {
        throw new PanelError(`${field === 'notice' ? 'Mole Office and the inspector write' : 'Mole Office writes'} \`${field}\` when the line is written, and a caller may not set or change it. Nothing was written.`, 403)
      }
    }
  }
  // AND NOBODY MAKES A MESSAGE A SUMMONS, OR UNMAKES ONE, AFTER IT IS FILED. `summons` is the
  // summons door's own mark, which the mail tool carries to the person. A patch naming it is refused, and a wholesale `data` that
  // changes it or leaves it out is refused, as `routed` is above; a round trip of the stored value changes nothing.
  if (before.kind === 'message') {
    const storedSummons = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['summons'] : undefined
    const naming = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'summons')
    const changing = patch.data !== undefined && patch.data !== null && !sameJson(Object.hasOwn(patch.data, 'summons') ? patch.data['summons'] : undefined, storedSummons)
    if (naming || changing) {
      throw new PanelError(
        'Mole Office marks a message as a summons when a secretary calls the person in, and a caller may not set, change ' +
          'or take off that mark. Nothing was written.',
        403,
      )
    }
  }

  // AND WHETHER A MESSAGE ASKS THE PERSON SOMETHING IS SET WHEN IT IS WRITTEN, never afterwards: the
  // person has already been given the message as it was. A patch naming the field is refused, and a
  // wholesale `data` that changes it or leaves it out is refused, as `summons` is above; a round trip
  // of the stored value changes nothing. The rule is on the section in shared/messages.ts.
  if (before.kind === 'message') {
    const storedAsks = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['asksThePerson'] : undefined
    const naming = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'asksThePerson')
    const changing = patch.data !== undefined && patch.data !== null && !sameJson(Object.hasOwn(patch.data, 'asksThePerson') ? patch.data['asksThePerson'] : undefined, storedAsks)
    if (naming || changing) throw new PanelError(ASKS_THE_PERSON_IS_SET_WHEN_WRITTEN)
  }
  // AND THE RUN'S CONDITIONS, criterion HB1. A `dataPatch` naming `served` writes it whole; a
  // wholesale `data` that carries a `served` different from the stored one writes it too. A replace
  // that resends the stored value unchanged is a round trip, not a hand-written value, and writes
  // nothing anyway. A `data` that drops `served` is refused below by the emptied-fields check, so
  // it never silently takes the conditions off a record that holds them.
  let changesTheRestOfARun = false
  if (before.kind === 'session') {
    // THE COMPUTER A RUN OF AN AGENT NAMES, checked as on the create door when a write changes it.
    const storedData = isJsonObject(before.data) ? (before.data as Record<string, unknown>) : {}
    const nextData = patch.data ?? (patch.dataPatch === undefined ? storedData : { ...storedData, ...patch.dataPatch })
    if (nextData !== null && nextData['servingAgent'] !== undefined && nextData['servingAgent'] !== null && !sameJson(nextData['machine'], storedData['machine'])) {
      const why = whyARunsMachineIsNotKnown(nextData['machine'])
      if (why !== null) throw new PanelError(why, 400)
    }
    const storedServed = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['served'] : undefined
    // A `dataPatch` that NAMES `served` is an attempt to write it, whether it carries a new value
    // or the one already stored — a stranger's client-side copy of the conditions is still the
    // stranger's copy, not the run's own reading, and letting it through on equality would mean
    // the refusal turned on what value happened to be in it. A whole-`data` replace is different:
    // a caller that read the record and sent it back unchanged is a round trip, and refuses that
    // would break every GET-edit-PUT caller on this kind. And a `data` that DROPS `served` is
    // refused below by the emptied-fields check, so it never silently takes the conditions off a
    // record that holds them.
    const arrivesOnThePatch = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'served')
    const arrivesOnTheReplace = patch.data !== undefined && patch.data !== null && Object.hasOwn(patch.data, 'served') && !sameJson(patch.data['served'], storedServed)
    if (arrivesOnThePatch || arrivesOnTheReplace) assertMayWriteServed(actor, { recordId: id, workspaceId: before.workspaceId, data: before.data })
    const storedSandbox = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['sandbox'] : undefined
    const sandboxOnThePatch = patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'sandbox') && !sameJson(patch.dataPatch['sandbox'], storedSandbox)
    const sandboxOnTheReplace = patch.data !== undefined && patch.data !== null && Object.hasOwn(patch.data, 'sandbox') && !sameJson(patch.data['sandbox'], storedSandbox)
    if (sandboxOnThePatch || sandboxOnTheReplace) {
      const next = sandboxOnThePatch ? patch.dataPatch!['sandbox'] : patch.data!['sandbox']
      assertMayWriteASandbox(actor, { recordId: id, workspaceId: before.workspaceId, data: before.data, stored: storedSandbox, next })
    }
    // AND WHO ENDS IT (assertMayEndARun), asked only when this write moves the run's state to an end.
    const storedState = isJsonObject(before.data) ? (before.data as Record<string, unknown>)['state'] : undefined
    const nextState = theStateAWriteLeaves(storedState, patch)
    const endsIt = !theRunHasEnded(storedState) && theRunHasEnded(nextState)
    if (endsIt) {
      assertMayEndARun(actor, { recordId: id, workspaceId: before.workspaceId, data: before.data })
    }
    // AND WHO CHANGES THE REST OF IT (assertMayChangeARun), worked out here and asked below of a write the record
    // door carries. A field one of the three guards above answered for this write is left to that guard, and to its
    // switch: with the served conditions' switch off, a caller it would refuse writes them, as it did before.
    const answeredAbove = new Set([
      ...(arrivesOnThePatch || arrivesOnTheReplace ? ['served'] : []),
      ...(sandboxOnThePatch || sandboxOnTheReplace ? ['sandbox'] : []),
      ...(endsIt ? ['state'] : []),
    ])
    changesTheRestOfARun = theDataFieldsAWriteChanges(storedData, patch).some((field) => !answeredAbove.has(field))
  }
  // A DRAFT'S SENT FIELDS, AND A SENT DRAFT, before anything reads the patch. See the function.
  refuseWhatOnlyTheSendDoorWrites(before, patch)
  // A TURN DRAFT'S FIELD, written by Mole Office alone (lib/turn-drafts.ts). A change to a turn draft is refused by
  // `assertMayWrite`, which every verb asks.
  if ((before.kind === DRAFT_KIND || patch.kind === DRAFT_KIND) && !theTurnDraftsAreWriting() && (isATurnDraft(patch.dataPatch) || isATurnDraft(patch.data))) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_A_TURN_DRAFT, 403)
  }
  // AN AGENT'S CHANGE TO A CARD'S WORDS STANDS ON A DECISION OF THE OWNER'S, unless it writes only short forms. See the
  // function. A kind change into this kind is asked by `assertMayWrite`, which the kind change asks of the new kind.
  if (before.kind === ROLE_CARD_WORDS_KIND && aPatchWritesMoreThanShortForms(before, patch)) {
    refuseACardWordsActOffTheOwnersDecision(actor, 'change', id)
  }
  // A REPORT'S ANSWERS, likewise. See the function. Asked again below of the data a kind change would store.
  refuseWhatOnlyTheAnswerDoorWrites(before, patch)
  // A RUN'S USE LINES, before anything reads the patch. See the function.
  refuseWhatOnlyTheUseDoorWrites(before, patch)
  // A RUN'S TWO SETTLEMENTS ON theCheck, likewise. See the function.
  refuseWhatOnlyTheSettlementDoorsWrite(before, patch)
  // A RUN'S THREE VERDICTS, likewise. See the function.
  refuseWhatOnlyTheVerdictDoorsWrite(before, patch)
  /**
   * WHETHER THIS WRITE IS THE RUN SAYING ITS WORK IS FINISHED, which is what seals it (below).
   *
   * A RUN THAT ALREADY SAID IT, AND NOW ONLY CLOSES ITSELF, IS NOT SAYING IT AGAIN.
   * `closedHow: agent-said` counts as a finish, because a run may end by closing
   * itself. But a run that already wrote `state: finished` and then closed itself was sealed twice:
   * the close minted a second seal and moved `sealedTip` to it. A run on 12 September 2026
   * was asked for its check at 18:03:24, the check was assembled against the seal at
   * 18:03:29, the run closed itself at 18:03:32, and the verdict was refused because the current seal
   * had changed to a different seal. A close adds nothing to the work, so it no longer seals a run that already
   * said it was finished. A write that says `state: finished` again still seals again, as before.
   */
  const { finishingBody, explicitlyFinishes, aVerdictClosedIt } = whetherThisWriteFinishesTheRun(before, patch)
  if (explicitlyFinishes && aVerdictClosedIt !== undefined) {
    const named = finishingBody?.['tip']
    const sealedOn = readRunSeal(id)?.seal.git?.commit
    if (typeof named === 'string' && named.trim() !== '' && !(sealedOn !== undefined && sealedOn.startsWith(named.trim()))) {
      throw new PanelError(
        `This write says run ${id} is finished on tip ${named.trim()}, which is not the commit it was sealed on` +
          `${sealedOn === undefined ? '' : ` (${sealedOn})`}, so nothing was written. ` +
          (aVerdictClosedIt === 'released'
            ? aReleasedRunGoesInUnderANewRun(id)
            : `Run ${id} was already confirmed, which closed it, so it takes no new seal. ${theBranchGoesInAgainUnderANewRun()}`),
        409,
      )
    }
  }
  const sealsTheRun = explicitlyFinishes && aVerdictClosedIt === undefined
  const kind = before.kind as RecordKind

  // WHAT THE REPORT ASKED FOR, TURNED INTO THE ONE FORM THAT IS STORED, BEFORE ANYTHING ELSE READS
  // IT. A composition may ask for its proportions as `60/40`, as `"60%"` on each part or as
  // `proportions: "3:2"` on the row, and all three are stored as whole-number shares with the
  // author's own spelling kept beside them. `canonicalise` in ./summary.ts is the whole of that
  // rule and this is one of the two doors it is called from; the other is `createRecord`.
  //
  // HERE, AT THE TOP, AND NOT BESIDE THE WRITE. Everything below reads `patch.data` — the guards,
  // the change rows, and the comparison that decides whether this patch changed anything at all —
  // and every one of them has to see the value that will be stored. Rewriting it later would leave
  // the change log describing an edit nobody made.
  //
  // BOTH BODIES, because `data` replaces the whole object and `dataPatch` merges into it, and a
  // composition can arrive through either. A `dataPatch` fragment is canonicalised as it stands:
  // the merge replaces arrays whole, so a fragment carrying blocks carries all of them.
  if (patch.data !== undefined) patch = { ...patch, data: canonicalise(kind, patch.data) as Record<string, unknown> }
  if (patch.dataPatch !== undefined) {
    patch = { ...patch, dataPatch: canonicalise(kind, patch.dataPatch) as Record<string, unknown> }
  }
  // AND A RUN'S AGENT BY ITS CANONICAL ID, in both bodies, unless the body sends back the id already stored.
  const storedServingAgentId = isJsonObject(before.data) ? before.data['servingAgentId'] : undefined
  if (patch.data !== undefined) patch = { ...patch, data: theRunsAgentByItsCanonicalId(kind, patch.data, storedServingAgentId) }
  if (patch.dataPatch !== undefined) patch = { ...patch, dataPatch: theRunsAgentByItsCanonicalId(kind, patch.dataPatch, storedServingAgentId) }

  // WHO MAY WRITE THIS KIND, asked through `assertMayWrite` and not restated here.
  //
  // This used to be its own copy of the rule — HUMAN_ONLY_KINDS and `actor.type !== 'human'`,
  // written out again — and the copy was half a rule short. `assertMayWrite` also refuses a request
  // that sent NO actor headers, which is owner decision §36: an absent header is not evidence that
  // a person made the write, and a governance act needs an explicit human. So a header-less request
  // was refused a decision by DELETE and allowed one by PATCH, and the restore route, which is an
  // ordinary patch underneath, inherited the hole. One rule written in two places, with one of them
  // missing half of it, is this codebase's recurring defect; there is now one place.
  // THE BODY GOES WITH THE QUESTION for a decision, and it is what the record WILL HOLD rather than
  // what was sent: a `dataPatch` that changes one word must be asked against the whole decision, or
  // an agent could take the authority off one by patching a different field. `mergeData` is the same
  // merge the write itself uses, called here only to ask the question.
  assertMayWrite(kind, 'change', actor, id, {
    data:
      kind === DECISION_KIND
        ? patch.data !== undefined
          ? patch.data
          : patch.dataPatch !== undefined
            ? mergeData(before.data ?? {}, patch.dataPatch).data
            : before.data
        : undefined,
    // THE TITLE IS PART OF A DECISION'S CORE, criterion P76, so the guard is told it. Undefined on
    // every other kind and on a patch that does not rename, which leaves the title alone.
    title: kind === DECISION_KIND ? patch.title : undefined,
  })
  // AND NOBODY MAY TYPE WHO WROTE THIS DECISION DOWN, on this door either. A rule enforced on one
  // write path is not a rule, and PATCH is the door that would let a second caller take the first
  // one's name off a decision that is already filed. Both bodies are read: `data` replaces the whole
  // object and `dataPatch` merges into it, and either can carry the key.
  assertNobodyTypesWhoRecordedIt(kind, patch.data ?? patch.dataPatch, id, before.data)
  // AND IS THIS FORK BEING PINNED OR UNPINNED. Both directions, on this door too, because a rule
  // enforced on one write path is not a rule.
  if (kind === PROPOSAL_KIND) {
    assertMayPinAFork({ data: patch.data ?? patch.dataPatch, stored: before.data, recordId: id }, actor)
    // AND IS THIS FORK BEING TAKEN OFF THE OWNER. Only here, and not on the create door: a fork
    // being filed has no stored classification to take off the owner. `replacesEverything` says which
    // body this is, because a `data` that leaves the field out deletes it and a `dataPatch` that
    // leaves it out does not.
    assertMayReclassifyAFork(
      {
        data: patch.data ?? patch.dataPatch,
        replacesEverything: patch.data !== undefined,
        stored: before.data,
        recordId: id,
      },
      actor,
    )
  }
  // AND WHETHER A FALLBACK IS RUNNING ON THIS STEP. Asked here, beside the kind guard and before
  // anything is written, because the refusal has to leave the record exactly as it was. It reads
  // BOTH `data` and `dataPatch`: `data` replaces the whole object, so a request that sent `data`
  // without a `method` key is not touching the canonical method and is not refused, and one that
  // names `data.method` is refused whichever door it came through.
  assertMayChangeACanonicalMethod(
    { id, kind: before.kind, title: before.title, workspaceId: before.workspaceId },
    (patch.data ?? patch.dataPatch) as Record<string, unknown> | undefined,
    actor,
  )
  if (patch.data !== undefined && patch.dataPatch !== undefined) {
    throw new PanelError(
      'Send data or dataPatch, not both. `data` replaces the whole object; `dataPatch` merges into it, ' +
        'key by key. With both, which one wins would be a coin toss, and a wrong record that looks filed ' +
        'is the failure this check exists to stop.',
    )
  }
  // A KIND CHANGE REWRITES `data` ITSELF, so a `data` or `dataPatch` beside it would be two writers
  // of one object in one write. The long reason is in the section above `moveWhatTheNewKindCannotHold`.
  if (patch.kind !== undefined && (patch.data !== undefined || patch.dataPatch !== undefined)) {
    throw new PanelError(
      `Send the new kind on its own, in its own write. Changing a kind rewrites \`data\` itself — every field ` +
        `a ${patch.kind} has no place for is kept under "extra" — so a ${patch.data !== undefined ? 'data' : 'dataPatch'} ` +
        `in the same request would be a second writer of the same object. The fields also mean different things ` +
        `under the two kinds: "state" alone has a different vocabulary on each kind that declares one, so Mole Office ` +
        `cannot tell whether what you sent was written for the ${kind} this is or the ${patch.kind} it is ` +
        `becoming. Nothing was written. Send {"kind":"${patch.kind}"} first — the reply names every field that ` +
        `moved and what the record still wants — and then send the data.`,
    )
  }

  // ---- THE COMPARE-AND-SET -------------------------------------------------------------------
  //
  // Asked FIRST, before anything else about the patch is considered. A caller whose copy is stale
  // is going to be refused whatever else is wrong with its request, and telling it about a misspelt
  // field it would then correct and resend — against a record that has moved again — is two round
  // trips to reach the same 409.
  //
  // The refusal is the gate `writes-from-a-stale-copy`. At off the write goes on, and the checks below see it as a
  // write that named a version.
  const version = versionOf(toRecord(before))
  if (patch.ifVersion !== undefined && patch.ifVersion !== version) {
    writtenFromAStaleCopy(new PanelError(
      `This record has changed since you read it, so nothing was written. You sent ifVersion ` +
        `"${patch.ifVersion}"; it is now "${version}". Read it again with GET /api/records/${id}, apply your ` +
        `change to what is there NOW, and send the version that read hands back. That is what the check is ` +
        `for: without it, a write built from a copy somebody else has already replaced is answered 200 and ` +
        `the other write is gone with nothing to say it ever happened.`,
      409,
    ))
  }

  // ---- WHAT KIND OF THING THIS IS --------------------------------------------------------------
  //
  // Worked out here: after the compare-and-set, because a caller holding a stale copy is refused
  // whatever else it asked for, and before anything is written, because every refusal below has to
  // leave the record exactly as it was. `kindChange` stays null when the patch named no kind, which
  // is what keeps the report off every reply that did not ask about it.
  const nextKind: RecordKind = patch.kind ?? kind
  let kindChange: KindChangeOutcome | null = null
  let dataForNewKind: Record<string, unknown> | null = null
  if (patch.kind !== undefined) {
    if (patch.kind === kind) {
      // THE SAME KIND IS A PLAIN ANSWER, NOT A REFUSAL. The caller asked for a state the record is
      // already in, so it got what it asked for; what would be wrong is writing a change row saying
      // a task became a task, and bumping `updatedAt` so the record climbs every list that orders
      // by it. Neither happens — see `nothingToWrite` below.
      kindChange = {
        from: kind,
        to: kind,
        changed: false,
        kept: [],
        broughtBack: [],
        note: plainKindChange(kind, kind, [], []),
        detail: describeKindChange(kind, kind, [], []),
      }
    } else {
      const asItStands = toRecord(before)
      refuseAKindThisRecordCannotBecome(asItStands, patch.kind, actor)
      const moved = moveWhatTheNewKindCannotHold(asItStands, patch.kind)
      // AND EVERY GUARD THAT PROTECTS THE KIND IT IS LEAVING, asked here because it needs the data
      // the record will hold and that object does not exist until the line above. Nothing has been
      // written at this point, which is what every refusal below depends on too.
      assertMayTakeARecordOutOfItsKind(asItStands, patch.kind, moved.data, actor)
      // THE RECORD IS VALID FOR ITS NEW KIND AFTER THIS WRITE, OR THIS WRITE DOES NOT HAPPEN.
      //
      // The two passes above move every field the new kind cannot hold ON ITS OWN. What is left for
      // this to catch is a cross-field rule — two fields that each fit and contradict one another
      // together, like a `retracted_because` on a claim nothing marks as retracted. Moving one of
      // the pair to satisfy it would be Mole Office choosing which of two things somebody wrote it
      // believes, so it throws instead, naming the fields, the rule and a value that would work.
      // Nothing has been written at this point.
      //
      // The list it returns is deliberately dropped: `incomplete` on the result describes the record
      // that ends up STORED and is recomputed from it below, by the one function every other reply
      // uses. Two answers to "what does this record still want" is one more than there should be.
      // A RECORD THAT BECOMES A MESSAGE IS KEPT IN THE MESSAGE CENTRE, and its mark says the project it was in, unless it
      // already holds one, as a comment turned into a note and back does. Without the mark it would
      // be in no project's view of the centre.
      if (patch.kind === 'message' && !Object.hasOwn(moved.data, 'writtenIn') && before.workspaceId !== MESSAGE_CENTRE) {
        moved.data['writtenIn'] = { project: before.workspaceId }
      }
      validateRecordData(patch.kind, moved.data)
      dataForNewKind = moved.data
      const drawing = drawingLeftBehind(asItStands, patch.kind)
      kindChange = {
        from: kind,
        to: patch.kind,
        changed: true,
        kept: moved.kept,
        broughtBack: moved.broughtBack,
        // THE DRAWING SENTENCE IS ON BOTH, worked out once. It names no path and no request, so it
        // is as much a person's sentence as an agent's.
        note: plainKindChange(kind, patch.kind, moved.kept, moved.broughtBack, drawing),
        detail: describeKindChange(kind, patch.kind, moved.kept, moved.broughtBack, drawing),
      }
    }
  }

  // A `data` THAT REPLACES THE WHOLE OBJECT MUST NOT BE ABLE TO ERASE WHO WROTE THE DECISION DOWN.
  // The caller cannot send `recorded_by` — the guard above refuses it — so on a full replace the key
  // would simply be gone, and a decision would quietly stop saying who typed it. The stored value is
  // carried across instead. It is the value Mole Office wrote when the record was filed, so this is the
  // field keeping itself rather than a second writer of it.
  if (kind === DECISION_KIND && patch.data !== undefined && isJsonObject(before.data)) {
    const wrote = before.data['recorded_by']
    if (typeof wrote === 'string' && isJsonObject(patch.data)) patch = { ...patch, data: { ...patch.data, recorded_by: wrote } }
  }
  // AND THE SAME FOR THE OWNER'S PIN, for the same reason and against a worse failure. An agent may
  // not write `pinned` — `assertMayPinAFork` refuses it — so a `data` that replaced the whole object
  // and simply left the key out would take the person's pin off without ever sending the field, which is the
  // guard being walked around rather than broken. The stored value is carried across.
  if (kind === PROPOSAL_KIND && patch.data !== undefined && isJsonObject(before.data)) {
    const pin = before.data['pinned']
    if (pin === true && isJsonObject(patch.data) && !Object.hasOwn(patch.data, 'pinned')) {
      patch = { ...patch, data: { ...patch.data, pinned: true } }
    }
  }

  // A changed body without new positions returns the quotes to the start. An explicit empty list
  // or null does the same, while an unchanged body keeps positions a replacement did not name.
  if (before.kind === 'message' && nextKind === 'message' && isJsonObject(before.data)) {
    const old = before.data as Record<string, unknown>
    if (patch.dataPatch !== undefined) {
      const dataPatch = patch.dataPatch
      const namesPositions = Object.hasOwn(dataPatch, 'quotePositions')
      const bodyChanged = Object.hasOwn(dataPatch, 'body') && !isDeepStrictEqual(dataPatch['body'], old['body'])
      if ((namesPositions && Array.isArray(dataPatch['quotePositions']) && dataPatch['quotePositions'].length === 0) || (!namesPositions && bodyChanged && Object.hasOwn(old, 'quotePositions'))) {
        patch = { ...patch, dataPatch: { ...dataPatch, quotePositions: null } }
      }
    } else if (patch.data !== undefined && isJsonObject(patch.data)) {
      const data = { ...patch.data }
      if (data['quotePositions'] === null || (Array.isArray(data['quotePositions']) && data['quotePositions'].length === 0)) {
        delete data['quotePositions']
      } else if (!Object.hasOwn(data, 'quotePositions') && isDeepStrictEqual(data['body'], old['body']) && Object.hasOwn(old, 'quotePositions')) {
        data['quotePositions'] = old['quotePositions']
      }
      patch = { ...patch, data }
    }
  }

  // WHO SENT A MESSAGE, AND THEN WHO MAY CHANGE ONE, both asked of the data this write would store before
  // anything reads the patch below. The sender first, so a write naming `sentBy` hears that sentence. When the
  // words change, the edit mark goes into the write itself, so the change rows, the revision and the stored
  // record all carry it. See the two functions.
  const wouldStore = {
    kind: nextKind,
    data: dataForNewKind ?? (patch.dataPatch !== undefined ? mergeData(before.data ?? {}, patch.dataPatch).data : (patch.data ?? before.data)),
  }
  // WHOM A FLOW IS FOR and ITS RETIRED MARK, against what the flow held, before the shape is checked.
  if (nextKind === 'flow') {
    checkWhomTheFlowIsFor(wouldStore.data, before.kind === 'flow' ? before.data : null)
    checkTheRetiredMark(wouldStore.data, before.kind === 'flow' ? before.data : null)
  }
  // A RUN THIS WRITE MAKES NAME A CONVERSATION it did not name before is asked as the create door asks a new run, so a run
  // filed with none cannot be given another agent's afterwards. See the function.
  if (nextKind === 'session' && isJsonObject(wouldStore.data)) {
    const named = before.kind === 'session' && isJsonObject(before.data) ? theConversationsARunNames(before.data as Record<string, unknown>) : []
    const added = theConversationsARunNames(wouldStore.data as Record<string, unknown>).filter((one) => !named.includes(one))
    assertARunCarriesNoOtherAgentsConversation(actor, added, id)
  }
  refuseASenderThisWriteWouldChange(before, patch, wouldStore, actor)
  refuseAnIntentMarkThisWriteWouldChange(before, patch, wouldStore)
  refuseAChangeOfWordsThatBreaksAPart(before, wouldStore)
  refuseAFoldThisWriteWouldMake(before, patch, wouldStore)
  // AND NOBODY BUT THE PERSON CHANGES THE WORDS OF A NOTE THE PERSON WROTE, asked of the same data, before anything is
  // written: a decision in the person's name may cite that note as their own words.
  refuseAChangeToTheWordsOfThePersonsNote(before, wouldStore, actor)
  // AND NOBODY BUT THE PERSON WRITES OR TAKES OFF THE MARK THAT A NOTE IS NOT WHAT THEY SAID, asked of the same data.
  if (before.kind === 'note' || nextKind === 'note') refuseAnAgentsMarkThatTheWordsAreNotThePersons(before, wouldStore, actor)
  const editMark = whatAChangeToAMessageMustCarry(before, patch, wouldStore, actor)
  if (nextKind === 'message' && isJsonObject(wouldStore.data)) {
    const data = wouldStore.data as Record<string, unknown>
    const body = typeof data['body'] === 'string' ? data['body'] : ''
    const quotes = Array.isArray(data['quotes']) ? data['quotes'] : null
    const reason = whyQuotePositionsAreInvalid(body, quotes, data['quotePositions'], data['target'])
    if (reason !== null) throw new PanelError(reason, 400, undefined, undefined, undefined, { code: MESSAGE_QUOTE_POSITIONS_INVALID, values: {} })
  }
  // WHERE A KIND CHANGE ACROSS THE MESSAGE CENTRE FILES THE RECORD, asked before anything is written, so a record with no
  // project to go to is refused and left as it was. Null when the record stays where it is. See lib/move.ts.
  const filing = kindChange?.changed === true ? whereAKindChangeFilesARecord(before, nextKind) : null
  // AND A FILE THIS WRITE GIVES A MESSAGE IS ONE THE FILE DOOR WILL SERVE, as on the send, in the project the message is kept in.
  // A record that becomes a message may bring pictures back from `extra`. A file the message already carried is not asked again.
  if (nextKind === 'message') refuseAFileTheDoorWouldNotServe(wouldStore.data, filing ?? before.workspaceId, before.kind === 'message' ? before.data : undefined)
  if (editMark !== null) {
    patch =
      patch.data !== undefined
        ? { ...patch, data: { ...patch.data, edited: editMark } }
        : { ...patch, dataPatch: { ...(patch.dataPatch ?? {}), edited: editMark } }
  }

  const merged = patch.dataPatch === undefined ? null : mergeData(before.data ?? {}, patch.dataPatch)

  // A kind change may move a field into or out of extra. Ask about the data that will be stored.
  const dataToStore = dataForNewKind ?? merged?.data ?? patch.data ?? before.data
  // THE HARD GATE BEFORE THE SEAL (see lib/before-the-seal.ts): a migration item the seal's
  // own check still finds on the branch refuses a git seal whoever sends it, at every position, before anything of this
  // write is stored. It is asked of the data this write would store, so a patch that names a working directory is judged
  // on the one it names, and it stands exactly where the seal itself stands
  // (`nextKind === 'session' && sealsTheRun && runSubmitsWork`). A fault of form is listed by the reminder and never
  // refused here. A records or files submission seals no branch, so it is not judged for a migration item.
  if (nextKind === 'session' && sealsTheRun && isJsonObject(dataToStore) && runSubmitsWork(id, dataToStore)) {
    refuseTheSealOverAFault({ ...toRecord(before as typeof records.$inferSelect), data: dataToStore })
  }
  // Every record path that retires an agent asks the row's retire rule before anything is written.
  if (before.kind === AGENT_KIND && nextKind === AGENT_KIND && theRetireDoorIsOpen === 0) {
    const storedState = isJsonObject(before.data) ? before.data['state'] : undefined
    const nextState = isJsonObject(dataToStore) ? dataToStore['state'] : undefined
    if (storedState !== 'retired' && nextState === 'retired') {
      const row = agentForRecord(id)
      if (row !== null) whyThisIsNotYoursToRetire(row, actor)
    }
  }
  refuseWhatOnlyTheSettlementDoorsWrite(before, { kind: nextKind, data: dataToStore as Record<string, unknown> })
  refuseWhatOnlyTheVerdictDoorsWrite(before, { kind: nextKind, data: dataToStore as Record<string, unknown> })
  refuseWhatOnlyTheAnswerDoorWrites(before, { kind: nextKind, data: dataToStore as Record<string, unknown> })
  const officeField = anOfficeOnlyFieldAWholeDataWouldMove(before.data as Record<string, unknown>, dataToStore as Record<string, unknown>)
  if (officeField !== null) throw new PanelError(officeField.refusal, 403)
  const heldByItsFiler = whyThisWriteMayNotMoveHeldByItsFiler(nextKind, before.data as Record<string, unknown>, dataToStore as Record<string, unknown>, actor)
  if (heldByItsFiler !== null) throw new PanelError(heldByItsFiler, 403)

  // ---- WHAT THIS WRITE WOULD DO TO THE SHELF --------------------------------------------------
  //
  // Setting `shelved`, changing it, or clearing it is the person's act, so it is asked of what the
  // record WILL HOLD rather than of the keys the caller sent: a `data` that replaces the whole object
  // and leaves `shelved` out is a clearing, and a guard reading only the patch keys would walk past
  // it. `dataForNewKind` carries the moved object when this same write changes the kind, so a kind
  // change that arrives on the shelf is judged on the object that will actually be stored.
  if (nextKind === 'direction') {
    const willHold =
      dataForNewKind !== null
        ? dataForNewKind
        : merged !== null
          ? merged.data
          : patch.data !== undefined
            ? patch.data
            : before.data
    assertMayShelve({ id, title: patch.title ?? before.title }, before.data, willHold, actor)
  }

  // ---- WHAT THIS WRITE WOULD DO TO AN INTENDED FUTURE -----------------------------------------
  //
  // HERE, AND NOT NINETY LINES UP AT `assertMayWrite`. `assertMayWrite` is the KIND-level rule and
  // needs no merged record; these six acts are about what the record WILL HOLD, and the merged
  // value does not exist until the line above. Asked of the patch keys instead, a wholesale
  // `{"data":{...}}` would walk straight past every one of them.
  //
  // It also catches put-back for free: `restoreRevision` is a patch underneath, so a version put
  // back that reintroduces a `paused` block, or drops a state out of the order, arrives here.
  if ((INTENDED_KINDS as readonly string[]).includes(kind)) {
    const willHold = merged !== null ? merged.data : patch.data !== undefined ? patch.data : before.data
    for (const act of futureActsIn({ id, kind, data: before.data }, { title: patch.title, data: willHold }, before.title)) {
      assertMayShapeTheFuture({ id, kind, title: before.title }, act, actor)
    }
  }

  // ---- the two rules a block adds to this path -----------------------------------------------
  //
  // Both are here rather than in the shape checker because both need other rows, and shared/kinds.ts
  // runs in the browser with no database.

  // A BLOCK'S TITLE IS ITS OWN NAME, and a rename is an ordinary title patch. This door used to refuse every block title that was not
  // `<its pipeline's title> › <its own name>`, and since the corpus was renamed away from that shape
  // on 26 August 2026 it refused EVERY block there was.
  //
  // WHAT IS STILL REFUSED IS THE ONE THING THE PREFIX WAS BUYING: two live blocks of one pipeline
  // reading as the same name in one ordered list. Asked of every pipeline that lists this block,
  // because several may.
  //
  // ASKED ABOUT THE KIND THE RECORD WILL HAVE, not the one it has. A block whose kind is changing in
  // this same write is not a block afterwards, so the rule does not apply to it. When no kind is
  // sent the two are the same word and nothing changes.
  if (nextKind === BLOCK_KIND && patch.title !== undefined && patch.title !== before.title) {
    for (const holder of pipelinesHolding(id)) {
      const twins = blockIdsOf(holder)
        .filter((other) => other !== id)
        .map((other) => db.select().from(records).where(eq(records.id, other)).get())
        .filter((row): row is NonNullable<typeof row> => row !== undefined && row.deletedAt === null)
        .filter((row) => row.kind === BLOCK_KIND && row.title === patch.title)
      if (twins.length > 0) {
        throw new PanelError(
          `"${holder.title}" already has ${twins.length === 1 ? 'a live block' : `${twins.length} live blocks`} ` +
            `called ${JSON.stringify(patch.title)} (${twins.map((t) => t.id).join('; ')}), and this block is in ` +
            `that pipeline too. ${WHY_A_BLOCK_NAME_MAY_NOT_REPEAT}. Nothing has been changed. Pick another name, ` +
            `or rename that block first with PATCH /api/records/${holder.id}/blocks/${twins[0]?.id ?? ''} ` +
            `{"name":"…"}.`,
        )
      }
    }
  }

  // ---- A CHECKLIST LINE IS NOT REMOVED BY A WRITE THAT NEVER SAW IT ---------------------------
  //
  // THE SAME RULE `PUT /api/records/:id/blocks` ALREADY APPLIES TO THE OTHER ORDERED LIST, in the
  // same server, in the words it is refused with there: "a caller that has not seen a block
  // somebody added a minute ago would otherwise remove it by saying nothing about it and be
  // answered 200." That is a word-for-word description of what happened to `data.parts` on the
  // night this was found — one agent's three checklist lines replaced by another agent's four,
  // zero ids surviving, answered 200 — because the rule had been written for blocks only.
  //
  // The escape is the compare-and-set, not a flag. Removing a line is a normal edit and must stay
  // possible; what a caller has to do is prove it saw the lines it is removing, which is exactly
  // what `ifVersion` proves. So a deliberate deletion costs one extra field, and a stale write
  // cannot pay it, because the version it holds is the version of the copy it read.
  //
  // Checked against the value that will be STORED, whichever way it arrived, so the merge path
  // cannot get past a check the wholesale path applies.
  if (kind === 'module' && patch.ifVersion === undefined) {
    const nextData = merged !== null ? merged.data : patch.data
    if (nextData !== undefined) {
      // LINES KEYED BY PART, AND THE PARTS THEMSELVES, so a line moved between parts, a part
      // renamed, a part dropped and two parts sharing one item id are all things this can see. The
      // first version keyed by item id alone and an agent found four ways through it in one
      // afternoon — `checklistLines` names each.
      const arriving = new Map([...checklistParts(nextData), ...checklistLines(nextData)])
      const stored = new Map([...checklistParts(before.data), ...checklistLines(before.data)])
      const surviving = new Set(arriving.keys())
      const dropped = [...stored.keys()].filter((itemId) => !surviving.has(itemId))

      // A LINE THAT SURVIVES BY ID AND NOT BY CONTENT. Same refusal, same reason, different event:
      // the write says nothing about what it read, and Mole Office cannot tell somebody changing a line
      // on purpose from somebody handing back a copy taken before that line was written. Reported
      // BEFORE the drop check only in the sense that both are computed here; a write that does both
      // is refused by whichever fires, and either sentence names the same way out.
      const rewritten: { id: string; keys: string[] }[] = []
      for (const [itemId, item] of arriving) {
        const was = stored.get(itemId)
        if (was === undefined) continue // an addition loses nothing
        const keys = rewrittenKeys(was, item)
        if (keys.length > 0) rewritten.push({ id: itemId, keys })
      }
      // THE GATE `writes-over-unseen-checklist-lines`, read once and only when the write would lose a line. At off
      // the write goes on, and a write that both drops and rewrites is counted once.
      const position = dropped.length > 0 || rewritten.length > 0 ? gatePosition('writes-over-unseen-checklist-lines') : null
      const met = () => gateMet('writes-over-unseen-checklist-lines', position!)
      if (position === 'block' && dropped.length === 0 && rewritten.length > 0) {
        const shown = rewritten.slice(0, 20)
        const tail = rewritten.length > shown.length ? `, and ${rewritten.length - shown.length} more` : ''
        const named = shown.map((r) => `${readKey(r.id)} (${r.keys.join(', ')})`).join(', ')
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(
          `This write rewrites ${rewritten.length} checklist ${rewritten.length === 1 ? 'line' : 'lines'} that ` +
            `${rewritten.length === 1 ? 'is' : 'are'} stored right now — ${named}${tail} — and it does not say ` +
            `which version of the checklist it was written against, so Mole Office cannot tell a deliberate change ` +
            `from a copy that was read before somebody else wrote ${rewritten.length === 1 ? 'that line' : 'those lines'}. ` +
            `Nothing was written. To change ONE line, send PATCH /api/records/${id}/checklist/<the item id> ` +
            `{"state":"…"} — it carries that line's own keys, so it cannot revert a line you have not read. To ` +
            `write the array on purpose, read the record (GET /api/records/${id}), apply your change to what is ` +
            `there now, and send the same patch with {"ifVersion":"${version}"} — which is refused in turn if ` +
            `anybody writes in between.`,
        ), met)
      }

      if (position === 'block' && dropped.length > 0) {
        const shown = dropped.slice(0, 20)
        const tail = dropped.length > shown.length ? `, and ${dropped.length - shown.length} more` : ''
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(
          `This write drops ${dropped.length} checklist ${dropped.length === 1 ? 'line' : 'lines'} that ` +
            `${dropped.length === 1 ? 'is' : 'are'} stored right now — ${shown.map(readKey).join(', ')}${tail} — ` +
            `and it does not say which version of the checklist it was written against, so Mole Office cannot tell a ` +
            `deliberate removal from a copy that was read before somebody else added ${dropped.length === 1 ? 'it' : 'them'}. ` +
            `Nothing was written. To ADD a line, send POST /api/records/${id}/checklist ` +
            `{"partId":"<which part>","id":"<a new id>","text":"…","state":"todo"} — it carries one line, so it ` +
            `cannot overwrite lines you have not read. To REMOVE ${dropped.length === 1 ? 'that line' : 'those lines'} ` +
            `on purpose, read the record (GET /api/records/${id}), apply your change to what is there now, and send ` +
            `the same patch with {"ifVersion":"${version}"} — which is refused in turn if anybody writes in between.`,
        ), met)
      }
      if (position !== null) met()
    }
  }

  // ---- WHAT SOMEBODY WROTE IS THEIRS, AND IS NOT REWRITTEN AFTER ANYBODY HAS READ IT -----------
  //
  // An annotation's `body` is what the person wrote and its `context` is what they were pointing at.
  // THE PERSON WHO WROTE IT may change either, or delete the whole thing, while it is `queued` and
  // no review has written it down — because nothing has been said to anybody yet. NOBODY ELSE may
  // change either of them, ever. Once it is `sent`, or once a review has finished collecting with it
  // in that review, they are fixed for the writer too, and a correction is a NEW annotation with a
  // `supersedes` link to this one. The three rules are written out where they are applied, a few
  // dozen lines below, under "WHAT IS THE PERSON'S OWN".
  //
  // WHY THE ANCHOR IS FIXED TOO, AND NOT ONLY THE WORDS. It used to be only the words, and an agent
  // could therefore replace the block a person's sent note pointed at, the quote stored on it and
  // the offsets, with a 200. The reading then said "Still there, in the same place" about the new
  // words and presented the agent's anchor as the person's. A comment is a pair — some words, and
  // what they are about — and half a pair rewritten is the whole thing rewritten. src/shared/
  // targets.ts already says the quote is the evidence and that offsets are never repaired.
  //
  // WHY IT IS A REFUSAL AND NOT A CONVENTION. A thread of review that can be edited after it went
  // out is a thread nobody can cite: the agent answered the question as it was asked, and a question
  // that changes afterwards leaves an answer to something nobody can read. The same rule already
  // governs a comment to an agent — `refuseIfSent` in lib/agents.ts — and this is that rule reaching
  // the kind that outlives the conversation.
  //
  // AN ABSENT VALUE IS A CHANGE. The comparison used to fire only when a body ARRIVED and differed,
  // so `{"dataPatch":{"body":null}}` and a wholesale `data` that left `body` out both walked past it
  // and DELETED the words with a 200 — while an honest correction was refused 409. What is compared
  // now is the value that will be STORED against the value that is stored, and a key that is about
  // to go missing differs from one that is there.
  //
  // THE REST OF THE NOTE STILL MOVES. Marking one `answered` is exactly what is supposed to happen
  // to a sent note, and so is adding an interpretation beside the words.
  //
  // A WRITE THAT PUTS THE NOTE BACK WHERE THE WORDS MAY CHANGE IS THE SAME REWRITE, IN TWO STEPS.
  //
  // The refusal below asks what state the note is in RIGHT NOW, so a caller that moved the state
  // first and the words second walked straight past it. Measured on 19 August 2026, three writes and
  // three 200s: `{"dataPatch":{"state":"queued"}}`, then `{"dataPatch":{"body":"REWRITTEN BY AN
  // AGENT"}}`, then `{"dataPatch":{"state":"sent"}}`. The note then read
  // `{"body":"REWRITTEN BY AN AGENT","state":"sent"}`, and a frozen review, which stores ids and
  // re-reads the words, served the new ones under a sentence saying nothing about it could change.
  //
  // CHANGING THE KIND IS THE SAME DOOR. `{"kind":"note"}`, then the body, then `{"kind":"annotation"}`
  // — also three 200s, also measured, with the same words at the end. As a note this rule does not
  // apply, so the body is ordinary text; the kind change carries `state` and `context` into "extra"
  // and brings them home again untouched.
  //
  // SO BOTH DIRECTIONS OUT OF "GONE" ARE SHUT, AND IT IS ONE RULE: a note that has gone to somebody
  // never goes back to waiting, and never stops being a note somebody left on something. Somebody
  // read those words; no later write makes that not have happened. Marking one answered is still
  // exactly what is meant to happen to it, and everything else about it still moves.
  //
  // WHETHER SOMEBODY HAS BEEN GIVEN THESE WORDS, asked of the one store.
  //
  // IT IS NOT READ OFF THE RECORD ANY MORE. The block above `goneOut`'s import says what that field
  // was and why it could be wrong in both directions. The question is asked only about a record
  // that IS a comment, because for anything else there are no words of somebody's to fix.
  const wentOut = kind === 'annotation' && goneOut(id, before.workspaceId)

  if (wentOut && nextKind !== 'annotation') {
    throw new PanelError(
      `This comment has already gone to somebody, so its kind cannot be changed and nothing was written. ` +
        `The words in it and what they point at are fixed once somebody has read them, and Mole Office can only hold ` +
        `them fixed while this record is a note somebody left on something: as a ${nextKind} the same words are ` +
        `ordinary text that any write may replace. File a NEW record saying what you mean now, and link it with ` +
        `POST /api/links {"fromId":"<the new one>","toId":"${id}","type":"supersedes"} — then both are readable ` +
        `and neither was rewritten.`,
      409,
    )
  }

  // ASKED ABOUT THE KIND THE RECORD IS OR IS BECOMING, and the OR is a repair.
  //
  // It used to ask only about the kind it was BECOMING, and the three refusals inside are about
  // what the record IS. So a comment being turned into a `note` in the same write that rewrote its
  // words walked past all three: the words-are-fixed gate, the frozen-review gate and the
  // authorship gate. Two of those had never been reachable from the other direction at all —
  // whoever wrote the comment, and whether a finished review had written it down, are facts about
  // the record in front of you and have nothing to do with what it is turning into.
  //
  // `nextKind === 'annotation'` is kept beside it because a record TURNING INTO a comment stores a
  // `context` this never saw when the question was about the kind it used to be.
  //
  // A kind may not be sent beside `data` or `dataPatch`, so at most one of the three values below
  // is ever defined.
  if (kind === 'annotation' || nextKind === 'annotation') {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined && isJsonObject(nextData)) {
      const stored: Record<string, unknown> = isJsonObject(before.data) ? before.data : {}
      // THE SECOND GATE IS GONE, AND ITS DISAPPEARING IS THE POINT OF THE CHANGE.
      //
      // It refused a write that put `data.state` back to `queued`, because that would have re-opened
      // the words: the walk-around this file records — `state->queued`, `body->REWRITTEN BY AN
      // AGENT`, `state->sent`, three writes and three 200s — went through that door. There is
      // nothing to put back now. The gate below asks whether a message carrying these words has gone
      // out, and no write to this record can change that answer. The two-step walk-around is closed
      // by construction rather than by a rule that had to think of it.
      //
      // The field itself is still declared, still optional and still readable; window B deletes it.
      // Nothing decides anything from it, so a caller that writes it changes nothing that matters.
      //
      // WHAT IS THE PERSON'S OWN: what they wrote, and what they were pointing at.
      //
      // ---------------------------------------------------------------------------------------
      // THREE THINGS FIX THESE TWO FIELDS, AND ONLY THE FIRST OF THEM USED TO
      // ---------------------------------------------------------------------------------------
      //
      // 1. IT HAS GONE OUT. Somebody has read the words, so no later write may change what they
      //    read. That is the rule this block was written for.
      //
      // 2. A REVIEW HAS WRITTEN IT DOWN. Freezing a review says what the review contained. A frozen
      //    review stores ids and re-reads the words, so words that can still change make the
      //    membership a list of ids whose meaning anybody can rewrite afterwards. See
      //    `frozenReviewsHolding`, which has the measurement.
      //
      // 3. SOMEBODY ELSE WROTE IT. This is the one that was missing altogether, and it is the
      //    widest. The gate asked only what state the note was in. A note is `queued` for most of
      //    its life, including the whole of the time it sits in a review nobody has sent, and while
      //    it was `queued` ANYBODY could rewrite or wholly replace another person's words. Measured
      //    on 19 August 2026 on an isolated copy: an agent replaced a comment written by
      //    the person and Mole Office answered 200 and served the agent's sentence as the person's.
      //
      // WHY AUTHORSHIP IS A RULE AND NOT A CONVENTION. Everything downstream of a comment is an
      // answer to it: a reading stored beside it, a review that collected it, an agent's reply, a
      // task somebody filed because of it. All of those are evidence about words that a person
      // chose. If any other writer may replace those words in place, then none of that evidence is
      // about anything in particular — the question can be swapped after the answer. GET /api/kinds
      // has always said `body` is "WHAT THE PERSON WROTE, KEPT EXACTLY", and qualified it with "the
      // writer may change it": the word *writer* is what this check finally enforces.
      //
      // IT IS NARROW ON PURPOSE, AND IT IS NOT A PERMISSION SYSTEM. It fixes two fields of one kind.
      // Marking a note sent or answered, storing a reading beside it, linking it, retitling it,
      // moving it, deleting it — every one of those still works for anybody, exactly as before. The
      // only thing nobody else may do is put different words in somebody's mouth.
      //
      // WHO WROTE IT IS THE LEDGER'S ANSWER. `whoWroteRecord` reads the actor on the record's first
      // revision. There is no `author` field, and there must not be one: a stored author beside a
      // ledger that already knows is one fact in two places, free to disagree, which is the defect
      // this repository keeps finding.
      const fixedFields = ['body', 'context'] as const
      // `fieldsThatDiffer` and not `JSON.stringify`, because it walks two objects key by key: a
      // caller that reads a note and writes it back with its `context` keys in another order has
      // changed nothing, and refusing that would be a false refusal with a long lecture attached.
      //
      // WHAT TO CALL EACH ONE IS A TOTAL MAP over the same list, so a third fixed field cannot be
      // added without a name for it: the sentence would not compile.
      const named: Record<(typeof fixedFields)[number], string> = {
        body: 'the words in it',
        context: 'what it points at',
      }
      //
      // AND A CONTEXT IS COMPARED IN THE SHAPE IT WOULD BE STORED IN, for exactly the reason above.
      // A stored context carries the words somebody was on inside its `place`; a caller may send
      // the same words as a bare `span`, which is the older of the two fields and still legal at
      // the door. Compared raw, that reads as MOVING THE COMMENT ONTO DIFFERENT WORDS and a sent
      // note is refused with 409 — a caller told it rewrote somebody's evidence when it sent back
      // the same four values.
      //
      // IT IS THE WHOLE OF THAT SHAPE AND NOT HALF OF IT. This ran `withThePlaceItNames` alone,
      // which is one of the three rules `contextAsStored` applies; the other two are what a thing
      // named by where it sits was holding, and the one name a part of a report is stored under.
      // A caller sending `{kind:'reportBlock', blockId:'b-1'}` — which is what the browser puts on
      // a block's element — was told it had moved somebody's sent note off block b-1, onto block
      // b-1. Running the same completion on both sides is what makes this comparison about the
      // anchor rather than about which of two names for one thing the caller used.
      const anchorAsStored = (key: (typeof fixedFields)[number], value: unknown): unknown =>
        key === 'context' && isJsonObject(value) ? contextAsItWouldBeStored(value as unknown as Context) : value
      const rewritten = fixedFields.filter(
        (key) => fieldsThatDiffer(stored[key], anchorAsStored(key, nextData[key])).length > 0,
      )
      const what = rewritten.map((key) => named[key]).join(' and ')
      if (rewritten.length > 0 && wentOut) {
        throw new PanelError(
          `This comment has already gone to somebody, so ${what} cannot be changed and nothing was ` +
            `written. What somebody wrote and sent is the record of what they said, and the words it quoted are ` +
            `the evidence of what they said it about. Rewriting either would leave every answer to it about a ` +
            `question nobody can read any more. Write a NEW note saying what you mean now, and link it with ` +
            `POST /api/links ` +
            `{"fromId":"<the new one>","toId":"${id}","type":"supersedes"} — then both are readable and neither was ` +
            `rewritten. Everything else about this note can still change: marking it answered is exactly what is ` +
            `meant to happen to one that has gone out.`,
          409,
        )
      }
      if (rewritten.length > 0) {
        const inReviews = frozenReviewsHolding(id, before.workspaceId)
        if (inReviews.length > 0) {
          const which =
            inReviews.length === 1
              ? `Review ${inReviews[0] ?? ''} has`
              : `${inReviews.length} reviews — ${inReviews.join(', ')} — have`
          throw new PanelError(
            `${which} finished collecting with this note in ${inReviews.length === 1 ? 'it' : 'them'}, so ${what} ` +
              `cannot be changed and nothing was written. Finishing collecting writes down what a review ` +
              `contained; the review stores this note's id and reads the words back on every request, so words ` +
              `that could still change would let somebody alter what a finished review says after it finished. ` +
              `Write a NEW note saying what you mean now, and link it with POST /api/links ` +
              `{"fromId":"<the new one>","toId":"${id}","type":"supersedes"} — then both are readable, and this one ` +
              `still says what it said. A review takes in only notes written while it is collecting, by whoever ` +
              `started it, about what it covers, so no review that has already finished will take in the new note. ` +
              `Marking this note sent or answered, and storing a reading beside it, all still work.`,
            409,
          )
        }
        const author = whoWroteRecord(id)
        const asking = `${actor.type}:${actor.id}`
        if (author === null) {
          throw new PanelError(
            `Nothing recorded who wrote this note, so Mole Office cannot say that you are them, and ${what} cannot be ` +
              `changed. Nothing was written. Only the person who wrote a note may change its words or what they ` +
              `point at. Write a NEW note saying what you mean now, and link it with POST /api/links ` +
              `{"fromId":"<the new one>","toId":"${id}","type":"supersedes"}.`,
            403,
          )
        }
        // WHO WROTE IT IS RESOLVED, NOT COMPARED AS CHARACTERS. `whoWroteRecord` hands back the
        // stamp the ledger holds, which is a NAME the headers gave and not a resolved id — so an
        // agent that wrote under its handle and comes back under its minted id is still the writer,
        // and a new agent that took a retired agent's freed name is not. `sameAgent` above is that
        // reading and the reason it exists.
        const wrote = theTwoHalvesOfAStamp(author)
        if (!sameAgent(wrote, actor)) {
          throw new PanelError(
            // AND THE WRITER IS NAMED RATHER THAN PRINTED. Chapter 10 rule 1: after the mint the
            // stored string is a nanoid of 12, which names nobody to the person reading this.
            `${theWriterAStampNames(author)} wrote this note, and you are ${asking}, so ${what} cannot be changed and nothing was ` +
              `written. What somebody wrote is theirs: Mole Office keeps it exactly, and every answer to it — a ` +
              `reading stored beside it, a review that collected it, an agent's reply — is an answer to those ` +
              `words and to no others. Write a NEW note saying what you mean now, and link it with ` +
              `POST /api/links {"fromId":"<the new one>","toId":"${id}","type":"supersedes"} — then both are ` +
              `readable and neither was rewritten. Everything else about this note still works for you: marking ` +
              `it sent or answered, storing a reading beside it, linking it, and retitling it.`,
            403,
          )
        }
      }
      // AND WHAT IT POINTS AT IS CHECKED WHEN THIS WRITE CHANGES IT, on this path as well as on
      // create, against the value that will be STORED so a merge patch cannot get past a check the
      // wholesale path applies.
      //
      // WHEN THIS WRITE CHANGES IT, AND ONLY THEN. It used to re-check the STORED context on every
      // patch that touched `data`, which froze a note the moment the thing it pointed at was edited
      // or deleted: no state could be set on it again, so it could never be marked sent, answered or
      // given an interpretation. A note whose target moved is exactly the note somebody needs to act
      // on. What happens to a target afterwards is `readContext`'s business — it says so honestly —
      // and lib/targets.ts's own header says this check has no view on it. A comment to an agent
      // already works this way: `checkContext` there runs when the caller SENDS a context.
      if (fieldsThatDiffer(stored['context'], nextData['context']).length > 0) {
        // The writer, for the one field refused by writer rather than by shape — see the create path.
        checkAnnotationContext(nextData, before.workspaceId, actor.type)
      }
    }
  }

  // AND WHAT A MESSAGE QUOTES IS CHECKED WHEN THIS WRITE CHANGES IT, on this path as well as on
  // create, against the value that will be stored, for the reason the annotation's check above
  // gives. A write that adds `quotes` to a message holding `target`, or the other way round, is
  // refused here as it is on create.
  //
  // AND SO ARE ITS TARGET AND ITS LEAD, with the same two checks a create runs.
  // A message's own writer may not change either (`whatAChangeToAMessageMustCarry` refuses it), so what
  // reaches these is a record BECOMING a message: a lead or target it kept in `extra` comes back as the
  // message's own, and a note naming a record nobody holds would otherwise become an offer to go there.
  if (kind === 'message' || nextKind === 'message') {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined && isJsonObject(nextData)) {
      const stored: Record<string, unknown> = isJsonObject(before.data) ? before.data : {}
      const targetChanged = fieldsThatDiffer(stored['target'], nextData['target']).length > 0
      const leadChanged = fieldsThatDiffer(stored['lead'], nextData['lead']).length > 0
      if (targetChanged || fieldsThatDiffer(stored['quotes'], nextData['quotes']).length > 0) {
        checkMessageQuotes(nextData, before.workspaceId, actor.type, theMessageReader(actor))
      }
      if (targetChanged) checkMessageTarget(nextData, before.workspaceId, actor.type, theMessageReader(actor))
      if (leadChanged) checkMessageLead(nextData, before.workspaceId, actor.type, theMessageReader(actor))
    }
  }

  // AND A RENAMED AGENT DOES NOT TAKE A HANDLE SOMEBODY ELSE HOLDS. On this path as well as on the
  // create, because a rule enforced on one write path is not a rule. The record being patched is
  // excluded, so a write that leaves the handle alone is not refused for colliding with itself —
  // and the OLD handle goes on resolving, which is what stops a rename stranding anybody's mail.
  //
  // ASKED OF THE RECORD AS IT WILL BE, so a change of kind INTO an agent meets every check below. It
  // used to be asked only when the record was already an agent, so a note carrying a card or broadcast
  // times in `extra` became an agent with both and no check ran.
  if (nextKind === AGENT_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    // WHAT AN AGENT ALREADY HELD, against which "a write that leaves it alone" is measured. Only a record
    // that was an agent's own before this write held anything an agent holds. See the function.
    const heldByTheAgent = whatTheAgentHeldBefore(id, kind, before.data)
    if (nextData !== undefined) {
      checkAgentHandle(nextData, before.workspaceId, id)
      checkAgentNotes(nextData)
      checkAgentStartFolder(nextData)
      // Retirement ends the agent’s powers and keeps its history, including a card that has
      // since gone. Requiring that unchanged card to exist would block the person's mail-tool move
      // after the mailer was removed.
      // Changing a card or making the record live still asks the ordinary role check.
      const keepsTheRetiredCard = isJsonObject(nextData) && nextData['state'] === 'retired' &&
        isJsonObject(heldByTheAgent) && nextData['role'] === heldByTheAgent['role']
      if (!keepsTheRetiredCard) checkAgentRole(nextData)
      checkNobodyIsWritingTheirOwnCredential(nextData, heldByTheAgent)
      // AND WHO IS ALLOWED TO CHANGE A START FOLDER. The owner, the agent's starter or a secretary, through the door that
      // does it, and never the agent itself. `nextData` is what would be stored, so a dataPatch and a
      // whole-object write are asked the same question, and a write that leaves the folder alone is
      // not a change.
      checkNobodyIsChangingAStartFolder(nextData, heldByTheAgent, actor)
      // AND WHO IS ALLOWED TO CHANGE THE CARD OR THE GRANT. `nextData` is what
      // would be stored — the merge for a dataPatch, the whole object for a data — so both bodies
      // are asked the same question, and a write that leaves the two fields as they are is not one.
      checkNobodyIsWritingTheirOwnCard(nextData, heldByTheAgent, actor)
      // AND ONLY THEIR DOOR CHANGES A SECRETARY'S BROADCAST TIMES. Ordinary patches must not bypass the broadcast-times door,
      // just as they must not bypass the role-card door.
      checkNobodyIsChangingBroadcastTimes(nextData, heldByTheAgent, actor)
    }
    // AND NO RECORD WRITE MOVES A STARTER. Asked of the data the registry will read after this write, which is the stored
    // data when the write sends none, so a record holding a starter its row does not is asked even by a write of its title.
    checkNobodyIsMovingAStarter(nextData ?? before.data, before.data, id, actor)
  }

  // AND NOBODY WRITES A RUN'S RAISES BUT THE PERSON'S PRESS, on this path as on the create.
  if (nextKind === SESSION_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) checkNobodyIsWritingTheirOwnRaise(nextData, before.data, actor)
    // AND A PARENT THIS WRITE SETS OR CHANGES IS ONE THE CALLER MAY NAME, as on the create path. A
    // parent the record already held, carried unchanged, is not asked about again. A record turning
    // into a session had no parent before, so any parent it carries is asked about.
    const parentNow = nextData === undefined ? null : theParentADataGives(nextData)
    const parentBefore = kind === SESSION_KIND ? theParentADataGives(before.data) : null
    if (parentNow !== null && parentNow !== parentBefore) {
      assertThisCallerMayNameThisParent(parentNow, actor, before.workspaceId)
    }
    // AND AN AGENT THIS WRITE ADDS TO THE SESSION IS ONE THE CALLER MAY FILE FOR, as on the create path. A record
    // turning into a session named nobody before, so every agent it names is asked about.
    if (nextData !== undefined) assertThisCallerMayFileASessionFor(nextData, kind === SESSION_KIND ? before.data : undefined, actor, before.workspaceId)
  }

  // AND A NOTEBOOK IS STILL THE ONLY ONE FOR ITS AGENT, AND ITS AGENT STILL HOLDS THE CARD. On this
  // path as well as on the create, because a patch can move a notebook onto another agent's name —
  // which is how one agent would come to have two. `id` is passed so this record is not refused for
  // colliding with itself.
  if (nextKind === NOTEBOOK_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) {
      checkTheNotebook(before.workspaceId, nextData, id)
      checkTheNotebookEntries(
        nextData,
        before.data,
        patch[THE_NOTEBOOK_DOOR] === true,
        isJsonObject(before.data) && typeof before.data['agentHandle'] === 'string' ? before.data['agentHandle'] : '<handle>',
      )
    }
  }

  // A SECRETARY'S DUTIES MEET THEIR GUARD ON EVERY CHANGE, including a title or summary change with no data sent.
  // Only a data-only change may skip the words check when the data already stands. A change into this kind asks the
  // whole write guard; a change out asks who takes the stored duties away, bound to no duties afterwards.
  // A WRITE OF ONLY THE SHORT FORMS IS NOT A CHANGE OF DUTIES: nothing in data but
  // `shortForms` changes, and the title, summary and kind stay. `aPatchWritesMoreThanShortForms` is the one place
  // that says so, for card words and sent drafts as well, so `data.secretary` and every duty still meet the guard.
  // Such a write meets the record's ordinary write rules, and anyone they let write the record writes its short forms.
  if (kind === SECRETARY_DUTIES_KIND && nextKind !== SECRETARY_DUTIES_KIND) {
    checkTheDutiesTakenAway({ workspaceId: before.workspaceId, data: before.data, actor, act: 'kind' })
  }
  if (nextKind === SECRETARY_DUTIES_KIND && aPatchWritesMoreThanShortForms(before, patch)) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data
    const onlyDataChanges = kind === nextKind &&
      (patch.title === undefined || patch.title === before.title) &&
      (patch.summary === undefined || patch.summary === before.summary)
    checkTheSecretaryDuties({ workspaceId: before.workspaceId, data: nextData, before: onlyDataChanges ? before.data : null, mine: id, actor })
  }
  // AND A DECISION THAT DUTIES REST ON STAYS A DECISION THE PERSON DECIDED, ON THE PERSON'S OWN WORDS, while they rest on
  // it: a change into another kind, of `decided_by` away from the
  // owner, or of `authority_reference` to something that is not the person's own words, is refused as its delete is.
  // Asked of the data the decision will hold, so `data`, `dataPatch` and a restore of an earlier revision are judged alike.
  if (kind === DECISION_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data
    const act = theActThatWouldStrandTheDuties(id, before, { kind: nextKind, data: nextData })
    if (act !== null) checkNoDutiesRestOn({ id, title: before.title, workspaceId: before.workspaceId }, act)
  }

  // AND A TOOL OR A CATEGORY STILL NAMES WHAT IT MUST, on this path as well as on the create. Only a
  // value this write changes is asked about; a kind change into one of the two asks about all of them.
  if (nextKind === TOOL_KIND || nextKind === TOOL_CATEGORY_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) {
      checkTheToolsetReferences({
        kind: nextKind,
        workspaceId: before.workspaceId,
        data: nextData,
        before: before.kind === nextKind ? before.data : null,
        mine: id,
      })
    }
  }

  // AND A CARD'S WORDS STILL NAME A DECLARED CARD THAT HAS NO OTHER, because a patch can change the card
  // a record names, or turn another record into one.
  if (nextKind === ROLE_CARD_WORDS_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) checkTheCardWords(nextData, id)
  }
  // AND A RECORD THAT HOLDS AN ADDED CARD'S ONLY WORDS STAYS THAT CARD'S, because a patch can name another card or another kind.
  if (before.kind === ROLE_CARD_WORDS_KIND) {
    refuseAWriteThatTakesTheWordsOfAnAddedCard(
      before,
      nextKind === ROLE_CARD_WORDS_KIND ? (dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data) : null,
    )
  }

  // AND AN INCIDENT STAYS FILED BY A SECRETARY OR THE PERSON, ITS RESPONSIBILITY CHANGED ONLY BY ONE
  // OF THOSE TWO, AND ITS TIMELINE WRITTEN ONLY BY ITS OWN DOOR. Criteria I1 and I4. The filing check
  // runs only when THIS WRITE IS WHAT MAKES the record an incident — it already was one, or a kind
  // change is making it one now; an ordinary edit to an incident that stays an incident is not
  // filing and is not asked this question, the same distinction `checkWhoMayFileAnIncident`'s own
  // header explains.
  if (nextKind === INCIDENT_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (before.kind !== INCIDENT_KIND) checkWhoMayFileAnIncident(actor)
    if (nextData !== undefined) {
      checkTheIncidentResponsibility(nextData, before.data, actor)
      checkTheIncidentTimeline(nextData, before.data, patch[THE_INCIDENT_TIMELINE_DOOR] === true, id)
      checkTheIncidentClosing(nextData, before.data, patch[THE_INCIDENT_CLOSING_DOOR] === true)
    }
  }

  // WHAT A DECISION GOVERNS IS THERE, as on the create door. Asked only when this write sends `governs`, so a module
  // deleted since does not refuse an unrelated change to the decision.
  const sendsGoverns = [patch.data, patch.dataPatch].some((sent) => isJsonObject(sent) && sent['governs'] !== undefined)
  if (nextKind === DECISION_KIND && (dataForNewKind !== null || sendsGoverns)) {
    assertTheGovernedPlacesAreReal(dataForNewKind ?? (merged !== null ? merged.data : patch.data), before.workspaceId)
  }

  // AND A DECISION'S BASIS IS THERE, asked when this write sends `basis`, as `governs` is above.
  const sendsBasis = [patch.data, patch.dataPatch].some((sent) => isJsonObject(sent) && sent['basis'] !== undefined)
  if (nextKind === DECISION_KIND && (dataForNewKind !== null || sendsBasis)) {
    checkTheDecisionBasis(dataForNewKind ?? (merged !== null ? merged.data : patch.data))
  }

  // AND A FLOW'S STEPS KEEP THEIR REASONS: a step added or changed says why and on what, a
  // change to the steps names its cause, and a step nobody touched is not asked. Compared with what the flow held.
  if (nextKind === 'flow') {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) checkTheFlowSteps(nextData, before.kind === 'flow' && dataForNewKind === null ? before.data : null)
  }
  // AND A HANDBOOK'S, against the version it held. A restore of an earlier version may shorten its change record.
  if (nextKind === HANDBOOK_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) {
      checkAHandbookWrite({
        before: before.kind === HANDBOOK_KIND && dataForNewKind === null ? before.data : null,
        after: nextData,
        actor,
        subject: id,
        restoring: ledger?.op === 'restore',
      })
    }
  }

  // AND A WORK DOMAIN'S TWO IDS ARE CHECKED AGAINST THE VALUE THAT WILL BE STORED, so a merge patch
  // cannot get past a check the wholesale path applies.
  //
  // AND WHAT THIS WRITE IS SENDING is asked about separately, against the BODY that arrived rather
  // than the merged result. That is the difference between a guard and a lock: `assertMayChange-
  // ThisDomain` refuses a PATCH that WRITES `resolved` or edits a frozen hypothesis, and a PATCH
  // that touches neither — marking it closed, retitling it, linking it — is left alone. Handed the
  // merged record instead, every patch would carry the stored `resolved` and every patch would be
  // refused, which is a guard that refuses everybody and therefore guards nothing.
  if (nextKind === WORK_DOMAIN_KIND) {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== undefined) checkWorkDomainIds(nextData, before.workspaceId)
    assertMayChangeThisDomain({
      kind: nextKind,
      id,
      before: before.data,
      arriving: dataForNewKind ?? patch.data ?? (isJsonObject(patch.dataPatch) ? patch.dataPatch : undefined),
      actor,
    })
  }

  // ON A CHANGE, A SECRETARY MAY REVOKE ON THE PERSON’S WORDS FOR THAT REVOCATION. Asked against
  // the BODY that arrived and not the merged result, the reason `assertMayChangeThisDomain` above
  // gives: handed the merged record, every patch to an already-revoked regulation would carry its
  // stored revoked_at and every patch would be refused, which guards nothing.
  if (nextKind === REGULATION_KIND) {
    assertMayRevokeARegulation({
      kind: nextKind,
      arriving: dataForNewKind ?? patch.data ?? (isJsonObject(patch.dataPatch) ? patch.dataPatch : undefined),
      actor,
      recordId: id,
    })
  }

  // AND ONLY THE PERSON CONFIRMS AN AGENT'S GOAL, or a secretary on what the person said, asked against
  // the body that arrived for the same reason the revocation guard above is: handed the merged
  // record, every patch to an already-confirmed goal would carry its stored `confirmed_by` and every
  // patch would be refused. The goal's id goes with it, because a secretary's evidence must name it.
  if (nextKind === GOAL_KIND) {
    assertMayConfirmAGoal({
      kind: nextKind,
      arriving: dataForNewKind ?? patch.data ?? (isJsonObject(patch.dataPatch) ? patch.dataPatch : undefined),
      actor,
      recordId: id,
    })
  }

  // A SHORT FORM'S STAMP IS CHECKED AND ITS AUTHOR IS DERIVED, on this path as well as on
  // POST /api/records/:id/short-forms, for the same reason the annotation check above is on both:
  // a rule enforced on one write path is not a rule. `data.shortForms` was the field that proved it
  // — a plain PATCH could store a revision this record does not have AND declare `writtenBy:
  // "human"`, which puts a sentence on the record page saying a person wrote those words by hand.
  //
  // BOTH ARRIVAL SHAPES, because either one stores the field: `dataPatch` merges into what is there
  // and `data` replaces it. A KIND CHANGE IS NOT ONE OF THEM. `dataForNewKind` is what the kind
  // change made of the record's OWN stored fields, so nobody is writing a short form in it, and its
  // stamps were checked when they were written.
  //
  // Each call is handed what is stored as well as what is arriving, so it can settle the levels this
  // write CHANGES and leave the rest alone. `settleShortForms` has the note on why that matters.
  const heldData: Record<string, unknown> = isJsonObject(before.data) ? before.data : {}
  // THE RECORD AS THIS WRITE WILL LEAVE IT, because a short form is measured against the record it
  // is a shorter form of and this patch may be changing the record in the same request. A title or
  // a summary the patch does not mention is the one the record already has; `undefined` is a field
  // the patch is not touching and `null` is somebody clearing it, and the two are not the same act.
  const itself = {
    kind: nextKind,
    title: patch.title ?? before.title,
    summary: patch.summary === undefined ? before.summary : patch.summary,
  }
  if (merged !== null) settleShortForms(id, heldData, merged.data, actor, itself)
  if (patch.data !== undefined) settleShortForms(id, heldData, patch.data, actor, itself)

  // A PIPELINE'S ORDER NAMES REAL BLOCKS. Checked against the value that will be STORED, whichever
  // way it arrived, so a merge patch cannot get past a check the wholesale path applies.
  //
  // ASKED ABOUT THE KIND THE RECORD WILL HAVE, not the one it has — the same word the block-title
  // rule above uses, and for the mirror-image reason. It used to ask about `kind`, so a record
  // TURNING INTO a pipeline never reached this check: `PATCH {"kind":"pipeline"}` on a note whose
  // `data.extra` held a `blockIds` installed that order unread, and an order naming a record that
  // does not exist, a record that is not a block, a deleted block or another pipeline's block was
  // stored with a 200. The very same value sent as `data` was refused 400.
  //
  // The data a kind change will store is `dataForNewKind`, which is what the kind change made of
  // the record's fields. A kind may not be sent beside `data` or `dataPatch`, so at most one of
  // these three is ever defined.
  if (nextKind === 'pipeline') {
    const nextData = dataForNewKind ?? (merged !== null ? merged.data : patch.data)
    if (nextData !== null && nextData !== undefined && isJsonObject(nextData)) {
      // A `data` THAT CARRIES NO ORDER AT ALL IS AN ORDER OF NOTHING, and it is the same act as
      // sending an empty list: every block the pipeline holds would be left out. This used to ask
      // `Array.isArray(blockIds)` and skip the whole check when the answer was no, so
      // `PATCH {"data":{}}` and `PATCH {"dataPatch":{"blockIds":null}}` each emptied a pipeline and
      // left every one of its blocks alive and listed by nothing, with a 200.
      const order = nextData['blockIds']
      const arriving = order === undefined || order === null ? [] : order
      // ANYTHING ELSE IS A SHAPE MISTAKE and `validateRecordData` a few lines down says so in its
      // own words, naming the field and what it should be. Refusing here would answer a type error
      // with a sentence about missing blocks, which sends the reader to the wrong problem.
      if (Array.isArray(arriving) && arriving.every((v) => typeof v === 'string')) {
        checkBlockIds(id, filing ?? before.workspaceId, arriving as string[], new Set(deleting))
      }
    }
  }

  // A PLANNED FUTURE'S ORDER NAMES REAL PLANNED STATES, on this path as well as on the way in. The
  // sibling rule to the one above, and it takes no actor for the reason written on it: none of its
  // three questions is about who asked. Dropping a live state is asked ninety lines up, where the
  // actor is known.
  if (nextKind === 'trajectory') {
    const nextData = merged !== null ? merged.data : patch.data
    if (nextData !== null && nextData !== undefined && isJsonObject(nextData) && Array.isArray(nextData['plannedStateIds'])) {
      checkPlannedStateIds(id, (nextData['plannedStateIds'] as unknown[]).filter((v): v is string => typeof v === 'string'))
    }
  }

  refuseAGenericUpgradeNotice(before.data, dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data)

  // A merge is checked as the WHOLE record it produces, not as the patch on its own: a patch
  // saying {"summary":"..."} carries none of the fields a module requires, and validating it
  // alone would refuse every merge. The consequence is worth stating, because it is the one
  // surprise here: a record stored before this gate existed, with a key no kind declares,
  // cannot be merge-patched until the same patch also removes that key. That is deliberate.
  // The alternative is a write path that keeps a record invalid and calls it a success.
  if (merged !== null) validateRecordData(kind, merged.data)
  if (patch.data !== undefined) validateRecordData(kind, patch.data)
  // A FIELD THAT HOLDS A PARTICIPANT NAMES SOMEBODY A REGISTRY ROW ANSWERS TO, asked of the data this write stores and
  // only where it changes a value. A change of kind changes every value.
  checkTheParticipantsNamed(nextKind, dataToStore, nextKind === kind ? before.data : null)
  const territoryChanged = nextKind === 'session' && (patch.data !== undefined || dataForNewKind !== null ||
    (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'territory')))
    ? checkAndNormalizeTerritory({ recordId: id, workspaceId: before.workspaceId, data: before.data as Record<string, unknown> }, dataToStore as Record<string, unknown>, actor)
    : false

  // AND WHAT THE QUESTIONS IN A REPORT NAME IS THERE, as on the create door: a rule enforced on one write path is not a
  // rule. Only a name this write adds or changes is asked, so a report whose proposal was settled or whose agent retired
  // since it was written can still be corrected, and the answer door's own writes are not asked at all.
  if (nextKind === 'report' && !theAnswerDoorIsWriting()) {
    refuseAQuestionThatNamesNothing(
      dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data,
      before.workspaceId,
      kind === 'report' ? before.data : null,
    )
  }

  // AND THE OFFICE'S TWO LANGUAGES CHANGE TOGETHER. Asked of the record as this
  // write will leave it, against the record as it is stored, so a Chinese half is checked only when
  // this write changes it or the English it translates.
  refuseAChineseHalfNotFromThisEnglish(
    { kind: before.kind, title: before.title, summary: before.summary, data: before.data },
    {
      kind: nextKind,
      title: itself.title,
      summary: itself.summary,
      data: dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data,
    },
  )

  // AND A CHAPTER'S OUTLINE IS CHANGED BY THE PERSON, OR ON THE PERSON'S DECISION. Asked of the record
  // as this write will leave it, kind and all, so a renumbering or a kind change is asked too.
  refuseAnOutlineChangeWithoutTheirDecision(
    { kind: before.kind, data: before.data },
    { kind: nextKind, data: dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data },
    actor,
  )

  // AND A MODULE'S PLANNER IS NAMED ONLY BY THE PERSON, A SECRETARY OR THE MODULE'S MAKER.
  refuseAPlannerNamedByAnother(
    { id, workspaceId: before.workspaceId, kind: before.kind, data: before.data },
    { kind: nextKind, data: dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data },
    actor,
  )

  refuseModulePartChanges(
    { kind: before.kind, data: before.data },
    { kind: nextKind, data: dataForNewKind ?? (merged !== null ? merged.data : patch.data) ?? before.data },
    actor,
  )

  // ---- AND IS SOMEBODY BEING ASKED SOMETHING ON THIS RECORD -----------------------------------
  //
  // Two of the three acts `assertMayRemoveAnAsk` refuses arrive through this function: closing a
  // record that asks the person something, and clearing the question on it. Asked AFTER the shape
  // check, so a patch that would be refused for being the wrong shape is answered about its shape,
  // and BEFORE the write, so a refusal leaves the record exactly as it was.
  //
  // HANDED THE VALUE THAT WILL BE STORED, not the patch that was sent, for the reason the pipeline
  // order and the checklist rules above are: a merge patch must not get past a check the wholesale
  // path applies. A KIND CHANGE IS ONE OF THE WRITES IT SEES: turning a task into a note carries
  // `whose_move` into `extra`, which takes the question out of the queue exactly as clearing it
  // would. A patch that writes no `data` at all leaves the record's own fields standing, which is
  // what the fallback below says, and the guard then finds nothing to refuse.
  const dataAfterThisWrite = dataForNewKind ?? (merged !== null ? merged.data : patch.data)

  // ---- AND IS AN AGENT TAKING SOMEBODY'S WRITING OFF A NORMAL READER'S SCREEN ------------------
  //
  // Handed the value that WILL BE STORED, for the same reason the two checks above are: a merge
  // patch must not get past a check the wholesale path applies. Asked after the shape check so a
  // badly shaped patch is answered about its shape, and before the write so a refusal leaves the
  // record exactly as it was.
  if (dataAfterThisWrite !== undefined && dataAfterThisWrite !== null) {
    assertMayNotHideExistingWriting(
      { id, kind: before.kind, title: before.title, data: before.data },
      dataAfterThisWrite,
      actor,
      ledger,
    )
  }

  // ---- AND DOES THE BODY THIS WRITE SENDS SAY HOW MANY THINGS ARE WAITING --------------------
  //
  // HANDED THE BODY THAT ARRIVED, not the one that will be stored, and that is the difference
  // between a guard and a lock. Every way an agent can write the sentence sends the body: a
  // wholesale `data`, a merge patch naming the field, or a kind change. A patch that does not send
  // it is not touching it — an agent marking the owner's own report read would otherwise be refused
  // for the report's words, on a write that changes none of them. `bodyBeingWritten` returns null
  // for all three absences and is where that is decided, once, for this guard and for the
  // short-form rule.
  const dataArrivingOnThisWrite = dataForNewKind ?? patch.data ?? (isJsonObject(patch.dataPatch) ? patch.dataPatch : undefined)
  assertMayWriteACountOfWhatIsWaiting(kind, dataArrivingOnThisWrite, actor, id)

  // ---- AND WOULD THIS WRITE TOUCH THE RECORD OF WHAT LEFT THE BUILDING -----------------------
  //
  // HANDED BOTH THE BODY THAT ARRIVED AND THE BODY THAT WILL LAND, because the two clauses of the
  // rule are two different questions. Forging is about what the caller NAMED — `data.exports` or
  // `dataPatch.exports`, either door. Erasing is about what would be STORED, and the two doors that
  // erase never say `exports` at all: a wholesale `data` replaces the bag, and a kind change sets
  // the values aside under `extra`. `nextKind` and `before.kind` are both asked so that a bundle
  // becoming something else and something else becoming a bundle are both this guard's business.
  //
  // Asked after the shape check, so a badly shaped patch is answered about its shape, and before
  // the write, so a refusal leaves the record exactly as it was.
  assertMayWriteAnExportList({
    kind: nextKind,
    wasKind: before.kind,
    sent: { data: patch.data, dataPatch: patch.dataPatch },
    before: before.data,
    after: dataAfterThisWrite ?? before.data,
    recordId: id,
    byTheServer: patch[AN_EXPORT_IS_WRITTEN_BY_THE_SERVER] === true,
  })
  assertABundleShiftIsAMove({ kind: nextKind, before: before.data, after: dataAfterThisWrite ?? before.data, recordId: id })

  assertMayRemoveAnAsk(
    { id, kind, title: before.title, data: before.data, deletedAt: before.deletedAt },
    dataAfterThisWrite ?? before.data,
    actor,
  )

  // ---- AND WOULD IT LEAVE OPTIONS FOR THE PERSON MARKED AS AN AGENT'S MOVE ------------------
  //
  // Handed the body that will be STORED, for the reason every guard on this
  // path is: a merge patch and a wholesale `data` reach the same field.
  assertOptionsForThemAreTheirMove({ id, kind, title: before.title }, dataAfterThisWrite ?? before.data, actor)

  // ---- AND WOULD THIS WRITE PUT SOMEBODY'S NAME ON THE PATH A QUESTION TOOK ------------------
  //
  // Criterion P55. Handed the body that will be STORED, for the reason every guard on this path is:
  // a merge patch and a wholesale `data` reach the same field, and only the merged body says what
  // the record will hold.
  assertMayPassTheQuestionOn(
    { id, kind, title: before.title, data: before.data },
    dataAfterThisWrite ?? before.data,
    actor,
  )

  /** Every field a wholesale `data` takes off this record. Stays null when none was sent. */
  let emptied: string[] | null = null

  // ---- A `data` DOES NOT EMPTY A FIELD NOBODY MENTIONED --------------------------------------
  //
  // THE DEFECT: A DESTRUCTIVE WRITE WAS ANSWERED EXACTLY LIKE A HARMLESS ONE. `data` replaces the
  // whole object, so a caller sending two keys of a nine-key record stored a two-key record and got
  // a 200 with an empty `incomplete` list. Measured on 4 September 2026:
  // one builder lost 7 fields at 16:00:50 and another lost 2 more at 16:18:54, both put back by
  // hand from the revision ledger. `data` is the spelling every record is CREATED with, so it is
  // the one a caller reaches for, and nothing in the reply named what had gone.
  //
  // WHY NOT MAKE `data` MERGE. A caller that means to rewrite a record whole would then be silently
  // doing something else, which is the same defect pointing the other way. The two bodies keep
  // their two meanings and the destructive one now has to be asked for.
  //
  // WHY `replace: true` AND NOT `ifVersion`, WHICH THE CHECKLIST GUARD ALREADY TAKES. They answer
  // different questions. `ifVersion` proves the caller's copy is CURRENT; this asks whether the
  // caller MEANS to empty the fields it is not sending, and a request can be perfectly current and
  // still be a two-key object somebody typed by hand — which is what both measured losses were.
  // Reusing it would also invert what it is for: `ifVersion` is the careful caller's key, sent to
  // be safe about a concurrent write, and making it double as consent to erase would mean the more
  // careful the caller, the more destructive power it silently acquires. Both keys stay, and they
  // stay separate: a replace may carry `ifVersion` too, and then it is both meant and current.
  //
  // A `data` THAT EMPTIES NOTHING IS NOT REFUSED. Filling in a stub, or writing back what was read
  // with a field added, carries every stored key and passes without a word.
  //
  // LAST OF ALL THE GUARDS, AND THAT IS THE POINT OF WHERE IT SITS. Every check above protects ONE
  // named thing — the words of a note somebody has read, the question waiting on a person, the list
  // of what left the building, a classification only the person may take off a fork — and each answers with
  // the sentence about that thing and the status code that says whose act it was. This one is
  // generic. Put first, it would have answered "you would empty `body`, send replace: true" to an
  // agent rewriting somebody's sent comment, which is a worse answer to a better-understood
  // request, and it would have turned three governance refusals from 403 into 400. So it runs after
  // all of them, and it is the last thing between a wholesale write and the record.
  if (patch.data !== undefined) {
    const wouldEmpty = fieldsAReplaceWouldEmpty(before.data, patch.data)
    // WHAT THE REPLY WILL SAY THIS WRITE EMPTIED, worked out here and in no second place. The list
    // the refusal names and the list the reply reports are the same list, from the same call, so
    // they cannot come to disagree about what a wholesale `data` does.
    emptied = wouldEmpty
    // THE GATE `writes-that-empty-fields`, read once and only when the write would empty a field it was not told to.
    // At off the write goes on, and the reply's `emptied` names each field, as it does for a replace.
    const position = wouldEmpty.length > 0 && patch.replace !== true ? gatePosition('writes-that-empty-fields') : null
    const met = () => gateMet('writes-that-empty-fields', position!)
    if (position === 'block') {
      // EVERY ONE OF THEM IS NAMED, with no cap and no "and 3 more". The list is what the caller
      // has to act on — either to put the fields back into the object it is sending, or to know
      // what it is about to lose — and a list that stops short would send it back for the rest.
      const them = wouldEmpty.length === 1 ? 'it' : 'them'
      throw gateMetOnceTheWriteIsTakenBack(new PanelError(
        `This record holds ${wouldEmpty.length} field${wouldEmpty.length === 1 ? '' : 's'} your \`data\` does not ` +
          `carry, and \`data\` replaces the whole object, so this write would empty ${them}: ` +
          `${wouldEmpty.join(', ')}. Nothing was written. If you meant to change only the fields you sent, ` +
          `send them as a merge instead: PATCH /api/records/${id} {"dataPatch":{…}} writes the keys you name and ` +
          `leaves every other field exactly as it is. If you do mean to rewrite the whole object and lose ` +
          `${wouldEmpty.length === 1 ? 'that field' : 'those fields'}, send the same \`data\` again with ` +
          `{"replace":true}.`,
        400, undefined, undefined, undefined,
        wouldEmpty.length === 1
          ? { code: 'recordFieldWouldBeEmptied', values: {} }
          : { code: 'recordFieldsWouldBeEmptied', values: { count: wouldEmpty.length } },
      ), met)
    }
    if (position !== null) met()
  } else if (patch.replace !== undefined) {
    // Sent beside a merge, or beside no data at all. It would change nothing, and a key that
    // changes nothing and is answered 200 is a caller believing it asked for something.
    throw new PanelError(
      'replace only means something beside `data`, which rewrites the whole object: it says the fields you ' +
        'left out are meant to go. A dataPatch empties nothing it does not name, so it needs no such answer.',
    )
  }

  /**
   * THE CHANGE ROWS FOR THIS PATCH. Called from inside the write's transaction, never before it.
   *
   * IT WAS CALLED BEFORE THE TRANSACTION UNTIL 18 AUGUST 2026, and that left the change log able to
   * describe an edit that never landed. A pipeline rename used to rewrite its blocks' titles, and a
   * new name that gave two of them one title was refused half way through: the throw rolled the
   * transaction back, but the `title` row was already committed, so the log said the pipeline was
   * renamed while the record still held its old name. Measured: one record's change rows went from
   * two to three while its title and its revisions did not move. That automatic rename is gone,
   * and the ordering rule it taught still applies.
   *
   * That was untidy on its own and it is intolerable now, for the reason `patchChecklistItem` gives
   * where the same fix was made: the revision ledger and the change log are two histories of one
   * write, and a write that fails half way would leave them disagreeing with nothing failing.
   * tests/revision-ledger-agrees-with-the-change-log.test.ts is what makes that impossible to
   * reintroduce quietly.
   *
   * The values it writes are all read from `before`, which was read at the top of this function, so
   * moving the call changes nothing about what any row says.
   */
  // THE STARTER'S KEY, on the mint of a run a starter filed by hand and on no other patch. See `provedHolderWritten`.
  const startersKey = (patch as Partial<OriginalRunKeyMintPatch>)[THE_STARTERS_KEY_ON_ITS_MINT]
  const logTheChangeRows = (): void => {
    // One change row per field, so "what changed here" is answerable without diffing.
    for (const field of ['title', 'summary', 'data'] as const) {
      if (patch[field] === undefined) continue
      const oldV = before[field]
      const newV = patch[field]
      if (JSON.stringify(oldV) === JSON.stringify(newV)) continue
      logChange(id, 'update', actor, field, oldV, newV, undefined, startersKey)
    }

    // ...and one row per JSON path for a merge, rather than one row holding the whole record
    // twice. The audit measured that blob at 6.2 kB for a one-key correction, which makes the
    // history of a module unreadable and answers "what changed" with "everything, apparently".
    // This used to carry a warning that web/lib/attention.ts could only date a checklist item from
    // change rows whose field was exactly `data`, and would quietly report an item as untouched if
    // anything ever wrote a per-path row for it. Something does now — patchChecklistItem below —
    // so lastTouchedItem reads all three spellings: the whole bag, `data.parts` from a merge patch,
    // and `data.parts[#part].items[#item].state` from the item endpoint. The `#` in that last one
    // is an id and not an index, deliberately: an index moves when a checklist is reordered.
    if (merged !== null) {
      for (const edit of merged.edits) {
        logChange(id, 'update', actor, edit.path, edit.before, edit.after, undefined, startersKey)
      }
    }

    // ...and the kind, with the fields the change had to move, on the same rows-per-path plan.
    //
    // ONE ROW FOR THE KIND ITSELF, so "what changed here" answers with the kind rather than with a
    // whole record twice, and TWO ROWS FOR EACH FIELD THAT MOVED — one saying the value left the key
    // it was under, one saying it arrived inside `extra`. A single row would say a field went and not
    // where it went, which is the half of the story somebody reads the history to find. Every row
    // goes through `logChange`, so a kind change carries exactly the provenance every other change
    // carries: who asked, which session they were writing under, and the value before and after.
    if (kindChange !== null && kindChange.changed) {
      logChange(id, 'update', actor, 'kind', kindChange.from, kindChange.to)
      const held = isJsonObject(before.data) ? before.data : {}
      for (const field of kindChange.kept) {
        logChange(id, 'update', actor, `data.${field.key}`, held[field.key], undefined)
        logChange(id, 'update', actor, field.nowAt, undefined, held[field.key])
      }
      // AND TWO ROWS FOR EACH VALUE THAT CAME BACK, the same pair the other way round: one saying it
      // left `extra`, one saying it arrived at the key it belongs to. A value reappearing on a record
      // with nothing in the history to say where it came from is the same defect as one vanishing.
      const bag = isJsonObject(held['extra']) ? held['extra'] : {}
      for (const field of kindChange.broughtBack) {
        if (!field.restored) continue
        logChange(id, 'update', actor, field.wasAt, bag[field.key], undefined)
        logChange(id, 'update', actor, `data.${field.key}`, undefined, bag[field.key])
      }
    }
  }

  const write: {
    kind?: RecordKind
    title?: string
    summary?: string | null
    data?: Record<string, unknown>
    updatedAt: string
  } = {
    updatedAt: now(),
  }
  // A FIELD GOES IN HERE ONLY WHEN IT REALLY MOVED, asked with the same comparison `logTheChangeRows`
  // uses one screen up. That is deliberate: the change log and the write then agree by construction,
  // so a field can never be stamped into `updatedAt` without a change row saying it moved, and no
  // change row can name a field the write left alone.
  const moved = (field: 'title' | 'summary' | 'data'): boolean =>
    patch[field] !== undefined && JSON.stringify(before[field]) !== JSON.stringify(patch[field])
  if (moved('title')) write.title = patch.title
  if (moved('summary')) write.summary = patch.summary
  if (moved('data')) write.data = patch.data
  if (merged !== null && merged.edits.length > 0) write.data = merged.data
  if (kindChange !== null && kindChange.changed) {
    write.kind = kindChange.to
    // Only when something actually moved, IN EITHER DIRECTION. Writing `data` back unchanged would
    // make every kind change look like an edit to the record's fields in the history and in
    // `updatedAt`. This used to ask only about `kept`, which is why a value that came home out of
    // `extra` was reported as restored and was not stored — the reply and the record disagreeing,
    // which is the one failure the whole path exists to prevent.
    const cameBack = kindChange.broughtBack.some((field) => field.restored)
    if ((kindChange.kept.length > 0 || cameBack) && dataForNewKind !== null) write.data = dataForNewKind
  }

  // WHO CHANGES THE REST OF A RUN, worked out in the session block above and asked last, just before the write, so that
  // a write another rule refuses is told that rule's words and not whose run it is. Nothing above here writes.
  if (changesTheRestOfARun && theRecordTheDoorWrites === id) {
    assertMayChangeARun(actor, { recordId: id, workspaceId: before.workspaceId, data: before.data })
  }

  // A PATCH THAT CHANGED NOTHING WRITES NOTHING AT ALL, not even the timestamp, and no revision.
  // `updatedAt` is the answer to "when did this last change" and the order the home page lists
  // things in; moving a module to the top of the page for a patch that changed none of it would be
  // a lie with a visible consequence. A PATCH THAT ONLY NAMES THE KIND THE RECORD ALREADY HAS is
  // the same case: the answer says nothing changed, so nothing may change.
  //
  // IT USED TO COVER THE MERGE AND THE KIND AND NOT THE WHOLESALE PATH, on the ground that a caller
  // sending `data` should see the behaviour it had always seen. That left one rule with two answers,
  // and putting an earlier revision back is the write that showed it: a restore always sends title,
  // summary and data wholesale, so restoring the content a record already held stamped `updatedAt`,
  // moved the record to the top of every recently-changed list, and wrote a revision — while its own
  // reply said nothing moved. An agent could repeat that on any record any number of times.
  const nothingToWrite =
    write.kind === undefined &&
    write.title === undefined &&
    write.summary === undefined &&
    write.data === undefined
  if (nothingToWrite && !sealsTheRun) {
    const unchanged = toRecord(before)
    const fields = [
      ...(patch.kind === undefined ? [] : ['kind']),
      ...(patch.title === undefined ? [] : ['title']),
      ...(patch.summary === undefined ? [] : ['summary']),
      ...(patch.data === undefined ? [] : ['data']),
      ...(merged?.outcome.unchanged ?? []),
    ]
    const absent = merged?.outcome.alreadyAbsent ?? []
    const reason = fields.length > 0 && absent.length > 0 ? { kind: 'mixed' as const, fields, absent }
      : fields.length > 0 ? { kind: 'unchanged' as const, fields }
      : absent.length > 0 ? { kind: 'absent' as const, fields: absent }
      : { kind: 'empty' as const }
    return {
      record: unchanged,
      nothingWritten: nothingWrittenSentence(reason),
      // A null revision and a sentence both say that this request stored nothing.
      newSeq: null,
      dataPatch: merged?.outcome ?? null,
      // A REPLACE THAT WROTE NOTHING STILL SAYS WHAT IT EMPTIED, which is nothing: a `data` equal to
      // what is stored carries every stored key, so the list is empty and the reply says so.
      ...(emptied === null ? {} : { emptied }),
      incomplete: incompletenessOf(unchanged),
      ...(kindChange === null ? {} : { kindChange }),
    }
  }

  // A RUN KEY WRITING ANOTHER RUN OF THE SAME AGENT IS TAKEN WITH A REMINDER. The guard on a run's end and the guard on
  // its data ask who answers for the run, and a run key proves its run's agent, which is the other run's agent too. The
  // write stands; its answer names the key's run and the run it wrote, and the written run carries one line, once for
  // the pair. A finish whose session header names the run it writes is refused before this, by the session-header rule.
  if (
    before.kind === 'session' &&
    (patch.data !== undefined || patch.dataPatch !== undefined) &&
    actor.runKeyFor !== undefined &&
    actor.runKeyFor !== id &&
    theRunsOwnAgents(before.data).includes(actor.keyHolder ?? actor.id)
  ) {
    runKeyReminder = theRunKeyReminderSentence({ keyRun: actor.runKeyFor, writtenRun: id })
    const line = theRunKeyNoticeLine({ keyRun: actor.runKeyFor, writtenRun: id, at: write.updatedAt })
    if (!aRunKeyNoticeIsAlreadyOn(id, actor.runKeyFor)) {
      ledgerNote = ledgerNote === undefined || ledgerNote === '' ? line : `${line} ${ledgerNote}`
    }
  }

  // The candidate is the exact row assembled above, including the normalized data. A state-only
  // start never comes here with territoryChanged, so an already-held territory is not rechecked.
  if (territoryChanged) checkTerritoryBeforeWrite?.(toRecord({ ...before, ...write }))

  // ---- the write ------------------------------------------------------------------------------
  //
  // A PIPELINE RENAME DRAGS NOTHING WITH IT ANY MORE. It used to rewrite every one of its blocks'
  // titles, because a block's title carried its pipeline's; a block now has its own title, so
  // renaming a pipeline is now one record changing and no others.

  let flowRunFiled: FlowRunFiled | null = null
  let flowRunStepsNotWritten: FlowRunStepsNotWritten | null = null
  const writeTransaction = sqlite.transaction((): { newSeq: number } => {
    const beforeFix = (before.data as Record<string, unknown>)['mainSuiteFix']
    const afterFix = ((write.data ?? before.data) as Record<string, unknown>)['mainSuiteFix']
    if (JSON.stringify(beforeFix) !== JSON.stringify(afterFix)) {
      const live = getRecord(id)
      if (live === null || versionOf(live) !== version) throw new PanelError('The mainSuiteFix problem changed before its transition. Nothing was written.', 409)
      if (beforeFix === undefined) throw new PanelError('mainSuiteFix must reserve its receipt on the original problem create. Nothing was written.', 409)
      validateMainSuiteFixTransition(id, afterFix, actor, before.workspaceId, patch.ifVersion)
    }
    let laterLook: { endedAt: string | null } | null = null
    // WHO THIS COMMENT IS FOR, COMPLETED INSIDE THIS TRANSACTION and BEFORE the change rows, so the
    // history names the value that was stored. A legacy `annotation`'s `chosenRecipientAsStored`
    // mints the durable identity of a run somebody chose, which is two more record writes; a
    // `message` is REFUSED here when the run names no agent. A refusal rolls either back with
    // everything else. The completed value goes through the same gate as the one that was sent.
    if (write.data !== undefined) {
      const chosen = chosenRecipientAsStored(write.data, actor, nextKind)
      if (chosen !== null) {
        write.data = { ...write.data, chosenRecipient: chosen }
        validateRecordData(nextKind, write.data)
      }
      /**
       * AND WHO THE MESSAGE IS ADDRESSED TO, WORKED OUT AGAIN BECAUSE THE RECORD HAS CHANGED.
       *
       * This is the half that was missing until 5 September 2026, with this consequence: the review column chooses
       * who a comment is for AFTERWARDS, with a `PATCH`
       * that writes `chosenRecipient` onto a record that already exists. Nothing re-ran the
       * resolution, so the comment stayed addressed to nobody, no delivery row was ever written,
       * and the conversation — which is built from delivery rows — never saw it, while the column
       * said it had been sent.
       *
       * THE SAME READER THE CREATE DOOR USES, and only where the record itself says nothing. An
       * explicit `to` or `toGroup` in the patch is a caller saying what it means, and this never
       * overrules one. What the person chose stays in `chosenRecipient`; this writes beside it what
       * Mole Office made of it, which is the eighth rule's middle layer.
       */
      if (nextKind === 'message' && isJsonObject(write.data)) {
        const held = write.data
        if (!Array.isArray(held['to']) && typeof held['toGroup'] !== 'string') {
          const reaches = whoAMessageIsTo(held, before.workspaceId)
          if (reaches.length > 0) {
            write.data = { ...held, to: reaches }
            validateRecordData(nextKind, write.data)
          }
        }
      }
    }
    if (nextKind === 'session' && sealsTheRun && runSubmitsWork(id, (write.data ?? before.data) as Record<string, unknown>)) {
      const finishedData = { ...(write.data ?? before.data) } as Record<string, unknown>
      // Only this write's tip is a claim about HEAD; the stored tip can still be the filing tip.
      const sealed = sealFinishedRun(id, finishedData, actor, (patch.dataPatch ?? patch.data)?.['tip'])
      if (sealed.tip !== undefined && sealed.tip !== finishedData['tip']) {
        logChange(id, 'update', actor, 'data.tip', finishedData['tip'], sealed.tip)
      }
      Object.assign(finishedData, sealed)
      write.data = finishedData
      logChange(id, 'update', actor, 'data.sealedTip', typeof (before.data as Record<string, unknown>)['sealedTip'] === 'string' ? String((before.data as Record<string, unknown>)['sealedTip']) : null, String(finishedData['sealedTip']))
    }
    refuseARunEnteringALiveSet(id, before.kind === 'session' ? before.data : null, nextKind === 'session' ? (write.data ?? before.data) : null)
    // The change rows FIRST and inside this transaction, so the daily page and the revision ledger
    // both land or neither does. See `logTheChangeRows` for the rename collision that proved it.
    logTheChangeRows()
    db.update(records).set(write).where(eq(records.id, id)).run()
    if (before.kind === 'session' && !theRunHasEnded((before.data as Record<string, unknown>)['state']) &&
        (nextKind !== 'session' || !theRunHasEnded(((write.data ?? before.data) as Record<string, unknown>)['state']))) {
      applyAWaitingStarterChangeForARunEnded(id, before.data as Record<string, unknown>, before.workspaceId)
    }
    if (before.kind === 'session' && nextKind !== 'session') createRunTokenStore(sqlite).revokeRun(id, 'run-changed')
    // A MESSAGE THAT BECAME ANOTHER KIND GOES TO THE PROJECT IT WAS WRITTEN IN, and a record that became a message goes
    // into the message centre, which holds only messages. The office's one way
    // of moving a record, inside this transaction, so the kind and the place are written together or not at all.
    if (filing !== null) fileARecordWhoseKindChanged(id, filing, actor)

    /**
     * A RUN'S KEY DIES WHEN THE RUN DOES. M81 and P83 point 5.
     *
     * THE OFFICE MINTS EACH RUN ITS OWN KEY and records the `held_keys` row on the run's own session
     * record. This is the one place a session's state is written, so it is the one place the key is
     * taken back: a run the worker watched end patches `finished` or `crashed` through here, and a
     * run that died without saying so is patched `orphaned` through here by the session sweep. Every
     * path that ends a run reaches this. One door also takes the key of a run that has not ended: the
     * stop door for a run that will not stop (src/server/api/runtime.ts) revokes it first, so the run's
     * writes stop even while its process runs.
     *
     * ON THE TRANSITION AND NOT ON THE STATE, because a later sweep re-observing an ended run writes
     * the same word again and revoking a second time must do nothing rather than throw.
     *
     * THE ID IS READ FROM WHAT THE RECORD HELD WHILE THE RUN WAS ALIVE, never from what this write
     * puts there: a wholesale `data` that dropped `extra` would otherwise take away the only record
     * of which key to revoke. A record with no run key — every session filed before runs were minted
     * keys — is untouched.
     */
    if (nextKind === 'session') {
      const beforeData = (before.data ?? {}) as Record<string, unknown>
      const afterData = (write.data ?? before.data ?? {}) as Record<string, unknown>
      if (!theRunHasEnded(beforeData['state']) && theRunHasEnded(afterData['state'])) {
        applyAWaitingStarterChangeForARunEnded(id, beforeData, before.workspaceId)
        createRunTokenStore(sqlite).revokeRun(id, 'run-ended')
        revokeTheRunKeyRecordedOn(beforeData, whyARunsKeyWasRevokedAtItsEnd(id, String(afterData['state'])))
        /**
         * AND THE CLAIMS IT WAS HOLDING END WITH IT. Criterion F2.
         *
         * THE TRANSITION IS THE MOMENT THIS IS ASKED, AND F1 IS THE ANSWER. `theRunHasEnded` counts
         * `finished` as an end, and F1 says a run that said it finished is only `inspecting`: it is
         * being checked and keeps its claim. `endTheClaimsOfARun` asks `howTheRunStands`, so a
         * finished run releases nothing here and a crashed or orphaned run releases everything it
         * held. That is the reconciliation, in one place, rather than two lists free to disagree.
         */
        endTheClaimsOfARun(id, before.workspaceId, actor)
        // The run loses its key here, so its gone process rows must close in this same write.
        // A process still alive stays recorded. No signal is sent.
        closeTheGoneProcessRowsOfAnEndedRun(id, before.workspaceId, actor)
        // A RUN THAT ENDS CRASHED IS NEVER SEALED, so the work area set for it is emptied here instead, in this same
        // write, by the seal's reading: only while setting it for this run is still the agent's last change.
        if (afterData['state'] === 'crashed') aCrashedRunEmptiesTheAreaSetForIt({ id, workspaceId: before.workspaceId, data: afterData }, { type: 'system', id: moleOffice().id })
        // Only this end asks for a later look. Old ended runs are never backfilled.
        const stillOpen = sqlite.prepare(
          'SELECT 1 FROM session_resources WHERE session_record_id = ? AND workspace_id = ? AND released_at IS NULL LIMIT 1',
        ).get(id, before.workspaceId)
        laterLook = { endedAt: stillOpen === undefined ? null : write.updatedAt }

        // The run's own command may still be exiting. The office's later look
        // sends the notice about the ended run, after that command has had time to finish.
      }
      // AND A SESSION THAT HAS JUST FINISHED WAKES ITS PARENT, once. On the transition, for the reason the key's revocation above gives, and
      // on `finished` only: a crash or an orphaning is not the child saying its work is done.
      if (beforeData['state'] !== 'finished' && afterData['state'] === 'finished') tellTheParentAChildFinished(id, actor)
      // AND THE STEPS THIS CHANGE SHOWS GO ON THE RUN'S FLOW RUN: a seal, a verdict, a close, an end. Read from
      // what the record held before and after, so every door that writes one of those fields is covered
      // here. Under M1 of the office flow, a failed append files a problem and never stops this write.
      // A RECORD CHANGED INTO A SESSION gets its flow run here, as a filed run does, with the steps its data already
      // shows; one that was a session before and has its flow run gets the steps of this change. Either failure is
      // said in this write's answer.
      if (before.kind !== 'session' && theFlowRunOf(id) === null) {
        flowRunFiled = fileTheFlowRunOf(
          { id, workspaceId: before.workspaceId, createdAt: String(write.updatedAt ?? now()), data: afterData, origin: readOrigin(before.origin) ?? 'authored' },
          actor,
        )
      } else {
        flowRunStepsNotWritten = recordTheStepsOfAChange(id, beforeData, afterData, actor, String(write.updatedAt ?? now()))
      }
    }

    /**
     * AND THE DELIVERY ROWS FOLLOW THE RECORD, inside this transaction, so a message and the marks
     * about it are written together or not at all — the create door's promise, kept on this path.
     *
     * AFTER the update and not before it, because `keepTheDeliveryRowsInStep` is asked about what
     * the record now holds. Nothing is deleted here: a delivery row says somebody was handed these
     * words, and changing your mind about who a comment is for does not un-hand them.
     */
    if (nextKind === 'message' && write.data !== undefined && isJsonObject(write.data) && patch[THE_OFFICE_FOLDS_ITS_LINES] !== true) {
      const stepped = keepTheDeliveryRowsInStep(id, write.data, before.workspaceId)
      // EVERY OPEN PAGE IS TOLD ONLY WHEN SOMETHING REALLY MOVED. A patch that changed a message's
      // title writes no delivery row and announces nothing; a patch that gave a comment its
      // recipient wrote one, and the conversation it has just joined has to draw it. The create
      // door announces every message it writes, including one addressed to nobody, because that is
      // a new message either way; this door announces a message REACHING somebody, which is the
      // only thing a patch can do to the pool.
      if (stepped.wrote > 0) {
        // `fresh` FALSE: this message may be older than the last line of the conversation it has just
        // joined, so a page reads its lists for it rather than putting it on top.
        const reached = {
          name: 'message.new' as const,
          workspaceId: before.workspaceId,
          messageId: id,
          sentBy: refFrom(write.data['sentBy']),
          to: stepped.to,
          hasTarget: targetOfRecord({ kind: nextKind, data: write.data }) !== null,
          lists: whatANewMessageChanges(id, false),
        }
        announce(reached, aNewMessageAsToldTo(reached), thePartiesOf(id))
      }
    }
    // AND THE REGISTRY KEEPS UP WITH A RENAMED HANDLE, on this path as well as on the create,
    // because a rule enforced on one write path is not a rule. Read off the row that was just
    // written rather than off the patch, so a merge patch and a wholesale write are the same here.
    if ((kindChange?.to ?? before.kind) === AGENT_KIND) {
      const held = getRecord(id)
      if (held !== undefined && held !== null) {
        keepTheAgentRegistryInStep(
          {
            id: held.id,
            title: held.title,
            handle: held.data['handle'],
            runtime: held.data['runtime'],
            state: held.data['state'],
            retiredBecause: held.data['retiredBecause'],
            startedBy: theStarterTheRegistryFollows(held.data['startedBy']),
            role: held.data['role'],
            cardChosenBy: held.data['cardChosenBy'],
            elevation: held.data['elevation'],
            workArea: held.data['workArea'],
            startedFor: held.data['startedFor'],
            startedByRun: held.data['startedByRun'],
          },
          participantForActor(actor),
        )
        // AND EVERY PAGE IS TOLD, WHEN SOMETHING THE REGISTRY MIRRORS REALLY MOVED. The names come from
        // the registry, and a retirement, a new starter or a new role also moves the row to another
        // contact group, so the contacts are named too when one of those moved.
        const was = (before.data ?? {}) as Record<string, unknown>
        // ONLY WHAT THE CHAT DRAWS OR PLACES BY: the name, the handle, a retirement, the starter and the
        // role. Agents write their own records often, and a page reading the registry for a field it
        // does not draw is the cost this change exists to remove.
        const mirrored = (data: Record<string, unknown>, title: string): string =>
          JSON.stringify([title, ...['handle', 'retiredBecause', 'startedBy', 'role'].map((field) => data[field] ?? null)])
        const placing = (data: Record<string, unknown>): string =>
          JSON.stringify(['retiredBecause', 'startedBy', 'role'].map((field) => data[field] ?? null))
        if (mirrored(was, before.title) !== mirrored(held.data, held.title)) {
          announce({
            name: 'list.changed',
            workspaceId: before.workspaceId,
            lists: placing(was) === placing(held.data) ? ['participants'] : ['participants', 'contacts'],
            about: null,
            groupId: null,
            participant: ((registered) => (registered === null ? null : { kind: 'agent' as const, id: registered.id }))(agentForRecord(held.id)),
            because: `The agent record "${held.title}" was changed, so the registry of agents changed.`,
          })
        }
      }
    }
    // `update` with no note unless the caller said otherwise — see `LedgerLabel` for the one that does. A run key
    // writing another run of its agent adds the one line for that pair here.
    const newSeq = saveRevision(id, ledger?.op ?? 'update', actor, ledgerNote, undefined,
      (patch as Partial<OriginalRunKeyMintPatch>)[ORIGINAL_RUN_KEY_MINT_AT], startersKey)
    // AND THE ADDED ROLES ARE READ AGAIN ONCE THIS IS STORED, as on a create.
    if (before.kind === ROLE_CARD_WORDS_KIND || nextKind === ROLE_CARD_WORDS_KIND) readTheAddedCardsAgainWhenStored()
    // AND EVERY OPEN PAGE IS TOLD WHEN A REQUEST THAT WAITS FOR THE PERSON CHANGED, as on a create: an answer or a
    // withdrawal takes it off Needs you.
    if (before.kind === 'role_request' || nextKind === 'role_request') tellThePagesWhenARequestWaitsForThePerson(before, getRecord(id) ?? before)
    // Keep the end before the office's separate, guarded mark write keeps its revision.
    if (laterLook !== null) writeTheEndedRunLookMark(id, laterLook.endedAt, { type: 'system', id: moleOffice().id })
    // AND HOW THE ROUND ENDED, when this write ended a sandbox round without a seal. In this
    // transaction, so the account can be queued for this ending revision after the write commits.
    if (nextKind === 'session') recordHowARoundEndedWithoutASeal(id, (before.data ?? {}) as Record<string, unknown>, newSeq)
    // AND A NOTE THIS WRITE MADE WAIT FOR THE PERSON IS SAID TO WHOEVER WROTE IT DOWN, as on a create.
    if ((kindChange?.to ?? before.kind) === 'note') {
      const now = getRecord(id)
      if (now !== null && !waitsForThePerson(toRecord(before)) && waitsForThePerson(now)) tellTheWriterOfTheNote(now, { is: 'waits' })
    }
    // AND A DAILY OBLIGATION THIS WRITE LEAVES FULFILLED HAS ITS NEXT DAY WRITTEN, in this transaction (lib/daily-obligations.ts).
    if (nextKind === 'obligation') writeTheNextDayOfADailyObligation(id)
    return { newSeq }
  })
  const touchesMainSuiteFix = (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, "mainSuiteFix")) || (patch.data !== undefined && (before.data as Record<string, unknown>)["mainSuiteFix"] !== undefined)
  const written = touchesMainSuiteFix ? writeTransaction.immediate() : writeTransaction()

  const after = getRecord(id)
  if (!after) throw new PanelError('The update did not take effect', 500)
  // A RUN'S RECORD CHANGED: who is answering as the agent it served or serves may have changed (lib/answering-told.ts).
  if (before.kind === 'session' || after.kind === 'session') answeringOfTheAgentsTheseRunsServeMayHaveChanged(before.data, after.data)
  return {
    record: after,
    newSeq: written.newSeq,
    ...(territoryChanged ? { territoryChanged: true as const } : {}),
    dataPatch: merged?.outcome ?? null,
    ...(emptied === null ? {} : { emptied }),
    incomplete: incompletenessOf(after),
    ...(kindChange === null ? {} : { kindChange }),
    ...(flowRunFiled === null ? {} : { flowRun: flowRunFiled }),
    ...(flowRunStepsNotWritten === null ? {} : { flowRunStepsNotWritten }),
    ...(sealsTheRun ? { sealsTheRun: true as const } : {}),
    ...(keyReminder === null ? {} : { keyReminder }),
    ...(runKeyReminder === null ? {} : { runKeyReminder }),
  }
}

/**
 * The retire and broadcast schedule writers change no starter, so neither mirrors a stale record value onto the row.
 * A record that names none leaves the row's starter as it is (`keepTheAgentRegistryInStep`).
 */
function theStarterTheRegistryFollows(startedBy: unknown): unknown {
  return theRetireDoorIsOpen > 0 || theBroadcastScheduleWriteIsOpen > 0 ? undefined : startedBy
}

/** The door that changes who started an agent, by the person's press on the agent's page (lib/agent-starter.ts). */
export const THE_STARTER_DOOR = 'POST /api/agents/<id>/starter'

/**
 * NOBODY MOVES AN AGENT'S STARTER BY A RECORD WRITE, NOT EVEN THE PERSON.
 *
 * The starter answers for an agent: who may give it keys, where its letters and seal notices go, and who writes its
 * next round. `keepTheAgentRegistryInStep` copies a new `startedBy` from the agent record onto the registry row, so a
 * record write that any agent could send moved any agent's starter. A write that would move the row is refused, from
 * the person and from one who holds the person's authority in a test world as well. The starter door moves it: it checks the
 * change, keeps it with its reason and tells the agent and both starters, and a record write did none of that.
 *
 * THE DOOR WRITES THE ROW FIRST and then each of the agent's records, so its record writes carry the starter the row
 * already holds and are not refused here.
 *
 * THE QUESTION IS THE ROW'S, NOT THE RECORD'S OLD VALUE. A registration in a second project under a live agent's handle
 * writes its own caller as the new record's starter and leaves the row alone, so that record can hold a starter its row
 * does not. The next write of it would move the row although it leaves the field as it was. So this asks
 * `theStarterAWriteWouldGive`, the reading the registry moves by, and a write carrying the starter the row already
 * holds is not a change.
 *
 * THE RETIRE DOOR AND THE BROADCAST SCHEDULE WRITER LEAVE THE STARTER ALONE. Their writes must work on a record that
 * names an older starter. The registry does not follow that value under either writer, and only a write that leaves
 * the record's `startedBy` as it was is let through here.
 */
function checkNobodyIsMovingAStarter(next: unknown, before: unknown, recordId: string, actor: Actor): void {
  if (!isJsonObject(next)) return
  if ((theRetireDoorIsOpen > 0 || theBroadcastScheduleWriteIsOpen > 0) && JSON.stringify(next['startedBy']) === JSON.stringify(isJsonObject(before) ? before['startedBy'] : undefined)) return
  const moved = theStarterAWriteWouldGive(recordId, next['startedBy'])
  if (moved === null) return
  throw new PanelError(
    `"startedBy" on an agent record says who answers for the agent, and no record write changes it. This write would make ` +
      `${participantWord(moved.to.kind)} "${moved.to.id}" the agent's starter, and its registry row says ` +
      `${moved.from === null ? 'nobody' : `${participantWord(moved.from.kind)} "${moved.from.id}"`}. The person changes a starter by a ` +
      `press on the agent's page, ${THE_STARTER_DOOR}. ` +
      (moved.from === null ? '' : 'To write this record and leave the starter alone, send "startedBy" as the registry row holds it. ') +
      `This request was made by "${actor.id}". Nothing was written.`,
    403,
  )
}

/**
 * WHAT A RECORD HELD AS AN AGENT'S OWN BEFORE A WRITE, or undefined because it held nothing an agent holds.
 *
 * The guards on a card, a grant, a credential, a start folder and broadcast times let a write that leaves the field
 * as it was. "As it was" means as the AGENT held it. A record of another kind held nothing of an agent's: its `extra`
 * was written with none of these guards, so a field a change of kind brings into an agent is a new one. A record of
 * kind agent that no registry row maps held nothing either, because nothing reads it until a handle write maps it, and
 * that write is the one that puts its fields on an agent.
 */
function whatTheAgentHeldBefore(recordId: string, kindBefore: RecordKind, dataBefore: unknown): unknown {
  if (kindBefore !== AGENT_KIND) return undefined
  return agentForRecord(recordId) === null ? undefined : dataBefore
}

/** One edge of a plan, as the guard reads it off stored data. Unusable rows are ignored. */
interface StoredPlanEdge {
  from: string
  to: string
  carries: string
}

function edgesIn(data: unknown): StoredPlanEdge[] {
  const raw = (data as { edges?: unknown } | null)?.edges
  if (!Array.isArray(raw)) return []
  const out: StoredPlanEdge[] = []
  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue
    const from = (row as { from?: unknown }).from
    const to = (row as { to?: unknown }).to
    if (typeof from !== 'string' || typeof to !== 'string') continue
    const carries = (row as { carries?: unknown }).carries
    out.push({ from, to, carries: typeof carries === 'string' ? carries : '' })
  }
  return out
}

function textIn(data: unknown, key: string): string {
  const raw = (data as Record<string, unknown> | null)?.[key]
  return typeof raw === 'string' ? raw : ''
}

function pausedWhyIn(data: unknown): string {
  const paused = (data as { paused?: unknown } | null)?.paused
  if (typeof paused !== 'object' || paused === null) return ''
  const why = (paused as { why?: unknown }).why
  return typeof why === 'string' ? why : ''
}

function isPausedIn(data: unknown): boolean {
  const paused = (data as { paused?: unknown } | null)?.paused
  return paused !== undefined && paused !== null
}

/**
 * WHETHER ANYTHING HAS ANSWERED THIS PLANNED STATE — read from links, stored nowhere.
 *
 * A planned state has no `state` field and is not getting one, for the reason a `direction` has
 * none: a stored answer to *has this happened* is a second truth beside the links, and the two go
 * out of step. So this is a query, every time it is asked.
 */
export function plannedStateIsAnswered(plannedStateId: string): boolean {
  return (
    db
      .select({ id: links.id })
      .from(links)
      .where(and(eq(links.toId, plannedStateId), inArray(links.type, ['realises', 'instead_of'])))
      .all().length > 0
  )
}

/**
 * EVERY ACT A WRITE WOULD PERFORM ON AN INTENDED RECORD, worked out from what is stored against
 * what the write would leave.
 *
 * ASKED OF THE MERGED RECORD, NEVER OF THE PATCH KEYS. `restoreRevision` is a patch underneath, so
 * a put-back that reintroduces a `paused` block has to be caught by the same guard; asking *what
 * will this record hold afterwards* catches both doors and asking *which keys did the request
 * name* catches one. It is also why put-back is not an act of its own: it is a patch, and the patch
 * guard sees it.
 */
export function futureActsIn(
  before: { id: string; kind: string; data: unknown },
  after: { title?: string; data: unknown },
  beforeTitle: string,
): FutureAct[] {
  if (!isPlanned(before.kind)) return []
  const acts: FutureAct[] = []

  // SET ASIDE AND UN-SET ASIDE. Both directions, because parking somebody's plan and un-parking
  // one they parked are each a decision about what the project is doing.
  const wasPaused = isPausedIn(before.data)
  const willBePaused = isPausedIn(after.data)
  if (!wasPaused && willBePaused) acts.push('set-aside')
  if (wasPaused && !willBePaused) acts.push('un-set-aside')

  // SHORTEN. A LIVE planned state dropped out of the order. Adding and reordering are not acts.
  const heldBefore = planIdsIn(before.data)
  const heldAfter = new Set(planIdsIn(after.data))
  const dropped = heldBefore.filter((id) => !heldAfter.has(id))
  if (dropped.length > 0) {
    // IN PIECES (src/server/db/in-pieces.ts): `dropped` comes from a planned future's stored order, which a request may
    // make as long as it likes; only whether any row comes back is asked, so the joined pieces answer it as one statement.
    const live = readInPieces(dropped, (piece) =>
      db
        .select({ id: records.id })
        .from(records)
        .where(and(inArray(records.id, piece), isNull(records.deletedAt)))
        .all(),
    )
    if (live.length > 0) acts.push('shorten')
  }

  // UNWIRE. The half `shorten` never covered: an agent could send {"dataPatch":{"edges":[]}} and
  // delete the whole planned structure with every state still alive and every title as written.
  // Adding an edge is still allowed; only taking one away, moving an end, or emptying a `carries`
  // that was not empty is refused.
  const wiredBefore = edgesIn(before.data)
  const pairAfter = new Map(edgesIn(after.data).map((e) => [`${e.from} ${e.to}`, e]))
  for (const edge of wiredBefore) {
    const still = pairAfter.get(`${edge.from} ${edge.to}`)
    if (still === undefined || (edge.carries !== '' && still.carries === '')) {
      acts.push('unwire')
      break
    }
  }

  // REWORD an ANSWERED planned state. Wording one nothing has answered yet is ordinary work, and
  // it is what an agent is for.
  if (before.kind === 'planned_state') {
    const titleMoved = after.title !== undefined && after.title !== beforeTitle
    const whatMoved = textIn(before.data, 'what') !== textIn(after.data, 'what')
    if ((titleMoved || whatMoved) && plannedStateIsAnswered(before.id)) acts.push('reword')
  }

  // THE TENTH ACT. Authored text about WHY, on either kind: `data.because`, and the `why` inside a
  // `paused` block. Writing one where there is none is allowed — that is an agent adding. Changing
  // or emptying one somebody wrote is not.
  const becauseBefore = textIn(before.data, 'because')
  const whyBefore = pausedWhyIn(before.data)
  if (
    (becauseBefore !== '' && textIn(after.data, 'because') !== becauseBefore) ||
    (whyBefore !== '' && pausedWhyIn(after.data) !== whyBefore)
  ) {
    acts.push('because')
  }

  // THE ELEVENTH ACT. The `what` of a goal that was confirmed BEFORE this write. `goalIsConfirmed`
  // is the one reading of confirmed: a goal with no `filed_by` was filed by the person. A goal an
  // agent filed and the person has not confirmed changes as any other record does.
  if (
    before.kind === GOAL_KIND &&
    goalIsConfirmed({ id: before.id, kind: before.kind, title: beforeTitle, data: before.data as Record<string, unknown> }) &&
    textIn(after.data, 'what') !== textIn(before.data, 'what')
  ) {
    acts.push('goal-what')
  }

  return acts
}
