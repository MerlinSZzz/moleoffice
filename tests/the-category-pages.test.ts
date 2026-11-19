// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CATEGORY PAGES, THE PATH AND TABS ABOVE A PAGE, AND THE ADDRESSES THAT MOVED. Wave 13q's S2.
 *
 * Plan 7FEOshq3mBGG, row S2. A press on a sidebar group's name opens a page of cards, one per page
 * in the group; every card opens its page; a page in such a group shows its path and the group's
 * other pages as tabs; every old address still opens the page it opened, and the bar shows the new
 * one. `#/agents` names the Agents group now, so the agent conversations moved to `#/conversations`.
 *
 * The browser half runs in a test office with made-up projects and records. Set
 * W13Q_CATEGORY_SHOTS to a folder to also photograph the pages at four widths and in both looks.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import {
  CATEGORY_PAGES,
  FLAT_ROUTES,
  RENAMED_ADDRESSES,
  categoryOfPage,
  parseRoute,
  renamedAddress,
  type CategoryKey,
} from '../src/shared/addresses.ts'

type SidebarModule = typeof import('../src/web/components/Sidebar.tsx')
type RouterModule = typeof import('../src/web/components/router.tsx')
let S: SidebarModule
let R: RouterModule
let app: LiveApp
const shots = process.env.W13Q_CATEGORY_SHOTS
const CATEGORIES = Object.keys(CATEGORY_PAGES) as CategoryKey[]
const PROJECT = { id: 'test-fern', title: 'Fern Garden' }
/** The project's two made-up modules. Their titles are content, drawn as written, on the project page. */
const MODULES = ['Seed tray rig', 'Watering timer']
/**
 * THE KEYS OF THESE PAGES IN THE WORD CHECK'S LIST OF FALLBACKS. A key starts the match: `nav.` preceded by a letter,
 * digit, dot or underscore is inside another page's key, such as `mergeQueuePage.nav.what`, and is not a nav key.
 */
const THESE_PAGES_KEYS = /category\.[\w.]+|(?<![\w.])nav\.[\w.]+/g
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  // The sidebar module reads window.localStorage through api.ts when it loads, so a stand-in goes
  // in before it is imported, as tests/shell-nav.test.ts does. Nothing in the stand-in is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  S = await import('../src/web/components/Sidebar.tsx')
  R = await import('../src/web/components/router.tsx')

  app = await liveApp({ name: 'category-pages', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: { ...HEADERS, 'x-mole-office-workspace': 'default' },
    body: JSON.stringify(PROJECT),
  })
  expect(made.status, await made.text()).toBe(201)
  for (const title of MODULES) {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...HEADERS, 'x-mole-office-workspace': PROJECT.id },
      body: JSON.stringify({ kind: 'module', title, data: {} }),
    })
    expect(filed.status, await filed.text()).toBe(201)
  }
  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('look') ?? 'light')
  }, PROJECT.id)
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('the routes', () => {
  it('gives each folding sidebar group a category page at its own key, and builds the same address back', () => {
    // The same groups; the sidebar draws the project block first after All projects.
    expect([...CATEGORIES].sort()).toEqual(S.SHIPPED_RAIL_GROUPS.filter((group) => group.key !== 'all').map((group) => group.key).sort())
    for (const key of CATEGORIES) {
      const route = parseRoute(`#/${key}`)
      expect(route.name).toBe(CATEGORY_PAGES[key])
      expect(categoryOfPage(route.name)).toBe(key)
      expect(R.categoryPath(key)).toBe(`/${key}`)
      expect(FLAT_ROUTES[key]).toBe(CATEGORY_PAGES[key])
      // A group's key is never also a renamed address, or its page could not be reached.
      expect(RENAMED_ADDRESSES[key]).toBeUndefined()
    }
    expect(categoryOfPage('home')).toBe(null)
  })

  it('moves the agent conversations to #/conversations and keeps every link to them on the route', () => {
    expect(parseRoute('#/conversations')).toEqual({ name: 'agents' })
    expect(R.pathFor('agents')).toBe('/conversations')
    expect(parseRoute('#/agents')).toEqual({ name: 'agentsCategory' })
    expect(S.DESTINATIONS.find((row) => row.key === 'agents')?.to).toBe('/conversations')
    expect(renamedAddress('#/agents')).toBe(null)
  })

  it('reads a nav key in the list of fallbacks only where the key starts with nav', () => {
    const list = 'nav.group.agents mergeQueuePage.nav.what category.agents.title x.nav.y my_nav.z (nav.toolset)'
    expect(list.match(THESE_PAGES_KEYS)).toEqual(['nav.group.agents', 'category.agents.title', 'nav.toolset'])
  })

  it('finds the group and the row of every page in a folding group, and of no other page', () => {
    for (const group of S.railGroups()) {
      for (const row of S.groupRows(group)) {
        const where = S.whereThePageIs(row.page, row.family)
        if (group.key === 'all') expect(where, row.key).toBe(null)
        else expect([where?.group.key, where?.row.key], row.key).toEqual([group.key, row.key])
      }
    }
    expect(S.whereThePageIs('record')).toBe(null)
    expect(S.whereThePageIs('agentsCategory')).toBe(null)
  })
})

