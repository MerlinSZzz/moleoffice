// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOME DRAWS THE LAYOUT ITS PERSON KEPT. With no kept row Home draws A: the three parts in one column. The
 * person drags a part by its handle to the band or either column, and the place it would go is shown while
 * it is dragged. A small menu on each part makes the same moves from the keyboard. Each move is kept, so a
 * reload draws it again. Below the width where two columns fit, the parts stack band, first column, second
 * column, and a drag there keeps the order it makes. A kept row Home cannot read draws A and says so. The
 * notice that the office is paused stands above the three parts, wherever the person put them.
 *
 * THE PICTURES are taken only when W13Y_SIDEBAR_PICTURES names a folder: Home in A, B and C at 1440, and A at 990, 660
 * and 390, in light and dark, in English, and a film at 1440 in light of a drag from A into B, then into C, and a reload
 * that draws C. They are of a made-up office, and each carries the made-up label above the page.
 */
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { t } from '../src/shared/i18n.ts'
import {
  HOME_LAYOUT_A, HOME_LAYOUT_B, HOME_LAYOUT_C, homeLayoutSettingName, type HomeLayout, type HomePart, type HomePlace,
} from '../src/shared/home-layout.ts'
import { sevenDaysFrom } from '../src/web/components/home/HomeWeek.tsx'

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'home-draws-the-kept-layout', workspace: 'default', viewport: { width: 1440, height: 2400 } })
  page = app.page
}, 120_000)

afterAll(async () => { await app?.stop() })

const ROW = homeLayoutSettingName(THE_TEST_OFFICES_OWNER.id)
const PICTURES = process.env['W13Y_SIDEBAR_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const CALLED = 'home-draws-the-kept-layout'

function writeTheRow(value: string | null): void {
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    if (value === null) database.prepare('DELETE FROM runtime_settings WHERE name = ?').run(ROW)
    else database.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(ROW, value)
  } finally { database.close() }
}

function readTheRow(): unknown {
  const database = new DatabaseSync(join(app.dir, 'panelx.db'))
  try {
    const row = database.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(ROW) as { value: string } | undefined
    return row === undefined ? null : JSON.parse(row.value)
  } finally { database.close() }
}

async function open(width: number, height = 2400, asked = ''): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto(`${app.site}/?kept-layout=${String(Date.now())}${asked}#/`)
  await waitForThePage(page, 60_000)
  await page.locator('[data-home-layout]').waitFor()
  await page.locator('[data-home-part="schedule"]').waitFor()
}

/** What the page draws: which parts each place holds, in order, and whether the place takes any space. */
async function drawn(): Promise<{ kept: string | null; places: Record<HomePlace, { parts: string[]; shown: boolean; x: number; y: number; width: number }> }> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-home-layout]')!
    const place = (name: string) => {
      const element = root.querySelector<HTMLElement>(`[data-home-place="${name}"]`)!
      const rect = element.getBoundingClientRect()
      return {
        parts: [...element.querySelectorAll<HTMLElement>(':scope > [data-home-part]')].map(one => one.getAttribute('data-home-part')!),
        shown: getComputedStyle(element).display !== 'none' && rect.height > 0,
        x: rect.x, y: rect.y, width: rect.width,
      }
    }
    return { kept: root.getAttribute('data-home-layout-kept'), places: { band: place('band'), first: place('first'), second: place('second') } }
  })
}

const asDrawn = (places: Awaited<ReturnType<typeof drawn>>['places']): HomeLayout => ({ band: places.band.parts as HomePart[], first: places.first.parts as HomePart[], second: places.second.parts as HomePart[] })

function aKeep(): Promise<unknown> {
  return page.waitForResponse(reply => new URL(reply.url()).pathname === '/api/home-layout' && reply.request().method() === 'PUT' && reply.status() === 200)
}

