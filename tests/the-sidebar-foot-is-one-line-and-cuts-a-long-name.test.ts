// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR'S FOOT IS ONE ROW. A NAME IS DRAWN WHOLE ON TWO LINES, AND ONE THAT NEEDS MORE IS CUT WITH AN ELLIPSIS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The sidebar draws the person's name in `.sbp-person-name`, in its foot, on one line with a light
 * press, a dark press, Settings and Shutdown, by point 3 of a decision. Point 3 of another
 * decision adds to it: when a name cannot share its line, the name is cut with an ellipsis, its whole name shows when
 * the pointer rests on it, and the foot stays one line.
 *
 * Test change (wave 13y round 165): the sidebar in one style, chosen in this round, draws Settings as a
 * row of its own above the foot's line, with the narrow press at its right end. The line holds the initial, the
 * name, the look presses and Shutdown, four parts where it held five.
 *
 * Test change (wave 13y round 165), a second one: the name is drawn whole on two lines, as design A of this
 * round's sidebar draws it. This takes back the one-line cut of the first paragraph. Cut on one line, the made-up
 * office's own name read "Made-up c…" open at 1440 and "Made-up …" in the menu at 990 and 390. So the name now
 * wraps between words onto at most two lines. A name that needs more than two lines is cut at the end of the
 * second with an ellipsis, and still shows whole on hover. The row still holds its four parts side by side, with
 * their middles level.
 *
 * So, at 1440 and 390 in the light theme, this file holds the page to four things:
 *
 *   - a name that fits beside the presses is drawn whole on one line, and is not cut;
 *   - a name of two words that does not fit one line, the made-up office's own, is drawn whole on two lines;
 *   - a long name of four words is drawn on two lines and a long one-word name on one, each cut with an ellipsis,
 *     and the hover word of what the pointer rests on is the whole name;
 *   - no word of a name is broken across two lines; the initial, the name, the look presses and Shutdown stand
 *     side by side with their middles level, nothing of the foot runs past the sidebar, and the page does not
 *     scroll sideways.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CAME BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * Until this file, the name wrapped and was never cut, and the presses moved to a second line when
 * the name's longest word could not share the line (wave 13r round 14, and finding 4 of problem
 * E73Do6DbqZCH, where a name cut with no way to read it whole read "default offic…"). This file was
 * tests/the-sidebars-name-breaks-only-between-words.test.ts, which held that. On one line a name is
 * never broken inside a word, because it is never broken at all.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A TEST CAN READ, AND WHAT IT CANNOT
 * ---------------------------------------------------------------------------------------
 *
 * The browser draws the ellipsis; the page still holds the whole name. So "cut with an ellipsis" is
 * read as facts the browser answers: the name's box is narrower or shorter than its text (scrollWidth
 * against clientWidth, scrollHeight against clientHeight), its text-overflow is ellipsis with its overflow
 * hidden and its lines clamped at two, and how many lines of its text lie inside its box. A word broken
 * across two lines is read from the word's own rectangles, which then stand at two heights.
 *
 * The whole name on hover is the title attribute, the browser's own tooltip, the same way the
 * foot's other presses give their hover words. A headless browser does not draw that tooltip, so the
 * test rests the pointer on the name and reads the title of the element under the pointer instead.
 *
 * THE NAMES ARE MADE UP, and the office is a test office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** A made-up name short enough to fit beside the presses at every width, the drawer's included. */
const THE_SHORT_NAME = 'Jo'
/** The made-up name the sidebar's pictures draw, of two words, too long for one foot row and short enough for two. */
const THE_TWO_WORD_NAME = 'Made-up caretaker'
/** A made-up name of four words, longer than two foot rows. A person's name is a label, so it is at most five words. */
const THE_LONG_NAME = 'Made-up caretaker of everything'
/** A made-up one-word name longer than any foot row. */
const THE_LONG_WORD = 'madeupcaretakerverylongnameindeed'
const WIDTHS = [1440, 390] as const
const THEMES = ['light'] as const
/** The four parts of the foot's row, in the order the row draws them. */
const THE_LINE = ['.sbp-disc', '.sbp-person-name', '.sbp-look', '.sbp-shut-down'] as const
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

