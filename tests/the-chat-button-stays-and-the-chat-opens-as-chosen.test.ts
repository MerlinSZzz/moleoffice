// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SETTINGS KEEPS THE CHAT BUTTON IN THE CORNER, AND CHOOSES HOW THE CHAT OPENS.
 *
 * The chat button's panel in Settings has two more entries. One keeps the button in the bottom-right corner at all
 * times. The other chooses how the chat opens from the button and from the sidebar's Chat row: beside the page, or in
 * the window over the corner. Both are kept on the person's own row, so every browser they use follows them. A person
 * who has chosen neither sees the button in the corner and the chat opens beside the page. The unread count is still
 * drawn in one place only.
 *
 * In a real browser against a Mole Office of its own:
 *  1. Nobody having chosen sees the button with nothing waiting, and the sidebar's Chat row opens the chat beside the page.
 *  2. Once the button is kept, it is drawn in the bottom-right corner with nothing waiting, at 1440, 990, 660 and 390.
 *     It stays beside an open chat, in the page's own corner beside the chat, and over the corner below the chat's
 *     window. Pressed while the chat is open, it shuts it. The window never covers the button, at every width.
 *  3. Once the window is chosen, the button and the sidebar's Chat row both open the chat in its window over the corner.
 *     Once beside the page is chosen again, both open it beside the page.
 *  4. Both choices are kept for the person: after a reload, and in a browser that never chose. Each can be put back to
 *     not chosen, and the chat then does what it did before.
 *  5. With the button kept and a message waiting, the count is on the button and not on the sidebar's row, whether
 *     the chat is shut or open beside the page; and on a phone it is on the button and not on the bar.
 *
 * THE PICTURES are taken only when W13Y_CHAT_BUTTON_PICTURES names a folder outside the checkout: the Settings entries
 * and the chat opened each way from the button and from the sidebar's row, at 1440, 990, 660 and 390, in both themes.
 * W13Y_CHAT_BUTTON_PICTURES_BEFORE=yes takes only the pictures the drawing before the entries has: the panel, the chat
 * shut, and the chat opened from the row. They are of made-up data, and each carries the label that says so.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { t } from '../src/shared/i18n.ts'
import { THE_SPLIT_FROM, TWO_COLUMNS_FROM } from '../src/web/lib/chat-split.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn, THE_MADE_UP_LABEL_MARKER } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = { name: 'Made-up Button Agent', handle: 'made-up-button-agent' }
const AS_THE_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
const pictures = process.env.W13Y_CHAT_BUTTON_PICTURES
const before = process.env.W13Y_CHAT_BUTTON_PICTURES_BEFORE === 'yes'
const LABEL = 'Made-up data — an invented office, not real office data'
const CALLED = 'the-chat-button-stays-and-the-chat-opens-as-chosen'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
const PANEL = '[data-settings-panel="settings.chatbutton"]'
const STAYS = '[data-chooses="chatButtonStays"]'
const OPENS = '[data-chooses="chatOpensAs"]'
const CIRCLE = '.px-chat-circle'
const ROW = '.shell-side .shell-chat'
const BAR = '.shell-bar .shell-chat-phone'
const SPLIT = 'aside.px-chat[data-where="split"]'
const WINDOW = 'aside.px-chat[data-where="corner"]'
/** The width the chat opens at beside the page before anybody drags the seam. */
const OPENS_AT = 520

let app: LiveApp
let report = ''

type Size = { width: number; height: number }
const WIDE: Size = { width: 1440, height: 900 }
const PHONE: Size = { width: 390, height: 844 }
const WIDTHS: Size[] = [WIDE, { width: 990, height: 900 }, { width: 660, height: 900 }, PHONE]
/** The width the shell changes at, read from the constant so this file moves with the one number. */
const SPLIT_AT = Number(/\d+/.exec(THE_SPLIT_FROM)?.[0])

/** A browser of its own, with the chat shut and nothing else remembered, as a person's first visit. */
async function aWindow(size: Size, theme: 'light' | 'dark' = 'light'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: size })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript((look) => {
    if (sessionStorage.getItem('chat-test-set') === 'yes') return
    sessionStorage.setItem('chat-test-set', 'yes')
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
  }, theme)
  // THE PICTURES BLUR THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, because it names the machine this test
  // runs on. The blur draws nothing new and moves nothing.
  await context.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '.px-chat-from { filter: blur(5px); }'
      document.head.append(style)
    })
  })
  return { context, page: await context.newPage() }
}

