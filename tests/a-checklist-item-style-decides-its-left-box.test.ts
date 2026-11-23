// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ITEM'S STYLE DECIDES WHAT ITS LEFT BOX DOES, ON THE CHECKLIST'S PAGE AND IN THE WINDOW. Wave 14a, from the
 * owner's message: the markdown shown on the right of a checklist goes away; a plain item is a
 * blank box on the left, ticked directly, and an item that needs evidence or a passage the owner writes shows a
 * special icon in that same left box, and pressing it opens the picker there. The agent chooses
 * the style when it adds the item; an item stored with no style reads as plain.
 *
 * In a real browser, on this test's own office. The browser is the person: `liveApp`'s key window covers a caller on
 * this machine. Every checklist, agent and report here is made up, and nothing is asked in the owner's name of the
 * live office (chapter 8, rule 3).
 *
 * What is proved:
 *   1. THE PAGE: a plain item's box ticks it done directly with no picker; a special item's box opens the picker under
 *      it, the picker draws a box for the owner's own words, and words typed there are stored whole with the owner's
 *      mark and drawn under the item once it is opened. A standing item has no box even when it has the special style.
 *   2. THE WINDOW: no row draws the right-hand "Mark done"; a plain box ticks directly and a special box opens the
 *      picker. Under another owner's name another owner's special item shows the special icon and no box, because it
 *      is shown to read.
 *   3. A PICKER'S SAVE RESPECTS A STALE READING AND A MOVED ROW: when another change bumps the version, Save is refused
 *      with the code's words and the page reads again; the moved row's Save takes no press for a second and says why;
 *      pressed once it takes presses again, the words are stored and the item is done.
 *   4. WHAT A CLOSED ROW DRAWS CHANGES WITH THE ITEM'S STYLE, so the moved-row guard sees the icon a closed row draws.
 *
 * CONTROL: 4 passed. MUTATIONS: each named beside its case, one at a time, restored. The logs are named in the round's
 * report.
 *
 * Test change (wave 13y round 175): the page and the window draw design E, as decided. On the page a checklist is a
 * card, and the cases read the card the address `#/checklists/<id>` marks; in the window another owner's checklists
 * are drawn by choosing that owner's name in the row of names. Before, the page read the one opened checklist and its
 * counts line, and the window reached another owner's checklists through its full view, which went.
 *
 * Test change (wave 13y round 175, the names behind Back): the window's names are folded behind a Back press at the
 * start of its head, as decided, and they are plain presses, not tabs. Case 2 presses Back, found by its words, before
 * it chooses the other owner's name among the window's name presses. What the case checks is unchanged.
 */

import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChecklistReading } from '../src/shared/checklists.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whatTheRowDraws } from '../src/web/components/ChecklistParts.tsx'
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

async function theList(id: string): Promise<Record<string, any>> {
  return (await send('GET', `/api/checklists/${id}`, undefined))['checklist'] as Record<string, any>
}

async function theItem(list: string, words: string): Promise<Record<string, any>> {
  return ((await theList(list))['items'] as Record<string, any>[]).find((one) => one['words'] === words)!
}

const SPECIAL_NAME = (words: string): string => `Mark done with evidence or words: ${words}`

async function aChecklist(title: string, items: Record<string, unknown>[]): Promise<string> {
  return (await send('POST', '/api/checklists', { title, items }))['checklist'].id as string
}

async function openThePage(page: Page, id: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/checklists/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`${MARKED} .ckp-item`).first().waitFor({ timeout: 30_000 })
}

async function openTheWindow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.ckw-press', { timeout: 30_000 })
  await page.click('.ckw-press')
  await page.waitForSelector('.ckw-panel .cks-card', { timeout: 30_000 })
}

/** The card the address `#/checklists/<id>` marks on the page. */
const MARKED = '.cks-card[data-marked="yes"]'
const pageItem = (page: Page, words: string) => page.locator(`${MARKED} .ckp-item`, { hasText: words })
const windowItem = (page: Page, words: string) => page.locator('.ckw-panel .ckp-item', { hasText: words })
const plainBox = (row: ReturnType<typeof pageItem>) => row.getByRole('button', { name: /^Mark as done: / })
const specialBox = (row: ReturnType<typeof pageItem>) => row.getByRole('button', { name: /^Mark done with evidence or words: / })

