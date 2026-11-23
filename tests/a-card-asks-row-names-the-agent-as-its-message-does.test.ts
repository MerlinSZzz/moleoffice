// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change (wave 13s round 281, decision 0evm2ORnvdXu): the Home case reads the ask among the rows Home
// draws.
// Since HD-2d, Home's Needs you draws only its first `NEEDS_SHOWN` rows. In this office the ask and the two messages
// the asks sent are written in the same second. The waiting reading orders rows of one second by id, and the ids are
// random, so the ask was left out about one run in three. The case now has the person read both messages first, so the
// ask is the only waiting row. It checks by `GET /api/waiting` that the ask is among the first `NEEDS_SHOWN` rows
// before it reads Home. The Decisions page then draws no message, so opening it waits for the ask's row, and case 2
// waits for the message itself. Mutation 1 now turns case 3 red as well: under it the ask's row does not name the
// agent, and opening the Decisions page waits for that name. Before, the Home case was held to find the ask's row on
// Home whatever rows waited beside it.
/**
 * A CARD ASK'S ROW NAMES THE AGENT THE WAY THE MESSAGE BESIDE IT DOES, IN THE PAGE'S WORDS.
 *
 * An agent's ask for a card is stored with a title that names the asker by the registry id it was stored under, and
 * since the mint that id is twelve characters nobody chose. The Decisions page, its list of withdrawn asks and Home's
 * Needs you drew that stored title, so a row read "<twelve characters> asks for the supervisor card" beside a message
 * from the same agent signed with its name. Decision 3vcZMADIndHA: the waiting reading gives the row who asks and the
 * card, the pages write the sentence from the word files, and the stored title stays as it is. The asker is named by
 * its name, or by its handle when the registry holds no name, as the message beside it is. The list of withdrawn asks
 * then said who withdrew one by its handle, so one line named one agent two ways. One line names one agent one way:
 * whoever withdrew the ask is named as the asker is.
 *
 * WHAT IS MEASURED, in a test office with two made-up agents the person started, each with a name that is not its
 * handle. One asks for the supervisor card. The other asks and then withdraws its ask.
 *   1. GET /api/waiting gives the waiting ask's row, and the withdrawn ask's entry, the agent's name and the card, and
 *      leaves each stored title as it is; the withdrawn ask's entry names whoever withdrew it by its name too;
 *   2. the Decisions page draws the waiting ask's row in its own words, naming the agent as the unread message from it
 *      does, with no id; in the test language the row's words are marked as the page's;
 *   3. the list of withdrawn asks draws the withdrawn ask the same way, and says who withdrew it by the same name,
 *      with no handle;
 *   4. Home's Needs you draws the waiting ask's row the same way, once the person has read the two messages the asks
 *      sent; the case first checks that the ask is among the rows Home draws.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST:
 *   1. src/server/lib/waiting.ts: leave `askerAndCard` off the waiting row → cases 1, 2, 3 and 4;
 *   2. src/web/lib/waiting.ts: the row's words are the stored title again → cases 2, 3 and 4;
 *   3. GovernancePage.tsx: the withdrawn list draws the stored title again → case 3;
 *   4. HomeSections.tsx: Home reads a card ask's record for its words again → case 4;
 *   5. src/server/lib/waiting.ts: whoever withdrew an ask is named by its handle again → cases 1 and 3.
 *
 * PHOTOGRAPHS of Decisions and Home at 1440, 990, 660 and 390, light and dark, in English and Chinese, when
 * CARD_ASK_SHOTS names a folder: one at the row, and one at the foot of the page, where the corner chat button sits.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { cardWord } from '../src/shared/card-words.ts'
import { NEEDS_SHOWN } from '../src/web/components/home/HomeSections.tsx'

let app: LiveApp
let asPerson: Record<string, string> = {}

const ASKS = { handle: 'reed-example', name: 'Reed Example' }
const WITHDRAWS = { handle: 'wren-sample', name: 'Wren Sample' }
const CARD = 'supervisor'

/** Each ask as the test office stored it, with the message it sent. */
const stored: Record<'asks' | 'withdraws', { id: string; title: string; askerId: string; messageId: string }> = {
  asks: { id: '', title: '', askerId: '', messageId: '' },
  withdraws: { id: '', title: '', askerId: '', messageId: '' },
}

/** Every key in a reply replaced, so no failure message carries one. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, hidden(text)).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function get(url: string): Promise<Record<string, any>> {
  const res = await fetch(`${app.api}${url}`, { headers: asPerson })
  const text = await res.text()
  expect(res.status, hidden(text)).toBe(200)
  return JSON.parse(text) as Record<string, any>
}

/** The sentence a row names an agent's card ask in, in English, read from the word files. */
const theRowSays = (name: string): string => sayInEnglish('decisions.cardAskRow', { asker: name, card: cardWord(CARD, sayInEnglish) })

