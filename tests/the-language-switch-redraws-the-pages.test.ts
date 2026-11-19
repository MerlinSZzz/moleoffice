// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aMadeUpModuleForPackage, httpPackageFixture } from './module-package-fixture.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { visibleTextOutsideTestWords } from './the-test-language.ts'
import { howManyWaitWithNoChinese } from './words-waiting-for-translation.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { DelegationReply } from '../src/web/api.ts'

let app: LiveApp
const panel = '[data-target="uiSurface/settings.language"]'
const words = '[data-target="uiSurface/settings.words"]'
const title = 'Test task · 记录内容 stays as written'
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

async function post(path: string, data: unknown) {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(data) })
  expect(reply.status, await reply.clone().text()).toBe(201)
  return reply.json()
}

async function openSettings(page: Page, query = '') {
  await page.goto(`${app.site}/${query}#/settings`)
  await waitForThePage(page, 30_000)
  // Every Settings panel is folded to its title: open the Language panel first.
  await openSettingsPanel(page, 'settings.language')
  await page.locator(`${panel} input[value="zh"]`).waitFor()
  await page.waitForFunction((selector) => !document.querySelector<HTMLFieldSetElement>(`${selector} fieldset`)?.disabled, panel)
}

async function storedLanguage() {
  const reply = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { headers })
  expect(reply.status).toBe(200)
  return (await reply.json()).participant.language
}

beforeAll(async () => {
  app = await liveApp({ name: 'page-language', viewport: { width: 1440, height: 1000 } })
  const task = await post('/api/records', { kind: 'task', title, data: {} })
  await post(`/api/delegation/${task.record.id}/package`, {
    moduleIds: [await aMadeUpModuleForPackage(httpPackageFixture(app.api, join(app.dir, 'keys.json')))],
    forTheOutside: 'This is a test task for the language pictures.', suits: 'own_module',
    acceptance: 'The page keeps this test title as written.',
    acceptanceSource: { file: 'tests/the-language-switch-redraws-the-pages.test.ts', criterion: 'W1', commit: 'c27501b19' },
  })
}, 180_000)

afterAll(async () => { await app?.stop() })

