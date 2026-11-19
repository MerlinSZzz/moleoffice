// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COLUMN OF THE PLAN TABLE IS NEVER OUT OF SIGHT WITHOUT BEING NAMED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED, 16 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * Every column Mole Office supplies is drawn at every width. That was a correction — three of them used
 * to be dropped in the narrow view the owner uses — and it produced the next fault: the table is
 * then wider than the box it sits in, and the box clips it. Measured in Chromium:
 *
 *   1440, "Writing and table": box 659px, table 977px. Time given 103 of 140 visible pixels,
 *   Project 0 of 140, My note 0 of 140.
 *   390, either view: box 366px, table 989px. How big, Time given, Project and My note all 0 of 140.
 *
 * Those four columns were renamed on 17 August 2026 — Estimate, Schedule, Project, Note — and the
 * measurement is unchanged: they are still the columns that fall off the edge of a narrow box.
 *
 * The scrollbar gutter measured 0px on this platform, so nothing on the screen said the table went
 * on, and the one sentence under the table named three columns Mole Office has never had. The owner's
 * own words about it: a value that works in one view and disappears from the other is not done, and
 * eventually possible is a failure.
 *
 * ---------------------------------------------------------------------------------------
 * SO THIS FILE MEASURES WHAT A PERSON CAN SEE, IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The rule itself — which columns the box is not showing in full — is a plain function and is
 * tested as one at the top. That is not enough on its own and is not what this file is for: which
 * column ends up 0px wide is decided by the browser laying a table out, so the claim "no editable
 * column is unreachable and unmentioned" can only be checked by measuring the pixels in a real one.
 *
 * The check is written against what is on the screen rather than against a count of columns, so it
 * keeps meaning something if the table's widths change: for every heading the box is not showing in
 * full, that heading has to be named above the table, and pressing its name has to bring the whole
 * column into the box.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

/**
 * THE TABLE IS A BROWSER MODULE AND THIS FILE RUNS IN NODE, so the two things it reads off `window`
 * when it is first imported have to be there. It is the same stub `plan-table-editing.test.ts`
 * makes, and it is the reason this import is done by hand rather than written at the top.
 */
const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  sessionStorage: storage,
  location: { hash: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}
// THE RULE MOVED OUT OF `PlanTable` AND INTO THE ONE COMPONENT EVERY SCROLLING BOX USES. It was the
// only answer to "is anything off the edge" in the product and twelve other boxes had none, which is
// what `components/InReach.tsx` now is. The measurements below are unchanged.
const { columnsOutOfReach, sidesWithMore } = await import('../src/web/components/InReach.tsx')

