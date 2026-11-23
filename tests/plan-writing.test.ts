// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TYPING A WHOLE PLAN IN A REAL BROWSER, AND GETTING THE SAME CHARACTERS BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * The plan is one text box, so selecting, undoing, cutting, pasting, selecting all and putting the
 * caret where you clicked are the BROWSER'S. None of that can be proved without a browser, and the
 * build before this one failed every one of those while its unit tests passed. A person who had
 * never seen Mole Office measured it: four typed spaces stored as forty-six, an undo that removed three
 * of five characters, no way to select two lines, no way to copy the plan out, and a click that put
 * the caret at the end of the line instead of where it landed.
 *
 * So this file presses the keys and moves the mouse, and then reads the plan out of the database
 * and compares it character for character with what was typed.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * One string is written by hand at the bottom of this file: what a person typing those keys should
 * end up with. Nothing is normalised on either side of the comparison.
 */

import { readFileSync } from 'node:fs'
import type { Page } from 'playwright'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { t } from '../src/shared/i18n.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page

/** The plan as the server holds it right now, joined back into one document. */
async function storedBody(id: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/plans/${id}/blocks`)
  if (!res.ok) throw new Error(`reading the plan back answered ${res.status}: ${await res.text()}`)
  const reply = (await res.json()) as { lines: { line: { text: string } }[] }
  return reply.lines.map((entry) => entry.line.text).join('\n')
}

/** The plan's stored rows, so a test can check that a line kept its own row and its record. */
async function storedLines(id: string): Promise<{ id: string; text: string; recordId: string | null }[]> {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/plans/${id}/blocks`)
  if (!res.ok) throw new Error(`reading the plan back answered ${res.status}: ${await res.text()}`)
  const reply = (await res.json()) as {
    lines: { line: { id: string; text: string; recordId: string | null } }[]
  }
  return reply.lines.map((entry) => entry.line)
}

async function newPlan(title: string, body?: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/plans`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body === undefined ? { title } : { title, body }),
  })
  if (!res.ok) throw new Error(`starting a plan answered ${res.status}: ${await res.text()}`)
  const reply = (await res.json()) as { plan: { id: string } }
  return reply.plan.id
}

beforeAll(async () => {
  app = await liveApp({ name: 'write', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * NO TEST INHERITS ANOTHER TEST'S LAYOUT.
 *
 * The plan layout is remembered per PERSON, not per plan, in the browser's own storage — so it
 * survives between plans, between page loads and between tests. Every test here shares one page.
 * Without this, a test that ended in the Table layout silently decided what the next twenty tests
 * opened into, and the ones that wanted a writing box waited thirty seconds each for one that was
 * never coming.
 *
 * Thirteen tests used to restore the layout by hand at the end of their own body, which is exactly
 * the line that does not run when a test fails. Clearing it before each test is the same intent in
 * the one place that cannot be skipped.
 */
beforeEach(async () => {
  // Before the first navigation the page is on about:blank, where reading localStorage throws a
  // SecurityError. There is nothing remembered yet at that point, so there is nothing to clear.
  if (!page.url().startsWith('http')) return
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('mole-office.plan.shown.')) window.localStorage.removeItem(key)
    }
  })
})

/**
 * Open a plan and wait for the box to be on screen.
 *
 * IT SAYS WHY WHEN THE BOX NEVER COMES, and that sentence is the whole point of this shape.
 *
 * The layout is remembered per person, and the Table layout deliberately has no writing box. Every
 * test in this file shares one browser page, so one test that ended in the Table layout used to
 * leave every later test staring at a selector that would never appear — 30 seconds of silence
 * each, and the run reported a dozen timeouts none of which named the cause. Measured on this file:
 * one small failure became sixteen 30-second waits and an eight-minute run.
 *
 * `beforeEach` now clears the remembered layout so no test can inherit another's, which is the fix.
 * This message is the second line of defence: if the box is missing anyway, the failure says which
 * layout the page is in rather than describing a selector.
 */
async function openPlan(id: string, tail = ''): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/#/plans/${id}${tail}`, {
    timeout: 60_000,
  })
  await waitForThePage(page, 60_000)
  try {
    await page.waitForSelector('.pw-box', { timeout: 10_000 })
  } catch {
    const on = await page
      .locator('.op-plan')
      .getAttribute('data-shown')
      .catch(() => null)
    throw new Error(
      on === null
        ? `The plan page never drew at all for ${id}: no .op-plan, so this is not a layout problem.`
        : `The plan page opened in the "${on}" layout, which has no writing box. A test before this ` +
          'one left it there, or the beforeEach that clears the remembered layout has been removed.',
    )
  }
}

/**
 * Put the page on one of the three layouts.
 *
 * A test that wants a particular layout has to ASK for it. The choice is remembered per person
 * between visits, so a test that assumed a layout would also depend on whichever test ran before
 * it. What a plan opens on when nobody has chosen is `OPENS_ON` in OnePlanPage.tsx.
 */
async function showLayout(name: 'Writing' | 'Writing and table' | 'Table'): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click()
  // WAIT FOR THE LAYOUT THIS PRESS ASKED FOR, not for anything that happens to be on screen. An
  // assertion straight after a press used to be able to read the DOM from BEFORE it: the old wait
  // accepted a table that was already drawn, so pressing for one layout and reading another passed.
  const shown = name === 'Writing' ? 'writing' : name === 'Table' ? 'table' : 'both'
  await page.waitForSelector(`.op-plan[data-shown="${shown}"]`, { timeout: 30_000 })
}

/**
 * LOAD THE PAGE AGAIN FOR REAL.
 *
 * `page.goto` at the address you are already on is a FRAGMENT navigation: the document is not
 * reloaded, React does not remount, and a component's state survives it. A test that used goto to
 * check something was remembered was therefore reading the state left by its own click. Measured:
 * deleting the write to storage altogether left such a test green.
 */
async function loadAgain(): Promise<void> {
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.op-plan', { timeout: 30_000 })
}

/**
 * THE PLANNING TABLE, WITH WHICHEVER COLUMNS THE ROOM IT HAS ALLOWS.
 *
 * The table measures its own column rather than the window. Beside the writing box that column is
 * about 640px at a 1440px window — narrower than every column needs — so it draws the four the
 * owner named and says what it left off. On its own it is at full width and draws them all.
 *
 * IT IS ONE ARRANGEMENT AT EVERY WIDTH. There used to be two, and the second was a card per item
 * with a label beside every value; it is gone. So a test about what the table HOLDS asks for `.pt`,
 * which is the table itself, and a test about which COLUMNS are drawn reads the row of headings.
 */
const table = () => page.locator('.pt')

/** Wait until the table has drawn. */
async function waitForTable(): Promise<void> {
  await page.waitForSelector('.pt-table', { timeout: 30_000 })
}

/**
 * The words in the table's one row of headings, in order. The only place a heading is drawn.
 *
 * THE HEADING ITSELF AND NOT EVERYTHING IN THE CELL. A column may carry a help mark holding what its
 * words mean, and a heading cell also holds the edge you drag to change its width — so reading the
 * whole cell would report the Type column as being called "Type ?".
 */
function headings(): Promise<string[]> {
  return page.locator('.pt-table thead th').evaluateAll((cells) =>
    cells.map((th) => {
      const label = th.querySelector('.pt-sort') ?? th.querySelector('.pt-head > span')
      return ((label ?? th) as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
    }),
  )
}

/**
 * Wait until the table has read the room it is in and drawn the columns that fit.
 *
 * WHY EVERY TEST THAT CHANGES THE LAYOUT NEEDS THIS. The table measures its own box in the browser
 * and then re-draws, so for one frame after the columns change width the box is already its new
 * size and the table is still the one for the old size. A test that read the headings straight after
 * pressing "Table" got the narrow set at 1164px — not because the table was wrong, but because it
 * had not been asked again yet. `data-room` is the table's own statement of what it measured, set in
 * the same render as the columns, so waiting for it waits for exactly the right moment.
 */
async function waitForRoom(room: 'narrow' | 'wide'): Promise<void> {
  await page.waitForFunction(
    (want) => (document.querySelector('.pt')?.getAttribute('data-room') ?? 'wide') === want,
    room,
    { timeout: 30_000 },
  )
}

/**
 * Every value the planning table is holding in a box, in row order.
 *
 * The table's words are TEXTAREAS, because a row is edited where it is seen, so reading the table's
 * text finds the headings and not one word the person wrote. This reads the boxes' own values.
 */
function tableBoxes(): Promise<string[]> {
  return table()
    .locator('textarea')
    .evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value))
}

/** Open the `?` mark whose label is this, and read what is behind it. */
async function behindTheMark(label: string): Promise<string> {
  const mark = page.locator(`summary[aria-label="${label}"]`)
  await mark.click()
  return mark.locator('xpath=..').locator('.px-hint-body').innerText()
}

/** Wait for the page's own word, which is the only thing that claims the writing is stored. */
async function waitForStored(): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector('.pw-say')?.textContent?.trim() === 'Stored.',
    undefined,
    { timeout: 20_000 },
  )
}

/** The characters in the box right now. */
function inBox(): Promise<string> {
  return page.locator('.pw-box').inputValue()
}

/** Where the caret and the end of the selection are. */
function selection(): Promise<{ start: number; end: number }> {
  return page.evaluate(() => {
    const el = document.querySelector('.pw-box') as HTMLTextAreaElement
    return { start: el.selectionStart, end: el.selectionEnd }
  })
}

/**
 * Where a line and column of the box are on the screen.
 *
 * The box is monospaced, so one character's width is measured once and multiplied. This is what
 * lets the mouse be aimed at a word rather than at a pixel that happens to be near one.
 */
async function whereIs(line: number, column: number): Promise<{ x: number; y: number }> {
  await page.locator('.pw-box').scrollIntoViewIfNeeded()
  return page.evaluate(
    ({ line: atLine, column: atColumn }) => {
      const el = document.querySelector('.pw-box') as HTMLTextAreaElement
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      ctx.font = `${style.fontSize} ${style.fontFamily}`
      const wide = ctx.measureText('0'.repeat(40)).width / 40
      const left = rect.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)
      const top = rect.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth) - el.scrollTop
      const high = parseFloat(style.lineHeight)
      return { x: left + atColumn * wide + wide * 0.15, y: top + (atLine + 0.5) * high }
    },
    { line, column },
  )
}

/** Where a character offset is, counted through the whole document. */
function offsetOf(body: string, line: number, column: number): number {
  const lines = body.split('\n')
  let at = 0
  for (let index = 0; index < line; index += 1) at += lines[index]!.length + 1
  return at + column
}

// ============================================================================ always writable

