// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT MARKS EVERY MESSAGE THE LIST SHOWS READ, ON THE MESSAGES PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The mark-all-read button was on the notes list, and it left the product when messages left that
 * list (criterion E1). The button comes back on the page the messages moved to. This file
 * holds the page to it.
 *
 * WHAT EACH CASE MEASURES ON A REAL PAGE:
 *
 *   1. three unread messages in the list, the press says "Mark all 3 unread messages read", one
 *      press marks every one of them seen through the one mark door, the count falls to nothing and
 *      the press is replaced by the line saying so;
 *   2. a message that arrives AFTER the press is not swept up by it — its delivery is still
 *      waiting for the person on the next read, and the page, read again, counts one;
 *   3. with a filter on, the press marks every unread message the filter keeps, on every page (60
 *      from one sender, two pages), and nothing the filter leaves out;
 *   4. with three pages and more of unread messages, one press on the first page marks every one,
 *      on every page. Round 6 made it mark only the page on screen. A decision says the press marks every message, and
 *      round 7 put it back.
 *
 * MUTATIONS, each red here:
 *   1. src/web/pages/MessagesPage.tsx: mark only the page on screen (`const which = kept.map((one) =>
 *      one.id)` in place of the ids from `unreadMessageIdsForMe`). Cases 3 and 4 are red.
 *   2. src/web/api.ts: leave the page's narrowings out of `unreadMessageIdsForMe`. Case 3 is red:
 *      the other sender's message is marked too.
 *   3. src/web/api.ts: read only the first thousand-message page (return after one read). Nothing
 *      here holds a thousand, so this one is proved by reading the loop, not by a red case.
 *
 * THE COUNT IS READ IN DEVELOPER MODE. Answer 7 to report n9Mjk3c_sJRu puts message
 * counts in developer mode only, so the press names its count there (?mode=inspect) and says "Mark all
 * read" in normal mode. It marks the same messages in both. The press is the page's one press, at the
 * right of its title (class px-ms-mark-all), no longer in a panel's header.
 *
 * The marks going through the one door is what makes "all read" the same fact the chat and the
 * circle read: every mark lands as POST /api/messages/:id/mark with seen, the route everything
 * else uses. No second write door is involved, so a press here cannot disagree with one anywhere
 * else.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DELIVERY } from '../src/shared/messages.ts'
import { t } from '../src/shared/i18n.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

const FROM_THE_BUILDER = 'The wrist camera fit is holding at 0.4 px.'
const FROM_THE_CHECKER = 'The calibration table is short a row at effort 18.'
const FROM_THE_GAUGE = 'The bore gauge reads a tenth high on the left jaw.'

/** One message, written the way anything writes one: through the records door. */
async function say(from: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<string> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: from,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 40), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
  return ((await said.json()) as { record: { id: string } }).record.id
}

/** The pool as the person reads it, with the mark each message's delivery to them holds. */
async function marksForThePerson(): Promise<Map<string, string>> {
  const read = await fetch(`${app.api}/api/messages?full=1`, { headers: AS_THE_OWNER })
  expect(read.status).toBe(200)
  const pool = (await read.json()) as { messages: { id: string; deliveries: { to: { kind: string; id: string }; mark: string }[] }[] }
  const marks = new Map<string, string>()
  for (const one of pool.messages) {
    const mine = one.deliveries.find((d) => d.to.kind === 'person' && d.to.id === THE_PERSON)
    if (mine !== undefined) marks.set(one.id, mine.mark)
  }
  return marks
}

/**
 * Go to the Messages page in developer mode, where the press names its count, and wait for its list.
 *
 * It goes to the home page first and waits until that page is drawn. The frame holds a move to another
 * page until it has read whether a review is collecting, so a move straight back would find the
 * Messages page never left, with the marks it read last time.
 */
async function openThePage(): Promise<void> {
  await app.page.goto(`${app.site}/?mode=inspect#/`)
  await waitForThePage(app.page)
  await app.page.goto(`${app.site}/?mode=inspect#/messages`)
  await app.page.waitForSelector('.px-ms-list', { timeout: 20_000 })
}

/** The page's one press, at the right of its title, once the page has drawn it. */
async function thePress(): Promise<ReturnType<LiveApp['page']['$']>> {
  return await app.page.$('.px-ms-mark-all .px-btn')
}

