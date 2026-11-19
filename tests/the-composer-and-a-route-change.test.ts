// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMPOSER SAYS WHEN THE THING IT IS ABOUT IS NOT ON THIS PAGE, AND TAKES YOU BACK TO IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Step 58 measured it on 20 August 2026 and it is CAF-9: open the composer on a block of a report,
 * go to another page, and the composer is still floating there naming a block that page does not
 * hold. Reproduced again on 21 August 2026 against `ad9ec73`, on a copy of the owner's corpus:
 * after the browser's own Back button the chip still read `Block of a report — Read from stored
 * rows, not remembered`, the mark on the source was gone, and nothing on the screen said the two
 * facts were connected. The composer was making a claim about a page that could not answer it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOW, AND WHY THAT AND NOT SOMETHING ELSE
 * ---------------------------------------------------------------------------------------
 *
 * The frame stays open, draws the word `Not on this page`, and draws one press — `Show` — that
 * goes back to where the subject is. `design/ROUND-NINE-INTERACTION-CONTRACT.md` §6.2 and §6.9 both
 * say exactly that, and `COMPOSER_STATES.notOnThisPage` has held the word since the vocabulary was
 * written; nothing had ever drawn it.
 *
 * Closing the frame was the other candidate and it is refused. What somebody has typed and not sent
 * is kept in this browser under the name of the thing it is about, so closing would not delete it —
 * it would put it off the screen with nothing saying where it had gone, which is the loss the whole
 * composer exists to prevent and is what `design/round-nine/closing-the-audit-composer.md` measured.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASSERTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Four things, all of them about what is drawn and what a person can press.
 *
 *   1. After leaving the page, the frame is still there, it draws `Not on this page`, and what was
 *      typed is still in the box.
 *   2. Pressing `Show` puts the reader back on the page the subject is on, and the word goes.
 *   3. On the page the subject IS on, the word is not drawn. A word that is always there says
 *      nothing.
 *   4. A subject the new page still holds — a row of the rail, which is on every page — does NOT
 *      get the word, because it would be false. The word follows the thing being on the screen and
 *      not the address changing.
 *
 * One more case guards the half of CAF-9 that is already fixed: a right-click on the composer's own
 * title bar leaves the subject and the instruction alone. Step 58 recorded that gesture as silently
 * replacing the composer, and on this build it does not.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH OF THESE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   draw the word whenever the composer is open        → case 3 and case 4
 *   draw the word off the route rather than the thing  → case 4
 *   never draw the word                                → cases 1 and 2
 *   let `Show` go nowhere                              → case 2
 *   let a press inside the composer replace it again   → the last case
 *
 * The servers come from `liveApp` in tests/helpers.ts: a throwaway database, two free ports, and the
 * ports proved free again at the end. Nothing here touches ./data/panelx.db.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { COMPOSER_STATES } from '../src/shared/states.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const REPORT_TITLE = 'What the second calibration run showed'
const PROSE =
  'The mount holds calibration through a full handover, and the reprojection error stayed inside a ' +
  'quarter of a pixel across forty frames.'
const INSTRUCTION = 'Please check this against the run from Tuesday before anybody acts on it.'

/** The word the composer draws when the thing it is about is not on the page. Read, never spelt. */
const NOT_HERE = COMPOSER_STATES.notOnThisPage.word

let app: LiveApp
let page: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'composer-route', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify({
      kind: 'report',
      title: REPORT_TITLE,
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-08-20', blocks: [{ id: 'b-1', type: 'text', text: PROSE }] },
    }),
  })
  if (!res.ok) throw new Error(`seeding the report answered ${String(res.status)}: ${await res.text()}`)
  reportId = ((await res.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/** What a person can read at this moment, with nothing read out of a store. */
interface OnScreen {
  /** The address the browser is at. */
  route: string
  /** Whether the composer is drawn at all. */
  frame: boolean
  /** What the composer says it is about. */
  subject: string | null
  /** Every word the composer's subject row draws, so a missing one is a missing word. */
  subjectRow: string
  /** What is in the instruction box, exactly. */
  instruction: string | null
  /** The name of the press that goes back to the subject, or null when there is none. */
  show: string | null
  /** How many rectangles the mark on the source is drawing on this page. */
  sourceMark: number
}

async function onScreen(): Promise<OnScreen> {
  return page.evaluate(() => {
    const talk = document.querySelector<HTMLElement>('.px-talk[data-target="uiSurface/composer"]')
    const row = talk?.querySelector<HTMLElement>('[data-target$="composer.subject"]') ?? null
    const chip = row?.querySelector<HTMLElement>('.px-talk-chip-what') ?? null
    const back = talk?.querySelector<HTMLElement>('.px-talk-show') ?? null
    return {
      route: window.location.hash,
      frame: talk !== null,
      subject: chip === null ? null : (chip.textContent ?? '').trim(),
      subjectRow: row === null ? '' : (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
      instruction: talk?.querySelector('textarea')?.value ?? null,
      show: back === null ? null : (back.textContent ?? '').trim(),
      sourceMark: document.querySelectorAll('.px-subject > i').length,
    }
  })
}

/**
 * A clean load of the report, with the store emptied so no kept instruction refills the box.
 *
 * THE RELOAD IS WHAT MAKES IT CLEAN, and it was missing. Changing the part of the address after the
 * `#` does not load a new document, so the composer this file's first case deliberately leaves open
 * was still open when the next case started, floating over the report at the point it was opened
 * at. That is the feature working — the frame survives a change of page, which is the whole of
 * CAF-9 — but it means each case has to start the browser fresh rather than assume the last one
 * left nothing behind.
 *
 * IT USED TO PASS BY HALF A PIXEL. Measured on 21 August 2026: the block's centre is at (534, 475.5)
 * and the left-open composer's top-left corner was at exactly (534, 475), so the right-click landed
 * on the block by a rounding margin. Adding the `Organise` press to the composer's action row —
 * CAF-2, a change with nothing to do with this file — made the box 42px taller, so it was placed
 * 13px higher to fit the window, and the same click then landed inside the composer instead. A case
 * that passes on half a pixel is not proving anything, which is why this is a repair and not a
 * tolerance.
 *
 * Nothing asserted below changed. This helper is what a person does before they start: open the
 * browser on the report with nothing left over.
 */
