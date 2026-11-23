// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS PAGE, WINDOW, PRESS AND HOME ASK THE LIST OF CHECKLISTS FOR ONLY THE OPEN ITEMS. The list door answers
 * `?items=open` with each checklist's items not finished, and counts and names the finished ones. The page, Home and the
 * closed window's press ask that way, and draw a card from its counts. A fold press reads the checklist whole when it
 * is pressed. The open window asks for the reader's own checklists whole, because it draws their finished items and
 * keeps an item marked done in it in view until it closes.
 *
 * In a real browser, as the person, on this test's own office. Every checklist, item, agent and message here is made
 * up, and nothing asks the live office.
 *
 * What is proved:
 *   1. With the window closed, every read of the list on Home and on the checklists page asks with items=open. With it
 *      open, the reader's own read asks without the key and everybody's read asks with it. After it closes and a
 *      checklist changes, the reader's own read asks with items=open again.
 *   2. On the page, a card's done-of-total, its fold press and its rows not finished are what the made-up items give.
 *      Pressed, the fold draws the finished items, done first and then replaced, each in the order added. The same holds
 *      for another owner's card in the window. Each is compared with the checklist read whole from its own door.
 *   3. In the open window, the reader's own card's fold draws a finished item. An item the person marks done there stays
 *      in view after the next read.
 *   4. An item the agent adds and marks done between two reads rings the press. An item that was read done and is then
 *      opened again rings nothing. Opening and closing the window rings nothing.
 *
 * Case 2 holds at main too, where the page and the window read every item and draw the same words from them.
 * Case 3 holds at main too, where the open window reads the reader's own checklists whole as well.
 * Case 4 holds at main too, where every item the ring knows is in the items of the reader's own read.
 *
 * Test change (wave 13y round 175, the names behind Back): the window's names are folded behind a Back press at the
 * start of its head, as decided, and they are plain presses, not tabs. Case 2 presses Back, found by its words, before
 * it chooses the agent's name among the window's name presses. What the case checks is unchanged.
 */

import type { Locator, Page, Response } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { holdThePagesReadsOfAChecklist, liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = 'made-up-kiln-agent'
const AGENTS_NAME = 'Made-up Kiln Agent'
const AS_THE_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT }

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  const aLetterNothingHolds = method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds) expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBe(409)
  else expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

interface Item {
  id: string
  words: string
  state: string
  standing?: boolean
}

/** The checklist read whole from its own door, as the person. */
async function readWhole(id: string): Promise<{ title: string; items: Item[] }> {
  return (await send('GET', `/api/checklists/${id}`, undefined))['checklist'] as { title: string; items: Item[] }
}

const FINISHED = new Set(['done', 'superseded'])
const NOT_FINISHED_ORDER = ['waiting on the owner', 'in progress', 'open']

/** What a card draws before a press and in its fold, worked out from the checklist read whole. */
async function whatTheCardDraws(id: string): Promise<{ progress: string; press: string; open: string[]; finished: string[] }> {
  const { items } = await readWhole(id)
  const notFinished = items.filter((one) => !FINISHED.has(one.state))
  const open = NOT_FINISHED_ORDER.flatMap((state) => notFinished.filter((one) => one.state === state)).map((one) => one.words)
  expect(open.length, 'every item not finished has one of the three states').toBe(notFinished.length)
  const done = items.filter((one) => one.state === 'done')
  const replaced = items.filter((one) => one.state === 'superseded')
  const total = items.filter((one) => one.state !== 'superseded' && one.standing !== true).length
  const n = done.length + replaced.length
  return {
    progress: t('checklists.progressNumber', { done: done.length, total }),
    press: replaced.length > 0 ? t('checklists.window.showDoneAndReplaced', { n }) : t('checklists.window.showDone', { n }),
    open,
    finished: [...done, ...replaced].map((one) => one.words),
  }
}

let kiln = ''
let bench = ''
let spare = ''
let later = ''

