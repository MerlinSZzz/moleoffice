// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sayInEnglish } from '@shared/i18n.ts'
/**
 * EVERY KIND OF NOTICE MOLE OFFICE AND THE INSPECTOR WRITE, AND WHETHER IT WAKES ITS READER.
 *
 * A message that does not need its reader is not pushed to them as it arrives; it is there when they
 * look, on problem 2-AtvZiEfVO9. From 5 October
 * 00:00 to 6 October 08:30, 785 of the 1055 messages that reached the secretary were the office's and the
 * inspector's own notices, and its waiter handed over 904 times. Each hand-over makes a session read
 * its whole context again.
 *
 * THIS IS THE ONE PLACE THAT SAYS THE OFFICE DEFAULT. Personal notice rules may hold a notice
 * that this table would wake for one recipient; lib/notice-rules.ts applies that stored choice, and the list a secretary
 * has until it saves its own. Each notice carries its kind as `data.notice`, written by the
 * code that writes the notice. The waiting door (src/server/api/handles.ts) and the message worker
 * (`keptForTheSession` in ./worker.ts) both ask `whyThisWakesNoWaiter` below. A notice that wakes nobody
 * is not lost: it stays queued, the inbox shows it, and the waiting door hands it over beside the next
 * message that does wake.
 *
 * A PERSON'S MESSAGE ALWAYS WAKES, AND SO DOES EVERY AGENT'S. Only a notice the office or an inspector
 * wrote can be quiet, and only when its row below says so. A message with no kind wakes, as every
 * message did before this table.
 *
 * WHAT DECIDES A ROW: does the notice ask its reader to do something? A bounce asks the wave's starter
 * to act; "merged" asks the queue's owner to push and start the next round; "your session has
 * finished" asks nothing. The condition of 6 October 2026 (message YKET_0A7WEJs): a release, a
 * refusal, a landing and a bounce all wake, because a release asks for a confirmation before the
 * run's clone is cleared (problem JCSXirDhnzaE).
 *
 * ONE NOTICE CARRIES NO KIND ON PURPOSE: tools/the-inspector.mjs tells the worker and its starter when the
 * verdict door refused a check's verdict. It must wake, and a message without a kind wakes, so it is not
 * marked; a mark could only add a way for that message to be refused and never sent.
 *
 * THE LINES IN `SYSTEM_LINES` ARE KEYED BY THEIR OWN NAMES (src/shared/groups.ts), so the type below
 * makes a new line with no row here fail the type check, and
 * tests/every-office-notice-says-whether-it-wakes.test.ts fails as well.
 */

import { isMoleOffice, type ParticipantRef } from '@shared/participants.ts'
import type { SystemLineKind } from '@shared/groups.ts'
import { THE_INSPECTOR } from '@shared/roles.ts'
import { theRoleOnTheAgentRow } from '../db/the-role-on-the-agent-row.ts'
import { PanelError } from './panel-error.ts'

/** The notices written outside `SYSTEM_LINES`: through `writeAMessage` in ./inspection.ts, or straight into a record. */
export type AnotherNoticeKind =
  | 'storageCapacity'
  | 'aQueuedEntryConflicts'
  | 'migrationsWereRenumbered'
  | 'anEntryLanded'
  | 'anEntryBouncedForTheSecretary'
  | 'aLandingStalled'
  | 'anEntryWasWithdrawn'
  | 'anEntryWasSuperseded'
  | 'anEntryEndedInAnotherState'
  | 'anEntryBounced'
  | 'confirmTheDeletes'
  | 'pressToLand'
  | 'anEntryWaitsOnACheckAgain'
  | 'anEntryWaitsForRoom'
  | 'redOnMain'
  | 'aTestChangedItsAnswer'
  | 'handedBack'
  | 'landedWithAWideRed'
  | 'takeBackNeedsAPerson'
  | 'aPushHandBackIsOverdue'
  | 'aSealWasNotQueued'
  | 'takenBack'
  | 'askedToResolve'
  | 'aResolutionWasRefused'
  | 'released'
  | 'checkedAndReleased'
  | 'releasedAndTheStarterIsTold'
  | 'releasedToOneThatReadsTheCheck'
  | 'refused'
  | 'aRefusalForTheStarter'
  | 'aRunWasClosed'
  | 'noInspectorCheckItYourself'
  | 'aCheckWasQueued'
  | 'aResealAsksForACheck'
  | 'noInspectorTellTheSecretary'
  | 'theCheckStarted'
  | 'theCheckEnded'
  | 'theCheckFailed'
  | 'aCheckWaitsItsTurn'
  | 'aNoVerdictProblemWasFiled'
  | 'aNewKeyIsAskedFor'
  | 'lettersForRetiredAgents'
  | 'theOfficeStartedNoCheck'
  | 'packageTaken'
  | 'packageAligned'
  | 'packageAlignAnswered'
  | 'packageHandedBack'
  | 'packageAccepted'
  | 'packageReturned'

