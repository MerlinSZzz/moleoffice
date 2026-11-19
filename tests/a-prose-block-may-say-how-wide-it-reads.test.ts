// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCE ABOUT A PROSE PART'S WIDTH, AND WHETHER IT CAN BE WRITTEN INTO A REPORT AT ALL.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * `design/problem-01/OWNER-ANSWER-COMPOSITION.md` lets the agent writing a report say, for a single
 * prose part, how wide its writing reads; that choice affects only the writing inside the part's
 * full-width column.
 *
 * Until 29 August 2026 that could not be stored. `measure` was a field of `BesidePart` and of
 * nothing else, and a `beside` block is refused with fewer than two parts, so the single prose part
 * the owner described had nowhere to live. No record in the corpus holds a composition, so the fourth layer
 * of the owner's model was unreachable in every report there is. Four independent checks each returned
 * MEETS IT NARROWLY and each named this.
 *
 * A prose BLOCK may now say how wide its own writing reads. This file is the proof of two of the
 * three doors that sentence needs:
 *
 *   1. THE WRITE DOOR stores it exactly as written, and refuses it on a block with no writing in it.
 *   2. THE LAYOUT ROUTE says what became of it, at a width, with the numbers read off a browser.
 *
 * THE THIRD DOOR IS SOMEBODY ELSE'S AND ALWAYS WAS. What the browser DRAWS — the writing narrowed
 * and the block left the whole of its region — is `tests/a-measure-never-shrinks-the-block.test.ts`.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE BROWSER CASES THAT WERE HERE WERE CUT ON 3 SEPTEMBER 2026, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * A third block of three cases opened the same report in the same browser on the same fixture and
 * measured the same two boxes as `tests/a-measure-never-shrinks-the-block.test.ts`: the block's own
 * element, which a measure may never move, and the writing inside it, which is what a measure
 * narrows. It did that at 1440 and at 390, for a preset, a ratio, `full` and the control.
 *
 * THAT FILE ASSERTS ALL OF IT AND MORE. It walks the same four blocks at both widths, it walks one
 * block of every type the write door accepts a measure on, and it holds the section case — a block
 * that HOLDS other blocks — which this file never had. Two files measuring one thing is two places
 * that can disagree, and the weaker of the two was here.
 *
 * WHAT IS LEFT IS WHAT NOTHING ELSE COVERS: the write door, and the layout route's sentences about
 * what became of a measure. The browser is still opened, because the layout route is asked about
 * the box the browser drew rather than a width this file made up.
 *
 * NOTHING HERE WRITES A PIXEL THIS REPOSITORY DECIDED SOMEWHERE ELSE. The root font size and every
 * drawn width are read out of the browser, and the `narrowest` preset comes from `MEASURE_MAX` and the
 * floor from `MEASURE_LEAST_REM`, both in src/shared/beside.ts.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { MEASURE_LEAST_REM, MEASURE_MAX } from '../src/shared/beside.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string

/**
 * THE WIDTH `narrowest` CAPS THE WRITING AT, TAKEN FROM THE ONE PLACE IT IS DECLARED.
 *
 * Read out of `MEASURE_MAX` rather than written here, so this file cannot come to hold a different
 * opinion about what `narrowest` means than the code that applies it. The check is because a preset is
 * allowed to be a token — `narrow` is `var(--read)` — and a token has no number to compare with.
 */
const NARROW = MEASURE_MAX.narrowest
if (NARROW === null || !NARROW.endsWith('rem')) {
  throw new Error(`this test reads the "narrowest" preset as a length in rem and it is ${String(NARROW)}`)
}
const NARROW_REM = Number(NARROW.slice(0, -'rem'.length))

/** The ratio the two ratio blocks ask for. Six tenths of a wide column reads; of a narrow one it does not. */
const RATIO = 0.4

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

