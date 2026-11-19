// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR'S PROJECT GROUP HAS NO MESSAGES ROW, AND THE CHAT STILL OPENS THE MESSAGES PAGE.
 * Wave 13q, round 44.
 *
 * Messages belong to no project. A Messages row inside the This project group made them look as if
 * they did, so the row is gone. Messages are read in the chat, which reads across projects and
 * filters by project, and the chat's foot still leads to the Messages page.
 *
 * What this file holds:
 *   1. No group of the sidebar holds Messages, so neither the drawn project block, nor the This
 *      project page's cards, nor the tabs above a project page lead to #/messages.
 *   2. In a browser, the sidebar has no link to #/messages, and the chat's foot opens the page.
 *
 * Mutations, each after a green control run:
 *   - 'messages' put back at the end of the project group's keys in src/web/components/Sidebar.tsx:
 *     cases 1 and 2 go red.
 *   - the chat's foot link (px-chat-foot-link in src/web/components/Chat.tsx) removed: case 3 goes red.
 *
 * The browser half runs in a test office with one made-up project. Set W13Q_NO_MESSAGES_ROW_SHOTS to
 * a folder to also photograph the sidebar at 1440, 990, 660 and 390 in light and dark.
 *
 * Test change (wave 13y round 165): the project block stands in the sidebar again, but it draws a row only for a
 * project page the person pinned, and the project's pages are listed under This project on All pages. So the block's
 * rows are read on All pages, and the sidebar is still read for a Messages link.
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
import { openTheChat } from './open-the-chat.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type CategoryModule = typeof import('../src/web/pages/CategoryPage.tsx')
type AllPagesModule = typeof import('../src/web/pages/AllPagesPage.tsx')
let S: SidebarModule
let C: CategoryModule
let A: AllPagesModule

const PROJECT = { id: 'test-heron', title: 'Heron Pottery' }
const shots = process.env['W13Q_NO_MESSAGES_ROW_SHOTS']

function withoutStyles(html: string): string {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? '')
}

describe('drawn without a browser', () => {
  beforeAll(async () => {
    S = await import('../src/web/components/Sidebar.tsx')
    C = await import('../src/web/pages/CategoryPage.tsx')
    A = await import('../src/web/pages/AllPagesPage.tsx')
  })

  it('puts Messages in no group, and draws no Messages row in the sidebar', () => {
    for (const group of S.SHIPPED_RAIL_GROUPS) expect(group.keys, group.key).not.toContain('messages')
    const sidebar = withoutStyles(renderToStaticMarkup(h(S.Sidebar, {
      page: 'modules' as const,
      open: false,
      onClose: () => {},
      onRenamed: () => {},
      attention: { status: 'loading' as const },
      waiting: { status: 'loading' as const },
      sight: { id: PROJECT.id, title: PROJECT.title, named: true, what: '', fault: null },
      workspaces: { status: 'loading' as const },
    })))
    // Control: the block is drawn.
    expect(sidebar).toContain('class="sbp-block"')
    expect(hrefs(sidebar)).not.toContain('#/messages')
    // Control: All pages lists the project's pages, and none of them is Messages.
    const allPages = withoutStyles(renderToStaticMarkup(h(A.AllPagesPage, {
      sight: { id: PROJECT.id, title: PROJECT.title, named: true, what: '', fault: null },
    })))
    expect(hrefs(allPages)).toContain('#/modules')
    expect(hrefs(allPages)).not.toContain('#/messages')
  })

  it('draws no Messages card on the This project page and no Messages tab above a project page', () => {
    const page = withoutStyles(renderToStaticMarkup(h(C.CategoryPage, { category: 'project', caption: PROJECT.title })))
    const cards = [...page.matchAll(/data-card="([^"]+)"/g)].map((match) => match[1])
    expect(cards).toContain('modules')
    expect(cards).not.toContain('messages')
    const tabs = withoutStyles(renderToStaticMarkup(h(C.WhereThisPageIs, { page: 'modules', project: PROJECT.title })))
    expect(hrefs(tabs)).toContain('#/modules')
    expect(hrefs(tabs)).not.toContain('#/messages')
  })
})

