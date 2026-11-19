// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LEVEL NOBODY WROTE SAYS SO, AND NOTHING STANDS IN FOR IT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS THE TEST OF
 * ---------------------------------------------------------------------------------------------
 *
 * Where a report has no form at a level, do not show that level; write that it does not exist.
 * Criterion A14a of `design/pointing-reopened/ACCEPTANCE.md`.
 *
 * So a reading length below Full is one of two things and never a third:
 *
 *   1. IT DRAWS THE FORM SOMEBODY WROTE FOR THAT LENGTH — one text at levels 1 to 3, the report's
 *      parts at levels 4 to 6 — and nothing under it.
 *   2. IT DRAWS ONE LINE SAYING THAT LEVEL HAS NOT BEEN WRITTEN, naming the level in the words the
 *      level control uses, and nothing else.
 *
 * Full is the report itself and is never missing.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS FILE ASSERTED BEFORE, AND WHY EACH ONE WENT
 * ---------------------------------------------------------------------------------------------
 *
 * It asserted a THREE-WAY answer with a fourth drawing, and all four came out of the fallback the owner's
 * ruling ends:
 *
 *   *says nobody wrote one at every length that has none* expected `['title', 'unrecorded']` and
 *   `['outline', 'shorter']`, `['sketch', 'shorter']`, `['digest', 'shorter']` on a report with
 *   nothing written. `unrecorded` was the record's own title column standing at level 2; `shorter`
 *   was the form written for a shorter length standing at levels 4 to 6. Both are gone: every one
 *   of the six now reads `missing`.
 *
 *   *counts the summary column as the gist somebody wrote* asserted `{ standing: 'written', field:
 *   'summary' }` at level 3 on a report with a summary column and no gist form. Criterion A14a made
 *   that `missing`, on the ground that a column is not a form written for a length. Criterion A14b,
 *   the same day, made the column BE the length — title at most 15 words, summary 20 to 60 words — so the
 *   original assertion is back with the same field and a new reason. Reading length 2 is the
 *   record's own `title` and reading length 3 is its own `summary`; `data.shortForms.title` and
 *   `data.shortForms.gist` are retired keys that stay on disk and are read by nothing.
 *
 *   *still says a summary exists when the page above the body already drew it*, *says where this
 *   length's summary is when the page above the body drew it* and *adds no second note when this
 *   length's summary is drawn here* were about `drawnAbove` — the record page's heading drawing the
 *   title column and its lede drawing the summary column, so the body did not draw them twice. Only
 *   those two columns were ever drawn twice and neither is a form any more, so `drawnAbove` and the
 *   sentence it drew both went with them.
 *
 *   *says what stands at length 2 when nobody wrote a title short form* asserted the sentence
 *   *Nobody wrote a short form of this report at this length, so its title stands here instead.*
 *   Nothing STANDS IN at length 2 now: the title IS that length, so there is no substitution to
 *   describe and no sentence describing one.
 *
 *   The floor test accepted a length as non-silent when the form written for a SHORTER length was
 *   drawn at it. It now accepts only the form written for the length itself, or the line.
 *
 * ---------------------------------------------------------------------------------------------
 * AND THE ONE THAT IS A SEPARATE CLAIM: AVAILABILITY IS NOT COMPLETENESS
 * ---------------------------------------------------------------------------------------------
 *
 * *"Do not redefine fifteen historically complete Reports as incomplete merely because Semantic
 * Zoom infrastructure changed. Projection availability is separate from record completeness."*
 *
 * A report with no short forms at all is COMPLETE and has no form at any of its six shorter
 * lengths. The last describe block holds both halves of that in one assertion, so a hand that makes
 * `shortForms` required — the obvious way to "fix" the absence this file is about — goes red here.
 *
 * ---------------------------------------------------------------------------------------------
 * MUTATIONS
 * ---------------------------------------------------------------------------------------------
 *
 *   in `formsWrittenIn` in src/shared/reportrungs.ts, stop pushing the title column, and *says the
 *   record's own title IS the form written for level 2* goes red; stop pushing the summary column,
 *   and *says the record's own summary IS the form written for level 3* goes red.
 *
 *   in `readStoredShortForms` in src/shared/zoom.ts, read `SHORT_FORM_LEVELS` instead of
 *   `STORED_SHORT_FORM_LEVELS`, and *draws the column and never the retired form stored beside it*
 *   goes red.
 *
 *   in `formDrawnAt` in the same file, answer with the longest form at or below the length asked
 *   for, and the fallback is back: *draws no other level's form at a level with no form of its own*
 *   goes red.
 *
 *   in `WhatStandsAtThisLength` in src/web/components/SummaryBlocks.tsx, return null for a missing
 *   level, and *draws the line naming the level, at every level with no form* goes red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DetailSource, Rung } from '../src/shared/detail.ts'
