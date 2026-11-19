// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT STILL UPDATES WHEN AN EVENT NAMES IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The chat's channel handler used to read all six of its lists on five of the six event names. The
 * narrowing reads only the list an event can change. A narrowing that goes too far is SILENT: the
 * chat simply stops updating, and no other test in the suite would notice. So every list an event
 * still has to move is asserted here, updating LIVE — the event arrives from outside the browser,
 * the page is not reloaded, and the screen has to move on its own.
 *
 * Each case names the mutation that proves it in the source file's header of the mapping itself
 * (src/web/lib/chatlists.ts): revert one line of the mapping and this file goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChatBeside } from './open-the-chat.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHANNEL_IS_DOWN } from '../src/shared/events.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let app: Awaited<ReturnType<typeof import('./helpers.ts').liveApp>>

async function write(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
}

/** One message from `handle` to `to`, with whatever else it carries, answered `expected`. Returns the id. */
async function say(handle: string, to: { kind: string; id: string }, body: string, extra: Record<string, unknown> = {}, expected = 201): Promise<string> {
  const res = await write(asAgent(handle), { kind: 'message', title: body.slice(0, 40), data: { body, to: [to], ...extra } })
  const held = (await res.json()) as { record?: { id: string } }
  expect(res.status, JSON.stringify(held)).toBe(expected)
  return held.record?.id ?? ''
}

/** The number on the circle as the page draws it, or 0 when there is no badge. */
async function theCircle(): Promise<number> {
  const said = await app.page.textContent('.px-chat-circle .px-chat-unread').catch(() => null)
  return said === null ? 0 : Number(said)
}

/**
 * HOW LONG THE PAGE'S STREAM IS HELD BEFORE IT OPENS, on every load of the page.
 *
 * The page reads its lists and opens its stream without either waiting for the other, so either can
 * finish first. A message written before the stream is open is in the lists the page read or it is
 * not, and no event about it ever reaches the page: the server sends a stream opened for the first
 * time nothing from before. So a case that writes a message and waits for the page to move has to
 * wait until the page is listening. Under a loaded machine the stream opened after the case wrote its message, and the
 * circle never moved (the merge queue's runs gPrSSJ6tLHZ4 and tMn9hWAKkrz1).
 *
 * Holding the stream here makes that order happen on every run, not only on a loaded machine. So a
 * case that does not wait for the stream fails every time, and `openThePanel` below does wait.
 */
const THE_STREAM_IS_HELD_MS = 1500

/**
 * Open the panel, leave it on the contacts list, and wait until the page is listening.
 *
 * LISTENING IS WHEN THE CONNECTION NOTICE IS GONE. The panel draws `CHANNEL_IS_DOWN` from its first
 * drawing until the page's stream has opened, and takes it away at that moment. The server has added
 * the page to the ones it tells about events before the page learns the stream is open, so an event
 * written after the notice has gone reaches the page.
 */
async function openThePanel(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChatBeside(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  await app.page.waitForFunction(
    (down: string) =>
      document.querySelector('.px-chat-tabs') !== null &&
      ![...document.querySelectorAll('.px-chat-notice')].some((one) => one.textContent?.includes(down) === true),
    CHANNEL_IS_DOWN,
    { timeout: 30_000 },
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'still-updates', viewport: { width: 1440, height: 1000 } })
  // THE PAGE'S STREAM WAITS A MOMENT BEFORE IT IS SENT, on every load. `THE_STREAM_IS_HELD_MS` says why.
  await app.page.route(
    (url) => url.pathname === '/api/events',
    async (route) => {
      await new Promise((wake) => setTimeout(wake, THE_STREAM_IS_HELD_MS))
      await route.continue()
    },
  )
  for (const [handle, name] of [
    ['writer-updates', 'Writer Updates'],
    ['writer-two', 'Writer Two'],
    ['writer-three', 'Writer Three'],
  ] as const) {
    const filed = await write(AS_THE_OWNER, {
      kind: 'agent',
      title: handle,
      data: { handle, runtime: 'claude-code', state: 'active' },
    })
    expect(filed.status, await filed.text()).toBe(201)
    void name
  }
}, 180_000)

afterAll(async () => {
  await app.stop()
})