describe('a plan is always writable', () => {
  /**
   * THERE IS NO EDIT BUTTON AND THERE IS A SAVE AND CLOSE BUTTON, AND THOSE ARE DIFFERENT THINGS.
   *
   * An Edit button would mean the plan is read-only until you press it, which is the thing this
   * page exists not to be. Save and close means "I have finished writing, store it and take me
   * back", which is a useful physical affordance, and an interface does not remove
   * one merely because the automatic mechanism usually works.
   *
   * IT WAS CALLED "Done" UNTIL 18 AUGUST 2026. A tester listed three controls called Done and found
   * they meant two different things; the two that mean the work is finished kept the word.
   */
  it('opens as one box with no Edit button, and the same page answers the old /edit address', async () => {
    const id = await newPlan('Already written', '# Perception\n\n- tune the gains\n')
    await openPlan(id)
    const said = await page.locator('#main').innerText()
    expect(said).not.toContain('Not built yet')
    expect(await page.getByRole('button', { name: 'Edit', exact: true }).count()).toBe(0)
    expect(await page.locator('.pw-box').count()).toBe(1)
    // The two deliberate presses, both on the page from the moment it opens.
    expect(await page.getByRole('button', { name: 'Save now', exact: true }).count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Save and close', exact: true }).count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Done', exact: true }).count()).toBe(0)

    await openPlan(id, '/edit')
    expect(await page.locator('.pw-box').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Save and close', exact: true }).count()).toBe(1)
  })

  /**
   * THE BOX AND THE TABLE ARE THE SAME PLAN, SIDE BY SIDE, WITH NO PRESS BETWEEN THEM.
   *
   * The box holds every character. Beside it the same lines are the rows of the planning table, at
   * the depth they were written at. That pairing is what the second column is for: the Table
   * there is much more valuable than a permanent second rendering of the Markdown.
   */
  it('draws the table beside the box, from what was just typed', async () => {
    const id = await newPlan('Beside it')
    await openPlan(id)
    await showLayout('Writing and table')
    await page.locator('.pw-box').click()
    await page.keyboard.type('# Perception')
    await page.keyboard.press('Enter')
    await page.keyboard.type('- [x] tune the gains')
    await waitForStored()

    // Both columns are on screen, and the table holds the lines the box holds.
    expect(await page.locator('.pw-box').count()).toBe(1)
    await waitForTable()
    const rows = await tableBoxes()
    expect(rows).toContain('Perception')
    expect(rows).toContain('tune the gains')
    // The markers are the writing's. The table holds the words, not the hashes and brackets.
    expect(rows).not.toContain('# Perception')
    // And the box still holds exactly what was typed, hashes and brackets included.
    expect(await inBox()).toBe('# Perception\n- [x] tune the gains')
    await showLayout('Writing')
  }, 120_000)

  /**
   * THE KEYS ARE BEHIND THE HELP MARK, AND THEY ARE STILL ALL THERE.
   *
   * The permanent keyboard instructions go behind help. Behind help is not
   * the same as gone, and the difference is what this measures: nothing about the keys is on screen
   * until the mark is pressed, and every key is behind it when it is.
   */
  it('keeps the keyboard instructions off the screen until the help mark is pressed', async () => {
    const id = await newPlan('The keys')
    await openPlan(id)
    const onScreen = await page.locator('.pw').innerText()
    // CRITERION CHANGE, as decided: what the keys do is one sentence now, and it is all behind the mark.
    expect(onScreen).not.toContain(t('planWriting.keysHint'))

    const said = await behindTheMark('What the keys do')
    expect(said).toContain(t('planWriting.keysHint'))
  }, 120_000)
})

// ============================================================================ the owner's outline

/**
 * THE MEASUREMENT THIS WHOLE FILE EXISTS FOR.
 *
 * The owner's own outline, typed with LEADING SPACES ONLY and no bullet markers — the exact shape
 * the last build corrupted, storing forty-six spaces where four were typed and hiding it, because a
 * line with no bullet marker had its leading spaces stripped when it was drawn.
 */
describe('typing the owner’s outline and getting it back', () => {
  it('stores exactly the characters that were typed, and gives them back after a reload', async () => {
    const id = await newPlan('Build a baseline')
    await openPlan(id)
    // An empty plan opens with the cursor in the box, so there is nothing to press first.
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('pw-box')

    for (let at = 0; at < OUTLINE_LINES.length; at += 1) {
      if (at > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(OUTLINE_LINES[at]!)
    }
    await waitForStored()

    const stored = await storedBody(id)
    expect(
      stored.length,
      `typed ${OUTLINE.length} characters and stored ${stored.length}`,
    ).toBe(OUTLINE.length)
    expect(stored).toBe(OUTLINE)

    // AND AFTER A RELOAD, which is the question a person actually asks.
    await openPlan(id)
    expect(await inBox()).toBe(OUTLINE)
    expect(await storedBody(id)).toBe(OUTLINE)
    // AND THE TABLE BESIDE IT INVENTS NOTHING FROM THE INDENTATION. This outline is indented prose
    // with no markers, so none of it is an item, and the table says exactly that rather than
    // turning twelve lines of somebody's thinking into twelve pieces of work.
    await showLayout('Writing and table')
    await page.waitForSelector('.pt', { timeout: 30_000 })
    // The counts, not the empty state's sentence: the sentence belongs to the table's owner and
    // this test would then fail on a rewording rather than on the thing it measures.
    expect(await page.locator('.pt').innerText()).toContain(`${OUTLINE_LINES.length} lines of prose`)
    expect(await page.locator('.pt-table').count(), 'the table drew a row for prose').toBe(0)
    // Back to the resting layout, because the choice is remembered and the next test would inherit
    // it. A test that depends on which test ran before it is not a measurement.
    await showLayout('Writing')
  }, 180_000)

  /**
   * THE SPACES ARE THE PERSON'S AND NOBODY ELSE ADDS ANY. Enter carrying the last line's indent is
   * what made four typed spaces become forty-six, so this checks that Enter carries nothing.
   */
  it('adds no indentation of its own when Enter is pressed', async () => {
    const id = await newPlan('Enter carries nothing')
    await openPlan(id)
    await page.locator('.pw-box').click()
    await page.keyboard.type('    deep')
    await page.keyboard.press('Enter')
    await page.keyboard.type('back')
    expect(await inBox()).toBe('    deep\nback')
  })
})

// ============================================================================ the browser's own

/**
 * SELECTION, UNDO, THE CARET AND SELECT ALL ARE THE BROWSER'S, AND THESE ARE THE PROOFS.
 *
 * Each of these was broken in the build before this one, and each is broken again the moment
 * somebody adds a key handler for it. They are written as separate tests so a failure names which
 * one came back.
 */
describe('selection, undo, the caret and select all are the browser’s', () => {
  const BODY = [
    'build a baseline',
    '  build the pipeline',
    '    perception',
    '    planning',
    '    control',
    '  implement one controller detail',
    '    tune gains',
    '    test saturation',
    '  prepare the experiment',
  ].join('\n')

  it('selects three lines with the mouse, cuts them, and pastes them back unchanged', async () => {
    const id = await newPlan('Cut and paste', BODY)
    await openPlan(id)

    const from = await whereIs(2, 0)
    const to = await whereIs(5, 0)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()

    const picked = await selection()
    expect(picked.start).toBe(offsetOf(BODY, 2, 0))
    expect(picked.end).toBe(offsetOf(BODY, 5, 0))
    expect(BODY.slice(picked.start, picked.end)).toBe('    perception\n    planning\n    control\n')

    await page.keyboard.press('Control+x')
    expect(await inBox()).toBe(
      ['build a baseline', '  build the pipeline', '  implement one controller detail', '    tune gains', '    test saturation', '  prepare the experiment'].join(
        '\n',
      ),
    )

    await page.keyboard.press('Control+v')
    expect(await inBox()).toBe(BODY)
    await waitForStored()
    expect(await storedBody(id)).toBe(BODY)
  }, 120_000)

  it('walks a run of typed characters back with one Ctrl+Z', async () => {
    const id = await newPlan('Undo', BODY)
    await openPlan(id)
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('abcde')
    expect(await inBox()).toBe(`${BODY}abcde`)

    await page.keyboard.press('Control+z')
    // ALL FIVE, not three of five. That number is the measured failure of the last build.
    expect(await inBox()).toBe(BODY)

    await page.keyboard.press('Control+Shift+z')
    expect(await inBox()).toBe(`${BODY}abcde`)
  }, 120_000)

  it('walks several separate edits back one at a time', async () => {
    const id = await newPlan('Undo again', BODY)
    await openPlan(id)
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Enter')
    await page.keyboard.type('three')

    for (let at = 0; at < 12; at += 1) {
      if ((await inBox()) === BODY) break
      await page.keyboard.press('Control+z')
    }
    expect(await inBox()).toBe(BODY)
  }, 120_000)

  it('selects the whole plan with Ctrl+A, as the Markdown that is stored', async () => {
    const id = await newPlan('Select all', BODY)
    await openPlan(id)
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+a')

    const picked = await selection()
    expect(picked.start).toBe(0)
    expect(picked.end).toBe(BODY.length)
    // What is selected is the plan and nothing else — no sidebar, no heading, no drawn version.
    expect(await inBox()).toBe(BODY)
    expect((await inBox()).slice(picked.start, picked.end)).toBe(BODY)
  }, 120_000)

  it('puts the caret where the mouse clicked, in the middle of a word', async () => {
    const id = await newPlan('The caret', BODY)
    await openPlan(id)
    // Line 8 counting from one is "    test saturation"; the caret is aimed between "sat" and "u".
    const line = 7
    const column = 12
    const spot = await whereIs(line, column)
    await page.mouse.click(spot.x, spot.y)

    const picked = await selection()
    expect(picked.start).toBe(picked.end)
    expect(picked.start).toBe(offsetOf(BODY, line, column))
    expect(BODY.slice(picked.start, picked.start + 6)).toBe('uratio')
  }, 120_000)
})

// ============================================================================ the table

describe('a pipe table the writer typed becomes columns of the planning table', () => {
  it('draws the person’s own headings as columns, and changes one cell where the mouse landed', async () => {
    // "Days" rather than "Estimate", which is one of Mole Office's own column headings. A heading that
    // could have come from either place would make this pass without the writer's table being read.
    const TABLE = ['| Step | Days |', '| --- | --- |', '| baseline | 5d |', '| gaze | 2d |'].join('\n')
    const id = await newPlan('The table')
    await openPlan(id)
    await page.locator('.pw-box').click()
    for (let at = 0; at < TABLE.split('\n').length; at += 1) {
      if (at > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(TABLE.split('\n')[at]!)
    }
    await waitForStored()

    // THE WRITER DECLARES NOTHING. Their headings are columns beside Mole Office's, and their cells are in
    // them. This is what the second column is for; a rendering of the same table was what it was
    // for before, and it was rejected twice.
    await showLayout('Table')
    await waitForTable()
    await waitForRoom('wide')
    expect(await table().innerText()).toContain('Days')
    const cells = await tableBoxes()
    expect(cells).toContain('baseline')
    expect(cells).toContain('5d')

    // BESIDE THE WRITING BOX THERE IS NO ROOM FOR IT, AND THE TABLE SAYS SO AND OFFERS IT. That is
    // the whole of what a narrow table does differently: it draws fewer columns, names the ones it
    // left off — the writer's as readily as Mole Office's own — and one press brings them back. A column dropped
    // without a word is a column the reader thinks the product has not got.
    await showLayout('Writing and table')
    await waitForTable()
    await waitForRoom('narrow')
    expect(await page.locator('.pt-missing').first().innerText()).toContain('Days')
    expect(await table().innerText()).not.toContain('baseline')
    await page.getByRole('button', { name: 'Show every column' }).click()
    await page.waitForFunction(
      () => (document.querySelector('.pt')?.textContent ?? '').includes('Days'),
      undefined,
      { timeout: 30_000 },
    )
    expect(await tableBoxes()).toContain('5d')
    await showLayout('Writing')

    // NOW CHANGE 5d TO 6d BY CLICKING IT. In the old build this cost five ArrowDowns and
    // fifty-seven ArrowLefts, because clicking a line put the caret at the end of it.
    const column = TABLE.split('\n')[2]!.indexOf('5d')
    const spot = await whereIs(2, column)
    await page.mouse.click(spot.x, spot.y)
    expect((await selection()).start).toBe(offsetOf(TABLE, 2, column))
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.type('6')

    await waitForStored()
    expect(await storedBody(id)).toBe(TABLE.replace('5d', '6d'))
    // And the table reads the same store, so it says 6d without being told twice.
    await showLayout('Table')
    await page.waitForFunction(
      () => (document.querySelector('.pt')?.textContent ?? '').includes('6d'),
      undefined,
      { timeout: 30_000 },
    )
    await showLayout('Writing')
  }, 180_000)
})

// ============================================================================ moving a subtree

describe('the one key Mole Office answers', () => {
  const OUTLINE = [
    '- perception',
    '  - tune the gains',
    '  - test saturation',
    '- planning',
    '- control',
  ].join('\n')

  it('moves a line with every line indented under it, and Ctrl+Z walks the move back', async () => {
    const id = await newPlan('Moving', OUTLINE)
    await openPlan(id)
    const spot = await whereIs(0, 2)
    await page.mouse.click(spot.x, spot.y)
    await page.keyboard.press('Alt+ArrowDown')

    expect(await inBox()).toBe(
      ['- planning', '- perception', '  - tune the gains', '  - test saturation', '- control'].join('\n'),
    )
    await waitForStored()
    expect(await storedBody(id)).toBe(
      ['- planning', '- perception', '  - tune the gains', '  - test saturation', '- control'].join('\n'),
    )

    // THE MOVE IS ON THE BROWSER'S UNDO HISTORY, which is why it goes through the browser's own
    // insert rather than by setting the box's value.
    await page.keyboard.press('Control+z')
    expect(await inBox()).toBe(OUTLINE)
  }, 120_000)

  it('says why when there is nothing to move past, rather than doing nothing', async () => {
    const id = await newPlan('Nowhere to go', OUTLINE)
    await openPlan(id)
    const spot = await whereIs(0, 2)
    await page.mouse.click(spot.x, spot.y)
    await page.keyboard.press('Alt+ArrowUp')
    await page.waitForSelector('.pw-refused')
    expect(await page.locator('.pw-refused').innerText()).toContain(
      'nothing above this line at the same indentation',
    )
    expect(await inBox()).toBe(OUTLINE)
  }, 120_000)
})

// ============================================================================ line identity

/**
 * A LINE THAT DID NOT CHANGE KEEPS ITS ROW AND THE RECORD IT WAS FILED AS.
 *
 * This is the diff working, seen from the outside: file a line as work, insert a line ABOVE it,
 * save, and the same row is still there pointing at the same record.
 *
 * There is no press on this page that files a line as work yet — the route exists and nothing in
 * the interface calls it — so the binding is made through the API, which is how an agent would make
 * it. That absence is stated rather than worked around.
 */
describe('a line keeps its work when a line is inserted above it', () => {
  it('keeps the row and the record, and says nothing was lost', async () => {
    const id = await newPlan('Binding', '- baseline\n- gaze')
    const before = await storedLines(id)
    const bound = before[0]!
    const filed = await fetch(
      `http://127.0.0.1:${apiPort}/api/plans/${id}/lines/${bound.id}/file-as-work`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'task', workspaceId: 'default' }),
      },
    )
    expect(filed.status, await filed.text().catch(() => '')).toBe(201)
    const recordId = (await storedLines(id))[0]!.recordId
    expect(recordId).not.toBeNull()

    await openPlan(id)
    // The record is drawn beside the line it is on, before anything is typed: exactly one of the
    // two rows is marked as filed as work, and it is the one that was.
    await showLayout('Writing and table')
    await waitForTable()
    expect(await table().locator('[data-filed="1"]').count()).toBe(1)
    await showLayout('Writing')

    // A LINE INSERTED ABOVE THE BOUND ONE.
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.type('# Perception')
    await page.keyboard.press('Enter')
    await waitForStored()

    const after = await storedLines(id)
    expect(after.map((line) => line.text)).toEqual(['# Perception', '- baseline', '- gaze'])
    expect(after[1]!.id).toBe(bound.id)
    expect(after[1]!.recordId).toBe(recordId)
    // Nothing was lost, so the page says nothing about a lost binding.
    expect(await page.locator('.pw-lost').count()).toBe(0)
  }, 180_000)

  it('counts a deleted line that was filed as work, and keeps the work', async () => {
    // A title of its own, because the test above already filed one called "- baseline" and this one
    // looks its record up by name. Titles may repeat in the product since 17 August 2026; what
    // could not tell two records apart is this test.
    const id = await newPlan('Losing a binding', '- reprint the mount\n- gaze')
    const bound = (await storedLines(id))[0]!
    const filed = await fetch(
      `http://127.0.0.1:${apiPort}/api/plans/${id}/lines/${bound.id}/file-as-work`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'task', workspaceId: 'default' }),
      },
    )
    expect(filed.status, await filed.clone().text()).toBe(201)
    const recordId = (await storedLines(id))[0]!.recordId!
    expect(recordId).not.toBeNull()

    await openPlan(id)
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Delete')
    await waitForStored()

    await page.waitForSelector('.pw-lost')
    const lost = await page.locator('.pw-lost').innerText()
    // CRITERION CHANGE, as decided: the panel counts the lost line rather than explaining that the
    // work still exists; the record read below is what proves it does.
    expect(lost).toContain(t('planWriting.lostCount', { n: 1 }))
    expect(lost).toContain('- reprint the mount')

    const record = await fetch(`http://127.0.0.1:${apiPort}/api/records/${recordId}`)
    expect(record.status).toBe(200)
  }, 180_000)
})

