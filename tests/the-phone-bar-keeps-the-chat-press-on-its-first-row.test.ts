// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FOLDED BAR KEEPS THE CHAT PRESS ON ITS FIRST ROW WHEN DECISIONS HAS A TWO-FIGURE COUNT, THE URGENT PILL IS DRAWN
 * AND THE PROJECT'S NAME IS LONG.
 *
 * At 390 wide, with Decisions drawing a count and the pill saying "7 urgent", the bar was seen with the chat press alone
 * on a second row under the menu press. A project's name is the person's own words, so it can be wider than the room
 * the presses leave beside it, and the chat press has to keep its place on the first row whatever the name is.
 *
 * So this file draws the bar's widest state: twelve forks and seven open problems, all waiting on the person, in a
 * project whose name is about thirty characters long. Home draws only its own short name, so it is the short-name case;
 * the record's page draws the long project name above the record's title.
 *
 * WHAT THIS MEASURES, in a real browser on a test office of this file's own, in the light look, on Home and on one
 * record's page, at 390 and 360 by 844 and at 660 and 990 by 900. The dark look is not measured: where a press
 * stands does not depend on the colours.
 *   - the bar really draws the Decisions count of twelve and the pill saying "7 urgent";
 *   - the chat press's top edge is level with the menu press's top edge, within one pixel;
 *   - at 660 and 990 the whole bar is one row: no part of it starts below the menu press's bottom edge;
 *   - Home's short name is drawn whole at every width, and so is the long name at 990, where there is room for it;
 *   - nothing in the bar is wider than the window: every part of it stands inside the window, the bar's own content
 *     is no wider than the bar, and the page does not scroll sideways.
 * At 360 and 390 the whole bar is not one row with both counts drawn: the menu press, the chat press, Decisions and the
 * pill with their gaps leave less than 30px of the bar beside its checklist press for the name. What is measured there
 * is the chat press on the menu press's row; a count with no room beside it goes to the row below.
 *
 * THE PICTURES, only when W13Y_FIRST_ROW_PICTURES names a folder: the top of Home and of the record's page at 1440,
 * 990, 660 and 390, in both looks, with the made-up label above the page and the pointer off the page. At 1440 the
 * bar is not drawn, because the sidebar carries the shell there, so that picture shows the top of the page. The same
 * pass writes where each part of the bar stands at every width that draws it, and at 360, in a measures file per page.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { recordPath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'the-phone-bar-keeps-the-chat-press-on-its-first-row'
const PICTURES = process.env['W13Y_FIRST_ROW_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const PHONE = { width: 390, height: 844 }
// THE PROBLEM'S OWN WIDTH FIRST, then the narrowest phone, then the two widths where the whole bar is one row.
const WIDTHS = [390, 360, 660, 990]
// FROM THIS WIDTH THE PHONE RULES END, AND THE WHOLE BAR IS ONE ROW.
const ONE_ROW_FROM = 481
const LOOKS = ['light', 'dark'] as const
const FORKS = 12
const URGENT = 7
const AGENT = { name: 'Made-up Bar Agent', handle: 'made-up-bar-agent' }
// A PROJECT WHOSE NAME IS WIDER THAN THE ROOM THE PRESSES LEAVE BESIDE IT AT 390 AND AT 660. A project's name is the
// person's own words, so it can be this long.
const PROJECT = { id: 'made-up-harbour', title: 'Made-up harbour and tide charts' }
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const IN_THE_PROJECT = { ...OWNER, 'x-mole-office-workspace': PROJECT.id }
const AS_THE_AGENT = { ...IN_THE_PROJECT, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }

let app: LiveApp
let oneRecord = ''

async function file(path: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const answer = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `${path}: ${text.slice(0, 600)}`).toBe(201)
  return JSON.parse(text) as Record<string, any>
}

beforeAll(async () => {
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: PHONE })
  await file('/api/workspaces', PROJECT, OWNER)
  await file('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }, IN_THE_PROJECT)
  // TWELVE FORKS THE PERSON SETTLES, so the bar's Decisions count has two figures.
  for (let i = 1; i <= FORKS; i++) {
    await file('/api/records', {
      kind: 'proposal',
      title: `A made-up fork for the bar ${String(i)}`,
      data: {
        question: `Which made-up shelf takes folder ${String(i)}?`,
        options: ['a — The top shelf.', 'b — The low shelf.'],
        recommendation: 'Take (a). It is empty.',
        because: 'Made up for the bar test.',
        who_settles_it: 'the owner',
      },
    }, AS_THE_AGENT)
  }
  // SEVEN OPEN PROBLEMS WAITING ON THE PERSON, so the attention list draws the pill saying "7 urgent". The first one's
  // page is the record page this file opens.
  for (let i = 1; i <= URGENT; i++) {
    const made = await file('/api/records', {
      kind: 'problem',
      title: `Made-up bar problem ${String(i)}`,
      data: { state: 'open', whose_move: 'person' },
    }, IN_THE_PROJECT)
    if (i === 1) oneRecord = made['record'].id as string
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** The two pages this file opens: Home, whose address is the bare one, and the first made-up problem's own page. */
function thePages(): { called: string; address: string }[] {
  return [
    { called: 'home', address: '/' },
    { called: 'record', address: recordPath(oneRecord) },
  ]
}

/** A fresh window whose stored theme is set before the app runs. */
async function aWindow(width: number, theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width < 481 ? PHONE.height : 900 } })
  await context.addInitScript(({ id, theme, project }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.workspace', project)
  }, { id: THE_TEST_OFFICES_OWNER.id, theme, project: PROJECT.id })
  return { context, page: await context.newPage() }
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Both counts are really drawn, or this measures a bar that never had the problem. */
async function bothCountsAreDrawn(page: Page, where: string): Promise<void> {
  const badge = page.locator('.shell-bar [data-count="decisions"] .shell-badge')
  await badge.waitFor({ timeout: 30_000 })
  expect((await badge.innerText()).trim(), `${where}: the Decisions count`).toBe(t('nav.badge', { n: FORKS }))
  const pill = page.locator('.shell-bar-status[data-count="urgent"]')
  await pill.waitFor({ timeout: 30_000 })
  expect((await pill.innerText()).replace(/\s+/g, ' ').trim(), `${where}: the urgent pill`).toBe(t('frameWords.pill.urgentCount', { n: URGENT }))
}

interface TheBar {
  window: number
  bar: { left: number; right: number; width: number; scrollWidth: number; clientWidth: number; paddingLeft: string; paddingRight: string }
  page: number
  name: { width: number; cut: string[] }
  parts: { name: string; left: number; right: number; top: number; bottom: number; width: number }[]
}

/** Where the bar and each visible part of it stand, how wide the bar's content is, and how wide the page is. */
async function theBar(page: Page): Promise<TheBar> {
  return page.locator('.shell-bar').evaluate((bar) => {
    const box = bar.getBoundingClientRect()
    const style = getComputedStyle(bar)
    const where = bar.querySelector('.shell-bar-where')
    // EACH LINE OF THE NAME THAT IS CUT: its text is wider than the line is drawn.
    const cut = where === null ? [] : [...where.children].filter((line) => line.scrollWidth > line.clientWidth).map((line) => line.textContent ?? '')
    return {
      window: window.innerWidth,
      bar: {
        left: box.left,
        right: box.right,
        width: box.width,
        scrollWidth: bar.scrollWidth,
        clientWidth: bar.clientWidth,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      },
      page: document.documentElement.scrollWidth,
      name: { width: where === null ? 0 : where.getBoundingClientRect().width, cut },
      parts: [...bar.children]
        .filter((one) => one.getClientRects().length > 0)
        .map((one) => {
          const at = one.getBoundingClientRect()
          return { name: one.className.split(' ')[0] ?? one.tagName, left: at.left, right: at.right, top: at.top, bottom: at.bottom, width: at.width }
        }),
    }
  })
}

/** The chat press's top against the menu press's, and everything in the bar against the window. */
function holdsTheChatOnItsFirstRow(bar: TheBar, where: string): void {
  const menu = bar.parts.find((one) => one.name === 'shell-menu')
  const chat = bar.parts.find((one) => one.name === 'shell-chat-phone')
  const drawn = JSON.stringify(bar)
  expect(menu, `${where}: the bar draws no menu press; ${drawn}`).toBeDefined()
  expect(chat, `${where}: the bar draws no chat press; ${drawn}`).toBeDefined()
  expect(
    Math.abs(chat!.top - menu!.top),
    `${where}: the chat press's top is ${String(Math.round(chat!.top))} and the menu press's is ${String(Math.round(menu!.top))}; ${drawn}`,
  ).toBeLessThanOrEqual(1)
  const outside = bar.parts.filter((one) => one.left < 0 || one.right > bar.window)
  expect(outside, `${where}: parts of the bar stand outside the ${String(bar.window)}px window; ${drawn}`).toEqual([])
  expect(bar.bar.right, `${where}: the bar is wider than the window; ${drawn}`).toBeLessThanOrEqual(bar.window)
  expect(bar.bar.scrollWidth, `${where}: the bar's content is wider than the bar; ${drawn}`).toBeLessThanOrEqual(bar.bar.clientWidth)
  expect(bar.page, `${where}: the page scrolls sideways; ${drawn}`).toBeLessThanOrEqual(bar.window)
}

/** At 660 and 990 the whole bar is one row: no part of it starts below the menu press's bottom edge. */
function isOneRow(bar: TheBar, where: string): void {
  const menu = bar.parts.find((one) => one.name === 'shell-menu')!
  const below = bar.parts.filter((one) => one.top >= menu.bottom)
  expect(below, `${where}: parts of the bar stand on a row below the menu press; ${JSON.stringify(bar)}`).toEqual([])
}

it('draws the chat press on the menu press\'s row at 390, 360, 660 and 990, with twelve forks, seven urgent things and a long project name, on Home and a record\'s page', async () => {
  // One look: where the chat press stands in the bar does not depend on the colours.
  const theme = 'light'
  for (const width of WIDTHS) {
    for (const { called, address } of thePages()) {
      const where = `${called} at ${String(width)} in the ${theme} look`
      const { context, page } = await aWindow(width, theme)
      try {
        await open(page, address)
        expect(await page.locator('html').getAttribute('data-theme'), `${where}: the page is not in its look`).toBe(theme)
        await bothCountsAreDrawn(page, where)
        const bar = await theBar(page)
        holdsTheChatOnItsFirstRow(bar, where)
        if (width >= ONE_ROW_FROM) isOneRow(bar, where)
        if (called === 'home' || width === 990) {
          expect(bar.name.cut, `${where}: the name is cut where it fits; ${JSON.stringify(bar)}`).toEqual([])
        }
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)

for (const { called } of [{ called: 'home' }, { called: 'record' }]) {
  it.skipIf(PICTURES === undefined)(`takes ${called === 'home' ? 'Home' : 'the record\'s page'} at 1440, 990, 660 and 390 in both looks, and measures the bar at 360`, async () => {
    const folder = PICTURES!
    mkdirSync(folder, { recursive: true })
    const address = thePages().find((one) => one.called === called)!.address
    const measures: { width: number; theme: string; bar: TheBar }[] = []
    for (const width of [1440, 990, 660, 390, 360]) {
      for (const theme of LOOKS) {
        const { context, page } = await aWindow(width, theme)
        try {
          await open(page, address)
          expect(await page.locator('html').getAttribute('data-theme'), `the ${theme} picture is not in its look`).toBe(theme)
          if (width < 1024) {
            await bothCountsAreDrawn(page, `${called} at ${String(width)} in the ${theme} look`)
            measures.push({ width, theme, bar: await theBar(page) })
          }
          if (width === 360) continue
          await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
          // THE POINTER OFF THE PAGE, so no hover is drawn in the picture.
          await page.mouse.move(width - 2, (width < 481 ? PHONE.height : 900) - 2)
          await page.waitForTimeout(500)
          await page.screenshot({ path: join(folder, `${called}-${String(width)}-${theme}.png`) })
        } finally {
          await context.close()
        }
      }
    }
    writeFileSync(join(folder, `${called}-bar-measures.json`), JSON.stringify(measures, null, 2))
  }, 300_000)
}
