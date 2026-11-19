// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ABSTRACT IS WHAT A READING LENGTH SAYS, AND THE PAGE IS SET SO A READER CAN SEE THAT.
 *
 * ---------------------------------------------------------------------------------------
 * THE SENTENCE THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * Every advertised level is one short abstract that says what the report is about. Detail is what
 * Full is for. `design/problem-02/ACCEPTANCE.md` §C-2Sept is the criterion, changed before this.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS AN INDEPENDENT VERIFIER FOUND, AND WHICH CASE HOLDS EACH
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE LINE UNDER THE ABSTRACT SAID THE WRONG THING. *Selected from the report, not summarised*
 *    was drawn under the abstract on 105 of 120 report-level rows. At reading lengths 1 to 3 what
 *    is left under the abstract is not a selection: it is the blocks their author addressed to the
 *    owner, by an earlier decision. So the label says what the rank says — *addressed
 *    to you* — and where nothing is promoted, nothing is drawn at all.
 *
 * 2. THE TRAIL. The body drew every written form at or below the length asked for, so reading
 *    length 6 drew six stacked forms of one report. One form is drawn now: the one written for the
 *    length, or the nearest shorter one written.
 *
 * 3. THE TYPOGRAPHY. The abstract was set as a caption and the substrate as body text. Measured at
 *    reading length 1 on 2 September 2026: four small grey capitalised words under a caption in the
 *    same size and colour, above a boxed block of 115 words of the report's own prose in full-size
 *    black type. A reader took the substrate for the content.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE STYLESHEET IS READ AS TEXT
 * ---------------------------------------------------------------------------------------
 *
 * The runner has no layout engine, so there is nothing to ask what size a line came out at. The
 * rules are read out of the exported stylesheet and matched by selector, which is what
 * `tests/marks-at-rest.test.ts` does for the mark layer and what `tests/report-document.test.ts`
 * does for the report's own headings.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { levelLabel, type DetailSource, type Rung } from '../src/shared/detail.ts'
import { partRegionId } from '../src/shared/regions.ts'
import { BY_PART_LEVELS } from '../src/shared/zoom.ts'
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

const OPENS_WITH =
  'Half of what was planned was built, and every wave that finished came out with a claim narrower ' +
  'than the one it started with.'
const FOR_THE_OWNER = 'Three proposals are waiting on you, and two of them are the same question.'

/** A report carrying one block of every rank the short lengths used to promote, and one gate. */
const WITH_A_GATE: SummaryBlock[] = [
  { id: 'b-open', type: 'text', text: OPENS_WITH },
  { id: 'b-gate', type: 'text', text: FOR_THE_OWNER, forOwner: true },
  {
    id: 'b-part',
    type: 'section',
    title: 'What is still open',
    blocks: [
      { id: 'b-work', type: 'finding', text: 'A finding nobody finished.', state: 'failed' },
      { id: 'b-done', type: 'finding', text: 'A finding that is finished.', state: 'done' },
      { id: 'b-aside', type: 'callout', tone: 'warning', text: 'Set apart by its author.' },
    ],
  },
]

/** The same report with nothing addressed to the owner, which is 17 of the 20 in the corpus. */
const NO_GATE: SummaryBlock[] = WITH_A_GATE.filter((block) => block.id !== 'b-gate')

/**
 * THE ONE WHOLE-RECORD FORM STILL STORED BESIDE A RECORD, and the two that are the record's own.
 *
 * `FORMS` held all three until 3 September 2026 and every one of them was written into
 * `data.shortForms`. By a decision that day (a title of at most 15 words, a summary of 20 to 60) reading length 2
 * became the record's own `title` column and length 3 its own `summary`, so only the label is
 * written beside the record. Criterion A14b. The two below are the columns, and the fixture carries
 * them as columns rather than as forms, which is the whole difference this file now measures.
 */
const FORMS = {
  label: 'Round ten, half built',
} as const

const RECORD_TITLE = 'Round ten: what was built, what was not, and what is waiting on you'
const RECORD_SUMMARY = 'Round ten built 120 of 221 steps, and your queue holds twenty-seven proposals.'