it('redraws, saves across browsers, explains precedence, and wraps exactly the task page’s own words', async () => {
  await openSettings(app.page)
  expect(await app.page.locator(words).count()).toBe(0)
  expect(await app.page.locator('.language-test').count()).toBe(0)
  await app.page.locator(`${panel} input[value="zh"]`).check()
  await app.page.waitForFunction(() => document.documentElement.lang === 'zh' && document.querySelector('.language-source')?.textContent === '你选择了中文。' && !document.querySelector<HTMLFieldSetElement>('.language-options')?.disabled)
  // The panel's title is drawn by its fold now.
  expect(await app.page.locator('.set [data-settings-panel="settings.language"] .sf-title').textContent()).toBe('语言')
  expect(await storedLanguage()).toBe('zh')
  await app.page.reload()
  await app.page.waitForFunction(() => document.documentElement.lang === 'zh')
  expect(await app.page.locator('.set [data-settings-panel="settings.language"] .sf-title').textContent()).toBe('语言')

  const second = await app.browser.newContext({ locale: 'en-GB' })
  try {
    const page = await second.newPage()
    await openSettings(page)
    expect(await page.locator('html').getAttribute('lang')).toBe('zh')
    await openSettings(page, '?lang=en')
    expect(await page.locator('.language-source').innerText()).toBe('From the address: English')
    expect(await storedLanguage()).toBe('zh')
    await page.locator(`${panel} input[value=""]`).check()
    await page.waitForFunction(() => !document.querySelector<HTMLFieldSetElement>('.language-options')?.disabled)
    expect(await storedLanguage()).toBe(null)
    const firstRealReply = page.waitForResponse((reply) => reply.url().includes('/api/') && reply.status() === 200)
    await openSettings(page)
    const realReplyHeaders = (await firstRealReply).headers()
    const worldHeader = realReplyHeaders['x-mole-office-world']
    if (!worldHeader) throw new Error('The first real reply from this page had no world header.')
    const mockReplyHeaders = Object.fromEntries(
      Object.entries(realReplyHeaders).filter(([name]) => name === 'x-mole-office-world' || name.startsWith('access-control-')),
    )
    expect(await page.locator('.language-source').innerText()).toBe('Following this browser: English.')
    await page.evaluate(() => {
      type BannerWatch = Window & { __wrongWorldBannerShown?: boolean; __wrongWorldBannerObserver?: MutationObserver }
      const watch = window as BannerWatch
      watch.__wrongWorldBannerShown = document.querySelector('.px-ww') !== null
      watch.__wrongWorldBannerObserver = new MutationObserver((changes) => {
        for (const change of changes) {
          for (const added of change.addedNodes) {
            if (added instanceof Element && (added.matches('.px-ww') || added.querySelector('.px-ww') !== null)) {
              watch.__wrongWorldBannerShown = true
            }
          }
        }
      })
      watch.__wrongWorldBannerObserver.observe(document.documentElement, { childList: true, subtree: true })
    })
    // A refused save restores the visible choice and never claims success.
    await page.route('**/api/participants/person/*', (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, contentType: 'application/json', headers: mockReplyHeaders, body: JSON.stringify({ error: 'Test refusal' }) }) : route.continue())
    await page.locator(`${panel} input[value="zh"]`).click()
    await page.locator(`${panel} [role="alert"]`).waitFor()
    expect(await page.locator(`${panel} [role="alert"]`).innerText()).toBe('Your language choice could not be confirmed.')
    expect(await page.locator('html').getAttribute('lang')).toBe('en')
    const wrongWorldBannerWasShown = await page.evaluate(() => {
      type BannerWatch = Window & { __wrongWorldBannerShown?: boolean; __wrongWorldBannerObserver?: MutationObserver }
      const watch = window as BannerWatch
      watch.__wrongWorldBannerObserver?.disconnect()
      return watch.__wrongWorldBannerShown === true
    })
    expect(wrongWorldBannerWasShown).toBe(false)
    expect(await storedLanguage()).toBe(null)
    await page.unroute('**/api/participants/person/*')
    // The write reached the office, but its reply did not reach the browser. The words stay true.
    await page.route('**/api/participants/person/*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      await route.fetch()
      await route.abort('failed')
    })
    await page.locator(`${panel} input[value="zh"]`).click()
    await page.locator(`${panel} [role="alert"]`).waitFor()
    expect(await page.locator(`${panel} [role="alert"]`).innerText()).toBe('Your language choice could not be confirmed.')
    expect(await storedLanguage()).toBe('zh')
    await page.unroute('**/api/participants/person/*')
    await page.reload()
    await openSettings(page)
    expect(await page.locator('html').getAttribute('lang')).toBe('zh')
    await page.locator(`${panel} input[value=""]`).check()
    await page.waitForFunction(() => !document.querySelector<HTMLFieldSetElement>('.language-options')?.disabled)
    expect(await storedLanguage()).toBe(null)
  } finally { await second.close() }

  const chineseBrowser = await app.browser.newContext()
  try {
    await chineseBrowser.addInitScript(() => Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'zh-TW', 'en-GB'] }))
    const page = await chineseBrowser.newPage()
    await openSettings(page)
    expect(await page.locator('html').getAttribute('lang')).toBe('zh')
    expect(await page.locator('.language-source').innerText()).toBe('跟随此浏览器：中文。')
  } finally { await chineseBrowser.close() }

  await openSettings(app.page, '?mode=inspect&lang=en')
  await openSettingsPanel(app.page, 'settings.words')
  expect(await app.page.locator(words).innerText()).toContain('English: 0 missing')
  // Chinese misses exactly the words that wait with no Chinese yet, as the component sheet reads
  // it.
  // Chinese that was taken out is not waiting, so it still makes this count wrong.
  expect(await app.page.locator(words).innerText()).toContain(`中文: ${String(howManyWaitWithNoChinese())} missing`)
  // Settings offers no test language, in the developer view as well. A link to it once put every word in brackets,
  // and only closing the page took them away, which a desktop window with no address bar cannot do. The Language
  // panel is in You and the word check is in Looks: Settings draws one category at a time (wave 13y round 125), so
  // the Language panel's is chosen again.
  await openSettingsPanel(app.page, 'settings.language')
  expect(await app.page.locator('.set a[href*="lang=xx"]').count()).toBe(0)
  expect(await app.page.locator('.set').innerText()).not.toContain(sayInEnglish('settings.language.test'))
  // The address still draws the test language: every word of the Language panel's title is in brackets.
  await openSettings(app.page, '?mode=inspect&lang=xx')
  expect(await app.page.locator(`.set [data-settings-panel="settings.language"] .sf-title`).innerText()).toMatch(/^⟦.+⟧$/)
  expect(await visibleTextOutsideTestWords(app.page, '.set [data-settings-panel="settings.language"] .sf-title')).toEqual([])

  // The database supplied this row. The three overrides expose optional branches of this page.
  const delegation = await (await fetch(`${app.api}/api/delegation`, { headers })).json() as DelegationReply
  expect(delegation.tasks).toHaveLength(1)
  await app.page.route('**/api/delegation', async (route) => route.fulfill({ response: await route.fetch(), json: {
    ...delegation,
    tasks: delegation.tasks.map((row) => ({ ...row, responsible: null, heldBy: { kind: 'agent', id: 'test-agent' }, outsideName: 'Test outside worker' })),
  } }))
  await app.page.goto(`${app.site}/?lang=xx#/tasks-to-take`)
  await app.page.locator('.ttt-key').first().waitFor()
  // W1 owns this heading, lead, all four fact keys, and the Absence words and titles below.
  // Shared panel titles/actions, state/suit/participant words and server sentences belong to G0/E1.
  const own = '.ttt-title, .ttt-lead, .ttt-key, .ttt-fact .px-absent'
  expect(await app.page.locator('.ttt-key').count()).toBe(4)
  expect(await visibleTextOutsideTestWords(app.page, own)).toEqual([])
  expect(await app.page.locator('.ttt .px-row-title').innerText()).toBe(title)
  expect(await app.page.locator('.ttt-fact .px-absent').getAttribute('title')).toMatch(/^⟦.+·⟧$/)
  expect(await app.page.locator('.ttt-fact .px-absent').getAttribute('title')).toContain(sayInEnglish('tasksToTake.unrecordedTitle'))
  // Prove the helper sees handwritten words and ignores invisible text in the same scope.
  await app.page.locator('.ttt-title').evaluate((element) => element.insertAdjacentHTML('beforeend', '<span>Handwritten test word</span><span hidden>Hidden test word</span>'))
  expect(await visibleTextOutsideTestWords(app.page, '.ttt-title')).toEqual(['Handwritten test word'])

  await app.page.unroute('**/api/delegation')
  await app.page.route('**/api/delegation', async (route) => route.fulfill({ response: await route.fetch(), json: { ...delegation, tasks: [], couldNotRead: [] } }))
  await app.page.reload()
  await app.page.locator('.ttt-lead .px-absent').waitFor()
  expect(await visibleTextOutsideTestWords(app.page, '.ttt-title, .ttt-lead')).toEqual([])
  expect(await app.page.locator('.ttt-lead .px-absent').getAttribute('title')).toMatch(/^⟦.+·⟧$/)
  expect(await app.page.locator('.ttt-lead .px-absent').innerText()).toContain('none packaged')
  expect(await app.page.locator('.ttt-lead .px-absent').getAttribute('title')).toContain(sayInEnglish('tasksToTake.noneTitle'))
  await app.page.unroute('**/api/delegation')
  await app.page.route('**/api/delegation', async (route) => route.fulfill({ response: await route.fetch(), json: {
    ...delegation, tasks: [], couldNotRead: [{ recordId: delegation.tasks[0]!.recordId, title, because: 'Test package could not be read.' }],
  } }))
  await app.page.reload()
  await app.page.locator('.ttt-unreadable-title').waitFor()
  expect(await visibleTextOutsideTestWords(app.page, '.ttt-title, .ttt-lead')).toEqual([])
  expect(await app.page.locator('.ttt-lead .px-absent').innerText()).toContain('none readable')
  expect(await app.page.locator('.ttt-lead .px-absent').getAttribute('title')).toContain('None of the packaged tasks in this project could be read. They are listed below.')
  expect(await app.page.locator('.ttt-unreadable-title').innerText()).toBe(title)
  expect(await storedLanguage()).toBe(null)
  await app.page.unroute('**/api/delegation')

  if (process.env.W13Q_WORDS_SHOTS) await photograph(process.env.W13Q_WORDS_SHOTS)
}, 180_000)

