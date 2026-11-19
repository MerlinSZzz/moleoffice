// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERIA B30 AND B31: THE AUTOMATIC LEVEL IS PER PART, AND THE PERSON MOVES ALL OF THEM AT ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * `design/bundle/ACCEPTANCE.md`, 7 September 2026:
 *
 *   B30. The automatic level per part is the base. Measured and said on the page: the copy's
 *        automatic default already chooses a level per part to fit its share of the size (the owner's
 *        reading: problems drawn at the Conclusion where a lower level would do). The page says
 *        which level each part got and why.
 *
 *   B31. The person moves the levels relatively. No absolute level is offered. Two presses, less
 *        and more, move every part one level down or up from the automatic choice (the owner's example:
 *        3135 becomes 2124 with less); the page shows the levels each part now has and the copy's
 *        resulting size, and the copy takes the room those levels need and says its size. This
 *        replaces the Detail control and settles JPDu6lJcizw0.
 *
 * ---------------------------------------------------------------------------------------
 * THE CORPUS THIS FILE MAKES, AND WHY IT IS THAT SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * Enough problems, each with enough written on it, that the part carrying them cannot hold them all
 * at the longest level inside its share of the size — and modules that easily can. Without that,
 * every part fits at Full, every automatic level is the same, and this file would measure a copy
 * too small to have made a choice at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT ASSERT, AND THE MEASUREMENT THAT IS WHY
 * ---------------------------------------------------------------------------------------
 *
 * B31 quotes the owner's own reading — 3135 becomes 2124 with less — and this file does NOT assert that a
 * press of less makes a copy smaller, because on this corpus it does not, and the reason is not the
 * control. Measured on 7 September 2026, one part of one copy at each absolute level:
 *
 *   the part carrying what is still open, 12 entries    title 3,398   Conclusion 6,088   Full 4,577
 *
 * The Conclusion is a SHORTER level than Full and produces 1,511 more bytes, because at the
 * Conclusion an entry is its reference line plus the record's own summary, and at Full it is the
 * reference line plus the three short lines the open-loop reader writes. So one press of less took
 * the whole copy from 14,264 characters to 15,779. That is the ladder saying more at a shorter
 * position, which is the failure `fillTheLadder` already fixed in the other direction and has not
 * been fixed in this one. It is filed, with these numbers, and it is not this criterion's to fix.
 *
 * SO WHAT IS ASSERTED IS WHAT THE CONTROL PROMISES: the levels move, the page says the levels and
 * the size, more comes back to where less started, and a part over its share takes the room and
 * says so.
 *
 * FOUR MUTATIONS, MEASURED 7 SEPTEMBER 2026, after a control run of this file green (6 of 6):
 *
 *   continuation.ts, ignore the offset and always draw at the automatic level    1 red (3)
 *   bundle.ts, do not carry the chosen level to the page                         4 red (1, 2, 3, 5)
 *   bundle.ts, do not refuse an absolute level and an offset together            1 red (6)
 *   continuation.ts, take the first level tried instead of the one that fits     2 red (1, 5)
 *
 * Restored, six of six pass.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { BUNDLE_RUNGS, howFarFromTheAutomaticLevel, rungsMoved } from '../src/shared/bundles.ts'
import { levelLabel } from '../src/shared/detail.ts'
import { NO_LEVEL_WAS_MOVED } from '../src/shared/a-copys-levels-in-words.ts'

let app: LiveApp
let page: Page

/** How many problems the corpus holds. Enough that their part cannot draw them all at Full. */
const PROBLEMS = 12

interface PartOnTheWire {
  name: string
  label: string
  says: string
  bytes: number
  share: number
  chose?: { level: string; automatic: string; shift: number; fits: boolean }
}

