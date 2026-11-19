// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../server/db/client.ts'
import { giveTheFill } from '../server/db/part-tables.ts'
import { batchedNoticeKinds, ownNoticeRules } from '../server/lib/notice-rules.ts'
import { isANoticeKind, isAnInspector } from '../server/lib/notices.ts'
import { isMoleOffice, type ParticipantRef } from '../shared/participants.ts'
import { clockStamp } from '../shared/time.ts'
import { quotePositionsOf, quotesOf } from '../shared/messages.ts'
import { settingValue } from '../config/settings.mjs'
import { tellTheWaitersFor } from '../server/lib/waiting-hold.ts'
import { named } from '../server/lib/named-timers.ts'
import { sayWhereADeliveryStands } from '../server/lib/messages.ts'

export const BATCH_HELD = 'Your notice batch waits for your next independently started work turn or the office batch time limit. The message is readable now.'
type Held = { deliveryId: string; messageId: string; heldAt: string; releasedTurn: string | null; data: string }
function authentic(data: Record<string, unknown>): boolean {
  const sender = data['sentBy'] as ParticipantRef | undefined
  return sender !== undefined && sender !== null && (isMoleOffice(sender) || isAnInspector(sender)) && isANoticeKind(data['notice'])
}
export function noticeBatchMaxMinutes(): number {
  const minutes = Number(settingValue('MOLE_OFFICE_NOTICE_BATCH_MAX_MINUTES'))
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('The notice batch time limit must be a positive number of minutes.')
  return minutes
}
/** Capture the arrival instant once, inside the transaction that creates the original delivery. */
export function holdNoticeDeliveries(messageId: string, recipients: readonly ParticipantRef[]): boolean {
  const row = sqlite.prepare('SELECT data FROM records WHERE id=?').get(messageId) as { data: string } | undefined
  if (row === undefined) return false
  const data = JSON.parse(row.data) as Record<string, unknown>
  if (!authentic(data)) return false
  let wrote = false
  for (const recipient of recipients) {
    if (!batchedNoticeKinds(recipient).includes(data['notice'] as never)) continue
    const result = sqlite.prepare('INSERT OR IGNORE INTO notice_batch_deliveries(delivery_id,held_at) SELECT id,? FROM message_delivery WHERE message_id=? AND recipient_kind=? AND recipient_id=?')
      .run(clockStamp().instant, messageId, recipient.kind, recipient.id)
    if (result.changes > 0) wrote = true
  }
  scheduleNoticeBatchClock()
  return wrote
}
function rowsFor(recipient: ParticipantRef): Held[] {
  // Keep the recipient index first and check batch membership before fetching message data.
  return sqlite.prepare("SELECT d.id AS deliveryId,d.message_id AS messageId,b.held_at AS heldAt,b.released_turn AS releasedTurn,r.data FROM message_delivery d CROSS JOIN notice_batch_deliveries b ON b.delivery_id=d.id CROSS JOIN records r ON r.id=d.message_id WHERE d.recipient_kind=? AND d.recipient_id=? AND d.mark='queued' AND r.deleted_at IS NULL ORDER BY d.rowid")
    .all(recipient.kind, recipient.id) as Held[]
}
function pending(recipient: ParticipantRef): Held[] {
  const kinds = batchedNoticeKinds(recipient)
  return rowsFor(recipient).filter(row => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    return row.releasedTurn === null && authentic(data) && kinds.includes(data['notice'] as never)
  })
}
/** Reads never accept work or consume messages. A released original remains queued until acknowledged. */
export function batchDeliveryStates(recipient: ParticipantRef): Map<string,{state:'held'|'released';turn:string|null}> {
  const kinds=batchedNoticeKinds(recipient), states=new Map<string,{state:'held'|'released';turn:string|null}>()
  for(const row of rowsFor(recipient)) {
    const data=JSON.parse(row.data) as Record<string,unknown>
    if(authentic(data) && kinds.includes(data['notice'] as never)) states.set(row.messageId,{state:row.releasedTurn===null ? 'held' : 'released',turn:row.releasedTurn})
  }
  return states
}
export function batchDeliveryState(messageId: string, recipient: ParticipantRef): 'held' | 'released' | null {
  return batchDeliveryStates(recipient).get(messageId)?.state ?? null
}
export function pendingNoticeBatches(recipient: ParticipantRef) {
  const grouped = new Map<string, { kind: string; count: number; oldest: string; messageId: string }>()
  const states=batchDeliveryStates(recipient)
  for (const row of rowsFor(recipient).filter(row=>states.has(row.messageId))) {
    const kind = JSON.parse(row.data)['notice'] as string, held = grouped.get(kind)
    if (held === undefined) grouped.set(kind, { kind, count: 1, oldest: row.heldAt, messageId: row.messageId })
    else { held.count++; if (Date.parse(row.heldAt) < Date.parse(held.oldest)) { held.oldest = row.heldAt; held.messageId = row.messageId } }
  }
  return [...grouped.values()]
}
/** Freeze arrival order before launching or offering a handover. Re-reading the same turn keeps its cutoff. */
export function prepareNoticeBatch(recipient: ParticipantRef, turn: string, includeReleased = false) {
  return sqlite.transaction(() => {
    const states = includeReleased ? batchDeliveryStates(recipient) : null
    sqlite.prepare('INSERT OR IGNORE INTO notice_batch_turns(id,recipient_kind,recipient_id,delivery_ids) VALUES (?,?,?,?)').run(turn, recipient.kind, recipient.id, JSON.stringify((includeReleased ? rowsFor(recipient).filter(row=>states!.has(row.messageId)) : pending(recipient)).map(row => row.deliveryId)))
    const stored = sqlite.prepare('SELECT delivery_ids AS ids,accepted_at AS acceptedAt FROM notice_batch_turns WHERE id=? AND recipient_kind=? AND recipient_id=?').get(turn, recipient.kind, recipient.id) as { ids: string; acceptedAt: string | null } | undefined
    if (stored === undefined) throw new Error('This notice batch turn belongs to another recipient.')
    const ids = new Set<string>(JSON.parse(stored.ids) as string[])
    const messages = rowsFor(recipient).filter(row => ids.has(row.deliveryId)).map(row => {
      const data = JSON.parse(row.data) as Record<string, unknown>
      return {
        messageId: row.messageId,
        body: [data['body'], data['saidInFull']].filter(part => typeof part === 'string' && part.length > 0).join('\n\n'),
        writtenIn: data['writtenIn'],
        quotes: quotesOf({ kind: 'message', data }),
        quotePositions: quotePositionsOf({ kind: 'message', data }),
      }
    })
    return { turn, messages }
  })()
}
/** Accept once. Only a launch that already received these originals may acknowledge them together. */
export function acceptNoticeBatch(recipient: ParticipantRef, turn: string, delivered = false): void {
  const accepted = sqlite.transaction(() => {
    const stored = sqlite.prepare('SELECT delivery_ids AS ids,accepted_at AS acceptedAt FROM notice_batch_turns WHERE id=? AND recipient_kind=? AND recipient_id=?').get(turn, recipient.kind, recipient.id) as { ids: string; acceptedAt: string | null } | undefined
    if (stored === undefined) return false
    if (stored.acceptedAt === null) {
      sqlite.prepare('UPDATE notice_batch_turns SET accepted_at=? WHERE id=? AND recipient_kind=? AND recipient_id=?').run(clockStamp().instant, turn, recipient.kind, recipient.id)
      for (const id of JSON.parse(stored.ids) as string[]) sqlite.prepare('UPDATE notice_batch_deliveries SET released_turn=? WHERE delivery_id=? AND released_turn IS NULL').run(turn, id)
    }
    if (delivered) for (const id of JSON.parse(stored.ids) as string[]) {
      const row = sqlite.prepare("SELECT d.message_id AS messageId FROM message_delivery d JOIN notice_batch_deliveries b ON b.delivery_id=d.id WHERE d.id=? AND d.mark='queued' AND b.released_turn IS NOT NULL").get(id) as {messageId:string} | undefined
      if (row) sayWhereADeliveryStands(row.messageId,recipient,{mark:'delivered',because:'The original notice was handed over in this work turn.',run:turn.startsWith('run:') ? turn.slice(4) : null})
    }
    return stored.acceptedAt === null
  })()
  if (accepted) tellTheWaitersFor([recipient])
  scheduleNoticeBatchClock()
}
export function beginNoticeWorkTurn(recipient: ParticipantRef, session: string): void {
  const launchTurn = 'run:' + session
  const prepared = sqlite.prepare('SELECT 1 FROM notice_batch_turns WHERE id=? AND recipient_kind=? AND recipient_id=?').get(launchTurn,recipient.kind,recipient.id) !== undefined
  // A handle claim releases the batch, but only a prepared launcher received its originals in the prompt.
  const batch = prepareNoticeBatch(recipient, prepared ? launchTurn : 'hold:' + session)
  acceptNoticeBatch(recipient, batch.turn)
}
/** The deadline itself can start a batch turn; no other activity by the agent is required. */
export function releaseNoticeBatchesDue(now = new Date()): void {
  const recipients = sqlite.prepare("SELECT DISTINCT d.recipient_kind AS kind,d.recipient_id AS id FROM notice_batch_deliveries b JOIN message_delivery d ON d.id=b.delivery_id WHERE b.released_turn IS NULL AND d.mark='queued'").all() as ParticipantRef[]
  for (const recipient of recipients) {
    const due = pending(recipient).find(row => Date.parse(row.heldAt) + noticeBatchMaxMinutes() * 60_000 <= now.getTime())
    if (due === undefined) continue
    const batch = prepareNoticeBatch(recipient, 'timer:' + due.deliveryId)
    acceptNoticeBatch(recipient, batch.turn)
  }
}
let timer: NodeJS.Timeout | undefined, clockLog: ((line: string) => void) | null = null
export function stopNoticeBatchClock(): void { if (timer) clearTimeout(timer); timer = undefined; clockLog = null }
export function scheduleNoticeBatchClock(): void {
  if (clockLog === null) return
  if (timer) clearTimeout(timer)
  const recipients = sqlite.prepare("SELECT DISTINCT d.recipient_kind AS kind,d.recipient_id AS id FROM notice_batch_deliveries b JOIN message_delivery d ON d.id=b.delivery_id WHERE b.released_turn IS NULL AND d.mark='queued'").all() as ParticipantRef[]
  const times = recipients.flatMap(recipient => pending(recipient).map(row => Date.parse(row.heldAt) + noticeBatchMaxMinutes() * 60_000))
  if (times.length === 0) { timer = undefined; return }
  const log = clockLog
  timer = setTimeout(named('notice batch deadline', log, () => {
    try { releaseNoticeBatchesDue() } catch (error) { log(`The notice batch deadline could not finish: ${String(error)}`) }
    scheduleNoticeBatchClock()
  }), Math.max(0, Math.min(...times) - Date.now()))
  timer.unref()
}
export function startNoticeBatchClock(log: (line: string) => void): void { stopNoticeBatchClock(); clockLog = log; releaseNoticeBatchesDue(); scheduleNoticeBatchClock() }

