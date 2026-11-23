// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CREATING A RECORD: `createRecordWithReport`, `createRecord`, the shape of the answer, and what only they call.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. records.ts still calls `createRecordWithReport` and `createRecord` itself, so it imports those two
 * names from here.
 *
 * WHAT MOVED is every top-level declaration that only the create path calls, found by call graph and not by line
 * number. WHAT STAYED IN records.ts is every helper that another operation calls too, such as `bindSessionName`,
 * `theRecordsAlreadyCalled` and `checkGate`. Thirty-six declarations there gained the export
 * word for the move, because the code here calls them.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER. That is safe for the same reason as records/anchors.ts: every reference
 * this file makes to records.ts is inside a function body, so nothing of records.ts is read while it is still being
 * evaluated. records/reading.ts and records/territory.ts do not import this file, so their names are imported from
 * them directly.
 */
import { KNOWLEDGE_WORKSPACE, isKnowledgeKind } from '@shared/knowledge/constants.ts'
import { KNOWLEDGE_WORDS } from '@shared/words/en-wave-13u.ts'
import { refuseOrdinaryKnowledgeWrite } from '../../knowledge/guard.ts'
import { refuseModulePartChanges } from '../module-requirements.ts'
import { MESSAGE_QUOTE_POSITIONS_INVALID } from '@shared/refusal-codes.ts'
import { refuseANewRunWhileAStarterChangeWaits } from '../agent-starter.ts'
import { CASTING_ROLL, ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL } from '@shared/casting-roll.ts'
import { ENDED_RUN_LOOK_FIELD, ONLY_THE_OFFICE_WRITES_THE_LOOK_MARK } from '@shared/ended-run-resources.ts'
import { HOW_THE_ROUND_ENDED, ONLY_THE_OFFICE_WRITES_HOW_THE_ROUND_ENDED } from '@shared/how-the-round-ended.ts'
import { NEXT_ROUND, ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND } from '@shared/next-round.ts'
import {
  CUT_ASKED,
  IMAGES_GIVEN,
  WORKER_PLACE,
  ONLY_THE_OFFICE_WRITES_THE_WORKER_PLACE,
  WORKER_PACKAGE,
  ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED,
  ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN,
  ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE,
  ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS,
  WORKER_RUNS,
} from '@shared/worker-runs.ts'
import { refuseTheSealOverAFault } from '../before-the-seal.ts'
import { refuseTheHeadsInACreate, type AHeadRead } from '../a-runs-own-commits.ts'
import { officeIsWritingSeal, runSubmitsWork, sealFinishedRun } from '../sealed-tip.ts'
import { aRunSaysItIsFinished } from '@shared/releasing.ts'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { anOfficeId } from '../ids.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import { mainSuiteFixSchema } from '@shared/main-suite-fix.ts'
import { kindWord } from '@shared/words.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { whyTheAgentCannotReceive } from '@shared/cannot-receive.ts'
import { THE_PERSON } from '@shared/person.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from '../gate-counts.ts'
import { db, sqlite } from '../../db/client.ts'
import { PanelError } from '../panel-error.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { onlyChecking } from '../only-checking.ts'
import { links, records, STORED_FIELDS } from '../../db/schema.ts'
import { validateRecordData, type Incompleteness } from '../validate.ts'
import { canonicalise } from '../summary.ts'
import { FILING_HEAD, type ForkSettler, type MoveActor } from '@shared/kinds.ts'
import { GATE_KINDS, gateLabel, type Gate, type GateKind } from '@shared/work.ts'
import {
  LINK_TYPES,
  readOrigin,
  type RecordOrigin,
  type LinkType,
  type PanelRecord,
  type ProvedHolder,
  type RecordKind,
} from '@shared/types.ts'
import { checkAnnotationContext, checkMessageLead, checkMessageQuotes, checkMessageTarget } from '../targets.ts'
import { whetherAgentsMayInject } from '../inject-setting.ts'
import {
  answersSomebodyHere,
  aNewMessageAsToldTo,
  thePartiesOf,
  onlyTheMessagesThisReaderMayRead,
  refuseAMessageThisReaderMayNotRead,
  type AMessageReader,
  theMessageReader,
  keepTheDeliveryRowsInStep,
  whatANewMessageChanges,
  refsOfRecipients,
  theAgentAChoiceNames,
  whyAnUnregisteredWriterIsRefused,
  whyThisAgentCannotReceiveAMessage,
  theCannotReceiveStateOfAGreyWord,
  whyThisInjectIsRefused,
  whyTheAddressingIsRefused,
} from '../messages.ts'
import { refFrom } from '../message-pool-at-or-after.ts'
import { NOTHING_WAS_SENT } from '@shared/message-refusal-words.ts'
import { whyTheGroupAddressingIsRefused } from '../../db/why-the-group-addressing-is-refused.ts'
import { theReadingsForOneMessage, theRoutingOfOneAddressee } from '../superiors.ts'
import { theNameOf } from '@shared/participant-name.ts'
import { aNewCheckpointLetterAsItIsWritten } from '../deadletters.ts'
import { aStartersLetterToAnEndedWorker } from '../worker-delivery/letters.ts'
import { whenStored } from '../../db/told-when-stored.ts'
import { answeringOfTheAgentsTheseRunsServeMayHaveChanged } from '../answering-told.ts'
import type { GreyPresenceWord } from '../presence.ts'
import {
  theAgentWorkerRunAWriteCameFrom,
  whyThisAgentIsRetired,
  whyThisRunMayFileNoMore,
} from '../worker.ts'
import { theAgentARunServes } from '../the-agent-a-run-serves.ts'
import { getWorkspace } from '../../db/get-workspace.ts'
import { EVERY_PROJECT } from '@shared/which-projects.ts'
import { MESSAGE_CENTRE, isAProjectOnAList } from '@shared/workspaces.ts'
import { readTheMarkedParts, THE_INTENT_MARK_IS_THE_PERSONS, THE_MARKED_PARTS_ARE_THE_PERSONS } from '@shared/intent-mark.ts'
import { THE_LABEL_IS_THE_PERSONS } from '@shared/message-label.ts'
import {
  ONLY_THE_OFFICE_FOLDS_A_LINE,
  leadOfRecord,
  whyQuotePositionsAreInvalid,
  targetOfRecord,
  theCouldNotTellLine,
  whyAsksThePersonIsRefused,
  type NotRoutedAddressee,
  type RoutedAddressee,
} from '@shared/messages.ts'
import { asAMessageStoresIt, whyARunsMachineIsNotKnown, type WrittenFrom } from '../machines.ts'
import { whatThisDecisionReplaces } from '../replaced-decisions.ts'
import { assertTheGovernedPlacesAreReal } from '../assert-the-governed-places-are-real.ts'
import { assertTheDecisionNamesWhatItGoverns, whatTheWriteNames, type WhatTheWriteNames } from '../what-a-record-names.ts'
import {
  checkTheDecisionBasis,
  checkTheFlowSteps,
  checkTheRetiredMark,
  checkWhomTheFlowIsFor,
} from '../flow-reasons.ts'
import { HANDBOOK_KIND } from '@shared/handbooks.ts'
import { checkAHandbookWrite } from '../handbooks.ts'
import { announce } from '../events.ts'
import { contextKey, recordNamedByTarget, type Context } from '@shared/targets.ts'
import { assertNothingResolvedOnCreate } from '../assert-nothing-resolved-on-create.ts'
import { checkWorkDomainIds } from '../check-work-domain-ids.ts'
import { WORK_DOMAIN_KIND } from '@shared/work-domain-kind.ts'
import { assertMayRevokeARegulation } from '../regulations.ts'
import { REGULATION_KIND } from '@shared/regulation.ts'
import { assertMayConfirmAGoal, theAgentMarkAsStored } from '../goals.ts'
import { checkTheToolsetReferences, TOOL_CATEGORY_KIND } from '../toolset.ts'
import { TOOL_KIND } from '@shared/tool-kind.ts'
import { checkTheCardWords } from '../check-the-card-words.ts'
import { readTheAddedCardsAgainWhenStored } from '../read-the-added-cards-again-when-stored.ts'
import { ROLE_CARD_WORDS_KIND } from '../../db/the-words-records-of-each-card.ts'
import { GOAL_KIND } from '@shared/goal.ts'
import { aPackagesLineGoesToItsSupervisor } from '../delegation.ts'
import { refuseAFileTheDoorWouldNotServe } from '../messages/the-file-a-message-may-carry.ts'
import { AGENT_KIND } from '../inbox.ts'
import {
  keepTheAgentRegistryInStep,
  type RegisteredAgent,
} from '../participants.ts'
import { participantForActor } from '../participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../the-agent-an-arriving-reference-names.ts'
import { agentForRecord } from '../../db/agent-for-record.ts'
import { readParticipant } from '../../db/read-participant.ts'
import { participantWord, theMoleOfficeTest } from '@shared/participants.ts'
import { NOTEBOOK_KIND, THE_NOTEBOOK_DOOR } from '@shared/notebook.ts'
import { INCIDENT_KIND } from '@shared/incident.ts'
import { theRunAWriteCameFrom } from '../../db/the-run-a-write-came-from.ts'
import { fileTheFlowRunOf, type FlowRunFiled } from '../flow-runs.ts'
import { starterAgentOfARun } from '../merge-queue.ts'
import { theAnswerDoorIsWriting } from '../answer-door.ts'
import { ANSWERS_FIELD } from '@shared/answers.ts'
import { SETTLEMENTS_ON_THE_CHECK, THE_DOOR_OF, TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS } from '../check-field-doors.ts'
import { anOfficeOnlyFieldAWholeDataWouldMove } from '../office-only-run-fields.ts'
import { whyThisWriteMayNotMoveHeldByItsFiler } from '../held-by-its-filer.ts'
import { ONLY_THE_USE_DOOR_WRITES_TOOL_USES, TOOL_USES_FIELD } from '@shared/toolset.ts'
import { DRAFT_KIND, ONLY_THE_SEND_DOOR_WRITES_SENT, WRITTEN_ONLY_BY_THE_SEND_DOOR } from '@shared/drafts.ts'
import {
  refuseAnAgentsMarkThatTheWordsAreNotThePersons,
  tellTheWriterOfTheNote,
  waitsForThePerson,
} from '../the-persons-own-words.ts'
import { theKeyReminderFor } from '../the-key-reminder-for.ts'
import { theWordsOfAMessage, type AKeyReminder } from '@shared/message-keys.ts'
import { NOTICE_RULES_KIND } from '../notice-rules-door.ts'
import { SESSION_KIND } from '../../db/agent-identity.ts'
import { settleShortForms } from '../zoom.ts'
import { refuseANoticeKindNotAllowed } from '../notices.ts'
import { checkTheSecretaryDuties } from '../grant/secretary-duties.ts'
import { SECRETARY_DUTIES_KIND } from '@shared/secretary-duties-record.ts'
import { checkTheDepartment, DEPARTMENT_KIND } from '../grant/departments.ts'
import { checkTheParticipantsNamed } from '../participant-fields.ts'
import { writeTheNextDayOfADailyObligation } from '../daily-obligations.ts'
import { getRecord, listRecords } from './reading.ts'
import { checkAndNormalizeTerritory, type TerritoryWriteCheck } from './territory.ts'
import { clockStamp } from '@shared/time.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import {
  type Actor,
  aFinishedRunsKeyAskedForMore,
  type AlreadyLinkedThere,
  assertABundleShiftIsAMove,
  assertARunCarriesNoOtherAgentsConversation,
  assertMainSuiteFixController,
  assertMayPassTheQuestionOn,
  assertMayPinAFork,
  assertMayShelve,
  assertMayWrite,
  assertMayWriteACountOfWhatIsWaiting,
  assertMayWriteAnExportList,
  assertMayWriteASandbox,
  assertMayWriteServed,
  assertNobodyTypesWhoRecordedIt,
  assertOptionsForThemAreTheirMove,
  assertThisCallerMayFileASessionFor,
  assertThisCallerMayNameThisParent,
  bindSessionName,
  blockMustBeFiledInAPipeline,
  checkAgentHandle,
  checkAgentNotes,
  checkAgentRole,
  checkAgentStartFolder,
  checkBlockIds,
  checkGate,
  checkNobodyIsChangingBroadcastTimes,
  checkNobodyIsWritingTheirOwnCard,
  checkNobodyIsWritingTheirOwnRaise,
  checkPlannedStateIds,
  checkTheNotebook,
  checkTheNotebookEntries,
  checkWhoMayFileAnIncident,
  chosenRecipientAsStored,
  type CreatedLink,
  createLink,
  type LinkEndRef,
  type LinkRequest,
  liveRecordByTitle,
  nameIsSpokenFor,
  nearDuplicateTitles,
  ONLY_THE_ANSWER_DOOR_WRITES_ANSWERS,
  ONLY_THE_CRITICISM_DOOR_WRITES_INDEPENDENT,
  onlyItsDoorWritesThisVerdict,
  PROBLEM_KIND,
  PROPOSAL_KIND,
  refuseAChineseHalfNotFromThisEnglish,
  refuseAGenericUpgradeNotice,
  refuseAnOutlineChangeWithoutTheirDecision,
  refuseAQuestionThatNamesNothing,
  saveRevision,
  type SessionBinding,
  type SessionRef,
  type SimilarTitle,
  tellThePagesWhenARequestWaitsForThePerson,
  THE_DEAD_LETTER_SWEEP,
  theCallersAgentRow,
  theClaimedSenderIsTheWriter,
  theConversationsARunNames,
  theParentADataGives,
  theRecordsAlreadyCalled,
  theRunsAgentByItsCanonicalId,
  validateMainSuiteFixNoticeRecipients,
  validateMainSuiteFixReceipt,
  WHO_SETTLES_IT,
  whoRecordedIt,
  WHOSE_MOVE,
} from '../records.ts'
import { logChange } from '../log-change.ts'
import { MIGRATION_ROUTE, resolveSessionRef } from '../resolve-session-ref.ts'
import { named } from '@shared/named.ts'
import { toRecord } from '../to-record.ts'
import { isJsonObject } from '../../db/the-decision-names-this-fork.ts'
import { newestFirstBy } from '@shared/newest-first-by.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'

/** How many records one target's list names before it says how many more there are. */
export const ALREADY_LINKED_SHOWN = 20

/**
 * THE RECORDS ALREADY LINKED TO THE MODULE OR BLOCK A NEW RECORD WAS JUST LINKED TO.
 *
 * Two agents filed one defect twice in an hour, and the second copy was found only by reading a
 * block's link list back. A title check (`nearDuplicateTitles`) cannot see one fact written in
 * different words, and cannot see it across kinds at all. What the two copies did share is the
 * piece of work they were about. So a create that links the new record to a module or a block is
 * answered with the other live records linked to that module or block, and the author can look
 * before it adds one more.
 *
 * WHAT IT LEAVES OUT. The new record itself. Session records, because a run is filed under the
 * work it did and is not a statement about it, and a module can hold hundreds of them. Deleted
 * records. Messages this reader may not read. A link in either direction
 * counts, because `blocks` points one way and `about` the other, and both say the two are about one
 * thing.
 *
 * An empty answer means no other record is linked there. Nothing is refused and nothing is changed.
 */
export function theRecordsAlreadyLinkedThere(
  made: readonly CreatedLink[],
  newId: string,
  reader: AMessageReader | undefined,
): AlreadyLinkedThere[] {
  const targets = new Map<string, LinkEndRef>()
  for (const link of made) {
    const other = link.newRecordIs === 'from' ? link.to : link.from
    if (other.kind === 'module' || other.kind === BLOCK_KIND) targets.set(other.id, other)
  }
  const answer: AlreadyLinkedThere[] = []
  for (const target of targets.values()) {
    const rows = db
      .select({ fromId: links.fromId, toId: links.toId })
      .from(links)
      .where(or(eq(links.fromId, target.id), eq(links.toId, target.id)))
      .all()
    const ids = [...new Set(rows.map((r) => (r.fromId === target.id ? r.toId : r.fromId)))].filter(
      (id) => id !== newId && id !== target.id,
    )
    if (ids.length === 0) continue
    // IN PIECES (src/server/db/in-pieces.ts): `ids` is every record linked to one module or block, which grows with the
    // office; the joined rows are sorted newest first again, and only then cut to ALREADY_LINKED_SHOWN and counted.
    const live = newestFirstBy(
      readInPieces(ids, (piece) =>
        db
          .select({ id: records.id, kind: records.kind, title: records.title, createdAt: records.createdAt })
          .from(records)
          .where(and(inArray(records.id, piece), isNull(records.deletedAt), ne(records.kind, 'session')))
          .orderBy(desc(records.createdAt))
          .all(),
      ),
      (r) => r.createdAt,
    ).map((r) => ({ id: r.id, kind: r.kind as RecordKind, title: r.title }))
    const readable = reader === undefined ? live : onlyTheMessagesThisReaderMayRead(reader, live)
    if (readable.length === 0) continue
    answer.push({ target, records: readable.slice(0, ALREADY_LINKED_SHOWN), count: readable.length })
  }
  return answer
}

/** One request, resolved against the database and ready to write. Never handed to a caller. */
interface PlannedLink {
  /** Which entry of the request this came from, so a refusal can name it. */
  index: number
  type: LinkType
  other: PanelRecord
  newRecordIs: 'from' | 'to'
  gate: Gate | null
}

/** How a refusal names one entry: its position, and what the caller actually sent. */
function whichLink(index: number, request: LinkRequest): string {
  return `links[${index}] (${JSON.stringify(request)})`
}

/**
 * The sentence every refusal on this path ends with, written once.
 *
 * A caller told only "no such record" cannot tell whether the RECORD it was filing survived, and
 * would have to go and look — which is the round trip this whole route exists to remove. So every
 * refusal says what is not there, in the same words, and the words are true because the transaction
 * makes them true.
 */
function nothingWasStored(newTitle: string, asked: number): string {
  return (
    `Nothing was stored: not the record "${newTitle}", and not ` +
    `${asked === 1 ? 'the relationship' : `any of the ${asked} relationships`} it was filed with.`
  )
}

/**
 * A gate as it arrived on the wire, narrowed to the shape `checkGate` judges.
 *
 * THE SHAPE IS READ HERE AND THE RULES ARE STILL IN `checkGate`, and the split is on purpose: this
 * says what a gate IS (an object, a `kind`, an optional `upTo`, and no other key), and that says
 * what a gate MAY BE (which kinds exist, that a partial one must say how far, that a hard one must
 * not). Declaring the wire shape a second time as a zod object beside the route would be two
 * statements of one thing with nothing making them agree, which is this codebase's own recurring
 * defect; there is one reader and both routes' rules are the same function underneath it.
 */
