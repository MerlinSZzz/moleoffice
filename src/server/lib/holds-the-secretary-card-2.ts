// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `holdsTheSecretaryCard` was moved byte for byte out of src/server/lib/grant/secretary-duties.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { A_ROW_WITH_NO_ROLE_READS_AS, mayBeElevated } from '@shared/roles.ts'
import type { RegisteredAgent } from './participants.ts'
import { theRoleCards } from './roles.ts'

/** Whether a registry row holds the secretary card, the one card a duties record may name. */
export function holdsTheSecretaryCard(row: RegisteredAgent): boolean {
  return mayBeElevated(theRoleCards(), row.role ?? A_ROW_WITH_NO_ROLE_READS_AS)
}
