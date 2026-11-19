// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LIST OF A PLAN'S LINES DRAWS EVERY FORMULA INSIDE ITS LINE, SO EACH LINE STAYS ONE ROW.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Under a plan's table, "Planned against done" lists the plan's lines. A line holding `$$…$$`
 * drew that formula on a line of its own, as a paragraph does. So the row
 * `| heat the water | $$Q = m c \Delta T$$ | 4 Dec |` took three rows: the words before the formula,
 * the formula at a larger size, and the words after it.
 *
 * Seven other places draw a plan's lines in a list, and none of them was in a picture or a test:
 * the project graph's plan lines, the column that says where a row sits once the table is flat, the
 * band of lines written since the person last read the plan, the list of lines filed as work and
 * then deleted from the writing, and the report after a press on several rows at once.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS ASSERTS
 * ---------------------------------------------------------------------------------------
 *
 * On each of those lists, and on a plan's first lines on the plans list, a line holding one formula
 * inside the line and one on a line of its own:
 *
 * - draws both formulas, and no dollar sign is left in its words;
 * - draws neither on a line of its own;
 * - draws them at one size, so the second is the size of the first;
 * - takes one row on the screen.
 *
 * The table's cells and a report's paragraphs keep their displays. tests/a-plans-words-draw-their-maths.test.ts
 * measures that, and is run beside this file.
 *
 * It opens the page that liveApp in tests/helpers.ts builds into dist/web-for-tests, so nothing
 * needs building first.
 *
 * Set PLAN_LINES_SHOTS to a folder to photograph each list as the test reaches it, before anything
 * is asserted, so a failing run photographs what failed. The pictures are at 1440, light. Set
 * PLAN_LINES_LOOKS to other looks, as width-theme pairs separated by spaces, for example
 * `1440-light 990-dark 390-light`. The ordinary run and the mutation runs take no picture.
 *
 * The plans are made up for this file. The formulas are textbook ones: mass from density and
 * volume, and the heat a body takes in.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { deleteTheCopiedDefaultChapters, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

// ============================================================ the made-up plans

const MASS = 'm = \\rho V'
const HEAT = 'Q = m c \\Delta T'
const SALT = 'm_s = c V'

/** One formula inside the line and one on a line of its own, after a few words. */
function aLine(words: string, inline = MASS, display = HEAT): string {
  return `${words}: $${inline}$ and $$${display}$$`
}

/** The lines still only writing, a line filed as work, and the writer's own table. */
const PROGRESS = 'A made-up plan for warming water'
const PROGRESS_BODY = [
  `- ${aLine('heat it')}`,
  `- ${aLine('weigh it', MASS, SALT)}`,
  '',
  '| step | formula | when |',
  '| --- | --- | --- |',
  `| heat the water | $$${HEAT}$$ | 4 Dec |`,
].join('\n')

/**
 * A line with two rows written under it, so the flat table says where each row sits. Not a heading:
 * a heading is a label of at most five words, and two formulas are more words than that.
 */
const FLAT_BODY = [`- ${aLine('cool it')}`, '  - read the thermometer', '  - write the reading down'].join('\n')

/** Two rows to pick and track with one press. */
const PRESSED_BODY = [`- ${aLine('fill it')}`, `- ${aLine('drain it', SALT, MASS)}`].join('\n')

/** A line to file as work and then delete from the writing. */
const LOST_BODY = [`- ${aLine('mix it')}`, '- rinse the jug'].join('\n')

/** What the plan held when the person read it, and what an agent wrote after. */
const READ_BODY = '- boil the water'
const SINCE_BODY = [READ_BODY, `- ${aLine('pour it')}`].join('\n')

/** The line the project graph draws, about a direction on a module of their own. */
const GRAPH_MODULE = 'A made-up kettle'
const GRAPH_DIRECTION = 'A made-up wider spout'
const GRAPH_LINE = aLine('stir it')

// ============================================================ the browser

let app: LiveApp
let page: Page
let site: string
const plans: Record<'progress' | 'flat' | 'pressed' | 'lost' | 'since' | 'graph', string> = {
  progress: '',
  flat: '',
  pressed: '',
  lost: '',
  since: '',
  graph: '',
}

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * An agent, for the band of lines written since the person read the plan. That band leaves out what
 * the reader wrote, so its line has to be written by somebody else.
 */
const AS_AN_AGENT: Record<string, string> = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'orbit' }

async function call(method: string, path: string, body?: unknown, headers = AS_THE_PERSON): Promise<any> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers,
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

/** The id of the stored line that begins with these words. */
async function lineId(plan: string, begins: string): Promise<string> {
  const read = await call('GET', `/api/plans/${plan}`)
  const found = (read.lines as Array<{ line: { id: string; text: string } }>).find((one) => one.line.text.startsWith(begins))
  if (found === undefined) throw new Error(`the plan holds no line beginning ${begins}`)
  return found.line.id
}