function readGateRequest(value: unknown): Gate {
  if (!isJsonObject(value)) {
    throw new PanelError(
      `\`gate\` must be an object, for example {"kind":"hard"} or ` +
        `{"kind":"partial","upTo":"<a checklist item id, a block id, or a stage in words>"}, and it is ` +
        `${JSON.stringify(value)}.`,
    )
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== 'kind' && key !== 'upTo')
  if (unknownKeys.length > 0) {
    throw new PanelError(
      `a gate holds \`kind\` and, for a partial one, \`upTo\`. It does not hold ` +
        `${unknownKeys.map((k) => JSON.stringify(k)).join(', ')}, and a key nothing reads would be stored and ` +
        `never shown.`,
    )
  }
  const kind = value['kind']
  if (typeof kind !== 'string') {
    throw new PanelError(
      `\`gate.kind\` must be one of ${GATE_KINDS.join(', ')}, and it is ${JSON.stringify(kind)}.`,
    )
  }
  const upTo = value['upTo']
  if (upTo !== undefined && (typeof upTo !== 'string' || upTo.trim() === '')) {
    throw new PanelError(
      `\`gate.upTo\` is the furthest stage the blocked record may reach, written as text — a ` +
        `checklist item id, a block id, or a stage in words — and it is ${JSON.stringify(upTo)}.`,
    )
  }
  return upTo === undefined ? { kind: kind as GateKind } : { kind: kind as GateKind, upTo: upTo.trim() }
}

/**
 * Turn the requested relationships into what would be written, or refuse the whole create.
 *
 * READS ONLY. Every refusal it can make is made before the record row exists, so the commonest
 * mistake — a title that names nothing — costs the caller one request and leaves the database
 * exactly as it was. The transaction around the write is what covers the rest.
 */
function planLinks(
  requests: readonly LinkRequest[],
  newTitle: string,
  workspaceId: string,
  // WHO IS ASKING, when the door knows it. No end may be a message this reader
  // may not read: the answer names each end with its title.
  reader: AMessageReader | undefined,
): PlannedLink[] {
  const planned: PlannedLink[] = []
  const seen = new Map<string, number>()

  requests.forEach((request, index) => {
    const where = whichLink(index, request)
    const ends = (['toId', 'toTitle', 'fromId', 'fromTitle'] as const).filter(
      (key) => request[key] !== undefined,
    )
    if (ends.length !== 1) {
      throw new PanelError(
        `${where} names ${ends.length === 0 ? 'no end' : `${ends.length} ends (${ends.join(', ')})`}, and one ` +
          `relationship on a create names exactly ONE: the record being filed is the other end, and it has no ` +
          `id yet. Send {"toId"} or {"toTitle"} when "${newTitle}" is the record the link starts FROM, or ` +
          `{"fromId"} or {"fromTitle"} when the other record is. ${nothingWasStored(newTitle, requests.length)}`,
      )
    }

    const type = request.type ?? 'relates_to'
    if (!(type in LINK_TYPES)) {
      throw new PanelError(
        `${where} asks for the link type "${type}", which is not one of: ${Object.keys(LINK_TYPES).join(', ')}. ` +
          `GET /api/kinds serves them under \`linkTypes\`, with what each one reads as at both ends. ` +
          nothingWasStored(newTitle, requests.length),
      )
    }

    const newRecordIs = request.toId !== undefined || request.toTitle !== undefined ? 'from' : 'to'
    const byId = request.toId ?? request.fromId
    const byTitle = request.toTitle ?? request.fromTitle

    let other: PanelRecord
    if (byId !== undefined) {
      const noRecordHasThatId = (): PanelError =>
        new PanelError(
          `${where} names the id "${byId}", and no record has that id. A link needs a record at each end, and ` +
            `Mole Office will not invent one to satisfy a link. ${nothingWasStored(newTitle, requests.length)}`,
          404,
        )
      // A MESSAGE THIS READER MAY NOT READ IS ANSWERED AS AN ID THAT NAMES NO RECORD, in the same words.
      if (reader !== undefined) refuseAMessageThisReaderMayNotRead(reader, byId, noRecordHasThatId)
      const found = getRecord(byId)
      if (found === null) throw noRecordHasThatId()
      other = found
    } else if (byTitle !== undefined) {
      try {
        other = liveRecordByTitle(
          byTitle,
          (deleted) =>
            `send this entry as {"type":"${type}","${newRecordIs === 'from' ? 'toId' : 'fromId'}":"${deleted.id}"}.`,
          workspaceId,
          reader,
        )
      } catch (err) {
        // Re-thrown with the entry named in front of it, and the status kept. The REFUSAL is
        // `liveRecordByTitle`'s, because a name that resolves to nothing means the same thing here
        // as it does on POST /api/links; what this adds is which of the requested relationships it
        // is about, which that function cannot know. Anything that is not a PanelError is a fault
        // in this server rather than in the request, and is left exactly as it is.
        if (!(err instanceof PanelError)) throw err
        throw new PanelError(
          `${where}: ${err.message} ${nothingWasStored(newTitle, requests.length)}`,
          err.status,
        )
      }
    } else {
      throw new Error('unreachable: exactly one end survived the check above')
    }

    // The same relationship twice in one request. Making a link is idempotent — createLink hands
    // back the row that is already there — so the second would be answered as though it had
    // written something, and the reply would say two links were made where one row exists. That is
    // a small false success, and small is not a reason to ship one.
    const key = `${type}|${newRecordIs}|${other.id}`
    const already = seen.get(key)
    if (already !== undefined) {
      throw new PanelError(
        `${where} asks for the same relationship as links[${already}] — "${type}" with ${other.kind} ` +
          `"${other.title}" at the same end. A link is one row, so the second would write nothing and be ` +
          `reported as though it had. Send it once. ${nothingWasStored(newTitle, requests.length)}`,
      )
    }
    seen.set(key, index)

    // Both the shape and the rules, decorated in one place with which entry they are about and
    // with what was not stored. `checkGate` is the same function POST /api/links calls, so a gate
    // that route refuses cannot arrive through this one instead.
    let gate: Gate | null = null
    try {
      if (request.gate !== undefined) {
        gate = readGateRequest(request.gate)
        checkGate(gate, type)
      }
    } catch (err) {
      if (!(err instanceof PanelError)) throw err
      throw new PanelError(
        `${where}: ${err.message} ${nothingWasStored(newTitle, requests.length)}`,
        err.status,
      )
    }

    planned.push({ index, type, other, newRecordIs, gate })
  })

  return planned
}

/** What one made link now reads as, in the wording LINK_TYPES publishes. One sentence per link. */
function describeLink(from: LinkEndRef, to: LinkEndRef, type: LinkType, gate: Gate | null): string {
  const labels = LINK_TYPES[type]
  const said = `"${from.title}" ${labels.forward} "${to.title}"`
  if (gate === null) return `${said}.`
  return `${said}, and "${to.title}" shows it as ${labels.reverse} "${from.title}" — ${gateLabel(gate)}.`
}

/** The whole set in one sentence, for a caller that reads the first line rather than the array. */
function describeLinks(made: readonly CreatedLink[]): string {
  return (
    `${made.length} relationship${made.length === 1 ? '' : 's'} ${made.length === 1 ? 'was' : 'were'} written ` +
    `with the record, in the same transaction: ${made.map((link) => link.note).join(' ')} ` +
    `Every title above is what the id really resolved to. Add more with POST /api/links, and remove one with ` +
    `DELETE /api/links/<the id above>.`
  )
}

/** A new record, and what it is still missing. An empty `incomplete` means it is complete. */
export interface CreateResult {
  record: PanelRecord
  incomplete: Incompleteness[]
  /**
   * THE WRITER ALREADY SENT THIS PRESS: the first message's id and the sentence saying so. `record` is that message
   * and nothing was written. Absent on every other write.
   */
  alreadySent?: { id: string; because: string }
  /**
   * A FIELD MOLE OFFICE FILLED IN THAT THE CALLER DID NOT SEND, and where the value came from.
   *
   * Absent on every write that filled nothing in, which is nearly all of them. It exists so that
   * writing a field for somebody is never silent: the caller is told which field, what went in it,
   * and on whose authority, in the answer to their own request. Criterion P11 is the first user —
   * `parentAttachment` on the first run of an agent whose registration recorded the run that started
   * it.
   */
  moleOfficeWrote?: { field: string; value: string; because: string }
  /**
   * THE FLOW RUN THE OFFICE FILED BESIDE A SESSION RECORD, or why it could not. Present on every session
   * filed, absent on every other kind. Under M1 of the office flow, a flow run that could not be written
   * never stops the session, and this is where the caller is told.
   */
  flowRun?: FlowRunFiled
  /** PRESENT WHEN A MESSAGE'S WORDS SEEM TO HOLD A KEY. The message is stored as written (lib/message-keys.ts). */
  keyReminder?: AKeyReminder
  /**
   * Live records whose titles are very close to this one. Absent when there are none.
   *
   * Absent rather than empty, like `sessionBinding` beside it: an empty list next to a 201 reads as
   * "nothing to say", which is true, and a report that says nothing on every ordinary write is how
   * a caller learns to skip the reports that do say something.
   */
  similar?: SimilarTitle[]
  /**
   * Live records in this project whose title is EXACTLY this one, oldest first. Absent when none.
   *
   * ---------------------------------------------------------------------------------------
   * WHAT THIS IS, AND WHY IT IS NOT A REFUSAL
   * ---------------------------------------------------------------------------------------
   *
   * Until 17 August 2026 an exact repeat was refused, and the owner overturned that: **ID is
   * identity. Title is presentation. Titles may repeat.** A record with the same name may well be
   * the thing the caller meant, and it may equally be a different piece of work that happens to be
   * called the same — nobody but the caller can tell, so the record is written and this says what
   * else answers to the name. A screen can ask "there is already work called this — did you mean
   * it?" and take no for an answer.
   *
   * `similar` beside it is the NEAR miss, measured with a shingle score. This is the exact match,
   * asked with `=`. They are two fields because they are two facts, and a reader acts on them
   * differently: an exact repeat is usually a person writing something again, and a near miss is
   * usually two people describing one thing in different words.
   *
   * LIVE ROWS ONLY. A deleted record still holds its title for ever, and offering one as something
   * to link to would be offering a link that shows as broken the moment it is made.
   *
   * ABSENT RATHER THAN EMPTY, like `similar` and `sessionBinding`: an empty list beside a 201 reads
   * as "nothing to say", and a report that says nothing on every ordinary write is how a caller
   * learns to skip the reports that do say something.
   */
  sameTitle?: { id: string; kind: RecordKind; title: string }[]
  /**
   * WHAT A DECISION OR A REPORT NAMES, said back: the module a whole-project decision should name instead, and to whom
   * each new nothingFits entry was sent, or why nobody (src/server/lib/what-a-record-names.ts). It reminds and refuses
   * nothing. Absent when there is nothing to say.
   */
  whatItNames?: WhatTheWriteNames
  /**
   * Present when filing this record bound a run name to it, or when it could not.
   *
   * Binding is the ordinary case: an agent works under a name for a while, then files the session
   * it has been working as, and the rows written before the record existed are repointed at it.
   * Reported rather than done quietly, because it moves rows the request never named.
   *
   * The refusal is reported too -- `alreadyBoundTo` set, `repointed` 0 -- because a name that
   * already means another session is the case where the caller's history ends up somewhere it did
   * not intend, and this reply is the only thing that can say so.
   *
   * ABSENT for a reference that is a session record's ID. That reference is exact, nothing is
   * claimed, and the rows are already filed where the caller said. See WHAT x-mole-office-SESSION MEANS
   * at the top of this file for why the three cases are answered differently.
   */
  sessionBinding?: SessionBinding
  /**
   * The relationships written with the record, resolved at both ends. Absent when none was asked
   * for, present and complete when any was — there is no half of this list.
   *
   * A caller that typed a TITLE finds out here which record the name really meant, which is the
   * whole reason the ends are resolved rather than echoed back.
   */
  links?: CreatedLink[]
  /** The same news in one sentence, present exactly when `links` is. */
  linksNote?: string
  /**
   * The other records already linked to a module or block this record was linked to on create.
   * Absent when there are none, like `similar`. See `theRecordsAlreadyLinkedThere`.
   */
  alreadyLinkedThere?: AlreadyLinkedThere[]
  /**
   * WHERE A MESSAGE WENT WHEN ITS ADDRESSEE COULD NOT BE REACHED.
   *
   * THE ADDRESSEE IS NEVER REPLACED AND THE WORDS ARE NEVER REWRITTEN. A retired agent, or one
   * nothing is answering as, keeps the letter in `data.to` and can read it if it comes back; the
   * office ALSO gives it to the first reachable participant up the addressee's chain of starters,
   * ending at the secretary and then the owner. This is the record of that copy: one entry per
   * addressee that could not be reached, carrying the addressee, the reading's own sentence, the one
   * participant chosen (`null` when that is the sender), the rungs passed over and the finished line.
   *
   * A SEND THAT ROUTED ANSWERS 201, EXCEPT A SEND TO A RETIRED ADDRESSEE OR TO A REGISTERED AGENT NOTHING
   * HOLDS, WHICH ANSWERS 409 — `routedARetiredAddressee` and `routedToAnUnheldAddressee` below report those two.
   */
  routed?: RoutedAddressee[]
  /**
   * TRUE WHEN ONE OF THE ROUTED ADDRESSEES WAS RETIRED. The route answers 409 for it, as it does for
   * `routedToAnUnheldAddressee`; every other routed send answers 201. An agent's send never sets
   * it, because an agent's send to a retired agent is refused before anything is written (M110).
   * Every other routing to a retired addressee sets it, a person's send among them; only a send
   * through the route is answered, and the office's own lines are not written through it.
   */
  routedARetiredAddressee?: boolean
  /**
   * THE NAMES OF THE RETIRED ADDRESSEES, in the order the message named them. Present exactly when
   * `routedARetiredAddressee` is, and read by the route to build the 409's short reason with the one
   * name reader the routed lines use. Criterion M113a.
   */
  routedRetiredNames?: string[]
  /**
   * TRUE WHEN ONE OF THE ROUTED ADDRESSEES WAS REGISTERED, NOT RETIRED, AND NOTHING HELD IT: no session held its handle
   * and no run was going for it. The route answers 409 for it, as it does for a retired addressee, and
   * `routedUnheldReason` says the state in the presence dot's own word for a person or agent sending.
   *
   * IT IS SET ONLY FOR A MESSAGE WHOSE ROUTING ADDED AN ENTRY. When the reach carries no word it stays unset, and the
   * send answers 201 with the routing, as it did. A handle a session holds carries none: the waiter holding it takes the
   * message when it comes.
   */
  routedToAnUnheldAddressee?: boolean
  /**
   * THE REASON SENTENCES FOR THOSE ADDRESSEES, in the order the message named them, joined with one space. Present
   * exactly when `routedToAnUnheldAddressee` is.
   */
  routedUnheldReason?: string
  /**
   * THE ADDRESSEES MOLE OFFICE COULD NOT TELL ABOUT, and so did not route.
   * A process of each one's session is alive and its transcript could not be read. No copy went up
   * its chain of starters; this is how the sender is told, one entry per addressee, each with the
   * reading's own sentence and the plain line from `theCouldNotTellLine`. Absent when there is none.
   */
  notRouted?: NotRoutedAddressee[]
}

/**
 * Create a record, and say what it still wants.
 *
 * `createRecord` below is this function with the report dropped; it is what most callers use.
 * The report exists because creating a stub is now a normal, supported thing to do — a module
 * filed the minute work starts, with the context and the checklist written later — and a 201
 * that says nothing about the two empty fields is the same silence as the 201 that used to
 * accept `{"contxet":"typo"}`. What is missing is stored NOWHERE: this list is recomputed from
 * the specs on every read.
 */
/**
 * THE MARK OF WHERE A MESSAGE WAS WRITTEN, as it is stored: `data.writtenIn`. Each key only when
 * it was named. `named` is what a request named; when a writer inside the office names nothing, the project it writes the
 * message for is the mark, and the message centre itself is never one.
 */
function theMarkOfWhereAMessageWasWritten(
  named: { project: string | null; page: string | null } | undefined,
  project: string,
): { project?: string; page?: string } {
  const where = named === undefined ? { project, page: null } : named
  const mark: { project?: string; page?: string } = {}
  if (where.project !== null && where.project !== MESSAGE_CENTRE) mark.project = where.project
  if (where.page !== null && where.page.trim() !== '') mark.page = where.page.trim()
  return mark
}

/** A message may say it is about a project only when that project exists and is one a person can open. */
function refuseAnAboutProjectThatIsNotAProject(project: string): void {
  if (getWorkspace(project) !== null && isAProjectOnAList(project)) return
  throw new PanelError(
    `data.aboutProject names "${project}", and no project has that id. Nothing was written. Name a project from ` +
      'GET /api/workspaces, or leave the key out.',
    400,
  )
}

/** Original creates reserve a receipt even when the ordinary record was edited or deleted later. */
function theOriginalMainSuiteFixProblem(receiptId: string, workspaceId: string): string | null {
  const row = sqlite.prepare(
    "SELECT record_id FROM revisions WHERE workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'problem' " +
    "AND json_extract(data, '$.mainSuiteFix.receipt.recordId') = ? ORDER BY rowid LIMIT 1",
  ).get(workspaceId, receiptId) as { record_id: string } | undefined
  return row?.record_id ?? null
}

function validateMainSuiteFixCreate(data: Record<string, unknown>, actor: Actor, workspaceId: string): void {
  const value = mainSuiteFixSchema.parse(data['mainSuiteFix'])
  assertMainSuiteFixController(actor, value.claim, workspaceId)
  validateMainSuiteFixReceipt(value, workspaceId)
  const original = theOriginalMainSuiteFixProblem(value.receipt.recordId, workspaceId)
  if (original !== null) throw new PanelError(`Problem ${original} already reserves original receipt ${value.receipt.recordId}. Read that original problem; nothing was written.`, 409)
  const claimed = sqlite.prepare("SELECT record_id FROM revisions WHERE workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'problem' AND json_extract(data, '$.mainSuiteFix.claim.run') = ? ORDER BY rowid LIMIT 1").get(workspaceId, value.claim.run) as { record_id:string } | undefined
  if (claimed !== undefined) throw new PanelError(`Problem ${claimed.record_id} already reserves this controller run's one original red receipt. Nothing was written.`, 409)
  validateMainSuiteFixNoticeRecipients(value)
  if (value.outcome !== undefined) throw new PanelError('An original mainSuiteFix problem begins pending, before an outcome. Nothing was written.', 409)
}

