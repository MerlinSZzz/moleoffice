// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLAT PLAN TABLE DRAWS EACH LONG LINE IN ITS WHERE IT SITS COLUMN WHOLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * In a plan's table, a press on "Show every level, flat" adds the column Where it sits, which
 * lists the lines a row is written under, joined by a chevron. The column kept every path on one
 * line and every cell hid what overflowed it. A line ending in the formula Q = mcΔT was cut after
 * its first formula at 1440 px, and a long line of plain words was cut the same way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * At 1440 px, for the row under each of two made-up lines, the Where it sits cell draws the whole
 * line inside the cell's box: the last character of the plain line, and the formula that ends the
 * other line, each end to the left of and above the cell's right and bottom edges. Every formula
 * the line holds is drawn, and the cell's words with the formulas left out are the line's words in
 * full, so no word is missing.
 *
 * The column's own width is not asserted here: tests/plan-table-widths.test.ts covers widths.
 *
 * The plans are made up for this file. The formula is the textbook heat a body takes in.
 *
 * Set SITS_SHOTS to a folder to photograph the flat table at 1440, 990, 660 and 390, light and
 * dark, before anything is asserted. A dark picture whose bytes equal the light one stops the run,
 * because then the theme did not change. The ordinary run takes no picture.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

// ============================================================ the made-up plan

/** This line ends with a formula, after more words than the column can hold at 1440 px. */
const FORMULA_WORDS = 'warm the made-up kettle until the water reaches its mark:'
const FORMULA_LINE = `${FORMULA_WORDS} $Q = mc\\Delta T$`

/** A long line of plain words, with no formula in it. Long words keep it wide inside the budget. */
const PLAIN_LINE =
  'extraordinarily wide made-up wording stretches across this narrow column completely'

/** Two top-level lines, each with one row written under it, so each row has a Where it sits path. */
const BODY = [
  `- ${FORMULA_LINE}`,
  '  - stir the made-up water',
  `- ${PLAIN_LINE}`,
  '  - write the made-up reading down',
].join('\n')

const PLAN_TITLE = 'A made-up plan whose long lines sit above a row'
const FORMULA_ROW = 'stir the made-up water'
const PLAIN_ROW = 'write the made-up reading down'

// ============================================================ the browser

let app: LiveApp
let page: Page
let site: string
let plan: string

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: AS_THE_PERSON,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? null : JSON.parse(text)
}

async function writePlan(title: string, body: string): Promise<string> {
  const made = await call('POST', '/api/plans', { title })
  const id = made.plan.id as string
  await call('PUT', `/api/plans/${id}/body`, { body })
  return id
}

/** The plan's table layout, then the press that shows every level flat. */
async function pressTheFlatTable(): Promise<void> {
  await page.getByRole('button', { name: sayInEnglish('g8.onePlan.table'), exact: true }).first().click()
  await page.locator('.op-plan[data-shown="table"]').waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: sayInEnglish('g8.table.showEveryLevelFlat'), exact: true }).click()
  await page.locator('th[data-col="sits"]').waitFor({ timeout: 30_000 })
}

