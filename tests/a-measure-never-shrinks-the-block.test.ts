// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STATED READING MEASURE NARROWS THE WRITING AND NEVER THE BOX THE WRITING STANDS IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `tests/what-the-browser-draws-of-a-composition.test.ts` guards this for a part of a composition.
 * Nothing guarded it for a block, and no record in the corpus holds a composition, so the whole of
 * layer 4 as an author actually writes it was unguarded. It shipped broken. The rule read
 * `.sb-block[data-least="sentence"] { max-width: var(--sb-measure) }`, so a block that stated a
 * measure was narrowed itself.
 *
 * MEASURED IN CHROMIUM AT 1440 ON 29 AUGUST 2026, on a report body 1164px wide:
 *
 *   a text block stating `narrow`     drawn 416px wide — the region shrank to fit its writing
 *   a section block stating `narrow`  drawn 416px wide, and the table stored inside it drawn
 *                                     1164px wide: 748px of the table outside its parent's box
 *
 * The 26rem preset was called `narrow` that day. It is called `narrowest` now.
 *
 * The write door accepted both. `design/problem-01/COMPOSITION-DESIGN-AMENDMENT.md` section 3
 * prints the rule that was broken in bold — "a preset must never be implemented by shrinking the
 * part" — and adds that a measure changes only the prose measure inside its full-width column and
 * does not reduce what the parent Semantic Region owns.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY IT HAS TO BE A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Which box a maximum lands on, and what is then drawn outside what, is decided by the engine and
 * not by the text of a stylesheet. A test that read the stylesheet could asserts only that a
 * selector is spelt a particular way, which drifts the first time anybody restructures the CSS. So
 * this file reads two boxes for every block — the block, and the writing inside the block — and a
 * third for the section case: the rectangle of everything inside the section, which must stay
 * inside the section's own rectangle.
 *
 * NOTHING HERE WRITES A PIXEL THIS REPOSITORY DECIDED SOMEWHERE ELSE. Every width is read out of
 * the browser; the preset lengths come from `MEASURE_MAX` and the floor from `MEASURE_LEAST_REM`,
 * both in src/shared/beside.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE THIRD TEST IS THE ONE THAT HOLDS TWO ANSWERS TOGETHER
 * ---------------------------------------------------------------------------------------
 *
 * The write door decides whether a measure may be stored on a block by asking `leastNeededByBlocks`
 * whether the block holds writing at all. The renderer decides which elements the maximum lands on
 * by marking the elements it draws one run of words into. Those are two different questions with
 * two different answers, and nothing makes them agree: a block type the door accepts and the
 * renderer never narrows would store a preference that does nothing, which is the silent no-op this
 * product refuses. So the third test asks the DOOR which block types it accepts a measure on —
 * every one of the twenty-one, built from the examples the product publishes — and then requires
 * the browser to draw something narrower inside each of them.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { MEASURE_LEAST_REM, MEASURE_MAX } from '../src/shared/beside.ts'
import { SHAPE_SPECS, type FieldSpec } from '../src/shared/kinds.ts'
import { SUMMARY_BLOCK_TYPES } from '../src/shared/types.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string
/** The block types the write door let a measure through on, asked of the door itself. */
let accepted: string[] = []

/**
 * THE PRESET WIDTHS, TAKEN FROM THE ONE PLACE THEY ARE DECLARED, so this file cannot come to hold
 * a different opinion about what `narrowest` means than the code that applies it. `narrow` is a
 * token — `var(--read)` — and has no number here, so it is left to the file that reads --read off
 * a drawn box; this one uses the two presets that are lengths.
 */
function remOf(preset: 'narrowest' | 'wide'): number {
  const said = MEASURE_MAX[preset]
  if (said === null || !said.endsWith('rem')) {
    throw new Error(`this test reads the "${preset}" preset as a length in rem and it is ${String(said)}`)
  }
  return Number(said.slice(0, -'rem'.length))
}
const NARROW_REM = remOf('narrowest')
const WIDE_REM = remOf('wide')

/**
 * A RATIO THAT STILL BINDS ON A PHONE. Nine tenths of the 366px column at 390 is 329px, which clears
 * the 16rem floor (256px), so 390 draws a block and its writing at two different widths as well as
 * 1440 does. Without it every preset is wider than the column at 390 and the narrow window proves
 * nothing.
 *
 * IT WAS 0.8 UNTIL WAVE 13Q'S ROUND 22. From round 20 to round 22 every page kept a 64px column clear
 * of the corner chat button, and the column at 390 was 302px. Eight tenths of 302 is 242px, under the
 * floor, so the ratio stopped binding at 390 and merge entry pEyavbRJYPMU bounced on this file. Round
 * 23 took that column away, and the column measured in the browser is 366px
 * at 390 and 1164px at 1440 again. 0.9 is kept: it binds at both, and it would still bind if a column
 * of that size came back.
 */
