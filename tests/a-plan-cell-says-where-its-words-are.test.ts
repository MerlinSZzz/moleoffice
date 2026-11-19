// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CELL OF YOUR OWN TABLE, INSIDE A PLAN, SAYS WHERE ITS CHARACTERS SIT IN THE LINE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * A plan table drew no run of stored text anywhere. Measured on 21 August 2026 at 1440, on both
 * `/plans/<id>` and `/plans/<id>/edit`: not one element in any row carried `data-text-offset`. So a
 * right-click on any cell recorded `no place finer than the thing was recorded` and Mole Office drew a
 * dashed frame around the whole row — the same answer for the cell holding `Priya` as for the row
 * it sits in. `plans/PlanTable.tsx` imported `textAttributes` and never called it, which is the
 * gap design/ROUND-NINE-INTERACTION-CONTRACT.md section 2.5.2 names by hand.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH CELLS SAY IT, AND WHY ONLY THOSE
 * ---------------------------------------------------------------------------------------
 *
 * A column of the writer's own pipe table draws exactly the characters the stored line holds, so it
 * can say where they start and the offset is checked against the line before it is written. Every
 * other column draws a FACT ABOUT the line — how big it is, where it stands, what it is tracked as,
 * how deep it sits — and those characters are nowhere in the line. A cell that claimed an offset for
 * them would make Mole Office report untouched words as changed, so those cells go on saying the honest
 * thing: nothing finer than the row was recorded.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE THIS GO RED
 * ---------------------------------------------------------------------------------------
 *
 * Proved by mutation, with a control run first. Four mutations, and what each one took:
 *
 *   `whereItsCharactersAre` answers nothing for every column   -> 2 red: no cell says where its
 *                                                                 characters are, and the press is
 *                                                                 framed like the row again
 *   the writer's own spacing is not stepped over               -> 2 red, the same two: the line
 *                                                                 disagrees, so no offset is drawn
 *   that, and the line is no longer asked to agree             -> 1 red, on the offset itself:
 *                                                                 `Priya` is not at 21, ` Priy` is
 *   every column claims the line starts inside it              -> 3 red, including the last case,
 *                                                                 which is the whole reason it is
 *                                                                 in this file
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page
let site: string
let planId: string

/** Talk to the API the way the browser does, with a human's headers on every write. */
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': 'the plan cell test',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? null : JSON.parse(text)
}

const LINE = '| grinding the seat | Priya |'

