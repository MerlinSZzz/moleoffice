// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN'S OWN WORDS, WITH THE MATHS IN THEM DRAWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRAWN, AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * One dollar sign either side draws a formula inside the line, and two either side draw it on a line
 * of its own, exactly as in a report. The reading is `inlinePieces` in src/shared/inline.ts and the
 * drawing is `MathText`, the same two a report uses, so a formula cannot read one way in a plan and
 * another way in a report.
 *
 * A LIST OF A PLAN'S LINES DRAWS EVERY FORMULA INSIDE ITS LINE, two dollar signs either side too, at
 * the line's own size. Each line is then one row. A display there broke one line into three rows:
 * the words before it, the formula at a larger size, and the words after it. `lineWithMaths` is
 * what every such list draws a line with. A cell of the plan's table keeps its displays, through
 * `wordsWithMaths`, because a cell is a box of its own.
 *
 * ONLY THE MATHS IS DRAWN. Asterisks, back ticks and links stay as typed, because a plan has never
 * drawn them and a person reading their plan reads the characters they wrote. Back ticks still keep
 * the dollar signs inside them as characters: the reader never lets a formula cross a back tick, so
 * `$PATH` in back ticks is read as code, and code is drawn here as typed.
 *
 * A WORD WITH NO MATHS IN IT IS GIVEN BACK AS THE SAME STRING, so a plan with no dollar signs draws
 * exactly the text nodes it drew before, and KaTeX is never asked for.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CHARACTERS ARE
 * ---------------------------------------------------------------------------------------
 *
 * An element carrying a text offset promises that its text IS the stored string from that offset.
 * A drawn formula is not its characters, so nothing that holds one may carry an offset. The runs of
 * words between formulas carry their own instead, through `origin`, each over the characters it
 * really draws. That is the same arrangement `renderInline` makes for bold around a link.
 */

import type { ReactNode } from 'react'
import { inlinePieces, type TextOrigin } from '@shared/inline.ts'
import { parsePlanLine, type PlanningValue } from '@shared/planline.ts'
import { tableRowCells } from '@shared/table-row.ts'
import { MathText } from '../MathText.tsx'

/** True when these words hold at least one formula the reader will draw. */
export function holdsMaths(text: string): boolean {
  return inlinePieces(text).some((piece) => piece.kind === 'maths')
}

/**
 * Some of a plan's words, with their maths drawn and every other character as typed.
 *
 * `origin` is asked where each run of words sits, by its position in `text`. A caller that cannot
 * say leaves it out, and the runs carry nothing.
 */
export function wordsWithMaths(text: string, origin?: TextOrigin): ReactNode {
  return holdsMaths(text) ? drawn(text, 'pm', 'as written', origin) : text
}

/** Where a formula written with two dollar signs either side is drawn. */
type Displays = 'as written' | 'inside the line'

function drawn(text: string, key: string, displays: Displays, origin?: TextOrigin): ReactNode[] {
  const out: ReactNode[] = []
  // THE WORDS BETWEEN TWO FORMULAS ARE ONE RUN, whatever pieces the reader split them into, because
  // every one of those pieces is drawn as its characters here.
  let run = ''
  let runFrom = 0
  let at = 0
  const close = () => {
    if (run === '') return
    const marks = origin?.(runFrom, run.length) ?? null
    out.push(marks === null ? run : <span key={`${key}-w${String(runFrom)}`} {...marks}>{run}</span>)
    run = ''
  }
  for (const piece of inlinePieces(text)) {
    if (piece.kind === 'maths') {
      close()
      out.push(<MathText key={`${key}-m${String(at)}`} tex={piece.tex} display={displays === 'inside the line' ? false : piece.display} />)
    } else {
      if (run === '') runFrom = at
      run += piece.raw
    }
    at += piece.raw.length
  }
  close()
  return out
}

/**
 * A whole stored line of a plan, with the maths in its words drawn inside the line.
 *
 * THE PLANNING GROUPS AT THE END ARE READ ONE AT A TIME, and only a note's words are prose.
 * `{time: $2 $3 on 5 Dec}` is time words, and size and project are not prose either, so those stay
 * exactly as typed: reading them would pair two prices into a formula. A note is the writer's own
 * words and draws its maths, as it does in the table's note column. The groups are found by
 * `parsePlanLine`, the one reader of them.
 *
 * A PIPE ROW IS READ ONE CELL AT A TIME, through `tableRowCells`, the one reader of where a cell
 * begins and ends. Two prices in two cells then never pair across the pipe between them, which is
 * what the table itself does.
 */
export function lineWithMaths(line: string): ReactNode {
  const read = parsePlanLine(line)
  const notes = read.values.filter((value) => value.key === 'note')
  if (!holdsMaths(read.text) && !notes.some((note) => holdsMaths(note.value))) return line
  return [...wordsOfALine(read.text), ...read.values.flatMap((value, n) => groupOf(value, n)), read.after]
}

/** The words of a line before its groups. A pipe row is read one cell at a time. */
function wordsOfALine(words: string): ReactNode[] {
  const cells = tableRowCells(words)
  if (cells.length === 0) return drawn(words, 'pl', 'inside the line')
  const out: ReactNode[] = []
  let last = 0
  for (const cell of cells) {
    out.push(words.slice(last, cell.from), ...drawn(words.slice(cell.from, cell.to), `pl${String(cell.from)}`, 'inside the line'))
    last = cell.to
  }
  out.push(words.slice(last))
  return out
}

/** One planning group, as typed, with the maths drawn only inside a note's words. */
function groupOf(value: PlanningValue, n: number): ReactNode[] {
  if (value.key !== 'note') return [value.before + value.source]
  // `{note: words}`: everything up to the colon and the closing bracket is the group's own furniture.
  const colon = value.source.indexOf(':') + 1
  return [value.before + value.source.slice(0, colon), ...drawn(value.source.slice(colon, -1), `pn${String(n)}`, 'inside the line'), '}']
}
