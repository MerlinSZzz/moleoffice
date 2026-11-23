// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { reportStars, setReportStar } from '../lib/report-stars.ts'
import { refuseANewRunWhileAStarterChangeWaits } from '../lib/agent-starter.ts'

/**
 * Record routes: create, read, change, delete, undelete.
 *
 * Every handler does the same three steps in the same order: work out who is asking, check
 * the input, then call one function in lib/records.ts. No database work happens in this file.
 * That is deliberate -- the rules about history and soft deletes live in one place, and a
 * route that reached past them could break them without anyone noticing.
 *
 * ---------------------------------------------------------------------------------------
 * A NEW DOOR GOES IN A ROUTE FILE OF ITS OWN, NOT IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * A door is one route: one method and one path. Do not add a door to this file, even one whose
 * path begins with /records. Put it in a new file under src/server/api, as a group of its own. A
 * group is one exported async function that takes the server and registers its doors, as
 * `recordRoutes` below does for the doors of this file.
 *
 * Copy src/server/api/answers.ts. It is a small file of that shape: two doors under
 * /records/:id/answers, registered by the group `answerRoutes`.
 *
 * A new group joins the server in four files, all in the same commit:
 *
 *   src/server/routes-list.ts   the group's name, in ROUTE_GROUPS. Groups register in this order.
 *   src/server/index.ts         one import in buildApp, and one line in routeRegistrations that
 *                               registers the group under the prefix /api.
 *   src/shared/ops-list.ts      each door's operation name, in OPERATION_NAMES.
 *   src/shared/ops.ts           each operation's entry, with its `live` and its `effect`.
 *
 * A name in ROUTE_GROUPS with no line in routeRegistrations fails tsc. A door that names an
 * operation the list does not hold stops the server from starting. In all four files, add your
 * lines and leave the lines already there as they are.
 *
 * The doors already in this file stay where they are. Moving one out is a change of its own, made
 * on purpose, and never a side effect of adding another.
 *
 * Why. Many lines change this file. When two merge entries change the same file, the later one
 * meets the earlier one's change, and the merge queue can send it back. A door in a file of its own
 * adds lines only to the four files above. When two entries only added lines in one of those, the
 * merge tool joins them.
 *
 * A test deleted on 13 November 2026 held this. It failed when this file registered a door it did not have on
 * 24 October 2026, the day this section was written.
 *
 * The rules in the sections below hold for every door that serves records, wherever it lives. A
 * door with an id in its path still turns the id into a record of this project with
 * `recordInWorkspace` before it acts.
 *
 * ---------------------------------------------------------------------------------------
 * COMPLETENESS: IN EVERY RESPONSE THAT CARRIES A RECORD, NEVER IN THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * A record may be created before it is finished. `{"kind":"module","title":"close-up camera"}` is
 * a legitimate write: the context and the checklist are filled in by PATCH as they are learned.
 * What is NOT legitimate is answering that write with a bare 201 — the caller would have no way
 * to tell a finished module from an empty one, which is the same silence as the 201 that used
 * to accept `{"contxet":"typo"}` and is what this endpoint was fixed for.
 *
 * So every response holding a record also says what that record is still missing:
 *
 *   POST /records            201 {record, incomplete, incompleteNote?}
 *   GET  /records/:id            {record, incomplete, links, changes}
 *   PATCH /records/:id           {record, incomplete, incompleteNote?, dataPatch?}
 *   POST /records/:id/restore    {record, incomplete}
 *   GET  /records                {records: [...record, incompleteCount]}
 *
 * The list carries a COUNT and not the sentences, deliberately. The list page draws a badge, and
 * every field's full description on every row would be several kilobytes of text nothing renders.
 * A caller that wants the detail asks for the record.
 *
 * None of it is stored. There is no `incomplete` column, no flag, no cache: it is recomputed
 * from the field specs on every read by completenessOf, which is also what the browser calls to
 * draw the same badge without a round trip. A stored flag would be wrong the moment a spec
 * changed, and wrong quietly.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY ROUTE WITH AN ID IN ITS PATH CALLS `recordInWorkspace` BEFORE IT ACTS
 * ---------------------------------------------------------------------------------------
 *
 * A record id is unique across the whole database, so an id on its own reaches into any project.
 * `recordInWorkspace` in lib/records.ts is the one function that turns an id into "the record with
 * this id IN THIS PROJECT", and its own comment says why the refusal is a 404 rather than a 403.
 * Read that comment before changing any line below that calls it.
 *
 * WHAT WENT WRONG WITHOUT IT, MEASURED ON THE RUNNING SERVER: `GET /api/records/<a panelx record>`
 * sent with `x-mole-office-workspace: greenhouse` answered 404, naming the project the record is really
 * in — and `DELETE` on the SAME id with the SAME header answered 200 and deleted the record, with
 * `"workspaceId":"panelx"` in its own reply. One route said "that id is not yours" and the one
 * beside it acted on it.
 *
 * The routes that were wrong all had the same shape: `const workspaceId = workspaceOf(req)` and
 * then nothing that used it. TypeScript is not configured with `noUnusedLocals`, so an unused
 * workspace is not an error, and none of the lib functions these routes call takes a workspace at
 * all — so nothing anywhere failed. **An unused `workspaceId` is what this defect looks like.**
 *
 * The check is here in the routes rather than pushed down into lib/records.ts because the workspace
 * comes from the REQUEST. lib/records.ts is called by the seed, the importer and the tests as well,
 * and those have no header to read.
 *
 * `tests/by-id-boundary.test.ts` walks every route with an id in its path and asserts each one
 * refuses an id from another project. A route added later is covered by it without anybody
 * remembering this paragraph; the two routes that are deliberately cross-project are listed in that
 * file with the reason beside each.
 */

import { RESOLVES_PROPOSAL } from '@shared/types.ts'
import { decisionsNotOnThePersonsOwnWords, isPreparedForThePerson, theNoteFiledFrom } from '../lib/the-persons-own-words.ts'
import type { NotOnThePersonsOwnWords } from '@shared/the-persons-own-words.ts'
import type { AKeyReminder } from '@shared/message-keys.ts'
import type { WhatTheWriteNames } from '../lib/what-a-record-names.ts'
import { theRecordsAWriteNames, type ARecordNamed } from '../lib/message-keys.ts'
import { leadIsReminded } from '../lib/when-a-lead-is-reminded.ts'
import { theReportFileReminder, type AReportFileReminder } from '@shared/report-file-reminder.ts'
import { SANDBOXES_FOLDER, WORKTREES_FOLDER } from '../../config/sandbox-folder.mjs'
import { isAbsolute, resolve, sep } from 'node:path'
import { inside, storedPathsIn } from './files.ts'
import { reportFileDirectory } from '../lib/reportfiles.ts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { createShortFormsBody } from './zoom.ts'
import { writeShortForms } from '../lib/zoom.ts'
import { sql, type SQL } from 'drizzle-orm'
import {
  END_HEAD,
  FILING_HEAD,
  kindDeclaresShortForms,
  kindHoldsPartsLevels,
  type Incompleteness,
  type ObligationState,
} from '@shared/kinds.ts'
// THE SIX LENGTHS, THEIR BUDGETS AND WHAT A RECORD HOLDS NOW. Read from the one declaration, so the
// reply below cannot name a length the write door does not accept.
import {
  SHORT_FORMS_FIELD,
  PARTS_KEY,
  SHORT_FORM_SPECS,
  STORED_SHORT_FORM_LEVELS,
  joined,
  readStoredParts,
  readStoredShortForms,
  type ShortFormLevel,
} from '@shared/zoom.ts'
import {
  ITEM_STATES,
  LINK_TYPES,
  RECORD_KINDS,
  type Change,
  type ItemState,
  type LinkType,
  type PanelRecord,
  type ProvedHolder,
  type RecordKind,
} from '@shared/types.ts'
import { KIND_FAMILIES, familyOf, noHeadingHolds, withArticle, type Fulfilment, type KindFamily } from '@shared/work.ts'
import { CATALOGUE_COLUMNS, COLUMN_SORT, SORT_DIRECTIONS, sortCatalogue } from '@shared/catalogue.ts'
import { EVERY_PROJECT, PROJECTS_QUERY } from '@shared/across-projects.ts'
import { searchRecords, theNeedle, usableQuery } from '@shared/search.ts'
import { reportReading } from '@shared/attention.ts'
import type { ReportReadAnswer } from '@shared/kinds.ts'
import {
  KINDS_A_CHOICE_SHOWS,
  REPORTS_PAGE_GROUPS,
  REPORTS_PAGE_KINDS,
  REPORTS_PAGE_SHOWS,
  REPORTS_PAGE_SIZE,
  reportsPageGroup,
  type ReportsPageGroup,
  type ReportsPageKind,
  type ReportsPageShow,
} from '@shared/reports-page.ts'
import { MY_NOTES_CHOICES, MY_NOTES_PAGE_SIZE, type MyNotesReply, type NoteLastWrittenIn } from '@shared/my-notes.ts'
import { QUICK_NOTE_KIND } from '@shared/kinds/quick-note.ts'
import {
  allGatedLinks,
  appendAPart,
  appendChecklistItem,
  blockedByReport,
  createRecordWithReport,
  deleteRecord,
  describeSimilar,
  dischargeObligation,
  fileRanInstead,
  getRecord,
  liveFallbacksAbout,
  changesOfOneRecordWithinABudget,
  type ChangesCarried,
  listRecords,
  listRecordsWithDataAs,
  onlyTheseFieldsOf,
  ACROSS_WORKSPACES,
  CREATED_BETWEEN_MAX,
  recordsCreatedBetween,
  theRecordsAlreadyCalled,
  patchChecklistItem,
  type ChecklistPatchResult,
  type PartAppendResult,
  describeAlreadyLinkedThere,
  type AlreadyLinkedThere,
  patchRecord,
  nothingWrittenSentence,
  theProcessesAWriteReads,
  throughTheRecordDoor,
  recordTheOriginalRunKeyMint,
  type PatchResult,
  chooseAgain,
  promoteProposal,
  proposalResolution,
  theDecisionsThatNameThisFork,
  revokeAnActOnTheirWords,
  recordInWorkspace,
  resolveLinks,
  restoreRecord,
  versionOf,
  assertMayWrite,
  whyAnUnregisteredAgentMayNotWrite,
  DISCHARGE_STATES,
  PROPOSAL_KIND,
  REPLACES_CANDIDATES_FIELD,
  type Actor,
  type BlockedByReport,
  type CreatedLink,
  type CreatedBetween,
  type DataPatchOutcome,
  type DeleteResult,
  type GatedLink,
  type KindChangeOutcome,
  type ProposalResolution,
  type PromoteResult,
  type RevokedAct,
  type SessionBinding,
  type SimilarTitle,
  recordsAround,
  recordTitleOptions,
  type RecordAround,
  theRaiseThisActorHolds,
  whoFiledFromWhichRun,
  type FiledFrom,
  theOtherEndsOf,
  whetherThisWriteFinishesTheRun,
} from '../lib/records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { readFirst } from '../lib/resources.ts'
import type { FlowRunFiled } from '../lib/flow-runs.ts'
// WHICH DECISIONS A LATER ONE REPLACED, and the one that replaced each. Problem ZSWftCSVUP2r.
import { readTheReplacements, replaceCandidatesForTheFork, replacedDecisionIds, theDecisionsThatReplacedThisDirectly, whatSupersedes, type ACandidate, type TheReplacements } from '../lib/replaced-decisions.ts'
import { theReplacedDecisionsTheyRestOn } from '../lib/grant/secretary-duties.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import { theProjectsAsked, theRowsTheReaderMaySee } from '../lib/across-projects.ts'
import { myNotes, theNoteLastWrittenIn } from '../lib/my-notes.ts'
import { sayItWasDoneFromAnotherComputer } from '../lib/changed-from-another-computer.ts'
import type { TitleOption } from '@shared/blocks.ts'
// THE PERSON'S PRESS ON A WAITING ASK, drawn on the ask's own page. Problems x8ktQfHS5yGr, ZtbZNZ735RYN.
import { theGrantToWithdrawOnThisAsk, thePressOnThisAsk, whatAJoinedRowIsAnsweredInsteadOfAKey, whatThisKeyAskShows, whereThisNewKeyAskStands } from '../lib/newkey.ts'
import type { WaitingCardAsk } from '@shared/profile.ts'
import {
  BLOCK_KIND,
  blockIdsOf,
  readPipelineBlocks,
  type BlockLinkRow,
  type PipelineBlockReading,
} from '@shared/blocks.ts'
// THE REVISION LEDGER'S READERS. `saveRevision` — the only writer — is in lib/records/save-revision.ts, and a
// write calls it beside `logChange`, because a revision has to be written in the same transaction as the write
// it is of.
import {
  compareRevisions,
  getRevision,
  listRevisions,
  restoreRevision,
  historyBadge,
  revisionHoldingContent,
  REVISIONS_LISTED,
  type OneRevision,
  type RestoredRevision,
  type RevisionComparison,
  type RevisionListing,
} from '../lib/revisions.ts'
// A RUN'S HONOUR READING AS THE CALLER MAY SEE IT.
import { differencesWithTheHonourThisReaderMaySee, recordsWithTheHonourThisReaderMaySee } from '../lib/honour.ts'
import { gateMet } from '../lib/gate-counts.ts'
import {
  anOfficeOnlyFieldAWholeDataWouldMove,
  ONLY_THE_OFFICE_WRITES_ENDED_WITH_ITS_MERGE_ENTRY,
  ONLY_THE_OFFICE_WRITES_NEEDS_NO_CHECK,
  ONLY_THE_OFFICE_WRITES_REMINDED_BEFORE_THE_SEAL,
} from '../lib/office-only-run-fields.ts'
import {
  addBlock,
  blockLinkRowsFor,
  patchBlock,
  readOnePipelinesBlocks,
  removeBlock,
  reorderBlocks,
} from '../lib/blocks.ts'
import { actsOnTheirWords, type ActOnTheirWords } from '../lib/warrants.ts'
import { RESTRICTION_SEVERITY } from '@shared/restriction.ts'
import { restrictionsOn, type RestrictionReading } from '../lib/restrictions.ts'
import { boundaryReply, type BoundaryRestrictions } from '../lib/boundaries.ts'
import { aRefusalStandsOn, aRunSaysItIsFinished, markARefusalAnswered, theAgentOfARunForItsSeal, theOfficeStartsTheCheck, whoMayConfirmThisReport } from '../lib/inspection.ts'
import { ENDED_WITH_ITS_MERGE_ENTRY, NEEDS_NO_CHECK, NEEDS_NO_CHECK_RULES } from '@shared/releasing.ts'
import { asTheDoorOf } from '../lib/check-field-doors.ts'
import { THE_OFFICE } from '../lib/the-office.ts'
import { whetherThisOfficesChecksAreSwitchedOff } from '../lib/checks-in-merges-only.ts'
import { inspectorAnswersRun } from '../lib/inspector-answers-lines.ts'
import { theReviewLevel } from '../db/the-review-level.ts'
import { moveRecordToWorkspace, type MoveReport } from '../lib/move.ts'
import { actorFrom, actorWithTheWordsItActsOn, namedAProject, pageFrom, takesNoInput, toChanges, type WhatActorFromAsks } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theStopOfThisSession } from '../lib/a-stopped-check.ts'
import { theRoleOfTheCaller } from '../lib/rolegate.ts'
import { theRoleCards, theRoleCardsAreRead } from '../lib/roles.ts'
import { theCardOffTheTree } from '@shared/roles.ts'
// WHO MAY READ WHICH MESSAGE: the one rule, asked by every door here that hands back a message's words,
// its title or its id.
import {
  onlyTheMessagesThisReaderMayRead,
  theMessageReader,
  theMessagesHiddenFrom,
  type AMessageReader,
} from '../lib/messages.ts'
import { workspaceOf } from '../lib/workspaces.ts'
// PASSING A QUESTION UP TO THE PERSON, criterion P55. The reading and the registry lookup; the
// refusals live on the write path in lib/records.ts and this route only builds the entry.
import { passedItOnBy, whereOneQuestionIs } from '../lib/confirming.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { theAgentTheKeyProves } from '../lib/the-agent-the-key-proves.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { readParticipant } from '../db/read-participant.ts'
import { aCheckIsAskedAtTheSeal, recordHowASealedRoundEnded, releaseTheHeldCheck, theCheckOfASealedRound } from '../lib/how-a-round-ended.ts'
import { theOfficeDecidesAtTheSeal } from '../lib/merge-queue-at-the-seal.ts'
import { theOfficeAsksTheNextRoundAtTheSeal } from '../lib/next-round-at-the-seal.ts'
import { THE_KINDS_THE_DOOR_TAKES, tellTheStarterOfTheNotice, whyTheNoticeDoesNotFit, type WhatTheStarterWasTold } from '../lib/launcher-notices.ts'
import { A_MODEL_NAME, THE_LAUNCHERS_NOTICES } from '../../config/launcher-notices.mjs'
import { whoIsToldOfASeal } from '../lib/who-is-told-of-a-seal.ts'
import { theWorkToTalkAboutIn } from '../lib/work-to-talk-about.ts'
import { theAgentARunServes } from '../lib/the-agent-a-run-serves.ts'
import { theKeyHolderIsTheRegisteredStarterOf, openTheGroupsForATerritory, refuseATerritoryOverlapAtBlock, countingATerritoryRefusal, theChangedPathsBeforeAPatch, theChangedPathsBeforeATerritoryWrite, type TerritoryOverlaps } from '../lib/claims.ts'
import { sayTheNextRoundStarted, theNextRoundThisRunStarts } from '../lib/next-round.ts'
import { keepTheHandStart, theHandStartAskedFor, sayTheWorkerRunStarted, theRunThatAskedForThisWorker, theWorkerRunThisRunStarts, theWorkersARunStarted } from '../lib/worker-runs.ts'
import type { TheRunThatAskedForAWorker, TheWorkersARunStarted } from '@shared/worker-runs.ts'
import { CONFIRMED_BY, type WhereTheQuestionIs } from '@shared/confirming.ts'
import { theRetiredAddresseesReason, type NotRoutedAddressee, type RoutedAddressee } from '@shared/messages.ts'
import { localStamp, nowStamp, parseLocalStamp } from '@shared/time.ts'
import { THE_PATH_THAT_MOVES_A_RECORD } from '@shared/workspaces.ts'

/** What GET /api says POST /api/records/:id/pass-the-question-on is for. Criterion P55. */
const PASS_IT_ON_NOTE =
  'Pass a question one rung up the chain of starters. An agent that says whose_move: "person" hands the question ' +
  'to whoever started it, not to the person; this is the act that moves it — to that starter\'s own starter, and, ' +
  'when the caller is an agent the person started, onto the person\'s list. It takes NO BODY: who passed it on is ' +
  'who is asking and when is now, and neither is a caller\'s to supply. Only whoever the question is with may make ' +
  'it, under their own name, one entry at a time, and an entry already written can never be changed or removed. ' +
  'The same refusals answer a hand-written PATCH to `confirmed_by`, because the rule is on the write path and this ' +
  'route only builds the entry. 201 with the record and where the question is now.'
// WHERE A WRITE CAME FROM: the machine, measured from the connection, and the program the writer
// said it is writing in. Criterion M63.
import { writtenFrom } from '../lib/machines.ts'
// WHETHER THIS REQUEST MAY REGISTER AN AGENT AT ALL. Criterion P69: registration from another
// machine needs a credential the person has confirmed, and this door is one of the two that registers one.
import { whereThisRegistrationCameFrom, withTheCredentialMeasuredHere } from '../lib/registrationgate.ts'
// THE KEY A REGISTRATION ANSWERS, ONCE. Criterion P83, point 5. This is the second registration
// door, and the sentence it carries is the one declaration, in keys.ts.
import { isDeepStrictEqual } from 'node:util'
import { aReminderBeforeTheSealFor, keepWhatTheSealDidWithTheReminder, type TheReminderBeforeTheSeal } from '../lib/before-the-seal.ts'
import { aFinishReadsItsGitApart, timeTheFinishOf, type InOnePass } from '../lib/a-finish-reads-git-apart.ts'
import { theCommitsNotCheckedFor } from '../lib/a-finish-reads-git-apart.ts'
import { theEndHeadBeforeAWrite, theHeadReadApart } from '../lib/a-runs-own-commits.ts'
import { sayThePartsOfTheCheckDoors } from '../lib/the-parts-of-a-check-door.ts'
import { refuseTheSealOverAMissingDesign } from '../lib/design-reminders.ts'
import { CHECK_ALSO, REMINDED_BEFORE_THE_SEAL } from '@shared/before-the-seal.ts'
import { WHEN_TO_SEND_A_LEAD } from '@shared/when-to-send-a-lead.mjs'
import { CHECK_ALSO_IS_WRITTEN_BY_ITS_DOOR, setTheCheckAlsoOf, theCheckAlsoToStore } from '../lib/check-also.ts'
import { THE_AGENT_KEY_IS_SHOWN_ONCE, aKeyWasEverHeldBy, makeAnAgentKey, makeARunKey } from '../lib/keys.ts'
import { howTheMessageStartWasProved, howThisCallProvesTheKeyItMakes } from '../lib/provedkeys.ts'
import { sqlite } from '../db/client.ts'
import { records as recordsTable } from '../db/schema.ts'
import { theRecordsThatMaySay } from '../lib/record-text-index.ts'
import { wouldBeAccepted, writeOrCheck, type WouldBeAccepted } from '../lib/only-a-check.ts'
import { ASK_FIRST_SENTENCE } from '@shared/ask-first.ts'
import { openLoopsFor, POPULATION_SENTENCE, type OpenLoops } from '../lib/openloops.ts'
import { decisionsAbout, type DecisionsAbout } from '../lib/decisionsabout.ts'
import { RELATED_KINDS, RELATED_PAGE_MOST, RELATED_SCOPE_KINDS, relatedTo, theSubjectsOf, type RelatedAnswer } from '../lib/related.ts'
// WHETHER PICKING THIS RUN UP AGAIN IS EXPENSIVE, criterion T6. The warning and its two measured
// numbers come from the one library, so this page and the Embassy row cannot disagree.
import { pickUpCostOfARun, pickUpCostThresholds } from '../lib/pick-up-cost.ts'
import type { PickUpCost } from '@shared/pick-up-cost.ts'
import { READERS, type Reader } from '@shared/audience.ts'
import { RUNGS, RUNG_SPECS, type Rung } from '@shared/detail.ts'
import { detailSupplyOf, UNWRITTEN_LISTED, type DetailSupply } from '@shared/detailsupply.ts'
import { THE_DATA_FIELDS_A_DETAIL_SOURCE_READS } from '@shared/detailsource.ts'
import { NON_WORK_RECORD_KINDS, TALK_SOURCES_SHOWN, type WorkToTalkAbout } from '@shared/talksources.ts'
// WHAT A RECORD IS CALLED IN A SENTENCE. One table; nothing here spells `report`, and the machine
// word gate in tests/the-machine-word-gate.test.ts is what says so.
import { kindWord } from '@shared/words.ts'
import { route } from '../lib/route.ts'
import { sendTheHeldDraftsBeforeTheRunEnds, throughTheTurnDraft } from '../lib/turn-drafts.ts'
import { theSecondLevelIsAsked } from '../lib/flow-reasons.ts'
import { foldTheSecondLevel, SECOND_LEVEL_PARAM, type SecondLevelHeld } from '@shared/second-level-fold.ts'
import { levelNamed, NO_SUCH_LEVEL, resultsAtTheirLevels, type TheLevelsOfAnAnswer } from '@shared/results-at-a-level.ts'
import { theLevelSettings } from '../lib/result-levels.ts'
import {
  compositionsAt,
  compositionsIn,
  measuresAt,
  type CompositionDrawn,
  type CompositionPlanned,
  type MeasureDrawn,
} from '../lib/layout.ts'

// ---------------------------------------------------------------------------- input shapes

const kind = z.enum(RECORD_KINDS, {
  error: `kind must be one of: ${RECORD_KINDS.join(', ')}`,
})

const title = z
  .string({ error: 'title is required and must be text' })
  .trim()
  .min(1, { error: 'title must not be empty — the title is how other records link to this one' })

/**
 * The record's one-line summary — the ENVELOPE one, beside `title`.
 *
 * This is not the same field as a module's `data.summary`, and the two are not copies of each
 * other. This line is what the records list, the home cards, every link row and the header of the
 * record's own page draw, for every kind. `data.summary` exists on modules only and is the opening
 * paragraph of that module's curated summary, drawn on the module page and nowhere else. Both are
 * stored, both are read, in different places; GET /api and GET /api/kinds/module say so too.
 *
 * WHY BLANK IS REFUSED HERE. Inside `data` a whitespace-only string is already a 400 from
 * shared/kinds.ts — "a blank value renders as a gap that reads as missing data" — and it was
 * accepted verbatim on the envelope, which is the field most likely to arrive padded, and the one
 * whose gap is visible on every page that lists the record. So the same rule applies, in the same
 * words. It is only a rule about BLANK: a summary with content and stray spaces around it is
 * stored exactly as sent, because nothing on the write path trims what you wrote.
 *
 * `null` is untouched by this and still means "no summary": leaving the key out on a POST, or
 * sending null on a PATCH to clear one that is stored.
 */
const summary = z.string({ error: 'summary must be text' }).refine((s) => s.trim() !== '', {
  error:
    'summary must be a non-empty string, but it is an empty string. A blank value renders as a gap that reads ' +
    'as missing data; leave the key out instead, or send null to clear the summary that is stored.',
})

/**
 * The kind-specific fields. This route checks only that it is a JSON object; which keys belong
 * inside depends on the kind and is checked in lib/records.ts, which calls validateRecordData
 * on every write. The check is there rather than here so that the seed script and the tests,
 * which never go through HTTP, cannot write something the API would have refused.
 */
const data = z.record(z.string(), z.unknown(), {
  error: 'data must be a JSON object, for example {"context":"why this exists","parts":[],"paths":[]}',
})

/**
 * The merge form of `data`. Same shape on the wire, different meaning, so it gets its own
 * message: the null rule is the part a caller cannot guess, and this is where they meet it.
 */
const dataPatch = z.record(z.string(), z.unknown(), {
  error:
    'dataPatch must be a JSON object holding only the keys of data you want to change: ' +
    'PATCH /api/records/<id> {"dataPatch":{"<a key of data>":<its new value>}}. A null value deletes its key. ' +
    'The title and the summary are not in data, so they go beside dataPatch: {"title":…,"summary":…,"dataPatch":{…}}',
})

/** The link types, as a list zod can validate against. Read from the contract, never typed out. */
const LINK_TYPE_NAMES = Object.keys(LINK_TYPES) as [LinkType, ...LinkType[]]

/**
 * One relationship carried on a create. SHAPE ONLY — every rule about it is in lib/records.ts.
 *
 * This says which keys may appear and that they are strings. WHICH ONE END must be named, what a
 * title that names nothing means, whether a type may carry a gate and what a gate has to say are
 * all `planLinks` and `readGateRequest` in lib/records/creating.ts, `liveRecordByTitle` in
 * lib/records/link-requests.ts, and `checkGate` in lib/records/link-gates.ts — the
 * same functions POST /api/links goes through — so this route cannot accept a relationship that one
 * refuses, and there is no second copy of the rules to drift from them. `gate` is deliberately
 * `unknown` here for that reason: its shape is read in one place, beside the rules that judge it.
 */
const linkOnCreate = z.strictObject({
  type: z.enum(LINK_TYPE_NAMES, { error: `type must be one of: ${LINK_TYPE_NAMES.join(', ')}` }).optional(),
  toId: z.string().trim().min(1, { error: 'toId must not be empty' }).optional(),
  toTitle: z.string().trim().min(1, { error: 'toTitle must not be empty' }).optional(),
  fromId: z.string().trim().min(1, { error: 'fromId must not be empty' }).optional(),
  fromTitle: z.string().trim().min(1, { error: 'fromTitle must not be empty' }).optional(),
  gate: z.unknown().optional(),
})

/**
 * `strictObject` rejects fields it does not know. A misspelt field that was quietly dropped
 * would look like a successful write that lost your text, which is the exact failure this
 * project is built to avoid.
 */
/**
 * THE PERSON'S OWN WORDS AN AGENT'S GOVERNANCE WRITE STANDS ON.
 *
 * Only "an object" here, on purpose. The shape is judged in one place — `readWarrant` in
 * @shared/warrant.ts — and a second statement of the four keys would be free to accept a warrant
 * that reading refuses and to refuse one it accepts. The refusals a caller reads are that reading's,
 * because they are the ones that say what a warrant is and what it must never be.
 */
export const warrantBody = z.looseObject(
  {},
  { error: 'warrant must be an object: {"saidBy":"…","words":"…","where":"…","when":"…"}' },
)

const createBody = z.strictObject({
  askedBy: z.string().trim().min(1).optional(),
  brief: z.string().trim().min(1).optional(),
  cutFrom: z.string().trim().min(1).optional(),
  kind,
  title,
  summary: summary.nullish(),
  data: data.optional(),
  shortForms: createShortFormsBody.optional(),
  /**
   * The relationships this record is filed WITH, written in the same transaction as the record.
   *
   * An empty array is refused rather than treated as "no links". A caller that sent `links: []`
   * built its request wrong — it asked for no relationships in the one key that exists to carry
   * them — and a 201 saying "done" would be the quiet success this server is written against.
   */
  links: z
    .array(linkOnCreate, {
      error:
        'links must be a list of relationships, for example ' +
        '[{"type":"about","toTitle":"the demo task"},{"type":"blocks","fromId":"rec_…"}]',
    })
    .min(1, {
      error:
        'links is empty: name at least one relationship, or leave the key out entirely. A record with no ' +
        'links is an ordinary create and is not refused.',
    })
    .optional(),
  /**
   * WHAT THE PERSON SAID THAT MAKES THIS CREATE AN AGENT'S TO MAKE.
   *
   * Every kind but `decision` is open to an agent already, so this only does anything on a kind
   * `KIND_SPECS` marks `humanOnly` — `regulation` is the one this was added for, criterion G2:
   * an agent may file one on the person's own words. Left out by a person: their own write needs
   * nobody's words and is refused if it carries any. Left out by an agent creating an ordinary kind:
   * nothing changes, because nothing there was ever refused. `for` on the warrant names the record's
   * own TITLE — there is no id yet to name.
   */
  warrant: warrantBody.optional(),
})

/**
 * The compare-and-set: the `version` this patch was written against.
 *
 * The value comes from the reply that handed the caller the record — `version` on every read and
 * every write response. Sending it makes the write conditional: if anybody has changed the record
 * since, it is refused with 409 and nothing is stored. Leaving it out keeps the old behaviour.
 *
 * It is also the way to say "yes, I really mean to remove those checklist lines": a write that
 * drops stored checklist items is refused without it, because the server cannot otherwise tell a
 * deliberate removal from a copy that was read before somebody else added them.
 */

const ifVersion = z
  .string({ error: 'ifVersion must be the version string a read or a write handed back' })
  .trim()
  .min(1, { error: 'ifVersion must not be empty — leave the key out if you do not want the check' })

/**
 * "I MEAN TO REWRITE THE WHOLE OBJECT, INCLUDING THE FIELDS I AM NOT SENDING."
 *
 * `data` replaces the whole of a record's `data`, so a `data` that leaves a stored field out
 * empties it. That is refused now unless this key says the caller means it — `patchRecord` in
 * lib/records.ts holds the rule and the sentence a caller reads.
 *
 * ONLY `true`. A `false` would be a caller saying "no" in the key that exists to say "yes", and
 * there is nothing for Mole Office to do with that answer except what leaving the key out already
 * does. The refusal says to leave it out.
 */
const replace = z.literal(true, {
  error:
    'replace must be true, or left out. It is how you say a `data` that empties stored fields is meant; to ' +
    'change only the fields you send, use dataPatch instead.',
})

const patchBody = z
  .strictObject({
    /**
     * WHAT KIND OF THING THIS RECORD IS. It may be changed, since 17 August 2026.
     *
     * The same enum a create takes, so an unknown kind is refused here with the same sentence and
     * the same list. Every rule about the change — which kinds a record may not become, what
     * happens to a field the new kind has no place for, and what the reply says about it — is
     * `patchRecord` in lib/records.ts, so a kind this route accepts and that function refuses
     * cannot exist.
     */
    kind: kind.optional(),
    title: title.optional(),
    // null clears the summary; leaving the field out means "do not touch it". Blank is neither of
    // those — see the note on `summary` above — so it is refused rather than stored as a gap.
    summary: summary.nullable().optional(),
    data: data.optional(),
    dataPatch: dataPatch.optional(),
    ifVersion: ifVersion.optional(),
    replace: replace.optional(),
    /**
     * WHAT THE PERSON SAID THAT MAKES THIS PATCH AN AGENT'S TO MAKE.
     *
     * Three writes on this route are otherwise refused to an agent: closing a record the person was
     * asked about, clearing or changing a question somebody else asked them, and moving a fork away
     * from the classification somebody else gave it. A warrant is what lets an agent make one of
     * those, and it changes nothing about any other patch — an ordinary edit that carries one is
     * stored exactly as it would have been, with no mark and nothing in the ledger.
     */
    warrant: warrantBody.optional(),
    /**
     * FALSE SKIPS THE REMINDER BEFORE THE SEAL (lib/before-the-seal.ts), and nothing else may be sent here. The launcher
     * sends it, because it finishes a run after the agent's command has ended, when nobody is left to read a reminder.
     * Any caller may send it. A write that asks for no reminder also skips its block position, because there is no
     * reminder to act on in that write. The separate hard migration check stays on. A fault of form is listed by the
     * reminder and never refused (lib/before-the-seal.ts).
     */
    remindBeforeTheSeal: z.literal(false, { error: 'remindBeforeTheSeal may only be false, or left out.' }).optional(),
    /**
     * ONE NOTICE FOR THE RUN'S STARTER, FROM A FIXED LIST, AND NO WORDS (problem Grbb87VX3pND; lib/launcher-notices.ts). The
     * sandbox launcher sends it on the write that ends a run, or on the write that marks a long wait on a usage limit, and
     * the office writes its own line to the starter after the write. A kind that does not fit the write is refused before
     * anything is written. Any caller may send it, the run's key included, which is why it carries no words.
     */
    tellTheStarter: z.enum(THE_KINDS_THE_DOOR_TAKES, { error: `tellTheStarter may only be one of ${THE_LAUNCHERS_NOTICES.join(', ')}, or left out.` }).optional(),
    /**
     * THE MODEL A CODEX STOP NAMES, sent beside a Codex kind of `tellTheStarter` and with no other kind: one word in the
     * shape A_MODEL_NAME, or null when the run's start named no model in that shape. It is a name and no sentence, so the
     * office's line still says only the office's own words around it.
     */
    theModelItRanOn: z
      .string()
      .regex(A_MODEL_NAME, { error: 'theModelItRanOn is one word of letters, digits and . _ : / @ + -, at most 200 characters, or null.' })
      .nullable()
      .optional(),
  })
  .refine(
    (b) =>
      b.kind !== undefined ||
      b.title !== undefined ||
      b.summary !== undefined ||
      b.data !== undefined ||
      b.dataPatch !== undefined,
    { error: 'nothing to change: send at least one of kind, title, summary, data or dataPatch' },
  )
  // Both at once is refused rather than resolved. lib/records.ts refuses it too, for callers
  // that never come through HTTP; the message here is the one an agent actually reads.
  .refine((b) => !(b.data !== undefined && b.dataPatch !== undefined), {
    error:
      'send data or dataPatch, not both: data replaces the whole object, dataPatch merges into it key by key',
  })
  // An empty dataPatch is a caller that built its patch wrong — it asked to merge nothing. A
  // 200 saying "done" would be the quiet success this project exists to stop.
  .refine((b) => b.dataPatch === undefined || Object.keys(b.dataPatch).length > 0, {
    error: 'dataPatch is empty: name at least one key to change, or null to delete one',
  })
  // `replace` only answers a question `data` asks. On a merge, or on a patch that touches no data
  // at all, there is no field being emptied for it to consent to, so a request carrying it there
  // was built against a rule it has not understood and is told which one.
  .refine((b) => b.replace === undefined || b.data !== undefined, {
    error:
      'replace only means something beside `data`, which rewrites the whole object: it says the fields you ' +
      'left out are meant to go. A dataPatch empties nothing it does not name, so it needs no such answer.',
  })

/**
 * The body of a promotion: the DECISION, in the human's own words.
 *
 * It is the same shape as a create minus the kind, and that is deliberate — promotion files an
 * ordinary `decision` through the ordinary create path, so what may go in `data` is exactly what
 * GET /api/kinds/decision lists and nothing here restates it.
 *
 * There is no key for "carry the proposal's reasoning across". Copying an agent's words into a
 * human-only record is the one thing this route must not do, so there is no way to ask for it.
 */
/** Choosing again on a decision the person has already made. Criterion M83. */
const chooseAgainBody = z.strictObject({
  title,
  summary: summary.nullish(),
  data: data.optional(),
})

const promoteBody = z.strictObject({
  title,
  summary: summary.nullish(),
  data: data.optional(),
  /**
   * WHAT THE PERSON SAID THAT MAKES THIS PROMOTION AN AGENT'S TO MAKE.
   *
   * Left out by a person: their own press needs nobody's words and is refused if it carries any.
   * Left out by an agent: the promotion is refused in exactly the words it has always been refused
   * in. `design/messages/ACCEPTANCE.md` W1 is the contract.
   */
  warrant: warrantBody.optional(),
})

/**
 * The body of a MOVE: where the record goes, and — when anything else has to come — the confirmation
 * that the caller has read the list.
 *
 * `also` IS A CONFIRMATION, NOT A SELECTION. Which records must move is measured from the stored
 * relationships, never taken from the caller, so this may only repeat what the refusal named: an id
 * nothing forces is refused rather than moved, because moving another record is another judgement.
 * An empty array is refused for the same reason `links: []` is on a create — it is a caller that
 * built its request wrong and would otherwise get an answer saying the move it asked for was made.
 */
