// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT'S LAYOUT: ONE ROW FOR THE PROJECT AND THE FILTER, LESS ROOM AT THE TOP, AND A PANEL THAT MOVES. Wave 13y
 * round 113, item 45 of the line's requirements, from the decision on the chat's layout, points 3, 4 and 5, as
 * the line's secretary set them out in the same round.
 *
 * POINT 3. The project and the filter share one row, the project as a small block left of the filter. The row is hidden
 * and shows on a scroll up, by a wheel or by a finger, and hides on a scroll down. It stays while it narrows the list
 * (words typed, or one project chosen) and while it has the focus. The other two tabs get the project block alone.
 * Round 148, item 104: the owner's design of 30 October shows the row only when the list is already at its very top and
 * the person scrolls up further. A scroll up anywhere else in the list leaves it hidden, and so does the scroll that
 * reaches the top.
 *
 * POINT 4. Less room at the top. The panel's top row is as small as its two presses. The reader's own row is one line:
 * picture, name, whether they are here, and a pencil while they have no status, which opens the status editor of
 * round 80 and closes as it does. A status takes a line of its own only when there is one. No lone dash is drawn
 * anywhere in the chat: a group with nobody in it is not drawn, except while its side is edited, and the other places
 * that drew a dash draw nothing, with the sentence kept for screen readers. The chat page keeps its heading on the
 * screen, because the criterion asks every page to name itself where a reader looks.
 *
 * POINT 5. Holding the top row for half a second unlocks the panel, and then it can be dragged anywhere. Done, Escape and
 * closing lock it again, and "Back to the corner" puts it back. The place is kept in this browser and pulled back
 * inside a smaller window. Nothing moves below 640 pixels, while the panel fills the window, or on the chat page.
 *
 * Test change (wave 13y round 166, package CR, item CR-2): the window moves by a plain drag, with
 * no hold. So the move case now presses the top row and drags at once, and the window follows. A press that does not
 * move is still a press on the control under it: the full-screen press fills the window. A drag that starts on that
 * press moves the window and does not fill it. There is no Done, no "Drag to move" and no Escape lock any more, and the
 * top row's title no longer asks for a hold. "Back to the corner" is drawn while the window is off its corner. A drag
 * far past any edge leaves the whole window on the screen. The case for where nothing moves drags instead of holding,
 * and the pictures and the film at 1440 drag too.
 *
 * The top row carries no hover sentence now, as decided. The cases read whether it moves the window from its
 * `data-moves` value instead.
 *
 * THE PICTURES AND THE TWO FILMS are taken only when W13Y_CHAT_LAYOUT names a folder outside the checkout. They are
 * made-up data, and each picture carries the label that says so; each film carries it from its first frame.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { seedStatusOffice, STATUS_FIXTURE as F, STATUS_PERSON } from './status-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { participantKey } from '../src/shared/messages.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'
import { placeFromWhatWasStored, placeHeldInside, sizeHeldInside } from '../src/web/components/Chat.tsx'
import { enWave13y as WORDS } from '../src/shared/words/en-wave-13y.ts'

const output = process.env.W13Y_CHAT_LAYOUT
const LABEL = 'Made-up data — an invented office, not real office data'
const CORNER = '.px-chat[data-where="corner"]'
const PAGE = '.px-chat[data-where="page"]'
const FIND = `${CORNER} .px-chat-find`
const LIST = `${CORNER} .px-chat-under-tabs`
const TOP_ROW = `${CORNER} .px-chat-chrome`
/** Where the browser keeps the place, as Chat.tsx writes it. */
const PLACE_KEY = 'mole-office.chat.place'
/** A person the reader can talk to, who has written no status. Invented. */
const VISITOR = { id: 'layout-visitor', name: 'Invented visitor' }

let app: LiveApp
let t: TestDb

beforeAll(async () => {
  t = await freshDb()
  const api = (await apiApp()).app
  await api.ready()
  await seedStatusOffice(t, api, 24)
  for (const id of [F.all, F.presence, 'status-extra-0', 'status-extra-1', 'status-extra-2']) {
    const reply = await api.inject({ method: 'POST', url: '/api/records', headers: STATUS_PERSON, payload: { kind: 'message', title: 'A made-up conversation', data: { body: 'The invented ledger is ready to read.', to: [{ kind: 'agent', id }] } } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(reply.statusCode, reply.body).toBe(409)
  }
  await api.close()
  const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
  migrateRevisions(t.client.sqlite)
  app = await liveApp({ name: 'chat-layout', viewport: { width: 1440, height: 1000 }, database: t.file })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  t?.close()
}, 60_000)

interface Opened {
  page: Page
  context: BrowserContext
  close: () => Promise<void>
}

async function opened(
  width: number,
  theme: 'light' | 'dark',
  where: 'corner' | 'page',
  more: { height?: number; touch?: boolean; film?: string } = {},
): Promise<Opened> {
  const height = more.height ?? (width === 390 ? 844 : 1000)
  const context = await app.browser.newContext({
    viewport: { width, height },
    colorScheme: theme,
    hasTouch: more.touch === true,
    ...(more.film === undefined ? {} : { recordVideo: { dir: more.film, size: { width, height } } }),
  })
  await context.addInitScript(([look]) => {
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'yes')
  }, [theme] as const)
  const page = await context.newPage()
  await page.goto(where === 'page' ? `${app.site}/#/chat` : `${app.site}/#/`)
  await waitForThePage(page)
  return { page, context, close: () => context.close() }
}

async function openTheConversationWith(page: Page, who: { kind: 'agent' | 'person'; id: string }, panel = CORNER): Promise<void> {
  await page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey(who)] as const)
  await page.waitForSelector(`${panel} .px-chat-them`, { timeout: 30_000 })
}

