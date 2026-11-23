// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DRAFTS: THE LIST, THE SEND DOOR AND THE REMINDER. They follow one decision's six points about
 * drafts, as recommended, and point 3 of another.
 *
 * ---------------------------------------------------------------------------------------
 * SENDING STAYS THE OFFICE'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * `sendADraft` is not a second way to send. It files the new record through `createRecordWithReport`,
 * the function POST /api/records uses, so a message made from a draft is checked, addressed and
 * delivered by the same code as any other message. The draft is only where the words were kept.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY READ A DRAFT: ANY CALLER IN THE PROJECT
 * ---------------------------------------------------------------------------------------
 *
 * Drafts get no privacy layer,
 * which replaced the earlier "only its writer and the person". An agent reaches its own drafts easily:
 * `GET /api/drafts` lists the caller's own. Another agent's draft is reached only by its id or a
 * general list of records, and nothing here refuses that.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'

import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { localStamp } from '@shared/time.ts'
import { kindWord } from '@shared/words.ts'
import {
  DRAFT_BECOMES,
  DRAFT_KIND,
  SENT_AS,
  SENT_AT,
  WHO_MAY_READ_A_DRAFT,
  draftForOf,
  remindAfterMinutesOf,
  sentAsOf,
  sentAtOf,
  whenTheReminderIsDue,
  type DraftBecomes,
} from '@shared/drafts.ts'
import { asTheDraftSendDoor } from './draft-door.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import type { WrittenFrom } from './machines.ts'
import { readParticipant } from '../db/read-participant.ts'
import {
  createRecordWithReport,
  everyAgentAStoredStampCouldName,
  getRecord,
  listRecords,
  patchRecord,
  recordInWorkspace,
  sameAgent,
  theTwoHalvesOfAStamp,
  theWriterAStampNames,
  whyAnUnregisteredAgentMayNotWrite,
  type Actor,
  type CreateResult,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import type { PanelRecord } from '@shared/types.ts'
import { type TheEndsOfTheLedger } from './revisions.ts'
import { theEndsOfTheLedger } from '../db/who-wrote-records.ts'
import { listWorkspaces } from '../db/list-workspaces.ts'
import { gateMet } from './gate-counts.ts'

const THE_PERSON_REF: ParticipantRef = { kind: 'person', id: THE_PERSON }

// ============================================================================ the list

/** One draft as the list door shows it. */
export interface DraftRow {
  id: string
  title: string
  becomes: DraftBecomes | null
  for: ParticipantRef[]
  /** Who wrote it, in words, or null because nothing recorded who wrote it. */
  writer: string | null
  sent: boolean
  sentAs: string | null
  sentAt: string | null
  /** When it was last changed, local time, read from its newest revision. Null where no revision exists. */
  lastChangedAt: string | null
  /** The minutes after the last change the reminder waits: the draft's own, or the default. */
  remindAfterMinutes: number
  /** When the reminder is due, local time. Null once the draft is sent, and null where the last change cannot be read. */
  reminderDueAt: string | null
}

export interface DraftList {
  drafts: DraftRow[]
  /** Whose drafts these are: the caller's own, or every draft in the project for the person. */
  whose: 'yours' | 'every draft in this project'
  note: string
}

function becomesOf(data: unknown): DraftBecomes | null {
  const held = (data as Record<string, unknown> | null)?.['becomes']
  return typeof held === 'string' && (DRAFT_BECOMES as readonly string[]).includes(held) ? (held as DraftBecomes) : null
}

/** Whether a stored writer stamp names the caller. A stamp nobody recorded names nobody. */
function writtenBy(stamp: string | undefined, actor: Actor): boolean {
  return stamp !== undefined && sameAgent(theTwoHalvesOfAStamp(stamp), actor)
}

/** Who a stored writer stamp names, in words: the person, an agent's handle, or the stamp itself. */
function writerInWords(stamp: string): string {
  const stored = theTwoHalvesOfAStamp(stamp)
  if (stored.actorType === 'human') return 'the person'
  if (stored.actorType !== 'agent') return stamp
  const named = everyAgentAStoredStampCouldName(stored.actorId)
  return named.length === 1 ? named[0]!.handle : stored.actorId
}

function asRow(record: PanelRecord, ends: TheEndsOfTheLedger | undefined): DraftRow {
  const sentAs = sentAsOf(record.data)
  const due = ends === undefined || sentAs !== null ? null : whenTheReminderIsDue(ends.newestAt, record.data)
  return {
    id: record.id,
    title: record.title,
    becomes: becomesOf(record.data),
    for: draftForOf(record.data),
    writer: ends === undefined ? null : writerInWords(ends.writer),
    sent: sentAs !== null,
    sentAs,
    sentAt: sentAtOf(record.data),
    lastChangedAt: ends?.newestAt ?? null,
    remindAfterMinutes: remindAfterMinutesOf(record.data),
    reminderDueAt: due?.at ?? null,
  }
}

/**
 * THE CALLER'S OWN DRAFTS, NOT SENT FIRST, and every draft in the project when the caller is the
 * person. Within each half the one changed most recently comes first.
 */
export function listDrafts(workspaceId: string, actor: Actor): DraftList {
  const all = listRecords({ workspaceId, kind: DRAFT_KIND })
  const ledger = theEndsOfTheLedger(all.map((one) => one.id))
  const isThePerson = actor.type === 'human'
  const mine = isThePerson ? all : all.filter((one) => writtenBy(ledger.get(one.id)?.writer, actor))
  const rows = mine.map((one) => asRow(one, ledger.get(one.id)))
  rows.sort((a, b) => {
    if (a.sent !== b.sent) return a.sent ? 1 : -1
    return (b.lastChangedAt ?? '').localeCompare(a.lastChangedAt ?? '')
  })
  const unsent = rows.filter((one) => !one.sent).length
  const whose = isThePerson ? 'every draft in this project' : 'yours'
  const note =
    rows.length === 0
      ? isThePerson
        ? 'There are no drafts in this project.'
        : 'You have no drafts in this project.'
      : `${String(rows.length)} draft${rows.length === 1 ? '' : 's'}, ${String(unsent)} not sent. ` +
        (isThePerson ? 'These are every draft in this project.' : `These are the drafts you wrote. ${WHO_MAY_READ_A_DRAFT}`)
  return { drafts: rows, whose, note }
}

// ============================================================================ the send door

/** What the send door answers. */
export interface DraftSent {
  draft: PanelRecord
  became: CreateResult
  note: string
}

/** The names of the people and agents a draft is for, in words, for a report's own `for`. */
function forInWords(to: readonly ParticipantRef[]): string {
  return to
    .map((one) => {
      if (one.kind !== 'agent') return one.id
      const held = readParticipant(one)
      return held !== null && 'handle' in held ? `agent ${held.handle}` : `agent ${one.id}`
    })
    .join(', ')
}

/** The new record's data, made from the draft's words for the kind it becomes. */
function whatItBecomes(becomes: DraftBecomes, body: string, to: readonly ParticipantRef[]): Record<string, unknown> {
  if (becomes === 'message') return { body, to }
  if (becomes === 'report') {
    return {
      blocks: [{ id: 'b-1', type: 'text', text: body }],
      ...(to.length === 0 ? {} : { for: forInWords(to) }),
    }
  }
  return { body }
}

/**
 * SEND ONE DRAFT: file what it becomes, link that to the draft, and mark the draft sent, in ONE
 * transaction. Everything the door can check is checked before anything is written; a refusal from
 * the create itself rolls the whole send back, so a draft is never marked sent for a record that was
 * not filed.
 */
export function sendADraft(id: string, workspaceId: string, actor: Actor, writtenFrom?: WrittenFrom): DraftSent {
  const unregistered = whyAnUnregisteredAgentMayNotWrite(actor)
  if (unregistered !== null) throw new PanelError(unregistered, 403)
  const draft = recordInWorkspace(id, workspaceId)
  if (draft.kind !== DRAFT_KIND) {
    throw new PanelError(`Record ${id} is a ${kindWord(draft.kind).text}, not a draft, so there is nothing to send. Nothing was written.`, 400)
  }
  const stamp = theEndsOfTheLedger([id]).get(id)?.writer
  if (stamp === undefined) {
    throw new PanelError(
      `Nothing recorded who wrote draft ${id}, so Mole Office cannot say that you are its writer, and only its writer ` +
        'may send it. Nothing was sent.',
      403,
    )
  }
  if (!writtenBy(stamp, actor) && gateMet('who-sends-a-draft') === 'block') {
    throw new PanelError(
      `${theWriterAStampNames(stamp)} wrote draft ${id}, and you are ${actor.type} "${actor.id}". Only a draft's writer ` +
        'may send it. Nothing was sent.',
      403,
    )
  }
  const sentAs = sentAsOf(draft.data)
  if (sentAs !== null) {
    throw new PanelError(
      `Draft ${id} was already sent, as record ${sentAs} at ${sentAtOf(draft.data) ?? 'a time nobody recorded'}. A draft ` +
        'is sent once. Nothing was sent.',
      409,
    )
  }
  const becomes = becomesOf(draft.data)
  if (becomes === null) {
    throw new PanelError(
      `Draft ${id} does not say what it becomes. Set data.becomes to "message", "report" or "note", then send it. ` +
        'Nothing was sent.',
      409,
    )
  }
  const body = (draft.data as Record<string, unknown>)['body']
  if (typeof body !== 'string' || body.trim() === '') {
    throw new PanelError(`Draft ${id} has no words in data.body, so there is nothing to send. Nothing was sent.`, 409)
  }
  const to = draftForOf(draft.data)
  if (becomes === 'message' && to.length === 0) {
    throw new PanelError(
      `Draft ${id} becomes a message and names nobody in data.for, so the message would reach nobody. Say whom it is ` +
        'for, then send it. Nothing was sent.',
      409,
    )
  }

  const made = sqlite.transaction((): CreateResult => {
    const became = createRecordWithReport({
      workspaceId,
      kind: becomes,
      title: draft.title,
      data: whatItBecomes(becomes, body, to),
      actor,
      ...(writtenFrom === undefined ? {} : { writtenFrom }),
      // derived_from in its general sense: the record a draft becomes was made from that draft.
      links: [{ type: 'derived_from', toId: id }],
      // NEITHER LIST OF TITLES ALREADY FILED. The send door's answer (api/drafts.ts) names neither, and nothing else
      // reads them. The list of close titles reads the title of every live record of the project.
      namesWhatIsAlreadyFiled: false,
    })
    asTheDraftSendDoor(() =>
      patchRecord(id, { dataPatch: { [SENT_AS]: became.record.id, [SENT_AT]: localStamp(new Date()) } }, actor),
    )
    return became
  })()
  const after = getRecord(id)
  if (after === null) throw new Error(`draft ${id} was sent and then could not be read back`)
  return {
    draft: after,
    became: made,
    note:
      `Sent. Draft ${id} became ${becomes} ${made.record.id}, which is linked back to the draft. The draft is ` +
      'kept as it was sent and cannot be changed now.',
  }
}

// ============================================================================ the reminder

/** Who a reminder about one draft goes to, and the sentence that is true for them. */
interface WhoIsReminded {
  to: ParticipantRef
  said: string
}

/**
 * WHO IS REMINDED ABOUT A DRAFT, AND WHAT IS TRUE TO SAY TO THEM. At point 5 of a decision
 * , the writer, or the writer's starter once the writer's run has ended, is
 * reminded. Where the office cannot name
 * either, the person is told, and the sentence says why.
 *
 * THE WRITER'S RUN is the run that filed the draft, read off its first revision. It has ended when
 * its session record's state says so (`theRunHasEnded`). THE STARTER is the `startedBy` on the
 * writer's registry row, read by exact id and then as the one agent a name means.
 */
function whoIsReminded(draft: PanelRecord, ends: TheEndsOfTheLedger): WhoIsReminded {
  const opening = `The draft "${draft.title}" (${draft.id}) has not been sent. It was last changed at ${ends.newestAt}. Nothing sends it by itself.`
  const toThePerson = (why: string): WhoIsReminded => ({ to: THE_PERSON_REF, said: `${opening} This comes to you because ${why}` })
  const stored = theTwoHalvesOfAStamp(ends.writer)
  if (stored.actorType === 'human') {
    return {
      to: THE_PERSON_REF,
      said: `Your draft "${draft.title}" (${draft.id}) has not been sent. It was last changed at ${ends.newestAt}. Nothing sends it by itself.`,
    }
  }
  if (stored.actorType !== 'agent') return toThePerson(`it was written by "${ends.writer}", which is neither an agent nor the person.`)
  const named = everyAgentAStoredStampCouldName(stored.actorId)
  if (named.length !== 1) {
    return toThePerson(
      named.length === 0
        ? `no registered agent answers to "${stored.actorId}", who wrote it.`
        : `the name "${stored.actorId}", who wrote it, could mean more than one agent.`,
    )
  }
  const writer = named[0]!
  const run = ends.writtenIn === null ? null : getRecord(ends.writtenIn)
  if (run === null || run.kind !== 'session') {
    return toThePerson(`nothing recorded which run of ${writer.handle} wrote it, so Mole Office cannot tell whether ${writer.handle} is still working.`)
  }
  if (!theRunHasEnded((run.data as Record<string, unknown>)['state'])) {
    return {
      to: { kind: 'agent', id: writer.id },
      said:
        `Your draft "${draft.title}" (${draft.id}) has not been sent. It was last changed at ${ends.newestAt}. Nothing ` +
        `sends it by itself. Send it with POST /api/drafts/${draft.id}/send when it is ready.`,
    }
  }
  const registered = readParticipant({ kind: 'agent', id: writer.id })
  const starter = registered !== null && 'startedBy' in registered ? registered.startedBy : null
  if (starter === null) {
    return toThePerson(`the run of ${writer.handle} that wrote it has ended and nobody recorded who started ${writer.handle}.`)
  }
  if (starter.kind === 'person') {
    return {
      to: starter,
      said: `${opening} ${writer.handle} wrote it, and the run that wrote it has ended. You started ${writer.handle}, so this comes to you. Only ${writer.handle} can send it.`,
    }
  }
  const starters = everyAgentAStoredStampCouldName(starter.id)
  const starterAgent = starters.length === 1 ? starters[0]! : null
  if (starterAgent === null) {
    return toThePerson(`the run of ${writer.handle} that wrote it has ended, and no one registered agent answers to "${starter.id}", who started ${writer.handle}.`)
  }
  return {
    to: { kind: 'agent', id: starterAgent.id },
    said: `${opening} ${writer.handle} wrote it, and the run that wrote it has ended. You started ${writer.handle}, so this comes to you. Only ${writer.handle} can send it.`,
  }
}

/**
 * THE DRAFT REMINDERS ALREADY SAID, as one key per draft and version. Read beside the office's own
 * lines, the way the idle reminder reads its own: a flag stored somewhere else could disagree with
 * the message that was actually written.
 */
function draftRemindersAlreadySaid(): Set<string> {
  const said = new Set<string>()
  for (const one of db
    .select({
      draft: sql<unknown>`json_extract(${records.data}, '$.extra.draft')`,
      version: sql<unknown>`json_extract(${records.data}, '$.extra.draftVersion')`,
    })
    .from(records)
    .where(
      and(
        eq(records.kind, 'message'),
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, '$.body') = ${SYSTEM_LINES.aDraftIsNotSent('').line}`,
        sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
      ),
    )
    .all()) {
    if (typeof one.draft === 'string' && typeof one.version === 'number') said.add(aVersion(one.draft, one.version))
  }
  return said
}

function aVersion(draft: string, version: number): string {
  return JSON.stringify([draft, version])
}

/**
 * THE DRAFT VERSIONS A PASS HAS ALREADY LOOKED AT in this run of the server, one key per version (`aVersion`). A version
 * goes in once a pass has decided about it: it found the version said, or said it. It is kept in memory and nowhere
 * else, so after a restart the first pass with a due draft reads the said set once. A key is never dropped: a version
 * is looked at once, and a key left by a draft since sent, deleted or changed is never asked for again.
 */
const lookedAt = new Set<string>()

/**
 * ONE PASS OF THE DRAFT REMINDER, in every project of the installation. Called by the office's
 * reminder tick, `sendTheRemindersThatAreDue` in lib/reminders.ts, with its clock.
 *
 * A draft not sent, whose reminder time has passed since its newest revision, is said once for that
 * revision. A change makes a new revision and so a new version, which may be reminded again once its
 * own time has passed. THIS NEVER SENDS A DRAFT: it writes one office line and nothing else.
 */
export function sendTheDraftRemindersThatAreDue(now: Date, by: Actor): string[] {
  const at = now.getTime()
  const reminded: string[] = []
  let said: Set<string> | null = null
  for (const project of listWorkspaces()) {
    const waiting = db
      .select()
      .from(records)
      .where(
        and(
          eq(records.kind, DRAFT_KIND),
          eq(records.workspaceId, project.id),
          isNull(records.deletedAt),
          sql`json_extract(${records.data}, '$.sentAs') IS NULL`,
        ),
      )
      .all()
    if (waiting.length === 0) continue
    const ledger = theEndsOfTheLedger(waiting.map((one) => one.id))
    for (const row of waiting) {
      const draft = getRecord(row.id)
      const ends = ledger.get(row.id)
      if (draft === null || ends === undefined) continue
      const due = whenTheReminderIsDue(ends.newestAt, draft.data)
      if (due === null || at < due.ms) continue
      const version = aVersion(draft.id, ends.newestSeq)
      // A VERSION AN EARLIER PASS LOOKED AT is said already, so the messages are not read again for it.
      if (!lookedAt.has(version)) {
        said ??= draftRemindersAlreadySaid()
        if (!said.has(version)) {
          const who = whoIsReminded(draft, ends)
          writeASystemLineToOne(who.to, project.id, SYSTEM_LINES.aDraftIsNotSent(who.said), by, undefined, {
            draft: draft.id,
            draftVersion: ends.newestSeq,
          })
          said.add(version)
          reminded.push(draft.id)
        }
      }
      lookedAt.add(version)
    }
  }
  return reminded
}
