// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY SETTINGS SECTION KEEPS ITS WORDS, PRESSES AND INPUTS INSIDE ITS CARD, BESIDE THE CHAT AND ALONE.
 *
 * The owner opened Settings with the chat beside the page and found words and presses running out of their cards. In
 * the person’s pictures the sandbox-login cards draw their Clear press outside the card, and the price table squeezes its model
 * column to one letter a line, with its inputs past the card's edge. Beside the chat the window is 1024 or wider while
 * the page is narrow, so a rule that asks the window's width draws the page's wide layout in a narrow card.
 *
 * WHAT IS MEASURED, in a browser, with each category of Settings chosen in turn, in English and in Chinese, in the
 * developer mode so that the two developer categories are drawn too:
 *   1. the page does not scroll sideways;
 *   2. no element and no run of words passes the inner edge of its section's card, or of the nearest bordered box
 *      inside the card, such as a sandbox login's own card. What a box that scrolls across holds may pass that box's
 *      edge, so a long table may scroll inside its card;
 *   3. no word in a table's heading or cell of one column is drawn on more than one line, so no column is narrower
 *      than its longest word. A table drawn with ARIA roles counts as a table: the keyboard shortcuts are spans with
 *      the roles cell and columnheader, and beside the chat their first column was squeezed to nothing.
 *
 * THE WIDTHS. Beside the chat: 1024, the narrowest window the chat sits beside the page in, with the chat as it opens
 * and at its widest; 1440 with the chat at its widest and at its narrowest; and 1440 with the chat 650 and 600 pixels
 * wide, where Settings drew its card 390 and 440 pixels wide when this test was written, as in the owner's pictures.
 * Alone: 390, where an open chat covers the screen instead, and 660, where the keys and the price table passed their
 * cards as well.
 *
 * In the light look only: the dark look draws the same boxes in other colours.
 *
 * THE DATA: a fresh office, and four made-up runs whose usage receipts name a model each, so the price table draws a
 * row for each name.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Mode } from '../src/shared/mode.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { CHAT_OPEN_KEY, SPLIT_LEAVES_THE_WINDOW, SPLIT_WIDTH_LEAST, SPLIT_WIDTH_TO_START_WITH } from '../src/web/lib/chat-split.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { readEverySettingsCategory } from './settings-folds.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

/** The developer mode, by the word the address and the store use for it. */
const DEVELOPER: Mode = 'inspect'
const LANGUAGES = ['en', 'zh'] as const

/** The models the made-up runs' usage receipts name. */
const MODELS = ['deepseek-v4-flash', 'claude-opus-4-7', 'claude-sonnet-4-6-20261101', 'gpt-5.5'] as const

/** A window, and how wide the chat beside the page is in it; null when the chat is shut. */
interface Width {
  name: string
  width: number
  chat: number | null
}

const WIDTHS: readonly Width[] = [
  { name: `${String(THE_SHELL_WIDTH)} beside the chat as it opens`, width: THE_SHELL_WIDTH, chat: SPLIT_WIDTH_TO_START_WITH },
  { name: `${String(THE_SHELL_WIDTH)} beside the chat at its widest`, width: THE_SHELL_WIDTH, chat: THE_SHELL_WIDTH - SPLIT_LEAVES_THE_WINDOW },
  { name: '1440 beside the chat at its widest', width: 1440, chat: 1440 - SPLIT_LEAVES_THE_WINDOW },
  { name: '1440 beside the chat 650 wide', width: 1440, chat: 650 },
  { name: '1440 beside the chat 600 wide', width: 1440, chat: 600 },
  { name: '1440 beside the chat at its narrowest', width: 1440, chat: SPLIT_WIDTH_LEAST },
  { name: '660 alone', width: 660, chat: null },
  { name: '390 alone', width: 390, chat: null },
]

let live: LiveApp
let database: TestDb

beforeAll(async () => {
  database = await freshDb()
  for (const model of MODELS) {
    historicalSession(database, {
      workspaceId: 'default',
      actor: { type: 'agent', id: 'd-settings-fit-test' },
      kind: 'session',
      title: `A made-up run that names the model ${model}`,
      data: {
        state: 'finished', servingAgent: 'settings-fit-agent', model, runtime: 'claude-code',
        usageReceipt: {
          runtime: 'claude-code', model, inputTokens: 100, cachedInputTokens: 1000,
          cacheCreationInputTokens: 200, outputTokens: 50, inputIncludesCached: false, costUsd: 1.25,
        },
      },
    })
  }
  live = await liveApp({ name: 'settings-fit', viewport: { width: 1440, height: 900 }, workspace: 'default', database: database.file })
}, 240_000)

