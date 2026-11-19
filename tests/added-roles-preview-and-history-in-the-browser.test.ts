// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Locator } from 'playwright'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
let app: LiveApp, db: TestDb
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const fixtureCard = (name: string) => ({ name, rung: null, duties: 'Made-up archive duties.', powers: ['Reading everything'], appointedBy: 'the person', appoints: 'nobody', mustRead: { chapters: [{ chapter: 1, level: 'full' }], andWhatItsStarterNames: null }, reportsTo: 'The person.', whatEndsIt: 'When the archive is read.', workArea: { grain: 'folders', most: 'no limit', says: 'Name the archive folders.' } })
beforeAll(async () => {
  db = await freshDb()
  db.client.sqlite.prepare('UPDATE people SET name=? WHERE id=?').run('Made-up caretaker', THE_TEST_OFFICES_OWNER.id)
  db.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.role:forgotten-archive', JSON.stringify({ ...fixtureCard('forgotten-archive'), powers: ['Made-up missing power'], mustRead: null }))
  app = await liveApp({ name: 'added-roles-pages', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(() => { localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') })
})
afterAll(async () => { await app?.stop(); db?.close() })
async function open(path: string, width = 1440, theme = 'light') { await app.page.setViewportSize({ width, height: 1100 }); await app.page.goto(app.site + `/?lang=en&look=${theme}&mode=normal#/${path}`); await waitForThePage(app.page, 60_000); expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme) }
async function cards() { return (await fetch(app.api + '/api/roles/added', { headers })).json() }
async function seed(name: string) {
  const reply = await fetch(app.api + '/api/roles/added', { method: 'POST', headers, body: JSON.stringify({ version: null, card: fixtureCard(name), because: 'Made-up browser picture card.' }) })
  expect(reply.status, await reply.text()).toBe(200)
}
async function fill(name: string) {
  await app.page.getByLabel('Name', { exact: true }).fill(name)
  await app.page.getByLabel('Duties', { exact: true }).fill('Made-up browser archive duties.')
  await app.page.locator('.added-choice').filter({ hasText: 'Reading everything' }).locator('input').check()
  await app.page.getByLabel('Who it reports to', { exact: true }).fill('The person.')
  await app.page.getByLabel('What ends it', { exact: true }).fill('When the archive is read.')
  await app.page.getByLabel('Words shown when a work area is refused', { exact: true }).fill('Name the archive folders.')
}
async function preview() { const response = app.page.waitForResponse(reply => reply.url().endsWith('/api/roles/added/preview')); await app.page.getByRole('button', { name: 'Preview', exact: true }).click(); const reply = await response; expect(reply.status(), await reply.text()).toBe(200); await app.page.locator('[data-role-preview]').waitFor() }
async function apply() { await app.page.getByLabel('Why change this card?', { exact: true }).fill('Made-up browser change.'); await app.page.getByRole('button', { name: 'Apply', exact: true }).click(); await expect.poll(() => app.page.url()).toContain('#/roles'); await app.page.locator('.rol').waitFor() }

it('previews, applies, edits, puts back history and removes through the page presses', async () => {
  await open('roles/new'); await fill('browser-archivist'); await preview()
  expect(await app.page.locator('[data-role-preview]').innerText()).toContain('Only the person gives this card.')
  expect(await app.page.locator('[data-role-preview]').innerText()).toContain('Whom it appoints')
  expect(await app.page.locator('[data-role-preview]').innerText()).not.toContain('appointedBy')
  expect(await app.page.locator('[data-role-preview] pre').count()).toBe(0)
  expect((await cards()).cards).toEqual([])
  expect(await app.page.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)
  await apply(); expect((await cards()).cards[0].name).toBe('browser-archivist')
  await open('roles/added/browser-archivist')
  expect(await app.page.getByLabel('Name', { exact: true }).isDisabled()).toBe(true)
  await app.page.getByLabel('Duties', { exact: true }).fill('Made-up edited browser archive duties.')
  await preview(); await apply()
  await open('roles/added/browser-archivist/history'); await app.page.locator('[data-role-history] article').nth(1).waitFor()
  await app.page.locator('[data-role-history] article').nth(1).getByRole('button', { name: 'Put back', exact: true }).click()
  await app.page.locator('[data-role-preview]').waitFor()
  expect(await app.page.locator('[data-role-preview]').innerText()).toContain('Made-up browser archive duties.')
  expect(await app.page.locator('[data-role-history]').innerText()).toContain('Added the card.')
  expect(await app.page.locator('[data-role-history] pre').count()).toBe(0)
  await apply(); expect((await cards()).cards[0].card.duties).toBe('Made-up browser archive duties.')
  await open('roles/added/browser-archivist/remove'); await app.page.locator('[data-role-preview]').waitFor()
  expect(await app.page.locator('[data-role-preview]').innerText()).toContain('Acts lost')
  await apply(); expect((await cards()).cards).toEqual([])
  await app.page.locator('[data-removed-roles]').getByRole('link', { name: 'History', exact: true }).click()
  await app.page.locator('[data-role-history] article').last().getByRole('button', { name: 'Put back', exact: true }).click()
  await app.page.locator('[data-role-preview]').waitFor()
  await apply(); expect((await cards()).cards[0].name).toBe('browser-archivist')
  await open('roles/added/browser-archivist/remove'); await app.page.locator('[data-role-preview]').waitFor(); await apply()
}, 120_000)

it('draws locked, added and left-out cards, reminders, a refusal and edit history at four widths in both themes', async () => {
  await seed('archivist')
  const folder = process.env.W13R_ROLE_SHOTS
  if (folder) mkdirSync(folder, { recursive: true })
  const THE_MADE_UP_LABEL = 'Made-up test office — role examples'
  /** The label goes in above the block the picture shows, then the picture. */
  const shoot = async (above: Locator, name: string) => {
    await putTheMadeUpLabelIn(app.page, THE_MADE_UP_LABEL, above, 'the Role cards page')
    await app.page.screenshot({ path: `${folder!}/${name}.png`, fullPage: false })
  }
  for (const width of [1440, 390]) for (const theme of ['light']) {
    for (const scene of ['roles', 'new-preview', 'new-refusal', 'edit-history']) {
      await open(scene === 'roles' ? 'roles' : scene === 'edit-history' ? 'roles/added/archivist/history' : 'roles/new', width, theme)
      if (scene === 'roles') {
        expect(await app.page.locator('.rol-mark').filter({ hasText: "Office’s own role · locked" }).count()).toBe(5)
        expect(await app.page.locator('.rol-mark').filter({ hasText: 'Added office role' }).count()).toBe(1)
        expect(await app.page.locator('[data-left-out-roles]').innerText()).toContain('Made-up missing power')
        expect(await app.page.locator('[data-left-out-roles]').getAttribute('role'), 'the cards left out are named in a status notice').toBe('status')
      } else if (scene === 'edit-history') {
        await app.page.locator('[data-role-history] article').waitFor()
        expect(await app.page.getByLabel('Name', { exact: true }).inputValue()).toBe('archivist')
      } else {
        await fill('made-up-picture-role')
        if (scene === 'new-refusal') await app.page.getByLabel('Duties', { exact: true }).fill('')
        await preview()
        expect(await app.page.locator('[data-role-preview]').innerText()).toContain(scene === 'new-preview' ? 'Only the person gives this card.' : 'does not say what its duties are')
        if (scene === 'new-refusal') expect(await app.page.getByRole('button', { name: 'Apply', exact: true }).isDisabled()).toBe(true)
      }
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scene} ${width} ${theme}`).toBe(true)
      if (folder) {
        if (scene === 'roles') {
          await shoot(app.page.locator('.rol-block').filter({ has: app.page.locator('.rol-added-actions') }), `${scene}-${width}-${theme}`)
          await shoot(app.page.locator('.rol-block').first(), `roles-locked-${width}-${theme}`)
          await shoot(app.page.locator('[data-left-out-roles]'), `roles-recovery-${width}-${theme}`)
        } else {
          await shoot(scene === 'edit-history' ? app.page.locator('[data-role-history]') : app.page.locator('[data-role-preview]'), `${scene}-${width}-${theme}`)
          await shoot(app.page.locator('h1').first(), `${scene}-form-${width}-${theme}`)
          if (scene === 'edit-history') await shoot(app.page.getByRole('button', { name: 'Put back', exact: true }), `${scene}-changes-${width}-${theme}`)
          if (scene.startsWith('new')) await shoot(app.page.getByRole('button', { name: 'Apply', exact: true }), `${scene}-changes-${width}-${theme}`)
        }
      }
    }
  }
}, 240_000)


it('repairs a left-out card through its Restore press and the same checked preview', async () => {
  await open('roles')
  await app.page.locator('[data-left-out-roles] article').getByRole('link', { name: 'Restore', exact: true }).click()
  await app.page.locator('[data-added-role]').waitFor()
  await app.page.locator('.added-choice').filter({ hasText: 'Made-up missing power' }).locator('input').click()
  expect(await app.page.locator('.added-choice').filter({ hasText: 'Made-up missing power' }).count()).toBe(0)
  await app.page.locator('.added-choice').filter({ hasText: 'Reading everything' }).locator('input').check()
  await preview()
  expect(await app.page.locator('[data-role-preview]').innerText()).toContain('Only the person gives this card.')
  await apply()
  expect((await cards()).leftOut).toEqual([])
  const roles = await (await fetch(app.api + '/api/roles', { headers })).json()
  expect(roles.cards.find((one: { name: string }) => one.name === 'forgotten-archive')).toMatchObject({ source: 'added', powers: ['Reading everything'] })
}, 60_000)
