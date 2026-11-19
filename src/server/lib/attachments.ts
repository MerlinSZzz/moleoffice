// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING AND CLOSING ONE PERIOD OF PARTICIPATION. CLOSING TOUCHES NO PROCESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT AN ATTACHMENT IS, AND THE FOUR THINGS IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * One period in which one provider session took part as one durable agent. It has an opening
 * moment, an ending moment and a reason for the end.
 *
 * It is NOT the agent — the agent outlives it. It is NOT the process — a provider process may keep
 * running after Mole Office considers an attachment finished, and the owner's brief says so in their own
 * words. It is NOT the provider session — three live `claude` processes on this machine share one
 * provider session id, measured on 27 August 2026. And it is NOT a thing whose end kills anything.
 *
 * The store is the `session` record and its eight declared attachment keys, in
 * `src/shared/kinds.ts`. There is no attachments table; that kind's own comment says what the
 * choice costs.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE SENTENCE THIS FILE EXISTS TO MAKE TRUE
 * ---------------------------------------------------------------------------------------
 *
 * **Closing an attachment writes three keys on a record and does nothing else.** The brief,
 * section 14: *"Closing an attachment is NOT killing the provider runtime. Stop runtime is a
 * separate explicit operation."*
 *
 * Nothing in this file imports `lib/resources.ts`, asks `OsProbe` anything, or names a pid.
 * Stopping a process is `releaseResource` on the resource ledger, on a different surface, behind a
 * typed phrase, and it writes `released_at` on `session_resources` rather than any key here.
 *
 * **The proof is not that the row left the roster.** That is the cheapest possible thing to fake.
 * `tests/closing-an-attachment-touches-no-process.test.ts` starts a real child process, opens an
 * attachment for it, closes the attachment through this file, and then reads the process with `ps`.
 * The measurement is the process.
 *
 * ---------------------------------------------------------------------------------------
 * WHY OPENING REPORTS RATHER THAN REFUSES
 * ---------------------------------------------------------------------------------------
 *
 * The obvious guard is *one open attachment per agent per provider session*, and it is WRONG.
 * Measured on this machine on 27 August 2026: pids 2929309, 3388324 and 3661285 are all alive, all
 * report the provider session id `3dea5df5-87ba-492f-82e7-454e48c9bd0e`, all in one project
 * directory, and the oldest has been running for 41 days. Under that guard
 * two of the three could not be recorded at all.
 *
 * The check that is actually wanted is *one open attachment per agent per PROCESS*, and an
 * attachment deliberately carries no pid — a pid on this record would be a second copy of a fact
 * `session_resources` already holds. So `openAttachment` REPORTS what else is open, by id, in the
 * reply, and the caller says so rather than assuming it is alone. That is the second consequence of
 * the measurement above: a resume that names a provider session may join a conversation two other
 * processes are already in.
 *
 * A refusal that cannot be right is worse than a report that is, and this is the fifth engineering
 * rule: absence beats a guess, and so does a fact beside a guess.
 */

import { quotedUnlessAMessage } from '@shared/message-refusal-words.ts'
import { and, eq, getTableColumns, isNull, sql, type SQL } from 'drizzle-orm'

import { nowStamp } from '@shared/time.ts'
import {
  CLOSED_HOW,
  CLOSING_TOUCHES_NO_PROCESS,
  STALE_AFTER_MINUTES,
  isClosedHow,
  type ClosedHow,
} from '@shared/lifecycle.ts'
import { minutesSince, newestRequestFor } from './arrivals.ts'
import type { PanelRecord } from '@shared/types.ts'
import { actorTypeWord, kindWord } from '@shared/words.ts'
import { db } from '../db/client.ts'
import { STORED_FIELDS, records } from '../db/schema.ts'
import { createRecord, getRecord, onlyTheseFieldsOf, patchRecord, type Actor } from './records.ts'
import { nothingWrittenSentence } from './records/patching.ts'
import { PanelError } from './panel-error.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theAgentOfARun } from './inspection.ts'
import { ranAsIn } from '@shared/ran-as.ts'

// ============================================================================ reading one