/**
 * THE FORM WRITTEN FOR READING LENGTHS 4, 5 AND 6, WHICH IS THE REPORT'S PARTS.
 *
 * Those three seats held three more whole-record texts — `card`, `brief` and `account` — until
 * 2 September 2026. The owner retired all three and put the report's own parts there: a heading per
 * part at level 4, the heading with a 30-word text under it at level 5, and with a 120-word text at
 * level 6. So a report with a form at every length writes this structure rather than three texts,
 * and every block of the report is covered by exactly one part.
 */
const PARTS = [
  {
    id: 'p-open',
    heading: 'What the round set out to do, and what stopped it',
    text30: 'The opening of the report in thirty words, written for this length and cut from nothing.',
    text120: 'The opening of the report at length, again written for the length rather than taken out of the body.',
    covers: ['b-open', 'b-gate'],
  },
  {
    id: 'p-open-work',
    heading: 'The work this round left unfinished, counted',
    text30: 'The rest of the report in thirty words, and no run of it appears in the body.',
    text120: 'The rest of the report at length, in characters that are no part of the report body either.',
    covers: ['b-part'],
  },
] as const

const stored = (text: string): unknown => ({
  text,
  madeFrom: { seq: 7, contentHash: 'ed42e7949e126b03' },
  writtenBy: 'agent',
  by: 'claude-code/short-form-writer',
  at: '2026-09-02 09:37:44',
})