async function boxOf(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} has no box on the page`)
  return box
}

/** A point on the top row where no press is, clear of the resize corner. */
async function aPlaceOnTheTopRow(page: Page): Promise<{ x: number; y: number }> {
  const row = await boxOf(page, TOP_ROW)
  return { x: row.x + 40, y: row.y + row.height / 2 }
}

async function wheelOverTheList(page: Page, by: number): Promise<void> {
  await page.locator(LIST).hover()
  await page.mouse.wheel(0, by)
  await page.waitForTimeout(350)
}

const findIsShown = (page: Page): Promise<string | null> => page.locator(FIND).getAttribute('data-shown')

/** How far the list under the tabs is scrolled down from its top, in whole pixels. */
const scrolledBy = (page: Page): Promise<number> => page.locator(LIST).evaluate((list) => Math.round(list.scrollTop))

async function blurTheFind(page: Page): Promise<void> {
  await page.evaluate(() => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement) focused.blur()
  })
}

/**
 * Every element in the chat whose whole visible text is one dash, outside the sentences kept for screen readers. A dash
 * inside longer words, such as the made-up label's, is not one.
 */
async function loneDashesIn(page: Page, root: string): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const found: string[] = []
    for (const panel of document.querySelectorAll(rootSelector)) {
      const walk = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
      for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
        const holder = node.parentElement
        if (holder === null || (node.textContent ?? '').trim() !== '—') continue
        if ((holder.textContent ?? '').trim() !== '—' || holder.closest('.px-sr') !== null) continue
        const box = holder.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        found.push(holder.outerHTML.slice(0, 200))
      }
    }
    return found
  }, root)
}

it('reads a kept place, and holds a place and a size inside the window', () => {
  expect(placeFromWhatWasStored('300x200')).toEqual({ right: 300, bottom: 200 })
  expect(placeFromWhatWasStored('0x0'), 'the window corner itself is a place').toEqual({ right: 0, bottom: 0 })
  for (const said of [null, '', '300', 'x200', '300x', '-5x3', 'axb', '1x2x3']) {
    expect(placeFromWhatWasStored(said), `${JSON.stringify(said)} is read as a place`).toBeNull()
  }
  // A PLACE PAST AN EDGE IS PULLED BACK, so the whole panel is on the screen.
  expect(placeHeldInside({ right: 2000, bottom: -40 }, { width: 336, height: 512 }, { width: 1000, height: 700 })).toEqual({
    right: 664,
    bottom: 0,
  })
  // A MOVED PANEL GROWS NO FURTHER THAN THE WINDOW'S LEFT AND TOP EDGES: 1000 less 300, and 700 less 100.
  expect(sizeHeldInside({ width: 900, height: 900 }, { width: 1000, height: 700 }, { right: 300, bottom: 100 })).toEqual({
    width: 700,
    height: 600,
  })
  expect(sizeHeldInside({ width: 900, height: 900 }, { width: 1000, height: 700 }), 'the corner keeps the room it always left').toEqual({
    width: 900,
    height: 604,
  })
})

it('puts the project and the filter in one row above the list, hidden until the list is scrolled up', async () => {
  const { page, close } = await opened(1440, 'light', 'corner')
  try {
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    expect(await page.locator(FIND).count(), 'there is no row for the project and the filter').toBe(1)
    expect(await page.locator(`${FIND} select.px-chat-project-filter`).count(), 'the project is not in the row').toBe(1)
    expect(await page.locator(`${FIND} input.px-chat-filter`).count(), 'the filter is not in the row').toBe(1)
    expect(await page.locator(`${LIST} .px-chat-filter, ${LIST} .px-chat-project-filter`).count(), 'a control is still in the list').toBe(0)

    // HIDDEN AT FIRST, and folded to nothing rather than taken off the page.
    expect(await findIsShown(page)).toBe('no')
    expect((await boxOf(page, FIND)).height, 'the hidden row takes room').toBeLessThan(1)

    await wheelOverTheList(page, 400)
    expect(await findIsShown(page), 'a scroll down showed the row').toBe('no')
    // A SCROLL UP SHORT OF THE TOP LEAVES IT HIDDEN, and so does the scroll that reaches the top. Item 104.
    await wheelOverTheList(page, -80)
    expect(await scrolledBy(page), 'the scroll up reached the top of the list').toBeGreaterThan(0)
    expect(await findIsShown(page), 'a scroll up short of the top showed the row').toBe('no')
    await wheelOverTheList(page, -2_000)
    expect(await scrolledBy(page), 'the list is not at its top').toBe(0)
    expect(await findIsShown(page), 'the scroll that reached the top showed the row').toBe('no')
    // ONE MORE SCROLL UP, MADE AT THE TOP, SHOWS IT.
    await wheelOverTheList(page, -80)
    expect(await findIsShown(page), 'a scroll up at the top of the list did not show the row').toBe('yes')
    await page.waitForTimeout(300)
    const row = await boxOf(page, FIND)
    const tabs = await boxOf(page, `${CORNER} .px-chat-tabs`)
    const list = await boxOf(page, LIST)
    expect(row.height, 'the row is shown with no room').toBeGreaterThan(20)
    expect(row.y, 'the row is not under the tabs').toBeGreaterThanOrEqual(tabs.y + tabs.height - 1)
    expect(row.y + row.height, 'the row covers the list').toBeLessThanOrEqual(list.y + 1)
    // THE PROJECT IS THE SMALL BLOCK LEFT OF THE FILTER.
    const project = await boxOf(page, `${FIND} .px-chat-project-filter`)
    const filter = await boxOf(page, `${FIND} .px-chat-filter`)
    expect(project.x + project.width, 'the project is not left of the filter').toBeLessThanOrEqual(filter.x)
    expect(project.width, 'the project is not the smaller block').toBeLessThan(filter.width)
    expect(Math.abs(project.y + project.height / 2 - (filter.y + filter.height / 2)), 'the two are not on one row').toBeLessThan(3)

    await wheelOverTheList(page, 200)
    expect(await findIsShown(page), 'a scroll down did not hide the row').toBe('no')

    // WORDS TYPED KEEP IT, once the focus has left it as well. The box can be reached while the row is hidden.
    await page.fill(`${FIND} .px-chat-filter`, 'Bell')
    expect(await findIsShown(page), 'the focus did not show the row').toBe('yes')
    await blurTheFind(page)
    await wheelOverTheList(page, 200)
    expect(await findIsShown(page), 'a scroll down hid the row over words typed in it').toBe('yes')
    await page.fill(`${FIND} .px-chat-filter`, '')
    await blurTheFind(page)
    await wheelOverTheList(page, 200)
    expect(await findIsShown(page), 'the row stayed after its words were cleared').toBe('no')

    // ONE PROJECT CHOSEN KEEPS IT TOO.
    expect(await page.locator(`${FIND} .px-chat-project-filter option`).count(), 'there is no project to choose').toBeGreaterThanOrEqual(2)
    await page.selectOption(`${FIND} .px-chat-project-filter`, { index: 1 })
    await blurTheFind(page)
    await wheelOverTheList(page, 200)
    expect(await findIsShown(page), 'a scroll down hid the row over a chosen project').toBe('yes')
    await page.selectOption(`${FIND} .px-chat-project-filter`, { index: 0 })
    await blurTheFind(page)
    await wheelOverTheList(page, 200)
    expect(await findIsShown(page), 'the row stayed with every project chosen').toBe('no')

    // THE OTHER TABS GET THE PROJECT BLOCK ALONE.
    for (const tab of ['groups', 'between']) {
      await page.click(`${CORNER} .px-chat-tab[data-tab="${tab}"]`)
      // AT THE TOP OF THE LIST, where a scroll up shows the row.
      await wheelOverTheList(page, -2_000)
      await wheelOverTheList(page, -80)
      expect(await findIsShown(page), `a scroll up on ${tab} did not show the row`).toBe('yes')
      expect(await page.locator(`${FIND} .px-chat-project-filter`).count(), `${tab} has no project block`).toBe(1)
      expect(await page.locator(`${FIND} .px-chat-filter`).count(), `${tab} draws the contacts' filter`).toBe(0)
    }
  } finally {
    await close()
  }
}, 120_000)

