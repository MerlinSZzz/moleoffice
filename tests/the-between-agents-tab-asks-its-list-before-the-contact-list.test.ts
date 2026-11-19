// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON THE BETWEEN AGENTS TAB, THE BETWEEN AGENTS LIST IS ASKED BEFORE THE CONTACT LIST.
 *
 * The chat opens on the Contacts tab, and its opening read asks for the contact list at once. A person
 * who pressed Between agents straight away found that list waiting at the server behind the contact
 * list's read: the server answers one read at a time, in the order the reads reach it, and the contact
 * list had been asked first. Measured on a made-up office with the built page, the Between agents
 * list's first row came about half a second sooner when the contact list's read was held back. On that
 * tab the page uses the contact list only for the Contacts tab's number and for who is reading.
 *
 * WHAT THIS FILE PROVES, in a real browser against an office of its own. A route holds the page's
 * contact-list and Between agents reads and sends them on one at a time, in the order the page asked
 * for them, each after the one before has answered or been taken back. That is how the server's one
 * thread takes them, and it makes every check here a check of order, not of time.
 *   1. The opening contact-list read is asked before the Between agents list (the case above). The page
 *      has no contact-list answer before the Between agents list's first page has answered. After that
 *      page it asks for the contact list again, and until that read answers the Contacts tab draws no
 *      number; then it draws the server's own count. The read the page took back is drawn as no fault.
 *   2. A person who goes back to Contacts while the Between agents list's first page is still out does
 *      not wait for it: the contact list answers and its rows are drawn while that page is held.
 *
 * RED ON THE CUT: the page keeps its opening read, the route sends it on first, and its answer comes
 * before the Between agents list's (1 goes red). MUTATION, red: in Chat.tsx `readBetweenWhenReady`, do
 * not take back the unanswered contact-list reads when the first page is asked (1 goes red).
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Request, Route } from 'playwright'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp

const CONTACT_LIST = '/api/messages/contact-list'
const BETWEEN_AGENTS = '/api/messages/between-agents'
type Which = 'contacts' | 'between'

/** What happened to the two reads in this case, in the order it happened. */
const happened: string[] = []
/** The reads the route holds, in the order the page asked for them. */
const held: { which: Which; route: Route; request: Request }[] = []
/** Only the first Between agents read of a case is held; the pages after it go straight on. */
let betweenHeld = 0
/** Contact-list reads go straight on once this is set. */
let contactsGoOn = false
/** Off for the end of a case, so a read asked after its checks goes straight on. */
let holding = true

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function file(headers: Record<string, string>, body: unknown, expected = 201): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
}

function whichRead(url: string): Which | null {
  const path = new URL(url).pathname
  return path === CONTACT_LIST ? 'contacts' : path === BETWEEN_AGENTS ? 'between' : null
}

/** A new case starts from a page with nothing held and nothing kept. */
async function openTheChat(): Promise<void> {
  happened.length = 0
  held.length = 0
  betweenHeld = 0
  contactsGoOn = false
  holding = true
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en#/chat`)
}

/** Send on, one at a time and in the order asked, the held reads of one kind or of both. */
async function sendOn(which: Which | 'both'): Promise<void> {
  for (const one of held.filter((each) => which === 'both' || each.which === which)) {
    held.splice(held.indexOf(one), 1)
    // A read the page has taken back cannot be sent on: Playwright drops the continue, and the read
    // ends as failed, which `response()` gives as null.
    await one.route.continue()
    await one.request.response()
  }
}

async function heldNow(which: Which): Promise<void> {
  await expect.poll(() => held.filter((one) => one.which === which).length, { timeout: 60_000 }).toBeGreaterThan(0)
}

async function theContactTabsNumber(): Promise<{ drawn: string | null; label: string | null }> {
  const tab = app.page.locator('.px-chat-tab[data-tab="contacts"]')
  const number = tab.locator('.px-chat-unread')
  return { drawn: (await number.count()) === 0 ? null : await number.textContent(), label: await tab.getAttribute('aria-label') }
}

async function theServersCount(): Promise<number> {
  const got = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  return ((await got.json()) as { unread: { messages: number } }).unread.messages
}