/**
 * THE 409'S REASON FOR ONE UNHELD ADDRESSEE: why it cannot get the letter, and nothing more. The state is the presence
 * dot's own grey word, chosen by the dot's one chooser so the reason and the dot choose by one rule, and passed through
 * the one map shared with `whatStopsAMessageTo`; the sentence is the first sentence of the one builder in
 * `@shared/cannot-receive.ts`. A handle a session holds gets no word from the reach, so it gets no reason and a send to
 * it stays 201.
 *
 * NOBODY IS NAMED TO WRITE TO INSTEAD. The builder's whole line names the person
 * first, so it would tell the sender to write to the sender. Where the letter went is the routed line's to say, and the
 * answer carries that line as its `error`.
 */
function theReasonOfAnUnheldAgent(agentId: string, word: GreyPresenceWord): string {
  const addressee = readParticipant({ kind: 'agent', id: agentId }) as RegisteredAgent | null
  return whyTheAgentCannotReceive({ agent: theNameOf(addressee, agentId), state: theCannotReceiveStateOfAGreyWord(word) }, sayInEnglish)
}

export function createRecordWithReport(input: {
  checkTerritoryBeforeWrite?: TerritoryWriteCheck
  kind: RecordKind
  title: string
  summary?: string | null
  data?: Record<string, unknown>
  /**
   * WHICH PROJECT THIS RECORD GOES IN. Required, and there is no default.
   *
   * It was `workspaceId?: string` falling through to `?? 'default'`, and POST /api/records never
   * passed one — so every record filed over HTTP landed in the default workspace whatever project
   * the agent was working on, with no way to ask for another. Making it required means a caller
   * that has not decided cannot compile, which is the only mechanism here that cannot rot.
   */
  workspaceId: string
  actor: Actor
  /**
   * Whether filing a `session` record may claim the caller's run name for it. Default true.
   *
   * True is right for the ordinary path -- POST /api/records {"kind":"session"} from an agent
   * writing under a name is that agent filing ITSELF, and binding is what makes its earlier
   * writes findable. It is turned off in lib/sessions.ts, where discovery files records for
   * sessions it found on somebody else's disk: those are not the caller, and letting a sweep
   * hand the caller's name to the first transcript it read would file a run's whole history
   * under a stranger.
   */
  bindCallerSession?: boolean
  /**
   * THIS CREATE CAME FROM THE NOTEBOOK DOORS. Criterion N2, and nothing else sets it.
   *
   * The first entry a person writes makes the notebook, and it comes through
   * POST /api/agents/<handle>/notebook/entries like every entry after it. Without this mark,
   * `checkTheNotebookEntries` refuses a create that carries entries — see `RecordPatch`, which
   * carries the same flag and the whole argument.
   */
  [THE_NOTEBOOK_DOOR]?: true
  /**
   * Set only by `addBlock` in lib/blocks.ts, which is filing a block INTO a pipeline it holds.
   *
   * It exists so that the refusal above can be unconditional everywhere else. A flag a route could
   * set would be a hole in the rule; this one is not reachable from any route, and the block routes
   * go through `addBlock` rather than round it.
   */
  insidePipeline?: boolean
  /**
   * Set only by `fileTheReply` in lib/worker.ts, which is filing what a RUN said.
   *
   * The rule below is that a message's sender is its writer, because a stored sender that is not
   * the writer is a false name in a permanent record. A run of an agent's tool is the exception
   * that proves it: the words really are that agent's, and the worker is only the thing that read
   * them off disk. So the reply names the agent as its sender AND names the run its words came out
   * of, and `whyThisReplyIsRefused` checks that the run exists, is in this project, and was serving
   * that agent. The same shape as `insidePipeline` above and for the same reason: no route can set
   * it. Its callers are lib/worker.ts and lib/turn-drafts.ts, which files a run's held words once the run has
   * ended or ten minutes have passed, after the record door checked them.
   */
  senderIsTheRun?: boolean
  /**
   * Set only by `writeASystemLine`, `writeASystemLineToOne` or `writeASystemLineToTwo` in
   * lib/groups.ts, which are filing a line MOLE OFFICE is saying.
   *
   * The same shape as `senderIsTheRun` above and for the same reason. Criterion M11 makes Mole
   * Office a participant so that the lines saying a group was opened, a member was added or two
   * claims are in conflict have a sender and are not faked as an agent's. The writer is still the
   * actor whose request caused the line, so the change log names who really wrote it; the sender is
   * Mole Office, and both are true. The opening is CHECKED rather than waived below: the sender must
   * be Mole Office and the message must be addressed to a group, to one participant, or to both
   * participants of one pair (criterion M105 widened this from "a group or both of a pair").
   */
  senderIsMoleOffice?: boolean
  /**
   * ONE OF THE CHECK'S OWN LINES ABOUT A RUN, set only by `writeAMessage` in lib/inspection.ts for the four lines the
   * check writes. The same shape as `senderIsMoleOffice` above: no route can set it. `aPackagesLineGoesToItsSupervisor`
   * in lib/delegation.ts reads it (13y round 164).
   */
  theChecksOwnLine?: true
  /** The sweep may keep its undelivered explanation. A request cannot carry this symbol. */
  [THE_DEAD_LETTER_SWEEP]?: true
  /**
   * THIS MESSAGE IS A SUMMONS: who called, how urgent and the title. Set only by `summonThePerson` in lib/summons.ts, and
   * not reachable from any route, the same shape as `senderIsMoleOffice` above. A tool that
   * takes a summons to the person another way (the mail tool) reads this mark, so a writer that could put it on its own message
   * could have the tool carry anything to the person. A `summons` a caller sends is dropped, and a patch may not set it.
   */
  summonsMark?: { who: string; urgency: string; title: string }
  /**
   * THE COMMENTS THIS MESSAGE CARRIES, by id. Set only by the review's send (`writeTheMessageTo` in lib/reviews.ts), and
   * not reachable from any route, the same shape as `summonsMark` above. The waiting list leaves out a comment a message
   * carries, and a press on the comment asks for the carrying message's run, so a writer that could put it on its own
   * message could hide a comment or start a run the press did not ask for. A `carries` a caller sends is dropped, and a
   * patch may not set it.
   */
  carries?: readonly string[]
  /**
   * Set only by `fileRanInstead` below, which is filing a fallback record ABOUT a block it holds.
   *
   * The same shape as `insidePipeline` above and for the same reason: two facts about a fallback
   * record live on its block and nowhere else — which canonical method it stands in for, and which
   * record its restriction is declared against — so one filed on its own would have neither. Not
   * reachable from any route.
   */
  throughItsBlock?: boolean
  /**
   * SET ONLY BY `fileACriticism` in lib/criticism.ts, which is writing the independent mark.
   *
   * The mark names the critic, the work's author and the moment, and the read calls it through the step.
   * A caller that could write it through the ordinary record door could make an ordinary filing read as
   * through the step, so a create carrying it is refused unless this is set. It is not reachable from any
   * route: the criticism door goes through `fileACriticism`, and no route that files an ordinary record
   * sets it.
   */
  theIndependentCriticismStep?: true
  /**
   * WHERE THIS WRITE CAME FROM: the machine, and the program the writer says it is. Criterion M63.
   *
   * Set by the route, from the request, and by nothing else. It is stamped onto a MESSAGE and
   * ignored for every other kind, because a message is somebody speaking and where somebody was
   * speaking from is part of what they said. A record is a filed fact and has a change log for who
   * made it.
   *
   * IT OVERWRITES ANYTHING THE CALLER SENT UNDER THE SAME NAME, which is the point: a message able
   * to claim it came from a machine it did not come from is worse than one that says nothing. The
   * measuring is in lib/machines.ts and the honesty about what it could not measure is there too.
   */
  writtenFrom?: WrittenFrom
  /**
   * WHERE A MESSAGE WAS WRITTEN, as the request named it: the project, or null when the request named none, and the page,
   * or null. Every message is stored in the message centre, and this is stamped on it
   * as `data.writtenIn`, replacing whatever the caller sent. Ignored for every other kind.
   *
   * Left out by the office's own writers, which name the project they write about in `workspaceId`; that project is then
   * the mark. A route that reads a request passes what the request named, so a request that named no project is not
   * marked with the `default` its header reader falls back to.
   */
  writtenIn?: { project: string | null; page: string | null }
  /**
   * How this row got here. Default `authored`, and that default is a fact rather than a guess.
   *
   * WHY A DEFAULT IS HONEST HERE, when rule 5 says absence beats a guess. `authored` means "filed as
   * a record of real work, by a person or by an agent doing that work", and that is exactly what
   * calling this function IS. Every route reaches it through an actor; nothing else writes a record.
   * The write path knows its own nature with certainty, which is the only evidence this word is ever
   * allowed to rest on — the same certainty `scripts/seed.ts` has when it says `fixture`.
   *
   * WHAT WENT WRONG WITHOUT IT. The column landed, 385 existing rows were classified by measurement,
   * and this function was not changed — so every record filed from that moment on stored NULL, which
   * a reader is told means *nobody has recorded how this got here*. That is false about a record
   * somebody had just filed through the API, and it is false in the direction that makes the mark
   * useless: a corpus where the new rows are all unclassified cannot be read for what is real.
   *
   * IT IS NOT ON THE HTTP BODY, and that is deliberate rather than an omission. A caller cannot say
   * what its own record's provenance is, because a request arriving over HTTP with an actor on it is
   * authored by definition. `fixture` is reachable only in-process, by the script that generates
   * fixture content, which is the one caller that knows something HTTP cannot express.
   */
  origin?: RecordOrigin
  /**
   * The relationships to write with the record, in ONE transaction. See LinkRequest in src/server/lib/records/link-requests.ts.
   *
   * ALL OR NOTHING: one unusable entry refuses the whole request, names which entry and why, and
   * leaves neither the record nor any part of the link set behind.
   */
  links?: readonly LinkRequest[]
  /**
   * WHO READS THE ANSWER, when a door knows it. A message this reader may not
   * read is left out of `sameTitle` and `similar`, and `links` may not name one: an end given by its id
   * is refused as an id that names no record, and an end given by its title is looked up by
   * `liveRecordByTitle` with this reader. Absent for a caller whose answer no agent reads, which then
   * sees every record, as before.
   */
  reader?: AMessageReader
  /**
   * WHETHER THIS WRITE MUST SAY WHAT IT REPLACES. Every door a decision is made through sets it,
   * and a decision that does not say, in `data.replaces`, which earlier decisions it changes or replaces is refused.
   * Left out for a write nobody asked, such as a test's fixture. See lib/replaced-decisions.ts.
   */
  mustSayWhatItReplaces?: boolean
  /** The door the write came through, in words, for that refusal. */
  door?: string
  /**
   * WHETHER THIS WRITE MUST SAY WHAT IT GOVERNS. Every door a decision is made through sets it, beside
   * `mustSayWhatItReplaces`, and a decision that names no page, no whole project and no nothingFits entry is refused.
   * Left out for a write nobody asked, such as a test's fixture. See lib/what-a-record-names.ts.
   */
  mustSayWhatItGoverns?: boolean
  /**
   * WHETHER THE ANSWER NAMES THE RECORDS ALREADY CALLED THIS, OR NEARLY: `sameTitle` and `similar`. Default true.
   * A caller passes false when nothing reads either list: no door's answer names it and nothing else keeps it. Each
   * such call says why beside it. `createRecord` passes false, because it gives back the record alone. The near list
   * reads the id, kind and title of every live record of the project: 18,799 rows on the made-up office of the live
   * counts, each time a record is written with this left true. A pipeline's block and a message are the two
   * exceptions: their writes never make the near list, whatever this says, and still make `sameTitle` when this is true.
   */
  namesWhatIsAlreadyFiled?: boolean
  /**
   * THE STARTER'S OWN KEY, set only by the record door for a run its starter files by hand and the office will mint a
   * key for (`theStartersKeyThatMintsThisRun` in api/records.ts). Only this create's change row and revision carry it;
   * its links and every other write carry nothing. See `provedHolderWritten`.
   */
  startersKey?: ProvedHolder
  /**
   * THE COMMIT THE RUN'S WORKING DIRECTORY WAS AT AS IT IS FILED, set only by the record door, which read it apart from
   * the request's thread (`theHeadReadApart` in ../a-runs-own-commits.ts). Stored as the session's `filingHead`.
   */
  filingHead?: AHeadRead
}): CreateResult {
  refuseOrdinaryKnowledgeWrite(input.kind)
  if (input.workspaceId === KNOWLEDGE_WORKSPACE && !isKnowledgeKind(input.kind)) throw new PanelError(KNOWLEDGE_WORDS.onlyDoor, 400)
  if (input.kind === 'session' && input.data && Object.hasOwn(input.data, ENDED_RUN_LOOK_FIELD)) {
    throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_LOOK_MARK, 403)
  }
  if (input.data && Object.hasOwn(input.data, HOW_THE_ROUND_ENDED)) throw new PanelError(ONLY_THE_OFFICE_WRITES_HOW_THE_ROUND_ENDED, 403)
  if (input.data && Object.hasOwn(input.data, NEXT_ROUND)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND, 403)
  if (input.data && Object.hasOwn(input.data, WORKER_RUNS)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_WORKER_RUNS, 403)
  if (input.data && Object.hasOwn(input.data, CASTING_ROLL)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_CASTING_ROLL, 403)
  if (input.data && Object.hasOwn(input.data, CUT_ASKED)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_CUT_ASKED, 403)
  if (input.data && Object.hasOwn(input.data, IMAGES_GIVEN)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_IMAGES_GIVEN, 403)
  if (input.data && Object.hasOwn(input.data, WORKER_PLACE)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_WORKER_PLACE, 403)
  if (input.data && Object.hasOwn(input.data, WORKER_PACKAGE)) throw new PanelError(ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE, 403)
  refuseTheHeadsInACreate(input.data)
  refuseAGenericUpgradeNotice(undefined, input.data)
  if (input.kind === 'sealed_tip' && !officeIsWritingSeal()) throw new PanelError('Only the finish writer creates a sealed tip.', 403)
  if (input.data && Object.hasOwn(input.data, 'sealedTip')) throw new PanelError('The office writes sealedTip when a run finishes.', 403)
  // THE INDEPENDENT MARK IS ONE THE OFFICE WRITES, and only the criticism door writes it. A criticism
  // filed through the ordinary record door carries none, so this refusal keeps the read honest: no
  // caller can file a record the read calls through the independent step.
  if (input.kind === 'criticism' && input.data && Object.hasOwn(input.data, 'independent') && input.theIndependentCriticismStep !== true) {
    throw new PanelError(ONLY_THE_CRITICISM_DOOR_WRITES_INDEPENDENT, 403)
  }
  // A DRAFT IS NEVER FILED ALREADY SENT. `sentAs` and `sentAt` are written by the send door on a draft
  // that exists, and nothing files one carrying them.
  if (input.kind === DRAFT_KIND && input.data && WRITTEN_ONLY_BY_THE_SEND_DOOR.some((key) => Object.hasOwn(input.data!, key))) {
    throw new PanelError(ONLY_THE_SEND_DOOR_WRITES_SENT, 403)
  }
  // A RUN IS NEVER FILED WITH USE LINES. A run's uses are rows in `tool_uses`, written by the use door.
  if (input.kind === 'session' && input.data && Object.hasOwn(input.data, TOOL_USES_FIELD)) {
    throw new PanelError(ONLY_THE_USE_DOOR_WRITES_TOOL_USES, 403)
  }
  // A REPORT IS NEVER FILED ALREADY ANSWERED. `answers` is written by the answer door on a report that exists, as the
  // person answers it.
  if (input.kind === 'report' && input.data && Object.hasOwn(input.data, ANSWERS_FIELD) && !theAnswerDoorIsWriting()) {
    throw new PanelError(ONLY_THE_ANSWER_DOOR_WRITES_ANSWERS, 409)
  }
  // A RUN IS NEVER FILED ALREADY RELEASED, REFUSED, CONFIRMED, SETTLED OR MARKED AS METHOD WORK: each is written by its
  // own door on a run that exists (lib/check-field-doors.ts).
  if (input.kind === 'session' && input.data) {
    for (const field of TOP_LEVEL_RUN_FIELDS_OF_THE_DOORS) {
      if (Object.hasOwn(input.data, field)) throw new PanelError(onlyItsDoorWritesThisVerdict(field), 403)
    }
    const check = input.data['theCheck']
    for (const field of SETTLEMENTS_ON_THE_CHECK) {
      if (isJsonObject(check) && Object.hasOwn(check as Record<string, unknown>, field)) {
        throw new PanelError(`Only ${THE_DOOR_OF[field]} writes theCheck.${field} on a run; a run is not filed carrying it. Nothing was written.`, 403)
      }
    }
  }
  // AND THE RUN'S CONDITIONS, criterion HB1, on the create door too. A create is never the runner's
  // write — the runner writes at the run's END, through the patch door, once the transcript holds
  // something — so `served` on a new record is by definition a hand-written value, and those come
  // only from the person or the secretary. The refusal below is the same one both doors say.
  if (input.kind === 'session' && input.data && Object.hasOwn(input.data, 'served')) {
    // A RUN BEING FILED has no stored agent to answer for it yet, so only the person and the secretary may give it served.
    assertMayWriteServed(input.actor, { recordId: '', workspaceId: input.workspaceId ?? '', data: null })
  }
  // A FINISHED RUN'S OWN KEY POSTS ONE MESSAGE, ABOUT THAT RUN'S END, AND NOTHING ELSE.
  if (input.actor.finishedRunsOwnKey !== undefined) aFinishedRunPostsOnlyItsEndMessage(input, input.actor.finishedRunsOwnKey)
  // A RUN IS NOT FILED NAMING ITS OWN SANDBOX EITHER: the same rule as on the patch door, so a run's
  // own agent cannot file a second record for itself that carries a sandbox it chose.
  if (input.kind === 'session' && input.data && Object.hasOwn(input.data, 'sandbox')) {
    assertMayWriteASandbox(input.actor, { recordId: '', workspaceId: input.workspaceId ?? '', data: input.data, stored: undefined, next: input.data['sandbox'] })
  }
  // NOR DOES IT CARRY ANOTHER AGENT'S CONVERSATION ON AN AGENT'S KEY. A run the office files in a caller's name is not
  // the caller's filing (see `bindCallerSession`), so it is not asked.
  if (input.kind === 'session' && input.data && input.bindCallerSession !== false) {
    assertARunCarriesNoOtherAgentsConversation(input.actor, theConversationsARunNames(input.data), null)
  }
  // A RUN OF AN AGENT NAMES ONLY A COMPUTER SOMEBODY ADDED. `machine` on such a run makes every reader take it as
  // elsewhere (theRowNamesAnotherMachine), so the name is checked against this computer and the owner's table.
  if (input.kind === 'session' && input.data && Object.hasOwn(input.data, 'machine') && input.data['servingAgent'] !== undefined) {
    const why = whyARunsMachineIsNotKnown(input.data['machine'])
    if (why !== null) throw new PanelError(why, 400)
  }

  const { kind, title, actor } = input
  let requests: readonly LinkRequest[] = input.links ?? []

  // WHO MAY WRITE THIS KIND, asked through `assertMayWrite` and not restated here. This used to be
  // its own copy of the rule and the copy asked only about `actor.type`, so a request that sent no
  // actor headers at all could file a decision — a governance record with nothing saying who filed
  // it. Owner decision §36: an absent header is not evidence that a person made the write.
  // THE BODY GOES WITH THE QUESTION for a decision, because since 27 August 2026 whether an agent
  // may write one depends on what it stands on rather than on who is asking. See `assertMayDecide`.
  assertMayWrite(kind, 'create', actor, title, { data: input.data })
  if (!title.trim()) throw new PanelError('A record needs a title. The title is how it is linked to.')

  // WHAT A DECISION REPLACES, read and checked once who may write it has been asked and before anything is written,
  // and one `supersedes` link for each earlier decision it names, written with the record in the same transaction.
  // lib/replaced-decisions.ts is the one reading. A link already asked for is not asked twice.
  const replaces =
    kind === DECISION_KIND
      ? whatThisDecisionReplaces({
          data: isJsonObject(input.data) ? input.data : {},
          workspaceId: input.workspaceId,
          subjectIds: (input.links ?? []).flatMap((one) => [one.toId, one.fromId].filter((id): id is string => typeof id === 'string')),
          mustSay: input.mustSayWhatItReplaces === true,
          door: input.door ?? 'POST /api/records',
        })
      : null
  requests = [
    ...(input.links ?? []),
    ...(replaces ?? [])
      .filter((earlier) => !(input.links ?? []).some((one) => one.type === 'supersedes' && one.toId === earlier))
      .map((earlier): LinkRequest => ({ type: 'supersedes', toId: earlier })),
  ]

  // AND WHO WROTE IT DOWN, WHICH THE CALLER MAY NOT SAY. Asked before the shape check, because a
  // body that tries to sign somebody else's name should hear about that rather than about field 3.
  // Every line below reads `data` and not `input.data`, so the stamped body is the one that is
  // validated, the one every kind-specific check sees and the one that is stored — a stamp applied
  // after the gate would be a value nothing had checked.
  assertNobodyTypesWhoRecordedIt(kind, input.data, null)
  // AND IS THIS FORK BEING PINNED. Nothing is stored yet, so any `pinned: true` on the way in is a
  // change from nothing — which is what the guard measures.
  if (kind === PROPOSAL_KIND) assertMayPinAFork({ data: input.data, stored: null, recordId: null }, actor)
  // AND IS THIS NOTE BORN SAYING IT IS NOT WHAT THE PERSON SAID, which only the person's press writes.
  if (kind === 'note') refuseAnAgentsMarkThatTheWordsAreNotThePersons(null, { data: input.data }, actor)
  // WHAT THE REPORT ASKED FOR, TURNED INTO THE ONE FORM THAT IS STORED. See `canonicalise` in
  // ./summary.ts: a composition's proportions may be written as `60/40`, as `"60%"` on each part or
  // as `proportions: "3:2"` on the row, and all three become whole-number shares with the author's
  // own spelling kept beside them. This is one of the two doors it is called from; the other is
  // `patchRecord`. It runs before the data gate below, so everything after it — the checks, the
  // stored row and the reply — is about the value that will actually be stored.
  const asked =
    kind === DECISION_KIND
      ? { ...(isJsonObject(input.data) ? input.data : {}), recorded_by: whoRecordedIt(actor) }
      : whatAnAgentFilingThisSaysByDefault(kind, input.data, actor)
  const data = theRunsAgentByItsCanonicalId(kind, canonicalise(kind, asked), undefined) as typeof asked
  refuseModulePartChanges({ kind: '', data: {} }, { kind, data }, actor)
  // AND WOULD IT FILE OPTIONS FOR THE PERSON MARKED AS AN AGENT'S MOVE. A record with
  // an unmade choice on it that says the next move is not theirs appears on no list they read.
  assertOptionsForThemAreTheirMove({ id: null, kind, title }, data, actor)
  const officeField = anOfficeOnlyFieldAWholeDataWouldMove({}, data ?? {})
  if (officeField !== null) throw new PanelError(officeField.refusal, 403)
  const heldByItsFiler = whyThisWriteMayNotMoveHeldByItsFiler(kind, null, (data ?? {}) as Record<string, unknown>, actor)
  if (heldByItsFiler !== null) throw new PanelError(heldByItsFiler, 403)
  // WHERE A MESSAGE WENT WHEN ITS ADDRESSEE COULD NOT BE REACHED, collected by the send reading
  // below. Declared in this file's one scope, so the send reading and the write half below speak of
  // the same list, in the order the message named its addressees. Empty on every write but a send.
  const routed: RoutedAddressee[] = []
  let routedARetiredAddressee = false
  // THE NAMES OF THE RETIRED ADDRESSEES, in the order the message named them, so the 409's short
  // reason reads the same names the routed lines do. Criterion M113a.
  const routedRetiredNames: string[] = []
  // THE REASON SENTENCES FOR THE ADDRESSEES REGISTERED, NOT RETIRED, AND NOTHING HELD, in the order the
  // message named them, and only for the ones whose routing added an entry. Joined with one space by
  // the route for the 409's short reason, after the retired addressees' reason.
  const routedUnheldReasons: string[] = []
  // THE ADDRESSEES THE OFFICE COULD NOT TELL ABOUT, collected by the same send reading, in the order
  // the message named them.
  const notRouted: NotRoutedAddressee[] = []
  // A BLOCK IS THE ONE KIND THAT CANNOT BE FILED ON ITS OWN. `addBlock` in lib/blocks.ts is the only
  // caller allowed through, and it sets `insidePipeline` because it has the pipeline in hand and is
  // about to append the new id to its order in the same transaction.
  if (kind === BLOCK_KIND && input.insidePipeline !== true) {
    throw new PanelError(blockMustBeFiledInAPipeline(title.trim()))
  }
  // AND A `ran_instead` IS THE SECOND. It says something ran instead of a step's canonical method,
  // so it is meaningless without the step: which method it stands in for and which record its
  // restriction is declared against both live on the block.
  if (kind === 'ran_instead' && input.throughItsBlock !== true) {
    throw new PanelError(fallbackMustBeFiledOnItsBlock(title.trim()))
  }

  // The data gate. It runs before the title queries because a caller with a problem it can fix
  // from the request it already has should be told about that first, and after the checks above
  // because "you may not write this kind at all" outranks "field 3 is wrong".
  //
  // It throws on anything WRONG and returns what is merely MISSING. `data` may be absent
  // entirely — that is a stub, not a failure, and it comes back reporting every required field.
  // The list is used, not discarded: it is what the create response carries. It is the same
  // answer `recordIncompleteness` gives for the row that is about to be written — the data fields
  // from the same specs over the same object, and the envelope from the summary on the request;
  // the test in tests/incomplete-api.test.ts asserts that the create response and the next GET
  // agree, so the two cannot drift apart unnoticed.
  // WHOM A FLOW IS FOR and ITS RETIRED MARK first, so their own coded refusals answer rather than the shape's own.
  if (kind === 'flow') {
    checkWhomTheFlowIsFor(data, null)
    checkTheRetiredMark(data, null)
  }
  if (kind === 'message' && isJsonObject(data)) {
    const body = typeof data['body'] === 'string' ? data['body'] : ''
    const quotes = Array.isArray(data['quotes']) ? data['quotes'] : null
    const reason = whyQuotePositionsAreInvalid(body, quotes, data['quotePositions'], data['target'])
    if (reason !== null) throw new PanelError(reason, 400, undefined, undefined, undefined, { code: MESSAGE_QUOTE_POSITIONS_INVALID, values: {} })
  }
  const incomplete = validateRecordData(kind, data, input.summary ?? null)
  if (kind === 'session' && isJsonObject(data) && Object.hasOwn(data, 'territory')) {
    checkAndNormalizeTerritory({ recordId: '', workspaceId: input.workspaceId ?? '', data }, data, actor)
  }

  // AND WHAT THE QUESTIONS IN A REPORT NAME IS THERE, asked of the database, which the shape check cannot reach: a
  // choice's `about` and a box's or a button's `to`. Asked here so the writing agent learns at once, and not the person
  // when they press. `null` because nothing is stored yet, so every name in the body is new.
  if (kind === 'report') refuseAQuestionThatNamesNothing(data, input.workspaceId, null)

  // AND DOES THIS BODY SAY HOW MANY THINGS ARE WAITING ON THE PERSON. Asked AFTER the shape check,
  // so a body that is the wrong shape is answered about its shape, and before anything is written.
  // `null` because there is no id yet — the refusal says nothing was written rather than naming a
  // record that does not exist.
  assertMayWriteACountOfWhatIsWaiting(kind, data, actor, null)

  // AND IS THIS CREATE ARRIVING WITH A PATH A QUESTION HAS SUPPOSEDLY TAKEN. Criterion P55. A record
  // filed with `confirmed_by` already on it would be a question claiming it had been passed up
  // before anybody had been asked, which is the same act as forging one afterwards; the guard is on
  // both doors for the reason the pipeline order below gives — a rule enforced on one write path is
  // not a rule. The record does not exist yet, so nothing can be with anybody: every entry is new,
  // and the guard refuses it because nobody it names could have passed on a question nobody asked.
  assertMayPassTheQuestionOn({ id: '', kind, title: title.trim(), data: {} }, data ?? null, actor)

  // AND IS THIS CREATE CLAIMING SOMETHING ALREADY LEFT THE BUILDING. A bundle arriving with an
  // `exports` entry is a handover with no handover behind it, and verification filed one
  // and got a 201 — after which the bundles page drew it as *handed over once*. Filing a bundle is
  // not exporting it, which is why the kind's own example carries no `exports` key.
  assertMayWriteAnExportList({
    kind,
    wasKind: null,
    sent: { data: data },
    before: undefined,
    after: data,
    recordId: null,
    byTheServer: false,
  })
  assertABundleShiftIsAMove({ kind, before: undefined, after: data, recordId: null })

  // A PIPELINE'S ORDER NAMES REAL BLOCKS, ON THE WAY IN AS WELL AS ON THE WAY THROUGH. The same
  // three rules `PATCH` applies, applied here, because a rule enforced on one write path is not a
  // rule: measured 2026-08-12, four ids nothing answered to were stored and reported complete, and
  // the pipeline could then never be given a block at all — `POST /api/records/:id/blocks` refuses
  // to append to an order it cannot read. `null` because there is no id yet; nothing can already
  // be held by a pipeline that does not exist, so rule 3 cannot fire against itself.
  if (kind === 'pipeline' && isJsonObject(data) && Array.isArray(data['blockIds'])) {
    checkBlockIds(null, input.workspaceId, data['blockIds'].filter((v): v is string => typeof v === 'string'))
  }
  // AND THE SAME FOR A PLANNED FUTURE'S ORDER, on the same two doors and for the same reason: a
  // rule enforced on one write path is not a rule. `null` is not needed here — nothing can already
  // hold a state for a trajectory that does not exist yet, so the one-future rule cannot fire
  // against itself; the id is the empty string, which no record answers to.
  if (kind === 'trajectory' && isJsonObject(data) && Array.isArray(data['plannedStateIds'])) {
    checkPlannedStateIds('', (data['plannedStateIds'] as unknown[]).filter((v): v is string => typeof v === 'string'))
  }

  const workspaceId = input.workspaceId
  // THE MESSAGE CENTRE HOLDS MESSAGES AND NOTHING ELSE. A request naming it as its project may
  // write a message, which goes there anyway, and nothing else.
  if (kind !== 'message' && kind !== NOTICE_RULES_KIND && workspaceId === MESSAGE_CENTRE) {
    throw new PanelError(
      `Only messages and personal notice wake rules are kept in the message centre ("${MESSAGE_CENTRE}"), and this is a ${kindWord(kind).text}. Nothing was ` +
        'written. Name the project it belongs to in x-mole-office-workspace.',
      400,
    )
  }

  // ONE NOTEBOOK PER SECRETARY, AND ONLY FOR A SECRETARY. Criterion N1. Two questions `validateData`
  // cannot answer because both are asked of the database, applied on this path as well as on the
  // patch for the reason every check around it gives: a rule enforced on one write path is not a
  // rule. `null` because there is no id yet, so nothing can be refused as its own second copy.
  if (kind === NOTEBOOK_KIND) {
    checkTheNotebook(workspaceId, data, null)
    checkTheNotebookEntries(
      data,
      null,
      input[THE_NOTEBOOK_DOOR] === true,
      isJsonObject(data) && typeof data['agentHandle'] === 'string' ? data['agentHandle'] : '<handle>',
    )
  }

  // A CATEGORY CONFIRMED BY A LIVE DECISION, A TOOL IN A LIVE CATEGORY, AND NO SLUG HELD TWICE. Asked of
  // the database, on this path as well as on the patch: a rule enforced on one write path is not a rule.
  if (kind === TOOL_KIND || kind === TOOL_CATEGORY_KIND) {
    checkTheToolsetReferences({ kind, workspaceId, data, before: null, mine: null })
  }

  // A SECRETARY'S DUTIES ARE WRITTEN BY THE PERSON, OR BY THAT SECRETARY ON THE PERSON'S DECISION.
  // On this path as well as on the patch, so POST /api/records meets the guard PUT /api/secretaries/<id>/duties does.
  if (kind === SECRETARY_DUTIES_KIND) checkTheSecretaryDuties({ workspaceId, data, before: null, mine: null, actor })
  // A DEPARTMENT IS WRITTEN BY THE PERSON, OR BY A SECRETARY ON THE PERSON'S DECISION (lib/grant/departments.ts). On this
  // path as well as on the patch, so POST /api/records meets the guard POST /api/departments does.
  if (kind === DEPARTMENT_KIND) checkTheDepartment({ workspaceId, data, before: null, mine: null, actor })

  // A FIELD THAT HOLDS A PARTICIPANT NAMES SOMEBODY A REGISTRY ROW ANSWERS TO. After the duties' guard, so its own
  // refusal answers first. On this path as well as on the patch.
  checkTheParticipantsNamed(kind, data, null)

  // A CARD'S WORDS NAME A DECLARED CARD, AND NO CARD HAS TWO. On this path as well as on the patch.
  if (kind === ROLE_CARD_WORDS_KIND) checkTheCardWords(data, null)

  // FILED BY A SECRETARY OR THE PERSON, AND NEVER WITH NO LOSS OR NO TIMELINE. Criteria I1 and I4.
  if (kind === INCIDENT_KIND) {
    checkWhoMayFileAnIncident(actor)
    checkTheIncidentHasLossAndTimeline(data)
  }
  // AND A REGULATION'S REVOCATION FIELDS ARE WRITTEN BY THE PERSON ONLY, on this path as well as on
  // the patch — a rule enforced on one write path is not a rule, and without this an agent could file
  // a regulation that arrives already revoked.
  if (kind === REGULATION_KIND) {
    assertMayRevokeARegulation({ kind, arriving: data, actor })
  }
  // AND A CHINESE HALF IS WRITTEN FROM THE ENGLISH IT IS FILED BESIDE, on this path as well as on the
  // patch. The check is `chineseNotFromThisEnglish` in @shared/office-rules.ts.
  refuseAChineseHalfNotFromThisEnglish(null, { kind, title: title.trim(), summary: input.summary ?? null, data })
  // AND A NEW CHAPTER IS FILED BY THE PERSON, OR ON THE OWNER'S DECISION, on this path as well as on the patch.
  refuseAnOutlineChangeWithoutTheirDecision(null, { kind, data }, actor)
  // AND ONLY THE PERSON CONFIRMS AN AGENT'S GOAL, on this path as well as on the patch, for the same
  // reason: without it an agent could file a goal already claiming the person had confirmed it.
  if (kind === GOAL_KIND) {
    assertMayConfirmAGoal({ kind, arriving: data, actor })
  }
  // AND A DIRECTION MAY NOT ARRIVE ON THE SHELF UNLESS THIS CALLER MAY SHELVE IT. Criterion S1, on
  // this path as well as on the patch, for the reason every check around it gives: a rule enforced
  // on one write path is not a rule. `null` for the record that does not exist yet, so any `shelved`
  // on the way in is a change from nothing.
  if (kind === 'direction') {
    assertMayShelve({ id: '', title: title.trim() }, null, data ?? null, actor)
  }

  // A NOTE LEFT ON SOMETHING POINTS AT SOMETHING THAT IS REALLY THERE, in this project, at a
  // revision the ledger really holds. Three questions `validateData` cannot answer, because it runs
  // in the browser and may not touch the database — the same case as `checkBlockIds` above, answered
  // the same way, and applied here as well as on the patch path because a rule enforced on one write
  // path is not a rule.
  // AND WHO IS WRITING IT, because one field on a context is refused by writer rather than by shape.
  // `view` says what was on a screen, and an agent has no screen — `checkView` in lib/targets.ts is
  // the whole argument. The actor is already here and attributing this write; nothing new is read.
  if (kind === 'annotation') checkAnnotationContext(data, workspaceId, actor.type)
  // A MESSAGE SAYING WHAT ON A PAGE IT IS ABOUT MEETS THE SAME THREE QUESTIONS A COMMENT DOES, and
  // it is checked with the same function. A comment is a message with a target (criterion M1), so a
  // rule that held for one and not the other would be a rule with a door around it.
  // AND WHO IT IS ADDRESSED TO REALLY EXISTS, which `validateData` cannot ask: it runs in the
  // browser and may not touch the database. A message addressed to a name nothing answers to would
  // sit in the pool for ever with a delivery mark about nobody.
  let keyReminder: AKeyReminder | null = null
  if (kind === 'message') {
    // AND ITS WRITER IS REMINDED OF A PIECE OF ITS WORDS THAT LOOKS LIKE A KEY: lib/message-keys.ts
    // says why it is stored as written and never refused.
    keyReminder = theKeyReminderFor(theWordsOfAMessage({ title: input.title, summary: input.summary, data, officeLine: input.senderIsMoleOffice === true }), actor)
    // WHERE IT WAS WRITTEN, IN WHICH PROJECT AND ON WHICH PAGE, WRITTEN BY MOLE OFFICE AND NOT BY THE WRITER.
    // The message is stored in the message centre, and this mark is what is left of the project the page
    // had open. A key the request did not name is left out, never guessed. What the caller sent under the name is replaced.
    if (isJsonObject(data)) data['writtenIn'] = theMarkOfWhereAMessageWasWritten(input.writtenIn, workspaceId)
    // AND NO MESSAGE IS WRITTEN ALREADY EDITED. The office writes `edited` when its writer changes
    // its words inside the window, keeping what it first said; a writer that could send one at birth could make a message
    // look changed, with any original it liked. What a caller sends under the name is dropped.
    if (isJsonObject(data)) delete data['edited']
    // AND THE PROJECT IT IS ABOUT, WHEN ITS WRITER SAYS ONE, IS A PROJECT THAT EXISTS: a mark naming nothing would put the
    // message on no project's pages while saying it belonged on one.
    if (isJsonObject(data) && typeof data['aboutProject'] === 'string') refuseAnAboutProjectThatIsNotAProject(data['aboutProject'])
    // WHERE IT WAS WRITTEN FROM, WRITTEN BY MOLE OFFICE AND NOT BY THE WRITER. Criterion M63. It is
    // set before every check below, so what is refused and what is stored are the same object, and
    // it replaces whatever the caller sent under the same name. A caller that could fill this in
    // could put another machine's name on its own words.
    // AN ADDRESS THE PERSON HAS NAMED IS STORED AS THEIR NAME FOR IT, with the address beside it.
    // `asAMessageStoresIt` in lib/machines.ts says why it is done here.
    if (input.writtenFrom !== undefined && isJsonObject(data)) {
      const stored = asAMessageStoresIt(input.writtenFrom)
      const from: Record<string, unknown> = { how: stored.how }
      if (stored.machine !== null) from['machine'] = stored.machine
      if (stored.address !== undefined) from['address'] = stored.address
      if (stored.program !== null) from['program'] = stored.program
      data['writtenFrom'] = from
    }
    // AND A MESSAGE A RUN WROTE SAYS SO, written by Mole Office and not by the writer, for the same
    // reason. Criterion M81: *a run started for an agent speaks as a run for that agent and the
    // reply says so*. Until now `fromRun` was written only on the reply the worker files after
    // reading a run's output, so a message the run wrote for itself — into a group it had been told
    // about, say — was indistinguishable from one the session holding the handle had written. Two
    // answers signed by one handle inside a minute is what a reader of a group met on
    // 7 September 2026. The chat draws this through `ranBy` in lib/messages.ts.
    if (isJsonObject(data)) {
      // A RUN tools/agent-worker.mjs STARTED IS A RUN HERE TOO, read by its own
      // reader so that elevation and handle holding, which ask `theRunAWriteCameFrom`, are untouched.
      const run = theRunAWriteCameFrom(actor.sessionId) ?? theAgentWorkerRunAWriteCameFrom(actor.sessionId)
      if (run !== null) {
        data['fromRun'] = run.run
        // AND A RUN THAT HAS FILED ALL IT MAY IS REFUSED HERE TOO, by the same count the worker's
        // answered door asks. A run writing straight to this door was not
        // counted, although `fromRun` above already says which run it is. The count is of stored
        // messages naming the run, so both doors spend the one allowance.
        const tooMany = whyThisRunMayFileNoMore(run.run, workspaceId)
        if (tooMany !== null) throw gateMetOnceTheWriteIsTakenBack(new PanelError(tooMany, 400), () => gateMet('run-messages'))
      }
      // AND THE PERSON'S PRESS IS NEVER SOMETHING A WRITER MAY PUT ON ITS OWN MESSAGE. Criterion
      // M78: this field says the person pressed to start an agent, and it is written by
      // POST /api/messages/<id>/start-an-agent, which refuses every agent but a secretary holding the
      // person's grant where this office's list of what the grant carries says so. A writer that could
      // fill it in at birth would start a run in the person's name without them.
      delete data['runWasAskedFor']
      // AND NO WRITER SAYS ITS OWN MESSAGE WAS CARRIED TO A NEW AGENT. Only the press writes `carriedTo`.
      // A value sent at birth would claim a carry nobody made.
      delete data['carriedTo']
      // AND NO CALLER WRITES THE ROUTING. `routed` is the office's own
      // account of where it also gave the words, written below from the reach reading. A value sent
      // with the message would be a caller claiming a copy nobody made.
      delete data['routed']
      // AND NO CALLER MAKES ITS OWN MESSAGE A SUMMONS. Only the summons door marks one
      // (`summonsMark`, above), because the mail tool carries what the mark says to the person.
      delete data['summons']
      if (input.summonsMark !== undefined) data['summons'] = { ...input.summonsMark }
      // AND NO CALLER SAYS ITS OWN MESSAGE CARRIES A COMMENT. Only the review's send does (`carries`, above).
      delete data['carries']
      if (input.carries !== undefined) data['carries'] = [...input.carries]
      // AND NO MESSAGE IS WRITTEN ALREADY FOLDED. Only the office folds a line, and only an old line of its own, through
      // the patch door (`THE_OFFICE_FOLDS_ITS_LINES`). A caller who could write it could hide a line under another.
      if (Object.hasOwn(data, 'foldedInto')) throw new PanelError(ONLY_THE_OFFICE_FOLDS_A_LINE, 403)
      // AND ONLY MOLE OFFICE NARROWS WHO IN A GROUP IS WOKEN, OR MARKS WHAT A DEAD-LETTER SWEEP DID.
      // A writer that set `deliveredOnlyTo` could keep a group message from members it is addressed
      // to, so it is refused before anything is stored rather than dropped.
      if (input.senderIsMoleOffice !== true && (Object.hasOwn(data, 'deliveredOnlyTo') || Object.hasOwn(data, 'deadLetterSweep'))) {
        throw new PanelError(
          'Mole Office writes `deliveredOnlyTo` and `deadLetterSweep` on its own lines, and a caller may not set them. ' +
            'A message to a group is delivered to every member, or to the members it mentions. Nothing was written.',
          403,
        )
      }
      // AND ONLY MOLE OFFICE ASKS AN ENTRY'S SUPERVISOR TO RESOLVE ITS CONFLICT. A program
      // reads `askedToResolve` to start an agent on the brief it names, so a caller who could write it could have any
      // brief started.
      if (input.senderIsMoleOffice !== true && Object.hasOwn(data, 'askedToResolve')) {
        throw new PanelError(
          'Mole Office writes `askedToResolve` on the message that asks a merge entry\'s supervisor to resolve its conflict, and a caller may not set it. Nothing was written.',
          403,
        )
      }
    }
    // WHO IS WRITING, AS THE MESSAGE DOORS JUDGE A READER, worked out once for the three checks below. They only read it,
    // and nothing is written between them. For an agent it reads every agent's role to find the secretaries: 972 rows
    // each time on a made-up office, previously asked three times for one message.
    // WHETHER A PARTICIPANT IS MOLE OFFICE is bound once for this message, too. The office's id is a read of its registry
    // row, and the reader, the addressing and the sender check below each read it again: four rows for every line the
    // office writes, which made the long sandbox run step read more agent rows than its registry holds.
    const isTheOffice = theMoleOfficeTest()
    const reader = theMessageReader(actor, isTheOffice)
    checkMessageTarget(data, workspaceId, actor.type, reader)
    // AND EACH THING IT QUOTES, checked as a target is, every one before any is stored.
    // `checkMessageQuotes` in lib/targets.ts also refuses a message holding both.
    checkMessageQuotes(data, workspaceId, actor.type, reader)
    // AND WHERE IT OFFERS TO TAKE SOMEBODY, which is a context and is checked as one. M8.
    checkMessageLead(data, workspaceId, actor.type, reader)
    // AND EVERY FILE IT CARRIES IS ONE THE FILE DOOR WILL SERVE, asked in the message centre, where it is stored and read.
    refuseAFileTheDoorWouldNotServe(data, MESSAGE_CENTRE)
    // AN AGENT IN `to` MAY BE NAMED BY ITS ID OR BY ITS HANDLE, AND IT IS STORED BY ITS ID. Criterion
    // I2: `to` is an arriving reference, so it goes through the one resolver as a write. Where the
    // resolver finds the agent, the entry is rewritten to the registry id it answered, so the stored
    // message and its delivery rows name the agent by the id that never changes. Where the name is
    // ambiguous, or a handle whose agent is retired, the resolver refuses with its own sentence and
    // nothing is written. Where nobody bears the name, the entry is left as it came and
    // `whyTheAddressingIsRefused` below says so. A person is not touched (criterion I6).
    if (isJsonObject(data) && Array.isArray(data['to'])) {
      data['to'] = data['to'].map((one: unknown) => {
        const ref = refFrom(one)
        if (ref === null || ref.kind !== 'agent') return one
        const found = theAgentAnArrivingReferenceNames(ref.id, 'writing')
        return found === null ? one : { kind: 'agent', id: found.agent.id }
      })
    }
    const because = whyTheAddressingIsRefused(
      isJsonObject(data) ? data : {},
      (who) => readParticipant(who) !== null,
      isTheOffice,
    )
    const undeliveredSweep = input.senderIsMoleOffice === true && input[THE_DEAD_LETTER_SWEEP] === true &&
      isJsonObject(data) && Array.isArray(data['to']) && data['to'].length === 0 && data['toGroup'] === undefined
    if (because !== null && !undeliveredSweep) throw new PanelError(because)
    // AND A MESSAGE THAT SAYS WHETHER IT ASKS THE PERSON SOMETHING NAMES A PERSON. The rule and its
    // sentences are `whyAsksThePersonIsRefused` in shared/messages.ts, asked before anything is written.
    const asking = whyAsksThePersonIsRefused(isJsonObject(data) ? data : {})
    if (asking !== null) throw new PanelError(asking)
    // AND ONLY THE PERSON PUTS THE MARK OF WHAT THEY WANT BACK ON A MESSAGE, on one they write. An
    // agent's message, the run's words the worker files and the office's own lines carry none. The rule is in
    // shared/intent-mark.ts; the value itself is checked by the kind's field. A label of the person's own has the
    // same rule, from shared/message-label.ts.
    for (const [field, refusal] of [
      ['intent', THE_INTENT_MARK_IS_THE_PERSONS],
      ['label', THE_LABEL_IS_THE_PERSONS],
      ['markedParts', THE_MARKED_PARTS_ARE_THE_PERSONS],
    ] as const) {
      if (
        isJsonObject(data) &&
        Object.hasOwn(data, field) &&
        (input.senderIsTheRun === true || input.senderIsMoleOffice === true || !thePersonIsProved(actor))
      ) {
        throw new PanelError(refusal, 403)
      }
    }
    // AND THE PARTS THEMSELVES ARE ONE RUN OF THE WORDS EACH, WITH ONE FLAG, AND NEVER BESIDE A WHOLE FLAG. The rule
    // and its sentences are in shared/intent-mark.ts, read once there, the same check the person's page meets.
    if (isJsonObject(data) && Object.hasOwn(data, 'markedParts')) {
      const read = readTheMarkedParts(data)
      if (!read.ok) throw new PanelError(read.why, 400)
    }
    // AND WHO SENT IT IS WHO WROTE IT. Not a field a caller may fill in with somebody else's name:
    // a message is somebody speaking, and a stored sender that is not the writer is a false name in
    // a permanent record. Where the caller sends nothing, this fills in the participant their actor
    // answers to; where nothing answers to it, the field is left out and the pool says so, because
    // inventing a sender is worse than saying nobody was found.
    if (isJsonObject(data)) {
      const mine = participantForActor(actor)
      const said = data['sentBy']
      // AND A MESSAGE COMES FROM A WRITER SOMEBODY REGISTERED, TO AN AGENT AS TO A PERSON. Criterion
      // M59, from the message the person got on 6 September 2026 from an agent nobody had
      // registered. The unregistered reporting path was withdrawn, so the rule holds for both. The whole account is on
      // `whyAnUnregisteredWriterIsRefused` in lib/messages.ts.
      //
      // THE TWO DOORS BELOW ARE NOT ASKED THIS QUESTION, because for both of them the sender has
      // already been checked against something real and the writer is a piece of machinery rather
      // than an agent. `senderIsTheRun` is the message worker delivering an agent's own words: the
      // actor is `mole-office/the-message-worker`, which no registry holds and never will, and
      // lib/worker.ts has already refused the write unless the run it names exists and was serving
      // the agent named in `sentBy` — so the sender on those messages IS a registered agent, and
      // thirteen of them were in the person's chat when this was written. `senderIsMoleOffice` is Mole Office
      // saying what happened to a conversation, and the five lines below check that it really names
      // Mole Office and really is addressed to a whole conversation. Neither is reachable from a
      // request: both live on `input`, and no route sets either from a body or a header.
      if (input.senderIsTheRun !== true && input.senderIsMoleOffice !== true) {
        const unregistered = whyAnUnregisteredWriterIsRefused(data, mine !== null, actor.id, actor.type)
        if (unregistered !== null) throw new PanelError(unregistered)
        /**
         * AND AN INJECT FROM AN AGENT TO A PERSON MEETS ITS TWO LIMITS. Criterion M84 treats injection as a
         * single press and limits abuse. A person may inject without limit; an agent may not inject a
         * second message to the same person while its last injected one is unread, and the person
         * can switch injecting off for every agent at once, on the Settings page (criterion M91).
         *
         * IT IS ASKED AFTER THE SENDER IS KNOWN and before the record is written, so a refused
         * inject writes nothing at all. The sender used is the one this door has just worked out
         * rather than the one the caller sent, for the reason the field itself is not a caller's:
         * an agent could otherwise inject under another agent's name and spend its allowance.
         */
        const injecting = whyThisInjectIsRefused(
          { ...data, sentBy: mine ?? refFrom(said) },
          mine ?? refFrom(said),
          whetherAgentsMayInject,
        )
        if (injecting !== null) throw new PanelError(injecting, 403)
      }
      if (input.senderIsTheRun === true) {
        // THE ONE EXCEPTION, AND IT IS CHECKED SOMEWHERE ELSE RATHER THAN WAIVED HERE. lib/worker.ts
        // has already refused this write unless the run it names exists and was serving this agent.
        // The change log still names the worker, so nothing about who made the write is hidden.
      } else if (input.senderIsMoleOffice === true) {
        /**
         * THE SECOND EXCEPTION, AND IT IS CHECKED HERE RATHER THAN WAIVED.
         *
         * A line Mole Office writes says what happened to a conversation, or tells one participant
         * something the office itself worked out — a group was opened, a member was added, two
         * claims are in conflict, a run waited for the next message and none came, a restart cut a
         * run off, a reminder is due, a dead letter was broadcast. It must name Mole Office as its
         * sender, and it must be addressed to a whole conversation or to one participant: a group,
         * one participant alone, or BOTH participants of one pair. Anything else through this door
         * would be an ordinary message wearing the product's name.
         *
         * WIDENED FROM "A GROUP OR BOTH OF A PAIR" TO "A GROUP, ONE, OR BOTH", criterion M105. Until
         * this the office could say what happened to a CONVERSATION and could not address a single
         * agent at all — F10's reminder and M111's dead-letter broadcast are both the office writing
         * to one participant (a reminder to one agent; a dead-letter announcement into a freshly
         * opened group, which is the group case already covered) — and every existing caller that
         * needed to reach one agent (lib/inspection.ts's `writeAMessage`) had to pad its own `to` to
         * two by repeating the one recipient, which is not what it meant to say. What is now allowed:
         * `to` naming exactly one participant. An undelivered sweep keeps its explanation with zero
         * recipients through the private symbol above. Other writes still refuse zero recipients,
         * three or more with any one of them not an agent (widened for agents only in loop-5, below), or
         * any entry that is not a real participant reference — and, above this
         * branch entirely, a `sentBy` of Mole Office claimed by anybody but this file's own callers,
         * since `senderIsMoleOffice` is never reachable from a request (see the comment on the field).
         *
         * THE PAIR HAS TO BE BOTH SIDES, and that is not a formality. `isBetween` in lib/messages.ts
         * draws such a line in a TWO-PARTICIPANT conversation only when it reached both of the people
         * in it, so a line addressed to only one of a pair would be written, delivered, and drawn on
         * no screen anywhere. Two participants were the rule from the moment there was a second shape,
         * on 4 September 2026, for criteria M22 and M24. A single recipient has no such problem: there
         * is only one side for the line to reach, and it reaches it.
         */
        const claimed = refFrom(said)
        if (claimed === null || !isTheOffice(claimed)) {
          throw new PanelError(
            'A line written as Mole Office says Mole Office sent it, and this one does not. Nothing was written.',
          )
        }
        // AND SEVERAL AGENTS, WITH NO PERSON AMONG THEM: the
        // office tells every agent a checklist item names in one message, through `writeASystemLineToAgents` in
        // lib/groups.ts. Three or more with a person among them is still refused: a line the person reads is drawn in
        // one conversation, and three participants are no one conversation.
        const toAGroup = typeof data['toGroup'] === 'string' && data['toGroup'] !== ''
        const named = Array.isArray(data['to']) ? data['to'].map((one) => refFrom(one)) : []
        const everyOneIsReal = named.length > 0 && named.every((one) => one !== null)
        const toOneOrTwo = everyOneIsReal && (named.length === 1 || named.length === 2)
        const toAgentsOnly = everyOneIsReal && named.every((one) => one?.kind === 'agent')
        if (!toAGroup && !toOneOrTwo && !toAgentsOnly && !undeliveredSweep) {
          throw new PanelError(
            'A line written as Mole Office says what happened to a conversation or tells one participant ' +
              'something, so it is addressed to a group, to one participant, to both participants of one ' +
              'conversation, or to several participants who are agents only. Nothing was written.',
          )
        }
      } else if (said !== undefined && said !== null) {
        const claimed = refFrom(said)
        if (claimed === null) {
          throw new PanelError(
            'Who sent a message is a person or an agent named by kind and id, as {"kind": "agent", "id": "builder"}.',
          )
        }
        // A CLAIMED AGENT SENDER IS AN ARRIVING REFERENCE TOO, so it may be the writer's id or its
        // handle. It is resolved as a write and compared with the writer by registry id, and what is
        // stored is that id. Criterion I2. The reading is theClaimedSenderIsTheWriter's, which the
        // update path asks too.
        if (mine === null || !theClaimedSenderIsTheWriter(claimed, mine)) {
          // AN AGENT WRITER IS NAMED BY THE HANDLE ON ITS ROW, never by a minted id nobody chose. A
          // person is named by id, as before (criterion I6).
          const writer =
            mine === null ? null : mine.kind === 'agent' ? (readParticipant(mine)?.handle ?? mine.id) : mine.id
          throw new PanelError(
            `This message says it was sent by the ${participantWord(claimed.kind)} "${claimed.id}", and it is being ` +
              `written by ${mine === null ? 'somebody neither registry holds' : `the ${participantWord(mine.kind)} "${String(writer)}"`}. A message is ` +
              'somebody speaking, so who sent it is who wrote it. Leave `sentBy` out and it is filled in for you.',
          )
        }
        data['sentBy'] = { kind: mine.kind, id: mine.id }
      } else if (mine !== null) {
        data['sentBy'] = mine
      }
      // AND ONLY MOLE OFFICE AND AN INSPECTOR SAY WHAT KIND OF NOTICE A MESSAGE IS. The
      // kind decides whether the message wakes its reader, so a writer who could set it could keep its own
      // message from waking anybody. Asked here because the sender is only settled above. lib/notices.ts.
      refuseANoticeKindNotAllowed(data, input.senderIsMoleOffice === true, refFrom(data['sentBy']))
      // AND THE QUESTIONS ONLY THE DATABASE CAN ANSWER ABOUT A GROUP, asked here because the first
      // of them is about the sender and the sender is only settled above. Whether the group exists,
      // whether anybody is in it, and whether whoever is writing is a member.
      const namedGroup = data['toGroup']
      if (typeof namedGroup === 'string' && namedGroup !== '') {
        // EVERY PROJECT, THE SAME WIDTH THE GROUP IS READ AT. Group writes have the same reach as group reads, so a member
        // standing in another project may write into the group.
        // The message record itself is still filed in the project the writer had open.
        const wrong = whyTheGroupAddressingIsRefused(namedGroup, EVERY_PROJECT, refFrom(data['sentBy']))
        if (wrong !== null) throw new PanelError(wrong)
      }
      // AND THE AGENT THE COMPOSER CHOSE IS WHO THE MESSAGE IS ADDRESSED TO.
      //
      // The comment composer picks a RUN and the pool addresses a PARTICIPANT, and until 4 September
      // 2026 nothing joined the two: a comment written to an agent was stored with no recipient,
      // the start-up backfill gave it a row addressed to the owner, and it never reached the
      // conversation with the chosen agent. The person received no response and could not find the message in the
      // conversation with the chosen agent. Criterion M16.
      //
      // WHAT THE PERSON CHOSE IS KEPT AS THEY CHOSE IT and this writes the address beside it, never over it —
      // the eighth rule's three layers. An explicit `to` wins, because a caller that named a
      // recipient outright has said what it means; and a choice that names no agent that exists
      // leaves the message addressed to nobody, which is the truth about it.
      if (!Array.isArray(data['to']) && typeof data['toGroup'] !== 'string') {
        const named = theAgentAChoiceNames(data['chosenRecipient'], workspaceId)
        if (named !== null) data['to'] = [named]
      }
      // A MESSAGE WITH NOBODY NAMED AND NOTHING POINTED AT IS REFUSED ABOVE, by
      // `whyTheAddressingIsRefused`, with a sentence saying what to add. It was stored here as
      // addressed to the owner until 4 September 2026, which wrote an interpretation into the
      // canonical field with nothing saying it was one, so a reader could not tell a message
      // addressed to the person on purpose from one addressed to them by that rule. The whole reason is on
      // NOBODY_NAMED_AND_NOTHING_POINTED_AT in shared/messages.ts; the schema refused this case
      // while this line stored it.
      //
      // AND BEFORE AN AGENT SENDS, THE OTHER SIDE HAS TO BE ABLE TO RECEIVE IT. Criterion M110 requires agents to
      // check that an addressee is online and can receive the message before sending it.
      //
      // FOR AN AGENT SENDER ONLY, NOT FOR THE OFFICE. M110 binds agent senders;
      // the office's own messages are exempt, and M105 identifies those messages as the office's.
      // `mine` is only set here when `input.senderIsMoleOffice` and
      // `input.senderIsTheRun` are both false — see the two branches above — so this is reached
      // exactly when the write is an ordinary agent's own words, never Mole Office's and never a
      // run's reply filed by the worker (`fileTheReply`'s own door, `whyThisReplyIsRefused`, is a
      // narrower question about which run may speak as which agent, and is not widened here — a
      // run replying in an existing conversation is distinct from an agent initiating a send).
      //
      // NOT FOR A GROUP. The reach check concerns an individual addressee, and a group's own
      // membership check (`whyTheGroupAddressingIsRefused` above) already asks a stronger question.
      // Widening to a group is not asked for here and is not built.
      //
      // THE PERSON IS NEVER REFUSED BY THIS RULE — see `whyThisAgentCannotReceiveAMessage`'s own
      // header — which is why only agent entries in `to` can ever produce a refusal below.
      if (input.senderIsTheRun !== true && input.senderIsMoleOffice !== true && mine !== null && mine.kind === 'agent') {
        const toAGroupNow = data['toGroup']
        if (!(typeof toAGroupNow === 'string' && toAGroupNow !== '')) {
          for (const one of refsOfRecipients(data['to'])) {
            const cannotReceive = whyThisAgentCannotReceiveAMessage(one, workspaceId)
            if (cannotReceive !== null && !aStartersLetterToAnEndedWorker(mine, one, workspaceId)) throw new PanelError(`${cannotReceive} ${NOTHING_WAS_SENT}`, 409)
          }
        }
      }
      // AND A LINE ABOUT A RUN THAT HANDED BACK AN INSIDE PACKAGE GOES TO THE SUPERVISOR THAT TOOK THE PACKAGE, not to the
      // secretary that made it (13y round 164). Asked only for the office's own lines and the check's own, never for a
      // message an agent or the person writes. After the reach check and before the routing, which reads the new address.
      if (input.senderIsMoleOffice === true || input.theChecksOwnLine === true) aPackagesLineGoesToItsSupervisor(data, input.theChecksOwnLine === true)
      // AND A MESSAGE TO AN ADDRESSEE NOBODY CAN REACH ALSO GOES UP ITS CHAIN OF STARTERS.
      // A retired addressee and an addressee nothing is answering as are distinct cases. Either way the letter
      // keeps its addressee, who can read it if it
      // comes back, and Mole Office ALSO gives it to the first reachable participant up the chain of
      // starters, ending at the secretary and then the owner.
      //
      // WHO IS ROUTED. A person's send and a run's reply route on either fact. The office's own lines
      // route on retired only, so idle reminders and card messages are not copied up a chain. An
      // agent's own send routes on nothing answering only: a retired addressee was refused by M110
      // above, with nothing written. A group message is never routed, and a recipient a patch adds
      // later is never routed, because this reading runs once at send time.
      //
      // THE ADDREESSEE IS NEVER REPLACED AND THE WORDS ARE NEVER REWRITTEN. `data.to` keeps the
      // addressee and `data.body` keeps the author's words; the copy is one more delivery row, and
      // `data.routed` is the record of it. Nothing else here reads presence, a hold or a run.
      {
        const toAGroupNow = data['toGroup']
        if (!(typeof toAGroupNow === 'string' && toAGroupNow !== '')) {
          const readings = theReadingsForOneMessage(workspaceId)
          const addressed = Array.isArray(data['to']) ? data['to'] : null
          // A PERSON OR AGENT SENDING TO AN UNHELD ADDRESSEE GETS THE 409. The office's own lines and a run's
          // reply have no caller to answer and keep their 201s.
          const aPersonOrAgentIsSending =
            mine !== null && input.senderIsTheRun !== true && input.senderIsMoleOffice !== true
          if (addressed !== null) {
            for (const one of addressed) {
              const ref = refFrom(one)
              if (ref === null || ref.kind !== 'agent') continue
              // THE OFFICE'S OWN LINES ROUTE ON RETIRED ONLY, so for one of them that alone is asked first. It reads the
              // addressee's registry row and no run. The whole reach reads the addressee's runs, and for an office line to an
              // agent who is not retired its answer was read and then not used.
              if (input.senderIsMoleOffice === true && whyThisAgentIsRetired(ref.id) === null) continue
              const reach = readings.reachOf(ref.id)
              if (reach === null) continue
              // THE 409'S REASON IS BUILT ONLY WHERE THE ROUTING ADDS AN ENTRY, in the two pushes below. A letter that
              // routes nothing must not read the word, because the extra read belongs to the error path alone. A
              // `checkpoint.act === 'wait'` is routed too: it falls through to the walk below, its entry has no receiver
              // and a waiting ending, and the send is answered 409 when an agent or person sent it. When the reach carries
              // no word, no reason is built and the send stays a 201 with the routing. A handle a session holds carries
              // none, because the waiter holding it takes the message when it comes.
              const theUnheldReason = (): string | null => {
                if (!aPersonOrAgentIsSending || reach.was !== 'nothing answering') return null
                const word = reach.theWordOf?.()
                return word === undefined ? null : theReasonOfAnUnheldAgent(ref.id, word)
              }
              // "COULD NOT TELL" ROUTES NOTHING. A process of the addressee's
              // session is alive and its transcript could not be read, so it may be answering. No
              // copy goes up its chain; the sender is told so instead. The office's own lines say
              // nothing, because they route on retired only.
              if (reach.was === 'could not tell') {
                if (input.senderIsMoleOffice !== true) {
                  notRouted.push({
                    for: ref,
                    because: reach.because,
                    line: theCouldNotTellLine(theNameOf(readParticipant(ref), ref.id)),
                  })
                }
                continue
              }
              // AN AGENT'S SEND TO A RETIRED AGENT IS NOT ROUTED, because M110 refused it above.
              if (mine !== null && mine.kind === 'agent' && reach.was === 'retired') continue
              if (reach.was === 'retired') {
                routedARetiredAddressee = true
                // THE ONE NAME READER THE ROUTED LINE USES TOO, so the short reason and every line
                // name the agent the same way. Criterion M113a.
                routedRetiredNames.push(theNameOf(readParticipant(ref), ref.id))
              }
              if (input.senderIsMoleOffice !== true && reach.was === 'nothing answering') {
                const addressee = readParticipant(ref) as RegisteredAgent | null
                const checkpoint = addressee === null ? null : aNewCheckpointLetterAsItIsWritten(
                  { workspaceId, to: ref, addressee, sentBy: refFrom(data['sentBy']), data }, readings,
                )
                if (checkpoint !== null && (checkpoint.rule === 'b' || checkpoint.rule === 'c') && checkpoint.act !== 'wait') {
                  routed.push(checkpoint.entry)
                  const unheldSays = theUnheldReason()
                  if (unheldSays !== null) routedUnheldReasons.push(unheldSays)
                  continue
                }
              }
              const walked = theRoutingOfOneAddressee(ref, reach, mine, readings)
              routed.push(walked)
              // ONLY A ROUTED ENTRY MAKES THE REASON: a letter that was not routed has no 409 and no sentence to say.
              const unheldSays = theUnheldReason()
              if (unheldSays !== null) routedUnheldReasons.push(unheldSays)
            }
          }
        }
      }
      // AND THE ROUTING IS PART OF THE RECORD, written before the write half so `whoAMessageIsTo`
      // sees every routed `to` and one extra delivery row is made for the chosen participant. The
      // addressee's own row stays, so one message reaches both conversations.
      if (routed.length > 0) data['routed'] = routed
      // AND THE OFFICE'S OWN LINES AND A RUN'S REPLIES HAVE NO CALLER TO ANSWER, so the process log
      // says where each letter went instead. One line per routed entry, the finished line itself.
      // A person's or an agent's own send is answered through the reply, so nothing is logged
      // for it.
      // A CHECK LOGS NOTHING, because no letter went anywhere (lib/only-a-check.ts).
      if (!onlyChecking() && routed.length > 0 && (input.senderIsMoleOffice === true || input.senderIsTheRun === true)) {
        for (const one of routed) whenStored(() => console.log(one.line))
      }
      // AND A RUN'S REPLY TO AN ADDRESSEE THE OFFICE COULD NOT TELL ABOUT is logged the same way,
      // because a run has no caller to answer either.
      if (!onlyChecking() && input.senderIsTheRun === true) {
        for (const one of notRouted) whenStored(() => console.log(one.line))
      }
    }
  }
  // AND AN AGENT'S FIRST RUN SAYS WHICH RUN STARTED IT. Criterion P11.
  //
  // WHAT IS WRITTEN AND ON WHAT AUTHORITY. When this agent was registered, the run doing the
  // registering wrote itself down on the registry row. That run is the one that started it, said by
  // that run at the only moment anybody knew. This is where the fact reaches the run's own record.
  //
  // IT IS NOT A DEFAULT AND IT IS NOT SILENT. It is written only when the caller sent no
  // `parentAttachment` of its own, only for the agent's FIRST session record, and the reply says
  // that Mole Office wrote it and where it came from. A second run of the same agent gets nothing:
  // an agent has many runs over its life and only the first was started by the run that registered
  // it, so filling the rest in would be a guess wearing a fact's clothes, and the reply says that
  // too rather than being silent about it.
  //
  // A PARENT THE CALLER GAVE IS ASKED ABOUT FIRST: the caller may name only a session it has a part
  // in (`whyThisCallerMayNotNameThisParent`). Nothing has been written yet.
  const parentGiven = kind === SESSION_KIND ? theParentADataGives(data) : null
  if (parentGiven !== null) assertThisCallerMayNameThisParent(parentGiven, actor, workspaceId, data)
  // AND A SESSION THAT NAMES AN AGENT IS FILED ONLY BY THOSE WHO MAY FILE FOR IT
  // (`whyThisCallerMayNotFileASessionFor`). Nothing has been written yet.
  if (kind === SESSION_KIND) assertThisCallerMayFileASessionFor(data, undefined, actor, workspaceId)
  if (kind === SESSION_KIND) refuseANewRunWhileAStarterChangeWaits(data, actor)
  const parentFilledIn = kind === SESSION_KIND ? theRunThatStartedThisOne(data, actor, workspaceId) : null
  if (parentFilledIn !== null && isJsonObject(data)) data['parentAttachment'] = parentFilledIn.run
  // A HANDLE IS AN ADDRESS, so it is checked before it is stored rather than corrected afterwards.
  // Two agents sharing one would deliver one agent's mail to the other, silently.
  if (kind === AGENT_KIND) {
    checkAgentHandle(data, workspaceId, null)
    checkAgentNotes(data)
    // AND A START FOLDER IS STORED IN ONE SPELLING. The create path is where a registration first
    // writes one, so this is the check that decides what a folder may look like; who may CHANGE one
    // afterwards is `checkNobodyIsChangingAStartFolder` on the patch path.
    checkAgentStartFolder(data)
    checkAgentRole(data)
    // AND WHO IS ALLOWED TO PUT A CARD OR A GRANT ON IT. On the create path
    // as well as on the patch, because a rule enforced on one write path is not a rule: a record
    // filed with a card already on it would be the same act done a step earlier.
    checkNobodyIsWritingTheirOwnCard(data, undefined, actor)
    // AND NO RECORD IS FILED WITH BROADCAST TIMES ALREADY ON IT, for the reason the card is not.
    checkNobodyIsChangingBroadcastTimes(data, undefined, actor)
  }
  // AND NOBODY FILES A RUN WITH A RAISE ALREADY ON IT, for the same reason.
  if (kind === SESSION_KIND) checkNobodyIsWritingTheirOwnRaise(data, undefined, actor)
  // A WORK DOMAIN NAMES A DURABLE AGENT AND THE SESSION THAT FILED IT, and the two may not
  // disagree about who is doing the work. Checked here as well as on the patch path, because a
  // rule enforced on one write path is not a rule.
  // AND NOTHING IS RESOLVED BY THIS CALL. A create arriving with its own `resolved` has skipped
  // the ordering the whole mechanism rests on rather than followed it.
  if (kind === WORK_DOMAIN_KIND) {
    checkWorkDomainIds(data, workspaceId)
    assertNothingResolvedOnCreate(data)
  }
  // WHAT A DECISION GOVERNS IS THERE: each record it names is a live page of this project, of a kind in PAGE_KINDS.
  if (kind === DECISION_KIND) assertTheGovernedPlacesAreReal(data, workspaceId)
  // AND IT NAMES WHAT IT GOVERNS, OR SAYS NO PAGE FITS, when a decision door asked. A report is never refused for this.
  if (kind === DECISION_KIND && input.mustSayWhatItGoverns === true) {
    const sent = isJsonObject(data) ? data : {}
    assertTheDecisionNamesWhatItGoverns(sent, sent, workspaceId)
  }
  // AND A DECISION'S BASIS IS THERE, AND A FLOW'S NEW STEPS SAY WHY AND ON WHAT.
  if (kind === DECISION_KIND) checkTheDecisionBasis(data)
  if (kind === 'flow') checkTheFlowSteps(data, null)
  // AND A HANDBOOK'S TEXT CHANGES SAY WHY, ITS PLACES ARE THERE, AND ONE ON A ROLE CARD MEETS THE CARD RULE.
  if (kind === HANDBOOK_KIND && data !== undefined) checkAHandbookWrite({ before: null, after: data, actor, subject: title, restoring: false })

  // AND A SHORT FORM NAMES A REVISION THAT IS REALLY THERE, which on this path means it cannot name
  // one at all: a record being filed for the first time has no revisions yet. `settleShortForms`
  // says so in a sentence that points at the route which does have a revision to name. It is here
  // for the same reason the check above is — a rule enforced on one write path is not a rule — and
  // without it `POST /api/records` was the way past both halves of it.
  if (data !== undefined) {
    settleShortForms(null, {}, data, actor, { kind, title, summary: input.summary ?? null })
  }

  // ------------------------------------------------------------------ WHAT IS ALREADY CALLED THIS
  //
  // A REPEATED TITLE IS REPORTED AND NEVER REFUSED, since 17 August 2026. This is what used to be
  // here before repeated titles were allowed:
  //
  //     A record called "X" already exists. Titles are unique because typing a title is how you
  //     link to something.
  //
  // The person met it by deleting a plan line, writing the line again, and being told the work already
  // existed — and the record holding the name was one THEY had just deleted, because the unique
  // index covered deleted rows. Record ids determine identity; titles are display text and may repeat.
  // Matching titles may suggest an existing record to link to, but title equality neither proves
  // identity nor forbids filing a distinct record.
  //
  // So both questions are asked, both answers are carried on the result, and neither stops the
  // write. `sameTitle` is the exact repeat and `similar` is the near miss; they are two lists
  // because they mean two different things to whoever reads them. A screen can now ask "there is
  // already work called this — did you mean it?" and be told no.
  //
  // TRIMMED, WHICH IT WAS NOT. This query compared the UNTRIMMED title while the insert below
  // stores `title.trim()`, so `"Tray clamp "` and `"Tray clamp"` were one record's name and two different
  // answers from this check. Nothing reachable exposed it, because the one caller that could send
  // an untrimmed title had already trimmed it. It is fixed rather than left, because the next
  // caller has no way of knowing.
  //
  // BOTH ARE ASKED BEFORE THE INSERT so the new row cannot answer about itself. A block is skipped
  // by `similar` rather than measured: its title is built from its pipeline's, so the answer would
  // be about the pipeline. See nearDuplicateTitles for the whole reason and the measurement.
  //
  // A MESSAGE IS SKIPPED BY `similar` TOO. A message is kept from being stored twice by its send id,
  // and titles may repeat, so in a chat a close title is ordinary and the near list says nothing. It
  // read every live title of the project for each message sent through the record door.
  //
  // AND NEITHER LIST NAMES A MESSAGE THE READER MAY NOT READ: the lists give each
  // record's id and title. `theRecordsAlreadyCalled` is the one reading of the exact list, which the
  // rename on PATCH /api/records/:id asks too.
  const namesThem = input.namesWhatIsAlreadyFiled !== false
  const sameTitle = namesThem ? theRecordsAlreadyCalled(title.trim(), workspaceId, input.reader) : []
  const nearby = !namesThem || kind === BLOCK_KIND || kind === 'message' ? [] : nearDuplicateTitles(title.trim(), workspaceId)
  const similar = input.reader === undefined ? nearby : onlyTheMessagesThisReaderMayRead(input.reader, nearby)

  // THE WRITE HALF, IN ONE PLACE SO IT CAN BE WRAPPED IN ONE TRANSACTION. It stays inside this
  // function rather than becoming a helper of its own for a reason worth knowing before moving it:
  // tests/guard-human-only.test.ts attributes every `db.insert(records)` in this file to the
  // enclosing EXPORTED function, and a write in a top-level helper is reported as a write nobody
  // can guard.
  const file = (): CreateResult => {
    if (kind === 'problem' && isJsonObject(data) && data['mainSuiteFix'] !== undefined) validateMainSuiteFixCreate(data, actor, workspaceId)
    // ONE MESSAGE PER PRESS OF SEND. A second send from the same writer with the same
    // `sendId` writes nothing and answers the first message as it was stored. Asked first in this transaction, so two
    // sends that race are one message, and before anything below writes. A writer nobody could name has no id to be
    // its own, and is written as before.
    const theFirst = kind === 'message' && isJsonObject(data) ? theMessageThisPressAlreadySent(data) : null
    if (theFirst !== null) return theFirst

    // Resolved here rather than above so that reading the far ends and writing the links happen
    // inside the same transaction. It only reads, and every refusal it makes is made before the
    // record row exists.
    const planned = planLinks(requests, title.trim(), workspaceId, input.reader)

    // WHO THIS COMMENT IS FOR, COMPLETED HERE AND NOT ABOVE. A legacy `annotation`'s
    // `chosenRecipientAsStored` mints the durable identity of a run somebody chose, which is two
    // more record writes; a `message` is REFUSED here when the run names no agent. Both belong
    // inside this transaction, so a refusal rolls any identity back with everything else.
    const chosen = isJsonObject(data) ? chosenRecipientAsStored(data, actor, kind) : null
    const withChosen = chosen === null ? data : { ...(data as Record<string, unknown>), chosenRecipient: chosen }
    // AN AGENT'S GOAL IS MARKED AS THE AGENT'S UNTIL THE PERSON CONFIRMS IT. Criterion P1. The office
    // writes `filed_by` from the actor rather than trusting a caller's name, and refuses a caller
    // that tried to write another name; a goal the person files carries none. See lib/goals.ts.
    const marked = theAgentMarkAsStored(withChosen, actor, kind)
    // A RUN'S FILING COMMIT IS THE OFFICE'S OWN READING, which the record door made before this write. Typed as the data
    // it joins, so every read of `dataToStore` below indexes one object type.
    const filed: Record<string, unknown> | null = input.filingHead === undefined || kind !== 'session' ? null : { ...(marked ?? withChosen) as Record<string, unknown>, [FILING_HEAD]: input.filingHead }
    // THE MOMENT A MESSAGE WAS WRITTEN OR A RUN WAS FILED, FROM THE ONE READING OF THE CLOCK THAT MAKES ITS STAMP below.
    // The stamp is the local wall clock with no offset, and on the night the clocks go back it cannot say which pass of
    // the hour from 01:00 it means; the instant beside it can. Mole Office writes it, and what a caller sent under the
    // name is replaced.
    const written = clockStamp()
    const itsMoment = kind === 'message' ? 'writtenTime' : kind === 'session' ? 'filedTime' : null
    const stamped = filed ?? marked ?? withChosen
    const withItsMoment: Record<string, unknown> | null = itsMoment === null ? null : { ...(isJsonObject(stamped) ? stamped : {}), [itsMoment]: written }
    const dataToStore = withItsMoment ?? stamped
    // AND THE COMPLETED VALUE GOES THROUGH THE SAME GATE AS THE ONE THAT WAS SENT. It is a shape a
    // caller could have sent, and this is what says so rather than a comment claiming it. The moment alone does not send
    // it through again: it is the office's own reading of the clock, in the shape its kind declares.
    if (chosen !== null || marked !== null || filed !== null) validateRecordData(kind, dataToStore)

    const row = {
      id: anOfficeId(),
      kind,
      // EVERY MESSAGE IS STORED IN THE MESSAGE CENTRE, whatever project the request named. Every
      // check above ran against the project the request named, where the records a message points at are.
      workspaceId: kind === 'message' ? MESSAGE_CENTRE : workspaceId,
      ownerId: actor.type === 'human' ? actor.id : THE_PERSON,
      title: title.trim(),
      summary: input.summary ?? null,
      data: dataToStore ?? {},
      createdAt: written.stamp,
      updatedAt: written.stamp,
      deletedAt: null,
      // See `origin` on the input above for why a default is a fact here and not a guess.
      origin: input.origin ?? 'authored',
    }
    // A fresh session has no create stamp yet. logChange below stores these same actor fields;
    // the territory agent reader uses them only after the served-agent readers found nobody.
    if (kind === 'session' && Object.hasOwn(row.data, 'territory')) {
      input.checkTerritoryBeforeWrite?.(toRecord(row as typeof records.$inferSelect), { actorType: actor.type, actorId: actor.id })
    }
    db.insert(records).values(row).run()
    // AND A DURABLE AGENT GETS ITS REGISTRY ROW AT THE MOMENT ITS RECORD IS WRITTEN. Inside this
    // transaction, for the reason the recipient's identity is minted inside it: a database with work
    // waiting for a migration is one a server start refuses, so a door that left this to migration
    // 0114 would take the next start down. See the header of lib/participants.ts.
    // AND A MESSAGE GETS ONE DELIVERY ROW PER RECIPIENT, inside this transaction, so a message and
    // the marks about it are written together or not at all. A message whose rows failed to write
    // would be one the pool says reached nobody.
    if (kind === 'message' && isJsonObject(dataToStore)) {
      // A MESSAGE TO A GROUP GETS ONE DELIVERY ROW PER MEMBER, so one send
      // automatically reaches every group member. It is ONE message with several marks, not
      // several messages, so what everybody reads is the same words and the group's own conversation
      // is one list. The sender gets no row: a mark is about somebody else reading.
      //
      // `to` IS LEFT OUT ON A GROUP MESSAGE AND THE ROWS ARE THE ONLY COPY. Who a group message
      // reached is the membership at the moment it was sent, and writing that back into the field an
      // author fills in would put an answer in the place a question goes.
      //
      // ONE READER FOR BOTH DOORS, since 5 September 2026. `keepTheDeliveryRowsInStep` is what the
      // patch door below calls as well, so a recipient given at birth and a recipient given an hour
      // later reach the conversation by exactly the same path.
      const { to } = keepTheDeliveryRowsInStep(row.id, dataToStore, workspaceId, row.createdAt)
      // AND THE MESSAGE'S PARTIES AND THE OWNER ARE TOLD, and no other page, through
      // `reaches` in lib/events.ts. Announced from here rather than from a route, because a message is
      // written through POST /api/records and a page would otherwise learn about the ones the chat
      // panel sent and not about the ones anything else did. The parties are read after the delivery
      // rows above are written, so everybody the message reached is among them.
      //
      // AND THE EVENT CARRIES THE MESSAGE AS THE CHAT'S LISTS DRAW IT, so an open page moves its rows
      // rather than reading its lists again (`whatANewMessageChanges`). The part that depends on who
      // is reading is added for each open page as it is sent (`aNewMessageAsToldTo`).
      const target = targetOfRecord({ kind, data: dataToStore })
      const aNewMessage = {
        name: 'message.new' as const,
        workspaceId,
        messageId: row.id,
        sentBy: refFrom(dataToStore['sentBy']),
        to,
        hasTarget: target !== null,
        lists: whatANewMessageChanges(row.id, true),
      }
      const parties = thePartiesOf(row.id)
      announce(aNewMessage, aNewMessageAsToldTo(aNewMessage), parties)
      // AND AN OFFER TO TAKE SOMEBODY SOMEWHERE IS ANNOUNCED, so a page that is not showing the
      // messages panel still hears it. Nothing about the announcement moves anybody: the page draws
      // an offer unless that reader has said they are following this agent. Criterion M8.
      const lead = leadOfRecord({ kind, data: dataToStore })
      if (lead !== null) {
        const where = lead as Context
        announce(
          {
            name: 'lead.offered',
            workspaceId,
            messageId: row.id,
            sentBy: refFrom(dataToStore['sentBy']),
            to,
            recordId: recordNamedByTarget(where.target),
            targetKey: contextKey(where),
          },
          null,
          parties,
        )
      }
      // AND A COMMENT IS ANNOUNCED AS A COMMENT AS WELL. A page open on the record this points at
      // has to draw it whoever it was addressed to, and `message.new` is about a message reaching
      // its recipients rather than about a place on a page changing. Criterion M7.
      if (target !== null) {
        const context = target as Context
        const key = contextKey(context)
        // WHAT THE WRITER SAID IT ANSWERS, IF THEY SAID. A message that names the message it
        // answers is an answer, and nothing needs working out. When nobody said, the question is
        // asked of what is already stored: has one of the people this is addressed to already said
        // something about this same place? Two ways of answering one question, with the writer's
        // own word first, is one way — the other is what a reader gets when the writer stayed
        // silent.
        const named = dataToStore['inReplyTo']
        const theWriterSaidWhatItAnswers = typeof named === 'string' && named.trim() !== ''
        announce(
          {
            name:
              theWriterSaidWhatItAnswers || answersSomebodyHere(key, to, workspaceId)
                ? 'comment.replied'
                : 'comment.placed',
            workspaceId,
            messageId: row.id,
            sentBy: refFrom(dataToStore['sentBy']),
            recordId: recordNamedByTarget(context.target),
            targetKey: key,
            to,
          },
          null,
          parties,
        )
      }
    }
    if (kind === AGENT_KIND) {
      keepTheAgentRegistryInStep(
        {
          id: row.id,
          title: row.title,
          handle: isJsonObject(dataToStore) ? dataToStore['handle'] : undefined,
          runtime: isJsonObject(dataToStore) ? dataToStore['runtime'] : undefined,
          state: isJsonObject(dataToStore) ? dataToStore['state'] : undefined,
          retiredBecause: isJsonObject(dataToStore) ? dataToStore['retiredBecause'] : undefined,
          startedBy: isJsonObject(dataToStore) ? dataToStore['startedBy'] : undefined,
          role: isJsonObject(dataToStore) ? dataToStore['role'] : undefined,
          // AND WHO CHOSE THE CARD, criterion P75. It follows the record exactly as the role above
          // does, so the change is on the record's own history rather than only in a column.
          cardChosenBy: isJsonObject(dataToStore) ? dataToStore['cardChosenBy'] : undefined,
          elevation: isJsonObject(dataToStore) ? dataToStore['elevation'] : undefined,
          workArea: isJsonObject(dataToStore) ? dataToStore['workArea'] : undefined,
          startedFor: isJsonObject(dataToStore) ? dataToStore['startedFor'] : undefined,
          startedByRun: isJsonObject(dataToStore) ? dataToStore['startedByRun'] : undefined,
          // AND THE CREDENTIAL THE REGISTRATION CAME IN ON, criterion P69. Measured at the door and
          // written into the record's data there; this carries it to the registry row a refusal and
          // the Embassy read.
          credential: isJsonObject(dataToStore) ? dataToStore['credential'] : undefined,
        },
        participantForActor(actor),
        row.origin === 'authored', // A live new registration, not fixture import or an old-record sync.
      )
      // AND EVERY PAGE IS TOLD THE REGISTRY CHANGED, because every name on the chat's lists comes from
      // it. Registrations are rare, so a page reads the names again rather than being sent the row.
      // AND THE CONTACTS, because every registered agent has a contact row, placed and folded by rules
      // the contacts door holds.
      const registered = agentForRecord(row.id)
      announce({
        name: 'list.changed',
        workspaceId,
        lists: ['participants', 'contacts'],
        about: null,
        groupId: null,
        participant: registered === null ? null : { kind: 'agent', id: registered.id },
        because: `The agent record "${row.title}" was written, so the registry of agents changed.`,
      })
    }
    // AND EVERY OPEN PAGE IS TOLD WHEN THIS IS A REQUEST THAT WAITS FOR THE PERSON, so Needs you draws it at once.
    if (kind === 'role_request') tellThePagesWhenARequestWaitsForThePerson({ kind, data: dataToStore })
    if (kind === 'session' && isJsonObject(dataToStore) && aRunSaysItIsFinished(dataToStore) && runSubmitsWork(row.id, dataToStore)) {
      // THE HARD GATE BEFORE THE SEAL (see lib/before-the-seal.ts): a run filed already finished seals
      // in this same write, so the gate is asked here too. It stands inside this filing's transaction, after the row and
      // the rest of the filing have been written, so a refusal rolls the whole filing back — no run, no key, no history,
      // no notice. It does not stand before the first INSERT. It refuses only a migration item of a git seal, for every
      // writer, and its count is made once this transaction is taken back.
      refuseTheSealOverAFault({ ...toRecord(row as typeof records.$inferSelect), data: dataToStore }, true)
      const sealed = { ...dataToStore, ...sealFinishedRun(row.id, dataToStore, actor, dataToStore['tip']) }
      db.update(records).set({ data: sealed }).where(eq(records.id, row.id)).run()
      row.data = sealed
    }
    logChange(row.id, 'create', actor, null, null, title, undefined, input.startersKey)
    // WHAT THE RECORD HOLDS AT THE MOMENT IT IS FILED, kept whole. The change row above stores the
    // TITLE and nothing else, which is why this table exists: without it a create leaves no starting
    // point for the later edits to be replayed onto. See `saveRevision`.
    saveRevision(row.id, 'create', actor, undefined, undefined, undefined, input.startersKey)
    // AND THE ADDED ROLES ARE READ AGAIN ONCE THIS IS STORED, because a card added on the Roles page is in its record's words.
    if (kind === ROLE_CARD_WORDS_KIND) readTheAddedCardsAgainWhenStored()
    // AND A DAILY OBLIGATION FILED FULFILLED HAS ITS NEXT DAY WRITTEN, in this same write (lib/daily-obligations.ts).
    if (kind === 'obligation' && writeTheNextDayOfADailyObligation(row.id) !== null) row.data = getRecord(row.id)?.data ?? row.data

    // The session filing itself. Everything it wrote under this name before it had a record --
    // including the create row just written -- is repointed here, which is what turns "28 rows say
    // checkpoint3, nought say the record" into one session with one history.
    const result: CreateResult = { record: toRecord(row as typeof records.$inferSelect), incomplete }
    // AND THE RUN'S FLOW RUN, IN THIS SAME WRITE, from the flow the run names or none. Every launcher files
    // its session here, so every run gets one. Under M1 of the office flow, it runs in a savepoint of its
    // own: a flow run that cannot be written leaves the session filed, says so here, and files a problem.
    if (kind === 'session') {
      // AND WHO IS ANSWERING AS THE AGENT IT SERVES MAY HAVE CHANGED, told once this write is stored (lib/answering-told.ts).
      answeringOfTheAgentsTheseRunsServeMayHaveChanged(row.data)
      result.flowRun = fileTheFlowRunOf({ id: row.id, workspaceId: row.workspaceId, createdAt: row.createdAt, data: (row.data ?? {}) as Record<string, unknown>, origin: readOrigin(row.origin) ?? 'authored' }, actor)
    }
    // AND WHAT MOLE OFFICE FILLED IN, SAID IN THE ANSWER TO THE REQUEST THAT DID NOT SEND IT.
    if (parentFilledIn !== null) {
      result.moleOfficeWrote = {
        field: 'parentAttachment',
        value: parentFilledIn.run,
        because: parentFilledIn.because,
      }
    }
    // AND WHERE THE MESSAGE WENT WHEN ITS ADDRESSEE COULD NOT BE REACHED. See `routed` above; the
    // reply the route builds from these fields says where the copy went, and the 409 the route answers
    // for a retired addressee, which the owner's decision keeps, and for a registered agent nothing holds.
    if (kind === 'message' && routed.length > 0) {
      result.routed = routed
      if (routedARetiredAddressee) {
        result.routedARetiredAddressee = true
        result.routedRetiredNames = [...routedRetiredNames]
      }
      if (routedUnheldReasons.length > 0) {
        result.routedToAnUnheldAddressee = true
        result.routedUnheldReason = routedUnheldReasons.join(' ')
      }
    }
    // AND THE ADDRESSEES THE OFFICE COULD NOT TELL ABOUT, so the reply tells the sender. See `notRouted`.
    if (kind === 'message' && notRouted.length > 0) result.notRouted = notRouted
    if (similar.length > 0) result.similar = similar
    if (sameTitle.length > 0) result.sameTitle = sameTitle.map(named)
    const ref = kind === 'session' && input.bindCallerSession !== false ? (actor.sessionId ?? '').trim() : ''
    if (ref !== '' && ref !== row.id) {
      const already = resolveSessionRef(ref, workspaceId)
      if (already.matchedBy === 'recordId') {
        // The caller wrote as a session record it named by id, and then filed another session
        // record. Nothing to claim, nothing to move, nothing to say: an id is exact, and this
        // request's rows are already filed under it. Reporting here would put a paragraph about a
        // binding that did not happen on top of an ordinary 201.
      } else if (already.recordId !== null && already.recordId !== row.id) {
        // The name is spoken for. Nothing is written -- taking it would drag the other session's
        // history along -- and the refusal is REPORTED, because the caller's own rows have been
        // going to that other session all along and this reply is where it finds out.
        result.sessionBinding = nameHeldByAnotherSession(row.id, already)
      } else {
        // Nothing answers to the reference yet, or it matched the title of the record just filed.
        // Either way it is this session's to claim.
        result.sessionBinding = bindSessionName(row.id, ref, actor)
      }
    }

    if (planned.length > 0) {
      const mine: LinkEndRef = { id: row.id, kind, title: row.title }
      const write = (plan: (typeof planned)[number]): CreatedLink => {
        const other: LinkEndRef = { id: plan.other.id, kind: plan.other.kind, title: plan.other.title }
        const from = plan.newRecordIs === 'from' ? mine : other
        const to = plan.newRecordIs === 'from' ? other : mine
        // The same function POST /api/links calls, so a relationship written here obeys the rules
        // written there — including the gate check and the refusal to link a record to itself.
        const link = createLink({
          fromId: from.id,
          toId: to.id,
          type: plan.type,
          actor,
          ...(plan.gate === null ? {} : { gate: plan.gate }),
        })
        return {
          id: link.id,
          type: plan.type,
          from,
          to,
          newRecordIs: plan.newRecordIs,
          note: describeLink(from, to, plan.type, plan.gate),
        }
      }
      // THE SUPERSEDES LINKS ARE WRITTEN FIRST, and the answer lists every link in the order it was asked for. A
      // decision that replaces the one standing on a fork, and is linked to that fork in the same write, is choosing
      // again. `createLink` refuses a settling link while another decision still stands on the fork, so the old one
      // has to be replaced already when the settling link is made.
      const writeFirst = (plan: (typeof planned)[number]): number => (plan.type === 'supersedes' ? 0 : 1)
      const made = new Array<CreatedLink>(planned.length)
      for (const at of planned.map((_, i) => i).sort((a, b) => writeFirst(planned[a]!) - writeFirst(planned[b]!))) {
        made[at] = write(planned[at]!)
      }
      result.links = made
      result.linksNote = describeLinks(made)
      const there = theRecordsAlreadyLinkedThere(made, row.id, input.reader)
      if (there.length > 0) result.alreadyLinkedThere = there
    }
    if (keyReminder !== null) result.keyReminder = keyReminder
    // AND WHAT A DECISION OR A REPORT NAMES IS SAID BACK, and each new nothingFits entry is sent at once, in this write.
    if (kind === DECISION_KIND || kind === 'report') {
      const names = whatTheWriteNames(
        { id: row.id, kind, title: row.title, workspaceId },
        null,
        isJsonObject(result.record.data) ? result.record.data : {},
        actor,
      )
      if (names !== null) result.whatItNames = names
    }
    // AND THE ONE WHO WROTE A NOTE DOWN FOR THE PERSON IS TOLD THAT IT WAITS, in this same write.
    if (kind === 'note' && waitsForThePerson(result.record)) tellTheWriterOfTheNote(result.record, { is: 'waits' })

    return result
  }

  // ALL OR NOTHING, and this line is the whole of it. better-sqlite3 rolls the transaction back on
  // a throw, so a refusal from any link leaves no record, no link, no change row and no revision —
  // and it nests as a savepoint when a caller (addBlock) already has one open.
  //
  // A CREATE WITH NO LINKS IS WRAPPED TOO, SINCE THE REVISION LEDGER. It used to be left bare, with
  // the reason "one intention and one write, and there is nothing for a transaction to hold
  // together". There is now: the record row, its change row and its revision. A revision written
  // for a record whose insert was rolled back would be a claim about a state the database never
  // had, and `saveRevision` throws rather than skipping — so both have to land or neither.
  const createTransaction = sqlite.transaction(file)
  return kind === 'problem' && isJsonObject(data) && data['mainSuiteFix'] !== undefined ? createTransaction.immediate() : createTransaction()
}

