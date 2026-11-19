// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD PAGE WITH A LINK FITS A 390-PIXEL WINDOW IN EVERY PAGE LANGUAGE.
 *
 * A link row says how its far end got here: the kind, whether it is a made-up example, and — when
 * the page could not count what the far end still needs — a "not checked" tag. Those words sit in
 * one lead group that kept its whole width, so at 390 the row was cut at the right edge and the
 * page scrolled sideways. The far end here is in another project, which is one real way a page
 * cannot count it.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const OTHER = 'made-up-other-project'
let app: LiveApp
let db: TestDb
let nearId = ''

beforeAll(async () => {
  db = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: OTHER, title: 'A made-up other project' })
  nearId = db.api.createRecord({
    kind: 'problem',
    title: 'A made-up problem with a link',
    workspaceId: 'default',
    actor: db.api.HUMAN,
    data: { state: 'open' },
  }).id
  const farId = db.api.createRecord({
    kind: 'module',
    title: 'A made-up module in another project',
    workspaceId: OTHER,
    origin: 'fixture',
    actor: db.api.HUMAN,
    data: {},
  }).id
  db.client.sqlite
    .prepare(
      'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, gate, carries, created_by_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run('li-made-up-cross-project', 'default', THE_PERSON, '2026-10-31 14:00:00', '2026-10-31 14:00:00', nearId, farId, 'blocks', 0, THE_PERSON, null, null, 'human')
  app = await liveApp({ name: 'record-link-phone', database: db.file, workspace: 'default', viewport: { width: 390, height: 1100 } })
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
  await app.page.goto(`${app.site}/?lang=${language}&look=light&mode=normal#/r/${nearId}/edit`)
  await waitForThePage(app.page, 45_000)
  await app.page.waitForSelector('main.page', { state: 'visible', timeout: 20_000 })
  const folds = app.page.locator('main.page details.rd-fold summary')
  for (const one of await folds.all()) await one.click()
  await app.page.waitForSelector('main.page .lp-lead', { state: 'visible', timeout: 20_000 })
  await app.page.waitForTimeout(150)
}

async function measure(): Promise<{ page: number; window: number; leads: { said: string; right: number }[] }> {
  return await app.page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    window: document.documentElement.clientWidth,
    leads: Array.from(document.querySelectorAll('main.page .lp-lead')).map((element) => ({
      said: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      right: Math.round(element.getBoundingClientRect().right),
    })),
  }))
}

it('fits the link row and the page at 390 in every page language', async () => {
  for (const language of ['en', 'zh', 'el', 'es', 'it', 'ko', 'pt'] as const) {
    await open(language)
    const measured = await measure()
    expect(measured.leads.length, `${language}: the page drew no link row`).toBeGreaterThan(0)
    expect(measured.page, `${language}: the record page is wider than a 390-pixel window`).toBeLessThanOrEqual(measured.window + 1)
    for (const lead of measured.leads) {
      expect(lead.right, `${language}: a link row is cut at the right edge: ${lead.said}`).toBeLessThanOrEqual(measured.window + 1)
    }
  }
}, 300_000)
