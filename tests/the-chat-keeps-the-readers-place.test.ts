// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT DOES NOT SCROLL TO THE BOTTOM BY ITSELF WHILE THE READER IS ELSEWHERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The chat sometimes jumped to the bottom by itself while the reader was reading somewhere in the
 * middle. Criterion M101.
 *
 * Measured at commit 4c77b62a, src/web/components/Chat.tsx: one effect scrolled an anchor at the
 * end of the list into view whenever `open`, `talk` or `theGroup` changed. `talk` is the object the
 * panel gets back from reading the conversation, and it is a FRESH object every time — the panel
 * re-reads on the messages connection and after marking anything read. So the list went to the end
 * every few seconds, wherever the reader had scrolled to, with nothing they could do about it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED
 * ---------------------------------------------------------------------------------------
 *
 * The reader's place survives both things that used to move it: the conversation being read again
 * with nothing new in it, and a message arriving. Then the two halves that must still work — the
 * list follows new messages while the reader IS at the bottom, and the mark saying new messages are
 * below takes one press to reach them.
 *
 * THE PLACE IS MEASURED IN PIXELS off the scrolling element, not from a class name, because the
 * defect is a number changing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const AS_THE_AGENT = {
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'long-agent',
}

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }),
  })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/** Where the list is scrolled to, and how far down it could go. */
async function whereTheyAreLooking(): Promise<{ at: number; most: number }> {
  return app.page.$eval('.px-chat-said', (list) => ({
    at: Math.round(list.scrollTop),
    most: Math.round(list.scrollHeight - list.clientHeight),
  }))
}

async function openTheConversation(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  // THE PANEL REMEMBERS WHICH CONTACT WAS OPEN (M58), so after the first case it comes back
  // straight into the conversation and there is no list to press.
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Long Agent"))')
  }
  await app.page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 20_000 })
  // A LIST THAT DOES NOT SCROLL MEASURES NOTHING ABOUT SCROLLING.
  await app.page.waitForFunction(
    () => {
      const list = document.querySelector('.px-chat-said')
      return list !== null && list.scrollHeight - list.clientHeight > 200
    },
    undefined,
    { timeout: 20_000 },
  )
}

