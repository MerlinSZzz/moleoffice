// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ASKER WITHDRAWS ITS OWN REQUEST TO THE PERSON, AND THE WITHDRAWAL STAYS IN SIGHT. Decision tFl1YWLH3eCl.
 *
 * A role request that waits for the person cannot be deleted by anybody but the person (problem dfwh9AKntOs5) and cannot be
 * answered past them (check nktwJZR4jbWM). Its asker may still take it back while the person has not answered it. The request
 * is kept: its answer becomes `withdrawn`, and `extra.withdrawn` says when, which agent withdrew it and as what. Who
 * pressed is also on the revision the withdrawal writes.
 *
 * WHO MAY WITHDRAW: the asker, or the asker's registered starter, each proving itself with its OWN key. A header that
 * only names one proves nothing. An asker nobody registered, such as a waiting self-registration, has no key to prove
 * itself with, so only its registered starter may withdraw its request.
 *
 * A NEW-KEY ASK IS NOT WITHDRAWN HERE. Its grant is withdrawn by its own rule in lib/newkey.ts.
 */

import { sqlite } from '../db/client.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { type RegisteredAgent } from './participants.ts'
import { readParticipant } from '../db/read-participant.ts'
import type { PanelRecord } from '@shared/types.ts'
import { asTheRoleRequestDoor, patchRecord, type Actor } from './records.ts'
import { now } from '@shared/now.ts'
import { PanelError } from './panel-error.ts'

/** The answer a withdrawn request carries. The same word a withdrawn new-key grant carries. */
export const A_WITHDRAWN_REQUEST = 'withdrawn'

/** How long the person's list shows a withdrawn request after the withdrawal: 7 days (decision tFl1YWLH3eCl). */
export const A_WITHDRAWAL_IS_LISTED_FOR_DAYS = 7

/** Who withdrew a request, as the request says it. */
export type WithdrawnAs = 'the-asker' | 'its-starter'

export interface AWithdrawal {
  at: string
  /** The registry id of the agent that withdrew it. */
  by: string
  as: WithdrawnAs
}

/** What `extra.withdrawn` on a request says, or null because it says nothing a reader can trust. */
export function theWithdrawalOf(record: PanelRecord): AWithdrawal | null {
  if (record.data['answer'] !== A_WITHDRAWN_REQUEST) return null
  const extra = record.data['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return null
  const said = (extra as Record<string, unknown>)['withdrawn']
  if (typeof said !== 'object' || said === null || Array.isArray(said)) return null
  const { at, by, as } = said as Record<string, unknown>
  if (typeof at !== 'string' || typeof by !== 'string' || (as !== 'the-asker' && as !== 'its-starter')) return null
  return { at, by, as }
}

/** The registered agent a stored asker reference names, or null where no one agent answers it. */
function theRegisteredAsker(request: PanelRecord): RegisteredAgent | null {
  const asker = request.data['asker'] as { kind?: unknown; id?: unknown } | undefined
  if (asker?.kind !== 'agent' || typeof asker.id !== 'string') return null
  const one = theOneAgentAStringNames(sqlite, asker.id)
  if (one === null) return null
  return readParticipant({ kind: 'agent', id: one.id }) as RegisteredAgent | null
}

/**
 * WITHDRAW AN UNANSWERED REQUEST TO THE PERSON. Everything is checked before anything is written, and each refusal says
 * what was refused and that nothing was written.
 */
export function withdrawARequestToThePerson(input: { request: PanelRecord; actor: Actor }): Record<string, unknown> {
  const { request, actor } = input
  const answersTo = request.data['answersTo'] as { kind?: unknown } | undefined
  if (answersTo?.kind !== 'person') {
    throw new PanelError(
      `Request ${request.id} does not wait for the person, so it is not withdrawn here. Its asker asks the agent it ` +
        'waits for instead. Nothing was written.',
      409,
    )
  }
  const answer = request.data['answer']
  if (typeof answer === 'string' && answer !== '') {
    throw new PanelError(
      `Request ${request.id} was already ${answer}, so it cannot be withdrawn: a request the person has answered ` +
        'stays answered. Nothing was written.',
      409,
    )
  }
  const asker = theRegisteredAsker(request)
  const starterId = asker?.startedBy?.kind === 'agent' ? theOneAgentAStringNames(sqlite, asker.startedBy.id)?.id ?? null : null
  const holder =
    actor.provedBy === 'an-agent-key' && actor.keyHolder !== undefined ? theOneAgentAStringNames(sqlite, actor.keyHolder) : null
  const as: WithdrawnAs | null =
    holder === null || asker === null ? null : holder.id === asker.id ? 'the-asker' : holder.id === starterId ? 'its-starter' : null
  if (as === null || holder === null) {
    const who =
      asker === null
        ? 'Its asker is not a registered agent, so no key can prove it is the asker, and only the person may answer it.'
        : `Only "${asker.handle}", which asked, or the agent registered as its starter may withdraw it, each sending ` +
          'its own key. This request was neither.'
    throw new PanelError(`Request ${request.id} waits for the person. ${who} Nothing was written.`, 403)
  }
  const at = now()
  asTheRoleRequestDoor(() =>
    patchRecord(request.id, { dataPatch: { answer: A_WITHDRAWN_REQUEST, extra: { withdrawn: { at, by: holder.id, as } } } }, actor),
  )
  return {
    request: request.id,
    answer: A_WITHDRAWN_REQUEST,
    withdrawnAt: at,
    withdrawnBy: holder.handle,
    withdrawnAs: as,
    note:
      `Request ${request.id} is withdrawn. It is kept, and the person's Needs you list shows it as withdrawn, with who ` +
      `withdrew it and when, for ${A_WITHDRAWAL_IS_LISTED_FOR_DAYS} days.`,
  }
}