/** What one attachment says about itself. Every field is null when nobody recorded it. */
export interface AttachmentView {
  /** The `session` record this attachment is. */
  id: string
  workspaceId: string
  title: string
  /** The moment it opened: the record's own `createdAt`. There is no second stamp for it. */
  openedAt: string
  /** Which durable agent this period served, in this project. Null when nobody said. */
  agentId: string | null
  providerSession: string | null
  machine: string | null
  workingDirectory: string | null
  /** Where a person can go and watch. Recorded, never written to. */
  terminal: string | null
  /** The attachment that started this one, when this run is a provider's own child run. */
  parentAttachment: string | null
  /** Null while it is open. A closed attachment is never reopened. */
  closedAt: string | null
  closedBecause: string | null
  closedHow: ClosedHow | null
  /**
   * True while the record names no closing moment. Read by `theAttachmentIsOpen`, so every reader but
   * `listAttachments`' SQL filter agrees.
   */
  open: boolean
}

/** A string key of a record's data, or null when it is missing or is not a usable string. */
function text(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * WHETHER THIS SESSION RECORD IS OPEN. Open means no closing moment is stored: `closedAt` is missing,
 * or is written in a shape that is not a usable string. A closed attachment is never reopened.
 *
 * EVERY READER BUT ONE ASKS THIS FUNCTION — the attachment's own view, the running-workers door's
 * child filter and presence. The exception is the `openOnly` filter of `listAttachments`, which is
 * SQL (`json_extract(data, '$.closedAt') IS NULL`) and so calls a stored empty string or a stored
 * value that is not a string closed where this function calls it open. The store refuses both on a
 * write, so only a row written outside the store can show the difference.
 */
export function theAttachmentIsOpen(data: Record<string, unknown>): boolean {
  return text(data, theFieldTheOpenRuleReads()) === null
}

/**
 * THE ONE DATA FIELD `theAttachmentIsOpen` READS. Presence fetches only some of a session's data and takes the field
 * from here, so it cannot leave out what the rule needs or keep its own copy of the name. It is a function and not a
 * constant because presence reads it while its module loads, and this file and presence.ts import each other through
 * messages.ts: a function declaration is ready before either module runs, and a constant is not.
 */
export function theFieldTheOpenRuleReads(): string {
  return 'closedAt'
}

export { ranAsIn }

/**
 * THE DATA FIELDS `attachmentOf` READS, and `ranAsIn` and `theAttachmentIsOpen` with it. `listAttachments` reads only
 * these of each run, so a field `attachmentOf` comes to read is added here, or the list answers it as never recorded.
 */
const THE_FIELDS_AN_ATTACHMENT_READS = ['closedHow', theFieldTheOpenRuleReads(), 'closedBecause', 'ranAs', 'providerSession', 'machine', 'workingDirectory', 'terminal', 'parentAttachment']

/**
 * One session record read as the attachment it is.
 *
 * A stored `closedHow` that is not one of the five is a fault and is reported as one rather than
 * read as a close. A close nobody can name did not happen in a way anybody can act on.
 */
export function attachmentOf(record: PanelRecord): AttachmentView {
  const data = record.data
  const closedHow = text(data, 'closedHow')
  if (closedHow !== null && !isClosedHow(closedHow)) {
    throw new PanelError(
      `Attachment ${record.id} says it was closed by "${closedHow}", and that is not one of the five ways an ` +
        `attachment ends (${CLOSED_HOW.join(', ')}). Nothing has been guessed at.`,
      500,
    )
  }
  const closedAt = text(data, 'closedAt')
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    title: record.title,
    openedAt: record.createdAt,
    agentId: ranAsIn(record, record.workspaceId),
    providerSession: text(data, 'providerSession'),
    machine: text(data, 'machine'),
    workingDirectory: text(data, 'workingDirectory'),
    terminal: text(data, 'terminal'),
    parentAttachment: text(data, 'parentAttachment'),
    closedAt,
    closedBecause: text(data, 'closedBecause'),
    closedHow: closedHow as ClosedHow | null,
    open: theAttachmentIsOpen(data),
  }
}

/** The session record with this id, in this project, or a refusal saying which of the two failed. */
function attachmentRecord(id: string, workspaceId: string): PanelRecord {
  const record = getRecord(id)
  if (record === null || record.deletedAt !== null) {
    throw new PanelError(`No attachment with id ${id}. An attachment is a record of kind "session".`, 404)
  }
  if (record.kind !== 'session') {
    throw new PanelError(
      `${id} is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' — ', ' —')} and not an attachment. An attachment is a run, ` +
        'filed as a record of kind "session".',
      400,
    )
  }
  if (record.workspaceId !== workspaceId) {
    throw new PanelError(
      `${id} is an attachment in "${record.workspaceId}" and this request is about "${workspaceId}".`,
      404,
    )
  }
  return record
}