it('shows the row when a finger pulls the list down on a phone, and hides it when the finger pushes it up', async () => {
  const { page, context, close } = await opened(390, 'light', 'corner', { touch: true })
  try {
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    expect(await page.locator(FIND).count(), 'there is no row for the project and the filter').toBe(1)
    expect(await findIsShown(page)).toBe('no')
    const touch = await context.newCDPSession(page)
    const list = await boxOf(page, LIST)
    const x = list.x + list.width / 2
    const pull = async (from: number, to: number): Promise<void> => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] })
      for (let step = 1; step <= 8; step += 1) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + ((to - from) * step) / 8 }] })
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(400)
    }
    await pull(list.y + list.height - 60, list.y + 60)
    expect(await findIsShown(page), 'pushing the list up showed the row').toBe('no')
    // A PULL SHORT OF THE TOP LEAVES IT HIDDEN. Item 104.
    expect(await scrolledBy(page), 'pushing the list up did not scroll it').toBeGreaterThan(160)
    await pull(list.y + 60, list.y + 140)
    expect(await scrolledBy(page), 'the pull reached the top of the list').toBeGreaterThan(0)
    expect(await findIsShown(page), 'a pull short of the top showed the row').toBe('no')
    // AT THE TOP, A PULL FURTHER DOWN SHOWS IT.
    for (let tries = 0; tries < 10 && (await scrolledBy(page)) > 0; tries += 1) await pull(list.y + 60, list.y + list.height - 60)
    expect(await scrolledBy(page), 'the list is not at its top').toBe(0)
    await pull(list.y + 60, list.y + 200)
    expect(await findIsShown(page), 'pulling the list down at its top did not show the row').toBe('yes')
    await pull(list.y + list.height - 60, list.y + 60)
    expect(await findIsShown(page), 'pushing the list up did not hide the row').toBe('no')
  } finally {
    await close()
  }
}, 120_000)

