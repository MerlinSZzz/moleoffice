// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR DRAWS THE ENTRY "WORDS FOR YOU TO CONFIRM" WHOLE AT 1440, IN THE LIGHT THEME.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Each sidebar entry is a grid of three columns: the icon, the label and the count. The count is
 * drawn only when there is one. At 1440 the entry for the person's words had no count, and its label
 * was cut with an ellipsis by one pixel: the label's box was 180 pixels wide in the light theme and
 * its words needed 181 (wave 13r round 17's measurement).
 *
 * So, at 1440 in the light theme, with no count beside it, this file holds the entry's label to one
 * thing: its words fit in its box. The browser answers that as the label's scrollWidth against its
 * clientWidth. A cut of even one pixel draws the ellipsis, so the two are compared with no allowance.
 *
 * The sidebar's border is not this file's business. It stays as it was, and the pixel is found inside
 * the entry, in the sidebar's own rules.
 *
 * The pictures case takes the sidebar at 1440, 990, 660 and 390, in both themes, when
 * W13R_R18_SIDEBAR_SHOTS names a folder, so the pictures from before and after the change can be
 * compared.
 *
 * THE OFFICE IS A TEST OFFICE, and nothing in it is a real observation.
 *
 * TEST CHANGE (wave 13y round 165): the entry is no longer in the sidebar. It is a row of the All pages page, which
 * lists every page that is not in front of the sidebar, so the row's words are measured there, found by the same
 * surface, and the pictures are of that page.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { putTheMadeUpLabelIn, takeTheMadeUpLabelOut } from './the-made-up-label-above-the-page.ts'
import { SURFACES } from '../src/shared/surfaces.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

const WIDTHS = [1440, 990, 660, 390] as const
const THEMES = ['light', 'dark'] as const
/** The entry, found by the surface it declares rather than by its words. */
const THE_ENTRY = `#main a.ap-page[data-target="${targetAttributeValue({ kind: 'uiSurface', surfaceId: 'rail.yourwords' })}"]`
/** The row's words, inside the row. */
const THE_LABEL = ':scope > span'
/** The entry's English words, from the one place they are written. */
const THE_WORDS = SURFACES['rail.yourwords']

let app: LiveApp
beforeAll(async () => {
  app = await liveApp({ name: 'sidebar-words-to-confirm-whole', workspace: 'default', viewport: { width: 1440, height: 1100 } })
  await app.context.addInitScript(({ id }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => {
  await app?.stop()
}, 120_000)

/** Opens the All pages page, where the entry is a row. */
async function openTheSidebar(width: number, theme: string): Promise<void> {
  await app.page.setViewportSize({ width, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(app.site + `/?lang=en&look=${theme}&mode=normal#/all-pages`)
  await waitForThePage(app.page, 60_000)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
  await app.page.locator(`${THE_ENTRY} > span`).waitFor({ timeout: 15_000 })
}

/** What the browser answered about the entry's label. */
interface Entry {
  words: string
  /** The label box's width, without the part its words run past. */
  clientWidth: number
  /** The width its words need. */
  scrollWidth: number
  /** A count is drawn beside the label. */
  counted: boolean
}

async function measureTheEntry(): Promise<Entry> {
  return await app.page.evaluate(([selector, words]) => {
    const entry = document.querySelector(selector!)
    const label = entry?.querySelector(words!) ?? null
    if (entry === null || label === null) throw new Error('the sidebar has no entry for the words to confirm, or the entry has no label')
    return {
      words: label.textContent ?? '',
      clientWidth: label.clientWidth,
      scrollWidth: label.scrollWidth,
      counted: entry.querySelector('.shell-badge') !== null,
    }
  }, [THE_ENTRY, THE_LABEL] as const)
}

describe('the sidebar draws the entry for the words to confirm whole', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. A label that was never drawn has nothing to cut. This says the
   * sidebar really drew the entry with its English words, that no word is missing (a missing word is
   * drawn between ⟦ and ⟧), and that the test office has no count beside it.
   */
  it('really drew the entry with its English words and no count beside it', async () => {
    await openTheSidebar(1440, 'light')
    const at = await measureTheEntry()
    expect(at.words, 'the sidebar did not draw the entry’s English words').toBe(THE_WORDS)
    expect(at.words, 'a word of the entry is missing').not.toContain('⟦')
    expect(at.counted, 'the test office drew a count beside the entry, so this file measures something else').toBe(false)
    expect(at.clientWidth, 'the label has no width, so nothing was measured').toBeGreaterThan(0)
  }, 120_000)

  it('draws the label’s words whole in its box at 1440 in light', async () => {
    const cut: string[] = []
    for (const theme of ['light'] as const) {
      await openTheSidebar(1440, theme)
      const at = await measureTheEntry()
      expect(at.words, `1440 ${theme}: the sidebar did not draw the entry’s English words`).toBe(THE_WORDS)
      expect(at.counted, `1440 ${theme}: a count is drawn beside the entry`).toBe(false)
      expect(at.clientWidth, `1440 ${theme}: the label has no width, so nothing was measured`).toBeGreaterThan(0)
      // Both themes are measured before the answer, so a failure names each theme that cuts the label.
      if (at.scrollWidth > at.clientWidth) cut.push(`1440 ${theme}: the label's box is ${String(at.clientWidth)} pixels wide and its words need ${String(at.scrollWidth)}`)
    }
    expect(cut, 'the label is cut').toEqual([])
  }, 240_000)

  /**
   * THE PICTURES, because this is a page change. Set W13R_R18_SIDEBAR_SHOTS to a folder to take one
   * picture of the sidebar at each width and theme, with the made-up label above the sidebar's foot.
   */
  it('photographs the sidebar with the made-up label at four widths in both themes', async () => {
    const folder = process.env.W13R_R18_SIDEBAR_SHOTS
    if (folder === undefined) return
    mkdirSync(folder, { recursive: true })
    for (const width of WIDTHS) {
      for (const theme of THEMES) {
        await openTheSidebar(width, theme)
        await putTheMadeUpLabelIn(app.page, 'Made-up test office — the sidebar', app.page.locator('#main .ap-title'), 'the sidebar')
        const clip = await app.page.evaluate(() => {
          const side = document.querySelector('#main')
          if (side === null) throw new Error('the All pages page is not in the page')
          const box = side.getBoundingClientRect()
          const x = Math.max(0, Math.round(box.left))
          const y = Math.max(0, Math.round(box.top))
          return { x, y, width: Math.min(Math.round(box.width), innerWidth - x), height: Math.min(Math.round(box.height), innerHeight - y) }
        })
        await app.page.screenshot({ path: `${folder}/sidebar-${String(width)}-${theme}.png`, clip })
        await takeTheMadeUpLabelOut(app.page)
      }
    }
  }, 300_000)
})
