// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GRANTS THE PERSON HAS MADE TO ONE AGENT, READ BACK.
 * `readElevations` and `readElevation` were moved byte for byte out of src/server/lib/elevation.ts, with no
 * change of behaviour. That file imports them back and re-exports them.
 */

import type { Elevation } from '@shared/roles.ts'

/**
 * EVERY GRANT THE PERSON HAS EVER MADE TO ONE AGENT, oldest first, read from the column that holds them as
 * JSON or from the record field that holds them as objects. Empty where they never have.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A LIST AND NOT ONE OBJECT, WHICH IS A THING THE MERGE DECIDED
 * ---------------------------------------------------------------------------------------
 *
 * It was one object, and re-granting after an end was broken: `mergeData` walks INTO a nested object
 * when the stored value and the incoming one are both objects, so a fresh grant merged onto an ended
 * one kept the old `endedAt` and read as ended the moment it was made. A nested null cannot clear it
 * either — the record validator refuses a null on a typed field before the merge could delete the
 * key. An ARRAY is replaced wholesale by that same merge, because it walks only into plain objects.
 *
 * So the field is the list, the last entry is the one that counts, and the ones before it are the
 * grants they made and ended. That is a better answer than the object was and not only a way round the
 * merge: what an agent could do last week is a question the card can now answer.
 *
 * ONE READER FOR THE RECORD AND FOR THE ROW, because the two are the same fact in two places by
 * design — the record is the source and the row follows — and two readers is how they would come to
 * disagree. It fills absent keys back in as null, which is what lets
 * `keepTheAgentRegistryInStep` compare like with like: the record stores no null keys.
 */
export function readElevations(value: unknown): Elevation[] {
  let parsed: unknown = value
  if (typeof value === 'string') {
    if (value.trim() === '') return []
    try {
      parsed = JSON.parse(value)
    } catch {
      // A COLUMN THIS BUILD CANNOT READ IS NOT AN ELEVATION. Reading it as one would be inventing a
      // permission out of a parse failure, which is the worst direction for this particular field.
      return []
    }
  }
  // A LONE OBJECT IS READ AS A LIST OF ONE. Nothing in this installation stored one — the field
  // arrived as a list — and reading it costs a line and refuses nothing.
  const many = Array.isArray(parsed) ? parsed : [parsed]
  const out: Elevation[] = []
  for (const each of many) {
    if (typeof each !== 'object' || each === null) continue
    const one = each as Record<string, unknown>
    if (typeof one['id'] !== 'string' || typeof one['endsWhen'] !== 'string') continue
    out.push({
      id: one['id'],
      endsWhen: one['endsWhen'],
      until: typeof one['until'] === 'string' ? one['until'] : null,
      grantedAt: typeof one['grantedAt'] === 'string' ? one['grantedAt'] : '',
      grantedBy: typeof one['grantedBy'] === 'string' ? one['grantedBy'] : '',
      endedAt: typeof one['endedAt'] === 'string' ? one['endedAt'] : null,
      endedBecause: typeof one['endedBecause'] === 'string' ? one['endedBecause'] : null,
      reason: typeof one['reason'] === 'string' ? one['reason'] : null,
      run: typeof one['run'] === 'string' ? one['run'] : null,
    })
  }
  return out
}

/** The grant that counts: the last one the person made, or null because they never made one. */
export function readElevation(value: unknown): Elevation | null {
  const many = readElevations(value)
  return many[many.length - 1] ?? null
}