it("draws a short top row and the reader's own row on one line, with a pencil for a status nobody wrote", async () => {
  const { page, close } = await opened(1440, 'light', 'corner')
  const me = `${CORNER} .px-chat-me`
  try {
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    expect((await boxOf(page, TOP_ROW)).height, 'the top row is taller than its presses').toBeLessThanOrEqual(26)
    expect((await boxOf(page, me)).height, "the reader's own row is more than one line").toBeLessThanOrEqual(44)
    const pencil = page.locator(me).getByRole('button', { name: 'Set your status', exact: true })
    expect(await pencil.count(), 'there is no pencil for a status nobody wrote').toBe(1)
    const middle = async (selector: string): Promise<number> => {
      const box = await boxOf(page, selector)
      return box.y + box.height / 2
    }
    const name = await middle(`${me} .px-chat-name`)
    expect(Math.abs((await middle(`${me} .wyh`)) - name), 'whether the reader is here is not beside the name').toBeLessThan(4)
    expect(Math.abs((await middle(`${me} .px-chat-set-state`)) - name), 'the pencil is not beside the name').toBeLessThan(4)
    expect(await page.locator(me).innerText(), 'a dash stands for the status').not.toContain('—')

    // THE PENCIL OPENS THE EDITOR OF ROUND 80, AND IT CLOSES AS IT DOES: Escape leaves nothing changed.
    await pencil.click()
    await page.waitForSelector(`${me} .px-chat-state-edit`, { timeout: 10_000 })
    expect(await pencil.count(), 'the pencil stays beside the open editor').toBe(0)
    await page.keyboard.press('Escape')
    await page.waitForSelector(`${me} .px-chat-state-edit`, { state: 'detached', timeout: 5_000 })
    expect(await page.locator(CORNER).count(), 'Escape in the editor closed the chat').toBe(1)
    expect(await pencil.count(), 'the pencil did not come back').toBe(1)

    // A STATUS WRITTEN TAKES ITS OWN LINE, AND THE PENCIL GOES. Cleared again, the line goes and the pencil is back.
    await pencil.click()
    await page.fill(`${me} .px-chat-state-box`, 'Counting the invented bells')
    await page.press(`${me} .px-chat-state-box`, 'Enter')
    await expect.poll(() => page.locator(`${me} .px-chat-said-state`).textContent(), { timeout: 10_000 }).toBe('Counting the invented bells')
    expect(await pencil.count(), 'the pencil stays beside a written status').toBe(0)
    await page.click(`${me} button.px-chat-state`)
    await page.fill(`${me} .px-chat-state-box`, '')
    await page.press(`${me} .px-chat-state-box`, 'Enter')
    await expect.poll(() => pencil.count(), { timeout: 10_000 }).toBe(1)
    expect(await page.locator(`${me} .px-chat-said-state`).count(), 'an empty status still takes a line').toBe(0)
  } finally {
    await close()
  }
}, 120_000)