const moveBody = z.strictObject({
  warrant: warrantBody.optional(),
  to: z
    .string({ error: 'to is required: the id of the project this record should move into' })
    .trim()
    .min(1, { error: 'to must not be empty — GET /api/workspaces lists the projects this installation holds' }),
  also: z
    .array(z.string().trim().min(1, { error: 'every id in `also` must be a record id' }), {
      error: 'also must be a list of the other record ids this move has to carry, as the refusal named them',
    })
    .min(1, {
      error:
        'also is empty: leave the key out entirely when the record moves alone. An empty list is not "no ' +
        'companions" — it is a request built wrong, and it would be answered as a move that happened.',
    })
    .optional(),
  dryRun: z
    .boolean({ error: 'dryRun must be true or false: true reports what would happen and writes nothing' })
    .optional(),
})

/**
 * The body of a DELETE or a restore: nothing, or the person's words the act stands on.
 *
 * An agent deletes or restores a role card's words only on the owner's words, and the warrant is
 * how it carries them, as it does on a create or a change. Every other key is refused by name, as it
 * was when these two took no body at all, because a key the route does not read is a caller
 * believing something about it that is not true.
 */
function onlyAWarrant(endpoint: string) {
  return z
    .strictObject(
      { warrant: warrantBody.optional() },
      {
        error: (issue) =>
          issue.code === 'unrecognized_keys'
            ? `${endpoint} takes nothing but an optional {"warrant": {…}}. This request carried ` +
              `${issue.keys.map((k) => `"${k}"`).join(', ')}, and nothing was done.`
            : undefined,
      },
    )
    .nullish()
}

/** The query string of a DELETE or a restore, which carries nothing: the warrant goes in the body. */
function noQuery(endpoint: string) {
  return z
    .strictObject(
      {},
      {
        error: (issue) =>
          issue.code === 'unrecognized_keys'
            ? `${endpoint} reads nothing from the query string. This request carried ` +
              `${issue.keys.map((k) => `"${k}"`).join(', ')}, and nothing was done.`
            : undefined,
      },
    )
    .nullish()
}

/** The most rows one `GET /api/records` may answer with. Named once, so the refusal and the code agree. */
export const RECORD_LIST_MAX_LIMIT = 1000

const listQuery = z.strictObject({
  // An empty value means "no filter", which is what an unset dropdown sends.
  kind: z.preprocess((v) => (v === '' ? undefined : v), kind.optional()),
  /**
   * HOW MUCH OF EACH RECORD'S `data` COMES BACK.
   *
   * `light`   the whole list a screen reads without opening a record: the state word, the short
   *           forms and a session's `detail`, plus the whole `data` of the two kinds whose bodies
   *           a page draws (a pipeline's ordered blocks and a module's paths).
   * `home`    the home page's own list. It reads a title and one line of words per record, a
   *           pipeline's ordered steps, and a module's checklist and level-1 label, and nothing
   *           else. See the note above `HOME_DATA_BY_KIND` and `homeRecord` below.
   *           A read in this shape that names no `kind` and no `limit` is refused with a 400.
   * `session` the session records the Running now block and the sessions page read, and nothing
   *           else: `id`, `kind`, `data.state` and `data.detail`. A session list draws no title,
   *           no summary, no timestamps and no short forms from this reply — the runs' titles come
   *           from `GET /api/sessions`. See `sessionRecord` below for the measurement.
   * `narrow`  what a caller that reads only names needs, and THE DEFAULT WHEN NO SHAPE IS NAMED:
   *           `id`, `kind`, `workspaceId`, `title`, `createdAt`, `updatedAt`, `origin` (the provenance
   *           mark) and `data.state`, with nothing else in `data`. `?shape=narrow` stays accepted and
   *           answers the same row.
   * `hook`    the session hook's search: `id`, `kind`, `workspaceId`, `title`, `deletedAt`, `origin`,
   *           and `data` cut to `state`, `providerSession` and `extra.discovered`, with only
   *           `externalId`, `pid` and `pidStartedAt` of that.
   * `full`    every field of every row, which is what this door answered before the narrow default.
   *           A caller that opens the record or draws its body asks for this shape.
   */
  shape: z.enum(['light', 'home', 'session', 'narrow', 'hook', 'full']).optional(),
  /**
   * THE LEVEL EACH ROW IS GIVEN AT (src/shared/results-at-a-level.ts): 1 the label, 2 the title, 3 the conclusion, 4 to 6
   * by part, full. A list by `kind` that names no shape and no tally is at each kind's default level without it. Not
   * asked beside `shape` or `tally`.
   */
  level: z.string().refine((word) => levelNamed(word) !== null, { error: NO_SUCH_LEVEL }).optional(),
  /**
   * WHICH RECORDS, BY ID. A page that draws a handful of names from the records its own rows refer
   * to asks for those ids, not for every record of the project. The ids are joined by commas and
   * kept in the order any other listing would keep them; at most the most rows one reply may hold.
   */
  ids: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined
      const named = [...new Set(value.split(',').map((one) => one.trim()).filter((one) => one !== ''))]
      if (named.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'ids must name at least one record id' })
        return z.NEVER
      }
      if (named.length > RECORD_LIST_MAX_LIMIT) {
        ctx.addIssue({
          code: 'custom',
          message: `ids names ${String(named.length)} records, and at most ${String(RECORD_LIST_MAX_LIMIT)} are answered in one read`,
        })
        return z.NEVER
      }
      return named
    }),
  /**
   * WHETHER DECISIONS A LATER ONE REPLACED COME BACK, when `kind=decision` is asked (problem ZSWftCSVUP2r). Left out,
   * they do not: they have left normal content, and `replacedLeftOut` says how many. `include` brings them back, each
   * with `replacedBy` naming the decision that replaced it. Any other kind ignores it.
   */
  replaced: z.enum(['include']).optional(),
  /**
   * HOW MANY ROWS COME BACK, AND WHERE THE PAGE STARTS.
   *
   * WITHOUT A LIMIT THIS ROUTE ANSWERS WITH EVERY LIVE RECORD, which on the owner's corpus is
   * twenty megabytes. `limit` is the page size and `offset` is how many matching rows to skip, so
   * the next page is the same request with a larger offset.
   *
   * A LIMIT OVER THE MAXIMUM IS REFUSED WITH THE MAXIMUM NAMED, never silently clamped: a reply
   * that answered fewer rows than it was asked for and said nothing is the second invariant broken,
   * and a caller counting a page would be counting a number this route invented.
   */
  limit: z.coerce
    .number({ error: 'limit must be a whole number of rows' })
    .int({ error: 'limit must be a whole number of rows' })
    .min(1, { error: 'limit must be at least 1' })
    .max(RECORD_LIST_MAX_LIMIT, {
      error: `limit must be ${String(RECORD_LIST_MAX_LIMIT)} or less — that is the most this route answers in one reply`,
    })
    .optional(),
  offset: z.coerce
    .number({ error: 'offset must be a whole number of rows to skip' })
    .int({ error: 'offset must be a whole number of rows to skip' })
    .min(0, { error: 'offset must be 0 or more' })
    .optional(),
  /**
   * WHAT THE EVERYTHING PAGE ASKS FOR, SO A PAGE OF ROWS STILL ANSWERS FOR
   * EVERY ROW. Each one is worked out over the whole list before the page is cut, so a search,
   * a group or an order is never only about the rows one page holds. A call that sends none of them
   * is answered exactly as before.
   *
   * `q`         keeps the records `GET /api/search` would find for the same words, by the same rule.
   * `family`    keeps the records of one group of kinds.
   * `sort`      orders by one column of the Everything page; `direction` says which way, and without
   *             it the column opens the way its head does.
   * `tally`     adds `tally`: how many records each group holds, counted after `kind` and `q` and
   *             before `family`, so the page's group buttons carry real counts, and the records no
   *             group holds, found over the same rows, for the page's alarm panel.
   */
  q: z
    .string()
    .trim()
    .refine(usableQuery, { error: 'q must say what to look for: leave it out to list every record' })
    .optional(),
  family: z
    .enum(Object.keys(KIND_FAMILIES) as [KindFamily, ...KindFamily[]], {
      error: `family must be one of: ${Object.keys(KIND_FAMILIES).join(', ')}`,
    })
    .optional(),
  sort: z.enum(CATALOGUE_COLUMNS, { error: `sort must be one of: ${CATALOGUE_COLUMNS.join(', ')}` }).optional(),
  direction: z.enum(SORT_DIRECTIONS, { error: 'direction must be asc or desc' }).optional(),
  tally: z.literal('family', { error: 'tally must be exactly family: ?tally=family counts every group' }).optional(),
  /**
   * WHICH PROJECTS, WHEN A PAGE UNDER ALL PROJECTS ASKS. `all` reads every
   * project the reader may read, and a project id reads that one project, whatever the request's
   * project header says. Each row carries its own `workspaceId`. Left out, the list is the header's
   * project, exactly as before. src/shared/across-projects.ts holds the word. The value is read, trimmed and
   * refused when blank by `theProjectsAsked` alone, as at every other door (problem aLkFgGvcHWIz).
   */
  [PROJECTS_QUERY]: z.string().optional(),
  /**
   * THE SECOND LEVEL: `show` hands back each flow's reasons, sources and changes and each
   * decision's basis. Left out, those are left out of every row, and `secondLevel` says so once.
   */
  [SECOND_LEVEL_PARAM]: z.enum(['show'], { error: 'secondLevel takes only show' }).optional(),
  /**
   * THE RECORDS ONE LINK AWAY FROM THE PAGE'S ROWS (round 15, the coordinator's ruling JJNMwadqQj06). `light` hands them
   * back in the light shape as `farEnds`, apart from `records`, so a far end is never mistaken for a row of the list.
   * The Pipelines page draws its family and a chip for each record a link reaches; it asked for the whole project to
   * find them. A far end that is deleted or gone is not in `farEnds`, so the page still says the record is deleted.
   */
  farEnds: z.enum(['light'], { error: 'farEnds takes only light' }).optional(),
})

/**
 * WHAT `GET /api/records/reports-and-notes` TAKES: which kinds to show, and which page of the list.
 * With no `limit` it answers one page of REPORTS_PAGE_SIZE rows and says so in `limit`.
 */
const reportsAndNotesQuery = z.strictObject({
  show: z.enum(REPORTS_PAGE_SHOWS, { error: `show must be one of: ${REPORTS_PAGE_SHOWS.join(', ')}` }).optional(),
  scope: z.string().trim().min(1).optional(),
  filter: z.enum(['unread', 'starred']).optional(),
  limit: listQuery.shape.limit,
  offset: listQuery.shape.offset,
})

/**
 * WHAT `GET /api/records/my-notes` TAKES: a search, one choice above the list, the reader's time zone, and which page.
 * src/server/lib/my-notes.ts does the work.
 */
const myNotesQuery = z.strictObject({
  q: listQuery.shape.q,
  only: z.enum(MY_NOTES_CHOICES, { error: `only must be one of: ${MY_NOTES_CHOICES.join(', ')}` }).optional(),
  zone: z.string().trim().min(1, { error: 'zone must name a time zone, such as Asia/Shanghai: leave it out to count on the office clock' }).optional(),
  limit: listQuery.shape.limit,
  offset: listQuery.shape.offset,
})

/** One row of the Reports page: a light record, the project it is in, its group and its read mark. */
export type ReportsAndNotesRow = RecordListItem & {
  group: ReportsPageGroup
  /** A report's read mark as stored: `read`, `unread`, or null when nobody has marked it. Null on a note, which has none. */
  read: ReportReadAnswer | null
}

/** What `GET /api/records/reports-and-notes` answers. Every count is over every row, not over the page. */
export interface ReportsAndNotesReply {
  rows: ReportsAndNotesRow[]
  scope?: { id: string; title: string; kind: 'module' | 'pipeline' }
  modules?: { id: string; title: string }[]
  show: ReportsPageShow
  /** How many rows of the chosen kinds are in each group, over every project. */
  groups: Record<ReportsPageGroup, number>
  /** How many reports and how many notes there are over every project, whatever `show` is. */
  kinds: Record<ReportsPageKind, number>
  matched: number
  returned: number
  offset: number
  limit: number
  left: number
}

const RECORD_LIST_NOTE =
  "One project's live records, newest changed first and the records changed in the same second by id, A to Z, one " +
  'page at a time with `limit` and `offset`. `kind` or ' +
  '`family` keeps one kind or one group of kinds. With no `shape`, each row is the narrow row: `id`, `kind`, ' +
  '`workspaceId`, `title`, `createdAt`, `updatedAt`, `origin` and `data.state`, and nothing else in `data`. ' +
  '`origin` is the provenance mark, which tells a real record from one that came in through the fixture or the ' +
  'seed. ?shape=full ' +
  'answers the whole rows, and ?shape=narrow asks the same narrow row. ' +
  '?shape=home with no `kind` and no `limit` is refused with a 400 and nothing is read: ask for one kind with ' +
  `\`kind\`, or for one page at a time with \`limit\`, at most ${String(RECORD_LIST_MAX_LIMIT)}, and \`offset\`. ` +
  '`farEnds=light` adds `farEnds`: every record ' +
  'one link away from a row of the page and not itself a row of it, in the light shape. A far end that is deleted ' +
  'or gone is not there. `ids` keeps only the records whose ids are named, joined by commas, and at most the most ' +
  'rows one reply holds; a page that draws the names its own rows refer to asks for those ids and not the project. ' +
  'An id that is not in the answer is not a live record of the projects asked, or is one this reader may not read. ' +
  '?level= gives each row at one level (1 the label, 2 the title, 3 the conclusion, 4 to 6 by part, full), and a ' +
  'list by `kind` with no `shape` and no `tally` is at each kind\'s default level, a setting; `levels` then says how, ' +
  'and past the answer\'s cap the rows are titles only. A level beside a shape or a tally is refused with a 400. ' +
  'It reads only and writes nothing.'

/**
 * THE ROWS `GET /api/records` LISTS FOR THIS READER, before any search, group, order or shape: the
 * messages this reader may read and the honour readings this reader may see. One function, so the
 * Settings page's detail grid counts the rows the list holds.
 */
function theRowsThisReaderIsListed(reader: AMessageReader, rows: PanelRecord[]): PanelRecord[] {
  return recordsWithTheHonourThisReaderMaySee(onlyTheMessagesThisReaderMayRead(reader, rows), reader)
}

const DETAIL_SUPPLY_NOTE =
  'WHAT THE SETTINGS PAGE\'S DETAIL GRID DRAWS, counted over the records `GET /api/records` lists for this ' +
  'project and this reader. `counted` is how many records were counted. `positions` has one entry per length, ' +
  'in the order of the lengths: `written` of `possible` records have that length written, `unwritten` is how ' +
  `many have a place for it and nothing in it, and \`listed\` is the first ${String(UNWRITTEN_LISTED)} of those as id and title. ` +
  '`samples` holds, for each row of the grid, the whole record that row previews, or null. It reads only.'

const WORK_TO_TALK_ABOUT_NOTE =
  'THE CONVERSATIONS PAGE\'S LIST OF WORK TO TALK ABOUT, worked out over the records `GET /api/records` lists for this ' +
  `project and this reader. \`q\` is a search in the titles, as a person typed it. \`rows\` are the first ${String(TALK_SOURCES_SHOWN)} ` +
  'records whose title holds it, most recently changed first, in the narrow shape of GET /api/records. `matched` is how ' +
  `many hold it. Records of the kinds ${NON_WORK_RECORD_KINDS.join(', ')} are never rows; \`leftOut\` counts them by kind, ` +
  'whatever the search. `query` is the search as it was read. It reads only.'

const workToTalkAboutQuery = z.object({ q: z.string().max(500, { error: 'a search is at most 500 characters' }).optional() })

const MY_NOTES_NOTE =
  'MY NOTES: every quick note in every project the reader may read, the newest started first, each whole and with ' +
  '`week`, the Monday of the week it was started in. `q` keeps ' +
  'the notes whose own words hold it: what was written in words and boxes, the names of the pages a note shows, and ' +
  'what was copied in from a page, by the rule GET /api/search uses, and never the part types, colours, ids or file ' +
  'paths. `only` is all, from-a-page, from-no-page or drawn (all when left out). `counts` says how many notes each ' +
  'choice keeps, counted over every note the search keeps. `weeks` lists every week the chosen notes were started in, ' +
  'by the Monday it starts on and the newest first, with how many, counted over every chosen note and not only this ' +
  'page. Weeks are counted on the calendar of `zone`, a time zone such as Asia/Shanghai; a zone the office does not ' +
  'know is refused, and when it is left out the office clock is used. The answer names the zone it used in `zone`, ' +
  `and \`thisWeek\` is the Monday of today's week there. \`limit\` is ${String(MY_NOTES_PAGE_SIZE)} when left out. A note ` +
  'is never a row of the Reports page. It reads only and writes nothing.'

const LAST_WRITTEN_IN_NOTE =
  'THE NOTE THE READER LAST WROTE IN, among the notes GET /api/records/my-notes lists for them: the one with the newest ' +
  'row in the change log written by the reader themselves, by their own actor type and id, that files the note or ' +
  'changes its title or what it holds. A change by another person or by an agent does not count, and neither does a ' +
  'move to another project. `note` is that note whole, with the project it is in, and `writtenAt` is when, on the ' +
  "office's clock. Both are null when the reader has written in none of those notes. The office cannot tell a person " +
  "from a program that sends the person's name, so such a program's writing counts as theirs. It reads only."

const REPORTS_AND_NOTES_NOTE =
  'THE REPORTS PAGE: every report and every note in every project, and no other kind. `show` is both, ' +
  'reports or notes (both when left out). Rows come in groups, in this order: `needs-you` (a report nobody ' +
  'has marked read, whether it is marked unread or not marked at all; a note has no read mark and is never ' +
  'here), `this-week` (filed in the last seven days) and `earlier`; newest filed first inside each group. ' +
  'Each row is the light shape of GET /api/records with its `workspaceId`, its `group` and its stored `read` ' +
  `mark. \`groups\` and \`kinds\` are counted over every row before the page is cut. \`limit\` is ${String(REPORTS_PAGE_SIZE)} ` +
  'when left out, and `offset` is how many rows come before this page. `scope` narrows the list to the reports about ' +
  'a module or a pipeline, and about the parts GET /api/records/<id>/related walks: its blocks and their modules, its ' +
  'sub-modules at every depth and the runs part of any of them. It reads only and writes nothing.'

/**
 * THE WINDOW `GET /api/records/created-between` READS. Both ends are required: a window with one
 * end missing is not a window, and the door refuses it in words rather than widening it to
 * everything.
 */
const createdBetweenQuery = z.strictObject({
  from: z.string({ error: 'from must name the first moment of the window.' }).min(1, { error: 'from must name the first moment of the window.' }),
  to: z.string({ error: 'to must name the last moment of the window.' }).min(1, { error: 'to must name the last moment of the window.' }),
})

/** What GET /api/records/created-between promises, in the words the caller reads before they call it. */
const CREATED_BETWEEN_NOTE =
  'THE RECORDS ONE PROJECT FILED BETWEEN TWO MOMENTS, both ends included, one row each and no body. ' +
  '`from` and `to` are required and are moments Mole Office can read (its own `YYYY-MM-DD HH:MM:SS` ' +
  'local wall clock, or a bare date, which is its start). Each row carries `id`, `kind`, `title`, `when` ' +
  '— the record row\'s own created stamp — `createdBy` from the first revision the ledger keeps for it ' +
  '(the actor and the session; `sessionId` is null where the ledger kept none, and `createdBy` is null ' +
  'where no ledger row answers), and `workingDirectory` from `data` where the record has one. At most ' +
  `${String(CREATED_BETWEEN_MAX)} rows are answered; \`matched\`, \`returned\` and \`truncated\` say when ` +
  'the list was cut. It reads only and writes nothing.'

/**
 * CUT A RECORD DOWN TO THE BODY KEYS A CALLER DRAWS. One function, so a second shape is a second
 * pair of declarations rather than a second copy of this loop (the defect problem dfi72F0VtyK5 was
 * the second copy of, in the browser).
 */
function cutTheBody<T extends { kind: string; data: unknown }>(
  record: T,
  keepsWhole: ReadonlySet<string>,
  keeps: readonly string[],
): T {
  if (keepsWhole.has(record.kind)) return record
  const data = record.data
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return record
  const held = data as Record<string, unknown>
  const kept: Record<string, unknown> = {}
  for (const key of keeps) if (key in held) kept[key] = held[key]
  return { ...record, data: kept }
}

/**
 * THE LIGHT SHAPE OF THE LIST. Measured 11 September 2026 on the owner's database (problem
 * jRaiN3j1IAfz): GET /api/records answered 23 MB for 5,616 records, 14 MB of it the copies old
 * `sealed_tip` records carry in `data.seal`, 5 MB report blocks and short forms, 1.6 MB message
 * bodies. The home page asked for all of it on every visit to draw a count, a title per record and
 * two panels, and over the tunnel from the owner's other machine that was the half minute they reported.
 *
 * A light row keeps everything outside `data`, and of `data` only the state word, the short forms
 * and the session `detail`, which are what a list draws. Two kinds keep their whole `data`, because
 * the home page reads their bodies: a pipeline's blocks and a module's paths. `incompleteCount` is
 * worked out on the whole record before the cut, so it is the same number the full list carries.
 *
 * `detail` IS KEPT FOR THE RUNNING NOW BLOCK. It reads how a run ended — "exit 137, out of memory"
 * — off `data.detail`, and a light row without it would draw a crashed run as if nothing were
 * written about how it ended. `SessionsPanel.fetchSessionsPage` is what needs it.
 *
 * `branchedFrom` IS KEPT FOR A BRANCHED AGENT'S ROW ON ALL RECORDS. The row draws why the agent was
 * started in the page's language from the old agent's id and handle (`summaryOnARow` in
 * src/web/pages/RecordsPage.tsx). A light row without it drew the stored English on a Chinese page
 * (row 55 of report rFBoQG6mAEI0). It is two short strings, and only a branched agent has it.
 *
 * `waitingOnALimit` IS KEPT FOR A RUN'S STATE CELL ON ALL RECORDS. A running run whose next try on a
 * usage limit is more than an hour away is drawn as waiting until then (src/config/a-long-wait.mjs).
 * Only a run waiting on a limit has it, and it is a few hundred bytes. The copy a run filed before it
 * was a field keeps in `extra` is not kept: it was written before the mark kept a next try, so it
 * never makes a wait long.
 */
const LIGHT_KEEPS_WHOLE: ReadonlySet<string> = new Set(['pipeline', 'module'])
const LIGHT_KEEPS_KEYS = ['state', 'shortForms', 'detail', 'branchedFrom', 'waitingOnALimit'] as const
// Problem rows need the existing authoritative repair namespace for the shared state reader.
const LIGHT_PROBLEM_KEEPS_KEYS = [...LIGHT_KEEPS_KEYS, 'mainSuiteFix'] as const

/**
 * THE HOME PAGE'S OWN LIST, AND WHY IT IS NARROWER THAN `light`.
 *
 * Measured 12 September 2026 on a copy of the owner's database (7,779 records): `?shape=light` answered
 * 4,133,420 bytes for the whole corpus, and the home page read the title map from `title` and
 * `summary`, the pipelines from `blockIds` and the modules from `paths` — and none of the two big
 * `data` keys. `data.shortForms` was 1,341,297 bytes of the answer and `data.detail` 385,119; both
 * are read by other screens (the records list and the Running now block) and neither by this one.
 *
 * MEASURED AGAIN, 12 September 2026, FOR THE TOP-LEVEL FIELDS. On the same corpus the home shape
 * answered 2,622,586 bytes, and most of it was top-level fields the page never reads: `summary`
 * 569,375, `title` 403,842, `createdAt` and `updatedAt` 267,414 together, `origin` 63,659.
 *
 * ---------------------------------------------------------------------------------------
 * PER KIND, NAMED BY THE COMPONENT THAT READS EACH FIELD
 * ---------------------------------------------------------------------------------------
 *
 * This list was written for three consumers on the home page: `wordsAt` (src/shared/detailsource.ts),
 * which names a record in a row, `readPipelines` (src/web/lib/attention.ts) with `PipelinesBlock`,
 * and `ModulesPanel` with `pickModules`/`parseModule`. HOME NO LONGER DRAWS `ModulesPanel`: wave 13k's
 * commit c42764f0a (29 September 2026, Home in two columns) took it off, and on main as of 1 October
 * 2026 no page draws it. Wave 13k's round 22 draws it on the project page once that round lands. The
 * module fields below are still the ones it reads; whether this list should keep them for nobody on
 * Home is not settled here. Per kind they read:
 *
 *   every kind   `id` and `kind` (the title map and the filters), `title` and `summary` (the gist
 *                `wordsAt` draws at Home's default setting), and `data`.
 *   pipeline     `updatedAt` (`ageAlarm` on the row), `workspaceId` (the record the row opens), and
 *                of `data` only `blockIds`, which is the ordered steps.
 *   module       `updatedAt` (`pickModules` orders by it), `workspaceId` and `origin` (the row's
 *                link and its `OriginMark`), and of `data` `state` and `parts` (`parseModule`) and
 *                `shortForms.label`, the level-1 label `wordsAt` draws in a row.
 *   block        `deletedAt` (`readPipelineBlocks` refuses to call a deleted block readable) and of
 *                `data` only `state` (the step fact the strip draws) and `paused` (the row's
 *                sentence says a pipeline is standing still when every unfinished step is paused,
 *                as a decision says.
 *
 * THE MODULE'S SHORT FORMS ARE CUT TO THE LABEL, AND THE REST OF THE KEY IS LEFT BEHIND. The
 * by-part structure shares `data.shortForms` (`PARTS_KEY` in src/shared/zoom.ts) and a record may
 * still hold keys this product has retired, so sending the whole key back would put bytes on the
 * wire that no reader on this page looks at. `wordsAt` reads only the whole-record lengths this
 * product still stores, and today that is the label alone; `homeShortForms` below is that cut.
 * Measured on the office's own corpus, 15 September 2026: putting the label back costs 4,170 bytes
 * on a home list of 1,937,042. A decision chose to pay it.
 *
 * NOTHING READS `createdAt`, `ownerId` or `incompleteCount` on this page, so they are dropped; so is
 * every `data` key outside those three kinds, `titleDerived`, and every short form except a module's
 * label. The row types are unchanged: `homeRecord` is a declared selection the request names,
 * exactly as `homeAttention` is.
 */
const HOME_FIELDS_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  pipeline: ['id', 'kind', 'title', 'summary', 'data', 'updatedAt', 'workspaceId'],
  module: ['id', 'kind', 'title', 'summary', 'data', 'updatedAt', 'workspaceId', 'origin'],
  block: ['id', 'kind', 'title', 'summary', 'data', 'deletedAt'],
}
const HOME_FIELDS_OTHER: readonly string[] = ['id', 'kind', 'title', 'summary', 'data']
const HOME_DATA_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  pipeline: ['blockIds'],
  module: ['state', 'parts', 'shortForms'],
  block: ['state', 'paused'],
}

/**
 * A MODULE'S SHORT FORMS, CUT TO THE LABEL.
 *
 * `data.shortForms` is not only the label: the by-part structure sits under `PARTS_KEY` beside it,
 * and a record may still hold keys this product retired. Home draws a row through `wordsAt`, which
 * reads only the whole-record lengths this product still stores (`STORED_SHORT_FORM_LEVELS` in
 * src/shared/zoom.ts), and today that is the label alone. So the label is what goes on the wire and
 * the rest of the key is left behind, rather than sent back whole.
 *
 * ABSENT OR UNREADABLE IS ABSENT. A module with no label gets no `shortForms` key at all, not an
 * empty object standing in for one nobody wrote.
 */
function homeShortForms(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const held = value as Record<string, unknown>
  const kept: Record<string, unknown> = {}
  for (const level of STORED_SHORT_FORM_LEVELS) if (level in held) kept[level] = held[level]
  return Object.keys(kept).length === 0 ? null : kept
}

/** Keep only the named top-level fields, in the declaration's order. */
function keepFields<T extends Record<string, unknown>>(record: T, fields: readonly string[]): T {
  const kept: Record<string, unknown> = {}
  for (const key of fields) if (key in record) kept[key] = record[key]
  return kept as T
}

function lightRecord<T extends { kind: string; data: unknown }>(record: T): T {
  return cutTheBody(record, LIGHT_KEEPS_WHOLE, record.kind === 'problem' ? LIGHT_PROBLEM_KEEPS_KEYS : LIGHT_KEEPS_KEYS)
}

function homeRecord<T extends { kind: string; data: unknown }>(record: T): T {
  const kept = keepFields(record as unknown as Record<string, unknown>, HOME_FIELDS_BY_KIND[record.kind] ?? HOME_FIELDS_OTHER)
  const body = record.data
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return kept as T
  const held = body as Record<string, unknown>
  const cut: Record<string, unknown> = {}
  for (const key of HOME_DATA_BY_KIND[record.kind] ?? []) if (key in held) cut[key] = held[key]
  // THE LABEL, NOT THE WHOLE SHORT-FORMS KEY. See `homeShortForms` above.
  if (record.kind === 'module') {
    const label = homeShortForms(cut[SHORT_FORMS_FIELD])
    if (label === null) delete cut[SHORT_FORMS_FIELD]
    else cut[SHORT_FORMS_FIELD] = label
  }
  kept['data'] = cut
  return kept as T
}

/**
 * THE SESSION LIST'S OWN SHAPE, AND WHY IT IS NARROWER AGAIN.
 *
 * MEASURED 12 September 2026 on a copy of the owner's database (7,891 records): `GET
 * /api/records?kind=session&shape=light` answered 1,090,413 bytes for 2,088 session records. The
 * Running now block reads those records for exactly two facts per run — `data.state` (what was
 * written down) and `data.detail` (how it ended) — and the sessions page reads the same two through
 * the same function. Everything else the reply carried was bytes nobody on either screen drew:
 * `title` 93,703, `summary` 67,411, the two timestamps 87,696, `id` and the other top-level fields
 * about 97,000, and `data.shortForms` 13,430. On this shape the same reply is about 540,000 bytes,
 * most of it `data.detail`, which `readSessionRecordFacts` really does read.
 *
 * ONE KIND AND THREE BODY KEYS, all named rather than inferred: a caller that wants a session's
 * title asks the sessions door, which is where a run's title lives. `light` is unchanged for every
 * other list that draws short forms or a title. The third is `waitingOnALimit`, which the sessions
 * page reads to draw a run waiting more than an hour on a usage limit as waiting, as the light shape
 * keeps it for All records.
 */
const SESSION_KEEPS_KEYS = ['state', 'detail', 'waitingOnALimit'] as const

function sessionRecord<T extends { kind: string; id: string; data: unknown }>(record: T): T {
  const cut = cutTheBody(record, new Set<string>(), SESSION_KEEPS_KEYS)
  // ONLY THE THREE TOP-LEVEL FIELDS THE TWO READERS USE. `readSessionRecordFacts` keys its map by
  // `id`, checks `kind`, and reads `data`; nothing else on the wire is looked at.
  return { id: record.id, kind: record.kind, data: cut.data } as unknown as T
}

/**
 * THE NARROW SHAPE: IDS, KINDS, TITLES, STAMPS, THE PROVENANCE MARK, AND NOTHING IN `data` BUT THE STATE WORD.
 *
 * Measured since 27 August 2026: record.list answered 20.6 GB in 5,421 answered calls, about 3.8 MB each — the door
 * answered every record with its whole `data` whatever row a caller reads, and several callers read only the fields
 * above. It is the answer to a plain call, and `?shape=full` answers every top-level field of every row and every
 * field of `data`, as a plain call did before.
 *
 * `origin` IS KEPT because a made-up row must stay labelled wherever it is listed: every record this product serves
 * carries its mark (`PanelRecord.origin`), the attention door's narrow rows carry it, and a caller that drops the
 * made-up rows by it (the review tool's own list of what it photographs) would read a narrow row as unmarked.
 */
const NARROW_KEYS = ['id', 'kind', 'workspaceId', 'title', 'createdAt', 'updatedAt', 'origin'] as const
const NARROW_DATA_KEYS = ['state'] as const

function narrowRecord<T extends { kind: string; data: unknown; createdAt?: string; updatedAt?: string }>(record: T): T {
  const kept = keepFields(record as unknown as Record<string, unknown>, NARROW_KEYS)
  const body = (record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : {}) as Record<string, unknown>
  const cut: Record<string, unknown> = {}
  for (const key of NARROW_DATA_KEYS) if (body[key] !== undefined) cut[key] = body[key]
  kept['data'] = cut
  return kept as T
}

/**
 * THE `hook` SHAPE: THE SESSION HOOK'S SEARCH, AND NOTHING ELSE.
 *
 * The hook needs the row that names its conversation, the provenance mark every listed row carries,
 * and the three discovery fields that name the process behind it. The live session record is up to
 * 535 KB and almost all of it is `data.detail`, which no search in the hook reads. `extra` is an open
 * bag, so the cut keeps only `discovered`, and only the three fields of it the hook checks; the
 * hook's later whole-record read (the one that stamps the record) still reads the whole `extra`
 * before merging into it.
 */
const HOOK_KEEPS_KEYS = ['state', 'providerSession', 'extra'] as const
const HOOK_DISCOVERY_KEYS = ['externalId', 'pid', 'pidStartedAt'] as const

function hookRecord<T extends {
  kind: string
  id: string
  workspaceId: string
  title: string
  deletedAt?: string | null
  origin?: unknown
  data: unknown
}>(record: T): T {
  const body = (record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data : {}) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (body.state !== undefined) data.state = body.state
  if (body.providerSession !== undefined) data.providerSession = body.providerSession
  const extra = body.extra
  if (extra !== null && typeof extra === 'object' && !Array.isArray(extra)) {
    const discovered = (extra as Record<string, unknown>).discovered
    if (discovered !== null && typeof discovered === 'object' && !Array.isArray(discovered)) {
      const kept: Record<string, unknown> = {}
      for (const key of HOOK_DISCOVERY_KEYS) {
        const value = (discovered as Record<string, unknown>)[key]
        if (value !== undefined) kept[key] = value
      }
      data.extra = { discovered: kept }
    }
  }
  return {
    id: record.id,
    kind: record.kind,
    workspaceId: record.workspaceId,
    title: record.title,
    deletedAt: record.deletedAt,
    origin: record.origin,
    data,
  } as T
}

/**
 * THE `data` OF EACH ROW CUT IN SQLITE TO WHAT `home`, `session`, `narrow` OR `hook` ANSWERS, and to the fields in `alsoKeep`.
 * Worked out from the shapes' own declarations above. The shape is still applied to each row afterwards, so the
 * answer is the shape's answer, and SQLite only leaves the rest of each `data` unread. A `data` that is not an object is
 * kept whole, as each shape keeps it (`onlyTheseFieldsOf` in lib/records.ts).
 */
function theDataAShapeAnswers(shape: 'home' | 'session' | 'narrow' | 'hook', alsoKeep: readonly string[]): SQL<string> {
  if (shape === 'session') return onlyTheseFieldsOf([...SESSION_KEEPS_KEYS, ...alsoKeep])
  if (shape === 'narrow') return onlyTheseFieldsOf([...NARROW_DATA_KEYS, ...alsoKeep])
  if (shape === 'hook') return onlyTheseFieldsOf([...HOOK_KEEPS_KEYS, ...alsoKeep], [], { extra: ['discovered'] })
  const byKind = Object.entries(HOME_DATA_BY_KIND).map(([kind, keys]) => sql`WHEN ${kind} THEN ${onlyTheseFieldsOf([...keys, ...alsoKeep])}`)
  return sql<string>`(CASE ${recordsTable.kind} ${sql.join(byKind, sql` `)} ELSE ${onlyTheseFieldsOf(alsoKeep)} END)`
}

/**
 * A ROW WHOSE `incompleteCount` WAS NOT WORKED OUT, because its `data` was not read whole. Only the rows read whole carry
 * the count, and every answer that holds it, or sorts by it, reads its rows whole. So reading it from one of these rows
 * is a mistake in `GET /api/records`, and it fails rather than answering a number nobody counted.
 */
const THE_COUNT_WAS_NOT_WORKED_OUT: object = Object.freeze({
  get incompleteCount(): never {
    throw new Error('GET /api/records read this row without its whole data, so its incompleteCount was not worked out.')
  },
})

// EACH ROW IS GIVEN THE GUARD IN PLACE: the rows were read for this request alone, so they are not copied a second time.
function withNoIncompleteCount(rows: PanelRecord[]): RecordListItem[] {
  for (const record of rows) Object.setPrototypeOf(record, THE_COUNT_WAS_NOT_WORKED_OUT)
  return rows as RecordListItem[]
}

const idParams = z.object({ id: z.string().min(1, { error: 'the URL must contain a record id' }) })

/**
 * THE QUERY OF `GET /api/records/:id`. `shape=where` answers the record's id, kind and project only, and a session's
 * runtime word. The other keys a caller sends are read where they are used, so this object passes them through.
 */
const recordReadQuery = z.looseObject({ shape: z.enum(['where']).optional() })

/** WHERE ONE RECORD IS: what `GET /api/records/:id?shape=where` answers. */
interface RecordWhere {
  id: string
  kind: string
  workspaceId: string
  /** ON A SESSION, THE HARNESS ITS RECORD NAMES, as written. Absent when it names none. The waiter reads it. */
  runtime?: string
}

/**
 * How a caller asks what is still open around one record.
 *
 * `reach` is how many links away a loop may be; `rung` is how much each loop says. Neither of them
 * can change WHICH loops are open — that is decided by stored facts about the records themselves.
 */
const contextQuery = z.strictObject({
  reach: z.coerce
    .number({ error: 'reach must be a number of links' })
    .int({ error: 'reach must be a whole number of links' })
    .min(0, { error: 'reach must be 0 or more' })
    .max(6, { error: 'reach must be 6 or less: past six links a project is one connected lump' })
    .optional(),
  rung: z.enum(RUNGS as readonly [Rung, ...Rung[]], { error: `rung must be one of: ${RUNGS.join(', ')}` }).optional(),
  [SECOND_LEVEL_PARAM]: z.enum(['show'], { error: 'secondLevel takes one value, show' }).optional(),
})

/**
 * WHAT `GET /api/records/:id/related` TAKES: which kind of related record, and which page of at most
 * RELATED_PAGE_MOST rows. A decision's basis is one level down, given when `secondLevel=show` asks.
 */