/**
 * THE MESSAGE THIS WRITER ALREADY SENT WITH THIS `sendId` , as the answer to sending it again, or null. Messages
 * are kept in the message centre whatever project names them, and the oldest is the
 * one the press wrote. A message deleted since is not answered: the press then writes again.
 */
function theMessageThisPressAlreadySent(data: Record<string, unknown>): CreateResult | null {
  const sendId = data['sendId']
  const sentBy = refFrom(data['sentBy'])
  if (typeof sendId !== 'string' || sendId === '' || sentBy === null) return null
  const first = db
    .select()
    .from(records)
    .where(
      and(
        eq(records.kind, 'message'),
        eq(records.workspaceId, MESSAGE_CENTRE),
        isNull(records.deletedAt),
        eq(STORED_FIELDS.messageSentById(records.data), sentBy.id),
        eq(sql`json_extract(${records.data}, '$.sentBy.kind')`, sentBy.kind),
        eq(sql`json_extract(${records.data}, '$.sendId')`, sendId),
      ),
    )
    .orderBy(asc(records.createdAt), asc(records.id))
    .get()
  if (first === undefined) return null
  return {
    record: toRecord(first),
    incomplete: [],
    alreadySent: {
      id: first.id,
      because:
        `This writer already sent the message ${first.id} with the send id "${sendId}" at ${first.createdAt}, so nothing ` +
        'new was written and this is that message as it was stored. Send a new id for a new message.',
    },
  }
}

