// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CORNER CHAT BUTTON SITS BOTTOM-RIGHT, CAN BE PRESSED, AND NO PAGE KEEPS A COLUMN CLEAR FOR IT.
 * No room is reserved beside the button, as a decision and point 4 of a message both
 * say. It may cover text, because a person who cannot see something
 * scrolls.
 *
 * WHAT THIS REPLACES. Until wave 13q's round 23 this file had another name, "the corner button covers no text". It
 * held a rule from problem GGN2mTJPKphn: every page kept a column down its right edge as wide as the button reaches
 * in (a border on .shell-main > .page in src/web/App.tsx, the token --fab-reach), and the plan table at phone width
 * reached into it. The decision replaced that rule, so this file now holds the new one:
 *
 *   1. The button is at the window's bottom-right corner: its right and bottom edges are the
 *      button's own inset (--fab-inset) from the window's, read from the stylesheet, at 1440.
 *   2. It can be pressed: the element at its centre is the button or inside it.
 *   3. No page keeps a column for it: the page draws no right border, and its right padding is its left padding, at
 *      390 and 1440, on Home and on an agent's page; the route tabs above a page are the same; and the plan
 *      table's box at 390 neither reaches past the page nor keeps room at its end for the button.
 *
 * The room at the page's foot, under its last line, is another rule (tests/the-corner-button-leaves-the-last-line-
 * visible.test.ts) and is not touched here.
 *
 * MUTATION, red: put the border back on .shell-main > .page in src/web/App.tsx.
 *
 * The servers come from `liveApp` in tests/helpers.ts, with a test office of its own and a made-up agent. Nothing here
 * touches the live office. With W13Q_FAB_SHOTS set to a folder, it also photographs Home, the agent page and the plan
 * page at 390 in the light look, with the button over the content.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SHELL_WIDTH } from '../src/web/lib/the-shell-width.ts'

let live: LiveApp
let planId = ''
const shots = process.env.W13Q_FAB_SHOTS
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const WIDTHS = [1440, 390] as const
const LOOKS = ['light'] as const
const PAGES = [
  ['the home page', '#/', '.hm-page', 'home'],
  ['the agent page', '#/who/agent/wren', '[data-target="uiSurface/profile.theircard"]', 'agent'],
] as const

beforeAll(async () => {
  live = await liveApp({ name: 'corner-button-bottom-right', viewport: { width: 390, height: 800 }, workspace: 'default' })
  // This case exercises the explicit unread-only choice.
  const unreadOnly = await fetch(`${live.api}/api/participants/person/${THE_PERSON}`, {
    method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ chatButtonStays: 'when-unread' }),
  })
  expect(unreadOnly.status, await unreadOnly.clone().text()).toBe(200)
  // A MADE-UP NAME FOR THE PERSON when pictures are taken, so none carries the test person's own (the agent page says
  // who chose its card). The ordinary run draws no picture and leaves the name alone.
  if (shots) {
    const renamed = await fetch(`${live.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: AS_THE_OWNER, body: JSON.stringify({ name: 'Morgan Vale' }) })
    expect(renamed.status, await renamed.text()).toBe(200)
    mkdirSync(shots, { recursive: true })
  }
  const started = await fetch(`${live.api}/api/agents/started`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ handle: 'wren', name: 'Wren', role: 'secretary' }),
  })
  expect(started.status, await started.text()).toBe(201)
  // DESIGN D DRAWS THE CORNER CIRCLE ONLY WHILE A MESSAGE WAITS, so one made-up message waits for the person.
  const keeper = await fetch(`${live.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Corner Keeper', data: { handle: 'corner-keeper', runtime: 'claude-code', state: 'active' } }),
  })
  expect(keeper.status, await keeper.text()).toBe(201)
  const waiting = await fetch(`${live.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'corner-keeper' },
    body: JSON.stringify({ kind: 'message', title: 'A made-up line for the corner button', data: { body: 'A made-up line for the corner button.', to: [{ kind: 'person', id: THE_PERSON }] } }),
  })
  expect(waiting.status, await waiting.text()).toBe(201)
  const made = await fetch(`${live.api}/api/plans`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      title: 'Test plan paper lamps',
      body: [
        '# Test plan paper lamps',
        '- sort the lamps {size: 15h} {time: 15h this week} {note: ask Sam first}',
        '  - fold the shades {size: very big}',
        '- hang the lamps {project: robotics}',
        '- [ ] read the paper',
      ].join('\n'),
    }),
  })
  expect(made.status, await made.clone().text()).toBeLessThan(300)
  planId = ((await made.json()) as { plan: { id: string } }).plan.id
}, 180_000)

afterAll(async () => {
  await live?.stop()
})

async function open(width: number, look: 'light' | 'dark', address: string, ready: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await live.browser.newContext({ viewport: { width, height: 800 } })
  await context.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
  const page = await context.newPage()
  await page.goto(`${live.site}/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(ready).first().waitFor({ timeout: 30_000 })
  // DESIGN D DRAWS THE CIRCLE AT THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH) AND WIDER; BELOW IT THE TOP BAR'S CHAT PRESS IS THE DRAWN WAY.
  await page.locator(width >= THE_SHELL_WIDTH ? '.px-chat-circle' : '.shell-bar .shell-chat-phone').waitFor({ timeout: 30_000 })
  return { page, close: () => context.close() }
}

/** Where the button is, what a press at its centre reaches, and what the page keeps at its right edge. */
async function readTheCorner(page: Page) {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.px-chat-circle')
    if (button === null) throw new Error('no corner button is drawn')
    const box = button.getBoundingClientRect()
    const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fab-inset')) *
      parseFloat(getComputedStyle(document.documentElement).fontSize)
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    const pageBox = document.querySelector<HTMLElement>('.shell-main > .page')
    const style = pageBox === null ? null : getComputedStyle(pageBox)
    const tabs = document.querySelector<HTMLElement>('.px-where')
    const tabStyle = tabs === null ? null : getComputedStyle(tabs)
    return {
      fromRight: window.innerWidth - box.right,
      fromBottom: window.innerHeight - box.bottom,
      inset,
      pressable: atCentre !== null && (atCentre === button || button.contains(atCentre)),
      border: style === null ? null : parseFloat(style.borderRightWidth),
      padRight: style === null ? null : parseFloat(style.paddingRight),
      padLeft: style === null ? null : parseFloat(style.paddingLeft),
      tabsRight: tabStyle === null ? null : parseFloat(tabStyle.paddingRight),
      tabsLeft: tabStyle === null ? null : parseFloat(tabStyle.paddingLeft),
    }
  })
}

