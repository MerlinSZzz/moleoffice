// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MIDDLE VALUE OF A LIST OF NUMBERS: THE ONE DEFINITION THE USAGE READS AND THE TEST CATCHES SHARE.
 *
 * It was written in src/server/lib/usage-reads.ts, which opens the database. Wave 13n round C moved it
 * here, with no change, so the door that reads the named test rows and the weekly tool that reads the
 * merge queue's seconds take their medians by the same rule as the usage page.
 */

/** The middle value, or null for nothing at all. It is worked out by `medianOfCounts`. */
export function medianOf(values: readonly number[]): number | null {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return medianOfCounts(counts)
}

/**
 * THE MIDDLE VALUE OF A LIST GIVEN AS HOW MANY TIMES EACH VALUE OCCURS, or null for nothing at all.
 *
 * It is the middle of the list written out in order: the one middle value when the list is odd, and
 * the mean of the two middle values when it is even. Given as counts because a grouped query can
 * hand back one row per value instead of one row per call. Written once because every median of the
 * usage reads comes through it: `medianOf`, the SQL aggregate `usage_median`, and the reply sizes in
 * `patternReadings` (src/server/lib/usage-reads.ts).
 */
export function medianOfCounts(counts: ReadonlyMap<number, number>): number | null {
  let total = 0
  for (const n of counts.values()) total += n
  if (total === 0) return null
  // The positions of the two middle values in the written-out list, counted from zero. They are the
  // same position when the list is odd.
  const low = Math.floor((total - 1) / 2)
  const high = Math.floor(total / 2)
  const values = Float64Array.from(counts.keys()).sort()
  let seen = 0
  let lowValue: number | null = null
  for (const value of values) {
    seen += counts.get(value)!
    if (lowValue === null && seen > low) lowValue = value
    if (seen > high) return low === high ? value : (lowValue! + value) / 2
  }
  throw new Error('medianOfCounts walked every value without reaching the middle; a count was not a whole number above zero')
}
