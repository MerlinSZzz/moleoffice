// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * DRAFTS BY DEFAULT: WHAT AN AGENT'S RUN WRITES TO ONE SET OF READERS IN ONE TURN GOES AS ONE MESSAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH WRITES ARE HELD
 * ---------------------------------------------------------------------------------------
 *
 * A message written through POST /api/records is held, and not sent, when all of these are true:
 *   - it is not urgent;
 *   - its writer is an agent's own live run, proved by the run's key;
 *   - that run has told Mole Office that it reports the end of each turn (POST /api/drafts/turn);
 *   - the write carries a kind, a title and data, and nothing else (no summary, no links, no warrant).
 * Every other write is sent at once, as before. A person's message is never held.
 *
 * THE RECORD DOOR CHECKS A HELD WRITE EXACTLY AS IT CHECKS A SEND, with nothing stored (its own check mode), so a
 * held message is one the office would accept now. A write the check refuses is refused, as a send would be.
 *
 * ---------------------------------------------------------------------------------------
 * HOW HELD WORDS JOIN
 * ---------------------------------------------------------------------------------------
 *
 * The words go into the run's turn draft for those readers: a draft record whose `turn` field holds the message's
 * other fields. A second write to the same readers adds its words after a blank line. A write to other readers gets a
 * draft of its own. So does a write whose other fields differ (a different inReplyTo, say), and a write with a Take me
 * there when the draft already has one, since a message carries at most one. A write with a send id that one of the
 * run's turn drafts already holds adds nothing.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN A HELD DRAFT GOES
 * ---------------------------------------------------------------------------------------
 *
 *   - when the run says its turn ended, or that a new one started;
 *   - first, when the run reads its inbox, so it never reads an answer to words it has not sent;
 *   - first, when the run finishes or seals, before the seal reads the run's last message to its starter and before
 *     its key is taken back, so an END written in the same turn as the seal is the one the seal reads;
 *   - to a person, or to a group with a person among its members, at most ten minutes after its first words were held,
 *     even while the turn runs on. A group of agents only waits for the turn's end, as a draft to an agent does;
 *   - when its run has ended, or Mole Office no longer knows that the run reports its turns (after a restart).
 * The first three are filed by the run itself. The last two are filed by Mole Office, with the agent as the sender
 * and the run as the run the words came from.
 *
 * NOTHING CHECKS WHAT A MESSAGE SAYS BEFORE IT GOES. A send that is refused when it goes keeps its draft, the draft
 * says why, and Mole Office does not try it again.
 *
 * WHICH RUNS REPORT THEIR TURNS IS KEPT IN MEMORY. After a restart nothing is held until a run says so again, and
 * the drafts held before the restart go at the next pass of the reminders.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'

