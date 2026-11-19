// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DRAWING SAYS ABOUT ITSELF ON THE ELEMENT IT DREW, AND THE ONE READER OF EACH ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS FILE EXISTS TO REMOVE, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * One attribute carried two vocabularies and its reader accepted one of them.
 *
 *   `data-rung` on a report      `label` `title` `gist` `card` `brief` `account` `full` — the reading
 *                                ladder in src/shared/detail.ts, which is what `View.detail` stores.
 *   `data-rung` on a graph card  `R0` … `R8` — the nine card positions in
 *                                src/web/components/graph/card.ts, which nothing stores.
 *
 * `theViewThisWasWrittenIn` walks up from the thing a comment is being filed against and reads the
 * nearest `data-rung`. Measured on 30 August 2026 at commit `3bf359f`, on `#/pipeline/q9ILnZPACd95`:
 * twenty elements carried `data-rung="R4"` and every one of them could be right-clicked. The reader
 * cannot place `R4`, so it answered "no view", which is the same answer it gives for a row of the
 * rail — and the comment was stored with no record of which drawing it was written on, silently,
 * because absence is not an error. `design/problem-03/baseline/rung-vocabulary.json` holds the
 * count.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIX: TWO NAMES, TWO LISTS, AND A WORD FROM THE WRONG LIST IS A DEFECT SOMEBODY HEARS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * A card writes `data-card-rung` and a report writes `data-rung`. Neither element can now be read
 * as the other, so the reader's `undefined` on a graph card means what it says: nothing above this
 * was drawn at a reading length, because that surface has none. That is the fifth invariant —
 * *nobody looked* is not *nothing is there* — in the one field whose purpose is to keep them apart.
 *
 * NOTHING READS `data-card-rung` YET AND THAT IS SAID HERE RATHER THAN LEFT TO BE FOUND. A card
 * position has nowhere to be stored: `View.detail` is required and is the reading ladder, and
 * `Seen` is refused for a target that names a record. So splitting the attribute makes the silence
 * honest; it does not yet make the card position recorded, and `design/problem-03/ACCEPTANCE.md`
 * §C2.4 asks for both. The half that is missing is written down in the step's report rather than
 * implied by a reader with no caller.
 */

import { isRung, type Rung } from '@shared/detail.ts'
import { isDrawingWord, type DrawingWord, type DrawnOn } from '@shared/targets.ts'

/**
 * THE ATTRIBUTE A REPORT'S DRAWING WRITES THE READING LENGTH ONTO.
 *
 * Named once, here, and used by the component that writes it, the stylesheet that selects on it and
 * the reader that reads it back. It used to be spelled in all three, so a rename would have left a
 * stylesheet matching nothing and every stored comment carrying no view, with nothing failing.
 */
export const READING_LENGTH_ATTRIBUTE = 'data-rung'

/**
 * THE ATTRIBUTE A GRAPH CARD WRITES ITS OWN POSITION ONTO. Nine values, `R0` to `R8`.
 *
 * It is a different ladder from the one above and it is now a different attribute. `RUNG_NAMES` in
 * src/web/components/graph/card.ts is the list; this file does not restate it, because the graph is
 * where a card position is decided and a second copy of that list here is the defect at the top of
 * CLAUDE.md.
 */
export const CARD_RUNG_ATTRIBUTE = 'data-card-rung'

/** What an element says the reading length was, on the element itself. */
export function drawnAtLength(rung: Rung): Record<string, string> {
  return { [READING_LENGTH_ATTRIBUTE]: rung }
}

/**
 * WHICH READING LENGTH THIS PART OF THE PAGE WAS DRAWN AT, or an answer saying why there is none.
 *
 * Three answers and they are three different facts:
 *
 *   `{ length }`   the nearest drawing above this element says which reading length it drew.
 *   `null`         nothing above it was drawn at a reading length. A row of the rail, a card on the
 *                  pipeline, the page's own furniture. There is no view to record and inventing one
 *                  would be the third engineering rule broken.
 *   `{ problem }`  something above it claims a reading length this browser cannot place. That is a
 *                  defect in whatever wrote it, not a fact about the reader, and it is said out
 *                  loud rather than being folded into `null`.
 */
