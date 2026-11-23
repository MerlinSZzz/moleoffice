// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A REPORT'S OWN CONTENT DRAWS AT EACH OF THE SEVEN POSITIONS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/detail.ts` answers one question about one record: which stored words does a surface
 * draw when it asked for one rung's worth. That answer is a single string, and a single string is
 * the whole answer for a row of a list.
 *
 * A report is not a row of a list. It is a run of blocks, and this file says which of them one
 * position draws, and which written form is drawn above them. `reportAt` is the one function that
 * answers both.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH POSITION DRAWS, AND THE RULE THE OWNER SET
 * ---------------------------------------------------------------------------------------
 *
 *   1 to 3   the form somebody wrote for that length, and nothing under it
 *   4 to 6   the report's parts, as somebody wrote them: at 4 each part's one-sentence heading, at
 *            5 that heading with its 30-word text, at 6 that heading with its 120-word text. Under
 *            a part at 5 and 6, the pictures and charts it covers, when the picture button is on.
 *            Nothing else of the report. Where nobody has written the parts, the body draws one
 *            line saying so and nothing else.
 *   7        the report itself, every block of it, and nothing above it
 *
 * Every advertised level is one short abstract, and detail is what Full is for.
 *
 * POSITIONS 4, 5 AND 6 USED TO DRAW BLOCKS OF THE REPORT — the headings, then the headings plus the
 * opening of each part, then every block the report is written in. That was the older model, in
 * which a shorter length showed FEWER OF THE REPORT'S OWN THINGS. It was written when hardly any
 * report had a written form at any length. Every level has one now, so what the blocks did under
 * the form was let the report show through its own summary. That part is gone: an excerpt hides part
 * of the facts, and that deceives the reader. §C-3Sept of
 * design/problem-02/ACCEPTANCE.md is the argument; criterion A8 of the POINTING contract is the rule.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER WRITES A CHARACTER
 * ---------------------------------------------------------------------------------------
 *
 * Every string this file hands back came out of storage byte for byte, and every one carries the
 * path it came from. There is no cutting, no joining and no summarising here, which is the same
 * promise `detail.ts` makes and for the same reason: a machine cut presented as an authored short
 * form is the one thing the detail ladder exists to prevent.
 *
 */
import { positionOf, type DetailSource, type Rung } from './detail.ts'
import { isAPicture, PICTURES_DEFAULT, type Pictures } from './pictures.ts'
import type { SummaryBlock } from './types.ts'
import {
  BY_PART_LEVELS,
  PARTS_KEY,
  SHORT_FORM_LEVELS,
  STORED_SHORT_FORM_LEVELS,
  TEXT_DRAWN_AT,
  isByPartLevel,
  readStoredParts,
  readStoredShortForms,
  textsOfPart,
  formsWrittenIn,
  type ByPartLevel,
  type StoredPart,
} from './zoom.ts'

// THE LIST OF WHICH LENGTHS A RECORD HAS WORDS FOR is worked out in ./zoom.ts, which the API server loads, and is
// exported from here as well for the pages that read the rest of this file. The server's own count of the detail
// grid needs that list and nothing else here, and this file loads ./pictures.ts, which only the pages load.
export { formsWrittenIn }

/** One stored line drawn above the writing, and where it was read from. */
export interface ReportLine {
  /** The stored characters, byte for byte. */
  text: string
  /** The exact stored path, such as `data.shortForms.label` or `title`. */
  field: string
  /** Which rung of the ladder wrote them. */
  rung: Rung
}

