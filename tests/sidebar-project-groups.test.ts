// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13j round 14): the check that switching the project changes only the project area
// read the project's rows on #/records, filed as tasks. All records now reads across projects, a change
// a decision made. So the check reads them on #/ideas, one of the project's own pages,
// filed as ideas. What it proves about the sidebar is unchanged.
// Test change (wave 13y round 165): the one-style sidebar keeps five pages in front and lists every other
// page on All pages, with the project block and its Switch under This project there. So the check reads the
// sidebar's front list in the sidebar, and the project's rows, its name and the developer group on All pages.
// The block and its Switch then went back to the sidebar, and the block draws a row only for
// a project page the person pinned. So the project's name, its Switch and its words are read in the sidebar again,
// as before, and the project's rows in This project's group on All pages.
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openSettingsPanel } from './settings-folds.ts'
import { fallbackRowsNotWaiting, howManyWaitWithNoChinese } from './words-waiting-for-translation.ts'
import { switchTheProject, theProjectIdOnScreen, theProjectOnScreen, waitForTheProjects } from './switch-the-project.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, type PageLanguage, type WordKey } from '../src/shared/i18n.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

let app: LiveApp
const shots = process.env.W13Q_SIDEBAR_SHOTS
const projects = [{ id: 'test-copper', title: 'Copper Studio' }, { id: 'test-lake', title: 'Lake Books' }]
const PERSON = 'Robin Vale'
const panel = `[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'settings.projects' })}"]`
const wordPanel = `[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'settings.words' })}"]`

beforeAll(async () => {
  app = await liveApp({ name: 'sidebar-s1', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: headers, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  for (const project of projects) {
    const made = await fetch(`${app.api}/api/workspaces`, { method: 'POST', headers, body: JSON.stringify(project) })
    expect(made.status, await made.text()).toBe(201)
    const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: { ...headers, 'x-mole-office-workspace': project.id },
      body: JSON.stringify({ kind: 'idea', title: `${project.title} fixture task`, data: {} }) })
    expect(filed.status, await filed.text()).toBe(201)
  }
  // A made-up name for the person, because the sidebar's foot now draws the person's name.
  const named = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers, body: JSON.stringify({ name: PERSON }) })
  expect(named.status, await named.text()).toBe(200)
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.workspace', 'test-copper')
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('look') ?? 'light')
  })
  if (shots) mkdirSync(shots, { recursive: true })
})

afterAll(async () => { await app?.stop() })

