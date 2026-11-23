// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A RECORD STORES AN AGENT'S REGISTRY ID, as the declarations in src/shared/kinds.ts say.
 *
 * A participant position is every field whose declared type reaches ParticipantRef, in src/shared/kinds/shared-shapes.ts or in the
 * adapter of an open bag (./open-shapes.ts), and every open bag whose adapter type does. They are found here
 * from the declarations and never listed, so a new field of that type is a new position with nothing
 * edited. One names an agent only when its `kind` is 'agent'.
 *
 * Every other position is written out below, because its type is a plain string and only its description
 * or its writer says what the value holds. Each entry says what makes the value an
 * agent's id and how the value is read. A field whose value may be a person's id or an agent's, with
 * nothing beside it to say which, is listed too, and the reader blocks on it instead of guessing.
 * Nothing here decides by asking whether a string happens to equal an agent's id.
 *
 * The fields that look like identity and are not are listed last, each with the reason.
 *
 * The two ledgers stamp the writer of each row in a column, which schema.ts declares and kinds.ts does not. Those
 * columns are listed apart, after the fields. So are the plain columns of the stores that can hold an agent's id, which
 * schema.ts declares too, by what their writers store there, and the ones that are not read, each with why.
 */
import { KIND_SPECS, SHAPE_SPECS, THE_OWNER, type DeclaredType } from '@shared/kinds.ts'
import type { ParticipantKind } from '@shared/participants.ts'
import { SYSTEM_ACTOR_IDS_RENAMED } from '@shared/renamed-words.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import { ADAPTER_SHAPES, OPEN_BAGS, typeOf, type AdapterField } from './open-shapes.ts'

/** The shape a participant is stored in. */
export const PARTICIPANT_SHAPE = 'ParticipantRef'

export type PositionParse =
  /** A ParticipantRef: its `id` is an agent's registry id when its `kind` is 'agent'. */
  | 'participant'
  /** A plain string that always holds an agent's registry id, or a list of them. */
  | 'registry-id'
  /** A string whose sibling field says which kind of writer it names. */
  | 'actor-pair'
  /** The keys of a map, each an agent's registry id. */
  | 'map-key'
  /** A string with the id written inside it. */
  | 'encoded'
  /** An older written form of a field that is declared as something else today. */
  | 'historical'
  /** A person's id or an agent's, with nothing stored beside it to say which. A string there always blocks. */
  | 'cannot-tell'
  /** The handle a request named or the registry id its key proved. It is read only where exactly one agent answers to it. */
  | 'stamp'

export interface IdentityPosition {
  /** The kind or shape that declares the field, a dot, and the field's key. */
  site: string
  parse: PositionParse
  /** What has to be true of the stored value for it to name an agent, in words. */
  gate: string
  /** For an actor pair or a stamp: the sibling field, and its value when the writer was an agent. */
  pair?: { field: string; agent: string }
  /** For a registry id that is one only when another field is there: that field. Without it the value is the person's id. */
  present?: string
  /** For an encoded position inside an open bag: where below the field the strings sit. Without it the field is the string. */
  below?: string
  /** For a stamp that holds this value when the person made the choice: the value. It names the person and no agent, so it is not read. */
  whenThePerson?: string
  /**
   * For a stamp that rows written under the office's old system name may hold: those names. Such a row was written by the
   * office itself and names no agent, so it is not read. An agent's row under the same string is passed over with it.
   */
  oldSystemNames?: readonly string[]
}

/** The office's old system names, which a short form's writer may hold on a form the office wrote under one. */
const OLD_SYSTEM_NAMES: readonly string[] = SYSTEM_ACTOR_IDS_RENAMED.map((renamed) => renamed.from)

export interface NotAnIdentity {
  site: string
  because: string
}