/**
 * WHETHER SOMEBODY WROTE A FORM FOR THE LENGTH BEING READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE ANSWER AND NOT A LINE OF `lines`
 * ---------------------------------------------------------------------------------------
 *
 * `lines` is what the report body DRAWS. Whether a form for this length EXISTS is a different fact,
 * and a surface that read availability off the drawn lines would have to work it out again. This is
 * the one answer, and `lines` is empty at exactly the lengths this calls `missing`.
 *
 * ---------------------------------------------------------------------------------------
 * AVAILABILITY IS NOT COMPLETENESS, AND NOTHING HERE TOUCHES COMPLETENESS
 * ---------------------------------------------------------------------------------------
 *
 * Projection availability is separate from record completeness. A report
 * with no short forms is COMPLETE — `shortForms` is optional in `src/shared/kinds.ts` and stays
 * optional — and it has no summary at four of its six reading lengths. Both are true at once, and
 * this answer is the second one. It is worked out here, from the detail resolver, and the
 * completeness computation neither reads it nor knows it exists.
 */
export interface ReportSummary {
  /** The length that was asked for. */
  rung: Rung
  /**
   * WHETHER A FORM FOR THIS LENGTH WAS WRITTEN. TWO ANSWERS, AND THERE USED TO BE FOUR.
   *
   *   `written`   somebody wrote a form for this length and it is stored under `data.shortForms`.
   *               At levels 4 to 6 that means the by-part structure. Full is always written: Full
   *               is the report itself.
   *   `missing`   nobody wrote one. The body draws one line saying this level has not been written
   *               and nothing else.
   *
   * THE OTHER TWO ANSWERS WENT ON 3 SEPTEMBER 2026, under criterion A14a of
   * design/pointing-reopened/ACCEPTANCE.md: a report from a gap, or an older report with no such level, shows
   * no summary (gist) level and says plainly that it does not exist. `shorter` said nobody wrote a form for this
   * length and the form written for a shorter one stands here; `unrecorded` said the record's own
   * title column stands here and nobody recorded whether it was written for this length. Both were
   * something standing in for a level nobody wrote, which is what criterion A14a ended: a level that is not
   * written says so, and nothing stands in for it.
   */
  standing: 'written' | 'missing'
  /** The stored path the form came from, such as `data.shortForms.gist`. Null when there is none. */
  field: string | null
  /**
   * WHICH AGENT OR PERSON WROTE THIS FORM, by registry id, or null where nobody recorded one. Where
   * no registry row was found, or the form was stored before writers were stored by id, it is the
   * actor id.
   *
   * A summary of a report records who produced it.
   * Read off the stored form, which is the only place it is written.
   *
   * NULL IS AN ORDINARY ANSWER and it is not a gap in the page. Every short form stored before that
   * day carries no writer, and a request that stated no actor stores none. Nothing is filled in.
   */
  by: string | null
}

/**
 * ONE PART OF THE REPORT AS ONE READING LENGTH DRAWS IT.
 *
 * EVERY STRING HERE CAME OUT OF STORAGE BYTE FOR BYTE, like every other string this file hands
 * back. What changes between levels 4, 5 and 6 is which of the part's stored texts is drawn and
 * which of its blocks are drawn under it; nothing is cut, joined or shortened.
 */
export interface DrawnPart {
  /** The part's own id. The same at levels 4, 5 and 6, which is what makes it one part. */
  id: string
  /** The part's one-sentence summary. The same sentence at all three levels. */
  heading: string
  /** The text drawn under the heading, or null at level 4, which draws the heading alone. */
  text: string | null
  /** The exact stored path the heading came from. */
  headingField: string
  /** The exact stored path the text came from, or null where there is no text. */
  field: string | null
  /** Which of the record's blocks this part covers, by their place in the stored list, in order. */
  covers: readonly number[]
  /**
   * THE SAME BLOCKS BY THEIR OWN IDS, in the same order.
   *
   * TWO SPELLINGS OF ONE ANSWER, WORKED OUT ONCE, HERE. The page needs the places to draw a part's
   * media, and the composer needs the ids to name what the part stands for. Both come out of the
   * same walk over the same list, so they cannot disagree about which blocks a part covers.
   *
   * A BLOCK THE REPORT NO LONGER HOLDS IS IN NEITHER. It was written into `covers` when the parts
   * were written and the report has moved since; the reading says the parts are out of date, and
   * naming a block that is gone would put a name on a screen the server answers *not there* about.
   */
  coverIds: readonly string[]
  /**
   * WHICH OF THOSE BLOCKS ARE DRAWN UNDER THE TEXT: the part's pictures and charts, and only where
   * the reading length draws media at all and the reader has the pictures on.
   *
   * EMPTY AT LEVEL 4, which draws no media. Empty when the pictures are left out. A table is not
   * media — it is words, summarised in the part's text, and drawn only at Full.
   */
  media: readonly number[]
}

