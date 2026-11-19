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
const shots = testShots('an-owner-walk-explains-itself-in-the-page-language')
const asPerson = () => ({
  'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person,
})

async function register(handle: string, name: string): Promise<string> {
  const reply = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST', headers: asPerson(), body: JSON.stringify({ handle, name, runtime: 'claude-code' }),
  })
  expect(reply.status).toBe(201)
  return ((await reply.json()) as { agent: { id: string } }).agent.id
}

async function send(to: string, body: string) {
  const reply = await fetch(`${app.api}/api/records`, {
    method: 'POST', headers: asPerson(), body: JSON.stringify({ kind: 'message', title: body, data: { to: [{ kind: 'agent', id: to }], body } }),
  })
  expect(reply.status).toBe(409)
  return ((await reply.json()) as { record: { id: string }; routed: { line: string; said?: { ending: { how: string } } }[] })
}

async function pageLine(id: string, language: 'en' | 'zh') {
  await app.page.goto(`${app.site}/?lang=${language}#/message/${id}`)
  await app.page.waitForSelector('.mp-body', { timeout: 20_000 })
  const line = app.page.locator('.px-chat-routed-line').first()
  await line.waitFor({ state: 'visible', timeout: 20_000 })
  return line.innerText()
}

beforeAll(async () => {
  app = await liveApp({ name: 'owner-walk-language', viewport: { width: 1440, height: 1000 } })
  person = (await import('../src/shared/person.ts')).THE_PERSON
}, 240_000)
afterAll(async () => { await app?.stop() })

describe('an ownership walk explains itself in the page language', () => {
  for (const kind of ['ownerless', 'broken', 'waiting'] as const) {
    it(`shows readable names and translates the ${kind} explanation`, async () => {
      const targetName = `Readable ${kind} addressee`
      const target = await register(`${kind}-walk-target`, targetName)
      let ownerName = ''
      if (kind === 'ownerless') {
        const db = new Database(join(app.dir, 'panelx.db'))
        try { setFixtureOwner(db, null, target, 'id') } finally { db.close() }
      } else {
        ownerName = `Readable ${kind} owner`
        const owner = await register(`${kind}-walk-owner`, ownerName)
        const db = new Database(join(app.dir, 'panelx.db'))
        try {
          const columns = db.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
          expect(columns.some((column) => column.name === 'owner_id')).toBe(true)
          setFixtureOwner(db, owner, target, 'id')
          if (kind === 'broken') setFixtureOwner(db, target, owner, 'id')
          else setFixtureOwner(db, null, owner, 'id')
        } finally { db.close() }
      }
      const result = await send(target, `The ${kind} walk`)
      const ending = result.routed[0]?.said?.ending.how
      const words = await import('../src/shared/messages.ts') as unknown as {
        OWNERLESS_ROUTING_ENDING: string; BROKEN_OWNERS_ROUTING_ENDING: string; NO_REACHABLE_OWNER_ENDING: string
      }
      expect(ending).toBe(kind === 'ownerless' ? words.OWNERLESS_ROUTING_ENDING : kind === 'broken' ? words.BROKEN_OWNERS_ROUTING_ENDING : words.NO_REACHABLE_OWNER_ENDING)
      expect(ending).toBeTruthy()
      const english = await pageLine(result.record.id, 'en')
      expect(english).toBe(result.routed[0]!.line)
      expect(english).toContain(targetName)
      expect(english).not.toContain(target)
      if (ownerName) expect(english).toContain(ownerName)
      const chinese = await pageLine(result.record.id, 'zh')
      expect(chinese).toContain(targetName)
      if (ownerName) expect(chinese).toContain(ownerName)
      expect(chinese).toMatch(/[\u4e00-\u9fff]/u)
      expect(chinese).not.toBe(english)
    }, 120_000)
  }

  it.skipIf(!process.env['TEST_SHOTS'])('photographs the explanations in both themes at four widths', async () => {
    for (const kind of ['ownerless', 'broken', 'waiting'] as const) {
      const target = await register(`${kind}-photo-target`, `Readable ${kind} addressee for a picture`)
      if (kind === 'ownerless') {
        const db = new Database(join(app.dir, 'panelx.db'))
        try { setFixtureOwner(db, null, target, 'id') } finally { db.close() }
      } else {
        const owner = await register(`${kind}-photo-owner`, 'Readable owner for a picture')
        const db = new Database(join(app.dir, 'panelx.db'))
        try {
          setFixtureOwner(db, owner, target, 'id')
          if (kind === 'broken') setFixtureOwner(db, target, owner, 'id')
          else setFixtureOwner(db, null, owner, 'id')
        } finally { db.close() }
      }
      const result = await send(target, `A picture of the ${kind} walk`)
      await pageLine(result.record.id, 'en')
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
