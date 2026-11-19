// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A BROWSER ACTUALLY DRAWS OF A COMPOSITION: THE PART, THE WRITING INSIDE IT, AND THE FLOOR.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The composition layer was built in thirteen commits and then read by four reviewers. All four
 * found the same hole: the invariant the owner named above every other one was guarded by nothing.
 * Three separate changes to the stylesheet each broke it, and the whole suite — 9,566 tests —
 * stayed green through all three:
 *
 *   1. Move the reading measure off the writing inside a part and onto the part itself. The part
 *      then shrinks to fit the writing. Measured in Chromium before this file existed: the part
 *      asking for `narrow` (the 26rem preset, called `narrowest` now) went from 573px to 416px and
 *      handed 157px to its sibling.
 *   2. Make that same rule `max-width: none`. No stated measure narrows anything, ever, while
 *      GET /api/records/:id/layout goes on reporting every measure as honoured.
 *   3. Change `min-width: min(var(--least), 100%)` on a part to `min-width: 0`. The browser then
 *      has no way to hold a part at the smallest size it is still worth reading at, so 9 to 1 is
 *      drawn at 9 to 1 however narrow that makes the small part.
 *
 * The first is the exact mistake `design/problem-01/COMPOSITION-DESIGN-AMENDMENT.md` section 3
 * names and tells a builder not to make: "a preset must never be implemented by shrinking the
 * part". The same line is drawn in
 * `design/problem-01/OWNER-ANSWER-COMPOSITION.md`:
 *
 *   the preference changes only the prose measure inside its full-width column; it does not
 *   reduce what the parent Semantic Region owns, and it makes no sibling track that nothing can
 *   occupy.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT HAS TO BE A BROWSER, AND NOT A SOURCE ASSERTION
 * ---------------------------------------------------------------------------------------
 *
 * All three are layout answers. Which box a maximum lands on, and what flexbox then does with the
 * rest of the row, is decided by the engine and not by the text of the stylesheet. A test that read
 * the stylesheet could only assert that a particular selector is spelt a particular way, which is
 * the same fact written in two places and drifts the first time anybody restructures the CSS. So
 * this file measures two boxes separately — the drawn width of the PART, and the drawn width of the
 * WRITING inside it — and asserts that a stated measure changes the second and never the first.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MEASURES AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here writes a pixel that this repository decided somewhere else. The gap between parts
 * and the reader's root font size are read out of the browser, the floors come from `LEAST_REM` and
 * the preset widths from `MEASURE_MAX`, both in src/shared/beside.ts, and every part width is also
 * checked against what GET /api/records/:id/layout says it will be. That last check is what ties
 * the browser and the server together: `drawnAt` states the flexbox algorithm a second time so the
 * refusal can be answered in words with no screen anywhere, and this is the test that stops the two
 * statements drifting apart.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { LEAST_REM, MEASURE_MAX } from '../src/shared/beside.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string

/** The three compositions this file measures, by the region id each one is drawn from. */
const MEASURED = 'data.blocks[#b-measure]'
const PLAIN = 'data.blocks[#b-plain]'
const FLOOR = 'data.blocks[#b-floor]'

/**
 * THE WIDTH `narrowest` CAPS THE WRITING AT, TAKEN FROM THE ONE PLACE IT IS DECLARED.
 *
 * Read out of `MEASURE_MAX` rather than written here, so this file cannot come to hold a different
 * opinion about what `narrowest` means than the code that applies it. The check is because the type
 * allows a preset to be a token like `var(--read)` — `narrow` is one — and a token has no number
 * this file could turn into pixels.
 */
const NARROW = MEASURE_MAX.narrowest
if (NARROW === null || !NARROW.endsWith('rem')) {
  throw new Error(`this test reads the "narrowest" preset as a length in rem and it is ${String(NARROW)}`)
}
const NARROW_REM = Number(NARROW.slice(0, -'rem'.length))

/**
 * THE FOUR VIEWPORT WIDTHS THE MEASURE IS READ AT.
 *
 * They are the four `ACCEPTANCE.md` criterion C26 names, and they are the four
 * `node tools/review.mjs` photographs every screen at: one per band of the layout. 1440 and 990
 * draw the compositions beside each other, 660 and 390 draw them one under another, so the loop
 * below covers both arrangements rather than only the wide one.
 */
const WIDTHS = [1440, 990, 660, 390]

/** A paragraph long enough that its lines wrap at every width this file opens. */
const PROSE =
  'The mast moved four millimetres under load on every one of the forty runs, and it moved at the ' +
  'same joint each time, which is what makes this a fixing problem rather than a stiffness one.'

