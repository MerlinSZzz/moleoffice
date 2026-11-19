// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The pages ask for one bounded page, and ask for more only on a press. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, type LiveApp } from './helpers.ts'

let app: LiveApp
const owner = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string) => ({ ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const name = () => `made-up-${randomUUID().replaceAll('-', '')}`
const LIMIT = 50
// All fixture bodies are short. This does not limit the size of an arbitrary single message.
const FIXTURE_BYTES = 256 * 1024
const FIXTURE_TIME_MS = 30_000

async function post(headers: Record<string, string>, body: unknown, expected = 201) {
  const response = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(response.status, await response.clone().text()).toBe(expected)
  return (await response.json() as { record: { id: string } }).record.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'message-page-bounds', viewport: { width: 1440, height: 1000 } })
  const handles = Array.from({ length: 8 }, name)
  for (const handle of handles) await post(owner, { kind: 'agent', title: 'Made-up agent', data: { handle, runtime: 'claude-code', state: 'active' } })
  const target = await post(owner, { kind: 'note', title: 'Made-up target', data: { body: 'Made-up target.' } })
  for (let i = 0; i < 60; i++) {
    await post(asAgent(handles[0]!), { kind: 'message', title: `Made-up question ${i}`, data: {
      body: `Made-up question ${i}. ${'x'.repeat(512)}`, asksThePerson: true,
      to: [{ kind: 'person', id: THE_PERSON }], lead: { target: { kind: 'record', recordId: target, workspaceId: 'default' } },
    } })
  }
  // Nothing holds the made-up agents in the test office, so the office stores each message between them, routes it
  // and answers 409; the message is stored all the same. The questions to the person above keep their 201.
  for (let a = 0; a < handles.length; a++) for (let b = a + 1; b < handles.length; b++) {
    await post(asAgent(handles[a]!), { kind: 'message', title: 'Made-up conversation', data: { body: 'Made-up conversation.', to: [{ kind: 'agent', id: handles[b] }] } }, 409)
  }
  // Ensure the long conversation sorts ahead of the other pairs even on a coarse clock.
  await new Promise(resolve => setTimeout(resolve, 1100))
  for (let i = 0; i < 60; i++) {
    await post(asAgent(handles[i % 2]!), { kind: 'message', title: `Made-up conversation ${i}`, data: { body: `Made-up conversation ${i}. ${'y'.repeat(512)}`, to: [{ kind: 'agent', id: handles[(i + 1) % 2] }] } }, 409)
  }
  // The browser probe records first draw from navigation.
  const probe = `(() => {
    new MutationObserver(() => { if (document.querySelector(".px-chat-circle") && !window.__madeUpDraw) window.__madeUpDraw = performance.now() }).observe(document, { childList: true, subtree: true })
  })()`
  await app.page.addInitScript({ content: probe })
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

it('bounds the initial reads and leaves the next pages until a press', async () => {
  const reads: { path: string; bytes: number; items: number; elapsed: number }[] = []
  const pending = new Set<Promise<void>>()
  app.page.on('response', response => {
    const url = new URL(response.url())
    if (response.request().method() !== 'GET' || !(url.pathname === '/api/messages' || url.pathname.startsWith('/api/messages/between/'))) return
    const job = (async () => {
      const body = await response.body()
      const json = JSON.parse(body.toString()) as { messages?: unknown[]; conversations?: unknown[] }
      const timing = response.request().timing()
      reads.push({ path: url.pathname + url.search, bytes: body.length, items: (json.messages ?? json.conversations ?? []).length, elapsed: timing.responseEnd - timing.requestStart })
    })()
    pending.add(job)
    void job.finally(() => pending.delete(job))
  })
  await app.page.goto(`${app.site}/?lang=en#/`)
  await app.page.locator('.px-chat-circle').waitFor({ timeout: 30_000 })
  const offers = () => reads.filter(one => new URL(one.path, app.site).searchParams.get('leads') === '1')
  await expect.poll(() => offers().length).toBeGreaterThan(0)
  await app.page.waitForTimeout(1000)
  const beforeOffers = offers().length
  expect(beforeOffers).toBeGreaterThan(0)
  expect(Number(new URL(offers()[0]!.path, app.site).searchParams.get('limit'))).toBeGreaterThan(0)
  await app.page.locator('.px-lead-more').click()
  await expect.poll(() => offers().length).toBeGreaterThan(beforeOffers)

  await app.page.locator('.px-chat-circle').click()
  await app.page.locator('.px-chat-tab[data-tab="between"]').click()
  await app.page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact').first().waitFor()
  await app.page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact').first().click()
  await app.page.locator('.px-chat-said [data-chat-content]').last().waitFor()
  const talks = () => reads.filter(one => new URL(one.path, app.site).pathname.startsWith('/api/messages/between/'))
  await expect.poll(() => talks().length).toBeGreaterThan(0)
  const beforeOlder = talks().length
  await app.page.locator('.px-chat-between-older').click()
  await expect.poll(() => talks().length).toBeGreaterThan(beforeOlder)

  await app.page.goto(`${app.site}/?lang=en#/messages`)
  await app.page.locator('.px-ms-waiting').waitFor()
  const questions = () => reads.filter(one => new URL(one.path, app.site).searchParams.get('only') === 'waiting-for-my-answer')
  await expect.poll(() => questions().length).toBeGreaterThan(0)
  const beforeQuestions = questions().length
  await app.page.locator('.px-ms-waiting-more').click()
  await expect.poll(() => questions().length).toBeGreaterThan(beforeQuestions)
  await Promise.allSettled([...pending])
  expect(await app.page.evaluate(() => (window as unknown as { __madeUpDraw: number }).__madeUpDraw)).toBeLessThan(FIXTURE_TIME_MS)
  for (const read of reads) {
    const url = new URL(read.path, app.site)
    expect(Number(url.searchParams.get('limit')), read.path).toBeGreaterThan(0)
    expect(Number(url.searchParams.get('limit')), read.path).toBeLessThanOrEqual(LIMIT)
    expect(read.items, read.path).toBeLessThanOrEqual(LIMIT)
    expect(read.bytes, read.path).toBeLessThan(FIXTURE_BYTES)
    expect(read.elapsed, read.path).toBeLessThan(FIXTURE_TIME_MS)
  }
}, 180_000)