/**
 * REFUSE THIS ID UNLESS IT IS AN ATTACHMENT OF THIS PROJECT, in the words `childrenOf` refuses a
 * parent with. Answers nothing: the caller already holds the id.
 *
 * Exported so a reader that asks about one session without listing its children asks the same check
 * rather than copying its three sentences. One sentence, one place.
 */
export function refuseWhateverIsNotAnAttachment(id: string, workspaceId: string): void {
  attachmentRecord(id, workspaceId)
}

// ============================================================================ listing

/** What a list of attachments was asked for. */
export interface AttachmentQuery {
  workspaceId: string
  /** Only the attachments that served this durable agent. Absent means every agent, and none. */
  agentId?: string
  /** True for open ones only. Default false: history is what an attachment is for. */
  openOnly?: boolean
  /**
   * True for only the runs whose `ranAs` could name an agent (`theRunsThatCouldNameAnAgent`), for a reader that drops
   * every run with no agent. Default false. A run it leaves out is one `ranAsIn` finds no agent for.
   */
  namingAnAgentOnly?: boolean
}

/**
 * THE RUNS OF ONE PROJECT WHOSE `ranAs` COULD NAME AN AGENT, by their rowids from two partial indexes: the runs whose
 * first entry names one (`records_session_first_binding_agent_idx`), and the runs that index cannot rule out
 * (`records_session_reference_fallback_idx`: a list of more than one entry, a `ranAs` that is not a list, a data that is
 * not JSON). Between them they hold every run `ranAsIn` finds an agent for, as presence's `theSessionCandidates` uses
 * them. THIS NARROWS AND DOES NOT DECIDE: `ranAsIn` still reads each run.
 *
 * EACH HALF IS A SEARCH OF ITS INDEX. The first asks for a first entry's agent after the empty text, a range the index
 * can seek. It leaves out no run `ranAsIn` finds an agent for by its first entry, since `ranAsIn` takes only an agent
 * that is text and not empty, and SQLite sorts every such text after the empty text and every number and null before
 * it. Asked as `IS NOT NULL`, the same half was a scan of the whole index, every project's runs. `INDEXED BY` names
 * each index, since SQLite chose the index of every record's kind for the first half when it was not named: 130 ms
 * for under 1, each the median of six reads, on the made-up office of 4 November shaped like the live project (wave
 * 13y round 143).
 */
function theRunsThatCouldNameAnAgent(workspaceId: string): SQL {
  const data = sql.raw('candidate.data')
  const halves = [
    [sql`${STORED_FIELDS.sessionFirstBindingAgent(data)} > ''`, 'records_session_first_binding_agent_idx'],
    [sql`${STORED_FIELDS.sessionReferenceNeedsFallback(data)} = 1`, 'records_session_reference_fallback_idx'],
  ] as const
  const reads = halves.map(([condition, index]) => sql`SELECT candidate.rowid FROM records AS candidate INDEXED BY ${sql.raw(index)}
    WHERE candidate.kind = 'session' AND ${condition} AND candidate.workspace_id = ${workspaceId} AND candidate.deleted_at IS NULL`)
  return sql`${records}.rowid IN (${sql.join(reads, sql` UNION ALL `)})`
}

/**
 * THE ATTACHMENTS IN ONE PROJECT, newest first.
 *
 * `openOnly` is a second reading of open, in SQL: `json_extract(data, '$.closedAt') IS NULL`. It
 * differs from `theAttachmentIsOpen` on a stored empty string and on a stored value that is not a
 * string, which this filter calls closed and the function calls open. The store refuses both on a
 * write, so on every row the store wrote the two readings agree, and only a row written outside the
 * store can show the difference.
 */