/** Drags a part by its handle to the start or the end of a place, and checks the place it would go is shown first. */
async function drag(part: HomePart, to: HomePlace, where: 'start' | 'end'): Promise<void> {
  const handle = await page.locator(`[data-home-part="${part}"] [data-home-drag]`).boundingBox()
  expect(handle, `${part} has no handle to drag`).not.toBeNull()
  const fromX = handle!.x + handle!.width / 2, fromY = handle!.y + handle!.height / 2
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX + 12, fromY + 12, { steps: 4 })
  const target = await page.locator(`[data-home-place="${to}"]`).boundingBox()
  expect(target, `the ${to} place is not drawn while ${part} is dragged`).not.toBeNull()
  const y = where === 'start' ? target!.y + 6 : target!.y + target!.height - 6
  await page.mouse.move(target!.x + target!.width / 2, y, { steps: 8 })
  await expect.poll(() => page.locator(`[data-home-place="${to}"] [data-home-drop-mark]`).count(), { timeout: 5_000 }).toBe(1)
  const kept = aKeep()
  await page.mouse.up()
  await kept
}

it('draws A with no kept row: the three parts in the first column, and the band and second column take no space', async () => {
  writeTheRow(null)
  await open(1440)
  const { kept, places } = await drawn()
  expect(kept).toBe('nothing-kept')
  expect(asDrawn(places)).toEqual(HOME_LAYOUT_A)
  expect(places.band.shown).toBe(false)
  expect(places.second.shown).toBe(false)
  expect(await page.locator('[data-home-layout-note]').count()).toBe(0)
  // The first column takes the whole width the second leaves.
  const board = await page.locator('[data-home-grid]').boundingBox()
  expect(Math.abs(places.first.width - board!.width)).toBeLessThan(2)
}, 120_000)

it('after drags into the second column and a reload draws B, and after a drag into the band and a reload draws C', async () => {
  writeTheRow(null)
  await open(1440)
  await drag('agents', 'second', 'start')
  await drag('schedule', 'second', 'end')
  expect(asDrawn((await drawn()).places)).toEqual(HOME_LAYOUT_B)
  expect(readTheRow()).toEqual(HOME_LAYOUT_B)

  await open(1440)
  const b = await drawn()
  expect(b.kept).toBe('kept')
  expect(asDrawn(b.places)).toEqual(HOME_LAYOUT_B)
  expect(b.places.second.shown).toBe(true)
  expect(b.places.second.x).toBeGreaterThan(b.places.first.x + b.places.first.width - 1)
  expect(Math.abs(b.places.second.y - b.places.first.y)).toBeLessThan(2)

  await drag('agents', 'band', 'start')
  await open(1440)
  const c = await drawn()
  expect(c.kept).toBe('kept')
  expect(asDrawn(c.places)).toEqual(HOME_LAYOUT_C)
  expect(readTheRow()).toEqual(HOME_LAYOUT_C)
  // The band runs across both columns, above them.
  expect(c.places.band.width).toBeGreaterThan(c.places.first.width + c.places.second.width)
  expect(c.places.band.y).toBeLessThan(c.places.first.y)
}, 180_000)

it('moves a part from its small menu with the keyboard, and keeps the move', async () => {
  writeTheRow(null)
  await open(1440)
  await page.locator('[data-home-part="schedule"] [data-home-move-menu]').press('Enter')
  const kept = aKeep()
  await page.locator('[data-home-part="schedule"] [data-home-move="band"]').press('Enter')
  await kept
  await open(1440)
  expect(asDrawn((await drawn()).places)).toEqual({ band: ['schedule'], first: ['needs', 'agents'], second: [] })
  await page.locator('[data-home-part="needs"] [data-home-move-menu]').press('Enter')
  const again = aKeep()
  await page.locator('[data-home-part="needs"] [data-home-move="down"]').press('Enter')
  await again
  await open(1440)
  expect(asDrawn((await drawn()).places)).toEqual({ band: ['schedule'], first: ['agents', 'needs'], second: [] })
}, 120_000)