/**
 * Go to the made-up report, loaded afresh, and wait until the page and the chat's frame are drawn. It is loaded again
 * because a change of address inside the page keeps the chat as it was, and each visit here reads the person's row.
 */
async function theReport(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.shell-side').first().waitFor({ state: 'attached', timeout: 30_000 })
  // THE CHAT READS THE PERSON'S ROW AFTER THE PAGE IS DRAWN. Long enough for that read, so a button that is not drawn
  // is one the chat decided not to draw.
  await page.waitForTimeout(2_000)
}

/** Open Settings at the chat button's panel and wait for its two entries. */
async function theSettings(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/settings/chatbutton`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator(`${PANEL} ${STAYS} .ccl-choice`).first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.locator(`${PANEL} ${OPENS} .ccl-choice`).first().waitFor({ state: 'visible', timeout: 30_000 })
}

/** Press one entry's choice in Settings and wait until the panel draws it pressed, which it does from the stored row. */
async function pressInSettings(page: Page, group: string, choice: string): Promise<void> {
  await page.click(`${PANEL} ${group} .ccl-choice[data-choice="${choice}"]`)
  await page.waitForSelector(`${PANEL} ${group} .ccl-choice[data-choice="${choice}"][aria-pressed="true"]`, { timeout: 20_000 })
}

/** Which choice each entry draws pressed. */
async function pressed(page: Page): Promise<{ stays: string[]; opens: string[] }> {
  const read = (group: string) => page.$$eval(`${PANEL} ${group} .ccl-choice[aria-pressed="true"]`, (all) => all.map((one) => one.getAttribute('data-choice') ?? ''))
  return { stays: await read(STAYS), opens: await read(OPENS) }
}

/** The person's own row, as the door answers it. */
async function myRow(): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}/api/participants`, { headers: PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const people = ((await reply.json()) as { people: Record<string, unknown>[] }).people
  const mine = people.find((one) => one['id'] === THE_PERSON)
  if (mine === undefined) throw new Error('the door answered no row for the person')
  return mine
}

/** Put both choices on the person's row through the door, an empty word being nobody having chosen. */
async function choose(choice: { chatButtonStays?: string; chatOpensAs?: string }): Promise<void> {
  const changed = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify(choice) })
  expect(changed.status, await changed.clone().text()).toBe(200)
}

async function box(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const its = await page.locator(selector).first().boundingBox()
  if (its === null) throw new Error(`${selector} is not drawn`)
  return { x: Math.round(its.x), y: Math.round(its.y), width: Math.round(its.width), height: Math.round(its.height) }
}

/** How far the button stands from the right and the foot of the window, and whether it is inside it. */
async function theButtonsCorner(page: Page, size: Size): Promise<{ right: number; foot: number }> {
  const circle = await box(page, CIRCLE)
  expect(circle.x, 'the button is not inside the window').toBeGreaterThanOrEqual(0)
  expect(circle.y, 'the button is not inside the window').toBeGreaterThanOrEqual(0)
  return { right: size.width - (circle.x + circle.width), foot: size.height - (circle.y + circle.height) }
}

/** Whether the shell is wide in this window: the sidebar beside the page, the Chat row in it. */
async function isWide(page: Page): Promise<boolean> {
  return page.evaluate((query) => window.matchMedia(query).matches, THE_SPLIT_FROM)
}

/** Every unread count the frame draws: on the button, on the sidebar's Chat row, and on the phone's bar. */
async function theCounts(page: Page): Promise<{ button: string | null; row: string | null; bar: string | null }> {
  return page.evaluate(() => {
    const drawn = (selector: string): string | null => {
      const found = document.querySelector<HTMLElement>(selector)
      if (found === null) return null
      const its = found.getBoundingClientRect()
      return its.width > 0 && its.height > 0 ? (found.innerText.trim() || null) : null
    }
    return {
      button: drawn('.px-chat-circle .px-chat-unread'),
      row: drawn('.shell-side .shell-chat .shell-chat-count'),
      bar: drawn('.shell-bar .shell-chat-phone .shell-chat-count'),
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: CALLED, viewport: WIDE, workspace: 'default', opensAt: 'full' })
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const blocks = Array.from({ length: 12 }, (_, at) => {
    const n = String(at + 1)
    return { id: `b-${n}`, type: 'text', heading: `Made-up part ${n}`, text: `Made-up paragraph ${n}. The made-up kiln for part ${n} ran for six hours, and every tile in the batch held its glaze.` }
  })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-14', blocks } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it.skipIf(before)('1. nobody having chosen sees the button and the chat opens beside the page', async () => {
  const row = await myRow()
  expect(row['chatButtonStays'], 'a person who never chose has a stored answer').toBeNull()
  expect(row['chatOpensAs'], 'a person who never chose has a stored answer').toBeNull()
  const { context, page } = await aWindow(WIDE)
  try {
    await theSettings(page)
    expect(await pressed(page), 'the entries do not show what nobody having chosen is read as').toEqual({ stays: ['always'], opens: ['split'] })
    expect(await page.locator(`${PANEL} ${STAYS} .btnc, ${PANEL} ${OPENS} .btnc`).count(), 'a way back was offered with nothing chosen').toBe(0)

    await theReport(page)
    expect(await page.locator(CIRCLE).count(), 'the button is missing with nothing waiting').toBe(1)
    await page.click(ROW)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
    expect(await page.locator(CIRCLE).count(), 'the button is missing beside the open chat').toBe(1)
  } finally {
    await context.close()
  }
}, 180_000)