import { RUNGS, levelLabel } from '../src/shared/detail.ts'
import { completenessOf } from '../src/shared/kinds.ts'
import { reportAt } from '../src/shared/reportrungs.ts'
import type { SummaryBlock } from '../src/shared/types.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

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

/**
 * A REPORT SHAPED LIKE THE OWNER'S OWN ROUND-TEN REPORT: containers, no top-level heading, and no
 * `summary` column. That record has none of the three short forms and no by-part structure, which
 * is what makes all six of its shorter reading lengths have no written form at all.
 */
const REPORT: SummaryBlock[] = [
  {
    id: 'b-open',
    type: 'text',
    heading: 'The short answer',
    text:
      'Half of what was planned was built, and every wave that finished came out with a claim ' +
      'narrower than the one it started with.',
  },
  {
    id: 'b-part',
    type: 'section',
    title: 'What is still open',
    blocks: [
      { id: 'b-lead', type: 'text', text: 'This part opens here.' },
      { id: 'b-todo', type: 'finding', text: 'Nobody has looked at the interface sentences.', state: 'todo' },
    ],
  },
]

/** The record as the resolver sees it, with nothing written at any length. */
function nothingWritten(): DetailSource {
  return {
    title: 'Round ten: what was built, what was not, and what is waiting on you',
    summary: null,
    declaresShortForms: true,
    body: { field: 'data.blocks', written: true },
  }
}

/**
 * The same record with the label written beside it.
 *
 * IT TOOK A LEVEL UNTIL 3 SEPTEMBER 2026, and the level was one of three. Criterion A14b left one
 * whole-record length stored under `data.shortForms` — the label — because reading length 2 is the
 * record's own `title` column and length 3 its own `summary`. Those two are written on the record,
 * which is what `withSummary` below does.
 */
function written(text: string): DetailSource {
  return {
    ...nothingWritten(),
    shortForms: { label: { text, madeFrom: { seq: 6, contentHash: 'aaaa' }, writtenBy: 'agent' } },
  }
}

/** The same record with a summary written on it, which IS reading length 3. */
function withSummary(text: string): DetailSource {
  return { ...nothingWritten(), summary: text }
}

/**
 * THE LEVELS THIS FIXTURE HAS NO FORM FOR. Five, and it was six until 3 September 2026: the
 * record's own title is reading length 2 and every record has one, so that length is never absent
 * on a real record. A report with a blank title is not a state this corpus has.
 */
const NO_FORM: Rung[] = ['label', 'gist', 'outline', 'sketch', 'digest']

/** The report body as a reader meets it, at one reading length, with nothing drawn above it. */
function page(stored: DetailSource, rung: Rung): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: REPORT,
      layout: 'page',
      drawAt: rung,
      // NULL IS THE HONEST ANSWER HERE: this file has not read the record's links, so it announces
      // no tree rather than a shorter one. See `BlocksInRecord.wholeRecord`.
      inRecord: { recordId: 'rec-1', kind: 'report', stored, wholeRecord: null },
    }),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/** The one line a level nobody wrote draws, in the words the level control uses for that level. */
const saysMissing = (rung: Rung): string => `${levelLabel(rung)} has not been written for this report.`

