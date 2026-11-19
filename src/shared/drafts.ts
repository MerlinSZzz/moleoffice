// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DRAFT: WRITING AN AGENT KEEPS IN THE OFFICE UNTIL IT IS SENT.
 *
 * A decision took six points about drafts as they were recommended (report yyp1STyC-zYV, block b-9), and point 3 of
 * another says why a draft exists at all: an agent views and edits it while it works, it is kept in Mole Office, and
 * sending stays the office's own. The six points, as built:
 *
 *   1. A draft is its own kind, and it can become a `message`, a `report` or a `note` (`becomes`).
 *   2. It stands alone, not inside a conversation, and it names whom it is for (`for`).
 *   3. The person's unsent chat text stays in the browser. Nothing here touches it.
 *   4. Who may read a draft: any caller in the project. No
 *      reader rule is wanted, by a decision that replaced this point's earlier "only its writer and the
 *      person". An agent reaches its own drafts easily through GET /api/drafts, and another
 *      agent's draft only by its id or a general list of records.
 *   5. A reminder comes after a time, one hour unless the draft says otherwise, and never sends it.
 *   6. A sent draft is kept, never deleted, and linked to what it became.
 *
 * This file holds the words and the one clock. The rules are in src/server/lib/drafts.ts.
 */

import type { ParticipantRef } from './participants.ts'
import { localStamp, parseAnyStamp } from './time.ts'
import { isATurnDraft } from './turn-drafts.ts'

/** The kind's stored name. */
export const DRAFT_KIND = 'draft' as const

/** What a draft may become when it is sent. Each is a kind the office already has. */
export const DRAFT_BECOMES = ['message', 'report', 'note'] as const
export type DraftBecomes = (typeof DRAFT_BECOMES)[number]

/** The minutes after the last change at which the reminder is due, when the draft names none. */
export const DEFAULT_REMIND_AFTER_MINUTES = 60

/** The two fields only the send door writes. */
export const SENT_AS = 'sentAs' as const
export const SENT_AT = 'sentAt' as const
export const WRITTEN_ONLY_BY_THE_SEND_DOOR = [SENT_AS, SENT_AT] as const

/**
 * WHO MAY READ A DRAFT, said wherever the list is described. The list shows a caller its own drafts;
 * that is what the list answers, and under a decision no rule limits who may read one.
 */
export const WHO_MAY_READ_A_DRAFT =
  'This list shows your own drafts. Any caller in this project can read a draft by its id or in a general list ' +
  'of records: no rule limits who may read one.'

/** The send door, as a caller writes it. */
export const THE_SEND_DOOR = 'POST /api/drafts/<id>/send'

/** The refusal of a write that sets `sentAs` or `sentAt` by hand. */
export const ONLY_THE_SEND_DOOR_WRITES_SENT =
  `Only the send door writes sentAs and sentAt on a draft, when it sends it (${THE_SEND_DOOR}). ` +
  'Nothing was written.'

/** The refusal of any change to a draft that has been sent. */
export function aSentDraftStandsAsItWasSent(draftId: string, sentAs: string): string {
  return (
    `Draft ${draftId} was sent as record ${sentAs}, and a sent draft stays exactly as it was sent. It cannot be ` +
    'changed, deleted, moved or turned into another kind. Nothing was written. Change the record it became instead.'
  )
}

/** What the stored `sentAs` holds, or null because the draft has not been sent. */
export function sentAsOf(data: unknown): string | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const held = (data as Record<string, unknown>)[SENT_AS]
  return typeof held === 'string' && held !== '' ? held : null
}

/** What the stored `sentAt` holds, or null because the draft has not been sent. */
export function sentAtOf(data: unknown): string | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const held = (data as Record<string, unknown>)[SENT_AT]
  return typeof held === 'string' && held !== '' ? held : null
}

/** The minutes the draft asks to wait, or the default when it names none. */
export function remindAfterMinutesOf(data: unknown): number {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return DEFAULT_REMIND_AFTER_MINUTES
  const held = (data as Record<string, unknown>)['remindAfterMinutes']
  return typeof held === 'number' && Number.isInteger(held) && held > 0 ? held : DEFAULT_REMIND_AFTER_MINUTES
}

/** Who the draft is for, as stored. An empty list when it names nobody. */
export function draftForOf(data: unknown): ParticipantRef[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []
  const held = (data as Record<string, unknown>)['for']
  return Array.isArray(held) ? (held as ParticipantRef[]) : []
}

/**
 * WHEN A DRAFT'S REMINDER IS DUE, from when it was last changed. The one clock: the list door and the
 * reminder tick both read it, so the time the list shows is the time the tick uses.
 *
 * Null when the last change cannot be read as a time, because a guessed due time is worse than none. Null for a turn
 * draft too: Mole Office sends it by itself (src/server/lib/turn-drafts.ts), so no reminder is due.
 */
export function whenTheReminderIsDue(lastChangedAt: string, data: unknown): { at: string; ms: number } | null {
  if (isATurnDraft(data)) return null
  const changed = parseAnyStamp(lastChangedAt)
  if (changed === null) return null
  const ms = changed.getTime() + remindAfterMinutesOf(data) * 60_000
  return { at: localStamp(new Date(ms)), ms }
}
