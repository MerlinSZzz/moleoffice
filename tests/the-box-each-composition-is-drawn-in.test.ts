// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY COMPOSITION IN ONE REPORT, ASKED ABOUT THE BOX IT IS ACTUALLY DRAWN IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/records/:id/layout` gave every composition in a report the one width it was handed.
 * Three reviewers measured the same consequence independently: a composition nested inside a part
 * 687.6 pixels wide was answered as though it stood in the whole 1164 pixel report, so the route
 * said it drew 859.5|286.5 and listed it under `honoured`, and the browser drew 395|160 with the
 * picture pinned at its floor. At some widths the two disagreed about whether the parts were side
 * by side at all.
 *
 * THAT IS THE FIRST ACCEPTANCE TEST INVERTED. That test states a preference the layout must
 * refuse, and checks that it refuses it for a stated reason. The route reported as honoured exactly
 * the preference the browser refuses, which is worse than saying nothing.
 *
 * A `columns` BLOCK GOT NO ANSWER AT ALL, which is the same fault seen from the other side: the
 * columns of a comparison fold into the same flex row as a composition's parts and go through the
 * same engine, so a report drawing ten rows side by side had nine of them reported.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY IT HAS TO BE A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The nesting is resolved by flexbox: which part is held at its floor, what its siblings absorb,
 * and whether a row wraps are decided by the engine and not by the text of the stylesheet. So this
 * file opens the report in Chromium, reads the drawn width of every row and of every part and
 * column inside it, asks the route the same question, and asserts the two answers are the same
 * pixels — for nine compositions, four of them nested, at two window widths.
 *
 * NOTHING HERE WRITES A PIXEL THIS REPOSITORY DECIDED SOMEWHERE ELSE. The report body's width, the
 * gap between parts, the root font size and the reading measure are all read out of the browser.
 * The floors come from `LEAST_REM` in src/shared/beside.ts. The path of a column comes from
 * `columnPath` in src/shared/regions.ts, which is the same function the region ids of the blocks
 * inside a column are built from.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { LEAST_REM } from '../src/shared/beside.ts'
import { columnPath } from '../src/shared/regions.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string

/** The eight compositions this file measures, by the region id each one is drawn from. */
const TOP = 'data.blocks[#b-top]'
const OUTER = 'data.blocks[#b-outer]'
const NESTED = 'data.blocks[#b-outer].parts[#p-nest].blocks[#b-inner]'
const COMPARISON = 'data.blocks[#b-cols]'
const HELD = 'data.blocks[#b-held]'
const AROUND = 'data.blocks[#b-around]'
const NESTED_COMPARISON = 'data.blocks[#b-around].parts[#p-right].blocks[#b-figcols]'
const FLIPPED = 'data.blocks[#b-flip]'
const NESTED_STACKS = 'data.blocks[#b-flip].parts[#p-narrow].blocks[#b-flipinner]'

/** The two window widths. 1440 draws the rows side by side; 390 draws them one under another. */
const WIDTHS = [1440, 390]

/** A paragraph long enough that its lines wrap at every width this file opens. */
const PROSE =
  'The mast moved four millimetres under load on every one of the forty runs, and it moved at the ' +
  'same joint each time, which is what makes this a fixing problem rather than a stiffness one.'

const prose = (id: string): unknown[] => [{ id, type: 'text', text: PROSE }]

/** A drawn picture that needs no file: a chart the renderer draws from its own numbers. */
const picture = (id: string): unknown[] => [
  {
    id,
    type: 'chart',
    spec: {
      kind: 'line',
      x: { label: 'run' },
      y: { label: 'movement', unit: 'mm' },
      series: [{ id: 's1', name: 'mast head', points: [{ x: 1, y: 4 }, { x: 2, y: 4.1 }] }],
    },
  },
]

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** One row drawn side by side, as the browser drew it. */
interface RowDrawn {
  /** The region id of the `beside` or `columns` block this row is drawn from. */
  regionId: string
  /** How wide the row's own box is drawn. This is the box its parts divide. */
  box: number
  /** Each part or column, in the order it was written, with its drawn width. */
  parts: { regionId: string | null; px: number }[]
}

