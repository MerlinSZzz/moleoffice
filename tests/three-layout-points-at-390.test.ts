// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THREE THINGS DRAWN OUT OF PLACE AT 390, MEASURED IN THE LIGHT LOOK AND THE DARK LOOK.
 *
 * Round 145's own pictures found them. This round redraws the sidebar and the bar that stands in its place on a phone,
 * so the three are put right here:
 *   1. On a checklist's page each box the person presses sat about 12px below the first line of its words.
 *   2. The bar at the top of the records list put its last press on a second row while the Decisions count was drawn.
 *      Home's bar did the same.
 *   3. The chat's own window stopped 4.5rem above the foot of the screen, to clear a circle that is not drawn at this
 *      width any more, so a strip of the page showed under the chat.
 *
 * WHAT IS MEASURED, in a real browser on a test office of this file's own:
 *   1. The middle of each box's mark is within 3px of the middle of the first line of its words, at 390 and at 1440.
 *   2. Every press and word in the bar stands on one row at 390, on the records list and on Home, with the Decisions
 *      count and the chat's count drawn, and the page's name is drawn whole, not cut. Menu, Decisions and the chat are
 *      drawn as icons: nothing in their three presses stands outside the press, so no word spills over an icon.
 *   3. The chat's own window at 390 reaches the foot of the screen, and a press just above the foot reaches the chat.
 *
 * THE PICTURES are taken only when W13Y_LAYOUT_PICTURES names a folder. They are of a made-up office, and each carries
 * the made-up label above the page. After the three, the person reads the agent's line and settles the fork, and the
 * records list is taken again with no count in the bar.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { pathFor } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const CALLED = 'three-layout-points-at-390'
const PICTURES = process.env['W13Y_LAYOUT_PICTURES']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const LOOKS = ['light', 'dark'] as const
const PHONE = { width: 390, height: 844 }
const AGENT = { name: 'Made-up Layout Agent', handle: 'made-up-layout-agent' }
const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const AS_THE_AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }

let app: LiveApp
let checklist = ''
let line = ''
let fork = ''
const originalOwnerName = process.env['MOLE_OFFICE_OWNER_NAME']

async function file(path: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const answer = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await answer.text()
  expect(answer.status, `${path}: ${text.slice(0, 600)}`).toBe(201)
  return JSON.parse(text) as Record<string, any>
}

beforeAll(async () => {
  process.env['MOLE_OFFICE_OWNER_NAME'] = 'Made-up caretaker'
  app = await liveApp({ name: CALLED, workspace: 'default', viewport: PHONE })
  // This test reads the count on the phone's top bar, which carries it only when the button stays while there are unread messages.
  const unreadOnly = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  await file('/api/records', { kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }, OWNER)
  // A line from the agent, so the chat has a count to draw in the bar.
  line = (await file('/api/records', {
    kind: 'message',
    title: 'A made-up line',
    data: { body: 'A made-up line for the layout pictures.', to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] },
  }, AS_THE_AGENT))['record'].id as string
  // A fork the person settles, so the bar draws the Decisions count.
  fork = (await file('/api/records', {
    kind: 'proposal',
    title: 'A made-up fork',
    data: {
      question: 'Which made-up shelf takes the new folders?',
      options: ['a — The top shelf.', 'b — The low shelf.'],
      recommendation: 'Take (a). It is empty.',
      because: 'Made up for the layout pictures.',
      who_settles_it: 'the owner',
    },
  }, AS_THE_AGENT))['record'].id as string
  // The person's own checklist, so each step draws the box the person presses. The second step's words take more
  // than one line at 390.
  checklist = (await file('/api/checklists', {
    title: 'A made-up shelving checklist',
    items: [
      { words: 'Label the made-up shelves.' },
      { words: 'Move the made-up folders from the old cupboard to the low shelf, oldest first, and keep the receipts together.' },
    ],
  }, OWNER))['checklist'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
  if (originalOwnerName === undefined) delete process.env['MOLE_OFFICE_OWNER_NAME']
  else process.env['MOLE_OFFICE_OWNER_NAME'] = originalOwnerName
}, 60_000)

type Look = { theme: 'light' | 'dark'; width?: number; chat?: 'yes' | 'no' }

/** A fresh window whose stored choices are set before the app runs. */
async function aWindow(look: Look): Promise<{ context: BrowserContext; page: Page }> {
  const width = look.width ?? PHONE.width
  const context = await app.browser.newContext({ viewport: { width, height: width === PHONE.width ? PHONE.height : 900 } })
  await context.addInitScript(({ id, theme, chat }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', theme)
    localStorage.setItem('mole-office.chat.open', chat)
    localStorage.setItem('mole-office.workspace', 'default')
  }, { id: THE_TEST_OFFICES_OWNER.id, theme: look.theme, chat: look.chat ?? 'no' })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00'))
  return { context, page }
}