export function listAttachments(query: AttachmentQuery): AttachmentView[] {
  // ONLY THE FIELDS AN ATTACHMENT READS. The page about who is working asks this twice, and on the made-up office of
  // 4 November 2026 the two reads of 18,968 runs whole took about 230 and 195 ms, and about 95 and 85 ms this way.
  const rows = db
    .select({ ...getTableColumns(records), data: onlyTheseFieldsOf(THE_FIELDS_AN_ATTACHMENT_READS) })
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, query.workspaceId),
        isNull(records.deletedAt),
        query.openOnly === true ? sql`json_extract(${records.data}, '$.closedAt') IS NULL` : undefined,
        query.namingAnAgentOnly === true ? theRunsThatCouldNameAnAgent(query.workspaceId) : undefined,
      ),
    )
    .all()

  const views = rows.map((row) => attachmentOf({ ...row, data: JSON.parse(row.data) as Record<string, unknown> } as PanelRecord))
  const wanted = query.agentId === undefined ? views : views.filter((one) => one.agentId === query.agentId)
  return wanted.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0))
}

/** What `listAttachmentsAndOpenIds` answers: the runs `listAttachments` answers, and which of them the SQL open rule calls open. */
export interface AttachmentsAndOpenIds {
  /** Every asked run, newest first, exactly as `listAttachments` answers them. */
  runs: AttachmentView[]
  /**
   * The ids of those runs the SQL open rule calls open. A stored `closedAt` that is empty or not text
   * is closed here and open to `theAttachmentIsOpen`, the difference the old `openOnly` read kept.
   */
  openIds: ReadonlySet<string>
}

/**
 * THE ATTACHMENTS IN ONE PROJECT AND THE SQL OPEN RULE'S ANSWER, FROM ONE READ.
 *
 * `GET /api/working` asked `listAttachments` twice — once with `openOnly` for presence, once without
 * for every run's progress — and on the 13 November office the two reads cost 120.7 ms together (17,428
 * rows). Reading the open rule as a column beside the row lets one read answer both. THE RULE IS THE
 * SAME EXPRESSION the `openOnly` read used in its WHERE clause and is not re-derived in JavaScript, so
 * a stored `closedAt` the store refuses is still closed to presence and open to `theAttachmentIsOpen`.
 */
export function listAttachmentsAndOpenIds(query: Omit<AttachmentQuery, 'openOnly'>): AttachmentsAndOpenIds {
  const openByTheSqlRule = sql<number>`CASE WHEN json_extract(${records.data}, '$.closedAt') IS NULL THEN 1 ELSE 0 END`
  const rows = db
    .select({ ...getTableColumns(records), data: onlyTheseFieldsOf(THE_FIELDS_AN_ATTACHMENT_READS), openByTheSqlRule })
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, query.workspaceId),
        isNull(records.deletedAt),
        query.namingAnAgentOnly === true ? theRunsThatCouldNameAnAgent(query.workspaceId) : undefined,
      ),
    )
    .all()

  const runs = rows
    .map((row) => attachmentOf({ ...row, data: JSON.parse(row.data) as Record<string, unknown> } as PanelRecord))
    .filter((one) => query.agentId === undefined || one.agentId === query.agentId)
    .sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0))
  const openIds = new Set(rows.filter((row) => row.openByTheSqlRule === 1).map((row) => row.id))
  return { runs, openIds }
}

/** The open attachments serving one durable agent, newest first. What presence is read over. */
export function openAttachmentsFor(agentId: string, workspaceId: string): AttachmentView[] {
  return listAttachments({ workspaceId, agentId, openOnly: true })
}

// ============================================================================ parent and child

/**
 * THE CHILD RUNS THIS ATTACHMENT STARTED, newest first, open ones and ended ones.
 *
 * A child is a `session` record whose `data.parentAttachment` names this one. That is the whole of
 * the relationship and there is no children table and no `childCount` cached on the parent — both
 * would be the same fact in a second place, and the second place is the one that goes stale.
 *
 * **A child is not a durable agent.** It carries no `ranAs`, `openAttachment` refuses to give it
 * one, and it therefore never appears in `openAttachmentsFor`, never holds an agent Online on its
 * own, and can never move a work state. History is retained under the parent, and that is the
 * rule: a child is recorded and its history kept, but it never becomes an identity of its own.
 */
export function childrenOf(parentAttachmentId: string, workspaceId: string): AttachmentView[] {
  // THE PARENT IS CHECKED RATHER THAN ASSUMED. An id from another project would otherwise be
  // answered with an empty list, which reads as "that run started no children" and is a sentence
  // about a run the caller cannot see. `attachmentRecord` refuses it by name.
  attachmentRecord(parentAttachmentId, workspaceId)
  return listAttachments({ workspaceId }).filter((one) => one.parentAttachment === parentAttachmentId)
}