afterAll(async () => {
  if (live) await live.stop()
  database?.close()
})

/** A window of its own at this width, with the chat beside the page or shut, on Settings in this language. */
async function openSettings(width: Width, language: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await live.browser.newContext({ viewport: { width: width.width, height: 900 }, colorScheme: 'light' })
  // SET ONCE IN THIS WINDOW, so a reload keeps what the chat itself wrote since.
  await context.addInitScript(
    ([openKey, open, chat]) => {
      if (sessionStorage.getItem('settings-fit-set') === 'yes') return
      sessionStorage.setItem('settings-fit-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem(openKey, open)
      localStorage.setItem('mole-office.chat.split-side', 'right')
      localStorage.setItem('mole-office.chat.split-width', chat)
    },
    [CHAT_OPEN_KEY, width.chat === null ? 'no' : 'split', String(width.chat ?? SPLIT_WIDTH_TO_START_WITH)] as const,
  )
  const page = await context.newPage()
  await page.goto(`${live.site}/?lang=${language}&mode=${DEVELOPER}#/settings`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (width.chat !== null) await page.locator('.px-chat[data-where="split"]').waitFor({ timeout: 30_000 })
  return { context, page }
}

interface Said {
  over: string[]
  broken: string[]
  sideways: number
  card: number
}

/**
 * In the page: what passes the edge of its card or of the nearest bordered box inside it, which word of a table is
 * broken across lines, and how far the page scrolls sideways.
 */
function measureSettings(language: string): Said {
  const root = document.querySelector<HTMLElement>('.set')
  if (root === null) return { over: ['no Settings page is drawn'], broken: [], sideways: 0, card: 0 }
  const sectionOf = (el: Element): string => el.closest('.sf-panel')?.getAttribute('data-settings-panel') ?? 'outside a section'
  const nameOf = (el: Element): string => {
    const classes = [...el.classList].slice(0, 2).join('.')
    const words = ((el as HTMLElement).innerText ?? '').replace(/\s+/gu, ' ').trim().slice(0, 30)
    return `${el.tagName.toLowerCase()}${classes === '' ? '' : `.${classes}`}${words === '' ? '' : ` "${words}"`}`
  }
  const bordered = (style: CSSStyleDeclaration): boolean =>
    Number.parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle !== 'none' &&
    Number.parseFloat(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none'
  const innerOf = (el: Element): { left: number; right: number } => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return { left: rect.left + Number.parseFloat(style.borderLeftWidth), right: rect.right - Number.parseFloat(style.borderRightWidth) }
  }
  /** Drawn when more than 1 px wide or tall: a column squeezed to nothing still draws its words, one letter a line. */
  const visible = (el: Element): boolean => {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = el.getBoundingClientRect()
    return rect.width > 1 || rect.height > 1
  }
  /** The nearest bordered box, the card and the page an element must stay inside; none inside a box that scrolls or clips. */
  const boxesOf = (el: Element): Array<{ what: string; box: Element }> => {
    const boxes: Array<{ what: string; box: Element }> = []
    for (let up = el.parentElement; up !== null; up = up.parentElement) {
      if (up === root) {
        boxes.push({ what: 'the page', box: up })
        return boxes
      }
      if (up.classList.contains('sf-panel')) {
        boxes.push({ what: 'its card', box: up })
        continue
      }
      const style = getComputedStyle(up)
      if (style.overflowX !== 'visible') return []
      if (boxes.length === 0 && bordered(style)) boxes.push({ what: `its box ${nameOf(up).split(' ')[0] ?? ''}`, box: up })
    }
    return boxes
  }
  const over: string[] = []
  const seen = new Set<string>()
  const check = (what: string, rect: DOMRect, el: Element): void => {
    for (const { what: edge, box } of boxesOf(el)) {
      const inner = innerOf(box)
      const by = Math.max(rect.right - inner.right, inner.left - rect.left)
      const line = `${sectionOf(el)}: ${what} passes the edge of ${edge} by ${String(Math.round(by))} (${String(Math.round(rect.width))} wide in ${String(Math.round(inner.right - inner.left))})`
      if (by > 1 && !seen.has(line)) {
        seen.add(line)
        over.push(line)
      }
    }
  }
  const DRAWN_BY_THE_CONTROL = ['textarea', 'select', 'option', 'script', 'style']
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg') !== null && el.tagName.toLowerCase() !== 'svg') continue
    if (!visible(el)) continue
    check(nameOf(el), el.getBoundingClientRect(), el)
    // A WRITING BOX'S OR A LIST'S OWN TEXT is drawn by the control, not where its node is: the control is measured.
    if (DRAWN_BY_THE_CONTROL.includes(el.tagName.toLowerCase())) continue
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      if (rect.width > 0) check(`the words "${(node.textContent ?? '').trim().slice(0, 30)}"`, rect, el)
    }
  }

  // THE WORDS OF A TABLE: a run with no space, or for Chinese each word the browser's dictionary finds in it.
  const broken: string[] = []
  const chinese = /[\u3000-\u9fff\uff00-\uffef]/u
  const segmenter = new Intl.Segmenter(language, { granularity: 'word' })
  for (const cell of root.querySelectorAll<HTMLElement>('th, td, [role="cell"], [role="columnheader"]')) {
    if ((cell instanceof HTMLTableCellElement && cell.colSpan > 1) || !visible(cell)) continue
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (DRAWN_BY_THE_CONTROL.includes(node.parentElement?.tagName.toLowerCase() ?? '')) continue
      const text = node.textContent ?? ''
      for (const run of text.matchAll(/\S+/gu)) {
        const words = chinese.test(run[0])
          ? [...segmenter.segment(run[0])].filter((one) => one.isWordLike).map((one) => ({ at: run.index + one.index, word: one.segment }))
          : [{ at: run.index, word: run[0] }]
        for (const { at, word } of words) {
          if (word.length < 2) continue
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + word.length)
          const rects = [...range.getClientRects()].filter((one) => one.width > 0)
          const first = rects[0]
          if (first === undefined) continue
          const lines = 1 + rects.filter((one) => one.top > first.top + first.height / 2).length
          if (lines > 1) broken.push(`${sectionOf(cell)}: the word "${word}" is drawn on ${String(lines)} lines in ${nameOf(cell).split(' ')[0] ?? ''}, a column ${String(Math.round(cell.getBoundingClientRect().width))} wide`)
        }
      }
    }
  }
  return {
    over,
    broken,
    sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    card: Math.round(root.querySelector('.sf-panel')?.getBoundingClientRect().width ?? 0),
  }
}