/** Put where a sentence says the time, so the words before it can be cut off and compared. */
const THE_TIME = '<the time>'

const ROW_TITLES = '.gq-row-title, .dq-title'
const MESSAGES = '[data-target="uiSurface/governance.messages"]'

async function openDecisions(lang: string): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${lang}#/governance`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  // A goto that changes only the hash keeps the page, so it is loaded again to read the language and the look.
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  // THE ASK'S ROW, which the page draws in every case. Once the Home case has read the messages, it draws none.
  await app.page.locator(ROW_TITLES, { hasText: ASKS.name }).first().waitFor({ state: 'visible', timeout: 30_000 })
}

async function openTheWithdrawnList(lang: string): Promise<void> {
  await openDecisions(lang)
  const fold = app.page.locator('[data-target="uiSurface/governance.excluded"]')
  await fold.waitFor({ state: 'visible', timeout: 30_000 })
  if ((await fold.getAttribute('open')) === null) await fold.locator('summary').click()
  await fold.locator('.gq-withdrawn').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Home's Needs you row for one ask, found by the ask's id. */
const homeRow = (id: string) => app.page.locator(`[data-home-section="needs"] .hm-needs-item:has([data-home-waiting-id="${id}"])`)

async function openHome(lang: string): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${lang}#/`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await app.page.reload({ timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
  await homeRow(stored.asks.id).waitFor({ state: 'visible', timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'card-ask-row', viewport: { width: 1440, height: 1000 } })
  asPerson = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
  for (const [which, agent] of [['asks', ASKS], ['withdraws', WITHDRAWS]] as const) {
    // THE AGENT'S KEY IS HELD HERE ONLY, in memory: never printed, never written.
    const started = await post('/api/agents/started', asPerson, { handle: agent.handle, name: agent.name, role: 'worker', workArea: ['work'] })
    const asAgent: Record<string, string> = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle }
    delete asAgent['x-mole-office-key']
    const asked = await post('/api/roles/requests', asAgent, { asking: CARD, because: 'Made-up: to lead a wave' })
    const id = String(asked['request'])
    const messageId = String(asked['message'])
    if (which === 'withdraws') {
      await post(`/api/roles/requests/${id}/withdraw`, { ...asAgent, 'x-mole-office-key': String(started['whatToGiveIt']?.key) }, {})
    }
    const record = (await get(`/api/records/${id}`))['record'] as { title: string; data: { asker: { id: string } } }
    stored[which] = { id, title: record.title, askerId: record.data.asker.id, messageId }
  }
  // THE PRECONDITION: each ask stores its asker by a registry id that is not its handle, and its title names that id.
  for (const [which, agent] of [['asks', ASKS], ['withdraws', WITHDRAWS]] as const) {
    expect(stored[which].askerId, 'the mint gave the agent an id of its own').not.toBe(agent.handle)
    expect(stored[which].title, 'the stored title names the asker by its id').toContain(stored[which].askerId)
  }
  await app.page.addInitScript(() => {
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe("a card ask's row", () => {
  it('is given the agent by its name and the card by the waiting reading, which leaves the stored title as it is', async () => {
    const waiting = await get('/api/waiting')
    const row = (waiting['items'] as { id: string; title: string; askerAndCard?: unknown }[]).find((one) => one.id === stored.asks.id)
    expect(row, 'the ask is a row of the waiting reading').toBeDefined()
    expect(row!.askerAndCard).toEqual({ asker: ASKS.name, card: CARD })
    expect(row!.title).toBe(stored.asks.title)

    const group = (waiting['excluded'] as { reason: string; withdrawn?: { id: string; title: string; by: string; askerAndCard?: unknown }[] }[])
      .find((one) => one.reason === 'withdrawn-by-its-asker')
    const listed = group?.withdrawn?.find((one) => one.id === stored.withdraws.id)
    expect(listed, 'the withdrawn ask is listed under what is not counted').toBeDefined()
    expect(listed!.askerAndCard).toEqual({ asker: WITHDRAWS.name, card: CARD })
    expect(listed!.title).toBe(stored.withdraws.title)
    expect(listed!.by, 'whoever withdrew the ask is named as the asker is').toBe(WITHDRAWS.name)
  }, 60_000)

  it('is written on the Decisions page in its words, naming the agent as the message from it does', async () => {
    await openDecisions('en')
    const titles = await app.page.locator(ROW_TITLES).allInnerTexts()
    expect(titles).toContain(theRowSays(ASKS.name))
    for (const title of titles) expect(title, 'a row draws a registry id').not.toContain(stored.asks.askerId)
    // THE MESSAGE THE ASK SENT, beside it, names the same agent by the same name.
    await app.page.locator(`${MESSAGES} .da-from`).first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await app.page.locator(`${MESSAGES} .da-from`).allInnerTexts()).toContain(sayInEnglish('decisionsAsks.from', { name: ASKS.name }))

    // THE TEST LANGUAGE MARKS EVERY WORD THE PAGE WROTE, and the agent's name is content and is not marked.
    await openDecisions('xx')
    const marked = (await app.page.locator(ROW_TITLES).allInnerTexts()).filter((one) => one.includes(ASKS.name))
    expect(marked, 'one row names the agent').toHaveLength(1)
    expect(marked[0]!.startsWith('⟦'), `the row "${marked[0]!}" is not in the page's words`).toBe(true)
  }, 180_000)

  it('is written the same way in the list of withdrawn asks', async () => {
    await openTheWithdrawnList('en')
    const line = app.page.locator('.gq-withdrawn li')
    expect(await line.count()).toBe(1)
    expect(await line.locator('.gq-withdrawn-open').innerText()).toBe(theRowSays(WITHDRAWS.name))
    // ONE LINE NAMES ONE AGENT ONE WAY: who withdrew the ask is said by the same name, read from the word files up to
    // the time, which the page writes in its own way.
    const said = sayInEnglish('w13w.withdrawn.byTheAsker', { by: WITHDRAWS.name, at: THE_TIME })
    const text = await line.innerText()
    expect(text).toContain(said.slice(0, said.indexOf(THE_TIME)))
    expect(text).not.toContain(WITHDRAWS.handle)
    expect(text).not.toContain(stored.withdraws.askerId)
  }, 120_000)

  it("is written the same way in Home's Needs you", async () => {
    // THE PERSON READS THE TWO MESSAGES THE ASKS SENT, so the ask is the only row waiting, and Home draws it.
    for (const which of ['asks', 'withdraws'] as const) {
      await post(`/api/messages/${stored[which].messageId}/mark`, asPerson, { mark: 'seen' })
    }
    // THE ASK IS AMONG THE ROWS HOME DRAWS, or the case says what crowded it out.
    const items = (await get('/api/waiting'))['items'] as { id: string; title: string }[]
    const place = items.findIndex((one) => one.id === stored.asks.id)
    const ahead = (place < 0 ? items : items.slice(0, place)).map((one) => one.title)
    const why =
      `the ask's place in the waiting reading is ${String(place)} (-1 means it is not a row); Home draws the first ` +
      `${String(NEEDS_SHOWN)}; the rows ahead of it, or every row when it is not one, are ${JSON.stringify(ahead)}`
    expect(place, why).toBeGreaterThanOrEqual(0)
    expect(place, why).toBeLessThan(NEEDS_SHOWN)
    await openHome('en')
    const one = homeRow(stored.asks.id)
    expect(await one.locator('.hm-row-title').innerText()).toBe(theRowSays(ASKS.name))
    expect(await one.innerText()).not.toContain(stored.asks.askerId)
  }, 120_000)

  it.skipIf(!process.env['CARD_ASK_SHOTS'])('photographs Decisions and Home at four widths, light and dark, in English and Chinese', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['CARD_ASK_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    for (const lang of ['en', 'zh'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
          for (const page of ['decisions', 'home'] as const) {
            if (page === 'decisions') await openTheWithdrawnList(lang)
            else await openHome(lang)
            expect(await app.page.locator('html').getAttribute('data-theme')).toBe(theme)
            const drawn = await app.page.evaluate(() => document.documentElement.scrollWidth)
            expect(drawn, `${page} ${lang} ${String(width)} ${theme} is wider than the screen`).toBeLessThanOrEqual(width)
            const row = page === 'decisions' ? app.page.locator(ROW_TITLES, { hasText: ASKS.name }).first() : homeRow(stored.asks.id)
            await row.scrollIntoViewIfNeeded()
            await app.page.screenshot({ path: `${shots}/${page}-${lang}-${String(width)}-${theme}.png`, fullPage: false })
            // THE FOOT OF THE PAGE, where the corner chat button would sit over the last line if the page left it no room.
            await app.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
            await app.page.screenshot({ path: `${shots}/${page}-${lang}-${String(width)}-${theme}-foot.png`, fullPage: false })
          }
        }
      }
    }
  }, 900_000)
})