// ============================================================================ the save state

/**
 * THE PAGE NEVER SAYS STORED WHILE A CHARACTER IS STILL ONLY IN THE BROWSER.
 *
 * This is invariant 1 on the one word this page says about itself, and it was a real defect: a
 * keystroke that arrived while a save was already on its way left the word "Stored." on screen
 * with five characters unsent. It is measured by making every save take more than a second, so the
 * race happens every time instead of once in ten.
 */
describe('the word "Stored." is only ever true', () => {
  it('waits for the keystrokes typed while a save was on its way', async () => {
    const id = await newPlan('Typed over a slow line')
    await page.route('**/api/plans/*/body', async (route) => {
      await sleep(1_200)
      await route.continue()
    })
    try {
      await openPlan(id)
      await page.locator('.pw-box').click()

      await page.keyboard.type('abc')
      // THE TIMING IS THE WHOLE TEST, so it is written out. The first save starts 600ms after the
      // last keystroke and is held above for 1200ms, so it comes back at about 1800ms. Typing at
      // 1400ms starts a fresh 600ms wait that ends at about 2000ms — after the first save has
      // already come back. That is the exact window in which the page used to say "Stored."
      await sleep(1_400)
      await page.keyboard.type('def')

      await waitForStored()
      expect(await storedBody(id)).toBe('abcdef')
    } finally {
      await page.unroute('**/api/plans/*/body')
    }
  }, 120_000)

  /** A SAVE THAT FAILS KEEPS EVERY CHARACTER AND SAYS SO. Nothing is thrown away. */
  it('says loudly that nothing is stored when the save cannot go through', async () => {
    const id = await newPlan('A save that fails')
    await page.route('**/api/plans/*/body', (route) => route.abort())
    try {
      await openPlan(id)
      await page.locator('.pw-box').click()
      await page.keyboard.type('a paragraph nobody wants to lose')
      await page.waitForSelector('.px-error', { timeout: 20_000 })
      const said = await page.locator('.px-error').innerText()
      expect(said).toContain('not stored')
      // AND THE WORDS ARE STILL THERE.
      expect(await inBox()).toBe('a paragraph nobody wants to lose')
    } finally {
      await page.unroute('**/api/plans/*/body')
    }
  }, 120_000)
})

// ============================================================================ the two presses

/**
 * SAVE AND DONE, AND THE HOLE DONE CLOSES.
 *
 * Both are there for one reason: an interface does not remove useful
 * physical affordances merely because the automatic mechanism usually works. Autosave stays; these
 * are added beside it.
 *
 * EVERY ONE OF THESE READS A SENTENCE THAT ONLY THE PRESS PRODUCES. The autosave status line says
 * "Stored." and nothing else; the press writes into `.pw-said`. So a test that finds a sentence
 * there has proved the press did something, not that the page eventually saved anyway.
 */
describe('the Save now press and the Save and close press', () => {
  /** What the last press said, once it has said anything. */
  async function whatThePressSaid(): Promise<string> {
    await page.waitForSelector('.pw-said', { timeout: 20_000 })
    return page.locator('.pw-said').innerText()
  }

  it('says there was nothing to save, rather than sitting there silently', async () => {
    const id = await newPlan('Nothing to save', '- already written\n')
    await openPlan(id)
    await waitForStored()
    // Nothing has been pressed, so there is no answer on the page yet.
    expect(await page.locator('.pw-said').count()).toBe(0)

    await page.getByRole('button', { name: 'Save now', exact: true }).click()
    expect(await whatThePressSaid()).toContain('Nothing to save')
    // And it is still true afterwards.
    expect(await storedBody(id)).toBe('- already written\n')
  }, 120_000)

  /**
   * IT FORCES THE SAVE RATHER THAN WAITING OUT THE PAUSE, AND SAYS WHAT WAS STORED.
   *
   * The save is held for 1200ms so the word "Storing…" is on screen long enough to read. The press
   * happens within the 600ms the autosave timer would have waited, so a page that is saving at that
   * moment was made to by the press and not by the timer.
   *
   * PRESSING THE BUTTON ALSO TAKES THE FOCUS OUT OF THE BOX, and leaving the box forces a save too.
   * So this proves the plan is stored at once rather than after the pause; it does not separate the
   * two mechanisms, and it does not need to — "answers Ctrl+S with the same save as the press"
   * below uses a key, which blurs nothing, and proves the forced save on its own.
   */
  it('stores at once instead of waiting out the pause, and says what it stored', async () => {
    const id = await newPlan('Forced')
    await page.route('**/api/plans/*/body', async (route) => {
      await sleep(1_200)
      await route.continue()
    })
    try {
      await openPlan(id)
      await page.locator('.pw-box').click()
      await page.keyboard.type('- force it')
      await page.getByRole('button', { name: 'Save now', exact: true }).click()
      await page.waitForFunction(
        () => document.querySelector('.pw-say')?.textContent?.trim() === 'Storing…',
        undefined,
        { timeout: 5_000 },
      )

      const said = await whatThePressSaid()
      expect(said).toContain('Saved the writing')
      expect(said).toContain('1 line')
      expect(await storedBody(id)).toBe('- force it')
    } finally {
      await page.unroute('**/api/plans/*/body')
    }
  }, 120_000)

  it('Save and close stores what is in the box and goes back to the plans list', async () => {
    const id = await newPlan('Save and close goes back')
    await openPlan(id)
    await page.locator('.pw-box').click()
    await page.keyboard.type('- the last thing I typed')

    await page.getByRole('button', { name: 'Save and close', exact: true }).click()
    await page.waitForURL((url) => url.hash === '#/plans', { timeout: 20_000 })
    expect(await storedBody(id)).toBe('- the last thing I typed')
  }, 120_000)

  /** IT REFUSES TO LEAVE WITH WORDS UNSAVED, and says why rather than going quietly. */
  it('Save and close stays put when the save fails, and says why', async () => {
    const id = await newPlan('Save and close cannot leave')
    await page.route('**/api/plans/*/body', (route) => route.abort())
    try {
      await openPlan(id)
      await page.locator('.pw-box').click()
      await page.keyboard.type('a paragraph nobody wants to lose')
      await page.getByRole('button', { name: 'Save and close', exact: true }).click()

      expect(await whatThePressSaid()).toContain('still here')
      // Still on the plan, and every character still in the box.
      expect(page.url()).toContain(`#/plans/${id}`)
      expect(await inBox()).toBe('a paragraph nobody wants to lose')
    } finally {
      await page.unroute('**/api/plans/*/body')
    }
  }, 120_000)

  /**
   * THE MEASURED 600ms HOLE, CLOSED.
   *
   * Leaving this page by a link is a hash change, a hash change does not fire `beforeunload`, and
   * the unmount used to call `clearTimeout` and stop there — so everything typed in the last 600ms
   * went nowhere and nothing said so. Leaving now SENDS the save that is owed.
   */
  it('does not lose the last characters when you leave the page while typing', async () => {
    const id = await newPlan('Leaving while typing', '- first\n')
    await openPlan(id)
    await waitForStored()
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('- typed and then I left')

    // STRAIGHT OUT, INSIDE THE 600ms THE AUTOSAVE IS STILL WAITING. That window is the whole test:
    // leave after it and the autosave has already stored the characters, and this would pass with
    // the fix deleted. So the gap is measured and the test fails if it was too slow, rather than
    // quietly proving nothing. The hash is set rather than the breadcrumb pressed because pressing
    // a link takes longer than the window it has to happen inside.
    const at = Date.now()
    await page.evaluate(() => {
      window.location.hash = '#/plans'
    })
    const gap = Date.now() - at
    expect(gap, 'the page must be left inside the 600ms the autosave waits, or this test proves nothing').toBeLessThan(
      600,
    )
    await page.waitForURL((url) => url.hash === '#/plans', { timeout: 20_000 })

    let stored = ''
    for (let at = 0; at < 40; at += 1) {
      stored = await storedBody(id)
      if (stored.includes('typed and then I left')) break
      await sleep(250)
    }
    expect(stored).toBe('- first\n- typed and then I left')
  }, 120_000)
})

