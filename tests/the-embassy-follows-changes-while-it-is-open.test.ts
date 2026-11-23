// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY FOLLOWS CHANGES WHILE IT IS OPEN, WITHOUT A RELOAD. Item 102 of wave 13y, round 147.
 *
 * In the first beta, new things on the Embassy did not appear by themselves. The page read who the office knows and
 * who is a resident once, and again only after a press on the page. So an agent let in from another page, a resident
 * confirmed from Home, or a visitor whose trip ended stayed as they were until the person left the page and came back.
 * This is the class of fault item 87 fixed for the other pages (tests/an-open-page-follows-changes-to-what-it-shows.test.ts).
 *
 * In a test office of its own, this file opens the Embassy, marks the window so a reload would be seen, makes each
 * change through the doors from outside the page, and waits up to eight seconds for the change to be drawn. Eight
 * seconds is well under any timed read, so no timer can pass a case. The mark must still be there afterwards.
 *
 * 1. AN AGENT THAT ASKS AT THE DOOR IS DRAWN WITH ITS PRESS.
 * 2. AN ASK LET IN ELSEWHERE LEAVES THE ASKS, AND THE AGENT IS DRAWN AMONG THE CITIZENS.
 * 3. A PERMANENT RESIDENT CONFIRMED ELSEWHERE IS DRAWN WITH THE RESIDENT MARK.
 * 4. A VISITOR WHO ARRIVES IS DRAWN, AND A VISITOR WHO LEAVES IS DRAWN WITH THE TIME THE TRIP ENDED.
 * 5. A CHANGE THE EMBASSY DOES NOT SHOW READS NOTHING AGAIN: a report filed elsewhere.
 *
 * Case names name the source mutation tried against each.
 *
 * Set W13Y_EMBASSY_FILM to a folder outside the checkout to film the Embassy following an ask, a resident and a
 * visitor, at 1440. The ordinary run takes no film. Every agent and visit here is made up, and the film says so above
 * the page. No frame shows the page before its label.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'
import { A_SLEEP_TIME, liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { listening, notReloaded, open as openIn, type HeardOffice } from './a-page-that-hears-changes.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp
let person: Record<string, string> = {}

const film = process.env['W13Y_EMBASSY_FILM']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
/** How long a change may take to be drawn. */
const DRAWN_WITHIN_MS = 8_000
/** How long a case waits to see that nothing was read. Over four times the half second a page waits. */
const NOTHING_READ_IN_MS = 2_500
/** A world that is not this one. Sixteen hex characters is what a database identity is. */
const ANOTHER_WORLD = 'aaaabbbbccccdddd'

const asThePerson = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  ...person,
})

const keys = new Map<string, { id: string; key: string }>()
const asAnAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle)!.key,
})

async function send(method: string, url: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, body: JSON.stringify(body) })
  const text = (await reply.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** An agent started by the person, with its key kept for the doors it asks at itself. */
async function started(handle: string, name: string, role: string): Promise<void> {
  const reply = await fetch(`${app.api}/api/agents/started`, { method: 'POST', headers: asThePerson(), body: JSON.stringify({ handle, name, role, runtime: 'claude-code' }) })
  const said = (await reply.json()) as Record<string, any>
  expect(reply.status, JSON.stringify(said).replace(/[0-9a-f]{64}/g, '<a key>').slice(0, 300)).toBeLessThan(300)
  keys.set(handle, { id: String(said['agent'].id), key: String(said['whatToGiveIt']?.key) })
}

/** A keyless ask at the self-registration door. It proves nobody and waits for the person's press. */
async function askToComeIn(handle: string): Promise<string> {
  const said = await send('POST', '/api/agents/register-myself', { handle, name: `The made-up agent ${handle}`, workingDirectory: '/work/made-up', requestedRole: 'worker' }, {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  })
  return String(said['request'])
}

/** The registry id the office gave an agent, or null while it has none. */
async function idOf(handle: string): Promise<string | null> {
  const reply = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: asThePerson() })
  if (reply.status !== 200) return null
  return String(((await reply.json()) as { participant: { id: string } }).participant.id)
}

/** A visit to this office from another world. */
async function aVisit(visitor: string, why: string): Promise<string> {
  const said = await send('POST', '/api/office/visits', { visitor: { kind: 'agent', id: visitor }, fromWorld: ANOTHER_WORLD, why }, asThePerson())
  return String(said['visit'].id)
}

/** This file's test office, as the pages are opened in it. */
function heard(): HeardOffice {
  return { api: app.api, site: app.site, headers: asThePerson() }
}

/** Open the Embassy afresh and listening, with the window marked. */
async function openTheEmbassy(page: Page): Promise<void> {
  await openIn(heard(), page, '/embassy', '[data-target$="embassy.citizens"]')
}

