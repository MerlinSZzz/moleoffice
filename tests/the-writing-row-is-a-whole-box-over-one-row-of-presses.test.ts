// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITING ROW IS A WHOLE BOX OVER ONE ROW OF PRESSES (wave 13y, the owner's writing row).
 *
 * The owner looked at the chat's writing row and asked for four things only: attach, the box, Send, and the label
 * choice beside Send. Send-first (Inject) and its triangle leave the person's row. The quote press stays. The label
 * flag moves to just left of Send, in a border of its own, and shows the chosen label's short word. Design D draws the
 * box across the whole row with a fixed row of presses beneath it.
 *
 * WHAT THIS FILE PROVES, in a real browser, against a real office, with the chat in its window and beside the page:
 *   1. THE BOX SPANS THE ROW, AND THE PRESSES STAND IN ONE ROW BENEATH IT, in this order from the left: attach, quote,
 *      the label flag, Send. Attach is at the row's left end and Send at its right end; the flag stands next to Send,
 *      nearer to it than to the quote press. Every press of the writing row is in that row, so none is above the box,
 *      and there is no triangle. The flag has a border of its own. At 1440 in the window and beside the page, at 990
 *      and 660 beside the page, and at 390 in the window.
 *   2. THE ROW OF PRESSES KEEPS ITS SIZE AS THE TEXT GROWS. Ten lines typed make the box taller; the row and each
 *      press keep their height and width, and the row stays under the box.
 *
 *   MUTATION A: the flag drawn above the box again in a narrow chat. Red on 1.
 *   MUTATION B: the row of presses stretched to the height of the box. Red on 2.
 *   MUTATION C: the flag shows the long name. Red on 3.
 *
 * The words are read from the word lists, never copied. Everything here is made up: the agent and its one line. The
 * servers come from `liveApp` in tests/helpers.ts, on a database in its own temporary folder.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { enWave13n } from '../src/shared/words/en-wave-13n.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE FLAG'S SHORT WORDS, read from the word lists by their keys. Read through a plain record, so this file reads the
 * same before and after the words are added; a word that is not there is said at once rather than compared as nothing.
 */
function theWord(list: Readonly<Record<string, unknown>>, key: string): string {
  const word = list[key]
  if (typeof word !== 'string' || word === '') throw new Error(`the word list has no word for ${key}`)
  return word
}
const SHORT_JUST_ASK = 'chat.intent.short.justAsk'
const SHORT_PROPOSAL_FIRST = 'chat.intent.short.proposalFirst'

type Where = 'window' | 'right'

let app: LiveApp
let agentId = ''