interface Snapshot {
  /** The report body: the box the top-level rows stand in. */
  body: number
  /** The gap between parts, in pixels, read off a row rather than assumed. */
  gutter: number
  /** The reader's root font size, in pixels, read off the document rather than assumed. */
  rem: number
  /** How wide the `narrow` reading measure comes out, measured on a box the browser resolved. */
  read: number
  rows: RowDrawn[]
  pageScroll: number
  pageWidth: number
}

/** Open the report at one width and hand back every row the browser drew, in pixels. */
async function drawn(width: number): Promise<Snapshot> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.sb-beside').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    const w = (el: Element | null): number =>
      el === null ? -1 : Math.round(el.getBoundingClientRect().width * 100) / 100
    const first = document.querySelector('.sb-beside')
    return {
      body: w(document.querySelector('.sb')),
      gutter: first === null ? -1 : parseFloat(getComputedStyle(first).columnGap),
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      read: (() => {
        const probe = document.createElement('div')
        probe.style.width = getComputedStyle(document.documentElement).getPropertyValue('--read')
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        document.body.append(probe)
        const px = probe.getBoundingClientRect().width
        probe.remove()
        return px
      })(),
      // EVERY ROW THE REPORT DRAWS SIDE BY SIDE, whether it came from a `beside` block or a
      // `columns` block. They are one arrangement in the stylesheet and this reads them as one.
      rows: [...document.querySelectorAll('.sb-beside, .sb-columns')].map((row) => ({
        regionId: row.getAttribute('data-drawn-from') ?? '',
        box: w(row),
        parts: [...row.children]
          .filter((child) => child.matches('.sb-beside-part, .sb-column'))
          .map((child) => ({ regionId: child.getAttribute('data-drawn-from'), px: w(child) })),
      })),
      pageScroll: document.documentElement.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
    }
  })
}

/** One composition as the layout route answers about it. */
interface Said {
  regionId: string
  partsAre: 'regions' | 'columns'
  boxPx: number | null
  across?: { regionId: string; px: number }[] | null
  honoured?: string[]
  unhonoured?: { target: string; hint: string; because: string }[]
}

