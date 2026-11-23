// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS ON A CHECKLIST ITEM, REFUSED BECAUSE THE CHECKLIST CHANGED AFTER THE PAGE READ IT, SAYS SO IN THE PAGE'S
 * WORDS, AND THE PAGE READS THE CHECKLIST AGAIN. Wave 13j round loop-8, backlog item 1, from the secretary's answer:
 * the press is a person's, so its refusal is in a person's words, by a code, and "better still, read the item again
 * yourself, so the second press works".
 *
 * Both presses send the version the view read. The item door refuses a version the checklist no longer has with the
 * code checklistChangedSinceRead, before it asks anything of the item's shape, so a press on an item that was made
 * standing meanwhile meets this refusal too, and not the standing rule's. The words say "checklist" and not "item"
 * because another item's change is enough. "The page has read it again" is said only once the view holds a newer
 * reading, and "Press once more" only while the press it draws does what the refused press asked and its row has not
 * moved. The page never presses again for the person.
 *
 * A ROW THAT MOVED IN THE RE-READ GETS NO "PRESS ONCE MORE", then or later (wave 13j round loop-9, the secretary's
 * answers): a second press at the same place may land on another row. A row has moved when its
 * place among the rows the view draws changed, or when anything drawn above it in the view changed. The guard that
 * keeps such a row from taking a press for one second is proved in
 * tests/a-checklist-row-that-moved-takes-no-press.test.ts.
 *
 * In a real browser, on this test's own office. The browser is the person: `liveApp`'s key window covers a caller on
 * this machine. Every checklist, agent and item here is made up, and nothing is asked in the owner's name of the live
 * office (chapter 8, rule 3).
 *
 * What is proved:
 *   1. THE WINDOW'S BOX, after an agent put another item of the checklist in progress: the door refuses it with the
 *      code, and nothing is written. That item now sorts first, so the pressed row moved: it says the code's words and
 *      that the page has read the checklist again, without "Press once more", and still without it once the row takes
 *      presses again. Pressed then, the item is done.
 *   2. THE WINDOW'S BOX, after an agent made that item standing: the code again, not the standing rule. The box is gone
 *      after the read, so the row says the page has read it again and not "Press once more"; the item is not done.
 *   3. THE PAGE'S "Make it standing", after an agent put another item in progress: the same words, and the row moved,
 *      so no "Press once more", then or later. Pressed once the row takes presses again, the item is standing.
 *   4. THE PAGE'S "Make it standing", after an agent made that item standing: the press now reads "Make it ordinary",
 *      which is not what was asked, so there is no "Press once more".
 *   5. THE WINDOW'S BOX, after an agent changed the words of the item below it: the row did not move, so it says "Press
 *      once more", and pressed once more the item is done.
 *   6. THE PAGE'S "Make it standing", after an agent changed the words of the item below it: "Press once more", and
 *      pressed once more the item is standing.
 *
 * Test change (wave 13y round 175): the page and the window draw design E, as decided. Each checklist is a card, in
 * the window and on the page; the page cases read the card the address `#/checklists/<id>` marks, and the window's
 * cases find a checklist by its card's title. Before, the window drew each checklist as a group under a title and the
 * page drew the one opened checklist with its counts line.
 */

import type { Locator, Page, Response } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { holdThePagesReadsOfAChecklist, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })
const FITTER = AS('test-fitter')

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function theList(id: string): Promise<Record<string, any>> {
  return (await send('GET', `/api/checklists/${id}`, undefined))['checklist'] as Record<string, any>
}

async function theItem(list: string, words: string): Promise<Record<string, any>> {
  return ((await theList(list))['items'] as Record<string, any>[]).find((one) => one['words'] === words)!
}

/** A checklist of the person's own, with these items, all open. */
async function aChecklist(title: string, words: string[]): Promise<string> {
  return (await send('POST', '/api/checklists', { title, items: words.map((one) => ({ words: one })) }))['checklist'].id as string
}

