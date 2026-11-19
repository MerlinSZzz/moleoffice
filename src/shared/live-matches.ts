// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `liveMatches` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/**
 * Of the records a title matched, the ones that are not deleted. The rule, stated once.
 *
 * ---------------------------------------------------------------------------------------
 * A TYPED NAME MEANS A CURRENT RECORD, AND THAT IS WHY THE FILTER IS HERE AND NOT AT EACH CALLER
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office never really deletes, so a deleted record keeps its title for ever. While titles were
 * unique that fact was invisible: one title, one row, live or deleted. Now that they may repeat it
 * is the ordinary case — delete a record, write it again under the same name, and the title matches
 * two rows the same afternoon. That is precisely the sequence the owner performed when they found
 * this defect, so it must not turn into a refusal.
 *
 * THE RULE: a name typed by a person or an agent is a belief about a record that is CURRENT. So
 * ambiguity is judged over the live rows only. One live row is the answer even when deleted rows
 * share the name. Several live rows is a refusal that names every one of them. No live row at all
 * is a different answer again, and each caller says it in its own words, because "nothing goes by
 * that name" and "the only thing that does is deleted" are fixed differently.
 *
 * This is NOT choosing between candidates. Choosing would be picking one of several live rows; the
 * deleted rows are not candidates for a name somebody is using now, and every caller that really
 * does want them — `getRecordByTitle`, which answers "is this name taken at all" — asks
 * `recordsByTitle` directly and does not come through here.
 */
export function liveMatches<T extends { deletedAt: string | null }>(matches: readonly T[]): T[] {
  return matches.filter((match) => match.deletedAt === null)
}