import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { DRAFT_KIND, SENT_AS, SENT_AT } from '@shared/drafts.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'
import { localStamp, parseAnyStamp } from '@shared/time.ts'
import { A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES, TURN } from '@shared/turn-drafts.ts'
import { answeringMayHaveChanged } from './answering-told.ts'
import { asTheDraftSendDoor } from './draft-door.ts'
import { actorFrom } from './http.ts'
import { theOwnRunThisRequestKeyProves } from './keys.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { writtenFrom, type WrittenFrom } from './machines.ts'
import { membersOf } from '../db/members-of.ts'
import { participantForActor } from './participant-for-actor.ts'
import { createRecordWithReport, patchRecord, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { asTheTurnDrafts } from './turn-draft-door.ts'
import { whomAnAgentIsReplyingTo } from '../db/whom-an-agent-is-replying-to.ts'
import { HELD_FOR } from '../db/whom-an-agent-is-replying-to.ts'
import { FROM_THE_HELD } from '../db/whom-an-agent-is-replying-to.ts'

/** What a turn draft's `turn` field holds. */
interface Turn {
  /** The run that wrote the words. */
  run: string
  /** The agent the run serves, who is the message's sender. */
  agent: ParticipantRef
  /** Who reads it, as one key: see readersOf. */
  readers: string
  /** When its first words were held, local time. */
  heldAt: string
  /** How many writes it holds. */
  writes: number
  /** The send ids of the writes it holds, in order. */
  sendIds: string[]
  /** The message's fields other than its words, its send id and its urgency, as the record door checked them. */
  fields: Record<string, unknown>
  /** Where the first write came from, for a send Mole Office files. */
  writtenFrom?: WrittenFrom
  /** Whether it goes within ten minutes: to a person, or to a group with a person among its members. */
  toAPerson: boolean
  /** A send that was refused when it went, and why. Mole Office does not try it again. */
  notSent?: { at: string; why: string }
}

interface HeldRow {
  id: string
  workspaceId: string
  title: string
  body: string
  turn: Turn
}

/** The runs that said they report the end of each turn. In memory: see the file's last paragraph. */
const THE_RUNS_THAT_REPORT_THEIR_TURNS = new Set<string>()

export { HELD_FOR } from '../db/whom-an-agent-is-replying-to.ts'

export { FROM_THE_HELD } from '../db/whom-an-agent-is-replying-to.ts'

const HELD = `SELECT id, workspace_id AS workspaceId, title, data ${FROM_THE_HELD} AND deleted_at IS NULL`

function rowsOf(rows: unknown[]): HeldRow[] {
  return (rows as { id: string; workspaceId: string; title: string; data: string }[]).map((row) => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    return { id: row.id, workspaceId: row.workspaceId, title: row.title, body: String(data['body'] ?? ''), turn: data[TURN] as Turn }
  })
}

/** The drafts a run holds now. A run serves one agent, and the agent is how they are found. */
function theHeldDraftsOfARun(run: string, agentId: string): HeldRow[] {
  return rowsOf(sqlite.prepare(`${HELD} AND ${HELD_FOR} = ? AND json_extract(data, '$.${TURN}.run') = ? ORDER BY created_at, id`).all(agentId, run))
}

function everyHeldDraft(): HeldRow[] {
  return rowsOf(sqlite.prepare(`${HELD} ORDER BY created_at, id`).all())
}

function isAnObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function theSessionHeaderOf(req: FastifyRequest): string | null {
  const said = req.headers[ACTOR_HEADERS.session]
  return typeof said === 'string' && said !== '' ? said : null
}

/** Who reads a message, as one key: `group:<id>`, or the sorted `<kind>:<id>` of everybody in `to`. */
function readersOf(data: Record<string, unknown>): string {
  if (typeof data['toGroup'] === 'string') return `group:${data['toGroup']}`
  const to = Array.isArray(data['to']) ? data['to'] : []
  return to
    .map((one) => (isAnObject(one) ? `${String(one['kind'])}:${String(one['id'])}` : String(one)))
    .sort()
    .join(',')
}

/** The same value with every object's keys in order, so two equal fields compare equal. */
function inKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inKeyOrder)
  if (!isAnObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, inKeyOrder(value[key])]))
}

/** The first field that differs between two messages' other fields, leaving out who reads them and the lead. */
function theFieldThatDiffers(held: Record<string, unknown>, written: Record<string, unknown>): string | null {
  const skip = new Set(['to', 'toGroup', 'lead'])
  const keys = [...new Set([...Object.keys(held), ...Object.keys(written)])].filter((key) => !skip.has(key)).sort()
  for (const key of keys) {
    if (JSON.stringify(inKeyOrder(held[key])) !== JSON.stringify(inKeyOrder(written[key]))) return key
  }
  return null
}

function whenItGoes(turn: Turn): string {
  if (!turn.toAPerson) return 'at the end of this turn, when this run reads its inbox, or when it finishes'
  const held = parseAnyStamp(turn.heldAt)
  const by = held === null ? 'ten minutes after its first words were held' : localStamp(new Date(held.getTime() + A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES * 60_000))
  return `at the end of this turn, when this run reads its inbox, or when it finishes, and by ${by} at the latest`
}