beforeAll(async () => {
  app = await liveApp({ name: 'writing-row', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Made-up Builder', data: { handle: 'made-up-builder', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await listed.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  agentId = agents.find((one) => one.handle === 'made-up-builder')?.id ?? ''
  expect(agentId, 'made-up-builder has no registry row').not.toBe('')
  // ONE LINE SO THE CONVERSATION EXISTS.
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-builder' },
    body: JSON.stringify({ kind: 'message', title: 'Ready', data: { body: 'Made-up line: ready when you are.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A browser window of its own on Home, with the chat in its window or beside the page, in this language. */
async function aWindow(width: number, where: Where, language: 'en' | 'zh' = 'en'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: 'light' })
  await context.addInitScript((open) => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', open)
    localStorage.setItem('mole-office.chat.split-side', 'right')
  }, where === 'window' ? 'yes' : 'split')
  const page = await context.newPage()
  // THE LANGUAGE IS THE ADDRESS'S, as every other browser test here chooses it.
  await page.goto(`${app.site}/?lang=${language}#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id: agentId })] as const)
  await page.waitForSelector('.px-chat-them', { timeout: 30_000 })
  await page.waitForSelector('.px-chat-write textarea', { timeout: 30_000 })
  return { context, page }
}

interface Place {
  left: number
  right: number
  top: number
  bottom: number
}

/** Where the writing row, its box, its row of presses and each press are drawn. */
async function theRow(page: Page) {
  return page.evaluate(() => {
    const place = (one: Element | null): Place | null => {
      if (one === null) return null
      const r = one.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    const named = (one: Element): string => (one.getAttribute('class') ?? '').split(' ')[0] || one.tagName.toLowerCase()
    const write = document.querySelector('.px-chat-write')
    const presses = write?.querySelector('.px-chat-presses') ?? null
    const drawn = (one: Element): boolean => {
      const r = one.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(one).visibility !== 'hidden'
    }
    const style = write === null || write === undefined ? null : getComputedStyle(write)
    const flag = presses?.querySelector('.px-chat-intent') ?? null
    const flagStyle = flag === null ? null : getComputedStyle(flag)
    return {
      // THE ROW'S INSIDE: the writing row less its padding, which is the room the box and the presses share.
      inside:
        write === null || write === undefined || style === null
          ? null
          : {
              left: write.getBoundingClientRect().left + parseFloat(style.paddingLeft),
              right: write.getBoundingClientRect().right - parseFloat(style.paddingRight),
            },
      box: place(write?.querySelector('.px-chat-box') ?? null),
      row: place(presses),
      // EVERY PRESS DRAWN IN THE WRITING ROW, in the row's order, and where each is.
      pressesInTheRow: presses === null ? [] : [...presses.querySelectorAll('button')].filter(drawn).map((one) => ({ name: named(one), at: place(one)! })),
      outsideTheRow: [...(write?.querySelectorAll('button') ?? [])].filter((one) => drawn(one) && (presses === null || !presses.contains(one))).map(named),
      triangles: document.querySelectorAll('.px-chat-write .px-chat-more').length,
      flagBorder: flagStyle === null ? null : { style: flagStyle.borderTopStyle, width: parseFloat(flagStyle.borderTopWidth) },
    }
  })
}

/** The words the flag draws for a sighted reader: its text less the words only a screen reader reads. */
async function theFlagShows(page: Page): Promise<string> {
  return page.locator('.px-chat-presses .px-chat-intent').evaluate((flag) => {
    const copy = flag.cloneNode(true) as HTMLElement
    for (const hidden of copy.querySelectorAll('.sr-only')) hidden.remove()
    return (copy.textContent ?? '').trim()
  })
}

/** Open the flag's list and choose the line for this mark. */
async function choose(page: Page, mark: 'none' | 'just-ask' | 'proposal-first'): Promise<void> {
  await page.click('.px-chat-presses .px-chat-intent')
  await page.waitForSelector('.px-menu', { timeout: 10_000 })
  await page.click(`.px-menu .px-menu-item:has(.px-chat-intent-line[data-intent="${mark}"])`)
  await page.waitForSelector('.px-menu', { state: 'detached', timeout: 10_000 })
}

const ORDER = ['px-chat-attach-add', 'px-chat-quote-press', 'px-chat-intent', 'px-chat-send']

describe('the writing row is a whole box over one row of presses', () => {
  for (const [width, where] of [[1440, 'window'], [1440, 'right'], [990, 'right'], [660, 'right'], [390, 'window']] as const) {
    it(`draws the box across the row and attach, quote, the flag and Send beneath it, at ${String(width)} with the chat ${where === 'window' ? 'in its window' : 'beside the page'}`, async () => {
      const { context, page } = await aWindow(width, where)
      try {
        const drawn = await theRow(page)
        expect(drawn.triangles, 'a triangle is drawn beside Send').toBe(0)
        expect(drawn.outsideTheRow, 'a press of the writing row is drawn outside the row of presses').toEqual([])
        expect(drawn.pressesInTheRow.map((one) => one.name), 'the presses, from the left').toEqual(ORDER)
        const { inside, box, row } = drawn
        if (inside === null || box === null || row === null) throw new Error(`the writing row lacks a part: ${JSON.stringify(drawn)}`)
        // THE BOX SPANS THE ROW, and the presses stand beneath it.
        expect(Math.abs(box.left - inside.left), 'the box does not start at the row\'s left').toBeLessThanOrEqual(1)
        expect(Math.abs(box.right - inside.right), 'the box does not reach the row\'s right').toBeLessThanOrEqual(1)
        expect(row.top, 'the row of presses is not beneath the box').toBeGreaterThanOrEqual(box.bottom - 0.5)
        const [attach, quote, flag, send] = drawn.pressesInTheRow.map((one) => one.at) as [Place, Place, Place, Place]
        // ATTACH AT THE LEFT END AND SEND AT THE RIGHT END, each press left of the next, on one line.
        expect(Math.abs(attach.left - inside.left), 'attach is not at the row\'s left end').toBeLessThanOrEqual(1)
        expect(Math.abs(send.right - inside.right), 'Send is not at the row\'s right end').toBeLessThanOrEqual(1)
        expect(attach.right, 'attach is not left of quote').toBeLessThanOrEqual(quote.left + 0.5)
        expect(quote.right, 'quote is not left of the flag').toBeLessThanOrEqual(flag.left + 0.5)
        expect(flag.right, 'the flag is not left of Send').toBeLessThanOrEqual(send.left + 0.5)
        const middle = (one: Place): number => (one.top + one.bottom) / 2
        for (const one of [quote, flag, send]) expect(Math.abs(middle(one) - middle(attach)), 'the presses are not on one line').toBeLessThanOrEqual(1)
        // THE FLAG STANDS WITH SEND, AT THE RIGHT, and not with the presses at the left.
        expect(send.left - flag.right, 'the flag is nearer to quote than to Send').toBeLessThan(flag.left - quote.right)
        expect(drawn.flagBorder?.style, 'the flag has no border of its own').not.toBe('none')
        expect(drawn.flagBorder?.width ?? 0, 'the flag has no border of its own').toBeGreaterThanOrEqual(1)
      } finally {
        await context.close()
      }
    }, 120_000)
  }

  it('keeps the row of presses the same size while the box grows with ten lines of text', async () => {
    const { context, page } = await aWindow(1440, 'right')
    try {
      const before = await theRow(page)
      await page.fill('.px-chat-write textarea', Array.from({ length: 10 }, (_, n) => `Made-up line ${String(n + 1)}`).join('\n'))
      await expect
        .poll(async () => ((await theRow(page)).box?.bottom ?? 0) - ((await theRow(page)).box?.top ?? 0), { message: 'the box did not grow', timeout: 10_000 })
        .toBeGreaterThan(((before.box?.bottom ?? 0) - (before.box?.top ?? 0)) * 3)
      const after = await theRow(page)
      const size = (one: Place | null): [number, number] => (one === null ? [0, 0] : [one.right - one.left, one.bottom - one.top])
      const [rowWide, rowHigh] = size(after.row)
      const [wasWide, wasHigh] = size(before.row)
      expect(Math.abs(rowHigh - wasHigh), 'the row of presses changed its height').toBeLessThanOrEqual(0.5)
      expect(Math.abs(rowWide - wasWide), 'the row of presses changed its width').toBeLessThanOrEqual(0.5)
      expect(after.pressesInTheRow.map((one) => one.name)).toEqual(ORDER)
      for (const [at, one] of after.pressesInTheRow.entries()) {
        const [wide, high] = size(one.at)
        const [wasPressWide, wasPressHigh] = size(before.pressesInTheRow[at]?.at ?? null)
        expect(Math.abs(wide - wasPressWide), `${one.name} changed its width`).toBeLessThanOrEqual(0.5)
        expect(Math.abs(high - wasPressHigh), `${one.name} changed its height`).toBeLessThanOrEqual(0.5)
      }
      expect(after.row?.top ?? 0, 'the row of presses is not beneath the grown box').toBeGreaterThanOrEqual((after.box?.bottom ?? 0) - 0.5)
    } finally {
      await context.close()
    }
  }, 120_000)

  it("shows the chosen label's short word on the flag, and nothing for none", async () => {
    const { context, page } = await aWindow(1440, 'right')
    try {
      expect(await theFlagShows(page), 'the flag shows a word with no label chosen').toBe('')
      await choose(page, 'just-ask')
      expect(await theFlagShows(page)).toBe(theWord(enWave13y, SHORT_JUST_ASK))
      // THE LONG NAME STAYS THE FLAG'S NAME, for a reader who hears the page.
      expect(await page.locator('.px-chat-presses .px-chat-intent').getAttribute('aria-label')).toContain(enWave13n['message.intent.name.justAsk'])
      await choose(page, 'proposal-first')
      expect(await theFlagShows(page)).toBe(theWord(enWave13y, SHORT_PROPOSAL_FIRST))
      expect(await page.locator('.px-chat-presses .px-chat-intent').getAttribute('aria-label')).toContain(enWave13n['message.intent.name.proposalFirst'])
      await choose(page, 'none')
      expect(await theFlagShows(page), 'the flag still shows a word after none was chosen').toBe('')
    } finally {
      await context.close()
    }
  }, 120_000)

})