/** What GET /api/records/:id/layout says would be drawn in the box the browser drew. */
async function asked(at: Snapshot): Promise<Map<string, Said>> {
  // AS A NORMAL READER, WHICH IS WHAT THE PAGE ABOVE WAS OPENED AS. The browser stores no mode
  // and the address carries none, so `useReader` in src/web/lib/mode.ts answers `normal`. Asking
  // the route as anybody else would compare two different arrangements.
  const query =
    `?width=${String(at.body)}&gutter=${String(at.gutter)}` +
    `&rem=${String(at.rem)}&read=${String(at.read)}&reader=normal`
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}/layout${query}`)
  if (!res.ok) throw new Error(`the layout route answered ${String(res.status)}: ${await res.text()}`)
  const body = (await res.json()) as { compositions: Said[] }
  return new Map(body.compositions.map((one) => [one.regionId, one]))
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'nested-composition', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = (await post('/api/records', {
    kind: 'report',
    title: 'What the mast did on forty runs',
    summary: 'It moved at the same joint every time.',
    data: {
      date: '2026-08-29',
      blocks: [
        // ONE ROW AT THE TOP LEVEL, NOTHING STATED. The control: its box is the whole report body,
        // which is the width the route used to give every composition in the report.
        {
          id: 'b-top',
          type: 'beside',
          parts: [
            { id: 'p-a', blocks: prose('ba') },
            { id: 'p-b', blocks: prose('bb') },
          ],
        },
        // A COMPOSITION INSIDE A PART OF ANOTHER COMPOSITION, and the inner one asks for 9 to 1.
        // The part holding it is worth 3 of 5, so its box is much narrower than the report, and
        // nine tenths of THAT box is what the picture has to be measured against.
        {
          id: 'b-outer',
          type: 'beside',
          parts: [
            { id: 'p-words', share: 2, blocks: prose('bw') },
            {
              id: 'p-nest',
              share: 3,
              blocks: [
                {
                  id: 'b-inner',
                  type: 'beside',
                  parts: [
                    { id: 'p-in-text', share: 9, blocks: prose('bit') },
                    { id: 'p-in-pic', share: 1, blocks: picture('bip') },
                  ],
                },
              ],
            },
          ],
        },
        // A COMPARISON AT THE TOP LEVEL. Two columns of writing, worth the same by definition.
        { id: 'b-cols', type: 'columns', columns: [prose('bc0'), prose('bc1')] },
        // THE SAME REFUSAL AT THE TOP LEVEL, so the nested one above can be compared with a row
        // that really does stand in the whole report body.
        {
          id: 'b-held',
          type: 'beside',
          parts: [
            { id: 'p-big', share: 9, blocks: prose('bg') },
            { id: 'p-small', share: 1, blocks: picture('bs') },
          ],
        },
        // THE ONE WHERE THE TWO ANSWERS DISAGREE ABOUT WHETHER THE PARTS ARE SIDE BY SIDE AT ALL.
        // 3 to 2 fits easily in the whole report body and is drawn exactly as asked there, so a
        // route that answers about the report's width calls it given. Inside the part that actually
        // holds it there is not room for both floors, and the browser draws them one under another.
        {
          id: 'b-flip',
          type: 'beside',
          parts: [
            { id: 'p-wide', share: 3, blocks: prose('bfw') },
            {
              id: 'p-narrow',
              share: 2,
              blocks: [
                {
                  id: 'b-flipinner',
                  type: 'beside',
                  parts: [
                    { id: 'p-fi-text', share: 3, blocks: prose('bfit') },
                    { id: 'p-fi-pic', share: 2, blocks: picture('bfip') },
                  ],
                },
              ],
            },
          ],
        },
        // A COMPARISON INSIDE A PART OF A COMPOSITION. Two pictures, whose floors are 10rem each,
        // so they still go across inside a part far too narrow for two columns of writing.
        {
          id: 'b-around',
          type: 'beside',
          parts: [
            { id: 'p-left', blocks: prose('bl') },
            {
              id: 'p-right',
              blocks: [{ id: 'b-figcols', type: 'columns', columns: [picture('bf0'), picture('bf1')] }],
            },
          ],
        },
      ],
    },
  })) as { record: { id: string } }
  reportId = made.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('the layout route answers about the box each composition is actually drawn in', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Every assertion below compares a route answer with a drawn
   * width, and a page that drew nothing would hand back -1 for both and satisfy an equality by
   * accident. This says all nine rows are on the screen, all nine are reported, and the numbers the
   * rest of the file reads out of the browser were really read.
   */
  it('drew all nine rows and reported all nine, which is the control for everything below', async () => {
    const at = await drawn(1440)
    expect(at.body, 'the report body was not drawn at all').toBeGreaterThan(900)
    expect(at.rem, 'the root font size could not be read').toBeGreaterThan(0)
    expect(at.gutter, 'the gap between parts could not be read').toBeGreaterThan(0)
    expect(at.read, 'the reading measure could not be read').toBeGreaterThan(0)

    const said = await asked(at)
    expect([...said.keys()].sort(), 'the route and the browser do not hold the same seven rows').toEqual(
      [TOP, OUTER, NESTED, COMPARISON, HELD, AROUND, NESTED_COMPARISON, FLIPPED, NESTED_STACKS].sort(),
    )
    expect(at.rows.map((row) => row.regionId).sort(), 'the browser did not draw all nine rows').toEqual(
      [TOP, OUTER, NESTED, COMPARISON, HELD, AROUND, NESTED_COMPARISON, FLIPPED, NESTED_STACKS].sort(),
    )
    // AND A COMPARISON IS REPORTED AS A COMPARISON, so nothing has to read the shape of an id to
    // find out whether one of its parts can be pointed at.
    expect(said.get(COMPARISON)?.partsAre).toBe('columns')
    expect(said.get(NESTED_COMPARISON)?.partsAre).toBe('columns')
    expect(said.get(TOP)?.partsAre).toBe('regions')
  })

  /**
   * THE ASSERTION THE WHOLE FILE IS FOR. Every row, at both widths: the box the route says the
   * composition is drawn in is the box the browser drew it in, and every part is the width the
   * route said it would be.
   */
  it('says the same box and the same part widths the browser draws, for every row at both widths', async () => {
    let across = 0
    let stacked = 0
    for (const width of WIDTHS) {
      const at = await drawn(width)
      const said = await asked(at)
      const here = `at a ${String(width)}px window`
      expect(at.rows, `${here}: the browser drew a different number of rows`).toHaveLength(9)

      for (const row of at.rows) {
        const one = said.get(row.regionId)
        expect(one, `${here}: the route said nothing about ${row.regionId}`).not.toBeUndefined()
        expect(one?.boxPx, `${here}: the route has ${row.regionId} in a box of the wrong width`)
          .toBeCloseTo(row.box, 1)

        if (one?.across === null || one?.across === undefined) {
          // ONE UNDER ANOTHER: every part is the whole box, and the route says so by saying null.
          stacked += 1
          for (const part of row.parts) {
            expect(part.px, `${here}: ${row.regionId} was said to stack and a part is not the whole box`)
              .toBeCloseTo(row.box, 1)
          }
          continue
        }
        across += 1
        expect(one.across, `${here}: ${row.regionId} has the wrong number of parts`).toHaveLength(row.parts.length)
        row.parts.forEach((part, i) => {
          const promised = one.across?.[i]
          expect(promised?.px, `${here}: part ${String(i)} of ${row.regionId} was drawn at another width`)
            .toBeCloseTo(part.px, 1)
          // THE PARTS ARE JOINED BY NAME AND NOT ONLY BY POSITION, wherever there is a name. A
          // column has none, because a column is not a region, so its id is its stored path.
          if (part.regionId !== null) expect(promised?.regionId).toBe(part.regionId)
          else expect(promised?.regionId).toBe(columnPath(row.regionId, i))
        })
      }
      expect(at.pageScroll, `${here}: the page scrolls sideways`).toBe(at.pageWidth)
    }
    // AND BOTH ARRANGEMENTS WERE REALLY SEEN, so a build that stacked everything everywhere cannot
    // pass this by drawing every part at the width of its box.
    expect(across, 'no row was drawn side by side at any width').toBeGreaterThan(0)
    expect(stacked, 'no row was drawn one under another at any width').toBeGreaterThan(0)
  })

  /**
   * THE NESTED COMPOSITION IS IN A NARROWER BOX THAN THE REPORT, AND THE ROUTE KNOWS IT.
   *
   * This is the fault stated as a number. The route used to answer about the report's own width
   * here, so it reported a picture wide enough to keep 9 to 1 exactly and put the whole
   * composition in `honoured`. The browser holds that picture at its floor.
   */
  it('answers the nested composition about its own part, not about the report', async () => {
    const at = await drawn(1440)
    const said = await asked(at)
    const nested = said.get(NESTED)
    const part = at.rows.find((row) => row.regionId === OUTER)?.parts.find(
      (one) => one.regionId === 'data.blocks[#b-outer].parts[#p-nest]',
    )

    expect(part?.px, 'the part holding the nested composition was not drawn').toBeGreaterThan(0)
    expect(nested?.boxPx, 'the nested composition is not answered about the part it stands in')
      .toBeCloseTo(part?.px ?? -1, 1)
    // AND THAT BOX IS REALLY NARROWER THAN THE REPORT. Without this the assertion above would pass
    // on a build that still used the report's width, on any fixture where the two happened to meet.
    expect(nested?.boxPx ?? 0, 'the nested box is not narrower than the report body').toBeLessThan(at.body - 100)

    // THE PICTURE IS HELD AT ITS FLOOR, and the 9 it asked for is reported as not given.
    const small = nested?.across?.[1]
    expect(small?.regionId).toBe('data.blocks[#b-outer].parts[#p-nest].blocks[#b-inner].parts[#p-in-pic]')
    expect(small?.px, 'the picture in the nested composition is not held at its floor')
      .toBeCloseTo(LEAST_REM.figure * at.rem, 1)
    expect(nested?.honoured, 'the refused share was reported as honoured').toEqual([])
    expect(nested?.unhonoured?.map((one) => one.target)).toEqual([
      'data.blocks[#b-outer].parts[#p-nest].blocks[#b-inner].parts[#p-in-pic]',
    ])
  })

  /**
   * THE SAME SHARE IN THE WHOLE REPORT BODY, so the two can be compared. `b-held` asks for 9 to 1
   * in the report's own width and `b-inner` asks for 9 to 1 inside a part. The picture is held at
   * the same floor in both, and the writing beside it is a different width in each — which is what
   * says the route is answering about two different boxes rather than one.
   */
  it('draws the same share differently in a different box, and says so', async () => {
    const at = await drawn(1440)
    const said = await asked(at)
    const inTheReport = said.get(HELD)?.across
    const inAPart = said.get(NESTED)?.across
    const floor = LEAST_REM.figure * at.rem

    expect(inTheReport?.[1]?.px, 'the top-level picture is not at its floor').toBeCloseTo(floor, 1)
    expect(inAPart?.[1]?.px, 'the nested picture is not at its floor').toBeCloseTo(floor, 1)
    expect(inAPart?.[0]?.px ?? 0, 'the writing beside the nested picture is not narrower')
      .toBeLessThan(inTheReport?.[0]?.px ?? 0)
  })

  /**
   * THE ROUTE AND THE BROWSER USED TO DISAGREE ABOUT WHETHER THE PARTS ARE SIDE BY SIDE AT ALL, and
   * this is that case. `b-flipinner` asks for 3 to 2. In the whole 1164 pixel report body that is
   * drawn exactly as asked, so a route answering about the report's width calls it given. It is not
   * in the report body: it is in a part 458.4 pixels wide, where the two floors — 20rem for the
   * writing and 10rem for the picture — do not fit beside each other, and the browser draws them one
   * under another.
   */
  it('says one under another where the browser draws one under another, inside a part', async () => {
    const at = await drawn(1440)
    const said = await asked(at)
    const inner = said.get(NESTED_STACKS)
    const row = at.rows.find((one) => one.regionId === NESTED_STACKS)

    expect(inner?.boxPx, 'the nested composition is not in the part that holds it')
      .toBeCloseTo(row?.box ?? -1, 1)
    expect(inner?.boxPx ?? 0, 'the box is not narrower than the report body').toBeLessThan(at.body / 2)
    // THE BROWSER DREW THEM ONE UNDER ANOTHER: both parts are the whole box.
    for (const part of row?.parts ?? []) expect(part.px).toBeCloseTo(row?.box ?? -1, 1)
    // AND THE ROUTE SAYS SO, and says the 3 to 2 was not given rather than putting it in `honoured`.
    expect(inner?.across, 'the route says these parts are side by side and the browser stacks them').toBeNull()
    expect(inner?.honoured, 'a share the browser refuses was reported as honoured').toEqual([])
    expect(inner?.unhonoured?.[0]?.target).toBe(NESTED_STACKS)
    expect(inner?.unhonoured?.[0]?.hint).toBe('3 to 2')
    expect(inner?.unhonoured?.[0]?.because).toContain('one under another')
  })
})