/** Every kind of notice: its name, as stored in a message's `data.notice`. */
export type NoticeKind = SystemLineKind | AnotherNoticeKind

/** One row: whether the notice wakes its reader, and why, in a sentence. */
export interface ANotice {
  wakes: boolean
  because: string
}

const WAKES = (because: () => string): ANotice => ({ wakes: true, get because() { return because() } })
const QUIET = (because: () => string): ANotice => ({ wakes: false, get because() { return because() } })

/** THE TABLE. One row for every kind of notice. */
export const NOTICES: { readonly [K in NoticeKind]: ANotice } = {
  storageCapacity: QUIET(() => sayInEnglish('noticeWords.storageCapacity')),
  stableUpgradeNotice: QUIET(() => sayInEnglish('noticeWords.stableUpgradeNotice')),
  // ---------------------------------------------------------------- the lines in SYSTEM_LINES
  groupOpened: QUIET(() => sayInEnglish('noticeWords.groupOpened')),
  memberAdded: QUIET(() => sayInEnglish('noticeWords.memberAdded')),
  memberLeft: QUIET(() => sayInEnglish('noticeWords.memberLeft')),
  theOverlapEnded: QUIET(() => sayInEnglish('noticeWords.theOverlapEnded')),
  claimsInConflict: WAKES(() => sayInEnglish('noticeWords.claimsInConflict')),
  territoriesInConflict: WAKES(() => sayInEnglish('noticeWords.territoriesInConflict')),
  workAreasInConflict: WAKES(() => sayInEnglish('noticeWords.workAreasInConflict')),
  deadLetterSweep: WAKES(() => sayInEnglish('noticeWords.deadLetterSweep')),
  branchedFromAnother: QUIET(() => sayInEnglish('noticeWords.branchedFromAnother')),
  agentsAreWaitingForAPerson: QUIET(() => sayInEnglish('noticeWords.agentsAreWaitingForAPerson')),
  resourcesLeftOpen: WAKES(() => sayInEnglish('noticeWords.resourcesLeftOpen')),
  aChildSessionFinished: QUIET(() => sayInEnglish('noticeWords.aChildSessionFinished')),
  aCheckWasStopped: WAKES(() => sayInEnglish('noticeWords.aCheckWasStopped')),
  aHostJobEnded: WAKES(() => sayInEnglish('noticeWords.aHostJobEnded')),
  aCapStoppedARun: QUIET(() => sayInEnglish('noticeWords.aCapStoppedARun')),
  theCapStoppedForYou: WAKES(() => sayInEnglish('noticeWords.theCapStoppedForYou')),
  aRunWaitedAndEnded: QUIET(() => sayInEnglish('noticeWords.aRunWaitedAndEnded')),
  aKeptConversationWaitedAndEnded: QUIET(() => sayInEnglish('noticeWords.aKeptConversationWaitedAndEnded')),
  aRunAnswered: QUIET(() => sayInEnglish('noticeWords.aRunAnswered')),
  aRunPickedUpItsConversation: QUIET(() => sayInEnglish('noticeWords.aRunPickedUpItsConversation')),
  aRestartCutARunOff: WAKES(() => sayInEnglish('noticeWords.aRestartCutARunOff')),
  youHaveBeenIdle: QUIET(() => sayInEnglish('noticeWords.youHaveBeenIdle')),
  theBroadcastIsDue: WAKES(() => sayInEnglish('noticeWords.theBroadcastIsDue')),
  theBroadcastReportIsMissing: WAKES(() => sayInEnglish('noticeWords.theBroadcastReportIsMissing')),
  theBroadcastsArePaused: QUIET(() => sayInEnglish('noticeWords.theBroadcastsArePaused')),
  tooManyInTheMainWorld: WAKES(() => sayInEnglish('noticeWords.tooManyInTheMainWorld')),
  theOfficeLoadIsOutOfRange: WAKES(() => sayInEnglish('noticeWords.theOfficeLoadIsOutOfRange')),
  youHoldACard: WAKES(() => sayInEnglish('noticeWords.youHoldACard')),
  handbooksForAFlowStart: WAKES(() => sayInEnglish('noticeWords.handbooksForAFlowStart')),
  aRunWasSealed: QUIET(() => sayInEnglish('noticeWords.aRunWasSealed')),
  theExpectedTimeHasArrived: QUIET(() => sayInEnglish('noticeWords.theExpectedTimeHasArrived')),
  twiceTheExpectedTime: WAKES(() => sayInEnglish('noticeWords.twiceTheExpectedTime')),
  aStepReminder: QUIET(() => sayInEnglish('noticeWords.aStepReminder')),
  aDraftIsNotSent: WAKES(() => sayInEnglish('noticeWords.aDraftIsNotSent')),
  aPersonWaitsForAReply: WAKES(() => sayInEnglish('noticeWords.aPersonWaitsForAReply')),
  aNotebookHasNotChanged: WAKES(() => sayInEnglish('noticeWords.aNotebookHasNotChanged')),
  modulesHaveNotChanged: WAKES(() => sayInEnglish('noticeWords.modulesHaveNotChanged')),
  beforeTheSeal: QUIET(() => sayInEnglish('noticeWords.beforeTheSeal')),
  aRoundEndedWithoutASeal: WAKES(() => sayInEnglish('noticeWords.aRoundEndedWithoutASeal')),
  theCheckIsHeld: WAKES(() => sayInEnglish('noticeWords.theCheckIsHeld')),
  aNextRoundDidNotStart: WAKES(() => sayInEnglish('noticeWords.aNextRoundDidNotStart')),
  aWorkerDidNotStart: WAKES(() => sayInEnglish('noticeWords.aWorkerDidNotStart')),
  aRunEndedWithItsReport: WAKES(() => sayInEnglish('noticeWords.aRunEndedWithItsReport')),
  codexAnsweredAtCapacity: WAKES(() => sayInEnglish('noticeWords.codexAnsweredAtCapacity')),
  codexMetAUsageLimit: WAKES(() => sayInEnglish('noticeWords.codexMetAUsageLimit')),
  aRunWaitsLongOnALimit: WAKES(() => sayInEnglish('noticeWords.aRunWaitsLongOnALimit')),
  aSandboxRunHasRunLong: WAKES(() => sayInEnglish('noticeWords.aSandboxRunHasRunLong')),
  flowsHaveNotChanged: WAKES(() => sayInEnglish('noticeWords.flowsHaveNotChanged')),
  keyFilesLeftInASandbox: WAKES(() => sayInEnglish('noticeWords.keyFilesLeftInASandbox')),
  aCredentialWasUsedWithOtherFacts: WAKES(() => sayInEnglish('noticeWords.aCredentialWasUsedWithOtherFacts')),
  youAreRaised: WAKES(() => sayInEnglish('noticeWords.youAreRaised')),
  yourRaiseEnded: QUIET(() => sayInEnglish('noticeWords.yourRaiseEnded')),
  aSettingChangedFromAnotherComputer: QUIET(() => sayInEnglish('noticeWords.aSettingChangedFromAnotherComputer')),
  aTerminalUsedFromAnotherComputer: QUIET(() => sayInEnglish('noticeWords.aTerminalUsedFromAnotherComputer')),
  aSettingChangedForHim: QUIET(() => sayInEnglish('noticeWords.aSettingChangedForHim')),
  aSecretaryAddedAProvider: QUIET(() => sayInEnglish('noticeWords.aSecretaryAddedAProvider')),
  aSecretaryChangedAProvider: QUIET(() => sayInEnglish('noticeWords.aSecretaryChangedAProvider')),
  anActWasMadeFromAnotherComputer: QUIET(() => sayInEnglish('noticeWords.anActWasMadeFromAnotherComputer')),
  agentsInTerminalsAfterTheHolderRestarted: WAKES(() => sayInEnglish('noticeWords.agentsInTerminalsAfterTheHolderRestarted')),
  theRunsAStopCauseStopped: WAKES(() => sayInEnglish('noticeWords.theRunsAStopCauseStopped')),
  packageTakenOutside: WAKES(() => sayInEnglish('noticeWords.packageTakenOutside')),
  aClaimTookThePackage: WAKES(() => sayInEnglish('noticeWords.aClaimTookThePackage')),
  aChecklistItemIsDue: WAKES(() => sayInEnglish('noticeWords.aChecklistItemIsDue')),
  thePersonMarkedAnItemDone: WAKES(() => sayInEnglish('noticeWords.thePersonMarkedAnItemDone')),
  addedToYourChecklist: QUIET(() => sayInEnglish('noticeWords.addedToYourChecklist')),
  changedOnYourChecklist: QUIET(() => sayInEnglish('noticeWords.changedOnYourChecklist')),
  markedDoneOnAChecklist: QUIET(() => sayInEnglish('noticeWords.markedDoneOnAChecklist')),
  removedFromYourChecklist: QUIET(() => sayInEnglish('noticeWords.removedFromYourChecklist')),
  aChecklistWasMadeForYou: QUIET(() => sayInEnglish('noticeWords.aChecklistWasMadeForYou')),
  questionThePlan: WAKES(() => sayInEnglish('noticeWords.questionThePlan')),
  aBookingsGoOverTheCard: QUIET(() => sayInEnglish('noticeWords.aBookingsGoOverTheCard')),
  aBookingGoesFirstNow: WAKES(() => sayInEnglish('noticeWords.aBookingGoesFirstNow')),
  aGoFirstIsAsked: WAKES(() => sayInEnglish('noticeWords.aGoFirstIsAsked')),
  aGoFirstWasAnswered: WAKES(() => sayInEnglish('noticeWords.aGoFirstWasAnswered')),
  aBookingRunsOver: WAKES(() => sayInEnglish('noticeWords.aBookingRunsOver')),
  aBookingBeforeYoursRunsOver: WAKES(() => sayInEnglish('noticeWords.aBookingBeforeYoursRunsOver')),
  aJobWithoutABookingSharesTheCard: QUIET(() => sayInEnglish('noticeWords.aJobWithoutABookingSharesTheCard')),
  aJobWithoutABookingLeavesNoRoom: WAKES(() => sayInEnglish('noticeWords.aJobWithoutABookingLeavesNoRoom')),
  aCounterFired: WAKES(() => sayInEnglish('noticeWords.aCounterFired')),
  youAreAPermanentResident: WAKES(() => sayInEnglish('noticeWords.youAreAPermanentResident')),
  aRenameWaitsForYou: WAKES(() => sayInEnglish('noticeWords.aRenameWaitsForYou')),
  yourSleepTimeHasBegun: WAKES(() => sayInEnglish('noticeWords.yourSleepTimeHasBegun')),
  theOwnerOfAnAgentChanged: WAKES(() => sayInEnglish('noticeWords.theOwnerOfAnAgentChanged')),
  theStarterOfAnAgentChanged: WAKES(() => sayInEnglish('noticeWords.theStarterOfAnAgentChanged')),
  oldDeadLetterLinesFolded: QUIET(() => sayInEnglish('noticeWords.oldDeadLetterLinesFolded')),
  theGovernsCheckFoundWork: WAKES(() => sayInEnglish('noticeWords.theGovernsCheckFoundWork')),
  aMessageBackAsYouAsked: WAKES(() => sayInEnglish('noticeWords.aMessageBackAsYouAsked')),
  aMessageBackAsTheSecretarySetIt: WAKES(() => sayInEnglish('noticeWords.aMessageBackAsTheSecretarySetIt')),
  theIntentMarkWasBroken: WAKES(() => sayInEnglish('noticeWords.theIntentMarkWasBroken')),
  aNoteForThePerson: QUIET(
    () => sayInEnglish('noticeWords.aNoteForThePerson'),
  ),
  theLoginsWeekIsPartUsed: WAKES(() => sayInEnglish('noticeWords.theLoginsWeekIsPartUsed')),
  checksAreHeldForALimit: QUIET(() => sayInEnglish('noticeWords.checksAreHeldForALimit')),
  aCheckGaveNoVerdictTwice: QUIET(() => sayInEnglish('noticeWords.aCheckGaveNoVerdictTwice')),
  checksGoOnAfterALimit: QUIET(() => sayInEnglish('noticeWords.checksGoOnAfterALimit')),
  // ---------------------------------------------------------------- the merge queue
  aQueuedEntryConflicts: WAKES(() => sayInEnglish('noticeWords.aQueuedEntryConflicts')),
  migrationsWereRenumbered: QUIET(() => sayInEnglish('noticeWords.migrationsWereRenumbered')),
  anEntryLanded: WAKES(() => sayInEnglish('noticeWords.anEntryLanded')),
  anEntryBouncedForTheSecretary: WAKES(() => sayInEnglish('noticeWords.anEntryBouncedForTheSecretary')),
  aLandingStalled: WAKES(() => sayInEnglish('noticeWords.aLandingStalled')),
  anEntryWasWithdrawn: QUIET(() => sayInEnglish('noticeWords.anEntryWasWithdrawn')),
  anEntryWasSuperseded: WAKES(() => sayInEnglish('noticeWords.anEntryWasSuperseded')),
  anEntryEndedInAnotherState: WAKES(() => sayInEnglish('noticeWords.anEntryEndedInAnotherState')),
  anEntryBounced: WAKES(() => sayInEnglish('noticeWords.anEntryBounced')),
  confirmTheDeletes: WAKES(() => sayInEnglish('noticeWords.confirmTheDeletes')),
  pressToLand: WAKES(() => sayInEnglish('noticeWords.pressToLand')),
  anEntryWaitsOnACheckAgain: WAKES(() => sayInEnglish('noticeWords.anEntryWaitsOnACheckAgain')),
  anEntryWaitsForRoom: QUIET(() => sayInEnglish('noticeWords.anEntryWaitsForRoom')),
  takeBackNeedsAPerson: WAKES(() => sayInEnglish('noticeWords.takeBackNeedsAPerson')),
  aPushHandBackIsOverdue: WAKES(() => sayInEnglish('noticeWords.aPushHandBackIsOverdue')),
  aSealWasNotQueued: WAKES(() => sayInEnglish('noticeWords.aSealWasNotQueued')),
  takenBack: WAKES(() => sayInEnglish('noticeWords.takenBack')),
  landedWithAWideRed: WAKES(() => sayInEnglish('noticeWords.landedWithAWideRed')),
  handedBack: WAKES(() => sayInEnglish('noticeWords.handedBack')),
  redOnMain: WAKES(() => sayInEnglish('noticeWords.redOnMain')),
  aTestChangedItsAnswer: WAKES(() => sayInEnglish('noticeWords.aTestChangedItsAnswer')),
  askedToResolve: WAKES(() => sayInEnglish('noticeWords.askedToResolve')),
  aResolutionWasRefused: WAKES(() => sayInEnglish('noticeWords.aResolutionWasRefused')),
  // ---------------------------------------------------------------- the check
  released: WAKES(() => sayInEnglish('noticeWords.released')),
  checkedAndReleased: WAKES(() => sayInEnglish('noticeWords.checkedAndReleased')),
  releasedAndTheStarterIsTold: QUIET(() => sayInEnglish('noticeWords.releasedAndTheStarterIsTold')),
  releasedToOneThatReadsTheCheck: QUIET(() => sayInEnglish('noticeWords.releasedToOneThatReadsTheCheck')),
  refused: WAKES(() => sayInEnglish('noticeWords.refused')),
  aRefusalForTheStarter: WAKES(() => sayInEnglish('noticeWords.aRefusalForTheStarter')),
  aRunWasClosed: QUIET(() => sayInEnglish('noticeWords.aRunWasClosed')),
  noInspectorCheckItYourself: WAKES(() => sayInEnglish('noticeWords.noInspectorCheckItYourself')),
  aCheckWasQueued: QUIET(() => sayInEnglish('noticeWords.aCheckWasQueued')),
  aResealAsksForACheck: WAKES(() => sayInEnglish('noticeWords.aResealAsksForACheck')),
  noInspectorTellTheSecretary: WAKES(() => sayInEnglish('noticeWords.noInspectorTellTheSecretary')),
  theCheckStarted: QUIET(() => sayInEnglish('noticeWords.theCheckStarted')),
  theCheckEnded: QUIET(() => sayInEnglish('noticeWords.theCheckEnded')),
  theCheckFailed: WAKES(() => sayInEnglish('noticeWords.theCheckFailed')),
  aCheckWaitsItsTurn: QUIET(() => sayInEnglish('noticeWords.aCheckWaitsItsTurn')),
  aNoVerdictProblemWasFiled: WAKES(() => sayInEnglish('noticeWords.aNoVerdictProblemWasFiled')),
  // ---------------------------------------------------------------- keys and letters
  aNewKeyIsAskedFor: WAKES(() => sayInEnglish('noticeWords.aNewKeyIsAskedFor')),
  lettersForRetiredAgents: WAKES(() => sayInEnglish('noticeWords.lettersForRetiredAgents')),
  theOfficeStartedNoCheck: WAKES(() => sayInEnglish('noticeWords.theOfficeStartedNoCheck')),
  // ---------------------------------------------------------------- inside packages
  packageTaken: WAKES(() => sayInEnglish('noticeWords.packageTaken')),
  packageAligned: WAKES(() => sayInEnglish('noticeWords.packageAligned')),
  packageAlignAnswered: WAKES(() => sayInEnglish('noticeWords.packageAlignAnswered')),
  packageHandedBack: WAKES(() => sayInEnglish('noticeWords.packageHandedBack')),
  packageAccepted: WAKES(() => sayInEnglish('noticeWords.packageAccepted')),
  packageReturned: WAKES(() => sayInEnglish('noticeWords.packageReturned')),
}

