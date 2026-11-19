// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S KEPT LISTS ARE READ AGAIN ONLY WHEN AN EVENT SAYS THEY CHANGED.
 *
 * Round 17 of wave 13w, layers 2 and 3 of a decision. The chat page keeps
 * what it read in the page cache (src/web/lib/pagecache.ts). Every event the chat draws marks the
 * lists it may have changed, whether or not the chat is
 * open (`hearAlways` in src/web/lib/channel.ts, used by src/web/components/Chat.tsx). A drawing
 * of the chat made again reads only the marked lists.
 *
 * WHAT THIS FILE HOLDS.
 *   1. From the chat page to Settings and back, with nothing changed in between, the registry, the
 *      contacts, the conversations between agents and the groups are not asked for again.
 *   2. While the reader is on Settings, another actor (an agent) files a new agent. Its event reaches
 *      the open page. Back on the chat page, the contacts are read again and the new agent's row is drawn.
 *
 * MUTATION: the event listener in Chat.tsx marks nothing stale. Red on case 2: the contacts are not
 * read again on the return and the new agent's row is never drawn.
 *
 * THE WORLD IS ITS OWN: `liveApp` starts an API and a database of its own.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}
const AS_HERON = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'heron-agent' }

/**
 * The doors whose answers the events keep current. The chat reads its contacts a page at a time from
 * GET /api/messages/contact-list since round 20 of wave 13u.
 */
const KEPT_CURRENT = ['/api/participants', '/api/messages/contact-list', '/api/messages/between-agents', '/api/groups']

async function file(headers: Record<string, string>, body: unknown): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(201)
}

/** Every API path the page asks for from now until `take` is called. */
function watchTheRequests(): { take: () => string[] } {
  const asked: string[] = []
  const listen = (request: { url: () => string; method: () => string }): void => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname.startsWith('/api/')) asked.push(url.pathname)
  }
  app.page.on('request', listen)
  return {
    take: () => {
      app.page.off('request', listen)
      return asked
    },
  }
}

async function goTo(hash: string): Promise<void> {
  await app.page.evaluate((to) => {
    window.location.hash = to
  }, hash)
  await waitForThePage(app.page, 60_000)
}

beforeAll(async () => {
  app = await liveApp({ name: 'kept-chat-events', viewport: { width: 1440, height: 1000 } })
  await file(AS_THE_OWNER, { kind: 'agent', title: 'Heron Agent', data: { handle: 'heron-agent', runtime: 'claude-code', state: 'active' } })
  await app.page.goto(`${app.site}/?lang=en#/chat`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.px-chat-contact', { hasText: 'Heron Agent' }).first().waitFor({ state: 'visible', timeout: 30_000 })
}, 600_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the chat kept across pages', () => {
  it('asks for none of the lists events keep current when nothing has changed', async () => {
    await goTo('#/settings')
    const watching = watchTheRequests()
    await goTo('#/chat')
    await app.page.locator('.px-chat-contact', { hasText: 'Heron Agent' }).first().waitFor({ state: 'visible', timeout: 30_000 })
    const asked = watching.take()
    expect(asked.filter((path) => KEPT_CURRENT.includes(path)), `asked on the way back: ${asked.join(', ')}`).toEqual([])
  }, 120_000)

  it('reads the contacts again, and draws a new agent, after another actor files one while the reader is away', async () => {
    await goTo('#/settings')
    const before = await app.page.evaluate(() => document.documentElement.dataset['moleOfficeLastEvent'] ?? '')
    await file(AS_HERON, { kind: 'agent', title: 'Sandpiper Agent', data: { handle: 'sandpiper-agent', runtime: 'claude-code', state: 'active' } })
    // THE EVENT REACHES THE OPEN PAGE through the stream, while the chat page is not drawn.
    await expect
      .poll(() => app.page.evaluate(() => document.documentElement.dataset['moleOfficeLastEvent'] ?? ''), { timeout: 20_000 })
      .not.toBe(before)
    const watching = watchTheRequests()
    await goTo('#/chat')
    await app.page.locator('.px-chat-contact', { hasText: 'Sandpiper Agent' }).first().waitFor({ state: 'visible', timeout: 15_000 })
    expect(watching.take()).toContain('/api/messages/contact-list')
  }, 120_000)
})