/**
 * The report a session gets when the name it writes under already means somebody else.
 *
 * Nothing is written by this function and nothing should be: the two sessions genuinely share a
 * name, and there is no answer to "which session did this" that a machine may pick. What it owes
 * the caller is the whole picture -- who holds the name, where the rows it has already written
 * went, and the two requests that get it out of this -- because the alternative, which is what
 * this code did until now, is a 201 that looks like success while the run's history accumulates
 * under a stranger.
 *
 * `x-mole-office-session: <the new record id>` is the fix for everything written from here on: a record
 * id is exact, needs no binding, and cannot be claimed by anyone else. The rows already written are
 * a person's decision, so they are pointed at the route that shows the log's session column and
 * moves nothing until it is asked to.
 */
function nameHeldByAnotherSession(recordId: string, held: SessionRef): SessionBinding {
  return {
    name: held.asked,
    recordId,
    repointed: 0,
    alreadyBoundTo: held.recordId,
    note:
      nameIsSpokenFor(held.asked, held) +
      ` Your writes under "${held.asked}" — this record's own create row among them — are filed under ` +
      `that session and not under ${recordId}, and they have not been touched. Send ` +
      `x-mole-office-session: ${recordId} from here on, which names this record exactly and binds nothing; ` +
      `for the rows already written, ${MIGRATION_ROUTE} {"dryRun":true} shows what the change log's ` +
      `session column holds before anything is moved.`,
  }
}

