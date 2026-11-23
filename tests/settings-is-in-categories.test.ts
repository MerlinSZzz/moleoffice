// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MOVED_SETTINGS_PANELS, SETTINGS_PANELS, settingsPath } from '../src/shared/addresses.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import type { Mode } from '../src/web/lib/mode.ts'
import { SETTINGS_CATEGORY_KEY } from '../src/web/lib/settings-category.ts'
import { panelsInCategory } from '../src/shared/settings-structure.ts'
import { DEVELOPER_ONLY_PANELS, WINDOW_ONLY_PANELS, whereThePanelIs } from '../src/web/pages/SettingsPage.tsx'
import { openTheChat } from './open-the-chat.ts'
import { CHAT_OPEN_KEY, SPLIT_LEAVES_THE_WINDOW, SPLIT_WIDTH_TO_START_WITH } from '../src/web/lib/chat-split.ts'

// The word lists as the pages read them: en.ts and zh.ts with every wave's part (src/shared/words/joined.ts).
const en = englishWords()

/**
 * SETTINGS IS ONE PAGE IN CATEGORIES, ONE CATEGORY AT A TIME, WITH EVERY PANEL OF IT OPEN.
 * A decision had the sentence "every panel is folded to its title".
 * Wave 13y round 125 reopened that sentence for Settings only (item 62, layout A).
 *
 * - The list of categories: seven in normal mode and nine in developer mode, in the decision's order, with a
 *   Developer heading before the two developer categories at the end. A press shows its category, marks it chosen,
 *   and brings its heading to the top of the window; the list stays in view as the page scrolls.
 * - Only the chosen category is drawn, and every panel in it is open: no panel has a press that folds it.
 * - Normal mode draws, category by category, exactly the panels it drew before the categories: every panel but
 *   DEVELOPER_ONLY_PANELS. A browser draws no panel of WINDOW_ONLY_PANELS in either mode; those are drawn only in the
 *   standalone window. Each panel is drawn in one category, the one the page says it is in.
 * - An address naming a panel opens its category and scrolls to it, for every panel; the three that became pages
 *   lead to them; and the owner's own picture in the chat leads to the owner's profile panel. A developer-only
 *   panel named in normal mode opens the Normal or Developer panel with a line saying so.
 * - This browser remembers the category chosen last, and says so when it finds a word it has no category for.
 * - The four checks of plan 7FEOshq3mBGG block b-6 on the new words.
 *
 * Everything in this office is made up: one invented project and an invented person.
 */

let app: LiveApp
const shots = process.env.W13Q_SETTINGS_CATS_SHOTS
const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

/**
 * The categories a decision names, in its order, by their words, with the `keys` category that another decision added
 * right after `chat`.
 */
const NORMAL_CATEGORIES = ['settingsCats.cat.you', 'settingsCats.cat.looks', 'settingsCats.cat.chat', 'settingsCats.cat.keys', 'settingsCats.cat.work', 'settingsCats.cat.tools', 'settingsCats.cat.kept'] as const
const DEVELOPER_CATEGORIES = [...NORMAL_CATEGORIES, 'settingsCats.cat.devRuns', 'settingsCats.cat.devMachines'] as const
/** The keys the page gives each category, in the same order. */
const NORMAL_KEYS = ['you', 'looks', 'chat', 'keys', 'work', 'tools', 'kept'] as const
const DEVELOPER_KEYS = [...NORMAL_KEYS, 'devRuns', 'devMachines'] as const
/** Under the list's Developer heading, the two developer categories leave out the word the heading says. */
const UNDER_THE_HEADING = ['settingsCats.list.devRuns', 'settingsCats.list.devMachines'] as const