it.skipIf(before)('a stored choice to show the button only for unread messages is still respected', async () => {
  await choose({ chatButtonStays: 'when-unread' })
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    expect(await page.locator(CIRCLE).count()).toBe(0)
  } finally {
    await context.close()
    await choose({ chatButtonStays: '' })
  }
}, 180_000)

it.skipIf(before)('2. a kept button is in the bottom-right corner at all times, and shuts the chat it opened', async () => {
  await choose({ chatButtonStays: 'when-unread', chatOpensAs: '' })
  const { context, page } = await aWindow(WIDE)
  try {
    await theSettings(page)
    await pressInSettings(page, STAYS, 'always')
    expect((await myRow())['chatButtonStays'], 'the press did not reach the person\'s row').toBe('always')
    // THE PRESS REACHES THE BUTTON AT ONCE, on the Settings page itself, with nothing waiting and no reload.
    await page.waitForSelector(CIRCLE, { timeout: 20_000 })

    for (const size of WIDTHS) {
      await page.setViewportSize(size)
      await theReport(page)
      await page.waitForSelector(CIRCLE, { timeout: 20_000 })
      const corner = await theButtonsCorner(page, size)
      expect(corner.right, `at ${String(size.width)} the button is not at the right`).toBe(corner.foot)
      expect(corner.right, `at ${String(size.width)} the button is not in the corner`).toBeLessThanOrEqual(24)
    }

    // BESIDE THE CHAT ON THE RIGHT, the button keeps to the page's own corner and covers none of the chat.
    await page.setViewportSize(WIDE)
    await theReport(page)
    await page.click(ROW)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
    await page.waitForTimeout(300)
    const chat = await box(page, SPLIT)
    expect(chat.width).toBe(OPENS_AT)
    const beside = await box(page, CIRCLE)
    const gap = chat.x - (beside.x + beside.width)
    expect(gap, 'the button covers the chat beside the page').toBeGreaterThan(0)
    expect(gap, 'the button is not in the page\'s corner').toBe(WIDE.height - (beside.y + beside.height))
    expect(await page.getAttribute(CIRCLE, 'aria-expanded')).toBe('true')

    // PRESSED, IT SHUTS THE CHAT, and it is still there.
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await page.locator(CIRCLE).count(), 'the button went when the chat was shut').toBe(1)

    // OVER THE CORNER IN ITS WINDOW, the chat stands above the button and leaves it in sight.
    await page.click(ROW)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
    await page.click('.px-chat-seam-window')
    await page.waitForSelector(WINDOW, { timeout: 10_000 })
    await page.waitForTimeout(300)
    const theWindow = await box(page, WINDOW)
    const under = await box(page, CIRCLE)
    expect(theWindow.y + theWindow.height, 'the window covers the button').toBeLessThanOrEqual(under.y)
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })

    // WHERE THE OPEN CHAT COVERS THE CORNER, the button is not drawn under it: at 390 the chat covers the screen.
    await page.setViewportSize(PHONE)
    await theReport(page)
    await page.waitForSelector(CIRCLE, { timeout: 20_000 })
    await page.click(BAR)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
    await page.waitForTimeout(500)
    expect(await page.locator(CIRCLE).count(), 'the button was drawn under the chat that covers the screen').toBe(0)
    await page.click('.px-chat-seam-back')
    await page.waitForSelector(CIRCLE, { timeout: 20_000 })
  } finally {
    await context.close()
  }
}, 300_000)

