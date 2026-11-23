// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAITING PAIRING REQUEST SHOWS AT THE TOP OF HOME, IN A REAL BROWSER.
 *
 * When a browser or a device asks to pair, the person had to open their own card to find the ask, and Home said only
 * one more row under Needs you. Now Home draws a part at its top, after the pause notice's place and before Home's
 * parts, with one asking card for each waiting request: the name, the first called line, Confirm and Refuse. The
 * part's heading is "Pairing request", or "Pairing requests" when more than one waits, and 配对请求 in Chinese. Needs
 * you draws no row for a request the part draws, and still counts it in its number.
 *
 * WHAT IS MEASURED, against a real stack whose made-up devices ask through the real door:
 *   1. with nothing waiting, Home draws no pairing part;
 *   2. with Home open, a device asks, and within ten seconds, with no reload, the part shows in its place with the
 *      heading, the card's name, its first called line, Confirm and Refuse; Needs you draws no row of that name, and
 *      its number is the whole waiting list's, the request counted;
 *   3. with two asks, the heading is plural over two cards;
 *   4. Confirm on Home takes the card away, and the credential is trusted;
 *   5. Refuse on Home takes the card away, and the credential is ended; with none left, the part is gone;
 *   6. at 390 wide, in light and in dark, the card lies inside the window's width;
 *   7. in Chinese the heading is 配对请求.
 *
 * WHY 2 TO 5 FAIL BEFORE THE CHANGE: Home drew no pairing part at all, so no heading, card or press is there to find,
 * and Needs you drew the request as a row of its own.
 *
 * THE CHINESE CASE AWAITS THE LANGUAGE READING. A test cannot call `readLanguage` inside the built page, so the case
 * sets the person's language to Chinese and waits for the page's language to be Chinese: the page draws the person's
 * choice only when its reading of the person has answered.
 *
 * THE PAUSE NOTICE IS NOT DRAWN HERE. Pausing the office would leave it paused for the cases after; the order checked
 * is the head, then the notice when one is drawn, then the part, then Home's parts.
 *
 * Every device and agent here is made up by this file.
 */

