// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { beforeAll, afterAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, freshDb, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { SidebarArrangement } from '../src/shared/sidebar-arrangement.ts'
import type { SidebarSetting } from '../src/server/lib/sidebar.ts'
let app: LiveApp
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
async function initialise(page: Page) {
  await page.addInitScript(({ id }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id })); localStorage.setItem('mole-office.workspace', 'made-up-sidebar-project'); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { id: THE_TEST_OFFICES_OWNER.id })
}
async function read(): Promise<SidebarSetting> { const r = await fetch(app.api + '/api/sidebar', { headers }); expect(r.status).toBe(200); return r.json() }
async function write(arrangement: SidebarArrangement) { const r = await fetch(app.api + '/api/sidebar', { method: 'POST', headers, body: JSON.stringify({ version: (await read()).version, arrangement, because: 'Made-up browser arrangement' }) }); expect(r.status, await r.clone().text()).toBe(200) }
async function open(page: Page, route: string, theme = 'light', inspect = false) { await page.goto(app.site + `/?lang=en&look=${theme}&mode=${inspect ? 'inspect' : 'normal'}#/${route}`); await waitForThePage(page, 60_000); if (route === 'settings/sidebar') { expect(await page.locator('[data-sidebar-arrangement]').count(), (await page.locator('body').innerText()).slice(0,3500)).toBe(1); await editTheArrangement(page) } }
/**
 * The old Settings address leads to the sidebar arrangement page, which opens as a reading with no box, no dropdown and
 * no fieldset; its Edit press leads to the controls (wave 13y round 125, the decision in message ypSj7D2-j2bA).
 */
