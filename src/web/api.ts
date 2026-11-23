// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ChapterContent, TheSelectedChapters, AChapterPreview, AChapterWritten, AChaptersHistory } from '@shared/chapter-edit.ts'
import type { DeadLetterThresholds } from '@shared/dead-letter-thresholds.ts'
import type { AChoiceForADoor, WhatTheGrantCarriesAfterAChange, WhatTheGrantCarriesReading } from '@shared/what-the-grant-carries.ts'
import { readRefusal, type RefusalCode } from '@shared/refusal-codes.ts'
import { noteAnUnprovedIdentity } from './lib/unpaired.ts'
import type { RemindMeLaterChoice } from '@shared/remind-me-later.ts'
import type { OfficeLoad } from '@shared/office-load.ts'
import type { AWaitingNote, NotOnThePersonsOwnWords } from '@shared/the-persons-own-words.ts'
import type { AKeyReminder } from '@shared/message-keys.ts'
import type { AReportFileReminder } from '@shared/report-file-reminder.ts'
import { content, readStoredWord, type WordValues } from '@shared/i18n.ts'
import { pluginFileAddress, pluginPageFile } from '@shared/plugins.ts'
import { theTargetOfARead, type PluginAgentStatus, type PluginStatusReading } from '@shared/plugin-read.ts'
import type { FolderPieceDecision, FolderPieceReply, FolderReading } from '@shared/folderreading.ts'
import type { StableOfficeHistoryPage } from '@shared/stable-bootstrap-notices.ts'
import type { PixelSettingsReading, PixelAppearanceReading } from '../server/lib/pixel-office.ts'
import type { PixelAppearance, PixelSceneSettings, PixelScope } from '@shared/pixel-office.ts'
/**
 * Every call the browser makes to the server, in one place, typed against the shared contract.
 *
 * Three rules this file exists to enforce:
 *
 *   1. A failed request NEVER turns into an empty successful result. If the server says no, or
 *      is not running, the caller gets a thrown ApiError carrying the server's own message, and
 *      the screen shows that message. Silently rendering "no links" when the request actually
 *      failed would be exactly the kind of quiet lie Mole Office is built to prevent.
 *
 *   2. Every request carries who is asking. The server reads three headers to build its Actor,
 *      and writes that into the change log. If the browser did not send them, every change in
 *      the history would be attributed to a default and the history would be worthless.
 *
 *   2b. Every request says WHICH PROJECT it is about. `x-mole-office-workspace` names the workspace
 *      every read is answered from and every write lands in, and it comes from ONE place —
 *      `theProjectARequestNames` below, which `moleOfficeHeaders` sets it by. A request that forgot it
 *      would be answered from the stated default, which is a different project's records under this
 *      project's heading.
 *
 *   3. A WRAPPER NEVER THROWS AWAY PART OF A REPLY. Every function below is typed against the
 *      WHOLE body its route returns, and hands back the whole of it.
 *
 *      This rule is here because of what it cost. GET /api/changes gained a `sessions` block
 *      that resolves the session id on every change row to the session's title; `listChanges`
 *      read `.changes` and dropped the rest, so the pages went on printing `NS6wp_rmduzo` where
 *      a run name used to be, and the server improvement never arrived. Nothing failed, nothing
 *      warned: a typed fetch that quietly discards half the response looks exactly like a
 *      response that never carried the other half.
 *
 *      Unwrapping a ONE-KEY envelope is not discarding: `{records: [...]}` carries one thing and
 *      handing back that thing loses nothing. Those three are listed in UNWRAPPED_ENVELOPES at the
 *      bottom, and the test checks the list against what the server really sends.
 *
 *      There were four until POST /api/links grew from `{id}` to a reply naming both ends. That is
 *      the exact day the rule warns about: an unwrap that was honest on Monday drops four fields on
 *      Tuesday, and nothing about the unwrap itself changed.
 *
 * Web terms used below, defined once:
 *   fetch    -- the browser's built-in function for making an HTTP request.
 *   Headers  -- the key/value metadata sent alongside an HTTP request.
 *   localStorage -- a small key/value store the browser keeps for this site between visits.
 */

import type { AttentionResult } from '@shared/attention.ts'
import type { AttentionFirstPage, AttentionPart, AttentionPartPage } from '@shared/attention-first-page.ts'
import type { AnInterruptedRun } from '@shared/interrupted.ts'
import type { TheLiveRunsReading, TheShutDownAnswer } from '@shared/shutting-down.ts'
import type { MergeQueueReply } from '@shared/merge-queue-page.ts'
// THE SHORT ANSWERS THE PAGE ASKS FOR. A page asks only for what it draws, as option 2 of a decision
// says.
import { PARTICIPANT_FIELDS_THE_PAGES_READ } from '@shared/short-lists.ts'
import type { ACommentOnThePage, ACommentWithItsWrittenOrder, ShortBetweenAgentsRow, ShortContactLast, ShortGroupRow, TheCircle } from '@shared/short-lists.ts'
import type { BroadcastReading } from '@shared/broadcast.ts'
import type {
  AgentRuntime,
  ChatButtonStays,
  ChatOpensAs,
  ChatLayout,
  ChatTextSize,
  CircleShows,
  MessageLinkLayout,
  MessageLinkLevel,
  MessageProjectMark,
  ParticipantKind,
  ParticipantRef,
  PresenceChoice,
  SendKeySetting,
  ShortcutSettings,
} from '@shared/participants.ts'
import type { MessagePictureChoice } from '@shared/messagepictures.ts'
// WHETHER MEDIA A RECORD POINTS AT ARE LOADED. Criterion U5. NOT messagepictures.ts above.
import type { MediaLoadChoice } from '@shared/mediaload.ts'
import type { TheDeadLetterSummarySaid } from '@shared/dead-letter-lines.ts'
import type { GroupOnTheWire, TheDeadLetterSweepSaid } from '@shared/groups.ts'
import type { ContactGroup, ContactSide } from '@shared/contacts.ts'
import type { PickUpCost } from '@shared/pick-up-cost.ts'
import type { TheRunThatAskedForAWorker, TheWorkersARunStarted } from '@shared/worker-runs.ts'
import type { ReportConfirmation } from '@shared/releasing.ts'
import type { AddressAs, AddressAsPart, AddressAsSetBy } from '@shared/address-as.ts'
import type { AGrantToWithdraw, ProfileFacts, WaitingCardAsk, WhatAnAskShows } from '@shared/profile.ts'
// PERMANENT RESIDENTS, wave 13r round 4. Type-only: the shapes are declared beside the rules the pages read from them.
import type { OneResidentReading, TheConfirmReply, TheDeclineReply, TheNamedReply, TheResidentsList, TheSleepReading, TheSpaceListing } from './lib/residents.ts'
// WHAT A RECORD SPENT, criterion T2. The browser draws the reader's own shape rather than a second
// one built from the reply, so the page and the door cannot disagree about the fields.
import type { SpentOnThis } from '@shared/spent.ts'
import type { MessageOnTheWire, UnregisteredWriter } from '@shared/messages.ts'
import type { IntentMark } from '@shared/intent-mark.ts'
import type { TheStoredMessageLabels } from '@shared/message-label.ts'
import type { TheStoredLook } from '@shared/own-themes.ts'
// WHAT PROGRAM IS WRITING. One declaration, read by the page that sends it and by the door that
// reads it. Criterion M63.
import { PROGRAM_HEADER, participantKey } from '@shared/messages.ts'
import type { WhoIsAnswering } from '@shared/handles.ts'
import type { ClaimOnTheWire, Overlap } from '@shared/claims.ts'
import type { AnAnswer, ReportAnswers, ThePress } from '@shared/answers.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { Incompleteness, ObligationState } from '@shared/kinds.ts'
// Which Mole Office answered, criterion G3. `lib/world.ts` remembers the world of the first reply
// and says when a later one came from somewhere else; the transport below throws those away.
import {
  FRESHNESS_HEADER,
  WORLD_HEADER,
  adoptTheHomeWorld,
  howOldTheServerSaysItIs,
  theWorldThatAnswered,
  theWorldThatAnsweredLast,
  theWorldThisPageCallsHome,
} from './lib/world.ts'
// Which world this page lives in, on every request. Criterion C4.
import { HOME_HEADER, HOME_MOVED_HEADER, VISIT_HEADER } from '../config/visit-headers.mjs'
import { theHoldOnThisRequest, withTheDeviceHalf } from './lib/the-device-half.ts'
// Where this page's requests go, and the trip it is on. Criterion C7.
import {
  theVisitThisPageHolds,
  thisPageIsHome,
  thisPageIsVisiting,
  whereRequestsGo,
  whatARequestCarries,
  type Visiting,
} from './lib/visiting.ts'
import type { EmbassyKey, Visit as VisitOnTheWire, WhatTheEmbassySays, World as WorldOnTheWire } from '@shared/worlds.ts'
import type { VisitorCredential, VisitorRequestRow } from '@shared/visitors.ts'
import type { Elevation, WhatTheRolesSay, WhoHoldsTheCards } from '@shared/roles.ts'
import type { WhatTheOfficeRegulationsSay } from '@shared/office-rules.ts'
import type { TrustedMachine, WhatTheOfficeTrusts } from '@shared/trustedmachines.ts'
// WHO HAS CALLED WITH A CLAIM AND NO KEY. Criterion P83 point 6; the shape is shared with the read.
import type { WhatTheHeaderOnlyCallersSay } from '@shared/headeronlycalls.ts'
// WHETHER THE ONE-VERSION KEY WINDOW IS STILL OPEN. Criterion P83 point 6; shared with the server.
import type { WhatTheKeyWindowSays, WhatTheKeyWindowSaysToThisCaller } from '@shared/keywindow.ts'
// WHETHER THIS BROWSER IS PAIRED, AND THE PRESS THAT PAIRS IT. Criterion P83 point 2.
import type { WhatAskingToPairSays, WhatThePairingSays } from '@shared/pairing.ts'
import type { TheOfficeOwner } from '@shared/owner.ts'
import type { PortraitOnOffer } from '@shared/portraits.ts'
// ONE ROW OF THE PACKAGED-TASKS COLUMN, criterion F16 point 2. Declared once, in src/shared, so the
// server that computes it and the browser that draws it read the same shape.
import type { DelegationRow } from '@shared/delegation.ts'
import type { CatalogueColumn, SortDirection } from '@shared/catalogue.ts'
import type { KindFamily } from '@shared/work.ts'
import type { PoolPage, PoolStateChoice } from '../server/api/messages.ts'
import type { ReportsAndNotesReply, ReportsAndNotesRow } from '../server/api/records.ts'
import type { DetailSupply } from '@shared/detailsupply.ts'
import type { WorkToTalkAbout } from '@shared/talksources.ts'
import type { ReportsPageShow } from '@shared/reports-page.ts'

/**
 * What `GET /api/delegation` answers with.
 *
 * `tasks` IS ALREADY NEWEST PACKAGE FIRST — the server's own order — so nothing here re-sorts it.
 * `couldNotRead` names a packaged task whose `package` field could not be read rather than dropping
 * it, which is why it is a list of its own and not folded into a count.
 */
export interface DelegationReply {
  tasks: DelegationRow[]
  couldNotRead: { recordId: string; title: string; because: string }[]
  workspaceId: string
  note: string
}

/**
 * WHAT ONE THING BROUGHT BACK FROM OUTSIDE LOOKS LIKE ON THE WIRE. Criterion F16 point 5.
 *
 * Declared once, and used by the panel that draws it and by the reply to the return door. The
 * `saysItIsFromOutside` field is always true, which is the whole of invariant 3 in the shape: a
 * return is somebody outside the office's words and never this office's own observation.
 */
export interface StatedReturn {
  at: string
  broughtBackBy: { actorType: string; actorId: string }
  fromOutside: string
  form: string
  words?: string
  pictures?: string[]
  file?: string
  saysItIsFromOutside: true
}

/** What `POST /api/delegation/:id/return` answers with. */
export interface ReturnFromOutsideReply {
  task: { id: string; title: string }
  entry: StatedReturn
  form: string
  note: string
}

/** What `POST /api/delegation/:id/confirm` answers with. */
export interface ConfirmPackageReply {
  task: { id: string; title: string }
  completed: { by: { actorType: string; actorId: string }; at: string }
  responsible: { who: { kind: string; id: string } | null; why: string }
  note: string
}

/**
 * ONE THING THE SCREEN FOUND, as an outside export carries it. Criterion F16 point 6.
 *
 * `check` and `severity` are the screen's own stored words; the page reads them through
 * `screenCheckWord` and `screenSeverityWord` rather than printing them. `where` is null for the one
 * finding that is about the whole text — other people's names were not checked.
 */
export interface ScreeningFindingOnTheWire {
  check: string
  severity: string
  where: { line: number; startColumn: number; endColumn: number } | null
  says: string
}

/** What the screen said about the text that would leave, carried whether or not it found anything. */
export interface ScreeningOnTheWire {
  findings: ScreeningFindingOnTheWire[]
  ranChecks: string[]
  summary: string
}

/** What `POST /api/delegation/:id/export-outside` answers with. Criterion F16 points 1 and 6. */
export interface OutsideExportReply {
  task: { id: string; title: string }
  export: {
    n: number
    at: string
    bytes: number
    characters: number
    textHash: string
    carried: { recordId: string; contentHash: string }[]
  }
  text: string
  screening: ScreeningOnTheWire
  note: string
}

/**
 * What `GET /api/office/worlds` answers with.
 *
 * `from` is the one field a reader must not skip: `the office` is the list, `the mirror` is a copy
 * written at a moment it names, and `this world alone` is what one world could still see. Three
 * different sentences, and drawing them the same way would be the substitution this product forbids.
 */
export interface WhatTheOfficeSays {
  worlds: WorldOnTheWire[]
  from: 'the office' | 'the mirror' | 'this world alone'
  mirrorWrittenAt: string | null
  /** Null when this world may read no mirror at all, which `mirrorNote` explains. */
  mirrorFile: string | null
  /** Why that file, or why there was none. Never empty. */
  mirrorNote: string
  /** `mirrorNote` as a code the page draws in its own language (src/shared/dev-sayings.ts). */
  mirrorNoteSaid?: unknown
  isTheOffice: boolean
  /** The database the home row is about, when that is not the database answering. See the page. */
  theHomeRowBelongsTo: string | null
  /** The identity of the database answering. */
  thisWorld: string | null
  office: string
}
import { clearStored, readStored, writeStored } from './lib/store.ts'
import { aRequestSettled, aRequestStarted } from './lib/ready.ts'
import { theApiUrlFor } from './lib/api-address.ts'
import type { RuntimeRecord } from '@shared/runtime.ts'
/**
 * The bulk link reply, IMPORTED from the route that serves it rather than restated here.
 *
 * A type-only import: it is erased at build time, so nothing of the server reaches the browser
 * bundle. The shapes above this line are restated in this file and that is the defect this
 * repository keeps producing; a new one does not have to join them.
 */
import type { AccessReply } from '../server/lib/access.ts'
import type { WhichDecisionsGovern } from '../server/lib/governs.ts'
import type { ManualPage, ToolsetList } from '../server/lib/toolset.ts'
import type { ToolsetReader, ToolUsesPage } from '@shared/toolset.ts'
// THE PICTURES ON OFFER, imported from the library that reads the files rather than restated here.
// A type-only import, so nothing of the server reaches the browser bundle.
import type { AvatarOnOffer } from '../server/lib/avatars.ts'
import type { ForksReply } from '../server/api/forks.ts'
import type {
  AcceptedReply,
  DeclaredReply,
  RebuiltReply,
  RecordImplementationReply,
  RepositoriesReply,
  RepositoryRegisteredReply,
} from '../server/api/implementation.ts'
import type { Repointed } from '../server/lib/repositories.ts'
import type { PreviewRootsReply } from '../server/api/preview-roots.ts'
import type { LinksReply } from '../server/api/links.ts'
// WHAT A RECORD PAGE DRAWS BESIDE ITS RECORD, and the rows a record picker offers. Type-only, for the
// reason LinksReply above is.
import type { RecordAround } from '../server/lib/records.ts'
import type { TitleOption } from '@shared/blocks.ts'
// THE SPANS IN FORCE FOR THE THREE TIMED HORIZONS. Criterion P1; the type is the reader's own, so
// the page cannot come to restate a default the office holds.
import type { TheGoalSpans } from '@shared/goal-spans.ts'
import type { CounterChange, CounterReading, CounterRowReading } from '@shared/counters.ts'
import type { ChecklistEvidence, ChecklistReading, ChecklistRequest, EvidenceChoice, EvidenceKind } from '@shared/checklists.ts'
import { FLOW_PAGE_LIMIT, FLOW_REPLACED_SHOW, type FlowListPage, type FlowMayWrite, type FlowRead, type FlowSort, type FlowWriteAnswer } from '@shared/flows.ts'
import type { FlowStageWrite } from '@shared/flow-step-writes.ts'

/** What POST /api/flows takes: the project it is filed in, its facts, and its stages in order. */
export interface NewFlowBody {
  project: string
  title: string
  runsBy: string
  trigger: string
  leavesBehind: string
  declaredIn: string
  stages: { does: string; evidence?: string; why?: string; sources?: string[] }[]
}
// THE SHAPE THE PRESENCE READ HANDS BACK, declared once beside the component that draws it.
import type { PresenceHere } from './components/graph/Presence.tsx'
// The one reading of what is waiting on the person, for the same reason.
import type { WaitingReply } from '../server/api/waiting.ts'
import type { AOnePressRequest } from '../server/lib/one-press.ts'
import type { ASigningPackage, SigningPackageState } from '../server/lib/signing-packages.ts'
import type { AReadinessChecklist, ASignerRef } from '../server/lib/readiness.ts'
import type { HonourBoard } from '../server/lib/honour.ts'
import type { NeedsYouReply } from '../server/api/needs-you.ts'
import type { DeadlineReply, PlanReply } from '../server/api/planning.ts'
/**
 * The planning shapes, IMPORTED rather than restated, for the same reason as LinksReply above.
 *
 * `AllocationWithWork` in particular is thirty fields of contract — an allocation, the work it
 * names, which project owns that work, and the three ways the work can be absent. A hand-written
 * copy of it in this file would be the defect CLAUDE.md names: two declarations of one shape with
 * nothing making them agree.
 */
import type {
  AllocatedWork,
  AllocationWithWork,
  Capacity,
  Recurrence,
} from '../server/lib/planning.ts'
/**
 * A window with the work it names, IMPORTED for the same reason as the shapes above it.
 *
 * A window says WHEN somebody means to work on something and carries no hours at all. The pair of
 * "the window" and "the work it names" is the server's own declaration and a copy here could
 * disagree with it silently. Type-only, so nothing of the server reaches the browser bundle.
 */
import type { WindowWithWork } from '../server/lib/windows.ts'
/**
 * The plan shapes, IMPORTED for the same reason the planning shapes above are.
 *
 * A plan and its lines are stored, so `Plan`, `PlanLine` and `PlanSummary` are the server's own
 * declarations and not a copy. `PlanLineWithWork` in particular carries the line's words AND the
 * live record beside it, which is the whole point of the page: the two are separate facts and a
 * second declaration of that pair is the drift this repository keeps finding.
 */
import type {
  LineBound,
  LineFiled,
  Plan,
  PlanLine,
  PlanLineRevision,
  PlanLineWithWork,
  PlanSummary,
} from '../server/lib/plans.ts'
/**
 * The agent-review shapes, IMPORTED for the same reason the plan shapes above are.
 *
 * `PlanContext` is the whole reply of the context route, including the words a person hands to an
 * agent. Restating it here would put the sentence Mole Office tells an agent to write in two files, and
 * the two would come apart the first time either changed. Type-only, so nothing of the server
 * reaches the browser bundle.
 */
import type { PlanContext, PlanReview, PlanReviewsReply } from '../server/lib/planreview.ts'
/**
 * What one row of the cross-project work list is, IMPORTED for the same reason as the shapes above.
 *
 * `WorkRow` is nineteen fields, including the chain of everything a piece of work is part of and
 * every period it has hours in. A hand-written copy here could disagree with the route on any one of
 * them and nothing would fail. Type-only, so no server code reaches the browser bundle.
 */
import type { WorkListReply, WorkPageReply, WorkPageRow, WorkRow } from '../server/lib/worklist.ts'
// Type only, erased at build. The reply shape is imported from the projection that produces it
// rather than restated here, so the browser and the server cannot come to disagree about what a
// row of the roster holds — which is this repository's recurring defect in its commonest form.
import type { HomeDoing, HomeRoster, WhoIsWorking } from '../server/lib/working.ts'
import type { WhatHasBeenSaid } from '../server/lib/communication.ts'
/**
 * What moving a record between projects answers. Type-only, for the same reason as every shape
 * above: the report carries eight fields, including every record that has to come along and the
 * sentence saying what happened, and a hand-written copy here could disagree with the route on any
 * one of them with nothing failing.
 */