const prose = (id: string): unknown[] => [{ id, type: 'text', text: PROSE }]

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** One part, as it was drawn: the box, the block inside it, and the writing inside the block. */
interface PartDrawn {
  /** The region id, which is what the layout route reports about and how the two are joined. */
  regionId: string
  /** What the part itself was drawn at. Layer 3's box. */
  part: number
  /**
   * What the first block inside the part was drawn at. A block is a Semantic Region too, so a
   * measure may not move this one either — which is what the 29 August 2026 fix changed and what
   * the third assertion below is now for.
   */
  block: number
  /** What the writing inside it was drawn at. Layer 4's box. -1 when there is no writing in it. */
  writing: number
  /** The measure the report stated on this part, or null when it stated none. */
  asked: string | null
}

interface Snapshot {
  body: number
  /** The gap between parts, in pixels, read off the row rather than assumed. */
  gutter: number
  /** The reader's root font size, in pixels, read off the document rather than assumed. */
  rem: number
  /**
   * How wide the `narrow` reading measure comes out, in pixels, drawn and measured rather than
   * worked out. --read is declared once, in src/web/tokens.css, so the number is read off a box
   * the browser has resolved it on instead of being written here a second time.
   */
  read: number
  parts: PartDrawn[]
  pageScroll: number
  pageWidth: number
}

/** Open the report at one width and hand back what the browser drew, in pixels. */
async function drawn(width: number): Promise<Snapshot> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.sb-beside').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    const w = (el: Element | null): number =>
      el === null ? -1 : Math.round(el.getBoundingClientRect().width * 100) / 100
    const row = document.querySelector('.sb-beside')
    const parts = [...document.querySelectorAll('.sb-beside-part')].map((el) => ({
      regionId: el.getAttribute('data-drawn-from') ?? '',
      part: w(el),
      // THE BLOCK INSIDE THE PART, AND THE WRITING INSIDE THE BLOCK. Three boxes, not two.
      //
      // WHAT THIS READ UNTIL 29 AUGUST 2026: `writing` was the direct child block, under the
      // comment "This is the box a measure is allowed to narrow". It is not: a block is a Semantic
      // Region and the owner's sentence is that a measure "does not reduce the parent Semantic
      // Region's ownership". A block narrowed as a box also takes anything inside it that cannot
      // be narrowed — measured at 1440 the same day, a section block asked to read narrow drew at
      // 416px with its stored table drawn 1164px wide, 748px of it outside its own parent's box.
      // So the maximum lands on the writing itself, and BOTH boxes above it must keep their width.
      block: w(el.querySelector(':scope > .sb-block[data-least="sentence"]')),
      writing: w(el.querySelector('[data-writing]')),
      asked: el.getAttribute('data-measure'),
    }))
    return {
      body: w(document.querySelector('.sb')),
      gutter: row === null ? -1 : parseFloat(getComputedStyle(row).columnGap),
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
      parts,
      pageScroll: document.documentElement.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
    }
  })
}

/** The parts of one composition, in the order they were written. */
function partsOf(at: Snapshot, block: string): PartDrawn[] {
  return at.parts.filter((p) => p.regionId.startsWith(`${block}.parts[#`))
}

