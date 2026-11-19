// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOP BAR NAMES NO PROJECT OVER NEEDS YOU. Wave 13r round 6, item 4: message 8NsXCjJEaqQR item 4, and
 * GLtVd7noWIDe on how; the owner's decision; and a second decision.
 *
 * THE OLD RULE: the top bar read only the `everyProject` mark on the page's sidebar row, so a page
 * with no row was read as reading the selected project. Needs you reads every project and has no row —
 * that decision moved Home's sections to pages opened by a press on Home and from no sidebar row — so over #/needs-you
 * the bar named the selected project, which the page does not read.
 *
 * THE NEW RULE: a page that reads every project and has no row to carry the mark stands in
 * EVERY_PROJECT_PAGES_WITHOUT_A_ROW beside DESTINATIONS in src/web/components/Sidebar.tsx, and the top
 * bar names no project over a page in that list. A page is in the list or carries the mark on its row,
 * never both. GLtVd7noWIDe keeps the mark on the page rather than giving Needs you a row, so the
 * sidebar draws exactly what it drew before.
 *
 * WHY: 8NsXCjJEaqQR item 4 says the Needs you page reads every project, so it gets the mark,
 * and a decision holds that a page must never show a project it does not read. GLtVd7noWIDe
 * says how: keep the mark on the page, and the sidebar does not change.
 *
 * In a real browser at 390 wide, with the made-up project selected:
 *   1. over #/needs-you the bar draws the page's own title and draws no `.shell-bar-project`;
 *   2. over #/modules, which reads one project, the bar still names the made-up project: the control
 *      that the bar works;
 *   3. the list holds needsyou, every page in it has no row in DESTINATIONS, and over every page in it
 *      the bar draws the page's own title and names no project.
 * The third case reads the list from Sidebar.tsx and does not copy it. It held exactly ['needsyou']
 * until another line gave the sidebar's arrangement a page with no row, and the copy went red while the
 * rule still held. A page added to the list now gets the same check as Needs you.
 *
 * Set W13R_NEEDS_YOU_BAR_SHOTS to a folder to photograph the bar over Needs you at 1440, 990, 660 and
 * 390 wide in both looks. The bar is drawn only below 1024 pixels, so the 1440 and 990 pictures show
 * the page and no bar. Without it, the case checks 1440 and 390 in the light look: one width each side
 * of 1024, and the dark look sets colour and shadow only.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
let S: typeof import('../src/web/components/Sidebar.tsx')
let R: typeof import('../src/web/components/router.tsx')
const PROJECT = { id: 'made-up-needs-you-project', title: 'Made-up Alder Workshop' }
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const folder = process.env.W13R_NEEDS_YOU_BAR_SHOTS
const originalOwnerName = process.env.MOLE_OFFICE_OWNER_NAME

async function initialise(page: Page) {
  await page.addInitScript(({ id, project }) => { localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id })); localStorage.setItem('mole-office.workspace', project); localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light') }, { id: THE_TEST_OFFICES_OWNER.id, project: PROJECT.id })
}
async function open(page: Page, route: string, theme = 'light') {
  await page.goto(app.site + `/?lang=en&look=${theme}#/${route}`)
  await waitForThePage(page, 60_000)
}
/** The bar's own words for the page, and the project it names, or null when it names none. */
async function bar(page: Page): Promise<{ page: string | null; project: string | null }> {
  await page.locator('.shell-bar-page').waitFor({ state: 'attached' })
  const project = page.locator('.shell-bar-project')
  return { page: await page.locator('.shell-bar-page').textContent(), project: await project.count() === 0 ? null : await project.textContent() }
}
async function shot(name: string, page: Page, width: number, theme: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' fits ' + width).toBe(true)
  if (folder) await page.screenshot({ path: `${folder}/${name}-${width}-${theme}.png` })
}
/** The made-up label, put into the page under the bar immediately above the block the picture shows. */
async function label(page: Page, above: Locator, called: string) {
  await putTheMadeUpLabelIn(page, 'Made-up test office — the top bar over Needs you', above, called)
}
/**
 * The list the code adds. It is read through a cast because the criterion commit must typecheck before
 * the export exists: this test is what asks for it, and the runtime check below is what proves it.
 */