/** Scroll the list to the top and say where it ended up. */
async function scrollToTheTop(): Promise<number> {
  await app.page.$eval('.px-chat-said', (list) => {
    list.scrollTop = 0
    list.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await app.page.waitForTimeout(100)
  return (await whereTheyAreLooking()).at
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-place', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Long Agent',
      data: { handle: 'long-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  // A SECOND AGENT, so a message can be written outside the conversation under test.
  const other = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Other Agent',
      data: { handle: 'other-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(other.status, await other.text()).toBe(201)
  // THIRTY MESSAGES THE READER SENT. They are the owner's own on purpose: a message addressed to the owner makes
  // the panel mark it read, which re-reads the conversation for a reason that is not this test.
  for (let n = 1; n <= 30; n += 1) {
    await say(AS_THE_OWNER, `Line ${String(n)} of the wrist camera fit, long enough to take a row.`, {
      kind: 'agent',
      id: 'long-agent',
    })
  }
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a reader who has scrolled up stays where they are', () => {
  it('does not read the conversation again for a message to somebody else, and the reader stays put', async () => {
    await openTheConversation()
    const top = await scrollToTheTop()
    expect(top, 'the list did not move to the top, so nothing is being measured').toBe(0)

    // COUNT TWO THINGS FROM HERE: the panel's reads of this conversation, and its reads of the
    // contacts. What proves the event arrived at all is the last event the page's panels were handed
    // (`data-mole-office-last-event` on <html>), which is why this case cannot pass with the messages
    // connection switched off.
    const handedBefore = await app.page.evaluate(() => Number((document.documentElement.dataset['moleOfficeLastEvent'] ?? '0').split(' ')[0]))
    await app.page.evaluate(() => {
      const holder = window as unknown as { __conversationReads: number; __contactReads: number }
      holder.__conversationReads = 0
      holder.__contactReads = 0
      const real = window.fetch.bind(window)
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url.includes('/api/messages/conversation')) holder.__conversationReads += 1
        // EITHER CONTACTS DOOR: the chat reads its list a page at a time from the second since round 20 of wave 13u
        // and counting only the first would hold however often the chat read the list.
        if (url.includes('/api/messages/contacts') || url.includes('/api/messages/contact-list')) holder.__contactReads += 1
        return real(input, init)
      }
    })

    // A MESSAGE TO A DIFFERENT AGENT. Nothing in the conversation on screen changes.
    await say(AS_THE_OWNER, 'A word to somebody else entirely.', { kind: 'agent', id: 'other-agent' })

    // THE EVENT ARRIVED, and the panel applied it to the contact row it holds and read nothing at all
    // (since 26 September 2026 the event carries the message). The chat used to answer any event
    // anywhere by reading all six of its lists and the open conversation with them, which was 45 per
    // cent of the owner's server's working life; after that it read the one list the event named.
    await app.page.waitForFunction(
      (before: number) => Number((document.documentElement.dataset['moleOfficeLastEvent'] ?? '0').split(' ')[0]) > before,
      handedBefore,
      { timeout: 20_000 },
    )
    await app.page.waitForTimeout(2_000)

    const counts = await app.page.evaluate(() => {
      const holder = window as unknown as { __conversationReads: number; __contactReads: number }
      return { conversation: holder.__conversationReads, contacts: holder.__contactReads }
    })
    expect(
      counts.conversation,
      'a message to somebody else read the open conversation again; the chat is meant to read only the list an event names',
    ).toBe(0)
    expect(
      counts.contacts,
      'the contacts list was read for an event that carries the message it moves',
    ).toBe(0)

    // AND THE READER IS WHERE THEY LEFT OFF. This is the part the fault was about, the jump to the
    // bottom while reading, and it still has to hold, by a different route: the list is not re-read at all now,
    // where before it was re-read and had to be kept in place.
    const now = await whereTheyAreLooking()
    expect(now.most, 'the list stopped scrolling, so nothing is being measured').toBeGreaterThan(200)
    expect(now.at, 'the list scrolled to the bottom by itself while the reader was at the top').toBe(0)
    expect(
      await app.page.$('.px-chat-new-below'),
      'a mark said new messages were below, and nothing was written in this conversation',
    ).toBeNull()
  }, 180_000)

  it('stays put when a message arrives, and says there is something new below', async () => {
    await openTheConversation()
    expect(await scrollToTheTop()).toBe(0)

    await say(AS_THE_AGENT, 'Something new arrived while you were reading further up.', {
      kind: 'person',
      id: THE_PERSON,
    })

    await app.page.waitForSelector('.px-chat-new-below', { timeout: 30_000 })
    const now = await whereTheyAreLooking()
    expect(now.at, 'the list jumped to the newest message when one arrived').toBe(0)

    const said = await app.page.$eval('.px-chat-new-below', (one) => one.textContent ?? '')
    expect(said).toBe(CHAT_WORDS.newMessagesBelow)

    // AND ONE PRESS GOES TO IT.
    await app.page.click('.px-chat-new-below')
    await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        return list !== null && list.scrollHeight - list.clientHeight - list.scrollTop < 8
      },
      undefined,
      { timeout: 15_000 },
    )
    expect(await app.page.$('.px-chat-new-below'), 'the mark stayed after the reader went to it').toBeNull()
  }, 180_000)

  it('follows a new message while the reader is at the bottom, and draws no mark', async () => {
    await openTheConversation()
    // The conversation opens at its newest message, which is where a reader who has not moved is.
    await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        return list !== null && list.scrollHeight - list.clientHeight - list.scrollTop < 8
      },
      undefined,
      { timeout: 20_000 },
    )

    await say(AS_THE_AGENT, 'This one should be followed, because nobody has scrolled away.', {
      kind: 'person',
      id: THE_PERSON,
    })
    await app.page.waitForFunction(
      () =>
        [...document.querySelectorAll('.px-chat-words')].some((one) =>
          (one.textContent ?? '').includes('should be followed'),
        ),
      undefined,
      { timeout: 30_000 },
    )
    await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        return list !== null && list.scrollHeight - list.clientHeight - list.scrollTop < 8
      },
      undefined,
      { timeout: 20_000 },
    )
    expect(
      await app.page.$('.px-chat-new-below'),
      'a mark said messages were below while the reader was at the bottom',
    ).toBeNull()
  }, 180_000)
})
