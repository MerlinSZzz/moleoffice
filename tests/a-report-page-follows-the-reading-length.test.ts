// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WHOLE RECORD PAGE FOLLOWS THE READING LENGTH, NOT ONLY THE REPORT BODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND BY WHOM
 * ---------------------------------------------------------------------------------------
 *
 * A second independent verifier read the record page after the third build of POINTING, on
 * 2 September 2026, and found two things the report body being right had hidden:
 *
 *   1. AT EVERY READING LENGTH INCLUDING 1, the *Shorter forms of this report* panel drew all six
 *      stored forms in full — about 1,060 words of the same report under an abstract of three. The
 *      body was saying one short thing and the page was saying the report six times.
 *   2. AT FULL, the body drew the account form as the report's own first paragraph with no mark
 *      saying what it was. Full has no written form of its own, so the line above the report is the
 *      longest form somebody wrote.
 *
 * THE PANEL WAS FIRST MADE TO FOLLOW THE READING LENGTH AND THEN REMOVED, because the
 * shorter form it drew repeats what the
 * body shows and it goes. The line above the report at Full went with it, for the reason section 2
 * gives. So what is left in this file is the report BODY at each length, which is the surface both
 * findings were really about. Criteria A10, A11 and A13 are retired; §C-3Sept of
 * `design/problem-02/ACCEPTANCE.md`.
 *
 * The rule behind all of it: every
 * advertised length is one short abstract, and detail is what Full is for.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS RENDERS
 * ---------------------------------------------------------------------------------------
 *
 * The claim is about what a person reads, so the body is rendered and read. The record's forms are
 * written through the product's own server, so the record this file measures is one a browser could
 * really be handed.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ShortFormsReading } from '../src/server/lib/zoom.ts'
import { levelLabel, type DetailSource, type Rung } from '../src/shared/detail.ts'
import { shortFormRegionId } from '../src/shared/regions.ts'
import { BY_PART_LEVELS, SHORT_FORM_LEVELS, TEXT_DRAWN_AT, isByPartLevel } from '../src/shared/zoom.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

const WORKSPACE = 'default'

const HUMAN = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

const THE_WRITER = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code/short-form-writer',
  'x-mole-office-session': 'sess-follows-the-length',
  'x-mole-office-workspace': WORKSPACE,
}

type RecordPageModule = typeof import('../src/web/pages/RecordPage.tsx')
type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let t: TestDb
let app: FastifyInstance
let page: RecordPageModule
let sb: SummaryBlocksModule
let reportId: string
let forms: ShortFormsReading

/** Everything the two page modules read at import time. Nothing here is under test. */
function shimTheBrowser(): void {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  }
  const listeners = { addEventListener: () => {}, removeEventListener: () => {} }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '#/records', href: 'http://127.0.0.1/#/records', search: '' },
    matchMedia: () => ({ matches: false, ...listeners }),
    ...listeners,
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = storage
  const element = (): Record<string, unknown> => ({
    style: { setProperty: () => {}, removeProperty: () => {} },
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    appendChild: () => {},
    removeChild: () => {},
    append: () => {},
    remove: () => {},
    insertBefore: () => {},
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    ...listeners,
  })
  ;(globalThis as unknown as { document: unknown }).document = {
    documentElement: element(),
    head: element(),
    body: element(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => element(),
    createTextNode: () => ({}),
    ...listeners,
  }
}

// ------------------------------------------------------------------------------- the fixture

/** One report block for every rank the short lengths promote, plus one addressed to the owner. */
const BLOCKS: SummaryBlock[] = [
  // LONG ON PURPOSE. `rungsFor` stops a record's ladder at the first length the whole record fits
  // in, and the conclusion's own budget is 60 words, so a report shorter than that has no level 4,
  // 5 or 6 and the write door refuses a summary written by part on it. A fixture this file writes
  // parts to has to be a report with room for them.
  {
    id: 'b-open',
    type: 'text',
    text:
      'Three of four printed wrist mounts broke below the load the trials need.' +
      ' The jig was reset between pulls and the load cell was zeroed each time, so the numbers are comparable with one another. The fourth mount held to twenty-two newtons and had been printed at half the layer height, which was a mistake in the print queue rather than a decision anybody made, and nobody has repeated it since. One sample is not a finding and the rig is not the question here.',
  },
  {
    id: 'b-gate',
    type: 'text',
    forOwner: true,
    text: 'Addressed to you: whether to buy the aluminium blanks now, and whether the trials wait for them.',
  },
  {
    id: 'b-part',
    type: 'section',
    title: 'What is still open',
    blocks: [{ id: 'b-work', type: 'finding', text: 'Nobody has pulled the aluminium mount.', state: 'failed' }],
  },
]

