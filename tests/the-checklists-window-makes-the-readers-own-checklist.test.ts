// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS WINDOW MAKES THE READER'S OWN CHECKLIST, AND EVERY ITEM SAYS WHO ADDED IT. Wave 13y round 175: the
 * person makes a checklist of his own in the window at the top right, with the "New checklist" press at the foot of his
 * own cards, as decided. It is drawn there also when he has no checklist yet. An item he adds says that he added it, on
 * his own checklist and on an agent's, in the window and on the page. In a real browser, on this test's own office, at
 * 1440.
 *
 * The cases run in order. The person owns no checklist when case 1 starts, case 2 makes his first, and case 3 adds to
 * the one case 2 made.
 *
 * 1. WITH NO CHECKLIST OF HIS OWN, THE WINDOW HOLDS THE PRESS. Fails if the office holds a checklist of his at the
 *    start, if the window's cards part does not hold the "New checklist" press, or if it draws a card.
 * 2. THE PRESS MAKES HIS CHECKLIST. Fails if the press opens no title field, if Enter does not make the checklist with
 *    a 201, if the field stays open, if the window draws no card with the title, or if the owner the office holds is
 *    not the person.
 * 3. AN ITEM HE ADDS IN THE WINDOW SAYS HE ADDED IT. Fails if Enter in the new card's add field does not store the item
 *    with a 201, if the office does not hold the person as the one who added it, or if the item, opened, does not say
 *    "Added by" with his name as the office has it.
 * 4. WITH CHECKLISTS OF HIS OWN, THE PRESS COMES AFTER THE LAST CARD. Fails if the press is not the last thing in the
 *    window's cards part, or if any of his cards is drawn after it.
 * 5. ESCAPE IN THE TITLE FIELD CLOSES THE FIELD AND NOT THE WINDOW. Fails if the field stays open, if the press is not
 *    drawn again, or if the window closes.
 * 6. ON THE PAGE, AN ITEM HE ADDS TO AN AGENT'S CHECKLIST SAYS HE ADDED IT. Fails if the item, opened, does not say
 *    "Added by" with his name as the office has it, or if the office does not hold the person as the one who added it.
 * 7. ON THE PAGE, AN ITEM AN AGENT ADDED TO HIS CHECKLIST SAYS THE AGENT ADDED IT. Fails if the item, opened, does not
 *    say "Added by" with the agent's name as the office has it.
 *
 * Every word checked, and every press found, is read from its key with t(), except the window's own press, which is
 * found by its class as in every other test of the window.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and the browser is the person. Every
 * agent and checklist here is made up, and nothing is asked of the live office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

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
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** One checklist as the office holds it, in the project it is in. */
async function theChecklist(list: string, project = 'default'): Promise<Record<string, any>> {
  return (await send('GET', `/api/checklists/${list}`, undefined, { ...PERSON, 'x-mole-office-workspace': project }))['checklist'] as Record<string, any>
}

const LARK = 'Lark Fenwick'

/** The agent's own checklist, which case 6 adds to on the page. */
let bench = ''
/** The checklist case 2 makes with the press, and the project the office made it in. */
let made = ''
let madeIn = ''
/** The person's name and the agent's, as the office has them. */
let hisName = ''
let larksName = ''

