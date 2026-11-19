// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR OPENS WHILE THE CHAT IS BESIDE THE PAGE. Wave 13y round 166, package CR, item CR-6.
 *
 * The sidebar can be opened while the chat is beside the page. Before this round the sidebar was
 * folded to its icons for as long as the chat was beside the page, and its open press did nothing that could be seen.
 *
 * In a real browser against a Mole Office of its own, with the chat beside the page:
 *  1. At 1440, on the right and on the left. The sidebar starts folded. Its open press opens it: the page gives the
 *     room, the chat keeps its width, and a chat on the left moves over by what the sidebar took. Its fold press folds
 *     it again, and everything is where it was. The sidebar's own remembered choice does not change.
 *  2. The choice beside the chat is remembered after a reload, and it is its own: the sidebar's own choice is folded
 *     here and stays folded, and it is what the sidebar draws once the chat is put away. The project block's small
 *     press opens the sidebar beside the chat as well.
 *  3. At 1024, on the right and on the left, the page has no room for the open sidebar beside the chat. The open press
 *     opens it over the page, and over a chat on the left: nothing under it moves, and it is on top. A press outside it
 *     folds it.
 *  4. At 1440, open beside the page, the seam dragged to the chat's widest leaves the page no room for it: the sidebar
 *     stays open, over the page, and gives the page back its room.
 *  5. Folded beside a chat on the left, the sidebar draws its icons only, and an entry's name shows on hover, on top
 *     of the chat.
 *
 * THE PICTURES are taken only when W13Y_SIDEBAR_BESIDE names a folder outside the checkout: at 1440 folded and after
 * the open press, at 1024 after the open press, and at 990, 660 and 390, light and dark, with the chat on either side.
 * Below 1024 the chat is not beside the page: it covers the screen, so those pictures show that. They are made-up data,
 * and each carries the label that says so, where it can be seen. The picture case asks nothing, so it photographs the
 * code before this change as well.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SPLIT_LEAVES_THE_WINDOW } from '../src/web/lib/chat-split.ts'
import { liveApp, waitForThePage, theAnswerToAWriteInATestOffice, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** One made-up agent, with a short conversation for the pictures. */
const AGENT = { name: 'Made-up Kiln Keeper', handle: 'made-up-kiln-keeper', messages: 8 } as const
const output = process.env.W13Y_SIDEBAR_BESIDE
const LABEL = 'Made-up data — an invented office, not real office data'
/** The sidebar's own remembered choice, which only the sidebar's press away from the chat may change. */
const THE_SIDEBARS_OWN = 'mole-office.shell.sidebar'
const RAIL = '#shell-side'
const FOLD_PRESS = '#shell-side .shell-collapse'
const SPLIT = '.px-chat[data-where="split"]'
const HOMES_HEADING = '.hm-page-head'

type Side = 'right' | 'left'
type Shell = { rail: number; drawn: number; page: { x: number; width: number }; chat: { x: number; width: number } }

let app: LiveApp
let agentId = ''

async function say(headers: Record<string, string>, body: string, to: { kind: string; id: string }): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [to] } }) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { to: [to] } }))
}

/**
 * A browser window with the chat open beside the page, or covering the screen below 1024, on the made-up conversation.
 * The sidebar's own choice is left unsaid unless the case says it.
 */
async function aWindow(size: { width: number; height: number }, side: Side, start: { theme?: 'light' | 'dark'; own?: 'expanded' | 'collapsed' } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: size, colorScheme: start.theme ?? 'light' })
  // SET ONCE IN THIS WINDOW, so a reload keeps what the page itself wrote since.
  await context.addInitScript(
    ([theme, chatSide, key, ownKey, own]) => {
      if (sessionStorage.getItem('sidebar-test-set') === 'yes') return
      sessionStorage.setItem('sidebar-test-set', 'yes')
      localStorage.setItem('mole-office.preset.theme', theme)
      localStorage.setItem('mole-office.language', 'en')
      localStorage.setItem('mole-office.workspace', 'default')
      localStorage.setItem('mole-office.chat.open', 'split')
      localStorage.setItem('mole-office.chat.split-side', chatSide)
      localStorage.setItem('mole-office.chat.with', key)
      if (own !== '') localStorage.setItem(ownKey, own)
    },
    [start.theme ?? 'light', side, participantKey({ kind: 'agent', id: agentId }), THE_SIDEBARS_OWN, start.own ?? ''] as const,
  )
  // THE PICTURES BLUR THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, because it names the machine this test
  // runs on. The blur draws nothing new and moves nothing.
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.px-chat-from { filter: blur(5px); }'
      document.head.append(style)
    })
  })
  const page = await context.newPage()
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.px-chat:not([data-where="page"])').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(400)
  return { context, page }
}