/**
 * THE WORDS EACH OF THE THREE WHOLE-RECORD LENGTHS DRAWS, and where each of them is stored.
 *
 * `label` is a short form, filed under `data.shortForms.label`. `title` and `gist` are NOT forms any
 * more: since criterion A14b, on 3 September 2026, reading length 2 IS the record's own `title`
 * column and length 3 IS its own `summary` column, and both write doors refuse a new form under
 * either key. So the two strings below are written on the record itself — see the record filed in
 * `beforeAll` and the source `ALL_SIX` below — and this object stays as the one place the words are
 * spelled, so a case can ask what a length must draw without a second copy of the sentence.
 */
const WRITTEN = {
  label: 'Wrist mounts broke',
  title: 'Printed wrist mounts broke below the trial load',
  gist: 'Three of four printed wrist mounts broke below the load the handover trials need, so only the aluminium one is worth another run.',
} as const

/**
 * READING LENGTHS 4, 5 AND 6, WHICH ARE WRITTEN BY PART AND NOT AS THREE MORE TEXTS.
 *
 * They were the `card`, the `brief` and the `account` until 2 September 2026. The owner retired all
 * three that evening and put the report's own parts in those seats: a heading per part at level 4,
 * the same heading with a 30-word text under it at level 5, and with a 120-word text at level 6.
 *
 * EVERY TOP-LEVEL BLOCK OF THE REPORT IS COVERED BY EXACTLY ONE PART, which is what the write door
 * holds and what makes it impossible for a length to leave a part of the report out without saying
 * so. `b-open` and `b-gate` are the opening; `b-part` is the section under it.
 */
const PARTS = [
  {
    id: 'p-what-broke',
    heading: 'What broke, and the decision it leaves with you',
    text30:
      'The printed mounts failed under the load the trials need, and two decisions about the replacement are ' +
      'waiting on you rather than on the rig.',
    text120:
      'The printed mounts failed under the load the handover trials need, and the round ends with two decisions ' +
      'that are yours rather than the rig\u2019s: whether the aluminium blanks are bought at the price quoted last ' +
      'week, and whether the trials wait for them or run with a part nobody has pulled at that load. Neither is ' +
      'settled by anything measured here, which is why both are written down rather than answered.',
    covers: ['b-open', 'b-gate'],
  },
  {
    id: 'p-still-open',
    heading: 'What the round left open on the rig',
    text30: 'The aluminium mount was never pulled, so the comparison this round was booked to make was never made.',
    text120:
      'The aluminium mount was never pulled, because the blanks for it have not been bought, so the one ' +
      'comparison this round was booked to make was never made and the rig time went on repeating a failure that ' +
      'was already known after the second pull. The rig is free until the end of the month and the handover ' +
      'trials are booked for the week after that, so the round can still be finished if the blanks arrive.',
    covers: ['b-part'],
  },
] as const

/** What each of the three by-part lengths puts on the page: the headings, and the text that length draws. */
function theFormFor(rung: Rung): string[] {
  if (!isByPartLevel(rung)) return [WRITTEN[rung as keyof typeof WRITTEN]]
  const which = TEXT_DRAWN_AT[rung]
  return PARTS.flatMap((part) => (which === null ? [part.heading] : [part.heading, part[which]]))
}

/**
 * Every set of words this report has at any length below Full, so a test can ask what a length may
 * not draw. Two of them are the record's own columns rather than stored forms since criterion A14b;
 * where the words live does not change what Full may not put above the report.
 */
const EVERY_FORM: string[] = [
  ...Object.values(WRITTEN),
  ...PARTS.flatMap((part) => [part.heading, part.text30, part.text120]),
]

/**
 * THE RECORD AS THE DETAIL RESOLVER SEES IT, with words at every length below Full.
 *
 * THE TITLE AND THE GIST MOVED OUT OF `shortForms` AND ONTO THE RECORD. This built all three
 * whole-record lengths as stored forms, by mapping over `WRITTEN`, until 3 September 2026.
 * Criterion A14b made levels 2 and 3 the record's own two columns, so they are the `title` and
 * `summary` fields here and `data.shortForms` carries the label and the parts. `formsWrittenIn` in
 * src/shared/reportrungs.ts reads the columns, which is what makes the body draw them.
 */
