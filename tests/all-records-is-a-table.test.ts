// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The criterion changed in wave 13j round 14: All records reads across projects, so the table draws
// a Project column right after Title, and the filter bar holds the project control beside the kind
// control. The wording was "the four columns, in the order Title, Kind, State,
// Updated" and "two controls"; it is now Title, Project, Kind, State, Updated, and three controls.
/**
 * ALL RECORDS IS A TABLE OF TITLE, PROJECT, KIND, STATE AND UPDATED, UNDER THE SHARED RULES, in a
 * real browser.
 *
 * The owner took wave 13k's proposal for this page as recommended, report n9Mjk3c_sJRu, block b-17: "All records as a
 * table of Title, Kind, State and Updated", with the twelve shared
 * rules. This test opens #/records from `liveApp` (a real server on a temporary database, the
 * built page) and reads what the page draws:
 *
 *   - the same head as every page: the title is the sidebar's own word, "All records", with one line
 *     under it, and the page has exactly one primary press, "New record", at the right of the title;
 *   - the filter is not a box: no panel is drawn around the project, the kind, the search box and
 *     the clear press;
 *   - the five columns, in the order Title, Project, Kind, State, Updated, in normal mode, with Project
 *     there since the page reads across projects;
 *   - a press anywhere on a row opens its record, not only a press on its title;
 *   - a kind with no state field is the short mark, with its reason on hover;
 *   - Created, Missing and Source: in normal mode an incomplete record is marked on its title line,
 *     and a made-up record says "Made-up example" on its title line, or once beside the Title heading
 *     when every row carries it; developer mode draws all nine columns.
 *
 * Records are filed through the API as the person. The made-up case marks the records' origin on
 * the way back to the page, as tests/the-family-lists-share-one-design.test.ts does.
 *
 * When W13J_RECORDS_SHOTS names a folder, the page is also photographed there at 1440, 990, 660 and
 * 390 in both themes, and at 1440 in Chinese. The pictures go nowhere else.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'

let app: LiveApp
let page: Page
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const shots = process.env.W13J_RECORDS_SHOTS

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  if (!reply.ok) throw new Error(`${method} ${path} answered ${reply.status}: ${text}`)
  return JSON.parse(text) as T
}
async function file(kind: string, title: string, data?: Record<string, unknown>): Promise<{ id: string; incompleteCount?: number }> {
  const made = await call<{ record: { id: string } }>('/api/records', 'POST', { kind, title, ...(data === undefined ? {} : { data }) })
  return made.record
}

const NOTE = 'Seed tray notes from the second bench'
const STUB = 'Water the seed trays every morning'
let noteId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'all-records-table', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  page = app.page
  noteId = (await file('note', NOTE, { body: 'The trays on the second bench dried out by noon.' })).id
  await file('claim', 'The slower fan keeps the seed tray cooler', { state: 'measured', method: 'a thermometer' })
  // An obligation filed with no fields is stored incomplete: the server counts what it still wants.
  await file('obligation', STUB)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function open(width = 1440, query = '?lang=en'): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/${query}#/records`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('main.page .rec tbody tr').first().waitFor({ timeout: 30_000 })
}

function row(title: string) {
  return page.locator('main.page .rec tbody tr', { hasText: title })
}

describe('the head, the filter and the columns', () => {
  it('is headed "All records", with one line under it and one primary press, "New record"', async () => {
    await open()
    expect(await page.locator('main.page h1.rec-title').innerText()).toBe('All records')
    expect((await page.locator('main.page .rec-head .rec-lede').innerText()).trim()).not.toBe('')
    const primary = page.locator('main.page .px-btn[data-variant="primary"]')
    expect(await primary.count(), 'the page has more or fewer than one primary press').toBe(1)
    expect(await page.locator('main.page .rec-head-act .px-btn[data-variant="primary"]').innerText()).toBe('New record')
  }, 120_000)

  it('draws no box around the filter', async () => {
    await open()
    const bar = page.locator('main.page .rec-filterbar')
    expect(await bar.count()).toBe(1)
    const boxed = await bar.evaluate((one) => {
      // A box is a panel, or anything from the bar up to the page that draws a border around it.
      if (one.closest('.px-panel') !== null) return 'inside a panel'
      for (let at: Element | null = one; at !== null && !at.matches('main.page'); at = at.parentElement) {
        const style = getComputedStyle(at)
        if (['Top', 'Right', 'Bottom', 'Left'].some((side) => style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' && parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0)) {
          return `a border on ${at.className}`
        }
      }
      return null
    })
    expect(boxed).toBe(null)
    // The three controls and the press that clears them are still there: the project, the kind and
    // the search box.
    expect(await bar.locator('select').count()).toBe(2)
    expect(await bar.locator('.pch-choice select').count()).toBe(1)
    expect(await bar.locator('input').count()).toBe(1)
  }, 120_000)

  it('draws five columns in normal mode, Title, Project, Kind, State and Updated, in that order', async () => {
    await open()
    const heads = await page.locator('main.page .rec-table thead th').evaluateAll((all) => all.map((one) => one.getAttribute('data-col')))
    expect(heads).toEqual(['title', 'project', 'kind', 'state', 'updated'])
    const cells = await row(NOTE).locator('td').evaluateAll((all) => all.map((one) => one.getAttribute('data-col')))
    expect(cells).toEqual(['title', 'project', 'kind', 'state', 'updated'])
  }, 120_000)
})

describe('a row', () => {
  it('opens its record on a press anywhere on the row, not only on the title', async () => {
    await open()
    await row(NOTE).locator('td[data-col="updated"]').click()
    await page.waitForFunction((id) => window.location.hash.includes(id), noteId, { timeout: 30_000 })
    expect(new URL(page.url()).hash).toContain(noteId)
  }, 120_000)

  it('draws a state this kind never has as the short mark, with its reason on hover', async () => {
    await open()
    const cell = row(NOTE).locator('td[data-col="state"]')
    const mark = cell.locator('.px-absent')
    expect(await mark.count()).toBe(1)
    expect(await mark.getAttribute('title')).toBe(en['sheet.noState.noFieldDetail'])
    expect(await cell.innerText()).not.toContain(en['sheet.noState.noField'])
  }, 120_000)

  it('marks an incomplete record on its title line in normal mode', async () => {
    await open()
    expect(await row(STUB).locator('td[data-col="title"] .px-inc-mark').count(), 'the incomplete record carries no mark').toBe(1)
    expect(await row(NOTE).locator('td[data-col="title"] .px-inc-mark').count()).toBe(0)
  }, 120_000)
})

describe('"Made-up example" on the row, or once beside the Title heading', () => {
  async function markAsMadeUp(which: (title: string) => boolean): Promise<void> {
    await page.route('**/api/records**', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      if (Array.isArray(body.records)) for (const record of body.records) if (which(record.title)) record.origin = 'fixture'
      await route.fulfill({ response, json: body })
    })
  }

  it('says it on the row when only some rows carry it', async () => {
    await markAsMadeUp((title) => title === NOTE)
    try {
      await open()
      expect(await row(NOTE).locator('td[data-col="title"] [data-origin="fixture"]').count()).toBe(1)
      expect(await row(STUB).locator('[data-origin="fixture"]').count()).toBe(0)
      expect(await page.locator('main.page .rec-table thead [data-origin="fixture"]').count()).toBe(0)
    } finally {
      await page.unroute('**/api/records**')
    }
  }, 120_000)

  it('says it once beside the Title heading, and on no row, when every row carries it', async () => {
    await markAsMadeUp(() => true)
    try {
      await open()
      expect(await page.locator('main.page .rec-table thead th[data-col="title"] [data-origin="fixture"]').count()).toBe(1)
      expect(await page.locator('main.page .rec-table tbody [data-origin="fixture"]').count()).toBe(0)
    } finally {
      await page.unroute('**/api/records**')
    }
  }, 120_000)
})

describe('developer mode', () => {
  it('draws all nine columns, with Created, Missing, Source and Id after the five', async () => {
    await open()
    await page.evaluate(() => window.localStorage.setItem('mole-office.mode', 'inspect'))
    try {
      await open()
      const heads = await page.locator('main.page .rec-table thead th').evaluateAll((all) => all.map((one) => one.getAttribute('data-col')))
      expect(heads).toEqual(['title', 'project', 'kind', 'state', 'updated', 'created', 'incomplete', 'origin', 'id'])
    } finally {
      await page.evaluate(() => window.localStorage.removeItem('mole-office.mode'))
    }
    if (shots !== undefined) await photograph()
  }, 240_000)
})

/** The page at four widths in both themes, and at 1440 in Chinese, when a caller names a folder. */
async function photograph(): Promise<void> {
  if (shots === undefined) return
  mkdirSync(shots, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const language of width === 1440 ? ['en', 'zh'] : ['en']) {
        await open(width, `?lang=${language}`)
        await page.evaluate((next) => {
          document.documentElement.dataset.theme = next
        }, theme)
        await page.screenshot({ path: join(shots, `records-${String(width)}-${theme}-${language}.png`), fullPage: true })
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}
