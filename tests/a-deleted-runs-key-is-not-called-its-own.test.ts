// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LIVE KEY WHOSE RUN'S RECORD WAS DELETED SAYS SO, AND IS NOT CALLED THE AGENT'S OWN KEY.
 * Problem sWNzXXKdB3q6: the label read only session records that were not deleted, and deleting a
 * run's record does not revoke its key. So the key of a run whose record was deleted was labelled
 * "Its own key" on the agent's page, which was a guess shown as fact.
 *
 * WHAT IS REAL: a test office with a real listener and the built page in a browser. A made-up agent,
 * Wren Cataloguer, is registered through the start door and so holds its own key. The office's own
 * key files one run for it, and the office makes that run a key. The person then deletes the run's
 * record through the records door. Nothing is written into the database by hand.
 *
 *   1. The Embassy's row for the agent carries two keys: its own, and `a-deleted-run` naming the
 *      run's id, with no title and no state.
 *   2. The agent's page draws the second row as the key of a run whose record was deleted, and its
 *      press says it revokes the key of the deleted run. No row but the first says "Its own key".
 *   3. The run's id is not on the page in normal mode, and it is in developer mode.
 *
 * MUTATION (after a green control): in src/server/lib/keys.ts, `whatTheKeyWithThisIdIsFor`, the line
 * that answers `a-deleted-run` removed, so a deleted run's key falls through to "its own" as before.
 * All three cases go red: case 3 because the developer row of the run id is drawn only for such a key.
 *
 * PHOTOGRAPHS, when DELETED_RUN_KEY_SHOTS names a folder: the agent's key rows at 1440, 990, 660 and
 * 390, light and dark, at 1440 in Chinese, in the test language and in developer mode. Each picture is
 * of the keys panel alone, so no person's name is in it.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { EmbassyRow, WhatTheEmbassySays } from '../src/shared/worlds.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
let wren = ''
let run = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function wrensRow(): Promise<EmbassyRow> {
  const reply = await fetch(`${app.api}/api/office/embassy`, { headers: AS_THE_PERSON })
  expect(reply.status).toBe(200)
  const row = ((await reply.json()) as WhatTheEmbassySays).rows.find((one) => one.who.id === wren)
  expect(row, 'Wren Cataloguer has an Embassy row').toBeTruthy()
  return row as EmbassyRow
}

async function openTheProfile(query = ''): Promise<void> {
  await app.page.goto(`${app.site}/${query}#/who/agent/${wren}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.their-key').first().waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'a-deleted-runs-key', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify({ handle: 'wren-cataloguer', name: 'Wren Cataloguer', role: 'worker' }),
  })
  expect(started.status).toBeLessThan(300)
  wren = String(((await started.json()) as Record<string, any>)['agent']?.id ?? '')
  expect(wren, 'the start door answered a registry id').not.toBe('')
  // THE OFFICE FILES A RUN FOR IT, WITH ITS OWN KEY, and makes the run a key (lib/records.ts, mintARunKey).
  const office = String((JSON.parse(readFileSync(join(app.dir, 'keys.json'), 'utf8')) as { office: string }).office)
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'mole-office/the-message-worker',
      'x-mole-office-key': office,
    },
    body: JSON.stringify({
      kind: 'session', title: 'Shelving the maps',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: 'wren-cataloguer' },
    }),
  })
  expect(filed.status, 'the run was filed').toBe(201)
  const said = (await filed.json()) as Record<string, any>
  run = String(said['record'].id)
  expect(String(said['runKey']?.key ?? ''), 'the office made the run a key').toMatch(/^[0-9a-f]{64}$/)
  // THE CONTROL BEFORE THE DELETE: the key is labelled the run's.
  expect((await wrensRow()).heldKeys.map((one) => one.is)).toEqual(['its-own', 'a-run'])
  // THE PERSON DELETES THE RUN'S RECORD, through the door, and its key stays live.
  const gone = await fetch(`${app.api}/api/records/${run}`, { method: 'DELETE', headers: AS_THE_PERSON })
  expect(gone.status, await gone.text()).toBeLessThan(300)
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.workspace') === null) localStorage.setItem('mole-office.workspace', 'default')
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the key of a run whose record was deleted', () => {
  it('1: the Embassy says the key is a deleted run\'s, names the run, and guesses no title or state', async () => {
    const keys = (await wrensRow()).heldKeys
    expect(keys.map((one) => one.is), 'the key is still live, and is not called its own').toEqual(['its-own', 'a-deleted-run'])
    expect(keys[1]!.of).toEqual({ id: run, title: null, state: null })
  }, 60_000)

  it('2: the page says so in words, and its press says which key it revokes', async () => {
    await openTheProfile()
    expect(await app.page.locator('.their-key').count()).toBe(2)
    const what = await app.page.locator('.their-key-what').allInnerTexts()
    expect(what).toEqual([en['embassyKeys.itsOwn'], en['newAgentKeys.ofDeletedRun']])
    const row = app.page.locator('.their-key[data-key-is="a-deleted-run"]')
    expect(await row.getByRole('button').allInnerTexts()).toEqual([en['newAgentKeys.revokeDeletedRun']])
    // NO STATE IS GUESSED FOR IT: the record that held one is deleted.
    expect(await row.locator('[data-run-state]').count()).toBe(0)
  }, 120_000)

  it('3: shows the run id in developer mode only', async () => {
    await openTheProfile()
    expect(await app.page.locator('main').innerText(), 'a run id is machinery').not.toContain(run)
    await openTheProfile('?mode=inspect')
    const row = app.page.locator('.their-key[data-key-is="a-deleted-run"]')
    await row.locator(`[data-deleted-run="${run}"]`).waitFor({ state: 'visible', timeout: 30_000 })
    expect((await row.locator('.their-key-facts').innerText()).replace(/\s+/g, ' ')).toContain(`${en['newAgentKeys.runId']} ${run}`)
  }, 120_000)
})

describe('photographs', () => {
  it.skipIf(!process.env['DELETED_RUN_KEY_SHOTS'])('photographs the key rows', async () => {
    const shots = process.env['DELETED_RUN_KEY_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const take = async (name: string, width: number, theme: 'light' | 'dark', query = '') => {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await openTheProfile(query)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      const keys = app.page.locator('.their-keys').first()
      await keys.waitFor({ state: 'visible', timeout: 30_000 })
      await app.page.waitForTimeout(300)
      await keys.screenshot({ path: `${shots}/${name}.png` })
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) await take(`keys-${String(width)}-${theme}`, width, theme, '?mode=normal')
    }
    await take('keys-1440-zh', 1440, 'light', '?lang=zh&mode=normal')
    await take('keys-1440-xx', 1440, 'light', '?lang=xx&mode=normal')
    await take('keys-1440-developer', 1440, 'light', '?mode=inspect')
  }, 600_000)
})
