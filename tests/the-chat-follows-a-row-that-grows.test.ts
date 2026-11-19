// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROW THAT GROWS AFTER IT IS DRAWN KEEPS A READER AT THE BOTTOM THERE, AND NEVER MOVES ONE WHO SCROLLED UP.
 *
 * Measured on 26 September 2026 (wave 13q, round 1): when the chat opens, it puts the list at its newest
 * message while the rows can still be about half their final height. The rows then grow, and no message
 * arrives to move the list again, so the reader was left short of the newest. tests/the-chat-keeps-the-
 * readers-place.test.ts met this only now and then, depending on timing. This test makes a row grow on
 * purpose, so it does not depend on timing:
 *
 *   - a reader at the bottom is kept at the bottom;
 *   - a reader who has scrolled up stays exactly where they are.
 *
 * The code it guards is the ResizeObserver in src/web/components/Chat.tsx, beside goToTheNewest.
 *
 * MUTATION PROOFS (after a green control), in that observer:
 *   1. make it return at once (if (list.isConnected) return): the first case fails, the reader is left
 *      short;
 *   2. take its first line away, so it always scrolls: the second case fails, the reader is moved.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

/** How far the list is from its bottom, and where it is. */
async function whereTheListIs(): Promise<{ fromTheBottom: number; at: number }> {
  return app.page.$eval('.px-chat-said', (list) => ({
    fromTheBottom: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
    at: Math.round(list.scrollTop),
  }))
}

/** Make the newest row 300 pixels taller, as a row that finishes drawing late does. */
async function theNewestRowGrows(): Promise<void> {
  await app.page.$eval('.px-chat-said', (list) => {
    const last = list.lastElementChild as HTMLElement | null
    if (last === null) throw new Error('the list has no rows')
    // The row's content grows, as it does when its last line draws late.
    const more = document.createElement('div')
    more.style.height = '300px'
    last.appendChild(more)
  })
  await app.page.waitForTimeout(300)
}

async function openTheConversation(): Promise<void> {
  await app.page.goto(app.site)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Grow Agent"))')
  }
  await app.page.waitForSelector('.px-chat-said .px-chat-words', { timeout: 20_000 })
  await app.page.waitForFunction(
    () => {
      const list = document.querySelector('.px-chat-said')
      return list !== null && list.scrollHeight - list.clientHeight > 200
    },
    undefined,
    { timeout: 20_000 },
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-row-grows', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Grow Agent', data: { handle: 'grow-agent', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  // The reader's own messages, so the panel does not mark anything read and read the list again.
  for (let n = 1; n <= 20; n += 1) {
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'message',
        title: `Line ${String(n)}`,
        data: { body: `Line ${String(n)} of a made-up conversation, long enough to take a row.`, to: [{ kind: 'agent', id: 'grow-agent' }] },
      }),
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(said.status, await said.clone().text()).toBe(409)
  }
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a row that grows after it is drawn', () => {
  it('keeps a reader at the bottom there', async () => {
    await openTheConversation()
    await app.page.waitForFunction(
      () => {
        const list = document.querySelector('.px-chat-said')
        return list !== null && list.scrollHeight - list.clientHeight - list.scrollTop < 8
      },
      undefined,
      { timeout: 20_000 },
    )
    await theNewestRowGrows()
    const after = await whereTheListIs()
    expect(after.fromTheBottom, 'the reader was left short of the newest after a row grew').toBeLessThan(8)
  }, 120_000)

  it('leaves a reader who has scrolled up exactly where they are', async () => {
    await openTheConversation()
    await app.page.$eval('.px-chat-said', (list) => {
      list.scrollTop = 0
      list.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await app.page.waitForTimeout(200)
    expect((await whereTheListIs()).at, 'the list did not move to the top, so nothing is measured').toBe(0)
    await theNewestRowGrows()
    expect((await whereTheListIs()).at, 'a reader who had scrolled up was moved when a row grew').toBe(0)
  }, 120_000)
})
