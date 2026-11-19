// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ROW AND ONE REVOKE PER KEY ON THE CITIZEN'S PAGE, AND EACH REVOKES ITS OWN KEY AND NO OTHER.
 * Problem yZ71bheXm-Ji: on 29 September 2026 the one Revoke key press on an agent's page revoked a
 * running round's key, because it named only the agent and took the newest key.
 *
 * WHAT IS REAL: a test office with a real listener and the built page in a browser. A made-up agent,
 * Quill Archivist, is registered through the start door and so holds its own key; the office's own
 * key then files two running runs for it, and the office makes each run a key of its own. That is
 * three live keys of one agent.
 *
 * ONE FIXTURE IS WRITTEN STRAIGHT INTO THE TEST DATABASE: the second run is marked finished there.
 * Every door that ends a run also revokes its key (lib/records.ts, `revokeTheRunKeyRecordedOn`), so a
 * live key whose run has ended is left only by runs that ended before runs were given keys, or by a
 * database changed by hand. The page must still say that run has ended, so the test makes one.
 *
 *   2. The row of a run that ended says so; the row of a running run says it is still running; the
 *      agent's own key names no run. A key nobody recorded a use of shows the short mark, and a key
 *      used once shows when.
 *   3. No key id is on the page in normal mode.
 *   4. The press on the first run's row revokes that run's key and NO OTHER: the agent's own key and
 *      the second run's key are still live.
 *
 * MUTATIONS (after a green control), each alone, each red:
 *   a. the press revokes the agent's first key rather than its own row's key (RevokeTheirKey.tsx):
 *      case 4 goes red;
 *   b. the ended run read as still running (keys.ts, `whereARunStands`): case 2 goes red.
 *
 * PHOTOGRAPHS, when EMBASSY_KEYS_SHOTS names a folder: the profile's key rows and the Embassy at 1440,
 * 990, 660 and 390, light and dark, and at 1440 in Chinese and in the test language. They are taken
 * before any press.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
let quill = ''
const runs: { first: string; second: string } = { first: '', second: '' }

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = (await reply.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(reply.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function quillsRow(): Promise<EmbassyRow> {
  const reply = await fetch(`${app.api}/api/office/embassy`, { headers: AS_THE_PERSON })
  expect(reply.status).toBe(200)
  const row = ((await reply.json()) as WhatTheEmbassySays).rows.find((one) => one.who.id === quill)
  expect(row, 'Quill Archivist has an Embassy row').toBeTruthy()
  return row as EmbassyRow
}

async function openTheProfile(query = ''): Promise<void> {
  await app.page.goto(`${app.site}/${query}#/who/agent/${quill}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.their-key').first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** The row whose words say it is this key. */
function theRow(what: string) {
  return app.page.locator('.their-key').filter({ has: app.page.locator('.their-key-what', { hasText: new RegExp(`^${what}$`) }) })
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-revoke-per-key', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const started = await post('/api/agents/started', { handle: 'quill-archivist', name: 'Quill Archivist', role: 'worker' })
  quill = String(started['agent']?.id ?? '')
  expect(quill, 'the start door answered a registry id').not.toBe('')
  // THE OFFICE FILES TWO RUNS FOR IT, WITH ITS OWN KEY, and makes each run a key (lib/records.ts, mintARunKey).
  const office = String((JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office)
  const asTheOffice = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'mole-office/the-message-worker',
    'x-mole-office-key': office,
  }
  const keys: string[] = []
  for (const [which, title] of [['first', 'Sorting the archive'], ['second', 'Indexing the letters']] as const) {
    // READ WHOLE, NOT THROUGH post(): the reply carries the run's key once, and post() hides keys.
    const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers: asTheOffice, body: JSON.stringify({
      kind: 'session', title,
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: 'quill-archivist' },
    }) })
    expect(reply.status, `the ${which} run was filed`).toBe(201)
    const filed = (await reply.json()) as Record<string, any>
    runs[which] = String(filed['record'].id)
    keys.push(String(filed['runKey']?.key ?? ''))
    expect(keys.at(-1), `the office made the ${which} run a key`).toMatch(/^[0-9a-f]{64}$/)
  }
  // THE FIRST RUN'S KEY IS USED ONCE, so the office records when; the agent's own key is never used here.
  const used = await fetch(`${app.api}/api/records/${runs.first}`, {
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill-archivist', 'x-mole-office-key': keys[0]! },
  })
  expect(used.status).toBe(200)
  // THE SECOND RUN ENDED WITH ITS KEY STILL LIVE, written into the database: see this file's header.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    db.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(runs.second)
  } finally {
    db.close()
  }
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.workspace') === null) localStorage.setItem('mole-office.workspace', 'default')
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
  // THE USE IS WRITTEN AFTER THE REPLY. Wait until the office has it, so case 2 does not race the write.
  for (let tries = 0; tries < 50; tries += 1) {
    const row = await quillsRow()
    if (row.heldKeys.some((one) => one.lastUsedAt !== null)) break
    await new Promise((done) => setTimeout(done, 100))
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('photographs', () => {
  it.skipIf(!process.env['EMBASSY_KEYS_SHOTS'])('photographs the key rows and the Embassy before any press', async () => {
    const shots = process.env['EMBASSY_KEYS_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const take = async (name: string, path: string, width: number, theme: 'light' | 'dark', query = '') => {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.goto(`${app.site}/${query}#${path}`, { timeout: 60_000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.waitForTimeout(500)
      await app.page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await take(`profile-${String(width)}-${theme}`, `/who/agent/${quill}`, width, theme)
        await take(`embassy-${String(width)}-${theme}`, '/embassy', width, theme)
      }
    }
    await take('profile-1440-zh', `/who/agent/${quill}`, 1440, 'light', '?lang=zh')
    await take('embassy-1440-zh', '/embassy', 1440, 'light', '?lang=zh')
    await take('profile-1440-xx', `/who/agent/${quill}`, 1440, 'light', '?lang=xx')
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  }, 900_000)
})