const HAND_LISTED: readonly IdentityPosition[] = [
  { site: 'session.servingAgentId', parse: 'registry-id', gate: "always: the run's agent, by its registry id" },
  { site: 'BranchedFrom.agent', parse: 'registry-id', gate: "always: the old agent's registry id" },
  { site: 'note.typed_to_agent', parse: 'registry-id', gate: 'always: the agent the kept lines were typed to, by its id' },
  { site: 'goal.filed_by', parse: 'stamp', gate: "always: the agent that filed the goal, by the name the request was made under, the handle it named or the registry id its key proved, or by the old id it sent for itself" },
  { site: 'GoalConfirmation.pressed_by', parse: 'stamp', gate: "always: the secretary that pressed, by the name the request was made under, the handle it named or the registry id its key proved" },
  { site: 'AnswerSent.to', parse: 'registry-id', gate: 'always: the agent the answer was sent to' },
  { site: 'AnswerSent.by', parse: 'registry-id', gate: "when underTheGrant is beside it: the secretary that sent it; without it, the person's id", present: 'underTheGrant' },
  { site: 'BundleExporter.actorId', parse: 'stamp', gate: "when actorType is 'agent': the handle the request named or the registry id its key proved", pair: { field: 'actorType', agent: 'agent' } },
  { site: 'CheckAlsoGivenBy.actorId', parse: 'stamp', gate: "when actorType is 'agent': the handle the request named or the registry id its key proved", pair: { field: 'actorType', agent: 'agent' } },
  { site: 'ShortForm.by', parse: 'stamp', gate: "when writtenBy is 'agent': the writer's registry id, or on a form stored before that, the handle the request named; the office's old system name names no agent and is passed over", pair: { field: 'writtenBy', agent: 'agent' }, oldSystemNames: OLD_SYSTEM_NAMES },
  { site: 'ReportParts.by', parse: 'stamp', gate: "when writtenBy is 'agent': the writer's registry id, or on parts stored before that, the handle the request named; the office's old system name names no agent and is passed over", pair: { field: 'writtenBy', agent: 'agent' }, oldSystemNames: OLD_SYSTEM_NAMES },
  { site: 'session.workerRuns', parse: 'map-key', gate: "every key: the worker's registry id" },
  { site: 'message.deadLetterSweep', parse: 'encoded', gate: 'each entry of waiting: a message id and its addressee\'s registry id joined by "~"', below: 'waiting[]' },
  { site: 'message.from', parse: 'historical', gate: "an object of exactly kind and id, the old ParticipantRef form, when its kind is 'agent'" },
  { site: 'session.servingAgent', parse: 'historical', gate: 'a handle when servingAgentId is beside it; without it, a handle or an older registry id, so it blocks' },
  { site: 'RunWasAskedFor.by', parse: 'cannot-tell', gate: 'the id the request was filed under, a person or an agent, and nothing beside it says which' },
  { site: 'NextRoundReplaced.askedBy', parse: 'cannot-tell', gate: "an agent's registry id or the person's id, and nothing beside it says which" },
  { site: 'HowTheRoundEndedReleased.by', parse: 'cannot-tell', gate: 'whoever released the run, and nothing beside it says what kind of writer that was' },
  { site: 'decision.recorded_by', parse: 'cannot-tell', gate: "the request's actor, a person or an agent, and nothing beside it says which" },
  { site: 'decision.decided_by', parse: 'stamp', gate: `any value but ${JSON.stringify(THE_OWNER)}, which names the person: the handle or the id of the agent that made the choice`, whenThePerson: THE_OWNER },
  { site: 'ButtonBlock.to', parse: 'cannot-tell', gate: "the agent a press goes to, stored as its handle or its id, and nothing beside it says which" },
  { site: 'BoxBlock.to', parse: 'cannot-tell', gate: "the agent the answers go to, stored as its handle or its id, and nothing beside it says which" },
  { site: 'CarriedTo.from', parse: 'registry-id', gate: 'always: the agent a press to start a new agent carried the message from' },
  { site: 'CarriedTo.to', parse: 'registry-id', gate: 'always: the new agent the press carried the message to' },
  { site: 'AskedToResolveMessage.agent', parse: 'registry-id', gate: 'always, when it is not null: the agent the merge queue asks to resolve a conflict' },
  { site: 'AskedToResolve.agent', parse: 'registry-id', gate: 'always: the agent the merge queue asked to resolve a conflict' },
  { site: 'FixRoundAsk.agent', parse: 'registry-id', gate: 'always: the agent the merge queue asked for a fix round' },
  { site: 'FixRoundOpened.agent', parse: 'registry-id', gate: 'always: the agent whose fix round opened' },
  { site: 'RoundOpen.starter', parse: 'registry-id', gate: "always: the starter of the line's open round, by its registry id" },
  { site: 'FixRoundFact.agent', parse: 'registry-id', gate: 'always: the agent of the fix round a red class waits on' },
  { site: 'RoundOpenReserved.agent', parse: 'registry-id', gate: 'always: the agent of the repair a red class reserves for after landing' },
  { site: 'FixRoundReserved.agent', parse: 'registry-id', gate: 'always: the agent of the repair the wait reserves for after landing' },
  { site: 'SessionOpenedBy.id', parse: 'stamp', gate: "when type is 'agent': the agent that opened the run in a terminal, by the handle the request named or the registry id its key proved", pair: { field: 'type', agent: 'agent' } },
  { site: 'RunRequest.actorId', parse: 'stamp', gate: "always: the handle of the agent the run was dispatched to, as it was at dispatch" },
  { site: 'RunRequestMessage.writtenBy', parse: 'encoded', gate: "the writer's kind and its stamp joined by a colon; the stamp when the kind is 'agent'" },
  { site: 'ForestMapState.assignments', parse: 'map-key', gate: "every key: the registry id of the agent placed on the map" },
  { site: 'ForestRegion.teamId', parse: 'registry-id', gate: "always, when it is not null: the registry id of the supervisor whose team the region holds" },
  { site: 'ForestRegion.groupKey', parse: 'encoded', gate: `'${THE_SECRETARY}', or the JSON list of the project, the zone and the team's registry id or null` },
  { site: 'ForestAssignment.groupKey', parse: 'encoded', gate: `'${THE_SECRETARY}', or the JSON list of the project, the zone and the team's registry id or null` },
  { site: 'CastingWriter.id', parse: 'stamp', gate: "when kind is 'agent': the registry id, or the stamp the request carried where no agent answered to it", pair: { field: 'kind', agent: 'agent' } },
  { site: 'FolderReadingPiece.decidedBy', parse: 'cannot-tell', gate: 'whoever decided the piece, a person or an agent, and nothing beside it says which' },
  { site: 'FolderPieceUndone.by', parse: 'cannot-tell', gate: 'whoever took back the rejection, a person or an agent, and nothing beside it says which' },
  { site: 'MainSuiteFixNotice.to', parse: 'registry-id', gate: 'always: each entry is the canonical registry id of an agent the notice was sent to' },
  { site: 'NotebookEntry.writtenById', parse: 'stamp', gate: "when writtenByKind is 'agent': the agent's handle, or its registry id", pair: { field: 'writtenByKind', agent: 'agent' } },
  { site: 'TheCheckTheOfficeAskedFor.askedOf', parse: 'stamp', gate: "always: the inspector's handle, or its registry id" },
  { site: 'Elevation.grantedBy', parse: 'cannot-tell', gate: "the person, under the person's own key; in a test world the starter or the secretary that holds the person's authority, by the id as sent, and nothing beside it says which" },
  { site: 'ProvedHolder.id', parse: 'actor-pair', gate: "when how is 'an-agent-key': the agent the key proved, by its registry id", pair: { field: 'how', agent: 'an-agent-key' } },
  { site: 'ProvedHolder.claimed', parse: 'stamp', gate: "always: the name the request's headers gave instead of the key's holder, a handle or a registry id as sent" },
  { site: 'AgentTag.agents', parse: 'registry-id', gate: 'always: each entry is the registry id of an agent the person marked with the tag' },
]

/** Fields whose names or values look like identity and are not an agent's registry id. */
export const NOT_IDENTITY: readonly NotAnIdentity[] = [
  { site: 'SupersededRun.by', because: "the replacing run's record id" },
  { site: 'BranchedFrom.handle', because: "the old agent's handle" },
  { site: 'goal.owner', because: 'a chosen name or handle' },
  { site: 'GoalConfirmation.by', because: 'the person' },
  { site: 'tool.keptBy', because: 'words about who keeps the tool' },
  { site: 'notebook.agentHandle', because: 'a handle' },
  { site: 'WorkerRun.handle', because: "the worker's handle" },
  { site: 'WrittenIn.recordedBy', because: 'words naming the project a moved message was filed in' },
  { site: 'note.typed_in_terminal', because: 'a terminal reference' },
  { site: 'note.kept_from_terminal', because: 'a file reference' },
  { site: 'booking.askedFor', because: 'a time' },
  { site: 'CarriedTo.fromHandle', because: 'the handle the old agent bore at the press' },
  { site: 'CarriedTo.toHandle', because: 'the handle the new agent bore at the press' },
  { site: 'TheRoutedLineSaid.addressee', because: "the addressee's registry name, taken at send time" },
  { site: 'RoutedNameWas.name', because: "a passed-over rung's registry name, taken at send time" },
  { site: 'Summons.who', because: 'the name the mail signs with' },
  { site: 'MergeSeal.id', because: "the seal record's id" },
  { site: 'MergeSuperseded.by', because: "the newer merge entry's id" },
  { site: 'MergeTool.session', because: "the merge tool's run record id" },
  { site: 'MergeStalls.secretary', because: 'the id of the message the secretary was sent' },
  { site: 'MergeTold.submitter', because: 'the ids of the messages the submitter was sent' },
  { site: 'MergeTold.secretary', because: 'the id of the message the secretary was sent' },
  { site: 'FixRoundAsk.holder', because: 'the run that held the line when it was asked' },
  { site: 'RoundOpenReserved.holder', because: 'the run the reserved repair is kept on' },
  { site: 'FixRoundReserved.holder', because: 'the run the reserved repair is kept on' },
  { site: 'PlaceholderCommit.author', because: "a commit's author address" },
  { site: 'PlaceholderCommit.committer', because: "a commit's committer address" },
  { site: 'IntegrationReceipt.sealId', because: "the seal record's id" },
  { site: 'MergeDeletes.asked', because: 'the id of the message that asked for the press' },
  { site: 'PressToLand.asked', because: 'the id of the message that asked for the press' },
  { site: 'RunRequest.agentId', because: "the agent's record id" },
  { site: 'RunRequest.agentKeyId', because: "the id of the key the run was given" },
  { site: 'RunRequestRecipient.sessionRecordId', because: "the run's session record id" },
  { site: 'RunRequestResume.externalId', because: "the runtime's own conversation id" },
  { site: 'RunRequestQuote.commentId', because: "the comment's record id" },
  { site: 'FolderReadingPiece.recordId', because: 'the id of the record the piece became' },
  { site: 'CastingHold.run', because: "the run's record id" },
  { site: 'CastingDecision.id', because: "the decision record's id" },
  { site: 'AskAtTheDoorInputs.request', because: "the ask's id" },
  { site: 'RuleMarkInputs.chapter', because: "the chapter record's id" },
  { site: 'ChosenRecipient.agentId', because: "the id of an agent record, which the re-mint keeps" },
  { site: 'RanAs.agentId', because: "the id of the agent record the run worked as, which the re-mint keeps" },
  { site: 'work_domain.agent', because: "the id of the agent record the work belongs to, which the re-mint keeps" },
]