/** Ask the server for a copy at one offset, without a browser. */
async function copyAt(shift: number): Promise<{ characters: number; parts: PartOnTheWire[]; text: string }> {
  const at =
    `http://127.0.0.1:${String(app.apiPort)}/api/bundles/preview?preset=recover_project` +
    (shift === 0 ? '' : `&shift=${String(shift)}`)
  const reply = await fetch(at)
  if (!reply.ok) throw new Error(`the preview answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as { characters: number; parts: PartOnTheWire[]; text: string }
}

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-levels-per-part', viewport: { width: 1440, height: 1000 } })
  page = app.page
  const post = async (body: unknown): Promise<void> => {
    const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`the seed was refused: ${String(res.status)} ${await res.text()}`)
  }
  for (let i = 0; i < PROBLEMS; i += 1) {
    await post({
      kind: 'problem',
      title: `The far edge of tray ${String(i)} is not segmented at 40 cm`,
      summary:
        `Segmentation drops the far edge of tray ${String(i)} at forty centimetres, on every run, ` +
        'and the depth image is clean there. It is the mask that is short, not the sensor, and the ' +
        'same tray at thirty centimetres is segmented whole.',
      data: {
        symptom: `Segmentation drops the far edge of tray ${String(i)}.`,
        state: 'open',
        why_it_hurts: 'A grasp planned on a short mask reaches for an edge that is not where it looks.',
      },
    })
  }
  await post({
    kind: 'module',
    title: 'The perception stack',
    summary: 'Everything between the camera and a grasp pose.',
  })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the page and read a copy on the screen. */
async function readWhatItWouldSay(): Promise<void> {
  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page h1')
  // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
  await page.waitForSelector('#bx-preset')
  await page.getByRole('button', { name: 'Read what it would say' }).click()
  await page.waitForSelector('.bx-text')
}

/** The characters figure the page draws, read off the page rather than recomputed. */
async function theSizeOnThePage(): Promise<number> {
  const said = (await page.locator('.bx-size').first().innerText()).replace(/,/g, '')
  const found = /(\d+) characters/.exec(said)
  if (found === null) throw new Error(`the page does not say a size: ${said}`)
  return Number(found[1])
}

/** What the Level column says for every part, in the order the table draws them. */
async function theLevelColumn(): Promise<string[]> {
  return await page.$$eval('.bx-partstable tbody tr .bx-part-level', (all) =>
    all.map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )
}

describe('the automatic level is chosen per part', () => {
  it('gives different parts different levels, each fitting its own share', async () => {
    const copy = await copyAt(0)
    const chose = copy.parts.filter((one) => one.chose !== undefined)
    expect(chose.length, 'no part of this copy chose a level at all').toBeGreaterThan(3)

    // EVERY PART THAT CHOSE, FITS. That is what the automatic base means: the longest level whose
    // lines are inside the share this part was given.
    for (const part of chose) {
      expect(part.chose?.shift, `${part.label} was moved when nobody moved anything`).toBe(0)
      expect(part.chose?.level).toBe(part.chose?.automatic)
      // A PART FITS ITS SHARE UNLESS IT IS ALREADY AT THE SHORTEST LEVEL THERE IS. A title each and
      // still over is the one case the ladder cannot answer, and the copy drops entries and says so
      // rather than pretending it fitted.
      if (part.chose?.level === 'title') continue
      expect(part.chose?.fits, `${part.label} does not fit its share and nobody moved it`).toBe(true)
      expect(part.bytes, `${part.label} spent more than its share`).toBeLessThanOrEqual(part.share)
    }

    // AND THE CHOICE IS PER PART, not one level for the copy. This is the whole of B30: a corpus
    // where one part cannot hold its members at the longest level and another easily can.
    const levels = new Set(chose.map((one) => one.chose?.level))
    expect(
      levels.size,
      `every part landed on the same level (${[...levels].join(', ')}), so nothing here shows a choice`,
    ).toBeGreaterThan(1)
    // THE SHORT ONE IS THE ONE THE OWNER'S READING NAMED: the problems, which are many and long.
    const problems = copy.parts.find((one) => one.name === 'unfixedProblems')
    expect(problems?.chose?.level, 'the problems part was not shortened by its share').not.toBe('full')
  }, 240_000)

  it('says on the page which level each part got', async () => {
    await readWhatItWouldSay()
    const headings = await page.$$eval('.bx-partstable thead th', (all) =>
      all.map((one) => (one.textContent ?? '').trim()),
    )
    expect(headings, 'the parts table does not name a Level column').toContain('Level')

    const column = await theLevelColumn()
    expect(column.length, 'the Level column is empty').toBeGreaterThan(3)
    // EVERY CELL IS AN ANSWER. A level, or the dash that says this part chooses none — never blank.
    for (const cell of column) expect(cell, 'a part says nothing about its level').not.toBe('')
    const named = column.filter((cell) => BUNDLE_RUNGS.some((rung) => cell.startsWith(levelLabel(rung))))
    expect(named.length, 'no cell of the Level column names a level of the ladder').toBeGreaterThan(3)
  }, 240_000)
})

describe('the person moves every level together', () => {
  it('offers no absolute level anywhere on the page', async () => {
    await readWhatItWouldSay()
    expect(await page.locator('#bx-detail').count(), 'the absolute Detail menu is still on the page').toBe(0)
    // NOT JUST THAT ONE MENU: no control anywhere offers a level of the ladder to pick.
    const options = await page.$$eval('select option', (all) => all.map((one) => (one.textContent ?? '').trim()))
    for (const rung of BUNDLE_RUNGS) {
      expect(options, `a menu still offers the absolute level ${levelLabel(rung)}`).not.toContain(levelLabel(rung))
    }
    // AND THE TWO PRESSES ARE THERE, with the phrase saying where the levels stand.
    expect(await page.locator('#bx-less').count()).toBe(1)
    expect(await page.locator('#bx-more').count()).toBe(1)
    expect(await page.locator('#bx-shift').innerText()).toBe(howFarFromTheAutomaticLevel(0))
  }, 240_000)

  it('moves every part one level with a press, and the page says the new size', async () => {
    await readWhatItWouldSay()
    const atRest = await theSizeOnThePage()
    const levelsAtRest = await theLevelColumn()

    await page.getByRole('button', { name: 'Less' }).click()
    await page.waitForFunction(
      (was) => !(document.querySelector('.bx-size')?.textContent ?? '').includes(`${String(was)} characters`),
      atRest,
      { timeout: 30_000 },
    )
    // THE PAGE SAYS THE NEW SIZE, and it is a different size: the press changed the copy rather
    // than only a setting. Which way it changed is the ladder's business and not this control's —
    // the note at the top of this file has the measurement and the problem it is filed as.
    const afterLess = await theSizeOnThePage()
    expect(afterLess, 'the size on the page did not move with the press').not.toBe(atRest)
    expect(await page.locator('#bx-shift').innerText()).toBe(howFarFromTheAutomaticLevel(-1))

    // AND THE LEVELS MOVED. At least one part says its level is below what its share allows, and
    // the column is not the column it was.
    const levelsAfterLess = await theLevelColumn()
    expect(levelsAfterLess, 'no part changed level').not.toEqual(levelsAtRest)
    // A PART SAYS HOW FAR ITS OWN LEVEL REALLY MOVED, which is not always one rung: two of the
    // five levels are written for no entry when nobody names one, so a press of less can carry an
    // entry past them. What the person asked for is beside the presses; what each part got is here.
    expect(
      levelsAfterLess.some((cell) => cell.includes('below')),
      'no part says its level is below what its share allows',
    ).toBe(true)

    // MORE BRINGS IT BACK to the automatic base, which is what makes the two presses one control.
    await page.getByRole('button', { name: 'More' }).click()
    await page.waitForFunction(
      (was) => !(document.querySelector('.bx-size')?.textContent ?? '').includes(`${String(was)} characters`),
      afterLess,
      { timeout: 30_000 },
    )
    expect(await theSizeOnThePage(), 'more did not bring the copy back to where it started').toBe(atRest)
    expect(await page.locator('#bx-shift').innerText()).toBe(howFarFromTheAutomaticLevel(0))
    expect(await theLevelColumn(), 'the levels did not come back').toEqual(levelsAtRest)
  }, 300_000)

  it('takes the room the levels need, and says its size', async () => {
    // MEASURED ON THE SERVER, because what is asserted is the arithmetic of a part against its
    // share, and the page draws the same two numbers.
    const base = await copyAt(0)
    const more = await copyAt(2)
    expect(more.characters, 'moving every level up did not make the copy larger').toBeGreaterThan(base.characters)

    const over = more.parts.filter((one) => one.chose !== undefined && !one.chose.fits)
    expect(over.length, 'no part took more room than its share, so nothing here is measured').toBeGreaterThan(0)
    for (const part of over) {
      expect(part.bytes, `${part.label} says it is over its share and is not`).toBeGreaterThan(part.share)
      // AND IT SAYS SO IN THE COPY'S OWN TEXT, in bytes, where the reader of the text is.
      expect(part.says, `${part.label} took more room and the text does not say so`).toContain(
        `this part's share of the size is ${String(part.share)}`,
      )
    }
    // THE COPY'S HEAD LINE SAYS WHAT WAS DONE TO THE LEVELS, so a reader of the text alone can tell
    // a copy somebody shortened from one that was always this short.
    expect(more.text).toContain(rungsMoved(2))
    expect(base.text).toContain(NO_LEVEL_WAS_MOVED)
  }, 300_000)

  it('refuses a copy that names an absolute level and an offset at once', async () => {
    const at = `http://127.0.0.1:${String(app.apiPort)}/api/bundles/preview?preset=recover_project&detail=gist&shift=-1`
    const reply = await fetch(at)
    expect(reply.status, 'two different questions were answered as one').toBe(400)
    expect(await reply.text()).toContain('two different')
  }, 60_000)
})
