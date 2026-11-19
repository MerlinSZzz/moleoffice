// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN'S OWN WORDS DRAW THEIR MATHS, AND A REPORT'S MATHS BLOCK SITS CENTRED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A report drew `$…$` as a formula inside the line and `$$…$$` as a formula on a line of its own.
 * A plan drew neither. The table, the progress list under it and the plans list printed the
 * dollar signs and the LaTeX between them, so a plan holding `$H_2 O$` showed `$H_2 O$`.
 *
 * A report's maths block was as wide as its formula and started at the left of the column. A
 * display inside a paragraph is as wide as the paragraph, with the formula centred in it. So the
 * same formula sat in two places on one page, depending on how it was written.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * - A plan with no maths fetches no KaTeX. A plan with maths fetches it.
 * - In the table, the words of an item, a cell of the writer's own table and the note draw their
 *   maths: one dollar sign either side inside the line, two on a line of its own.
 * - The Schedule column holds time words and is not prose. Its dollar signs stay as typed.
 * - A press in a drawn cell shows the characters typed. What is typed there is stored as typed,
 *   and the cell draws the new formula once it is stored. A right press leaves the cell drawn.
 * - The progress list under the table, and a plan's first lines on the plans list, draw their maths.
 * - On a report, the maths block's formula and a paragraph display's formula share one centre, at
 *   1440 and at 390. The block keeps the width of its formula.
 *
 * It opens the page that liveApp in tests/helpers.ts builds into dist/web-for-tests. liveApp
 * builds it again when the newest of the files the page is built from has moved, so nothing needs
 * building first.
 *
 * Set PLAN_MATHS_SHOTS to a folder to photograph the plan and the report at 1440 and 390, light and
 * dark. The ordinary run and the mutation runs take no picture.
 *
 * The plan and the report are made up for this file. The formulas are textbook ones: mass from
 * density and volume, the heat a body takes in, and the mean of a sample.
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import type { Page, Request } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, THE_PAGE_BROWSER_TESTS_ARE_SERVED, waitForThePage, type LiveApp } from './helpers.ts'

// ============================================================ the made-up plan and report

const MASS = 'm = \\rho V'
const HEAT = 'Q = m c \\Delta T'
const SALT = 'm_s = c V'
const MEAN = '\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i'

/** A pipe table with one formula inside a line and one on a line of its own, and a bullet. */
const BODY = [
  '# Water, $H_2 O$, by weight',
  '',
  '| step | formula | when |',
  '| --- | --- | --- |',
  `| weigh the water | $${MASS}$ | 3 Dec |`,
  `| heat the water | $$${HEAT}$$ | 4 Dec |`,
  '',
  `- mix in the salt, $NaCl$ {time: $2 $3 on 5 Dec} {note: the mass is $$${SALT}$$}`,
].join('\n')

/** The same shape with no dollar sign anywhere, for the plan that must fetch no KaTeX. */
const NO_MATHS_BODY = ['# Water by weight', '', '- weigh the water {note: on the kitchen scale}'].join('\n')

/** A paragraph holding a display, and a maths block holding the same formula. */
const REPORT = [
  { id: 'b-1', type: 'text', heading: 'The mean of a sample', text: `The mean is $$${MEAN}$$ where each $x_i$ is one reading.` },
  { id: 'b-2', type: 'math', tex: MEAN },
]

// ============================================================ which files are KaTeX's

const A_MARK_OF_KATEX_CODE = 'KaTeX parse error'

/** True when an address on the test page server is the built KaTeX code. */
function isKatexCode(site: string, url: string): boolean {
  if (!url.startsWith(`${site}/`)) return false
  const file = normalize(join(THE_PAGE_BROWSER_TESTS_ARE_SERVED, decodeURIComponent(new URL(url).pathname)))
  if (!file.startsWith(`${THE_PAGE_BROWSER_TESTS_ARE_SERVED}${sep}`) || !existsSync(file) || !statSync(file).isFile()) return false
  return file.endsWith('.js') && readFileSync(file, 'utf8').includes(A_MARK_OF_KATEX_CODE)
}