/** What the record door answers for a held write: 202, or 200 for a send id already held. */
export interface HeldAnswer {
  held: { draft: string; joined: boolean; writes: number; readers: string; goes: string }
  /** Why the write did not join the draft already held for these readers, when one was. */
  startedAnotherDraftBecause?: string
  /** True when the write's send id was already held, so nothing was added. */
  alreadyHeld?: true
  note: string
}

const HELD_NOTE =
  'Held, not yet sent. The messages this run writes to these readers in this turn go together as one message, at ' +
  'the end of the turn, first when the run reads its inbox, and first when it finishes. A message to a person or a ' +
  `group goes within ${String(A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES)} minutes. To send a message at once, write ` +
  'it with "urgent": true.'

/**
 * THE RECORD DOOR'S WRITE OF A RECORD, HELD WHEN IT IS A MESSAGE THIS FILE HOLDS (see the top of the file), and
 * otherwise filed as before. `file` is the door's own write, which answers its own status; 'check' stores nothing.
 */
export async function throughTheTurnDraft<T>(
  req: FastifyRequest,
  reply: FastifyReply,
  workspaceId: string,
  file: (only: 'write' | 'check') => Promise<T>,
): Promise<T | HeldAnswer> {
  const write = theWriteThisFileHolds(req)
  if (write === null) return file('write')
  const checked = (await file('check')) as { wouldAnswerStatus?: unknown }
  // A SEND ID ALREADY SENT (200) AND A RETIRED ADDRESSEE THE DOOR ROUTES (409) ARE ANSWERED BY THE DOOR, as before.
  if (checked.wouldAnswerStatus !== 201) return file('write')
  const answer = asTheTurnDrafts(() => sqlite.transaction(() => holdIt(workspaceId, write))())
  reply.status(answer.alreadyHeld === true ? 200 : 202)
  return answer
}

interface AWriteToHold {
  run: string
  actor: Actor
  agent: ParticipantRef
  title: string
  data: Record<string, unknown>
  from: WrittenFrom
}

function theWriteThisFileHolds(req: FastifyRequest): AWriteToHold | null {
  const body = req.body
  if (!isAnObject(body) || body['kind'] !== 'message' || typeof body['title'] !== 'string') return null
  if (Object.keys(body).some((key) => key !== 'kind' && key !== 'title' && key !== 'data')) return null
  const data = body['data']
  if (!isAnObject(data) || data['urgent'] === true || typeof data['body'] !== 'string') return null
  if (!Array.isArray(data['to']) && typeof data['toGroup'] !== 'string') return null
  const session = theSessionHeaderOf(req)
  if (session === null || !THE_RUNS_THAT_REPORT_THEIR_TURNS.has(session)) return null
  const actor = actorFrom(req)
  if (actor.type !== 'agent') return null
  if (theOwnRunThisRequestKeyProves(req) !== session) return null
  const agent = participantForActor(actor)
  if (agent === null || agent.kind !== 'agent') return null
  return { run: session, actor, agent, title: body['title'], data, from: writtenFrom(req) }
}

/**
 * WHETHER A HELD MESSAGE IS WRITTEN TO A PERSON, so it goes within the minutes: a person among its `to`, or a person
 * among its group's members when its first words are held. A group of agents only waits for the turn's end.
 */
function itReachesAPerson(fields: Record<string, unknown>): boolean {
  if (Array.isArray(fields['to']) && fields['to'].some((one) => isAnObject(one) && one['kind'] === 'person')) return true
  return typeof fields['toGroup'] === 'string' && membersOf(fields['toGroup']).some((member) => member.who.kind === 'person')
}

