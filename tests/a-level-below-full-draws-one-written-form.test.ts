// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READING LENGTH BELOW FULL DRAWS ONE WRITTEN FORM AND NOTHING ELSE OF THE REPORT.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHAT IT REPLACED
 * ---------------------------------------------------------------------------------------
 *
 * Until 2 September 2026 the report body drew three things at reading lengths 4, 5 and 6: the form
 * somebody wrote for the length, then a box of lines copied from the report under a label reading
 * *Selected from the report, not summarised*, then — at length 6 — blocks of the report drawn whole.
 * That was ruled out. A label admitting the lines are a selection does not cure it: the reader is
 * still misled and still cannot tell which parts are missing, and that is deception. So the box
 * is removed rather than relabelled, and nothing else takes its place.
 *
 * Criterion A8 of `design/pointing-reopened/ACCEPTANCE.md`, §C-3Sept of
 * `design/problem-02/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY IT IS RENDERED
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what a person sees, so the report body is rendered and read. Asserting
 * `reportAt(...).blocks` alone would leave the page free to draw a box of copied lines beside it,
 * which is exactly what it did for the four days this test would not have caught.
 *
 * THE FIXTURE CARRIES WHAT THE OLD LADDER DREW AT EACH OF THE THREE LENGTHS: a heading, so length 4
 * had something; the opening prose of each part, so length 5 had something; findings and callouts
 * inside a section, so length 6 had something. A report of plain paragraphs would have passed a
 * broken page at two of the three lengths.
 *
 * MUTATIONS, so a reader can check these assertions are not decoration:
 *
 *   in `reportAt` in src/shared/reportrungs.ts, give any length below `full` a block set again —
 *   `at >= positionOf('digest') ? blocks.map((_, i) => i) : []` — and *the report's own writing*
 *   goes red at `digest`.
 *
 *   put `<ReportOutline>` back in `SummaryBlocks` — or any element of class `sb-outline` carrying
 *   the label — and *no box, and no label naming one* goes red at every length below Full.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DetailSource, Rung } from '../src/shared/detail.ts'
import { TEXT_DRAWN_AT, isByPartLevel } from '../src/shared/zoom.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let sb: SummaryBlocksModule

beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  sb = await import('../src/web/components/SummaryBlocks.tsx')
})

// ------------------------------------------------------------------------------- the fixture

/**
 * EVERY RUN OF THE REPORT'S OWN CHARACTERS, named so that a test can look for each of them by hand.
 * Each was drawn by one of the three lengths the box lived at.
 */
const OPENS_WITH =
  'Half of what was planned was built, and every wave that finished came out with a claim narrower ' +
  'than the one it started with.'
const HEADING = 'What is still open'
const PART_OPENS_WITH = 'The part under this name opens with a sentence of its own.'
const A_FINDING = 'Six waves shipped work that nobody could reach from the product.'
const AN_ASIDE = 'Set apart by its author, and not part of the argument.'
const UNFINISHED = 'The interface sentences have not been read by anybody.'

const REPORT: SummaryBlock[] = [
  { id: 'b-open', type: 'text', text: OPENS_WITH },
  { id: 'b-head', type: 'heading', text: HEADING, level: 2 },
  { id: 'b-part-open', type: 'text', text: PART_OPENS_WITH },
  { id: 'b-finding', type: 'finding', text: A_FINDING },
  { id: 'b-aside', type: 'callout', tone: 'warning', text: AN_ASIDE },
  { id: 'b-todo', type: 'text', text: UNFINISHED },
]

/** Every run of the report a level could have copied, so a test can look for all of them at once. */
const THE_REPORTS_OWN_WORDS = [OPENS_WITH, HEADING, PART_OPENS_WITH, A_FINDING, AN_ASIDE, UNFINISHED]

/**
 * THE THREE WHOLE-RECORD LENGTHS, EACH ONE TEXT ABOUT THE REPORT.
 *
 * ALL THREE USED TO BE STORED UNDER `data.shortForms` and this fixture wrote them there. Criterion
 * A14b of design/pointing-reopened/ACCEPTANCE.md changed that on 3 September 2026: reading length 2
 * IS the record's own `title` column and length 3 IS its own `summary` column. So only the label is
 * a stored form now, and the other two go on the columns — see `ALL_SIX` below. What this file
 * asserts about them is unchanged: each length draws the words written for it and nothing else.
 */
const FORMS = {
  label: 'Round ten, half built',
  title: 'Round ten: what was built, what was not, and what waits on you',
  gist: 'Round ten built half of what it planned, and three proposals are waiting on you.',
} as const

/**
 * THE THREE LENGTHS WRITTEN BY PART, WHICH ARE ONE STORED STRUCTURE AND NOT THREE TEXTS.
 *
 * Levels 4, 5 and 6 used to be `card`, `brief` and `account` — one text each, about the whole
 * report. They were retired on 2 September 2026 and those three seats now hold the report's parts:
 * a heading per part at level 4, the same heading with a 30-word text under it at level 5, and with
 * a 120-word text at level 6. So the fixture stores one structure covering every block of the
 * report, and what each of the three lengths draws is worked out from `TEXT_DRAWN_AT` rather than
 * listed again here.
 */
const PARTS = [
  {
    id: 'p-open',
    heading: 'The short answer, and how far it fell short',
    text30: 'The opening of this report in thirty words, which is no part of the report body.',
    text120: 'The opening of this report at length, in words nobody cut out of the body of it.',
    covers: ['b-open'],
  },
  {
    id: 'p-open-work',
    heading: 'The work this round did not finish',
    text30: 'The rest of this report in thirty words, which is no part of the report body either.',
    text120: 'The rest of this report at length, again in words that appear nowhere in the body.',
    covers: ['b-head', 'b-part-open', 'b-finding', 'b-aside', 'b-todo'],
  },
] as const

const BELOW_FULL = ['label', 'title', 'gist', 'outline', 'sketch', 'digest'] as const

const stored = (text: string): unknown => ({
  text,
  madeFrom: { seq: 7, contentHash: 'ed42e7949e126b03' },
  writtenBy: 'agent',
  by: 'claude-code/short-form-writer',
  at: '2026-09-02 09:37:44',
})

/**
 * A REPORT WITH EVERY LENGTH BELOW FULL WRITTEN, WHICH IS THREE PLACES AND NOT ONE.
 *
 * The label is the one whole-record form still stored under `data.shortForms`; length 2 is the
 * `title` column and length 3 is the `summary` column, since criterion A14b of
 * design/pointing-reopened/ACCEPTANCE.md. This fixture wrote all three as stored forms until then.
 */
const ALL_SIX: DetailSource = {
  title: FORMS.title,
  summary: FORMS.gist,
  declaresShortForms: true,
  shortForms: {
    label: stored(FORMS.label),
    parts: {
      madeFrom: { seq: 7, contentHash: 'ed42e7949e126b03' },
      writtenBy: 'agent',
      by: 'claude-code/short-form-writer',
      at: '2026-09-02 09:37:44',
      parts: PARTS,
    },
  },
  body: { field: 'data.blocks', written: true },
}

/**
 * THE WORDS THE FORM WRITTEN FOR ONE LENGTH PUTS ON THE PAGE.
 *
 * One text at levels 1 to 3. At levels 4, 5 and 6 it is every part's heading, and at 5 and 6 the
 * part text that level draws under it — which is `TEXT_DRAWN_AT` in @shared/zoom.ts, read here
 * rather than written out a second time.
 */
function theFormFor(rung: (typeof BELOW_FULL)[number]): string[] {
  if (!isByPartLevel(rung)) return [FORMS[rung]]
  const which = TEXT_DRAWN_AT[rung]
  return PARTS.flatMap((part) => (which === null ? [part.heading] : [part.heading, part[which]]))
}

/** Every written form this record holds, at every length, so a test can ask what a length may not draw. */
const EVERY_FORM: string[] = [
  ...Object.values(FORMS),
  ...PARTS.flatMap((part) => [part.heading, part.text30, part.text120]),
]

/** The report body as a reader meets it, at one reading length, with nothing drawn above it. */
function page(rung: Rung, source: DetailSource = ALL_SIX): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: REPORT,
      layout: 'page',
      drawAt: rung,
      // NULL IS THE HONEST ANSWER HERE: this file has not read the record's links, so it announces
      // no tree rather than a shorter one. See `BlocksInRecord.wholeRecord`.
      inRecord: { recordId: 'rec-1', kind: 'report', stored: source, wholeRecord: null },
    }),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

// =============================================================== 1. the form, and nothing under it

describe('every reading length below Full draws its own written form', () => {
  it('draws the form written for the length, at each of the six', () => {
    for (const rung of BELOW_FULL) {
      for (const words of theFormFor(rung)) {
        expect(page(rung), `${rung} did not draw the form written for it`).toContain(words)
      }
    }
  })

  it('draws no other written form beside it', () => {
    for (const rung of BELOW_FULL) {
      const html = page(rung)
      const own = theFormFor(rung)
      for (const words of EVERY_FORM) {
        if (own.includes(words)) continue
        expect(html, `${rung} drew a form written for another length as well as its own`).not.toContain(words)
      }
    }
  })
})

describe('a reading length below Full draws nothing of the report under the form', () => {
  it('draws none of the report’s own writing, at any of the six', () => {
    for (const rung of BELOW_FULL) {
      const html = page(rung)
      for (const said of THE_REPORTS_OWN_WORDS) {
        expect(html, `${rung} drew a run of the report itself: ${said.slice(0, 40)}`).not.toContain(said)
      }
    }
  })

  it('draws no box, and no label naming one, at any of the six', () => {
    for (const rung of BELOW_FULL) {
      const html = page(rung)
      expect(html, `a box at ${rung}`).not.toContain('sb-outline')
      expect(html, `the rejected label is back at ${rung}`).not.toContain('Selected from the report')
      expect(html, `the label the box wore over the owner's own blocks is back at ${rung}`).not.toContain('addressed to you')
    }
  })
})

// =============================================================== 2. Full is the report

describe('Full draws the report, so nothing was hidden by any of this', () => {
  it('draws every run of the report’s own writing', () => {
    const html = page('full')
    for (const said of THE_REPORTS_OWN_WORDS) {
      expect(html, `Full stopped drawing: ${said.slice(0, 40)}`).toContain(said)
    }
  })

  it('draws no box at Full either', () => {
    expect(page('full')).not.toContain('sb-outline')
  })
})
