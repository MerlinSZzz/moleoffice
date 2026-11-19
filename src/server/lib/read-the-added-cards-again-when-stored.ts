// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `readTheAddedCardsAgainWhenStored` was moved byte for byte out of src/server/lib/card-words.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { whenStored } from '../db/told-when-stored.ts'
import { loadAddedRoles } from './added-roles.ts'
import { theRoleCardsAreRead } from './roles.ts'

/** Once a write to a words record is stored, read the added cards again, so each is the card its record now says. */
export function readTheAddedCardsAgainWhenStored(): void {
  whenStored(() => {
    if (theRoleCardsAreRead()) loadAddedRoles()
  })
}