/**
 * THE NEXT PRESS AFTER A TICK WAITS FOR THE SIGNALS THE VIEW GIVES (wave 13y round 61). When a view draws the tick,
 * every row below the line whose count changed is marked as moved and takes no press for a second. A press in that
 * second opens no picker, and nothing presses again. In a whole run of the suite at twenty workers, case 1 waited 20
 * seconds for a picker that never opened. Run alone, the case had pressed before the page drew the tick: the ticked
 * row was still there. So the case waits until the view has drawn the tick, and then until the row it presses is no
 * longer marked. The page draws the tick when it has read the checklist again, and the ticked row goes under the
 * closed fold. The window draws the tick from the reply to it, and the ticked row says who was told.
 */
async function untilItTakesPresses(row: Locator): Promise<void> {
  await expect.poll(() => row.getAttribute('data-moved'), { timeout: 10_000 }).toBeNull()
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-checklist-item-style', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'quill', name: 'Quill', role: 'worker' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

describe('an item\'s style decides what its left box does', () => {
  it("1. on the page a plain box ticks directly, a special box opens the picker and stores the owner's words, and a standing item has no box", async () => {
    const page = app.page
    const list = await aChecklist('Kiln checklist', [
      { words: 'Fire the test tiles' },
      { words: 'Write how the kiln is loaded', style: 'evidence-or-words' },
      { words: 'My experiment manual', standing: true, style: 'evidence-or-words' },
    ])
    await openThePage(page, list)
    const tiles = pageItem(page, 'Fire the test tiles')
    expect(await plainBox(tiles).count(), "the plain item's box").toBe(1)
    expect(await tiles.locator('.ckp-mark[data-special="yes"]').count(), 'the plain box has no special icon').toBe(0)
    const special = pageItem(page, 'Write how the kiln is loaded')
    expect(await specialBox(special).count(), "the special item's box").toBe(1)
    expect(await special.locator('.ckp-mark[data-special="yes"]').count(), 'the special icon in that box').toBe(1)
    const standing = pageItem(page, 'My experiment manual')
    expect(await standing.locator('.ckp-box').count(), 'a standing item has no box, special style or not').toBe(0)

    // THE PLAIN BOX TICKS DIRECTLY, and no picker opens for it.
    await plainBox(tiles).click({ timeout: 10_000 })
    await expect.poll(async () => (await theItem(list, 'Fire the test tiles'))['state'], { timeout: 15_000 }).toBe('done')
    expect(await tiles.locator('.ckw-picker').count(), 'no picker for a plain item').toBe(0)
    expect((await theItem(list, 'Fire the test tiles'))['response'], 'no words for a plain tick').toBeUndefined()

    // THE SPECIAL BOX OPENS THE PICKER THERE, and the picker's Save takes the owner's words alone.
    await tiles.waitFor({ state: 'detached', timeout: 15_000 })
    await untilItTakesPresses(special)
    await specialBox(special).click({ timeout: 10_000 })
    const picker = special.locator('.ckw-picker')
    // THE WORDS-ONLY PATH NEEDS NO CHOICE TO EXIST: this office holds no report or run to pick, and the box opens the
    // picker to its words box all the same.
    await picker.locator('textarea').waitFor({ timeout: 20_000 })
    const wordsBox = picker.locator('textarea')
    expect(await wordsBox.getAttribute('aria-label'), "the owner's words box").toBe('Your own words (optional)')
    await wordsBox.click()
    const said = 'The tiles came out blue.\nSecond line: the glaze is 3.'
    await wordsBox.fill(said, { timeout: 10_000 })
    await picker.getByRole('button', { name: 'Mark done' }).click({ timeout: 10_000 })
    await expect.poll(async () => (await theItem(list, 'Write how the kiln is loaded'))['state'], { timeout: 15_000 }).toBe('done')
    const stored = await theItem(list, 'Write how the kiln is loaded')
    expect(stored['response'], 'the words are stored exactly as typed').toBe(said)
    expect(stored['doneByThePerson']?.by?.kind, "the owner's mark").toBe('person')
    expect(stored['evidence'], 'no evidence was needed').toBeUndefined()
    // THE DONE ITEM IS FOLDED UNDER THE OTHERS once the page reads again, so the fold is opened before it is.
    const fold = page.locator(`${MARKED} .ckp-fold`)
    if ((await fold.count()) > 0) await fold.click()
    await special.locator('summary').click()
    await expect.poll(() => special.locator('.ckp-response').innerText(), { timeout: 10_000 }).toContain('Written response:')
    expect(await special.locator('.ckp-response').innerText(), 'the words are drawn whole').toContain(said)
    // MUTATION: the special box's onClick ticked directly instead of opening the picker. This case went red.
  }, 120_000)

  it("2. in the window no right-hand Mark done is drawn, a plain box ticks directly, a special box opens the picker, and another owner's list is read-only", async () => {
    const page = app.page
    const mine = await aChecklist('Shelf checklist', [
      { words: 'Sort the screws' },
      { words: 'Read the shelf notes', style: 'evidence-or-words' },
    ])
    await send('POST', '/api/checklists', {
      title: "Quill's list",
      items: [{ words: 'Clear the top shelf', style: 'evidence-or-words' }],
    }, AS('quill'))
    await openTheWindow(page)
    expect(await page.locator('.ckw-mark').count(), 'no right-hand "Mark done" anywhere').toBe(0)
    const screws = windowItem(page, 'Sort the screws')
    expect(await plainBox(screws).count(), "the plain item's box").toBe(1)
    await plainBox(screws).click({ timeout: 10_000 })
    await expect.poll(async () => (await theItem(mine, 'Sort the screws'))['state'], { timeout: 15_000 }).toBe('done')
    expect((await theItem(mine, 'Sort the screws'))['response'], 'no words for a plain tick').toBeUndefined()
    const notes = windowItem(page, 'Read the shelf notes')
    expect(await specialBox(notes).count(), "the special item's box").toBe(1)
    expect(await notes.locator('.ckp-mark[data-special="yes"]').count(), 'the special icon').toBe(1)
    await screws.locator('.ckw-done-with').waitFor({ timeout: 15_000 })
    await untilItTakesPresses(notes)
    await specialBox(notes).click({ timeout: 10_000 })
    await notes.locator('.ckw-picker textarea').waitFor({ timeout: 20_000 })
    await page.keyboard.press('Escape')

    // ANOTHER OWNER'S SPECIAL ITEM IS SHOWN TO READ: its icon is drawn, and it has no box and no picker.
    await openTheWindow(page)
    const panel = page.locator('.ckw-panel')
    await panel.getByRole('button', { name: t('checklists.window.back'), exact: true }).click()
    await panel.locator('.ckw-names button', { hasText: 'Quill' }).click()
    const theirs = panel.locator('.cks-card', { hasText: "Quill's list" })
    await theirs.waitFor({ timeout: 20_000 })
    const theirItem = theirs.locator('.ckp-item', { hasText: 'Clear the top shelf' })
    expect(await theirItem.locator('.ckp-mark[data-special="yes"]').count(), 'the icon is read-only information').toBe(1)
    expect(await theirItem.locator('.ckp-box').count(), 'no box on a list shown to read').toBe(0)
    expect(await theirItem.getByRole('button', { name: 'Mark done' }).count(), 'no picker entry on a list shown to read').toBe(0)
    await page.keyboard.press('Escape')
    // MUTATION: the window's box drawn whatever `mayMark` said. This case went red on the read-only item.
  }, 120_000)

  it('3. the picker\'s Save respects a stale reading and a moved row, then stores the words', async () => {
    const page = app.page
    const list = await aChecklist('Log checklist', [
      { words: 'Stir the glaze' },
      { words: 'Write the firing log', style: 'evidence-or-words' },
    ])
    await send('POST', '/api/agents/started', { handle: 'test-fitter', name: 'Test Fitter', role: 'worker' })
    await openThePage(page, list)
    const log = pageItem(page, 'Write the firing log')
    await specialBox(log).click({ timeout: 10_000 })
    const picker = log.locator('.ckw-picker')
    // THE WORDS-ONLY PATH NEEDS NO CHOICE TO EXIST: this office holds no report or run to pick.
    await picker.locator('textarea').waitFor({ timeout: 20_000 })
    const said = 'The firing held at the top for an hour.'
    await picker.locator('textarea').fill(said, { timeout: 10_000 })
    // ANOTHER CHANGE BUMPS THE VERSION, AND IT MOVES THE ROW: an item in progress sorts before an open one.
    await send('PATCH', `/api/checklists/${list}/items/${(await theItem(list, 'Stir the glaze'))['id']}`, { state: 'in progress' }, AS('test-fitter'))
    const before = (await theList(list))['version'] as string
    const answer = page.waitForResponse((reply) => reply.url().includes(`/api/checklists/${list}/items/`) && reply.request().method() === 'PATCH')
    await picker.getByRole('button', { name: 'Mark done' }).click({ timeout: 10_000 })
    expect((await answer).status(), 'the door refuses the stale Save').toBe(409)
    await expect.poll(() => picker.locator('.ckw-refusal').innerText(), { timeout: 10_000 }).toContain(
      'This checklist changed while the page was open, so nothing was changed.',
    )
    expect((await theList(list))['version'], 'nothing was written').toBe(before)
    expect((await theItem(list, 'Write the firing log'))['state'], 'the item is not done').toBe('open')
    const save = picker.getByRole('button', { name: 'Mark done' })
    // THE MOVED ROW'S SAVE TAKES NO PRESS, and only then does the refusal say the page has read it again: until the
    // re-read lands, the words are the door's sentence alone.
    await expect.poll(() => save.getAttribute('aria-disabled'), { timeout: 10_000 }).toBe('true')
    // THE PRESS ON A ROW THAT MOVED SENDS NOTHING AND SAYS WHY: forced, because a press that waits for the mark to go
    // would be the enabled press this case is not about (wave 13j round loop-9's own browser tests force it too).
    await save.click({ force: true })
    await expect.poll(() => picker.locator('.px-why').innerText(), { timeout: 5_000 }).toBe(
      'This item may have moved just now, so it takes no press for one second.',
    )
    expect(await picker.locator('.ckw-refusal').innerText(), 'the page read it again').toContain('The page has read it again.')
    expect(await picker.locator('.ckw-refusal').innerText(), 'a moved row gets no "Press once more"').not.toContain('Press once more.')
    await expect.poll(() => save.getAttribute('aria-disabled'), { timeout: 10_000 }).toBeNull()
    await save.click({ timeout: 10_000 })
    await expect.poll(async () => (await theItem(list, 'Write the firing log'))['state'], { timeout: 15_000 }).toBe('done')
    expect((await theItem(list, 'Write the firing log'))['response'], 'the words survive the refusal and are stored').toBe(said)
    // MUTATION: the picker's Save sent no `response`; or it kept the raw error and never read again. This case went red.
  }, 120_000)

  it('4. what a closed row draws changes with the item\'s style, so the moved-row guard sees the icon', () => {
    const reading = {
      id: 'checklist-1',
      workspaceId: 'default',
      title: 'Made-up checklist',
      owner: { kind: 'person', id: THE_PERSON },
      ownerName: 'Jory',
      items: [],
      counts: { open: 0, waitingOnTheOwner: 0, done: 0, superseded: 0, standing: 0 },
      flows: [],
      linked: [],
      named: [],
      version: 'v1',
      updatedAt: '2026-10-18 00:00:00',
    } as unknown as ChecklistReading
    const item = { id: 'i-1', words: 'Write the firing log', state: 'open' as const }
    const plain = { ...item, style: 'plain' as const }
    const special = { ...item, style: 'evidence-or-words' as const }
    const older = { ...item }
    expect(whatTheRowDraws(plain, reading, false), 'the icon a closed row draws').not.toBe(whatTheRowDraws(special, reading, false))
    expect(whatTheRowDraws(older, reading, false), 'an item stored with no style reads as plain').toBe(whatTheRowDraws(plain, reading, false))
    // MUTATION: whatTheRowDraws left the style out of a closed row's line. This case went red.
  })
})