it('draws the shared levels, switches only the project area, opens the shared chat and keeps project actions in Settings, with all four word checks', async () => {
  const page = app.page
  // A PAGE OF THE PROJECT, so switching the project changes what it lists. All records stands under
  // All projects and reads across projects, as a decision set it. So a switch no longer
  // changes its rows; Ideas is one of the project's own pages.
  await page.goto(`${app.site}/?lang=en#/ideas`)
  await waitForThePage(page, 30_000)
  await waitForTheProjects(page)
  // The sidebar draws no group: six pages stand in front, followed by All pages.
  const front = page.locator('.shell-nav .shell-link .shell-label')
  expect(await page.locator('.shell-nav .shell-cap, .shell-nav [data-group]').count()).toBe(0)
  const frontWords: WordKey[] = ['nav.home', 'nav.chat', 'nav.notes', 'myNotes.title', 'nav.checklists', 'nav.decisions', 'nav.allPages']
  expect(await front.allTextContents()).toEqual(frontWords.map(key => createI18n('en').t(key)))
  expect(await page.locator('#shell-side [data-group="developer"]').count()).toBe(0)
  // Criterion change in wave 13p round 30: the merge queue page stands after Pipelines.
  // Criterion change in wave 13q round 44: Messages is no longer in the block.
  // Criterion change of 13 November 2026: Board joined after Pipelines, because package BV added the Board page to the
  // project group in src/shared/sidebar-arrangement.ts, between `pipeline` and `mergequeue`.
  // Test change (wave 13y round 165): the project's rows stand under This project on All pages.
  await page.evaluate(() => { location.hash = '#/all-pages' })
  await page.locator('#main .ap-group[data-group="project"] a.ap-page').first().waitFor({ timeout: 30_000 })
  expect(await page.locator('#main .ap-group[data-group="project"] a.ap-page > span:first-of-type').allTextContents()).toEqual([
    'Modules',
    'Pipelines',
    'Board',
    'Merge queue',
    'Findings',
    'Ideas',
    'Shelved',
  ])
  expect(await page.locator('#main .ap-group[data-group="developer"]').count()).toBe(0)
  await page.evaluate(() => { location.hash = '#/ideas' })
  expect(await page.locator('#shell-side').getByRole('button', { name: 'Make a project', exact: true }).count()).toBe(0)
  expect(await page.locator('#shell-side').getByRole('button', { name: 'Rename this project', exact: true }).count()).toBe(0)
  await page.getByText('Copper Studio fixture task', { exact: true }).first().waitFor()
  // Everything in the column but the project block stays as it was when the project changes.
  const outsideTheBlock = () => page.locator('.shell-nav').evaluate((nav) => {
    const copy = nav.cloneNode(true) as HTMLElement
    copy.querySelector('.sbp-block')?.remove()
    return copy.innerHTML
  })
  const before = await outsideTheBlock()
  await switchTheProject(page, 'test-lake')
  await page.getByText('Lake Books fixture task', { exact: true }).first().waitFor()
  expect(await page.locator('#main').innerText()).not.toContain('Copper Studio fixture task')
  expect(await theProjectOnScreen(page)).toBe('Lake Books')
  expect(await outsideTheBlock()).toBe(before)
  await page.locator('.shell-collapse').click()
  expect(await page.locator('.sbp-settings[href="#/settings"]').isVisible()).toBe(true)
  await page.locator('.shell-collapse').click()
  // THE SIDEBAR'S CHAT OPENS THE CHAT BESIDE THE PAGE, as the chat's design D says, and the corner
  // is not drawn over it. Plan row C1 opened the chat page instead, until round 161 of wave 13y. The
  // seam's press puts the chat away again, so the page is whole for the steps below.
  await page.locator('.shell-chat').click()
  await page.waitForFunction(() => document.querySelector('.px-chat[data-where="split"]') !== null)
  expect(await page.locator('.px-chat-circle').count()).toBe(0)
  await page.locator('.px-chat-seam-away').click()
  await page.waitForFunction(() => document.querySelector('.px-chat[data-where="split"]') === null)

  // Settings stands at the foot.
  await page.locator('.sbp-settings[href="#/settings"]').click()
  // Every Settings panel is folded to its title: open Projects first.
  await openSettingsPanel(page, 'settings.projects')
  await page.locator(`${panel} .project-actions-current`).getByText('Lake Books', { exact: true }).waitFor()
  // In normal mode the press says what renaming keeps; the stored id itself is for developer mode.
  expect(await page.locator(panel).getByRole('button', { name: 'Rename this project', exact: true }).getAttribute('title'))
    .toBe('Change the name of Lake Books. Its records and links stay with it.')
  await page.locator(panel).getByRole('button', { name: 'Rename this project', exact: true }).click()
  await page.locator('#settings-project-rename').fill('Lake Library')
  await page.locator(panel).getByRole('button', { name: 'Rename it', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.sbp-name')?.textContent === 'Lake Library')
  await page.locator(panel).getByRole('button', { name: 'Rename this project', exact: true }).click()
  await page.locator('#settings-project-rename').fill('Discard this name')
  await page.locator(panel).getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await theProjectOnScreen(page)).toBe('Lake Library')
  await page.locator(panel).getByRole('button', { name: 'Make a project', exact: true }).click()
  await page.locator('#settings-project-make').fill('Paper Kites')
  await page.locator(panel).getByRole('button', { name: 'Make it', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.sbp-name')?.textContent === 'Paper Kites')
  expect(await theProjectIdOnScreen(page)).toBe('paper-kites')
  await switchTheProject(page, 'test-copper')

  for (const language of ['zh', 'xx'] as const) {
    await page.goto(`${app.site}/?lang=${language}#/records`)
    await waitForThePage(page, 30_000)
    await waitForTheProjects(page)
    const reader = createI18n(language)
    // The same six pages and All pages, in the reader's language.
    const expected = frontWords.map(key => reader.t(key))
    expect(await front.allTextContents()).toEqual(expected)
    expect(await theProjectOnScreen(page)).toBe('Copper Studio')
    await page.locator('#shell-side details').evaluateAll(all => all.forEach(one => one.setAttribute('open', '')))
    const words = await sidebarWords()
    expect(words.join('\n')).not.toMatch(/test-copper|test-lake|paper-kites|\/api\/|\/home\/|localhost|127\.0\.0\.1|\b(?:database|branch|port|workspaceId|sessionId)\b/)
    expect(words.join('\n')).not.toMatch(/\b(?:nothing here|no records|nobody has|no one has|not recorded)\b/i)
    if (language === 'xx') {
      const contentWords = new Set(['Mole Office', 'Copper Studio', 'Lake Library', 'Paper Kites', 'Default', PERSON])
      expect(words.filter(word => !contentWords.has(word) && !/^⟦[\s\S]*⟧$/.test(word) && !/^\d+$/.test(word))).toEqual([])
    }
    await page.goto(`${app.site}/?lang=${language}#/settings`)
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.projects')
    await page.locator(panel).getByRole('button', { name: reader.t('nav.makeProject'), exact: true }).click()
    await page.locator('#settings-project-make').fill('...')
    expect(await page.locator(panel).innerText()).toContain(reader.t('nav.nameForCreation'))
    expect(await page.locator(panel).getByRole('button', { name: reader.t('nav.make'), exact: true }).isDisabled()).toBe(true)
    await page.locator(panel).getByRole('button', { name: reader.t('nav.cancel'), exact: true }).click()
    await page.locator(panel).getByRole('button', { name: reader.t('nav.renameProject'), exact: true }).click()
    await page.locator('#settings-project-rename').fill('')
    expect(await page.locator(panel).innerText()).toContain(reader.t('nav.nameRequired'))
    expect(await page.locator(panel).getByRole('button', { name: reader.t('nav.rename'), exact: true }).isDisabled()).toBe(true)
    await page.locator(panel).getByRole('button', { name: reader.t('nav.cancel'), exact: true }).click()
    // Test change (wave 13y round 165): the developer group is listed on All pages in developer mode.
    await page.goto(`${app.site}/?lang=${language}&mode=inspect#/all-pages`)
    await waitForThePage(page, 30_000)
    await page.locator('#main .ap-group[data-group="developer"]').waitFor({ timeout: 30_000 })
    expect(await page.locator('#main .ap-group[data-group="developer"]').count()).toBe(1)
    await page.evaluate(() => { location.hash = '#/settings' })
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.words')
    await page.locator(wordPanel).waitFor()
    const check = await page.locator(wordPanel).innerText()
    expect(check).toContain(reader.t('settings.words.missing', { language: 'English', n: 0 }))
    // The counts are of the whole list, so Chinese misses the words that wait with no Chinese yet, and only those may
    // fall back, as decided in wave 13j's round 42. Chinese that was taken out is not waiting,
    // and still fails.
    expect(check).toContain(reader.t('settings.words.missing', { language: '中文', n: howManyWaitWithNoChinese() }))
    // By its own name: the words waiting for translation are drawn below it in the same panel (check yujhLhEzMZSN).
    // It is read once that list has answered, so it is read as it is finally drawn.
    await page.locator(`${wordPanel} [data-words-waiting-count]`).waitFor()
    const fellBack = await page.locator(`${wordPanel} [data-word-fallbacks] li`).allTextContents()
    expect(fallbackRowsNotWaiting(fellBack)).toEqual([])
    if (fellBack.length === 0) expect(await page.locator(`${wordPanel} [data-word-fallbacks]`).textContent()).toBe(reader.t('settings.words.none'))
  }
  await page.route('**/api/workspaces', route => route.fulfill({ status: 500, json: { error: `private-location ${THE_TEST_FIXTURE_ROOT}:7711` } }))
  await page.goto(`${app.site}/?lang=xx#/records`)
  await page.locator('.sbp-block .shell-fault').waitFor()
  const refused = await page.locator('.sbp-block').innerText()
  expect(refused).toContain(createI18n('xx').t('nav.empty'))
  expect(refused).toContain(createI18n('xx').t('nav.projectsFailed'))
  expect(refused).not.toMatch(/private-location|\/home\/|7711|test-copper/)
  await page.unroute('**/api/workspaces')
  if (shots) await photograph()
}, 180_000)

async function sidebarWords(): Promise<string[]> {
  return app.page.locator('#shell-side').evaluate(side => {
    const words: string[] = []
    const walker = document.createTreeWalker(side, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement
      if (parent?.closest('style, svg, [aria-hidden="true"], .px-review-switch, .px-point-switch')) continue
      const text = walker.currentNode.textContent?.trim()
      if (text) words.push(text)
    }
    for (const node of side.querySelectorAll('[title], [aria-label], [placeholder], img[alt]')) {
      if (node.closest('[aria-hidden="true"], .px-review-switch, .px-point-switch')) continue
      for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
        const text = node.getAttribute(attribute)?.trim()
        if (text) words.push(text)
      }
    }
    return words
  })
}

async function photograph() {
  const page = app.page
  const measurements = []
  const variants: { width: number; theme: string; language: PageLanguage }[] = []
  for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark']) variants.push({ width, theme, language: 'en' })
  for (const theme of ['light', 'dark']) variants.push({ width: 1440, theme, language: 'zh' })
  variants.push({ width: 1440, theme: 'light', language: 'xx' })
  for (const variant of variants) {
    const { width, theme, language } = variant
    await page.setViewportSize({ width, height: 1100 })
    await page.goto(`${app.site}/?lang=${language}&look=${theme}#/records`)
    await waitForThePage(page, 30_000)
    await waitForTheProjects(page)
    if (width < 1024) await page.locator('.shell-menu').click()
    expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
    const size = await page.evaluate(() => ({ viewport: innerWidth, drawn: document.documentElement.scrollWidth }))
    expect(size.drawn).toBeLessThanOrEqual(width)
    measurements.push({ ...variant, ...size })
    await page.screenshot({ path: join(shots!, `sidebar-${width}-${theme}-${language}.png`) })
    if (width < 1024) {
      // Test change (wave 13y round 165): the menu's last part is the foot now.
      await page.locator('.sbp-foot').scrollIntoViewIfNeeded()
      await page.screenshot({ path: join(shots!, `sidebar-foot-${width}-${theme}-${language}.png`) })
      await page.locator('.shell-close').click()
    }
    await page.goto(`${app.site}/?lang=${language}&look=${theme}#/settings`)
    await waitForThePage(page, 30_000)
    await openSettingsPanel(page, 'settings.projects')
    await page.locator(panel).scrollIntoViewIfNeeded()
    await page.locator(panel).screenshot({ path: join(shots!, `projects-${width}-${theme}-${language}.png`) })
  }
  writeFileSync(join(shots!, 'measurements.json'), JSON.stringify(measurements, null, 2))
}
