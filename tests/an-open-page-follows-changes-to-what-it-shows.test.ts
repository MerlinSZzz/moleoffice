// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPEN PAGE FOLLOWS CHANGES TO WHAT IT SHOWS, WITHOUT A RELOAD. Item 87 of wave 13y, round 145, on plan
 * ZBKFq0BuMsAc: "a test per page kind; then the film".
 *
 * The server says `record.changed` when a record is stored again or a link to or from it changes, and a page that
 * shows the record reads it again half a second later (src/web/lib/record-changes.ts). Home and the lists read at
 * most once in 5 seconds. In a test office of its own, this file opens each kind of page, marks the window so a
 * reload would be seen, has another writer change what the page shows through the doors, and waits up to eight
 * seconds for the change to be drawn. Eight seconds is well under Home's minute read, so that read cannot pass a case.
 * The mark must still be there afterwards.
 *
 * 1. A REPORT'S PAGE DRAWS A NEW TITLE.
 * 2. A REPORT'S PAGE DRAWS A NEW LINK, by the linked record's title.
 * 3. A REPORT'S PAGE DOES NOT READ AGAIN FOR A CHANGE TO ANOTHER RECORD, and does for a change to its own.
 * 4. WHILE THE PERSON EDITS, WHAT THEY TYPED STAYS AND THE PAGE READS AGAIN ONLY ONCE, for the change the line above
 *    the form names. Since round 161 the page reads the record once when another writer's change is heard, so the
 *    history line under the form follows (tests/the-question-shows-what-the-person-changed.test.ts); the follow that
 *    reads every change stays off in the form. The line above the form that says who changed the record, and the
 *    question on save, are tests/an-edit-form-says-another-writer-changed-the-record.test.ts.
 * 5. HOME DRAWS AN AGENT'S NEW PROPOSAL IN NEEDS YOU.
 * 6. THE RECORDS LIST DRAWS A NEW REPORT.
 * 7. A CHECKLIST'S PAGE DRAWS AN ITEM ANOTHER WRITER ADDED.
 * 10. A PAGE THAT MAY HAVE MISSED ONLY CHANGES TO RECORDS WHILE IT CONNECTED READS AGAIN ONLY WHAT FOLLOWS THEM (round
 *    146). Before, every list read again for them, and Home swept the machine twice in one load
 *    (tests/the-machine-reading-is-shared.test.ts). A missed change of another kind still reads every list again.
 * 11. A PAGE THAT MAY HAVE MISSED A CHANGE WHILE IT CONNECTED ASKS FOR IT BEFORE IT SAYS IT HAS FINISHED DRAWING
 *    (round 146). It read half a second later, as for a change it heard, and the mark went on first
 *    (tests/the-mark-is-never-early.test.ts).
 *
 * Case names name the source mutation tried against each. The server side, what is announced, is
 * tests/a-stored-change-tells-the-pages-without-its-content.test.ts.
 *
 * Set W13Y_FOLLOW_SHOTS to a folder outside the checkout to photograph the four pages after their changes, at 1440,
 * 990, 660 and 390 in both looks, and W13Y_FOLLOW_FILM to film a report's page and Home following changes, at 1440.
 * The ordinary run takes neither. Every record here is made up, and every picture and the film say so above the page.
 * The film shows no page before its label: each page is drawn unseen until the label above it is in, so no frame
 * shows made-up records without the label.
 *
 * Test change (wave 13y round 175): the checklists page draws design E, as decided, so each checklist is a card, and
 * case 7 and the checklist's picture read the open items of the card the address `#/checklists/<id>` marks. Before,
 * they read the items of the one opened checklist, and this header said the label's helper took that checklist, sticky
 * at 1440, for a bar stuck at the top of the window. The page no longer draws that sticky checklist, so the sentence
 * went.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, READY_ATTRIBUTE, type LiveApp } from './helpers.ts'
import { listening, notReloaded, open as openIn, type HeardOffice } from './a-page-that-hears-changes.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

let app: LiveApp

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AN_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code' }

const shots = process.env['W13Y_FOLLOW_SHOTS']
const film = process.env['W13Y_FOLLOW_FILM']
const LABEL = 'Made-up data — an invented office, not real office data'
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style)'
/** The open items of the checklist card the address `#/checklists/<id>` marks. */
const MARKED_ITEMS = '.cks-card[data-marked="yes"] .cks-items'
/** How long a change may take to be drawn. */
const DRAWN_WITHIN_MS = 8_000
/** How long a case waits to see that nothing was read. Over four times the half second a page waits. */
const NOTHING_READ_IN_MS = 2_500

