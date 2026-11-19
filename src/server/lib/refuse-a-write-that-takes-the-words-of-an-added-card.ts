// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `refuseAWriteThatTakesTheWordsOfAnAddedCard` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { problemsWordsWouldGiveAnAddedCard } from './added-roles.ts'
import { roleNameOf } from '../db/the-words-records-of-each-card.ts'

/**
 * A WRITE THAT TAKES A RECORD AWAY FROM AN ADDED CARD IN USE IS REFUSED: a delete, a patch that names
 * another card, or one that makes it another kind. `after` is what the record holds after the write,
 * or null when it is no longer a words record. The Roles page removes the card and its words together.
 */
export function refuseAWriteThatTakesTheWordsOfAnAddedCard(record: { id: string; data: unknown }, after: unknown): void {
  const name = roleNameOf(record.data)
  if (name === null || (after !== null && roleNameOf(after) === name) || problemsWordsWouldGiveAnAddedCard(name, null).length === 0) return
  throw new PanelError(
    `${record.id} holds the only words of the "${name}" card, which was added on the Roles page, so it stays that card's ` +
      `record. Remove the card on the Roles page, and its words go with it. Nothing was written.`,
    409,
  )
}
