// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST PRESS AFTER A PAGE LOAD OPENS THE CHAT THE WAY IT IS IN NOW, OR WAS LAST IN (wave 13y).
 *
 * The person had the chat open beside the page. The first press of the corner chat button opened it in the window over
 * the corner instead, and every press after that opened it beside the page. The browser remembered that the chat was
 * beside the page, and a reload opened it there. But the press read the way only from the person's row, and the row
 * had none: a chat that a reload opens where the browser left it kept nothing on the row. With nothing on the row, the
 * press opened the window, which is the way for a person who has never opened the chat.
 *
 * In a real browser against a Mole Office of its own, at 1440, with nothing kept on the person's row at the start:
 *   1. SIDE COLUMN OPEN, RELOAD: the browser remembers the chat beside the page, and the row has no way, as the
 *      person's had. After a reload the chat is beside the page. Put away by the seam's press, the first press of the
 *      corner button opens it beside the page.
 *   2. SIDE COLUMN LAST USED, RELOAD: the chat was beside the page and is shut by the corner button. After a reload the
 *      chat is shut, and the first press of the corner button opens it beside the page.
 *   3. NOTHING REMEMBERED: a browser that remembers nothing and a row with no way. The first press of the corner button
 *      opens the corner window, and keeps nothing on the row.
 *
 * Everything here is made up.
 */
import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, openRecordPagesAt, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const CIRCLE = '.px-chat-circle'
const SPLIT = 'aside.px-chat[data-where="split"]'
const WINDOW = 'aside.px-chat[data-where="corner"]'
const AWAY = '.px-chat-seam-away'

let app: LiveApp
let report = ''

/**
 * A browser of its own at 1440, remembering the chat as given: `split` is beside the page and `no` is shut. It is set
 * once for the tab, so a reload keeps what the browser remembers since.
 */
async function aWindow(remembers: 'split' | 'no'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  await openRecordPagesAt(context, 'full')
  await context.addInitScript((open) => {
    if (sessionStorage.getItem('chat-test-set') === 'yes') return
    sessionStorage.setItem('chat-test-set', 'yes')
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', open)
    localStorage.setItem('mole-office.chat.split-side', 'right')
  }, remembers)
  return { context, page: await context.newPage() }
}

/** The way kept on the person's own row, as the door answers it, or null when none is kept. */
async function theWayKept(): Promise<unknown> {
  const reply = await fetch(`${app.api}/api/participants`, { headers: PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const people = ((await reply.json()) as { people: Record<string, unknown>[] }).people
  const mine = people.find((one) => one['id'] === THE_PERSON)
  if (mine === undefined) throw new Error('the door answered no row for the person')
  return mine['chatOpensAs'] ?? null
}

/** Put nothing on the person's row for how the chat opens and whether the button stays, an empty word being none. */
async function nothingKept(): Promise<void> {
  const changed = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: PERSON, body: JSON.stringify({ chatButtonStays: '', chatOpensAs: '' }) })
  expect(changed.status, await changed.clone().text()).toBe(200)
  expect(await theWayKept(), 'the row still keeps a way').toBeNull()
}

/** Go to the made-up report and wait until the page is drawn. */
async function theReport(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/r/${report}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Load the page again, as the person does, and wait until it is drawn. */
async function reload(page: Page): Promise<void> {
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Press the corner chat button, once it is drawn, and say where the chat opened. */
async function theFirstPress(page: Page): Promise<'split' | 'window'> {
  await page.locator(CIRCLE).waitFor({ state: 'visible', timeout: 30_000 })
  expect(await page.locator('aside.px-chat').count(), 'the chat is open before the press').toBe(0)
  await page.click(CIRCLE)
  await page.locator(`${SPLIT}, ${WINDOW}`).first().waitFor({ timeout: 20_000 })
  return (await page.locator(SPLIT).count()) > 0 ? 'split' : 'window'
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-first-press-opens-the-way-it-was', viewport: { width: 1440, height: 900 }, workspace: 'default', opensAt: 'full' })
  const blocks = [1, 2, 3].map((n) => ({ id: `b-${String(n)}`, type: 'text', heading: `Made-up part ${String(n)}`, text: `Made-up paragraph ${String(n)} about the made-up kiln.` }))
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'report', title: 'Made-up kiln report', data: { for: 'Made-up reader', date: '2026-11-21', blocks } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  report = ((await made.json()) as { record: { id: string } }).record.id
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('1. side column open, reload: the first press of the corner button opens the chat beside the page', async () => {
  await nothingKept()
  const { context, page } = await aWindow('split')
  try {
    await theReport(page)
    await page.waitForSelector(SPLIT, { timeout: 30_000 })
    // THE PERSON'S STATE: the browser remembers the chat beside the page, and the row keeps no way.
    await nothingKept()
    await reload(page)
    await page.waitForSelector(SPLIT, { timeout: 30_000 })
    await page.click(AWAY)
    await page.waitForSelector('aside.px-chat', { state: 'detached', timeout: 10_000 })
    expect(await theFirstPress(page), 'the first press after the reload did not open the chat beside the page').toBe('split')
  } finally {
    await context.close()
  }
}, 180_000)

it('2. side column last used, reload: the first press of the corner button opens the chat beside the page', async () => {
  await nothingKept()
  const { context, page } = await aWindow('split')
  try {
    await theReport(page)
    await page.waitForSelector(SPLIT, { timeout: 30_000 })
    // A RELOAD OF A SHUT CHAT HAS ONLY THE OFFICE TO ASK, so the way the chat is open in must be kept for the person.
    await expect.poll(theWayKept, { timeout: 20_000, message: 'the chat beside the page is not kept on the person\'s row' }).toBe('split')
    await page.click(CIRCLE)
    await page.waitForSelector('aside.px-chat', { state: 'detached', timeout: 10_000 })
    await reload(page)
    // THE CHAT READS THE PERSON'S ROW AFTER THE PAGE IS DRAWN. Long enough for that read.
    await page.waitForTimeout(2_000)
    expect(await theFirstPress(page), 'the first press after the reload did not open the chat beside the page').toBe('split')
  } finally {
    await context.close()
  }
}, 180_000)

it('3. nothing remembered: the first press of the corner button opens the corner window, and keeps nothing', async () => {
  await nothingKept()
  const { context, page } = await aWindow('no')
  try {
    await theReport(page)
    // THE CHAT READS THE PERSON'S ROW AFTER THE PAGE IS DRAWN. Long enough for that read.
    await page.waitForTimeout(2_000)
    expect(await theFirstPress(page), 'the first press with nothing remembered did not open the corner window').toBe('window')
    await page.waitForTimeout(1_000)
    expect(await theWayKept(), 'opening the chat with nothing remembered kept a way').toBeNull()
  } finally {
    await context.close()
  }
}, 180_000)