beforeAll(async () => {
  app = await liveApp({ name: 'the-checklists-page-and-window-ask-only-for-the-open-items', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: AGENT, name: AGENTS_NAME, role: 'worker' })
  later = (
    await send('POST', '/api/records', {
      kind: 'message',
      title: 'The made-up glaze notes are in the made-up manual now',
      data: { body: 'The made-up glaze notes are in the made-up manual now.', to: [{ kind: 'agent', id: AGENT }] },
    })
  )['record'].id as string

  // THE PERSON'S OWN, in the order added: two items later done, one later replaced, an open one and a standing one.
  kiln = (
    await send('POST', '/api/checklists', {
      title: 'Kiln checklist (made up)',
      items: [
        { words: 'Fire the made-up test tiles' },
        { words: 'Old made-up glaze notes' },
        { words: 'Load the made-up kiln' },
        { words: 'Clean the made-up shelves' },
        { words: 'My made-up lab manual', standing: true },
      ],
    })
  )['checklist'].id as string
  await send('POST', `/api/checklists/${kiln}/items`, { words: 'Choose the made-up glaze', state: 'waiting on the owner' }, AS_THE_AGENT)
  await send('PATCH', `/api/checklists/${kiln}/items/i-1`, { state: 'done' })
  await send('PATCH', `/api/checklists/${kiln}/items/i-4`, { state: 'done' })
  await send('PATCH', `/api/checklists/${kiln}/items/i-2`, { state: 'superseded', supersededBy: later })

  // THE AGENT'S OWN, with one item left open.
  bench = (
    await send(
      'POST',
      '/api/checklists',
      {
        title: 'Bench checklist (made up)',
        items: [{ words: 'Sand the made-up bench' }, { words: 'Old made-up bench plan' }, { words: 'Oil the made-up bench' }, { words: 'Varnish the made-up bench' }],
      },
      AS_THE_AGENT,
    )
  )['checklist'].id as string
  await send('PATCH', `/api/checklists/${bench}/items/i-1`, { state: 'done', addEvidence: [{ kind: 'commit', commit: '5e6f7a8' }] }, AS_THE_AGENT)
  await send('PATCH', `/api/checklists/${bench}/items/i-4`, { state: 'done', addEvidence: [{ kind: 'commit', commit: '6f7a8b9' }] }, AS_THE_AGENT)
  await send('PATCH', `/api/checklists/${bench}/items/i-2`, { state: 'superseded', supersededBy: later }, AS_THE_AGENT)

  // THE PERSON'S SECOND, which the agent changes whenever a case needs a checklist to change.
  spare = (await send('POST', '/api/checklists', { title: 'Spare checklist (made up)', items: [{ words: 'Order more made-up clay' }] }))['checklist'].id as string
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

/** Every GET of the list of checklists the page sends, by its query, from now on. */
function theListReads(page: Page): { queries: URLSearchParams[]; ownAnswered: () => number; stop: () => void } {
  const queries: URLSearchParams[] = []
  let answered = 0
  const onRequest = (request: { url: () => string; method: () => string }): void => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/api/checklists') queries.push(url.searchParams)
  }
  const onResponse = (response: Response): void => {
    const url = new URL(response.url())
    if (response.request().method() === 'GET' && url.pathname === '/api/checklists' && !url.searchParams.has('owner') && response.ok()) answered += 1
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  return {
    queries,
    ownAnswered: () => answered,
    stop: () => {
      page.off('request', onRequest)
      page.off('response', onResponse)
    },
  }
}

async function goTo(page: Page, address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.ckw-press', { timeout: 30_000 })
}

/** The press's count once the reader's own read has answered. */
async function theCount(page: Page): Promise<number> {
  let count = Number.NaN
  await expect
    .poll(
      async () => {
        count = Number.parseInt((await page.locator('.ckw-count').textContent()) ?? '', 10)
        return Number.isNaN(count)
      },
      { timeout: 30_000 },
    )
    .toBe(false)
  return count
}

async function openTheWindow(page: Page): Promise<Locator> {
  await page.click('.ckw-press')
  const panel = page.locator('.ckw-panel')
  await panel.locator('.cks-card .ckp-item').first().waitFor({ timeout: 30_000 })
  return panel
}

async function closeTheWindow(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect.poll(() => page.locator('.ckw-press').getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('false')
}

/** A card's words before a press, then after its fold is pressed, against what its items give. */
async function theCardDrawsWhatItsItemsGive(card: Locator, id: string, where: string): Promise<void> {
  const expected = await whatTheCardDraws(id)
  const lists = card.locator('.cks-items')
  expect(await card.locator('.cks-progress').innerText(), `${where}: done of total`).toBe(expected.progress)
  expect(await wordsIn(lists.first()), `${where}: the rows not finished`).toEqual(expected.open)
  for (const words of expected.finished) expect(await card.locator('.ckp-item', { hasText: words }).count(), `${where}: ${words} is folded`).toBe(0)
  const fold = card.locator('.ckp-fold')
  expect(await fold.getAttribute('aria-expanded'), `${where}: folded`).toBe('false')
  expect(await fold.innerText(), `${where}: the fold press`).toContain(expected.press)
  await fold.click()
  await expect.poll(() => fold.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('true')
  expect(await fold.innerText(), `${where}: the fold press, pressed`).toContain(t('checklists.window.hideDone'))
  expect(await wordsIn(card.locator('.cks-items.ckp-folded')), `${where}: done first, then replaced, each in the order added`).toEqual(expected.finished)
}

/** Counts every ring the press is given, from now on, in the page. */
async function countTheRings(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const holder = window as unknown as { madeUpRings: number }
    holder.madeUpRings = 0
    new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes) if (node instanceof HTMLElement && node.dataset['checklistArrival'] !== undefined) holder.madeUpRings += 1
    }).observe(document.body, { childList: true, subtree: true })
  })
  return () => page.evaluate(() => (window as unknown as { madeUpRings: number }).madeUpRings)
}

