// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BAND BETWEEN THE READING COLUMN AND THE EDGE BELONGS TO SOMETHING.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMPLAINT THIS IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * A comment on a report said its lines did not break where the title's did, and seemed to use
 * only half of the column. Measured in Chromium at 1440 on
 * `NHtlTgnKAG8h`: the report body was 1164px, every block in it stood in a 544px lane, and 620px
 * of the page — 53% — carried no ink at all. A nine-row table typed into one of those paragraphs
 * was drawn at 542px while wanting 1414px.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE ANSWER IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * WHAT THIS FILE USED TO SAY HERE, AND WHY IT NO LONGER SAYS IT.
 *
 * It said: "IT IS NOT WIDER SENTENCES. 544px at 16px is about 68 characters, which is where a
 * reader's eye finds the next line without hunting for it. Stretching prose across 1164px would be
 * a worse report, not a wider one, so a paragraph is still drawn at the reading measure and this
 * file asserts that it is."
 *
 * THAT WAS AN AGENT DECIDING WHAT THE OWNER SHOULD HAVE MEANT, and it was hardened into assertions
 * on this file before it had been agreed. Two later requirements say the opposite:
 *
 *   - a fixed 544px lane for prose is not a rule, and no other fixed global lane replaces it
 *     (design/ROUND-ELEVEN-OWNER-MESSAGE.md, lines 551 and 570);
 *
 *   - a component does not fix the width of prose. The usable width comes from the semantic region
 *     and the layout's composition, not from one fixed narrow lane, and half of a usable region is
 *     never left empty for good (design/PROBLEM-REGISTER-OWNER-MESSAGE.md, problem 1).
 *
 * So the requirement is unchanged in spirit and inverted in its number: the band must still have an
 * owner, and the owner of the space nothing is placed in is the reading itself. A measure still
 * exists -- prose does not span the page -- but it is a share of the box rather than a fixed lane,
 * and what this file asserts is the share and the bound, not 544px.
 *
 * ---------------------------------------------------------------------------------------
 * AND THEN THE BAND ITSELF WAS OVERRULED
 * ---------------------------------------------------------------------------------------
 *
 * The paragraph above stopped being right when the question this campaign asked was answered, in
 * design/problem-01/OWNER-ANSWER-COMPOSITION.md:
 *
 *   - a composition of one part owns 100% of its semantic region;
 *   - no fixed 22% margin, and no empty second track, stays as a structural rule;
 *   - there are several columns only when the composition holds several sibling regions.
 *
 * THIS FILE ASSERTED THE BAND WAS UNDER A QUARTER, and that assertion is the thing that was overruled:
 *
 *     expect((at.body - at.sentence) / at.body).toBeLessThan(0.25)
 *     expect(at.sentence, 'the measure stopped binding entirely').toBeLessThan(at.body)
 *
 * Both are gone. Bounding the band was an agent's answer to a question nobody had asked, and the
 * band is not wanted. What is asserted instead is that there is none: the paragraph block spans the
 * region, and the sentences inside it fill the block. ACCEPTANCE.md criterion 3 -- the quarter --
 * was withdrawn in its own commit and replaced by C22, a region owns 100% of its space.
 *
 * A MEASURE STILL EXISTS, AS SOMETHING AN AGENT ASKS FOR. It is a preset on a prose child, applied
 * as a max-width on the text inside its own full-width column, and the engine may adapt it --
 * design/problem-01/COMPOSITION-DESIGN-AMENDMENT.md section 3. This fixture asks for none, like
 * every report in the corpus, so it draws full-column prose and that is the intended answer.
 *
 * WHAT IS STILL TRUE HERE. A paragraph block SPANS the whole width its parent gave it, and anything
 * the browser can measure -- a table, a picture -- or anything that fills -- a chart, a block of
 * code -- runs the whole of that width too. What changed is that the sentences do as well.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DRIVEN IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Every number here is a layout answer, and a stylesheet assertion cannot produce one. `--read-w`
 * is `100cqi`, a container query unit: what it resolves to is the engine's answer, not the
 * source's. The same file at 390 is what says the fix did not simply push the page sideways.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LEAST_REM } from '../src/shared/beside.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string