describe('a list an event names still updates, without the page reloading', () => {
  it('raises the number on the circle when a message arrives, and drops it when the mark goes seen through the door', async () => {
    // THE CONTACTS: what the circle counts. A new message raises it; a mark reaching `seen` through
    // the API — the way ANOTHER window of this person marks a conversation read — lowers it. Both
    // without the page being touched.
    await say('writer-updates', { kind: 'person', id: THE_PERSON }, 'The first unread thing.')
    await openThePanel()
    // THE PANEL IS OPEN ONLY TO WAIT FOR THE STREAM. The circle is drawn while the chat is shut, so
    // put it away with the drawn press before the number is read: design D carries the count on the
    // circle when it is shut and on the sidebar's Chat row while it is open.
    await app.page.click('.px-chat-seam-away')
    await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await app.page.waitForFunction(
      () => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') > 0,
      undefined,
      { timeout: 30_000 },
    )
    const before = await theCircle()

    // UP, WITHOUT A RELOAD. The event was addressed to this reader.
    const raisedId = await say('writer-updates', { kind: 'person', id: THE_PERSON }, 'One to be marked seen.')
    await app.page.waitForFunction(
      (before: number) => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') === before + 1,
      before,
      { timeout: 30_000 },
    )

    // AND DOWN AGAIN, WITHOUT A RELOAD. The mark on the SAME message reaches `seen` through the
    // door, the way another window of this person makes a conversation read. The circle returns to
    // where it started: the mark moved on the message that raised it.
    const marked = await fetch(`${app.api}/api/messages/${raisedId}/mark`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mark: 'seen' }),
    })
    const outcome = (await marked.json()) as { changed?: boolean }
    expect(outcome.changed, 'the trigger must have moved a mark, or what follows means nothing').toBe(true)
    const door = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
    const held = (await door.json()) as { unread?: { messages: number } }
    expect(held.unread?.messages, 'the server agrees the mark fell').toBe(before)
    await app.page.waitForFunction(
      (before: number) => Number(document.querySelector('.px-chat-circle .px-chat-unread')?.textContent ?? '0') === before,
      before,
      { timeout: 30_000 },
    )
  }, 240_000)

  it('opens the emergency dialogue the moment an urgent message arrives for this reader', async () => {
    // The pool of emergencies is read on a message addressed to the reader (the mapping's own rule
    // for it), so the dialogue appears without the page being touched.
    await say('writer-updates', { kind: 'person', id: THE_PERSON }, 'Stop and look at this.', { urgent: true })
    await app.page.waitForSelector('.px-forced', { timeout: 30_000 })
    const said = await app.page.$eval('.px-forced', (el) => el.textContent ?? '')
    expect(said).toContain('Stop and look at this.')
    // AND IT LEAVES when the reader presses it, so the case does not block the ones below.
    await app.page.click('.px-forced-dismiss')
    await app.page.waitForFunction(() => document.querySelector('.px-forced') === null, undefined, { timeout: 30_000 })
  }, 240_000)

  it('shows the offer to take the reader somewhere the moment it is offered', async () => {
    const about = await write(AS_THE_OWNER, { kind: 'note', title: 'A place to go', data: { date: '2026-09-11', body: 'the place' } })
    expect(about.status, await about.clone().text()).toBe(201)
    const recordId = ((await about.json()) as { record: { id: string } }).record.id
    await say('writer-updates', { kind: 'person', id: THE_PERSON }, 'Come and look at this.', {
      lead: { target: { kind: 'record', recordId, workspaceId: 'default' } },
    })
    await app.page.waitForSelector('.px-lead-offer', { timeout: 30_000 })
  }, 240_000)

  it('moves the count on the conversation\'s own row when two agents write to each other', async () => {
    // Whether a new message belongs to one of the between-agents conversations is a fact only the server
    // has, so the list is read on the event and the row's number moves, without the reader being a party
    // to the message. The tab above draws no number; the row is where it shows.
    // NOTHING HOLDS writer-three IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The
    // message is stored all the same, and its row counts it.
    await say('writer-two', { kind: 'agent', id: 'writer-three' }, 'A line between two agents.', {}, 409)
    await openThePanel()
    await app.page.click('.px-chat-tab[data-tab="between"]')
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')].some(
          (row) =>
            (row.querySelector('.px-chat-name')?.textContent ?? '').includes('writer-two') &&
            (row.querySelector('.px-chat-name')?.textContent ?? '').includes('writer-three') &&
            Number(row.querySelector('.px-chat-unread')?.textContent ?? '0') > 0,
        ),
      undefined,
      { timeout: 30_000 },
    )
  }, 240_000)

  it('draws a reply in the conversation the reader has open', async () => {
    // The event names the reader's contact, so the open conversation is read again and the reply
    // appears in it. This is the clock-and-tick conversation: the one the narrowing could silence.
    await openThePanel()
    await app.page.click('.px-chat-contact:has-text("writer-updates")')
    await app.page.waitForSelector('.px-chat-words', { timeout: 30_000 })
    await say('writer-updates', { kind: 'person', id: THE_PERSON }, 'A reply while you are looking.')
    await app.page.waitForFunction(
      () => document.body.textContent?.includes('A reply while you are looking.') === true,
      undefined,
      { timeout: 30_000 },
    )
  }, 240_000)
})