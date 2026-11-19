// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING LENGTHS 1, 2 AND 3 ARE THE ABSTRACT, AND NOTHING ELSE IS DRAWN UNDER IT.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION THIS FILE HOLDS, AND THE ONE IT REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * WHAT WAS ASKED: every advertised level is one short abstract that says what the report is
 * about, even if it is a single sentence. DETAIL IS WHAT FULL IS FOR.
 *
 * THIS FILE WAS `tests/the-lowest-reading-length-carries-a-paragraph.test.ts` AND IT HELD THE
 * OPPOSITE. It made the derived outline draw a paragraph of the report's own prose at reading
 * length 1, because the lowest useful Report level was held to contain the report's identity and title
 * and one meaningful paragraph that lets the report be understood as a whole — and
 * `design/problem-02/ACCEPTANCE.md` §C-Lowest is the argument that put it there. That
 * argument was written for a corpus where no reading length had an abstract at all, so the
 * paragraph was the only thing the length could hold. Every length has an abstract now, and the
 * length is the abstract rather than the paragraph. §C-2Sept of the same document is the reversal, written
 * before any code was changed to it, and §C-Lowest is kept whole beside it as the argument it
 * replaced.
 *
 * WHAT WAS MEASURED. Over all twenty reports on 2 September 2026: at reading length 1, 83 words of
 * abstract against 3,308 words of the report's own prose copied underneath it; at reading length 3,
 * 580 words of abstract against 6,397 words of substrate. The abstract was drawn at the caption
 * size in grey capitals and the substrate in full-size black type, so a reader took the substrate
 * for the content.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MAKES FAIL
 * ---------------------------------------------------------------------------------------
 *
 * Moving `opening`, `unfinished`, `finding`, `aside`, `partName` or `forOwner` back down to
 * `label`, `title` or `gist` in `OUTLINE_RANKS`. Each is one row of one table and none of them has
 * a type. The fixture carries a block of every one of those kinds AND one block marked for the
 * owner, so a rank that came back down would be named rather than counted.
 *
 * AN EARLIER DECISION WAS THE OTHER HALF, AND IT WAS OVERRULED. It said a block
 * its author addressed to the person is promoted at every level including 1, and it was the one rank left
 * at the three short lengths. The owner met the result on report `FPf58Hfk7_z_`, block `b-seed`: a box
 * labelled *addressed to you* that no level would put away. Once reached, the box could not be
 * closed, and that is clearly unreasonable. So `forOwner` starts at reading length 4 like every
 * other rank, and the three short lengths are the abstract and nothing else. THE BLOCK IS NOT
 * HIDDEN: from reading length 4 it is promoted with the words *addressed to you* over it, and the
 * tests below hold both halves — empty at 1, 2 and 3, and named and labelled at 4.
 */
import { describe, expect, it } from 'vitest'
import type { DetailSource } from '../src/shared/detail.ts'
import { reportAt } from '../src/shared/reportrungs.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { SHORT_FORM_SPECS } from '../src/shared/zoom.ts'

/**
 * A REPORT SHAPED LIKE THE ONES IN THE CORPUS: containers all the way down, no `heading` block at
 * the top level, and one block its author addressed to the owner.
 *
 * IT CARRIES ONE BLOCK OF EVERY RANK THE SHORT LENGTHS USED TO PROMOTE — an opening, a finding
 * nobody finished, a finding that is finished, a callout, and the name of a part — so that moving
 * any one of those rows back down is caught here rather than only in a browser.
 */
const OPENS_WITH = [
  'Half of what was planned was built, and every wave that finished came out with a claim narrower ',
  'than the one it started with. That is the honest headline, and it is what this report is about.',
].join('')

const FOR_THE_OWNER = 'Three proposals are waiting on you, and two of them are the same question.'

const REPORT: SummaryBlock[] = [
  { id: 'b-open', type: 'text', heading: 'The short answer', text: OPENS_WITH },
  { id: 'b-gate', type: 'text', text: FOR_THE_OWNER, forOwner: true },
  {
    id: 'b-part',
    type: 'section',
    title: 'What is still open',
    blocks: [
      { id: 'b-lead', type: 'text', text: 'This part opens here.' },
      { id: 'b-work', type: 'finding', text: 'A finding nobody finished.', state: 'failed' },
      { id: 'b-done', type: 'finding', text: 'A finding that is finished.', state: 'done' },
      { id: 'b-aside', type: 'callout', tone: 'warning', text: 'Set apart by its author.' },
      { id: 'b-name', type: 'heading', text: 'A name inside the part' },
    ],
  },
]

/** The same report with nothing addressed to the owner, which is 17 of the 20 in the corpus. */
const NOTHING_MARKED: SummaryBlock[] = REPORT.filter((block) => block.id !== 'b-gate')


/** A stored short form as `readStoredShortForms` requires one: the words, and where they came from. */
const asStored = (text: string): unknown => ({
  text,
  madeFrom: { seq: 7, contentHash: 'ed42e7949e126b03' },
  writtenBy: 'agent',
})