/** A column of the changes or revisions table that stamps who wrote the row. */
export interface LedgerStamp {
  /** The table, a dot, and the column. */
  site: string
  /** The column beside it that says which kind of writer it names, and its value when the writer was an agent. */
  pair: { field: string; agent: string }
  gate: string
}

const STAMP_GATE =
  "when actor_type is 'agent' and the writer is not one of the office's own parts: the handle the request named or the registry id its key proved, read only where exactly one agent answers to it"

/** WHERE THE TWO LEDGERS STAMP A ROW'S WRITER. For an agent each holds a handle or a registry id, and nothing beside it says which. */
export const LEDGER_STAMPS: readonly LedgerStamp[] = [
  { site: 'changes.actor_id', pair: { field: 'actor_type', agent: 'agent' }, gate: STAMP_GATE },
  { site: 'revisions.actor_id', pair: { field: 'actor_type', agent: 'agent' }, gate: STAMP_GATE },
]

const A_SESSION = "a session record's id, or the reference the request sent where no session answered to it"

/** The ledger columns that look like identity and are not an agent's. */
export const LEDGER_NOT_IDENTITY: readonly NotAnIdentity[] = [
  { site: 'changes.session_id', because: A_SESSION },
  { site: 'revisions.session_id', because: A_SESSION },
]

/** What a plain column holds when it names an agent. */
export type PlainIdHolds =
  /** The agent's registry id. One written before the re-mint is an old id. */
  | 'registry-id'
  /** The id of an agent record, which the re-mint keeps, or an agent's registry id: told by whether an agent record has that id. */
  | 'record-or-registry-id'
  /** The id the request sent, a handle or a registry id, stored as it came. */
  | 'as-sent'
  /** A registry id from some writers and the id as sent from others, with nothing stored to say which. */
  | 'mixed'
  /** A handle, by design. */
  | 'handle'

/**
 * A plain column of a store outside the records table that can hold an agent's id. One with a pair holds an agent's only
 * when the pair says agent. One that holds the id as sent, or a handle, is read only where exactly one agent answers to
 * it, and the office's own writers are not read.
 */
export interface PlainIdColumn {
  /** The table, a dot, and the column. */
  site: string
  holds: PlainIdHolds
  /**
   * How the id is written, when it is not alone. 'type:id' is the writer's type, one of ACTOR_TYPES, a colon and the id.
   * 'kind:id' is a participant's kind, one of PARTICIPANT_KINDS, a colon and the id. 'contact' is a participant's key, which
   * is a 'kind:id', or the key of a writer no registry held. 'pair' is two agents' registry ids joined by a tilde, or a
   * group's id. 'side-of-pair' is the id of one side of the conversation in the column `pair` beside it.
   */
  form?: 'type:id' | 'kind:id' | 'contact' | 'pair' | 'side-of-pair'
  /**
   * The column beside it that says whether the person or an agent is named, and its value for an agent, one of
   * PARTICIPANT_KINDS. Left out, every value the column holds names an agent. `untoldWithoutIt` says a row whose column
   * beside it holds nothing cannot be told: its writer stores the kind now, and a row written before it did, that a
   * migration could not tell, has none.
   */
  pair?: { field: string; agent: ParticipantKind; untoldWithoutIt?: true }
  gate: string
}

const ANSWER_GATE =
  "when answered_by_kind is 'agent': the secretary the person's grant carried here, or the agent that withdrew what it had brought, by the registry id its key proved"

const RESOLVED = 'read only where exactly one agent answers to it'
const keyProved = (field: string, who: string) => `when ${field} is 'agent': ${who}, by the registry id its key proved`
const asSent = (field: string, who: string) => `when ${field} is 'agent': ${who}, by the handle or the registry id the request sent, ${RESOLVED}`
const typeAndId = (who: string) => `when the type before the colon is 'agent': ${who}, by the handle or the registry id the request sent, ${RESOLVED}`
const KEYED = 'always: an agent, by its registry id, which a foreign key ties to agents.id and the re-mint rewrites with it'
const byItsId = (field: string, who: string) => `when ${field} is 'agent': ${who}, by its registry id`
// A row written before migration 0311 that its data half could not tell holds no kind, and is counted, not read.
const NO_KIND_IS_UNTOLD = "a row with no kind beside it, written before migration 0311, is counted as one that cannot be told"

/**
 * WHERE A STORE KEEPS AN AGENT'S ID IN A PLAIN COLUMN, by what the column's writers store there. One written before the
 * re-mint holds an old id. Each column that can hold an agent's id and is not read is in ID_COLUMNS_NOT_READ, with why.
 * A row of a column whose pair is marked `untoldWithoutIt`, with nothing in the column beside it, cannot be told: the
 * census counts those rows, and a project's archive is refused while there is one.
 */
