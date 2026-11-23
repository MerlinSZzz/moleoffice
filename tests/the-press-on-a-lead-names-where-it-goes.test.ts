// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFER NAMES WHERE A LEAD GOES, AND THE PRESS IS SHORT AGAIN.
 *
 * The offer had become too long, and the press named a place
 * in a sentence of its own. The offer now says where it goes above the presses, in the words of
 * `chatEnglish.lead.offer` with the real place, and the press is the short `chatEnglish.lead.takeMe`.
 * The sentence that stood under the presses, `chatEnglish.lead.notNowMeans`, is not drawn at all.
 *
 * The office is this test's own (liveApp), filled through its real doors. An agent sends the person
 * three leads: to a report with a short title, to a report with a long title, and to a page.
 *
 * WHAT IS PROVED
 *   1. On the offer card the sentence names the place in the offer's own words, the long title is
 *      named whole, the press draws the short word from the word list and not the place, and the
 *      old not-now sentence is nowhere on the card.
 *   2. The chat draws the same sentence and the same short press under each message.
 *   3. At 1440 and 390, in light, nothing scrolls sideways, no press runs out of
 *      its card, and Not now stays on one line. Pictures of each are kept only when TEST_SHOTS
 *      names a folder.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the offer goes back to naming no place                 → case 1
 *   the press names the place again                        → cases 1 and 2
 *   the not-now sentence is drawn again                    → case 1
 *   the long title is cut out of the offer                 → case 1
 *   the chat's sentence or press is not the card's         → case 2
 *   Not now may break again beside the presses             → case 3
 */
import { join } from 'node:path'
import type { Locator, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LEADING } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, type LiveApp, waitForThePage } from './helpers.ts'
import { testShots } from './where-shots-go.ts'
import { openTheChat } from './open-the-chat.ts'
import { pageTitle } from '../src/web/components/Sidebar.tsx'
import { parseRoute } from '../src/web/components/router.tsx'

const WIDTHS = [1440, 390] as const
const THEMES = ['light'] as const
type Theme = (typeof THEMES)[number]

const GUIDE = 'guide-press'
const GUIDE_NAME = 'Test agent Guide'
const SHORT_TITLE = 'Test: what the bench said'
const LONG_TITLE = 'Test: what the bench said about the mount tolerance after the knock on Tuesday'
const THE_PAGE = '/records'
const SHOTS = testShots('lead-press')

let app: LiveApp
let page: Page
const pageErrors: string[] = []
let person: Record<string, string>
let key = ''
const sent: { name: string; id: string; body: string; place: string }[] = []

