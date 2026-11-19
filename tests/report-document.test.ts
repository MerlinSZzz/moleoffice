// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REPORT, DRAWN — CHECKED AGAINST A WHOLE DOCUMENT RATHER THAN AGAINST A THREE-LINE SPECIMEN.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * `SummaryBlocks` can draw prose, headings, lists, code, quotes, maths, charts, tables and
 * pictures, and until this file NOTHING HAD EVER BEEN DRAWN THROUGH IT: zero blocks across all
 * fifteen modules in the corpus, and every earlier test fed it two or three lines written to
 * exercise one rule. A renderer nobody has used is a renderer nobody has checked, and what a
 * three-line specimen cannot show is what a real document does — a bullet written across three
 * lines, a table in the middle of a section, five section breaks, three heading levels.
 *
 * So the material here is a whole review, read off disk:
 * `tests/fixtures/an-invented-review-drawn-whole.md`. It is invented, and nothing in it happened.
 * Until October 2026 this file read an actual review written for the owner
 * (design/OWNER-REVIEW-ROUND-FOUR.md); the public copy of this repository is to carry no design/
 * folder, so the invented review keeps the shapes the real one was chosen for:
 *
 *   - more than 400 different words of five letters or more, so "every word reaches the page" is
 *     a check over a whole document and not over a few lines;
 *   - a table in the middle of a section, whose first column opens with an italic quotation and
 *     whose second column holds the cell "Background saving stays and keeps its quiet status line";
 *   - seven section breaks (`---`), each of which used to be printed as three dashes;
 *   - "The rest of the list": seven bullets, each wrapped across two or three lines, the first of
 *     them with words on its third line, followed by a level-two heading where the slice ends;
 *   - headings at four levels, quotation blocks, an arrow chain, inline code, bold and italics,
 *     a numbered list with a list inside it, and a fenced code block, so a renderer that drops
 *     the words of any of them fails the first case.
 *
 * FIVE THINGS WERE WRONG AND ALL FIVE ARE PINNED BELOW. Every item of every list came out as a
 * one-item list with the rest of its own sentence orphaned into a paragraph below it; a numbered
 * list came out as one `ol` per step, so five steps were drawn as five step ones; each of the five
 * section breaks was printed as the characters `---`; a four-row table left the page entirely with
 * nothing saying anything had gone; and the third-level headings were drawn in capitals, at 14px,
 * under 16px paragraphs.
 *
 * ---------------------------------------------------------------------------------------------
 * THE TEST THAT MATTERS MOST IS THE FIRST ONE
 * ---------------------------------------------------------------------------------------------
 *
 * "Every word of the source reaches the page." It is the one that catches a renderer deleting
 * content, which is the failure that cannot be seen by looking at the screen: the table that
 * vanished looked exactly like a document that never had a table in it.
 *
 * ---------------------------------------------------------------------------------------------
 * HALF OF THIS FILE OPENS A BROWSER, SINCE 3 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------------
 *
 * The cases about WHAT IS WRITTEN — the words, the lists, the section breaks, the record page —
 * render to static markup and read what is drawn, which is all they need.
 *
 * The cases about HOW IT IS SET — the heading ladder, the bullets, the size of code, and how wide
 * prose reads — used to match the component's stylesheet as text. A declaration is not a drawing:
 * every one of those passes on a rule a later rule overrides, which is exactly how the bullets
 * disappeared and how a section's body lost its tracks. Those cases open a report in Chromium and
 * read computed styles and drawn boxes at 1440 and 390. The describe called *a document is set to
 * be read* holds them, with its own beforeAll, so a browser that will not start fails that block
 * and leaves the rest of the file alone.
 *
 * THE READING-MEASURE CASES OF tests/viz.test.ts MOVED INTO THAT BLOCK ON THE SAME DAY. Both
 * auditors named the two files as covering the same reading-measure rules. The note where they
 * stood in viz.test.ts says what each of them was.
 */

import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page as PlaywrightPage } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { detailKeyForSurface } from '../src/shared/detail.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { PanelRecord, RecordKind } from '../src/shared/types.ts'
import { recordIncompleteness } from '../src/shared/kinds.ts'
import { formatDue } from '../src/web/lib/attention.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
type Page = typeof import('../src/web/pages/RecordPage.tsx')

let sb: SummaryBlocksModule
let page: Page

beforeAll(async () => {
  // These modules reach api.ts and router.tsx, which touch `window` while they are evaluated. The
  // smallest stand-in that lets them load; nothing here is under test.
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
  // THE DOCUMENT THIS FILE IS ABOUT IS READ AT FULL. Act 3a makes a record
  // page open at its summary, so the render stores the level it is about rather than relying on the
  // opening default. The opening default has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts.
  store.set(detailKeyForSurface('reportContent'), 'full')
  sb = await import('../src/web/components/SummaryBlocks.tsx')
  page = await import('../src/web/pages/RecordPage.tsx')
})

/** The invented review, read from tests/fixtures. What each part of it is for is said at the top. */
const REVIEW = readFileSync(new URL('./fixtures/an-invented-review-drawn-whole.md', import.meta.url), 'utf8')

/** The whole review as one report's blocks, which is the hardest thing this renderer is asked. */
const asOneBlock = (md: string = REVIEW) => [{ type: 'text' as const, id: 'r', text: md }]

/** The markup with the hoisted stylesheets taken out, so a class named in CSS is not evidence. */
function drawn(md: string = REVIEW, layout: 'panel' | 'page' = 'page'): string {
  return renderToStaticMarkup(h(sb.SummaryBlocks, { blocks: asOneBlock(md), layout })).replace(
    /<style[\s\S]*?<\/style>/g,
    '',
  )
}