async function theContactRowsAreDrawn(): Promise<void> {
  await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-contact').length > 0, undefined, { timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-first', viewport: { width: 1440, height: 1000 } })
  for (const handle of ['writer-between', 'reader-between']) {
    await file(AS_THE_OWNER, { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  // NOTHING HOLDS THE READER IN THE TEST OFFICE, so the office stores the message to it, routes it and answers 409.
  // The message is stored all the same, and the Between agents list draws it. The one to the person keeps its 201.
  await file(asAgent('writer-between'), {
    kind: 'message',
    title: 'agent to agent',
    data: { body: 'I have the camera mount.', to: [{ kind: 'agent', id: 'reader-between' }] },
  }, 409)
  await file(asAgent('writer-between'), {
    kind: 'message',
    title: 'to the person',
    data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] },
  })
  app.page.on('response', (response) => {
    const which = whichRead(response.url())
    if (which !== null && response.request().method() === 'GET') happened.push(`${which} answered`)
  })
  app.page.on('requestfailed', (request) => {
    const which = whichRead(request.url())
    if (which !== null && request.method() === 'GET') happened.push(`${which} taken back`)
  })
  await app.page.route((url) => url.pathname === CONTACT_LIST || url.pathname === BETWEEN_AGENTS, async (route, request) => {
    const which = whichRead(request.url())
    if (which === null || request.method() !== 'GET') {
      await route.continue()
      return
    }
    happened.push(`${which} asked`)
    if (!holding || (which === 'between' && betweenHeld > 0) || (which === 'contacts' && contactsGoOn)) {
      await route.continue()
      return
    }
    if (which === 'between') betweenHeld += 1
    held.push({ which, route, request })
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('asks the Between agents list first on its tab, and the contact list after its first page', async () => {
  await openTheChat()
  await heldNow('contacts')
  await app.page.click('.px-chat-tab[data-tab="between"]', { timeout: 30_000 })
  await heldNow('between')
  // THE CONTROL: the contact list was asked first, as on every opening.
  expect(happened.indexOf('contacts asked'), happened.join('\n')).toBeLessThan(happened.indexOf('between asked'))

  await sendOn('both')
  const betweenAnswered = happened.indexOf('between answered')
  expect(betweenAnswered, happened.join('\n')).toBeGreaterThan(-1)
  expect(happened.slice(0, betweenAnswered), happened.join('\n')).not.toContain('contacts answered')

  // AND THE CONTACT LIST IS ASKED AFTER THAT PAGE. Until it answers, the Contacts tab draws no number.
  await heldNow('contacts')
  await app.page.waitForFunction(
    () => [...document.querySelectorAll('.px-chat-last')].some((one) => one.textContent === 'I have the camera mount.'),
    undefined,
    { timeout: 30_000 },
  )
  expect(await theContactTabsNumber()).toEqual({ drawn: null, label: null })
  holding = false
  await sendOn('contacts')
  const count = await theServersCount()
  expect(count).toBeGreaterThan(0)
  await expect.poll(async () => (await theContactTabsNumber()).drawn, { timeout: 30_000 }).toBe(String(count))

  // THE READ THE PAGE TOOK BACK IS NO FAULT: back on Contacts, the rows are drawn and no notice is.
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await theContactRowsAreDrawn()
  expect(await app.page.locator('.px-chat-notice').allTextContents(), happened.join('\n')).toEqual([])
}, 180_000)

it('does not keep the contact list waiting when the person goes back to Contacts', async () => {
  await openTheChat()
  await heldNow('contacts')
  await app.page.click('.px-chat-tab[data-tab="between"]', { timeout: 30_000 })
  await heldNow('between')
  contactsGoOn = true
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await sendOn('contacts')
  // THE CONTACT LIST ANSWERS AND IS DRAWN WHILE THE BETWEEN AGENTS PAGE IS STILL HELD.
  await theContactRowsAreDrawn()
  expect(happened, happened.join('\n')).toContain('contacts answered')
  expect(happened, happened.join('\n')).not.toContain('between answered')
  expect(held.map((one) => one.which)).toEqual(['between'])
  holding = false
  await sendOn('both')
}, 180_000)