it('draws no group with nobody in it, except while its side is edited, and no lone dash anywhere in the chat', async () => {
  const picture = t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
  t.client.sqlite
    .prepare("INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, '2026-10-20 09:00:00')")
    .run(VISITOR.id, VISITOR.name, VISITOR.id, picture.id)
  const { page, close } = await opened(1440, 'light', 'corner')
  try {
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    // THE AGENT SIDE HOLDS A SECRETARY AND WORKERS, AND NO INSPECTOR OR SUPERVISOR.
    const drawn = await page.locator(`${CORNER} .px-chat-group-of[data-side="agent"]`).evaluateAll((groups) =>
      groups.map((group) => ({ group: group.getAttribute('data-group'), rows: group.querySelectorAll('.px-chat-contact').length })),
    )
    expect(drawn.length, 'no agent group is drawn').toBeGreaterThan(0)
    expect(drawn.filter((one) => one.rows === 0), 'a group with nobody in it is drawn').toEqual([])
    expect(await loneDashesIn(page, CORNER), 'the contacts list draws a lone dash').toEqual([])

    // WHILE THE SIDE IS EDITED its empty groups are drawn, to be renamed and moved, and say they are empty only aloud.
    await page.click(`${CORNER} .px-chat-top-group[data-side="agent"] .px-chat-edit`)
    await expect.poll(() => page.locator(`${CORNER} .px-chat-group-empty`).count(), { timeout: 10_000 }).toBeGreaterThan(0)
    expect(await page.locator(`${CORNER} .px-chat-group-empty .px-sr`).count(), 'an empty group says nothing to a screen reader').toBeGreaterThan(0)
    expect(await loneDashesIn(page, CORNER), 'an edited empty group draws a lone dash').toEqual([])
    await page.click(`${CORNER} .px-chat-top-group[data-side="agent"] .px-chat-edit`)
    await expect.poll(() => page.locator(`${CORNER} .px-chat-group-empty`).count(), { timeout: 10_000 }).toBe(0)

    for (const tab of ['groups', 'between']) {
      await page.click(`${CORNER} .px-chat-tab[data-tab="${tab}"]`)
      await page.waitForTimeout(800)
      expect(await loneDashesIn(page, CORNER), `the ${tab} tab draws a lone dash`).toEqual([])
    }

    // A PERSON WITH NO STATUS GETS THE PENCIL AN AGENT WITH NO LINE GETS, and an agent's conversation draws no dash.
    await openTheConversationWith(page, { kind: 'person', id: VISITOR.id })
    await page.waitForTimeout(800)
    expect(await loneDashesIn(page, CORNER), "a person's conversation draws a lone dash").toEqual([])
    expect(await page.locator(`${CORNER} .px-chat-them .px-chat-edit-personal`).count(), 'a person with no status has no pencil').toBe(1)
    expect(await page.locator(`${CORNER} .px-chat-them .px-chat-them-state`).count(), 'a status nobody wrote takes a line').toBe(0)
    await openTheConversationWith(page, { kind: 'agent', id: 'status-extra-3' })
    await page.waitForTimeout(800)
    expect(await loneDashesIn(page, CORNER), "an agent's empty conversation draws a lone dash").toEqual([])
  } finally {
    await close()
    t.client.sqlite.prepare('DELETE FROM people WHERE id = ?').run(VISITOR.id)
  }
}, 120_000)

it("draws the chat page's heading, and no lone dash on the page with no conversation open", async () => {
  const { page, close } = await opened(1440, 'light', 'page')
  try {
    await page.waitForSelector(`${PAGE} .px-chat-contact`, { timeout: 30_000 })
    // THE HEADING STAYS ON THE SCREEN: point 4 takes room from the chat's
    // own top and not from the page's name.
    const heading = page.getByRole('heading', { level: 1, name: 'Chat', exact: true })
    expect(await heading.count(), 'the page has no heading').toBe(1)
    const box = await heading.boundingBox()
    expect(box !== null && box.width > 1 && box.height > 1, `the heading is not drawn: ${JSON.stringify(box)}`).toBe(true)
    expect(await loneDashesIn(page, PAGE), 'the page with no conversation open draws a lone dash').toEqual([])
  } finally {
    await close()
  }
}, 120_000)

/**
 * Whether the name line above the open conversation lies inside the window and is what the window draws at its middle,
 * so that no bar stuck at the top of the window covers it.
 */
async function theNameIsInView(page: Page, panel: string): Promise<{ inView: boolean; at: unknown }> {
  return page.evaluate((selector) => {
    const line = document.querySelector(`${selector} .px-chat-them-top`)
    if (line === null) return { inView: false, at: 'no name line is drawn' }
    const box = line.getBoundingClientRect()
    const drawn = document.elementFromPoint(box.left + Math.min(40, box.width / 2), box.top + box.height / 2)
    return {
      inView: box.top >= 0 && box.bottom <= innerHeight && drawn !== null && line.contains(drawn),
      at: { top: box.top, bottom: box.bottom, window: innerHeight, drawn: drawn === null ? null : drawn.className },
    }
  }, panel)
}

/** How far the page reaches past the window's foot, in pixels. */
const pastTheFoot = (page: Page): Promise<number> =>
  page.evaluate(() => (document.scrollingElement === null ? 0 : document.scrollingElement.scrollHeight) - innerHeight)