const RATIO = 0.9

/** A paragraph long enough that its lines wrap at every width this file opens. */
const PROSE =
  'The mast moved four millimetres under load on every one of the forty runs, and it moved at the ' +
  'same joint each time, which is what makes this a fixing problem rather than a stiffness one.'

async function post(path: string, body: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.text() }
}

/** One block of the given type, built from the examples `GET /api/kinds` publishes for it. */
function exampleBlock(type: string): Record<string, unknown> {
  const name = SHAPE_SPECS.SummaryBlock?.discriminator?.variants?.[type]
  expect(name, `SummaryBlock's discriminator must name a shape for "${type}"`).toBeDefined()
  const shape = SHAPE_SPECS[String(name)]
  expect(shape, `${type} must have a shape`).toBeDefined()
  const out: Record<string, unknown> = {}
  for (const f of (shape?.fields ?? []) as readonly FieldSpec[]) {
    // `measure` is published on every block and valid only on some, which is the rule under test.
    if (f.key === 'measure') continue
    // AND `audience` IS LEFT OUT BECAUSE ITS PUBLISHED EXAMPLE IS "developers", which is the mark
    // that keeps a block off a normal reader's screen. Built in, every block below would be stored
    // and none of them drawn, and this file would be measuring an empty page.
    if (f.key === 'audience') continue
    out[f.key] = f.example
  }
  return out
}

/** A report holding one block, used to ask the write door what it accepts. */
const oneBlockReport = (block: unknown) => ({
  kind: 'report',
  title: 'One block that stated a reading width',
  summary: 'Asking the write door what it accepts.',
  data: { date: '2026-08-29', blocks: [block] },
})

/** What one block was drawn as: the box, and the writing inside the box. */
interface BlockDrawn {
  /** The stored id, which is how a fixture written above is joined to a rectangle drawn below. */
  id: string
  /** The block's own element. This is the region, and a measure may never move it. */
  box: { w: number; left: number; right: number }
  /**
   * The narrowest run of writing drawn at or inside the block. This is what a measure narrows.
   * A `heading` block is its own writing — there is nothing inside it but words — so the element
   * is looked for at the block as well as under it.
   */
  writing: number
  /** The rectangle everything drawn inside the block fits in. It may not leave `box`. */
  inside: { left: number; right: number }
  /** The measure the report stated on this block, or null when it stated none. */
  asked: string | null
}

interface Snapshot {
  /** The report body: the column every block below stands in. */
  body: number
  rem: number
  blocks: BlockDrawn[]
  pageScroll: number
  pageWidth: number
}

/** Open the report at one width and hand back what the browser drew, in pixels. */
async function drawn(width: number): Promise<Snapshot> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.sb-block').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    const round = (n: number): number => Math.round(n * 100) / 100
    const w = (el: Element | null): number => (el === null ? -1 : round(el.getBoundingClientRect().width))
    const blocks = [...document.querySelectorAll('.sb-block[data-drawn-from]')].map((el) => {
      const box = el.getBoundingClientRect()
      const written = [...(el.matches('[data-writing]') ? [el] : []), ...el.querySelectorAll('[data-writing]')]
      // EVERY BOX DRAWN INSIDE THIS ONE, so a child drawn outside its parent is a measurement and
      // not an impression. A zero-width element is skipped: it is drawn nowhere and its left edge
      // is not evidence of anything.
      const held = [...el.querySelectorAll('*')]
        .map((kid) => kid.getBoundingClientRect())
        .filter((r) => r.width > 0)
      const path = el.getAttribute('data-drawn-from') ?? ''
      return {
        id: path.slice(path.lastIndexOf('[#') + 2, path.lastIndexOf(']')),
        box: { w: round(box.width), left: round(box.left), right: round(box.right) },
        writing: written.length === 0 ? -1 : Math.min(...written.map((el) => w(el))),
        inside: {
          left: held.length === 0 ? round(box.left) : round(Math.min(...held.map((r) => r.left))),
          right: held.length === 0 ? round(box.right) : round(Math.max(...held.map((r) => r.right))),
        },
        asked: el.getAttribute('data-measure'),
      }
    })
    return {
      body: w(document.querySelector('.sb')),
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      blocks,
      pageScroll: document.documentElement.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
    }
  })
}