async function reload(page: Page): Promise<void> {
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(SPLIT).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(400)
}

const stateOf = (page: Page): Promise<string | null> => page.getAttribute(RAIL, 'data-state')
const stored = (page: Page, key: string): Promise<string | null> => page.evaluate((one) => localStorage.getItem(one), key)

/** The sidebar's room in the flow, the width it is drawn at, the page's column, and the chat beside the page, in whole pixels. */
async function theShell(page: Page): Promise<Shell> {
  return page.evaluate(
    ([rail, split]) => {
      const box = (selector: string): DOMRect => {
        const found = document.querySelector(selector)?.getBoundingClientRect()
        if (found === undefined) throw new Error(`${selector} is not drawn`)
        return found
      }
      const room = box(rail)
      const drawn = box(`${rail} .shell-side-inner`)
      const body = box('.shell-body')
      const chat = box(split)
      return {
        rail: Math.round(room.width),
        // TO THE FURTHER RIGHT EDGE: in the flow the sidebar's border is on its room and not on its inside, and over the
        // page the inside reaches past its room.
        drawn: Math.round(Math.max(room.right, drawn.right) - room.left),
        page: { x: Math.round(body.x), width: Math.round(body.width) },
        chat: { x: Math.round(chat.x), width: Math.round(chat.width) },
      }
    },
    [RAIL, SPLIT] as const,
  )
}

/** Press the sidebar's open or fold press, and wait until the sidebar says it is drawn that way and has settled. */
async function press(page: Page, until: 'expanded' | 'collapsed', why: string): Promise<void> {
  await page.click(FOLD_PRESS)
  await expect.poll(() => stateOf(page), { message: why, timeout: 5_000 }).toBe(until)
  await page.waitForTimeout(400)
}

/** What is drawn on top at this point: the sidebar, the chat, or something else. */
function onTopAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([px, py, rail]) => {
      const found = document.elementFromPoint(px, py)
      if (found === null) return 'nothing'
      if (found.closest(rail) !== null) return 'the sidebar'
      if (found.closest('.px-chat') !== null) return 'the chat'
      return found.tagName.toLowerCase()
    },
    [x, y, RAIL] as const,
  )
}

/** A point on the page outside the sidebar where a press opens nothing, so that pressing it is only a press outside. */
async function aQuietPointOutside(page: Page, sidebarRight: number): Promise<{ x: number; y: number }> {
  const found = await page.evaluate(
    ([right]) => {
      const body = document.querySelector('.shell-body')?.getBoundingClientRect()
      if (body === undefined) return null
      for (let y = body.top + 120; y < body.bottom - 20; y += 40) {
        for (let x = body.right - 12; x > right + 12; x -= 24) {
          const there = document.elementFromPoint(x, y)
          if (there === null || there.closest('#shell-side, .px-chat') !== null) continue
          // The page's column takes the focus from the skip link with a tabindex of -1, and a press on it opens nothing.
          if (there.closest('a, button, input, textarea, select, summary, label, [role="button"], [tabindex]:not([tabindex="-1"])') !== null) continue
          return { x, y }
        }
      }
      return null
    },
    [sidebarRight] as const,
  )
  if (found === null) throw new Error('no point on the page outside the sidebar opens nothing')
  return found
}