describe('every Settings section keeps what it draws inside its card', () => {
  for (const width of WIDTHS) {
    it(`at ${width.name}`, async () => {
      const faults: string[] = []
      for (const language of LANGUAGES) {
        const { context, page } = await openSettings(width, language)
        try {
          await readEverySettingsCategory(page, async (category) => {
            await page.evaluate(() => document.fonts.ready)
            await page.mouse.move(0, 0)
            const said = await page.evaluate(measureSettings, language)
            const where = `${language}, ${category}, the card ${String(said.card)} wide`
            if (said.sideways > 1) faults.push(`${where}: the page scrolls sideways by ${String(said.sideways)}`)
            for (const one of [...said.over, ...said.broken]) faults.push(`${where}: ${one}`)
            if (language === 'zh' && category === 'devRuns' && width.chat !== null &&
                width.chat === width.width - SPLIT_LEAVES_THE_WINDOW) {
              const login = createI18n('zh').t('settingsPanel.logins.login')
              const labels = page.locator('.keys-row[data-login] .keys-box-name').filter({ hasText: login })
              expect(await labels.count(), `${where}: sandbox login labels are drawn`).toBeGreaterThan(0)
              for (const label of await labels.all()) {
                const lines = await label.evaluate((element) => {
                  const range = document.createRange()
                  range.selectNodeContents(element)
                  return range.getClientRects().length
                })
                if (lines !== 1) faults.push(`${where}: the sandbox login label is drawn on ${String(lines)} lines`)
              }
            }
          })
        } finally {
          await context.close()
        }
      }
      expect(faults, `Settings at ${width.name}`).toEqual([])
    }, 600_000)
  }
})
