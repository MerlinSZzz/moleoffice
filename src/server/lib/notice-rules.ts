// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqlite } from '../db/client.ts'
import { getRecord } from './records/reading.ts'
import { PanelError } from './panel-error.ts'
import { NOTICE_RULES_KIND } from './notice-rules-door.ts'
import { isANoticeKind, isAnInspector, type NoticeKind } from './notices.ts'
import { isMoleOffice, type ParticipantRef } from '@shared/participants.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import { theRoleOnTheAgentRow } from '../db/the-role-on-the-agent-row.ts'

export function aNoticeRuleRefusal(reason: string, status = 400): PanelError {
  return new PanelError(`${reason} Nothing was changed.`, status, undefined, undefined, undefined, { code: 'noticeRulesRefused', values: { reason } })
}
export function noticeRuleRefusal(reason: string, status = 400): never {
  throw aNoticeRuleRefusal(reason, status)
}
export function ownNoticeRules(recipient: ParticipantRef) {
  const rows = sqlite.prepare(`SELECT id FROM records WHERE kind=? AND deleted_at IS NULL AND json_extract(data,'$.recipient.kind')=? AND json_extract(data,'$.recipient.id')=? LIMIT 2`).all(NOTICE_RULES_KIND, recipient.kind, recipient.id) as {id:string}[]
  if (rows.length > 1) noticeRuleRefusal('More than one current notice rule record exists for this recipient. Repair the duplicate before changing or applying it.', 500)
  return rows.length === 0 ? null : getRecord(rows[0]!.id)!
}
/**
 * THE SAVED RULES THIS RELEASE CAN USE, AND THE SAVED RULES IT CANNOT, read from one record. A kind this
 * release does not have is named with its problem instead of failing the whole read, so the page keeps the
 * presses that replace it.
 */
export function theSavedRules(record: ReturnType<typeof ownNoticeRules>): { usable: NoticeKind[]; storedButNotUsed: { mutedKinds: unknown; batchedKinds?:unknown; problems: string[] } | null } {
  if (record === null) return { usable: [], storedButNotUsed: null }
  const stored = record.data['mutedKinds']
  if (!Array.isArray(stored)) return { usable: [], storedButNotUsed: { mutedKinds: stored, problems: ['The saved rules are not a list of notice kinds.'] } }
  const batches = record.data['batchedKinds'] ?? []
  const batchProblems = !Array.isArray(batches) ? ['The saved batch rules are not a list of notice kinds.'] : batches.filter(kind=>!isANoticeKind(kind)).map(kind=>`This release has no kind of batched notice called ${JSON.stringify(kind)}.`)
  const overlap = Array.isArray(batches) ? batches.filter(kind=>isANoticeKind(kind) && stored.includes(kind)).map(()=> 'A notice kind cannot be both muted and batched. Choose one delivery rule for each kind.') : []
  const unknown = stored.filter(kind => !isANoticeKind(kind))
  return {
    usable: stored.filter(isANoticeKind),
    storedButNotUsed: unknown.length === 0 && batchProblems.length === 0 && overlap.length === 0 ? null : { mutedKinds: stored, ...(batchProblems.length || overlap.length ? {batchedKinds:batches} : {}), problems: [...unknown.map(kind => `This release has no kind of notice called ${JSON.stringify(kind)}.`),...batchProblems,...overlap] },
  }
}
/**
 * A SECRETARY'S RULES BEFORE IT SAVES ANY: the automatic notices that ask it for no reply. They are held as a
 * saved rule holds them, so each stays in the message centre and is handed over with the next waking message.
 * A secretary that saves rules of its own has those instead, an empty list too. Nobody else has defaults.
 * Before 7 November 2026 a secretary had none either, and was woken for each of these.
 */
export const A_SECRETARYS_DEFAULT_MUTED_KINDS: readonly NoticeKind[] = [
  'groupOpened', 'memberAdded', 'memberLeft', 'theOverlapEnded',
  'claimsInConflict', 'territoriesInConflict', 'workAreasInConflict',
  'aChildSessionFinished', 'aRunWasSealed',
  'releasedAndTheStarterIsTold', 'releasedToOneThatReadsTheCheck',
  'aRunWasClosed', 'theCheckStarted', 'theCheckEnded', 'aCheckWasQueued', 'aCheckWaitsItsTurn',
  'aRunAnswered', 'aRunPickedUpItsConversation', 'theExpectedTimeHasArrived', 'anEntryWaitsForRoom', 'beforeTheSeal',
]
/** The kinds a recipient's rules hold while it has saved none: a secretary's list, or nothing. */
export function theDefaultMutedKinds(recipient: ParticipantRef): readonly NoticeKind[] {
  return recipient.kind === 'agent' && theRoleOnTheAgentRow(recipient.id).role === THE_SECRETARY ? A_SECRETARYS_DEFAULT_MUTED_KINDS : []
}
/**
 * The kinds a recipient's rules hold, the same list the rules door answers as `mutedKinds`: the saved ones, or
 * the defaults when nothing is saved. A saved kind this release does not have is left out. That changes nothing
 * that is held, because `whyPersonalNoticeRuleHolds` holds only a notice of a kind this release has. Saved rules
 * that are not a list hold nothing, so every notice is handed over. The rules page names both.
 */
export function mutedNoticeKinds(recipient: ParticipantRef): NoticeKind[] {
  return noticeKindsFor(recipient).muted
}
export function batchedNoticeKinds(recipient: ParticipantRef): NoticeKind[] {
  return noticeKindsFor(recipient).batched
}
/** Read both choices from the same saved rule once per recipient. */
export function noticeKindsFor(recipient: ParticipantRef): { muted: NoticeKind[]; batched: NoticeKind[] } {
  const record = ownNoticeRules(recipient)
  const muted = record === null ? [...theDefaultMutedKinds(recipient)] : theSavedRules(record).usable
  const stored = record?.data['batchedKinds']
  return { muted, batched: Array.isArray(stored) ? stored.filter(isANoticeKind).filter(kind => !muted.includes(kind)) : [] }
}
/** Personal rules apply only to authentic notices, never to ordinary messages carrying forged kinds. */
export function whyPersonalNoticeRuleHolds(sentBy: ParticipantRef | null, notice: unknown, muted: readonly NoticeKind[]): string | null {
  if (sentBy === null || !isANoticeKind(notice) || !muted.includes(notice) || (!isMoleOffice(sentBy) && !isAnInspector(sentBy))) return null
  return 'Your notice wake rule holds this notice. It stays in the message centre and is handed over with the next waking message.'
}
