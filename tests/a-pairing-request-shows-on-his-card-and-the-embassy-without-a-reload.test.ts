// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAIRING REQUEST SHOWS ON THE PERSON'S CARD AND ON THE EMBASSY PAGE WITHOUT A RELOAD, IN A REAL BROWSER.
 *
 * The person had his own card open, at the part "Your browsers and machines", when another device pressed pair.
 * Nothing changed until the page was loaded again. The embassy page did the same with a visitor's ask for a card.
 * Home already draws such a request at once. The office tells every open page that what waits on the person changed
 * when a pairing request is asked, confirmed or ended, and Home reads that list again on the notice.
 *
 * WHAT IS MEASURED, against a real stack whose made-up devices and visitors ask through the real door. Each page is
 * opened afresh, and its window is marked so that a reload would be seen. Before each ask the page is listening: the
 * server holds its event stream open, so the notice cannot come before it. Every change is made through the office's
 * doors from outside the page, and after each wait the mark is still there.
 *   1. With nothing waiting, the person's card draws no waiting browser, and the embassy page draws no asking card.
 *   2. On the person's card, at 1440 in light, a device asks. Within eight seconds its row is drawn in the part with
 *      Confirm and Refuse.
 *   3. The person confirms it through the door. Within eight seconds its row is still drawn, with neither press.
 *   4. A second device asks, and within eight seconds its row is drawn with both presses. The person ends it through
 *      the door. Within eight seconds its row is still drawn, with neither press.
 *   5. On the embassy page, at 1440 in light, a visitor asks for a card. Within eight seconds the asking list draws
 *      it with Confirm and Refuse.
 *   6. The person confirms it through the door. Within eight seconds it is not in the asking list. Then a second
 *      visitor asks and is drawn within eight seconds. The person ends that ask through the door. Within eight
 *      seconds it is not in the asking list.
 *   7. On both pages, at 1440 in dark and at 390 in light and in dark, each in a new window: a new ask is drawn within
 *      eight seconds, and at 390 its row lies inside the window's width.
 *
 * WHY EIGHT SECONDS. An open page reads again half a second after the first notice it follows, and then at most once
 * in five seconds (src/web/lib/record-changes.ts). So a change is drawn within about five and a half seconds at the
 * worst. Neither page reads on a timer, so no timed read can pass a case.
 *
 * WHY THE CASES FAIL BEFORE THE CHANGE. Neither page read again on the notice that a pairing request was asked,
 * confirmed or ended. The person's card read his browsers once, and again only after a press on the card. The
 * embassy page read again only when the registry of agents or the visits changed. So nothing new was drawn until a
 * reload, and cases 2 to 5 and 7 fail, and so does the second step of case 6.
 *
 * THE FIRST STEP OF CASE 6 MAY PASS BEFORE THE CHANGE. Confirming a visitor writes its agent row. That write tells the
 * open pages that the registry of agents changed, and the embassy page already reads again on that. Ending the second
 * visitor's ask writes no agent row, so only the pairing notice tells the page, and that step fails before the change.
 *
 * Every device, visitor, handle and agent here is made up by this file.
 */

import { join } from 'node:path'
import type { BrowserContext, Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { listening, notReloaded, open as openIn, type HeardOffice } from './a-page-that-hears-changes.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { VisitorCredential } from '../src/shared/visitors.ts'
import { anAskTheEmbassyDraws, hisBrowsersIn } from '../src/shared/worlds.ts'
import { hrefOf, visitorPath, whoPath } from '../src/web/components/router.tsx'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'

let app: LiveApp
/** The person's key, read from beside this file's test database. */
let person: Record<string, string> = {}
/** The headers of the made-up agent that asks, under the handle its registration answered. They carry no key. */
let asker: Record<string, string> = {}

/** How long a change may take to be drawn: over the five and a half seconds of the worst case above. */
const DRAWN_WITHIN_MS = 8_000

/** The part on the person's card, the embassy's asking list, and the embassy's list of everybody. */
const HIS_PART = '[data-target$="profile.browsers"]'
const THE_ASKING_LIST = '[data-target$="embassy.asking"]'
const EVERYBODY = '[data-target$="embassy.citizens"]'

const asThePerson = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  ...person,
})

