// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COUNTER ROW UNDER THE SETTINGS GRID IS DRAWN WHOLE, AT 1440 AND 390 IN THE LIGHT THEME.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The bottom row of *How much each thing says* draws a count over a denominator — 27 over /42, 566
 * over /566. Every denominator came out with about its bottom third washed away, at 1440, 990, 660
 * and 390, in light and dark alike. It was reported as a clip. Problem `qdCdRX7EBg3j`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT ACTUALLY WAS: A MARK ANSWERING A ROUNDING
 * ---------------------------------------------------------------------------------------
 *
 * Nothing was clipped. `.dsay-grid` scrolls sideways, which makes the browser treat its vertical
 * axis as scrollable too, and its rows are fractional: measured at 1440, the box is 435.42px tall,
 * `clientHeight` reports 435 — a whole number rounded down — and `scrollHeight` reports 437 — a
 * whole number rounded up. `sidesWithMore` in src/web/components/InReach.tsx read that as two pixels
 * of content below the fold and the reach mark drew its 24px fade and 2px rule across the counter
 * row. The fade is what took the bottom off the numbers.
 *
 * `NEARLY_IN_REACH` is the tolerance for exactly this and it was one pixel. Both ends of the
 * comparison are rounded, so each can lose most of a pixel; it is two.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * Because the fault is a browser laying a box out in fractions and reporting whole numbers. Nothing
 * about it is visible to a renderer that produces markup, and the rule tested without a browser —
 * `sidesWithMore` over made-up numbers — is the rule that was already passing while this shipped.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PAGE ALONE NO LONGER SHOWS THE ROUNDING
 * ---------------------------------------------------------------------------------------
 *
 * Commit 505882a2c (30 September 2026) made each count a button with 2px of padding above and below.
 * The counter row grew from 34.594px to 47.688px, and at 1440 the grid went from 469.406px, read as
 * 469 and 471, to 482.5px, read as 483 and 483. Measured on 24 October 2026 at all four widths in
 * both themes, and at page zooms from 0.8 to 1.75: the two numbers were equal every time. So the
 * drawing cases could not tell a tolerance of one pixel from two, and this file stayed green with
 * `NEARLY_IN_REACH` put back to 1 (problem `zmD5cZicVqa9`).
 *
 * The cases under "the mark does not answer a rounding" make the rounding on the page instead. They
 * put content 1.5px past the grid's bottom edge, at eight heights a fraction of a pixel apart, and
 * first check that the browser reads at least one of them as two whole pixels apart. A browser that
 * stops rounding that way turns them red with that message, rather than leaving them green and blind.
 *
 * The 1.5 and the 2 are the fault's own numbers, not a copy of `NEARLY_IN_REACH`. A case that read
 * the constant would move with it, and the mutation below would then change nothing it checks.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THIS
 * ---------------------------------------------------------------------------------------
 *
 *   make `sidesWithMore` in src/web/components/InReach.tsx always report 'down' — both drawing cases
 *     go red: the grid says there is more below it.
 *
 *   put `NEARLY_IN_REACH` back to 1 — both cases that make the rounding go red, at 1440 and 390: the
 *     grid says there is more below it where two whole pixels are less than two pixels of content.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, theResizeIsDrawn, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  app = await liveApp({ name: 'counter-row', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The two widths of the layout this file keeps: the widest and the narrowest. */
const WIDTHS = [1440, 390]

/** What the counter row measures against the box that holds it. */
interface Reading {
  /** Which sides the reach mark says the grid carries on past, or null where it says none. */
  more: string | null
  /** The lowest point any denominator reaches, measured down from the bottom of the grid. */
  denominatorBelowTheBox: number
  /** How many denominators were found, so an empty page cannot pass this quietly. */
  denominators: number
}

async function readCounterRow(width: number, theme: 'light' | 'dark'): Promise<Reading> {
  await page.setViewportSize({ width, height: 1000 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/#/settings/detail`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.dsay-counter', { timeout: 30_000 })
  // The grid measures its own box after the browser has laid it out.
  await theResizeIsDrawn(page)
  return page.evaluate(() => {
    const grid = document.querySelector('.dsay-grid')
    if (grid === null) throw new Error('the settings grid is not on the page')
    const box = grid.getBoundingClientRect()
    const denominators = [...grid.querySelectorAll('.dsay-count i')]
    return {
      // THE MARK IS ON THE WRAPPER, not on the grid: `InReachMark` puts the box it measured inside
      // an element that carries the fade and the rule.
      more: grid.parentElement?.getAttribute('data-more') ?? null,
      denominatorBelowTheBox: Math.max(
        ...denominators.map((el) => el.getBoundingClientRect().bottom - box.bottom),
      ),
      denominators: denominators.length,
    }
  })
}

describe('the numbers under the settings grid are not covered by the mark that says there is more', () => {
  for (const width of WIDTHS) {
    for (const theme of ['light'] as const) {
      it(`draws the counter row whole at ${String(width)} in ${theme}`, async () => {
        const read = await readCounterRow(width, theme)
        expect(read.denominators, 'the counter row drew no denominators at all').toBeGreaterThan(0)
        // THE FAULT ITSELF. A grid that says it carries on downwards draws a fade and a rule across
        // its last row, and its last row is these numbers. It never carries on downwards: it is as
        // tall as its own rows.
        expect(read.more ?? '', `the grid says there is more below it at ${String(width)}`).not.toContain('down')
        // AND THE NUMBERS ARE INSIDE THE BOX THAT HOLDS THEM, which is the other way this row could
        // lose its bottom. Zero is the row ending exactly at the edge, which is what it does.
        expect(read.denominatorBelowTheBox, 'a denominator hangs below the grid').toBeLessThanOrEqual(0)
      })
    }
  }

  it('says nothing more to the right at 390, where the grid now fits', async () => {
    // AT 390 THE GRID NO LONGER RUNS PAST ITS BOX. It used to, and this case said the mark told the
    // reader so; scrolling sideways there hid every column after 结论, and the narrow grid now puts each
    // row's name on its own line so the seven columns fit (problem E73Do6DbqZCH, item 7). A mark saying
    // there is more to the right would now be saying something false.
    const read = await readCounterRow(390, 'light')
    expect(read.more ?? '').not.toContain('right')
  })
})

/** What the grid reads as, and what its mark says, at one of the heights the case below tries. */
interface Rounded {
  /** The spacer's height in pixels, which moves the grid's bottom edge by a fraction of a pixel. */
  spacer: number
  /** scrollHeight less clientHeight: how many whole pixels apart the browser reads the grid. */
  apart: number
  /** Which sides the reach mark says the grid carries on past, or null where it says none. */
  more: string | null
}

describe('the mark does not answer a rounding: less than two pixels past the edge is not more', () => {
  /** How far the made content runs past the grid's bottom edge. Less than two pixels, as in the fault. */
  const PAST_THE_EDGE = 1.5
  /** How many heights are tried, each an eighth of a pixel taller than the one before. */
  const HEIGHTS = 8

  for (const width of WIDTHS) {
    it(`draws no mark below the grid for content ${String(PAST_THE_EDGE)}px past its edge at ${String(width)}`, async () => {
      const read = await readCounterRow(width, 'light')
      expect(read.denominators, 'the counter row drew no denominators at all').toBeGreaterThan(0)
      const tried: Rounded[] = await page.evaluate(
        async ({ past, heights }) => {
          const grid = document.querySelector<HTMLElement>('.dsay-grid')
          if (grid === null) throw new Error('the settings grid is not on the page')
          const twoFrames = () =>
            new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null))))
          // TWO ELEMENTS MADE BY THIS TEST, and taken off again below: a spacer whose height moves the
          // grid's bottom edge by a fraction of a pixel, and content that runs past that edge without
          // making the grid taller. A change of hash does not load the page again, so anything left
          // here would still be in the grid for the next case.
          const spacer = document.createElement('div')
          spacer.setAttribute('data-made-by-the-test', 'a spacer')
          spacer.style.cssText = 'flex: none; height: 0px;'
          const over = document.createElement('div')
          over.setAttribute('data-made-by-the-test', 'content past the edge')
          over.style.cssText = `flex: none; height: ${String(past)}px; margin-bottom: -${String(past)}px;`
          grid.append(spacer, over)
          const out: { spacer: number; apart: number; more: string | null }[] = []
          try {
            for (let at = 0; at < heights; at++) {
              spacer.style.height = `${String(at / heights)}px`
              // The mark reads the box again on a scroll; a spacer this small may not resize it.
              grid.dispatchEvent(new Event('scroll'))
              await twoFrames()
              out.push({
                spacer: at / heights,
                apart: grid.scrollHeight - grid.clientHeight,
                more: grid.parentElement?.getAttribute('data-more') ?? null,
              })
            }
          } finally {
            spacer.remove()
            over.remove()
            grid.dispatchEvent(new Event('scroll'))
          }
          return out
        },
        { past: PAST_THE_EDGE, heights: HEIGHTS },
      )
      // THE ROUNDING IS THERE, or this case guards nothing: some height has to be read as two whole
      // pixels apart, as the grid was in problem qdCdRX7EBg3j.
      expect(
        tried.map((one) => one.apart),
        `the browser never read the grid two whole pixels apart at ${String(width)}: ${JSON.stringify(tried)}`,
      ).toContain(2)
      // THE FAULT ITSELF: at no height does the grid say it carries on downwards.
      expect(
        tried.filter((one) => (one.more ?? '').includes('down')),
        `the grid says there is more below it at ${String(width)}, for ${String(PAST_THE_EDGE)}px past its edge`,
      ).toEqual([])
    })
  }
})

