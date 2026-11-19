// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH PERSON PINS THE PAGES IN FRONT OF THE SIDEBAR. With nothing kept, Home, Reports, My notes, Checklists and
 * Decisions stand in front, with the chat's entry after Home and All pages after the last of them. The person pins any
 * other page from All pages or from the arrangement page, and unpins, moves up or moves down a pinned page there. Each
 * press is kept at once for that person by GET and PUT /api/sidebar-pins, and needs no reason.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own:
 *   1. With nothing kept, the front is Home, the chat, Reports, My notes, Checklists, Decisions and All pages: open,
 *      narrowed and in the menu at 390, light and dark. The project block draws no rule, because nothing is under its
 *      head, and its name stands level with its initials, beside them.
 *   2. A pin pressed on All pages puts the page last in front at once and keeps it. All pages then draws the page grey,
 *      with an unpin press, its number counts one page fewer, and typed words do not find the page. A reload draws the
 *      same, and the unpin press puts everything back.
 *   3. The arrangement page draws the pinned pages at its top, above every group, in order, with up, down and unpin,
 *      and no line of words. Its groups draw no press in the reading. A move and an unpin there are each kept at once,
 *      and the sidebar follows. The part is drawn on the page's edit view as well.
 *   4. A pinned Developer page stands in front in normal mode and in developer mode. All pages draws Developer only in
 *      developer mode, and there the page is grey with an unpin press.
 *   5. A kept list the sidebar cannot read, or a read that fails, draws the shipped front, and the sidebar and the
 *      arrangement page say so.
 *   6. An agent's pin press is refused: the page says why, the front does not change and nothing is kept.
 *   7. A pinned page of the project stands in the project block, under the project's name, in the person's order, and
 *      not in front: open, narrowed, where the mouse or the keyboard on a row shows its name, and in the menu at 390.
 *      The block draws one rule, between its head and its rows. All pages pins and unpins the page in the project's
 *      words, the arrangement page unpins it in them, and moves it within the project's part.
 *   8. The arrangement page draws no line of words with no page in front, nor in the edit view with a group emptied.
 *      Its groups draw no Pin or Unpin press, and each page in a group has only its up and down presses. Each kind of
 *      press stands in one column, with a long name among the pinned pages.
 *
 * Test change (wave 13y round 165): the project block stands in the sidebar again, below the pages in front and above
 * All pages. With nothing kept it draws no row (case 1), and a pinned page of the project is
 * drawn in it and not in front (case 7). The arrangement page draws the pages in front and the project's pinned pages
 * as two parts, and its Edit press stands under the part's rule, above the arrangement's groups (case 3).
 *
 * Test change (wave 13y round 165, the explaining lines): the block's head draws its rule only when something stands
 * under it, and its name stands beside its initials (cases 1 and 7). The arrangement page draws no line that explains
 * what it shows, and its groups lost their pin presses, so a page is pinned on All pages (cases 3, 7 and 8).
 *
 * Test change (wave 13y round 166): the arrangement page's project heading and its empty part are not drawn while no
 * page of the project is pinned (case 3 and case 9), because a heading over nothing only says nothing is there. While
 * the pins are still loading, or their read failed, the heading is drawn as it was (case 9).
 *
 * Test change (wave 13y round 167, point QN-2 of the quick notes): My notes stands in front after Reports with nothing
 * kept, as option C's step 6 picture draws it, so every list of pins written out here holds it after Reports.
 *
 * THE PICTURES are taken only when W13Y_SIDEBAR_PICTURES names a folder. They are of a made-up office, and each
 * carries the made-up label above the page.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createI18n, type WordKey } from '../src/shared/i18n.ts'
import { SHIPPED_SIDEBAR } from '../src/shared/sidebar-arrangement.ts'
import { SHIPPED_PINS, THE_KEPT_PINS_ARE_NOT_JSON, sidebarPinsSettingName } from '../src/shared/sidebar-pins.ts'
import { DESTINATIONS, SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { PinnedPagesPart } from '../src/web/components/SidebarPins.tsx'
import { categoryPath, pathFor } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'each-person-pins-the-pages'
const PICTURES = process.env['W13Y_SIDEBAR_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const originalOwnerName = process.env['MOLE_OFFICE_OWNER_NAME']
const ROW = sidebarPinsSettingName(THE_TEST_OFFICES_OWNER.id)

/** The front with nothing kept: the shipped five, with the chat's entry after Home, and All pages after them. */
const SHIPPED_FRONT = ['rail.home', 'rail.chat', 'rail.notes', 'rail.mynotes', 'rail.checklists', 'rail.decisions', 'rail.allpages']
const SEARCH = '#main input[type="search"]'
const THE_ENTRY = '#shell-side [data-target="uiSurface/rail.allpages"]'
const THE_NUMBER = '#shell-side .shell-pages-count'
const THE_PART = '#main [data-sidebar-pins]'

const inEnglish = createI18n('en').t
const said = (key: string, values?: Record<string, string>): string => inEnglish(key as WordKey, values)
const nameOf = (key: string): string => DESTINATIONS.find((one) => one.key === key)?.label ?? key
const surfaceOf = (key: string): string => DESTINATIONS.find((one) => one.key === key)?.surface ?? key

let app: LiveApp

beforeAll(async () => {
  process.env['MOLE_OFFICE_OWNER_NAME'] = 'Made-up caretaker'
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: { width: 1440, height: 900 } })
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (originalOwnerName === undefined) delete process.env['MOLE_OFFICE_OWNER_NAME']
  else process.env['MOLE_OFFICE_OWNER_NAME'] = originalOwnerName
}, 60_000)

/** The owner's kept row, written or taken out by hand, as the door would find it. */
function writeTheRow(value: string | null): void {
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    if (value === null) database.prepare('DELETE FROM runtime_settings WHERE name = ?').run(ROW)
    else database.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(ROW, value)
  } finally { database.close() }
}

function readTheRow(): string | null {
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    return (database.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(ROW) as { value: string } | undefined)?.value ?? null
  } finally { database.close() }
}

/** What the door answers the owner. */
async function theKeptPins(): Promise<{ pins: string[]; kept: string }> {
  const reply = await fetch(`${app.api}/api/sidebar-pins`, { headers: OWNER })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const { pins, kept } = await reply.json() as { pins: string[]; kept: string }
  return { pins, kept }
}

type Look = { theme?: 'light' | 'dark'; width?: number; narrowed?: boolean; agent?: boolean }

