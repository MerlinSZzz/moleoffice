// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER TICKS AN ITEM'S EMPTY BOX, AND THE CHECKLISTS WINDOW STAYS OPEN UNTIL THE OWNER CLOSES IT. Wave 13j round
 * loop-5, from a decision sent in a message: mark done can be a press on the empty box on the left, and the owner's
 * press needs no evidence.
 * Part e comes from a message in a brief: the checklist stays open when the owner presses inside
 * it, and closes only when the owner closes it, as the chat does.
 *
 * In a real browser, on this test's own office. The browser is the person: `liveApp`'s key window covers a caller on
 * this machine, which is what `thePersonIsProved` in src/server/lib/records.ts reads. Every checklist and name here is
 * made up, and nothing is asked in the owner's name of the live office (chapter 8, rule 3).
 *
 * 1. AN OPEN PLAIN ITEM OF THE READER'S OWN HAS AN EMPTY BOX ON ITS LEFT. Pressing it stores the item done with no
 *    evidence and with the person's mark; the item stays where it was, and the window stays open. The right-hand
 *    "Mark done" is gone (wave 14a), by request of a message: no row draws it, plain or special.
 *    MUTATION: the box's onClick did nothing. Cases 1 and 2 go red.
 * 2. AN OPENED ITEM SAYS WHO ADDED IT, WHOM IT TELLS, THAT THE OWNER MARKED IT DONE AND WHOM THE OFFICE TOLD, in words,
 *    from the checklist's reading: "Added by an agent", the line naming the tool maintainer as the agent it tells, the person's mark,
 *    "Told: the tool maintainer" and, for an item the owner added, the line that no agent was told. Those three are read from their keys.
 *    MUTATION: `ItemFacts` in src/web/components/ChecklistParts.tsx drew none of the four. Case 2 goes red.
 * 3. THE WINDOW STAYS OPEN on a press inside it, on a press on the page outside it, at 1440 and at 390, and after a
 *    link in an opened item takes the reader to a page. It closes on × and on Escape. At 390 the window reaches the
 *    foot of the screen, so the press outside it is on the page's name in the bar above it.
 *    MUTATION: `useCloseOnOutsidePress(box, close)` put back in ChecklistsWindow.tsx. Case 3 goes red.
 *    MUTATION: the hashchange listener that closed it put back. Case 3 goes red.
 * 4. SOMEBODY ELSE'S CHECKLIST, UNDER THEIR NAME AMONG THE WINDOW'S NAMES, HAS NO BOX: it is shown to be read.
 *    MUTATION: the box drawn whatever `mayMark` says. Case 4 goes red.
 *
 * Test change (wave 13y round 175): the window draws design E, as decided. Each checklist is a card whose title opens
 * nothing, so case 3 follows the link in an opened item to a report. Case 4 reaches another owner's checklist by
 * choosing that owner's name in the window's row of names. Before, case 3 followed the link in a checklist's title to
 * its page, and case 4 opened the window's full view; that link and the full view went.
 *
 * Test change (wave 13y round 175, after the pictures): at 390 the window is a sheet down to the foot of the screen,
 * as decided, so case 3 presses outside it on the page's name in the bar above it. Before, it pressed near the foot
 * of the screen at both widths, which at 390 is now inside the window.
 *
 * Test change (wave 13y round 175, the names behind Back): the window's names are folded behind a Back press at the
 * start of its head, as decided, and they are plain presses, not tabs. Case 4 presses Back, found by its words, before
 * it chooses the other owner's name among the window's name presses. Before, it chose the name in a row of tabs above
 * the cards. What the case checks is unchanged.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'

const en = createI18n('en')
let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

let kiln = ''
let notes = ''

async function theItem(words: string): Promise<Record<string, any>> {
  const read = await send('GET', `/api/checklists/${kiln}`, undefined)
  return (read['checklist'].items as Record<string, any>[]).find((one) => one['words'] === words)!
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-owner-ticks-a-checklist-item', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'lark', name: 'Lark', role: 'worker' })
  await send('POST', '/api/agents/started', { handle: 'quill', name: 'Quill', role: 'worker' })
  kiln = (await send('POST', '/api/checklists', { title: 'Kiln checklist', items: [{ words: 'Write how the kiln is loaded' }] }))['checklist'].id as string
  await send('POST', `/api/checklists/${kiln}/items`, { words: 'Fire the test tiles' }, AS('lark'))
  await send('POST', `/api/checklists/${kiln}/items`, { words: 'Sweep the kiln shelf', tell: ['quill'] }, AS('lark'))
  await send('POST', `/api/checklists/${kiln}/items`, { words: 'Weigh the glaze' }, AS('lark'))
  await send('POST', '/api/checklists', { title: "Lark's shelf list", items: [{ words: 'Clear the top shelf' }] }, AS('lark'))
  // A LINK IN AN ITEM, for case 3: an opened item draws the records it links to.
  notes = (
    await send('POST', '/api/records', {
      kind: 'report',
      title: 'Made-up kiln notes',
      data: { for: 'The owner', date: '2026-11-20', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] },
    })
  )['record'].id as string
  await send('POST', `/api/checklists/${kiln}/items`, { words: 'Read the kiln notes', links: [notes] })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

async function openTheWindow(page: Page, width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.ckw-press', { timeout: 30_000 })
  await page.click('.ckw-press')
  await page.waitForSelector('.ckw-panel .cks-card', { timeout: 30_000 })
}