import type { MoveReport } from '../server/lib/move.ts'
import type { ActOnTheirWords } from '../server/lib/warrants.ts'
// WHERE A QUESTION AN AGENT ASKED THE PERSON IS, criterion P55. Type only, and declared where the
// shape lives so the reply and the pages that draw it cannot come apart.
import type { WhereTheQuestionIs } from '@shared/confirming.ts'
import type { RevokedAct } from '../server/lib/records.ts'
/** What changing a record's kind did, and where every field that did not fit went. Type-only. */
import type { KindChangeOutcome } from '../server/lib/records.ts'
/**
 * The agent-conversation shapes, IMPORTED for the same reason as every shape above.
 *
 * A comment carries what it points at, who it is for, and a READING of whether the thing it points
 * at is still there — three shapes the server computes and this browser only draws. Restating them
 * here would be the defect this repository names: the reading would go on saying "there" in the
 * browser's copy long after the server learnt to say "the words have moved". Type-only, so nothing
 * of the server reaches the browser bundle.
 */
import type {
  AgentMessageView,
  AgentThreadView,
  DispatchOutcome,
  MarksReply,
  MessageContext,
  MessageIntent,
  MessageRemoved,
  RecipientKind,
  ThreadDetail,
  ThreadListReply,
  ThreadMode,
  ThreadState,
} from '../server/lib/agents.ts'
/** Who a message could go to, and what a phrase naming an agent resolved to. Type-only. */
import type { AgentRankingAnswer, RecipientsAnswer, Resolution } from '../server/lib/recipients.ts'
/**
 * A review and one remark in it, IMPORTED for the same reason as every shape above.
 *
 * `FoundMember` carries the reading of whether a remark's quoted words are still there, which is
 * the one fact the review list was missing. A hand-written copy of it here would go on saying the
 * quote is fine long after the server learnt to say the words had moved. Type-only, so nothing of
 * the server reaches the browser bundle.
 */
import type {
  DiscardOutcome,
  OrganiseOutcome,
  ReviewDetail,
  ReviewListReply,
  ReviewMember,
  ReviewReach,
  ReviewScope,
  ReviewState,
  ReviewView,
  SendOutcome,
  WhereOneCommentGoes,
  WhereTheyGo,
} from '../server/lib/reviews.ts'
/**
 * WHAT AN INTERPRETER IS ASKED ABOUT A REVIEW, and the reading it may answer with.
 *
 * Type-only, like every other shape here. There is deliberately no type for what is POSTED back:
 * `checkOrganised` on the server is the one check of what a reading is, and a shape declared here
 * would be a second, weaker copy of it — free to accept something the real check refuses.
 */
import type { InterpreterRequest } from '../server/lib/interpret.ts'
/** One remark: where it is, whether it still holds, and the same reading for a whole list. */
import type { AnnotationReadings, AnnotationView, AnnotationWhere } from '../server/lib/annotations.ts'
/**
 * What this record used to hold, one entry per write.
 *
 * A short form names one of these entries, and the panel a person opens from a record page draws
 * all four of them: the list, one whole version, a comparison of two, and putting one back.
 */
import type { OneRevision, RestoredRevision, RevisionComparison, RevisionListing } from '../server/lib/revisions.ts'
import type { HistoryEvent } from '../server/lib/history.ts'
/** Where each of the five shorter forms of one record stands, and one length for a whole list. */
import type { ShortFormForRow, ShortFormsReading } from '../server/lib/zoom.ts'
import type { ShortFormLevel } from '@shared/zoom.ts'
import type { PlanBlock, PlanState } from '@shared/plandoc.ts'
import {
  parsePeriod,
  type Allocation,
  type AllocationState,
  type Grain,
  type Load,
  type WorkWindow,
} from '@shared/planning.ts'
import type { SearchReply } from '../server/api/search.ts'
/**
 * What a sweep of this machine for agent runs found. Type-only, for the same reason as the shapes
 * above: the report carries eight counts and a list of what could not be read, and a hand-written
 * copy here could disagree with the route on any one of them with nothing failing.
 */
import type { DiscoverReply, SessionDetailReply } from '../server/api/sessions.ts'
/**
 * ONE RUN'S CALLS, READ BACK IN TIME ORDER. Type-only, same reason as the shape above: the timeline
 * is the server's reading of its own call log, and a hand-written copy here could disagree with the
 * route on a field with nothing failing.
 */
import type { SessionTimeline } from '../server/lib/sessions.ts'
/** Same reason as LinksReply above: type-only, erased at build, so no server code is bundled. */
import type { WorkspacesReply } from '../server/api/workspaces.ts'
import { WORKSPACE_HEADER, currentWorkspace, setWorkspace } from './lib/workspace.ts'
import { DEFAULT_WORKSPACE, type ReviewLevel, type Workspace } from '@shared/workspaces.ts'
import { PROJECTS_QUERY, projectsQuery, type ProjectChoice } from '@shared/across-projects.ts'
/**
 * The object a comment points at, when the comment is about a few words inside one.
 *
 * IMPORTED RATHER THAN WRITTEN OUT AGAIN. The two agent calls below both have to answer "which
 * object is this about", and a one-line ternary written twice here and a third time in the
 * components is three copies of one rule — the defect this repository names as its own. It is a
 * pure function over the server's shape and pulls no component into this file.
 */
import { annotationTitle, objectOf } from './components/agent/context.ts'

/**
 * THE SAME OBJECT WITH ITS NULL AND UNDEFINED KEYS LEFT OUT.
 *
 * The write door's own instruction, in the sentence it refuses with: *Leave the key out entirely
 * rather than sending null.* A field nobody filled in is a field that is not there, and a null is a
 * claim that somebody wrote nothing into it. The composer's recipient carries three fields that are
 * often null — the run, the words typed, the reason it was offered — so this is where they go.
 */
export function withoutNulls<T extends Record<string, unknown>>(held: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(held)) {
    if (value === null || value === undefined) continue
    out[key] = value
  }
  return out as Partial<T>
}
/**
 * The target declaration, read for ONE fact here: which of a
 * target's identifying values holds a record id. See `rankingAsk` below.
 */
import { targetSpec, type Context, type Revision, type Target } from '@shared/targets.ts'
// THE THREE AUTHORED SEVERITIES AND THE TWO RESTRICTION KINDS, from the one declaration. The
// browser reads these tables to draw a restriction; it never re-declares the words.
import type { RestrictionKind, RestrictionSeverity } from '@shared/restriction.ts'
import type {
  ActorType,
  AnsweringLinkType,
  Change,
  ImageBlock,
  ItemState,
  LinkType,
  PanelRecord,
  RecordKind,
  ResolvedLink,
  GatedLink,
} from '@shared/types.ts'
import type { Fulfilment, Gate } from '@shared/work.ts'
import type { TheNotebookRead } from '@shared/notebook.ts'
import { joinApiParts } from './api-parts/join.ts'
import * as parts from './api-parts/parts.ts'

// ---------------------------------------------------------------------------- errors

/**
 * WHAT KIND OF FAILURE THIS IS, which is the one thing that decides how a screen draws it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CLASSIFICATION AND NOT A SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * Every failing request used to arrive at the screen as one string, and where the server had said
 * nothing that string was built here as `HTTP ${status} from ${path}`. So the whole product
 * answered a stopped server with `HTTP 502 from /api/changes?limit=40` and a `Retry` button — an
 * HTTP status and a route, printed to somebody who has never run a web server. The language audit
 * of 19 August 2026 called it the worst string in the product, because it is the one a person meets
 * on the day something is wrong.
 *
 * Fixing the string would have fixed the string. The route was in the message, so every one of the
 * forty-odd places that draws an error was free to print it, and the next one written would have
 * printed it again. **The route is no longer in the message at all.** It is on the error, beside a
 * word saying what sort of failure this is, and `ErrorNote` in components/ui.tsx is the one place
 * that turns that word into a drawing.
 *
 * The five words, and what a person is being told by each:
 *
 *   `unreachable` — nothing answered. The server is not running, or the browser cannot get to it.
 *   `broken`      — the server answered and the answer was a fault of its own.
 *   `not-here`    — there is no such thing at that address. Nothing failed; the address is wrong.
 *   `elsewhere`   — the thing exists and is in another project. Nothing failed either.
 *   `refused`     — the server understood and said no, for a reason it stated.
 *
 * `not-here` and `elsewhere` are not failures and must not be drawn as ones. That is the whole
 * point of separating them: a red panel saying **Failed.** for a mistyped link tells a person the
 * product broke when they made a typo.
 */
/**
 * `wrong-world` is criterion G3's, and it is the newest of the six: the reply arrived and was
 * perfectly well formed, and it came from a DIFFERENT Mole Office than the one this page opened
 * against. It is a failure and never data — see `moleOfficeRequest` below.
 */
export type FaultKind = 'unreachable' | 'broken' | 'not-here' | 'elsewhere' | 'refused' | 'wrong-world'

/**
 * A record that exists, in a project the reader is not looking at.
 *
 * The server sends the id and the title; the BROWSER turns the id into the project's name, because
 * the browser is what already holds the list of projects and their names. Sending the name from the
 * server too would be the same fact worked out in two places.
 */
export interface Elsewhere {
  /** The record's own title, so a sentence can name it the way the reader would. */
  title: string
  /** The project it is really in, as an id. Never printed raw — `projectName` turns it into a name. */
  workspaceId: string
  /** The record's id, so the way out can be a link rather than an instruction. */
  recordId: string
}

/** The failure, whole: what sort it is, what to say, and the wire details for Developer mode. */
export interface Fault {
  code?: RefusalCode
  values?: WordValues
  kind: FaultKind
  /** The server's sentence, or the page's explanation when no usable reply arrived. */
  message: string
  /**
   * THE SERVER'S OWN SENTENCE, AS IT WROTE IT. Null when no usable reply arrived and `message` is the
   * page's own explanation. ErrorNote shows this to a person only for a refusal with no code, and in
   * Developer mode for every other kind (decision z_A0xVMbWOzh).
   */
  said: string | null
  /** The route that was asked for. Developer mode only. */
  path: string
  /** The HTTP status, or 0 when nothing answered. Developer mode only. */
  status: number
  /**
   * THE SAME REFUSAL IN ONE SHORT SENTENCE, when the server wrote one. Null when it did not.
   *
   * It is written beside the message by the same guard. For an ordinary refusal without a code,
   * ErrorNote draws this reason and folds the message. A code gives the page its word-list reading.
   */
  reason: string | null
  /** The server's own detail — exact headers, paths, requests. Developer mode only. */
  detail: string | null
  /**
   * THE RECORD AN ERROR ANSWER STILL NAMED, when the reply held a stored record. Null otherwise.
   *
   * A person's send to a retired agent answers 409 and keeps the letter (criterion M113a), so the
   * reply carries `record` beside `error` and `reason`. The chat reads the id from here and draws
   * the stored row's own failed mark instead of a second bubble. Null on every other fault, which
   * is every fault that stored nothing.
   */
  stored: string | null
  /** Set only when `kind` is `elsewhere`. */
  elsewhere: Elsewhere | null
}

/** An error the server reported, carrying its HTTP status so the UI can say what went wrong. */
export class ApiError extends Error {
  get code(): RefusalCode | undefined { return this.fault?.code }
  get values(): WordValues | undefined { return this.fault?.values }