beforeAll(async () => {
  app = await liveApp({ name: 'settings-in-categories', workspace: 'default', viewport: { width: 1440, height: 900 } })
  const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers: { ...headers, 'x-mole-office-workspace': 'default' }, body: JSON.stringify({ id: 'heron-study', title: 'Heron Study' }) })
  expect(made.ok, await made.clone().text()).toBe(true)
  const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: { ...headers, 'x-mole-office-workspace': 'default' }, body: JSON.stringify({ name: 'Wren' }) })
  expect(named.ok, await named.clone().text()).toBe(true)
  await app.page.addInitScript(() => localStorage.setItem('mole-office.workspace', 'heron-study'))
  if (shots) mkdirSync(shots, { recursive: true })
}, 240_000)
afterAll(async () => { await app?.stop() })

async function open(page: Page, mode: Mode, language = 'en', address = '/settings') {
  // A fresh page each time, so nothing a panel drew before is kept. Not a reload: a reload puts back the scroll the
  // page had, which is the browser's doing and would hide whether the page scrolled to the panel itself.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}&mode=${mode}#${address}`)
  await waitForThePage(page, 30_000)
  await page.locator('.set .sf-row').waitFor()
  await page.locator('.set .sf-cat').waitFor()
  expect(await page.locator('html').getAttribute('data-mode')).toBe(mode)
}

/** The panels drawn, by their surface ids, in the page's order. */
async function drawnPanels(page: Page): Promise<string[]> {
  return page.locator('.set [data-settings-panel]').evaluateAll((all) => all.map((one) => one.getAttribute('data-settings-panel') ?? ''))
}

/**
 * Where an element is in the window, against what sticks above it. At 1440 wide only the list sticks, and it sticks
 * beside the panels, so the line an element is measured from is the window's top; when the list is a row above the
 * element, it is the row's foot.
 *
 * "at its top": its top is just under that line, or the page is scrolled as far as it goes and its top is on the
 * screen under the line, because a page cannot scroll past its own end. "in view" is said, and fails, when its top is
 * on the screen under the line but lower down.
 */
async function whereItIs(page: Page, selector: string): Promise<string> {
  return page.evaluate((selector) => {
    const row = document.querySelector('.sf-row')
    const target = document.querySelector(selector)
    if (row === null || target === null) return `nothing drawn at ${selector}`
    const rowIsAbove = row.getBoundingClientRect().right > target.getBoundingClientRect().left
    const line = rowIsAbove ? row.getBoundingClientRect().bottom : 0
    const top = target.getBoundingClientRect().top
    const below = top - line
    const atTheEnd = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1
    if (below >= 0 && below < 40) return 'at its top'
    if (atTheEnd && below >= 0 && top < window.innerHeight) return 'at its top'
    if (below >= 0 && top < window.innerHeight) return 'in view'
    return `${Math.round(below)}px below the line, scrolled ${Math.round(window.scrollY)} of ${document.documentElement.scrollHeight - window.innerHeight}`
  }, selector)
}

/** The category drawn now, by its key and by its heading. */
async function shownCategory(page: Page): Promise<{ key: string | null; title: string | null; drawn: number }> {
  const drawn = await page.locator('.set .sf-cat').count()
  const cat = page.locator('.set .sf-cat').first()
  return { key: await cat.getAttribute('data-category'), title: await cat.locator('.sf-cat-title').textContent(), drawn }
}

/** The press in the list that is marked chosen, by its category's key, and how many are marked. */
async function markedChosen(page: Page): Promise<string[]> {
  return page.locator('.set .sf-jump[aria-current="true"]').evaluateAll((all) => all.map((one) => one.getAttribute('data-category') ?? ''))
}

