// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS UNDER A RECORD, IN ONE READER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ANSWERS AND WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Three positions of the detail ladder are about a record's CHILDREN rather than about the record:
 * rung 4, the outline, is one line per child; rung 5, the sketch, is each child in about thirty
 * words; and rung 6, the digest, is each child in about a hundred and twenty.
 * `src/shared/detail.ts` answers all three for a REPORT, because a report's children are the parts
 * somebody wrote for it and they are stored on the record itself.
 *
 * A module and a pipeline have children too, and they are not stored on the record. By a decision
 * , a module can be made of modules, and a pipeline likewise. This is the
 * reader that answers what those are.
 *
 * ---------------------------------------------------------------------------------------
 * THREE RULES, AND WHICH ONE APPLIES IS DECIDED BY THE KIND
 * ---------------------------------------------------------------------------------------
 *
 *   a REPORT       its written parts, in the order they are drawn. `readStoredParts` reads them.
 *   a PIPELINE     the blocks in its own stored order, through `readOnePipelinesBlocks` — the same
 *                  reader the pipeline page uses, so this and that page cannot disagree.
 *   anything else  the records that say they are `part_of` it.
 *
 * A RECORD WITH NONE IS ATOMIC AND HAS NO MIDDLE RUNG: there is no level 4 to 6 for it. An atomic
 * module, one with nothing under it, is drawn at level 2 or at the Conclusion and never in between.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A CHILD IS A TITLE, A CONCLUSION AND A LONGER TEXT, AND NOTHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Rungs 4, 5 and 6 draw a child's title, then its conclusion, then its longer text. The first two
 * are rungs 2 and 3 of the child's own ladder, which is what makes this one model rather than two:
 * a child is drawn with the same two things any record is drawn with at those positions. Nothing
 * here summarises anything. Where a child has no conclusion written, the copy says so rather than
 * inventing one.
 *
 * ONLY A REPORT'S PART HAS THE THIRD, and that is criterion B32 rather than an omission. The
 * 120-word text of a part is written by hand through the short-forms route; a module's child and a
 * pipeline's block have no such text anywhere, so `atLength` is null for them and a copy of that
 * record has no rung 6 at all. A rung nobody wrote is never the one below dressed as a higher level.
 */
import { readStoredParts, SHORT_FORMS_FIELD } from '@shared/zoom.ts'
import type { PanelRecord } from '@shared/types.ts'
import { blockLinkRowsIn, readOnePipelinesBlocks } from './blocks.ts'
import type { BlockLinkRow } from '@shared/blocks.ts'
import { resolveLinks } from './records.ts'

/**
 * ONE CHILD OF A RECORD, at the three lengths the ladder draws it.
 *
 * `conclusion` AND `atLength` ARE NULL WHEN NOBODY WROTE ONE. Not an empty string, and never a cut
 * of the line above: a level nobody wrote is a real answer here as everywhere else in this product.
 */
export interface AChild {
  /** The child record's id, or null when the child is not a record — a report's part is not one. */
  recordId: string | null
  /**
   * THE CHILD RECORD'S KIND, as stored. Null exactly when `recordId` is.
   *
   * It is here because a child drawn in a copy is a reference, and their four words are kind, id,
   * title and what it means here. Rungs 4 and 5 printed the title alone, which named a record the
   * reader could not go and find. Criterion B18 of design/bundle/ACCEPTANCE.md.
   */
  kind: string | null
  /** Rung 2 of the child: its title, or a report part's one-sentence heading. */
  title: string
  /** Rung 3 of the child: its conclusion, or null when nobody wrote one. */
  conclusion: string | null
  /**
   * THE CHILD AT ABOUT A HUNDRED AND TWENTY WORDS, which is what rung 6 draws, or null.
   *
   * Only a report's part has one, because only a report's part is written at three lengths by hand.
   * Null everywhere else, and that is the answer rather than a gap: the record has no rung 6 and a
   * copy of it stops at rung 5. Criterion B32.
   */
  atLength: string | null
}