// ============================================================================ what is on screen

/**
 * ONE CONTROL, THREE LAYOUTS, AND THE WRITING AT FULL WIDTH AT REST.
 *
 * The owner, twice. First: "The current permanent split between raw Markdown on the left and
 * rendered Markdown on the right is not very useful to me." Then, after the pane that replaced it:
 * "when I want the Table, using the second pane for the Table is much more valuable than
 * permanently duplicating Markdown rendering. The writing surface should be able to return to full
 * width when no second view is needed."
 *
 * So the second column is the planning table, the writing goes back to full width in one press, and
 * the choice is remembered. These tests measure all three, and they measure the last one across a
 * real page load because a setting you have to choose again every time is not a setting.
 *
 * WHAT A PLAN OPENS ON CHANGED ON 18 AUGUST 2026, and this file used to encode the old answer.
 * It opened on the writing alone. The writing surface is one box a person types in, and a box holds
 * no element per line — so a plan opened on it carried nought things a person could point at, and
 * the only way to leave a comment on a line was to know to press Table first. Counted in Chromium.
 * A plan now opens with the table beside the writing, where each line is a row that says which line
 * it is. `OPENS_ON` in OnePlanPage.tsx is where that is decided and argued.
 *
 * THE FULL-WIDTH WRITING IS NOT BROKEN BY THAT and the test below is what holds it: the writing still
 * returns to full width, in one press, with no table on the page, and the choice is still
 * remembered across a reload.
 */