  constructor(
    readonly status: number,
    message: string,
    /**
     * How this should be drawn, and the wire details a person never reads.
     *
     * Optional so that the three transports that construct an ApiError by hand keep working. A
     * caller with no fault is drawn exactly as errors were drawn before this existed.
     */
    readonly fault: Fault | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** The classification, or null when this was not a failed request at all. */
export function faultOf(err: unknown): Fault | null {
  return err instanceof ApiError ? err.fault : null
}

/** Pull a human-readable line out of anything thrown, without hiding it. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

// ---------------------------------------------------------------------------- actor

/** Who the browser claims to be. Sent on every request and recorded in the change log. */
export interface WebActor {
  type: ActorType
  id: string
  sessionId?: string
}

const ACTOR_KEY = 'mole-office.actor'

/**
 * Who this browser writes as until somebody changes it on the Settings page: the office's owner.
 *
 * THE ID IS NOT WRITTEN HERE, AND THAT IS THE WHOLE POINT OF THIS COMMENT. It is the id the server's
 * authority guard compares every governance act against, so a second copy here could silently stop
 * the owner being the owner in their own browser. The browser asks the server who owns the office
 * before the app loads (src/web/owner.ts), and `THE_PERSON` in `@shared/person.ts` holds the answer.
 * A function, so that it reads `THE_PERSON` when asked and not when this module was loaded.
 */
function defaultActor(): WebActor {
  return { type: 'human', id: THE_PERSON }
}

function loadActor(): WebActor {
  // THROUGH `readStored`, WHICH CANNOT THROW. This line read `window.localStorage.getItem` directly
  // and ran while this module was being evaluated, so a browser with site storage blocked stopped
  // the whole app from starting rather than losing one remembered setting. Problem `uihbRUojyr2p`.
  const held = readStored(ACTOR_KEY)
  // NOBODY COULD LOOK, so this browser writes as the person it writes as by default. Nothing is said
  // on screen here: `readChoice` in lib/store.ts is what tells a reader their settings cannot be
  // remembered, and one sentence about that is enough.
  if (!held.ok) return defaultActor()
  const raw = held.value
  if (raw === null) return defaultActor()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const p = parsed as Partial<WebActor>
    const type = p.type
    const id = p.id
    const sessionId = p.sessionId
    if ((type === 'human' || type === 'agent' || type === 'system') && typeof id === 'string' && id.length > 0) {
      return { type, id, ...(typeof sessionId === 'string' && sessionId ? { sessionId } : {}) }
    }
  }
  // A corrupt preference should not take the app down, but it must not pass unnoticed either.
  console.warn('Mole Office: the stored actor was unreadable and has been reset to the default human.')
  clearStored(ACTOR_KEY)
  return defaultActor()
}

/**
 * READ WHEN FIRST ASKED, NOT WHEN THIS MODULE LOADS: src/web/main.tsx loads this module to ask who owns
 * the office (`askWhoOwnsTheOffice`), and the default actor is that owner, so it cannot be worked out
 * before the answer.
 */
let currentActor: WebActor | null = null
function theActorNow(): WebActor {
  currentActor ??= loadActor()
  return currentActor
}
const actorListeners = new Set<() => void>()

export function getActor(): WebActor {
  return theActorNow()
}

export function setActor(next: WebActor): void {
  currentActor = next
  // A BROWSER THAT REFUSES TO REMEMBER IT STILL CHANGES WHO THIS PAGE WRITES AS, for this page.
  writeStored(ACTOR_KEY, JSON.stringify(next))
  for (const listener of actorListeners) listener()
}

/**
 * WHO OWNS THIS OFFICE, ASKED BEFORE THE BROWSER KNOWS WHO IT IS (src/web/owner.ts). The one request
 * that carries no actor and no project, because it is how the browser learns the actor: GET
 * /api/office/owner answers anyone. Here, beside the transport, so that the requests this app makes
 * by hand are still all in this file.
 */
export async function askWhoOwnsTheOffice(query: string): Promise<Response> {
  // Not while a press that sets the cookie half is out, and at once when none is (src/web/lib/the-device-half.ts).
  const heldByAPress = theHoldOnThisRequest()
  if (heldByAPress !== undefined) await heldByAPress
  // THE OFFICE THAT SERVED THIS PAGE, NEVER A WORLD IT IS VISITING: the answer is who this page acts
  // as, and a visited world's owner is not this page's person.
  return fetch(theApiUrlFor(`/api/office/owner${query}`), {
    credentials: 'include',
    headers: withTheDeviceHalf(new Headers({ accept: 'application/json' })),
  })
}

/** React subscribes here so the header re-renders when you switch who you are acting as. */
export function subscribeActor(listener: () => void): () => void {
  actorListeners.add(listener)
  return () => {
    actorListeners.delete(listener)
  }
}

// ---------------------------------------------------------------------------- transport

/**
 * THE PROJECT A REQUEST NAMES: the one its caller named, or else the project in the switcher. `moleOfficeHeaders` sets
 * the header by this rule, and a page that hands an address to something that cannot send headers, like a video's
 * player, asks this same function for the project the address must carry. Before, the video page restated the rule
 * beside its request (the inspector's note on the video's release, 24 September 2026), where a change to one would leave
 * the other wrong with nothing failing (invariant 9).
 */
export function theProjectARequestNames(named?: string): string {
  return named ?? currentWorkspace()
}

/**
 * WHO IS ASKING AND WHAT ABOUT: the headers every request from this app carries.
 *
 * Split out of the transport below for the ONE request that cannot use it. The inline file
 * preview in components/SummaryBlocks.tsx reads a `Blob` rather than JSON, so it calls `fetch`
 * itself — and a request that builds its own headers is exactly how three of this app's four
 * transports came to be missing the workspace. It builds them here instead.
 */
export function moleOfficeHeaders(init: RequestInit = {}): Headers {
  const headers = new Headers(init.headers)
  const actor = theActorNow()
  headers.set('x-mole-office-actor-type', actor.type)
  headers.set('x-mole-office-actor-id', actor.id)
  if (actor.sessionId) headers.set('x-mole-office-session', actor.sessionId)
  // WHICH PROJECT. One call, so no request can say who is asking and forget to say what about.
  //
  // A CALLER THAT HAS ALREADY NAMED A PROJECT KEEPS IT. There is exactly one such caller and it is
  // the decision desk: a fork waiting on you may live in a project you are not reading, and the
  // decision that settles it belongs where the fork is, not where the reader happens to be. Naming
  // it is how that request stays true whichever project is on screen. Every other request says
  // nothing and gets the project in the switcher, which is what stops a page reading one project
  // and writing to another.
  if (!headers.has(WORKSPACE_HEADER)) headers.set(WORKSPACE_HEADER, theProjectARequestNames())
  // AND WHICH WORLD THIS PAGE LIVES IN. Criterion C4 of design/messages/ACCEPTANCE.md section 8:
  // every request from the product's own clients carries the caller's home world. A page that has
  // not learnt one yet sends nothing, and a request with no home is a local — named, never refused.
  const home = theWorldThisPageCallsHome()
  if (home !== null) headers.set(HOME_HEADER, home)
  // AND THE TRIP THIS PAGE IS ON, when it is on one. Criterion C7: entering a world registers a
  // visit, and every request while away carries it so the visited world can find it exactly.
  const trip = theVisitThisPageHolds()
  if (trip !== null) headers.set(VISIT_HEADER, trip.visitId)
  // AND WHAT PROGRAM IS WRITING. Criterion M63: a message says where it was written from, and the
  // machine half is measured on the server. This is the half only the browser knows.
  const program = thisBrowsersName()
  if (program !== null) headers.set(PROGRAM_HEADER, program)
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  return headers
}

/**
 * WHAT THIS BROWSER CALLS ITSELF: "Chrome", "Firefox", "Safari" — or null, honestly.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ASKED THIS WAY AND NOT BY READING THE USER-AGENT STRING
 * ---------------------------------------------------------------------------------------
 *
 * `navigator.userAgentData.brands` is the browser SAYING ITS OWN NAME, as a list of brands, and it
 * is the only reading here that is not a parse. It is not everywhere — Firefox and Safari have
 * none — so where it is absent this looks for a handful of names in the user-agent string, and
 * where it finds none it answers NULL rather than the whole string or a guess. A message then
 * carries the machine and no program, which is a true thing to say.
 *
 * THE ORDER MATTERS IN THE FALLBACK AND IS WHY IT IS A LIST RATHER THAN A SET OF IFS. Every
 * Chromium browser says "Chrome" and most say "Safari" too; Edge says both and "Edg"; Safari says
 * "Safari" and nothing else. So the specific names are asked for first and "Safari" last, and
 * "Chrome" is only reached by a browser that is not one of the others.
 *
 * NOTHING READS THIS AS AUTHORITY. It is a line beside a message saying what the writer said it was
 * writing in. See `PROGRAM_HEADER` in src/shared/messages.ts, which makes the same argument from
 * the other end.
 */
const BROWSERS_BY_NAME: readonly { inTheString: string; called: string }[] = [
  { inTheString: 'Edg/', called: 'Edge' },
  { inTheString: 'OPR/', called: 'Opera' },
  { inTheString: 'Firefox/', called: 'Firefox' },
  { inTheString: 'Chrome/', called: 'Chrome' },
  { inTheString: 'Safari/', called: 'Safari' },
]

export function thisBrowsersName(): string | null {
  if (typeof navigator === 'undefined') return null
  const brands = (navigator as unknown as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands
  if (Array.isArray(brands)) {
    // THE BRAND LIST CARRIES DECOYS ON PURPOSE. Chromium sends a made-up brand — "Not/A)Brand" and
    // its variants — so that nothing comes to depend on the list's shape. The names this product
    // knows are asked for by name, which skips the decoy without having to recognise it.
    for (const { called } of BROWSERS_BY_NAME) {
      const found = brands.find((one) => one.brand === called)
      if (found !== undefined) return found.brand
    }
  }
  const said = navigator.userAgent
  if (typeof said !== 'string' || said === '') return null
  for (const { inTheString, called } of BROWSERS_BY_NAME) {
    if (said.includes(inTheString)) return called
  }
  return null
}

/**
 * THE ONE TRANSPORT. Every request the browser makes goes through this function.
 *
 * It used to be four. api.ts had this one, and SessionPanel.tsx, ModuleSource.tsx and
 * graph/Edit.tsx each carried a copy — written when this file belonged to another agent, each
 * with its own docstring apologising for it and promising not to let it drift. Then the workspace
 * boundary arrived: a request that does not name its project is answered from the stated default,
 * so three of the four transports would have gone on reading and WRITING into another project
 * while the interface said Greenhouse at the top of the page. Nothing would have failed.
 *
 * So the three copies now call this, and the identity headers are built in one place. What each
 * caller keeps is its own typed surface; what none of them keeps is a second idea of who is
 * asking, which project it is about, or what a failed request means.
 *
 * Exported for those three. It is not exported for pages: a page asks through `api` below.
 */
export async function moleOfficeRequest<T>(path: string, init: RequestInit = {}, reads: 'json' | 'text' | 'bytes' = 'json'): Promise<T> {
  // AND THE PAGE COUNTS IT WHILE IT IS OUT. `src/web/lib/ready.ts` marks the page finished when
  // nothing is in flight and React has drawn, and that mark is what the browser tests and the
  // photographing tools wait for. The count is taken here because this is the one transport: a
  // request counted anywhere else would be a second idea of what the page is still waiting for.
  aRequestStarted(path)
  try {
    const method = (init.method ?? 'GET').toUpperCase()
    if (method !== 'GET' || init.body !== undefined || init.signal != null) {
      // A WRITE MAKES EVERY READ ASKED BEFORE IT OLD, at its start and again when it has answered.
      if (method !== 'GET') aChangeWasHeard()
      try {
        return await askedAgainWhileWindowsIsSlow(() => theRequestItself<T>(path, init, reads))
      } finally {
        if (method !== 'GET') aChangeWasHeard()
      }
    }
    // THE SAME READ ASKED IN TWO PLACES GOES OUT ONCE. Round 17 of wave 13w: on
    // one open of the chat page, GET /api/participants went out four times and GET /api/workspaces
    // three, each from a panel asking for itself. A read asked while the same read is out joins it.
    // "The same" is the same address, the same headers (who, which project, which world) and the same
    // generation: a write or an event since the first was asked means the second is asked afresh.
    // Each joiner is handed its own copy, so no caller can change what another was handed.
    const same = theSameRead(path, init, reads)
    const out = readsOut.get(same)
    if (out !== undefined) return (await out.then((value) => structuredClone(value))) as T
    const asked = askedAgainWhileWindowsIsSlow(() => theRequestItself<T>(path, init, reads))
    readsOut.set(same, asked)
    const done = (): void => {
      if (readsOut.get(same) === asked) readsOut.delete(same)
    }
    asked.then(done, done)
    return await asked
  } finally {
    aRequestSettled(path)
  }
}

/** How many more times a request is asked after Windows did not say in time who sent it. */
export const ASKED_AGAIN_AT_MOST = 3

/** How long the page waits before it asks again, in milliseconds. */
const THE_WAIT_BEFORE_ASKING_AGAIN = 2_000

/** Told each time a request waits to be asked again. */
const whileWindowsIsSlow = new Set<() => void>()

/** Be told each time a request waits to be asked again, until the function this returns is called. */
export function tellMeWhileWindowsIsSlow(listener: () => void): () => void {
  whileWindowsIsSlow.add(listener)
  return () => {
    whileWindowsIsSlow.delete(listener)
  }
}

/**
 * A REQUEST REFUSED BECAUSE WINDOWS DID NOT SAY IN TIME WHO SENT IT IS ASKED AGAIN, at most ASKED_AGAIN_AT_MOST more
 * times: every request this page makes through moleOfficeRequest, which is its first reads, a page's reads and a press.
 * A picture's bytes and a plugin page's file are plain fetches, and are asked again through
 * aFetchAskedAgainWhileWindowsIsSlow below. The other plain fetches in this file are not asked again. The owner's name
 * is never refused so, because its door never reads the sender (src/server/lib/http.ts). Entering a world and coming
 * home go to another office. A plugin's read goes to this office and can be refused so, and the plugin is handed the
 * refusal as it came.
 *
 * Inside the installed Windows app the office asks Windows which program sent a request, and waits for the answer only
 * so long (src/server/lib/from-a-sandbox.ts). Just after an install the answers can take longer, and the office then
 * refuses the request with the code `senderNotReadInTime`. That refusal is made before a door acts: the sender is read
 * before the door's handler (`readWhoSentAClaimToBeThemFirst` in src/server/lib/http.ts), and a door that reads it
 * itself reads it before it does anything. So a press refused that way was not done, and asking it again does it once.
 * A request still refused after the last ask throws that refusal, and the press or the page shows its sentence as it
 * shows any refusal. Any other failure is thrown at once.
 */
async function askedAgainWhileWindowsIsSlow<T>(ask: () => Promise<T>): Promise<T> {
  for (let asked = 1; ; asked += 1) {
    try {
      return await ask()
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'senderNotReadInTime' || asked > ASKED_AGAIN_AT_MOST) throw error
      for (const tell of whileWindowsIsSlow) tell()
      await new Promise((later) => setTimeout(later, THE_WAIT_BEFORE_ASKING_AGAIN))
    }
  }
}

/**
 * A PLAIN FETCH ASKED AGAIN WHILE WINDOWS IS SLOW, as askedAgainWhileWindowsIsSlow asks a request, for a caller that
 * reads the reply itself. As every request of the page does, it goes where whereRequestsGo says this page's requests go,
 * and names the page's project with moleOfficeHeaders. A reply refused with `senderNotReadInTime` is asked again. Any
 * other reply is handed back at once. When the last ask is refused too, its reply is handed back, and the caller says
 * what it says of any reply that failed.
 */
async function aFetchAskedAgainWhileWindowsIsSlow(path: string, init: Omit<RequestInit, 'headers'>): Promise<Response> {
  /** Every reply, so the last one can be handed back when it was refused too. */
  const replies: Response[] = []
  try {
    return await askedAgainWhileWindowsIsSlow(async () => {
      // A CALLER THAT ASKS FOR COOKIES IS SENT AS EVERY REQUEST OF THE PAGE IS: both halves at home, neither on a trip.
      const heldByAPress = theHoldOnThisRequest()
      if (heldByAPress !== undefined) await heldByAPress
      const carries = init.credentials === 'include' ? whatARequestCarries(path, moleOfficeHeaders()) : { headers: moleOfficeHeaders() }
      const reply = await fetch(whereRequestsGo(path), { ...init, ...carries })
      replies.push(reply)
      if (reply.ok) return reply
      let body: unknown = null
      try {
        body = JSON.parse(await reply.clone().text())
      } catch {
        // NOT JSON, so it is not the refusal this asks again.
      }
      const refusal = failed(readFault(reply.status, path, body))
      if (refusal.code !== 'senderNotReadInTime') return reply
      throw refusal
    })
  } catch (error) {
    const last = replies.at(-1)
    if (last !== undefined && error instanceof ApiError && error.code === 'senderNotReadInTime') return last
    throw error
  }
}

/** The reads out now, by what makes two of them the same read. */
const readsOut = new Map<string, Promise<unknown>>()
/** Moved by every write this page makes and by every event it is handed (src/web/lib/channel.ts). */
let generation = 0

/** Something changed: no read asked from now on joins a read asked before. */
export function aChangeWasHeard(): void {
  generation += 1
}

function theSameRead(path: string, init: RequestInit, reads: 'json' | 'text' | 'bytes'): string {
  const headers = [...moleOfficeHeaders(init).entries()].map(([k, v]) => `${k}:${v}`).sort()
  return [String(generation), reads, whereRequestsGo(path), ...headers].join('\n')
}

/**
 * WHAT A REQUEST MADE WITH `reads` 'bytes' ANSWERS ON SUCCESS: the body's bytes, exactly as the
 * browser received them, and the reply's headers.
 *
 * IT IS NOT A BLOB. A caller that wants one makes it, so nothing here decides which type a download
 * is, and a caller that wants to read a reply header can. A refusal is never in this shape: it is
 * JSON, and it is read and parsed exactly as every other refusal is.
 */
export interface TheBytesThatAnswered {
  bytes: ArrayBuffer
  headers: Headers
}

/**
 * `reads` IS 'text' FOR A DOOR THAT ANSWERS A FILE'S OWN TEXT, such as one file of a resident's
 * personal space, and 'bytes' for a door that answers a file's own bytes, such as a zip export. A
 * reply that succeeded is then handed back as its text or its bytes, unparsed. A refusal is read
 * exactly as every other refusal is, because the doors refuse in JSON whatever they answer on success.
 */
async function theRequestItself<T>(path: string, init: RequestInit, reads: 'json' | 'text' | 'bytes'): Promise<T> {
  // NOT WHILE A PRESS THAT SETS THE COOKIE HALF IS OUT, unless this is that press (src/web/lib/the-device-half.ts). When
  // nothing holds the request it goes at once, in the same turn its caller asked for it.
  const heldByAPress = theHoldOnThisRequest(init)
  if (heldByAPress !== undefined) await heldByAPress
  const carries = whatARequestCarries(path, moleOfficeHeaders(init))

  let res: Response
  // WHERE THE API IS, worked out from the address bar and the port this page was told. It used to be
  // a path, resolved against the page's own origin — and in development that origin was Vite, which
  // proxied on to loopback and lost which machine was calling.
  // `src/web/lib/api-address.ts` has the whole account.
  const at = theApiUrlFor(path)
  try {
    // WHERE THIS REQUEST GOES. The path unchanged for a page at home, which is what every request in
    // this app has always been; the same path at another world's address while this page is
    // visiting one. Criterion C7: *"enter" points the page's API at that world.*
    //
    // AT HOME IT CARRIES THE COOKIE HALF, beside the header half. Criterion P83, point 2. A
    // cookie is not attached to a cross-origin request unless the page asks for credentials, and `npm run dev` serves the page
    // from Vite on one port and the API on another — so without this the browser is never paired in
    // development even though the pairing press set the cookie. `npm run serve` serves the page from
    // the API itself and is same-origin, so this changes nothing there. The server's CORS
    // registration allows credentials for exactly the origins it already admits. ON A TRIP IT CARRIES
    // NEITHER HALF: `whatARequestCarries` in src/web/lib/visiting.ts has the rule (SEC-2's design, item 2).
    res = await fetch(whereRequestsGo(path), { ...init, ...carries })
  } catch (err) {
    // NOTHING ANSWERED. The server process being down is the most common cause, and it is what a
    // person needs told. Status 0 means "the request never reached anyone"; the route and the
    // browser's own words about the failure are kept on the fault, for Developer mode.
    throw failed({
      kind: 'unreachable',
      message: cannotReach(),
      said: null,
      path,
      status: 0,
      // NOTHING ANSWERED, so nobody wrote a short reason. The one sentence there is is the message.
      reason: null,
      detail: readStoredWord('frameFiles.api.requestThrew', { at: content(at), reason: content(errorMessage(err)) }),
      stored: null,
      elsewhere: null,
    })
  }

  /**
   * WHICH MOLE OFFICE ANSWERED — criterion G3, and it is checked before the body is even read.
   *
   * The server puts the world on every reply. This page remembers the world of its first reply, and
   * a reply from any other world is thrown away rather than drawn: problem 21 asks
   * diagnostics to tell *a successful request* from *a successful request to the wrong Mole Office
   * world*, and rendering the second one is exactly the green health check that problem asks to end.
   *
   * NOT ON A STATUS THAT MEANS NOTHING ANSWERED. A 502 from the thing in front of a stopped API
   * carries no world header because no Mole Office wrote it, and calling that a change of world
   * would put a banner about the wrong server over a page whose server is simply down. That fault
   * has its own sentence, three lines below.
   */
  if (!nothingAnswered(res.status)) {
    // `res.headers?` because a `Response` is not always a real one. Several tests hand this
    // transport a stub with a body and no headers, and a reply carrying no headers is exactly
    // "this reply did not say which world it came from", which is a state `theWorldThatAnswered`
    // already answers honestly: silence before any world is known, a refusal after one is.
    // HOW OLD THE ANSWERING SERVER'S CODE IS, off the same reply. It is read here rather than
    // asked for separately, so the page learns it from the requests it was making anyway. A reply
    // with no such header says nothing, which is what a server too old to send one really means.
    howOldTheServerSaysItIs(res.headers?.get(FRESHNESS_HEADER) ?? null)
    // THE MOVED-HOME HEADER GOES WITH THE WORLD, for criterion DF28: during this page's own data
    // folder move, a reply from the moved office whose header names its own database is the page's
    // new home and not another world. The OP3 reading below still reads the same header.
    const otherWorld = theWorldThatAnswered(
      res.headers?.get(WORLD_HEADER) ?? null,
      res.headers?.get(HOME_MOVED_HEADER) ?? null,
    )
    if (otherWorld !== null) {
      throw failed({
        kind: 'wrong-world',
        message: readStoredWord('frameFiles.api.otherWorld'),
        said: null,
        path,
        status: res.status,
        // This browser worked this out, not the server, so there is no short sentence from a door.
        reason: null,
        detail: otherWorld.map((one) => `${one.what}: was ${one.onThisPage}; is ${one.onTheServer}`).join('\n'),
        stored: null,
        elsewhere: null,
      })
    }
    /**
     * OP3. THE OFFICE HAS MOVED HOME, AND THIS REPLY SAID WHICH WORLD IS HOME NOW.
     *
     * The page was opened against the world that answered, and the server recognised the home this
     * page remembered as its own former home: it named the world that is home now on this one
     * header. The page adopts it, so the very next request carries the new home instead of the one
     * it outlived, and one plain line says so. The head beside it is the answering world's own, so
     * the line and the visiting strip keep naming the same commit.
     */
    const movedHome = res.headers?.get(HOME_MOVED_HEADER) ?? null
    if (movedHome !== null && movedHome.trim() !== '') {
      const said = movedHome.trim()
      const answered = theWorldThatAnsweredLast()
      adoptTheHomeWorld({
        database: said,
        head: answered !== null && answered.database === said ? answered.head : null,
      })
    }
  }

  // A REPLIED FILE'S OWN BYTES, before anything tries to read them as text. Only a successful reply
  // takes this path: a refusal is JSON, and it is read below as every refusal is.
  if (reads === 'bytes' && res.ok) return { bytes: await res.arrayBuffer(), headers: res.headers } as T
  const text = await res.text()
  if (reads === 'text' && res.ok) return text as T
  let body: unknown = null
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      throw failed({
        kind: 'broken',
        message: readStoredWord('frameFiles.api.notJson'),
        said: null,
        reason: null,
        path,
        status: res.status,
        detail: readStoredWord('frameFiles.api.notJsonDetail', { status: res.status, path: content(path), body: content(text.slice(0, 200)) }),
        stored: null,
        elsewhere: null,
      })
    }
  }

  if (!res.ok) {
    const fault=readFault(res.status, path, body)
    noteAnUnprovedIdentity(fault.code)
    throw failed(fault)
  }

  return body as T
}

/**
 * The one sentence for a server that is not answering, written once.
 *
 * Every page that could not read anything says this, so a reader who has four failed panels on the
 * Schedule reads one fact four times rather than four routes. It is read from the word lists when the
 * fault is made, in the page's language; under Node, where unit tests call readFault, it is English.
 */
function cannotReach(): string {
  return readStoredWord('frameFiles.api.cannotReach')
}

/** The five statuses that mean the thing behind this page is not running. */
function nothingAnswered(status: number): boolean {
  return status === 0 || status === 502 || status === 503 || status === 504
}

/**
 * WHAT THE SERVER'S REPLY MEANS, worked out once from the status and the body.
 *
 * The body may carry four things: `error`, the sentence a person reads; `reason`, the same refusal
 * in one short sentence; `detail`, the same refusal with the exact header or request in it; and
 * `elsewhere`, set only when a record was found in another project. All four are declared by
 * `PanelError` in src/server/lib/records.ts and sent by the one error handler in
 * src/server/lib/http.ts, so this reads a shape rather than guessing one.
 */
export function readFault(status: number, path: string, body: unknown): Fault {
  const at = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const said = typeof at['error'] === 'string' ? (at['error'] as string) : null
  const coded = readRefusal(at['code'], at['values']) ?? {}
  const reason = typeof at['reason'] === 'string' ? (at['reason'] as string) : null
  const detail = typeof at['detail'] === 'string' ? (at['detail'] as string) : null
  const raw = at['elsewhere']
  const elsewhere =
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as Elsewhere).title === 'string' &&
    typeof (raw as Elsewhere).workspaceId === 'string' &&
    typeof (raw as Elsewhere).recordId === 'string'
      ? (raw as Elsewhere)
      : null
  // THE RECORD THE REPLY NAMED, when an error answer still stored one. A refusal that stored
  // nothing has no `record` here, which is every fault but the retired send's 409.
  const held = at['record']
  const stored =
    typeof held === 'object' && held !== null && typeof (held as { id?: unknown }).id === 'string'
      ? (held as { id: string }).id
      : null

  // A GATEWAY STATUS WITH NOTHING TO SAY IS NOT A REFUSAL. 502, 504 and a 503 carrying no readable
  // message come from the thing in front of the server rather than from the server, so there is no
  // sentence about this request to show. The reader is told the one true thing: nothing answered.
  //
  // A GATEWAY STATUS THAT CARRIES THE SERVER'S OWN WORDS IS A DIFFERENT EVENT, and this used to
  // swallow it. Mole Office runs on loopback with nothing in front of it; a 503 whose body is
  // `{"error": "the sessions store is unavailable"}` was answered BY the server, which was well
  // enough to say why it could not help. Replacing that with "Mole Office cannot reach its own server"
  // tells the reader something false and throws away the only sentence that could be acted on.
  // `tools/review.mjs` proves this by mocking exactly that reply and requiring the words on screen in Developer mode,
  // the only mode that draws them (decision z_A0xVMbWOzh).
  //
  // So the test is not the status, it is whether anything could speak. Nothing readable means
  // nothing answered; a readable message means something answered and said why, whatever number it
  // put on the front.
  if (nothingAnswered(status) && said === null) {
    return { kind: 'unreachable', message: cannotReach(), said: null, path, status, reason, detail, stored, elsewhere: null }
  }
  if (said === null) {
    return {
      kind: 'broken',
      message: readStoredWord('frameFiles.api.nothingReadable'),
      said: null,
      path,
      status,
      reason,
      detail: readStoredWord('frameFiles.api.noErrorMessage', { status, path: content(path) }),
      stored,
      elsewhere: null,
    }
  }
  if (elsewhere !== null) return { ...coded, kind: 'elsewhere', message: said, said, path, status, reason, detail, stored, elsewhere }
  if (status === 404) return { ...coded, kind: 'not-here', message: said, said, path, status, reason, detail, stored, elsewhere: null }
  if (status >= 500) return { ...coded, kind: 'broken', message: said, said, path, status, reason, detail, stored, elsewhere: null }
  return { ...coded, kind: 'refused', message: said, said, path, status, reason, detail, stored, elsewhere: null }
}

/** An `ApiError` whose message is the fault's sentence, so anything that only reads `.message` is right. */
function failed(fault: Fault): ApiError {
  return new ApiError(fault.status, fault.message, fault)
}

/** The internal name, kept so the call sites in the parts of src/web/api-parts/ read as they always did. */
export const request = moleOfficeRequest

export const json = (value: unknown) => JSON.stringify(value)

// ---------------------------------------------------------------------------- what comes back
/**
 * The reply bodies, typed whole.
 *
 * Each interface below mirrors the type the route declares on the server, named in its comment.
 * They are re-declared rather than imported because the browser bundle must not reach into
 * src/server — importing a route file for a type would pull the database client into the page.
 * Where a shape already lives in src/shared it IS imported (Change, PanelRecord, Incompleteness),
 * because that directory exists to be the one definition both ends read.
 */

/**
 * A record on the records list, with how many required fields it is still missing.
 *
 * Mirrors `RecordListItem` in src/server/api/records.ts. The count is spread onto the record by
 * the server rather than wrapped around it, and it is recomputed on every read — there is no
 * stored completeness anywhere, which is why a record written before a spec changed still gets
 * the right badge.
 */
export type RecordListItem = PanelRecord & { incompleteCount: number }

/** One comment, cut by the shared tuples to the fields the pages read (`aCommentRowForThePage`). */
export type CommentOnThePage = ACommentOnThePage<ACommentWithItsWrittenOrder>

/**
 * The record list, and where the page sits in the whole list.
 *
 * Mirrors `RecordListReply` in src/server/api/records.ts. `matched` is how many the filter found
 * before anything was cut, `returned` how many came back, `left` what this reply did not carry, and
 * `next` the request that carries the next page, or null when nothing was left.
 */
export interface RecordListReply {
  records: RecordListItem[]
  matched: number
  returned: number
  left: number
  truncated: boolean
  next: string | null
  /**
   * Present only when the call asked for `tally`: how many records each group of kinds holds, and
   * every record no group holds, whichever page was asked for.
   */
  tally?: { everything: number; families: Record<KindFamily, number>; unfiled: RecordListItem[] }
  /** Present only when the call asked for `projects`: the ids of the projects read. */
  projects?: string[]
  /** Present only when the call asked for `farEnds`: the live records one link away from a row, in the light shape. */
  farEnds?: RecordListItem[]
}

export type { ReportsAndNotesReply, ReportsAndNotesRow }

/** What the Everything page asks `GET /api/records` for: one page, over every row. */
export interface RecordsPageAsk {
  kind?: RecordKind
  family?: KindFamily
  /** Words to look for, by the rule `GET /api/search` reads. */
  q?: string
  sort: CatalogueColumn
  direction: SortDirection
  limit: number
  offset: number
  /**
   * Which projects to read: every project, or one by its id. Left out, the
   * door reads the project the request's header names, as it always has.
   */
  projects?: ProjectChoice
}