/** What a person would read off the screen: the markup with its tags and escapes taken out. */
function readable(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

// ============================================================================ the words survive

describe('a whole review, drawn through the blocks a report is made of', () => {
  /**
   * NOTHING A PERSON WROTE MAY LEAVE THE PAGE.
   *
   * Every run of five or more letters in the source has to be readable in what is drawn. Five,
   * because shorter runs are the fragments markers leave behind and this is a check on content,
   * not on punctuation.
   *
   * THIS IS THE TEST THAT CAUGHT THE WORST DEFECT. A table typed into the words was replaced by a
   * one-line note, so every word of its rows was deleted from the page with nothing saying so. Silence is the one failure a reader cannot see.
   */
  it('draws every word of the review, with nothing dropped on the way', () => {
    const words = new Set((REVIEW.match(/[A-Za-z]{5,}/g) ?? []).map((w) => w.toLowerCase()))
    expect(words.size, 'nothing was measured, so this test proved nothing').toBeGreaterThan(400)
    const text = readable(drawn()).toLowerCase()
    const lost = [...words].filter((w) => !text.includes(w))
    expect(lost, 'these words are in the review and are nowhere on the page').toEqual([])
  })

  /**
   * A TABLE TYPED INTO PROSE IS A REAL TABLE.
   *
   * It used to print its pipe characters under a note telling the author to use a table block. The
   * reason given was that reading the pipes here would be a SECOND reader of pipe-table syntax; the
   * reason was right and the conclusion was wrong, because src/shared/plandoc.ts already holds THE
   * reader and the renderer now calls it.
   */
  it('draws a table typed into the words as a real table', () => {
    const out = drawn()
    expect(out).toContain('<table')
    expect(out).not.toContain('Not rendered')
    // A cell from the middle of that table. It is in no other line of the review.
    expect(readable(out)).toContain('Background saving stays and keeps its quiet status line')
    // And the cell is a cell, not a line of a code block.
    expect(out).toMatch(/<td[^>]*>[^<]*<em>/)
  })

  /** Seven of these are in the review, and every one of them used to be printed as three dashes. */
  it('draws a break between sections rather than printing its dashes', () => {
    const out = drawn()
    // Counted from the review rather than written down here, so the number cannot go stale.
    const breaks = (REVIEW.match(/^---\s*$/gm) ?? []).length
    expect(breaks, 'the review has no section breaks in it, so this proved nothing').toBeGreaterThan(3)
    expect((out.match(/<hr class="sb-rule"\/>/g) ?? []).length).toBe(breaks)
    expect(readable(out), 'the characters of a section break are on the page as words').not.toContain(' --- ')
  })

  /**
   * A LIST ITEM WRITTEN ACROSS THREE LINES IS ONE ITEM.
   *
   * The review's "The rest of the list" is seven bullets, every one of them wrapped. Before this,
   * a list like it drew as seven one-item lists with seven orphaned paragraphs between them, each carrying the
   * second half of the sentence above it.
   */
  it('keeps a bullet and the lines it was wrapped across in one item', () => {
    const out = drawn()
    const items = [...out.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => readable(m[1] ?? ''))
    const home = items.find((t) => t.includes('Home is per gardener'))
    expect(home, 'the review\'s first bullet is not on the page as an item at all').toBeDefined()
    expect(home, 'the rest of the bullet was left outside the item that starts it')
      .toContain('the next plot held 37 seedlings needing water')
  })

  it('keeps a wrapped list as one list, so its seven bullets are seven rows of one thing', () => {
    const section = REVIEW.slice(REVIEW.indexOf('### The rest of the list'), REVIEW.indexOf('## What is still wrong'))
    const out = drawn(section)
    expect((out.match(/<ul/g) ?? []).length, 'the list was broken into one list per bullet').toBe(1)
    expect((out.match(/<li[^>]*>/g) ?? []).length).toBe(7)
  })

  /**
   * A NUMBERED LIST KEEPS ITS NUMBERS, which is the version of the same defect that corrupts a
   * fact rather than the layout: each item became its own `ol`, and every browser starts an `ol`
   * at one, so three steps were drawn as three step ones.
   */
  it('keeps a numbered list as one list, so the numbers on screen are the numbers written', () => {
    const out = drawn('1. first step\n   wrapped onto a second line\n2. second step\n3. third step')
    expect((out.match(/<ol/g) ?? []).length).toBe(1)
    expect((out.match(/<li[^>]*>/g) ?? []).length).toBe(3)
    expect(readable(out)).toContain('first step wrapped onto a second line')
  })

  /** Flattening a list inside a list is structure deleted in silence, which this renderer may not do. */
  it('draws a list inside a list rather than flattening it to one level', () => {
    const out = drawn('- the top one\n  - the one inside it\n- the second top one')
    expect(out, 'the nested list was flattened into its parent').toMatch(/<li[^>]*>[^<]*the top one[\s\S]*?<ul/)
    expect(readable(out)).toContain('the one inside it')
  })

  it('reads a heading below the third level rather than printing its hashes', () => {
    expect(drawn('#### The fourth level')).toContain('<h6')
    expect(readable(drawn('#### The fourth level'))).not.toContain('####')
  })
})

// ============================================================================ how it is set

/**
 * HOW A DOCUMENT IS SET, MEASURED IN A BROWSER RATHER THAN READ OUT OF THE STYLESHEET.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS BLOCK OPENS A BROWSER, AND WHAT IT REPLACED
 * ---------------------------------------------------------------------------------------------
 *
 * A describe called *a document is set to be read* stood here until 3 September 2026. Its five
 * cases matched `SUMMARY_CSS` as text: no `uppercase` in a heading rule, `list-style: disc` in the
 * list rule, four heading tokens in descending order, `font-size: inherit` on the code rule, and a
 * set of rules the reading measure may and may not appear in.
 *
 * A DECLARATION IS NOT A DRAWING. Every one of those five passes on a declaration a later rule
 * overrides, and one of them is the exact reason the bullet rule was written: `styles.css` turns
 * the list marker off for every `ul` and `ol` in the app, so the question is never what this
 * stylesheet SAYS but what survives the cascade. Reading the string cannot tell you.
 *
 * SO THESE OPEN THE REPORT AND ASK THE BROWSER. Computed styles and drawn boxes, at 1440 and at
 * 390, on a report written to hold one of everything the rules are about.
 *
 * ---------------------------------------------------------------------------------------------
 * THE READING-MEASURE CASES OF tests/viz.test.ts MOVED HERE ON THE SAME DAY
 * ---------------------------------------------------------------------------------------------
 *
 * `tests/viz.test.ts` held a describe called *prose has one wrap column, and it is not counted in
 * characters* — six cases, all of them matching `SUMMARY_CSS` or `tokens.css` as text, and two of
 * them the same rules this file already matched. Both auditors named the pair as covering the same
 * reading-measure rules.
 *
 * THEY ARE ALL HERE NOW, AS MEASUREMENTS, and `viz.test.ts` keeps what it is for: the chart, the
 * maths and the block markup, which it reads off real output with no browser. Nothing was dropped
 * in the move; each case below says which rule it carries.
 *
 * WHAT IS DELIBERATELY NOT HERE. That the reading measure is DECLARED once, in tokens.css, and that
 * no block component computes one of its own, are facts about the source. The test that read them
 * from the source has since been deleted, and no case here asserts them. That a paragraph block spans
 * the report body and its sentences fill it is measured in `tests/the-band-beside-the-writing.test.ts`.
 * The blocks measured below are the ones neither of those two covers.
 */

/** A paragraph of Latin prose, long enough to wrap at both widths. */
const LATIN =
  'The gripper let go of the part on three of the nine runs, and the shell cracked at the same ' +
  'corner every time, which is what makes this a shell problem rather than a grip one.'

/**
 * THE SAME LENGTH OF WRITING IN CHINESE, which is what makes the character-count case decidable.
 *
 * A cap counted in `ch` is the width of a zero, so it fits about twice as many Latin letters as
 * Chinese characters: 187 stored strings in this corpus hold CJK and 109 mix it with Latin, so a
 * character-counted measure is two columns on one page rather than one.
 */
const CHINESE =
  '夹爪在九次运行中有三次松开了工件，外壳每次都在同一个角上开裂，所以这是一个外壳的问题，而不是一个抓取的问题。' +
  '这一段写得够长，好让它在两种宽度下都要换行。'

/** A markdown table, typed into the words, wide enough that a narrow box has to do something. */
const TYPED_TABLE = [
  '| run | what the operator wrote | movement |',
  '| --- | --- | --- |',
  '| 1 | the same joint moved at the same place on every run | 4.1 mm |',
  '| 2 | the same joint moved at the same place on every run | 4.0 mm |',
].join('\n')

/** One block of everything the rules below are about, in one report. */
const SET_BLOCKS = [
  { id: 'b-latin', type: 'text', text: LATIN },
  { id: 'b-cjk', type: 'text', text: CHINESE },
  {
    id: 'b-headings',
    type: 'text',
    text: [
      // ONE HASH IS h3 AND FOUR IS h6. A run of markdown starts at h3 because a summary lives
      // inside a panel that already owns h2, and everything below the fourth hash is h6.
      '# A first-level heading somebody wrote',
      LATIN,
      '## A second-level heading somebody wrote',
      LATIN,
      '### A third-level heading somebody wrote',
      LATIN,
      '#### A fourth-level heading somebody wrote',
      LATIN,
    ].join('\n\n'),
  },
  {
    id: 'b-lists',
    type: 'text',
    text: '- the first bullet\n- the second bullet\n\n1. the first step\n2. the second step\n\n> a line somebody else wrote\n\n```\nnpm test\n```\n',
  },
  {
    id: 'b-callout',
    type: 'callout',
    tone: 'warning',
    title: 'The speed only latches on a fresh session',
    // A TABLE INSIDE A CALLOUT, which is the nested box the phone found: a run of markdown inside a
    // box that is itself inside the report body.
    text: `${LATIN}\n\n${TYPED_TABLE}`,
  },
  {
    id: 'b-finding',
    type: 'finding',
    text: 'The mount holds calibration through a full handover.',
    detail: LATIN,
    state: 'done',
  },
  { id: 'b-quote', type: 'quote', text: LATIN, source: `${THE_TEST_OFFICES_OWNER.name}, 18 August 2026` },
  {
    id: 'b-chart',
    type: 'chart',
    spec: {
      kind: 'line',
      x: { label: 'effort' },
      y: { label: 'grip force', unit: 'N' },
      series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 18, y: 19.4 }] }],
    },
    caption: 'Measured on the 50 mm cube, three prints. This caption is long enough to wrap.',
  },
  {
    id: 'b-section',
    type: 'section',
    title: 'What was measured',
    blocks: [
      { id: 's-text', type: 'text', text: LATIN },
      {
        id: 's-table',
        type: 'table',
        columns: [{ label: 'run' }, { label: 'result' }],
        rows: [{ cells: ['1', 'held'] }, { cells: ['2', 'cracked'] }],
      },
    ],
  },
]

