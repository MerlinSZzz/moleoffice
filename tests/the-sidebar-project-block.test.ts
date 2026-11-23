// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR'S PROJECT BLOCK AND ITS FOOT, wave 13q round 12 (R12a), on proposal
 * vVPo6PUlGNB- block b-4.
 *
 * - The project's pages are first-level rows in a marked block under All projects, always shown.
 *   Criterion change (wave 13q round 14): they were ten; Goals, Counters, Context bundles and All records now
 *   stand under All projects through a decision, so six remain.
 *   One list decides which pages stand there: the `project` group of the effective railGroups(). The block, the
 *   project's own page and the tabs above its pages all read it.
 * - The Switch press opens the list of projects downward, the current one ticked.
 * - Nothing in the sidebar opens upward. The foot is fixed: the owner's initial and name, a light or dark
 *   switch and Settings. Settings is in no group, so the Office page has no card for it.
 * - The foot's switch writes the same stored theme the look controls on the Settings page write.
 * - When developer mode makes the page write as an agent, the foot says so in words.
 *
 * The browser half runs in a test office with made-up projects and a made-up name for the person.
 *
 * Test change (wave 13y round 165): the block stands in the sidebar again, below the pages in front and above All
 * pages, on that round's answer. It draws a row only for a project page the person pinned, so with nothing kept it
 * draws none, and the project's pages are listed under This project on All pages. The narrow press now stands in the
 * foot.
 *
 * Test change (wave 13y round 175, as decided): the Switch's list is drawn as a layer over the page and no longer in
 * the sidebar's flow, so it ends where the window ends, not where the block ends. It still stands in the block, below
 * its press, and the block keeps its height when the list opens.
 */
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { switchTheProject, theProjectIdOnScreen, theProjectOnScreen, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type CategoryModule = typeof import('../src/web/pages/CategoryPage.tsx')
type AllPagesModule = typeof import('../src/web/pages/AllPagesPage.tsx')
let S: SidebarModule
let C: CategoryModule
let A: AllPagesModule

// Criterion change (wave 13p round 30): the merge queue page stands after Pipelines, by a
// decision.
// Criterion change (wave 13q round 44): Messages is no longer one of them, by a decision.
// Criterion change of 13 November 2026: `board` joined after `pipeline`, because package BV added the Board page to the
// project group in src/shared/sidebar-arrangement.ts.
const PROJECT_PAGES = ['modules', 'pipeline', 'board', 'mergequeue', 'findings', 'ideas', 'shelved']
const PERSON = 'Robin Vale'
const PROJECTS = [
  { id: 'test-orchard', title: 'Orchard Lamps' },
  { id: 'test-kiln', title: 'Kiln Diary' },
]
const en = createI18n('en')

function withoutStyles(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

function drawSidebar(): string {
  return withoutStyles(renderToStaticMarkup(h(S.Sidebar, {
    page: 'modules' as const,
    open: false,
    onClose: () => {},
    onRenamed: () => {},
    attention: { status: 'loading' as const },
    waiting: { status: 'loading' as const },
    sight: { id: 'test-orchard', title: 'Orchard Lamps', named: true, what: '', fault: null },
    workspaces: { status: 'loading' as const },
  })))
}

/** The All pages page, which lists the project's pages under This project. */
function drawAllPages(): string {
  return withoutStyles(renderToStaticMarkup(h(A.AllPagesPage, {
    sight: { id: 'test-orchard', title: 'Orchard Lamps', named: true, what: '', fault: null },
  })))
}

describe('one list decides the project block', () => {
  beforeAll(async () => {
    S = await import('../src/web/components/Sidebar.tsx')
    C = await import('../src/web/pages/CategoryPage.tsx')
    A = await import('../src/web/pages/AllPagesPage.tsx')
  })

  // Test change (wave 13y round 165): the block stands below the pages in front and draws no row with nothing pinned.
  // The project's pages are listed on All pages, in the project group's order.
  it('lists the project’s pages from the project group and from nowhere else, and draws the block in the sidebar', () => {
    const group = S.SHIPPED_RAIL_GROUPS.find((one) => one.key === 'project')
    expect(group?.keys).toEqual(PROJECT_PAGES)
    const rows = S.groupRows(group!)
    // The sidebar draws the block below the pages in front and above All pages, with no row in it.
    const html = drawSidebar()
    expect(html).toContain('class="sbp-block"')
    const block = html.slice(html.indexOf('class="sbp-block"'), html.indexOf('</section>', html.indexOf('class="sbp-block"')))
    expect(block).not.toContain('class="shell-link"')
    expect(html.indexOf('class="shell-list"')).toBeLessThan(html.indexOf('class="sbp-block"'))
    expect(html.indexOf('class="sbp-block"')).toBeLessThan(html.indexOf('shell-all-pages'))
    // All pages lists the project's pages under This project, in that order, and draws no block.
    const all = drawAllPages()
    const section = all.slice(all.indexOf('data-group="project"'), all.indexOf('</section>', all.indexOf('data-group="project"')))
    expect([...section.matchAll(/class="ap-page" href="([^"]+)"/g)].map((match) => match[1])).toEqual(rows.map((row) => `#${row.to}`))
    expect(all).not.toContain('class="sbp-block"')
    // The project's own page and the tabs above each of its pages read the same list.
    const page = withoutStyles(renderToStaticMarkup(h(C.CategoryPage, { category: 'project', caption: 'Orchard Lamps' })))
    expect([...page.matchAll(/data-card="([^"]+)"/g)].map((match) => match[1])).toEqual(PROJECT_PAGES)
    const tabs = withoutStyles(renderToStaticMarkup(h(C.WhereThisPageIs, { page: 'modules', project: 'Orchard Lamps' })))
    const tabHrefs = [...tabs.slice(tabs.indexOf('px-tabs')).matchAll(/href="([^"]+)"/g)].map((match) => match[1])
    expect(tabHrefs).toEqual(rows.map((row) => `#${row.to}`))
  })

  it('puts Settings at the foot and in no group, so the Office page has no card for it', () => {
    expect(S.SHIPPED_RAIL_GROUPS.filter((group) => group.keys.includes('settings'))).toEqual([])
    const html = drawSidebar()
    expect(html.indexOf('href="#/settings"')).toBeGreaterThan(html.indexOf('class="sbp-foot"'))
    const office = withoutStyles(renderToStaticMarkup(h(C.CategoryPage, { category: 'office', caption: 'Office' })))
    // Criterion change (wave 13u round 15): the readiness checklists page, built in round 13, stands in the
    // Office group, so the page has a card for it too.
    // Criterion change (wave 13k round 54): the signing packages page (backlog 10, from two decisions) stands
    // beside readiness in the Office group, so it has a card as well.
    // Criterion change (wave 13y round 125): Gates left Settings for a page in the Office group, after Office
    // regulations (the decision in message 068zuX0EZMQu), so it has a card there too.
    expect([...office.matchAll(/data-card="([^"]+)"/g)].map((match) => match[1])).toEqual(['embassy', 'regulations', 'gates', 'readiness', 'signingPackages', 'versionHistory'])
  })
})

describe('the block and the foot in a browser', () => {
  let app: LiveApp

  beforeAll(async () => {
    app = await liveApp({ name: 'sidebar-project-block', workspace: 'default', viewport: { width: 1440, height: 900 } })
    // THE SWITCH LIST'S OPENING AND CLOSING ARE ANIMATIONS. This case reads whether it is on screen
    // after the press that closed it, so the animation is off and the list is where it ends.
    await app.page.emulateMedia({ reducedMotion: 'reduce' })
    const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    for (const project of PROJECTS) {
      const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify(project) })
      expect(made.status, await made.text()).toBe(201)
    }
    const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ name: PERSON }) })
    expect(named.status, await named.text()).toBe(200)
    await app.page.addInitScript(() => {
      if (sessionStorage.getItem('test.seeded') === null) {
        localStorage.setItem('mole-office.workspace', 'test-orchard')
        localStorage.setItem('mole-office.preset.theme', 'light')
        sessionStorage.setItem('test.seeded', '1')
      }
    })
  }, 240_000)

  afterAll(async () => { await app?.stop() })

  // A LOAD EVERY TIME. Going to the same address with a hash is a move inside the page, not a load,
  // so each open carries a number of its own.
  let loads = 0
  async function open(query: string, address: string, width = 1440): Promise<void> {
    await app.page.setViewportSize({ width, height: 900 })
    loads += 1
    await app.page.goto(`${app.site}/?${query}&load=${String(loads)}#${address}`)
    await waitForThePage(app.page, 30_000)
    await waitForTheProjects(app.page)
  }

  // Test change (wave 13y round 165): with nothing pinned the block draws no row, so the list is not measured against
  // one here. each-person-pins-the-pages-in-front measures it against a pinned row.
  // Test change (wave 13y round 175, as decided): the list is a layer, so it is held to the window and the block's
  // height, not to the block's bottom.
  it('opens the Switch list downward as a layer inside the window, with the current project ticked', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    expect(await page.locator('.sbp-choices').isVisible()).toBe(false)
    const closedBlock = await page.locator('.sbp-block').evaluate((one) => one.getBoundingClientRect().height)
    await page.locator('.sbp-switch').click()
    await page.locator('.sbp-choices').waitFor()
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      return {
        inside: document.querySelector('.sbp-block')!.contains(document.querySelector('.sbp-choices')),
        block: box('.sbp-block'),
        press: box('.sbp-switch'),
        list: box('.sbp-choices'),
        window: { width: window.innerWidth, height: window.innerHeight },
      }
    })
    expect(boxes.inside).toBe(true)
    expect(boxes.list.top).toBeGreaterThanOrEqual(boxes.press.bottom)
    expect(boxes.block.height, 'the block keeps its height with the list open').toBe(closedBlock)
    expect(boxes.list.left, 'the list within the window').toBeGreaterThanOrEqual(0)
    expect(boxes.list.right, 'the list within the window').toBeLessThanOrEqual(boxes.window.width)
    expect(boxes.list.bottom, 'the list within the window').toBeLessThanOrEqual(boxes.window.height)
    const ticked = await page.locator('.sbp-choice[aria-current]').evaluateAll((all) => all.map((one) => one.getAttribute('data-project')))
    expect(ticked).toEqual(['test-orchard'])
    expect(await page.locator('.sbp-choice[aria-current] .sbp-tick').count()).toBe(1)
    expect(await page.locator('.sbp-tick').count()).toBe(1)
    await switchTheProject(page, 'test-kiln')
    await page.waitForFunction(() => document.querySelector('.sbp-block')?.getAttribute('data-project') === 'test-kiln')
    expect(await theProjectOnScreen(page)).toBe('Kiln Diary')
    expect(await page.locator('.sbp-choices').isVisible()).toBe(false)
    await switchTheProject(page, 'test-orchard')
    expect(await theProjectIdOnScreen(page)).toBe('test-orchard')
  }, 120_000)

  it('opens nothing upward, at the desk and in the phone menu, and keeps the foot at the bottom', async () => {
    const page = app.page
    for (const width of [1440, 390]) {
      await open('lang=en&mode=inspect', '/modules', width)
      if (width < 1024) await page.locator('.shell-menu').click()
      // Nothing at the foot opens at all.
      // Test change (wave 13y round 165): the narrow press now stands in the foot. It narrows the sidebar and opens
      // nothing, so it is not counted.
      expect(await page.locator('.sbp-foot details, .sbp-foot select, .sbp-foot [aria-expanded]:not(.shell-collapse)').count()).toBe(0)
      // Every fold and the Switch list open below the thing that opens them.
      await page.locator('.sbp-switch').click()
      await page.locator('.sbp-choices').waitFor()
      await page.locator('#shell-side details').evaluateAll((all) => all.forEach((one) => one.setAttribute('open', '')))
      const upward = await page.evaluate(() => {
        const found: string[] = []
        const below = (opener: Element, opened: Element, name: string) => {
          if (opened.getBoundingClientRect().top < opener.getBoundingClientRect().bottom - 1) found.push(name)
        }
        for (const fold of document.querySelectorAll('#shell-side details')) {
          const summary = fold.querySelector(':scope > summary')
          const list = fold.querySelector(':scope > .shell-list')
          if (summary !== null && list !== null) below(summary, list, fold.getAttribute('data-group') ?? 'a fold')
        }
        below(document.querySelector('.sbp-switch')!, document.querySelector('.sbp-choices')!, 'the Switch list')
        return found
      })
      expect(upward, `${String(width)}: these open upward`).toEqual([])
      // The list scrolls on its own and the foot stays where it is.
      const footBefore = await page.locator('.sbp-foot').boundingBox()
      await page.locator('.sbp-scroll').evaluate((one) => one.scrollTo(0, one.scrollHeight))
      const footAfter = await page.locator('.sbp-foot').boundingBox()
      expect(footAfter?.y).toBe(footBefore?.y)
      expect((footAfter?.y ?? 0) + (footAfter?.height ?? 0)).toBeGreaterThan(900 - 40)
      expect(await page.locator('.sbp-foot').isVisible()).toBe(true)
    }
  }, 120_000)

  it('changes the same stored theme the Settings page reads, from the foot and back', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    expect(await page.locator('html').getAttribute('data-theme')).toBe('light')
    // Criterion change (wave 13q round 15): the presses show only an icon, so
    // they are found and read by their names, where they were found and read by their words.
    await page.locator('.sbp-look').getByRole('button', { name: en.t('settingsPanel.look.dark'), exact: true }).click()
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark')
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBe('dark')
    // The look controls on the Settings page show the choice at once, with no reload.
    await page.evaluate(() => { location.hash = '#/settings' })
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.look')
    expect(await page.locator('#preset-theme').inputValue()).toBe('dark')
    // And a choice made there shows at the foot at once.
    await page.selectOption('#preset-theme', 'light')
    expect(await page.locator('.sbp-look-press[aria-pressed="true"]').getAttribute('aria-label')).toBe(en.t('settingsPanel.look.light'))
    await page.reload()
    await waitForThePage(page, 30_000)
    expect(await page.locator('html').getAttribute('data-theme')).toBe('light')
    expect(await page.locator('.sbp-look-press[aria-pressed="true"]').getAttribute('aria-label')).toBe(en.t('settingsPanel.look.light'))
  }, 120_000)

  it('names the owner at the foot, and says so there while developer mode writes as an agent', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    await page.locator('.sbp-person-name', { hasText: PERSON }).waitFor()
    expect(await page.locator('.sbp-disc').textContent()).toBe(PERSON.slice(0, 1))
    expect(await page.locator('.sbp-writer').count()).toBe(0)
    expect(await page.locator('#shell-side').innerText()).not.toContain('Writing as')

    await open('lang=en&mode=inspect', '/settings')
    await openSettingsPanel(page, 'settings.writer')
    await page.selectOption('#settings-writer', 'agent')
    const says = en.t('sidebarProject.writesAs', { name: 'claude (agent)' })
    expect(await page.locator('.sbp-writer').textContent()).toBe(says)
    // The choice is kept in normal mode too, and so is the sentence.
    await open('lang=en&mode=normal', '/modules')
    expect(await page.locator('.sbp-writer').textContent()).toBe(says)
    await open('lang=en&mode=inspect', '/settings')
    await openSettingsPanel(page, 'settings.writer')
    await page.selectOption('#settings-writer', 'human')
    expect(await page.locator('.sbp-writer').count()).toBe(0)
  }, 120_000)

  it("draws the short mark, not a guess, when the owner's name cannot be read", async () => {
    const page = app.page
    await page.route('**/api/participants?shape=page', (route) => route.fulfill({ status: 500, json: { error: `private-location ${THE_TEST_FIXTURE_ROOT}:7711` } }))
    try {
      await open('lang=en', '/modules')
      const mark = page.locator('.sbp-person-name .px-absent')
      await mark.waitFor()
      expect(await mark.getAttribute('title')).toBe(en.t('sidebarProject.nameNotRead'))
      expect(await page.locator('.sbp-foot').innerText()).not.toMatch(/private-location|\/home\/|7711|You\b/)
    } finally {
      await page.unroute('**/api/participants?shape=page')
    }
  }, 120_000)

})