describe('what is on screen, and how wide the writing is', () => {
  const PLAN = ['# Robotics', '## Tray clamp', '- replace the gripper', '- reprint the mount'].join('\n')

  /** How many columns the plan's grid is drawn in right now. */
  function columns(): Promise<number> {
    return page.locator('.op-plan').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  }

  /**
   * A PLAN OPENS WITH ITS LINES ON THE SCREEN AS LINES, AND FULL WIDTH IS ONE PRESS AWAY.
   *
   * Two promises, and both are here because each one alone is satisfiable by a build the owner
   * would reject. Opening with the table is what makes a line something a person can point at and
   * talk to an agent about. Full width in one press, with no table on the page at all, is the second
   * promise — and "no table on the page" rather than a table drawn narrow,
   * because a table drawn and hidden is a second copy of the plan a screen reader still reads out.
   */
  it('opens with the table beside the writing, and gives the writing back the whole width in one press', async () => {
    const id = await newPlan('At rest', PLAN)
    await openPlan(id)

    expect(await page.locator('.op-plan').getAttribute('data-shown')).toBe('both')
    expect(await columns()).toBe(2)
    expect(await page.locator('.pw-box').count()).toBe(1)
    // EVERY LINE SAYS WHICH LINE IT IS. This is the whole reason a plan opens here: a right-click
    // on a row, or a press of "Ask agent", has a line to be about.
    await waitForTable()
    expect(
      await page.locator('.pt-table tbody tr[data-target^="planLine/"]').count(),
      'the plan opened on a view where no line says which line it is',
    ).toBe(4)

    await showLayout('Writing')
    expect(await columns()).toBe(1)
    expect(await page.locator('.pw-box').count()).toBe(1)
    expect(await page.locator('.pt').count()).toBe(0)
  }, 120_000)

  /**
   * THE SECOND COLUMN IS THE TABLE, WITH EVERY ITEM AT THE DEPTH IT WAS WRITTEN AT.
   *
   * And it is not the document again: the hashes the person typed are in the box and not in the
   * table. That check is what a rendering of the same Markdown would fail.
   */
  it('puts the table in the second column, at the depth the person wrote', async () => {
    const id = await newPlan('Beside the writing', PLAN)
    await openPlan(id)
    await showLayout('Writing and table')
    await waitForTable()

    expect(await columns()).toBe(2)
    expect(await page.locator('.pw-box').count()).toBe(1)

    const rows = await tableBoxes()
    for (const words of ['Robotics', 'Tray clamp', 'replace the gripper', 'reprint the mount']) {
      expect(rows, words).toContain(words)
    }
    // The markers are the writing's; the table holds the words.
    expect(await table().innerText()).not.toContain('##')

    // THE DEPTH THE PERSON WROTE, SAID IN WORDS AS WELL AS DRAWN AS AN INDENT. An indent alone
    // states a fact by position only, so every row also carries its level for a reader who cannot
    // see it: Robotics top, Tray clamp 2, the bullets 3. The pixels are measured in the full-width test
    // below, which is where there is room to tell one indent from another.
    const said = await table().innerText()
    for (const level of ['top', 'level 2', 'level 3']) expect(said, level).toContain(level)
    await showLayout('Writing')
  }, 180_000)

  /**
   * THE TABLE SHEDS COLUMNS WHEN THE COLUMN IT IS IN IS TOO NARROW FOR THEM, and the window has no
   * say. IT IS THE SAME TABLE EITHER WAY.
   *
   * MEASURED DEFECT, TWICE OVER. The arrangement used to be chosen from the width of the WINDOW: at
   * a 1440px window the window said wide, so beside the writing box the table drew its full grid
   * inside a column of 577px. That was fixed by measuring the table's own box — and the fix drew a
   * CARD per item there instead, with a label beside every value, at 557px, which is a desk. On a
   * plan of fourteen items the cards were 105px tall and six filled the screen; the table's rows are
   * 27px and all fourteen are on it. The cards are gone. What a narrow column does now is draw
   * fewer columns.
   *
   * THIS TEST MEASURES BOTH THE ROOM AND THE COLUMNS, at one window size, so it cannot pass by the
   * window having changed. Beside the writing the column is narrow and some columns are left off; on
   * its own the table is wide and draws them all. Same window, same plan, two answers, ONE
   * arrangement.
   *
   * WHICH COLUMNS ARE SHED CHANGED IN ROUND FIVE, and this test used to encode the old answer.
   * `design/ROUND-FIVE.md` decision 6: *How big*, *Time given* and *Project* survive narrowing. They
   * are the three the Table must keep, and dropping them below 760px is what made the Table
   * read as broken — beside the writing box the table measures 659px, so none of them was ever seen
   * at all. What a narrow table sheds now is the writer's OWN pipe-table columns, and it still
   * names every one it left off with the press that draws them.
   */
  it('sheds columns when its own column is narrow, and never becomes a different arrangement', async () => {
    // A PIPE TABLE OF THE WRITER'S OWN, so that with every column drawn the table is certainly wider than
    // half a 1440px window. Without it the seven Mole Office columns fitted in 640px and the assertion
    // about the box scrolling passed on a table that had not scrolled.
    const WITH_A_TABLE = [
      PLAN,
      // AN ORDINARY SENTENCE OF AN ITEM, so the words column is greedy and the record column has to
      // ask for its own width. Every item in PLAN is three words long, which leaves the record
      // column so much room that a cell laid out wrongly still fits on one line.
      '- measure the offset at the handover pose and log it',
      '',
      '| Step | Owner | Days | Where |',
      '| --- | --- | --- | --- |',
      '| baseline | Sam | 5d | the lab |',
    ].join('\n')
    const id = await newPlan('Room to draw in', WITH_A_TABLE)
    await openPlan(id)

    await showLayout('Writing and table')
    await waitForTable()
    await waitForRoom('narrow')
    const beside = await table().evaluate((el) => el.clientWidth)
    const narrowHeads = await headings()
    // ONE ARRANGEMENT. There is a table here, at every width, and no second drawing of these rows.
    expect(await page.locator('.pt-table').count(), `beside the writing the table has ${beside}px`).toBe(1)
    expect(await page.locator('.pt-stack, .pt-card').count(), 'a second arrangement came back').toBe(0)
    // EVERY COLUMN PANELX SUPPLIES IS HERE, at 659px, which is the width the owner was using when
    // they reported three of them missing.
    // RENAMED 17 AUGUST 2026 by the owner: Task, Type, Estimate, Schedule, Project, Note. The Type
    // heading carries the help mark that holds what each type means, which is the "?" here.
    expect(narrowHeads, `beside the writing the table has ${beside}px`).toEqual([
      'Picked',
      'Task',
      'Type',
      'Estimate',
      'Schedule',
      'Project',
      'Note',
    ])
    // AND IT SAYS WHAT IT LEFT OFF. A column dropped without a word is a column the reader thinks
    // the product has not got. What is left off here is this plan's own table: its first heading is
    // the items' words, so its other three are the columns with nowhere to go.
    const said = await page.locator('.pt-missing').first().innerText()
    for (const gone of ['Owner', 'Days', 'Where']) expect(said, gone).toContain(gone)

    // ONE PRESS BRINGS THEM BACK, AND THE PAGE STILL DOES NOT SCROLL SIDEWAYS. The table's own box
    // scrolls instead. Measured before this was true: every row carries a screen-reader span saying
    // its level, that span is positioned absolutely, and with nothing positioned between it and the
    // page it escaped the box that clips the table — so the whole window scrolled 142px.
    await page.getByRole('button', { name: 'Show every column' }).click()
    // WAIT FOR THE COLUMNS THAT WERE MISSING, by name. A count is not enough any more: the narrow
    // table already draws seven, so "more than four" was true before the press and the measurement
    // below would have been taken off the table that had not changed yet.
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.pt-table thead th')].some(
          (th) => (th.textContent ?? '').trim() === 'Owner',
        ),
      undefined,
      { timeout: 30_000 },
    )
    const scrolling = await page.evaluate(() => {
      const wrap = document.querySelector('.pt-wrap') as HTMLElement
      return {
        page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        box: wrap.scrollWidth > wrap.clientWidth,
      }
    })
    expect(scrolling.box, 'the table fitted after all, so this proves nothing').toBe(true)
    expect(scrolling.page, 'the page scrolled sideways').toBe(false)
    await page.getByRole('button', { name: 'Fit it to this width' }).click()
    await waitForRoom('narrow')

    await showLayout('Table')
    await waitForTable()
    await waitForRoom('wide')
    const alone = await table().evaluate((el) => el.clientWidth)
    const wideHeads = await headings()
    expect(await page.locator('.pt-table').count(), `on its own the table has ${alone}px`).toBe(1)
    for (const gone of ['Estimate', 'Schedule', 'Project', 'Owner', 'Days', 'Where']) {
      expect(wideHeads, `${gone} at ${alone}px`).toContain(gone)
    }
    // Nothing is missing on its own, so nothing is named as missing.
    expect(await page.locator('.pt-missing').first().innerText()).not.toContain('No room here')

    // THE THRESHOLD IS PINNED BY THE PAIR ABOVE AND NOT WRITTEN DOWN HERE. A number in this file
    // would be the same fact in two places, and one changed without the other would leave this
    // green. Instead two column sets came back at two widths in one window, so the width the table
    // sheds at has to lie between them — which is the claim, and all of it.
    expect(beside, `${beside}px beside the writing, ${alone}px on its own`).toBeLessThan(alone)
    expect(narrowHeads.length).toBeLessThan(wideHeads.length)
    await showLayout('Writing')
  }, 180_000)

  /**
   * ON A PHONE IT IS STILL A TABLE, AND THE WORDS ARE STILL WORDS.
   *
   * This is where the arrangement that was deleted was aimed, so it is where the one that replaced
   * it has to be measured. A card per item at 390 was 128px tall and three of them filled the
   * screen. The table's rows are what a person scans.
   *
   * TWO THINGS ARE EASY TO GET WRONG HERE AND BOTH ARE MEASURED. The words wrap anywhere, so their
   * smallest possible width is one character: asked for a share of a 390px screen the browser took
   * the column down to about 50px and broke "Tray clamp" into "Gripp" and "er". And the box that holds
   * the table scrolls sideways when it must — the PAGE never does, anywhere in this product.
   */
  it('draws a table a person can read at 390, scrolling its own box and never the page', async () => {
    const id = await newPlan('On a phone', PLAN)
    await page.setViewportSize({ width: 390, height: 900 })
    try {
      await openPlan(id)
      await showLayout('Table')
      await waitForTable()
      await waitForRoom('narrow')

      const narrowest = await page
        .locator('.pt-table .pi-words-box')
        .evaluateAll((all) => Math.min(...all.map((one) => one.getBoundingClientRect().width)))
      expect(narrowest, `the narrowest box of words is ${narrowest}px`).toBeGreaterThan(96)

      // THE MARK AND THE PRESS IN A RECORD CELL SHARE A LINE, which is what keeps an unfiled row
      // one line tall. It is measured on the cell rather than on the row's height, because a row is
      // also as tall as its words and this claim is not about the words. Where they wrapped, the
      // press dropped under the mark on every unfiled row.
      const onOneLine = await page.locator('.pt-unfiled').first().evaluate((cell) => {
        const tops = [...cell.children].map((one) => one.getBoundingClientRect().top)
        return tops.every((top) => Math.abs(top - tops[0]!) < 4)
      })
      expect(onOneLine, 'the mark and the press in a record cell are on two lines').toBe(true)

      const seen = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.pt-table tbody > tr[data-kind]')]
        const wrap = document.querySelector('.pt-wrap') as HTMLElement
        return {
          rows: rows.length,
          visible: rows.filter((one) => {
            const box = one.getBoundingClientRect()
            return box.top >= 0 && box.bottom <= window.innerHeight
          }).length,
          page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          box: wrap.scrollWidth > wrap.clientWidth,
        }
      })
      expect(seen.visible, `${seen.visible} of ${seen.rows} items are on a 390px screen`).toBe(seen.rows)
      expect(seen.box, 'the table fitted, so the claim below proves nothing').toBe(true)
      expect(seen.page, 'the page scrolled sideways at 390').toBe(false)
      await showLayout('Writing')
    } finally {
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 180_000)

  /**
   * THE TABLE GETS THE LARGER SHARE OF THE TWO COLUMNS, AND THE WRITING STAYS A LINE YOU CAN READ.
   *
   * They used to be exactly half each. Measured at a 1400px window: 557px of monospace document and
   * 557px of a planning table with seven columns and two of the writer's own. A document does not
   * get better past its reading measure and a table does, so the split is 3 to 4 now.
   *
   * BOTH HALVES ARE MEASURED, and that is the point of the second assertion: giving the table the
   * room by squeezing the writing to a ribbon would pass the first one on its own. The floor is 45
   * characters, which is below every measure a fixed-width editor is read at and well above the
   * width at which a pipe table stops lining up.
   */
  it('gives the table the larger half and keeps the writing wide enough to read', async () => {
    const id = await newPlan('Two columns', PLAN)
    await openPlan(id)
    await showLayout('Writing and table')
    await waitForTable()

    const measured = await page.evaluate(() => {
      const box = document.querySelector('.pw-box') as HTMLElement | null
      const grid = document.querySelector('.op-plan') as HTMLElement | null
      if (box === null || grid === null) return null
      // THE TWO GRID TRACKS, and not the two boxes inside them. The writing box has a border and
      // the table has not, so comparing the boxes made a fifty-fifty split read as the table being
      // two pixels wider — and this test passed on the very split it was written to forbid.
      const tracks = getComputedStyle(grid)
        .gridTemplateColumns.split(' ')
        .map((one) => parseFloat(one))
      // HOW MANY CHARACTERS FIT, from the box's own font rather than from a number in a test. A
      // fixed-width font has one advance, so the count is the inside width divided by it.
      const style = getComputedStyle(box)
      const ruler = document.createElement('canvas').getContext('2d')
      if (ruler === null) return null
      ruler.font = `${style.fontSize} ${style.fontFamily}`
      const advance = ruler.measureText('M').width
      const inside =
        box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      return { writing: tracks[0]!, table: tracks[1]!, chars: Math.floor(inside / advance) }
    })
    expect(measured, 'neither column was on the page').not.toBeNull()
    const { writing, table: tableWide, chars } = measured!
    expect(tableWide, `the writing has ${writing}px and the table ${tableWide}px`).toBeGreaterThan(writing)
    expect(chars, `the writing box holds ${chars} characters a line at ${writing}px`).toBeGreaterThanOrEqual(45)
    await showLayout('Writing')
  }, 180_000)

  /**
   * THE HEADINGS ARE WRITTEN ONCE, HOWEVER MANY ROWS THERE ARE, and that is the density.
   *
   * The arrangement this replaced put "Pick", "What it is", "Where it stands" and "My note" on every
   * card. Measured on a plan of fourteen items beside the writing box: fifty-six labels on screen
   * against four here. Repeated labels must go, and a table's row of headings is
   * how a table has never had them.
   */
  it('writes each column heading once, whatever the plan holds', async () => {
    // A DOZEN ITEMS, WRITTEN HERE RATHER THAN SHARED, because the claim is about what happens as
    // rows are added: four labels on twelve rows, not four per row. A four-item plan would leave
    // this green with a label on every card.
    const TWELVE = [
      '# Robotics',
      '## Tray clamp',
      // A HEADING IS NOW AT MOST FIVE WORDS, so this fixture reads "replace the left gripper" where it
      // read "replace the gripper on the left arm" (7 words) before plan budgets landed. The refusal
      // is the new rule and this test is about how many times a column heading is written, so the
      // fixture was shortened rather than the rule weakened. P2 of design/planning/ACCEPTANCE.md.
      '### replace the left gripper',
      '- reprint the mount at 0.2mm layers',
      '- [ ] measure the offset at the handover pose',
      '- [x] order the spare fingers',
      '### Wrist',
      '1. fit the new wrist bearing',
      '2. log the offsets into the calibration file',
      '## Perception',
      '- retrain the grasp classifier on the new set',
      '- [ ] check the depth camera against the tape measure',
    ].join('\n')
    const id = await newPlan('One heading each', TWELVE)
    await openPlan(id)
    await showLayout('Writing and table')
    await waitForTable()
    await waitForRoom('narrow')

    const rows = await page.locator('.pt-table tbody > tr[data-kind]').count()
    expect(rows, 'the plan drew too few rows for this to mean anything').toBeGreaterThan(5)

    /**
     * WHAT CHANGED ON 16 AUGUST 2026, AND WHY THE COUNTING MOVED RATHER THAN THE NUMBER.
     *
     * The table now writes one line above itself naming any column its box cannot show in full, so
     * a person at 1440 with the writing box beside the table is told that "My note" exists off the
     * right-hand edge and can press its name to bring it in. That line writes a heading a second
     * time inside `.pt`, which is what this test used to count, and it is not the defect this test
     * exists to catch: the defect is a label repeated on every ROW, which is what the arrangement
     * before this one did — fifty-six labels on fourteen items.
     *
     * So the claim is now asserted where it lives and it is asserted harder. Each heading is
     * written exactly ONCE inside the table itself, however many rows there are, and the ONLY other
     * place in the whole plan table it may appear is that one line, at most once. Anything else —
     * a heading in a cell, a heading per row, a second line naming columns — fails.
     */
    const namedAboveTheTable = async (): Promise<string> => {
      const line = page.locator('.pt-reach')
      return (await line.count()) === 0 ? '' : line.innerText()
    }
    const times = (text: string, word: string) => text.split(word).length - 1

    // THE SECOND WRITING HAS TO BE REAL, or this test is back to counting one number in one place.
    //
    // IT MOVED TO 390 ON 21 AUGUST 2026, AND THE GUARD IS WHAT MOVED IT. This ran at 1440 beside the
    // writing box, where the table's box is 659px and its columns came to 1105px, so three of them
    // were named above the table. `columnWidths` in PlanTable.tsx now fits the columns to the room,
    // so at 1440 nothing is off the edge and there is no second writing to count. The line above the
    // guard said what to do if a later layout ever fitted them all, and this is that. At 390 six
    // columns need 588px in a 366px box and no squeezing gets them in, so the line is real there.
    await page.setViewportSize({ width: 390, height: 900 })
    await sleep(900)
    const named = await namedAboveTheTable()
    expect(named, 'no column is off the edge at 390, so this proves nothing about the line that names one').toContain(
      'Off the edge of this table',
    )

    const inTheTable = await page.locator('.pt-table').innerText()
    const everywhere = await table().innerText()
    for (const heading of ['Task', 'Estimate', 'Note']) {
      expect(times(inTheTable, heading), `${heading} inside the table itself, on ${rows} rows`).toBe(1)
      expect(times(named, heading), `${heading} above the table`).toBeLessThanOrEqual(1)
      expect(
        times(everywhere, heading) - times(named, heading),
        `${heading} is written somewhere in the plan table that is neither the heading row nor the line naming a column off the edge`,
      ).toBe(1)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await sleep(600)
    await showLayout('Writing')
  }, 180_000)

  /**
   * THE TABLE ON ITS OWN IS THE THIRD SETTING, and the writing box is then off the page.
   *
   * Off the page rather than hidden, for the same reason as above: a box holding a document nobody
   * can see is a second copy nothing keeps in step.
   */
  it('shows the table alone, at full width, with no writing box', async () => {
    const id = await newPlan('The table alone', PLAN)
    await openPlan(id)
    await showLayout('Table')
    await page.waitForSelector('.pt-table', { timeout: 30_000 })

    expect(await columns()).toBe(1)
    expect(await page.locator('.pw-box').count()).toBe(0)
    // The plan's name is still writable, because it is written in on every setting.
    expect(await page.locator('.op-title').count()).toBe(1)

    // THE DEPTH THE PERSON WROTE, IN PIXELS, which is what the wide layout draws it as:
    // Robotics 0, Tray clamp 1, bullets 2. Beside the writing the same depth is said in words.
    const insets = await page.locator('.pt-table .pt-indent').evaluateAll((els) =>
      els.map((el) => Math.round(parseFloat(getComputedStyle(el).width))),
    )
    expect(insets).toEqual([0, 14, 28, 28])
    await showLayout('Writing')
  }, 180_000)

  /**
   * THE CHOICE IS REMEMBERED ACROSS A PAGE LOAD, AND SO IS THE RESTING STATE.
   *
   * Both halves are measured. A build that remembered nothing would fail the first half; a build
   * that remembered a layout and could never get back to full-width writing would fail the second.
   */
  it('remembers which layout you chose, and lets you go back to writing alone', async () => {
    const id = await newPlan('Remembering', PLAN)
    await openPlan(id)
    await showLayout('Writing and table')
    expect(await columns()).toBe(2)

    await loadAgain()
    expect(await page.locator('.op-plan').getAttribute('data-shown')).toBe('both')
    expect(await columns()).toBe(2)

    await showLayout('Writing')
    await loadAgain()
    expect(await page.locator('.op-plan').getAttribute('data-shown')).toBe('writing')
    expect(await page.locator('.pt').count()).toBe(0)
  }, 180_000)

  /**
   * A LINE IS FILED AS REAL WORK FROM THE TABLE BESIDE THE BOX.
   *
   * This is the step of the owner's loop that had no screen at all — a written line becoming
   * canonical work — and it now happens in the column beside the writing rather than on a page of
   * its own.
   */
  it('files an item as real work from the table beside the box', async () => {
    const id = await newPlan('Filing from the table', '- calibrate the wrist\n')
    await openPlan(id)
    await showLayout('Writing and table')
    await waitForTable()

    // RENAMED 17 AUGUST 2026: the press is "Track", a short plain label;
    // "Make it real work" was heavy and on the screen once per untracked row.
    await table().getByRole('button', { name: 'Track' }).first().click()
    await page.locator('.pi-form').getByRole('button', { name: 'Track', exact: true }).click()

    await page.waitForSelector('.pi-stands', { timeout: 30_000 })
    const after = await storedLines(id)
    expect(after[0]!.recordId).not.toBeNull()
    await showLayout('Writing')
  }, 180_000)
})

