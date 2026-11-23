// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GENERAL LIST ON THE OFFICE FLOWS PAGE KEEPS EACH COLUMN AS WIDE AS ITS LONGEST WORD. The person saw the list's
 * first three columns squeezed, their words broken letter by letter, and the headings run together. The list chose its
 * layout by the window's width, so beside the chat a wide window drew six columns in a narrow page.
 *
 * WHAT IS MEASURED, in a browser, in the General list, after the fonts are loaded. A cell is a column heading, a flow's
 * name, one of its two cells of words, or one of its three facts.
 *   1. No cell is narrower than its widest word, within a pixel. Each word is measured alone, in its own font, on one
 *      line.
 *   2. No word is drawn on more than one line.
 *   3. Where the column headings are drawn, no heading's words touch the next heading's words.
 *   4. No cell and no word passes the edge of the General list's box. A list wider than its box would keep its words
 *      whole and still be cut off, so this is measured as well.
 *
 * THE PAGE AREA is the shell's body: the window, less the sidebar beside it and the chat beside it. Each case asks for a
 * page area and opens a window wide enough to give it, with the chat beside the page at its narrowest. The sidebar's
 * width is read once in each state, open and folded. Each case first checks that it got the page area and the sidebar
 * it asked for.
 *   · 790, 1100, 1440 and 1600, beside the chat, with the sidebar open and with it folded. 790 is the width the person
 *     reported. 1100 is the narrowest of these at which the list has room for its six columns.
 *   · The narrowest page area the chat leaves: the narrowest window the chat stands beside the page in, with the chat
 *     at its widest and the sidebar folded. There, an open sidebar is drawn over the page and the page keeps the same
 *     width, so it is not a case of its own.
 *   · 360, in a window 360 wide. Beside the chat the page area is never narrower than the case above, so 360 is
 *     reached only in a narrow window. There the sidebar is a drawer and the chat, when opened, covers the window, so
 *     both are shut.
 *
 * In English and the light look only. A Chinese line may break between any two characters, so it has no word to
 * measure.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database. The office's copied flows are taken out,
 * and three made-up General flows with long plain words are filed.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { CHAT_OPEN_KEY, SPLIT_LEAVES_THE_WINDOW, SPLIT_WIDTH_LEAST } from '../src/web/lib/chat-split.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'
