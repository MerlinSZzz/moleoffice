// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `refuseARestoreThatGivesACardTwoWordRecords` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { storedAddedRow } from './added-roles.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { roleNameOf } from '../db/the-words-records-of-each-card.ts'
import { everyCard, refuseWordsThatTakeAnAddedCardOutOfUse } from './check-the-card-words.ts'
import { theWordsRecords } from './the-card-in-the-offices-words.ts'

/** A deleted words record comes back only while its card has no live one. */
export function refuseARestoreThatGivesACardTwoWordRecords(record: { id: string; data: unknown }): void {
  const name = roleNameOf(record.data)
  if (name === null) return
  // A removed added card's words went with it, and they come back only with the card.
  if (theRoleCardsAreRead() && !everyCard(theRoleCards()).some((card) => card.name === name) && storedAddedRow(name) === undefined) {
    throw new PanelError(
      `${record.id} cannot be restored, because the office holds no "${name}" card now. Put the card back on the Roles ` +
        `page, and its words come with it. Nothing was written.`,
      409,
    )
  }
  const other = theWordsRecords().get(name)
  if (other !== undefined && other.id !== record.id) {
    throw new PanelError(
      `${record.id} cannot be restored, because the "${name}" card's words are kept in ${other.id}. A card has one ` +
        `live words record. Delete ${other.id} first, and then restore ${record.id}. Nothing was written.`,
      409,
    )
  }
  refuseWordsThatTakeAnAddedCardOutOfUse(name, record.data as Readonly<Record<string, unknown>>)
}