// ============================================================================ the name is a save too

/**
 * THE WORD ON SCREEN IS ABOUT THE WHOLE PLAN, NAME INCLUDED.
 *
 * A person whose job was to try to lose work reported losing it six times, and in four of those the
 * page said "Stored." at the moment the work was gone. The plainest of the four: rename the plan,
 * close the tab, and the rename is gone. The name saved on blur and had no unsaved state of its own,
 * the status line beside it was about the document, and the tab-close guard read the document's
 * state — so the browser asked nothing.
 *
 * That was one fact worked out in two places. `usePlanWriting` now holds both.
 */
describe('the plan’s name is saved by the same thing that saves the words', () => {
  /** The plan's name as the server holds it right now. */
  async function storedName(id: string): Promise<string> {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/plans/${id}/blocks`)
    if (!res.ok) throw new Error(`reading the plan back answered ${res.status}: ${await res.text()}`)
    return ((await res.json()) as { plan: { title: string } }).plan.title
  }

  /** Whether the browser would ask before closing the tab, asked the way the browser asks. */
  function tabCloseIsGuarded(): Promise<boolean> {
    return page.evaluate(() => {
      const ask = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(ask)
      return ask.defaultPrevented
    })
  }

  /**
   * THE FOUR-IN-SIX DEFECT, MEASURED THE WAY IT HAPPENED.
   *
   * The check is made INSIDE the 600ms the autosave waits, which is the window the rename used to
   * live in for ever. Both halves have to hold: the page must not say "Stored.", and the browser
   * must be willing to stop the close.
   */
  it('says it is not stored while a rename is unsaved, and stops the tab closing on it', async () => {
    const id = await newPlan('The name before')
    await openPlan(id)
    await waitForStored()
    expect(await tabCloseIsGuarded(), 'the guard was already on before anything was typed').toBe(false)

    await page.locator('.op-title').click()
    await page.keyboard.press('End')
    const at = Date.now()
    await page.keyboard.type(' and after')
    const say = await page.locator('.pw-say').innerText()
    const guarded = await tabCloseIsGuarded()
    expect(
      Date.now() - at,
      'the check must happen inside the 600ms the autosave waits, or it proves nothing',
    ).toBeLessThan(600)

    expect(say.trim()).toBe('Not stored yet.')
    expect(guarded, 'the browser would have let the tab close over an unsaved rename').toBe(true)

    // AND IT SAVES ITSELF, on the same timer as the words, with nothing pressed and nothing blurred.
    await waitForStored()
    expect(await storedName(id)).toBe('The name before and after')
    expect(await tabCloseIsGuarded()).toBe(false)
  }, 120_000)

  /**
   * LEAVING THE PAGE MID-RENAME STILL STORES IT.
   *
   * The same 600ms hole the document had. Leaving by the browser's Back button is a hash change,
   * which does not fire `beforeunload`, so the guard above cannot help — the unmount has to send
   * what is owed, and now it owes the name as well.
   */
  it('stores a rename when the page is left inside the 600ms the autosave waits', async () => {
    const id = await newPlan('Left mid rename')
    await openPlan(id)
    await waitForStored()
    await page.locator('.op-title').click()
    await page.keyboard.press('End')

    const at = Date.now()
    await page.keyboard.type('!')
    await page.evaluate(() => {
      window.location.hash = '#/plans'
    })
    expect(Date.now() - at, 'the page must be left inside the 600ms, or this test proves nothing').toBeLessThan(600)
    await page.waitForURL((url) => url.hash === '#/plans', { timeout: 20_000 })

    let name = ''
    for (let tries = 0; tries < 40; tries += 1) {
      name = await storedName(id)
      if (name.endsWith('!')) break
      await sleep(250)
    }
    expect(name).toBe('Left mid rename!')
  }, 120_000)

  /**
   * THE NAME IS A LABELLED FIELD AND IT LOOKS LIKE ONE.
   *
   * Three people who had never seen Mole Office typed their whole plan into it, because it was an
   * unlabelled text area drawn at heading size with no border and no background, sitting exactly
   * where a page heading goes. One of them lost 1,081 characters. All three signals are checked,
   * because any one of them alone is what made it look like a heading.
   */
  it('draws the name as a field with a visible label, a border and a background', async () => {
    const id = await newPlan('A name that looks like one')
    await openPlan(id)
    const drawn = await page.evaluate(() => {
      const box = document.querySelector('.op-title') as HTMLTextAreaElement
      const label = document.querySelector(`label[for="${box.id}"]`)
      const style = getComputedStyle(box)
      return {
        label: label === null ? null : (label.textContent ?? '').trim(),
        border: style.borderTopWidth,
        background: style.backgroundColor,
      }
    })
    expect(drawn.label, 'nothing on screen says what this control is').toBe('Name of this plan')
    expect(drawn.border, 'the field has no visible edge, so it reads as a heading').not.toBe('0px')
    expect(drawn.background, 'the field has no background, so it reads as a heading').not.toBe('rgba(0, 0, 0, 0)')
  }, 120_000)

  /**
   * AND IT SAYS SOMETHING WHEN WHAT IS IN IT HAS STOPPED BEING A NAME.
   *
   * The last catch for the person who is already typing their plan into it. It is a note and not a
   * refusal: Mole Office does not know that a long name is wrong, so it says what it noticed.
   * CRITERION CHANGE, as decided: it no longer goes on to say where the writing box is.
   */
  it('counts the characters when the name has become a document', async () => {
    const id = await newPlan('About to become a document')
    await openPlan(id)
    await page.locator('.op-title').click()
    await page.keyboard.press('End')
    await page.keyboard.type('x'.repeat(140))
    await page.waitForSelector('.op-title-note', { timeout: 10_000 })
    const note = await page.locator('.op-title-note').innerText()
    expect(note).toContain('characters long')
  }, 120_000)
})

// ============================================================================ answering a press

/**
 * A PRESS THAT CHANGES NOTHING ON SCREEN IS A PRESS THAT LOOKS BROKEN.
 *
 * Pressing Save is how a person checks their work is safe. The answer to the press used to have no
 * moment on it, so a second press produced the same characters in the same place and the screen
 * after the press was the screen before it. And the answer had no way to go: "Nothing to save. Every
 * character was already stored." was measured sitting underneath a red banner saying the writing was
 * not stored.
 */
describe('every press of Save is answered, and the answer does not outlive its plan', () => {
  it('changes the screen on a second press', async () => {
    const id = await newPlan('Pressed twice', '- one line\n')
    await openPlan(id)
    await waitForStored()

    await page.getByRole('button', { name: 'Save now', exact: true }).click()
    await page.waitForSelector('.pw-said', { timeout: 20_000 })
    const first = await page.locator('.pw-said').innerText()
    // A SECOND APART, so the two answers cannot share a clock second. A relative moment is what
    // this used to carry and it is why the second press showed nothing: anything under 45 seconds
    // old reads as "just now".
    await sleep(1_100)
    await page.getByRole('button', { name: 'Save now', exact: true }).click()
    await page.waitForFunction(
      (was) => (document.querySelector('.pw-said') as HTMLElement | null)?.innerText !== was,
      first,
      { timeout: 10_000 },
    )
    const second = await page.locator('.pw-said').innerText()
    expect(first).toContain('Nothing to save')
    expect(second).toContain('Nothing to save')
    expect(second, 'the second press left the screen exactly as it was').not.toBe(first)
  }, 120_000)

  it('takes the answer away as soon as the plan it was about changes', async () => {
    const id = await newPlan('An answer with a shelf life', '- one line\n')
    await openPlan(id)
    await waitForStored()
    await page.getByRole('button', { name: 'Save now', exact: true }).click()
    await page.waitForSelector('.pw-said', { timeout: 20_000 })
    expect(await page.locator('.pw-said').innerText()).toContain('Nothing to save')

    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('- and another')
    expect(
      await page.locator('.pw-said').count(),
      'the page still says every character was stored, over a character that is not',
    ).toBe(0)
  }, 120_000)

  /**
   * CTRL+S IS THE GESTURE EVERYBODY HAS, and the browser's own answer to it — a dialog offering to
   * save the page as a file — is a wrong answer on a page that saves.
   *
   * The press happens inside the 600ms the autosave waits, so a page that stored the characters at
   * that moment can only have been made to by the key.
   */
  it('answers Ctrl+S with the same save as the press', async () => {
    const id = await newPlan('Control S')
    await openPlan(id)
    await waitForStored()
    await page.locator('.pw-box').click()

    const at = Date.now()
    await page.keyboard.type('- saved with a key')
    await page.keyboard.press('Control+s')
    expect(
      Date.now() - at,
      'the key must be pressed inside the 600ms the autosave waits, or this proves nothing',
    ).toBeLessThan(600)

    await page.waitForSelector('.pw-said', { timeout: 20_000 })
    expect(await page.locator('.pw-said').innerText()).toContain('Saved the writing')
    expect(await storedBody(id)).toBe('- saved with a key')
  }, 120_000)

  /**
   * TAB LEAVING THE BOX IS A DECISION, AND THE PAGE SAYS SO.
   *
   * A plan is indented text, so Tab is the key a person reaches for, and it moves the focus out
   * instead. Keeping it that way is deliberate — a box that swallowed Tab would be a box a keyboard
   * could not leave — but a person who pressed it and lost their place had no way to know that. The
   * decision is written where the other keys are, which is behind the help mark on the box.
   */
  it('says what Tab does, where the other keys are explained', async () => {
    const id = await newPlan('Keys')
    await openPlan(id)
    const keys = await behindTheMark('What the keys do')
    // CRITERION CHANGE, as decided: the keys are one sentence, which names Tab with the others.
    expect(keys).toContain(t('planWriting.keysHint'))

    // And it is true: the focus leaves the box.
    await page.locator('.pw-box').click()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.className)).not.toContain('pw-box')
  }, 120_000)

  /**
   * THE WRITING BOX HAS NO LABEL ABOVE IT AND STILL HAS A NAME.
   *
   * It read "The plan itself", on the plan's own page, under a field already labelled "Name of this
   * plan", above the only writing box there is. A label tells one thing apart from another and there
   * was nothing to tell it apart from. What that label was really doing — stopping people typing
   * their plan into the name field — is done by the name field itself now.
   *
   * THE NAME SURVIVES ON THE CONTROL, because a box a screen reader cannot name is worse than a
   * label nobody needed. This test is what fails if somebody deletes the label and the name with it.
   */
  it('leaves the writing box named without printing a label over it', async () => {
    const id = await newPlan('No label needed')
    await openPlan(id)
    expect(await page.locator('label[for="pw-plan-body"]').count()).toBe(0)
    expect(await page.locator('.pw-write').innerText()).not.toContain('The plan itself')
    expect(await page.locator('#pw-plan-body').getAttribute('aria-label')).toBe('The plan itself')
  }, 120_000)

  /**
   * ENDING A PLAN IS ONE QUIET PRESS, NOT THREE DESTRUCTIVE ONES STANDING UNDER THE WRITING.
   *
   * "Mark it finished", "Mark it given up" and "Delete this plan" sat at the foot of every plan
   * under a heading, all the time. None of them is what anybody came for and one of them cannot be
   * undone. They are behind the heading now, and the heading is the press.
   */
  it('folds the three ways a plan ends behind one press', async () => {
    const id = await newPlan('Ending it')
    await openPlan(id)

    for (const press of ['Mark it finished', 'Mark it given up', 'Delete this plan']) {
      expect(await page.getByRole('button', { name: press }).count(), press).toBe(0)
    }
    const head = page.getByRole('button', { name: 'Ending this plan' })
    expect(await head.getAttribute('aria-expanded')).toBe('false')

    await head.click()
    for (const press of ['Mark it finished', 'Mark it given up', 'Delete this plan']) {
      expect(await page.getByRole('button', { name: press }).count(), press).toBe(1)
    }
    expect(await head.getAttribute('aria-expanded')).toBe('true')
  }, 120_000)
})

// ============================================================================ a way out, and a moment

/**
 * WHEN THE SAVE WILL NOT GO THROUGH, THERE IS SOMETHING TO DO OTHER THAN WAIT.
 *
 * The banner used to say "Do not close this tab until it says stored." A tester called that the
 * right sentence in the wrong place: it is a true instruction with no action in it, and a person
 * whose server is down cannot follow it for an hour. The retry stays. What is added is a way to get
 * the writing OUT of the browser.
 */
describe('getting the writing out of a save that will not go through', () => {
  it('downloads the plan, byte for byte, while the server is refusing it', async () => {
    const id = await newPlan('The server is down', '# Ports\n\n- check the Velodyne\n')
    await page.route('**/api/plans/*/body', (route) => route.abort())
    try {
      await openPlan(id)
      await page.locator('.pw-box').click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('- and the IMU')
      await page.waitForSelector('.px-error', { timeout: 20_000 })

      const arriving = page.waitForEvent('download', { timeout: 20_000 })
      await page.getByRole('button', { name: 'Download it as a file' }).click()
      const file = await arriving
      const where = await file.path()
      expect(readFileSync(where, 'utf8')).toBe('# Ports\n\n- check the Velodyne\n- and the IMU')

      // And what is on screen no longer only tells the person to sit there.
      const banner = await page.locator('.pw-fault').innerText()
      expect(banner).not.toContain('Do not close this tab')
      expect(banner).toContain('Copy the whole plan')

      // THE PRESSES DO NOT MOVE WHEN THEY ARE PRESSED. Pressing one takes the focus out of the box,
      // that starts a save, and anything that appeared above them moved them down between the mouse
      // going down and coming up — which swallowed the press and lost the way out. The retry note is
      // on screen at that moment, so its position is the thing being checked.
      const wasAt = await page.locator('.pw-out-acts').boundingBox()
      await page.getByRole('button', { name: 'Retry' }).click()
      const nowAt = await page.locator('.pw-out-acts').boundingBox()
      expect(nowAt?.y, 'the ways out moved while a save was running').toBe(wasAt?.y)
    } finally {
      await page.unroute('**/api/plans/*/body')
    }
  }, 120_000)

  /**
   * THE PAGE DOES NOT STATE A PRESENT TENSE IT HAS NOT CHECKED.
   *
   * Two tabs open on one plan both said "Stored." while one had just written over a line the other
   * still had on screen. The page never asks the server again while somebody is writing, because a
   * re-fetch would fight the caret. What it does instead is stop claiming the present: the three
   * words stay and the moment behind them is on screen.
   *
   * THE MOMENT IS ON SCREEN AND THE CAVEAT IS BEHIND THE MARK, which is the round-four weighting:
   * the reader acts on the moment and does not act on the explanation of it. Both halves are
   * measured, because quietening a distinction until it is gone is the failure this rule prevents.
   *
   * AND THE WRITE THAT USED TO FOLLOW IS NOW REFUSED. This test used to end by typing one character
   * into the stale tab and waiting for the word Stored — which is the lost update itself, and its
   * own comment said Mole Office could not fix it that pass. `design/ROUND-FIVE.md` decision 8 is that
   * pass: a plan refuses a write built on a copy somebody has already replaced. So the last block
   * asserts the refusal, that the other writer's line is still what the server holds, and that every
   * character typed here is still on the page.
   */
  it('says when it last had this plan from the server, and refuses to write over what it has not seen', async () => {
    const id = await newPlan('Two tabs', '- one line\n')
    await openPlan(id)
    await waitForStored()
    const onOpening = await page.locator('.pw-say-when').innerText()
    expect(onOpening).toContain('Read from the server')
    // CRITERION CHANGE, as decided: the caveat behind a mark beside this line is gone.

    // Somebody else writes to the same plan. This page has no way to know, and does not pretend to.
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/plans/${id}/body`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: '- a line this tab has never seen' }),
    })
    expect(res.ok, `the other writer answered ${res.status}`).toBe(true)
    expect(await page.locator('.pw-say').innerText()).toBe('Stored.')
    expect(await page.locator('.pw-say-when').innerText()).toContain('Read from the server')

    // THIS TAB NOW TYPES INTO A PLAN IT NO LONGER HOLDS. Nothing is written, and the page says so
    // in words a person can act on.
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('!')
    await page.waitForSelector('.pw-clash-lead', { timeout: 30_000 })
    expect(await page.locator('.pw-clash-lead').innerText()).toBe(
      'Somebody wrote in this plan first, so nothing was saved.',
    )
    // AND THE CLAIM THAT THE WRITING IS STORED IS WITHDRAWN RATHER THAN LEFT STANDING. The word and
    // the moment are gone from the screen; what is there instead says nothing was saved.
    expect(await page.locator('.pw-say').count()).toBe(0)

    // THE OTHER WRITER'S LINE IS STILL WHAT THE SERVER HOLDS, which is the whole point of refusing.
    expect(await storedBody(id)).toBe('- a line this tab has never seen')
    // AND NOTHING THIS PERSON TYPED WAS THROWN AWAY, which is the same loss from the other side.
    expect(await inBox()).toBe('- one line\n!')

    // AFTER ITS OWN SAVE THE MOMENT MOVES AND SAYS HOW PANELX GOT IT. Measured on a plan nobody
    // else has written in, because in the tab above there is no save left that could be accepted.
    const alone = await newPlan('One tab', '- one line\n')
    await openPlan(alone)
    await waitForStored()
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('!')
    await waitForStored()
    expect(await page.locator('.pw-say-when').innerText()).toContain('Sent and accepted')
    expect(await storedBody(alone)).toBe('- one line\n!')
  }, 120_000)
})