/** What the Messages page asks `GET /api/messages` for: one page, over every message. */
export interface MessagesPageAsk {
  /** A participant as kind:id, the way `participantKey` writes one. */
  sender?: string
  contact?: string
  group?: string
  state?: PoolStateChoice
  words?: string
  limit: number
  offset: number
}

/**
 * What filing a record under a run name did to the change log.
 *
 * Mirrors `SessionBinding` in src/server/lib/records/session-names.ts. It comes back on a 201 only when the
 * record being filed was a `session` and the write carried `x-mole-office-session`: that claims the
 * run name for the new record and repoints every change row already stored under the raw name.
 *
 * `alreadyBoundTo` is the half that must never be swallowed. It means the name belongs to
 * ANOTHER session, so nothing was bound and no row moved — a caller that cannot see it walks
 * away believing its history has been joined up when it has not.
 */
export interface SessionBinding {
  name: string
  recordId: string
  /** Change rows that carried the raw name and now carry the record id. */
  repointed: number
  /** Set when the name already belonged to another session, in which case nothing was bound. */
  alreadyBoundTo: string | null
  note: string
}

/** A record, plus what it is still missing. Mirrors `RecordReply` in src/server/api/records.ts. */
export interface RecordReply {
  record: PanelRecord
  /** Empty when the record is complete. Each entry names a field and describes it. */
  incomplete: Incompleteness[]
  /** The same news in one sentence, sent only when there IS news. */
  incompleteNote?: string
  /**
   * Present only when filing this record also claimed a run name for it — see SessionBinding.
   *
   * It was missing from this mirror while the server was already sending it, which is the same
   * bug as a wrapper dropping a key, one layer up: the bytes arrive, and no code in the browser
   * can name them. tests/panels-follow.test.ts reads this field off a real 201, so the mirror
   * cannot fall behind the route again without the typecheck failing.
   */
  sessionBinding?: SessionBinding
  /**
   * Live records in this project that were ALREADY called exactly what was just stored.
   *
   * A REPEATED TITLE HAS BEEN STORED AND REPORTED RATHER THAN REFUSED SINCE 17 AUGUST 2026. The
   * owner overturned the refusal that day: id is identity, title is presentation, and titles may
   * repeat. Nothing here was refused and nothing was merged. This is what else answers to the name.
   *
   * A SCREEN THAT CANNOT NAME THIS FIELD CANNOT SAY WHAT ELSE IS CALLED WHAT SOMEBODY JUST TYPED.
   * That was the state of this file until 18 August 2026: the server sent both keys on every
   * create and no code in the browser could reach them, so two forms that wanted to ask "there is
   * already work called this — did you mean it?" had to leave the question out and say why in a
   * comment. Absent when nothing else holds the name, which is the ordinary case.
   *
   * BOTH WRITES ANSWER IT. `POST /api/records` has since the refusal was overturned, and
   * `PATCH /api/records/:id` since 18 August 2026, so a rename says what a create says.
   */
  sameTitle?: { id: string; kind: RecordKind; title: string }[]
  /**
   * The same news in one sentence, present exactly when `sameTitle` is.
   *
   * IT IS WRITTEN FOR AN API CALLER and names the requests that undo the repeat, so a screen
   * showing it verbatim would be showing a person a DELETE request. Show the list instead, in
   * words a person reads.
   */
  sameTitleNote?: string
  /**
   * Present when a message's words seem to hold a key: which shape, where, its first four characters and its length.
   * The message was stored as written.
   */
  keyReminder?: AKeyReminder
  /** Present when a report write points local media into a sandbox or worktree. The write is kept. */
  reportFileReminder?: AReportFileReminder
}

/** What a `dataPatch` merge really did. Mirrors `DataPatchOutcome` in src/server/lib/records/merge-data.ts. */
export interface DataPatchOutcome {
  changed: string[]
  /** Paths whose key was REMOVED, because the patch sent null. A null is never stored. */
  deleted: string[]
  unchanged: string[]
  alreadyAbsent: string[]
  note: string
}

/** The PATCH reply: a record reply, plus the merge report when the write was a merge. */
export interface RecordPatchReply extends RecordReply {
  dataPatch?: DataPatchOutcome
  /**
   * Present exactly when the patch named a `kind`, and it is the half a screen must show.
   *
   * A field the new kind has no place for is MOVED into `extra` rather than dropped, and `kept`
   * names every one of them and where it went. A caller that shows only the new kind has thrown
   * away the only report that a person's stored answers went somewhere else.
   *
   * IMPORTED FROM THE SERVER'S OWN DECLARATION, like every other shape in this file, so a field
   * added there cannot go unnamed here.
   */
  kindChange?: KindChangeOutcome
}

/**
 * WHAT `PATCH /api/records/:id` ANSWERS, with the two fields a form needs to write again on what it just stored. The
 * route sends both on every reply (src/server/api/records.ts); they are named here for the one call that reads them,
 * `updateRecord`, so the other doors typed `RecordPatchReply` claim nothing more.
 */
export interface RecordChangeReply extends RecordPatchReply {
  /** The version the record holds after this write: the `ifVersion` of the next write built on it. */
  version: string
  /** The revision this write stored, or null when it stored none because nothing changed. */
  newSeq: number | null
}

/** One end of a link, as the 201 names it. Mirrors `LinkEnd` in src/server/api/links.ts. */
export interface LinkEnd {
  id: string
  title: string
}

/**
 * The 201 from POST /api/links. Mirrors `LinkReply` in src/server/api/links.ts.
 *
 * IT USED TO BE `{id}` AND THIS WRAPPER USED TO HAND BACK THE BARE STRING. Five of the seven
 * agents that recorded this pass through the API said the bare id told them nothing, so the route
 * now answers with both ends, the type that was really stored — which is not always the type that
 * was sent, because omitting it stores `relates_to` — and the sentence. Unwrapping to `id` after
 * that is a drop, not an unwrap, which is why `POST /api/links` is no longer in
 * UNWRAPPED_ENVELOPES and why every caller now takes `.id` off the reply itself.
 */
export interface LinkReply {
  id: string
  type: LinkType
  from: LinkEnd
  to: LinkEnd
  note: string
}

/**
 * WHAT HAPPENED TO ONE RECORD AND TO THE WORK IT CARRIES. Mirrors GET /api/records/:id/history.
 *
 * `read.sources` is the server's own sentence about what it looked at, and it is drawn as written.
 * A second telling of it in the browser could disagree with the read it describes.
 */
export interface RecordHistoryReply {
  subject: { id: string; kind: string; title: string; workspaceId: string }
  /** Every record whose rows are in this reading, and why each one is in. */
  scope: { id: string; because: 'itself' | 'carries' }[]
  events: HistoryEvent[]
  read: { sources: string }
}

/**
 * WHAT ONE RESTRICTION SAYS, AS IT REACHES ONE RECORD. Mirrors `RestrictionReading` on the server.
 *
 * IT IS THE SERVER'S TYPE RE-DECLARED RATHER THAN IMPORTED, for the reason every other reply shape
 * in this file is: the browser must not pull `src/server/lib/restrictions.ts` into its bundle, and
 * that module opens the database at import. What stops the two drifting is the same thing that
 * stops every other pair in this file drifting — nothing, and so the fields are kept to the ones a
 * screen reads and each one is named for what it is.
 *
 * THERE IS NO `valid`, NO `tainted` AND NO `blocked` KEY, and there must not be one. What comes
 * back is: this record is reached by that restriction, at this distance, through these links, and
 * its author wrote these two lists. Whether a particular assertion falls inside *geometric
 * accuracy* is reading, and a machine doing it would be inventing a judgement.
 */
export interface RestrictionReading {
  restrictionId: string
  kind: RestrictionKind
  title: string
  /** One of three authored words. The server narrows a stored value to this list before sending. */
  severity: RestrictionSeverity
  /** The author's strings, unchanged. Mole Office never re-words, summarises or merges these. */
  allowedUses: string[]
  disallowedClaims: string[]
  /** The field key this restriction holds, when it holds one and this is the record it is about. */
  holdsField: string | null
  reach:
    | { how: 'direct' }
    | { how: 'carried'; through: string; carriedFrom: string }
    | { how: 'depends'; distance: number; path: { linkId: string | null; type: string; recordId: string }[] }
  standing:
    | { state: 'active' }
    | { state: 'resolved-unchecked'; resolvedAt: string; resolvedBy: string; revalidationId: string | null }
    | { state: 'resolved'; resolvedAt: string; resolvedBy: string }
}

/**
 * EVERY RESTRICTION REACHING ONE RECORD, as `GET /api/records/:id` carries it.
 *
 * `couldNotCheck` IS ON IT ALWAYS AND IS NEVER THE SAME AS AN EMPTY ANSWER. Without it, *no
 * restrictions* and *nobody looked* are one reply, which is the thing this whole feature exists to
 * prevent, so the panel that draws it always offers it.
 */
export interface RestrictionsOnRecord {
  found: RestrictionReading[]
  skippedDeleted: number
  couldNotCheck: { what: string; because: string }[]
}

/** What one judgement wrote, as PUT /api/revalidations/:restriction/:record answers. */
export interface JudgementReply {
  row: {
    id: string
    restrictionId: string
    recordId: string
    state: string
    decidedBy: string | null
    decidedAt: string | null
    note: string | null
  }
  created: boolean
  note: string
}

/** Everything one record's page needs. Mirrors the return type of GET /api/records/:id. */
export interface RecordDetail {
  record: PanelRecord
  incomplete: Incompleteness[]
  /**
   * WHO FILED THIS AND FROM WHICH RUN, with that run's model, or null when no create row is recorded. Mirrors
   * `FiledFrom` in src/server/lib/records.ts; `run` is the change log's own session block. Problem 2tbFWxiFyjtv.
   * Optional so a reply built by hand in a test that is not about it still types.
   */
  filedFrom?: { actorType: string; actorId: string; run: ChangeSession | null } | null
  /**
   * The token to send back as `ifVersion` on a write built from this read, and half of a revision.
   *
   * IT WAS ON THE WIRE AND UNNAMED HERE. The route has sent it since compare-and-set existed and
   * no type in the browser admitted to it, so nothing in the browser could say which version of a
   * record it had just drawn.
   */
  version: string
  /**
   * WHICH REVISION HOLDS EXACTLY WHAT THIS READ HANDED BACK, or null when the ledger holds none.
   *
   * Asked of the ledger by content rather than "the newest row", so it really is the revision this
   * reader read. With `version` above it is the pair a comment stores as the revision it was
   * written against — see `revisionToStamp` below, which is the one place that decision is made.
   */
  revisionSeq: number | null
  /**
   * THE TWO FACTS THE `History` CONTROL IS DRAWN FROM. Both of them, never one.
   *
   * `versions` alone is not enough to draw a truthful control: on a record whose one version is the
   * row the ledger backfill wrote, a badge reading `History 1` offers a reader a past that was never
   * stored, and 361 of the owner's 707 records are exactly that. `baselineOnly` is what lets the
   * control drop the numeral there and say `History` — the word, with nothing promised behind it.
   *
   * IT IS THE SERVER'S ANSWER AND THE BROWSER DOES NOT RECOMPUTE IT. The control is drawn on the
   * record header before the revisions listing has been fetched, so a browser-side copy worked out
   * from the listing would be a second reading of one fact, arriving later, able to disagree.
   */
  history: { versions: number; baselineOnly: boolean }
  /**
   * WHAT THE REPLY LEFT OUT, present only on a flow or a decision read without ?secondLevel=show. Mirrors
   * `SecondLevelHeld` in src/server/lib/flow-reasons.ts; `getRecord` reads it to know whether to ask again.
   */
  secondLevel?: { held: string[]; ask: string }
  /**
   * Every link, with how much each one blocks.
   *
   * `GatedLink`, not `ResolvedLink`: the server puts every link through `readLinkGate` and sends
   * `gate`, `gateLabel` and `gateProblem` on all of them. This said `ResolvedLink[]` for as long as
   * the gate fields have existed, so they arrived in the JSON and no type in the browser named them
   * — LinkPanel.tsx had to keep its own optional copy to read a page's own reply.
   */
  links: GatedLink[]
  changes: Change[]
  /**
   * WHAT AN AGENT DID HERE ON THE PERSON'S OWN QUOTED WORDS, newest first. Empty is the ordinary
   * answer, and it means nobody has acted on their words on this record.
   *
   * THE SHAPE IS THE SERVER'S, imported rather than restated: the words, who said them, where and
   * when, what the write did, and whether they have taken it back. A second declaration here is the
   * defect that made `GatedLink` above take three commits to get right.
   */
  onThePersonsWords: ActOnTheirWords[]
  /**
   * WHERE THE QUESTION ON THIS RECORD IS: with the starter of the agent that asked, or with the
   * person. Criterion P55.
   *
   * PRESENT ONLY WHERE SOMETHING ASKS THE PERSON SOMETHING, the way `resolution` is present only on
   * a proposal. On every other record the reading would be a sentence saying nothing is happening,
   * and drawing that everywhere would be noise on nearly every page in the product.
   *
   * THE SHAPE IS THE SERVER'S, imported rather than restated, for the reason `onThePersonsWords` above
   * gives: a second declaration here is a reply and a renderer coming apart.
   */
  whereTheQuestionIs?: WhereTheQuestionIs
  /**
   * THE PERSON'S PRESS ON A WAITING ASK — on a `role_request` nobody has answered, read by the person,
   * and absent everywhere else. The shape is the one the agent's page draws its card ask in.
   */
  waitingForThePersonsPress?: WaitingCardAsk
  /**
   * THE PRESS THAT WITHDRAWS A NEW-KEY GRANT NOBODY COLLECTED — on a granted, uncollected new-key ask, read by the
   * person, and absent everywhere else, as point 9 of a decision says.
   */
  grantToWithdraw?: AGrantToWithdraw
  /**
   * WHERE A NEW-KEY ASK STANDS, in one sentence of the server's — on a new-key ask, for every reader,
   * and absent everywhere else. Problem sgjHE9R2vSEZ.
   */
  whereTheAskStands?: string
  /**
   * WHERE A KEY ASK CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED — on a new-key ask or a waiting
   * registration, for every reader, and absent everywhere else. Finding 83, mend b2.
   */
  theAsk?: WhatAnAskShows
  /**
   * WHAT THIS RECORD MAY NOT BE USED TO CLAIM, from the one reader, on every kind.
   *
   * ALWAYS PRESENT, because an absent key and an empty list would be the same thing to a caller and
   * they are not the same fact. It was on the wire from the wave that built it and no type in the
   * browser named it, so no page could read it — see components/Restrictions.tsx.
   */
  restrictions: RestrictionsOnRecord
  /**
   * WHETHER PICKING THIS RUN UP AGAIN IS EXPENSIVE — on a `session`, and absent on every other kind.
   * Criterion T6.
   *
   * The server computes it from the run's own usage receipt and its own idle stamp and sends the
   * whole warning, so the run's page draws the same words the Embassy row and the composer draw.
   * Null means no warning was earned. Absent means the record is not a run.
   */
  pickUpCost?: PickUpCost | null
  /**
   * THE WORKERS THIS RUN ASKED THE OFFICE TO START — on a `session`, and absent on every other kind. Wave 13j round
   * loop-4. Read on the server by `theWorkersARunStarted` (src/server/lib/worker-runs.ts) and drawn by
   * components/TheWorkersOfARun.tsx. Null means the run asked for no worker.
   */
  workers?: TheWorkersARunStarted | null
  /**
   * THE SUPERVISOR'S RUN THAT ASKED FOR THIS RUN AS A WORKER'S — on a `session`, and absent on every other kind. Wave 13j
   * round loop-5. Read on the server by `theRunThatAskedForThisWorker` (src/server/lib/worker-runs.ts) and drawn by
   * components/TheWorkersOfARun.tsx. Null means no run did.
   */
  askedForBy?: TheRunThatAskedForAWorker | null
  reportConfirmation?: ReportConfirmation
  /**
   * Whether a fork has been settled, and by what. Present ONLY for a `proposal` — the server sends
   * it for that kind and no other, because there is nothing for it to mean elsewhere.
   *
   * Declared here because the browser draws the governance act off it. It was already on the wire
   * and unused; a page reading a field the type did not admit to is how a reply and a renderer come
   * apart, so the type says what the server sends.
   *
   * `by[]` mirrors `ResolvingDecision` in src/server/lib/records/fork-settled.ts, and the last three matter more
   * than they look. **A link carries its own author, and an agent may file one.** So `linkedBy` is
   * the difference between "the owner settled this" and "something pointed an existing decision at
   * this fork". The decision itself is human-written either way — that is the guard — but who joined
   * the two is a separate fact, and this type used to drop it on the floor, leaving the page no way
   * to draw it even if somebody wanted to.
   */
  resolution?: {
    resolved: boolean
    by: { id: string; title: string; deleted: boolean; linkId: string; linkedBy: string; linkedByType: ActorType | null; linkedAt: string; replacedBy: { id: string; title: string } | null }[]
    note: string
  }
  /**
   * THE DECISIONS AN OPEN FORK MAY BE CLOSED BY: every live decision in its project that names it, newest first.
   * Present only on a `proposal` nothing settles yet. Mirrors `decisionsThatNameIt` in src/server/api/records.ts.
   */
  decisionsThatNameIt?: { id: string; title: string; decidedBy: string | null }[]
  /** Mirrors `replacesCandidates` in src/server/api/records.ts; present only on an open proposal. */
  replacesCandidates?: { id: string; title: string; sharedSubject: string }[]
  /**
   * ON A DECISION: the mark it carries when it is in the person's name and its reference is not the person's own record,
   * or null. Mirrors `notOnThePersonsOwnWords` in src/server/api/records.ts.
   */
  notOnThePersonsOwnWords?: NotOnThePersonsOwnWords | null
  /** ON A NOTE PREPARED FOR THE PERSON TO FILE: the note the person filed from it, or null while nobody has pressed. */
  filedAsThePersonsWords?: { id: string; title: string } | null
  /**
   * ON A DECISION: the decision that stands in its place, or null because none replaced it. Mirrors `replacedBy` in
   * src/server/api/records.ts, which `whatSupersedes` in src/server/lib/replaced-decisions.ts answers.
   */
  replacedBy?: { id: string; title: string } | null
  /**
   * ON A DECISION: the decisions that replaced it directly, filed first first, or an empty list because none has.
   * Mirrors `replacedDirectlyBy` in src/server/api/records.ts (wave 13s round 104, item 15).
   */
  replacedDirectlyBy?: { id: string; title: string }[]
  /**
   * ON A SECRETARY'S DUTIES: each decision they rest on that a newer decision replaced, with the decision that stands in
   * its place. Mirrors `restsOnReplacedBy` in src/server/api/records.ts.
   */
  restsOnReplacedBy?: Record<string, { id: string; title: string }>
}

/**
 * One session named by a set of change rows, resolved to its record.
 *
 * Mirrors `SessionInRows` in src/server/lib/records/session-names.ts. This is how a change row gets a readable
 * name: `Change.sessionId` holds a record id like `NS6wp_rmduzo` (or, when nothing answers to
 * the reference an agent sent, the raw run name), and this block is the server's own resolution
 * of those stored values into titles. A page that renders `sessionId` without it is printing an
 * identifier where a name belongs.
 */
export interface ChangeSession {
  /** The value stored on the rows: a record id once resolved, a run name when not. */
  stored: string
  recordId: string | null
  title: string | null
  matchedBy: 'recordId' | 'name' | 'title' | 'unresolved' | 'elsewhere'
  /** How many of the returned rows carry this value. */
  rows: number
  /** True when these rows carry a name that no session record answers to. */
  unresolved: boolean
  /**
   * The project the session is filed in, when it is NOT this one. Null otherwise.
   *
   * Moving a record between projects carries its history and deliberately leaves the session that
   * wrote it where it was — attribution is provenance, not ownership — so a change row can name a
   * session this project does not hold. That is not the same as a name nothing answers to, and
   * drawing it as one is a false statement about the workspace. `recordId` and `title` stay NULL
   * here on purpose: this project may say WHERE the session is, and may not read into it.
   */
  elsewhereIn: string | null
  /**
   * The model the run was started on, as stored, or null when its record names none. Drawn by name. The server
   * always sends it; it is optional so a block built by hand in a test that is not about models still types.
   */
  model?: string | null
}

/** How a `?session=` filter was understood. Mirrors `ChangeSessionFilter` in api/queries.ts. */
export interface ChangeSessionFilter {
  asked: string
  param: 'session' | 'sessionId'
  matchedBy: 'recordId' | 'name' | 'title' | 'unresolved'
  recordId: string | null
  title: string | null
  names: string[]
  matchedValues: string[]
  /** Rows matching the filter that still store a run name — all of them, not just this page. */
  storedByName: number
  note: string
}

/** The change log reply. Mirrors `ChangesReply` in src/server/api/queries.ts. */
export interface ChangesReply {
  changes: Change[]
  /** Present only when a session filter was asked for. */
  session?: ChangeSessionFilter
  /** The sessions the returned rows name, resolved to their records. */
  sessions: ChangeSession[]
  /** How many rows match the filter in total. `changes` is capped; this is not. */
  matched: number
  /** True when the cap cut the list short — `changes` is a page of `matched`. */
  truncated: boolean
  /** What the runs this record's change log names spent on it. Present only when a record was asked for. */
  spent?: SpentOnThis
}