const relatedQuery = z.strictObject({
  kind: z.enum(RELATED_KINDS, { error: `kind must be one of: ${RELATED_KINDS.join(', ')}` }),
  limit: z.coerce
    .number({ error: 'limit must be a whole number of rows' })
    .int({ error: 'limit must be a whole number of rows' })
    .min(1, { error: 'limit must be at least 1' })
    .max(RELATED_PAGE_MOST, { error: `limit must be ${String(RELATED_PAGE_MOST)} or less: that is the most one answer carries` })
    .optional(),
  offset: z.coerce
    .number({ error: 'offset must be a whole number of rows to skip' })
    .int({ error: 'offset must be a whole number of rows to skip' })
    .min(0, { error: 'offset must be 0 or more' })
    .optional(),
  [SECOND_LEVEL_PARAM]: z.enum(['show'], { error: 'secondLevel takes one value, show' }).optional(),
})

/**
 * THE THREE FACTS ABOUT A SCREEN THAT GET /api/records/:id/layout WILL NOT GUESS.
 *
 * ALL THREE ARE REQUIRED AND NONE HAS A DEFAULT. A width is a fact about somebody's screen, a gap
 * is a fact about their density setting, and a root font size is a fact about their text size. A
 * default for any of them would let this route answer confidently about a screen nobody is looking
 * at, and the answer would look exactly like a true one.
 *
 * `strictObject` because a misspelt `witdh` would otherwise be read as "width was not sent", and
 * the refusal would name the wrong fault.
 */
const layoutQuery = z.strictObject({
  width: z.coerce
    .number({
      error:
        'width is required, in pixels: how wide the box holding the report is drawn. There is no default — a ' +
        'width is a fact about a screen, and this server has never seen one',
    })
    .positive({ error: 'width is how many pixels wide the box is, so it is more than nothing' }),
  gutter: z.coerce
    .number({
      error:
        'gutter is required, in pixels: the gap drawn between two parts standing beside each other. There is no ' +
        'default — it is 6, 10, 12, 16 or 18 depending on the reader\'s density setting and which profile the ' +
        'report is drawn in, so a guess here would be wrong four times in five',
    })
    .min(0, { error: 'a gutter is a gap, so it is nothing or more' }),
  rem: z.coerce
    .number({
      error:
        'rem is required, in pixels: the reader\'s root font size, which is what every size in the layout is ' +
        'written in. There is no default — a reader who chose the large text size gets a different answer, and ' +
        'that is the point of asking',
    })
    .positive({ error: 'rem is how many pixels one rem is, so it is more than nothing' }),
  read: z.coerce
    .number({
      error:
        'read is required, in pixels: how wide the `narrow` reading measure comes out on your screen, which ' +
        'is the value of --read. There is no default — that width is declared once, in the stylesheet, and a ' +
        'second copy of it in the server is the defect this product keeps producing. Read it off the document, ' +
        'the same way you read the gap and the root font size',
    })
    .positive({ error: 'read is how many pixels wide the reading measure is, so it is more than nothing' }),
  /**
   * WHICH OF THE THREE READERS IS ASKING, and it is required for the same reason the four widths
   * are. A `beside` block's parts are filtered by audience before they are drawn, so the same
   * report is a two-part row for a developer and one plain full-width block for a normal reader.
   * A default here would answer confidently about somebody who is not reading.
   */
  reader: z.enum(READERS as readonly [Reader, ...Reader[]], {
    error:
      `reader is required and is one of: ${READERS.join(', ')}. There is no default — a part of a composition ` +
      'written for developers is not drawn for a normal reader at all, so the same report is a different ' +
      'arrangement depending on who is looking, and this server cannot see who that is',
  }),
})

/** What GET /api/records/:id/context promises, in the words the caller reads before they call it. */
const AROUND_NOTE =
  'THE OTHER RECORDS AND THE LINKS A RECORD PAGE DRAWS, so the page does not read the whole project to draw ' +
  'one record. `records` holds every live record of this project the page reads: the record itself, the ' +
  'record at the other end of each of its links, every record whose id its data holds, every record a link ' +
  'or unlink row of its change log names, every pipeline that lists it, on a module every direction and what ' +
  'their links reach, and on a role card every record that says which chapter it is. The rows are the rows ' +
  '`GET /api/records` answers, in its order, newest change first. `links` holds the links touching the record ' +
  '(on a module, also those touching a direction), as `GET /api/links` answers them. It reads only.'

const TITLE_OPTIONS_NOTE =
  'THE ROWS A RECORD PICKER OFFERS: every live record of this project as `{value, id, note}`, where `value` ' +
  'is its title and `note` tells two records of one title apart (null where the title is not shared). The ' +
  'order is the order of `GET /api/records`. A record page asks for it only while it is being edited. ' +
  'It reads only.'

const CONTEXT_NOTE =
  'What is still open around this record, for an agent that has just arrived and knows nothing. ' +
  POPULATION_SENTENCE +
  " Every loop carries its id, the record's own words at the length that fitted, its stored state word and " +
  'what Mole Office makes of it, whose move it is where anybody has said, how many links from here it is, when it ' +
  'last changed, and which modules it is linked to. A problem also carries what its recorded attempts say must ' +
  'NOT be tried again. Every candidate not carried is named, one bucket each, with the id and the reason — ' +
  'and the reasons are stored facts only: the state word, the resolution of a fork, and the number of links ' +
  'from here. Nothing reads what a record says in order to decide whether to carry it. `reach` (default 2) is ' +
  'how many links away a loop may be and `rung` is how much each one says: changing the rung changes the ' +
  'LENGTH of the answer, never which loops are in it. THE WHOLE ANSWER FITS IN 16 KB — when it does not fit ' +
  'at the length asked for, every loop says less and the reply says so. Every reply also says how many of the ' +
  "project's open loops are linked to no module at all, because a short answer under a module is otherwise " +
  'read as a quiet module. This is a read: it writes nothing and starts nothing.'

const RELATED_NOTE =
  'WHAT IS RELATED TO A MODULE OR A PIPELINE, at every depth, one kind at a time: `kind` is decisions, reports or ' +
  'checklists. The subjects are the record itself; for a pipeline, its blocks and the modules implementing them; the ' +
  'sub-modules of any of those at every depth, each once; and the runs part of any of them. Decisions are the ones ' +
  'about any subject, by its governs, by a link, through a fork, or inferred from the files a module states, joined ' +
  'into one row each; a replaced decision is left out and named in `replacedLeftOut`. Reports are those with an ' +
  'about link to a subject, and a deleted one is counted in `deletedLeftOut`. Checklists are those with an item ' +
  'whose links name a subject, with only those items. Each row says whether the record itself reached it ' +
  '(`directly`) and which other subjects did (`through`), and `inferred` marks a decision nobody wrote about it. ' +
  `Newest first, then by id. \`limit\` is ${String(RELATED_PAGE_MOST)} at most and when left out, \`offset\` is how many ` +
  'rows come before this page, and `left` is how many come after it. `couldNotRead` names each way that could not ' +
  'run, so a short list is not taken for a whole one. A decision\'s basis is held back until secondLevel=show asks. ' +
  'It answers 404 for a record not in this project and 400 for one that is not a module or a pipeline. It reads only.'

/**
 * The address of one checklist line: which module, which item.
 *
 * Both are in the URL rather than the body because they say WHICH THING is being changed, and
 * the body says what about it changes. An item id in the body would make the same request mean
 * two different edits depending on a key nobody looks at twice.
 */
const checklistParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a record id' }),
  itemId: z.string().min(1, { error: 'the URL must contain a checklist item id' }),
})

/**
 * The body of a checklist-item patch: the item's own keys, merged into that one item.
 *
 * Only the shape is checked here. WHICH keys a checklist item takes comes from SHAPE_SPECS in
 * shared/kinds.ts, checked in lib/records.ts, so the seed script and the tests get the same
 * answer as HTTP and there is no second list of item fields to keep in step.
 */
const checklistBody = z.record(z.string(), z.unknown(), {
  error:
    'the body must be a JSON object holding the item keys you want to change, for example ' +
    '{"state":"done"} or {"state":"failed","note":"the shell cracked"} — a null value deletes an optional key',
})

/**
 * `ifVersion` IS A KEY OF THE REQUEST AND NEVER A KEY OF THE ITEM, on both checklist routes.
 *
 * It arrives in the same object as the item's own fields, because there is nowhere else to put it
 * on a body that IS the item — so it is lifted out here, before the item ever reaches the field
 * check, and passed as its own argument. Leaving it in would make it a `ProgressItem` field, which
 * it is not, and `ITEM_KEYS` would then have to grow a word that means nothing about the line.
 *
 * Until this existed both routes answered `400 — a checklist item has no field "ifVersion"`. The
 * only guard that would have stopped a stale write was refused by the only two routes the
 * documentation recommends, in a sentence that reads as the caller's own mistake.
 */
function liftIfVersion(body: Record<string, unknown>): {
  rest: Record<string, unknown>
  ifVersion: string | undefined
} {
  if (!('ifVersion' in body)) return { rest: body, ifVersion: undefined }
  const { ifVersion: sent, ...rest } = body
  const checked = parse(z.object({ ifVersion }), { ifVersion: sent }, 'The request body is not usable:')
  return { rest, ifVersion: checked.ifVersion }
}

/**
 * The body of a checklist APPEND: which part the new line goes on, and the line.
 *
 * `partId` is the only key this schema names. Everything else is the item, and WHICH keys an item
 * takes is SHAPE_SPECS['ProgressItem'] in shared/kinds/module.ts, checked in lib/records.ts — the same
 * single list the edit path checks against. Naming the item's fields again here would be a second
 * declaration of one vocabulary with nothing making the two agree, which is this codebase's own
 * recurring defect and the reason `PATCH .../checklist/:itemId` does not do it either.
 */
const appendChecklistBody = z
  .object({
    partId: z
      .string({ error: 'partId is required: which part of the checklist the new line goes on' })
      .trim()
      .min(1, {
        error:
          'partId must not be empty — a module has several parts and there is no default one. ' +
          'GET /api/records/<module id> lists them, and a partId that names none of them is refused ' +
          'with the ids that exist.',
      }),
  })
  .catchall(z.unknown())

/** The body of a new part: its id and its heading, and the version the caller read when it chose to say. */
const appendPartBody = z.strictObject({
  id: z.string({ error: 'id is required: a short id for the new part, unique within this module' }).trim().min(1, { error: 'id must not be empty' }),
  name: z.string({ error: 'name is required: the heading the part\'s lines sit under' }).trim().min(1, { error: 'name must not be empty' }),
  ifVersion: ifVersion.optional(),
})

/** The address of one block: which pipeline, which block. Both in the URL, for the checklist reason. */
const blockParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a pipeline record id' }),
  blockId: z.string().min(1, { error: 'the URL must contain a block record id' }),
})

/**
 * A revision number out of the URL: 1-based, whole, and never zero.
 *
 * REFUSED HERE RATHER THAN LOOKED UP AND MISSED. `seq` counts from 1, so `0` and `-3` name nothing
 * that can ever exist, and a 404 for them would say "this record has no revision 0" as though a
 * later write might produce one. `coerce` because a path parameter is always a string.
 */
const revisionSeq = z.coerce
  .number({ error: 'the revision number in the URL must be a whole number, counting from 1' })
  .int({ error: 'a revision number is a whole number — revisions are counted, not measured' })
  .min(1, { error: 'revision numbers start at 1, 1 being the oldest' })

const revisionParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a record id' }),
  seq: revisionSeq,
})

const compareParams = z.object({
  id: z.string().min(1, { error: 'the URL must contain a record id' }),
  seq: revisionSeq,
  otherSeq: revisionSeq,
})

/**
 * The body of a restore: why, in the caller's own words, and which version it was written against.
 *
 * There is no key for which content to write. The revision named in the URL is the content, read
 * from the ledger — a body that could carry content would be a way to write anything at all while
 * calling it a restore, and the reply would then say a revision was put back that never was.
 *
 * `ifVersion` IS OPTIONAL AND IT MATTERS. Without it a restore answers the checklist guard with the
 * record as it stands, read inside its own transaction, so it puts the content back and takes out
 * any line somebody added since. That is what a restore is for, and it is also weaker than the
 * claim the caller made: naming revision 4 proves it read revision 4, not what the record holds
 * now. Sending `ifVersion` makes the whole restore refuse with a 409 if anybody has written since
 * the caller's own read. This key used to be refused outright — "Unrecognized key: ifVersion" — so
 * a careful caller had no way to ask for the strict door at all.
 */
const restoreRevisionBody = z
  .strictObject({
    note: z
      .string({ error: 'note must be text saying why this is being put back' })
      .refine((s) => s.trim() !== '', {
        error:
          'note is an empty string. Leave the key out if you have nothing to say — a blank note reads as a ' +
          'reason nobody gave, which is not the same as no reason having been asked for.',
      })
      .optional(),
    ifVersion: ifVersion.optional(),
    warrant: warrantBody.optional(),
  })
  .optional()

const blockState = z.enum(ITEM_STATES, { error: `state must be one of: ${ITEM_STATES.join(', ')}` })

/**
 * The body of a block create.
 *
 * `name` is the block's OWN name and not its title. The server builds the title as
 * `<the pipeline's title> › <name>`, which is what keeps two pipelines free to have a step called
 * "Plan the approach" while every block stays addressable by typing its name.
 */
const addBlockBody = z.strictObject({
  name: z.string({ error: 'name is required and must be text' }).trim().min(1, {
    error: 'name must not be empty — it is the second half of the block\'s title, which is how you link to it',
  }),
  state: blockState,
  // THE BLOCK'S OWN SUMMARY, the record field every kind has. This is the only door a block is filed through, and it
  // refused the key until wave 13j round 51 (report FRsTZ627KvQQ).
  summary: z.string({ error: 'summary must be text: what the block is, in a sentence or two' }).trim().min(1, {
    error: 'summary is an empty string. Leave the key out if the block has no summary yet.',
  }).optional(),
  measured: z.string().optional(),
  consequence: z.unknown().optional(),
  paused: z.unknown().optional(),
  source: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  at: z
    .number({ error: 'at must be a whole number: where in the order this block goes, counting from 0' })
    .int()
    .min(0)
    .optional(),
})

/**
 * WHAT RAN INSTEAD OF THIS STEP'S CANONICAL METHOD.
 *
 * Every field is required except `source`, and that is the point of the kind: a fallback nobody
 * said the cost of is a fallback that quietly becomes the method. `allowed_uses` and
 * `disallowed_claims` are the author's own strings, carried unchanged to every record that depends
 * on this one, and `severity` is authored — Mole Office never works it out.
 */
const ranInsteadBody = z.strictObject({
  ran: z
    .string({ error: 'ran is required and must be text: what actually ran, precisely enough to repeat' })
    .trim()
    .min(1, { error: 'ran must not be empty' }),
  because: z
    .string({ error: 'because is required and must be text: why the canonical method could not run' })
    .trim()
    .min(1, { error: 'because must not be empty' }),
  since: z
    .string({ error: 'since is required: the date it started running instead, as YYYY-MM-DD' })
    .trim()
    .min(1, { error: 'since must not be empty' }),
  allowed_uses: z.array(z.string()),
  disallowed_claims: z.array(z.string()),
  severity: z.enum(RESTRICTION_SEVERITY),
  source: z.string().optional(),
})

const patchBlockBody = z
  .strictObject({
    name: z.string().trim().min(1, { error: 'name must not be empty' }).optional(),
    state: blockState.optional(),
    // Null clears it. An empty string would store a blank that reads on the page as a gap.
    measured: z.union([z.string(), z.null()]).optional(),
    consequence: z.unknown().optional(),
    paused: z.unknown().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    error: 'send at least one of name, state, measured, consequence or paused',
  })

const reorderBody = z.strictObject({
  blockIds: z.array(z.string().min(1), {
    error: 'blockIds must be the WHOLE order, as a list of this pipeline\'s block record ids',
  }),
})

/**
 * The body of a discharge: what settled the obligation, when, and which of the two ways.
 *
 * `note` is REQUIRED here and optional on the record, and that difference is deliberate — see
 * DischargeInput in lib/records.ts. The states come from DISCHARGE_STATES, which is derived from
 * readFulfilment in shared/work.ts rather than typed out, so this endpoint cannot offer a word
 * that no longer discharges anything.
 */
const fulfilBody = z.strictObject({
  note: z
    .string({ error: 'note is required: one line saying what settled this obligation' })
    .trim()
    .min(1, {
      error:
        'note must not be empty — say what settled it, e.g. "Both pages are in the shared drive and the ' +
        'reviewer acknowledged them". A discharge with no note is indistinguishable from a mis-click a year later',
    }),
  at: z
    .string()
    .trim()
    .min(1, { error: 'at must not be empty — leave it out and the moment of this request is used' })
    .optional(),
  state: z
    .enum(DISCHARGE_STATES as [ObligationState, ...ObligationState[]], {
      error:
        `state must be one of: ${DISCHARGE_STATES.join(', ')} — "fulfilled" if it was delivered, ` +
        `"cancelled" if it stopped being owed, which is not the same thing`,
    })
    .optional(),
})

// ---------------------------------------------------------------------------- what comes back

/**
 * A record on the list, with how many required fields it is still missing.
 *
 * Spread onto the record rather than wrapped around it (`{record, incompleteCount}`) so that
 * everything already reading `records[i].title` keeps working; the badge is one more field, not
 * a new shape every caller has to be taught.
 */
export type RecordListItem = PanelRecord & { incompleteCount: number }

/**
 * WHAT `GET /api/records` ANSWERS: the page, and where it sits in the whole list.
 *
 * `matched` is how many live records the filter found, counted before anything was cut. `returned`
 * is how many are in `records`. `left` is what this reply did not carry. `next` is the request that
 * carries the next page, or null when nothing was left; it is built from the same query rather than
 * described in prose, so a caller can follow it without guessing what the words meant.
 */
export interface RecordListReply {
  records: RecordListItem[]
  /** What the rows left out, when a flow or a decision is among them and ?secondLevel=show did not ask. */
  secondLevel?: SecondLevelHeld
  matched: number
  returned: number
  left: number
  truncated: boolean
  next: string | null
  /**
   * Present only when `?tally=family` was asked. `everything` is how many records `kind` and `q`
   * kept, whatever their group; `families` is how many of those are in each group. A record whose
   * kind is in no group counts in `everything` and in no group, and is one of `unfiled`.
   */
  tally?: RecordListTally
  /**
   * Present only when `kind=decision` was asked: how many live decisions a later decision replaced, left out of this
   * list because `replaced=include` was not asked (problem ZSWftCSVUP2r). Zero when none were, or when they were included.
   */
  replacedLeftOut?: number
  /**
   * Present only when `?projects=` was asked: the ids of the projects read, in the order
   * GET /api/workspaces lists them. Every row carries its own `workspaceId` among them.
   */
  projects?: string[]
  /**
   * Present only when `?farEnds=light` was asked: every live record this reader may read that one link joins to a row
   * of this page and that is not itself a row of it, in the light shape. Not counted in `matched`, `returned` or `left`.
   */
  farEnds?: RecordListItem[]
  /**
   * Present only when the rows are at levels (`?level=`, or a list by kind with no shape and no tally): what the answer
   * says about its rows' levels, its short limit and its cap. Each row then carries `atLevel`, and a row below full
   * holds only its words up to its level (`ARowAtLevel` in src/shared/results-at-a-level.ts).
   */
  levels?: TheLevelsOfAnAnswer
}

/** How many records each group holds, for the Everything page's group buttons. */
export interface RecordListTally {
  everything: number
  families: Record<KindFamily, number>
  /**
   * Every record `kind` and `q` kept that no group holds (`noHeadingHolds`), in the shape the rows
   * were asked in, whichever page is asked for. The Everything page's alarm panel lists these, so
   * it speaks for every row and not only for the page on screen.
   */
  unfiled: RecordListItem[]
}

/** The query `nextRecordsPage` carries forward: every narrowing that decides which rows are in the list. */
type RecordListQuery = {
  kind?: string | undefined
  replaced?: string | undefined
  shape?: string | undefined
  level?: string | undefined
  limit?: number | undefined
  q?: string | undefined
  family?: string | undefined
  sort?: string | undefined
  direction?: string | undefined
  tally?: string | undefined
  projects?: string | undefined
  secondLevel?: string | undefined
  farEnds?: string | undefined
}

/** The request that carries the next page of one `GET /api/records` query. */
function nextRecordsPage(q: RecordListQuery, nextOffset: number): string {
  const params = new URLSearchParams()
  if (q.kind !== undefined) params.set('kind', q.kind)
  if (q.shape !== undefined) params.set('shape', q.shape)
  if (q.level !== undefined) params.set('level', q.level)
  if (q.limit !== undefined) params.set('limit', String(q.limit))
  if (q.q !== undefined) params.set('q', q.q)
  if (q.family !== undefined) params.set('family', q.family)
  if (q.sort !== undefined) params.set('sort', q.sort)
  if (q.direction !== undefined) params.set('direction', q.direction)
  if (q.tally !== undefined) params.set('tally', q.tally)
  if (q.replaced !== undefined) params.set('replaced', q.replaced)
  if (q[PROJECTS_QUERY] !== undefined) params.set(PROJECTS_QUERY, q[PROJECTS_QUERY])
  if (q.secondLevel !== undefined) params.set(SECOND_LEVEL_PARAM, q.secondLevel)
  if (q.farEnds !== undefined) params.set('farEnds', q.farEnds)
  params.set('offset', String(nextOffset))
  return `GET /api/records?${params.toString()}`
}

/** A record, plus what it still wants. `incomplete` is empty when the record is complete. */
export interface RecordReply {
  nothingWritten?: string
  /** Present only when this write changed a session territory. */
  territoryOverlaps?: TerritoryOverlaps
  record: PanelRecord
  incomplete: Incompleteness[]
  /**
   * WHERE THE QUESTION ON THIS RECORD IS: with the starter of the agent that asked, or with the
   * person. Criterion P55. Present only on a record that asks the person something, because on
   * every other record it would be a sentence saying nothing is happening.
   *
   * IT IS ON THE REPLY AND NOT WORKED OUT BY THE READER, for the reason the waiting queue's own
   * `why` is: the reading needs the revision ledger and the registry, and a browser has neither.
   */
  whereTheQuestionIs?: WhereTheQuestionIs
  /**
   * A FIELD MOLE OFFICE FILLED IN THAT THE CALLER DID NOT SEND, and where the value came from.
   *
   * Absent on every write that filled nothing in, which is nearly all of them. Writing a field for
   * somebody must never be silent, so it is said in the answer to their own request.
   */
  moleOfficeWrote?: { field: string; value: string; because: string }
  /**
   * THE FLOW RUN THE OFFICE FILED BESIDE A SESSION, or why it could not, with the problem it filed. On every
   * session filed and on nothing else. Wave 1 of the office flow, M1.
   */
  flowRun?: FlowRunFiled
  /**
   * WHERE A MESSAGE WENT WHEN ITS ADDRESSEE COULD NOT BE REACHED. It follows a decision. It
   * also follows decision J1Qge4JH87bv, which amends another decision.
   *
   * A retired addressee, or one nothing is answering as, keeps the letter in `data.to`; Mole Office
   * ALSO gives it to the first reachable participant up the addressee's chain of starters, ending at
   * the secretary and then the owner. One entry per addressee that could not be reached, carrying
   * the addressee, the reading's own sentence, the one participant chosen (`to` is null when that is
   * the sender), the rungs passed over and the finished line every surface prints.
   *
   * THE STATUS FOLLOWS A DECISION. A person's send to a RETIRED addressee, and a person's or an
   * agent's send to a registered agent nothing holds, are stored, routed and answered 409; every
   * other routed send answers 201 with this field in the reply.
   */
  routed?: RoutedAddressee[]
  /**
   * THE ADDRESSEES MOLE OFFICE COULD NOT TELL ABOUT, and so did not route (problem `TOoUy7fMbg1P`).
   * Each carries the reading's own sentence and one plain line saying Mole Office could not tell
   * whether that addressee is answering, so it did not also give the message to anybody else. The
   * send still answers 201. Absent when there is none.
   */
  notRouted?: NotRoutedAddressee[]
  /**
   * THE WHOLE REFUSAL, when an error answer still stored the record.
   *
   * A person's send to a retired agent, and a person's or an agent's send to a registered agent
   * nothing holds, store the letter and answer 409,
   * and the answer keeps the error and says the known reason, so the chat can tell the reader what
   * happened to the letter instead of showing a bare failure. This is the routed line,
   * or every routed line joined with a space, word for word; the browser draws it on the failed
   * mark's hover and screen-reader text.
   */
  error?: string
  /**
   * THE SAME REFUSAL IN A FEW WORDS, when the server knows a short one.
   *
   * "Pike is retired." for a send to a retired agent, built once by `theRetiredAddresseesReason`
   * in shared/messages.ts, criterion M113a. For a person's or an agent's send to a registered agent
   * nothing holds, the sentence the send built from the presence dot's own grey word.
   * `theReasonOfA409Send` puts the two together. Absent on every other answer.
   */
  reason?: string
  /**
   * The same news in one sentence, and only when there IS news.
   *
   * A write response is read by whoever just wrote — often an agent that will act on the first
   * line and not walk the array. This is the line. It is absent on a complete record, for the
   * same reason `dataPatch` is absent when there was no merge: an empty report next to a success
   * reads as "nothing to say", which is exactly true here and must not be said twice.
   */
  incompleteNote?: string
  /**
   * What filing this record did about the run name the caller is writing under. Sent when there
   * is something to say, which is exactly twice:
   *
   *   * THE NAME WAS CLAIMED. A session filing ITSELF — POST /api/records {"kind":"session"} sent
   *     with `x-mole-office-session: <a run name>` — binds that name to the new record and repoints
   *     every change row written under the raw name before the record existed. Those rows belong
   *     to the caller and the caller did not ask for them to move, so the move is reported rather
   *     than done quietly: `repointed` is how many, `note` is the sentence, `alreadyBoundTo` null.
   *
   *   * THE NAME WAS ALREADY SPOKEN FOR — another session is bound to it, or is titled exactly
   *     that. Nothing is written, `repointed` is 0 and `alreadyBoundTo` names the session that
   *     holds it. This is the case the endpoint was silent about: the caller's rows had been
   *     filed under that other session all along, the 201 read as success, and nothing anywhere
   *     told it. `note` says which session has the name, where the caller's rows went, and the
   *     two requests that get it out — every route it names is one this server serves, which
   *     tests/session-binding.test.ts checks against the live route table.
   *
   * ABSENT when `x-mole-office-session` carried a session record's ID and that record exists. That
   * reference is exact and the rows are already filed under it, so there is no news; a report
   * there would be a paragraph on every ordinary write saying that nothing happened.
   */
  sessionBinding?: SessionBinding
  /**
   * WHICH VERSION OF THIS RECORD YOU ARE HOLDING. Present on every reply that carries a record.
   *
   * Send it back as `ifVersion` on a PATCH and the write is refused with 409 if anybody has changed
   * the record since — the compare-and-set. It is a hash of everything a write can change, not a
   * clock and not a counter, so two writes that leave the record holding what you read produce the
   * version you already have, and a write that changes one character does not.
   *
   * WHY IT IS ON EVERY REPLY AND NOT ONLY ON THE READ. A caller that has just written knows exactly
   * what the record holds; making it re-read to get a token before its next write would be the
   * round trip every one of these endpoints exists to remove.
   */
  version: string
  /**
   * Live records already in this workspace whose titles are very close to this one. Absent when
   * there are none, which is the ordinary case, and always absent on a message.
   *
   * See `nearDuplicateTitles` in lib/records/near-duplicate-titles.ts for the measure, the threshold, and the measurement
   * the threshold came from. This is advisory: nothing is refused, nothing is merged, and no record
   * is changed by it.
   */
  similar?: SimilarTitle[]
  /** The same news in one sentence, present exactly when `similar` is. */
  similarNote?: string
  /**
   * On a create that linked the new record to a module or a block: the other live records already
   * linked there. Absent when there are none. Problem DVzgaTVrVW3I; `theRecordsAlreadyLinkedThere`
   * in lib/records.ts says what it counts and what it leaves out. Advisory, like `similar`.
   */
  alreadyLinkedThere?: AlreadyLinkedThere[]
  /** The same news in one sentence, present exactly when `alreadyLinkedThere` is. */
  alreadyLinkedThereNote?: string
  /**
   * Live records in this project already called EXACTLY this. Absent when there are none.
   *
   * NOT A REFUSAL, since 17 August 2026. A repeated title used to come back as a 400 saying the
   * record already existed; the owner overturned that — id is identity, title is presentation,
   * titles may repeat — and this is what stands in its place. The record was written. This says
   * what else answers to the name, so a screen can ask "there is already work called this — did you
   * mean it?" and take no for an answer.
   *
   * `similar` beside it is the near miss, scored. This is the exact match. Two facts, two fields.
   */
  sameTitle?: { id: string; kind: RecordKind; title: string }[]
  /** The same news in one sentence, present exactly when `sameTitle` is. */
  sameTitleNote?: string
  /** Present when a message's words seem to hold a key. The message is stored as written (lib/message-keys.ts). */
  keyReminder?: AKeyReminder
  /**
   * Present when a decision or a report names something the write should say back: the module a whole-project decision
   * should name instead, and to whom each new nothingFits entry was sent, or why nobody (lib/what-a-record-names.ts).
   */
  whatItNames?: WhatTheWriteNames
  /**
   * Present when this write was made with a run key bound to another run of the same agent. The write is taken, and
   * the sentence names the key's run and the run it wrote; the written run carries one line, once for the pair.
   */
  runKeyReminder?: string
  /**
   * THE RECORDS THE WORDS NAME, each once as {id, kind, title, where}, with `deleted: true` on a deleted record. Always
   * present on the 201 answer to a message or a report, on the 409 answer to a message that is stored all the same (a
   * person's message to a retired addressee, or a person's or an agent's message to a registered agent nothing holds),
   * and on the answer to a PATCH of a message or a report. An empty list means the words
   * were read and name no record. The 200 answer to a message already sent and the answer to a check have none.
   * lib/message-keys.ts says which words are read and which records are left out. Nothing is refused for it.
   */
  recordsNamed?: ARecordNamed[] | null
  /** Why `recordsNamed` is null: the write is stored, and the records its words name could not be read. */
  recordsNamedNotRead?: string
  /** Present on a report write whose local media leaves with a sandbox or worktree. The write is kept. */
  reportFileReminder?: AReportFileReminder
  /** Present when a message carries a lead: the one sentence on when a lead is right. The message is stored as written. */
  leadReminder?: string
  /** THE WRITER ALREADY SENT THIS PRESS: the first message's id and why nothing was written, by point 1 of
   * a decision. */
  alreadySent?: { id: string; because: string }
  /**
   * Present when this record's `blocked_by` names a real record that no `blocks` link points at.
   *
   * The link is the canonical statement of a dependency — it is what the attention rule, the gate,
   * the record page and the graph read — and `data.blocked_by` is read by nothing. So a write that
   * fills in the prose and leaves the graph empty is told, and given the one request that fixes it.
   * Nothing is written on the caller's behalf.
   */
  blockedBy?: BlockedByReport
  /**
   * The relationships written WITH this record, resolved at both ends. Absent when none was asked
   * for; present and whole when any was, because there is no partial version of this list.
   *
   * The ends are resolved rather than echoed: a caller that typed a title finds out here which
   * record that name really meant, which is the case where checking matters most.
   */
  links?: CreatedLink[]
  /** The same news in one sentence, present exactly when `links` is. */
  linksNote?: string
  /**
   * WHICH SHORTER FORMS THIS RECORD STILL HAS NOBODY'S WORDS AT, and how to write them.
   *
   * ---------------------------------------------------------------------------------------
   * IT IS INFORMATION AND NOT A REFUSAL, AND IT IS NOT PART OF `incomplete`
   * ---------------------------------------------------------------------------------------
   *
   * The owner settled this on 29 August 2026: *"Projection availability is separate from record
   * completeness."* A report with no short forms is a COMPLETE report — `shortForms` is optional in
   * src/shared/kinds.ts and stays optional — and it has nothing for a list, a card or a graph to
   * draw. Both are true at once. So this says what is missing and never adds to `incomplete`, which
   * is what makes a write report the record unfinished.
   *
   * ---------------------------------------------------------------------------------------
   * WHY IT IS ON THE REPLY AT ALL
   * ---------------------------------------------------------------------------------------
   *
   * The agent that just filed the report is the one that can still write its six forms, and it is
   * the only one that has read the report. Measured on 2 September 2026: of twenty reports in this
   * project, seventeen carried no short form at any length and all twenty carried no account, so
   * every reading length below Full drew a sentence saying nobody had written one. Nothing had ever
   * told a filing agent that the lengths existed.
   *
   * ABSENT WHEN THERE IS NOTHING TO SAY: a kind with no `shortForms` field, or a record whose six
   * are all written. A key that is always there with an empty list inside it is a report about
   * nothing on every reply for ever.
   *
   * ON FILING ONLY, AND THAT IS MEASURED RATHER THAN ARGUED. It was built into `recordReply` for
   * one commit, which put it on every PATCH as well, and `tests/checklist-item.test.ts` — which
   * measures what ticking one checklist line costs against rewriting the whole array — went red by
   * three hundred bytes. Nine hundred bytes on every reply is a real cost to routes that have
   * nothing to do with short forms. The create route is the one that adds it.
   */
  shortForms?: ShortFormsStillToWrite
  /**
   * WHAT THE LAYOUT WILL DO WITH THE PROPORTIONS THIS REPORT ASKED FOR. Absent when the record
   * holds no parts seen beside each other, which is every record in the corpus until one is
   * written.
   *
   * One entry per composition, each naming every part, what it asked to be worth, what it is worth,
   * the width above which the ask is drawn exactly, the width below which the parts go one under
   * another, and one plain sentence saying what happens. IT IS WIDTH-FREE, because a write does not
   * know what screen anybody will read it on: send
   * `GET /api/records/:id/layout?width=&gutter=&rem=&read=&reader=`
   * to find out what would be drawn at one, and what was refused there and why.
   *
   * WHY IT IS ON THE WRITE AT ALL. An Agent writing `9 to 1` learns here, in the same reply, that
   * 9 to 1 is not what a narrow screen will draw — rather than finding out from a screenshot, or
   * not finding out. The proportions are a preference the layout may adapt, and a preference nobody
   * is told about the fate of is a preference the product only pretended to take.
   */
  layout?: CompositionPlanned[]
  /**
   * WHAT TO HAND AN AGENT THIS WRITE JUST REGISTERED, INCLUDING ITS KEY. Criterion P83, point 5.
   *
   * PRESENT ONLY ON A WRITE THAT MADE AN AGENT, which is this door's half of the registration
   * contract. `POST /api/agents/started` carries the same field; the two are one reply because an
   * agent should not have to know which of the two doors registered it to find its own key.
   *
   * THE KEY IS IN THE REPLY AND NOWHERE ELSE. It is made here, its SHA-256 is what `held_keys`
   * stores, and this is the only time the value is shown; `keySays` is the one sentence, read from
   * keys.ts so the two doors cannot say two different things about it. `handle` is repeated here so
   * a reader has the name the key belongs to without re-reading the record.
   */
  whatToGiveIt?: { handle: string; key: string; keySays: string }
  /** Why an agent write answered no key: it named a live agent, so it joined that agent's row. */
  keyNotGivenBecause?: string
  /**
   * WHAT A RUN THE OFFICE JUST STARTED WAS MINTED, INCLUDING ITS KEY. Criterion M81 and P83 point 5.
   *
   * PRESENT ONLY ON THE WRITE THAT FILED A RUNNING SESSION THE OFFICE ITSELF STARTED, and only when
   * the office can bind the key to the agent the run serves. It is a SECOND live key of that agent,
   * not a replacement for the agent's registration key: a request carrying it is that agent and no
   * more, and the run carries it only for its own life. `handle` names the agent it proves, and
   * `keySays` is the one sentence keys.ts declares so this door and the registration doors cannot
   * say two different things about what to do with it.
   *
   * THE KEY IS IN THE REPLY AND NOWHERE ELSE. `held_keys` keeps only its SHA-256, and the run's own
   * record keeps the row id so the key can be revoked when the run ends.
   */
  runKey?: { handle: string; key: string; keySays: string }
}

/**
 * THE LENGTHS NOBODY HAS WRITTEN YET ON ONE RECORD, and the two requests that write them.
 *
 * Every word in it comes from the declaration in src/shared/zoom.ts, so the budgets a caller reads
 * here are the budgets the write door enforces.
 */
export interface ShortFormsStillToWrite {
  /** The lengths with nobody's words at them, shortest first. Never empty: the key is absent then. */
  missing: { level: ShortFormLevel | typeof PARTS_KEY; noun: string; what: string; words: { min: number; max: number } }[]
  /** The request that writes them. */
  write: string
  /** Where the revision that request has to name comes from. */
  madeFrom: string
  /** The same news in one sentence, for a caller that reads the first line of a reply. */
  note: string
}

/**
 * WHAT SHORTER FORMS THIS RECORD STILL OWES, or nothing to say.
 *
 * ASKED OF THE RECORD AS IT NOW STANDS, not of the request that was sent, for the same reason
 * `incomplete` is: a merge patch that never mentions `shortForms` still leaves a report with none.
 */
