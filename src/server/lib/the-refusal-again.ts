// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRefusalAgain` was moved byte for byte out of src/server/lib/the-seal-read-apart.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import type { ARefusalCarried } from './the-seal-read-apart-thread.ts'

/** The PanelError `verifyRunSeal` or a finish's read threw on the thread, made again with every field it carried. */
export function theRefusalAgain(carried: ARefusalCarried): PanelError {
  const again = new PanelError(carried.message, carried.status, carried.detail, carried.elsewhere, carried.reason, carried.refusal)
  if (carried.recorded !== undefined) again.recorded = carried.recorded
  return again
}
