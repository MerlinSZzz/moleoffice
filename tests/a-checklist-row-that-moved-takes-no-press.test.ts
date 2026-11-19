// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKLIST ROW THAT MOVED WHEN THE VIEW READ THE CHECKLIST AGAIN TAKES NO PRESS FOR ONE SECOND, AND IS MARKED AS MOVED
 * FOR THAT SECOND. Wave 13j round loop-9, backlog item 1, from the secretary's answer L8_V7OK149wo: "after any re-read, a row
 * whose position changed takes no press for one second, and it is marked as moved for that second. A press must never
 * act for the person on a row they did not aim at." The decision that sorts the items by state stands.
 *
 * WHAT "MOVED" MEANS, from the secretary's answer u1xHS9oaCIOn, worked out from the readings alone: a row has moved when its place
 * among the rows the view draws changed, when it was not drawn before, or when anything drawn above it in the same view
 * changed in the re-read, such as a refusal line, a "told" line or an item whose words changed. What the person does,
 * such as scrolling or opening or closing an item, never counts as a move.
 *
 * ONLY WHAT IS DRAWN COUNTS, from the secretary's answer WUHKbopia72M, answer 2: "A change hidden inside a closed item moves
 * nothing on screen, so it must not mark that row or the rows below." A closed item draws its mark, its words and the
 * flow it stands for; its facts are drawn only when it is opened. So a change to its facts marks no row while it is
 * closed, and marks the rows below it once it is opened.
 *
 * In a real browser, on this test's own office. The browser is the person: `liveApp`'s key window covers a caller on
 * this machine. Every checklist, agent and item here is made up, and nothing is asked in the owner's name of the live
 * office (chapter 8, rule 3).
 *
 * MEASURED: the panel's opening animation was still running (0 ms at the aim, 16.7 ms at the click) when the first aim
 * was read, so the press landed on the page behind and sent nothing; the window now waits for that animation to finish.
 *
 * What is proved:
 *   1. A PRESS THAT WORKS MOVES THE ROWS: the item marked done in the window sorts after the open ones, and the row that
 *      takes its place under the pointer is marked as moved. A second press at the same place in that second sends
 *      nothing. The mark goes after about one second, and then the same press marks the row now under it done.
 *   2. A ROW WHOSE PLACE DID NOT CHANGE IS MARKED AS MOVED WHEN THE WORDS OF AN ITEM ABOVE IT CHANGED in the re-read. Its
 *      refusal has no "Press once more", then or later. Its box sends nothing while it is marked and says why, and the
 *      words go with the mark.
 *   3. WHAT THE PERSON DOES NEVER COUNTS: done items unfolded above a checklist, and an item opened above it, are not a
 *      move when the window reads again. The pressed row is not marked, and its refusal says "Press once more".
 *   4. THE PAGE'S "Make it standing" ON A ROW THAT MOVED sends nothing in that second and says why, and the words go
 *      with the mark. Then it stores the item standing.
 *   5. IN THE WINDOW, A CHANGE INSIDE A CLOSED ITEM ABOVE A ROW MARKS NEITHER THE ITEM NOR THAT ROW: the refused row
 *      below it says "Press once more". (The rows under the refused row are marked all the same, because its refusal's
 *      words changed in the re-read, and those are drawn.) Once the item above is opened, the same kind of change marks
 *      the refused row too, and its refusal has no "Press once more".
 *   6. ON THE PAGE, THE SAME: a change inside a closed item above an opened row marks no row and its refusal says
 *      "Press once more"; once the item above is opened, the same kind of change marks the row below it.
 */

import type { Locator, Page, Request, Response } from 'playwright'
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

/** A checklist of the person's own, with these items: open unless a state is given. */
async function aChecklist(title: string, items: (string | { words: string; state: string })[]): Promise<string> {
  const shaped = items.map((one) => (typeof one === 'string' ? { words: one } : one))
  return (await send('POST', '/api/checklists', { title, items: shaped }))['checklist'].id as string
}

/** Every change the browser sends to this checklist's items, from now on. */
function pressesOn(page: Page, list: string): { sent: string[]; stop: () => void } {
  const sent: string[] = []
  const listen = (request: Request): void => {
    if (request.method() === 'PATCH' && request.url().includes(`/api/checklists/${list}/items/`)) sent.push(request.url().split('/items/')[1]!)
  }
  page.on('request', listen)
  return { sent, stop: () => page.off('request', listen) }
}

/** The door's answer to the next press on this item. */
function theAnswerTo(page: Page, list: string, item: string): Promise<Response> {
  return page.waitForResponse((reply) => reply.url().includes(`/api/checklists/${list}/items/${item}`) && reply.request().method() === 'PATCH')
}

