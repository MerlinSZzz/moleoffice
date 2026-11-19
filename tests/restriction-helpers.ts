// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The restriction mark table, and the one comparison that says two marks are told apart.
 *
 * A HELPER RATHER THAN AN IMPORT AT EACH CALL SITE, because a test asserting on a drawing must read
 * the same table the drawing reads. Both are re-exported from `src/shared`; nothing here restates a
 * word or a channel.
 */
export { RESTRICTION_MARKS, restrictionMarkKey } from '../src/shared/restriction.ts'
import { RESTRICTION_MARKS, restrictionMarkKey } from '../src/shared/restriction.ts'
import { withoutHue } from '../src/shared/states.ts'

/** One `(severity, standing)` pair's mark with the colour gone. Empty when the table has no entry. */
export function withoutHueOfRestriction(severity: string, standing: string): string {
  const entry = RESTRICTION_MARKS[restrictionMarkKey(severity as never, standing)]
  return entry === undefined ? '' : withoutHue(entry.mark)
}