export const PLAIN_ID_COLUMNS: readonly PlainIdColumn[] = [
  { site: 'agents.owner_id', holds: 'mixed', pair: { field: 'owner_kind', agent: 'agent' }, gate: 'when an owner is recorded: the responsible agent by registry id or its earlier stored reference' },
  { site: 'one_press_requests.asked_by', holds: 'registry-id', gate: 'always: the secretary that asked, by the registry id its key proved' },
  { site: 'one_press_requests.answered_by_id', holds: 'registry-id', pair: { field: 'answered_by_kind', agent: 'agent' }, gate: ANSWER_GATE },
  { site: 'signing_packages.brought_by', holds: 'registry-id', gate: 'always: the secretary that brought the package, by the registry id its key proved' },
  { site: 'signing_packages.for_agent', holds: 'registry-id', gate: 'always: the agent the package names, by its registry id' },
  { site: 'signing_packages.answered_by_id', holds: 'registry-id', pair: { field: 'answered_by_kind', agent: 'agent' }, gate: ANSWER_GATE },
  { site: 'signing_package_items.carried_out_by', holds: 'registry-id', gate: 'once the agent the package names has carried out a held item, whether or not its act ran: that agent, by its registry id' },
  { site: 'assets.created_by_id', holds: 'registry-id', pair: { field: 'created_by_kind', agent: 'agent' }, gate: keyProved('created_by_kind', 'the agent that filed the asset') },
  { site: 'agents.state_by_id', holds: 'registry-id', pair: { field: 'state_by_kind', agent: 'agent' }, gate: keyProved('state_by_kind', "the agent that set the agent's state") },
  { site: 'agents.created_by_id', holds: 'registry-id', pair: { field: 'created_by_kind', agent: 'agent' }, gate: keyProved('created_by_kind', "the agent that made the agent's row") },
  { site: 'agents.resident_named_by_id', holds: 'registry-id', pair: { field: 'resident_named_by_kind', agent: 'agent' }, gate: keyProved('resident_named_by_kind', 'the agent that named the resident') },
  { site: 'people.address_set_by_id', holds: 'registry-id', pair: { field: 'address_set_by_kind', agent: 'agent' }, gate: keyProved('address_set_by_kind', "the agent that set the person's address; only an agent whose key was proved reaches the writer") },
  { site: 'agents.address_set_by_id', holds: 'registry-id', pair: { field: 'address_set_by_kind', agent: 'agent' }, gate: keyProved('address_set_by_kind', "the agent that set the agent's address; only an agent whose key was proved reaches the writer") },
  { site: 'resident_read_grants.given_by_id', holds: 'registry-id', pair: { field: 'given_by_kind', agent: 'agent' }, gate: keyProved('given_by_kind', 'the agent that gave the grant') },
  { site: 'resident_read_grants.ended_by_id', holds: 'registry-id', pair: { field: 'ended_by_kind', agent: 'agent' }, gate: keyProved('ended_by_kind', 'the agent that ended the grant') },
  { site: 'resident_void_marks.marked_by_id', holds: 'registry-id', pair: { field: 'marked_by_kind', agent: 'agent' }, gate: keyProved('marked_by_kind', 'the agent that made the mark') },
  { site: 'resident_space_writes.written_by_id', holds: 'registry-id', pair: { field: 'written_by_kind', agent: 'agent' }, gate: keyProved('written_by_kind', "the agent that wrote into the resident's space") },
  { site: 'resident_sleeps.by_id', holds: 'registry-id', pair: { field: 'by_kind', agent: 'agent' }, gate: keyProved('by_kind', 'the agent that put the resident to sleep or put its sleep off') },
  { site: 'agents.resident_confirmed_by_id', holds: 'registry-id', pair: { field: 'resident_confirmed_by_kind', agent: 'agent' }, gate: keyProved('resident_confirmed_by_kind', "the agent that confirmed the resident; the writer's fallback stores the id as sent under the person's kind, so only the agent's kind is read") },
  { site: 'agent_renames.proposed_by_id', holds: 'registry-id', pair: { field: 'proposed_by_kind', agent: 'agent' }, gate: keyProved('proposed_by_kind', 'the agent that proposed the new name') },
  { site: 'agent_renames.approver_id', holds: 'registry-id', pair: { field: 'approver_kind', agent: 'agent' }, gate: byItsId('approver_kind', 'the secretary the new name waits for') },
  { site: 'agent_renames.answered_by_id', holds: 'registry-id', pair: { field: 'answered_by_kind', agent: 'agent' }, gate: keyProved('answered_by_kind', 'the secretary that approved or refused the new name') },
  { site: 'agent_starter_changes.from_id', holds: 'registry-id', pair: { field: 'from_kind', agent: 'agent' }, gate: byItsId('from_kind', "the agent's starter before the change") },
  { site: 'agent_starter_changes.to_id', holds: 'registry-id', pair: { field: 'to_kind', agent: 'agent' }, gate: byItsId('to_kind', "the agent's new starter") },
  { site: 'agent_starter_changes.asked_by_id', holds: 'registry-id', pair: { field: 'asked_by_kind', agent: 'agent' }, gate: byItsId('asked_by_kind', "the agent that pressed for the change, inside a test world, where it holds the person's authority") },
  { site: 'agent_owner_changes.from_id', holds: 'registry-id', pair: { field: 'from_kind', agent: 'agent' }, gate: byItsId('from_kind', "the agent's owner before the hand-over, as its row held it") },
  { site: 'agent_owner_changes.to_id', holds: 'registry-id', pair: { field: 'to_kind', agent: 'agent' }, gate: byItsId('to_kind', "the agent's new owner") },
  { site: 'agent_owner_changes.made_by_id', holds: 'registry-id', pair: { field: 'made_by_kind', agent: 'agent' }, gate: keyProved('made_by_kind', 'the agent that made the hand-over') },
  { site: 'agents.successor_named_by_id', holds: 'registry-id', pair: { field: 'successor_named_by_kind', agent: 'agent' }, gate: keyProved('successor_named_by_kind', "the agent that named the successor; the writer's fallback stores the id as sent under the person's kind, so only the agent's kind is read") },
  { site: 'conversation_reads.reader_id', holds: 'registry-id', pair: { field: 'reader_kind', agent: 'agent' }, gate: keyProved('reader_kind', 'the agent that read the conversation') },
  { site: 'groups.opened_by_id', holds: 'registry-id', pair: { field: 'opened_by_kind', agent: 'agent' }, gate: keyProved('opened_by_kind', 'the agent that opened the group') },
  { site: 'dead_letter_claims.claimed_by_id', holds: 'registry-id', pair: { field: 'claimed_by_kind', agent: 'agent' }, gate: keyProved('claimed_by_kind', 'the agent that claimed the undelivered message') },
  { site: 'handovers.written_by_id', holds: 'registry-id', pair: { field: 'written_by_kind', agent: 'agent' }, gate: keyProved('written_by_kind', 'the agent that wrote the handover') },
  { site: 'readiness_checklists.raised_by_id', holds: 'registry-id', pair: { field: 'raised_by_kind', agent: 'agent' }, gate: keyProved('raised_by_kind', 'the agent that raised the checklist') },
  { site: 'readiness_checklists.closed_by_id', holds: 'registry-id', pair: { field: 'closed_by_kind', agent: 'agent' }, gate: keyProved('closed_by_kind', 'the agent that closed the checklist') },
  { site: 'readiness_signatures.signer_id', holds: 'registry-id', pair: { field: 'signer_kind', agent: 'agent' }, gate: keyProved('signer_kind', 'the agent that signed') },
  { site: 'office_scene_settings.updated_by_id', holds: 'registry-id', pair: { field: 'updated_by_kind', agent: 'agent' }, gate: keyProved('updated_by_kind', "the agent that last changed the office scene's settings") },
  { site: 'message_delivery.recipient_id', holds: 'registry-id', pair: { field: 'recipient_kind', agent: 'agent' }, gate: byItsId('recipient_kind', 'the agent the message was delivered to') },
  { site: 'notice_batch_turns.recipient_id', holds: 'registry-id', pair: { field: 'recipient_kind', agent: 'agent' }, gate: byItsId('recipient_kind', "the agent whose turn of the notice batch it is") },
  { site: 'group_members.member_id', holds: 'registry-id', pair: { field: 'member_kind', agent: 'agent' }, gate: byItsId('member_kind', 'the agent that is a member of the group') },
  { site: 'work_claims.claimant_id', holds: 'registry-id', pair: { field: 'claimant_kind', agent: 'agent' }, gate: byItsId('claimant_kind', 'the agent that claimed the work') },
  { site: 'contact_groups.owner_id', holds: 'registry-id', pair: { field: 'owner_kind', agent: 'agent' }, gate: byItsId('owner_kind', 'the agent whose contacts the group sorts') },
  { site: 'contact_placements.owner_id', holds: 'registry-id', pair: { field: 'owner_kind', agent: 'agent' }, gate: byItsId('owner_kind', 'the agent whose contacts the placement sorts') },
  { site: 'contact_group_collapses.owner_id', holds: 'registry-id', pair: { field: 'owner_kind', agent: 'agent' }, gate: byItsId('owner_kind', 'the agent whose contacts list has the group folded') },
  { site: 'handovers.agent_id', holds: 'registry-id', gate: 'always: the agent the handover is for, by its registry id, never a handle' },
  { site: 'quick_input_asks.agent_id', holds: 'registry-id', gate: 'always: the agent the run serves, whose terminal it is, by its registry id' },
  { site: 'plans.read_by_agent', holds: 'registry-id', gate: "once a secretary has marked the plan read under the person's grant: that secretary, by its registry id" },
  { site: 'office_restart_grants.agent_id', holds: 'registry-id', gate: 'always: the agent the restart grant is given to, by its registry id' },
  { site: 'resident_read_grants.resident_id', holds: 'registry-id', gate: KEYED },
  { site: 'resident_read_grants.reader_id', holds: 'registry-id', gate: KEYED },
  { site: 'resident_void_marks.resident_id', holds: 'registry-id', gate: KEYED },
  { site: 'resident_space_writes.resident_id', holds: 'registry-id', gate: KEYED },
  { site: 'resident_sleeps.agent_id', holds: 'registry-id', gate: KEYED },
  { site: 'agent_records.agent_id', holds: 'registry-id', gate: KEYED },
  { site: 'handle_holds.agent_id', holds: 'registry-id', gate: KEYED },
  { site: 'agent_renames.agent_id', holds: 'registry-id', gate: KEYED },
  { site: 'agent_starter_changes.agent_id', holds: 'registry-id', gate: KEYED },
  { site: 'agent_owner_changes.agent_id', holds: 'registry-id', gate: KEYED },
  { site: 'dead_letter_claims.agent_id', holds: 'registry-id', gate: "always: the agent the undelivered messages were sent to, copied from a delivery's recipient_id where recipient_kind is 'agent'" },
  { site: 'agents.successor_id', holds: 'registry-id', gate: 'once a successor is named: the agent that takes over from this one, by its registry id' },
  { site: 'installation.dead_letter_secretary', holds: 'registry-id', gate: 'once one is chosen: the secretary that undelivered messages go to, by its registry id' },
  { site: 'installation.merge_queue_owner', holds: 'registry-id', gate: 'once one is chosen: the agent that keeps the merge queue, by its registry id' },
  { site: 'workspaces.module_reminder_secretary', holds: 'registry-id', gate: "once one is chosen: the secretary that the project's module reminders go to, by its registry id" },
  { site: 'counter_rows.by', holds: 'registry-id', form: 'kind:id', gate: "when the kind before the colon is 'agent': the agent that wrote the counter's row, by its registry id" },
  { site: 'contact_placements.contact', holds: 'registry-id', form: 'contact', gate: "when the key is a kind of 'agent', a colon and an id: the agent placed in the list, by its registry id; the key of a writer no registry held is that writer's own and is not read" },
  { site: 'conversation_reads.pair', holds: 'registry-id', form: 'pair', gate: "for a conversation between two agents: both, by their registry ids joined by a tilde; a group's id names no agent" },
  { site: 'conversation_reads.as_side', holds: 'registry-id', form: 'side-of-pair', pair: { field: 'as_side_kind', agent: 'agent', untoldWithoutIt: true }, gate: `when as_side_kind is 'agent': for a conversation between two agents, the one whose side it was read as, and for a group, the member whose side it was, by its registry id; a read as neither side names nobody; ${NO_KIND_IS_UNTOLD}` },
  { site: 'agent_messages.recipient_agent_id', holds: 'record-or-registry-id', gate: "the id of the agent record the message is for, which the re-mint keeps, or the agent's registry id where it has no record; a value that is both an agent record's id and an agent's blocks" },
  { site: 'installation.window_closed_by_id', holds: 'as-sent', pair: { field: 'window_closed_by_kind', agent: 'agent' }, gate: asSent('window_closed_by_kind', 'the agent that closed the window') },
  { site: 'visitor_credentials.confirmed_by_id', holds: 'as-sent', pair: { field: 'confirmed_by_kind', agent: 'agent' }, gate: asSent('confirmed_by_kind', 'the agent that confirmed the visitor') },
  { site: 'trusted_machines.added_by_id', holds: 'as-sent', pair: { field: 'added_by_kind', agent: 'agent' }, gate: asSent('added_by_kind', 'the agent that added the machine') },
  { site: 'trusted_machines.removed_by_id', holds: 'as-sent', pair: { field: 'removed_by_kind', agent: 'agent' }, gate: asSent('removed_by_kind', 'the agent that removed the machine') },
  { site: 'worlds.started_by_id', holds: 'as-sent', pair: { field: 'started_by_kind', agent: 'agent' }, gate: asSent('started_by_kind', 'the agent that started the world') },
  { site: 'message_delivery.remind_set_by_id', holds: 'as-sent', pair: { field: 'remind_set_by_kind', agent: 'agent' }, gate: asSent('remind_set_by_kind', 'the agent that set the reminder') },
  { site: 'run_models.updated_by_id', holds: 'as-sent', pair: { field: 'updated_by_kind', agent: 'agent' }, gate: asSent('updated_by_kind', 'the agent that last changed the run models') },
  { site: 'preview_root_additions.updated_by_id', holds: 'as-sent', pair: { field: 'updated_by_kind', agent: 'agent' }, gate: asSent('updated_by_kind', 'the agent that last changed the preview roots') },
  { site: 'price_table.updated_by_id', holds: 'as-sent', pair: { field: 'updated_by_kind', agent: 'agent' }, gate: asSent('updated_by_kind', 'the agent that last changed the price table') },
  { site: 'quick_input_list.updated_by_id', holds: 'as-sent', pair: { field: 'updated_by_kind', agent: 'agent' }, gate: asSent('updated_by_kind', 'the agent that last changed the quick input list') },
  { site: 'what_the_grant_carries.updated_by_id', holds: 'as-sent', pair: { field: 'updated_by_kind', agent: 'agent' }, gate: asSent('updated_by_kind', "the agent that last changed what the door's grant carries") },
  { site: 'quick_input_asks.asked_by_id', holds: 'as-sent', pair: { field: 'asked_by_kind', agent: 'agent' }, gate: asSent('asked_by_kind', 'the agent that asked') },
  { site: 'casting.changed_by_id', holds: 'as-sent', pair: { field: 'changed_by_kind', agent: 'agent' }, gate: asSent('changed_by_kind', 'the agent that changed the casting, written by migration 0189 and the first casting writer; nothing writes it since 0190') },
  { site: 'casting_changes.by_id', holds: 'as-sent', pair: { field: 'by_kind', agent: 'agent' }, gate: asSent('by_kind', 'the agent that made the change, written by migration 0189 and the first casting writer; nothing writes it since 0190') },
  { site: 'api_calls.actor_id', holds: 'as-sent', pair: { field: 'actor_type', agent: 'agent' }, gate: asSent('actor_type', 'the agent that made the call') },
  { site: 'header_only_calls.actor_id', holds: 'as-sent', pair: { field: 'actor_type', agent: 'agent' }, gate: asSent('actor_type', 'the agent that made the call') },
  { site: 'outside_reads.actor_id', holds: 'as-sent', pair: { field: 'actor_type', agent: 'agent' }, gate: asSent('actor_type', 'the agent that read') },
  { site: 'usage_stretches.actor_id', holds: 'as-sent', pair: { field: 'actor_type', agent: 'agent' }, gate: asSent('actor_type', 'the agent whose use the stretch counts') },
  { site: 'tool_uses.actor_id', holds: 'as-sent', pair: { field: 'actor_type', agent: 'agent' }, gate: asSent('actor_type', 'the agent that used the tool') },
  { site: 'links.created_by', holds: 'as-sent', pair: { field: 'created_by_type', agent: 'agent' }, gate: asSent('created_by_type', 'the agent that made the link') },
  { site: 'visits.visitor_id', holds: 'as-sent', pair: { field: 'visitor_kind', agent: 'agent' }, gate: asSent('visitor_kind', 'the agent that visited') },
  { site: 'presses_for_the_person.agent_id', holds: 'as-sent', gate: `always: the agent that pressed, as the change row's actor_id names it, by the handle or the registry id the request sent, ${RESOLVED}` },
  { site: 'presentation_intent.updated_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that last changed how it is shown') },
  { site: 'source_index.built_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that built the index') },
  { site: 'repositories.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that added the repository') },
  { site: 'allocations.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that made the allocation') },
  { site: 'planning_capacity.updated_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that last changed the capacity') },
  { site: 'planning_intents.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that made the intent') },
  { site: 'planning_recurrences.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that made the recurrence') },
  { site: 'work_windows.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that made the window') },
  { site: 'plans.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that made the plan') },
  { site: 'plan_lines.updated_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that last changed the line') },
  { site: 'plan_line_revisions.changed_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that changed the line') },
  { site: 'implementation_revisions.stated_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that stated the revision') },
  { site: 'implementation_map.accepted_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that accepted the map') },
  { site: 'agent_threads.created_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that started the thread') },
  { site: 'panel_layouts.updated_by', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent that last changed the layout, by a writer removed on 10 August 2026') },
  { site: 'reader_anchors.reader', holds: 'as-sent', form: 'type:id', gate: typeAndId('the agent whose place in the reading the anchor keeps') },
  { site: 'agents.started_by_id', holds: 'mixed', pair: { field: 'started_by_kind', agent: 'agent' }, gate: `when started_by_kind is 'agent': the agent that started it, copied from the record's startedBy, which holds a registry id from some writers and the id as sent from others, ${RESOLVED}` },
  { site: 'agents.retired_by_id', holds: 'mixed', pair: { field: 'retired_by_kind', agent: 'agent' }, gate: `when retired_by_kind is 'agent': the agent that retired it, by a registry id from the record writer and the id as sent from the mail tool, ${RESOLVED}` },
  { site: 'casting_rows.changed_by_id', holds: 'mixed', pair: { field: 'changed_by_kind', agent: 'agent' }, gate: `when changed_by_kind is 'agent': the agent that changed the row, by the registry id the writer resolves today, and as sent in rows migration 0190 copied and rows written on 30 Sep, ${RESOLVED}` },
  { site: 'casting_row_changes.by_id', holds: 'mixed', pair: { field: 'by_kind', agent: 'agent' }, gate: `when by_kind is 'agent': the agent that made the change, by the registry id the writer resolves today, and as sent in rows migration 0190 copied and rows written on 30 Sep, ${RESOLVED}` },
  { site: 'casting_labels.changed_by_id', holds: 'mixed', pair: { field: 'changed_by_kind', agent: 'agent' }, gate: `when changed_by_kind is 'agent': the agent that changed the label last, by the registry id the writer resolves, and as sent where it resolves nobody, ${RESOLVED}` },
  { site: 'casting_label_changes.by_id', holds: 'mixed', pair: { field: 'by_kind', agent: 'agent' }, gate: `when by_kind is 'agent': the agent that made the change, by the registry id the writer resolves, and as sent where it resolves nobody, ${RESOLVED}` },
  { site: 'providers.added_by_id', holds: 'mixed', pair: { field: 'added_by_kind', agent: 'agent' }, gate: `when added_by_kind is 'agent': the agent that added the provider, by the registry id the writer resolves, and as sent where it resolves nobody, ${RESOLVED}` },
  { site: 'providers.changed_by_id', holds: 'mixed', pair: { field: 'changed_by_kind', agent: 'agent' }, gate: `when changed_by_kind is 'agent': the agent that changed the provider last, by the registry id the writer resolves, and as sent where it resolves nobody, ${RESOLVED}` },
  { site: 'provider_changes.by_id', holds: 'mixed', pair: { field: 'by_kind', agent: 'agent' }, gate: `when by_kind is 'agent': the agent that made the change, by the registry id the writer resolves, and as sent where it resolves nobody, ${RESOLVED}` },
  { site: 'session_resources.registered_by', holds: 'mixed', form: 'type:id', gate: `when the type before the colon is 'agent': the agent that registered the resource, by a registry id or the id as sent, and the API server under its own name, ${RESOLVED}` },
  { site: 'session_resources.released_by', holds: 'mixed', form: 'type:id', gate: `when the type before the colon is 'agent': the agent that released the resource, by a registry id or the id as sent, and the API server under its own name, ${RESOLVED}` },
  { site: 'implementation_map.stated_by', holds: 'mixed', form: 'type:id', gate: `when the type before the colon is 'agent': the agent that stated the map, by a registry id or the id as sent, and a migration under its own name, ${RESOLVED}` },
  { site: 'agent_messages.created_by', holds: 'mixed', form: 'type:id', gate: `when the type before the colon is 'agent': the agent that wrote the message, by a registry id or the id as sent, and a handle where the office writes it, ${RESOLVED}` },
  { site: 'reviews.started_by', holds: 'mixed', form: 'type:id', gate: `when the type before the colon is 'agent': the agent that started the review, by a registry id, and a handle where its migration copied one, ${RESOLVED}` },
  { site: 'held_keys.whose_id', holds: 'handle', pair: { field: 'whose_kind', agent: 'agent' }, gate: `when whose_kind is 'agent': the agent the key is held for, by its handle, ${RESOLVED}` },
  { site: 'folder_readings.read_by', holds: 'as-sent', pair: { field: 'read_by_kind', agent: 'agent', untoldWithoutIt: true }, gate: `${asSent('read_by_kind', 'the agent that filed the reading')}; ${NO_KIND_IS_UNTOLD}` },
  { site: 'folder_readings.owner_id', holds: 'as-sent', pair: { field: 'owner_kind', agent: 'agent', untoldWithoutIt: true }, gate: `${asSent('owner_kind', 'the agent that filed the reading, the same id its writer stores in read_by')}; ${NO_KIND_IS_UNTOLD}` },
  { site: 'revalidations.decided_by', holds: 'as-sent', pair: { field: 'decided_by_kind', agent: 'agent', untoldWithoutIt: true }, gate: `${asSent('decided_by_kind', 'the agent that judged the record against the restriction')}; ${NO_KIND_IS_UNTOLD}` },
]