/** What a report's content draws at one position. */
export interface ReportDrawing {
  /** The position asked for. */
  rung: Rung
  /**
   * THE ONE FORM THIS LENGTH DRAWS, or no line at all.
   *
   * AT MOST ONE, AND IT IS THE FORM WRITTEN FOR THE LENGTH ASKED FOR OR NOTHING. It used to be the
   * trail of every shorter form, then the nearest shorter one that was written; `lineAt` says why
   * both went. It is a list rather than one optional value because "no line" is a real answer —
   * nobody wrote a form for this length — and because the three lengths written by part draw their
   * parts here instead. `summary` below says which.
   */
  lines: readonly ReportLine[]
  /** Which of the record's blocks are drawn, by their place in the stored list, in order. */
  blocks: readonly number[]
  /** How many of the record's blocks this position does not draw. */
  notDrawn: number
  /**
   * THE REPORT'S PARTS AS THIS LENGTH DRAWS THEM, or null where this length does not draw parts.
   *
   * NULL AT LEVELS 1 TO 3 AND AT FULL, which draw a written form and the report itself. Null at
   * levels 4 to 6 as well when nobody has written the by-part structure — the body then draws the
   * one line saying so, which `summary` is what says. An empty list is never an answer: a report
   * with parts has parts.
   */
  parts: readonly DrawnPart[] | null
  /**
   * WHETHER A FORM FOR THIS LENGTH WAS WRITTEN FOR THIS REPORT.
   *
   * Two answers, and the surface draws one of two things: the form, or the line saying this level
   * has not been written.
   */
  summary: ReportSummary
}


/** True when this rung is one of the lengths still stored under `data.shortForms`. */
function isStoredShortFormLevel(rung: Rung): rung is (typeof STORED_SHORT_FORM_LEVELS)[number] {
  return (STORED_SHORT_FORM_LEVELS as readonly string[]).includes(rung)
}

/**
 * WHICH FORM A PAGE DRAWN AT ONE LENGTH SHOWS: the one written for that length, or null.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER REACHES FOR ANOTHER LENGTH'S FORM, AND IT USED TO
 * ---------------------------------------------------------------------------------------
 *
 * It answered with the longest form at or below the length asked for, so a report with a gist and
 * no parts drew its gist at levels 4, 5 and 6, and a report with only a label drew its label at
 * every length above it. The words were real and written, and they were written for a different
 * length; the page said nothing about which. Criterion A14a ruled that out, and the fallback is gone
 * rather than relabelled, for the reason that also removed the selection box: something standing in
 * hides which parts are missing.
 *
 * NULL IS A REAL ANSWER AND IT IS THE COMMON ONE ON AN OLD REPORT: nobody wrote a form for this
 * length. The body then draws no opening line and `summaryAt` says so in words.
 *
 * FULL DRAWS NO WRITTEN FORM. Full is the report itself, and the body used to draw the longest form
 * above it. A mark under that said which length it was written for. That mark is not for a person, and
 * without it a summary somebody wrote would stand above
 * the report with nothing saying what it is, read as the report's own first paragraph. So Full is
 * the report alone. Criterion A11, retired into this rule; §C-3Sept of
 * design/problem-02/ACCEPTANCE.md.
 */
export function formDrawnAt(source: DetailSource, at: Rung): Rung | null {
  if (at === 'full') return null
  return formsWrittenIn(source).some((one) => one.rung === at) ? at : null
}