const ALL_SIX: DetailSource = {
  title: WRITTEN.title,
  summary: WRITTEN.gist,
  declaresShortForms: true,
  shortForms: {
    label: {
      text: WRITTEN.label,
      madeFrom: { seq: 7, contentHash: 'ed42e7949e126b03' },
      writtenBy: 'agent',
      by: 'claude-code/short-form-writer',
      at: '2026-09-02 09:37:44',
    },
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

/** The report body as a reader meets it, at one reading length. */
function body(at: Rung, blocks: readonly SummaryBlock[] = BLOCKS): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks,
      layout: 'page',
      drawAt: at,
      inRecord: { recordId: reportId, kind: 'report', stored: ALL_SIX },
    } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/** The markup with tags taken out, so an assertion is about words and not about elements. */
const words = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  shimTheBrowser()
  page = await import('../src/web/pages/RecordPage.tsx')
  sb = await import('../src/web/components/SummaryBlocks.tsx')

  // THE TITLE AND THE SUMMARY ARE FILED WITH THE RECORD, because they ARE reading lengths 2 and 3.
  // The record was filed with the title *Wrist mount pull test, round eight* and no summary until
  // 3 September 2026, and the words for those two lengths were sent to the short-forms route below.
  // Criterion A14b moved them here.
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'report', title: WRITTEN.title, summary: WRITTEN.gist, data: { blocks: BLOCKS } },
  })
  expect(made.statusCode, made.body).toBe(201)
  reportId = (made.json() as { record: { id: string } }).record.id

  const ledger = await app.inject({ method: 'GET', url: `/api/records/${reportId}/revisions`, headers: HUMAN })
  const newest = [...(ledger.json() as { revisions: { seq: number; contentHash: string }[] }).revisions].sort(
    (a, b) => b.seq - a.seq,
  )[0]
  expect(newest, 'the record has no revision for a short form to name').toBeDefined()

  const wrote = await app.inject({
    method: 'POST',
    url: `/api/records/${reportId}/short-forms`,
    headers: THE_WRITER,
    // THE LABEL AND THE PARTS, WHICH IS EVERYTHING THIS ROUTE STILL WRITES. It was sent
    // `{ ...WRITTEN, parts: PARTS }` — all three whole-record lengths — and answers 400 naming
    // `title` and `gist` now, because both keys are retired. Criterion A14b.
    payload: {
      madeFrom: { seq: newest?.seq, contentHash: newest?.contentHash },
      forms: { label: WRITTEN.label, parts: PARTS },
    },
  })
  expect(wrote.statusCode, wrote.body).toBe(200)

  const read = await app.inject({ method: 'GET', url: `/api/records/${reportId}/short-forms`, headers: HUMAN })
  expect(read.statusCode, read.body).toBe(200)
  forms = read.json() as ShortFormsReading
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 0. the fixture is what it claims

describe('the report this file measures really holds words at every length below Full', () => {
  it('reads them all back through the server, so an empty page cannot pass quietly', () => {
    const stored = forms.levels.filter((level) => level.text !== null).map((level) => level.level)
    // THE THREE WHOLE-RECORD LENGTHS, WHICHEVER FIELD SUPPLIES THEM. The describe above said *every
    // writable length* while all three were forms a writer filed; since criterion A14b, on
    // 3 September 2026, two of them are the record's own columns and neither can be written as a
    // form at all. The reading is where that stops mattering: it reports level 2 from `title` and
    // level 3 from `summary` on the same list, so this line asks the same question it always did.
    expect(stored).toEqual([...SHORT_FORM_LEVELS])
    // AND THE THREE LENGTHS WRITTEN BY PART, which carry no text of their own — there is no ONE
    // text at those lengths, there is a heading and two texts for each part — so they are read
    // back by their parts rather than by `text`.
    for (const rung of BY_PART_LEVELS) {
      const row = forms.levels.find((level) => level.rung === rung)
      expect(row?.parts, `${rung} has no by-part structure on the reading`).toEqual({
        written: true,
        count: PARTS.length,
      })
    }
  })
})

// ============================================================ 2. Full is the report alone

/**
 * THE FORM THE BODY USED TO DRAW ABOVE THE REPORT AT FULL, AND WHY IT IS GONE.
 *
 * Full has no written form of its own, so the body drew the longest one that exists — the account,
 * length 6 — at the top of the report, with a mark under it reading *Written for reading length 6
 * by claude-code/short-form-writer*. That mark is not for a
 * person, and it is not shown to people.
 * Without the mark, a summary somebody wrote would stand above the report with nothing saying what
 * it is — which is the fault the mark had been added to repair. So Full draws the report alone.
 *
 * `formDrawnAt` in src/shared/reportrungs.ts is where that is decided, and this section reads it
 * off the rendered body, because a rule that only the resolver knows leaves the page free to draw
 * the line anyway.
 */