export interface UnmetItem {
  consumer: PanelRecord
  missingTitle: string
}

// ----- what needs a person today

/**
 * Was this machine looked at, and where did it look?
 *
 * Mirrors `MachineSweepReport` in src/server/api/queries.ts. It exists so that an empty `machine`
 * list can never be read as a clean machine: the number of unclaimed processes is set by the
 * operating system rather than by the research, finding it out means reading /proc and asking the
 * GPU, and that is too much to do on every page load. So the sweep is asked for, and the reply
 * always says which of the two an empty list is.
 */
export interface MachineSweepReport {
  swept: boolean
  /** Where the sweep looked, in plain English. Empty when it did not run. */
  searched: string[]
  /** Places it could not look at all, in the probe's own words. */
  unchecked: string[]
  note: string
}

/**
 * The whole answer to "what needs me today", as the server computed it.
 *
 * `AttentionResult` is IMPORTED from src/shared/attention.ts rather than copied here, because that
 * is the rule itself and both ends read it. What is added below is only what the ROUTE adds:
 * `at` and `read` from `AttentionReading` in src/server/lib/records.ts, and `machineSweep` from
 * src/server/api/queries.ts. Those two are re-declared because the browser bundle must not reach
 * into src/server — importing a route file for a type would pull the database client into the page.
 *
 * EACH LIST IN THIS TYPE IS WHOLE, AND THE DOOR NO LONGER SENDS THEM SO. `api.attention()` asks `shape=full`
 * and answers `AttentionFullReply` from src/server/lib/attention-shapes.ts. There `visible` is whole, and
 * each other list (remainder, unclassified, noState, directions, reports, paused, machine and passedOver)
 * comes as a page: its rows, its total, and a link to the next page, which is null on the last page.
 * The rows of `visible` and `remainder` still carry their own `reason`, and the other lists' rows do not.
 * This type is what `machineSummary` takes, once a caller has followed a list to its last page.
 * tests/attention.test.ts follows every page of a real reply.
 */
export type AttentionReply = AttentionResult & {
  /** The moment the rule was run against, as a stored stamp. */
  at: string
  /** What was read to answer, so a short list can be told from a small database. */
  read: {
    records: number
    links: number
    changes: number
    /** True when the log was longer than the cap and the oldest rows were not read. */
    changesCapped: boolean
  }
  machineSweep: MachineSweepReport
}

/**
 * HOME'S FIRST PAGE OF THE ATTENTION ANSWER, which is what the frame and Home read in both modes.
 *
 * `AttentionFirstPage` is imported from src/shared/attention-first-page.ts, which the server builds it
 * with; `at` and `read` are what the route adds, as on `AttentionReply` above. The question lists and
 * the reports already read are counts here; `api.attentionPart` reads a page of one of them.
 */
export type AttentionHome = AttentionFirstPage & Pick<AttentionReply, 'at' | 'read'>

/**
 * HOME'S FIRST PAGE FOR EVERY OTHER PROJECT, in one reply. Mirrors `AttentionOfOtherProjects` in
 * src/server/lib/attention-shapes.ts. `leftOut` is the project the request named.
 */
export interface AttentionOfOtherProjects {
  leftOut: string
  projects: { workspaceId: string; reading: AttentionHome }[]
}

// ----- the reader anchor

/**
 * Where one reader has read to. Mirrors `ReaderAnchor` in src/server/lib/records.ts.
 *
 * It is keyed by the PERSON — `human:<their id>` — and not by the browser, which is the whole point:
 * the phone is always the second browser, so a mark kept in one browser's local storage was one
 * the phone could never read and never move.
 */
export interface ReaderAnchor {
  reader: string
  /** The wall-clock moment they last looked, in the stored local form. */
  lastSeenAt: string
  /**
   * The newest change row they had seen, or null.
   *
   * NULL IS A REAL ANSWER: they looked and there was nothing to see. That is not the same as
   * having no anchor at all, which is `anchor: null` on the reading below.
   */
  lastChangeId: string | null
}

/** What has changed since this reader last looked. Mirrors `AnchorReading` in lib/records.ts. */
export interface AnchorReading {
  reader: string
  /** Null when this reader has never looked. `note` says so in words. */
  anchor: ReaderAnchor | null
  /**
   * The rows written since the anchor, newest first.
   *
   * NULL, NOT AN EMPTY ARRAY, when there is no anchor. "Nobody has looked yet" and "nothing has
   * happened" must not draw the same, and an empty list beside a cheerful 200 reads as the second.
   */
  changes: Change[] | null
  counts: {
    /** Rows written since the anchor. Null when there is no anchor to count from. */
    sinceAnchor: number | null
    returned: number
    /** Rows in the whole log, so an empty "since" can be told from an empty database. */
    everything: number
  }
  /** True when more rows are new than were returned. `counts.sinceAnchor` is still the true one. */
  truncated: boolean
  note: string
}

/** The result of moving the anchor. Mirrors `AnchorMove` in src/server/lib/records.ts. */
export interface AnchorMove {
  reader: string
  anchor: ReaderAnchor
  /** Where the anchor was before this call. Null when this reader had never looked. */
  previous: ReaderAnchor | null
  note: string
}

// ----- discharging a promise

/**
 * What recording a kept promise did. Mirrors the reply of POST /api/records/:id/fulfil.
 *
 * `alreadyDischarged` is the half that must not be swallowed: discharging an obligation that was
 * already discharged writes NOTHING and says so, rather than moving `fulfilledAt` to today for a
 * promise kept last week. A caller that cannot see it reports a write that never happened.
 */
export interface DischargeReply extends RecordReply {
  /** What the record now says about the promise, read back through shared/work.ts. */
  fulfilment: Fulfilment
  alreadyDischarged: boolean
  /** The sentence. Named apart from `incompleteNote`, which answers a different question. */
  dischargeNote: string
  /** Which paths moved. Absent when nothing was written. */
  dataPatch?: DataPatchOutcome
}

// ----- the facts a review is made of

/**
 * What a period that has been really contains. Mirrors the reply of
 * GET /api/planning/review/:horizon/:period.
 *
 * THE THREE OUTCOMES ARE NOT TWO. `done` and `dropped` are what somebody said became of a slice;
 * `unfinished` is every allocation still sitting at `planned` after the period has gone, which is
 * neither of them — it is time that was intended and nobody said what happened to it. It is the
 * commonest outcome and the one a review that only counted successes and cancellations would lose.
 *
 * `carried` is a different question again, and it is read off the WORK rather than the allocation:
 * completing a slice never completes the work it names, so a week can be four finished slices of a
 * task that is still not done. Rows appear in both lists when both are true of them.
 *
 * The lists are AllocationWithWork, so a row that names a record which has since been deleted is
 * still here with `work: null` rather than quietly missing from the count.
 */
export interface ReviewReply {
  horizon: Grain
  period: string
  /** The local days the period covered, both ends included. */
  from: string
  to: string
  /** The arithmetic at THIS horizon, with how many rows each total could not count. */
  load: Load
  /** Hours the period held, or null when nobody ever said. Null is not zero. */
  capacity: Capacity | null
  counts: {
    allocations: number
    done: number
    dropped: number
    /** Left at `planned`. Neither finished nor dropped — see the header. */
    unfinished: number
    /** How many named work that is still not done. */
    carried: number
    /** How many recorded hours actually spent. `allocations - actualStated` did not. */
    actualStated: number
  }
  /** Allocations per project, because a week that spanned three of them is not one number. */
  byProject: Record<string, number>
  done: AllocationWithWork[]
  dropped: AllocationWithWork[]
  unfinished: AllocationWithWork[]
  carried: AllocationWithWork[]
  /** The whole of the above in one statement, written by the server. */
  note: string
}

/**
 * The day, as the server's own clock has it. Mirrors the reply of GET /api/planning/today.
 *
 * `recurring` IS NOT THE PLAN. It is what comes round today and is not on it — offered, never
 * written. Putting one on today creates an ordinary allocation, and finishing that allocation
 * finishes today and never the recurring work itself. An empty list means nothing comes round
 * today that is not already planned; it cannot be read as "no routines exist", because a routine
 * whose occurrence is already on today is filtered out by the route.
 */
export interface TodayReply {
  /** The server's local day, week and month. The caller does not compute these. */
  day: string
  week: string
  month: string
  allocations: AllocationWithWork[]
  capacity: Capacity | null
  recurring: { recurrence: Recurrence; work: AllocatedWork | null }[]
  note: string
}

/**
 * The plans, with what each one is missing hours for. Mirrors the reply of GET /api/plans.
 *
 * `closed` counts the plans that have ended, whichever list was asked for, so the press under the
 * grid can say how many it would show.
 */
export interface PlansReply {
  plans: PlanSummary[]
  closed: number
  note: string
}

/**
 * ONE ANSWER ON A PLAN'S WORK, as the plan's read hands it over.
 *
 * The link says which work and which planned state, and which of the two ways it answered
 * (`realises` or `instead_of`). The titles are the records' LIVE titles, so a renamed record shows
 * its new name. `by` is null for a link written before the office recorded which kind of actor
 * wrote it; a reader says "not recorded" rather than guessing who it was.
 */
export interface PlanAnswer {
  id: string
  workId: string
  workTitle: string | null
  toId: string
  toTitle: string | null
  type: AnsweringLinkType
  at: string
  by: { actorType: ActorType; actorId: string } | null
}

/**
 * One plan read for display. Mirrors the reply of GET /api/plans/:id/blocks.
 *
 * `blocks` says how each line is DRAWN and nothing else — nothing in a plan is parsed for meaning.
 * `lines` carries the same lines with the record each filed one names, which is where the record's
 * live title comes from. The two disagree when somebody renamed the record, and the page draws
 * both rather than repairing either.
 */
export interface PlanBlocksReply {
  plan: Plan
  /**
   * The token naming what this plan holds: its title, its state and its lines.
   *
   * Send it back as `ifVersion` on a write and a save built on a copy somebody has already replaced
   * is refused with 409 rather than written over the newer work. A page that reads a plan and later
   * saves it MUST carry this from one to the other; without it a save is built on a copy it cannot
   * name, and the refusal cannot happen.
   */
  version: string
  blocks: PlanBlock[]
  lines: PlanLineWithWork[]
  /** Every answer on the work these lines name, and no answer on work they do not name. */
  answers: PlanAnswer[]
  note: string
}

/**
 * WHICH COPY OF A PLAN A WRITE IS BUILT ON, or why there is none to build it on (problem GR4LcaNI-XZk).
 *
 * `version` is sent as `ifVersion`. `why` says, in the page language, that the stored plan no longer matches what the
 * page holds, so nothing may be written until a person has looked.
 */
export type VersionToWriteOn = { ok: true; version: string } | { ok: false; why: string }

/**
 * What was written to a plan since you read it. Mirrors the reply of GET /api/plans/:id/since-read.
 *
 * It cannot say which lines were added and which were changed, and it does not guess: nothing
 * stores when a line first appeared. `neverRead` means nobody has marked this plan as read, so
 * there is nothing for "since" to mean — which is not the same as nothing having been written.
 */
export interface PlanSinceReadReply {
  readAt: string | null
  written: PlanLine[]
  writtenBy: string[]
  neverRead: boolean
  /** The secretary that marked the plan as read under the person's grant, by name, and the grant; null for a person's mark. */
  markedUnderTheGrant: { secretary: string; grant: string | null } | null
  note: string
}

/**
 * The shapes the pages read, handed on from the server's own declarations rather than restated.
 *
 * A page imports these from here so that nothing under src/web has to reach into src/server for a
 * type. They are type-only and are erased at build, so re-exporting them bundles nothing.
 */
export type {
  AnnotationReadings,
  AnnotationView,
  AnnotationWhere,
  LineBound,
  LineFiled,
  MoveReport,
  Plan,
  PlanContext,
  PlanLine,
  PlanLineWithWork,
  PlanReview,
  PlanReviewsReply,
  PlanSummary,
  InterpreterRequest,
  OrganiseOutcome,
  ReviewDetail,
  ReviewListReply,
  ReviewMember,
  ReviewReach,
  ReviewScope,
  ReviewState,
  ReviewView,
  SendOutcome,
  WhereOneCommentGoes,
  WhereTheyGo,
  WorkListReply,
  WorkPageReply,
  WorkPageRow,
  WorkRow,
}

// ---------------------------------------------------------------------------- which revision was read

/**
 * WHICH REVISION OF EACH RECORD THIS BROWSER HAS DRAWN A PAGE FROM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS REMEMBERED AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * A comment carries the revision it was written against, and that is what lets Mole Office later say
 * *the text has changed since you wrote this* instead of guessing. The pair to send is `revisionSeq`
 * and `version` from ONE read of the record — and the honest read is the one the page in front of
 * the person was drawn from, not a fresh one taken at the moment they press Add.
 *
 * So every read that draws a record puts its pair here, and the composer compares. Nothing is
 * stored between visits: a page this browser has not read has no entry, which is a real answer.
 *
 * IT IS ONE MAP AND NOT A FACT KEPT TWICE. The pair is written only by `getRecord`, which is the
 * one call a page draws a record from, and read only by `revisionForComment`.
 */
const revisionDrawn = new Map<string, Revision>()

/** Remember what a page-drawing read handed back, and hand the reply on unchanged. */
export function rememberRevision(reply: RecordDetail): RecordDetail {
  if (reply.revisionSeq !== null) {
    revisionDrawn.set(reply.record.id, { seq: reply.revisionSeq, contentHash: reply.version })
  } else {
    // NO ENTRY IS BETTER THAN A STALE ONE. The ledger holds nothing with this content, so there is
    // no revision to name, and an older remembered pair would name a revision nobody is looking at.
    revisionDrawn.delete(reply.record.id)
  }
  return reply
}

/** What this browser last drew a page of this record from, or null because it never has. */
export function revisionOnScreen(recordId: string): Revision | null {
  return revisionDrawn.get(recordId) ?? null
}

/** What to stamp a comment with, and whether the page it was written on is out of date. */
export interface RevisionToStamp {
  /** The pair to send as `context.revision`, or null when Mole Office must not claim one. */
  revision: Revision | null
  /**
   * TRUE WHEN THIS BROWSER DREW THE RECORD AND IT HAS CHANGED SINCE.
   *
   * Then nothing is stamped: the person is looking at older words than the ones stored, so neither
   * revision is a true answer to "what were they written against". The screen says so, because a
   * comment written on text that has already moved is worth knowing about before it is written.
   */
  changedSinceDrawn: boolean
}

/**
 * WHICH REVISION A COMMENT WRITTEN NOW WAS WRITTEN AGAINST. Arithmetic over two readings.
 *
 * `drawn` is what the page in front of the person was drawn from, or null when this browser never
 * read the record — a row in a list carries a title and no version. `now` is what the record is at
 * the moment of writing.
 *
 *   the ledger holds nothing with this content  → stamp nothing. There is no revision to name.
 *   this browser never drew it                  → stamp what it is now. The read is the evidence.
 *   the page was drawn from what it still is    → stamp that. This is the ordinary case.
 *   the page was drawn from something older     → STAMP NOTHING, and say so.
 *
 * The last line is the whole point of comparing. Stamping the newest revision there would claim the
 * person had read the newest one, and nothing measured that.
 *
 * Exported so a test can put every case without a browser and without a server.
 */
export function revisionToStamp(
  drawn: Revision | null,
  now: { seq: number | null; contentHash: string },
): RevisionToStamp {
  if (now.seq === null) return { revision: null, changedSinceDrawn: false }
  if (drawn === null) return { revision: { seq: now.seq, contentHash: now.contentHash }, changedSinceDrawn: false }
  if (drawn.contentHash === now.contentHash) return { revision: drawn, changedSinceDrawn: false }
  return { revision: null, changedSinceDrawn: true }
}

/**
 * The field a record's estimate is stored in, named ONCE for the browser.
 *
 * It is declared on the server, in `effortField` in shared/kinds/kind-common.ts, and read back by
 * `resolveAllocated` in server/lib/planning.ts — which is what fills `estimateHours` on every row of
 * the work list. This constant is the browser's writer for the same field, so the two could drift:
 * rename the field there and this would go on writing the old key.
 *
 * WHAT STOPS THAT IS A TEST, not this comment. tests/panels-follow.test.ts writes an estimate through
 * `api.setEstimateHours` and reads it back off `GET /api/work`, so the day the writer and the reader
 * stop naming the same field, that round trip fails.
 *
 * NULL CLEARS IT, and clearing it is not writing zero: absent means nobody has sized this work, and
 * zero would mean somebody looked and said it takes no time.
 */
export const ESTIMATE_FIELD = 'effort_hours'

// ---------------------------------------------------------------------------- who a comment could go to

/**
 * WHAT THE RECIPIENT RANKING CAN BE ASKED ABOUT, worked out from a thing somebody pointed at.
 *
 * The ranking reads three questions: which agent touched a RECORD, which one touched a LINE OF A
 * PLAN, and which one touched a BLOCK ON THE WEEK. Everything else a person can point at either
 * lives inside a record — a block of a report, a row, a cell, a node of a drawing, a note somebody
 * left — or lives in none.
 *
 * A THING INSIDE A RECORD IS ASKED ABOUT AS THAT RECORD, and which of its values holds the record
 * id is already declared once, as `recordIdentifier` in src/shared/targets.ts. So this reads the
 * declaration instead of listing the kinds again, and a kind added there is asked about without
 * anybody editing this file.
 *
 * IT USED TO NAME THREE KINDS BY HAND, and the ones it did not name were sent as nothing: a comment
 * on a paragraph of a report asked the ranking about NOTHING, so the panel answered "You did not
 * point at anything" underneath a chip naming the paragraph, and every agent that had worked on
 * that report was left off the list. Measured in the browser on 18 August 2026.
 *
 * NULL MEANS THE RANKING CANNOT READ THIS KIND OF THING, which is a real answer and not a failure:
 * nothing Mole Office holds says which agent worked on a page or on an unsent instruction. The picker
 * asks this same function so that it can say which of the two happened — one answer to that
 * question, in one place, rather than one on each side free to disagree.
 */
export type RankingAsk =
  | { kind: 'record'; recordId: string }
  | { kind: 'planLine'; planId: string; lineId: string }
  | { kind: 'scheduleBlock'; windowId: string }

/**
 * THE QUERY STRING A RANKING ASK BECOMES, for both recipient routes. One function, so the run list
 * and the agent ranking are always asked about the same thing. Empty when nothing was pointed at.
 */
export function rankingQuery(ask: RankingAsk | null): string {
  const q = new URLSearchParams()
  if (ask !== null) {
    if (ask.kind === 'record') q.set('record', ask.recordId)
    if (ask.kind === 'planLine') {
      q.set('plan', ask.planId)
      q.set('line', ask.lineId)
    }
    if (ask.kind === 'scheduleBlock') q.set('window', ask.windowId)
  }
  return q.toString()
}

export function rankingAsk(context: MessageContext | null): RankingAsk | null {
  if (context === null) return null
  const target: Target = objectOf(context)
  const holdsRecord = targetSpec(target.kind).recordIdentifier
  if (holdsRecord !== null) {
    const recordId = (target as unknown as Record<string, string | undefined>)[holdsRecord] ?? ''
    return recordId === '' ? null : { kind: 'record', recordId }
  }
  if (target.kind === 'planLine') return { kind: 'planLine', planId: target.planId, lineId: target.lineId }
  // A FACT BESIDE A LINE IS RANKED AS ITS LINE. The agents who worked on the line are the ones who
  // know about its size, its time and its project.
  if (target.kind === 'planLineFact') return { kind: 'planLine', planId: target.planId, lineId: target.lineId }
  if (target.kind === 'scheduleBlock') return { kind: 'scheduleBlock', windowId: target.windowId }
  return null
}

/**
 * WHAT A CALLER ASKS A COPY OF THIS PROJECT FOR. The three axes and the two lists, as one shape.
 */
export interface BundleAsked {
  scope?: string
  preset: string
  slots?: readonly string[]
  reach?: number
  modulesAndPipelines?: readonly string[]
  additionalRecords?: readonly string[]
  detail?: string
  /** How far every part moves from the level its share chose, negative for less. B31. */
  shift?: number
}

/**
 * THAT QUESTION AS A QUERY STRING, WRITTEN IN ONE PLACE.
 *
 * Two callers now build it: the preview, which fetches the text, and the plain-text page, which is
 * an address a browser opens. They ask the same server for the same copy, so a difference between
 * them would be a page of text that is not the copy on the screen — and nothing would fail.
 * Criterion B29, and the ninth invariant.
 *
 * SENT WHOLE, NEVER FILTERED HERE. A name the server does not know is refused with a sentence a
 * person can read; dropping it in the browser would be the same silent narrowing the server door
 * stopped doing.
 */
export function bundleAsked(query: BundleAsked): string {
  return (
    `preset=${encodeURIComponent(query.preset)}` +
    (query.scope === undefined ? '' : `&scope=${encodeURIComponent(query.scope)}`) +
    (query.slots === undefined ? '' : `&slots=${encodeURIComponent(query.slots.join(','))}`) +
    (query.reach === undefined ? '' : `&reach=${String(query.reach)}`) +
    (query.modulesAndPipelines === undefined
      ? ''
      : `&modulesAndPipelines=${encodeURIComponent(query.modulesAndPipelines.join(','))}`) +
    (query.additionalRecords === undefined
      ? ''
      : `&additionalRecords=${encodeURIComponent(query.additionalRecords.join(','))}`) +
    (query.detail === undefined ? '' : `&detail=${encodeURIComponent(query.detail)}`) +
    (query.shift === undefined ? '' : `&shift=${String(query.shift)}`)
  )
}