async function fileAsWork(plan: string, begins: string): Promise<void> {
  await call('POST', `/api/plans/${plan}/lines/${await lineId(plan, begins)}/file-as-work`, { kind: 'task', workspaceId: 'default' })
}

/** The press that shows each layout of a plan, and the layout the page then says it shows. */
const LAYOUTS = {
  writing: { press: () => sayInEnglish('g8.onePlan.writing'), shown: 'writing' },
  both: { press: () => sayInEnglish('g8.onePlan.writingAndTable'), shown: 'both' },
  table: { press: () => sayInEnglish('g8.onePlan.table'), shown: 'table' },
} as const

async function openPlan(id: string, layout: keyof typeof LAYOUTS): Promise<void> {
  await page.goto(`${site}/#/plans/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByRole('button', { name: LAYOUTS[layout].press(), exact: true }).first().click()
  await page.locator(`.op-plan[data-shown="${LAYOUTS[layout].shown}"]`).waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'plan-lines-draw-maths-inside-the-line', viewport: { width: 1440, height: 1000 } })
  page = app.page
  site = app.site
  // A FRESH OFFICE COPIES THE DEFAULT REGULATIONS AS MODULES. They are taken out, as the person may,
  // so the project graph holds the one module this file makes and its picture shows that module.
  await deleteTheCopiedDefaultChapters(app.api)

  plans.progress = await writePlan(PROGRESS, PROGRESS_BODY)
  await fileAsWork(plans.progress, '- weigh it')
  plans.flat = await writePlan('A made-up plan with two rows under one line', FLAT_BODY)
  plans.pressed = await writePlan('A made-up plan with two rows tracked at once', PRESSED_BODY)
  plans.lost = await writePlan('A made-up plan that loses a filed line', LOST_BODY)
  await fileAsWork(plans.lost, '- mix it')
  // THE SERVER REFUSES A WRITE UNDER AN AGENT ID NO REGISTRY ROW ANSWERS, so the agent is registered
  // first. It holds the supervisor card, because writing a plan is `plan.write` and the worker card
  // does not hold it.
  await call('POST', '/api/records', { kind: 'agent', title: 'Orbit', data: { handle: 'orbit', role: 'supervisor', runtime: 'claude-code', state: 'active' } })
  plans.since = await writePlan('A made-up plan an agent wrote in after it was read', READ_BODY)
  await call('POST', `/api/plans/${plans.since}/read`)
  await call('PUT', `/api/plans/${plans.since}/body`, { body: SINCE_BODY }, AS_AN_AGENT)

  // THE GRAPH CARRIES A PLAN ONLY THROUGH A LINE THAT NAMES ONE OF ITS RECORDS, and only that line. A
  // plan line names work a plan can give time to, so it names a direction, and not the module.
  const kettle = (await call('POST', '/api/records', { kind: 'module', title: GRAPH_MODULE, data: {} })).record.id as string
  const spout = (await call('POST', '/api/records', { kind: 'direction', title: GRAPH_DIRECTION, data: { depth: 'noticed', question: 'Would a wider spout pour faster?' } })).record.id as string
  await call('POST', '/api/links', { fromId: spout, toId: kettle, type: 'relates_to' })
  plans.graph = (await call('POST', '/api/plans', { title: 'A made-up plan for the kettle', body: '' })).plan.id as string
  const line = (await call('POST', `/api/plans/${plans.graph}/lines`, { text: GRAPH_LINE, reason: 'A made-up line for the graph.' })).line.id as string
  await call('PATCH', `/api/plans/${plans.graph}/lines/${line}`, { recordId: spout })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

// ============================================================ pictures

interface Look {
  width: number
  theme: 'light' | 'dark'
}

/** The looks asked for. A word that is not a width and a theme stops the run, rather than being skipped. */
function looksAsked(): Look[] {
  const asked = (process.env['PLAN_LINES_LOOKS'] ?? '1440-light').trim().split(/\s+/)
  return asked.map((word) => {
    const read = /^(\d+)-(light|dark)$/.exec(word)
    if (read === null) throw new Error(`PLAN_LINES_LOOKS holds "${word}", which is not a width and a theme such as 1440-light`)
    return { width: Number(read[1]), theme: read[2] as Look['theme'] }
  })
}

/** Photograph the page with this list in the middle of it, when a folder for the pictures is given. */
async function photograph(name: string, list: Locator): Promise<void> {
  const shots = process.env['PLAN_LINES_SHOTS']
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const look of looksAsked()) {
    await page.setViewportSize({ width: look.width, height: 1000 })
    await page.emulateMedia({ colorScheme: look.theme })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.waitForTimeout(400)
    await list.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(shots, `${name}-${String(look.width)}-${look.theme}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForTimeout(400)
}

// ============================================================ one line, as drawn

interface DrawnLine {
  /** The formulas drawn in the line. */
  formulas: number
  /** How many of them were drawn on a line of their own. */
  displays: number
  /** The words a reader sees, with each drawn formula left out. */
  words: string
  /** The size each formula is drawn at, in pixels. */
  sizes: number[]
  /** How many rows the line's words and formulas take on the screen. */
  rows: number
}

/**
 * How one line is drawn. `leaveOut` names what the list draws beside the line, such as the note that
 * a line was written after the plan was made, which is not the line and may wrap on its own.
 */
async function drawnLine(line: Locator, leaveOut: string | null = null): Promise<DrawnLine> {
  return await line.evaluate((el, leaveOut) => {
    const isTheLine = (node: Node) => {
      const holder = node.parentElement
      return holder !== null && holder.closest('.katex') === null && (leaveOut === null || holder.closest(leaveOut) === null)
    }
    // EVERY BOX THE LINE DRAWS: each run of its words, as the browser lays it out, and each formula.
    const boxes: DOMRect[] = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
      if (!isTheLine(node) || (node.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(node)
      boxes.push(...range.getClientRects())
    }
    const formulas = [...el.querySelectorAll('.katex')]
    for (const one of formulas) boxes.push(one.getBoundingClientRect())
    // A ROW IS EVERY BOX THAT OVERLAPS THE ONES ABOVE IT. A box that starts below the bottom of the
    // row so far starts the next row.
    let rows = 0
    let bottom = Number.NEGATIVE_INFINITY
    for (const box of boxes.filter((one) => one.height > 0).sort((a, b) => a.top - b.top)) {
      if (box.top >= bottom - 1) {
        rows += 1
        bottom = box.bottom
      } else bottom = Math.max(bottom, box.bottom)
    }
    const copy = el.cloneNode(true) as HTMLElement
    for (const one of copy.querySelectorAll('.katex')) one.remove()
    if (leaveOut !== null) for (const one of copy.querySelectorAll(leaveOut)) one.remove()
    return {
      formulas: formulas.length,
      displays: el.querySelectorAll('.katex-display, .mt-display').length,
      words: (copy.textContent ?? '').replace(/\s+/g, ' ').trim(),
      sizes: formulas.map((one) => parseFloat(getComputedStyle(one).fontSize)),
      rows,
    }
  }, leaveOut)
}

/**
 * Wait for a line, and then for KaTeX to draw its formulas. A list that draws the line as typed
 * fails here, on the count, and says the words it drew.
 */
async function waitForTheFormulas(line: Locator, formulas: number): Promise<void> {
  await line.waitFor({ timeout: 60_000 })
  const typed = await line.innerText()
  await expect.poll(async () => await line.locator('.katex').count(), { timeout: 20_000, message: `the line did not draw its ${String(formulas)} formulas. It reads: ${typed}` }).toBe(formulas)
}

/** A line that holds its formulas inside it: all drawn, none on a line of its own, one size, one row. */
function expectInsideTheLine(line: DrawnLine, formulas: number): void {
  const said = JSON.stringify(line)
  expect(line.formulas, `the line drew the wrong number of formulas: ${said}`).toBe(formulas)
  expect(line.words, `a dollar sign was left in the line: ${said}`).not.toContain('$')
  expect(line.displays, `a formula was drawn on a line of its own: ${said}`).toBe(0)
  expect(Math.max(...line.sizes) - Math.min(...line.sizes), `the formulas were drawn at two sizes: ${said}`).toBeLessThan(0.05)
  expect(line.rows, `the line took more than one row: ${said}`).toBe(1)
}

// ============================================================ the lists

describe('a list of a plan’s lines draws each formula inside its line', () => {
  it('in the progress list under the table: a line still only writing, and a row of the writer’s own table', async () => {
    await openPlan(plans.progress, 'table')
    const list = page.locator('.pp-writing')
    await waitForTheFormulas(list.locator('li', { hasText: 'heat it:' }), 2)
    await waitForTheFormulas(list.locator('li', { hasText: 'heat the water' }), 1)
    await photograph('progress-list', page.locator('.pp'))

    const bullet = await drawnLine(list.locator('li', { hasText: 'heat it:' }), '.pp-since')
    expectInsideTheLine(bullet, 2)
    expect(bullet.words).toContain('heat it:')

    // THE ROW THAT TOOK THREE ROWS. Its one formula is a display, and it is drawn at the size the
    // line above draws its formula inside the line.
    const row = await drawnLine(list.locator('li', { hasText: 'heat the water' }), '.pp-since')
    expectInsideTheLine(row, 1)
    expect(row.words).toContain('| heat the water |')
    expect(row.words).toContain('| 4 Dec |')
    expect(Math.abs(row.sizes[0]! - bullet.sizes[0]!), `${JSON.stringify(row)} beside ${JSON.stringify(bullet)}`).toBeLessThan(0.05)
  }, 180_000)

  it('in the progress table, where a line filed as work is listed', async () => {
    const filed = page.locator('.pp-table td.pp-words', { hasText: 'weigh it:' })
    await waitForTheFormulas(filed, 2)
    expectInsideTheLine(await drawnLine(filed), 2)
  }, 60_000)

  it('in a plan’s first lines on the plans list', async () => {
    await page.goto(`${site}/#/plans`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const card = page.locator('.pl-card', { hasText: PROGRESS })
    const line = card.locator('.pl-card-line', { hasText: 'heat it:' })
    await waitForTheFormulas(line, 2)
    await photograph('plans-list-card', card)
    expectInsideTheLine(await drawnLine(line), 2)
  }, 120_000)

  it('in the project graph’s plan lines, at the level that shows their words', async () => {
    await page.goto(`${site}/#/project-graph`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('[data-graph-level] [data-mark="module"]').first().waitFor({ timeout: 60_000 })
    await page.locator('button[data-level="summaries"]').click()
    await page.waitForFunction(() => document.querySelector('[data-graph-level]')?.getAttribute('data-graph-level') === 'summaries')
    const line = page.locator('.gph-plan-lines li.gph-line', { hasText: 'stir it:' })
    await waitForTheFormulas(line, 2)
    await photograph('project-graph', page.locator('.gph-plan', { hasText: 'stir it:' }))
    expectInsideTheLine(await drawnLine(line), 2)
  }, 120_000)

  it('in the column that says where a row sits, once the table is flat', async () => {
    await openPlan(plans.flat, 'table')
    await page.getByRole('button', { name: sayInEnglish('g8.table.showEveryLevelFlat'), exact: true }).click()
    await page.locator('.pt-table thead th[data-col="sits"]').waitFor({ timeout: 30_000 })
    const column = await page.evaluate(() => [...document.querySelectorAll('.pt-table thead th')].findIndex((th) => th.getAttribute('data-col') === 'sits') + 1)
    const cell = page.locator('.pt-table tbody tr[data-name^="read the thermometer"]').locator(`:scope > td:nth-child(${String(column)}) .pt-path`)
    await waitForTheFormulas(cell, 2)
    await photograph('flat-table-sits', page.locator('.pt-table'))
    const path = await drawnLine(cell)
    expectInsideTheLine(path, 2)
    expect(path.words).toContain('cool it:')
  }, 120_000)

  it('in the band of lines written since the person last read the plan', async () => {
    await openPlan(plans.since, 'both')
    await page.locator('.op-since .op-fold').click()
    const line = page.locator('.op-since-list .op-since-text', { hasText: 'pour it:' })
    await waitForTheFormulas(line, 2)
    await photograph('written-since', page.locator('.op-since'))
    expectInsideTheLine(await drawnLine(line), 2)
  }, 120_000)

  it('in the list of lines that were filed as work and then deleted from the writing', async () => {
    await openPlan(plans.lost, 'both')
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Delete')
    await page.waitForFunction(
      (stored) => document.querySelector('.pw-say')?.textContent?.trim() === stored,
      sayInEnglish('g8.writing.stored'),
      { timeout: 20_000 },
    )
    const line = page.locator('.pw-lost .pw-lost-text', { hasText: 'mix it:' })
    await waitForTheFormulas(line, 2)
    await photograph('lost-lines', page.locator('.pw-lost'))
    expectInsideTheLine(await drawnLine(line), 2)
  }, 120_000)

  it('in the report a press on several rows gives, one line for each row', async () => {
    await openPlan(plans.pressed, 'table')
    for (const row of ['fill it', 'drain it']) await page.locator(`.pt-table tbody tr[data-name^="${row}"] .pt-pick`).click()
    await page.locator('.pt-picked').getByRole('button', { name: sayInEnglish('g8.table.trackThem'), exact: true }).click()
    await page.getByRole('button', { name: sayInEnglish('g8.planitems.trackAll', { value1: 2 }), exact: true }).click()
    const report = page.locator('.pi-report')
    const rows = ['fill it:', 'drain it:'].map((row) => report.locator('.pi-report-what', { hasText: row }))
    for (const row of rows) await waitForTheFormulas(row, 2)
    await photograph('press-report', report)
    for (const row of rows) expectInsideTheLine(await drawnLine(row), 2)
  }, 120_000)
})