import { SIDEBAR_BESIDE_THE_CHAT_KEY, SIDEBAR_KEY } from '../src/web/components/Sidebar.tsx'
import { deleteTheCopiedDefaultFlows, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

type Sidebar = 'expanded' | 'collapsed'

/** A window: how wide it is, how wide the chat beside the page is (null when the chat is shut), and the sidebar. */
interface TheWindow {
  width: number
  chat: number | null
  sidebar: Sidebar
}

/** What the shell gives the page in one window. */
interface Shell {
  pageArea: number
  sidebar: string
  over: string
  drawer: string
}

/** What the General list draws, measured in the page. */
interface Found {
  layout: string
  rows: number
  narrow: string[]
  broken: string[]
  touching: string[]
  outside: string[]
}

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Three General flows whose words are long and plain, with no hyphen and no slash where a line could break. */
const GENERAL_FLOWS = [
  { title: "Test: a worker's announcement reaches the supervisor", trigger: 'A worker hands its finished package to the registered supervisor.', runs: 'the registered supervisor' },
  { title: 'Test: answering an acknowledgement', trigger: 'An acknowledgement arrives from the secretary.', runs: 'the secretary' },
  { title: "Test: the inspector's verification", trigger: 'A verification is requested by the supervisor.', runs: 'the inspector' },
] as const

let app: LiveApp
/** The width the shell keeps beside the page for each state of the sidebar, read in a window of 1440. */
const sidebarWidth: Record<Sidebar, number> = { expanded: Number.NaN, collapsed: Number.NaN }

async function send(url: string, body: object): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `POST ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** A window of its own, on the office flows page, with the chat and the sidebar set before the page starts. */
async function openTheList(asked: TheWindow): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: asked.width, height: 900 }, colorScheme: 'light' })
  // SET ONCE IN THIS WINDOW, so a reload keeps what the shell itself wrote since.
  await context.addInitScript(
    ([openKey, open, chat, sidebarKey, besideKey, sidebar]) => {
      if (sessionStorage.getItem('general-list-set') === 'yes') return
      sessionStorage.setItem('general-list-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', 'light')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem(openKey, open)
      localStorage.setItem('mole-office.chat.split-side', 'right')
      localStorage.setItem('mole-office.chat.split-width', chat)
      localStorage.setItem(sidebarKey, sidebar)
      localStorage.setItem(besideKey, sidebar)
    },
    [CHAT_OPEN_KEY, asked.chat === null ? 'no' : 'split', String(asked.chat ?? SPLIT_WIDTH_LEAST), SIDEBAR_KEY, SIDEBAR_BESIDE_THE_CHAT_KEY, asked.sidebar] as const,
  )
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/flows`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (asked.chat !== null) await page.locator('.px-chat[data-where="split"]').waitFor({ timeout: 30_000 })
  await page.locator('.flw-group[data-group="general"] .flw-row').nth(GENERAL_FLOWS.length - 1).waitFor({ timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  return { context, page }
}

function readTheShell(): Shell {
  const body = document.querySelector('.shell-body')
  const side = document.querySelector('#shell-side')
  return {
    pageArea: body === null ? Number.NaN : body.getBoundingClientRect().width,
    sidebar: side?.getAttribute('data-state') ?? 'none',
    over: side?.getAttribute('data-over') ?? 'no',
    drawer: side?.getAttribute('data-drawer') ?? 'none',
  }
}

/** In the page: each cell of the General list, its words, and its headings. */
function measureTheGeneralList(): Found {
  const found: Found = { layout: '', rows: 0, narrow: [], broken: [], touching: [], outside: [] }
  const section = document.querySelector<HTMLElement>('.flw-group[data-group="general"]')
  if (section === null) return { ...found, layout: 'no General list is drawn' }
  const box = section.getBoundingClientRect()
  const drawn = (el: Element): boolean => {
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const nameOf = (el: Element): string => `${el.className} "${((el as HTMLElement).innerText ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40)}"`
  const heads = [...section.querySelectorAll<HTMLElement>('.flw-colhead > span')].filter(drawn)
  const rows = [...section.querySelectorAll<HTMLElement>('.flw-row')]
  const columns = rows.length === 0 ? 0 : getComputedStyle(rows[0]!).gridTemplateColumns.split(' ').length
  found.rows = rows.length
  found.layout = `${String(columns)} columns in a row, ${heads.length === 0 ? 'no headings drawn' : `${String(heads.length)} headings drawn`}, the list ${box.width.toFixed(0)} px wide`
  const cells = [...heads, ...section.querySelectorAll<HTMLElement>('.flw-row-name, .flw-row-cell, .flw-row-fact')].filter(drawn)

  const probe = document.createElement('span')
  probe.style.cssText = 'position: absolute; left: 0; top: 0; visibility: hidden; white-space: nowrap;'
  document.body.append(probe)
  // A label clipped to one pixel is read by a screen reader and not drawn, so it has no width to keep.
  const unseen = (node: Node): boolean => {
    const label = node.parentElement?.closest('.flw-cell-label')
    return label !== null && label !== undefined && label.getBoundingClientRect().width <= 1
  }
  for (const cell of cells) {
    const style = getComputedStyle(cell)
    const rect = cell.getBoundingClientRect()
    const inner = rect.width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
    if (rect.left < box.left - 1 || rect.right > box.right + 1) found.outside.push(`${nameOf(cell)}: ${rect.left.toFixed(1)} to ${rect.right.toFixed(1)}, the list ${box.left.toFixed(1)} to ${box.right.toFixed(1)}`)
    let widest = 0
    let widestWord = ''
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (unseen(node)) continue
      const font = getComputedStyle(node.parentElement!)
      probe.style.fontFamily = font.fontFamily
      probe.style.fontSize = font.fontSize
      probe.style.fontWeight = font.fontWeight
      probe.style.fontStyle = font.fontStyle
      probe.style.letterSpacing = font.letterSpacing
      probe.style.textTransform = font.textTransform
      for (const match of (node.textContent ?? '').matchAll(/\S+/gu)) {
        const word = match[0]
        probe.textContent = word
        const width = probe.getBoundingClientRect().width
        if (width > widest) {
          widest = width
          widestWord = word
        }
        const range = document.createRange()
        const at = match.index ?? 0
        range.setStart(node, at)
        range.setEnd(node, at + word.length)
        const parts = [...range.getClientRects()].filter((part) => part.width > 0)
        if (parts.length === 0) continue
        const first = parts[0]!
        const lines = 1 + parts.filter((part) => part.top > first.top + first.height / 2).length
        if (lines > 1) found.broken.push(`"${word}" on ${String(lines)} lines in ${nameOf(cell)}`)
        const whole = range.getBoundingClientRect()
        if (whole.left < box.left - 1 || whole.right > box.right + 1) found.outside.push(`"${word}" in ${nameOf(cell)}: ${whole.left.toFixed(1)} to ${whole.right.toFixed(1)}`)
      }
    }
    if (widest > inner + 1) found.narrow.push(`${nameOf(cell)}: ${inner.toFixed(1)} px for "${widestWord}", which is ${widest.toFixed(1)} px`)
  }
  probe.remove()

  const wordsOf = (head: HTMLElement): DOMRect => {
    const range = document.createRange()
    range.selectNodeContents(head)
    return range.getBoundingClientRect()
  }
  const headWords = heads.map((head) => ({ head, rect: wordsOf(head) })).filter((one) => one.rect.width > 0).sort((a, b) => a.rect.left - b.rect.left)
  for (let i = 1; i < headWords.length; i += 1) {
    const before = headWords[i - 1]!
    const after = headWords[i]!
    const gap = after.rect.left - before.rect.right
    const sameLines = after.rect.top < before.rect.bottom && before.rect.top < after.rect.bottom
    if (sameLines && gap <= 0) found.touching.push(`${nameOf(before.head)} and ${nameOf(after.head)}: ${gap.toFixed(1)} px apart`)
  }
  return found
}

beforeAll(async () => {
  app = await liveApp({ name: 'general-flows-columns', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await deleteTheCopiedDefaultFlows(app.api)
  const source = (await send('/api/records', { kind: 'report', title: 'Test: how the made-up flows were written', data: { for: 'The owner', date: '2026-11-22', blocks: [{ id: 'b-1', type: 'text', text: 'Made up.' }] } }))['record'].id as string
  for (const flow of GENERAL_FLOWS) {
    await send('/api/records', {
      kind: 'flow',
      title: flow.title,
      data: {
        declared_in: 'tools/test-flows.mjs',
        runs: flow.runs,
        trigger: flow.trigger,
        leaves_behind: 'a made-up acknowledgement',
        applies_to: { scope: 'general', roles: ['supervisor'] },
        stages: [1, 2].map((n) => ({ n, does: `Test stage ${String(n)}.`, evidence: 'A test note.', why: `Test why ${String(n)}.`, sources: [source] })),
      },
    })
  }
  // THE SIDEBAR'S WIDTH IN EACH STATE, beside the chat at its narrowest in a window of 1440, where both states fit.
  for (const sidebar of ['expanded', 'collapsed'] as const) {
    const { context, page } = await openTheList({ width: 1440, chat: SPLIT_WIDTH_LEAST, sidebar })
    try {
      const shell = await page.evaluate(readTheShell)
      expect(shell.sidebar, `the sidebar asked ${sidebar}`).toBe(sidebar)
      expect(shell.over, `the sidebar asked ${sidebar} stands beside the page`).toBe('no')
      sidebarWidth[sidebar] = 1440 - SPLIT_WIDTH_LEAST - shell.pageArea
    } finally {
      await context.close()
    }
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

/** A case: its name, the window it opens, and the page area it must get. */
interface Case {
  name: string
  window: () => TheWindow
  pageArea: () => number
}

const besideTheChat = (pageArea: number, sidebar: Sidebar): Case => ({
  name: `${String(pageArea)} of page area beside the chat, the sidebar ${sidebar === 'expanded' ? 'open' : 'folded'}`,
  window: () => ({ width: pageArea + sidebarWidth[sidebar] + SPLIT_WIDTH_LEAST, chat: SPLIT_WIDTH_LEAST, sidebar }),
  pageArea: () => pageArea,
})

const CASES: readonly Case[] = [
  ...[790, 1100, 1440, 1600].flatMap((pageArea) => [besideTheChat(pageArea, 'expanded'), besideTheChat(pageArea, 'collapsed')]),
  {
    name: `the narrowest page area beside the chat: a window of ${String(THE_SHELL_WIDTH)}, the chat at its widest, the sidebar folded`,
    window: () => ({ width: THE_SHELL_WIDTH, chat: THE_SHELL_WIDTH - SPLIT_LEAVES_THE_WINDOW, sidebar: 'collapsed' }),
    pageArea: () => THE_SHELL_WIDTH - (THE_SHELL_WIDTH - SPLIT_LEAVES_THE_WINDOW) - sidebarWidth.collapsed,
  },
  {
    name: '360 of page area in a window of 360, the sidebar a drawer and the chat shut',
    window: () => ({ width: 360, chat: null, sidebar: 'collapsed' }),
    pageArea: () => 360,
  },
]

describe('the General list on the office flows page', () => {
  it.each(CASES)('keeps each column as wide as its longest word, at $name', async (one) => {
    const asked = one.window()
    const { context, page } = await openTheList(asked)
    try {
      const shell = await page.evaluate(readTheShell)
      expect(Math.abs(shell.pageArea - one.pageArea()), `the page area is ${shell.pageArea.toFixed(1)}, not ${one.pageArea().toFixed(1)}`).toBeLessThanOrEqual(1)
      if (asked.chat === null) {
        expect(shell.drawer, 'the sidebar is a drawer, and shut').not.toBe('open')
      } else {
        expect(shell.sidebar, 'the sidebar is in the state asked').toBe(asked.sidebar)
        expect(shell.over, 'the sidebar stands beside the page').toBe('no')
      }
      const found = await page.evaluate(measureTheGeneralList)
      expect(found.rows, found.layout).toBe(GENERAL_FLOWS.length)
      expect(found.narrow, `a cell narrower than its widest word: ${found.layout}`).toEqual([])
      expect(found.broken, `a word on more than one line: ${found.layout}`).toEqual([])
      expect(found.touching, `headings that touch: ${found.layout}`).toEqual([])
      expect(found.outside, `past the edge of the list: ${found.layout}`).toEqual([])
    } finally {
      await context.close()
    }
  }, 180_000)
})