/** The child runs of this attachment that have not ended. */
export function openChildrenOf(parentAttachmentId: string, workspaceId: string): AttachmentView[] {
  return childrenOf(parentAttachmentId, workspaceId).filter((one) => one.open)
}

/**
 * EVERY OPEN CHILD RUN IN THIS PROJECT, whoever started it.
 *
 * The sweep below reads this. It is a filter over the same `listAttachments` reading every other
 * caller takes, so *open* means one thing across this file: nobody wrote down a closing moment.
 */
export function openChildAttachments(workspaceId: string): AttachmentView[] {
  return listAttachments({ workspaceId, openOnly: true }).filter((one) => one.parentAttachment !== null)
}

// ============================================================================ opening one

/** What opening an attachment is told. Everything but the project and the actor is optional. */
export interface OpenAttachment {
  workspaceId: string
  actor: Actor
  /** What to call this run. A person reads it in a list of runs. */
  title: string
  /** The durable agent this period serves. Checked against the record; never invented. */
  agentId?: string
  /** The provider's own id for the conversation. */
  providerSession?: string
  machine?: string
  /** The whole path the run is working in. The short project-directory name is taken from it. */
  workingDirectory?: string
  terminal?: string
  /** The attachment that started this one, when this is a provider's own child run. */
  parentAttachment?: string
  /** Which tool is running, in any word: `claude-code`, `codex-cli`. */
  runtime?: string
  /**
   * The tool Mole Office adapts that is running, declared: one of AGENT_RUNTIMES. The record door
   * refuses any other word with the session kind's own sentence, and nothing is written.
   */
  adaptedTool?: string
  /** What it is doing, in one line. Absent is honest; a made-up line is not. */
  doing?: string
}

/** What else was already open when this attachment opened. Reported, never refused. */
export interface AlsoOpen {
  /** Other open attachments serving the same durable agent, by id. */
  forThisAgent: string[]
  /** Other open attachments naming the same provider session, by id. */
  forThisProviderSession: string[]
  /** What that means, in one sentence, including the case where it means nothing. */
  says: string
}

export interface AttachmentOpened {
  attachment: AttachmentView
  alsoOpen: AlsoOpen
}

/** The short project-directory name a whole path ends in, or null. One definition, used once. */
function directoryNameOf(path: string | undefined): string | null {
  if (path === undefined || path === '') return null
  return path.split('/').filter(Boolean).pop() ?? null
}

/**
 * OPEN AN ATTACHMENT. IT STARTS NOTHING.
 *
 * A new attachment is always a NEW record. A closed one is never reopened, whatever the provider
 * session says — the brief's section 16: *"SessionStart/register must create a NEW attachment. Do
 * not pretend an old closed attachment remained alive."* So this function takes no attachment id.
 *
 * **Opening does not move a work state.** An agent becomes Working when execution is actually
 * accepted, and a process starting is not a decision about the work. An agent whose transition
 * history is empty reads *nobody has said what this agent is doing*, which is a real answer.
 */
export function openAttachment(input: OpenAttachment): AttachmentOpened {
  const agentId = input.agentId
  if (agentId !== undefined) assertIsALiveAgent(agentId, input.workspaceId)

  if (input.parentAttachment !== undefined && agentId !== undefined) {
    throw new PanelError(
      'A child run does not name a durable agent of its own. The owner\'s section 18: Mole Office observes a ' +
        'provider\'s internal subagents and does not create a permanent standalone durable agent identity for ' +
        'one by default, and does not make one an independent work-domain owner or message recipient. A child ' +
        'takes part under the attachment that started it, and `childrenOf` is how it is reached. Open it with ' +
        'a parent OR with an agent, not with both. Nothing was written.',
      400,
    )
  }

  if (input.parentAttachment !== undefined) {
    const parent = attachmentOf(attachmentRecord(input.parentAttachment, input.workspaceId))
    if (!parent.open) {
      throw new PanelError(
        `The attachment this one says started it (${parent.id}) was closed at ${parent.closedAt ?? 'an unrecorded ' +
          'moment'}. A child cannot open under a parent that has already ended: whatever started it, it was not ` +
          'that period of participation. Nothing was written.',
        409,
      )
    }
  }

  const workspace = directoryNameOf(input.workingDirectory)
  const data: Record<string, unknown> = {
    // A run that has just opened is running. That word is about THE PROCESS and is not a work
    // state; nothing anywhere reads it as one.
    state: 'running',
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    ...(input.adaptedTool === undefined ? {} : { adaptedTool: input.adaptedTool }),
    ...(input.doing === undefined ? {} : { doing: input.doing }),
    ...(input.providerSession === undefined ? {} : { providerSession: input.providerSession }),
    ...(input.machine === undefined ? {} : { machine: input.machine }),
    ...(input.workingDirectory === undefined ? {} : { workingDirectory: input.workingDirectory }),
    // TAKEN FROM THE PATH, NEVER ASKED FOR SEPARATELY. Two writers of the same fact is how the
    // short name and the path come to name different directories.
    ...(workspace === null ? {} : { workspace }),
    ...(input.terminal === undefined ? {} : { terminal: input.terminal }),
    ...(input.parentAttachment === undefined ? {} : { parentAttachment: input.parentAttachment }),
    ...(agentId === undefined ? {} : { ranAs: [{ workspaceId: input.workspaceId, agentId }] }),
  }

  const record = createRecord({
    kind: 'session',
    title: input.title,
    workspaceId: input.workspaceId,
    data,
    actor: input.actor,
  })

  const view = attachmentOf(record)
  return { attachment: view, alsoOpen: whatElseIsOpen(view) }
}