/** What the page drew, as a reader reads it: tags out, whitespace squeezed. */
const readable = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ============================================================ 1. what each length answers

describe('a reading length says whether a form for it was written', () => {
  it('says every level of a report with nothing written is missing', () => {
    const source = nothingWritten()
    const standings = RUNGS.map((rung) => [rung, reportAt(source, REPORT, rung).summary.standing] as const)
    expect(standings).toEqual([
      ['label', 'missing'],
      // THE RECORD'S OWN TITLE IS READING LENGTH 2, so this level is written on every real record.
      // It read `missing` for one day, between criterion A14a taking the column off the ladder and
      // criterion A14b making the column BE the level. Before both, it read the column as standing
      // in for a level nobody wrote.
      ['title', 'written'],
      // AND THIS REPORT HAS NO SUMMARY, so it has no reading length 3 and says so.
      ['gist', 'missing'],
      // NOBODY WROTE THE PARTS. The gist used to stand at all three of these; nothing does now.
      ['outline', 'missing'],
      ['sketch', 'missing'],
      ['digest', 'missing'],
      // The whole thing is the report itself, and it is never missing.
      ['full', 'written'],
    ])
  })

  it('says a form was written, and names the stored field it came from', () => {
    const answer = reportAt(written('Round ten, half built'), REPORT, 'label').summary
    expect(answer.standing).toBe('written')
    expect(answer.field).toBe('data.shortForms.label')
  })

  /**
   * REVERSED TWICE IN TWO DAYS. It asserted the column WAS the form written for level 3; criterion
   * A14a made it *the summary column is not the form written for level 3*, expecting `missing`;
   * criterion A14b, the same day, made the column BE that level, with a summary of 20 to 60 words.
   * `field` is the bare word `summary`, which is the path that column's characters are stored under.
   */
  it('says the record’s own summary IS the form written for level 3', () => {
    const source = withSummary('The one line this report comes down to, and every word of it was written here.')
    expect(reportAt(source, REPORT, 'gist').summary).toEqual({
      rung: 'gist',
      standing: 'written',
      field: 'summary',
      // A COLUMN CARRIES NO WRITER OF ITS OWN. Who last changed it is in the revision ledger, which
      // this file cannot reach; `GET /api/records/:id/short-forms` reads it there.
      by: null,
    })
    expect(reportAt(source, REPORT, 'gist').lines.map((one) => [one.text, one.field])).toEqual([
      ['The one line this report comes down to, and every word of it was written here.', 'summary'],
    ])
  })

  /** And the record's own title column IS the form written for level 2, on the same criterion. */
  it('says the record’s own title IS the form written for level 2', () => {
    const answer = reportAt(nothingWritten(), REPORT, 'title')
    expect(answer.summary.standing).toBe('written')
    expect(answer.summary.field).toBe('title')
    expect(answer.lines.map((one) => one.text)).toEqual(['Round ten: what was built, what was not, and what is waiting on you'])
  })

  /**
   * THE FALLBACK, ASSERTED GONE. A report with a label and nothing else drew that label at every
   * length above it, and the page said nothing about which length the words were written for.
   */
  it('draws no other level’s form at a level with no form of its own', () => {
    const source = written('Round ten, half built')
    for (const rung of NO_FORM.filter((one) => one !== 'label')) {
      expect(reportAt(source, REPORT, rung).lines, `${rung} drew a form written for another length`).toEqual([])
      expect(reportAt(source, REPORT, rung).summary.standing, `${rung}`).toBe('missing')
    }
  })
})

// ============================================================ 2. what the page draws

