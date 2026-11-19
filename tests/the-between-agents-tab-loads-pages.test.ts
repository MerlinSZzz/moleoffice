// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The Between agents tab shows a page first and appends the next page on request. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, liveApp, type LiveApp, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

let db: TestDb
let app: LiveApp

beforeAll(async () => {
  db = await freshDb()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 40, retired: 0, theConversation: 0, otherContacts: 1, otherPersonMessages: 1,
    betweenAgents: 500, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 0, otherRecords: 0,
  })
  app = await liveApp({ name: 'made-up-between-pages', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1000 } })
}, 240_000)

afterAll(async () => { await app?.stop(); db?.close() }, 60_000)

it('loads and appends bounded pages without changing their order or the spacing of reads', async () => {
  const requests: { at: number; query: URLSearchParams }[] = []
  app.page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/messages/between-agents') requests.push({ at: Date.now(), query: url.searchParams })
  })
  await app.page.goto(`${app.site}/?lang=en#/chat`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await app.page.locator('.px-chat-tab[data-tab="between"]').click()
  const rows = app.page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(await rows.count()).toBe(25)
  const first = await rows.allTextContents()
  const more = app.page.locator('.px-chat-between-more')
  await more.click()
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBe(50)
  expect((await rows.allTextContents()).slice(0, 25)).toEqual(first)
  expect(requests.length).toBe(2)
  expect(requests[0]!.query.get('limit')).toBe('25')
  expect(requests[0]!.query.has('cursor')).toBe(false)
  expect(requests[1]!.query.get('limit')).toBe('25')
  expect(requests[1]!.query.has('cursor')).toBe(true)
  expect(requests[1]!.at - requests[0]!.at).toBeGreaterThanOrEqual(5_000)
}, 120_000)

it('keeps the requested pages in server order when a new message refreshes the list', async () => {
  const owner = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
  }
  // NOTHING HOLDS THE MADE-UP AGENTS IN THE TEST OFFICE, so the office stores each message to one, routes it and answers
  // 409. The message is stored all the same, and the list refreshes for it.
  const send = async (number: number, recipient: string, expected: number): Promise<void> => {
    const response = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-agent-1' },
      body: JSON.stringify({ kind: 'message', title: 'Made-up refresh', data: { body: `Made-up refresh ${number}`, to: [{ kind: 'agent', id: recipient }] } }),
    })
    expect(response.status, await response.clone().text()).toBe(expected)
  }
  const serverNames = async (): Promise<string[]> => {
    const names: string[] = []
    let cursor: string | null = null
    do {
      const query = new URLSearchParams({ shape: 'page', limit: '25' })
      if (cursor !== null) query.set('cursor', cursor)
      const response = await fetch(`${app.api}/api/messages/between-agents?${query}`, { headers: owner })
      expect(response.status).toBe(200)
      const page = await response.json() as { conversations: { between: { id: string }[] }[]; page: { next: string | null } }
      for (const row of page.conversations) names.push(row.between.map(({ id }) => {
        const agent = db.client.sqlite.prepare('select name from agents where id = ? or handle = ?').get(id, id) as { name: string } | undefined
        return agent?.name ?? id
      }).join(' · '))
      cursor = page.page.next
    } while (cursor !== null && names.length < 50)
    return names
  }
  await app.page.goto(`${app.site}/?lang=en#/chat`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await app.page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await app.page.locator('.px-chat-tab[data-tab="between"]').click()
  const rows = app.page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')
  const names = rows.locator('.px-chat-name')
  await expect.poll(() => rows.count(), { timeout: 30_000 }).toBe(25)
  await app.page.locator('.px-chat-between-more').click()
  await send(1, 'made-up-agent-2', 409)
  await expect.poll(() => rows.count(), { timeout: 40_000 }).toBe(50)
  await expect.poll(() => names.allTextContents(), { timeout: 40_000 }).toEqual(await serverNames())
  const before = await names.allTextContents()
  expect(new Set(before).size).toBe(before.length)
  expect(before[0]).toContain('made-up-agent-1')
  expect(before[0]).toContain('made-up-agent-2')

  await app.page.evaluate(() => {
    const state = window as unknown as { minimumBetweenRows: number; watchBetweenRows: MutationObserver }
    state.minimumBetweenRows = 50
    state.watchBetweenRows = new MutationObserver(() => {
      const count = document.querySelectorAll('.px-chat-under-tabs[data-showing="between"] .px-chat-contact').length
      state.minimumBetweenRows = Math.min(state.minimumBetweenRows, count)
    })
    state.watchBetweenRows.observe(document.body, { childList: true, subtree: true })
  })
  await send(2, 'made-up-agent-3', 409)
  await expect.poll(async () => {
    const shown = await names.allTextContents()
    return shown.length >= before.length && shown[0]?.includes('made-up-agent-3') === true && JSON.stringify(shown) === JSON.stringify(await serverNames())
  }, { timeout: 40_000 }).toBe(true)
  const after = await names.allTextContents()
  expect(new Set(after).size).toBe(after.length)
  expect(after[0]).toContain('made-up-agent-1')
  expect(after[0]).toContain('made-up-agent-3')
  expect(await app.page.evaluate(() => (window as unknown as { minimumBetweenRows: number }).minimumBetweenRows)).toBeGreaterThanOrEqual(before.length)
}, 180_000)
