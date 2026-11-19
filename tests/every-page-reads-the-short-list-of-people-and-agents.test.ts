// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Home's mounted readers ask the shared cache for the page shape; contacts keep their drawing. */
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantsReply } from '../src/web/api.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
let whole: ParticipantsReply
let retiredId: string
let remarkRecord: string
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const SHOTS = process.env['PARTICIPANTS_SHOTS']
const WHEN = process.env['PARTICIPANTS_SHOTS_WHEN'] ?? 'after'
const REMARK = 'This made-up reading needs one more check.'

async function write(method: 'POST' | 'PATCH', path: string, body: unknown, headers = PERSON): Promise<Response> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, body: JSON.stringify(body) })
  expect(reply.status, await reply.clone().text()).toBeLessThan(300)
  return reply
}

beforeAll(async () => {
  app = await liveApp({ name: 'short-participants', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await write('PATCH', `/api/participants/person/${THE_PERSON}`, { name: 'Made-up Rowan', language: 'en' })
  for (const [handle, name] of [['made-up-lark', 'Made-up Lark'], ['made-up-wren', 'Made-up Wren']]) {
    await write('POST', '/api/records', { kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } })
    await write('POST', '/api/records', { kind: 'message', title: 'A made-up greeting', data: { body: 'A greeting for this test.', to: [{ kind: 'person', id: THE_PERSON }] } }, { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle! })
  }
  const before = await fetch(`${app.api}/api/participants`, { headers: PERSON })
  expect(before.status).toBe(200)
  retiredId = (await before.json() as ParticipantsReply).agents.find(one => one.handle === 'made-up-wren')!.id
  await write('POST', `/api/participants/agent/${retiredId}/retire`, { because: 'The made-up work is finished.' })
  // A fixed fixture date makes the before and after drawings comparable.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare('UPDATE agents SET retired_at = ? WHERE id = ?').run('2026-09-20 09:00:00', retiredId)
    if (SHOTS) db.prepare("UPDATE records SET created_at = ?, updated_at = ? WHERE kind IN ('agent', 'message')").run('2026-10-13 09:00:00', '2026-10-13 09:00:00')
  } finally { db.close() }
  const reply = await fetch(`${app.api}/api/participants`, { headers: PERSON })
  whole = await reply.json() as ParticipantsReply
  const record = await write('POST', '/api/records', { kind: 'module', title: 'Made-up page for an agent remark', summary: 'A made-up page whose links have a remark.', data: { context: 'This module is only a test fixture.' } })
  remarkRecord = ((await record.json()) as { record: { id: string } }).record.id
  await write('POST', '/api/records', { kind: 'message', title: 'A made-up remark', data: { body: REMARK, target: { target: { kind: 'region', recordId: remarkRecord, regionId: 'section.links' }, place: { at: 'surface' } } } }, { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-lark' })
  if (SHOTS) await app.page.clock.setFixedTime(new Date('2026-10-13T09:00:00Z'))
}, 180_000)

afterAll(async () => { await app?.stop() }, 60_000)

async function openHome(): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-home-section="agents"] [data-agent-count]').first().waitFor({ timeout: 30_000 })
}

async function openContacts(): Promise<void> {
  await openTheChat(app.page)
  await app.page.locator('.px-chat-tabs [data-tab="contacts"]').click()
  await app.page.locator('.px-chat-top-group').first().waitFor({ timeout: 30_000 })
  while (await app.page.locator('.px-chat-fold[aria-expanded="false"]').count() > 0) {
    await app.page.locator('.px-chat-fold[aria-expanded="false"]').first().click()
    await app.page.waitForTimeout(200)
  }
  await app.page.locator(`.px-chat-contact[data-contact="agent:${retiredId}"]`).waitFor({ timeout: 30_000 })
}

it('every participants list request on Home and its contacts panel asks for the page shape, and contacts keep names, pictures and the retired date', async () => {
  const asked: URL[] = []
  const listener = (request: import('playwright').Request): void => {
    const url = new URL(request.url())
    if (url.pathname === '/api/participants') asked.push(url)
  }
  app.page.on('request', listener)
  try {
    await openHome()
    expect(asked.length, 'the list was read').toBeGreaterThan(0)
    expect(asked.map(one => one.search), 'a mounted reader asked for whole participants').toEqual(asked.map(() => '?shape=page'))
    await openContacts()
    await app.page.waitForTimeout(500)
    expect(asked.length, 'the list was read').toBeGreaterThan(0)
    expect(asked.map(one => one.search), 'a mounted reader asked for whole participants').toEqual(asked.map(() => '?shape=page'))
    for (const participant of whole.agents.filter(one => ['made-up-lark', 'made-up-wren'].includes(one.handle))) {
      const row = app.page.locator(`.px-chat-contact[data-contact="agent:${participant.id}"]`)
      expect(await row.innerText()).toContain(participant.name)
      expect(await row.locator('img').first().getAttribute('src')).toContain(participant.avatarUrl)
      expect(await row.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
      if (participant.retired) {
        expect(participant.retiredAt).toBeTruthy()
        expect(await row.innerText()).toContain(participant.retiredAt!.slice(0, 10))
      }
    }
  } finally { app.page.off('request', listener) }
}, 120_000)

// The same made-up office before and after the change, in English, at every required width and look.
it.runIf(SHOTS)('pictures of Home, the contacts panel and an agent remark', async () => {
  mkdirSync(SHOTS!, { recursive: true })
  await app.page.clock.setFixedTime(new Date('2026-10-13T09:00:00Z'))
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) {
    await app.page.setViewportSize({ width, height: 1000 })
    await app.page.emulateMedia({ colorScheme: theme })
    await openHome()
    if (await app.page.locator('.px-chat-close').isVisible()) await app.page.locator('.px-chat-close').click()
    await app.page.waitForTimeout(500)
    await app.page.mouse.move(5, 5)
    await app.page.screenshot({ path: join(SHOTS!, `${WHEN}-home-${width}-${theme}.png`), fullPage: true })
    await openContacts()
    await app.page.locator(`.px-chat-contact[data-contact="agent:${retiredId}"]`).scrollIntoViewIfNeeded()
    await app.page.mouse.move(5, 5)
    await app.page.screenshot({ path: join(SHOTS!, `${WHEN}-contacts-${width}-${theme}.png`) })
    await app.page.goto(`${app.site}/?lang=en#/r/${remarkRecord}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    if (await app.page.locator('.px-chat-close').isVisible()) await app.page.locator('.px-chat-close').click()
    await app.page.locator('.px-said').first().waitFor({ timeout: 30_000 })
    expect(await app.page.locator('.px-said').first().innerText()).toContain(REMARK)
    await app.page.mouse.move(5, 5)
    await app.page.screenshot({ path: join(SHOTS!, `${WHEN}-remark-${width}-${theme}.png`), fullPage: true })
  }
}, 300_000)