it('stacks band, first column, second column below the width for two columns, and keeps the order a drag there makes', async () => {
  writeTheRow(JSON.stringify(HOME_LAYOUT_C))
  for (const width of [990, 660, 390]) {
    await open(width)
    const { places } = await drawn()
    expect(asDrawn(places), `${String(width)}px`).toEqual(HOME_LAYOUT_C)
    const order = await page.locator('[data-home-part]').evaluateAll(nodes => nodes.map(one => ({ part: one.getAttribute('data-home-part'), x: one.getBoundingClientRect().x, y: one.getBoundingClientRect().y })))
    expect(order.map(one => one.part), `${String(width)}px`).toEqual(['agents', 'needs', 'schedule'])
    expect(order.every(one => Math.abs(one.x - order[0]!.x) < 1), `${String(width)}px: the parts do not stand in one column`).toBe(true)
    expect(order.every((one, index) => index === 0 || one.y > order[index - 1]!.y), `${String(width)}px: the parts are not stacked in order`).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${String(width)}px scrolls sideways`).toBe(true)
  }
  await open(660)
  await drag('needs', 'second', 'end')
  const moved = { band: ['agents'], first: [], second: ['schedule', 'needs'] }
  expect(readTheRow()).toEqual(moved)
  await open(660)
  expect(await page.locator('[data-home-part]').evaluateAll(nodes => nodes.map(one => one.getAttribute('data-home-part')))).toEqual(['agents', 'schedule', 'needs'])
  expect(asDrawn((await drawn()).places)).toEqual(moved)
}, 240_000)

it('draws A from a kept row it cannot read, and says in words that the kept layout could not be read', async () => {
  writeTheRow('made-up words that are not a layout')
  await open(1440)
  const { kept, places } = await drawn()
  expect(kept).toBe('unreadable')
  expect(asDrawn(places)).toEqual(HOME_LAYOUT_A)
  expect((await page.locator('[data-home-layout-note]').innerText()).trim()).toBe(t('home.layout.unreadable'))
}, 120_000)

/** The made-up projects of the pictures, and the agents at work in each. The default project holds none. */
const MADE_UP_PROJECTS = [
  { id: 'made-up-greenhouse', title: 'Made-up greenhouse', agents: ['Made-up seed counter', 'Made-up vent watcher', 'Made-up soil reader'] },
  { id: 'made-up-tide-tables', title: 'Made-up tide tables', agents: ['Made-up chart drawer', 'Made-up harbour clerk'] },
  { id: 'made-up-bench-rig', title: 'Made-up bench rig', agents: ['Made-up clamp tester', 'Made-up wiring checker'] },
] as const

async function send(method: string, path: string, headers: Record<string, string>, body?: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (reply.status >= 300) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

/**
 * FILLS THE OFFICE FOR THE PICTURES, once: three made-up projects with agents at work, an agent's message and a report
 * waiting on the person, and pieces of work planned on four days of the week. Every name in it begins "Made-up".
 */
let filled = false
async function fillTheOfficeForThePictures(): Promise<void> {
  if (filled) return
  const asPerson = (project: string): Record<string, string> => ({
    'content-type': 'application/json',
    'x-mole-office-workspace': project,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  })
  let n = 0
  for (const project of MADE_UP_PROJECTS) {
    await send('POST', '/api/workspaces', asPerson('default'), { id: project.id, title: project.title })
    for (const name of project.agents) {
      n += 1
      const handle = `made-up-picture-agent-${String(n)}`
      const started = await send('POST', '/api/agents/started', asPerson(project.id), { handle, name, role: 'worker', runtime: 'claude-code' })
      const asTheAgent = { 'content-type': 'application/json', 'x-mole-office-workspace': project.id, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': String(started['whatToGiveIt']?.key) }
      // AN OPEN RUN, filed by the agent itself, so the agent is at work and counted as working.
      await send('POST', '/api/attachments', asTheAgent, { title: `A made-up run of ${name}`, agentId: String(started['record']) })
      if (name === 'Made-up harbour clerk') {
        // A MESSAGE TO THE PERSON, so Needs you has a row and the agent is waiting on the person.
        await send('POST', '/api/records', asTheAgent, {
          kind: 'message',
          title: 'Made-up question: may the tide chart use last year\'s readings?',
          data: { body: 'Made-up words for a picture.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] },
        })
      }
    }
  }
  await send('POST', '/api/records', asPerson('default'), {
    kind: 'report',
    title: 'Made-up report: the bench rig held its load',
    data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-11-12', blocks: [{ id: 'b-1', type: 'text', text: 'Made-up words for a picture.' }] },
  })
  const today = (await send('GET', '/api/planning/today', asPerson('default')))['day'] as string
  const week = sevenDaysFrom(today)
  const planned = [
    { project: 'default', title: 'Made-up review of the week', day: week[0]! },
    { project: 'made-up-greenhouse', title: 'Made-up seed count', day: week[0]! },
    { project: 'made-up-tide-tables', title: 'Made-up chart of the spring tides', day: week[1]! },
    { project: 'made-up-bench-rig', title: 'Made-up clamp load test', day: week[3]! },
    { project: 'made-up-greenhouse', title: 'Made-up vent repair', day: week[5]! },
  ]
  for (const one of planned) {
    const task = await send('POST', '/api/records', asPerson(one.project), { kind: 'task', title: one.title, data: { state: 'doing' } })
    await send('POST', '/api/planning/allocations', asPerson(one.project), { horizon: 'day', period: one.day, recordId: String(task['record'].id), plannedHours: 1 })
  }
  filled = true
}

/**
 * A WINDOW OF ITS OWN for the pictures, in the theme asked for, with the chat shut, and filmed
 * when a folder is given. The helpers above act in it until the case gives `page` back to the app's own window.
 */
async function aWindow(theme: 'light' | 'dark', film?: string): Promise<BrowserContext> {
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(film === undefined ? {} : { recordVideo: { dir: film, size: { width: 1440, height: 900 } } }),
  })
  await context.addInitScript((look) => {
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  page = await context.newPage()
  return context
}

/** Opens Home in English at a width for a picture, once its parts have drawn what they read, with the made-up label above it. */
async function openForAPicture(width: number): Promise<void> {
  await open(width, width === 390 ? 844 : 900, '&lang=en')
  expect(await page.evaluate(() => document.documentElement.lang), 'the language Home is drawn in').toBe('en')
  await page.locator('[data-home-entry]').first().waitFor({ timeout: 30_000 })
  await page.locator('[data-home-section="needs"] [data-home-waiting-id]').first().waitFor({ timeout: 30_000 })
  await putTheMadeUpLabelIn(page, LABEL, page.locator('#main > *:not([data-made-up-label]):not(style)').first(), CALLED)
  await page.waitForTimeout(1_500)
}

it.skipIf(PICTURES === undefined)('takes the pictures of Home in A, B and C at 1440, and A at 990, 660 and 390, in light and dark', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  await fillTheOfficeForThePictures()
  const shots: [string, string | null, HomeLayout, number[]][] = [
    ['A', null, HOME_LAYOUT_A, [1440, 990, 660, 390]],
    ['B', JSON.stringify(HOME_LAYOUT_B), HOME_LAYOUT_B, [1440]],
    ['C', JSON.stringify(HOME_LAYOUT_C), HOME_LAYOUT_C, [1440]],
  ]
  for (const theme of ['light', 'dark'] as const) {
    const context = await aWindow(theme)
    try {
      for (const [name, kept, layout, widths] of shots) {
        writeTheRow(kept)
        for (const width of widths) {
          await openForAPicture(width)
          expect(asDrawn((await drawn()).places), `${name} at ${String(width)} in ${theme}`).toEqual(layout)
          await page.screenshot({ path: join(folder, `home-${name}-${String(width)}-${theme}.png`), fullPage: true })
        }
      }
    } finally {
      page = app.page
      await context.close()
    }
  }
}, 900_000)

it.skipIf(PICTURES === undefined)('films a drag from A into B, then into C, and a reload that draws C, at 1440 in light', async () => {
  const film = join(PICTURES!, 'film')
  mkdirSync(film, { recursive: true })
  await fillTheOfficeForThePictures()
  writeTheRow(null)
  const context = await aWindow('light', film)
  const filmed = page
  try {
    await openForAPicture(1440)
    expect(asDrawn((await drawn()).places)).toEqual(HOME_LAYOUT_A)
    await drag('agents', 'second', 'start')
    await page.waitForTimeout(1_000)
    await drag('schedule', 'second', 'end')
    expect(asDrawn((await drawn()).places)).toEqual(HOME_LAYOUT_B)
    await page.waitForTimeout(1_500)
    await drag('agents', 'band', 'start')
    expect(asDrawn((await drawn()).places)).toEqual(HOME_LAYOUT_C)
    await page.waitForTimeout(1_500)
    await openForAPicture(1440)
    expect(asDrawn((await drawn()).places)).toEqual(HOME_LAYOUT_C)
    await page.waitForTimeout(3_000)
  } finally {
    page = app.page
    await context.close()
  }
  const video = filmed.video()
  if (video === null) throw new Error('the window recorded no film')
  await video.saveAs(join(film, 'home-a-to-b-to-c.webm'))
  await video.delete()
}, 300_000)

// LAST, BECAUSE IT LEAVES THE OFFICE PAUSED.
it('draws the notice that the office is paused above the three parts, in A and in C', async () => {
  const headers = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
  expect((await fetch(`${app.api}/api/office/pause`, { method: 'POST', headers, body: JSON.stringify({ why: 'Made-up quiet office' }) })).status).toBe(200)
  for (const [kept, layout] of [[null, HOME_LAYOUT_A], [JSON.stringify(HOME_LAYOUT_C), HOME_LAYOUT_C]] as const) {
    writeTheRow(kept)
    await open(1440)
    expect(asDrawn((await drawn()).places)).toEqual(layout)
    await page.locator('.office-pause-notice').waitFor()
    const where = await page.evaluate(() => {
      const notice = document.querySelector('.office-pause-notice')!
      const parts = document.querySelector('[data-home-layout]')!
      return {
        before: (notice.compareDocumentPosition(parts) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        noticeBottom: notice.getBoundingClientRect().bottom,
        partsTop: parts.getBoundingClientRect().top,
      }
    })
    expect(where.before, `the notice comes after the parts in ${String(kept)}`).toBe(true)
    expect(where.noticeBottom).toBeLessThanOrEqual(where.partsTop)
  }
}, 120_000)

it('draws the whole long project name in Agents at work at every width in both themes', async () => {
  const project = { id: 'made-up-project-for-bars', title: 'Made-up Riverside Seed Library and Store' }
  expect(project.title.length).toBe(40)
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    body: JSON.stringify(project),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  for (const theme of ['light', 'dark']) for (const width of [1440, 990, 660, 390]) {
    const context = await app.browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await context.addInitScript((look) => {
      localStorage.setItem('mole-office.preset.theme', look)
      localStorage.setItem('mole-office.chat.open', 'no')
    }, theme)
    try {
      const view = await context.newPage()
      await view.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
      await waitForThePage(view, 60_000)
      expect(await view.locator('html').getAttribute('data-theme')).toBe(theme)
      const name = view.locator('.hm-bar-name').filter({ hasText: project.title })
      await name.waitFor({ timeout: 30_000 })
      const drawn = await name.evaluate((el) => {
        const box = el.getBoundingClientRect()
        return { text: el.textContent?.trim(), cut: el.scrollWidth > el.clientWidth + 0.5 || el.scrollHeight > el.clientHeight + 0.5, inside: box.left >= 0 && box.right <= window.innerWidth }
      })
      expect(drawn, `${width}, ${theme}`).toEqual({ text: project.title, cut: false, inside: true })
    } finally {
      await context.close()
    }
  }
}, 180_000)
