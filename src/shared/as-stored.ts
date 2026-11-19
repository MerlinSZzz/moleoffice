// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `asStored` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { Elevation } from '@shared/roles.ts'

/**
 * THE GRANTS AS THE RECORD STORES THEM: the same objects with their empty keys left out.
 *
 * The record validator refuses a null — *leave the key out entirely rather than sending null* — and
 * it is right to: an absent key and a null are the same fact told twice. `readElevation` fills them
 * back in, so nothing downstream has to know which of the two it is reading.
 */
export function asStored(many: readonly Elevation[]): Record<string, unknown>[] {
  return many.map((one) => {
    const out: Record<string, unknown> = {
      id: one.id,
      endsWhen: one.endsWhen,
      grantedAt: one.grantedAt,
      grantedBy: one.grantedBy,
    }
    if (one.until !== null) out['until'] = one.until
    if (one.endedAt !== null) out['endedAt'] = one.endedAt
    if (one.endedBecause !== null) out['endedBecause'] = one.endedBecause
    if (one.reason !== null) out['reason'] = one.reason
    if (one.run !== null) out['run'] = one.run
    return out
  })
}
