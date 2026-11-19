// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARKERS OF A GENERATED REGION, written in one place. tools/test-audit-table.mjs writes only between a pair of them,
 * and tools/merge-tool/generated-regions.mjs reads the same pairs to decide whether an entry's version of a generated
 * file may stand on the merge queue's bus. A region looks like this:
 *
 *     <!-- table:live-keep -->
 *     …everything here is written by the generator…
 *     <!-- end table:live-keep -->
 *
 * WHY THIS IS A MODULE OF ITS OWN. tools/test-audit-table.mjs runs as soon as it is loaded: it reads its arguments and
 * writes the document. So nothing can import the syntax from it, and a second spelling in the merge tool could drift
 * from the generator's with nothing failing. Both import it from here. It imports nothing.
 *
 * The marker text holds no character a regular expression treats as special, so a caller may build a pattern from it
 * by passing a group, such as `(${MARKED_KEY})`, as the key.
 */

/** The characters a region's name is made of, as a pattern. */
export const MARKED_KEY = '[a-z0-9:-]+'

/** The line that opens region `key`. */
export function startMarker(key) {
  return `<!-- table:${key} -->`
}

/** The line that closes region `key`. */
export function endMarker(key) {
  return `<!-- end table:${key} -->`
}