/** What GET /api/records/:id/layout says would be drawn in a box of this width. */
async function asked(at: Snapshot): Promise<Map<string, number | null>> {
  // AS A NORMAL READER, WHICH IS WHAT THE PAGE ABOVE WAS OPENED AS. The browser stores no mode
  // and the address carries none, so `useReader` in src/web/lib/mode.ts answers `normal`. Asking
  // the route as anybody else would compare two different arrangements.
  const query =
    `?width=${String(at.body)}&gutter=${String(at.gutter)}&rem=${String(at.rem)}&read=${String(at.read)}&reader=normal`
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}/layout${query}`)
  if (!res.ok) throw new Error(`the layout route answered ${String(res.status)}: ${await res.text()}`)
  const body = (await res.json()) as {
    compositions: { regionId: string; across: { regionId: string; px: number }[] | null }[]
  }
  const said = new Map<string, number | null>()
  for (const composition of body.compositions) {
    // NULL MEANS THE PARTS ARE DRAWN ONE UNDER ANOTHER, and every part is then the whole width.
    if (composition.across === null) said.set(composition.regionId, null)
    else for (const part of composition.across) said.set(part.regionId, part.px)
  }
  return said
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'drawn-composition', viewport: { width: 1440, height: 1000 } })
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
        // TWO PROSE PARTS, ONE OF THEM ASKING FOR A NARROW MEASURE. Neither states a share, so both
        // are worth the same and any difference between their drawn widths is the measure leaking
        // out of the writing and onto the part.
        {
          id: 'b-measure',
          type: 'beside',
          parts: [
            { id: 'p-narrow', measure: 'narrowest', blocks: prose('bn') },
            { id: 'p-open', blocks: prose('bo') },
          ],
        },
        // THE SAME COMPOSITION WITH NOTHING STATED, which is the control for the one above: the
        // parts of the two must be drawn at the same width, at every viewport.
        {
          id: 'b-plain',
          type: 'beside',
          parts: [
            { id: 'p-one', blocks: prose('b1') },
            { id: 'p-two', blocks: prose('b2') },
          ],
        },
        // A SHARE THE LAYOUT MUST REFUSE. Nine tenths of the row would put the second part far
        // under the smallest width writing is still worth reading at, so the browser has to hold it
        // at that width and give the rest to its neighbour.
        {
          id: 'b-floor',
          type: 'beside',
          parts: [
            { id: 'p-big', share: 9, blocks: prose('bg') },
            { id: 'p-small', share: 1, blocks: prose('bs') },
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

describe('a stated measure narrows the writing and never the part', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Every assertion below compares two drawn widths, and a page
   * that drew no composition at all would hand back -1 for both boxes and could satisfy an equality
   * by accident. This says the compositions are on the screen, the measure reached the markup, and
   * the parts are wide enough for the assertions below to be about anything.
   */
  it('really drew all three compositions, with the measure on the part that asked for one', async () => {
    const at = await drawn(1440)
    expect(at.body, 'the report body was not drawn at all').toBeGreaterThan(900)
    expect(at.rem, 'the root font size could not be read').toBeGreaterThan(0)
    expect(at.gutter, 'the gap between parts could not be read').toBeGreaterThan(0)
    expect(partsOf(at, MEASURED).map((p) => p.asked), 'the stated measure never reached the markup')
      .toEqual(['narrowest', null])
    for (const part of at.parts) {
      expect(part.part, `${part.regionId} was not drawn`).toBeGreaterThan(100)
      expect(part.block, `no block was drawn inside ${part.regionId}`).toBeGreaterThan(100)
      expect(part.writing, `no writing was drawn inside ${part.regionId}`).toBeGreaterThan(100)
    }
    expect(at.parts, 'not every part of the three compositions was drawn').toHaveLength(6)
  })

  /**
   * THE ASSERTION THE WHOLE FILE IS FOR. The part that asked for a narrow measure is drawn at
   * exactly the width it would have been drawn at with no measure stated anywhere.
   *
   * Three ways of saying it at each width, because each catches the mistake at a different remove:
   * against its own sibling, against the same composition with nothing stated, and against the
   * arithmetic — half the row less the gap where the parts are beside each other, the whole report
   * body where they are one under another.
   */
  it('leaves the part exactly as wide as it would be if no measure had been stated', async () => {
    let across = 0
    let stacked = 0
    for (const width of WIDTHS) {
      const at = await drawn(width)
      const here = `at a ${String(width)}px window`
      const [narrow, open] = partsOf(at, MEASURED)
      const [one, two] = partsOf(at, PLAIN)

      expect(narrow?.part, `${here}: the part asking for a narrow measure is not as wide as its own sibling`)
        .toBe(open?.part)
      expect(narrow?.part, `${here}: stating a measure changed how wide the part was drawn`)
        .toBe(one?.part)
      expect(two?.part, `${here}: the control composition is not two equal parts`).toBe(one?.part)

      // AND THE WIDTH IS THE ONE THE ARRANGEMENT ASKS FOR. Without this the three equalities above
      // would be satisfied by every part collapsing to the same wrong number.
      if (narrow?.part === at.body) {
        stacked += 1
      } else {
        across += 1
        expect(narrow?.part, `${here}: the part is not half the row less the gap`)
          .toBeCloseTo((at.body - at.gutter) / 2, 1)
      }
      expect(at.pageScroll, `${here}: the page scrolls sideways`).toBe(at.pageWidth)
    }
    // AND BOTH ARRANGEMENTS WERE REALLY SEEN. A change that stacked every composition at every
    // width would otherwise pass this test while ruining the product.
    expect(across, 'no window drew the parts beside each other').toBeGreaterThan(0)
    expect(stacked, 'no window drew the parts one under another').toBeGreaterThan(0)
  })

  /**
   * AND THE WRITING INSIDE IT IS THE THING THAT MOVED. `narrowest` is a maximum on the blocks inside
   * the part, so the writing is held at that width while the part keeps the whole of its share.
   * Without this assertion `max-width: none` on that rule passes everything else in the suite.
   *
   * A MAXIMUM, SO THE COLUMN WINS WHERE THE COLUMN IS NARROWER. That is rule 1 in the comment on
   * `MEASURE_LEAST_REM`, and it is why the wanted width is the smaller of the two rather than the
   * preset. It is also why stacking does not promote a measure to `full`: at 660 and 390 the parts
   * are one under another, so each column is the whole report body, and the preset still applies
   * wherever the body is wider than it.
   */
  it('holds the writing inside that part to the measure that was asked for', async () => {
    let bound = 0
    for (const width of WIDTHS) {
      const at = await drawn(width)
      const here = `at a ${String(width)}px window`
      const [narrow, open] = partsOf(at, MEASURED)
      const wanted = Math.min(narrow?.part ?? 0, NARROW_REM * at.rem)
      if (wanted < (narrow?.part ?? 0)) bound += 1

      expect(narrow?.writing, `${here}: the writing was not held to the measure that was asked for`)
        .toBeCloseTo(wanted, 1)
      // AND THE BLOCK BETWEEN THE PART AND THE WRITING DID NOT MOVE EITHER. It is a region, it
      // owns its space, and a maximum meant for the writing may not be spent on it.
      expect(narrow?.block, `${here}: the measure narrowed the block instead of the writing in it`)
        .toBe(narrow?.part)
      // AND A PART NOBODY STATED A MEASURE ON FILLS ITS COLUMN. This is what says the number above
      // is the measure at work rather than something narrowing every paragraph in the product.
      expect(open?.writing, `${here}: writing with no stated measure does not fill its own column`)
        .toBe(open?.part)
    }
    // AND THE MEASURE REALLY BIT SOMEWHERE. At 390 the column is narrower than the preset, so the
    // writing filling its column is the right answer there and proves nothing on its own.
    expect(bound, 'the stated measure narrowed the writing at no window at all').toBeGreaterThan(0)
  })
})

describe('a part is never drawn under the smallest size it is still worth reading at', () => {
  /**
   * THE FLOOR IS WHAT MAKES A SHARE A PREFERENCE RATHER THAN A COMMAND. Nine tenths of the row
   * would draw the small part far under the width writing is readable at, so the browser holds it
   * there and its neighbour takes the rest. Delete the floor from the stylesheet and 9 to 1 comes
   * out as 9 to 1, which is a build that treats a stored share as a percentage.
   */
  it('holds the small part of a 9 to 1 row at its floor and gives the rest to its neighbour', async () => {
    const at = await drawn(1440)
    const [big, small] = partsOf(at, FLOOR)
    const floor = LEAST_REM.sentence * at.rem
    const room = at.body - at.gutter
    // What a build with no floor would draw, said here so the assertion below states what it is
    // ruling out rather than only what it wants.
    const unheld = room * 0.1

    expect(small?.part, 'the small part was not held at the smallest width writing is readable at')
      .toBeCloseTo(floor, 1)
    expect(small?.part, `9 to 1 was drawn as asked, which would put the part at ${String(Math.round(unheld))}px`)
      .toBeGreaterThan(unheld)
    expect(big?.part, 'the neighbour did not take the room the small part gave up')
      .toBeCloseTo(room - floor, 1)
  })

  /**
   * AND THE BROWSER AND THE SERVER AGREE ABOUT EVERY PART. `drawnAt` in src/shared/beside.ts states
   * the flexbox algorithm a second time so a refusal can be answered in words with no screen
   * anywhere. That is a deliberate second statement of one fact, and this is what holds the two
   * together: same report, same width, same gap, same root font size, same pixels.
   */
  it('draws every part at the width the layout route said it would', async () => {
    const at = await drawn(1440)
    const said = await asked(at)
    expect(said.size, 'the layout route reported on no part of this report at all').toBe(6)
    for (const part of at.parts) {
      const promised = said.get(part.regionId)
      expect(promised, `the layout route said nothing about ${part.regionId}`).not.toBeUndefined()
      expect(promised, `the layout route said ${part.regionId} would be stacked and it was not`).not.toBeNull()
      expect(part.part, `${part.regionId} was drawn at a width the layout route did not promise`)
        .toBeCloseTo(promised ?? -1, 1)
    }
  })
})