it('ends the chat page at the foot of the window at the widest and the narrowest width, so the name above a conversation stays in view', async () => {
  for (const width of [1440, 390]) {
    const height = width === 390 ? 844 : 1000
    const { page, close } = await opened(width, 'light', 'page')
    try {
      await openTheConversationWith(page, { kind: 'agent', id: F.all }, PAGE)
      await page.waitForTimeout(400)
      expect.soft(await pastTheFoot(page), `${String(width)}: the page reaches past the window's foot`).toBeLessThanOrEqual(0)
      // WHAT A PICTURE'S LABEL DOES: it scrolls to the first message, which scrolls the window too when the page is taller.
      await page.evaluate((first) => {
        document.querySelector(first)?.scrollIntoView({ block: 'start' })
      }, `${PAGE} li.px-chat-one`)
      const seen = await theNameIsInView(page, PAGE)
      expect.soft(seen.inView, `${String(width)}: the name line is not in view: ${JSON.stringify(seen.at)}`).toBe(true)
      // A SHORTER WINDOW IS MEASURED AGAIN.
      await page.setViewportSize({ width, height: height - 150 })
      await page.waitForTimeout(400)
      expect.soft(await pastTheFoot(page), `${String(width)}, ${String(height - 150)} tall: the page reaches past the window's foot`).toBeLessThanOrEqual(0)
    } finally {
      await close()
    }
  }
  for (const width of [1440, 390]) {
    const { page, close } = await opened(width, 'light', 'corner')
    try {
      await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
      await openTheConversationWith(page, { kind: 'agent', id: F.all })
      await page.waitForTimeout(400)
      const seen = await theNameIsInView(page, CORNER)
      expect.soft(seen.inView, `corner, ${String(width)}: the name line is not in view: ${JSON.stringify(seen.at)}`).toBe(true)
    } finally {
      await close()
    }
  }
}, 240_000)

it('shows two lines of a long duty above a conversation, and a press that opens the rest and closes it again', async () => {
  for (const [width, where] of [[1440, 'corner'], [390, 'page']] as const) {
    const panel = where === 'page' ? PAGE : CORNER
    const { page, close } = await opened(width, 'light', where)
    try {
      if (where === 'corner') await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
      await openTheConversationWith(page, { kind: 'agent', id: F.all }, panel)
      const duty = page.locator(`${panel} .px-chat-them .duty-line`)
      const press = page.locator(`${panel} .px-chat-them .duty-line-more`)
      await press.waitFor({ timeout: 30_000 })
      const linesOf = (): Promise<{ lines: number; cut: boolean }> =>
        duty.evaluate((el) => ({ lines: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight), cut: el.scrollHeight > el.clientHeight + 1 }))
      expect(await duty.textContent(), 'the line holds the duty alone').toBe(F.duty)
      const folded = await linesOf()
      expect(folded.lines, `${where}, ${String(width)}: folded`).toBeGreaterThan(1.95)
      expect(folded.lines, `${where}, ${String(width)}: folded`).toBeLessThanOrEqual(2.05)
      expect(folded.cut, `${where}, ${String(width)}: the two lines do not cut the duty`).toBe(true)
      expect(await press.textContent()).toBe(WORDS['chat.duty.more'])
      expect(await press.getAttribute('aria-expanded')).toBe('false')
      await press.click()
      await expect.poll(() => press.textContent()).toBe(WORDS['chat.duty.less'])
      const unfolded = await linesOf()
      expect(unfolded.lines, `${where}, ${String(width)}: opened`).toBeGreaterThan(2.5)
      expect(unfolded.cut, `${where}, ${String(width)}: the opened duty is still cut`).toBe(false)
      expect(await press.getAttribute('aria-expanded')).toBe('true')
      await press.click()
      await expect.poll(() => press.textContent()).toBe(WORDS['chat.duty.more'])
      expect((await linesOf()).lines, `${where}, ${String(width)}: closed again`).toBeLessThanOrEqual(2.05)
    } finally {
      await close()
    }
  }
}, 120_000)

