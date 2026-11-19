// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPE INSIDE MATHS OR CODE STAYS INSIDE ITS TABLE CELL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A Markdown table row was cut at every pipe, so a cell holding `$|A-B|$` or a pipe in back ticks
 * became several cells. The row then disagreed with its heading and the whole table printed as
 * typed. The two readers of a pipe table had the same rule: `src/shared/regions.ts` and
 * `src/shared/plandoc.ts`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * The made-up table below holds each shape the splitter must leave alone: inline maths, display
 * maths, a back-tick code span and an escaped pipe. The plan reader must read it as one table with
 * two cells in every row, and the report's region tree must cut the same two cells out of the
 * stored line. The heading row is a row in the region tree, as a person can point at its words;
 * the row of dashes is punctuation and is not one.
 *
 * The rows are written here because a test may state the text it parses. No word a page draws is
 * copied in: this file asserts the cells' own characters, not a label around them.
 */

import { describe, expect, it } from 'vitest'
import { blocksOf } from '../src/shared/plandoc.ts'
import { flatten, regionsOf } from '../src/shared/regions.ts'
import { tableRowCells } from '../src/shared/table-row.ts'

const ROWS = [
  '| quantity | value |',
  '| --- | --- |',
  '| absolute | $|A-B|$ |',
  '| display | $$|A-B|$$ |',
  '| code | `a|b` |',
  '| escaped | left \\| right |',
]

const LINES = ROWS.map((text, at) => ({ id: `line-${String(at)}`, text }))

describe('a table row keeps a pipe inside maths, code and an escape', () => {
  it('reads every row as two cells, with the maths and the code whole', () => {
    const block = blocksOf(LINES)[0]
    if (block === undefined || block.kind !== 'table') {
      throw new Error(`the row was not read as a table: ${JSON.stringify(block)}`)
    }
    expect(block.heading).toEqual(['quantity', 'value'])
    expect(block.rows).toEqual([
      ['absolute', '$|A-B|$'],
      ['display', '$$|A-B|$$'],
      ['code', '`a|b`'],
      ['escaped', 'left | right'],
    ])
  })

  /**
   * THE OLD SPLIT, KEPT HERE AS THE REFERENCE FOR PLAIN ROWS ONLY.
   *
   * This is the code the report's region tree used before the shared reader: the trimmed line has
   * its outer pipes taken off, every other pipe makes a cell, and each cell's span runs from the
   * first pipe to the next. It is here to prove that a row with no pipe inside maths, code or an
   * escape keeps exactly the spans it had, so a comment already placed on a table cell is still
   * placed on it.
   */
  function theOldSpans(line: string): { from: number; to: number }[] {
    const trimmed = line.trim()
    const cells = trimmed.replace(/^\||\|$/g, '').split('|')
    const spans: { from: number; to: number }[] = []
    let at = line.indexOf('|') + 1
    for (const cell of cells) {
      spans.push({ from: at, to: at + cell.length })
      at += cell.length + 1
    }
    return spans
  }

  it('keeps the stored spans of a plain row exactly, spaces and all', () => {
    const plain = [
      '| one | two |',
      '   | one | two |',
      '   | one | two',
      '| one |  | three |',
      '|one|two|',
      '| a ||',
      '| one | two |   ',
      '\t| one | two |\t',
    ]
    for (const line of plain) {
      const spans = tableRowCells(line).map((cell) => ({ from: cell.from, to: cell.to }))
      expect(spans, `the plain row ${JSON.stringify(line)} moved a cell`).toEqual(theOldSpans(line))
    }
  })

  it('gives the report tree the same cells, cut from the stored line', () => {
    const tree = regionsOf({
      field: 'blocks',
      blocks: [{ id: 'b-1', type: 'text', text: ROWS.join('\n') }],
    })
    const all = flatten(tree)
    const cells = all.filter((region) => region.role === 'tableCell').map((region) => region.text.trim())
    expect(cells).toEqual([
      'quantity',
      'value',
      'absolute',
      '$|A-B|$',
      'display',
      '$$|A-B|$$',
      'code',
      '`a|b`',
      'escaped',
      'left \\| right',
    ])
    // The heading row and the four rows below it. The row of dashes is punctuation.
    expect(all.filter((region) => region.role === 'tableRow')).toHaveLength(5)
  })
})