// ============================================================ the browser

let app: LiveApp
let page: Page
let site: string
let planId: string
let plainId: string
let reportId: string
const asked: string[] = []

/** Talk to the API the way the browser does, with a person's headers on every write. */
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': 'the plan maths test',
    },
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

/** The lines the plan holds now, as stored. */
async function storedLines(id: string): Promise<string[]> {
  const read = await call('GET', `/api/plans/${id}`)
  return (read.lines as Array<{ line: { text: string } }>).map((one) => one.line.text)
}

/** Open a plan on its table, alone, with nothing beside it. */
async function openTheTable(id: string): Promise<void> {
  await page.goto(`${site}/#/plans/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByRole('button', { name: 'Table', exact: true }).first().click()
  await page.locator('.pt-table tbody tr').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(800)
}

/** What one cell of the table holds, found by its row's words and its column's key. */
interface Cell {
  formulas: number
  displays: number
  /** The text a reader sees in the cell, with each drawn formula left out. */
  words: string
  /** The characters in each box a person can type in, in the cell. */
  boxes: string[]
}

async function cellOf(row: string, column: string): Promise<Cell> {
  return await page.evaluate(
    ({ row, column }) => {
      const table = document.querySelector('.pt-table')
      if (table === null) throw new Error('the plan drew no table')
      const keys = [...table.querySelectorAll('thead th')].map((th) => th.getAttribute('data-col'))
      const at = keys.indexOf(column)
      if (at < 0) throw new Error(`the table has no ${column} column: ${keys.join(' / ')}`)
      const tr = [...table.querySelectorAll<HTMLElement>('tbody tr')].find((one) => (one.getAttribute('data-name') ?? '').startsWith(row))
      if (tr === undefined) throw new Error(`no row is called ${row}`)
      const td = [...tr.querySelectorAll<HTMLElement>(':scope > td')][at]
      if (td === undefined) throw new Error(`the ${row} row has no cell ${String(at)}`)
      const copy = td.cloneNode(true) as HTMLElement
      for (const one of copy.querySelectorAll('.katex')) one.remove()
      return {
        formulas: td.querySelectorAll('.katex').length,
        displays: td.querySelectorAll('.katex-display').length,
        words: (copy.textContent ?? '').replace(/\s+/g, ' ').trim(),
        boxes: [...td.querySelectorAll('textarea')].map((box) => box.value),
      }
    },
    { row, column },
  )
}

/** The key of the table column that draws an item's words. */
const WORDS = 'what'

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'plan-words-draw-maths', viewport: { width: 1440, height: 1000 } })
  page = app.page
  site = app.site
  page.on('request', (req: Request) => void asked.push(req.url()))
  plainId = await writePlan('A made-up plan with words only', NO_MATHS_BODY)
  planId = await writePlan('A made-up plan with maths in its table', BODY)
  const res = await call('POST', '/api/records', {
    kind: 'report',
    title: 'A made-up report: the mean of a sample, written twice',
    summary: 'A made-up report, so where a maths block sits beside a paragraph display can be measured.',
    data: { blocks: REPORT },
  })
  reportId = res.record.id
}, 300_000)

afterAll(async () => {
  try {
    await photograph()
  } finally {
    await app?.stop()
  }
}, 240_000)

/** The pictures, taken only when a folder for them is given. */
async function photograph(): Promise<void> {
  const shots = process.env['PLAN_MATHS_SHOTS']
  if (!shots || page === undefined) return
  mkdirSync(shots, { recursive: true })
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ colorScheme: theme })
      await openTheTable(planId)
      await page.locator('.katex').nth(4).waitFor({ timeout: 60_000 })
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await page.locator('.pt-table').scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      // THE WHOLE PAGE, because at 390 the table moves the formula column off its edge and the
      // progress list under it is where those lines are read.
      await page.screenshot({ path: `${shots}/plan-table-${String(width)}-${theme}.png`, fullPage: true })
      await page.goto(`${site}/#/r/${reportId}`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      await page.locator('.sb-math .katex').waitFor({ timeout: 60_000 })
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await page.locator('.sb-text .sb-p:has(.mt-display)').scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${shots}/report-${String(width)}-${theme}.png`, fullPage: true })
    }
  }
}

describe('a plan with no maths', () => {
  it('fetches no KaTeX', async () => {
    await openTheTable(plainId)
    // THE IMPORT WOULD START IN THE RENDER THAT DREW THE WORDS. One second past the table covers it.
    await page.waitForTimeout(1000)
    expect(await page.locator('.pt-table .katex').count()).toBe(0)
    expect(asked.filter((url) => isKatexCode(site, url)), 'a plan with no maths fetched KaTeX').toEqual([])
  }, 120_000)
})

describe('a plan’s own words draw their maths', () => {
  it('in the table: the words, a cell of the writer’s own table and the note', async () => {
    await openTheTable(planId)
    await page.locator('.pt-table .katex').nth(4).waitFor({ timeout: 30_000 })
    expect(asked.some((url) => isKatexCode(site, url)), 'the plan with maths fetched no KaTeX').toBe(true)

    const heading = await cellOf('Water,', WORDS)
    expect(heading.formulas, JSON.stringify(heading)).toBe(1)
    expect(heading.displays).toBe(0)
    expect(heading.words).not.toContain('$')

    const inline = await cellOf('weigh the water', 'yours:formula')
    expect(inline.formulas, JSON.stringify(inline)).toBe(1)
    expect(inline.displays, 'one dollar sign either side drew a display').toBe(0)
    expect(inline.words).not.toContain('$')

    const display = await cellOf('heat the water', 'yours:formula')
    expect(display.formulas, JSON.stringify(display)).toBe(1)
    expect(display.displays, 'two dollar signs either side drew no display').toBe(1)

    const words = await cellOf('mix in the salt', WORDS)
    expect(words.formulas, JSON.stringify(words)).toBe(1)
    expect(words.words).toContain('mix in the salt,')
    expect(words.words).not.toContain('$')

    const note = await cellOf('mix in the salt', 'note')
    expect(note.displays, JSON.stringify(note)).toBe(1)
    expect(note.words).toContain('the mass is')
    expect(note.words).not.toContain('$')
  }, 180_000)

  it('puts a text offset only on characters the line holds there, and never round a formula', async () => {
    // AN ELEMENT CARRYING AN OFFSET PROMISES THAT ITS TEXT IS THE STORED LINE FROM THAT OFFSET. A drawn
    // formula is not its characters, so the words either side of one carry their own offsets.
    const lines = await storedLines(planId)
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.pt-table tbody [data-text-offset]')].map((el) => ({
        row: el.closest('tr')?.getAttribute('data-name') ?? '',
        at: Number(el.getAttribute('data-text-offset')),
        text: el.textContent ?? '',
        formulas: el.querySelectorAll('.katex').length,
      })),
    )
    for (const one of marked) {
      const line = lines.find((each) => each.includes(one.row))
      expect(one.formulas, JSON.stringify(one)).toBe(0)
      expect(line?.slice(one.at, one.at + one.text.length), JSON.stringify(one)).toBe(one.text)
    }
    const runs = marked.map((one) => one.text)
    expect(runs, 'the words round a formula carry no offset of their own').toEqual(
      expect.arrayContaining(['Water, ', ', by weight', 'mix in the salt, ']),
    )
  }, 60_000)

  it('leaves a cell with no maths a box to type in, as it was', async () => {
    const when = await cellOf('weigh the water', 'yours:when')
    expect(when.formulas).toBe(0)
    expect(when.boxes).toEqual(['3 Dec'])
  }, 60_000)

  it('does not read the dollar signs in the Schedule column, which holds time words', async () => {
    const time = await cellOf('mix in the salt', 'time')
    expect(time.formulas, JSON.stringify(time)).toBe(0)
    expect(time.boxes).toEqual(['$2 $3 on 5 Dec'])
  }, 60_000)

  it('shows the characters typed when a drawn cell is pressed, and stores what is typed there', async () => {
    const box = page.locator('.pt-table tbody tr[data-name^="weigh the water"] td').nth(
      await page.evaluate(() => [...document.querySelectorAll('.pt-table thead th')].findIndex((th) => th.getAttribute('data-col') === 'yours:formula')),
    )
    await box.locator('.katex').first().click()
    await page.waitForTimeout(300)
    const arrived = await page.evaluate(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLTextAreaElement)) return { tag: el?.tagName ?? null, value: null, selected: null }
      return { tag: el.tagName, value: el.value, selected: el.value.slice(el.selectionStart, el.selectionEnd) }
    })
    expect(arrived, 'the press did not put the cursor in a box holding the characters typed').toEqual({
      tag: 'TEXTAREA',
      value: `$${MASS}$`,
      selected: `$${MASS}$`,
    })

    const typed = '$m = 2 \\rho V$'
    await page.keyboard.type(typed)
    expect(await page.evaluate(() => (document.activeElement as HTMLTextAreaElement).value)).toBe(typed)
    await page.keyboard.press('Tab')
    await expect
      .poll(async () => (await storedLines(planId)).find((line) => line.startsWith('| weigh the water')), { timeout: 20_000 })
      .toBe(`| weigh the water | ${typed} | 3 Dec |`)
    await expect.poll(async () => (await cellOf('weigh the water', 'yours:formula')).formulas, { timeout: 20_000 }).toBe(1)
    const after = await cellOf('weigh the water', 'yours:formula')
    expect(after.boxes, 'the cell went on showing a box once its words were stored').toEqual([])
    expect(after.words).not.toContain('$')
  }, 120_000)

  it('stays drawn under a right press, so the composer can be opened on it', async () => {
    const column = await page.evaluate(() =>
      [...document.querySelectorAll('.pt-table thead th')].findIndex((th) => th.getAttribute('data-col') === 'yours:formula'),
    )
    await page.locator('.pt-table tbody tr[data-name^="heat the water"] td').nth(column).locator('.katex').first().click({ button: 'right' })
    await page.waitForTimeout(500)
    const cell = await cellOf('heat the water', 'yours:formula')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    expect(cell.boxes, 'a right press turned the formula back into characters').toEqual([])
    expect(cell.displays).toBe(1)
  }, 60_000)

  it('in the progress list under the table', async () => {
    const drawn = await page.evaluate(() => {
      const list = document.querySelector('.pp-writing')
      if (list === null) return null
      const copy = list.cloneNode(true) as HTMLElement
      for (const one of copy.querySelectorAll('.katex')) one.remove()
      return { formulas: list.querySelectorAll('.katex').length, words: copy.textContent ?? '' }
    })
    expect(drawn, 'the progress list is not on the page').not.toBeNull()
    // The heading's formula, the two in the table, the salt, and the note's. Each is drawn inside its
    // line here: tests/a-list-of-plan-lines-draws-its-maths-inside-the-line.test.ts measures that.
    expect(drawn!.formulas, drawn!.words).toBe(5)
    expect(drawn!.words).not.toContain('$H_2 O$')
    expect(drawn!.words).not.toContain(`$${HEAT}$`)
    // A NOTE IS PROSE AND THE TIME WORDS ARE NOT. The note draws its formula and keeps its own
    // brackets; the time words keep their dollar signs.
    expect(drawn!.words).toContain('{note: the mass is }')
    expect(drawn!.words).toContain('{time: $2 $3 on 5 Dec}')
  }, 60_000)

  it('in a plan’s first lines on the plans list', async () => {
    await page.goto(`${site}/#/plans`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const card = page.locator('.pl-card', { hasText: 'A made-up plan with maths in its table' })
    await card.locator('.pl-card-line').first().waitFor({ timeout: 30_000 })
    await page.waitForTimeout(800)
    expect(await card.locator('.pl-card-line .katex').count(), 'the plan’s first line drew no formula').toBeGreaterThan(0)
    const words = await card.locator('.pl-card-line').first().evaluate((p) => {
      const copy = p.cloneNode(true) as HTMLElement
      for (const one of copy.querySelectorAll('.katex')) one.remove()
      return copy.textContent ?? ''
    })
    // THE CARD HOLDS THE HEADING'S WORDS, without its marker: the server picks them.
    expect(words).toContain('Water,')
    expect(words).toContain('by weight')
    expect(words).not.toContain('$')
  }, 60_000)
})

