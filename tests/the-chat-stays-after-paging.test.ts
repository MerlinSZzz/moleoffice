// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const GROUP = 'The made-up garden'
const GROUP_LINE = 'The garden gate is open.'
const PAIR_LINE = 'The watering can is full.'
const UNKNOWN_WRITER = 'garden-visitor'
const UNKNOWN_LINE = 'The garden path is clear.'

async function post(path: string, headers: Record<string, string>, body: unknown, status = 201): Promise<any> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBe(status)
  return reply.json()
}

beforeAll(async () => {
  app = await liveApp({ name: 'chat-stays-after-paging', viewport: { width: 1440, height: 1000 } })
  for (const [handle, name] of [['garden-keeper', 'Garden Keeper'], ['garden-helper', 'Garden Helper']]) {
    await post('/api/records', PERSON, { kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const registry = await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json() as { agents: { id: string; handle: string }[] }
  const keeper = registry.agents.find(one => one.handle === 'garden-keeper')!
  const group = await post('/api/groups', PERSON, {
    name: GROUP, because: 'A group for a made-up office.',
    members: [
      { who: { kind: 'person', id: THE_PERSON }, because: 'Reads the group.' },
      { who: { kind: 'agent', id: keeper.id }, because: 'Writes in the group.' },
    ],
  })
  await post('/api/records', PERSON, { kind: 'message', title: GROUP_LINE, data: { body: GROUP_LINE, toGroup: group.group.id } })
  await post('/api/records', { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'garden-keeper' }, {
    kind: 'message', title: PAIR_LINE, data: { body: PAIR_LINE, to: [{ kind: 'agent', id: 'garden-helper' }] },
  }, 409)
  const legacy = await post('/api/records', PERSON, {
    kind: 'message', title: UNKNOWN_LINE, data: { body: UNKNOWN_LINE, from: UNKNOWN_WRITER, to: [{ kind: 'person', id: THE_PERSON }] },
  })
  const db = new Database(join(app.dir, 'panelx.db'))
  db.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(legacy.record.id)
  db.prepare('UPDATE changes SET actor_type = ?, actor_id = ? WHERE record_id = ?').run('agent', UNKNOWN_WRITER, legacy.record.id)
  db.close()
  await app.page.addInitScript(() => localStorage.setItem('mole-office.chat.open', 'yes'))
}, 180_000)

afterAll(async () => { await app?.stop() })

describe('the selected chat stays across a change of page', () => {
  it.each([
    [1440, 1000, 'group'], [390, 900, 'group'],
    [1440, 1000, 'between'], [390, 900, 'between'],
    [1440, 1000, 'unregistered'], [390, 900, 'unregistered'],
  ] as const)('keeps a %s by %s %s conversation', async (width, height, kind) => {
    const { page } = app
    await page.setViewportSize({ width, height })
    await page.goto('about:blank')
    await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
    await waitForThePage(page, 30_000)
    const corner = page.locator('.px-chat[data-where="corner"]')
    await corner.locator(`.px-chat-tab[data-tab="${kind === 'group' ? 'groups' : kind === 'between' ? 'between' : 'contacts'}"]`).click({ timeout: 30_000 })
    await corner.locator('.px-chat-contact').filter({ hasText: kind === 'group' ? GROUP : kind === 'between' ? 'Garden Helper' : UNKNOWN_WRITER }).first().click({ timeout: 30_000 })
    const line = kind === 'group' ? GROUP_LINE : kind === 'between' ? PAIR_LINE : UNKNOWN_LINE
    await corner.locator('.px-chat-words').filter({ hasText: line }).first().waitFor({ timeout: 30_000 })
    if (kind === 'group') await corner.locator('.px-chat-them .px-chat-name').filter({ hasText: GROUP }).waitFor({ timeout: 30_000 })

    await page.evaluate(() => { window.location.hash = '#/chat' })
    const onPage = page.locator('.px-chat[data-where="page"]')
    await onPage.locator('.px-chat-words').filter({ hasText: line }).first().waitFor({ timeout: 30_000 })
    if (kind === 'group') await onPage.locator('.px-chat-them .px-chat-name').filter({ hasText: GROUP }).waitFor({ timeout: 30_000 })

    await page.goBack()
    await corner.locator('.px-chat-words').filter({ hasText: line }).first().waitFor({ timeout: 30_000 })
    await page.goForward()
    await onPage.locator('.px-chat-words').filter({ hasText: line }).first().waitFor({ timeout: 30_000 })
  }, 180_000)
})