// ---------------------------------------------------------------------------- endpoints

/**
 * THE COUNTERS OF THE PROJECT ON SCREEN. Criteria CT1 and CT8 of design/counters/ACCEPTANCE.md.
 *
 * `counters` is the door's own reading of every counter, sorted by title, and `says` is the
 * sentence the door wrote about the list: the count in it, or the sentence that an empty project
 * has no counters. The page draws that sentence rather than writing a second one of its own, so an
 * empty list and a list of twelve cannot drift from what the door says.
 */
export interface CountersReply {
  workspaceId: string
  counters: CounterReading[]
  says: string
}

/**
 * THE COUNTERS OF THE PROJECTS CHOSEN, for the Counters page under All projects.
 * `GET /api/counters?projects=`. Each counter names the project it is in.
 */
/** `GET /api/checklists?projects=`: the checklists of the projects read, each naming its project. */
export interface ChecklistsAcrossReply {
  projects: string[]
  checklists: ChecklistReading[]
  says: string
}

/** `PATCH /api/checklists/:id/items/:item`: the changed item, its checklist and the door's sentence. */
export interface ChecklistItemReply {
  item: ChecklistRequest
  checklist: ChecklistReading
  says: string
}

export interface CountersAcrossReply {
  projects: string[]
  counters: (CounterReading & { workspaceId: string })[]
  says: string
}

/**
 * ONE COUNTER, ITS ROWS AND ITS CHANGES. `GET /api/counters/:id`.
 *
 * `rows` is newest first and `more` says whether an older page exists. `changes` is every change
 * somebody made to the counter's definition, with who, when and why, oldest first.
 */
export interface CounterDetailReply {
  workspaceId: string
  counter: CounterReading
  rows: CounterRowReading[]
  more: boolean
  changes: CounterChange[]
}

/** What a pause or a resume answered: the counter as it now stands, and the door's own sentence. */
export interface CounterPressReply {
  workspaceId: string
  counter: CounterReading
  says: string
}

/** One named address from GET /api/office/machine-names. */
export interface OfficeMachineName {
  address: string
  name: string
}

/** The whole table returned by GET /api/office/machine-names. */
export interface OfficeMachineNamesReply {
  machines: OfficeMachineName[]
}

/** What POST /api/office/machine-names says it stored, in its stored forms. */
export interface OfficeMachineNameWriteReply extends OfficeMachineNamesReply {
  stored: { address: string; name: string | null }
}

/** A setting whose last recorded change is kept in the office's change log. */
export type OfficeSettingChangeName = 'agents-may-inject' | 'what-is-kept' | 'machine-names' | 'dead-letter-secretary' | 'address-for-browsers' | 'merge-queue-owner' | 'module-reminder-secretaries' | 'plugin-switches' | 'gpu-watcher' | 'usage-notice-secretary' | 'usage-decision'

/** The one address a page load is sent to, as GET and POST /api/office/address-for-browsers answer it. */
export interface OfficeAddressForBrowsers {
  /** The address page loads are sent to now, or null when nothing is sent. */
  inForce: string | null
  /** What the person chose, or null when nobody has. */
  chosen: string | null
  /** What MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES names, in force when nobody has chosen. */
  fromTheEnvironment: string | null
}

/** One secretary that may be reminded about a project's modules, as GET /api/office/module-reminder-secretaries lists it. */
export interface AModuleReminderSecretaryChoice {
  id: string
  handle: string
  name: string
}

/** What is in force for one project, and where it came from. src/server/lib/module-reminder-secretaries.ts. */
export type AModuleReminderSecretaryInForce =
  | { from: 'set here'; agent: AModuleReminderSecretaryChoice }
  | { from: 'set here, cannot remind'; stored: string; storedName: string; cannotBecause: 'not registered' | 'retired' | 'not a secretary' }
  | { from: 'from the .env line'; handle: string }
  | { from: '.env line unreadable' }
  | { from: 'nobody named' }

/** Who is reminded about each project's modules, set here or by the .env line. Decision aZGg6gerakM1. */
export interface OfficeModuleReminderSecretariesReply {
  projects: {
    project: string
    title: string
    inForce: AModuleReminderSecretaryInForce
    storedHere: string | null
    because: string | null
    envNames: string | null
    says: string
  }[]
  envLine: { readable: true; named: Record<string, string> } | { readable: false; why: string }
  envNamesUnknownProjects: string[]
  mayBeChosen: AModuleReminderSecretaryChoice[]
}

/** One agent that may be named the GPU watcher, as GET /api/office/gpu-watcher lists it. */
export interface AGpuWatcherChoice {
  id: string
  handle: string
  name: string
}

/** Who is the GPU watcher now, and where that came from. src/server/lib/gpu-watcher.ts. */
export type TheGpuWatcherInForce =
  | { from: 'the .env line'; handle: string; agent: AGpuWatcherChoice | null }
  | { from: 'set here'; agent: AGpuWatcherChoice }
  | { from: 'set here, cannot watch'; stored: string; storedName: string; cannotBecause: 'not registered' | 'retired' }
  | { from: 'nobody named' }

/** Who is the GPU watcher, set here or by the .env line, as GET and POST /api/office/gpu-watcher answer it. */
export interface OfficeGpuWatcherReply {
  inForce: TheGpuWatcherInForce
  /** The registry id the setting holds, or null because it names nobody or was never set. */
  stored: string | null
  /** Whether anybody has set the setting. False means no change to it is kept. */
  everSet: boolean
  /** The reason given with the newest change, or null. */
  because: string | null
  says: string
  mayBeNamed: AGpuWatcherChoice[]
}

/** One agent that may take the dead letters, as GET /api/office/dead-letter-secretary lists it. */
export interface ADeadLetterSecretaryChoice {
  id: string
  handle: string
  name: string
}

/** Who takes the dead letters, or why nobody does. Problem 0WUuvB0IhRfb. */
export interface OfficeDeadLetterSecretaryReply {
  named: ADeadLetterSecretaryChoice | null
  nobodyBecause: 'nobody chose' | 'not registered' | 'retired' | 'no act' | null
  stored: string | null
  storedName: string | null
  act: string
  says: string
  mayBeNamed: ADeadLetterSecretaryChoice[]
  lettersFromThePersonWaiting: number
}

/** One agent that may own the merge queue, as GET /api/office/merge-queue-owner lists it. */
export interface AMergeQueueOwnerChoice {
  id: string
  handle: string
  name: string
}

/** Who owns the merge queue, or why nobody does. A decision set this up. */
export interface OfficeMergeQueueOwnerReply {
  named: AMergeQueueOwnerChoice | null
  nobodyBecause: 'nobody chose' | 'not registered' | 'retired' | 'not a secretary' | null
  stored: string | null
  storedName: string | null
  says: string
  mayBeNamed: AMergeQueueOwnerChoice[]
}

/** The latest recorded change to one setting. */
export interface OfficeSettingChange {
  by: { type: string; id: string }
  at: string
  field: string
  from: unknown
  to: unknown
}

/** The latest recorded change to each setting whose history the office keeps. */
export interface OfficeSettingChangesReply {
  settings: Record<OfficeSettingChangeName, OfficeSettingChange | null>
}

/**
 * THE DOORS THAT CALL `fetch` THEMSELVES STAY IN THIS FILE, which tests/workspace-switcher.test.ts holds. Every other
 * door is in a part of src/web/api-parts/, one part for each area of the territory map, so a line adds its doors to its
 * own part and not to one object every line changes. src/web/api-parts/join.ts joins them into this one `api` and
 * refuses a door that two parts both declare (wave 13y, round 68).
 */
