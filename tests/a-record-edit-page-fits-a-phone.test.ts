// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD'S EDITING PAGE FITS A 390-PIXEL WINDOW.
 *
 * The header's action row holds the way into the drawing, the way out of editing and the Delete
 * press. It kept its whole width, so in a language whose words for those presses are long the row
 * ran past the window and the page scrolled sideways on a phone. English is the control.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let app: LiveApp
let db: TestDb
let pipelineId = ''

beforeAll(async () => {
  db = await freshDb()
  pipelineId = db.api.createRecord({
    kind: 'pipeline',
    title: 'A made-up pipeline with a drawing',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: {},
  }).id
  app = await liveApp({ name: 'record-edit-phone', database: db.file, workspace: 'default', viewport: { width: 390, height: 1100 } })
  await app.context.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', 'light')
  }, { person: THE_TEST_OFFICES_OWNER.id })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

async function open(language: string): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=light&mode=normal#/r/${pipelineId}/edit`)
  await waitForThePage(app.page, 45_000)
  await app.page.waitForSelector('main.page', { state: 'visible', timeout: 20_000 })
  await app.page.waitForSelector('main.page .rp-actions', { state: 'visible', timeout: 20_000 })
  await app.page.waitForTimeout(150)
}

async function measure(): Promise<{ page: number; window: number; actions: { left: number; right: number; said: string } }> {
  return await app.page.evaluate(() => {
    const actions = document.querySelector('main.page .rp-actions')
    if (actions === null) throw new Error('the editing page drew no action row')
    const box = actions.getBoundingClientRect()
    return {
      page: document.documentElement.scrollWidth,
      window: document.documentElement.clientWidth,
      actions: { left: Math.round(box.left), right: Math.round(box.right), said: (actions.textContent ?? '').replace(/\s+/g, ' ').trim() },
    }
  })
}

it('fits the editing page and its action row at 390 in Greek, Spanish, Italian and Portuguese, with English as the control', async () => {
  for (const language of ['en', 'el', 'es', 'it', 'pt'] as const) {
    await open(language)
    const measured = await measure()
    expect(measured.actions.said, `${language}: the action row drew no presses`).not.toBe('')
    expect(measured.page, `${language}: the editing page is wider than a 390-pixel window`).toBeLessThanOrEqual(measured.window + 1)
    expect(measured.actions.right, `${language}: the action row runs past the right edge: ${measured.actions.said}`).toBeLessThanOrEqual(measured.window + 1)
  }
}, 300_000)