/**
 * THE ONE OPENING LINE FOR THE LENGTH ASKED FOR: the form written for it, or no line at all.
 *
 * IT RETURNS A LIST HOLDING AT MOST ONE LINE. Nought lines is a real answer — nobody wrote a form
 * for this length, and `summaryAt` is what says so on the page — and the three lengths written by
 * part have no single string, so they draw their parts and no line here.
 *
 * THE LINE SAYS WHICH LENGTH THE WORDS CAME FROM, and it is now always the length asked for. It
 * carried the length the words were actually written for while the fallback existed, because a
 * title standing in for a label is a title and a screen calling it a label would be claiming
 * somebody wrote one. Both facts are the same fact now.
 */
function lineAt(source: DetailSource, upTo: Rung): ReportLine[] {
  const drew = formDrawnAt(source, upTo)
  if (drew === null) return []
  const found = formsWrittenIn(source).find((one) => one.rung === drew)
  // A LENGTH WRITTEN BY PART HAS NO SINGLE STRING, so there is no line for it. `reportAt` does not
  // ask for one — it draws the parts instead — and this answers rather than asserting, because a
  // caller that asked would otherwise be handed an empty string dressed as somebody's writing.
  if (found === undefined || found.text === null) return []
  return [{ text: found.text, field: found.field, rung: drew }]
}

/**
 * THE REPORT'S PARTS AS ONE READING LENGTH DRAWS THEM, or null where this length draws no parts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT DECIDES WHETHER THERE ARE ANY
 * ---------------------------------------------------------------------------------------
 *
 * Two things, and both are read rather than guessed. The length has to be one of the three written
 * by part, and somebody has to have written the structure. When either is false this answers null,
 * and at levels 4 to 6 that means nobody wrote the parts — the body then draws the one line saying
 * this level has not been written, and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER IS THE REPORT'S OWN ORDER
 * ---------------------------------------------------------------------------------------
 *
 * Parts are drawn in the order of their FIRST COVERED BLOCK, not in the order they happen to be
 * stored in. The reader is reading the report, and a part standing for its opening belongs at the
 * top whatever order the writer sent. A part whose blocks the report no longer holds has no first
 * block to be ordered by; it keeps its stored place at the end, and is not dropped, because a part
 * silently missing is the exact harm these levels exist to prevent.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN UNDER A PART
 * ---------------------------------------------------------------------------------------
 *
 * The pictures and charts it covers, at levels 5 and 6, and only when the reader has the pictures
 * on. Level 4 draws none: it is one line per part and nothing else. A TABLE IS NOT MEDIA — it is
 * words, it is summarised in the part's text, and it is drawn only at Full. `isAPicture` in
 * ./pictures.ts is the one list of what a picture is, and the criterion's third media kind, video,
 * is on it since the `video` block came, so there is one list and not two.
 */