// ============================================================ a report's maths block

/** Where a drawn formula's parts are, put together: KaTeX's own box for a display is the whole line. */
interface Span {
  left: number
  right: number
}

interface Placed {
  column: Span
  block: Span
  blockFormula: Span
  paragraphFormula: Span
  least: number
}

async function placed(): Promise<Placed> {
  return await page.evaluate(() => {
    const across = (r: DOMRect) => ({ left: r.left, right: r.right })
    const drawnIn = (holder: Element) => {
      const parts = [...holder.querySelectorAll('.katex-html > .base')].map((one) => one.getBoundingClientRect())
      if (parts.length === 0) throw new Error('a display holds no drawn formula')
      return { left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)) }
    }
    const block = document.querySelector<HTMLElement>('.sb-reads > .sb-math')
    if (block === null) throw new Error('the maths block is not a child of a reading column')
    const column = block.parentElement!
    const paragraph = [...document.querySelectorAll('.sb-text .sb-p')].find((p) => p.querySelector('.mt-display') !== null)
    if (paragraph === undefined) throw new Error('no paragraph on the page holds a display formula')
    return {
      column: across(column.getBoundingClientRect()),
      block: across(block.getBoundingClientRect()),
      blockFormula: drawnIn(block.querySelector('.mt-display')!),
      paragraphFormula: drawnIn(paragraph.querySelector('.mt-display')!),
      // THE LEAST WIDTH IS A CUSTOM PROPERTY IN REM. min-width is `min(var(--least), 100%)`, which the
      // browser hands back as the expression and not as pixels.
      least: parseFloat(getComputedStyle(block).getPropertyValue('--least')) * parseFloat(getComputedStyle(document.documentElement).fontSize),
    }
  })
}

describe('a report’s maths block sits centred, as a display inside a paragraph does', () => {
  beforeAll(async () => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.sb-math .katex').waitFor({ timeout: 60_000 })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
  }, 120_000)

  for (const width of [1440, 390]) {
    it(`at ${String(width)} pixels wide`, async () => {
      await page.setViewportSize({ width, height: 1000 })
      await page.waitForTimeout(400)
      const at = await placed()
      const said = JSON.stringify(at)
      const middle = (one: Span) => (one.left + one.right) / 2

      // ONE CENTRE: the block's formula and the paragraph's formula sit over each other.
      expect(Math.abs(middle(at.blockFormula) - middle(at.paragraphFormula)), said).toBeLessThanOrEqual(1)
      expect(Math.abs(middle(at.block) - middle(at.column)), said).toBeLessThanOrEqual(1)

      // ITS OWN WIDTH IS KEPT: as wide as its formula, and never under its least width.
      const wide = at.block.right - at.block.left
      expect(wide, said).toBeGreaterThanOrEqual(Math.min(at.least, at.column.right - at.column.left) - 0.5)
      if (width === 1440) expect(wide, `the block took the whole column: ${said}`).toBeLessThan(at.column.right - at.column.left - 50)
    }, 60_000)
  }
})
