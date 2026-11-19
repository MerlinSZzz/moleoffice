// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theDeadLetterActInWords` was moved byte for byte out of src/server/lib/deadletters.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { everyActNamed } from '@shared/roles.ts'
import { theRoleCards } from './roles.ts'
import { DEAD_LETTER_CLAIM_ACT } from './the-agents-who-claim-dead-letters.ts'

/** The act in the declaration's own words, for a refusal to read, or its key when it is not named. */
export function theDeadLetterActInWords(): string {
  return everyActNamed(theRoleCards()).get(DEAD_LETTER_CLAIM_ACT) ?? DEAD_LETTER_CLAIM_ACT
}