/** The restore corpus uses the same delivery and turn writers as the message door. */
export async function fillNoticeBatchProof(): Promise<string> {
  const existing = sqlite.prepare('SELECT delivery_id FROM notice_batch_deliveries LIMIT 1').get()
  if (existing !== undefined) return 'An original held notice and its frozen work turn.'
  const { createRecord, patchRecord } = await import('../server/lib/records.ts')
  const { asNoticeRulesDoor } = await import('../server/lib/notice-rules-door.ts')
  const { MESSAGE_CENTRE } = await import('../shared/workspaces.ts')
  const { writeASystemLineToOne } = await import('../server/lib/groups.ts')
  const { SYSTEM_LINES } = await import('../shared/groups.ts')
  const { moleOffice } = await import('../shared/participants.ts')
  const person = sqlite.prepare('SELECT id FROM people LIMIT 1').get() as { id: string }
  const recipient: ParticipantRef = { kind: 'person', id: person.id }
  const current=ownNoticeRules(recipient)
  if (current === null) asNoticeRulesDoor(() => createRecord({ workspaceId: MESSAGE_CENTRE, kind: 'notice_rules', title: 'Notice choices for the restore proof', data: { recipient, mutedKinds: [], batchedKinds: ['theBroadcastIsDue'], because: 'Keep a notice batch through export and restore.' }, actor: { type: 'human', id: person.id } }))
  else asNoticeRulesDoor(()=>patchRecord(current.id,{dataPatch:{mutedKinds:[],batchedKinds:['theBroadcastIsDue']}},{type:'human',id:person.id}))
  writeASystemLineToOne(recipient, MESSAGE_CENTRE, SYSTEM_LINES.theBroadcastIsDue('Restore proof'), { type: 'system', id: moleOffice().id })
  prepareNoticeBatch(recipient, 'restore-proof-turn')
  return 'An original held notice and its frozen work turn.'
}
// The schema part of these two tables names this file for its fill, so the database folder imports nothing above itself.
giveTheFill('src/holder/notice-batches.ts', fillNoticeBatchProof)
