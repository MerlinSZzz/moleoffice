// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ALL PAGES FINDS A PAGE AS THE PERSON TYPES.
 *
 * All pages lists every page in the groups of the sidebar's arrangement. A search field above the groups narrows the
 * names as the person types. The pages that stand in front in the sidebar are drawn grey in their groups, and the
 * number beside All pages still counts only the pages not in front.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own, with one made-up plugin switched on:
 *   1. The search takes the focus when All pages opens: from the sidebar's entry, from the menu at 390, and from its
 *      address. Its words are the page's own "Find a page" words.
 *   2. Typed words narrow the names, compared without case. A group with no name that holds the words is not drawn.
 *      A grey name is a page pinned in front, and typed words never find it. The page draws no line of words.
 *   3. When no name holds the words, no group is drawn and one line says so, with the words typed. It is the only line
 *      the page draws.
 *   4. The pages in front are drawn grey, each in its group of the arrangement, and they are the sidebar's front
 *      entries. No line says what grey means, and no grey name is described by one. In each group the pin presses
 *      stand in one column. The number beside All pages counts only the names not grey.
 *   5. The plugin pages are found too.
 *   6. Enter opens the first name drawn, and does nothing while the field is empty. Escape empties the field.
 *   7. Taken out in a test change (wave 13y round 165): g then p opens the sidebar's Switch list again, as it did
 *      before this round, and no longer opens All pages.
 *   8. The names are compared as the reader reads them: in Chinese, a Chinese name finds its page, and the English
 *      name of a page finds nothing.
 *
 * Test change (wave 13y round 165, the explaining lines): All pages draws no line under its title and no line under its
 * groups. Cases 2, 3 and 4 read every line the page draws, and case 4 no longer finds a line that says what grey means.
 * Case 4's check of the pin presses' columns is green before the change too: it guards the line the presses stand in.
 *
 * THE PICTURES are taken only when W13Y_SIDEBAR_PICTURES names a folder. They are of a made-up office, and each
 * carries the made-up label above the page.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { SHIPPED_SIDEBAR } from '../src/shared/sidebar-arrangement.ts'
import { DESTINATIONS, SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { pathFor, pluginPagePath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'all-pages-finds-a-page'
const PICTURES = process.env['W13Y_SIDEBAR_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
/** One made-up plugin with one page, so its row is named by the plugin's name. */
const PLUGIN = { id: 'made-up-tide-table', name: 'Made-up tide table' }
const scratch = aTestDatabaseFolder('all-pages-finds')
const PLUGINS_BEFORE = process.env['MOLE_OFFICE_PLUGINS']
const originalOwnerName = process.env['MOLE_OFFICE_OWNER_NAME']

const SEARCH = '#main input[type="search"]'
/** Every name All pages draws, grey or not. */
const NAMES = 'a.ap-page, a.ap-front'
const GREY = '#main a.ap-front'
/** The sidebar's entries in front: its links, less All pages and Settings at the foot. */
const FRONT_ENTRIES = '#shell-side a.shell-link:not(.shell-all-pages):not(.sbp-settings)'
const THE_ENTRY = '#shell-side [data-target="uiSurface/rail.allpages"]'
const THE_NUMBER = '#shell-side .shell-pages-count'

const inEnglish = createI18n('en').t
const said = (key: string, values?: Record<string, string>): string => inEnglish(key as WordKey, values)

let app: LiveApp

beforeAll(async () => {
  mkdirSync(join(scratch, 'plugins', PLUGIN.id, 'dist'), { recursive: true })
  writeFileSync(join(scratch, 'plugins', PLUGIN.id, 'plugin.json'), JSON.stringify({
    id: PLUGIN.id,
    name: { en: PLUGIN.name },
    version: '0.1.0',
    interface: 'office-read/1',
    pages: [{ slug: 'main', title: { en: 'Main' } }],
    reads: ['projects'],
    budget: { builtKilobytes: 20 },
  }))
  writeFileSync(join(scratch, 'plugins', PLUGIN.id, 'dist', 'main.html'), '<!doctype html><title>Made-up tide table</title><p>made-up tide table</p>')
  process.env['MOLE_OFFICE_PLUGINS'] = join(scratch, 'plugins')
  process.env['MOLE_OFFICE_OWNER_NAME'] = 'Made-up caretaker'
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: { width: 1440, height: 900 } })
  const on = await fetch(`${app.api}/api/plugins/${PLUGIN.id}/switch`, { method: 'POST', headers: OWNER, body: JSON.stringify({ on: true }) })
  expect(on.status, await on.clone().text()).toBe(200)
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (PLUGINS_BEFORE === undefined) delete process.env['MOLE_OFFICE_PLUGINS']
  else process.env['MOLE_OFFICE_PLUGINS'] = PLUGINS_BEFORE
  if (originalOwnerName === undefined) delete process.env['MOLE_OFFICE_OWNER_NAME']
  else process.env['MOLE_OFFICE_OWNER_NAME'] = originalOwnerName
  rmSync(scratch, { recursive: true, force: true })
}, 60_000)

type Look = { theme?: 'light' | 'dark'; width?: number }

/** A fresh window whose stored choices are set before the app runs, with the sidebar open. */
async function aWindow(look: Look = {}): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? 1440
  const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 } })
  await context.addInitScript(({ id, theme, key }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, 'expanded')
    localStorage.setItem('mole-office.workspace', 'default')
  }, { id: THE_TEST_OFFICES_OWNER.id, theme: look.theme ?? 'light', key: SIDEBAR_KEY })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00'))
  return { context, page }
}