/** Real test-office pages, including the seeded task; no intercepted replies in the pictures. */
async function photograph(folder: string) {
  mkdirSync(folder, { recursive: true })
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) for (const language of ['en', 'zh']) {
    const context = await app.browser.newContext({ viewport: { width, height: 1000 } })
    try {
      await context.addInitScript((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
      const page = await context.newPage()
      for (const name of ['settings', 'tasks'] as const) {
        if (name === 'settings') {
          await openSettings(page, `?lang=${language}`)
          await page.locator(panel).scrollIntoViewIfNeeded()
        } else {
          await page.goto(`${app.site}/?lang=${language}#/tasks-to-take`)
          await waitForThePage(page, 30_000)
          await page.locator('.ttt .px-row-title').waitFor()
        }
        expect(await page.locator('html').getAttribute('lang')).toBe(language)
        expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
        const overflow = await page.evaluate(() => ({ width: innerWidth, drawn: document.documentElement.scrollWidth }))
        console.log('W1 picture', name, width, theme, language, JSON.stringify(overflow))
        await page.screenshot({ path: join(folder, `${name}-${width}-${theme}-${language}.png`), fullPage: true })
        if (name === 'settings') await page.locator(panel).screenshot({ path: join(folder, `language-panel-${width}-${theme}-${language}.png`) })
      }
    } finally { await context.close() }
  }
  await openSettings(app.page, '?mode=inspect&lang=en')
  await openSettingsPanel(app.page, 'settings.words')
  await app.page.locator(words).scrollIntoViewIfNeeded()
  await app.page.screenshot({ path: join(folder, 'settings-word-check.png'), fullPage: true })
  await app.page.locator(words).screenshot({ path: join(folder, 'word-check-panel.png') })
  await app.page.goto(`${app.site}/?lang=xx#/tasks-to-take`)
  await app.page.locator('.ttt .px-row-title').waitFor()
  await app.page.screenshot({ path: join(folder, 'tasks-test-language.png'), fullPage: true })
}
