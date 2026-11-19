// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

let app: LiveApp
let person: string
const shots = testShots('a-routed-message-keeps-its-addressee-visible')
let secretary: { id: string; handle: string }
let target: { id: string; handle: string }
let sender: { id: string; handle: string }

const as = (kind: 'human' | 'agent', id: string) => ({
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': kind, 'x-mole-office-actor-id': id,
})

async function register(handle: string, by: ReturnType<typeof as>, role?: string) {
  const reply = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers: by, body: JSON.stringify({ handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) }) })
  expect(reply.status).toBe(201)
  const body = await reply.json() as { agent: { id: string } }
  return { id: body.agent.id, handle }
}

async function send(kind: 'human' | 'agent', writer: string, body: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: as(kind, writer), body: JSON.stringify({ kind: 'message', title: body, data: { to: [{ kind: 'agent', id: target.id }], body } }) })
  expect(reply.status).toBe(409)
  return ((await reply.json()) as { record: { id: string } }).record.id
}

async function drawn(id: string) {
  await app.page.goto(`${app.site}/#/message/${id}`)
  await app.page.waitForSelector('.mp-body', { timeout: 20_000 })
  const line = app.page.locator('.px-chat-routed-line').first()
  await line.waitFor({ state: 'visible', timeout: 20_000 })
  expect(await line.innerText()).toContain(target.handle)
}

async function received(id: string) {
  const reply = await fetch(`${app.api}/api/handles/${secretary.handle}/waiting`, { headers: as('agent', secretary.handle) })
  expect(reply.status).toBe(200)
  const body = await reply.json() as { waiting: { messageId: string; to?: { id: string }[] }[] }
  expect(body.waiting.some((entry) => entry.messageId === id)).toBe(true)
  const message = await fetch(`${app.api}/api/messages/${id}`, { headers: as('agent', secretary.handle) })
  expect(message.status).toBe(200)
  const read = await message.json() as { message: { to: { id: string }[] } }
  expect(read.message.to).toContainEqual({ kind: 'agent', id: target.id })
}

beforeAll(async () => {
  app = await liveApp({ name: 'routed-addressee', viewport: { width: 1440, height: 1000 } })
  person = (await import('../src/shared/person.ts')).THE_PERSON
  const roles = await fetch(`${app.api}/api/roles`, { headers: as('human', person) })
  expect(roles.status).toBe(200)
  const role = ((await roles.json()) as { elevation: { rule: { onlyThisCardCanHoldIt: string } } }).elevation.rule.onlyThisCardCanHoldIt
  secretary = await register('route-secretary', as('human', person), role)
  target = await register('original-addressee', as('agent', secretary.handle))
  sender = await register('letter-writer', as('human', person))
  const { localStamp } = await import('../src/shared/time.ts')
  const now = localStamp(new Date())
  const waiting = { state: 'finished', runtime: 'claude-code', servingAgentId: secretary.id, deliveringMessage: 'test-message', providerSession: 'test-conversation', waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)) }
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    setFixtureOwner(db, secretary.id, target.id, 'id')
    db.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) VALUES (?, 'default', ?, ?, ?, 'session', 'A waiting test run', NULL, ?, NULL, 'authored')").run('test-waiting-secretary', person, now, now, JSON.stringify(waiting))
  } finally { db.close() }
}, 240_000)

afterAll(async () => { await app?.stop() })

describe('a routed message keeps its addressee visible', () => {
  for (const kind of ['human', 'agent'] as const) {
    it(`shows the original addressee for a message from a ${kind}`, async () => {
      const id = await send(kind, kind === 'human' ? person : sender.handle, `A message from a ${kind}`)
      await received(id)
      await drawn(id)
    }, 120_000)
  }

  it.skipIf(!process.env['TEST_SHOTS'])('photographs both routed messages in both themes at four widths', async () => {
    for (const kind of ['human', 'agent'] as const) {
      const id = await send(kind, kind === 'human' ? person : sender.handle, `A photographed message from a ${kind}`)
      await received(id)
      await drawn(id)
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await app.page.waitForTimeout(150)
          const dimensions = await app.page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
          expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width)
          await app.page.screenshot({ path: `${shots}/${kind}-${String(width)}-${theme}.png`, fullPage: false })
        }
      }
    }
  }, 300_000)
})