function holdIt(workspaceId: string, write: AWriteToHold): HeldAnswer {
  const { body: words, sendId, urgent: _urgent, ...fields } = write.data
  const readers = readersOf(write.data)
  if (typeof sendId === 'string') {
    const already = sqlite
      .prepare(
        `SELECT id, workspace_id AS workspaceId, title, data FROM records WHERE kind = '${DRAFT_KIND}' AND deleted_at IS NULL ` +
          `AND json_extract(data, '$.${TURN}.run') = ? AND EXISTS (SELECT 1 FROM json_each(data, '$.${TURN}.sendIds') WHERE value = ?)`,
      )
      .all(write.run, sendId)
    const [one] = rowsOf(already)
    if (one !== undefined) {
      return {
        held: { draft: one.id, joined: false, writes: one.turn.writes, readers: one.turn.readers, goes: whenItGoes(one.turn) },
        alreadyHeld: true,
        note: `A write with send id "${sendId}" is already in turn draft ${one.id}, so nothing was added.`,
      }
    }
  }
  let startedBecause: string | undefined
  for (const draft of theHeldDraftsOfARun(write.run, write.agent.id)) {
    if (draft.turn.readers !== readers) continue
    const differs = theFieldThatDiffers(draft.turn.fields, fields)
    if (differs !== null) {
      startedBecause ??= `The draft already held for these readers has a different ${differs}.`
      continue
    }
    if (fields['lead'] !== undefined && draft.turn.fields['lead'] !== undefined) {
      startedBecause ??= 'The draft already held for these readers has a Take me there, and a message carries at most one.'
      continue
    }
    const turn: Turn = {
      ...draft.turn,
      writes: draft.turn.writes + 1,
      sendIds: typeof sendId === 'string' ? [...draft.turn.sendIds, sendId] : draft.turn.sendIds,
      fields: fields['lead'] !== undefined ? { ...draft.turn.fields, lead: fields['lead'] } : draft.turn.fields,
    }
    patchRecord(draft.id, { dataPatch: { body: `${draft.body}\n\n${String(words)}`, [TURN]: turn } }, write.actor)
    return { held: { draft: draft.id, joined: true, writes: turn.writes, readers, goes: whenItGoes(turn) }, note: HELD_NOTE }
  }
  const turn: Turn = {
    run: write.run,
    agent: write.agent,
    readers,
    heldAt: localStamp(new Date()),
    writes: 1,
    sendIds: typeof sendId === 'string' ? [sendId] : [],
    fields,
    writtenFrom: write.from,
    toAPerson: itReachesAPerson(fields),
  }
  const made = createRecordWithReport({
    workspaceId,
    kind: DRAFT_KIND,
    title: write.title,
    data: { body: String(words), for: Array.isArray(fields['to']) ? fields['to'] : [], becomes: 'message', [TURN]: turn },
    actor: write.actor,
    namesWhatIsAlreadyFiled: false,
  })
  answeringMayHaveChanged([write.agent.id])
  return {
    held: { draft: made.record.id, joined: false, writes: 1, readers, goes: whenItGoes(turn) },
    ...(startedBecause === undefined ? {} : { startedAnotherDraftBecause: startedBecause }),
    note: HELD_NOTE,
  }
}

// ============================================================================ sending

/** Who files a send: the run itself, from one of its own requests, or Mole Office. */
type Sender = { how: 'the run'; actor: Actor; from: WrittenFrom } | { how: 'the office' }

/** What one pass of sends did. */
export interface TurnDraftsSent {
  sent: { draft: string; message: string }[]
  notSent: { draft: string; why: string }[]
}