async function editTheArrangement(page: Page) {
  await expect.poll(() => new URL(page.url()).hash).toBe('#/sidebar-arrangement')
  const panel = page.locator('[data-sidebar-arrangement]')
  expect(await panel.locator('[data-sidebar-group] .sa-page').count()).toBeGreaterThan(0)
  expect(await panel.locator('select, input, textarea, fieldset').count()).toBe(0)
  await page.locator('.pfs').getByRole('link', { name: 'Edit', exact: true }).click()
  await expect.poll(() => new URL(page.url()).hash).toBe('#/sidebar-arrangement/edit')
  // The bar changes at the press, and the page is drawn again for the new address only after it.
  await waitForThePage(page, 60_000)
  expect(await panel.locator('[data-sidebar-group] select').count()).toBeGreaterThan(0)
}
async function cards(page: Page) { return page.locator('.px-category-card').evaluateAll(all => all.map(one => one.getAttribute('href'))) }
const originalOwnerName = process.env.MOLE_OFFICE_OWNER_NAME
beforeAll(async () => {
  process.env.MOLE_OFFICE_OWNER_NAME = 'Made-up caretaker'
  app = await liveApp({ name: 'shared-sidebar-arrangement', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await initialise(app.page)
  const r = await fetch(app.api + '/api/workspaces', { method: 'POST', headers, body: JSON.stringify({ id: 'made-up-sidebar-project', title: 'Made-up Fern Workshop' }) })
  expect(r.status).toBe(201)
  const module = await fetch(app.api + '/api/records', { method: 'POST', headers: { ...headers, 'x-mole-office-workspace': 'made-up-sidebar-project' }, body: JSON.stringify({ kind: 'module', title: 'Made-up water timer', data: {} }) })
  expect(module.status).toBe(201)
}, 240_000)
afterAll(async () => { await app?.stop(); if (originalOwnerName === undefined) delete process.env.MOLE_OFFICE_OWNER_NAME; else process.env.MOLE_OFFICE_OWNER_NAME = originalOwnerName }, 120_000)

it('a preview and Apply on the sidebar arrangement page reach the rail, both category pages, the moved page path and the top bar in another open browser', async () => {
  const context = await app.browser.newContext()
  try {
    const other = await context.newPage(); await initialise(other)
    await open(other, 'office'); const before = await cards(other)
    await open(app.page, 'settings/sidebar')
    const panel = app.page.locator('[data-sidebar-arrangement]')
    expect(await panel.locator('[data-sidebar-group="developer"]').count()).toBe(0)
    // Wave 13r round 5, item 2. Criterion change: a page shipped in All projects may leave it, so its
    // picker offers every group but This project; Developer is offered only in developer mode.
    // Test change (wave 13y round 165, the explaining lines): no group draws a rule in words; the picker's offer below
    // is what says where a page may go.
    expect(await panel.locator('[data-sidebar-group-rule]').count()).toBe(0)
    expect(await panel.locator('[data-sidebar-page="flows"] option').allTextContents()).toEqual(['All projects', 'Agents', 'Office'])
    // Native selects and buttons are keyboard controls. Empty Agents and move its first page to Office first.
    const agents = (await read()).arrangement.groups.find(group => group.key === 'agents')!.keys
    for (const key of agents) await panel.locator(`[data-sidebar-page="${key}"] select`).selectOption('office')
    await panel.getByRole('button', { name: 'Move Office flows up', exact: true }).focus(); await app.page.keyboard.press('Enter')
    const original = await read()
    await panel.getByRole('button', { name: 'Preview', exact: true }).click()
    const preview = panel.locator('[data-sidebar-preview]')
    await expect.poll(() => preview.innerText()).toContain('Agents will be empty')
    expect(await preview.getByRole('heading', { name: 'Page moves', exact: true }).count()).toBe(1)
    expect(await preview.locator('h4').allTextContents()).toEqual(['Reminders', 'Page moves'])
    expect(await preview.innerText()).toContain('Agents at work: from 1st in Agents')
    const words = createI18n('en')
    expect(await preview.innerText()).toContain(words.t('sidebarSetting.moveWithin', {
      page: words.t('nav.flows'), before: '13th', after: '12th', to: words.t('nav.allProjects'),
    }))
    expect((await read()).version).toBe(original.version)
    await panel.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up shared navigation proof')
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(() => read().then(row => row.arrangement.groups.find(group => group.key === 'agents')!.keys.length)).toBe(0)
    const saved = await read(), office = saved.arrangement.groups.find(group => group.key === 'office')!
    const routes: Record<string, string> = { embassy: '#/embassy', regulations: '#/regulations', gates: '#/gates', readiness: '#/readiness', signingPackages: '#/signing-packages', versionHistory: '#/version-history', working: '#/agents-at-work', interrupted: '#/interrupted', agents: '#/conversations', tasksToTake: '#/tasks-to-take', roles: '#/roles', casting: '#/casting', toolset: '#/toolset', honourBoard: '#/honour-board' }
    const expected = office.keys.map(key => routes[key])
    await expect.poll(() => cards(other), { timeout: 20_000 }).toEqual(expected)
    expect(await cards(other)).not.toEqual(before)
    // Test change (wave 13y round 165): the arrangement's groups are drawn on All pages, not in the sidebar, and Checklists
    // stands in front of the sidebar, so it is not listed there beside Flows. The order is read from the stored arrangement.
    await open(other, 'all-pages')
    await expect.poll(() => other.locator('#main .ap-group[data-group="office"] a.ap-page').evaluateAll(all => all.map(one => one.getAttribute('href'))), { timeout: 20_000 }).toEqual(expected)
    const allKeys = saved.arrangement.groups.find(group => group.key === 'all')!.keys
    expect(await other.locator('#main .ap-group[data-group="all"] a.ap-page[href="#/flows"]').count()).toBe(1)
    expect(allKeys.indexOf('flows')).toBeLessThan(allKeys.indexOf('checklists'))
    await open(other, 'agents'); expect(await cards(other)).toEqual([])
    await open(other, 'working'); expect(await other.locator('.px-crumbs a').getAttribute('href')).toBe('#/office')
    expect(await other.locator('.px-tabs a').evaluateAll(all => all.map(one => one.getAttribute('href')))).toEqual(expected)
    await open(other, 'flows'); expect(await other.locator('.shell-bar-project').count()).toBe(0)
    await open(other, 'modules'); expect(await other.locator('.shell-bar-project').textContent()).toBe('Made-up Fern Workshop')
    // History restore opens the same preview, and the owner restores through presses alone.
    await panel.getByRole('button', { name: 'Restore the shipped arrangement', exact: true }).click()
    await expect.poll(() => preview.innerText()).toContain('This arrangement can be applied')
    await panel.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up shipped navigation proof')
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(() => read().then(row => row.changed)).toBe(false)
    await panel.getByText('History', { exact: true }).click()
    await expect.poll(() => panel.getByRole('button', { name: 'Put back', exact: true }).count()).toBe(2)
    await panel.getByRole('button', { name: 'Put back', exact: true }).last().click()
    await expect.poll(() => preview.innerText()).toContain('Agents will be empty')
    await panel.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up history return')
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(() => read().then(row => row.arrangement)).toEqual(saved.arrangement)
    await open(app.page, 'settings/sidebar', 'light', true)
    expect(await app.page.locator('[data-sidebar-group="developer"]').count()).toBe(1)
    expect(await app.page.locator('[data-sidebar-page="roles"] option').allTextContents()).toContain('Developer')
    const emptyProject = structuredClone((await read()).arrangement) as { groups: { key: string; keys: string[] }[] }
    emptyProject.groups[3]!.keys.push(...emptyProject.groups[1]!.keys.splice(0)); await write(emptyProject)
    await open(other, 'project'); expect(await cards(other)).toEqual([])
    expect(await other.locator('.px-category-sides').count()).toBe(0)
    expect(await other.getByText('Made-up water timer', { exact: true }).count()).toBe(0)
  } finally { await context.close() }
}, 180_000)

it('a refused stored arrangement is never drawn, names its problems in the rail and on the sidebar arrangement page, and restores by a press', async () => {
  const db = await freshDb()
  db.client.sqlite.prepare('INSERT INTO runtime_settings(name,value) VALUES (?,?)').run('office.sidebar', JSON.stringify({ groups: [{ key: 'office', keys: ['made-up-removed-page'] }] }))
  const recovery = await liveApp({ name: 'refused-sidebar-recovery', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  try {
    const page = recovery.page
    await page.goto(recovery.site + '/?lang=en&mode=normal#/office'); await waitForThePage(page, 60_000)
    expect(await cards(page)).toEqual(['#/embassy', '#/regulations', '#/gates', '#/readiness', '#/signing-packages', '#/version-history'])
    // The sidebar's arrangement has a page of its own since wave 13y round 125, and the link leads straight to it.
    const link = page.locator('.shell-nav a[href="#/sidebar-arrangement"]')
    expect(await link.textContent()).toBe('The saved sidebar cannot be used. Open Sidebar settings.')
    await link.click()
    const panel = page.locator('[data-sidebar-arrangement]')
    await panel.locator('[data-sidebar-recovery]').waitFor()
    expect(await panel.innerText()).toContain('made-up-removed-page')
    // The notice is read on the reading, and the press that restores is behind Edit, with the notice still drawn.
    await editTheArrangement(page)
    expect(await panel.innerText()).toContain('made-up-removed-page')
    await panel.getByRole('button', { name: 'Restore the shipped arrangement', exact: true }).click()
    await expect.poll(() => panel.locator('[data-sidebar-preview]').innerText()).toContain('This arrangement can be applied')
    await panel.getByLabel('Why change the sidebar?', { exact: true }).fill('Made-up recovery press')
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(async () => (await (await fetch(recovery.api + '/api/sidebar')).json()).storedButNotUsed).toBe(null)
    await expect.poll(() => link.count()).toBe(0)
  } finally { await recovery.stop(); db.close() }
}, 180_000)

it('a failed first sidebar read stops the browser start and names the failure', async () => {
  const page = await app.context.newPage()
  try {
    await page.route('**/api/sidebar', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Made-up sidebar read failure.' }) }))
    await page.goto(app.site + '/?lang=en&mode=normal#/office')
    await expect.poll(() => page.locator('#root').textContent(), { timeout: 15_000 }).toBe('Made-up sidebar read failure.')
    expect(await page.locator('.shell-nav').count()).toBe(0)
  } finally { await page.close() }
}, 60_000)