async function itWasRefusedAsChanged(answer: Promise<Response>): Promise<void> {
  const reply = await answer
  expect(reply.status(), 'the door refuses it').toBe(409)
  expect(((await reply.json()) as Record<string, unknown>)['code']).toBe('checklistChangedSinceRead')
}

const REFUSED = t('server.checklistChangedSinceRead')
const READ_AGAIN = t('w13j.checklistPress.readAgain', { refusal: REFUSED })
const PRESS_ONCE_MORE = t('w13j.checklistPress.pressOnceMore', { refusal: REFUSED })
const MOVED = t('w13j.checklistMoved.reason')

async function openTheWindow(page: Page): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.ckw-press', { timeout: 30_000 })
  await page.click('.ckw-press')
  await page.waitForSelector('.ckw-panel .ckw-group', { timeout: 30_000 })
  await page.locator('.ckw-panel').evaluate((panel) => Promise.all(panel.getAnimations().map((one) => one.finished.catch(() => undefined))))
}

const row = (page: Page, words: string) => page.locator('.ckw-panel .ckp-item', { hasText: words })
const box = (page: Page, words: string) => row(page, words).getByRole('button', { name: `Mark as done: ${words}`, exact: true })
const MARKED = '[data-moved="yes"]'

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
  const group = page.locator('.ckw-panel .ckw-group', { has: page.locator('.ckw-group-title', { hasText: title }) })
  return wordsOf(group.locator('.ckw-items:not(.ckp-folded) > .ckp-item .ckp-words'))
}

/** When the row was marked as moved, when the mark went and when each click came, on the page's own clock. */
interface TheMarkAsTimed {
  on?: number
  off?: number
  clicks: number[]
}

/**
 * TIMES THE MARK ON THE ROW WITH THESE WORDS IN THE BROWSER, from now on. The page counts the mark's second from the
 * drawing that marks the row, not from anything the test does. A wait or a read through Playwright takes time out of
 * that second, and more on a busy machine. A wait for an element looks at once, then after 20, 50, 100 and 100 ms, and
 * then every 500 ms, so it can end up to half a second after the element came. So the mark is timed where it is drawn.
 */
async function timeTheMarkOn(page: Page, words: string): Promise<void> {
  await page.evaluate((words) => {
    const timed: TheMarkAsTimed = { clicks: [] }
    ;(window as unknown as { theMark: TheMarkAsTimed }).theMark = timed
    const watch = new MutationObserver(() => {
      const one = [...document.querySelectorAll('.ckw-panel .ckp-item')].find((row) => row.textContent?.includes(words) === true)
      const marked = one?.getAttribute('data-moved') === 'yes'
      if (marked && timed.on === undefined) timed.on = performance.now()
      if (!marked && timed.on !== undefined) {
        timed.off = performance.now()
        watch.disconnect()
      }
    })
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-moved'] })
    document.addEventListener('click', () => timed.clicks.push(performance.now()), true)
  }, words)
}

function theMarkAsTimed(page: Page): Promise<TheMarkAsTimed> {
  return page.evaluate(() => (window as unknown as { theMark: TheMarkAsTimed }).theMark)
}

/** Waits until no row in the window is marked as moved, so a press is the person's aim and not a race with a re-read. */
async function nothingMarked(page: Page): Promise<void> {
  await expect.poll(() => page.locator(`.ckw-panel .ckp-item${MARKED}`).count(), { timeout: 10_000 }).toBe(0)
}

/** The middle of what a locator draws, where a pointer aimed at it stands. */
async function middleOf(one: Locator): Promise<{ x: number; y: number }> {
  const at = (await one.boundingBox())!
  return { x: at.x + at.width / 2, y: at.y + at.height / 2 }
}

async function openThePage(page: Page, id: string): Promise<Locator> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/checklists/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const one = page.locator('.ck1')
  await one.locator('.ck1-counts').waitFor({ timeout: 30_000 })
  return one
}

async function openedItem(one: Locator, words: string): Promise<Locator> {
  const item = one.locator('.ckp-item', { hasText: words })
  if ((await item.locator('details.ckp-open').getAttribute('open')) === null) await item.locator('summary').click()
  await item.locator('.ckp-facts').first().waitFor({ timeout: 10_000 })
  return item
}

const MAKE = { name: t('w13j.checklistStanding.make'), exact: true }