import type { BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { VisitorCredential } from '../src/shared/visitors.ts'
import { hisBrowsersIn } from '../src/shared/worlds.ts'

let app: LiveApp

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** The headers of an agent, under the handle its registration answered. */
let asker: Record<string, string>

/** Where the part is, and the words its heading is written in. */
const PART = '[data-home-section="pairing"]'
const ONE_WAITS = 'Pairing request'
const MORE_WAIT = 'Pairing requests'
const IN_CHINESE = '配对请求'

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = (await reply.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(reply.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function read<T>(path: string): Promise<T> {
  const reply = await fetch(`${app.api}${path}`, { headers: AS_THE_PERSON })
  expect(reply.status, path).toBe(200)
  return (await reply.json()) as T
}

/** A device asks to pair, through the door his-card-holds-his-browsers-in-the-browser.test.ts asks through. */
async function aDeviceAsks(device: string): Promise<string> {
  return String((await post('/api/office/visitors', { device }, asker))['credential'].id)
}

const credentials = async (): Promise<VisitorCredential[]> => (await read<{ credentials: VisitorCredential[] }>('/api/office/visitors')).credentials
const standingOf = async (id: string): Promise<string | null> => (await credentials()).find((one) => one.id === id)?.standing ?? null

/** Opens Home and waits for its parts. */
async function openHome(page: Page = app.page): Promise<void> {
  await page.goto(`${app.site}/?pairing=${String(Date.now())}#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('[data-home-layout]').waitFor({ timeout: 30_000 })
}

/** The heading of the part, as it is written: the text and not the drawn case, which a theme may change. */
const theHeading = (page: Page = app.page): Promise<string | null> =>
  page.locator(`${PART} .hm-section-title`).first().evaluate((el) => el.textContent?.trim() ?? null)

beforeAll(async () => {
  app = await liveApp({ name: 'pairing-on-home', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  // THE AGENT THAT ASKS FOR A DEVICE IS REGISTERED FIRST. On a socket, a write under an agent id that no registry
  // row answers to is refused with 403. The person starts it, and it asks under the handle the registration answers.
  const started = await post('/api/agents/started', { handle: 'a-made-up-pairing-asker', name: 'A made-up pairing asker', role: 'worker' })
  asker = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': String(started['whatToGiveIt'].handle) }
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.workspace') === null) localStorage.setItem('mole-office.workspace', 'default')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const made = { first: '', second: '' }
const FIRST = 'Made-up kitchen phone'
const SECOND = 'Made-up garage tablet'

describe('the part at the top of Home', () => {
  it('is not drawn while no request waits', async () => {
    expect(hisBrowsersIn(await credentials()).waiting, 'a request already waits, so this measures nothing').toEqual([])
    await openHome()
    expect(await app.page.locator(PART).count()).toBe(0)
  }, 120_000)

  it('shows a request asked while Home is open, in its place, and Needs you counts it with no row of its own', async () => {
    // THE ASK IS MADE ONCE THE PAGE LISTENS: the event stream has answered, so the announcement cannot come before it.
    const listening = app.page.waitForResponse((reply) => new URL(reply.url()).pathname === '/api/events', { timeout: 60_000 })
    await openHome()
    await listening
    made.first = await aDeviceAsks(FIRST)
    const part = app.page.locator(PART)
    // WITHIN TEN SECONDS AND WITH NO RELOAD: the office announces the ask, and the open page reads the list again.
    await part.waitFor({ state: 'visible', timeout: 10_000 })
    const order = await app.page.evaluate((selector) => {
      const head = document.querySelector('.hm-page-head')
      const drawn = document.querySelector(selector)
      const parts = document.querySelector('[data-home-layout]')
      const pause = document.querySelector('.office-pause-notice')
      if (head === null || drawn === null || parts === null) return 'one of the three is not drawn'
      const before = (a: Element, b: Element): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      if (parts.contains(drawn)) return 'inside Home\'s parts'
      if (pause !== null && !before(pause, drawn)) return 'above the pause notice'
      return before(head, drawn) && before(drawn, parts) ? 'head, part, parts' : 'out of order'
    }, PART)
    expect(order).toBe('head, part, parts')
    expect(await theHeading()).toBe(ONE_WAITS)
    const { EMBASSY_WORDS } = await import('../src/web/pages/EmbassyPage.tsx')
    const card = part.locator(`.emb-asking-card[data-browser="${made.first}"]`)
    expect(await card.count(), 'one card for the request').toBe(1)
    // AS WRITTEN, NOT AS DRAWN: the card's labels are drawn in capitals (EMBASSY_CSS), and innerText reads the capitals.
    const written = (selector: string) => card.locator(selector).first().evaluate((el) => el.textContent?.trim() ?? null)
    expect(await written('.emb-name')).toBe(FIRST)
    expect(await card.locator('.emb-key').evaluateAll((all) => all.map((el) => el.textContent?.trim())), 'the first called line').toContain(EMBASSY_WORDS.firstCalled)
    expect(await card.getByRole('button', { name: EMBASSY_WORDS.confirm }).count(), 'Confirm').toBe(1)
    expect(await card.getByRole('button', { name: EMBASSY_WORDS.refuse }).count(), 'Refuse').toBe(1)
    // NEEDS YOU DRAWS NO ROW OF IT, AND STILL COUNTS IT: its number is the whole waiting list's.
    const needs = app.page.locator('[data-home-section="needs"]')
    expect(await needs.getByText(FIRST).count(), 'a row in Needs you for the request the part draws').toBe(0)
    const waiting = await read<{ items: { id: string }[] }>('/api/waiting')
    expect(waiting.items.map((one) => one.id), 'the waiting list holds the request').toContain(made.first)
    await expect.poll(() => needs.locator('.hm-needs-count').evaluate((el) => el.textContent?.trim()), { timeout: 10_000 })
      .toBe(String(waiting.items.length))
  }, 120_000)

  it('says the plural over two cards when two requests wait', async () => {
    made.second = await aDeviceAsks(SECOND)
    const part = app.page.locator(PART)
    await expect.poll(() => part.locator('.emb-asking-card').count(), { timeout: 10_000 }).toBe(2)
    expect(await theHeading()).toBe(MORE_WAIT)
    expect(await part.locator(`.emb-asking-card[data-browser="${made.second}"] .emb-name`).evaluate((el) => el.textContent?.trim())).toBe(SECOND)
  }, 120_000)

  it('confirms a request on Home: the card leaves and the device is trusted', async () => {
    const { EMBASSY_WORDS } = await import('../src/web/pages/EmbassyPage.tsx')
    const part = app.page.locator(PART)
    const card = part.locator(`.emb-asking-card[data-browser="${made.first}"]`)
    await card.waitFor({ state: 'visible', timeout: 10_000 })
    await card.getByRole('button', { name: EMBASSY_WORDS.confirm }).click()
    await card.waitFor({ state: 'detached', timeout: 10_000 })
    expect(await standingOf(made.first)).toBe('trusted')
    expect(await theHeading(), 'one request is left').toBe(ONE_WAITS)
  }, 120_000)

  it('refuses a request on Home: the card leaves, the device is ended, and with none left the part goes', async () => {
    const { EMBASSY_WORDS } = await import('../src/web/pages/EmbassyPage.tsx')
    const part = app.page.locator(PART)
    const card = part.locator(`.emb-asking-card[data-browser="${made.second}"]`)
    await card.waitFor({ state: 'visible', timeout: 10_000 })
    // REFUSE ASKS ONCE MORE, in its own dialog, as every press of the confirm tier does (src/web/components/TieredPress.tsx).
    await card.getByRole('button', { name: EMBASSY_WORDS.refuse }).click()
    await app.page.getByRole('dialog').locator('.tiered-question-acts button').last().click()
    await card.waitFor({ state: 'detached', timeout: 10_000 })
    expect(await standingOf(made.second)).toBe('ended')
    await app.page.locator(PART).waitFor({ state: 'detached', timeout: 10_000 })
  }, 120_000)
})

describe('the card on a narrow window and in Chinese', () => {
  const NARROW = 'Made-up hall phone'
  let narrow = ''

  it('lies inside the window at 390 wide, in light and in dark', async () => {
    narrow = await aDeviceAsks(NARROW)
    for (const theme of ['light', 'dark'] as const) {
      const context: BrowserContext = await app.browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' })
      await context.addInitScript((look) => {
        localStorage.setItem('mole-office.preset.theme', look)
        localStorage.setItem('mole-office.workspace', 'default')
        localStorage.setItem('mole-office.chat.open', 'no')
      }, theme)
      try {
        const view = await context.newPage()
        await openHome(view)
        expect(await view.locator('html').getAttribute('data-theme')).toBe(theme)
        const card = view.locator(`${PART} .emb-asking-card[data-browser="${narrow}"]`)
        await card.waitFor({ state: 'visible', timeout: 30_000 })
        const inside = await card.evaluate((el) => {
          const box = el.getBoundingClientRect()
          return box.left >= 0 && box.right <= window.innerWidth
        })
        expect(inside, `the card at 390 wide in ${theme}`).toBe(true)
      } finally {
        await context.close()
      }
    }
  }, 180_000)

  it('heads the part 配对请求 in Chinese', async () => {
    const chosen = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: AS_THE_PERSON, body: JSON.stringify({ language: 'zh' }) })
    expect(chosen.status, await chosen.clone().text()).toBe(200)
    try {
      await openHome()
      // THE LANGUAGE READING HAS ANSWERED when the page is drawn in the person's choice.
      await app.page.waitForFunction(() => document.documentElement.lang === 'zh', undefined, { timeout: 20_000 })
      await app.page.locator(`${PART} .emb-asking-card[data-browser="${narrow}"]`).waitFor({ state: 'visible', timeout: 30_000 })
      expect(await theHeading()).toBe(IN_CHINESE)
    } finally {
      const back = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, { method: 'PATCH', headers: AS_THE_PERSON, body: JSON.stringify({ language: '' }) })
      expect(back.status, await back.clone().text()).toBe(200)
    }
  }, 120_000)
})