/** What one element was drawn as, in pixels and in resolved styles. */
interface Drawn {
  /** The element's own box. */
  width: number
  /** Its content box: the width minus whatever it draws in front of and behind the writing. */
  inner: number
  /** The narrowest run of writing drawn at or inside it. A measure lands here and nowhere else. */
  writing: number
  fontSize: number
  textTransform: string
  listStyleType: string
}

interface Setting {
  body: number
  rem: number
  pageScroll: number
  pageWidth: number
  /** Every element the cases below name, by the name they name it with. */
  at: Record<string, Drawn | null>
  /** What `var(--measure)` resolves to on two boxes of different font size. */
  measureAt: { small: number; large: number }
  /** Every `data-fit` value the renderer wrote onto a drawn element. */
  fitsDrawn: string[]
  /** How wide a block the region tree marked as needing only a reading line was drawn. */
  needsReading: number
  /** A chart's caption against the figure that holds it. */
  caption: { width: number; figure: number }
  /** The table inside the section, and the section body that holds it. */
  inSection: { table: number; body: number }
  /** The table typed into the callout, and the callout body that holds it. */
  inCallout: { table: number; body: number }
}

/** The elements the cases below ask about, by a name and the selector that finds them. */
const WHERE: Record<string, string> = {
  latin: '.sb-block[data-drawn-from$="[#b-latin]"]',
  chinese: '.sb-block[data-drawn-from$="[#b-cjk]"]',
  bullets: 'ul.sb-list',
  numbered: 'ol.sb-list',
  quoted: '.sb-quoted',
  code: '.sb-code',
  callout: '.sb-callout',
  calloutBody: '.sb-callout-body',
  finding: '.sb-finding',
  findingDetail: '.sb-finding-detail',
  quote: '.sb-quote',
  h3: 'h3.sb-h',
  h4: 'h4.sb-h',
  h5: 'h5.sb-h',
  h6: 'h6.sb-h',
  paragraph: '.sb-p',
}

