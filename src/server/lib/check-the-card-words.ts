// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `checkTheCardWords` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * `everyCard` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * `refuseWordsThatTakeAnAddedCardOutOfUse` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { storedAddedRow, problemsWordsWouldGiveAnAddedCard } from './added-roles.ts'
import { theRoleCards, theRoleCardsAreRead } from './roles.ts'
import { roleNameOf } from '../db/the-words-records-of-each-card.ts'
import { theWordsRecords } from './the-card-in-the-offices-words.ts'
import type { RoleCard, RolesDeclaration } from '@shared/roles.ts'

/**
 * A CARD'S WORDS RECORD NAMES A DECLARED CARD, AND IT IS THE ONLY LIVE ONE FOR THAT CARD. Called on
 * the create and on the patch (src/server/lib/records.ts), because a rule enforced on one write path
 * is not a rule. `mine` is the record being written, or null on a create, so a record does not refuse
 * itself as its own second copy.
 */
export function checkTheCardWords(data: unknown, mine: string | null): void {
  const name = roleNameOf(data)
  if (name === null) return
  if (theRoleCardsAreRead()) {
    const declared = everyCard(theRoleCards()).map((card) => card.name)
    // An added card this release leaves out is still the office's card while its row is kept.
    if (!declared.includes(name) && storedAddedRow(name) === undefined) {
      throw new PanelError(
        `There is no "${name}" card, so there are no words of it to keep. Nothing was written. The cards are ` +
          `${declared.map((one) => `"${one}"`).join(', ')}; GET /api/roles lists them.`,
        400,
      )
    }
  }
  const other = theWordsRecords().get(name)
  if (other !== undefined && other.id !== mine) {
    throw new PanelError(
      `The "${name}" card's words are already kept in ${other.id}. Nothing was written. A second record would be ` +
        `two accounts of one card's words with nothing saying which one is shown. Change ${other.id} instead.`,
      409,
    )
  }
  refuseWordsThatTakeAnAddedCardOutOfUse(name, data as Readonly<Record<string, unknown>>)
}
/** Every declared card, an agent's and a person's, in the declaration's order. */
export function everyCard(cards: RolesDeclaration): RoleCard[] {
  return [...cards.cards, ...cards.personCards]
}
export function refuseWordsThatTakeAnAddedCardOutOfUse(name: string, data: Readonly<Record<string, unknown>>): void {
  const broken = problemsWordsWouldGiveAnAddedCard(name, data)
  if (broken.length === 0) return
  throw new PanelError(
    `These words would take the "${name}" card out of use. It was added on the Roles page, so this record holds its only ` +
      `words: ${broken.join(' ')} Nothing was written.`,
    400,
  )
}