describe('the report body draws one line saying the level has not been written', () => {
  it('draws the line naming the level, at every level with no form', () => {
    for (const rung of NO_FORM) {
      const text = readable(page(nothingWritten(), rung))
      expect(text, `${rung} says nothing about the level nobody wrote`).toContain(saysMissing(rung))
    }
  })

  it('names the level in the words the level control uses, and no other level’s words', () => {
    for (const rung of NO_FORM) {
      const text = readable(page(nothingWritten(), rung))
      for (const other of RUNGS) {
        if (other === rung) continue
        expect(text, `${rung} drew the line for ${other}`).not.toContain(saysMissing(other))
      }
    }
  })

  /**
   * THE TITLE IS EXCLUDED FROM THE SECOND ASSERTION AND NOT FROM THE FIRST, and the difference is
   * the point. No length below Full draws a block of the report. Reading length 2 DOES draw the
   * record's own title, because that column is what reading length 2 is since 3 September 2026.
   */
  it('is the whole of what the length draws, with none of the report under it', () => {
    for (const rung of RUNGS.filter((one) => one !== 'full')) {
      expect(reportAt(nothingWritten(), REPORT, rung).blocks, `${rung}`).toEqual([])
      const text = readable(page(nothingWritten(), rung))
      expect(text, `${rung} drew the report's own prose`).not.toContain('every wave that finished came out with a claim')
      if (rung === 'title') continue
      expect(text, `${rung} drew the record's own title`).not.toContain('Round ten: what was built')
    }
  })

  /** The sentences the fallback drew are on no page at any length. */
  it('draws none of the sentences the fallback drew', () => {
    const GONE = [
      'No summary of this length was written for this report.',
      'Nobody wrote a short form of this report at this length, so its title stands here instead.',
      'The summary standing at this length is drawn above this report',
      'What follows is selected from the report, not summarised.',
    ]
    for (const rung of RUNGS) {
      const text = readable(page(nothingWritten(), rung))
      for (const said of GONE) expect(text, `${rung} still says: ${said}`).not.toContain(said)
    }
  })

  /**
   * THE FLOOR UNDER ALL OF IT. Whatever the length, the reader gets the form written for it or the
   * line saying nobody wrote one. This is the fault the whole problem exists for: four of the six
   * lengths of the owner's round-ten report drew nothing at all.
   */
  it('never draws a length with nothing on it', () => {
    for (const rung of RUNGS) {
      const text = readable(page(nothingWritten(), rung))
      const drawing = reportAt(nothingWritten(), REPORT, rung)
      // A LENGTH SAYS SOMETHING IN ONE OF THREE WAYS: the line saying nobody wrote it, the words of
      // the form written for it, or — at Full — the report itself. The middle one is read off the
      // drawing rather than guessed, because the words at length 2 are the record's own title and
      // a test that spelled them here would be the fixture written twice.
      const drew = drawing.lines[0]?.text ?? null
      const said =
        drawing.summary.standing === 'missing'
          ? text.includes(saysMissing(rung))
          : drew === null
            ? text.includes('every wave that finished came out with a claim')
            : text.includes(drew)
      expect(said, `${rung} draws none of the report and says nothing about why`).toBe(true)
    }
  })
})

describe('a length whose form somebody wrote draws it, and says nothing about a missing one', () => {
  /**
   * THE WORDS THIS BLOCK IS ABOUT WERE A STORED GIST UNTIL 3 SEPTEMBER 2026. Reading length 3 is
   * the record's own `summary` column now (criterion A14b), so the fixture puts them there. What is
   * being checked did not change: a length with words drawn at it draws them, marks them as written
   * for that length, and says nothing about a missing one.
   */
  const SUMMARY = 'The summary somebody wrote on this record, which is no part of the report itself.'

  /**
   * THE MARK IS IN THE MARKUP AND NOT IN WORDS ON THE SCREEN. It read *Written for this length*,
   * under the form. That line is not for a person, so
   * `data-summary` is what says the words were written for the length being read.
   */
  it('draws the written form and records it as written for this length', () => {
    const html = page(withSummary(SUMMARY), 'gist')
    expect(html).toContain(SUMMARY)
    expect(html, 'the form is drawn without saying it is one').toContain('data-summary="written"')
    expect(html, 'the writer line is back on the page').not.toContain('Written for')
  })

  it('says nothing about a missing level at that length', () => {
    const text = readable(page(withSummary(SUMMARY), 'gist'))
    expect(text).not.toContain(saysMissing('gist'))
    expect(page(withSummary(SUMMARY), 'gist')).not.toContain('data-summary="missing"')
  })

  it('draws it with nothing under it, because nothing is drawn under a written form', () => {
    const html = page(withSummary(SUMMARY), 'gist')
    expect(html).toContain(SUMMARY)
    expect(html, 'the box of copied lines is back under the form').not.toContain('sb-outline')
    expect(reportAt(withSummary(SUMMARY), REPORT, 'gist').blocks).toEqual([])
  })

  /** One length written does not answer for the others, and the others still say so. */
  it('still says nobody wrote level 1, on a report that has a summary', () => {
    expect(readable(page(withSummary(SUMMARY), 'label'))).toContain(saysMissing('label'))
  })
})

