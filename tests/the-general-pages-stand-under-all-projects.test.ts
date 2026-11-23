// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GOALS, COUNTERS, CONTEXT BUNDLES AND ALL RECORDS STAND UNDER ALL PROJECTS. Wave 13q, round 14
 * (R14a), carried out a decision.
 *
 * Wave 13j's round 14 made the four pages read across projects (report xRyhLFdR64mA). This round
 * moves their sidebar rows out of the project block and under All projects. What this file holds:
 *   1. The four rows stand under All projects, after the rows that were there, and not in the
 *      project block. Criterion change in wave 13q round 44: it said that Messages stays in the
 *      project block; Messages now stands in no group at all.
 *   2. Each of the four opens its page with no project named over it: the phone bar names no
 *      project, and no path or tabs of the project are drawn above it.
 *   3. The This project page has no card for them. Criterion change in round 44: it said the page
 *      keeps its card for Messages; it has no card for Messages now.
 *
 * Test change (wave 13y round 165): the owner's one-style sidebar keeps five pages in front and lists every
 * other page on All pages, in the arrangement's groups, with the project block heading This project. So the
 * four rows and the block are read on All pages, and a page opened from there lights the All pages entry.
 * The block then went back to the sidebar, and draws a row only for a project page the person
 * pinned. So the project's rows are read in This project's group on All pages.
 *
 * The browser half runs in a test office with two made-up projects and a made-up name for the
 * person. Set W13Q_GENERAL_ROWS_SHOTS to a folder to also photograph the sidebar, the This project
 * page and the Counters page at four widths in both looks, at 1440 in Chinese and once in the test
 * language.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type CategoryModule = typeof import('../src/web/pages/CategoryPage.tsx')
type AllPagesModule = typeof import('../src/web/pages/AllPagesPage.tsx')
let S: SidebarModule
let C: CategoryModule
let A: AllPagesModule

/** The four general pages, by their sidebar row's key, in the order they stand. */
const GENERAL = ['horizons', 'counters', 'bundles', 'records'] as const
/** The addresses the four rows open. */
const ADDRESSES = ['#/horizons', '#/counters', '#/bundles', '#/records'] as const
/** The rows that stood under All projects before this round, in their order. */
// Resources joined after Schedule on 8 October 2026 (wave 13s round 30, design peyJSnLoz_Bk).
// Words for you to confirm joined after Decisions on 10 October 2026, in wave 13q round 45.
// Test change (wave 13y round 167, point QN-2 of the quick notes): My notes joined after Reports, as option C's step 6
// picture draws it.
const ALREADY_THERE = [
  'home',
  'decisions',
  'yourWords',
  'notes',
  'myNotes',
  'work',
  'schedule',
  'resources',
  'plans',
]
const PERSON = 'Robin Vale'
const PROJECTS = [
  { id: 'test-heron', title: 'Heron Pottery' },
  { id: 'test-quay', title: 'Quay Bakery' },
]
const shots = process.env['W13Q_GENERAL_ROWS_SHOTS']