/**
 * WHAT IS UNDER THIS RECORD. An empty list means it is atomic, which is a real answer.
 *
 * `links` is the whole project's block links, taken once by the caller when it has many records to
 * ask about; a caller with one record may leave it out and this reads them.
 */
export function childrenOf(
  record: PanelRecord,
  workspaceId: string,
  links?: readonly BlockLinkRow[],
): readonly AChild[] {
  if (record.kind === 'report') return partsOfAReport(record)
  if (record.kind === 'pipeline') return blocksOfAPipeline(record, workspaceId, links)
  return whatSaysItIsPartOfThis(record)
}

/**
 * A REPORT'S PARTS, in the order they are drawn.
 *
 * A PART IS NOT A RECORD, so it carries no id. `heading` is the part's one-sentence summary — its
 * rung 4 — `text30` is the thirty words drawn under it at rung 5, and `text120` is the hundred and
 * twenty drawn at rung 6. Those are the three the ladder names, read from the same declaration the
 * report page reads. A report is the only kind whose children have all three.
 */
function partsOfAReport(record: PanelRecord): readonly AChild[] {
  // THE PARTS ARE UNDER `data.shortForms`, AND THIS READ THEM FROM `data` ITSELF.
  //
  // Measured 8 September 2026 while building criterion B32: `readStoredParts` looks for a key called
  // `parts` in whatever it is handed, so handing it the whole of `data` looked for `data.parts`,
  // which nothing writes. Every other caller in the product hands it `data.shortForms` — see
  // `readShortForms` in ./zoom.ts and `reportrungs.ts`. So a report's own written parts were never
  // found here, and every report in every copy has been drawn as if it were atomic since rungs 4 and
  // 5 were built. Problem filed with this measurement.
  const stored = readStoredParts((record.data as Record<string, unknown>)[SHORT_FORMS_FIELD])
  if (stored === null) return []
  return stored.parts.map((part) => ({
    recordId: null,
    // A PART OF A REPORT IS NOT A RECORD, so it has no kind either. Null and null together are what
    // says *this is not something you can go and open*, and printing a kind here would suggest it is.
    kind: null,
    title: part.heading,
    conclusion: part.text30.trim() === '' ? null : part.text30,
    atLength: part.text120.trim() === '' ? null : part.text120,
  }))
}

/** A PIPELINE'S BLOCKS, in its own stored order, through the reader the pipeline page uses. */
function blocksOfAPipeline(
  record: PanelRecord,
  workspaceId: string,
  links?: readonly BlockLinkRow[],
): readonly AChild[] {
  const rows = links ?? blockLinkRowsIn(workspaceId)
  const reading = readOnePipelinesBlocks(record, workspaceId, rows)
  return reading.blocks.map((block) => ({
    recordId: block.id,
    kind: 'block',
    title: block.name,
    // A BLOCK'S CONCLUSION IS WHAT WAS MEASURED ON IT, which is the one line a block carries about
    // what it came to. Null where nothing has been measured, which is most of them.
    conclusion: block.measured,
    // NOBODY WRITES A BLOCK AT A HUNDRED AND TWENTY WORDS, so there is no rung 6 here to draw.
    atLength: null,
  }))
}

/**
 * THE RECORDS THAT SAY THEY ARE PART OF THIS ONE.
 *
 * IT READS THE LINK IN ONE DIRECTION ONLY. `part_of` is stored from the part to the whole, so the
 * children of X are the BACKLINKS of that type on X. Reading it both ways would make a module a
 * child of its own child.
 */
function whatSaysItIsPartOfThis(record: PanelRecord): readonly AChild[] {
  return resolveLinks(record.id)
    .filter((link) => link.type === 'part_of' && link.isBacklink && !link.broken)
    .map((link) => ({
      recordId: link.other.id,
      kind: link.other.kind,
      title: link.other.title,
      conclusion:
        link.other.summary === null || link.other.summary === '' ? null : link.other.summary,
      // A CHILD RECORD IS NOT WRITTEN AT A HUNDRED AND TWENTY WORDS ANYWHERE, so its parent has no
      // rung 6. Reaching for the child's own body here would be the record itself dressed as a
      // written level, which is the thing criterion B32 forbids.
      atLength: null,
    }))
}
