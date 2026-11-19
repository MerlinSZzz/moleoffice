// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKLIST SHOWS WHAT IS NOT FINISHED FIRST, AND FOLDS WHAT IS FINISHED AT THE BOTTOM. Wave 13j round loop-5, part f:
 * in every checklist view, items not finished are shown first, in their order; finished items (done or
 * superseded) are moved to the bottom and folded together by default, so they are not shown until the person opens
 * the fold. That message was sent on by the secretary in message INzewGF10rF0. A
 * standing item with no done box, such as an experiment manual, counts with the items not finished and
 * stays in the open part.
 *
 * Two views draw a checklist's items: the checklist's own page (`#/checklists/<id>`) and the checklists window. Both
 * take their order and their fold press from src/web/components/ChecklistParts.tsx. Among the items not finished, the
 * ones waiting on the owner still come first, then those in progress, then the open ones, each in the order they were
 * added, as both views already drew them.
 *
 * In a real browser, on this test's own office. Every checklist, agent and message here is made up, and nothing is asked
 * in the owner's name of the live office (chapter 8, rule 3).
 *
 * What is proved:
 *   1. The page draws the items not finished first, with the standing item among them though it was added last, and
 *      draws no finished item until its one fold press is pressed. The press says how many, and whether any were
 *      replaced; pressed, it draws them below it and says it hides them; pressed again, it hides them. A checklist with
 *      nothing finished has no fold press, and another checklist opened from the table starts folded.
 *   2. The window draws the same items in the same order, the finished ones folded under the same press.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   J. src/web/pages/ChecklistsPage.tsx, the finished items drawn among the others with no fold: case 1 goes red.
 *   K. src/web/pages/ChecklistsPage.tsx, the fold starts open: case 1 goes red.
 *   L. src/web/components/ChecklistParts.tsx, the order puts open items before the ones waiting on the owner: cases 1
 *      and 2 go red.
 *   M. src/web/components/ChecklistParts.tsx, the fold press never says that items were replaced: cases 1 and 2 go red.
 *   N. src/web/App.tsx, the page is not drawn afresh for each address (`TheFaultBoundary` without its key), so a fold
 *      opened on one checklist stays open on the next: case 1 goes red. Nothing in the checklists page keeps a fold
 *      from one address to the next; a key on the opened checklist there was tried and changed nothing.
 */

import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

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
  const aLetterNothingHolds = method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds) expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBe(409)
  else expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

const MANUAL = 'My lab manual'
const NOT_FINISHED = ['Choose the glaze', 'Load the kiln', MANUAL]
const FINISHED = ['Fire the test tiles', 'Clean the shelves', 'Old glaze notes']
let lab = ''
let shelf = ''
let fresh = ''