const theDoorsThatFetch = {

  /**
   * The pictures this product offers, so a person picks one instead of finding a file on a disk.
   *
   * IT GIVES NOBODY A PICTURE. The picker fetches the bytes of the one that was pressed and sends
   * them through `sendAvatar` above, which is the same request a file chosen from a disk makes. So
   * there is one door and one set of rules about who may change whose picture. Criterion M30.
   */
  /**
   * The bytes of one offered picture, base64 encoded, ready for the upload door.
   *
   * IT IS HERE AND NOT IN THE PICKER, because every request the browser makes is made in this file:
   * that is what stops one of them forgetting to say who is asking or which project it is about.
   * `tests/workspace-switcher.test.ts` holds the rule by naming the three files that may call
   * `fetch` at all.
   *
   * A REQUEST THAT FAILED IS SAID AND NEVER TURNED INTO AN EMPTY PICTURE. `fetch` resolves for a
   * 404 as happily as for a 200, so the status is checked: without that, a missing file would be
   * posted as zero bytes and the door would refuse it with a sentence about an empty picture, which
   * is a true sentence about the wrong thing.
   */
  avatarOnOfferBytes: async (url: string, picture: string): Promise<string> => {
    // WHERE THIS REQUEST GOES, worked out in aFetchAskedAgainWhileWindowsIsSlow by the same function every other
    // request uses: the page's own origin in a build, the API's own door under `npm run dev`, and the visited
    // world's address while the page is visiting one.
    // WITH THE PAIRING COOKIE, as every other request of the page carries it. Item 1 of a decision
    // says so. On a trip it carries neither half, as every other request of the page does.
    const res = await aFetchAskedAgainWhileWindowsIsSlow(url, { credentials: 'include' })
    if (!res.ok) {
      throw new Error(
        `The ${picture} picture could not be fetched from the API, so nothing was sent and nothing was changed.`,
      )
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  },

  /**
   * WHETHER A PLUGIN PAGE'S FILE CAN BE LOADED, ASKED BEFORE ITS FRAME IS DRAWN (wave 13x round 15). The office cannot
   * see inside a sandboxed frame, so a page that was never built, or a plugin switched off since the list was read,
   * would otherwise show only as a page that never says it is ready. The door's sentence is handed back as it came.
   *
   * NO COOKIE IS SENT, because the door answers every caller with access-control-allow-origin *, which a browser
   * refuses for a request that carries one. The door reads neither the cookie nor the headers, so the frame, which sends
   * neither, is answered the same.
   */
  pluginPageFile: async (id: string, slug: string): Promise<{ loads: true } | { loads: false; said: string }> => {
    const res = await aFetchAskedAgainWhileWindowsIsSlow(pluginFileAddress(id, pluginPageFile(slug)), {
      credentials: 'omit',
      cache: 'no-store',
    })
    if (res.ok) return { loads: true }
    const text = await res.text()
    let body: unknown = null
    try {
      body = JSON.parse(text)
    } catch {
      // NOT JSON, so readFault says that nothing readable came back.
    }
    return { loads: false, said: readFault(res.status, pluginFileAddress(id, pluginPageFile(slug)), body).message }
  },

  /**
   * ONE READ VIEW OF INTERFACE V1, ASKED FOR A PLUGIN'S PAGE AS THE PERSON READING IT (wave 13x round 15). The status,
   * the version tag and the body are handed back as they came, so a refusal reaches the plugin in the office's own
   * words and a 304 is an answer, not a failure. `tag` is sent as If-None-Match.
   */
  pluginRead: async (
    view: string,
    query: Readonly<Record<string, string | number>> | undefined,
    tag: string | undefined,
    answers?: 'bytes',
  ): Promise<{ status: number; tag: string | null; body: unknown } | { status: number; tag: string | null; type: string | null; bytes: ArrayBuffer | null }> => {
    // THE SAME PATH AND QUERY THE SLOT MEASURED against READ_TARGET_LIMIT (wave 13y round 52).
    const heldByAPress = theHoldOnThisRequest()
    if (heldByAPress !== undefined) await heldByAPress
    const carries = whatARequestCarries(theTargetOfARead(view, query), moleOfficeHeaders())
    if (tag !== undefined) carries.headers.set('if-none-match', tag)
    const res = await fetch(whereRequestsGo(theTargetOfARead(view, query)), { ...carries, cache: 'no-store' })
    // Wave 13y round 44: both forms use the same request; bytes are neither decoded nor parsed here.
    if (answers === 'bytes') {
      return {
        status: res.status,
        tag: res.headers.get('etag'),
        type: res.status === 304 ? null : res.headers.get('content-type'),
        bytes: res.status === 304 ? null : await res.arrayBuffer(),
      }
    }
    const text = res.status === 304 ? '' : await res.text()
    let body: unknown = null
    if (text !== '') {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    return { status: res.status, tag: res.headers.get('etag'), body }
  },

  /**
   * ENTER A WORLD: register the trip with it, then point every request there.
   *
   * ONE PLAIN `fetch` AND NOT THE TRANSPORT ABOVE, and the reason is the whole of criterion G3. The
   * transport throws away a reply from a world this page did not open against, which is right for
   * every request this app makes by accident and wrong for the one it makes on purpose. This is that
   * one: a request sent to another world deliberately, before there is a visit for it to hold.
   *
   * THE PAGE RELOADS AFTERWARDS, which the caller does. Everything on screen was read from the world
   * this page was in a moment ago, and drawing it beside data from another world would be the mixed
   * state the whole of GROUND exists to prevent.
   */
  enterAWorld: async (
    world: { id: string; name: string; databaseIdentity: string; address: string; head: string | null },
    why: string,
  ): Promise<Visiting> => {
    const home = theWorldThisPageCallsHome()
    // A BROKEN ASSUMPTION RATHER THAN A REFUSAL, so it is thrown rather than dressed as an answer.
    // A page reaches this control only after reading a list of worlds, and reading anything is what
    // teaches it where it lives; a page here has not made a request at all.
    if (home === null) throw new Error('This page has not learnt which world it lives in, so it cannot leave it.')
    const where = `${world.address.replace(/\/+$/, '')}/api/office/visits`
    const res = await fetch(where, {
      method: 'POST',
      headers: moleOfficeHeaders({ body: '{}' }),
      body: JSON.stringify({ fromWorld: home, why }),
    })
    /**
     * READ AS TEXT FIRST, BECAUSE A REPLY THAT IS NOT THIS PRODUCT'S IS THE ONE THIS HAS TO SURVIVE.
     *
     * `res.json()` throws on an empty body, before any refusal path here runs, and what reaches the
     * reader is the browser's own sentence — *Failed to execute 'json' on 'Response': Unexpected end
     * of JSON input* — with no address in it and nothing to do about it. That is what a page got when
     * this was pointed at Vite: 404, Content-Length 0. Problem `nl5t16TMBKbF`. The address and the
     * status are what a person needs, and they are known here whatever came back.
     */
    const body = await res.text()
    let said: { visit?: { id?: string }; error?: string } = {}
    try {
      said = body.trim() === '' ? {} : (JSON.parse(body) as { visit?: { id?: string }; error?: string })
    } catch {
      // Catching to the letter of invariant 4: what is handled here is "that was not this product
      // answering", and what is done about it is to say so below with the address and the status,
      // rather than to let a parser's sentence stand in for a refusal.
      said = {}
    }
    if (!res.ok || typeof said.visit?.id !== 'string') {
      throw new Error(said.error ?? `${where} answered ${String(res.status)} and no visit came back`)
    }
    const trip: Visiting = {
      worldId: world.id,
      worldName: world.name,
      databaseIdentity: world.databaseIdentity,
      address: world.address,
      head: world.head,
      visitId: said.visit.id,
      workspaceAtHome: currentWorkspace(),
    }
    thisPageIsVisiting(trip)
    /**
     * AND THE PAGE TAKES THE VISITED WORLD'S DEFAULT PROJECT, and does not keep
     * the project of the world it came from.
     *
     * A project is a row in one database. The page used to carry the one it was reading across, and
     * the world it arrived in had never heard of it: measured in a browser against an empty second
     * world, every read answered 404 and the sidebar drew *There is no workspace called "panelx"*.
     * Problem `1qgF9RvsUloT`.
     *
     * THE DEFAULT AND NOT A GUESS AT THE FULLEST. Every migrated database has `default`, and it is
     * the one place a person can always be put down in a world they have never opened. Which project
     * they then read there is theirs to choose, and the switcher is where that is done.
     *
     * IT IS SET BEFORE THE RELOAD, so the page comes back up reading it. `setWorkspace` writes the
     * browser's store, which is what survives the reload.
     */
    setWorkspace(DEFAULT_WORKSPACE)
    return trip
  },

  /**
   * COME HOME: end the trip at the world being visited, then forget it.
   *
   * THE TRIP IS FORGOTTEN WHATEVER THE OTHER WORLD SAYS. A world that has stopped answering must not
   * be able to keep this page away from home, and the row it holds is closed by the same three
   * things that close any other — see criterion C3.
   */
  returnHome: async (): Promise<void> => {
    const trip = theVisitThisPageHolds()
    if (trip === null) return
    try {
      await fetch(`${trip.address.replace(/\/+$/, '')}/api/office/visits/${encodeURIComponent(trip.visitId)}/end`, {
        method: 'POST',
        headers: moleOfficeHeaders({ body: '{}' }),
        body: '{}',
      })
    } catch {
      // Catching to the letter of invariant 4: what is handled here is "the world being visited did
      // not answer", and what is done about it is to come home anyway and leave the row for the
      // three things that close one. A page held away from home by a stopped server would be worse.
    }
    thisPageIsHome()
    // AND THE PROJECT THEY WERE READING AT HOME, PUT BACK. Entering took the page to the visited
    // world's default; coming home undoes exactly that, or a trip would quietly change which
    // project they read when they get back. A trip written before this carries none, and then the
    // project is left alone.
    if (trip.workspaceAtHome !== undefined) setWorkspace(trip.workspaceAtHome)
  },
}

export const api = joinApiParts(theDoorsThatFetch, parts)

/**
 * WHICH REVISION A COMMENT ABOUT THIS THING WOULD BE WRITTEN AGAINST.
 *
 * ---------------------------------------------------------------------------------------
 * ONLY A THING THAT NAMES A RECORD HAS ONE
 * ---------------------------------------------------------------------------------------
 *
 * The ledger is of records, so a line of a plan, a block on the week and a page have no revision at
 * all — and Mole Office refuses a comment that claims one for them. WHICH KINDS NAME A RECORD IS READ
 * OFF THE DECLARATION, `recordIdentifier` in src/shared/targets.ts, rather than from a list here.
 *
 * ---------------------------------------------------------------------------------------
 * TWO READINGS, COMPARED, AND NEITHER OF THEM GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * One is what the page in front of the person was drawn from. The other is what the record is now.
 * `revisionToStamp` above is the whole decision and it is arithmetic; this only fetches.
 *
 * A FAILED READ STAMPS NOTHING AND REFUSES NOTHING. The comment is the durable fact and it is never
 * held up by a question about versions, so a server that will not answer this costs the stamp and
 * nothing else.
 */
/**
 * Who a comment goes to, in the shape the server takes. Built by `recipientForServer`, or by the review
 * pane from a contact of the chat, which names a durable agent by `agentId`.
 */
export interface ChosenRecipient {
  kind: RecipientKind
  /** Which durable agent, when the kind is `agent`. Left out for every other kind. */
  agentId?: string | null
  sessionId: string | null
  said: string | null
  why: string | null
}

/** What happened when a comment was handed to an agent. */
export interface CommentSent {
  outcome: DispatchOutcome
  /**
   * ALWAYS NULL NOW, AND KEPT SO THE SCREENS THAT READ IT DO NOT ALL HAVE TO CHANGE AT ONCE.
   *
   * It used to carry the failure of the PATCH that stamped the comment "sent" after the words had
   * gone — a real hole, because the send had happened and the comment still read as waiting. There
   * is no such PATCH any more: the message carries which comment it came from, and that is what
   * says the words went out, written in the same transaction that sent them.
   */
  notStamped: string | null
}

/**
 * HAND ONE COMMENT TO ONE AGENT: a conversation, the message, the dispatch, and then the stamp.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ONE FUNCTION AND NOT TWO COMPONENTS
 * ---------------------------------------------------------------------------------------
 *
 * The composer sends a comment as it is written, and the review pane sends one that was written
 * earlier. That is one sequence of four calls in a fixed order, and it was written out twice — the
 * defect this repository keeps finding.
 *
 * THE ORDER IS THE POINT. The note is written down before anything here runs, so a refusal at any
 * step leaves the person's words stored. The stamp is LAST, after the words have gone, because
 * "sent" means it has gone.
 *
 * A NOTE THAT HAS ALREADY GONE IS NOT SENT AGAIN, and this is where that is refused, because this
 * is the one place both callers go through. Two presses on one comment made two conversations, two
 * messages and two runs carrying the identical words, and the second one answered 200. The read is
 * the note's own stored state, taken here rather than trusted from whatever drew the button — a
 * screen that has not re-read since the first send is exactly the screen that offers the second.
 *
 * SENDING ONE COMMENT IS NOT SENDING A REVIEW, and nothing here claims it is. Mole Office does not send
 * a review at all: there is no call for it, and the pane says so instead of offering one.
 */
export async function sendOneComment(input: {
  noteId: string
  body: string
  context: MessageContext
  intent: MessageIntent
  recipient: ChosenRecipient
  title: string
}): Promise<CommentSent> {
  // THREE REQUESTS, NOT FIVE, AND NOTHING IS STAMPED AFTERWARDS.
  //
  // This used to read the comment's stored `state` first, refuse a second send from the browser,
  // and PATCH that same field to "sent" at the end inside a `try/catch` that reported `notStamped`
  // and changed nothing. Both halves are gone, and both were the same defect: "this comment has
  // gone out" was written down in a second place, by the browser, after the fact.
  //
  // The message now carries `fromAnnotationId`, and that IS the fact. The server refuses a second
  // message carrying a comment that has already gone, so the refusal is the product's rule rather
  // than this function's, and it holds for any caller of the route.
  const handed = await handOverToOneAgent({
    title: input.title,
    intent: input.intent,
    body: input.body,
    context: input.context,
    recipient: input.recipient,
    fromAnnotationId: input.noteId,
  })
  return { outcome: handed.outcome, notStamped: null }
}

/** A conversation started to carry one piece of work to one agent, and what came of sending it. */
export interface HandedOver {
  threadId: string
  outcome: DispatchOutcome
}

/**
 * START A CONVERSATION, PUT ONE THING IN IT, AND SEND IT. Three calls, in this order, once.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * Two surfaces hand something to one agent: the review pane sends one comment, and the same pane
 * asks an agent to read a whole review's comments. Both are the same three requests in the same
 * order, and the order is what makes them safe — nothing is sent until the words are on the server.
 * Written out twice, the two would be free to drift, which is the defect this repository keeps
 * finding.
 *
 * IT MAKES A RUN EXIST. `dispatchAgentThread` is the only call in this file that does, and a refusal
 * from it carries the server's own sentence naming what could not be routed.
 */
export async function handOverToOneAgent(input: {
  title: string
  intent: MessageIntent
  body: string
  context: MessageContext | null
  recipient: ChosenRecipient
  /** The comment these words came from, when they came from one. See the note in `sendOneComment`. */
  fromAnnotationId?: string | null
}): Promise<HandedOver> {
  const started = await api.newAgentThread({ title: input.title, mode: 'direct' })
  await api.addAgentMessage(started.thread.id, {
    intent: input.intent,
    body: input.body,
    context: input.context,
    recipient: input.recipient,
    fromAnnotationId: input.fromAnnotationId ?? null,
  })
  const outcome = await api.dispatchAgentThread(started.thread.id)
  return { threadId: started.thread.id, outcome }
}

/**
 * WHAT THE CONVERSATION THAT READS ONE REVIEW IS CALLED.
 *
 * ---------------------------------------------------------------------------------------
 * THIS NAME IS THE HANDLE, AND THAT IS A DECISION WORTH READING
 * ---------------------------------------------------------------------------------------
 *
 * Nothing in Mole Office stores "the conversation somebody started to have this review read": a review
 * row has no such field and an id kept in this browser would be gone on another machine and gone
 * after a clear. So the conversation is NAMED after the review, and the pane finds it again by that
 * name. One function writes the name and the same function is what the search compares against, so
 * the two cannot come apart.
 *
 * IT IS A LOOKUP AND NEVER A GUESS. Finding no conversation with this name means nobody has asked,
 * which is what the pane then says. It never decides that some other conversation was probably the
 * one.
 */
export function readingThreadTitle(reviewId: string): string {
  return `Read the comments in review ${reviewId}`
}

/**
 * ASK AN AGENT TO READ THE COMMENTS IN ONE REVIEW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS SENT IS MOLE OFFICE'S OWN QUESTION, UNCHANGED
 * ---------------------------------------------------------------------------------------
 *
 * `asked` comes from `askToOrganise` and is handed on exactly as the server wrote it. Nothing here
 * rewrites it, shortens it or adds to it: the request carries every comment's id and its words, and
 * a reading of a rewritten question would be a reading of something nobody asked.
 *
 * NOTHING IS ORGANISED BY THIS. It starts a run and that is all. What comes back is words, and words
 * become a reading only when somebody sends them to `keepOrganised`, which refuses anything that
 * cannot be traced back to the comments handed over.
 */
export async function askAnAgentToRead(input: {
  reviewId: string
  asked: string
  recipient: ChosenRecipient
}): Promise<HandedOver> {
  return handOverToOneAgent({
    title: readingThreadTitle(input.reviewId),
    intent: 'ask',
    body: input.asked,
    // NOTHING TO POINT AT. A review is not one of the things a comment can be about — see the target
    // vocabulary — and naming the record the review was started from would say this question is
    // about that record, which it is not. The request text names the review and every comment in it.
    context: null,
    recipient: input.recipient,
  })
}

/**
 * THE CONVERSATION THAT WAS STARTED TO READ THIS REVIEW, or null because nobody has asked.
 *
 * Two requests: the project's conversations, then the one with this review's name. It reads the
 * newest, because asking a second time after a first answer that was no good is an ordinary thing
 * to do and the older one is still there to look at.
 */
export async function findTheReadingAsked(reviewId: string): Promise<ThreadDetail | null> {
  const wanted = readingThreadTitle(reviewId)
  const listed = await api.agentThreads()
  const mine = listed.threads.filter((one) => one.title === wanted)
  if (mine.length === 0) return null
  const newest = [...mine].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
  if (newest === undefined) return null
  return api.agentThread(newest.id)
}

export async function revisionForComment(target: Target): Promise<RevisionToStamp> {
  const key = targetSpec(target.kind).recordIdentifier
  if (key === null) return { revision: null, changedSinceDrawn: false }
  const recordId = (target as unknown as Record<string, string | undefined>)[key] ?? ''
  if (recordId === '') return { revision: null, changedSinceDrawn: false }
  try {
    return revisionToStamp(revisionOnScreen(recordId), await api.recordNow(recordId))
  } catch {
    return { revision: null, changedSinceDrawn: false }
  }
}

/**
 * The endpoints whose reply is ONE key, and the key each one is unwrapped to.
 *
 * Unwrapping a one-key envelope loses nothing: `{records: [...]}` carries one thing, and handing
 * back that thing is the whole of it. Every other wrapper above returns the reply as it came.
 *
 * This is a list rather than a comment because tests/panels-follow.test.ts reads it: it takes the
 * server's real reply for each endpoint and fails if the wrapper hands back less than the server
 * sent — and an entry here for a reply that has grown a second key fails it too, because the day
 * that happens is the day the unwrap starts dropping something.
 */
export const UNWRAPPED_ENVELOPES: Readonly<Record<string, string>> = {
  // `GET /api/records` WAS HERE AND IS NOT ANY MORE, for the reason the paragraph above gives and
  // the reason `GET /api/queries/unconsumed` left below. The reply grew `matched`, `returned`,
  // `left`, `truncated` and `next` when the list learned to take a `limit` (F15 point 3's friction:
  // the whole list was 20,323,600 bytes and `limit` was refused outright). Unwrapping to `records`
  // would have handed the browser the page and dropped every fact about what was left of it.
  // `GET /api/queries/unconsumed` WAS HERE AND IS NOT ANY MORE, which is this list working exactly
  // as the paragraph above says it should. The reply grew a second key — `counted`, which is what
  // tells "everything is built on" apart from "there is nothing of the sort on file" — so the
  // wrapper stopped unwrapping and hands the whole reply on. Leaving the entry would have meant the
  // wrapper dropping the new number on the floor, which is the day this list exists to catch.
  'GET /api/queries/unmet': 'items',
}

/**
 * ONE PARTICIPANT AS THE SERVER HANDS IT BACK.
 *
 * Written here rather than imported, because the shape lives in src/server/api/participants.ts and
 * the browser may not import from src/server — a value import would pull better-sqlite3 into the
 * page bundle. `tests/participants-routes.test.ts` drives the real routes and reads these fields off
 * the bytes, so a field renamed on the server fails there rather than only here.
 */
export interface ParticipantOnTheWire {
  startedBy?: { kind: string; id: string } | null
  workArea?: string[] | null
  kind: string
  id: string
  name: string
  handle: string
  avatarUrl: string
  state: string | null
  stateAt: string | null
  createdAt: string
  /** Which world this one is a citizen of, or null because nothing could identify one. Criterion C1. */
  homeWorld: string | null
  /**
   * HOW THIS ONE WISHES TO BE ADDRESSED, in their own words. A
   * part left out is a part nobody has set; an empty object is somebody who has set none.
   */
  addressAs: AddressAs
  addressAsSetBy: AddressAsSetBy
  runtime?: string | null
  /**
   * THE HARNESS THE AGENT'S RECORD NAMES, as stored, or null because it names none. Any harness's word: for one the
   * office has no adapter for, `runtime` is null and this still names it. Absent from an older server.
   */
  harness?: string | null
  /**
   * TRUE ON AN AGENT WHEN A LISTED AGENT REGISTERED EARLIER BEARS THE SAME NAME, so the chat draws a
   * small "new" mark beside this one (problem hqbovBMnTu-z). Never on a person; absent from an older
   * server.
   */
  newerOfASharedName?: boolean
  retired?: boolean
  retiredBecause?: string | null
  /**
   * WHEN THE AGENT WAS RETIRED, criterion I4. Null on a live row and on a row retired before the
   * column existed, which is a date nobody recorded rather than a date to invent.
   *
   * The server already sent this; the browser's mirror of its shape simply did not name it.
   */
  retiredAt?: string | null
  /** Who set this agent's line, or null because nobody recorded it. Never on a person. */
  stateBy?: { kind: string; id: string } | null
  /**
   * HOW THIS PERSON WANTS THE NUMBER ON THE CHAT CIRCLE DRAWN, or null because they never chose.
   *
   * Never on an agent: nothing draws a circle for one. Null is read as
   * `CIRCLE_BEFORE_ANYBODY_CHOOSES`, and it is not the same fact as having chosen that word.
   * Criterion M32.
   */
  circleShows?: CircleShows | null
  /**
   * WHICH PICTURE THIS PERSON HAS PUT ON THE ROUND CHAT BUTTON, or null because they never chose.
   *
   * Criterion M38: with null, no picture is chosen and the button draws mole-at-the-sill in both
   * looks. Never on an agent: nothing draws a chat button for one.
   */
  circlePicture?: string | null
  /**
   * WHICH NAME A RECORD NAMED IN A MESSAGE IS DRAWN UNDER, or null because they never chose.
   *
   * Criterion M47. Null is read as `MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES`, and it is not the
   * same fact as having chosen that word. Never on an agent: nothing draws a messages panel for one.
   */
  messageLinkLevel?: MessageLinkLevel | null
  /**
   * HOW THAT LINK IS LAID OUT IN THE BUBBLE, or null because they never chose.
   *
   * Criterion M48. Null is read as `MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES`, and it is not the
   * same fact as having chosen that word. Never on an agent: nothing draws a messages panel for one.
   */
  messageLinkLayout?: MessageLinkLayout | null
  /**
   * WHETHER A MESSAGE SAYS WHICH PROJECT IT IS IN: `always`, `never`, or null because they have never
   * chosen, which is read as `never`. Criterion M73. Never on an agent.
   */
  messageProjectMark?: MessageProjectMark | null
  /**
   * HOW A PICTURE IN A MESSAGE IS DRAWN: `shown`, `pressed`, `path`, or null because they have never
   * chosen, which is read as `shown`. Criterion M64; decision rJphPkCG3l7X moved it off the browser
   * and onto this row. Never on an agent.
   */
  messagePictures?: MessagePictureChoice | null
  /**
   * WHETHER MEDIA A RECORD POINTS AT ARE LOADED: `with-page`, `never`, `on-press`, or null because
   * they have never chosen, which is read as `with-page`. Criterion U5. Never on an agent: nothing
   * draws a report for one.
   *
   * IT IS NOT `messagePictures` ABOVE. That one is about a picture inside a chat message.
   */
  mediaLoad?: MediaLoadChoice | null
  /**
   * HOW BIG THE CHAT'S OWN TEXT IS: `small`, `normal`, `large`, or null because they have never chosen,
   * which is read as `normal` — what the chat drew before this setting existed. Criterion M112.
   * Never on an agent: nothing draws a chat panel for one to size.
   */
  chatTextSize?: ChatTextSize | null
  /**
   * WHEN THE CHAT CIRCLE SHOWS: `when-unread` or `always`, or null because nobody has chosen, which
   * is read as `when-unread`. Never on an agent.
   */
  chatButtonStays?: ChatButtonStays | null
  /**
   * HOW THE CHAT OPENS: `split` (beside the page) or `window`, or null because nobody has chosen,
   * which is read as `split`. Never on an agent.
   */
  chatOpensAs?: ChatOpensAs | null
  /** The chosen column layout, or null to follow the available width. */
  chatLayout?: ChatLayout | null
  /**
   * THE MODE THEY START IN while their browser has stored none: `inspect`, Developer mode, for a person the office
   * made, or null for a person made before the column, read as Normal mode. Never on an agent.
   */
  startingMode?: 'inspect' | null
  /**
   * WHICH KEY SENDS A MESSAGE: `shift-or-alt-enter` or `enter`, or null because they have never chosen,
   * which is read as `shift-or-alt-enter` — Enter makes a new line and Shift+Enter or Alt+Enter
   * sends. Never on an agent: nothing draws a chat panel for one to type in.
   */
  sendKey?: SendKeySetting | null
  /**
   * WHICH KEYBOARD SHORTCUTS ARE ON, or null because they have never chosen, which is read as every
   * shortcut on, as item 5 of a decision says. Never on an agent.
   */
  shortcuts?: ShortcutSettings | null
  /**
   * THE PERSON'S OWN LABELS FOR THE MESSAGES THEY WRITE, in their order, unreadable with the reader's sentences, or
   * null because they have made none. The flag left of Send lists them after its marks. Never on an agent.
   */
  chatLabels?: TheStoredMessageLabels
  /**
   * THE PERSON'S OWN SETTINGS FOR THE FOUR FLAGS THE OFFICE SHIPS AND FOR 'NO MARK', or null because they changed none.
   * Migration 0346. The flag's menu draws it, read by `readShippedFlags` in shared/intent-mark.ts. Never on an agent.
   */
  shippedFlags?: import('@shared/intent-mark.ts').StoredShippedFlags | null
  /**
   * THE PERSON'S LOOK AND OWN THEMES, unreadable with the reader's sentences, or null because they never set one. Only
   * on their own row as they read it: no other reader is given the field. Migration 0347. Never on an agent.
   */
  themes?: TheStoredLook
  language?: import('@shared/i18n.ts').Language | null
  /**
   * THE AGENT RECORD THIS ROW IS JOINED TO IN THE PROJECT THAT WAS ASKED ABOUT, or null.
   *
   * Criterion M36: pressing an agent's picture in a conversation opens its record page, and this
   * says which page. Null means no record in this project answers for it, and then there is nowhere
   * to go — a registry row can outlive the record that made it. Never on a person: a person has no
   * record, and their own picture opens their settings instead.
   */
  record?: string | null
  /**
   * WHICH ROLE CARD THIS ROW HOLDS, or null because nobody has written one. Criteria P46 and P52.
   *
   * On a person it is a card from `personCards`; on an agent it is one from `cards`. The two lists
   * are separate and nothing reads across, so this word means one of two things depending on which
   * registry the row is in. `roleReadAs` beside it says what a row with no word is READ as, which
   * is not the same fact as somebody having chosen that word.
   */
  role?: string | null
  /** What a row with no role is read as. Never a word anybody chose. */
  roleReadAs?: string | null
  /** What the office says about a person holding this card: their name, then the card's standing. */
  standing?: string | null
  /**
   * WHAT THIS PERSON DOES, in their own words, or null because they have not written it.
   *
   * It is the PERSON'S and not the card's: every holder of one card has the same standing, and one
   * person being an engineer says nothing about anybody else. Criterion P45. Never on an agent.
   */
  occupation?: string | null
  /**
   * THE PICTURE THIS ROW HAS CHOSEN, by the address it is served at, or null because nobody chose.
   *
   * NULL IS NOT "no picture": the card's own picture is drawn where nobody has chosen one, and the
   * two are different facts. Criteria P47 and P52.
   */
  portrait?: string | null
  /**
   * WHICH VISITOR CREDENTIAL THIS AGENT WAS REGISTERED ON, or null because it needed none. P69.
   *
   * Null is the ordinary answer and means this machine: a registration made here needs none, and
   * one made from elsewhere is refused without one. So null says "none was needed", never "nobody
   * looked". Never on a person, who registers nobody and is registered by nobody.
   */
  credential?: string | null
  /**
   * THE SECRETARY'S BROADCAST: the next slot, the last broadcast and
   * whether it is paused, as plain sentences. Present only on the one-participant reads, which the
   * profile page draws; absent on the roster. Absent on a person.
   */
  broadcast?: BroadcastReading | null
  /**
   * WHO OWNS THIS AGENT (wave 13s round 281). Present only on the read of one agent and its profile;
   * absent on the roster and on a person. Absent means nobody recorded an owner, and broken means the
   * row holds one that cannot be read. A held owner's name is its office name, or null because its id
   * names nobody registered.
   */
  owner?: TheOwnerOfAnAgent
}

/** An agent's owner as the read of one agent says it. */
export type TheOwnerOfAnAgent =
  | { state: 'absent' }
  | { state: 'broken' }
  | { state: 'held'; kind: ParticipantKind; id: string; name: string | null }

/**
 * ONE HAND-OVER OF AN AGENT'S OWNER that the owner door kept (wave 13s round 281), as
 * GET /api/participants/agent/:id/owner-changes gives it. The owner before is said as the read of one
 * agent says its owner. A name is null because its id names nobody registered. `underTheGrant` is the
 * grant an agent made it under, or null because none was used. `at` is a local stamp. The server's
 * shape is in src/server/lib/agent-owner-changes.ts.
 */
export interface AnOwnerHandOver {
  id: string
  at: string
  before: TheOwnerOfAnAgent
  after: Extract<TheOwnerOfAnAgent, { state: 'held' }>
  by: { kind: ParticipantKind; id: string; name: string | null }
  underTheGrant: string | null
  because: string
}

/**
 * EVERY HAND-OVER OF ONE AGENT'S OWNER, newest first. `since` is when this office began to keep them,
 * or null because that was not recorded.
 */
export interface TheOwnerHandOversOfAnAgent {
  agent: string
  since: string | null
  handOvers: AnOwnerHandOver[]
}

/**
 * THE OFFERS READ: what is waiting for this reader that carries a lead, without the offers the reader
 * put off with Not now a short while ago. `offersComeBackInSeconds` says in how many seconds the first
 * of those comes back, or null when none is put off.
 */
export interface OffersWaitingForMe extends PoolPage {
  messages: PoolEntry[]
  workspaceId: string
  offersComeBackInSeconds: number | null
}

/** How far one message got with one recipient. */
export interface DeliveryOnTheWire {
  to: { kind: ParticipantKind; id: string }
  /** `archived` is set only by Mole Office: nobody read the message, and nobody will be woken for it. */
  mark: 'queued' | 'archived' | 'delivered' | 'seen'
  at: string
  /**
   * WHERE IT STANDS, in one sentence, or null because nobody has written one.
   *
   * The mark says how far it got; this says why it is there — which run took it, why nothing could
   * be started, who stopped the run. Criterion M6 asks for it beside the clock, and the chat panel
   * draws it as the mark's own sentence.
   */
  because: string | null
  /** The session record of the run that took this message, or null because none has. */
  run: string | null
}

/** One entry of the pool: a message, or a comment written before comments and messages became one. */
export interface PoolEntry {
  id: string
  /** Where the record is stored. For every message this is the message centre. */
  workspaceId: string
  /** Where a message was written: the project and the page, each only when it was named. */
  writtenIn?: { project?: string; page?: string } | null
  /** The project a message's writer said it is about, or null. */
  aboutProject?: string | null
  entry: 'message' | 'annotation'
  sentBy: { kind: ParticipantKind; id: string } | null
  from: string | null
  to: { kind: ParticipantKind; id: string }[]
  /** The group it was written to, when it was written to one rather than to people. */
  toGroup: string | null
  /** The members Mole Office delivered a group line to, when it narrowed them, or absent because it did not. */
  deliveredOnlyTo?: { kind: ParticipantKind; id: string }[]
  /** What a dead-letter sweep did, as facts, on the sweep's own line, or null. `theSweepFactsOf` in shared/dead-letter-lines.ts. */
  deadLetterSweepSaid?: TheDeadLetterSweepSaid | null
  /** Which letters for retired agents one sweep told this receiver about, as facts, or null. `theSummaryFactsOf` in shared/dead-letter-lines.ts. */
  deadLetterSummarySaid?: TheDeadLetterSummarySaid | null
  /** The message a notice is about (criterion M128), or null. A message brought back by Remind me later is about the one it brings back. */
  aboutMessage?: string | null
  /** Who made the offer it carries, or null because nobody recorded it. The first sender on a line Remind me later brought back. */
  offerMadeBy?: { kind: ParticipantKind; id: string } | null
  body: string
  title: string
  sentAt: string
  target: unknown
  /**
   * WHAT IT QUOTES ABOVE ITS WORDS, in order, or an empty list. The server fills it with `quotesOf`
   * in src/shared/messages.ts, so a page draws the quotes from this and never reads `target` for them.
   */
  quotes: readonly Context[]
  /** Offsets in the body at which the quotes are read, or null for quotes before the body. */
  quotePositions: readonly number[] | null
  /** Where it offers to take the reader, when it carries an offer. Null when it does not. */
  lead: unknown
  /**
   * True when this is a comment and nobody has been handed its words yet.
   *
   * False on every message that is not a comment, because writing a message is sending it. It is
   * not the delivery mark: that says how far a sent message got. Criterion M28.
   */
  notSentYet: boolean
  /**
   * THE WHOLE SENTENCE BEHIND A LINE MOLE OFFICE WROTE, or null because there is nothing more.
   *
   * Criterion M34: such a line's `body` is a few words and this is the sentence naming the run, the
   * minutes or the reason. The panel draws it as the block's hover text. Null on every message a
   * person or an agent wrote.
   */
  saidInFull: string | null
  /**
   * WHICH OF MOLE OFFICE'S OWN LINES THIS IS, by the name it has in `SYSTEM_LINES`, or null on a
   * message a person or an agent wrote.
   *
   * A STRING AND NOT THE SHARED UNION, because a stored row can hold a kind that has since left
   * the table. The chat reads it to tell the five lines that wrap on a phone from every other
   * line; `THE_CHECKLIST_LINES` in shared/groups.ts is the one place that list lives.
   */
  notice: string | null
  /**
   * THE LINE THIS ONE IS FOLDED INTO, by its id, or null. Only Mole Office writes it, on its own lines in a group.
   * `theFoldsOf` in shared/folded-lines.ts decides what the group draws from it.
   */
  foldedInto?: string | null
  /**
   * WHICH RUN THESE WORDS CAME OUT OF AND WHICH TOOL RAN IT, or null because nothing knows.
   *
   * A small claude, codex or opencode mark beside a message says which tool ran the agent.
   * Null on a message a person wrote, and null on one from a run whose
   * record never said which tool it was. Both mean nothing may be drawn here.
   */
  ranBy: { run: string; runtime: AgentRuntime; model: string | null } | null
  /**
   * THE RUNG THE WRITER HOLDS, or null because no role narrows it. Criterion P6.
   *
   * In principle only a higher-rung agent writes to the person, but nothing enforces it.
   * Any registered agent may
   * write to them. This is not a gate: it is the mark that lets them see which rung wrote.
   */
  sentByRole: string | null
  /**
   * THE STARTER THIS MESSAGE WENT ROUND, or null because it went round nobody. Criterion P7.
   *
   * A started agent that writes to them directly is accepted and marked. A report goes
   * up the chain by default, to the agent's starter and then to that one's starter. Nothing is refused and nothing is hidden.
   */
  wentRoundItsStarter: { kind: ParticipantKind; id: string } | null
  /**
   * WHERE IT WAS WRITTEN FROM: the machine and the browser or runtime. Criterion M63.
   *
   * Null because nobody recorded it, which is every message written before 6 September 2026 and
   * every comment of the older kind. `whereItWasWrittenReads` in shared/messages.ts is what turns
   * it into the line beside a message; nothing is drawn where this is null.
   */
  writtenFrom: MessageOnTheWire['writtenFrom']
  /** SENT AS AN EMERGENCY. Criterion M62. False on every ordinary message. */
  urgent: boolean
  /** THE PERSON'S MARK, present only when the message carries one. */
  intent?: MessageOnTheWire['intent']
  /** The one sentence of what the mark asks, present only when it asks something. */
  whatTheMarkAsks?: MessageOnTheWire['whatTheMarkAsks']
  /** The person's own label, its word and colour, present only when the message carries one. */
  label?: MessageOnTheWire['label']
  /** THE RUNS OF THIS MESSAGE'S WORDS THE PERSON MARKED, present only when the message carries parts. */
  markedParts?: MessageOnTheWire['markedParts']
  /** The person's own name for "No mark", beside the parts, for the line naming the words no part covers. */
  noMarkName?: MessageOnTheWire['noMarkName']
  /**
   * Whether the writer said it asks the person something: true, false, or null because nobody said.
   * Null is not false. `asksThePersonOf` in shared/messages.ts reads it on the server.
   */
  asksThePerson: MessageOnTheWire['asksThePerson']
  /** The one viewer it was narrowed to, or null. The server decides whether a screen is that one. */
  onlyOn: MessageOnTheWire['onlyOn']
  /** The browser's own id for the press that sent it, or null. Problem KzLydNEm4HYX. */
  sendId: MessageOnTheWire['sendId']
  /**
   * Whether its words were changed, and the words as first written, or null, as point 2 of a decision
   * says.
   */
  edited: MessageOnTheWire['edited']
  /** Until when its writer may still change the words, or null; `MessageOnTheWire` says the two cases. The server decides. */
  wordsMayChangeUntil: MessageOnTheWire['wordsMayChangeUntil']
  /**
   * THE PICTURES IT CARRIES, or an empty list because it carries none. Criterion M64.
   *
   * Empty rather than null, for the reason written on the shared shape: a message with no pictures
   * and a message written before pictures existed leave a screen the same thing to do.
   */
  pictures: MessageOnTheWire['pictures']
  deliveries: DeliveryOnTheWire[]
  /**
   * WHO COULD NOT BE REACHED WHEN THIS WAS SENT, AND WHO RECEIVED IT INSTEAD.
   *
   * Decision `J1Qge4JH87bv` and another decision. The office writes one entry
   * per addressee it could not reach, and each entry carries the finished `line`. The chat prints that
   * stored line and never builds one. Absent on a message written before the routing existed.
   */
  routed?: MessageOnTheWire['routed']
  /** Where the press to start a new agent carried this message, as stored facts (problem hqbovBMnTu-z). */
  carriedTo?: MessageOnTheWire['carriedTo']
}

/**
 * One line about one contact, as `GET /api/messages/contacts` answers.
 *
 * EXACTLY ONE OF THE TWO IS SET. A registered contact carries `who`. A writer nobody registered
 * carries `unregistered` and cannot be written to. Criterion M25.
 */
export interface ContactLineOnTheWire {
  who: { kind: ParticipantKind; id: string } | null
  unregistered: UnregisteredWriter | null
  last: PoolEntry | null
  /** Unread messages from them. A line Mole Office wrote is not one, criterion M33. */
  unread: number
  /**
   * WHETHER ANYTHING HERE IS UNREAD AT ALL, a line Mole Office wrote included. Criterion M33: this
   * is what makes the row bold; `unread` above is what puts a number on it. A row is bold
   * whether what is unread is only system lines or real messages.
   */
  anythingUnread: boolean
  /** The one key that names this row, whether a registry holds it or not. Criterion M25. */
  key: string
  /** The group it is in — one the product declares, or one they made. Criterion M29. */
  group: string
  /** Where it sits inside that group, counting from zero. */
  at: number
  /**
   * WHETHER IT IS ONLINE IN THE PAGE'S PROJECT: its dot is green, or grey with the words "In a terminal"
   * (`aDotSaysOnline` in src/shared/contacts.ts). The rows that are online come first among the rows not placed by
   * hand (wave 13y round 91, item 22). False for a writer nobody registered.
   */
  online: boolean
  /**
   * THE STARTER THIS ROW IS FOLDED UNDER, or null because it is a contact of their own. Criterion P10.
   *
   * Their contact list holds the secretary and every agent they have spoken to. Every other registered
   * agent is folded under the agent that started it, one press away. Folding changes no count: a
   * folded agent's conversation is between agents, and between-agents has never counted toward the
   * circle (criterion M32).
   */
  foldedUnder: { kind: ParticipantKind; id: string } | null
  /**
   * The projects this conversation's messages were written in or are marked about, latest
   * first.
   */
  projects: string[]
}

/** Everybody this reader could write to, and every writer nobody registered. */
export interface ContactsReply {
  me: { kind: ParticipantKind; id: string }
  contacts: ContactLineOnTheWire[]
  /**
   * The second-level groups this reader has, in the order they are drawn. Criteria M119 and M120.
   *
   * Each carries the side it sits under and the fold state the person set. The two top groups
   * themselves are declared in `src/shared/contacts.ts` and arrive in `contactSides`.
   */
  contactGroups: ContactGroup[]
  /** The two locked top groups, Human and Agent, with the fold state on each. Criterion M121. */
  contactSides: { key: ContactSide; name: string; collapsed: boolean }[]
  /**
   * THE NUMBER ON THE CIRCLE, IN ITS TWO HALVES. Criterion M32: the number on the circle
   * is the contacts' unread messages plus the number of unread groups.
   *
   * `messages` is how many messages from their contacts they have not marked read. `groups` is how many
   * GROUPS hold anything unread — one per group, not one per message, so a group of nine adds one.
   * A conversation between two agents is in neither: the person is not in it, and their rule leaves it out.
   *
   * BOTH ARE ADDED UP FROM THE ROWS ABOVE and never counted again over the delivery table, so the
   * circle cannot stand at a number the person has no row to press. They arrive apart because the person's settings
   * choose between one merged number and two bubbles; adding them on the server as well would be
   * the same sum in two places.
   */
  unread: { messages: number; groups: number }
  workspaceId: string
}

/** What one writer nobody registered has sent, as `GET /api/messages/unregistered` answers. */
export interface UnregisteredReply {
  me: { kind: ParticipantKind; id: string }
  writer: UnregisteredWriter
  messages: PoolEntry[]
  markedDelivered: string[]
  workspaceId: string
}

/** What two participants have said, as `GET /api/messages/conversation` answers. */
/** One page of a conversation to ask for. See `conversationWith`. */
export interface APageToAskFor {
  limit: number
  before?: string
  after?: string
  since?: string
  /** With `since`: the oldest message held, so only the changed messages from it on are named. */
  from?: string
}

export function theQueryOfAPage(page: APageToAskFor): string {
  const parts = [`&limit=${String(page.limit)}`]
  if (page.before !== undefined) parts.push(`&before=${encodeURIComponent(page.before)}`)
  if (page.after !== undefined) parts.push(`&after=${encodeURIComponent(page.after)}`)
  if (page.since !== undefined) parts.push(`&since=${encodeURIComponent(page.since)}`)
  if (page.from !== undefined) parts.push(`&from=${encodeURIComponent(page.from)}`)
  return parts.join('')
}

/** What a page of a conversation says about itself. Null on a read of the whole conversation. */
export interface AConversationPage {
  /** True when the conversation holds messages older than every message in the reply. */
  olderRemain: boolean
  /** True when the reply carries on from `before` or `after`; false when it is the newest page instead. */
  continuesFromTheCursor: boolean | null
  /** When the read began, to be sent back as `since`. */
  readAt: string
  /** Messages up to the cursor that changed since `since`, from `from` on when it was asked, read again. */
  changed: PoolEntry[]
  /** Messages concerning the reader deleted since `since`. */
  gone: string[]
}

export interface ConversationReply {
  me: { kind: ParticipantKind; id: string }
  them: { kind: ParticipantKind; id: string }
  messages: PoolEntry[]
  /** What this page is, or null for the whole conversation. */
  page?: AConversationPage | null
  markedDelivered: string[]
  /**
   * WHICH MIND WOULD ANSWER IF SOMETHING WERE SENT NOW, or null because the other side is a person.
   *
   * Criterion H3. `how` is `a live session` when somebody has that agent open in a terminal, `a run`
   * when Mole Office has one going, and `nobody` when the next message will start one. `says` is the
   * sentence, written on the server so the page and the worker cannot say different things.
   */
  answering: WhoIsAnswering | null
  /**
   * TRUE WHEN NOBODY IS ANSWERING AS FAR AS THE OFFICE KNOWS, BUT IT COULD NOT TELL: a process of the
   * agent's session is alive and its transcript could not be read (problem TOoUy7fMbg1P). False when
   * the office knows, either way. Null when the other side is a person. Read from the same reading
   * as `answering`.
   */
  couldNotTell: boolean | null
  /**
   * WHAT HAPPENS NEXT TO A MESSAGE WAITING FOR THE AGENT, as one sentence read from the same reading as
   * `answering`, or null because the other side is a person. Criterion M86. The chat draws it under the
   * reader's newest waiting message when the delivery row carries no reason of the worker's own.
   */
  whatHappensToAWaitingMessage: string | null
  /**
   * THE AGENT'S WHOLE STATUS, as the status view answers it at home: its presence, its personal words
   * and its unsettled runs, read in the same moment as `answering`. The chat's heading draws all three
   * from it and makes no status read of its own. `{available: false}` when it could not be read; null
   * when the other side is a person or Mole Office itself.
   */
  status: PluginStatusReading<PluginAgentStatus> | null
  /**
   * WHETHER THE AGENT HOLDS WORDS TO THIS READER NOW that it has not sent: a turn draft, which Mole Office sends at the
   * end of the agent's turn. The chat's "Replying" is drawn from this alone. Null when the other side is a person;
   * absent from an office older than this field.
   */
  replying?: boolean | null
  workspaceId: string
}

/** Every conversation between two agents, as `GET /api/messages/between-agents` answers. */
export interface BetweenAgentsReply {
  conversations: {
    between: [{ kind: ParticipantKind; id: string }, { kind: ParticipantKind; id: string }]
    last: PoolEntry
    /**
     * HOW MANY MESSAGES HAVE BEEN WRITTEN HERE SINCE THIS READER LAST OPENED IT.
     *
     * It is not an unread count and it is not called one. Nothing in a conversation between two
     * agents is addressed to the person reading it, so there are no delivery marks of theirs to
     * move; what there is instead is the time they last opened it. A conversation they have never
     * opened counts all of it. Criterion M32 puts the number of these on the tab, in grey.
     */
    newSince: number
    /** Whether anything at all was written since then, a line Mole Office wrote included. M33. */
    anythingNew: boolean
    /** The projects its messages were written in or are marked about, latest first. */
    projects: string[]
  }[]
  mayRead: boolean
  because: string
}

/**
 * Every conversation between two agents as `GET /api/messages/between-agents?shape=page` answers:
 * the whole list, each row cut by `aBetweenAgentsRowForThePage` in src/shared/short-lists.ts.
 */
export interface ShortBetweenAgentsReply extends Omit<BetweenAgentsReply, 'conversations'> {
  conversations: ShortBetweenAgentsRow[]
}

/**
 * Every group as `GET /api/groups?shape=page` answers: the whole list, each row cut by
 * `aGroupRowForThePage` in src/shared/short-lists.ts.
 */
export interface ShortGroupsReply extends Omit<GroupsReply, 'groups'> {
  groups: ShortGroupRow[]
}

/** One contact row as `GET /api/messages/contacts?shape=page` answers it, cut by `aContactRowForThePage`. */
export type ShortContactLine = Omit<ContactLineOnTheWire, 'last'> & { last: ShortContactLast | null }

/** Everybody this reader could write to, as `GET /api/messages/contacts?shape=page` answers: the whole list, each row cut. */
export interface ShortContactsReply extends Omit<ContactsReply, 'contacts'> {
  contacts: ShortContactLine[]
}

/** What one page of the chat's contact list says about the whole list, beside its rows. */
export interface ContactListCounts {
  /** How many rows each second-level group holds under the narrowings, folded rows included, by the group's key. */
  rowsIn: Record<string, number>
  /** Every row, with nothing narrowing it. */
  total: number
  /** How many rows the project narrowing keeps, or null when no project narrowed the list. */
  inTheProject: number | null
  /** How many rows both narrowings keep. */
  matched: number
  /** How many rows drawn on top come after the last one read. */
  left: number
  /** The words typed in the filter box that narrowed the list, trimmed, or null when none were. */
  name: string | null
  /** The project that narrowed the list, or null for every project. */
  project: string | null
}

/**
 * ONE PAGE OF THE CHAT'S CONTACT LIST, as `GET /api/messages/contact-list` answers it. `contacts` is the rows drawn on
 * top, in the order the list draws them; `folded` is the rows folded under a starter among them (criterion P10).
 */
export interface ContactListPage extends ShortContactsReply, ContactListCounts {
  folded: ShortContactLine[]
  returned: number
  next: string | null
}

/**
 * THE CHAT'S CONTACT LIST AS THE PAGE HOLDS IT: every page read so far, in one list of rows with the folded rows among
 * them, which is the shape the events code moves rows in. The rows held are always the first rows of the list as it is
 * drawn, so the next page starts after the last of them.
 */
export interface ContactListHeld extends ShortContactsReply, ContactListCounts {}

/** One agent-to-agent conversation read as one side sees it. */
/** Every group in this project, as `GET /api/groups` answers. */
export interface GroupsReply {
  me: { kind: ParticipantKind; id: string }
  /**
   * Each group with how many of its messages this reader has not said they read, and whether
   * anything in it is unread at all. A line Mole Office wrote counts for the second and not the
   * first, criterion M33: it makes the row bold without putting a number on it.
   *
   * `pinned` is true for the office's own standing group, the Secretariat. It is the row's answer
   * to "which category am I in", so the list never has to recognise the group by its name.
   */
  groups: (GroupOnTheWire & { unread: number; anythingUnread: boolean; pinned: boolean; projects: string[] })[]
  /** The ids of the groups this reader is in. The rest are groups a person may read but is not in. */
  yours: string[]
  workspaceId: string
}

/** One group and everything said in it, as `GET /api/groups/:id` answers. */
export interface OneGroupReply {
  group: GroupOnTheWire
  me: { kind: ParticipantKind; id: string }
  /** True when the reader is one of the members, false when they are reading somebody else's. */
  yours: boolean
  asSide: { kind: ParticipantKind; id: string }
  messages: PoolEntry[]
  unread: number
  /** Whether anything in it is unread, a line Mole Office wrote included. Criterion M33. */
  anythingUnread: boolean
  readBefore: { reader: { kind: ParticipantKind; id: string }; pair: string; asSide: string; at: string } | null
  says: string | null
  workspaceId: string
}

/** Every work claim in this project, as `GET /api/claims` answers. */
export interface ClaimsReply {
  claims: ClaimOnTheWire[]
  /** The ids of the claims whose run is still going. */
  live: string[]
  overlaps: Overlap[]
  workspaceId: string
}

/** The live claims naming one record, as `GET /api/claims/on/:recordId` answers. */
export interface ClaimsOnRecordReply {
  recordId: string
  claims: ClaimOnTheWire[]
  overlaps: Overlap[]
  workspaceId: string
}

export interface AsSideReply {
  between: [{ kind: ParticipantKind; id: string }, { kind: ParticipantKind; id: string }]
  /** Which of the two it was read as, or null because it was read as neither of them (M72). */
  asSide: { kind: ParticipantKind; id: string } | null
  messages: PoolEntry[]
  page?: AConversationPage | null
  readWasRecorded: boolean
  /**
   * The last time this reader opened this same conversation, before the read they just made.
   *
   * Null means never. It is read before this read is written down, so it says something the reader
   * cannot already see — "you read this a moment ago" would be the reply describing itself.
   */
  readBefore: { reader: { kind: ParticipantKind; id: string }; pair: string; asSide: string; at: string } | null
  says: string
}

/** Whether one participant can be reached, as `GET /api/presence` answers. */
export interface PresenceOnTheWire {
  who: { kind: ParticipantKind; id: string }
  colour: 'green' | 'grey' | 'red'
  word: string
  says: string
  from: string | null
  state: string | null
  stateAt: string | null
  stateMayBeStale: boolean
  stateStaleBecause: string | null
  /**
   * WHAT A PERSON SAID ABOUT WHETHER THEY ARE HERE, for a reader allowed to know it.
   *
   * Null on an agent, which has nothing to say about it; null when nobody has chosen; and null when
   * an agent is asking, because being told the word would undo an invisible person's hiding.
   */
  choice: PresenceChoice | null
  /** When they said it. Null whenever `choice` is. */
  choiceAt: string | null
  /**
   * A PERMANENT RESIDENT'S SLEEP, for the chat's short line. Absent on everybody who is not a resident, who gets no line.
   * Both fields null: a resident with no sleep recorded.
   * wakesAt: when the office ends a sleep it began at the resident's sleep time. sleepTime: the time it set, or null.
   */
  residentSleep?: { asleepSince: string | null; lastSleptAt: string | null; wakesAt: string | null; sleepTime: { startsAt: string; minutes: number } | null }
}

/**
 * ONE PARTICIPANT'S PAGE, as `GET /api/participants/:kind/:id/profile` answers.
 *
 * IT COMPOSES RATHER THAN DECLARING. `ProfileFacts` is declared once, in shared/profile.ts, and the
 * two shapes this file already mirrors are used as they are. A third declaration of a registry row
 * or a presence reading here would be a third copy of one fact.
 */
export type ProfileReply = ProfileFacts & {
  participant: ParticipantOnTheWire
  presence: PresenceOnTheWire
}

/** One participant, cut by the shared tuple to the fields the pages read. */
export type ParticipantForThePage = Pick<ParticipantOnTheWire, typeof PARTICIPANT_FIELDS_THE_PAGES_READ[number]>

/** Both registries, in their whole order, with only the page fields on each row. */
export interface ParticipantsForThePageReply {
  people: ParticipantForThePage[]
  agents: ParticipantForThePage[]
}

/** Both registries, as `GET /api/participants` answers. */
export interface ParticipantsReply {
  people: ParticipantOnTheWire[]
  agents: ParticipantOnTheWire[]
}

/** GET or POST /api/participants/agent/:id/reads-releases-from-the-check (wave 13y round 9). */
export interface ReleaseReadingReply {
  readsReleasesFromTheCheck: { on: boolean; by: { kind: 'person' | 'agent'; id: string }; at: string; because: string } | null
  says: string
}
