// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY TELLS A RETIRED AGENT FROM THE NEW AGENT THAT TOOK ITS HANDLE. Criterion I4 of
 * design/agents/IDENTITY-ACCEPTANCE.md, checked on the state criterion I3 makes possible.
 *
 * I4 asks that where a list shows a retired agent beside a live one of the same name, the retired
 * one is drawn with its retirement date. That drawing is built (`theNameBesideItsDate` in
 * src/web/components/ContactChooser.tsx, commit ccc53a595). What was not possible before piece I-2
 * is the state it is for: a live agent and a retired one under ONE handle, made through the real
 * doors. This file makes that state and reads the Embassy list in a browser. It builds nothing.
 *
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST: make `theNameBesideItsDate` return
 * the name alone → the two rows read the same and the case goes red.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'
import { drawnStamp } from '../src/shared/time.ts'

let app: LiveApp
let page: Page
let retiredAt = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  const said = (await reply.json()) as Record<string, unknown>
  expect(reply.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  return said
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'two-of-one-handle', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  // THE OLD WREN, RETIRED, AND A NEW WREN UNDER THE SAME HANDLE AND THE SAME NAME, through the doors.
  const first = (await post('/api/agents/started', { handle: 'wren', name: 'Wren', runtime: 'claude-code', role: 'worker' }))[
    'agent'
  ] as { id: string }
  const retired = (await post(`/api/participants/agent/${first.id}/retire`, { because: 'the first piece is done' }))[
    'agent'
  ] as { retiredAt: string }
  retiredAt = retired.retiredAt
  await post('/api/agents/started', { handle: 'wren', name: 'Wren', runtime: 'claude-code', role: 'worker' })
  await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Embassy list, with a retired and a live agent of one handle', () => {
  it('draws the retired one with its retirement date and the live one with its name alone', async () => {
    expect(retiredAt, 'the retire door recorded a date').not.toBe('')
    await page.getByRole('button', { name: EMBASSY_WORDS.showRetired }).click()
    await page.waitForFunction(() => document.querySelectorAll('.emb-row[data-retired="yes"]').length > 0, null, {
      timeout: 20_000,
    })
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('.emb-row')]
        .map((row) => ({
          retired: row.getAttribute('data-retired'),
          name: row.querySelector('.emb-name')?.textContent ?? '',
        }))
        .filter((one) => one.name.startsWith('Wren')),
    )
    expect(names).toEqual(
      expect.arrayContaining([
        { retired: 'no', name: 'Wren' },
        // DRAWN TO THE MINUTE, by the one function that draws a stored stamp (shared rule R7).
        { retired: 'yes', name: `Wren — retired ${drawnStamp(retiredAt)}` },
      ]),
    )
    expect(names, 'two rows, one for each agent').toHaveLength(2)
  })
})