async function open(page: Page, address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Each pressable box on the checklist's page: how far the middle of its mark is from the middle of its words' first line. */
async function theBoxesAgainstTheirWords(page: Page): Promise<{ words: string; apart: number }[]> {
  await page.locator('.ck1 .ckp-box').first().waitFor({ timeout: 30_000 })
  return page.locator('.ck1 .ckp-item[data-box="yes"]').evaluateAll((items) => items.map((item) => {
    const mark = item.querySelector('.ckp-box .ckp-mark')
    const words = item.querySelector('.ckp-words')
    if (mark === null || words === null) throw new Error('a step with a box draws no mark or no words')
    // THE FIRST LETTER THE PERSON READS, past the words said only to a screen reader.
    const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('.ckp-hidden') === null && (node.textContent ?? '').trim() !== '' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    })
    const first = walker.nextNode()
    if (first === null) throw new Error('a step draws no words')
    const letter = document.createRange()
    const at = (first.textContent ?? '').search(/\S/)
    letter.setStart(first, at)
    letter.setEnd(first, at + 1)
    const line = letter.getBoundingClientRect()
    const box = mark.getBoundingClientRect()
    return {
      words: (words.textContent ?? '').trim().slice(0, 40),
      apart: Math.round((box.top + box.height / 2 - (line.top + line.height / 2)) * 10) / 10,
    }
  }))
}

/**
 * Every visible thing in the phone's bar, with where its middle stands; whether the page's name is cut; and each thing
 * drawn in Menu's, Decisions' or the chat's press that stands outside the press.
 */
async function theBar(page: Page): Promise<{ rows: number; parts: string[]; nameCut: boolean; spilled: string[] }> {
  return page.locator('.shell-bar').evaluate((bar) => {
    const parts = [...bar.children].filter((one) => one.getClientRects().length > 0)
    const middles = parts.map((one) => {
      const at = one.getBoundingClientRect()
      return at.top + at.height / 2
    })
    // TWO PARTS WHOSE MIDDLES ARE MORE THAN 8PX APART stand on two rows: the bar centres each part in its row.
    const rows = new Set(middles.map((middle) => middles.findIndex((other) => Math.abs(other - middle) <= 8))).size
    const name = bar.querySelector('.shell-bar-page')
    // A WORD DRAWN IN A 44PX PRESS beside its icon is wider than the press, and stands out of it on both sides.
    const spilled: string[] = []
    for (const press of bar.querySelectorAll('.shell-menu, .shell-bar-entry, .shell-chat-phone')) {
      const box = press.getBoundingClientRect()
      for (const one of press.querySelectorAll('*')) {
        const at = one.getBoundingClientRect()
        if (at.width === 0 && at.height === 0) continue
        if (at.left < box.left - 1 || at.right > box.right + 1 || at.top < box.top - 1 || at.bottom > box.bottom + 1) {
          spilled.push(`${(press.getAttribute('class') ?? '').split(' ')[0] || press.tagName}: ${(one.getAttribute('class') ?? '').split(' ')[0] || one.tagName} ${String(Math.round(at.left))} to ${String(Math.round(at.right))} in ${String(Math.round(box.left))} to ${String(Math.round(box.right))}`)
        }
      }
    }
    return {
      spilled,
      rows,
      parts: parts.map((one, index) => {
        const at = one.getBoundingClientRect()
        return `${one.className.split(' ')[0] ?? one.tagName} ${String(Math.round(at.width))}px wide at ${String(Math.round(at.left))},${String(Math.round(middles[index]!))}`
      }),
      nameCut: name === null || name.scrollWidth > name.clientWidth,
    }
  })
}