/** The door's answer to the next press on this item. */
function theAnswerTo(page: Page, list: string, item: string): Promise<Response> {
  return page.waitForResponse((reply) => reply.url().includes(`/api/checklists/${list}/items/${item}`) && reply.request().method() === 'PATCH')
}

async function itWasRefusedAsChanged(answer: Promise<Response>): Promise<void> {
  const reply = await answer
  expect(reply.status(), 'the door refuses it').toBe(409)
  const said = (await reply.json()) as Record<string, unknown>
  expect(said['code']).toBe('checklistChangedSinceRead')
  expect(String(said['error'])).toContain('has changed since you read it, so nothing was written.')
}

const REFUSED = t('server.checklistChangedSinceRead')
const READ_AGAIN = t('w13j.checklistPress.readAgain', { refusal: REFUSED })
const PRESS_ONCE_MORE = t('w13j.checklistPress.pressOnceMore', { refusal: REFUSED })

async function openTheWindow(page: Page): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.ckw-press', { timeout: 30_000 })
  await page.click('.ckw-press')
  await page.waitForSelector('.ckw-panel .cks-card', { timeout: 30_000 })
}

const row = (page: Page, words: string) => page.locator('.ckw-panel .ckp-item', { hasText: words })
const box = (page: Page, words: string) => row(page, words).getByRole('button', { name: `Mark as done: ${words}`, exact: true })

/** The words of these rows, top to bottom, without the state a screen reader is told before them. */
function wordsOf(rows: Locator): Promise<string[]> {
  return rows.evaluateAll((all) =>
    all.map((one) =>
      [...one.childNodes]
        .filter((node) => !(node instanceof HTMLElement && node.classList.contains('ckp-hidden')))
        .map((node) => node.textContent)
        .join('')
        .trim(),
    ),
  )
}

/** The rows of one checklist in the window still to do, or done in this opening of it, in the order drawn. */
function rowsOf(page: Page, title: string): Promise<string[]> {
  const card = page.locator('.ckw-panel .cks-card', { has: page.locator('.cks-title', { hasText: title }) })
  return wordsOf(card.locator('.cks-items:not(.ckp-folded) > .ckp-item .ckp-words'))
}

/** The rows of the checklist's card on the page still to do, in the order drawn. */
function itemsOn(one: Locator): Promise<string[]> {
  return wordsOf(one.locator('.cks-items:not(.ckp-folded) > .ckp-item .ckp-words'))
}

async function openThePage(page: Page, id: string): Promise<Locator> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/checklists/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // THE CARD THE ADDRESS MARKS on the page.
  const one = page.locator('.cks-card[data-marked="yes"]')
  await one.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
  return one
}

async function openedItem(one: Locator, words: string): Promise<Locator> {
  const item = one.locator('.ckp-item', { hasText: words })
  if ((await item.locator('details.ckp-open').getAttribute('open')) === null) await item.locator('summary').click()
  await item.locator('.ckp-facts').first().waitFor({ timeout: 10_000 })
  return item
}

const MAKE = { name: t('w13j.checklistStanding.make'), exact: true }
const UNMAKE = { name: t('w13j.checklistStanding.unmake'), exact: true }