/** A fresh window whose stored choices are set before the app runs. */
async function aWindow(look: Look = {}): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? 1440
  const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 } })
  await context.addInitScript(({ actor, theme, narrowed, key }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify(actor))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem(key, narrowed ? 'collapsed' : 'expanded')
    localStorage.setItem('mole-office.workspace', 'default')
  }, {
    actor: look.agent === true ? { type: 'agent', id: 'made-up-agent' } : { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    theme: look.theme ?? 'light', narrowed: look.narrowed ?? false, key: SIDEBAR_KEY,
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00'))
  return { context, page }
}

async function open(page: Page, address: string, query = 'lang=en'): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?${query}#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(THE_ENTRY).waitFor({ state: 'attached', timeout: 30_000 })
}

/** The sidebar's entries in front, in the order they are drawn, by the surface each declares; All pages is last. */
async function theFront(page: Page): Promise<string[]> {
  return page.locator('#shell-side .shell-nav > .shell-list > li > [data-target]').evaluateAll((all) => all
    .filter((one) => one.getClientRects().length > 0)
    .map((one) => (one.getAttribute('data-target') ?? '').replace(/^uiSurface\//, '')))
}

/** The front as it should be drawn for a list of pins: the chat's entry after Home, or first without Home. */
function theFrontFor(pins: readonly string[]): string[] {
  const pages = pins.map(surfaceOf)
  const home = pages.indexOf('rail.home')
  pages.splice(home + 1, 0, 'rail.chat')
  return [...pages, 'rail.allpages']
}

function aKeep(page: Page): Promise<unknown> {
  return page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/sidebar-pins' && reply.request().method() === 'PUT' && reply.status() === 200, { timeout: 15_000 })
}

/** Presses a press found by its name, and waits for the pins it keeps. */
async function pressAndKeep(page: Page, scope: string, name: string): Promise<void> {
  const kept = aKeep(page)
  await page.locator(scope).getByRole('button', { name, exact: true }).click()
  await kept
  await page.waitForTimeout(300)
}

/** All pages, opened at its address, once its groups and the number beside its entry are drawn. Narrowed or behind
 * the menu the number is hidden, so it is waited for as written, not as seen. */
async function openAllPages(page: Page, query = 'lang=en'): Promise<void> {
  await open(page, pathFor('allPages'), query)
  await page.locator(SEARCH).waitFor({ timeout: 30_000 })
  await page.locator(THE_NUMBER).waitFor({ state: 'attached', timeout: 30_000 })
}

const theNumber = async (page: Page): Promise<number> => Number(/\d+/.exec(await page.locator(THE_NUMBER).innerText())?.[0] ?? NaN)

/** How All pages draws one page: grey or not, and the names of the presses beside it. Null when it is not drawn. */
async function howAllPagesDraws(page: Page, key: string): Promise<{ grey: boolean; presses: string[] } | null> {
  return page.locator('#main .ap-groups li').evaluateAll((all, surface) => {
    const row = all.find((one) => one.getClientRects().length > 0 && one.querySelector(`a[data-target="uiSurface/${surface}"]`) !== null)
    if (row === undefined) return null
    return {
      grey: row.querySelector(`a[data-target="uiSurface/${surface}"]`)!.classList.contains('ap-front'),
      presses: [...row.querySelectorAll('button')].map((one) => one.getAttribute('aria-label') ?? (one.textContent ?? '').trim()),
    }
  }, surfaceOf(key))
}

/** The pinned pages the arrangement page lists at its top, in order: the pages in front, or the project's. */
async function thePinnedPagesListed(page: Page, part: 'front' | 'project' = 'front'): Promise<string[]> {
  return page.locator(`${THE_PART} [data-pins-part="${part}"] [data-pinned-page]`).evaluateAll((all) => all.map((one) => one.getAttribute('data-pinned-page') ?? ''))
}

/** The rows the project block draws in the sidebar, in order, by the surface each declares. */
async function theBlockRows(page: Page): Promise<string[]> {
  return page.locator('#shell-side .sbp-block .shell-link[data-target]').evaluateAll((all) => all
    .filter((one) => one.getClientRects().length > 0)
    .map((one) => (one.getAttribute('data-target') ?? '').replace(/^uiSurface\//, '')))
}

/** Where the project block stands: below the pages in front, above All pages, and its first row under its head. */
async function whereTheBlockIs(page: Page): Promise<{ belowTheFront: boolean; aboveAllPages: boolean; rowsUnderTheHead: boolean }> {
  return page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null
    const front = box('#shell-side .shell-nav > .shell-list:not(.shell-list-all)'), block = box('#shell-side .sbp-block')
    const all = box('#shell-side .shell-all-pages'), head = box('#shell-side .sbp-head'), row = box('#shell-side .sbp-block .shell-link')
    return {
      belowTheFront: front !== null && block !== null && front.bottom <= block.top + 0.5,
      aboveAllPages: block !== null && all !== null && block.bottom <= all.top + 0.5,
      rowsUnderTheHead: head !== null && row !== null && head.bottom <= row.top + 0.5,
    }
  })
}

/** The parts of the block's head that are drawn, by their class. */
async function theHeadDraws(page: Page): Promise<string[]> {
  return page.locator('#shell-side .sbp-head > *').evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).map((one) => one.classList[0] ?? one.tagName))
}

/**
 * Where the arrangement page's Edit press, or its Stop editing press, stands: in the page's head, or under the rule
 * that ends the pinned pages' part and before the arrangement's first group. Test change (wave 13y round 165, the
 * explaining lines): the arrangement's own words above the press are gone, so the press is not placed after them.
 */
async function whereTheEditPressIs(page: Page, words: string): Promise<{ inTheHead: boolean; underTheRule: boolean; beforeTheGroups: boolean }> {
  const press = page.locator('.pfs').getByRole('link', { name: words, exact: true })
  expect(await press.count(), `the presses called "${words}"`).toBe(1)
  return press.evaluate((one) => {
    const part = document.querySelector('#main [data-sidebar-pins]')!
    const group = document.querySelector('#main [data-sidebar-group]')!
    return {
      inTheHead: one.closest('.pfs-head') !== null,
      underTheRule: one.getBoundingClientRect().top >= part.getBoundingClientRect().bottom,
      beforeTheGroups: (one.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    }
  })
}

/** The looks the sidebar is read in: open and narrowed at 1440, and in the menu at 390. */
const LOOKS = [['open at 1440', {}], ['narrowed at 1440', { narrowed: true }], ['in the menu at 390', { width: 390 }]] as const

/** Where a rule in the project block belongs: between the head and the first row. */
const BETWEEN = 'between the head and the first row'

/**
 * The rules drawn across the project block, each said by where it stands. A rule is the top or the bottom border of an
 * element in the block that is at least half as wide as the block. One between the head and the first row is where a
 * rule belongs. With no row and nothing else under the head, a rule under the head stands over nothing.
 */
async function theRulesInTheBlock(page: Page): Promise<string[]> {
  return page.evaluate((between) => {
    const block = document.querySelector('#shell-side .sbp-block')!
    const drawn = (one: Element): boolean => one.getClientRects().length > 0
    const headBottom = Math.max(...[...block.querySelectorAll('.sbp-head > *')].filter(drawn).map((one) => one.getBoundingClientRect().bottom))
    const row = block.querySelector('.shell-link')
    const rowTop = row !== null && drawn(row) ? row.getBoundingClientRect().top : null
    const clear = (colour: string): boolean => colour === 'transparent' || /^rgba\(.*,\s*0\)$/u.test(colour) || /\/\s*0\)$/u.test(colour)
    const rules: string[] = []
    for (const one of block.querySelectorAll('*')) {
      const box = one.getBoundingClientRect()
      if (!drawn(one) || box.width < block.getBoundingClientRect().width / 2) continue
      const style = getComputedStyle(one)
      for (const side of ['top', 'bottom'] as const) {
        const width = parseFloat(style.getPropertyValue(`border-${side}-width`))
        const kind = style.getPropertyValue(`border-${side}-style`)
        if (!(width > 0) || kind === 'none' || kind === 'hidden' || clear(style.getPropertyValue(`border-${side}-color`))) continue
        const y = side === 'top' ? box.top : box.bottom
        if (rowTop !== null && y >= headBottom - 0.5 && y <= rowTop + 0.5) rules.push(between)
        else if (rowTop === null && y >= headBottom - 0.5) rules.push('under the head, with no row under it')
        else rules.push(`the ${side} of ${one.className || one.tagName}`)
      }
    }
    return rules
  }, BETWEEN)
}

/** Where the project's name stands against its initials: level with them and beside them. Null when either is hidden. */
async function whereTheNameIs(page: Page): Promise<{ level: boolean; beside: boolean } | null> {
  return page.evaluate(() => {
    const square = document.querySelector('#shell-side .sbp-square'), name = document.querySelector('#shell-side .sbp-name')
    if (square === null || name === null || square.getClientRects().length === 0 || name.getClientRects().length === 0) return null
    const initials = square.getBoundingClientRect(), words = name.getBoundingClientRect()
    return {
      level: Math.abs((initials.top + initials.bottom) / 2 - (words.top + words.bottom) / 2) <= 2,
      beside: words.left >= initials.right,
    }
  })
}

/** Every line of words the arrangement page draws, each paragraph that is drawn, in order. */
async function theLinesDrawn(page: Page): Promise<string[]> {
  return page.locator('#main [data-sidebar-arrangement] p').evaluateAll((all) => all
    .filter((one) => one.getClientRects().length > 0)
    .map((one) => (one.textContent ?? '').trim()))
}

/**
 * How many columns each kind of press on the arrangement page stands in, read from the left edge of each press drawn.
 * A press's kind is what its words say it does: up, down and unpin in the pinned pages' part, pin and unpin beside a
 * page in a group, and move up and move down in a group on the edit view. Two edges more than a pixel apart are two
 * columns. A press that moves no page, such as Preview, is not counted.
 */
async function thePressColumns(page: Page): Promise<Record<string, number>> {
  const presses = await page.locator('#main [data-sidebar-arrangement] button').evaluateAll((all) => all
    .filter((one) => one.getClientRects().length > 0)
    .map((one) => ({ words: (one.querySelector('.sr-only')?.textContent ?? '').trim(), left: one.getBoundingClientRect().left })))
  const kinds = new Map<string, string>()
  for (const { key } of DESTINATIONS) {
    const page = { page: nameOf(key) }
    kinds.set(said('pins.upPage', page), 'up').set(said('pins.downPage', page), 'down')
    kinds.set(said('pins.unpinPage', page), 'unpin').set(said('pins.unpinProjectPage', page), 'unpin')
    kinds.set(said('pins.pinPage', page), 'pin').set(said('pins.pinProjectPage', page), 'pin')
    kinds.set(said('sidebarSetting.upPage', page), 'move up').set(said('sidebarSetting.downPage', page), 'move down')
  }
  const edges = new Map<string, number[]>()
  for (const { words, left } of presses) {
    const kind = kinds.get(words)
    if (kind !== undefined) edges.set(kind, [...(edges.get(kind) ?? []), left])
  }
  return Object.fromEntries([...edges].map(([kind, lefts]) => {
    const sorted = [...lefts].sort((one, other) => one - other)
    return [kind, sorted.filter((left, index) => index === 0 || left - sorted[index - 1]! > 1).length]
  }))
}

it('1. with nothing kept, the front is Home, the chat, Reports, My notes, Checklists and Decisions, open, narrowed and in the menu at 390', async () => {
  writeTheRow(null)
  const drawn: Record<string, string[]> = {}
  const block: Record<string, { drawn: number; rows: string[]; rules: string[] }> = {}
  const theName: Record<string, { level: boolean; beside: boolean } | null> = {}
  for (const theme of ['light', 'dark'] as const) {
    for (const [where, look] of LOOKS) {
      const what = `${where}, ${theme}`
      const { context, page } = await aWindow({ ...look, theme })
      try {
        await open(page, '/')
        if (where === 'in the menu at 390') {
          await page.locator('.shell-menu').click()
          await page.locator('#shell-side[data-drawer="open"]').waitFor()
          await page.waitForTimeout(600)
        }
        await page.locator('#shell-side .sbp-block[data-projects="ready"]').waitFor({ state: 'attached', timeout: 30_000 })
        drawn[what] = await theFront(page)
        block[what] = { drawn: await page.locator('#shell-side .sbp-block').count(), rows: await theBlockRows(page), rules: await theRulesInTheBlock(page) }
        theName[what] = await whereTheNameIs(page)
      } finally {
        await context.close()
      }
    }
  }
  const inEveryLook = <T>(value: T, narrowed: T = value): Record<string, T> => Object.fromEntries(['light', 'dark']
    .flatMap((theme) => LOOKS.map(([where]) => [`${where}, ${theme}`, where === 'narrowed at 1440' ? narrowed : value])))
  expect(drawn).toEqual(inEveryLook(SHIPPED_FRONT))
  // Test change (wave 13y round 165): the project block is drawn in the sidebar, and with nothing kept it has no row.
  // Test change (wave 13y round 165, the explaining lines): with nothing under its head the block draws no rule, and the
  // project's name stands level with its initials, beside them. Narrowed, the block draws its initials alone.
  expect(block, 'the project block').toEqual(inEveryLook({ drawn: 1, rows: [], rules: [] }))
  expect(theName, "the project's name against its initials").toEqual(inEveryLook<{ level: boolean; beside: boolean } | null>({ level: true, beside: true }, null))
  expect(theFrontFor(SHIPPED_PINS), 'the front this file works out for the shipped pins').toEqual(SHIPPED_FRONT)
  expect(readTheRow(), 'the kept row after reading only').toBeNull()
}, 240_000)

it('2. a pin pressed on All pages stands last in front at once and is kept; All pages draws it grey and no longer counts or finds it', async () => {
  writeTheRow(null)
  const { context, page } = await aWindow()
  try {
    await openAllPages(page)
    const before = await theNumber(page)
    expect(await howAllPagesDraws(page, 'schedule'), 'Schedule before the pin').toEqual({ grey: false, presses: [said('pins.pinPage', { page: nameOf('schedule') })] })
    expect(await howAllPagesDraws(page, 'notes'), 'Reports, in front with nothing kept').toEqual({ grey: true, presses: [said('pins.unpinPage', { page: nameOf('notes') })] })

    await pressAndKeep(page, '#main', said('pins.pinPage', { page: nameOf('schedule') }))
    expect(await theFront(page), 'the front after the pin').toEqual(theFrontFor([...SHIPPED_PINS, 'schedule']))
    expect(await theKeptPins(), 'what the door keeps').toEqual({ pins: [...SHIPPED_PINS, 'schedule'], kept: 'kept' })
    expect(await howAllPagesDraws(page, 'schedule'), 'Schedule after the pin').toEqual({ grey: true, presses: [said('pins.unpinPage', { page: nameOf('schedule') })] })
    expect(await theNumber(page), 'the number beside All pages').toBe(before - 1)
    // Typed words find only the pages not pinned, and Schedule's own name finds nothing of it.
    await page.locator(SEARCH).fill(nameOf('schedule'))
    await page.waitForTimeout(300)
    expect(await howAllPagesDraws(page, 'schedule'), `Schedule, with "${nameOf('schedule')}" typed`).toBeNull()
    expect(await page.locator('#main .ap-groups a.ap-front').evaluateAll((all) => all.filter((one) => one.getClientRects().length > 0).length), 'grey names drawn with words typed').toBe(0)
    await page.locator(SEARCH).fill('')

    // A reload draws the same.
    await openAllPages(page)
    expect(await theFront(page), 'the front after a reload').toEqual(theFrontFor([...SHIPPED_PINS, 'schedule']))
    expect(await howAllPagesDraws(page, 'schedule'), 'Schedule after a reload').toEqual({ grey: true, presses: [said('pins.unpinPage', { page: nameOf('schedule') })] })

    await pressAndKeep(page, '#main', said('pins.unpinPage', { page: nameOf('schedule') }))
    expect(await theFront(page), 'the front after the unpin').toEqual(SHIPPED_FRONT)
    expect(await theKeptPins(), 'what the door keeps after the unpin').toEqual({ pins: [...SHIPPED_PINS], kept: 'kept' })
    expect(await theNumber(page), 'the number after the unpin').toBe(before)
    expect(await howAllPagesDraws(page, 'schedule'), 'Schedule after the unpin').toEqual({ grey: false, presses: [said('pins.pinPage', { page: nameOf('schedule') })] })
  } finally {
    await context.close()
  }
}, 180_000)

it('3. the arrangement page draws the pinned pages at its top, and a move, an unpin and a pin there are kept at once', async () => {
  writeTheRow(null)
  const { context, page } = await aWindow()
  try {
    await open(page, pathFor('sidebarArrangement'))
    await page.locator(THE_PART).waitFor({ timeout: 30_000 })
    expect(await page.locator(THE_PART).getByRole('heading').first().innerText(), "the part's heading").toBe(said('pins.title'))
    // The part stands above every group of the arrangement.
    const tops = await page.evaluate(() => ({
      part: document.querySelector('#main [data-sidebar-pins]')!.getBoundingClientRect().top,
      groups: [...document.querySelectorAll('#main [data-sidebar-group]')].map((one) => one.getBoundingClientRect().top),
    }))
    expect(tops.groups.length, 'the groups drawn').toBeGreaterThan(0)
    expect(tops.groups.every((top) => top > tops.part), `the part at ${String(tops.part)}, the groups at ${tops.groups.join(', ')}`).toBe(true)
    expect(await thePinnedPagesListed(page), 'the pinned pages listed').toEqual([...SHIPPED_PINS])
    // Test change (wave 13y round 165): the part has two parts, the pages in front and then the project's pinned pages.
    // The Edit press stands under the part's rule and before the arrangement's groups, and not in the page's head.
    // Test change (wave 13y round 165, the explaining lines): the page draws no line of words. The project's part draws
    // its heading and an empty list, the arrangement draws no words above its groups, and no group draws a rule.
    // Test change (wave 13y round 166): with no page of the project pinned, the project's part is not drawn at all, so
    // the page draws one heading here. Case 9 covers the loading and failed states, and case 8 the pinned one.
    expect(await page.locator(THE_PART).getByRole('heading').allTextContents(), "the part's heading").toEqual([said('pins.title')])
    expect(await page.locator(`${THE_PART} [data-pins-part="project"]`).count(), "the project's part with no page pinned").toBe(0)
    expect(await theLinesDrawn(page), 'the lines of words the page draws with nothing kept').toEqual([])
    expect(await page.locator('#main [data-sidebar-group] button').count(), 'the presses in the groups of the reading').toBe(0)
    const theEditPressHere = { inTheHead: false, underTheRule: true, beforeTheGroups: true }
    expect(await whereTheEditPressIs(page, said('pagesFromSettings.edit')), 'where the Edit press stands').toEqual(theEditPressHere)
    // Each pinned page has up, down and unpin, and the first cannot go up and the last cannot go down. Their names are
    // not the arrangement's "Move … up" and "Move … down", so a press found by those names is still the arrangement's.
    const part = page.locator(THE_PART)
    const press = (key: string, words: 'pins.upPage' | 'pins.downPage' | 'pins.unpinPage') => part.getByRole('button', { name: said(words, { page: nameOf(key) }), exact: true })
    for (const key of SHIPPED_PINS) for (const words of ['pins.upPage', 'pins.downPage', 'pins.unpinPage'] as const) {
      expect(await press(key, words).count(), `${words} for ${key}`).toBe(1)
    }
    expect(await press('home', 'pins.upPage').getAttribute('aria-disabled'), 'up on the first').toBe('true')
    expect(await press('decisions', 'pins.downPage').getAttribute('aria-disabled'), 'down on the last').toBe('true')

    await pressAndKeep(page, THE_PART, said('pins.downPage', { page: nameOf('home') }))
    expect(await theKeptPins(), 'kept after Home moved down').toEqual({ pins: ['notes', 'home', 'myNotes', 'checklists', 'decisions'], kept: 'kept' })
    expect(await thePinnedPagesListed(page), 'listed after Home moved down').toEqual(['notes', 'home', 'myNotes', 'checklists', 'decisions'])
    expect(await theFront(page), 'the front after Home moved down').toEqual(['rail.notes', 'rail.home', 'rail.chat', 'rail.mynotes', 'rail.checklists', 'rail.decisions', 'rail.allpages'])

    await pressAndKeep(page, THE_PART, said('pins.unpinPage', { page: nameOf('decisions') }))
    expect(await theKeptPins(), 'kept after Decisions was unpinned').toEqual({ pins: ['notes', 'home', 'myNotes', 'checklists'], kept: 'kept' })

    // Test change (wave 13y round 165, the explaining lines): the groups draw no pin press, so Schedule is pinned on All
    // pages, and the arrangement page lists it last.
    await openAllPages(page)
    await pressAndKeep(page, '#main', said('pins.pinPage', { page: nameOf('schedule') }))
    expect(await theKeptPins(), 'kept after Schedule was pinned on All pages').toEqual({ pins: ['notes', 'home', 'myNotes', 'checklists', 'schedule'], kept: 'kept' })
    await open(page, pathFor('sidebarArrangement'))
    await page.locator(THE_PART).waitFor({ timeout: 30_000 })
    expect(await thePinnedPagesListed(page), 'listed after Schedule was pinned').toEqual(['notes', 'home', 'myNotes', 'checklists', 'schedule'])
    expect(await theFront(page), 'the front after Schedule was pinned').toEqual(theFrontFor(['notes', 'home', 'myNotes', 'checklists', 'schedule']))

    // The edit view draws the same part, at its top.
    await open(page, `${pathFor('sidebarArrangement')}/edit`)
    await page.locator(THE_PART).waitFor({ timeout: 30_000 })
    expect(await thePinnedPagesListed(page), 'listed on the edit view').toEqual(['notes', 'home', 'myNotes', 'checklists', 'schedule'])
    expect(await whereTheEditPressIs(page, said('pagesFromSettings.stopEditing')), 'where Stop editing stands').toEqual(theEditPressHere)
    const first = await page.evaluate(() => document.querySelector('#main [data-sidebar-pins]')!.compareDocumentPosition(document.querySelector('#main [data-sidebar-group]')!) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(first, 'the part before the first group on the edit view').toBeGreaterThan(0)
  } finally {
    await context.close()
  }
}, 180_000)

it('4. a pinned Developer page stands in front in normal mode and in developer mode', async () => {
  const put = await fetch(`${app.api}/api/sidebar-pins`, { method: 'PUT', headers: OWNER, body: JSON.stringify({ pins: ['home', 'terminals'] }) })
  expect(put.status, await put.clone().text()).toBe(200)
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    expect(await theFront(page), 'the front in normal mode').toEqual(['rail.home', 'rail.chat', 'rail.terminals', 'rail.allpages'])
    await openAllPages(page)
    expect(await page.locator('#main [data-group="developer"]').count(), 'the Developer group on All pages in normal mode').toBe(0)

    await openAllPages(page, 'lang=en&mode=inspect')
    expect(await theFront(page), 'the front in developer mode').toEqual(['rail.home', 'rail.chat', 'rail.terminals', 'rail.allpages'])
    expect(await page.locator('#main [data-group="developer"]').count(), 'the Developer group on All pages in developer mode').toBe(1)
    expect(await howAllPagesDraws(page, 'terminals'), 'Terminals on All pages in developer mode').toEqual({ grey: true, presses: [said('pins.unpinPage', { page: nameOf('terminals') })] })
  } finally {
    await context.close()
    writeTheRow(null)
  }
}, 180_000)

it('5. a kept list the sidebar cannot read, or a read that fails, draws the shipped front and says so', async () => {
  writeTheRow('not json')
  const { context, page } = await aWindow()
  try {
    await open(page, '/')
    expect(await theFront(page), 'the front with an unreadable row').toEqual(SHIPPED_FRONT)
    const line = `${said('pins.unreadable')} ${THE_KEPT_PINS_ARE_NOT_JSON}`
    expect(await page.locator('#shell-side [role="status"]').allInnerTexts(), 'what the sidebar says').toContain(line)
    await open(page, pathFor('sidebarArrangement'))
    await page.locator(THE_PART).waitFor({ timeout: 30_000 })
    expect(await page.locator(`${THE_PART} [role="status"]`).allInnerTexts(), 'what the arrangement page says').toEqual([line])
    expect(await thePinnedPagesListed(page), 'listed with an unreadable row').toEqual([...SHIPPED_PINS])
    expect(readTheRow(), 'the row after reading only').toBe('not json')
  } finally {
    await context.close()
  }
  writeTheRow(null)
  const failing = await aWindow()
  try {
    await failing.page.route('**/api/sidebar-pins', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The made-up office could not read the pins.' }) }))
    await open(failing.page, '/')
    expect(await theFront(failing.page), 'the front when the read fails').toEqual(SHIPPED_FRONT)
    const saidThen = await failing.page.locator('#shell-side [role="status"]').allInnerTexts()
    expect(saidThen.filter((one) => one.startsWith(said('pins.readFailed'))), 'what the sidebar says when the read fails').toHaveLength(1)
  } finally {
    await failing.context.close()
  }
}, 180_000)

it("6. an agent's pin press is refused: the page says why, the front does not change and nothing is kept", async () => {
  writeTheRow(null)
  // A WRITE FROM A BROWSER IN THE NAME OF AN AGENT NOBODY REGISTERED is refused by the office before the door is asked,
  // so the person starts the made-up agent first, and the door's own refusal is the one read here. Its key is not kept.
  const started = await fetch(`${app.api}/api/agents/started`, {
    method: 'POST',
    headers: { ...OWNER, ...thePersonsKeyHeader(join(app.dir, 'keys.json')) },
    body: JSON.stringify({ handle: 'made-up-agent', name: 'Made-up agent', role: 'worker' }),
  })
  expect(started.status, 'the person starts the made-up agent').toBeLessThan(300)
  const { context, page } = await aWindow({ agent: true })
  try {
    await openAllPages(page)
    const before = await theFront(page)
    const refused = page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/sidebar-pins' && reply.request().method() === 'PUT', { timeout: 15_000 })
    await page.locator('#main').getByRole('button', { name: said('pins.pinPage', { page: nameOf('schedule') }), exact: true }).click()
    const answer = await refused
    expect(answer.status(), 'the answer to an agent').toBe(403)
    const { error, code, values } = await answer.json() as { error: string; code: string; values: { reason: string } }
    expect(code, error).toBe('sidebarPinsRefused')
    await page.locator('#main .px-error').waitFor({ timeout: 10_000 })
    expect(await page.locator('#main .px-error').innerText(), 'what the page says').toContain(said('server.sidebarPinsRefused', { reason: values.reason }))
    expect(await theFront(page), 'the front after the refusal').toEqual(before)
    expect(await howAllPagesDraws(page, 'schedule'), 'Schedule after the refusal').toEqual({ grey: false, presses: [said('pins.pinPage', { page: nameOf('schedule') })] })
    expect(readTheRow(), 'the kept row').toBeNull()
  } finally {
    await context.close()
  }
}, 120_000)

it('7. a pinned page of the project stands in the project block, under its name, in the person’s order, and not in front', async () => {
  const pins = [...SHIPPED_PINS, 'ideas', 'modules']
  const put = await fetch(`${app.api}/api/sidebar-pins`, { method: 'PUT', headers: OWNER, body: JSON.stringify({ pins }) })
  expect(put.status, await put.clone().text()).toBe(200)
  const inTheBlock = [surfaceOf('ideas'), surfaceOf('modules')]
  const there = { belowTheFront: true, aboveAllPages: true, rowsUnderTheHead: true }
  try {
    // Open: the rows in the block, in the person's order, under the project's initials, the Switch and its name.
    const wide = await aWindow()
    try {
      await wide.page.emulateMedia({ reducedMotion: 'reduce' })
      await open(wide.page, '/')
      await wide.page.locator('#shell-side .sbp-block[data-projects="ready"]').waitFor({ timeout: 30_000 })
      expect(await theFront(wide.page), 'the front, open').toEqual(SHIPPED_FRONT)
      expect(await theBlockRows(wide.page), 'the rows in the block, open').toEqual(inTheBlock)
      expect(await whereTheBlockIs(wide.page), 'where the block stands, open').toEqual(there)
      expect(await theHeadDraws(wide.page), "what the block's head draws").toEqual(['sbp-square', 'sbp-switch', 'sbp-name'])
      // Test change (wave 13y round 165, the explaining lines): one rule, between the head and the rows, and the name
      // level with the initials, beside them.
      expect(await theRulesInTheBlock(wide.page), 'the rules in the block, open').toEqual([BETWEEN])
      expect(await whereTheNameIs(wide.page), "the project's name against its initials, open").toEqual({ level: true, beside: true })
      // The Switch list opens below its press and above the rows.
      await wide.page.locator('#shell-side .sbp-switch').click()
      await wide.page.locator('#shell-side .sbp-choices').waitFor()
      const opened = await wide.page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
        return { press: box('#shell-side .sbp-switch'), list: box('#shell-side .sbp-choices'), row: box('#shell-side .sbp-block .shell-link') }
      })
      expect(opened.list.top, 'the Switch list below its press').toBeGreaterThanOrEqual(opened.press.bottom)
      expect(opened.list.bottom, 'the Switch list above the first row').toBeLessThanOrEqual(opened.row.top)
      // A row in the block lights as its page, and All pages does not light.
      await open(wide.page, DESTINATIONS.find((one) => one.key === 'modules')!.to)
      expect(await wide.page.locator(`#shell-side .sbp-block [data-target="uiSurface/${surfaceOf('modules')}"]`).getAttribute('aria-current'), 'the row on its page').toBe('page')
      expect(await wide.page.locator(THE_ENTRY).getAttribute('aria-current'), 'All pages on a page the block holds').toBeNull()
    } finally {
      await wide.context.close()
    }

    // Narrowed: each row is its icon, and the mouse or the keyboard on it shows its name beside the sidebar.
    const narrowed = await aWindow({ narrowed: true })
    try {
      await open(narrowed.page, '/')
      await narrowed.page.locator('#shell-side[data-state="collapsed"]').waitFor()
      expect(await theBlockRows(narrowed.page), 'the rows in the block, narrowed').toEqual(inTheBlock)
      expect(await whereTheBlockIs(narrowed.page), 'where the block stands, narrowed').toEqual(there)
      expect(await theRulesInTheBlock(narrowed.page), 'the rules in the block, narrowed').toEqual([BETWEEN])
      const row = narrowed.page.locator(`#shell-side .sbp-block [data-target="uiSurface/${surfaceOf('modules')}"]`)
      expect(await row.locator('.shell-label').evaluate((one) => one.getBoundingClientRect().width), "a row's word, narrowed").toBeLessThanOrEqual(1)
      await row.hover()
      await narrowed.page.locator('.shell-tip').waitFor({ timeout: 5_000 })
      expect(await narrowed.page.locator('.shell-tip').innerText(), 'the name the mouse shows').toBe(nameOf('modules'))
      await narrowed.page.mouse.move(900, 450)
      await narrowed.page.locator('.shell-tip').waitFor({ state: 'detached', timeout: 5_000 })
      await narrowed.page.locator('#shell-side .sbp-mini').focus()
      await narrowed.page.keyboard.press('Tab')
      await narrowed.page.locator('.shell-tip').waitFor({ timeout: 5_000 })
      expect(await narrowed.page.locator('.shell-tip').innerText(), 'the name the keyboard shows').toBe(nameOf('ideas'))
    } finally {
      await narrowed.context.close()
    }

    // In the menu at 390, the same rows in the same place.
    const phone = await aWindow({ width: 390 })
    try {
      await open(phone.page, '/')
      await phone.page.locator('.shell-menu').click()
      await phone.page.locator('#shell-side[data-drawer="open"]').waitFor()
      await phone.page.waitForTimeout(600)
      expect(await theFront(phone.page), 'the front in the menu').toEqual(SHIPPED_FRONT)
      expect(await theBlockRows(phone.page), 'the rows in the block in the menu').toEqual(inTheBlock)
      expect(await whereTheBlockIs(phone.page), 'where the block stands in the menu').toEqual(there)
      expect(await theRulesInTheBlock(phone.page), 'the rules in the block in the menu').toEqual([BETWEEN])
      expect(await whereTheNameIs(phone.page), "the project's name against its initials in the menu").toEqual({ level: true, beside: true })
    } finally {
      await phone.context.close()
    }

    const { context, page } = await aWindow()
    try {
      // All pages draws no block and no Switch, and This project's caption opens the project's own page. A pinned page
      // of the project is grey there, and its presses speak of the project, not of the front.
      await openAllPages(page)
      expect(await page.locator('#main .sbp-block, #main .sbp-switch').count(), 'a block or a Switch on All pages').toBe(0)
      expect(await page.locator(`#main .ap-group[data-group="project"] .ap-cap a[href="#${categoryPath('project')}"]`).count(), "This project's caption").toBe(1)
      expect(await howAllPagesDraws(page, 'modules'), 'Modules, pinned').toEqual({ grey: true, presses: [said('pins.unpinProjectPage', { page: nameOf('modules') })] })
      expect(await howAllPagesDraws(page, 'pipeline'), 'Pipelines, not pinned').toEqual({ grey: false, presses: [said('pins.pinProjectPage', { page: nameOf('pipeline') })] })
      await pressAndKeep(page, '#main', said('pins.unpinProjectPage', { page: nameOf('ideas') }))
      expect(await theKeptPins(), 'kept after Ideas was unpinned on All pages').toEqual({ pins: [...SHIPPED_PINS, 'modules'], kept: 'kept' })
      expect(await theBlockRows(page), 'the block after Ideas was unpinned').toEqual([surfaceOf('modules')])
      // Test change (wave 13y round 165, the explaining lines): the arrangement page's groups draw no pin press, so
      // Pipelines is pinned on All pages.
      await pressAndKeep(page, '#main', said('pins.pinProjectPage', { page: nameOf('pipeline') }))
      expect(await theKeptPins(), 'kept after Pipelines was pinned on All pages').toEqual({ pins: [...SHIPPED_PINS, 'modules', 'pipeline'], kept: 'kept' })

      // The arrangement page lists the project's pinned pages in their own part, after the pages in front.
      await open(page, pathFor('sidebarArrangement'))
      await page.locator(THE_PART).waitFor({ timeout: 30_000 })
      expect(await thePinnedPagesListed(page, 'front'), 'the pages in front listed').toEqual([...SHIPPED_PINS])
      expect(await thePinnedPagesListed(page, 'project'), "the project's pages listed").toEqual(['modules', 'pipeline'])
      // Up and down move a page within its own part, and the first and the last are judged in each part.
      const press = (key: string, words: 'pins.upPage' | 'pins.downPage') => page.locator(THE_PART).getByRole('button', { name: said(words, { page: nameOf(key) }), exact: true })
      expect(await press('decisions', 'pins.downPage').getAttribute('aria-disabled'), 'down on the last page in front').toBe('true')
      expect(await press('modules', 'pins.upPage').getAttribute('aria-disabled'), "up on the project's first page").toBe('true')
      expect(await press('pipeline', 'pins.downPage').getAttribute('aria-disabled'), "down on the project's last page").toBe('true')
      await pressAndKeep(page, THE_PART, said('pins.upPage', { page: nameOf('pipeline') }))
      expect(await theKeptPins(), 'kept after Pipelines moved up').toEqual({ pins: [...SHIPPED_PINS, 'pipeline', 'modules'], kept: 'kept' })
      expect(await theBlockRows(page), 'the block after Pipelines moved up').toEqual([surfaceOf('pipeline'), surfaceOf('modules')])
      expect(await theFront(page), 'the front after Pipelines moved up').toEqual(SHIPPED_FRONT)
      await pressAndKeep(page, THE_PART, said('pins.unpinProjectPage', { page: nameOf('modules') }))
      expect(await theKeptPins(), 'kept after Modules was unpinned on the arrangement page').toEqual({ pins: [...SHIPPED_PINS, 'pipeline'], kept: 'kept' })
      expect(await theBlockRows(page), 'the block after Modules was unpinned').toEqual([surfaceOf('pipeline')])
    } finally {
      await context.close()
    }
  } finally {
    writeTheRow(null)
  }
}, 240_000)

it('8. the arrangement page draws no line that explains what it shows, its groups draw no pin press, and each kind of press stands in one column', async () => {
  const keep = async (pins: readonly string[]): Promise<void> => {
    const put = await fetch(`${app.api}/api/sidebar-pins`, { method: 'PUT', headers: OWNER, body: JSON.stringify({ pins }) })
    expect(put.status, await put.clone().text()).toBe(200)
  }
  try {
    // No page in front: the front's part draws its heading, and no line says the list is empty.
    await keep(['ideas'])
    const empty = await aWindow()
    try {
      await open(empty.page, pathFor('sidebarArrangement'))
      await empty.page.locator(THE_PART).waitFor({ timeout: 30_000 })
      expect(await thePinnedPagesListed(empty.page), 'the pages in front listed').toEqual([])
      expect(await thePinnedPagesListed(empty.page, 'project'), "the project's pages listed").toEqual(['ideas'])
      expect(await empty.page.locator(`${THE_PART} [data-pins-part="front"] h3`).innerText(), "the front's heading").toBe(said('pins.title'))
      expect(await theLinesDrawn(empty.page), 'the lines drawn with no page in front').toEqual([])
    } finally {
      await empty.context.close()
    }

    // A long name among the pinned pages: up, down and unpin each stand in one column, in both parts, at 1440 and 390.
    await keep(['home', 'yourWords', 'decisions', 'ideas', 'modules'])
    for (const width of [1440, 390]) {
      const { context, page } = await aWindow({ width })
      try {
        await open(page, pathFor('sidebarArrangement'))
        await page.locator(THE_PART).waitFor({ timeout: 30_000 })
        expect(await thePinnedPagesListed(page), `the pages in front at ${String(width)}`).toEqual(['home', 'yourWords', 'decisions'])
        expect(await page.locator('#main [data-sidebar-group] button').count(), `the presses in the groups at ${String(width)}`).toBe(0)
        expect(await thePressColumns(page), `the columns of the presses at ${String(width)}`).toEqual({ up: 1, down: 1, unpin: 1 })
      } finally {
        await context.close()
      }
    }

    // The edit view: each page in a group has its up and its down press and no other, and each kind stands in one
    // column. A group emptied there draws its heading, and no line says it is empty.
    const { context, page } = await aWindow()
    try {
      await open(page, `${pathFor('sidebarArrangement')}/edit`)
      await page.locator('#main [data-sidebar-group] [data-sidebar-page] select').first().waitFor({ timeout: 30_000 })
      const pressesEach = await page.locator('#main [data-sidebar-group] [data-sidebar-page]').evaluateAll((all) => [...new Set(all.map((one) => one.querySelectorAll('button').length))])
      expect(pressesEach, 'the presses beside each page in a group').toEqual([2])
      expect(await thePressColumns(page), 'the columns of the presses on the edit view').toEqual({ up: 1, down: 1, unpin: 1, 'move up': 1, 'move down': 1 })
      const office = SHIPPED_SIDEBAR.groups.find((one) => one.key === 'office')!
      for (const key of office.keys) await page.locator(`#main [data-sidebar-group="office"] [data-sidebar-page="${key}"] select`).selectOption('agents')
      expect(await page.locator('#main [data-sidebar-group="office"] [data-sidebar-page]').count(), 'the pages left in Office').toBe(0)
      expect(await page.locator('#main [data-sidebar-group="office"] h3').count(), "Office's heading").toBe(1)
      expect(await theLinesDrawn(page), 'the lines drawn with Office emptied').toEqual([])
    } finally {
      await context.close()
    }
  } finally {
    writeTheRow(null)
  }
}, 240_000)

it('9. draws no project part while no page of the project is pinned, and keeps its heading while the pins load or cannot be read', async () => {
  writeTheRow(null)
  // LOADING: the pins have not been read yet, so the part is drawn as it was. The store starts not-read, and the
  // component is drawn from that state without a browser.
  const writes = { busy: false, fault: null, keep: async () => {} }
  const loadingHtml = renderToStaticMarkup(createElement(PinnedPagesPart, { writes }))
  expect(loadingHtml, "the project's heading while the pins load").toContain(said('pins.projectTitle'))
  // A READ THAT FAILED draws what the page drew before this change: the heading, and the line saying the read failed.
  const failing = await aWindow()
  try {
    await failing.page.route('**/api/sidebar-pins', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'The made-up office could not read the pins.' }) }))
    await open(failing.page, pathFor('sidebarArrangement'))
    expect(await failing.page.locator(`${THE_PART} [data-pins-part="project"] h3`).innerText(), "the project's heading when the read failed").toBe(said('pins.projectTitle'))
    expect(await failing.page.locator(THE_PART).innerText(), 'the arrangement says the read failed').toContain(said('pins.readFailed'))
  } finally {
    await failing.context.close()
  }
}, 240_000)