it('moves the window at once when its top row is dragged, leaves a press that does not move a press, keeps the place, and keeps the window on the screen', async () => {
  const { page, close } = await opened(1440, 'light', 'corner')
  try {
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    expect(await page.getAttribute(TOP_ROW, 'data-moves'), 'the top row does not move the window').toBe('yes')
    const corner = await boxOf(page, CORNER)
    const moving = (): Promise<string | null> => page.getAttribute(CORNER, 'data-moving')
    const full = (): Promise<string | null> => page.getAttribute(CORNER, 'data-full')
    const theOldMovePresses = (): Promise<number> => page.locator(`${TOP_ROW} .px-chat-move-words, ${TOP_ROW} .px-chat-move-done`).count()
    const keptPlace = (): Promise<string | null> => page.evaluate((key) => localStorage.getItem(key), PLACE_KEY)
    const placeOf = (box: { x: number; y: number; width: number; height: number }): string =>
      `${String(Math.round(1440 - (box.x + box.width)))}x${String(Math.round(1000 - (box.y + box.height)))}`
    expect(await page.locator(`${TOP_ROW} .px-chat-to-the-corner`).count(), 'a window in its corner offers to go back to it').toBe(0)

    // PRESSED AND DRAGGED AT ONCE, WITH NO HOLD, THE WINDOW FOLLOWS THE POINTER.
    let at = await aPlaceOnTheTopRow(page)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x - 300, at.y - 200, { steps: 10 })
    expect(await moving(), 'the window does not say it is being moved').toBe('yes')
    await page.mouse.up()
    let now = await boxOf(page, CORNER)
    expect(Math.abs(now.x - (corner.x - 300)), 'the window did not follow the pointer across').toBeLessThanOrEqual(2)
    expect(Math.abs(now.y - (corner.y - 200)), 'the window did not follow the pointer up').toBeLessThanOrEqual(2)
    expect([now.width, now.height], 'the move changed the size').toEqual([corner.width, corner.height])
    expect(await moving(), 'letting go did not end the move').toBe('no')
    expect(await theOldMovePresses(), 'the top row draws the move words or Done').toBe(0)
    expect(await page.locator(`${TOP_ROW} .px-chat-to-the-corner`).textContent()).toBe('Back to the corner')
    expect(await keptPlace()).toBe(placeOf(now))

    // A PRESS THAT DOES NOT MOVE IS A PRESS ON THE CONTROL UNDER IT, and moves nothing.
    await page.click(`${TOP_ROW} .px-chat-fill`)
    await expect.poll(full, { message: 'a press on the full-screen press did not fill the window' }).toBe('yes')
    await page.click(`${TOP_ROW} .px-chat-fill`)
    await expect.poll(full).toBe('no')
    expect(await boxOf(page, CORNER), 'pressing the full-screen press twice moved the window').toEqual(now)

    // A DRAG THAT STARTS ON A PRESS MOVES THE WINDOW, AND THE PRESS IS NOT PRESSED.
    const fill = await boxOf(page, `${TOP_ROW} .px-chat-fill`)
    await page.mouse.move(fill.x + fill.width / 2, fill.y + fill.height / 2)
    await page.mouse.down()
    await page.mouse.move(fill.x + fill.width / 2 - 100, fill.y + fill.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    expect(await full(), 'a drag that started on the full-screen press filled the window').toBe('no')
    now = await boxOf(page, CORNER)
    expect(Math.abs(now.x - (corner.x - 400)), 'a drag from the full-screen press did not move the window').toBeLessThanOrEqual(2)
    expect(await keptPlace()).toBe(placeOf(now))

    // THE PLACE IS KEPT ACROSS A RELOAD.
    await page.reload()
    await waitForThePage(page)
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    const reloaded = await boxOf(page, CORNER)
    expect(Math.abs(reloaded.x - now.x) + Math.abs(reloaded.y - now.y), 'the place was not kept').toBeLessThanOrEqual(2)

    // A SMALLER WINDOW PULLS THE PANEL BACK INSIDE IT, and moves it before it shrinks it. 640 high leaves the 96 pixels
    // the corner always leaves above a panel 512 high.
    await page.setViewportSize({ width: 800, height: 640 })
    await page.waitForTimeout(400)
    const inside = await boxOf(page, CORNER)
    expect(inside.x, 'the panel is past the left edge').toBeGreaterThanOrEqual(0)
    expect(inside.y, 'the panel is past the top edge').toBeGreaterThanOrEqual(0)
    expect(inside.x + inside.width, 'the panel is past the right edge').toBeLessThanOrEqual(800)
    expect(inside.y + inside.height, 'the panel is past the bottom edge').toBeLessThanOrEqual(640)
    expect([inside.width, inside.height], 'a panel that fits was shrunk').toEqual([corner.width, corner.height])
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.waitForTimeout(400)

    // DRAGGED FAR PAST EACH EDGE, THE WHOLE WINDOW STAYS ON THE SCREEN.
    for (const [by, edge] of [[-3_000, 'top left'], [3_000, 'bottom right']] as const) {
      at = await aPlaceOnTheTopRow(page)
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x + by, at.y + by, { steps: 10 })
      await page.mouse.up()
      const held = await boxOf(page, CORNER)
      expect(held.x, `dragged off the ${edge}: past the left edge`).toBeGreaterThanOrEqual(0)
      expect(held.y, `dragged off the ${edge}: past the top edge`).toBeGreaterThanOrEqual(0)
      expect(held.x + held.width, `dragged off the ${edge}: past the right edge`).toBeLessThanOrEqual(1440)
      expect(held.y + held.height, `dragged off the ${edge}: past the bottom edge`).toBeLessThanOrEqual(1000)
    }

    // BACK TO THE CORNER puts it back, and the corner is kept as no place at all.
    if ((await page.locator(`${TOP_ROW} .px-chat-to-the-corner`).count()) === 0) {
      at = await aPlaceOnTheTopRow(page)
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x - 200, at.y - 200, { steps: 5 })
      await page.mouse.up()
    }
    await page.click(`${TOP_ROW} .px-chat-to-the-corner`)
    expect(await boxOf(page, CORNER), 'the panel is not back in its corner').toEqual(corner)
    expect(await keptPlace(), 'the corner is kept as a place').toBe('')
    expect(await page.locator(`${TOP_ROW} .px-chat-to-the-corner`).count(), 'a window in its corner offers to go back to it').toBe(0)
  } finally {
    await close()
  }
}, 120_000)