export function fallbackMustBeFiledOnItsBlock(title: string): string {
  return (
    `A record of what ran instead belongs to the step whose canonical method it stands in for, so it cannot be ` +
    `filed on its own: send POST /api/records/<block id>/ran-instead ` +
    `{"ran":"…","because":"…","since":"2026-08-30","allowed_uses":["…"],"disallowed_claims":["…"],` +
    `"severity":"limits_claims"} instead. That mints the record, titles it after the step, and writes the ` +
    `\`about\` link to the block in one transaction. Two facts about one of these live on its block and nowhere ` +
    `else — which canonical method it stands in for, and which record its restriction is declared against — so ` +
    `one with no block would have neither, and ${JSON.stringify(title)} would restrict nothing at all.`
  )
}

/**
 * AN INCIDENT WITH NO LOSS AND NO TIMELINE IS REFUSED AT THE DOOR. Criterion I1's own test.
 *
 * CREATE ONLY, ON PURPOSE. Chapter 4 rule 6 makes an incomplete stub the normal, encouraged shape
 * for a record in this product — "file it before you can finish it" — and this function breaks that
 * rule for exactly two fields on exactly one kind, because I1 asks for it in so many words: a title
 * with no loss and no moment of what happened is not an incident yet. It is NOT applied to a PATCH,
 * including a kind change into `incident`: tests/kind-can-change.test.ts sweeps every kind through
 * every other kind's own worked example and asserts the result stays valid for its new kind, and
 * `problem`'s example carries no `loss` or `timeline` at all — a hard refusal there would be asking
 * that sweep to prove something criterion I1 does not ask for. Filing an incident IS gated
 * (`checkWhoMayFileAnIncident` in src/server/lib/records/who-files-an-incident.ts); staying structurally sound after a later edit is the
 * ordinary completeness reading every other kind gets.
 */