// ============================================================ 2b. and no length is silent

/**
 * NO READING LENGTH SAYS NOTHING ABOUT ITSELF.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FAULT THIS BLOCK EXISTS FOR, MEASURED
 * ---------------------------------------------------------------------------------------------
 *
 * On 30 August 2026, against all 18 reports in the live corpus: reading length 2 carried no
 * `data-summary` element and no absence statement on every one of them, and reading length 3
 * carried neither on 12 of them. The answer had three standings and two drawings, so one of them
 * came out as silence. There are two standings and two drawings now, which is what makes silence
 * unreachable rather than merely unobserved.
 */
describe('every reading length says what stands at it', () => {
  /**
   * EVERY DRAWING THIS COMPONENT MAKES AT A LENGTH BELOW FULL CARRIES ONE OF THESE.
   *
   * The two marks are the two standings. `sb-parts` is the third thing on the list because at
   * levels 4, 5 and 6 the form written for the length IS the report's parts: they are drawn as a
   * block of their own with no opening line above them, so a length that drew them carries no
   * `data-summary` mark and is not silent either.
   */
  const SAYS_SOMETHING = ['data-summary="written"', 'data-summary="missing"', 'class="sb-parts"']

  /**
   * THE SIX SHORTER LENGTHS, AND FULL IS NOT ONE OF THEM ON PURPOSE. Full is the report itself, so
   * there is no form of it that could be missing and nothing for a note to point at. The test below
   * this pair holds that, so leaving Full out here is a stated exclusion and not a gap.
   */
  const SHORTER = RUNGS.filter((rung) => rung !== 'full')

  it('says something at every shorter length on a report with nothing written', () => {
    for (const rung of SHORTER) {
      const html = page(nothingWritten(), rung)
      expect(SAYS_SOMETHING.some((mark) => html.includes(mark)), `${rung} says nothing about itself`).toBe(true)
    }
  })

  it('draws no such note at Full, because the report itself is what that length is', () => {
    const html = page(nothingWritten(), 'full')
    expect(html, 'Full says a level is missing').not.toContain('data-summary="missing"')
  })

  it('says something at every shorter length on a report with every form written', () => {
    const everything: DetailSource = {
      ...nothingWritten(),
      // THE RECORD'S OWN SUMMARY IS READING LENGTH 3 and its own title is length 2, so a report
      // with every length written carries both columns and one stored form. It used to carry three
      // stored forms and this column was beside them, unread.
      summary: 'The one line this report comes down to, written on the record and read at length three.',
      shortForms: {
        label: {
          text: 'The label somebody wrote, which is no part of the report.',
          madeFrom: { seq: 6, contentHash: 'aaaa' },
          writtenBy: 'agent',
        },
        parts: {
          madeFrom: { seq: 6, contentHash: 'aaaa' },
          writtenBy: 'agent',
          parts: [
            {
              id: 'p-1',
              heading: 'The whole of this report in one sentence',
              text30: 'This part of the report in thirty words, in words the report itself does not hold.',
              text120: 'This part of the report at length, again in words the report itself does not hold.',
              covers: ['b-open', 'b-part'],
            },
          ],
        },
      },
    }
    for (const rung of SHORTER) {
      const html = page(everything, rung)
      expect(SAYS_SOMETHING.some((mark) => html.includes(mark)), `${rung} says nothing about itself`).toBe(true)
      expect(html, `${rung} says a level is missing when it is written`).not.toContain('data-summary="missing"')
    }
  })
})