/** Refuse an agent id that names nothing, names something else, or lives in another project. */
function assertIsALiveAgent(agentId: string, workspaceId: string): void {
  const record = getRecord(agentId)
  if (record === null || record.deletedAt !== null) {
    throw new PanelError(
      `No agent has the id ${agentId}, so nothing can be attached to it. A durable agent is a record of kind ` +
        '"agent"; measured on 27 August 2026 there are none in any project, and the door that makes one is ' +
        'still to be built. Nothing was written.',
      404,
    )
  }
  if (record.kind !== 'agent') {
    throw new PanelError(
      `${agentId} is a ${kindWord(record.kind).text}${quotedUnlessAMessage(record, ' — ', ' —')} and not a durable agent. Nothing was written.`,
      400,
    )
  }
  if (record.workspaceId !== workspaceId) {
    throw new PanelError(
      `"${record.title}" is an agent in "${record.workspaceId}" and this attachment is in "${workspaceId}". ` +
        'A durable agent belongs to one project. Nothing was written.',
      400,
    )
  }
}

/** What else is open beside this attachment, said plainly, including when the answer is nothing. */
function whatElseIsOpen(view: AttachmentView): AlsoOpen {
  const open = listAttachments({ workspaceId: view.workspaceId, openOnly: true }).filter((one) => one.id !== view.id)
  const forThisAgent = view.agentId === null ? [] : open.filter((one) => one.agentId === view.agentId).map((o) => o.id)
  const forThisProviderSession =
    view.providerSession === null
      ? []
      : open.filter((one) => one.providerSession === view.providerSession).map((o) => o.id)

  const parts: string[] = []
  if (forThisAgent.length > 0) {
    parts.push(
      `${forThisAgent.length} other attachment${forThisAgent.length === 1 ? ' is' : 's are'} open for the same ` +
        `agent: ${forThisAgent.join(', ')}.`,
    )
  }
  if (forThisProviderSession.length > 0) {
    parts.push(
      `${forThisProviderSession.length} other attachment${
        forThisProviderSession.length === 1 ? ' is' : 's are'
      } open naming the same provider session (${forThisProviderSession.join(', ')}), so anything that resumes ` +
        'that conversation may be joining one somebody else is already in. Three live processes on this machine ' +
        'share one provider session id today, so this is an ordinary state and not a fault.',
    )
  }
  return {
    forThisAgent,
    forThisProviderSession,
    says: parts.length === 0 ? 'Nothing else is open for this agent or this provider session.' : parts.join(' '),
  }
}

// ============================================================================ closing one

/** What closing an attachment is told. All three are required, and the reason is a sentence. */
export interface CloseAttachment {
  workspaceId: string
  actor: Actor
  /** Which of the five ways it ended. */
  how: ClosedHow
  /** Why it ended, in one plain sentence. Empty is refused. */
  because: string
}

export interface AttachmentClosed {
  attachment: AttachmentView
  /**
   * The child runs this close ended, because their parent ended. Empty when there were none.
   *
   * Each carries `closedHow: 'parent-said'`, which is what tells it apart from a child that ended
   * by itself and from a child nobody heard from again. Those are three different facts and only
   * the third one hides a failure.
   */
  children: AttachmentView[]
  /** What this did NOT do, in one sentence, on every close. */
  says: string
}