/** What the page keeps at its right edge, read without needing a button to be drawn. */
async function readThePageRoom(page: Page) {
  return page.evaluate(() => {
    const pageBox = document.querySelector<HTMLElement>('.shell-main > .page')
    const style = pageBox === null ? null : getComputedStyle(pageBox)
    const tabs = document.querySelector<HTMLElement>('.px-where')
    const tabStyle = tabs === null ? null : getComputedStyle(tabs)
    return {
      border: style === null ? null : parseFloat(style.borderRightWidth),
      padRight: style === null ? null : parseFloat(style.paddingRight),
      padLeft: style === null ? null : parseFloat(style.paddingLeft),
      tabsRight: tabStyle === null ? null : parseFloat(tabStyle.paddingRight),
      tabsLeft: tabStyle === null ? null : parseFloat(tabStyle.paddingLeft),
    }
  })
}

it('sits at the bottom-right corner where design D draws it, can be pressed, and no page keeps a column for it, at 390 and 1440', async () => {
  for (const width of WIDTHS) {
    for (const look of LOOKS) {
      for (const [name, address, ready, file] of PAGES) {
        const { page, close } = await open(width, look, address, ready)
        try {
          const where = `${name} at ${String(width)} in the ${look} look`
          if (width >= THE_SHELL_WIDTH) {
            const at = await readTheCorner(page)
            expect(at.fromRight, `${where}: the button is not at the right edge`).toBeCloseTo(at.inset, 0)
            expect(at.fromBottom, `${where}: the button is not at the bottom edge`).toBeCloseTo(at.inset, 0)
            expect(at.pressable, `${where}: a press at the button's centre does not reach it`).toBe(true)
          } else {
            // DESIGN D DRAWS NO CORNER CIRCLE BELOW THE WIDTH AT WHICH THE PAGE TURNS WIDE (THE_SHELL_WIDTH); THE TOP BAR'S CHAT PRESS IS THE DRAWN WAY.
            expect(await page.locator('.px-chat-circle').count(), `${where}: the corner circle was drawn below ${String(THE_SHELL_WIDTH)}`).toBe(0)
            expect(await page.locator('.shell-bar .shell-chat-phone').count(), `${where}: the top bar's chat press was not drawn`).toBe(1)
          }
          const room = await readThePageRoom(page)
          expect(room.border, `${where}: the page is not drawn`).not.toBeNull()
          expect(room.border, `${where}: the page keeps a column down its right edge`).toBe(0)
          expect(room.padRight, `${where}: the page's right padding differs from its left`).toBe(room.padLeft)
          if (room.tabsRight !== null) expect(room.tabsRight, `${where}: the route tabs keep a column`).toBe(room.tabsLeft)
          if (shots && width === 390) await page.screenshot({ path: join(shots, `${file}-390-${look}.png`) })
        } finally {
          await close()
        }
      }
    }
  }
}, 300_000)

it('draws the plan table at 390 inside the page, with no room kept at its end for the button', async () => {
  for (const look of LOOKS) {
    const { page, close } = await open(390, look, `#/plans/${planId}/edit`, '.op-views .op-view')
    try {
      await page.locator('.op-views .op-view').nth(2).click()
      await page.locator('.pt-wrap').first().waitFor({ timeout: 30_000 })
      const seen = await page.evaluate(() => {
        const wrap = document.querySelector<HTMLElement>('.pt-wrap')!
        const holder = wrap.parentElement!
        const pageBox = document.querySelector<HTMLElement>('.shell-main > .page')!
        const inner = pageBox.getBoundingClientRect().right - parseFloat(getComputedStyle(pageBox).paddingRight)
        return {
          wrapPad: parseFloat(getComputedStyle(wrap).paddingRight),
          holderMargin: parseFloat(getComputedStyle(holder).marginRight),
          right: wrap.getBoundingClientRect().right,
          inner,
        }
      })
      const where = `the plan table at 390 in the ${look} look`
      expect(seen.wrapPad, `${where}: the table keeps room at its end for the button`).toBe(0)
      expect(seen.holderMargin, `${where}: the table reaches past the page`).toBe(0)
      expect(seen.right, `${where}: the table runs past the page's own edge`).toBeLessThanOrEqual(seen.inner + 0.5)
      if (shots) await page.screenshot({ path: join(shots, `plan-390-${look}.png`) })
    } finally {
      await close()
    }
  }
}, 180_000)