async function openTheFlatTable(): Promise<void> {
  await page.goto(`${site}/#/plans/${plan}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await pressTheFlatTable()
}

/** A fresh document at the current width, so a stored theme is read as the page opens. */
async function reloadTheFlatTable(): Promise<void> {
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await pressTheFlatTable()
}

/** Which cell of a row is the Where it sits column, counting from one. */
async function sitsColumn(): Promise<number> {
  const index = await page.evaluate(
    () => [...document.querySelectorAll('.pt-table thead th')].findIndex((th) => th.getAttribute('data-col') === 'sits') + 1,
  )
  if (index < 1) throw new Error('the flat table has no Where it sits column')
  return index
}

// ============================================================ pictures

/**
 * Photograph the flat table at four widths in both themes, before anything is asserted. Each look
 * stores its theme, then reloads, so the picture is the theme the file asks for rather than the one
 * the page happened to open in.
 */
async function photographEveryLook(): Promise<void> {
  const folder = process.env['SITS_SHOTS']
  if (folder === undefined || folder === '') return
  mkdirSync(folder, { recursive: true })
  const light = new Map<number, Buffer>()
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)
      await reloadTheFlatTable()
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await page.waitForTimeout(300)
      const picture = await page.locator('.pt-table').screenshot({
        path: join(folder, `flat-table-${String(width)}-${theme}.png`),
      })
      if (theme === 'light') light.set(width, picture)
      else if (light.get(width)?.equals(picture) === true) {
        throw new Error(`the dark picture at ${String(width)} is byte-identical to the light one, so the theme did not change`)
      }
    }
  }
}

// ============================================================ one cell, as drawn

interface Box {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface Reading {
  /** The formulas drawn in the cell. */
  formulas: number
  /** The cell's words with each drawn formula left out. */
  words: string
  /** The box of the td that holds the path. */
  cell: Box
  /** The last thing the path draws, in document order: its last character or its last formula. */
  last: { what: 'character' | 'formula'; text: string; box: Box } | null
  /** Everything the cell draws, for a failure message. */
  reads: string
}

async function readTheSitsCell(cell: Locator): Promise<Reading> {
  return await cell.evaluate((el) => {
    const td = el.closest('td')
    if (td === null) throw new Error('the path is not inside a table cell')
    const boxOf = (rect: DOMRect): Box => ({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })
    const formulas = [...el.querySelectorAll('.katex')]
    const things: { what: 'character' | 'formula'; text: string; box: Box }[] = []
    const visit = (node: Node): void => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        if (element.classList.contains('katex')) {
          things.push({
            what: 'formula',
            text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
            box: boxOf(element.getBoundingClientRect()),
          })
          return
        }
        for (const child of [...element.childNodes]) visit(child)
        return
      }
      if (node.nodeType !== Node.TEXT_NODE) return
      const text = node.textContent ?? ''
      let at = text.length - 1
      while (at >= 0 && (text[at] ?? '').trim() === '') at -= 1
      if (at < 0) return
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + 1)
      things.push({ what: 'character', text: text[at] ?? '', box: boxOf(range.getBoundingClientRect()) })
    }
    visit(el)
    const copy = el.cloneNode(true) as HTMLElement
    for (const one of copy.querySelectorAll('.katex')) one.remove()
    return {
      formulas: formulas.length,
      words: (copy.textContent ?? '').replace(/\s+/g, ' ').trim(),
      cell: boxOf(td.getBoundingClientRect()),
      last: things.at(-1) ?? null,
      reads: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    }
  })
}

async function waitForTheFormulas(cell: Locator, formulas: number): Promise<void> {
  const typed = await cell.innerText()
  await expect
    .poll(async () => await cell.locator('.katex').count(), {
      timeout: 20_000,
      message: `the cell did not draw its ${String(formulas)} formulas. It reads: ${typed}`,
    })
    .toBe(formulas)
}

/** What was drawn and where the cell ends, in one sentence for a failure. */
function whereItEnds(reading: Reading): string {
  if (reading.last === null) return 'nothing was drawn in it'
  const last = reading.last
  return (
    `the last ${last.what} ${JSON.stringify(last.text)} ends at right ${last.box.right.toFixed(1)} and ` +
    `bottom ${last.box.bottom.toFixed(1)}; the cell ends at right ${reading.cell.right.toFixed(1)} and ` +
    `bottom ${reading.cell.bottom.toFixed(1)} (${reading.cell.width.toFixed(1)} px wide)`
  )
}

/** Every way one cell fails to draw its whole line, as a sentence each. */
function wrongIn(label: string, reading: Reading, expectedWords: string, expectedFormulas: number): string[] {
  const said = `${label}: drawn ${JSON.stringify(reading.reads)}; words ${JSON.stringify(reading.words)}; ${whereItEnds(reading)}`
  const wrong: string[] = []
  if (reading.formulas !== expectedFormulas) {
    wrong.push(`${said}; it drew ${String(reading.formulas)} formulas rather than ${String(expectedFormulas)}`)
  }
  if (reading.words !== expectedWords) {
    wrong.push(`${said}; its words are not the whole line, which is ${JSON.stringify(expectedWords)}`)
  }
  if (
    reading.last === null ||
    reading.last.box.right > reading.cell.right + 1 ||
    reading.last.box.bottom > reading.cell.bottom + 1
  ) {
    wrong.push(`${said}; the line is not drawn whole inside the cell`)
  }
  return wrong
}

// ============================================================ the test

beforeAll(async () => {
  app = await liveApp({ name: 'the-flat-tables-where-it-sits-column', viewport: { width: 1440, height: 1000 } })
  page = app.page
  site = app.site
  plan = await writePlan(PLAN_TITLE, BODY)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

it('shows a formula-ending line and a long line of plain words whole at 1440 px', async () => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openTheFlatTable()
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  const widthAt1440 = await page.locator('th[data-col="sits"]').evaluate((th) => th.getBoundingClientRect().width)
  process.stdout.write(`the Where it sits column is drawn ${widthAt1440.toFixed(1)} px wide at 1440\n`)

  await photographEveryLook()

  // THE PICTURES MAY LEAVE THE PAGE AT ANOTHER WIDTH AND THEME, so the measurement starts again
  // from a fresh 1440 px document in the light theme.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => localStorage.setItem('mole-office.preset.theme', 'light'))
  await reloadTheFlatTable()
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  const column = await sitsColumn()
  const cellIn = (row: string): Locator =>
    page.locator(`.pt-table tbody tr[data-name^="${row}"] > td:nth-child(${String(column)}) .pt-path`)
  const formulaCell = cellIn(FORMULA_ROW)
  const plainCell = cellIn(PLAIN_ROW)
  await formulaCell.waitFor({ timeout: 30_000 })
  await plainCell.waitFor({ timeout: 30_000 })
  await waitForTheFormulas(formulaCell, 1)
  await waitForTheFormulas(plainCell, 0)

  const formula = await readTheSitsCell(formulaCell)
  const plain = await readTheSitsCell(plainCell)
  const wrong = [
    ...wrongIn('the line ending in the heat formula', formula, FORMULA_WORDS, 1),
    ...wrongIn('the long line of plain words', plain, PLAIN_LINE, 0),
  ]
  expect(
    wrong,
    `the flat table at 1440 px does not draw its long Where it sits lines whole: ${JSON.stringify({ formula, plain })}`,
  ).toEqual([])
}, 300_000)