beforeAll(async () => {
  app = await liveApp({ name: 'a-press-refused-as-changed', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'test-fitter', name: 'Test Fitter', role: 'worker' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('a press refused because the checklist changed says so in the page\'s words, and the page reads it again', () => {
  it('1. the window\'s box, after another item moved above it: no "Press once more", then or later, and the next press marks it done', async () => {
    const page = app.page
    const list = await aChecklist('Bench checklist', ['Oil the hinge', 'Label the drawers'])
    await openTheWindow(page)
    // THE WINDOW'S READS OF THE CHECKLISTS ARE HELD from before this write until the door has answered the press, so
    // the press is the one the window offered before it read the change.
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Label the drawers'))['id']}`, { state: 'in progress' }, FITTER)
    const before = (await theList(list))['version'] as string
    const answer = theAnswerTo(page, list, (await theItem(list, 'Oil the hinge'))['id'] as string)
    await box(page, 'Oil the hinge').click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await expect.poll(() => row(page, 'Oil the hinge').locator('.ckw-refusal').innerText(), { timeout: 10_000 }).toBe(READ_AGAIN)
    expect(await rowsOf(page, 'Bench checklist'), 'the item in progress sorts first, so the pressed row moved').toEqual(['Label the drawers', 'Oil the hinge'])
    expect((await theList(list))['version'], 'nothing was written').toBe(before)
    expect((await theItem(list, 'Oil the hinge'))['state']).toBe('open')
    await expect.poll(() => row(page, 'Oil the hinge').getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
    expect(await row(page, 'Oil the hinge').locator('.ckw-refusal').innerText(), 'and not once the row takes presses again').toBe(READ_AGAIN)
    await box(page, 'Oil the hinge').click()
    await expect.poll(async () => (await theItem(list, 'Oil the hinge'))['state'], { timeout: 15_000 }).toBe('done')
    expect((await theItem(list, 'Oil the hinge'))['doneByThePerson']?.by?.kind).toBe('person')
    await expect.poll(() => row(page, 'Oil the hinge').locator('.ckw-refusal').count(), { timeout: 10_000 }).toBe(0)
    await page.keyboard.press('Escape')
  }, 120_000)

  it('2. the window\'s box, after that item was made standing: the same code, the box is gone, and no "Press once more"', async () => {
    const page = app.page
    const list = await aChecklist('Shelf checklist', ['Sort the screws', 'Read the shelf notes'])
    await openTheWindow(page)
    const notes = (await theItem(list, 'Read the shelf notes'))['id'] as string
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${notes}`, { standing: true }, FITTER)
    const answer = theAnswerTo(page, list, notes)
    await box(page, 'Read the shelf notes').click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await expect.poll(() => row(page, 'Read the shelf notes').locator('.ckw-refusal').innerText(), { timeout: 10_000 }).toBe(READ_AGAIN)
    expect(await box(page, 'Read the shelf notes').count(), 'a standing item has no box').toBe(0)
    const stored = await theItem(list, 'Read the shelf notes')
    expect(stored['state']).toBe('open')
    expect(stored['standing']).toBe(true)
    expect(stored['doneByThePerson']).toBeUndefined()
    await page.keyboard.press('Escape')
  }, 120_000)

  it('3. the page\'s "Make it standing", after another item moved above it: no "Press once more", then or later, and the next press stores it', async () => {
    const page = app.page
    const list = await aChecklist('Drawer checklist', ['Wax the runners', 'Count the handles'])
    const one = await openThePage(page, list)
    const runners = await openedItem(one, 'Wax the runners')
    // THE PAGE'S READ OF THE CHECKLIST IS HELD from before this write until the door has answered the press, so the
    // press is the one the page offered before it read the change.
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Count the handles'))['id']}`, { state: 'in progress' }, FITTER)
    const before = (await theList(list))['version'] as string
    const answer = theAnswerTo(page, list, (await theItem(list, 'Wax the runners'))['id'] as string)
    await runners.getByRole('button', MAKE).click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await expect.poll(() => runners.locator('.ckl-refusal').innerText(), { timeout: 10_000 }).toBe(READ_AGAIN)
    expect(await itemsOn(one), 'the item in progress sorts first, so the pressed row moved').toEqual(['Count the handles', 'Wax the runners'])
    expect((await theList(list))['version'], 'nothing was written').toBe(before)
    expect(Object.hasOwn(await theItem(list, 'Wax the runners'), 'standing')).toBe(false)
    await expect.poll(() => runners.getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
    expect(await runners.locator('.ckl-refusal').innerText(), 'and not once the row takes presses again').toBe(READ_AGAIN)
    await runners.getByRole('button', MAKE).click()
    await expect.poll(async () => (await theItem(list, 'Wax the runners'))['standing'], { timeout: 10_000 }).toBe(true)
    await expect.poll(() => runners.locator('.ckl-refusal').count(), { timeout: 10_000 }).toBe(0)
  }, 120_000)

  it('4. the page\'s "Make it standing", after that item was made standing: the press reads "Make it ordinary", and no "Press once more"', async () => {
    const page = app.page
    const list = await aChecklist('Lamp checklist', ['Keep the lamp notes', 'Change the bulb'])
    const one = await openThePage(page, list)
    const notes = await openedItem(one, 'Keep the lamp notes')
    const id = (await theItem(list, 'Keep the lamp notes'))['id'] as string
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${id}`, { standing: true }, FITTER)
    const answer = theAnswerTo(page, list, id)
    await notes.getByRole('button', MAKE).click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await expect.poll(() => notes.locator('.ckl-refusal').innerText(), { timeout: 10_000 }).toBe(READ_AGAIN)
    expect(await notes.getByRole('button', UNMAKE).count()).toBe(1)
    expect(await notes.getByRole('button', MAKE).count()).toBe(0)
    expect((await theItem(list, 'Keep the lamp notes'))['standing']).toBe(true)
  }, 120_000)

  it('5. the window\'s box, after the item below it changed its words: the row did not move, so "Press once more", and the second press marks it done', async () => {
    const page = app.page
    const list = await aChecklist('Gate checklist', ['Fit the latch', 'Paint the frame'])
    await openTheWindow(page)
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Paint the frame'))['id']}`, { words: 'Paint the frame twice' }, FITTER)
    const before = (await theList(list))['version'] as string
    const answer = theAnswerTo(page, list, (await theItem(list, 'Fit the latch'))['id'] as string)
    await box(page, 'Fit the latch').click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await expect.poll(() => row(page, 'Fit the latch').locator('.ckw-refusal').innerText(), { timeout: 10_000 }).toBe(PRESS_ONCE_MORE)
    expect(await rowsOf(page, 'Gate checklist')).toEqual(['Fit the latch', 'Paint the frame twice'])
    expect(await row(page, 'Fit the latch').getAttribute('data-moved'), 'nothing above the row changed').toBeNull()
    expect((await theList(list))['version'], 'nothing was written').toBe(before)
    await box(page, 'Fit the latch').click()
    await expect.poll(async () => (await theItem(list, 'Fit the latch'))['state'], { timeout: 15_000 }).toBe('done')
    await page.keyboard.press('Escape')
  }, 120_000)

  it('6. the page\'s "Make it standing", after the item below it changed its words: "Press once more", and the second press stores it', async () => {
    const page = app.page
    const list = await aChecklist('Candle checklist', ['Trim the wick', 'Polish the base'])
    const one = await openThePage(page, list)
    const wick = await openedItem(one, 'Trim the wick')
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Polish the base'))['id']}`, { words: 'Polish the brass base' }, FITTER)
    const before = (await theList(list))['version'] as string
    const answer = theAnswerTo(page, list, (await theItem(list, 'Trim the wick'))['id'] as string)
    await wick.getByRole('button', MAKE).click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await expect.poll(() => wick.locator('.ckl-refusal').innerText(), { timeout: 10_000 }).toBe(PRESS_ONCE_MORE)
    expect(await itemsOn(one)).toEqual(['Trim the wick', 'Polish the brass base'])
    expect(await wick.getAttribute('data-moved'), 'nothing above the row changed').toBeNull()
    expect((await theList(list))['version'], 'nothing was written').toBe(before)
    await wick.getByRole('button', MAKE).click()
    await expect.poll(async () => (await theItem(list, 'Trim the wick'))['standing'], { timeout: 10_000 }).toBe(true)
  }, 120_000)
})