/** Why a column that can hold an agent's id is not read. */
export type NotReadBecause =
  /** No writer fills it. */
  | 'always-null'
  /** Every writer stores a person there. */
  | 'never-an-agent'
  /** What it holds is not an agent's id. */
  | 'not-an-identity'
  /** A log that keeps what was named at the time, which never follows an alias. */
  | 'history'

export interface AColumnNotRead {
  /** The table, a dot, and the column. */
  site: string
  because: NotReadBecause
  why: string
}

const PROVED = "the method by which the writer's identity was proved, not who the writer is"

/**
 * THE CALL LOG'S TARGET ON A ROUTE THAT TAKES AN AGENT. api_calls.target_id holds the route's outer path parameter as it
 * was called, and its writer always stores nothing in api_calls.target_kind (usage.ts), so the stored route is the only
 * thing that says the parameter is an agent. These are the routes whose outer parameter is an agent, each as the router
 * names it. A stored route is one of them when it is that route or goes on below it. The census does not read the target,
 * and the re-mint reads it by the rule on those rows alone (remint-plain.ts). A test holds the list to the router's own.
 */
export const AN_AGENTS_ROUTE_TARGET: { site: string; field: string; routes: readonly string[] } = {
  site: 'api_calls.target_id',
  field: 'route',
  routes: [
    '/api/agents/:agent',
    '/api/agents/:handle',
    '/api/agents/:id',
    '/api/handles/:handle',
    '/api/office/appearance/:agentId',
    '/api/office/run-models/agent/:agent',
    '/api/office/run-models/for/:agent',
    '/api/participants/agent/:id',
    '/api/residents/:agentId',
    '/api/restore/:handle',
    '/api/roles/card/:handle',
    '/api/roles/elevation/:handle',
    '/api/secretaries/:agent',
    '/api/terminals/agents/:agent',
  ],
}