/**
 * CLOSE AN ATTACHMENT. IT TOUCHES NO PROCESS, AND THE REPLY SAYS SO EVERY TIME.
 *
 * Three keys are written together — `closedAt`, `closedBecause` and `closedHow` — because a close
 * that cannot say why or how is a close nobody can act on later. The moment comes from the server's
 * own clock and never from the caller: the brief's section 15 forbids fabricating a timestamp that
 * was never observed, and a caller-supplied close time is exactly that.
 *
 * Closing does not move a work state, does not empty an inbox, does not close an open loop and does
 * not retire the agent. It ends one period of participation and nothing else.
 */
export function closeAttachment(id: string, input: CloseAttachment): AttachmentClosed {
  const record = attachmentRecord(id, input.workspaceId)
  const before = attachmentOf(record)

  if (!before.open) {
    throw new PanelError(
      `That attachment was already closed, at ${before.closedAt}, because: ${
        before.closedBecause ?? 'nobody recorded a reason'
      } (${before.closedHow ?? 'nobody recorded how'}). A closed attachment is never reopened and never closed ` +
        'twice — a new period of participation is a new attachment. Nothing was written.',
      409,
    )
  }

  const because = input.because.trim()
  if (because === '') {
    throw new PanelError(
      'Say why this attachment ended, in one plain sentence. A close with no reason is the fact that hides a ' +
        'failure: a run that ended and a run nobody heard from again read the same afterwards. Nothing was written.',
      400,
    )
  }

  if (input.how === 'parent-said' && before.parentAttachment === null) {
    throw new PanelError(
      `"parent-said" means the attachment that started this one ended it, and ${id} records no parent. Either it ` +
        'is not a child run, or nobody recorded which attachment started it. If you started the agent this run ' +
        'served, close it with "starter-said". Nothing was written.',
      400,
    )
  }

  // ONLY THE STARTER MAY SAY "starter-said". Problem XtHehJ90C-hd. The starter is read the way the
  // office reads it when a run is closed as superseded: `startedBy` on the agent this run serves.
  if (input.how === 'starter-said') {
    const starter = theAgentOfARun(record)?.startedBy ?? null
    const me = participantForActor(input.actor)
    if (starter === null || me === null || starter.kind !== me.kind || starter.id !== me.id) {
      throw new PanelError(
        `"starter-said" means whoever started the agent this run served ended it, and ` +
          (starter === null
            ? `nothing is recorded as having started the agent ${id} served.`
            : `that is "${starter.id}", not "${input.actor.id}".`) +
          ' Nothing was written.',
        403,
      )
    }
  }

  const at = nowStamp()
  const { record: after } = patchRecord(
    id,
    { dataPatch: { closedAt: at, closedBecause: because, closedHow: input.how } },
    input.actor,
  )

  // A CHILD CLOSES WITH ITS PARENT, AND THE ROW SAYS THAT IS WHY. A child run cannot outlive the
  // period of participation that started it: whatever the provider does with the process, Mole Office's
  // record of that child taking part ends here. It is written as `parent-said` rather than as the
  // parent's own reason, because a parent that ended and a child we stopped hearing from must
  // never read the same afterwards — that sameness is what let a parent believe a workflow was
  // alive that had died. TOUCHING NO PROCESS APPLIES TO EVERY ONE OF THEM.
  const children: AttachmentView[] = []
  for (const child of openChildrenOf(id, input.workspaceId)) {
    const { record: closedChild } = patchRecord(
      child.id,
      {
        dataPatch: {
          closedAt: nowStamp(),
          closedBecause: `The attachment that started this child run ended: ${because}`,
          closedHow: 'parent-said',
        },
      },
      input.actor,
    )
    children.push(attachmentOf(closedChild))
  }

  return { attachment: attachmentOf(after), children, says: CLOSING_TOUCHES_NO_PROCESS }
}

// ============================================================================ the quiet children

/** One child the sweep closed, or looked at and left alone, with the reason either way. */
export interface SweptChild {
  attachment: AttachmentView
  /** How long Mole Office had heard nothing from it, in whole minutes. */
  quietForMinutes: number
  /** Which input that silence was measured from. */
  from: 'request' | 'attachment-opened'
  closed: boolean
  says: string
}

