// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY DRAWS WHO RETIRED A ROW BY THE HANDLE ON ITS ROW, NOT BY ITS MINTED ID.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Wave rule 5 of the identity work (criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md): a
 * sentence a person reads names an agent by the handle read from its row. The retire door stores
 * who retired a row by registry id, and a new agent's id is twelve characters nobody knows. So the
 * Embassy's retired row carries `retired.byHandle` beside `retired.by` (`theEmbassy` in
 * src/server/api/office.ts), and EmbassyPage.tsx draws the handle.
 *
 * A retired row is drawn only after "Show the ones you retired" is pressed, so this is a browser test.
 * The reply half is also checked without a browser in
 * tests/the-participant-doors-find-an-agent-by-its-name.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   EmbassyPage.tsx draws `row.retired.by.id` again → the case goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let app: LiveApp
let retirerId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Register an agent through the door and hand back its registry id, which is not its handle. */
async function register(
  headers: Record<string, string>,
  handle: string,
  name: string,
  role?: string,
): Promise<string> {
  const made = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ handle, name, ...(role === undefined ? {} : { role }) }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const id = ((await made.json()) as { agent: { id: string } }).agent.id
  expect(id, 'the mint line is not in this tree').not.toBe(handle)
  return id
}

beforeAll(async () => {
  app = await liveApp({ name: 'retirer-handle', viewport: { width: 1440, height: 1000 } })
  // A WORKER STARTS A WORKER AND RETIRES IT, sending its handle, so the only thing that lets it is
  // being the starter and what is stored is the starter's registry id.
  retirerId = await register(AS_THE_OWNER, 'retirer-w', 'Retirer')
  await register(asAgent('retirer-w'), 'retired-child', 'Retired Child')
  const retired = await fetch(`${app.api}/api/participants/agent/retired-child/retire`, {
    method: 'POST',
    headers: asAgent('retirer-w'),
    body: JSON.stringify({ because: 'a test agent, closed by the test' }),
  })
  expect(retired.status, await retired.clone().text()).toBe(200)
  // AND AN AGENT WHOSE CARD ANOTHER AGENT CHOSE, for the page the photographs below draw.
  await register(AS_THE_OWNER, 'chooser-sup', 'Chooser', 'supervisor')
  await register(asAgent('chooser-sup'), 'chosen-worker', 'Chosen Worker', 'worker')
}, 240_000)

/** Unfold the Embassy's retired rows and leave the retired row on screen. */
async function openTheRetiredRow(): Promise<void> {
  // RELOADED, because going to the hash the page is already on keeps the fold as it was left.
  await app.page.goto(`${app.site}/#/embassy`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await app.page.waitForSelector('.emb-list', { timeout: 20_000 })
  // Widen to everybody first where the press is offered: a retired agent need not be a contact.
  const everyone = await app.page.$('button.emb-show:has-text("Show everyone")')
  if (everyone !== null) await everyone.click()
  const showRetired = await app.page.$('button.emb-show:has-text("Show the ones you retired")')
  expect(showRetired, 'the press that shows the retired rows is not drawn').not.toBeNull()
  await showRetired?.click()
}

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the Embassy’s retired row', () => {
  it('names who retired it by the handle on that agent’s row', async () => {
    await openTheRetiredRow()
    const row = app.page.locator('.emb-row[data-retired="yes"]', { hasText: 'Retired Child' }).first()
    await row.waitFor({ state: 'visible', timeout: 20_000 })
    const words = (await row.textContent()) ?? ''
    // THE CONTROL: this is the retired row, and it says why, so the line below is about this row.
    expect(words).toContain('a test agent, closed by the test')
    expect(words, 'the row does not name who retired it by handle').toContain('retirer-w')
    expect(words, 'the row names who retired it by the minted id').not.toContain(retirerId)
  }, 120_000)
})

describe('the two pages, photographed', () => {
  /**
   * PHOTOGRAPH THE CHANGED PAGES AT THE FOUR WIDTHS AND IN BOTH THEMES when `DOORS_SHOTS` names a
   * directory (chapter 6, rule 1). The control and mutation runs leave it unset and take no picture.
   */
  it.skipIf(!process.env['DOORS_SHOTS'])('photographs the Embassy row and the two citizen pages', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['DOORS_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const idOf = async (handle: string): Promise<string> => {
      const read = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_OWNER })
      return ((await read.json()) as { participant: { id: string } }).participant.id
    }
    const pages: [string, () => Promise<void>][] = [
      ['embassy-retired-row', async () => {
        await openTheRetiredRow()
        const row = app.page.locator('.emb-row[data-retired="yes"]', { hasText: 'Retired Child' }).first()
        await row.waitFor({ state: 'visible', timeout: 20_000 })
        await row.scrollIntoViewIfNeeded()
      }],
      ['profile-retired-by', async () => {
        await app.page.goto(`${app.site}/#/who/agent/${await idOf('retired-child')}`)
        await app.page.reload()
        await waitForThePage(app.page, 30_000)
        await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
      }],
      ['profile-card-chosen-by', async () => {
        await app.page.goto(`${app.site}/#/who/agent/${await idOf('chosen-worker')}`)
        await app.page.reload()
        await waitForThePage(app.page, 30_000)
        await app.page.waitForSelector('.tc-chosen-by', { timeout: 20_000 })
        await app.page.locator('.tc-chosen-by').scrollIntoViewIfNeeded()
      }],
    ]
    for (const [name, open] of pages) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await open()
          await app.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png` })
        }
      }
    }
  }, 600_000)
})