function shortFormsStillToWrite(record: PanelRecord): ShortFormsStillToWrite | undefined {
  if (!kindDeclaresShortForms(record.kind)) return undefined
  const stored = (record.data as Record<string, unknown> | null)?.[SHORT_FORMS_FIELD]
  const held = readStoredShortForms(stored)
  // THE LABEL, WHICH IS THE ONE WHOLE-RECORD LENGTH STILL WRITTEN INTO `data.shortForms`. Reading
  // lengths 2 and 3 are the record's own title and summary since 3 September 2026 — criterion A14b
  // — so they are never on this list: the record is filed with them or it is filed without them,
  // and a summary nobody wrote is reported by `incomplete` on the record itself, not here.
  const missing: ShortFormsStillToWrite['missing'] = STORED_SHORT_FORM_LEVELS.filter(
    (level) => held[level] === undefined,
  ).map((level) => {
    const spec = SHORT_FORM_SPECS[level]
    return { level, noun: spec.noun, what: spec.what, words: { min: spec.minWords, max: spec.maxWords } }
  })
  // AND THE THREE READING LENGTHS WRITTEN BY PART, WHICH ARE ONE THING TO WRITE AND NOT THREE. They
  // share one stored structure, so a report either has all three or none of them, and a writer told
  // about three separate missing lengths would go looking for three separate requests.
  //
  // ONLY ON A KIND THAT HOLDS BLOCKS. A part names the blocks it covers, so a kind with none has no
  // place for these three and naming them here would be work reported as owed that nobody can do.
  // Every kind has carried a level-1 name since 5 September 2026 and most kinds hold no blocks, so
  // the two questions came apart and this asks the one it means.
  if (kindHoldsPartsLevels(record.kind) && readStoredParts(stored) === null) {
    const spec = RUNG_SPECS['outline']
    missing.push({
      level: PARTS_KEY,
      noun: 'summary written by part, which is reading levels 4, 5 and 6 together',
      // THE RECORD'S OWN WORD, not `report`: a module carries these three lengths too (problem
      // rLYYdQeL0vJL).
      what:
        `For each part of the ${kindWord(record.kind).text}: a heading of at most 10 words that is the part's ` +
        'one-sentence summary, a text of at most 30 words, a text of at most 120 words, and the ids of the blocks ' +
        `the part covers. Every block of the ${kindWord(record.kind).text} is covered by exactly one part.`,
      words: spec.words ?? { min: 1, max: 10 },
    })
  }
  if (missing.length === 0) return undefined
  const write = `POST /api/records/${record.id}/short-forms`
  const madeFrom = `GET /api/records/${record.id}/revisions`
  // THE BODY OF THAT WRITE, with each field in its place and one key in `forms` for each length still to write.
  const forms = missing.map((one) => `"${one.level}":${one.level === PARTS_KEY ? '[…]' : '"…"'}`).join(',')
  const body = `{"madeFrom":{"seq":<seq>,"contentHash":"<contentHash>"},"forms":{${forms}}}`
  // WHAT THIS RECORD IS CALLED IN A SENTENCE, from the one table. The stored key is `report`, and
  // the word a reader gets is read rather than spelt here.
  const holder = kindWord(record.kind).text
  return {
    missing,
    write,
    madeFrom,
    note:
      `Nobody has written the ${joined(missing.map((one) => one.noun))} of this ${holder}. Those are the ` +
      `lengths a list, a card, a picker or a graph draws when it has no room for the whole thing, and each says ` +
      `so rather than cutting the ${holder} down to fit. Write them in this run, while you still have the ` +
      `${holder} in front of you: ${write} ${body}, with the seq and contentHash of the newest entry of ${madeFrom}. ` +
      `Nothing is refused for their absence — a ${holder} with none is complete — and this is the only ` +
      `place that says the lengths are there to write.`,
  }
}

/**
 * The sentence a write response leads with when the record was stored unfinished.
 *
 * It names the paths rather than describing them, and points at the request that fixes them: the
 * full description of each field is in `incomplete` right beside it, and repeating all of it here
 * would bury the one thing this sentence is for — that the 201 you just got is not a finished
 * record.
 */
function noteFor(kind: RecordKind, incomplete: readonly Incompleteness[]): string | undefined {
  if (incomplete.length === 0) return undefined
  const paths = incomplete.map((i) => i.path).join(', ')
  const count =
    incomplete.length === 1 ? 'one field it still needs' : `${incomplete.length} fields it still needs`
  return (
    `Stored, but this ${kind} is incomplete: ${count} — ${paths}. ` +
    `Each one is spelt out in "incomplete", with an example. Send them when you know them: ` +
    `PATCH /api/records/:id {"dataPatch":{...}}. Nothing is blocked in the meantime.`
  )
}

/**
 * Build the write-response body: the record, what it wants, the sentence if it wants anything,
 * and the session binding when filing it moved change rows or refused to.
 *
 * `binding` is only ever passed by the create route — it is the only write that can claim a run
 * name — and is left off the object entirely when there is none, so a caller can test for the key
 * rather than for a null.
 */
/**
 * WHY A BLOCK'S CANONICAL METHOD IS THE PERSON'S TO CHANGE, when it is.
 *
 * Absent on every record with no live fallback about it, rather than present and empty: *nothing is
 * holding this shut* and *this key does not apply to this kind* are different facts, and a caller
 * reading a false key would learn a rule that is not there.
 */
/**
 * Whether every block this pipeline lists has ended, read after the write.
 *
 * `done` and `failed` both END a block — a failed step is finished, and a pipeline whose last step
 * failed has finished too. A block with no state at all is NOT finished: nobody has said, and
 * reading an absence as completion is the substitution this product refuses to make.
 */
/**
 * WHETHER A SESSION RECORD IS THE OFFICE'S OWN CHECK TOOL RUN.
 *
 * The worker writes `extra.purpose: 'inspection'` on such a record. An inspection run is the
 * office's own tool: it is handed no prompt and keeps the office's own key, so it is not minted a
 * run key. Read from the stored flag rather than from the runtime word, because the runtime word is
 * what a caller could spell and this is what the worker's own start path wrote.
 */
function isAnInspectionRun(data: Record<string, unknown>): boolean {
  const extra = data['extra']
  return (
    typeof extra === 'object' &&
    extra !== null &&
    !Array.isArray(extra) &&
    (extra as Record<string, unknown>)['purpose'] === 'inspection'
  )
}

function pipelineJustFinished(pipelineId: string): boolean {
  const pipeline = getRecord(pipelineId)
  if (pipeline === null || pipeline.kind !== 'pipeline') return false
  const ids = blockIdsOf(pipeline)
  if (ids.length === 0) return false
  for (const id of ids) {
    const block = getRecord(id)
    if (block === null || block.deletedAt != null) return false
    const state = (block.data as Record<string, unknown> | null)?.['state']
    if (state !== 'done' && state !== 'failed') return false
  }
  return true
}

function methodOwnership(record: PanelRecord): {
  methodIsThePersons?: { because: string; fallbacks: { id: string; title: string }[] }
} {
  if (record.kind !== 'block') return {}
  const live = liveFallbacksAbout(record.id)
  if (live.length === 0) return {}
  return {
    methodIsThePersons: {
      because:
        `${live.length === 1 ? 'A record' : `${live.length} records`} of what ran instead of this step's ` +
        `canonical method ${live.length === 1 ? 'is' : 'are'} live, so only a person may change data.method ` +
        `here. That is not a lease and nothing expires: it lasts exactly as long as the fallback does, and a ` +
        `fallback is lifted by a resolves link from the record showing the canonical method ran. If what ran ` +
        `is better, that is a claim, a proposal, criticism and a decision — and only a person may write the last.`,
      fallbacks: live,
    },
  }
}

/**
 * Remind from the record the write returned, after it has been kept. This stays in the API because files.ts
 * imports lib/records.ts; putting this reader there would make an import cycle. Only path arithmetic is needed.
 */
function reportFileReminderFor(record: PanelRecord): AReportFileReminder | undefined {
  if (record.kind !== 'report') return undefined
  // Use slash separators for inside on every platform. On POSIX a backslash remains a filename character.
  const localPath = (path: string): string => resolve(path).split(sep).join('/')
  const storedFolder = localPath(reportFileDirectory())
  const sandboxFolder = localPath(SANDBOXES_FOLDER)
  const worktreeFolder = localPath(WORKTREES_FOLDER)
  const blocks: AReportFileReminder['blocks'] = []
  for (const ref of storedPathsIn(record)) {
    if (ref.machine !== null || ref.blockId === null || !isAbsolute(ref.path)) continue
    const type = ref.blockType
    if (type !== 'image' && type !== 'video' && type !== 'audio') continue
    const path = localPath(ref.path)
    if (inside(path, storedFolder)) continue
    const folder = inside(path, sandboxFolder) ? 'sandboxes' : inside(path, worktreeFolder) ? 'worktrees' : null
    if (folder !== null) blocks.push({ id: ref.blockId, type, path: ref.path, folder })
  }
  return blocks.length === 0 ? undefined : theReportFileReminder(blocks)
}

function recordReply(
  record: PanelRecord,
  /** Who reads the reply. The blocked-by report names only what this reader may read. */
  reader: AMessageReader,
  incomplete: Incompleteness[],
  binding?: SessionBinding,
  similar?: readonly SimilarTitle[],
  links?: readonly CreatedLink[],
  linksNote?: string,
  sameTitle?: readonly { id: string; kind: RecordKind; title: string }[],
): RecordReply {
  const note = noteFor(record.kind, incomplete)
  const version = versionOf(record)
  const reply: RecordReply =
    note === undefined ? { record, incomplete, version } : { record, incomplete, version, incompleteNote: note }
  if (binding !== undefined) reply.sessionBinding = binding

  // WHAT WILL HAPPEN TO THE PROPORTIONS THIS RECORD ASKED FOR, and only when it asked. An empty
  // list on every write in the corpus would be a report about nothing, on every reply, forever.
  // AS AN AGENT, BECAUSE AN AGENT IS WHO IS READING THIS. A write response goes back to whoever
  // just wrote the record, and `readerSees` says an agent is never shown less — so this is every
  // part of every composition, which is what the author of a report needs to be told about what
  // it wrote. A page drawn for a person asks GET /api/records/:id/layout with that person's own
  // reader instead.
  const layout = compositionsIn(record, 'agent')
  if (layout.length > 0) reply.layout = layout

  // AND WHERE THE QUESTION ON IT IS, when it asks the person anything. Criterion P55. The reading
  // says `with: null` and a sentence for a record that asks nothing, and putting that on every
  // reply in the product would be a line about nothing on nearly all of them — so the key is
  // absent there and the caller reads the absence as "this record asks nobody anything".
  const question = whereOneQuestionIs(record)
  if (question.with !== null || question.reachedThePerson) reply.whereTheQuestionIs = question

  // Both keys go on together or neither does. A list with no sentence beside it is a report a
  // caller reading the first line of the answer never sees, and a sentence with no list is one it
  // cannot act on without asking again.
  if (similar !== undefined && similar.length > 0) {
    reply.similar = [...similar]
    reply.similarNote = describeSimilar(record.id, similar)
  }

  // The same rule again: both keys or neither. The sentence says the write went through, because
  // this reply used to be a refusal and a caller that has read the old one will read this as one
  // too unless it says otherwise in its first words.
  //
  // THE WAY OUT IT OFFERS HAS TO BE TRUE OF A RENAME AS WELL, since 18 August 2026. It used to end
  // "DELETE /api/records/<id> and work on that one instead", which is sound advice for a record
  // that was created a moment ago and holds nothing. `PATCH /api/records/:id` answers this now
  // too, and there the record may be a year of work that was only renamed — so the sentence says
  // what the delete does and that it can be undone, instead of telling somebody to throw the
  // record away. Both routes named here are routes this server serves.
  if (sameTitle !== undefined && sameTitle.length > 0) {
    reply.sameTitle = [...sameTitle]
    reply.sameTitleNote =
      `Stored. ${sameTitle.length === 1 ? 'One record' : `${sameTitle.length} records`} in this project ` +
      `${sameTitle.length === 1 ? 'is' : 'are'} already called "${record.title}": ` +
      `${sameTitle.map((one) => `${one.kind} ${one.id}`).join('; ')}. Nothing was refused and nothing was ` +
      `merged — an id says which record it is and a title says what it is called, so two records may share a ` +
      `name. If one of them is the work you meant, take this one out of the way with ` +
      `DELETE /api/records/${record.id}, which is reversible: POST /api/records/${record.id}/restore brings ` +
      `it back. If this is different work that happens to be called the same, there is nothing to do.`
  }

  // The same rule for the same reason: both keys or neither. The sentence is built in
  // lib/records.ts beside the write that made them, so what the reply says was linked is written
  // by the code that did the linking.
  if (links !== undefined && links.length > 0 && linksNote !== undefined) {
    reply.links = [...links]
    reply.linksNote = linksNote
  }

  // Asked of the record as it now STANDS, not of the patch that was sent, for the same reason
  // `incomplete` is: a merge patch that never mentions `blocked_by` can still leave a record whose
  // dependency is prose, and the caller that just wrote it is who can still put it right.
  const blockedBy = blockedByReport(record, reader)
  if (blockedBy !== null) reply.blockedBy = blockedBy

  return reply
}

/**
 * THE STARTER'S OWN KEY, AS THE KEY THAT PROVED A RUN'S CREATE AND MINT, or null.
 *
 * Not null only where `mintARunKey` below mints on the starter's path: a running session, not an inspection run, that
 * serves a registered agent with a handle, filed with an agent's key whose holder is that agent's registered starter.
 * The key's holder is read from the key as `actorFrom` in lib/http.ts proved it, never from a header or the body, and
 * the shape is the one that function stores where a key and the headers differ.
 *
 * WHY IT IS STORED. A run's own key proves the run only where its mint stores the starter's key (lib/keys.ts). Without
 * it, a run a starter files by hand for its agent is minted a key that proves no run of its own.
 *
 * ONE FUNCTION, TWO CALLERS. The create door hands the answer to the create, and `mintARunKey` asks it again to decide
 * and to hand the same answer to the mint, so the two revisions carry the same holder. It is never put on the actor,
 * so no other write and no reader of the actor sees it.
 */
function theStartersKeyThatMintsThisRun(kind: string, data: Record<string, unknown> | undefined, actor: Actor): ProvedHolder | null {
  if (kind !== 'session' || data === undefined || data['state'] !== 'running' || isAnInspectionRun(data)) return null
  if (actor.provedBy !== 'an-agent-key' || actor.keyHolder === undefined) return null
  const serving = theAgentARunServes(data)
  const registry = serving === null ? null : readParticipant({ kind: 'agent', id: serving.id })
  const agent = registry !== null && 'startedBy' in registry ? registry : null
  if (agent === null || agent.handle === '' || !theKeyHolderIsTheRegisteredStarterOf(agent, actor.keyHolder)) return null
  return { id: actor.keyHolder, how: 'an-agent-key', claimed: actor.id }
}

/**
 * A RUN THE OFFICE JUST STARTED IS MINTED ITS OWN KEY, BOUND TO THE AGENT IT SERVES. M81 and
 * P83 point 5.
 *
 * THIS IS THE SEAM. One worker serves every agent in a project, so the single `MOLE_AGENT_KEY` in
 * its environment cannot be the key of whichever agent a particular run serves. The office keeps
 * only the SHA-256 of the key it answered at registration, so there is no stored value it could
 * hand a run either. The only honest answer is to make a fresh key at the moment the run starts:
 * a second live key of that agent, handed to this run and no other.
 *
 * IT IS MADE ON THE WRITE THAT FILES THE RUNNING SESSION, because that write is the office starting
 * the run. It is made AFTER the record exists so a refused create answers no key, and it is written
 * onto the record as the `held_keys` row that keeps its hash, so the key can be revoked when the run
 * ends without the office ever storing its value. The value leaves in the reply's `runKey` and
 * nowhere else.
 *
 * IT IS CALLED INSIDE THE CREATE'S TRANSACTION, in the POST /api/records handler. So the session
 * record, its `data.extra.runKeyId` and the `held_keys` row are stored together or not at all. If
 * writing the row id onto the record fails, the whole create is rolled back: no session record, no
 * change row, no revision and no key are left, and the request is refused with that error.
 *
 * FOUR CALLERS MAY ASK, AND EACH ONE ONLY WITH A KEY.
 *
 *   the office       it proved itself with the office's key, and the session says
 *                    `startedByMoleOffice`. The message worker holds that key. A session that
 *                    merely claims `startedByMoleOffice` without the key is answered no key,
 *                    because the claim alone is not the office.
 *   the starter      it proved itself with an agent key, and that key's holder is the served
 *                    agent's registered starter (P83 point 5; message M5m4y7nRUJKn). This
 *                    is a launcher in a sandbox filing its worker's run. It does not ask for
 *                    `startedByMoleOffice`. A run key is an agent key of its agent, so a
 *                    supervisor holding its own run key mints its workers' runs too; a noKey hand start
 *                    also names its live asking run and brief, and records the key under that ask.
 *   the next round   it proved itself with the office's key, and the session is the next round the
 *                    office is starting (wave 13j round loop-2, lib/next-round.ts): its parent is the
 *                    message worker's launcher run for that round, and it is derived from the run the
 *                    round continues. It does not say `startedByMoleOffice`, because the launcher, not
 *                    the office, runs its process. The ask on the last run becomes `started`, in the
 *                    same transaction. A run that names such a launcher run as its parent and is
 *                    derived from another run is refused, and the create is undone.
 *   the worker run   it proved itself with the office's key, and the session is a worker a supervisor
 *                    asked for at the worker-run door (wave 13j round loop-3, lib/worker-runs.ts): its
 *                    parent is the supervisor's run, which keeps that worker's run `starting`, and the
 *                    session header names the launcher run the office filed for it. It does not say
 *                    `startedByMoleOffice`, for the same reason as the next round. The ask on the
 *                    supervisor's run becomes `started`, in the same transaction.
 *
 * A header claim with no key reaches none, and another agent's key is not the starter's.
 * An unmarked agent keeps that filing behavior. A hand start of a marked worker is refused before create unless
 * it names a live asking run of its starter and a brief; the shared hand-start rule also checks the preflight door.
 *
 * A SESSION THAT NAMES NO AGENT THE REGISTRY KNOWS IS MINTED NOTHING. The office cannot bind a key
 * to a holder it cannot name, and a run with no key still starts and behaves as it did before.
 * An ordinary inspection run keeps the office's own key. A reading-only inspection receives its
 * own key so its verdict can prove which inspector run answered the package.
 */
function mintARunKey(record: PanelRecord, actor: Actor, handParent: string | null = null): { handle: string; key: string; keySays: string } | null {
  if (record.kind !== 'session' || record.data['state'] !== 'running') return null
  if (isAnInspectionRun(record.data)) {
    const extra = record.data['extra'] as { inspectionRun?: unknown } | undefined
    if (typeof extra?.inspectionRun !== 'string' || !inspectorAnswersRun(extra.inspectionRun, record.workspaceId)) return null
  }
  refuseANewRunWhileAStarterChangeWaits(record.data, actor)
  // THE AGENT THE RUN SERVES, read the way every reader of a run reads it: `servingAgentId`, else
  // `servingAgent` as the one agent that string names. `servingAgent` is a handle, and since
  // criterion I1 a new agent's handle is not its id.
  const serving = theAgentARunServes(record.data as Record<string, unknown>)
  const registry = serving === null ? null : readParticipant({ kind: 'agent', id: serving.id })
  const agent = registry !== null && 'startedBy' in registry ? registry : null
  const handle = agent === null ? null : agent.handle
  // WHICH OF THE FOUR CALLERS ABOVE THIS IS, each proved by its own key.
  const theNextRoundOf =
    agent !== null && actor.provedBy === 'the-office-key' && record.data['startedByMoleOffice'] !== true
      ? theNextRoundThisRunStarts(record, agent.id)
      : null
  const theWorkerRunOf =
    agent !== null && actor.provedBy === 'the-office-key' && record.data['startedByMoleOffice'] !== true && theNextRoundOf === null
      ? theWorkerRunThisRunStarts(record, agent.id, actor)
      : null
  const startersKey = theStartersKeyThatMintsThisRun(record.kind, record.data, actor)
  const mayAsk =
    agent !== null &&
    ((actor.provedBy === 'the-office-key' && (record.data['startedByMoleOffice'] === true || theNextRoundOf !== null || theWorkerRunOf !== null)) ||
      startersKey !== null)
  if (agent !== null && mayAsk && handle !== null && handle !== '') {
    // THE KEY IS BOUND TO THE AGENT'S ID AND THE HANDLE IS WHAT THE RUN IS TOLD. Criterion I5:
    // the registry row is in hand here, so the run's key is kept under the id that belongs to
    // this agent for ever, and a name freed by a later retirement inherits none of it. The
    // handle goes back in `runKey` because that is the name a person and the run itself
    // read.
    // M78: a fresh chat run carries the stored press. A resumed conversation is the office's act.
    const message = record.data['deliveringMessage']
    const freshChat = !isAnInspectionRun(record.data) && actor.provedBy === 'the-office-key' && typeof message === 'string' && !record.data['providerSession']
    const proof = freshChat ? howTheMessageStartWasProved(message) : howThisCallProvesTheKeyItMakes(actor)
    const made = makeARunKey(agent.id, proof)
    recordTheOriginalRunKeyMint(record.id, made.heldKeyId, actor, startersKey ?? undefined)
    if (theNextRoundOf !== null) sayTheNextRoundStarted(theNextRoundOf, record.id, made.heldKeyId)
    if (theWorkerRunOf !== null) sayTheWorkerRunStarted(theWorkerRunOf, agent.id, record.id, made.heldKeyId)
    if (handParent !== null) sayTheWorkerRunStarted(handParent, agent.id, record.id, made.heldKeyId)
    return { handle, key: made.key, keySays: THE_AGENT_KEY_IS_SHOWN_ONCE }
  }
  return null
}

// ---------------------------------------------------------------------------- routes

/**
 * THE ACTOR FOR A RECORD WRITE, REFUSED WHEN AN AGENT NAMES NO REGISTERED AGENT.
 *
 * The rule and its sentence live in `whyAnUnregisteredAgentMayNotWrite` in
 * lib/records/unregistered-agent.ts, one function for every writing route here. This is the
 * reading of the request, the same shape as
 * `refuseACredentialActingOnAnotherHandle` in src/server/api/handles.ts: the library owns the rule,
 * the door owns the request, and the door is the only place a header becomes an actor.
 *
 * THE REGISTRATION DOORS ARE NOT BEHIND THIS. `POST /api/agents/register-myself` and
 * `POST /api/agents/started` are in src/server/api/participants.ts and never reach these helpers,
 * and `POST /api/records` with `kind: "agent"` is the second registration door, so the one route
 * that registers rather than writes asks the refusal only for its other kinds.
 */
function refuseAnUnregisteredAgentActor(actor: Actor): void {
  const no = whyAnUnregisteredAgentMayNotWrite(actor)
  if (no !== null) throw new PanelError(no, 403)
}

/** `actorFrom`, and the refusal above. Every writing route here reads its actor through this. */
function actorForARecordWrite(req: FastifyRequest): Actor {
  const read = actorFrom(req)
  refuseAnUnregisteredAgentActor(read)
  return read
}

/** `actorWithTheWordsItActsOn`, and the same refusal. The warrant is read before the refusal, so a
 * caller that sent one hears about the name it used rather than about the warrant. */
function actorAndWordsForARecordWrite(req: FastifyRequest, fromBody: unknown, actingOn: string, options?: WhatActorFromAsks): Actor {
  const actor = actorWithTheWordsItActsOn(req, fromBody, actingOn, options)
  refuseAnUnregisteredAgentActor(actor)
  return actor
}

/**
 * WHETHER A SEND ANSWERS 409, AND ITS SHORT REASON: null when it does not. Either flag makes the 409, and the message
 * is stored and routed all the same. A person's send to a retired addressee sets the first. A person's or an agent's
 * send to a registered agent nothing holds sets the second. An agent's send to a retired agent never comes here,
 * because it is refused with 409 before anything is written. The office's own lines are not written through this door:
 * they route on retired only, and no unheld reason is built for them. The reason puts the retired addressees' reason
 * first, built once in shared/messages.ts from the names the routing loop collected with the reader the routed lines
 * use, and then the sentence the send built from the presence dot's own grey word for the agents nothing holds, joined
 * with one space. The write's answer and the check's answer both read this, so a check says the status and the reason
 * the write would answer.
 */
function theReasonOfA409Send(created: {
  routedARetiredAddressee?: boolean
  routedRetiredNames?: string[]
  routedToAnUnheldAddressee?: boolean
  routedUnheldReason?: string
}): { reason?: string } | null {
  if (created.routedARetiredAddressee !== true && created.routedToAnUnheldAddressee !== true) return null
  const reasons: string[] = []
  const retired = created.routedRetiredNames ?? []
  if (retired.length > 0) reasons.push(theRetiredAddresseesReason(retired))
  if (created.routedUnheldReason !== undefined && created.routedUnheldReason !== '') reasons.push(created.routedUnheldReason)
  return reasons.length > 0 ? { reason: reasons.join(' ') } : {}
}