it('lists seven categories in normal mode and nine in developer mode, the Developer heading before the last two, and each press shows its category, marked, with its heading at its top', async () => {
  for (const [mode, expected, keys] of [['normal', NORMAL_CATEGORIES, NORMAL_KEYS], ['inspect', DEVELOPER_CATEGORIES, DEVELOPER_KEYS]] as const) {
    await open(app.page, mode)
    const list = app.page.getByRole('navigation', { name: en['settingsCats.row'] })
    // textContent, because a look may draw a label in capitals and innerText reads what is drawn.
    const named = expected.map((key, at) => (at < NORMAL_CATEGORIES.length ? en[key] : en[UNDER_THE_HEADING[at - NORMAL_CATEGORIES.length]!]))
    expect(await list.getByRole('button').allTextContents(), mode).toEqual(named)
    expect(await list.getByRole('button').evaluateAll((all) => all.map((one) => one.getAttribute('data-category'))), mode).toEqual([...keys])
    // THE DEVELOPER HEADING stands before the two developer categories, and they end the list.
    const heading = list.getByRole('group', { name: en['nav.group.developer'] })
    if (mode === 'normal') expect(await heading.count(), mode).toBe(0)
    else {
      expect(await heading.getByRole('button').allTextContents(), mode).toEqual(UNDER_THE_HEADING.map((key) => en[key]))
      expect(await app.page.locator('.set .sf-list > :last-child').getAttribute('role'), mode).toBe('group')
      expect(await heading.evaluate((group) => group.firstElementChild?.textContent), mode).toBe(en['nav.group.developer'])
    }
    // Every press, last first, each from the foot of the page, so each heading really has to be brought into view.
    for (const [at, key] of [...keys.entries()].reverse()) {
      await app.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await list.locator(`.sf-jump[data-category="${key}"]`).click()
      await expect.poll(() => shownCategory(app.page), { message: `${mode}: ${key}` }).toEqual({ key, title: en[expected[at]!], drawn: 1 })
      expect(await markedChosen(app.page), `${mode}: ${key}`).toEqual([key])
      await expect.poll(() => whereItIs(app.page, '.set .sf-cat-title'), { message: `${mode}: ${key}` }).toBe('at its top')
    }
    // The list stays at the top of the window as a long category scrolls. A wheel first, as a person scrolls: the page
    // keeps a category just chosen at its heading while its panels load, until the person scrolls, presses or types,
    // and window.scrollTo is none of those.
    await list.locator('.sf-jump[data-category="chat"]').click()
    await app.page.mouse.wheel(0, 400)
    await app.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await app.page.evaluate(() => window.scrollY), mode).toBeGreaterThan(0)
    expect(await app.page.locator('.sf-row').evaluate((el) => Math.round(el.getBoundingClientRect().top)), mode).toBe(0)
  }
}, 180_000)

it('wraps the category row and lets it scroll away when the page is narrow beside the chat', async () => {
  for (const [width, chat] of [[1024, SPLIT_WIDTH_TO_START_WITH], [1440, 1440 - SPLIT_LEAVES_THE_WINDOW]] as const) {
    for (const language of ['en', 'zh']) {
      const context = await app.browser.newContext({ viewport: { width, height: 900 } })
      try {
        await context.addInitScript(([key, size]) => {
          localStorage.setItem(key, 'split')
          localStorage.setItem('mole-office.chat.split-side', 'right')
          localStorage.setItem('mole-office.chat.split-width', String(size))
        }, [CHAT_OPEN_KEY, chat] as const)
        const page = await context.newPage()
        await open(page, 'inspect', language)
        await page.locator('.px-chat[data-where="split"]').waitFor()
        const row = page.locator('.set .sf-row')
        const list = row.locator('.sf-list')
        const group = list.locator('.sf-group')
        const where = `${width}, ${language}`
        expect(await list.getByRole('button').count(), where).toBe(DEVELOPER_KEYS.length)
        expect(await row.evaluate((el) => getComputedStyle(el).position), where).toBe('static')
        expect(await list.evaluate((el) => getComputedStyle(el).flexWrap), where).toBe('wrap')
        expect(await group.evaluate((el) => getComputedStyle(el).flexWrap), where).toBe('wrap')
        expect(await list.evaluate((el) => getComputedStyle(el).overflowX), where).toBe('visible')
      } finally {
        await context.close()
      }
    }
  }
}, 120_000)