function sendOne(draft: HeldRow, sender: Sender, said: TurnDraftsSent): void {
  const { turn } = draft
  const actor: Actor = sender.how === 'the run' ? sender.actor : { type: 'system', id: moleOffice().id }
  const data: Record<string, unknown> = { ...turn.fields, body: draft.body }
  if (turn.sendIds[0] !== undefined) data['sendId'] = turn.sendIds[0]
  if (sender.how === 'the office') {
    data['sentBy'] = turn.agent
    data['fromRun'] = turn.run
  }
  const from = sender.how === 'the run' ? sender.from : turn.writtenFrom
  try {
    const message = asTheTurnDrafts(() =>
      sqlite.transaction(() => {
        const made = createRecordWithReport({
          workspaceId: draft.workspaceId,
          kind: 'message',
          title: draft.title,
          data,
          actor,
          ...(from === undefined ? {} : { writtenFrom: from }),
          // MOLE OFFICE FILES THE WORDS A RUN WROTE, so the sender is the agent and the run is named: the record door
          // checked the words when they were held.
          ...(sender.how === 'the office' ? { senderIsTheRun: true } : {}),
          // derived_from in its general sense: the message a turn draft becomes was made from that draft.
          links: [{ type: 'derived_from', toId: draft.id }],
          namesWhatIsAlreadyFiled: false,
        })
        asTheDraftSendDoor(() => patchRecord(draft.id, { dataPatch: { [SENT_AS]: made.record.id, [SENT_AT]: localStamp(new Date()) } }, actor))
        return made.record.id
      })(),
    )
    said.sent.push({ draft: draft.id, message })
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    asTheTurnDrafts(() => patchRecord(draft.id, { dataPatch: { [TURN]: { ...turn, notSent: { at: localStamp(new Date()), why } } } }, actor))
    console.log(`Turn draft ${draft.id} of run ${turn.run} was not sent, and it stays a draft: ${why}`)
    said.notSent.push({ draft: draft.id, why })
  }
}

function sendEach(drafts: HeldRow[], sender: Sender): TurnDraftsSent {
  const said: TurnDraftsSent = { sent: [], notSent: [] }
  for (const draft of drafts) sendOne(draft, sender, said)
  const agents = [...new Set(drafts.map((one) => one.turn.agent.id))]
  if (agents.length > 0) answeringMayHaveChanged(agents)
  return said
}

/** The agent a request's actor is, whose held drafts it may send. Null for anybody else. */
function theAgentOf(req: FastifyRequest): ParticipantRef | null {
  const agent = participantForActor(actorFrom(req))
  return agent !== null && agent.kind === 'agent' ? agent : null
}

/** The held drafts of the run this request's own key proves, sent by that run. Nothing when it holds none. */
function sendTheHeldDraftsOfTheRun(req: FastifyRequest, run: string): TurnDraftsSent {
  const agent = theAgentOf(req)
  if (agent === null) return { sent: [], notSent: [] }
  const held = theHeldDraftsOfARun(run, agent.id)
  if (held.length === 0) return { sent: [], notSent: [] }
  if (theOwnRunThisRequestKeyProves(req) !== run) return { sent: [], notSent: [] }
  return sendEach(held, { how: 'the run', actor: actorFrom(req), from: writtenFrom(req) })
}

/**
 * FIRST, WHEN A RUN READS ITS INBOX: its held drafts go, so it never reads an answer to words it has not sent. A
 * request with no run's own key sends nothing.
 */
export function sendTheHeldDraftsOfThisRequestsRun(req: FastifyRequest): TurnDraftsSent {
  const run = theSessionHeaderOf(req)
  return run === null ? { sent: [], notSent: [] } : sendTheHeldDraftsOfTheRun(req, run)
}

/**
 * FIRST, WHEN A RUN FINISHES OR SEALS ITSELF: its held drafts go before the seal reads the run's last message to its
 * starter, and before its key is taken back. The record PATCH door hands this the write once every refusal before it
 * has passed. The drafts go in the write's own transaction, so a write refused inside it takes the messages back too,
 * and a refused finish or seal sends nothing.
 */
export function sendTheHeldDraftsBeforeTheRunEnds<T>(req: FastifyRequest, id: string, dataPatch: unknown, write: () => T): T {
  if (!isAnObject(dataPatch)) return write()
  if (!theRunHasEnded(dataPatch['state']) && dataPatch['submission'] === undefined) return write()
  if (theSessionHeaderOf(req) !== id) return write()
  return sqlite.transaction(() => {
    sendTheHeldDraftsOfTheRun(req, id)
    return write()
  })()
}