it.skipIf(before)('the corner button remains clickable with the window open at every width and in both themes', async () => {
  await choose({ chatButtonStays: '', chatOpensAs: 'window' })
  const proofPictures = process.env.W13Y_CHAT_CORNER_PROOF
  if (proofPictures !== undefined) mkdirSync(proofPictures, { recursive: true })
  for (const size of WIDTHS) for (const theme of ['light', 'dark'] as const) {
    const { context, page } = await aWindow(size, theme)
    try {
      await theReport(page)
      const circle = page.locator(CIRCLE)
      await circle.waitFor({ state: 'visible', timeout: 20_000 })
      expect(await circle.getAttribute('aria-expanded')).toBe('false')
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      if (proofPictures !== undefined) {
        await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
        await page.mouse.move(-1, -1)
        await page.screenshot({ path: join(proofPictures, `shut-${String(size.width)}-${theme}.png`) })
      }
      await circle.click()
      await page.locator(WINDOW).waitFor({ state: 'visible', timeout: 20_000 })
      expect(await circle.getAttribute('aria-expanded')).toBe('true')
      const onTop = await circle.evaluate((one) => {
        const box = one.getBoundingClientRect()
        return one.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
      })
      expect(onTop, `${size.width}, ${theme}: the window covers the button`).toBe(true)
      if (proofPictures !== undefined) {
        // WHERE THE WINDOW CAN BE DRAGGED, its grips lie along its left and top edges, inside the window, and a label
        // put into the chat would lie under one of them. So the label stays above the page, where it was for the
        // picture of the chat shut, and the open window is checked not to cover it. Where the window has no grips,
        // the label goes into the chat.
        if (size.width < SPLIT_AT && (await page.locator(`${WINDOW} .px-chat-grip:visible`).count()) === 0) {
          await putTheMadeUpLabelIn(page, LABEL, page.locator('.px-chat-columns'), CALLED)
        } else {
          const where = await page.evaluate(([label, chat]) => {
            const one = document.querySelector(label)?.getBoundingClientRect()
            const other = document.querySelector(chat)?.getBoundingClientRect()
            if (one === undefined) return 'no label'
            if (other === undefined) return 'no window'
            const apart = one.right <= other.left || other.right <= one.left || one.bottom <= other.top || other.bottom <= one.top
            return apart ? 'apart' : 'covered'
          }, [THE_MADE_UP_LABEL_MARKER, WINDOW] as const)
          expect(where, `${size.width}, ${theme}: the made-up label and the open window`).toBe('apart')
        }
        // THE PICTURES IN THE WINDOW HAVE COME IN before it is photographed. Each one is fetched only once it is on
        // screen, so a picture taken at once can show an empty place where a face belongs.
        await expect.poll(() => page.locator(WINDOW).evaluate((chat) => {
          const box = chat.getBoundingClientRect()
          return [...chat.querySelectorAll('img')].filter((img) => {
            const one = img.getBoundingClientRect()
            const shown = one.width > 0 && one.bottom > box.top && one.top < box.bottom && one.right > box.left && one.left < box.right
            return shown && !(img.complete && img.naturalWidth > 0)
          }).length
        }), { timeout: 15_000, message: `${size.width}, ${theme}: a picture in the open window has not come in` }).toBe(0)
        await page.mouse.move(-1, -1)
        await page.screenshot({ path: join(proofPictures, `window-${String(size.width)}-${theme}.png`) })
      }
      await circle.click()
      await page.locator('.px-chat').waitFor({ state: 'detached', timeout: 10_000 })
      expect(await circle.getAttribute('aria-expanded')).toBe('false')
    } finally {
      await context.close()
    }
  }
}, 300_000)

it.skipIf(before)('3. the button and the sidebar\'s Chat row open the chat the way it is chosen', async () => {
  await choose({ chatButtonStays: 'always', chatOpensAs: '' })
  const { context, page } = await aWindow(WIDE)
  try {
    await theSettings(page)
    await pressInSettings(page, OPENS, 'window')
    expect((await myRow())['chatOpensAs'], 'the press did not reach the person\'s row').toBe('window')
    // THE PRESS REACHES THE ROW AT ONCE, on the Settings page itself and with no reload.
    await page.click(ROW)
    await page.waitForSelector(WINDOW, { timeout: 20_000 })
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })

    await theReport(page)
    await page.click(CIRCLE)
    await page.waitForSelector(WINDOW, { timeout: 20_000 })
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-chat-split')), 'the button opened a split').toBeNull()
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    await page.click(ROW)
    await page.waitForSelector(WINDOW, { timeout: 20_000 })
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })

    await theSettings(page)
    await pressInSettings(page, OPENS, 'split')
    expect((await myRow())['chatOpensAs']).toBe('split')
    await theReport(page)
    await page.click(CIRCLE)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
    await page.click(ROW)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
  } finally {
    await context.close()
  }
}, 300_000)