it('shows all categories or marks more and keeps the strip clear of text while scrolling at 390', async () => {
  const page = app.page
  try {
    const theme = 'light'
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
    await open(page, 'normal')
    expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
    const list = page.locator('.set .sf-list')
    const visibility = await list.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const all = [...el.querySelectorAll('button')].every((press) => {
        const r = press.getBoundingClientRect()
        return r.left >= box.left && r.right <= box.right
      })
      const mark = el.parentElement?.querySelector<HTMLElement>('.px-reach-edge[data-side="right"]')
      return { all, more: mark !== null && mark !== undefined && mark.checkVisibility() && mark.getBoundingClientRect().width > 0 }
    })
    expect(visibility.all || visibility.more, `${theme}: hidden categories need a sign`).toBe(true)
    await page.locator('.sf-jump[data-category="chat"]').click()
    await page.mouse.wheel(0, 600)
    await page.evaluate(() => window.scrollTo(0, 600))
    await expect.poll(() => page.evaluate(() => {
      const row = document.querySelector('.sf-row')!.getBoundingClientRect()
      const bar = document.querySelector('.shell-bar')!.getBoundingClientRect()
      return row.bottom <= bar.bottom + 1
    }), { message: `${theme}: the strip covers page text` }).toBe(true)
  } finally {
    await page.setViewportSize({ width: 1440, height: 900 })
  }
}, 120_000)

/** Every panel the page draws, category by category, and the heading of the category each was drawn under. */
async function panelsInEveryCategory(page: Page): Promise<{ surface: string; under: string | null }[]> {
  const found: { surface: string; under: string | null }[] = []
  await readEverySettingsCategory(page, async () => {
    const under = await page.locator('.set .sf-cat-title').textContent()
    for (const surface of await drawnPanels(page)) found.push({ surface, under })
  })
  return found
}

it('draws, category by category, exactly the panels normal mode drew before, in normal mode, and every panel in developer mode, each once and under its own category', async () => {
  const inABrowser = SETTINGS_PANELS.filter((panel) => !WINDOW_ONLY_PANELS.has(panel))
  for (const [mode, wanted] of [['normal', inABrowser.filter((panel) => !DEVELOPER_ONLY_PANELS.has(panel))], ['inspect', inABrowser]] as const) {
    await open(app.page, mode)
    const found = await panelsInEveryCategory(app.page)
    expect(found.map(({ surface }) => surface).sort(), mode).toEqual([...wanted].sort())
    // Each once, under the heading of the category the page says it is in.
    for (const { surface, under } of found) expect(under, `${mode}: ${surface}`).toBe(en[whereThePanelIs(surface as typeof inABrowser[number]).category])
    // A browser tab draws none of the window's own panels, in either mode.
    expect(found.filter(({ surface }) => (WINDOW_ONLY_PANELS as ReadonlySet<string>).has(surface)), mode).toEqual([])
  }
  expect(WINDOW_ONLY_PANELS.size).toBeGreaterThan(0)
}, 180_000)

it('draws every panel of the chosen category open, with no press that folds it, and the presses in its list answer the keyboard', async () => {
  await open(app.page, 'inspect')
  let panels = 0
  await readEverySettingsCategory(app.page, async (category) => {
    for (const surface of await drawnPanels(app.page)) {
      panels++
      // Open: what the panel holds is drawn and seen, without a press.
      const block = app.page.locator(`.set [data-settings-panel="${surface}"]`)
      expect(await app.page.locator(`.set [data-target="uiSurface/${surface}"]`).count(), `${category}: ${surface}`).toBeGreaterThan(0)
      // The one entry that leads to a page of its own holds its link and one line, and nothing to open.
      if (surface === 'settings.arrangesidebar') expect(await block.locator('.sf-body').count(), surface).toBe(0)
      else expect(await block.locator('> .sf-body').isVisible(), `${category}: ${surface}`).toBe(true)
    }
    // No fold: a panel's title holds no press, and nothing on the page says it can be expanded or collapsed.
    expect(await app.page.locator('.set .sf-head button, .set .sf-press').count(), category).toBe(0)
    expect(await app.page.locator('.set .sf-head [aria-expanded], .set [data-settings-panel][aria-expanded], .set [data-settings-panel][data-open], .set details[data-settings-panel]').count(), category).toBe(0)
  })
  expect(panels).toBeGreaterThan(30)
  // By keyboard: focus the "Looks" press and press Enter, then the "Chat and messages" press and press Space.
  await app.page.locator('.set .sf-jump[data-category="looks"]').focus()
  await app.page.keyboard.press('Enter')
  await expect.poll(() => shownCategory(app.page)).toEqual({ key: 'looks', title: en['settingsCats.cat.looks'], drawn: 1 })
  await app.page.locator('.set .sf-jump[data-category="chat"]').focus()
  await app.page.keyboard.press('Space')
  await expect.poll(() => shownCategory(app.page)).toEqual({ key: 'chat', title: en['settingsCats.cat.chat'], drawn: 1 })
  await app.page.locator('.set [data-target="uiSurface/settings.inject"]').waitFor()
}, 240_000)