describe('in a browser', () => {
  let app: LiveApp

  beforeAll(async () => {
    app = await liveApp({ name: 'no-messages-row', workspace: 'default', viewport: { width: 1440, height: 1000 } })
    const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify(PROJECT) })
    expect(made.status, (await made.text()).slice(0, 300)).toBeLessThan(300)
    await app.page.addInitScript((id) => {
      localStorage.setItem('mole-office.workspace', id)
    }, PROJECT.id)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  it('has no Messages link in the sidebar, and the chat opens the Messages page', async () => {
    const page = app.page
    await page.goto(`${app.site}/?lang=en#/modules`)
    await waitForThePage(page, 30_000)
    await waitForTheProjects(page)
    // Control: the project block is on screen.
    expect(await page.locator('#shell-side .sbp-block').count()).toBe(1)
    expect(await page.locator('#shell-side a[href="#/messages"]').count(), 'the sidebar still leads to Messages').toBe(0)
    // Control: All pages lists the project's pages, and no row there leads to Messages.
    await page.evaluate(() => { location.hash = '#/all-pages' })
    await page.locator('#main .ap-group[data-group="project"] a.ap-page[href="#/modules"]').waitFor({ timeout: 30_000 })
    expect(await page.locator('#main a[href="#/messages"]').count(), 'All pages leads to Messages').toBe(0)
    await page.evaluate(() => { location.hash = '#/modules' })
    await waitForThePage(page, 30_000)
    // The chat: its circle opens the panel, and the panel's foot leads to the Messages page.
    await openTheChat(page)
    await page.waitForSelector('.px-chat', { timeout: 20_000 })
    if ((await page.$('.px-chat-back')) !== null) await page.click('.px-chat-back')
    await page.waitForSelector('.px-chat-foot-link a', { timeout: 20_000 })
    await page.click('.px-chat-foot-link a')
    await page.waitForFunction(() => location.hash === '#/messages')
    await waitForThePage(page, 30_000)
    // This office holds no messages, so the page shows its heading and no list.
    await page.waitForSelector('h1.px-ms-title', { timeout: 20_000 })
    expect(await page.textContent('h1.px-ms-title')).toBe('Messages')
  }, 120_000)

  describe.skipIf(!shots)('pictures', () => {
    async function aWindow(width: number, theme: 'light' | 'dark'): Promise<Page> {
      const context = await app.browser.newContext({ viewport: { width, height: 1100 }, colorScheme: theme })
      await context.grantPermissions(['local-network-access'], { origin: app.site })
      await context.addInitScript(`localStorage.setItem('mole-office.workspace', '${PROJECT.id}'); localStorage.setItem('mole-office.preset.theme', '${theme}')`)
      return context.newPage()
    }

    it('photographs the sidebar with the project group at four widths in both themes', async () => {
      mkdirSync(shots ?? '', { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          const page = await aWindow(width, theme)
          try {
            await page.goto(`${app.site}/?lang=en&look=${theme}#/modules`)
            await waitForThePage(page, 30_000)
            await waitForTheProjects(page)
            if (width < 1024) {
              await page.locator('.shell-menu').click()
              await page.waitForTimeout(400)
            }
            await page.locator('.sbp-block').scrollIntoViewIfNeeded()
            await page.waitForTimeout(400)
            expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
            const size = await page.evaluate(() => document.documentElement.scrollWidth)
            expect(size, `the page scrolls sideways at ${String(width)}`).toBeLessThanOrEqual(width)
            await page.screenshot({ path: join(shots ?? '', `sidebar-${String(width)}-${theme}.png`) })
            await page.locator('#shell-side').screenshot({ path: join(shots ?? '', `sidebar-only-${String(width)}-${theme}.png`) })
          } finally {
            await page.context().close()
          }
        }
      }
    }, 600_000)
  })
})
