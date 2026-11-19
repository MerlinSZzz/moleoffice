// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LONGEST PROSE ONE BLOCK OF A REPORT OR A SUMMARY MAY HOLD, AND THE SENTENCE THAT TELLS A WRITER.
 *
 * Problem jQayki_gIciU: a block over this was refused only when the report was written, so an agent
 * learned the limit by losing a write. The refusal in src/server/lib/summary.ts, the report kind's
 * `blocks` description in src/shared/kinds.ts and the note on POST /api/records in
 * src/server/api/kinds.ts all read this one constant, so the limit a writer is told before the write
 * is the limit the write is refused by.
 *
 * The reason for the cap itself is in summary.ts above its siblings: about a page of writing, a
 * design statement rather than a technical one.
 */
export const MAX_PROSE = 4000

/** One sentence for a writer, read before the write. */
export const THE_PROSE_CAP_SENTENCE =
  `ONE BLOCK'S PROSE IS AT MOST ${MAX_PROSE.toLocaleString('en-GB')} CHARACTERS: a text block's text, its Chinese ` +
  `text, a caption, a detail, a note, a list item, a code block's code, a picture's alt. A block over that is refused with a 400 ` +
  `naming the field and how many characters over it is, and nothing is stored. Split longer writing into ` +
  `more blocks, or put a file in a file block.`