/** One block of the drawing, by the id it was stored under. */
function block(at: Snapshot, id: string): BlockDrawn {
  const found = at.blocks.find((b) => b.id === id)
  if (found === undefined) throw new Error(`the browser drew no block stored as "${id}"`)
  return found
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'measure-never-shrinks', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  // ASK THE DOOR, ONE BLOCK TYPE AT A TIME, rather than writing a list of types here. A list here
  // would be a second answer to a question src/server/lib/summary.ts already answers, and the day
  // a twenty-second block type is added the list would quietly not cover it.
  for (const type of SUMMARY_BLOCK_TYPES) {
    const said = await post('/api/records', oneBlockReport({ ...exampleBlock(type), measure: 'narrowest' }))
    if (said.status === 201) accepted.push(type)
    else expect(said.body, `${type} was refused for some other reason`).toContain('holds no writing')
  }
  expect(accepted.length, 'the write door accepts a measure on no block type at all').toBeGreaterThan(0)

  const made = await post('/api/records', {
    kind: 'report',
    title: 'What the mast did on forty runs',
    summary: 'It moved at the same joint every time.',
    data: {
      date: '2026-08-29',
      blocks: [
        // THE OWNER'S WORKED EXAMPLE, AND THE CONTROL FOR IT. Same prose, one stating a measure.
        { id: 'b-narrow', type: 'text', text: PROSE, measure: 'narrowest' },
        { id: 'b-wide', type: 'text', text: PROSE, measure: 'wide' },
        { id: 'b-ratio', type: 'text', text: PROSE, measure: RATIO },
        { id: 'b-full', type: 'text', text: PROSE, measure: 'full' },
        { id: 'b-open', type: 'text', text: PROSE },
        // A PARAGRAPH AND A QUOTED LINE IN ONE BLOCK THAT STATES A MEASURE. Problem hdSTTKTgSR3J:
        // the quoted line's rail and lead were inside the measured box, so its words came out
        // narrower than the paragraph's. The fifth test reads these two.
        { id: 'b-quoted', type: 'text', text: `${PROSE}\n\n> ${PROSE}`, measure: 'narrowest' },
        // THE CASE THAT SHIPPED BROKEN. A section is a block that holds other blocks, and one of
        // them cannot be narrowed: a table is drawn at the width of the box it is given and keeps
        // its own minimum. Narrow the section and the table is drawn outside it.
        {
          id: 'b-section',
          type: 'section',
          title: 'A section that stated a reading width',
          measure: 'narrowest',
          blocks: [
            { id: 's-text', type: 'text', text: PROSE },
            {
              id: 's-table',
              type: 'table',
              columns: [{ label: 'run' }, { label: 'what the joint did under load' }, { label: 'movement' }],
              rows: [
                { cells: ['1', 'the same joint moved, at the same place, on every run', '4.1 mm'] },
                { cells: ['2', 'the same joint moved, at the same place, on every run', '4.0 mm'] },
              ],
            },
          ],
        },
        // ONE BLOCK OF EVERY TYPE THE DOOR ACCEPTS A MEASURE ON, each stating one. The third test
        // reads these; the ids are the type, so a failure names the block type that broke.
        ...accepted.map((type) => ({ ...exampleBlock(type), id: `t-${type}`, measure: 'narrowest' })),
      ],
    },
  })
  if (made.status !== 201) throw new Error(`the report was not stored: ${String(made.status)} ${made.body}`)
  reportId = (JSON.parse(made.body) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('a stated measure narrows the writing inside a block and never the block', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Every assertion below compares two drawn widths, and a page
   * that drew nothing hands back -1 for both and can satisfy a comparison by accident. This says
   * the blocks are on the screen, the measures reached the markup, and the column is wide enough
   * for anything below to be about anything.
   */
  it('really drew the fixture, with each stated measure in the markup', async () => {
    const at = await drawn(1440)
    expect(at.body, 'the report body was not drawn at all').toBeGreaterThan(900)
    expect(at.rem, 'the root font size could not be read').toBeGreaterThan(0)
    expect(block(at, 'b-narrow').asked, 'the stated measure never reached the markup').toBe('narrowest')
    expect(block(at, 'b-open').asked, 'a block that stated nothing was marked anyway').toBe(null)
    expect(block(at, 'b-section').asked).toBe('narrowest')
    for (const id of ['b-narrow', 'b-wide', 'b-ratio', 'b-full', 'b-open']) {
      expect(block(at, id).writing, `no writing was drawn inside ${id}`).toBeGreaterThan(100)
    }
  })

  /**
   * THE ASSERTION THE WHOLE FILE IS FOR, AT THE TWO WIDTHS THE PRODUCT IS REVIEWED AT. Two numbers
   * for every block: the block, which is the whole of the column at 1440 and at 390 whatever it
   * stated, and the writing, which is the smaller of the column and what was asked for.
   *
   * WHY BOTH WIDTHS SAY SOMETHING. At 1440 the column is 1164px and every preset binds. At 390 it
   * is 366px, narrower than `narrowest` and `wide` both, so
   * those two stop binding and their writing fills the column — rule 1 — while the ratio still binds
   * and still draws two different numbers.
   */
  it('draws the block at the whole column and the writing at the measure, at 1440 and at 390', async () => {
    const bound: number[] = []
    for (const width of [1440, 390]) {
      let bit = 0
      const at = await drawn(width)
      const here = `at a ${String(width)}px window`
      const open = block(at, 'b-open')
      expect(open.box.w, `${here}: the block that stated nothing does not own the column`).toBe(at.body)
      expect(open.writing, `${here}: writing with no stated measure does not fill its block`).toBe(at.body)

      const wanted: Record<string, number> = {
        'b-narrow': Math.min(at.body, NARROW_REM * at.rem),
        'b-wide': Math.min(at.body, WIDE_REM * at.rem),
        'b-ratio': RATIO * at.body >= MEASURE_LEAST_REM * at.rem ? RATIO * at.body : at.body,
        'b-full': at.body,
      }
      for (const [id, width] of Object.entries(wanted)) {
        const drew = block(at, id)
        expect(drew.box.w, `${here}: stating a measure changed how wide ${id} was drawn`).toBe(at.body)
        expect(drew.writing, `${here}: the writing inside ${id} was not held to what was asked for`)
          .toBeCloseTo(width, 1)
        if (width < at.body) bit += 1
      }
      expect(at.pageScroll, `${here}: the page scrolls sideways`).toBe(at.pageWidth)
      bound.push(bit)
    }
    // AND A MEASURE REALLY BIT AT EACH WIDTH SEPARATELY. Every assertion above is an equality
    // against the column, and a build where no measure narrows anything meets all of them. At 1440
    // three of the four bind; at 390 only the ratio does, because the column there is narrower
    // than both presets.
    expect(bound, 'a stated measure narrowed no writing at one of the two windows').toEqual([3, 1])
  })

  /**
   * THE SECTION, WHICH IS WHERE NARROWING THE BLOCK STOPPED BEING A PURITY ARGUMENT. A section
   * holds other blocks and a table is one of them. The section keeps the whole column, the writing
   * inside it is held to the preset, and nothing drawn inside the section is drawn outside it.
   */
  it('keeps a section the whole column and draws nothing outside it, at 1440 and at 390', async () => {
    for (const width of [1440, 390]) {
      const at = await drawn(width)
      const here = `at a ${String(width)}px window`
      const section = block(at, 'b-section')
      const table = block(at, 's-table')
      expect(section.box.w, `${here}: the section was narrowed by the measure it stated`).toBe(at.body)
      /* WHAT THIS REQUIRED UNTIL 29 AUGUST 2026, AND WHY IT DOES NOT ANY MORE. It said
         "toBe(section.box.w)": the table inside the section had to be exactly as wide as the
         section. That was the right shape of evidence for the defect this test was written
         against -- a section narrowed to 416px with its table still drawn 1164px wide, 748px of it
         outside the section's own box -- but it stated more than the defect needs. It required
         every table to fill its region, which is the separate fault that a table was held 700px
         wider than its own content on the owner's named acceptance fixture.
         WHAT IT REQUIRES NOW: the table is drawn, and it is drawn no wider than the section it is
         inside. A table 748px past its parent's right edge still fails it. Measured at 1440 after
         the width fix: the section is 1164px and its table is 544.33px, which is what that table's
         three columns actually measure. */
      expect(table.box.w, `${here}: the table inside the section was not drawn`).toBeGreaterThan(50)
      expect(table.box.w, `${here}: the table is drawn wider than the section that holds it`)
        .toBeLessThanOrEqual(section.box.w)
      expect(section.inside.left, `${here}: something inside the section is drawn off its left edge`)
        .toBeGreaterThanOrEqual(section.box.left)
      expect(section.inside.right, `${here}: something inside the section is drawn off its right edge`)
        .toBeLessThanOrEqual(section.box.right)
      // AND THE WRITING INSIDE THE SECTION IS WHAT THE MEASURE MOVED. Without this the three
      // assertions above are met by a build where a stated measure does nothing at all.
      expect(block(at, 's-text').writing, `${here}: the writing inside the section did not narrow`)
        .toBeCloseTo(Math.min(at.body, NARROW_REM * at.rem), 1)
    }
  })

  /**
   * A QUOTED LINE READS AS WIDE AS THE PARAGRAPH BESIDE IT. Problem hdSTTKTgSR3J.
   *
   * The measure used to land on the quoted line's whole box, rail and lead included, so a block
   * stating a measure drew its quoted words one lead and one rail narrower than its paragraph: two
   * column widths in one block. What is compared is the width the WORDS get in each, which is the
   * element's drawn width less its own border and padding.
   *
   * At 1440 the preset binds and the two must match. At 390 the column is narrower than the preset,
   * so the paragraph fills the column and the quoted line, which starts one lead and one rail in, can
   * only fill what is left of it; there the check is that it stays inside the block.
   *
   * THE MUTATION: delete the rule for .sb-quoted[data-writing] after the [data-writing] rule in
   * SUMMARY_CSS in src/web/components/SummaryBlocks.tsx. The 1440 comparison goes red, the quoted
   * words 17px narrower than the paragraph's (399 against 416).
   */
  it('gives the words of a quoted line the same measure as the paragraph beside it', async () => {
    for (const width of [1440, 390]) {
      await drawn(width)
      const here = `at a ${String(width)}px window`
      const read = await page.evaluate(() => {
        const box = document.querySelector('.sb-block[data-drawn-from$="[#b-quoted]"]')
        if (box === null) return null
        const words = (el: Element | null): number => {
          if (el === null) return -1
          const style = getComputedStyle(el)
          const sides = ['borderLeftWidth', 'borderRightWidth', 'paddingLeft', 'paddingRight'] as const
          return el.getBoundingClientRect().width - sides.reduce((sum, side) => sum + parseFloat(style[side]), 0)
        }
        const quoted = box.querySelector('.sb-quoted[data-writing]')
        return {
          block: box.getBoundingClientRect().right,
          paragraph: words(box.querySelector('p[data-writing]')),
          quoted: words(quoted),
          quotedRight: quoted === null ? -1 : quoted.getBoundingClientRect().right,
        }
      })
      expect(read, `${here}: the block holding the quoted line was not drawn`).not.toBeNull()
      if (read === null) return
      expect(read.paragraph, `${here}: no paragraph was drawn in the block`).toBeGreaterThan(100)
      expect(read.quoted, `${here}: no quoted line was drawn in the block`).toBeGreaterThan(100)
      if (width === 1440) {
        expect(read.quoted, `${here}: the quoted words are measured narrower than the paragraph's`)
          .toBeCloseTo(read.paragraph, 0)
      }
      expect(read.quotedRight, `${here}: the quoted line is drawn past its block`).toBeLessThanOrEqual(read.block + 0.5)
    }
  })

  /**
   * THE WRITE DOOR AND THE RENDERER, HELD TOGETHER. Every block type the door accepted a measure on
   * has writing drawn narrower than the block. A type the door accepts and the renderer ignores
   * stores a preference that can never do anything, and that is the silent no-op this product
   * refuses rather than a cosmetic gap.
   */
  it('narrows writing inside every block type the write door accepts a measure on', async () => {
    const at = await drawn(1440)
    const asked = Math.min(at.body, NARROW_REM * at.rem)
    expect(asked, 'the preset no longer binds at 1440, so this test proves nothing').toBeLessThan(at.body)
    for (const type of accepted) {
      const drew = block(at, `t-${type}`)
      expect(drew.asked, `the measure stored on the ${type} block never reached the markup`).toBe('narrowest')
      expect(drew.writing, `a measure on a ${type} block narrows nothing the browser draws`)
        .toBeCloseTo(asked, 1)
      // AND THE BLOCK ITSELF DID NOT MOVE, unless the block IS its own writing. A heading block
      // holds words and nothing else, so its region and its writing are the same box and there is
      // nothing inside it that narrowing it could push out.
      if (drew.box.w !== drew.writing) {
        expect(drew.box.w, `a measure on a ${type} block narrowed the block`).toBe(at.body)
      }
    }
  })
})
