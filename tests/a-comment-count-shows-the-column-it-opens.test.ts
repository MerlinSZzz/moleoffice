// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PRESSING A COMMENT COUNT OPENS THE COMMENTS COLUMN WHERE THE WINDOW SHOWS IT, AT EVERY WIDTH.
 *
 * Round 28's report (o5-0IqeMCSm6, item 9.2 of the line's list) found this at 390. Below 36rem the
 * column is drawn as a band above the page, and the page keeps the whole width. A person reads down
 * a long page, presses the count beside a block, and the column opens at the top of the document.
 * The window stayed where it was, so the press seemed to do nothing. At 660 and wider the column is
 * beside the page and held in the window as it scrolls, so it was always seen there.
 *
 * Each press is answered, not only the first. Pressing the same count again after reading on is the
 * same ask, and the column does not change, so a move made only when the column changes would not
 * be made.
 *
 * Beside the page the column is already in the window, so the window is not moved to it. The press
 * moves the window to what the comment is on, and to the same place each time. A move to the column
 * as well stops that move part way, and each press pushes the page down by the top bar's height.
 *
 * Every record here is made up by this test, in a database of its own.
 */
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { thePageAtRest, whereThePageIs } from './the-page-scroller.ts'

const SHOTS = process.env['COLUMN_SHOTS']
const WHEN = process.env['COLUMN_SHOTS_WHEN'] ?? 'after'
const COMMENT = 'Say which mount this load was measured on.'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let app: LiveApp
let report = ''

async function write(body: unknown, answers: 201 | 409 = 201): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  if (reply.status !== answers) throw new Error(`POST /api/records answered ${String(reply.status)}: ${text}`)
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'count-shows-column', viewport: { width: 390, height: 844 } })
  await write({ kind: 'agent', title: 'Made-up Wren', data: { handle: 'made-up-wren', runtime: 'claude-code', state: 'active' } })
  // A REPORT LONG ENOUGH THAT ITS LAST BLOCKS ARE BELOW THE FIRST SCREEN AT EVERY WIDTH.
  const blocks = Array.from({ length: 12 }, (_, at) => ({
    id: `b-${String(at + 1)}`,
    type: 'text',
    heading: `Made-up trial ${String(at + 1)}`,
    text: `Mount ${String(at + 1)} was loaded in steps of five newtons until it cracked. The made-up numbers for this trial are in the table the next round will add, and the rig was the same one as before.`,
  }))
  report = await write({ kind: 'report', title: 'Made-up wrist mount trials', summary: 'A made-up report with a comment near its end.', data: { date: '2026-10-13', blocks } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  await write({
    kind: 'message',
    title: COMMENT,
    data: { body: COMMENT, to: [{ kind: 'agent', id: 'made-up-wren' }], target: { target: { kind: 'region', recordId: report, regionId: 'data.blocks[#b-11]' }, place: { at: 'surface' } } },
  }, 409)
  if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
}, 180_000)

afterAll(async () => { await app?.stop() }, 60_000)

/** Whether the column's heading is inside the window and not under anything drawn over it, and whether the commented block is. */
async function whatTheWindowShows(): Promise<{ headTop: number; headBottom: number; headUncovered: boolean; blockTop: number; blockInTheWindow: boolean; windowHeight: number }> {
  return app.page.evaluate(() => {
    const head = document.querySelector('.px-pane-title')
    if (head === null) throw new Error('The comments column has no heading.')
    const box = head.getBoundingClientRect()
    const atItsMiddle = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    const block = document.querySelector('[data-target*="b-11"]')
    if (block === null) throw new Error('The commented block is not on the page.')
    const at = block.getBoundingClientRect()
    return {
      headTop: box.top,
      headBottom: box.bottom,
      headUncovered: atItsMiddle !== null && head.contains(atItsMiddle),
      blockTop: at.top,
      blockInTheWindow: at.bottom > 0 && at.top < window.innerHeight,
      windowHeight: window.innerHeight,
    }
  })
}

async function pressTheCount(): Promise<void> {
  const circle = app.page.locator('.px-comment-circle').first()
  // A PERSON READING DOWN THE PAGE: the window is taken to the count before it is pressed.
  await circle.scrollIntoViewIfNeeded()
  await thePageAtRest(app.page)
  await circle.click()
  await app.page.locator('.px-pane-title').waitFor({ timeout: 30_000 })
  await app.page.waitForFunction((words) => [...document.querySelectorAll('.px-rev-words')].some((one) => one.textContent?.includes(words)), COMMENT, { timeout: 30_000 })
  await thePageAtRest(app.page)
}

describe('pressing the count beside a block near the end of a long page', () => {
  for (const width of [1440, 990, 660, 390] as const) {
    for (const look of ['light'] as const) {
      it(`at ${String(width)} in ${look}: the window shows the column's heading, on the first press and on the next`, async () => {
        const page = app.page
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: look })
        await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
        await page.evaluate(() => { window.localStorage.setItem('mole-office.review', 'shut||||') })
        await page.reload({ timeout: 60_000 })
        await waitForThePage(page, 60_000)
        if (await page.locator('.px-chat-close').isVisible()) await page.locator('.px-chat-close').click()
        await page.waitForFunction(() => document.documentElement.getAttribute('data-comment-circles') === 'placed', undefined, { timeout: 30_000 })
        expect(await whereThePageIs(page), 'the page was not read down to the count').toBe(0)

        await pressTheCount()
        expect(await page.locator('.px-pane-title').innerText()).toBe('Comments here')
        const first = await whatTheWindowShows()
        expect(first.headTop, "the column's heading is above the window").toBeGreaterThanOrEqual(0)
        expect(first.headBottom, "the column's heading is below the window").toBeLessThanOrEqual(first.windowHeight)
        expect(first.headUncovered, "the column's heading is under something drawn over it").toBe(true)
        // BESIDE THE PAGE, THE PRESS STILL TAKES THE WINDOW TO WHAT THE COMMENT IS ON, as it did before.
        if (width !== 390) expect(first.blockInTheWindow, 'the commented block left the window').toBe(true)
        if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, `${WHEN}-${String(width)}-${look}-first-press.png`) })

        await pressTheCount()
        const next = await whatTheWindowShows()
        expect(next.headTop, "after the second press the column's heading is above the window").toBeGreaterThanOrEqual(0)
        expect(next.headBottom, "after the second press the column's heading is below the window").toBeLessThanOrEqual(next.windowHeight)
        expect(next.headUncovered, "after the second press the column's heading is under something drawn over it").toBe(true)
        // BESIDE THE PAGE THE COLUMN IS NOT MOVED TO, so the second press leaves the block where the first one did.
        if (width !== 390) expect(Math.abs(next.blockTop - first.blockTop), 'the second press left the commented block somewhere else').toBeLessThanOrEqual(1)
        if (SHOTS !== undefined) await page.screenshot({ path: join(SHOTS, `${WHEN}-${String(width)}-${look}-next-press.png`) })
      }, 180_000)
    }
  }
})