it('moves nothing on a phone, while the chat fills the window, or on the chat page', async () => {
  const drag = async (page: Page): Promise<void> => {
    const at = await aPlaceOnTheTopRow(page)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x - 60, at.y + 40, { steps: 4 })
    await page.mouse.up()
  }
  {
    const { page, close } = await opened(390, 'light', 'corner')
    try {
      await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
      expect(await page.getAttribute(TOP_ROW, 'data-moves'), 'a phone offers a drag').toBe('no')
      const before = await boxOf(page, CORNER)
      await drag(page)
      expect(await page.getAttribute(CORNER, 'data-moving'), 'a drag moved the panel on a phone').toBe('no')
      expect(await boxOf(page, CORNER), 'the panel moved on a phone').toEqual(before)
    } finally {
      await close()
    }
  }
  {
    const { page, close } = await opened(1440, 'light', 'corner')
    try {
      await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
      await page.click(`${TOP_ROW} .px-chat-fill`)
      expect(await page.getAttribute(CORNER, 'data-full')).toBe('yes')
      expect(await page.getAttribute(TOP_ROW, 'data-moves'), 'a full chat offers a drag').toBe('no')
      const before = await boxOf(page, CORNER)
      await drag(page)
      expect(await page.getAttribute(CORNER, 'data-moving'), 'a drag moved a full chat').toBe('no')
      expect(await boxOf(page, CORNER), 'a full chat moved').toEqual(before)
    } finally {
      await close()
    }
  }
  {
    const { page, close } = await opened(1440, 'light', 'page')
    try {
      await page.waitForSelector(`${PAGE} .px-chat-contact`, { timeout: 30_000 })
      expect(await page.locator(`${PAGE} .px-chat-chrome`).count(), 'the chat page draws a row to hold').toBe(0)
      expect(await page.getAttribute(PAGE, 'data-moving'), 'the chat page says it is being moved').toBe('no')
    } finally {
      await close()
    }
  }
}, 120_000)

async function picture(page: Page, above: string, name: string): Promise<void> {
  if (output === undefined) return
  const dir = join(output, 'pictures')
  mkdirSync(dir, { recursive: true })
  await putTheMadeUpLabelIn(page, LABEL, page.locator(above), name)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(dir, `${name}.png`) })
}


/** A ring where the pointer is, filled while it is pressed, because a film shows no pointer of its own. */
async function drawThePointer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ring = document.createElement('div')
    ring.setAttribute('data-film-pointer', '')
    ring.style.cssText =
      'position:fixed;z-index:2147483647;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border:2px solid #c0392b;border-radius:50%;background:rgb(192 57 43 / 15%);pointer-events:none'
    document.body.append(ring)
    const follow = (event: PointerEvent): void => {
      ring.style.left = `${String(event.clientX)}px`
      ring.style.top = `${String(event.clientY)}px`
    }
    addEventListener('pointermove', follow, true)
    addEventListener('pointerdown', (event) => {
      follow(event)
      ring.style.background = 'rgb(192 57 43 / 60%)'
    }, true)
    addEventListener('pointerup', () => {
      ring.style.background = 'rgb(192 57 43 / 15%)'
    }, true)
  })
}

async function film(width: number, called: string, act: (page: Page, context: BrowserContext) => Promise<void>): Promise<void> {
  if (output === undefined) return
  const dir = join(output, 'films')
  mkdirSync(dir, { recursive: true })
  const { page, context, close } = await opened(width, 'light', 'corner', { film: dir, touch: width === 390 })
  try {
    await page.waitForSelector(`${CORNER} .px-chat-contact`, { timeout: 30_000 })
    await putTheMadeUpLabelIn(page, LABEL, page.locator(width === 390 ? `${CORNER} .px-chat-foot-link a` : 'h1'), called)
    await drawThePointer(page)
    await page.waitForTimeout(800)
    await act(page, context)
    await page.waitForTimeout(800)
  } finally {
    await close()
  }
  // THE FILM IS WRITTEN ONCE THE WINDOW IS CLOSED, under a name of the browser's own, so it is copied to its name here.
  const video = page.video()
  if (video === null) throw new Error(`${called}: the window recorded no film`)
  await video.saveAs(join(dir, `${called}.webm`))
  await video.delete()
}