const row = (page: Page, words: string) => page.locator('.ckw-panel .ckp-item', { hasText: words })

describe("the owner's box marks an item done, and the window stays open until the owner closes it", () => {
  it('1. an open item has an empty box on its left; pressing it stores done with no evidence, and the window stays open', async () => {
    const page = app.page
    await openTheWindow(page)
    const tiles = row(page, 'Fire the test tiles')
    const box = tiles.getByRole('button', { name: 'Mark as done: Fire the test tiles', exact: true })
    expect(await box.count()).toBe(1)
    const boxAt = await box.boundingBox()
    const wordsAt = await tiles.locator('.ckp-words').boundingBox()
    expect(boxAt !== null && wordsAt !== null && boxAt.x + boxAt.width <= wordsAt.x + 1, 'the box is on the left of the words').toBe(true)
    await box.click()
    await expect.poll(async () => (await theItem('Fire the test tiles'))['state'], { timeout: 15_000 }).toBe('done')
    const stored = await theItem('Fire the test tiles')
    expect(stored['evidence']).toBeUndefined()
    expect(stored['doneByThePerson']?.by?.kind).toBe('person')
    expect(await page.locator('.ckw-panel').isVisible(), 'the window stays open after the press').toBe(true)
    await expect.poll(() => tiles.getAttribute('data-state'), { timeout: 10_000 }).toBe('done')
    expect(await page.locator('.ckw-mark').count(), 'the right-hand "Mark done" is gone').toBe(0)
    expect(await row(page, 'Weigh the glaze').getByRole('button', { name: 'Mark as done: Weigh the glaze', exact: true }).count(), 'the plain box stays').toBe(1)
    await page.keyboard.press('Escape')
  }, 120_000)

  it('2. an opened item says who added it, whom it tells, that the owner marked it done and whom the office told', async () => {
    const page = app.page
    await openTheWindow(page)
    const shelf = row(page, 'Sweep the kiln shelf')
    await shelf.locator('summary').click()
    expect(await shelf.innerText()).toContain('Added by Lark')
    expect(await shelf.innerText()).toContain(en.t('w13j.checklistDone.tell', { names: 'Quill' }))
    await shelf.getByRole('button', { name: 'Mark as done: Sweep the kiln shelf', exact: true }).click()
    await expect.poll(async () => (await theItem('Sweep the kiln shelf'))['state'], { timeout: 15_000 }).toBe('done')
    await expect.poll(() => shelf.innerText(), { timeout: 10_000 }).toContain('Told: Quill')
    expect(await shelf.innerText()).toContain(en.t('w13j.checklistDone.byPress'))

    const own = row(page, 'Write how the kiln is loaded')
    await own.getByRole('button', { name: 'Mark as done: Write how the kiln is loaded', exact: true }).click()
    await expect.poll(async () => (await theItem('Write how the kiln is loaded'))['state'], { timeout: 15_000 }).toBe('done')
    if ((await own.locator('details').getAttribute('open')) === null) await own.locator('summary').click()
    await expect.poll(() => own.innerText(), { timeout: 10_000 }).toContain(en.t('w13j.checklistDone.toldNobody'))
    await page.keyboard.press('Escape')
  }, 120_000)

  it('3. the window stays open on a press inside it, on a press outside it and after a link in it; × and Escape close it', async () => {
    const page = app.page
    for (const width of [1440, 390]) {
      await openTheWindow(page, width)
      const panel = page.locator('.ckw-panel')
      await panel.locator('.ckw-title').click()
      expect(await panel.isVisible(), `${String(width)}: a press inside it`).toBe(true)
      if (width === 390) await page.locator('.shell-bar-page').click()
      else await page.mouse.click(8, 890)
      await page.waitForTimeout(300)
      expect(await panel.isVisible(), `${String(width)}: a press outside it`).toBe(true)
      const linked = row(page, 'Read the kiln notes')
      if ((await linked.locator('details').getAttribute('open')) === null) await linked.locator('summary').click()
      await linked.locator(`.ckp-link a[href="#/report/${notes}"]`).click()
      await page.waitForFunction((id) => window.location.hash === `#/report/${id}`, notes, { timeout: 15_000 })
      await page.waitForTimeout(300)
      expect(await panel.isVisible(), `${String(width)}: after a link in it`).toBe(true)
      await page.keyboard.press('Escape')
      await expect.poll(() => panel.count(), { timeout: 5_000 }).toBe(0)
      await page.click('.ckw-press')
      await panel.waitFor({ timeout: 10_000 })
      await page.locator('.ckw-close').click()
      await expect.poll(() => panel.count(), { timeout: 5_000 }).toBe(0)
    }
  }, 180_000)

  it("4. somebody else's checklist, under their name, has no box", async () => {
    const page = app.page
    await openTheWindow(page)
    const panel = page.locator('.ckw-panel')
    await panel.getByRole('button', { name: en.t('checklists.window.back'), exact: true }).click()
    await panel.locator('.ckw-names button', { hasText: 'Lark' }).click()
    const theirs = panel.locator('.cks-card', { hasText: "Lark's shelf list" })
    await theirs.waitFor({ timeout: 20_000 })
    expect(await theirs.getByRole('button', { name: /^Mark as done/ }).count()).toBe(0)
    await page.keyboard.press('Escape')
  }, 120_000)
})