beforeAll(async () => {
  app = await liveApp({ name: 'checklists-window-makes-the-readers-own', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'lark', name: LARK, role: 'worker' })
  bench = (await send('POST', '/api/checklists', { title: "Lark's bench list", items: [{ words: 'Plane the bench top' }] }, AS('lark')))['checklist'].id as string
  hisName = (await send('GET', `/api/participants/person/${THE_PERSON}`, undefined))['participant'].name as string
  larksName = (await send('GET', '/api/participants/agent/lark', undefined))['participant'].name as string
  // THE OFFICE NAMES THE PERSON AND THE AGENT, so a name drawn after "Added by" is not an id drawn in its place.
  expect(hisName, 'the person has a name in the office').not.toBe('')
  expect(hisName, "the person's name is not the person's id").not.toBe(THE_PERSON)
  expect(larksName, "the agent's name is the one it was started with").toBe(LARK)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** A browser window at 1440, at the address, waiting for what it names. Closed by the case. */
async function opened(hash: string, waitFor: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  await page.goto(`${app.site}/?lang=en#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector(waitFor, { timeout: 30_000 })
  return { page, close: () => context.close() }
}

/** Opens the window from a page that is not the checklists page, and answers its cards part. */
async function theWindowsCards(): Promise<{ page: Page; cards: Locator; close: () => Promise<void> }> {
  const { page, close } = await opened('/decisions', '.ckw-press')
  await page.click('.ckw-press')
  const cards = page.locator('.ckw-panel .ckw-cards')
  await cards.waitFor({ timeout: 30_000 })
  return { page, cards, close }
}

const thePress = (where: Locator): Locator => where.getByRole('button', { name: t('checklists.newChecklist'), exact: true })
const theTitleField = (where: Locator): Locator => where.getByRole('textbox', { name: t('checklists.newChecklistTitle'), exact: true })

/** Types words into a card's add field and presses Enter, and answers the door's status. */
async function add(page: Page, card: Locator, words: string, list: string): Promise<number> {
  const field = card.locator('.cks-add-field')
  await field.fill(words)
  const answered = page.waitForResponse((reply) => new URL(reply.url()).pathname === `/api/checklists/${list}/items` && reply.request().method() === 'POST')
  await field.press('Enter')
  return (await answered).status()
}

/** Opens the item with these words on the card, and waits until it says who added it. */
async function saysWhoAdded(card: Locator, words: string, name: string): Promise<void> {
  const row = card.locator('.ckp-item', { hasText: words })
  await row.waitFor({ timeout: 10_000 })
  await row.locator('.ckp-summary').click()
  await expect.poll(() => row.innerText(), { timeout: 10_000 }).toContain(t('w13j.checklistDone.addedBy', { name }))
}

describe("the checklists window makes the reader's own checklist, and every item says who added it", () => {
  it('1. with no checklist of his own, the window holds the "New checklist" press and no card', async () => {
    const before = (await send('GET', '/api/checklists', undefined))['checklists'] as unknown
    expect(before, 'the person owns no checklist at the start').toEqual([])
    const { cards, close } = await theWindowsCards()
    try {
      await thePress(cards).waitFor({ timeout: 30_000 })
      expect(await thePress(cards).count(), 'one press').toBe(1)
      expect(await cards.locator('.cks-card').count(), 'no card').toBe(0)
    } finally {
      await close()
    }
  }, 120_000)

  it('2. the press opens a title field, Enter makes the checklist, the field closes, and the person owns it', async () => {
    const title = 'Glaze trial checklist'
    const { page, cards, close } = await theWindowsCards()
    try {
      await thePress(cards).click({ timeout: 30_000 })
      const field = theTitleField(cards)
      await field.waitFor({ timeout: 10_000 })
      await field.fill(title)
      const answered = page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/checklists' && reply.request().method() === 'POST')
      await field.press('Enter')
      const reply = await answered
      expect(reply.status(), 'the door makes the checklist').toBe(201)
      const body = (await reply.json()) as Record<string, any>
      made = body['checklist'].id as string
      madeIn = body['workspaceId'] as string
      await expect.poll(() => theTitleField(cards).count(), { timeout: 10_000 }).toBe(0)
      expect(await thePress(cards).count(), 'the press is drawn again').toBe(1)
      const card = cards.locator('.cks-card', { has: page.locator('.cks-title', { hasText: title }) })
      await card.waitFor({ timeout: 10_000 })
      expect(await card.getAttribute('data-list'), 'the card is the checklist made').toBe(made)
      const owner = (await theChecklist(made, madeIn))['owner'] as Record<string, unknown>
      expect(owner, 'the person owns it').toEqual({ kind: 'person', id: THE_PERSON })
    } finally {
      await close()
    }
  }, 120_000)

  it('3. an item he adds on that card in the window, opened, says he added it', async () => {
    expect(made, 'the checklist case 2 made').not.toBe('')
    const words = 'Weigh the white glaze'
    const { page, cards, close } = await theWindowsCards()
    try {
      const card = cards.locator(`.cks-card[data-list="${made}"]`)
      await card.waitFor({ timeout: 30_000 })
      expect(await add(page, card, words, made), 'the door stores the item').toBe(201)
      const stored = ((await theChecklist(made, madeIn))['items'] as Record<string, any>[]).find((one) => one['words'] === words)
      expect(stored?.['addedBy'], 'the office holds the person as the one who added it').toEqual({ kind: 'person', id: THE_PERSON })
      await saysWhoAdded(card, words, hisName)
    } finally {
      await close()
    }
  }, 120_000)

  it('4. with checklists of his own, the press is drawn after the last of his cards', async () => {
    await send('POST', '/api/checklists', { title: 'Kiln checklist', items: [{ words: 'Load the kiln' }] })
    await send('POST', '/api/checklists', { title: 'Studio checklist', items: [{ words: 'Sweep the studio floor' }] })
    const { cards, close } = await theWindowsCards()
    try {
      await expect.poll(() => cards.locator('.cks-card').count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
      await thePress(cards).waitFor({ timeout: 10_000 })
      const where = await cards.evaluate((part, words) => {
        const press = [...part.querySelectorAll('button')].find((one) => (one.textContent ?? '').includes(words))
        if (press === undefined) return null
        const all = [...part.querySelectorAll('.cks-card')]
        return {
          lastHoldsThePress: part.lastElementChild?.contains(press) === true,
          cardsAfterIt: all.filter((card) => (press.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).length,
          cardsBeforeIt: all.filter((card) => (press.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).length,
          cards: all.length,
        }
      }, t('checklists.newChecklist'))
      expect(where, 'the press is in the cards part').not.toBeNull()
      expect(where?.lastHoldsThePress, 'the last thing in the cards part holds the press').toBe(true)
      expect(where?.cardsAfterIt, 'no card after the press').toBe(0)
      expect(where?.cardsBeforeIt, 'every card before it').toBe(where?.cards)
    } finally {
      await close()
    }
  }, 120_000)

  it('5. Escape in the title field closes the field, and the window stays open', async () => {
    const { page, cards, close } = await theWindowsCards()
    try {
      await thePress(cards).click({ timeout: 30_000 })
      const field = theTitleField(cards)
      await field.waitFor({ timeout: 10_000 })
      await field.press('Escape')
      await expect.poll(() => theTitleField(cards).count(), { timeout: 10_000 }).toBe(0)
      expect(await thePress(cards).count(), 'the press is drawn again').toBe(1)
      await page.waitForTimeout(300)
      expect(await page.locator('.ckw').getAttribute('data-open'), 'the window is still open').toBe('yes')
      expect(await page.locator('.ckw-panel').isVisible(), 'the window is still drawn').toBe(true)
    } finally {
      await close()
    }
  }, 120_000)

  it("6. on the page, an item he adds to an agent's checklist, opened, says he added it", async () => {
    const words = 'Oil the bench vice'
    const { page, close } = await opened(`/checklists/${bench}`, `.ckl .cks-card[data-list="${bench}"]`)
    try {
      const card = page.locator(`.ckl .cks-card[data-list="${bench}"]`)
      expect(await add(page, card, words, bench), 'the door stores the item').toBe(201)
      const stored = ((await theChecklist(bench))['items'] as Record<string, any>[]).find((one) => one['words'] === words)
      expect(stored?.['addedBy'], 'the office holds the person as the one who added it').toEqual({ kind: 'person', id: THE_PERSON })
      await saysWhoAdded(card.locator('.cks-items:not(.ckp-folded)'), words, hisName)
    } finally {
      await close()
    }
  }, 120_000)

  it('7. on the page, an item an agent added to his checklist, opened, says the agent added it', async () => {
    const words = 'Order the cone packs'
    const list = (await send('POST', '/api/checklists', { title: 'Supplies checklist', items: [{ words: 'Count the clay bags' }] }))['checklist'].id as string
    await send('POST', `/api/checklists/${list}/items`, { words }, AS('lark'))
    const { page, close } = await opened(`/checklists/${list}`, `.ckl .cks-card[data-list="${list}"]`)
    try {
      const card = page.locator(`.ckl .cks-card[data-list="${list}"]`)
      await saysWhoAdded(card.locator('.cks-items:not(.ckp-folded)'), words, larksName)
    } finally {
      await close()
    }
  }, 120_000)
})