async function post(path: string, body: unknown, headers: Record<string, string> = asThePerson()): Promise<Record<string, any>> {
  const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = (await reply.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(reply.status, `${path}: ${text.slice(0, 400)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** Every credential this office holds, as the door answers the person. */
async function credentials(): Promise<VisitorCredential[]> {
  const reply = await fetch(`${app.api}/api/office/visitors`, { headers: asThePerson() })
  expect(reply.status, 'the credentials door').toBe(200)
  return ((await reply.json()) as { credentials: VisitorCredential[] }).credentials
}

/** A made-up device asks to pair, through the door the Home test asks through. */
async function aDeviceAsks(device: string): Promise<string> {
  return String((await post('/api/office/visitors', { device }, asker))['credential'].id)
}

/** A made-up visitor asks for a card of its own, as the embassy's visitor test asks. */
async function aVisitorAsks(handle: string, name: string): Promise<string> {
  const said = await post('/api/office/visitors', { handle, name, role: 'worker', conversationPath: `/tmp/${handle}.jsonl` }, asker)
  return String(said['credential'].id)
}

/** The person confirms a credential, or ends it, through the door, from outside the page. */
const confirm = async (id: string): Promise<void> => void (await post(`/api/office/visitors/${id}/confirm`, {}))
const end = async (id: string): Promise<void> => void (await post(`/api/office/visitors/${id}/end`, {}))

/** This file's test office, as the pages are opened in it. */
function heard(): HeardOffice {
  return { api: app.api, site: app.site, headers: asThePerson() }
}

/** Open the person's card afresh and listening, and wait until the part has drawn its reading of the browsers. */
async function openHisCard(page: Page): Promise<void> {
  await openIn(heard(), page, whoPath('person', THE_PERSON), HIS_PART)
  const { YOUR_BROWSERS_WORDS } = await import('../src/web/components/YourBrowsersAndMachines.tsx')
  // THE PART DRAWS THIS HEADING ONLY WITH ITS READING of the browsers, so a list still loading is not read as empty.
  await page.locator(`${HIS_PART} h3`, { hasText: YOUR_BROWSERS_WORDS.waiting }).waitFor({ state: 'visible', timeout: 30_000 })
}

/** Open the embassy page afresh and listening. */
async function openTheEmbassy(page: Page): Promise<void> {
  await openIn(heard(), page, '/embassy', EVERYBODY)
}

/** One browser's row in the part on the person's card, by its credential. */
const hisRow = (page: Page, id: string): Locator => page.locator(`${HIS_PART} [data-browser="${id}"]`)
/** One visitor's card in the embassy's asking list, by the credential page its name leads to. */
const anAsk = (page: Page, id: string): Locator =>
  page.locator(`${THE_ASKING_LIST} .emb-asking-card:has(.emb-name[href="${hrefOf(visitorPath(id))}"])`)

/** Whether a row is drawn, and how many of the two presses a waiting request is drawn with it holds. */
async function drawnWith(row: Locator): Promise<{ rows: number; confirm: number; refuse: number }> {
  return {
    rows: await row.count(),
    confirm: await row.getByRole('button', { name: EMBASSY_WORDS.confirm }).count(),
    refuse: await row.getByRole('button', { name: EMBASSY_WORDS.refuse }).count(),
  }
}
const WAITING = { rows: 1, confirm: 1, refuse: 1 }
const ANSWERED = { rows: 1, confirm: 0, refuse: 0 }

/** Whether a row lies inside the window's width. */
const insideTheWindow = (row: Locator): Promise<boolean> =>
  row.evaluate((el) => {
    const box = el.getBoundingClientRect()
    return box.left >= 0 && box.right <= window.innerWidth
  })

beforeAll(async () => {
  app = await liveApp({ name: 'pairing-on-his-card-and-the-embassy', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  // THE AGENT THAT ASKS IS REGISTERED FIRST. On a socket, a write under an agent id that no registry row answers to is
  // refused with 403. The person starts it, and it asks under the handle the registration answers, with no key, so
  // the office reads each ask as the agent's and not as the person's.
  const started = await post('/api/agents/started', { handle: 'a-made-up-pairing-asker', name: 'A made-up pairing asker', role: 'worker' })
  asker = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': String(started['whatToGiveIt'].handle),
  }
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.workspace', 'default')
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

const made = { firstDevice: '', secondDevice: '', firstVisitor: '', secondVisitor: '' }

it('1. with nothing waiting, the person\'s card draws no waiting browser and the embassy page draws no asking card', async () => {
  const all = await credentials()
  expect(hisBrowsersIn(all).waiting, 'a browser already waits, so this measures nothing').toEqual([])
  expect(all.filter(anAskTheEmbassyDraws), 'a visitor already asks, so this measures nothing').toEqual([])
  await openHisCard(app.page)
  expect(await app.page.locator(`${HIS_PART} .emb-asking-card`).count(), 'a waiting browser on the card').toBe(0)
  expect(await notReloaded(app.page)).toBe(true)
  await openTheEmbassy(app.page)
  expect(await app.page.locator('.emb-asking-card').count(), 'an asking card on the embassy page').toBe(0)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('2. the person\'s card, 1440 light: a device that asks is drawn with Confirm and Refuse, with no reload', async () => {
  await openHisCard(app.page)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe('light')
  made.firstDevice = await aDeviceAsks('Made-up kitchen phone')
  const row = hisRow(app.page, made.firstDevice)
  await expect.poll(() => drawnWith(row), { timeout: DRAWN_WITHIN_MS }).toEqual(WAITING)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('3. the person\'s card: a device confirmed through the door no longer draws the waiting presses, with no reload', async () => {
  await listening(heard(), 1)
  await confirm(made.firstDevice)
  await expect.poll(() => drawnWith(hisRow(app.page, made.firstDevice)), { timeout: DRAWN_WITHIN_MS }).toEqual(ANSWERED)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('4. the person\'s card: a second device is drawn when it asks, and loses the waiting presses when it is ended, with no reload', async () => {
  await listening(heard(), 1)
  made.secondDevice = await aDeviceAsks('Made-up garage tablet')
  const row = hisRow(app.page, made.secondDevice)
  await expect.poll(() => drawnWith(row), { timeout: DRAWN_WITHIN_MS }).toEqual(WAITING)
  expect(await notReloaded(app.page)).toBe(true)
  await listening(heard(), 1)
  await end(made.secondDevice)
  await expect.poll(() => drawnWith(row), { timeout: DRAWN_WITHIN_MS }).toEqual(ANSWERED)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('5. the embassy page, 1440 light: a visitor that asks for a card is drawn in the asking list with its presses, with no reload', async () => {
  await openTheEmbassy(app.page)
  expect(await app.page.locator('html').getAttribute('data-theme')).toBe('light')
  made.firstVisitor = await aVisitorAsks('made-up-heron-visitor', 'Made-up heron from the lab')
  await expect.poll(() => drawnWith(anAsk(app.page, made.firstVisitor)), { timeout: DRAWN_WITHIN_MS }).toEqual(WAITING)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('6. the embassy page: a visitor confirmed through the door, and a second visitor ended through the door, leave the asking list, with no reload', async () => {
  // THE FIRST STEP MAY PASS BEFORE THE CHANGE, as the header says: confirming writes the visitor's agent row.
  await listening(heard(), 1)
  await confirm(made.firstVisitor)
  await anAsk(app.page, made.firstVisitor).waitFor({ state: 'detached', timeout: DRAWN_WITHIN_MS })
  expect(await notReloaded(app.page)).toBe(true)
  // THE SECOND STEP: ending an ask writes no agent row, so only the pairing notice tells the page.
  await listening(heard(), 1)
  made.secondVisitor = await aVisitorAsks('made-up-plover-visitor', 'Made-up plover from the yard')
  const ask = anAsk(app.page, made.secondVisitor)
  await expect.poll(() => drawnWith(ask), { timeout: DRAWN_WITHIN_MS }).toEqual(WAITING)
  expect(await notReloaded(app.page)).toBe(true)
  await listening(heard(), 1)
  await end(made.secondVisitor)
  await ask.waitFor({ state: 'detached', timeout: DRAWN_WITHIN_MS })
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('7. both pages, at 1440 dark and at 390 light and dark: a new ask is drawn with no reload, and at 390 it lies inside the window', async () => {
  // EACH VIEW IS A NEW WINDOW, and a page opens only while no other page listens, so this file's own page leaves first.
  await app.page.goto('about:blank')
  const views = [
    { width: 1440, theme: 'dark', device: 'Made-up attic laptop', handle: 'made-up-wren-visitor', name: 'Made-up wren from the shed' },
    { width: 390, theme: 'light', device: 'Made-up hall phone', handle: 'made-up-finch-visitor', name: 'Made-up finch from the barn' },
    { width: 390, theme: 'dark', device: 'Made-up porch tablet', handle: 'made-up-robin-visitor', name: 'Made-up robin from the mill' },
  ] as const
  for (const view of views) {
    for (const where of ['his card', 'the embassy page'] as const) {
      const context: BrowserContext = await app.browser.newContext({ viewport: { width: view.width, height: 900 }, reducedMotion: 'reduce' })
      await context.addInitScript((look) => {
        localStorage.setItem('mole-office.preset.theme', look)
        localStorage.setItem('mole-office.workspace', 'default')
        localStorage.setItem('mole-office.chat.open', 'no')
      }, view.theme)
      const said = `${where} at ${String(view.width)} in ${view.theme}`
      try {
        const page = await context.newPage()
        let row: Locator
        if (where === 'his card') {
          await openHisCard(page)
          expect(await page.locator('html').getAttribute('data-theme'), said).toBe(view.theme)
          row = hisRow(page, await aDeviceAsks(view.device))
        } else {
          await openTheEmbassy(page)
          expect(await page.locator('html').getAttribute('data-theme'), said).toBe(view.theme)
          row = anAsk(page, await aVisitorAsks(view.handle, view.name))
        }
        await expect.poll(() => drawnWith(row), { timeout: DRAWN_WITHIN_MS, message: said }).toEqual(WAITING)
        expect(await notReloaded(page), said).toBe(true)
        if (view.width === 390) expect(await insideTheWindow(row), `the row inside the window, ${said}`).toBe(true)
      } finally {
        await context.close()
      }
    }
  }
}, 300_000)