// ============================================================================ two views, one store

/**
 * THE TABLE AND THE WRITING BOX ARE TWO VIEWS OF ONE PLAN, MEASURED IN A BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THESE EXIST FOR, WHICH THE WHOLE SUITE PASSED THROUGH
 * ---------------------------------------------------------------------------------------
 *
 * A row's words were changed in the Table view. The server stored them and the table drew them. The
 * writing box went on holding the plan as it was BEFORE, and the next character typed there saved
 * the old document back over the edit, with nothing on screen saying so. Two copies of one document,
 * and the stale one won.
 *
 * Nothing in this repository caught it, because nothing opened both views of one plan. These three
 * tests do. They are written separately so that a failure says which half came back:
 *
 *   1. THE BOX HOLDS WHAT THE TABLE WROTE, and the next keystroke keeps it. This is the measurement
 *      the checker made.
 *   2. WORDS THAT ARRIVE WHILE THE BOX IS ON SCREEN GO INTO IT. That is the harder half: React may
 *      never write that element's content, so they are put in by hand exactly once. The re-read is
 *      held up until after the view has been switched, so a box that only ever picks the words up
 *      when it is built cannot pass.
 *   3. THE SAME DEFECT WEARING THE OPPOSITE COAT. A re-read that lands while somebody is typing must
 *      NOT wipe what they typed. A fix that clobbered a person's own characters would be no better
 *      than the one it replaced, so the refusal is measured too.
 */
