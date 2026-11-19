// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theCardTheRoleIs` was moved byte for byte out of src/server/lib/participants.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { A_ROW_WITH_NO_ROLE_READS_AS } from '@shared/roles.ts'

/**
 * THE CARD AN AGENT WHOSE ROW WAS READ HOLDS: the role on it, or the worker's where it names none. `theCardOfAgent`
 * answers this for a row it found by the id; the people view asks it of every registry row it read at once (wave 13y
 * round 50), where it read each agent's row again by its id.
 */
export function theCardTheRoleIs(role: string | null): string {
  return role ?? A_ROW_WITH_NO_ROLE_READS_AS
}