export function readingLengthAbove(element: Element): { length: Rung } | { problem: string } | null {
  const drawn = element.closest(`[${READING_LENGTH_ATTRIBUTE}]`)
  if (drawn === null) return null
  const said = drawn.getAttribute(READING_LENGTH_ATTRIBUTE)
  if (said === null) return null
  if (isRung(said)) return { length: said }
  return {
    problem:
      `${READING_LENGTH_ATTRIBUTE}="${said}" is not a reading length, so nothing can be recorded about ` +
      'which drawing this was written on. The reading lengths are declared in src/shared/detail.ts.',
  }
}

// ============================================================ which drawing a card was on

/**
 * THE TWO ATTRIBUTES A DRAWING WRITES ABOUT ITSELF, and the one a card writes about its box.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DRAWING'S ARE ON THE DRAWING AND THE BOX'S IS ON THE CARD
 * ---------------------------------------------------------------------------------------
 *
 * Which drawing this is, is one fact about the whole picture, so it is written once, on the element
 * every card is inside. Writing it on each card would be the same fact twenty times.
 *
 * Which BOX a card sits in cannot be written that way, because the drawing's boxes are not the
 * cards' ancestors in the page: React Flow lays every node out as a sibling and positions a group's
 * children by arithmetic, so a walk up from a step card runs past its pipeline box without meeting
 * it. The card is the only thing that knows, so the card says it.
 */
export const DRAWING_ATTRIBUTE = 'data-drawing'

/** The pipeline a pipeline drawing draws. Absent on the module drawing, which draws no one record. */
export const DRAWING_OF_ATTRIBUTE = 'data-drawing-of'

/** The pipeline box a step card sits inside. Absent on a card at the top of the drawing. */
export const DRAWN_INSIDE_ATTRIBUTE = 'data-drawn-inside'

/** What a drawing says about itself, on the element every card on it is inside. */
export function theDrawingIs(drawing: DrawingWord, pipelineId: string | null): Record<string, string> {
  return { [DRAWING_ATTRIBUTE]: drawing, ...(pipelineId === null ? {} : { [DRAWING_OF_ATTRIBUTE]: pipelineId }) }
}

/** What a card says about the box it is in. Nothing at all for a card at the top of the drawing. */
export function drawnInside(recordId: string | null): Record<string, string> {
  return recordId === null ? {} : { [DRAWN_INSIDE_ATTRIBUTE]: recordId }
}

/**
 * WHICH DRAWING THIS PART OF THE PAGE IS ON, or an answer saying why there is none.
 *
 * Three answers, and they are three different facts, exactly as `readingLengthAbove` above:
 *
 *   `{ drawnOn }`  the nearest drawing above this element says which drawing it is.
 *   `null`         nothing above it is a drawing. A record page, a row of the rail, a plan line.
 *                  There is nothing to record and inventing one would be the third engineering
 *                  rule broken.
 *   `{ problem }`  something above it claims a drawing this browser cannot place. That is a defect
 *                  in whatever wrote it and it is said out loud rather than folded into `null`.
 */
export function theDrawingAbove(element: Element): { drawnOn: DrawnOn } | { problem: string } | null {
  const on = element.closest(`[${DRAWING_ATTRIBUTE}]`)
  if (on === null) return null
  const said = on.getAttribute(DRAWING_ATTRIBUTE)
  if (said === null) return null
  if (!isDrawingWord(said)) {
    return {
      problem:
        `${DRAWING_ATTRIBUTE}="${said}" is not a drawing, so nothing can be recorded about which drawing this ` +
        'was written on. The drawings are declared in src/shared/targets.ts.',
    }
  }
  const of = on.getAttribute(DRAWING_OF_ATTRIBUTE)
  // THE BOX IS READ FROM THE CARD AND NOT FROM THE DRAWING, for the reason written above the
  // attributes: a group is not a card's ancestor in the page, so only the card knows.
  const inside = element.closest(`[${DRAWN_INSIDE_ATTRIBUTE}]`)?.getAttribute(DRAWN_INSIDE_ATTRIBUTE) ?? null
  return {
    drawnOn: {
      drawing: said,
      ...(of === null || of === '' ? {} : { pipelineId: of }),
      ...(inside === null || inside === '' ? {} : { inside }),
    },
  }
}
