// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOP BAR NAMES A PROJECT ONLY OVER A PAGE THAT READS ONE. Wave 13r round 5, item 2: a decision of the owner's,
 * the owner's example in a decision, and cYujzIgA5iBQ and yreP4qPJlY0e.
 *
 * THE OLD RULE: a page could not move into or out of All projects, and the top bar named no project over a page in
 * that group (plan 7FEOshq3mBGG row F1). THE NEW RULE: a page shipped in All projects may move to any group except This
 * project, and back. The top bar reads each page's own mark, `everyProject` on its sidebar row, and not its group,
 * because the group can now change while what the page reads does not. Home and Notes read every project and carry
 * the mark, so their bars are unchanged. Roles, Casting, Regulations, Embassy, Readiness, Worlds, Terminals and
 * Settings carry the mark too, and stood in other groups, so their bars stop naming a project.
 *
 * In a test office with one made-up project, in a real browser:
 *   1. Flows moved into Developer is accepted, and its bar names no project. Modules reads one project and names it.
 *   2. Each page with the mark names no project, wherever it stands.
 *   3. Home moved out of All projects keeps the chat's entry in All projects.
 *
 * TEST CHANGE (wave 13y round 165): the arrangement's groups are drawn on the All pages page, and the sidebar draws
 * a fixed list in front, Home and the chat's entry among them. So a moved page is looked for on All pages, and case 3
 * checks that Home and the chat's entry stay in front and Home is not listed on All pages.
 *
 * The bar is drawn only below 1024 pixels, so each case opens its page at 390.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { SidebarArrangement } from '../src/shared/sidebar-arrangement.ts'
import type { SidebarSetting } from '../src/server/lib/sidebar.ts'

let app: LiveApp
const PROJECT = { id: 'made-up-top-bar-project', title: 'Made-up Alder Workshop' }
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
/** Every page whose sidebar row carries the mark and that stood outside All projects before this round. */
const MARKED_ELSEWHERE = ['roles', 'casting', 'regulations', 'embassy', 'readiness', 'worlds', 'terminals', 'settings']
const originalOwnerName = process.env.MOLE_OFFICE_OWNER_NAME

async function initialise(page: Page) {
  await page.addInitScript(({ id, project }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id })); localStorage.setItem('mole-office.workspace', project); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { id: THE_TEST_OFFICES_OWNER.id, project: PROJECT.id })
}
async function read(): Promise<SidebarSetting> { const r = await fetch(app.api + '/api/sidebar', { headers }); expect(r.status).toBe(200); return r.json() }
async function write(arrangement: SidebarArrangement) {
  const r = await fetch(app.api + '/api/sidebar', { method: 'POST', headers, body: JSON.stringify({ version: (await read()).version, arrangement, because: 'Made-up top bar proof' }) })
  expect(r.status, await r.clone().text()).toBe(200)
}
let shipped: SidebarArrangement
function moved(page: string, to: string): SidebarArrangement {
  return { groups: shipped.groups.map(group => ({ key: group.key, keys: [...group.keys.filter(key => key !== page), ...(group.key === to ? [page] : [])] })) }
}
async function open(page: Page, route: string, theme = 'light', mode: 'normal' | 'inspect' = 'normal') {
  await page.goto(app.site + `/?lang=en&look=${theme}&mode=${mode}#/${route}`)
  await waitForThePage(page, 60_000)
}
/** The bar's own words for the page, and the project it names, or null when it names none. */
async function bar(page: Page): Promise<{ page: string | null; project: string | null }> {
  await page.locator('.shell-bar-page').waitFor({ state: 'attached' })
  const project = page.locator('.shell-bar-project')
  return { page: await page.locator('.shell-bar-page').textContent(), project: await project.count() === 0 ? null : await project.textContent() }
}
/** All pages has read the stored arrangement once the moved page stands in its new group there. */
async function placed(page: Page, key: string, group: string) {
  await expect.poll(() => page.locator(`#main .ap-group[data-group="${group}"] a.ap-page[href="#/${key}"]`).count(), { timeout: 20_000 }).toBe(1)
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_OWNER_NAME = 'Made-up caretaker'
  app = await liveApp({ name: 'top-bar-reads-the-mark', workspace: 'default', viewport: { width: 390, height: 900 } })
  await initialise(app.page)
  const made = await fetch(app.api + '/api/workspaces', { method: 'POST', headers, body: JSON.stringify(PROJECT) })
  expect(made.status, await made.clone().text()).toBe(201)
  const module = await fetch(app.api + '/api/records', { method: 'POST', headers: { ...headers, 'x-mole-office-workspace': PROJECT.id }, body: JSON.stringify({ kind: 'module', title: 'Made-up rain gauge', data: {} }) })
  expect(module.status).toBe(201)
  shipped = (await read()).shipped
}, 240_000)
afterAll(async () => { await app?.stop(); if (originalOwnerName === undefined) delete process.env.MOLE_OFFICE_OWNER_NAME; else process.env.MOLE_OFFICE_OWNER_NAME = originalOwnerName }, 120_000)

it('accepts Flows into Developer, names no project over it, and names the project over Modules', async () => {
  const page = app.page
  await page.setViewportSize({ width: 390, height: 900 })
  await write(moved('flows', 'developer'))
  await open(page, 'all-pages', 'light', 'inspect')
  await placed(page, 'flows', 'developer')
  await open(page, 'flows', 'light', 'inspect')
  expect(await bar(page)).toEqual({ page: 'Flows', project: null })
  // The control: a page that reads one project names it, so a bar that names nothing anywhere cannot pass.
  await open(page, 'modules')
  await expect.poll(() => bar(page), { timeout: 20_000 }).toEqual({ page: 'Modules', project: PROJECT.title })
  await write(shipped)
}, 120_000)

it('names no project over Home, Notes and the eight marked pages that stand in other groups', async () => {
  const page = app.page
  await page.setViewportSize({ width: 390, height: 900 })
  for (const route of ['', 'notes', ...MARKED_ELSEWHERE]) {
    await open(page, route)
    expect((await bar(page)).project, `#/${route} names a project in the top bar`).toBeNull()
  }
}, 180_000)

it('keeps the chat entry in All projects when Home moves to Office', async () => {
  const page = app.page
  await page.setViewportSize({ width: 1440, height: 900 })
  await write(moved('home', 'office'))
  await open(page, 'all-pages')
  await page.locator('#main .ap-group').first().waitFor({ timeout: 20_000 })
  expect(await page.locator('#main a.ap-page[href="#/"]').count()).toBe(0)
  expect(await page.locator('#shell-side a.shell-link[href="#/"]').count()).toBe(1)
  expect(await page.locator('#shell-side .shell-chat').count()).toBe(1)
  expect(await page.locator('.shell-chat').count()).toBe(1)
  await page.setViewportSize({ width: 390, height: 900 })
  await open(page, '')
  expect(await bar(page)).toEqual({ page: 'Home', project: null })
  await write(shipped)
}, 120_000)
