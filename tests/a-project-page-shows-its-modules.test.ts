// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S OWN PAGE SHOWS WHICH OF ITS MODULES ARE IN PROGRESS, BESIDE ITS CARDS. Wave 13k, round 22.
 *
 * Item 3 of a decision took round 19's recommendation (report bdR-Vb2wif9d): the modules
 * panel (components/ModulesPanel.tsx), which no page drew, goes on a project's own page, the page
 * that opens when the project's name is pressed in the sidebar (#/project).
 * Its two word changes:
 *   (a) the line under the rows no longer says "on the list above", which was written for Home;
 *   (b) its link goes to this project's Modules page (#/modules), not to the list of all records.
 *
 * WHAT IS HELD, in a test office with two made-up projects:
 *   1. the page draws the panel with its heading, its rows and the line under them, in exactly the
 *      new words, and the link opens the Modules page;
 *   2. it reads this project's own modules: a module of the other project is neither drawn nor counted;
 *   3. at 1440 the panel stands right of the cards with their tops level (the shared width rule,
 *      components/SideBySide.tsx), and at 990, 660 and 390 it stands under the cards on their left
 *      edge; no row is wider than the panel and the page never scrolls sideways;
 *   3b. in every row the title starts at the row's left edge, and the progress word stands right of
 *      it on the same line or under it: round 19 saw, and round 22 measured at 990, the title pushed
 *      to the far right with its word under an empty cell whenever the panel was wider than 30rem;
 *   4. the same in Chinese at 1440.
 *
 * MUTATIONS, each after a control run:
 *   1. in CategoryPage.tsx, draw no modules panel on the project page → cases 1 to 4 go red;
 *   2. in ModulesPanel.tsx, point the link back at #/records → cases 1 and 4 go red;
 *   3. in ModulesPanel.tsx, delete the rule that takes the empty severity cell out of a row → case 3
 *      goes red at 990, the first width at which the panel is wider than 30rem.
 *
 * PICTURES. With TEST_SHOTS naming a folder, the last case photographs the project page at 1440, 990,
 * 660 and 390 in both looks, and at 1440 in Chinese, into project-modules under it.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const shots = process.env.TEST_SHOTS === undefined || process.env.TEST_SHOTS === '' ? null : testShots('project-modules')

const PROJECT = { id: 'test-quarry', title: 'Quarry Hill' }
const OTHER = { id: 'test-harbour', title: 'Harbour Gate' }
/** Five modules marked active, so all five qualify and the panel draws three of them. */
const MODULES = ['Stone crusher', 'Conveyor belt', 'Weighbridge', 'Dust filter', 'Water pump']
const ELSEWHERE = 'Lighthouse lamp'
const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const en = createI18n('en')
const zh = createI18n('zh')

let app: LiveApp

async function post(path: string, workspace: string, body: unknown): Promise<void> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': workspace }, body: JSON.stringify(body) })
  expect(reply.status, (await reply.text()).slice(0, 300)).toBeLessThan(300)
}