it('draws the mail tool as the first tool entry: one row with its name and its state, and the install press inside', async () => {
  await open(app.page, 'normal')
  await app.page.locator('.set .sf-jump[data-category="tools"]').click()
  const tools = app.page.locator('.set .sf-cat[data-category="tools"] [data-settings-panel]')
  await tools.first().waitFor()
  // The Tools entries and their order are the panels the declaration puts in the tools category, read through
  // panelsInCategory in src/shared/settings-structure.ts for normal mode outside the window. The mail tool is the
  // first of them, which is what this case is about; the rest follow in the declaration's order.
  const expectedTools = panelsInCategory('tools', false, false).map((panel) => panel.key)
  const drawnTools = await tools.evaluateAll((all) => all.map((one) => one.getAttribute('data-settings-panel')))
  expect(drawnTools).toEqual(expectedTools)
  expect(drawnTools[0]).toBe('settings.mailtool')
  const entry = tools.first()
  expect(await entry.locator('.sf-title').textContent()).toBe(en['settingsPanel.title.mailtool'])
  // The entry is open, so the install press is there without a press to open it, and the state is drawn once,
  // by the entry, with no second copy in its title.
  await entry.getByRole('button', { name: en['settingsPanel.mailtool.install'] }).waitFor()
  const states = Object.keys(en).filter((key) => key.startsWith('settingsPanel.mailtool.state.')).map((key) => en[key as WordKey])
  await expect.poll(async () => (await entry.locator('.imt-said').allInnerTexts()).filter((said) => states.includes(said)).length).toBe(1)
  const title = await entry.locator('.sf-head').innerText()
  expect(states.filter((said) => typeof said === 'string' && title.includes(said)), 'the title draws the state again, which the entry draws').toEqual([])
}, 120_000)