/** What one sweep looked at, what it closed, and what it left alone. */
export interface ChildrenSwept {
  workspaceId: string
  /** The declared threshold this sweep compared against. */
  staleAfterMinutes: number
  looked: SweptChild[]
  closed: SweptChild[]
  note: string
  nothingWritten?: string
}

/**
 * CLOSE THE CHILD RUNS NOBODY HAS HEARD FROM FOR LONGER THAN THE DECLARED THRESHOLD.
 *
 * This is the third of the three ways a child ends, and the whole point of writing which one it
 * was. A child ends on its parent's word (`parent-said`), on its provider's own event
 * (`provider-event`, written by whoever observed the event), or on this — `went-stale`, which says
 * **Mole Office stopped hearing from it and does not know what happened.** Only the third hides a
 * failure, and a close that could not say which of the three had happened could not answer the
 * question of what happened when a parent waits on a workflow that has disappeared.
 *
 * **The silence is measured from the same reader presence uses**, `newestRequestFor`, falling back
 * to the moment the child opened. So a child Mole Office has never heard from at all goes quiet from its
 * own opening moment, which is honest: an attachment nobody has heard from is exactly what quiet
 * means.
 *
 * **It touches no process.** It writes three keys on a record, like every other close here.
 *
 * **It closes only children.** A top-level attachment going quiet is what presence reads as Stale,
 * and Stale is a reading a person acts on — closing one automatically would be the system deciding
 * that a run had ended, which is a decision it does not get to make. A child has no presence of its
 * own and no person watching it, which is why this exists for children and only for children.
 */
export function sweepQuietChildren(input: { workspaceId: string; actor: Actor; now?: Date }): ChildrenSwept {
  const now = input.now ?? new Date()
  const looked: SweptChild[] = []
  let wrote = false
  let unjudged = false

  for (const child of openChildAttachments(input.workspaceId)) {
    const request = newestRequestFor([child.id])
    const from: 'request' | 'attachment-opened' = request === null ? 'attachment-opened' : 'request'
    const lastArrival = request ?? child.openedAt
    const quiet = minutesSince(lastArrival, now)
    if (quiet === null) {
      unjudged = true
      // A moment that cannot be read is never treated as "just now" and never as "long ago". The
      // child is left alone and the row says why, which is the fifth engineering rule: nobody has
      // looked is a different answer from nothing is there.
      looked.push({
        attachment: child,
        quietForMinutes: 0,
        from,
        closed: false,
        says:
          `The moment this child run was last heard from — ${lastArrival} — is not a stamp this product can ` +
          'read, so how long it has been quiet cannot be worked out. It was left open and nothing was guessed at.',
      })
      continue
    }

    if (quiet < STALE_AFTER_MINUTES) {
      looked.push({
        attachment: child,
        quietForMinutes: quiet,
        from,
        closed: false,
        says: `Heard from ${quiet} minute${quiet === 1 ? '' : 's'} ago, which is inside the threshold.`,
      })
      continue
    }

    const because =
      `Mole Office stopped hearing from this child run. Nothing has arrived from it for ${quiet} minutes, measured ` +
      `from ${from === 'request' ? 'the last request it sent' : 'the moment it opened, because it never sent one'}` +
      '. What happened to it was not observed.'
    const { record, newSeq } = patchRecord(
      child.id,
      { dataPatch: { closedAt: nowStamp(), closedBecause: because, closedHow: 'went-stale' } },
      input.actor,
    )
    if (newSeq !== null) wrote = true
    looked.push({ attachment: attachmentOf(record), quietForMinutes: quiet, from, closed: true, says: because })
  }

  const closed = looked.filter((one) => one.closed)
  return {
    workspaceId: input.workspaceId,
    staleAfterMinutes: STALE_AFTER_MINUTES,
    looked,
    closed,
    ...(!wrote && !unjudged ? { nothingWritten: nothingWrittenSentence({ kind: 'no-child-to-close' }) } : {}),
    note:
      looked.length === 0
        ? 'No child run is open in this project, so there was nothing to sweep. That is nothing there, not ' +
          'nobody looked.'
        : `${looked.length} open child run${looked.length === 1 ? '' : 's'} looked at, ${closed.length} closed ` +
          `as gone quiet. A child closed this way says "went-stale", which means Mole Office stopped hearing from it ` +
          'and does not know what happened — not that it ended. No process was touched.',
  }
}