describe('at Full the report body draws the report and nothing above it', () => {
  it('draws no written form at Full, and no mark saying which length one was written for', () => {
    const html = body('full')
    // THE LONGEST WHOLE-RECORD FORM, AND THE PARTS. Full drew the longest written form above the
    // report until 2 September 2026; the longest one is length 3 now, and the three lengths above
    // it are the report's parts, so neither may be on the page at Full.
    //
    // THE PATH NAMED HERE WAS `data.shortForms.gist` UNTIL 3 SEPTEMBER 2026. Criterion A14b made
    // levels 2 and 3 the record's own two columns, so a line drawn from either carries the bare
    // column name — `title`, `summary` — and the old path is on no line anywhere. Both are named,
    // because both are now a length the body could wrongly draw above the report.
    expect(html, 'a written form is drawn above the report again').not.toContain('data-drawn-from="summary"')
    expect(html, 'the record’s own title is drawn above the report').not.toContain('data-drawn-from="title"')
    expect(html, 'the report\u2019s parts are drawn at Full').not.toContain('class="sb-parts"')
    expect(html, 'a written form is drawn above the report at Full').not.toContain('class="sb-open-line"')
    expect(words(html), 'the writer line is back on the page').not.toContain('Written for')
  })

  it('draws the report’s own first block as the first words of the body', () => {
    const said = words(body('full'))
    const first = BLOCKS[0]
    const opens = first !== undefined && 'text' in first ? first.text : ''
    expect(opens, 'the fixture has no opening block, so the check below is of nothing').not.toBe('')
    expect(said.indexOf(opens), 'the report’s first block is not in the body at Full').toBeGreaterThan(-1)
    for (const form of EVERY_FORM) {
      expect(said, 'a written form is drawn at Full').not.toContain(form)
    }
  })

  it('draws the form written for the length at every length below Full, with no mark on it', () => {
    for (const rung of [...SHORT_FORM_LEVELS, ...BY_PART_LEVELS]) {
      const said = words(body(rung))
      // AT LEVELS 4, 5 AND 6 THE FORM IS THE REPORT'S PARTS, so what has to be on the page is every
      // part's heading and the text that length draws under it, rather than one string.
      for (const written of theFormFor(rung)) {
        expect(said, `${rung} lost the form written for it`).toContain(written)
      }
      expect(said, `${rung} still marks the form with who wrote it`).not.toContain('Written for')
    }
  })

  /**
   * WHAT THIS ASSERTED UNTIL 3 SEPTEMBER 2026, under the name *falls back to the nearest shorter
   * form, and does not call it this length's own*: that reading length 5 on a report holding only a
   * label and a gist drew the GIST, unmarked, carrying `data-rung="gist"` so a reader could see
   * which length had written the words. The owner ended that fallback (criterion A14a), so this
   * length draws one line naming itself and the gist stays at level 3.
   */
  it('draws one line naming the level, where nobody wrote a form for it', () => {
    const upToTheGist: DetailSource = {
      ...ALL_SIX,
      // THE LABEL ALONE UNDER `data.shortForms`, AND THE TWO COLUMNS LEFT WHERE THEY ARE. The
      // filter let `label` and `gist` through until 3 September 2026, when the gist was a stored
      // form; criterion A14b made length 3 the record's own `summary`, which the spread above
      // carries. So what this takes away is the parts, and the record still reaches length 3 and
      // stops — which is the state the case is about.
      shortForms: Object.fromEntries(
        Object.entries(ALL_SIX.shortForms ?? {}).filter(([level]) => level === 'label'),
      ),
    }
    const html = renderToStaticMarkup(
      h(sb.SummaryBlocks, {
        blocks: BLOCKS,
        layout: 'page',
        drawAt: 'sketch',
        inRecord: { recordId: reportId, kind: 'report', stored: upToTheGist },
      } as never),
    ).replace(/<style[\s\S]*?<\/style>/g, '')
    expect(words(html), 'the gist stands at a length nobody wrote').not.toContain(WRITTEN.gist)
    expect(words(html)).toContain(`${levelLabel('sketch')} has not been written for this report.`)
    expect(html, 'a level nobody wrote is marked as written').not.toContain('data-summary="written"')
    expect(html, 'the page still says which length some other words came from').not.toContain('data-rung="gist"')
    expect(html, 'the sentence that named no level is back').not.toContain(
      'No summary of this length was written for this report.',
    )
  })
})