describe('a document is set to be read', () => {
  let app: LiveApp
  let page: PlaywrightPage
  let reportId = ''

  beforeAll(async () => {
    app = await liveApp({ opensAt: 'full', name: 'report-document-set', viewport: { width: 1440, height: 1000 } })
    page = app.page
    const made = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'report',
        title: 'One of everything a document is set with',
        summary: 'A report holding one block of every kind the setting rules are about.',
        data: { date: '2026-09-03', blocks: SET_BLOCKS },
      }),
    })
    if (made.status !== 201) throw new Error(`the fixture report was not stored: ${String(made.status)} ${await made.text()}`)
    reportId = ((await made.json()) as { record: { id: string } }).record.id
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  })

  /** Open the report at one width and hand back what the browser drew and resolved. */
  async function set(width: number): Promise<Setting> {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/r/${reportId}`)
    await waitForThePage(page)
    await page.locator('.sb .sb-p').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(400)
    return page.evaluate((where) => {
      const round = (n: number): number => Math.round(n * 100) / 100
      const inner = (el: Element): number => {
        const s = getComputedStyle(el)
        return round(
          el.getBoundingClientRect().width -
            (Number.parseFloat(s.paddingLeft) || 0) -
            (Number.parseFloat(s.paddingRight) || 0) -
            (Number.parseFloat(s.borderLeftWidth) || 0) -
            (Number.parseFloat(s.borderRightWidth) || 0),
        )
      }
      const read = (el: Element | null): Drawn | null => {
        if (el === null) return null
        const s = getComputedStyle(el)
        // THE WRITING AT OR INSIDE THIS ELEMENT. An element that IS its own writing — a heading is
        // one — carries the mark itself, so it is looked for at the element as well as under it.
        const written = [...(el.matches('[data-writing]') ? [el] : []), ...el.querySelectorAll('[data-writing]')]
        return {
          width: round(el.getBoundingClientRect().width),
          inner: inner(el),
          writing: written.length === 0 ? -1 : Math.min(...written.map((one) => round(one.getBoundingClientRect().width))),
          fontSize: Number.parseFloat(s.fontSize),
          textTransform: s.textTransform,
          listStyleType: s.listStyleType,
        }
      }
      const at: Record<string, Drawn | null> = {}
      for (const [name, selector] of Object.entries(where as Record<string, string>)) {
        at[name] = read(document.querySelector(`.sb ${selector}`))
      }
      // WHAT `var(--measure)` RESOLVES TO ON TWO BOXES OF DIFFERENT FONT SIZE. A token stated in em
      // resolves against the element's own font size, so one token becomes one column per size —
      // which is what produced ten different wrap columns inside one 807px column.
      const probe = (fontSize: string): number => {
        const box = document.createElement('div')
        box.style.fontSize = fontSize
        box.style.width = 'var(--measure)'
        box.style.position = 'absolute'
        box.style.visibility = 'hidden'
        document.body.append(box)
        const px = round(box.getBoundingClientRect().width)
        box.remove()
        return px
      }
      const figure = document.querySelector('.sb .sb-chart')
      const caption = figure?.querySelector('figcaption') ?? null
      const sectionBody = document.querySelector('.sb .sb-section-body')
      const sectionTable = sectionBody?.querySelector('.sb-table') ?? null
      const calloutBody = document.querySelector('.sb .sb-callout-body')
      const calloutTable = calloutBody?.querySelector('.sb-table') ?? null
      return {
        body: round((document.querySelector('.sb') as Element).getBoundingClientRect().width),
        rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        pageScroll: document.documentElement.scrollWidth,
        pageWidth: document.documentElement.clientWidth,
        at,
        measureAt: { small: probe('12px'), large: probe('28px') },
        fitsDrawn: [...new Set([...document.querySelectorAll('.sb [data-fit]')].map((el) => el.getAttribute('data-fit') ?? ''))],
        needsReading: (() => {
          const el = document.querySelector('.sb [data-needs="reading"]')
          return el === null ? -1 : round(el.getBoundingClientRect().width)
        })(),
        caption: {
          width: caption === null ? -1 : round(caption.getBoundingClientRect().width),
          figure: figure === null ? -1 : inner(figure),
        },
        inSection: {
          table: sectionTable === null ? -1 : round(sectionTable.getBoundingClientRect().width),
          body: sectionBody === null ? -1 : inner(sectionBody),
        },
        inCallout: {
          table: calloutTable === null ? -1 : round(calloutTable.getBoundingClientRect().width),
          body: calloutBody === null ? -1 : inner(calloutBody),
        },
      }
    }, WHERE)
  }

  /** One element of the drawing, by the name `WHERE` gives it. */
  function el(at: Setting, name: string): Drawn {
    const found = at.at[name]
    if (found === null || found === undefined) throw new Error(`nothing was drawn for "${name}" (${WHERE[name] ?? '?'})`)
    return found
  }

  /**
   * THE CONTROL, AND IT COMES FIRST. Every case below compares two numbers the browser gave it, and
   * a page that drew nothing hands back -1 for both and can satisfy a comparison by accident. This
   * says the report is on the screen and that every element the cases name was drawn.
   */
  it('really drew the report, with every part the cases below ask about', async () => {
    const at = await set(1440)
    expect(at.body, 'the report body was not drawn at all').toBeGreaterThan(900)
    expect(at.rem, 'the root font size could not be read').toBeGreaterThan(0)
    const missing = Object.keys(WHERE).filter((name) => at.at[name] === null)
    expect(missing, 'the fixture no longer draws these, so the cases about them prove nothing').toEqual([])
  }, 120_000)

  /**
   * A HEADING IS CONTENT, AND CONTENT IS NOT SET IN CAPITALS.
   *
   * The type rule is that capitals mark the furniture — a field label, the appearance controls —
   * and never the thing you came to read. The third-level heading was uppercase at 14px, which is
   * both against that rule and smaller than the prose underneath it.
   */
  it('sets no heading in capitals', async () => {
    const at = await set(1440)
    for (const level of ['h3', 'h4', 'h5', 'h6']) {
      expect(el(at, level).textTransform, `${level} shouts a heading somebody wrote`).not.toBe('uppercase')
    }
  }, 120_000)

  /**
   * A BULLET HAS A BULLET AND A NUMBERED ITEM HAS ITS NUMBER.
   *
   * `styles.css` turns the marker off for every `ul` and `ol` in the app, which is right for the
   * navigation and for the rows that are lists only in the markup. A list written in a record drew
   * as indented paragraphs — and on a numbered list that is content lost rather than decoration,
   * because the number is the only thing saying which step you are reading.
   *
   * THE RESOLVED VALUE IS THE POINT. This used to read `list-style: disc` out of the component's
   * own stylesheet, which is the declaration that `styles.css` was overriding when the defect
   * happened. What the browser settled on is the only answer that says anything.
   */
  it('gives a bullet its bullet and a numbered item its number', async () => {
    const at = await set(1440)
    expect(el(at, 'bullets').listStyleType, 'a bullet list drew with no bullets').toBe('disc')
    expect(
      el(at, 'numbered').listStyleType,
      'a numbered list with no numbers is a list of steps you cannot count',
    ).toBe('decimal')
  }, 120_000)

  /**
   * A DOCUMENT'S HEADINGS DESCEND AND NONE IS SMALLER THAN THE PROSE IT HEADS.
   *
   * On a report these headings are the only structure on the page, so each level is smaller than
   * the one above it and none is smaller than the paragraphs under it. Measured on the round-four
   * owner review before the fix: 19px, 16px and 14px-in-capitals, under 16px paragraphs.
   */
  it('gives the heading ladder a step at every level and never falls below its prose', async () => {
    const at = await set(1440)
    const ladder = ['h3', 'h4', 'h5', 'h6'].map((level) => el(at, level).fontSize)
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i - 1] as number, `level ${String(i + 2)} is drawn under level ${String(i + 3)}`)
        .toBeGreaterThanOrEqual(ladder[i] as number)
    }
    const prose = el(at, 'paragraph').fontSize
    expect(prose, 'no prose was drawn to compare a heading against').toBeGreaterThan(0)
    for (const size of ladder) {
      expect(size, 'a heading is drawn smaller than the prose under it').toBeGreaterThanOrEqual(prose)
    }
    expect(ladder[0] as number, 'the ladder has no step in it at all').toBeGreaterThan(ladder[3] as number)
  }, 120_000)

  /**
   * A CODE BLOCK IS THE SIZE IT WAS SET TO.
   *
   * A code element with no size of its own takes the browser's fixed-width default instead of the
   * size on its parent, so a block set to 14px drew at 12.96 — under the 13px floor this project
   * holds every page to.
   */
  it('does not let the code inside a block shrink below the size the block was set to', async () => {
    const inside = await page.evaluate(() => {
      const box = document.querySelector('.sb .sb-code')
      const code = box?.querySelector('code') ?? null
      if (box === null || code === null) return null
      return { box: Number.parseFloat(getComputedStyle(box).fontSize), code: Number.parseFloat(getComputedStyle(code).fontSize) }
    })
    expect(inside, 'no code block was drawn').not.toBe(null)
    expect(inside?.code, 'the code inside the block is smaller than the block was set to')
      .toBeGreaterThanOrEqual(inside?.box ?? 0)
  }, 120_000)

  /**
   * ONE WRAP COLUMN, AND IT IS NOT COUNTED IN CHARACTERS.
   *
   * FROM tests/viz.test.ts, WHICH ASSERTED IT AS TWO STRING MATCHES: that `tokens.css` states
   * `--measure` in a root-relative length and never in `em`, and that no rule in the component's
   * stylesheet carries `max-width: <n>ch`.
   *
   * BOTH ARE THE SAME FAULT MEASURED HERE. An `em` measure resolves against each element's own font
   * size, so one token becomes one column per size — 387 to 566px inside one 807px column, which is
   * what reads as hard-wrapped prose. A `ch` measure is the width of a zero, so it fits about twice
   * as many Latin letters as Chinese characters, and this corpus holds 187 strings with CJK in it.
   *
   * SO: the token resolves to one width whatever font size asks for it, and a paragraph of Chinese
   * and a paragraph of English in one report are drawn at one width.
   */
  it('resolves the reading token to one width at every text size', async () => {
    const at = await set(1440)
    expect(at.measureAt.small, 'nothing resolved var(--measure) at all').toBeGreaterThan(0)
    expect(
      at.measureAt.small,
      `var(--measure) came out at ${String(at.measureAt.small)}px on 12px text and ` +
        `${String(at.measureAt.large)}px on 28px text, so one token is one column per text size`,
    ).toBe(at.measureAt.large)
  }, 120_000)

  it('draws a Chinese paragraph and an English one at the same width', async () => {
    const at = await set(1440)
    const latin = el(at, 'latin')
    const chinese = el(at, 'chinese')
    expect(latin.writing, 'no English writing was drawn').toBeGreaterThan(100)
    expect(chinese.writing, 'no Chinese writing was drawn').toBeGreaterThan(100)
    expect(
      chinese.writing,
      `English wraps at ${String(latin.writing)}px and Chinese at ${String(chinese.writing)}px, ` +
        'which is a measure counted in characters',
    ).toBe(latin.writing)
  }, 120_000)

  /**
   * A BLOCK THAT DRAWS SOMETHING IN FRONT OF ITS TEXT IS NOT NARROWED BY IT.
   *
   * FROM tests/viz.test.ts, WHICH ASSERTED IT AS A STRING MATCH: that `.sb-list`, `.sb-quoted` and
   * `.sb-callout` each declare `--lane-lead`, read it as their own padding, and carry no
   * `max-width`; and that a list, a quote, a callout and a finding carry no `width` of their own.
   *
   * THE MEASUREMENT THAT SAYS IT. Each of the four spans the region it is in, and the writing inside
   * each fills that block's content box exactly. A maximum on the element shows up as writing
   * narrower than the box it is in, which is what a component-local hard cap looks like from the
   * page. A reading measure must not be a hard cap on every component that leaves half the semantic
   * region as empty space.
   *
   * MEASURED BEFORE THE FIX, at 1440 in an 1164px body on report N7uG7vTRJyLj: a finding's sentence
   * 442.9px, a bullet item 544, a quote 541, a paragraph 527 — four columns in one report.
   */
  it('spans a list, a quote, a callout and a finding, and lets the writing fill each of them', async () => {
    const at = await set(1440)
    // EACH OF THE FOUR SPANS THE REGION IT IS IN. `quoted` is a quoted line inside prose, which is
    // its own writing and its own box at once: its rail is drawn in front of the text, so a box
    // narrower than the region is a maximum on the element and nothing else.
    for (const name of ['callout', 'finding', 'quote', 'quoted']) {
      expect(el(at, name).width, `${name} does not span the region it is in`).toBe(at.body)
    }
    // AND THE WRITING INSIDE A BOX THAT HOLDS WRITING FILLS THAT BOX. The lead is drawn in front of
    // the text and taken off the box; nothing else may be taken off the writing.
    for (const name of ['bullets', 'numbered', 'calloutBody', 'findingDetail']) {
      const one = el(at, name)
      expect(one.writing, `no writing was drawn inside ${name}`).toBeGreaterThan(100)
      // TO THE PIXEL. The content box is the element's box less its padding and border, and each of
      // those is read to a hundredth, so the two can disagree in the second decimal place on a
      // fractional layout. A cap on the element is tens or hundreds of pixels; nothing this rule is
      // about hides inside a hundredth.
      expect(
        one.writing,
        `the writing inside ${name} is ${String(one.writing)}px inside a box of ${String(one.inner)}px, ` +
          'so something is ruling it besides the box it sits in',
      ).toBeCloseTo(one.inner, 1)
    }
  }, 120_000)

  /**
   * A CAPTION AND AN EMPTY STAND TAKE THE WIDTH OF THE COMPONENT THEY ARE IN.
   *
   * FROM tests/viz.test.ts, WHICH ASSERTED IT AS AN ABSENCE OF `max-width` on three selectors. A
   * reading measure belongs on the record's own reading matter. A figure's caption and the box that
   * stands where a picture is not sit inside a component that already has a width, and a second cap
   * inside the first is what put a 512px ribbon of 12px text under a 773px plot.
   */
  it('leaves the reading measure off a caption, which takes the width of its own figure', async () => {
    const at = await set(1440)
    expect(at.caption.width, 'the chart drew no caption').toBeGreaterThan(100)
    expect(
      at.caption.width,
      `the caption is ${String(at.caption.width)}px under a figure of ${String(at.caption.figure)}px`,
    ).toBe(at.caption.figure)
  }, 120_000)

  /**
   * A BOX INSIDE THE REPORT MEASURES ITSELF AND NOT THE REPORT.
   *
   * FROM tests/viz.test.ts, WHICH ASSERTED IT AS A STRING MATCH on `--read-w: var(--reading-in-box)`
   * in the rule for a run of markdown. The phone found the fault: `.sb-reads` resolves the measure
   * against the whole report body, which is right for the report body and wrong for a box nested
   * inside one. At 390 the detail under a finding is about 335px inside a 366px report, so a track
   * asking for the report body's width came out at 366px and took the page to 397px of scroll.
   *
   * THE MEASUREMENT THAT SAYS IT: at 390 the page does not scroll sideways, and the table typed
   * into a callout is drawn no wider than the callout's own content box.
   */
  it('keeps a nested run of markdown inside its own box, and the phone from scrolling sideways', async () => {
    for (const width of [1440, 390]) {
      const at = await set(width)
      const here = `at a ${String(width)}px window`
      expect(at.pageScroll, `${here}: the page scrolls sideways`).toBe(at.pageWidth)
      expect(at.inCallout.table, `${here}: the table inside the callout was not drawn`).toBeGreaterThan(50)
      expect(at.inCallout.table, `${here}: the table is drawn wider than the callout that holds it`)
        .toBeLessThanOrEqual(at.inCallout.body)
    }
  }, 180_000)

  /**
   * A SECTION'S BODY LAYS ITS OWN CHILDREN OUT, AND FOR SOME TIME IT DID NOT.
   *
   * `.sb-section-body` carried the class that makes a reading grid AND a rule saying `display:flex`.
   * The two weigh the same and the flex rule came later, so it won, and every block inside every
   * section on every report was laid out by a box with no tracks in it.
   *
   * THIS ASSERTED THE ABSENCE OF A `display:` DECLARATION IN THE STYLESHEET. What that absence is
   * FOR is that a block inside a section gets the same answer as the same block outside one: a table
   * is drawn at what its content measures, up to the section, and never stretched to fill it.
   */
  it('draws a table inside a section at its own content width, not stretched to the section', async () => {
    const at = await set(1440)
    expect(at.inSection.table, 'the table inside the section was not drawn').toBeGreaterThan(50)
    expect(at.inSection.body, 'the section drew no body').toBeGreaterThan(100)
    expect(at.inSection.table, 'the table is drawn wider than the section that holds it')
      .toBeLessThanOrEqual(at.inSection.body)
    expect(
      at.inSection.table,
      `the table fills its section exactly (${String(at.inSection.table)}px), which is a section body ` +
        'stretching its children instead of laying them out',
    ).toBeLessThan(at.inSection.body)
  }, 120_000)

  /**
   * NOTHING CAPS A PART AT A READING LINE BECAUSE OF WHAT THE REGION TREE SAYS IT HOLDS.
   *
   * THIS ASSERTED THE ABSENCE OF A `width` IN A RULE. Until 28 August 2026 the rule for a part that
   * needs only a reading line said `width: calc(var(--read-w) …)`, so such a part was shrunk to one
   * reading line wide and owned an empty band beside it. The owner overruled the band: a region owns
   * all of its space, and the reading measure is a track inside the part rather than a cap on it.
   *
   * MEASURED IN CHROMIUM AT 1440 on report N7uG7vTRJyLj: before, the parts of one report drew at
   * 558, 544, 1164, 708.4, 563 and 565.6 pixels; after, every part draws at the body width except
   * the tables, which draw at what they measure.
   */
  it('gives a part marked as needing only a reading line the whole of its region', async () => {
    const at = await set(1440)
    expect(at.needsReading, 'the region tree marked no part as needing only a reading line').toBeGreaterThan(0)
    expect(at.needsReading, 'a part that needs only a reading line is capped at one again').toBe(at.body)
  }, 120_000)
})

// ============================== how much width each part of the report takes

/**
 * THE PART OF THE REPORT TAKES THE WIDTH ITS OWN COMPOSITION NEEDS.
 *
 * THE DEFECT: the Semantic Region spans the wide report body, prose is capped
 * around 544px, and selecting the empty right-hand side shows a Semantic Region box with nothing in
 * it. Measured in Chromium on report OOOt4Kouc5dT at a 1440 window on 27 August 2026: the report
 * body was 1164px, every one of its passages was 1164px, every paragraph in them was 544px, and the
 * 620px beside each paragraph was drawn in by nothing while belonging to the passage.
 *
 * THE RULE IT NOW FOLLOWS, the owner's: the Semantic Region and its layout composition own the available
 * width; a readable prose measure may exist as an adaptive layout preference; it must not be a
 * universal component-local hard cap that permanently strands half the semantic region as dead
 * space.
 *
 * WHAT IS ASSERTED HERE is the drawn half — that the renderer writes what the region tree worked
 * out, and that the stylesheet acts on it. The derivation's own half is in
 * `tests/one-tree-of-meaningful-parts.test.ts`.
 */
describe('a part of the report takes the width its composition needs', () => {
  /** Drawn as part of a record, which is the only way the region tree exists to be asked. */
  function inARecord(blocks: unknown[]): string {
    return renderToStaticMarkup(
      h(sb.SummaryBlocks, {
        blocks,
        layout: 'page',
        inRecord: { recordId: 'rec-1', kind: 'report' },
      } as never),
    ).replace(/<style[\s\S]*?<\/style>/g, '')
  }

  it('marks a passage of nothing but sentences as needing only a reading line', () => {
    const out = inARecord([{ id: 'b-1', type: 'text', text: 'One sentence.\n\nAnd a second one.' }])
    // The control: something was drawn at all, so an empty render cannot pass the check below.
    expect(out, 'nothing was drawn, so this test measured nothing').toContain('sb-text')
    expect(out).toMatch(/class="sb-block sb-text"[^>]*data-needs="reading"/)
  })

  it('marks the same passage as needing the whole width once a table is typed into it', () => {
    const out = inARecord([
      { id: 'b-1', type: 'text', text: 'One sentence.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n' },
    ])
    expect(out, 'no table was drawn, so this test measured the wrong thing').toContain('sb-table')
    expect(out).toMatch(/class="sb-block sb-text"[^>]*data-needs="wide"/)
  })

  it('marks a columns block as needing the whole width even when every column is sentences', () => {
    const out = inARecord([
      {
        id: 'b-1',
        type: 'columns',
        columns: [[{ id: 'c-1', type: 'text', text: 'Left.' }], [{ id: 'c-2', type: 'text', text: 'Right.' }]],
      },
    ])
    expect(out).toMatch(/class="sb-block sb-columns"[^>]*data-needs="wide"/)
  })

  it('says nothing at all when nobody worked it out, rather than guessing a reading line', () => {
    // A settings preview draws blocks stored in no record. An absent answer is not a reading answer,
    // and a block with no answer keeps the whole width, which is what it had before any of this.
    const out = drawn('One sentence, drawn outside any record.')
    expect(out).not.toContain('data-needs=')
  })
})

// ============================================================================ the record page

const NOW = '2026-08-14 09:00:00'

function record(kind: RecordKind, data: Record<string, unknown>, over: Partial<PanelRecord> = {}): PanelRecord {
  return {
    id: 'rec-1',
    workspaceId: 'panelx',
    kind,
    title: 'Round four, for the owner',
    summary: null,
    data,
    origin: 'authored' as const,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ownerId: THE_TEST_OFFICES_OWNER.id,
    ...over,
  }
}

const REPORT_BLOCKS = [
  { id: 'b-1', type: 'heading', text: 'The short version', level: 2 },
  { id: 'b-2', type: 'text', text: 'Your loop closes now. Every arrow in it has a screen.' },
  {
    id: 'b-3',
    type: 'table',
    columns: [{ label: 'run' }, { label: 'reprojection error (px)', align: 'right' }],
    rows: [{ cells: ['before the knock', 0.4] }, { cells: ['after the knock', 1.9], state: 'failed' }],
    caption: 'Forty checkerboard frames each.',
  },
]

/** Everything `RecordDetail` needs, as plain data. Nothing here fetches. */
function detailProps(rec: PanelRecord, over: Record<string, unknown> = {}) {
  return {
    record: rec,
    editable: false,
    deleted: false,
    records: [rec],
    detailLinks: [],
    relations: [],
    evolutionLinks: [],
    log: { changes: [], sessions: [] },
    titles: [rec.title],
    titleById: new Map([[rec.id, rec.title]]),
    unfilledByRecord: new Map<string, number>(),
    body: page.bodySections(rec),
    onChanged: () => {},
    ...over,
  }
}

function detail(rec: PanelRecord, over: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(h(page.RecordDetail, detailProps(rec, over) as never)).replace(
    /<style[\s\S]*?<\/style>/g,
    '',
  )
}

describe('a record page draws a report as something a person wants to read', () => {
  const full = () =>
    record('report', {
      blocks: REPORT_BLOCKS,
      for: `${THE_TEST_OFFICES_OWNER.name}, who asked for the review`,
      date: '2026-08-13',
      read: 'unread',
    })

  it('opens with the writing itself, drawn as a document', () => {
    const html = detail(full())
    const text = readable(html)
    expect(text).toContain('Your loop closes now')
    expect(text).toContain('The short version')
    expect(html, 'the blocks are not drawn as a document').toContain('sb sb-doc')
    // The table block is drawn as a table, which is what a table block is for.
    expect(html).toContain('<table')
    expect(text).toContain('Forty checkerboard frames each')
  })

  it('says who it is for and which day it is about, near the top', () => {
    const text = readable(detail(full()))
    expect(text).toContain(`Written for ${THE_TEST_OFFICES_OWNER.name}, who asked for the review`)
    expect(text).toContain(createI18n('en').t('g2b.report.aboutDay', { day: formatDue('2026-08-13') }))
    // Before the writing, not after it.
    expect(text.indexOf(`Written for ${THE_TEST_OFFICES_OWNER.name}`)).toBeLessThan(text.indexOf('Your loop closes now'))
  })

  /** Read, not read, and nobody having said are three facts, and the third is the common one. */
  /**
   * THE THREE ANSWERS ARE STILL THREE, AND EACH IS NOW A WORD RATHER THAN A SENTENCE.
   *
   * This line once said
   * "Nobody has said whether it has been read." at reading size, on a page that offered no way to
   * say you had read it. The three answers are what this test is for and they are unchanged; what
   * changed is the ink each one costs. The whole sentence is on the mark's tooltip and in Developer
   * mode, and tests/absence-weight.test.ts holds both halves of that.
   *
   * ROUND 232 MOVED THE UNMARKED-READ ABSENCE OUT OF NORMAL MODE on the owner's decision, so normal mode
   * draws nothing about reading when nobody has said. The developer-mode half is proved
   * by tests/absence-weight.test.ts, not lost.
   */
  it('says which of the three read answers is stored, and never guesses the third', () => {
    const markup = (read: unknown): string =>
      detail(record('report', { blocks: REPORT_BLOCKS, for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-14', ...(read === undefined ? {} : { read }) }))
    const said = (read: unknown): string => readable(markup(read))
    expect(said('read')).toContain('Marked read.')
    expect(said('unread')).toContain('Marked unread.')
    const unsaid = said(undefined)
    expect(unsaid, 'normal mode still draws the absence of a read mark').not.toContain('not marked read')
    expect(unsaid, 'a report nobody has looked at is drawn as one somebody marked unread').not.toContain(
      'Marked unread.',
    )
    expect(
      markup(undefined),
      'the sentence that tells the two apart is drawn in normal mode again',
    ).not.toContain('Not marked read or unread')
  })

  /**
   * A WORD THIS BUILD CANNOT READ IS NOT NOBODY HAVING SAID. Something is stored; reading it as
   * absence is what turns a record somebody should fix into a record nobody knows is broken.
   */
  it('tells a word it cannot read apart from nobody having said', () => {
    const text = readable(
      detail(record('report', { blocks: REPORT_BLOCKS, for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-14', read: 'skimmed' })),
    )
    expect(text).toContain('skimmed')
    expect(text).toContain('neither read nor unread')
    expect(text, 'a stored word nothing can read is drawn as nobody having said').not.toContain(
      'Not marked read or unread',
    )
  })

  /**
   * SAID ONCE, IN THE MISSING-DETAILS PANEL (wave 13k round 37). The report's line said "nobody said who it is for"
   * while the panel above it said "Not filled in yet: who it is for.", so the line leaves it to the panel when the
   * panel names it. Round 232, acting on a decision, moved the absent day out of normal mode too, and
   * the panel is the one place that still names both absences. The panel is drawn by
   * RecordPage around this detail, so this render holds only the line; the panel's list is read here, and
   * tests/a-record-page-says-a-missing-summary-once.test.ts photographs the two together in a browser. Round 37c's
   * mutations, each after a control run: drawing the line whenever `for` is empty (ReportByline in
   * src/web/pages/RecordPage.tsx) goes red on the line; making a report's `for` not required (src/shared/kinds.ts)
   * goes red on the panel's list.
   */
  it('leaves a missing "who it is for" to the missing-details panel, which names it', () => {
    const data = { blocks: REPORT_BLOCKS }
    const panel = recordIncompleteness('report', data, null).map((item) => item.path)
    expect(
      panel,
      'the panel does not name who it is for, so leaving it off the line would say it nowhere',
    ).toContain('data.for')
    expect(
      panel,
      'the panel does not name the missing day, so leaving it off the line would say it nowhere',
    ).toContain('data.date')
    const text = readable(detail(record('report', data)))
    expect(text, "the report's line says it again beside the panel").not.toContain('nobody said who it is for')
    expect(text).not.toContain('Nobody has written who this report is for.')
    expect(text).not.toContain('Nobody has written which day this report is about.')
  })

  /**
   * THE WRITING IS NOT BEHIND A PRESS. Every other kind's stored fields are one-line folds, which is
   * right for a field and wrong for the thing somebody came to read.
   */
  it('does not fold a report away behind its own field names', () => {
    const rec = full()
    expect(page.bodySections(rec), 'a report field reached the fold stack').toEqual([])
    const html = detail(rec)
    const summaries = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => readable(m[1] ?? ''))
    for (const word of ['For', 'Date', 'Blocks', 'Read']) {
      expect(summaries.some((s) => s.includes(word)), `the report's ${word} is behind a press`).toBe(false)
    }
  })

  /** A page that drew an empty document would be saying the report is empty. It is not: it is broken. */
  it('says so when the writing is stored as something that is not a list of blocks', () => {
    const text = readable(detail(record('report', { blocks: 'the whole report as one string', for: THE_TEST_OFFICES_OWNER.name })))
    expect(text).toContain('a report is a list of blocks')
    expect(text).toContain('Stored fields')
  })

  it('tells an empty list of blocks apart from nobody having written anything', () => {
    expect(readable(detail(record('report', { blocks: [] })))).toContain('empty list of blocks')
    expect(readable(detail(record('report', {})))).toContain('Nothing is written in this report yet')
  })

  /** A report is a different job from a task. A task must be untouched by all of the above. */
  it('leaves a task drawn as a task', () => {
    const task = record('task', { state: 'todo', command: 'file the report' }, { title: 'A task' })
    const html = detail(task)
    expect(html, 'a task is being drawn as a report').not.toContain('rd-report')
    expect(html).not.toContain('sb-doc')
    expect(readable(html)).toContain('file the report')
    expect(html, 'a task lost its folded body').toContain('<summary>')
  })
})