it("1. each checklist step's box stands level with the first line of its words, at 390 and at 1440", async () => {
  for (const theme of LOOKS) {
    for (const width of [PHONE.width, 1440]) {
      const { context, page } = await aWindow({ theme, width })
      try {
        await open(page, `/checklists/${checklist}`)
        const boxes = await theBoxesAgainstTheirWords(page)
        expect(boxes.length, `the steps with a box at ${String(width)} in the ${theme} look`).toBe(2)
        const off = boxes.filter((one) => Math.abs(one.apart) > 3)
        expect(off, `at ${String(width)} in the ${theme} look, the mark's middle against the first line's: ${JSON.stringify(boxes)}`).toEqual([])
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)

it("2. the bar at 390 is one row on the records list and on Home, with both counts drawn and the page's name whole", async () => {
  for (const theme of LOOKS) {
    for (const [called, address] of [['the records list', pathFor('records')], ['Home', '/']] as const) {
      const { context, page } = await aWindow({ theme })
      try {
        await open(page, address)
        await page.locator('.shell-bar [data-count="decisions"]').waitFor({ timeout: 30_000 })
        await page.locator('.shell-bar .shell-chat-count').waitFor({ timeout: 30_000 })
        const bar = await theBar(page)
        expect(bar.rows, `${called} in the ${theme} look: ${bar.parts.join('; ')}`).toBe(1)
        expect(bar.nameCut, `${called} in the ${theme} look: the page's name is cut`).toBe(false)
        expect(bar.spilled, `${called} in the ${theme} look: drawn outside its press`).toEqual([])
      } finally {
        await context.close()
      }
    }
  }
}, 240_000)

it("3. the chat's own window at 390 reaches the foot of the screen, with no strip of the page under it", async () => {
  for (const theme of LOOKS) {
    const { context, page } = await aWindow({ theme, chat: 'yes' })
    try {
      await open(page, '/')
      const panel = page.locator('.px-chat[data-where="corner"]')
      await panel.waitFor({ timeout: 30_000 })
      const drawn = await panel.evaluate((one) => {
        const at = one.getBoundingClientRect()
        const nearTheFoot = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 4)
        return {
          full: one.getAttribute('data-full'),
          bottom: Math.round(at.bottom),
          window: window.innerHeight,
          atTheFoot: nearTheFoot === null ? 'nothing' : nearTheFoot.closest('.px-chat') === null ? `the page (${nearTheFoot.tagName.toLowerCase()}.${nearTheFoot.className})` : 'the chat',
        }
      })
      // THE WINDOW, NOT THE FULL SCREEN: the full screen is a press of its own, which always covered the page.
      expect(drawn.full, `the ${theme} look`).toBe('no')
      expect(drawn.bottom, `the ${theme} look: the chat's foot against the window's`).toBe(drawn.window)
      expect(drawn.atTheFoot, `the ${theme} look: what a press just above the foot reaches`).toBe('the chat')
    } finally {
      await context.close()
    }
  }
}, 180_000)

it.skipIf(PICTURES === undefined)('takes the pictures of the three at 390 in both looks, then the bar with no count', async () => {
  const folder = PICTURES!
  mkdirSync(folder, { recursive: true })
  const label = async (page: Page): Promise<void> => {
    await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
    await page.waitForTimeout(600)
  }
  for (const theme of LOOKS) {
    const name = (what: string): string => join(folder, `${what}-390-${theme}.png`)
    {
      const { context, page } = await aWindow({ theme })
      try {
        await open(page, `/checklists/${checklist}`)
        await page.locator('.ck1 .ckp-box').first().waitFor({ timeout: 30_000 })
        await label(page)
        await page.screenshot({ path: name('checklist') })
        for (const [what, address] of [['records', pathFor('records')], ['home', '/']] as const) {
          await open(page, address)
          await page.locator('.shell-bar [data-count="decisions"]').waitFor({ timeout: 30_000 })
          await page.locator('.shell-bar .shell-chat-count').waitFor({ timeout: 30_000 })
          await label(page)
          await page.screenshot({ path: name(what) })
        }
      } finally {
        await context.close()
      }
    }
    {
      const { context, page } = await aWindow({ theme, chat: 'yes' })
      try {
        await open(page, '/')
        await page.locator('.px-chat[data-where="corner"]').waitFor({ timeout: 30_000 })
        await label(page)
        await page.screenshot({ path: name('chat-window') })
      } finally {
        await context.close()
      }
    }
  }
  // THE BAR WITH NO COUNT: the person reads the agent's line and settles the fork, so nothing waits on the person.
  const read = await fetch(`${app.api}/api/messages/${line}/mark`, { method: 'POST', headers: OWNER, body: JSON.stringify({ mark: 'seen' }) })
  expect(read.status, await read.text()).toBe(200)
  const settled = await fetch(`${app.api}/api/records/${fork}/promote`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ title: 'The made-up folders go on the top shelf', data: { because: 'Made up for the layout pictures.' } }),
  })
  expect(settled.status, await settled.text()).toBe(201)
  for (const theme of LOOKS) {
    const { context, page } = await aWindow({ theme })
    try {
      await open(page, pathFor('records'))
      // THE SIDEBAR HAS READ WHAT WAITS once it no longer says it is counting, so no count is no count, not one unread.
      await expect.poll(() => page.locator('.shell-counting').count(), { timeout: 30_000 }).toBe(0)
      await expect
        .poll(() => page.locator('.shell-bar [data-count="decisions"], .shell-bar .shell-chat-count').count(), { timeout: 30_000, message: `a count is still drawn in the bar in the ${theme} look` })
        .toBe(0)
      await label(page)
      await page.screenshot({ path: join(folder, `records-no-count-390-${theme}.png`) })
    } finally {
      await context.close()
    }
  }
}, 600_000)