/** Drag the seam until the chat beside the page is this wide, from a point well below the seam's shapes. */
async function dragTheSeamUntil(page: Page, width: number): Promise<void> {
  const chat = await page.locator(SPLIT).boundingBox()
  const seam = await page.locator('.px-chat-seam').boundingBox()
  if (chat === null || seam === null) throw new Error('the chat beside the page is not drawn')
  const from = { x: seam.x + seam.width / 2, y: seam.y + Math.round(seam.height * 0.6) }
  const left = (await page.evaluate(() => document.documentElement.getAttribute('data-chat-split'))) === 'left'
  const to = left ? from.x + (width - chat.width) : from.x - (width - chat.width)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to, from.y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  expect(Math.round((await page.locator(SPLIT).boundingBox())?.width ?? 0), 'the seam did not leave the chat at the width asked').toBe(width)
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-sidebar-beside-the-chat', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  agentId = agents.find((one) => one.handle === AGENT.handle)?.id ?? ''
  expect(agentId, AGENT.handle).not.toBe('')
  const asTheAgent = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
  for (let n = 1; n <= AGENT.messages; n += 1) {
    const line = `Made-up line ${String(n)} with ${AGENT.name}.`
    if (n % 2 === 0) await say(asTheAgent, line, { kind: 'person', id: THE_PERSON })
    else await say(PERSON, line, { kind: 'agent', id: agentId })
  }
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

for (const side of ['right', 'left'] as const) {
  it(`1. at 1440 with the chat on the ${side}, the open press opens the sidebar, the page gives the room, the chat keeps its width, and the fold press folds it again`, async () => {
    const { context, page } = await aWindow({ width: 1440, height: 900 }, side)
    try {
      await page.locator(SPLIT).waitFor({ timeout: 10_000 })
      expect(await stateOf(page), 'the sidebar does not start folded beside the chat').toBe('collapsed')
      const own = await stored(page, THE_SIDEBARS_OWN)
      const folded = await theShell(page)
      await press(page, 'expanded', 'the open press did not open the sidebar beside the chat')
      const open = await theShell(page)
      const took = open.rail - folded.rail
      expect(took, 'the open sidebar takes no more room than the folded one').toBeGreaterThan(100)
      expect(open.drawn, 'the open sidebar is not drawn in the room it takes').toBe(open.rail)
      expect(open.page.width, 'the page did not give the sidebar its room').toBe(folded.page.width - took)
      expect(open.chat.width, 'the chat did not keep its width').toBe(folded.chat.width)
      expect(open.chat.x, side === 'right' ? 'the chat on the right moved' : 'the chat on the left did not move over by what the sidebar took').toBe(folded.chat.x + (side === 'left' ? took : 0))
      expect(await stored(page, THE_SIDEBARS_OWN), "the sidebar's own choice changed").toBe(own)
      await press(page, 'collapsed', 'the fold press did not fold the sidebar beside the chat')
      expect(await theShell(page), 'folding the sidebar again did not put the page and the chat back').toEqual(folded)
      expect(await stored(page, THE_SIDEBARS_OWN), "the sidebar's own choice changed").toBe(own)
    } finally {
      await context.close()
    }
  }, 120_000)
}

it("2. the choice beside the chat is remembered after a reload, the sidebar's own choice is untouched, and the project block's small press opens it too", async () => {
  const { context, page } = await aWindow({ width: 1440, height: 900 }, 'right', { own: 'collapsed' })
  try {
    expect(await stateOf(page), 'the sidebar does not start folded beside the chat').toBe('collapsed')
    await press(page, 'expanded', 'the open press did not open the sidebar beside the chat')
    await reload(page)
    expect(await stateOf(page), 'the sidebar opened beside the chat is folded again after a reload').toBe('expanded')
    expect(await stored(page, THE_SIDEBARS_OWN), "the sidebar's own choice changed").toBe('collapsed')
    await page.click('.px-chat-seam-away')
    await page.locator(SPLIT).waitFor({ state: 'detached', timeout: 10_000 })
    await expect.poll(() => stateOf(page), { message: "with the chat put away, the sidebar does not draw its own choice" }).toBe('collapsed')
    await page.click(`${RAIL} .shell-chat`)
    await page.locator(SPLIT).waitFor({ timeout: 10_000 })
    await expect.poll(() => stateOf(page), { message: 'with the chat beside the page again, the sidebar does not draw the choice made beside it' }).toBe('expanded')
    await press(page, 'collapsed', 'the fold press did not fold the sidebar beside the chat')
    await reload(page)
    expect(await stateOf(page), 'the sidebar folded beside the chat is open again after a reload').toBe('collapsed')
    await page.click(`${RAIL} .sbp-mini`)
    await expect.poll(() => stateOf(page), { message: "the project block's small press did not open the sidebar beside the chat" }).toBe('expanded')
    expect(await stored(page, THE_SIDEBARS_OWN), "the sidebar's own choice changed").toBe('collapsed')
  } finally {
    await context.close()
  }
}, 120_000)

for (const side of ['right', 'left'] as const) {
  it(`3. at 1024 with the chat on the ${side}, the page has no room, so the sidebar opens over it, nothing moves, and a press outside folds it`, async () => {
    const { context, page } = await aWindow({ width: 1024, height: 800 }, side)
    try {
      await page.locator(SPLIT).waitFor({ timeout: 10_000 })
      const folded = await theShell(page)
      await press(page, 'expanded', 'the open press did not open the sidebar beside the chat')
      const over = await theShell(page)
      expect(over.drawn, 'the sidebar is not drawn open').toBeGreaterThan(folded.rail + 100)
      expect(over.rail, 'the sidebar took room from a page that has none to give').toBe(folded.rail)
      expect(over.page, 'the page moved under the sidebar').toEqual(folded.page)
      expect(over.chat, 'the chat moved under the sidebar').toEqual(folded.chat)
      const y = Math.round(800 / 2)
      expect(await onTopAt(page, folded.rail + Math.round((over.drawn - folded.rail) / 2), y), 'the open sidebar is not on top of what is beside it').toBe('the sidebar')
      const outside = await aQuietPointOutside(page, over.drawn)
      await page.mouse.click(outside.x, outside.y)
      await expect.poll(() => stateOf(page), { message: 'a press outside the sidebar did not fold it', timeout: 5_000 }).toBe('collapsed')
      await page.waitForTimeout(400)
      expect(await theShell(page), 'folding the sidebar moved the page or the chat').toEqual(folded)
    } finally {
      await context.close()
    }
  }, 120_000)
}

it('4. at 1440, open beside the page, the seam dragged to the widest moves the sidebar over the page and gives the page its room back', async () => {
  const { context, page } = await aWindow({ width: 1440, height: 900 }, 'right')
  try {
    await page.locator(SPLIT).waitFor({ timeout: 10_000 })
    const folded = await theShell(page)
    await press(page, 'expanded', 'the open press did not open the sidebar beside the chat')
    const open = await theShell(page)
    expect(open.rail, 'the open sidebar is not beside the page at 1440').toBeGreaterThan(folded.rail + 100)
    await dragTheSeamUntil(page, 1440 - SPLIT_LEAVES_THE_WINDOW)
    const wide = await theShell(page)
    expect(await stateOf(page), 'dragging the seam folded the sidebar').toBe('expanded')
    expect(wide.rail, 'the sidebar stayed in the page where it leaves the page less than its smallest width').toBe(folded.rail)
    expect(wide.drawn, 'the sidebar is not drawn open over the page').toBe(open.drawn)
    expect(await onTopAt(page, folded.rail + Math.round((wide.drawn - folded.rail) / 2), 450), 'the open sidebar is not on top of the page').toBe('the sidebar')
  } finally {
    await context.close()
  }
}, 120_000)

it('5. folded beside a chat on the left, the sidebar draws its icons only, and a name shows on hover, on top of the chat', async () => {
  const { context, page } = await aWindow({ width: 1440, height: 900 }, 'left')
  try {
    await page.locator(SPLIT).waitFor({ timeout: 10_000 })
    expect(await stateOf(page), 'the sidebar does not start folded beside the chat').toBe('collapsed')
    const entry = page.locator(`${RAIL} .shell-link`).first()
    // THE WORD IS KEPT FOR A SCREEN READER in a box one pixel wide, which the browser still counts as seen, so its width is
    // what is asked.
    const word = await entry.locator('.shell-label').boundingBox()
    expect(word === null || word.width <= 1, 'the folded sidebar draws an entry with its word').toBe(true)
    await entry.hover()
    const tip = page.locator('.shell-tip')
    await tip.waitFor({ timeout: 5_000 })
    expect((await tip.textContent())?.trim() ?? '', 'the name beside the entry is empty').not.toBe('')
    // THE NAME TAKES NO PRESS, so the browser looks through it for what is under a point. Here it is made to take one, to
    // ask what is drawn on top where it stands.
    await page.addStyleTag({ content: '.shell-tip { pointer-events: auto !important; }' })
    const where = await tip.boundingBox()
    if (where === null) throw new Error('the name beside the entry is not drawn')
    const onTop = await page.evaluate(
      ([x, y]) => {
        const found = document.elementFromPoint(x, y)
        return found?.closest('.shell-tip') ? 'the name' : found?.closest('.px-chat') ? 'the chat' : (found?.tagName.toLowerCase() ?? 'nothing')
      },
      [where.x + where.width / 2, where.y + where.height / 2] as const,
    )
    expect(onTop, 'the name beside the entry is drawn under the chat on the left').toBe('the name')
  } finally {
    await context.close()
  }
}, 120_000)

it.runIf(output)('photographs the sidebar beside the chat at 1440 folded and open, at 1024 open, and the covering chat at 990, 660 and 390, light and dark, the chat on either side', async () => {
  if (output === undefined) throw new Error('the pictures need W13Y_SIDEBAR_BESIDE')
  const dir = join(output, 'pictures')
  mkdirSync(dir, { recursive: true })
  /** Where the label goes in each picture: above Home's heading, or above the conversation's head where the page is covered. */
  const shots: { name: string; size: { width: number; height: number }; side: Side; open: boolean; label: 'home' | 'chat' }[] = []
  for (const side of ['right', 'left'] as const) {
    shots.push({ name: `${side}-1440-folded`, size: { width: 1440, height: 900 }, side, open: false, label: 'home' })
    shots.push({ name: `${side}-1440-open`, size: { width: 1440, height: 900 }, side, open: true, label: 'home' })
    shots.push({ name: `${side}-1024-open`, size: { width: 1024, height: 800 }, side, open: true, label: side === 'right' ? 'chat' : 'home' })
    shots.push({ name: `${side}-990`, size: { width: 990, height: 800 }, side, open: false, label: 'chat' })
  }
  shots.push({ name: 'right-660', size: { width: 660, height: 900 }, side: 'right', open: false, label: 'chat' })
  shots.push({ name: 'right-390', size: { width: 390, height: 844 }, side: 'right', open: false, label: 'chat' })
  for (const theme of ['light', 'dark'] as const) {
    for (const shot of shots) {
      const { context, page } = await aWindow(shot.size, shot.side, { theme })
      try {
        await page.locator('.px-chat:not([data-where="page"]) .px-chat-them', { hasText: AGENT.name }).waitFor({ timeout: 30_000 })
        if (shot.open) {
          await page.click(FOLD_PRESS)
          await page.waitForTimeout(600)
        }
        const name = `${shot.name}-${theme}`
        const above = shot.label === 'home' ? page.locator(HOMES_HEADING).first() : page.locator('.px-chat:not([data-where="page"]) .px-chat-them').first()
        await putTheMadeUpLabelIn(page, LABEL, above, name)
        await page.waitForTimeout(400)
        // THE LABEL IS SEEN WHERE IT STANDS: a picture whose label is under the sidebar or the chat is not taken.
        const seen = await page.evaluate(() => {
          const label = document.querySelector('[data-made-up-label]')?.getBoundingClientRect()
          if (label === undefined) return false
          const found = document.elementFromPoint(label.left + 12, label.top + label.height / 2)
          return found?.closest('[data-made-up-label]') !== null && found !== null
        })
        expect(seen, `the label in ${name} is covered`).toBe(true)
        await page.screenshot({ path: join(dir, `${name}.png`) })
      } finally {
        await context.close()
      }
    }
  }
}, 600_000)