async function onTheReport(): Promise<void> {
  await page.goto(`${app.site}/#/records`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(() => {
    window.localStorage.clear()
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-target^="reportBlock/"]').first().waitFor({ timeout: 30_000 })
}

/** Open the composer on the report's one block and type an instruction into it. */
async function aComposerAboutTheBlock(): Promise<void> {
  await onTheReport()
  await page.locator('[data-target^="reportBlock/"]').first().click({ button: 'right' })
  await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
  await page.locator('.px-talk textarea').first().fill(INSTRUCTION)
  await sleep(250)
}

/** Leave the page the way a person leaves it, by pressing the browser's own Back button. */
async function goBack(): Promise<void> {
  await page.goBack({ timeout: 30_000 })
  await waitForThePage(page, 30_000)
  await sleep(900)
}

// ============================================================ the subject is somewhere else

describe('the composer says when what it is about is not on this page', () => {
  it('stays open, draws the word, and still holds what was typed', async () => {
    await aComposerAboutTheBlock()
    const before = await onScreen()
    expect(before.instruction, 'the case did not start with an instruction in the box').toBe(INSTRUCTION)
    expect(before.sourceMark, 'the block was not marked while the composer was open').toBeGreaterThan(0)

    await goBack()
    const after = await onScreen()
    expect(after.route, 'Back did not leave the report').not.toContain(reportId)
    expect(after.frame, 'the frame should stay, so the words stay on the screen with it').toBe(true)
    expect(after.subject, 'the frame stopped naming what it is about').toBe(before.subject)
    expect(after.instruction, 'what was typed and not sent was taken off the screen').toBe(INSTRUCTION)
    expect(after.subjectRow, `the frame does not say "${NOT_HERE}"`).toContain(NOT_HERE)
    expect(after.sourceMark, 'the mark cannot be on a page that does not hold the block').toBe(0)
  }, 120_000)

  it('takes you back to the thing when you press Show, and the word goes with it', async () => {
    await aComposerAboutTheBlock()
    const before = await onScreen()
    await goBack()
    const away = await onScreen()
    expect(away.show, 'there is no press that goes back to the subject').not.toBe(null)

    await page.locator('.px-talk-show').first().click()
    await sleep(1200)
    await page.locator('[data-target^="reportBlock/"]').first().waitFor({ timeout: 30_000 })
    await sleep(600)
    const back = await onScreen()
    expect(back.route, 'Show did not go back to the page the subject is on').toContain(reportId)
    expect(back.frame, 'Show closed the composer').toBe(true)
    expect(back.instruction, 'Show lost what had been typed').toBe(INSTRUCTION)
    expect(back.subject).toBe(before.subject)
    expect(back.subjectRow, `the word "${NOT_HERE}" is still drawn on the page that holds the block`).not.toContain(
      NOT_HERE,
    )
    expect(back.sourceMark, 'the mark on the block did not come back with the reader').toBeGreaterThan(0)
  }, 180_000)

  it('does not draw the word on the page the subject is on', async () => {
    await aComposerAboutTheBlock()
    const here = await onScreen()
    expect(here.subjectRow, `the word "${NOT_HERE}" is drawn while the block is right there`).not.toContain(NOT_HERE)
    expect(here.show, 'there is a press to go back to a thing that is already on the screen').toBe(null)
  }, 120_000)

  it('says nothing about a subject the next page still holds', async () => {
    // A ROW OF THE RAIL IS ON EVERY PAGE. The address changes and the thing does not move, so the
    // word would be a false statement — which is why it follows the thing and not the address.
    await onTheReport()
    // Criterion change (wave 13q round 14): All records stands under All projects now, not in the project block,
    // so its row is found in the whole sidebar, the result of a decision.
    // Test change (wave 13y round 165): All records is listed on All pages now and is in the sidebar on no page,
    // so the row pointed at is Decisions, which the sidebar draws in front on every page.
    await page.locator('nav.shell-nav [data-target="uiSurface/rail.decisions"]').first().click({ button: 'right' })
    await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await page.locator('.px-talk textarea').first().fill(INSTRUCTION)
    await sleep(250)

    await goBack()
    const after = await onScreen()
    expect(after.route, 'Back did not leave the report').not.toContain(reportId)
    expect(after.frame, 'the frame should still be open').toBe(true)
    expect(after.subjectRow, `the rail row is on this page too, so "${NOT_HERE}" is false`).not.toContain(NOT_HERE)
    expect(after.instruction).toBe(INSTRUCTION)
  }, 120_000)
})

// ============================================================ the half of CAF-9 that is already fixed

describe('a right-click on the composer does not replace the composer', () => {
  it('keeps the subject and keeps the instruction, which is what step 58 said it did not', async () => {
    await aComposerAboutTheBlock()
    const before = await onScreen()
    await page.locator('.px-talk-head').first().click({ button: 'right', position: { x: 4, y: 4 } })
    await sleep(400)
    const after = await onScreen()
    expect(after.subject, 'the right-click re-aimed the composer').toBe(before.subject)
    expect(after.instruction, 'the right-click took the instruction off the screen').toBe(INSTRUCTION)
  }, 120_000)
})
