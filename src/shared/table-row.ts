// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CELLS OF ONE MARKDOWN TABLE ROW, READ ONCE FOR THE REPORT AND FOR A PLAN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A pipe separates two cells, except where it does not. GitHub's table rule, which this product
 * follows, leaves a pipe alone when it sits inside maths, inside a code span, or after a backslash
 * that escapes it. Two readers of a pipe table used to split every pipe: `src/shared/regions.ts`
 * for a report's parts, and `src/shared/plandoc.ts` for a plan and a table typed into a report.
 * So a cell holding `$|A-B|$` became several cells, the row disagreed with its heading, and the
 * table printed as it was typed.
 *
 * One reader now answers "where do the cells of this row start and end", and both callers ask it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE TWO NUMBERS ARE FOR
 * ---------------------------------------------------------------------------------------
 *
 * `text` is what a person reads: an escaped pipe is one pipe, without the backslash that escaped
 * it. `from` and `to` are where the cell's STORED characters sit in the line, so a report's region
 * tree can cut the cell out of the text that is really there. A caller that only draws words uses
 * `text`; a caller that points at a part uses the span.
 *
 * THE LINE IS PASSED AS STORED AND UNTRIMMED, because `from` and `to` are offsets in that line and
 * not in a trimmed copy of it. Leading spaces before the first pipe are counted, and a cell keeps
 * the spaces on either side of its words, so a plain row gives exactly the spans the report's
 * region tree gave before this reader existed.
 *
 * `$$...$$` is read before `$...$` so the first dollar of a display formula does not open an
 * inline one. A marker with no closing partner is an ordinary character, and the pipes after it
 * still separate cells: half a marker is what somebody typed, not an instruction.
 */

/** One cell of a pipe row: its words, and the stored characters they were cut from. */
export interface TableRowCell {
  text: string
  from: number
  to: number
}

/** A backslash, written once so the scanning below reads as prose. */
const ESCAPE = '\\'

/**
 * Every position a pipe cannot separate cells at.
 *
 * 1 marks a character inside a code span or maths, or a pipe that a backslash escaped. The array
 * is built in three passes because each marker is easier to read on its own: escapes first, then
 * code spans, then maths outside both.
 */
function heldFromPipes(line: string): Uint8Array {
  const held = new Uint8Array(line.length)

  // AN ESCAPED PIPE IS A CHARACTER. The backslash stays in the cell's stored span and is taken out
  // of its words by `unescaped` below.
  for (let at = 0; at < line.length - 1; at += 1) {
    if (line[at] === ESCAPE && line[at + 1] === '|') {
      held[at + 1] = 1
      at += 1
    }
  }

  // A CODE SPAN. A run of back ticks closes at the next run of the same width, as GitHub reads it;
  // a run with no partner is ordinary characters.
  for (let at = 0; at < line.length; ) {
    if (line[at] === ESCAPE) {
      at += 2
      continue
    }
    if (line[at] !== '`') {
      at += 1
      continue
    }
    let width = 1
    while (line[at + width] === '`') width += 1
    const close = theNextRun(line, at + width, width)
    if (close === -1) {
      at += width
      continue
    }
    for (let inside = at; inside < close + width; inside += 1) held[inside] = 1
    at = close + width
  }

  // MATHS, OUTSIDE THE CODE SPANS ALREADY MARKED. `$$` is tried first so a display formula opens
  // with its own two dollars rather than an inline formula on the first one.
  for (let at = 0; at < line.length; ) {
    if (held[at] === 1) {
      at += 1
      continue
    }
    if (line[at] === ESCAPE) {
      at += 2
      continue
    }
    if (line[at] !== '$') {
      at += 1
      continue
    }
    const display = line[at + 1] === '$'
    const width = display ? 2 : 1
    const close = theNextDollar(line, at + width, display)
    if (close === -1) {
      at += width
      continue
    }
    for (let inside = at; inside < close + width; inside += 1) held[inside] = 1
    at = close + width
  }

  return held
}

/** Where a run of back ticks of this width starts again, or -1 when it never does. */
function theNextRun(line: string, from: number, width: number): number {
  for (let at = from; at < line.length; at += 1) {
    if (line[at] === ESCAPE) {
      at += 1
      continue
    }
    if (line[at] !== '`') continue
    let run = 1
    while (line[at + run] === '`') run += 1
    if (run === width) return at
    at += run - 1
  }
  return -1
}

/** Where the closing dollar signs of a formula start, or -1 when they never do. */
function theNextDollar(line: string, from: number, display: boolean): number {
  for (let at = from; at < line.length; at += 1) {
    if (line[at] === ESCAPE) {
      at += 1
      continue
    }
    if (line[at] !== '$') continue
    if (!display) return at
    if (line[at + 1] === '$') return at
    at += 1
  }
  return -1
}

/** The words of one raw cell: an escaped pipe is one pipe. */
function unescaped(raw: string): string {
  return raw.replace(/\\\|/g, '|')
}

/**
 * The cells of one line whose first non-space character is a pipe.
 *
 * The opening pipe and a closing pipe at the end are furniture and make no cell. A line that is
 * only its opening pipe has one empty cell, which is what the two old readers made of it too.
 */
export function tableRowCells(line: string): TableRowCell[] {
  const end = line.trimEnd().length
  const open = line.indexOf('|')
  if (open === -1 || line.slice(0, open).trim() !== '') return []

  const held = heldFromPipes(line)
  const cells: TableRowCell[] = []
  let from = open + 1
  for (let at = from; at < end; at += 1) {
    if (line[at] !== '|' || held[at] === 1) continue
    cells.push({ text: unescaped(line.slice(from, at)), from, to: at })
    from = at + 1
  }
  if (from < end) cells.push({ text: unescaped(line.slice(from, end)), from, to: end })
  if (cells.length === 0) cells.push({ text: '', from: open + 1, to: end })
  return cells
}