/** Open an address and wait until the page has drawn it and every glance has answered. */
async function open(address: string, query = 'lang=en'): Promise<void> {
  await app.page.goto(`${app.site}/?${query}${address}`)
  await waitForThePage(app.page, 30_000)
  await settleGlances()
}

async function settleGlances(): Promise<void> {
  const reading = createI18n('en').t('category.glance.reading')
  await app.page.waitForFunction(
    (mark) => [...document.querySelectorAll('.px-category-glance')].every((one) => one.textContent !== mark && !one.textContent?.includes('⟦…')),
    reading,
    { timeout: 30_000 },
  )
}

it('opens every card of every category page on the page it names, with its path and its tabs', async () => {
  const page = app.page
  for (const key of CATEGORIES) {
    // The Developer group is drawn in developer mode only, so its page is walked in that mode.
    const query = key === 'developer' ? 'lang=en&mode=inspect' : 'lang=en'
    await open(`#/${key}`, query)
    const cards = await page.locator('.px-category-card').evaluateAll((all) =>
      all.map((one) => ({ href: one.getAttribute('href') ?? '', title: one.querySelector('.px-category-card-title')?.textContent ?? '' })),
    )
    const group = S.railGroups().find((one) => one.key === key)
    expect(cards.map((card) => card.href), key).toEqual(S.groupRows(group!).map((row) => `#${row.to}`))
    for (const card of cards) {
      await open(`#/${key}`, query)
      await page.locator(`.px-category-card[href="${card.href}"]`).click()
      await page.waitForFunction((href) => location.hash === href, card.href)
      await waitForThePage(page, 30_000)
      expect(await page.locator('.px-crumbs [aria-current="page"]').textContent(), card.href).toBe(card.title)
      expect(await page.locator('.px-crumbs a').getAttribute('href'), card.href).toBe(`#/${key}`)
      expect(await page.locator('.px-tabs a[aria-current="page"]').textContent(), card.href).toBe(card.title)
      expect(await page.locator('.px-tabs a').count(), card.href).toBe(cards.length)
    }
  }
  // The first group has no category page, so its pages carry neither.
  await open('#/plans')
  expect(await page.locator('.px-where').count()).toBe(0)
  // And the Developer group's pages carry none in normal mode, where the sidebar hides the group.
  await open('#/sessions')
  expect(await page.locator('.px-where').count()).toBe(0)
}, 600_000)