/**
 * ROWS WRITTEN BEFORE THE CODE THAT WRITES THEIR KIND, each with the wave whose round writes it. The kind was
 * agreed with that wave by message (wave 13y, round 9, message uFwR6-TEwZgb), so the wave writes its kind and leaves
 * this file alone. A new line in `SYSTEM_LINES` is not awaited here: the type above makes its own branch add its
 * row, so a second row here would be the same key twice. tests/every-office-notice-says-whether-it-wakes.test.ts
 * lets these rows stand while nothing writes them yet, and once the wave has landed the kind may come off this list.
 */
export const AWAITED: { readonly [K in NoticeKind]?: string } = {}

/** Whether a string names a kind of notice in the table. */
export function isANoticeKind(kind: unknown): kind is NoticeKind {
  return typeof kind === 'string' && Object.hasOwn(NOTICES, kind)
}

/**
 * Whether a registered inspector is this sender. A row with no role reads as a worker, so it is not one.
 *
 * ONLY THE ROLE IS READ, through `theRoleOnTheAgentRow` (wave 13y round 48): the same row, from the same
 * kept statement and the same reader of the role column the card readers use. Building the whole
 * participant ran the statement for the agent record's runtime as well, and one queue ask on a made-up
 * office asked this 8,319 times.
 *
 * ONE DIFFERENCE, CHOSEN AND WRITTEN DOWN. Building the whole participant parses the row's two picture
 * columns, `pixel_appearance` and `pixel_scale`, and throws on a broken one. This reads neither, so a
 * broken picture column no longer makes this check throw. The card readers have read the role this way
 * since round 44.
 */
