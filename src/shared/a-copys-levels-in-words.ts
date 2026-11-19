// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A COPY'S TEXT SAYS ABOUT THE LEVELS ITS PARTS ARE DRAWN AT, in the words `server/lib/bundle.ts` writes
 * into the copy. They are held here, apart from that file, because it opens the database and a test that reads
 * a copy in a browser opens none (round 130).
 */
export const NO_LEVEL_WAS_MOVED =
  'How detailed: each part at the longest level its share of the size fits, and no level was moved'

/** The opening of the sentence under a level that some records have nothing written at. */
export const THOSE_RECORDS_HAVE_NOTHING_AT_THAT_LEVEL =
  'Those records have nothing written at that level, so each is drawn at the longest shorter level it has'

/** The opening of the sentence for parts that took more room than their share, at a level that was asked for. */
export function partsLongerThanTheirShare(count: number): string {
  return `${String(count)} part(s) are longer than their share of the size`
}