function checkTheIncidentHasLossAndTimeline(data: unknown): void {
  const value = isJsonObject(data) ? data : {}
  const loss = value['loss']
  const timeline = value['timeline']
  const noLoss = typeof loss !== 'string' || loss.trim() === ''
  const noTimeline = !Array.isArray(timeline) || timeline.length === 0
  if (!noLoss && !noTimeline) return

  const missing: string[] = []
  if (noLoss) missing.push('`loss`')
  if (noTimeline) missing.push('`timeline`')

  throw new PanelError(
    `An incident with no ${missing.join(' and no ')} is refused at the door. Nothing was written. ` +
      `An incident is a record about a real loss, and a stub naming neither the loss nor a single moment of ` +
      `what happened would be a title with nothing behind it — unlike most kinds in Mole Office, which may be ` +
      `filed as a stub and completed later (chapter 4 rule 6). Write \`loss\` as the words of the person where ` +
      `they said them, and \`timeline\` with at least one moment; everything else about an incident may still be ` +
      `filled in afterwards, including through PATCH.`,
    400,
  )
}

/** Create a record. The common form: everything except what it is still missing. */
export function createRecord(input: {
  kind: RecordKind
  title: string
  summary?: string | null
  data?: Record<string, unknown>
  /** Which project this record goes in. Required — see `createRecordWithReport`. */
  workspaceId: string
  actor: Actor
  /** See `createRecordWithReport`. Default `authored`; only the fixture generator passes anything. */
  origin?: RecordOrigin
  /** See `createRecordWithReport`. Set only by `fileTheReply` in lib/worker.ts. */
  senderIsTheRun?: boolean
  /** THIS CREATE CAME FROM THE NOTEBOOK DOORS. See `RecordPatch[THE_NOTEBOOK_DOOR]`. Criterion N2. */
  [THE_NOTEBOOK_DOOR]?: true
  /** See `createRecordWithReport`. Set only by the three `writeASystemLine*` functions in lib/groups.ts. */
  senderIsMoleOffice?: boolean
  /** See `createRecordWithReport`. Set only by `writeAMessage` in lib/inspection.ts. */
  theChecksOwnLine?: true
  /** See `createRecordWithReport`: keep the sweep's explanation when nobody can receive it. */
  [THE_DEAD_LETTER_SWEEP]?: true
  /** See `createRecordWithReport`. Set only by `summonThePerson` in lib/summons.ts. */
  summonsMark?: { who: string; urgency: string; title: string }
  /** See `createRecordWithReport`. Set only by the review's send, `writeTheMessageTo` in lib/reviews.ts. */
  carries?: readonly string[]
  /** See `createRecordWithReport`: where a message was written, when the writer knows better than `workspaceId`. */
  writtenIn?: { project: string | null; page: string | null }
}): PanelRecord {
  return createRecordWithReport({ ...input, namesWhatIsAlreadyFiled: false }).record
}