it.skipIf(before)('4. both choices are the person\'s: kept after a reload and in a browser that never chose, and each goes back to not chosen', async () => {
  await choose({ chatButtonStays: 'when-unread', chatOpensAs: '' })
  const first = await aWindow(WIDE)
  try {
    await theSettings(first.page)
    await pressInSettings(first.page, STAYS, 'always')
    await pressInSettings(first.page, OPENS, 'window')
    await first.page.reload()
    await theSettings(first.page)
    expect(await pressed(first.page), 'a reload lost the choices').toEqual({ stays: ['always'], opens: ['window'] })
  } finally {
    await first.context.close()
  }

  // ANOTHER BROWSER, WHICH REMEMBERS NOTHING, follows the person's row.
  const other = await aWindow(WIDE, 'dark')
  try {
    await theReport(other.page)
    await other.page.waitForSelector(CIRCLE, { timeout: 20_000 })
    await other.page.click(ROW)
    await other.page.waitForSelector(WINDOW, { timeout: 20_000 })
    await other.page.click(CIRCLE)
    await other.page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })

    // BACK TO NOT CHOSEN, by the press under each entry, and the chat is as it was before either was chosen.
    await theSettings(other.page)
    await other.page.click(`${PANEL} ${STAYS} .btnc`)
    await other.page.click(`${PANEL} ${OPENS} .btnc`)
    await other.page.waitForSelector(`${PANEL} ${OPENS} .ccl-choice[data-choice="split"][aria-pressed="true"]`, { timeout: 20_000 })
    await other.page.waitForSelector(`${PANEL} ${STAYS} .ccl-choice[data-choice="always"][aria-pressed="true"]`, { timeout: 20_000 })
    const row = await myRow()
    expect([row['chatButtonStays'], row['chatOpensAs']], 'the way back left a stored answer').toEqual([null, null])
    await theReport(other.page)
    expect(await other.page.locator(CIRCLE).count(), 'the default button is missing').toBe(1)
    await other.page.click(ROW)
    await other.page.waitForSelector(SPLIT, { timeout: 20_000 })
  } finally {
    await other.context.close()
  }
}, 300_000)

it.skipIf(before)('5. with the button kept, the unread count is drawn once: on the button, not on the row or the bar', async () => {
  await choose({ chatButtonStays: 'always', chatOpensAs: '' })
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers: AS_THE_AGENT, body: JSON.stringify({ kind: 'message', title: 'Made-up line for the button', data: { body: 'Made-up line for the button.', to: [{ kind: 'person', id: THE_PERSON }] } }) })
  expect(said.status, await said.clone().text()).toBe(201)
  const { context, page } = await aWindow(WIDE)
  try {
    await theReport(page)
    await page.waitForSelector(`${CIRCLE} .px-chat-unread`, { timeout: 30_000 })
    expect(await theCounts(page), 'shut at 1440').toEqual({ button: '1', row: null, bar: null })
    await page.click(ROW)
    await page.waitForSelector(SPLIT, { timeout: 20_000 })
    await page.waitForTimeout(1_000)
    expect(await theCounts(page), 'open beside the page at 1440').toEqual({ button: '1', row: null, bar: null })
    await page.click(CIRCLE)
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })

    await page.setViewportSize(PHONE)
    await theReport(page)
    await page.waitForSelector(`${CIRCLE} .px-chat-unread`, { timeout: 30_000 })
    expect(await isWide(page)).toBe(false)
    expect(await theCounts(page), 'shut at 390').toEqual({ button: '1', row: null, bar: null })
  } finally {
    await context.close()
  }
}, 300_000)