let app: LiveApp
const nameBefore = process.env.MOLE_OFFICE_OWNER_NAME
beforeAll(async () => {
  process.env.MOLE_OFFICE_OWNER_NAME = THE_SHORT_NAME
  app = await liveApp({ name: 'sidebar-foot-one-line', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(({ id }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => {
  await app?.stop()
  if (nameBefore === undefined) delete process.env.MOLE_OFFICE_OWNER_NAME
  else process.env.MOLE_OFFICE_OWNER_NAME = nameBefore
}, 120_000)

/** Renames the test office's person. Every case that renames puts the short name back in a finally. */
async function rename(name: string): Promise<void> {
  const renamed = await fetch(`${app.api}/api/participants/person/${THE_TEST_OFFICES_OWNER.id}`, {
    method: 'PATCH', headers, body: JSON.stringify({ name }),
  })
  expect(renamed.status, await renamed.clone().text()).toBe(200)
}

/**
 * Opens a page and the sidebar that carries the name: the drawer is opened by the Menu press below
 * 1024. The page is loaded afresh each time, because it reads the person's name once, and going to
 * the address it is already on only moves its hash and keeps the name it read before a rename.
 */
async function openTheSidebar(width: number, theme: string, name: string): Promise<void> {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(app.site + `/?lang=en&look=${theme}&mode=normal#/office`)
  await waitForThePage(app.page, 60_000)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
  if (width < 1024) await app.page.locator('.shell-menu').click()
  await app.page.locator('.sbp-person-name', { hasText: name }).waitFor({ timeout: 15_000 })
}

/** What the browser answered about the foot at one width and theme. */
interface Foot {
  /** The name's own text, which is the whole name whether or not it is cut. */
  drawn: string
  /** How many lines of the name's text lie inside its box, from the tops of its rectangles. */
  lines: number
  /** Each word of the name whose rectangles stand at more than one height, so it is broken across lines. */
  broken: string[]
  /** The name's box is narrower or shorter than its text. */
  cut: boolean
  /** The name's text-overflow is ellipsis, its overflow hidden or clipped and its lines clamped at two, so a cut ends in "…". */
  ellipsis: boolean
  /** How many of the four parts of the line are in the row. */
  parts: number
  /** The most the middles of those parts differ, in pixels. */
  spread: number
  /** Each part that runs past the sidebar, and by how much. */
  past: string[]
  sideways: boolean
  /** Every word of the foot, its hover words and screen-reader names included, to find a missing one. */
  words: string
  /** The name's box, for a failure message. */
  nameBox: string
}

/** Reads the foot out of the drawn page. */
async function watchTheFoot(): Promise<Foot> {
  return await app.page.evaluate((line) => {
    const side = document.querySelector('#shell-side')
    const foot = document.querySelector('.sbp-foot')
    const name = document.querySelector('.sbp-foot-row .sbp-person-name')
    if (side === null || foot === null || name === null) throw new Error('the sidebar, its foot or the name is not in the page')
    const sideBox = side.getBoundingClientRect()
    const style = getComputedStyle(name)
    const nameBox = name.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(name)
    // A LINE PAST THE SECOND IS STILL LAID OUT, under the box where it is hidden, so only the lines inside the box count.
    const tops = new Set([...range.getClientRects()].filter((one) => one.width > 0.5 && one.top < nameBox.bottom - 1).map((one) => Math.round(one.top)))
    // EACH WORD'S OWN RECTANGLES: a word broken across two lines has rectangles at two heights.
    const text = name.firstChild
    const broken: string[] = []
    if (text !== null && text.nodeType === Node.TEXT_NODE) {
      const words = text.textContent ?? ''
      for (const found of words.matchAll(/\S+/g)) {
        const word = document.createRange()
        word.setStart(text, found.index)
        word.setEnd(text, found.index + found[0].length)
        const heights = new Set([...word.getClientRects()].filter((one) => one.width > 0.5).map((one) => Math.round(one.top)))
        if (heights.size > 1) broken.push(found[0])
      }
    }
    const found = line.flatMap((selector) => {
      const one = document.querySelector(`.sbp-foot-row ${selector}`)
      return one === null ? [] : [{ selector, box: one.getBoundingClientRect() }]
    })
    const middles = found.map(({ box }) => box.top + box.height / 2)
    const said = [...foot.querySelectorAll('*')].flatMap((one) => [one.getAttribute('title') ?? '', one.getAttribute('aria-label') ?? ''])
    return {
      drawn: name.textContent ?? '',
      lines: tops.size,
      broken,
      cut: name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1,
      ellipsis: style.textOverflow === 'ellipsis' && (style.overflowX === 'hidden' || style.overflowX === 'clip') && style.webkitLineClamp === '2',
      parts: found.length,
      spread: middles.length === 0 ? 9999 : Math.max(...middles) - Math.min(...middles),
      past: found
        .filter(({ box }) => box.right > sideBox.right + 1 || box.left < sideBox.left - 1)
        .map(({ selector, box }) => `${selector} ends ${String(Math.round(box.right - sideBox.right))} pixels past the sidebar's right edge`),
      sideways: document.documentElement.scrollWidth > innerWidth,
      words: [foot.textContent ?? '', foot.getAttribute('aria-label') ?? '', ...said].join(' '),
      nameBox: `${String(Math.round(nameBox.width))} by ${String(Math.round(nameBox.height))} pixels for ${String(name.scrollWidth)} by ${String(name.scrollHeight)} of text`,
    }
  }, THE_LINE)
}

/** Rests the pointer on the name and reads the hover word of what lies under it. */
async function restThePointerOnTheName(): Promise<{ onTheName: boolean; hover: string | null }> {
  const name = app.page.locator('.sbp-foot-row .sbp-person-name')
  await name.hover()
  return await name.evaluate((one) => {
    const box = one.getBoundingClientRect()
    const under = document.elementFromPoint(box.left + Math.min(box.width / 2, 8), box.top + box.height / 2)
    return { onTheName: under !== null && one.contains(under), hover: under?.closest('[title]')?.getAttribute('title') ?? null }
  })
}

/**
 * The checks every width and theme makes of the row itself, whatever the name: its four parts side by side with
 * their middles level, the name on as many lines as asked inside its box, and no word of it broken across two lines.
 */
function expectOneRow(at: Foot, where: string, lines: number): void {
  expect(at.parts, `${where}: the foot row holds ${String(at.parts)} of its four parts`).toBe(THE_LINE.length)
  expect(at.lines, `${where}: the name lies on ${String(at.lines)} lines inside its box, its box ${at.nameBox}`).toBe(lines)
  expect(at.broken, `${where}: a word of the name is broken across two lines`).toEqual([])
  expect(at.spread, `${where}: the parts of the foot do not stand side by side, their middles differ by ${String(Math.round(at.spread))} pixels`).toBeLessThanOrEqual(2)
  expect(at.past, `${where}: part of the foot runs past the sidebar`).toEqual([])
  expect(at.sideways, `${where}: the sidebar pushed the page sideways`).toBe(false)
}

/** Renames the person, opens the sidebar at each width in the light theme, and hands each reading of the foot to `check`. */
async function atEveryWidth(name: string, check: (at: Foot, where: string) => Promise<void>): Promise<void> {
  await rename(name)
  try {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const where = `${String(width)} ${theme}`
        await openTheSidebar(width, theme, name)
        const at = await watchTheFoot()
        expect(at.drawn, `${where}: the sidebar did not draw the made-up name`).toBe(name)
        await check(at, where)
      }
    }
  } finally {
    await rename(THE_SHORT_NAME)
  }
}

/** A long name, at every width in the light theme: on `lines` lines, cut with an ellipsis, whole on hover. */
async function expectCutWithItsWholeNameOnHover(name: string, lines: number): Promise<void> {
  await atEveryWidth(name, async (at, where) => {
    expectOneRow(at, where, lines)
    expect(at.cut, `${where}: the long name was not cut, its box ${at.nameBox}`).toBe(true)
    expect(at.ellipsis, `${where}: the long name is cut with no ellipsis at two lines`).toBe(true)
    const rested = await restThePointerOnTheName()
    expect(rested.onTheName, `${where}: the pointer resting on the name is not on the name`).toBe(true)
    expect(rested.hover, `${where}: resting the pointer on the cut name does not give its whole name`).toBe(name)
  })
}

describe('the sidebar foot is one row, draws a name whole on two lines, and cuts a name that needs more', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. A foot that was never drawn has no part off its line and no
   * name past its edge. This says the sidebar really drew the made-up name and the four parts of the
   * line, and that no word of the foot is missing (a missing word is drawn between ⟦ and ⟧).
   */
  it('really drew the made-up name and the four parts of the foot, with no word missing', async () => {
    await openTheSidebar(1440, 'light', THE_SHORT_NAME)
    const at = await watchTheFoot()
    expect(at.drawn, 'the sidebar did not draw the made-up name this test measures').toBe(THE_SHORT_NAME)
    expect(at.parts, 'the foot row does not hold its four parts').toBe(THE_LINE.length)
    expect(at.words, 'a word of the foot is missing').not.toContain('⟦')
  }, 120_000)

  it('draws a short name whole on one line, at 1440 and 390 in light', async () => {
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        const where = `${String(width)} ${theme}`
        await openTheSidebar(width, theme, THE_SHORT_NAME)
        const at = await watchTheFoot()
        expect(at.drawn, `${where}: the sidebar did not draw the made-up name`).toBe(THE_SHORT_NAME)
        expectOneRow(at, where, 1)
        expect(at.cut, `${where}: the short name was cut, its box ${at.nameBox}`).toBe(false)
      }
    }
  }, 240_000)

  it('draws a name of two words that does not fit one line whole on two lines, at 1440 and 390 in light', async () => {
    await atEveryWidth(THE_TWO_WORD_NAME, async (at, where) => {
      expectOneRow(at, where, 2)
      expect(at.cut, `${where}: the name of two words was cut, its box ${at.nameBox}`).toBe(false)
    })
  }, 300_000)

  it('cuts a long name of four words with an ellipsis at the end of its second line, whole on hover, at 1440 and 390 in light', async () => {
    await expectCutWithItsWholeNameOnHover(THE_LONG_NAME, 2)
  }, 300_000)

  it('cuts a long one-word name with an ellipsis on its one line, whole on hover, at 1440 and 390 in light', async () => {
    await expectCutWithItsWholeNameOnHover(THE_LONG_WORD, 1)
  }, 300_000)
})