beforeAll(async () => {
  app = await liveApp({ name: 'a-checklist-row-that-moved', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'test-fitter', name: 'Test Fitter', role: 'worker' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('a checklist row that moved when the view read again takes no press for one second, and is marked as moved', () => {
  it('1. a press that works moves the rows: the row now under the pointer is marked, takes no press for about a second, then takes it', async () => {
    const page = app.page
    const list = await aChecklist('Tool checklist', ['Sharpen the chisel', 'Clean the plane', 'Sort the files'])
    await openTheWindow(page)
    await nothingMarked(page)
    const aim = await middleOf(box(page, 'Sharpen the chisel'))
    const presses = pressesOn(page, list)
    const chisel = (await theItem(list, 'Sharpen the chisel'))['id'] as string
    const plane = (await theItem(list, 'Clean the plane'))['id'] as string
    const answer = theAnswerTo(page, list, chisel)
    await timeTheMarkOn(page, 'Clean the plane')
    await page.mouse.click(aim.x, aim.y)
    expect((await answer).status(), 'the first press marks the chisel done').toBe(200)
    // Playwright checks this on every frame the page draws, so the wait ends within a frame of the mark.
    await page.waitForFunction(() => (window as unknown as { theMark: TheMarkAsTimed }).theMark.on !== undefined, undefined, { timeout: 5_000 })
    const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.ckp-item')?.textContent ?? '', aim)
    expect(under, 'the plane\'s row now stands where the chisel\'s box was').toContain('Clean the plane')
    expect(await box(page, 'Clean the plane').getAttribute('aria-disabled')).toBe('true')
    expect(await rowsOf(page, 'Tool checklist'), 'the item done sorts after the open ones').toEqual(['Clean the plane', 'Sort the files', 'Sharpen the chisel'])
    await page.mouse.click(aim.x, aim.y)
    await nothingMarked(page)
    const mark = await theMarkAsTimed(page)
    const lasted = mark.off! - mark.on!
    const secondPress = mark.clicks.find((at) => at > mark.on!)
    expect(secondPress !== undefined && secondPress < mark.off!, `the second press came while the row was marked: ${JSON.stringify(mark)}`).toBe(true)
    expect(lasted, 'still marked half a second on').toBeGreaterThan(500)
    expect(presses.sent, 'the second press at the same place sent nothing').toEqual([chisel])
    expect((await theItem(list, 'Clean the plane'))['state']).toBe('open')
    expect(lasted, 'the mark lasts about one second').toBeGreaterThan(700)
    expect(lasted).toBeLessThan(2_500)
    expect(await box(page, 'Clean the plane').getAttribute('aria-disabled')).toBeNull()
    const second = theAnswerTo(page, list, plane)
    await page.mouse.click(aim.x, aim.y)
    expect((await second).status(), 'once the mark has gone, the press marks the row under it done').toBe(200)
    expect(presses.sent).toEqual([chisel, plane])
    expect((await theItem(list, 'Clean the plane'))['state']).toBe('done')
    presses.stop()
    await page.keyboard.press('Escape')
  }, 120_000)

  it('2. a row whose place did not change is marked as moved when the words of an item above it changed in the re-read', async () => {
    const page = app.page
    const list = await aChecklist('Paint checklist', ['Stir the paint', 'Mask the edges'])
    await openTheWindow(page)
    await nothingMarked(page)
    // THE WINDOW'S READS OF THE CHECKLISTS ARE HELD from before this write until the door has answered the press, so
    // the press is the one the window offered before it read the change.
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Stir the paint'))['id']}`, { words: 'Stir the paint well' }, FITTER)
    const before = (await theList(list))['version'] as string
    const edges = (await theItem(list, 'Mask the edges'))['id'] as string
    const presses = pressesOn(page, list)
    const answer = theAnswerTo(page, list, edges)
    await box(page, 'Mask the edges').click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await row(page, 'Mask the edges').and(page.locator(MARKED)).waitFor({ timeout: 5_000 })
    await box(page, 'Mask the edges').click({ force: true })
    expect(await row(page, 'Mask the edges').locator('.px-why').innerText(), 'the press says why it did nothing').toBe(MOVED)
    await page.waitForTimeout(400)
    expect(presses.sent, 'the press while it is marked sent nothing').toEqual([edges])
    expect(await rowsOf(page, 'Paint checklist'), 'its place among the rows is the same').toEqual(['Stir the paint well', 'Mask the edges'])
    expect(await row(page, 'Stir the paint well').getAttribute('data-moved'), 'the row whose words changed did not move').toBeNull()
    expect((await theList(list))['version'], 'nothing was written').toBe(before)
    await expect.poll(() => row(page, 'Mask the edges').getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
    expect(await row(page, 'Mask the edges').locator('.px-why').count(), 'the words go with the mark').toBe(0)
    expect(await row(page, 'Mask the edges').locator('.ckw-refusal').innerText(), 'no "Press once more", then or later').toBe(READ_AGAIN)
    presses.stop()
    await page.keyboard.press('Escape')
  }, 120_000)

  it('3. what the person does never counts: done items unfolded and an item opened above a row are not a move when the window reads again', async () => {
    const page = app.page
    // THE GARDEN CHECKLIST STAYS FIRST, because a checklist with an item waiting on the owner comes first whatever changed
    // last. So the kitchen's change below it moves nothing above the kitchen.
    const garden = await aChecklist('Garden checklist', [{ words: 'Ask about the hedge', state: 'waiting on the owner' }, 'Rake the leaves'])
    await send('PATCH', `/api/checklists/${garden}/items/${(await theItem(garden, 'Rake the leaves'))['id']}`, { state: 'done' })
    const kitchen = await aChecklist('Kitchen checklist', ['Wipe the bench', 'Empty the bin'])
    await openTheWindow(page)
    await nothingMarked(page)
    const groups = page.locator('.ckw-panel .ckw-group-title')
    expect((await groups.allInnerTexts()).slice(0, 2)).toEqual(['Garden checklist', 'Kitchen checklist'])
    await page.locator('.ckw-panel .ckw-group', { has: page.locator('.ckw-group-title', { hasText: 'Garden checklist' }) }).locator('.ckp-fold').click()
    await row(page, 'Rake the leaves').waitFor({ timeout: 5_000 })
    await row(page, 'Ask about the hedge').locator('summary').click()
    await row(page, 'Ask about the hedge').locator('.ckp-facts').first().waitFor({ timeout: 5_000 })
    const held = await holdThePagesReadsOfAChecklist(page, kitchen)
    await send('PATCH', `/api/checklists/${kitchen}/items/${(await theItem(kitchen, 'Empty the bin'))['id']}`, { words: 'Empty the bin today' }, FITTER)
    const bench = (await theItem(kitchen, 'Wipe the bench'))['id'] as string
    const answer = theAnswerTo(page, kitchen, bench)
    await box(page, 'Wipe the bench').click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await row(page, 'Empty the bin today').and(page.locator(MARKED)).waitFor({ timeout: 5_000 })
    expect(await row(page, 'Wipe the bench').getAttribute('data-moved'), 'the bench row is not marked').toBeNull()
    expect(await row(page, 'Rake the leaves').getAttribute('data-moved'), 'nor is the done item the person unfolded').toBeNull()
    expect(await box(page, 'Wipe the bench').getAttribute('aria-disabled')).toBeNull()
    await expect.poll(() => row(page, 'Wipe the bench').locator('.ckw-refusal').innerText(), { timeout: 10_000 }).toBe(PRESS_ONCE_MORE)
    await box(page, 'Wipe the bench').click()
    await expect.poll(async () => (await theItem(kitchen, 'Wipe the bench'))['state'], { timeout: 15_000 }).toBe('done')
    await page.keyboard.press('Escape')
  }, 120_000)

  it('4. the page\'s "Make it standing" on a row that moved sends nothing in that second and says why; the words go with the mark', async () => {
    const page = app.page
    const list = await aChecklist('Porch checklist', ['Sweep the step', 'Fix the light'])
    const one = await openThePage(page, list)
    const step = await openedItem(one, 'Sweep the step')
    // THE PAGE'S READ OF THE CHECKLIST IS HELD from before this write until the door has answered the press, so the
    // press is the one the page offered before it read the change.
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Fix the light'))['id']}`, { state: 'in progress' }, FITTER)
    const id = (await theItem(list, 'Sweep the step'))['id'] as string
    const presses = pressesOn(page, list)
    const answer = theAnswerTo(page, list, id)
    await step.getByRole('button', MAKE).click()
    await itWasRefusedAsChanged(answer)
    await held.release()
    await step.and(page.locator(MARKED)).waitFor({ timeout: 5_000 })
    await step.getByRole('button', MAKE).click({ force: true })
    expect(await step.locator('.px-why').innerText(), 'the press says why it did nothing').toBe(MOVED)
    await page.waitForTimeout(400)
    expect(presses.sent, 'the press while it is marked sent nothing').toEqual([id])
    expect(Object.hasOwn(await theItem(list, 'Sweep the step'), 'standing')).toBe(false)
    await expect.poll(() => step.getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
    expect(await step.locator('.px-why').count(), 'the words go with the mark').toBe(0)
    await step.getByRole('button', MAKE).click()
    await expect.poll(async () => (await theItem(list, 'Sweep the step'))['standing'], { timeout: 10_000 }).toBe(true)
    expect(presses.sent).toEqual([id, id])
    presses.stop()
  }, 120_000)

  it('5. only what is drawn counts in the window: a change inside a closed item marks neither it nor the refused row below, and opened it marks that row', async () => {
    const page = app.page
    const list = await aChecklist('Shed checklist', ['Oil the hinge', 'Paint the door', 'Sweep the floor'])
    const hinge = (await theItem(list, 'Oil the hinge'))['id'] as string
    const door = (await theItem(list, 'Paint the door'))['id'] as string
    await openTheWindow(page)
    await nothingMarked(page)
    // CLOSED: "Must be in the manual" is drawn only when the item is opened, so nothing on screen moved.
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${hinge}`, { mustBeInManual: true }, FITTER)
    const first = theAnswerTo(page, list, door)
    await box(page, 'Paint the door').click()
    await itWasRefusedAsChanged(first)
    await held.release()
    await expect.poll(() => row(page, 'Paint the door').locator('.ckw-refusal').innerText(), { timeout: 10_000 }).toBe(PRESS_ONCE_MORE)
    expect(await row(page, 'Oil the hinge').getAttribute('data-moved'), 'the closed item is not marked').toBeNull()
    expect(await row(page, 'Paint the door').getAttribute('data-moved'), 'nor the refused row below it').toBeNull()
    expect(await box(page, 'Paint the door').getAttribute('aria-disabled')).toBeNull()
    // OPENED: the same kind of change is drawn now, so the rows below the opened item moved, the refused row first.
    await row(page, 'Oil the hinge').locator('summary').click()
    await row(page, 'Oil the hinge').locator('.ckp-manual').waitFor({ timeout: 5_000 })
    const heldAgain = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${hinge}`, { mustBeInManual: false }, FITTER)
    const second = theAnswerTo(page, list, door)
    await box(page, 'Paint the door').click()
    await itWasRefusedAsChanged(second)
    await heldAgain.release()
    await row(page, 'Paint the door').and(page.locator(MARKED)).waitFor({ timeout: 5_000 })
    expect(await row(page, 'Sweep the floor').getAttribute('data-moved'), 'and the row below it').toBe('yes')
    expect(await row(page, 'Oil the hinge').getAttribute('data-moved'), 'the opened item itself did not move').toBeNull()
    await expect.poll(() => row(page, 'Paint the door').getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
    expect(await row(page, 'Paint the door').locator('.ckw-refusal').innerText(), 'no "Press once more"').toBe(READ_AGAIN)
    expect((await theItem(list, 'Paint the door'))['state']).toBe('open')
    await page.keyboard.press('Escape')
  }, 120_000)

  it('6. only what is drawn counts on the page: a change inside a closed item above a row marks no row, and inside it opened marks the row below', async () => {
    const page = app.page
    const list = await aChecklist('Gate checklist', ['Oil the latch', 'Paint the gate'])
    const latch = (await theItem(list, 'Oil the latch'))['id'] as string
    const gate = (await theItem(list, 'Paint the gate'))['id'] as string
    const one = await openThePage(page, list)
    const below = await openedItem(one, 'Paint the gate')
    const held = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${latch}`, { mustBeInManual: true }, FITTER)
    const first = theAnswerTo(page, list, gate)
    await below.getByRole('button', MAKE).click()
    await itWasRefusedAsChanged(first)
    await held.release()
    await expect.poll(() => below.locator('.ck1-refusal').innerText(), { timeout: 10_000 }).toBe(PRESS_ONCE_MORE)
    expect(await one.locator(`.ckp-item${MARKED}`).count(), 'no row is marked').toBe(0)
    const above = await openedItem(one, 'Oil the latch')
    await above.locator('.ckp-manual').waitFor({ timeout: 5_000 })
    const heldAgain = await holdThePagesReadsOfAChecklist(page, list)
    await send('PATCH', `/api/checklists/${list}/items/${latch}`, { mustBeInManual: false }, FITTER)
    const second = theAnswerTo(page, list, gate)
    await below.getByRole('button', MAKE).click()
    await itWasRefusedAsChanged(second)
    await heldAgain.release()
    await below.and(page.locator(MARKED)).waitFor({ timeout: 5_000 })
    expect(await above.getAttribute('data-moved'), 'the opened item itself did not move').toBeNull()
    await expect.poll(() => below.getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
    expect(await below.locator('.ck1-refusal').innerText(), 'no "Press once more"').toBe(READ_AGAIN)
    expect(Object.hasOwn(await theItem(list, 'Paint the gate'), 'standing')).toBe(false)
  }, 120_000)
})