it.runIf(pictures)('takes the entries and the chat opened each way, at 1440, 990, 660 and 390, in both themes', async () => {
  if (pictures === undefined) throw new Error('the pictures need W13Y_CHAT_BUTTON_PICTURES')
  mkdirSync(pictures, { recursive: true })
  const take = async (page: Page, name: string): Promise<void> => {
    await page.waitForTimeout(800)
    await page.mouse.move(-1, -1)
    expect(await page.locator('html').getAttribute('data-theme')).toBe(name.endsWith('-dark') ? 'dark' : 'light')
    await page.screenshot({ path: join(pictures, `${name}.png`) })
  }
  const shut = async (page: Page): Promise<void> => {
    if ((await page.locator('.px-chat').count()) === 0) return
    await page.evaluate(() => {
      localStorage.setItem('mole-office.chat.open', 'no')
    })
    await page.reload()
    await page.waitForSelector('.px-chat', { state: 'detached', timeout: 10_000 })
  }
  const opener = async (page: Page, from: 'button' | 'row'): Promise<void> => {
    if (from === 'button') await page.click(CIRCLE)
    else await page.click((await isWide(page)) ? ROW : BAR)
    await page.waitForSelector('aside.px-chat', { timeout: 20_000 })
    await page.waitForTimeout(1_200)
  }
  for (const size of WIDTHS) {
    for (const theme of ['light', 'dark'] as const) {
      const at = `${String(size.width)}-${theme}`
      const { context, page } = await aWindow(size, theme)
      try {
        if (before) {
          await page.goto(`${app.site}/?lang=en#/settings/chatbutton`, { timeout: 60_000 })
          await waitForThePage(page, 60_000)
          await page.locator(`${PANEL} .ccl-choice`).first().waitFor({ state: 'visible', timeout: 30_000 })
          await page.locator(`${PANEL} .ccl-heading`).last().scrollIntoViewIfNeeded()
          await take(page, `before-settings-${at}`)
          await theReport(page)
          await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
          await take(page, `before-shut-${at}`)
          await page.click(size.width >= SPLIT_AT ? ROW : BAR)
          await page.waitForSelector(SPLIT, { timeout: 20_000 })
          await take(page, `before-row-${at}`)
          continue
        }
        await choose({ chatButtonStays: 'always', chatOpensAs: 'window' })
        await theSettings(page)
        await page.locator(`${PANEL} ${OPENS}`).scrollIntoViewIfNeeded()
        await take(page, `settings-${at}`)
        await theReport(page)
        await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
        await page.waitForSelector(CIRCLE, { timeout: 20_000 })
        await take(page, `shut-${at}`)
        for (const as of ['window', 'split'] as const) {
          await choose({ chatOpensAs: as })
          for (const from of ['button', 'row'] as const) {
            await theReport(page)
            await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), CALLED)
            await opener(page, from)
            if (as === 'split' && size.width === 1440) {
              const chat = (await page.locator(SPLIT).boundingBox())!
              const seam = (await page.locator('.px-chat-seam').boundingBox())!
              const start = { x: seam.x + seam.width / 2, y: seam.y + seam.height * 0.6 }
              await page.mouse.move(start.x, start.y)
              await page.mouse.down()
              await page.mouse.move(start.x - (TWO_COLUMNS_FROM + 10 - chat.width), start.y, { steps: 12 })
              await page.mouse.up()
            }
            await take(page, `${from}-${as}-${at}`)
            await shut(page)
          }
        }
      } finally {
        await context.close()
      }
    }
  }
}, 600_000)

it.skipIf(before)('says what to choose in the empty split chat at 1440 and 990', async () => {
  await choose({ chatButtonStays: 'always', chatOpensAs: 'split' })
  for (const theme of ['light', 'dark'] as const) for (const width of [1440, 990]) {
    const { context, page } = await aWindow({ width, height: 900 }, theme)
    try {
      await theReport(page)
      expect(await page.locator('html').getAttribute('data-theme')).toBe(theme)
      await page.click((await isWide(page)) ? ROW : BAR)
      const split = page.locator(SPLIT)
      await split.waitFor({ timeout: 30_000 })
      if (width === 1440) {
        const chat = (await split.boundingBox())!
        const seam = (await page.locator('.px-chat-seam').boundingBox())!
        const from = { x: seam.x + seam.width / 2, y: seam.y + seam.height * 0.6 }
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(from.x - (TWO_COLUMNS_FROM + 10 - chat.width), from.y, { steps: 12 })
        await page.mouse.up()
      }
      const talk = page.locator(`${SPLIT} .px-chat-columns[data-columns="two"] .px-chat-columns-talk`)
      await talk.waitFor({ timeout: 30_000 })
      await expect.poll(() => talk.innerText()).toBe(t('chat.chooseConversation'))
      const lines = await talk.evaluate((el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return new Set([...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0).map((box) => Math.round(box.top))).size
      })
      expect(lines, `${width}, ${theme}: the instruction needs one line`).toBe(1)
    } finally {
      await context.close()
    }
  }
}, 180_000)