// ============================================================ 2c. the record's own title

/**
 * READING LENGTH 2 DRAWS THE RECORD'S OWN TITLE, AND A STORED TITLE FORM IS DRAWN BY NOTHING.
 *
 * WHAT THIS BLOCK SAID BEFORE, AND WHY. It read *a written title short form is what reading length
 * 2 draws*: `data.shortForms.title` had been storable since the write door shipped and three
 * reports in this corpus hold one. Then the ladder was settled — title at most 15 words
 * — and reading length 2 became the record's own `title` column, criterion A14b. The stored key is
 * retired: what is on disk stays there, `readStoredShortForms` does not read it back, and a new
 * write to it is refused. So the case is kept, reversed: the column is drawn and the stored form
 * beside it is not.
 */
describe('the record’s own title is what reading length 2 draws', () => {
  const RECORD_TITLE = 'Round ten: what was built, what was not, and what is waiting on you'
  const STORED_FORM = 'Every wave checked; half the plan never built'

  /** The same record with a retired title form on disk beside its own title column. */
  const withARetiredForm: DetailSource = {
    ...nothingWritten(),
    shortForms: { title: { text: STORED_FORM, madeFrom: { seq: 6, contentHash: 'aaaa' }, writtenBy: 'agent' } },
  }

  it('draws the column and records it as written for this length', () => {
    const html = page(nothingWritten(), 'title')
    expect(html).toContain(RECORD_TITLE)
    expect(html).toContain('data-summary="written"')
    expect(html, 'the writer line is back on the page').not.toContain('Written for')
  })

  it('names the column it came from, which is the bare word the record stores it under', () => {
    const answer = reportAt(nothingWritten(), REPORT, 'title').summary
    expect(answer).toEqual({
      rung: 'title',
      standing: 'written',
      field: 'title',
      // A COLUMN CARRIES NO WRITER OF ITS OWN. Who last changed it is in the revision ledger.
      by: null,
    })
  })

  it('draws the column and never the retired form stored beside it', () => {
    const html = page(withARetiredForm, 'title')
    expect(html).toContain(RECORD_TITLE)
    expect(html, 'the retired title form is drawn').not.toContain(STORED_FORM)
    expect(reportAt(withARetiredForm, REPORT, 'title').summary.field).toBe('title')
  })

  it('says nothing about a missing level at that length', () => {
    const html = page(nothingWritten(), 'title')
    expect(readable(html)).not.toContain(saysMissing('title'))
    expect(html).not.toContain('data-summary="missing"')
  })
})

// ============================================================ 3. availability is not completeness

/**
 * A REPORT WITH NO SHORT FORMS IS COMPLETE, AND NONE OF ITS SHORTER LENGTHS HAS A FORM.
 *
 * Both in one test on purpose. Split into two, a hand that made `shortForms` required would leave
 * one of them passing and the pair would stop saying what it is here to say.
 */
describe('whether a form exists and whether the record is complete are two questions', () => {
  const DATA = { for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`, date: '2026-08-27', blocks: REPORT }

  it('holds both answers at once on a report that has no short forms', () => {
    expect(completenessOf('report', DATA), 'a report with no short forms is being called incomplete').toEqual([])
    const missing = RUNGS.filter((rung) => reportAt(nothingWritten(), REPORT, rung).summary.standing === 'missing')
    expect(missing, 'this report has a form at every length, so the pair proves nothing').not.toEqual([])
  })

  it('does not change what the record needs when a form is written', () => {
    const before = completenessOf('report', DATA)
    const after = completenessOf('report', {
      ...DATA,
      shortForms: { label: { text: 'A label.', madeFrom: { seq: 6, contentHash: 'aaaa' }, writtenBy: 'agent' } },
    })
    expect(after).toEqual(before)
  })
})