export function isAnInspector(sentBy: ParticipantRef | null): boolean {
  if (sentBy === null || sentBy.kind !== 'agent') return false
  return theRoleOnTheAgentRow(sentBy.id).role === THE_INSPECTOR
}

/**
 * KINDS THE OFFICE NO LONGER WRITES THAT WERE QUIET WHILE IT DID.
 *
 * A kind leaves `NOTICES` when nothing writes it any more, so a new message of that kind is refused. Its stored rows
 * are not rewritten, and one of them must not start waking a waiter because its kind was retired. So a kind that was
 * QUIET when it left the table is listed here, and `whyThisWakesNoWaiter` keeps its stored rows quiet. A kind that
 * woke needs no entry, because a kind the table does not hold wakes.
 */
const RETIRED_QUIET_KINDS: ReadonlySet<string> = new Set([
  // "Read as a checklist item", replaced by the five lines of `THE_CHECKLIST_LINES` in src/shared/groups.ts.
  'theOfficeReadThePersonsWordsAsAnItem',
])

/**
 * WHY THIS MESSAGE WAKES NO WAITER, or null because it wakes.
 *
 * Quiet only when Mole Office or a registered inspector wrote it and its kind's row says it asks
 * nothing, or its kind is a retired quiet one (`RETIRED_QUIET_KINDS`). The sentence travels on the
 * waiting row, so a caller can see why the row did not end its hold.
 */