function withoutStyles(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

function drawSidebar(page: 'modules' | 'counters'): string {
  return withoutStyles(renderToStaticMarkup(h(S.Sidebar, {
    page,
    open: false,
    onClose: () => {},
    onRenamed: () => {},
    attention: { status: 'loading' as const },
    waiting: { status: 'loading' as const },
    sight: { id: 'test-heron', title: 'Heron Pottery', named: true, what: '', fault: null },
    workspaces: { status: 'loading' as const },
  })))
}

/** The All pages page, which lists every page in the arrangement's groups. */
function drawAllPages(): string {
  return withoutStyles(renderToStaticMarkup(h(A.AllPagesPage, {
    sight: { id: 'test-heron', title: 'Heron Pottery', named: true, what: '', fault: null },
  })))
}

/** The addresses the rows of one part of the drawn All pages page open, in order. */
function hrefsIn(html: string, start: string, end: string): string[] {
  const from = html.indexOf(start)
  expect(from, start).toBeGreaterThan(-1)
  const part = html.slice(from, html.indexOf(end, from))
  return [...part.matchAll(/class="ap-page" href="([^"]+)"/g)].map((match) => match[1] ?? '')
}

describe('the sidebar and the category page, drawn without a browser', () => {
  beforeAll(async () => {
    S = await import('../src/web/components/Sidebar.tsx')
    C = await import('../src/web/pages/CategoryPage.tsx')
    A = await import('../src/web/pages/AllPagesPage.tsx')
  })

  it('stands the four rows under All projects, after the rows already there, and not in the project block', () => {
    const all = S.SHIPPED_RAIL_GROUPS.find((group) => group.key === 'all')
    const project = S.SHIPPED_RAIL_GROUPS.find((group) => group.key === 'project')
    // Checklists joined after Counters on 9 October 2026, in wave 13n round 52.
    // Criterion change (wave 13p round 35): Flows joined after Checklists, the place a
    // decision gave it.
    // Test change (wave 13u round 242, package KN-1): Knowledge joined after Flows, the one new row the knowledge page's drawing drew.
    expect(all?.keys).toEqual([
      ...ALREADY_THERE,
      'horizons',
      'counters',
      'checklists',
      'flows',
      'knowledge',
      'bundles',
      'records',
    ])
    for (const key of GENERAL) expect(project?.keys, key).not.toContain(key)
    // As drawn: the four are rows of the All projects section, and none is a row of This project.
    // Test change (wave 13y round 165): both are drawn on All pages.
    const html = drawAllPages()
    const underAll = hrefsIn(html, 'data-group="all"', '</section>')
    const inTheBlock = hrefsIn(html, 'data-group="project"', '</section>')
    for (const address of ADDRESSES) {
      expect(underAll, address).toContain(address)
      expect(inTheBlock, address).not.toContain(address)
    }
    // Each of the four declares that it spans every project, as every other such row does.
    for (const key of GENERAL) expect(S.DESTINATIONS.find((row) => row.key === key)?.everyProject, key).toBe(true)
  })

  it('puts Messages in no group of the sidebar', () => {
    for (const group of S.SHIPPED_RAIL_GROUPS) expect(group.keys, group.key).not.toContain('messages')
    // Test change (wave 13y round 165): This project's rows are drawn on All pages, and the sidebar leads to no
    // Messages page.
    const block = hrefsIn(drawAllPages(), 'data-group="project"', '</section>')
    expect(block).toContain('#/modules')
    expect(block).not.toContain('#/messages')
    expect(drawSidebar('modules')).not.toContain('href="#/messages"')
  })

  it('draws no card for the four or for Messages on the This project page, and draws no path or tabs over the four', () => {
    const page = withoutStyles(renderToStaticMarkup(h(C.CategoryPage, { category: 'project', caption: 'Heron Pottery' })))
    const cards = [...page.matchAll(/data-card="([^"]+)"/g)].map((match) => match[1])
    for (const key of GENERAL) expect(cards, key).not.toContain(key)
    expect(cards).not.toContain('messages')
    // All projects has no category page, so a page under it has no path and no tabs above it.
    for (const key of GENERAL) {
      const row = S.DESTINATIONS.find((one) => one.key === key)
      const drawn = renderToStaticMarkup(h(C.WhereThisPageIs, { page: row!.page, project: 'Heron Pottery' }))
      expect(drawn, key).toBe('')
    }
  })
})

describe('the four pages in a browser', () => {
  let app: LiveApp

  beforeAll(async () => {
    app = await liveApp({ name: 'general-rows', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const person = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    const post = async (path: string, workspace: string, body: unknown, as: Record<string, string> = person) => {
      const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: { ...as, 'x-mole-office-workspace': workspace }, body: JSON.stringify(body) })
      expect(reply.status, (await reply.text()).slice(0, 300)).toBeLessThan(300)
    }
    await post('/api/agents/started', 'default', { handle: 'kiln-keeper', name: 'The kiln keeper' })
    const keeper = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'kiln-keeper' }
    for (const project of PROJECTS) {
      await post('/api/workspaces', 'default', project)
      await post('/api/records', project.id, { kind: 'idea', title: `${project.title}: try a second glaze`, data: {} })
      await post('/api/records', project.id, { kind: 'module', title: `${project.title}: the front room`, data: {} })
      await post('/api/counters', project.id, {
        title: `${project.title}: batches fired`,
        counts: 'Batches fired this month.',
        triggers: [{ kind: 'count', n: 10 }],
        action: { kind: 'task', title: 'Look at the batch numbers' },
      }, keeper)
    }
    const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: { ...person, 'x-mole-office-workspace': 'default' },
      body: JSON.stringify({ name: PERSON }),
    })
    expect(named.status, await named.text()).toBe(200)
    await app.page.addInitScript(() => {
      localStorage.setItem('mole-office.workspace', 'test-heron')
    })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  async function open(page: Page, address: string, query = 'lang=en'): Promise<void> {
    await page.goto(`${app.site}/?${query}${address}`)
    await waitForThePage(page, 30_000)
    await waitForTheProjects(page)
  }

  // Test change (wave 13y round 165): the rows are on All pages, and the page they open lights the All pages entry.
  it('opens each of the four from its row under All projects, with no project named over the page', async () => {
    const page = app.page
    await open(page, '#/')
    for (const address of ADDRESSES) {
      await page.evaluate(() => { location.hash = '#/all-pages' })
      const row = page.locator(`#main .ap-group[data-group="all"] a.ap-page[href="${address}"]`)
      await row.waitFor({ timeout: 30_000 })
      expect(await page.locator(`#main .ap-group[data-group="project"] a.ap-page[href="${address}"]`).count(), address).toBe(0)
      await row.click()
      await page.waitForFunction((to) => location.hash === to, address)
      await waitForThePage(page, 30_000)
      // The sidebar marks All pages, where the row is listed.
      expect(await page.locator('#shell-side a.shell-all-pages').getAttribute('aria-current'), address).toBe('true')
      // The frame names no project over it: no project line in the phone bar, and no path or tabs.
      expect(await page.locator('.shell-bar-project').count(), address).toBe(0)
      expect(await page.locator('.px-where').count(), address).toBe(0)
    }
    // Control: a page of the project still names the project over it and carries its path and tabs.
    for (const address of ['#/modules']) {
      await open(page, address)
      expect(await page.locator('.shell-bar-project').textContent(), address).toBe('Heron Pottery')
      expect(await page.locator('.px-where .px-crumbs a').textContent(), address).toBe('Heron Pottery')
    }
  }, 240_000)

  it('draws the This project page with no card for the four or for Messages', async () => {
    const page = app.page
    await open(page, '#/project')
    const cards = await page.locator('.px-category-card').evaluateAll((all) => all.map((one) => one.getAttribute('data-card')))
    expect(cards.length).toBeGreaterThan(0)
    for (const key of GENERAL) expect(cards, key).not.toContain(key)
    expect(cards).not.toContain('messages')
    // The tabs above a page of the project are the same list.
    await open(page, '#/modules')
    const tabs = await page.locator('.px-tabs a').evaluateAll((all) => all.map((one) => one.getAttribute('href')))
    for (const address of ADDRESSES) expect(tabs, address).not.toContain(address)
    expect(tabs).not.toContain('#/messages')
  }, 240_000)

  describe.skipIf(!shots)('pictures', () => {
    const widths = [1440, 990, 660, 390] as const

    async function aWindow(width: number, theme: 'light' | 'dark'): Promise<Page> {
      const context = await app.browser.newContext({ viewport: { width, height: 1300 }, colorScheme: theme })
      await context.grantPermissions(['local-network-access'], { origin: app.site })
      await context.addInitScript(`localStorage.setItem('mole-office.workspace', 'test-heron'); localStorage.setItem('mole-office.preset.theme', '${theme}')`)
      return context.newPage()
    }

    /** The page, then the sidebar on its own (opened as a drawer below 1024). */
    async function take(page: Page, name: string, query: string, address: string, sidebar: boolean): Promise<void> {
      await open(page, address, query)
      await page.waitForTimeout(600)
      await page.screenshot({ path: join(shots ?? '', `${name}.png`), fullPage: true })
      if (!sidebar) return
      const narrow = (page.viewportSize()?.width ?? 1440) < 1024
      if (narrow) {
        await page.locator('.shell-menu').click()
        await page.waitForTimeout(400)
      }
      await page.locator('#shell-side').screenshot({ path: join(shots ?? '', `${name}-sidebar.png`) })
    }

    it('photographs the sidebar, the This project page and the Counters page', async () => {
      mkdirSync(shots ?? '', { recursive: true })
      for (const width of widths) {
        for (const theme of ['light', 'dark'] as const) {
          const page = await aWindow(width, theme)
          try {
            await take(page, `counters-${String(width)}-${theme}`, 'lang=en', '#/counters', true)
            await take(page, `project-${String(width)}-${theme}`, 'lang=en', '#/project', false)
          } finally {
            await page.context().close()
          }
        }
      }
      const zh = await aWindow(1440, 'light')
      try {
        await take(zh, 'counters-1440-light-zh', 'lang=zh', '#/counters', true)
        await take(zh, 'project-1440-light-zh', 'lang=zh', '#/project', false)
        await take(zh, 'counters-1440-light-xx', 'lang=xx', '#/counters', true)
      } finally {
        await zh.context().close()
      }
    }, 600_000)
  })
})