describe('the keys of one agent', () => {

  it('2: says a run that ended has ended, a running run is running, and says in words that nobody recorded a use (decision WdlQ2ADlhZUu)', async () => {
    await openTheProfile()
    const facts = async (what: string): Promise<string> => (await theRow(what).locator('.their-key-facts').innerText()).replace(/\s+/g, ' ')
    const own = await facts(en['embassyKeys.itsOwn'])
    const first = await facts(en['embassyKeys.ofRun'].replace('{run}', 'Sorting the archive'))
    const second = await facts(en['embassyKeys.ofRun'].replace('{run}', 'Indexing the letters'))
    expect(second, 'the ended run says so').toContain(`${en['embassyKeys.run']} ${en['embassyKeys.ended']}`)
    expect(first, 'the running run says so').toContain(`${en['embassyKeys.run']} ${en['embassyKeys.notEnded']}`)
    expect(own, 'its own key names no run').not.toContain(en['embassyKeys.run'])
    expect(own, 'nobody recorded a use of its own key').toContain(`${en['embassyKeys.lastUsed']} ${en['embassyKeys.noUseRecorded']}`)
    expect(own, 'a lone dash says nothing a person can read').not.toContain(`${en['embassyKeys.lastUsed']} ${en['absence.mark']}`)
    expect(first, 'the first run key was used, and when is shown').not.toContain(en['embassyKeys.noUseRecorded'])
  }, 120_000)

  it('3: shows no key id in normal mode', async () => {
    await openTheProfile()
    const page = await app.page.locator('main').innerText()
    for (const key of (await quillsRow()).heldKeys) expect(page, 'a key id is machinery').not.toContain(key.id)
  }, 120_000)

  it("4: the first run's press revokes that run's key and no other", async () => {
    const before = (await quillsRow()).heldKeys
    const [own, first, second] = before
    expect(first?.of?.id).toBe(runs.first)
    await openTheProfile()
    const row = theRow(en['embassyKeys.ofRun'].replace('{run}', 'Sorting the archive'))
    await row.getByRole('button', { name: en['embassyKeys.revokeRun'].replace('{run}', 'Sorting the archive'), exact: true }).click()
    await row.locator('.tiered-undo').waitFor({ state: 'visible', timeout: 20_000 })
    expect(await row.locator('.tiered-undo').innerText()).toContain(`${en['embassyKeys.ofRun'].replace('{run}', 'Sorting the archive')}: revoked.`)
    const after = (await quillsRow()).heldKeys.map((one) => one.id)
    expect(after, "only the first run's key was revoked").toEqual([own!.id, second!.id])
  }, 120_000)
})