beforeAll(async () => {
  app = await liveApp({ name: 'project-modules', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  await post('/api/workspaces', 'default', PROJECT)
  await post('/api/workspaces', 'default', OTHER)
  for (const title of MODULES) await post('/api/records', PROJECT.id, { kind: 'module', title, data: { state: 'active' } })
  await post('/api/records', OTHER.id, { kind: 'module', title: ELSEWHERE, data: { state: 'active' } })
  await app.page.addInitScript((project) => {
    localStorage.setItem('mole-office.workspace', project)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('look') ?? 'light')
  }, PROJECT.id)
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** Open the project page at one width and wait until the panel has read the modules. */
async function open(width: number, query = 'lang=en'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto(`${app.site}/?${query}#/project`)
  await waitForThePage(app.page, 30_000)
  await app.page.locator('.px-category-modules .mp-rows').waitFor({ state: 'visible', timeout: 30_000 })
}

/** The words the line under the rows must say for five qualifying modules, three drawn. */
function lineFor(words: typeof en): string {
  return `${words.t('home.moduleShown', { n: 3, total: 5 })} · ${words.t('home.modulesCut', { n: 2, cap: 3 })} · ${words.t('home.allModules', { n: 5 })}`
}

interface Box { left: number; right: number; top: number; bottom: number }

interface RowBoxes { row: Box; title: Box; word: Box }

async function layout(): Promise<{ cards: Box; panel: Box; rows: RowBoxes[]; scroll: number; viewport: number }> {
  return app.page.evaluate(() => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }
    return {
      cards: box(document.querySelector('.px-category-cards')!),
      panel: box(document.querySelector('.px-category-modules')!),
      rows: [...document.querySelectorAll('.px-category-modules .mp-rows .px-row')].map((row) => ({
        row: box(row),
        title: box(row.querySelector('.px-row-title')!),
        word: box(row.querySelector('.mp-phrase')!),
      })),
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }
  })
}

it('draws the modules panel with its heading, three rows, the new line and a link to the Modules page', async () => {
  const page = app.page
  await open(1440)
  const panel = page.locator('.px-category-modules')
  expect(await panel.locator('h2').textContent()).toBe(en.t('categoryPages.modules.heading'))
  const titles = await panel.locator('.mp-rows .px-row-title').allTextContents()
  expect(titles).toHaveLength(3)
  for (const title of titles) expect(MODULES, `"${title}" is not one of this project's modules`).toContain(title.trim())
  // THE LINE UNDER THE ROWS, word for word. It says how many of how many are drawn and what the
  // others are, and not "on the list above", which only made sense on Home.
  const line = (await panel.locator('.mp-note').last().textContent()) ?? ''
  expect(line).toBe(lineFor(en))
  expect(line).not.toContain('on the list above')
  const link = panel.locator('.mp-note a')
  expect(await link.getAttribute('href')).toBe('#/modules')
  expect(await link.textContent()).toBe(en.t('home.allModules', { n: 5 }))
  await link.click()
  await page.waitForFunction(() => location.hash === '#/modules')
}, 120_000)

it('reads only this project’s modules', async () => {
  await open(1440)
  const text = await app.page.locator('.px-category-modules').innerText()
  expect(text).not.toContain(ELSEWHERE)
  expect(text).toContain(en.t('home.moduleShown', { n: 3, total: 5 }))
}, 120_000)

it('stands beside the cards at 1440 and under them at 990, 660 and 390, without scrolling sideways', async () => {
  for (const width of [1440, 990, 660, 390]) {
    await open(width)
    const at = await layout()
    const said = `${String(width)}: ${JSON.stringify(at)}`
    if (width === 1440) {
      expect(at.panel.left, `${said}: the panel does not start right of the cards`).toBeGreaterThanOrEqual(at.cards.right)
      expect(Math.abs(at.panel.top - at.cards.top), `${said}: the panel and the cards do not start on one line`).toBeLessThan(2)
    } else {
      expect(at.panel.top, `${said}: the panel is not under the cards`).toBeGreaterThanOrEqual(at.cards.bottom)
      expect(Math.abs(at.panel.left - at.cards.left), `${said}: the panel and the cards do not share a left edge`).toBeLessThan(2)
    }
    expect(at.rows.length, said).toBe(3)
    for (const { row, title, word } of at.rows) {
      expect(row.right, `${said}: a row is wider than the panel`).toBeLessThanOrEqual(at.panel.right + 1)
      // THE TITLE STARTS THE ROW: within the row's own padding of its left edge.
      expect(title.left - row.left, `${said}: a title does not start at the row's left edge`).toBeLessThan(24)
      // THE WORD IS BESIDE THE TITLE ON ITS LINE, OR UNDER IT; never beside nothing on a line of its own.
      const beside = word.left >= title.right && Math.abs(word.top - title.top) < title.bottom - title.top
      const under = word.top >= title.bottom - 1 && Math.abs(word.left - title.left) < 24
      expect(beside || under, `${said}: the progress word is neither beside its title nor under it`).toBe(true)
    }
    expect(at.scroll, `${said}: the page scrolls sideways`).toBeLessThanOrEqual(at.viewport)
  }
}, 240_000)

it('says the same in Chinese at 1440', async () => {
  await open(1440, 'lang=zh')
  const panel = app.page.locator('.px-category-modules')
  expect(await panel.locator('h2').textContent()).toBe(zh.t('categoryPages.modules.heading'))
  expect(await panel.locator('.mp-note').last().textContent()).toBe(lineFor(zh))
  const link = panel.locator('.mp-note a')
  expect(await link.getAttribute('href')).toBe('#/modules')
  expect(await link.textContent()).toBe(zh.t('home.allModules', { n: 5 }))
  const at = await layout()
  expect(at.panel.left).toBeGreaterThanOrEqual(at.cards.right)
}, 120_000)

it.runIf(shots !== null)('photographs the project page at four widths in both looks, and at 1440 in Chinese', async () => {
  const folder = shots as string
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      await open(width, `lang=en&look=${theme}`)
      await app.page.screenshot({ path: join(folder, `project-${String(width)}-${theme}-en.png`), fullPage: true })
    }
    await open(1440, `lang=zh&look=${theme}`)
    await app.page.screenshot({ path: join(folder, `project-1440-${theme}-zh.png`), fullPage: true })
  }
}, 300_000)
