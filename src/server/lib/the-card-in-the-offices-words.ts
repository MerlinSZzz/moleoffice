// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theCardInTheOfficesWords` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * `theWordsRecords` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theCardInTheseWords, type RoleCard } from '@shared/roles.ts'
import type { TheWordsRecord } from './card-words.ts'
import { PanelError } from './panel-error.ts'
import { theWordsRecordsOfEachCard } from '../db/the-words-records-of-each-card.ts'

/**
 * One card in the words this office holds for it, with every other part as declared. `held` is the
 * records already read, for a caller showing every card from one reading.
 */
export function theCardInTheOfficesWords<T extends RoleCard>(
  card: T,
  held: ReadonlyMap<string, TheWordsRecord> = theWordsRecords(),
): T {
  return theCardInTheseWords(card, held.get(card.name)?.data ?? null)
}
/**
 * EACH CARD'S LIVE WORDS RECORD, by the card's name. Read live on every call, so a change on the
 * record's page is what the next reader shows. Refuses with 409, naming both, where one card has two.
 */
export function theWordsRecords(): ReadonlyMap<string, TheWordsRecord> {
  const out = new Map<string, TheWordsRecord>()
  for (const [name, held] of theWordsRecordsOfEachCard()) {
    const [one, other] = held
    // A PanelError, so the reply says this rather than "internal error".
    if (other !== undefined) {
      throw new PanelError(
        `The "${name}" card has two live words records, ${one!.id} and ${other.id}, and the office cannot tell which ` +
          `one to show. Delete one of them. Nothing was read.`,
        409,
      )
    }
    out.set(name, one!)
  }
  return out
}