/** One citizen or visitor row, by the participant its name leads to. */
const rowOf = (page: Page, id: string) => page.locator(`.emb-row:has(.emb-name[href="#${whoPath('agent', id)}"])`)
/** One ask at the door, by the handle that asks. */
const askOf = (page: Page, handle: string) => page.locator(`.door-ask[data-door-ask="${handle}"]`)

/** Count from now the reads of who the office knows and of who is a resident. */
function countEmbassyReads(page: Page): { count: () => number; stop: () => void } {
  let reads = 0
  const heardOne = (request: { url: () => string }): void => {
    const url = request.url()
    if (url.includes('/api/office/embassy') || url.endsWith('/api/residents')) reads += 1
  }
  page.on('request', heardOne)
  return { count: () => reads, stop: () => page.off('request', heardOne) }
}

/** Press "Show everyone", so a visitor, who is nobody's contact, is drawn. */
async function showEveryone(page: Page): Promise<void> {
  const press = page.locator('.emb-show', { hasText: EMBASSY_WORDS.showEveryone })
  await press.click()
  await page.locator('.emb-show[aria-pressed="true"]').waitFor({ timeout: 10_000 })
}

let proposed = ''
let proposal = ''

beforeAll(async () => {
  app = await liveApp({ name: 'the-embassy-follows', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  person = thePersonsKeyHeader(join(app.dir, 'keys.json'))
  await started('made-up-secretary', 'A made-up secretary', 'secretary')
  await started('made-up-wren', 'A made-up agent Wren', 'worker')
  // THE ROW IS FOUND BY THE REGISTRY ID ITS NAME LEADS TO, which is not the handle.
  proposed = (await idOf('made-up-wren')) ?? ''
  expect(proposed).not.toBe('')
  proposal = String((await send('POST', '/api/residents/proposals', { agentId: 'made-up-wren', because: 'A made-up reason: Wren keeps the kiln notes.', sleepTime: A_SLEEP_TIME }, asAnAgent('made-up-secretary')))['proposal'].id)
  // A VISIT THAT IS UNDER WAY BEFORE THE PAGE OPENS, for the leaving half of case 4.
  await aVisit('made-up-leaving-visitor', 'reading the made-up kiln plan')
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it('1. an agent that asks at the door while the Embassy is open is drawn with its press: without the waiting reading following the asks, it is drawn only after a reload', async () => {
  await openTheEmbassy(app.page)
  expect(await askOf(app.page, 'made-up-robin').count()).toBe(0)
  await askToComeIn('made-up-robin')
  await askOf(app.page, 'made-up-robin').waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  expect(await askOf(app.page, 'made-up-robin').locator('.tc-ask button', { hasText: 'Admit it' }).count()).toBe(1)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('2. an ask let in elsewhere leaves the asks and its agent is drawn among the citizens: without the Embassy following the participants list, the agent is missing until a reload', async () => {
  const ask = await askToComeIn('made-up-finch')
  await openTheEmbassy(app.page)
  await askOf(app.page, 'made-up-finch').waitFor({ state: 'visible', timeout: 30_000 })
  expect(await idOf('made-up-finch')).toBeNull()
  await send('POST', `/api/roles/requests/${ask}/grant`, {}, asThePerson())
  const finch = await idOf('made-up-finch')
  expect(finch).not.toBeNull()
  await rowOf(app.page, finch!).waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  await askOf(app.page, 'made-up-finch').waitFor({ state: 'detached', timeout: DRAWN_WITHIN_MS })
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('3. a permanent resident confirmed elsewhere is drawn with the resident mark: without the residents reading following proposals, the mark is missing until a reload', async () => {
  await openTheEmbassy(app.page)
  const row = rowOf(app.page, proposed)
  await row.waitFor({ state: 'visible', timeout: 30_000 })
  expect(await row.locator('.resident-mark').count()).toBe(0)
  await send('POST', `/api/residents/proposals/${proposal}/confirm`, {}, asThePerson())
  await row.locator('.resident-mark').waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('4. a visitor who arrives is drawn, and one who leaves is drawn with the time the trip ended: without the visits telling the pages, neither is drawn until a reload', async () => {
  await openTheEmbassy(app.page)
  await showEveryone(app.page)
  const leaving = rowOf(app.page, 'made-up-leaving-visitor')
  await leaving.waitFor({ state: 'visible', timeout: 30_000 })
  expect(await leaving.locator('.emb-key', { hasText: EMBASSY_WORDS.until }).count()).toBe(0)
  const visits = (await (await fetch(`${app.api}/api/office/visits`, { headers: asThePerson() })).json()) as { all: { id: string; visitor: { id: string } }[] }
  const trip = visits.all.find((one) => one.visitor.id === 'made-up-leaving-visitor')
  expect(trip).toBeDefined()
  await send('POST', `/api/office/visits/${trip!.id}/end`, {}, asThePerson())
  await leaving.locator('.emb-key', { hasText: EMBASSY_WORDS.until }).waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  expect(await notReloaded(app.page)).toBe(true)

  await aVisit('made-up-arriving-visitor', 'checking the made-up glaze list')
  await rowOf(app.page, 'made-up-arriving-visitor').waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('5. a report filed elsewhere reads nothing on the Embassy again: with the Embassy following every kind, it reads again for each record stored', async () => {
  await openTheEmbassy(app.page)
  // THE PAGE HAS SETTLED: what it read to draw itself is done before the count starts.
  await app.page.waitForTimeout(NOTHING_READ_IN_MS)
  const reads = countEmbassyReads(app.page)
  await send('POST', '/api/records', { kind: 'report', title: 'A made-up report about the kiln', data: { for: 'A made-up reader', date: '2026-11-08', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report.' }] } }, asAnAgent('made-up-secretary'))
  await app.page.waitForTimeout(NOTHING_READ_IN_MS)
  expect(reads.count()).toBe(0)
  reads.stop()
}, 120_000)

it.runIf(film)('6. films the Embassy following an ask, a resident and a visitor, at 1440', async () => {
  if (film === undefined) throw new Error('the film needs W13Y_EMBASSY_FILM')
  mkdirSync(join(film, 'films'), { recursive: true })
  await app.page.goto('about:blank')
  await listening(heard(), 0)
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: join(film, 'films'), size: { width: 1440, height: 1000 } } })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
  })
  // NO FRAME SHOWS THE PAGE BEFORE ITS LABEL: it is drawn unseen until the label above it is in.
  await context.addInitScript(() => {
    const unseen = new CSSStyleSheet()
    unseen.replaceSync('html { filter: opacity(0) !important; }')
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, unseen]
    ;(window as unknown as { filmUnseen: CSSStyleSheet }).filmUnseen = unseen
  })
  const page = await context.newPage()
  await started('made-up-heron', 'A made-up agent Heron', 'worker')
  const second = (await idOf('made-up-heron')) ?? ''
  const secondProposal = String((await send('POST', '/api/residents/proposals', { agentId: 'made-up-heron', because: 'A made-up reason: Heron keeps the shelf plan.', sleepTime: A_SLEEP_TIME }, asAnAgent('made-up-secretary')))['proposal'].id)
  const trip = await aVisit('made-up-filmed-visitor', 'reading the made-up firing schedule')
  try {
    await openIn(heard(), page, '/embassy', '[data-target$="embassy.citizens"]')
    await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), 'embassy-follows-film')
    const shown = await page.evaluate(() => {
      const unseen = (window as unknown as { filmUnseen?: CSSStyleSheet }).filmUnseen
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== unseen)
      return unseen !== undefined
    })
    expect(shown, 'the page was never hidden, so the film showed it before its label').toBe(true)
    await page.waitForTimeout(1_500)
    await askToComeIn('made-up-plover')
    await askOf(page, 'made-up-plover').waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
    await page.waitForTimeout(1_500)
    await send('POST', `/api/residents/proposals/${secondProposal}/confirm`, {}, asThePerson())
    await rowOf(page, second).locator('.resident-mark').waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
    await page.waitForTimeout(1_500)
    await showEveryone(page)
    // THE LABEL MOVES ABOVE THE CITIZENS AND THE PAGE SCROLLS TO IT, in one step, so no frame shows the visitors'
    // rows with the label scrolled away above them.
    await putTheMadeUpLabelIn(page, LABEL, page.locator('[data-target$="embassy.citizens"]').first(), 'embassy-follows-film visitors')
    const visitor = await rowOf(page, 'made-up-filmed-visitor').boundingBox()
    expect(visitor !== null && visitor.y >= 0 && visitor.y + visitor.height <= 1_000, 'the filmed visitor is outside the window, so the film would not show its trip end').toBe(true)
    await page.waitForTimeout(1_000)
    await send('POST', `/api/office/visits/${trip}/end`, {}, asThePerson())
    await rowOf(page, 'made-up-filmed-visitor').locator('.emb-key', { hasText: EMBASSY_WORDS.until }).waitFor({ state: 'visible', timeout: DRAWN_WITHIN_MS })
    await page.waitForTimeout(2_000)
    expect(await notReloaded(page)).toBe(true)
  } finally {
    await context.close()
  }
  const video = page.video()
  if (video === null) throw new Error('the window recorded no film')
  await video.saveAs(join(film, 'films', 'the-embassy-follows.webm'))
  await video.delete()
}, 300_000)