const THE_GIST = asStored(
  'Round ten built 120 of 221 steps; six waves shipped work nobody could reach, and your ' +
    'governance queue holds twenty-seven proposals, three of them one question.',
)

/** A report whose author wrote a label and a gist, which is the shape that could tempt a lift. */
const WROTE_A_LABEL_AND_A_GIST: DetailSource = {
  title: 'Round ten: what was built, what was not, and what is waiting on you',
  summary: null,
  declaresShortForms: true,
  shortForms: { label: asStored('Round ten: half built, checked'), gist: THE_GIST },
  body: { field: 'data.blocks', written: true },
}

/** The same report with no label written, which is 15 of the 16 reports in the corpus. */
const WROTE_A_GIST_ONLY: DetailSource = {
  ...WROTE_A_LABEL_AND_A_GIST,
  shortForms: { gist: THE_GIST },
}

const words = (text: string): number => text.trim().split(/\s+/).filter((w) => w.length > 0).length

describe('no reading length below Full draws anything under the abstract', () => {
  const BELOW_FULL = ['label', 'title', 'gist', 'outline', 'sketch', 'digest'] as const

  it('draws no block of the report at any of the six, on a report with a block for the owner', () => {
    for (const rung of BELOW_FULL) {
      const drawing = reportAt(WROTE_A_LABEL_AND_A_GIST, REPORT, rung)
      expect(drawing.blocks, `${rung} drew part of the report under its abstract`).toEqual([])
    }
  })

  it('draws no block of the report at any of the six on a report nobody marked either', () => {
    for (const rung of BELOW_FULL) {
      const drawing = reportAt(WROTE_A_LABEL_AND_A_GIST, NOTHING_MARKED, rung)
      expect(drawing.blocks, `${rung} drew part of an unmarked report`).toEqual([])
    }
  })

  /**
   * THE ROW THE OWNER OVERRULED, NAMED RATHER THAN COUNTED. A block its author addressed to the person used to be
   * promoted at every level, then from level 4. The owner read it at level 4 and had the whole box removed
   * on the evening of 2 September 2026. Naming the block means a rule that promoted it again would
   * be caught here rather than only by a count that its neighbours could satisfy.
   */
  it('draws no block addressed to the owner at any length below Full', () => {
    for (const rung of BELOW_FULL) {
      const drawing = reportAt(WROTE_A_LABEL_AND_A_GIST, REPORT, rung)
      const drawnText = drawing.blocks.map((at) => {
        const block = REPORT[at]
        return block !== undefined && 'text' in block ? block.text : ''
      })
      expect(drawnText, `the box the person could not get rid of is back at ${rung}`).not.toContain(FOR_THE_OWNER)
    }
  })

  it('draws every block at Full, so nothing was hidden, only moved to where the detail is', () => {
    const drawing = reportAt(WROTE_A_LABEL_AND_A_GIST, REPORT, 'full')
    expect(drawing.blocks).toEqual(REPORT.map((_, at) => at))
    expect(drawing.notDrawn).toBe(0)
  })
})

describe('the authored summary at reading length 1 stays inside the label’s budget', () => {
  it('draws the label somebody wrote and never the longer form written beside it', () => {
    const drawing = reportAt(WROTE_A_LABEL_AND_A_GIST, REPORT, 'label')
    expect(drawing.lines.map((line) => line.text)).toEqual(['Round ten: half built, checked'])
    expect(drawing.summary.standing).toBe('written')
    expect(drawing.summary.field).toBe('data.shortForms.label')
  })

  it('draws no line longer than the length asked for, on any report', () => {
    for (const source of [WROTE_A_LABEL_AND_A_GIST, WROTE_A_GIST_ONLY]) {
      for (const line of reportAt(source, REPORT, 'label').lines) {
        expect(line.rung, `a ${line.rung} was lifted into reading length 1`).toBe('label')
        expect(words(line.text)).toBeLessThanOrEqual(SHORT_FORM_SPECS.label.maxWords)
      }
    }
  })

  it('says nobody wrote one, rather than showing the gist, where no label was written', () => {
    const drawing = reportAt(WROTE_A_GIST_ONLY, REPORT, 'label')
    expect(drawing.lines).toEqual([])
    // WAS `none` UNTIL 3 SEPTEMBER 2026. The standing had four words while a form written for
    // another length could stand at this one; criterion A14a leaves two, and this is the second.
    expect(drawing.summary.standing).toBe('missing')
    // AND NOTHING IS UNDER THE STATEMENT, on a report with a block addressed to the owner and on
    // one without. The level is the statement alone, which is the honest answer: the length has no
    // abstract and Full is where the report is. §C-2Sept, as §C-3Sept widened it to every length.
    expect(drawing.blocks).toEqual([])
    expect(reportAt(WROTE_A_GIST_ONLY, NOTHING_MARKED, 'label').blocks).toEqual([])
  })
})
