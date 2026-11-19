// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORK ROW'S TITLE KEEPS A READER'S WIDTH AT 1440.
 *
 * The fault this file guards: at a 1440 window the All work list stands its project groups side
 * by side, so a row is about 535px wide. The state column takes 152px of that. In Developer mode
 * the row also draws the record's raw id and the kind beside the title, and a made-up row draws
 * its mark in the marks column. Those took the width the title needed, so the title link drew
 * 0px and every word broke one letter per line. One planned allocation adds the hours column and
 * gives the same 0px title in Normal mode.
 *
 * WHAT IS MEASURED, in a real browser at 1440px in English, in both modes:
 *   - the title link's box, the name cell's box and the row's box;
 *   - the stylesheet's own minimum width for the title link;
 *   - no English word in the title is drawn in more than one piece.
 * The title link may never be narrower than the stylesheet's own minimum for it, and it may not
 * be wider than the cell that holds it.
 *
 * THE FIXTURE is a made-up office of this test's own: one problem written as a made-up example,
 * with a title long enough to be worth measuring. The second case adds one planned hour on today
 * as the person, so the hours column is drawn. No live office is read or written.
 *
 * PICTURES: set WORK_TITLE_SHOTS to a folder and the page is photographed at 1440, 990, 660 and
 * 390 in light and dark. Nothing is written anywhere when it is not set.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AGENT, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { dayKey } from '../src/shared/planning.ts'

const TITLE = 'Synthetic section comparison — an ordinary work title (Made-up data)'

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let db: TestDb
let app: LiveApp
let work: string

beforeAll(async () => {
  db = await freshDb()
  const record = db.api.createRecord({
    workspaceId: 'default',
    kind: 'problem',
    title: TITLE,
    summary: 'Made-up data; no cloud run, release or merge occurred.',
    origin: 'fixture',
    actor: AGENT,
    data: { symptom: 'Synthetic layout specimen for a work row title. Made-up data.' },
  })
  work = record.id
  app = await liveApp({ name: 'work-title-width', viewport: { width: 1440, height: 1000 }, database: db.file })
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 60_000)

interface Row {
  mode: string
  theme: string
  language: string
  titleText: string
  titleWidth: number
  titleMinWidth: number
  nameWidth: number
  rowWidth: number
  gridTemplateColumns: string
  hours: string | null
  brokenWords: string[]
}

async function open(mode: 'normal' | 'inspect'): Promise<void> {
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=en&mode=${mode}#/work`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.wk-title', { hasText: TITLE }).waitFor({ state: 'attached', timeout: 30_000 })
  await app.page.evaluate(() => document.fonts.ready)
}

async function theRow(): Promise<Row> {
  return app.page.evaluate(({ wanted }) => {
    const isIdentifier = (token: string): boolean => /[0-9._/\\@:#]/.test(token) || /[a-z][A-Z]/.test(token)
    const brokenIn = (el: Element): string[] => {
      const out: string[] = []
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const node = walker.currentNode
        const text = node.textContent ?? ''
        if (text.trim() === '') continue
        for (const token of text.matchAll(/\S+/g)) {
          if (isIdentifier(token[0])) continue
          for (const run of token[0].matchAll(/[A-Za-z]{4,}/g)) {
            const at = (token.index ?? 0) + (run.index ?? 0)
            const range = document.createRange()
            range.setStart(node, at)
            range.setEnd(node, at + run[0].length)
            const rects = [...range.getClientRects()].filter((r) => r.width > 0.5)
            if (rects.length === 0) continue
            if (new Set(rects.map((r) => Math.round(r.top))).size > 1) out.push(run[0])
          }
        }
      }
      return out
    }
    const title = [...document.querySelectorAll<HTMLElement>('.wk-title')]
      .find((element) => (element.textContent ?? '').trim() === wanted)
    if (title === undefined) throw new Error('the fixture title was not drawn')
    const name = title.closest<HTMLElement>('.wk-name')
    const row = title.closest<HTMLElement>('.wk-row')
    if (name === null || row === null) throw new Error('the title is not inside a work row')
    const box = title.getBoundingClientRect()
    const style = getComputedStyle(title)
    return {
      mode: document.documentElement.dataset.mode ?? '',
      theme: document.documentElement.dataset.theme ?? '',
      language: document.documentElement.lang,
      titleText: (title.textContent ?? '').trim(),
      titleWidth: Math.round(box.width * 10) / 10,
      titleMinWidth: parseFloat(style.minWidth),
      nameWidth: Math.round(name.getBoundingClientRect().width * 10) / 10,
      rowWidth: Math.round(row.getBoundingClientRect().width * 10) / 10,
      gridTemplateColumns: getComputedStyle(row).gridTemplateColumns,
      hours: row.querySelector<HTMLElement>('.wk-hours')?.innerText.trim() ?? null,
      brokenWords: brokenIn(title),
    }
  }, { wanted: TITLE })
}

function expectReadable(row: Row, mode: 'normal' | 'inspect'): void {
  expect(row.mode).toBe(mode)
  expect(row.theme).toBe('light')
  expect(row.language).toBe('en')
  expect(row.titleText).toBe(TITLE)
  expect(row.titleMinWidth, 'the title has no minimum width of its own').toBeGreaterThan(0)
  const shape = `"${row.titleText}" drew ${String(row.titleWidth)}px in a title whose minimum is ${String(row.titleMinWidth)}px, in a name cell ${String(row.nameWidth)}px wide of a row ${String(row.rowWidth)}px`
  expect(row.titleWidth, shape).toBeGreaterThanOrEqual(row.titleMinWidth - 1)
  expect(row.titleWidth, shape).toBeLessThanOrEqual(row.nameWidth + 1)
  expect(row.brokenWords, `these words were drawn in more than one piece: ${row.brokenWords.join(', ')}`).toEqual([])
}

describe('at 1440 a work title keeps the width of the cell that holds it', () => {
  it('draws the title at its own minimum in Developer mode, where the id, kind and made-up mark are beside it', async () => {
    await open('inspect')
    const row = await theRow()
    console.log('WORK_TITLE_LAYOUT ' + JSON.stringify(row))
    expectReadable(row, 'inspect')
  }, 120_000)

  it('keeps the same width when one planned allocation draws the hours column, in both modes', async () => {
    const made = await fetch(`${app.api}/api/planning/allocations`, {
      method: 'POST',
      headers: HUMAN,
      body: JSON.stringify({ horizon: 'day', period: dayKey(new Date()), recordId: work, plannedHours: 1 }),
    })
    expect(made.status, await made.clone().text()).toBe(201)
    for (const mode of ['normal', 'inspect'] as const) {
      await open(mode)
      const row = await theRow()
      console.log(`WORK_TITLE_LAYOUT ${mode} with hours ` + JSON.stringify(row))
      expectReadable(row, mode)
      expect(row.hours, 'the hours column was not drawn, so this case cannot see the fault it guards').not.toBeNull()
    }
  }, 180_000)
})

describe('photographs', () => {
  it.skipIf(!process.env['WORK_TITLE_SHOTS'])('photographs Work to do at four widths in both themes', async () => {
    const folder = process.env['WORK_TITLE_SHOTS'] as string
    mkdirSync(folder, { recursive: true })
    for (const theme of ['light', 'dark'] as const) {
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: 1000 })
        await open('inspect')
        await app.page.screenshot({ path: `${folder}/work-title-${String(width)}-${theme}.png`, fullPage: true })
      }
    }
  }, 600_000)
})
