// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR AS DECIDED, wave 13q round 15 (R15a).
 *
 * 1. No All projects caption is drawn, because the place already means it. The group keeps its name
 *    for a screen reader (its heading stays in the page, hidden from sight), and its rows stand first,
 *    in the order round 14 drew.
 *    The sidebar now keeps six pages in front and draws no group, so
 *    no caption at all. The rest of the group stands under All projects on All pages, in round 14's order.
 * 2. Ask agent and Reviews stand under the sidebar's head, outside the list that scrolls, so at 1440
 *    by 900 on a project page a person sees them without scrolling.
 * 3. The person's foot is one line: the initial and the name, a light press and a dark press that
 *    show only an icon, and Settings as an icon. The presses write the one stored theme, the same
 *    one the Settings page writes. When the page writes as somebody else, the foot still says so in
 *    words.
 *    Test change (wave 13y round 165): Settings is now a row above that line, with its icon and its word.
 *
 * The browser half runs in a test office with made-up projects and a made-up name for the person.
 * Pictures are taken only when TEST_SHOTS names a folder.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { waitForTheProjects } from './switch-the-project.ts'
import { testShots } from './where-shots-go.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'

const PERSON = 'Tamsin Hale'
const PROJECTS = [
  { id: 'test-marsh', title: 'Marsh Weather' },
  { id: 'test-quill', title: 'Quill Ledger' },
]
const en = createI18n('en')
const SHOTS = testShots('sidebar-as-the-person-asked')
/**
 * The foot as round 12 drew it, the name on one line and the presses on the next: measured 73px high
 * in dark and 76px in light at 1440 by 900, before this round's change.
 */
const TWO_LINES = 73