export function whyThisWakesNoWaiter(sentBy: ParticipantRef | null, notice: unknown): string | null {
  const because =
    typeof notice === 'string' && RETIRED_QUIET_KINDS.has(notice)
      ? 'The office no longer writes this kind. It asked nothing of its reader while the office did, so a stored one stays quiet.'
      : isANoticeKind(notice) && !NOTICES[notice].wakes
        ? NOTICES[notice].because
        : null
  if (sentBy === null || because === null) return null
  if (!isMoleOffice(sentBy) && !isAnInspector(sentBy)) return null
  return (
    `This is a notice of the kind "${String(notice)}", written by ${isMoleOffice(sentBy) ? 'Mole Office' : 'the inspector'}. ` +
    `${because} It does not wake a waiter on its own. It is handed over with the next message that does, and ` +
    'the inbox shows it.'
  )
}

/**
 * REFUSE A MESSAGE THAT NAMES A KIND OF NOTICE IT MAY NOT. Strict storage: only Mole Office and a
 * registered inspector write `notice`, because a kind is what makes a message quiet, and an agent that
 * could set it could keep its own message from waking anybody. A kind the table does not hold is
 * refused too, so no new row carries a kind nothing can read. That includes a retired kind, whose rows
 * written before its retirement are read through `RETIRED_QUIET_KINDS`.
 */
export function refuseANoticeKindNotAllowed(data: Record<string, unknown>, writtenByTheOffice: boolean, writer: ParticipantRef | null): void {
  if (!Object.hasOwn(data, 'notice')) return
  const kind = data['notice']
  if (!writtenByTheOffice && !isAnInspector(writer)) {
    throw new PanelError(
      'Only Mole Office and the inspector write `notice` on a message, because the kind of notice decides whether ' +
        'it wakes its reader. Leave it out: a message without it wakes its reader. Nothing was written.',
      403,
    )
  }
  if (!isANoticeKind(kind)) {
    throw new PanelError(
      `"${String(kind)}" is not a kind of notice the office knows. The kinds are listed in src/server/lib/notices.ts. ` +
        'Nothing was written.',
      422,
    )
  }
}