/** A nine-row table typed into a paragraph, exactly as the owner's own report holds one. */
const TYPED_TABLE = [
  'The runs are below, and the table is typed into this paragraph rather than stored as a table.',
  '',
  '| run | shell | grip force | held | what the operator wrote afterwards |',
  '| --- | --- | --- | --- | --- |',
  ...Array.from({ length: 9 }, (_, i) =>
    `| ${String(i + 1)} | v3 | ${String(11 + i)}.2 N | ${i % 3 === 0 ? 'no' : 'yes'} | ` +
    `the part came away at the same corner as the run before it, and the operator wrote that ` +
    `nothing about the printer had been changed between this run and the one before it |`),
].join('\n')

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** Open the report at one width and hand back what the browser drew, in pixels. */
async function drawnAt(width: number): Promise<{
  body: number
  paragraphBlock: number
  sentence: number
  typedTable: number
  storedTable: number
  /** What the stored table's own content measures, read with its floor lifted. */
  storedTableWants: number
  narrowTable: number
  narrowTableWants: number
  hugeTable: number
  hugeTableScrollsBy: number
  /** The reader's root font size in pixels, so a floor in rem can be checked in pixels. */
  rem: number
  pageScroll: number
  pageWidth: number
}> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.sb').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    const w = (el: Element | null): number =>
      el === null ? -1 : Math.round(el.getBoundingClientRect().width * 10) / 10
    /* WHAT THE CONTENT WANTS, ASKED OF THE BROWSER RATHER THAN GUESSED. Lifting the floor to 0 and
       reading the element again is what an agent did by hand in the developer tools to find that a
       table was being held 700px wider than its content. It is put back immediately, so nothing
       measured after this call sees a changed page. */
    const wants = (el: Element | null): number => {
      if (el === null) return -1
      const box = el as HTMLElement
      const before = box.style.minWidth
      box.style.minWidth = '0px'
      const got = w(box)
      box.style.minWidth = before
      return got
    }
    const blocks = [...document.querySelectorAll('.sb > .sb-text')]
    const stored = [...document.querySelectorAll('.sb > .sb-table')]
    const scroller = (el: Element | null): number => {
      const s = el?.querySelector('.sb-scroll') ?? null
      return s === null ? -1 : Math.round(s.scrollWidth - s.clientWidth)
    }
    return {
      body: w(document.querySelector('.sb')),
      paragraphBlock: w(blocks[0] ?? null),
      sentence: w(document.querySelector('.sb .sb-p')),
      typedTable: w(document.querySelector('.sb > .sb-text .sb-table')),
      storedTable: w(stored[0] ?? null),
      storedTableWants: wants(stored[0] ?? null),
      narrowTable: w(stored[1] ?? null),
      narrowTableWants: wants(stored[1] ?? null),
      hugeTable: w(stored[2] ?? null),
      hugeTableScrollsBy: scroller(stored[2] ?? null),
      rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      pageScroll: document.documentElement.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'theband', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = (await post('/api/records', {
    kind: 'report',
    title: 'What the gripper did on nine runs',
    summary: 'One run in three dropped the part.',
    data: {
      date: '2026-08-25',
      blocks: [
        {
          id: 'b-prose',
          type: 'text',
          text:
            'The gripper let go of the part on three of the nine runs, and the shell cracked at the ' +
            'same corner every time, which is what makes this a shell problem rather than a grip one.',
        },
        { id: 'b-typed', type: 'text', text: TYPED_TABLE },
        {
          id: 'b-stored',
          type: 'table',
          columns: [{ label: 'run' }, { label: 'result' }, { label: 'what the operator wrote' }],
          rows: [
            { cells: ['1', 'held', 'nothing about the printer was changed before this run at all'] },
            { cells: ['2', 'cracked', 'the part came away at the same corner as the run before it'] },
          ],
        },
        /* THREE STORED TABLES AND NOT ONE, because a width rule has three answers and a fixture
           with one table can only ever check the middle one. This one wants far less than its
           floor; the one above wants more than its floor and less than the region; the one below
           wants more than the region. */
        {
          id: 'b-narrow',
          type: 'table',
          columns: [{ label: 'n' }, { label: 'ok' }],
          rows: [{ cells: ['1', 'yes'] }, { cells: ['2', 'no'] }, { cells: ['3', 'yes'] }],
        },
        /* ITS CELLS HOLD ONE UNBREAKABLE WORD EACH, so the table cannot get under the region by
           wrapping. A first draft used ordinary sentences and the browser simply wrapped them: the
           table fitted the region and scrolled by 0, which measured wrapping rather than the width
           rule. A file path is the real case this stands for. */
        {
          id: 'b-huge',
          type: 'table',
          columns: Array.from({ length: 8 }, (_, c) => ({ label: `measurement_channel_${String(c + 1)}` })),
          rows: Array.from({ length: 3 }, (_, r) => ({
            cells: Array.from(
              { length: 8 },
              (_, c) => `/var/log/rig/run_${String(r + 1)}/channel_${String(c + 1)}_uncalibrated.ndjson`,
            ),
          })),
        },
      ],
    },
  })) as { record: { id: string } }
  reportId = made.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('a report fills its page without stretching its sentences', () => {
  it('really drew the report, so a page of nothing cannot pass quietly', async () => {
    const at1440 = await drawnAt(1440)
    expect(at1440.body, 'the report body was not drawn at all').toBeGreaterThan(900)
    expect(at1440.sentence, 'no sentence was drawn').toBeGreaterThan(100)
    expect(at1440.typedTable, 'the table typed into a paragraph was not drawn').toBeGreaterThan(100)
  })

  /**
   * THE MEASUREMENT THE WAVE IS ABOUT. The paragraph block spans, so the band belongs to it; the
   * table typed inside it uses the band; the sentence beside it does not.
   */
  it('spans the paragraph block across the page and lets its sentences fill it', async () => {
    const at = await drawnAt(1440)
    expect(at.paragraphBlock, 'the paragraph block still stands in the reading column').toBe(at.body)
    // AND NOTHING IS LEFT OVER BESIDE THE SENTENCES. This asked for a band under a quarter until
    // 28 August 2026; see the head of this file for what it said and who overruled it. A sentence
    // narrower than the block it is in, with nothing else in the row, is the band coming back.
    expect(
      at.sentence,
      `a sentence of ${at.sentence}px in a block of ${at.paragraphBlock}px leaves ` +
        `${Math.round(at.paragraphBlock - at.sentence)}px beside it with nothing in it`,
    ).toBe(at.paragraphBlock)
  })

  /**
   * A TABLE WANTING MORE THAN THE READING COLUMN TAKES WHAT THE PAGE WILL GIVE IT. This fixture's
   * table wants more than 1164px, so the answer is the whole report body — the band included. It
   * used to be the 544px reading column with 620px empty beside it.
   */
  it('lets a table typed into a paragraph take the whole of the region', async () => {
    const at = await drawnAt(1440)
    /* THIS ALSO ASKED FOR `typedTable > sentence`, and that comparison meant something only while
       the sentence stood in a narrow lane. Both are the region now, so the greater-than could never
       be true and asserting it would be asserting the band. What the test is for survives whole in
       the line below: a table wanting 1414px is given the region rather than a lane inside it. */
    expect(at.typedTable, 'a table wanting more than the page did not take the whole of it')
      .toBe(at.body)
  })

  /**
   * A STORED TABLE IS AS WIDE AS ITS OWN CONTENT, UP TO THE REGION, AND NO WIDER.
   *
   * WHAT THIS TEST REQUIRED UNTIL 29 AUGUST 2026, AND WHY THAT WAS WRONG. It said
   *
   *     expect(at.storedTable, 'a stored table is confined below the reading column')
   *       .toBeGreaterThanOrEqual(at.sentence)
   *
   * and its comment explained that a sentence is now the whole region, that this fixture's stored
   * table wants less than that, and that "`measured` blocks carry `min-width: var(--read-w)`, so
   * it draws at exactly the region and equality is the correct answer rather than a regression".
   *
   * THE EQUALITY WAS THE DEFECT, NOT THE PROOF. Holding a table at the region when its content
   * wants less is empty space inside a Semantic Region, which is the fault this whole campaign is
   * about. Measured in Chromium at 1440 on 29 August 2026 on the owner's own named acceptance
   * fixture aNblDVkNB8DR: the table drew at 1164px and its content wants 463.86px, so 700px --
   * sixty per cent of the region -- was empty inside the table, with the numbers pushed to the far
   * right and a gulf between each label and its figure. Three of the five tables on the owner's round-ten
   * report OOOt4Kouc5dT were held the same way: 932.05, 959.38 and 807.58px against 1164.
   *
   * WHAT IT SAYS NOW. The table is drawn at what its content measures. The comparison against a
   * sentence is gone in both directions: a sentence fills the region and a table does not have to,
   * so neither greater nor equal is a fact about tables any more.
   */
  it('draws a stored table at what its content wants, not at the region', async () => {
    const at = await drawnAt(1440)
    expect(at.storedTable, 'the stored table was not drawn').toBeGreaterThan(100)
    expect(
      at.storedTable,
      `the table is drawn at ${at.storedTable}px while its content wants ${at.storedTableWants}px, ` +
        `so ${Math.round(at.storedTable - at.storedTableWants)}px inside it is empty`,
    ).toBe(at.storedTableWants)
    expect(at.storedTable, 'a table that wants less than the region was still given all of it')
      .toBeLessThan(at.body)
  })

  /**
   * AND THE FLOOR THE MIN-WIDTH WAS THERE FOR IS STILL A FLOOR. Its original comment, from 20
   * August 2026, said it held a small table at the reading measure so a three-column table did not
   * shrink to a stripe. That reason is real: a table of two short columns in an 1164px region would
   * otherwise be drawn at about 100px with the region empty around it. The floor is now what the
   * block HOLDS -- LEAST_REM.panel, 15rem, the same number a part of a composition uses -- rather
   * than a reading measure that had nothing to do with tables.
   */
  it('holds a table that wants almost nothing at the floor for what it holds', async () => {
    const at = await drawnAt(1440)
    const floor = LEAST_REM.panel * at.rem
    expect(at.narrowTableWants, 'the narrow fixture table is not narrower than its own floor')
      .toBeLessThan(floor)
    expect(at.narrowTable, 'a table too small to be worth drawing was drawn at its own size')
      .toBe(floor)
  })

  /**
   * AND A TABLE THAT WANTS MORE THAN THE REGION TAKES THE REGION AND SCROLLS INSIDE ITS OWN BOX.
   * This is the third of the three answers, and it is the one that must not become a page that
   * scrolls sideways.
   */
  it('gives a table wanting more than the region the region, and scrolls it inside its own box', async () => {
    const at = await drawnAt(1440)
    expect(at.hugeTable, 'a table wanting more than the region did not take the whole of it')
      .toBe(at.body)
    expect(at.hugeTableScrollsBy, 'the widest table does not scroll inside its own box')
      .toBeGreaterThan(0)
    expect(at.pageScroll, 'the page scrolls sideways at 1440').toBe(at.pageWidth)
  })

  /**
   * AND AT 390 NOTHING WAS PUSHED SIDEWAYS. The second grid track is `minmax(0, 1fr)`, so it is 0
   * once the reading column has taken the container; a table wider than that scrolls inside its own
   * box. Since the reading column became the whole container that track is 0 at every width.
   * Without that, widening a table is a page that scrolls horizontally on a phone.
   */
  it('gives the band away at 390 rather than making the page scroll sideways', async () => {
    const at = await drawnAt(390)
    expect(at.pageScroll, 'the page scrolls sideways at 390').toBe(at.pageWidth)
    expect(at.paragraphBlock, 'the paragraph block is wider than the report body').toBeLessThanOrEqual(at.body)
    expect(at.typedTable, 'the table is wider than the report body').toBeLessThanOrEqual(at.body)
    /* ALL THREE STORED TABLES TOO, and the narrow one is the reason this line is here. Its floor is
       15rem, which is 240px at the default text size and less than the 366px body -- but a floor
       stated in rem can exceed the box on a small phone or at a large text size, and a min-width
       that exceeds its box is a page that scrolls sideways. The rule clamps it with min(..., 100%)
       and this is what checks the clamp. */
    for (const [name, drawn] of [
      ['the stored table', at.storedTable],
      ['the narrow table', at.narrowTable],
      ['the widest table', at.hugeTable],
    ] as const) {
      expect(drawn, `${name} is wider than the report body at 390`).toBeLessThanOrEqual(at.body)
    }
  })
})