/** A reading of a box that is as tall as its contents, so only the sideways answer is under test. */
const across = (box: { scrollLeft: number; clientWidth: number; scrollWidth: number }) => ({
  ...box,
  scrollTop: 0,
  clientHeight: 400,
  scrollHeight: 400,
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ============================================================================ the rule, no browser

describe('which columns the box is not showing in full', () => {
  const box = { left: 100, right: 500 }

  it('names nothing when every column is inside the box', () => {
    expect(
      columnsOutOfReach(box, [
        { key: 'what', left: 100, right: 300 },
        { key: 'note', left: 300, right: 500 },
      ]),
    ).toEqual([])
  })

  it('names a column that hangs over the right-hand edge, even partly', () => {
    expect(
      columnsOutOfReach(box, [
        { key: 'what', left: 100, right: 300 },
        { key: 'time', left: 300, right: 540 },
        { key: 'note', left: 540, right: 680 },
      ]),
    ).toEqual(['time', 'note'])
  })

  it('names a column that has gone off the left, which is what scrolling right does', () => {
    expect(
      columnsOutOfReach(box, [
        { key: 'what', left: -140, right: 60 },
        { key: 'note', left: 300, right: 500 },
      ]),
    ).toEqual(['what'])
  })

  it('does not name a column a fraction of a pixel over, which is rounding and not a column', () => {
    expect(columnsOutOfReach(box, [{ key: 'note', left: 99.7, right: 500.4 }])).toEqual([])
  })
})

describe('which side the table carries on past', () => {
  it('says nothing when the whole table is in the box', () => {
    expect(sidesWithMore(across({ scrollLeft: 0, clientWidth: 660, scrollWidth: 660 }))).toEqual([])
  })

  it('says right at the left-hand end of a table that is too wide', () => {
    expect(sidesWithMore(across({ scrollLeft: 0, clientWidth: 660, scrollWidth: 980 }))).toEqual(['right'])
  })

  it('says both in the middle', () => {
    expect(sidesWithMore(across({ scrollLeft: 120, clientWidth: 660, scrollWidth: 980 }))).toEqual([
      'left',
      'right',
    ])
  })

  it('says left at the right-hand end', () => {
    expect(sidesWithMore(across({ scrollLeft: 320, clientWidth: 660, scrollWidth: 980 }))).toEqual(['left'])
  })

  it('says down when the contents go on past the bottom, which is contract question 17', () => {
    expect(
      sidesWithMore({
        scrollLeft: 0,
        clientWidth: 660,
        scrollWidth: 660,
        scrollTop: 0,
        clientHeight: 260,
        scrollHeight: 900,
      }),
    ).toEqual(['down'])
  })
})

// ============================================================ the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let planId: string

/**
 * A plan with a heading, three levels and four planning values written into the lines, which is
 * what makes every one of Mole Office's own columns carry something worth reaching.
 */
const BODY = [
  '# Tray clamp rebuild',
  '- rewrite the controller {size: 15h} {time: 15h this week} {note: ask Sam first}',
  '  - calibrate the jig {size: very big}',
  '- replace the mount {project: robotics}',
  '- [ ] read the paper',
  '1. write it up',
].join('\n')

beforeAll(async () => {
  app = await liveApp({ name: 'reach', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = await fetch(`http://127.0.0.1:${apiPort}/api/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Reaching every column', body: BODY }),
  })
  if (!made.ok) throw new Error(`starting a plan answered ${made.status}: ${await made.text()}`)
  planId = ((await made.json()) as { plan: { id: string } }).plan.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one column heading measures, and how much of it is inside the box that scrolls. */
interface Head {
  heading: string
  total: number
  visible: number
}

/** Every column of the table, and how much of each one a person can actually see. */
function heads(): Promise<Head[]> {
  return page.evaluate(() => {
    const wrap = document.querySelector('.pt-wrap')
    if (wrap === null) throw new Error('the plan table is not on the page')
    const box = wrap.getBoundingClientRect()
    return [...wrap.querySelectorAll('thead th')].map((th) => {
      const r = th.getBoundingClientRect()
      // THE HEADING ITSELF AND NOT EVERYTHING INSIDE THE CELL. A column may carry a help mark, and a
      // help mark is a details element whose body is in the page while it is shut — so reading the
      // whole cell's text would report the Type column as being called four paragraphs.
      const label = th.querySelector('.pt-sort') ?? th.querySelector('.pt-head > span')
      return {
        heading: ((label ?? th).textContent ?? '').trim(),
        total: Math.round(r.width),
        visible: Math.round(Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left))),
      }
    })
  })
}

/**
 * Open the plan at one width in one layout, from a clean start.
 *
 * The layout is remembered per person in the browser's own storage, so it is cleared and the page
 * loaded again — otherwise the layout one measurement ended in decides what the next one opens.
 */
async function open(width: number, layout: 'Writing and table' | 'Table'): Promise<void> {
  await openThisPlan(planId, width, layout)
}

/**
 * The same thing for any plan, and it clears the remembered COLUMN WIDTHS as well as the layout.
 *
 * Both are kept per person in the browser's own storage, so without this the width one measurement
 * ended on decides what the next one opens with — and a test that dragged a column would change what
 * every test after it measured.
 */
async function openThisPlan(
  id: string,
  width: number,
  layout: 'Writing and table' | 'Table',
): Promise<void> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${webPort}/#/plans/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mole-office.plan.shown.') || key.startsWith('mole-office.plan.widths.')) {
        window.localStorage.removeItem(key)
      }
    }
  })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.getByRole('button', { name: layout, exact: true }).click()
  await page.waitForSelector(`.op-plan[data-shown="${layout === 'Table' ? 'table' : 'both'}"]`, {
    timeout: 30_000,
  })
  await page.waitForSelector('.pt-table', { timeout: 30_000 })
  // The table measures its own box after the browser has laid it out, so the first drawing is the
  // one for the width it had before the layout changed.
  await sleep(600)
}

/** How wide one column really is on the screen, by its key, rounded to a whole pixel. */
function columnWidth(key: string): Promise<number> {
  return page.evaluate((col) => {
    const th = document.querySelector(`.pt-table thead th[data-col="${col}"]`)
    if (th === null) throw new Error(`there is no ${col} column on this table`)
    return Math.round(th.getBoundingClientRect().width)
  }, key)
}

/** Drag one column's right-hand edge by this many pixels, the way a person does it. */
async function dragEdge(key: string, by: number): Promise<void> {
  const grip = page.locator(`.pt-table thead th[data-col="${key}"] .pt-grip`)
  const box = await grip.boundingBox()
  if (box === null) throw new Error(`the ${key} column has no edge to drag`)
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + by, y, { steps: 10 })
  await page.mouse.up()
  await sleep(200)
}

// ============================================================================ what a person sees

/**
 * 1440 IS NO LONGER ONE OF THE WIDTHS WHERE THIS TABLE CLIPS, AND THAT IS THE POINT OF SAYING SO.
 *
 * This block used to run at 1440 in "Writing and table" as well, and it was the case the file was
 * written for: the box was 659px, the six columns came to 1105px, and Schedule, Project and Note
 * were named above the table because three of them were off the edge. Naming them was the right
 * answer to a table that did not fit. It was not the right answer to the question of why it did not
 * fit, which was that every column but one was drawn at a fixed number of pixels that took no notice
 * of the room. `columnWidths` in `PlanTable.tsx` fits them to the room now, so at 1440 there is
 * nothing to name and the guard below fires rather than passing on an empty list.
 *
 * The clipping case is real at 390, where six columns need 588px and the box is 366px, and no
 * squeezing gets them in. That is where this runs. The 1440 case moved to
 * `tests/nothing-scrolls-in-silence-at-1440.test.ts`, which asserts the opposite fact: that every
 * column is on the screen.
 */
describe('no column of the plan table is out of sight without being named', () => {
  for (const [width, layout] of [
    [390, 'Table'],
    [390, 'Writing and table'],
  ] as const) {
    it(`names every column the box is not showing, at ${width} in "${layout}"`, async () => {
      await open(width, layout)
      const measured = await heads()
      const clipped = measured.filter((one) => one.heading !== '' && one.visible < one.total)
      // THE MEASUREMENT HAS TO HAVE SOMETHING TO SAY, or the check below proves nothing. Both of
      // these widths were measured with columns at 0 pixels; if the table ever fits here, this
      // fails and asks for the check to be moved rather than passing on an empty list.
      expect(
        clipped.map((one) => `${one.heading} ${one.visible}/${one.total}`),
        `nothing is clipped at ${width} in "${layout}", so this proves nothing: ${JSON.stringify(measured)}`,
      ).not.toHaveLength(0)

      const said = page.locator('.pt-reach')
      expect(await said.isVisible(), 'the line above the table is not on the screen').toBe(true)
      const words = await said.innerText()
      for (const one of clipped) {
        expect(words, `${one.heading} is ${one.visible} of ${one.total} pixels wide and is not named`).toContain(
          one.heading,
        )
      }

      // AND THE PAGE ITSELF STILL DOES NOT SCROLL SIDEWAYS. The table's own box does; the product
      // does this nowhere.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
        'the page scrolled sideways',
      ).toBe(false)
    }, 120_000)
  }

  it('brings a column that was nought pixels wide fully into the box when its name is pressed', async () => {
    // AT 390, WHICH IS NOW WHERE A COLUMN IS ACTUALLY NOUGHT PIXELS WIDE. It was 1440 in "Writing
    // and table" until the columns were fitted to the room; see the note above this block.
    await open(390, 'Writing and table')
    const before = (await heads()).find((one) => one.heading === 'Note')
    expect(before, 'the note column is not on this table at all').toBeDefined()
    expect(before?.visible, 'the note column was already on the screen, so pressing proves nothing').toBe(0)

    await page.getByRole('button', { name: 'Bring Note into view' }).click()
    await sleep(400)

    const after = (await heads()).find((one) => one.heading === 'Note')
    expect(after?.visible, 'pressing the name did not bring the whole column into the box').toBe(after?.total)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      'the page scrolled sideways',
    ).toBe(false)
  }, 120_000)

  it('says nothing at all when the whole table fits, and never mentions columns Mole Office has not got', async () => {
    await open(1440, 'Table')
    const measured = await heads()
    expect(
      measured.filter((one) => one.visible < one.total),
      `the table does not fit at 1440 on its own: ${JSON.stringify(measured)}`,
    ).toHaveLength(0)
    expect(await page.locator('.pt-reach').isVisible(), 'a line about missing columns is on a table that fits').toBe(
      false,
    )
    // THE SENTENCE THE OWNER READ AND WAS MISDIRECTED BY. It named three columns this table has
    // never had, on a table that was really hiding three different ones.
    expect(await page.locator('.pt').innerText()).not.toContain('not on this table')
  }, 120_000)
})

// ============================================================================ the person owns the widths

/**
 * THE COLUMN WIDTHS ARE THE PERSON'S, AND NOTHING ELSE MAY MOVE THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER REPORTED, 17 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * *"The current split view can crush Note and Project into almost one-character columns … and
 * sometimes change column width unexpectedly after interacting with a row. Let the person adjust
 * column widths naturally and retain their layout preference. Do not let an interaction unexpectedly
 * rewrite a layout the person just established."*
 *
 * THE SECOND HALF IS THE ONE ONLY A BROWSER CAN CHECK. A table laid out automatically re-decides
 * every column from its contents on every draw, so typing a long note really did move the edges. The
 * test below types one and measures the column afterwards.
 */
describe('the person owns the column widths', () => {
  it('widens a column when its edge is dragged, and no row interaction moves it back', async () => {
    await open(1440, 'Table')
    const before = await columnWidth('note')
    await dragEdge('note', 140)
    const after = await columnWidth('note')
    expect(after, `the note column was ${before}px and is ${after}px`).toBeGreaterThan(before + 100)

    // NOW INTERACT WITH A ROW, which is what used to rewrite the layout: type a long note into the
    // very column that was just widened, so the automatic layout would certainly have re-decided it.
    const note = page.getByRole('textbox', { name: 'Your own note about this item' }).first()
    await note.click()
    await page.keyboard.type('recalibrate before the next test, and check the mount is square')
    await sleep(2_500)
    expect(await columnWidth('note'), 'typing in a row rewrote a width the person set').toBe(after)

    // AND FOLDING, WHICH REDRAWS EVERY ROW, DOES NOT EITHER.
    await page.getByRole('button', { name: 'Fold every level' }).click()
    await sleep(400)
    expect(await columnWidth('note'), 'folding rewrote a width the person set').toBe(after)
  }, 120_000)

  it('remembers the layout across a reload, and puts it back when asked', async () => {
    await open(1440, 'Table')
    const own = await columnWidth('project')
    await dragEdge('project', 160)
    const wide = await columnWidth('project')
    expect(wide).toBeGreaterThan(own + 120)

    // REMEMBERED. Not in this page's state, which a reload throws away.
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.pt-table', { timeout: 30_000 })
    await sleep(600)
    expect(await columnWidth('project'), 'the layout was not remembered across a reload').toBe(wide)

    // AND THERE IS A WAY BACK, which there has to be: a person who has dragged a column to nothing
    // cannot always drag it out again.
    await page.getByRole('button', { name: 'Reset widths' }).click()
    await sleep(300)
    expect(await columnWidth('project')).toBe(own)
    // And the press goes with the thing it undoes.
    expect(await page.getByRole('button', { name: 'Reset widths' }).count()).toBe(0)
  }, 120_000)

  it('will not let a column be dragged down to nothing', async () => {
    await open(1440, 'Table')
    await dragEdge('note', -800)
    const squashed = await columnWidth('note')
    // The floor is in the component; what is asserted here is that there IS one and that it is wide
    // enough to hold something. This is the "almost one-character column" the owner reported.
    expect(squashed, `the note column went to ${squashed}px`).toBeGreaterThanOrEqual(40)
  }, 120_000)
})

// ============================================================================ the task is always reachable

/**
 * THE TASK COLUMN IS ON THE SCREEN AT EVERY SCROLL POSITION, AT PHONE WIDTH.
 *
 * MEASURED DEFECT, ROUND SIX. At phone width, pressing the name of a column above the table to bring
 * it into view scrolled the words off the left-hand edge — so a reader arrived at the column they
 * wanted and was looking at rows they could no longer identify. The owner's rule: the Task column
 * must always be reachable.
 */
describe('the task column never scrolls away', () => {
  it('is still on the screen after another column is brought into view at phone width', async () => {
    await open(390, 'Table')
    const before = (await heads()).find((one) => one.heading === 'Task')
    expect(before?.visible, 'the task column is not on the screen to begin with').toBeGreaterThan(0)

    // The measurement is only worth anything if something really was off the edge.
    const missing = (await heads()).filter((one) => one.heading !== '' && one.visible < one.total)
    expect(
      missing.map((one) => one.heading),
      `nothing is clipped at 390, so this proves nothing: ${JSON.stringify(await heads())}`,
    ).not.toHaveLength(0)

    await page.getByRole('button', { name: 'Bring Note into view' }).click()
    await sleep(400)

    const after = (await heads()).find((one) => one.heading === 'Task')
    expect(after?.visible, 'the task column scrolled off the screen and the rows cannot be identified').toBeGreaterThan(
      0,
    )
    // AND THE COLUMN THAT WAS ASKED FOR REALLY ARRIVED, MEASURED PAST THE COLUMN THAT HOLDS STILL.
    //
    // A Task column that holds still and takes the whole of a phone screen would pass the line above
    // and solve nothing: the reader would be looking at the rows and at forty pixels of the column
    // they pressed for. A rectangle drawn UNDER the one that holds still is still inside the box, so
    // this measures from the right-hand edge of that column rather than from the edge of the box.
    const note = await page.evaluate(() => {
      const wrap = document.querySelector('.pt-wrap')!.getBoundingClientRect()
      const task = document.querySelector('.pt-table thead th[data-col="what"]')!.getBoundingClientRect()
      const cell = document.querySelector('.pt-table thead th[data-col="note"]')!.getBoundingClientRect()
      const from = Math.max(wrap.left, task.right)
      return {
        visible: Math.round(Math.max(0, Math.min(cell.right, wrap.right) - Math.max(cell.left, from))),
        total: Math.round(cell.width),
        room: Math.round(wrap.right - from),
        box: Math.round(wrap.width),
      }
    })
    // IT USES EVERY PIXEL THERE IS. The column is brought as far into the clear as it will go.
    expect(
      note.visible,
      `the column brought into view is ${String(note.visible)} pixels clear of ${String(note.room)} available`,
    ).toBe(Math.min(note.total, note.room))
    // AND THERE IS REAL ROOM TO BRING IT INTO. The columns that hold still must leave most of a phone
    // screen for the rest of the table, or the fix for one defect is the other one: a reader looking
    // at the rows and at forty pixels of the column they pressed for.
    expect(
      note.room,
      `the columns that hold still leave ${String(note.room)} of ${String(note.box)} pixels`,
    ).toBeGreaterThan(note.box * 0.4)
    // AND THE ROWS' OWN WORDS CAME WITH IT, not only the heading.
    const words = await page.evaluate(() => {
      const box = document.querySelector('.pt-wrap')!.getBoundingClientRect()
      const cell = document.querySelector('.pt-table tbody tr td:nth-child(2)')!.getBoundingClientRect()
      return Math.round(Math.max(0, Math.min(cell.right, box.right) - Math.max(cell.left, box.left)))
    })
    expect(words, 'the words of the first row are not on the screen').toBeGreaterThan(0)
  }, 120_000)
})

// ============================================================================ what it said was saved is saved

/**
 * A CELL THAT STILL HAS THE CURSOR IN IT IS SAVED.
 *
 * MEASURED DEFECT, ROUND SIX. A cell used to store its words only when the cursor LEFT it. A tester
 * typed a note, waited ten seconds, reloaded the page, and the note was gone. The line above the
 * table did say "Not stored yet." and that was true — but it sits a long way from the cell, and
 * nobody reads a status line about a box they are still typing in.
 *
 * The owner's acceptance list asks to "reload without losing in-progress human intent once the UI
 * said it was saved". So: type, never leave the cell, reload, and the words are still there.
 */
describe('a cell with the cursor still in it is saved', () => {
  it('stores a note nobody has clicked away from, and a reload finds it', async () => {
    const made = await fetch(`http://127.0.0.1:${apiPort}/api/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Typing and reloading', body: '- calibrate the jig' }),
    })
    const id = ((await made.json()) as { plan: { id: string } }).plan.id
    await openThisPlan(id, 1440, 'Table')

    const note = page.getByRole('textbox', { name: 'Your own note about this item' }).first()
    await note.click()
    await page.keyboard.type('grip slips above 15N')

    // THE CURSOR IS STILL IN THE BOX. Nothing is clicked, nothing is blurred, no key but the letters.
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
      'Your own note about this item',
    )
    await sleep(3_000)

    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.pt-table', { timeout: 30_000 })
    await sleep(600)
    // READ OFF THE BOX ITSELF. A textarea's words are its VALUE and are not in the page's text, so
    // reading the table's own text would be looking for them where they never are.
    expect(
      await page.getByRole('textbox', { name: 'Your own note about this item' }).first().inputValue(),
    ).toBe('grip slips above 15N')
    // And it really reached the document, which is the store.
    const stored = await fetch(`http://127.0.0.1:${apiPort}/api/plans/${id}/blocks`)
    const lines = ((await stored.json()) as { lines: { line: { text: string } }[] }).lines
    expect(lines.map((one) => one.line.text).join('\n')).toContain('{note: grip slips above 15N}')
  }, 120_000)
})