/** The refusal of a turn report from anything but a run's own live key. */
export const ONLY_A_RUNS_OWN_KEY_REPORTS_ITS_TURNS =
  "Only an agent's own live run reports its turns, with the run's own key. This request carries no such key, so " +
  'nothing was recorded and nothing was sent.'

/** What the turn door answers. */
export interface TurnReported extends TurnDraftsSent {
  run: string
  turn: 'started' | 'ended'
  note: string
}

/**
 * THE TURN DOOR: A RUN SAYS ITS TURN ENDED, OR THAT ONE STARTED. Either way it says that it reports its turns, so
 * its messages are held from now on, and what it held before goes now.
 */
export function theTurnIs(req: FastifyRequest, turn: 'started' | 'ended'): TurnReported {
  const run = theOwnRunThisRequestKeyProves(req)
  if (run === undefined) throw new PanelError(ONLY_A_RUNS_OWN_KEY_REPORTS_ITS_TURNS, 403)
  THE_RUNS_THAT_REPORT_THEIR_TURNS.add(run)
  const agent = theAgentOf(req)
  const held = agent === null ? [] : theHeldDraftsOfARun(run, agent.id)
  const said = held.length === 0 ? { sent: [], notSent: [] } : sendEach(held, { how: 'the run', actor: actorFrom(req), from: writtenFrom(req) })
  return {
    run,
    turn,
    ...said,
    note:
      `Run ${run} reports its turns. ${String(said.sent.length)} held message(s) went now` +
      (said.notSent.length === 0 ? '' : `, and ${String(said.notSent.length)} could not be sent; each draft says why`) +
      '. Until the run ends, its messages are held and go together at the end of each turn.',
  }
}

/**
 * THE PASS OF THE REMINDERS: a held draft to a person, or to a group with a person among its members, whose first
 * words were held ten minutes ago, and every held draft whose run has ended or no longer reports its turns, go now,
 * filed by Mole Office.
 */
export function sendTheTurnDraftsThatAreDue(now: Date): string[] {
  const due = everyHeldDraft().filter((draft) => {
    if (!THE_RUNS_THAT_REPORT_THEIR_TURNS.has(draft.turn.run) || theRunEndedOrIsGone(draft.turn.run)) return true
    const held = parseAnyStamp(draft.turn.heldAt)
    return draft.turn.toAPerson && (held === null || now.getTime() - held.getTime() >= A_PERSONS_TURN_DRAFT_GOES_WITHIN_MINUTES * 60_000)
  })
  if (due.length === 0) return []
  return sendEach(due, { how: 'the office' }).sent.map((one) => one.draft)
}

function theRunEndedOrIsGone(run: string): boolean {
  const row = sqlite.prepare("SELECT json_extract(data, '$.state') AS state FROM records WHERE id = ? AND kind = 'session' AND deleted_at IS NULL").get(run) as
    | { state: unknown }
    | undefined
  if (row === undefined) return true
  if (theRunHasEnded(row.state)) THE_RUNS_THAT_REPORT_THEIR_TURNS.delete(run)
  return theRunHasEnded(row.state)
}

// ============================================================================ who is replying

export { whomAnAgentIsReplyingTo } from '../db/whom-an-agent-is-replying-to.ts'

/**
 * Whether an agent holds a draft now to this reader, alone or with others, or to this group. The reader's key is
 * made by readersOf, which made the keys the drafts hold.
 */
export function theAgentIsReplyingTo(agentId: string, reader: ParticipantRef | { group: string }): boolean {
  const key = readersOf('group' in reader ? { toGroup: reader.group } : { to: [reader] })
  return whomAnAgentIsReplyingTo(agentId).some((readers) => ('group' in reader ? readers === key : readers.split(',').includes(key)))
}