describe('the checklists page, window, press and Home ask the list of checklists for only the open items', () => {
  it('1. every read of the list asks with items=open, except the open window\'s read of the reader\'s own', async () => {
    const page = app.page
    const reads = theListReads(page)
    try {
      await goTo(page, '/')
      await theCount(page)
      await page.waitForTimeout(1500)
      expect(reads.queries.length, 'Home reads the list').toBeGreaterThan(0)
      for (const query of reads.queries) expect(query.get('items'), `on Home: ?${query.toString()}`).toBe('open')

      reads.queries.length = 0
      await goTo(page, '/checklists')
      await page.locator(`.cks-card[data-list="${kiln}"] .ckp-item`).first().waitFor({ timeout: 30_000 })
      await page.waitForTimeout(1500)
      expect(reads.queries.some((query) => query.get('owner') === 'everyone'), 'the page reads everybody\'s').toBe(true)
      for (const query of reads.queries) expect(query.get('items'), `on the checklists page: ?${query.toString()}`).toBe('open')

      await goTo(page, '/decisions')
      await theCount(page)
      await page.waitForTimeout(1500)
      reads.queries.length = 0
      await openTheWindow(page)
      await expect.poll(() => reads.queries.some((query) => !query.has('owner')) && reads.queries.some((query) => query.get('owner') === 'everyone'), { timeout: 30_000 }).toBe(true)
      for (const query of reads.queries) {
        if (query.has('owner')) expect(query.get('items'), `everybody's, in the open window: ?${query.toString()}`).toBe('open')
        else expect(query.has('items'), `the reader's own, in the open window: ?${query.toString()}`).toBe(false)
      }

      await closeTheWindow(page)
      await page.waitForTimeout(1500)
      reads.queries.length = 0
      await send('POST', `/api/checklists/${spare}/items`, { words: 'Order more made-up glaze' }, AS_THE_AGENT)
      await expect.poll(() => reads.queries.some((query) => !query.has('owner')), { timeout: 30_000 }).toBe(true)
      for (const query of reads.queries) expect(query.get('items'), `after the window closed: ?${query.toString()}`).toBe('open')
    } finally {
      reads.stop()
    }
  }, 240_000)

  it('2. a card draws its counts, its fold and its rows as its items give them, on the page and in the window', async () => {
    const page = app.page
    await goTo(page, '/checklists')
    const own = page.locator(`.ckl-section[data-reader="yes"] .cks-card[data-list="${kiln}"]`)
    await own.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
    await theCardDrawsWhatItsItemsGive(own, kiln, 'the page, the person\'s own')
    const section = page.locator('.ckl-section[data-reader="no"]', { has: page.locator('.ckl-name', { hasText: AGENTS_NAME }) })
    if ((await section.getAttribute('data-open')) !== 'yes') await section.locator('.ckl-press').click()
    const theAgents = section.locator(`.cks-card[data-list="${bench}"]`)
    await theAgents.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
    await theCardDrawsWhatItsItemsGive(theAgents, bench, 'the page, the agent\'s')

    await goTo(page, '/decisions')
    const panel = await openTheWindow(page)
    await panel.getByRole('button', { name: t('checklists.window.back'), exact: true }).click()
    await panel.locator('.ckw-names button', { hasText: AGENTS_NAME }).click()
    const inTheWindow = panel.locator(`.cks-card[data-list="${bench}"]`)
    await inTheWindow.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
    await theCardDrawsWhatItsItemsGive(inTheWindow, bench, 'the window, the agent\'s')
    await closeTheWindow(page)
  }, 240_000)

  it('3. the open window draws the reader\'s own finished items, and keeps an item marked done in it in view', async () => {
    const page = app.page
    await goTo(page, '/decisions')
    const panel = await openTheWindow(page)
    const card = panel.locator(`.cks-card[data-list="${kiln}"]`)
    await card.locator('.ckp-item').first().waitFor({ timeout: 30_000 })
    const expected = await whatTheCardDraws(kiln)
    expect(await card.locator('.ckp-fold').innerText()).toContain(expected.press)
    await card.locator('.ckp-fold').click()
    await expect.poll(() => card.locator('.ckp-fold').getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('true')
    expect(await wordsIn(card.locator('.cks-items.ckp-folded')), 'the finished items, in the open window').toEqual(expected.finished)

    const reads = theListReads(page)
    try {
      const words = 'Load the made-up kiln'
      const row = card.locator('.cks-items:not(.ckp-folded) > .ckp-item', { hasText: words })
      await row.getByRole('button', { name: t('w13j.checklistDone.box', { words }), exact: true }).click()
      await expect.poll(async () => (await readWhole(kiln)).items.find((one) => one.words === words)?.state, { timeout: 10_000 }).toBe('done')
      const answeredBefore = reads.ownAnswered()
      await send('POST', `/api/checklists/${spare}/items`, { words: 'Order more made-up brushes' }, AS_THE_AGENT)
      await expect.poll(() => reads.ownAnswered(), { timeout: 30_000 }).toBeGreaterThan(answeredBefore)
      await page.waitForTimeout(1000)
      expect(await wordsIn(card.locator('.cks-items:not(.ckp-folded)')), 'the item marked done in the open window, after the next read').toContain(words)
      expect(await card.locator('.ckp-item', { hasText: words }).count(), 'drawn once').toBe(1)
    } finally {
      reads.stop()
    }
    await closeTheWindow(page)
  }, 240_000)

  it('4. an item that arrives finished rings the press, and one opened again or the window opened and closed rings nothing', async () => {
    const page = app.page
    await goTo(page, '/decisions')
    const first = await theCount(page)
    await page.waitForTimeout(1500)
    const rings = await countTheRings(page)
    const reads = theListReads(page)
    try {
      // ADDED AND MARKED DONE BETWEEN TWO READS: the page's reads wait until both writes are in.
      const held = await holdThePagesReadsOfAChecklist(page, spare)
      const added = (await send('POST', `/api/checklists/${spare}/items`, { words: 'Wedge the made-up clay' }, AS_THE_AGENT))['item'].id as string
      await send('PATCH', `/api/checklists/${spare}/items/${added}`, { state: 'done', addEvidence: [{ kind: 'commit', commit: '2b3c4d5' }] }, AS_THE_AGENT)
      const answeredBefore = reads.ownAnswered()
      await held.release()
      await expect.poll(() => reads.ownAnswered(), { timeout: 30_000 }).toBeGreaterThan(answeredBefore)
      await expect.poll(rings, { timeout: 10_000 }).toBe(1)
      expect(await theCount(page), 'a finished item adds nothing to the count').toBe(first)

      await send('PATCH', `/api/checklists/${spare}/items/${added}`, { state: 'open', evidence: [] })
      await expect.poll(() => theCount(page), { timeout: 30_000 }).toBe(first + 1)
      await page.waitForTimeout(1700)
      expect(await rings(), 'an item read done and opened again').toBe(1)

      const beforeTheWindow = reads.ownAnswered()
      await openTheWindow(page)
      await expect.poll(() => reads.ownAnswered(), { timeout: 30_000 }).toBeGreaterThan(beforeTheWindow)
      await page.waitForTimeout(1700)
      await closeTheWindow(page)
      await page.waitForTimeout(1700)
      expect(await rings(), 'the window opened and closed').toBe(1)
    } finally {
      reads.stop()
    }
  }, 240_000)
})
