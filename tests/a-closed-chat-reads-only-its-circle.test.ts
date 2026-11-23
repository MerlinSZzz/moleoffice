// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED CHAT PANEL READS ONLY WHAT IT DRAWS, AND HOME READS THE ATTENTION SHAPE IT DRAWS.
 *
 * Since 26 September 2026 a page asks only for what it draws, option 2 of a
 * decision. The chat panel is mounted on every page. Until this change it
 * read six lists the moment it mounted, closed or open: the registries, everybody's presence, the
 * contact list, the conversations between agents, the groups and the projects, and again on every
 * event that named one of them. Closed, it draws the circle button and nothing else.
 *
 * WHAT THIS FILE PROVES, in a real browser against an office of its own, counted at the wire:
 *   1. Closed, the panel asks GET /api/messages/circle, and asks neither the conversations between
 *      agents nor everybody's presence. The circle draws the contact list's own number.
 *   2. Closed, a new message to the person raises the number from what the event carries, and reads nothing:
 *      not the circle door, not the conversations between agents, not the presence. (Until events
 *      carried the change, merged on 26 September 2026, the number was read
 *      through the circle door.)
 *   3. Opening the panel reads what it draws: the presence and the contact list, and the rows
 *      appear. The short list of conversations between agents is read when its tab is opened, and its
 *      row appears (round 19 of wave 13w: it was 1.29 MB on an office of the owner's size, read for a
 *      tab nobody had opened).
 *   4. Home asks GET /api/attention?machine=omit&shape=home for Late or stuck.
 * No other panel on the home page asks the circle door, the conversations between agents or
 * `GET /api/presence` while nobody presses anything, so each count is the chat panel's own.
 *
 * RED ON MAIN: main's closed panel asks the between-agents list and the presence at mount, has no
 * circle door, and Home has not yet read the attention shape for its alarm section. CONTROL: green.
 * MUTATIONS,
 * each red: in Chat.tsx `readEverything`, remove the `if (!openNow.current)` branch (1 goes red); in
 * src/web/lib/chatdeltas.ts `theCircleAlone`, leave the circle as it was instead of adding what the
 * event counted (2 goes red); in the opening effect, remove
 * `void readEverything()` (3 goes red); in Sidebar.tsx `ChatEntry`, draw one more than it counted
 * (3 goes red); in HomeSections.tsx `WorkspaceReader`, ask for
 * `shape: 'flow'` rather than `shape: 'home'` (4 goes red).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
/** Every request the page made, by path and query, in the order it made them. */
const asked: string[] = []
const recordReads: { id: string; workspaceId: string | undefined }[] = []
const projectReads: { path: string; workspaceId: string | undefined }[] = []
let secondProjectMessageId = ''

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

async function file(headers: Record<string, string>, body: unknown, expected = 201): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
  return ((await made.json()) as { record: { id: string } }).record.id
}

async function sayToThem(words: string): Promise<void> {
  await file(asAgent('writer-closed'), { kind: 'message', title: words.slice(0, 40), data: { body: words, to: [{ kind: 'person', id: THE_PERSON }] } })
}

/** How many requests so far went to this path, whatever their query. */
function howMany(path: string): number {
  return asked.filter((one) => one.split('?')[0] === path).length
}

async function theNumberOnTheCircle(): Promise<number> {
  return Number((await app.page.textContent('.px-chat-circle .px-chat-unread').catch(() => null)) ?? '0')
}

/** The number the sidebar's Chat row draws while the chat is open beside the page. */
async function theNumberOnTheChatRow(): Promise<number> {
  return Number((await app.page.textContent('.shell-side .shell-chat .shell-chat-count').catch(() => null)) ?? '0')
}

async function theContactListsNumber(): Promise<number> {
  const got = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  const held = (await got.json()) as { unread: { messages: number; groups: number } }
  return held.unread.messages + held.unread.groups
}

