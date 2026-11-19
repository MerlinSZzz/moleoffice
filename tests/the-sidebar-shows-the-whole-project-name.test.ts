// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR SHOWS THE PROJECT'S WHOLE NAME, AND ITS SWITCH PRESS CAN STILL BE REACHED.
 *
 * Round 166's pictures found the sidebar cutting "Greenhouse (made-up)" beside the Switch press at every width: the
 * name was held to one line and ended in an ellipsis. The name now wraps onto as many lines as it needs, and when its
 * longest word does not fit beside the Switch press, the press goes under the name.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own, at 1440, 990, 660 and 390, in the light and
 * the dark theme, for that name and for a name of 40 characters. Below the width where the sidebar stands beside the
 * page, it is opened from the menu first.
 *   1. The name is drawn whole: its text is the project's name, nothing of it is cut (its scroll size is its drawn
 *      size), it stands inside the sidebar, and nothing is drawn over any of its lines. No word of it is split across
 *      two lines: a word may break inside itself only when it is wider than the line beside the initials, and
 *      neither name has such a word.
 *   2. The Switch press can be reached: it is drawn inside the sidebar and the window, nothing is drawn over its
 *      middle, and pressing it opens the list of projects.
 *
 * MUTATION: put back `overflow-wrap: anywhere` in place of `overflow-wrap: break-word` in the `.sbp-name` rule of
 * src/web/components/Sidebar.tsx, and the cases at 1440 go red: the name's least width is then one letter, Switch
 * stays beside it, and "Greenhouse" is split after its ninth letter. `white-space: nowrap` in that rule is not
 * caught, and need not be: both names then fit whole on one line, and Switch goes under them.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
/** The name the pictures found cut, and a name of 40 characters. Both projects are made up. */
const PROJECTS = [
  { id: 'made-up-greenhouse', title: 'Greenhouse (made-up)' },
  { id: 'made-up-seed-library', title: 'Made-up Riverside Seed Library and Store' },
] as const
const WIDTHS = [990, 1440, 660, 390] as const
const THEMES = ['light', 'dark'] as const

let app: LiveApp

beforeAll(async () => {
  expect(PROJECTS[1].title.length, 'the long name').toBe(40)
  app = await liveApp({ name: 'the-whole-project-name', workspace: 'default', viewport: { width: 1440, height: 900 } })
  for (const project of PROJECTS) {
    const made = await fetch(app.api + '/api/workspaces', { method: 'POST', headers: OWNER, body: JSON.stringify(project) })
    expect(made.status, await made.clone().text()).toBe(201)
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

type Drawn = {
  text: string
  /** How much of the name is not drawn, across and down, in pixels. */
  cutAcross: number
  cutDown: number
  insideTheSidebar: boolean
  /** The lines of the name that something else is drawn over, each by where it is drawn. */
  coveredLines: string[]
  /** The words of the name, split on spaces, that are drawn on more than one line. */
  brokenWords: string[]
  lines: number
}

/** How the sidebar draws the project's name. */
function theName(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const name = document.querySelector<HTMLElement>('#shell-side .sbp-name')!
    const side = document.querySelector('#shell-side')!.getBoundingClientRect()
    const box = name.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(name)
    const lines = [...range.getClientRects()].filter((one) => one.width > 0 && one.height > 0)
    const coveredLines = lines.filter((line) => {
      const over = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2)
      return over === null || !name.contains(over)
    }).map((line) => `${Math.round(line.left)},${Math.round(line.top)} ${Math.round(line.width)}x${Math.round(line.height)}`)
    const words = name.firstChild
    if (name.childNodes.length !== 1 || words === null || words.nodeType !== Node.TEXT_NODE) throw new Error('The name is not one run of text.')
    const brokenWords = [...(words.textContent ?? '').matchAll(/\S+/gu)].filter((word) => {
      const one = document.createRange()
      one.setStart(words, word.index)
      one.setEnd(words, word.index + word[0].length)
      return new Set([...one.getClientRects()].filter((part) => part.width > 0).map((part) => Math.round(part.top))).size > 1
    }).map((word) => word[0])
    return {
      text: (name.textContent ?? '').trim(),
      cutAcross: name.scrollWidth - name.clientWidth,
      cutDown: name.scrollHeight - name.clientHeight,
      insideTheSidebar: box.left >= side.left - 0.5 && box.right <= side.right + 0.5 && box.top >= side.top - 0.5 && box.bottom <= side.bottom + 0.5,
      coveredLines,
      brokenWords,
      lines: new Set(lines.map((line) => Math.round(line.top))).size,
    }
  })
}