describe('the sidebar as it was asked for, in a browser', () => {
  let app: LiveApp

  beforeAll(async () => {
    app = await liveApp({ name: 'sidebar-as-the-person-asked', workspace: 'default', viewport: { width: 1440, height: 900 } })
    const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    for (const project of PROJECTS) {
      const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify(project) })
      expect(made.status, await made.text()).toBe(201)
    }
    const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ name: PERSON }) })
    expect(named.status, await named.text()).toBe(200)
    await app.page.addInitScript(() => {
      if (sessionStorage.getItem('test.seeded') === null) {
        localStorage.setItem('mole-office.workspace', 'test-marsh')
        localStorage.setItem('mole-office.preset.theme', 'light')
        localStorage.setItem('mole-office.shell.sidebar', 'expanded')
        sessionStorage.setItem('test.seeded', '1')
      }
    })
  }, 240_000)

  afterAll(async () => { await app?.stop() })

  // A LOAD EVERY TIME: going to the same address with only a new hash is a move inside the page.
  let loads = 0
  async function open(query: string, address: string, width = 1440): Promise<void> {
    await app.page.setViewportSize({ width, height: 900 })
    loads += 1
    await app.page.goto(`${app.site}/?${query}&load=${String(loads)}#${address}`)
    await waitForThePage(app.page, 30_000)
    await waitForTheProjects(app.page)
    await app.page.locator('.sbp-person-name', { hasText: PERSON }).waitFor({ state: 'attached' })
  }

  // One sidebar style was chosen for the open and the narrowed sidebar. It
  // keeps six pages in front and lists every other page on All pages, so the sidebar draws no group and no caption
  // at all. Round 14's other All projects rows now stand under All projects on All pages, in the same order.
  it('draws no caption over its rows, keeps six pages first, and lists the rest of All projects on All pages in order', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    const nav = page.locator('.shell-nav')
    // Nothing is drawn as a caption over the sidebar's rows.
    expect(await nav.locator('h2, h3, [id^="shell-cap-"]').count()).toBe(0)
    // The six front pages stand in the column, then All pages.
    expect(await nav.locator('.shell-link .shell-label').allTextContents()).toEqual([
      en.t('nav.home'),
      en.t('nav.chat'),
      en.t('nav.notes'),
      en.t('myNotes.title'),
      en.t('nav.checklists'),
      en.t('nav.decisions'),
      en.t('nav.allPages'),
    ])
    // The rest of round 14's rows keep their order under All projects on All pages. Words for you to confirm joined
    // after Decisions on 10 October 2026, and Flows after Checklists in wave 13p round 35. Checklists now stands in
    // front, so Flows follows Counters here.
    await page.evaluate(() => { location.hash = '#/all-pages' })
    const all = page.locator('#main .ap-group[data-group="all"]')
    await all.waitFor({ timeout: 30_000 })
    expect(await all.locator('.ap-cap').textContent()).toBe(en.t('nav.allProjects'))
    expect(await all.locator('a.ap-page > span:first-of-type').allTextContents()).toEqual([
      'Words for you to confirm',
      'Work to do',
      'Schedule',
      'Resources',
      'Plans',
      'Goals',
      'Counters',
      'Flows',
      'Context bundles',
      'All records',
    ])
  }, 120_000)

  it('shows Ask agent and Reviews at 1440 by 900 on a project page without scrolling, and keeps them there', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    const inSight = () => page.evaluate(() => {
      const out: Record<string, boolean> = {}
      for (const selector of ['.px-point-switch', '.px-review-switch']) {
        const press = document.querySelector(selector)!
        const box = press.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        out[selector] = box.top >= 0 && box.bottom <= window.innerHeight && hit !== null && press.contains(hit)
      }
      return out
    })
    expect(await page.locator('.sbp-scroll').evaluate((one) => one.scrollTop)).toBe(0)
    expect(await inSight()).toEqual({ '.px-point-switch': true, '.px-review-switch': true })
    // They stand up top: under the head and above the first row of the list.
    const above = await page.evaluate(() => {
      const firstRow = document.querySelector('.shell-nav .shell-link')!.getBoundingClientRect().top
      const head = document.querySelector('.shell-side-head')!.getBoundingClientRect().bottom
      return ['.px-point-switch', '.px-review-switch'].map((selector) => {
        const box = document.querySelector(selector)!.getBoundingClientRect()
        return box.top >= head && box.bottom <= firstRow
      })
    })
    expect(above).toEqual([true, true])
    // They are not in the list that scrolls, so scrolling it leaves them where they are.
    await page.locator('.sbp-scroll').evaluate((one) => one.scrollTo(0, one.scrollHeight))
    expect(await inSight()).toEqual({ '.px-point-switch': true, '.px-review-switch': true })
  }, 120_000)

  // Test change (wave 13y round 165): Settings is now a row of its own at the top of the foot, with its icon and its
  // word, drawn as every other entry is. The person's line under it still holds the initial, the name and the look
  // presses, under the height of the old two lines.
  it('folds the person and the look into one line under the height of the old two, with Settings as a row above', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    const measured = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
      const middles = ['.sbp-disc', '.sbp-person-name', '.sbp-look'].map((selector) => {
        const one = box(selector)
        return one.top + one.height / 2
      })
      return {
        line: box('.sbp-foot-row').height,
        spread: Math.max(...middles) - Math.min(...middles),
        settingsAbove: box('.sbp-settings').bottom <= box('.sbp-foot-row').top,
      }
    })
    // The name and the look presses share one line, and Settings stands above it.
    expect(measured.spread).toBeLessThanOrEqual(2)
    expect(measured.line).toBeLessThan(TWO_LINES - 20)
    expect(measured.settingsAbove).toBe(true)
    // The look presses show only an icon, and each has a name and a hover word in the page language.
    const presses = await page.locator('.sbp-look-press').evaluateAll((all) => all.map((one) => ({
      text: one.textContent?.trim() ?? '', name: one.getAttribute('aria-label'), hover: one.getAttribute('title'),
    })))
    expect(presses).toEqual([
      { text: '', name: en.t('settingsPanel.look.light'), hover: en.t('sidebarFeedback.lookLight') },
      { text: '', name: en.t('settingsPanel.look.dark'), hover: en.t('sidebarFeedback.lookDark') },
    ])
    // Settings shows its word beside its icon, and its hover word says what the page is for, as every row's does.
    // Since wave 13p's keyboard shortcuts the hover word may end with the key that opens it, "(g s)".
    expect(await page.locator('.sbp-settings .shell-label').textContent()).toBe('Settings')
    const hover = await page.locator('.sbp-settings').getAttribute('title')
    expect(hover?.replace(/ \(.+\)$/, '')).toBe(en.t('nav.what.settings'))
    expect(await page.locator('.sbp-foot').getByRole('link', { name: 'Settings', exact: true }).count()).toBe(1)
  }, 120_000)

  it('changes the one stored theme from the foot’s icon press, and Settings shows it', async () => {
    const page = app.page
    await open('lang=en', '/modules')
    expect(await page.locator('html').getAttribute('data-theme')).toBe('light')
    await page.locator('.sbp-look').getByRole('button', { name: en.t('settingsPanel.look.dark'), exact: true }).click()
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark')
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBe('dark')
    expect(await page.locator('.sbp-look-press[aria-pressed="true"]').getAttribute('aria-label')).toBe(en.t('settingsPanel.look.dark'))
    await page.evaluate(() => { location.hash = '#/settings' })
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.look')
    expect(await page.locator('#preset-theme').inputValue()).toBe('dark')
    await page.locator('.sbp-look').getByRole('button', { name: en.t('settingsPanel.look.light'), exact: true }).click()
    expect(await page.locator('#preset-theme').inputValue()).toBe('light')
    expect(await page.evaluate(() => localStorage.getItem('mole-office.preset.theme'))).toBe('light')
  }, 120_000)

  it('still says in words at the foot when the page writes as somebody else', async () => {
    const page = app.page
    await open('lang=en&mode=inspect', '/settings')
    await openSettingsPanel(page, 'settings.writer')
    await page.selectOption('#settings-writer', 'agent')
    try {
      await open('lang=en&mode=normal', '/modules')
      const said = page.locator('.sbp-foot .sbp-writer')
      expect(await said.isVisible()).toBe(true)
      expect(await said.textContent()).toBe(en.t('sidebarProject.writesAs', { name: 'claude (agent)' }))
    } finally {
      await open('lang=en&mode=inspect', '/settings')
      await openSettingsPanel(page, 'settings.writer')
      await page.selectOption('#settings-writer', 'human')
    }
    expect(await page.locator('.sbp-writer').count()).toBe(0)
  }, 120_000)

  it.skipIf(!process.env.TEST_SHOTS)('photographs the sidebar at four widths in both looks, in Chinese and in the test language', async () => {
    const page = app.page
    const take = async (query: string, width: number, theme: 'light' | 'dark', name: string) => {
      await page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await open(query, '/modules', width)
      if (width < 1024) {
        await page.locator('.shell-menu').click()
        await page.locator('#shell-side[data-drawer="open"]').waitFor()
      }
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${SHOTS}/${name}.png` })
      const foot = await page.locator('.sbp-foot').boundingBox()
      console.log(`${name}: the foot is ${String(foot?.height)}px high`)
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) await take('lang=en', width, theme, `sidebar-${String(width)}-${theme}`)
    }
    await take('lang=zh', 1440, 'light', 'sidebar-1440-light-zh')
    await take('lang=zh', 1440, 'dark', 'sidebar-1440-dark-zh')
    await take('lang=xx', 1440, 'light', 'sidebar-1440-light-xx')
    // The narrow rail, where the foot stands as a column of icons.
    await page.evaluate(() => localStorage.setItem('mole-office.shell.sidebar', 'collapsed'))
    await take('lang=en', 1440, 'light', 'sidebar-1440-light-narrow')
    await page.evaluate(() => localStorage.setItem('mole-office.shell.sidebar', 'expanded'))
    await page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  }, 300_000)
})