/**
 * THE PLAIN COLUMNS THAT MAY HOLD AN AGENT'S ID AND ARE NOT READ, each with why. A column is here because its name says
 * it may, because a kind or a type is stored beside it, or because the schema's comment on it names an agent.
 */
export const ID_COLUMNS_NOT_READ: readonly AColumnNotRead[] = [
  { site: 'agent_messages.taken_by_agent_id', because: 'always-null', why: 'no writer in the office fills it, so every row holds nothing' },
  { site: 'agent_messages.written_by_agent_id', because: 'always-null', why: 'no writer in the office fills it, so every row holds nothing' },
  { site: 'people.created_by_id', because: 'never-an-agent', why: "no writer stores an agent there, only the person who made the person's row" },
  { site: 'records.owner_id', because: 'never-an-agent', why: "the person who owns the record: its writer stores the person for every actor that is not a person" },
  { site: 'links.owner_id', because: 'never-an-agent', why: "the person who owns the link: its writer stores the person for every actor that is not a person" },
  { site: 'changes.warrant', because: 'never-an-agent', why: "the id of the warrant record a change was made under, or the words the person gave for it, never an agent's id" },
  { site: 'revisions.warrant', because: 'never-an-agent', why: "the id of the warrant record a revision was made under, or the words the person gave for it, never an agent's id" },
  {
    site: AN_AGENTS_ROUTE_TARGET.site,
    because: 'history',
    why:
      "the route's outer path parameter as it was called; the census does not read it, because a request log keeps what was called then, and a call log of a renamed agent still says the handle that was called. " +
      "The re-mint rewrites a legacy agent's old id there only on a route of AN_AGENTS_ROUTE_TARGET, where one agent answers to it by that id",
  },
  { site: 'changes.proved_by', because: 'not-an-identity', why: PROVED },
  { site: 'revisions.proved_by', because: 'not-an-identity', why: PROVED },
  { site: 'agent_messages.proved_by', because: 'not-an-identity', why: PROVED },
  { site: 'quick_input_asks.proved_by', because: 'not-an-identity', why: PROVED },
  { site: 'held_keys.mint_proved_by', because: 'not-an-identity', why: 'one word that says how the call that made the key was proved, not who made it' },
  { site: 'revalidations.reached_by', because: 'not-an-identity', why: 'the JSON list of links the revalidation reached its record by, as it was when the row was written' },
  { site: 'revalidations.written_by', because: 'not-an-identity', why: "the act that wrote the row, 'resolution' or 'judgement', not who did it" },
  { site: 'message_delivery.inferred_by', because: 'not-an-identity', why: "the name of the writer that worked the recipient out, a migration's or the message door's, not an agent" },
  { site: 'message_delivery.carried_in', because: 'not-an-identity', why: "the id of the message that carries this row's words to its recipient, a sent review's message, not an agent" },
  { site: 'agent_runs.claimed_by', because: 'not-an-identity', why: 'the worker that took the run, not an agent' },
  { site: 'agent_runs.agent_id', because: 'not-an-identity', why: 'the id of the agent record the run is for, which the re-mint keeps' },
  { site: 'reviews.started_by_agent', because: 'not-an-identity', why: 'the id of the agent record of the agent that started the review, which the re-mint keeps, sent by the person and read through agent_records' },
  { site: 'reviews.goes_to', because: 'not-an-identity', why: "the recipient the person chose, as JSON, which names an agent by its agent record's id, which the re-mint keeps, or a run by its session record" },
  { site: 'agent_records.record_id', because: 'not-an-identity', why: "the id of the agent record, which the re-mint keeps; the agent's registry id is agent_id beside it" },
  { site: 'agent_messages.role', because: 'not-an-identity', why: 'the word for who said the message, a person, an agent or the system, not who it was' },
  { site: 'agent_messages.run_id', because: 'not-an-identity', why: 'the run the message came out of, by its id, not the agent' },
  { site: 'agent_messages.handled_note', because: 'not-an-identity', why: 'words about what the receiving agent did, and the run that said so' },
  { site: 'agent_runs.state', because: 'not-an-identity', why: 'one of the words for the state a run is in' },
  { site: 'agent_runs.recipient_session_id', because: 'not-an-identity', why: 'the session record the run is addressed to, by its id' },
  { site: 'agents.name', because: 'not-an-identity', why: 'the name a reader sees, which is words and not an id' },
  { site: 'agents.state', because: 'not-an-identity', why: 'short words about what the agent is doing; who set them is state_by_id' },
  { site: 'agents.runtime', because: 'not-an-identity', why: 'the word for the program the agent ran under, which nothing writes now' },
  { site: 'agents.role', because: 'not-an-identity', why: 'a word from the role declaration, what the agent may do' },
  { site: 'agents.work_area', because: 'not-an-identity', why: 'the JSON list of the paths the agent works in' },
  { site: 'agents.started_for', because: 'not-an-identity', why: "the id of the record whose end ends the agent's role, not an agent" },
  { site: 'agents.started_by_run', because: 'not-an-identity', why: 'the session record of the run that registered the agent, by its id' },
  { site: 'agents.retired', because: 'not-an-identity', why: 'one or zero, whether the agent is given new work' },
  { site: 'agents.home_world', because: 'not-an-identity', why: 'the id of the world the agent belongs to' },
  { site: 'agents.credential', because: 'not-an-identity', why: 'the id of the visitor credential the agent was registered on' },
  { site: 'agents.address_name', because: 'not-an-identity', why: 'words for how the agent wishes to be addressed' },
  { site: 'agents.resident_since', because: 'not-an-identity', why: 'the time the agent became a permanent resident' },
  { site: 'agents.run_keys_only', because: 'not-an-identity', why: 'one or zero, whether the agent was registered with no key of its own' },
  { site: 'agents.sleep_time_starts', because: 'not-an-identity', why: "the time of day a secretary's own sleep begins, as HH:MM" },
  { site: 'people.name', because: 'not-an-identity', why: 'the name a reader sees, which is words and not an id' },
  { site: 'people.presence_choice', because: 'not-an-identity', why: 'the word a person chose for whether they are here' },
  { site: 'people.role', because: 'not-an-identity', why: "a word from the person's role cards, not an agent's role" },
  { site: 'installation.agents_may_inject', because: 'not-an-identity', why: 'one or zero, the switch for whether agents may inject a message' },
  { site: 'worlds.name', because: 'not-an-identity', why: 'the name a person reads for the world, which may hold a handle in words' },
  { site: 'worlds.kind', because: 'not-an-identity', why: 'one of the four words for the kind of a world' },
  { site: 'worlds.run_key_id', because: 'not-an-identity', why: "the id of the held_keys row of the world's key" },
  { site: 'source_files.repository_id', because: 'not-an-identity', why: 'the id of the repository the file is in' },
  { site: 'folder_readings.note', because: 'not-an-identity', why: 'words about the reading as a whole' },
  { site: 'one_press_requests.because', because: 'not-an-identity', why: "the agent's own words about why it asked" },
  { site: 'outside_reads.wanted', because: 'not-an-identity', why: 'the question the agent had, from a closed list' },
  { site: 'outside_reads.verdict', because: 'not-an-identity', why: 'one of three words for what the agent judged' },
  { site: 'reader_anchors.last_seen_at', because: 'not-an-identity', why: 'the time the reader last looked' },
  { site: 'reader_anchors.last_change_id', because: 'not-an-identity', why: 'the id of the newest change row the reader had seen' },
  { site: 'counter_rows.event_id', because: 'not-an-identity', why: "the id of the event the row counts, a merge entry, a change row or a message, by event_kind beside it" },
  { site: 'contact_groups.key', because: 'not-an-identity', why: "the word for one of the two top groups, or the group's own id" },
  { site: 'contact_groups.side', because: 'not-an-identity', why: 'the top group a second-level group sits under' },
  { site: 'contact_group_collapses.group_key', because: 'not-an-identity', why: "the key of a contact group, a word or the group's own id" },
  { site: 'registry_remint_kept_lists.old', because: 'history', why: "the re-mint kept an old value and its new one as they were when it ran, and nothing follows an alias through it" },
  { site: 'registry_remint_kept_lists.new', because: 'history', why: "the re-mint kept an old value and its new one as they were when it ran, and nothing follows an alias through it" },
]