function partsAt(
  source: DetailSource,
  blocks: readonly SummaryBlock[],
  rung: Rung,
  pictures: Pictures,
): readonly DrawnPart[] | null {
  if (!isByPartLevel(rung)) return null
  const written = readStoredParts(source.shortForms)
  if (written === null) return null
  const at = new Map(blocks.map((block, index) => [block.id, index]))
  const drawn = written.parts.map((part) => oneDrawnPart(part, at, blocks, rung, pictures))
  // THE ORDER OF THE FIRST COVERED BLOCK. A part covering nothing the report still holds sorts
  // after every part that covers something, and keeps its stored order among its like.
  return drawn
    .map((part, stored) => ({ part, stored, first: part.covers[0] ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.first - b.first || a.stored - b.stored)
    .map((one) => one.part)
}

/** One stored part, read at one reading length. */
function oneDrawnPart(
  part: StoredPart,
  at: ReadonlyMap<string, number>,
  blocks: readonly SummaryBlock[],
  rung: ByPartLevel,
  pictures: Pictures,
): DrawnPart {
  // WHICH TEXT THIS LENGTH DRAWS UNDER THE HEADING, from the one table in ./zoom.ts. Level 4 draws
  // none, and null is that answer rather than an empty string, which would draw as a blank line.
  const which = TEXT_DRAWN_AT[rung]
  const covers = part.covers
    .map((id) => at.get(id))
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b)
  const coverIds = covers.map((index) => blocks[index]?.id ?? '')
  // NO MEDIA AT LEVEL 4, and none when the reader has the pictures off. The two are separate
  // questions and they are asked one after the other, the way `reportAt` asks them of the blocks.
  const media =
    which === null || pictures !== 'drawn'
      ? []
      : covers.filter((index) => {
          const block = blocks[index]
          return block !== undefined && isAPicture(block.type)
        })
  return {
    id: part.id,
    heading: part.heading,
    // WHERE THE HEADING'S CHARACTERS CAME FROM, on every level that draws it. Level 4 draws the
    // heading and nothing else, so without this nothing on the page at that length would carry the
    // stored path of the words on it, and an instrument that reads drawn fields would see level 4
    // as drawing nothing at all.
    headingField: `data.shortForms.${PARTS_KEY}[#${part.id}].heading`,
    text: which === null ? null : textsOfPart(part)[which],
    field: which === null ? null : `data.shortForms.${PARTS_KEY}[#${part.id}].${which}`,
    covers,
    coverIds,
    media,
  }
}

/**
 * WHETHER A FORM FOR ONE LENGTH WAS WRITTEN FOR THIS REPORT.
 *
 * IT READS ONE LIST AND DECIDES NOTHING ITSELF. `formsWrittenIn` in ./zoom.ts is which lengths this record
 * has a form stored for, and the answer is whether this length is on it. Nothing walks the ladder,
 * so a length can no longer look filled by another length's words.
 *
 * WHO WROTE IT IS READ OFF THE STORED FORM, which is the only place it is written. The three
 * lengths written by part carry a writer on the structure rather than on a level, and the composer
 * is where a person meets it; this answers null for them rather than naming the structure's writer
 * as the writer of one level of it.
 *
 * FULL IS THE REPORT ITSELF, and it is never missing. There is no shorter form of the whole thing
 * to be absent. `SummaryBlocks` only reaches this with blocks in hand, so the report at that length
 * is what is written.
 */
function summaryAt(source: DetailSource, rung: Rung): ReportSummary {
  if (rung === 'full') {
    const field = source.body?.field ?? null
    // FULL IS THE REPORT ITSELF and nobody writes a form of the whole thing, so there is no writer
    // of one to name. Who wrote the report is in its revision ledger, a different question.
    return { rung, standing: 'written', field, by: null }
  }
  const own = formsWrittenIn(source).find((one) => one.rung === rung)
  if (own === undefined) return { rung, standing: 'missing', field: null, by: null }
  // WHO WROTE IT, off the stored form. Absent on every form stored before 2 September 2026 and on
  // any write that stated no actor; null is that answer and nothing is filled in for it.
  //
  // NULL AT LEVELS 2 AND 3, WHICH ARE THE RECORD'S OWN COLUMNS. A column carries no writer of its
  // own: who last changed it is in the revision ledger, which this file cannot reach and must not
  // guess at. `GET /api/records/:id/short-forms` reads it there and the composer draws it, which
  // is criterion A9a. Nothing is stamped on the record for this.
  const stored = isByPartLevel(rung) || !isStoredShortFormLevel(rung)
    ? undefined
    : readStoredShortForms(source.shortForms)[rung]
  return { rung, standing: 'written', field: own.field, by: stored?.by ?? null }
}

/**
 * WHAT A REPORT'S CONTENT DRAWS AT ONE POSITION. ONE FUNCTION, AND EVERY CALLER READS IT.
 *
 * The report page calls it to decide what to draw. The preview on the settings grid calls it to
 * show what the report page would draw before anybody chooses. They are the same answer because
 * they are the same call, which is what stops the preview teaching a reader something the page
 * then does not do.
 *
 * AND `drawnAt` IN DetailSays.tsx CALLS IT TOO. That function builds the key the settings grid uses
 * to dim positions that draw the same thing on this record, so the grid cannot say three positions
 * differ while the page draws them identically.
 *
 * THIS FUNCTION IS THE WHOLE OF WHAT THE REPORT BODY DRAWS, AND SAYING SO HERE IS THE POINT. The
 * body draws the opening line and the blocks, and this answers both. It used to draw a third thing
 * between them — a selection of the report's own lines, from a file this one knew nothing about —
 * so anything standing for what a length draws had to ask two functions and could disagree with the
 * page. That selection went on 2 September 2026 and the file with it, so there is one answer again.
 */
export function reportAt(
  source: DetailSource,
  blocks: readonly SummaryBlock[],
  rung: Rung,
  /**
   * WHETHER THE PICTURES ARE DRAWN. The second dimension, and it is a separate argument because it
   * is a separate question: how much a report says and whether its charts are drawn are two things
   * a reader sets one at a time. Left out means `drawn`, which is what a report written with a
   * chart in it looks like.
   *
   * A PICTURE LEFT OUT IS STILL COUNTED AS NOT DRAWN. `notDrawn` is what the line under the report
   * says out loud, so a reader can see that 2 of 61 blocks are not here and why.
   */
  pictures: Pictures = PICTURES_DEFAULT,
): ReportDrawing {
  // THE PARTS FIRST, BECAUSE THEY DECIDE WHETHER THERE IS AN OPENING LINE AT ALL. At levels 4, 5
  // and 6 a report whose parts are written draws its parts and no written form above them: the
  // parts ARE the form for that length. A report whose parts are not written draws no line at all,
  // and `summary` below is what says the level has not been written.
  const parts = partsAt(source, blocks, rung, pictures)
  const lines = parts === null ? lineAt(source, rung) : []
  const at = positionOf(rung)
  // NONE OF THE REPORT'S OWN BLOCKS BELOW FULL. Every length below Full draws the form written for
  // it and nothing under it; Full draws the report.
  //
  // WHY IT IS TWO ANSWERS AND USED TO BE FIVE. Reading lengths 4, 5 and 6 drew the headings, then
  // the headings plus the opening of each part, then every block the report is written in — the
  // older model, in which a shorter length showed FEWER OF THE REPORT'S OWN THINGS. Every length
  // has a written form now, so the blocks under the form were the report showing through its own
  // summary. So the whole of it is gone, box and blocks together: an excerpt hides which parts are
  // missing, and that is deception.
  // §C-3Sept of design/problem-02/ACCEPTANCE.md, criterion A8 of the POINTING contract.
  const byLength = at >= positionOf('full') ? blocks.map((_, i) => i) : []
  // THE TWO DIMENSIONS ARE APPLIED ONE AFTER THE OTHER AND NEITHER READS THE OTHER. How much it
  // says chooses a set of blocks; whether pictures are drawn takes the pictures out of whatever
  // that set turned out to be. That is what makes them separable: changing one cannot change what
  // the other would have answered.
  const chosen = pictures === 'drawn' ? byLength : byLength.filter((i) => {
    const block = blocks[i]
    return block === undefined || !isAPicture(block.type)
  })
  return {
    rung,
    lines,
    blocks: chosen,
    // WHAT IS NOT DRAWN AS A BLOCK OF THE REPORT. At levels 4 to 6 the media drawn under a part is
    // drawn by the part rather than as a block of the report, so it is counted here as not drawn:
    // this number is what the line under the report says out loud, and it is about the report's own
    // blocks. Every block below Full is one of them, which is the same answer as before the parts
    // existed.
    notDrawn: blocks.length - chosen.length,
    parts,
    summary: summaryAt(source, rung),
  }
}