async function send(method: string, url: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

async function aReport(title: string): Promise<string> {
  const made = await send('POST', '/api/records', { kind: 'report', title, data: { for: 'A made-up reader', date: '2026-11-07', blocks: [{ id: 'b-1', type: 'text', text: 'A made-up report.' }] } }, AN_AGENT)
  return made['record'].id as string
}

/** This file's test office, as the pages are opened in it. */
function heard(): HeardOffice {
  return { api: app.api, site: app.site, headers: PERSON }
}

async function open(page: Page, hash: string, waitFor: string): Promise<void> {
  await openIn(heard(), page, hash, waitFor)
}

/** Wait until the element `within` names holds these words. */
async function drawn(page: Page, within: string, words: string): Promise<void> {
  await page.waitForFunction(
    ([where, what]) => (document.querySelector(where ?? '')?.textContent ?? '').includes(what ?? ''),
    [within, words],
    { timeout: DRAWN_WITHIN_MS },
  )
}

/** Count from now the reads of this record's page: `GET /api/records/<id>/around` is asked only by it. */
function countReadsOf(page: Page, id: string): { count: () => number; stop: () => void } {
  let reads = 0
  const heard = (request: { url: () => string }): void => {
    if (request.url().includes(`/api/records/${id}/around`)) reads += 1
  }
  page.on('request', heard)
  return { count: () => reads, stop: () => page.off('request', heard) }
}

let report = ''
let other = ''
let linked = ''
let checklist = ''
const TITLE_CHANGED = 'The kiln report, with the second firing'
const LINKED_TITLE = 'The glaze list for the second firing'
const PROPOSAL = 'A made-up question: which kiln shelf takes the tiles?'
const LISTED = 'A made-up report filed while the list was open'
const ITEM_ADDED = 'Sweep the kiln room after the firing'

beforeAll(async () => {
  app = await liveApp({ name: 'an-open-page-follows', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  report = await aReport('The kiln report')
  other = await aReport('The shelf report')
  linked = await aReport(LINKED_TITLE)
  checklist = (await send('POST', '/api/checklists', { title: 'The kiln checklist', items: [{ words: 'Load the kiln' }] }, PERSON))['checklist'].id as string
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it("1. a report's page draws a new title another writer stored: without the follow in useAsync, or without the call in saveRevision, the old title stays until a reload", async () => {
  await open(app.page, `/r/${report}`, 'h1.rp-title')
  await send('PATCH', `/api/records/${report}`, { title: TITLE_CHANGED }, AN_AGENT)
  await drawn(app.page, 'h1.rp-title', TITLE_CHANGED)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it("2. a report's page draws a new link by the linked record's title: without the calls in createLink the link is drawn only after a reload", async () => {
  await open(app.page, `/r/${report}`, '.rd-rail')
  await send('POST', '/api/links', { fromId: linked, toId: report }, AN_AGENT)
  await drawn(app.page, '.rd-rail', LINKED_TITLE)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it("3. a report's page reads nothing for a change to another record and reads once for a change to its own: following every record reads it again for each", async () => {
  await open(app.page, `/r/${report}`, 'h1.rp-title')
  const reads = countReadsOf(app.page, report)
  try {
    await send('PATCH', `/api/records/${other}`, { title: 'The shelf report, changed' }, AN_AGENT)
    await app.page.waitForTimeout(NOTHING_READ_IN_MS)
    expect(reads.count(), 'reads of this page after a change to another record').toBe(0)
    await send('PATCH', `/api/records/${report}`, { summary: 'The second firing is written up.' }, AN_AGENT)
    await expect.poll(() => reads.count(), { timeout: DRAWN_WITHIN_MS }).toBe(1)
  } finally {
    reads.stop()
  }
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('4. while the person edits, what they typed stays and the page reads once, for the heard change: following in the edit form as well reads the record again under their typing', async () => {
  await open(app.page, `/r/${report}/edit`, 'form.rp-edit input')
  const typed = 'The kiln report, as the person is retitling it'
  await app.page.locator('form.rp-edit input').first().fill(typed)
  const reads = countReadsOf(app.page, report)
  try {
    await send('PATCH', `/api/records/${report}`, { title: 'The kiln report, retitled by an agent' }, AN_AGENT)
    await app.page.waitForTimeout(NOTHING_READ_IN_MS)
    expect(reads.count(), 'reads of the page while it is edited').toBe(1)
  } finally {
    reads.stop()
  }
  expect(await app.page.locator('form.rp-edit input').first().inputValue()).toBe(typed)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it("5. Home draws an agent's new proposal in Needs you: without the follow on the frame's waiting read it waits for the minute's read", async () => {
  await open(app.page, '/', '[data-home-section="needs"] .hm-needs-count')
  await send('POST', '/api/records', {
    kind: 'proposal',
    title: PROPOSAL,
    data: { question: 'Which shelf?', options: ['a — the top shelf', 'b — the bottom shelf'], recommendation: 'Take (a).', because: 'It is made up.', who_settles_it: 'the owner' },
  }, AN_AGENT)
  await drawn(app.page, '[data-home-section="needs"]', PROPOSAL)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it('6. the records list draws a report filed while it is open: without the follow on its read the list stays as it was opened', async () => {
  await open(app.page, '/records', '#main table tbody tr')
  await aReport(LISTED)
  await drawn(app.page, '#main table', LISTED)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it("7. a checklist's page draws an item another writer added: without the follow on the opened checklist's read the item is drawn only after a reload", async () => {
  await open(app.page, `/checklists/${checklist}`, `${MARKED_ITEMS} .ckp-words`)
  await send('POST', `/api/checklists/${checklist}/items`, { words: ITEM_ADDED }, PERSON)
  await drawn(app.page, MARKED_ITEMS, ITEM_ADDED)
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it("10. a page that may have missed only record changes while it connected reads again only what follows them: handing them to every list reads the words again, and handing them to nothing leaves the record unread", async () => {
  // A STAND-IN ANSWER, written by this test and not the server's. When its stream is listening, a page asks whether
  // it missed an event while it connected, and the answer is replaced by one that names the events it missed. Each
  // page here starts loading moments before it asks, so the real answer would name none.
  let missed: Record<string, number> = {}
  const theQuestion = (url: URL): boolean => url.pathname === '/api/events/state' && url.searchParams.has('connectingFor')
  await app.page.route(theQuestion, async (route) => {
    const response = await route.fetch()
    const state = (await response.json()) as { whileConnecting: Record<string, unknown> }
    const reached = Object.values(missed).reduce((sum, one) => sum + one, 0)
    await route.fulfill({ response, json: { ...state, whileConnecting: { ...state.whileConnecting, reached, byName: missed } } })
  })
  /** Open the report's page with this answer, and count its reads of the record and of the page's words. */
  const loaded = async (answer: Record<string, number>, expected?: { theRecord: number; theWords: number }): Promise<{ theRecord: number; theWords: number }> => {
    missed = answer
    let theRecord = 0
    let theWords = 0
    const heard = (request: { url: () => string }): void => {
      if (request.url().includes(`/api/records/${report}/around`)) theRecord += 1
      // THE WORDS FOLLOW NO RECORD. They are read once at load and again whenever every list is.
      if (request.url().includes('/api/words/effective')) theWords += 1
    }
    app.page.on('request', heard)
    try {
      await open(app.page, `/r/${report}`, 'h1.rp-title')
      if (expected !== undefined) {
        await expect.poll(() => ({ theRecord, theWords }), { timeout: DRAWN_WITHIN_MS }).toEqual(expected)
      }
      await app.page.waitForTimeout(NOTHING_READ_IN_MS)
    } finally {
      app.page.off('request', heard)
    }
    return { theRecord, theWords }
  }
  try {
    const none = await loaded({})
    expect(none.theWords, 'the page read its words at load').toBeGreaterThan(0)
    const records = await loaded({ 'record.changed': 2 }, { theRecord: none.theRecord + 1, theWords: none.theWords })
    expect(records.theRecord, 'a record change missed while connecting: reads of the record').toBe(none.theRecord + 1)
    expect(records.theWords, 'a record change missed while connecting: reads of the words').toBe(none.theWords)
    // NOT VACUOUS: a missed change of another kind reads every list again, the words among them, and the count sees it.
    const aList = await loaded({ 'list.changed': 1 }, { theRecord: none.theRecord + 1, theWords: none.theWords + 1 })
    expect(aList.theWords, 'a list change missed while connecting: reads of the words').toBe(none.theWords + 1)
    expect(aList.theRecord, 'a list change missed while connecting: reads of the record').toBe(none.theRecord + 1)
  } finally {
    await app.page.unroute(theQuestion)
  }
  expect(await notReloaded(app.page)).toBe(true)
}, 120_000)

it("11. a page that may have missed a change while it connected asks for it before it says it has finished drawing: reading half a second later, as for a change it heard, puts the mark on first", async () => {
  // A STAND-IN ANSWER, LATE, AND SAYING THAT ONE CHANGE TO A RECORD REACHED THE PAGE. It is written by this test and
  // not the server's. The page has drawn everything else by the time it comes, so the read it causes is the only one
  // in flight. The mark (src/web/lib/ready.ts) waits for a read that has started, but not for a timer.
  const THE_ANSWER_COMES_AFTER_MS = 1_500
  const context = await app.browser.newContext({
    viewport: { width: 1440, height: 1000 },
    storageState: await app.page.context().storageState(),
  })
  await context.addInitScript((attribute) => {
    const w = window as unknown as { READ: [number, string][]; ANSWERED: number[]; MARKED: [number, string | null][] }
    w.READ = []
    w.ANSWERED = []
    w.MARKED = []
    const was = window.fetch.bind(window)
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0])
      w.READ.push([performance.now(), url])
      const reply = await was(...args)
      if (url.includes('/api/events/state')) w.ANSWERED.push(performance.now())
      return reply
    }
    let last: string | null = null
    setInterval(() => {
      const now = document.documentElement.getAttribute(attribute)
      if (now === last) return
      last = now
      w.MARKED.push([performance.now(), now])
    }, 5)
  }, READY_ATTRIBUTE)
  const page = await context.newPage()
  await page.route(
    (url) => url.pathname === '/api/events/state' && url.searchParams.has('connectingFor'),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, THE_ANSWER_COMES_AFTER_MS))
      const response = await route.fetch()
      const state = (await response.json()) as { whileConnecting: Record<string, unknown> }
      await route.fulfill({ response, json: { ...state, whileConnecting: { ...state.whileConnecting, reached: 1, byName: { 'record.changed': 1 } } } })
    },
  )
  try {
    await page.goto(`${app.site}/?lang=en&mode=normal#/r/${report}`, { timeout: 60_000 })
    await page.waitForFunction(() => (window as unknown as { ANSWERED: number[] }).ANSWERED.length > 0, undefined, { timeout: 30_000 })
    await page.waitForTimeout(NOTHING_READ_IN_MS)
    const seen = await page.evaluate(() => {
      const w = window as unknown as { READ: [number, string][]; ANSWERED: number[]; MARKED: [number, string | null][] }
      return { read: w.READ, answered: w.ANSWERED, marked: w.MARKED }
    })
    const answeredAt = seen.answered[0] ?? 0
    const readAt = seen.read.find(([at, url]) => at >= answeredAt && url.includes(`/api/records/${report}/around`))?.[0]
    const markedAt = seen.marked.find(([at, mark]) => at >= answeredAt && mark !== null)?.[0]
    expect(readAt, 'the page read the record again for the change it may have missed').toBeDefined()
    expect(markedAt, 'the page said it had finished drawing after the answer').toBeDefined()
    expect(
      readAt ?? 0,
      `the page said it had finished drawing ${String(Math.round((markedAt ?? 0) - answeredAt))} ms after the answer, ` +
        `and read the record again ${String(Math.round((readAt ?? 0) - answeredAt))} ms after it`,
    ).toBeLessThan(markedAt ?? 0)
  } finally {
    await context.close()
  }
}, 120_000)

it.runIf(shots)('8. photographs the four pages after their changes, at four widths in both looks', async () => {
  if (shots === undefined) throw new Error('the pictures need W13Y_FOLLOW_SHOTS')
  mkdirSync(shots, { recursive: true })
  const pages = [
    { name: 'report', hash: `/r/${report}`, waitFor: '.rd-rail' },
    { name: 'home', hash: '/', waitFor: '[data-home-section="needs"] .hm-needs-item' },
    { name: 'records', hash: '/records', waitFor: '#main table tbody tr' },
    { name: 'checklist', hash: `/checklists/${checklist}`, waitFor: `${MARKED_ITEMS} .ckp-words` },
  ]
  for (const look of ['light', 'dark'] as const) {
    await app.page.goto(`${app.site}/`)
    await app.page.evaluate((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
    for (const one of pages) {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await open(app.page, one.hash, one.waitFor)
      for (const width of [1440, 990, 660, 390]) {
        await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
        await app.page.waitForTimeout(300)
        // THE LABEL IS PUT IN AGAIN AT EACH WIDTH. The room it leaves for a bar at the top is worked out for
        // one width; carried to a narrower one, the room left at 1440 was an empty band above the checklist.
        await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator(THE_PAGE_TOP).first(), `follows-${one.name}-${look}-${String(width)}`)
        await app.page.screenshot({ path: join(shots, `follows-${one.name}-${look}-${String(width)}.png`) })
      }
    }
  }
  await app.page.setViewportSize({ width: 1440, height: 1000 })
}, 300_000)

it.runIf(film)("9. films a report's page and Home following changes, at 1440", async () => {
  if (film === undefined) throw new Error('the film needs W13Y_FOLLOW_FILM')
  mkdirSync(join(film, 'films'), { recursive: true })
  await app.page.goto('about:blank')
  await listening(heard(), 0)
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: join(film, 'films'), size: { width: 1440, height: 1000 } } })
  await context.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
  })
  // NO FRAME SHOWS A PAGE BEFORE ITS LABEL. A page is drawn before the label above it is put in, so each page is drawn
  // unseen, and is shown once its label is in (`shownWithItsLabel`). The film is blank for those moments. The hiding
  // sheet is the document's own, because the page has no root element yet when this runs. A filter hides the page and
  // not opacity: the label's helper skips what has opacity 0, and would then check the label against nothing.
  await context.addInitScript(() => {
    const unseen = new CSSStyleSheet()
    unseen.replaceSync('html { filter: opacity(0) !important; }')
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, unseen]
    ;(window as unknown as { filmUnseen: CSSStyleSheet }).filmUnseen = unseen
  })
  const shownWithItsLabel = async (page: Page, name: string): Promise<void> => {
    await putTheMadeUpLabelIn(page, LABEL, page.locator(THE_PAGE_TOP).first(), name)
    const shown = await page.evaluate(() => {
      const unseen = (window as unknown as { filmUnseen?: CSSStyleSheet }).filmUnseen
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((one) => one !== unseen)
      return unseen !== undefined
    })
    expect(shown, `${name}: the page was never hidden, so the film showed it before its label`).toBe(true)
  }
  const page = await context.newPage()
  const filmed = await aReport('The firing schedule')
  const shelf = await aReport('The shelf plan for the firing')
  try {
    await open(page, `/r/${filmed}`, '.rd-rail')
    await shownWithItsLabel(page, 'follows-film-report')
    await page.waitForTimeout(1_500)
    await send('PATCH', `/api/records/${filmed}`, { title: 'The firing schedule, moved to Thursday' }, AN_AGENT)
    await drawn(page, 'h1.rp-title', 'moved to Thursday')
    await page.waitForTimeout(1_500)
    await send('POST', '/api/links', { fromId: shelf, toId: filmed }, AN_AGENT)
    await drawn(page, '.rd-rail', 'The shelf plan for the firing')
    await page.waitForTimeout(1_500)
    await open(page, '/', '[data-home-section="needs"] .hm-needs-count')
    await shownWithItsLabel(page, 'follows-film-home')
    await page.waitForTimeout(1_500)
    await send('POST', '/api/records', {
      kind: 'proposal',
      title: 'A made-up question: fire on Thursday or Friday?',
      data: { question: 'Which day?', options: ['a — Thursday', 'b — Friday'], recommendation: 'Take (a).', because: 'It is made up.', who_settles_it: 'the owner' },
    }, AN_AGENT)
    await drawn(page, '[data-home-section="needs"]', 'fire on Thursday or Friday?')
    await page.waitForTimeout(2_000)
  } finally {
    await context.close()
  }
  const video = page.video()
  if (video === null) throw new Error('the window recorded no film')
  await video.saveAs(join(film, 'films', 'an-open-page-follows.webm'))
  await video.delete()
}, 300_000)