export async function recordRoutes(app: FastifyInstance): Promise<void> {
  // THE PARTS OF A WRITE THAT FINISHES A RUN, said in the log once it is answered (lib/a-finish-reads-git-apart.ts).
  sayThePartsOfTheCheckDoors(app)
  /**
   * Every live record, newest change first and the records changed in the same second by id, A to Z (`THE_LISTED_ORDER`
   * in lib/records.ts), optionally narrowed to one kind.
   *
   * Each row carries `incompleteCount`, not the sentences: see the note at the top of the file.
   * The count is computed here, per row, on every request. That is a walk over the field specs
   * of each record and nothing more — no query, no join, no column — and it is the only way the
   * badge can be right about a record written before the spec it is now checked against.
   */
  app.get('/records', route('record.list', 'remote', RECORD_LIST_NOTE), async (req): Promise<RecordListReply> => {
    const workspaceId = workspaceOf(req)
    const q = parse(listQuery, req.query, 'The query string is not usable:')
    // A DIRECTION WITH NO COLUMN IS REFUSED rather than ignored: the caller asked for an order, and
    // answering in some other order while saying nothing would be a reply about a different question.
    if (q.direction !== undefined && q.sort === undefined) {
      throw new PanelError('The query string is not usable: direction needs sort, the column to order by.')
    }
    // THE WHOLE LIST IN THE HOME SHAPE IS REFUSED, before anything is read, counted or marked. It is every live record
    // of the project, and nothing in the product asks it. A read that names a kind or a limit is answered as before,
    // and so is every other shape.
    if (q.shape === 'home' && q.kind === undefined && q.limit === undefined) {
      throw new PanelError(
        'The whole list is not answered in the home shape, and nothing was read. Ask for one kind with kind=<kind>, ' +
          `or for one page at a time with limit, at most ${String(RECORD_LIST_MAX_LIMIT)}, and offset.`,
      )
    }
    // A LEVEL BESIDE A SHAPE OR A TALLY IS REFUSED, before anything is read: each says how much of a row comes back.
    if (q.level !== undefined && (q.shape !== undefined || q.tally !== undefined)) {
      throw new PanelError(
        `The query string is not usable: level and ${q.shape !== undefined ? 'shape' : 'tally'} each say how much of a row comes back, so ` +
          'they are not asked together, and nothing was read. Ask for one of them.',
      )
    }
    // EACH ROW AT A LEVEL (src/shared/results-at-a-level.ts), when a level is asked, and when one kind is listed with no
    // shape and no tally, by the person's decision of 20 November 2026. Every other list is answered as before.
    const atLevels = q.level !== undefined || (q.kind !== undefined && q.shape === undefined && q.tally === undefined)
    // ONLY THE MESSAGES THIS READER MAY READ, before anything is searched, counted or cut, so `matched`,
    // `left` and the tally count only what this reader may see.
    // AND A RUN'S HONOUR READING NAMES NONE OF THEM among its evidence.
    const reader = theMessageReader(actorFrom(req))
    // A DECISION A LATER ONE REPLACED HAS LEFT NORMAL CONTENT (problem ZSWftCSVUP2r). When decisions are asked for by
    // kind, it is left out and counted, unless `replaced=include` asks for the archive, and then it names its replacement.
    // ACROSS PROJECTS WHEN `?projects=` ASKS: the rows of the projects asked
    // for, less any message this reader may not read. Without the word, the header's project as before.
    // ONE PROJECT ASKED BY NAME IS READ AS THAT PROJECT ALONE, so its rows come in the same order as the
    // header's reading of it.
    const across = q[PROJECTS_QUERY] === undefined ? null : theProjectsAsked(q[PROJECTS_QUERY], reader)
    const replaced =
      q.kind !== 'decision'
        ? new Set<string>()
        : replacedDecisionIds(across === null ? workspaceId : across.length === 1 ? across[0]!.id : undefined)
    // A FAMILY ASKED WITH NO SEARCH AND NO TALLY IS READ AS ITS KINDS, and the other kinds are never parsed. The family
    // filter below then keeps every row, so the answer is the same. The Everything page's search and tally are over
    // every row, so they read every row (round 15: a family page's whole-project read was 142 MB on the live office).
    const kinds = q.family !== undefined && q.q === undefined && q.tally === undefined ? KIND_FAMILIES[q.family].kinds : undefined
    const which = { workspaceId: across === null ? workspaceId : across.length === 1 ? across[0]!.id : ACROSS_WORKSPACES, kind: q.kind, kinds, ids: q.ids }
    const inTheProjectsAsked = (rows: PanelRecord[]): PanelRecord[] => (across === null ? rows : theRowsTheReaderMaySee(rows, across, reader))
    // A SEARCH READS ONLY THE RECORDS THE INDEX OF THE RECORDS' TEXT SAYS COULD HOLD IT (src/server/lib/record-text-index.ts),
    // as GET /api/search does, and `searchRecords` below still looks in each of them. The index may keep too many records and
    // never too few, so the search finds what it found when it read every row. A reader's honour reading only loses words,
    // so it cannot make a record hold a search that the index left out.
    const mayHoldIt = q.q === undefined ? undefined : theRecordsThatMaySay(theNeedle(q.q))
    // BOTH NARROWINGS, WHEN BOTH ARE ASKED: the ids the caller named, less any the search says cannot hold it.
    const onlyThese = q.ids === undefined
      ? mayHoldIt
      : mayHoldIt === undefined ? q.ids : q.ids.filter((id) => mayHoldIt.includes(id))
    // HOW MUCH OF EACH ROW IS READ (wave 13y round 73). Every row used to be read whole, and on a made-up office of the
    // live shape that read was most of the time a page of fifty took.
    // - `whole`: every row whole, as before, when the answer reads every row whole. A search reads the text. A sort by
    //   `incomplete`, the light shape and `full` answer `incompleteCount`, which is worked out from the whole `data`,
    //   and with no `limit` every row is answered.
    // - `cut`: every row with its `data` cut in SQLite to what `home`, `session` or `narrow` answers. Those shapes answer
    //   no `incompleteCount` and no `replacedBy`, so neither is worked out.
    // - `placed`: every row without its `data`, to be left out, counted, grouped, sorted and cut into the page. Only the
    //   rows answered are then read again, whole.
    // A sort by state also reads the state word, which is what `sortCatalogue` orders by (`stateWord` in
    // src/shared/catalogue.ts). Every order is still worked out by `sortCatalogue`, because SQLite does not order words
    // as `Intl.Collator` does.
    // NO SHAPE IS THE NARROW ROW: the effective shape is the one every cut below reads.
    const theShape = q.shape ?? 'narrow'
    const cutShape = theShape === 'light' || theShape === 'full' ? undefined : theShape
    // - Rows at levels are `placed` unless a search or that sort reads them whole, with the state word and the stored
    //   short forms, which is all a title, a label and a missing label's reason read. The rows are read whole fifty at a
    //   time only until the answer's cap is reached.
    const reading =
      q.q !== undefined || q.sort === 'incomplete' ? 'whole' : atLevels ? 'placed' : cutShape !== undefined ? 'cut' : q.limit === undefined ? 'whole' : 'placed'
    const theStateWord = q.sort === 'state' ? ['state'] : []
    const listed = inTheProjectsAsked(
      reading === 'whole'
        ? listRecords({ ...which, ids: onlyThese })
        : listRecordsWithDataAs(
            { ...which, ids: onlyThese },
            atLevels
              ? onlyTheseFieldsOf(['state', SHORT_FORMS_FIELD])
              : cutShape !== undefined ? theDataAShapeAnswers(cutShape, theStateWord) : theStateWord.length > 0 ? onlyTheseFieldsOf(theStateWord) : sql<string>`'{}'`,
          ),
    )
    const keptByReplacement = q.kind === 'decision' && q.replaced !== 'include' ? listed.filter((record) => !replaced.has(record.id)) : listed
    // HOW MANY REPLACED DECISIONS WERE LEFT OUT, of every decision listed, whether it holds the search or not. A search the
    // index narrowed read only the records that could hold it, so the decisions are counted apart, read without their
    // data, as GET /api/search counts what it searched: which records are listed never depends on their data.
    const replacedLeftOut =
      mayHoldIt !== undefined && q.kind === 'decision' && q.replaced !== 'include'
        ? inTheProjectsAsked(listRecordsWithDataAs(which, sql<string>`'{}'`)).filter((record) => replaced.has(record.id)).length
        : listed.length - keptByReplacement.length
    // WHAT A LISTED ROW IS, WORKED OUT ONCE for the rows and for the far ends. Which decisions replaced which is read
    // once, at the first replaced decision listed, and not once for each.
    let replacements: TheReplacements | undefined
    const asListed = (rows: PanelRecord[]): RecordListItem[] =>
      theRowsThisReaderIsListed(reader, rows).map((record) => ({
        ...record,
        incompleteCount: incompletenessOf(record).length,
        ...(q.kind === 'decision' && replaced.has(record.id)
          ? { replacedBy: whatSupersedes(record.id, (replacements ??= readTheReplacements())) }
          : {}),
      }))
    // A ROW READ CUT, OR ONLY TO BE PLACED, IS LEFT OUT FOR THIS READER BY THE SAME FUNCTION, and carries no count.
    const everyRow =
      reading === 'whole' ? asListed(keptByReplacement) : withNoIncompleteCount(theRowsThisReaderIsListed(reader, keptByReplacement))
    // THE ROWS ANSWERED, read again whole when they were read only to be placed: by id, through the same project reading,
    // so the page holds the rows it was cut from, in the order it was cut in.
    const answered = (rows: RecordListItem[]): RecordListItem[] => {
      if (reading !== 'placed' || rows.length === 0) return rows
      const again = new Map(asListed(listRecords({ ...which, ids: rows.map((row) => row.id) })).map((row) => [row.id, row]))
      return rows.map((row) => {
        const one = again.get(row.id)
        if (one === undefined) throw new PanelError(`The record ${row.id} was on this page and was gone when the page was read again. Ask again.`, 409)
        return one
      })
    }
    // THE SEARCH, THE GROUP AND THE ORDER, over every row and before the page is
    // cut. The search is `searchRecords`, the rule `GET /api/search` reads, so the two
    // doors cannot disagree about which records say a word.
    const searched = q.q === undefined ? everyRow : searchRecords(everyRow, q.q).map((hit) => hit.record)
    // ONE ROW'S SHAPE, so the page below is folded and shaped in one pass rather than copied in two.
    const shapeOf: (row: RecordListItem) => RecordListItem =
      theShape === 'light'
        ? lightRecord
        : theShape === 'home'
          ? homeRecord
          : theShape === 'session'
            ? sessionRecord
            : theShape === 'narrow'
              ? narrowRecord
              : theShape === 'hook'
                ? hookRecord
                : (row: RecordListItem) => row
    const shaped = (rows: RecordListItem[]): RecordListItem[] => (theShape === 'full' ? rows : rows.map(shapeOf))
    const tally: RecordListTally | undefined =
      q.tally === undefined
        ? undefined
        : {
            everything: searched.length,
            families: Object.fromEntries(
              (Object.keys(KIND_FAMILIES) as KindFamily[]).map((family) => [
                family,
                searched.filter((record) => familyOf(record.kind) === family).length,
              ]),
            ) as Record<KindFamily, number>,
            unfiled: shaped(answered(searched.filter((record) => noHeadingHolds(record.kind)))),
          }
    const grouped = q.family === undefined ? searched : searched.filter((record) => familyOf(record.kind) === q.family)
    const rows =
      q.sort === undefined ? grouped : sortCatalogue(grouped, q.sort, q.direction ?? COLUMN_SORT[q.sort].opens)
    // THE PAGE, AND WHAT THE PAGE LEFT BEHIND. `left` is computed from the whole matching list,
    // never from the page, so a caller counting a page is counting a number this route did not
    // invent. With no `limit` the whole list is the page and `left` is 0, which is a real answer.
    const offset = q.offset ?? 0
    // A PAGE THAT KEEPS EVERY ROW IS THE LIST ITSELF, not a second array beside it.
    const page = q.limit === undefined ? (offset === 0 ? rows : rows.slice(offset)) : rows.slice(offset, offset + q.limit)
    const matched = rows.length
    const returned = page.length
    const left = Math.max(0, matched - offset - returned)
    // THE SECOND LEVEL ONLY WHEN ASKED, said once for the whole page. Each row is folded and shaped in the same pass, and
    // a row the fold hands back unchanged is shaped as it is, so no copy of the whole page is kept beside it.
    let anyHeld = false
    let shapedPage: RecordListItem[] = []
    let levels: TheLevelsOfAnAnswer | undefined
    if (atLevels) {
      // EACH ROW AT ITS LEVEL, by the rule `GET /api/search` answers its results by. A row is read whole and folded only
      // when the rule asks for it, and the second level is said only when a row given whole held some of it.
      const held = new Set<string>()
      const atTheirLevels = resultsAtTheirLevels<RecordListItem>(page, q.level === undefined ? null : levelNamed(q.level), theLevelSettings(), (some) =>
        answered([...some]).map((row): RecordListItem => {
          const one = foldTheSecondLevel(row, q.secondLevel === 'show', 'GET /api/records/<id>')
          if (one.secondLevel !== null) held.add(row.id)
          return one.record === row ? row : { ...row, ...one.record }
        }),
      )
      // A ROW BELOW FULL IS NOT A WHOLE RecordListItem, as a narrow row is not: `atLevel` says what it holds.
      shapedPage = atTheirLevels.rows as unknown as RecordListItem[]
      anyHeld = atTheirLevels.rows.some((row) => row.atLevel.given === 'full' && held.has(row.id))
      levels = atTheirLevels.levels
    } else {
      for (const row of answered(page)) {
        const one = foldTheSecondLevel(row, q.secondLevel === 'show', 'GET /api/records/<id>')
        if (one.secondLevel !== null) anyHeld = true
        shapedPage.push(shapeOf(one.record === row ? row : { ...row, ...one.record }))
      }
    }
    // THE FAR ENDS, read by id through the same project reading as the rows, so a record this list could not hold
    // cannot come back as a far end either.
    const farIds = q.farEnds === undefined ? [] : theOtherEndsOf(page.map((row) => row.id))
    const farEnds =
      q.farEnds === undefined
        ? undefined
        : asListed(
            across === null
              ? listRecords({ workspaceId, ids: farIds })
              : theRowsTheReaderMaySee(
                  listRecords({ workspaceId: across.length === 1 ? across[0]!.id : ACROSS_WORKSPACES, ids: farIds }),
                  across,
                  reader,
                ),
          ).map(lightRecord)
    return {
      records: shapedPage,
      ...(anyHeld
        ? {
            secondLevel: {
              held: ["each flow's data.stages[].why, data.stages[].sources and data.step_changes, and each decision's data.basis"],
              ask: `the same request with ${SECOND_LEVEL_PARAM}=show, or GET /api/records/<id>?${SECOND_LEVEL_PARAM}=show for one record`,
            },
          }
        : {}),
      matched,
      returned,
      left,
      truncated: left > 0,
      next: left > 0 ? nextRecordsPage(q, offset + returned) : null,
      ...(tally === undefined ? {} : { tally }),
      ...(q.kind === 'decision' ? { replacedLeftOut } : {}),
      ...(across === null ? {} : { projects: across.map((project) => project.id) }),
      ...(farEnds === undefined ? {} : { farEnds }),
      ...(levels === undefined ? {} : { levels }),
    }
  })

  /**
   * WHAT THE SETTINGS PAGE'S DETAIL GRID DRAWS, counted here over the rows `GET /api/records` lists
   * for this reader. The counting is `detailSupplyOf` in src/shared/detailsupply.ts, which the page's
   * own tests call on a list of records, so the grid counts the same way whichever side does it.
   *
   * IT READS OF EACH RECORD ONLY WHAT A DETAIL SOURCE READS: the title, the summary, and the fields of
   * `data` named in `THE_DATA_FIELDS_A_DETAIL_SOURCE_READS`. On a made-up office of the live counts
   * (wave 13y round 24) that is about 21 MB of `data`, nearly all of it report bodies, where reading
   * every record whole took about 120 MB; the answer was the same to the byte, in about 1.0 s rather
   * than 1.4 s. Only the records the grid previews are read whole afterwards, with their second level
   * folded as `GET /api/records` folds it. The fold leaves out a flow's reasons and a decision's basis,
   * which no detail source reads, so counting before the fold counts the same.
   */
  app.get('/records/detail-supply', route('record.detail-supply', 'remote', DETAIL_SUPPLY_NOTE), async (req): Promise<DetailSupply> => {
    const reader = theMessageReader(actorFrom(req))
    const workspaceId = workspaceOf(req)
    const answer = detailSupplyOf(
      theRowsThisReaderIsListed(reader, listRecordsWithDataAs({ workspaceId }, onlyTheseFieldsOf(THE_DATA_FIELDS_A_DETAIL_SOURCE_READS))),
    )
    const previewed = [...new Set(Object.values(answer.samples).flatMap((sample) => (sample === null ? [] : [sample.id])))]
    const whole = new Map(
      theRowsThisReaderIsListed(reader, listRecords({ workspaceId, ids: previewed })).map((record) => [
        record.id,
        foldTheSecondLevel(record, false, 'GET /api/records/<id>').record,
      ]),
    )
    const samples = Object.fromEntries(
      Object.entries(answer.samples).map(([row, sample]) => {
        if (sample === null) return [row, null]
        const found = whole.get(sample.id)
        if (found === undefined) throw new Error(`The record ${sample.id} the detail grid previews was counted, and was not there when it was read whole.`)
        return [row, found]
      }),
    ) as DetailSupply['samples']
    return { ...answer, samples }
  })

  /**
   * THE CONVERSATIONS PAGE'S LIST OF WORK, worked out here over the rows `GET /api/records` lists for
   * this reader with `workToTalkAbout` in src/shared/talksources.ts, so the page asks for the five rows
   * it draws and the counts under them, and not every record of the project.
   */
  app.get(
    '/records/work-to-talk-about',
    route('record.work-to-talk-about', 'remote', WORK_TO_TALK_ABOUT_NOTE),
    async (req): Promise<WorkToTalkAbout<PanelRecord>> => {
      const { q } = parse(workToTalkAboutQuery, req.query, 'The query string is not usable:')
      const reader = theMessageReader(actorFrom(req))
      const answer = theWorkToTalkAboutIn(workspaceOf(req), reader, q ?? '', (rows) => theRowsThisReaderIsListed(reader, rows))
      return { ...answer, rows: answer.rows.map(narrowRecord) }
    },
  )

  /**
   * THE REPORTS PAGE'S LIST: reports and notes, in every project, grouped and paged.
   *
   * IT TAKES NO PROJECT. The page is under All projects in the sidebar, so it reads every project
   * (ACROSS_WORKSPACES) and each row carries the project it is in. Only two kinds are read, the ones
   * src/shared/reports-page.ts names. Neither is a message, so the message read rule has nothing to
   * take out here.
   */
  app.get(
    '/records/reports-and-notes',
    route('record.reports-and-notes', 'remote', REPORTS_AND_NOTES_NOTE),
    async (req): Promise<ReportsAndNotesReply> => {
      const q = parse(reportsAndNotesQuery, req.query, 'The query string is not usable:')
      const show = q.show ?? 'both'
      const limit = q.limit ?? REPORTS_PAGE_SIZE
      const offset = q.offset ?? 0
      const now = Date.now()
      const subject = q.scope === undefined ? null : getRecord(q.scope)
      if (q.scope !== undefined && (subject === null || subject.deletedAt !== null)) throw new PanelError('No live record has that id.', 404)
      if (subject !== null && subject.kind !== 'module' && subject.kind !== 'pipeline') {
        throw new PanelError('The scope must name a module or pipeline.', 400)
      }
      let linked: Set<string> | null = null
      if (subject !== null) {
        // THE ONE WALK (src/server/lib/related.ts): the record, a pipeline's blocks and their modules, the sub-modules
        // at every depth and the runs, so this list and the module's page agree on which reports are its.
        const subjects = new Set(theSubjectsOf(subject).map((one) => one.id))
        const reports = sqlite.prepare(`SELECT DISTINCT l.from_id AS id FROM links l
          WHERE l.type = 'about' AND l.to_id IN (SELECT value FROM json_each(?))`).all(JSON.stringify([...subjects])) as { id: string }[]
        linked = new Set(reports.map((row) => row.id))
      }
      const kinds = {} as Record<ReportsPageKind, number>
      const kept: ReportsAndNotesRow[] = []
      const stars = q.filter === 'starred' ? new Set(reportStars(actorFrom(req).id)) : null
      for (const kind of REPORTS_PAGE_KINDS) {
        const rows = listRecords({ workspaceId: ACROSS_WORKSPACES, kind }).filter((record) => linked === null || (kind === 'report' && linked.has(record.id)))
        kinds[kind] = rows.length
        if (!KINDS_A_CHOICE_SHOWS[show].includes(kind)) continue
        for (const record of rows) {
          if (q.filter === 'unread' && (record.kind !== 'report' || !reportReading(record, []).waiting)) continue
          if (q.filter === 'starred' && (record.kind !== 'report' || !stars?.has(record.id))) continue
          kept.push({
            ...lightRecord({ ...record, incompleteCount: incompletenessOf(record).length }),
            group: reportsPageGroup(record, now),
            read: record.kind === 'report' ? reportReading(record, []).read : null,
          })
        }
      }
      const groups = Object.fromEntries(
        REPORTS_PAGE_GROUPS.map((group) => [group, kept.filter((row) => row.group === group).length]),
      ) as Record<ReportsPageGroup, number>
      const rank = (group: ReportsPageGroup) => REPORTS_PAGE_GROUPS.indexOf(group)
      kept.sort((a, b) =>
        subject === null && rank(a.group) !== rank(b.group)
          ? rank(a.group) - rank(b.group)
          : a.createdAt !== b.createdAt
            ? a.createdAt < b.createdAt
              ? 1
              : -1
            : a.id < b.id
              ? -1
              : 1,
      )
      const page = kept.slice(offset, offset + limit)
      return {
        rows: page,
        modules: sqlite.prepare(`SELECT DISTINCT m.id, m.title FROM (
          SELECT a.to_id AS id FROM records r INDEXED BY records_kind_idx
          CROSS JOIN links a INDEXED BY links_from_idx ON a.from_id = r.id AND a.type = 'about'
          WHERE r.kind = 'report' AND r.deleted_at IS NULL
          UNION
          SELECT p.to_id AS id FROM records r INDEXED BY records_kind_idx
          CROSS JOIN links a INDEXED BY links_from_idx ON a.from_id = r.id AND a.type = 'about'
          CROSS JOIN links p INDEXED BY links_from_idx ON p.from_id = a.to_id AND p.type = 'part_of'
          WHERE r.kind = 'report' AND r.deleted_at IS NULL
        ) ids
          CROSS JOIN records m ON m.id = ids.id
          WHERE m.kind = 'module' AND m.deleted_at IS NULL
          ORDER BY m.title COLLATE NOCASE, m.id`).all() as { id: string; title: string }[],
        ...(subject === null ? {} : { scope: { id: subject.id, title: subject.title, kind: subject.kind as 'module' | 'pipeline' } }),
        show,
        groups,
        kinds,
        matched: kept.length,
        returned: page.length,
        offset,
        limit,
        left: Math.max(0, kept.length - offset - page.length),
      }
    },
  )

  /** Read the caller's report stars. */
  app.get('/records/report-stars', route('record.report-stars', 'remote', 'Read the report stars kept for the caller.'), async req => ({ stars: reportStars(actorFrom(req).id) }))
  /** Keep or remove one report star. */
  app.put('/records/report-stars/:id', route('record.set-report-star', 'remote', 'Keep or remove a report star for the person asking.'), async req => {
    const actor = actorFrom(req)
    if (actor.type !== 'human' || !thePersonIsProved(actor)) throw new PanelError('Only a person can change their own report stars.', 403)
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params, 'The report id is not usable:')
    const { starred } = parse(z.strictObject({ starred: z.boolean() }), req.body, 'The star is not usable:')
    const record = getRecord(id)
    if (record === null || record.deletedAt !== null || record.kind !== 'report') throw new PanelError('No live report has that id.', 404)
    return { stars: setReportStar(actor, workspaceOf(req), id, starred) }
  })

  /**
   * MY NOTES: the quick notes, in every project, searched, counted and paged by src/server/lib/my-notes.ts.
   *
   * IT TAKES NO PROJECT, as the Reports page takes none. The notes are read from every project this reader may read,
   * by the rule `GET /api/records?projects=all` reads them with, and each note carries the project it is in. A note is
   * not a message, so the message read rule has nothing to take out, and it is still asked, as the records door asks.
   */
  app.get(
    '/records/my-notes',
    route('record.my-notes', 'remote', MY_NOTES_NOTE),
    async (req): Promise<MyNotesReply> => {
      const asked = parse(myNotesQuery, req.query, 'The query string is not usable:')
      const reader = theMessageReader(actorFrom(req))
      const projects = theProjectsAsked(EVERY_PROJECT, reader)
      return myNotes(asked, (ids) =>
        theRowsThisReaderIsListed(
          reader,
          theRowsTheReaderMaySee(listRecords({ workspaceId: ACROSS_WORKSPACES, kind: QUICK_NOTE_KIND, ids }), projects, reader),
        ),
      )
    },
  )

  /**
   * THE NOTE ADD TO NOTE GOES INTO: the one the reader last wrote in, among the notes My notes lists for them, read by
   * src/server/lib/my-notes.ts in one read of the change log. The notes are listed by the same rule as the door above.
   */
  app.get(
    '/records/my-notes/last-written-in',
    route('record.my-notes-last-written-in', 'remote', LAST_WRITTEN_IN_NOTE),
    async (req): Promise<NoteLastWrittenIn> => {
      const actor = actorFrom(req)
      const reader = theMessageReader(actor)
      const projects = theProjectsAsked(EVERY_PROJECT, reader)
      return theNoteLastWrittenIn(
        actor,
        theRowsThisReaderIsListed(
          reader,
          theRowsTheReaderMaySee(listRecords({ workspaceId: ACROSS_WORKSPACES, kind: QUICK_NOTE_KIND }), projects, reader),
        ),
      )
    },
  )

  /**
   * WHAT THIS PROJECT FILED BETWEEN TWO MOMENTS. Acceptance finding 44, 23 September 2026.
   *
   * A check's model runs the tree's browser tests, and the app those tests start writes its own
   * session records into whichever office it is pointed at. The tool that starts the model takes the
   * time just before and just after it runs and asks this door what appeared, so the count can be
   * written on the verdict instead of nobody knowing it happened. It is a read with no body and
   * nothing stored.
   */
  app.get(
    '/records/created-between',
    route('record.created-between', 'remote', CREATED_BETWEEN_NOTE),
    async (req): Promise<CreatedBetween> => {
      const workspaceId = workspaceOf(req)
      const q = parse(createdBetweenQuery, req.query, 'That is not a window this door can read:')
      const from = parseLocalStamp(q.from)
      if (from === null) {
        throw new PanelError(
          `from is not a moment Mole Office can read: "${q.from}". Write it as YYYY-MM-DD HH:MM:SS in local ` +
            'wall clock, or as a bare date. Nothing was read.',
          400,
        )
      }
      const to = parseLocalStamp(q.to)
      if (to === null) {
        throw new PanelError(
          `to is not a moment Mole Office can read: "${q.to}". Write it as YYYY-MM-DD HH:MM:SS in local ` +
            'wall clock, or as a bare date. Nothing was read.',
          400,
        )
      }
      if (from > to) {
        throw new PanelError(
          `The window ends before it begins: from is ${q.from} and to is ${q.to}. Nothing was read.`,
          400,
        )
      }
      // INTO THE OFFICE'S OWN STAMP FIRST, so a value with a `T` or without seconds compares on the
      // same clock as records.created_at rather than as a string that happens to look like a date.
      return recordsCreatedBetween({
        workspaceId,
        reader: theMessageReader(actorFrom(req)),
        from: localStamp(new Date(from)),
        to: localStamp(new Date(to)),
      })
    },
  )

  /**
   * Create a record.
   *
   * A record with fields still to come is stored, not refused, and the 201 says which fields
   * those are. A record with something WRONG in it — a key nothing reads, a value of the wrong
   * type — is refused with a 400 and nothing is written. The two are different failures and the
   * answers are different on purpose; see lib/validate.ts.
   *
   * Filing a `session` under a run name also BINDS that name, or says why it could not — see
   * `sessionBinding` on RecordReply. The whole result is passed through here rather than picked
   * apart into `record` and `incomplete`: that destructuring is what dropped the binding report on
   * the floor, and a write this endpoint made that the caller never hears about is the silence the
   * endpoint exists against.
   *
   * ---------------------------------------------------------------------------------------
   * `links` — THE RECORD AND ITS RELATIONSHIPS IN ONE REQUEST, ALL OR NOTHING
   * ---------------------------------------------------------------------------------------
   *
   * Every relationship used to be a second request. Seven agents recorded this project's own
   * development through this API and one of them made roughly forty requests to file eleven
   * records; the links are not decoration, because a claim nothing consumes and work waiting on a
   * result that does not exist are the two queries the typed-link system exists for.
   *
   * The record being created is one end of each link and is never named — it has no id yet — so an
   * entry names the OTHER end, and which key it uses is the direction:
   *
   *   {"type":"about","toTitle":"close-up camera"}   this record is `about` that one.
   *   {"type":"blocks","fromId":"rec_…"}          that record `blocks` this one.
   *
   * ONE UNUSABLE ENTRY REFUSES THE WHOLE REQUEST, names which entry and why, and leaves nothing
   * behind: no record, no links, no change rows. The alternative — store the record, report each
   * link's outcome — was ruled out on purpose: a 201 for work that did not happen is the failure
   * this server is written against, and the caller would be left checking a record it was told had
   * been filed. The 201 carries `links`, with both ends resolved to real ids and titles, so a name
   * that was typed can be checked without a second request.
   *
   * POST /api/links has not moved and is still the way to relate two records that already exist.
   */
  /**
   * FILE A RECORD, OR ONLY ASK WHETHER IT WOULD BE FILED. One function for both doors, so the check
   * runs every line the write runs and cannot drift from it (problem jQayki_gIciU, lib/only-a-check.ts).
   */
  /**
   * NOTHING A CHECK'S INSPECTOR WRITES THROUGH THIS DOOR LANDS AFTER THE CHECK WAS STOPPED (since 21 Oct 2026): the
   * messages that would pass a refused verdict on are written here, with the inspector's own agent key, which a stop does
   * not revoke. So a write by an agent that holds the checking card, whose session header names a session that has stopped
   * (theStopOfThisSession), writes nothing. A write that names no session is taken as before: several of the inspector's
   * writes name none on purpose (its notes on a problem, the check's own session filed before there is one). Every other
   * agent's writes are as they were: a worker's note after its own run has finished is ordinary.
   */
  const refuseAStoppedChecksInspector = (req: FastifyRequest, workspaceId: string): void => {
    const role = theRoleOfTheCaller(req)?.role
    // NO CARDS READ, NO CHECKING CARD: a world that never read the role cards (an app a test builds) holds no inspector, and
    // theRoleCards() throws there; every other reader of the cards at request time asks theRoleCardsAreRead() first.
    if (role === undefined || !theRoleCardsAreRead() || role !== theCardOffTheTree(theRoleCards())?.name) return
    const stopped = theStopOfThisSession(actorFrom(req, { whoOnly: true }).sessionId, workspaceId)
    if (stopped !== null) {
      throw new PanelError(`Session ${stopped.session.id} (${stopped.session.title}) cannot write through the record door: ${stopped.said} Nothing was written.`, 409)
    }
  }

  const fileARecord = async (req: FastifyRequest, reply: FastifyReply, only: 'write' | 'check'): Promise<RecordReply | WouldBeAccepted> => {
    const workspaceId = workspaceOf(req)
    const body = parse(createBody, req.body, 'The request body is not usable:')
    refuseAStoppedChecksInspector(req, workspaceId)
    // ONLY THE OFFICE WRITES needsNoCheck, from every caller of this door. The office writes it in
    // process, in `submitASecretarysDesignEntry`, and never through here; a run carrying it says the
    // office filed it for a secretary's design/-only entry, which would be false of any other run.
    if (body.data !== undefined && Object.hasOwn(body.data, NEEDS_NO_CHECK)) throw new PanelError(ONLY_THE_OFFICE_WRITES_NEEDS_NO_CHECK, 403)
    // ONLY THE OFFICE WRITES endedWithItsMergeEntry, for the same reason. The office writes it in process, in
    // `testOrBounce`, with the refused bounce of the entry; a run carrying it says the office ended it with that entry.
    if (body.data !== undefined && Object.hasOwn(body.data, ENDED_WITH_ITS_MERGE_ENTRY)) throw new PanelError(ONLY_THE_OFFICE_WRITES_ENDED_WITH_ITS_MERGE_ENTRY, 403)
    // ONLY THE OFFICE WRITES remindedBeforeTheSeal, when the reminder before the seal fires and at the seal.
    if (body.data !== undefined && Object.hasOwn(body.data, REMINDED_BEFORE_THE_SEAL)) throw new PanelError(ONLY_THE_OFFICE_WRITES_REMINDED_BEFORE_THE_SEAL, 403)
    // THE STARTER'S ITEMS FOR THE REMINDER BEFORE THE SEAL may come with the run as it is filed: a list of sentences,
    // stored with who gave them and when (lib/check-also.ts). The run does not exist yet, so its own key cannot be sending it.
    if (body.data !== undefined && Object.hasOwn(body.data, CHECK_ALSO)) {
      // Who gave them, and only that: the run the session header names is asked with the write's actor below.
      const stored = theCheckAlsoToStore(body.kind, body.data[CHECK_ALSO], actorFrom(req, { whoOnly: true }))
      body.data = { ...body.data, [CHECK_ALSO]: stored }
      if (stored.items.length === 0) delete body.data[CHECK_ALSO]
    }
    // THE WARRANT IS ABOUT THE REQUEST AND NOT ABOUT THE RECORD, so it comes off the body here and
    // rides on the actor, exactly as it does on a PATCH — see the field's own comment on
    // `createBody`. There is no id yet, so `actingOn` is the title the caller is about to file.
    const actor = actorWithTheWordsItActsOn(req, body.warrant, body.title, body.kind === 'problem' && body.data?.['mainSuiteFix'] !== undefined ? { proveOwnRun: true } : undefined)
    // A REGISTRATION IS HOW AN ID BECOMES REGISTERED, so this route does not ask the refusal when it
    // is filing an agent. This is the second registration door (the note on `whatToGiveIt` below says
    // so), and a caller that had to be registered before it could register could never arrive. Every
    // other kind here is an ordinary record write, and the refusal is what stops a placeholder at its
    // first write. See `refuseAnUnregisteredAgentActor` above.
    if (body.kind !== 'agent') refuseAnUnregisteredAgentActor(actor)
    // REGISTERING AN AGENT FROM ANOTHER MACHINE NEEDS A CREDENTIAL THE PERSON HAS CONFIRMED. Criterion P69.
    // This door is the one the worker on the owner's other machine came through on 7 September 2026 — its record
    // carries no `startedBy`, which POST /api/agents/started always writes — so a check on that
    // route alone would have left this one open. `registrationgate.ts` is the one reading, asked in
    // both places.
    const from =
      body.kind === 'agent'
        ? whereThisRegistrationCameFrom(req, (body.data as { runtime?: unknown } | undefined)?.runtime)
        : null
    if (from !== null && from.refusal !== null) throw new PanelError(from.refusal, 403)
    // AND THE CREDENTIAL IT CAME IN ON GOES ON THE RECORD, measured here and never taken from the
    // body: a caller that could name its own credential could name one the owner confirmed for
    // somebody else. A field the caller sent is replaced, and one it did not send stays absent.
    const data = withTheCredentialMeasuredHere(body.data, from)
    // WHETHER A LIVE AGENT ALREADY BEARS THE HANDLE, asked before the write. Such a write joins that
    // agent's row and makes no new agent, so it is answered no key below: the caller proves only that
    // it is somebody, not that it started that agent. Keys wave, round 5 (the same rule as
    // POST /api/agents/started). A retired handle is free, and a new agent registered under it is a
    // new agent that gets its own key.
    const askedHandle = body.kind === 'agent' ? (body.data as { handle?: unknown } | undefined)?.handle : undefined
    const namedALiveAgent =
      typeof askedHandle === 'string' && askedHandle.trim() !== ''
        ? (() => {
            const named = theAgentAnArrivingReferenceNames(askedHandle, 'reading')
            return named !== null && (named.how === 'an-id' || named.how === 'a-live-handle')
          })()
        : false
    // THE CREATE AND A RUN'S KEY ARE ONE TRANSACTION. See `mintARunKey` above: a running session the
    // office starts or its starter validly asks for by hand is minted a key and carries its row id, and either the
    // record, its runKeyId and the key are all stored or none of them is.
    // A NEW RUN'S TERRITORY IS COMPARED ON CHANGED PATHS, which Git reads here, before the transaction (lib/claims.ts).
    const changedPaths = body.kind === 'session' && data !== undefined && Object.hasOwn(data, 'territory')
      ? await theChangedPathsBeforeATerritoryWrite({ workspaceId, data }) : new Map()
    // A territory refusal at block is counted after this transaction is taken back; see countingATerritoryRefusal.
    // A RUN FILED ALREADY FINISHED IS SEALED IN THIS WRITE, so its git is read on the seal-read thread and the write runs
    // in passes (lib/a-finish-reads-git-apart.ts). Every other filing runs once, as it always did.
    const filedFinished = body.kind === 'session' && data !== undefined && aRunSaysItIsFinished(data)
    if (filedFinished) timeTheFinishOf(req, `POST /api/records${only === 'check' ? '/check' : ''}`)
    // A RUN'S FILING COMMIT IS READ BY THE OFFICE, by a git process apart from this thread, before the write. A run
    // filed already finished reads one too, so its seal counts only the commits it made since it was filed, which are
    // none: every commit in its working directory was there when it was filed. A check stores nothing, so it reads
    // none. Data that names either field is refused by the create, so nothing is read for it.
    const filingDirectory = body.kind === 'session' && data !== undefined && only !== 'check' ? data['workingDirectory'] : undefined
    const filingHead = typeof filingDirectory === 'string' && filingDirectory !== '' && !Object.hasOwn(data ?? {}, FILING_HEAD) && !Object.hasOwn(data ?? {}, END_HEAD)
      ? await theHeadReadApart(filingDirectory) : null
    const file = (inside: InOnePass) => inside(() => countingATerritoryRefusal(only, () => writeOrCheck(only, () => {
      const serving = body.kind === 'session' && data?.['state'] === 'running' ? theAgentARunServes(data) : null
      const hand = theHandStartAskedFor({
        agent: serving?.id ?? null, askedBy: body.askedBy, brief: body.brief, cutFrom: body.cutFrom,
        workspaceId, actor, filing: true, worktree: typeof data?.['workingDirectory'] === 'string' ? data['workingDirectory'] : undefined,
      })
      if (hand !== null) keepTheHandStart(hand)
      const filedData = hand === null ? data : { ...data, parentAttachment: hand.run }
      // THE STARTER'S KEY GOES ON THE CREATE ONLY WHERE THE MINT BELOW WILL STORE IT TOO. See the function.
      const startersKey = theStartersKeyThatMintsThisRun(body.kind, filedData, actor)
      const created = createRecordWithReport({
        checkTerritoryBeforeWrite: refuseATerritoryOverlapAtBlock(changedPaths),
        workspaceId,
        kind: body.kind,
        title: body.title,
        summary: body.summary ?? null,
        data: filedData,
        actor,
        // WHERE THIS WRITE CAME FROM. Read here, at the door, because it is a fact about the request
        // and this is the only place holding one. Criterion M63; lib/machines.ts does the measuring.
        writtenFrom: writtenFrom(req),
        // AND WHERE A MESSAGE WAS WRITTEN, AS THE REQUEST NAMED IT: the project only when the request
        // named one, so the default the header reader falls back to is never stored as a mark, and the page when it named one.
        writtenIn: { project: namedAProject(req) ? workspaceId : null, page: pageFrom(req) },
        ...(body.links === undefined ? {} : { links: body.links }),
        // WHO READS THE ANSWER: the lists of records already called this, and the
        // links, name no message this caller may not read.
        reader: theMessageReader(actorFrom(req)),
        // A DECISION SAYS WHAT IT REPLACES, at this door as at every door a decision is made through. Problem
        // ZSWftCSVUP2r; lib/replaced-decisions.ts.
        mustSayWhatItReplaces: true,
        // AND WHAT IT GOVERNS, at every decision door as well (lib/what-a-record-names.ts).
        mustSayWhatItGoverns: true,
        door: 'POST /api/records',
        ...(startersKey === null ? {} : { startersKey }),
        ...(filingHead === null ? {} : { filingHead }),
      })
      // The original key binding must be revision 2: mint immediately after create,
      // before any other write to the fresh session.
      const runKey = mintARunKey(created.record, actor, hand?.run ?? null)
      if (body.shortForms !== undefined && created.alreadySent === undefined) {
        const newest = listRevisions(created.record.id, 1).revisions[0]
        if (newest === undefined) throw new Error('The newly filed record has no revision.')
        writeShortForms(created.record.id, workspaceId, {
          ...body.shortForms,
          madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
        }, actor)
        created.record = recordInWorkspace(created.record.id, workspaceId)
      }
      return { created, runKey }
    })))
    const { created, runKey } = filedFinished ? await aFinishReadsItsGitApart(req, file) : file((act) => act())
    // A CHECK ENDS HERE, with nothing stored: no record, no key, no message. What follows only answers a write.
    if (only === 'check') {
      // THE CHECK READS THE SAME CONDITION AND THE SAME REASON THE WRITE DOES, from `theReasonOfA409Send`: a person's
      // send to a retired agent, or a person's or an agent's send to a registered agent nothing holds, would answer 409,
      // and the check says why.
      const refused = theReasonOfA409Send(created)
      return wouldBeAccepted(
        reply,
        'POST /api/records',
        refused !== null ? 409 : created.alreadySent !== undefined ? 200 : 201,
        { incomplete: created.incomplete, ...(refused?.reason === undefined ? {} : { reason: refused.reason }) },
      )
    }
    // A SEND THE WRITER ALREADY MADE WROTE NOTHING, by point 1 of
    // a decision, so it answers 200 with the first
    // message and the sentence saying so, and none of what follows a new record.
    if (created.alreadySent !== undefined) {
      reply.status(200)
      return { ...recordReply(created.record, theMessageReader(actorFrom(req)), []), alreadySent: created.alreadySent }
    }
    reply.status(201)
    const answer = recordReply(
      created.record,
      theMessageReader(actorFrom(req)),
      created.incomplete,
      created.sessionBinding,
      created.similar,
      created.links,
      created.linksNote,
      created.sameTitle,
    )
    if (created.record.kind === 'session' && Object.hasOwn(created.record.data, 'territory')) {
      answer.territoryOverlaps = openTheGroupsForATerritory(created.record, actor, changedPaths)
    }
    // AND WHAT MOLE OFFICE FILLED IN THAT THE CALLER DID NOT SEND, on the write that filled it in and
    // nowhere else. Writing a field for somebody has to be visible in the answer to their own
    // request; absent means nothing was filled in, which is nearly every write.
    if (created.moleOfficeWrote !== undefined) answer.moleOfficeWrote = created.moleOfficeWrote
    // AND WHY THE SEAL OF A RECORDS RUN DID NOT CHECK FOR COMMITS PAST ITS CUT, said here and stored nowhere (lib/sealed-tip.ts).
    Object.assign(answer, theCommitsNotCheckedFor(req))
    // AND THE RUN'S FLOW RUN, or the sentence saying it was not written and the problem filed about it. The run
    // is filed either way (wave 1 of the office flow, M1).
    if (created.flowRun !== undefined) answer.flowRun = created.flowRun
    // AND A REMINDER OF A PIECE OF A MESSAGE'S WORDS THAT LOOKS LIKE A KEY. The message is stored; lib/message-keys.ts says why.
    if (created.keyReminder !== undefined) answer.keyReminder = created.keyReminder
    // AND WHAT A DECISION OR A REPORT NAMES, said back, with each nothingFits reminder sent (lib/what-a-record-names.ts).
    if (created.whatItNames !== undefined) answer.whatItNames = created.whatItNames
    // AND THE RECORDS A MESSAGE'S OR A REPORT'S WORDS NAME, read now that the write is stored (lib/message-keys.ts).
    Object.assign(answer, theRecordsAWriteNames(created.record, theMessageReader(actorFrom(req))))
    const reportFileReminder = reportFileReminderFor(created.record)
    if (reportFileReminder !== undefined) answer.reportFileReminder = reportFileReminder
    // AND WHEN A LEAD IS NOT RIGHT, TO THE WRITER OF ONE. The reminder is said only when the lead is not to a report
    // written for a reader, a page, or a record waiting on the person reading it. A reminder only: the message and its
    // lead are stored as sent.
    if (leadIsReminded(created.record)) answer.leadReminder = WHEN_TO_SEND_A_LEAD
    // AND WHAT ELSE IS ALREADY LINKED TO THE MODULE OR BLOCK THIS RECORD WAS LINKED TO. Both keys or
    // neither, as with `similar`. Problem DVzgaTVrVW3I.
    if (created.alreadyLinkedThere !== undefined) {
      answer.alreadyLinkedThere = created.alreadyLinkedThere
      answer.alreadyLinkedThereNote = describeAlreadyLinkedThere(created.record.id, created.alreadyLinkedThere)
    }
    // AND WHERE THE MESSAGE WENT WHEN ITS ADDRESSEE COULD NOT BE REACHED.
    // It also follows decision J1Qge4JH87bv. The addressee keeps the letter; this says the office also
    // gave it to somebody up its chain of starters, and the finished line for each entry.
    //
    // THE STATUS FOLLOWS A DECISION, KEPT WHERE IT WAS. A person's send to a RETIRED addressee, and a person's or an
    // agent's send to a registered agent nothing holds, answer 409, with the routing in the reply all the same; every
    // other routed send answers 201. An agent's send to a retired agent is refused with 409 before anything is written,
    // so it never comes here.
    // AND THE ADDRESSEES THE OFFICE COULD NOT TELL ABOUT, which were not routed. Problem `TOoUy7fMbg1P`.
    if (created.notRouted !== undefined) answer.notRouted = created.notRouted
    if (created.routed !== undefined) {
      answer.routed = created.routed
      // A PERSON'S SEND TO A RETIRED ADDRESSEE, AND A PERSON'S OR AN AGENT'S SEND TO A REGISTERED AGENT NOTHING HOLDS,
      // ANSWER 409. The routing is in the reply all the same. The office's own lines are not written through this door,
      // so no caller is answered for them.
      const refused = theReasonOfA409Send(created)
      if (refused !== null) {
        reply.status(409)
        // THE WHOLE REFUSAL IS THE ROUTED LINE, OR LINES, WORD FOR WORD. A person's send to a
        // retired addressee, and a person's or an agent's send to a registered agent nothing
        // holds, store the letter and still answer with an error. This is the
        // error the chat draws now, so the reader is told what happened instead of meeting a bare
        // failure. Criterion M113a.
        answer.error = created.routed.map((one) => one.line).join(' ')
        if (refused.reason !== undefined) answer.reason = refused.reason
      }
    }
    /**
     * AND AN AGENT THIS WRITE JUST REGISTERED IS ANSWERED ITS KEY, ONCE. Criterion P83, point 5.
     *
     * THIS IS THE SECOND REGISTRATION DOOR. `POST /api/agents/started` does the same thing in its
     * `whatToGiveIt`; this door writes the same `agent` record the starter door does, so leaving it
     * out would make the key depend on which door somebody happened to use. Measured on 7 September
     * 2026: an agent on another machine came through THIS door rather than the other one, which is
     * why the registration gate is a function both routes call and not a clause in one handler.
     *
     * IT IS MADE AFTER THE ROW EXISTS, so a refused write answers no key. `aKeyWasEverHeldBy` stops
     * a second key for an agent that already holds one.
     *
     * THE HANDLE IS THE REFERENCE THIS DOOR HOLDS AND THE KEY IS KEPT UNDER THE AGENT'S ID.
     * Criterion I5. The record's own `handle` field is all this branch has — the registry row was
     * written a moment ago by the same write — so it is handed to keys.ts, which asks which agent
     * the name means and keeps and reads the key under that agent's id. A name freed by a
     * retirement therefore answers no key of the agent that bore it, and the agent registering
     * under it is given its own.
     */
    if (body.kind === 'agent') {
      const handle = typeof created.record.data['handle'] === 'string' ? created.record.data['handle'] : null
      if (handle !== null && handle !== '' && namedALiveAgent) {
        answer.keyNotGivenBecause = whatAJoinedRowIsAnsweredInsteadOfAKey(handle)
      } else if (handle !== null && handle !== '' && !aKeyWasEverHeldBy('agent', handle)) {
        answer.whatToGiveIt = {
          handle,
          key: makeAnAgentKey(handle, howThisCallProvesTheKeyItMakes(actor)),
          keySays: THE_AGENT_KEY_IS_SHOWN_ONCE,
        }
      }
    }
    // THE RUN'S KEY, minted inside the create's transaction above, is answered here and nowhere else.
    if (runKey !== null) answer.runKey = runKey
    // AND WHICH SHORTER FORMS OF IT NOBODY HAS WRITTEN YET.
    //
    // ON FILING AND NOT ON EVERY WRITE. It was built inside `recordReply` for one commit, which put
    // it on every PATCH of a module too — and `tests/checklist-item.test.ts` measures the cost of
    // ticking one checklist line against rewriting the whole array. Roughly nine hundred bytes on
    // every reply is a real cost to a route that has nothing to do with short forms, and the
    // criterion is about filing: the agent that just wrote the report is the one that can still
    // write its six forms, and it is the only one that has read the report.
    const stillToWrite = shortFormsStillToWrite(created.record)
    return stillToWrite === undefined ? answer : { ...answer, shortForms: stillToWrite }
  }
  // AN AGENT'S RUN'S MESSAGE IS HELD IN ITS TURN DRAFT, checked first by this door with nothing stored (lib/turn-drafts.ts).
  app.post('/records', route('record.write', 'remote'), (req, reply) =>
    throughTheTurnDraft(req, reply, workspaceOf(req), (only) => fileARecord(req, reply, only)))
  app.post('/records/check', route('record.check', 'remote', ASK_FIRST_SENTENCE + ' Running sessions use the same hand-start askedBy and brief rule as POST /api/records, with all writes rolled back.'), (req, reply) => fileARecord(req, reply, 'check'))

  /**
   * A pipeline's blocks, read the one way they are ever read, or null when this is not a pipeline.
   *
   * ---------------------------------------------------------------------------------------
   * WHY A ROUTE DOES THIS AT ALL
   * ---------------------------------------------------------------------------------------
   *
   * `data.blockIds` is the ONE statement of which blocks a pipeline holds and in what order, which
   * is why it is stored and why nothing else may hold a second copy. What it is not is readable: a
   * caller asking a pipeline what it holds got an ordered array of nanoids, and every title, state
   * and gate behind them was another request. Problem `Bfrh5gi1SBwI`. Re-measured 2026-08-12 on
   * this project's own development campaign — which is recorded AS a pipeline precisely so an
   * agent with no transcript can ask what stage the work is in — eleven requests for ten blocks.
   *
   * NOT A SECOND READING. `readPipelineBlocks` in shared/blocks.ts is THE reader and its header
   * says what happened when it was not: five files, five readings of one stored step, two of them
   * inventing an identity for a step whose id was missing. The browser calls it, the attention
   * rule calls it, and now so does this route. Nothing about a pipeline is computed here.
   *
   * THE LOADING MOVED TO `src/server/lib/blocks.ts` ON 6 SEPTEMBER 2026, and it used to sit in this
   * closure where nothing else could reach it. `src/server/lib/continuation.ts` needed the same
   * answer for the bundle, could not call this, and wrote a second reading that counted a
   * pipeline's steps through links of kind `block` — so every bundle said "0 of 0 step(s) done".
   * Problem `xxpYGbmxEDiW`.
   *
   * WHAT IT COSTS TO READ. One query for links pointing to this pipeline's blocks, and one row per
   * block plus one per module carrying a block. It does
   * NOT load the workspace: `GET /api/records/:id` is on the path of every record page, and a read
   * that grew with the project is the cliff tests/graph-scale.test.ts exists about.
   */
  function pipelineBlocks(record: PanelRecord, workspaceId: string): PipelineBlockReading | null {
    if (record.kind !== 'pipeline') return null
    return readOnePipelinesBlocks(record, workspaceId, blockLinkRowsFor(record, workspaceId))
  }

  /**
   * One record with everything a page needs: what it still wants, its links both ways, its history.
   *
   * Each link carries its gate, from the one stored row, on WHICHEVER end is being looked at. That
   * is what lets the blocked record say what it is waiting for and how much without storing
   * anything of its own — see resolveLinks in lib/records/link-readers.ts.
   */
  app.get(
    '/records/:id',
    route('record.read', 'remote'),
    async (
      req,
    ): Promise<{
      record: PanelRecord
      incomplete: Incompleteness[]
      /** The token to send back as `ifVersion` on a PATCH built from this read. See RecordReply. */
      version: string
      /**
       * THE NUMBER OF THE REVISION HOLDING WHAT THIS READ HANDED BACK, or null when this database's
       * ledger holds none with that content.
       *
       * It is here so a caller can say which revision a remark was written against without a second
       * request. `{seq: revisionSeq, contentHash: version}` is the pair a `context.revision` takes,
       * and it is not a guess: this reader really did read that revision. Mole Office CHECKS such a pair
       * and never fills one in, because stamping "the newest revision as of now" would claim
       * somebody had read the newest one when nothing measured that.
       *
       * ONLY THE NUMBER IS NEW HERE. The hash is `version` above and is not repeated under another
       * name, because the same fact under two names is the defect this repository keeps producing.
       */
      revisionSeq: number | null
      /**
       * THE `History` CONTROL'S TWO FACTS, on every kind, so a page can draw the control before it
       * has asked for a single revision.
       *
       * `versions` is how many revisions this record has, out of the ONE statement in this server
       * that counts them. `baselineOnly` is true when that one version is the row the ledger
       * backfill wrote — a version holding exactly what the record holds now, which nobody chose
       * and which no reader can learn anything from. A control reading `History 1` there promises a
       * past that was never stored, and 361 of the 707 records in the owner's corpus are in that
       * state (measured 26 August 2026, `tools/measure-the-history.mjs`).
       *
       * NO `nowSeq` HERE. `revisionSeq` above is that number and repeating it under a second name
       * is the fault this whole repair exists to close.
       */
      history: { versions: number; baselineOnly: boolean }
      links: GatedLink[]
      changes: Change[]
      /**
       * HOW MANY CHANGE ROWS `changes` CARRIED AND HOW MANY IT LEFT, and the request for the rest. The rows are newest
       * first and whole, for as long as their values fit `budgetBytes`; no value is cut. A run's record held 1,610 rows
       * and answered 30 MB before this (wave 13y round 15).
       */
      changesCarried: ChangesCarried
      /**
       * THE ACTS AN AGENT MADE HERE ON THE PERSON'S OWN QUOTED WORDS, newest first.
       *
       * Each one carries the person's words verbatim, who said them, where and when, what the write did, and
       * whether they have taken it back. Empty is the ordinary answer.
       */
      onThePersonsWords: ActOnTheirWords[]
      /**
       * WHERE THE QUESTION ON THIS RECORD IS — on a record that asks the person something, and on
       * nothing else. Criterion P55.
       *
       * With the starter of the agent that asked, or with the person. The key is ABSENT where
       * nothing asks the person anything, for the reason `resolution` below is absent on a module: it
       * would be a sentence about nothing on nearly every read in the product.
       */
      whereTheQuestionIs?: WhereTheQuestionIs
      /**
       * WHETHER A FORK HAS BEEN SETTLED — on a `proposal`, and on nothing else.
       *
       * Read off the links in `links` above every time this is asked, and stored nowhere: a
       * proposal is resolved when a `decision` links back to it with `derived_from`, and it has no
       * `resolved` field precisely so that nothing can disagree with the link. The key is ABSENT on
       * every other kind rather than false, because "not settled" is not a true thing to say about
       * a module.
       */
      resolution?: ProposalResolution
      /**
       * ON A DECISION: the live decision that replaced it, or null because none has (problem ZSWftCSVUP2r). A replaced
       * decision has left normal content; this, its own record, keeps it whole and names what replaced it.
       */
      replacedBy?: { id: string; title: string } | null
      /**
       * ON A DECISION: the live decisions that replaced it directly, filed first first, or an empty list because none
       * has. `replacedBy` is the one at the end of the line; these are the ones whose `supersedes` links point at this
       * decision, which is what its links name (wave 13s round 104, item 15).
       */
      replacedDirectlyBy?: { id: string; title: string }[]
      /**
       * ON A SECRETARY'S DUTIES: each decision they rest on that a newer decision replaced, with the decision that stands
       * in its place, and nothing for one that is not replaced (wave 13s round 101, item 12). Nothing moves the duties
       * onto the newer one by itself; the page says it beside the decision.
       */
      restsOnReplacedBy?: Record<string, { id: string; title: string }>
      /**
       * WHAT THIS PIPELINE HOLDS — on a `pipeline`, and on nothing else.
       *
       * Every block in the pipeline's own stored order, each with its name, its qualified title,
       * its state, what it waits on and how hard, which modules carry it, and the block record
       * itself so its stamps and its provenance travel with it. Plus `problems`, which names every
       * listed id that could not be read, `storedIds`, and `undeclared` — true when the pipeline
       * stores no `blockIds` key at all, which is a stub and is not the same as holding none.
       *
       * The key is ABSENT on every other kind rather than an empty reading, for the reason
       * `resolution` is: a module that has not written its blocks down is not a thing that exists.
       */
      blocks?: PipelineBlockReading
      /**
       * WHAT THIS RECORD MAY NOT BE USED TO CLAIM, on every kind, always present.
       *
       * A `placeholder` or a `ran_instead` record that reaches this one, carrying its author's own
       * `allowedUses` and `disallowedClaims` UNCHANGED, how it reached this record, and where it
       * stands. This is the first door out of the building and the one the others are fed from: a
       * fresh agent must not read `fx = 600` off this reply and lose *temporary placeholder; not
       * valid for geometry*.
       *
       * `found: []` IS A REAL ANSWER and means nothing restricts this. `couldNotCheck` says what
       * the walk could not do, and is not empty today — the Implementation Map has no read that
       * rolls the import graph up to records, so code dependencies are not walked and the reply
       * says so rather than reporting a clean run.
       *
       * THERE IS NO KEY SAYING WHETHER ANY CLAIM IS STILL VALID and there must not be one.
       */
      restrictions: {
        found: RestrictionReading[]
        skippedDeleted: number
        couldNotCheck: { what: string; because: string }[]
      }
      /**
       * WHY THIS STEP'S CANONICAL METHOD IS THE PERSON'S TO CHANGE — on a `block` with a live
       * fallback, and absent everywhere else.
       *
       * An agent that files a `ran_instead` record changes what every other agent may write to a
       * DIFFERENT record: `data.method` on that block becomes person-only for as long as the
       * fallback stands. That is the intended behaviour, and it must not be a surprise, so an agent
       * reading this record learns it here before it tries to write.
       */
      methodIsThePersons?: { because: string; fallbacks: { id: string; title: string }[] }
      /**
       * WHETHER PICKING THIS RUN UP AGAIN IS EXPENSIVE — on a `session`, and absent everywhere else.
       * Criterion T6.
       *
       * The warning names the input tokens on the run's own usage receipt and the minutes it has been
       * idle, and never a context size. Null means no warning was earned: no large last turn, no
       * readable receipt, or no readable idle stamp. The key is absent on every other kind rather
       * than null, for the reason `resolution` above is absent on a module.
       */
      pickUpCost?: PickUpCost | null
      /**
       * THE WORKERS THIS RUN ASKED THE OFFICE TO START — on a `session`, and absent everywhere else. Wave 13j round
       * loop-4. Each worker with its name, the model, the ask's state, and its own run's state, seal and receipt's cost,
       * read by `theWorkersARunStarted` from the run's `workerRuns`. Null means the run asked for no worker.
       */
      workers?: TheWorkersARunStarted | null
      /**
       * THE SUPERVISOR'S RUN THAT ASKED FOR THIS RUN AS A WORKER'S — on a `session`, and absent everywhere else. Wave 13j
       * round loop-5. Read by `theRunThatAskedForThisWorker` from the parent's own `workerRuns`, which must name this run
       * as started. Null means no run did, which is true of a continued run under the same parent.
       */
      askedForBy?: TheRunThatAskedForAWorker | null
      /**
       * THE PERSON'S PRESS ON A WAITING ASK — on a `role_request` nobody has answered, read by the
       * person, and absent everywhere else. It admits a waiting registration, gives a card, or lets an
       * agent be answered a new key; `says` is what the press does, from the one reading every surface
       * asks (src/server/lib/newkey.ts).
       */
      waitingForThePersonsPress?: WaitingCardAsk
      /**
       * THE DECISIONS THIS OPEN FORK MAY BE CLOSED BY — on a `proposal` nothing settles yet, and absent everywhere else.
       * Every live decision in its project that names it, newest first, read by `theDecisionsThatNameThisFork`, which
       * asks the same question the settling door asks of a secretary. The proposal page offers each one to close the
       * fork by, with no new decision (problem lZ8mjvbb4fxl). An empty list means none names it.
       */
      decisionsThatNameIt?: { id: string; title: string; decidedBy: string | null }[]
      /**
       * THE EARLIER DECISIONS A DECISION MADE FROM THIS OPEN FORK MAY REPLACE — on a `proposal` nothing settles yet, and
       * absent everywhere else. Each is its id, its title and the record it shares with the fork. It is the same reading
       * the promote door refuses with (`replaceCandidatesForTheFork` calls `candidatesOnTheSameSubjects` on the fork's
       * own subjects), so the card the Decisions page draws and the refusal that page meets cannot disagree. An empty
       * list means there is none. It is absent everywhere but an open proposal, including on a settled fork's reply.
       */
      [REPLACES_CANDIDATES_FIELD]?: ACandidate[]
      /**
       * ON A DECISION: the mark it carries when it is in the person's name and its reference is not the person's own
       * record, or null when it carries none. Absent on every other kind.
       */
      notOnThePersonsOwnWords?: NotOnThePersonsOwnWords | null
      /**
       * ON A NOTE PREPARED FOR THE PERSON TO FILE: the note the person filed from it, or null while the person has not
       * pressed. Absent on every other record.
       */
      filedAsThePersonsWords?: { id: string; title: string } | null
      /**
       * WHO FILED THIS AND FROM WHICH RUN, with the model that run was started on, or null when no create row is
       * recorded (problem 2tbFWxiFyjtv). A report's page names the model behind it from this.
       */
      filedFrom: FiledFrom | null
      /**
       * WHAT THIS REPLY LEFT OUT, on a flow or a decision read without ?secondLevel=show, and the
       * request that asks for it. Absent on every other kind and when the reader asked.
       */
      secondLevel?: SecondLevelHeld
    } | RecordWhere> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const { shape } = parse(recordReadQuery, req.query, 'The query string is not usable:')
      // A MESSAGE THIS READER MAY NOT READ IS REFUSED inside `recordInWorkspace`, before anything about it
      // is read. Every door here that takes a record id hands it the reader.
      const reader = theMessageReader(actorFrom(req))
      const record = recordInWorkspace(id, workspaceId, reader)
      // WHERE THE RECORD IS, AND A SESSION'S RUNTIME WORD WHEN ITS RECORD NAMES ONE, for a caller that only needs its
      // project. The refusal and the `elsewhere` above are the same as on the whole read.
      if (shape === 'where') {
        const runtime = record.kind === 'session' ? record.data['runtime'] : undefined
        return { id: record.id, kind: record.kind, workspaceId: record.workspaceId, ...(typeof runtime === 'string' && runtime.trim() !== '' ? { runtime } : {}) }
      }
      const resolution = proposalResolution(record)
      // WHICH DECISIONS REPLACED WHICH, read once for a decision's two answers below, and not at all for another kind.
      const replacements = record.kind === 'decision' ? readTheReplacements() : null
      const blocks = pipelineBlocks(record, workspaceId)
      const theQuestion = whereOneQuestionIs(record)
      // THE SECOND LEVEL ONLY WHEN ASKED: a flow's reasons, sources and changes and a decision's
      // basis are left out of the reply unless ?secondLevel=show asks, and `secondLevel` says what was left out.
      const folded = foldTheSecondLevel(
        recordsWithTheHonourThisReaderMaySee([record], reader)[0]!,
        theSecondLevelIsAsked(req.query),
        `GET /api/records/${record.id}`,
      )
      return {
        // A RUN'S HONOUR READING NAMES NO MESSAGE THE CALLER MAY NOT READ among its
        // evidence. Only the reply is changed: `version` below is the stored record's.
        record: folded.record,
        ...(folded.secondLevel === null ? {} : { secondLevel: folded.secondLevel }),
        ...(resolution === null ? {} : { resolution }),
        ...(resolution === null || resolution.resolved
          ? {}
          : {
              decisionsThatNameIt: theDecisionsThatNameThisFork(record),
              [REPLACES_CANDIDATES_FIELD]: replaceCandidatesForTheFork(record),
            }),
        ...(record.kind === 'decision'
          ? { notOnThePersonsOwnWords: decisionsNotOnThePersonsOwnWords([record]).get(record.id) ?? null }
          : {}),
        ...(isPreparedForThePerson(record) ? { filedAsThePersonsWords: theNoteFiledFrom(record.id) } : {}),
        ...(replacements === null ? {} : { replacedBy: whatSupersedes(record.id, replacements) }),
        ...(replacements === null ? {} : { replacedDirectlyBy: theDecisionsThatReplacedThisDirectly(record.id, replacements) }),
        ...(record.kind === SECRETARY_DUTIES_KIND
          ? { restsOnReplacedBy: theReplacedDecisionsTheyRestOn(record.data) }
          : {}),
        ...(blocks === null ? {} : { blocks }),
        // AND, ON A RUN, WHETHER PICKING IT UP AGAIN IS EXPENSIVE. Criterion T6. Read from the run's
        // own receipt and its own idle stamp, so this page and the Embassy row say one thing.
        ...(record.kind === 'session'
          ? { pickUpCost: pickUpCostOfARun(record.data, new Date(), pickUpCostThresholds()) }
          : {}),
        // AND THE WORKERS IT ASKED THE OFFICE TO START, each with its own run, for the run's pages to draw in words.
        ...(record.kind === 'session' ? { workers: theWorkersARunStarted(record) } : {}),
        // AND, ON A WORKER'S RUN, THE SUPERVISOR'S RUN THAT ASKED FOR IT, so the two runs lead to each other.
        ...(record.kind === 'session' ? { askedForBy: theRunThatAskedForThisWorker(record) } : {}),
        ...(record.kind === 'session' ? { reportConfirmation: whoMayConfirmThisReport(record) } : {}),
        // No note here. A read is not news: the page draws the empty fields where they belong,
        // and a sentence telling a reader what they can already see is noise. The note is for
        // the write responses, where the caller cannot see the record at all.
        filedFrom: whoFiledFromWhichRun(workspaceId, record.id),
        incomplete: incompletenessOf(record),
        // THE READ IS WHERE THE COMPARE-AND-SET STARTS. A caller that rewrites an array does it
        // from what this request handed back, so this is the version its write was built against.
        version: versionOf(record),
        // ASKED OF THE LEDGER BY CONTENT, not "the newest row". The two answer the same on a quiet
        // database and differ the moment somebody writes between this read and this reply, and the
        // true one is the revision holding what the caller was actually handed.
        revisionSeq: revisionHoldingContent(id, versionOf(record)),
        // THE `History` CONTROL'S THREE FACTS, on every kind, so the header can draw it before the
        // revisions listing has been asked for at all. `versions` is `numbering()` — the ONE
        // statement in this server that counts one record's revisions — and `baselineOnly` says
        // that the one version there is the row the ledger backfill wrote, holding what the record
        // holds now. A badge reading `History 1` on one of those pages promises a past that was
        // never stored. There is deliberately no `nowSeq` here: `revisionSeq` one line above IS
        // that, and a second copy of it would be the fault this key was added to close.
        history: historyBadge(id),
        links: resolveLinks(id),
        // NO CHANGE ROW NAMING A MESSAGE THE CALLER MAY NOT READ: a link row whose
        // other end is one, or a run's honour reading that gives one as evidence.
        // AND NO MORE ROWS THAN THEIR VALUES' BUDGET, newest first, with `changesCarried` saying what was left out.
        ...(() => {
          const { rows, carried } = changesOfOneRecordWithinABudget(id, workspaceId, reader)
          return { changes: toChanges(rows), changesCarried: carried }
        })(),
        // WHAT THIS MAY NOT BE USED TO CLAIM, from the one reader. Always present, because an
        // absent key and an empty list would be the same thing to a caller and they are not the
        // same fact.
        restrictions: restrictionsOn(id, workspaceId),
        // WHAT AN AGENT DID HERE ON THE PERSON'S OWN WORDS, newest first, each with the words, who
        // said them, where and when, what the write did, and whether it has been revoked. An empty
        // list is the ordinary answer and it means nobody acted on the person's words on this record.
        //
        // ALWAYS PRESENT, for the reason `restrictions` above is: an absent key and an empty list
        // would read the same to a caller and they are different facts.
        onThePersonsWords: actsOnTheirWords(id),
        // AND WHERE THE QUESTION ON IT IS: with the starter of the agent that asked, or with the
        // person. Criterion P55. ABSENT on a record that asks the person nothing, for the reason
        // `resolution` above is absent on a module: "nobody is being asked anything" is not a
        // thing worth saying on every read in the product, and an empty reading would read as one.
        ...(theQuestion.with === null && !theQuestion.reachedThePerson ? {} : { whereTheQuestionIs: theQuestion }),
        ...methodOwnership(record),
        // AND WHERE A KEY ASK CAME FROM, AND WHEN THE AGENT'S KEY WAS LAST USED, for every reader: the
        // starter who answers a new-key ask reads it here too. Finding 83, mend b2. Absent on
        // every record that is not a new-key ask or a waiting registration.
        ...(record.kind === 'role_request'
          ? (() => {
              const shows = whatThisKeyAskShows(record)
              return shows === null ? {} : { theAsk: shows }
            })()
          : {}),
        // AND WHERE A NEW-KEY ASK STANDS, in one sentence, for every reader: waiting, granted and not
        // collected, collected, refused, or withdrawn. Problem sgjHE9R2vSEZ. Absent on every other record.
        ...(record.kind === 'role_request'
          ? (() => {
              const stands = whereThisNewKeyAskStands(record)
              return stands === null ? {} : { whereTheAskStands: stands }
            })()
          : {}),
        // AND THE PRESS ON A WAITING ASK, to the person, and on an ask that waits for the person to a secretary they raised,
        // each told who may press. Nobody else is sent it.
        ...(record.kind === 'role_request'
          ? (() => {
              const reader = actorFrom(req)
              const who = thePersonIsProved(reader)
                ? 'the-person'
                : reader.type === 'agent' && theRaiseThisActorHolds(reader) !== null
                  ? 'a-raised-secretary'
                  : null
              const press = who === null ? null : thePressOnThisAsk(record, who)
              return press === null ? {} : { waitingForThePersonsPress: press }
            })()
          : {}),
        // AND THE PRESS THAT WITHDRAWS A NEW-KEY GRANT NOBODY COLLECTED, for the person only, by point 9 of
        // a decision. A starter that granted it withdraws through the door with its
        // own key. Absent on every record that is not a granted, uncollected new-key ask.
        ...(record.kind === 'role_request' && thePersonIsProved(actorFrom(req))
          ? (() => {
              const grant = theGrantToWithdrawOnThisAsk(record)
              return grant === null ? {} : { grantToWithdraw: grant }
            })()
          : {}),
      }
    },
  )

  /**
   * Change a record. Two ways to change `data`, and the difference matters:
   *
   *   PATCH /api/records/:id  {"data": {...}}       replaces `data` with this object, whole.
   *                                                 Anything not in it would be gone — so a `data`
   *                                                 that would empty a field the record holds is
   *                                                 REFUSED, naming every one of them, unless the
   *                                                 request also says {"replace": true}. A replace
   *                                                 that goes through answers with `emptied`,
   *                                                 naming every field it took off the record.
   *   PATCH /api/records/:id  {"dataPatch": {...}}  merges this into `data`, key by key.
   *                                                 Keys not named are left exactly as they are.
   *                                                 This is the one to reach for.
   *
   * Inside a dataPatch:
   *
   *   - a null DELETES its key. It does not store a null. `{"blocks": null}` removes `blocks`.
   *     The response says which keys went, in `dataPatch.deleted` and in one sentence in
   *     `dataPatch.detail`, because a delete is the one edit whose effect you cannot see by
   *     reading back what you sent. `dataPatch.note` is the same news in the words a PERSON reads,
   *     with no paths in it: the browser prints it under the box somebody just typed in, and it
   *     used to print "1 path changed: data.state." at them.
   *   - two objects merge, recursively: {"numbers":{"trials":300}} leaves the other numbers alone.
   *   - anything else replaces, arrays included. To change one item in a list, send the list.
   *
   * Sending both `data` and `dataPatch` is refused rather than guessed at.
   *
   * Why merging is worth having: correcting one mis-keyed field on a module used to mean GET the
   * record, edit the object, PATCH all of it back — two calls, the whole record over the wire
   * twice, and a change-log row holding the entire record before and the entire record after.
   * The audit measured 8.9 kB and a 6.2 kB row for a six-character key. A merge patch sends the
   * one key and writes one change row per JSON path that actually changed.
   *
   * The result of a merge is validated as a whole record, not as a patch, so a record written
   * before validation existed cannot be merge-patched until the same patch also fixes whatever
   * is wrong with it. That is on purpose: the alternative is a write that leaves a record
   * invalid and reports success.
   *
   * ---------------------------------------------------------------------------------------
   * CHANGING WHAT KIND OF THING THE RECORD IS
   * ---------------------------------------------------------------------------------------
   *
   *   PATCH /api/records/:id  {"kind": "problem"}
   *
   * A first choice of kind used to be permanent, and correcting one meant deleting the record and
   * writing it again. It is an ordinary edit now.
   *
   * NOTHING STORED IS DISCARDED. Each kind declares its own fields and every kind has an `extra`
   * bag. A field the new kind has no place for keeps its value inside `extra` under the key it
   * already had — whether the new kind has no such field at all, or has one that cannot hold this
   * value, which is what happens to a state word from another kind's vocabulary. The reply carries
   * `kindChange`, which names every field that moved and the exact path it is at now.
   *
   * AND IT GOES BOTH WAYS, since 18 August 2026. A value sitting in `extra` whose key the NEW kind
   * declares comes back onto the record, as long as the record holds nothing at that key already
   * and the new kind's own validation accepts it. So task → problem → task ends with the estimate
   * and the state it started with. `kindChange.broughtBack` names every candidate and says whether
   * it came back or why it could not; a value is never written over one the record already holds.
   *
   * THE REPLY SAYS WHAT HAPPENED TWICE, AT TWO LENGTHS, as the plan replies do. `kindChange.note`
   * is what a person reads: plain sentences, no stored paths, no requests. `kindChange.detail` is
   * the whole account with every path in it, for a developer view and for an agent. Both are built
   * from `kept` and `broughtBack` in one place, so they cannot come to disagree.
   *
   * A field the record does not hold is simply missing, and the record may become INCOMPLETE for
   * its new kind. That does not stop the change: `incomplete` on the same reply says what it now
   * wants, computed the same way it is on every other write.
   *
   * SEND THE KIND ON ITS OWN, without `data` or `dataPatch`. Both are refused together with it,
   * because a kind change rewrites `data` itself and because one key means different things under
   * two kinds. `title`, `summary` and `ifVersion` may be sent with it, and `ifVersion` is the same
   * compare-and-set here as on every other patch.
   *
   * Sending the kind the record already has changes nothing, writes no change row and does not
   * move `updatedAt`. It is answered 200 with `kindChange.changed` false and a sentence saying so.
   *
   * Three changes are refused, each naming what to do instead: a kind nothing declares, a kind only
   * the human may write, and either end of the pipeline-and-block pair while the two are joined.
   */
  app.patch(
    '/records/:id',
    route('record.change', 'remote'),
    async (
      req,
    ): Promise<
      RecordReply & {
        /**
         * The revision this patch WROTE, or null when it wrote none.
         *
         * A PATCH THAT CHANGES NOTHING WRITES NOTHING — no row, no `updatedAt`, no change row and no
         * revision — and this is how the reply says which of the two happened. Without it "I set the
         * title to B" and "the title was already B" came back byte-identical. It is the same word
         * `POST /api/records/:id/revisions/:seq/restore` already answers with, because a restore is
         * an ordinary patch underneath and one fact should not have two names.
         */
        newSeq: number | null
        nothingWritten?: string
        dataPatch?: DataPatchOutcome
        /**
         * WHAT A WHOLESALE `data` REMOVED — every field the record held that the new object did not.
         *
         * PRESENT EXACTLY WHEN THE REQUEST SENT `data`, empty when the rewrite removed nothing, and
         * absent on a merge, which cannot empty a field it does not name. It is the reply's answer
         * to the question sending `data` asks, and it is never absent when something went: the
         * write that emptied seven fields of a problem record on 4 September 2026 came back 200
         * with nothing in it naming them.
         */
        emptied?: string[]
        /**
         * Present exactly when the request named a `kind`, and absent on every other patch.
         *
         * It says what the record was, what it is now, and — the part a caller cannot work out
         * from what it sent — every field that had to move into `extra` to keep its value, with
         * the path it is at now and one sentence saying why it could not stay. It is present even
         * when the kind sent was the one the record already had, with `changed` false, because
         * "nothing changed" is the answer to a question that was asked.
         */
        kindChange?: KindChangeOutcome
        /** Present when this patch made the record a session: its flow run, or why none was written. */
        flowRun?: PatchResult['flowRun']
        /** Present when steps the office saw in this change were not written to the run's flow run. */
        flowRunStepsNotWritten?: PatchResult['flowRunStepsNotWritten']
        /**
         * THE REMINDER BEFORE THE SEAL, present when this write would have sealed a run and was answered with the reminder
         * instead (`sealed: false`, `newSeq` null and the record as it was), or when a reminder was due and could not be
         * kept (`notReminded`, beside a seal that went ahead).
         */
        beforeTheSeal?: TheReminderBeforeTheSeal | { notReminded: string }
        /**
         * PRESENT WHEN THIS WRITE GAVE THE RUN A NEW SEAL: whether the office kept on the run what the reminder before the
         * seal did (`remindedBeforeTheSeal`), or why it could not. The seal stands either way.
         */
        remindedBeforeTheSeal?: { kept: true } | { kept: false; because: string }
        /** The office's fields a whole `data` left out, which this write kept as they were stored. */
        keptAsStored?: string[]
        /** PRESENT WHEN THE WRITE CARRIED A LAUNCHER'S NOTICE: the office line written to the run's starter, or why none was. */
        tellTheStarter?: WhatTheStarterWasTold
      }
    > => {
      const workspaceId = workspaceOf(req)
      refuseAStoppedChecksInspector(req, workspaceId)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(patchBody, req.body, 'The request body is not usable:')
      // THE WARRANT IS ABOUT THE REQUEST AND NOT ABOUT THE RECORD, so it comes off the body here and
      // rides on the actor. `patchRecord` writes what `patch` holds, and a key it does not declare
      // reaching the record's `data` is the one thing this split has to prevent.
      // `remindBeforeTheSeal`, `tellTheStarter` AND `theModelItRanOn` ARE ABOUT THE REQUEST TOO, and come off the body the
      // same way.
      const { warrant: wordsItActsOn, remindBeforeTheSeal, tellTheStarter, theModelItRanOn, ...patch } = body
      // THE CALLER IS READ FIRST, for its refusals in the order they have always come. Who is calling only: whether this
      // write proves its own run is known once the record is read, and the run the session header names is asked then.
      actorAndWordsForARecordWrite(req, wordsItActsOn, id, { whoOnly: true })
      // In this project, or a 404 naming the project it is really in. See the file header.
      const before = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req, { whoOnly: true })))
      const machineChange = (patch.data !== undefined && (Object.hasOwn(patch.data, 'mainSuiteFix') || before.data['mainSuiteFix'] !== undefined)) || (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, 'mainSuiteFix'))
      // THE SECOND READING ASKS FOR THE RUN-KEY BINDING, because this is a record write and `patchRecord` reads it to
      // write its reminder. The reading above and every read route ask for who is calling only and read no revision
      // history.
      const actor = actorAndWordsForARecordWrite(req, wordsItActsOn, id, { runKeyFor: true, ...(machineChange ? { proveOwnRun: true } : {}) })
      // ONLY THE OFFICE WRITES needsNoCheck and endedWithItsMergeEntry, so a dataPatch naming either
      // is refused from every caller, and so is a whole `data` that would add, change or drop either.
      if (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, NEEDS_NO_CHECK)) throw new PanelError(ONLY_THE_OFFICE_WRITES_NEEDS_NO_CHECK, 403)
      if (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, ENDED_WITH_ITS_MERGE_ENTRY)) throw new PanelError(ONLY_THE_OFFICE_WRITES_ENDED_WITH_ITS_MERGE_ENTRY, 403)
      if (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, REMINDED_BEFORE_THE_SEAL)) throw new PanelError(ONLY_THE_OFFICE_WRITES_REMINDED_BEFORE_THE_SEAL, 403)
      if (patch.dataPatch !== undefined && Object.hasOwn(patch.dataPatch, CHECK_ALSO)) throw CHECK_ALSO_IS_WRITTEN_BY_ITS_DOOR()
      // A WHOLE `data` THAT LEAVES OUT remindedBeforeTheSeal OR checkAlso KEEPS THEM AS STORED, and the reply says so in
      // `keptAsStored`. The office writes the first on every reminded run, so without this a run's own whole-`data` seal
      // sent again after its reminder would be refused, and keeping the reminder would have stopped the seal.
      const keptAsStored: string[] = []
      if (patch.data !== undefined) {
        for (const field of [REMINDED_BEFORE_THE_SEAL, CHECK_ALSO]) {
          if (Object.hasOwn(before.data, field) && !Object.hasOwn(patch.data, field)) {
            patch.data = { ...patch.data, [field]: (before.data as Record<string, unknown>)[field] }
            keptAsStored.push(field)
          }
        }
        if (Object.hasOwn(patch.data, CHECK_ALSO) && !isDeepStrictEqual(patch.data[CHECK_ALSO], (before.data as Record<string, unknown>)[CHECK_ALSO])) throw CHECK_ALSO_IS_WRITTEN_BY_ITS_DOOR()
      }
      const moved = patch.data === undefined ? null : anOfficeOnlyFieldAWholeDataWouldMove(before.data as Record<string, unknown>, patch.data)
      if (moved !== null) throw new PanelError(moved.refusal, 403)
      // A LAUNCHER'S NOTICE THAT DOES NOT FIT THIS WRITE IS REFUSED BEFORE ANYTHING IS WRITTEN (lib/launcher-notices.ts), so
      // the office never says a run ended in a way the write does not say.
      const noticeDoesNotFit =
        tellTheStarter === undefined && theModelItRanOn === undefined ? null : whyTheNoticeDoesNotFit(tellTheStarter, theModelItRanOn, before, patch)
      if (noticeDoesNotFit !== null) throw new PanelError(noticeDoesNotFit, 409)
      // THE REMINDER BEFORE THE SEAL. Design B: at remind or block, the first write that would seal a run,
      // sent with the run's own key, is answered with what an inspector would most likely refuse, and nothing of it is stored.
      // At block, a later write is refused over a certain item the reminder named that the same finder still finds.
      // A likely item stays a reminder. At remind, the same write sent again seals, subject to the separate hard migration check.
      // A fault of form is listed and never refused, and every hard gate refusal is counted as a stopped write.
      // At off, the office counts an encounter when items are present and goes on to the seal. The hard migration check stays on.
      // See lib/before-the-seal.ts for why it is asked here and not after the seal.
      // A TERRITORY IS COMPARED ON CHANGED PATHS, which Git reads here, before anything is written (lib/claims.ts): for a
      // write that changes one, and for the first finished send of a run holding one, which is compared now, while the
      // run is still running, so a group opens before its seal and even when the send is answered with the reminder.
      const territoryRead = await theChangedPathsBeforeAPatch(before, patch)
      const atTheSeal = territoryRead?.atItsSeal === true ? openTheGroupsForATerritory(before, actor, territoryRead.changed) : undefined
      const beforeTheSeal = remindBeforeTheSeal === false ? null : await aReminderBeforeTheSealFor(req, before, patch)
      if (beforeTheSeal !== null && 'sealed' in beforeTheSeal) {
        // THE RECORD AS IT IS NOW: nothing of this write, and the office's `remindedBeforeTheSeal` when it was kept, so
        // the version handed back is the one a write sent again with `ifVersion` must carry.
        const now = getRecord(id) ?? before
        return {
          ...recordReply(now, theMessageReader(actorFrom(req)), incompletenessOf(now)),
          newSeq: null,
          nothingWritten: nothingWrittenSentence({ kind: 'reminder' }),
          beforeTheSeal,
          ...(atTheSeal === undefined ? {} : { territoryOverlaps: atTheSeal }),
          ...(tellTheStarter === undefined
            ? {}
            : { tellTheStarter: { notTold: 'The write was answered with the reminder before the seal, so nothing was written and nobody was told.' } }),
        }
      }
      // A RUN MARKED AS METHOD WORK, AT BLOCK, after it was reminded of the reviewed design it lacks: the next sealing write
      // is refused while the same check still names something, and nothing of it is stored (lib/design-reminders.ts).
      refuseTheSealOverAMissingDesign(req, before, patch)
      // THROUGH THE RECORD DOOR, so a write that changes a run's data is asked who may change the run (lib/records.ts).
      // A RUN'S HELD MESSAGES GO IN THE SAME TRANSACTION AS A WRITE THAT FINISHES OR SEALS IT, before its key is taken back
      // and before the seal reads its last message (lib/turn-drafts.ts). A write refused here or above sends nothing.
      // A WRITE THAT FINISHES A RUN reads the run's git on the seal-read thread and runs in passes, each from the processes
      // it reads onward (lib/a-finish-reads-git-apart.ts). Every other write runs once, as it always did.
      const finishes = before.kind === 'session' && whetherThisWriteFinishesTheRun(before, patch).explicitlyFinishes
      if (finishes) timeTheFinishOf(req, 'PATCH /api/records/:id')
      // A WRITE THAT ENDS A RUN WAITS FOR THE RUN'S END COMMIT, read by a git process apart from this thread
      // (lib/a-runs-own-commits.ts). A finish reads it at its seal.
      const endHead = finishes ? null : await theEndHeadBeforeAWrite(before, patch)
      const write = (inside: InOnePass) =>
        readFirst(
          () => theProcessesAWriteReads(id, patch),
          () =>
            inside(() =>
              countingATerritoryRefusal('write', () =>
                sendTheHeldDraftsBeforeTheRunEnds(req, id, patch.dataPatch ?? patch.data, () =>
                  throughTheRecordDoor(id, () => patchRecord(id, patch, actor, undefined, [], refuseATerritoryOverlapAtBlock(territoryRead?.changed ?? new Map()), endHead ?? undefined)),
                ),
              ),
            ),
        )
      const patched = finishes ? await aFinishReadsItsGitApart(req, write) : await write((act) => act())
      const territoryOverlaps = patched.territoryChanged === true
        ? openTheGroupsForATerritory(patched.record, actor, territoryRead?.changed ?? new Map()) : atTheSeal
      // WHAT THE REMINDER DID BEFORE A NEW SEAL, kept on the run by the office; it never throws, so it never stops the seal.
      const remindedKept = await keepWhatTheSealDidWithTheReminder(req, before, patched.record, {
        launcherAskedForNone: remindBeforeTheSeal === false,
        noAgent: beforeTheSeal !== null && 'notReminded' in beforeTheSeal,
      })
      const afterKeeping = remindedKept?.kept === true ? getRecord(id) : null
      const result = afterKeeping === null ? patched : { ...patched, record: afterKeeping, incomplete: incompletenessOf(afterKeeping) }

      // ------------------------------------------------------- WHAT ELSE IS CALLED THIS, ON A RENAME
      //
      // A CREATE SAID THIS AND A RENAME DID NOT, and both writes put the same name into the same
      // project. `POST /api/records` has answered `sameTitle` since 17 August 2026 — the day the
      // owner overturned the refusal, because id is identity and title is presentation — and this
      // route dropped the question entirely. So filing "Close-up camera" told you another record
      // was already called that, and renaming a record TO "Close-up camera" told you nothing. The screen
      // that wanted to ask "there is already work called this — did you mean it?" could ask it on
      // one path out of two, and src/web/pages/RecordPage.tsx says so where the hint would have gone.
      //
      // ASKED EXACTLY WHEN THE REQUEST NAMED A TITLE, and about the title the record NOW HOLDS.
      // A patch that never mentions a title did not put a name anywhere, so it has nothing to
      // report; answering on every patch would put this paragraph on top of every checklist tick,
      // which is how a caller learns to skip the reports that do say something. Sending the title
      // the record already had still answers, with the same reasoning `kindChange` is answered on
      // an unchanged kind: nothing changed is the answer to a question that was asked.
      //
      // THE STORED TITLE IS WHAT IS ASKED ABOUT, never the one in the request. `patchRecord` trims
      // before it writes, so asking with the request's string would answer about a name that is in
      // no row — the exact mismatch lib/records.ts fixed on the create path, where an untrimmed
      // query sat above a trimmed insert.
      //
      // THE RECORD ITSELF IS TAKEN OUT. On a create the row does not exist when the question is
      // asked, so it cannot answer about itself; here it does exist and holds the new title, and a
      // rename that reported the record you just renamed would be telling you about yourself.
      //
      // NOT A SECOND READING OF WHAT A TITLE MATCHES. `theRecordsAlreadyCalled` is lib/records.ts's own
      // reader and the same one the create path calls, so the rule about what a typed name means — live
      // rows only, deleted rows keep their names for ever, and no message this caller may not read
      // — is stated once. tests/same-title-on-rename.test.ts files the same
      // title through both routes and fails if the two answers ever differ.
      const sameTitle =
        body.title === undefined
          ? []
          : theRecordsAlreadyCalled(result.record.title, workspaceId, theMessageReader(actorFrom(req)))
              .filter((other) => other.id !== result.record.id)
              .map((other) => ({ id: other.id, kind: other.kind, title: other.title }))

      // `incomplete` describes the record as it stands after the patch, not the patch — so a
      // dataPatch that fills the last empty field comes back with an empty list and no note, and
      // one that deletes a field with `null` comes back saying the record wants it again. That
      // second case is the whole reason it is recomputed rather than carried over: a delete is a
      // successful write that makes a record LESS finished, and the response has to show it.
      //
      // The four `undefined`s are the arguments this route has nothing to say about: no session
      // binding, because only a create can claim a run name, and no links, because this route
      // writes none.
      // ------------------------------------------------------------------ DID THIS CROSS A BOUNDARY
      //
      // TWO OF THE SIX BOUNDARIES ARE THIS ROUTE, and what separates them is the TRANSITION, not
      // the route: a work record reaching `done` or `failed` is `task.complete`, and a claim
      // reaching `measured` is `result.promote`. The transition is read from what the record says
      // NOW against what it said before, so a patch that set the state to what it already was
      // crosses nothing.
      const wasState = (before?.data as Record<string, unknown> | undefined)?.['state']
      const nowState = (result.record.data as Record<string, unknown> | null)?.['state']
      const crossed =
        wasState === nowState
          ? null
          : result.record.kind === 'claim' && nowState === 'measured'
            ? 'result.promote'
            : nowState === 'done' || nowState === 'failed'
              ? 'task.complete'
              : null
      const restrictions =
        crossed === null
          ? null
          : boundaryReply(crossed, {
              id: result.record.id,
              kind: result.record.kind,
              title: result.record.title,
              workspaceId: result.record.workspaceId,
            })

      // ------------------------------------------------- AND A RUN THAT JUST SAID IT IS FINISHED
      //
      // CRITERION C28. A check needs no tmux kept open by hand: Mole Office starts the checking agent itself.
      // A subagent saying it is done does not end it,
      // and until now nothing happened next unless somebody typed a command. Now the office asks
      // for the check itself, here, at the moment the finish is declared, because THIS IS WHERE IT
      // IS DECLARED: `sayHowItEnded` in src/worker/index.ts patches the run's own record to
      // `state: finished`, and so does an agent writing its own record.
      //
      // IT STARTS NO PROCESS. It writes the inspector a message, and the message worker starts the
      // run from that, the way it starts every run. There is no second starting path.
      //
      // ASKED ON THE TRANSITION AND NOT ON THE STATE, like `crossed` above and for the same reason:
      // a patch that set `finished` on a run that already said `finished` declared nothing. The
      // function itself will not ask twice either, and reads what it wrote as the proof.
      //
      // ONE STATE IS NOT A TRANSITION AND STILL ASKS: A REFUSED RUN SEALED AGAIN. A refused run already says it is
      // finished, so the worker's answer to the refusal is a write that says `state: finished` again, which seals it
      // again. Until problem oSbOIC2Jypn0 that asked for nothing, and the check waited until somebody wrote by hand.
      const finishedNow =
        !aRunSaysItIsFinished((before?.data as Record<string, unknown> | undefined) ?? {}) &&
        aRunSaysItIsFinished((result.record.data as Record<string, unknown> | null) ?? {})
      const resealedARefusal = result.sealsTheRun === true && before !== null && aRefusalStandsOn(before)
      // THE LAUNCHER'S NOTICE, WRITTEN BY THE OFFICE AS ITS OWN LINE (problem Grbb87VX3pND). It is written in no session, so
      // the reading of the run's last word below never takes it for the run's. Written before that reading, so the starter
      // reads that the run ended before reading that its check is held.
      const toldTheStarter =
        tellTheStarter === undefined ? null : tellTheStarterOfTheNotice(tellTheStarter, theModelItRanOn ?? null, before, getRecord(result.record.id) ?? result.record)
      // A SANDBOX ROUND'S CHECK IS ASKED ONLY IN THE CASES THAT ASK IT (lib/how-a-round-ended.ts): a package handed back, a
      // FEATURE READY: line or a repair. A round that says not for a check is asked none and is not queued, and its next
      // round is still asked. Read before the check is asked for, so a held check is never asked.
      const sealedRound = result.record.kind === 'session' && (finishedNow || resealedARefusal) ? theCheckOfASealedRound(result.record) : null
      const checksOffAtSeal = result.record.kind === 'session' && (finishedNow || resealedARefusal) &&
        theReviewLevel(workspaceId) === 'full' && whetherThisOfficesChecksAreSwitchedOff(workspaceId) &&
        !inspectorAnswersRun(result.record.id, workspaceId)
      if (checksOffAtSeal) {
        if (resealedARefusal) markARefusalAnswered(result.record,
          "The worker said its work was finished again after the refusal. The office's checks were switched off, so no fresh check was asked. The refusal stays on the record: it is what the rework answered.")
        asTheDoorOf(NEEDS_NO_CHECK, () => patchRecord(result.record.id, { dataPatch: { [NEEDS_NO_CHECK]: {
          rule: NEEDS_NO_CHECK_RULES[1], at: nowStamp(), because: "The run sealed while the office's checks were switched off.",
        } } }, THE_OFFICE))
      }
      const theCheck =
        result.record.kind === 'session' && (finishedNow || resealedARefusal) && !checksOffAtSeal && aCheckIsAskedAtTheSeal(sealedRound)
          ? theOfficeStartsTheCheck({ runId: result.record.id, workspaceId, actor, atTheSeal: true })
          : null
      // AND HOW THE ROUND ENDED IS KEPT ON THE RUN: sealed, with the check asked for or held. Its failure is said in the reply.
      const roundEnded = sealedRound === null ? null : recordHowASealedRoundEnded(getRecord(result.record.id) ?? result.record, sealedRound, theCheck !== null, checksOffAtSeal)
      // AND THE OFFICE PUTS THE SEALED ROUND IN THE MERGE QUEUE ITSELF, for a line that is turned on (wave 13u round 93).
      const queuedAtTheSeal = result.record.kind === 'session' && (finishedNow || resealedARefusal) && aCheckIsAskedAtTheSeal(sealedRound) ? theOfficeDecidesAtTheSeal(result.record.id) : null
      // AND THE OFFICE ASKS FOR THE LINE'S NEXT ROUND ITSELF, with the sandbox's briefs/NEXT.md (wave 13u round 94).
      const nextRoundAtTheSeal = result.record.kind === 'session' && (finishedNow || resealedARefusal) && sealedRound?.hold !== true ? theOfficeAsksTheNextRoundAtTheSeal(result.record.id) : null

      const reportFileReminder = reportFileReminderFor(result.record)
      const answer = {
        ...recordReply(
          result.record,
          theMessageReader(actorFrom(req)),
          result.incomplete,
          undefined,
          undefined,
          undefined,
          undefined,
          sameTitle,
        ),
        // ALWAYS PRESENT, never omitted when null. A key that disappears on the no-op is a reply the
        // caller has to know about in advance to read; a null is the answer to the question.
        newSeq: result.newSeq,
        ...(result.nothingWritten === undefined ? {} : { nothingWritten: result.nothingWritten }),
        // PRESENT ONLY WHERE A FINISH WAS JUST DECLARED, so an ordinary patch says nothing about
        // checks. What it holds is what the office did about it: who was asked, or that nobody
        // holds the card and who was told instead.
        ...(theCheck === null ? {} : { theCheck }),
        // HOW A SANDBOX ROUND ENDED AT ITS SEAL: the account the office kept, or why it could not keep it.
        ...(roundEnded === null ? {} : { howTheRoundEnded: roundEnded.kept ? roundEnded.howTheRoundEnded : { notKept: roundEnded.because } }),
        // WHAT THE OFFICE DID WITH THE SEAL FOR THE MERGE QUEUE, or why it could not keep it. Absent when it decided nothing.
        ...(queuedAtTheSeal === null ? {} : { queuedAtTheSeal }),
        // WHAT THE OFFICE DID ABOUT THE NEXT ROUND AT THE SEAL, or why it could not keep it. Absent when it looked at nothing.
        ...(nextRoundAtTheSeal === null ? {} : { nextRoundAtTheSeal }),
        // WHAT THE WHOLE-OBJECT REWRITE TOOK OFF THE RECORD. Absent on a merge, present on every
        // replace including the ones that took nothing — see `emptied` on PatchResult for why the
        // empty list is an answer rather than an omission.
        ...(result.emptied === undefined ? {} : { emptied: result.emptied }),
        ...(result.kindChange === undefined ? {} : { kindChange: result.kindChange }),
        // WHAT THE OFFICE WROTE, OR FAILED TO WRITE, ON THE RUN'S FLOW RUN. Absent when there was nothing to say.
        ...(result.flowRun === undefined ? {} : { flowRun: result.flowRun }),
        ...(result.flowRunStepsNotWritten === undefined ? {} : { flowRunStepsNotWritten: result.flowRunStepsNotWritten }),
        ...(result.keyReminder === undefined ? {} : { keyReminder: result.keyReminder }),
        ...(result.whatItNames === undefined ? {} : { whatItNames: result.whatItNames }),
        ...(result.runKeyReminder === undefined ? {} : { runKeyReminder: result.runKeyReminder }),
        // AND THE RECORDS A MESSAGE'S OR A REPORT'S WORDS NAME AFTER THE WRITE, read now that it is stored (lib/message-keys.ts).
        ...theRecordsAWriteNames(result.record, theMessageReader(actorFrom(req))),
        ...(reportFileReminder === undefined ? {} : { reportFileReminder }),
        // A REMINDER BEFORE THE SEAL THAT WAS DUE AND COULD NOT BE KEPT, said beside the seal it did not stop.
        ...(beforeTheSeal === null ? {} : { beforeTheSeal }),
        ...(remindedKept === null ? {} : { remindedBeforeTheSeal: remindedKept }),
        // WHY THE SEAL OF A RECORDS RUN DID NOT CHECK FOR COMMITS PAST ITS CUT, said here and stored nowhere (lib/sealed-tip.ts).
        ...theCommitsNotCheckedFor(req),
        ...(keptAsStored.length === 0 ? {} : { keptAsStored }),
        // THE LINE THE OFFICE WROTE FOR THE LAUNCHER'S NOTICE, or why it wrote none. Present only when one was asked for.
        ...(toldTheStarter === null ? {} : { tellTheStarter: toldTheStarter }),
        // ABSENT WHEN THERE IS NOTHING TO SAY, and that is the rule rather than an omission: a line
        // whose numbers are all zero is not drawn, so a reminder that fires every time cannot exist.
        ...(restrictions === null ? {} : { restrictions }),
      }

      // The merge outcome is only in the response when there was a merge to report. An empty
      // report on a wholesale write would read as "nothing changed", the opposite of true.
      if (territoryOverlaps !== undefined) answer.territoryOverlaps = territoryOverlaps
      if (result.dataPatch === null) return answer
      return { ...answer, dataPatch: result.dataPatch }
    },
  )

  /**
   * RELEASE THE HELD CHECK OF A SEALED ROUND, AND ASK FOR IT. Wave 13j round loop-1; lib/how-a-round-ended.ts.
   *
   *   POST /api/records/<run>/release-the-held-check  {"because": "The question was answered."}
   *
   * The run's starter, the person, or a secretary proved by its own key may release it, and at off the gate
   * who-releases-a-held-check lets any caller. The reply is the account as it now stands and the check the office asked for.
   */
  app.post('/records/:id/release-the-held-check', route('record.change', 'remote'), async (req) => {
    const workspaceId = workspaceOf(req)
    const actor = actorFrom(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(z.object({ because: z.string().trim().min(1, { error: 'Say why, in "because".' }) }).strict(), req.body, 'The request body is not usable:')
    const run = recordInWorkspace(id, workspaceId, theMessageReader(actor))
    if (run.kind !== 'session') throw new PanelError(`Record ${id} is not a run, so it has no check to release. Nothing was written.`, 409)
    const agent = theAgentOfARunForItsSeal(run)
    const told = agent === null ? null : whoIsToldOfASeal(agent)
    const starter = told !== null && 'to' in told ? told.to : null
    const theStarterAsks = starter !== null && starter.kind === 'agent' && theAgentTheKeyProves(actor) === starter.id
    if (!theStarterAsks && !thePersonIsProved(actor) && !theKeyProvesASecretary(actor) && gateMet('who-releases-a-held-check') === 'block') {
      throw new PanelError(
        `The held check of run ${id} is released by the run's starter, the person, or a secretary proved by its own key, and this request was made by "${actor.id}". Nothing was written.`,
        403,
      )
    }
    const released = releaseTheHeldCheck(run, actor.id, body.because)
    const theCheck = theOfficeStartsTheCheck({ runId: id, workspaceId, actor })
    return { howTheRoundEnded: released, theCheck }
  })

  /**
   * THE ITEMS A RUN'S STARTER ASKS THE REMINDER BEFORE THE SEAL TO NAME. Wave 13j round 54; lib/check-also.ts.
   *
   *   PUT /api/records/<run>/check-also  {"items": ["Did the report answer the owner's question?"]}
   *
   * Replaces the list; an empty list takes it off. At most 20 items of at most 300 characters. Refused to the run's own
   * key, so a run cannot choose what it is reminded of.
   */
  app.put('/records/:id/check-also', route('record.change', 'remote'), async (req): Promise<RecordReply> => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(z.object({ items: z.unknown() }).strict(), req.body, 'The request body is not usable:')
    const run = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
    const result = setTheCheckAlsoOf(req, run, body.items, actorFrom(req))
    return { ...recordReply(result.record, theMessageReader(actorFrom(req)), incompletenessOf(result.record)), ...(result.nothingWritten === undefined ? {} : { nothingWritten: result.nothingWritten }) }
  })

  /**
   * Change ONE line of a module's checklist, addressed by its id.
   *
   *   PATCH /api/records/<module>/checklist/<itemId>  {"state":"done"}
   *
   * This is the one edit `dataPatch` cannot make cheaply, and it is the commonest edit there is.
   * A merge patch replaces arrays whole — on purpose, because an index-wise array merge cannot
   * shorten a list and scrambles a reordered one — so `parts`, an array of parts each holding an
   * array of items, is out of its reach. Ticking off a checklist line therefore meant reading the
   * record, rewriting the array client-side and sending the whole of `data` back: the exact
   * read-modify-write the merge patch was built to remove, plus a change row holding the entire
   * checklist before and after.
   *
   * What this writes instead is one change row per key that really moved, named for the item:
   * `data.parts[#mount].items[#mount-1].state`. `#` means "the element with this id", not an
   * index — an index moves when somebody reorders a checklist and the history then describes the
   * wrong line.
   *
   * The refusals are in lib/records.ts and every one of them is a refusal rather than a guess:
   * an unknown item id is a 404 that lists the ids that exist and appends nothing, an id used
   * twice is a 400 naming both parts, and a key ProgressItem does not declare is a 400 naming
   * the ones it does. The merged item is checked as part of the whole record, so `{"state":
   * "nearly"}` is refused with the five states it could have been.
   *
   * WHAT IT SAYS ABOUT A LINE SOMEBODY ELSE WROTE. `ifVersion` is optional here, so a writer holding
   * an old copy is not refused. The answer names instead, in `writtenOver` and `writtenOverNote`,
   * every value the write replaced that another writer put there, who wrote it and when, and in
   * `leftBeside` what those writes left on the line. Problem KzMu_Ndhb8X-; `whatThisWroteOver` in
   * lib/records/checklist-items.ts works it out.
   */
  app.patch(
    '/records/:id/checklist/:itemId',
    route('record.checklist', 'remote'),
    async (
      req,
    ): Promise<
      RecordReply & {
        item: Record<string, unknown>
        partId: string
        itemPatch: DataPatchOutcome
        writtenOver: ChecklistPatchResult['writtenOver']
        leftBeside: ChecklistPatchResult['leftBeside']
        writtenOverNote: string | null
      }
    > => {
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id, itemId } = parse(checklistParams, req.params, 'The URL is not usable:')
      const body = parse(checklistBody, req.body, 'The request body is not usable:')
      const { rest, ifVersion: against } = liftIfVersion(body)
      // In this project, or a 404 naming the project it is really in. See the file header.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const result = patchChecklistItem(id, itemId, rest, actor, undefined, against)
      return {
        ...recordReply(result.record, theMessageReader(actorFrom(req)), result.incomplete),
        ...(result.nothingWritten === undefined ? {} : { nothingWritten: result.nothingWritten }),
        item: result.item,
        partId: result.partId,
        itemPatch: result.itemPatch,
        writtenOver: result.writtenOver,
        leftBeside: result.leftBeside,
        writtenOverNote: result.writtenOverNote,
      }
    },
  )

  /**
   * ADD one line to a module's checklist, without sending the checklist.
   *
   *   POST /api/records/<module>/checklist {"partId":"mount","id":"mount-4","text":"…","state":"todo"}
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS EXISTS: ADDING A LINE USED TO DESTROY THE OTHER LINES
   * ---------------------------------------------------------------------------------------
   *
   * A merge patch replaces arrays whole, so until this route the only way to add a checklist line
   * was to GET the module, splice `data.parts` in the client and PATCH the whole array back. Four
   * agents did that in one night and one of them measured what happens when two do it at once: a
   * module whose checklist held three lines came out holding four different ones, none of the
   * original ids surviving, and the write was answered 200. That is a lost update, and it is what
   * parallel agents do by default.
   *
   * This request carries ONE line. A caller that has never read the checklist cannot overwrite the
   * part of it it never saw, which is the whole of the fix — the compare-and-set on PATCH is the
   * other half, for the callers that really do mean to rewrite the array.
   *
   * WHAT IT REFUSES, each a refusal rather than a guess:
   *
   *   - a partId naming no part   404, listing the parts that exist. No default part is picked:
   *                               a line filed under a heading nobody chose reads afterwards as
   *                               somebody else's work.
   *   - an id already in use      400, naming the part that holds it, and pointing at the PATCH
   *                               that changes that line instead.
   *   - a missing or empty id     400. The id is what dates the line in the change log and what
   *                               you address it by afterwards, so the caller chooses it.
   *   - a line with no text or    400 from the same whole-record gate every other write passes
   *     no state                  through: a nested shape written at all has to be written whole.
   *
   * It writes ONE change row, holding the new line, at
   * `data.parts[#mount].items[#mount-4]` — so the alarm panel's "how long has this been doing?"
   * clock can date the line from the day it was added.
   */
  app.post(
    '/records/:id/checklist',
    {
      config: {
        operation: 'record.checklist',
        reach: 'remote',
        note:
          'Add one line to a module\'s checklist without sending the checklist: ' +
          '{"partId":"<which part>","id":"<a new id, unique in this module>","text":"what is to be done",' +
          '"state":"todo"}, plus any other ProgressItem field (note, hours, consequence, paused). ' +
          'It carries one line, so a caller that has not read the checklist cannot overwrite the lines it ' +
          'has not seen — which is what rewriting data.parts does, and did. A partId naming no part is a 404 ' +
          'listing the parts that exist; an id already used is a 400 naming the part that holds it; nothing ' +
          'is appended to a record that is not a module. To CHANGE a line: PATCH ' +
          '/api/records/:id/checklist/:itemId. To remove one: PATCH /api/records/:id with the whole parts ' +
          'array and the ifVersion the read handed you. THIS ROUTE TAKES `ifVersion` TOO, and so does the ' +
          'change route — optional on both, a 409 when the record has moved since. It is worth sending when ' +
          'you are writing over a line somebody else may have just written; you do not need it to add a line ' +
          'nobody else has, which is what this route is for.',
      },
    },
    async (
      req,
      reply,
    ): Promise<RecordReply & { item: Record<string, unknown>; partId: string; itemPatch: DataPatchOutcome }> => {
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(appendChecklistBody, req.body, 'The request body is not usable:')
      const { partId, ...rest } = body
      const { rest: item, ifVersion: against } = liftIfVersion(rest)
      // In this project, or a 404 naming the project it is really in. See the file header.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const result = appendChecklistItem(id, partId, item, actor, against)
      reply.code(201)
      return {
        ...recordReply(result.record, theMessageReader(actorFrom(req)), result.incomplete),
        item: result.item,
        partId: result.partId,
        itemPatch: result.itemPatch,
      }
    },
  )

  /**
   * ADD one part to a module's checklist, without sending the checklist. Wave 13j round 51.
   *
   *   POST /api/records/<module>/parts {"id":"tool-plan","name":"The plan for the merge tool"}
   *
   * There was no door for this, so a planner whose plan needed a part of its own put the lines into a part that was
   * there already (report FRsTZ627KvQQ). The rules are `appendAPart` in lib/records.ts.
   */
  app.post(
    '/records/:id/parts',
    route(
      'record.checklist',
      'remote',
      'Add one empty part to a module\'s checklist without sending the checklist: {"id":"<a new id, unique in this ' +
        'module>","name":"<the heading its lines sit under>"}, and `ifVersion` if you want a 409 when the module has ' +
        'moved since your read. Then add lines to it with POST /api/records/:id/checklist {"partId":"<id>",…}. An id a ' +
        'part already has is a 409 naming the parts; nothing is added to a record that is not a module.',
    ),
    async (req, reply): Promise<RecordReply & { part: PartAppendResult['part'] }> => {
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(appendPartBody, req.body, 'The request body is not usable:')
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const result = appendAPart(id, { id: body.id, name: body.name }, actor, body.ifVersion)
      reply.code(201)
      return { ...recordReply(result.record, theMessageReader(actorFrom(req)), result.incomplete), part: result.part }
    },
  )

  /**
   * Record that a promise was kept.
   *
   *   POST /api/records/<obligation id>/fulfil  {"note":"what settled it"}
   *
   * THIS IS THE ACTION THAT WAS MISSING. `data.done` has been declared in shared/kinds.ts and read
   * by every alarm rule since the first slice, and nothing anywhere ever wrote it: no interface
   * offered the action and the seed never set it, so every obligation in the database looked
   * permanent and an analysis of the product concluded there was no way to record that a promise
   * had been kept. There is no second mechanism here. This writes `done`, beside `fulfilledAt` and
   * `fulfilledNote`, and the state word that agrees with them.
   *
   * It is an ordinary write with an ordinary trail: one change row per path that moved, attributed
   * and dated, in today's change log like anything else.
   *
   * Discharging an already-discharged obligation writes NOTHING and says so, rather than moving
   * `fulfilledAt` to today for a promise kept last week.
   */
  app.post(
    '/records/:id/fulfil',
    route('record.fulfil', 'remote'),
    async (
      req,
    ): Promise<
      RecordReply & {
        /** What the record now says about the promise, read back through shared/work.ts. */
        fulfilment: Fulfilment
        /** True when it was already recorded as kept and this call wrote nothing. */
        alreadyDischarged: boolean
        /** The sentence. Named apart from `incompleteNote`, which answers a different question. */
        dischargeNote: string
        dataPatch?: DataPatchOutcome
      }
    > => {
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(fulfilBody, req.body, 'The request body is not usable:')
      // In this project, or a 404 naming the project it is really in. See the file header.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const result = dischargeObligation(id, body, actor)

      const answer = {
        ...recordReply(result.record, theMessageReader(actorFrom(req)), result.incomplete),
        fulfilment: result.fulfilment,
        alreadyDischarged: result.alreadyDischarged,
        dischargeNote: result.note,
      }
      // Absent when nothing was written, for the same reason a wholesale PATCH carries no merge
      // report: an empty one beside a 200 reads as "nothing changed" said twice.
      if (result.dataPatch === null) return answer
      return { ...answer, dataPatch: result.dataPatch }
    },
  )

  /**
   * Add a block to a pipeline.
   *
   *   POST /api/records/<pipeline id>/blocks {"name":"Close and hold","state":"doing"}
   *
   * ---------------------------------------------------------------------------------------
   * WHY A BLOCK IS FILED HERE AND NOT AT POST /api/records
   * ---------------------------------------------------------------------------------------
   *
   * Two facts about a block live on its PIPELINE and nowhere else: where it comes in the order, and
   * the pipeline half of its title. A bare POST /api/records {"kind":"block"} has neither, so it is
   * refused with this route in the refusal. That is the only kind Mole Office refuses to file on its own,
   * and it is refused rather than given a default pipeline, because there is no default pipeline and
   * picking one would be inventing a fact about the work.
   *
   * The block record and the pipeline's new order are written in ONE transaction. A block record
   * that exists but is in no order is drawn on no page at all.
   *
   * WHAT THIS ROUTE DOES NOT DO. It does not say which modules carry the block, and it does not say
   * what the block waits on. Both are LINKS — `implements` from the module, `blocks` from the block
   * that has to move first — and they are made with POST /api/links like every other relationship.
   * There is no block-shaped wrapper around them, because a wrapper is how a step ended up naming
   * its modules twice, once by title and once by id, with nothing making the two agree.
   */
  app.post('/records/:id/blocks', route('record.body', 'remote'),
    async (req, reply): Promise<RecordReply & { pipeline: PanelRecord; at: number }> => {
    const actor = actorForARecordWrite(req)
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(addBlockBody, req.body, 'The request body is not usable:')
    // The PIPELINE has to be in this project, or a 404 naming the project it is really in. A block
    // takes its project from its pipeline, so without this a request working in one project could
    // file a block into another one. See the file header.
    recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
    const result = addBlock(id, { ...body, state: body.state as ItemState }, actor)
    reply.code(201)
    return { ...recordReply(result.block, theMessageReader(actorFrom(req)), incompletenessOf(result.block)), pipeline: result.pipeline, at: result.at }
  })

  /**
   * WHAT RAN INSTEAD OF THIS STEP'S CANONICAL METHOD.
   *
   *   POST /api/records/<block id>/ran-instead
   *     {"ran":"…","because":"…","since":"2026-08-30",
   *      "allowed_uses":["downstream plumbing"],
   *      "disallowed_claims":["that SAM segmentation works"],"severity":"limits_claims"}
   *
   * It mints the record and writes the `about` link in one transaction, and it NEVER touches
   * `data.method` on the block. That is the whole of the kind: a fallback may preserve execution
   * and must not silently redefine the canonical method.
   */
  app.post('/records/:id/ran-instead', route('record.write', 'remote'), async (req, reply) => {
    const actor = actorForARecordWrite(req)
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(ranInsteadBody, req.body, 'The request body is not usable:')
    recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
    const result = fileRanInstead(id, body, actor)
    reply.code(201)
    return {
      ...recordReply(result.record, theMessageReader(actorFrom(req)), incompletenessOf(result.record)),
      block: result.block,
      linkId: result.linkId,
    }
  })

  /**
   * PASS A QUESTION ONE RUNG UP. Criterion P55.
   *
   *   POST /api/records/<id>/pass-the-question-on
   *
   * An agent that says `whose_move: "person"` hands the question to whoever started it, not to the
   * person. This is the act that moves it: to the starter's own starter, and — when the caller is an
   * agent the person started — onto the person's list.
   *
   * IT TAKES NO BODY. What would go in one is the caller's own name and the clock, and neither is a
   * caller's to supply: a name sent in a body is a name anybody can send, and a time sent in one is
   * a time anybody can choose. The route builds the one entry itself.
   *
   * THE ROUTE IS NOT THE ENFORCEMENT. `assertMayPassTheQuestionOn` on the write path is, so the same
   * refusals answer a hand-written PATCH to the same field. This is here because building the entry
   * by hand means copying an id, a kind and a stamp, and every copy is a chance to write somebody
   * else's name.
   */
  app.post(
    '/records/:id/pass-the-question-on',
    route('record.write', 'remote', PASS_IT_ON_NOTE),
      async (req, reply) => {
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      takesNoInput(
        req,
        `POST /api/records/${id}/pass-the-question-on`,
        'Who passed it on is who is asking, and when is now. Neither is read from a body.',
      )
      const before = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const me = participantForActor(actor)
      if (me === null) {
        throw new PanelError(
          `Passing a question on is done under a name, and nothing in this installation is registered as ` +
            `${actor.type} "${actor.id}". Nothing was written. GET /api/participants lists both registries.`,
          403,
        )
      }
      // WHERE IT IS, ASKED BEFORE ANYTHING IS BUILT. `assertMayPassTheQuestionOn` on the write path is
      // the enforcement and it says the same thing — but the shape check runs before the guards, and a
      // second entry naming the same agent is refused there as a duplicate id, in words about
      // ParticipantRef rather than about the question. So the act answers for itself first.
      const where = whereOneQuestionIs(before)
      if (where.reachedThePerson) {
        throw new PanelError(
          `This question has already reached the person, so there is nobody left to pass it on to. ` +
            `${where.says} Nothing was written.`,
          403,
        )
      }
      const already = passedItOnBy(before.data)
      const result = patchRecord(
        id,
        { dataPatch: { [CONFIRMED_BY]: [...already, { who: { kind: me.kind, id: me.id }, at: nowStamp() }] } },
        actor,
      )
      const nowWith = whereOneQuestionIs(result.record)
        reply.code(201)
        return {
          ...recordReply(result.record, theMessageReader(actorFrom(req)), incompletenessOf(result.record)),
          // WHERE IT IS NOW, so the caller does not have to work out whether that press reached them.
          whereTheQuestionIs: nowWith,
        }
    },
  )

  /**
   * Change one block of one pipeline.
   *
   *   PATCH /api/records/<pipeline id>/blocks/<block id> {"state":"failed"}
   *
   * `name` is the block's own name; the server rebuilds the qualified title from it. A PATCH to the
   * block's own record with a title in any other form is refused, with the exact string that would
   * have worked — a title is not free text on a block, because it carries the pipeline it is in.
   *
   * Everything else goes through the ordinary record patch, so a block gets exactly the change rows,
   * the validation and the completeness report every other record gets.
   */
  app.patch(
    '/records/:id/blocks/:blockId',
    route('record.body', 'remote'),
    async (req): Promise<RecordReply & { dataPatch?: DataPatchOutcome; restrictions?: BoundaryRestrictions }> => {
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id, blockId } = parse(blockParams, req.params, 'The URL is not usable:')
      const body = parse(patchBlockBody, req.body, 'The request body is not usable:')
      // The pipeline in this project, or a 404 naming the project it is really in. The block is
      // checked against the pipeline by lib/blocks.ts, so scoping the pipeline scopes both. See the
      // file header.
      const pipeline = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const result = patchBlock(id, blockId, body as Parameters<typeof patchBlock>[2], actor)
      const answer = { ...recordReply(result.record, theMessageReader(actorFrom(req)), result.incomplete), ...(result.nothingWritten === undefined ? {} : { nothingWritten: result.nothingWritten }) }
      // ---------------------------------------------------------- DID THIS FINISH THE PIPELINE
      //
      // `pipeline.complete` is the boundary, and the transition is THE LAST UNFINISHED BLOCK
      // REACHING `done` — not "a block was patched". The scope handed to the reader is the
      // pipeline, so the reminder is about the whole thing that has just finished rather than
      // about the step that finished it.
      const restrictions = pipelineJustFinished(id)
        ? boundaryReply('pipeline.complete', {
            id: pipeline.id,
            kind: pipeline.kind,
            title: pipeline.title,
            workspaceId: pipeline.workspaceId,
          })
        : null
      const withBoundary = restrictions === null ? answer : { ...answer, restrictions }
      return result.dataPatch === null ? withBoundary : { ...withBoundary, dataPatch: result.dataPatch }
    },
  )

  /**
   * Put a pipeline's blocks in a new order.
   *
   *   PUT /api/records/<pipeline id>/blocks {"blockIds":["hv2-02","hv2-01",…]}
   *
   * THE WHOLE ORDER, and it must be a permutation of the blocks the pipeline already has. A list
   * that leaves one out is refused rather than dropping it: a caller that has not seen a block
   * somebody else added a minute ago would otherwise delete it from the order by saying nothing
   * about it, and be answered 200.
   *
   * One write and one change row, on the pipeline. That is the whole reason the order lives on the
   * pipeline rather than as an ordinal on each block — a reorder cannot half-apply.
   */
  app.put('/records/:id/blocks', route('record.body', 'remote'), async (req): Promise<{ pipeline: PanelRecord }> => {
    const actor = actorForARecordWrite(req)
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const body = parse(reorderBody, req.body, 'The request body is not usable:')
    // The pipeline in this project, or a 404 naming the project it is really in. See the file header.
    recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
    return reorderBlocks(id, body.blockIds, actor)
  })

  /**
   * Take a block out of this pipeline. Delete it in the same transaction only when no other live pipeline lists it.
   *
   * DELETE /api/records/<block id> is REFUSED while a pipeline still lists it, because that would
   * leave the order naming a record that is gone — a hole a person then has to repair by hand. Its
   * LINKS are left alone, like every other soft delete: a dependency somebody recorded is a fact
   * about the archive even after the thing it pointed at is gone, and it is shown as broken.
   */
  app.delete('/records/:id/blocks/:blockId', route('record.body-remove', 'remote'),
    async (req): Promise<{ ok: true; pipeline: PanelRecord; deleted: boolean; stillListedBy: { id: string; title: string }[] }> => {
      takesNoInput(req, 'DELETE /api/records/:id/blocks/:blockId', 'Which block goes, and which pipeline it comes out of, are both in the URL.')

    const actor = actorForARecordWrite(req)
    const workspaceId = workspaceOf(req)
    const { id, blockId } = parse(blockParams, req.params, 'The URL is not usable:')
    // The pipeline in this project, or a 404 naming the project it is really in. See the file header.
    recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
    const result = removeBlock(id, blockId, actor)
    return { ok: true, pipeline: result.pipeline, deleted: result.deleted, stillListedBy: result.stillListedBy }
  })

  /**
   * Settle a fork an agent filed: file the decision, and link it back to the proposal.
   *
   *   POST /api/records/<proposal id>/promote {"title":"Stay on position control","data":{"because":"…"}}
   *
   * ---------------------------------------------------------------------------------------
   * THIS ROUTE IS THE GOVERNANCE ACT, WHICH IS WHY IT IS HUMAN-ONLY
   * ---------------------------------------------------------------------------------------
   *
   * An agent may write a `proposal` — the fork, the options, its recommendation — and may not write
   * the `decision` that settles one. Promotion is writing that decision, so it asks the same guard,
   * in the same words, as POST /api/records {"kind":"decision"} does: `assertMayWrite` in
   * lib/records/may-write.ts, which is the one place HUMAN_ONLY_KINDS is read. There is no second rule here
   * and no flag in the body that changes the answer. A `decidedBy` claim inside `data` is refused
   * by the ordinary field gate, because `decision` declares no such field — and it would not have
   * mattered if it did: who is asking comes from the actor headers, never from the body.
   *
   * WHAT IT WRITES: one decision record, one `derived_from` link from that decision to the
   * proposal, and one `task` for the work the decision creates with a `derived_from` link from the
   * task to the decision — all in ONE transaction. The decision-to-proposal link IS the resolution —
   * there is no `resolved` field on a proposal — so settling the fork and recording that it is
   * settled cannot come apart. The task is nobody's:
   * the work a decision creates belongs to the project and goes to whoever is given that part, so the
   * task carries no `owedTo` and names no agent, and a claim on it is the assignment. Criteria P32
   * to P35, `theWorkThisDecisionCreates` in lib/records/what-a-decision-files.ts.
   *
   * WHAT IT DOES NOT WRITE: anything into or out of the proposal. It is not consumed, re-kinded or
   * rewritten, and not one word of it is copied into the decision. Its question, options, reasoning
   * and evidence are the AGENT'S words; the server moving them into a human-only record would be
   * exactly the false provenance the human-only rule exists to prevent. The reply says so, and says
   * what is left on the proposal that you might want to carry across by hand.
   */
  app.post(
    '/records/:id/promote',
    {
      config: {
        operation: 'record.promote',
        reach: 'remote',
        note:
          'Settle a `proposal`: file the `decision` it was filed for, and link that decision back to it with ' +
          `\`${RESOLVES_PROPOSAL}\`, in one transaction. THE PERSON'S OWN ACT, OR AN AGENT CARRYING THEIR WORDS. ` +
          'Without a warrant an agent gets the 403 it always got, naming what it may do instead, and nothing ' +
          'is written. WITH ONE it goes through: {"warrant":{"saidBy":"<who>","words":"<their words, ' +
          'copied>","where":"terminal | ui | message:<id> | comment:<id>","when":"YYYY-MM-DD HH:MM","for":["<this ' +
          'proposal id>"]}}. `for` NAMES THE RECORDS THEIR WORDS COVER and this act\'s record has to be one of ' +
          'them — for a promotion that is the proposal in the URL, not the decision being filed. One sentence ' +
          'that covers several forks lists all of them and may be carried once for each; a warrant that names ' +
          'none is refused, because it would be a key to every act there is. A `where` naming a message or a ' +
          'comment is looked up, and one Mole Office does not hold is refused. THE WARRANT GOES IN THE BODY AND ' +
          'NOWHERE ELSE: the header x-mole-office-warrant is refused, because a header value may hold only ' +
          'bytes 0 to 255 and could not carry their own sentences at all. ' +
          'COPY THEIR WORDS — never a paraphrase, never a summary, never a sentence you wrote for them, because ' +
          'the whole reason the words are kept is that they can read them beside the act and say it is not ' +
          'what they said. Carry one only when they actually said it, and only from where they said it. The ' +
          'words go into both ledgers, every surface that says who settled the fork says it was settled on ' +
          'their words, and they can retract the decision in one press: ' +
          'POST /api/records/:id/revisions/:seq/revoke. A warrant is refused on a person\'s own request, ' +
          'because their own press needs nobody\'s words. Body {"title":"…"} plus the decision\'s own fields in ' +
          '{"data":{"because":"…","decided_on":"…","revisit_when":"…","alternatives_rejected":[…]}} and an ' +
          'optional {"summary":"…"} — GET /api/kinds/decision lists them. THE PROPOSAL IS KEPT AND NOTHING IS ' +
          'COPIED OUT OF IT: the fork, the options nobody took and the reasoning stay where their author wrote ' +
          'them, and the decision says only what you send, so the two can be read side by side afterwards. That ' +
          'link is also what makes the proposal read as resolved — there is no `resolved` field and there must ' +
          'not be one — so GET /api/records/<the proposal> answers `resolution` derived from the links every ' +
          'time it is asked. Refusals: 404 for an id nothing holds, 403 for anyone but the human, 400 when the ' +
          'record is not a proposal or has been deleted, and 409 when it is already settled, naming the decision ' +
          'that settled it. A proposal that a decision already answers is not promoted twice: file the new ' +
          'decision with POST /api/records, and say what it does to the old one with POST /api/links ' +
          '{"fromId":"<the new decision>","toId":"<the decision that settled it>","type":"supersedes"}.',
      },
    },
    async (req, reply): Promise<PromoteResult & { version: string; restrictions?: BoundaryRestrictions }> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(promoteBody, req.body, 'The request body is not usable:')
      // THE WARRANT RIDES ON THE ACTOR, never into the decision's own fields. `data` is what the
      // decision stores and what `GET /api/kinds/decision` lists; the words this act stands on are a
      // fact about the request, and they are written into both ledgers rather than into the record.
      // THE FORK, NOT THE DECISION. Promotion writes a new decision, so the record this act is ON is
      // the proposal being settled — which is the id a warrant has to name in `for`.
      const actor = actorAndWordsForARecordWrite(req, body.warrant, id)

      // PROMOTE IS SCOPED LIKE EVERY OTHER WRITE, and the cross-project decision desk is the reason
      // it can be, not a reason it cannot.
      //
      // The desk on Home lists forks from every project on purpose — a fork waiting on a person does
      // not stop waiting because they are reading a different project today — so a settle can name a
      // fork that is not in the project on screen. That looks at first like a reason to leave this
      // route open. It is not. The owner settled it on 2026-08-13 (§39 in design/DECISIONS-PENDING.md)
      // by choosing the projection over the hole: `GET /api/forks` reads across projects and writes
      // nothing, and settling "still goes through POST /api/records/<the fork>/promote, in the fork's
      // own project". So the READ spans projects and the WRITE does not.
      //
      // The desk already sends the fork's own project. `promoteProposal` in src/web/api.ts takes a
      // `workspaceId` argument and puts it in `x-mole-office-workspace`, and Governance.tsx passes the
      // fork's own workspace rather than the one in the switcher. Nothing in the browser depends on
      // this route answering about another project.
      //
      // The decision written here is filed where the proposal is, which is the other half: a decision
      // that landed in whichever project the reader happened to be in would separate a fork from its
      // answer, and both are meant to be readable side by side afterwards.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))

      const result = promoteProposal(id, { title: body.title, summary: body.summary ?? null, data: body.data }, actor)
      reply.code(201)
      // ------------------------------------------------------------------ DID THIS CROSS A BOUNDARY
      //
      // `decision.commit`, and the transition IS the promote — there is no state to compare. The
      // scope handed to the reader is the PROPOSAL: what is worth saying at the moment a fork is
      // settled is what is still unresolved around the question that was just answered.
      const restrictions = boundaryReply('decision.commit', {
        id: result.proposal.id,
        kind: result.proposal.kind,
        title: result.proposal.title,
        workspaceId: result.proposal.workspaceId,
      })
      // `version` is the DECISION's, because that is the record this call created and the one a
      // caller's next PATCH would be built against. The proposal is unchanged and its own version
      // is on GET /api/records/<the proposal>.
      return {
        ...result,
        version: versionOf(result.decision),
        ...(restrictions === null ? {} : { restrictions }),
      }
    },
  )

  /**
   * CHOOSE AGAIN ON A DECISION THE PERSON HAS ALREADY MADE. Criterion M83.
   *
   * Once a decision was pressed, its option could not be changed and no comment could be added, even
   * when nothing had been built on it yet.
   *
   * IT WRITES A NEW DECISION AND EDITS NOTHING. The new one supersedes the old and resolves the same
   * fork; the old one stays exactly as it was written, marked by the reverse of that link. This is
   * the sentence the promote route's own 409 already told a person to type by hand, made a press.
   */
  app.post(
    '/records/:id/choose-again',
    {
      config: {
        operation: 'record.choose-again',
        reach: 'remote',
        note:
          'CHANGE A DECISION YOU HAVE ALREADY MADE, so one press is never the last word on a choice. Body {"title":…,"summary"?:…,"data"?:{…}} — ' +
          'the same shape a promotion takes, and `data.because` is where your words for why you are changing it ' +
          'go. IT WRITES A NEW DECISION AND EDITS NOTHING: the new one links `supersedes` to the old and ' +
          `\`${RESOLVES_PROPOSAL}\` to the same proposal, so the fork stays settled and says which of the two stands. The ` +
          'old decision is left exactly as it was written — a decision that could be rewritten in place would ' +
          'take the record of what you decided last week and leave nothing saying it had ever said otherwise. ' +
          'THE PERSON\'S ACT: a decision is the one human-only kind, and an agent is refused here as it is on ' +
          'POST /api/records. A decision that has ALREADY been superseded is refused with the id of the one that ' +
          'stands, because two decisions superseding one old one is two answers with nothing saying which is the person\'s.',

      },
    },
    async (req, reply) => {
      const { id } = parse(idParams, req.params, 'The decision to choose again on')
      const body = parse(chooseAgainBody, req.body, 'The new decision')
      const actor = actorForARecordWrite(req)
      recordInWorkspace(id, workspaceOf(req), theMessageReader(actorFrom(req)))
      const result = chooseAgain(id, { title: body.title, summary: body.summary ?? null, data: body.data }, actor)
      reply.code(201)
      return { ...result, version: versionOf(result.decision) }
    },
  )

  /**
   * MOVE a record into another project, with exactly what has to come with it.
   *
   *   POST /api/records/<id>/workspace  {"to":"panelx"}
   *   POST /api/records/<id>/workspace  {"to":"panelx","also":["<id>","<id>"]}
   *   POST /api/records/<id>/workspace  {"to":"panelx","dryRun":true}
   *
   * ---------------------------------------------------------------------------------------
   * WHY THIS IS ITS OWN VERB AND NOT A FIELD ON PATCH
   * ---------------------------------------------------------------------------------------
   *
   * Two sentences in this server used to say `PATCH /api/records/<id>` moved a record between
   * projects — the note on POST /api/workspaces and the refusal in `refuseCrossWorkspaceLink` — and
   * PATCH has never taken a workspace. Both now name this route. That drift is the reason to look at
   * what a move actually is before adding a key to a body:
   *
   *   IT IS NOT AN EDIT OF ONE ROW. It carries the record's links, its whole change log, its ledger
   *   rows and its arrangement, and it may have to carry OTHER RECORDS. `PATCH` merges fields and
   *   answers with `dataPatch`, `ifVersion` and a completeness report; none of that is the question
   *   here, and a body that meant "rename this" or "restructure the project boundary" depending on
   *   one key is the kind of overloaded request an agent gets wrong once and expensively.
   *
   *   IT NEEDS A REFUSAL PATCH CANNOT GIVE. When something else has to move, this answers 409 with
   *   every record, the relationship that forces each one, and the exact request that carries them.
   *   The caller confirms by naming them in `also` — so a move of several records is always a move
   *   somebody read the list of first. Nothing is dragged silently and no link is ever deleted to
   *   make a move possible; `DELETE /api/links/:id` is the other way out and the refusal says so.
   *
   * `dryRun: true` returns the same report and writes nothing, the shape POST /api/sessions/discover
   * already uses, so the whole consequence can be read before any move — including a move that needs
   * no companion and would otherwise just happen.
   *
   * The workspace HEADER is the source and the body is the destination. The record must be in the
   * project this request is working in, exactly as a delete must be: you move a record out of the
   * project you are looking at.
   */
  app.post(
    // THE PATH IS THE SHARED CONSTANT, because the notes on `unassigned` and `general` name this
    // route from it (problem JwtgCLiccj7N).
    THE_PATH_THAT_MOVES_A_RECORD,
    {
      config: {
        operation: 'record.move',
        reach: 'remote',
        note:
          'Move a record into another project: {"to":"<workspace id>"}, plus {"also":[…]} naming every other ' +
          'record that has to come with it and {"dryRun":true} to see the whole consequence without making it. ' +
          'The x-mole-office-workspace header says which project the record is in now; `to` says where it goes. A ' +
          'link may not cross a project boundary, so moving one end moves the other unless the other is already ' +
          'at the destination — and so does a pipeline and its blocks, which are joined by the pipeline\'s own ' +
          'blockIds rather than by a link. When anything besides the named record has to move, the request is ' +
          'REFUSED with 409 naming every record, the relationship that forces it, and the request that carries ' +
          'them; nothing is dragged in silently and no link is ever deleted to make a move possible. A SESSION ' +
          'IS NEVER CARRIED, whatever joins it: session attribution is historical provenance rather than project ' +
          'ownership, so a session moves only when it is itself the record being moved, `also` will not take one, ' +
          'and a record linked to a session it does not sit with is refused rather than dragging the run across. ' +
          'Change rows keep naming the session that wrote them wherever they land — asked from the project they ' +
          'are in, that id says which project the session is filed in — and `sessionNote` counts the rows each ' +
          'move leaves in that state. It carries ' +
          'the record\'s links, its change rows, its ledger rows and its arrangement in one transaction, writes ' +
          'one change row per record moved, and answers with every number. Refusals: 404 for an id this project ' +
          'does not hold or a workspace that does not exist, 403 for an agent moving a human-only kind, 409 for ' +
          'unconfirmed companions, for a title already taken in the destination, and for a link that would still ' +
          'cross. A secretary\'s duties are asked who takes them away from the project they leave, and the whole ' +
          'duties guard in the project they go to, with the same refusals as a delete and a write. Moving a record ' +
          'to the project it is already in writes nothing and says so.',
      },
    },
    async (req): Promise<MoveReport> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const body = parse(moveBody, req.body, 'The request body is not usable:')
      const actor = actorAndWordsForARecordWrite(req, body.warrant, id)
      return moveRecordToWorkspace(
        id,
        workspaceId,
        {
          to: body.to,
          ...(body.also === undefined ? {} : { also: body.also }),
          ...(body.dryRun === undefined ? {} : { dryRun: body.dryRun }),
        },
        actor,
      )
    },
  )

  /**
   * Soft delete: the record stays, marked deleted, so links to it show as broken.
   *
   * IT USED TO ANSWER `{"ok":true}` AND NOTHING ELSE, in a server where every other write says what
   * it did — the create names the fields still missing, the patch names the paths that moved, the
   * discharge says whether the promise had already been kept. Three things about a soft delete are
   * worth saying and none of them were said: that the record is kept and can be brought back, which
   * pages now draw a broken link because of this request, and whether this call wrote anything at
   * all. Deleting the same record twice was two identical `{"ok":true}`s.
   *
   * `ok` stays, so nothing reading it breaks. The rest is what it always should have carried.
   */
  app.delete('/records/:id', route('record.remove', 'remote'), async (req): Promise<DeleteResult & { ok: true }> => {
    const body = parse(onlyAWarrant('DELETE /api/records/:id'), req.body, 'The request body is not usable:')
    parse(noQuery('DELETE /api/records/:id'), req.query, 'The query string is not usable:')

    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const actor = actorAndWordsForARecordWrite(req, body?.warrant, id)
    // In this project, or a 404 naming the project it is really in.
    //
    // THIS IS THE ROUTE THE DEFECT WAS MEASURED ON. GET refused a cross-project id and DELETE on the
    // same id with the same header answered 200 and really deleted the record, its own reply carrying
    // the other project's name. See the file header.
    recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
    return { ok: true, ...deleteRecord(id, actor) }
  })

  /**
   * Undo a soft delete. The report comes back with it: a record that was incomplete when it was
   * deleted is still incomplete when it comes back, and the caller who just restored it is
   * exactly who needs to know that before deciding it is finished.
   */
  app.post('/records/:id/restore', route('record.restore', 'remote'), async (req): Promise<RecordReply> => {
    const body = parse(onlyAWarrant('POST /api/records/:id/restore'), req.body, 'The request body is not usable:')
    parse(noQuery('POST /api/records/:id/restore'), req.query, 'The query string is not usable:')

    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    const actor = actorAndWordsForARecordWrite(req, body?.warrant, id)

    // restoreRecord in lib/records.ts writes to the row without checking it exists first, so
    // the check is here: without it an unknown id would answer 200 with a null record, which
    // reads as success and is a lie.
    const existing = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))

    // THE HUMAN-ONLY CHECK COMES BEFORE THE NO-OP SHORTCUT, and the order is the whole point.
    //
    // It used to come after. `restoreRecord` in lib/records.ts carries the guard, but the early
    // return below reached it first, so an agent asking to restore a decision that was NOT deleted
    // was answered 200 with the record — "fine" instead of "that is not yours to touch". The row
    // was unchanged either way, so nothing was corrupted; what was wrong was the ANSWER. An agent
    // learns what it may do from what it is refused, and a 200 here teaches it that restoring
    // decisions is allowed. It would then be surprised only on the one call that mattered, against
    // a decision a person had deliberately removed.
    //
    // The check itself is `assertMayWrite` in lib/records/may-write.ts, not a copy of the rule written out
    // here: the wording of the refusal and the list of human-only kinds have exactly one home, and
    // a route that restated either would be the two-places-that-must-agree defect this codebase
    // keeps finding. This line only fixes WHEN it is asked, not WHAT it asks.
    //
    // Found by black-boxing the route, not by reading it. The guard is present in lib/ and the
    // route does call it, so neither file looked wrong on its own.
    assertMayWrite(existing.kind, 'restore', actor, id)

    // Restoring something that was never deleted changes nothing. Returning it as-is avoids
    // writing a history entry claiming a deletion was undone when there was no deletion.
    if (!existing.deletedAt) return { ...recordReply(existing, theMessageReader(actorFrom(req)), incompletenessOf(existing)), nothingWritten: nothingWrittenSentence({ kind: 'not-deleted' }) }

    const restored = restoreRecord(id, actor)
    return recordReply(restored, theMessageReader(actorFrom(req)), incompletenessOf(restored))
  })

  // ============================================================ what this record used to hold
  //
  // ---------------------------------------------------------------------------------------
  // WHY THESE ARE FOUR ROUTES AND NOT A KEY ON `GET /api/records/:id`
  // ---------------------------------------------------------------------------------------
  //
  // Because a record's whole history on every read is a whole history on every read. `GET
  // /api/records/:id` already carries the record, its links and its change log, and that reply is
  // what every page in the product is built from; adding every revision's stored content to it would
  // put kilobytes of old copies behind a page that wants the current one. The history is asked for
  // when somebody wants it.
  //
  // NO GIT WORDS REACH A READER, and that is the owner's rule from 18 August 2026 rather than a
  // style preference. Not commit, not checkout, not HEAD, not branch. A person sees what this looked
  // like before, what changed, and put this back. There is no branching, no merging and no rebasing
  // to name in the first place: a restore writes the old content FORWARD as a new revision, and
  // nothing in this ledger is ever removed or rewritten.

  /**
   * Every revision of one record, newest first, each with what changed from the one before it.
   *
   * The list is CUT AT A LIMIT and says so, with the total beside it. `GET /api/records/:id` serves
   * a record's whole change log with no limit and no flag saying whether anything was left out,
   * which is a known defect and is deliberately not copied here. Nothing is unreachable because of
   * the cut: `seq` is 1-based and gapless, so anything left out is addressable by number.
   */
  /**
   * WHAT IS STILL OPEN AROUND THIS RECORD — the answer a fresh agent gets by standing somewhere.
   *
   * The same reading as `GET /api/open-loops`, with this record as the place you are standing:
   * `openLoopsFor` in src/server/lib/openloops.ts, one reader with three callers. The record's own
   * page draws this, so the page and this reply cannot disagree about what is still open.
   *
   * It follows `GET /api/plans/:id/context`: facts going out, nothing written, no advice.
   */
  /**
   * THE RECORDS AND LINKS ONE RECORD PAGE DRAWS. `recordsAround` in lib/records.ts says which, and why
   * each one. The page used to read every record and every link in the project to draw one record.
   */
  app.get('/records/:id/around', route('record.around', 'remote', AROUND_NOTE), async (req): Promise<RecordAround> => {
    const workspaceId = workspaceOf(req)
    const { id } = parse(idParams, req.params, 'The URL is not usable:')
    // A MESSAGE THIS READER MAY NOT READ IS REFUSED, AND NONE IS LISTED AROUND ANOTHER RECORD:
    // no such message is in `records`, and no link naming one is in `links`.
    const reader = theMessageReader(actorFrom(req))
    // In this project, or a 404 naming the project it is really in. A deleted record is still
    // answered, because its page is still drawn, with the Restore press on it.
    const around = recordsAround(recordInWorkspace(id, workspaceId, reader))
    const hidden = theMessagesHiddenFrom(reader, around.links.flatMap((link) => [link.fromId, link.toId]))
    return {
      ...around,
      // AND A RUN'S HONOUR READING GIVES NONE OF THEM AS EVIDENCE.
      records: recordsWithTheHonourThisReaderMaySee(onlyTheMessagesThisReaderMayRead(reader, around.records), reader),
      links: around.links.filter((link) => !hidden.has(link.fromId) && !hidden.has(link.toId)),
    }
  })

  /** WHAT A RECORD PICKER OFFERS, asked for by a record page only while it is being edited. */
  app.get(
    '/records/title-options',
    route('record.title-options', 'remote', TITLE_OPTIONS_NOTE),
    async (req): Promise<{ options: TitleOption[] }> => ({
      options: recordTitleOptions(workspaceOf(req), theMessageReader(actorFrom(req))),
    }),
  )

  app.get(
    '/records/:id/context',
    route('record.context', 'remote', CONTEXT_NOTE),
    async (req): Promise<OpenLoops & { decisionsAboutThis: DecisionsAbout; secondLevel?: SecondLevelHeld }> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      // In this project, or a 404 naming the project it is really in.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const q = parse(contextQuery, req.query, 'That is not a way to ask what is still open here:')
      const open = openLoopsFor({
        workspaceId,
        anchorId: id,
        reader: theMessageReader(actorFrom(req)),
        ...(q.reach === undefined ? {} : { reach: q.reach }),
        ...(q.rung === undefined ? {} : { rung: q.rung }),
      })
      // WHAT WAS SETTLED HERE, BESIDE WHAT IS STILL OPEN. Criterion P37. It is a second reading and
      // not a seventh loop kind: a decision is settled by definition, and `LOOP_KINDS` is what
      // somebody still has to finish. Putting it here rather than in a route of its own is what
      // makes an agent standing on a module meet it without having to know to ask.
      // EACH DECISION'S BASIS IS ONE LEVEL DOWN: given when asked, and named when held back.
      const asked = q.secondLevel === 'show'
      const decided = decisionsAbout({ workspaceId, recordId: id, withBasis: asked })
      return {
        ...open,
        decisionsAboutThis: decided,
        ...(asked || decided.decisions.length === 0
          ? {}
          : { secondLevel: { held: ["each decision's basis"], ask: `GET /api/records/${id}/context?secondLevel=show` } }),
      }
    },
  )

  /**
   * WHAT IS RELATED TO A MODULE OR A PIPELINE, AT EVERY DEPTH (src/server/lib/related.ts). The module's and the
   * pipeline's pages read their decisions, reports and checklists here. The context door above stays the record's own
   * reading: a decision about a sub-module is in this answer and not in that one.
   */
  app.get(
    '/records/:id/related',
    route('record.related', 'remote', RELATED_NOTE),
    async (req): Promise<RelatedAnswer & { secondLevel?: SecondLevelHeld }> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      // In this project, or a 404 naming the project it is really in.
      const scope = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      if (scope.deletedAt !== null) throw new PanelError('No live record has that id.', 404)
      if (!(RELATED_SCOPE_KINDS as readonly string[]).includes(scope.kind)) {
        throw new PanelError(
          `What is related is read for a module or a pipeline, and this record is ${withArticle(kindWord(scope.kind).text)}.`,
          400,
        )
      }
      const q = parse(relatedQuery, req.query, 'That is not a way to ask what is related here:')
      const asked = q.secondLevel === 'show'
      const answer = relatedTo(scope, q.kind, { limit: q.limit ?? RELATED_PAGE_MOST, offset: q.offset ?? 0, withBasis: asked })
      return {
        ...answer,
        ...(asked || q.kind !== 'decisions' || answer.rows.length === 0
          ? {}
          : { secondLevel: { held: ["each decision's basis"], ask: `GET /api/records/${id}/related?kind=decisions&secondLevel=show` } }),
      }
    },
  )

  /**
   * WHAT WOULD BE DRAWN, AT A WIDTH YOU NAME, AND WHAT WAS REFUSED THERE.
   *
   * THIS IS THE OWNER'S FIRST ACCEPTANCE TEST AND IT NEEDS NO BROWSER: state a preference the
   * layout must refuse, and see it refused for a stated reason. A composition storing `9 to 1` for
   * writing beside a picture comes back here with the picture held at the smallest size it is worth
   * looking at, one `unhonoured` entry naming that part, what it asked for, and why it was not
   * given.
   *
   * ALL THREE PARAMETERS ARE REQUIRED AND NONE IS GUESSED. A width, a gap and a root font size are
   * facts about a screen, and this server has never seen one. A default width here would answer
   * confidently about a screen nobody has, which is the silent substitution this product bans.
   *
   * IT WRITES NOTHING AND STORES NOTHING. The answer is worked out from the stored blocks on every
   * call, by the same pure functions the browser will draw from.
   */
  app.get(
    '/records/:id/layout',
    {
      config: {
        operation: 'record.layout',
        reach: 'remote',
        note:
          'What the layout would do with the proportions this report asked for, at a width you name. One entry ' +
          'per composition, and a composition is either a `beside` block — parts seen beside each other — or a ' +
          '`columns` block, a comparison whose columns are all worth the same. Both are drawn by one mechanism, ' +
          'so both are reported here. `partsAre` says which: `regions` means each part has its own region id ' +
          'and can be pointed at; `columns` means the parts are columns of a comparison, which are not regions ' +
          'and cannot be pointed at, so the id given for one is its stored path. Each entry carries every part ' +
          'with the share it asked for and the share it is worth, `exactAboveRem` (wider than this, every part ' +
          'is drawn at exactly what it asked for), `stackBelowRem` (narrower than this, the parts are drawn one ' +
          'under another), `boxPx` (how wide the box THIS composition is drawn in is), `across` (what each part ' +
          'is drawn at in pixels, or null when they are one under another), `honoured`, `unhonoured` — each ' +
          'entry naming the part, what it asked for and why it was not given, in words — and one plain sentence ' +
          'saying what happens. EVERY COMPOSITION IS RESOLVED AGAINST ITS OWN BOX, not against the width of the ' +
          'report: a composition nested inside a part of another composition is answered about that part\'s ' +
          'drawn width, which is what the browser draws it in. A composition inside a `grid` block is the one ' +
          'case nothing here works out — a grid wraps its cells at a width only a browser knows — and it comes ' +
          'back with `boxPx: null` and no `across`, `honoured` or `unhonoured` at all, which is a different ' +
          'answer from "the parts are one under another". `width`, `gutter`, `rem` and `read` are ALL REQUIRED ' +
          'and are in pixels: the width of the box the report is drawn in, the gap between parts, the reader\'s ' +
          'root font size, and how wide the `narrow` reading measure comes out. None of them has a default, ' +
          'because a width is a fact about a screen and this server has never seen one; leaving one out is a ' +
          '400 naming it. The two thresholds are in rem rather than pixels for the same reason, and the gaps ' +
          'are not counted in them. A share is a PREFERENCE the layout may adapt and never a command, so a ' +
          'lopsided one is stored and then reported here as adapted rather than refused at the write door. ' +
          'HONOURED MEANS THE DRAWN RESULT IS WHAT WAS ASKED FOR, and it means that for a share and for a ' +
          'reading measure alike; anything else is in `unhonoured` with the reason, including a measure the ' +
          'column was too narrow for to bind. A stated `measure` — how wide the writing inside one part reads — ' +
          'is reported through the same two lists, and a measure entry says `measure` in its hint so it cannot ' +
          'be read as a share. IT ANSWERS ABOUT ONE READER AND `reader` SAYS WHICH, one of ' +
          `${READERS.join(', ')}, required and with no default. A \`beside\` block keeps only the parts holding ` +
          'a block that reader is shown, so the same report is a different arrangement depending on who is ' +
          'looking, and `notShownToThisReader` names every part left out. `besideEachOther` is false when fewer ' +
          'than two parts are left: there is then no row, so `chosenBy`, `parts`, `exactAboveRem`, ' +
          '`stackBelowRem` and `gaps` are ABSENT rather than describing an arrangement nobody draws, ' +
          '`drawnAcrossTheWholeBox` names what is drawn in their place, and the share the report asked for is ' +
          'in `unhonoured` with the reason. A comparison is never filtered — every column is drawn whoever is ' +
          'reading — so for one of those `notShownToThisReader` is empty and `besideEachOther` is always true. ' +
          '`measures` is the SECOND list and is ' +
          'about blocks rather than parts: every block that wrote a `measure` of its own, with `columnPx` (how ' +
          'wide the column it stands in is drawn), `drawnPx` (how wide the writing in it comes out) and ' +
          '`because` (why the writing does not read at what was asked, or null when it does). `columnPx` is ' +
          'null, and `drawnPx` and `because` are ABSENT rather than null, for a block inside a `grid` block and ' +
          'nothing else, because how wide a grid divides its width is not worked out here and a guess would ' +
          'look like a measurement. A block this reader is not shown is not in the list at all, because it is ' +
          'not drawn and there is no width at which its writing reads. It writes nothing.',
      },
    },
    async (req): Promise<{ compositions: CompositionDrawn[]; measures: MeasureDrawn[] }> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      // In this project, or a 404 naming the project it is really in. See the file header.
      const record = recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const q = parse(layoutQuery, req.query, 'That is not a way to ask what would be drawn:')
      return {
        compositions: compositionsAt(record, q.width, q.gutter, q.rem, q.read, q.reader),
        // A MEASURE WRITTEN ON A BLOCK RATHER THAN ON A PART, which is the ordinary way to write
        // one: most reports hold no composition at all. It is a second list rather than a field on
        // the first, because these blocks are not in a composition and there is no composition to
        // hang them on.
        measures: measuresAt(record, q.width, q.gutter, q.rem, q.read, q.reader),
      }
    },
  )

  app.get(
    '/records/:id/revisions',
    {
      config: {
        operation: 'revision.history',
        reach: 'remote',
        note:
          'What this record used to hold, one entry per write, newest first. Each entry carries `seq` (1-based, ' +
          'gapless, so the one before it always has an answer), `contentHash` — the same token a read of the ' +
          'record hands back as `version` — who wrote it, when, any note, `warrant` — the person\'s own words the ' +
          'write was made on, beside `who`, and null for an ordinary write that stood on nobody\'s words — and ' +
          '`changed`: every field path that ' +
          'moved between it and the revision before it, with what each went from and to. `changed` is null on the ' +
          'oldest entry, because there is nothing earlier to compare with, which is not the same as nothing having ' +
          'changed. An entry whose `op` is `baseline` was written by a migration and is NOT the record as it was ' +
          'created: what these records held before the ledger was built was never stored anywhere, and the note ' +
          'on the row says so. The list is cut at ' +
          `${REVISIONS_LISTED} entries and answers with \`count\` and \`truncated\` so you can see what was left ` +
          'out; every one of those is reachable at GET /api/records/:id/revisions/<seq>. This is a read and ' +
          'writes nothing.',
      },
    },
    async (req): Promise<RevisionListing> => {
      const workspaceId = workspaceOf(req)
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      // In this project, or a 404 naming the project it is really in. See the file header.
      const reader = theMessageReader(actorFrom(req))
      recordInWorkspace(id, workspaceId, reader)
      const listing = listRevisions(id)
      // WHAT CHANGED IN A RUN'S HONOUR READING NAMES NO MESSAGE THE CALLER MAY NOT READ.
      return {
        ...listing,
        revisions: listing.revisions.map((one) =>
          one.changed === null ? one : { ...one, changed: differencesWithTheHonourThisReaderMaySee(one.changed, reader) },
        ),
      }
    },
  )

  /**
   * One revision, whole, as the record was.
   *
   * It carries only what a revision stores. `createdAt`, `updatedAt`, `ownerId` and `origin` are not
   * kept per revision, so they are not served: filling them from the record's row today would be
   * presenting a value from now as a value from then.
   */
  app.get(
    '/records/:id/revisions/:seq',
    {
      config: {
        operation: 'revision.read',
        reach: 'remote',
        note:
          'One revision of a record, whole: its kind, its title, its summary, its `data` and its soft-delete ' +
          'stamp, exactly as they stood, with who wrote it and — when it was written on the person\'s own quoted ' +
          'words — the `warrant` those words are kept in. Revisions are numbered from 1, 1 being the oldest, ' +
          'and a number this record has no revision for is a 404 saying how many it has. It carries ONLY what a ' +
          'revision stores — when the record was created, who owns it, how it entered the corpus and which ' +
          'project it was in are not kept per revision, so they are absent rather than filled in from today, ' +
          'which would be serving a value from now as a value from then. `contentHash` is the same token a read ' +
          'of the record hands back as `version`.',
      },
    },
    async (req): Promise<OneRevision> => {
      const workspaceId = workspaceOf(req)
      const { id, seq } = parse(revisionParams, req.params, 'The URL is not usable:')
      const reader = theMessageReader(actorFrom(req))
      recordInWorkspace(id, workspaceId, reader)
      const revision = getRevision(id, seq)
      // A RUN'S HONOUR READING AS IT STOOD NAMES NO MESSAGE THE CALLER MAY NOT READ.
      return { ...revision, content: recordsWithTheHonourThisReaderMaySee([revision.content], reader)[0]! }
    },
  )

  /** What is different between two revisions of one record, as field paths with before and after. */
  app.get(
    '/records/:id/revisions/:seq/compare/:otherSeq',
    {
      config: {
        operation: 'revision.compare',
        reach: 'remote',
        note:
          'What is different between two revisions of one record: a list of field paths, each with what it was ' +
          'and what it became. `before` is the FIRST number in the URL and `after` is the second, in the order ' +
          'you asked — comparing backwards is a real question ("what would putting revision 4 back undo?") and ' +
          'the two are never silently swapped. A path inside `data` is written the way the change log writes it, ' +
          'so `data.parts[#mount].items[#mount-1].state` names the same thing in both places; `#` means the ' +
          'element with that id, never an index. An empty `differences` means the two really hold the same ' +
          'content, which can happen even when their content hashes differ: the hash is over a plain ' +
          'JSON.stringify, so key order inside `data` is part of it. This is a read and writes nothing.',
      },
    },
    async (req): Promise<RevisionComparison> => {
      const workspaceId = workspaceOf(req)
      const { id, seq, otherSeq } = parse(compareParams, req.params, 'The URL is not usable:')
      const reader = theMessageReader(actorFrom(req))
      recordInWorkspace(id, workspaceId, reader)
      const comparison = compareRevisions(id, seq, otherSeq)
      // A DIFFERENCE IN A RUN'S HONOUR READING NAMES NO MESSAGE THE CALLER MAY NOT READ.
      return { ...comparison, differences: differencesWithTheHonourThisReaderMaySee(comparison.differences, reader) }
    },
  )

  /**
   * PUT BACK what the record held at one revision, by writing that content forward as a new one.
   *
   * IT GOES THROUGH `patchRecord`, WHICH IS WHAT AN ORDINARY EDIT GOES THROUGH. Not around it. The
   * validation, the human-only gate, the change log and the new revision all happen because this IS
   * an ordinary patch — so an agent asking to restore a `decision` is refused with the same sentence,
   * out of the same line of code, as an agent asking to patch one. There is no pre-check here
   * restating that rule, deliberately: a permission rule written down twice is the worst instance of
   * this codebase's recurring defect, and `assertMayWrite` on the record-restore route above exists
   * only because that route has an early return which would otherwise answer before the guard.
   *
   * ONE QUESTION IS ASKED IN `restoreRevision` AND NOT IN `patchRecord`: whether the version would
   * move a field only the office writes. The office's own writers write those fields through
   * `patchRecord`, so the refusal cannot live there. It is the same function the PATCH route asks.
   */
  app.post(
    '/records/:id/revisions/:seq/restore',
    {
      config: {
        operation: 'revision.restore',
        reach: 'remote',
        note:
          'Put back what this record held at one revision. The old content is written FORWARD as a NEW revision: ' +
          'nothing is removed, nothing is rewritten, and the number of revisions only ever goes up. Body is ' +
          'optional and takes {"note":"…"} saying why — it is stored on the new revision beside the sentence ' +
          'naming which revision was put back — and {"warrant":{…}}. Words naming the record are read as for a change. ' +
          '{"ifVersion":"…"} makes the whole restore refuse with a 409 ' +
          'if anybody has written since your own read. It is an ordinary patch underneath, so everything an ' +
          'ordinary patch is refused for refuses this too: an agent restoring a `decision` gets the same 403, in ' +
          'the same words, as an agent patching one; a request that sends no actor headers gets the same 403 ' +
          'again, because a governance act needs a person who said so; content the kind no longer accepts is ' +
          'refused rather than stored; and an earlier order that leaves out a block the pipeline holds now is ' +
          'refused, because leaving out a block does not say whether the caller meant to remove it. A version that would add, change or ' +
          'drop needsNoCheck or endedWithItsMergeEntry is refused with a 403 before anything is written, as a ' +
          'whole-data PATCH is, because only the office writes those two fields. The reply says which revision ' +
          'was put back, what number the new one has, how many revisions were written, every field that moved, ' +
          'what the record still wants, and every block title that moved with a pipeline\'s title. A RESTORE THAT ' +
          'CHANGES NOTHING WRITES NOTHING: no revision, no change row, and the record does not move to the top of ' +
          'the recently-changed lists — `newSeq` is null and the reply says so. TWO THINGS IT DOES NOT PUT BACK, ' +
          'each because it has its own verb and each reported when it applies: whether the record is deleted ' +
          '(DELETE /api/records/:id and POST /api/records/:id/restore), and which project it is in ' +
          '(POST /api/records/:id/workspace). Restoring across a KIND change takes two writes, because a kind may ' +
          'not be sent with data, so it writes two revisions and the reply says so.',
      },
    },
    async (req): Promise<RestoredRevision> => {
      const workspaceId = workspaceOf(req)
      const { id, seq } = parse(revisionParams, req.params, 'The URL is not usable:')
      const body = parse(restoreRevisionBody, req.body, 'The request body is not usable:')
      // A RESTORE IS A RECORD WRITE, SO IT ASKS FOR THE RUN-KEY BINDING TOO: `patchRecord` reads it to write the
      // reminder, and a run key putting back another run of its agent must keep that reminder and its one line.
      const actor = actorAndWordsForARecordWrite(req, body?.warrant, id, { runKeyFor: true })
      // In this project, or a 404 naming the project it is really in. See the file header.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      // A RESTORE CHANGES A RUN'S DATA AS A PATCH DOES, so it is asked who may change the run (lib/records.ts) too.
      return throughTheRecordDoor(id, () => restoreRevision(id, seq, actor, body?.note, body?.ifVersion))
    },
  )

  /**
   * TAKE BACK AN ACT AN AGENT MADE ON YOUR OWN WORDS, OR UNDER A PERIOD YOU GRANTED. One press, and the trail keeps
   * both halves.
   *
   * The other half of the warrant, and of the period (problem yW5Qt7TgM1lE, wave 13n's round 28). An agent may act on
   * what you said, or for you while a period you granted holds; this is where you say it was not what you meant. The
   * act's own revision is untouched and your words or your grant are still on it — what changes is that the record is
   * put back and a NEW revision names the act it took back.
   */
  app.post(
    '/records/:id/revisions/:seq/revoke',
    {
      config: {
        operation: 'act.revoke',
        // KEPT HERE, WITH ONE CALLER FROM ELSEWHERE. Revoking is reserved to the person, and they may make it
        // from a paired computer with their own key over an encrypted door, as they may set their office
        // keys. `assertMayRevokeAnAct` refuses every other arrival from
        // another machine, and a take-back made from there is said on their devices.
        reach: 'local',
        keptHere: {
          because: 'reserved-to-the-owner',
          act: 'Taking back an agent\'s act done on your own words or under your grant',
          thePersonMayFromAnotherComputer: true,
        },
        note:
          'Take back an act an agent made on your own quoted words, or made under a period you granted. THE ' +
          'PERSON ONLY, and the guard is the one every other governance act asks: an agent gets a 403, a request ' +
          'that named nobody gets a 403, and so does one from another machine. `seq` is the version the act is: ' +
          'GET /api/records/<id> names an act on your words under `onThePersonsWords`, and an act under a period is listed ' +
          'with its record and `seq` among that period\'s acts on the agent\'s card (GET /api/participants/agent/<handle>). ' +
          'WHAT IT UNDOES: a promotion has its decision retracted, so the fork is open again ' +
          'and back on your list; every other act has the record put back to what it held at the version before ' +
          'it. WHAT IT KEEPS: everything. The act\'s revision stays exactly as it was, your words or your grant are ' +
          'still on it, its change rows are still in the log, and a retracted decision is kept whole and can be ' +
          'restored. The undo is a NEW revision carrying `revokesSeq`, so the record can say both that this was done on ' +
          'your words or under your period, and that you took it back. Refusals: 404 for a version nothing holds, ' +
          '400 for a version that was an ordinary write, made neither on your words nor under a period you granted, ' +
          'and 409 when it was already revoked, naming when. Takes no body.',
      },
    },
    async (req): Promise<RevokedAct & { onThePersonsWords: ActOnTheirWords[] }> => {
      // ASKED BEFORE THE URL IS READ, so a request carrying a key this route does not read is told
      // about that key rather than about whichever part of the URL it also got wrong. A caller that
      // believes a body means something here would otherwise fix the URL and send it again.
      takesNoInput(
        req,
        'POST /api/records/:id/revisions/:seq/revoke',
        'which act to take back is the record and the version in the URL, and there is nothing else to say: ' +
          'the undo is what the act did, backwards',
      )
      const actor = actorForARecordWrite(req)
      const workspaceId = workspaceOf(req)
      const { id, seq } = parse(revisionParams, req.params, 'The URL is not usable:')
      // In this project, or a 404 naming the project it is really in. See the file header.
      recordInWorkspace(id, workspaceId, theMessageReader(actorFrom(req)))
      const revoked = revokeAnActOnTheirWords(id, seq, actor)
      sayItWasDoneFromAnotherComputer(req, `An act on record ${id}, version ${String(seq)}, was taken back`)
      // THE ACTS AS THEY STAND AFTERWARDS, so the page that pressed this does not have to ask again
      // and cannot draw the act as still standing for one render.
      return { ...revoked, onThePersonsWords: actsOnTheirWords(id) }
    },
  )
}
