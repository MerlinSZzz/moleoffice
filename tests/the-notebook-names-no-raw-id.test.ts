// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

// Wave 13q's pictures (report h3Rjf86iBrO5, block b-8): the notebook showed a raw record id. The id
// was inside an entry's words: a secretary writes "problem <id>" as a way to point at a record. An id
// is developer mode's; normal mode names the record by its title, and developer mode keeps the id.
let app: LiveApp
const shots = process.env.W13K_PN_SHOTS
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const ids = new Set<string>()
let agentId = ''
let recordId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'notebook-no-raw-id', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const started = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers: person, body: JSON.stringify({ handle: 'fern-test', name: 'Fern Holt', runtime: 'codex', role: 'secretary' }) })
  expect(started.status, await started.clone().text()).toBe(201)
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: person, body: JSON.stringify({ kind: 'problem', title: 'The seed tray fan stops at night', data: {} }) }).then((r) => r.json())
  recordId = filed.record.id
  ids.add(recordId)
  const wrote = await fetch(`${app.api}/api/agents/fern-test/notebook/entries`, { method: 'POST', headers: person, body: JSON.stringify({ entryKind: 'the-secretary-may', text: `You may water the seed tray when the soil is dry; problem ${recordId} says why at night.` }) })
  expect(wrote.status, await wrote.clone().text()).toBe(201)
  const read = await fetch(`${app.api}/api/agents/fern-test/notebook`, { headers: person }).then((r) => r.json())
  if (read.recordId) ids.add(read.recordId)
  for (const one of read.entries ?? []) ids.add(one.id)
  const registered = await fetch(`${app.api}/api/participants`, { headers: person }).then((r) => r.json())
  agentId = registered.agents.find((one: { handle?: string }) => one.handle === 'fern-test').id
  ids.add(agentId)
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await app?.stop() })

it('draws no record id, entry id or registry id on the notebook in normal mode', async () => {
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${agentId}/notebook`)
  await waitForThePage(app.page)
  await app.page.locator('main.page .nb-entry').first().waitFor({ timeout: 10_000 })
  const text = await app.page.locator('main.page').innerText()
  console.log('notebook text', JSON.stringify(text), [...ids])
  if (shots) await app.page.screenshot({ path: join(shots, 'notebook-1440.png'), fullPage: true })
  for (const id of ids) expect(text, `the id ${id} is on the page`).not.toContain(id)
  // The record is named by its title instead, and the name leads to it.
  await expect.poll(() => app.page.locator('main.page .nb-words a', { hasText: 'The seed tray fan stops at night' }).count(), { timeout: 5_000 }).toBe(1)
})

it('keeps the id in developer mode, where ids belong', async () => {
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${agentId}/notebook`)
  await waitForThePage(app.page)
  await app.page.evaluate(() => localStorage.setItem('mole-office.mode', 'inspect'))
  await app.page.reload()
  await waitForThePage(app.page)
  await app.page.locator('main.page .nb-entry').first().waitFor({ timeout: 10_000 })
  await expect.poll(() => app.page.locator('main.page .nb-words').innerText(), { timeout: 5_000 }).toContain(recordId)
})