beforeAll(async () => {
  app = await liveApp({ name: 'closed-chat', viewport: { width: 1440, height: 1000 } })
  // This sidebar-count case exercises the explicit unread-only button choice. The person last had the chat beside the
  // page, so the circle opens it there and the sidebar's Chat row carries the number while it is open.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread', chatOpensAs: 'split' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  const addedProject = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ id: 'home-second', title: 'Second project' }),
  })
  expect(addedProject.status, await addedProject.clone().text()).toBe(201)
  for (const handle of ['writer-closed', 'reader-closed']) {
    await file(AS_THE_OWNER, { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  await sayToThem('The clamp holds at 11.8 N.')
  secondProjectMessageId = await file(
    { ...asAgent('writer-closed'), 'x-mole-office-workspace': 'home-second' },
    { kind: 'message', title: 'A second project message', data: { body: 'Check the greenhouse sensor bracket.', to: [{ kind: 'person', id: THE_PERSON }] } },
  )
  // A CONVERSATION BETWEEN THE TWO AGENTS, so the Between agents tab has a row to draw when opened.
  // NOTHING HOLDS READER-CLOSED IN THIS TEST OFFICE, so the office stores the message, routes it and
  // answers 409 rather than 201; the message is stored all the same, and the tab draws it.
  await file(asAgent('writer-closed'), {
    kind: 'message',
    title: 'agent to agent',
    data: { body: 'I have the camera mount.', to: [{ kind: 'agent', id: 'reader-closed' }] },
  }, 409)
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) asked.push(`${url.pathname}${url.search}`)
    if (url.pathname.startsWith('/api/records/')) {
      recordReads.push({ id: decodeURIComponent(url.pathname.slice('/api/records/'.length)), workspaceId: request.headers()['x-mole-office-workspace'] })
    }
    if (url.pathname === '/api/attention' || url.pathname === '/api/working') {
      projectReads.push({ path: url.pathname, workspaceId: request.headers()['x-mole-office-workspace'] })
    }
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('a closed chat panel reads only what it draws', () => {
  it('asks the circle door, and neither the agents\' conversations nor everybody\'s presence', async () => {
    // A RELOAD, so the page's first reads are made after the listener above was attached.
    await app.page.goto(`${app.site}/#/`)
    await app.page.reload()
    await waitForThePage(app.page, 60_000)
    // THE CONTROL: the panel really is closed, and it drew the number, so it has read.
    expect(await app.page.$('.px-chat')).toBeNull()
    await app.page.waitForFunction(
      () => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') > 0,
      undefined,
      { timeout: 30_000 },
    )
    expect(howMany('/api/messages/circle'), asked.join('\n')).toBeGreaterThan(0)
    expect(await theNumberOnTheCircle()).toBe(await theContactListsNumber())
    expect(howMany('/api/messages/between-agents'), asked.join('\n')).toBe(0)
    expect(howMany('/api/presence'), asked.join('\n')).toBe(0)
  }, 120_000)

  it('raises the number when a message arrives, from what the event carries, and reads nothing', async () => {
    const before = await theNumberOnTheCircle()
    const circleReads = howMany('/api/messages/circle')
    await sayToThem('One more thing to read.')
    await app.page.waitForFunction(
      (was: number) => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') === was + 1,
      before,
      { timeout: 30_000 },
    )
    expect(howMany('/api/messages/circle'), asked.join('\n')).toBe(circleReads)
    expect(howMany('/api/messages/between-agents'), asked.join('\n')).toBe(0)
    expect(howMany('/api/presence'), asked.join('\n')).toBe(0)
  }, 120_000)

  it('reads the lists when it is opened, and draws them', async () => {
    // THE CONTACT LIST IS READ A PAGE AT A TIME since round 20 of wave 13u.
    const contactReads = howMany('/api/messages/contact-list')
    await app.page.click('.px-chat-circle')
    await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
    await app.page.waitForFunction(() => document.querySelectorAll('.px-chat-contact').length > 0, undefined, { timeout: 30_000 })
    expect(howMany('/api/presence')).toBeGreaterThan(0)
    expect(howMany('/api/messages/contact-list')).toBeGreaterThan(contactReads)
    expect(howMany('/api/messages/between-agents'), asked.join('\n')).toBe(0)
    // AND THE BETWEEN AGENTS TAB READS THE SHORT LIST WHEN IT IS OPENED, AND DRAWS ITS ROW.
    await app.page.click('.px-chat-tab[data-tab="between"]')
    await expect.poll(() => asked.filter((one) => one === '/api/messages/between-agents?shape=page&limit=25').length, { timeout: 20_000 }).toBeGreaterThan(0)
    await app.page.waitForFunction(
      () => [...document.querySelectorAll('.px-chat-last')].some((one) => one.textContent === 'I have the camera mount.'),
      undefined,
      { timeout: 20_000 },
    )
    // AND THE NUMBER IS STILL THE CONTACT LIST'S. The chat is open, so the corner circle is not
    // drawn; the sidebar's Chat row carries the same number while the chat sits beside the page.
    expect(await theNumberOnTheChatRow()).toBe(await theContactListsNumber())
    // CLOSED AGAIN, FOR THE CASE BELOW, which is about the home page and not the panel. The press
    // that is drawn beside an open chat is the seam's away press.
    await app.page.click('.px-chat-seam-away')
  }, 120_000)
})

describe('Home draws Late or stuck from each project attention answer', () => {
  // ROUND 23 OF WAVE 13w: the project on screen in the frame's read, and the other project in the one
  // read of every other project, which is asked under the project on screen and never under its own.
  it('reads the home shape for this project and the other project in one read of the rest', async () => {
    const homeReads = asked.filter((one) => one.startsWith('/api/attention?') && one.includes('shape=home'))
    expect(homeReads.length, asked.join('\n')).toBeGreaterThanOrEqual(1)
    expect(homeReads, asked.join('\n')).toContain('/api/attention?machine=omit&shape=home')
    expect(asked, asked.join('\n')).toContain('/api/attention?machine=omit&shape=other-projects')
    expect(projectReads.some((read) => read.path === '/api/attention' && read.workspaceId === 'home-second')).toBe(false)
    expect(projectReads.some((read) => read.path === '/api/working' && read.workspaceId === 'home-second')).toBe(true)
  }, 180_000)
})

describe('Home reads a waiting row in the project it names', () => {
  it('uses that project on one detail read', async () => {
    await app.page.evaluate(() => localStorage.setItem('mole-office.detail.home', 'full'))
    const firstRead = recordReads.length
    const detailResponse = app.page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === `/api/records/${secondProjectMessageId}`
    })
    await app.page.reload()
    await waitForThePage(app.page, 60_000)
    await app.page.locator(`[data-home-waiting-id="${secondProjectMessageId}"]`).waitFor({ timeout: 30_000 })
    const response = await detailResponse
    expect(response.status()).toBe(200)
    const reads = recordReads.slice(firstRead).filter((row) => row.id === secondProjectMessageId)
    expect(reads).toHaveLength(1)
    expect(reads[0]?.workspaceId).toBe('home-second')
  }, 120_000)
})