/**
 * EVERY POSITION'S UNWRITTEN LIST CAN BE OPENED, NOT ONLY CONCLUSION'S. Problem tuP05HQGTcqv.
 *
 * The list under the grid followed the cell under the pointer or the focus, and fell back to
 * Conclusion when they left it. Its button is below the grid, so reaching the button always left the
 * cell first: the count on the button changed on the way, and the list that opened was Conclusion's
 * whatever position a person had been looking at.
 *
 * Now a count in the counter row opens the list for its own column, and the list stays on that
 * position while the pointer moves on. This is a browser test because the fault is the order of
 * pointer events, which markup cannot show.
 *
 * THE MUTATION: in src/web/components/DetailSays.tsx, hand `Unwritten` the hovered position again,
 * `at={shown.rung}` instead of `at={open ?? shown.rung}`. The press on a count then opens no list,
 * because the pointer is on the count and not on a cell, and the check on the list's length goes
 * red: 0 against 1.
 */
describe('the unwritten list opens for the position whose count was pressed', () => {
  /** The number on the fold's button, or null while there is no button. */
  const foldSays = async (): Promise<number | null> => {
    const text = await page.locator('.dsay-unwritten-open').first().textContent({ timeout: 2_000 }).catch(() => null)
    const n = text === null ? null : /\((\d+)\)/.exec(text)?.[1]
    return n === undefined || n === null ? null : Number(n)
  }

  it('opens the list for a count that is not Conclusion, and keeps it there when the pointer moves on', async () => {
    // A REPORT WITH NO LABEL AND NO PARTS WRITTEN, so the positions counted over reports list a
    // record that Conclusion's list does not: a report's summary is its conclusion. Its title is how
    // the list that opens is told apart from Conclusion's, which may hold the same number.
    const made = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'report',
        title: 'The bracket reprint under load',
        summary: 'The third print holds; the first two cracked at the same corner.',
        // LONG ENOUGH THAT THE BY-PART LENGTHS APPLY TO IT: a report shorter than a length has no
        // place for that length, and is not counted as missing it.
        data: {
          date: '2026-09-30',
          blocks: Array.from({ length: 12 }, (_, i) => ({
            id: `b-${String(i + 1)}`,
            type: 'text',
            text:
              `Print ${String(i + 1)} was loaded to 50 N in steps of 5 N and held for a minute at each step. ` +
              'The corner nearest the mounting hole was watched through the lens, and the crack, where there ' +
              'was one, started there and ran along the layer line towards the far edge of the bracket.',
          })),
        },
      }),
    })
    expect(made.status, `the report was not stored: ${await made.text()}`).toBe(201)

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`${app.site}/#/settings/detail`, { timeout: 60_000 })
    // A LOAD OF ITS OWN, because the tests above left the page on this same address and a change of
    // hash alone would keep the records it read before the report above was filed.
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.dsay-counter', { timeout: 30_000 })
    await page.mouse.move(1, 1)
    await theResizeIsDrawn(page)

    // WHAT EACH PRESSABLE COUNT HAS BEHIND IT, read off the count itself: possible less written.
    const counts = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>('button.dsay-count')].map((el) => ({
        rung: el.getAttribute('data-detail-rung') ?? '',
        unwritten:
          Number(el.querySelector('i')?.textContent?.replace('/', '') ?? 'NaN') - Number(el.querySelector('b')?.textContent ?? 'NaN'),
      })),
    )
    expect(counts.length, 'no count in the counter row can be pressed').toBeGreaterThan(0)
    const resting = await foldSays()
    expect(resting, 'the fold shows no count before anything is pointed at').not.toBeNull()
    // A POSITION THAT IS NOT CONCLUSION, the one the fold shows at rest. Level 4 is the one the
    // problem was found on.
    const other = counts.find((c) => c.rung === 'outline' && c.unwritten > 0)
    expect(other, `Level 4 has no records unwritten to open: ${JSON.stringify(counts)}`).toBeDefined()
    if (other === undefined) return
    const REPORT = 'The bracket reprint under load'

    await page.locator(`button.dsay-count[data-detail-rung="${other.rung}"]`).click()
    await page.locator('.dsay-unwritten-list').waitFor({ timeout: 5_000 })
    expect(await foldSays(), 'the press on the count did not open that position').toBe(other.unwritten)
    const listed = await page.locator('.dsay-unwritten-list li').allTextContents()
    expect(listed.length, 'the list that opened is not as long as the count said').toBe(Math.min(other.unwritten, 40))
    expect(listed, 'the list that opened is not Level 4\'s: the report with no parts is not on it').toContain(REPORT)
    expect(await page.locator(`button.dsay-count[data-detail-rung="${other.rung}"]`).getAttribute('aria-expanded')).toBe('true')

    // THE POINTER MOVES ON, OVER ANOTHER COLUMN, AND THE LIST STAYS WHERE IT WAS OPENED.
    const elsewhere = counts.find((c) => c.rung !== other.rung)
    if (elsewhere !== undefined) {
      await page.locator(`.dsay-cell[data-detail-row="everywhere"][data-detail-rung="${elsewhere.rung}"]`).hover()
      await sleep(200)
    }
    await page.mouse.move(1, 1)
    await sleep(200)
    expect(await foldSays(), 'the open list moved to another position when the pointer did').toBe(other.unwritten)
    expect(await page.locator('.dsay-unwritten-list li').allTextContents()).toContain(REPORT)

    // AND THE SAME COUNT SHUTS IT AGAIN.
    await page.locator(`button.dsay-count[data-detail-rung="${other.rung}"]`).click()
    await sleep(200)
    expect(await page.locator('.dsay-unwritten-list').count(), 'the list did not shut').toBe(0)
  })
})
