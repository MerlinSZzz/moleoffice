// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TITLE IS DRAWN ONCE ON A RECORD PAGE, AT 1440 AND AT 390.
 *
 * WHAT WAS MEASURED, AND WHY THIS IS A BROWSER. The owner's comment on a report reads "The line
 * break here is not the same with the title, it seems to have only half of the column". The owner
 * describes two copies of one sentence breaking in two places, because the heading drew the stored
 * title and the report body below it drew it again in a narrower column. Measured in Chromium
 * against a copy of the owner's corpus at 1440x1100 before this was fixed, on that report's page:
 * breadcrumb 800.9px, h1 1062.9px, and `p.sb-open-line[data-drawn-from=title]` 544.0px inside a
 * report body 1164.0px wide. One sentence, three widths. A test gets a database of its own, so this
 * file builds a record with the same stored shape and measures that; the corpus numbers are a
 * measurement recorded in the commit that made them, not an assertion here.
 *
 * IT ASSERTS DRAWN CHARACTERS, not a constant. The claim is that the words are on the screen once,
 * so the assertion counts elements whose drawn text is the title, across the whole page.
 *
 * THE BREADCRUMB IS COUNTED AND KEPT: `span.rp-crumb-here` draws the title a third time as the last
 * step of the trail that says where you are standing, and a trail whose last step is blank does not
 * tell you where you are. So the count is: the heading, and the trail, and NOT the writing.
 *
 * WHAT THIS FILE NO LONGER CHECKS. Wave 13n round F dropped the three summary cases at Full and at
 * reading length 3, and the short form they needed: the summary's place and count changed three
 * times and were re-read at each width. What stays is the title's place at both widths, and the
 * opening line: no line in the writing is read from a field the page above already drew.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: LiveApp
let page: Page
let reportId: string

/** The stored words, kept here so the assertions compare against the same characters that were written. */
const TITLE =
  'Round nine: what you can now do that you could not, and the two things the campaign got wrong about itself'
const SUMMARY =
  'The campaign that built semantic addressability, semantic zoom and the review pane, and what it left standing.'

/**
 * EVERY ELEMENT ON THE PAGE WHOSE OWN DRAWN TEXT IS THESE CHARACTERS, with where it sits.
 *
 * "Its own" means the deepest element holding the words: every ancestor of a paragraph also contains
 * the paragraph's text, and counting those would count one drawn sentence a dozen times. So an
 * element is only counted when no descendant of it holds the same words.
 */
async function drawnCopiesOf(words: string): Promise<{ where: string; width: number; inTheWriting: boolean }[]> {
  return page.evaluate((text) => {
    const holds = (el: Element): boolean => (el.textContent ?? '').trim() === text
    const out: { where: string; width: number; inTheWriting: boolean }[] = []
    for (const el of document.querySelectorAll('body *')) {
      if (!holds(el)) continue
      if ([...el.children].some((child) => holds(child))) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      out.push({
        where: `${el.tagName.toLowerCase()}.${String(el.className || '(no class)').split(' ').join('.')}`,
        width: Math.round(rect.width * 10) / 10,
        // `.sb` is the report body: the writing, as opposed to the page's own furniture above it.
        inTheWriting: el.closest('.sb') !== null,
      })
    }
    return out
  }, words)
}

/**
 * OPEN A RECORD PAGE AT FULL, AND SAY SO RATHER THAN INHERITING IT.
 *
 * The owner's act 3a of 15 September 2026 made a record page open at the conclusion, where the body holds the summary
 * and nothing else. Every case in this file except one is about what the page draws AT FULL, so
 * the level is written here as the reader's own stored choice — the same key and the same way the case about reading
 * length 3 below writes its own — and the page is loaded after it. `liveApp`'s `opensAt` is deliberately NOT used: it
 * writes the choice on every load, including the reloads the length-3 case makes, so that case could never reach the
 * length it is about. The opening level has its own test in tests/a-reader-goes-no-lower-than-conclusion.test.ts, which
 * stores nothing.
 */
async function open(address: string, width: number): Promise<void> {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1100 })
  await page.goto(`${app.site}/#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(() => {
    window.localStorage.setItem('mole-office.detail.reportContent', 'full')
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(1500)
}

beforeAll(async () => {
  app = await liveApp({ name: 'title-once', viewport: { width: 1440, height: 1100 } })
  page = app.page

  const headers = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': 'default',
  }
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'report',
      title: TITLE,
      summary: SUMMARY,
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-08-25',
        // NONE OF THESE BLOCKS REPEATS THE TITLE. On the owner's own corpus some reports open with their own
        // title written into the markdown, which is a second copy nobody's furniture put there and
        // is not what this is about.
        blocks: [
          {
            id: 'b-1',
            type: 'text',
            heading: 'What is genuinely usable now',
            text: 'Six things a person can do today that they could not do three weeks ago.',
          },
          { id: 'b-2', type: 'text', text: 'Three ideas, and they turned out to be one idea.' },
        ],
      },
    }),
  })
  if (!res.ok) throw new Error(`POST /api/records answered ${String(res.status)}: ${await res.text()}`)
  reportId = ((await res.json()) as { record: { id: string } }).record.id
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('the title is on the record page once', () => {
  for (const width of [1440, 390]) {
    it(`draws the title in the heading and in the trail, and never inside the writing, at ${String(width)}`, async () => {
      await open(`/r/${reportId}`, width)
      const copies = await drawnCopiesOf(TITLE)

      // The heading and the breadcrumb, and nothing under `.sb`.
      expect(
        copies.filter((c) => c.inTheWriting),
        'the report body is drawing the record’s own title a second time, in a narrower column — ' +
          'the defect the owner reported as "it seems to have only half of the column"',
      ).toEqual([])
      expect(copies.some((c) => c.where.startsWith('h1.'))).toBe(true)
      expect(copies.length).toBeGreaterThanOrEqual(1)
    })
  }

  it('leaves no opening line in the writing that was read from a field the page above drew', async () => {
    await open(`/r/${reportId}`, 1440)
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll('.sb-open-line')].map((el) => el.getAttribute('data-drawn-from')),
    )
    // `data-drawn-from` is the stored field path the line was read from.
    //
    // THIS COMMENT SAID *`title` AND `summary` ARE THE TWO THE RECORD PAGE'S OWN FURNITURE DRAWS*
    // until 3 September 2026, and half of it stopped being true that day. Criterion A14b took the
    // summary paragraph off a report page, so `title` is the only field the furniture above the
    // writing still draws: the heading and the last step of the trail. Both fields are still named
    // below, because both would be a second copy at Full — `summary` of a paragraph that is not
    // there, `title` of one that is.
    expect(lines).not.toContain('title')
    expect(lines).not.toContain('summary')
    // CHANGED TWICE ON 2 September 2026: it expected the label's path as well, then the gist's
    // alone, and now none. Full draws the report and nothing above it — `formDrawnAt` in
    // src/shared/reportrungs.ts returns null there — because the mark that said which length the
    // line was written for is not for a person and left the page.
    expect(lines).toEqual([])
  })
})
