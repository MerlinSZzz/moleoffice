// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROW'S TITLE IS NOT SQUEEZED TO NOTHING BY THE NOTE DRAWN BESIDE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ON THE SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * Home's "In progress" column is a third of the Also panel, 373px at a 1440px window. A module row
 * in it draws the module's title on the left and a short note on the right. Measured on 29 August
 * 2026, before the fix this file guards: the note cell took its whole 270px, the title track was
 * left 76px, and the title "PanelX -- database schema and migrations" drew on six lines with the
 * browser splitting "migrations" across two of them and leaving a single letter "s" alone on the
 * last line. At a 1200px window the same track measured 0px and three words came apart; at 1300px
 * it measured 30px.
 *
 * That is the one case in this campaign's corpus that fails criterion 7 of
 * `design/problem-01/ACCEPTANCE.md`: a plain English word drawn in more than one piece.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THIS IS MEASURED NOW
 * ---------------------------------------------------------------------------------------
 *
 * Home's Late or stuck rows draw a long title with a state line above it and the project under it.
 * They stand in Needs you, and the person chooses where on Home Needs you goes. Its narrowest place
 * is the second column, about a third of the board at 1440. So this test keeps that layout for the
 * person before it opens Home: Needs you alone in the second column, and every other part where
 * Home's first layout puts it. With nothing kept, Needs you is in one column as wide as the board, and there these
 * titles fit on one line and cannot fill their row. The two claims are measured in the narrow place:
 *
 *   1. THE SHAPE. Nothing in a Late or stuck row is drawn beside the title: the state line ends
 *      above it and the project starts below it, so the title gets the width of the row.
 *   2. THE CRITERION. No plain English word in those rows is drawn in more than one piece. This is
 *      criterion 7 itself, and it needs a long title to be worth anything, so this test writes its
 *      own: two promises past their date, whose titles are the two that broke on the old Home.
 *
 * WHY IT ASKS THE BROWSER RATHER THAN THE STYLESHEET. Where a box is drawn is the browser's answer,
 * and a rule read out of a template literal cannot tell a layout that works from one that does not.
 *
 * MUTATION PROOF. A control run first, unmutated: both tests green. Then `.hm-alarm-row` is drawn as
 * a row rather than a column, which puts the state and the project beside the title, and both go
 * red. Then it is put back and both go green again. The runs are named in the commit that moved
 * this file to Late or stuck.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HOME_LAYOUT_A, movePart, type HomeLayout } from '../src/shared/home-layout.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, type LiveApp } from './helpers.ts'

let app: LiveApp
let page: Page

/**
 * Titles long enough to be worth measuring, with ordinary English words in them. The first is the
 * record whose title was actually broken on Home; the second is a second row, because a rule that
 * only ever met one row is a rule nobody has tested twice.
 */
const TITLES = [
  'Mole Office — database schema and migrations',
  'Mole Office — blocks: a pipeline step is a record',
]

/** What one row drew: the title, what else is in the row, and any English word drawn in two pieces. */
interface DrawnRow {
  title: string
  titleWidth: number
  rowWidth: number
  /** True when every other part of the row ends above the title or starts below it. */
  nothingBeside: boolean
  brokenWords: string[]
}

beforeAll(async () => {
  app = await liveApp({ name: 'row-title-floor', viewport: { width: 1440, height: 1000 } })
  page = app.page

  for (const title of TITLES) {
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'claude-code',
      },
      // A PROMISE PAST ITS DATE is what Late or stuck draws, with its state line and its project.
      body: JSON.stringify({
        kind: 'obligation',
        title,
        data: { due: '2020-03-01', owedTo: 'the schema review', state: 'open' },
      }),
    })
    if (!res.ok) throw new Error(`writing a promise answered ${String(res.status)}: ${await res.text()}`)
  }

  // NEEDS YOU ALONE IN THE SECOND COLUMN, kept for the person, so Late or stuck stands in Home's narrowest place.
  const narrow: HomeLayout = movePart(HOME_LAYOUT_A, 'needs', 'second', 0)
  const kept = await fetch(`${app.api}/api/home-layout`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify({ layout: narrow }),
  })
  if (!kept.ok) throw new Error(`keeping the layout answered ${String(kept.status)}: ${await kept.text()}`)

  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/`, { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  // LATE OR STUCK IS ONE NUMBER, and pressing it opens its list.
  await page.locator('[data-home-section="late"] summary').click({ timeout: 60_000 })
  await page.waitForSelector('[data-home-section="late"] .hm-alarm-row', { timeout: 60_000 })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Every Late or stuck row on Home, measured by the browser that drew it. */
async function rows(): Promise<DrawnRow[]> {
  return page.evaluate(() => {
    /* CRITERION 7'S OWN DEFINITIONS, and each one is here because a looser version was measured to
       be wrong. A whole token holding a digit, a dot, a slash, a backslash, an at sign, a colon, a
       hash, an underscore or a lower-to-upper change is an identifier or a path and is not judged.
       Each hyphen-free run of four or more letters is judged on its own, because a hyphen is a
       place a line may break. "In more than one piece" is two DISTINCT rectangle tops, because an
       ellipsis-truncated line returns the same rectangle twice. */
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
    const out = []
    for (const row of document.querySelectorAll('[data-home-section="late"] .hm-alarm-row')) {
      const title = row.querySelector('.hm-row-title')
      if (title === null) continue
      const t = title.getBoundingClientRect()
      const others = [...row.children].filter((one) => one !== title).map((one) => one.getBoundingClientRect())
      const style = getComputedStyle(row)
      const inside = row.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)
      out.push({
        title: (title.textContent ?? '').trim(),
        titleWidth: Math.round(t.width * 10) / 10,
        rowWidth: Math.round(inside * 10) / 10,
        nothingBeside: others.every((o) => o.bottom <= t.top + 1 || o.top >= t.bottom - 1),
        brokenWords: brokenIn(row),
      })
    }
    return out
  })
}

describe("a Late or stuck row on Home gives its title the room the row has", () => {
  it('draws the state above the title and the project under it, never beside it', async () => {
    const drawn = await rows()
    expect(drawn.map((row) => row.title), 'the two long titles were not both drawn, so this test can no longer see what it guards').toEqual(expect.arrayContaining(TITLES))
    for (const row of drawn) {
      const shape = `"${row.title}" drew ${String(row.titleWidth)}px in a row ${String(row.rowWidth)}px wide inside`
      expect(row.nothingBeside, shape).toBe(true)
      // A title that wraps fills the row; nothing takes a share of its width.
      expect(row.titleWidth, shape).toBeGreaterThan(row.rowWidth * 0.8)
    }
  }, 60_000)

  it('breaks no plain English word, which is criterion 7', async () => {
    const drawn = await rows()
    for (const row of drawn) {
      expect(row.brokenWords, `"${row.title}" drew these words in more than one piece`).toEqual([])
    }
  }, 60_000)
})