async function call(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${text}`)
  return text === '' ? {} : (JSON.parse(text) as Record<string, any>)
}

const asPerson = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...person })
const asGuide = (): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': GUIDE, 'x-mole-office-key': key })

async function open(where: string, theme: Theme, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/?lang=en#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Nothing scrolls sideways, and every press of this kind ends inside the box it is drawn in. */
async function nothingRunsOut(name: string, press: string, box: string, theme: Theme, width: number): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `${name} at ${String(width)} in ${theme} scrolls sideways`).toBeLessThanOrEqual(0)
  const outside = await page.evaluate(
    ([pressSelector, boxSelector]) =>
      [...document.querySelectorAll(pressSelector!)].flatMap((one) => {
        const holder = one.closest(boxSelector!)
        if (holder === null) return [`${one.textContent ?? ''} is drawn outside any box`]
        const p = one.getBoundingClientRect()
        const b = holder.getBoundingClientRect()
        return p.right > b.right + 0.5 || p.left < b.left - 0.5 ? [`${one.textContent ?? ''} runs out of its box`] : []
      }),
    [press, box] as const,
  )
  expect(outside, `${name} at ${String(width)} in ${theme}`).toEqual([])
  // WHAT THE READER SEES IN THE WINDOW: the card and the chat stay put while the page under them scrolls.
  await page.screenshot({ path: join(SHOTS, `${name}-${String(width)}-${theme}.png`) })
}

/** Words as a person reads them, with the wrapping the layout added taken out. */
const oneLine = (words: string): string => words.replace(/\s+/g, ' ').trim()

/** What one press draws and what it is called aloud. */
async function thePress(press: Locator): Promise<{ words: string; whole: string; hover: string }> {
  await press.waitFor({ state: 'visible', timeout: 30_000 })
  return {
    words: oneLine(await press.innerText()),
    whole: (await press.getAttribute('aria-label')) ?? '',
    hover: (await press.getAttribute('title')) ?? '',
  }
}

/** Open the chat with one contact, by the name its row shows. */
async function chatWith(name: string): Promise<void> {
  await openTheChat(page)
  await page.locator('.px-chat').waitFor({ state: 'visible', timeout: 30_000 })
  if ((await page.$('.px-chat-back')) !== null) await page.click('.px-chat-back')
  await page.locator('.px-chat-contact', { hasText: name }).first().click()
  await page.locator('.px-chat-words').first().waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'lead-press', workspace: 'default', viewport: { width: 1440, height: 900 } })
  page = app.page
  page.on('pageerror', (error) => pageErrors.push(error.message))
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  const started = await call('POST', '/api/agents/started', asPerson(), { handle: GUIDE, name: GUIDE_NAME, role: 'worker', runtime: 'claude-code' })
  key = String(started['whatToGiveIt']?.key)
  const blocks = [{ id: 'b-1', type: 'text', text: 'Test: the mount tolerance is 0.2 mm and nobody measured it.' }]
  const short = await call('POST', '/api/records', asPerson(), { kind: 'report', title: SHORT_TITLE, data: { blocks } })
  const long = await call('POST', '/api/records', asPerson(), { kind: 'report', title: LONG_TITLE, data: { blocks } })
  const leads: [string, string, Record<string, unknown>][] = [
    ['the short title', SHORT_TITLE, { kind: 'record', recordId: String(short['record'].id), workspaceId: 'default' }],
    ['the long title', LONG_TITLE, { kind: 'record', recordId: String(long['record'].id), workspaceId: 'default' }],
    ['the page', pageTitle(parseRoute(`#${THE_PAGE}`)), { kind: 'page', route: THE_PAGE }],
  ]
  for (const [name, place, target] of leads) {
    const body = `Test: come and look at ${name}.`
    const made = await call('POST', '/api/records', asGuide(), {
      kind: 'message',
      title: `Test: come and look at ${name}`,
      data: { body, to: [{ kind: 'person', id: THE_PERSON }], lead: { target } },
    })
    sent.push({ name, id: String(made['record'].id), body, place })
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const cardOf = (id: string): string => `.px-lead-offer[data-lead-message="${id}"]`
const sentenceOf = (place: string): string => LEADING.offer(GUIDE_NAME, place)

describe('the offer names where a lead goes, and the press is short', () => {
  const drawn = new Map<string, { sentence: string; press: string }>()

  it('names the place in the offer, keeps the long title whole, and draws no not-now sentence', async () => {
    await open(THE_PAGE, 'light', 1440)
    for (const one of sent) {
      const sentence = oneLine((await page.locator(`${cardOf(one.id)} .px-lead-words`).textContent()) ?? '')
      expect(sentence, `the offer for ${one.name} does not name the place`).toBe(sentenceOf(one.place))
      const press = await thePress(page.locator(`${cardOf(one.id)} .px-lead-go`))
      expect(press.words, `the press on ${one.name} is not the short word`).toBe(LEADING.takeMe)
      expect(press.whole, `the press on ${one.name} is called by something else`).toBe('')
      expect(press.hover, `the press on ${one.name} carries a hover word`).toBe('')
      const card = oneLine((await page.locator(cardOf(one.id)).textContent()) ?? '')
      expect(card, `the not-now sentence is drawn under ${one.name}`).not.toContain(LEADING.notNowMeans)
      expect(await page.locator(`${cardOf(one.id)} .px-lead-not-means`).count()).toBe(0)
      drawn.set(one.id, { sentence, press: press.words })
    }
    expect(pageErrors).toEqual([])
  }, 240_000)

  it('draws nothing past the card at the widest and the narrowest width in the light look', async () => {
    for (const width of WIDTHS) for (const theme of THEMES) {
      await open(THE_PAGE, theme, width)
      for (const one of sent) await page.locator(`${cardOf(one.id)} .px-lead-go`).waitFor({ state: 'visible', timeout: 30_000 })
      const broken = await page.evaluate(() =>
        [...document.querySelectorAll('.px-lead-not')].flatMap((one) => {
          const range = document.createRange()
          range.selectNodeContents(one)
          const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
          return lines.size > 1 ? [`${one.textContent ?? ''} takes ${String(lines.size)} lines`] : []
        }),
      )
      expect(broken, `Not now at ${String(width)} in ${theme}`).toEqual([])
      await nothingRunsOut('card', '.px-lead-go', '.px-lead-offer', theme, width)
    }
  }, 590_000)

  it('draws the same sentence and the same short press under each message in the chat', async () => {
    for (const width of WIDTHS) for (const theme of THEMES) {
      await open(THE_PAGE, theme, width)
      await chatWith(GUIDE_NAME)
      for (const one of sent) {
        // A LINE OF A CONVERSATION WITH ONE WRITER CARRIES NO MESSAGE ID, so it is found by the words it holds.
        const line = page.locator('.px-chat-one', { has: page.locator('.px-chat-words', { hasText: one.body }) })
        const lead = line.locator('.px-chat-lead')
        const sentence = oneLine((await lead.locator('.px-chat-lead-words').textContent()) ?? '')
        const press = await thePress(lead.locator('.px-chat-lead-go'))
        expect({ sentence, press: press.words }, `the chat's offer on ${one.name}`).toEqual(drawn.get(one.id))
      }
      await nothingRunsOut('chat', '.px-chat-lead-go', '.px-chat-lead', theme, width)
    }
    expect(pageErrors).toEqual([])
  }, 590_000)
})
