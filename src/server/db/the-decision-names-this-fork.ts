// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theDecisionNamesThisFork` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `isJsonObject` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * `aLinkFromTheDecisionToTheFork` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { SHORT_FORMS_FIELD as THE_SHORT_FORMS_KEY } from '@shared/zoom.ts'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from './client.ts'
import { keptStatement } from './kept-statement.ts'
import { links } from './schema.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'

/**
 * DOES THIS DECISION NAME THIS FORK? Asked by the settling door for a secretary, by the queue's reader, and by the
 * proposal page's list of decisions it may be closed by. One reading, so the three cannot disagree. A secretary's
 * confirmation of a goal asks it of the goal's id: nothing in it reads a fork's shape.
 *
 * YES WHEN THE DECISION SAYS SO ITSELF: the fork's id is in its title or in any text it stores, or a link runs from
 * the decision to the fork (any type but the settling one, which is the act being asked about). Both of the owner's
 * decisions a secretary was refused on, 3 October 2026, name their fork one of these ways.
 *
 * WHAT IT CANNOT TELL. An agent can write either kind of naming itself, so this guards against pointing a decision at
 * the wrong fork by mistake. It does not prove the decision answers the fork's question; the secretary card is what
 * the person trusted with that. The shorter forms are not read, because they are written about the record later.
 */
export function theDecisionNamesThisFork(
  decision: { id: string; title: string; data: unknown },
  proposalId: string,
): boolean {
  if (decision.title.includes(proposalId)) return true
  const stored = isJsonObject(decision.data) ? { ...decision.data } : {}
  delete stored[THE_SHORT_FORMS_KEY]
  if (JSON.stringify(stored).includes(proposalId)) return true
  return aLinkFromTheDecisionToTheFork().get({ decision: decision.id, fork: proposalId }) !== undefined
}
/**
 * A JSON object, as opposed to an array, a null or a scalar.
 *
 * The distinction is the whole merge rule: two objects are merged key by key, anything else
 * replaces what was there. See mergeData for why arrays are not merged.
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** A link from the decision to the fork of any type but the settling one. Kept, as `whoMadeTheLinkRow` is. */
export const aLinkFromTheDecisionToTheFork = keptStatement(() =>
  db
    .select({ id: links.id })
    .from(links)
    .where(
      and(
        eq(links.fromId, sql.placeholder('decision')),
        eq(links.toId, sql.placeholder('fork')),
        ne(links.type, RESOLVES_PROPOSAL),
      ),
    )
    .prepare(),
)
