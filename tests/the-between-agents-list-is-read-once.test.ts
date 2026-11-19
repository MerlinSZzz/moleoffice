// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT READS THE BETWEEN-AGENTS LIST ONCE, AND NOT WITHOUT STOPPING (wave 13y round 146).
 *
 * On 8 November 2026, opening a conversation from the chat's "between agents" list made the page ask the server for
 * that list about 190 times a second, until the page was reloaded. The page cache never called the answer fresh. A read
 * that starts just after a list is marked stale carries the same count as the mark, and `markFreshFrom` in
 * src/web/lib/pagecache.ts asked for a lower one. The chat reads the list again while it is not fresh, and each answer
 * made it read again.
 *
 * In a test office of its own, with two made-up agents who have written to each other, this file opens the list, opens
 * their conversation, and goes back to the lists. After each step it waits for the page to settle, then counts the
 * page's reads of the list in 5 seconds in which nothing is written. Each count is at most 2. Each is checked even when
 * the other fails. With the fault the first was over 500.
 *
 * MUTATION: `<=` back to `<` in markFreshFrom. Both counts go red.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const LARK = { handle: 'lark-counted', name: 'Lark Counted' }
const WREN = { handle: 'wren-counted', name: 'Wren Counted' }
/** The address the chat reads the between-agents list from. */
const THE_LIST = '/api/messages/between-agents'
/** How long the page is left after a step before its reads are counted. */
const SETTLE_MS = 3_000
/** How long the reads are counted for. */
const COUNTED_MS = 5_000
/** The most reads a quiet window may hold. The fault made hundreds. */
const AT_MOST = 2

async function post(headers: Record<string, string>, body: unknown, expected = 201): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-agents-read-once', viewport: { width: 1440, height: 1000 } })
  for (const one of [LARK, WREN]) {
    await post(AS_THE_OWNER, { kind: 'agent', title: one.name, data: { handle: one.handle, runtime: 'claude-code', state: 'active' } })
  }
  // Nothing holds Wren in the test office, so the office stores Lark's message, routes it and answers 409. The
  // message is stored all the same, and the list draws it.
  await post(
    { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': LARK.handle },
    { kind: 'message', title: 'The kettle readings', data: { body: 'The kettle readings for the east shed are in.', to: [{ kind: 'agent', id: WREN.handle }] } },
    409,
  )
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('reads the list a few times at most after its conversation is opened, and after going back to the lists', async () => {
  let reads = 0
  app.page.on('request', (request) => {
    if (new URL(request.url()).pathname === THE_LIST) reads += 1
  })
  /** The reads in a quiet window, after the page has settled from the last step. */
  const readsWhileNothingIsWritten = async (): Promise<number> => {
    await app.page.waitForTimeout(SETTLE_MS)
    const before = reads
    await app.page.waitForTimeout(COUNTED_MS)
    return reads - before
  }

  await app.page.goto(`${app.site}/?lang=en#/`)
  await waitForThePage(app.page, 30_000)
  await app.page.click('.px-chat-circle')
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="between"]')
  const row = app.page.locator('.px-chat-contact').filter({ hasText: LARK.name }).first()
  await row.waitFor({ timeout: 20_000 })
  expect(reads, 'the page did not read the list when its tab was opened, so nothing below is counted').toBeGreaterThan(0)

  await row.click()
  await app.page.waitForSelector('.px-chat-said [data-chat-content]', { timeout: 20_000 })
  expect.soft(await readsWhileNothingIsWritten(), 'reads of the list in 5 seconds, with the conversation open').toBeLessThanOrEqual(AT_MOST)

  await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-tab[data-tab="between"]')
  await row.waitFor({ timeout: 20_000 })
  expect.soft(await readsWhileNothingIsWritten(), 'reads of the list in 5 seconds, back in the lists').toBeLessThanOrEqual(AT_MOST)
}, 120_000)