/** One block as it was drawn, and what it asked for. */
interface BlockDrawn {
  /** The region id, which is how the browser and the layout route are joined. */
  regionId: string
  /**
   * The measure the report stated on it, or null when it stated none.
   *
   * TWO MORE NUMBERS WERE READ HERE UNTIL 3 SEPTEMBER 2026 — the block's own width and the width of
   * the writing inside it — and the three cases that read them were cut. They measured the same two
   * boxes on the same fixture as `tests/a-measure-never-shrinks-the-block.test.ts`, which asserts
   * all of it and more. Reading a number nothing asserts about is an invitation to assert it twice.
   */
  asked: string | null
}

interface Snapshot {
  /** The report body: the column every block below stands in. */
  body: number
  /** The reader's root font size, in pixels, read off the document rather than assumed. */
  rem: number
  /**
   * How wide the `narrow` reading measure comes out, in pixels, drawn and measured rather than
   * worked out. --read is declared once, in src/web/tokens.css, so the number is read off a box
   * the browser has resolved it on instead of being written here a second time.
   */
  read: number
  blocks: BlockDrawn[]
  pageScroll: number
  pageWidth: number
}

/** Open the report at one width and hand back what the browser drew, in pixels. */
async function drawn(width: number): Promise<Snapshot> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${String(webPort)}/#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.sb-block[data-least="sentence"]').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  return page.evaluate(() => {
    const w = (el: Element | null): number =>
      el === null ? -1 : Math.round(el.getBoundingClientRect().width * 100) / 100
    return {
      body: w(document.querySelector('.sb')),
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
      blocks: [...document.querySelectorAll('.sb-block[data-least="sentence"]')].map((el) => ({
        regionId: el.getAttribute('data-drawn-from') ?? '',
        asked: el.getAttribute('data-measure'),
      })),
      pageScroll: document.documentElement.scrollWidth,
      pageWidth: document.documentElement.clientWidth,
    }
  })
}

/** One block of the drawing, by the id it was stored under. */
function block(at: Snapshot, id: string): BlockDrawn {
  const found = at.blocks.find((b) => b.regionId === `data.blocks[#${id}]`)
  if (found === undefined) throw new Error(`the browser drew no block at data.blocks[#${id}]`)
  return found
}