function everyProjectPagesWithoutARow(): readonly string[] | undefined {
  return (S as unknown as { EVERY_PROJECT_PAGES_WITHOUT_A_ROW?: readonly string[] }).EVERY_PROJECT_PAGES_WITHOUT_A_ROW
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_OWNER_NAME = 'Made-up caretaker'
  const store = new Map<string, string>(), storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) }
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: storage, location: { hash: '' }, addEventListener: () => {}, removeEventListener: () => {} } })
  S = await import('../src/web/components/Sidebar.tsx')
  R = await import('../src/web/components/router.tsx')
  app = await liveApp({ name: 'the-top-bar-over-needs-you', workspace: 'default', viewport: { width: 390, height: 900 } })
  await initialise(app.page)
  const made = await fetch(app.api + '/api/workspaces', { method: 'POST', headers, body: JSON.stringify(PROJECT) })
  expect(made.status, await made.clone().text()).toBe(201)
  if (folder) mkdirSync(folder, { recursive: true })
}, 240_000)
afterAll(async () => { await app?.stop(); if (originalOwnerName === undefined) delete process.env.MOLE_OFFICE_OWNER_NAME; else process.env.MOLE_OFFICE_OWNER_NAME = originalOwnerName }, 120_000)

it('names no project over Needs you, and draws the page its own title', async () => {
  const page = app.page
  await page.setViewportSize({ width: 390, height: 900 })
  await open(page, 'needs-you')
  await expect.poll(() => bar(page), { timeout: 20_000 }).toEqual({ page: 'Needs you', project: null })
}, 120_000)

it('still names the made-up project over Modules, which reads one project', async () => {
  const page = app.page
  await page.setViewportSize({ width: 390, height: 900 })
  await open(page, 'modules')
  await expect.poll(() => bar(page), { timeout: 20_000 }).toEqual({ page: 'Modules', project: PROJECT.title })
}, 120_000)

it('keeps the mark for the pages that read every project and have no row, and names no project over any of them', async () => {
  const list = everyProjectPagesWithoutARow()
  expect(list, 'Sidebar.tsx exports no EVERY_PROJECT_PAGES_WITHOUT_A_ROW').toBeDefined()
  expect(list, 'Needs you left the list, so the bar names a project over it').toContain('needsyou')
  const page = app.page
  await page.setViewportSize({ width: 390, height: 900 })
  for (const name of list ?? []) {
    expect(S.DESTINATIONS.some((row) => row.page === name), `${name} is in the list and DESTINATIONS has a row for it: the mark belongs on the row alone`).toBe(false)
    await open(page, R.pathFor(name as Parameters<typeof R.pathFor>[0]).slice(1))
    await expect.poll(() => bar(page), { timeout: 20_000 }).toEqual({ page: S.pageTitle(name as Parameters<typeof S.pageTitle>[0]), project: null })
  }
}, 240_000)

it('pictures the bar over Needs you at 1440 and 390 in the light look, and at four widths in both looks when photographing', async () => {
  const page = app.page
  const widths = folder ? [1440, 990, 660, 390] : [1440, 390]
  const themes: readonly ('light' | 'dark')[] = folder ? ['light', 'dark'] : ['light']
  for (const width of widths) for (const theme of themes) {
    await page.setViewportSize({ width, height: 900 })
    await open(page, 'needs-you', theme)
    await label(page, page.locator('#main > *').first(), 'the Needs you page')
    await shot('bar-needs-you', page, width, theme)
    await takeTheMadeUpLabelOut(page)
    expect.soft((await bar(page)).project, `#/needs-you at ${width} in ${theme} names a project`).toBeNull()
    expect.soft((await bar(page)).page, `#/needs-you at ${width} in ${theme}`).toBe('Needs you')
  }
}, 600_000)
