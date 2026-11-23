// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OPENING A CONVERSATION BETWEEN TWO AGENTS READS THAT CONVERSATION, AND OF THE LISTS ONLY THE BETWEEN-AGENTS LIST.
 *
 * A conversation between agents took longer to open than a contact's. The cause was in the page: when the pair's read
 * answered, the effect that reads it in src/web/components/Chat.tsx read every list of the chat again, afresh: the
 * registry of every participant, the dots, the contact list from the top, the groups, the projects, and the
 * between-agents list. On an office of the live size the registry and the contact list are the largest reads the chat
 * makes. Each answer drew the whole chat again, and the server, which answers one request at a time, answered the next
 * press after them. A contact's open reads its conversation and the agent's presence and nothing more, since round 9
 * of wave 13x took the same reading of every list out of the contact's mark effect
 * (tests/a-chat-switch-fetches-only-the-new-conversation.test.ts).
 *
 * Reading the pair moves one thing the chat draws: what is new in that pair, on its row of the between-agents list
 * (criterion M71). The server says so on the event it sends, which names that list alone. So the open reads that list
 * again and no other.
 *
 * WHAT THIS FILE HOLDS. On the chat page at 1440, with one pair of agents that wrote to each other, the between-agents
 * tab is opened and the page settles. Every `/api` read the page makes from the press on the pair's row until the page
 * has settled again is kept. The pair's conversation is among them, and each of them is either that or the
 * between-agents list.
 *
 * WHAT MAKES IT RED: on the old code the kept reads also hold the participants, the contacts, the groups and the
 * projects, read by `readEverything` after the pair answered.
 *
 * Every row here is made up, in this file's own test office from `liveApp` in tests/helpers.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const SIDES = [
  { handle: 'open-side-one', name: 'Test Open Side One' },
  { handle: 'open-side-two', name: 'Test Open Side Two' },
] as const
const SAID = 'Words one side of the opened pair said to the other.'

/**
 * A MESSAGE FROM ONE AGENT TO THE OTHER. Nothing answers as either agent in a test office, so the office stores the
 * message, routes it and may answer 409 rather than 201; it is stored either way.
 */
async function say(from: string, to: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAgent(from),
    body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: to }] } }),
  })
  expect([201, 409], await said.clone().text()).toContain(said.status)
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-opens-without-every-list', viewport: { width: 1440, height: 1000 } })
  for (const side of SIDES) {
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ kind: 'agent', title: side.name, data: { handle: side.handle, runtime: 'claude-code', state: 'active' } }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
  }
  await say(SIDES[0].handle, SIDES[1].handle, SAID)
  await say(SIDES[1].handle, SIDES[0].handle, 'The other side answered.')
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('opening a conversation between two agents', () => {
  it('reads that conversation, and of the lists only the between-agents list', async () => {
    const asked: string[] = []
    app.page.on('request', (request) => {
      // THE DOORS THE PAGE ASKS, and not the pictures it draws.
      if (request.resourceType() !== 'fetch' && request.resourceType() !== 'xhr') return
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api/')) asked.push(`${request.method()} ${url.pathname}${url.search}`)
    })
    await app.page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.click('.px-chat-page-lists .px-chat-tab[data-tab="between"]')
    const row = app.page.locator('.px-chat-page-lists .px-chat-contact', { hasText: SIDES[0].name }).filter({ hasText: SIDES[1].name })
    await row.waitFor({ timeout: 30_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.waitForTimeout(1_500)

    const from = asked.length
    await row.click()
    await expect
      .poll(() => app.page.$$eval('.px-chat-page-talk .px-chat-words', (all) => all.map((one) => one.textContent ?? '')), { timeout: 30_000 })
      .toContainEqual(expect.stringContaining(SAID))
    await waitForThePage(app.page, 60_000)
    await app.page.waitForTimeout(2_000)
    const opened = asked.slice(from)

    const thePair = /^GET \/api\/messages\/between\/[^/?]+\?/
    const theBetweenList = /^GET \/api\/messages\/between-agents(\?|$)/
    expect(opened.filter((one) => thePair.test(one)).length, JSON.stringify(opened)).toBeGreaterThan(0)
    expect(opened.filter((one) => !thePair.test(one) && !theBetweenList.test(one)), JSON.stringify(opened)).toEqual([])
  }, 180_000)
})