describe('the table and the writing box are two views of one plan', () => {
  /** Move between the two views. Both presses sit above both views, on every one of them. */
  async function showView(name: 'Writing' | 'Table'): Promise<void> {
    await page.getByRole('button', { name, exact: true }).click()
  }

  /**
   * The box holding one row's words in the table, found by the words it is holding.
   *
   * It reads the boxes' own values rather than the page's text, because these words live in a
   * textarea. Finding nothing is a failure with every row printed, not a silent zero-length match.
   */
  async function rowWords(words: string) {
    const boxes = page.locator('textarea[aria-label="The words of this item"]')
    await boxes.first().waitFor({ timeout: 30_000 })
    const held = await boxes.evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value))
    const at = held.indexOf(words)
    expect(at, `no row of the table holds the words "${words}" — it holds ${held.join(' / ')}`).toBeGreaterThan(-1)
    return boxes.nth(at)
  }

  /**
   * Hold every re-read of the plan up for two seconds, so the browser can be caught between the
   * write and the answer.
   *
   * `released` is how many reads have been let go. A test reads it to prove the moment it measured
   * was really inside the window, rather than passing on a race it happened to lose.
   */
  function holdUpEveryRead(): { released: () => number; stop: () => Promise<void> } {
    let released = 0
    const started = page.route('**/api/plans/*/blocks', async (route) => {
      await sleep(2_000)
      released += 1
      // The test's own cleanup may have taken this route away while this handler was asleep, and a
      // request it no longer owns is not its to answer. That is the only failure swallowed here.
      await route.continue().catch(() => {})
    })
    return {
      released: () => released,
      stop: async () => {
        await started
        // `wait` rather than the default, so a handler still asleep finishes before the test ends
        // and its rejection cannot land in whatever test is running by then.
        await page.unrouteAll({ behavior: 'wait' })
      },
    }
  }

  /** The plan as the server holds it, once it says what was expected or after long enough to fail. */
  async function storedBecomes(id: string, want: string): Promise<string> {
    let stored = ''
    for (let at = 0; at < 80; at += 1) {
      stored = await storedBody(id)
      if (stored === want) return stored
      await sleep(250)
    }
    return stored
  }

  /**
   * THE MEASUREMENT ITSELF: A ROW EDITED IN THE TABLE, THEN ONE CHARACTER TYPED IN THE BOX.
   *
   * Both halves are checked, and the second is the one that was silent. A box holding the old words
   * is visible to anybody who looks; a keystroke putting the old words back over a stored edit is
   * not, because the screen it leaves behind looks exactly like a plan nobody edited.
   */
  it('holds a row’s new words in the writing box, and the next keystroke does not put the old ones back', async () => {
    const WAS = ['- replace the gripper', '- reprint the mount'].join('\n')
    const NOW = ['- CALIBRATED IN THE TABLE', '- reprint the mount'].join('\n')
    const id = await newPlan('Two views of one plan', WAS)
    await openPlan(id)
    await waitForStored()

    await showView('Table')
    const cell = await rowWords('replace the gripper')
    await cell.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('CALIBRATED IN THE TABLE')
    await page.keyboard.press('Enter')
    // The edit really reached the server. That half never broke, and a test that skipped it could
    // pass on a table that wrote nothing at all.
    expect(await storedBecomes(id, NOW)).toBe(NOW)

    await showView('Writing')
    await page.waitForSelector('.pw-box', { timeout: 30_000 })
    expect(await inBox(), 'the writing box is still holding the words the table replaced').toBe(NOW)

    // AND NOW THE KEYSTROKE. A page holding the old document sends the old document with this
    // character on the end, and the table's edit is gone with nothing said.
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('!')
    expect(await inBox(), 'the character never reached the box, so nothing below is about a keystroke').toBe(
      `${NOW}!`,
    )
    await waitForStored()
    // The stored plan is read until it says this rather than once: "Stored." can already be on
    // screen from the save BEFORE this keystroke, and a single read then measures the wrong moment.
    expect(
      await storedBecomes(id, `${NOW}!`),
      'one keystroke put the words the table replaced back',
    ).toBe(`${NOW}!`)
  }, 180_000)

  /**
   * WORDS THAT ARRIVE WHILE THE BOX IS ALREADY ON SCREEN ARE PUT INTO IT.
   *
   * The table's re-read is held up for two seconds, and the view is switched back inside that time,
   * so the box is built BEFORE the new words exist anywhere in the browser. A box that only picks
   * the words up when it is built therefore cannot pass this, and the test says so if the read got
   * back first rather than passing on a race it did not win.
   */
  it('puts words that arrive while the box is on screen into the box, once', async () => {
    const WAS = ['- swap the fingers', '- level the table'].join('\n')
    const NOW = ['- SWAPPED WHILE THE BOX WAS OPEN', '- level the table'].join('\n')
    const id = await newPlan('Words arriving late', WAS)
    await openPlan(id)
    await waitForStored()
    await showView('Table')

    const held = holdUpEveryRead()
    try {
      const cell = await rowWords('swap the fingers')
      await cell.click()
      await page.keyboard.press('Control+a')
      await page.keyboard.type('SWAPPED WHILE THE BOX WAS OPEN')
      await page.keyboard.press('Enter')

      await showView('Writing')
      await page.waitForSelector('.pw-box', { timeout: 30_000 })
      // THE BOX WAS BUILT BEFORE THE WORDS EXISTED HERE, which is what makes this about adopting
      // them rather than about being built from them. Without this the test proves nothing.
      expect(held.released(), 'the table’s re-read got back before the box was built, so nothing was adopted').toBe(
        0,
      )
      expect(await inBox(), 'the box was built from the old words, which is what it was built from').toBe(WAS)

      await page.waitForFunction(
        (want) => (document.querySelector('.pw-box') as HTMLTextAreaElement | null)?.value === want,
        NOW,
        { timeout: 30_000 },
      )
      expect(await inBox()).toBe(NOW)
    } finally {
      await held.stop()
    }
  }, 180_000)

  /**
   * THE OPPOSITE COAT: A RE-READ THAT LANDS WHILE SOMEBODY IS TYPING LEAVES THEIR CHARACTERS ALONE.
   *
   * The re-read is started by filing a row as work, which changes the record a line names and NOT
   * one character of the document — so the words the read carries are the words the browser already
   * had, and the only difference between the two is the character just typed. That is what makes
   * this about the refusal and not about which of two edits wins.
   *
   * ---------------------------------------------------------------------------------------
   * THE WINDOW IS THE WHOLE TEST, AND THE FIRST WRITING OF IT MEASURED NOTHING
   * ---------------------------------------------------------------------------------------
   *
   * The refusal only applies while a save is owed, and a save stops being owed about a second and a
   * half after the keystroke: 600ms of waiting and then a save that comes straight back. A read held
   * up for two seconds therefore lands on a plan the server has ALREADY been told about, carrying
   * the typed character back with it, and there is nothing left to overwrite. Written that way the
   * test passed with the refusal deleted.
   *
   * So the save is held open as well. The read gets back while the save is still on its way, which
   * is the only moment the refusal is about, and the test asserts that the page still said the plan
   * was not stored at that moment rather than assuming it.
   */
  it('leaves characters typed while a save is owed alone when a re-read lands on top of them', async () => {
    const WAS = ['- fit the new wrist', '- log the offsets'].join('\n')
    const id = await newPlan('Typing under a re-read', WAS)
    await openPlan(id)
    await waitForStored()
    await showView('Table')

    const held = holdUpEveryRead()
    // The save is held open for far longer than the read, so the read gets back in the middle of it.
    await page.route('**/api/plans/*/body', async (route) => {
      await sleep(6_000)
      await route.continue().catch(() => {})
    })
    try {
      // The record cell of a row nobody has filed. Its words are a dimmed dash now — the sentence
      // is on the mark and read out, not printed on every row — so the row is found by the press,
      // which is the thing being pressed.
      await page
        .locator('.pt-unfiled')
        .first()
        .getByRole('button', { name: 'Track' })
        .click()
      await page.locator('.pi-form').getByRole('button', { name: 'Track', exact: true }).click()

      await showView('Writing')
      await page.waitForSelector('.pw-box', { timeout: 30_000 })
      await page.locator('.pw-box').click()
      await page.keyboard.press('Control+End')
      await page.keyboard.type('!')
      expect(
        held.released(),
        'the re-read got back before the character was typed, so nothing was typed under it',
      ).toBe(0)

      // WAIT FOR THE READ TO GET BACK, then read the screen as it is at that moment.
      for (let at = 0; at < 80 && held.released() === 0; at += 1) await sleep(250)
      expect(held.released(), 'the re-read never got back, so it never landed on anything').toBe(1)
      // A moment later, so the page has drawn whatever the read did to it.
      await sleep(500)

      // AND THE SAVE IS STILL ON ITS WAY, which is what makes this the moment the refusal is about.
      expect(
        (await page.locator('.pw-say').innerText()).trim(),
        'the save had already come back, so the read landed on nothing the person still owed',
      ).not.toBe('Stored.')
      expect(await inBox(), 'a re-read wiped the character that had just been typed').toBe(`${WAS}!`)
    } finally {
      await held.stop()
      await page.unrouteAll({ behavior: 'wait' })
    }

    // AND THE CHARACTER IS WHAT REACHES THE SERVER, once the save it was in comes back.
    await waitForStored()
    expect(await storedBecomes(id, `${WAS}!`)).toBe(`${WAS}!`)
  }, 180_000)

  /**
   * A PLANNING VALUE IS THE SAME THING IN BOTH VIEWS, IN BOTH DIRECTIONS.
   *
   * `design/ROUND-FIVE.md` decision 1: how big something is, when it is to be done and which project
   * it belongs to live in the line's own words until they are promoted. So a value typed into a
   * table cell is characters in the document, and characters typed in the document are a value in a
   * table cell. Two slices of wave B meet here — the cells are one agent's and the box is another's
   * — and each half looks right on its own screen while disagreeing with the other.
   *
   * BOTH VIEWS ARE ON SCREEN AT ONCE, which is the arrangement the owner works in and the one where
   * a disagreement is in front of the owner.
   */
  it('carries a planning value from the table into the writing box, and from the box into the table', async () => {
    const id = await newPlan('One value, two views', '- replace the gripper')
    await openPlan(id)
    await waitForStored()
    await showLayout('Writing and table')
    await waitForTable()

    // THE TABLE INTO THE BOX. Typing 15h into "How big" on a line nobody has filed writes the value
    // into the line itself, and the document is what the box holds.
    const size = page.getByRole('textbox', { name: '"Estimate" for this item, in your own words' })
    await size.click()
    await page.keyboard.type('15h')
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      (want) => (document.querySelector('.pw-box') as HTMLTextAreaElement | null)?.value === want,
      '- replace the gripper {size: 15h}',
      { timeout: 30_000 },
    )
    expect(await storedBecomes(id, '- replace the gripper {size: 15h}')).toBe('- replace the gripper {size: 15h}')

    // THE BOX INTO THE TABLE. The same line, given a project by typing it, and the cell says it.
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' {project: robotics}')
    await waitForStored()
    const project = page.getByRole('textbox', { name: '"Project" for this item, in your own words' })
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('textarea')].some(
          (el) =>
            el.getAttribute('aria-label') === '"Project" for this item, in your own words' &&
            (el as HTMLTextAreaElement).value === 'robotics',
        ),
      undefined,
      { timeout: 30_000 },
    )
    expect(await project.inputValue()).toBe('robotics')
    // And the size the table wrote is still in the box, so neither view has overwritten the other.
    expect(await size.inputValue()).toBe('15h')
    expect(await inBox()).toBe('- replace the gripper {size: 15h} {project: robotics}')
  }, 180_000)

  /**
   * PICKING A ROW PICKS WHAT IS WRITTEN UNDER IT, INCLUDING WHAT A FOLD HAS TAKEN OFF THE SCREEN.
   *
   * `design/ROUND-FIVE.md` decision 5. The rule itself is `subtreesOf` and `pickedAfter`, and
   * tests/wave-b-seams.test.ts measures both without a browser. What only a browser can measure is
   * WHICH rows the table asks them about: it folds and it flattens, so a table that worked the
   * subtree out from the rows it is drawing would quietly stop picking what is folded away, and
   * every test with nothing folded would still pass.
   */
  it('picks the rows a fold is hiding, and says how many were picked', async () => {
    const id = await newPlan('Picking a folded level', ['## Tray clamp', '- replace it', '- reprint the mount'].join('\n'))
    await openPlan(id)
    await waitForStored()
    await showLayout('Table')
    await waitForTable()

    // Fold the heading. Its two bullets are off the screen, and the press says how many.
    await page.getByRole('button', { name: 'Fold the 2 under Tray clamp' }).click()
    expect(await page.locator('textarea[aria-label="The words of this item"]').count()).toBe(1)

    // Pick the heading. The control names what it will take with it.
    await page.getByRole('checkbox', { name: 'Pick "Tray clamp" and the 2 written under it' }).click()
    expect(await page.locator('.pt-picked-say').innerText()).toBe('3 items picked')

    // And the rows that were hidden really are picked, which is what the count is about.
    await page.getByRole('button', { name: 'Open the 2 under Tray clamp' }).click()
    for (const words of ['replace it', 'reprint the mount']) {
      const one = page.getByRole('checkbox', { name: `Stop picking "${words}"` })
      expect(await one.getAttribute('aria-checked'), words).toBe('true')
    }

    // Letting the heading go lets all three go, and the bar goes with them.
    await page.getByRole('checkbox', { name: 'Stop picking "Tray clamp" and the 2 written under it' }).click()
    expect(await page.locator('.pt-picked-say').count()).toBe(0)
  }, 180_000)
})

/** The owner's outline, written out as the person types it: leading spaces, no bullet markers. */
const OUTLINE_LINES = [
  'build a baseline',
  '  build the pipeline',
  '    perception',
  '    planning',
  '    control',
  '  implement one controller detail',
  '    tune gains',
  '    test saturation',
  '  prepare the experiment',
  '    change the gripper',
  '    reprint a mount',
  '    recalibrate',
]

const OUTLINE = OUTLINE_LINES.join('\n')