beforeAll(async () => {
  app = await liveApp({ name: 'mark-all-read', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Builder X',
      data: { handle: 'builder-x', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  const second = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Gauge Z', data: { handle: 'gauge-z', runtime: 'claude-code', state: 'active' } }),
  })
  expect(second.status, await second.text()).toBe(201)

  await say(asAgent('builder-x'), `${FROM_THE_BUILDER} one`, { kind: 'person', id: THE_PERSON })
  await say(asAgent('builder-x'), `${FROM_THE_BUILDER} two`, { kind: 'person', id: THE_PERSON })
  await say(asAgent('builder-x'), `${FROM_THE_CHECKER} three`, { kind: 'person', id: THE_PERSON })
}, 180_000)

afterAll(async () => {
  await app.stop()
})

it('says how many are unread, and one press marks every one of them read', async () => {
  await openThePage()

  // THE PRESS NAMES THE COUNT. The count is the list's own: it counts what the page is showing.
  const press = await app.page.waitForSelector('.px-ms-mark-all .px-btn', { timeout: 20_000 })
  expect(await press.textContent(), 'the press does not say how many are unread').toBe(
    t('messages.unread.markAll', { n: 3, count: '3' }),
  )

  // THE THIRD ROW IS STILL WAITING BEFORE THE PRESS, so what the marks land as is measured twice.
  const before = await marksForThePerson()
  for (const one of before.values()) expect(one, 'a fresh delivery is not waiting').not.toBe('seen')

  // ONE PRESS. Every one of them goes through the one mark door, once per message.
  await press.click()

  // THE COUNT FALLS TO NOTHING AND THE PRESS STANDS DOWN, replaced by the line that says it.
  const line = await app.page.waitForSelector('.px-ms-nothing-unread', { timeout: 20_000 })
  expect(await line.textContent(), 'the line does not say nothing is unread').toBe(t('messages.unread.none'))
  expect(await thePress(), 'the press is still drawn when nothing is unread').toBeNull()

  // AND THE MARKS LANDED: every delivery to the person holds seen, read back from the office's
  // own store rather than from what the page claims.
  const after = await marksForThePerson()
  expect(after.size).toBe(3)
  for (const [id, mark] of after) {
    expect(mark, `the message ${id} was not marked read by the press`).toBe('seen')
  }

  // AND THE ROWS SAY IT, in the word the panel and this page share for the mark.
  const read = DELIVERY.seen.word
  await app.page.waitForFunction(
    (word: string) => {
      const rows = Array.from(document.querySelectorAll('.px-ms-one'))
      return rows.length === 3 && rows.every((one) => one.textContent?.includes(word) === true)
    },
    read,
    { timeout: 20_000 },
  )
}, 120_000)

it('does not sweep up a message that arrives after the press', async () => {
  // A FOURTH MESSAGE, after the press above. The press took its list of unread messages from what
  // was on the screen at the moment it was pressed, so this one is not in it and is not marked.
  const fourth = await say(asAgent('builder-x'), `${FROM_THE_CHECKER} four`, { kind: 'person', id: THE_PERSON })
  const marks = await marksForThePerson()
  expect(marks.get(fourth), 'the fourth message was marked read by a press made before it existed').not.toBe('seen')

  // AND THE PAGE, READ AGAIN, counts it: one unread, and the press is back for it.
  await openThePage()
  const press = await app.page.waitForSelector('.px-ms-mark-all .px-btn', { timeout: 20_000 })
  expect(await press.textContent(), 'the press does not count the message that arrived after the last press').toBe(
    t('messages.unread.markAll', { n: 1, count: '1' }),
  )
}, 120_000)

/** How many of the person's deliveries are not yet seen, read back from the office's own store. */
async function unreadForThePerson(): Promise<string[]> {
  return [...(await marksForThePerson())].filter(([, mark]) => mark !== 'seen').map(([id]) => id)
}

it('with a filter on, marks every unread message the filter keeps, on every page, and nothing else', async () => {
  // SIXTY FROM ONE SENDER, two pages of fifty under the filter, and the one message from the other
  // sender that case 2 left unread.
  const fromGauge: string[] = []
  for (let i = 1; i <= 60; i += 1) fromGauge.push(await say(asAgent('gauge-z'), `${FROM_THE_GAUGE} ${String(i)}`, { kind: 'person', id: THE_PERSON }))
  const otherSender = await unreadForThePerson()
  expect(otherSender.filter((id) => !fromGauge.includes(id)).length, 'the other sender has no unread message to leave alone').toBe(1)

  await openThePage()
  await app.page.click('.px-ms-narrow-open')
  await app.page.locator('.px-ms-filters select').nth(0).selectOption({ label: 'Gauge Z' })
  const press = app.page.locator('.px-ms-mark-all .px-btn')
  await expect.poll(async () => await press.textContent(), { timeout: 20_000 }).toBe(t('messages.unread.markAll', { n: 60, count: '60' }))
  await press.click()
  await app.page.waitForSelector('.px-ms-nothing-unread', { timeout: 60_000 })

  const still = await unreadForThePerson()
  expect(still.filter((id) => fromGauge.includes(id)), 'a message the filter kept was not marked read').toEqual([])
  expect(still, 'a message the filter left out was marked read').toEqual(otherSender.filter((id) => !fromGauge.includes(id)))
}, 300_000)

it('with three pages of unread messages, one press on the first page marks every one', async () => {
  for (let i = 1; i <= 110; i += 1) await say(asAgent('builder-x'), `${FROM_THE_BUILDER} page ${String(i)}`, { kind: 'person', id: THE_PERSON })
  const waiting = await unreadForThePerson()
  expect(waiting.length, 'fewer than three pages of unread messages').toBeGreaterThan(100)

  await openThePage()
  expect(await app.page.locator('.px-pager-line').first().textContent()).toContain('Showing 1 to 50 of')
  const press = app.page.locator('.px-ms-mark-all .px-btn')
  await expect.poll(async () => await press.textContent(), { timeout: 20_000 }).toBe(
    t('messages.unread.markAll', { n: waiting.length, count: waiting.length.toLocaleString('en-GB') }),
  )
  await press.click()
  await app.page.waitForSelector('.px-ms-nothing-unread', { timeout: 120_000 })
  expect(await unreadForThePerson(), 'a message on another page was not marked read').toEqual([])
}, 300_000)
