// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Revoking a regulation is the person's act, or a secretary's carrying the person's written words
 * for that revocation on a change. A later decision extends the original rule.
 * The grant never revokes. An agent never files a regulation already revoked.
 *
 * This guard reads the arriving fields rather than the merged record, so an ordinary change to a
 * revoked regulation does not ask to revoke it again. Both create and patch ask it; only patch hands
 * over a record id, which opens the clause for words naming that record and its revocation.
 */

import { REGULATION_KIND } from '@shared/regulation.ts'
import { assertThePersonIsProved, theSecretaryActingForThePerson, type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'

/** One field of a record, read defensively: a record is stored as an unknown object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The two revocation fields. Named once so the guard and its message agree. */
const REVOCATION_FIELDS = ['revoked_at', 'revoked_because'] as const

/** A create stays the person's act; on a change, a secretary may carry words for this revocation. */
export function assertMayRevokeARegulation(opts: {
  kind: string
  /** What this write is sending — the create body, or the patch body, not the merged result. */
  arriving: unknown
  actor: Actor
  /** Present only on a change. An agent may not create an already-revoked regulation. */
  recordId?: string
}): void {
  if (opts.kind !== REGULATION_KIND) return
  const arriving = opts.arriving
  if (!isObject(arriving)) return

  const touched = REVOCATION_FIELDS.filter((field) => arriving[field] !== undefined)
  if (touched.length === 0) return

  const isStatedPerson = opts.actor.type === 'human' && opts.actor.stated !== false
  if (isStatedPerson) {
    // AND A STATED PERSON HAS TO HOLD THE PERSON'S KEY. Criterion P83, point 1.
    assertThePersonIsProved(opts.actor, 'Revoking a regulation')
    return
  }
  // A test world's authority stays inside that world's copy of the regulations.
  if (opts.actor.theOwnersAuthority?.holds === true) return

  const actor = opts.actor
  if (
    opts.recordId !== undefined &&
    actor.warrant !== undefined && actor.signedItem === undefined && actor.provedBy === 'an-agent-key' &&
    actor.warrant.for.includes(opts.recordId) && actor.warrant.for.includes(`regulation.revoke:${opts.recordId}`) &&
    theSecretaryActingForThePerson(actor)
  ) return

  throw new PanelError(
    `${touched.map((f) => `"${f}"`).join(' and ')} on a regulation ${touched.length === 1 ? 'is' : 'are'} written ` +
      `by the person, or on a change by a secretary using its own key and carrying the person's written words for ` +
      `that revocation. This write was refused and nothing was written. The grant never revokes a regulation. ` +
      `An agent that thinks a regulation should be revoked says so in a message or a report.`,
    403,
  )
}