beforeAll(async () => {
  app = await liveApp({ name: 'plan-cell-place', viewport: { width: 1440, height: 1000 } })
  page = app.page
  site = app.site
  const plan = await call('POST', '/api/plans', { title: 'A plan with a table of the person\'s own' })
  planId = plan.plan.id
  await call('PUT', `/api/plans/${planId}/body`, {
    body: ['# Rebuild the mount', '', '| stage | who |', '| --- | --- |', LINE].join('\n'),
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ---------------------------------------------------------------------------- reading the screen

/** Open the plan on its table. */
async function openTheTable(): Promise<void> {
  await page.goto(`${site}/#/plans/${planId}/edit`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Table', exact: true }).first().click()
  await page.waitForTimeout(1200)
}

/** A rectangle as this file compares them: where its left edge is and how wide it is. */
interface Box {
  left: number
  width: number
}

interface Drawn {
  /** Which mark the composer drew for where the press landed: a rail, a frame, or nothing. */
  mark: string | null
  /** The rectangle it drew, so a mark on a cell can be told from a mark on the whole row. */
  box: Box | null
  row: Box | null
  cell: Box | null
}

/**
 * Right-click the cell under `heading` on the row whose first cell reads `first`, and answer what
 * the composer's own mark drew, beside the boxes of the row and of the cell it was pressed on.
 *
 * IT PRESSES THE CELL AND NOT THE CHARACTERS. Contract 5.5 leaves a box a person types in to the
 * browser, so the characters themselves raise the browser's own menu and open nothing — measured
 * here on 21 August 2026, composer count 0. The cell around the box is what a person can press.
 */
async function pressTheCell(first: string, heading: string): Promise<Drawn> {
  const at = await page.evaluate(
    ({ first, heading }) => {
      const table = document.querySelector('.pt-table')
      if (table === null) throw new Error('the plan drew no table')
      const headings = [...table.querySelectorAll('thead th')].map((th) => (th.textContent ?? '').trim())
      const column = headings.findIndex((one) => one.startsWith(heading))
      if (column < 0) throw new Error(`the table has no ${heading} column: ${headings.join(' / ')}`)
      const row = [...table.querySelectorAll<HTMLElement>('tbody tr')].find((tr) =>
        (tr.getAttribute('data-name') ?? '').startsWith(first),
      )
      if (row === undefined) throw new Error(`no row is called ${first}`)
      const cell = [...row.querySelectorAll<HTMLElement>('td')][column]
      if (cell === undefined) throw new Error(`the ${first} row has no cell ${String(column)}`)
      const box = cell.getBoundingClientRect()
      const whole = row.getBoundingClientRect()
      return {
        x: box.x + box.width - 3,
        y: box.y + box.height / 2,
        cell: { left: Math.round(box.left), width: Math.round(box.width) },
        row: { left: Math.round(whole.left), width: Math.round(whole.width) },
      }
    },
    { first, heading },
  )
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.waitForTimeout(700)
  const drawn = await page.evaluate(() => {
    const one = document.querySelector<HTMLElement>('.px-subject > i[data-why="subject"]')
    if (one === null) return { mark: null, box: null }
    const box = one.getBoundingClientRect()
    return {
      mark: one.className.replace('px-subject-', ''),
      box: { left: Math.round(box.left), width: Math.round(box.width) },
    }
  })
  return { ...drawn, row: at.row, cell: at.cell }
}

async function closeIt(): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

// ---------------------------------------------------------------------------- the cases

describe('a cell of the writer’s own table, inside a plan', () => {
  it('says where its characters sit in the stored line, so the offset can be checked', async () => {
    await openTheTable()
    const said = await page.evaluate(() => {
      const cells = [...document.querySelectorAll<HTMLElement>('.pt-table tbody td[data-text-offset]')]
      return cells.map((td) => ({
        field: td.getAttribute('data-text-field'),
        at: Number(td.getAttribute('data-text-offset')),
        text: (td.textContent ?? '').trim(),
      }))
    })
    expect(said.length, 'no cell of the plan table says where its characters are').toBeGreaterThan(0)
    for (const one of said) {
      expect(one.field, 'a cell named a stored string that is not the line').toBe('text')
      expect(
        LINE.slice(one.at, one.at + one.text.length),
        `the line does not hold "${one.text}" at ${String(one.at)}`,
      ).toBe(one.text)
    }
  }, 120_000)

  it('is marked on its own, and not as the whole row it sits in', async () => {
    await openTheTable()
    const drawn = await pressTheCell('grinding the seat', 'who')
    expect(drawn.mark, 'the press on a cell of the person\'s own table drew no mark at all').toBe('rail')
    // THE MARK IS BESIDE THE CELL AND NOT AROUND THE ROW. A rail is drawn 8px to the left of the
    // thing it is about, so the cell's own left edge is where it lands and the row's is not.
    expect(
      Math.abs(drawn.box!.left - (drawn.cell!.left - 8)),
      'the mark is not beside the cell that was pressed',
    ).toBeLessThan(3)
    expect(
      drawn.box!.left - drawn.row!.left,
      'the mark sits at the left edge of the row, so it is about the row',
    ).toBeGreaterThan(100)
    await closeIt()
  }, 120_000)

  it('leaves a cell that draws a fact about the line saying nothing finer than the row', async () => {
    // The heading row is in no table of the writer's, so its `who` cell draws the one sentence Mole Office has
    // for an absence — and that sentence is in no stored string at all.
    await openTheTable()
    const said = await page.evaluate(() => {
      const row = [...document.querySelectorAll<HTMLElement>('.pt-table tbody tr')].find((tr) =>
        (tr.getAttribute('data-name') ?? '').startsWith('Rebuild the mount'),
      )
      return [...(row?.querySelectorAll('td[data-text-offset]') ?? [])].length
    })
    expect(said, 'a row with no table of the person\'s own claimed to draw characters of its line').toBe(0)
    const drawn = await pressTheCell('Rebuild the mount', 'who')
    expect(drawn.mark, 'a cell drawing a fact about the line claimed to hold characters of it').toBe('frame')
    await closeIt()
  }, 120_000)
})