it('reads each glance from the page behind it, draws a zero as the short mark, and draws nothing where the page has no count', async () => {
  const page = app.page
  const en = createI18n('en')
  await open('#/project')
  // The Modules page counts each of its groups and not the whole, so its card draws no number, as
  // item 4 of a decision says.
  expect(await page.locator('.px-category-card[data-card="modules"] .px-category-glance').count()).toBe(0)
  // Criterion change (wave 13q round 14): this read the Counters card, which left the page with Counters'
  // move under All projects on a decision's order. The Shelved card has a count of its own,
  // and this office has nothing on the shelf.
  expect(await shortMark('shelved')).toEqual({ mark: en.t('absence.mark'), title: en.t('frameTriage.glance.shelved', { n: 0 }) })
  // A page that has no count of its own draws no number and no mark standing for one.
  expect(await page.locator('.px-category-card[data-card="findings"] .px-category-glance').count()).toBe(0)
  expect(await page.locator('h1').textContent()).toBe(PROJECT.title)
  await open('#/office')
  // Settings stands at the sidebar's foot and in no group, so it has no card here.
  expect(await page.locator('.px-category-card[data-card="settings"]').count()).toBe(0)
  expect(await page.locator('.px-category-card[data-card="embassy"] .px-category-glance').count()).toBe(0)
  await open('#/agents')
  expect(await shortMark('tasksToTake')).toEqual({ mark: en.t('absence.mark'), title: en.t('category.glance.packaged', { n: 0 }) })
}, 240_000)

/** The short mark a card's glance draws for a zero, and the count its title carries. */
async function shortMark(card: string): Promise<{ mark: string; title: string | null }> {
  return app.page.locator(`.px-category-card[data-card="${card}"] .px-category-glance .px-absent`).evaluate((one) => ({
    mark: one.firstChild?.textContent ?? '',
    title: one.getAttribute('title'),
  }))
}

it('keeps every old address opening the page it opened, with the new address in the bar', async () => {
  const page = app.page
  const heading = async () => page.locator('#main h1').first().textContent()
  for (const [old, now] of Object.entries(RENAMED_ADDRESSES)) {
    await open(`#/${now}`)
    const expected = await heading()
    expect(expected, now).toBeTruthy()
    // Not `open`: the ready mark is written for the address the page was opened at, and the shell
    // then puts the new address in the bar without a hashchange, so the two never meet.
    // A COLD LOAD, as a bookmark opens: the blank page in front makes the old address a new
    // document, so the heading below is drawn by the old address and not left over from the new.
    await page.goto('about:blank')
    await page.goto(`${app.site}/?lang=en#/${old}`)
    await page.waitForFunction((to) => location.hash === to, `#/${now}`)
    await expect.poll(heading, { timeout: 30_000, message: old }).toBe(expected)
  }
  // #/agents cannot be a renamed address, because it is the Agents category page now. It opens
  // that page, and the conversations it used to open are its card, one press away.
  await open('#/agents')
  expect(await page.evaluate(() => location.hash)).toBe('#/agents')
  expect(await page.locator('h1').textContent()).toBe(createI18n('en').t('nav.group.agents'))
  await page.locator('.px-category-card[data-card="agents"]').click()
  await page.waitForFunction(() => location.hash === '#/conversations')
  await page.locator('.px-ag-title').waitFor()
}, 240_000)

// Test change (wave 13y round 165): the groups and their names are on the All pages page now, which
// folds nothing. A group's name there opens its category page, by mouse and by key, and on that page
// the sidebar lights its All pages entry.
it('opens a category page from the group name on All pages, by mouse and by key', async () => {
  const page = app.page
  await open('#/all-pages')
  const office = page.locator('#main .ap-group[data-group="office"]')
  await office.locator('.ap-cap a').click()
  await page.waitForFunction(() => location.hash === '#/office')
  await page.locator('nav.shell-nav a.shell-all-pages[aria-current="true"]').waitFor()
  await page.locator('.px-category-title').waitFor()
  // By key: Enter on the name opens the page.
  await open('#/all-pages')
  await page.locator('#main .ap-group[data-group="agents"] .ap-cap a').focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => location.hash === '#/agents')
}, 120_000)