/** What GET /api/records/:id/layout says about every measure, in the box the browser drew. */
async function saidAbout(
  at: Snapshot,
): Promise<Map<string, { columnPx: number | null; drawnPx?: number; because?: string | null }>> {
  // AS A NORMAL READER, WHICH IS WHAT THE PAGE ABOVE WAS OPENED AS. The browser stores no mode
  // and the address carries none, so `useReader` in src/web/lib/mode.ts answers `normal`. Asking
  // the route as anybody else would compare two different arrangements.
  const query = `?width=${String(at.body)}&gutter=18&rem=${String(at.rem)}&read=${String(at.read)}&reader=normal`
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}/layout${query}`)
  if (!res.ok) throw new Error(`the layout route answered ${String(res.status)}: ${await res.text()}`)
  const answer = (await res.json()) as {
    measures: {
      regionId: string
      measure: string | number
      columnPx: number | null
      drawnPx?: number
      because?: string | null
    }[]
  }
  return new Map(answer.measures.map((m) => [m.regionId, m]))
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'prose-block-measure', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = await post('/api/records', {
    kind: 'report',
    title: 'What the mast did on forty runs',
    summary: 'It moved at the same joint every time.',
    data: {
      date: '2026-08-29',
      blocks: [
        // THE OWNER'S WORKED EXAMPLE. One prose block, no composition anywhere near it, asking for a
        // narrower reading width than the column it stands in.
        { id: 'b-narrow', type: 'text', text: PROSE, measure: 'narrowest' },
        // THE CONTROL, AND EVERY ASSERTION BELOW IS A COMPARISON AGAINST IT. Same block, same
        // prose, nothing stated. It must draw the whole of the column at every width, which is
        // what says the column did not move when its neighbour narrowed its writing.
        { id: 'b-open', type: 'text', text: PROSE },
        // A RATIO RATHER THAN A NAME. Four tenths of a wide column is still a reading column; four
        // tenths of a phone is a strip, and the engine takes the column back there.
        { id: 'b-ratio', type: 'text', text: PROSE, measure: RATIO },
        // `full` STATED OUT LOUD. It asks for no maximum, so it must draw exactly what the control
        // draws — and a build that treated a stated measure as "always narrow something" fails here.
        { id: 'b-full', type: 'text', text: PROSE, measure: 'full' },
      ],
    },
  })
  if (made.status !== 201) throw new Error(`the report was not stored: ${String(made.status)} ${made.body}`)
  reportId = (JSON.parse(made.body) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('the write door takes a reading width on a block, and only where there is writing', () => {
  /**
   * NOTHING IS NORMALISED, DEFAULTED OR TRIMMED ON THE WAY THROUGH, so "nobody said" and "somebody
   * said `full`" stay two different facts in the row forever. The control block must come back with
   * no `measure` key at all rather than with `full` written into it.
   */
  it('stores what was written, exactly, and writes nothing into the block that said nothing', async () => {
    const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}`)
    const read = (await res.json()) as { record: { data: { blocks: Record<string, unknown>[] } } }
    const blocks = new Map(read.record.data.blocks.map((b) => [String(b['id']), b]))
    expect(blocks.get('b-narrow')?.['measure']).toBe('narrowest')
    expect(blocks.get('b-ratio')?.['measure']).toBe(RATIO)
    expect(blocks.get('b-full')?.['measure']).toBe('full')
    expect('measure' in (blocks.get('b-open') ?? {})).toBe(false)
  })

  /**
   * A READING WIDTH IS A STATEMENT ABOUT WRITING. On a table there is no reading width to set, so
   * the key would be stored and could never do anything — the silent no-op this product refuses.
   * The rule asks `leastNeededByBlocks`, which is the same question the composition's own rule asks.
   */
  it('refuses a reading width on a block that holds no writing, and names the block', async () => {
    const refused = await post('/api/records', {
      kind: 'report',
      title: 'A table asked for a reading width',
      summary: 'It should not be stored.',
      data: {
        date: '2026-08-29',
        blocks: [
          {
            id: 'b-table',
            type: 'table',
            measure: 'narrowest',
            columns: [{ label: 'run' }],
            rows: [{ cells: ['1'] }],
          },
        ],
      },
    })
    expect(refused.status).toBe(400)
    expect(refused.body).toContain('holds no writing')
    expect(refused.body).toContain('table')
  })

  /** A measure is a name or a ratio and never a width, in any unit. The same rule a share follows. */
  it('refuses a width dressed up as a measure', async () => {
    for (const bad of ['26rem', '40%', 520, 0.1]) {
      const refused = await post('/api/records', {
        kind: 'report',
        title: 'A measure written as a width',
        summary: 'It should not be stored.',
        data: { date: '2026-08-29', blocks: [{ id: 'b-1', type: 'text', text: PROSE, measure: bad }] },
      })
      expect(refused.status, `measure ${JSON.stringify(bad)} was accepted`).toBe(400)
    }
  })
})

