// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE CEILING FOR THE CHECK'S TOOL AND ITS PROMPT DOOR, including couldNotCarry.
 * zZXY9HqyGuj2: wave 13n's round-28 fix carried 101 records and hit the old
 * ceiling. The body limit is 8 MiB. The tool sends only {path, id, kind, title, as}
 * per record; the whole record is JSON in a local file. At 1 KiB per descriptor,
 * this ceiling uses about 0.5 MiB, leaving room for the diff and omitted names,
 * and matches the body's other lists. The byte limit still guards larger metadata
 * and diffs. USER.md invariant 2 requires omissions to be named or assembly to
 * fail loudly, never to silently change what the check can read.
 */
export const THE_MOST_RECORDS_A_CHECK_CARRIES = 500

/** Decisions get their own allocation within the shared records ceiling. */
export const THE_MOST_DECISIONS_A_CHECK_CARRIES = 80