/** Whether a declared type reaches ParticipantRef without passing through another shape. */
function reachesParticipant(node: DeclaredType): boolean {
  switch (node.kind) {
    case 'shape':
      return node.name === PARTICIPANT_SHAPE
    case 'array':
    case 'record':
      return reachesParticipant(node.of)
    case 'either':
      return node.options.some((option) => reachesParticipant(option.node))
    default:
      return false
  }
}

function declarers(): { owner: string; fields: readonly AdapterField[] }[] {
  return [
    ...Object.values(KIND_SPECS).map((spec) => ({ owner: spec.kind as string, fields: spec.fields })),
    ...Object.values(SHAPE_SPECS).map((spec) => ({ owner: spec.name, fields: spec.fields })),
    ...ADAPTER_SHAPES.map((shape) => ({ owner: shape.name, fields: shape.fields })),
  ]
}

const PARTICIPANT_GATE = "when its kind is 'agent'"

function participantPositions(): IdentityPosition[] {
  const out: IdentityPosition[] = []
  for (const { owner, fields } of declarers()) {
    for (const field of fields) {
      if (reachesParticipant(typeOf(field.type))) out.push({ site: `${owner}.${field.key}`, parse: 'participant', gate: PARTICIPANT_GATE })
    }
  }
  for (const [site, bag] of Object.entries(OPEN_BAGS)) {
    if (bag.reads === 'type' && reachesParticipant(typeOf(bag.type))) out.push({ site, parse: 'participant', gate: PARTICIPANT_GATE })
  }
  return out
}

/** Every position: the participant ones from kinds.ts, then the hand-listed ones. */
export const IDENTITY_POSITIONS: readonly IdentityPosition[] = [...participantPositions(), ...HAND_LISTED]

const BY_SITE = new Map(IDENTITY_POSITIONS.map((entry) => [entry.site, entry]))

/** The register entry for one site, or null when the site holds no agent identity. */
export function thePositionAt(site: string): IdentityPosition | null {
  return BY_SITE.get(site) ?? null
}