async function open(page: Page, address: string, query = 'lang=en'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?${query}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** All pages, opened at its address, once its groups and the plugin's page are drawn. */
async function openAllPages(page: Page, query = 'lang=en'): Promise<void> {
  await open(page, pathFor('allPages'), query)
  await page.locator(`#main a[href="#${pluginPagePath(PLUGIN.id, 'main')}"]`).waitFor({ timeout: 30_000 })
}

type Name = { href: string; words: string; grey: boolean }
type Group = { key: string; names: Name[] }

/** The groups All pages draws, in its order, with the names each draws. */
async function theGroupsDrawn(page: Page): Promise<Group[]> {
  return page.locator('#main .ap-group').evaluateAll((all, names) => all.filter((group) => group.getClientRects().length > 0).map((group) => ({
    key: group.getAttribute('data-group') ?? '',
    names: [...group.querySelectorAll(names!)].map((link) => ({
      href: link.getAttribute('href') ?? '',
      words: (link.querySelector('span')?.textContent ?? '').trim(),
      grey: link.classList.contains('ap-front'),
    })),
  })), NAMES)
}

/**
 * The groups that should be drawn once `words` are typed: the names not grey that hold them, compared without case. Test
 * change: a grey name is a page pinned in front, and All pages finds only the pages not pinned.
 */
function narrowed(groups: Group[], words: string, language: string): Group[] {
  const wanted = words.trim().toLocaleLowerCase(language)
  return groups
    .map((group) => ({ key: group.key, names: group.names.filter((name) => !name.grey && name.words.toLocaleLowerCase(language).includes(wanted)) }))
    .filter((group) => group.names.length > 0)
}

async function typeIn(page: Page, words: string): Promise<void> {
  await page.locator(SEARCH).fill(words)
  await page.waitForTimeout(300)
}

/** Every line of words the page draws, each paragraph that is drawn, in order. */
async function theLinesDrawn(page: Page): Promise<string[]> {
  return page.locator('#main .ap p').evaluateAll((all) => all
    .filter((one) => one.getClientRects().length > 0)
    .map((one) => (one.textContent ?? '').trim()))
}

async function theFocusIsOn(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((one) => document.activeElement?.matches(one) === true, selector)
}

it('1. the search takes the focus when All pages opens, from the sidebar entry, the menu and its address', async () => {
  const focused: Record<string, boolean> = {}
  const wide = await aWindow()
  try {
    await open(wide.page, '/')
    await wide.page.locator(THE_ENTRY).click()
    await wide.page.waitForFunction(() => location.hash === '#/all-pages', undefined, { timeout: 15_000 })
    await wide.page.locator(SEARCH).waitFor({ timeout: 30_000 })
    await wide.page.waitForTimeout(500)
    focused['from the sidebar entry'] = await theFocusIsOn(wide.page, SEARCH)
    await openAllPages(wide.page)
    await wide.page.waitForTimeout(500)
    focused['from its address'] = await theFocusIsOn(wide.page, SEARCH)
    expect(await wide.page.locator(SEARCH).getAttribute('placeholder'), 'the words in the field').toBe(said('allPages.find'))
    expect(await wide.page.locator(SEARCH).getAttribute('aria-label'), "the field's name").toBe(said('allPages.find'))
  } finally {
    await wide.context.close()
  }
  const phone = await aWindow({ width: 390 })
  try {
    await open(phone.page, '/')
    await phone.page.locator('.shell-menu').click()
    await phone.page.locator('#shell-side[data-drawer="open"]').waitFor()
    await phone.page.waitForTimeout(600)
    await phone.page.locator(THE_ENTRY).click()
    await phone.page.waitForFunction(() => location.hash === '#/all-pages', undefined, { timeout: 15_000 })
    await phone.page.locator(SEARCH).waitFor({ timeout: 30_000 })
    await phone.page.waitForTimeout(800)
    focused['from the menu at 390'] = await theFocusIsOn(phone.page, SEARCH)
  } finally {
    await phone.context.close()
  }
  expect(focused).toEqual({ 'from the sidebar entry': true, 'from its address': true, 'from the menu at 390': true })
}, 180_000)

it('2. typed words narrow the names, without case, and a group with no name that holds them is not drawn', async () => {
  const { context, page } = await aWindow()
  try {
    await openAllPages(page)
    await page.locator(SEARCH).waitFor({ timeout: 30_000 })
    const before = await theGroupsDrawn(page)
    const expected = narrowed(before, 'AGENT', 'en')
    const everyName = before.flatMap((group) => group.names).length
    const found = expected.flatMap((group) => group.names).length
    // The words must find some names and not every name, or the case proves nothing.
    expect(found > 0 && found < everyName, `${String(found)} of ${String(everyName)} names hold "agent"`).toBe(true)
    expect(expected.length < before.length, 'a group with no name that holds "agent"').toBe(true)
    await typeIn(page, 'AGENT')
    expect(await theGroupsDrawn(page), 'the names drawn for "AGENT"').toEqual(expected)
    await typeIn(page, 'agent')
    expect(await theGroupsDrawn(page), 'the names drawn for "agent"').toEqual(expected)
    // Test change (wave 13y round 165, the explaining lines): no line of words under the title.
    expect(await theLinesDrawn(page), 'the lines drawn for "agent"').toEqual([])
  } finally {
    await context.close()
  }
}, 120_000)

it('3. when no name holds the words, no group is drawn and one line says so, with the words typed', async () => {
  const { context, page } = await aWindow()
  try {
    await openAllPages(page)
    await page.locator(SEARCH).waitFor({ timeout: 30_000 })
    expect(narrowed(await theGroupsDrawn(page), 'zebra', 'en'), 'a name that holds "zebra"').toEqual([])
    await typeIn(page, 'zebra')
    expect(await theGroupsDrawn(page), 'the groups drawn').toEqual([])
    expect(await page.locator('#main [role="status"]').allTextContents(), 'what the page says').toEqual([said('allPages.none', { words: 'zebra' })])
    // Test change (wave 13y round 165, the explaining lines): the line that says nothing was found is the only line.
    expect(await theLinesDrawn(page), 'the lines drawn for "zebra"').toEqual([said('allPages.none', { words: 'zebra' })])
  } finally {
    await context.close()
  }
}, 120_000)

it('4. the pages in front are drawn grey in their groups, and the number counts the others', async () => {
  const { context, page } = await aWindow()
  try {
    await openAllPages(page)
    const front = await page.locator(FRONT_ENTRIES).evaluateAll((all) => all.map((one) => one.getAttribute('href') ?? ''))
    expect(front.length, "the sidebar's entries in front").toBeGreaterThan(0)
    // The entry draws its number once the plugin pages are read, as All pages has read them by now.
    await page.locator(THE_NUMBER).waitFor({ timeout: 30_000 })
    const number = Number(/\d+/.exec(await page.locator(THE_NUMBER).innerText())?.[0] ?? NaN)
    const drawn = await theGroupsDrawn(page)
    // Each arranged group draws every page of its arrangement in its order, and its pages in front are the grey ones.
    const address = (key: string): string => `#${DESTINATIONS.find((one) => one.key === key)?.to ?? key}`
    const arranged = SHIPPED_SIDEBAR.groups.filter((group) => group.key !== 'developer').map((group) => ({
      key: group.key,
      every: group.keys.map(address),
      grey: group.keys.map(address).filter((href) => front.includes(href)),
    }))
    expect(drawn.filter((group) => group.key !== 'plugins').map((group) => ({
      key: group.key,
      every: group.names.map((name) => name.href),
      grey: group.names.filter((name) => name.grey).map((name) => name.href),
    })), 'the groups, with their grey names').toEqual(arranged)
    const grey = drawn.flatMap((group) => group.names.filter((name) => name.grey).map((name) => name.href))
    expect([...grey].sort(), "the grey names against the sidebar's entries in front").toEqual([...front].sort())
    // Grey is drawn in another colour than a name that is not in front.
    const colours = await page.evaluate(() => ({
      grey: getComputedStyle(document.querySelector('#main a.ap-front')!).color,
      listed: getComputedStyle(document.querySelector('#main a.ap-page')!).color,
    }))
    expect(colours.grey, 'the colour of a grey name').not.toBe(colours.listed)
    // Test change (wave 13y round 165, the explaining lines): no line says what grey means, and no grey name is
    // described by a line.
    expect(await theLinesDrawn(page), 'the lines drawn with nothing typed').toEqual([])
    const described = await page.locator(GREY).evaluateAll((all) => all.map((one) => {
      const id = one.getAttribute('aria-describedby') ?? ''
      return id === '' ? '' : (document.getElementById(id)?.textContent ?? '').trim()
    }))
    expect(described, 'what describes each grey name').toEqual(grey.map(() => ''))
    // In each group the pin presses stand in one column, whatever the length of the names beside them.
    const columns = await page.locator('#main .ap-group').evaluateAll((all) => Object.fromEntries(all
      .filter((group) => group.querySelector('button') !== null)
      .map((group) => [group.getAttribute('data-group') ?? '', new Set([...group.querySelectorAll('li > button')].map((one) => Math.round(one.getBoundingClientRect().right))).size])))
    expect(columns, 'the columns of the pin presses in each group').toEqual(Object.fromEntries(arranged.map((group) => [group.key, 1])))
    const every = drawn.flatMap((group) => group.names).length
    expect(number, "the number beside All pages, against the names that are not grey").toBe(every - grey.length)
  } finally {
    await context.close()
  }
}, 180_000)

it('5. the plugin pages are found too', async () => {
  const { context, page } = await aWindow()
  try {
    await openAllPages(page)
    await page.locator(SEARCH).waitFor({ timeout: 30_000 })
    const before = await theGroupsDrawn(page)
    expect(narrowed(before, 'tide', 'en').map((group) => group.key), 'the groups with a name that holds "tide"').toEqual(['plugins'])
    await typeIn(page, 'TIDE')
    expect(await theGroupsDrawn(page), 'the names drawn for "TIDE"').toEqual([
      { key: 'plugins', names: [{ href: `#${pluginPagePath(PLUGIN.id, 'main')}`, words: PLUGIN.name, grey: false }] },
    ])
  } finally {
    await context.close()
  }
}, 120_000)

it('6. Enter opens the first name drawn and does nothing in an empty field, and Escape empties the field', async () => {
  const { context, page } = await aWindow()
  try {
    await openAllPages(page)
    await page.locator(SEARCH).waitFor({ timeout: 30_000 })
    const before = await theGroupsDrawn(page)
    // Escape empties the field and every group comes back.
    await typeIn(page, 'agent')
    await page.locator(SEARCH).press('Escape')
    await page.waitForTimeout(300)
    expect(await page.locator(SEARCH).inputValue(), 'the field after Escape').toBe('')
    expect(await theGroupsDrawn(page), 'the groups after Escape').toEqual(before)
    // Enter in the empty field opens nothing.
    await page.locator(SEARCH).press('Enter')
    await page.waitForTimeout(800)
    expect(await page.evaluate(() => location.hash), 'the address after Enter in an empty field').toBe(`#${pathFor('allPages')}`)
    // Enter opens the first name drawn for the words.
    await typeIn(page, 'agent')
    const first = (await theGroupsDrawn(page))[0]?.names[0]?.href ?? ''
    expect(first, 'the first name drawn for "agent"').not.toBe('')
    await page.locator(SEARCH).press('Enter')
    await page.waitForFunction((href) => location.hash === href, first, { timeout: 15_000 }).catch(() => undefined)
    expect(await page.evaluate(() => location.hash), 'the address after Enter').toBe(first)
  } finally {
    await context.close()
  }
}, 120_000)

it('8. the names are compared as the reader reads them, so in Chinese the English name of a page finds nothing', async () => {
  const { context, page } = await aWindow()
  try {
    await openAllPages(page, 'lang=zh')
    await page.locator(SEARCH).waitFor({ timeout: 30_000 })
    const before = await theGroupsDrawn(page)
    // A page whose Chinese name has no Latin letter, found by two of its own characters.
    const chosen = before.flatMap((group) => group.names).find((name) => !name.grey && name.words.length >= 2 && !/[A-Za-z]/.test(name.words))
    expect(chosen, 'a name drawn in Chinese').toBeDefined()
    const two = chosen!.words.slice(0, 2)
    await typeIn(page, two)
    const found = await theGroupsDrawn(page)
    expect(found, `the names drawn for "${two}"`).toEqual(narrowed(before, two, 'zh'))
    expect(found.flatMap((group) => group.names.map((name) => name.href)), 'the chosen page among them').toContain(chosen!.href)
    // The same page's English name is not what the reader reads, so it finds nothing.
    const english = DESTINATIONS.find((one) => `#${one.to}` === chosen!.href)?.label ?? ''
    expect(english, "the chosen page's English name").not.toBe('')
    expect(narrowed(before, english, 'zh'), `a Chinese name that holds "${english}"`).toEqual([])
    await typeIn(page, english)
    expect(await theGroupsDrawn(page), `the groups drawn for "${english}"`).toEqual([])
    expect(await page.locator('#main [role="status"]').allTextContents(), 'what the page says')
      .toEqual([createI18n('zh').t('allPages.none' as WordKey, { words: english })])
  } finally {
    await context.close()
  }
}, 120_000)

it.skipIf(PICTURES === undefined)('takes the pictures of All pages with words typed and with nothing found', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      const { context, page } = await aWindow({ theme, width })
      try {
        const name = (what: string): string => join(folder, `${what}-${String(width)}-${theme}.png`)
        for (const [what, words] of [['all-pages-typed', 'agent'], ['all-pages-nothing-found', 'zebra']] as const) {
          await openAllPages(page)
          await page.locator(SEARCH).waitFor({ timeout: 30_000 })
          await typeIn(page, words)
          await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
          await page.waitForTimeout(600)
          await page.screenshot({ path: name(what), fullPage: true })
        }
      } finally {
        await context.close()
      }
    }
  }
}, 900_000)