beforeAll(async () => {
  app = await liveApp({ name: 'a-checklist-shows-what-is-not-finished-first', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const quill = (await send('POST', '/api/agents/started', { handle: 'quill', name: 'Quill', role: 'worker' }))['agent'].id as string
  // IN THE ORDER THEY WERE ADDED: two finished items and a replaced one before the open ones, and the standing item last.
  lab = (
    await send('POST', '/api/checklists', {
      title: 'Lab checklist',
      items: [{ words: 'Fire the test tiles' }, { words: 'Old glaze notes' }, { words: 'Load the kiln' }, { words: 'Clean the shelves' }, { words: MANUAL, standing: true }],
    })
  )['checklist'].id as string
  await send('POST', `/api/checklists/${lab}/items`, { words: 'Choose the glaze', state: 'waiting on the owner' }, AS('quill'))
  const items = (await send('GET', `/api/checklists/${lab}`, undefined))['checklist'].items as { id: string; words: string }[]
  const idOf = (words: string): string => items.find((one) => one.words === words)!.id
  for (const words of ['Fire the test tiles', 'Clean the shelves']) await send('PATCH', `/api/checklists/${lab}/items/${idOf(words)}`, { state: 'done' })
  const later = (
    await send('POST', '/api/records', { kind: 'message', title: 'The glaze notes are in the manual now', data: { body: 'The glaze notes are in the manual now.', to: [{ kind: 'agent', id: quill }] } })
  )['record'].id as string
  await send('PATCH', `/api/checklists/${lab}/items/${idOf('Old glaze notes')}`, { state: 'superseded', supersededBy: later })

  shelf = (await send('POST', '/api/checklists', { title: 'Shelf checklist', items: [{ words: 'Sweep the shelf' }, { words: 'Label the jars' }] }))['checklist'].id as string
  await send('PATCH', `/api/checklists/${shelf}/items/i-1`, { state: 'done' })
  fresh = (await send('POST', '/api/checklists', { title: 'Fresh checklist', items: [{ words: 'Order more clay' }] }))['checklist'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** The words of each item directly in a list, without the state said for a screen reader. */
async function wordsIn(list: Locator): Promise<string[]> {
  return list.locator(':scope > .ckp-item .ckp-words').evaluateAll((els) =>
    els.map((el) => [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? '').join('').trim()),
  )
}

async function openThePage(page: Page, id: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/checklists/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.ck1 .ck1-counts').waitFor({ timeout: 30_000 })
}

describe('a checklist shows what is not finished first, and folds what is finished at the bottom', () => {
  it('1. the page draws what is not finished first, the standing item with it, and folds what is finished', async () => {
    const page = app.page
    await openThePage(page, lab)
    const one = page.locator('.ck1')
    const lists = one.locator('.ck1-items')
    expect(await wordsIn(lists.first())).toEqual(NOT_FINISHED)
    for (const words of FINISHED) expect(await one.locator('.ckp-item', { hasText: words }).count(), `${words} is folded`).toBe(0)
    const fold = one.locator('.ckp-fold')
    expect(await fold.count(), 'one fold press').toBe(1)
    expect(await fold.getAttribute('aria-expanded')).toBe('false')
    expect(await fold.innerText()).toContain('Show 3 done or replaced')

    await fold.click()
    await expect.poll(() => fold.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('true')
    expect(await fold.innerText()).toContain('Hide the done items')
    expect(await lists.count()).toBe(2)
    expect(await wordsIn(lists.nth(1)), 'done first, then replaced, each in the order added').toEqual(FINISHED)
    const below = await lists.nth(1).evaluate((list) => {
      const press = list.parentElement?.querySelector('.ckp-fold')
      return press !== null && press !== undefined && (press.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    })
    expect(below, 'the finished items are drawn below the press').toBe(true)
    await fold.click()
    await expect.poll(() => one.locator('.ckp-item', { hasText: 'Fire the test tiles' }).count(), { timeout: 10_000 }).toBe(0)

    // ANOTHER CHECKLIST OPENED FROM THE TABLE BESIDE IT STARTS FOLDED, though the fold was left open on this one.
    await fold.click()
    await expect.poll(() => fold.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('true')
    await page.locator('.ckb-row', { hasText: 'Shelf checklist' }).click()
    await page.locator('.ck1 h2', { hasText: 'Shelf checklist' }).waitFor({ timeout: 20_000 })
    const shelfFold = page.locator('.ck1 .ckp-fold')
    expect(await shelfFold.getAttribute('aria-expanded')).toBe('false')
    expect(await shelfFold.innerText()).toContain('Show 1 done')
    expect(await shelfFold.innerText()).not.toContain('replaced')
    expect(await wordsIn(page.locator('.ck1 .ck1-items').first())).toEqual(['Label the jars'])

    await openThePage(page, fresh)
    expect(await page.locator('.ck1 .ckp-fold').count(), 'nothing finished, no fold press').toBe(0)
    expect(await wordsIn(page.locator('.ck1 .ck1-items').first())).toEqual(['Order more clay'])
  }, 180_000)

  it('2. the window draws the same items in the same order, the finished ones folded under the same press', async () => {
    const page = app.page
    await page.goto('about:blank')
    await page.goto(`${app.site}/?lang=en#/decisions`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.ckw-press', { timeout: 30_000 })
    await page.click('.ckw-press')
    const group = page.locator('.ckw-panel .ckw-group', { hasText: 'Lab checklist' })
    await group.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
    expect(await wordsIn(group.locator('.ckw-items').first())).toEqual(NOT_FINISHED)
    for (const words of FINISHED) expect(await group.locator('.ckp-item', { hasText: words }).count(), `${words} is folded`).toBe(0)
    const fold = group.locator('.ckp-fold')
    expect(await fold.getAttribute('aria-expanded')).toBe('false')
    expect(await fold.innerText()).toContain('Show 3 done or replaced')
    await page.keyboard.press('Escape')
  }, 120_000)
})