it.skipIf(PICTURES === undefined)('takes the pictures of the pins on All pages, on the arrangement page, narrowed and in the menu', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  const put = await fetch(`${app.api}/api/sidebar-pins`, { method: 'PUT', headers: OWNER, body: JSON.stringify({ pins: ['home', 'notes', 'checklists', 'decisions', 'schedule'] }) })
  expect(put.status, await put.clone().text()).toBe(200)
  try {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const { context, page } = await aWindow({ theme, width })
        try {
          const name = (what: string): string => join(folder, `${what}-${String(width)}-${theme}.png`)
          await openAllPages(page)
          await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
          await page.waitForTimeout(600)
          await page.screenshot({ path: name('pins-all-pages'), fullPage: true })
          if (width === 1440) {
            await open(page, '/')
            await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
            await page.waitForTimeout(600)
            await page.screenshot({ path: name('pins-home-with-one-project-page') })
          }
          await open(page, pathFor('sidebarArrangement'))
          await page.locator(THE_PART).waitFor({ timeout: 30_000 })
          await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
          await page.waitForTimeout(600)
          await page.screenshot({ path: name('pins-arrangement'), fullPage: true })
          if (width === 390) {
            await open(page, '/')
            await page.locator('.shell-menu').click()
            await page.locator('#shell-side[data-drawer="open"]').waitFor()
            await page.waitForTimeout(600)
            await page.screenshot({ path: name('pins-menu') })
          }
        } finally {
          await context.close()
        }
      }
      const narrowed = await aWindow({ theme, narrowed: true })
      try {
        await open(narrowed.page, '/')
        await narrowed.page.locator('#shell-side[data-state="collapsed"]').waitFor()
        await putTheMadeUpLabelIn(narrowed.page, LABEL, narrowed.page.locator(THE_PAGE_TOP).first(), CALLED)
        await narrowed.page.waitForTimeout(600)
        await narrowed.page.screenshot({ path: join(folder, `pins-narrowed-1440-${theme}.png`) })
      } finally {
        await narrowed.context.close()
      }
    }
  } finally {
    writeTheRow(null)
  }
}, 900_000)

it.skipIf(PICTURES === undefined)('takes the pictures of the arrangement with no page of the project pinned', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  try {
    writeTheRow(null)
    for (const theme of ['light', 'dark'] as const) {
      const { context, page } = await aWindow({ theme })
      try {
        await open(page, pathFor('sidebarArrangement'))
        await page.locator(THE_PART).waitFor({ timeout: 30_000 })
        await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
        await page.waitForTimeout(600)
        await page.screenshot({ path: join(folder, `pins-arrangement-no-project-1440-${theme}.png`), fullPage: true })
      } finally {
        await context.close()
      }
    }
  } finally {
    writeTheRow(null)
  }
}, 300_000)