describe('the layout route says what became of a measure, in the box the browser drew', () => {
  /**
   * THE CONTROL FOR THIS WHOLE FILE, AND IT COMES FIRST. Every assertion below reads a number out
   * of a browser, and a page that drew nothing at all hands back -1 and can satisfy a comparison by
   * accident. This says the report is on the screen, the measures reached the markup, and the
   * column is wide enough for anything below to be about anything.
   */
  it('really drew the four blocks, with each stated measure in the markup', async () => {
    const at = await drawn(1440)
    expect(at.body, 'the report body was not drawn at all').toBeGreaterThan(900)
    expect(at.rem, 'the root font size could not be read').toBeGreaterThan(0)
    expect(block(at, 'b-narrow').asked).toBe('narrowest')
    expect(block(at, 'b-open').asked).toBe(null)
    expect(block(at, 'b-ratio').asked).toBe(String(RATIO))
    expect(block(at, 'b-full').asked).toBe('full')
  })

  it('reports every stated measure and says nothing about the block that stated none', async () => {
    const at = await drawn(1440)
    const said = await saidAbout(at)
    expect([...said.keys()].sort()).toEqual([
      'data.blocks[#b-full]',
      'data.blocks[#b-narrow]',
      'data.blocks[#b-ratio]',
    ])
    // The column a block stands in is the whole of the report body, and the route says so in pixels.
    expect(said.get('data.blocks[#b-narrow]')?.columnPx).toBe(at.body)
    // At 1440 the column is wider than either measure asks for, so both are drawn as asked. What
    // happens when the column is narrower than the measure is the last test in this file.
    expect(said.get('data.blocks[#b-narrow]')?.because).toBe(null)
    expect(said.get('data.blocks[#b-ratio]')?.because).toBe(null)
  })

  /**
   * RULE 2, ANSWERED IN WORDS. Four tenths of a phone-width column is under `MEASURE_LEAST_REM`, so
   * the column wins and the route has to say why rather than reporting it honoured.
   */
  it('refuses a ratio that would leave a strip, and says why in a sentence', async () => {
    const at = await drawn(390)
    expect(at.body * RATIO, 'the fixture no longer reaches under the floor at 390').toBeLessThan(
      MEASURE_LEAST_REM * at.rem,
    )
    // AND THE COLUMN AT 390 REALLY IS NARROWER THAN THE PRESET, which is the condition the second
    // half of this case is about. Without it the preset's refusal below could be true of a fixture
    // that had stopped reaching the case at all, and the sentence would be asserted about nothing.
    expect(at.body, 'the fixture no longer has a column narrower than the preset at 390').toBeLessThan(
      NARROW_REM * at.rem,
    )
    const said = await saidAbout(at)
    expect(said.get('data.blocks[#b-ratio]')?.because).toContain('too narrow to read a sentence in')
    /*
     * A REFUSAL IS ABOUT ONE BLOCK, AND THIS IS WHAT THAT LOOKS LIKE.
     *
     * The line here until 29 August 2026 was `expect(said.get('data.blocks[#b-narrow]')?.because)
     * .toBe(null)`, under the comment "The preset beside it is untouched". At 390 the column was 366
     * pixels, as it is again since wave 13q's round 23 took the corner button's column away (it was
     * 302 in rounds 20 to 22), and `narrowest` asks for 416, so the preset is not untouched: its
     * maximum never binds and its writing fills its column, exactly as the refused ratio's writing does. Both are now
     * reported as not drawn at what they asked for, and what makes them separate answers is that
     * the two reasons are different sentences about different numbers.
     */
    const ratio = said.get('data.blocks[#b-ratio]')
    const preset = said.get('data.blocks[#b-narrow]')
    expect(preset?.because, 'the preset was reported as given in a column too narrow for it').not.toBe(null)
    expect(preset?.because).toContain('narrower than')
    expect(preset?.because).not.toContain('too narrow to read a sentence in')
    expect(ratio?.because).not.toBe(preset?.because)
    // AND BOTH SAY WHAT THE WRITING COMES OUT AT, which is the whole column here, for both of them.
    expect(ratio?.drawnPx).toBe(at.body)
    expect(preset?.drawnPx).toBe(at.body)
    // A BLOCK THAT ASKED FOR `full` IS STILL GIVEN WHAT IT ASKED FOR at the same width: it asks for
    // the whole column and it gets the whole column. Without this the two assertions above could be
    // met by reporting every measure on a narrow screen as refused.
    expect(said.get('data.blocks[#b-full]')?.because).toBe(null)
  })
})