/**
 * THE END MESSAGE: a `message` whose `aboutRun` is that run, which is how the helper's message to the run's starter names
 * the run (theStarterIsTold in tools/sandbox-start.mjs), with no links. Anything else is refused and nothing is written.
 * It goes to the run's starter alone, addressed as the helper addresses it: one `to` of kind agent naming the agent of
 * the session in the run's `parentAttachment`. A run with no starter on record has nobody
 * to tell, so its message is refused too.
 */
function aFinishedRunPostsOnlyItsEndMessage(input: { kind: string; data?: Record<string, unknown>; links?: readonly unknown[] }, run: string): void {
  const noLinks = input.links === undefined || input.links.length === 0
  if (!(input.kind === 'message' && input.data !== undefined && input.data['aboutRun'] === run && noLinks)) throw aFinishedRunsKeyAskedForMore(run)
  const record = getRecord(run)
  const starter = record === null ? null : starterAgentOfARun(record)
  const to = input.data['to']
  const one = Array.isArray(to) && to.length === 1 && isJsonObject(to[0]) ? to[0] : null
  const named = one !== null && one['kind'] === 'agent' && typeof one['id'] === 'string' ? theAgentAnArrivingReferenceNames(one['id'], 'writing') : null
  if (starter !== null && named !== null && named.agent.id === starter.id) return
  throw new PanelError(
    `The key this request carried belongs to run ${run}, which has finished, and its message about that run goes only to ` +
      (starter === null ? 'the agent that started it, and nobody is recorded as having started it.' : `the agent that started it, ${starter.handle}, addressed to that agent alone.`) +
      ' This message was addressed otherwise. Nothing was written.',
    403,
  )
}

/**
 * WHAT AN AGENT FILING A FORK OR A PROBLEM SAYS ABOUT IT WHEN IT SAYS NOTHING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A DEFAULT AND NOT A GUESS
 * ---------------------------------------------------------------------------------------
 *
 * Rule 5 says absence beats a guess, and everywhere else in this product an absent field means
 * NOBODY HAS SAID. Two fields have an explicit default for an agent caller: engineering questions are
 * the agent's to settle. This default was introduced on 3 September 2026. The owner's list had 66 rows on it and 43 of
 * them were forks; most were engineering choices that
 * reached the owner because an agent said nothing about who should settle them, and every reader in Mole
 * Office treats a fork nobody classified as the owner's.
 *
 * SO THIS IS NOT AN INFERENCE ABOUT THE RECORD. Nothing here reads the title, the question or the
 * kind of work. It is the AGENT'S OWN STATEMENT, made once, at the moment it files: *unless I say
 * otherwise, this is mine*. The change row and the revision credit that agent with the value, so a
 * reader asking who said this fork is an agent's gets a real answer and not "Mole Office decided".
 *
 * IT APPLIES TO AN AGENT AND TO NOTHING ELSE. A person filing a fork says nothing about who settles
 * it, exactly as before, and a fork the person files with no classification is theirs — which is what every
 * reader already treats an unclassified fork as.
 *
 * THE AGENT'S OWN CHOICE ALWAYS WINS. A body that names `who_settles_it` or `whose_move` — including
 * naming `the owner` or `person`, which is the case that matters — is stored exactly as sent. That
 * is how an agent hands a question up, and it has to be one field rather than a special route.
 */
function whatAnAgentFilingThisSaysByDefault(
  kind: string,
  sent: Record<string, unknown> | undefined,
  actor: Actor,
): Record<string, unknown> | undefined {
  if (actor.type === 'human') return sent
  const body = sent
  const said = (key: string): boolean => body !== undefined && Object.hasOwn(body, key)
  if (kind === PROPOSAL_KIND && !said(WHO_SETTLES_IT)) {
    return { ...(body ?? {}), [WHO_SETTLES_IT]: A_FORK_AN_AGENT_MAY_SETTLE }
  }
  // A PROBLEM AND NOTHING ELSE. `whose_move` is declared on four kinds — problem, task, idea and
  // direction — and only the problem is in `design/messages/ACCEPTANCE.md` W3. The other three are
  // left alone because nobody has said what an agent filing one of them means by default, and
  // guessing that here would be this default doing something W3 does not cover.
  if (kind === PROBLEM_KIND && !said(WHOSE_MOVE)) {
    return { ...(body ?? {}), [WHOSE_MOVE]: AN_AGENTS_MOVE }
  }
  return sent
}

/** The two values the defaults above write, taken from the vocabularies rather than typed out. */
const A_FORK_AN_AGENT_MAY_SETTLE: ForkSettler = 'an agent'
const AN_AGENTS_MOVE: MoveActor = 'agent'

/**
 * WHICH RUN STARTED THE RUN BEING FILED, or null because nothing here can say. Criterion P11.
 *
 * The registry row of the agent making this write says which run registered it. That is the run that
 * started it. This hands that id to the session record being filed, and ONLY in the one case where
 * it is a fact rather than a guess: the caller said nothing about a parent, the writer is a
 * registered agent, its row names a registering run, that run is a real session record here, and
 * this is the FIRST session record this agent has filed.
 *
 * EVERY ONE OF THOSE FIVE IS A REFUSAL TO GUESS. A caller that named a parent is believed. A second
 * run of the same agent gets nothing, because an agent has many runs and only the first was started
 * by the run that registered it.
 */
function theRunThatStartedThisOne(
  data: unknown,
  actor: Actor,
  workspaceId: string,
): { run: string; because: string } | null {
  if (!isJsonObject(data)) return null
  if (typeof data['parentAttachment'] === 'string' && data['parentAttachment'] !== '') return null
  if (actor.type !== 'agent') return null
  // THE CALLER'S ROW IS READ BY THE REGISTRY ID THE RESOLVER ANSWERED, never by handle.
  const row = theCallersAgentRow(actor)
  if (row === null) return null
  const startedByRun = row.startedByRun ?? null
  if (startedByRun === null) return null
  const parent = getRecord(startedByRun)
  if (parent === null || parent.kind !== SESSION_KIND || parent.workspaceId !== workspaceId) return null
  // A RUN THIS AGENT ALREADY FILED. Which agent a run serves is read by the one reader,
  // `theAgentARunServes` in lib/worker.ts: `servingAgentId` where it was written, else `servingAgent`
  // as a stored reference, else the agent record a run of the older spelling names.
  const mineAlready = listRecords({ workspaceId, kind: SESSION_KIND }).some(
    (one) => theAgentARunServes(one.data as Record<string, unknown>)?.id === row.id,
  )
  if (mineAlready) return null
  return {
    run: startedByRun,
    because: `Mole Office wrote parentAttachment: the run "${parent.title}" registered "${row.handle}", so it is the run that started it. This is the first run of that agent. A later run of the same agent gets nothing, because only the first was started by the run that registered it.`,
  }
}