it('opens the category of the panel an address names and scrolls to the panel, and the profile panel from the owner\'s own picture in the chat', async () => {
  for (const surface of ['settings.inject', 'settings.whatiskept', 'settings.language'] as const) {
    await open(app.page, 'normal', 'en', settingsPath(surface))
    const block = app.page.locator(`.set [data-settings-panel="${surface}"]`)
    await block.locator(`[data-target="uiSurface/${surface}"]`).waitFor()
    // Its category is the one shown, and the one marked chosen in the list. Only that category is drawn.
    const shown = await shownCategory(app.page)
    expect(shown.title, surface).toBe(en[whereThePanelIs(surface).category])
    expect(shown.drawn, surface).toBe(1)
    expect(await markedChosen(app.page), surface).toEqual([shown.key])
    // Scrolled to: the panel's top is at the top of the window.
    await expect.poll(() => whereItIs(app.page, `[data-settings-panel="${surface}"]`), { message: surface }).toBe('at its top')
  }
  // The owner's own picture at the outermost view of the chat leads to "Your profile", open.
  await app.page.goto(`${app.site}/?mode=normal#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click('.px-chat-me .px-chat-face')
  await app.page.waitForFunction(() => window.location.hash.includes('settings'), undefined, { timeout: 20_000 })
  expect(new URL(app.page.url()).hash).toBe(`#${settingsPath('settings.appearance')}`)
  await app.page.locator('.set [data-settings-panel="settings.appearance"] [data-target="uiSurface/settings.appearance"]').waitFor()
  expect((await shownCategory(app.page)).title).toBe(en[whereThePanelIs('settings.appearance').category])
}, 180_000)

it('opens every panel\'s category from its address and scrolls to it, and the three panels that became pages lead to them', async () => {
  await open(app.page, 'inspect')
  // The address changes in the same page, as a link on another page does, and each panel is read in turn.
  for (const surface of SETTINGS_PANELS.filter((panel) => !WINDOW_ONLY_PANELS.has(panel))) {
    await app.page.evaluate((hash) => { window.location.hash = hash }, settingsPath(surface))
    await app.page.locator(`.set [data-settings-panel="${surface}"]`).waitFor()
    await expect.poll(async () => (await shownCategory(app.page)).title, { message: surface }).toBe(en[whereThePanelIs(surface).category])
    // The panels above it load after the scroll and push it down, and the page follows them; the claim is where the
    // panel comes to rest, not how soon, so the wait is longer than the default.
    await expect.poll(() => whereItIs(app.page, `[data-settings-panel="${surface}"]`), { message: surface, timeout: 15_000 }).toBe('at its top')
  }
  // Gates, Office controls and the sidebar's arrangement have pages of their own (message 068zuX0EZMQu), and
  // each old address leads there, with the new address in the bar.
  expect(Object.keys(MOVED_SETTINGS_PANELS).sort()).toEqual(['gates', 'officecontrols', 'sidebar'])
  for (const [word, page] of Object.entries(MOVED_SETTINGS_PANELS)) {
    await app.page.goto('about:blank')
    await app.page.goto(`${app.site}/?lang=en&mode=inspect#/settings/${word}`)
    await waitForThePage(app.page, 30_000)
    await expect.poll(() => new URL(app.page.url()).hash, { message: word }).toBe(`#/${page}`)
    await app.page.locator('.pfs').waitFor()
  }
}, 300_000)

it('opens the Normal or Developer panel, with a line saying so, when an address names a developer-only panel in normal mode', async () => {
  await open(app.page, 'normal', 'en', settingsPath('settings.keys'))
  expect(await app.page.locator('.set [data-settings-panel="settings.keys"]').count()).toBe(0)
  // The mode switch's category is shown, and the switch itself is open.
  const mode = app.page.locator('.set [data-settings-panel="settings.mode"]')
  expect((await shownCategory(app.page)).title).toBe(en[whereThePanelIs('settings.mode').category])
  expect(await mode.locator('> .sf-body').isVisible()).toBe(true)
  const line = mode.locator('[data-named-panel="settings.keys"]')
  expect(await line.innerText()).toBe(en['settingsCats.shownInDeveloperMode'].replace('{panel}', en['settingsPanel.title.keys']))
  // Switching to developer mode there shows the named panel's category, and the panel in it.
  await mode.getByRole('button', { name: en['settingsPanel.mode.developer' as WordKey] as string, exact: true }).click()
  await app.page.locator('.set [data-settings-panel="settings.keys"] [data-target="uiSurface/settings.keys"]').waitFor()
  expect((await shownCategory(app.page)).title).toBe(en[whereThePanelIs('settings.keys').category])
  expect(await line.count()).toBe(0)
  // In developer mode the same address opens the panel itself.
  await open(app.page, 'inspect', 'en', settingsPath('settings.keys'))
  await app.page.locator('.set [data-settings-panel="settings.keys"] [data-target="uiSurface/settings.keys"]').waitFor()
  expect(await app.page.locator('.set [data-named-panel]').count()).toBe(0)
}, 120_000)

it('remembers the category chosen last in this browser, and says so when the word it kept names no category', async () => {
  const kept = () => app.page.evaluate((key) => localStorage.getItem(key), SETTINGS_CATEGORY_KEY)
  await app.page.evaluate((key) => localStorage.removeItem(key), SETTINGS_CATEGORY_KEY)
  // Nothing kept: the first category.
  await open(app.page, 'normal')
  expect((await shownCategory(app.page)).key).toBe('you')
  await app.page.locator('.set .sf-jump[data-category="work"]').click()
  expect(await kept()).toBe('work')
  await open(app.page, 'normal')
  expect((await shownCategory(app.page)).key).toBe('work')
  expect(await markedChosen(app.page)).toEqual(['work'])
  // A developer category is kept too. Normal mode does not see it and shows the first, and keeps the word.
  await open(app.page, 'inspect')
  await app.page.locator('.set .sf-jump[data-category="devRuns"]').click()
  await open(app.page, 'normal')
  expect((await shownCategory(app.page)).key).toBe('you')
  expect(await kept()).toBe('devRuns')
  await open(app.page, 'inspect')
  expect((await shownCategory(app.page)).key).toBe('devRuns')
  // A word this build has no category for is dropped, and the page says so above the list.
  await app.page.evaluate((key) => localStorage.setItem(key, 'made-up-category'), SETTINGS_CATEGORY_KEY)
  await open(app.page, 'normal')
  expect((await shownCategory(app.page)).key).toBe('you')
  expect(await app.page.locator('.set [data-settings-category-fault]').innerText()).toContain('made-up-category')
  expect(await kept()).toBeNull()
}, 120_000)


it('photographs Settings in categories at four widths in both looks, at 1440 in Chinese and in the test language', async () => {
  if (!shots) return
  const views: { width: number; theme: string; mode: Mode; language: string; address: string; name: string }[] = []
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) {
    views.push({ width, theme, mode: 'normal', language: 'en', address: '/settings', name: 'first' })
    views.push({ width, theme, mode: 'normal', language: 'en', address: settingsPath('settings.mailtool'), name: 'mail' })
    views.push({ width, theme, mode: 'inspect', language: 'en', address: '/settings', name: 'developer' })
  }
  for (const theme of ['light', 'dark']) views.push({ width: 1440, theme, mode: 'normal', language: 'zh', address: '/settings', name: 'first' })
  views.push({ width: 1440, theme: 'light', mode: 'normal', language: 'zh', address: settingsPath('settings.mailtool'), name: 'mail' })
  views.push({ width: 1440, theme: 'light', mode: 'normal', language: 'zh', address: settingsPath('settings.keys'), name: 'named-developer-panel' })
  views.push({ width: 1440, theme: 'light', mode: 'inspect', language: 'xx', address: settingsPath('settings.inject'), name: 'inject' })
  views.push({ width: 390, theme: 'light', mode: 'normal', language: 'en', address: settingsPath('settings.whatiskept'), name: 'kept-scrolled' })
  for (const view of views) {
    const context = await app.browser.newContext({ viewport: { width: view.width, height: 1000 } })
    try {
      await context.addInitScript((theme) => {
        localStorage.setItem('mole-office.preset.theme', theme)
        localStorage.setItem('mole-office.workspace', 'heron-study')
      }, view.theme)
      const page = await context.newPage()
      await page.goto(`${app.site}/?lang=${view.language}&mode=${view.mode}#${view.address}`)
      await waitForThePage(page, 30_000)
      await page.locator('.set .sf-row').waitFor()
      await page.waitForFunction(() => document.querySelectorAll('.set .px-loading').length === 0, undefined, { timeout: 30_000 })
      expect(await page.locator('html').getAttribute('data-theme')).toBe(view.theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth), JSON.stringify(view)).toBeLessThanOrEqual(view.width)
      const file = `settings-cats-${view.width}-${view.theme}-${view.mode === 'inspect' ? 'developer' : 'normal'}-${view.language}-${view.name}.png`
      // A whole-page picture is taken from the top, or the row, which stays at the top of the window, is drawn
      // where the window was. The one scrolled picture shows the window where the address left it.
      if (view.name !== 'kept-scrolled') await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: join(shots, file), fullPage: view.name !== 'kept-scrolled' })
    } finally { await context.close() }
  }
}, 600_000)