/** A report with every length below Full written, which is every report in the corpus today. */
const ALL_SIX: DetailSource = {
  title: RECORD_TITLE,
  summary: RECORD_SUMMARY,
  declaresShortForms: true,
  shortForms: {
    ...Object.fromEntries(Object.entries(FORMS).map(([level, text]) => [level, stored(text)])),
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

/** The report body as a reader meets it, at one reading length, with nothing drawn above it. */
function page(blocks: readonly SummaryBlock[], rung: Rung, source: DetailSource = ALL_SIX): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks,
      layout: 'page',
      drawAt: rung,
      inRecord: { recordId: 'rec-1', kind: 'report', stored: source },
    } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

const SELECTED = 'Selected from the report, not summarised'
/** The words the box used to put beside a line its author had addressed to the owner. */
const ADDRESSED = 'addressed to you'

// =============================================================== 1. nothing under the abstract

/**
 * NOTHING UNDER THE WRITTEN FORM, DRAWN. Nothing at all is under the written form at
 * any reading length below Full — no lines copied from the report, no block drawn whole, and no
 * label over either. The box at levels 4, 5 and 6 was taken out whole rather than relabelled,
 * because an excerpt hides part of the facts and misleads. §C-3Sept of
 * `design/problem-02/ACCEPTANCE.md`; criterion A8 of `design/pointing-reopened/ACCEPTANCE.md`.
 *
 * THIS SECTION USED TO SAY THE OPPOSITE AT LENGTHS 4, 5 AND 6, which is why the two labels are still
 * named here by their exact words: a box coming back would put one of them on the page again, and a
 * test that only counted elements would go green with the words back under a new class.
 */
describe('a length below Full draws the written form and nothing under it', () => {
  const BELOW_FULL = ['label', 'title', 'gist', 'outline', 'sketch', 'digest'] as const

  it('draws no box and no label at any length, on a report with a block addressed to the owner', () => {
    for (const rung of BELOW_FULL) {
      const html = page(WITH_A_GATE, rung)
      expect(html, `the box the person could not get rid of is back at ${rung}`).not.toContain(FOR_THE_OWNER)
      expect(html, `a label calling the lines a selection at ${rung}`).not.toContain(SELECTED)
      expect(html, `a label calling the lines the person's own at ${rung}`).not.toContain(ADDRESSED)
      expect(html, `a box at ${rung}`).not.toContain('class="sb-outline"')
      expect(html, `a line of a box at ${rung}`).not.toContain('class="sb-outline-line"')
    }
  })

  it('draws none of the report’s own writing at any length below Full', () => {
    for (const rung of BELOW_FULL) {
      const html = page(WITH_A_GATE, rung)
      for (const block of WITH_A_GATE) {
        const text = 'text' in block ? block.text : null
        if (typeof text !== 'string' || text === '') continue
        expect(html, `${rung} drew a block of the report: ${text.slice(0, 40)}`).not.toContain(text)
      }
    }
  })

  it('draws the report itself at Full, which is where the detail is', () => {
    const html = page(WITH_A_GATE, 'full')
    expect(html, 'Full stopped drawing the block addressed to the owner').toContain(FOR_THE_OWNER)
    expect(html, 'Full drew a box that is not the report').not.toContain('class="sb-outline"')
  })

  /**
   * CHANGED 3 SEPTEMBER 2026, and what it said before is named rather than quietly replaced. It
   * asserted the sentence *No summary of this length was written for this report.* — which said
   * that a form was absent without saying WHICH level was absent, and was drawn at lengths where a
   * form written for a shorter one was on the screen above it. Criterion A14a replaces it with one
   * line naming the level in the level control's own words.
   */
  it('says the level has not been written, naming it, and claims nothing about what follows', () => {
    // AND NO SUMMARY EITHER, because the summary column IS reading length 3 since 3 September 2026.
    // A fixture that kept it would be a report whose length 3 is written, and this case is about
    // one nobody wrote.
    const nothingWritten: DetailSource = { ...ALL_SIX, shortForms: {}, summary: null }
    const html = page(NO_GATE, 'gist', nothingWritten)
    expect(html).toContain(`${levelLabel('gist')} has not been written for this report.`)
    expect(html, 'the sentence that named no level is back').not.toContain(
      'No summary of this length was written for this report.',
    )
    expect(html, 'the page says words follow the statement when none do').not.toContain(
      'What follows is selected from the report, not summarised.',
    )
  })
})

// =============================================================== 2. one abstract, the asked one

describe('the abstract drawn is the one written for the length asked for, and only that one', () => {
  it('draws exactly one abstract at every length below Full, and none at Full', () => {
    for (const rung of ['label', 'title', 'gist', 'outline', 'sketch', 'digest'] as const) {
      // ONE ABSTRACT, IN WHICHEVER OF ITS TWO SHAPES THE LENGTH WRITES IT. Lengths 1 to 3 draw one
      // line. Lengths 4, 5 and 6 are written by part, so their one abstract is the report's parts,
      // drawn as one block: counting the line alone would read those three as drawing no abstract.
      const html = page(WITH_A_GATE, rung)
      const drawn = [...html.matchAll(/<p class="sb-open-line"/g), ...html.matchAll(/<div class="sb-parts"/g)]
      expect(drawn, `${rung} drew ${String(drawn.length)} forms of one report`).toHaveLength(1)
    }
    // FULL DRAWS NONE. Nobody writes a form of the whole report, so the line at Full was the sixth
    // length's form — a written summary standing where the report's own first paragraph goes. The
    // mark that said so left the page on 2 September 2026, so the line went with it.
    const atFull = page(WITH_A_GATE, 'full')
    expect(
      [...atFull.matchAll(/<p class="sb-open-line"/g)],
      'a written form is drawn above the report at Full',
    ).toHaveLength(0)
    expect([...atFull.matchAll(/<div class="sb-parts"/g)], 'the parts are drawn at Full').toHaveLength(0)
  })

  it('draws the record’s own summary at length 3, and none of the shorter forms above it', () => {
    const html = page(WITH_A_GATE, 'gist')
    expect(html).toContain(RECORD_SUMMARY)
    expect(html, 'the trail of shorter forms is still drawn').not.toContain(FORMS.label)
    expect(html, 'the trail of shorter forms is still drawn').not.toContain(RECORD_TITLE)
    for (const part of PARTS) {
      expect(html, 'a longer form was lifted into a shorter length').not.toContain(part.heading)
    }
    // THE STORED PATH IS THE BARE WORD `summary`, WHICH IS THE COLUMN. It was
    // `data.shortForms.gist` until 3 September 2026, and that key is retired.
    expect(html).toContain('data-drawn-from="summary"')
  })

  it('draws the length’s own form at each of the other lengths too', () => {
    const OWN: [Rung, string, string][] = [
      ['label', FORMS.label, 'data.shortForms.label'],
      ['title', RECORD_TITLE, 'title'],
      ['gist', RECORD_SUMMARY, 'summary'],
    ]
    for (const [level, text, field] of OWN) {
      const html = page(WITH_A_GATE, level)
      expect(html, `${level} did not draw the form written for it`).toContain(text)
      expect(html, `${level} does not say where the words came from`).toContain(`data-drawn-from="${field}"`)
      // AND IT SAYS SO IN THE MARKUP RATHER THAN IN WORDS ON THE SCREEN. The words *Written for this
      // length by …* left the page; `data-summary="written"` is what a test reads now.
      expect(html, `${level} did not record that the line was written for it`).toContain('data-summary="written"')
      expect(html, `${level} put the writer line back on the page`).not.toContain('Written for')
    }
    // AND THE THREE LENGTHS WRITTEN BY PART, whose own form is the report's parts rather than one
    // text. Each of the three draws every part's heading — the same sentence at all three, which is
    // what makes a part the same part as the reader moves — and each part is drawn on its own
    // stored region under `data.shortForms.parts`, which is what says where the words came from.
    for (const rung of BY_PART_LEVELS) {
      const html = page(WITH_A_GATE, rung)
      for (const part of PARTS) {
        expect(html, `${rung} did not draw the part "${part.id}" somebody wrote`).toContain(part.heading)
        // THE REGION IS WRITTEN INTO AN ADDRESS, SO IT ARRIVES ENCODED. `declaredAttributes` puts
        // the id into `data-target`, where `[` and `#` are percent-escaped.
        expect(html, `${rung} drew the part "${part.id}" on no stored path`).toContain(
          encodeURIComponent(partRegionId(part.id)),
        )
      }
      expect(html, `${rung} put the writer line back on the page`).not.toContain('Written for')
    }
  })

  /**
   * A REPORT WITH ONLY A LABEL AND A GIST, WHICH IS THE SHAPE A REPORT FILED WITHOUT ITS FORMS HAS.
   *
   * WHAT THIS ASSERTED UNTIL 3 SEPTEMBER 2026, under the name *falls back to the nearest shorter
   * written form, and does not call it this length's own*: that reading length 5 on this record drew
   * the GIST — `expect(html).toContain(FORMS.gist)` — unmarked, carrying `data-rung="gist"` so a
   * reader could tell which length had written the words. The owner ended that fallback (criterion
   * A14a). Every level with no form of its own now draws one line naming itself, and the gist is
   * drawn at level 3 alone.
   */
  const LABEL_AND_GIST: DetailSource = {
    ...ALL_SIX,
    shortForms: { label: stored(FORMS.label) },
  }

  it('draws the label at level 1 and the record’s own summary at level 3', () => {
    expect(page(WITH_A_GATE, 'label', LABEL_AND_GIST)).toContain(FORMS.label)
    expect(page(WITH_A_GATE, 'label', LABEL_AND_GIST)).toContain('data-summary="written"')
    expect(page(WITH_A_GATE, 'gist', LABEL_AND_GIST)).toContain(RECORD_SUMMARY)
    expect(page(WITH_A_GATE, 'gist', LABEL_AND_GIST)).toContain('data-summary="written"')
  })

  /**
   * CHANGED AGAIN ON 3 SEPTEMBER 2026 BY CRITERION A14b, and what it asserted the hour before is
   * named here rather than quietly replaced. It read *draws one line naming Level 2 at level 2, and
   * neither the title nor the label*: the record's own title column was not a form written for that
   * length, so level 2 said it had not been written. The column IS that length now, so level 2
   * draws the title and it is the LABEL that may not stand there.
   */
  it('draws the record’s own title at level 2, and never the label written for level 1', () => {
    const html = page(WITH_A_GATE, 'title', LABEL_AND_GIST)
    expect(html).toContain(RECORD_TITLE)
    expect(html, 'the label written for level 1 stands at level 2').not.toContain(FORMS.label)
    expect(html, 'the level is not marked as written').toContain('data-summary="written"')
    expect(html, 'a level with words in it says it has not been written').not.toContain(
      `${levelLabel('title')} has not been written for this report.`,
    )
  })

  it('draws one line naming the level at levels 4, 5 and 6, and never the summary', () => {
    for (const rung of BY_PART_LEVELS) {
      const html = page(WITH_A_GATE, rung, LABEL_AND_GIST)
      expect(html, `${rung} does not name itself`).toContain(`${levelLabel(rung)} has not been written for this report.`)
      expect(html, `${rung} drew the record’s own summary`).not.toContain(RECORD_SUMMARY)
      expect(html, `${rung} says which length some other words came from`).not.toContain('data-rung="gist"')
    }
  })

  it('draws the report itself at Full, whatever is missing below it', () => {
    const html = page(WITH_A_GATE, 'full', LABEL_AND_GIST)
    expect(html, 'Full stopped drawing the report').toContain(FOR_THE_OWNER)
    expect(html, 'Full says a level is missing').not.toContain('data-summary="missing"')
  })
})

// =============================================================== 3. the abstract is set as content

describe('the abstract is set as the level’s own text and never as a caption', () => {
  /**
   * Every rule in the stylesheet whose selector names the abstract line, with its declarations.
   *
   * THE COMMENTS COME OUT FIRST. Most of this stylesheet is prose explaining it, and a comment sits
   * between one rule's closing brace and the next rule's selector — so a match that started at the
   * brace would read the prose as part of the selector, and the words in the prose as declarations.
   */
  function rulesFor(selector: string): { selector: string; body: string }[] {
    const css = sb.SUMMARY_CSS.replace(/\/\*[\s\S]*?\*\//g, '\n')
    const out: { selector: string; body: string }[] = []
    for (const found of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const head = (found[1] ?? '').trim()
      if (!head.includes(selector)) continue
      out.push({ selector: head, body: found[2] ?? '' })
    }
    return out
  }

  it('reads the rules it is about, so an empty search cannot pass quietly', () => {
    expect(rulesFor('.sb-open-line').length, 'no rule for the abstract line was found at all').toBeGreaterThan(1)
  })

  it('sets the abstract in the reading colour at the reading line height', () => {
    const base = rulesFor('.sb-open-line').find((rule) => rule.selector === '.sb-open-line')
    expect(base, 'there is no plain rule for the abstract line').toBeDefined()
    expect(base?.body, 'the abstract is not set in the reading colour').toContain('color: var(--text)')
    expect(base?.body, 'the abstract is not set at the reading line height').toContain('line-height: var(--lh-body)')
  })

  it('never sets the abstract as a caption, at any length', () => {
    for (const rule of rulesFor('.sb-open-line')) {
      expect(rule.body, `${rule.selector} sets the abstract in capitals`).not.toContain('uppercase')
      expect(rule.body, `${rule.selector} sets the abstract in the quietest text colour`).not.toContain('var(--text-3)')
      expect(rule.body, `${rule.selector} sets the abstract at the caption size`).not.toContain('var(--fs-1)')
    }
  })

  /**
   * THE MARK IS GONE FROM THE PAGE, AND THIS IS WHAT IT USED TO CHECK. It read *Written for this
   * length by claude-code/short-form-writer*, under the words, at the caption size and in the quiet
   * colour. It is not for a person to read, so this case asserts its
   * absence, and who wrote a form is in the composer on right-click.
   */
  it('draws no mark under the abstract saying who wrote it', () => {
    expect(rulesFor('.sb-open-why'), 'the mark has a stylesheet rule again').toEqual([])
    for (const rung of ['label', 'title', 'gist', 'outline', 'sketch', 'digest'] as const) {
      expect(page(WITH_A_GATE, rung), `the writer line is back at ${rung}`).not.toContain('Written for')
    }
  })
})