/** Where the Switch press is drawn: inside the sidebar and the window, and whether anything is drawn over its middle. */
function theSwitch(page: Page): Promise<{ inside: boolean; uncovered: boolean }> {
  return page.evaluate(() => {
    const press = document.querySelector<HTMLElement>('#shell-side .sbp-switch')!
    const side = document.querySelector('#shell-side')!.getBoundingClientRect()
    const box = press.getBoundingClientRect()
    const over = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return {
      inside: box.width > 0 && box.left >= Math.max(0, side.left) - 0.5 && box.right <= Math.min(window.innerWidth, side.right) + 0.5
        && box.top >= 0 && box.bottom <= window.innerHeight + 0.5,
      uncovered: over !== null && press.contains(over),
    }
  })
}

const longNameLinesAt990 = new Map<string, number>()

for (const theme of THEMES) for (const width of WIDTHS) {
  it(`draws the whole project name and a press that can be reached, at ${width} in the ${theme} theme`, async () => {
    for (const project of PROJECTS) {
      const where = `${project.title} at ${width}, ${theme}`
      const context = await app.browser.newContext({ viewport: { width, height: width <= 390 ? 844 : 900 }, reducedMotion: 'reduce' })
      try {
        await context.addInitScript(({ id, look, key, workspace }) => {
          localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
          localStorage.setItem('mole-office.preset.theme', look)
          localStorage.setItem('mole-office.chat.open', 'no')
          localStorage.setItem(key, 'expanded')
          localStorage.setItem('mole-office.workspace', workspace)
        }, { id: THE_TEST_OFFICES_OWNER.id, look: theme, key: SIDEBAR_KEY, workspace: project.id })
        const page = await context.newPage()
        await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        expect(await page.evaluate(() => document.documentElement.dataset['theme']), where).toBe(theme)
        await page.locator('#shell-side .sbp-block[data-projects="ready"]').waitFor({ state: 'attached', timeout: 30_000 })
        const menu = page.locator('.shell-menu')
        if ((await menu.count()) > 0 && (await menu.first().isVisible())) {
          await menu.first().click()
          await page.locator('#shell-side[data-drawer="open"]').waitFor({ timeout: 10_000 })
        }
        await page.locator('#shell-side .sbp-name').waitFor({ state: 'visible', timeout: 10_000 })
        await page.mouse.move(0, 0)

        const name = await theName(page)
        expect(name.text, where).toBe(project.title)
        expect({ cutAcross: name.cutAcross, cutDown: name.cutDown }, `${where}: the name is cut`).toEqual({ cutAcross: 0, cutDown: 0 })
        expect(name.insideTheSidebar, `${where}: the name stands outside the sidebar`).toBe(true)
        expect(name.coveredLines, `${where}: something is drawn over the name`).toEqual([])
        expect(name.brokenWords, `${where}: words split across two lines`).toEqual([])
        if (project === PROJECTS[1]) {
          const takes = await Promise.all([theName(page), theName(page), theName(page)])
          const lines = takes.map((take) => take.lines)
          console.info(`Sidebar line takes at ${width}, ${theme}: ${lines.join(', ')}`)
          if (width === 990) longNameLinesAt990.set(theme, Math.max(...lines))
          if (width === 1440) {
            expect(Math.max(...lines), `${where}: the long name has more lines than at 990`).toBeLessThanOrEqual(longNameLinesAt990.get(theme)!)
          }
        }

        const press = await theSwitch(page)
        expect(press, `${where}: the Switch press`).toEqual({ inside: true, uncovered: true })
        await page.locator('#shell-side .sbp-switch').click({ timeout: 5_000 })
        await expect.poll(() => page.locator('#shell-side .sbp-switch').getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('true')
      } finally {
        await context.close()
      }
    }
  }, 180_000)
}
